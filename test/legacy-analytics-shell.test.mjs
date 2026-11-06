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
 assert.match(app,/Connection not configured/);
 assert.match(app,/page\.startsWith\('legacy'\)/);
 assert.match(workspace,/p\.startsWith\('legacy'\)/);
 assert.match(app,/\['ADMINISTRATION'/);
 assert.match(app,/\['WORKSPACE'/);
});
