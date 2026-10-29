import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {baseline,effectivePolicy,reconcilePreferences} from '../server/branch-master-policy.mjs';
import {publicColumns} from '../server/branch-master-schema.mjs';
const base=process.cwd(),headers=JSON.parse(await readFile('vercel.json','utf8')).headers[0].headers;
const server=createServer(async(req,res)=>{try{
 for(const h of headers)res.setHeader(h.key,h.value);
 const path=new URL(req.url,'http://localhost').pathname,file=resolve(base,'.'+(path==='/'?'/index.html':path));
 if(!file.startsWith(base+'/')){res.writeHead(403);res.end();return;}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'text/plain');
 res.end(await readFile(file));
}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(4199,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
const user={id:'11111111-1111-4111-8111-111111111111',name:'Branch QA Admin',email:'qa@example.org',role:'admin',systemRole:'super_admin',status:'approved',emailVerified:true};
const serverUser={...user,system_role:'super_admin',email_verified:true};
const lineA='22222222-2222-4222-8222-222222222222',lineB='55555555-5555-4555-8555-555555555555',lineGSA='99999999-9999-4999-8999-999999999999';
const regionA='33333333-3333-4333-8333-333333333333',countryA='44444444-4444-4444-8444-444444444444';
const regionB='66666666-6666-4666-8666-666666666666',countryB='77777777-7777-4777-8777-777777777777';
const lines=[{id:lineA,code:'STTS',name:'Satguru Travel'},{id:lineB,code:'T3',name:'Top Travel Trip'},{id:lineGSA,name:'GSA'}];
const regions=[{id:regionA,businessLineRef:lineA,code:'AF-WEST',name:'West Africa'},{id:regionB,businessLineRef:lineB,code:'T3-WEST',name:'T3 West'}];
const countries=[{id:countryA,businessLineRef:lineA,code:'KE',name:'Kenya'},{id:countryB,businessLineRef:lineB,code:'AE',name:'United Arab Emirates'}];
const permissions=Object.fromEntries(['read','create','edit','archive','restore','softDelete','restoreDeleted','reassignOwner','export','import','history','search','filter','settings','dashboard'].map(k=>[k,true]));
const effective=effectivePolicy({version:0,publishedVersion:0,config:baseline()},serverUser);
const prefs={version:0,...reconcilePreferences({},effective)};
const requests=[],errors=[],records=[];
try{
 const page=await browser.newPage({viewport:{width:1366,height:800}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.slice(5),method=request.method(),body=request.postData()?request.postDataJSON():null;
  requests.push({path,method,body});let response={};
  if(path==='auth/me')response={user,csrf:'branch-csrf'};
  else if(path==='auth/options')response={googleEnabled:false};
  else if(path==='audit')response={audit:[]};
  else if(path==='access')response={users:[]};
  else if(path==='search')response={items:[]};
  else if(path.startsWith('records/'))response={records:[],next:null};
  else if(path==='branch-master'&&method==='GET')response={
   records,total:records.length,totalPages:1,page:1,pageSize:25,
   counts:{total:records.length,active:records.length,inactive:0,archived:0},
   owners:[{id:user.id,ownerId:'UID-000001',name:user.name}],
   referenceData:{businessLines:lines,regions,countries,branchManagers:[{id:user.id,name:user.name}],branchTypes:['','Branch Office']},
   permissions,resource:{frameworkVersion:1,columns:publicColumns(),limits:{selectedExport:250}},
   ui:{policy:effective,preferences:prefs,overviewCounts:{total:records.length,active:records.length,inactive:0,archived:0,deleted:0},overviewInsights:{counts:{total:records.length,active:records.length,inactive:0,archived:0,deleted:0},businessLines:[],countries:[],regions:[],setup:{businessLines:3,withRegions:2,withCountries:2,readyBusinessLines:2}}}
  };
  else if(path==='branch-master'&&method==='POST'){
   assert.equal(body.businessLineRef,lineA);
   assert.equal(body.regionRef,regionA);
   assert.equal(body.countryRef,countryA);
   assert.equal(body.timeZone,'Africa/Nairobi');
   assert.equal(body.code,'NBO');
   records.push({...body,id:'88888888-8888-4888-8888-888888888888',displayId:'BR-001',businessLine:'Satguru Travel',region:'West Africa',country:'Kenya',status:'Active',owner:user.name,ownerId:'UID-000001',createdBy:user.name,createdAt:'2026-10-28T10:00:00.000Z',updatedAt:'2026-10-28T10:00:00.000Z',version:1});
   response={record:records.at(-1)};
  }
  else if(path.startsWith('branch-master/')&&!['preferences','framework','configuration','references'].includes(path.split('/')[1])){
   const segments=path.split('/'),record=records.find(r=>r.id===segments[1]);
   if(segments[2]==='related')response={related:[],total:0,active:0};
   else if(segments[2]==='history')response={history:[]};
   else if(method==='PUT'){
    assert.equal(body.version,record.version);
    Object.assign(record,body,{version:record.version+1});
    response={record};
   }else response={record};
  }
  else if(path==='branch-master/preferences')response={policy:effective,preferences:prefs};
  else if(path==='branch-master/framework')response={fields:publicColumns(),policy:effective,preferences:prefs,permissions};
  else if(path==='branch-master/configuration')response={version:0,config:baseline(),draft:null,history:[]};
  else response={message:'OK'};
  await route.fulfill({status:200,json:response});
 });
 await page.goto('http://127.0.0.1:4199');
 await page.locator('[data-nav="branchmaster"]').waitFor({state:'attached'});
 await page.evaluate(()=>document.querySelector('[data-nav="branchmaster"]').click());
 await page.waitForFunction(()=>document.querySelector('.mw-results')?.getAttribute('aria-busy')==='false');
 const toolbar=page.locator('.crm-module-host .scrm-workbar.scrm-bl-clean.scrm-search-in-topbar');
 await toolbar.waitFor();
 assert.equal(await toolbar.locator('.scrm-identity h2').innerText(),'Branches','Branch module title matches Business Lines header');
 assert.deepEqual(await toolbar.locator('.scrm-tabs > button').evaluateAll(nodes=>nodes.map(n=>n.dataset.mw)),['home','dashboard'],'Records precedes Overview');
 assert.equal(await toolbar.locator('[data-mw="home"] .scrm-view-title').innerText(),'Records','Branch listing is called Records');
 assert.equal(await toolbar.locator('[data-mw="dashboard"] .scrm-view-title').innerText(),'Overview');
 assert.equal(await toolbar.locator('.scrm-bl-primary [data-mw="create"] .scrm-action-label').innerText(),'Add Branch');
 assert.match(await toolbar.locator('.scrm-bl-primary [data-mw="create"]').getAttribute('aria-label'),/Add Branch/);
 assert.equal(await page.locator('.topbar #crmSearchInput').count(),1,'Shared search stays in the global topbar');
 assert.deepEqual(await toolbar.locator('.scrm-actions .scrm-action-label').evaluateAll(nodes=>nodes.map(n=>n.textContent)),['Import','Export','Filter','Customize'],'Branch command order matches Business Lines');
 const barLayout=await toolbar.evaluate(el=>{
  const box=el.getBoundingClientRect(),ids=['.scrm-identity','.scrm-tabs','.scrm-actions','.scrm-bl-primary'];
  const items=ids.map(selector=>el.querySelector(selector).getBoundingClientRect());
  return {display:getComputedStyle(el).display,height:box.height,allInside:items.every(b=>b.x>=box.x-1&&b.right<=box.right+1&&b.y>=box.y-1&&b.bottom<=box.bottom+1),sameRow:Math.min(...items.map(b=>b.bottom))-Math.max(...items.map(b=>b.y))>24};
 });
 assert.equal(barLayout.display,'flex','wide laptop uses one-row Business Lines toolbar');
 assert.ok(barLayout.allInside&&barLayout.sameRow,'Branch title, tabs, actions and Add all fit one row');
 assert.ok(barLayout.height<90,'Branch command bar has compact Business Lines height');
 
 await page.locator('[data-mw="dashboard"].mw-module-tab').click();
 await page.locator('[data-branch-overview="live"]').waitFor();
 assert.match(await page.locator('[data-branch-overview="live"]').innerText(),/Business Line Setup Readiness/);
 assert.match(await page.locator('[data-branch-overview="live"]').innerText(),/No Branch records match this view/);
 await page.locator('[data-mw="home"].mw-module-tab').click();
 await toolbar.locator('.scrm-bl-primary [data-mw="create"]').click();
 const form=page.locator('#mw-record-form');await form.waitFor();
 assert.ok(await page.locator('dialog[open].mw-bl-dialog.mw-bl-create-dialog').count(),'Branch Create uses shared master modal');
 assert.equal(await form.locator('[data-bl-field-edit]').count(),0,'Create inputs must not have redundant pencil buttons');
 assert.equal(await form.locator('[name="timeZone"]').evaluate(el=>el.tagName),'SELECT','Time Zone is selected from IANA names');
 assert.ok(await page.locator('dialog[open]').evaluate(d=>d.getBoundingClientRect().width>700),'Branch Create has readable desktop width');
 assert.equal(await page.locator('dialog[open] .mw-bl-form > .mw-bl-section').count(),3,'Branch Create exposes 3 named sections');
 assert.ok(await page.locator('dialog[open] .mw-bl-section summary').first().isVisible(),'Branch Information heading is visible');
 assert.ok(await page.locator('dialog[open] .mw-bl-section-tools').isVisible(),'Expand/Collapse controls visible');
 assert.equal(await page.locator('dialog[open] .mw-bl-grid').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2,'desktop Branch form has paired fields');
 assert.equal(await form.locator('[name="timeZone"]').inputValue(),'','Time Zone is not silently set to UTC');
 await form.locator('[name="businessLineRef"]').selectOption(lineGSA);
 assert.match(await form.locator('.mw-branch-dependency-notice').innerText(),/Missing Active Region and Country presence/);
 assert.equal(await form.locator('[name="regionRef"] option').count(),1);
 assert.equal(await form.locator('[name="countryRef"] option').count(),1);
 assert.ok(await form.locator('.mw-branch-geo-hint:visible').count()>=1);

 await form.locator('[name="businessLineRef"]').selectOption(lineA);
 assert.deepEqual(await form.locator('[name="regionRef"] option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(Boolean)),[regionA]);
 assert.deepEqual(await form.locator('[name="countryRef"] option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(Boolean)),[countryA]);
 await form.locator('[name="regionRef"]').selectOption(regionA);
 await form.locator('[name="countryRef"]').selectOption(countryA);
 await form.locator('[name="businessLineRef"]').selectOption(lineB);
 assert.equal(await form.locator('[name="regionRef"]').inputValue(),'');
 assert.equal(await form.locator('[name="countryRef"]').inputValue(),'');
 assert.deepEqual(await form.locator('[name="regionRef"] option').evaluateAll(nodes=>nodes.map(n=>n.value).filter(Boolean)),[regionB]);
 await form.locator('[name="businessLineRef"]').selectOption(lineA);
 await form.locator('[name="regionRef"]').selectOption(regionA);
 await form.locator('[name="countryRef"]').selectOption(countryA);
 await form.locator('[name="name"]').fill('Nairobi');
 await form.locator('[name="code"]').fill('nbo');
 await form.locator('[name="city"]').fill('Nairobi');
 await form.locator('[name="timeZone"]').selectOption('Africa/Nairobi');
 await page.locator('#mw-save').click();
 await page.waitForFunction(()=>document.querySelector('.rf-table tbody')?.textContent.includes('BR-001'));
 assert.equal(requests.filter(r=>r.path==='branch-master'&&r.method==='POST').length,1);
 await page.locator('.rf-table [data-mw="read"][data-record]').first().click();
 await page.locator('.mw-bl-detail-page').waitFor();
 await page.locator('.mw-bl-section summary').filter({hasText:'Contact Information'}).waitFor({state:'attached'});
 assert.ok(await page.locator('.mw-bl-section summary').filter({hasText:'Management'}).count());
 assert.ok(await page.locator('.mw-bl-section summary').filter({hasText:'Related / Used In'}).count(),'Branch details show related CRM use');
 await page.locator('#bl-edit').click();
 const edit=page.locator('#mw-bl-page-form');await edit.waitFor();
 assert.equal(await edit.locator('[name="businessLineRef"]').inputValue(),lineA);
 assert.equal(await edit.locator('[name="regionRef"]').inputValue(),regionA);
 assert.equal(await edit.locator('[name="countryRef"]').inputValue(),countryA);
 await edit.locator('[name="fullName"]').fill('Nairobi Branch Office');
 assert.equal(await edit.locator('[data-bl-field-edit]').count(),0,'Edit fields use clean inputs without pencil overlays');
 await page.locator('#bl-save').click();
 await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 assert.equal(records[0].fullName,'Nairobi Branch Office');
 assert.deepEqual(errors,[]);
 console.log('Branch Master browser accepted: dependent Region/Country selections and new Branch persistence');
}finally{await browser.close();await new Promise(r=>server.close(r));}
