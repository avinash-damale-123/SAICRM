
(()=>{'use strict';
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let stickyBound=false;
function user(){return window.SCRM?.user||{}}
function classify(text=''){const t=text.toLowerCase();if(/fail|error|unable|not permitted|rejected|invalid/.test(t))return'error';if(/partial|warning|some|skipped|attention/.test(t))return'warning';if(/success|saved|created|updated|archived|restored|ready|completed|imported|export/.test(t))return'success';return'info'}
function styleFeedback(){ [...document.querySelectorAll('.mw-feedback:not([hidden]),#toast:not(.hidden)')].forEach(el=>{const next='r10-'+classify(el.textContent),states=['r10-success','r10-warning','r10-error','r10-info'];if(el.classList.contains(next)&&states.every(name=>name===next||!el.classList.contains(name)))return;el.classList.remove(...states);el.classList.add(next);});}
function progress(){
 if($('#r10-progress'))return;const p=document.createElement('div');p.id='r10-progress';p.setAttribute('aria-hidden','true');document.body.append(p);
 const original=window.fetch;let pending=0,timer;
 window.fetch=async function(...args){const url=String(args[0]?.url||args[0]||'');const tracked=url.includes('/api/');if(tracked){pending++;clearTimeout(timer);timer=setTimeout(()=>p.classList.toggle('r10-visible',pending>0),180)}try{return await original.apply(this,args)}finally{if(tracked){pending=Math.max(0,pending-1);if(!pending){clearTimeout(timer);p.classList.remove('r10-visible')}}}};
}
function breadcrumb(){
 const el=$('.topbar .breadcrumb');if(!el||el.dataset.r10)return;el.dataset.r10='1';el.tabIndex=0;el.title='Scroll horizontally to view the full path';
 el.addEventListener('wheel',e=>{if(el.scrollWidth<=el.clientWidth)return;if(Math.abs(e.deltaX)>Math.abs(e.deltaY))return;el.scrollLeft+=e.deltaY;e.preventDefault()},{passive:false});
}
function passwordUI(menu){
 if(menu.querySelector('.r10-profile-actions'))return;const u=user(),logout=$('#logoutBtn');menu.classList.add('r10-profile-menu');menu.innerHTML='<div class="r10-profile-head"><div class="r10-profile-avatar">'+esc((u.name||u.email||'U').split(/\s+/).map(v=>v[0]).slice(0,2).join('').toUpperCase())+'</div><div class="r10-profile-meta"><strong>'+esc(u.name||'User')+'</strong><small>'+esc(u.email||'')+'</small></div></div><div class="r10-profile-actions"><button type="button" data-r10-profile>View Profile</button><details class="r10-password"><summary>Change Password</summary><form class="r10-password-form"><label>Current password<input name="currentPassword" type="password" autocomplete="current-password" minlength="1" maxlength="128" required></label><label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><button type="submit">Update Password</button><p class="r10-password-message" role="status"></p></form></details><button type="button" class="r10-profile-logout" data-r10-logout>Sign out</button><div class="crm-profile-logout-slot" hidden></div></div>';if(logout)menu.querySelector('.crm-profile-logout-slot').append(logout);
 menu.querySelector('[data-r10-logout]').onclick=()=>logout?.click();
 menu.querySelector('[data-r10-profile]').onclick=()=>showProfile();
 const form=menu.querySelector('.r10-password-form');form.onsubmit=async e=>{e.preventDefault();const out=form.querySelector('.r10-password-message'),b=form.querySelector('button');b.disabled=true;out.textContent='Updating password…';out.className='r10-password-message';try{const f=new FormData(form);const result=await window.SCRM.api('auth/change-password','POST',{currentPassword:f.get('currentPassword'),newPassword:f.get('newPassword')});out.textContent=result.message||'Password updated successfully.';out.style.color='#176346';form.reset()}catch(err){out.textContent=err.message;out.style.color='#a5232b'}finally{b.disabled=false}};
}
function profile(){
 const menu=$('.crm-profile-menu');if(menu)passwordUI(menu);
 const bottom=$('.sidebar-bottom');if(bottom&&!bottom.querySelector('[data-r10-my-profile]')){const b=document.createElement('button');b.type='button';b.className='r10-sidebar-profile-link';b.dataset.r10MyProfile='1';b.innerHTML='<span class="nav-icon" aria-hidden="true">◎</span><span>My Profile</span>';b.onclick=showProfile;bottom.insertBefore(b,bottom.firstElementChild)}
}
function showProfile(){
 const ws=window.SCRM?.activeWorkspace;if(ws&&!ws.canLeave?.())return;ws?.destroy?.(true);window.SCRM.activeWorkspace=null;
 const u=user(),content=$('#content');if(!content)return;content.className='content';content.innerHTML='<section class="r10-profile-page"><h1>My Profile</h1><p>Account information and personal CRM preferences.</p><div class="r10-profile-card"><dl><dt>Full Name</dt><dd>'+esc(u.name||'—')+'</dd><dt>Email ID</dt><dd>'+esc(u.email||'—')+'</dd><dt>Role</dt><dd>'+esc(u.systemRole==='super_admin'?'Super Admin':u.role||'—')+'</dd><dt>Account Status</dt><dd>'+esc(u.status||'—')+'</dd></dl><p>Additional profile settings will be added after the core CRM modules are completed.</p></div></section>';
 $('.nav-item,[data-r10-my-profile]').forEach(n=>n.classList.toggle('active',n.hasAttribute('data-r10-my-profile')));$('.crm-profile-menu')?.setAttribute('hidden','');
 window.scrollTo(0,0);
}
function menus(){
 $$('.mw-settings-menu').forEach(details=>{if(details.dataset.r10)return;details.dataset.r10='1';details.addEventListener('toggle',()=>{if(details.open)$$('.mw-settings-menu[open]').forEach(d=>{if(d!==details)d.open=false})})});
}
function closeMenus(e){if(!e.target.closest('.mw-settings-menu'))$$('.mw-settings-menu[open]').forEach(d=>d.open=false)}
function lifecycle(){
 $$('.rf-table tbody tr').forEach(tr=>{if(tr.dataset.r10Life)return;const id=tr.querySelector('[data-record-id]')?.dataset.recordId;if(!id)return;const cards=window.SCRM?.activeWorkspace;const name=tr.querySelector('[data-cell-key="name"]');if(!name)return;const txt=tr.innerText;let kind='';if(/Restore Deleted/.test(txt))kind='deleted';else if(/Unarchive/.test(txt))kind='archived';if(kind){const b=document.createElement('span');b.className='rf-lifecycle-badge rf-lifecycle-'+kind;b.textContent=kind==='deleted'?'Deleted':'Archived';name.append(b)}tr.dataset.r10Life='1'});
}
function stickyOffsets(){
 const root=document.documentElement,top=$('.topbar'),module=$('.crm-module-host');
 const topH=Math.ceil(top?.getBoundingClientRect().height||0),moduleH=Math.ceil(module?.getBoundingClientRect().height||0);
 root.style.setProperty('--scrm-topbar-h',topH+'px');root.style.setProperty('--scrm-modulebar-h',moduleH+'px');
 return {topH,moduleH,base:topH+moduleH};
}
function updateStickyTables(){
 const offsets=stickyOffsets();
 $$('.rf-table-wrap').forEach(wrap=>wrap._r10StickyUpdate?.(offsets));
}
function scrollbars(){
 const mobile=matchMedia('(max-width:700px)').matches;
 $$('.rf-table-wrap').forEach(wrap=>{if(wrap.dataset.r10Scroll)return;wrap.dataset.r10Scroll='1';
  const top=document.createElement('div');top.className='r10-hscroll';top.setAttribute('aria-label','Horizontal table scroll');top.tabIndex=0;const inner=document.createElement('div');top.append(inner);wrap.before(top);
  const sticky=document.createElement('div');sticky.className='r10-sticky-head';sticky.hidden=true;top.after(sticky);
  let syncing=false,lastHead='',cloneTable=null;
  const rebuild=()=>{
   const table=wrap.querySelector('.rf-table'),thead=table?.querySelector('thead');if(!table||!thead)return;
   const signature=[...thead.querySelectorAll('th')].map(th=>th.dataset.columnKey||th.className).join('|')+'|'+thead.innerText;
   if(signature===lastHead&&cloneTable?.isConnected)return;lastHead=signature;sticky.replaceChildren();cloneTable=document.createElement('table');cloneTable.className='mw-table r10-sticky-table';const cloneHead=thead.cloneNode(true);cloneHead.querySelectorAll('.mw-column-resizer').forEach(grip=>grip.remove());const select=cloneHead.querySelector('#mw-select-page');if(select){select.id='r10-sticky-select-page';select.addEventListener('change',()=>{const original=wrap.querySelector('#mw-select-page');if(original){original.checked=select.checked;original.dispatchEvent(new Event('change',{bubbles:true}));}})}cloneTable.append(cloneHead);sticky.append(cloneTable);
  };
  const syncSize=()=>{inner.style.width=Math.max(wrap.scrollWidth,wrap.clientWidth)+'px';top.scrollLeft=wrap.scrollLeft;rebuild();};
  const update=offsets=>{
   if(!wrap.isConnected)return;syncSize();const table=wrap.querySelector('.rf-table'),thead=table?.querySelector('thead');if(!table||!thead){top.hidden=true;sticky.hidden=true;return;}
   const rect=wrap.getBoundingClientRect(),overflow=wrap.scrollWidth>wrap.clientWidth+2,bottomVisible=rect.bottom<=innerHeight-3&&rect.bottom>offsets.base+8,tablePast=rect.bottom<=offsets.base+8;
   top.hidden=!overflow||mobile||bottomVisible||tablePast;
   const topScrollH=top.hidden?0:Math.ceil(top.getBoundingClientRect().height||18),stickyTop=offsets.base+topScrollH,headRect=thead.getBoundingClientRect(),showSticky=!mobile&&headRect.top<stickyTop&&rect.bottom>stickyTop+Math.max(30,headRect.height);
   sticky.hidden=!showSticky;
   if(showSticky&&cloneTable){sticky.style.top=stickyTop+'px';sticky.style.left=Math.round(rect.left)+'px';sticky.style.width=Math.round(rect.width)+'px';cloneTable.style.width=Math.max(table.scrollWidth,wrap.clientWidth)+'px';cloneTable.style.transform='translateX('+(-wrap.scrollLeft)+'px)';const originalSelect=wrap.querySelector('#mw-select-page'),cloneSelect=sticky.querySelector('#r10-sticky-select-page');if(originalSelect&&cloneSelect){cloneSelect.checked=originalSelect.checked;cloneSelect.indeterminate=originalSelect.indeterminate;}}
  };
  wrap._r10StickyUpdate=update;syncSize();
  top.onscroll=()=>{if(syncing)return;syncing=true;wrap.scrollLeft=top.scrollLeft;syncing=false;update(stickyOffsets());};
  wrap.addEventListener('scroll',()=>{if(!syncing){syncing=true;top.scrollLeft=wrap.scrollLeft;syncing=false;}if(cloneTable)cloneTable.style.transform='translateX('+(-wrap.scrollLeft)+'px)';resultsCloseMenus(wrap);});
  const resultsCloseMenus=target=>target.closest('.mw-results')?.querySelectorAll('.rf-row-more[open]').forEach(m=>m.open=false);
  new ResizeObserver(()=>update(stickyOffsets())).observe(wrap);new MutationObserver(()=>update(stickyOffsets())).observe(wrap,{subtree:true,childList:true,attributes:true});
  wrap.addEventListener('wheel',e=>{if(e.shiftKey&&Math.abs(e.deltaY)>0){wrap.scrollLeft+=e.deltaY;e.preventDefault()}},{passive:false});
  update(stickyOffsets());
 });
 if(!stickyBound){stickyBound=true;window.addEventListener('scroll',updateStickyTables,{passive:true});window.addEventListener('resize',updateStickyTables,{passive:true});}
 updateStickyTables();
}
function autoFit(){
 $$('.mw-column-resizer').forEach(grip=>{if(grip.dataset.r10Fit)return;grip.dataset.r10Fit='1';grip.title=(grip.title?grip.title+'. ':'')+'Double-click to auto-fit';grip.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();const th=grip.closest('th'),key=grip.dataset.resize,table=grip.closest('table');if(!th||!key||!table)return;const title=th.querySelector('.rf-column-title')?.scrollWidth||th.scrollWidth;let max=title+42;table.querySelectorAll('[data-cell-key="'+CSS.escape(key)+'"]').forEach(td=>{const child=td.firstElementChild||td;max=Math.max(max,Math.min(child.scrollWidth+24,360))});const width=Math.max(90,Math.min(360,Math.ceil(max)));th.style.width=th.style.minWidth=th.style.maxWidth=width+'px';table.querySelectorAll('[data-cell-key="'+CSS.escape(key)+'"]').forEach(td=>td.style.width=td.style.minWidth=td.style.maxWidth=width+'px');grip.setAttribute('aria-valuenow',String(width));grip.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))})});
}
function feedbackObserver(){styleFeedback();new MutationObserver(()=>styleFeedback()).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden','class']})}
function enhance(){breadcrumb();profile();menus();lifecycle();stickyOffsets();scrollbars();autoFit();styleFeedback()}
document.addEventListener('pointerdown',closeMenus,true);document.addEventListener('keydown',e=>{if(e.key==='Escape')$$('.mw-settings-menu[open]').forEach(d=>d.open=false)});
progress();feedbackObserver();new MutationObserver(enhance).observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('load',enhance);setTimeout(enhance,0);
})();
