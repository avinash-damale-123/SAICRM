import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {baseline,effectivePolicy,reconcilePreferences} from '../server/country-records-policy.mjs';
import {publicColumns} from '../server/country-records-schema.mjs';
import {importFields,fileLimits} from '../server/country-records-files.mjs';

const base=process.cwd(),headers=JSON.parse(await readFile('vercel.json','utf8')).headers[0].headers;
const server=createServer(async(req,res)=>{try{
 for(const h of headers)res.setHeader(h.key,h.value);
 const path=new URL(req.url,'http://localhost').pathname,file=resolve(base,'.'+(path==='/'?'/index.html':path));
 if(!file.startsWith(base+'/')){res.writeHead(403);res.end();return;}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(file)]||'text/plain');
 res.end(await readFile(file));
}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(4197,'127.0.0.1',r));
const browser=await chromium.launch({headless:true});
const user={id:'11111111-1111-4111-8111-111111111111',name:'Country QA Admin',email:'qa@example.org',role:'admin',systemRole:'super_admin',status:'approved',emailVerified:true};
const serverUser={...user,system_role:'super_admin',email_verified:true};
const lineId='22222222-2222-4222-8222-222222222222';
const lines=[{id:lineId,displayId:'BL-001',code:'STTS',name:'Satguru Travel'}];
const permissions=Object.fromEntries(['read','create','edit','archive','restore','softDelete','restoreDeleted','reassignOwner','export','import','history','search','filter','settings','dashboard'].map(k=>[k,true]));
const configuration={version:0,publishedVersion:0,config:baseline(),draft:null};
const effective=()=>effectivePolicy(configuration,serverUser);
let preferenceVersion=0,storedPrefs=null;
const prefs=()=>({version:preferenceVersion,...reconcilePreferences(storedPrefs,effective())});
const now='2026-10-26T10:00:00.000Z';
const records=[],requests=[],errors=[];
try{
 const page=await browser.newPage({viewport:{width:1366,height:800}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname.slice(5),method=request.method(),body=request.postData()?request.postDataJSON():null;
  requests.push({path,method,body});
  let response={},status=200;
  if(path==='auth/me')response={user,csrf:'country-csrf'};
  else if(path==='auth/options')response={googleEnabled:false};
  else if(path==='audit')response={audit:[]};
  else if(path==='access')response={users:[]};
  else if(path==='search')response={items:[]};
  else if(path.startsWith('records/'))response={records:[],next:null};
  else if(path==='countries'&&method==='GET'){
   const q=Object.fromEntries(url.searchParams),filtered=records.filter(r=>!q.q||r.name.toLowerCase().includes(q.q.toLowerCase()));
   response={records:filtered,total:filtered.length,totalPages:1,page:1,pageSize:25,
    counts:{total:records.length,active:records.length,inactive:0,archived:0},owners:[{id:user.id,ownerId:'UID-000001',name:user.name}],
    referenceData:{businessLines:lines},permissions,
    resource:{frameworkVersion:1,columns:publicColumns(),limits:{selectedExport:250}},
    ui:{policy:effective(),preferences:prefs(),overviewCounts:{total:records.length,active:records.length,inactive:0,archived:0,deleted:0}}};
  }else if(path==='countries'&&method==='POST'){
   assert.deepEqual(body.businessLineIds,[lineId]);
   const r={...body,id:'33333333-3333-4333-8333-333333333333',displayId:'CN-001',status:'Active',
    flag:'🇮🇳',businessLines:lines,businessLinePresence:'STTS',owner:user.name,ownerId:'UID-000001',
    createdBy:user.name,createdById:'UID-000001',createdAt:now,updatedBy:user.name,updatedById:'UID-000001',updatedAt:now,
    archivedAt:null,deletedAt:null,version:1};
   records.push(r);response={record:r};
  }else if(path==='countries/preferences'){
   if(method==='PUT'){storedPrefs=body.data;preferenceVersion++;}
   response={policy:effective(),preferences:prefs()};
  }else if(path==='countries/framework')response={version:1,fields:publicColumns(),importFields,limits:fileLimits,policy:effective(),preferences:prefs(),permissions};
  else if(path==='countries/configuration')response={...configuration,history:[]};
  else if(path.startsWith('countries/')){
   const [,id,action]=path.split('/'),record=records.find(r=>r.id===id);
   if(!record){status=404;response={error:'Country not found'};}
   else if(action==='history')response={history:[]};
   else if(action==='related')response={related:[],businessLines:lines,total:1};
   else if(method==='PUT'){
    assert.equal(body.version,record.version);
    Object.assign(record,body,{version:record.version+1,updatedAt:now});
    record.businessLinePresence='STTS';response={record};
   }else response={record};
  }else response={message:'OK'};
  await route.fulfill({status,json:response});
 });
 await page.goto('http://127.0.0.1:4197');
 await page.locator('[data-nav="countries"]').waitFor({state:'attached'});
 await page.evaluate(()=>document.querySelector('[data-nav="countries"]').click());
 await page.waitForFunction(()=>document.querySelector('.mw-results')?.getAttribute('aria-busy')==='false');
 assert.equal(await page.locator('.mw-results .rf-table tbody tr').count(),0,'Country Master starts empty');
 assert.ok(await page.locator('.mw-state [data-mw="create"]').isVisible());
 await page.locator('.mw-state [data-mw="create"]').click();
 await page.locator('#mw-record-form').waitFor();
 for(const title of ['Country Information','Business Line Presence','Ownership','Record Information'])
  assert.ok(await page.locator('.mw-bl-section summary').filter({hasText:title}).count(),'Missing '+title+' section');
 await page.locator('#mw-record-form [name="name"]').fill('India');
 await page.locator('#mw-record-form [name="code"]').fill('IN');
 await page.locator('#mw-record-form [name="iso3"]').fill('IND');
 await page.locator('#mw-record-form [name="isoNumeric"]').fill('356');
 await page.locator('#mw-record-form [name="dialingCode"]').fill('+91');
 await page.locator('#mw-record-form [name="defaultCurrency"]').fill('INR');
 await page.locator('#mw-record-form [name="nationality"]').fill('Indian');
 await page.locator('#mw-record-form [name="continent"]').selectOption('Asia');
 await page.locator('#mw-record-form [name="businessLineIds"]').selectOption([lineId]);
 await page.locator('#mw-save').click();
 await page.locator('dialog').waitFor({state:'detached'});
 await page.waitForFunction(()=>document.querySelector('.rf-table tbody')?.textContent.includes('CN-001'));
 assert.ok(await page.locator('.rf-table tbody').innerText().then(t=>t.includes('India')));
 assert.equal(requests.filter(r=>r.path==='countries'&&r.method==='POST').length,1);
 await page.locator('.rf-table [data-mw="read"][data-record]').first().click();
 await page.locator('dialog[open]').waitFor();
 await page.locator('dialog[open]').getByText('Related / Used In',{exact:true}).waitFor();
 assert.match(await page.locator('dialog[open]').innerText(),/related \/ used in/i);
 assert.match(await page.locator('dialog[open]').innerText(),/STTS/);
 await page.locator('dialog[open] button').filter({hasText:'Edit Country'}).click();
 await page.locator('#mw-record-form [name="name"]').waitFor();
 assert.deepEqual(await page.locator('#mw-record-form [name="businessLineIds"]').evaluate(e=>[...e.selectedOptions].map(o=>o.value)),[lineId]);
 await page.locator('#mw-record-form [name="alias"]').fill('Bharat');
 await page.locator('#mw-save').click();
 await page.locator('dialog').waitFor({state:'detached'});
 assert.equal(records[0].alias,'Bharat');
 assert.equal(records[0].version,2);
 assert.deepEqual(errors,[],'No uncaught browser errors');
 console.log('Country Master browser acceptance passed: empty state, create, grouped form, mapping, view and edit');
}finally{await browser.close();await new Promise(r=>server.close(r));}
