// Background-only Yiron Branches refresh orchestration and authenticated worker continuation.
import {createHmac,timingSafeEqual} from 'node:crypto';
import {transaction} from './db.mjs';
import {verifyMaintenance} from './records-maintenance.mjs';
import {processLegacyBranchRefresh,requestLegacyRefresh} from './legacy-refresh.mjs';
import {yironConfiguration} from './yiron-analytics.mjs';

const validId=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export const legacyWorkerSignature=(secret,id,time)=>createHmac('sha256',secret).update('scrm-yiron-legacy:'+id+':'+time).digest('hex');

export function verifyLegacyWorker(secret,id,time,signature,now=Date.now()){
 if(typeof secret!=='string'||secret.length<32||!validId(id)||!/^\d{13}$/.test(String(time))||Math.abs(now-Number(time))>60000||!/^[a-f0-9]{64}$/.test(signature||''))return false;
 return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(legacyWorkerSignature(secret,id,time),'hex'));
}
function response(res,status,body){
 res.statusCode=status;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));
}
export function enqueueLegacyBranch(waitUntil,pool,config,id){
 if(!validId(id))return;
 waitUntil((async()=>{
  const outcome=await processLegacyBranchRefresh(pool,id,{budgetMs:30000});
  if(outcome.done)return;
  const time=Date.now(),signature=legacyWorkerSignature(config.secret,id,time);
  const target=(process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_URL?'https://'+process.env.VERCEL_URL:config.origin);
  const continuation=await fetch(target+'/api/internal/yiron-worker',{
   method:'POST',headers:{'Content-Type':'application/json','X-SCRM-Legacy-Worker':signature},
   body:JSON.stringify({id,time}),signal:AbortSignal.timeout(8000),redirect:'error'
  });
  if(!continuation.ok)throw new Error('Yiron worker handoff failed');
 })().catch(()=>{/* Leased/queued job remains recoverable on the next authenticated maintenance run. */}));
}
export async function legacyWorkerRequest(req,res,{pool,config,waitUntil}){
 if(req.method!=='POST')return response(res,405,{error:'Method not allowed'});
 let raw=req.body;
 if(raw===undefined){raw='';for await(const part of req){raw+=part;if(Buffer.byteLength(raw)>1024)return response(res,413,{error:'Request too large'});}}
 let body;try{body=typeof raw==='string'?JSON.parse(raw):raw;}catch{body=null;}
 if(!body||!verifyLegacyWorker(config.secret,body.id,body.time,req.headers['x-scrm-legacy-worker']))return response(res,403,{error:'Worker access denied'});
 enqueueLegacyBranch(waitUntil,pool,config,body.id);
 return response(res,202,{accepted:true});
}
export async function legacyMaintenanceRequest(req,res,{pool,config,waitUntil,secret=process.env.CRON_SECRET}){
 if(req.method!=='GET')return response(res,405,{error:'Method not allowed'});
 if(!verifyMaintenance(secret,req.headers.authorization))return response(res,403,{error:'Cron access denied'});
 try{
  if(!yironConfiguration().enabled)return response(res,200,{skipped:'Yiron integration not configured'});
  const result=await transaction(pool,async client=>{
   const source=(await client.query("SELECT enabled FROM legacy_api_sources WHERE id='branch_list_BI'")).rows[0];
   if(!source?.enabled)return {skipped:'Branches source not verified/enabled'};
   return requestLegacyRefresh(client,{trigger:'scheduled'});
  });
  if(result.jobId)enqueueLegacyBranch(waitUntil,pool,config,result.jobId);
  return response(res,200,result);
 }catch{
  return response(res,503,{error:'Yiron scheduled refresh did not start; existing published data remains available'});
 }
}
