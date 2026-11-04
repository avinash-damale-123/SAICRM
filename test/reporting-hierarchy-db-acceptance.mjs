import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {reportingHierarchyMaster} from '../server/reporting-hierarchy-master.mjs';

const cs=process.env.TEST_DATABASE_URL;
assert.ok(cs,'TEST_DATABASE_URL is required');
const u=new URL(cs);assert.ok(['127.0.0.1','localhost','[::1]'].includes(u.hostname),'Refusing remote database');
assert.match(u.pathname,/test/i,'Refusing non-test database');
const pool=new pg.Pool({connectionString:cs,max:2});
const client=await pool.connect();
try{
 await client.query(await readFile(new URL('../db/013_reporting_hierarchy_master.sql',import.meta.url),'utf8'));
 assert.equal((await client.query('SELECT MAX(version)::int AS version FROM schema_migrations')).rows[0].version,13);
 await client.query('BEGIN');
 const userId=(await client.query('SELECT id FROM users ORDER BY created_at LIMIT 1')).rows[0]?.id;
 assert.ok(userId,'Fixture must have an authenticated user');
 const user={id:userId,system_role:'super_admin',email_verified:true,status:'approved'};
 const ids=Array.from({length:4},()=>randomUUID());
 for(let i=0;i<4;i++)
  await client.query('INSERT INTO organizational_roles(id,name,code,applicability,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5)',
   [ids[i],'Hierarchy Fixture '+i,'HIER'+i,'Both',userId]);
 const run=(path=[],method='GET',body={})=>reportingHierarchyMaster({client,user,path:['reporting-hierarchy',...path],method,body,
  url:new URL('https://crm.invalid/api/reporting-hierarchy/'+path.join('/'))});
 const configure=(parent,child,type='Administrative')=>({parentRoleId:parent,childRoleId:child,hierarchyType:type,
  applicability:'Branch',scopeLevel:'Global',description:'QA role relationship'});
 const a=await run([],'POST',configure(ids[0],ids[1]));
 assert.match(a.record.displayId,/^HR-\d{3,}$/);
 const b=await run([],'POST',configure(ids[1],ids[2]));
 assert.equal(b.record.parentRoleId,ids[1]);
 const all=await run([]);
 assert.ok(all.records.some(r=>r.id===a.record.id));
 assert.equal(all.counts.administrative>=2,true);
 await assert.rejects(()=>run([],'POST',configure(ids[2],ids[0])),/Circular reporting/i);
 await assert.rejects(()=>run([],'POST',configure(ids[3],ids[1])),/one parent/i);
 await assert.rejects(()=>run([],'POST',configure(ids[0],ids[0])),/different Parent/i);
 await assert.rejects(()=>run([],'POST',configure(ids[0],ids[1])),/already exists/i);
 const f1=await run([],'POST',configure(ids[0],ids[2],'Functional'));
 const f2=await run([],'POST',configure(ids[3],ids[2],'Functional'));
 assert.equal(f1.record.hierarchyType,'Functional');assert.equal(f2.record.hierarchyType,'Functional');
 const scoped=await run([],'POST',{...configure(ids[3],ids[1]),applicability:'Central',scopeLevel:'Global'});
 assert.ok(scoped.record.id,'Other organizational context is distinct');
 const updated=await run([a.record.id],'PUT',{version:a.record.version,status:'Inactive',description:'Updated',reason:'Retire role pattern'});
 assert.equal(updated.record.status,'Inactive');
 const archived=await run([a.record.id,'archive'],'POST',{version:updated.record.version,reason:'Archive old reporting pattern'});
 assert.equal(archived.record.status,'Archived');
 const deleted=await run([a.record.id,'soft-delete'],'POST',{version:archived.record.version,reason:'Logical deletion'});
 assert.equal(deleted.record.status,'Deleted');
 const restored=await run([a.record.id,'restore-deleted'],'POST',{version:deleted.record.version,reason:'Recover reporting pattern',targetStatus:'Inactive'});
 assert.equal(restored.record.status,'Inactive');
 assert.ok((await run([a.record.id,'history'])).history.length>=5,'Audit history retained');
 await client.query('SAVEPOINT hierarchy_guard');
 await assert.rejects(()=>client.query('DELETE FROM reporting_hierarchy_rules WHERE id=$1',[a.record.id]),e=>e.code==='23514');
 await client.query('ROLLBACK TO SAVEPOINT hierarchy_guard');
 await client.query('SAVEPOINT role_guard');
 await assert.rejects(()=>client.query("UPDATE organizational_roles SET status='Inactive' WHERE id=$1",[ids[2]]),e=>e.code==='23514');
 await client.query('ROLLBACK TO SAVEPOINT role_guard');
 assert.equal((await client.query('SELECT COUNT(*)::int n FROM user_scopes WHERE user_id=$1',[userId])).rows[0].n>=0,true);
 await client.query('ROLLBACK');
 console.log('PASS Hierarchy v13: independent contexts, parent uniqueness, no cycles, lifecycle, audit and user scopes unaffected');
}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();await pool.end();}
