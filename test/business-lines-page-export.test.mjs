import test from 'node:test';
import assert from 'node:assert/strict';
import { businessLines } from '../server/business-lines.mjs';

const user={id:'00000000-0000-4000-8000-000000000001',system_role:'super_admin',email_verified:true,status:'approved'};

test('Current Page CSV export enforces requested pagination on the server',async()=>{
 const calls=[];
 const client={query:async(sql,params=[])=>{
  calls.push({sql,params});
  if(sql.includes('FROM business_lines b'))return {rows:[]};
  return {rows:[],rowCount:1};
 }};
 const result=await businessLines({client,user,method:'POST',path:['business-lines','export'],
  url:new URL('https://crm.invalid/api/business-lines/export'),
  body:{mode:'page',query:{page:3,pageSize:25,q:'ABC',filters:[]}}});
 assert.equal(result.count,0);
 assert.match(result.filename,/business-lines-page-/);
 const selection=calls.find(call=>call.sql.includes('FROM business_lines b'));
 assert.ok(selection,'Expected server-side record query');
 assert.match(selection.sql,/LIMIT \$\d+ OFFSET \$\d+/);
 assert.deepEqual(selection.params.slice(-2),[25,50]);
 assert.ok(calls.some(call=>call.sql.includes('INSERT INTO audit')),'Export is audited');
});

test('Current Page export rejects invalid pagination before querying records',async()=>{
 const client={query:async()=>{throw Error('Unexpected database query')}};
 await assert.rejects(()=>businessLines({client,user,method:'POST',
  path:['business-lines','export'],url:new URL('https://crm.invalid/api/business-lines/export'),
  body:{mode:'page',query:{pageSize:999}}}),error=>error.status===400);
});
