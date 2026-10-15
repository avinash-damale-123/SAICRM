import { database } from '../server/db.mjs';
import { configuration, createHandler } from '../server/api.mjs';
let handler;
export default async function api(req, res) {
 try {
  if (!handler) handler = createHandler({ pool: database(), config: configuration() });
  await handler(req,res);
 } catch {
  res.statusCode=503; res.setHeader('Cache-Control','no-store'); res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({error:'SCRM service is awaiting verified database and email configuration.'}));
 }
}
