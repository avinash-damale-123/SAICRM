import { readFile } from 'node:fs/promises';
import { database } from '../server/db.mjs';
const pool = database();
try { await pool.query(await readFile(new URL('../db/001_initial.sql', import.meta.url), 'utf8')); console.log('Migration complete'); }
finally { await pool.end(); }
