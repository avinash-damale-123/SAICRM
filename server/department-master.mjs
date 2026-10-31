import {randomUUID} from 'node:crypto';
import {departmentPermissions,departmentResource} from './resources.mjs';
import {departmentTransfer} from './department-transfers.mjs';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const clean=(value,label,max=150,mandatory=true)=>{if(typeof value!=='string')fail(400,label+' must be text');const s=value.trim();if((mandatory&&!s)||s.length>max||/[\u0000-\u001f\u007f]/.test(s))fail(400,'Invalid '+label);return s;};
const levelValues=['Department','Sub-Department','Team'],scopes=['Central','Branch'];
const allowed=(body,fields)=>{if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!fields.includes(k)))fail(400,'Unknown or system-managed field');};
const info=String.raw`SELECT u.*,p.name parent_name,p.display_id parent_display_id,
 cr.name created_name,up.name updated_name
 FROM department_units u LEFT JOIN department_units p ON p.id=u.parent_id
 JOIN users cr ON cr.id=u.created_by JOIN users up ON up.id=u.updated_by`;
const active=row=>row&&row.status==='Active'&&!row.archived_at&&!row.deleted_at;
const iso=x=>x instanceof Date?x.toISOString():x||null;
const view=r=>({id:r.id,displayId:r.display_id,scope:r.scope,level:r.level,parentId:r.parent_id,
 parent:r.parent_name||'',parentDisplayId:r.parent_display_id||'',
 name:r.name,code:r.code,description:r.description,sortOrder:r.sort_order,
 status:r.deleted_at?'Deleted':r.archived_at?'Archived':r.status,
 createdBy:r.created_name,updatedBy:r.updated_name,createdAt:iso(r.created_at),updatedAt:iso(r.updated_at),
 archivedAt:iso(r.archived_at),deletedAt:iso(r.deleted_at),version:r.version});
async function fetchUnit(client,id,lock=false){
 if(!uuid(id))fail(400,'Invalid Department unit identifier');
 if(lock){const found=await client.query('SELECT id FROM department_units WHERE id=$1 FOR UPDATE',[id]);if(!found.rowCount)fail(404,'Department unit not found');}
 const x=(await client.query(info+' WHERE u.id=$1',[id])).rows[0];
 if(!x)fail(404,'Department unit not found');return x;
}
async function audit(client,user,action,target,before,after,reason=null,assignment=false){
 const changes={};for(const [k,v] of Object.entries(after||{}))if(JSON.stringify(before?.[k]??null)!==JSON.stringify(v))changes[k]={before:before?.[k]??null,after:v};
 await client.query('INSERT INTO department_events(unit_id,assignment_id,actor_id,action,changes,reason) VALUES($1,$2,$3,$4,$5,$6)',
  [assignment?null:target,assignment?target:null,user.id,action,JSON.stringify(changes),reason]);
 await client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)',[user.id,action,'department-master',target]);
}
async function blockers(client,id){
 const [children,assignments]=await Promise.all([
  client.query("SELECT count(*)::int total,count(*) FILTER (WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL)::int active FROM department_units WHERE parent_id=$1",[id]),
  client.query("SELECT count(*)::int total,count(*) FILTER (WHERE status='Active')::int active FROM department_branch_assignments WHERE unit_id=$1",[id])]);
 return {childUnits:children.rows[0],branchAssignments:assignments.rows[0],
   total:Number(children.rows[0]?.total||0)+Number(assignments.rows[0]?.total||0),
   active:Number(children.rows[0]?.active||0)+Number(assignments.rows[0]?.active||0)};
}
function mustVersion(v){if(!Number.isInteger(v)||v<1)fail(400,'Record version is required');}
function mustReason(v){return clean(v,'Reason',500);}
async function validateParent(client,scope,level,parentId,self=null){
 if(level==='Department'){if(parentId)fail(400,'Department cannot have a parent');return null;}
 if(!uuid(parentId)||parentId===self)fail(400,'Select a valid parent unit');
 const p=(await client.query('SELECT id,scope,level,status,archived_at,deleted_at,parent_id FROM department_units WHERE id=$1',[parentId])).rows[0];
 if(!p||p.scope!==scope||(level==='Sub-Department'&&p.level!=='Department')||
 (level==='Team'&&!['Department','Sub-Department'].includes(p.level))||!active(p))fail(409,'Select an Active parent in the same catalog');
 return p;
}
function validateValues(body,previous=null){
 const scope=body.scope??previous?.scope,level=body.level??previous?.level;
 if(!scopes.includes(scope)||!levelValues.includes(level))fail(400,'Select Central/Branch and Department level');
 const name=clean(body.name??previous?.name,'Unit Name');
 const code=clean(body.code??previous?.code,'Unit Code',30).toUpperCase();
 if(!/^[A-Z0-9][A-Z0-9-]{1,29}$/.test(code))fail(400,'Code must use uppercase letters, numbers and hyphens');
 const description=clean(body.description??previous?.description??'','Description',1000,false);
 const sortOrder=body.sortOrder??previous?.sort_order??100;
 if(!Number.isInteger(sortOrder)||sortOrder<1||sortOrder>999999)fail(400,'Invalid Display Order');
 const parentId=own(body,'parentId')?body.parentId||null:previous?.parent_id||null;
 return {scope,level,name,code,description,sortOrder,parentId};
}
async function assignmentView(client,id){
 const row=(await client.query(`SELECT a.id,a.unit_id,a.branch_id,a.status,a.version,a.created_at,a.updated_at,
 b.name branch_name,b.code branch_code,b.display_id branch_display_id,
 bl.name business_line,bl.code business_line_code,u.name unit_name,u.display_id unit_display_id
 FROM department_branch_assignments a JOIN department_units u ON u.id=a.unit_id
 JOIN branch_masters b ON b.id=a.branch_id JOIN business_lines bl ON bl.id=b.business_line_id WHERE a.id=$1`,[id])).rows[0];
 if(!row)fail(404,'Assignment not found');
 return {id:row.id,unitId:row.unit_id,unit:row.unit_name,unitDisplayId:row.unit_display_id,branchId:row.branch_id,branch:row.branch_name,
 branchCode:row.branch_code,branchDisplayId:row.branch_display_id,businessLine:row.business_line,businessLineCode:row.business_line_code,
 status:row.status,version:row.version,createdAt:iso(row.created_at),updatedAt:iso(row.updated_at)};
}
export async function departmentMaster({client,user,path,method,url,body={}}){
 const perms=departmentPermissions(user),need=p=>{if(!perms[p])fail(403,'Department Master permission required');};
 need('read');
 if(method!=='GET')await client.query('SELECT pg_advisory_xact_lock(830159)');
 try{
 if(['imports','exports','jobs'].includes(path[1]))return departmentTransfer({
  client,user,path,method,url,body,
  loadPage:query=>departmentMaster({client,user,path:['department-master'],method:'GET',
   url:new URL('https://crm.invalid/api/department-master?'+query.toString())})
 });
 if(path.length===1&&method==='GET'){
  const scope=url.searchParams.get('scope')||'Branch';if(!scopes.includes(scope))fail(400,'Invalid Department scope');
  const q=clean(url.searchParams.get('q')||'','Search',150,false),status=url.searchParams.get('status')||'all';
  if(!['all','Active','Inactive','Archived','Deleted'].includes(status))fail(400,'Invalid status filter');
  const level=url.searchParams.get('level')||'all';if(level!=='all'&&!levelValues.includes(level))fail(400,'Invalid hierarchy level');
  const branchId=url.searchParams.get('branchId')||'';
  if(branchId&&!uuid(branchId))fail(400,'Invalid Branch filter');
  const businessLineId=url.searchParams.get('businessLineId')||'';
  const parentId=url.searchParams.get('parentId')||'';
  if(businessLineId&&!uuid(businessLineId))fail(400,'Invalid Business Line filter');
  if(parentId&&!uuid(parentId))fail(400,'Invalid Parent Unit filter');
  const nameFilter=clean(url.searchParams.get('name')||'','Name filter',150,false);
  const codeFilter=clean(url.searchParams.get('code')||'','Code filter',30,false);
  const page=Number(url.searchParams.get('page')||1),pageSize=Number(url.searchParams.get('pageSize')||25);
  if(!Number.isInteger(page)||page<1||page>100000||![25,50,75,100].includes(pageSize))fail(400,'Invalid pagination');
  const params=[scope],conds=['u.scope=$1'];
  if(status==='all')conds.push('u.deleted_at IS NULL AND u.archived_at IS NULL');
  else if(status==='Archived')conds.push('u.archived_at IS NOT NULL AND u.deleted_at IS NULL');
  else if(status==='Deleted')conds.push('u.deleted_at IS NOT NULL');
  else {params.push(status);conds.push('u.status=$'+params.length+' AND u.archived_at IS NULL AND u.deleted_at IS NULL');}
  if(level!=='all'){params.push(level);conds.push('u.level=$'+params.length);}
  if(q){params.push('%'+q.replace(/[%_\\]/g,'\\$&')+'%');conds.push("(u.name ILIKE $"+params.length+" OR u.code ILIKE $"+params.length+" OR u.display_id ILIKE $"+params.length+")");}
  if(branchId){params.push(branchId);conds.push("EXISTS(SELECT 1 FROM department_branch_assignments a WHERE a.unit_id=u.id AND a.branch_id=$"+params.length+" AND a.status='Active')");}
  if(businessLineId){params.push(businessLineId);conds.push("EXISTS(SELECT 1 FROM department_branch_assignments a JOIN branch_masters b ON b.id=a.branch_id WHERE a.unit_id=u.id AND b.business_line_id=$"+params.length+" AND a.status='Active')");}
  if(parentId){params.push(parentId);conds.push('u.parent_id=$'+params.length);}
  if(nameFilter){params.push('%'+nameFilter.replace(/[%_\\]/g,'\\$&')+'%');conds.push('u.name ILIKE $'+params.length);}
  if(codeFilter){params.push('%'+codeFilter.replace(/[%_\\]/g,'\\$&')+'%');conds.push('u.code ILIKE $'+params.length);}
  const where=' WHERE '+conds.join(' AND ');
  const total=Number((await client.query('SELECT count(*)::int total FROM department_units u'+where,params)).rows[0].total);
  const pageCount=Math.max(1,Math.ceil(total/pageSize)),current=Math.min(page,pageCount);
  const rows=(await client.query(info+where+' ORDER BY u.updated_at DESC,u.id DESC LIMIT $'+(params.length+1)+' OFFSET $'+(params.length+2),[...params,pageSize,(current-1)*pageSize])).rows;
  const counts=(await client.query("SELECT count(*)::int total,count(*) FILTER(WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL)::int active,count(*) FILTER(WHERE status='Inactive' AND archived_at IS NULL AND deleted_at IS NULL)::int inactive,count(*) FILTER(WHERE archived_at IS NOT NULL AND deleted_at IS NULL)::int archived,count(*) FILTER(WHERE deleted_at IS NOT NULL)::int deleted FROM department_units u"+where,params)).rows[0];
  return {records:rows.map(view),total,page:current,pageSize,totalPages:pageCount,counts,permissions:perms,resource:departmentResource};
 }
 if(path.length===2&&path[1]==='references'&&method==='GET'){
  const [units,lines,branches]=await Promise.all([
    client.query("SELECT id,display_id AS \"displayId\",name,level,scope,parent_id AS \"parentId\",status FROM department_units WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL ORDER BY scope,level,lower(name)"),
    client.query("SELECT id,name,code,display_id AS \"displayId\" FROM business_lines WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL ORDER BY lower(name)"),
    client.query("SELECT id,name,code,display_id AS \"displayId\",business_line_id AS \"businessLineRef\" FROM branch_masters WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL ORDER BY lower(name)")]);
  return {units:units.rows,businessLines:lines.rows,branches:branches.rows,permissions:perms};
 }
 if(path.length===2&&path[1]==='assignments'&&method==='GET'){
  const unitId=url.searchParams.get('unitId'),branchId=url.searchParams.get('branchId');
  if(unitId&&!uuid(unitId)||branchId&&!uuid(branchId))fail(400,'Invalid assignment filter');
  const params=[],parts=[];if(unitId){params.push(unitId);parts.push('a.unit_id=$'+params.length);}
  if(branchId){params.push(branchId);parts.push('a.branch_id=$'+params.length);}
  const result=await client.query(`SELECT a.id FROM department_branch_assignments a ${parts.length?'WHERE '+parts.join(' AND '):''} ORDER BY a.updated_at DESC LIMIT 500`,params);
  return {assignments:await Promise.all(result.rows.map(async r=>assignmentView(client,r.id)))};
 }
 if(path.length===2&&path[1]==='assignments'&&method==='POST'){
  need('assign');allowed(body,['unitId','branchId']);if(!uuid(body.unitId)||!uuid(body.branchId))fail(400,'Choose Unit and Branch');
  const u=(await client.query('SELECT * FROM department_units WHERE id=$1',[body.unitId])).rows[0];
  const b=(await client.query('SELECT * FROM branch_masters WHERE id=$1',[body.branchId])).rows[0];
  if(!u||u.scope!=='Branch'||!active(u)||!b||!active(b))fail(409,'Choose an Active Branch Department unit and Branch');
  if(u.parent_id&&! (await client.query("SELECT 1 FROM department_branch_assignments WHERE unit_id=$1 AND branch_id=$2 AND status='Active'",[u.parent_id,b.id])).rowCount)fail(409,'Activate the parent Department for this Branch first');
  const exists=(await client.query('SELECT id,status FROM department_branch_assignments WHERE unit_id=$1 AND branch_id=$2 FOR UPDATE',[u.id,b.id])).rows[0];
  let id;
  if(exists){if(exists.status==='Active')fail(409,'Department is already assigned to the Branch');id=exists.id;await client.query("UPDATE department_branch_assignments SET status='Active',version=version+1,updated_at=now(),updated_by=$2 WHERE id=$1",[id,user.id]);}
  else{id=randomUUID();await client.query('INSERT INTO department_branch_assignments(id,unit_id,branch_id,created_by,updated_by) VALUES($1,$2,$3,$4,$4)',[id,u.id,b.id,user.id]);}
  const record=await assignmentView(client,id);await audit(client,user,'Branch Department assigned',id,exists||null,record,null,true);return {assignment:record};
 }
 if(path.length===3&&path[1]==='assignments'&&method==='PUT'){
  need('assign');allowed(body,['version','status','reason']);mustVersion(body.version);if(!uuid(path[2]))fail(400,'Invalid assignment');
  if(!['Active','Inactive'].includes(body.status))fail(400,'Invalid assignment status');
  const previous=(await client.query('SELECT * FROM department_branch_assignments WHERE id=$1 FOR UPDATE',[path[2]])).rows[0];
  if(!previous)fail(404,'Assignment not found');if(previous.version!==body.version)fail(409,'Assignment changed; reload');
  const why=mustReason(body.reason);
  if(body.status==='Inactive'&&previous.status==='Active'&&(await client.query(`SELECT 1 FROM department_branch_assignments a JOIN department_units u ON u.id=a.unit_id WHERE u.parent_id=$1 AND a.branch_id=$2 AND a.status='Active' LIMIT 1`,[previous.unit_id,previous.branch_id])).rowCount)fail(409,'Inactivate child unit assignments first');
  if(body.status==='Active'){
   const u=(await client.query('SELECT * FROM department_units WHERE id=$1',[previous.unit_id])).rows[0],
    b=(await client.query('SELECT * FROM branch_masters WHERE id=$1',[previous.branch_id])).rows[0];
   if(!active(u)||!active(b))fail(409,'Unit and Branch must both be Active');
   if(u.parent_id&&!(await client.query("SELECT 1 FROM department_branch_assignments WHERE unit_id=$1 AND branch_id=$2 AND status='Active'",[u.parent_id,b.id])).rowCount)fail(409,'Activate parent unit in this Branch first');
  }
  await client.query('UPDATE department_branch_assignments SET status=$2,version=version+1,updated_by=$3,updated_at=now() WHERE id=$1',[previous.id,body.status,user.id]);
  const after=await assignmentView(client,previous.id);await audit(client,user,'Branch assignment '+body.status,previous.id,previous,after,why,true);return {assignment:after};
 }
 if(path.length===1&&method==='POST'){
  need('create');allowed(body,['scope','level','name','code','description','sortOrder','parentId']);
  const v=validateValues(body);await validateParent(client,v.scope,v.level,v.parentId);
  const id=randomUUID();await client.query('INSERT INTO department_units(id,scope,level,parent_id,name,code,description,sort_order,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)',
   [id,v.scope,v.level,v.parentId,v.name,v.code,v.description,v.sortOrder,user.id]);
  const after=view(await fetchUnit(client,id));await audit(client,user,'Created',id,null,after);return {record:after};
 }
 if(path.length===2&&method==='GET')return {record:view(await fetchUnit(client,path[1]))};
 if(path.length===3&&path[2]==='related'&&method==='GET')return {related:await blockers(client,path[1])};
 if(path.length===3&&path[2]==='history'&&method==='GET'){
  need('history');await fetchUnit(client,path[1]);
  const data=await client.query('SELECT e.action,e.reason,e.changes,e.created_at,u.name actor FROM department_events e JOIN users u ON u.id=e.actor_id WHERE e.unit_id=$1 ORDER BY e.id DESC LIMIT 200',[path[1]]);
  return {history:data.rows.map(e=>({...e,createdAt:iso(e.created_at)}))};
 }
 if(path.length===2&&method==='PUT'){
  need('edit');allowed(body,['name','code','description','sortOrder','parentId','version','status','reason']);
  mustVersion(body.version);const old=await fetchUnit(client,path[1],true);
  if(old.version!==body.version)fail(409,'Record changed; reload before editing');
  if(old.archived_at||old.deleted_at)fail(409,'Restore this unit before editing');
  const v=validateValues(body,old);if(v.parentId!==old.parent_id)fail(409,'Changing the parent of an existing unit requires a dedicated audited reorganization workflow');
  await validateParent(client,v.scope,v.level,v.parentId,old.id);
  const status=body.status??old.status;if(!['Active','Inactive'].includes(status))fail(400,'Invalid status');
  const why=status!==old.status?mustReason(body.reason):null;
  if(status==='Inactive'&&old.status==='Active'&&(await blockers(client,old.id)).active)fail(409,'Active children or Branch assignments prevent inactivation; see Related / Used In');
  await client.query(`UPDATE department_units SET name=$2,code=$3,description=$4,sort_order=$5,status=$6,updated_by=$7,updated_at=now(),version=version+1 WHERE id=$1`,
   [old.id,v.name,v.code,v.description,v.sortOrder,status,user.id]);
  const after=view(await fetchUnit(client,old.id));await audit(client,user,'Updated',old.id,view(old),after,why);return {record:after};
 }
 if(path.length===3&&method==='POST'&&['archive','restore','soft-delete','restore-deleted'].includes(path[2])){
  need(path[2]==='archive'?'archive':path[2]==='restore'?'restore':path[2]==='soft-delete'?'softDelete':'restoreDeleted');
  allowed(body,['version','reason','targetStatus']);mustVersion(body.version);const old=await fetchUnit(client,path[1],true);if(old.version!==body.version)fail(409,'Unit changed; reload');
  const why=mustReason(body.reason),action=path[2],deps=await blockers(client,old.id);
  if(action==='archive'){if(old.status!=='Inactive'||old.archived_at||old.deleted_at||deps.active)fail(409,'Deactivate unit and all active dependencies before archiving');
   await client.query('UPDATE department_units SET archived_at=now(),updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1',[old.id,user.id]);}
  if(action==='restore'){if(old.deleted_at||!old.archived_at)fail(409,'Unit is not Archived');
   const dest=body.targetStatus||'Inactive';if(!['Active','Inactive'].includes(dest))fail(400,'Choose Active or Inactive');
   if(dest==='Active')await validateParent(client,old.scope,old.level,old.parent_id,old.id);
   await client.query('UPDATE department_units SET archived_at=NULL,status=$2,updated_by=$3,updated_at=now(),version=version+1 WHERE id=$1',[old.id,dest,user.id]);}
  if(action==='soft-delete'){if(!old.archived_at||old.deleted_at||deps.total)fail(409,'Only unlinked Archived units may be Deleted');
   await client.query('UPDATE department_units SET deleted_at=now(),updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1',[old.id,user.id]);}
  if(action==='restore-deleted'){if(!old.deleted_at)fail(409,'Unit is not Deleted');const dest=body.targetStatus||'Archived';
   if(!['Active','Inactive','Archived'].includes(dest))fail(400,'Invalid restore target');
   if(dest==='Active')await validateParent(client,old.scope,old.level,old.parent_id,old.id);
   await client.query('UPDATE department_units SET deleted_at=NULL,archived_at=CASE WHEN $2=$4 THEN COALESCE(archived_at,now()) ELSE NULL END,status=CASE WHEN $2=$4 THEN $5 ELSE $2 END,updated_by=$3,updated_at=now(),version=version+1 WHERE id=$1',
   [old.id,dest,user.id,'Archived','Inactive']);}
  const after=view(await fetchUnit(client,old.id));await audit(client,user,action,old.id,view(old),after,why);return {record:after};
 }
 fail(405,'Unsupported Department Master action');
 }catch(e){if(e.code==='23505')fail(409,'Duplicate Department code or name within this catalog and parent');if(e.code==='23514')fail(409,e.message);throw e;}
}
