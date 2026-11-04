import {randomUUID} from 'node:crypto';
import {fields as operationalFields} from './contracts.mjs';
import {registeredModuleResources,resourceEligible} from './module-master.mjs';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const clean=(x,name,max=150,required=true)=>{if(typeof x!=='string')fail(400,name+' must be text');const v=x.trim().replace(/\s+/g,' ');if((required&&!v)||v.length>max||/[\u0000-\u001f\u007f]/.test(v))fail(400,'Invalid '+name);return v;};
const only=(obj,keys)=>{if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).some(k=>!keys.includes(k)))fail(400,'Unexpected permission field');};
const admin=user=>user?.status==='approved'&&user?.email_verified===true&&(user?.system_role==='super_admin'||user?.role==='admin');
const tiers={'Admin':'admin_allowed','Manager':'manager_allowed','Standard User':'standard_allowed'};
export const roleActions=Object.freeze(['View','Create','Edit','Delete','Archive','Restore','Import','Export','Approve','Assign','Bulk Update']);
export const recordScopes=Object.freeze(['None','My Records','Team','Branch']);
export const fieldStates=Object.freeze(['Editable','Read Only','Hidden']);
const catalog=Object.freeze({LEADS:'leads',CUSTOMERS:'customers',CONTACTS:'contacts',OPPORTUNITIES:'opportunities',ACTIVITIES:'activities',QUOTES:'quotes',BOOKINGS:'bookings',EMPLOYEES:'employees',BRANCHES_LEGACY:'branches'});
const keys=new Set(registeredModuleResources.map(x=>x.key));
const query='SELECT r.*,d.name department_name,d.display_id department_code,u.name updated_name FROM crm_permission_roles r JOIN department_units d ON d.id=r.department_id JOIN users u ON u.id=r.updated_by';
const output=r=>({id:r.id,displayId:r.display_id,name:r.name,code:r.code,userType:r.user_type,departmentId:r.department_id,department:r.department_name,description:r.description,status:r.status,version:r.version,permissions:r.permissions,fields:r.fields,updatedAt:r.updated_at,updatedBy:r.updated_name});
async function fetchOne(client,id,lock=false){
 if(!uuid(id))fail(400,'Invalid Role ID');
 if(lock){const x=await client.query('SELECT id FROM crm_permission_roles WHERE id=$1 FOR UPDATE',[id]);if(!x.rowCount)fail(404,'Role not found');}
 const row=(await client.query(query+' WHERE r.id=$1',[id])).rows[0];if(!row)fail(404,'Role not found');return row;
}
async function eligibility(client,type){
 const configs=(await client.query('SELECT resource_key,status,essential,system_locked,common_resource,admin_allowed,manager_allowed,standard_allowed FROM module_master_resources')).rows;
 const map=new Map(configs.map(r=>[r.resource_key,r]));
 return registeredModuleResources.map(r=>{const cfg=map.get(r.key);
  return {key:r.key,name:r.name,section:r.section,type:r.type,
   eligible:!!cfg&&(cfg.essential||(cfg.status==='Active'&&(cfg.common_resource||cfg[tiers[type]]))),
   locked:!!cfg?.system_locked,essential:!!cfg?.essential};});
}
export function validateRoleMatrix(permissions,fields,resources){
 only(permissions,Object.keys(permissions||{}));only(fields,Object.keys(fields||{}));
 const map=new Map(resources.map(x=>[x.key,x])),permitted={},fieldRules={};
 for(const [key,entry] of Object.entries(permissions)){
  const r=map.get(key);if(!r||!keys.has(key))fail(400,'Unknown resource '+key);
  if(!r.eligible||r.locked||r.essential)fail(403,'Resource is blocked by Module Master: '+key);
  only(entry,['actions','scope']);
  if(!Array.isArray(entry.actions)||entry.actions.length>roleActions.length||entry.actions.some(a=>!roleActions.includes(a))||new Set(entry.actions).size!==entry.actions.length)fail(400,'Invalid actions for '+key);
  if(!recordScopes.includes(entry.scope))fail(400,'Invalid record scope');
  if(!entry.actions.includes('View')&&(entry.actions.length||entry.scope!=='None'))fail(400,'View required for action grants');
  if(entry.actions.includes('View')&&entry.scope==='None')fail(400,'Choose a record scope');
  if(entry.actions.length)permitted[key]={actions:entry.actions,scope:entry.scope};
 }
 for(const [key,states] of Object.entries(fields)){
  const r=map.get(key),schema=catalog[key]&&operationalFields[catalog[key]];
  if(!r||!r.eligible||r.locked||r.essential||!permitted[key]?.actions.includes('View'))fail(403,'Field permissions require an eligible resource with View');
  if(!schema)fail(400,'No field catalogue for '+key);
  only(states,schema.map(f=>f[0]));
  for(const [name,state] of Object.entries(states)){
   if(!fieldStates.includes(state))fail(400,'Invalid field state');
   if(['scopeBranch','scopeLine'].includes(name)&&state==='Editable')fail(400,'Access-scope fields are locked');
  }
  fieldRules[key]=states;
 }
 return {permissions:permitted,fields:fieldRules};
}
async function department(client,id){
 if(!uuid(id))fail(400,'Select Department');
 const row=(await client.query('SELECT id,status,archived_at,deleted_at FROM department_units WHERE id=$1',[id])).rows[0];
 if(!row||row.status!=='Active'||row.archived_at||row.deleted_at)fail(409,'Department must be Active');
}
async function history(client,user,action,previous,next){
 const changes={};for(const k of ['name','code','description','status','permissions','fields'])
  if(JSON.stringify(previous?.[k]??null)!==JSON.stringify(next?.[k]??null))changes[k]={before:previous?.[k]??null,after:next?.[k]??null};
 await client.query('INSERT INTO crm_permission_role_events(permission_role_id,actor_id,action,changes) VALUES($1,$2,$3,$4)',[next.id,user.id,action,JSON.stringify(changes)]);
 await client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)',[user.id,action,'role-matrix',next.id]);
}
export async function roleMatrix({client,user,path,method,url,body={}}){
 if(!admin(user))fail(403,'Role Matrix requires approved Admin or Super Admin');
 if(user.system_role!=='super_admin'&&!(await resourceEligible(client,user,'ROLE_MATRIX')))fail(403,'Module Master blocks Role Matrix for this user type');
 if(method!=='GET')await client.query('SELECT pg_advisory_xact_lock(830163)');
 try{
  if(path.length===2&&path[1]==='setup'&&method==='GET'){
   const departments=(await client.query("SELECT id,name,scope,display_id AS \"displayId\" FROM department_units WHERE level='Department' AND status='Active' AND archived_at IS NULL AND deleted_at IS NULL ORDER BY scope,name")).rows;
   const resources=await Promise.all(Object.keys(tiers).map(async tier=>[tier,await eligibility(client,tier)]));
   const fieldCatalog=Object.fromEntries(Object.entries(catalog).map(([key,module])=>[key,operationalFields[module].map(([id,label])=>({key:id,label,locked:['scopeBranch','scopeLine'].includes(id)}))]));
   return {departments,resources:Object.fromEntries(resources),fieldCatalog,actions:roleActions,scopes:recordScopes,fieldStates};
  }
  if(path.length===1&&method==='GET'){
   const search=clean(url.searchParams.get('q')||'','Search',100,false);
   const params=search?['%'+search.replace(/[%_\\]/g,'\\$&')+'%']:[];
   const where=search?' WHERE r.name ILIKE $1 OR r.code ILIKE $1 OR d.name ILIKE $1':'';
   const rows=(await client.query(query+where+' ORDER BY r.updated_at DESC,r.id DESC LIMIT 300',params)).rows;
   const counts=(await client.query("SELECT count(*)::int total,count(*) FILTER(WHERE status='Active')::int active,count(*) FILTER(WHERE permissions<>'{}'::jsonb)::int configured FROM crm_permission_roles")).rows[0];
   return {roles:rows.map(output),counts};
  }
  if(path.length===1&&method==='POST'){
   only(body,['name','code','departmentId','userType','description','permissions','fields']);
   const name=clean(body.name,'Role Name'),code=clean(body.code,'Role Code',30).toUpperCase(),description=clean(body.description??'','Description',1000,false);
   if(!/^[A-Z0-9][A-Z0-9-]{1,29}$/.test(code))fail(400,'Invalid Role Code');
   if(!tiers[body.userType])fail(400,'Select User Type');
   await department(client,body.departmentId);
   const normalized=validateRoleMatrix(body.permissions||{},body.fields||{},await eligibility(client,body.userType));
   const id=randomUUID();
   await client.query('INSERT INTO crm_permission_roles(id,name,code,department_id,user_type,description,permissions,fields,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)',
    [id,name,code,body.departmentId,body.userType,description,JSON.stringify(normalized.permissions),JSON.stringify(normalized.fields),user.id]);
   const next=output(await fetchOne(client,id));await history(client,user,'Created',null,next);return {role:next};
  }
  if(path.length===2&&method==='GET')return {role:output(await fetchOne(client,path[1]))};
  if(path.length===3&&path[2]==='history'&&method==='GET'){
   await fetchOne(client,path[1]);
   return {history:(await client.query('SELECT e.action,e.changes,e.created_at AS "createdAt",u.name actor FROM crm_permission_role_events e JOIN users u ON u.id=e.actor_id WHERE e.permission_role_id=$1 ORDER BY e.id DESC LIMIT 200',[path[1]])).rows};
  }
  if(path.length===2&&method==='PUT'){
   only(body,['version','name','code','description','status','permissions','fields']);
   if(!Number.isInteger(body.version)||body.version<1)fail(400,'Record version required');
   const old=await fetchOne(client,path[1],true);if(old.version!==body.version)fail(409,'Role changed; reload');
   const name=clean(body.name??old.name,'Role Name'),code=clean(body.code??old.code,'Role Code',30).toUpperCase();
   if(!/^[A-Z0-9][A-Z0-9-]{1,29}$/.test(code))fail(400,'Invalid Role Code');
   const status=body.status??old.status;if(!['Active','Inactive'].includes(status))fail(400,'Invalid status');
   const normalized=validateRoleMatrix(body.permissions??old.permissions,body.fields??old.fields,await eligibility(client,old.user_type));
   const description=clean(body.description??old.description,'Description',1000,false);
   await client.query('UPDATE crm_permission_roles SET name=$2,code=$3,description=$4,status=$5,permissions=$6,fields=$7,updated_by=$8 WHERE id=$1',
    [old.id,name,code,description,status,JSON.stringify(normalized.permissions),JSON.stringify(normalized.fields),user.id]);
   const next=output(await fetchOne(client,old.id));await history(client,user,'Updated',output(old),next);return {role:next};
  }
  fail(405,'Unsupported Role Matrix action');
 }catch(e){
  if(e.code==='23505')fail(409,'Role Code or Department/User Type role name already exists');
  if(e.code==='23514')fail(409,e.message);
  throw e;
 }
}
