import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileLimits} from '../server/records-files.mjs';
import {warningLocations,installRuntimeDiagnostics} from '../server/runtime-diagnostics.mjs';

test('Import documentation and executable atomic limit agree',async()=>{
 assert.equal(fileLimits.atomicRows,250);
 assert.equal(fileLimits.maxRows,10000);
 const doc=await readFile(new URL('../docs/records-framework.md',import.meta.url),'utf8');
 assert.match(doc,/all-or-nothing \(\*\*maximum 250 rows\*\*\)/);
});

test('Deprecation diagnostics cannot emit URLs, query strings or messages',()=>{
 const value={code:'DEP0169',message:'password=do-not-log',stack:'Warning: postgresql://user:password@host/db\n    at parse (node:url:100:20)\n    at library (/var/task/node_modules/library/index.js:20:3)\n    at secret (https://user:password@host/script.js?token=abc:20:3)\n    at private (/tmp/private-secret-key.js:1:2)'};
 assert.deepEqual(warningLocations(value),['node:url:100:20','/var/task/node_modules/library/index.js:20:3']);
 assert.deepEqual(warningLocations({code:'OTHER',stack:value.stack}),[]);
 const count=process.listenerCount('warning');installRuntimeDiagnostics();installRuntimeDiagnostics();assert.equal(process.listenerCount('warning'),count);
});
