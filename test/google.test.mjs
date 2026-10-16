import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import {verifyGoogleToken,pkce,googleConfiguration} from '../server/google.mjs';
import {sessionCookie} from '../server/api.mjs';
import {digest} from '../server/crypto.mjs';
test('Google JWT verifies signature, audience, nonce, verified email and hosted domain',async()=>{
 const {privateKey,publicKey}=await generateKeyPair('RS256');
 const config={googleId:'client',secret:'x'.repeat(64),googleDomain:'example.org'};
 const claims={sub:'google-sub',email:'a@example.org',email_verified:true,nonce:'nonce',hd:'example.org'};
 const jwt=async overrides=>new SignJWT({...claims,...overrides}).setProtectedHeader({alg:'RS256'}).setIssuer('https://accounts.google.com').setAudience('client').setIssuedAt().setExpirationTime('5m').sign(privateKey);
 const verify=value=>verifyGoogleToken(value,config,digest(config.secret,'nonce'),publicKey);
 assert.equal((await verify(await jwt({}))).sub,'google-sub');
 for(const changes of [{nonce:'wrong'},{email_verified:false},{hd:'other.org'},{azp:'other'}])await assert.rejects(()=>jwt(changes).then(verify));
 const valid=await jwt({});await assert.rejects(()=>verifyGoogleToken(valid,{...config,googleId:'other'},digest(config.secret,'nonce'),publicKey));
});
test('PKCE uses S256 and remembered cookies remain secure',()=>{
 assert.equal(pkce('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
 assert.equal(sessionCookie('test').includes('Max-Age'),false);
 assert.match(sessionCookie('test',true),/HttpOnly; Secure; SameSite=Lax; Max-Age=2592000/);
 assert.match(sessionCookie(''),/Max-Age=0/);
 assert.throws(()=>googleConfiguration({GOOGLE_CLIENT_ID:'missing-secret'}));
});
