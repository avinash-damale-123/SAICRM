import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {departmentMaster} from '../server/department-master.mjs';
import {departmentTransfer} from '../server/department-transfers.mjs';

// This suite mutates only the disposable local GitHub Actions PostgreSQL fixture.
const value=process.env.TEST_DATABASE_URL;
assert.ok(value,'TEST_DATABASE_URL is required');
const url=new URL(value);
assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Refusing remote database');
assert.match(url.pathname,/test/i,'Refusing database whose name does not identify a test database');
const pool=new pg.Pool({connectionString:value,max:2});
const client=await pool.connect();
try{
 for(const version of ['009_regions.sql','010_branch_master.sql','011_department_master.sql']){
  await client.query(await readFile(new URL('../db/'+version,import.meta.url),'utf8'));
 }
 const migration=(await client.query('SELECT version FROM schema_migrations WHERE version=11')).rows;
 assert.equal(migration.length,1,'Migration 011 must be recorded');
 await client.query('BEGIN');
 const userId=(await client.query('SELECT id FROM users ORDER BY created_at LIMIT 1')).rows[0]?.id;
 assert.ok(userId,'Prior integration fixture must provision a User');
 const admin={id:userId,system_role:'super_admin',email_verified:true,status:'approved'};
 const id1=randomUUID(),id2=randomUUID(),id3=randomUUID();
 const insert=async(id,scope,level,name,code,parentId=null)=>{
  const row=await client.query('INSERT INTO department_units(id,scope,level,name,code,parent_id,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id,display_id AS "displayId"',
   [id,scope,level,name,code,parentId,userId]);
  return row.rows[0];
 };
 const root=await insert(id1,'Central','Department','Acceptance Management','ACC-MAN');
 const sub=await insert(id2,'Central','Sub-Department','Acceptance Sales','ACC-SAL',id1);
 const team=await insert(id3,'Central','Team','Acceptance Digital','ACC-DIG',id2);
 assert.match(root.displayId,/^DP-\d{3,}$/,'Root ID prefix');
 assert.match(sub.displayId,/^SD-\d{3,}$/,'Sub-Department ID prefix');
 assert.match(team.displayId,/^TM-\d{3,}$/,'Team ID prefix');
 await client.query('SAVEPOINT dep_guard');
 await assert.rejects(()=>insert(randomUUID(),'Central','Team','Invalid Team','BAD-TM',null),err=>err.code==='23514'||err.code==='23503');
 await client.query('ROLLBACK TO SAVEPOINT dep_guard');
 await client.query('SAVEPOINT dep_guard');
 await assert.rejects(()=>client.query("UPDATE department_units SET status='Inactive' WHERE id=$1",[id1]),err=>err.code==='23514');
 await client.query('ROLLBACK TO SAVEPOINT dep_guard');
 await client.query('SAVEPOINT dep_guard');
 await assert.rejects(()=>insert(randomUUID(),'Central','Department','Duplicate','ACC-MAN'),err=>err.code==='23505');
 await client.query('ROLLBACK TO SAVEPOINT dep_guard');
 const rootCsv='Unit Name,Unit Code,Level,Parent Unit Code,Description\nMarketing Acceptance,MKT-DEP,Department,,From import\nDigital Acceptance,DIG-TEAM,Team,MKT-DEP,From import\n';
 const action=(path,method,body={})=>departmentTransfer({client,user:admin,path:['department-master',...path],method,
  body,url:new URL('https://crm.invalid/api/department-master/'+path.join('/'))});
 const uploaded=await action(['imports','analyze'],'POST',{filename:'departments-fixture.csv',data:Buffer.from(rootCsv).toString('base64')});
 assert.equal(uploaded.job.total,2);
 assert.equal(uploaded.recommended.name,0);
 const validated=await action(['imports',uploaded.job.id,'validate'],'POST',{
  mapping:uploaded.recommended,scope:'Central',atomic:true,duplicates:'reject'});
 assert.equal(validated.valid,2,JSON.stringify(validated));
 assert.equal(validated.invalid,0);
 const dryRun=(await client.query("SELECT count(*)::int n FROM department_units WHERE code IN ('MKT-DEP','DIG-TEAM')")).rows[0];
 assert.equal(dryRun.n,0,'Import validation must not mutate catalog');
 const result=await action(['jobs',uploaded.job.id,'start'],'POST',{});
 assert.equal(result.job.succeeded,2,JSON.stringify(result));
 assert.equal(result.job.failed,0);
 const linked=await client.query("SELECT t.parent_id=p.id AS valid FROM department_units t JOIN department_units p ON p.code='MKT-DEP' WHERE t.code='DIG-TEAM'");
 assert.equal(linked.rows[0]?.valid,true,'Imported Team must link to its imported Department');
 const exportBody={format:'csv',columns:['displayId','name','level'],filters:{scope:'Central'}};
 const exported=await departmentTransfer({client,user:admin,path:['department-master','exports'],method:'POST',body:exportBody,
  url:new URL('https://crm.invalid/api/department-master/exports'),
  loadPage:query=>departmentMaster({client,user:admin,path:['department-master'],method:'GET',
   url:new URL('https://crm.invalid/api/department-master?'+query.toString())})});
 assert.ok(exported.count>=5,'Export includes original and newly imported rows');
 const binary=await action(['jobs',exported.job.id,'file'],'GET');
 assert.match(Buffer.from(binary.data,'base64').toString('utf8'),/Marketing Acceptance/);
 assert.match(Buffer.from(binary.data,'base64').toString('utf8'),/Digital Acceptance/);
 await assert.rejects(()=>departmentTransfer({client,user:{...admin,system_role:'user'},path:['department-master','jobs',exported.job.id,'file'],method:'GET',url:new URL('https://crm.invalid/api/department-master/jobs/'+exported.job.id+'/file')}),/permission required/);
 await client.query('ROLLBACK');
 console.log('PASS Department Postgres 011: independent IDs, hierarchy guards, dry-run, atomic import, audited records, authorized export');
}catch(e){
 await client.query('ROLLBACK').catch(()=>{});
 throw e;
}finally{
 client.release();
 await pool.end();
}
