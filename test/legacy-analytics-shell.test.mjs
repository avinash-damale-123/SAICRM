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
 assert.match(app,/Yiron API connection not configured/);
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
 assert.match(server,/method!=='GET'/);
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
