import { authorize, modules } from './contracts.mjs';
import {countryPermissions,regionPermissions} from './resources.mjs';

const normalize = value => typeof value === 'string' ? value.trim() : '';
const toTime = value => value instanceof Date ? value.toISOString() : String(value || '');
const nameOf = data => normalize(data?.name || data?.subject || data?.email || data?.organisation || 'Record').slice(0, 140);
const extraOf = data => normalize(data?.organisation || data?.customer || data?.branch || data?.contact || data?.email || '').slice(0, 140);

// Search and notifications are derived from already authorized CRM data.
// No bypass through query scope, module IDs, or hidden employee records.
export async function searchWorkspace(client, principal, current, url) {
 const query = normalize(url.searchParams.get('q'));
 if (query.length > 100) { const e = new Error('Search is too long'); e.status = 400; throw e; }
 const global = url.searchParams.get('scope') === 'global';
 const module = normalize(url.searchParams.get('module')).toLowerCase();
 if (query.length < 2) return {results: [], query, scope: global ? 'global' : 'module'};
 const readable = modules.filter(id => authorize(principal, 'read', id));
 const selected = global ? readable : readable.filter(id => id === module);
 const output = [];
 if (selected.length) {
  const rows = (await client.query(`
   SELECT r.id,r.module,r.data,r.updated_at
   FROM records r
   WHERE r.module = ANY($2::text[])
     AND position(lower($1) in lower(r.data::text)) > 0
     AND ($3::boolean OR EXISTS (
       SELECT 1 FROM user_scopes s
       WHERE s.user_id=$4 AND s.branch=r.scope_branch AND s.line=r.scope_line
     ))
   ORDER BY r.updated_at DESC, r.id DESC LIMIT 35
  `, [query, selected, current.role === 'admin', current.id])).rows;
  for (const record of rows) output.push({
   id: record.id, module: record.module, title: nameOf(record.data),
   detail: extraOf(record.data), status: normalize(record.data?.status || record.data?.stage).slice(0, 60),
   updatedAt: toTime(record.updated_at)
  });
 }
 if ((global || module === 'businesslines') && current.system_role === 'super_admin') {
  const rows = (await client.query(`
   SELECT id,display_id,name,status,updated_at FROM business_lines
   WHERE position(lower($1) in lower(name || ' ' || display_id)) > 0
   ORDER BY updated_at DESC LIMIT 15
  `, [query])).rows;
  for (const item of rows) output.push({
   id: item.id, module: 'businesslines', title: item.name,
   detail: item.display_id, status: item.status, updatedAt: toTime(item.updated_at)
  });
 }
 if ((global || module === 'countries') && countryPermissions(current).read) {
  const rows = (await client.query(`
   SELECT id,display_id,name,code,status,updated_at FROM countries
   WHERE position(lower($1) in lower(name || ' ' || display_id || ' ' || code)) > 0
   ORDER BY updated_at DESC LIMIT 15
  `, [query])).rows;
  for (const item of rows) output.push({
   id:item.id,module:'countries',title:item.name,detail:item.display_id+' · '+item.code,
   status:item.status,updatedAt:toTime(item.updated_at)
  });
 }
 if ((global || module === 'regions') && regionPermissions(current).read) {
  const rows = (await client.query(`
   SELECT r.id,r.display_id,r.name,r.code,r.status,r.updated_at,bl.name business_line
   FROM regions r JOIN business_lines bl ON bl.id=r.business_line_id
   WHERE position(lower($1) in lower(r.name || ' ' || r.display_id || ' ' || r.code || ' ' || bl.name || ' ' || r.regional_manager)) > 0
   ORDER BY r.updated_at DESC LIMIT 15
  `, [query])).rows;
  for (const item of rows) output.push({
   id:item.id,module:'regions',title:item.name,detail:item.display_id+' · '+item.code+' · '+item.business_line,
   status:item.status,updatedAt:toTime(item.updated_at)
  });
 }
 return {results: output.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0,40),query,scope:global?'global':'module'};
}

export async function notificationsFeed(client, principal, current) {
 const readable = modules.filter(id => authorize(principal, 'read', id));
 const output = [];
 if (readable.length) {
  const rows = (await client.query(`
    SELECT a.id,a.action,a.module,a.record_id,a.created_at,r.data
    FROM audit a JOIN records r ON r.id::text=a.record_id AND r.module=a.module
    WHERE a.module = ANY($1::text[]) AND a.action IN ('Created','Updated')
      AND ($2::boolean OR EXISTS (
       SELECT 1 FROM user_scopes s
       WHERE s.user_id=$3 AND s.branch=r.scope_branch AND s.line=r.scope_line
      ))
    ORDER BY a.id DESC LIMIT 35
  `,[readable,current.role==='admin',current.id])).rows;
  for (const item of rows) output.push({
   id:'audit-'+item.id,kind:'record',module:item.module,recordId:item.record_id,
   title:(item.action==='Created'?'New ':'Updated ')+item.module.replace(/s$/,'')+': '+nameOf(item.data),
   detail:extraOf(item.data),createdAt:toTime(item.created_at)
  });
 }
 if (authorize(principal,'read','access')) {
  const pending=(await client.query(`
    SELECT id,name,email,created_at FROM users
    WHERE status='pending' AND email_verified=true
    ORDER BY created_at DESC LIMIT 10
  `)).rows;
  for (const item of pending) output.push({
   id:'approval-'+item.id,kind:'approval',module:'access',recordId:item.id,
   title:'Approval required: '+normalize(item.name || item.email).slice(0,120),
   detail:'Employee registration awaiting approval',createdAt:toTime(item.created_at)
  });
 }
 return {items:output.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,40)};
}
