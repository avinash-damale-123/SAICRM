import test from 'node:test';
import assert from 'node:assert/strict';
import { authorize, validateRecord, fields } from '../server/contracts.mjs';
import { passwordHash, passwordMatches, otp, token, digest } from '../server/crypto.mjs';

test('unverified and unapproved users never receive module permissions',()=>{
 for(const role of ['admin','manager','member','viewer','invented']){
  for(const status of ['pending','suspended','rejected']){
   assert.equal(authorize({role,status,emailVerified:true},'read','leads'),false);
  }
  assert.equal(authorize({role,status:'approved',emailVerified:false},'read','leads'),false);
 }
});
test('roles restrict administrative modules and destructive operations',()=>{
 const principal=role=>({role,status:'approved',emailVerified:true});
 for(const role of ['member','manager','viewer']){
  assert.equal(authorize(principal(role),'read','employees'),false);
  assert.equal(authorize(principal(role),'approve','access'),false);
  assert.equal(authorize(principal(role),'read','audit'),false);
 }
 assert.equal(authorize(principal('viewer'),'update','leads'),false);
 assert.equal(authorize(principal('member'),'delete','leads'),false);
 assert.equal(authorize(principal('manager'),'delete','leads'),true);
 assert.equal(authorize(principal('admin'),'approve','access'),true);
 assert.equal(authorize(principal('admin'),'read','unknown'),false);
});
test('all existing modules have a valid field contract and reject mass assignment',()=>{
 for(const [module,schema] of Object.entries(fields)){
  const input=Object.fromEntries(schema.map(([key,,type,,choices])=>[key,type==='select'?choices[0]:type==='number'?10:type==='email'?'person@example.org':type==='date'?'2026-10-15':'Example']));
  assert.ok(validateRecord(module,input));
  for(const extra of ['id','version','created_by','emailVerified','isAdmin','__proto__']){
   const malicious=JSON.parse(JSON.stringify(input));Object.defineProperty(malicious,extra,{value:'attacker',enumerable:true});
   assert.throws(()=>validateRecord(module,malicious));
  }
 }
});
test('invalid dates, nonfinite values, out-of-range probability and enum values fail',()=>{
 const opportunity={name:'Test',customer:'Test',stage:'Proposal',close:'2026-02-30',probability:50,value:10};
 assert.throws(()=>validateRecord('opportunities',opportunity));
 opportunity.close='2026-02-28';opportunity.probability=101;assert.throws(()=>validateRecord('opportunities',opportunity));
 opportunity.probability=10;opportunity.value=Infinity;assert.throws(()=>validateRecord('opportunities',opportunity));
 opportunity.value=10;opportunity.stage='Made up';assert.throws(()=>validateRecord('opportunities',opportunity));
 assert.throws(()=>validateRecord('contacts',{name:' '}));
});
test('password hashing uses independent salts and verifies passwords',async()=>{
 const first=await passwordHash('a very long test password'),second=await passwordHash('a very long test password');
 assert.notEqual(first,second);
 assert.equal(await passwordMatches('a very long test password',first),true);
 assert.equal(await passwordMatches('another test password',first),false);
 assert.match(otp(),/^\d{6}$/);assert.match(token(),/^[a-f0-9]{64}$/);
 assert.notEqual(digest('a','123456'),digest('b','123456'));
});
