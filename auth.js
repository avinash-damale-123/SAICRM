(() => {
 'use strict';
 const root=document.querySelector('#authRoot'), app=document.querySelector('#app');
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let email='', csrf='', user=null, loaded=false, mode='login', resetToken='';
 function captureReset(){const params=new URLSearchParams(location.hash.slice(1));if(!params.has('reset'))return false;resetToken=params.get('reset');email=params.get('email')||'';mode='reset';history.replaceState(null,'',location.pathname);document.querySelector('#overlay').classList.add('hidden');return true}
 captureReset();window.addEventListener('hashchange',()=>{if(captureReset())draw()});
 async function api(path,method='GET',body) {
  const response=await fetch('/api/'+path,{method,credentials:'same-origin',cache:'no-store',headers:{...(method==='GET'?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf})},body:method==='GET'?undefined:JSON.stringify(body||{})});
  let result;try{result=await response.json()}catch{throw Error('The CRM service is unavailable')}
  if(!response.ok){const error=new Error(result.error||'Request failed');error.status=response.status;
   if(response.status===401 && loaded){app.hidden=true;document.querySelector('#overlay').classList.add('hidden');root.hidden=false;user=null;draw('Your session has expired. Sign in again.');}
   throw error;
  }
  return result;
 }
 function can(module,action='read') {
  if(!user||user.status!=='approved'||!user.emailVerified)return false;
  if(['employees','branches','audit','access'].includes(module))return user.role==='admin';
  if(action==='read')return true;
  if(action==='delete')return ['admin','manager'].includes(user.role);
  return user.role!=='viewer';
 }
 async function pages(path,key) {
  let cursor='',rows=[];
  do {const result=await api(path+(cursor?'?cursor='+encodeURIComponent(cursor):''));rows.push(...result[key]);cursor=result.next||'';}while(cursor);
  return rows;
 }
 const readModule=module=>pages('records/'+module,'records');
 async function loadRecords(){
  const db={audit:[]};
  await Promise.all(['leads','customers','contacts','opportunities','activities','quotes','bookings','employees','branches'].map(async module=>{db[module]=can(module)?await readModule(module):[]}));
  return db;
 }
 function script(src){return new Promise((resolve,reject)=>{const element=document.createElement('script');element.src=src;element.onload=resolve;element.onerror=()=>reject(Error('Unable to load CRM interface'));document.body.append(element)})}
 async function enter(session){
  user=session.user;csrf=session.csrf||'';window.SCRM.user=user;
  root.hidden=true;app.hidden=false;
  document.querySelector('.profile-copy b').textContent=user.name;
  document.querySelector('.profile-copy small').textContent=user.role+' · approved';
  document.querySelector('.profile').title=user.email;
  document.querySelector('.top-avatar').title=user.email;
  if(loaded){location.reload();return}
  loaded=true;await script('/app.js');await window.SCRM.appReady;await script('/responsive.js');
 }
 const titles={login:'Sign in to SCRM',register:'Request CRM access',verify:'Verify your email',forgot:'Reset your password',reset:'Choose a new password'};
 function draw(message=''){
  app.hidden=true;root.hidden=false;
  const password=['login','register','reset'].includes(mode), wantsEmail=mode!=='reset';
  root.innerHTML='<div class="auth-card"><div class="brandmark">S</div><p class="eyebrow">SATGURU ENTERPRISE CRM</p><h1>'+titles[mode]+'</h1><p class="subtle">'+(mode==='register'?'Verify your email, then wait for administrator approval.':mode==='verify'?'Enter the six-digit code sent to your email. Codes expire after 15 minutes.':mode==='forgot'?'We will email a single-use reset link if the account is eligible.':mode==='reset'?'Reset links expire after 15 minutes and can be used once.':'Use your approved work account. Sessions expire after 12 hours.')+'</p><p id="authMessage" class="auth-message" role="status">'+esc(message)+'</p><form id="authForm">'+(mode==='register'?'<label for="authName">Full name</label><input class="input" id="authName" name="name" autocomplete="name" required maxlength="120">':'')+(wantsEmail?'<label for="authEmail">Work email</label><input class="input" id="authEmail" name="email" type="email" autocomplete="email" value="'+esc(email)+'" maxlength="254" required>':'')+(password?'<label for="authPassword">Password</label><input class="input" id="authPassword" name="password" type="password" autocomplete="'+(mode==='login'?'current-password':'new-password')+'" minlength="'+(mode==='login'?1:12)+'" maxlength="128" required><button class="mini-link password-toggle" type="button" id="showPassword" aria-pressed="false">Show password</button>'+(mode==='login'?'':'<small>Use 12–128 characters. A long, unique passphrase is recommended.</small><label for="confirmPassword">Confirm password</label><input class="input" id="confirmPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required>'):'')+(mode==='verify'?'<label for="authCode">Email verification code</label><input class="input" id="authCode" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" required>':'')+'<button id="submitAuth" class="btn primary" type="submit">'+(mode==='login'?'Sign in':mode==='register'?'Register & send code':mode==='verify'?'Verify email':mode==='forgot'?'Email reset link':'Change password')+'</button></form><nav class="auth-links" aria-label="Account options">'+(mode==='login'?'<button data-mode="register">Register</button><button data-mode="forgot">Forgot password?</button><button data-mode="verify">Verify email / resend code</button>':'<button data-mode="login">Back to sign in</button>')+(mode==='verify'?'<button id="resendCode">Resend verification code</button>':'')+'</nav></div>';
  root.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{email=document.querySelector('#authEmail')?.value||email;mode=button.dataset.mode;draw()});
  document.querySelector('#showPassword')?.addEventListener('click',event=>{const input=document.querySelector('#authPassword');const show=input.type==='password';input.type=show?'text':'password';event.target.textContent=show?'Hide password':'Show password';event.target.setAttribute('aria-pressed',String(show))});
  const note=text=>{document.querySelector('#authMessage').textContent=text};
  document.querySelector('#resendCode')?.addEventListener('click',async event=>{
   const input=document.querySelector('#authEmail');if(!input.reportValidity())return;email=input.value;event.target.disabled=true;
   try{note((await api('auth/resend','POST',{email})).message)}catch(error){note(error.message)}finally{event.target.disabled=false}
  });
  document.querySelector('#authForm').onsubmit=async event=>{
   event.preventDefault();const form=event.target;if(!form.reportValidity())return;
   const confirm=document.querySelector('#confirmPassword');if(confirm&&confirm.value!==form.password.value){note('Passwords do not match');confirm.focus();return}
   const body=Object.fromEntries(new FormData(form).entries());if(mode==='reset'){body.token=resetToken;body.email=email}else{email=body.email}
   const button=document.querySelector('#submitAuth');button.disabled=true;note('Working…');
   try{const result=await api('auth/'+mode,'POST',body);
    if(mode==='login'){await enter(result);return}
    if(mode==='register'){mode='verify';draw(result.message);return}
    if(mode==='reset'){resetToken='';mode='login';draw(result.message);return}
    note(result.message);if(mode==='verify')document.querySelector('#authCode').value='';
   }catch(error){note(error.message)}finally{button.disabled=false}
  };
 }
 async function manageAccess(){
  if(!can('access')){alert('Administrator access required');return}
  const overlay=document.querySelector('#overlay'),body=document.querySelector('#modalBody');
  document.querySelector('#modalTitle').textContent='User access & approvals';
  document.querySelector('#modalFooter').innerHTML='';
  body.innerHTML='<p>Loading accounts…</p>';overlay.classList.remove('hidden');overlay.setAttribute('aria-hidden','false');
  try{
   const users=await pages('access','users');
   body.innerHTML='<p>Approve only verified employees. Non-admin access requires branch/business-line pairs, e.g. PUNE:STTS, DUBAI:CAR. Administrator accounts have all scopes.</p><p id="accessMessage" role="status"></p>'+users.map(account=>'<form class="access-row" data-account="'+esc(account.id)+'"><b>'+esc(account.name)+'</b><span>'+esc(account.email)+' · '+(account.emailVerified?'Email verified':'Awaiting verification')+'</span><label>Role<select class="select" name="role">'+['member','viewer','manager','admin'].map(role=>'<option '+(account.role===role?'selected':'')+'>'+role+'</option>').join('')+'</select></label><label>Status<select class="select" name="status">'+['pending','approved','rejected','suspended'].map(status=>'<option '+(account.status===status?'selected':'')+'>'+status+'</option>').join('')+'</select></label><label>Scope pairs<input class="input" name="scopePairs" value="'+esc((account.scopes||[]).map(s=>s.branch+':'+s.line).join(', '))+'" placeholder="PUNE:STTS, DUBAI:CAR"></label><button class="btn primary" '+(account.id===user.id?'disabled':'')+'>Save access</button></form>').join('');
   body.querySelectorAll('form').forEach(form=>form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;try{const result=await api('access/'+form.dataset.account,'PUT',(()=>{const data=Object.fromEntries(new FormData(form).entries());data.scopes=data.scopePairs.split(',').map(s=>s.trim()).filter(Boolean).map(pair=>{const [branch,line,...extra]=pair.split(':');return {branch:extra.length?'':branch,line}});delete data.scopePairs;return data})());document.querySelector('#accessMessage').textContent=result.message}catch(error){document.querySelector('#accessMessage').textContent=error.message}finally{button.disabled=false}});
  }catch(error){body.textContent=error.message}
 }
 function fail(error){app.hidden=true;root.hidden=false;draw(error.message)}
 window.SCRM={api,loadRecords,readModule,can,manageAccess,fail,user:null};
 async function checkSession(){if(app.hidden||!user)return;try{const current=await api('auth/me');if(!current.user||!current.user.emailVerified||current.user.status!=='approved'){user=null;csrf='';window.SCRM.user=null;document.querySelector('#overlay').classList.add('hidden');draw('Your session or access has ended. Sign in again.');return}if(current.user.role!==user.role||JSON.stringify(current.user.scopes||[])!==JSON.stringify(user.scopes||[]))location.reload()}catch(error){fail(error)}}
 window.addEventListener('focus',checkSession);document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkSession()});setInterval(checkSession,60000);
 document.querySelector('#logoutBtn').onclick=async()=>{
  try{await api('auth/logout','POST',{csrf});location.replace('/')}catch(error){alert(error.message)}
 };
 draw('Checking session…');
 api('auth/me').then(session=>{if(mode==='reset'){draw();return}if(session.user?.emailVerified&&session.user.status==='approved')return enter(session);draw()}).catch(error=>draw(error.message));
})();
