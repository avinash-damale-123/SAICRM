import {randomUUID} from 'node:crypto';
import {requireCoreAccess,segment,cleanText,qualificationEvidence,validTargetStage,validLeadStage,validActivityKind,validActivityLink,canSubmitCrf,canDecideFinance,validateFinanceDecision,restrictCrfProfile} from './crm-v3-policy.mjs';

const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const tables=Object.freeze({targets:'crm_v3_targets',leads:'crm_v3_leads',crfs:'crm_v3_crfs',accounts:'crm_v3_accounts',contacts:'crm_v3_contacts',activities:'crm_v3_activities',campaigns:'crm_v3_campaigns',globalclients:'crm_v3_global_clients'});
const entityKind=Object.freeze({targets:'Target',leads:'Lead',crfs:'CRF',accounts:'Account',contacts:'Contact',activities:'Activity',campaigns:'Campaign',globalclients:'Global Client'});
const only=(obj,keys)=>{if(!obj||typeof obj!=='object'||Array.isArray(obj)||Object.keys(obj).some(k=>!keys.includes(k)))fail(400,'Unsupported or protected field');};
const requiredUUID=(value,label)=>{if(!uuid(value))fail(400,'Invalid '+label);return value;};
const versionOf=(v)=>{if(!Number.isInteger(v)||v<1)fail(400,'Current record version is required');return v;};
const moneyOf=v=>{const x=Number(v??0);if(!Number.isFinite(x)||x<0||x>1e12)fail(400,'Invalid estimated annual potential');return Math.round(x*100)/100;};
const limitOf=url=>{const n=Number(url.searchParams.get('limit')||25);if(!Number.isInteger(n)||n<1||n>100)fail(400,'Page size must be 1-100');return n;};
const pageOf=url=>{const n=Number(url.searchParams.get('page')||1);if(!Number.isInteger(n)||n<1||n>100000)fail(400,'Invalid page');return n;};
const txt=(value,label,max=200,required=false)=>cleanText(value??'',label,max,required);
async function record(client,table,id,lock=false){
 requiredUUID(id,'record ID');
 const r=await client.query('SELECT * FROM '+table+' WHERE id=$1'+(lock?' FOR UPDATE':''),[id]);
 if(!r.rowCount)fail(404,'CRM record not found');
 return r.rows[0];
}
async function branch(client,businessLineId,branchId){
 requiredUUID(businessLineId,'Business Line ID');requiredUUID(branchId,'Branch ID');
 const q=await client.query(
  "SELECT b.id,b.business_line_id,b.country_id,b.region_id,b.name AS branch_name,bl.name AS business_line_name "+
  "FROM branch_masters b JOIN business_lines bl ON bl.id=b.business_line_id "+
  "JOIN countries c ON c.id=b.country_id JOIN regions rg ON rg.id=b.region_id "+
  "JOIN country_business_lines cb ON cb.country_id=b.country_id AND cb.business_line_id=bl.id AND cb.removed_at IS NULL "+
  "WHERE b.id=$1 AND b.business_line_id=$2 AND b.status='Active' AND b.archived_at IS NULL AND b.deleted_at IS NULL "+
  "AND bl.status='Active' AND bl.archived_at IS NULL AND bl.deleted_at IS NULL "+
  "AND c.status='Active' AND c.archived_at IS NULL AND c.deleted_at IS NULL "+
  "AND rg.status='Active' AND rg.archived_at IS NULL AND rg.deleted_at IS NULL",[branchId,businessLineId]);
 if(!q.rowCount)fail(409,'Choose an Active Branch with an eligible Business Line, Region and Country presence');
 return q.rows[0];
}
async function event(client,user,kind,id,action,changes={},reason=''){
 const safe=JSON.stringify(changes);
 if(safe.length>6000)fail(400,'Audit change summary is too large');
 await client.query('INSERT INTO crm_v3_events(entity_kind,entity_id,action,actor_id,changes,reason) VALUES($1,$2,$3,$4,$5::jsonb,$6)',[kind,id,action,user.id,safe,reason]);
 await client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)',[user.id,action,'crm-v3:'+kind,id]);
}
async function list(client,kind,url){
 const table=tables[kind],limit=limitOf(url),page=pageOf(url),offset=(page-1)*limit;
 const q=txt(url.searchParams.get('q'),'Search',160,false);
 let from=table+' t',where=' WHERE 1=1',args=[];
 if(kind==='crfs'){from+=' JOIN crm_v3_leads l ON l.id=t.lead_id';}
 if(q){
  args.push('%'+q.replace(/[%_\\]/g,'\\$&')+'%');
  const col=kind==='crfs'?'l.name':kind==='contacts'?'t.full_name':kind==='activities'?'t.subject':'t.name';
  where+=' AND '+col+' ILIKE $'+args.length+" ESCAPE '\\'";
 }
 const branchId=url.searchParams.get('branchId');
 if(branchId&&['globalclients'].includes(kind))fail(400,'This module is global and cannot be filtered by Branch');
 if(branchId){
  requiredUUID(branchId,'Branch ID');args.push(branchId);
  where+=' AND '+(kind==='crfs'?'l.branch_id':'t.branch_id')+'=$'+args.length;
 }
 const status=url.searchParams.get('status');
 if(status){args.push(status);where+=' AND t.'+(kind==='targets'||kind==='leads'?'stage':'status')+'=$'+args.length;}
 const count=(await client.query('SELECT count(*)::int AS count FROM '+from+where,args)).rows[0]?.count||0;
 args.push(limit,offset);
 const rows=await client.query('SELECT t.*'+(kind==='crfs'?',l.name AS lead_name,l.segment,l.branch_id,l.business_line_id':'')+
  ' FROM '+from+where+' ORDER BY t.updated_at DESC,t.id DESC LIMIT $'+(args.length-1)+' OFFSET $'+args.length,args);
 return {records:rows.rows,total:count,page,pageSize:limit,totalPages:Math.max(1,Math.ceil(count/limit))};
}
async function linkedBusiness(client,body){
 const which=['targetId','leadId','accountId'].filter(x=>body[x]);
 if(which.length!==1)fail(400,'Link exactly one Target, Lead or Account');
 const kind={targetId:'targets',leadId:'leads',accountId:'accounts'}[which[0]],id=requiredUUID(body[which[0]],which[0]);
 return {kind,id,record:await record(client,tables[kind],id)};
}
function assertSameScope(first,second){
 if(first.business_line_id!==second.business_line_id||first.branch_id!==second.branch_id)fail(403,'Cross-Branch or cross-Business Line linking requires a separate authorized mapping');
}
function userIsFinanceReviewer(user,request){
 // Pilot safety ceiling: only a distinct approved Super Admin may approve.
 // Later replace with effective-dated Role Matrix assignment and Finance queue scope.
 return user?.system_role==='super_admin'&&user.id!==request.created_by&&user.id!==request.submitted_by;
}
async function createTarget(client,user,body){
 only(body,['name','segment','businessLineId','branchId','source','assignedUserId','globalClientId']);
 const scope=await branch(client,body.businessLineId,body.branchId),id=randomUUID();
 const name=txt(body.name,'Target Name',200,true),kind=segment(body.segment),source=txt(body.source,'Source',150);
 const assigned=body.assignedUserId?requiredUUID(body.assignedUserId,'Assigned User'):null;
 let gc=null;if(body.globalClientId){gc=await record(client,tables.globalclients,body.globalClientId);if(gc.status!=='Active')fail(409,'Global Client is not Active');}
 const r=await client.query('INSERT INTO crm_v3_targets(id,segment,name,business_line_id,branch_id,global_client_id,source,owner_id,assigned_user_id,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$8,$8) RETURNING *',
  [id,kind,name,scope.business_line_id,scope.id,gc?.id||null,source,user.id,assigned]);
 await event(client,user,'Target',id,'Created',{stage:'New',segment:kind});
 return {record:r.rows[0]};
}
async function createContact(client,user,body){
 only(body,['fullName','email','phone','designation','language','businessLineId','branchId']);
 const scope=await branch(client,body.businessLineId,body.branchId),id=randomUUID();
 const email=txt(body.email,'Email',254).toLowerCase();
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))fail(400,'Invalid email address');
 const r=await client.query('INSERT INTO crm_v3_contacts(id,full_name,email,phone,designation,preferred_language,business_line_id,branch_id,owner_id,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$9) RETURNING *',
 [id,txt(body.fullName,'Contact Name',200,true),email,txt(body.phone,'Phone',40),txt(body.designation,'Designation',160),txt(body.language,'Preferred Language',80),scope.business_line_id,scope.id,user.id]);
 await event(client,user,'Contact',id,'Created',{verification:'Unverified'});return{record:r.rows[0]};
}
async function createActivity(client,user,body){
 only(body,['kind','subject','details','targetId','leadId','accountId','contactId','dueAt','assignedUserId']);
 validActivityLink(body);const linked=await linkedBusiness(client,body),id=randomUUID(),kind=validActivityKind(body.kind);
 let contact=null;if(body.contactId){contact=await record(client,tables.contacts,requiredUUID(body.contactId,'Contact ID'));assertSameScope(linked.record,contact);}
 const dueAt=body.dueAt?new Date(body.dueAt):null;if(dueAt&&Number.isNaN(dueAt.valueOf()))fail(400,'Invalid due date');
 const r=await client.query('INSERT INTO crm_v3_activities(id,kind,subject,details,target_id,lead_id,account_id,contact_id,due_at,assigned_user_id,owner_id,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,$11) RETURNING *',
 [id,kind,txt(body.subject,'Subject',250,true),txt(body.details,'Details',5000),linked.kind==='targets'?linked.id:null,linked.kind==='leads'?linked.id:null,linked.kind==='accounts'?linked.id:null,contact?.id||null,dueAt?.toISOString()||null,body.assignedUserId?requiredUUID(body.assignedUserId,'Assigned User'):null,user.id]);
 await event(client,user,'Activity',id,'Created',{kind,linkedType:linked.kind,linkedId:linked.id});return{record:r.rows[0]};
}
async function createCampaign(client,user,body){
 only(body,['name','businessLineId','branchId','purpose']);
 const scope=await branch(client,body.businessLineId,body.branchId),id=randomUUID();
 const r=await client.query('INSERT INTO crm_v3_campaigns(id,name,business_line_id,branch_id,purpose,owner_id,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$6,$6) RETURNING *',
 [id,txt(body.name,'Campaign Name',200,true),scope.business_line_id,scope.id,body.purpose==='Operational'?'Operational':'Marketing',user.id]);
 await event(client,user,'Campaign',id,'Created',{status:'Draft',sendingEnabled:false});return{record:r.rows[0],sendingEnabled:false};
}
async function createGlobalClient(client,user,body){
 if(user.system_role!=='super_admin')fail(403,'Only Super Admin may create a Global Client');
 only(body,['name','countryId','parentId']);
 let parent=null;if(body.parentId){parent=await record(client,tables.globalclients,body.parentId);if(parent.status!=='Active')fail(409,'Parent is not Active');}
 if(body.countryId)requiredUUID(body.countryId,'Country ID');
 const id=randomUUID(),r=await client.query('INSERT INTO crm_v3_global_clients(id,name,country_id,parent_id,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *',[id,txt(body.name,'Global Client Name',200,true),body.countryId||null,parent?.id||null,user.id]);
 await event(client,user,'Global Client',id,'Created',{status:'Active'});return{record:r.rows[0]};
}
async function qualifyTarget(client,user,targetId,body){
 only(body,['version','qualificationEvidence','potentialUsd']);
 const tgt=await record(client,tables.targets,targetId,true);versionOf(body.version);
 if(tgt.version!==body.version)fail(409,'Target changed; refresh before converting');
 if(tgt.archived_at||tgt.converted_at||tgt.stage==='Closed/Not Interested')fail(409,'Target is closed, archived or already converted');
 await branch(client,tgt.business_line_id,tgt.branch_id);
 const evidence=qualificationEvidence(body.qualificationEvidence),id=randomUUID();
 const r=await client.query('INSERT INTO crm_v3_leads(id,target_id,segment,name,business_line_id,branch_id,global_client_id,qualification_evidence,annual_potential_usd,lead_source,owner_id,assigned_user_id,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING *',
 [id,tgt.id,tgt.segment,tgt.name,tgt.business_line_id,tgt.branch_id,tgt.global_client_id,evidence,moneyOf(body.potentialUsd),tgt.source,tgt.owner_id,tgt.assigned_user_id,user.id]);
 await client.query('UPDATE crm_v3_targets SET converted_at=now(),updated_at=now(),updated_by=$2,version=version+1 WHERE id=$1',[tgt.id,user.id]);
 await event(client,user,'Target',tgt.id,'Converted to Lead',{leadId:id,previousVersion:tgt.version});
 await event(client,user,'Lead',id,'Created from qualified Target',{targetId:tgt.id,stage:'Qualified'});
 return{record:r.rows[0],targetId:tgt.id};
}
async function updateTarget(client,user,id,body){
 only(body,['version','name','stage','source','reason']);
 const current=await record(client,tables.targets,id,true);versionOf(body.version);
 if(body.version!==current.version)fail(409,'Record changed; refresh before saving');
 if(current.converted_at||current.archived_at)fail(409,'Converted or archived Targets cannot be edited');
 const name=body.name!==undefined?txt(body.name,'Target Name',200,true):current.name;
 const stage=body.stage!==undefined?validTargetStage(body.stage):current.stage;
 const source=body.source!==undefined?txt(body.source,'Source',150):current.source;
 const reason=txt(body.reason,'Reason',1000);
 if(stage==='Closed/Not Interested'&&!reason)fail(400,'Closure reason is required');
 const r=await client.query('UPDATE crm_v3_targets SET name=$2,stage=$3,source=$4,version=version+1,updated_at=now(),updated_by=$5 WHERE id=$1 RETURNING *',[id,name,stage,source,user.id]);
 await event(client,user,'Target',id,'Updated',{previousStage:current.stage,stage,previousVersion:current.version},reason);
 return{record:r.rows[0]};
}
async function updateLead(client,user,id,body){
 only(body,['version','stage','potentialUsd','closeReason']);
 const current=await record(client,tables.leads,id,true);versionOf(body.version);
 if(body.version!==current.version)fail(409,'Record changed; refresh before saving');
 if(current.archived_at)fail(409,'Archived Leads cannot be edited');
 const stage=body.stage!==undefined?validLeadStage(body.stage):current.stage;
 const reason=body.closeReason!==undefined?txt(body.closeReason,'Close Reason',1000):current.close_reason;
 if(stage==='Closed & Dead'&&!reason)fail(400,'Close & Dead requires a reason');
 if(current.commercial_won_at&&stage!=='Commercially Won'&&stage!=='Closed & Dead')fail(409,'A commercially won Lead cannot return to prospecting without a separate reviewed reversal');
 const won=stage==='Commercially Won'?(current.commercial_won_at||new Date()):current.commercial_won_at;
 const r=await client.query('UPDATE crm_v3_leads SET stage=$2,annual_potential_usd=$3,close_reason=$4,commercial_won_at=$5,updated_by=$6,updated_at=now(),version=version+1 WHERE id=$1 RETURNING *',
  [id,stage,body.potentialUsd!==undefined?moneyOf(body.potentialUsd):current.annual_potential_usd,reason,won,user.id]);
 await event(client,user,'Lead',id,stage===current.stage?'Updated':'Stage changed',{from:current.stage,to:stage,commercialWonAt:won,previousVersion:current.version},reason);
 let crf=null;
 if(stage==='Commercially Won'){
  const created=await client.query('INSERT INTO crm_v3_crfs(id,lead_id,created_by,updated_by) VALUES($1,$2,$3,$3) ON CONFLICT(lead_id) DO NOTHING RETURNING *',[randomUUID(),id,user.id]);
  crf=created.rows[0]||(await client.query('SELECT * FROM crm_v3_crfs WHERE lead_id=$1',[id])).rows[0];
  if(created.rowCount)await event(client,user,'CRF',crf.id,'Auto-created on Commercially Won',{leadId:id,status:'Pending'});
 }
 return{record:r.rows[0],crf};
}
async function updateCrf(client,user,id,body){
 only(body,['version','profile']);
 const current=await record(client,tables.crfs,id,true);versionOf(body.version);
 if(body.version!==current.version)fail(409,'Record changed; refresh before saving');
 if(!['Pending','In Progress','Returned for Correction'].includes(current.status)||current.submitted_at&&current.status!=='Returned for Correction')fail(409,'CRF submitted for review is locked until returned');
 const profile=restrictCrfProfile(body.profile);
 const r=await client.query("UPDATE crm_v3_crfs SET profile=$2::jsonb,status='In Progress',submitted_at=NULL,submitted_by=NULL,finance_decided_at=NULL,finance_decided_by=NULL,finance_reason='',updated_at=now(),updated_by=$3,version=version+1 WHERE id=$1 RETURNING *",[id,JSON.stringify(profile),user.id]);
 await event(client,user,'CRF',id,'Profile updated',{fields:Object.keys(profile),previousVersion:current.version});return{record:r.rows[0]};
}
async function submitCrf(client,user,id,body){
 only(body,['version']);
 const current=await record(client,tables.crfs,id,true),lead=await record(client,tables.leads,current.lead_id,true);
 versionOf(body.version);if(body.version!==current.version)fail(409,'Record changed; refresh');
 canSubmitCrf({crf:current,lead});
 const required=['legalName','businessAddress','country','requestedArrangement','contactRole'];
 if(lead.segment==='Non-IATA')required.push('agencyType');
 const missing=required.filter(k=>!current.profile?.[k]);if(missing.length)fail(400,'Complete required CRF fields: '+missing.join(', '));
 const r=await client.query("UPDATE crm_v3_crfs SET status='Pending',submitted_by=$2,submitted_at=now(),updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1 RETURNING *",[id,user.id]);
 await event(client,user,'CRF',id,'Submitted to Finance',{status:'Pending',previousVersion:current.version});
 return{record:r.rows[0]};
}
async function decideCrf(client,user,id,body){
 only(body,['version','decision','reason','evidenceVerified']);
 const current=await record(client,tables.crfs,id,true),lead=await record(client,tables.leads,current.lead_id,true);
 versionOf(body.version);if(body.version!==current.version)fail(409,'Record changed; refresh');
 canDecideFinance({actor:user,crf:current,lead,financeAuthorized:userIsFinanceReviewer(user,current)});
 const decision=validateFinanceDecision(body.decision,body.reason||''),reason=txt(body.reason,'Finance reason',2000);
 if(decision==='Approved'&&body.evidenceVerified!==true)fail(409,'An independent Finance reviewer must verify legally required documents and cash/credit terms before approval');
 await branch(client,lead.business_line_id,lead.branch_id);
 const r=await client.query('UPDATE crm_v3_crfs SET status=$2,finance_decided_by=$3,finance_decided_at=now(),finance_reason=$4,updated_by=$3,updated_at=now(),version=version+1 WHERE id=$1 RETURNING *',[id,decision,user.id,reason]);
 await event(client,user,'CRF',id,'Finance decision',{from:current.status,to:decision,evidenceVerified:decision==='Approved'},reason);
 let account=null;
 if(decision==='Approved'){
  const name=txt(current.profile.legalName,'Legal Name',200,true),accountId=randomUUID();
  const saved=await client.query('INSERT INTO crm_v3_accounts(id,crf_id,lead_id,segment,name,business_line_id,branch_id,global_client_id,owner_id,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) ON CONFLICT(crf_id) DO NOTHING RETURNING *',
   [accountId,id,lead.id,lead.segment,name,lead.business_line_id,lead.branch_id,lead.global_client_id,lead.owner_id,user.id]);
  account=saved.rows[0]||(await client.query('SELECT * FROM crm_v3_accounts WHERE crf_id=$1',[id])).rows[0];
  if(saved.rowCount)await event(client,user,'Account',account.id,'Created after Finance approval',{leadId:lead.id,crfId:id});
 }
 return{record:r.rows[0],account};
}
async function linkContact(client,user,id,body){
 only(body,['targetId','leadId','accountId','relation','isPrimary']);
 const contact=await record(client,tables.contacts,id);
 const linked=await linkedBusiness(client,body);assertSameScope(contact,linked.record);
 const col={targets:'target_id',leads:'lead_id',accounts:'account_id'}[linked.kind];
 const linkId=randomUUID();
 const r=await client.query('INSERT INTO crm_v3_contact_links(id,contact_id,'+col+',relation,is_primary,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING *',
 [linkId,id,linked.id,txt(body.relation,'Relationship',80)||'Other',body.isPrimary===true,user.id]);
 if(!r.rowCount)fail(409,'Contact is already linked to this record');
 await event(client,user,'Contact',id,'Linked to '+linked.kind,{linkId,entityId:linked.id});
 return{link:r.rows[0]};
}
async function getDashboard(client){
 const keys=['targets','leads','crfs','accounts','contacts','activities','campaigns'];
 const out={};for(const kind of keys){
  const field=kind==='targets'||kind==='leads'?'stage':'status',r=await client.query('SELECT '+field+' AS category,count(*)::int AS total FROM '+tables[kind]+' GROUP BY '+field+' ORDER BY '+field);
  out[kind]={total:r.rows.reduce((a,x)=>a+x.total,0),byStatus:r.rows};
 }
 return{metrics:out,source:'SAI-CRM v3 operational records',separateFromActualSales:true};
}
export async function crmV3({client,user,path,method,url,body={}}){
 requireCoreAccess(user);
 if(path[0]!=='crm-v3')fail(404,'Not found');
 const kind=path[1];
 if(kind==='bootstrap'&&method==='GET'&&path.length===2){
  const branches=await client.query("SELECT b.id,b.display_id,b.code,b.name,b.business_line_id,bl.name AS business_line,c.name AS country FROM branch_masters b JOIN business_lines bl ON bl.id=b.business_line_id JOIN countries c ON c.id=b.country_id JOIN regions rg ON rg.id=b.region_id JOIN country_business_lines cb ON cb.country_id=c.id AND cb.business_line_id=bl.id AND cb.removed_at IS NULL WHERE b.status='Active' AND b.archived_at IS NULL AND b.deleted_at IS NULL AND bl.status='Active' AND bl.archived_at IS NULL AND bl.deleted_at IS NULL AND c.status='Active' AND c.archived_at IS NULL AND c.deleted_at IS NULL AND rg.status='Active' AND rg.archived_at IS NULL AND rg.deleted_at IS NULL ORDER BY bl.name,b.name LIMIT 1000");
  return{branches:branches.rows,segments:['Corporate','Non-IATA'],targetStages:['New','Contact Attempted','Contacted','On Hold','Closed/Not Interested'],leadStages:['Qualified','Hot','Proposal Submitted','Negotiation','Commercially Won','Closed & Dead'],crfStatuses:['Pending','In Progress','Returned for Correction','Approved','Rejected','Cancelled'],permissions:{read:true,create:true,financeApprove:user.system_role==='super_admin',emailSending:false},status:'Pilot API: Finance documents require independent verification; connected outbound email sending is disabled'};
 }
 if(kind==='dashboard'&&method==='GET'&&path.length===2)return await getDashboard(client);
 if(kind==='history'&&method==='GET'&&path.length===4){
  const type=path[2],id=requiredUUID(path[3],'history ID');
  if(!Object.values(entityKind).includes(type))fail(404,'Invalid history type');
  const rows=await client.query('SELECT e.id,e.action,e.changes,e.reason,e.created_at,u.name AS actor FROM crm_v3_events e JOIN users u ON u.id=e.actor_id WHERE e.entity_kind=$1 AND e.entity_id=$2 ORDER BY e.id DESC LIMIT 200',[type,id]);
  return{history:rows.rows};
 }
 if(!Object.hasOwn(tables,kind))fail(404,'CRM module not found');
 if(method==='GET'&&path.length===2)return await list(client,kind,url);
 if(method==='GET'&&path.length===3)return {record:await record(client,tables[kind],path[2])};
 if(method==='POST'&&path.length===2){
  if(kind==='targets')return await createTarget(client,user,body);
  if(kind==='contacts')return await createContact(client,user,body);
  if(kind==='activities')return await createActivity(client,user,body);
  if(kind==='campaigns')return await createCampaign(client,user,body);
  if(kind==='globalclients')return await createGlobalClient(client,user,body);
  fail(405,'This record type is created only through the approved conversion/Finance workflow');
 }
 if(kind==='targets'&&method==='POST'&&path.length===4&&path[3]==='qualify')return await qualifyTarget(client,user,path[2],body);
 if(kind==='targets'&&method==='PUT'&&path.length===3)return await updateTarget(client,user,path[2],body);
 if(kind==='leads'&&method==='PUT'&&path.length===3)return await updateLead(client,user,path[2],body);
 if(kind==='crfs'&&method==='PUT'&&path.length===3)return await updateCrf(client,user,path[2],body);
 if(kind==='crfs'&&method==='POST'&&path.length===4&&path[3]==='submit')return await submitCrf(client,user,path[2],body);
 if(kind==='crfs'&&method==='POST'&&path.length===4&&path[3]==='decide')return await decideCrf(client,user,path[2],body);
 if(kind==='contacts'&&method==='POST'&&path.length===4&&path[3]==='link')return await linkContact(client,user,path[2],body);
 fail(405,'CRM action is not available');
}
