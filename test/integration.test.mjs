import test,{after,before} from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { fields } from '../server/contracts.mjs';
import { createHandler,configuration } from '../server/api.mjs';
const enabled=!!process.env.TEST_DATABASE_URL;
let pool,handler,config;
const sent=[];
const origin='https://crm.example.org';
let address=1;
const ip=()=> 'test-'+address++;
before(async()=>{
 if(!enabled)return;
 pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:8});
 await pool.query(await readFile(new URL('../db/001_initial.sql',import.meta.url),'utf8'));
 await pool.query(await readFile(new URL('../db/002_google.sql',import.meta.url),'utf8'));
 config=configuration({DATABASE_URL:process.env.TEST_DATABASE_URL,APP_ORIGIN:origin,SMTP_HOST:'smtp.gmail.com',SMTP_PORT:'587',SMTP_USER:'noreply@example.org',SMTP_PASSWORD:'test-only-app-password',EMAIL_FROM:'SCRM <test@example.org>',TOKEN_SECRET:'a'.repeat(64)});
 // Capture only the provider boundary in tests. Production uses authenticated SMTP and has no mock email/OTP path.
 handler=createHandler({pool,config,deliver:async message=>sent.push(message)});
});
after(async()=>{if(pool)await pool.end()});
async function call(route,method='GET',body,session={},extra={}){
 let payload,headers={};
 const req={url:'/api/'+route,query:{route:route.split('?')[0]},method,headers:{origin,'content-type':'application/json','x-real-ip':ip(),cookie:session.cookie||'','x-csrf-token':session.csrf||'',...extra},body};
 const res={statusCode:200,setHeader:(key,value)=>headers[key]=value,end:value=>payload=value?JSON.parse(value):null};
 await handler(req,res);return {status:res.statusCode,body:payload,headers};
}
const password='test passphrase 123456789';
async function account(email,role='member',approved=true){
 await call('auth/register','POST',{email,password,name:'Integration Test'});
 const message=sent.findLast(m=>m.to===email);
 const code=message.text.match(/\b\d{6}\b/)[0];
 assert.equal((await call('auth/verify','POST',{email,code})).status,200);
 if(approved){await pool.query("UPDATE users SET status='approved',role=$2 WHERE email=$1",[email,role]);await pool.query("INSERT INTO user_scopes(user_id,branch,line) SELECT id,'PUNE','STTS' FROM users WHERE email=$1",[email]);}
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
 const data={name:'Example customer',identity:'Organisation',category:'Corporate',line:'STTS',status:'Active',scopeBranch:'PUNE',scopeLine:'STTS'};
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

test('email transport failure fails visibly without returning secrets; resend can recover',{skip:!enabled},async()=>{
 const normal=handler;
 handler=createHandler({pool,config,deliver:async()=>{throw Error('Provider refused')}});
 try{
  const response=await call('auth/register','POST',{email:'delivery@example.org',password,name:'Delivery'});
  assert.equal(response.status,503);
  assert.equal(JSON.stringify(response.body).includes('verification code'),false);
 }finally{handler=normal}
 assert.equal((await call('auth/resend','POST',{email:'delivery@example.org'})).status,200);
 const code=sent.findLast(m=>m.to==='delivery@example.org').text.match(/\b\d{6}\b/)[0];
 await pool.query("UPDATE challenges SET expires_at=now()-interval '1 second' WHERE user_id=(SELECT id FROM users WHERE email='delivery@example.org')");
 assert.equal((await call('auth/verify','POST',{email:'delivery@example.org',code})).status,400);
});

test('all nine record modules persist and are readable through a fresh handler; audit is append-only',{skip:!enabled},async()=>{
 const admin=await account('allmodules@example.org','admin');
 for(const [module,schema] of Object.entries(fields)){
  const data=Object.fromEntries(schema.map(([key,,type,,choices])=>[key,type==='select'?choices[0]:type==='number'?10:type==='email'?'person@example.org':type==='date'?'2026-10-15':key==='scopeBranch'?'PUNE':'Persistence Test']));
  const response=await call('records/'+module,'POST',data,admin);assert.equal(response.status,200,module);
  const normal=handler;
  handler=createHandler({pool,config,deliver:async message=>sent.push(message)});
  try{const read=await call('records/'+module,'GET',undefined,admin);assert.ok(read.body.records.some(r=>r.id===response.body.record.id),module)}finally{handler=normal}
 }
 await assert.rejects(pool.query("UPDATE audit SET action='tampered' WHERE id=(SELECT min(id) FROM audit)"),/append-only/);
});

test('branch and business-line pairs constrain reads, writes and transfers; scope changes revoke sessions',{skip:!enabled},async()=>{
 const admin=await account('scopeadmin@example.org','admin'),member=await account('scopemember@example.org'),other=await account('scopeother@example.org','manager');
 const otherId=(await pool.query('SELECT id FROM users WHERE email=$1',[other.email])).rows[0].id;
 assert.equal((await call('access/'+otherId,'PUT',{role:'manager',status:'approved',scopes:[{branch:'DUBAI',line:'CAR'}]},admin)).status,200);
 assert.equal((await call('records/customers','GET',undefined,other)).status,401);
 const login=await call('auth/login','POST',{email:other.email,password});
 const otherSession={cookie:login.headers['Set-Cookie'].split(';')[0],csrf:login.body.csrf};
 const data={name:'Scoped company',identity:'Organisation',category:'Corporate',line:'STTS',status:'Active',scopeBranch:'PUNE',scopeLine:'STTS'};
 const record=(await call('records/customers','POST',data,member)).body.record;
 const read=await call('records/customers','GET',undefined,otherSession);assert.equal(read.status,200);
 assert.equal(read.body.records.some(r=>r.id===record.id),false);
 assert.equal((await call('records/customers','POST',data,otherSession)).status,403);
 assert.equal((await call('records/customers/'+record.id,'PUT',{data,version:1},otherSession)).status,404);
 assert.equal((await call('records/customers/'+record.id,'DELETE',{version:1},otherSession)).status,404);
 const memberId=(await pool.query('SELECT id FROM users WHERE email=$1',[member.email])).rows[0].id;
 await call('access/'+memberId,'PUT',{role:'member',status:'approved',scopes:[{branch:'PUNE',line:'STTS'},{branch:'DUBAI',line:'CAR'}]},admin);
 const fresh=await call('auth/login','POST',{email:member.email,password});
 const memberSession={cookie:fresh.headers['Set-Cookie'].split(';')[0],csrf:fresh.body.csrf};
 assert.equal((await call('records/customers','POST',{...data,scopeLine:'CAR'},memberSession)).status,403);
 assert.equal((await call('records/customers/'+record.id,'PUT',{version:1,data:{...data,scopeBranch:'DUBAI',scopeLine:'CAR'}},memberSession)).status,403);
 const access=await call('access','GET',undefined,admin);
 assert.deepEqual(access.body.users.find(u=>u.id===memberId).scopes.sort((a,b)=>a.branch.localeCompare(b.branch)),[{branch:'DUBAI',line:'CAR'},{branch:'PUNE',line:'STTS'}]);
});

test('registration rejects SMTP recipient and header injection', {skip:!enabled},async()=>{
 for(const email of ['first,second@example.org','Name <person@example.org>','person@example.org\r\nBcc:other@example.org']){
  assert.equal((await call('auth/register','POST',{email,password,name:'Invalid recipient'})).status,400);
 }
});

test('remember me uses bounded persistent sessions; standard sessions omit Max-Age',{skip:!enabled},async()=>{
 const member=await account('remember@example.org');
 assert.equal(member.response.headers['Set-Cookie'].includes('Max-Age'),false);
 const remembered=await call('auth/login','POST',{email:member.email,password,remember:true});
 assert.match(remembered.headers['Set-Cookie'],/Max-Age=2592000/);
 const row=(await pool.query("SELECT extract(epoch from (s.expires_at-now())) AS remaining FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.email=$1 ORDER BY s.expires_at DESC",[member.email])).rows[0];
 assert.ok(Number(row.remaining)>2591900 && Number(row.remaining)<=2592000);
 assert.equal((await call('auth/login','POST',{email:member.email,password,remember:'true'})).status,400);
 const logged={cookie:remembered.headers['Set-Cookie'].split(';')[0],csrf:remembered.body.csrf};
 assert.equal((await call('auth/logout','POST',{csrf:logged.csrf},logged)).status,200);
 assert.equal((await call('auth/me','GET',undefined,logged)).body.user,null);
});
test('Google OAuth state is browser-bound, single-use and approval-gated',{skip:!enabled},async()=>{
 const normal=handler;let exchanges=0;
 handler=createHandler({pool,config:{...config,googleId:'client',googleSecret:'test'},googleExchange:async()=>{exchanges++;return {sub:'test-google-sub',email:'google-new@example.org',name:'Google User'}}});
 try{
 const start=await call('auth/google/start','POST',{remember:true});
 assert.equal(start.status,200);const url=new URL(start.body.url);
 assert.equal(url.searchParams.get('code_challenge_method'),'S256');
 assert.equal(url.searchParams.get('redirect_uri'),origin+'/api/auth/google/callback');
 const state=url.searchParams.get('state'),cookie=start.headers['Set-Cookie'].split(';')[0];
 const route='auth/google/callback?state='+state+'&code=test';
 assert.match((await call(route)).headers.Location,/google_error/);assert.equal(exchanges,0);
 const pending=await call(route,'GET',undefined,{cookie});
 assert.match(pending.headers.Location,/google_pending/);assert.equal(exchanges,1);
 assert.match((await call(route,'GET',undefined,{cookie})).headers.Location,/google_error/);assert.equal(exchanges,1);
 const user=(await pool.query('SELECT * FROM users WHERE email=$1',['google-new@example.org'])).rows[0];
 assert.equal(user.status,'pending');assert.equal(user.email_verified,true);
 assert.equal((await pool.query('SELECT 1 FROM sessions WHERE user_id=$1',[user.id])).rowCount,0);
 const begin=()=>call('auth/google/start','POST',{remember:true});
 const complete=start=>call('auth/google/callback?state='+new URL(start.body.url).searchParams.get('state')+'&code=test','GET',undefined,{cookie:start.headers['Set-Cookie'].split(';')[0]});
 const expired=await begin();await pool.query("UPDATE oauth_states SET expires_at=now()-interval '1 second' WHERE state_hash=$1",[ (await import('../server/crypto.mjs')).hash(new URL(expired.body.url).searchParams.get('state')) ]);
 assert.match((await complete(expired)).headers.Location,/google_error/);assert.equal(exchanges,1);
 await pool.query("UPDATE users SET status='approved' WHERE id=$1",[user.id]);await pool.query("INSERT INTO user_scopes(user_id,branch,line) VALUES($1,'PUNE','STTS')",[user.id]);
 const approved=await complete(await begin());assert.match(approved.headers.Location,/google_success/);
 const sessionCookie=approved.headers['Set-Cookie'].find(value=>value.startsWith('__Host-scrm='));
 assert.match(sessionCookie,/Max-Age=2592000/);
 const signed={cookie:sessionCookie.split(';')[0]};
 const current=await call('auth/me','GET',undefined,signed);assert.equal(current.body.user.email,user.email);assert.equal(current.body.user.scopes[0].branch,'PUNE');
 await pool.query("UPDATE users SET status='suspended' WHERE id=$1",[user.id]);await pool.query('DELETE FROM sessions WHERE user_id=$1',[user.id]);
 assert.equal((await call('records/leads','GET',undefined,signed)).status,401);
 assert.match((await complete(await begin())).headers.Location,/google_pending/);

 }finally{handler=normal}
});

test('OTP password recovery is private, single-use under concurrency, and revokes sessions',{skip:!enabled},async()=>{
 const user=await account('reset-otp@example.org');
 const request=await call('auth/forgot','POST',{email:user.email,method:'otp'});
 assert.equal(request.status,200);assert.equal(request.body.message.includes('eligible'),true);
 const message=sent.findLast(m=>m.to===user.email),code=message.text.match(/code is (\d{6})/)[1];
 assert.equal(message.text.includes('https://'),false);assert.equal(JSON.stringify(request.body).includes(code),false);
 const missing=await call('auth/forgot','POST',{email:'no-otp-account@example.org',method:'otp'});assert.deepEqual(missing.body,request.body);
 const nextPassword='new OTP reset passphrase 123456';
 const results=await Promise.all([1,2].map(()=>call('auth/reset','POST',{email:user.email,code,password:nextPassword})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
 assert.equal((await call('auth/me','GET',undefined,user)).body.user,null);
 assert.equal((await call('auth/login','POST',{email:user.email,password})).status,401);
 assert.equal((await call('auth/login','POST',{email:user.email,password:nextPassword})).status,200);
 assert.equal((await call('auth/reset','POST',{email:user.email,code,password})).status,400);
});
test('OTP resend invalidates the previous code; expired and cross-account codes fail',{skip:!enabled},async()=>{
 const user=await account('reset-resend@example.org');
 await call('auth/forgot','POST',{email:user.email,method:'otp'});
 const first=sent.findLast(m=>m.to===user.email).text.match(/code is (\d{6})/)[1];
 await call('auth/forgot','POST',{email:user.email,method:'otp'});
 const second=sent.findLast(m=>m.to===user.email).text.match(/code is (\d{6})/)[1];
 assert.notEqual(first,second);
 assert.equal((await call('auth/reset','POST',{email:user.email,code:first,password})).status,400);
 assert.equal((await call('auth/reset','POST',{email:'no-otp-account@example.org',code:second,password})).status,400);
 assert.equal((await call('auth/reset','POST',{email:user.email,code:second,token:'a'.repeat(64),password})).status,400);
 await pool.query("UPDATE challenges SET expires_at=now()-interval '1 second' WHERE user_id=(SELECT id FROM users WHERE email=$1) AND kind='reset'",[user.email]);
 assert.equal((await call('auth/reset','POST',{email:user.email,code:second,password})).status,400);
});
test('five wrong password reset OTP guesses exhaust the challenge',{skip:!enabled},async()=>{
 const user=await account('reset-guesses@example.org');
 await call('auth/forgot','POST',{email:user.email,method:'otp'});
 const code=sent.findLast(m=>m.to===user.email).text.match(/code is (\d{6})/)[1],wrong=code==='000000'?'111111':'000000';
 for(let i=0;i<5;i++)assert.equal((await call('auth/reset','POST',{email:user.email,code:wrong,password})).status,400);
 const challenge=(await pool.query("SELECT attempts FROM challenges WHERE user_id=(SELECT id FROM users WHERE email=$1) AND kind='reset'",[user.email])).rows[0];assert.equal(challenge.attempts,5);
 assert.ok([400,429].includes((await call('auth/reset','POST',{email:user.email,code,password})).status));
});
