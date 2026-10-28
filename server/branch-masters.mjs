import {randomUUID} from 'node:crypto';
import {branchMasterPermissions} from './resources.mjs';
import {fail,own,isUUID} from './branch-master-schema.mjs';
import {sourceTimeZone} from './time-zone.mjs';
const current=v=>v instanceof Date?v.toISOString():v?new Date(v).toISOString():null;
const text=(value,label,max,required=false)=>{if(typeof value!=='string')fail(400,label+' must be text');const s=value.trim();if((required&&!s)||s.length>max||/[\u0000-\u001f\u007f]/u.test(s))fail(400,'Invalid '+label);return s;};
const required=(v,n,max)=>text(v,n,max,true);
const fields={name:['name','Branch Name',150,true],code:['code','Branch Code',20,true],fullName:['full_name','Branch Full Name',200],branchType:['branch_type','Branch Type',80],city:['city','City',120,true],stateProvince:['state_province','State / Province',120],timeZone:['time_zone','Time Zone',80,true],addressLine1:['address_line1','Address Line 1',250],addressLine2:['address_line2','Address Line 2',250],landmark:['landmark','Landmark / Area',150],postalCode:['postal_code','Postal Code',30],phoneDialCode:['phone_dial_code','Phone Dial Code',10],primaryContact:['primary_contact','Primary Contact',40],alternateContact:['alternate_contact','Alternate Contact',40],officialEmail:['official_email','Official Branch Email',254],website:['website','Branch Website',300],legacyBranchCode:['legacy_branch_code','Legacy Branch Code',80],remarks:['remarks','Remarks',1000]};
const branchTypes=['','Head Office','Regional Office','Branch Office','Support Office','Virtual Office'];
const SQL="SELECT b.*,bl.name business_line_name,bl.display_id business_line_display_id,bl.code business_line_code,rg.name region_name,rg.display_id region_display_id,rg.code region_code,ct.name country_name,ct.display_id country_display_id,ct.code country_code,bm.name branch_manager_name,bm.display_id branch_manager_display_id,o.name owner_name,o.display_id owner_display_id,cr.name creator_name,cr.display_id creator_display_id,up.name updater_name,up.display_id updater_display_id,de.name deactivated_name,de.display_id deactivated_display_id,ar.name archive_name,ar.display_id archive_display_id,dl.name delete_name,dl.display_id delete_display_id FROM branch_masters b JOIN business_lines bl ON bl.id=b.business_line_id JOIN regions rg ON rg.id=b.region_id JOIN countries ct ON ct.id=b.country_id LEFT JOIN users bm ON bm.id=b.branch_manager_id JOIN users o ON o.id=b.owner_id JOIN users cr ON cr.id=b.created_by JOIN users up ON up.id=b.updated_by LEFT JOIN users de ON de.id=b.deactivated_by LEFT JOIN users ar ON ar.id=b.archived_by LEFT JOIN users dl ON dl.id=b.deleted_by";
const dateFields=new Set(['operationalStartDate']);
function view(r){const x={id:r.id,displayId:r.display_id,businessLine:r.business_line_name,businessLineRef:r.business_line_id,businessLineId:r.business_line_display_id,businessLineCode:r.business_line_code,region:r.region_name,regionRef:r.region_id,regionId:r.region_display_id,regionCode:r.region_code,country:r.country_name,countryRef:r.country_id,countryId:r.country_display_id,countryCode:r.country_code,branchManager:r.branch_manager_name,branchManagerRef:r.branch_manager_id,branchManagerId:r.branch_manager_display_id,owner:r.owner_name,ownerId:r.owner_display_id,status:r.deleted_at?'Deleted':r.archived_at?'Archived':r.status,isArchived:!!r.archived_at,isDeleted:!!r.deleted_at,createdBy:r.creator_name,createdById:r.creator_display_id,createdAt:current(r.created_at),updatedBy:r.updater_name,updatedById:r.updater_display_id,updatedAt:current(r.updated_at),deactivatedAt:current(r.deactivated_at),deactivatedBy:r.deactivated_name,deactivatedById:r.deactivated_display_id,archivedAt:current(r.archived_at),archivedBy:r.archive_name,archivedById:r.archive_display_id,deletedAt:current(r.deleted_at),deletedBy:r.delete_name,deletedById:r.delete_display_id,version:r.version,operationalStartDate:r.operational_start_date?(r.operational_start_date instanceof Date?r.operational_start_date.toISOString().slice(0,10):String(r.operational_start_date).slice(0,10)):null};for(const [key,[column]] of Object.entries(fields))x[key]=r[column];return x;}
export {view as branchMasterView,SQL as branchMasterSelect};
async function load(client,id,lock=false){if(!isUUID(id))fail(400,'Invalid Branch ID');if(lock){const row=await client.query('SELECT id FROM branch_masters WHERE id=$1 FOR UPDATE',[id]);if(!row.rowCount)fail(404,'Branch not found');}const r=(await client.query(SQL+' WHERE b.id=$1',[id])).rows[0];if(!r)fail(404,'Branch not found');return r;}
async function referenceData(client){const [lines,regions,countries,owners]=await Promise.all([
 client.query("SELECT id,display_id AS \"displayId\",name,code FROM business_lines WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL ORDER BY lower(name)"),
 client.query("SELECT id,display_id AS \"displayId\",name,code,business_line_id AS \"businessLineRef\" FROM regions WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL ORDER BY lower(name)"),
 client.query("SELECT c.id,c.display_id AS \"displayId\",c.name,c.code,cbl.business_line_id AS \"businessLineRef\" FROM countries c JOIN country_business_lines cbl ON cbl.country_id=c.id WHERE cbl.removed_at IS NULL AND c.status='Active' AND c.archived_at IS NULL AND c.deleted_at IS NULL ORDER BY lower(c.name)"),
 client.query("SELECT id,display_id AS \"ownerId\",name,email FROM users WHERE status='approved' AND email_verified=true ORDER BY name")]);
 return {businessLines:lines.rows,regions:regions.rows,countries:countries.rows,owners:owners.rows,branchTypes};
}
async function validateMapping(client,line,region,country){if(![line,region,country].every(isUUID))fail(400,'Business Line, Region and Country are mandatory');
 const [bl,rg,ct]=await Promise.all([
 client.query("SELECT 1 FROM business_lines WHERE id=$1 AND status='Active' AND archived_at IS NULL AND deleted_at IS NULL",[line]),
 client.query("SELECT 1 FROM regions WHERE id=$1 AND business_line_id=$2 AND status='Active' AND archived_at IS NULL AND deleted_at IS NULL",[region,line]),
 client.query("SELECT 1 FROM countries c JOIN country_business_lines cbl ON c.id=cbl.country_id WHERE c.id=$1 AND cbl.business_line_id=$2 AND cbl.removed_at IS NULL AND c.status='Active' AND c.archived_at IS NULL AND c.deleted_at IS NULL",[country,line])]);
 if(!bl.rowCount)fail(409,'Select an Active Business Line');
 if(!rg.rowCount)fail(409,'Select an Active Region belonging to the selected Business Line');
 if(!ct.rowCount)fail(409,'Select an Active Country where the Business Line has presence');
}
async function dependencies(client,row){
 const [scopes,records]=await Promise.all([
  client.query("SELECT count(*)::int AS count,count(*) FILTER (WHERE u.status='approved')::int AS active FROM user_scopes us JOIN users u ON u.id=us.user_id WHERE us.branch=$1 AND us.line=$2",[row.code,row.business_line_code]),
  client.query("SELECT module,count(*)::int AS count,count(*) FILTER (WHERE lower(COALESCE(data->>'status','Active')) NOT IN ('inactive','archived','deleted','completed','cancelled','closed','closed won','closed lost','converted','lost'))::int AS active FROM records WHERE (data->>'branchId'=$1 OR data->>'branch_id'=$1 OR (scope_branch=$2 AND scope_line=$3)) GROUP BY module ORDER BY module",[row.id,row.code,row.business_line_code])
 ]);
 const related=[{module:'User assignments',count:Number(scopes.rows[0]?.count||0),active:Number(scopes.rows[0]?.active||0)},...records.rows.map(r=>({module:r.module,count:Number(r.count),active:Number(r.active)}))];
 return {related,total:related.reduce((n,r)=>n+r.count,0),active:related.reduce((n,r)=>n+r.active,0)};
}
const change=(a,b)=>Object.fromEntries(Object.keys(b).filter(k=>!['id','version'].includes(k)&&JSON.stringify(a?.[k]??null)!==JSON.stringify(b[k]??null)).map(k=>[k,{before:a?.[k]??null,after:b[k]??null}]));
async function event(client,user,id,action,before,after,reason=null){await client.query('INSERT INTO branch_master_events(branch_id,actor_id,action,changes,reason) VALUES($1,$2,$3,$4,$5)',[id,user.id,action,change(before,after),reason]);await client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)',[user.id,action,'branch-master',id]);}
function version(v){if(!Number.isSafeInteger(v)||v<1)fail(400,'A valid record version is required');}
function reason(v){return required(v,'Reason',500);}
function data(body,old=null){const result={};for(const [key,[column,label,max,mandatory]] of Object.entries(fields)){let raw=own(body,key)?body[key]:old?.[column]??'';if(key==='code')raw=String(raw).toUpperCase();const value=text(raw,label,max,mandatory);result[column]=value;if(key==='code'&&!/^[A-Z0-9][A-Z0-9-]{0,19}$/.test(value))fail(400,'Branch Code must be uppercase letters, digits and hyphens');}
 if(!branchTypes.includes(result.branch_type))fail(400,'Invalid Branch Type');
 if(!Intl.supportedValuesOf('timeZone').includes(result.time_zone)&&!['UTC','Etc/UTC','Asia/Calcutta'].includes(result.time_zone))fail(400,'Select a valid IANA Time Zone');
 if(result.official_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.official_email))fail(400,'Invalid Branch Email');
 if(result.website){try{if(!['http:','https:'].includes(new URL(result.website).protocol))throw Error();}catch{fail(400,'Invalid Branch Website URL');}}
 if(own(body,'operationalStartDate')){const v=body.operationalStartDate;result.operational_start_date=v?required(v,'Operational Start Date',10):null;if(v&&!/^\d{4}-\d{2}-\d{2}$/.test(v))fail(400,'Invalid operational date');}else result.operational_start_date=old?.operational_start_date||null;
 return result;}
function checkKeys(body,allowed){if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k)))fail(400,'Unknown or system-managed field');}
const editable=['businessLineRef','regionRef','countryRef','branchManagerRef','status','ownerId','operationalStartDate','timeZone','reason','version',...Object.keys(fields)];
async function manager(client,v){if(!v)return null;if(!isUUID(v))fail(400,'Invalid Branch Manager');const r=await client.query("SELECT 1 FROM users WHERE id=$1 AND status='approved' AND email_verified=true",[v]);if(!r.rowCount)fail(409,'Choose an Active approved Branch Manager');return v;}
export async function branchMasterLookup(client,user,url){if(!user||user.status!=='approved'||!user.email_verified)fail(403,'Verified CRM access required');const line=url.searchParams.get('businessLineId');if(!isUUID(line))fail(400,'Business Line is required');const q=String(url.searchParams.get('q')||'').trim().slice(0,100);
 const rows=(await client.query("SELECT b.id,b.display_id AS \"displayId\",b.name,b.code,b.business_line_id AS \"businessLineRef\",b.region_id AS \"regionRef\",b.country_id AS \"countryRef\" FROM branch_masters b WHERE b.business_line_id=$1 AND b.status='Active' AND b.archived_at IS NULL AND b.deleted_at IS NULL AND ($2='' OR strpos(lower(b.name || ' ' || b.code || ' ' || b.display_id),lower($2))>0) ORDER BY lower(b.name) LIMIT 100",[line,q])).rows;return {branches:rows};}
export async function branchMasters({client,user,path,method,url,body={}}){
 const permissions=branchMasterPermissions(user),need=a=>{if(!permissions[a])fail(403,'Branch Master permission required: '+a);};need('read');if(method!=='GET')await client.query('SELECT pg_advisory_xact_lock(830158)');
 try{
 if(path.length===1&&method==='POST'){need('create');checkKeys(body,editable.filter(x=>!['status','ownerId','reason','version'].includes(x)));const v=data(body);await validateMapping(client,body.businessLineRef,body.regionRef,body.countryRef);const id=randomUUID(),m=await manager(client,body.branchManagerRef);
 const cols=['id','business_line_id','region_id','country_id','branch_manager_id','owner_id','created_by','updated_by',...Object.keys(v)];
 const values=[id,body.businessLineRef,body.regionRef,body.countryRef,m,user.id,user.id,user.id,...Object.values(v)];
 await client.query('INSERT INTO branch_masters('+cols.join(',')+') VALUES('+values.map((_,i)=>'$'+(i+1)).join(',')+')',values);
 const after=view(await load(client,id));await event(client,user,id,'Created',null,after);return {record:after};}
 if(path.length===2&&path[1]==='references'&&method==='GET')return {...await referenceData(client),permissions};
 if(path.length===2&&path[1]==='lookup'&&method==='GET')return branchMasterLookup(client,user,url);
 if(path.length===2&&method==='GET')return {record:view(await load(client,path[1]))};
 if(path.length===3&&path[2]==='history'&&method==='GET'){need('history');await load(client,path[1]);const rows=(await client.query('SELECT e.id,e.action,e.changes,e.reason,e.created_at,u.name actor,u.display_id actor_id FROM branch_master_events e JOIN users u ON u.id=e.actor_id WHERE e.branch_id=$1 ORDER BY e.id DESC LIMIT 200',[path[1]])).rows;return {history:rows.map(r=>({...r,createdAt:current(r.created_at),actorId:r.actor_id}))};}
 if(path.length===3&&path[2]==='related'&&method==='GET'){need('read');return dependencies(client,await load(client,path[1]));}
 if(path.length===2&&method==='PUT'){need('edit');checkKeys(body,editable);version(body.version);const old=await load(client,path[1],true),before=view(old);if(old.version!==body.version)fail(409,'This Branch changed; reload before saving');if(old.archived_at||old.deleted_at)fail(409,'Restore Branch before editing');
 const v=data(body,old),line=body.businessLineRef??old.business_line_id,region=body.regionRef??old.region_id,country=body.countryRef??old.country_id;
 const changed=line!==old.business_line_id||region!==old.region_id||country!==old.country_id;
 const codeChanged=v.code!==old.code;
 const status=body.status??old.status;if(!['Active','Inactive'].includes(status))fail(400,'Invalid Branch status');
 const deps=changed||codeChanged||status==='Inactive'&&old.status==='Active'?await dependencies(client,old):null;
 if((changed||codeChanged)&&deps?.total)fail(409,'Branch Code or organizational mapping cannot change while records are linked, including historical references. Review Related / Used In first.');
 if(status==='Inactive'&&old.status==='Active'&&deps?.active)fail(409,'Deactivate is blocked by Active User assignments or open work. Review Related / Used In first.');
 if(changed||status==='Active'&&old.status!=='Active')await validateMapping(client,line,region,country);
 let m=old.branch_manager_id;if(own(body,'branchManagerRef'))m=await manager(client,body.branchManagerRef);
 let owner=old.owner_id;if(own(body,'ownerId')){need('reassignOwner');const r=await client.query("SELECT id FROM users WHERE display_id=$1 AND status='approved' AND email_verified=true",[body.ownerId]);if(!r.rowCount)fail(400,'Owner is not eligible');owner=r.rows[0].id;}
 const why=status!==old.status?reason(body.reason):null;
 const assignments={...v,business_line_id:line,region_id:region,country_id:country,branch_manager_id:m,owner_id:owner,status,updated_by:user.id,updated_at:new Date(),version:old.version+1};
 if(old.status==='Active'&&status==='Inactive'){assignments.deactivated_at=new Date();assignments.deactivated_by=user.id;}
 if(old.status==='Inactive'&&status==='Active'){assignments.deactivated_at=null;assignments.deactivated_by=null;}
 await client.query('UPDATE branch_masters SET '+Object.keys(assignments).map((k,i)=>k+'=$'+(i+2)).join(',')+' WHERE id=$1',[old.id,...Object.values(assignments)]);
 const after=view(await load(client,old.id));await event(client,user,old.id,status!==old.status?(status==='Inactive'?'Deactivated':'Reactivated'):owner!==old.owner_id?'Owner Reassigned':changed?'Reassigned':'Updated',before,after,why);
 return {record:after};}
 if(path.length===3&&['archive','restore','soft-delete','restore-deleted'].includes(path[2])&&method==='POST'){
 const action=path[2],grant={archive:'archive',restore:'restore','soft-delete':'softDelete','restore-deleted':'restoreDeleted'}[action];need(grant);checkKeys(body,['version','reason','timeZone']);version(body.version);const old=await load(client,path[1],true),before=view(old);if(old.version!==body.version)fail(409,'This Branch changed. Reload before continuing');const why=reason(body.reason);
 if(action==='archive'){if(old.status!=='Inactive'||old.archived_at||old.deleted_at)fail(409,'Deactivate Branch before archiving');const d=await dependencies(client,old);if(d.active)fail(409,'Branch is still linked to active work');await client.query('UPDATE branch_masters SET archived_at=now(),archived_by=$2,updated_at=now(),updated_by=$2,version=version+1 WHERE id=$1',[old.id,user.id]);}
 if(action==='restore'){if(old.deleted_at||!old.archived_at)fail(409,'Branch is not Archived');await client.query("UPDATE branch_masters SET archived_at=NULL,archived_by=NULL,status='Inactive',updated_at=now(),updated_by=$2,version=version+1 WHERE id=$1",[old.id,user.id]);}
 if(action==='soft-delete'){if(!old.archived_at||old.deleted_at)fail(409,'Only Archived Branch can be deleted');const d=await dependencies(client,old);if(d.total)fail(409,'Branch is still linked to active work');await client.query('UPDATE branch_masters SET deleted_at=now(),deleted_by=$2,updated_at=now(),updated_by=$2,version=version+1 WHERE id=$1',[old.id,user.id]);}
 if(action==='restore-deleted'){if(!old.deleted_at)fail(409,'Branch is not Deleted');await client.query('UPDATE branch_masters SET deleted_at=NULL,deleted_by=NULL,archived_at=COALESCE(archived_at,now()),archived_by=COALESCE(archived_by,$2),status=$3,updated_at=now(),updated_by=$2,version=version+1 WHERE id=$1',[old.id,user.id,'Inactive']);}
 const after=view(await load(client,old.id));await event(client,user,old.id,{'archive':'Archived','restore':'Restored','soft-delete':'Soft Deleted','restore-deleted':'Restored Deleted'}[action],before,after,why);return {record:after};}
 fail(405,'Unsupported Branch Master action');
 }catch(e){if(e.code==='23505')fail(409,'Branch Code or Branch Name already exists');if(e.code==='23514')fail(409,e.message);throw e;}
}
