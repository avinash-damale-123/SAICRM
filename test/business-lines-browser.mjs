
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
const line=(number)=>({id:'20000000-0000-4000-8000-'+String(number).padStart(12,'0'),displayId:'BL-'+String(number).padStart(6,'0'),name:number===1?'Line Alpha':number===2?'Line Bravo':'Line '+String(number).padStart(2,'0'),remarks:'Fixture details '+number,status:number<=25?'Active':'Inactive',ownerId:user.id,owner:user.name,createdById:user.id,createdBy:user.name,createdAt:now,updatedById:user.id,updatedBy:user.name,updatedAt:now,version:1,archivedAt:null});
const records=Array.from({length:30},(_,index)=>line(index+1));
const requests=[],exports=[],errors=[];
let nextId=31,failNext=false;
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
  else if(path==='audit')response={audit:[]};
  else if(path==='access')response={users:[],next:null};
  else if(path==='business-lines'&&method==='GET'){
   const query=Object.fromEntries(url.searchParams);
   if(failNext){failNext=false;await route.fulfill({status:503,json:{error:'Fixture service temporarily unavailable'}});return}
   const result=matching(query),pageNumber=Number(query.page||1),pageSize=Number(query.pageSize||25);
   response={records:result.slice((pageNumber-1)*pageSize,pageNumber*pageSize),total:result.length,page:pageNumber,pageSize,totalPages:Math.max(1,Math.ceil(result.length/pageSize)),counts:{total:records.length,active:records.filter(record=>!record.archivedAt&&record.status==='Active').length,inactive:records.filter(record=>!record.archivedAt&&record.status==='Inactive').length,archived:records.filter(record=>record.archivedAt).length},owners:[user]};
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
 const waitReady=async()=>{await page.locator('.mw-results[aria-busy="false"]').waitFor()};
 const openBusiness=async()=>{await page.locator('[data-nav="businesslines"]').waitFor({state:'attached'});await page.evaluate(()=>document.querySelector('[data-nav="businesslines"]').click());await waitReady()};
 const search=async value=>{await page.locator('#mw-search').fill(value);await page.locator('#mw-search').press('Enter');await waitReady()};
 const noOverflow=async label=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page overflow: '+label);
 await page.goto('http://127.0.0.1:4174');
 await openBusiness();
 assert.equal(await page.locator('.mw-table tbody tr').count(),25);
 assert.match(await page.locator('.mw-range').innerText(),/1–25 of 30/);
 assert.equal(await page.locator('[data-mw="import"]').count(),0);
 for(const width of [320,360,768,1440]){
  await page.setViewportSize({width,height:850});await noOverflow('list '+width);
  await page.screenshot({path:'work/browser/business-lines-'+width+'.png',fullPage:true});
 }
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
 // A delayed older search response must not replace the newer results.
 const slowRequest=page.waitForRequest(request=>request.url().includes('/business-lines?')&&new URL(request.url()).searchParams.get('q')==='Line Alpha');
 await page.locator('#mw-search').fill('Line Alpha');await page.locator('#mw-search').press('Enter');await slowRequest;
 await page.locator('#mw-search').fill('Line Bravo');await page.locator('#mw-search').press('Enter');await waitReady();
 await page.waitForTimeout(1000);
 assert.equal(await page.locator('.mw-record-link').innerText(),'Line Bravo');
 await page.locator('.mw-record-link').click();
 await page.getByRole('heading',{name:'Audit history',exact:true}).waitFor();
 assert.ok((await page.locator('dialog').innerText()).includes('UI Super Admin'));
 for(const width of [320,360,768,1440]){await page.setViewportSize({width,height:850});await noOverflow('read '+width)}
 await page.getByRole('button',{name:'Edit Business Line',exact:true}).click();
 assert.equal(await page.locator('#mw-record-form [name="name"]').inputValue(),'Line Bravo');
 await page.locator('#mw-record-form [name="name"]').fill('Line Bravo Updated');
 await page.locator('#mw-record-form [name="remarks"]').fill('Saved UI context');
 await page.locator('#mw-save').click();await page.locator('dialog').waitFor({state:'detached'});await waitReady();
 assert.equal(await page.locator('#mw-search').inputValue(),'Line Bravo');
 assert.equal(await page.locator('.mw-record-link').innerText(),'Line Bravo Updated');
 await page.locator('[data-mw="create"]').click();
 const createsBefore=requests.filter(request=>request.path==='business-lines'&&request.method==='POST').length;
 await page.locator('#mw-record-form [name="name"]').fill('   ');await page.locator('#mw-save').click();
 assert.equal(requests.filter(request=>request.path==='business-lines'&&request.method==='POST').length,createsBefore);
 await page.locator('#mw-record-form [name="name"]').fill('New UI Business');
 for(const width of [320,360,768,1440]){await page.setViewportSize({width,height:850});await noOverflow('create '+width)}
 await page.locator('#mw-save').click();await page.locator('dialog').waitFor({state:'detached'});await waitReady();
 assert.ok(records.some(record=>record.name==='New UI Business'));
 await page.locator('.mw-row-menu summary').click();await page.locator('.mw-row-menu [data-mw="archive"]').click();
 await page.locator('#mw-archive-confirm').click();await page.locator('dialog').waitFor({state:'detached'});await waitReady();
 assert.equal(await page.locator('.mw-record-link').count(),0);
 await page.locator('#mw-archived').selectOption('only');await waitReady();
 assert.equal(await page.locator('.mw-record-link').innerText(),'Line Bravo Updated');
 await page.locator('.mw-row-menu summary').click();await page.locator('.mw-row-menu [data-mw="restore"]').click();
 await page.locator('#mw-archive-confirm').click();await page.locator('dialog').waitFor({state:'detached'});await waitReady();
 assert.equal(await page.locator('.mw-record-link').count(),0);
 await page.locator('#mw-archived').selectOption('exclude');await waitReady();
 assert.equal(await page.locator('.mw-record-link').innerText(),'Line Bravo Updated');
 await page.locator('[data-mw="columns"]').click();
 assert.equal(await page.locator('[data-column-check="name"]').isDisabled(),true);
 await page.locator('[data-column-check="owner"]').uncheck();await page.locator('[data-column-check="remarks"]').check();await page.locator('#mw-freeze').uncheck();
 await page.locator('#mw-columns-save').click();
 await page.reload();await openBusiness();
 const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('scrm:view:11111111-1111-4111-8111-111111111111:business-lines')));
 assert.equal(prefs.columns.includes('owner'),false);assert.equal(prefs.columns.includes('remarks'),true);assert.equal(prefs.freeze,false);
 assert.equal(await page.locator('thead [data-column="owner"]').count(),0);
 assert.equal(await page.locator('thead [data-column="remarks"]').count(),1);
 for(const mode of ['default','my','all']){
  await page.locator('[data-mw="export"]').click();await page.locator('#mw-export-form input[value="'+mode+'"]').check();
  const pendingDownload=page.waitForEvent('download');await page.locator('#mw-export-download').click();await pendingDownload;
  assert.equal(exports.at(-1).mode,mode);
  assert.equal(Object.hasOwn(exports.at(-1),'columns'),mode==='my');
  if(mode==='my')assert.deepEqual(exports.at(-1).columns,prefs.columns);
 }
 failNext=true;await page.locator('[data-mw="refresh"]').click();await waitReady();
 assert.ok((await page.locator('.mw-results').innerText()).includes('We couldn’t load these records'));
 assert.equal((await page.locator('.mw-results').innerText()).includes('No business lines yet'),false);
 await page.locator('.mw-results [data-mw="refresh"]').click();await waitReady();
 assert.equal(await page.locator('.mw-table tbody tr').count(),25);
 await page.locator('[data-mw="create"]').click();await page.locator('#mw-record-form [name="name"]').fill('Unsaved Business');
 page.once('dialog',dialog=>dialog.dismiss());await page.evaluate(()=>document.querySelector('[data-nav="overview"]').click());
 assert.equal(await page.locator('dialog').isVisible(),true);
 assert.equal(await page.locator('#mw-record-form [name="name"]').inputValue(),'Unsaved Business');
 page.once('dialog',dialog=>dialog.accept());await page.evaluate(()=>document.querySelector('[data-nav="overview"]').click());
 await page.locator('dialog').waitFor({state:'detached'});assert.equal(await page.locator('.mw-workspace').count(),0);
 await openBusiness();
 await page.locator('[data-mw="create"]').click();await page.locator('#mw-record-form [name="name"]').fill('Slow Saved Business');
 const saving=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname==='/api/business-lines');
 await page.locator('#mw-save').click();await saving;
 await page.evaluate(()=>document.querySelector('[data-nav="overview"]').click());
 assert.equal(await page.locator('dialog').isVisible(),true);
 assert.equal(await page.locator('#mw-save').isDisabled(),true);
 await page.locator('dialog').waitFor({state:'detached'});await waitReady();
 assert.ok(records.some(record=>record.name==='Slow Saved Business'));
 await page.locator('[data-mw="create"]').click();await page.locator('#mw-record-form [name="name"]').fill('Slow Teardown Business');
 const teardownSave=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname==='/api/business-lines');
 await page.locator('#mw-save').click();await teardownSave;
 await page.evaluate(()=>{window.SCRM.activeWorkspace.destroy(true);document.querySelector('[data-nav="overview"]').click()});
 await page.waitForTimeout(650);
 assert.equal(await page.locator('.mw-workspace').count(),0);
 assert.equal(await page.locator('dialog').count(),0);
 assert.deepEqual(errors,[]);
 console.log('Business Lines browser checks passed: 4 viewports, selection/export, stale search, filters, create/read/edit, archive/restore, preferences, load errors and guarded navigation');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
