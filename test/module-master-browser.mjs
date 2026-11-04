import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=process.cwd();
const server=createServer(async(req,res)=>{
 try{
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'text/plain');
  res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({headless:true}),errors=[],requests=[];
const user={id:'11111111-1111-4111-8111-111111111111',name:'Super Admin QA',email:'qa@example.org',role:'admin',systemRole:'super_admin',status:'approved',emailVerified:true};
const rid='22222222-2222-4222-8222-222222222222';
const resource={id:rid,displayId:'RES-000001',key:'LEADS',name:'Leads',type:'MODULE',section:'Core Modules',
 category:'General',route:'#leads',description:'',systemLocked:false,essential:false,commonResource:false,
 adminAllowed:true,managerAllowed:true,standardAllowed:true,status:'Active',version:1};
let rows=[resource],version=1;
try{
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.slice(5),method=req.method(),body=req.postData()?req.postDataJSON():{};
  requests.push({path,method,body});
  let json={};
  if(path==='auth/me')json={user,csrf:'qa-csrf'};
  else if(path==='auth/options')json={googleEnabled:false};
  else if(path==='resource-eligibility')json={keys:['HOME','PROFILE','MODULE_MASTER','LEADS','SETTINGS','MODULE_DIRECTORY']};
  else if(path==='audit')json={audit:[]};
  else if(path==='access')json={users:[]};
  else if(path==='search')json={results:[]};
  else if(path.startsWith('records/'))json={records:[],next:null};
  else if(path==='module-master'&&method==='GET')json={resources:rows,total:rows.length,
    counts:{total:rows.length,active:rows.length,pendingConfig:0,locked:0,admin:1,manager:1,standard:1},registryCount:35};
  else if(path==='module-master/sync'&&method==='POST')json={sync:{created:0,refreshed:35,total:35}};
  else if(path==='module-master/'+rid&&method==='PUT'){
   version++;rows=[{...resource,...body,version}];json={resource:rows[0]};
  }else if(path==='module-master/'+rid+'/history')json={history:[{action:'Eligibility updated',actor:'QA',changes:{},createdAt:'2026-11-04T10:00:00Z'}]};
  else json={message:'OK'};
  await route.fulfill({status:200,json});
 });
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('[data-nav="modulemaster"]').waitFor({state:'attached'});
 assert.equal(await page.locator('#navigation [data-nav="modules"]').count(),0);
 assert.equal((await page.locator('#navigation [data-nav="modulemaster"]').innerText()).trim(),'Module Directory');
 await page.locator('[data-nav="modulemaster"]').click();
 await page.locator('.mm-container').waitFor();
 await page.waitForFunction(()=>document.querySelector('.mm-table tbody')?.textContent.includes('Leads'));
 assert.equal(await page.locator('.mm-table tbody tr').count(),1);
 await page.locator('[data-mm="sync"]').click();
 await page.waitForFunction(()=>document.querySelector('.mm-feedback')?.textContent.includes('refreshed'));
 await page.locator('[data-mm^="edit:"]').first().click();
 await page.locator('dialog.mm-modal[open] #mm-form').waitFor();
 await page.locator('dialog.mm-modal [name="managerAllowed"]').uncheck();
 await page.locator('dialog.mm-modal [type="submit"]').click();
 await page.waitForFunction(()=>!document.querySelector('dialog.mm-modal[open]'));
 const update=requests.find(r=>r.path==='module-master/'+rid&&r.method==='PUT');
 assert.equal(update.body.managerAllowed,false);
 assert.equal(update.body.status,'Active');
 assert.ok(!('systemLocked' in update.body),'UI must not edit immutable policies');
 await page.locator('[data-mm^="history:"]').first().click();
 await page.locator('dialog.mm-modal[open] .mm-events').waitFor();
 assert.match(await page.locator('.mm-events').innerText(),/Eligibility updated/);
 await page.locator('.mm-cancel').click();
 assert.deepEqual(errors,[],'No module master runtime errors');
 console.log('PASS Module Master browser: Super Admin, sync, registry, edit eligibility and history');
}finally{await browser.close();await new Promise(done=>server.close(done));}
