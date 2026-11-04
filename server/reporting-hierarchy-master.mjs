import {randomUUID} from 'node:crypto';
import {reportingHierarchyPermissions} from './resources.mjs';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
const allowed=(data,fields)=>{if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!fields.includes(k)))fail(400,'Unknown or system-managed field');};
const clean=(v,name,max=150,required=true)=>{
 if(typeof v!=='string')fail(400,name+' must be text');
 const s=v.trim().replace(/\s+/g,' ');
 if((required&&!s)||s.length>max||/[\u0000-\u001f\u007f]/.test(s))fail(400,'Invalid '+name);
 return s;
};
const active=x=>x?.status==='Active'&&!x.archived_at&&!x.deleted_at;
const columns='SELECT h.*,p.name parent_role_name,p.code parent_role_code,c.name child_role_name,c.code child_role_code,creator.name created_name,modifier.name updated_name,'+
 "CASE h.scope_level WHEN 'Business Line' THEN (SELECT name FROM business_lines WHERE id=h.scope_id)"+
 " WHEN 'Region' THEN (SELECT name FROM regions WHERE id=h.scope_id) WHEN 'Branch' THEN (SELECT name FROM branch_masters WHERE id=h.scope_id)"+
 " WHEN 'Department' THEN (SELECT name FROM department_units WHERE id=h.scope_id) ELSE 'Global' END scope_name "+
 'FROM reporting_hierarchy_rules h JOIN organizational_roles p ON p.id=h.parent_role_id JOIN organizational_roles c ON c.id=h.child_role_id '+
 'JOIN users creator ON creator.id=h.created_by JOIN users modifier ON modifier.id=h.updated_by';
const view=x=>({id:x.id,displayId:x.display_id,hierarchyType:x.hierarchy_type,applicability:x.applicability,
 scopeLevel:x.scope_level,scopeId:x.scope_id,scopeName:x.scope_name||'Global',parentRoleId:x.parent_role_id,childRoleId:x.child_role_id,
 parentRole:x.parent_role_name,childRole:x.child_role_name,parentCode:x.parent_role_code,childCode:x.child_role_code,
 description:x.description,sortOrder:x.sort_order,status:x.deleted_at?'Deleted':x.archived_at?'Archived':x.status,
 version:x.version,createdAt:x.created_at,updatedAt:x.updated_at,createdBy:x.created_name,updatedBy:x.updated_name});
async function fetchOne(client,id,lock=false){
 if(!uuid(id))fail(400,'Invalid reporting hierarchy identifier');
 if(lock){const l=await client.query('SELECT id FROM reporting_hierarchy_rules WHERE id=$1 FOR UPDATE',[id]);if(!l.rowCount)fail(404,'Hierarchy rule not found');}
 const x=(await client.query(columns+' WHERE h.id=$1',[id])).rows[0];
 if(!x)fail(404,'Hierarchy rule not found');return x;
}
function input(body){
 const {hierarchyType,applicability,scopeLevel,parentRoleId,childRoleId}=body;
 if(!['Administrative','Functional'].includes(hierarchyType))fail(400,'Select Administrative or Functional');
 if(!['Central','Branch'].includes(applicability))fail(400,'Select Central or Branch');
 if(!['Global','Business Line','Region','Branch','Department'].includes(scopeLevel))fail(400,'Invalid Scope Level');
 const scopeId=scopeLevel==='Global'?null:body.scopeId;
 if(scopeLevel==='Global'&&body.scopeId!=null&&body.scopeId!=='')fail(400,'Global scope has no Scope Record');
 if(scopeLevel!=='Global'&&!uuid(scopeId))fail(400,'Select a valid Scope Record');
 if(['Region','Branch'].includes(scopeLevel)&&applicability!=='Branch')fail(400,'Region and Branch scopes require Branch context');
 if(!uuid(parentRoleId)||!uuid(childRoleId)||parentRoleId===childRoleId)fail(400,'Choose different Parent and Child Organizational Roles');
 const description=clean(body.description??'','Description',1000,false),sortOrder=body.sortOrder??100;
 if(!Number.isInteger(sortOrder)||sortOrder<1||sortOrder>999999)fail(400,'Invalid Display Order');
 return {hierarchyType,applicability,scopeLevel,scopeId,parentRoleId,childRoleId,description,sortOrder};
}
async function validateReferences(client,data){
 const roles=(await client.query('SELECT id,status,applicability,archived_at,deleted_at FROM organizational_roles WHERE id=ANY($1::uuid[])',[data.parentRoleId,data.childRoleId])).rows;
 if(roles.length!==2||roles.some(r=>!active(r)||(r.applicability!=='Both'&&r.applicability!==data.applicability)))
  fail(409,'Parent and Child roles must be Active and compatible with this context');
 if(data.scopeLevel!=='Global'){
  const table={'Business Line':'business_lines',Region:'regions',Branch:'branch_masters',Department:'department_units'}[data.scopeLevel];
  const record=(await client.query('SELECT * FROM '+table+' WHERE id=$1',[data.scopeId])).rows[0];
  if(!record||record.status!=='Active'||record.archived_at||record.deleted_at)fail(409,'Scope Record must exist and be Active');
  if(data.scopeLevel==='Department'&&record.scope!==data.applicability)fail(409,'Department scope and hierarchy context must match');
 }
}
async function validateGraph(client,data,exclude=null){
 const params=[data.hierarchyType,data.applicability,data.scopeLevel,data.scopeId,exclude];
 const links=(await client.query("SELECT id,parent_role_id,child_role_id,status,archived_at,deleted_at FROM reporting_hierarchy_rules WHERE hierarchy_type=$1 AND applicability=$2 AND scope_level=$3 AND scope_id IS NOT DISTINCT FROM $4::uuid AND ($5::uuid IS NULL OR id<>$5)",params)).rows;
 if(links.some(r=>r.parent_role_id===data.parentRoleId&&r.child_role_id===data.childRoleId))fail(409,'This exact hierarchy rule already exists; restore its previous record');
 const live=links.filter(active);
 if(data.hierarchyType==='Administrative'&&live.some(r=>r.child_role_id===data.childRoleId))fail(409,'Administrative hierarchy permits only one parent for this role and scope');
 const stack=[data.childRoleId],visited=new Set();
 while(stack.length){
  const next=stack.pop();if(next===data.parentRoleId)fail(409,'Circular reporting hierarchy is not allowed');
  if(visited.has(next))continue;visited.add(next);
  for(const row of live)if(row.parent_role_id===next&&!visited.has(row.child_role_id))stack.push(row.child_role_id);
 }
}
async function audit(client,user,action,old,next,reason=null){
 const changes={};for(const [key,value] of Object.entries(next))if(JSON.stringify(old?.[key]??null)!==JSON.stringify(value))changes[key]={before:old?.[key]??null,after:value};
 await client.query('INSERT INTO reporting_hierarchy_events(rule_id,actor_id,action,changes,reason) VALUES($1,$2,$3,$4,$5)',[next.id,user.id,action,JSON.stringify(changes),reason]);
 await client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)',[user.id,action,'reporting-hierarchy-master',next.id]);
}
export async function reportingHierarchyMaster({client,user,path,method,url,body={}}){
 const perms=reportingHierarchyPermissions(user),need=k=>{if(!perms[k])fail(403,'Reporting Hierarchy Master permission required');};
 need('read');if(method!=='GET')await client.query('SELECT pg_advisory_xact_lock(830161)');
 try{
 if(path.length===2&&path[1]==='references'&&method==='GET'){
  const defs=[
   ["SELECT id,name,code,display_id AS \"displayId\",applicability FROM organizational_roles WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL ORDER BY name LIMIT 1000",'roles'],
   ["SELECT id,name,display_id AS \"displayId\" FROM business_lines WHERE status='Active' AND archived_at IS NULL ORDER BY name LIMIT 1000",'businessLines'],
   ["SELECT id,name,display_id AS \"displayId\",business_line_id AS \"businessLineId\" FROM regions WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL ORDER BY name LIMIT 1000",'regions'],
   ["SELECT id,name,display_id AS \"displayId\",business_line_id AS \"businessLineId\" FROM branch_masters WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL ORDER BY name LIMIT 1000",'branches'],
   ["SELECT id,name,display_id AS \"displayId\",scope FROM department_units WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL ORDER BY name LIMIT 1000",'departments']
  ];
  const list=await Promise.all(defs.map(x=>client.query(x[0])));
  return Object.fromEntries(defs.map((x,i)=>[x[1],list[i].rows]));
 }
 if(path.length===1&&method==='GET'){
  const type=url.searchParams.get('type')||'all',status=url.searchParams.get('status')||'all',
   scope=url.searchParams.get('scope')||'all',applicability=url.searchParams.get('applicability')||'all',
   q=clean(url.searchParams.get('q')||'','Search',150,false);
  if(!['all','Administrative','Functional'].includes(type)||!['all','Active','Inactive','Archived','Deleted'].includes(status)||
   !['all','Global','Business Line','Region','Branch','Department'].includes(scope)||!['all','Central','Branch'].includes(applicability))fail(400,'Invalid filter');
  const page=Number(url.searchParams.get('page')||1),pageSize=Number(url.searchParams.get('pageSize')||25);
  if(!Number.isInteger(page)||page<1||page>100000||![25,50,75,100].includes(pageSize))fail(400,'Invalid pagination');
  const params=[],clauses=[];
  if(status==='all')clauses.push('h.deleted_at IS NULL AND h.archived_at IS NULL');
  else if(status==='Archived')clauses.push('h.archived_at IS NOT NULL AND h.deleted_at IS NULL');
  else if(status==='Deleted')clauses.push('h.deleted_at IS NOT NULL');
  else{params.push(status);clauses.push('h.status=$'+params.length+' AND h.archived_at IS NULL AND h.deleted_at IS NULL');}
  if(type!=='all'){params.push(type);clauses.push('h.hierarchy_type=$'+params.length);}
  if(scope!=='all'){params.push(scope);clauses.push('h.scope_level=$'+params.length);}
  if(applicability!=='all'){params.push(applicability);clauses.push('h.applicability=$'+params.length);}
  if(q){params.push('%'+q.replace(/[%_\\]/g,'\\$&')+'%');clauses.push('(p.name ILIKE $'+params.length+' OR c.name ILIKE $'+params.length+' OR h.display_id ILIKE $'+params.length+')');}
  const where=' WHERE '+clauses.join(' AND '),base=columns.slice(columns.indexOf(' FROM reporting_hierarchy_rules h'));
  const total=Number((await client.query('SELECT count(*)::int total'+base+where,params)).rows[0].total);
  const pages=Math.max(1,Math.ceil(total/pageSize)),current=Math.min(page,pages);
  const records=(await client.query(columns+where+' ORDER BY h.updated_at DESC,h.id DESC LIMIT $'+(params.length+1)+' OFFSET $'+(params.length+2),[...params,pageSize,(current-1)*pageSize])).rows.map(view);
  const counts=(await client.query("SELECT count(*)::int total,count(*) FILTER(WHERE h.status='Active' AND h.archived_at IS NULL AND h.deleted_at IS NULL)::int active,count(*) FILTER(WHERE h.status='Inactive' AND h.archived_at IS NULL AND h.deleted_at IS NULL)::int inactive,count(*) FILTER(WHERE h.archived_at IS NOT NULL AND h.deleted_at IS NULL)::int archived,count(*) FILTER(WHERE h.deleted_at IS NOT NULL)::int deleted,count(*) FILTER(WHERE h.hierarchy_type='Administrative')::int administrative,count(*) FILTER(WHERE h.hierarchy_type='Functional')::int functional"+base+where,params)).rows[0];
  return {records,total,page:current,pageSize,totalPages:pages,counts,permissions:perms};
 }
 if(path.length===1&&method==='POST'){
  need('create');allowed(body,['hierarchyType','applicability','scopeLevel','scopeId','parentRoleId','childRoleId','description','sortOrder']);
  const data=input(body);await validateReferences(client,data);await validateGraph(client,data);
  const id=randomUUID();
  await client.query('INSERT INTO reporting_hierarchy_rules(id,hierarchy_type,applicability,scope_level,scope_id,parent_role_id,child_role_id,description,sort_order,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)',
   [id,data.hierarchyType,data.applicability,data.scopeLevel,data.scopeId,data.parentRoleId,data.childRoleId,data.description,data.sortOrder,user.id]);
  const next=view(await fetchOne(client,id));await audit(client,user,'Created',null,next);return {record:next};
 }
 if(path.length===2&&method==='GET')return {record:view(await fetchOne(client,path[1]))};
 if(path.length===3&&path[2]==='history'&&method==='GET'){
  need('history');await fetchOne(client,path[1]);
  const rows=(await client.query('SELECT e.action,e.reason,e.changes,e.created_at AS "createdAt",u.name actor FROM reporting_hierarchy_events e JOIN users u ON u.id=e.actor_id WHERE e.rule_id=$1 ORDER BY e.id DESC LIMIT 200',[path[1]])).rows;
  return {history:rows};
 }
 if(path.length===3&&path[2]==='related'&&method==='GET'){
  await fetchOne(client,path[1]);return {related:{employeeAssignments:0,mappingAvailable:false}};
 }
 if(path.length===2&&method==='PUT'){
  need('edit');allowed(body,['description','sortOrder','version','status','reason']);
  if(!Number.isInteger(body.version)||body.version<1)fail(400,'Record version required');
  const old=await fetchOne(client,path[1],true);
  if(old.version!==body.version)fail(409,'Rule changed; reload');
  if(old.archived_at||old.deleted_at)fail(409,'Restore before editing');
  const status=body.status??old.status,description=clean(body.description??old.description,'Description',1000,false),sortOrder=body.sortOrder??old.sort_order;
  if(!['Active','Inactive'].includes(status))fail(400,'Invalid status');
  if(!Number.isInteger(sortOrder)||sortOrder<1||sortOrder>999999)fail(400,'Invalid Display Order');
  const reason=status!==old.status?clean(body.reason,'Reason',500):null;
  if(status==='Active'&&old.status!=='Active'){
   const data={hierarchyType:old.hierarchy_type,applicability:old.applicability,scopeLevel:old.scope_level,scopeId:old.scope_id,parentRoleId:old.parent_role_id,childRoleId:old.child_role_id};
   await validateReferences(client,data);
   const links=(await client.query("SELECT parent_role_id,child_role_id FROM reporting_hierarchy_rules WHERE id<>$1 AND hierarchy_type=$2 AND applicability=$3 AND scope_level=$4 AND scope_id IS NOT DISTINCT FROM $5::uuid AND status='Active' AND archived_at IS NULL AND deleted_at IS NULL",[old.id,data.hierarchyType,data.applicability,data.scopeLevel,data.scopeId])).rows;
   if(data.hierarchyType==='Administrative'&&links.some(r=>r.child_role_id===data.childRoleId))fail(409,'Child already has an Administrative parent');
   const stack=[data.childRoleId],seen=new Set();
   while(stack.length){const r=stack.pop();if(r===data.parentRoleId)fail(409,'Circular reporting hierarchy');if(seen.has(r))continue;seen.add(r);for(const e of links)if(e.parent_role_id===r)stack.push(e.child_role_id);}
  }
  await client.query('UPDATE reporting_hierarchy_rules SET description=$2,sort_order=$3,status=$4,updated_by=$5 WHERE id=$1',[old.id,description,sortOrder,status,user.id]);
  const next=view(await fetchOne(client,old.id));await audit(client,user,'Updated',view(old),next,reason);return {record:next};
 }
 if(path.length===3&&method==='POST'&&['archive','restore','soft-delete','restore-deleted'].includes(path[2])){
  const action=path[2],key={archive:'archive',restore:'restore','soft-delete':'softDelete','restore-deleted':'restoreDeleted'}[action];
  need(key);allowed(body,['version','reason','targetStatus']);
  if(!Number.isInteger(body.version)||body.version<1)fail(400,'Record version required');
  const old=await fetchOne(client,path[1],true);if(old.version!==body.version)fail(409,'Rule changed; reload');
  const why=clean(body.reason,'Reason',500);
  if(action==='archive'){
   if(old.status!=='Inactive'||old.archived_at||old.deleted_at)fail(409,'Inactivate rule before archiving');
   await client.query('UPDATE reporting_hierarchy_rules SET archived_at=now(),updated_by=$2 WHERE id=$1',[old.id,user.id]);
  }else if(action==='restore'){
   if(!old.archived_at||old.deleted_at)fail(409,'Rule not Archived');
   const target=body.targetStatus||'Inactive';if(!['Active','Inactive'].includes(target))fail(400,'Invalid restore status');
   await client.query('UPDATE reporting_hierarchy_rules SET archived_at=NULL,status=$2,updated_by=$3 WHERE id=$1',[old.id,target,user.id]);
  }else if(action==='soft-delete'){
   if(!old.archived_at||old.deleted_at)fail(409,'Only Archived rules can be deleted');
   await client.query('UPDATE reporting_hierarchy_rules SET deleted_at=now(),updated_by=$2 WHERE id=$1',[old.id,user.id]);
  }else{
   if(!old.deleted_at)fail(409,'Rule not Deleted');
   const target=body.targetStatus||'Archived';if(!['Active','Inactive','Archived'].includes(target))fail(400,'Invalid restore target');
   await client.query("UPDATE reporting_hierarchy_rules SET deleted_at=NULL,archived_at=CASE WHEN $2='Archived' THEN COALESCE(archived_at,now()) ELSE NULL END,status=CASE WHEN $2='Archived' THEN 'Inactive' ELSE $2 END,updated_by=$3 WHERE id=$1",[old.id,target,user.id]);
  }
  const next=view(await fetchOne(client,old.id));await audit(client,user,action,view(old),next,why);return {record:next};
 }
 fail(405,'Unsupported Reporting Hierarchy action');
 }catch(error){
  if(error.code==='23505')fail(409,'Hierarchy rule or Administrative parent already exists in this scope');
  if(error.code==='23514')fail(409,error.message);
  throw error;
 }
}
