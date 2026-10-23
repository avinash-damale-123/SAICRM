import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {baseline,effectivePolicy,reconcilePreferences} from '../server/records-policy.mjs';
import {publicColumns,queryOptions} from '../server/records-schema.mjs';
import {fileBytes,template,fileResponse,importFields,fileLimits} from '../server/records-files.mjs';
const base=process.cwd(),headers=JSON.parse(await readFile('vercel.json','utf8')).headers[0].headers;
const server=createServer(async(req,res)=>{try{for(const h of headers)res.setHeader(h.key,h.value);const path=new URL(req.url,'http://localhost').pathname,file=resolve(base,'.'+(path==='/'?'/index.html':path));if(!file.startsWith(base+'/')){res.writeHead(403);res.end();return}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'text/plain');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const testOrigin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true});
const user={id:'11111111-1111-4111-8111-111111111111',name:'QA Super Admin',email:'qa@example.org',role:'admin',systemRole:'super_admin',status:'approved',emailVerified:true};
const serverUser={...user,system_role:'super_admin',email_verified:true};
const permissions=Object.fromEntries(['read','create','edit','archive','restore','softDelete','restoreDeleted','reassignOwner','export','import','history','search','filter','settings','dashboard'].map(k=>[k,true]));
let configuration={version:0,publishedVersion:0,config:baseline(),draft:null},preferenceVersion=0,storedPrefs=null;
const effective=()=>effectivePolicy(configuration,serverUser),prefs=()=>({version:preferenceVersion,...reconcilePreferences(storedPrefs,effective())});
const now='2026-10-21T08:00:00Z';
const records=Array.from({length:30},(_,i)=>({id:'20000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),displayId:'BL-'+String(i+1).padStart(3,'0'),code:'RF-'+(i+1),name:'Framework Line '+String(i+1).padStart(2,'0'),description:'A detailed description for this Business Line. '.repeat(8),status:i<25?'Active':'Inactive',owner:'QA Super Admin',ownerId:'UID-000001',createdBy:'QA Super Admin',createdById:'UID-000001',createdAt:now,updatedBy:'QA Super Admin',updatedById:'UID-000001',updatedAt:now,isArchived:false,archivedAt:null,archivedById:null,isDeleted:false,deletedAt:null,deletedById:null,version:1}));
const jobs=new Map(),requests=[],errors=[];
let nextListFailure=false,readError=false,saveError=false,historyError=false,holdRead=false,holdSave=false,releaseRead,releaseSave;
function matching(q){let rows=records.filter(r=>!q.q||r.name.toLowerCase().includes(q.q.toLowerCase()));const test=(r,node)=>node.conditions?node.conditions.length===0||node.logic==='or'?node.conditions.length===0||node.conditions.some(n=>test(r,n)):node.conditions.every(n=>test(r,n)):node.operator==='contains'?String(r[node.field]||'').toLowerCase().includes(String(node.value).toLowerCase()):node.operator==='equals'?String(r[node.field])===String(node.value):true;if(q.filters)rows=rows.filter(r=>test(r,typeof q.filters==='string'?JSON.parse(q.filters):q.filters));if(q.status&&q.status!=='all')rows=rows.filter(r=>r.status===q.status);return rows;}
try{
 await mkdir('work/browser',{recursive:true});const page=await browser.newPage({viewport:{width:1366,height:768}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname.slice(5),method=req.method(),body=req.postData()?req.postDataJSON():null;requests.push({path,method,body,query:Object.fromEntries(url.searchParams)});let response={},status=200;
 if(path==='auth/me')response={user,csrf:'qa-csrf'};
 else if(path==='auth/options')response={googleEnabled:false};
 else if(path==='audit')response={audit:[]};
 else if(path==='access')response={users:[]};
 else if(path.startsWith('records/'))response={records:[],next:null};
 else if(path==='business-lines/framework')response={version:1,fields:publicColumns(),importFields,limits:fileLimits,policy:effective(),preferences:prefs(),permissions};
 else if(path==='business-lines'&&method==='GET'){if(nextListFailure){nextListFailure=false;await route.fulfill({status:503,json:{error:'List refresh temporarily unavailable'}});return;}const q=Object.fromEntries(url.searchParams),rows=matching(q),size=Number(q.pageSize||25),n=Number(q.page||1);response={records:rows.slice((n-1)*size,n*size),total:rows.length,totalPages:Math.max(1,Math.ceil(rows.length/size)),page:n,pageSize:size,counts:{total:30,active:25,inactive:5,archived:0},owners:[{id:user.id,ownerId:'UID-000001',name:user.name}],permissions,resource:{frameworkVersion:1,columns:publicColumns(),limits:{}},ui:{policy:effective(),preferences:prefs()}};}
 else if(path==='business-lines/preferences'){if(method==='PUT'){if(body.version!==preferenceVersion){status=409;response={error:'View preferences changed elsewhere'};}else{storedPrefs=body.data;preferenceVersion++;}}if(status===200)response={policy:effective(),preferences:prefs()};}
 else if(path==='business-lines/configuration'){if(method==='PUT'){assert.equal(body.version,configuration.version);configuration.version++;if(body.action==='publish'){configuration.config=body.config;configuration.publishedVersion++;configuration.draft=null;}else configuration.draft=body.config;}response={...configuration,history:[]};}
 else if(path==='business-lines/imports/template')response=fileResponse(await template(url.searchParams.get('format')),'template.'+url.searchParams.get('format'));
 else if(path==='business-lines/imports/analyze'){const id='33333333-3333-4333-8333-333333333333';const job={id,kind:'import',status:'uploaded',filename:body.filename,total:2,succeeded:0,failed:0,skipped:0,progress:0,createdAt:now};jobs.set(id,job);response={job,headers:['Business Line Name','Business Line Code','Business Line Description'],sample:[['Imported One','IMP-1','A']],recommended:{name:0,code:1,description:2}};}
 else if(path.includes('/imports/')&&path.endsWith('/validate')){const job=jobs.get(path.split('/')[2]);job.status='validated';assert.deepEqual(body.mapping,{name:0,code:1,description:2});response={job,valid:2,invalid:0,errors:[],preview:[{row:2,name:'Imported One',code:'IMP-1',result:'Create'}]};}
 else if(path==='business-lines/exports/plan'){const rows=matching(body.query||{});response={count:body.scope==='page'?Math.min(25,rows.length):rows.length,columns:body.columns,parts:1,format:body.format};}
 else if(path==='business-lines/exports'){const id='44444444-4444-4444-8444-444444444444';const file=await fileBytes(body.format,body.columns,records.slice(0,2));const job={id,kind:'export',status:'completed',total:2,succeeded:2,failed:0,skipped:0,progress:100,createdAt:now,file};jobs.set(id,job);response={job};}
 else if(path==='business-lines/jobs')response={jobs:[...jobs.values()].map(({file,...j})=>j)};
 else if(path.startsWith('business-lines/jobs/')){const [, ,id,action]=path.split('/'),job=jobs.get(id);if(!job){status=404;response={error:'Job not found'};}else if(action==='start'||action==='step'){job.status='completed';job.succeeded=2;job.progress=100;response={job};}else if(action==='file')response=fileResponse(job.file,'export.xlsx');else response={job,files:job.file?[{part:1,filename:'export.xlsx',size:job.file.bytes.length}]:[],errors:[],reportParts:0};}
 else if(path==='business-lines'&&method==='POST'){const record={...records[0],id:'99999999-0000-4000-8000-000000000001',displayId:'BL-031',...body,version:1};records.push(record);response={record};}
 else if(path.startsWith('business-lines/')){const [,id,action]=path.split('/'),r=records.find(r=>r.id===id);
 if(!r){status=404;response={error:'Record not found'};}
 else if(action==='history'){if(historyError){status=503;response={error:'History temporarily unavailable'};}else response={history:[{action:'Updated',actor:'QA Super Admin',createdAt:now,reason:'Popup regression evidence'}]};}
 else if(method==='PUT'){if(holdSave){holdSave=false;await new Promise(resolve=>{releaseSave=resolve});}if(saveError){status=409;response={error:'This record was changed elsewhere. Review it before retrying.'};saveError=false;}else{Object.assign(r,body,{version:r.version+1});response={record:r};}}
 else{if(holdRead){holdRead=false;await new Promise(resolve=>{releaseRead=resolve});}if(readError){status=503;response={error:'Record temporarily unavailable'};readError=false;}else response={record:r};}}

 await route.fulfill({status,json:response});});
 const ready=()=>page.waitForFunction(()=>document.querySelector('.mw-results')?.getAttribute('aria-busy')==='false'&&!!document.querySelector('.rf-table'));
 const open=async()=>{await page.locator('[data-nav="businesslines"]').waitFor({state:'attached'});await page.evaluate(()=>document.querySelector('[data-nav="businesslines"]').click());await ready();};

 await page.goto(testOrigin);await open();
 const checks=[],presentation=[];
 const modal=()=>page.locator('dialog[open]');
 const assertModal=async mode=>{
  assert.equal(await modal().count(),1,mode+': exactly one dialog');
  assert.equal(await modal().evaluate(d=>d.matches(':modal')),true,mode+': native modal makes background inert');
  assert.equal(await page.locator('.mw-workspace').isVisible(),true,mode+': underlying workspace remains mounted');
  assert.equal(await page.locator('.crm-module-host').isVisible(),true,mode+': module header remains visible behind backdrop');
  assert.equal(await page.locator('#content>.mw-bl-detail-page').count(),0,'No dedicated record page');
  const rowStyles=await modal().evaluate(d=>[...d.querySelectorAll('.mw-bl-field')].filter(el=>el.getClientRects().length).map(el=>{
   const label=el.querySelector(':scope>label'),value=el.querySelector(':scope>.mw-bl-value-cell');
   const l=label.getBoundingClientRect(),v=value.getBoundingClientRect();
   const content=value.querySelector('.mw-bl-read-value,input,select,textarea'),action=value.querySelector('[data-bl-field-edit]');
   return {left:l.left,right:l.right,top:l.top,bottom:l.bottom,valueLeft:v.left,valueTop:v.top,labelBackground:getComputedStyle(label).backgroundColor,valueBackground:getComputedStyle(value).backgroundColor,labelSize:parseFloat(getComputedStyle(label).fontSize),valueWeight:getComputedStyle(content).fontWeight,editable:!!content&&((content.matches('input,textarea')&&!content.readOnly)||(content.matches('select')&&!content.disabled)),actionFits:!action||content.getBoundingClientRect().right<=action.getBoundingClientRect().left-1,width:innerWidth,overflow:el.scrollWidth>el.clientWidth+1};
  }));
  assert.ok(rowStyles.length,mode+' visible label/value rows');
  for(const row of rowStyles){
   const expectedValueBackground=row.editable?'rgb(242, 250, 245)':'rgb(252, 254, 253)';
   assert.notEqual(row.labelBackground,row.valueBackground,mode+' distinguishes label and value surfaces');
   assert.equal(row.valueWeight,'400',mode+' regular-weight field values');assert.equal(row.valueBackground,expectedValueBackground,mode+(row.editable?' subtly highlights editable value surfaces':' keeps read-only values almost white'));
   assert.equal(row.actionFits,true,mode+' edit shortcut never covers the field value');
   assert.ok(row.labelSize>=12,mode+' readable labels');assert.equal(row.overflow,false,mode+' no overflowing field text');
   if(row.width>480){assert.ok(row.valueLeft>=row.right-1,mode+' label on left and value on right');assert.ok(Math.abs(row.top-row.valueTop)<2,mode+' label and value share a row');}
   else assert.ok(row.valueTop>=row.bottom-1,mode+' readable stacked fallback on narrow screens');
  }
  const shortcuts=await modal().locator('[data-bl-field-edit]').evaluateAll(buttons=>buttons.map(b=>b.dataset.blFieldEdit).sort());
  assert.deepEqual(shortcuts,mode.startsWith('create')?['code','description','name']:['code','description','name','status'],mode+' shortcuts only for editable fields');
  const sections=await modal().locator('.mw-bl-section>details>summary:visible').evaluateAll(items=>items.map(el=>getComputedStyle(el).backgroundColor));
  for(const color of sections)assert.ok(['rgb(197, 217, 204)','rgb(207, 223, 213)','rgb(191, 213, 200)'].includes(color),mode+' darker section headers');
  if(!mode.includes('long values')&&await page.evaluate(()=>innerWidth>760)){
   const pair=await modal().evaluate(d=>{const first=d.querySelector('.mw-bl-field-name'),id=d.querySelector('.mw-bl-field-displayId');if(!first||!id||!first.getClientRects().length)return null;const a=first.getBoundingClientRect(),b=id.getBoundingClientRect();return {top:Math.abs(a.top-b.top),height:Math.abs(a.height-b.height)};});
   if(pair){assert.ok(pair.top<2,mode+' paired fields align at top');assert.ok(pair.height<2,mode+' paired fields have consistent row height');}
  }
  const dismissColors=await modal().evaluate(d=>[...d.querySelectorAll('.mw-dialog-close,#mw-cancel,#bl-cancel')].map(el=>({bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color})));
  for(const style of dismissColors){assert.ok(['rgb(180, 35, 44)','rgb(148, 29, 38)'].includes(style.bg),mode+' red dismiss control');assert.equal(style.color,'rgb(255, 255, 255)',mode+' readable white action label');}

  const v=await modal().evaluate(d=>{
   const box=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
   const header=d.querySelector(':scope>header'),title=d.querySelector('#mw-dialog-title'),actions=d.querySelector('.mw-bl-title-actions'),close=d.querySelector('.mw-dialog-close'),body=d.querySelector('.mw-dialog-body'),section=d.querySelector('.mw-bl-detail-content .mw-bl-section');
   return {modal:box(d),title:box(title),actions:box(actions),close:box(close),background:getComputedStyle(header).backgroundColor,titleColor:getComputedStyle(title).color,titleSize:parseFloat(getComputedStyle(title).fontSize),textAlign:getComputedStyle(title.parentElement).textAlign,body:box(body),bodyScroll:body.scrollHeight,bodyClient:body.clientHeight,firstSection:section?box(section):null,innerWidth};
  });presentation.push({mode,...v});
  assert.equal(v.background,'rgb(22, 76, 56)',mode+' branded header');assert.equal(v.titleColor,'rgb(255, 255, 255)',mode+' white header label');
  assert.equal(v.textAlign,'center');assert.ok(Math.abs((v.title.left+v.title.right-v.modal.left-v.modal.right)/2)<2,mode+' title truly centered regardless of action count');
  assert.ok(v.title.right<=v.actions.left+1,mode+' title does not overlap actions');assert.ok(v.close.width>=35&&v.close.height>=35,mode+' clear Close target');
  assert.ok(v.titleSize>=17,mode+' title readable');
  assert.equal(await page.locator('#bl-edit-top').count(),mode.startsWith('read')?1:0,mode+' header Edit available only in Read');
  if(v.firstSection&&v.innerWidth>=1024&&mode.startsWith('read')&&mode!=='read long values')assert.ok(v.firstSection.top-v.body.top<125,'No excessive blank toolbar stack before fields');

  const g=await modal().evaluate(d=>{const r=d.getBoundingClientRect(),h=d.querySelector(':scope>header').getBoundingClientRect(),f=d.querySelector(':scope>footer').getBoundingClientRect();return {x:r.left,y:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight,headerTop:h.top,footerBottom:f.bottom,overflow:document.documentElement.scrollWidth>innerWidth+1}});
  assert.ok(g.x>=0&&g.y>=0&&g.right<=g.width+1&&g.bottom<=g.height+1,mode+' fits viewport '+JSON.stringify(g));
  assert.ok(g.headerTop>=g.y&&g.footerBottom<=g.bottom+1,mode+' header/footer remain inside popup');
  if(g.overflow)console.log('Overflow diagnostics',mode,await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&!e.closest('dialog .mw-dialog-body')}).slice(-12).map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right,width:e.getBoundingClientRect().width}))));assert.equal(g.overflow,false,mode+' no page overflow');
 };
 const openFirst=async()=>{await page.locator('.mw-record-link:visible').first().click();await page.locator('#bl-edit').waitFor();};
 const edit=async()=>{await page.locator('#bl-edit').click();await page.locator('#mw-bl-page-form').waitFor();};
 const beforeUnloadBlocked=()=>page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;});
 const assertFields=async()=>{assert.equal(await page.locator('.mw-bl-detail-page .mw-bl-field').count(),19);assert.equal(await page.locator('.mw-bl-detail-content .mw-bl-section').count(),5);};
 const toolbar=async()=>{for(const sel of ['[data-mw="filter-toggle"]','[data-mw="import"]','[data-mw="export"]','.mw-settings-menu'])assert.equal(await page.locator(sel).isVisible(),true,'Permitted action '+sel+' visible');};
 await toolbar();await page.locator('[data-mw="dashboard"]').click();await page.waitForFunction(()=>document.querySelector('[data-mw="dashboard"]')?.getAttribute('aria-current')==='page');await toolbar();
 await page.locator('[data-mw="filter-toggle"]').click();assert.equal(await page.locator('#mw-filter-controls').isVisible(),true,'Filter panel opens from Overview');assert.equal(await page.locator('[data-mw="dashboard"]').getAttribute('aria-current'),'page','Opening filters keeps Overview selected');await page.locator('[data-mw="filter-toggle"]').click();
 await page.locator('[data-mw="import"]').click();await page.locator('#rf-import-file').waitFor();await page.locator('[data-rf="cancel"]').click();
 await page.locator('.mw-settings-menu>summary').click();await page.locator('[data-mw="columns"]').click();await page.locator('#rf-column-search').waitFor();await page.locator('[data-rf="cancel"]').click();
 assert.equal(await page.locator('[data-mw="dashboard"]').getAttribute('aria-current'),'page');checks.push('Same permitted actions in Records and Overview; Import, Filter and Choose Columns work from Overview');
 await page.screenshot({path:'work/browser/popup-overview-toolbar.png'});
 await page.locator('[data-mw="home"]').click();await ready();
 const card=await page.locator('.scrm-bl-clean').evaluate(e=>({height:e.getBoundingClientRect().height,title:getComputedStyle(e.querySelector('h2')).fontSize,padding:parseFloat(getComputedStyle(e).paddingLeft)}));
 assert.ok(card.height<=96&&card.padding>=10&&parseFloat(card.title)>=18&&parseFloat(card.title)<=20,'Compact padded title card '+JSON.stringify(card));
 await page.locator('[data-mw="create"]').click();await assertModal('create');
 assert.equal(await page.locator('#mw-record-form .mw-bl-field').count(),3);assert.equal(await beforeUnloadBlocked(),false);
 for(const key of ['name','code','description']){await modal().locator('[data-bl-field-edit="'+key+'"]').click();assert.equal(await page.evaluate(()=>document.activeElement.name),key,'Create shortcut focuses '+key);}
 assert.equal(requests.filter(r=>r.method==='POST'&&r.path==='business-lines').length,0,'Field shortcuts never submit the form');
 await page.locator('#mw-save').click();assert.equal(await page.locator('#mw-record-form').count(),1);assert.ok(await page.locator('.rf-field-error:visible').count()>=2);
 await page.locator('#mw-record-form [name="name"]').fill('Popup Created');await page.locator('#mw-record-form [name="code"]').fill('POPUP-NEW');await page.locator('#mw-record-form [name="description"]').fill('Create remains compact.');
 assert.equal(await beforeUnloadBlocked(),true);
 await page.screenshot({path:'work/browser/popup-create-desktop.png'});
 await page.locator('#mw-save').click();await modal().waitFor({state:'detached'});await ready();
 assert.equal(requests.filter(r=>r.method==='POST'&&r.path==='business-lines').length,1);checks.push('Create popup: required validation, safe Save, unload warning and return to unchanged Records context');
 await openFirst();await assertModal('read');await assertFields();await page.locator('[data-bl-expand="1"]').click();
 assert.equal(await page.locator('.mw-bl-detail-index').isVisible(),true);await page.locator('[data-bl-jump="3"]').click();assert.equal(await page.locator('.mw-bl-detail-content .mw-bl-section').nth(3).locator('details').getAttribute('open'),'');await page.locator('.mw-dialog-body').evaluate(el=>el.scrollTop=0);
 assert.equal(await page.locator('.mw-bl-detail-page input,.mw-bl-detail-page textarea,.mw-bl-detail-page select').count(),0,'Read has values, not editable form controls');
 assert.equal(await page.locator('#bl-edit').isVisible(),true,'Footer Edit retained alongside top shortcut');
 assert.equal(await page.locator('#bl-edit-top').getAttribute('aria-label'),'Edit Business Line');
 const shortcutWrites=requests.filter(r=>r.method==='PUT'&&/^business-lines\/[0-9]/.test(r.path)).length;
 for(const key of ['name','code','status','description']){
  await modal().locator('[data-bl-field-edit="'+key+'"]').click();await page.locator('#mw-bl-page-form').waitFor();
  assert.equal(await page.evaluate(()=>document.activeElement.name),key,'Read shortcut opens existing Edit form at '+key);
  assert.equal(await beforeUnloadBlocked(),false,'Opening a field does not dirty the form');
  await page.locator('#bl-cancel').click();await page.locator('#bl-edit').waitFor();
 }
 assert.equal(requests.filter(r=>r.method==='PUT'&&/^business-lines\/[0-9]/.test(r.path)).length,shortcutWrites,'Read field shortcuts never write');
 const horizontal=await modal().locator('.mw-dialog-body').evaluate(body=>{
  const probe=document.createElement('div');probe.style.width=(body.clientWidth+320)+'px';probe.style.height='1px';body.append(probe);body.scrollLeft=body.scrollWidth;
  const header=body.parentElement.querySelector(':scope>header').getBoundingClientRect();
  const result={scroll:body.scrollLeft,overflow:document.documentElement.scrollWidth>innerWidth+1,headerVisible:header.left>=0&&header.right<=innerWidth+1};
  probe.remove();body.scrollLeft=0;return result;
 });
 assert.ok(horizontal.scroll>0,'Oversized content scrolls horizontally inside popup');assert.equal(horizontal.overflow,false,'Horizontal content does not widen page');assert.equal(horizontal.headerVisible,true,'Popup header stays visible while scrolling horizontally');
 checks.push('Field shortcuts open/focus the existing form without writes or dirty state; oversized content scrolls inside popup');
 const disclosure=page.locator('.mw-bl-detail-content .mw-bl-section').first().locator('summary');
 const chevron=await disclosure.locator('.mw-bl-chevron').boundingBox();assert.ok(chevron.width>=30&&chevron.height>=30,'Section indicator has a clear button-like target');
 assert.ok((await disclosure.boundingBox()).height>=40);await disclosure.focus();await page.keyboard.press('Space');
 await page.waitForFunction(()=>!document.querySelector('.mw-bl-detail-content .mw-bl-section details').open&&document.querySelector('.mw-bl-detail-content .mw-bl-section summary').title.startsWith('Expand '));assert.match(await disclosure.getAttribute('title'),/^Expand /);
 await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('.mw-bl-detail-content .mw-bl-section details').open);
 await page.locator('[data-bl-expand="0"]').click();await page.waitForFunction(()=>[...document.querySelectorAll('.mw-bl-detail-content .mw-bl-section details')].every(d=>!d.open));
 await page.locator('[data-bl-expand="1"]').click();await page.waitForFunction(()=>[...document.querySelectorAll('.mw-bl-detail-content .mw-bl-section details')].every(d=>d.open));
 assert.ok((await page.locator('[data-bl-expand="1"]').boundingBox()).height>=34);
 const nextName=await page.locator('.mw-bl-detail-heading h2').innerText();await page.locator('[data-bl-next]').click();
 await page.waitForFunction(name=>document.querySelector('.mw-bl-detail-heading h2')?.textContent!==name,nextName);await page.locator('#bl-edit-top').waitFor();
 await page.locator('[data-bl-prev]').click();await page.waitForFunction(name=>document.querySelector('.mw-bl-detail-heading h2')?.textContent===name,nextName);
 await page.locator('[data-bl-expand="1"]').click();await page.locator('.mw-dialog-body').evaluate(e=>e.scrollTop=0);
 checks.push('Centered dark-green title, visible top and bottom Edit, keyboard-operable large disclosures, prominent Next and section actions');

 await page.screenshot({path:'work/browser/popup-read-desktop.png'});
 const originalDialog=await modal().evaluate(d=>{window.__recordPopup=d;return true});
 await page.locator('#bl-edit-top').click();await page.locator('#mw-bl-page-form').waitFor();await assertFields();await assertModal('edit');assert.ok(originalDialog);assert.equal(await modal().evaluate(d=>d===window.__recordPopup),true,'Edit reuses the same popup');
 await page.locator('[data-bl-expand="1"]').click();
 const pairing=await page.evaluate(()=>{const a=document.querySelector('.mw-bl-field-name').getBoundingClientRect(),b=document.querySelector('.mw-bl-field-displayId').getBoundingClientRect();return {sameRow:Math.abs(a.top-b.top)<2,separate:b.left>a.left+100};});
 assert.deepEqual(pairing,{sameRow:true,separate:true},'Two-column approved field pairing');
 for(const name of ['owner','ownerId','displayId','createdAt','createdById','updatedById'])assert.equal(await page.locator('#mw-bl-page-form [name="'+name+'"]').count(),0,'Protected '+name);
 assert.equal(await beforeUnloadBlocked(),false);
 const first=page.locator('#mw-bl-page-form [name="name"]');await first.fill('Keep my unsaved text');
 await modal().locator('[data-bl-field-edit="code"]').click();assert.equal(await page.evaluate(()=>document.activeElement.name),'code');assert.equal(await first.inputValue(),'Keep my unsaved text','Edit shortcut retains the existing draft');
 let prompts=0;page.once('dialog',async d=>{prompts++;await d.dismiss();});await page.keyboard.press('Escape');assert.equal(await first.inputValue(),'Keep my unsaved text');assert.equal(prompts,1);
 page.once('dialog',async d=>{prompts++;await d.dismiss();});await page.locator('.mw-dialog-close').click();assert.equal(prompts,2);
 page.once('dialog',d=>d.accept());await page.locator('#bl-cancel').click();await page.locator('#bl-edit').waitFor();assert.equal(await modal().count(),1);checks.push('Read/Edit stay in one modal; protected fields read-only; Cancel/X/Escape preserve dirty work until confirmed');
 // Tabbing cannot escape the modal; close returns focus to a useful table control.
 await page.locator('#bl-edit').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('dialog')),true);
 await page.locator('.mw-dialog-close').focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('dialog')),true);
 await edit();await page.locator('#mw-bl-page-form [name="status"]').selectOption('Inactive');const puts=()=>requests.filter(r=>r.method==='PUT'&&/^business-lines\/[0-9]/.test(r.path)).length;
 const before=puts();await page.locator('#bl-save').click();assert.equal(puts(),before);await page.locator('#mw-bl-page-reason').fill('Confirmed lifecycle test');
 saveError=true;await page.locator('#bl-save').click();await page.locator('.mw-form-error:not([hidden])').waitFor();assert.match(await page.locator('.mw-form-error').innerText(),/changed elsewhere/);assert.equal(await page.locator('#mw-bl-page-reason').inputValue(),'Confirmed lifecycle test');assert.equal(await page.locator('#bl-save').isEnabled(),true);
 await page.screenshot({path:'work/browser/popup-edit-conflict-desktop.png'});
 holdSave=true;await page.locator('#bl-save').click();await page.waitForFunction(()=>document.querySelector('dialog')?.getAttribute('aria-busy')==='true');
 assert.equal(await page.locator('#bl-save').isDisabled(),true);assert.equal(await page.locator('#bl-cancel').isDisabled(),true);await page.keyboard.press('Escape');assert.equal(await modal().count(),1);
 assert.equal(await modal().locator('[data-bl-field-edit]:not(:disabled)').count(),0,'Field shortcuts are disabled during a write');
 assert.ok(releaseSave);releaseSave();await modal().waitFor({state:'detached'});await ready();assert.match(await page.locator('.mw-feedback').innerText(),/saved successfully/);assert.equal(await beforeUnloadBlocked(),false);assert.equal(await page.locator('[data-mw="home"]').getAttribute('aria-current'),'page');await openFirst();assert.match(await page.locator('.mw-bl-detail-heading').innerText(),/Inactive/);await page.waitForFunction(()=>document.querySelector('[data-bl-history]')?.textContent.includes('Popup regression evidence'));checks.push('Required lifecycle reason; 409 keeps draft; save controls and Escape locked in-flight; successful Save closes and reopening confirms values/audit');
 await page.locator('#bl-back').click();await modal().waitFor({state:'detached'});assert.equal(await page.evaluate(()=>document.activeElement!==document.body),true);assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('mw-modal-open')),false);
 // Record loading failures and independent audit errors are recoverable.
 readError=true;await page.locator('.mw-record-link:visible').first().click();await page.locator('[data-bl-retry]').waitFor();await page.locator('[data-bl-retry]').click();await page.locator('#bl-edit').waitFor();await page.locator('#bl-back').click();
 historyError=true;await openFirst();await page.locator('[data-bl-expand="1"]').click();await page.locator('[data-audit-retry]').waitFor();await assertFields();historyError=false;await page.locator('[data-audit-retry]').click();await page.waitForFunction(()=>document.querySelector('[data-bl-history]')?.textContent.includes('Popup regression evidence'));await page.locator('#bl-back').click();
 holdRead=true;await page.locator('.mw-record-link:visible').first().click();await modal().waitFor();await page.locator('.mw-dialog-close').click();while(!releaseRead)await new Promise(r=>setTimeout(r,5));releaseRead();await page.waitForTimeout(80);assert.equal(await modal().count(),0,'Late response cannot reopen a closed popup');checks.push('Record retry, audit-only failure and late-response-after-close handled safely');
 // Saving returns to the exact filtered/sorted page and preserves column choices.
 await page.locator('#crmSearchInput').fill('Framework');await page.locator('.scrm-identity').click({position:{x:5,y:5}});
 await page.waitForFunction(()=>document.querySelector('#mw-search')?.value==='Framework'&&document.querySelector('.mw-results')?.getAttribute('aria-busy')==='false');
 await page.locator('[data-mw="sort"][data-column="name"]').click();await ready();
 await page.getByRole('button',{name:'Next page',exact:true}).click();await ready();
 const beforeQuery={...requests.filter(r=>r.path==='business-lines'&&r.method==='GET').at(-1).query};
 const beforeColumns=await page.locator('.rf-table th[data-column-key]').evaluateAll(els=>els.map(e=>e.dataset.columnKey));
 await openFirst();await edit();await page.locator('#mw-bl-page-form [name="description"]').fill('Preserve page, search and sorting after save.');
 await page.locator('#bl-save').click();await modal().waitFor({state:'detached'});await ready();
 assert.equal(await page.locator('#crmSearchInput').inputValue(),'Framework');
 assert.deepEqual(requests.filter(r=>r.path==='business-lines'&&r.method==='GET').at(-1).query,beforeQuery);
 assert.deepEqual(await page.locator('.rf-table th[data-column-key]').evaluateAll(els=>els.map(e=>e.dataset.columnKey)),beforeColumns);
 assert.equal(await page.locator('.mw-feedback').isVisible(),true);assert.equal(await beforeUnloadBlocked(),false);
 // List refresh failure must not report a committed save as failed or repeat it.
 await openFirst();await edit();await page.locator('#mw-bl-page-form [name="description"]').fill('Write succeeds even when refresh fails.');
 const putsBeforeRefresh=puts();nextListFailure=true;await page.locator('#bl-save').click();await modal().waitFor({state:'detached'});
 await page.locator('.mw-results [data-mw="refresh"]').waitFor();assert.equal(puts(),putsBeforeRefresh+1);
 assert.match(await page.locator('.mw-feedback').innerText(),/saved successfully/);
 await page.locator('.mw-results [data-mw="refresh"]').click();await ready();assert.equal(puts(),putsBeforeRefresh+1);
 await page.locator('#crmSearchInput').fill('');await page.keyboard.press('Escape');
 await page.waitForFunction(()=>document.querySelector('#mw-search')?.value===''&&document.querySelector('.mw-results')?.getAttribute('aria-busy')==='false');
 // Create from Overview also returns to Overview and exposes success feedback.
 await page.locator('[data-mw="dashboard"]').click();await page.waitForFunction(()=>document.querySelector('[data-mw="dashboard"]')?.getAttribute('aria-current')==='page');
 await page.locator('[data-mw="create"]').click();await page.locator('#mw-record-form [name="name"]').fill('Created from Overview');await page.locator('#mw-record-form [name="code"]').fill('FROM-OVERVIEW');
 await page.locator('#mw-save').click();await modal().waitFor({state:'detached'});await ready();
 assert.equal(await page.locator('[data-mw="dashboard"]').getAttribute('aria-current'),'page');assert.equal(await page.locator('.mw-feedback').isVisible(),true);
 await page.locator('[data-mw="home"]').click();await ready();
 checks.push('Successful Save auto-closes, preserves filtered/sorted page/columns, distinguishes refresh failure; Create returns to Overview');
 // Realistic viewport constraints: footer stays visible with a scrolling content region.
 for(const {width,height} of [{width:1366,height:768},{width:1024,height:768},{width:1366,height:627},{width:700,height:800},{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
  await page.setViewportSize({width,height});await page.waitForTimeout(100);
  await page.locator('[data-mw="create"]').click();await assertModal('create '+width);await page.locator('#mw-cancel').click();
  await openFirst();await assertModal('read '+width);await page.locator('[data-bl-expand="1"]').click();
  if(width===390)await page.screenshot({path:'work/browser/popup-read-mobile.png'});
  await edit();await assertModal('edit '+width);await page.locator('[data-bl-expand="1"]').click();
  await page.locator('.mw-dialog-body').evaluate(el=>el.scrollTop=el.scrollHeight);await assertModal('scrolled edit '+width);
  assert.equal(await page.locator('#bl-save').isVisible(),true);
  if(width===390)await page.screenshot({path:'work/browser/popup-edit-mobile.png'});
  if(width===1366){await page.locator('.mw-dialog-body').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'work/browser/popup-edit-desktop.png'});}
  await page.locator('#bl-cancel').click();await page.locator('#bl-back').click();
 }
 checks.push('Create/Read/Edit at seven desktop, mobile and landscape sizes; inline or stacked field rows, red dismiss controls, no overflow and accessible footer');
 // Values at field limits, line breaks and unbroken text must wrap without data loss.
 const longRecord={...records[0]};records[0].name='LongBusinessLine'.repeat(10).slice(0,150);records[0].description=('First line\n'+ 'W'.repeat(480)).slice(0,500);
 await page.setViewportSize({width:1024,height:768});await openFirst();await page.locator('[data-bl-expand="1"]').click();await assertModal('read long values');
 assert.equal(await page.locator('.mw-bl-field-description .mw-bl-read-value').textContent(),records[0].description);
 await edit();await assertModal('edit long values');assert.equal(await page.locator('#mw-bl-page-form [name="name"]').inputValue(),records[0].name);
 await page.locator('#bl-cancel').click();await page.locator('#bl-back').click();Object.assign(records[0],longRecord);
 checks.push('Long values and multiline descriptions remain complete; protected fields stay plain read-only values');
 for(const lifecycle of ['archivedAt','deletedAt']){
  records[0][lifecycle]=now;await page.locator('.mw-record-link:visible').first().click();await page.locator('.mw-bl-field-name').waitFor();
  assert.equal(await modal().locator('[data-bl-field-edit]').count(),0,'No field editing for '+lifecycle);assert.equal(await page.locator('#bl-edit').count(),0);await page.locator('#bl-back').click();records[0][lifecycle]=null;
 }
 await page.setViewportSize({width:1366,height:768});
 permissions.create=false;permissions.edit=false;permissions.import=false;permissions.export=false;permissions.settings=false;
 await page.reload();await open();for(const tab of ['home','dashboard']){await page.locator('[data-mw="'+tab+'"]').click();await page.waitForTimeout(80);for(const selector of ['[data-mw="import"]','[data-mw="export"]','.mw-settings-menu','[data-mw="create"]'])assert.equal(await page.locator(selector+':visible').count(),0,'Denied actions remain hidden in '+tab);}
 await page.locator('[data-mw="home"]').click();await ready();await page.locator('.mw-record-link:visible').first().click();await page.locator('.mw-bl-field-name').waitFor();assert.equal(await page.locator('#bl-edit').count(),0);assert.equal(await page.locator('#bl-edit-top').count(),0);assert.equal(await modal().locator('[data-bl-field-edit]').count(),0);await page.locator('#bl-back').click();checks.push('Permission-denied controls stay hidden on both tabs and Read has no Edit action');
 assert.deepEqual(errors,[]);
 await import('node:fs/promises').then(fs=>fs.writeFile('work/browser/popup-review-report.json',JSON.stringify({status:'passed',checks,presentation},null,2)));
 console.log('PASS Business Lines popup review: '+checks.join('; '));
}finally{releaseRead?.();releaseSave?.();await browser.close();await new Promise(r=>server.close(r));}
