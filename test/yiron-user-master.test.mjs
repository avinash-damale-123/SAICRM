import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchYironSource} from '../server/yiron-analytics.mjs';

const env={YIRON_ANALYTICS_ENABLED:'true',YIRON_API_BASE_URL:'https://crm.satgurutravel.com/',YIRON_API_KEY:'test-api-key-123'};
const url=new URL('https://example.invalid/api/yiron-analytics/preview/last_login?from=1&to=10');

test('User Master uses the Power BI JSON request contract and strips secret fields',async()=>{
 let request;
 const result=await fetchYironSource('last_login',url,{env,fetchImpl:async(endpoint,options)=>{
  request={endpoint:String(endpoint),options};
  return new Response(JSON.stringify({data:[{user_id:470,first_name:'Sample',department:'Marketing',status:'Active',branch_id:3,password:'secret',otp:'123456',remember_token:'token'}]}),{headers:{'content-type':'application/json'}});
 }});
 assert.equal(request.endpoint,'https://crm.satgurutravel.com/staging/api/last_login');
 assert.equal(request.options.headers['Content-Type'],'application/json');
 assert.deepEqual(JSON.parse(request.options.body),{from:'1',to:'10'});
 assert.equal(result.data.data[0].user_id,470);
 assert.equal(result.data.data[0].branch_id,3);
 assert.equal(result.data.data[0].password,undefined);
 assert.equal(result.data.data[0].otp,undefined);
 assert.equal(result.data.data[0].remember_token,undefined);
});

test('User Master preview bounds returned records',async()=>{
 const rows=Array.from({length:60},(_,i)=>({user_id:i+1,department:'Marketing'}));
 const result=await fetchYironSource('last_login',url,{env,fetchImpl:async()=>new Response(JSON.stringify({data:rows}),{headers:{'content-type':'application/json'}})});
 assert.equal(result.data.data.length,50);
 assert.equal(result.data.returnedCount,60);
 assert.equal(result.data.previewLimited,true);
});

test('User Master rejects unexpected response shape',async()=>{
 await assert.rejects(()=>fetchYironSource('last_login',url,{env,fetchImpl:async()=>new Response(JSON.stringify({error:'bad response'}),{headers:{'content-type':'application/json'}})}),/record array/);
});
