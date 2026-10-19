import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Reproducible UI diagnostics. Explicitly excludes server data, secrets, auth
// state, environment files, and customer records. Not part of the public build.
test('capture frontend assets used by visual browser checks',async()=>{
 const allowlist=['index.html','styles.css','auth.css','satguru-brand.css','business-lines-theme.css','module-workspace.css','workspace-shell.css','module-header.js','module-header.css','app.js','auth.js','responsive.js','module-workspace.js','workspace-shell.js','business-lines-ui.js','scripts/build.mjs','test/browser.mjs','test/business-lines-browser.mjs','test/header-visual.mjs','vercel.json','package.json','assets/satguru-travel-logo.webp'];
 const files={};
 for(const path of allowlist){
  const bytes=await readFile(path);assert.ok(bytes.length>0,path);
  files[path]={encoding:'base64',content:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex')};
 }
 await mkdir('work/browser',{recursive:true});
 await writeFile('work/browser/frontend-fixture.json',JSON.stringify({commit:process.env.GITHUB_SHA||'local',files}));
});
