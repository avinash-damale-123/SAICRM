import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import pg from 'pg';
import {transaction} from '../server/db.mjs';
import {recordsFramework} from '../server/records-framework.mjs';
import {uploadImport,validateImport,startJob,stepJob,createExport,exportPlan,jobFile} from '../server/records-jobs.mjs';
import {fileLimits,parseCSV} from '../server/records-files.mjs';

const url=new URL(process.env.TEST_DATABASE_URL||'');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Scale tests may only run on an isolated loopback PostgreSQL instance');
assert.match(url.pathname,/test/i,'A disposable test database is mandatory');
const rows=Number(process.env.RECORDS_LOAD_ROWS||500000);
assert.ok(Number.isInteger(rows)&&rows>=10000&&rows<=500000,'Scale-test size must be between 10,000 and 500,000');
const pool=new pg.Pool({connectionString:url.href,max:4});
const metrics={environment:'isolated PostgreSQL, not production',node:process.version,datasetRows:rows,timings:{},checks:[],peakRssMiB:0};
const tag=Date.now().toString(36).toUpperCase(),prefix='Scale '+tag+' ',codePrefix='L'+tag;
const sampleMemory=()=>metrics.peakRssMiB=Math.max(metrics.peakRssMiB,Math.round(process.memoryUsage().rss/1048576));
const timed=async(name,fn)=>{const start=performance.now();const result=await fn();metrics.timings[name]=Math.round(performance.now()-start);sampleMemory();console.log(name+': '+metrics.timings[name]+'ms');return result;};
let user;
const tx=fn=>transaction(pool,async client=>{await client.query("SET LOCAL statement_timeout='90s'");return fn(client);});
async function complete(id){let latest,batches=0;const start=performance.now();while(true){latest=await tx(c=>stepJob(c,user,id));batches++;if(batches%20===0)sampleMemory();if(latest.done)break;assert.ok(performance.now()-start<600000,'A job exceeded the ten-minute test budget');assert.ok(batches<=2500,'Unexpected non-progressing job');}return {job:latest.job,batches};}
try{
 user=(await pool.query("SELECT * FROM users WHERE system_role='super_admin' AND status='approved' AND email_verified=true ORDER BY created_at LIMIT 1")).rows[0];assert.ok(user,'Run integration tests first to initialize a verified fixture user');
 await timed('seed',()=>pool.query("INSERT INTO business_lines(id,name,code,description,owner_id,created_by,updated_by,status) SELECT gen_random_uuid(),$1||lpad(g::text,6,'0'),$2||'-'||lpad(g::text,6,'0'),'Isolated scale fixture',$3,$3,$3,CASE WHEN g%5=0 THEN 'Inactive' ELSE 'Active' END FROM generate_series(1,$4::int) g",[prefix,codePrefix,user.id,rows]));
 await pool.query('ANALYZE business_lines');
 const list=await timed('list_filter_multisort',()=>tx(c=>recordsFramework({client:c,user,path:['business-lines'],method:'GET',body:{},url:new URL('https://test.invalid/api/business-lines?'+new URLSearchParams({q:prefix,status:'Active',page:'3',pageSize:'100',sorts:JSON.stringify([{field:'name',direction:'asc'},{field:'createdAt',direction:'desc'}])}))})));
 assert.equal(list.records.length,100);assert.equal(list.total,rows-Math.floor(rows/5));metrics.checks.push('Server filtering, count, third-page pagination and multi-sort match seeded population');
 const query={q:prefix,sorts:[{field:'name',direction:'asc'}]},base={scope:'matching',columnMode:'custom',columns:['displayId','name','code'],query,format:'csv'};
 const plan=await timed('export_plan',()=>tx(c=>exportPlan(c,user,base)));assert.equal(plan.count,rows);
 const prepared=await timed('export_snapshot',()=>tx(c=>createExport(c,user,{...base,expectedCount:rows,requestId:randomUUID()})));const jobId=prepared.job.id;
 await timed('concurrent_export_workers',()=>Promise.all([tx(c=>stepJob(c,user,jobId)),tx(c=>stepJob(c,user,jobId))]));
 assert.equal(Number((await pool.query("SELECT count(*) FROM crm_transfer_items WHERE job_id=$1 AND status='succeeded'",[jobId])).rows[0].count),2000);metrics.checks.push('Concurrent workers serialize without processing a row twice');
 const continued=await timed('export_resume_and_complete',()=>complete(jobId));assert.equal(continued.job.status,'completed');assert.equal(continued.job.succeeded,rows);
 const counts=(await pool.query('SELECT count(*)::int AS parts,sum(octet_length(bytes))::bigint AS bytes FROM crm_transfer_files WHERE job_id=$1',[jobId])).rows[0];assert.equal(counts.parts,Math.ceil(rows/fileLimits.exportPartRows));metrics.exportParts=counts.parts;metrics.exportBytes=Number(counts.bytes);
 const first=await tx(c=>jobFile(c,user,jobId,1)),last=await tx(c=>jobFile(c,user,jobId,counts.parts));const firstRows=parseCSV(Buffer.from(first.data,'base64')),lastRows=parseCSV(Buffer.from(last.data,'base64'));assert.ok(JSON.stringify(firstRows[1]).includes(prefix+'000001'));assert.ok(JSON.stringify(lastRows.at(-1)).includes(prefix+String(rows).padStart(6,'0')));metrics.checks.push('Complete ordered CSV export, bounded files, first/last row and resume checked');
 const again=await tx(c=>stepJob(c,user,jobId));assert.equal(again.job.succeeded,rows);assert.equal(Number((await pool.query('SELECT count(*) FROM crm_transfer_files WHERE job_id=$1',[jobId])).rows[0].count),counts.parts);metrics.checks.push('Retrying completed export does not append duplicate file parts');
 const importCount=fileLimits.maxRows;
 const csv='Business Line Name,Business Line Code,Business Line Description\n'+Array.from({length:importCount},(_,i)=>'Import '+tag+' '+i+',I'+tag+'-'+i+',Scale import fixture').join('\n');
 assert.ok(Buffer.byteLength(csv)<fileLimits.uploadBytes);
 const upload=await timed('import_upload_10000',()=>tx(c=>uploadImport(c,user,{filename:'scale.csv',data:Buffer.from(csv).toString('base64')})));
 const validation=await timed('import_validate_10000',()=>tx(c=>validateImport(c,user,upload.job.id,{mapping:{name:0,code:1,description:2},mode:'create',atomic:false})));assert.equal(validation.valid,importCount);assert.equal(validation.invalid,0);
 await tx(c=>startJob(c,user,upload.job.id,{validationToken:validation.validationToken}));await Promise.all([tx(c=>stepJob(c,user,upload.job.id)),tx(c=>stepJob(c,user,upload.job.id))]);
 const imported=await timed('import_process_10000',()=>complete(upload.job.id));assert.equal(imported.job.succeeded,importCount);assert.equal(imported.job.status,'completed');
 const replay=await tx(c=>uploadImport(c,user,{filename:'scale.csv',data:Buffer.from(csv).toString('base64')}));assert.equal(replay.job.id,upload.job.id);assert.equal(Number((await pool.query('SELECT count(*) FROM business_lines WHERE name LIKE $1',['Import '+tag+' %'])).rows[0].count),importCount);metrics.checks.push('10,000-row upload, validation, import, parallel workers and duplicate-file retry');
 const atomic='Business Line Name,Business Line Code\n'+Array.from({length:fileLimits.atomicRows+1},(_,i)=>'Atomic '+tag+' '+i+',A'+tag+'-'+i).join('\n');const rejected=await tx(c=>uploadImport(c,user,{filename:'atomic-over-limit.csv',data:Buffer.from(atomic).toString('base64')}));await assert.rejects(()=>tx(c=>validateImport(c,user,rejected.job.id,{mapping:{name:0,code:1},mode:'create',atomic:true})),e=>e.status===400);metrics.checks.push('Atomic import rejects 251 rows before committing data (250-row cap)');
 metrics.status='passed';
}catch(error){metrics.status='failed';metrics.error=error.message;throw error;}
finally{sampleMemory();await mkdir('work/browser',{recursive:true});await writeFile('work/browser/records-scale-results.json',JSON.stringify(metrics,null,2));await pool.end();console.log(JSON.stringify(metrics));}
