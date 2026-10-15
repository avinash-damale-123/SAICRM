import { database, transaction } from '../server/db.mjs';
const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
if (!email) throw new Error('Set BOOTSTRAP_ADMIN_EMAIL to the intended verified account');
const pool = database();
try {
 await transaction(pool, async client => {
  await client.query("SELECT pg_advisory_xact_lock(830147)");
  const admins = await client.query("SELECT id FROM users WHERE role='admin' AND status='approved'");
  if (admins.rowCount) throw new Error('An administrator already exists; use the access management screen');
  const result = await client.query("UPDATE users SET role='admin',status='approved' WHERE email=$1 AND email_verified=true RETURNING id", [email]);
  if (!result.rowCount) throw new Error('Register and verify this email before bootstrap');
  await client.query("INSERT INTO audit(actor,action,module,record_id) VALUES($1,'Bootstrap administrator','access',$1)", [result.rows[0].id]);
 });
 console.log('Verified account approved as the initial administrator');
} finally { await pool.end(); }
