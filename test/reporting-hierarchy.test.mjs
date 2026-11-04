import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {reportingHierarchyMaster} from '../server/reporting-hierarchy-master.mjs';
import {reportingHierarchyPermissions,reportingHierarchyResource,resources} from '../server/resources.mjs';

const admin={id:'11111111-1111-4111-8111-111111111111',system_role:'super_admin',email_verified:true,status:'approved'};
const guest={...admin,system_role:'user'};
const req=(suffix='',method='GET',body={},q='')=>({client:{query:async()=>({rows:[],rowCount:0})},user:admin,path:['reporting-hierarchy',...suffix.split('/').filter(Boolean)],method,body,url:new URL('https://crm.invalid/api/reporting-hierarchy'+(q?'?'+q:''))});
const parent='22222222-2222-4222-8222-222222222222',child='33333333-3333-4333-8333-333333333333';
const valid={hierarchyType:'Administrative',applicability:'Branch',scopeLevel:'Global',parentRoleId:parent,childRoleId:child};
test('Reporting Hierarchy is restricted independently of Organizational Roles and access roles',()=>{
 assert.equal(reportingHierarchyResource.key,'REPORTING_HIERARCHY_MASTER');
 assert.ok(resources.find(x=>x.key===reportingHierarchyResource.key));
 assert.equal(reportingHierarchyPermissions(admin).create,true);
 assert.equal(reportingHierarchyPermissions(guest).read,false);
 assert.equal(reportingHierarchyPermissions(admin).delete,false);
});
test('Unverified users cannot inspect references or create reporting configurations',async()=>{
 let touched=false;const client={query:async()=>{touched=true;throw Error('DB must not be touched')}};
 for(const path of [['reporting-hierarchy'],['reporting-hierarchy','references']]){
  await assert.rejects(()=>reportingHierarchyMaster({client,user:guest,path,method:'GET',url:new URL('https://crm.invalid')}),/permission/i);
 }
 await assert.rejects(()=>reportingHierarchyMaster({client,user:guest,path:['reporting-hierarchy'],method:'POST',body:valid,url:new URL('https://crm.invalid')}),/permission/i);
 assert.equal(touched,false);
});
test('Input rejects self-reporting, unknown types and invalid reference scopes',async()=>{
 for(const data of [
  {...valid,parentRoleId:child},
  {...valid,hierarchyType:'Matrix Manager'},
  {...valid,childRoleId:parent},
  {...valid,scopeLevel:'Branch',scopeId:'not-a-uuid'},
  {...valid,scopeLevel:'Region',applicability:'Central',scopeId:parent},
  {...valid,permissionRole:'super_admin'}
 ]){
  const client={query:async sql=>sql.includes('pg_advisory_xact_lock')?{rows:[{}]}:{rows:[],rowCount:0}};
  await assert.rejects(()=>reportingHierarchyMaster({client,user:admin,path:['reporting-hierarchy'],method:'POST',body:data,url:new URL('https://crm.invalid')}),/(Role|hierarchy|scope|field|Administrative|Functional)/i);
 }
});
test('List rejects bad page size and invalid filter enumeration',async()=>{
 const client={query:async()=>({rows:[],rowCount:0})};
 for(const q of ['pageSize=999','type=Payroll','scope=Office','applicability=Both'])
  await assert.rejects(()=>reportingHierarchyMaster({...req('','GET',{},q),client}),/(pagination|filter)/i);
});
test('Migration is additive and prevents cycles, repeated Administrative parents and hard deletions',async()=>{
 const sql=await readFile(new URL('../db/013_reporting_hierarchy_master.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS reporting_hierarchy_rules/);
 assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS reporting_hierarchy_admin_parent_active_v13/);
 assert.match(sql,/WITH RECURSIVE descendants/);
 assert.match(sql,/block_reporting_hierarchy_removal_v13/);
 assert.match(sql,/reporting_hierarchy_events_append_only_v13/);
 assert.match(sql,/INSERT INTO schema_migrations\(version\) VALUES\(13\)/);
 assert.doesNotMatch(sql,/ALTER TABLE users|UPDATE users SET|DROP TABLE|TRUNCATE/i);
});
