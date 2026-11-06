import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeLegacyBranchPage,LEGACY_PAGE_SIZE} from '../server/legacy-refresh.mjs';
import {legacyWorkerSignature,verifyLegacyWorker} from '../server/legacy-worker.mjs';

const page=(data)=>({data});
const range={from:'1',to:'50'};
const rows=n=>Array.from({length:n},(_,i)=>({branch_id:'B-'+String(i+1),branch_name:'Test Branch '+(i+1)}));
test('Yiron Branches recognizes a bounded, stable JSON array and original identifiers',()=>{
 const result=normalizeLegacyBranchPage(page(rows(50)),range);
 assert.equal(result.length,LEGACY_PAGE_SIZE);
 assert.equal(result[0].id,'B-1');
 assert.equal(result[49].ordinal,50);
 assert.match(result[0].hash,/^[a-f0-9]{64}$/);
 assert.deepEqual(result[0].payload,rows(1)[0]);
});
test('Yiron Branches rejects oversized or non-array upstream pagination responses',()=>{
 assert.throws(()=>normalizeLegacyBranchPage(page(rows(145)),range),/more than the requested 50/i);
 assert.throws(()=>normalizeLegacyBranchPage({data:{count:145}},range),/recognized record array/i);
});
test('Yiron Branches rejects duplicate or unverified source identifiers',()=>{
 assert.throws(()=>normalizeLegacyBranchPage(page([{branch_id:1},{branch_id:'1'}]),range),/duplicate/i);
 assert.throws(()=>normalizeLegacyBranchPage(page([{name:'missing id'}]),range),/branch_id/i);
 assert.throws(()=>normalizeLegacyBranchPage(page([null]),range),/invalid Branches row/i);
});
test('Worker signatures enforce ID, timestamp and tamper resistance',()=>{
 const secret='test-only-secret-not-for-deployment-1234567890';
 const id='b4369db2-dff4-496d-ae1b-cf40c1144ec2';
 const when=Date.now(),sig=legacyWorkerSignature(secret,id,when);
 assert.equal(verifyLegacyWorker(secret,id,when,sig,when),true);
 assert.equal(verifyLegacyWorker(secret,id,when,sig,when+61000),false);
 assert.equal(verifyLegacyWorker(secret,id,when,sig.replace(/^./,'0'),when),sig[0]==='0');
 assert.equal(verifyLegacyWorker(secret,id,when,'invalid',when),false);
});
test('API and scheduled cron retain Super Admin gate and UTC-to-IST schedule',async()=>{
 const {readFile}=await import('node:fs/promises');
 const api=await readFile('server/api.mjs','utf8');
 const worker=await readFile('server/legacy-worker.mjs','utf8');
 const vercel=JSON.parse(await readFile('vercel.json','utf8'));
 assert.match(api,/current\.system_role!=='super_admin'/);
 assert.match(api,/publishedLegacyBranches\(client,url\)/);
 assert.match(api,/requestLegacyRefresh\(client,/);
 assert.doesNotMatch(api,/fetchYironSource\(path\[2\],url\)/);
 assert.match(worker,/verifyMaintenance/);
 assert.ok(vercel.crons.some(c=>c.path==='/api/internal/yiron-maintenance'&&c.schedule==='30 21 * * *'));
});
