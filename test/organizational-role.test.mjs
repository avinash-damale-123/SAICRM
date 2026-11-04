import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {organizationalRoleMaster} from '../server/organizational-role-master.mjs';
import {organizationalRolePermissions,organizationalRoleResource,resources} from '../server/resources.mjs';
const admin={id:'11111111-1111-4111-8111-111111111111',system_role:'super_admin',email_verified:true,status:'approved'};
const ordinary={...admin,system_role:'user'};
const request=(path='',method='GET',body={})=>({path:['organizational-roles',...path.split('/').filter(Boolean)],method,
 url:new URL('https://crm.invalid/api/organizational-roles'+(path?'/'+path:'')),body});
const mock=()=>{const sql=[];return {sql,query:async(s,p=[])=>{sql.push({s,p});return {rows:[],rowCount:0};}};};
test('Organizational Role is a separate privileged, non-permission-bearing resource',()=>{
 assert.equal(organizationalRoleResource.key,'ORGANIZATIONAL_ROLE_MASTER');
 assert.ok(resources.find(r=>r.key===organizationalRoleResource.key));
 assert.equal(organizationalRolePermissions(admin).read,true);
 assert.equal(organizationalRolePermissions(ordinary).read,false);
 assert.equal(organizationalRolePermissions({...admin,status:'pending'}).create,false);
 assert.equal(organizationalRolePermissions(admin).delete,false);
 assert.equal(organizationalRoleResource.supportsImport,false);
});
test('Non-Super-Admin cannot query Organizational Roles or mutate the database',async()=>{
 const c=mock();
 await assert.rejects(()=>organizationalRoleMaster({client:c,user:ordinary,...request()}),/permission/i);
 await assert.rejects(()=>organizationalRoleMaster({client:c,user:ordinary,...request('', 'POST',{name:'Analyst',code:'ANL',applicability:'Both'})}),/permission/i);
 assert.equal(c.sql.length,0);
});
test('Create rejects invalid codes, status grants and unapproved fields',async()=>{
 const c=mock(),data={name:'Branch Manager',code:'BM',applicability:'Branch'};
 await assert.rejects(()=>organizationalRoleMaster({client:c,user:admin,...request('','POST',{...data,code:'! invalid'})}),/Role Code/);
 await assert.rejects(()=>organizationalRoleMaster({client:c,user:admin,...request('','POST',{...data,permissionRole:'super_admin'})}),/Unknown/);
 await assert.rejects(()=>organizationalRoleMaster({client:c,user:admin,...request('','POST',{...data,applicability:'Worldwide'})}),/Central, Branch or Both/);
 assert.equal(c.sql.filter(x=>x.s.startsWith('INSERT INTO organizational_roles')).length,0);
});
test('Invalid pagination and lifecycle targets are rejected',async()=>{
 const c=mock();
 await assert.rejects(()=>organizationalRoleMaster({client:c,user:admin,...request(),url:new URL('https://crm.invalid/api/organizational-roles?pageSize=10000')}),/pagination/);
 await assert.rejects(()=>organizationalRoleMaster({client:c,user:admin,...request(),url:new URL('https://crm.invalid/api/organizational-roles?status=AllUsers')}),/filters/);
 await assert.rejects(()=>organizationalRoleMaster({client:c,user:admin,...request('not-uuid','GET')}),/identifier/);
});
test('Migration 012 is additive, audited, and does not change existing user permissions',async()=>{
 const sql=await readFile(new URL('../db/012_organizational_role_master.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS organizational_roles/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS organizational_role_events/);
 assert.match(sql,/CREATE OR REPLACE TRIGGER organizational_role_events_append_only_v12/);
 assert.match(sql,/INSERT INTO schema_migrations\(version\) VALUES\(12\)/);
 assert.doesNotMatch(sql,/ALTER TABLE users|UPDATE users SET|DROP TABLE|TRUNCATE/i);
});
