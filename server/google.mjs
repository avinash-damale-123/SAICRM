import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createHash } from 'node:crypto';
import { digest, equal } from './crypto.mjs';
const keys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export function googleConfiguration(env) {
 const id=env.GOOGLE_CLIENT_ID||'', secret=env.GOOGLE_CLIENT_SECRET||'';
 if(Boolean(id)!==Boolean(secret))throw Error('Google configuration incomplete');
 return {googleId:id,googleSecret:secret,googleDomain:env.GOOGLE_WORKSPACE_DOMAIN||''};
}
export const pkce=value=>createHash('sha256').update(value).digest('base64url');
export function authorizationURL(config,{state,nonce,verifier}) {
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 url.search=new URLSearchParams({client_id:config.googleId,redirect_uri:config.origin+'/api/auth/google/callback',response_type:'code',scope:'openid email profile',state,nonce,code_challenge:pkce(verifier),code_challenge_method:'S256',prompt:'select_account'}).toString();
 return url.href;
}
export async function verifyGoogleToken(idToken,config,nonceHash,keySet=keys) {
 const {payload}=await jwtVerify(idToken,keySet,{issuer:['https://accounts.google.com','accounts.google.com'],audience:config.googleId,algorithms:['RS256'],maxTokenAge:'10m'});
 if(!payload.sub||typeof payload.sub!=='string'||payload.sub.length>255||payload.email_verified!==true||typeof payload.email!=='string'||typeof payload.nonce!=='string'||!equal(digest(config.secret,payload.nonce),nonceHash)||((Array.isArray(payload.aud)&&payload.aud.length>1&&!payload.azp)||(payload.azp&&payload.azp!==config.googleId))||(config.googleDomain&&payload.hd!==config.googleDomain))throw Error('Google identity rejected');
 return {sub:payload.sub,email:payload.email,name:typeof payload.name==='string'?payload.name:''};
}
export async function exchangeGoogle(code,verifier,nonceHash,config) {
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,client_id:config.googleId,client_secret:config.googleSecret,redirect_uri:config.origin+'/api/auth/google/callback',grant_type:'authorization_code',code_verifier:verifier}),signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw Error('Google exchange failed');
 const result=await response.json();
 return verifyGoogleToken(result.id_token,config,nonceHash);
}
