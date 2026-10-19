import { readFile } from 'node:fs/promises';
import { database } from '../server/db.mjs';
const pool=database();
try {
 for(const file of ['001_initial.sql','002_google.sql','003_business_lines.sql'])
  await pool.query(await readFile(new URL('../db/'+file,import.meta.url),'utf8'));
 console.log('Migrations complete');
} finally {await pool.end()}
