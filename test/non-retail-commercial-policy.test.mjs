import test from 'node:test';
import assert from 'node:assert/strict';
import {
 SEGMENTS,TARGET_STAGES,LEAD_STAGES,ONBOARDING_STAGES,CRF_STAGES,
 isSupportedSegment,canTransitionTarget,qualifiesAsLead,canTransitionLead,
 maySendSequenceStep,canTransitionCRF,canActivateLocalAccount,mayLinkContact,classifyLegacyLead
} from '../server/non-retail-commercial-policy.mjs';
test('Corporate and Non-IATA are only supported new CRM segments',()=>{
 assert.deepEqual(SEGMENTS,['Corporate','Non-IATA']);
 for(const name of ['Retail','IATA','Airline','Other',undefined])assert.equal(isSupportedSegment(name),false);
 assert.equal(isSupportedSegment('Non-IATA'),true);
});
test('approved Target/Lead stage baseline and evidence guards',()=>{
 assert.equal(TARGET_STAGES.length,5);assert.equal(LEAD_STAGES.length,6);assert.equal(ONBOARDING_STAGES.length,6);
 assert.equal(canTransitionTarget('New','Closed / Not Interested',{authorized:true}),false);
 assert.equal(canTransitionTarget('New','Closed / Not Interested',{authorized:true,reason:'no interest'}),true);
 const payload={authorized:true,segment:'Corporate',sourceTargetId:'target-1',qualifyingInterest:true,evidenceReference:'meeting-123'};
 assert.equal(qualifiesAsLead(payload),true);
 assert.equal(qualifiesAsLead({...payload,segment:'Retail'}),false);
 assert.equal(qualifiesAsLead({...payload,evidenceReference:''}),false);
 assert.equal(canTransitionLead('Negotiation','Commercially Won',{authorized:true}),false);
 assert.equal(canTransitionLead('Negotiation','Commercially Won',{authorized:true,evidenceReference:'signed-agreement'}),true);
});
test('communication sequence fails closed for consent, suppression, verification, approval and window',()=>{
 const ok={authorized:true,segment:'Non-IATA',contactVerified:true,contactEmailVerified:true,suppressed:false,consented:true,campaignApproved:true,senderAuthorized:true,activeOwner:true,sendWindowOpen:true,alreadySent:false};
 assert.equal(maySendSequenceStep(ok),true);
 for(const [key,value] of [['authorized',false],['contactVerified',false],['contactEmailVerified',false],['suppressed',true],['consented',false],['campaignApproved',false],['senderAuthorized',false],['activeOwner',false],['sendWindowOpen',false],['alreadySent',true],['segment','Retail']])
  assert.equal(maySendSequenceStep({...ok,[key]:value}),false,key);
 assert.equal(maySendSequenceStep({}),false);
});
test('Finance CRF workflow rejects unauthorized, stale, self-approved and incomplete decisions',()=>{
 assert.deepEqual(CRF_STAGES,['Pending','In Review','Returned for Correction','Approved','Rejected','Cancelled']);
 const ok={authorized:true,financeApprover:true,requesterId:'sales-1',approverId:'finance-1',reason:'validated documents',documentsComplete:true,versionCurrent:true,linkedWin:true};
 assert.equal(canTransitionCRF('Pending','In Review',ok),true);
 assert.equal(canTransitionCRF('In Review','Approved',ok),true);
 assert.equal(canTransitionCRF('In Review','Approved',{...ok,financeApprover:false}),false);
 assert.equal(canTransitionCRF('In Review','Approved',{...ok,approverId:'sales-1'}),false);
 assert.equal(canTransitionCRF('In Review','Approved',{...ok,documentsComplete:false}),false);
 assert.equal(canTransitionCRF('In Review','Approved',{...ok,versionCurrent:false}),false);
 assert.equal(canTransitionCRF('In Review','Approved',{...ok,linkedWin:false}),false);
 assert.equal(canTransitionCRF('In Review','Returned for Correction',ok),true);
 assert.equal(canTransitionCRF('Returned for Correction','In Review',ok),true);
 assert.equal(canTransitionCRF('Approved','In Review',ok),false);
});
test('Account activation requires Finance approval, validated identity, local scope and CRF',()=>{
 const ok={authorized:true,segment:'Corporate',financeApproved:true,crfStatus:'Approved',onboardingRequestId:'onb-1',businessLineId:'bl-1',branchId:'br-1',globalClientVerified:true,localIdentityVerified:true};
 assert.equal(canActivateLocalAccount(ok),true);
 for(const [key,value] of [['authorized',false],['segment','Retail'],['financeApproved',false],['crfStatus','Pending'],['onboardingRequestId',''],['businessLineId',''],['branchId',''],['globalClientVerified',false],['localIdentityVerified',false]])
  assert.equal(canActivateLocalAccount({...ok,[key]:value}),false,key);
 assert.equal(canActivateLocalAccount({}),false);
});
test('Contact linking must respect local scope and identity verification',()=>{
 const ok={authorized:true,segment:'Corporate',localScopeAllowed:true,contactScopeAllowed:true,validEntity:true,verifiedIdentity:true};
 assert.equal(mayLinkContact(ok),true);
 assert.equal(mayLinkContact({...ok,contactScopeAllowed:false}),false);
 assert.equal(mayLinkContact({...ok,verifiedIdentity:false}),false);
 assert.equal(mayLinkContact({...ok,segment:'Retail'}),false);
});
test('Legacy Converted remains under reconciliation, never auto Finance approved',()=>{
 assert.equal(classifyLegacyLead('Converted',{qualifyingEvidence:true,financeApprovalEvidence:true}).status,'review');
 assert.deepEqual(classifyLegacyLead('Hot',{qualifyingEvidence:true}),{status:'candidate',stage:'Hot'});
 assert.equal(classifyLegacyLead('Hot',{}).status,'review');
});
