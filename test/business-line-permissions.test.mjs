import test from 'node:test';
import assert from 'node:assert/strict';
import { businessLinePermissions, businessLineResource } from '../server/resources.mjs';
import { businessLines } from '../server/business-lines.mjs';

const approved={system_role:'super_admin',email_verified:true,status:'approved'};
test('Business Line workspace exposes only implemented capabilities to an approved verified Super Admin',()=>{
 const permissions=businessLinePermissions(approved);
 for(const action of ['read','create','edit','archive','restore','export','history','search','filter','settings','dashboard'])
  assert.equal(permissions[action],true,action);
 assert.equal(permissions.import,false);
 assert.equal(permissions.delete,false);
 assert.equal(businessLineResource.supportsImport,false);
 assert.equal(businessLineResource.supportsDelete,false);
 assert.throws(()=>{permissions.create=false;},TypeError);
});

test('ordinary roles, pending accounts and browser-shaped claims grant no Business Line capabilities',()=>{
 for(const user of [
  null,{},...['admin','manager','member','viewer'].map(role=>({role,email_verified:true,status:'approved',system_role:'user'})),
  {...approved,email_verified:false},{...approved,status:'pending'},{...approved,status:'suspended'},
  {...approved,email_verified:'true'},
  {role:'admin',systemRole:'super_admin',emailVerified:true,status:'approved',permissions:{read:true,create:true,export:true}}
 ]){
  assert.ok(Object.values(businessLinePermissions(user)).every(value=>value===false));
 }
});

test('direct Business Line API calls cannot use posted capability grants to bypass current account policy',async()=>{
 const routes=[
  ['GET',[]],['POST',[]],['GET',['record']],['PUT',['record']],
  ['POST',['record','archive']],['POST',['record','restore']],['GET',['record','history']],['POST',['export']]
 ];
 for(const user of [
  {system_role:'user',role:'admin',email_verified:true,status:'approved'},
  {...approved,status:'suspended'},
  {...approved,email_verified:false}
 ]){
  for(const [method,suffix]of routes){
   let queries=0;
   const client={query:async()=>{queries++;throw new Error('Unauthorized query');}};
   await assert.rejects(()=>businessLines({
    client,user,method,path:['business-lines',...suffix],
    url:new URL('https://crm.invalid/api/business-lines?q=private&filters=[]'),
    body:{permissions:{read:true,create:true,edit:true,archive:true,restore:true,export:true,history:true}}
   }),error=>error.status===403);
   assert.equal(queries,0,method+' '+suffix.join('/'));
  }
 }
});

test('unsupported import and permanent deletion remain unavailable through direct API requests',async()=>{
 const client={query:async(sql)=>{assert.match(sql,/pg_advisory_xact_lock/);return {rows:[],rowCount:0};}};
 for(const [method,path,body]of [
  ['POST',['business-lines','import'],{records:[],permissions:{import:true}}],
  ['DELETE',['business-lines','missing-record'],{version:1,permissions:{delete:true}}]
 ]){
  await assert.rejects(()=>businessLines({
   client,user:approved,method,path,body,url:new URL('https://crm.invalid/api/business-lines')
  }),error=>error.status===405);
 }
});
