import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root=process.cwd();
const server=createServer(async(req,res)=>{
 try{
  const p=new URL(req.url,'http://localhost').pathname,file=resolve(root,'.'+(p==='/'?'/index.html':p));
  if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'text/plain');
  res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true}),errors=[],requests=[];
const id='22222222-2222-4222-8222-222222222222';
const user={id:'11111111-1111-4111-8111-111111111111',name:'Super Admin QA',email:'qa@example.org',role:'admin',systemRole:'super_admin',status:'approved',emailVerified:true};
const row={id,displayId:'OR-001',name:'Branch Manager',code:'BM',family:'Branch Operations',applicability:'Branch',
 description:'Responsible for the Branch',sortOrder:100,status:'Active',version:1,
 createdBy:'QA',updatedBy:'QA',updatedAt:'2026-11-04T08:00:00Z'};
const records=[row];
try{
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.slice(5),method=req.method(),body=req.postData()?req.postDataJSON():{};
  requests.push({path,method,body,query:Object.fromEntries(url.searchParams)});
  let json={};
  if(path==='auth/me')json={user,csrf:'test-csrf'};
  else if(path==='auth/options')json={googleEnabled:false};
  else if(path==='audit')json={audit:[]};
  else if(path==='access')json={users:[]};
  else if(path==='search')json={items:[]};
  else if(path.startsWith('records/'))json={records:[],next:null};
  else if(path==='organizational-roles'&&method==='GET'){
   const q=url.searchParams;
   const matched=records.filter(r=>(q.get('q')?r.name.toLowerCase().includes(q.get('q').toLowerCase()):true)&&
    (q.get('applicability')==='all'||r.applicability===q.get('applicability')));
   json={records:matched,total:matched.length,page:1,pageSize:25,
    counts:{total:matched.length,active:matched.length,inactive:0,archived:0,deleted:0}};
  }
  else if(path==='organizational-roles/'+id&&method==='GET')json={record:row};
  else if(path==='organizational-roles/'+id+'/history')json={history:[{action:'Created',actor:'QA',reason:'',created_at:'2026-11-04T08:00:00Z'}]};
  else if(path==='organizational-roles/'+id+'/related')json={related:{employeeAssignments:0,activeEmployeeAssignments:0,mappingAvailable:false}};
  else if(path==='organizational-roles'&&method==='POST')json={record:{...row,...body}};
  else json={message:'OK'};
  await route.fulfill({status:200,json});
 });
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>Boolean(window.SCRM?.appReady));
 await page.evaluate(()=>window.SCRM.appReady);
 const availability=await page.evaluate(()=>({allowed:window.SCRM?.can?.('orgroles'),navCount:document.querySelectorAll('[data-nav]').length,
  orgLink:!!document.querySelector('[data-nav="orgroles"]'),
  hasApp:!!document.getElementById('app'),authHidden:document.getElementById('authRoot')?.hidden,
  navHtml:document.querySelector('#navigation')?.textContent?.slice(-220)}));
 assert.equal(availability.allowed,true,JSON.stringify(availability));
 assert.equal(availability.orgLink,true,JSON.stringify(availability));
 await page.evaluate(()=>document.querySelector('[data-nav="orgroles"]').click());
 await page.locator('.org-module-header.scrm-workbar.scrm-bl-clean').waitFor();
 assert.equal(await page.locator('.topbar #crumb').innerText(),'Organizational Roles');
 assert.equal(await page.locator('#crmSearchInput').count(),1,'Shared global search only');
 await page.waitForFunction(()=>document.querySelector('.org-table tbody')?.textContent.includes('Branch Manager'));
 assert.equal(await page.locator('.org-table tbody tr').count(),1);
 await page.locator('[data-org="overview"]').click();
 await page.locator('.org-stats').waitFor();
 assert.match(await page.locator('.org-info').innerText(),/does not grant|permission/i);
 await page.locator('.org-module-header [data-org="records"]').click();
 await page.locator('.org-module-header [data-org="filters"]').click();
 await page.locator('#org-applicability').waitFor();
 await page.locator('#org-applicability').selectOption('Central');
 await page.waitForFunction(()=>document.querySelector('.org-table tbody')?.textContent.includes('No matching organizational roles'));
 await page.locator('[data-org="clear"]').click();
 await page.waitForFunction(()=>document.querySelector('.org-table tbody')?.textContent.includes('Branch Manager'));
 await page.locator('.org-table [data-org^="view:"]').first().click();
 await page.locator('dialog.org-modal[open] .org-read-grid').waitFor();
 assert.equal(await page.locator('.org-dialog-content input').count(),0,'Role view is read only');
 await page.locator('.org-cancel').click();
 await page.locator('.org-table [data-org^="edit:"]').first().click();
 await page.locator('dialog.org-modal[open] #org-form').waitFor();
 assert.equal(await page.locator('dialog.org-modal [name="name"]').inputValue(),'Branch Manager');
 await page.locator('.org-cancel').click();
 await page.locator('.org-module-header [data-org="create"]').click();
 await page.locator('dialog.org-modal[open] #org-form').waitFor();
 assert.equal(await page.locator('[name="name"]').getAttribute('required'),'');
 assert.equal(await page.locator('[name="code"]').getAttribute('required'),'');
 await page.locator('[name="name"]').fill('Sales Executive');
 await page.locator('[name="code"]').fill('SE');
 await page.locator('dialog.org-modal [type="submit"]').click();
 await page.waitForFunction(()=>!document.querySelector('dialog.org-modal[open]'));
 const create=requests.find(r=>r.path==='organizational-roles'&&r.method==='POST');
 assert.equal(create.body.applicability,'Both');
 assert.equal(create.body.code,'SE');
 assert.equal(create.body.permissionRole,undefined,'Organizational Role must never supply a CRM permission role');
 assert.deepEqual(errors,[],'No Organizational Role client runtime errors');
 console.log('PASS Organizational Role browser: security, shared toolbar, filters, read-only view, create, independent permission semantics');
} finally {await browser.close();await new Promise(done=>server.close(done));}
