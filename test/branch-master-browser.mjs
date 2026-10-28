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
const lineA='22222222-2222-4222-8222-222222222222',lineB='55555555-5555-4555-8555-555555555555';
const regionA='33333333-3333-4333-8333-333333333333',countryA='44444444-4444-4444-8444-444444444444';
const regionB='66666666-6666-4666-8666-666666666666',countryB='77777777-7777-4777-8777-777777777777';
const lines=[{id:lineA,code:'STTS',name:'Satguru Travel'},{id:lineB,code:'T3',name:'Top Travel Trip'}];
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
   ui:{policy:effective,preferences:prefs,overviewCounts:{total:records.length,active:records.length,inactive:0,archived:0,deleted:0}}
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
 await page.locator('.mw-state [data-mw="create"]').click();
 const form=page.locator('#mw-record-form');await form.waitFor();
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
 await form.locator('[name="timeZone"]').fill('Africa/Nairobi');
 await page.locator('#mw-save').click();
 await page.waitForFunction(()=>document.querySelector('.rf-table tbody')?.textContent.includes('BR-001'));
 assert.equal(requests.filter(r=>r.path==='branch-master'&&r.method==='POST').length,1);
 await page.locator('.rf-table [data-mw="read"][data-record]').first().click();
 await page.locator('.mw-bl-detail-page').waitFor();
 await page.locator('.mw-bl-section summary').filter({hasText:'Contact Information'}).waitFor({state:'attached'});
 assert.ok(await page.locator('.mw-bl-section summary').filter({hasText:'Management'}).count());
 await page.locator('#bl-edit').click();
 const edit=page.locator('#mw-bl-page-form');await edit.waitFor();
 assert.equal(await edit.locator('[name="businessLineRef"]').inputValue(),lineA);
 assert.equal(await edit.locator('[name="regionRef"]').inputValue(),regionA);
 assert.equal(await edit.locator('[name="countryRef"]').inputValue(),countryA);
 await edit.locator('[name="fullName"]').fill('Nairobi Branch Office');
 await page.locator('#bl-save').click();
 await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 assert.equal(records[0].fullName,'Nairobi Branch Office');
 assert.deepEqual(errors,[]);
 console.log('Branch Master browser accepted: dependent Region/Country selections and new Branch persistence');
}finally{await browser.close();await new Promise(r=>server.close(r));}
