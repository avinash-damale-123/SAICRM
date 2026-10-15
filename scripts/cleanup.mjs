import { database } from '../server/db.mjs';
const pool=database();
try {
 await pool.query('DELETE FROM sessions WHERE expires_at < now()');
 await pool.query('DELETE FROM challenges WHERE expires_at < now()');
 await pool.query('DELETE FROM rate_limits WHERE expires_at < now()');
 console.log('Expired security state removed; CRM records and audit history retained');
} finally { await pool.end(); }
