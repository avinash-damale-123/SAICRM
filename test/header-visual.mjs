import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.cwd(),out='work/browser/visual';await mkdir(out,{recursive:true});
const headers=JSON.parse(await readFile('vercel.json','utf8')).headers[0].headers;
const server=createServer(async(req,res)=>{try{
 for(const h of headers)res.setHeader(h.key,h.value);
 const pathname=new URL(req.url,'http://localhost').pathname;
 const path=resolve(base,'.'+(pathname==='/'?'/index.html':pathname));
 if(!path.startsWith(base+'/')){res.writeHead(403);res.end();return;}
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp'})[extname(path)]||'application/octet-stream');
 res.end(await readFile(path));
}catch{res.writeHead(404);res.end();}});await new Promise(r=>server.listen(4176,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
const metrics=[],errors=[],requests=[];
const user={id:'11111111-1111-4111-8111-111111111111',name:'CRM SuperAdmin',email:'visual-test@example.org',role:'admin',systemRole:'super_admin',status:'approved',emailVerified:true};
const names=['STTS','T3','GSA'];
const lines=names.map((name,i)=>({id:`20000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,displayId:`BL-00${i+1}`,name,status:'Active',owner:user.name,ownerId:user.id,createdBy:user.name,createdById:user.id,updatedBy:user.name,updatedById:user.id,createdAt:'2026-10-19T06:00:00Z',updatedAt:'2026-10-19T07:38:00Z',remarks:'',archivedAt:null,version:1}));
const perms=Object.fromEntries(['read','create','edit','archive','restore','export','history','search','filter','settings','dashboard'].map(k=>[k,true]));
const records=Object.fromEntries(['leads','customers','contacts','opportunities','activities','quotes','bookings','employees','branches'].map(m=>[m,[{id:'fixture-'+m,name:'Lagos sample '+m,subject:'Lagos meeting',contact:'Travel coordinator',organisation:'Sample travel company',type:'Corporate',identity:'Organisation',category:'Corporate',line:'STTS',branch:'Pune',country:'India',email:'test@example.org',status:'Active',stage:'Discovery',value:2000,version:1,scopeBranch:'PUNE',scopeLine:'STTS'}]]));
let deny=false;
try{
 const page=await browser.newPage({viewport:{width:1366,height:627},timezoneId:'Asia/Kolkata'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.slice(5);requests.push(path);
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
   data={records:found,total:found.length,totalPages:1,counts:{total:3,active:3,inactive:0,archived:0},owners:[user],permissions:deny?{read:true,search:true}:perms};
  }else if(path.startsWith('business-lines/')){
   const [,id,action]=path.split('/');data=action==='history'?{history:[]}:{record:lines.find(l=>l.id===id)||lines[0]};
  }
  await route.fulfill({json:data});
 });
 await page.goto('http://127.0.0.1:4176');await page.locator('#crmSearchInput').waitFor();
 const open=async m=>{await page.evaluate(m=>document.querySelector('[data-nav="'+m+'"]').click(),m);await page.locator('.scrm-workbar').waitFor();if(m==='businesslines')await page.waitForFunction(()=>document.querySelector('.mw-results')?.getAttribute('aria-busy')==='false');};
 const measure=async(name)=>{
  await page.waitForTimeout(240);
  const r=await page.evaluate(()=>{
   const box=s=>{const n=document.querySelector(s);if(!n)return null;const b=n.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width,h:b.height};};
   return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,collapsed:document.getElementById('app').classList.contains('nav-collapsed'),main:box('.main'),bar:box('.scrm-workbar'),identity:box('.scrm-identity'),tabs:box('.scrm-tabs'),search:box('.scrm-search'),input:box('#crmSearchInput'),actions:box('.scrm-actions'),bell:box('#notifBtn'),focus:box('#focusModeBtn'),profile:box('.crm-profile'),tabsText:[...document.querySelectorAll('.scrm-view-context')].map(e=>({text:e.textContent,visible:e.getBoundingClientRect().height>0})),inputCount:document.querySelectorAll('#crmSearchInput').length};
  });metrics.push({name,...r});
  assert.equal(r.overflow,false,name+' overflow '+JSON.stringify(r));
  assert.equal(r.inputCount,1,name+' must have one shared search');
  assert.ok(r.input.w>=100,name+' typing area collapsed '+JSON.stringify(r));
  assert.ok(r.search.w>=240,name+' search container collapsed '+JSON.stringify(r));
  assert.ok(r.input.x+r.input.w<=r.search.x+r.search.w,name+' input overflows its own search box');
  if(await page.locator('.scrm-bl-clean').count()===0)assert.ok(r.tabsText.every(x=>x.visible),name+' missing module subtitles');
  assert.ok(r.bell.x<r.focus.x&&r.focus.x<r.profile.x,name+' global control order');
  if(r.main.w>1000){assert.ok(Math.abs(r.tabs.y-r.search.y)<15,name+' search alignment');assert.ok(r.input.w>=120,name+' laptop input too small '+JSON.stringify(r));assert.ok(r.search.x-(r.tabs.x+r.tabs.w)<25,name+' gap wastes search area');}
  return r;
 };
 await open('businesslines');await measure('Business Lines Home laptop expanded');
 await page.screenshot({path:out+'/home-laptop.png'});
 await page.locator('[data-mw="dashboard"]').click();await page.mouse.move(0,0);await page.waitForTimeout(160);await measure('Business Lines Dashboard laptop expanded');
 await page.screenshot({path:out+'/dashboard-laptop.png'});
 await page.locator('[data-mw="home"]').click();
 await page.keyboard.press('Control+k');assert.equal(await page.locator('#crmSearchInput').evaluate(e=>e===document.activeElement),true);
 await page.locator('#crmSearchInput').fill('STTS');await page.waitForTimeout(550);assert.equal(await page.locator('.mw-table tbody tr').count(),1);
 await page.locator('#crmSearchInput').fill('');await page.keyboard.press('Escape');await page.waitForTimeout(550);
 for(const width of [1920,1708,1518,1440,1366,1280,1100,1024,768,390,360,320]){
  await page.setViewportSize({width,height:width<700?844:768});
  if(width>=768){
   for(const collapsed of [false,true]){
    const current=await page.locator('#app').evaluate(e=>e.classList.contains('nav-collapsed'));
    if(current!==collapsed)await page.locator('#menuBtn').click();
    await measure('businesslines '+width+' collapsed='+collapsed);
   }
  }else await measure('businesslines '+width);
  if([1920,390,320].includes(width))await page.screenshot({path:out+'/home-'+width+'.png',fullPage:true});
 }
 // Conservative laptop case: an expanded sidebar and less available CSS width.
 await page.setViewportSize({width:1280,height:627});
 if(await page.locator('#app').evaluate(e=>e.classList.contains('nav-collapsed')))await page.locator('#menuBtn').click();
 await page.evaluate(()=>document.documentElement.style.setProperty('--sidebar-width','238px'));
 const laptop=await measure('1280 laptop with 238px expanded sidebar');
 assert.ok(Math.abs(laptop.tabs.y-laptop.actions.y)<15,'Laptop actions must share the tab row');
 assert.ok(laptop.bar.h<150,'Business Lines two-tier command bar must remain compact');
 await page.screenshot({path:out+'/normal-zoom-laptop.png'});
 await page.evaluate(()=>document.documentElement.style.removeProperty('--sidebar-width'));
 await page.setViewportSize({width:1366,height:627});await page.waitForTimeout(250);
 if(await page.locator('#app').evaluate(e=>e.classList.contains('nav-collapsed')))await page.locator('#menuBtn').click();await page.waitForTimeout(250);
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
 await open('businesslines');await page.locator('.mw-settings-menu > summary').click();await page.locator('[data-mw="columns"]').click();await page.locator('dialog').waitFor();await page.locator('.mw-dialog-close').click();
 // Denied capabilities must remain hidden after the same visual component runs.
 deny=true;await page.evaluate(()=>window.SCRM.activeWorkspace.reload());await page.waitForFunction(()=>document.querySelector('.mw-results')?.getAttribute('aria-busy')==='false');
 for(const sel of ['[data-mw="create"]','[data-mw="export"]','[data-mw="filter-toggle"]','.mw-settings-menu','[data-mw="dashboard"]'])assert.equal(await page.locator(sel+':visible').count(),0,'denied '+sel);
 assert.deepEqual(errors,[]);
 await writeFile(out+'/report.json',JSON.stringify({passed:true,fixture:true,checks:metrics.length,metrics,errors},null,2));
 console.log('PASS',metrics.length,'visual geometry/interaction checks');
}catch(e){await writeFile(out+'/report.json',JSON.stringify({passed:false,metrics,errors,error:e.message},null,2));console.error(e);process.exitCode=1;}
finally{await browser.close();await new Promise(r=>server.close(r));}
