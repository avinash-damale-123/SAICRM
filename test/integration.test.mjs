import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createHandler,configuration } from '../server/api.mjs';
const enabled=!!process.env.TEST_DATABASE_URL;
let pool,handler;
const sent=[];
const origin='https://crm.example.org';
let address=1;
const ip=()=> 'test-'+address++;
before(async()=>{
 if(!enabled)return;
 pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:8});
 await pool.query(await readFile(new URL('../db/001_initial.sql',import.meta.url),'utf8'));
 const config=configuration({DATABASE_URL:process.env.TEST_DATABASE_URL,APP_ORIGIN:origin,RESEND_API_KEY:'test-key',EMAIL_FROM:'SCRM <test@example.org>',TOKEN_SECRET:'a'.repeat(64)});
 // Capture only the provider boundary in tests. Production has no mock email/OTP path.
 handler=createHandler({pool,config,deliver:async message=>sent.push(message)});
});
after(async()=>{if(pool)await pool.end()});
async function call(route,method='GET',body,session={},extra={}){
 let payload,headers={};
 const req={url:'/api/'+route,query:{route:route.split('?')[0]},method,headers:{origin,'content-type':'application/json','x-real-ip':ip(),cookie:session.cookie||'','x-csrf-token':session.csrf||'',...extra},body};
 const res={statusCode:200,setHeader:(key,value)=>headers[key]=value,end:value=>payload=JSON.parse(value)};
 await handler(req,res);return {status:res.statusCode,body:payload,headers};
}
const password='test passphrase 123456789';
async function account(email,role='member',approved=true){
 await call('auth/register','POST',{email,password,name:'Integration Test'});
 const message=sent.findLast(m=>m.to===email);
 const code=message.text.match(/\b\d{6}\b/)[0];
 assert.equal((await call('auth/verify','POST',{email,code})).status,200);
 if(approved)await pool.query("UPDATE users SET status='approved',role=$2 WHERE email=$1",[email,role]);
 const response=await call('auth/login','POST',{email,password});
 return {cookie:response.headers['Set-Cookie']?.split(';')[0],csrf:response.body.csrf,email,response};
}
test('configuration fails closed without email/backend and rejects non-HTTPS origins',()=>{
 assert.throws(()=>configuration({}));
 assert.throws(()=>configuration({APP_ORIGIN:'http://example.org',DATABASE_URL:'db',RESEND_API_KEY:'key',EMAIL_FROM:'a',TOKEN_SECRET:'x'.repeat(64)}));
});
test('email verification and approval independently block sessions; codes are single use', {skip:!enabled},async()=>{
 const email='pending@example.org';
 assert.equal((await call('auth/register','POST',{email,password,name:'Pending'})).status,200);
 const code=sent.findLast(m=>m.to===email).text.match(/\b\d{6}\b/)[0];
 assert.equal((await call('auth/login','POST',{email,password})).status,403);
 assert.equal((await call('auth/verify','POST',{email,code})).status,200);
 assert.equal((await call('auth/verify','POST',{email,code})).status,400);
 assert.equal((await call('auth/login','POST',{email,password})).status,403);
 assert.equal((await call('records/leads')).status,401);
 const duplicate=await call('auth/register','POST',{email,password,name:'Duplicate'});
 assert.equal(duplicate.status,200);assert.equal(duplicate.body.message.includes('eligible'),true);
});
test('resend replaces prior code; five incorrect OTP attempts invalidate challenge', {skip:!enabled},async()=>{
 const email='attempts@example.org';
 await call('auth/register','POST',{email,password,name:'Attempts'});
 await call('auth/resend','POST',{email});
 const rows=await pool.query("SELECT c.* FROM challenges c JOIN users u ON u.id=c.user_id WHERE u.email=$1",[email]);
 assert.equal(rows.rows[0].attempts,0);
 const code=sent.findLast(m=>m.to===email).text.match(/\b\d{6}\b/)[0];
 const wrong=code==='000000'?'111111':'000000';
 for(let n=0;n<5;n++)assert.equal((await call('auth/verify','POST',{email,code:wrong})).status,400);
 assert.equal((await call('auth/verify','POST',{email,code})).status,400);
});
test('protected CRUD validates, checks roles, prevents stale writes, audits, and enforces CSRF/origin', {skip:!enabled},async()=>{
 const member=await account('member@example.org'),viewer=await account('viewer@example.org','viewer'),admin=await account('admin@example.org','admin');
 assert.match(member.response.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Lax/);
 assert.equal((await call('records/employees','GET',undefined,member)).status,403);
 assert.equal((await call('audit','GET',undefined,member)).status,403);
 const data={name:'Example customer',identity:'Organisation',category:'Corporate',line:'STTS',status:'Active'};
 assert.equal((await call('records/customers','POST',data,viewer)).status,403);
 assert.equal((await call('records/customers','POST',data,{...member,csrf:''})).status,403);
 assert.equal((await call('records/customers','POST',data,member,{origin:'https://evil.example'})).status,403);
 assert.equal((await call('records/customers','POST',{...data,id:'injected'},member)).status,400);
 const created=await call('records/customers','POST',data,member);assert.equal(created.status,200);
 const record=created.body.record;
 assert.equal((await call('records/customers/'+record.id,'PUT',{version:1,data:{...data,name:'Updated'}},member)).status,200);
 assert.equal((await call('records/customers/'+record.id,'PUT',{version:1,data},member)).status,409);
 assert.equal((await call('records/customers/'+record.id,'DELETE',{version:2},member)).status,403);
 const audit=await call('audit','GET',undefined,admin);
 assert.ok(audit.body.audit.some(a=>a.action==='Updated'&&a.record===record.id));
 assert.equal((await call('records/customers/'+record.id,'DELETE',{version:2},admin)).status,200);
 assert.equal((await call('auth/logout','POST',{csrf:member.csrf},member)).status,200);
 assert.equal((await call('records/leads','GET',undefined,member)).status,401);
});
test('reset tokens expire, are single-use under concurrency and revoke sessions', {skip:!enabled},async()=>{
 const user=await account('reset@example.org');
 const forgot=await call('auth/forgot','POST',{email:user.email});
 assert.equal(JSON.stringify(forgot.body).includes('#reset'),false);
 let message=sent.findLast(m=>m.to===user.email);
 let value=message.text.match(/#reset=([a-f0-9]{64})/)[1];
 await pool.query("UPDATE challenges SET expires_at=now()-interval '1 second' WHERE user_id=(SELECT id FROM users WHERE email=$1) AND kind='reset'",[user.email]);
 assert.equal((await call('auth/reset','POST',{email:user.email,token:value,password})).status,400);
 await call('auth/forgot','POST',{email:user.email});
 message=sent.findLast(m=>m.to===user.email);value=message.text.match(/#reset=([a-f0-9]{64})/)[1];
 const results=await Promise.all([1,2].map(()=>call('auth/reset','POST',{email:user.email,token:value,password:'new test passphrase 123456'})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
 assert.equal((await call('records/leads','GET',undefined,user)).status,401);
 assert.equal((await call('auth/login','POST',{email:user.email,password})).status,401);
});
test('admin suspension revokes sessions and unverified accounts cannot be approved', {skip:!enabled},async()=>{
 const admin=await account('admin2@example.org','admin'),user=await account('suspend@example.org');
 const id=(await pool.query('SELECT id FROM users WHERE email=$1',[user.email])).rows[0].id;
 assert.equal((await call('access/'+id,'PUT',{role:'member',status:'suspended'},admin)).status,200);
 assert.equal((await call('records/leads','GET',undefined,user)).status,401);
 await call('auth/register','POST',{email:'unverified@example.org',password,name:'Unverified'});
 const pending=(await pool.query("SELECT id FROM users WHERE email='unverified@example.org'")).rows[0].id;
 assert.equal((await call('access/'+pending,'PUT',{role:'member',status:'approved'},admin)).status,400);
 const self=(await pool.query('SELECT id FROM users WHERE email=$1',[admin.email])).rows[0].id;
 assert.equal((await call('access/'+self,'PUT',{role:'member',status:'suspended'},admin)).status,400);
});
test('rate limit counters survive separate handler invocations and expired sessions fail', {skip:!enabled},async()=>{
 const user=await account('expiry@example.org');
 await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=(SELECT id FROM users WHERE email=$1)",[user.email]);
 assert.equal((await call('records/leads','GET',undefined,user)).status,401);
 for(let n=0;n<5;n++)assert.equal((await call('auth/forgot','POST',{email:'absent@example.org'})).status,200);
 assert.equal((await call('auth/forgot','POST',{email:'absent@example.org'})).status,429);
});
