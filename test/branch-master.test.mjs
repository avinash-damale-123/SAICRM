import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fieldKeys,queryOptions,compileWhere,compileOrder,publicColumns,defaultColumns} from '../server/branch-master-schema.mjs';
import {baseline,validatePolicy,moduleKey} from '../server/branch-master-policy.mjs';
import {branchMasterPermissions} from '../server/resources.mjs';
import {branchMasters,branchMasterView} from '../server/branch-masters.mjs';
import {importFields,template} from '../server/branch-master-files.mjs';
const admin={id:'11111111-1111-4111-8111-111111111111',system_role:'super_admin',email_verified:true,status:'approved',role:'admin'};
const makeClient=()=>{const queries=[];return {queries,query:async(sql,args=[])=>{queries.push({sql,args});return {rowCount:0,rows:[]};}};};
test('Branch Master provides 50 field concepts and Business Line/Region/Country defaults',()=>{
 assert.equal(fieldKeys.length,50);
 assert.equal(new Set(fieldKeys).size,50);
 for(const key of ['name','displayId','businessLine','region','country','code','timeZone','status','owner','updatedAt','deactivatedAt','isArchived','isDeleted'])assert.ok(fieldKeys.includes(key));
 assert.equal(moduleKey,'branch-master');
 assert.deepEqual(defaultColumns.slice(0,5),['name','displayId','businessLine','region','country']);
 assert.equal(validatePolicy(baseline()).order.length,50);
 assert.ok(publicColumns().every(f=>!('sql' in f)));
});
test('Access is restricted to verified approved Super Admin and never physical delete',()=>{
 assert.equal(branchMasterPermissions(admin).create,true);
 assert.equal(branchMasterPermissions({...admin,system_role:'user'}).create,false);
 assert.equal(branchMasterPermissions({...admin,email_verified:false}).read,false);
 assert.equal(branchMasterPermissions(admin).delete,false);
});
test('Branch search is parameterized, sortable and excludes other table fields',()=>{
 const attack="x' OR 1=1 --";
 const opts=queryOptions({q:attack});
 const where=compileWhere(opts);
 assert.ok(where.params.includes("OR")&&where.params.includes("1=1"));
 assert.ok(!where.sql.includes(attack));
 assert.match(compileOrder(opts.sorts),/r\.updated_at/);
});
test('Branch requires a valid parent trio and globally valid Branch Code',async()=>{
 const client=makeClient(),body={businessLineRef:'22222222-2222-4222-8222-222222222222',regionRef:'33333333-3333-4333-8333-333333333333',countryRef:'44444444-4444-4444-8444-444444444444',name:'Nairobi',code:'NBO',city:'Nairobi',timeZone:'Africa/Nairobi'};
 const attempt=change=>branchMasters({client,user:admin,method:'POST',path:['branch-master'],url:new URL('https://crm.invalid/api/branch-master'),body:{...body,...change}});
 await assert.rejects(attempt({code:'BAD CODE'}),/Branch Code/);
 await assert.rejects(attempt({timeZone:'Not-A-Timezone'}),/Time Zone/);
 await assert.rejects(attempt({regionRef:'bad'}),/mandatory/);
 assert.ok(!client.queries.some(x=>x.sql.startsWith('INSERT INTO branch_masters')));
});
test('Import uses permanent Branch ID and Business Line/Region/Country codes',async()=>{
 const csv=await template('csv');assert.match(csv.bytes.toString('utf8'),/Business Line Code/);
 for(const key of ['displayId','businessLineCode','regionCode','countryCode','name','city','timeZone'])assert.ok(importFields.some(f=>f.key===key));
});
test('Branch migration is isolated from legacy generic branch records',async()=>{
 const sql=await readFile(new URL('../db/010_branch_master.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS branch_masters/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS branch_master_events/);
 assert.match(sql,/country_business_lines/);
 assert.match(sql,/prevent_active_branch_dependency_v10/);
 assert.ok(!/UPDATE records\s/i.test(sql));
 assert.match(sql,/schema_migrations\(version\) VALUES\(10\)/);
});
