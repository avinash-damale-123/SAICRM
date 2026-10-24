import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {baseline,effectivePolicy,reconcilePreferences} from '../server/records-policy.mjs';
import {publicColumns} from '../server/records-schema.mjs';
import {importFields,fileLimits} from '../server/records-files.mjs';
const base=process.cwd(),out='work/browser/visual';await mkdir(out,{recursive:true});
const headers=JSON.parse(await readFile('vercel.json','utf8')).headers[0].headers;
const server=createServer(async(req,res)=>{try{
 for(const h of headers)res.setHeader(h.key,h.value);
 const pathname=new URL(req.url,'http://localhost').pathname;
 const path=resolve(base,'.'+(pathname==='/'?'/index.html':pathname));
 if(!path.startsWith(base+'/')){res.writeHead(403);res.end();return;}
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp'})[extname(path)]||'application/octet-stream');
 res.end(await readFile(path));
}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
const metrics=[],menuBounds=[],errors=[],requests=[];
const user={id:'11111111-1111-4111-8111-111111111111',name:'CRM SuperAdmin',email:'visual-test@example.org',role:'admin',systemRole:'super_admin',status:'approved',emailVerified:true};
const names=['STTS','T3','GSA'];
const lines=names.map((name,i)=>({id:`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,displayId:`BL-00${i+1}`,code:`HEADER-${i+1}`,name,description:'Header layout fixture',status:'Active',owner:user.name,ownerId:user.id,createdBy:user.name,createdById:user.id,updatedBy:user.name,updatedById:user.id,createdAt:'2026-10-19T06:00:00Z',updatedAt:'2026-10-19T07:38:00Z',remarks:'',archivedAt:null,version:1}));
const perms=Object.fromEntries(['read','create','edit','archive','restore','export','import','history','search','filter','settings','dashboard'].map(k=>[k,true]));
const policy=effectivePolicy({version:0,publishedVersion:0,config:baseline(),draft:null},{...user,system_role:'super_admin',email_verified:true});
let preferenceVersion=0,storedPreferences=null;
const preferences=()=>({version:preferenceVersion,...reconcilePreferences(storedPreferences,policy)});
const records=Object.fromEntries(['leads','customers','contacts','opportunities','activities','quotes','bookings','employees','branches'].map(m=>[m,[{id:'fixture-'+m,name:'Lagos sample '+m,subject:'Lagos meeting',contact:'Travel coordinator',organisation:'Sample travel company',type:'Corporate',identity:'Organisation',category:'Corporate',line:'STTS',branch:'Pune',country:'India',email:'test@example.org',status:'Active',stage:'Discovery',value:2000,version:1,scopeBranch:'PUNE',scopeLine:'STTS'}]]));
let deny=false,page;
try{
 page=await browser.newPage({viewport:{width:1366,height:627},timezoneId:'Asia/Kolkata'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.slice(5);requests.push({path,method:req.method()});
  let data={};
  if(path==='auth/me')data={user,csrf:'visual-test-only'};
  else if(path==='auth/options')data={googleEnabled:false};
  else if(path.startsWith('records/'))data={records:records[path.split('/')[1]]||[],next:null};
  else if(path==='notifications')data={items:[]};
  else if(path==='access')data={users:[],next:null};
  else if(path==='audit')data={audit:[]};
  else if(path==='search'){
   data={results:url.searchParams.get('scope')==='global'?[{id:'fixture-contacts',module:'contacts',title:'Lagos sample contacts',detail:'Sample travel company',status:'Active'}]:[],query:url.searchParams.get('q')};
  }else if(path==='business-lines'){
   const q=(url.searchParams.get('q')||'').toLowerCase();const found=lines.filter(l=>l.name.toLowerCase().includes(q));
   data={records:found,total:found.length,totalPages:1,counts:{total:3,active:3,inactive:0,archived:0},owners:[user],permissions:deny?{read:true,search:true}:perms,resource:{frameworkVersion:1,columns:publicColumns(),limits:{}},ui:{policy,preferences:preferences()}};
  }else if(path==='business-lines/framework'){
   data={version:1,fields:publicColumns(),importFields,limits:fileLimits,policy,preferences:preferences(),permissions:deny?{read:true,search:true}:perms};
  }else if(path==='business-lines/preferences'){
   if(req.method()==='PUT'){const body=req.postDataJSON();assert.equal(body.version,preferenceVersion);storedPreferences=body.data;preferenceVersion++;}
   data={policy,preferences:preferences()};
  }else if(path.startsWith('business-lines/')){
   const [,id,action]=path.split('/');data=action==='history'?{history:[]}:{record:lines.find(l=>l.id===id)||lines[0]};
  }
  await route.fulfill({json:data});
 });
 await page.goto('http://127.0.0.1:'+server.address().port);await page.locator('#crmSearchInput').waitFor();
 const ready=()=>page.waitForFunction(()=>document.querySelector('.mw-results')?.getAttribute('aria-busy')==='false'&&!!document.querySelector('.rf-table'));
 const open=async m=>{await page.evaluate(m=>document.querySelector('[data-nav="'+m+'"]').click(),m);await page.locator('.scrm-workbar').waitFor();if(m==='businesslines')await ready();};
 const setCollapsed=async collapsed=>{
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  if(await page.locator('html').evaluate(e=>e.classList.contains('nav-collapsed'))!==collapsed)await page.locator('#menuBtn').click();
  await page.waitForFunction(value=>document.documentElement.classList.contains('nav-collapsed')===value,collapsed);
 };
 const measure=async(name)=>{
  await page.mouse.move(0,0);await page.waitForTimeout(300);
  const r=await page.evaluate(()=>{
   const box=s=>{const n=document.querySelector(s);if(!n)return null;const b=n.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height};};
   const tabs=[...document.querySelectorAll('.scrm-tabs>.scrm-view')].filter(e=>e.getBoundingClientRect().height>0);
   const controls=[...document.querySelectorAll('.scrm-actions>.scrm-action,.scrm-actions>details>.scrm-action')].filter(e=>e.getBoundingClientRect().height>0);
   return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,collapsed:document.documentElement.classList.contains('nav-collapsed'),main:box('.main'),bar:box('.scrm-workbar'),identity:box('.scrm-identity'),tabs:box('.scrm-tabs'),search:box('.scrm-search'),input:box('#crmSearchInput'),actions:box('.scrm-actions'),primary:box('.scrm-bl-primary'),bell:box('#notifBtn'),focus:box('#focusModeBtn'),profile:box('.crm-profile'),top:box('.topbar'),topSearch:!!document.querySelector('.topbar #crmSearchInput'),searchBeforeBell:document.getElementById('globalSearchBtn')?.nextElementSibling?.id==='notifBtn',tabTreatments:tabs.map(e=>({label:e.textContent.trim(),active:e.getAttribute('aria-current')==='page',background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color,font:parseFloat(getComputedStyle(e.querySelector('strong')).fontSize)})),tabRail:document.querySelector('.scrm-tabs')?{background:getComputedStyle(document.querySelector('.scrm-tabs')).backgroundColor,border:getComputedStyle(document.querySelector('.scrm-tabs')).borderTopWidth}:null,controlOrder:controls.map(e=>e.querySelector('.scrm-action-label')?.textContent),controls:controls.map(e=>{const b=e.getBoundingClientRect(),label=e.querySelector('.scrm-action-label'),l=label.getBoundingClientRect();return{label:label.textContent,x:b.x,y:b.y,w:b.width,h:b.height,labelFits:l.left>=b.left&&l.right<=b.right+1&&l.top>=b.top&&l.bottom<=b.bottom+1};}),tabsText:[...document.querySelectorAll('.scrm-view-context')].map(e=>({text:e.textContent,visible:e.getBoundingClientRect().height>0})),inputCount:document.querySelectorAll('#crmSearchInput').length};
  });metrics.push({name,...r});
  assert.equal(r.overflow,false,name+' overflow '+JSON.stringify(r));
  assert.equal(r.inputCount,1,name+' must have one shared search');
  assert.ok(r.input.w>=100,name+' typing area collapsed '+JSON.stringify(r));
  assert.ok(r.search.w>=240,name+' search container collapsed '+JSON.stringify(r));
  assert.ok(r.input.x+r.input.w<=r.search.x+r.search.w,name+' input overflows its own search box');
  assert.ok(r.tabsText.every(x=>!x.visible),name+' should use compact single-line tab labels');
  assert.ok(r.bell.x<r.focus.x&&r.focus.x<r.profile.x,name+' global control order');
  if(r.topSearch){
   assert.equal(r.searchBeforeBell,true,name+' search is immediately before the bell');assert.ok(r.search.y>=r.top.y&&r.search.y+r.search.h<=r.top.y+r.top.h+1,name+' search inside topbar');
   const active=r.tabTreatments.filter(t=>t.active),inactive=r.tabTreatments.filter(t=>!t.active);
   assert.equal(active.length,1,name+' has one current tab');assert.equal(inactive.length,1,name+' also exposes the alternative view');
   assert.ok(active.every(t=>t.background==='rgb(8, 123, 64)'&&t.color==='rgb(255, 255, 255)'),name+' active tab has a filled green highlight');
   assert.ok(inactive.every(t=>t.color!==active[0].color&&t.background!==active[0].background&&t.font>=12),name+' inactive tab remains readable and visually distinct');
   assert.ok(!['transparent','rgba(0, 0, 0, 0)'].includes(r.tabRail.background)&&parseFloat(r.tabRail.border)>=1,name+' both tabs have a visible segmented rail');
   assert.deepEqual(r.controlOrder,['Import','Export','Filter','Customize'],name+' command order');
   assert.ok(r.controls.every(c=>c.labelFits&&c.x>=r.bar.x&&c.x+c.w<=r.bar.x+r.bar.w+1),name+' complete action labels remain within the header');
   const groups=[r.identity,r.tabs,r.actions,r.primary];
   assert.ok(groups.every(g=>g.w>0&&g.h>0&&g.x>=r.bar.x&&g.x+g.w<=r.bar.x+r.bar.w+1&&g.y>=r.bar.y&&g.y+g.h<=r.bar.y+r.bar.h+1),name+' title, tabs, actions and Add remain visible inside the header');
   assert.ok(groups.every((a,i)=>groups.slice(i+1).every(b=>Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)<=1||Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)<=1)),name+' wrapped header groups never overlap: '+JSON.stringify(groups));
   if(r.main.w>=1024){
    assert.ok(Math.min(...groups.map(g=>g.y+g.h))-Math.max(...groups.map(g=>g.y))>=25,name+' title, tabs, actions and Add share one row: '+JSON.stringify(groups));
    assert.ok(groups.every((g,i)=>!i||g.x>=groups[i-1].x+groups[i-1].w-1),name+' one-row groups do not overlap');
    assert.ok(r.bar.h<=64,name+' single-row header stays compact');
   }
   if(r.main.w>960)assert.ok(r.search.x+r.search.w<=r.bell.x,name+' search does not overlap bell');
  }
  else if(r.main.w>1000){assert.ok(Math.abs(r.tabs.y-r.search.y)<15,name+' search alignment');assert.ok(r.input.w>=120,name+' laptop input too small '+JSON.stringify(r));assert.ok(r.search.x-(r.tabs.x+r.tabs.w)<25,name+' gap wastes search area');}
  return r;
 };
 await open('businesslines');await measure('Business Lines Records laptop expanded');
 await page.screenshot({path:out+'/home-laptop.png'});
 const header=page.locator('.scrm-workbar');
 const keyboardOrder=['[data-mw="home"]','[data-mw="dashboard"]','[data-mw="import"]','[data-mw="export"]','[data-mw="filter-toggle"]','.mw-settings-menu>summary','[data-mw="create"]'];
 await header.locator(keyboardOrder[0]).focus();
 for(const [index,selector]of keyboardOrder.entries()){
  const control=header.locator(selector);
  assert.equal(await control.evaluate(e=>e===document.activeElement),true,'Keyboard order follows the visible header: '+selector);
  assert.ok((await control.getAttribute('title'))?.trim(),'Every compact control retains a descriptive hover label: '+selector);
  if(index<keyboardOrder.length-1)await page.keyboard.press('Tab');
 }
 assert.match(await header.locator('.mw-settings-menu>summary').getAttribute('aria-label'),/Customize/i,'Customize has an accessible name matching its visible label');
 assert.match(await header.locator('[data-mw="create"]').getAttribute('aria-label'),/Business Line/i,'Add remains explicitly named for keyboard and assistive users');
 await page.evaluate(()=>window.__headerSearchNode=document.getElementById('crmSearchInput'));
 await page.keyboard.press('Control+k');assert.equal(await page.locator('#crmSearchInput').evaluate(e=>e===document.activeElement),true);
 await page.locator('#crmSearchInput').fill('STTS');await page.waitForFunction(()=>document.querySelector('.mw-results')?.getAttribute('aria-busy')==='false'&&document.querySelectorAll('.rf-table tbody tr').length===1);
 await page.keyboard.press('Escape');
 await header.locator('[data-mw="dashboard"]').press('Enter');
 await page.waitForFunction(()=>document.querySelector('[data-mw="dashboard"]')?.getAttribute('aria-current')==='page');
 assert.equal(await page.locator('.mw-dashboard').isVisible(),true);assert.equal(await page.locator('.mw-home').isVisible(),false);
 assert.equal(await page.locator('#crmSearchInput').inputValue(),'','Overview uses its own search context');
 await measure('Business Lines Overview laptop expanded');
 await page.screenshot({path:out+'/dashboard-laptop.png'});
 await header.locator('[data-mw="home"]').press('Space');
 await page.waitForFunction(()=>document.querySelector('[data-mw="home"]')?.getAttribute('aria-current')==='page'&&document.querySelector('#crmSearchInput')?.value==='STTS');
 assert.equal(await page.locator('.mw-home').isVisible(),true);assert.equal(await page.locator('.mw-dashboard').isVisible(),false);
 assert.equal(await page.evaluate(()=>window.__headerSearchNode===document.getElementById('crmSearchInput')),true,'Tab changes preserve the shared topbar search and its handlers');
 await page.locator('#crmSearchInput').fill('');await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('.mw-results')?.getAttribute('aria-busy')==='false'&&document.querySelectorAll('.rf-table tbody tr').length===3);
 // Reordering native controls must preserve their actual handlers and keyboard activation.
 const recordWrites=()=>requests.filter(r=>r.path.startsWith('business-lines')&&r.path!=='business-lines/preferences'&&r.method!=='GET').length;
 const beforeActions=recordWrites();
 await header.locator('[data-mw="import"]').press('Enter');await page.locator('#rf-import-file').waitFor();
 assert.ok(requests.some(r=>r.path==='business-lines/framework'),'Import loads the Records Framework fields');
 await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
 await header.locator('[data-mw="export"]').press('Enter');await page.locator('#rf-export-scope').waitFor();assert.equal(await page.locator('#rf-export-scope').inputValue(),'page');
 await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
 await header.locator('[data-mw="filter-toggle"]').press('Space');assert.equal(await page.locator('#mw-filter-controls').isVisible(),true);assert.equal(await header.locator('[data-mw="filter-toggle"]').getAttribute('aria-expanded'),'true');
 assert.equal(await page.locator('[data-mw="clear-filters"]').isDisabled(),true,'Clear Filters is visible but disabled when nothing is applied');
 assert.equal(await page.locator('[data-mw="filters"]').evaluate(e=>e.classList.contains('rf-advanced-filter')),true,'Advanced Filter has the stronger discoverable treatment');
 await page.locator('[data-mw="hide-filters"]').click();assert.equal(await page.locator('#mw-filter-controls').isVisible(),false,'Hide Filters collapses only the panel');
 await header.locator('[data-mw="filter-toggle"]').press('Space');assert.equal(await page.locator('#mw-filter-controls').isVisible(),true);
 await header.locator('[data-mw="filter-toggle"]').press('Space');assert.equal(await page.locator('#mw-filter-controls').isVisible(),false);
 await header.locator('.mw-settings-menu>summary').press('Enter');
 assert.equal(await header.locator('.r10-custom-group,.r10-menu-desc').count(),0,'Customize is flat and description-free');
 assert.deepEqual(await header.locator('.mw-settings-menu .r10-simple-menu-item').allTextContents(),['Choose Columns','Arrange Columns','Sort Table','Configure Filters']);
 await header.locator('[data-mw="columns"]').press('Enter');await page.locator('[data-column-check]').first().waitFor();
 await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
 assert.equal(await page.locator('.rf-sort-summary').count(),0,'The old always-visible sort summary strip is removed from above the table');
 await header.locator('.mw-settings-menu>summary').press('Enter');await header.locator('[data-mw="sort-table"]').press('Enter');await page.getByRole('dialog').waitFor();
 assert.match(await page.getByRole('dialog').locator('#mw-dialog-title').innerText(),/Business Lines: Sort Order/);
 await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
 await header.locator('[data-mw="create"]').press('Enter');await page.locator('#mw-record-form').waitFor();
 await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
 assert.equal(recordWrites(),beforeActions,'Opening and closing header tools does not modify records or start a transfer');
 // Exercise the tightest single-row layout with a visible filter count. The
 // two-digit label is a geometry stress case, not a fabricated filtering result.
 // Effective lifecycle Status and legacy Record State are synchronized so they
 // cannot describe contradictory states at the same time.
 await header.locator('[data-mw="filter-toggle"]').click();
 await page.locator('#mw-status').selectOption('Active');await ready();await page.locator('#mw-archived').selectOption('all');await ready();
 const filterBadge=header.locator('.mw-filter-count');assert.equal(await filterBadge.innerText(),'1');
 for(const mainWidth of [1023,1024]){
  await page.setViewportSize({width:mainWidth+73,height:768});await setCollapsed(true);
  await filterBadge.evaluate(e=>e.textContent='20');
  const threshold=await measure('Business Lines '+mainWidth+'px main with two-digit filter badge');
  assert.equal(threshold.main.w,mainWidth,'The filter-count edge cases exercise both sides of the single-row breakpoint');
  if(mainWidth===1023)assert.ok(threshold.tabs.y>threshold.identity.y+20&&threshold.bar.h<=112,'Below the readable single-row width, tabs and actions wrap compactly');
  await page.screenshot({path:out+'/header-threshold-'+mainWidth+'-filter-badge.png'});
 }
 await filterBadge.evaluate(e=>e.textContent='1');
 await page.locator('#mw-status').selectOption('all');await ready();await page.locator('#mw-archived').selectOption('exclude');await ready();await header.locator('[data-mw="filter-toggle"]').click();
 for(const width of [1920,1708,1518,1440,1366,1280,1100,1024,768,390,360,320]){
  await page.setViewportSize({width,height:width<700?844:768});
  if(width>=768){
   for(const collapsed of [false,true]){
    await setCollapsed(collapsed);
    const measured=await measure('businesslines '+width+' collapsed='+collapsed);assert.equal(measured.collapsed,collapsed,'The intended sidebar state is actually applied');
    if([1366,1024].includes(width))await page.screenshot({path:out+'/header-'+width+'-'+(collapsed?'collapsed':'expanded')+'.png'});
   }
  }else{
   await measure('businesslines '+width);
   if([360,320].includes(width)){
    await header.locator('.mw-settings-menu>summary').click();
    const bounds=await header.locator('.mw-settings-menu>div').evaluate(panel=>{const b=panel.getBoundingClientRect();return{width:innerWidth,left:b.left,top:b.top,right:b.right,bottom:b.bottom,viewportHeight:innerHeight};});menuBounds.push(bounds);
    assert.ok(bounds.left>=0&&bounds.top>=0&&bounds.right<=width&&bounds.bottom<=bounds.viewportHeight,'Customize opens fully inside the mobile viewport: '+JSON.stringify(bounds));
    await page.screenshot({path:out+'/customize-'+width+'.png'});await header.locator('.mw-settings-menu>summary').click();
   }
  }
  if([1920,390,320].includes(width))await page.screenshot({path:out+'/home-'+width+'.png',fullPage:true});
 }
 await header.locator('[data-mw="create"]').click();await page.locator('#mw-record-form').waitFor();
 await page.keyboard.press('Escape');await page.locator('dialog').waitFor({state:'detached'});
 // Conservative laptop case: an expanded sidebar and less available CSS width.
 await page.setViewportSize({width:1280,height:627});
 await setCollapsed(false);
 await page.evaluate(()=>document.documentElement.style.setProperty('--sidebar-width','238px'));
 const laptop=await measure('1280 laptop with 238px expanded sidebar');
 assert.ok(Math.abs(laptop.tabs.y-laptop.actions.y)<15,'Laptop actions must share the tab row');
 assert.ok(laptop.bar.h<=64,'Laptop title, tabs and actions stay in one compact row');
 await page.screenshot({path:out+'/normal-zoom-laptop.png'});
 await page.evaluate(()=>document.documentElement.style.removeProperty('--sidebar-width'));
 await page.setViewportSize({width:1366,height:627});await page.waitForTimeout(250);
 await setCollapsed(false);await page.waitForTimeout(250);
 for(const module of ['leads','customers','contacts','opportunities','activities','quotes','bookings','employees','branches']){
  await open(module);await measure(module+' 1366 expanded');
  await page.locator('[data-action="moduleDashboard"]').click();assert.equal(await page.locator('.crm-module-dashboard').count(),1);await measure(module+' dashboard');
  await page.locator('[data-action="moduleHome"]').click();
  await page.keyboard.press('Control+k');await page.locator('#crmSearchInput').pressSequentially('Lagos',{delay:25});
  assert.equal(await page.locator('#crmSearchInput').inputValue(),'Lagos');assert.equal(await page.locator('#crmSearchInput').evaluate(e=>e===document.activeElement),true);
  await page.locator('#crmScopeBtn').click();await page.locator('[data-search-scope="global"]').click();await page.locator('.crm-search-result').waitFor();
  await page.locator('#crmSearchInput').fill('');await page.keyboard.press('Escape');
  if(module==='leads')await page.screenshot({path:out+'/leads-laptop.png'});
 }
 await open('businesslines');
 // Denied capabilities must remain hidden after the same visual component runs.
 deny=true;await page.evaluate(()=>window.SCRM.activeWorkspace.reload());await page.waitForFunction(()=>document.querySelector('.mw-results')?.getAttribute('aria-busy')==='false');
 for(const sel of ['[data-mw="create"]','[data-mw="import"]','[data-mw="export"]','[data-mw="filter-toggle"]','.mw-settings-menu','[data-mw="dashboard"]'])assert.equal(await page.locator(sel+':visible').count(),0,'denied '+sel);
 assert.equal(await page.locator('.topbar #crmSearchInput').isVisible(),true,'Read-only access retains the topbar search');
 assert.equal(await page.locator('.rf-table tbody tr').count(),3,'Read-only users retain their records');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'A permission-reduced header has no horizontal overflow');
 assert.deepEqual(errors,[]);
 await writeFile(out+'/report.json',JSON.stringify({passed:true,fixture:true,checks:metrics.length,metrics,menuBounds,errors},null,2));
 console.log('Business Lines header geometry: '+JSON.stringify(metrics.filter(r=>r.topSearch&&(/1366|1024|238px/.test(r.name))).map(r=>({name:r.name,mainWidth:r.main.w,headerHeight:r.bar.h,collapsed:r.collapsed}))));
 console.log('PASS',metrics.length,'visual geometry/interaction checks: compact responsive header, Import/Export/Filter/Customize keyboard order and handlers, distinct Records/Overview tabs, shared search, permission restrictions and nine unchanged module headers');
}catch(e){if(page)await page.screenshot({path:out+'/header-failure.png'}).catch(()=>{});await writeFile(out+'/report.json',JSON.stringify({passed:false,metrics,menuBounds,errors,error:e.message},null,2));console.error(e);process.exitCode=1;}
finally{await browser.close();await new Promise(r=>server.close(r));}
