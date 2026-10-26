import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {baseline,effectivePolicy,reconcilePreferences} from '../server/region-records-policy.mjs';
import {publicColumns} from '../server/region-records-schema.mjs';
import {importFields,fileLimits} from '../server/region-records-files.mjs';

const base=process.cwd(),headers=JSON.parse(await readFile('vercel.json','utf8')).headers[0].headers;
const server=createServer(async(req,res)=>{try{
 for(const h of headers)res.setHeader(h.key,h.value);
 const path=new URL(req.url,'http://localhost').pathname,file=resolve(base,'.'+(path==='/'?'/index.html':path));
 if(!file.startsWith(base+'/')){res.writeHead(403);res.end();return;}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'text/plain');
 res.end(await readFile(file));
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(4198,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
const user={id:'11111111-1111-4111-8111-111111111111',name:'Region QA Admin',email:'qa@example.org',role:'admin',systemRole:'super_admin',status:'approved',emailVerified:true};
const serverUser={...user,system_role:'super_admin',email_verified:true};
const lineId='22222222-2222-4222-8222-222222222222';
const lines=[{id:lineId,displayId:'BL-001',code:'STTS',name:'Satguru Travel'}];
const permissions=Object.fromEntries(['read','create','edit','archive','restore','softDelete','restoreDeleted','reassignOwner','export','import','history','search','filter','settings','dashboard'].map(k=>[k,true]));
const configuration={version:0,publishedVersion:0,config:baseline(),draft:null};
const effective=()=>effectivePolicy(configuration,serverUser);
let preferenceVersion=0,storedPrefs=null;
const prefs=()=>({version:preferenceVersion,...reconcilePreferences(storedPrefs,effective())});
const now='2026-10-27T00:30:00.000Z';
const records=[],requests=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1366,height:800}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.slice(5),method=request.method(),body=request.postData()?request.postDataJSON():null;
  requests.push({path,method,body});
  let response={},status=200;
  if(path==='auth/me')response={user,csrf:'region-csrf'};
  else if(path==='auth/options')response={googleEnabled:false};
  else if(path==='audit')response={audit:[]};
  else if(path==='access')response={users:[]};
  else if(path==='search')response={items:[]};
  else if(path.startsWith('records/'))response={records:[],next:null};
  else if(path==='regions'&&method==='GET'){
   const q=Object.fromEntries(url.searchParams),filtered=records.filter(r=>!q.q||r.name.toLowerCase().includes(q.q.toLowerCase()));
   response={records:filtered,total:filtered.length,totalPages:1,page:1,pageSize:25,
    counts:{total:records.length,active:records.filter(r=>r.status==='Active').length,inactive:records.filter(r=>r.status==='Inactive').length,archived:0},
    owners:[{id:user.id,ownerId:'UID-000001',name:user.name}],
    referenceData:{businessLines:lines},permissions,
    resource:{frameworkVersion:1,columns:publicColumns(),limits:{selectedExport:250}},
    ui:{policy:effective(),preferences:prefs(),overviewCounts:{total:records.length,active:records.filter(r=>r.status==='Active').length,inactive:records.filter(r=>r.status==='Inactive').length,archived:0,deleted:0}}};
  }else if(path==='regions'&&method==='POST'){
   assert.equal(body.businessLineRef,lineId);
   assert.equal(body.code,'AF-WEST');
   const r={...body,id:'33333333-3333-4333-8333-333333333333',displayId:'RN-001',status:'Active',
    businessLine:'Satguru Travel',businessLineId:'BL-001',businessLineCode:'STTS',
    owner:user.name,ownerId:'UID-000001',createdBy:user.name,createdById:'UID-000001',createdAt:now,
    updatedBy:user.name,updatedById:'UID-000001',updatedAt:now,archivedBy:null,archivedById:null,archivedAt:null,
    deletedBy:null,deletedById:null,deletedAt:null,version:1};
   records.push(r);response={record:r};
  }else if(path==='regions/preferences'){
   if(method==='PUT'){storedPrefs=body.data;preferenceVersion++;}
   response={policy:effective(),preferences:prefs()};
  }else if(path==='regions/framework')response={version:1,fields:publicColumns(),importFields,limits:fileLimits,policy:effective(),preferences:prefs(),permissions};
  else if(path==='regions/configuration')response={...configuration,history:[]};
  else if(path.startsWith('regions/')){
   const [,id,action]=path.split('/'),record=records.find(r=>r.id===id);
   if(!record){status=404;response={error:'Region not found'};}
   else if(action==='history')response={history:[{action:'Created',actor:user.name,createdAt:now,reason:null}]};
   else if(action==='related')response={related:[{module:'branches',count:2,active:2}],total:2,active:2};
   else if(method==='PUT'){
    assert.equal(body.version,record.version);
    Object.assign(record,body,{version:record.version+1,updatedAt:now});
    record.businessLine='Satguru Travel';record.businessLineId='BL-001';record.businessLineCode='STTS';
    response={record};
   }else response={record};
  }else response={message:'OK'};
  await route.fulfill({status,json:response});
 });
 await page.goto('http://127.0.0.1:4198');
 await page.locator('[data-nav="regions"]').waitFor({state:'attached'});
 await page.evaluate(()=>document.querySelector('[data-nav="regions"]').click());
 await page.waitForFunction(()=>document.querySelector('.mw-results')?.getAttribute('aria-busy')==='false');
 assert.equal(await page.locator('.mw-results .rf-table tbody tr').count(),0,'Region Master starts empty');

 await page.locator('.mw-state [data-mw="create"]').click();
 await page.locator('#mw-record-form').waitFor();
 assert.equal(await page.locator('#mw-record-form .mw-bl-field').count(),5,'Region Create uses the same Business Lines field-card structure');
 const sectionColor=await page.locator('dialog[open] .mw-bl-section summary').first().evaluate(el=>getComputedStyle(el).backgroundColor);
 assert.equal(sectionColor,'rgb(241, 243, 242)','Region uses the same neutral section presentation as Business Lines');
 await page.locator('#mw-record-form [name="businessLineRef"]').selectOption(lineId);
 await page.locator('#mw-record-form [name="name"]').fill('West Africa');
 await page.locator('#mw-record-form [name="code"]').fill('af-west');
 await page.locator('#mw-record-form [name="regionalManager"]').fill('Regional Manager');
 await page.locator('#mw-record-form [name="remarks"]').fill('Operational Region');
 assert.equal(await page.locator('#mw-record-form [data-count-for="remarks"]').innerText(),String('Operational Region'.length),'Region Remarks counter updates like Business Lines Description');
 assert.equal(await page.locator('#mw-record-form [name="code"]').inputValue(),'AF-WEST','Region Code uppercases like Business Lines Code');
 await page.locator('#mw-save').click();
 await page.locator('dialog').waitFor({state:'detached'});
 await page.waitForFunction(()=>document.querySelector('.rf-table tbody')?.textContent.includes('RN-001'));
 assert.equal(await page.locator('.rf-table [data-mw="archive"]').count(),0,'Active Region does not show Archive before Deactivate');

 await page.locator('.rf-table [data-mw="read"][data-record]').first().click();
 await page.locator('#bl-edit').waitFor();
 assert.equal(await page.locator('.mw-bl-detail-page').count(),1,'Region View uses the Business Lines record-detail page');
 assert.equal(await page.locator('.mw-bl-detail-page .mw-bl-field').count(),22,'Region detail exposes all Region fields in Business Lines-style rows');
 for(const title of ['Region Information','Ownership Details','Record Information','Lifecycle Information','Related / Used In','Audit History'])
  assert.ok(await page.locator('.mw-bl-section summary').filter({hasText:title}).count(),'Missing '+title+' section');
 assert.equal(await page.locator('[data-bl-prev]').count(),1);
 assert.equal(await page.locator('[data-bl-next]').count(),1);
 assert.equal(await page.locator('[data-bl-expand="1"]').count(),1);
 assert.equal(await page.locator('#bl-edit-top').count(),1,'Region Read has the same header quick Edit action');
 const relatedSection=page.locator('.mw-bl-section').filter({has:page.getByText('Related / Used In',{exact:true})});
 await relatedSection.locator('summary').click();
 assert.match(await relatedSection.innerText(),/branches\s+2 linked records/i);

 await page.locator('#bl-edit').click();
 await page.locator('#mw-bl-page-form').waitFor();
 assert.equal(await page.locator('#mw-bl-page-form [name="businessLineRef"]').inputValue(),lineId);
 const shortcuts=await page.locator('#mw-bl-page-form [data-bl-field-edit]').evaluateAll(nodes=>nodes.map(n=>n.dataset.blFieldEdit).sort());
 assert.deepEqual(shortcuts,['businessLineRef','code','name','regionalManager','remarks','status'].sort(),'Region editable fields use the same inline edit affordance');
 await page.locator('#mw-bl-page-form [name="regionalManager"]').fill('Updated Manager');
 await page.locator('#mw-bl-page-form [name="remarks"]').fill('Updated Region remarks');
 await page.locator('#mw-bl-page-form [name="status"]').selectOption('Inactive');
 await page.locator('#mw-bl-page-reason').fill('Regional restructuring');
 await page.locator('#bl-save').click();
 await page.locator('dialog').waitFor({state:'detached'});
 await page.waitForFunction(()=>document.querySelector('.rf-table tbody')?.textContent.includes('Inactive'));
 assert.equal(records[0].regionalManager,'Updated Manager');
 assert.equal(records[0].remarks,'Updated Region remarks');
 assert.equal(records[0].status,'Inactive');
 const updateRequest=requests.filter(r=>r.path==='regions/'+records[0].id&&r.method==='PUT').at(-1);
 assert.equal(updateRequest.body.businessLineRef,lineId);
 assert.equal(updateRequest.body.status,'Inactive');
 assert.equal(updateRequest.body.reason,'Regional restructuring');
 assert.equal(await page.locator('.rf-table [data-mw="archive"]').count(),1,'Inactive Region exposes Archive in the strict lifecycle sequence');
 assert.deepEqual(errors,[],'No uncaught Region browser errors');
 console.log('Region Business Lines parity browser acceptance passed: compact create, full detail View/Edit, related usage, inline edit, lifecycle gating and shared styling.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
