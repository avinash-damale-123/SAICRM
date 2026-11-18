import test from 'node:test';
import assert from 'node:assert/strict';
import {SEGMENTS,TARGET_STAGES,LEAD_STAGES,CRF_STATUSES,segment,qualificationEvidence,requireCoreAccess,canSubmitCrf,canDecideFinance,validateFinanceDecision,restrictCrfProfile,validActivityLink,permitSequenceExecution} from '../server/crm-v3-policy.mjs';

const admin={id:'admin',role:'admin',system_role:'super_admin',email_verified:true,status:'approved'};
const sales={id:'sales',role:'member',email_verified:true,status:'approved'};
const crf={id:'crf-1',lead_id:'lead-1',status:'In Progress',submitted_at:new Date(),created_by:'sales',submitted_by:'sales'};
const lead={id:'lead-1',stage:'Commercially Won',commercial_won_at:new Date()};
function denied(fn,code){assert.throws(fn,e=>e.status===code);}
test('new scope allows only Corporate and Non-IATA (Retail, IATA excluded)',()=>{
 assert.deepEqual(SEGMENTS,['Corporate','Non-IATA']);
 for(const x of SEGMENTS)assert.equal(segment(x),x);
 for(const x of ['Retail','IATA','Airline','B2C'])denied(()=>segment(x),400);
});
test('approved Target/Lead/CRF stage labels are preserved',()=>{
 assert.deepEqual(TARGET_STAGES,['New','Contact Attempted','Contacted','On Hold','Closed/Not Interested']);
 assert.deepEqual(LEAD_STAGES,['Qualified','Hot','Proposal Submitted','Negotiation','Commercially Won','Closed & Dead']);
 assert.deepEqual(CRF_STATUSES,['Pending','In Progress','Returned for Correction','Approved','Rejected','Cancelled']);
});
test('Target cannot convert to Lead on a blank or token-only qualification',()=>{
 denied(()=>qualificationEvidence(''),400);
 denied(()=>qualificationEvidence('seen'),400);
 assert.equal(qualificationEvidence('Client requested travel-management proposal'),'Client requested travel-management proposal');
});
test('only Super Admin is permitted pilot core access until scoped permission-role linkage',()=>{
 requireCoreAccess(admin);
 denied(()=>requireCoreAccess({...admin,system_role:'user'}),403);
 denied(()=>requireCoreAccess(sales),403);
 denied(()=>requireCoreAccess({...admin,email_verified:false}),403);
 denied(()=>requireCoreAccess({...admin,status:'suspended'}),403);
});
test('CRF submission requires Commercially Won and valid state',()=>{
 assert.equal(canSubmitCrf({crf,lead}),true);
 denied(()=>canSubmitCrf({crf,lead:{...lead,stage:'Negotiation'}}),409);
 denied(()=>canSubmitCrf({crf:{...crf,status:'Approved'},lead}),409);
});
test('Finance approval is explicit and maker-checker separation is enforced',()=>{
 const finance={...admin,id:'finance'};
 assert.equal(canDecideFinance({actor:finance,crf,lead,financeAuthorized:true}),true);
 denied(()=>canDecideFinance({actor:finance,crf,lead,financeAuthorized:false}),403);
 denied(()=>canDecideFinance({actor:{...admin,id:'sales'},crf,lead,financeAuthorized:true}),403);
 denied(()=>canDecideFinance({actor:finance,crf:{...crf,submitted_at:null},lead,financeAuthorized:true}),409);
 denied(()=>canDecideFinance({actor:finance,crf,lead:{...lead,stage:'Qualified'},financeAuthorized:true}),409);
});
test('Rejected and Returned decisions require reason; Approved does not',()=>{
 assert.equal(validateFinanceDecision('Approved',''),'Approved');
 denied(()=>validateFinanceDecision('Rejected',''),400);
 denied(()=>validateFinanceDecision('Returned for Correction',''),400);
 assert.equal(validateFinanceDecision('Rejected','KYC incomplete'),'Rejected');
});
test('CRF profile rejects bank numbers, government IDs and unknown personal fields',()=>{
 const safe=restrictCrfProfile({legalName:'Example Corporate',agencyType:'Non-IATA',gds:['Amadeus'],businessPotentialUsd:1000});
 assert.equal(safe.legalName,'Example Corporate');
 for(const p of [{bankAccountNumber:'123456789'},{passport:'AB1234'},{birthdate:'1990-01-01'},{otp:'secret'}])denied(()=>restrictCrfProfile(p),400);
});
test('activities have exactly one primary linked business record',()=>{
 validActivityLink({targetId:'a'});
 validActivityLink({leadId:'b',contactId:'c'});
 denied(()=>validActivityLink({}),400);
 denied(()=>validActivityLink({targetId:'a',accountId:'b'}),400);
});
test('email sending is disabled until approved, mailbox connected and recipient eligible',()=>{
 const campaign={status:'Active',approved_at:new Date()};
 const recipient={status:'Active',verification:'Verified'};
 const step={kind:'Email'};
 assert.equal(permitSequenceExecution({campaign,recipient,step,mailboxConnected:true,centralApproved:true}),true);
 denied(()=>permitSequenceExecution({campaign,recipient,step,mailboxConnected:false,centralApproved:true}),409);
 denied(()=>permitSequenceExecution({campaign,recipient,step,mailboxConnected:true,centralApproved:false}),409);
 denied(()=>permitSequenceExecution({campaign,recipient:{...recipient,verification:'Unverified'},step,mailboxConnected:true,centralApproved:true}),409);
 denied(()=>permitSequenceExecution({campaign,recipient,step,mailboxConnected:true,suppressed:true,centralApproved:true}),409);
});
