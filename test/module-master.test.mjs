import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registeredModuleResources,resourceEligible,moduleMaster,eligibleResourceKeys} from '../server/module-master.mjs';

const admin={id:'11111111-1111-4111-8111-111111111111',role:'admin',system_role:'super_admin',status:'approved',email_verified:true};
const manager={...admin,role:'manager',system_role:'user'};
const ordinary={...admin,role:'member',system_role:'user'};
const url=new URL('https://crm.invalid/api/module-master');
const call=(client,user,path=['module-master'],method='GET',body={})=>moduleMaster({client,user,path,method,body,url});
test('Registry contains required essential resources, master endpoints and operational modules',()=>{
 const keys=new Set(registeredModuleResources.map(x=>x.key));
 assert.equal(keys.size,registeredModuleResources.length);
 for(const x of ['MODULE_MASTER','PROFILE','AUTH_LOGIN','AUTH_LOGOUT','BUSINESS_LINES','REGIONS','BRANCH_MASTER','REPORTING_HIERARCHY_MASTER','LEADS','BOOKINGS'])assert.ok(keys.has(x));
 assert.ok(registeredModuleResources.find(x=>x.key==='PROFILE').essential);
 assert.equal(registeredModuleResources.find(x=>x.key==='MODULE_MASTER').admin,false);
});
test('Module Master is inaccessible to all except approved, verified Super Admin',async()=>{
 const c={query:async()=>{throw Error('DB should not be touched')}};
 await assert.rejects(()=>call(c,manager),/Super Admin/);
 await assert.rejects(()=>call(c,ordinary,['module-master','sync'],'POST'),/Super Admin/);
 await assert.rejects(()=>call(c,{...admin,email_verified:false}),/Super Admin/);
});
test('Unregistered resource is never granted; Super Admin cannot be denied',async()=>{
 let queries=0;
 const client={query:async()=>{queries++;return {rows:[]}}};
 assert.equal(await resourceEligible(client,admin,'MODULE_MASTER'),true);
 assert.equal(await resourceEligible(client,ordinary,'SUSPICIOUS_UNREGISTERED_PAGE'),false);
 assert.equal(queries,0);
});
test('Module Master denies a disabled resource even if previously eligible by user type',async()=>{
 const client={query:async()=>({rows:[{status:'Active',essential:false,common_resource:false,admin_allowed:true,manager_allowed:false,standard_allowed:false}]})};
 assert.equal(await resourceEligible(client,manager,'LEADS'),false);
 assert.equal(await resourceEligible(client,{...ordinary,role:'admin'},'LEADS'),true);
});
test('Essential resources remain eligible even when an accidental config row conflicts',async()=>{
 const client={query:async()=>({rows:[{status:'Inactive',essential:true,common_resource:false,standard_allowed:false}]})};
 assert.equal(await resourceEligible(client,ordinary,'PROFILE'),true);
});
test('Server-issued eligibility matches configured user tier',async()=>{
 const client={query:async()=>({rows:[{resource_key:'LEADS',status:'Active',essential:false,common_resource:false,
 admin_allowed:true,manager_allowed:false,standard_allowed:false}]})};
 const keys=await eligibleResourceKeys(client,manager);
 assert.equal(keys.includes('LEADS'),false);
 assert.equal(keys.includes('PROFILE'),true);
});
test('Migration 014 enforces immutable identity, essential access and append-only audit',async()=>{
 const sql=await readFile(new URL('../db/014_module_master.sql',import.meta.url),'utf8');
 assert.match(sql,/module_master_resources/);
 assert.match(sql,/module_master_events_append_only_v14/);
 assert.match(sql,/Essential resources cannot be disabled/);
 assert.match(sql,/INSERT INTO schema_migrations\(version\) VALUES\(14\)/);
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|ALTER TABLE users|UPDATE users SET/i);
});
test('Invalid eligibility payload rejected without writing records',async()=>{
 const c={query:async s=>s.includes('pg_advisory')?{rows:[]}:{rows:[]}};
 await assert.rejects(()=>call(c,admin,['module-master','test'],'PUT',{version:1,adminAllowed:true,managerAllowed:true,standardAllowed:true,commonResource:true,status:'Active',role:'superadmin'}),/Unknown field/);
});
