import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=process.cwd();
const server=createServer(async(req,res)=>{
 try{const path=new URL(req.url,'http://localhost').pathname,file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp'})[extname(file)]||'text/plain');
  res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const errors=[],browser=await chromium.launch({headless:true}),requests=[];
const branchId='11111111-1111-4111-8111-111111111111',lineId='22222222-2222-4222-8222-222222222222';
const user={id:'33333333-3333-4333-8333-333333333333',name:'CRM V3 QA Super Admin',email:'qa@example.test',role:'admin',systemRole:'super_admin',emailVerified:true,status:'approved'};
let targets=[];
try{
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.slice(5),method=req.method();
  const body=req.postData()?req.postDataJSON():{};
  requests.push({path,method,body});
  let data={};
  if(path==='auth/me')data={user,csrf:'test-csrf'};
  else if(path==='auth/options')data={googleEnabled:false};
  else if(path==='resource-eligibility')data={keys:['HOME','PROFILE','SETTINGS','MODULE_MASTER','ROLE_MATRIX','BUSINESS_LINES']};
  else if(path==='search')data={items:[]};
  else if(path==='notifications')data={items:[]};
  else if(path.startsWith('records/'))data={records:[],next:null};
  else if(path==='crm-v3/bootstrap')data={branches:[{id:branchId,business_line_id:lineId,name:'CRM v3 Test Branch',code:'V3BR',business_line:'Satguru Travel',country:'India'}],segments:['Corporate','Non-IATA'],targetStages:['New','Contact Attempted','Contacted','On Hold','Closed/Not Interested'],leadStages:['Qualified','Hot','Proposal Submitted','Negotiation','Commercially Won','Closed & Dead'],crfStatuses:['Pending','In Progress','Returned for Correction','Approved','Rejected','Cancelled'],permissions:{read:true,create:true,financeApprove:true,emailSending:false}};
  else if(path==='crm-v3/targets'&&method==='POST'){
   const record={id:'44444444-4444-4444-8444-444444444444',display_id:'TGT-000001',name:body.name,segment:body.segment,stage:'New',version:1,updated_at:new Date().toISOString()};
   targets.push(record);data={record};
  }else if(path.startsWith('crm-v3/targets')&&method==='GET'){
   if(path==='crm-v3/targets')data={records:targets,total:targets.length,page:1,pageSize:25,totalPages:1};
   else data={record:targets[0]};
  }else if(path==='crm-v3/dashboard')data={metrics:{targets:{total:targets.length,byStatus:[]},leads:{total:0,byStatus:[]},crfs:{total:0,byStatus:[]},accounts:{total:0,byStatus:[]},contacts:{total:0,byStatus:[]},activities:{total:0,byStatus:[]},campaigns:{total:0,byStatus:[]}}};
  else if(path.startsWith('crm-v3/'))data={records:[],total:0,page:1,pageSize:25,totalPages:1};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'networkidle'});
 // The new Operational CRM sidebar group is initially collapsed by the approved
 // independent-group navigation standard. Expand it like an actual user.
 await page.locator('[data-nav="v3targets"]').waitFor({state:'attached',timeout:12000});
 if(!await page.locator('[data-nav="v3targets"]').isVisible()){
  await page.getByRole('button',{name:/OPERATIONAL CRM/}).click();
 }
 await page.locator('[data-nav="v3targets"]').waitFor({state:'visible',timeout:12000});
 await page.locator('[data-nav="v3targets"]').click();
 await page.getByRole('heading',{name:'Target Lists'}).waitFor({timeout:12000});
 await page.getByRole('button',{name:/Add Target/}).click();
 const form=page.locator('#crmV3Form');
 await form.locator('[name="name"]').fill('Corporate QA Customer');
 await form.locator('[name="segment"]').selectOption('Corporate');
 await form.locator('[name="branchId"]').selectOption(branchId);
 await form.locator('[name="source"]').fill('Test');
 await form.locator('button[type="submit"]').click();
 await page.getByText('Corporate QA Customer').waitFor({timeout:9000});
 assert.equal(targets.length,1);
 assert.equal(targets[0].segment,'Corporate');
 assert.ok(requests.some(r=>r.path==='crm-v3/targets'&&r.method==='POST'&&r.body.businessLineId===lineId));
 await page.locator('[data-nav="v3dashboard"]').click();
 await page.getByRole('heading',{name:'Sales Dashboard'}).waitFor();
 await page.locator('.crm-v3-metric').filter({hasText:'Target Lists'}).waitFor();
 await page.locator('[data-nav="v3campaigns"]').click();
 await page.getByRole('heading',{name:/Campaigns/}).waitFor();
 await page.getByText('Outbound email sends are disabled',{exact:false}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('PASS CRM v3: mounted navigation, target form, canonical BL/Branch mapping, mock API create, source-backed dashboard and email-send disabled state');
}finally{await browser.close();await new Promise(done=>server.close(done));}
