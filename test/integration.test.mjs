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
 const testDatabase=new URL(process.env.TEST_DATABASE_URL);
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(testDatabase.hostname),'Write-capable integration tests require an isolated loopback database');
 assert.ok(/test/i.test(testDatabase.pathname),'The integration database name must explicitly identify a test database');
 pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:8});
 await pool.query(await readFile(new URL('../db/001_initial.sql',import.meta.url),'utf8'));
 await pool.query(await readFile(new URL('../db/002_google.sql',import.meta.url),'utf8'));
 await pool.query(await readFile(new URL('../db/003_business_lines.sql',import.meta.url),'utf8'));
 await pool.query(await readFile(new URL('../db/004_business_lines_fields.sql',import.meta.url),'utf8'));
 await pool.query(await readFile(new URL('../db/005_user_master_display_id.sql',import.meta.url),'utf8'));
 await pool.query(await readFile(new URL('../db/006_business_lines_lifecycle.sql',import.meta.url),'utf8'));
 await pool.query(await readFile(new URL('../db/007_records_framework.sql',import.meta.url),'utf8'));
 await pool.query(await readFile(new URL('../db/007_records_framework.sql',import.meta.url),'utf8'));
 // Applying migrations twice must preserve an initialized database.
 await pool.query(await readFile(new URL('../db/003_business_lines.sql',import.meta.url),'utf8'));
 await pool.query(await readFile(new URL('../db/004_business_lines_fields.sql',import.meta.url),'utf8'));
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

/* Business Line requests run against TEST_DATABASE_URL only. No application credentials,
   production database or external email provider is used by this suite. */
let businessSuper,businessOrdinary;
async function businessActors(){
 if(!businessSuper){
  businessOrdinary=await account('business-admin@example.org','admin');
  businessSuper=await account('business-super@example.org','admin');
  await pool.query("UPDATE users SET system_role='super_admin' WHERE email=$1",[businessSuper.email]);
 }
 return {superAdmin:businessSuper,admin:businessOrdinary};
}
let businessSequence=0;
async function businessCreate(name,description=''){
 const {superAdmin}=await businessActors();
 const code='TEST-'+String(++businessSequence).padStart(5,'0');
 const result=await call('business-lines','POST',{name,code,description},superAdmin);
 assert.equal(result.status,200,JSON.stringify(result.body));
 assert.ok(result.body.record?.id);
 return result.body.record;
}
const businessURL=(query={})=>'business-lines?'+new URLSearchParams(query);

test('Business Lines require an approved Super Admin and enforce Origin and CSRF',{skip:!enabled},async()=>{
 const {superAdmin,admin}=await businessActors();
 assert.equal((await call('business-lines')).status,401);
 assert.equal((await call('business-lines','GET',undefined,admin)).status,403);
 assert.equal((await call('business-lines','POST',{name:'Forbidden Admin'},admin)).status,403);
 assert.equal((await call('business-lines/export','POST',{mode:'all'},admin)).status,403);
 assert.equal((await call('business-lines','POST',{name:'No CSRF'},{...superAdmin,csrf:''})).status,403);
 assert.equal((await call('business-lines','POST',{name:'Wrong Origin'},superAdmin,{origin:'https://evil.example'})).status,403);
 const me=await call('auth/me','GET',undefined,superAdmin);
 assert.equal(me.body.user.systemRole,'super_admin');
 const list=await call('business-lines','GET',undefined,superAdmin);
 assert.equal(list.status,200);
 assert.equal(typeof list.body.total,'number');
 await pool.query("UPDATE users SET status='suspended' WHERE email=$1",[superAdmin.email]);
 assert.ok([401,403].includes((await call('business-lines','GET',undefined,superAdmin)).status));
 await pool.query("UPDATE users SET status='approved' WHERE email=$1",[superAdmin.email]);
});

test('Business Line validation prevents field injection and duplicates including archived names',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors();
 for(const field of ['remarks','id','displayId','createdAt','createdById','updatedAt','updatedById','archivedAt','ownerId','status','systemRole']){
  const result=await call('business-lines','POST',{name:'Injected Field',code:'FIXTURE',description:'', [field]:'injected'},superAdmin);
  assert.equal(result.status,400,field+' must not be mass assignable on create');
 }
 for(const name of ['', '   ', 'x'.repeat(256)]){
  assert.equal((await call('business-lines','POST',{name,code:'FIXTURE',description:''},superAdmin)).status,400);
 }
 const record=await businessCreate('  Unique Fixture  ','Original remarks');
 assert.equal(record.name,'Unique Fixture');
 assert.equal(record.status,'Active');
 assert.equal(record.version,1);
 assert.ok(record.displayId);
 assert.ok(record.ownerId);
 assert.ok(record.createdById);
 assert.ok(record.createdAt);
 assert.equal((await call('business-lines','POST',{name:'unique fixture',code:'FIXTURE',description:''},superAdmin)).status,409);
 const archived=await call('business-lines/'+record.id+'/archive','POST',{version:record.version,reason:'Archive approved'},superAdmin);
 assert.equal(archived.status,200);
 assert.equal((await call('business-lines','POST',{name:'UNIQUE FIXTURE',code:'FIXTURE',description:''},superAdmin)).status,409);
 assert.equal((await call('business-lines/'+record.id,'DELETE',{version:archived.body.record.version},superAdmin)).status,405);
 assert.equal((await call('business-lines/import','POST',{records:[]},superAdmin)).status,405);
});

test('Business Lines retain audited history and reject stale or immutable updates',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors(),record=await businessCreate('History Fixture','Before');
 for(const field of ['remarks','createdAt','createdById','updatedAt','updatedById','displayId','archivedAt']){
  assert.equal((await call('business-lines/'+record.id,'PUT',{version:record.version,[field]:'injected'},superAdmin)).status,400,field);
 }
 const first=await call('business-lines/'+record.id,'PUT',{version:record.version,name:'History Revised',code:'HISTORY-NEW',description:'After'},superAdmin);
 assert.equal(first.status,200);
 const updated=first.body.record;
 assert.equal(updated.version,record.version+1);
 assert.equal(updated.code,'HISTORY-NEW');
 assert.equal(updated.createdAt,record.createdAt);
 assert.equal(updated.createdById,record.createdById);
 assert.equal(updated.ownerId,record.ownerId);
 assert.equal((await call('business-lines/'+record.id,'PUT',{version:record.version,name:'Stale overwrite'},superAdmin)).status,409);
 const read=await call('business-lines/'+record.id,'GET',undefined,superAdmin);
 assert.equal(read.body.record.name,'History Revised');
 const history=await call('business-lines/'+record.id+'/history','GET',undefined,superAdmin);
 assert.equal(history.status,200);
 assert.ok(history.body.history.length>=2);
 const historyText=JSON.stringify(history.body.history);
 assert.ok(historyText.includes('History Fixture'));
 assert.ok(historyText.includes('History Revised'));
 assert.ok(historyText.includes('Before'));
 assert.ok(historyText.includes('After'));
 assert.ok(history.body.history.every(entry=>entry.actorId&&entry.actor&&entry.createdAt));
 await assert.rejects(()=>pool.query("UPDATE business_line_events SET action='Tampered' WHERE business_line_id=$1",[record.id]),/append-only/i);
 await assert.rejects(()=>pool.query('DELETE FROM business_line_events WHERE business_line_id=$1',[record.id]),/append-only/i);
 assert.equal((await call('business-lines/'+record.id+'/history','POST',{action:'tamper'},superAdmin)).status,405);
});

test('Business Line archive and restore preserve identity and cannot bypass version checks',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors(),record=await businessCreate('Archive Fixture','Keep this history');
 assert.equal((await call('business-lines/'+record.id+'/archive','POST',{version:999,reason:'Archive approved'},superAdmin)).status,409);
 const archive=await call('business-lines/'+record.id+'/archive','POST',{version:record.version,reason:'Archive approved'},superAdmin);
 assert.equal(archive.status,200);
 assert.ok(archive.body.record.archivedAt);
 const hidden=await call(businessURL({q:'Archive Fixture'}),'GET',undefined,superAdmin);
 assert.equal(hidden.body.total,0);
 const listed=await call(businessURL({q:'Archive Fixture',archived:'only'}),'GET',undefined,superAdmin);
 assert.equal(listed.body.total,1);
 assert.equal(listed.body.records[0].id,record.id);
 assert.equal((await call('business-lines/'+record.id,'PUT',{version:archive.body.record.version,description:'Bypass archive'},superAdmin)).status,409);
 const restored=await call('business-lines/'+record.id+'/restore','POST',{version:archive.body.record.version,reason:'Unarchive approved'},superAdmin);
 assert.equal(restored.status,200);
 assert.equal(restored.body.record.id,record.id);
 assert.equal(restored.body.record.displayId,record.displayId);
 assert.equal(restored.body.record.archivedAt,null);
 assert.equal(restored.body.record.createdAt,record.createdAt);
 assert.equal(restored.body.record.description,'Keep this history');
});

test('Business Lines use immutable User Master display IDs and reversible soft delete with mandatory reasons',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors(),record=await businessCreate('Lifecycle Display Fixture','New description');
 assert.match(record.ownerId,/^UID-\d{6,}$/);
 assert.match(record.createdById,/^UID-\d{6,}$/);
 assert.equal(record.code.startsWith('TEST-'),true);
 assert.equal(record.isDeleted,false);
 assert.equal((await call('business-lines/'+record.id+'/soft-delete','POST',{version:record.version},superAdmin)).status,400);
 const deleted=await call('business-lines/'+record.id+'/soft-delete','POST',{version:record.version,reason:'Duplicate business line retired'},superAdmin);
 assert.equal(deleted.status,200,JSON.stringify(deleted.body));
 assert.equal(deleted.body.record.isDeleted,true);
 assert.ok(deleted.body.record.deletedAt);
 assert.match(deleted.body.record.deletedById,/^UID-\d{6,}$/);
 const current=await call(businessURL({q:'Lifecycle Display Fixture'}),'GET',undefined,superAdmin);
 assert.equal(current.body.total,0);
 const deletedList=await call(businessURL({archived:'deleted',q:'Lifecycle Display Fixture'}),'GET',undefined,superAdmin);
 assert.equal(deletedList.body.total,1);
 assert.equal(deletedList.body.records[0].id,record.id);
 const conflict=await call('business-lines','POST',{name:'A Different New Name',code:record.code},superAdmin);
 assert.equal(conflict.status,409);
 assert.equal((await call('business-lines/'+record.id+'/restore-deleted','POST',{version:deleted.body.record.version},superAdmin)).status,400);
 const restored=await call('business-lines/'+record.id+'/restore-deleted','POST',{version:deleted.body.record.version,reason:'Restored after review'},superAdmin);
 assert.equal(restored.status,200,JSON.stringify(restored.body));
 assert.equal(restored.body.record.id,record.id);
 assert.equal(restored.body.record.isDeleted,false);
 assert.equal(restored.body.record.deletedAt,null);
 const history=await call('business-lines/'+record.id+'/history','GET',undefined,superAdmin);
 assert.ok(history.body.history.some(item=>item.action==='Soft Deleted'&&item.reason==='Duplicate business line retired'));
 assert.ok(history.body.history.some(item=>item.action==='Restored Deleted'&&item.reason==='Restored after review'));
 assert.ok(history.body.history.every(item=>/^UID-\d{6,}$/.test(item.actorId)));
});

test('Business Lines cannot be inactivated, archived or legacy-renamed while dependent records exist',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors(),record=await businessCreate('Dependent Fixture');
 const user=(await pool.query('SELECT id FROM users WHERE email=$1',[superAdmin.email])).rows[0];
 const dependency=(await pool.query("INSERT INTO records(id,module,scope_branch,scope_line,data,created_by,updated_by) VALUES(gen_random_uuid(),'branches','PUNE','STTS',$1,$2,$2) RETURNING id",[JSON.stringify({businessLineId:record.id,lines:record.name}),user.id])).rows[0];
 try{
  assert.equal((await call('business-lines/'+record.id,'PUT',{version:record.version,status:'Inactive',reason:'Deactivated for testing'},superAdmin)).status,409);
  assert.equal((await call('business-lines/'+record.id+'/archive','POST',{version:record.version,reason:'Archive approved'},superAdmin)).status,409);
  assert.equal((await call('business-lines/'+record.id,'PUT',{version:record.version,name:'Renamed Dependency'},superAdmin)).status,409);
 }finally{await pool.query('DELETE FROM records WHERE id=$1',[dependency.id])}
 const inactivate=await call('business-lines/'+record.id,'PUT',{version:record.version,status:'Inactive',reason:'Deactivated for testing'},superAdmin);
 assert.equal(inactivate.status,200);
 assert.equal(inactivate.body.record.status,'Inactive');
});

test('Business Line list combines AND search, filters, pagination, counts and safe sorting',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors();
 for(let number=1;number<=28;number++)await businessCreate('Paging Fixture '+String(number).padStart(2,'0'),'Batch '+number);
 let list=await call(businessURL({q:'  paging   fixture  ',pageSize:'25',page:'1',sort:'name',direction:'asc'}),'GET',undefined,superAdmin);
 assert.equal(list.status,200);
 assert.equal(list.body.total,28);
 assert.equal(list.body.records.length,25);
 assert.equal(list.body.totalPages,2);
 const firstPageIds=list.body.records.map(record=>record.id);
 list=await call(businessURL({q:'fixture paging',pageSize:'25',page:'2',sort:'name',direction:'asc'}),'GET',undefined,superAdmin);
 assert.equal(list.body.total,28);
 assert.equal(list.body.records.length,3);
 assert.ok(list.body.records.every(record=>!firstPageIds.includes(record.id)));
 assert.equal(list.body.records[0].name,'Paging Fixture 26');
 const filters=JSON.stringify([{field:'name',operator:'contains',value:'02'}]);
 list=await call(businessURL({q:'paging fixture',filters,status:'Active',sort:'name',direction:'desc'}),'GET',undefined,superAdmin);
 assert.equal(list.status,200);
 assert.equal(list.body.total,1);
 assert.equal(list.body.records[0].name,'Paging Fixture 02');
 const none=await call(businessURL({q:'paging missingword'}),'GET',undefined,superAdmin);
 assert.equal(none.body.total,0);assert.equal(none.body.records.length,0);
 for(const query of [{filters:JSON.stringify([{field:'__proto__',operator:'equals',value:'x'}])},{filters:JSON.stringify([{field:'constructor',operator:'equals',value:'x'}])},{sort:'name; DROP TABLE users;--'},{direction:'desc;SELECT 1'},{pageSize:'100000'},{page:'-1'},{filters:'not json'},{filters:JSON.stringify([{field:'password_hash',operator:'equals',value:'x'}])},{filters:JSON.stringify([{field:'name',operator:'execute',value:'x'}])}]){
  assert.equal((await call(businessURL(query),'GET',undefined,superAdmin)).status,400,JSON.stringify(query));
 }
});

test('Business Line exports respect modes, column allowlists, selected IDs, formula safety and audit',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors();
 const one=await businessCreate('Export Fixture One','=SUM(1,2)'),two=await businessCreate('Export Fixture Two','@danger');
 const selected=await call('business-lines/export','POST',{mode:'selected',ids:[one.id,two.id],columns:['name','description'],query:{q:'does not match'}},superAdmin);
 assert.equal(selected.status,200,JSON.stringify(selected.body));
 assert.equal(selected.body.count,2);
 assert.ok(selected.body.csv.includes('Export Fixture One'));
 assert.ok(selected.body.csv.includes('Export Fixture Two'));
 assert.ok(selected.body.csv.includes("'=SUM(1,2)"));
 assert.ok(selected.body.csv.includes("'@danger"));
 assert.equal(selected.body.csv.includes('password_hash'),false);
 assert.ok(selected.body.filename.endsWith('.csv'));
 assert.equal((await call('business-lines/export','POST',{mode:'selected',ids:[one.id],columns:['name','password_hash']},superAdmin)).status,400);
 assert.equal((await call('business-lines/export','POST',{mode:'selected',ids:[one.id],columns:['name']},{...superAdmin,csrf:''})).status,403);
 const filtered=await call('business-lines/export','POST',{mode:'my',columns:['name'],query:{q:'Export Fixture One'}},superAdmin);
 assert.equal(filtered.status,200);assert.equal(filtered.body.count,1);
 assert.ok(filtered.body.csv.includes('Export Fixture One'));
 assert.equal(filtered.body.csv.includes('Export Fixture Two'),false);
 const all=await call('business-lines/export','POST',{mode:'all',columns:['name'],query:{q:'does not match'}},superAdmin);
 assert.equal(all.status,200);assert.ok(all.body.count>=2);
 assert.ok(all.body.csv.includes('Export Fixture One'));
 const history=await call('business-lines/'+one.id+'/history','GET',undefined,superAdmin);
 assert.ok(history.body.history.length>=1);
 const audit=await call('audit','GET',undefined,superAdmin);
 assert.equal(audit.status,200);
 assert.ok(audit.body.audit.some(entry=>/export/i.test(entry.action)));
});

test('Business Lines guard customer business-line fields independently of record visibility scope',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors(),record=await businessCreate('GSA');
 const data={name:'Cross Scope Customer',identity:'Organisation',category:'Corporate',line:'GSA',status:'Active',scopeBranch:'PUNE',scopeLine:'CAR'};
 const created=await call('records/customers','POST',data,superAdmin);
 assert.equal(created.status,200,JSON.stringify(created.body));
 assert.equal((await call('business-lines/'+record.id,'PUT',{version:record.version,status:'Inactive',reason:'Deactivated for testing'},superAdmin)).status,409);
 assert.equal((await call('business-lines/'+record.id+'/archive','POST',{version:record.version,reason:'Archive approved'},superAdmin)).status,409);
 assert.equal((await call('records/customers/'+created.body.record.id,'DELETE',{version:created.body.record.version},superAdmin)).status,200);
 const inactive=await call('business-lines/'+record.id,'PUT',{version:record.version,status:'Inactive',reason:'Deactivated for testing'},superAdmin);
 assert.equal(inactive.status,200,JSON.stringify(inactive.body));
 assert.equal((await call('records/customers','POST',data,superAdmin)).status,409);
});

test('shared CRM search and notifications enforce module, branch, and business-line access',{skip:!enabled},async()=>{
 const member=await account('workspace-scope@example.org');
 const admin=await account('workspace-admin@example.org','admin');
 const inScope={name:'Lagos PUNE opportunity',customer:'Example',stage:'Proposal',value:5000,scopeBranch:'PUNE',scopeLine:'STTS'};
 const otherScope={...inScope,name:'Lagos Restricted Branch',scopeBranch:'ABUJA'};
 const own=await call('records/opportunities','POST',inScope,member);
 const other=await call('records/opportunities','POST',otherScope,admin);
 assert.equal(own.status,200);
 assert.equal(other.status,200);
 const query='search?scope=global&q=Lagos';
 const scoped=await call(query,'GET',undefined,member);
 assert.equal(scoped.status,200,JSON.stringify(scoped.body));
 assert.ok(scoped.body.results.some(x=>x.id===own.body.record.id&&x.module==='opportunities'));
 assert.ok(!scoped.body.results.some(x=>x.id===other.body.record.id));
 const adminResults=await call(query,'GET',undefined,admin);
 assert.ok(adminResults.body.results.some(x=>x.id===other.body.record.id));
 const otherModule=await call('search?scope=module&module=contacts&q=Lagos','GET',undefined,member);
 assert.equal(otherModule.status,200);
 assert.ok(otherModule.body.results.every(x=>x.module==='contacts'));
 const invalid=await call('search?scope=global&q='+('x'.repeat(110)),'GET',undefined,member);
 assert.equal(invalid.status,400);
 const notices=await call('notifications','GET',undefined,member);
 assert.equal(notices.status,200,JSON.stringify(notices.body));
 assert.ok(notices.body.items.some(x=>x.recordId===own.body.record.id));
 assert.ok(!notices.body.items.some(x=>x.recordId===other.body.record.id));
 assert.equal((await call('notifications','GET',undefined,{})).status,401);
 assert.equal((await call('search?q=Lagos&scope=global','GET',undefined,{})).status,401);
 const pendingEmail='workspace-pending@example.org';
 await call('auth/register','POST',{email:pendingEmail,password,name:'New Employee'});
 const verifyCode=sent.findLast(m=>m.to===pendingEmail).text.match(/\b\d{6}\b/)[0];
 await call('auth/verify','POST',{email:pendingEmail,code:verifyCode});
 const adminNotice=await call('notifications','GET',undefined,admin);
 assert.ok(adminNotice.body.items.some(x=>x.kind==='approval'&&x.title.includes('New Employee')));
 const memberNotices=await call('notifications','GET',undefined,member);
 assert.ok(!memberNotices.body.items.some(x=>x.kind==='approval'));
});

test('Records framework persists personal views and publishes display-only role policy',{skip:!enabled},async()=>{
 const {superAdmin,admin:ordinaryAdmin}=await businessActors();
 const first=await call('business-lines/framework','GET',undefined,superAdmin);
 assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.fields.length,19);assert.equal(first.body.permissions.import,true);
 const get=await call('business-lines/preferences','GET',undefined,superAdmin);
 const data={active:'my',myColumns:['displayId','name','code'],selectedColumns:['displayId','name','code'],widths:{name:250},query:{q:'',status:'all',archived:'exclude',page:1,pageSize:25},sections:{'Basic Information':false},view:'records'};
 const saved=await call('business-lines/preferences','PUT',{version:get.body.preferences.version,data},superAdmin);
 assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.preferences.widths.name,250);
 const restored=await call('business-lines/preferences','GET',undefined,superAdmin);assert.equal(restored.body.preferences.active,'my');assert.equal(restored.body.preferences.sections['Basic Information'],false);
 assert.equal((await call('business-lines/preferences','PUT',{version:get.body.preferences.version,data},superAdmin)).status,409);
 const config=await call('business-lines/configuration','GET',undefined,superAdmin);const draft=structuredClone(config.body.config);draft.order.reverse();draft.frozenCount=2;
 const staged=await call('business-lines/configuration','PUT',{version:config.body.version,action:'draft',config:draft},superAdmin);assert.equal(staged.status,200,JSON.stringify(staged.body));assert.deepEqual(staged.body.config.order,config.body.config.order);
 const published=await call('business-lines/configuration','PUT',{version:staged.body.version,action:'publish',config:draft},superAdmin);assert.equal(published.status,200,JSON.stringify(published.body));assert.equal(published.body.config.frozenCount,2);
 const reset=await call('business-lines/configuration','PUT',{version:published.body.version,action:'publish',config:config.body.config},superAdmin);assert.equal(reset.status,200);
 assert.equal((await call('business-lines/configuration','GET',undefined,ordinaryAdmin)).status,403);
});

test('CSV import is dry-run first, partial and repeat-safe with downloadable failed rows',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors();
 const csv='Business Line Name,Business Line Code,Business Line Description\nRF Import One,RF-IMP-1,First row\nRF Import Two,RF-IMP-2,Second row\n,RF-IMP-3,Missing name\n';
 const upload=await call('business-lines/imports/analyze','POST',{filename:'records.csv',data:Buffer.from(csv).toString('base64')},superAdmin);assert.equal(upload.status,200,JSON.stringify(upload.body));const id=upload.body.job.id;
 assert.equal((await pool.query("SELECT count(*) FROM business_lines WHERE code LIKE 'RF-IMP-%'")).rows[0].count,'0');
 const valid=await call('business-lines/imports/'+id+'/validate','POST',{mapping:{name:0,code:1,description:2},mode:'create',atomic:false},superAdmin);assert.equal(valid.status,200,JSON.stringify(valid.body));assert.equal(valid.body.valid,2);assert.equal(valid.body.invalid,1);
 assert.equal((await pool.query("SELECT count(*) FROM business_lines WHERE code LIKE 'RF-IMP-%'")).rows[0].count,'0');
 assert.equal((await call('business-lines/jobs/'+id+'/start','POST',{validationToken:valid.body.validationToken},superAdmin)).status,200);
 const run=await call('business-lines/jobs/'+id+'/step','POST',{},superAdmin);assert.equal(run.status,200,JSON.stringify(run.body));assert.equal(run.body.job.status,'partial');assert.equal(run.body.job.succeeded,2);assert.equal(run.body.job.failed,1);
 const again=await call('business-lines/jobs/'+id+'/step','POST',{},superAdmin);assert.equal(again.body.job.succeeded,2);
 const reupload=await call('business-lines/imports/analyze','POST',{filename:'same-records.csv',data:Buffer.from(csv).toString('base64')},superAdmin);assert.equal(reupload.body.reused,true);assert.equal(reupload.body.job.id,id);
 const report=await call('business-lines/jobs/'+id+'/errors?part=1','GET',undefined,superAdmin);assert.equal(report.status,200,JSON.stringify(report.body));assert.match(Buffer.from(report.body.data,'base64').toString('utf8'),/Missing name/);
});

test('Atomic import rolls back successful rows if a later row conflicts after validation',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors();const csv='Business Line Name,Business Line Code\nRF Atomic One,RF-ATOMIC-1\nRF Atomic Two,RF-ATOMIC-2\n';
 const upload=await call('business-lines/imports/analyze','POST',{filename:'atomic.csv',data:Buffer.from(csv).toString('base64')},superAdmin);assert.equal(upload.status,200,JSON.stringify(upload.body));const id=upload.body.job.id;
 const valid=await call('business-lines/imports/'+id+'/validate','POST',{mapping:{name:0,code:1},mode:'create',atomic:true},superAdmin);assert.equal(valid.body.valid,2);
 assert.equal((await call('business-lines','POST',{name:'RF Atomic Concurrent',code:'RF-ATOMIC-2'},superAdmin)).status,200);
 await call('business-lines/jobs/'+id+'/start','POST',{validationToken:valid.body.validationToken},superAdmin);const run=await call('business-lines/jobs/'+id+'/step','POST',{},superAdmin);assert.equal(run.status,200,JSON.stringify(run.body));assert.equal(run.body.job.status,'failed');assert.equal(run.body.job.succeeded,0);
 assert.equal((await pool.query("SELECT count(*) FROM business_lines WHERE code='RF-ATOMIC-1'")).rows[0].count,'0');
});

test('Export plans separate columns from record scope and generate authenticated XLSX jobs',{skip:!enabled},async()=>{
 const {superAdmin,admin:ordinaryAdmin}=await businessActors();const request={scope:'matching',query:{q:'RF Import',page:1,pageSize:25},columnMode:'custom',columns:['displayId','name','code'],format:'xlsx'};
 const plan=await call('business-lines/exports/plan','POST',request,superAdmin);assert.equal(plan.status,200,JSON.stringify(plan.body));assert.equal(plan.body.count,2);
 const idempotency='3da17230-31dc-449e-b2ce-7241085b975a';
 const created=await call('business-lines/exports','POST',{...request,expectedCount:2,requestId:idempotency},superAdmin);assert.equal(created.status,200,JSON.stringify(created.body));const id=created.body.job.id;
 const repeated=await call('business-lines/exports','POST',{...request,expectedCount:2,requestId:idempotency},superAdmin);assert.equal(repeated.body.job.id,id);
 const step=await call('business-lines/jobs/'+id+'/step','POST',{},superAdmin);assert.equal(step.status,200,JSON.stringify(step.body));assert.equal(step.body.job.succeeded,2);assert.equal(step.body.job.status,'completed');
 const file=await call('business-lines/jobs/'+id+'/file?part=1','GET',undefined,superAdmin);assert.equal(file.status,200,JSON.stringify(file.body));assert.equal(Buffer.from(file.body.data,'base64').readUInt32LE(0),0x04034b50);
 assert.equal((await call('business-lines/jobs/'+id+'/file?part=1','GET',undefined,ordinaryAdmin)).status,403);
 assert.equal((await call('business-lines/exports/plan','POST',{...request,scope:'all'},superAdmin)).status,400);
});

test('Typed nested filtering, stable multi-sort and explicit bulk snapshots work together',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors();const query={filters:{logic:'and',conditions:[{field:'name',operator:'startsWith',value:'RF Import'},{logic:'or',conditions:[{field:'code',operator:'equals',value:'RF-IMP-1'},{field:'code',operator:'equals',value:'RF-IMP-2'}]}]},sorts:[{field:'name',direction:'desc'},{field:'createdAt',direction:'asc'}],page:1,pageSize:25};
 const params=new URLSearchParams({filters:JSON.stringify(query.filters),sorts:JSON.stringify(query.sorts)});const listed=await call('business-lines?'+params,'GET',undefined,superAdmin);assert.equal(listed.status,200,JSON.stringify(listed.body));assert.equal(listed.body.total,2);assert.equal(listed.body.records[0].code,'RF-IMP-2');
 const plan=await call('business-lines/bulk/plan','POST',{scope:'matching',query,action:'archive'},superAdmin);assert.equal(plan.body.count,2);
 const created=await call('business-lines/bulk','POST',{scope:'matching',query,action:'archive',reason:'Bulk reviewed fixture',expectedCount:2,requestId:'e3a00255-ebf4-4375-a3d1-cb3bcd018d73'},superAdmin);assert.equal(created.status,200,JSON.stringify(created.body));
 const ran=await call('business-lines/jobs/'+created.body.job.id+'/step','POST',{},superAdmin);assert.equal(ran.status,200,JSON.stringify(ran.body));assert.equal(ran.body.job.succeeded,2);
 assert.equal((await pool.query("SELECT count(*) FROM business_lines WHERE code IN ('RF-IMP-1','RF-IMP-2') AND archived_at IS NOT NULL")).rows[0].count,'2');
});

test('Records XLSX import updates preserve unmapped Description and protect system fields',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors();const initial=await call('business-lines','POST',{name:'RF XLSX Old Name',code:'RF-XLSX-1',description:'Preserved description'},superAdmin);assert.equal(initial.status,200,JSON.stringify(initial.body));
 const {default:ExcelJS}=await import('exceljs');const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Import Data');sheet.addRow(['Business Line ID','Business Line Code','Business Line Name']);sheet.addRow([initial.body.record.displayId,'RF-XLSX-2','RF XLSX Updated']);const bytes=Buffer.from(await workbook.xlsx.writeBuffer());
 const upload=await call('business-lines/imports/analyze','POST',{filename:'update.xlsx',data:bytes.toString('base64')},superAdmin);assert.equal(upload.status,200,JSON.stringify(upload.body));const id=upload.body.job.id;
 const validation=await call('business-lines/imports/'+id+'/validate','POST',{mapping:{displayId:0,code:1,name:2},mode:'update',atomic:true},superAdmin);assert.equal(validation.status,200,JSON.stringify(validation.body));assert.equal(validation.body.valid,1);
 await call('business-lines/jobs/'+id+'/start','POST',{validationToken:validation.body.validationToken},superAdmin);const run=await call('business-lines/jobs/'+id+'/step','POST',{},superAdmin);assert.equal(run.status,200,JSON.stringify(run.body));assert.equal(run.body.job.succeeded,1);
 const record=(await call('business-lines/'+initial.body.record.id,'GET',undefined,superAdmin)).body.record;assert.equal(record.name,'RF XLSX Updated');assert.equal(record.code,'RF-XLSX-2');assert.equal(record.description,'Preserved description');assert.equal(record.createdAt,initial.body.record.createdAt);assert.equal(record.createdById,initial.body.record.createdById);assert.equal(record.ownerId,initial.body.record.ownerId);
});

test('Large exports resume in ordered parts, and downloads invalidate after policy publishing',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors();
 const actor=(await pool.query("SELECT id FROM users WHERE system_role='super_admin' AND status='approved' ORDER BY created_at LIMIT 1")).rows[0].id;
 await pool.query("INSERT INTO business_lines(id,name,code,owner_id,created_by,updated_by) SELECT gen_random_uuid(),'RF Large Export '||lpad(n::text,4,'0'),'RF-LARGE-'||n,$1,$1,$1 FROM generate_series(1,1005) n",[actor]);
 const request={scope:'matching',query:{q:'RF Large Export',sorts:[{field:'name',direction:'asc'}]},columnMode:'custom',columns:['displayId','name','code'],format:'csv'};
 const plan=await call('business-lines/exports/plan','POST',request,superAdmin);assert.equal(plan.status,200,JSON.stringify(plan.body));assert.equal(plan.body.count,1005);assert.equal(plan.body.parts,2);
 const created=await call('business-lines/exports','POST',{...request,expectedCount:1005,requestId:'03fa2d0e-f844-4b0c-b3db-70dd8688c926'},superAdmin);assert.equal(created.status,200,JSON.stringify(created.body));const id=created.body.job.id;
 const a=await call('business-lines/jobs/'+id+'/step','POST',{},superAdmin);assert.equal(a.status,200,JSON.stringify(a.body));assert.equal(a.body.job.succeeded,1000);assert.equal(a.body.job.status,'running');
 const b=await call('business-lines/jobs/'+id+'/step','POST',{},superAdmin);assert.equal(b.status,200,JSON.stringify(b.body));assert.equal(b.body.job.succeeded,1005);assert.equal(b.body.job.status,'completed');
 const first=await call('business-lines/jobs/'+id+'/file?part=1','GET',undefined,superAdmin),second=await call('business-lines/jobs/'+id+'/file?part=2','GET',undefined,superAdmin);assert.equal(first.status,200);assert.equal(second.status,200);const part1=Buffer.from(first.body.data,'base64').toString(),part2=Buffer.from(second.body.data,'base64').toString();assert.match(part1,/RF Large Export 0001/);assert.doesNotMatch(part1,/RF Large Export 1001/);assert.match(part2,/RF Large Export 1001/);
 const configuration=await call('business-lines/configuration','GET',undefined,superAdmin);const draft=await call('business-lines/configuration','PUT',{version:configuration.body.version,action:'draft',config:configuration.body.config},superAdmin);assert.equal(draft.status,200);assert.equal((await call('business-lines/jobs/'+id+'/file?part=1','GET',undefined,superAdmin)).status,200,'Draft must not change effective export permissions');
 const published=await call('business-lines/configuration','PUT',{version:draft.body.version,action:'publish',config:configuration.body.config},superAdmin);assert.equal(published.status,200);assert.equal((await call('business-lines/jobs/'+id+'/file?part=1','GET',undefined,superAdmin)).status,403,'Published policy requires a fresh export');
 await assert.rejects(pool.query("UPDATE crm_configuration_audit SET action='tampered'"));
});

test('Records and Overview restore independent filters and Overview exports only summary metrics',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors();const p=(await call('business-lines/preferences','GET',undefined,superAdmin)).body.preferences;
 const {version,...data}=p;data.queries={records:{q:'RF XLSX',pageSize:50},overview:{q:'RF Large Export',pageSize:25}};data.view='overview';
 const saved=await call('business-lines/preferences','PUT',{version,data},superAdmin);assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.preferences.query.q,'RF Large Export');assert.equal(saved.body.preferences.queries.records.q,'RF XLSX');
 const restored=(await call('business-lines/preferences','GET',undefined,superAdmin)).body.preferences;assert.equal(restored.queries.records.pageSize,50);assert.equal(restored.queries.overview.pageSize,25);
 const exported=await call('business-lines/overview-export','POST',{query:{q:'RF Large Export'},format:'csv'},superAdmin);assert.equal(exported.status,200,JSON.stringify(exported.body));const csv=Buffer.from(exported.body.data,'base64').toString();assert.match(csv,/Matching Business Lines/);assert.match(csv,/1005/);assert.equal(csv.trim().split('\n').length,6,'Overview exports five summary metrics, not the underlying records');
});

test('Create import templates omit generated identity and provide field-by-field CSV guidance',{skip:!enabled},async()=>{
 const {superAdmin,admin:ordinaryAdmin}=await businessActors();
 const template=await call('business-lines/imports/template?format=csv','GET',undefined,superAdmin);
 assert.equal(template.status,200,JSON.stringify(template.body));
 const {parseCSV}=await import('../server/records-files.mjs');
 const headers=parseCSV(Buffer.from(template.body.data,'base64'))[0];
 assert.deepEqual(new Set(headers),new Set(['Business Line Code','Business Line Name','Business Line Description']));
 assert.ok(!headers.includes('Business Line ID'),'System-generated identity is not a user-fillable Create column');
 const guide=await call('business-lines/imports/guidelines?format=csv','GET',undefined,superAdmin);
 assert.equal(guide.status,200,JSON.stringify(guide.body));
 const content=Buffer.from(guide.body.data,'base64').toString('utf8');
 for(const label of headers)assert.ok(content.includes(label),'Guidelines explain '+label);
 assert.match(content,/required/i);assert.match(content,/unique/i);assert.match(content,/dependenc/i);
 assert.equal((await call('business-lines/imports/guidelines?format=csv','GET',undefined,ordinaryAdmin)).status,403);
});

test('Repeated completed imports explicitly identify the original result without new writes',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors();
 const csv='Business Line Code,Business Line Name\nRF-REPEAT-C,RF Completed Reupload\n';
 const analyze=()=>call('business-lines/imports/analyze','POST',{filename:'repeated-complete.csv',data:Buffer.from(csv).toString('base64')},superAdmin);
 const first=await analyze();assert.equal(first.status,200,JSON.stringify(first.body));const id=first.body.job.id;
 const validation=await call('business-lines/imports/'+id+'/validate','POST',{mapping:{code:0,name:1},mode:'create',atomic:false},superAdmin);
 assert.equal(validation.body.valid,1);await call('business-lines/jobs/'+id+'/start','POST',{validationToken:validation.body.validationToken},superAdmin);
 const result=await call('business-lines/jobs/'+id+'/step','POST',{},superAdmin);assert.equal(result.body.job.status,'completed');
 const before=(await pool.query("SELECT id,version,updated_at FROM business_lines WHERE code='RF-REPEAT-C'")).rows[0];
 const [a,b]=await Promise.all([analyze(),analyze()]);
 for(const repeat of [a,b]){assert.equal(repeat.status,200,JSON.stringify(repeat.body));assert.equal(repeat.body.reused,true);assert.equal(repeat.body.duplicate,true);assert.equal(repeat.body.job.id,id);assert.equal(repeat.body.job.succeeded,1);assert.match(repeat.body.message,/already|previous|original/i);assert.match(repeat.body.message,/no new|not imported|not.*again|no records.*changed/i);}
 const after=(await pool.query("SELECT id,version,updated_at FROM business_lines WHERE code='RF-REPEAT-C'")).rows[0];assert.deepEqual(after,before);
 assert.equal((await pool.query("SELECT count(*) FROM business_lines WHERE code='RF-REPEAT-C'")).rows[0].count,'1');
});

test('Partial update import reports changed, unchanged and invalid rows and supports correction',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors();
 const created=[];for(const [code,name] of [['RF-MIX-1','RF Mixed Update One'],['RF-MIX-2','RF Mixed Update Two']]){
  const r=await call('business-lines','POST',{code,name,description:'Original description'},superAdmin);assert.equal(r.status,200,JSON.stringify(r.body));created.push(r.body.record);
 }
 const csv='Business Line Code,Business Line Name,Business Line Description\nRF-MIX-1,RF Mixed Update One,Updated description\nRF-MIX-2,RF Mixed Update Two,Original description\nRF-MIX-404,RF Missing Update,Missing record\n';
 const upload=await call('business-lines/imports/analyze','POST',{filename:'mixed-updates.csv',data:Buffer.from(csv).toString('base64')},superAdmin);const id=upload.body.job.id;
 const validation=await call('business-lines/imports/'+id+'/validate','POST',{mapping:{code:0,name:1,description:2},mode:'update',atomic:false},superAdmin);
 assert.equal(validation.status,200,JSON.stringify(validation.body));assert.equal(validation.body.valid,1);assert.equal(validation.body.invalid,1);assert.equal(validation.body.unchanged,1);
 const before=await call('business-lines/'+created[0].id,'GET',undefined,superAdmin);assert.equal(before.body.record.description,'Original description','Validation never mutates records');
 const errorsBefore=await call('business-lines/jobs/'+id+'/errors?part=1','GET',undefined,superAdmin);assert.equal(errorsBefore.status,200);const failedOnly=Buffer.from(errorsBefore.body.data,'base64').toString();assert.match(failedOnly,/RF-MIX-404/);assert.doesNotMatch(failedOnly,/RF-MIX-2/,'Unchanged rows do not belong in the correction file');assert.doesNotMatch(failedOnly,/RF-MIX-1/,'Valid changed rows do not belong in the correction file');
 await call('business-lines/jobs/'+id+'/start','POST',{validationToken:validation.body.validationToken},superAdmin);const complete=await call('business-lines/jobs/'+id+'/step','POST',{},superAdmin);
 assert.equal(complete.status,200,JSON.stringify(complete.body));assert.equal(complete.body.job.status,'partial');assert.equal(complete.body.job.updated,1);assert.equal(complete.body.job.created,0);assert.equal(complete.body.job.failed,1);assert.equal(complete.body.job.skipped,1);
 const changed=await call('business-lines/'+created[0].id,'GET',undefined,superAdmin),unchanged=await call('business-lines/'+created[1].id,'GET',undefined,superAdmin);
 assert.equal(changed.body.record.description,'Updated description');assert.equal(unchanged.body.record.version,created[1].version,'An unchanged row does not create a misleading edit/audit event');
 const outcomes=await call('business-lines/jobs/'+id+'/results?format=csv','GET',undefined,superAdmin);assert.equal(outcomes.status,200,JSON.stringify(outcomes.body));const output=Buffer.from(outcomes.body.data,'base64').toString();for(const code of ['RF-MIX-1','RF-MIX-2','RF-MIX-404'])assert.match(output,new RegExp(code));assert.match(output,/updated/i);assert.match(output,/unchanged|no changes/i);assert.match(output,/failed/i);
 const corrected='Business Line Code,Business Line Name,Business Line Description\nRF-MIX-1,RF Mixed Update One,Corrected failed row\n';
 const correction=await call('business-lines/imports/analyze','POST',{filename:'corrected-only.csv',data:Buffer.from(corrected).toString('base64')},superAdmin);assert.notEqual(correction.body.job.id,id);assert.equal(correction.body.reused,false);
});

test('Successful updates with unchanged rows complete without reporting a partial failure',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors();const csv='Business Line Code,Business Line Name,Business Line Description\nRF-MIX-1,RF Mixed Update One,Another saved update\nRF-MIX-2,RF Mixed Update Two,Original description\n';
 const upload=await call('business-lines/imports/analyze','POST',{filename:'unchanged-is-success.csv',data:Buffer.from(csv).toString('base64')},superAdmin);const id=upload.body.job.id;
 const validation=await call('business-lines/imports/'+id+'/validate','POST',{mapping:{code:0,name:1,description:2},mode:'update',atomic:false},superAdmin);assert.equal(validation.status,200,JSON.stringify(validation.body));assert.equal(validation.body.valid,1);assert.equal(validation.body.invalid,0);assert.equal(validation.body.unchanged,1);
 const start=await call('business-lines/jobs/'+id+'/start','POST',{validationToken:validation.body.validationToken},superAdmin);assert.equal(start.status,200,JSON.stringify(start.body));
 const completed=await call('business-lines/jobs/'+id+'/step','POST',{},superAdmin);assert.equal(completed.status,200,JSON.stringify(completed.body));assert.equal(completed.body.job.status,'completed');assert.equal(completed.body.job.updated,1);assert.equal(completed.body.job.skipped,1);assert.equal(completed.body.job.failed,0);
 const details=await call('business-lines/jobs/'+id,'GET',undefined,superAdmin);assert.equal(details.body.reportParts,0,'There is no correction file when every row is valid or unchanged');
});

test('A stale import review in another session cannot commit a replaced validation snapshot',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors();const login=await call('auth/login','POST',{email:superAdmin.email,password});assert.equal(login.status,200);const secondSession={cookie:login.headers['Set-Cookie'].split(';')[0],csrf:login.body.csrf,email:superAdmin.email};
 const csv='Business Line Code,Name A,Name B\nRF-REVIEW-RACE,RF Cross Session Earlier,RF Cross Session Reviewed\n';
 const upload=await call('business-lines/imports/analyze','POST',{filename:'two-review-sessions.csv',data:Buffer.from(csv).toString('base64')},superAdmin);assert.equal(upload.status,200);const id=upload.body.job.id;
 const first=await call('business-lines/imports/'+id+'/validate','POST',{mapping:{code:0,name:1},mode:'create',atomic:true},superAdmin);assert.equal(first.status,200);assert.equal(first.body.valid,1);
 const second=await call('business-lines/imports/'+id+'/validate','POST',{mapping:{code:0,name:2},mode:'create',atomic:false},secondSession);assert.equal(second.status,200);assert.equal(second.body.valid,1);assert.notEqual(first.body.validationToken,second.body.validationToken);
 assert.equal((await call('business-lines/jobs/'+id+'/start','POST',{},superAdmin)).status,409,'A missing review token cannot approve the latest snapshot');
 const stale=await call('business-lines/jobs/'+id+'/start','POST',{validationToken:first.body.validationToken},superAdmin);assert.equal(stale.status,409);assert.match(stale.body.error,/validation|review/i);assert.equal((await pool.query("SELECT count(*) FROM business_lines WHERE code='RF-REVIEW-RACE'")).rows[0].count,'0');
 const accepted=await call('business-lines/jobs/'+id+'/start','POST',{validationToken:second.body.validationToken},secondSession);assert.equal(accepted.status,200,JSON.stringify(accepted.body));const finished=await call('business-lines/jobs/'+id+'/step','POST',{},secondSession);assert.equal(finished.status,200,JSON.stringify(finished.body));assert.equal(finished.body.job.created,1);
 assert.equal((await pool.query("SELECT name FROM business_lines WHERE code='RF-REVIEW-RACE'")).rows[0].name,'RF Cross Session Reviewed');
 const repeat=await call('business-lines/jobs/'+id+'/start','POST',{},superAdmin);assert.equal(repeat.status,200);assert.equal(repeat.body.reused,true,'A completed retry remains idempotent');
});

test('Business Line events retain supplied origin timezones without changing UTC instants or ordinary fields',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors();
 const rejected=await call('business-lines','POST',{code:'RF-TZ-BAD',name:'RF Invalid Event Zone',timeZone:'Invalid/Zone'},superAdmin);assert.equal(rejected.status,400);assert.equal((await pool.query("SELECT count(*) FROM business_lines WHERE code='RF-TZ-BAD'")).rows[0].count,'0');
 const created=await call('business-lines','POST',{code:'RF-TZ-EVENT',name:'RF Origin Event Zone',description:'Initial value',timeZone:'Asia/Kolkata'},superAdmin);assert.equal(created.status,200,JSON.stringify(created.body));const initial=created.body.record;assert.match(initial.createdAt,/Z$/);assert.ok(Number.isFinite(Date.parse(initial.createdAt)));assert.equal(Object.hasOwn(initial,'timeZone'),false,'Timezone context does not become an ordinary Business Line form field');
 let history=await call('business-lines/'+initial.id+'/history','GET',undefined,superAdmin);assert.equal(history.status,200);assert.equal(history.body.history[0].action,'Created');assert.equal(history.body.history[0].timeZone,'Asia/Kolkata');assert.equal(Object.hasOwn(history.body.history[0].changes,'_context'),false);
 assert.equal((await pool.query("SELECT changes->'_context'->>'timeZone' AS zone FROM business_line_events WHERE business_line_id=$1 ORDER BY id DESC LIMIT 1",[initial.id])).rows[0].zone,'Asia/Kolkata');
 const edited=await call('business-lines/'+initial.id,'PUT',{version:initial.version,description:'Changed value',timeZone:'America/New_York'},superAdmin);assert.equal(edited.status,200,JSON.stringify(edited.body));assert.equal(edited.body.record.createdAt,initial.createdAt);assert.match(edited.body.record.updatedAt,/Z$/);
 const noChange=await call('business-lines/'+initial.id,'PUT',{version:edited.body.record.version,description:'Changed value',timeZone:'Europe/London'},superAdmin);assert.equal(noChange.status,200);assert.equal(noChange.body.record.version,edited.body.record.version);
 history=await call('business-lines/'+initial.id+'/history','GET',undefined,superAdmin);assert.equal(history.body.history.length,2,'A timezone-only no-op does not manufacture a change event');assert.equal(history.body.history[0].timeZone,'America/New_York');
 const invalidArchive=await call('business-lines/'+initial.id+'/archive','POST',{version:edited.body.record.version,reason:'Reviewed fixture',timeZone:'Invalid/Zone'},superAdmin);assert.equal(invalidArchive.status,400);assert.equal((await call('business-lines/'+initial.id,'GET',undefined,superAdmin)).body.record.version,edited.body.record.version);
 const archived=await call('business-lines/'+initial.id+'/archive','POST',{version:edited.body.record.version,reason:'Reviewed fixture',timeZone:'Australia/Sydney'},superAdmin);assert.equal(archived.status,200,JSON.stringify(archived.body));assert.match(archived.body.record.archivedAt,/Z$/);
 const restored=await call('business-lines/'+initial.id+'/restore','POST',{version:archived.body.record.version,reason:'Restored fixture'},superAdmin);assert.equal(restored.status,200,JSON.stringify(restored.body));
 history=await call('business-lines/'+initial.id+'/history','GET',undefined,superAdmin);assert.deepEqual(history.body.history.map(e=>[e.action,e.timeZone]),[['Restored',null],['Archived','Australia/Sydney'],['Updated','America/New_York'],['Created','Asia/Kolkata']]);assert.ok(history.body.history.every(e=>e.createdAt.endsWith('Z')&&!Object.hasOwn(e.changes,'_context')));
 const withoutZone=await call('business-lines','POST',{code:'RF-TZ-UNKNOWN',name:'RF Unknown Event Zone'},superAdmin);assert.equal(withoutZone.status,200);assert.equal((await call('business-lines/'+withoutZone.body.record.id+'/history','GET',undefined,superAdmin)).body.history[0].timeZone,null,'Missing origin stays unknown rather than being inferred from server UTC');
});

test('Import and bulk workers retain the initiating timezone through retries and reject origin replacement',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors();const csv='Business Line Code,Business Line Name\nRF-TZ-JOB,RF Background Origin Zone\n';
 const uploaded=await call('business-lines/imports/analyze','POST',{filename:'origin-zone.csv',data:Buffer.from(csv).toString('base64')},superAdmin);assert.equal(uploaded.status,200,JSON.stringify(uploaded.body));const importId=uploaded.body.job.id;
 const validationInput={mapping:{code:0,name:1},mode:'create',atomic:false,timeZone:'Europe/London'};
 assert.equal((await call('business-lines/imports/'+importId+'/validate','POST',{...validationInput,timeZone:'Invalid/Zone'},superAdmin)).status,400);assert.equal((await pool.query("SELECT count(*) FROM business_lines WHERE code='RF-TZ-JOB'")).rows[0].count,'0');
 const validated=await call('business-lines/imports/'+importId+'/validate','POST',validationInput,superAdmin);assert.equal(validated.status,200,JSON.stringify(validated.body));assert.equal(validated.body.valid,1);assert.equal((await pool.query('SELECT request FROM crm_transfer_jobs WHERE id=$1',[importId])).rows[0].request.timeZone,'Europe/London');
 assert.equal((await call('business-lines/jobs/'+importId+'/start','POST',{validationToken:validated.body.validationToken},superAdmin)).status,200);assert.equal((await call('business-lines/jobs/'+importId+'/start','POST',{timeZone:'Pacific/Auckland'},superAdmin)).status,400);assert.equal((await call('business-lines/jobs/'+importId+'/start','POST',{},superAdmin)).status,200);
 const imported=await call('business-lines/jobs/'+importId+'/step','POST',{},superAdmin);assert.equal(imported.status,200,JSON.stringify(imported.body));assert.equal(imported.body.job.created,1);assert.equal(imported.body.job.status,'completed');
 const record=(await pool.query("SELECT id FROM business_lines WHERE code='RF-TZ-JOB'")).rows[0];let history=await call('business-lines/'+record.id+'/history','GET',undefined,superAdmin);assert.equal(history.body.history[0].timeZone,'Europe/London');
 const bulkInput={scope:'selected',ids:[record.id],action:'archive',reason:'Reviewed timezone fixture',expectedCount:1,requestId:'7c8056f9-a231-4b14-a0de-44dc8b79f44a',timeZone:'Australia/Sydney'};
 assert.equal((await call('business-lines/bulk','POST',{...bulkInput,timeZone:'Invalid/Zone'},superAdmin)).status,400);assert.equal((await call('business-lines/'+record.id,'GET',undefined,superAdmin)).body.record.archivedAt,null);
 const bulk=await call('business-lines/bulk','POST',bulkInput,superAdmin);assert.equal(bulk.status,200,JSON.stringify(bulk.body));const bulkId=bulk.body.job.id;assert.equal((await pool.query('SELECT request FROM crm_transfer_jobs WHERE id=$1',[bulkId])).rows[0].request.timeZone,'Australia/Sydney');
 assert.equal((await call('business-lines/jobs/'+bulkId+'/step','POST',{timeZone:'Pacific/Auckland'},superAdmin)).status,400);const completed=await call('business-lines/jobs/'+bulkId+'/step','POST',{},superAdmin);assert.equal(completed.status,200,JSON.stringify(completed.body));assert.equal(completed.body.job.status,'completed');
 const retry=await call('business-lines/jobs/'+bulkId+'/step','POST',{},superAdmin);assert.equal(retry.body.job.succeeded,1);history=await call('business-lines/'+record.id+'/history','GET',undefined,superAdmin);assert.deepEqual(history.body.history.map(e=>[e.action,e.timeZone]),[['Archived','Australia/Sydney'],['Created','Europe/London']]);
});

test('Export preserves local timezone metadata, filters and 24-hour completion-based expiry',{skip:!enabled},async()=>{
 const {superAdmin,admin:ordinaryAdmin}=await businessActors();
 const body={scope:'matching',query:{q:'RF Completed Reupload'},columnMode:'custom',columns:['displayId','name','createdAt','updatedAt'],format:'xlsx',timeZone:'Asia/Kolkata'};
 const bad=await call('business-lines/exports/plan','POST',{...body,timeZone:'Invalid/Zone'},superAdmin);assert.equal(bad.status,400);
 const plan=await call('business-lines/exports/plan','POST',body,superAdmin);assert.equal(plan.status,200,JSON.stringify(plan.body));assert.equal(plan.body.count,1);assert.equal(plan.body.timeZone,'Asia/Kolkata');
 const queued=await call('business-lines/exports','POST',{...body,expectedCount:plan.body.count,requestId:'15f3bce8-a866-43ea-8bfa-18aa3d21a558'},superAdmin);assert.equal(queued.status,200,JSON.stringify(queued.body));const id=queued.body.job.id;assert.equal(queued.body.job.timeZone,'Asia/Kolkata');
 // The job's files get a full retention period after completion, even when queued earlier.
 await pool.query("UPDATE crm_transfer_jobs SET created_at=now()-interval '2 hours',expires_at=now()+interval '22 hours' WHERE id=$1",[id]);
 const run=await call('business-lines/jobs/'+id+'/step','POST',{},superAdmin);assert.equal(run.status,200,JSON.stringify(run.body));assert.equal(run.body.job.status,'completed');
 const remaining=new Date(run.body.job.expiresAt).getTime()-Date.now();assert.ok(remaining>23.99*3600000&&remaining<=24.01*3600000,'Files retain approximately 24 hours after completion');
 const details=await call('business-lines/jobs/'+id,'GET',undefined,superAdmin);assert.equal(details.status,200);assert.equal(details.body.job.timeZone,'Asia/Kolkata');assert.equal(details.body.job.request.query.q,body.query.q);
 const downloaded=await call('business-lines/jobs/'+id+'/file?part=1','GET',undefined,superAdmin);assert.equal(downloaded.status,200);assert.match(downloaded.body.filename,/\d{4}-\d{2}-\d{2}/);assert.match(downloaded.body.filename,/\d{2}-\d{2}-\d{2}/);
 const {default:ExcelJS}=await import('exceljs');const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(Buffer.from(downloaded.body.data,'base64'));const sheet=workbook.getWorksheet('Records');assert.ok(sheet);const headers=sheet.getRow(1).values.slice(1);assert.equal(headers.filter(v=>/Time Zone/.test(v)).length,2);for(let c=1;c<=headers.length;c++)if(/Time Zone/.test(headers[c-1])){const zone=sheet.getCell(2,c).value??'';if(sheet.getCell(2,c-1).value)assert.match(String(zone),/^Asia\/Kolkata \(UTC\+05:30\)$/);else assert.equal(zone,'','Blank dates have blank timezones');}assert.ok(sheet.getRow(2).values.some(v=>String(v).startsWith('Asia/Kolkata')));assert.ok(workbook.worksheets.length>=2);
 const guide=await call('business-lines/jobs/'+id+'/guidelines?format=csv','GET',undefined,superAdmin);assert.equal(guide.status,200);assert.match(Buffer.from(guide.body.data,'base64').toString(),/Asia\/Kolkata/);
 assert.equal((await call('business-lines/jobs/'+id+'/guidelines?format=csv','GET',undefined,ordinaryAdmin)).status,403);
 await pool.query("UPDATE crm_transfer_jobs SET expires_at=now()-interval '1 second' WHERE id=$1",[id]);
 assert.equal((await call('business-lines/jobs/'+id+'/file?part=1','GET',undefined,superAdmin)).status,410);
 await call('business-lines/jobs','GET',undefined,superAdmin);
 assert.equal((await pool.query('SELECT count(*) FROM crm_transfer_files WHERE job_id=$1',[id])).rows[0].count,'0','Expired downloadable bytes are removed');
});

test('Wide Unicode exports subdivide safely without losing records or requested columns',{skip:!enabled},async()=>{
 const {superAdmin}=await businessActors();const actor=(await pool.query("SELECT id,name FROM users WHERE email=$1",[superAdmin.email])).rows[0];
 try{
  await pool.query('UPDATE users SET name=$2 WHERE id=$1',[actor.id,'界'.repeat(120)]);
  await pool.query("INSERT INTO business_lines(id,name,code,description,owner_id,created_by,updated_by) SELECT gen_random_uuid(),'RF Wide Unicode '||n||repeat('界',120),'RF-WIDE-'||n,repeat('界',500),$1,$1,$1 FROM generate_series(1,1000) n",[actor.id]);
  const fields=(await call('business-lines/framework','GET',undefined,superAdmin)).body.fields;const columns=fields.map(f=>f.key);
  const request={scope:'matching',query:{q:'RF Wide Unicode',sorts:[{field:'name',direction:'asc'}]},columnMode:'custom',columns,format:'csv',timeZone:'Asia/Kolkata'};
  const plan=await call('business-lines/exports/plan','POST',request,superAdmin);assert.equal(plan.status,200,JSON.stringify(plan.body));assert.equal(plan.body.count,1000);
  const created=await call('business-lines/exports','POST',{...request,expectedCount:1000,requestId:'d5e5089a-8bf0-4a94-ae8a-4f181d10b72a'},superAdmin);assert.equal(created.status,200,JSON.stringify(created.body));const id=created.body.job.id;
  let run=await call('business-lines/jobs/'+id+'/step','POST',{},superAdmin);assert.equal(run.status,200,JSON.stringify(run.body));assert.ok(run.body.job.succeeded>0&&run.body.job.succeeded<1000,'An oversized first batch makes safe partial progress');
  for(let n=0;n<10&&run.body.job.status!=='completed';n++){run=await call('business-lines/jobs/'+id+'/step','POST',{},superAdmin);assert.equal(run.status,200,JSON.stringify(run.body));}
  assert.equal(run.body.job.status,'completed');assert.equal(run.body.job.succeeded,1000);assert.equal(run.body.job.failed,0);
  const details=await call('business-lines/jobs/'+id,'GET',undefined,superAdmin);assert.ok(details.body.files.length>=2);const {parseCSV}=await import('../server/records-files.mjs');const codes=[];
  for(const part of details.body.files){assert.ok(part.size<=2500000,'Every part stays inside the response-size budget');const file=await call('business-lines/jobs/'+id+'/file?part='+part.part,'GET',undefined,superAdmin);assert.equal(file.status,200);const parsed=parseCSV(Buffer.from(file.body.data,'base64')),headers=parsed[0];for(const field of fields)assert.ok(headers.includes(field.label),'No requested column was dropped: '+field.label);const codeIndex=headers.indexOf('Business Line Code');codes.push(...parsed.slice(1).map(r=>r[codeIndex]));}
  assert.equal(codes.length,1000);assert.equal(new Set(codes).size,1000);assert.ok(codes.includes('RF-WIDE-1')&&codes.includes('RF-WIDE-1000'));
 }finally{await pool.query('UPDATE users SET name=$2 WHERE id=$1',[actor.id,actor.name]);}
});
