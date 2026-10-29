import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {departmentMaster} from '../server/department-master.mjs';
import {departmentPermissions,departmentResource,resources} from '../server/resources.mjs';
const admin={id:'11111111-1111-4111-8111-111111111111',system_role:'super_admin',email_verified:true,status:'approved'};
const rejected={...admin,system_role:'user'};
const url=x=>new URL('https://crm.invalid/api/department-master'+x);
const mock=()=>{const sql=[];return {sql,query:async(s,p=[])=>{sql.push({s,p});return {rows:[],rowCount:0}}};};
test('Department resource and privileged access are isolated',()=>{
 assert.equal(departmentResource.key,'DEPARTMENT_MASTER');
 assert.ok(resources.some(x=>x.key===departmentResource.key));
 assert.equal(departmentPermissions(admin).read,true);
 assert.equal(departmentPermissions(rejected).read,false);
 assert.equal(departmentPermissions({...admin,status:'pending'}).create,false);
 assert.equal(departmentPermissions(admin).import,false);
});
test('Anonymous or ordinary users cannot read Department records',async()=>{
 const client=mock();await assert.rejects(()=>departmentMaster({client,user:rejected,path:['department-master'],method:'GET',url:url('')}),/permission/);
 assert.equal(client.sql.length,0);
});
test('Department create rejects invalid parent or code before INSERT',async()=>{
 const client=mock(),base={scope:'Branch',level:'Department',name:'Operations',code:'OPS-01'};
 await assert.rejects(()=>departmentMaster({client,user:admin,path:['department-master'],method:'POST',url:url(''),body:{...base,code:'ops space'}}),/Code/);
 await assert.rejects(()=>departmentMaster({client,user:admin,path:['department-master'],method:'POST',url:url(''),body:{...base,level:'Team'}}),/parent/i);
 await assert.rejects(()=>departmentMaster({client,user:admin,path:['department-master'],method:'POST',url:url(''),body:{...base,secretGrant:true}}),/Unknown/);
 assert.equal(client.sql.filter(x=>x.s.startsWith('INSERT INTO department_units')).length,0);
});
test('Department migration is additive, uses parent trigger, and protects Branch hierarchy',async()=>{
 const sql=await readFile(new URL('../db/011_department_master.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS department_units/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS department_branch_assignments/);
 assert.match(sql,/validate_department_unit_v11/);
 assert.match(sql,/protect_branch_department_assignments_v11/);
 assert.match(sql,/schema_migrations\(version\) VALUES\(11\)/);
 assert.doesNotMatch(sql,/UPDATE records\s+SET/i);
});
test('Department page and assets are wired with an authenticated controller',async()=>{
 const [index,app,auth,build]=await Promise.all(['index.html','app.js','auth.js','scripts/build.mjs'].map(f=>readFile(new URL('../'+f,import.meta.url),'utf8')));
 assert.match(index,/department-master-ui\.js/);
 assert.match(index,/department-master\.css/);
 assert.match(app,/SCRMDepartmentMaster/);
 assert.match(auth,/module==='departmentmaster'/);
 assert.match(build,/'department-master-ui\.js'/);
});
