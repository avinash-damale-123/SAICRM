import {randomUUID} from 'node:crypto';
import {regionPermissions,regionResource} from './resources.mjs';
import {fail,own,isUUID} from './region-records-schema.mjs';
import {sourceTimeZone} from './time-zone.mjs';

const uuid=isUUID;
const date=v=>v==null?null:(v instanceof Date?v.toISOString():new Date(v).toISOString());
const select=`SELECT r.*,bl.name business_line_name,bl.display_id business_line_display_id,bl.code business_line_code,
 bl.status business_line_status,bl.archived_at business_line_archived_at,bl.deleted_at business_line_deleted_at,
 o.name owner_name,o.display_id owner_display_id,cr.name creator_name,cr.display_id creator_display_id,
 u.name updater_name,u.display_id updater_display_id,a.name archive_name,a.display_id archive_display_id,
 d.name delete_name,d.display_id delete_display_id
 FROM regions r JOIN business_lines bl ON bl.id=r.business_line_id
 JOIN users o ON o.id=r.owner_id JOIN users cr ON cr.id=r.created_by JOIN users u ON u.id=r.updated_by
 LEFT JOIN users a ON a.id=r.archived_by LEFT JOIN users d ON d.id=r.deleted_by`;

function text(v,label,max,required=false){if(typeof v!=='string')fail(400,label+' must be text');const s=v.trim();if((required&&!s)||s.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(s))fail(400,'Invalid '+label);return s;}
function cleanName(v,label,max){return text(v,label,max,true).replace(/\s+/gu,' ');}
function code(v){const s=text(v,'Region Code',16,true).toUpperCase();if(!/^[A-Z0-9][A-Z0-9-]{0,15}$/.test(s))fail(400,'Region Code must use 1-16 uppercase letters, digits or hyphens and cannot contain spaces');return s;}
function version(v){if(!Number.isSafeInteger(v)||v<1)fail(400,'A valid record version is required');return v;}
function reason(v){return text(v,'Lifecycle reason',500,true);}
function view(r){return {
 id:r.id,displayId:r.display_id,businessLine:r.business_line_name,businessLineId:r.business_line_display_id,businessLineRef:r.business_line_id,
 businessLineCode:r.business_line_code,name:r.name,code:r.code,regionalManager:r.regional_manager,remarks:r.remarks,
 status:r.deleted_at?'Deleted':r.archived_at?'Archived':r.status,owner:r.owner_name,ownerId:r.owner_display_id,
 createdBy:r.creator_name,createdById:r.creator_display_id,createdAt:date(r.created_at),
 updatedBy:r.updater_name,updatedById:r.updater_display_id,updatedAt:date(r.updated_at),
 archivedBy:r.archive_name,archivedById:r.archive_display_id,archivedAt:date(r.archived_at),
 deletedBy:r.delete_name,deletedById:r.delete_display_id,deletedAt:date(r.deleted_at),version:r.version,
 parentBusinessLineStatus:r.business_line_deleted_at?'Deleted':r.business_line_archived_at?'Archived':r.business_line_status
};}
export {view as regionView};

async function load(client,id,lock=false){if(!uuid(id))fail(400,'Invalid Region ID');if(lock){const x=await client.query('SELECT id FROM regions WHERE id=$1 FOR UPDATE',[id]);if(!x.rowCount)fail(404,'Region not found');}const r=(await client.query(select+' WHERE r.id=$1',[id])).rows[0];if(!r)fail(404,'Region not found');return r;}
async function activeBusinessLines(client){return (await client.query(`SELECT id,display_id AS "displayId",code,name FROM business_lines WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL ORDER BY lower(name),id`)).rows;}
async function owners(client){return (await client.query(`SELECT id,display_id AS "ownerId",name,email FROM users WHERE status='approved' AND email_verified=true ORDER BY name,id`)).rows;}
async function line(client,id,active=true){if(!uuid(id))fail(400,'Select a valid Business Line');const sql='SELECT id,display_id,code,name,status,archived_at,deleted_at FROM business_lines WHERE id=$1'+(active?" AND status='Active' AND archived_at IS NULL AND deleted_at IS NULL":'');const row=(await client.query(sql,[id])).rows[0];if(!row)fail(409,active?'Choose an Active Business Line':'Business Line not found');return row;}

async function referenceRows(client,region){
 const rows=(await client.query(`SELECT module,count(*)::int AS count,
 count(*) FILTER(WHERE lower(COALESCE(data->>'status','Active')) NOT IN ('inactive','archived','deleted','cancelled','closed lost'))::int AS active
 FROM records WHERE data->>'regionId'=$1 OR data->>'region_id'=$1
 OR lower(COALESCE(data->>'region',''))=lower($2) OR lower(COALESCE(data->>'regionCode',''))=lower($3)
 GROUP BY module ORDER BY module`,[region.id,region.name,region.code])).rows;
 return {rows,total:rows.reduce((n,r)=>n+Number(r.count),0),active:rows.reduce((n,r)=>n+Number(r.active),0)};
}
function changes(before,after){const out={};for(const k of ['businessLine','businessLineId','name','code','regionalManager','remarks','status','ownerId','archivedAt','deletedAt'])if((before?.[k]??null)!==(after?.[k]??null))out[k]={before:before?.[k]??null,after:after?.[k]??null};return out;}
async function event(client,user,id,action,before,after,why=null,tz=null){
 const payload=changes(before,after);if(tz!==null)payload._context={timeZone:tz};
 await client.query('INSERT INTO region_events(region_id,actor_id,action,changes,reason) VALUES($1,$2,$3,$4,$5)',[id,user.id,action,payload,why]);
 await client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)',[user.id,action,'regions',id]);
}
function parseInput(body,existing=null){return {
 businessLineRef:own(body,'businessLineRef')?body.businessLineRef:existing?.business_line_id,
 name:own(body,'name')?cleanName(body.name,'Region Name',100):existing?.name,
 code:own(body,'code')?code(body.code):existing?.code,
 regionalManager:own(body,'regionalManager')?cleanName(body.regionalManager,'Regional Manager',100):existing?.regional_manager,
 remarks:own(body,'remarks')?text(body.remarks,'Remarks',1000):existing?.remarks||''
};}
function allowed(body,allowedKeys){if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!allowedKeys.includes(k)))fail(400,'Unknown or server-managed field');}

export async function regionLookup(client,user,url){
 if(!user||user.status!=='approved'||user.email_verified!==true)fail(403,'Approved verified CRM access required');
 const params=url.searchParams;for(const key of params.keys())if(!['q','businessLineId','limit'].includes(key))fail(400,'Unknown lookup filter');
 const lineId=params.get('businessLineId');if(!lineId||!uuid(lineId))fail(400,'Business Line ID is required for Region lookup');
 const q=String(params.get('q')||'').trim();if(q.length>100||/[\u0000-\u001f]/u.test(q))fail(400,'Invalid Region search');
 const rawLimit=params.get('limit')||'50',limit=Number(rawLimit);if(!/^\d+$/.test(rawLimit)||!Number.isSafeInteger(limit)||limit<1||limit>100)fail(400,'Lookup limit must be between 1 and 100');
 const rows=(await client.query(`SELECT r.id,r.display_id,r.name,r.code,bl.id business_line_id,bl.display_id business_line_display_id,bl.code business_line_code,bl.name business_line_name
 FROM regions r JOIN business_lines bl ON bl.id=r.business_line_id
 WHERE r.business_line_id=$1 AND r.status='Active' AND r.archived_at IS NULL AND r.deleted_at IS NULL
 AND bl.status='Active' AND bl.archived_at IS NULL AND bl.deleted_at IS NULL
 AND ($2::text='' OR strpos(lower(r.name),lower($2))>0 OR strpos(lower(r.code),lower($2))>0)
 ORDER BY lower(r.name),r.id LIMIT $3`,[lineId,q,limit])).rows;
 return {regions:rows.map(r=>({id:r.id,displayId:r.display_id,name:r.name,code:r.code,businessLineId:r.business_line_id,businessLineDisplayId:r.business_line_display_id,businessLineCode:r.business_line_code,businessLine:r.business_line_name,label:r.name+' ('+r.code+')'}))};
}

export async function regions({client,user,path,method,url,body}){
 const permissions=regionPermissions(user),need=a=>{if(permissions[a]!==true)fail(403,'You do not have permission for this Region action');};
 if(!permissions.read)fail(403,'Region Master access required');
 if(path[0]!=='regions'||path.length>4)fail(404,'Not found');
 if(method!=='GET')await client.query('SELECT pg_advisory_xact_lock(830154)');
 try{
  if(path.length===1&&method==='POST'){
   need('create');allowed(body,['businessLineRef','name','code','regionalManager','remarks','timeZone']);
   const tz=sourceTimeZone(body.timeZone),v=parseInput(body),parent=await line(client,v.businessLineRef,true),id=randomUUID();
   await client.query(`INSERT INTO regions(id,business_line_id,name,code,regional_manager,remarks,owner_id,created_by,updated_by)
   VALUES($1,$2,$3,$4,$5,$6,$7,$7,$7)`,[id,parent.id,v.name,v.code,v.regionalManager,v.remarks,user.id]);
   const after=view(await load(client,id));await event(client,user,id,'Created',null,after,null,tz);return {record:after};
  }
  if(path.length===2&&path[1]==='references'&&method==='GET'){need('read');return {businessLines:await activeBusinessLines(client),owners:await owners(client),resource:regionResource,permissions};}
  if(path.length===2&&method==='GET'){need('read');return {record:view(await load(client,path[1]))};}
  if(path.length===3&&path[2]==='history'&&method==='GET'){
   need('history');await load(client,path[1]);const rows=(await client.query(`SELECT e.id,u.display_id actor_id,u.name actor,e.action,e.changes,e.reason,e.created_at FROM region_events e JOIN users u ON u.id=e.actor_id WHERE e.region_id=$1 ORDER BY e.id DESC LIMIT 200`,[path[1]])).rows;
   return {history:rows.map(r=>{const {_context,...rest}=r.changes||{};return {id:r.id,actorId:r.actor_id,actor:r.actor,action:r.action,changes:rest,reason:r.reason,timeZone:_context?.timeZone||null,createdAt:date(r.created_at)};})};
  }
  if(path.length===3&&path[2]==='related'&&method==='GET'){need('read');const region=await load(client,path[1]),refs=await referenceRows(client,region);return {related:refs.rows.map(r=>({module:r.module,count:Number(r.count),active:Number(r.active)})),total:refs.total,active:refs.active};}
  if(path.length===2&&method==='PUT'){
   need('edit');allowed(body,['businessLineRef','name','code','regionalManager','remarks','status','ownerId','version','reason','timeZone']);version(body.version);
   const tz=sourceTimeZone(body.timeZone),existing=await load(client,path[1],true),before=view(existing);if(existing.version!==body.version)fail(409,'This record changed. Refresh and try again.');if(existing.archived_at||existing.deleted_at)fail(409,'Restore this Region before editing');
   const v=parseInput(body,existing),status=own(body,'status')?body.status:existing.status;if(!['Active','Inactive'].includes(status))fail(400,'Invalid Region status');
   let parent=existing.business_line_id;if(v.businessLineRef!==existing.business_line_id){const refs=await referenceRows(client,existing);if(refs.total)fail(409,'Business Line cannot be changed while this Region is referenced. Review Related / Used In first.');parent=(await line(client,v.businessLineRef,true)).id;}
   if(status==='Active'&&existing.status!=='Active')await line(client,parent,true);
   let owner=existing.owner_id,ownerChanged=false;if(own(body,'ownerId')){need('reassignOwner');if(!/^UID-[0-9]{6,}$/.test(body.ownerId||''))fail(400,'Invalid Owner ID');const x=(await client.query(`SELECT id FROM users WHERE display_id=$1 AND status='approved' AND email_verified=true`,[body.ownerId])).rows[0];if(!x)fail(400,'Owner must be an active approved user');owner=x.id;ownerChanged=owner!==existing.owner_id;}
   const why=status!==existing.status?reason(body.reason):null;
   await client.query(`UPDATE regions SET business_line_id=$2,name=$3,code=$4,regional_manager=$5,remarks=$6,status=$7,owner_id=$8,updated_by=$9,updated_at=now(),version=version+1 WHERE id=$1`,
   [existing.id,parent,v.name,v.code,v.regionalManager,v.remarks,status,owner,user.id]);
   const after=view(await load(client,existing.id));const action=status!==existing.status?(status==='Inactive'?'Deactivated':'Reactivated'):ownerChanged?'Owner Reassigned':parent!==existing.business_line_id?'Business Line Changed':'Updated';await event(client,user,existing.id,action,before,after,why,tz);return {record:after};
  }
  if(path.length===3&&['archive','restore','soft-delete','restore-deleted'].includes(path[2])&&method==='POST'){
   const permission={archive:'archive',restore:'restore','soft-delete':'softDelete','restore-deleted':'restoreDeleted'}[path[2]];need(permission);allowed(body,['version','reason','timeZone']);version(body.version);
   const tz=sourceTimeZone(body.timeZone),existing=await load(client,path[1],true),before=view(existing);if(existing.version!==body.version)fail(409,'This record changed. Refresh and try again.');const why=reason(body.reason),refs=await referenceRows(client,existing);
   if(path[2]==='archive'){
    if(existing.deleted_at||existing.archived_at||existing.status!=='Inactive')fail(409,'Region must be Inactive before Archive');if(refs.active)fail(409,'Region cannot be archived while active operational dependencies exist. Review Related / Used In first.');
    await client.query('UPDATE regions SET archived_at=now(),archived_by=$2,updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1',[existing.id,user.id]);
   }else if(path[2]==='soft-delete'){
    if(existing.deleted_at||!existing.archived_at)fail(409,'Only an Archived Region can be deleted');if(refs.active)fail(409,'Region cannot be deleted while active operational dependencies exist.');
    await client.query('UPDATE regions SET deleted_at=now(),deleted_by=$2,updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1',[existing.id,user.id]);
   }else if(path[2]==='restore'){
    if(existing.deleted_at||!existing.archived_at)fail(409,'Region is not Archived');await line(client,existing.business_line_id,true);await client.query(`UPDATE regions SET status='Inactive',archived_at=NULL,archived_by=NULL,updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1`,[existing.id,user.id]);
   }else{
    if(!existing.deleted_at)fail(409,'Region is not Deleted');await client.query('UPDATE regions SET deleted_at=NULL,deleted_by=NULL,archived_at=COALESCE(archived_at,now()),archived_by=COALESCE(archived_by,$2),updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1',[existing.id,user.id]);
   }
   const after=view(await load(client,existing.id));await event(client,user,existing.id,{'archive':'Archived','restore':'Restored','soft-delete':'Soft Deleted','restore-deleted':'Restored Deleted'}[path[2]],before,after,why,tz);return {record:after};
  }
  fail(405,'Unsupported Region action');
 }catch(e){if(e.code==='23505'){if(String(e.constraint||'').includes('code'))fail(409,'Region Code already exists, including inactive, archived or deleted Regions');fail(409,'Region Name already exists in this Business Line, including inactive, archived or deleted Regions');}throw e;}
}
