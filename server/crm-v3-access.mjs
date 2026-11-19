import {randomUUID} from 'node:crypto';
import {resourceEligible} from './module-master.mjs';
import {canAccessCore} from './crm-v3-policy.mjs';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const safeId=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
export const operationalResources=Object.freeze({
 targets:'CRM_V3_TARGETS',leads:'CRM_V3_LEADS',crfs:'CRM_V3_CRFS',
 accounts:'CRM_V3_ACCOUNTS',contacts:'CRM_V3_CONTACTS',activities:'CRM_V3_ACTIVITIES',
 campaigns:'CRM_V3_CAMPAIGNS',dashboard:'CRM_V3_DASHBOARD',
 globalclients:'CRM_V3_GLOBAL_CLIENTS'
});
const tier=user=>user?.role==='admin'?'Admin':user?.role==='manager'?'Manager':user?.role==='member'?'Standard User':null;
const approved=user=>user?.status==='approved'&&user?.email_verified===true;
const financeName=name=>typeof name==='string'&&/\bfinance\b/i.test(name);
const cleanNote=(value,label='Reason')=>{
 if(typeof value!=='string'||value.trim().length>500||/[\x00-\x1f\x7f]/.test(value))fail(400,'Invalid '+label);
 return value.trim();
};
export async function assignmentsFor(client,user){
 if(!approved(user))return [];
 const rows=(await client.query(`SELECT a.id,a.branch_id,a.business_line_id,a.permission_role_id,
  r.name AS role_name,r.user_type,r.permissions,d.name AS department_name,
  d.status AS department_status,d.archived_at AS department_archived,d.deleted_at AS department_deleted,
  r.status AS role_status
  FROM crm_v3_user_role_assignments a
  JOIN crm_permission_roles r ON r.id=a.permission_role_id
  JOIN department_units d ON d.id=r.department_id
  WHERE a.user_id=$1 AND a.revoked_at IS NULL`,[user.id])).rows;
 return rows.filter(x=>x.role_status==='Active'&&x.department_status==='Active'
  &&!x.department_archived&&!x.department_deleted&&x.user_type===tier(user));
}
export async function accessFor(client,user,kind,action='View'){
 const resource=operationalResources[kind];if(!resource||!approved(user))fail(403,'CRM module is not authorized');
 // Finance approval always requires an explicit active Finance departmental role,
 // including for Super Admin; administrative access cannot silently grant Approve.
 const isAdmin=canAccessCore(user);
 if(action!=='Approve'&&isAdmin)return {all:true,branch:[],mine:[],has:true,finance:false};
 if(!(await resourceEligible(client,user,resource)))return {all:false,branch:[],mine:[],has:false,finance:false};
 const list=await assignmentsFor(client,user);const branch=new Set(),mine=new Set();
 for(const a of list){
  const policy=a.permissions?.[resource];
  if(!policy?.actions?.includes('View')||!policy.actions.includes(action))continue;
  if(action==='Approve'&&!financeName(a.department_name))continue;
  if(policy.scope==='Branch')branch.add(a.branch_id);
  else if(action!=='Approve'&&['My Records','Team'].includes(policy.scope))mine.add(a.branch_id);
 }
 return {all:false,branch:[...branch],mine:[...mine],has:branch.size>0||mine.size>0,finance:action==='Approve'&&branch.size>0};
}
export async function requireAction(client,user,kind,action,branchId=null,ownerId=null){
 const access=await accessFor(client,user,kind,action);
 if(!access.has)fail(403,'Assigned Role Matrix permission is required for this CRM action');
 if(access.all)return access;
 if(!safeId(branchId))fail(403,'Operational record requires an assigned Branch');
 if(access.branch.includes(branchId)||access.mine.includes(branchId)&&ownerId===user.id)return access;
 fail(403,'CRM record is outside your assigned Business Line and Branch scope');
}
const scopeColumns={
 targets:{table:'crm_v3_targets t',branch:'t.branch_id',owner:'t.owner_id'},
 leads:{table:'crm_v3_leads t',branch:'t.branch_id',owner:'t.owner_id'},
 accounts:{table:'crm_v3_accounts t',branch:'t.branch_id',owner:'t.owner_id'},
 contacts:{table:'crm_v3_contacts t',branch:'t.branch_id',owner:'t.owner_id'},
 campaigns:{table:'crm_v3_campaigns t',branch:'t.branch_id',owner:'t.owner_id'},
 crfs:{table:'crm_v3_crfs t JOIN crm_v3_leads l ON l.id=t.lead_id',branch:'l.branch_id',owner:'l.owner_id'},
 activities:{table:'crm_v3_activities t LEFT JOIN crm_v3_targets tg ON tg.id=t.target_id LEFT JOIN crm_v3_leads ld ON ld.id=t.lead_id LEFT JOIN crm_v3_accounts ac ON ac.id=t.account_id',branch:'COALESCE(tg.branch_id,ld.branch_id,ac.branch_id)',owner:'t.owner_id'}
};
export function scopedSql(kind,access,user,args=[],where=''){
 if(access.all)return {join:scopeColumns[kind]?.table||'',where,args};
 const config=scopeColumns[kind];if(!config)fail(403,'Global Client records are centrally administered');
 const offset=args.length;
 args.push(access.branch,access.mine,user.id);
 const condition='('+config.branch+'=ANY($'+(offset+1)+'::uuid[]) OR ('+config.branch+'=ANY($'+(offset+2)+'::uuid[]) AND '+config.owner+'=$'+(offset+3)+'))';
 return {join:config.table,where:where+' AND '+condition,args};
}
export async function recordScope(client,user,kind,id,action='View'){
 if(!safeId(id))fail(400,'Invalid CRM record ID');
 const access=await accessFor(client,user,kind,action);
 if(!access.has)fail(403,'Assigned Role Matrix permission is required for this CRM action');
 if(access.all)return access;
 const config=scopeColumns[kind];if(!config)fail(403,'Global Client records are centrally administered');
 const args=[id],scope=scopedSql(kind,access,user,args,' WHERE t.id=$1');
 const r=await client.query('SELECT t.id FROM '+scope.join+scope.where+' LIMIT 1',scope.args);
 if(!r.rowCount)fail(403,'CRM record is outside your permitted scope');
 return access;
}
export async function effectiveOperationalResourceKeys(client,user){
 if(!approved(user))return [];
 if(canAccessCore(user))return Object.values(operationalResources);
 const grants=await Promise.all(Object.keys(operationalResources).map(async k=>{
  const a=await accessFor(client,user,k,'View');return a.has?operationalResources[k]:null;
 }));
 return grants.filter(Boolean);
}
const ensureAdmin=user=>{if(!canAccessCore(user))fail(403,'Only approved Super Admins can assign operational CRM roles');};
const showAssignment=row=>({
 id:row.id,userId:row.user_id,userName:row.user_name,roleId:row.permission_role_id,
 roleName:row.role_name,department:row.department,branchId:row.branch_id,
 branchName:row.branch_name,businessLineId:row.business_line_id,
 assignedAt:row.assigned_at,revokedAt:row.revoked_at
});
const baseAssignmentQuery=`SELECT a.*,u.name AS user_name,r.name AS role_name,d.name AS department,
 b.name AS branch_name FROM crm_v3_user_role_assignments a
 JOIN users u ON u.id=a.user_id JOIN crm_permission_roles r ON r.id=a.permission_role_id
 JOIN department_units d ON d.id=r.department_id
 JOIN branch_masters b ON b.id=a.branch_id`;
export async function roleAssignmentsApi({client,user,path,method,body={}}){
 ensureAdmin(user);
 if(method==='GET'&&path.length===2){
  const [users,roles,branches,assignments]=await Promise.all([
   client.query("SELECT id,name,email,role FROM users WHERE status='approved' AND email_verified=true ORDER BY name,id LIMIT 500"),
   client.query("SELECT r.id,r.name,r.user_type,r.permissions,d.name department FROM crm_permission_roles r JOIN department_units d ON d.id=r.department_id WHERE r.status='Active' AND d.status='Active' AND d.archived_at IS NULL AND d.deleted_at IS NULL ORDER BY d.name,r.name"),
   client.query("SELECT b.id,b.name,b.business_line_id,bl.name business_line FROM branch_masters b JOIN business_lines bl ON bl.id=b.business_line_id WHERE b.status='Active' AND b.archived_at IS NULL AND b.deleted_at IS NULL ORDER BY bl.name,b.name"),
   client.query(baseAssignmentQuery+" WHERE a.revoked_at IS NULL ORDER BY a.assigned_at DESC LIMIT 500")
  ]);
  return {users:users.rows,roles:roles.rows,branches:branches.rows,assignments:assignments.rows.map(showAssignment)};
 }
 if(method==='POST'&&path.length===2){
  if(!body||Object.keys(body).some(k=>!['userId','roleId','branchId','note'].includes(k)))fail(400,'Invalid assignment fields');
  for(const k of ['userId','roleId','branchId'])if(!safeId(body[k]))fail(400,'Invalid '+k);
  const target=(await client.query('SELECT id,role,status,email_verified FROM users WHERE id=$1 FOR SHARE',[body.userId])).rows[0];
  if(!approved(target))fail(409,'Assign only active, verified employees');
  const role=(await client.query(`SELECT r.id,r.user_type,r.status,r.permissions,d.status department_status,
    d.name department_name,d.archived_at,d.deleted_at FROM crm_permission_roles r
    JOIN department_units d ON d.id=r.department_id WHERE r.id=$1 FOR SHARE OF r`,[body.roleId])).rows[0];
  if(!role||role.status!=='Active'||role.department_status!=='Active'||role.archived_at||role.deleted_at||role.user_type!==tier(target))
   fail(409,'Role user type and active Department must match the employee');
  const branch=(await client.query(`SELECT b.id,b.business_line_id,b.status,b.archived_at,b.deleted_at
    FROM branch_masters b WHERE b.id=$1 FOR SHARE`,[body.branchId])).rows[0];
  if(!branch||branch.status!=='Active'||branch.archived_at||branch.deleted_at)fail(409,'Branch must be Active');
  const actions=Object.values(role.permissions||{}).flatMap(p=>p?.actions||[]);
  if(actions.includes('Approve')&&!financeName(role.department_name))fail(403,'Finance approval rights must be assigned from an active Finance Department role');
  if(actions.includes('Approve')&&target.id===user.id)fail(403,'Finance approval cannot be self-assigned');
  for(const key of Object.keys(role.permissions||{})){
   if(!Object.values(operationalResources).includes(key))continue;
   if(!(await resourceEligible(client,target,key)))fail(403,'Module Directory blocks '+key+' for this user type');
  }
  const id=randomUUID(),note=cleanNote(body.note??'');
  await client.query('INSERT INTO crm_v3_user_role_assignments(id,user_id,permission_role_id,business_line_id,branch_id,assigned_by,note) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,target.id,role.id,branch.business_line_id,branch.id,user.id,note]);
  await client.query('INSERT INTO crm_v3_access_events(assignment_id,actor_id,action,reason) VALUES($1,$2,\'Granted\',$3)',[id,user.id,note]);
  await client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)',[user.id,'Granted Role Matrix access','crm-v3:Access',id]);
  return {assignmentId:id,message:'Operational CRM role assigned. Permissions take effect on the next request'};
 }
 if(method==='DELETE'&&path.length===3){
  if(!safeId(path[2]))fail(400,'Invalid role assignment ID');
  const id=path[2],note=cleanNote(body?.reason??'Revoked by Super Admin');
  const row=(await client.query('SELECT * FROM crm_v3_user_role_assignments WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!row||row.revoked_at)fail(404,'Active role assignment not found');
  await client.query('UPDATE crm_v3_user_role_assignments SET revoked_at=now(),revoked_by=$2 WHERE id=$1',[id,user.id]);
  await client.query('INSERT INTO crm_v3_access_events(assignment_id,actor_id,action,reason) VALUES($1,$2,\'Revoked\',$3)',[id,user.id,note]);
  await client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)',[user.id,'Revoked Role Matrix access','crm-v3:Access',id]);
  return {message:'Operational CRM role revoked'};
 }
 fail(405,'Operational CRM access method not available');
}
