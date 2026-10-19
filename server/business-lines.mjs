import { randomUUID } from 'node:crypto';
import { businessLineResource } from './resources.mjs';

const fail=(status,message)=>{const error=new Error(message);error.status=status;throw error;};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const fields=Object.freeze({
 id:{sql:'b.id',label:'Business Line UUID'},displayId:{sql:'b.display_id',label:'Business Line ID'},
 name:{sql:'b.name',label:'Business Line Name'},status:{sql:'b.status',label:'Status'},
 ownerId:{sql:'b.owner_id',label:'Owner ID'},owner:{sql:'o.name',label:'Owner'},
 remarks:{sql:'b.remarks',label:'Remarks'},
 createdById:{sql:'b.created_by',label:'Created By ID'},createdBy:{sql:'c.name',label:'Created By'},
 createdAt:{sql:'b.created_at',label:'Created At',date:true},
 updatedById:{sql:'b.updated_by',label:'Last Modified By ID'},updatedBy:{sql:'u.name',label:'Last Modified By'},
 updatedAt:{sql:'b.updated_at',label:'Last Modified At',date:true}
});
const defaultColumns=Object.freeze(['displayId','name','status','owner','remarks','createdBy','createdAt','updatedBy','updatedAt']);
const select=`SELECT b.*,o.name AS owner_name,c.name AS creator_name,u.name AS updater_name
 FROM business_lines b JOIN users o ON o.id=b.owner_id JOIN users c ON c.id=b.created_by JOIN users u ON u.id=b.updated_by`;
const joins='FROM business_lines b JOIN users o ON o.id=b.owner_id JOIN users c ON c.id=b.created_by JOIN users u ON u.id=b.updated_by';
const limits=Object.freeze({selectedExport:250,maxExportRows:10000,maxExportResponseBytes:3*1024*1024});
const permissions=Object.freeze({read:true,create:true,edit:true,archive:true,restore:true,export:true,history:true,import:false,delete:false});
export const businessLineColumns=Object.freeze(Object.entries(fields).map(([key,field])=>({key,label:field.label,type:field.date?'datetime':'text'})));
const date=value=>value==null?null:(value instanceof Date?value.toISOString():new Date(value).toISOString());
export function businessLineView(row){
 return {id:row.id,displayId:row.display_id,name:row.name,status:row.status,
  ownerId:row.owner_id,owner:row.owner_name,remarks:row.remarks,
  createdById:row.created_by,createdBy:row.creator_name,createdAt:date(row.created_at),
  updatedById:row.updated_by,updatedBy:row.updater_name,updatedAt:date(row.updated_at),
  version:row.version,archivedAt:date(row.archived_at)};
}
function object(value,message='Expected an object'){
 if(!value||typeof value!=='object'||Array.isArray(value))fail(400,message);
 return value;
}
function onlyKeys(value,allowed){
 object(value);
 if(Object.keys(value).some(key=>!allowed.includes(key)))fail(400,'Unknown or server-managed field');
}
function text(value,label,max,required=false){
 if(typeof value!=='string')fail(400,label+' must be text');
 const normalized=value.trim();
 if((required&&!normalized)||normalized.length>max||/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(normalized))fail(400,'Invalid '+label.toLowerCase());
 return normalized;
}
function businessName(value){
 const name=text(value,'Business Line name',120,true);
 if(/[\t\r\n]/u.test(name))fail(400,'Business Line name must be a single line');
 return name;
}
function version(value){
 if(!Number.isSafeInteger(value)||value<1)fail(400,'A valid record version is required');
 return value;
}
function number(value,fallback,allowed){
 if(value===undefined||value===null||value==='')return fallback;
 if(!/^\d+$/.test(String(value)))fail(400,'Invalid pagination');
 const result=Number(value);
 if(!Number.isSafeInteger(result)||result<1||(allowed&&!allowed.includes(result)))fail(400,'Invalid pagination');
 return result;
}
function parameters(source={}){
 object(source,'Invalid list query');
 const q=source.q===undefined?'':text(source.q,'Search',200);
 const sort=source.sort||'updatedAt',direction=source.direction||'desc',status=source.status||'all',archived=source.archived||'exclude';
 if(!own(fields,sort)||!['asc','desc'].includes(direction)||!['all','Active','Inactive'].includes(status)||!['exclude','only','all'].includes(archived))fail(400,'Invalid list options');
 let filters=source.filters||[];
 if(typeof filters==='string'){
  if(filters.length>4000)fail(400,'Too many filter details');
  try{filters=JSON.parse(filters);}catch{fail(400,'Invalid filters');}
 }
 if(!Array.isArray(filters)||filters.length>10)fail(400,'At most ten filters are supported');
 filters=filters.map(filter=>{
  onlyKeys(filter,['field','operator','value']);
  const field=fields[filter.field];
  if(typeof filter.field!=='string'||!own(fields,filter.field)||!['contains','equals','startsWith','before','after','isEmpty','isNotEmpty'].includes(filter.operator))fail(400,'Invalid filter');
  if(['before','after'].includes(filter.operator)&&!field.date)fail(400,'Date filter requires a date field');
  let value=['isEmpty','isNotEmpty'].includes(filter.operator)?'':text(filter.value,'Filter',200);
  if(['before','after'].includes(filter.operator)&&(!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/.test(value)||Number.isNaN(Date.parse(value))))fail(400,'Invalid filter date');
  if(['before','after'].includes(filter.operator)){
   const [year,month,day]=value.slice(0,10).split('-').map(Number);
   if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())fail(400,'Invalid filter date');
  }
  return {field:filter.field,operator:filter.operator,value};
 });
 return {q,sort,direction,status,archived,filters,page:number(source.page,1),pageSize:number(source.pageSize,25,[25,50,75,100])};
}
function whereFor(options){
 const params=[],conditions=[],add=value=>{params.push(value);return '$'+params.length;};
 if(options.archived==='exclude')conditions.push('b.archived_at IS NULL');
 if(options.archived==='only')conditions.push('b.archived_at IS NOT NULL');
 if(options.status!=='all')conditions.push('b.status='+add(options.status));
 const words=options.q.split(/\s+/u).filter(Boolean);
 if(words.length>12)fail(400,'Use at most twelve search words');
 for(const word of words){
  const parameter=add(word);
  conditions.push('('+Object.values(fields).map(field=>'strpos(lower(COALESCE('+field.sql+"::text,'')),lower("+parameter+'))>0').join(' OR ')+')');
 }
 for(const filter of options.filters){
  const column=fields[filter.field].sql,expression="lower(COALESCE("+column+"::text,''))";
  if(filter.operator==='isEmpty')conditions.push(expression+"=''");
  else if(filter.operator==='isNotEmpty')conditions.push(expression+"<>''");
  else {
   const parameter=add(filter.value);
   if(filter.operator==='contains')conditions.push('strpos('+expression+',lower('+parameter+'))>0');
   if(filter.operator==='equals')conditions.push(expression+'=lower('+parameter+')');
   if(filter.operator==='startsWith')conditions.push('left('+expression+',length('+parameter+'))=lower('+parameter+')');
   if(filter.operator==='before')conditions.push(column+'<'+parameter+'::timestamptz');
   if(filter.operator==='after')conditions.push(column+'>'+parameter+'::timestamptz');
  }
 }
 return {sql:conditions.length?' WHERE '+conditions.join(' AND '):'',params};
}
const orderFor=options=>' ORDER BY '+fields[options.sort].sql+' '+options.direction.toUpperCase()+',b.id ASC';
async function owners(client){
 return (await client.query("SELECT id,name,email FROM users WHERE system_role='super_admin' AND status='approved' AND email_verified=true ORDER BY name,id")).rows;
}
async function record(client,id,lock=false){
 if(!uuid(id))fail(400,'Invalid Business Line ID');
 // Acquire the business-line row lock separately because JOIN rows must not lock user records.
 if(lock){
  const existing=await client.query('SELECT id FROM business_lines WHERE id=$1 FOR UPDATE',[id]);
  if(!existing.rowCount)fail(404,'Business Line not found');
 }
 const row=(await client.query(select+' WHERE b.id=$1',[id])).rows[0];
 if(!row)fail(404,'Business Line not found');
 return row;
}
async function dependencies(client,line,textOnly=false){
 const result=await client.query(`SELECT count(*)::integer AS count FROM records r
 WHERE lower(r.scope_line)=lower($2)
 OR (r.module='customers' AND lower(r.data->>'line')=lower($2))
 OR (NOT $3::boolean AND (r.data->>'businessLineId'=$1 OR r.data->>'business_line_id'=$1))
 OR (r.module='branches' AND (
  EXISTS(SELECT 1 FROM regexp_split_to_table(CASE WHEN jsonb_typeof(r.data->'lines')='string' THEN r.data->>'lines' ELSE '' END,'[,;|]') AS token WHERE lower(btrim(token))=lower($2))
  OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(r.data->'lines')='array' THEN r.data->'lines' ELSE '[]'::jsonb END) AS item WHERE lower(btrim(item))=lower($2) OR (NOT $3::boolean AND item=$1))
 ))`,[line.id,line.name,textOnly]);
 return Number(result.rows[0].count);
}
const changesFor=(before,after)=>{
 const changes={};
 for(const key of ['name','status','ownerId','remarks','archivedAt'])
  if((before?.[key]??null)!==(after?.[key]??null))changes[key]={before:before?.[key]??null,after:after?.[key]??null};
 return changes;
};
async function event(client,user,id,action,before,after){
 await client.query('INSERT INTO business_line_events(business_line_id,actor_id,action,changes) VALUES($1,$2,$3,$4)',[id,user.id,action,changesFor(before,after)]);
 await client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)',[user.id,action,'business-lines',id]);
}
function csvCell(value){
 let output=value===null||value===undefined?'':String(value);
 // Spreadsheet applications may execute formulas even when a CSV cell is quoted.
 if(/^[\s\uFEFF]*[=+\-@]/u.test(output)||/^[\t\r\n]/.test(output))output="'"+output;
 return '"'+output.replaceAll('"','""')+'"';
}
export function businessLineCSV(records,columns=defaultColumns){
 if(!Array.isArray(columns)||!columns.length||columns.length>Object.keys(fields).length||new Set(columns).size!==columns.length||columns.some(key=>!own(fields,key)))fail(400,'Invalid export columns');
 return '\uFEFF'+[columns.map(key=>csvCell(fields[key].label)).join(','),...records.map(row=>columns.map(key=>csvCell(row[key])).join(','))].join('\r\n')+'\r\n';
}
async function exportRecords(client,user,body){
 onlyKeys(body,['mode','ids','columns','query']);
 if(!['selected','default','my','all'].includes(body.mode))fail(400,'Invalid export mode');
 const options=parameters(body.mode==='all'?{archived:'all'}:(body.query||{}));
 const where=whereFor(options);
 let suffix=where.sql,params=where.params;
 if(body.mode==='selected'){
  if(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>250||body.ids.some(id=>!uuid(id))||new Set(body.ids).size!==body.ids.length)fail(400,'Select between one and 250 distinct records');
  suffix=' WHERE b.id=ANY($1::uuid[])';params=[body.ids];
 }
 const rows=(await client.query(select+suffix+orderFor(options)+' LIMIT 10001',params)).rows;
 if(rows.length>10000)fail(400,'Export supports up to 10,000 records; narrow your filters');
 if(body.mode==='selected'&&rows.length!==body.ids.length)fail(409,'Some selected records are no longer available');
 const columns=body.mode==='default'?defaultColumns:(body.columns||defaultColumns);
 const csv=businessLineCSV(rows.map(businessLineView),columns);
 await client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)',[user.id,'Exported '+rows.length+' records ('+body.mode+')','business-lines','export']);
 const result={csv,filename:'business-lines-'+body.mode+'-'+new Date().toISOString().slice(0,19).replaceAll(':','')+'Z.csv',count:rows.length};
 if(Buffer.byteLength(JSON.stringify(result),'utf8')>limits.maxExportResponseBytes)fail(400,'Export is too large; narrow your filters or choose fewer columns');
 return result;
}
export async function businessLines({client,user,path,method,url,body}){
 if(user.system_role!=='super_admin'||!user.email_verified||user.status!=='approved')fail(403,'Super Admin access required');
 if(path[0]!=='business-lines'||path.length>3)fail(404,'Not found');
 if(method!=='GET'&&path[1]!=='export')await client.query('SELECT pg_advisory_xact_lock(830151)');
 try{
  if(path.length===1&&method==='GET'){
   const options=parameters(Object.fromEntries(url.searchParams));
   const where=whereFor(options);
   const total=Number((await client.query('SELECT count(*)::integer AS total '+joins+where.sql,where.params)).rows[0].total);
   const totalPages=Math.max(1,Math.ceil(total/options.pageSize));
   const page=Math.min(options.page,totalPages);
   const data=await client.query(select+where.sql+orderFor(options)+' LIMIT $'+(where.params.length+1)+' OFFSET $'+(where.params.length+2),[...where.params,options.pageSize,(page-1)*options.pageSize]);
   const counts=(await client.query(`SELECT count(*)::integer AS total,
    count(*) FILTER(WHERE archived_at IS NULL AND status='Active')::integer AS active,
    count(*) FILTER(WHERE archived_at IS NULL AND status='Inactive')::integer AS inactive,
    count(*) FILTER(WHERE archived_at IS NOT NULL)::integer AS archived FROM business_lines`)).rows[0];
   return {records:data.rows.map(businessLineView),total,page,pageSize:options.pageSize,totalPages,counts,owners:await owners(client),resource:{...businessLineResource,columns:businessLineColumns,limits},permissions};
  }
  if(path.length===2&&path[1]==='export'&&method==='POST')return await exportRecords(client,user,body);
  if(path.length===1&&method==='POST'){
   onlyKeys(body,['name','remarks']);
   const name=businessName(body.name);
   const remarks=body.remarks===undefined?'':text(body.remarks,'Remarks',255);
   const id=randomUUID();
   await client.query('INSERT INTO business_lines(id,name,owner_id,remarks,created_by,updated_by) VALUES($1,$2,$3,$4,$3,$3)',[id,name,user.id,remarks]);
   const created=businessLineView(await record(client,id));
   await event(client,user,id,'Created',null,created);
   return {record:created};
  }
  if(path.length===2&&method==='GET')return {record:businessLineView(await record(client,path[1]))};
  if(path.length===3&&path[2]==='history'&&method==='GET'){
   await record(client,path[1]);
   const rows=(await client.query('SELECT e.id,e.actor_id,u.name AS actor,e.action,e.changes,e.created_at FROM business_line_events e JOIN users u ON u.id=e.actor_id WHERE e.business_line_id=$1 ORDER BY e.id DESC LIMIT 200',[path[1]])).rows;
   return {history:rows.map(row=>({id:row.id,actorId:row.actor_id,actor:row.actor,action:row.action,changes:row.changes,createdAt:date(row.created_at)}))};
  }
  if((path.length===2&&method==='PUT')||(path.length===3&&['archive','restore'].includes(path[2])&&method==='POST')){
   onlyKeys(body,path.length===2?['name','status','remarks','ownerId','version']:['version']);
   version(body.version);
   const existing=await record(client,path[1],true),before=businessLineView(existing);
   if(existing.version!==body.version)fail(409,'This record changed. Refresh and try again.');
   if(path.length===3){
    const archive=path[2]==='archive';
    if(archive&&existing.archived_at)fail(409,'This Business Line is already archived');
    if(!archive&&!existing.archived_at)fail(409,'This Business Line is not archived');
    if(archive&&await dependencies(client,existing))fail(409,'Referenced Business Lines cannot be archived. Review dependent records first.');
    await client.query('UPDATE business_lines SET archived_at=$2,archived_by=$3,updated_by=$4,updated_at=now(),version=version+1 WHERE id=$1',[existing.id,archive?new Date():null,archive?user.id:null,user.id]);
    const after=businessLineView(await record(client,existing.id));
    await event(client,user,existing.id,archive?'Archived':'Restored',before,after);
    return {record:after};
   }
   if(existing.archived_at)fail(409,'Restore this Business Line before editing');
   const name=own(body,'name')?businessName(body.name):existing.name;
   const remarks=own(body,'remarks')?text(body.remarks,'Remarks',255):existing.remarks;
   const status=own(body,'status')?body.status:existing.status;
   if(!['Active','Inactive'].includes(status))fail(400,'Invalid Business Line status');
   const ownerId=own(body,'ownerId')?body.ownerId:existing.owner_id;
   if(!uuid(ownerId))fail(400,'Invalid owner');
   if(ownerId!==existing.owner_id&&!(await client.query("SELECT 1 FROM users WHERE id=$1 AND system_role='super_admin' AND status='approved' AND email_verified=true FOR SHARE",[ownerId])).rowCount)fail(400,'Owner must be an approved, verified Super Admin');
   if(status==='Inactive'&&existing.status!=='Inactive'&&await dependencies(client,existing))fail(409,'Referenced Business Lines cannot be deactivated. Review dependent records first.');
   if(name!==existing.name&&await dependencies(client,existing,true))fail(409,'Legacy records reference this name. Migrate those references before renaming.');
   if(name===existing.name&&remarks===existing.remarks&&status===existing.status&&ownerId===existing.owner_id)return {record:before};
   await client.query('UPDATE business_lines SET name=$2,status=$3,remarks=$4,owner_id=$5,updated_by=$6,updated_at=now(),version=version+1 WHERE id=$1',[existing.id,name,status,remarks,ownerId,user.id]);
   const after=businessLineView(await record(client,existing.id));
   await event(client,user,existing.id,'Updated',before,after);
   return {record:after};
  }
  fail(405,'Unsupported Business Line action');
 }catch(error){
  if(error.code==='23505')fail(409,'A Business Line with this name already exists, including archived records');
  throw error;
 }
}

/**
 * Coordinate known legacy textual references with Business Line state changes.
 * Unknown historic codes retain their old behaviour; they are never guessed.
 */
export async function validateBusinessLineReferences(client,module,data){
 const names=[];
 if(typeof data.scopeLine==='string'&&data.scopeLine.trim())names.push(data.scopeLine.trim().toLowerCase());
 if(module==='customers'&&typeof data.line==='string'&&data.line.trim())names.push(data.line.trim().toLowerCase());
 if(module==='branches'&&typeof data.lines==='string')
  for(const part of data.lines.split(/[,;|]/u)){if(part.trim())names.push(part.trim().toLowerCase());}
 if(!names.length)return;
 await client.query('SELECT pg_advisory_xact_lock_shared(830151)');
 const found=await client.query('SELECT status,archived_at FROM business_lines WHERE lower(name)=ANY($1::text[]) FOR SHARE',[names]);
 if(found.rows.some(row=>row.status!=='Active'||row.archived_at))fail(409,'A referenced Business Line is inactive or archived');
}
