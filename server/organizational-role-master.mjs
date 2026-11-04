import {randomUUID} from 'node:crypto';
import {organizationalRolePermissions} from './resources.mjs';
const fail=(code,message)=>{throw Object.assign(new Error(message),{status:code});};
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
const text=(s,label,max=150,required=true)=>{
 if(typeof s!=='string')fail(400,label+' must be text');
 const v=s.trim().replace(/\s+/g,' ');
 if((required&&!v)||v.length>max||/[\u0000-\u001f\u007f]/.test(v))fail(400,'Invalid '+label);
 return v;
};
const allowed=(body,fields)=>{
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!fields.includes(k)))fail(400,'Unknown or system-managed fields');
};
const view=r=>({id:r.id,displayId:r.display_id,name:r.name,code:r.code,applicability:r.applicability,
 family:r.family,description:r.description,sortOrder:r.sort_order,
 status:r.deleted_at?'Deleted':r.archived_at?'Archived':r.status,version:r.version,
 createdAt:r.created_at,updatedAt:r.updated_at,createdBy:r.created_name,updatedBy:r.updated_name});
const base=' FROM organizational_roles r JOIN users c ON c.id=r.created_by JOIN users u ON u.id=r.updated_by';
const selection='SELECT r.*,c.name created_name,u.name updated_name'+base;
async function getRole(client,id,lock=false){
 if(!uuid(id))fail(400,'Invalid role identifier');
 if(lock){const locked=await client.query('SELECT id FROM organizational_roles WHERE id=$1 FOR UPDATE',[id]);if(!locked.rowCount)fail(404,'Role not found');}
 const row=(await client.query(selection+' WHERE r.id=$1',[id])).rows[0];
 if(!row)fail(404,'Role not found');return row;
}
function values(data,old={}){
 const code=text(data.code??old.code,'Role Code',30).toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9-]{1,29}$/.test(code))fail(400,'Role Code must be 2–30 uppercase letters, digits or hyphens');
 const applicability=data.applicability??old.applicability;
 if(!['Central','Branch','Both'].includes(applicability))fail(400,'Choose Central, Branch or Both');
 const sortOrder=data.sortOrder??old.sort_order??100;
 if(!Number.isInteger(sortOrder)||sortOrder<1||sortOrder>999999)fail(400,'Invalid Display Order');
 return {name:text(data.name??old.name,'Role Name'),code,applicability,
  family:text(data.family??old.family??'','Role Family',80,false),
  description:text(data.description??old.description??'','Description',1000,false),sortOrder};
}
async function audit(client,user,action,old,next,reason=null){
 const changes={};for(const [k,v] of Object.entries(next))
  if(JSON.stringify(old?.[k]??null)!==JSON.stringify(v))changes[k]={before:old?.[k]??null,after:v};
 await client.query('INSERT INTO organizational_role_events(role_id,actor_id,action,changes,reason) VALUES($1,$2,$3,$4,$5)',
  [next.id,user.id,action,JSON.stringify(changes),reason]);
 await client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)',
  [user.id,action,'organizational-role-master',next.id]);
}
export async function organizationalRoleMaster({client,user,path,method,url,body={}}){
 const grants=organizationalRolePermissions(user),need=action=>{if(!grants[action])fail(403,'Organizational Role Master permission required');};
 need('read');if(method!=='GET')await client.query('SELECT pg_advisory_xact_lock(830160)');
 try{
 if(path.length===1&&method==='GET'){
  const q=text(url.searchParams.get('q')||'','Search',150,false),family=text(url.searchParams.get('family')||'','Role Family',80,false);
  const status=url.searchParams.get('status')||'all',applicability=url.searchParams.get('applicability')||'all';
  if(!['all','Active','Inactive','Archived','Deleted'].includes(status)||!['all','Central','Branch','Both'].includes(applicability))fail(400,'Invalid filters');
  const page=Number(url.searchParams.get('page')||1),pageSize=Number(url.searchParams.get('pageSize')||25);
  if(!Number.isInteger(page)||page<1||page>100000||![25,50,75,100].includes(pageSize))fail(400,'Invalid pagination');
  const params=[],conditions=[];
  if(status==='all')conditions.push('r.deleted_at IS NULL AND r.archived_at IS NULL');
  else if(status==='Archived')conditions.push('r.archived_at IS NOT NULL AND r.deleted_at IS NULL');
  else if(status==='Deleted')conditions.push('r.deleted_at IS NOT NULL');
  else{params.push(status);conditions.push('r.status=$'+params.length+' AND r.archived_at IS NULL AND r.deleted_at IS NULL');}
  if(applicability!=='all'){params.push(applicability);conditions.push('r.applicability=$'+params.length);}
  if(q){params.push('%'+q.replace(/[%_\\]/g,'\\$&')+'%');conditions.push('(r.name ILIKE $'+params.length+' OR r.code ILIKE $'+params.length+' OR r.display_id ILIKE $'+params.length+')');}
  if(family){params.push('%'+family.replace(/[%_\\]/g,'\\$&')+'%');conditions.push('r.family ILIKE $'+params.length);}
  const where=' WHERE '+conditions.join(' AND ');
  const total=Number((await client.query('SELECT count(*)::int total FROM organizational_roles r'+where,params)).rows[0].total);
  const pages=Math.max(1,Math.ceil(total/pageSize)),current=Math.min(page,pages);
  const records=(await client.query(selection+where+' ORDER BY r.updated_at DESC,r.id DESC LIMIT $'+(params.length+1)+' OFFSET $'+(params.length+2),[...params,pageSize,(current-1)*pageSize])).rows.map(view);
  const counts=(await client.query("SELECT count(*)::int total,count(*) FILTER(WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL)::int active,count(*) FILTER(WHERE status='Inactive' AND archived_at IS NULL AND deleted_at IS NULL)::int inactive,count(*) FILTER(WHERE archived_at IS NOT NULL AND deleted_at IS NULL)::int archived,count(*) FILTER(WHERE deleted_at IS NOT NULL)::int deleted FROM organizational_roles r"+where,params)).rows[0];
  return {records,total,page:current,pageSize,totalPages:pages,counts,permissions:grants};
 }
 if(path.length===1&&method==='POST'){
  need('create');allowed(body,['name','code','applicability','family','description','sortOrder']);
  const x=values(body),id=randomUUID();
  await client.query('INSERT INTO organizational_roles(id,name,code,applicability,family,description,sort_order,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8)',
   [id,x.name,x.code,x.applicability,x.family,x.description,x.sortOrder,user.id]);
  const next=view(await getRole(client,id));await audit(client,user,'Created',null,next);return {record:next};
 }
 if(path.length===2&&method==='GET')return {record:view(await getRole(client,path[1]))};
 if(path.length===3&&path[2]==='history'&&method==='GET'){
  need('history');await getRole(client,path[1]);
  const rows=(await client.query('SELECT e.action,e.reason,e.changes,e.created_at,u.name actor FROM organizational_role_events e JOIN users u ON u.id=e.actor_id WHERE e.role_id=$1 ORDER BY e.id DESC LIMIT 200',[path[1]])).rows;
  return {history:rows};
 }
 if(path.length===3&&path[2]==='related'&&method==='GET'){
  await getRole(client,path[1]);
  return {related:{employeeAssignments:0,activeEmployeeAssignments:0,mappingAvailable:false}};
 }
 if(path.length===2&&method==='PUT'){
  need('edit');allowed(body,['name','code','applicability','family','description','sortOrder','version','status','reason']);
  if(!Number.isInteger(body.version)||body.version<1)fail(400,'Record version is required');
  const old=await getRole(client,path[1],true);
  if(old.version!==body.version)fail(409,'Record changed; reload');
  if(old.archived_at||old.deleted_at)fail(409,'Restore before editing');
  const x=values(body,old),status=body.status??old.status;
  if(!['Active','Inactive'].includes(status))fail(400,'Invalid status');
  const reason=status===old.status?null:text(body.reason,'Reason',500);
  await client.query('UPDATE organizational_roles SET name=$2,code=$3,applicability=$4,family=$5,description=$6,sort_order=$7,status=$8,updated_by=$9 WHERE id=$1',
   [old.id,x.name,x.code,x.applicability,x.family,x.description,x.sortOrder,status,user.id]);
  const next=view(await getRole(client,old.id));await audit(client,user,'Updated',view(old),next,reason);return {record:next};
 }
 if(path.length===3&&method==='POST'&&['archive','restore','soft-delete','restore-deleted'].includes(path[2])){
  const action=path[2],permission={'archive':'archive','restore':'restore','soft-delete':'softDelete','restore-deleted':'restoreDeleted'}[action];
  need(permission);allowed(body,['version','reason','targetStatus']);
  if(!Number.isInteger(body.version)||body.version<1)fail(400,'Record version required');
  const old=await getRole(client,path[1],true);
  if(old.version!==body.version)fail(409,'Record changed; reload');
  const why=text(body.reason,'Reason',500);
  if(action==='archive'){
   if(old.status!=='Inactive'||old.archived_at||old.deleted_at)fail(409,'Inactivate before archive');
   await client.query('UPDATE organizational_roles SET archived_at=now(),updated_by=$2 WHERE id=$1',[old.id,user.id]);
  }
  if(action==='restore'){
   if(!old.archived_at||old.deleted_at)fail(409,'Role is not archived');
   const to=body.targetStatus||'Inactive';if(!['Active','Inactive'].includes(to))fail(400,'Invalid restoration target');
   await client.query('UPDATE organizational_roles SET archived_at=NULL,status=$2,updated_by=$3 WHERE id=$1',[old.id,to,user.id]);
  }
  if(action==='soft-delete'){
   if(!old.archived_at||old.deleted_at)fail(409,'Only archived roles can be deleted');
   await client.query('UPDATE organizational_roles SET deleted_at=now(),updated_by=$2 WHERE id=$1',[old.id,user.id]);
  }
  if(action==='restore-deleted'){
   if(!old.deleted_at)fail(409,'Role is not deleted');
   const to=body.targetStatus||'Archived';
   if(!['Active','Inactive','Archived'].includes(to))fail(400,'Invalid restoration target');
   await client.query("UPDATE organizational_roles SET deleted_at=NULL,archived_at=CASE WHEN $2='Archived' THEN COALESCE(archived_at,now()) ELSE NULL END,status=CASE WHEN $2='Archived' THEN 'Inactive' ELSE $2 END,updated_by=$3 WHERE id=$1",[old.id,to,user.id]);
  }
  const next=view(await getRole(client,old.id));await audit(client,user,action,view(old),next,why);return {record:next};
 }
 fail(405,'Unsupported Organizational Role Master action');
 }catch(e){
  if(e.code==='23505')fail(409,'Organizational Role name or code already exists');
  if(e.code==='23514')fail(409,e.message);
  throw e;
 }
}
