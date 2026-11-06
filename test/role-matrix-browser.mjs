import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=process.cwd();
const server=createServer(async(req,res)=>{
 try{const pathname=new URL(req.url,'http://localhost').pathname,file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
  res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)]||'text/plain');res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({headless:true}),errors=[],requests=[];
const id='11111111-1111-4111-8111-111111111111',dept='22222222-2222-4222-8222-222222222222';
const user={id,name:'QA Super Admin',email:'qa@example.org',role:'admin',systemRole:'super_admin',status:'approved',emailVerified:true};
const resource=(key,name,eligible=true)=>({key,name,type:'MODULE',section:'Core Modules',eligible,locked:false,essential:false});
const setup={departments:[{id:dept,name:'Sales',scope:'Central'}],
 resources:{Admin:[resource('LEADS','Leads'),resource('BOOKINGS','Bookings',false)],Manager:[resource('LEADS','Leads'),resource('BOOKINGS','Bookings',false)],
  'Standard User':[resource('LEADS','Leads'),resource('BOOKINGS','Bookings',false)]},
 fieldCatalog:{LEADS:[{key:'name',label:'Lead / Organisation',locked:false},{key:'scopeBranch',label:'Access branch code',locked:true}]},
 actions:['View','Create','Edit','Delete','Archive','Restore','Import','Export','Approve','Assign','Bulk Update'],
 scopes:['None','My Records','Team','Branch'],fieldStates:['Editable','Read Only','Hidden']};
try{
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 page.on('pageerror',err=>errors.push(err.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.slice(5),method=req.method(),body=req.postData()?req.postDataJSON():{};
  requests.push({path,method,body});let data={};
  if(path==='auth/me')data={user,csrf:'qa-csrf'};
  else if(path==='auth/options')data={googleEnabled:false};
  else if(path==='resource-eligibility')data={keys:['HOME','SETTINGS','ROLE_MATRIX','PROFILE','MODULE_DIRECTORY']};
  else if(path==='audit')data={audit:[]};
  else if(path==='access')data={users:[]};
  else if(path==='search')data={results:[]};
  else if(path.startsWith('records/'))data={records:[],next:null};
  else if(path==='role-matrix/setup')data=setup;
  else if(path==='role-matrix'&&method==='GET')data={roles:[],counts:{total:0,active:0,configured:0}};
  else if(path==='role-matrix'&&method==='POST')data={role:{id:'33333333-3333-4333-8333-333333333333',...body}};
  else data={message:'OK'};
  await route.fulfill({status:200,json:data});
 });
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('[data-nav="rolematrix"]').waitFor({state:'attached'});
 await page.locator('[data-nav="rolematrix"]').evaluate(button=>button.click());
 await page.locator('.rpm-layout').waitFor();
 await page.locator('[data-rpm="create"]').click();
 await page.locator('dialog.rpm-modal[open] #rpm-details').waitFor();
 await page.locator('dialog.rpm-modal [name="name"]').fill('Sales Analyst');
 await page.locator('dialog.rpm-modal [name="code"]').fill('SA-01');
 await page.locator('dialog.rpm-modal [name="departmentId"]').selectOption(dept);
 await page.locator('dialog.rpm-modal [name="userType"]').selectOption('Admin');
 await page.locator('dialog.rpm-modal [data-rpm="next"]').click();
 await page.locator('dialog.rpm-modal .rpm-rule-table').waitFor();
 assert.equal(await page.locator('dialog.rpm-modal [data-resource="BOOKINGS"][data-action="View"]').isDisabled(),true);
 await page.locator('dialog.rpm-modal [data-resource="LEADS"][data-action="View"]').check();
 await page.locator('dialog.rpm-modal [data-resource="LEADS"][data-action="Edit"]').check();
 await page.locator('dialog.rpm-modal [data-resource="LEADS"][data-scope="true"]').selectOption('Branch');
 await page.locator('dialog.rpm-modal [data-rpm="next"]').click();
 await page.locator('dialog.rpm-modal [data-field-resource="LEADS"][data-field-key="name"][value="Read Only"]').check();
 await page.locator('dialog.rpm-modal [data-rpm="next"]').click();
 await page.locator('dialog.rpm-modal .rpm-review').waitFor();
 assert.match(await page.locator('.rpm-review').innerText(),/Sales Analyst/);
 await page.locator('dialog.rpm-modal [data-rpm="save"]').click();
 await page.waitForFunction(()=>!document.querySelector('dialog.rpm-modal[open]'));
 const saved=requests.find(x=>x.path==='role-matrix'&&x.method==='POST');
 assert.equal(saved.body.departmentId,dept);
 assert.equal(saved.body.userType,'Admin');
 assert.equal(saved.body.permissions.LEADS.scope,'Branch');
 assert.ok(saved.body.permissions.LEADS.actions.includes('Edit'));
 assert.equal(saved.body.fields.LEADS.name,'Read Only');
 assert.equal(saved.body.permissions.BOOKINGS,undefined,'Blocked module must not be granted');
 assert.deepEqual(errors,[]);
 console.log('PASS Role Matrix browser: Department+User Type, disabled modules, action scope, field security and review/save');
}finally{await browser.close();await new Promise(done=>server.close(done));}
