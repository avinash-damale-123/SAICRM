import {randomUUID,createHash} from 'node:crypto';
import {branchMasters,branchMasterView} from './branch-masters.mjs';
import {branchMasterPermissions} from './resources.mjs';
import {fail,keys,object,own,text,isUUID,schema,fieldKeys,queryOptions,compileWhere,compileOrder,selectSQL,joinSQL,integer} from './branch-master-schema.mjs';
import {moduleKey,loadPolicy,effectivePolicy,preferences} from './branch-master-policy.mjs';
import {readUpload,fileBytes,csvBytes,fileLimits,importFields,fileResponse,exportTimeZone,exportFilename,exportColumns,exportGuidelines} from './branch-master-files.mjs';
import {sourceTimeZone} from './time-zone.mjs';
const digest=value=>createHash('sha256').update(value).digest('hex');
const requireAction=(user,action)=>{if(branchMasterPermissions(user)[action]!==true)fail(403,'You do not have permission for this operation');};
const terminal=new Set(['completed','partial','failed','cancelled']);
export function jobView(job){
 const metrics=job.state?.summary||{},expired=new Date(job.expires_at)<=new Date(),done=terminal.has(job.status),active=['queued','running'].includes(job.status);
 const processed=Number(metrics.processed)||0,remaining=Math.max(0,job.total-job.succeeded-job.failed-job.skipped),processingMs=Number(metrics.processingMs)||0;
 const legacyUnknown=job.kind==='import'&&job.succeeded>0&&metrics.created===undefined&&job.request?.mode==='upsert';
 const created=metrics.created!==undefined?Number(metrics.created):job.request?.mode==='create'?job.succeeded:legacyUnknown?null:0,updated=metrics.updated!==undefined?Number(metrics.updated):job.request?.mode==='update'?job.succeeded:legacyUnknown?null:0;
 const summary=job.kind==='export'?Object.fromEntries(['scope','columnMode','columns','format','timeZone','query'].map(k=>[k,job.request?.[k]])):job.kind==='import'?Object.fromEntries(['mode','atomic','mapping','timeZone'].map(k=>[k,job.request?.[k]])):{};
 return {id:job.id,kind:job.kind,status:job.status,filename:job.filename,total:job.total,succeeded:job.succeeded,failed:job.failed,skipped:job.skipped,created,updated,outcomeCountsKnown:!legacyUnknown,error:job.error,createdAt:job.created_at,updatedAt:job.updated_at,expiresAt:job.expires_at,expired,timeZone:job.request?.timeZone??(job.kind==='export'?'UTC':null),summary,request:summary,processingSeconds:Math.round(processingMs/1000),elapsedSeconds:Math.max(0,Math.floor((new Date(job.updated_at)-new Date(job.created_at))/1000)),estimatedSecondsRemaining:done?0:active&&!expired&&!job.error&&processed&&processingMs?Math.max(1,Math.ceil(remaining*processingMs/processed/1000)):null,progress:job.total?Math.min(100,Math.floor((job.succeeded+job.failed+job.skipped)/job.total*100)):done?100:0};
}
export function exportQuerySummary(scope,options){
 const {q,status,archived,filters,sorts,page,pageSize}=options;
 // Selected IDs define membership independently of any visible list filters.
 if(scope==='selected')return {sorts};
 if(scope==='all')return {q:'',status:'all',archived:'all',filters:{logic:'and',conditions:[]},sorts};
 return {q,status,archived,filters,sorts,...(scope==='page'?{page,pageSize}:{})};
}
async function jobFor(client,user,id,lock=false,allowExpired=false){
 if(!isUUID(id))fail(400,'Invalid job');
 const job=(await client.query('SELECT * FROM crm_transfer_jobs WHERE id=$1 AND user_id=$2 AND module_key=$3'+(lock?' FOR UPDATE':''),[id,user.id,moduleKey])).rows[0];
 if(!job)fail(404,'Transfer job not found');requireAction(user,job.kind==='bulk'?job.request.permission:job.kind);
 if(job.kind==='import'&&job.succeeded>0&&job.state?.summary?.created===undefined&&new Date(job.expires_at)>new Date()){const counts=(await client.query("SELECT count(*) FILTER(WHERE expected_version IS NULL)::int AS created,count(*) FILTER(WHERE expected_version IS NOT NULL)::int AS updated FROM crm_transfer_items WHERE job_id=$1 AND status='succeeded'",[id])).rows[0];if(counts.created+counts.updated===job.succeeded)job.state={...job.state,summary:{...job.state?.summary,...counts}};}
 if(!allowExpired&&new Date(job.expires_at)<=new Date())fail(410,'This job has expired; its files are no longer available. Generate a new export or upload a corrected file.');return job;
}
export async function cleanupExpired(client){
 // Hard expiry is checked on every download. Sweeps remove bytes and source rows globally without needing the owner to return.
 const files=await client.query('DELETE FROM crm_transfer_files f USING crm_transfer_jobs j WHERE f.job_id=j.id AND j.expires_at<=now()');
 const items=await client.query('DELETE FROM crm_transfer_items i USING crm_transfer_jobs j WHERE i.job_id=j.id AND j.expires_at<=now()');
 await client.query("UPDATE crm_transfer_jobs SET state=jsonb_build_object('summary',COALESCE(state->'summary','{}'::jsonb)) WHERE expires_at<=now() AND (state?'rows' OR state?'headers' OR state?'recommended')");
 await client.query("UPDATE crm_transfer_jobs SET status='failed',error='This transfer expired before completion. Start a new transfer.',updated_at=now() WHERE expires_at<=now() AND status IN ('uploaded','validated','queued','running')");
 return {filesDeleted:files.rowCount,sourceRowsDeleted:items.rowCount};
}
async function throttle(client,user){await cleanupExpired(client,user);const n=Number((await client.query("SELECT count(*) FROM crm_transfer_jobs WHERE user_id=$1 AND created_at>now()-interval '1 hour'",[user.id])).rows[0].count);if(n>=30)fail(429,'Too many transfer jobs; try again later');}
async function audit(client,user,action,id){await client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)',[user.id,action,moduleKey,id]);}
async function putItems(client,id,items){for(let i=0;i<items.length;i+=500){await client.query(`INSERT INTO crm_transfer_items(job_id,ordinal,record_id,expected_version,payload,status,error) SELECT $1,x.ordinal,x.record_id,x.expected_version,x.payload,x.status,x.error FROM jsonb_to_recordset($2::jsonb) AS x(ordinal integer,record_id uuid,expected_version integer,payload jsonb,status text,error text)`,[id,JSON.stringify(items.slice(i,i+500))]);}}
export async function uploadImport(client,user,body){requireAction(user,'import');keys(body,['filename','data']);const parsed=await readUpload(body.filename,body.data),fingerprint=digest(Buffer.from(body.data,'base64'));await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['records-import:'+user.id+':'+fingerprint]);const existing=(await client.query("SELECT * FROM crm_transfer_jobs WHERE user_id=$1 AND module_key=$2 AND kind='import' AND fingerprint=$3",[user.id,moduleKey,fingerprint])).rows[0];if(existing&&new Date(existing.expires_at)>new Date()){const duplicate=terminal.has(existing.status),view=jobView(existing);return {job:view,headers:existing.state.headers||[],sample:existing.state.rows?.slice(0,5)||[],recommended:existing.state.recommended||{},reused:true,duplicate,message:duplicate?'This exact file was already processed. No new records were imported. Original result: '+(view.outcomeCountsKnown?view.created+' created, '+view.updated+' updated':view.succeeded+' imported successfully (created/update split not recorded)')+', '+view.failed+' failed and '+view.skipped+' unchanged/skipped. Review the original outcome; correct and upload failed rows separately.':'This file already has an import in progress. Continue the existing job; no duplicate job was created.'};}if(existing)await client.query('UPDATE crm_transfer_jobs SET fingerprint=NULL WHERE id=$1',[existing.id]);await throttle(client,user);const id=randomUUID(),job=(await client.query("INSERT INTO crm_transfer_jobs(id,user_id,module_key,kind,status,fingerprint,filename,state,total) VALUES($1,$2,$3,'import','uploaded',$4,$5,$6,$7) RETURNING *",[id,user.id,moduleKey,fingerprint,body.filename,parsed,parsed.rows.length])).rows[0];await audit(client,user,'Import file uploaded for validation',id);return {job:jobView(job),headers:parsed.headers,sample:parsed.rows.slice(0,5),recommended:parsed.recommended,reused:false};}
function mappedRows(state,mapping){
 keys(mapping,importFields.map(f=>f.key));
 for(const required of ['businessLineCode','regionCode','countryCode','name','code','city','timeZone'])if(!own(mapping,required))fail(400,'Map all mandatory Branch fields');
 const used=new Set();for(const index of Object.values(mapping)){if(!Number.isInteger(index)||index<0||index>=state.headers.length||used.has(index))fail(400,'Each source column may be mapped once');used.add(index);}
 const rows=state.rows.map((values,i)=>{const payload=Object.fromEntries(Object.entries(mapping).map(([k,j])=>[k,String(values[j]||'').trim()]));let error='';
  try{
   for(const k of ['businessLineCode','regionCode','countryCode','name','city','timeZone'])payload[k]=text(payload[k],k,150,true);
   payload.businessLineCode=payload.businessLineCode.toUpperCase();payload.regionCode=payload.regionCode.toUpperCase();payload.countryCode=payload.countryCode.toUpperCase();
   payload.code=text(payload.code,'Branch Code',20,true).toUpperCase();
   if(!/^[A-Z0-9][A-Z0-9-]{0,19}$/.test(payload.code))fail(400,'Invalid Branch Code');
   if(payload.displayId&&!/^BR-\d{3,}$/.test(payload.displayId))fail(400,'Branch ID must use BR-001 style');
   for(const f of importFields.filter(f=>!f.required&&!f.matchOnly)){if(own(payload,f.key))payload[f.key]=text(payload[f.key],f.label,1000);}
  }catch(e){error=e.message;}
  return {ordinal:i+2,record_id:null,expected_version:null,payload,status:error?'failed':'pending',error:error||null};
 });
 const codeCounts=new Map(),nameCounts=new Map();
 for(const row of rows){if(row.error)continue;codeCounts.set(row.payload.code,(codeCounts.get(row.payload.code)||0)+1);const key=[row.payload.businessLineCode,row.payload.countryCode,row.payload.name.toLowerCase()].join('|');nameCounts.set(key,(nameCounts.get(key)||0)+1);}
 for(const row of rows){if(row.error)continue;const key=[row.payload.businessLineCode,row.payload.countryCode,row.payload.name.toLowerCase()].join('|');if(codeCounts.get(row.payload.code)>1){row.status='failed';row.error='Duplicate Branch Code within the uploaded file';}else if(nameCounts.get(key)>1){row.status='failed';row.error='Duplicate Branch Name within the same Business Line and Country in this file';}}
 return rows;
}
export async function validateImport(client,user,id,body){
 requireAction(user,'import');keys(body,['mapping','mode','atomic','timeZone']);const auditTimeZone=sourceTimeZone(body.timeZone);
 if(!['create','update','upsert'].includes(body.mode)||typeof body.atomic!=='boolean')fail(400,'Choose Create, Update or Upsert and an explicit import mode');
 if(body.mode!=='update')requireAction(user,'create');if(body.mode!=='create')requireAction(user,'edit');
 const job=await jobFor(client,user,id,true);if(!['uploaded','validated'].includes(job.status))return {job:jobView(job),reused:true};
 if(body.atomic&&job.total>fileLimits.atomicRows)fail(400,'All-or-nothing imports support up to 250 rows');
 const rows=mappedRows(job.state,body.mapping);
 if(body.mode==='update')for(const row of rows)if(!row.payload.displayId&&!row.error){row.status='failed';row.error='Branch ID is required for Update Import';}
 const valid=rows.filter(r=>!r.error);
 const blCodes=[...new Set(valid.map(r=>r.payload.businessLineCode))];
 const regionCodes=[...new Set(valid.map(r=>r.payload.regionCode))];
 const countryCodes=[...new Set(valid.map(r=>r.payload.countryCode))];
 const [lines,regions,countries]=(await Promise.all([
  client.query("SELECT id,upper(code) code FROM business_lines WHERE upper(code)=ANY($1::text[]) AND status='Active' AND archived_at IS NULL AND deleted_at IS NULL",[blCodes]),
  client.query("SELECT id,upper(code) code,business_line_id FROM regions WHERE upper(code)=ANY($1::text[]) AND status='Active' AND archived_at IS NULL AND deleted_at IS NULL",[regionCodes]),
  client.query("SELECT c.id,upper(c.code) code,cbl.business_line_id FROM countries c JOIN country_business_lines cbl ON cbl.country_id=c.id WHERE upper(c.code)=ANY($1::text[]) AND cbl.removed_at IS NULL AND c.status='Active' AND c.archived_at IS NULL AND c.deleted_at IS NULL",[countryCodes])
 ])).map(r=>r.rows);
 const lineMap=new Map(lines.map(r=>[r.code,r.id]));
 const regionMap=new Map(regions.map(r=>[r.code+'|'+r.business_line_id,r.id]));
 const countryMap=new Map(countries.map(r=>[r.code+'|'+r.business_line_id,r.id]));
 for(const row of valid){const p=row.payload,line=lineMap.get(p.businessLineCode);if(!line){row.error='Unknown or inactive Business Line Code';row.status='failed';continue;}const region=regionMap.get(p.regionCode+'|'+line),country=countryMap.get(p.countryCode+'|'+line);if(!region||!country){row.error=!region?'Branch not Active in this Business Line':'Country is not Active or lacks Business Line presence';row.status='failed';continue;}p.businessLineRef=line;p.regionRef=region;p.countryRef=country;}
 const eligible=rows.filter(r=>!r.error);
 const existing=(await client.query("SELECT r.id,r.display_id,r.business_line_id,r.country_id,r.region_id,r.name,r.code,r.version,r.archived_at,r.deleted_at,lower(regexp_replace(btrim(r.name),'[[:space:]]+',' ','g')) name_key FROM branch_masters r WHERE r.display_id=ANY($1::text[]) OR r.code=ANY($2::text[]) OR (r.business_line_id=ANY($3::uuid[]) AND r.country_id=ANY($4::uuid[]) AND lower(regexp_replace(btrim(r.name),'[[:space:]]+',' ','g'))=ANY($5::text[]))",[
  eligible.map(r=>r.payload.displayId||''),eligible.map(r=>r.payload.code),eligible.map(r=>r.payload.businessLineRef),eligible.map(r=>r.payload.countryRef),eligible.map(r=>r.payload.name.toLowerCase())
 ])).rows;
 const byId=new Map(existing.map(r=>[r.display_id,r])),byCode=new Map(existing.map(r=>[r.code,r])),byName=new Map(existing.map(r=>[r.business_line_id+'|'+r.country_id+'|'+r.name_key,r]));
 for(const row of eligible){const p=row.payload,match=p.displayId?byId.get(p.displayId):null,key=p.businessLineRef+'|'+p.countryRef+'|'+p.name.toLowerCase();let error='';
  if(body.mode==='update'&&!match)error='Branch ID not found';
  else if(body.mode==='create'&&(byCode.has(p.code)||byName.has(key)))error='Branch exists: Create cannot overwrite';
  else if(body.mode==='upsert'&&p.displayId&&!match)error='Branch ID not found';
  else if(match&&(match.archived_at||match.deleted_at))error='Restore Archived or Deleted Branch before updating';
  else if(byCode.has(p.code)&&byCode.get(p.code).id!==match?.id)error='Branch Code already reserved';
  else if(byName.has(key)&&byName.get(key).id!==match?.id)error='Branch Name already used within Business Line and Country';
  if(error){row.status='failed';row.error=error;continue;}
  row.record_id=match?.id||null;row.expected_version=match?.version||null;
  if(match&&match.name===p.name&&match.code===p.code&&match.business_line_id===p.businessLineRef&&match.region_id===p.regionRef&&match.country_id===p.countryRef&&Object.keys(p).every(k=>!['name','code','businessLineRef','regionRef','countryRef'].includes(k)||true)&&false){row.status='skipped';row.error='No change';}
 }
 await client.query('DELETE FROM crm_transfer_items WHERE job_id=$1',[id]);await putItems(client,id,rows);
 const failed=rows.filter(r=>r.status==='failed').length,unchanged=rows.filter(r=>r.status==='skipped').length,validationToken=randomUUID();
 const updated=(await client.query("UPDATE crm_transfer_jobs SET status='validated',request=$2,failed=$3,succeeded=0,skipped=$4,error=NULL,updated_at=now() WHERE id=$1 RETURNING *",[id,{mapping:body.mapping,mode:body.mode,atomic:body.atomic,timeZone:auditTimeZone,validationToken},failed,unchanged])).rows[0];
 await audit(client,user,'Branch Import validated',id);
 return {job:jobView(updated),validationToken,valid:rows.length-failed-unchanged,invalid:failed,unchanged,errors:rows.filter(r=>r.status==='failed').slice(0,200).map(r=>({row:r.ordinal,message:r.error})),preview:rows.slice(0,10).map(r=>({row:r.ordinal,...r.payload,result:r.error||(r.record_id?'Update':'Create')}))};
}
async function selection(client,body,effective){const options=queryOptions(body.query||{},effective.allowed);if(!['page','selected','matching','all','custom'].includes(body.scope))fail(400,'Choose a record scope');if(body.scope==='all'){if(body.confirmAll!==true)fail(400,'Explicit confirmation is required for All Authorized Records');options.q='';options.filters={logic:'and',conditions:[]};options.status='all';options.archived='all';}let where=compileWhere(options,effective.allowed);if(body.scope==='selected'){if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>250||new Set(body.ids).size!==body.ids.length||body.ids.some(x=>!isUUID(x)))fail(400,'Select 1 to 250 distinct records');where={sql:' WHERE r.id=ANY($1::uuid[])',params:[body.ids]};}const count=Number((await client.query('SELECT count(*) '+joinSQL+where.sql,where.params)).rows[0].count);let limit='',params=[...where.params];if(body.scope==='page'){params.push(options.pageSize,(options.page-1)*options.pageSize);limit=' LIMIT $'+(params.length-1)+' OFFSET $'+params.length;}const total=body.scope==='page'?Math.max(0,Math.min(options.pageSize,count-(options.page-1)*options.pageSize)):count;if(body.scope==='selected'&&total!==body.ids.length)fail(409,'Some selected records are no longer available');return {options,where,params,limit,total};}
function chosenColumns(body,effective,prefs){const mode=body.columnMode||'current';let columns=mode==='default'?effective.defaults:mode==='my'?prefs.myColumns:mode==='all'?effective.allowed:body.columns||prefs.selectedColumns;if(!['default','my','current','all','custom'].includes(mode)||!Array.isArray(columns)||!columns.length||columns.length>fieldKeys.length||new Set(columns).size!==columns.length||columns.some(c=>!effective.allowed.includes(c)))fail(403,'Export columns must be available to this user');return effective.order.filter(k=>columns.includes(k));}
export async function exportPlan(client,user,body){requireAction(user,'export');const timeZone=exportTimeZone(body.timeZone===undefined?'UTC':body.timeZone);keys(body,['scope','ids','query','columnMode','columns','format','confirmAll','requestId','expectedCount','timeZone']);const policy=effectivePolicy(await loadPolicy(client),user),prefs=await preferences(client,user,policy);const columns=chosenColumns(body,policy,prefs),selected=await selection(client,body,policy);if(!['csv','xlsx'].includes(body.format||'csv'))fail(400,'Choose CSV or XLSX');if(selected.total>fileLimits.exportRows)fail(400,'Limit is 500,000 records per export; narrow the filters');return {count:selected.total,columns,outputColumns:exportColumns(columns),query:exportQuerySummary(body.scope,selected.options),timeZone,parts:Math.max(1,Math.ceil(selected.total/fileLimits.exportPartRows)),limit:fileLimits.exportRows,policyVersion:policy.version,format:body.format||'csv'};}
export async function createExport(client,user,body){const plan=await exportPlan(client,user,body);if(body.expectedCount!==plan.count)fail(409,'The matching count changed. Review the export again');if(!isUUID(body.requestId))fail(400,'A unique request ID is required');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['records-export:'+user.id+':'+body.requestId]);const existing=(await client.query("SELECT * FROM crm_transfer_jobs WHERE user_id=$1 AND kind='export' AND fingerprint=$2",[user.id,body.requestId])).rows[0];if(existing)return {job:jobView(existing),reused:true};await throttle(client,user);const effective=effectivePolicy(await loadPolicy(client),user),selected=await selection(client,body,effective),id=randomUUID();await client.query("INSERT INTO crm_transfer_jobs(id,user_id,module_key,kind,status,fingerprint,filename,request,total) VALUES($1,$2,$3,'export','queued',$4,$5,$6,$7)",[id,user.id,moduleKey,body.requestId,exportFilename('Branches',plan.format,{timeZone:plan.timeZone}),{...body,query:exportQuerySummary(body.scope,selected.options),columns:plan.columns,format:plan.format,timeZone:plan.timeZone,policyVersion:effective.version},plan.count]);const prefix='INSERT INTO crm_transfer_items(job_id,ordinal,record_id,expected_version) SELECT $'+(selected.params.length+1)+',row_number() OVER ('+compileOrder(selected.options.sorts).trim()+'),r.id,r.version ';await client.query(prefix+joinSQL+selected.where.sql+compileOrder(selected.options.sorts)+selected.limit,[...selected.params,id]);await audit(client,user,'Export queued ('+plan.count+' records)',id);return {job:jobView(await jobFor(client,user,id)),workJob:id};}
const bulkActions={archive:['archive','archive'],unarchive:['restore','restore'],softDelete:['softDelete','soft-delete'],restoreDeleted:['restoreDeleted','restore-deleted'],deactivate:['edit','Inactive'],reactivate:['edit','Active'],reassignOwner:['reassignOwner','owner']};
export async function createBulk(client,user,body){
 keys(body,['action','reason','ownerId','targetStatus','scope','ids','query','expectedCount','requestId','timeZone']);const timeZone=sourceTimeZone(body.timeZone);
 if(!own(bulkActions,body.action))fail(400,'Unsupported bulk action');const [permission]=bulkActions[body.action];requireAction(user,permission);
 const why=text(body.reason,'Reason',500,true);if(body.action==='reassignOwner'&&!/^UID-\d{6,}$/.test(body.ownerId||''))fail(400,'Select an eligible Owner ID');
 const effective=effectivePolicy(await loadPolicy(client),user);if(!['selected','matching'].includes(body.scope))fail(400,'Choose selected records or all matching records');
 const selected=await selection(client,body,effective);if(selected.total>50000)fail(400,'At most 50,000 records per bulk operation');if(body.expectedCount!==selected.total)fail(409,'The record count changed. Review selection again');
 if(!isUUID(body.requestId))fail(400,'Unique request ID is required');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['records-bulk:'+user.id+':'+body.requestId]);
 const existing=(await client.query("SELECT * FROM crm_transfer_jobs WHERE user_id=$1 AND kind='bulk' AND fingerprint=$2",[user.id,body.requestId])).rows[0];if(existing)return {job:jobView(existing),reused:true};
 await throttle(client,user);const id=randomUUID();await client.query("INSERT INTO crm_transfer_jobs(id,user_id,module_key,kind,status,fingerprint,request,total) VALUES($1,$2,$3,'bulk','queued',$4,$5,$6)",[id,user.id,moduleKey,body.requestId,{...body,reason:why,timeZone,permission,policyVersion:effective.version},selected.total]);
 await client.query('INSERT INTO crm_transfer_items(job_id,ordinal,record_id,expected_version) SELECT $'+(selected.params.length+1)+',row_number() OVER ('+compileOrder(selected.options.sorts).trim()+'),r.id,r.version '+joinSQL+selected.where.sql+compileOrder(selected.options.sorts),[...selected.params,id]);
 await audit(client,user,'Bulk '+body.action+' queued ('+selected.total+')',id);return {job:jobView(await jobFor(client,user,id)),workJob:id};
}
export async function startJob(client,user,id,body={}){keys(body,['validationToken']);const job=await jobFor(client,user,id,true);if(terminal.has(job.status))return {job:jobView(job),reused:true};if(job.kind==='import'){if(job.status==='validated'&&(!isUUID(body.validationToken)||!isUUID(job.request.validationToken)||body.validationToken!==job.request.validationToken))fail(409,'Import validation changed or expired. Review the file again before confirming.');if(!['validated','running','queued'].includes(job.status))fail(400,'Validate the file before importing');if(job.request.atomic&&job.failed)fail(400,'All-or-nothing import has invalid rows; correct them first');if(job.failed+job.skipped>=job.total)fail(400,'There are no new or changed valid rows to import. Review duplicates, unchanged rows and errors.');if(job.request.mode!=='update')requireAction(user,'create');if(job.request.mode!=='create')requireAction(user,'edit');}await client.query("UPDATE crm_transfer_jobs SET status='queued',error=NULL,updated_at=now() WHERE id=$1",[id]);return {job:{...jobView(job),status:'queued'},workJob:id};}
async function writeRow(client,user,item,job){
 const path=['branch-master'],p=item.payload||{};let method='POST',body={};
 if(job.kind==='import'){
  const {displayId,_result,businessLineCode,regionCode,countryCode,...input}=p;
  body={...input};if(item.record_id){path.push(item.record_id);method='PUT';body.version=item.expected_version;}
  return branchMasters({client,user,path,method,body,url:new URL('https://crm.invalid/api/branch-master')});
 }
 const [permission,action]=bulkActions[job.request.action];requireAction(user,permission);
 body={version:item.expected_version,reason:job.request.reason};path.push(item.record_id);
 if(['Active','Inactive'].includes(action)){method='PUT';body.status=action;}
 else if(action==='owner'){method='PUT';delete body.reason;body.ownerId=job.request.ownerId;}
 else path.push(action);
 return branchMasters({client,user,path,method,body,url:new URL('https://crm.invalid/api/branch-master')});
}
export async function stepJob(client,user,id){const started=Date.now();const job=await jobFor(client,user,id,true);if(terminal.has(job.status))return {job:jobView(job),done:true};if(!['running','queued'].includes(job.status))fail(400,'Confirm this job before running it');const effective=effectivePolicy(await loadPolicy(client),user);if(job.kind==='export'&&(job.request.columns.some(k=>!effective.allowed.includes(k))||job.request.policyVersion!==effective.version)){await client.query("UPDATE crm_transfer_jobs SET status='failed',error='Column policy changed. Create a new export.',updated_at=now() WHERE id=$1",[id]);return {job:jobView(await jobFor(client,user,id)),done:true};}
 if(job.kind==='export'&&job.total===0){const file=await fileBytes(job.request.format,job.request.columns,[],undefined,{...job.request,generatedAt:job.created_at});await client.query('INSERT INTO crm_transfer_files(job_id,part,filename,mime,bytes) VALUES($1,1,$2,$3,$4) ON CONFLICT DO NOTHING',[id,exportFilename('Branches',job.request.format,{generatedAt:job.created_at,timeZone:job.request.timeZone,suffix:'empty'}),file.mime,file.bytes]);}
 const batch=job.kind==='export'?fileLimits.exportPartRows:job.kind==='import'&&job.request.atomic?fileLimits.atomicRows:25;let items=(await client.query("SELECT * FROM crm_transfer_items WHERE job_id=$1 AND status='pending' ORDER BY ordinal LIMIT $2 FOR UPDATE",[id,batch])).rows;await client.query("UPDATE crm_transfer_jobs SET status='running',updated_at=now() WHERE id=$1",[id]);let succeeded=0,failed=0,skipped=0,created=0,updated=0;
 if(job.kind==='export'&&items.length){
  const rows=(await client.query(selectSQL+' WHERE r.id=ANY($1::uuid[])',[items.map(i=>i.record_id)])).rows;
  const map=new Map(rows.map(r=>[r.id,branchMasterView(r)]));
  const part=Number((await client.query('SELECT COALESCE(max(part),0)+1 AS part FROM crm_transfer_files WHERE job_id=$1',[id])).rows[0].part);
  let records=items.flatMap(i=>map.has(i.record_id)?[map.get(i.record_id)]:[]),file=await fileBytes(job.request.format,job.request.columns,records,undefined,{...job.request,generatedAt:job.created_at});
  // Wide Unicode data may need fewer rows per file. Keep the columns and selection intact and leave the remainder pending.
  while(file.bytes.length>2500000&&items.length>1){
   items=items.slice(0,Math.ceil(items.length/2));records=items.flatMap(i=>map.has(i.record_id)?[map.get(i.record_id)]:[]);
   file=await fileBytes(job.request.format,job.request.columns,records,undefined,{...job.request,generatedAt:job.created_at});
  }
  if(file.bytes.length>2500000)fail(413,'A record exceeds the export file safety limit; choose fewer columns');
  await client.query('INSERT INTO crm_transfer_files(job_id,part,filename,mime,bytes) VALUES($1,$2,$3,$4,$5)',[id,part,exportFilename('Branches',job.request.format,{generatedAt:job.created_at,timeZone:job.request.timeZone,suffix:'part-'+String(part).padStart(3,'0')}),file.mime,file.bytes]);
  const foundIds=items.filter(i=>map.has(i.record_id)).map(i=>i.record_id);
  await client.query("UPDATE crm_transfer_items SET status=CASE WHEN record_id=ANY($3::uuid[]) THEN 'succeeded' ELSE 'skipped' END,error=CASE WHEN record_id=ANY($3::uuid[]) THEN NULL ELSE 'Record is no longer available' END WHERE job_id=$1 AND ordinal=ANY($2::int[])",[id,items.map(i=>i.ordinal),foundIds]);
  succeeded=foundIds.length;skipped=items.length-succeeded;
 }
 else if(job.kind!=='export'&&items.length){const atomic=job.kind==='import'&&job.request.atomic;if(atomic)await client.query('SAVEPOINT atomic_import');let atomicError=null;for(const item of items){await client.query('SAVEPOINT transfer_row');try{const result=await writeRow(client,user,item,job);const action=job.kind==='import'?(item.record_id?'Updated':'Created'):'Updated';await client.query("UPDATE crm_transfer_items SET status='succeeded',error=NULL,payload=payload||$3::jsonb WHERE job_id=$1 AND ordinal=$2",[id,item.ordinal,JSON.stringify({_result:{action,displayId:result?.record?.displayId||item.payload.displayId||''}})]);await client.query('RELEASE SAVEPOINT transfer_row');if(job.kind==='import'){if(item.record_id)updated++;else created++;}succeeded++;}catch(e){await client.query('ROLLBACK TO SAVEPOINT transfer_row');await client.query('RELEASE SAVEPOINT transfer_row');const message=e.status&&e.status<500?e.message:'This row could not be processed; retry after review';if(atomic){atomicError='Row '+item.ordinal+': '+message;break;}await client.query("UPDATE crm_transfer_items SET status='failed',error=$3 WHERE job_id=$1 AND ordinal=$2",[id,item.ordinal,message]);failed++;}}if(atomic){if(atomicError){await client.query('ROLLBACK TO SAVEPOINT atomic_import');await client.query("UPDATE crm_transfer_items SET status='failed',error=$2 WHERE job_id=$1 AND status='pending'",[id,'No rows committed: '+atomicError]);failed=items.length;succeeded=0;created=0;updated=0;await client.query('UPDATE crm_transfer_jobs SET error=$2 WHERE id=$1',[id,'All-or-nothing import rolled back. '+atomicError]);}await client.query('RELEASE SAVEPOINT atomic_import');}}
 const previous=job.state?.summary||{},metrics={created:(Number(previous.created)||0)+created,updated:(Number(previous.updated)||0)+updated,processed:(Number(previous.processed)||0)+items.length,processingMs:(Number(previous.processingMs)||0)+Math.max(1,Date.now()-started)};
 await client.query("UPDATE crm_transfer_jobs SET succeeded=succeeded+$2,failed=failed+$3,skipped=skipped+$4,state=jsonb_set(state,'{summary}',$5::jsonb),updated_at=now() WHERE id=$1",[id,succeeded,failed,skipped,JSON.stringify(metrics)]);
 const pending=Number((await client.query("SELECT count(*) FROM crm_transfer_items WHERE job_id=$1 AND status='pending'",[id])).rows[0].count);
 if(!pending){
  const totals=(await client.query('SELECT succeeded,failed,skipped FROM crm_transfer_jobs WHERE id=$1',[id])).rows[0];
  const status=totals.failed?(totals.succeeded?'partial':'failed'):(totals.skipped&&job.kind!=='import'?'partial':'completed');
  await client.query("UPDATE crm_transfer_jobs SET status=$2,state=CASE WHEN kind='import' THEN jsonb_build_object('headers',state->'headers','recommended',state->'recommended','summary',state->'summary') ELSE state END,expires_at=CASE WHEN kind='export' THEN now()+interval '24 hours' ELSE expires_at END,updated_at=now() WHERE id=$1",[id,status]);
  await audit(client,user,job.kind+' '+status+'; '+totals.succeeded+' succeeded, '+totals.failed+' failed, '+totals.skipped+' unchanged/skipped',id);
 }
 return {job:jobView(await jobFor(client,user,id)),done:pending===0};
}
export async function jobDetails(client,user,id){
 const job=await jobFor(client,user,id,false,true),view=jobView(job);
 if(view.expired){await cleanupExpired(client);return {job:view,files:[],errors:[],reportParts:0,resultParts:0};}
 const files=(await client.query('SELECT part,filename,mime,octet_length(bytes) AS size FROM crm_transfer_files WHERE job_id=$1 ORDER BY part',[id])).rows;
 const errors=(await client.query("SELECT ordinal AS row,error AS message FROM crm_transfer_items WHERE job_id=$1 AND status=ANY($2::text[]) ORDER BY ordinal LIMIT 200",[id,job.kind==='import'?['failed']:['failed','skipped']])).rows;
 return {job:view,files,errors,reportParts:Math.ceil((job.failed+(job.kind==='import'?0:job.skipped))/1000),resultParts:job.kind==='import'&&job.status!=='uploaded'?Math.ceil(job.total/1000):0,workJob:['running','queued'].includes(job.status)&&!job.error?id:undefined};
}
export async function jobHistory(client,user){await cleanupExpired(client,user);const rows=(await client.query('SELECT * FROM crm_transfer_jobs WHERE user_id=$1 AND module_key=$2 ORDER BY created_at DESC LIMIT 50',[user.id,moduleKey])).rows;return {jobs:rows.filter(j=>branchMasterPermissions(user)[j.kind==='bulk'?j.request.permission:j.kind]).map(jobView)};}
export async function jobFile(client,user,id,part){const job=await jobFor(client,user,id);if(job.kind!=='export')fail(400,'This job has no export files');const effective=effectivePolicy(await loadPolicy(client),user);if(job.request.policyVersion!==effective.version||job.request.columns.some(k=>!effective.allowed.includes(k)))fail(403,'Column policy changed; generate a new export');const row=(await client.query('SELECT filename,mime,bytes FROM crm_transfer_files WHERE job_id=$1 AND part=$2',[id,integer(part,1,1,Math.max(1,job.total))])).rows[0];if(!row)fail(404,'File part is not ready');await audit(client,user,'Downloaded export part '+part,id);return fileResponse(row,row.filename);}
export async function errorReport(client,user,id,part){
 const job=await jobFor(client,user,id);
 const rows=(await client.query("SELECT ordinal,error,payload FROM crm_transfer_items WHERE job_id=$1 AND status=ANY($3::text[]) ORDER BY ordinal LIMIT 1000 OFFSET $2",[id,(integer(part,1,1,Math.max(1,Math.ceil(job.total/1000)))-1)*1000,job.kind==='import'?['failed']:['failed','skipped']])).rows;
 return fileResponse({bytes:csvBytes(['Source Row','Branch ID','Business Line Code','Branch Name','Branch Code','Branchal Manager','Remarks','Error'],rows.map(r=>[r.ordinal,r.payload.displayId||'',r.payload.businessLineCode||'',r.payload.name||'',r.payload.code||'',r.payload.city||'',r.payload.remarks||'',r.error])),mime:'text/csv;charset=utf-8'},exportFilename('Branches Failed Rows','csv',{generatedAt:job.created_at,suffix:'part-'+String(part).padStart(3,'0')}));
}
export async function jobGuidelines(client,user,id,format='csv'){
 const job=await jobFor(client,user,id);if(job.kind!=='export')fail(400,'Choose an export job');
 const effective=effectivePolicy(await loadPolicy(client),user);
 if(job.request.policyVersion!==effective.version||job.request.columns.some(k=>!effective.allowed.includes(k)))fail(403,'Column policy changed; generate a new export');
 const file=await exportGuidelines(format,job.request.columns,[],{...job.request,generatedAt:job.created_at,exportCount:job.succeeded});
 return fileResponse(file,exportFilename('Branches',format,{generatedAt:job.created_at,timeZone:job.request.timeZone,suffix:'export-guidelines'}));
}
export async function resultReport(client,user,id,part=1,format='csv'){
 const job=await jobFor(client,user,id);if(job.kind!=='import')fail(400,'Choose an import job');
 const rows=(await client.query('SELECT ordinal,status,error,payload,record_id,expected_version FROM crm_transfer_items WHERE job_id=$1 ORDER BY ordinal LIMIT 1000 OFFSET $2',[id,(integer(part,1,1,Math.max(1,Math.ceil(job.total/1000)))-1)*1000])).rows;
 const records=rows.map(r=>({sourceRow:r.ordinal,outcome:r.status==='succeeded'?(r.payload._result?.action||(r.expected_version?'Updated':'Created')):r.status==='skipped'?'Unchanged':r.status==='failed'?'Failed':'Pending',displayId:r.payload._result?.displayId||r.payload.displayId||'',businessLineCode:r.payload.businessLineCode||'',name:r.payload.name||'',code:r.payload.code||'',city:r.payload.city||'',remarks:r.payload.remarks||'',message:r.error||''}));
 const columns=['sourceRow','outcome','displayId','businessLineCode','name','code','city','remarks','message'],labels={sourceRow:'Source Row',outcome:'Outcome',businessLineCode:'Business Line Code',city:'Branchal Manager',remarks:'Remarks',message:'Result / correction needed'};
 return fileResponse(await fileBytes(format,columns,records,labels,{title:'Branches Import Outcome',generatedAt:job.created_at}),exportFilename('Branches Import Outcome',format,{generatedAt:job.created_at,suffix:'part-'+String(part).padStart(3,'0')}));
}
export async function cancelJob(client,user,id){const job=await jobFor(client,user,id,true);if(!terminal.has(job.status)){await client.query("UPDATE crm_transfer_jobs SET status='cancelled',updated_at=now() WHERE id=$1",[id]);await audit(client,user,'Transfer cancelled; committed batches retained',id);}return {job:jobView(await jobFor(client,user,id))};}
export async function bulkPlan(client,user,body){keys(body,['action','scope','ids','query']);if(!own(bulkActions,body.action))fail(400,'Unsupported bulk action');requireAction(user,bulkActions[body.action][0]);const effective=effectivePolicy(await loadPolicy(client),user);const selected=await selection(client,body,effective);if(selected.total>50000)fail(400,'Limit bulk actions to 50,000 records');return {count:selected.total,action:body.action};}
