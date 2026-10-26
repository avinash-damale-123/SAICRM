import {randomUUID} from 'node:crypto';
import {countryResource,countryPermissions} from './resources.mjs';
import {sourceTimeZone} from './time-zone.mjs';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const date=v=>v==null?null:(v instanceof Date?v.toISOString():new Date(v).toISOString());
const continents=new Set(['Africa','Asia','Europe','North America','South America','Oceania','Antarctica']);
const select=`SELECT c.*,o.name owner_name,o.display_id owner_display_id,cr.name creator_name,cr.display_id creator_display_id,
 u.name updater_name,u.display_id updater_display_id,a.name archive_name,a.display_id archive_display_id,
 d.name delete_name,d.display_id delete_display_id,
 COALESCE((SELECT json_agg(json_build_object('id',bl.id,'displayId',bl.display_id,'code',bl.code,'name',bl.name,'status',
 CASE WHEN bl.deleted_at IS NOT NULL THEN 'Deleted' WHEN bl.archived_at IS NOT NULL THEN 'Archived' ELSE bl.status END)
 ORDER BY lower(bl.name)) FROM country_business_lines m JOIN business_lines bl ON bl.id=m.business_line_id
 WHERE m.country_id=c.id AND m.removed_at IS NULL),'[]'::json) business_lines
 FROM countries c JOIN users o ON o.id=c.owner_id JOIN users cr ON cr.id=c.created_by JOIN users u ON u.id=c.updated_by
 LEFT JOIN users a ON a.id=c.archived_by LEFT JOIN users d ON d.id=c.deleted_by`;

function text(v,label,max,required=false){if(typeof v!=='string')fail(400,label+' must be text');const s=v.trim();if((required&&!s)||s.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(s))fail(400,'Invalid '+label);return s;}
function name(v){const s=text(v,'Country Name',150,true).replace(/\s+/gu,' ');if(/[\t\r\n]/u.test(s))fail(400,'Country Name must be a single line');return s;}
function alpha(v,label,n){const s=text(v,label,n,true).toUpperCase();if(!new RegExp('^[A-Z]{'+n+'}$').test(s))fail(400,label+' must contain exactly '+n+' letters');return s;}
function numeric(v){const s=text(String(v),'ISO Numeric Code',3,true);if(!/^\d{3}$/.test(s))fail(400,'ISO Numeric Code must contain exactly 3 digits');return s;}
function dial(v){const s=text(v,'International Dialing Code',16,true);if(!/^\+\d{1,15}$/.test(s))fail(400,'International Dialing Code must start with + and contain digits only');return s;}
function version(v){if(!Number.isSafeInteger(v)||v<1)fail(400,'A valid record version is required');return v;}
function reason(v){return text(v,'Lifecycle reason',500,true);}
function flag(code){return /^[A-Z]{2}$/.test(code||'')?[...code].map(ch=>String.fromCodePoint(127397+ch.charCodeAt(0))).join(''):'';}
function view(r){return {
 id:r.id,displayId:r.display_id,name:r.name,code:r.code,iso3:r.iso3,isoNumeric:r.iso_numeric,dialingCode:r.dialing_code,
 defaultCurrency:r.default_currency,nationality:r.nationality,continent:r.continent,alias:r.alias,description:r.description,
 flag:flag(r.code),businessLines:r.business_lines||[],businessLineIds:(r.business_lines||[]).map(x=>x.id),
 businessLinePresence:(r.business_lines||[]).map(x=>x.code||x.name).join(';'),
 status:r.deleted_at?'Deleted':r.archived_at?'Archived':r.status,owner:r.owner_name,ownerId:r.owner_display_id,
 createdBy:r.creator_name,createdById:r.creator_display_id,createdAt:date(r.created_at),
 updatedBy:r.updater_name,updatedById:r.updater_display_id,updatedAt:date(r.updated_at),
 archivedBy:r.archive_name,archivedById:r.archive_display_id,archivedAt:date(r.archived_at),
 deletedBy:r.delete_name,deletedById:r.delete_display_id,deletedAt:date(r.deleted_at),version:r.version
};}
export {view as countryView};

async function load(client,id,lock=false){if(!uuid(id))fail(400,'Invalid Country ID');if(lock){const x=await client.query('SELECT id FROM countries WHERE id=$1 FOR UPDATE',[id]);if(!x.rowCount)fail(404,'Country not found');}const r=(await client.query(select+' WHERE c.id=$1',[id])).rows[0];if(!r)fail(404,'Country not found');return r;}
async function activeBusinessLines(client){return (await client.query(`SELECT id,display_id AS "displayId",code,name FROM business_lines WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL ORDER BY lower(name),id`)).rows;}
async function owners(client){return (await client.query(`SELECT id,display_id AS "ownerId",name,email FROM users WHERE status='approved' AND email_verified=true ORDER BY name,id`)).rows;}

async function referenceRows(client,country){
 const code=country.code,name=country.name,id=country.id;
 const rows=(await client.query(`SELECT module,count(*)::int AS count FROM records
 WHERE data->>'countryId'=$1 OR data->>'country_id'=$1 OR lower(COALESCE(data->>'country',''))=lower($2)
 OR lower(COALESCE(data->>'countryCode',''))=lower($3)
 GROUP BY module ORDER BY module`,[id,name,code])).rows;
 const mappings=(await client.query(`SELECT bl.id,bl.display_id,bl.code,bl.name FROM country_business_lines m JOIN business_lines bl ON bl.id=m.business_line_id
 WHERE m.country_id=$1 AND m.removed_at IS NULL ORDER BY lower(bl.name)`,[id])).rows;
 return {rows,mappings,total:rows.reduce((n,r)=>n+Number(r.count),0)+mappings.length};
}
async function lineReferences(client,country,lineId){
 const line=(await client.query('SELECT id,display_id,code,name FROM business_lines WHERE id=$1',[lineId])).rows[0];if(!line)return 0;
 const r=await client.query(`SELECT count(*)::int count FROM records
 WHERE (data->>'countryId'=$1 OR data->>'country_id'=$1 OR lower(COALESCE(data->>'country',''))=lower($2) OR lower(COALESCE(data->>'countryCode',''))=lower($3))
 AND (data->>'businessLineId'=$4 OR data->>'business_line_id'=$4 OR lower(COALESCE(data->>'scopeLine','')) IN (lower($5),lower($6))
 OR lower(COALESCE(data->>'line','')) IN (lower($5),lower($6)))`,[country.id,country.name,country.code,line.id,line.code||'',line.name]);
 return Number(r.rows[0].count);
}
function changes(before,after){
 const out={};for(const k of ['name','code','iso3','isoNumeric','dialingCode','defaultCurrency','nationality','continent','alias','description','status','ownerId','archivedAt','deletedAt','businessLinePresence'])
 if((before?.[k]??null)!==(after?.[k]??null))out[k]={before:before?.[k]??null,after:after?.[k]??null};return out;
}
async function event(client,user,id,action,before,after,why=null,tz=null,extra=null){
 const payload={...changes(before,after),...(extra||{})};if(tz!==null)payload._context={timeZone:tz};
 await client.query('INSERT INTO country_events(country_id,actor_id,action,changes,reason) VALUES($1,$2,$3,$4,$5)',[id,user.id,action,payload,why]);
 await client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)',[user.id,action,'countries',id]);
}
async function syncPresence(client,user,country,ids,tz=null){
 if(ids===undefined)return;
 if(!Array.isArray(ids)||ids.length>100||new Set(ids).size!==ids.length||ids.some(x=>!uuid(x)))fail(400,'Invalid Business Line Presence selection');
 const current=(await client.query('SELECT business_line_id FROM country_business_lines WHERE country_id=$1 AND removed_at IS NULL',[country.id])).rows.map(r=>r.business_line_id);
 if(ids.some(id=>!current.includes(id))&&country.status!=='Active')fail(409,'Business Line Presence can be added only to an Active Country');
 const currentSet=new Set(current),next=new Set(ids);
 const add=ids.filter(id=>!currentSet.has(id)),remove=current.filter(id=>!next.has(id));
 if(add.length){
  const valid=(await client.query(`SELECT id FROM business_lines WHERE id=ANY($1::uuid[]) AND status='Active' AND archived_at IS NULL AND deleted_at IS NULL`,[add])).rows.map(r=>r.id);
  if(valid.length!==add.length)fail(409,'Business Line Presence can be added only to Active Business Lines');
  for(const lineId of add){
   await client.query(`INSERT INTO country_business_lines(country_id,business_line_id,added_by,added_at,removed_by,removed_at)
   VALUES($1,$2,$3,now(),NULL,NULL) ON CONFLICT(country_id,business_line_id) DO UPDATE SET added_by=$3,added_at=now(),removed_by=NULL,removed_at=NULL`,[country.id,lineId,user.id]);
   await client.query("INSERT INTO country_business_line_events(country_id,business_line_id,actor_id,action,previous,current) VALUES($1,$2,$3,'Added',$4,$5)",[country.id,lineId,user.id,{present:false},{present:true}]);
   await event(client,user,country.id,'Business Line Presence Added',null,null,null,tz,{businessLineId:{before:null,after:lineId},businessLinePresence:{before:current.join(', '),after:[...currentSet,...add].join(', ')}});
  }
 }
 for(const lineId of remove){
  if(await lineReferences(client,country,lineId))fail(409,'Business Line Presence cannot be removed while records under that Business Line still use this Country');
  await client.query('UPDATE country_business_lines SET removed_by=$3,removed_at=now() WHERE country_id=$1 AND business_line_id=$2 AND removed_at IS NULL',[country.id,lineId,user.id]);
  await client.query("INSERT INTO country_business_line_events(country_id,business_line_id,actor_id,action,previous,current) VALUES($1,$2,$3,'Removed',$4,$5)",[country.id,lineId,user.id,{present:true},{present:false}]);
  await event(client,user,country.id,'Business Line Presence Removed',null,null,null,tz,{businessLineId:{before:lineId,after:null},businessLinePresence:{before:current.join(', '),after:ids.join(', ')}});
 }
}
function parseInput(body,existing=null){
 const out={
  name:own(body,'name')?name(body.name):existing?.name,
  code:own(body,'code')?alpha(body.code,'Country Code',2):existing?.code,
  iso3:own(body,'iso3')?alpha(body.iso3,'ISO 3-Letter Code',3):existing?.iso3,
  isoNumeric:own(body,'isoNumeric')?numeric(body.isoNumeric):existing?.iso_numeric,
  dialingCode:own(body,'dialingCode')?dial(body.dialingCode):existing?.dialing_code,
  defaultCurrency:own(body,'defaultCurrency')?text(body.defaultCurrency,'Default Currency',40,true).toUpperCase():existing?.default_currency,
  nationality:own(body,'nationality')?text(body.nationality,'Nationality',150,true):existing?.nationality,
  continent:own(body,'continent')?text(body.continent,'Continent',40,true):existing?.continent,
  alias:own(body,'alias')?text(body.alias,'Country Alias / Short Name',150):existing?.alias||'',
  description:own(body,'description')?text(body.description,'Description / Remarks',500):existing?.description||''
 };
 if(!continents.has(out.continent))fail(400,'Choose a valid Continent');return out;
}
function allowed(body,keys){if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k)))fail(400,'Unknown or server-managed field');}

export async function countries({client,user,path,method,url,body}){
 const permissions=countryPermissions(user),need=a=>{if(permissions[a]!==true)fail(403,'You do not have permission for this Country action');};
 if(!permissions.read)fail(403,'Super Admin access required');
 if(path[0]!=='countries'||path.length>4)fail(404,'Not found');
 if(method!=='GET')await client.query('SELECT pg_advisory_xact_lock(830153)');
 try{
  if(path.length===1&&method==='POST'){
   need('create');allowed(body,['name','code','iso3','isoNumeric','dialingCode','defaultCurrency','nationality','continent','alias','description','businessLineIds','timeZone']);
   const tz=sourceTimeZone(body.timeZone),v=parseInput(body),id=randomUUID();
   await client.query(`INSERT INTO countries(id,name,code,iso3,iso_numeric,dialing_code,default_currency,nationality,continent,alias,description,owner_id,created_by,updated_by)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$12)`,[id,v.name,v.code,v.iso3,v.isoNumeric,v.dialingCode,v.defaultCurrency,v.nationality,v.continent,v.alias,v.description,user.id]);
   let row=await load(client,id,true);await syncPresence(client,user,row,body.businessLineIds,tz);const after=view(await load(client,id));await event(client,user,id,'Created',null,after,null,tz);return {record:after};
  }
  if(path.length===2&&path[1]==='references'&&method==='GET'){need('read');return {businessLines:await activeBusinessLines(client),owners:await owners(client),resource:countryResource,permissions};}
  if(path.length===2&&method==='GET'){need('read');return {record:view(await load(client,path[1]))};}
  if(path.length===3&&path[2]==='history'&&method==='GET'){
   need('history');await load(client,path[1]);const rows=(await client.query(`SELECT e.id,u.display_id actor_id,u.name actor,e.action,e.changes,e.reason,e.created_at
   FROM country_events e JOIN users u ON u.id=e.actor_id WHERE e.country_id=$1 ORDER BY e.id DESC LIMIT 200`,[path[1]])).rows;
   return {history:rows.map(r=>{const {_context,...rest}=r.changes||{};return {id:r.id,actorId:r.actor_id,actor:r.actor,action:r.action,changes:rest,reason:r.reason,timeZone:_context?.timeZone||null,createdAt:date(r.created_at)};})};
  }
  if(path.length===3&&path[2]==='related'&&method==='GET'){
   need('read');const c=await load(client,path[1]),refs=await referenceRows(client,c);return {related:refs.rows.map(r=>({module:r.module,count:Number(r.count)})),businessLines:refs.mappings,total:refs.total};
  }
  if(path.length===2&&method==='PUT'){
   need('edit');allowed(body,['name','code','iso3','isoNumeric','dialingCode','defaultCurrency','nationality','continent','alias','description','businessLineIds','status','ownerId','version','reason','timeZone']);
   version(body.version);const tz=sourceTimeZone(body.timeZone),existing=await load(client,path[1],true),before=view(existing);if(existing.version!==body.version)fail(409,'This record changed. Refresh and try again.');if(existing.archived_at||existing.deleted_at)fail(409,'Restore this Country before editing');
   const v=parseInput(body,existing),status=own(body,'status')?body.status:existing.status;if(!['Active','Inactive'].includes(status))fail(400,'Invalid Country status');
   let owner=existing.owner_id;if(own(body,'ownerId')){need('reassignOwner');if(!/^UID-[0-9]{6,}$/.test(body.ownerId||''))fail(400,'Invalid Owner ID');const x=(await client.query(`SELECT id FROM users WHERE display_id=$1 AND status='approved' AND email_verified=true`,[body.ownerId])).rows[0];if(!x)fail(400,'Owner must be an active approved user');owner=x.id;}
   if(status==='Inactive'&&existing.status!=='Inactive'){const refs=await referenceRows(client,existing);if(refs.total)fail(409,'Country cannot be deactivated while it is referenced. Review Related / Used In first.');}
   const why=status!==existing.status?reason(body.reason):null;
   await client.query(`UPDATE countries SET name=$2,code=$3,iso3=$4,iso_numeric=$5,dialing_code=$6,default_currency=$7,nationality=$8,continent=$9,alias=$10,description=$11,status=$12,owner_id=$13,updated_by=$14,updated_at=now(),version=version+1 WHERE id=$1`,
   [existing.id,v.name,v.code,v.iso3,v.isoNumeric,v.dialingCode,v.defaultCurrency,v.nationality,v.continent,v.alias,v.description,status,owner,user.id]);
   const row=await load(client,existing.id,true);await syncPresence(client,user,row,body.businessLineIds,tz);const after=view(await load(client,existing.id));
   await event(client,user,existing.id,status!==existing.status?(status==='Inactive'?'Deactivated':'Reactivated'):'Updated',before,after,why,tz);return {record:after};
  }
  if(path.length===3&&['archive','restore','soft-delete','restore-deleted'].includes(path[2])&&method==='POST'){
   const permission={archive:'archive',restore:'restore','soft-delete':'softDelete','restore-deleted':'restoreDeleted'}[path[2]];need(permission);allowed(body,['version','reason','timeZone']);version(body.version);
   const tz=sourceTimeZone(body.timeZone),existing=await load(client,path[1],true),before=view(existing);if(existing.version!==body.version)fail(409,'This record changed. Refresh and try again.');const why=reason(body.reason),refs=await referenceRows(client,existing);
   if(path[2]==='archive'){
    if(existing.deleted_at||existing.archived_at)fail(409,'Country is not eligible for Archive');if(existing.status!=='Inactive')fail(409,'Country must be Inactive before Archive');if(refs.total)fail(409,'Country cannot be archived while references exist');
    await client.query('UPDATE countries SET archived_at=now(),archived_by=$2,updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1',[existing.id,user.id]);
   }else if(path[2]==='soft-delete'){
    if(existing.deleted_at||!existing.archived_at)fail(409,'Only an Archived Country can be deleted');if(refs.total)fail(409,'Country cannot be deleted while references exist');
    await client.query('UPDATE countries SET deleted_at=now(),deleted_by=$2,updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1',[existing.id,user.id]);
   }else if(path[2]==='restore'){
    if(existing.deleted_at||!existing.archived_at)fail(409,'Country is not Archived');await client.query(`UPDATE countries SET status='Inactive',archived_at=NULL,archived_by=NULL,updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1`,[existing.id,user.id]);
   }else{
    if(!existing.deleted_at)fail(409,'Country is not Deleted');await client.query('UPDATE countries SET deleted_at=NULL,deleted_by=NULL,archived_at=COALESCE(archived_at,now()),archived_by=COALESCE(archived_by,$2),updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1',[existing.id,user.id]);
   }
   const after=view(await load(client,existing.id));await event(client,user,existing.id,{'archive':'Archived','restore':'Restored','soft-delete':'Soft Deleted','restore-deleted':'Restored Deleted'}[path[2]],before,after,why,tz);return {record:after};
  }
  if(path.length===3&&path[2]==='presence'&&method==='PUT'){
   need('edit');allowed(body,['businessLineIds','version','timeZone']);version(body.version);const existing=await load(client,path[1],true);if(existing.version!==body.version)fail(409,'This record changed. Refresh and try again.');if(existing.status!=='Active'||existing.archived_at||existing.deleted_at)fail(409,'Business Line Presence can be changed only for an Active Country');
   await syncPresence(client,user,existing,body.businessLineIds,sourceTimeZone(body.timeZone));await client.query('UPDATE countries SET updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1',[existing.id,user.id]);return {record:view(await load(client,existing.id))};
  }
  fail(405,'Unsupported Country action');
 }catch(e){if(e.code==='23505')fail(409,'Country Name, Country Code, ISO 3-Letter Code or ISO Numeric Code already exists, including inactive, archived or deleted records');throw e;}
}
