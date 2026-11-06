// CRM Analytics-Y1: isolated persistent Yiron Branches mirror.
// No operational CRM tables are modified and no request to Yiron is performed during browsing.
import {createHash,randomUUID} from 'node:crypto';
import {transaction} from './db.mjs';
import {fetchYironSource,yironConfiguration,yironRequestRange} from './yiron-analytics.mjs';

export const LEGACY_BRANCH_SOURCE='branch_list_BI';
export const LEGACY_PAGE_SIZE=50;
const MAX_PAGES=400;
const temporaryCodes=new Set(['YIRON_TEMP','YIRON_TIMEOUT','YIRON_NETWORK']);
const error=(status,message,code='LEGACY_VALIDATION')=>Object.assign(new Error(message),{status,code});
const digest=payload=>createHash('sha256').update(JSON.stringify(payload)).digest('hex');
const iso=value=>value?new Date(value).toISOString():null;

export function normalizeLegacyBranchPage(response,range){
 const value=response?.data;
 const rows=Array.isArray(value)?value:Array.isArray(value?.data)?value.data:Array.isArray(value?.records)?value.records:null;
 if(!Array.isArray(rows))throw error(422,'Yiron Branches response is not a recognized record array');
 if(rows.length>LEGACY_PAGE_SIZE)throw error(422,'Yiron returned more than the requested 50 records; pagination is unverified');
 if(rows.length && (!range||Number(range.from)<1))throw error(422,'Missing pagination boundary');
 const seen=new Set();
 return rows.map((record,index)=>{
  if(!record||typeof record!=='object'||Array.isArray(record))throw error(422,'Yiron returned an invalid Branches row');
  // The field is a provisional contract based on the existing connector fixture.
  // Fail closed until live source fields and identifier are confirmed.
  const id=record.branch_id;
  if(!['string','number'].includes(typeof id)||!String(id).trim()||String(id).length>200)
   throw error(422,'Yiron Branches row is missing the verified branch_id field');
  const key=String(id).trim();
  if(seen.has(key))throw error(422,'Yiron returned duplicate Branches identifiers in one page');
  seen.add(key);
  return {id:key,payload:record,hash:digest(record),ordinal:Number(range.from)+index};
 });
}

export async function legacyMirrorStatus(client){
 const source=(await client.query('SELECT id,display_name,enabled,refresh_timezone,refresh_local_time FROM legacy_api_sources WHERE id=$1',[LEGACY_BRANCH_SOURCE])).rows[0];
 if(!source)throw error(503,'Analytics persistence migration is not installed','MIGRATION_PENDING');
 const published=(await client.query("SELECT id,record_count,published_at FROM legacy_dataset_versions WHERE source_id=$1 AND status='published' LIMIT 1",[LEGACY_BRANCH_SOURCE])).rows[0]||null;
 const jobs=(await client.query("SELECT id,state,trigger_kind,attempt,fetched_count,validated_count,error_code,error_summary,started_at,finished_at,created_at FROM legacy_refresh_jobs WHERE source_id=$1 ORDER BY created_at DESC LIMIT 20",[LEGACY_BRANCH_SOURCE])).rows;
 return {source:{id:source.id,label:source.display_name,enabled:source.enabled,timeZone:source.refresh_timezone,refreshTime:source.refresh_local_time},published:published?{id:published.id,recordCount:Number(published.record_count),publishedAt:iso(published.published_at)}:null,jobs};
}

export async function publishedLegacyBranches(client,url){
 const range=yironRequestRange(url)||{from:'1',to:'50'};
 if(Number(range.to)-Number(range.from)+1>LEGACY_PAGE_SIZE)throw error(400,'Select at most 50 published rows','BAD_RANGE');
 const current=(await client.query("SELECT id,record_count,published_at FROM legacy_dataset_versions WHERE source_id=$1 AND status='published' LIMIT 1",[LEGACY_BRANCH_SOURCE])).rows[0];
 if(!current)return {source:LEGACY_BRANCH_SOURCE,sourceSystem:'Yiron CRM',mode:'published-mirror',range,data:[],recordCount:0,fetchedAt:null,noPublishedSnapshot:true};
 const rows=(await client.query('SELECT source_record_id,payload FROM legacy_source_records WHERE dataset_version_id=$1 ORDER BY source_record_id COLLATE "C" LIMIT $2 OFFSET $3',[current.id,Number(range.to)-Number(range.from)+1,Number(range.from)-1])).rows;
 return {source:LEGACY_BRANCH_SOURCE,sourceSystem:'Yiron CRM',mode:'published-mirror',range,data:rows.map(row=>row.payload),recordCount:Number(current.record_count),fetchedAt:iso(current.published_at),datasetVersion:current.id};
}

export async function requestLegacyRefresh(client,{actorId=null,trigger='manual'}={}){
 if(!['manual','scheduled','recovery'].includes(trigger))throw error(400,'Invalid refresh trigger','BAD_TRIGGER');
 const cfg=yironConfiguration();
 if(!cfg.enabled)throw error(503,'Yiron integration is not configured','CONFIG_DISABLED');
 const src=(await client.query('SELECT id,enabled FROM legacy_api_sources WHERE id=$1',[LEGACY_BRANCH_SOURCE])).rows[0];
 if(!src?.enabled)throw error(409,'Yiron Branches ingestion is disabled until the source contract is verified','SOURCE_DISABLED');
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['yiron-refresh:'+LEGACY_BRANCH_SOURCE]);
 let job=(await client.query("SELECT id,state FROM legacy_refresh_jobs WHERE source_id=$1 AND state IN ('queued','running','retry_wait') ORDER BY created_at DESC LIMIT 1",[LEGACY_BRANCH_SOURCE])).rows[0];
 const reused=!!job;
 if(!job){
  const id=randomUUID();
  job=(await client.query("INSERT INTO legacy_refresh_jobs(id,source_id,trigger_kind,requested_by) VALUES($1,$2,$3,$4) RETURNING id,state",[id,LEGACY_BRANCH_SOURCE,trigger,actorId])).rows[0];
 }
 await client.query('INSERT INTO legacy_refresh_requests(job_id,trigger_kind,requested_by) VALUES($1,$2,$3)',[job.id,trigger,actorId]);
 await client.query('INSERT INTO legacy_refresh_audit(job_id,source_id,actor_id,action,details) VALUES($1,$2,$3,$4,$5)',[job.id,LEGACY_BRANCH_SOURCE,actorId,reused?'refresh_reused':'refresh_requested',JSON.stringify({trigger})]);
 return {jobId:job.id,state:job.state,reused};
}

async function terminalFailure(pool,jobId,problem){
 const retriable=temporaryCodes.has(problem.code);
 return transaction(pool,async client=>{
  const current=(await client.query('SELECT id,state,attempt FROM legacy_refresh_jobs WHERE id=$1 FOR UPDATE',[jobId])).rows[0];
  if(!current||!['running','retry_wait'].includes(current.state))return {done:true};
  const nextAttempt=Number(current.attempt)+1;
  const canRetry=retriable&&nextAttempt<=3;
  const state=canRetry?'retry_wait':'failed';
  const delay=Math.min(60,2**nextAttempt);
  await client.query("UPDATE legacy_refresh_jobs SET state=$2,attempt=$3,next_attempt_at=CASE WHEN $4::boolean THEN now()+($5::int*interval '1 second') ELSE NULL END,lease_owner=NULL,lease_until=NULL,error_code=$6,error_summary=$7,finished_at=CASE WHEN $4::boolean THEN NULL ELSE now() END WHERE id=$1",[jobId,state,nextAttempt,canRetry,delay,problem.code||'VALIDATION_FAILED',String(problem.message||'Refresh failed').slice(0,500)]);
  if(!canRetry)await client.query("UPDATE legacy_dataset_versions SET status='rejected',rejection_reason=$2 WHERE job_id=$1 AND status='staging'",[jobId,String(problem.message||'Refresh failed').slice(0,500)]);
  await client.query('INSERT INTO legacy_refresh_audit(job_id,source_id,action,details) VALUES($1,$2,$3,$4)',[jobId,LEGACY_BRANCH_SOURCE,canRetry?'refresh_retry':'refresh_failed',JSON.stringify({code:problem.code||'VALIDATION_FAILED',attempt:nextAttempt})]);
  return {done:!canRetry,retryAfterSeconds:canRetry?delay:0,state};
 });
}

async function stageAndMaybePublish(pool,jobId,pageFrom,rows){
 return transaction(pool,async client=>{
  await client.query("SET LOCAL lock_timeout='5s'");
  const job=(await client.query('SELECT * FROM legacy_refresh_jobs WHERE id=$1 FOR UPDATE',[jobId])).rows[0];
  if(!job||job.state!=='running'||!job.lease_until||new Date(job.lease_until)<new Date())return {done:false};
  const versionId=(await client.query("SELECT id FROM legacy_dataset_versions WHERE job_id=$1",[jobId])).rows[0]?.id||randomUUID();
  await client.query("INSERT INTO legacy_dataset_versions(id,source_id,job_id) VALUES($1,$2,$3) ON CONFLICT(job_id) DO NOTHING",[versionId,LEGACY_BRANCH_SOURCE,jobId]);
  const batch=await client.query('INSERT INTO legacy_refresh_batches(job_id,page_from,page_to,response_count,response_hash,completed_at) VALUES($1,$2,$3,$4,$5,now()) ON CONFLICT(job_id,page_from,page_to) DO NOTHING RETURNING id',[jobId,pageFrom,pageFrom+LEGACY_PAGE_SIZE-1,rows.length,digest(rows.map(r=>r.hash))]);
  if(!batch.rowCount)return {done:false};
  // A conflicting ID across pages is a validation failure, not a silent upsert.
  for(const row of rows)await client.query('INSERT INTO legacy_source_records(dataset_version_id,source_record_id,payload,payload_hash) VALUES($1,$2,$3,$4)',[versionId,row.id,row.payload,row.hash]);
  await client.query('UPDATE legacy_refresh_jobs SET fetched_count=fetched_count+$2,validated_count=validated_count+$2,lease_owner=NULL,lease_until=NULL WHERE id=$1',[jobId,rows.length]);
  if(rows.length===LEGACY_PAGE_SIZE)return {done:false};
  const count=Number((await client.query('SELECT count(*) AS n FROM legacy_source_records WHERE dataset_version_id=$1',[versionId])).rows[0].n);
  if(count<1)throw error(422,'Refusing to publish an empty Branches dataset');
  const previous=(await client.query("SELECT id,record_count FROM legacy_dataset_versions WHERE source_id=$1 AND status='published' FOR UPDATE",[LEGACY_BRANCH_SOURCE])).rows[0];
  if(previous&&count<Math.ceil(Number(previous.record_count)*0.8))
   throw error(422,'Branches count decreased more than 20%; refresh quarantined for review');
  if(previous){
   await client.query("INSERT INTO legacy_record_changes(source_id,dataset_version_id,source_record_id,change_kind,old_hash,new_hash) SELECT $1,$2,COALESCE(n.source_record_id,o.source_record_id),CASE WHEN o.source_record_id IS NULL THEN 'added' WHEN n.source_record_id IS NULL THEN 'removed' ELSE 'changed' END,o.payload_hash,n.payload_hash FROM legacy_source_records n FULL OUTER JOIN legacy_source_records o ON n.source_record_id=o.source_record_id AND o.dataset_version_id=$3 WHERE (n.dataset_version_id=$2 OR (n.dataset_version_id IS NULL AND o.dataset_version_id=$3)) AND n.payload_hash IS DISTINCT FROM o.payload_hash",[LEGACY_BRANCH_SOURCE,versionId,previous.id]);
   await client.query("UPDATE legacy_dataset_versions SET status='superseded' WHERE id=$1",[previous.id]);
  }else{
   await client.query("INSERT INTO legacy_record_changes(source_id,dataset_version_id,source_record_id,change_kind,new_hash) SELECT $1,$2,source_record_id,'added',payload_hash FROM legacy_source_records WHERE dataset_version_id=$2",[LEGACY_BRANCH_SOURCE,versionId]);
  }
  await client.query("UPDATE legacy_dataset_versions SET status='published',record_count=$2,validated_at=now(),published_at=now() WHERE id=$1",[versionId,count]);
  await client.query("UPDATE legacy_refresh_jobs SET state='succeeded',finished_at=now(),lease_owner=NULL,lease_until=NULL,error_code=NULL,error_summary=NULL WHERE id=$1",[jobId]);
  await client.query('INSERT INTO legacy_refresh_audit(job_id,source_id,action,details) VALUES($1,$2,$3,$4)',[jobId,LEGACY_BRANCH_SOURCE,'dataset_published',JSON.stringify({count})]);
  return {done:true,publishedCount:count};
 });
}

export async function stepLegacyBranchRefresh(pool,jobId,{fetchPage=fetchYironSource}={}){
 try{
  const claim=await transaction(pool,async client=>{
   const job=(await client.query('SELECT * FROM legacy_refresh_jobs WHERE id=$1 FOR UPDATE',[jobId])).rows[0];
   if(!job||['succeeded','failed','cancelled'].includes(job.state))return {done:true};
   if(job.state==='retry_wait'&&job.next_attempt_at&&new Date(job.next_attempt_at)>new Date())return {done:false,retryAfterSeconds:Math.max(1,Math.ceil((new Date(job.next_attempt_at)-Date.now())/1000))};
   if(job.state==='running'&&job.lease_until&&new Date(job.lease_until)>new Date())return {done:false,retryAfterSeconds:5};
   const count=Number((await client.query('SELECT count(*) AS n FROM legacy_refresh_batches WHERE job_id=$1',[jobId])).rows[0].n);
   if(count>=MAX_PAGES)throw error(422,'Maximum Branches pages reached; source completeness is unverified');
   await client.query("UPDATE legacy_refresh_jobs SET state='running',started_at=COALESCE(started_at,now()),lease_owner=$2,lease_until=now()+interval '45 seconds',next_attempt_at=NULL WHERE id=$1",[jobId,randomUUID()]);
   return {done:false,from:count*LEGACY_PAGE_SIZE+1};
  });
  if(claim.done||!claim.from)return claim;
  const from=claim.from,to=from+LEGACY_PAGE_SIZE-1;
  const response=await fetchPage(LEGACY_BRANCH_SOURCE,new URL('https://saicrm.invalid/?from='+from+'&to='+to));
  const rows=normalizeLegacyBranchPage(response,{from:String(from),to:String(to)});
  return await stageAndMaybePublish(pool,jobId,from,rows);
 }catch(problem){
  return terminalFailure(pool,jobId,problem);
 }
}

export async function processLegacyBranchRefresh(pool,jobId,{budgetMs=30000,fetchPage=fetchYironSource}={}){
 const deadline=Date.now()+budgetMs;
 let outcome={done:false};
 while(Date.now()<deadline-1200&&!outcome.done){
  outcome=await stepLegacyBranchRefresh(pool,jobId,{fetchPage});
  if(outcome.retryAfterSeconds){
   if(Date.now()+outcome.retryAfterSeconds*1000>=deadline-1200)break;
   await new Promise(resolve=>setTimeout(resolve,outcome.retryAfterSeconds*1000));
  }
 }
 return outcome;
}
