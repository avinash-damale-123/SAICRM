import { database, transaction } from '../server/db.mjs';
const email = process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
if(email !== 'admin@satguruai.com') throw new Error('Set BOOTSTRAP_SUPER_ADMIN_EMAIL to the designated admin@satguruai.com account');
const pool=database();
try {
 await transaction(pool, async client=>{
  // Same lock as ordinary access administration; changes and session revocation are atomic.
  await client.query('SELECT pg_advisory_xact_lock(830147)');
  const existing=await client.query("SELECT id FROM users WHERE system_role='super_admin'");
  if(existing.rowCount)throw new Error('A Super Admin already exists; this one-time bootstrap cannot be reused');
  const account=(await client.query('SELECT * FROM users WHERE email=$1 FOR UPDATE',[email])).rows[0];
  if(!account || !account.email_verified || account.status!=='approved' || account.role!=='admin')
   throw new Error('The designated account must already be verified, approved and an administrator');
  await client.query("UPDATE users SET system_role='super_admin' WHERE id=$1",[account.id]);
  await client.query('DELETE FROM sessions WHERE user_id=$1',[account.id]);
  await client.query("INSERT INTO audit(actor,action,module,record_id) VALUES($1,'Bootstrap Super Admin','access',$1)",[account.id]);
 });
 console.log('Designated administrator promoted to Super Admin; existing sessions revoked');
} finally {await pool.end()}
