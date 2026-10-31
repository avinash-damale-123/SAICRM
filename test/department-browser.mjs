import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const root=process.cwd(),security=JSON.parse(await readFile('vercel.json','utf8')).headers[0].headers;
const server=createServer(async(req,res)=>{
 try{
  for(const h of security)res.setHeader(h.key,h.value);
  const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'text/plain');
  res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({headless:true}),errors=[],requests=[];
const uuidA='22222222-2222-4222-8222-222222222222',uuidB='33333333-3333-4333-8333-333333333333';
const user={id:'11111111-1111-4111-8111-111111111111',name:'QA Department Admin',email:'qa@example.org',role:'admin',systemRole:'super_admin',status:'approved',emailVerified:true};
const records=[
 {id:uuidA,displayId:'DP-001',scope:'Branch',level:'Department',name:'Operations',code:'OPS',parent:'',parentId:null,status:'Active',description:'Branch operations',sortOrder:100,updatedAt:'2026-10-31T08:00:00Z',version:1},
 {id:uuidB,displayId:'DP-002',scope:'Branch',level:'Department',name:'Sales',code:'SAL',parent:'',parentId:null,status:'Active',description:'Branch sales',sortOrder:100,updatedAt:'2026-10-31T08:00:00Z',version:1}
];
const jobs=[],jobId='77777777-7777-4777-8777-777777777777';
try{
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.slice(5),method=request.method();
  const body=request.postData()?request.postDataJSON():{};
  requests.push({path,method,query:Object.fromEntries(url.searchParams),body});
  let json={};
  if(path==='auth/me')json={user,csrf:'qa-csrf'};
  else if(path==='auth/options')json={googleEnabled:false};
  else if(path==='audit')json={audit:[]};
  else if(path==='access')json={users:[]};
  else if(path==='search')json={items:[]};
  else if(path.startsWith('records/'))json={records:[],next:null};
  else if(path==='department-master/references')json={
   units:records,branches:[{id:'44444444-4444-4444-8444-444444444444',name:'Pune',code:'PNQ',businessLineRef:'55555555-5555-4555-8555-555555555555'}],
   businessLines:[{id:'55555555-5555-4555-8555-555555555555',name:'STTS',code:'STTS'}]
  };
  else if(path==='department-master'&&method==='GET'){
   const q=url.searchParams,scope=q.get('scope')||'Branch',name=q.get('name')||'',search=q.get('q')||'';
   const matched=records.filter(r=>r.scope===scope&&r.name.toLowerCase().includes(name.toLowerCase())&&r.name.toLowerCase().includes(search.toLowerCase()));
   const pageSize=Number(q.get('pageSize')||25),pageNo=Number(q.get('page')||1);
   json={records:matched.slice((pageNo-1)*pageSize,pageNo*pageSize),total:matched.length,
    page:pageNo,pageSize,totalPages:Math.ceil(matched.length/pageSize),
    counts:{total:matched.length,active:matched.length,inactive:0,archived:0,deleted:0}};
  }
  else if(path==='department-master/exports'&&method==='POST'){
   assert.equal(body.format,'xlsx');assert.equal(body.filters.scope,'Branch');
   json={job:{id:jobId,kind:'export',status:'completed'},files:1,count:records.length};
  }
  else if(path==='department-master/imports/analyze'&&method==='POST'){
   assert.equal(body.filename,'departments.csv');assert.ok(body.data.length>20);
   json={job:{id:jobId,kind:'import',status:'uploaded',total:1},headers:['Unit Name','Unit Code','Level','Parent Unit Code'],
    sample:[['Finance','FIN','Department','']],recommended:{name:0,code:1,level:2,parentCode:3}};
  }
  else if(path==='department-master/imports/'+jobId+'/validate'&&method==='POST'){
   assert.equal(body.scope,'Branch');assert.deepEqual(body.mapping,{name:0,code:1,level:2,parentCode:3});
   json={job:{id:jobId,kind:'import',status:'validated',total:1},valid:1,invalid:0,skipped:0,preview:[{row:2,name:'Finance',code:'FIN'}],errors:[]};
  }
  else if(path==='department-master/jobs/'+jobId+'/start'&&method==='POST'){
   json={job:{id:jobId,kind:'import',status:'completed',total:1,succeeded:1,failed:0,skipped:0}};
  }
  else if(path==='department-master/jobs')json={jobs:[{id:jobId,kind:'import',status:'completed',total:1,succeeded:1,failed:0,skipped:0,filename:'departments.csv'}]};
  else if(path==='department-master/jobs/'+jobId)json={job:{id:jobId,kind:'import',status:'completed',total:1},items:[],parts:0};
  else if(path==='department-master/jobs/'+jobId+'/file')json={filename:'department.csv',mime:'text/csv;charset=utf-8',data:Buffer.from('Unit Name\r\nOperations\r\n').toString('base64')};
  else if(path.startsWith('department-master/'))json={record:records[0]};
  else json={message:'OK'};
  await route.fulfill({status:200,json});
 });
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('[data-nav="departmentmaster"]').waitFor({state:'attached'});
 await page.evaluate(()=>document.querySelector('[data-nav="departmentmaster"]').click());
 await page.locator('.dm-module-header.scrm-workbar.scrm-bl-clean').waitFor();
 assert.equal(await page.locator('.topbar #crumb').innerText(),'Departments','Readable breadcrumb');
 assert.equal(await page.locator('#crmSearchInput').count(),1,'One shared search input');
 assert.equal(await page.locator('#dm-search').count(),0,'No duplicate Department search');
 assert.deepEqual(await page.locator('.dm-module-header .scrm-tabs .scrm-view-title').allInnerTexts(),['Records','Overview','Hierarchy']);
 assert.ok(await page.locator('.dm-module-header .scrm-bl-primary [data-dm="create"]').isVisible(),'Canonical Add Department control');
 assert.deepEqual(await page.locator('.dm-module-header .scrm-actions .scrm-action-label').allInnerTexts(),['Import','Export','Filter','Customize']);
 await page.waitForFunction(()=>document.querySelector('.dm-table tbody')?.textContent.includes('Operations'));
 assert.ok(await page.locator('.dm-table tbody').innerText().then(s=>s.includes('Sales')),'Department records loaded');
 await page.locator('.dm-module-header .mw-settings-menu>summary').click();
 await page.locator('[data-dm="columns"]').click();
 await page.locator('.dm-column-editor').waitFor();
 await page.locator('[data-dm-column-visible="code"]').uncheck();
 await page.locator('[data-dm-column-save]').click();
 assert.equal(await page.locator('.dm-table th[data-column-key="code"]').count(),0,'Arrange Columns hides Unit Code');
 await page.locator('[data-dm="toggle-filters"]').click();
 await page.locator('[data-dm="advanced"]').click();
 await page.locator('#dm-advanced-name').fill('Sales');
 await page.locator('[data-dm="apply-advanced"]').click();
 await page.waitForFunction(()=>document.querySelector('.dm-table tbody')?.textContent.includes('Sales'));
 assert.equal(requests.filter(r=>r.path==='department-master'&&r.method==='GET').at(-1).query.name,'Sales');
 await page.locator('[data-dm="clear"]').click();
 await page.waitForFunction(()=>document.querySelector('.dm-table tbody')?.textContent.includes('Operations'));
 await page.locator('[data-dm="overview"]').click();
 await page.locator('.dm-overview').waitFor();
 assert.match(await page.locator('.dm-overview').innerText(),/Units by Hierarchy Level/);
 await page.locator('[data-dm="records"]').click();
 await page.waitForFunction(()=>document.querySelector('.dm-table tbody')?.textContent.includes('Operations'));
 await page.locator('.dm-module-header .scrm-bl-primary [data-dm="create"]').click();
 await page.locator('dialog.dm-native-dialog[open] #dm-form').waitFor();
 assert.equal(await page.locator('.dm-form-section').count(),2,'Create form has named sections');
 await page.locator('[name="level"]').selectOption('Sub-Department');
 assert.equal(await page.locator('[name="parentId"]').isEnabled(),true,'Parent required for Sub-Department');
 assert.equal(await page.locator('[name="parentId"]').getAttribute('required'),'');
 await page.locator('[name="level"]').selectOption('Department');
 assert.equal(await page.locator('.dm-form-field:has([name="parentId"])').isVisible(),false);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('.dm-modal-cancel').click();
 await page.locator('.dm-table [data-dm^="view:"]').first().click();
 assert.match(await page.locator('.dm-detail-summary').innerText(),/Operations/);
 assert.equal(await page.locator('.dm-dialog-body input').count(),0,'Read-only details without disabled edit fields');
 await page.locator('.dm-modal-cancel').click();
 await page.locator('[data-dm="transfer-export"]').click();
 await page.locator('#dm-export-start').click();
 await page.locator('[data-dm-export-part="1"]').waitFor();
 assert.equal(requests.filter(r=>r.path==='department-master/exports').length,1);
 await page.locator('.dm-modal-cancel').click();
 await page.locator('[data-dm="import"]').click();
 await page.locator('#dm-import-file').setInputFiles({
  name:'departments.csv',mimeType:'text/csv',buffer:Buffer.from('Unit Name,Unit Code,Level,Parent Unit Code\nFinance,FIN,Department,\n')
 });
 await page.locator('#dm-import-analyze').click();
 await page.locator('#dm-import-validate').waitFor();
 await page.locator('#dm-import-validate').click();
 await page.locator('#dm-import-commit:not([disabled])').waitFor();
 await page.locator('#dm-import-commit').click();
 await page.getByText(/Import completed/).waitFor();
 assert.equal(requests.filter(r=>r.path.endsWith('/start')).length,1);
 await page.locator('.dm-modal-cancel').click();
 await page.locator('.dm-module-header .mw-settings-menu>summary').click();
 await page.locator('[data-dm="transfer-history"]').click();
 await page.locator('[data-dm-job-detail]').click();
 await page.getByText(/import · completed/).waitFor();
 await page.locator('.dm-modal-cancel').click();
 await page.locator('[data-dm="manage-assignments"]').click();
 assert.match(await page.locator('.dm-dialog-body').innerText(),/No Branch assignments yet/);
 await page.locator('.dm-modal-cancel').click();
 await page.locator('[data-dm="central"]').click();
 await page.waitForFunction(()=>document.querySelector('.dm-workspace')?.textContent.includes('Central Departments'));
 await page.locator('[data-dm="tree"]').click();
 await page.locator('.dm-empty-state').waitFor();
 assert.match(await page.locator('.dm-empty-state').innerText(),/Central Department hierarchy is empty/);
 assert.deepEqual(errors,[],'Department module must not raise browser runtime errors');
 console.log('PASS Department browser: records, Arrange Columns, advanced filters, XLSX export, CSV upload validation and job history');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
