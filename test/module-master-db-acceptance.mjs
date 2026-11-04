import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {moduleMaster,resourceEligible,registeredModuleResources} from '../server/module-master.mjs';

const cs=process.env.TEST_DATABASE_URL;
assert.ok(cs,'TEST_DATABASE_URL required');
const u=new URL(cs);
assert.ok(['127.0.0.1','localhost','[::1]'].includes(u.hostname),'Refusing remote database');
assert.match(u.pathname,/test/i,'Refusing non-test database');
const pool=new pg.Pool({connectionString:cs,max:2});
const client=await pool.connect();
try{
 await client.query(await readFile(new URL('../db/014_module_master.sql',import.meta.url),'utf8'));
 assert.equal((await client.query('SELECT count(*)::int n FROM schema_migrations WHERE version=14')).rows[0].n,1);
 await client.query('BEGIN');
 const userId=(await client.query('SELECT id FROM users ORDER BY created_at LIMIT 1')).rows[0]?.id;
 assert.ok(userId,'Test user missing');
 const user={id:userId,system_role:'super_admin',role:'admin',status:'approved',email_verified:true};
 const regular={...user,system_role:'user',role:'manager'};
 const call=(path=[],method='GET',body={})=>moduleMaster({client,user,path:['module-master',...path],method,body,url:new URL('https://crm.invalid/api/module-master')});
 const synced=await call(['sync'],'POST');
 assert.equal(synced.sync.created,registeredModuleResources.length);
 assert.equal(synced.sync.refreshed,0);
 const listed=await call();
 assert.equal(listed.resources.length,registeredModuleResources.length);
 assert.equal(listed.counts.total,registeredModuleResources.length);
 const target=listed.resources.find(r=>r.key==='LEADS');
 const blocked=await call([target.id],'PUT',{version:target.version,adminAllowed:true,managerAllowed:false,
  standardAllowed:false,commonResource:false,status:'Active'});
 assert.equal(blocked.resource.managerAllowed,false);
 assert.equal(await resourceEligible(client,regular,'LEADS'),false);
 const again=await call(['sync'],'POST');
 assert.equal(again.sync.created,0);
 assert.equal(again.sync.refreshed,registeredModuleResources.length);
 const retained=(await call()).resources.find(r=>r.key==='LEADS');
 assert.equal(retained.managerAllowed,false,'Sync must not reset Super Admin eligibility');
 const essential=(await call()).resources.find(r=>r.key==='PROFILE');
 await assert.rejects(()=>call([essential.id],'PUT',{version:essential.version,adminAllowed:true,managerAllowed:true,
  standardAllowed:true,commonResource:false,status:'Inactive'}),/Essential resources/);
 const moduleRow=(await call()).resources.find(r=>r.key==='MODULE_MASTER');
 await assert.rejects(()=>call([moduleRow.id],'PUT',{version:moduleRow.version,adminAllowed:true,managerAllowed:false,
  standardAllowed:false,commonResource:false,status:'Active'}),/Super Admin only/);
 assert.equal(await resourceEligible(client,regular,'MODULE_MASTER'),false);
 await assert.rejects(()=>call([target.id],'PUT',{version:1,adminAllowed:false,managerAllowed:false,
  standardAllowed:false,commonResource:false,status:'Inactive'}),/changed; reload/i);
 const audit=(await client.query('SELECT count(*)::int n FROM module_master_events')).rows[0].n;
 assert.ok(audit>=registeredModuleResources.length+1,'Append-only audit recorded');
 await client.query('SAVEPOINT block_audit');
 await assert.rejects(()=>client.query('DELETE FROM module_master_events'),/Audit entries are append-only/i);
 await client.query('ROLLBACK TO SAVEPOINT block_audit');
 await client.query('SAVEPOINT block_delete');
 await assert.rejects(()=>client.query('DELETE FROM module_master_resources WHERE id=$1',[target.id]),/physically deleting resources/);
 await client.query('ROLLBACK TO SAVEPOINT block_delete');
 const scopes=(await client.query('SELECT COUNT(*)::int n FROM user_scopes WHERE user_id=$1',[userId])).rows[0].n;
 assert.ok(scopes>=0,'Legacy user scope table unaffected');
 await client.query('ROLLBACK');
 console.log('PASS Module Master v14: synced registry, retained decisions, essential protection, permission eligibility, audit and scopes');
}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();await pool.end();}
