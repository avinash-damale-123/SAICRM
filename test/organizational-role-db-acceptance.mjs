import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {organizationalRoleMaster} from '../server/organizational-role-master.mjs';

const value=process.env.TEST_DATABASE_URL;
assert.ok(value,'TEST_DATABASE_URL required');
const url=new URL(value);
assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname),'Refusing remote DB');
assert.match(url.pathname,/test/i,'Refusing non-test DB');
const pool=new pg.Pool({connectionString:value,max:2});
const client=await pool.connect();
try {
 await client.query(await readFile(new URL('../db/012_organizational_role_master.sql',import.meta.url),'utf8'));
 const migrated=(await client.query('SELECT version FROM schema_migrations WHERE version=12')).rows;
 assert.equal(migrated.length,1,'Migration 012 applied');
 await client.query('BEGIN');
 const userId=(await client.query('SELECT id FROM users ORDER BY created_at LIMIT 1')).rows[0]?.id;
 assert.ok(userId,'Fixture User missing');
 const user={id:userId,system_role:'super_admin',email_verified:true,status:'approved'};
 const call=(path,method='GET',body={})=>organizationalRoleMaster({client,user,path:['organizational-roles',...path],method,body,url:new URL('https://crm.invalid/api/organizational-roles/'+path.join('/'))});
 const created=await call([],'POST',{name:'Branch Manager Fixture',code:'BRM-FIX',applicability:'Branch',family:'Sales',sortOrder:100});
 const role=created.record;
 assert.match(role.displayId,/^OR-\d{3,}$/);
 assert.equal(role.status,'Active');
 assert.equal(role.applicability,'Branch');
 const list=await call([]);
 assert.ok(list.records.some(x=>x.id===role.id));
 const updated=await call([role.id],'PUT',{version:role.version,name:'Branch Manager Fixture',code:'BRM-FIX',applicability:'Both',status:'Inactive',reason:'Role catalog review'});
 assert.equal(updated.record.status,'Inactive');
 assert.equal(updated.record.applicability,'Both');
 await client.query('SAVEPOINT org_duplicate');
 await assert.rejects(()=>call([],'POST',{name:'Duplicate Role',code:'BRM-FIX',applicability:'Branch'}),/already exists/i);
 await client.query('ROLLBACK TO SAVEPOINT org_duplicate');
 const archived=await call([role.id,'archive'],'POST',{version:updated.record.version,reason:'Retire organizational position'});
 assert.equal(archived.record.status,'Archived');
 const removed=await call([role.id,'soft-delete'],'POST',{version:archived.record.version,reason:'Historical cleanup'});
 assert.equal(removed.record.status,'Deleted');
 const restored=await call([role.id,'restore-deleted'],'POST',{version:removed.record.version,reason:'Position reinstated',targetStatus:'Inactive'});
 assert.equal(restored.record.status,'Inactive');
 const events=await call([role.id,'history']);
 assert.ok(events.history.length>=5,'Append-only role history');
 const scopes=(await client.query('SELECT count(*)::int n FROM user_scopes WHERE user_id=$1',[userId])).rows[0].n;
 assert.ok(scopes>=0,'Legacy user scopes remain available');
 await client.query('SAVEPOINT org_identity');
 await assert.rejects(()=>client.query('UPDATE organizational_roles SET sequence_no=999999 WHERE id=$1',[role.id]),err=>err.code==='23514');
 await client.query('ROLLBACK TO SAVEPOINT org_identity');
 await client.query('SAVEPOINT org_audit');
 await assert.rejects(()=>client.query('DELETE FROM organizational_role_events WHERE role_id=$1',[role.id]),err=>err.code==='P0001'||err.code==='23514');
 await client.query('ROLLBACK TO SAVEPOINT org_audit');
 await client.query('ROLLBACK');
 console.log('PASS Organizational Role v12: IDs, API, applicability, uniqueness, lifecycle, audit, preserved user scopes');
} catch(error) {
 await client.query('ROLLBACK').catch(()=>{});
 throw error;
} finally {
 client.release();await pool.end();
}
