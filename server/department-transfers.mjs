import {randomUUID,createHash} from 'node:crypto';
import ExcelJS from 'exceljs';
import {readUpload,csvBytes,fileResponse,fileLimits} from './records-files.mjs';
import {departmentPermissions} from './resources.mjs';

const moduleKey='department-master';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const fields=['name','code','level','parentCode','description','sortOrder'];
const columns=['displayId','scope','level','name','code','parent','status','description','sortOrder','updatedAt'];
const labels={displayId:'System ID',scope:'Scope',level:'Level',name:'Unit Name',code:'Unit Code',parent:'Parent Unit',status:'Status',description:'Description',sortOrder:'Display Order',updatedAt:'Last Modified'};
const levels=['Department','Sub-Department','Team'];
const cleanCode=v=>String(v??'').trim().toUpperCase();
const normalizeName=v=>String(v??'').trim().replace(/\s+/g,' ').toLowerCase();
const view=j=>({id:j.id,kind:j.kind,status:j.status,filename:j.filename,total:Number(j.total),succeeded:Number(j.succeeded),failed:Number(j.failed),skipped:Number(j.skipped),createdAt:j.created_at,updatedAt:j.updated_at,expiresAt:j.expires_at,error:j.error||null});
const keys=(object,allowed)=>{if(!object||typeof object!=='object'||Array.isArray(object)||Object.keys(object).some(k=>!allowed.includes(k)))fail(400,'Invalid transfer request fields');};
function requirePermission(user,key){if(!departmentPermissions(user)[key])fail(403,'Department '+key+' permission required');}
async function owned(client,user,id,lock=false){
 if(!uuid(id))fail(400,'Invalid transfer job');
 const row=(await client.query('SELECT * FROM crm_transfer_jobs WHERE id=$1 AND user_id=$2 AND module_key=$3 AND expires_at>now()'+(lock?' FOR UPDATE':''),[id,user.id,moduleKey])).rows[0];
 if(!row)fail(404,'Transfer job unavailable or expired');
 return row;
}
function mappingFor(headers,mapping){
 if(mapping!==undefined)keys(mapping,fields);
 const out={};
 for(const field of fields){
  const labelsFor={name:['unit name','name','department name'],code:['unit code','code','department code'],level:['level','unit level'],parentCode:['parent unit code','parent code','parentcode'],description:['description'],sortOrder:['display order','sort order','sortorder']};
  const index=mapping?.[field]??headers.findIndex(h=>labelsFor[field].includes(String(h).trim().toLowerCase()));
  if(index===-1||index===null||index==='')continue;
  if(!Number.isInteger(index)||index<0||index>=headers.length||Object.values(out).includes(index))fail(400,'Invalid field mapping for '+field);
  out[field]=index;
 }
 if(!['name','code','level'].every(x=>Number.isInteger(out[x])))fail(400,'Map Unit Name, Unit Code and Level');
 return out;
}
function payload(row,mapping,scope){
 const get=k=>mapping[k]===undefined?'':String(row[mapping[k]]??'').trim();
 const unit={scope,name:get('name'),code:cleanCode(get('code')),level:get('level'),parentCode:cleanCode(get('parentCode')),description:get('description'),sortOrder:get('sortOrder')?Number(get('sortOrder')):100};
 if(!unit.name||unit.name.length>150)throw Error('Unit Name must have 1–150 characters');
 if(!/^[A-Z0-9][A-Z0-9-]{1,29}$/.test(unit.code))throw Error('Unit Code must have 2–30 uppercase letters, digits or hyphens');
 if(!levels.includes(unit.level))throw Error('Choose Department, Sub-Department or Team');
 if(unit.description.length>1000)throw Error('Description exceeds 1,000 characters');
 if(!Number.isInteger(unit.sortOrder)||unit.sortOrder<1||unit.sortOrder>999999)throw Error('Invalid Display Order');
 if(unit.level==='Department'&&unit.parentCode)throw Error('Department must have no parent');
 if(unit.level!=='Department'&&!unit.parentCode)throw Error('Parent Unit Code is required for subordinate levels');
 return unit;
}
function parentValid(child,parent){
 return parent&&parent.scope===child.scope&&parent.status==='Active'&&!parent.archived_at&&!parent.deleted_at&&
 (child.level==='Sub-Department'?parent.level==='Department':child.level==='Team'&&['Department','Sub-Department'].includes(parent.level));
}
async function analyze(client,user,body){
 keys(body,['filename','data']);
 const parsed=await readUpload(body.filename,body.data);
 const fingerprint=createHash('sha256').update(Buffer.from(body.data,'base64')).digest('hex');
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[moduleKey+user.id+fingerprint]);
 let prior=(await client.query("SELECT * FROM crm_transfer_jobs WHERE user_id=$1 AND module_key=$2 AND kind='import' AND fingerprint=$3",[user.id,moduleKey,fingerprint])).rows[0];
 if(prior&&new Date(prior.expires_at)>new Date())return {job:view(prior),headers:prior.state.headers||[],sample:(prior.state.rows||[]).slice(0,5),reused:true,message:'This exact file is already registered. Open its existing job rather than uploading twice.'};
 if(prior)await client.query('UPDATE crm_transfer_jobs SET fingerprint=NULL WHERE id=$1',[prior.id]);
 const count=Number((await client.query("SELECT count(*)::int total FROM crm_transfer_jobs WHERE user_id=$1 AND module_key=$2 AND created_at>now()-interval '1 hour'",[user.id,moduleKey])).rows[0].total);
 if(count>=30)fail(429,'Transfer job limit reached (30 per hour)');
 const id=randomUUID();
 const row=(await client.query("INSERT INTO crm_transfer_jobs(id,user_id,module_key,kind,status,fingerprint,filename,state,total) VALUES($1,$2,$3,'import','uploaded',$4,$5,$6,$7) RETURNING *",[id,user.id,moduleKey,fingerprint,body.filename,JSON.stringify(parsed),parsed.rows.length])).rows[0];
 return {job:view(row),headers:parsed.headers,sample:parsed.rows.slice(0,5),recommended:mappingFor(parsed.headers)};
}
async function validate(client,user,id,body){
 keys(body,['mapping','scope','atomic','duplicates']);
 const job=await owned(client,user,id,true);
 if(job.kind!=='import'||!['uploaded','validated'].includes(job.status))fail(409,'Import job cannot be validated again');
 if(!['Central','Branch'].includes(body.scope)||typeof body.atomic!=='boolean'||!['skip','reject'].includes(body.duplicates))fail(400,'Choose scope, transaction mode and duplicate policy');
 const header=job.state.headers||[],raw=job.state.rows||[],mapping=mappingFor(header,body.mapping);
 if(body.atomic&&raw.length>fileLimits.atomicRows)fail(400,'Atomic mode supports up to '+fileLimits.atomicRows+' rows');
 const existing=(await client.query('SELECT id,scope,level,name,code,parent_id,status,archived_at,deleted_at FROM department_units WHERE scope=$1',[body.scope])).rows;
 const byCode=new Map(existing.map(x=>[cleanCode(x.code),x]));
 const planned=new Map(),rows=[],errors=[],dupNames=new Set(),preview=[];
 for(let index=0;index<raw.length;index++){
  const ordinal=index+2;
  try{
   const p=payload(raw[index],mapping,body.scope),prior=planned.get(p.code)||byCode.get(p.code);
   if(prior){
    if(planned.has(p.code)||body.duplicates==='reject')throw Error('Duplicate Unit Code in '+(planned.has(p.code)?'this file':'the Department catalog'));
    rows.push({ordinal,payload:p,status:'skipped',error:'Existing Unit Code; skipped safely'});continue;
   }
   planned.set(p.code,p);
   rows.push({ordinal,payload:p,status:'pending',error:null});
  }catch(e){
   rows.push({ordinal,payload:{},status:'failed',error:String(e.message).slice(0,500)});
   errors.push({row:ordinal,message:String(e.message)});
  }
 }
 for(const item of rows){
  if(item.status!=='pending')continue;
  const p=item.payload,parent=p.parentCode?(byCode.get(p.parentCode)||planned.get(p.parentCode)):null;
  if(p.parentCode&&!parentValid(p,parent)){item.status='failed';item.error='Parent must be an Active, compatible unit in the same scope';errors.push({row:item.ordinal,message:item.error});continue;}
  const parentKey=p.parentCode||'root',nameKey=p.level+'|'+parentKey+'|'+normalizeName(p.name);
  const priorInFile=dupNames.has(nameKey);
  const inDb=existing.some(x=>x.level===p.level&&normalizeName(x.name)===normalizeName(p.name)&&
    (p.parentCode?cleanCode(byCode.get(p.parentCode)?.code||'')===cleanCode(byCode.get(p.parentCode)?.code||'')&&x.parent_id===(byCode.get(p.parentCode)?.id||null):x.parent_id===null));
  if(priorInFile||inDb){item.status='failed';item.error='Duplicate Unit Name for this scope, level and parent';errors.push({row:item.ordinal,message:item.error});continue;}
  dupNames.add(nameKey);preview.push({row:item.ordinal,scope:p.scope,level:p.level,name:p.name,code:p.code,parentCode:p.parentCode,result:'Create'});
 }
 await client.query('DELETE FROM crm_transfer_items WHERE job_id=$1',[job.id]);
 for(let i=0;i<rows.length;i+=250){
  await client.query("INSERT INTO crm_transfer_items(job_id,ordinal,payload,status,error) SELECT $1,x.ordinal,x.payload,x.status,x.error FROM jsonb_to_recordset($2::jsonb) AS x(ordinal integer,payload jsonb,status text,error text)",
   [job.id,JSON.stringify(rows.slice(i,i+250))]);
 }
 const failed=rows.filter(x=>x.status==='failed').length,skipped=rows.filter(x=>x.status==='skipped').length;
 const request={scope:body.scope,atomic:body.atomic,duplicates:body.duplicates,mapping};
 const updated=(await client.query("UPDATE crm_transfer_jobs SET status='validated',request=$2,total=$3,failed=$4,skipped=$5,updated_at=now() WHERE id=$1 RETURNING *",[job.id,JSON.stringify(request),rows.length,failed,skipped])).rows[0];
 return {job:view(updated),valid:rows.length-failed-skipped,invalid:failed,skipped,errors:errors.slice(0,150),preview:preview.slice(0,30)};
}
async function start(client,user,id){
 const job=await owned(client,user,id,true);
 if(job.kind!=='import')fail(409,'Not an Import job');
 if(['completed','partial','failed'].includes(job.status))return {job:view(job),reused:true};
 if(job.status!=='validated')fail(409,'Validate the Import job first');
 const request=job.request||{},items=(await client.query("SELECT ordinal,payload,status,error FROM crm_transfer_items WHERE job_id=$1 ORDER BY ordinal",[job.id])).rows;
 if(request.atomic&&items.some(x=>x.status==='failed'))fail(409,'Atomic import has validation errors; correct the file before starting');
 const sorted=items.filter(x=>x.status==='pending').sort((a,b)=>levels.indexOf(a.payload.level)-levels.indexOf(b.payload.level)||a.ordinal-b.ordinal);
 let succeeded=0,failed=Number(job.failed),skipped=Number(job.skipped);
 for(const item of sorted){
  if(!request.atomic)await client.query('SAVEPOINT dept_import_row');
  try{
   const p=item.payload;
   const dupe=await client.query('SELECT id FROM department_units WHERE scope=$1 AND upper(code)=$2',[p.scope,p.code]);
   if(dupe.rowCount){skipped++;await client.query("UPDATE crm_transfer_items SET status='skipped',error='Unit Code already exists' WHERE job_id=$1 AND ordinal=$2",[job.id,item.ordinal]);}
   else{
    let parentId=null;
    if(p.parentCode){
     const parent=(await client.query('SELECT * FROM department_units WHERE scope=$1 AND upper(code)=$2',[p.scope,p.parentCode])).rows[0];
     if(!parentValid(p,parent))throw Error('Parent not Active or not found for '+p.code);
     parentId=parent.id;
    }
    const unitId=randomUUID();
    await client.query('INSERT INTO department_units(id,scope,level,parent_id,name,code,description,sort_order,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)',
      [unitId,p.scope,p.level,parentId,p.name,p.code,p.description,p.sortOrder,user.id]);
    await client.query('INSERT INTO department_events(unit_id,actor_id,action,changes,reason) VALUES($1,$2,$3,$4,$5)',
      [unitId,user.id,'Imported',JSON.stringify({source:'Department import',jobId:job.id,row:item.ordinal}), 'Validated CSV/XLSX Import']);
    await client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)',[user.id,'Imported',moduleKey,unitId]);
    await client.query("UPDATE crm_transfer_items SET status='succeeded',record_id=$3,error=NULL WHERE job_id=$1 AND ordinal=$2",[job.id,item.ordinal,unitId]);
    succeeded++;
   }
   if(!request.atomic)await client.query('RELEASE SAVEPOINT dept_import_row');
  }catch(error){
   if(request.atomic)throw error;
   await client.query('ROLLBACK TO SAVEPOINT dept_import_row');
   await client.query('RELEASE SAVEPOINT dept_import_row');
   failed++;
   await client.query("UPDATE crm_transfer_items SET status='failed',error=$3 WHERE job_id=$1 AND ordinal=$2",[job.id,item.ordinal,String(error.message).slice(0,500)]);
  }
 }
 const status=failed?(succeeded?'partial':'failed'):'completed';
 const updated=(await client.query('UPDATE crm_transfer_jobs SET status=$2,succeeded=$3,failed=$4,skipped=$5,updated_at=now() WHERE id=$1 RETURNING *',
  [job.id,status,succeeded,failed,skipped])).rows[0];
 return {job:view(updated),result:status};
}
function filteredArgs(body){
 keys(body,['format','columns','filters']);
 if(!['csv','xlsx'].includes(body.format))fail(400,'Select CSV or XLSX');
 if(!Array.isArray(body.columns)||!body.columns.length||body.columns.length>columns.length||new Set(body.columns).size!==body.columns.length||body.columns.some(c=>!columns.includes(c)))fail(400,'Invalid export columns');
 const filters=body.filters||{};
 keys(filters,['scope','q','status','level','branchId','businessLineId','parentId','name','code']);
 if(!['Central','Branch'].includes(filters.scope))fail(400,'Select Central or Branch for export');
 return filters;
}
async function exportData(client,user,body,loadPage){
 const filters=filteredArgs(body);
 const query=new URLSearchParams({...filters,page:'1',pageSize:'100'});
 const first=await loadPage(query);
 const total=Number(first.total||0);
 if(total>10000)fail(400,'Export exceeds 10,000 rows; narrow the filters');
 const all=[...(first.records||[])];
 for(let page=2;all.length<total;page++){query.set('page',String(page));const next=await loadPage(query);if(!next.records?.length)fail(409,'Export data changed; retry');all.push(...next.records);}
 const id=randomUUID(),parts=Math.max(1,Math.ceil(all.length/250));
 const job=(await client.query("INSERT INTO crm_transfer_jobs(id,user_id,module_key,kind,status,filename,request,total,succeeded) VALUES($1,$2,$3,'export','completed',$4,$5,$6,$6) RETURNING *",
  [id,user.id,moduleKey,'department-'+filters.scope.toLowerCase()+'-export.'+body.format,JSON.stringify(body),all.length])).rows[0];
 for(let i=0;i<parts;i++){
  const rows=all.slice(i*250,(i+1)*250),names=body.columns.map(k=>labels[k]),matrix=rows.map(r=>body.columns.map(k=>r[k]??''));
  let file;
  if(body.format==='csv')file={bytes:csvBytes(names,matrix),mime:'text/csv;charset=utf-8'};
  else{
   const wb=new ExcelJS.Workbook();wb.creator='SAI-CRM';const ws=wb.addWorksheet('Departments');
   ws.addRow(names);for(const cells of matrix)ws.addRow(cells);
   ws.getRow(1).font={bold:true};ws.views=[{state:'frozen',ySplit:1}];
   ws.columns.forEach(c=>{c.width=23});
   file={bytes:Buffer.from(await wb.xlsx.writeBuffer()),mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
  }
  if(file.bytes.length>2500000)fail(413,'Export part exceeds 2.5 MB; narrow filters');
  const filename='department-'+filters.scope.toLowerCase()+'-'+String(i+1).padStart(2,'0')+'.'+body.format;
  await client.query('INSERT INTO crm_transfer_files(job_id,part,filename,mime,bytes) VALUES($1,$2,$3,$4,$5)',[id,i+1,filename,file.mime,file.bytes]);
 }
 return {job:view(job),files:parts,count:all.length};
}
export async function departmentTransfer({client,user,path,method,url,body={},loadPage}){
 if(path[1]==='imports'&&path[2]==='analyze'&&method==='POST'){requirePermission(user,'import');return analyze(client,user,body);}
 if(path[1]==='imports'&&path[2]&&path[3]==='validate'&&method==='POST'){requirePermission(user,'import');return validate(client,user,path[2],body);}
 if(path[1]==='exports'&&path.length===2&&method==='POST'){requirePermission(user,'export');return exportData(client,user,body,loadPage);}
 if(path[1]==='jobs'&&path.length===2&&method==='GET'){
  requirePermission(user,'read');
  const rows=(await client.query('SELECT * FROM crm_transfer_jobs WHERE user_id=$1 AND module_key=$2 AND expires_at>now() ORDER BY created_at DESC LIMIT 50',[user.id,moduleKey])).rows;
  return {jobs:rows.map(view)};
 }
 if(path[1]==='jobs'&&path[2]){
  requirePermission(user,'read');
  if(path[3]==='start'&&method==='POST'){requirePermission(user,'import');return start(client,user,path[2]);}
  const job=await owned(client,user,path[2]);
  if(path[3]==='file'&&method==='GET'){
   if(job.kind!=='export')fail(400,'Not an export');
   const part=Number(url.searchParams.get('part')||1);
   if(!Number.isInteger(part)||part<1||part>100)fail(400,'Invalid export part');
   const file=(await client.query('SELECT filename,mime,bytes FROM crm_transfer_files WHERE job_id=$1 AND part=$2',[job.id,part])).rows[0];
   if(!file)fail(404,'Export file unavailable');
   return fileResponse({bytes:file.bytes,mime:file.mime},file.filename);
  }
  if(path.length===3&&method==='GET'){
   const items=job.kind==='import'?(await client.query("SELECT ordinal,status,error FROM crm_transfer_items WHERE job_id=$1 AND status IN ('failed','skipped') ORDER BY ordinal LIMIT 250",[job.id])).rows:[];
   const parts=job.kind==='export'?Number((await client.query('SELECT count(*)::int parts FROM crm_transfer_files WHERE job_id=$1',[job.id])).rows[0].parts):0;
   return {job:view(job),items,parts,request:job.request};
  }
 }
 fail(405,'Unsupported Department transfer action');
}
