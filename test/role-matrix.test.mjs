import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateRoleMatrix,roleMatrix,roleActions,recordScopes} from '../server/role-matrix.mjs';
const admin={id:'11111111-1111-4111-8111-111111111111',system_role:'super_admin',role:'admin',status:'approved',email_verified:true};
const standard={...admin,system_role:'user',role:'member'};
const allow=[{key:'LEADS',eligible:true,locked:false,essential:false},{key:'BOOKINGS',eligible:false,locked:false,essential:false},{key:'PROFILE',eligible:true,locked:true,essential:true}];
test('All promised Role Matrix actions and scopes are present',()=>{
 for(const x of ['View','Create','Edit','Delete','Archive','Restore','Import','Export','Approve','Assign','Bulk Update'])assert.ok(roleActions.includes(x));
 assert.deepEqual(recordScopes,['None','My Records','Team','Branch']);
});
test('Module Master ineligible resource cannot be granted by Role Matrix',()=>{
 assert.throws(()=>validateRoleMatrix({BOOKINGS:{actions:['View'],scope:'Branch'}},{},allow),/blocked/);
 assert.throws(()=>validateRoleMatrix({PROFILE:{actions:['View'],scope:'Branch'}},{},allow),/blocked/);
});
test('Role must include View and meaningful scope before granting actions',()=>{
 assert.throws(()=>validateRoleMatrix({LEADS:{actions:['Edit'],scope:'Branch'}},{},allow),/View required/);
 assert.throws(()=>validateRoleMatrix({LEADS:{actions:['View'],scope:'None'}},{},allow),/record scope/i);
 assert.throws(()=>validateRoleMatrix({LEADS:{actions:['View','View'],scope:'Branch'}},{},allow),/Invalid actions/);
 const x=validateRoleMatrix({LEADS:{actions:['View','Create'],scope:'My Records'}},{},allow);
 assert.equal(x.permissions.LEADS.scope,'My Records');
});
test('Fields require View, known schema and cannot elevate locked access scope fields',()=>{
 assert.throws(()=>validateRoleMatrix({}, {LEADS:{name:'Editable'}},allow),/require.*View/i);
 assert.throws(()=>validateRoleMatrix({LEADS:{actions:['View'],scope:'Team'}},{LEADS:{scopeBranch:'Editable'}},allow),/locked/);
 assert.throws(()=>validateRoleMatrix({LEADS:{actions:['View'],scope:'Team'}},{LEADS:{unexpected:'Hidden'}},allow),/Unexpected/);
 const x=validateRoleMatrix({LEADS:{actions:['View'],scope:'Team'}},{LEADS:{name:'Read Only'}},allow);
 assert.equal(x.fields.LEADS.name,'Read Only');
});
test('Non-administrators cannot read or create permission roles',async()=>{
 const client={query:async()=>{throw Error('Database should not be touched')}};
 const url=new URL('https://crm.invalid/api/role-matrix');
 await assert.rejects(()=>roleMatrix({client,user:standard,path:['role-matrix'],method:'GET',url}),/Admin/);
 await assert.rejects(()=>roleMatrix({client,user:standard,path:['role-matrix'],method:'POST',url,body:{}}),/Admin/);
});
test('Migration 015 is additive, auditable and independent of user assignments',async()=>{
 const sql=await readFile(new URL('../db/015_permission_role_matrix.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS crm_permission_roles/);
 assert.match(sql,/REFERENCES department_units\(id\)/);
 assert.match(sql,/crm_permission_role_events_append_only_v15/);
 assert.match(sql,/VALUES\(15\)/);
 assert.doesNotMatch(sql,/ALTER TABLE users|UPDATE users SET|INSERT INTO user_scopes|DROP TABLE|TRUNCATE/i);
});
