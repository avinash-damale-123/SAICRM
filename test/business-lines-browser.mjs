
import { createServer } from 'node:http';
import { readFile,mkdir } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=process.cwd();
const securityHeaders=JSON.parse(await readFile('vercel.json','utf8')).headers[0].headers;
const server=createServer(async(req,res)=>{
 try{
  for(const header of securityHeaders)res.setHeader(header.key,header.value);
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=resolve(base,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(base+'/')){res.writeHead(403);res.end();return}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'text/plain');
  res.end(await readFile(file));
 }catch{res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(4174,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
const now='2026-10-16T09:00:00.000Z';
const user={id:'11111111-1111-4111-8111-111111111111',name:'UI Super Admin',email:'ui-super@example.org',role:'admin',systemRole:'super_admin',status:'approved',emailVerified:true};
const line=(number)=>({id:'20000000-0000-4000-8000-'+String(number).padStart(12,'0'),displayId:'BL-'+String(number).padStart(3,'0'),name:number===1?'Line Alpha':number===2?'Line Bravo':'Line '+String(number).padStart(2,'0'),code:'BLTEST-'+number,description:'Fixture details '+number,isArchived:false,isDeleted:false,archivedById:null,deletedById:null,deletedAt:null,status:number<=25?'Active':'Inactive',ownerId:user.id,owner:user.name,createdById:user.id,createdBy:user.name,createdAt:now,updatedById:user.id,updatedBy:user.name,updatedAt:now,version:1,archivedAt:null});
const records=Array.from({length:30},(_,index)=>line(index+1));
const requests=[],exports=[],errors=[];
const fullPermissions=Object.fromEntries(['read','create','edit','archive','restore','export','history','search','filter','settings','dashboard'].map(key=>[key,true]));
let permissions={...fullPermissions,import:false,delete:false};
let nextId=31,failNext=false,unauthorizedNext=false,delayNext=false,zeroCounts=false,auditFailure=false,auditDelay=false;
function matching(query){
 const q=String(query.q||'').toLowerCase().trim().split(/\s+/).filter(Boolean),archive=query.archived||'exclude';
 let result=records.filter(record=>(archive==='all'||(archive==='only'?!!record.archivedAt:!record.archivedAt))&&(!query.status||query.status==='all'||record.status===query.status)&&q.every(word=>Object.values(record).some(value=>String(value).toLowerCase().includes(word))));
 const filters=typeof query.filters==='string'?JSON.parse(query.filters||'[]'):query.filters||[];
 for(const filter of filters)result=result.filter(record=>String(record[filter.field]??'').toLowerCase().includes(String(filter.value||'').toLowerCase()));
 const sort=query.sort||'updatedAt',direction=query.direction==='asc'?1:-1;
 return result.sort((a,b)=>direction*(String(a[sort]||'').localeCompare(String(b[sort]||''))||a.id.localeCompare(b.id)));
}
try{
 await mkdir('work/browser',{recursive:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.replace('/api/',''),method=request.method();
  const body=request.postData()?request.postDataJSON():null;
  requests.push({path,method,body,query:Object.fromEntries(url.searchParams)});
  let response={},status=200;
  if(path==='auth/me')response={user,csrf:'ui-csrf'};
  else if(path==='auth/options')response={googleEnabled:false};
  else if(path.startsWith('records/'))response={records:[],next:null};
  else if(path==='audit'){if(auditDelay){auditDelay=false;await new Promise(resolve=>setTimeout(resolve,600))}if(auditFailure){auditFailure=false;await route.fulfill({status:503,json:{error:'Fixture audit unavailable'}});return}response={audit:[]}}
  else if(path==='access')response={users:[],next:null};
  else if(path==='business-lines'&&method==='GET'){
   const query=Object.fromEntries(url.searchParams);
   if(unauthorizedNext){unauthorizedNext=false;await route.fulfill({status:401,json:{error:'Your session has expired'}});return}
   if(delayNext){delayNext=false;await new Promise(resolve=>setTimeout(resolve,600))}
   if(failNext){failNext=false;await route.fulfill({status:503,json:{error:'Fixture service temporarily unavailable'}});return}
   const result=matching(query),pageNumber=Number(query.page||1),pageSize=Number(query.pageSize||25);
   response={records:result.slice((pageNumber-1)*pageSize,pageNumber*pageSize),total:result.length,page:pageNumber,pageSize,totalPages:Math.max(1,Math.ceil(result.length/pageSize)),counts:{total:records.length,active:records.filter(record=>!record.archivedAt&&record.status==='Active').length,inactive:records.filter(record=>!record.archivedAt&&record.status==='Inactive').length,archived:records.filter(record=>record.archivedAt).length},owners:[user],permissions};
   if(zeroCounts)response={...response,records:[],total:0,totalPages:1,counts:{total:0,active:0,inactive:0,archived:0}};
   if(query.q==='Line Alpha')await new Promise(resolve=>setTimeout(resolve,900));
  }else if(path==='business-lines'&&method==='POST'){
   if(body.name.startsWith('Slow '))await new Promise(resolve=>setTimeout(resolve,500));
   const record={...line(nextId++),...body,status:'Active'};records.push(record);response={record};
  }else if(path==='business-lines/export'){
   exports.push(body);
   const selected=body.mode==='selected'?records.filter(record=>body.ids.includes(record.id)):body.mode==='all'?records:matching(body.query||{});
   response={csv:'Business Line Name\r\n'+selected.map(record=>record.name).join('\r\n'),filename:'business-lines-test.csv',count:selected.length};
  }else if(path.startsWith('business-lines/')){
   const [,id,action]=path.split('/'),record=records.find(record=>record.id===id);
   if(!record){status=404;response={error:'Record not found'}}
   else if(action==='history')response={history:[{id:1,actorId:user.id,actor:user.name,action:'Created',createdAt:now,changes:{name:{before:null,after:record.name}}}]};
   else if(action==='archive'||action==='restore'){record.archivedAt=action==='archive'?now:null;record.version++;response={record}}
   else if(method==='PUT'){Object.assign(record,body,{version:record.version+1});response={record}}
   else response={record};
  }else response={message:'Request accepted'};
  await route.fulfill({status,json:response});
 });
 const waitReady=async()=>{await page.waitForFunction(()=>document.querySelector('.mw-results')?.getAttribute('aria-busy')==='false')};
 const openBusiness=async()=>{await page.locator('[data-nav="businesslines"]').waitFor({state:'attached'});await page.evaluate(()=>{if(!window.__originalHeader)window.__originalHeader=Object.fromEntries(['#notifBtn','#focusModeBtn','#logoutBtn','.top-avatar'].map(selector=>{const node=document.querySelector(selector);return [selector,{node,parent:node.parentNode}]}));document.querySelector('[data-nav="businesslines"]').click()});await waitReady()};
 const search=async value=>{await page.locator('#crmSearchInput').fill(value);await page.locator('#crmSearchInput').press('Enter');await waitReady()};
 const refresh=async(wait=true)=>{
  // Exercise internal data reloading without reinstating the removed toolbar button.
  await page.evaluate(()=>{
   const button=document.createElement('button');button.type='button';button.dataset.mw='refresh';
   document.querySelector('.mw-workspace').append(button);button.click();button.remove();
  });
  if(wait)await waitReady();
 };
 const headerRestored=async()=>{
  assert.equal(await page.locator('.mw-module-header').count(),0);
  assert.ok(await page.evaluate(()=>Object.values(window.__originalHeader).every(({node})=>node.isConnected&&!!node.closest('.topbar')&&!node.closest('.mw-module-header'))),'Global controls must remain in the global top bar, not a module header');
  for(const selector of ['#notifBtn','#focusModeBtn','#logoutBtn','.top-avatar'])assert.equal(await page.locator(selector).count(),1,selector+' must remain unique');
 };
 const noOverflow=async label=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow: '+label);
 await page.goto('http://127.0.0.1:4174');
 await page.locator('#navigation [data-nav]').first().waitFor();
 await page.evaluate(()=>{window.__originalHeader=Object.fromEntries(['#notifBtn','#focusModeBtn','#logoutBtn','.top-avatar'].map(selector=>{const node=document.querySelector(selector);return [selector,{node,parent:node.parentNode}]}))});
 await openBusiness();
 assert.equal(await page.locator('#sidebar .brandmark').count(),0,'No logo in the sidebar');
 assert.equal((await page.locator('#sidebar .brand-copy').innerText()).trim(),'SCRM');
 assert.equal(await page.locator('#sidebar .brand-copy small').count(),0);
 assert.equal(await page.locator('#sidebar .profile-copy small').count(),0);
 assert.equal(await page.locator('#sidebarSignOut').count(),1);
 assert.equal(await page.locator('#menuBtn').evaluate(node=>!!node.closest('#sidebar .brand')),true,'Desktop toggle must be inside sidebar');
 assert.equal(await page.locator('.topbar #menuBtn').count(),0);
 assert.equal(await page.locator('.mw-module-header #mw-search').count(),1);
 const headerLayout=await page.evaluate(()=>{
  const host=document.querySelector('.crm-module-host'),row=document.querySelector('.crm-business-module');
  const box=selector=>document.querySelector(selector).getBoundingClientRect();
  return {direction:getComputedStyle(row).flexDirection,height:host.getBoundingClientRect().height,
   identityY:box('.crm-business-module .mw-module-identity').y,
   tabsY:box('.crm-business-module .mw-module-tabs').y,
   actionsY:box('.crm-business-module .mw-header-actions').y,
   tableY:box('.mw-home').y};
 });
 assert.equal(headerLayout.direction,'row','Business Lines must use horizontal flex direction');
 assert.ok(headerLayout.height<140,'Business Lines toolbar is too tall: '+JSON.stringify(headerLayout));
 assert.ok(headerLayout.identityY<headerLayout.tabsY,'Business Lines title should sit above Records/Dashboard toolbar: '+JSON.stringify(headerLayout));
 assert.equal(await page.locator('.scrm-bl-primary [data-mw="create"]').count(),1,'Add Business Line must remain a real button in the primary row');
 assert.equal(await page.locator('.scrm-tabs [data-mw="home"] .scrm-view-title').innerText(),'Records');
 assert.ok(Math.abs(headerLayout.tabsY-headerLayout.actionsY)<24,'Module actions are disconnected from tabs: '+JSON.stringify(headerLayout));
 const homeActive=await page.locator('[data-mw="home"]').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
 assert.equal(await page.locator('[data-mw="home"]').evaluate(el=>el.classList.contains('mw-active-tab')),true);
 assert.equal(homeActive.color,'rgb(7, 111, 67)','Records selected tab must be highlighted in Satguru green');

 assert.ok((await page.locator('.crm-profile-trigger').innerText()).includes(user.name));
 await page.locator('#notifBtn').click();await page.locator('#crmNoticeMenu:not([hidden])').waitFor();
 assert.ok((await page.locator('#crmNoticeMenu').innerText()).includes('Notifications'));await page.locator('#notifBtn').click();
 assert.equal(await page.locator('.mw-stats').count(),0);
 assert.equal(await page.locator('.mw-dashboard:visible').count(),0);
 assert.equal(await page.locator('#mw-filter-controls').isHidden(),true);
 await page.keyboard.press('Control+k');
 assert.equal(await page.locator('#crmSearchInput').evaluate(node=>document.activeElement===node),true);
 const headerControls=await page.locator('.mw-module-header').evaluate(node=>Array.from(node.querySelectorAll('[data-mw="export"],[data-mw="filter-toggle"],.mw-settings-menu,#notifBtn,#focusModeBtn,.mw-account-menu,[data-mw="create"]')).map(element=>element.dataset.mw||element.id||element.className));
 assert.ok(headerControls.includes('export')&&headerControls.includes('filter-toggle')&&headerControls.includes('create'),'All original actions must remain present');
 await page.locator('[data-mw="dashboard"]').click();
 // The hovered selected tab intentionally uses #075b33, matching Add button hover.
 // Move the pointer away to assert the resting selected color #087b40.
 await page.mouse.move(0,0);
 await page.waitForFunction(()=>{
  const button=document.querySelector('.crm-business-module [data-mw="dashboard"]');
  return button?.classList.contains('mw-active-tab') && document.querySelector('.mw-dashboard')?.hidden===false && getComputedStyle(button).color==='rgb(7, 111, 67)';
 });
 assert.equal(await page.locator('.mw-table').isVisible(),false);
 const dashboard=page.locator('.mw-dashboard');
 assert.equal(await dashboard.isVisible(),true);
 for(const [metric,count]of Object.entries({total:30,active:25,inactive:5,archived:0}))assert.equal(await dashboard.locator('.mw-dashboard-metric-'+metric+' > strong').innerText(),String(count));
 assert.equal(await dashboard.locator('.mw-donut[role="img"]').count(),1);
 assert.equal(await dashboard.locator('.mw-status-chart').count(),1);
 await page.screenshot({animations:'disabled',path:'work/browser/header-dashboard-1440.jpg',type:'jpeg',quality:40});
 await page.locator('[data-mw="home"]').click();
 await page.mouse.move(0,0);
 await page.waitForFunction(()=>{
  const button=document.querySelector('.crm-business-module [data-mw="home"]');
  return button?.classList.contains('mw-active-tab') && getComputedStyle(button).color==='rgb(7, 111, 67)';
 });
 await page.screenshot({animations:'disabled',path:'work/browser/header-home-1440.jpg',type:'jpeg',quality:40});
 await page.screenshot({animations:'disabled',path:'work/browser/header-home-crop.jpg',type:'jpeg',quality:30,clip:{x:0,y:0,width:1440,height:240}});
 assert.equal(await page.locator('.mw-table').isVisible(),true);
 assert.equal(await page.locator('.mw-table tbody tr').count(),25);
 assert.match(await page.locator('.mw-range').innerText(),/1–25 of 30/);
 assert.equal(await page.locator('[data-mw="import"]:visible').count(),0,'Import remains hidden without module import permission');
 for(const width of [320,360,768,1100,1440]){
  await page.setViewportSize({width,height:850});await noOverflow('list '+width);
  if(width>=1100){
   const h=await page.locator('.crm-module-host').evaluate(el=>el.getBoundingClientRect().height);
   assert.ok(h<175,'Header must stay compact on '+width+'px laptop/desktop: '+h);
  }

  const toggle = width < 768 ? '#mobileMenuBtn' : '#menuBtn';
  assert.equal(await page.locator(toggle).isVisible(),true,'Accessible navigation toggle at '+width);
  await page.locator(toggle).click();await noOverflow('alternate sidebar '+width);
  if(width<768){await page.locator('#closeNav').click();assert.equal(await page.locator('#sidebar').evaluate(node=>node.classList.contains('open')),false);assert.equal(await page.locator('#navBackdrop').evaluate(node=>node.hidden),true)}else await page.locator('#menuBtn').click();
  await noOverflow('restored sidebar '+width);
  await page.screenshot({animations:'disabled',path:'work/browser/business-lines-header-'+width+'.png',fullPage:true});
  if(width===320)await page.screenshot({animations:'disabled',path:'work/browser/header-home-320.jpg',type:'jpeg',quality:40});
 }
 await page.setViewportSize({width:1440,height:900});
 await page.locator('#focusModeBtn').click();assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement)),true);
 await page.locator('#focusModeBtn').click();assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement)),false);
 await page.setViewportSize({width:1440,height:900});
 await page.locator('[data-select]').first().check();
 await page.getByRole('button',{name:'Next page',exact:true}).click();await waitReady();
 assert.equal(await page.locator('.mw-table tbody tr').count(),5);
 await page.locator('[data-select]').first().check();
 assert.match(await page.locator('.mw-selection').innerText(),/2 records selected across pages/);
 await page.locator('[data-mw="export-selected"]').click();
 const downloadPromise=page.waitForEvent('download');await page.locator('#mw-export-download').click();
 const download=await downloadPromise;
 assert.ok((await readFile(await download.path(),'utf8')).includes('Line '));
 assert.equal(exports.at(-1).mode,'selected');assert.equal(exports.at(-1).ids.length,2);assert.equal(Object.hasOwn(exports.at(-1),'columns'),false);
 await page.locator('[data-mw="clear-selection"]').click();
 assert.equal(await page.locator('.mw-selection').isHidden(),true);
 await page.locator('[data-mw="filter-toggle"]').click();await page.locator('#mw-filter-controls').waitFor();
 await page.locator('#mw-status').selectOption('Inactive');await waitReady();
 await search('Line');
 assert.equal(await page.locator('.mw-table tbody tr').count(),5);
 await search('');
 assert.equal(await page.locator('#mw-status').inputValue(),'Inactive');
 assert.equal(await page.locator('.mw-table tbody tr').count(),5);
 await page.locator('#mw-status').selectOption('all');await waitReady();
 await page.locator('[data-mw="filters"]').click();await page.locator('#mw-filter-add').click();
 await page.locator('[data-filter-field="0"]').selectOption('name');
 await page.locator('[data-filter-value="0"]').fill('Bravo');await page.locator('#mw-filters-apply').click();await waitReady();
 assert.equal(await page.locator('.mw-record-link').innerText(),'Line Bravo');
 await search('Line');await search('');
 assert.equal(await page.locator('.mw-record-link').innerText(),'Line Bravo');
 assert.ok((await page.locator('.mw-query-summary').innerText()).includes('Bravo'));
 await page.locator('[data-mw="clear-filters"]').click();await waitReady();
 // Dedicated record navigation must traverse the server-paginated filtered list.
 await page.locator('.mw-record-link').last().click();
 await page.locator('.mw-bl-detail-heading h2').waitFor();
 const edgeName=await page.locator('.mw-bl-detail-heading h2').innerText();
 await page.locator('[data-bl-next]').click();
 await page.waitForFunction(previous=>document.querySelector('.mw-bl-detail-heading h2')?.textContent!==previous,edgeName);
 assert.equal(await page.locator('.mw-bl-detail-page').count(),1);
 await page.locator('#bl-back').click();await waitReady();
 assert.equal(await page.locator('.mw-table tbody tr').count(),5,'Previous/Next should move to the adjacent results page');
 // A delayed older search response must not replace the newer results.
 const slowRequest=page.waitForRequest(request=>request.url().includes('/business-lines?')&&new URL(request.url()).searchParams.get('q')==='Line Alpha');
 await page.locator('#crmSearchInput').fill('Line Alpha');await page.locator('#crmSearchInput').press('Enter');await slowRequest;
 await page.locator('#crmSearchInput').fill('Line Bravo');await page.locator('#crmSearchInput').press('Enter');await waitReady();
 await page.waitForTimeout(1000);
 assert.equal(await page.locator('.mw-record-link').innerText(),'Line Bravo');
 await page.locator('.mw-record-link').click();
 await page.locator('.mw-bl-section summary').filter({hasText:'Audit History'}).waitFor();
 await page.locator('[data-bl-expand="1"]').click();
 assert.ok((await page.locator('.mw-bl-detail-page').innerText()).includes('UI Super Admin'));
 assert.equal(await page.locator('.mw-bl-detail-page .mw-bl-field').count(),19,'Dedicated Read must display all 19 master fields');
 for(const width of [320,360,768,1440]){await page.setViewportSize({width,height:850});await noOverflow('read '+width)}
 await page.locator('#bl-edit').click();
 assert.equal(await page.locator('#mw-bl-page-form [name="name"]').inputValue(),'Line Bravo');
 assert.equal(await page.locator('.mw-bl-detail-page .mw-bl-field').count(),19,'Inline Edit retains all nineteen fields');
 const updatesBefore=requests.filter(request=>request.method==='PUT'&&request.path.startsWith('business-lines/')).length;
 await page.locator('#mw-bl-page-form [name="status"]').selectOption('Inactive');
 assert.equal(await page.locator('#mw-bl-page-reason').isVisible(),true);
 await page.locator('#bl-save').click();
 assert.equal(requests.filter(request=>request.method==='PUT'&&request.path.startsWith('business-lines/')).length,updatesBefore,'Status must not update without mandatory reason');
 await page.locator('#mw-bl-page-form [name="status"]').selectOption('Active');
 await page.locator('#mw-bl-page-form [name="name"]').fill('Line Bravo Updated');
 await page.locator('#mw-bl-page-form [name="description"]').fill('Saved UI context');
 await page.locator('#bl-save').click();await page.locator('#mw-bl-page-form').waitFor({state:'detached'});await waitReady();
 assert.equal(await page.locator('.mw-bl-detail-page .mw-bl-field').count(),19,'Saved record retains all fields');
 await page.locator('#bl-back').click();
 assert.equal(await page.locator('#mw-search').inputValue(),'Line Bravo');
 assert.equal(await page.locator('.mw-record-link').innerText(),'Line Bravo Updated');
 await page.locator('[data-mw="create"]').click();
 const createsBefore=requests.filter(request=>request.path==='business-lines'&&request.method==='POST').length;
 await page.locator('#mw-record-form [name="name"]').fill('   ');await page.locator('#mw-save').click();
 assert.equal(requests.filter(request=>request.path==='business-lines'&&request.method==='POST').length,createsBefore);
 await page.locator('#mw-record-form [name="name"]').fill('New UI Business');await page.locator('#mw-record-form [name="code"]').fill('UI-NEW');
 for(const width of [320,360,768,1440]){await page.setViewportSize({width,height:850});await noOverflow('create '+width)}
 await page.locator('#mw-save').click();await page.locator('dialog').waitFor({state:'detached'});await waitReady();
 assert.ok(records.some(record=>record.name==='New UI Business'));
 await page.locator('.mw-row-menu summary').click();await page.locator('.mw-row-menu [data-mw="archive"]').click();
 await page.locator('#mw-lifecycle-reason').fill('Reviewed and approved');await page.locator('#mw-archive-confirm').click();await page.locator('dialog').waitFor({state:'detached'});await waitReady();
 assert.equal(await page.locator('.mw-record-link').count(),0);
 await page.locator('#mw-archived').selectOption('only');await waitReady();
 assert.equal(await page.locator('.mw-record-link').innerText(),'Line Bravo Updated');
 await page.locator('.mw-row-menu summary').click();await page.locator('.mw-row-menu [data-mw="restore"]').click();
 await page.locator('#mw-lifecycle-reason').fill('Reviewed and approved');await page.locator('#mw-archive-confirm').click();await page.locator('dialog').waitFor({state:'detached'});await waitReady();
 assert.equal(await page.locator('.mw-record-link').count(),0);
 await page.locator('#mw-archived').selectOption('exclude');await waitReady();
 assert.equal(await page.locator('.mw-record-link').innerText(),'Line Bravo Updated');
 await page.locator('.mw-settings-menu > summary').click();
 assert.equal(await page.locator('.mw-settings-menu [data-mw]').first().getAttribute('data-mw'),'columns');
 await page.locator('.mw-settings-menu [data-mw="columns"]').click();
 assert.equal(await page.locator('[data-column-check="name"]').isDisabled(),true);
 await page.locator('[data-column-check="owner"]').uncheck();await page.locator('[data-column-check="description"]').check();await page.locator('#mw-freeze').uncheck();
 await page.locator('#mw-columns-save').click();
 await page.reload();await openBusiness();
 const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('scrm:view:11111111-1111-4111-8111-111111111111:business-lines')));
 assert.equal(prefs.columns.includes('owner'),false);assert.equal(prefs.columns.includes('description'),true);assert.equal(prefs.freeze,false);
 assert.equal(await page.locator('thead [data-column="owner"]').count(),0);
 assert.equal(await page.locator('thead [data-column="description"]').count(),1);
 for(const mode of ['default','my','all']){
  await page.locator('[data-mw="export"]').click();await page.locator('#mw-export-form input[value="'+mode+'"]').check();
  const pendingDownload=page.waitForEvent('download');await page.locator('#mw-export-download').click();await pendingDownload;
  assert.equal(exports.at(-1).mode,mode);
  assert.equal(Object.hasOwn(exports.at(-1),'columns'),mode==='my');
  if(mode==='my')assert.deepEqual(exports.at(-1).columns,prefs.columns);
 }
 failNext=true;await refresh();
 assert.ok((await page.locator('.mw-results').innerText()).includes('We couldn’t load these records'));
 assert.equal((await page.locator('.mw-results').innerText()).includes('No business lines yet'),false);
 await page.locator('.mw-results [data-mw="refresh"]').click();await waitReady();
 assert.equal(await page.locator('.mw-table tbody tr').count(),25);
 await page.locator('[data-mw="create"]').click();await page.locator('#mw-record-form [name="name"]').fill('Unsaved Business');
 page.once('dialog',dialog=>dialog.dismiss());await page.evaluate(()=>document.querySelector('[data-nav="overview"]').click());
 assert.equal(await page.locator('dialog').isVisible(),true);
 assert.equal(await page.locator('#mw-record-form [name="name"]').inputValue(),'Unsaved Business');
 assert.equal(await page.locator('.mw-module-header #mw-search').count(),1);
 const logoutBefore=requests.filter(request=>request.path==='auth/logout').length;
 page.once('dialog',dialog=>dialog.dismiss());await page.evaluate(()=>document.querySelector('#logoutBtn').click());
 assert.equal(requests.filter(request=>request.path==='auth/logout').length,logoutBefore);
 assert.equal(await page.locator('dialog').isVisible(),true);
 assert.equal(await page.locator('.mw-module-header').count(),1);
 page.once('dialog',dialog=>dialog.accept());await page.evaluate(()=>document.querySelector('[data-nav="overview"]').click());
 await page.locator('dialog').waitFor({state:'detached'});assert.equal(await page.locator('.mw-workspace').count(),0);
 await headerRestored();
 await openBusiness();
 await page.locator('[data-mw="create"]').click();await page.locator('#mw-record-form [name="name"]').fill('Slow Saved Business');await page.locator('#mw-record-form [name="code"]').fill('UI-SLOW');
 const saving=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname==='/api/business-lines');
 await page.locator('#mw-save').click();await saving;
 await page.evaluate(()=>document.querySelector('[data-nav="overview"]').click());
 assert.equal(await page.locator('dialog').isVisible(),true);
 assert.equal(await page.locator('#mw-save').isDisabled(),true);
 await page.locator('dialog').waitFor({state:'detached'});await waitReady();
 assert.ok(records.some(record=>record.name==='Slow Saved Business'));
 await page.locator('[data-mw="create"]').click();await page.locator('#mw-record-form [name="name"]').fill('Slow Teardown Business');await page.locator('#mw-record-form [name="code"]').fill('UI-TEARDOWN');
 const teardownSave=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname==='/api/business-lines');
 await page.locator('#mw-save').click();await teardownSave;
 await page.evaluate(()=>{window.SCRM.activeWorkspace.destroy(true);document.querySelector('[data-nav="overview"]').click()});
 await page.waitForTimeout(650);
 assert.equal(await page.locator('.mw-workspace').count(),0);
 assert.equal(await page.locator('dialog').count(),0);
 await headerRestored();
 // Repeated mounts preserve global controls and their fullscreen handler.
 for(let repeat=0;repeat<2;repeat++){
  await openBusiness();
  for(const selector of ['#notifBtn','#focusModeBtn','#logoutBtn','.top-avatar'])assert.equal(await page.locator(selector).count(),1);
  await page.evaluate(()=>document.querySelector('[data-nav="overview"]').click());await headerRestored();
 }
 await page.locator('#focusModeBtn').click();assert.equal(await page.evaluate(()=>Boolean(document.fullscreenElement)),true);
 await page.locator('#focusModeBtn').click();
 await openBusiness();
 // A slower Audit fetch cannot overwrite a newer navigation decision.
 auditDelay=true;
 const pendingAudit=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/audit');
 await page.evaluate(()=>document.querySelector('[data-nav="audit"]').click());await pendingAudit;
 await page.evaluate(()=>document.querySelector('[data-nav="overview"]').click());await page.waitForTimeout(700);await headerRestored();
 await openBusiness();
 // Late list/capability responses cannot recreate a departed module header.
 delayNext=true;
 const delayed=page.waitForRequest(request=>request.method()==='GET'&&new URL(request.url()).pathname==='/api/business-lines');
 // This case tests a late API reply, not Settings-menu pointer interactions.
 await refresh(false);await delayed;
 await page.evaluate(()=>document.querySelector('[data-nav="overview"]').click());await page.waitForTimeout(700);await headerRestored();
 await openBusiness();
 // Failure is distinct from a successful response containing zero counts.
 await page.locator('[data-mw="dashboard"]').click();failNext=true;await refresh();
 assert.match(await page.locator('.mw-dashboard').innerText(),/unavailable|couldn.t|failed/i);
 zeroCounts=true;await refresh();
 assert.ok((await page.locator('.mw-dashboard').innerText()).includes('0'));
 zeroCounts=false;await refresh();
 assert.ok((await page.locator('.mw-dashboard').innerText()).includes(String(records.length)));
 await page.locator('[data-mw="home"]').click();
 // A failed navigation fetch preserves the current module and its header.
 auditFailure=true;
 const auditFailureResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/audit');
 await page.evaluate(()=>document.querySelector('[data-nav="audit"]').click());await auditFailureResponse;
 await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('Fixture audit unavailable'));
 assert.equal(await page.locator('.mw-module-header #mw-search').count(),1);
 assert.equal(await page.locator('.mw-table').isVisible(),true);
 await page.keyboard.press('Control+k');assert.equal(await page.locator('#crmSearchInput').evaluate(node=>document.activeElement===node),true);
 // Initial load errors permit retry before capabilities have been fetched.
 failNext=true;await page.reload();await openBusiness();
 assert.ok((await page.locator('.mw-results').innerText()).includes('We couldn’t load these records'));
 await page.locator('.mw-results [data-mw="refresh"]').click();await waitReady();
 assert.equal(await page.locator('.mw-table').isVisible(),true);
 // Permission fixtures exercise the UI contract without changing backend policy.
 permissions={read:true,history:false,search:true,create:false,edit:false,archive:false,restore:false,export:false,filter:false,settings:false,dashboard:false,import:false,delete:false};
 await page.reload();await openBusiness();
 assert.equal(await page.locator('.scrm-bl-clean.scrm-no-tabs').count(),1,'Restricted view must reclaim tab bar space');
 for(const selector of ['[data-mw="create"]','[data-mw="export"]','[data-mw="filter-toggle"]','.mw-settings-menu','[data-mw="dashboard"]','[data-mw="import"]'])assert.equal(await page.locator(selector+':visible').count(),0,selector+' should be denied');
 const historyRequests=requests.filter(request=>request.path.endsWith('/history')).length;
 await page.locator('.mw-record-link').first().click();await page.locator('.mw-bl-section summary').filter({hasText:'Basic Information'}).waitFor();
 assert.equal(requests.filter(request=>request.path.endsWith('/history')).length,historyRequests);
 assert.equal(await page.locator('#bl-edit').count(),0);
 await page.locator('#bl-back').click();
 const beforeDenied=requests.filter(request=>request.method!=='GET').length;
 for(const action of ['create','export','filters','columns','dashboard']){
  await page.evaluate(action=>{const button=document.createElement('button');button.dataset.mw=action;button.textContent='Denied probe';document.querySelector('.mw-workspace').append(button);button.click();button.remove()},action);
  assert.equal(await page.locator('dialog').count(),0,action+' must be guarded in handlers');
 }
 assert.equal(requests.filter(request=>request.method!=='GET').length,beforeDenied);
 assert.equal(await page.locator('.mw-table').isVisible(),true);
 assert.equal(await page.locator('.mw-dashboard:visible').count(),0);
 permissions=undefined;await page.reload();await openBusiness();
 assert.equal(await page.locator('[data-mw="create"]:visible').count(),0);
 assert.equal(await page.locator('.mw-table:visible').count(),0);
 assert.equal(await page.locator('#mw-search:visible').count(),0);
 permissions={...fullPermissions,import:false,delete:false};await page.reload();await openBusiness();
 unauthorizedNext=true;await refresh(false);
 await page.locator('#authEmail').waitFor();
 await headerRestored();
 assert.deepEqual(errors,[]);
 console.log('Business Lines browser checks passed: module header, Home/Dashboard, five responsive widths, sidebar/fullscreen, permissions, selection/export, search/filters, forms and lifecycle');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
