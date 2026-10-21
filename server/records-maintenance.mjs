import {createHash,timingSafeEqual} from 'node:crypto';
import {transaction} from './db.mjs';
import {cleanupExpired} from './records-jobs.mjs';
import {enqueueTransfer} from './records-worker.mjs';

export function verifyMaintenance(secret,authorization){
 if(typeof secret!=='string'||secret.length<32||typeof authorization!=='string'||authorization.length>1024)return false;
 const expected=createHash('sha256').update('Bearer '+secret).digest(),actual=createHash('sha256').update(authorization).digest();
 return timingSafeEqual(expected,actual);
}
export async function maintenanceRequest(req,res,{pool,config,waitUntil,secret=process.env.CRON_SECRET}){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 const reply=(status,value)=>{res.statusCode=status;res.end(JSON.stringify(value));};
 if(req.method!=='GET')return reply(405,{error:'Method not allowed'});
 if(!verifyMaintenance(secret,req.headers.authorization))return reply(403,{error:'Maintenance authentication failed'});
 try{
  const result=await transaction(pool,async client=>{
   await client.query("SET LOCAL lock_timeout='5s'");await client.query("SET LOCAL statement_timeout='30s'");
   const cleaned=await cleanupExpired(client);
   const stale=(await client.query("SELECT id FROM crm_transfer_jobs WHERE status IN ('queued','running') AND expires_at>now() AND updated_at<now()-interval '2 minutes' ORDER BY updated_at LIMIT 10 FOR UPDATE SKIP LOCKED")).rows;
   if(stale.length)await client.query("UPDATE crm_transfer_jobs SET error=NULL,updated_at=now() WHERE id=ANY($1::uuid[])",[stale.map(j=>j.id)]);
   return {...cleaned,ids:stale.map(j=>j.id)};
  });
  for(const id of result.ids)enqueueTransfer(waitUntil,pool,config,id);
  return reply(200,{filesDeleted:result.filesDeleted,sourceRowsDeleted:result.sourceRowsDeleted,resumedJobs:result.ids.length});
 }catch{return reply(503,{error:'Transfer maintenance could not complete; it will retry on the next scheduled run.'});}
}
