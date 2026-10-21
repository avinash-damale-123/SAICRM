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
 assert.equal((await call('business-lines/jobs/'+id+'/start','POST',{},superAdmin)).status,200);
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
 await call('business-lines/jobs/'+id+'/start','POST',{},superAdmin);const run=await call('business-lines/jobs/'+id+'/step','POST',{},superAdmin);assert.equal(run.status,200,JSON.stringify(run.body));assert.equal(run.body.job.status,'failed');assert.equal(run.body.job.succeeded,0);
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
