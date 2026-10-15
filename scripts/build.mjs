import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('public',{recursive:true});
for(const file of ['index.html','styles.css','app.js','responsive.js','auth.js','auth.css']) await copyFile(file,'public/'+file);
console.log('Built static CRM assets; server files excluded from static output');
