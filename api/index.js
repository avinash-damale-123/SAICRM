import '../server/runtime-diagnostics.mjs';
import {waitUntil} from '@vercel/functions';
import {maintenanceRequest} from '../server/records-maintenance.mjs';
import {enqueueTransfer,workerRequest} from '../server/records-worker.mjs';
import { database } from '../server/db.mjs';
import { configuration, createHandler } from '../server/api.mjs';
let handler;
export default async function api(req, res) {
 try {
  const pool=database(),config=configuration();
  const route=req.query?.route||new URL(req.url,config.origin).pathname.replace(/^\/api\/?/,'');
  if(route==='internal/records-maintenance')return await maintenanceRequest(req,res,{pool,config,waitUntil});
  if(route==='internal/records-worker')return await workerRequest(req,res,{pool,config,waitUntil});
  if (!handler) handler = createHandler({pool,config,enqueue:id=>enqueueTransfer(waitUntil,pool,config,id)});
  await handler(req,res);
 } catch {
  res.statusCode=503; res.setHeader('Cache-Control','no-store'); res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({error:'SCRM service is awaiting verified database and email configuration.'}));
 }
}
