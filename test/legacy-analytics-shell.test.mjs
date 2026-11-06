import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('CRM Analytics-Y1 has separate sidebar navigation and read-only unconnected shell',async()=>{
 const app=await readFile('app.js','utf8');
 const workspace=await readFile('workspace-shell.js','utf8');
 assert.match(app,/\['CRM Analytics-Y1',\[/);
 for(const id of ['legacyoverview','legacyusers','legacybranches','legacyregions','legacymeetings','legacymoms','legacycalls','legacycontacts','legacyaccounts','legacysources']){
  assert.match(app,new RegExp(id));
 }
 assert.match(app,/Branches mirror awaiting its first validated snapshot/);
 assert.match(app,/page\.startsWith\('legacy'\)/);
 assert.match(workspace,/p\.startsWith\('legacy'\)/);
 assert.match(app,/\['ADMINISTRATION'/);
 assert.match(app,/\['WORKSPACE'/);
});

test('Yiron source registry and backend are strictly one-way, opt-in and gated',async()=>{
 const source=await readFile('server/yiron-analytics.mjs','utf8');
 const server=await readFile('server/api.mjs','utf8');
 assert.match(source,/YIRON_SOURCES/);
 assert.equal((source.match(/id:'/g)||[]).length,15);
 assert.match(source,/YIRON_ANALYTICS_ENABLED/);
 assert.match(source,/method:'POST'/);
 assert.match(source,/redirect:'error'/);
 assert.match(server,/path\[0\]==='yiron-analytics'/);
 assert.match(server,/publishedLegacyBranches\(client,url\)/);
 assert.match(server,/requestLegacyRefresh\(client,/);
 assert.match(server,/current\.system_role!=='super_admin'/);
});

test('Branches is the first Yiron dataset with paged read-only source visibility',async()=>{
 const app=await readFile('app.js','utf8');
 assert.match(app,/Yiron Branches — First API/);
 assert.match(app,/data-yiron-preview="branch_list_BI"/);
 assert.match(app,/data-yiron-page/);
 assert.match(app,/Previous 50/);
 assert.match(app,/Next 50/);
 assert.match(app,/not the operational SAI-CRM Branch Master/);
});


test('Yiron Branches matches working Power BI endpoint, JSON request and pagination',async()=>{
 const {fetchYironSource}=await import('../server/yiron-analytics.mjs');
 const env={YIRON_ANALYTICS_ENABLED:'true',YIRON_API_BASE_URL:'https://crm.satgurutravel.com/',YIRON_API_KEY:'test-key-for-contract'};
 const requests=[];
 const fetchImpl=async(url,options)=>{
  requests.push({url:String(url),method:options.method,headers:options.headers,body:options.body});
  return new Response(JSON.stringify({data:[{branch_id:'1',branch_name:'Test Branch'}]}),{status:200,headers:{'content-type':'application/json'}});
 };
 await fetchYironSource('branch_list_BI',new URL('https://saicrm.vercel.app/api/yiron-analytics/preview/branch_list_BI'),{env,fetchImpl});
 await fetchYironSource('branch_list_BI',new URL('https://saicrm.vercel.app/api/yiron-analytics/preview/branch_list_BI?from=51&to=100'),{env,fetchImpl});
 assert.equal(requests[0].url,'https://crm.satgurutravel.com/api/branch_list_BI');
 assert.equal(requests[0].method,'POST');
 assert.equal(requests[0].headers['Content-Type'],'application/json');
 assert.deepEqual(JSON.parse(requests[0].body),{from:'1',to:'50'});
 assert.deepEqual(JSON.parse(requests[1].body),{from:'51',to:'100'});
 const app=await readFile('app.js','utf8');
 assert.ok(app.includes("const query='?from='"));
});
