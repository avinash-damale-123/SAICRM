import { readFile } from 'node:fs/promises';
import { database } from '../server/db.mjs';
const pool=database();
try {
 for(const file of ['001_initial.sql','002_google.sql','003_business_lines.sql','004_business_lines_fields.sql','005_user_master_display_id.sql','006_business_lines_lifecycle.sql','007_records_framework.sql','008_countries.sql','009_regions.sql','010_branch_master.sql'])
  await pool.query(await readFile(new URL('../db/'+file,import.meta.url),'utf8'));
 console.log('Migrations complete');
} finally {await pool.end()}
