import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {transaction} from '../server/db.mjs';
import {LEGACY_BRANCH_SOURCE,legacyMirrorStatus,publishedLegacyBranches,requestLegacyRefresh,processLegacyBranchRefresh} from '../server/legacy-refresh.mjs';

const cs=process.env.TEST_DATABASE_URL;
assert.ok(cs,'TEST_DATABASE_URL required');
const parsed=new URL(cs);
assert.ok(['localhost','127.0.0.1','[::1]'].includes(parsed.hostname),'Refusing a remote database');
assert.match(parsed.pathname,/test/i,'Refusing a non-test database');
const pool=new pg.Pool({connectionString:cs,max:3});
const prior={YIRON_ANALYTICS_ENABLED:process.env.YIRON_ANALYTICS_ENABLED,YIRON_API_BASE_URL:process.env.YIRON_API_BASE_URL,YIRON_API_KEY:process.env.YIRON_API_KEY};
process.env.YIRON_ANALYTICS_ENABLED='true';
process.env.YIRON_API_BASE_URL='https://crm.satgurutravel.com/';
process.env.YIRON_API_KEY='test-key-for-contract';
try{
 await pool.query(await readFile(new URL('../db/016_legacy_analytics_persistence.sql',import.meta.url),'utf8'));
 assert.equal((await pool.query('SELECT count(*)::int n FROM schema_migrations WHERE version=16')).rows[0].n,1);
 const source=(await pool.query('SELECT enabled FROM legacy_api_sources WHERE id=$1',[LEGACY_BRANCH_SOURCE])).rows[0];
 assert.equal(source.enabled,false,'New integration must be disabled by default');
 const original=await legacyMirrorStatus(pool);
 assert.equal(original.published,null);
 await assert.rejects(()=>transaction(pool,client=>requestLegacyRefresh(client)),/disabled/);
 await pool.query('UPDATE legacy_api_sources SET enabled=true WHERE id=$1',[LEGACY_BRANCH_SOURCE]);
 const first=await transaction(pool,client=>requestLegacyRefresh(client,{trigger:'manual'}));
 const coalesced=await transaction(pool,client=>requestLegacyRefresh(client,{trigger:'scheduled'}));
 assert.equal(first.jobId,coalesced.jobId,'Overlapping requests must reuse the same job');
 assert.equal(coalesced.reused,true);
 assert.equal((await pool.query('SELECT count(*)::int n FROM legacy_refresh_requests WHERE job_id=$1',[first.jobId])).rows[0].n,2);
 const records=Array.from({length:105},(_,i)=>({branch_id:'BR-'+String(i+1).padStart(3,'0'),branch_name:'Branch '+(i+1)}));
 const mock=async(_source,url)=>{
  const from=Number(url.searchParams.get('from')),to=Number(url.searchParams.get('to'));
  return {data:records.slice(from-1,to)};
 };
 const finish=await processLegacyBranchRefresh(pool,first.jobId,{budgetMs:12000,fetchPage:mock});
 assert.equal(finish.done,true);
 assert.equal(finish.publishedCount,105);
 const status=await legacyMirrorStatus(pool);
 assert.equal(status.published.recordCount,105);
 assert.equal(status.jobs[0].state,'succeeded');
 const browser=await publishedLegacyBranches(pool,new URL('https://saicrm.invalid/?from=1&to=50'));
 assert.equal(browser.mode,'published-mirror');
 assert.equal(browser.data.length,50);
 assert.equal(browser.recordCount,105);
 const second=await transaction(pool,client=>requestLegacyRefresh(client));
 const corrupted=async()=>({data:[{branch_id:'BR-001'},{branch_id:'BR-001'}]});
 const failed=await processLegacyBranchRefresh(pool,second.jobId,{budgetMs:12000,fetchPage:corrupted});
 assert.equal(failed.done,true);
 assert.equal((await legacyMirrorStatus(pool)).published.recordCount,105,'Validation failure cannot remove last published data');
 assert.equal((await pool.query('SELECT state FROM legacy_refresh_jobs WHERE id=$1',[second.jobId])).rows[0].state,'failed');
 const newer=records.map(r=>({...r}));
 newer[0].branch_name='Branch 1 updated';
 newer.pop();
 const third=await transaction(pool,client=>requestLegacyRefresh(client));
 const diffFetch=async(_source,url)=>{
  const from=Number(url.searchParams.get('from')),to=Number(url.searchParams.get('to'));
  return {data:newer.slice(from-1,to)};
 };
 const published=await processLegacyBranchRefresh(pool,third.jobId,{budgetMs:12000,fetchPage:diffFetch});
 assert.equal(published.publishedCount,104);
 const changes=(await pool.query('SELECT change_kind,count(*)::int n FROM legacy_record_changes WHERE dataset_version_id=(SELECT id FROM legacy_dataset_versions WHERE job_id=$1) GROUP BY change_kind',[third.jobId])).rows;
 const counted=Object.fromEntries(changes.map(r=>[r.change_kind,r.n]));
 assert.deepEqual(counted,{changed:1,removed:1});
 const history=(await pool.query("SELECT count(*)::int n FROM legacy_dataset_versions WHERE source_id=$1 AND status='superseded'",[LEGACY_BRANCH_SOURCE])).rows[0].n;
 assert.equal(history,1);
 console.log('PASS Yiron Y1: disabled-by-default, job coalescing, full snapshot, validation failure and atomic version changes');
}finally{
 await pool.end();
 for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
