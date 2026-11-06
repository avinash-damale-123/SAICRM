import test from 'node:test';
import assert from 'node:assert/strict';
import {TARGET_STAGES,LEAD_STAGES,ONBOARDING_STAGES,canTransitionTarget,qualifiesAsLead,canTransitionLead,proposedLegacyStageMapping,requiresOnboarding} from '../server/layer2-stage-policy.mjs';

test('approved stages are separate',()=>{
 assert.equal(TARGET_STAGES.length,5);
 assert.equal(LEAD_STAGES.length,6);
 assert.equal(ONBOARDING_STAGES.length,6);
 assert.equal(LEAD_STAGES.includes('New'),false);
});
test('qualification requires authorization and recorded evidence',()=>{
 const valid={authorized:true,businessRequirement:true,evidenceReference:'activity-1'};
 assert.equal(qualifiesAsLead(valid),true);
 assert.equal(qualifiesAsLead({...valid,authorized:false}),false);
 assert.equal(qualifiesAsLead({...valid,evidenceReference:''}),false);
 assert.equal(qualifiesAsLead({...valid,businessRequirement:false}),false);
});
test('Target closure and reopening require reason',()=>{
 assert.equal(canTransitionTarget('New','Contact Attempted',{authorized:true}),true);
 assert.equal(canTransitionTarget('Contacted','Closed / Not Interested',{authorized:true}),false);
 assert.equal(canTransitionTarget('Contacted','Closed / Not Interested',{authorized:true,reason:'No interest'}),true);
 assert.equal(canTransitionTarget('On Hold','Contacted',{authorized:true}),false);
 assert.equal(canTransitionTarget('On Hold','Contacted',{authorized:true,reason:'Resumed'}),true);
});
test('terminal Lead stages require evidence and privileged reversal',()=>{
 assert.equal(canTransitionLead('Negotiation','Commercially Won',{authorized:true}),false);
 assert.equal(canTransitionLead('Negotiation','Commercially Won',{authorized:true,evidenceReference:'agreement-1'}),true);
 assert.equal(canTransitionLead('Qualified','Closed & Dead',{authorized:true}),false);
 assert.equal(canTransitionLead('Qualified','Closed & Dead',{authorized:true,reason:'Declined'}),true);
 assert.equal(canTransitionLead('Commercially Won','Qualified',{authorized:true,reason:'Correction'}),false);
 assert.equal(canTransitionLead('Commercially Won','Qualified',{authorized:true,reason:'Correction',terminalOverride:true}),true);
 assert.equal(requiresOnboarding('Commercially Won'),true);
 assert.equal(requiresOnboarding('Proposal Submitted'),false);
});
test('legacy Converted requires review and does not imply onboarding approval',()=>{
 assert.equal(proposedLegacyStageMapping('Converted').status,'review');
 assert.equal(proposedLegacyStageMapping('Warm').status,'review');
 assert.equal(proposedLegacyStageMapping('Hot',{qualifyingEvidence:true}).candidateStage,'Hot');
 assert.equal(proposedLegacyStageMapping('Hot').status,'review');
});
