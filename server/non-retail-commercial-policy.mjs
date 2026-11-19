// SAI-CRM non-retail CRM Stage 1 pure policy. No database writes or network operations.
// Implementations MUST independently authorize at their API/DB boundary.
export const SEGMENTS=Object.freeze(['Corporate','Non-IATA']);
export const TARGET_STAGES=Object.freeze(['New','Contact Attempted','Contacted','On Hold','Closed / Not Interested']);
export const LEAD_STAGES=Object.freeze(['Qualified','Hot','Proposal Submitted','Negotiation','Commercially Won','Closed & Dead']);
export const ONBOARDING_STAGES=Object.freeze(['Pending','In Progress','Returned for Correction','Approved','Rejected','Cancelled']);
export const CRF_STAGES=Object.freeze(['Pending','In Review','Returned for Correction','Approved','Rejected','Cancelled']);
const targetSet=new Set(TARGET_STAGES),leadSet=new Set(LEAD_STAGES),crfSet=new Set(CRF_STAGES);
const hasText=x=>typeof x==='string'&&x.trim().length>0;
const activeTarget=new Set(['New','Contact Attempted','Contacted']);
const activeLead=new Set(['Qualified','Hot','Proposal Submitted','Negotiation']);
const terminalCRF=new Set(['Approved','Rejected','Cancelled']);
export function isSupportedSegment(segment){return SEGMENTS.includes(segment);}
export function canTransitionTarget(from,to,{authorized=false,reason=''}={}){
 if(!authorized||!targetSet.has(from)||!targetSet.has(to)||from===to)return false;
 if(to==='Closed / Not Interested')return activeTarget.has(from)&&hasText(reason);
 if(to==='On Hold')return activeTarget.has(from);
 if(from==='On Hold'||from==='Closed / Not Interested')return activeTarget.has(to)&&hasText(reason);
 return activeTarget.has(from)&&activeTarget.has(to);
}
export function qualifiesAsLead({segment,authorized=false,qualifyingInterest=false,businessRequirement=false,evidenceReference='',sourceTargetId=''}={}){
 return isSupportedSegment(segment)&&authorized&&(qualifyingInterest===true||businessRequirement===true)&&hasText(evidenceReference)&&hasText(sourceTargetId);
}
export function canTransitionLead(from,to,{authorized=false,reason='',evidenceReference='',terminalOverride=false}={}){
 if(!authorized||!leadSet.has(from)||!leadSet.has(to)||from===to)return false;
 if(from==='Commercially Won'||from==='Closed & Dead')return terminalOverride&&hasText(reason)&&activeLead.has(to);
 if(to==='Closed & Dead')return hasText(reason);
 if(to==='Commercially Won')return hasText(evidenceReference);
 return activeLead.has(to);
}
// Mandatory eligibility checks before any sequence ENROLLMENT/SEND.
// A caller must supply freshly checked consent and suppression information,
// not stale values copied from browser UI.
export function maySendSequenceStep({authorized=false,segment,contactVerified=false,contactEmailVerified=false,suppressed=true,consented=false,campaignApproved=false,senderAuthorized=false,activeOwner=false,sendWindowOpen=false,alreadySent=false}={}){
 return authorized&&isSupportedSegment(segment)&&contactVerified&&contactEmailVerified&&!suppressed&&consented&&campaignApproved&&senderAuthorized&&activeOwner&&sendWindowOpen&&!alreadySent;
}
export function canTransitionCRF(from,to,{authorized=false,financeApprover=false,requesterId='',approverId='',allowSelfApproval=false,reason='',documentsComplete=false,versionCurrent=false,linkedWin=false}={}){
 if(!authorized||!crfSet.has(from)||!crfSet.has(to)||from===to||terminalCRF.has(from)||!versionCurrent||!linkedWin)return false;
 if(to==='In Review')return from==='Pending'||from==='Returned for Correction';
 if(to==='Pending')return from==='Returned for Correction'&&hasText(reason);
 if(to==='Cancelled')return from!=='Approved'&&hasText(reason);
 if(to==='Approved'||to==='Rejected'||to==='Returned for Correction'){
  if(!financeApprover||!hasText(reason))return false;
  if(!allowSelfApproval&&hasText(requesterId)&&requesterId===approverId)return false;
  if(to==='Approved'&&!documentsComplete)return false;
  return from==='In Review';
 }
 return false;
}
// An Account can only become operational through a Finance-approved CRF.
// This is an eligibility gate; uniqueness and idempotency are enforced by
// database constraints on onboardingRequestId / Business Line / Branch.
export function canActivateLocalAccount({segment,authorized=false,financeApproved=false,crfStatus='',onboardingRequestId='',businessLineId='',branchId='',globalClientVerified=false,localIdentityVerified=false}={}){
 return isSupportedSegment(segment)&&authorized&&financeApproved&&crfStatus==='Approved'&&
  [onboardingRequestId,businessLineId,branchId].every(hasText)&&globalClientVerified&&localIdentityVerified;
}
export function mayLinkContact({authorized=false,segment,localScopeAllowed=false,contactScopeAllowed=false,validEntity=false,verifiedIdentity=false}={}){
 return authorized&&isSupportedSegment(segment)&&localScopeAllowed&&contactScopeAllowed&&validEntity&&verifiedIdentity;
}
export function classifyLegacyLead(originalStage,{qualifyingEvidence=false,commercialEvidence=false,financeApprovalEvidence=false}={}){
 const s=String(originalStage||'').trim();
 if(s==='Converted')return {status:'review',reason:'Converted does not prove Finance approval or Account activation'};
 if(s==='Hot'&&qualifyingEvidence)return {status:'candidate',stage:'Hot'};
 if(s==='Proposal Submitted'&&qualifyingEvidence)return {status:'candidate',stage:'Proposal Submitted'};
 if(s==='Negotiation'&&qualifyingEvidence)return {status:'candidate',stage:'Negotiation'};
 if(s==='Commercially Won'&&commercialEvidence)return {status:'candidate',stage:'Commercially Won',financeApprovalConfirmed:Boolean(financeApprovalEvidence)};
 return {status:'review',reason:'Manual qualification and mapping required'};
}
