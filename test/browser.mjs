import { createServer } from 'node:http';
import { readFile,mkdir } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { fields } from '../server/contracts.mjs';
const base=process.cwd();
const securityHeaders=JSON.parse(await readFile('vercel.json','utf8')).headers[0].headers;
const server=createServer(async(req,res)=>{
 try{
  for(const header of securityHeaders)res.setHeader(header.key,header.value);
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=resolve(base,'.'+(pathname==='/'?'/index.html':pathname));
  if(!path.startsWith(base+'/')){res.writeHead(403);res.end();return}
  const data=await readFile(path);
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'text/plain');
  res.end(data);
 }catch{res.writeHead(404);res.end()}
});
await new Promise(resolve=>server.listen(4173,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true});
try{
 await mkdir('work/browser',{recursive:true});
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 let loggedIn=false;let recoveryRequest=null,resetRequest=null,logoutCalls=0;
 const records=Object.fromEntries(['leads','customers','contacts','opportunities','activities','quotes','bookings','employees','branches'].map(name=>[name,[{...Object.fromEntries(fields[name].map(([key,,type,,choices])=>[key,type==='select'?choices[0]:type==='number'?1500:type==='email'?'ui-fixture@example.org':type==='date'?'2026-10-15':key==='scopeBranch'?'PUNE':'Long UI fixture record for responsive layout checks'])),id:'fixture-'+name,version:1}]]));
 await page.route('**/api/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname.replace('/api/','');
  let body={};
  if(path==='auth/me')body=loggedIn?{user:{id:'test',name:'Test Admin',email:'test@example.org',role:'admin',status:'approved',emailVerified:true},csrf:'csrf'}:{user:null};
  else if(path==='auth/forgot'){recoveryRequest=request.postDataJSON();body={message:'If eligible, a code has been sent.'}}
  else if(path==='auth/reset'){resetRequest=request.postDataJSON();body={message:'Password changed. Sign in with your new password.'}}
  else if(path==='auth/options')body={googleEnabled:false};
  else if(path==='auth/logout'){logoutCalls++;loggedIn=false;body={message:'Signed out'}}
  else if(path==='auth/login'){loggedIn=true;body={user:{id:'test',name:'Test Admin',email:'test@example.org',role:'admin',status:'approved',emailVerified:true},csrf:'csrf'}}
  else if(path.startsWith('records/')){
   const module=path.split('/')[1];
   if(request.method()==='POST'){const record={...request.postDataJSON(),id:'test-record',version:1};records[module].push(record);body={record}}
   else body={records:records[module]||[],next:null};
  }else if(path==='audit')body={audit:[]};
  else if(path==='access')body={users:[],next:null};
  else body={message:'Request accepted'};
  await route.fulfill({json:body});
 });
 await page.goto('http://127.0.0.1:4173');
 await page.locator('#googleSignIn').waitFor();assert.equal(await page.locator('#googleSignIn').isDisabled(),true);
 // Login must fit normal laptop browser heights without the bottom of the form being clipped.
 assert.ok(await page.evaluate(()=>document.querySelector('.auth-panel')!==null));
 assert.ok(await page.evaluate(()=>!!(document.querySelector('.auth-intro img')?.getAttribute('alt'))));
 assert.ok(await page.evaluate(()=>document.querySelector('#googleSignIn').compareDocumentPosition(document.querySelector('#authForm')) & Node.DOCUMENT_POSITION_FOLLOWING),'Google login should appear before email/password fields');
 for(const [width,height,fullFit] of [[1366,630,true],[1280,540,true],[1024,650,true],[390,700,true],[360,640,true],[320,568,false]]) {
  await page.setViewportSize({width,height});
  const layout=await page.evaluate(()=>{
   const card=document.querySelector('.auth-card').getBoundingClientRect();
   const button=document.querySelector('#submitAuth').getBoundingClientRect();
   const footer=document.querySelector('.auth-footer').getBoundingClientRect();
   return {width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,cardBottom:card.bottom,submitBottom:button.bottom,footerBottom:footer.bottom};
  });
  assert.ok(layout.width<=width+1,'Horizontal overflow on login '+width+'x'+height+': '+JSON.stringify(layout));
  assert.ok(layout.submitBottom<=height+1,'Sign in action is initially clipped at '+width+'x'+height+': '+JSON.stringify(layout));
  if(fullFit)assert.ok(layout.height<=height+1&&layout.footerBottom<=height+1,'Login does not fit viewport '+width+'x'+height+': '+JSON.stringify(layout));
 }
 await page.setViewportSize({width:1440,height:850});
 for(const width of [320,360,768,1440]){await page.setViewportSize({width,height:850});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:'work/browser/login-'+width+'.png',fullPage:true});}
 await page.locator('#authPassword').fill('visibility test');await page.locator('#showPassword').click();assert.equal(await page.locator('#authPassword').getAttribute('type'),'text');await page.locator('#showPassword').click();
 await page.getByRole('button',{name:'Forgot password?',exact:true}).click();
 await page.locator('#authEmail').fill('test@example.org');await page.locator('#submitAuth').click();await page.locator('#authCode').waitFor();assert.equal(recoveryRequest.method,'otp');
 for(const width of [320,360,768,1440]){await page.setViewportSize({width,height:850});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await page.locator('#authCode').fill('123456');await page.locator('#authPassword').fill('new OTP testing passphrase');await page.locator('#confirmPassword').fill('new OTP testing passphrase');await page.locator('#submitAuth').click();
 await page.locator('#rememberMe').waitFor();assert.equal(resetRequest.code,'123456');assert.equal(resetRequest.email,'test@example.org');assert.equal(new URL(page.url()).hash,'');
 await page.getByRole('button',{name:'Register',exact:true}).click();
 await page.locator('#authName').fill('Test Admin');await page.locator('#authEmail').fill('test@example.org');
 await page.locator('#authPassword').fill('a long testing passphrase');await page.locator('#confirmPassword').fill('a long testing passphrase');
 await page.locator('#submitAuth').click();await page.locator('#authCode').waitFor();
 assert.equal(await page.locator('#authCode').inputValue(),'');
 await page.getByRole('button',{name:'Back to sign in'}).click();
 await page.locator('#authPassword').fill('a long testing passphrase');await page.locator('#rememberMe').check();await page.locator('#submitAuth').click();
 await page.locator('#navigation [data-nav]').first().waitFor();
 assert.equal(await page.locator('#sidebar .brandmark').count(),0,'Sidebar logo should be removed');
 assert.equal((await page.locator('#sidebar .brand-copy').innerText()).trim(),'SCRM','Sidebar should show only SCRM');
 assert.equal(await page.locator('#sidebar .profile-copy small').count(),0,'Do not show Super Admin / approved status');
 assert.equal(await page.locator('#menuBtn').evaluate(node=>!!node.closest('#sidebar .brand')),true,'Desktop nav toggle belongs in the sidebar');
 assert.equal(await page.locator('.topbar #menuBtn').count(),0,'Desktop nav toggle must not occupy the topbar');
 assert.equal((await page.locator('#sidebarSignOut').innerText()).trim(),'Sign out','Sidebar must offer a footer sign out');
 const modules=['overview','mywork','analytics','leads','customers','contacts','opportunities','activities','quotes','bookings','employees','branches','modules','settings','audit'];
 let checks=0;
 for(const width of [320,360,768,1280,1440]){
  await page.setViewportSize({width,height:850});
  for(const module of modules){
   await page.evaluate(module=>document.querySelector('[data-nav="'+module+'"]').click(),module);
   await page.waitForTimeout(30);
   const extent=await page.evaluate(()=>({viewport:innerWidth,actual:document.documentElement.scrollWidth,bar:document.querySelector('.crm-module-workbar')?.getBoundingClientRect().right}));assert.ok(extent.actual<=extent.viewport+1,'Page overflow: '+module+' '+width+' '+JSON.stringify(extent));
   checks++;
  }
 }
 await page.setViewportSize({width:360,height:800});
 await page.locator('#mobileMenuBtn').click();await page.locator('#closeNav').waitFor({state:'visible'});await page.locator('#closeNav').click();
 await page.evaluate(()=>document.querySelector('[data-nav="leads"]').click());
 await page.locator('[data-action="new"]').click();
 await page.locator('#f_name').fill('Actual typed lead');
 await page.locator('#f_type').selectOption('Corporate');await page.locator('#f_branch').selectOption('Pune');await page.locator('#f_status').selectOption('New');await page.locator('#f_scopeBranch').fill('PUNE');await page.locator('#f_scopeLine').selectOption('STTS');
 await page.locator('#saveForm').click();
 await page.getByText('Record saved',{exact:true}).waitFor();
 assert.ok(records.leads.some(record=>record.name==='Actual typed lead'));
 records.leads.push({...records.leads[0],id:'fresh-export',name:'Fresh server-authorized export row'});
 const downloadPromise=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const download=await downloadPromise;
 assert.ok((await readFile(await download.path(),'utf8')).includes('Fresh server-authorized export row'));
 await page.screenshot({path:'work/browser/mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:900});await page.screenshot({path:'work/browser/laptop.png',fullPage:true});
 await page.locator('#sidebarSignOut').click();
 await page.locator('#authPassword').waitFor();
 assert.equal(logoutCalls,1,'Sidebar sign out should use the protected server logout request');
 await page.goto('http://127.0.0.1:4173/#reset='+'a'.repeat(64)+'&email=test%40example.org');
 await page.locator('#confirmPassword').waitFor();
 assert.equal(new URL(page.url()).hash,'');
 assert.equal((await page.locator('body').innerText()).includes('a'.repeat(64)),false);
 assert.deepEqual(errors,[]);
 console.log(checks+' module/viewport overflow checks passed; registration/login/reset UI, mobile navigation and record form checked');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
