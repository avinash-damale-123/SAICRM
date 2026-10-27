import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fieldKeys,queryOptions,compileWhere,compileOrder,normalizeFilters,publicColumns} from '../server/region-records-schema.mjs';
import {baseline,effectivePolicy,reconcilePreferences,validatePolicy,moduleKey} from '../server/region-records-policy.mjs';
import {regionPermissions,regionResource} from '../server/resources.mjs';
import {regions,regionView} from '../server/regions.mjs';
import {importFields,template,parseCSV} from '../server/region-records-files.mjs';

const superAdmin={id:'11111111-1111-4111-8111-111111111111',system_role:'super_admin',email_verified:true,status:'approved',role:'admin'};
const admin={...superAdmin,system_role:'user'};
const endpoint='https://crm.invalid/api/regions';

test('Region Master declares all 22 finalized fields and eight data default columns',()=>{
 assert.equal(fieldKeys.length,22);
 assert.equal(new Set(fieldKeys).size,22);
 assert.deepEqual(fieldKeys.slice(0,8),['name','displayId','businessLine','businessLineId','code','regionalManager','remarks','status']);
 assert.deepEqual(baseline().roles.super_admin.defaults,['name','displayId','businessLine','code','regionalManager','status','owner','updatedAt']);
 assert.ok(fieldKeys.includes('archivedAt'));
 assert.ok(fieldKeys.includes('deletedAt'));
 assert.ok(publicColumns().every(field=>!('sql' in field)));
 assert.equal(moduleKey,'regions');
 assert.equal(regionResource.key,'REGIONS');
});

test('Region access uses centralized approved admin eligibility and never hard-delete permission',()=>{
 assert.equal(regionPermissions(superAdmin).create,true);
 assert.equal(regionPermissions(admin).read,true);
 assert.equal(regionPermissions({...admin,role:'manager'}).read,false);
 assert.equal(regionPermissions({...admin,email_verified:false}).read,false);
 assert.equal(regionPermissions({...admin,status:'pending'}).read,false);
 assert.equal(regionPermissions(admin).delete,false);
});

test('Region search, filters and sorting compile parameterized SQL only',()=>{
 const attack="%' OR 1=1 --";
 const query=queryOptions({q:attack,filters:{logic:'and',conditions:[{field:'name',operator:'contains',value:attack},{field:'businessLine',operator:'contains',value:'STTS'},{field:'status',operator:'equals',value:'Active'}]},sorts:[{field:'updatedAt',direction:'desc'}]});
 const compiled=compileWhere(query);
 assert.ok(compiled.params.includes(attack));
 assert.ok(!compiled.sql.includes(attack));
 assert.match(compiled.sql,/bl\.name/);
 assert.match(compileOrder(query.sorts),/r\.updated_at DESC NULLS LAST,r\.id ASC/);
 assert.throws(()=>queryOptions({sorts:[{field:'name;DROP TABLE users',direction:'asc'}]}));
 assert.throws(()=>normalizeFilters([{field:'status',operator:'equals',value:'Unknown'}]));
});

test('Region table/filter preferences preserve immutable identity columns',()=>{
 const policy=baseline();
 assert.deepEqual(validatePolicy(policy).locked,['name','displayId']);
 const effective=effectivePolicy({version:0,publishedVersion:0,config:policy},superAdmin);
 assert.ok(effective.allowed.includes('businessLineId'));
 assert.ok(effective.filters.quick.includes('businessLine'));
 const prefs=reconcilePreferences({selectedColumns:['remarks'],active:'custom'},effective);
 assert.ok(prefs.selectedColumns.includes('displayId'));
 assert.ok(prefs.selectedColumns.includes('name'));
 assert.throws(()=>validatePolicy({...policy,locked:['displayId']}));
});

test('Region import template contains stable matching ID and Business Line Code',async()=>{
 const csv=await template('csv');
 const text=csv.bytes.toString('utf8');
 assert.match(text,/Business Line Code/);
 assert.match(text,/Regional Manager/);
 assert.ok(importFields.some(f=>f.key==='displayId'&&f.matchOnly));
 assert.ok(importFields.some(f=>f.key==='businessLineCode'&&f.required));
 assert.deepEqual(parseCSV('Business Line Code,Region Name,Region Code,Regional Manager\nSTTS,West Africa,AF-WEST,Manager\n'),[['Business Line Code','Region Name','Region Code','Regional Manager'],['STTS','West Africa','AF-WEST','Manager']]);
});

test('Region view keeps Business Line reference separate from Country and exposes audit fields',()=>{
 const date='2026-10-26T12:00:00.000Z';
 const row={id:'11111111-1111-4111-8111-111111111111',display_id:'RN-001',business_line_id:'22222222-2222-4222-8222-222222222222',business_line_name:'Satguru Travel',business_line_display_id:'BL-000001',business_line_code:'STTS',business_line_status:'Active',business_line_archived_at:null,business_line_deleted_at:null,name:'West Africa',code:'AF-WEST',regional_manager:'Manager Name',remarks:'',status:'Active',owner_name:'Owner',owner_display_id:'UID-000001',creator_name:'Owner',creator_display_id:'UID-000001',updater_name:'Owner',updater_display_id:'UID-000001',created_at:date,updated_at:date,archived_at:null,deleted_at:null,version:1};
 const result=regionView(row);
 assert.equal(result.displayId,'RN-001');
 assert.equal(result.businessLine,'Satguru Travel');
 assert.equal(result.businessLineId,'BL-000001');
 assert.equal(result.businessLineRef,row.business_line_id);
 assert.equal(result.regionalManager,'Manager Name');
 assert.equal(result.createdById,'UID-000001');
 assert.ok(!('country' in result));
});

test('Region creation validates code and mandatory manager before database writes',async()=>{
 const queries=[];
 const client={query:async(sql)=>{queries.push(sql);return {rows:[],rowCount:0};}};
 const base={businessLineRef:'22222222-2222-4222-8222-222222222222',name:'West Africa',code:'AF-WEST',regionalManager:'Manager'};
 const attempt=body=>regions({client,user:superAdmin,path:['regions'],method:'POST',url:new URL(endpoint),body});
 await assert.rejects(attempt({...base,code:'bad code'}),/Region Code/);
 await assert.rejects(attempt({...base,regionalManager:''}),/Regional Manager/);
 assert.ok(!queries.some(sql=>sql.includes('INSERT INTO regions')));
});

test('Region migration enforces parent Business Line, composite name uniqueness and global code uniqueness',async()=>{
 const sql=await readFile(new URL('../db/009_regions.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS regions/);
 assert.match(sql,/business_line_id uuid NOT NULL REFERENCES business_lines/);
 assert.match(sql,/regions_business_line_name_unique_v9/);
 assert.match(sql,/regions_code_unique_v9/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS region_events/);
 assert.match(sql,/region_events_append_only/);
 assert.ok(!/INSERT INTO regions\s*\(/i.test(sql));
 assert.match(sql,/INSERT INTO schema_migrations\(version\) VALUES\(9\)/);
});


test('Region visible workspace uses the Business Lines master record experience',async()=>{
 const workspace=await readFile(new URL('../module-workspace.js',import.meta.url),'utf8');
 assert.match(workspace,/\['business-lines','regions'\]\.includes\(config\.key\).*openBlRecord/s);
 assert.match(workspace,/const regionGroups=\[/);
 assert.match(workspace,/Region Information/);
 assert.match(workspace,/Ownership Details/);
 assert.match(workspace,/Lifecycle Information/);
 assert.match(workspace,/businessLineRef.*Business Line/);
 assert.match(workspace,/Related \/ Used In/);
 assert.match(workspace,/Previous/);
 assert.match(workspace,/Next/);
 assert.match(workspace,/data-bl-expand/);
 assert.match(workspace,/data-bl-field-edit/);
 assert.match(workspace,/config\.singular\+' saved successfully\.'/);
});

test('Region visible lifecycle actions follow the strict sequence before backend submission',async()=>{
 const tools=await readFile(new URL('../records-tools.js',import.meta.url),'utf8');
 assert.match(tools,/!\['countries','regions'\]\.includes\(config\.key\)\|\|r\.status==='Inactive'/);
 assert.match(tools,/\['countries','regions'\]\.includes\(config\.key\)\?'Return to Inactive'/);
 assert.match(tools,/\['countries','regions'\]\.includes\(config\.key\)\?'Recover to Archived'/);
});

test('Region parity release cache-busts the shared visible UI assets',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/records-tools\.js\?v=20261027-(?:region-parity-r1|country-region-parity|region-shell-parity-r2)/);
 assert.match(html,/module-workspace\.js\?v=20261027-(?:region-parity-r1|country-region-parity|region-shell-parity-r2)/);
 assert.match(html,/region-ui\.js\?v=20261027-(?:region-parity-r1|region-shell-parity-r2)/);
});
