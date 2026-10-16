import { database } from '../server/db.mjs';
const pool=database();
try {for(const table of ['sessions','challenges','rate_limits','oauth_states'])await pool.query('DELETE FROM '+table+' WHERE expires_at<now()');console.log('Expired security state removed; records and audit retained');}finally{await pool.end()}
