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
const roleA='22222222-2222-4222-8222-222222222222',roleB='33333333-3333-4333-8333-333333333333',ruleId='44444444-4444-4444-8444-444444444444';
const user={id:'11111111-1111-4111-8111-111111111111',name:'Super Admin QA',email:'qa@example.org',role:'admin',systemRole:'super_admin',status:'approved',emailVerified:true};
const rule={id:ruleId,displayId:'HR-001',hierarchyType:'Administrative',applicability:'Branch',scopeLevel:'Global',scopeId:null,scopeName:'Global',
 parentRole:'Branch Manager',childRole:'Sales Executive',parentRoleId:roleA,childRoleId:roleB,sortOrder:100,status:'Active',
 version:1,updatedAt:'2026-11-04T09:00:00Z',description:'Sales Executive reports to Branch Manager'};
const roles=[{id:roleA,name:'Branch Manager',code:'BM',applicability:'Branch',displayId:'OR-001'},
 {id:roleB,name:'Sales Executive',code:'SE',applicability:'Both',displayId:'OR-002'}];
try{
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.slice(5),method=req.method(),body=req.postData()?req.postDataJSON():{};
  requests.push({path,method,body,query:Object.fromEntries(url.searchParams)});
  let json={};
  if(path==='auth/me')json={user,csrf:'qa-csrf'};
  else if(path==='auth/options')json={googleEnabled:false};
  else if(path==='audit')json={audit:[]};
  else if(path==='access')json={users:[]};
  else if(path==='search')json={items:[]};
  else if(path.startsWith('records/'))json={records:[],next:null};
  else if(path==='reporting-hierarchy/references')json={roles,businessLines:[],regions:[],branches:[],departments:[]};
  else if(path==='reporting-hierarchy'&&method==='GET'){
   const q=url.searchParams;
   const matched=[rule].filter(x=>(q.get('type')==='all'||x.hierarchyType===q.get('type'))&&
    (q.get('scope')==='all'||x.scopeLevel===q.get('scope'))&&
    (q.get('status')==='all'||x.status===q.get('status'))&&
    (q.get('applicability')==='all'||x.applicability===q.get('applicability'))&&
    (!q.get('q')||(x.parentRole+' '+x.childRole).toLowerCase().includes(q.get('q').toLowerCase())));
   json={records:matched,total:matched.length,page:1,pageSize:25,counts:{total:matched.length,active:matched.length,
    inactive:0,archived:0,deleted:0,administrative:matched.length,functional:0}};
  }else if(path==='reporting-hierarchy/'+ruleId&&method==='GET')json={record:rule};
  else if(path==='reporting-hierarchy/'+ruleId+'/history')json={history:[]};
  else if(path==='reporting-hierarchy/'+ruleId+'/related')json={related:{employeeAssignments:0,mappingAvailable:false}};
  else if(path==='reporting-hierarchy'&&method==='POST')json={record:{...rule,...body}};
  else json={message:'OK'};
  await route.fulfill({status:200,json});
 });
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('[data-nav="reportinghierarchy"]').waitFor({state:'attached'});
 await page.locator('[data-nav="reportinghierarchy"]').click();
 await page.locator('.rh-module-header.scrm-workbar.scrm-bl-clean').waitFor();
 assert.equal(await page.locator('.topbar #crumb').innerText(),'Reporting Hierarchy');
 assert.equal(await page.locator('#crmSearchInput').count(),1);
 await page.waitForFunction(()=>document.querySelector('.rh-table tbody')?.textContent.includes('Sales Executive'));
 assert.equal(await page.locator('.rh-table tbody tr').count(),1);
 await page.locator('.rh-module-header [data-rh="overview"]').click();
 await page.locator('.rh-metrics').waitFor();
 assert.match(await page.locator('.rh-note').innerText(),/not a CRM permission/);
 await page.locator('.rh-module-header [data-rh="tree"]').click();
 assert.match(await page.locator('.rh-tree').innerText(),/Branch Manager/);
 await page.locator('.rh-module-header [data-rh="records"]').click();
 await page.locator('.rh-module-header [data-rh="filters"]').click();
 await page.locator('#rh-filter-type').selectOption('Functional');
 await page.waitForFunction(()=>document.querySelector('.rh-table tbody')?.textContent.includes('No matching rules'));
 await page.locator('[data-rh="clear"]').click();
 await page.waitForFunction(()=>document.querySelector('.rh-table tbody')?.textContent.includes('Branch Manager'));
 await page.locator('.rh-table [data-rh^="view:"]').first().click();
 await page.locator('dialog.rh-modal[open] .rh-read-grid').waitFor();
 assert.equal(await page.locator('.rh-dialog-body input').count(),0,'View must be read-only');
 await page.locator('.rh-cancel').click();
 await page.locator('.rh-module-header [data-rh="create"]').click();
 await page.locator('dialog.rh-modal[open] #rh-form').waitFor();
 await page.locator('[name="hierarchyType"]').selectOption('Functional');
 await page.locator('[name="parentRoleId"]').selectOption(roleA);
 await page.locator('[name="childRoleId"]').selectOption(roleB);
 assert.equal(await page.locator('[name="scopeId"]').isVisible(),false,'Global scope has no reference');
 await page.locator('dialog.rh-modal [type="submit"]').click();
 await page.waitForFunction(()=>!document.querySelector('dialog.rh-modal[open]'));
 const created=requests.find(x=>x.path==='reporting-hierarchy'&&x.method==='POST');
 assert.equal(created.body.hierarchyType,'Functional');
 assert.equal(created.body.scopeLevel,'Global');
 assert.equal(created.body.scopeId,null);
 assert.equal(created.body.permissionRole,undefined);
 assert.deepEqual(errors,[],'Reporting Hierarchy must not cause client runtime errors');
 console.log('PASS Reporting Hierarchy browser: shared header, filters, overview, tree, scoped form and permissions separation');
}finally{await browser.close();await new Promise(done=>server.close(done));}
