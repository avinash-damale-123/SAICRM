import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {moduleMaster} from '../server/module-master.mjs';
import {roleMatrix} from '../server/role-matrix.mjs';

const cs=process.env.TEST_DATABASE_URL;assert.ok(cs,'TEST_DATABASE_URL required');
const u=new URL(cs);assert.ok(['localhost','127.0.0.1','[::1]'].includes(u.hostname),'Refusing remote database');
assert.match(u.pathname,/test/i,'Refusing production database');
const pool=new pg.Pool({connectionString:cs,max:2}),client=await pool.connect();
try{
 await client.query(await readFile(new URL('../db/015_permission_role_matrix.sql',import.meta.url),'utf8'));
 assert.equal((await client.query('SELECT count(*)::int n FROM schema_migrations WHERE version=15')).rows[0].n,1);
 await client.query('BEGIN');
 const id=(await client.query('SELECT id FROM users ORDER BY created_at LIMIT 1')).rows[0]?.id;
 assert.ok(id,'Fixture user missing');
 const admin={id,system_role:'super_admin',role:'admin',status:'approved',email_verified:true};
 const dept=randomUUID();
 await client.query('INSERT INTO department_units(id,scope,level,name,code,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6)',
  [dept,'Central','Department','Permission Matrix QA','PM-QA',id]);
 await moduleMaster({client,user:admin,path:['module-master','sync'],method:'POST',url:new URL('https://crm.invalid/api/module-master')});
 const call=(path=[],method='GET',body={})=>roleMatrix({client,user:admin,path:['role-matrix',...path],method,body,url:new URL('https://crm.invalid/api/role-matrix')});
 const setup=await call(['setup']);
 assert.ok(setup.departments.find(d=>d.id===dept));
 assert.ok(setup.resources.Admin.find(x=>x.key==='LEADS').eligible);
 assert.ok(setup.resources.Manager.find(x=>x.key==='BUSINESS_LINES'&&!x.eligible));
 const body={name:'QA Sales Analyst',code:'QASA',departmentId:dept,userType:'Admin',
  description:'CRM access configuration',permissions:{LEADS:{actions:['View','Edit'],scope:'Branch'}},
  fields:{LEADS:{name:'Read Only',scopeBranch:'Read Only'}}};
 const role=(await call([],'POST',body)).role;
 assert.match(role.displayId,/^PR-\d{3,}$/);
 assert.equal(role.userType,'Admin');
 assert.equal(role.fields.LEADS.name,'Read Only');
 assert.equal((await call()).roles.length>=1,true);
 const next=(await call([role.id],'PUT',{version:role.version,permissions:{LEADS:{actions:['View'],scope:'My Records'}},fields:{LEADS:{name:'Hidden'}}})).role;
 assert.equal(next.version,role.version+1);
 assert.equal(next.fields.LEADS.name,'Hidden');
 assert.equal((await call([role.id,'history'])).history.length,2);
 const module=(await client.query("SELECT id,version FROM module_master_resources WHERE resource_key='LEADS'")).rows[0];
 await moduleMaster({client,user:admin,path:['module-master',module.id],method:'PUT',url:new URL('https://crm.invalid'),
  body:{version:module.version,adminAllowed:false,managerAllowed:false,standardAllowed:false,commonResource:false,status:'Active'}});
 await assert.rejects(()=>call([],'POST',{...body,code:'QASA2'}),/blocked/i);
 await client.query('SAVEPOINT role_audit');
 await assert.rejects(()=>client.query('DELETE FROM crm_permission_role_events WHERE permission_role_id=$1',[role.id]),/Audit entries are append-only/i);
 await client.query('ROLLBACK TO SAVEPOINT role_audit');
 await client.query('SAVEPOINT role_delete');
 await assert.rejects(()=>client.query('DELETE FROM crm_permission_roles WHERE id=$1',[role.id]),/history/i);
 await client.query('ROLLBACK TO SAVEPOINT role_delete');
 assert.equal((await client.query('SELECT COUNT(*)::int n FROM user_scopes WHERE user_id=$1',[id])).rows[0].n>=0,true);
 await client.query('ROLLBACK');
 console.log('PASS Role Matrix v15: department, tier, action, scope, field, audit and Module Master blocks');
}catch(err){await client.query('ROLLBACK').catch(()=>{});throw err;}finally{client.release();await pool.end();}
