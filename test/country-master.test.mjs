import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fieldKeys,schema,queryOptions,compileWhere,compileOrder,normalizeFilters,publicColumns} from '../server/country-records-schema.mjs';
import {baseline,effectivePolicy,reconcilePreferences,validatePolicy,moduleKey} from '../server/country-records-policy.mjs';
import {countryPermissions,countryResource} from '../server/resources.mjs';
import {countries,countryView} from '../server/countries.mjs';
import {importFields,template,safeCSV,parseCSV} from '../server/country-records-files.mjs';

const user={id:'11111111-1111-4111-8111-111111111111',system_role:'super_admin',email_verified:true,status:'approved',role:'admin'};
const endpoint='https://crm.invalid/api/countries';

test('Country Master declares all 28 finalized fields and nine default columns',()=>{
 assert.equal(fieldKeys.length,28);
 assert.equal(new Set(fieldKeys).size,28);
 assert.deepEqual(fieldKeys.slice(0,5),['displayId','name','code','iso3','isoNumeric']);
 assert.deepEqual(baseline().roles.super_admin.defaults,['displayId','name','code','iso3','defaultCurrency','continent','status','owner','updatedAt']);
 assert.ok(fieldKeys.includes('businessLinePresence'));
 assert.ok(fieldKeys.includes('deletedAt'));
 assert.ok(publicColumns().every(field=>!('sql' in field)));
 assert.equal(moduleKey,'countries');
 assert.equal(countryResource.key,'COUNTRIES');
});

test('Country access is server-restricted to approved verified Super Admins',()=>{
 assert.equal(countryPermissions(user).create,true);
 assert.equal(countryPermissions(user).restoreDeleted,true);
 assert.equal(countryPermissions({...user,system_role:'admin'}).read,false);
 assert.equal(countryPermissions({...user,email_verified:false}).read,false);
 assert.equal(countryPermissions({...user,status:'pending'}).read,false);
 assert.equal(countryPermissions(user).delete,false);
});

test('Country search, typed filters and sorting compile only parameterized SQL',()=>{
 const attack="%' OR 1=1 --";
 const query=queryOptions({q:attack,filters:{logic:'and',conditions:[{field:'name',operator:'contains',value:attack},{field:'businessLinePresence',operator:'contains',value:'STTS'},{field:'continent',operator:'equals',value:'Asia'}]},sorts:[{field:'updatedAt',direction:'desc'}]});
 const compiled=compileWhere(query);
 assert.ok(compiled.params.includes(attack));
 assert.ok(!compiled.sql.includes(attack));
 assert.match(compiled.sql,/country_business_lines/);
 assert.match(compileOrder(query.sorts),/c.updated_at DESC NULLS LAST,c.id ASC/);
 assert.throws(()=>normalizeFilters([{field:'continent',operator:'equals',value:'Moon'}]));
 assert.throws(()=>queryOptions({sorts:[{field:'name;DROP TABLE users',direction:'asc'}]}));
 assert.throws(()=>queryOptions({filters:[{field:'createdAt',operator:'equals',value:'2026-02-30'}]}));
});

test('Country table and filter preferences preserve identity and access',()=>{
 const policy=baseline();
 assert.deepEqual(validatePolicy(policy).locked,['displayId','name']);
 const effective=effectivePolicy({version:0,publishedVersion:0,config:policy},user);
 assert.ok(effective.allowed.includes('isoNumeric'));
 assert.ok(effective.filters.quick.includes('recordState'));
 const prefs=reconcilePreferences({selectedColumns:['description'],active:'custom'},effective);
 assert.ok(prefs.selectedColumns.includes('displayId'));
 assert.ok(prefs.selectedColumns.includes('name'));
 assert.throws(()=>validatePolicy({...policy,locked:['displayId']}));
});

test('Country export/import templates preserve ISO numeric and dialing code as text',async()=>{
 const csv=await template('csv');
 assert.match(csv.bytes.toString('utf8'),/ISO Numeric Code/);
 assert.match(csv.bytes.toString('utf8'),/International Dialing Code/);
 assert.ok(importFields.some(f=>f.key==='businessLinePresence'));
 assert.ok(importFields.some(f=>f.key==='displayId'&&f.matchOnly));
 const protectedValue=safeCSV('+91');
 assert.match(protectedValue,/^"'/);
 assert.deepEqual(parseCSV('Country Code,ISO Numeric Code\nIN,356\n'),[['Country Code','ISO Numeric Code'],['IN','356']]);
});

test('Country view returns immutable ID, flag, Presence codes and audit fields',()=>{
 const date='2026-10-26T12:00:00.000Z';
 const row={id:'11111111-1111-4111-8111-111111111111',display_id:'CN-001',name:'India',code:'IN',iso3:'IND',iso_numeric:'356',dialing_code:'+91',default_currency:'INR',nationality:'Indian',continent:'Asia',alias:'Bharat',description:'',status:'Active',owner_name:'Owner',owner_display_id:'UID-000001',creator_name:'Owner',creator_display_id:'UID-000001',updater_name:'Owner',updater_display_id:'UID-000001',created_at:date,updated_at:date,archived_at:null,deleted_at:null,version:1,business_lines:[{id:'22222222-2222-4222-8222-222222222222',code:'STTS',name:'Travel'}]};
 const result=countryView(row);
 assert.equal(result.displayId,'CN-001');
 assert.equal(result.flag,'🇮🇳');
 assert.equal(result.isoNumeric,'356');
 assert.equal(result.businessLinePresence,'STTS');
 assert.equal(result.businessLineIds.length,1);
 assert.equal(result.createdById,'UID-000001');
});

test('Country creation rejects invalid ISO, dialing and continent values before insert',async()=>{
 const queries=[];
 const client={query:async(sql)=>{queries.push(sql);return {rows:[],rowCount:1};}};
 const base={name:'India',code:'IN',iso3:'IND',isoNumeric:'356',dialingCode:'+91',defaultCurrency:'INR',nationality:'Indian',continent:'Asia'};
 const attempt=body=>countries({client,user,path:['countries'],method:'POST',url:new URL(endpoint),body});
 await assert.rejects(attempt({...base,code:'IND'}),/Country Code/);
 await assert.rejects(attempt({...base,dialingCode:'91'}),/Dialing Code/);
 await assert.rejects(attempt({...base,continent:'Atlantis'}),/Continent/);
 assert.ok(!queries.some(sql=>sql.includes('INSERT INTO countries')));
});

test('Country database migration starts empty and protects append-only audit ledgers',async()=>{
 const sql=await readFile(new URL('../db/008_countries.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS countries/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS country_events/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS country_business_line_events/);
 assert.match(sql,/country_business_line_events_append_only/);
 assert.ok(!/INSERT INTO countries\s*\(/i.test(sql));
 assert.ok(!/WITH seed AS/i.test(sql));
 assert.match(sql,/INSERT INTO schema_migrations\(version\) VALUES\(8\)/);
 assert.equal(sql.trim().split(/COMMIT;/).length,2);
});
