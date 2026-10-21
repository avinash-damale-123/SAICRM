import { recordsFramework } from './records-framework.mjs';
import { randomUUID } from 'node:crypto';
import { businessLines, validateBusinessLineReferences } from './business-lines.mjs';
import { searchWorkspace, notificationsFeed } from './workspace-discovery.mjs';
import { transaction } from './db.mjs';
import { authorize, modules, validateRecord } from './contracts.mjs';
import { token, otp, hash, digest, equal, validPassword, passwordHash, passwordMatches } from './crypto.mjs';
import { sendEmail, smtpConfiguration } from './email.mjs';
import { googleConfiguration, authorizationURL, exchangeGoogle } from './google.mjs';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const emailOf = value => {
 if (typeof value !== 'string' || value.length > 254 || /[<>,;\r\n]/.test(value) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim())) fail(400, 'Enter a valid email address');
 return value.trim().toLowerCase();
};
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const publicUser = user => ({ id: user.id, email: user.email, name: user.name, role: user.role, systemRole: user.system_role || 'user', status: user.status, emailVerified: user.email_verified, scopes: user.scopes || [] });
const audit = (client, actor, action, module, id) => client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)', [actor, action, module, id]);
const generic = { message: 'If this address is eligible, an email has been sent. Check your inbox and spam folder.' };
export function configuration(env = process.env) {
 const origin = env.APP_ORIGIN;
 if (!origin || new URL(origin).origin !== origin || !origin.startsWith('https://') || !env.DATABASE_URL || !env.TOKEN_SECRET || env.TOKEN_SECRET.length < 64) throw new Error('Service configuration incomplete');
 return { origin, secret: env.TOKEN_SECRET, ...smtpConfiguration(env), ...googleConfiguration(env) };
}
async function bodyOf(req, maxBytes=16384) {
 if (!String(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'JSON required');
 const length = Number(req.headers['content-length'] || 0);
 if (length > maxBytes) fail(413, 'Request too large');
 let body = req.body;
 if (body === undefined) {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > maxBytes) fail(413, 'Request too large'); }
  body = raw;
 }
 if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body ?? {})) > maxBytes) fail(413, 'Request too large');
 try { if (typeof body === 'string') body = JSON.parse(body); } catch { fail(400, 'Invalid JSON'); }
 if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Expected JSON object');
 return body;
}
async function limit(client, config, key, max, seconds) {
 const id = digest(config.secret, key);
 const result = await client.query(
  "INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<=now() THEN 1 ELSE rate_limits.count+1 END,expires_at=CASE WHEN rate_limits.expires_at<=now() THEN now()+$2*interval '1 second' ELSE rate_limits.expires_at END RETURNING count",
  [id, seconds]);
 if (result.rows[0].count > max) fail(429, 'Too many requests. Try again later.');
}
async function issue(client, config, user, kind, useOtp = false) {
 let value = kind === 'verify' || useOtp ? otp() : token();
 const previous=(await client.query('SELECT digest FROM challenges WHERE user_id=$1 AND kind=$2',[user.id,kind])).rows[0]?.digest;
 while(previous && equal(previous,digest(config.secret,user.id+':'+kind+':'+value))) value=kind==='verify'||useOtp?otp():token();
 await client.query("INSERT INTO challenges(user_id,kind,digest,expires_at) VALUES($1,$2,$3,now()+interval '15 minutes') ON CONFLICT(user_id,kind) DO UPDATE SET digest=EXCLUDED.digest,expires_at=EXCLUDED.expires_at,attempts=0",
  [user.id, kind, digest(config.secret, user.id + ':' + kind + ':' + value)]);
 return value;
}
async function session(client, req, lock = false) {
 const cookie = String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('__Host-scrm='));
 const value = cookie?.slice('__Host-scrm='.length);
 if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
 const result = await client.query('SELECT u.*,s.csrf,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()' + (lock ? ' FOR SHARE OF u,s' : ''), [hash(value)]);
 return result.rows[0] || null;
}
async function scopes(client,userId) {return (await client.query('SELECT branch,line FROM user_scopes WHERE user_id=$1 ORDER BY branch,line',[userId])).rows;}
async function permitsScope(client,user,module,data) {
 if(user.role==='admin')return true;
 if(['employees','branches'].includes(module))return false;
 const result=await client.query('SELECT 1 FROM user_scopes WHERE user_id=$1 AND branch=$2 AND line=$3',[user.id,data.scopeBranch,data.scopeLine]);
 return !!result.rowCount;
}
export const sessionCookie = (value,remember=false) => '__Host-scrm=' + value + '; Path=/; HttpOnly; Secure; SameSite=Lax' + (!value?'; Max-Age=0':remember?'; Max-Age=2592000':'');
const cookie=sessionCookie;
const oauthCookie=(value)=>'__Host-scrm-oauth='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+(value?600:0);
export function createHandler({ pool, config, deliver = message => sendEmail(config, message), googleExchange=exchangeGoogle, enqueue=()=>{} }) {
 return async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const reply = (status, result) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result)); };
  try {
   const url = new URL(req.url, config.origin);
   const route = req.query?.route || url.pathname.replace(/^\/api\/?/, '');
   if (typeof route !== 'string') fail(404, 'Not found');
   const path = route.replace(/^\/+|\/+$/g, '').split('/');
   const method = req.method;
   if (!['GET','POST','PUT','DELETE'].includes(method)) fail(405, 'Method not allowed');
   const mutation = method !== 'GET';
   if (mutation && req.headers.origin !== config.origin) fail(403, 'Request origin rejected');
   const body = mutation ? await bodyOf(req, path[0]==='business-lines'&&path[1]==='imports'&&path[2]==='analyze'?3000000:path[0]==='business-lines'?64000:16384) : {};
   // Vercel overwrites x-real-ip at its edge. Do not trust client-provided X-Forwarded-For.
   const ip = req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
   await limit(pool, config, 'all:' + ip, 600, 600);
   if (path[0] === 'auth') {
    if(path[1]==='google' && path.length===3){
     if(!config.googleId||!config.googleSecret)fail(503,'Google sign-in is not configured');
     await limit(pool,config,'google:'+ip,20,900);
     if(path[2]==='start' && method==='POST'){
      if(body.remember!==undefined && typeof body.remember!=='boolean')fail(400,'Invalid session preference');
      const state=token(),browser=token(),nonce=token(),verifier=token();
      await pool.query("INSERT INTO oauth_states(state_hash,browser_hash,nonce_hash,verifier,remember,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '10 minutes')",[hash(state),hash(browser),digest(config.secret,nonce),verifier,body.remember===true]);
      res.setHeader('Set-Cookie',oauthCookie(browser));
      return reply(200,{url:authorizationURL(config,{state,nonce,verifier})});
     }
     if(path[2]==='callback' && method==='GET'){
      res.setHeader('Set-Cookie',oauthCookie(''));
      const redirect=outcome=>{res.statusCode=303;res.setHeader('Location',config.origin+'/#auth='+outcome);res.end();};
      try {
       const state=url.searchParams.get('state'),code=url.searchParams.get('code');
       const browser=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('__Host-scrm-oauth='))?.slice('__Host-scrm-oauth='.length);
       if(!/^[a-f0-9]{64}$/.test(state||'')||!/^[a-f0-9]{64}$/.test(browser||''))return redirect('google_error');
       const saved=(await pool.query('DELETE FROM oauth_states WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>now() RETURNING *',[hash(state),hash(browser)])).rows[0];
       if(!saved||!code||code.length>4096)return redirect('google_error');
       const identity=await googleExchange(code,saved.verifier,saved.nonce_hash,config),email=emailOf(identity.email);
       // Existing password accounts are deliberately not linked by matching email.
       const encoded=await passwordHash(token());
       const outcome=await transaction(pool,async client=>{
        await client.query('SELECT pg_advisory_xact_lock(830148)');
        let account=(await client.query('SELECT u.* FROM google_identities g JOIN users u ON u.id=g.user_id WHERE g.google_sub=$1 FOR UPDATE OF u',[identity.sub])).rows[0];
        if(!account){
         if((await client.query('SELECT 1 FROM users WHERE email=$1',[email])).rowCount)return {status:'google_existing'};
         account=(await client.query("INSERT INTO users(id,email,name,password_hash,email_verified) VALUES($1,$2,$3,$4,true) RETURNING *",[randomUUID(),email,(identity.name||email).slice(0,120),encoded])).rows[0];
         await client.query('INSERT INTO google_identities(google_sub,user_id) VALUES($1,$2)',[identity.sub,account.id]);
         await audit(client,account.id,'Google registration','auth',account.id);
        }
        if(account.email!==email||!account.email_verified)return {status:'google_error'};
        if(account.status!=='approved')return {status:'google_pending'};
        const value=token(),csrf=token();
        await client.query("INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+$4*interval '1 second')",[hash(value),account.id,csrf,saved.remember?2592000:43200]);
        await audit(client,account.id,'Google login','auth',account.id);
        return {value};
       });
       if(outcome.value){res.setHeader('Set-Cookie',[oauthCookie(''),cookie(outcome.value,saved.remember)]);return redirect('google_success');}
       return redirect(outcome.status);
      }catch{return redirect('google_error');}
     }
     fail(405,'Method not allowed');
    }
    if(path.length!==2) fail(404,'Not found');
    const action = path[1];
    if(action==='options' && method==='GET')return reply(200,{googleEnabled:!!(config.googleId&&config.googleSecret)});
    if (action === 'me' && method === 'GET') {
     const user = await session(pool, req);
     if(user)user.scopes=await scopes(pool,user.id);
     return reply(200, { user: user ? publicUser(user) : null, csrf: user?.csrf });
    }
    if (method !== 'POST') fail(405, 'Method not allowed');
    if (action === 'logout') {
     const user = await session(pool, req);
     if (user && !equal(body.csrf, user.csrf)) fail(403, 'Session check failed');
     if (user) await transaction(pool, async client => {
      await client.query('DELETE FROM sessions WHERE token_hash=$1', [user.token_hash]);
      await audit(client, user.id, 'Logout', 'auth', user.id);
     });
     res.setHeader('Set-Cookie', cookie('')); return reply(200, { message: 'Signed out' });
    }
    if (!['register','login','verify','resend','forgot','reset'].includes(action)) fail(404, 'Not found');
    await limit(pool, config, 'auth-ip:' + ip, 40, 900);
    const email = emailOf(body.email);
    await limit(pool, config, action + ':email:' + email, action === 'verify' ? 10 : action === 'login' ? 10 : 5, 900);
    if (action === 'register') {
     if (!validPassword(body.password)) fail(400, 'Use a password of 12 to 128 characters');
     if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 120 || /[\u0000-\u001f\u007f]/u.test(body.name)) fail(400, 'Enter your name (up to 120 characters)');
     const encoded = await passwordHash(body.password);
     const message = await transaction(pool, async client => {
      const result = await client.query('INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING *', [randomUUID(),email,body.name.trim(),encoded]);
      if (!result.rowCount) return null;
      const user = result.rows[0], value = await issue(client, config, user, 'verify');
      await audit(client, user.id, 'Registered', 'auth', user.id);
      return { to: email, subject: 'Verify your SCRM email', text: 'Your SCRM verification code is ' + value + '. It expires in 15 minutes. Administrator approval is also required before CRM access.' };
     });
     if (message) await deliver(message);
     return reply(200, generic);
    }
    if (action === 'login') {
     if(body.remember!==undefined && typeof body.remember!=='boolean')fail(400,'Invalid session preference');
     if (typeof body.password !== 'string' || body.password.length > 128) fail(400, 'Invalid credentials');
     const result = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
     const user = result.rows[0];
     // Always perform the same password KDF for nonexistent accounts.
     const stored = user?.password_hash || '00000000000000000000000000000000:' + '0'.repeat(128);
     const matches = await passwordMatches(body.password, stored);
     if (!user || !matches) {
      await audit(pool, null, 'Login failed', 'auth', 'account');
      fail(401, 'Invalid email or password');
     }
     if (!user.email_verified) fail(403, 'Verify your email before signing in');
     if (user.status !== 'approved') fail(403, 'Administrator approval is required, or access has been suspended');
     const value = token(), csrf = token();
     await transaction(pool, async client => {
      // Serialize with admin status changes and password resets.
      const current = (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [user.id])).rows[0];
      if (current.password_hash !== stored || current.status !== 'approved' || !current.email_verified) fail(401, 'Sign in again');
      await client.query("INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES($1,$2,$3,now()+$4*interval '1 second')", [hash(value),user.id,csrf,body.remember===true?2592000:43200]);
      await audit(client, user.id, 'Login', 'auth', user.id);
     });
     user.scopes=await scopes(pool,user.id);
     res.setHeader('Set-Cookie', cookie(value,body.remember===true)); return reply(200, { user: publicUser(user), csrf });
    }
    if (action === 'resend' || action === 'forgot') {
     const kind = action === 'resend' ? 'verify' : 'reset';
     if(action==='forgot' && body.method!==undefined && !['otp','link'].includes(body.method))fail(400,'Invalid recovery method');
     const useOtp=action==='forgot' && body.method==='otp';
     const message = await transaction(pool, async client => {
      const result = await client.query('SELECT * FROM users WHERE email=$1 FOR UPDATE', [email]);
      const user = result.rows[0];
      if (!user || (kind === 'verify' ? user.email_verified : !user.email_verified)) return null;
      const value = await issue(client, config, user, kind, useOtp);
      await audit(client, user.id, kind === 'verify' ? 'Verification requested' : 'Password reset requested', 'auth', user.id);
      return { to: email, subject: kind === 'verify' ? 'Verify your SCRM email' : 'Reset your SCRM password',
       text: kind === 'verify' ? 'Your SCRM verification code is ' + value + '. It expires in 15 minutes.' :
        useOtp ? 'Your SCRM password reset code is ' + value + '. It expires in 15 minutes and can be used once. Enter it on the same CRM website where you requested it. Never share this code.\nIf you did not request this, ignore this email.' :
        'Reset your SCRM password using this single-use link within 15 minutes: ' + config.origin + '/#reset=' + value + '&email=' + encodeURIComponent(email) + '\nIf you did not request this, ignore this email.' };
     });
     if (message) await deliver(message);
     return reply(200, generic);
    }
    if (action === 'verify' || action === 'reset') {
     const kind = action === 'verify' ? 'verify' : 'reset';
     if(kind==='reset' && body.code!==undefined && body.token!==undefined)fail(400,'Use one reset method');
     const useOtp=kind==='reset' && body.code!==undefined;
     const value = kind === 'verify' || useOtp ? body.code : body.token;
     if (typeof value !== 'string' || !(kind === 'verify' || useOtp ? /^\d{6}$/ : /^[a-f0-9]{64}$/).test(value)) fail(400, 'Invalid or expired code/link');
     if (kind === 'reset' && !validPassword(body.password)) fail(400, 'Use a password of 12 to 128 characters');
     const encoded = kind === 'reset' ? await passwordHash(body.password) : null;
     const success = await transaction(pool, async client => {
      const result = await client.query('SELECT * FROM users WHERE email=$1 FOR UPDATE', [email]);
      const user = result.rows[0];
      if (!user) return false;
      const challenge = (await client.query('SELECT *,expires_at>now() AS valid FROM challenges WHERE user_id=$1 AND kind=$2 FOR UPDATE', [user.id,kind])).rows[0];
      if (!challenge || !challenge.valid || challenge.attempts >= 5) return false;
      if (!equal(challenge.digest, digest(config.secret, user.id + ':' + kind + ':' + value))) {
       await client.query('UPDATE challenges SET attempts=attempts+1 WHERE user_id=$1 AND kind=$2', [user.id,kind]);
       await audit(client,user.id,'Invalid '+kind+' challenge','auth',user.id);
       return false;
      }
      await client.query('DELETE FROM challenges WHERE user_id=$1 AND kind=$2', [user.id,kind]);
      if (kind === 'verify') await client.query('UPDATE users SET email_verified=true WHERE id=$1', [user.id]);
      else {
       await client.query('UPDATE users SET password_hash=$2 WHERE id=$1', [user.id,encoded]);
       await client.query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
      }
      await audit(client, user.id, kind === 'verify' ? 'Email verified' : 'Password reset', 'auth', user.id);
      return true;
     });
     if (!success) fail(400, 'Invalid or expired code/link');
     return reply(200, { message: kind === 'verify' ? 'Email verified. Administrator approval is required before access.' : 'Password changed. Sign in with your new password.' });
    }
   }
   // All CRM and administration operations re-read role/status from the database.
   // A shared lock serializes every write/read authorization with admin changes.
   const result = await transaction(pool, async client => {
    const user = await session(client, req, true);
    if (!user) fail(401, 'Sign in required');
    const current = (await client.query('SELECT * FROM users WHERE id=$1 FOR SHARE', [user.id])).rows[0];
    const principal = publicUser(current);
    if (!principal.emailVerified || principal.status !== 'approved') fail(403, 'Access is not approved');
    if (mutation && !equal(req.headers['x-csrf-token'], user.csrf)) fail(403, 'Session check failed');
    if (path[0] === 'search') {
     if (method !== 'GET' || path.length !== 1) fail(405, 'Method not allowed');
     await limit(client, config, 'search:' + current.id, 120, 60);
     return await searchWorkspace(client, principal, current, url);
    }
    if (path[0] === 'notifications') {
     if (method !== 'GET' || path.length !== 1) fail(405, 'Method not allowed');
     return await notificationsFeed(client, principal, current);
    }
    if (path[0] === 'business-lines') return await recordsFramework({client,user:current,path,method,url,body});
    if (path[0] === 'access') {
     if (!authorize(principal, method === 'GET' ? 'read' : 'approve', 'access')) fail(403, 'Administrator access required');
     if (method === 'GET') {
      const cursor = url.searchParams.get('cursor') || '00000000-0000-0000-0000-000000000000';
      if (cursor !== '00000000-0000-0000-0000-000000000000' && !uuid(cursor)) fail(400, 'Invalid cursor');
      const rows = (await client.query(`SELECT u.id,u.email,u.name,u.role,u.system_role,u.status,u.email_verified,COALESCE((SELECT json_agg(json_build_object('branch',s.branch,'line',s.line)) FROM user_scopes s WHERE s.user_id=u.id),'[]'::json) AS scopes FROM users u WHERE u.id>$1 ORDER BY u.id LIMIT 101`, [cursor])).rows;
      return { users: rows.slice(0,100).map(publicUser), next: rows.length>100 ? rows[99].id : null };
     }
     if (method !== 'PUT' || !uuid(path[1])) fail(400, 'Invalid access request');
     if (!['approved','rejected','suspended','pending'].includes(body.status) || !['admin','manager','member','viewer'].includes(body.role)) fail(400, 'Invalid role/status');
     if (path[1] === user.id) fail(400, 'Use another administrator to change your own access');
     // Only one admin modification at a time; avoids last-admin races.
     // Reads hold SHARE locks; admin writes use NOWAIT and can safely be retried.
     await client.query('SELECT pg_advisory_xact_lock(830147)');
     const target = (await client.query('SELECT * FROM users WHERE id=$1 FOR UPDATE NOWAIT', [path[1]])).rows[0];
     if (!target) fail(404, 'Account not found');
     if(target.system_role==='super_admin'){
      if(current.system_role!=='super_admin')fail(403,'Only a Super Admin can change this account');
      if(body.role!=='admin')fail(400,'Super Admin accounts must retain the administrator role');
      if(body.status!=='approved'&&!(await client.query("SELECT 1 FROM users WHERE system_role='super_admin' AND status='approved' AND email_verified=true AND id<>$1",[target.id])).rowCount)fail(409,'The last approved Super Admin cannot be suspended or rejected');
     }
     if (body.status === 'approved' && !target.email_verified) fail(400, 'Email verification is required');
     let assigned=await scopes(client,target.id);
     if(body.scopes!==undefined){
      if(!Array.isArray(body.scopes)||body.scopes.length>100)fail(400,'At most 100 branch/business-line pairs are allowed');
      assigned=body.scopes;
      for(const item of assigned)if(!item||typeof item.branch!=='string'||!/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(item.branch)||!['STTS','CAR','T3','GSA'].includes(item.line))fail(400,'Invalid branch/business-line assignment');
     }
     if(body.status==='approved' && body.role!=='admin' && !assigned.length)fail(400,'Assign at least one branch/business-line pair before approval');
     await client.query('DELETE FROM user_scopes WHERE user_id=$1',[target.id]);
     for(const item of assigned)await client.query('INSERT INTO user_scopes(user_id,branch,line) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[target.id,item.branch,item.line]);
     await client.query('UPDATE users SET role=$2,status=$3 WHERE id=$1', [target.id,body.role,body.status]);
     await client.query('DELETE FROM sessions WHERE user_id=$1', [target.id]);
     await audit(client,user.id,'Access changed: ' + body.role + '/' + body.status + ' scopes=' + assigned.map(item=>item.branch+':'+item.line).join(','),'access',target.id);
     return { message: 'Access updated; existing sessions revoked' };
    }
    if (path[0] === 'audit') {
     if (method !== 'GET' || !authorize(principal,'read','audit')) fail(403, 'Administrator access required');
     const rows = (await client.query('SELECT a.id,a.created_at AS time,a.action,a.module,a.record_id AS record,a.actor FROM audit a ORDER BY a.id DESC LIMIT 200')).rows;
     return { audit: rows };
    }
    if (path[0] !== 'records' || !modules.includes(path[1])) fail(404, 'Not found');
    const module = path[1], action = { GET:'read',POST:'create',PUT:'update',DELETE:'delete' }[method];
    if (!authorize(principal,action,module)) fail(403, 'You do not have permission for this action');
    if (method === 'GET') {
     const cursor = url.searchParams.get('cursor') || '00000000-0000-0000-0000-000000000000';
     if (cursor !== '00000000-0000-0000-0000-000000000000' && !uuid(cursor)) fail(400, 'Invalid cursor');
     const rows = (await client.query('SELECT id,data,version,created_at,updated_at FROM records WHERE module=$1 AND id>$2 AND ($3::boolean OR EXISTS(SELECT 1 FROM user_scopes s WHERE s.user_id=$4 AND s.branch=records.scope_branch AND s.line=records.scope_line)) ORDER BY id LIMIT 101', [module,cursor,user.role==='admin',user.id])).rows;
     return { records: rows.slice(0,100).map(r=>({...r.data,id:r.id,version:r.version,created:r.created_at.toISOString().slice(0,10)})), next: rows.length>100 ? rows[99].id : null };
    }
    if (method === 'POST') {
     let data; try { data=validateRecord(module,body); } catch(error) { fail(400,error.message); }
     await validateBusinessLineReferences(client,module,data);
     if(!await permitsScope(client,user,module,data))fail(403,'This branch/business-line pair is not assigned to your account');
     const id = randomUUID();
     await client.query('INSERT INTO records(id,module,data,created_by,updated_by,scope_branch,scope_line) VALUES($1,$2,$3,$4,$4,$5,$6)',[id,module,data,user.id,data.scopeBranch||'',data.scopeLine||'']);
     await audit(client,user.id,'Created',module,id);
     return { record:{...data,id,version:1} };
    }
    if (!uuid(path[2]) || !Number.isInteger(body.version)) fail(400, 'Record ID and version are required');
    const existing = (await client.query('SELECT * FROM records WHERE id=$1 AND module=$2 FOR UPDATE',[path[2],module])).rows[0];
    if (!existing || !await permitsScope(client,user,module,{scopeBranch:existing.scope_branch,scopeLine:existing.scope_line})) fail(404,'Record not found');
    if (existing.version !== body.version) fail(409,'This record changed. Refresh and try again.');
    if (method === 'DELETE') {
     await client.query('DELETE FROM records WHERE id=$1',[existing.id]);
     await audit(client,user.id,'Deleted',module,existing.id); return {message:'Record deleted'};
    }
    let data; try { data=validateRecord(module,body.data); } catch(error) { fail(400,error.message); }
    await validateBusinessLineReferences(client,module,data);
    if(!await permitsScope(client,user,module,data))fail(403,'This branch/business-line pair is not assigned to your account');
    if(user.role!=='admin'&&(data.scopeBranch!==existing.scope_branch||data.scopeLine!==existing.scope_line))fail(403,'Only administrators can move records between access scopes');
    await client.query('UPDATE records SET data=$2,version=version+1,updated_by=$3,updated_at=now(),scope_branch=$4,scope_line=$5 WHERE id=$1',[existing.id,data,user.id,data.scopeBranch||'',data.scopeLine||'']);
    await audit(client,user.id,'Updated',module,existing.id);
    return {record:{...data,id:existing.id,version:existing.version+1}};
   });
   if(result?.workJob){const jobId=result.workJob;delete result.workJob;enqueue(jobId);}
   return reply(200,result);
  } catch (error) {
   if (error.code === '55P03' || error.code === '40P01') return reply(409,{error:'Access changed concurrently. Retry the request.'});
   if (!error.status) console.error('SCRM request failed', {code: error.code || 'internal'});
   return reply(error.status || 503,{error:error.status ? error.message : 'Service unavailable. Please try again later.'});
  }
 };
}
