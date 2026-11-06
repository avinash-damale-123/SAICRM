// SAI-CRM Layer 2 approved stage domain rules (BD-02/03/06, G-01/02/07/08).
// Pure functions: do not mutate legacy CRM data or trigger onboarding side effects.
export const TARGET_STAGES = Object.freeze(['New','Contact Attempted','Contacted','On Hold','Closed / Not Interested']);
export const LEAD_STAGES = Object.freeze(['Qualified','Hot','Proposal Submitted','Negotiation','Commercially Won','Closed & Dead']);
export const ONBOARDING_STAGES = Object.freeze(['Pending','In Progress','Returned for Correction','Approved','Rejected','Cancelled']);

const activeTargets = new Set(TARGET_STAGES.slice(0,3));
const activeLeads = new Set(LEAD_STAGES.slice(0,4));
const targetStages = new Set(TARGET_STAGES);
const leadStages = new Set(LEAD_STAGES);

export function canTransitionTarget(from,to,{authorized=false,reason=''}={}) {
 if(!authorized||!targetStages.has(from)||!targetStages.has(to)||from===to)return false;
 if(to==='Closed / Not Interested')return activeTargets.has(from)&&Boolean(reason.trim());
 if(to==='On Hold')return activeTargets.has(from);
 if(from==='On Hold'||from==='Closed / Not Interested')return activeTargets.has(to)&&Boolean(reason.trim());
 return activeTargets.has(from)&&activeTargets.has(to);
}
export function qualifiesAsLead({authorized=false,qualifyingInterest=false,businessRequirement=false,evidenceReference=''}={}) {
 return authorized&&(qualifyingInterest===true||businessRequirement===true)&&typeof evidenceReference==='string'&&evidenceReference.trim().length>0;
}
export function canTransitionLead(from,to,{authorized=false,reason='',evidenceReference='',terminalOverride=false}={}) {
 if(!authorized||!leadStages.has(from)||!leadStages.has(to)||from===to)return false;
 if(from==='Commercially Won'||from==='Closed & Dead')
  return terminalOverride&&Boolean(reason.trim())&&activeLeads.has(to);
 if(to==='Closed & Dead')return Boolean(reason.trim());
 if(to==='Commercially Won')return Boolean(evidenceReference.trim());
 return activeLeads.has(to);
}
export function proposedLegacyStageMapping(originalStage,evidence={}) {
 const value=String(originalStage||'').trim();
 if(value==='New')return {status:'review',candidateType:'target',candidateStage:'New'};
 if(value==='Cold')return {status:'review',candidateType:'target',candidateStage:'Contact Attempted'};
 if(value==='Warm')return {status:'review',reason:'Qualification evidence required'};
 if(value==='Hot'&&evidence.qualifyingEvidence===true)return {status:'candidate',candidateType:'lead',candidateStage:'Hot'};
 if(value==='Proposal Submitted'&&evidence.qualifyingEvidence===true)return {status:'candidate',candidateType:'lead',candidateStage:'Proposal Submitted'};
 if(['Negotiation','Negotiation & Final Discussion'].includes(value)&&evidence.qualifyingEvidence===true)
  return {status:'candidate',candidateType:'lead',candidateStage:'Negotiation'};
 if(value==='Converted')return {status:'review',reason:'Commercial outcome and onboarding must be reconciled separately'};
 if(value==='Closed & Dead')return {status:'review',reason:'Determine Target versus Lead closure from qualification history'};
 return {status:'review',reason:'Unrecognized or unsupported legacy status'};
}
export function requiresOnboarding(stage){return stage==='Commercially Won';}
