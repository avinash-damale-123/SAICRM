import {randomUUID} from 'node:crypto';
import {resources} from './resources.mjs';

const managed=resources.map(r=>({key:r.key,name:r.name,type:'MODULE',section:r.section,category:r.subsection||'Core Masters',route:r.route,
 description:'CRM master',systemLocked:true,essential:false,common:false,admin:r.key==='REGIONS',manager:false,standard:false}));
const essentials=[
 ['HOME','Home','PAGE','Workspace','#home'],
 ['PROFILE','My Profile','PAGE','Workspace','#profile'],
 ['AUTH_LOGIN','Login','FUNCTION','Account','/login'],
 ['AUTH_LOGOUT','Sign out','FUNCTION','Account','/logout'],
 ['NOTIFICATIONS','Notifications','PAGE','Workspace','#notifications']
].map(([key,name,type,section,route])=>({key,name,type,section,route,category:'Essential',description:'',
 systemLocked:true,essential:true,common:true,admin:true,manager:true,standard:true}));
const pages=[
 ['SETTINGS','Settings & Masters','PAGE','Administration','#settings'],
 ['MODULE_MASTER','Module Master','MODULE','Administration','#modulemaster'],
 ['ROLE_MATRIX','Roles & Permissions','MODULE','Administration','#rolematrix'],
 ['MODULE_DIRECTORY','Module Directory','PAGE','Administration','#modules'],
 ['AUDIT','Audit Trail','MODULE','Administration','#audit'],
 ['USER_ACCESS','User Access & Approvals','FUNCTION','Administration','#access'],
 ['OVERVIEW','Overview','PAGE','Workspace','#overview'],
 ['MY_WORK','My Work','PAGE','Workspace','#mywork'],
 ['ANALYTICS','Analytics','PAGE','Workspace','#analytics']
].map(([key,name,type,section,route])=>({key,name,type,section,route,category:'General',description:'',
 systemLocked:key==='MODULE_MASTER'||key==='ROLE_MATRIX',essential:false,common:false,
 admin:!['MODULE_MASTER'].includes(key),manager:['SETTINGS','MODULE_DIRECTORY','OVERVIEW','MY_WORK','ANALYTICS'].includes(key),
 standard:['SETTINGS','MODULE_DIRECTORY','OVERVIEW','MY_WORK'].includes(key)}));
const operational=[
 ['LEADS','Leads','leads'],['CUSTOMERS','Customers','customers'],['CONTACTS','People & Contacts','contacts'],
 ['OPPORTUNITIES','Opportunities','opportunities'],['ACTIVITIES','Activities','activities'],['QUOTES','Quotations','quotes'],
 ['BOOKINGS','Bookings','bookings'],['EMPLOYEES','Employees & Access','employees'],['BRANCHES_LEGACY','Branch Network','branches']
].map(([key,name,slug])=>({key,name,type:'MODULE',section:'Core Modules',category:'General',route:'#'+slug,description:'',
 systemLocked:false,essential:false,common:false,admin:true,manager:!['EMPLOYEES','BRANCHES_LEGACY'].includes(key),
 standard:!['EMPLOYEES','BRANCHES_LEGACY'].includes(key)}));
export const registeredModuleResources=Object.freeze([...managed,...essentials,...pages,...operational].map(x=>Object.freeze(x)));
const registry=new Map(registeredModuleResources.map(x=>[x.key,x]));
const apiMap=Object.freeze({'business-lines':'BUSINESS_LINES',countries:'COUNTRIES',regions:'REGIONS','branch-master':'BRANCH_MASTER',
 'department-master':'DEPARTMENT_MASTER','organizational-roles':'ORGANIZATIONAL_ROLE_MASTER',
 'reporting-hierarchy':'REPORTING_HIERARCHY_MASTER',leads:'LEADS',customers:'CUSTOMERS',contacts:'CONTACTS',
 opportunities:'OPPORTUNITIES',activities:'ACTIVITIES',quotes:'QUOTES',bookings:'BOOKINGS',employees:'EMPLOYEES',branches:'BRANCHES_LEGACY',
 audit:'AUDIT',access:'USER_ACCESS'});
export const pageResourceKeys=Object.freeze({businesslines:'BUSINESS_LINES',countries:'COUNTRIES',regions:'REGIONS',
 branchmaster:'BRANCH_MASTER',departmentmaster:'DEPARTMENT_MASTER',orgroles:'ORGANIZATIONAL_ROLE_MASTER',
 reportinghierarchy:'REPORTING_HIERARCHY_MASTER',leads:'LEADS',customers:'CUSTOMERS',contacts:'CONTACTS',opportunities:'OPPORTUNITIES',
 activities:'ACTIVITIES',quotes:'QUOTES',bookings:'BOOKINGS',employees:'EMPLOYEES',branches:'BRANCHES_LEGACY',
 audit:'AUDIT',modules:'MODULE_DIRECTORY',settings:'SETTINGS',modulemaster:'MODULE_MASTER',rolematrix:'ROLE_MATRIX',home:'HOME',
 profile:'PROFILE',overview:'OVERVIEW',mywork:'MY_WORK',analytics:'ANALYTICS',notifications:'NOTIFICATIONS'});
const fail=(code,message)=>{throw Object.assign(new Error(message),{status:code});};
const isAdmin=u=>u?.system_role==='super_admin'&&u.email_verified===true&&u.status==='approved';
const type=u=>u?.role==='admin'?'admin_allowed':u?.role==='manager'?'manager_allowed':'standard_allowed';
export const keyForApi=x=>apiMap[x]||null;
export function defaultResourceAccess(user,key){
 if(isAdmin(user))return true;
 if(!user||user.status!=='approved'||!user.email_verified)return false;
 const r=registry.get(key);
 if(!r)return false;
 return r.essential||r.common||!!r[{admin_allowed:'admin',manager_allowed:'manager',standard_allowed:'standard'}[type(user)]];
}
export async function resourceEligible(client,user,key){
 if(isAdmin(user))return true;
 if(!user||user.status!=='approved'||!user.email_verified||!registry.has(key))return false;
 const r=(await client.query('SELECT * FROM module_master_resources WHERE resource_key=$1',[key])).rows[0];
 if(!r)return defaultResourceAccess(user,key);
 return r.essential||r.status==='Active'&&(r.common_resource||!!r[type(user)]);
}
export async function eligibleResourceKeys(client,user){
 if(!user||user.status!=='approved'||!user.email_verified)return [];
 if(isAdmin(user))return registeredModuleResources.map(x=>x.key);
 const rows=(await client.query('SELECT resource_key,status,essential,common_resource,admin_allowed,manager_allowed,standard_allowed FROM module_master_resources')).rows;
 const configs=new Map(rows.map(x=>[x.resource_key,x]));
 return registeredModuleResources.filter(resource=>{
  const row=configs.get(resource.key);
  return row?row.essential||row.status==='Active'&&(row.common_resource||!!row[type(user)]):defaultResourceAccess(user,resource.key);
 }).map(resource=>resource.key);
}
const view=r=>({id:r.id,displayId:r.display_id,key:r.resource_key,name:r.name,type:r.resource_type,
 section:r.section,category:r.category,route:r.route,description:r.description,systemLocked:r.system_locked,
 essential:r.essential,commonResource:r.common_resource,adminAllowed:r.admin_allowed,
 managerAllowed:r.manager_allowed,standardAllowed:r.standard_allowed,status:r.status,version:r.version,updatedAt:r.updated_at});
async function synchronize(client,user){
 await client.query('SELECT pg_advisory_xact_lock(830162)');
 let created=0,refreshed=0;
 for(const resource of registeredModuleResources){
  const old=(await client.query('SELECT * FROM module_master_resources WHERE resource_key=$1 FOR UPDATE',[resource.key])).rows[0];
  if(old){
   await client.query('UPDATE module_master_resources SET name=$2,section=$3,category=$4,route=$5,description=$6,last_seen_at=now() WHERE id=$1',
    [old.id,resource.name,resource.section,resource.category,resource.route,resource.description]);
   refreshed++;
  }else{
   const id=randomUUID();
   await client.query('INSERT INTO module_master_resources(id,resource_key,name,resource_type,section,category,route,description,system_locked,essential,common_resource,admin_allowed,manager_allowed,standard_allowed,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)',
    [id,resource.key,resource.name,resource.type,resource.section,resource.category,resource.route,resource.description,
     resource.systemLocked,resource.essential,resource.common,resource.admin,resource.manager,resource.standard,user.id]);
   await client.query('INSERT INTO module_master_events(resource_id,actor_id,action,changes) VALUES($1,$2,$3,$4)',
    [id,user.id,'Synced',JSON.stringify({key:resource.key,defaults:{admin:resource.admin,manager:resource.manager,standard:resource.standard}})]);
   created++;
  }
 }
 const known=registeredModuleResources.map(r=>r.key);
 const stale=(await client.query("SELECT id,resource_key FROM module_master_resources WHERE NOT (resource_key=ANY($1::text[])) AND status='Active' AND NOT essential FOR UPDATE",[known])).rows;
 for(const retired of stale){
  await client.query("UPDATE module_master_resources SET status='Inactive',updated_by=$2 WHERE id=$1",[retired.id,user.id]);
  await client.query('INSERT INTO module_master_events(resource_id,actor_id,action,changes) VALUES($1,$2,$3,$4)',
    [retired.id,user.id,'Retired by resource sync',JSON.stringify({status:{before:'Active',after:'Inactive'}})]);
 }
 return {created,refreshed,retired:stale.length,total:registeredModuleResources.length};
}
export async function moduleMaster({client,user,path,method,url,body={}}){
 if(!isAdmin(user))fail(403,'Super Admin access required');
 if(path.length===1&&method==='GET'){
  const q=(url.searchParams.get('q')||'').trim().slice(0,150),status=url.searchParams.get('status')||'all',
    resourceType=url.searchParams.get('type')||'all';
  if(!['all','Active','Inactive'].includes(status)||!['all','MODULE','PAGE','FUNCTION'].includes(resourceType))fail(400,'Invalid filters');
  const where=[],params=[];
  if(status!=='all'){params.push(status);where.push('status=$'+params.length);}
  if(resourceType!=='all'){params.push(resourceType);where.push('resource_type=$'+params.length);}
  if(q){params.push('%'+q.replace(/[%_\\]/g,'\\$&')+'%');
   where.push('(name ILIKE $'+params.length+' OR resource_key ILIKE $'+params.length+' OR route ILIKE $'+params.length+' OR section ILIKE $'+params.length+')');}
  const filter=where.length?' WHERE '+where.join(' AND '):'';
  const rows=(await client.query('SELECT * FROM module_master_resources'+filter+' ORDER BY section,name LIMIT 1000',params)).rows;
  const counts=(await client.query("SELECT count(*)::int total,count(*) FILTER(WHERE status='Active')::int active,count(*) FILTER(WHERE system_locked)::int locked,count(*) FILTER(WHERE admin_allowed OR common_resource)::int admin,count(*) FILTER(WHERE manager_allowed OR common_resource)::int manager,count(*) FILTER(WHERE standard_allowed OR common_resource)::int standard FROM module_master_resources")).rows[0];
  return {resources:rows.map(view),counts:{...counts,pendingConfig:0},registryCount:registeredModuleResources.length};
 }
 if(path.length===2&&path[1]==='sync'&&method==='POST')return {sync:await synchronize(client,user)};
 if(path.length===3&&path[2]==='history'&&method==='GET'){
  const rows=(await client.query('SELECT e.action,e.changes,e.created_at AS "createdAt",u.name actor FROM module_master_events e JOIN users u ON u.id=e.actor_id WHERE e.resource_id=$1 ORDER BY e.id DESC LIMIT 200',[path[1]])).rows;
  return {history:rows};
 }
 if(path.length===2&&method==='PUT'){
  if(!body||Object.keys(body).some(k=>!['version','adminAllowed','managerAllowed','standardAllowed','commonResource','status'].includes(k)))fail(400,'Unknown field');
  if(!Number.isInteger(body.version)||body.version<1||['adminAllowed','managerAllowed','standardAllowed','commonResource'].some(k=>typeof body[k]!=='boolean')||!['Active','Inactive'].includes(body.status))fail(400,'Invalid configuration');
  await client.query('SELECT pg_advisory_xact_lock(830162)');
  const old=(await client.query('SELECT * FROM module_master_resources WHERE id=$1 FOR UPDATE',[path[1]])).rows[0];
  if(!old)fail(404,'Resource not found');
  if(old.version!==body.version)fail(409,'Resource changed; reload');
  if(old.essential&&(body.status!=='Active'||!body.commonResource))fail(409,'Essential resources cannot be disabled');
  if(old.resource_key==='MODULE_MASTER'&&(body.commonResource||body.adminAllowed||body.managerAllowed||body.standardAllowed))fail(409,'Module Master is Super Admin only');
  const previous=view(old);
  await client.query('UPDATE module_master_resources SET admin_allowed=$2,manager_allowed=$3,standard_allowed=$4,common_resource=$5,status=$6,updated_by=$7 WHERE id=$1',
   [old.id,body.adminAllowed,body.managerAllowed,body.standardAllowed,body.commonResource,body.status,user.id]);
  const next=view((await client.query('SELECT * FROM module_master_resources WHERE id=$1',[old.id])).rows[0]);
  const changes={};for(const k of ['adminAllowed','managerAllowed','standardAllowed','commonResource','status'])
   if(previous[k]!==next[k])changes[k]={before:previous[k],after:next[k]};
  await client.query('INSERT INTO module_master_events(resource_id,actor_id,action,changes) VALUES($1,$2,$3,$4)',
   [old.id,user.id,'Eligibility updated',JSON.stringify(changes)]);
  await client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)',
   [user.id,'Module eligibility updated','module-master',old.id]);
  return {resource:next};
 }
 fail(405,'Unsupported Module Master action');
}
