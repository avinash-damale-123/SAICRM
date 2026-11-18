// Domain policy shared by the operational API and tests.
// No legacy CRM status, Retail segment or customer email-sending side effects.
export const SEGMENTS=Object.freeze(['Corporate','Non-IATA']);
export const TARGET_STAGES=Object.freeze(['New','Contact Attempted','Contacted','On Hold','Closed/Not Interested']);
export const LEAD_STAGES=Object.freeze(['Qualified','Hot','Proposal Submitted','Negotiation','Commercially Won','Closed & Dead']);
export const CRF_STATUSES=Object.freeze(['Pending','In Progress','Returned for Correction','Approved','Rejected','Cancelled']);
export const ACTIVITY_KINDS=Object.freeze(['Call','Email','Meeting','Visit','MoM','Task','Note']);
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const allowed=(x,set,label)=>{if(!set.includes(x))fail(400,'Invalid '+label);return x;};
export function segment(value){return allowed(value,SEGMENTS,'CRM segment. Only Corporate and Non-IATA are supported');}
export function cleanText(value,label,max=200,required=true){
 if(typeof value!=='string')fail(400,label+' must be text');
 const v=value.trim().replace(/\s+/gu,' ');
 if((required&&!v)||v.length>max||/[\u0000-\u001f\u007f]/u.test(v))fail(400,'Invalid '+label);
 return v;
}
export function qualificationEvidence(value){const s=cleanText(value,'Qualification evidence',3000);if(s.length<10)fail(400,'Record a qualifying interest or business requirement (minimum 10 characters)');return s;}
export function validTargetStage(value){return allowed(value,TARGET_STAGES,'Target stage');}
export function validLeadStage(value){return allowed(value,LEAD_STAGES,'Lead stage');}
export function validCrfStatus(value){return allowed(value,CRF_STATUSES,'CRF status');}
export function validActivityKind(value){return allowed(value,ACTIVITY_KINDS,'activity type');}
export function canAccessCore(user){
 return user?.email_verified===true&&user?.status==='approved'&&user?.system_role==='super_admin';
}
export function requireCoreAccess(user){if(!canAccessCore(user))fail(403,'CRM v3 pilot requires an approved Super Admin until scoped permission-role assignment is implemented');}
export function canDecideFinance({actor,crf,lead,financeAuthorized=false}){
 if(!canAccessCore(actor)||!financeAuthorized)fail(403,'Explicit Finance approval access is required');
 if(!crf||!lead||crf.lead_id!==lead.id)fail(404,'Linked CRF/Lead not found');
 if(crf.created_by===actor.id||crf.submitted_by===actor.id)fail(403,'The CRF requester cannot approve or reject their own submission');
 if(crf.status!=='In Progress'&&crf.status!=='Pending')fail(409,'Only a submitted or pending CRF can be decided');
 if(!crf.submitted_at)fail(409,'The CRF must be submitted before Finance review');
 if(lead.stage!=='Commercially Won'||!lead.commercial_won_at)fail(409,'Commercially Won is required before Finance approval');
 return true;
}
export function validateFinanceDecision(decision,reason){
 if(!['Approved','Rejected','Returned for Correction'].includes(decision))fail(400,'Unknown Finance decision');
 if(decision!=='Approved')cleanText(reason,'Finance decision reason',2000);
 return decision;
}
export function canSubmitCrf({crf,lead}){
 if(!crf||!lead||crf.lead_id!==lead.id)fail(404,'Linked CRF/Lead not found');
 if(lead.stage!=='Commercially Won'||!lead.commercial_won_at)fail(409,'Complete the commercial win before CRF submission');
 if(!['Pending','In Progress','Returned for Correction'].includes(crf.status))fail(409,'The CRF cannot be submitted from its current status');
 if(crf.submitted_at&&crf.status!=='Returned for Correction')fail(409,'The CRF is already submitted for Finance review');
 return true;
}
export function restrictCrfProfile(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'CRF profile must be an object');
 const accepted=['legalName','registrationNumber','businessAddress','country','state','city','industry','agencyType','ownershipType','gds','services','requestedArrangement','source','notes','contactRole','businessPotentialUsd'];
 const keys=Object.keys(input);
 if(keys.length>accepted.length||keys.some(k=>!accepted.includes(k)))fail(400,'CRF profile includes a prohibited or unsupported field; use approved secure document storage for sensitive data');
 const result={};
 for(const [key,value] of Object.entries(input)){
  if(Array.isArray(value)){if(value.length>20||value.some(x=>typeof x!=='string'||x.length>100))fail(400,'Invalid CRF list field');result[key]=value;}
  else if(typeof value==='string')result[key]=cleanText(value,key,2000,false);
  else if(key==='businessPotentialUsd'&&typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e12)result[key]=value;
  else fail(400,'Invalid CRF profile value');
 }
 return result;
}
export function validActivityLink(input){
 if(!input||typeof input!=='object'||['targetId','leadId','accountId'].filter(k=>input[k]!==undefined&&input[k]!==null&&input[k]!=='').length!==1)fail(400,'Link the activity to exactly one Target, Lead, or Account');
 return true;
}
export function permitSequenceExecution({campaign,recipient,step,mailboxConnected=false,suppressed=false,centralApproved=false}){
 if(campaign?.status!=='Active'||!campaign?.approved_at||!centralApproved)fail(409,'Campaign is not centrally approved and Active');
 if(!mailboxConnected)fail(409,'Sender mailbox is not connected');
 if(!recipient||!['Active','Pending'].includes(recipient.status)||recipient.verification==='Unverified'||suppressed)fail(409,'Recipient is unverified, suppressed or ineligible');
 if(!step||!['Email','Call','Task'].includes(step.kind))fail(409,'Sequence step is not valid');
 return true;
}
