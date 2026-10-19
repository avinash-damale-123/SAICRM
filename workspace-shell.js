(() => {
'use strict';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const modules = new Set(['leads','customers','contacts','opportunities','activities','quotes','bookings','employees','branches','businesslines']);
const names = {home:'Home',overview:'Overview',mywork:'My Work',analytics:'Analytics',leads:'Leads',customers:'Customers',contacts:'People & Contacts',opportunities:'Opportunities',activities:'Activities',quotes:'Quotations',bookings:'Bookings',employees:'Employees & Access',branches:'Branch Network',businesslines:'Business Lines',settings:'Settings & Masters',modules:'Module Directory',audit:'Audit Trail',notifications:'Notifications',access:'Access Approvals'};
let searchInput,scopeBtn,scopeMenu,searchResults,noticeMenu,profileMenu,queryTimer,sequence=0,current='',scope='module',resultItems=[],activeResult=0,notificationItems=[],noticeLoading=false;
const userId = () => window.SCRM?.user?.id || 'anonymous';
const readKey = () => 'scrm:notification-read:'+userId();
function seen(){
 try {const records=JSON.parse(localStorage.getItem(readKey()));return new Set(Array.isArray(records)?records:[])}catch{return new Set()}
}
function markSeen(ids){
 const read=seen();ids.forEach(id=>read.add(id));
 try{localStorage.setItem(readKey(),JSON.stringify([...read].slice(-200)))}catch{}
 drawNoticeBadge();renderNoticeMenu();renderNotificationsPage(notificationItems);
}
function label(id){return names[id]||id.replace(/([A-Z])/g,' $1')}
function activeModule(){const p=window.SCRM?.currentPage?.();return modules.has(p)?p:null}
function allowedModule(id){return id!=='businesslines'||window.SCRM?.can?.('businesslines')}
function placeCrumbs(p){
 const chain=p==='businesslines'?[['home','Home'],['settings','Settings & Masters'],['businesslines','Business Lines']]:
  p==='settings'?[['home','Home'],['settings',label(p)]]:
  p==='home'?[['home','Home']]:[['home','Home'],[p,label(p)]];
 const nav=$('.breadcrumb');if(!nav)return;
 nav.setAttribute('aria-label','Breadcrumb');
 nav.innerHTML=chain.map(([id,name],i)=>
  (i?'<span class="crumb-divider" aria-hidden="true">›</span>':'')+
  (i===chain.length-1?'<strong id="crumb" aria-current="page" title="'+esc(name)+'">'+esc(name)+'</strong>':'<button type="button" class="crm-crumb" data-crumb="'+esc(id)+'" aria-label="Open '+esc(name)+'" title="Open '+esc(name)+'">'+(id==='home'?'⌂ ':'')+esc(name)+'</button>')
 ).join('');
 nav.querySelectorAll('[data-crumb]').forEach(button=>button.onclick=()=>window.SCRM.navigateTo(button.dataset.crumb));
}
function closeScope(){if(scopeMenu){scopeMenu.hidden=true;scopeBtn?.setAttribute('aria-expanded','false')}}
function hideResults(){if(searchResults){searchResults.hidden=true;searchResults.innerHTML=''}resultItems=[];activeResult=0}
function closeNotice(){if(noticeMenu)noticeMenu.hidden=true}
function closeProfile(){if(profileMenu)profileMenu.hidden=true}
function focusSearch(){
 if($('#app')?.hidden)return false;
 searchInput?.focus();
 searchInput?.select();
 if(searchInput?.value.trim())search(searchInput.value.trim());
 return true;
}
function updateScopeDisplay(){
 if(!scopeBtn)return;
 scopeBtn.innerHTML=(scope==='global'?'🌐 Global':'⌕ This module')+' <span aria-hidden="true">⌄</span>';
 scopeBtn.title=scope==='global'?'Search records across authorized CRM modules':'Search only the current module. Click to switch to Global.';
 scopeMenu?.querySelectorAll('[data-search-scope]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.searchScope===scope)));
}
function changeScope(next){
 if(next==='module'&&!activeModule())next='global';
 scope=next;closeScope();updateScopeDisplay();
 if(searchInput?.value.trim())search(searchInput.value.trim());else hideResults();
 if(scope==='module')window.SCRM?.setModuleSearch?.(searchInput?.value||'');
 else if(activeModule())window.SCRM?.setModuleSearch?.('');
 searchInput?.focus();
}
function updatePlaceholder(p){
 if(!searchInput)return;
 searchInput.placeholder=scope==='global'?'Search across CRM modules…':('Search '+label(p).toLowerCase()+' by name, ID, or keyword…');
 searchInput.setAttribute('aria-label',scope==='global'?'Global CRM search':'Search '+label(p)+' records');
}
function onRender(p){
 placeCrumbs(p);
 if($('#content'))$('#content').classList.toggle('crm-content-module',modules.has(p));
}
function onNavigate(p){
 current=p;scope=activeModule()?'module':'global';
 sequence++;clearTimeout(queryTimer);
 if(searchInput)searchInput.value='';
 hideResults();closeNotice();closeProfile();closeScope();
 updateScopeDisplay();updatePlaceholder(p);onRender(p);
 if(p==='notifications')refreshNotifications();
}
function resultList(items,query){
 const grouped=new Map();
 for(const item of items){if(!allowedModule(item.module))continue;const group=label(item.module);if(!grouped.has(group))grouped.set(group,[]);grouped.get(group).push(item)}
 let pos=0;
 let out='<div class="crm-search-list-head"><strong>'+esc(scope==='global'?'Global results':'Results in '+label(activeModule()||'home'))+'</strong><small>'+items.length+' match'+(items.length===1?'':'es')+'</small></div>';
 if(!items.length)out+='<div class="crm-search-empty">No matching records found for “'+esc(query)+'”.</div>';
 for(const [group,values] of grouped){
  out+='<div class="crm-search-group"><span>'+esc(group)+'</span><small>'+values.length+' found</small></div>';
  for(const value of values){
   const id=pos++;
   out+='<button type="button" class="crm-search-result" role="option" aria-selected="false" data-result="'+id+'"><span class="crm-result-icon" aria-hidden="true">▤</span><span class="crm-result-copy"><b>'+esc(value.title)+'</b><small>'+esc(value.detail||group)+'</small></span>'+(value.status?'<span class="crm-result-status">'+esc(value.status)+'</span>':'')+'<span aria-hidden="true">↗</span></button>';
  }
 }
 resultItems=[...grouped.values()].flat();activeResult=0;
 out+='<div class="crm-search-tip">Search results respect your branch, business-line and module access. Press Enter to open a result.</div>';
 searchResults.innerHTML=out;searchResults.hidden=false;
 const buttons=searchResults.querySelectorAll('[data-result]');
 buttons.forEach((button,i)=>{
  button.addEventListener('click',()=>openResult(i));
  if(i===0)button.classList.add('highlight');
  button.onmouseenter=()=>highlight(i);
 });
}
function highlight(i){
 const all=[...searchResults.querySelectorAll('[data-result]')];if(!all.length)return;
 activeResult=(i+all.length)%all.length;
 all.forEach((el,n)=>{el.classList.toggle('highlight',n===activeResult);el.setAttribute('aria-selected',String(n===activeResult))});
}
async function openResult(i){
 const row=resultItems[i];if(!row)return;
 hideResults();searchInput.value='';
 await window.SCRM.navigateRecord(row.module,row.id,row.title);
}
function search(text){
 const query=text.trim();
 sequence++;const mine=sequence;clearTimeout(queryTimer);
 if(scope==='module'&&activeModule())window.SCRM?.setModuleSearch?.(query);
 if(query.length<2){
  if(!query)hideResults();
  else{searchResults.innerHTML='<div class="crm-search-empty">Type at least 2 characters to search.</div>';searchResults.hidden=false}
  return;
 }
 searchResults.hidden=false;searchResults.innerHTML='<div class="crm-search-empty">Searching authorized CRM records…</div>';
 queryTimer=setTimeout(async()=>{
  try{
   const params=new URLSearchParams({q:query,scope,module:activeModule()||''});
   const result=await window.SCRM.api('search?'+params.toString());
   if(mine!==sequence||$('#app').hidden)return;
   resultList(result.results||[],query);
  }catch(error){
   if(mine!==sequence)return;
   searchResults.innerHTML='<div class="crm-search-empty" role="alert">'+esc(error.message||'Search could not be completed')+'</div>';
   searchResults.hidden=false;
  }
 },230);
}
function mountSearch(){
 const old=$('#globalSearchBtn');if(!old)return;
 const region=document.createElement('div');
 region.id='globalSearchBtn';region.className='crm-global-search';region.setAttribute('role','search');
 region.innerHTML='<span class="crm-search-symbol" aria-hidden="true">⌕</span><input id="crmSearchInput" type="search" autocomplete="off" spellcheck="false" aria-label="Search CRM" aria-controls="crmSearchResults" placeholder="Search this module…"/><kbd>Ctrl K</kbd><button type="button" id="crmScopeBtn" class="crm-scope-button" aria-label="Search scope" aria-expanded="false">This module⌄</button><div id="crmScopeMenu" class="crm-scope-menu" hidden><button type="button" data-search-scope="module" aria-pressed="true">⌕ This module<small>Search within the current module</small></button><button type="button" data-search-scope="global" aria-pressed="false">🌐 Global<small>Search across authorized modules</small></button></div><div id="crmSearchResults" class="crm-search-results" role="listbox" hidden></div>';
 old.replaceWith(region);
 searchInput=$('#crmSearchInput');scopeBtn=$('#crmScopeBtn');scopeMenu=$('#crmScopeMenu');searchResults=$('#crmSearchResults');
 region.onclick=event=>{if(event.target===region)focusSearch()};
 searchInput.onfocus=()=>{if(searchInput.value.trim())search(searchInput.value)};
 searchInput.oninput=()=>search(searchInput.value);
 searchInput.onkeydown=event=>{
  if(event.key==='Escape'){hideResults();searchInput.blur();return}
  if(event.key==='ArrowDown'){event.preventDefault();highlight(activeResult+1)}
  if(event.key==='ArrowUp'){event.preventDefault();highlight(activeResult-1)}
  if(event.key==='Enter'&&resultItems.length&&!searchResults.hidden){event.preventDefault();openResult(activeResult)}
 };
 scopeBtn.onclick=event=>{event.stopPropagation();scopeMenu.hidden=!scopeMenu.hidden;scopeBtn.setAttribute('aria-expanded',String(!scopeMenu.hidden))};
 scopeMenu.querySelectorAll('[data-search-scope]').forEach(item=>item.onclick=()=>{changeScope(item.dataset.searchScope);updatePlaceholder(activeModule()||'home')});
 updateScopeDisplay();updatePlaceholder(current||'home');
}
function drawNoticeBadge(){
 const bell=$('#notifBtn');if(!bell)return;
 const read=seen(),unread=notificationItems.filter(item=>!read.has(item.id)).length;
 bell.setAttribute('aria-label',unread?('Notifications, '+unread+' unread on this device'):'Notifications');
 bell.title=unread?unread+' unread CRM updates on this device':'CRM notifications';
 const dot=bell.querySelector('i');if(dot)dot.hidden=unread===0;
}
function fmtTime(value){
 if(!value)return '';
 try{return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value))}
 catch{return ''}
}
function notificationMarkup(items,compact=false){
 const read=seen();
 if(!items.length)return '<div class="crm-notice-empty">No recent CRM updates or pending approvals in your access scope.</div>';
 return items.map((item,i)=>'<button type="button" class="crm-notice-item '+(read.has(item.id)?'read':'unread')+'" data-notice="'+i+'" title="Open related '+esc(label(item.module))+' record"><span class="crm-notice-type">'+(item.kind==='approval'?'✓':'▤')+'</span><span class="crm-notice-copy"><b>'+esc(item.title)+'</b><small>'+esc(item.detail||label(item.module))+'</small></span><time>'+esc(fmtTime(item.createdAt))+'</time></button>').join('');
}
function renderNoticeMenu(){
 if(!noticeMenu)return;
 const list=noticeMenu.querySelector('#crmNoticePreview');
 list.innerHTML=notificationMarkup(notificationItems.slice(0,6),true);
 list.querySelectorAll('[data-notice]').forEach(button=>button.onclick=()=>openNotification(Number(button.dataset.notice)));
}
function renderNotificationsPage(items=notificationItems){
 const page=$('#crm-notification-list');if(!page)return;
 page.innerHTML='<div class="crm-notice-toolbar"><span>'+items.length+' recent update'+(items.length===1?'':'s')+'</span><button type="button" class="crm-notice-mark">Mark all as read <small>(this device)</small></button></div><div class="crm-notice-list">'+notificationMarkup(items)+'</div>';
 page.querySelector('.crm-notice-mark').onclick=()=>markSeen(items.map(item=>item.id));
 page.querySelectorAll('[data-notice]').forEach(button=>button.onclick=()=>openNotification(Number(button.dataset.notice)));
}
async function openNotification(index){
 const item=notificationItems[index];if(!item)return;
 markSeen([item.id]);closeNotice();
 await window.SCRM.navigateRecord(item.module,item.recordId,item.title);
}
async function refreshNotifications(){
 if(noticeLoading||$('#app')?.hidden)return;
 noticeLoading=true;
 try{
  const payload=await window.SCRM.api('notifications');
  notificationItems=Array.isArray(payload.items)?payload.items:[];
  drawNoticeBadge();renderNoticeMenu();renderNotificationsPage(notificationItems);
 }catch(error){
  const preview=noticeMenu?.querySelector('#crmNoticePreview');
  if(preview)preview.innerHTML='<p class="crm-notice-empty" role="alert">'+esc(error.message||'Notifications are unavailable')+'</p>';
  const page=$('#crm-notification-list');if(page)page.innerHTML='<p class="crm-notice-empty" role="alert">'+esc(error.message||'Notifications are unavailable')+'</p>';
 }finally{noticeLoading=false}
}
function mountNotifications(){
 const bell=$('#notifBtn'),actions=$('.top-actions');if(!bell||!actions)return;
 const popup=document.createElement('section');
 popup.className='crm-notice-menu';popup.id='crmNoticeMenu';popup.hidden=true;popup.setAttribute('aria-label','Recent CRM notifications');
 popup.innerHTML='<div class="crm-notice-heading"><strong>Notifications</strong><button type="button" class="crm-notice-mark">Mark all as read</button></div><div id="crmNoticePreview" class="crm-notice-preview"><p class="crm-notice-empty">Loading…</p></div><button type="button" class="crm-notice-all">View all notifications →</button>';
 actions.append(popup);noticeMenu=popup;
 bell.onclick=event=>{event.stopPropagation();const showing=noticeMenu.hidden;closeProfile();hideResults();noticeMenu.hidden=!showing;if(showing)refreshNotifications()};
 popup.querySelector('.crm-notice-mark').title='Read status is saved on this device only';
 popup.querySelector('.crm-notice-mark').onclick=()=>markSeen(notificationItems.map(item=>item.id));
 popup.querySelector('.crm-notice-all').onclick=()=>{closeNotice();window.SCRM.navigateTo('notifications')};
 drawNoticeBadge();
}
function mountProfile(){
 const actions=$('.top-actions'),avatar=$('.top-avatar'),logout=$('#logoutBtn');
 if(!actions||!avatar)return;
 const menu=document.createElement('div');menu.className='crm-profile';menu.innerHTML='<button type="button" id="crmProfileButton" class="crm-profile-trigger" aria-haspopup="true" aria-expanded="false" title="Account and sign-out"><span class="crm-profile-slot"></span><span class="crm-profile-name">'+esc(window.SCRM.user?.name||'Account')+'</span><span aria-hidden="true">⌄</span></button><div class="crm-profile-menu" hidden><strong>'+esc(window.SCRM.user?.name||'Account')+'</strong><small>'+esc(window.SCRM.user?.email||'')+'</small><div class="crm-profile-logout-slot"></div></div>';
 avatar.before(menu);
 menu.querySelector('.crm-profile-slot').append(avatar);
 const logoutSlot=menu.querySelector('.crm-profile-logout-slot');
 if(logout){logout.textContent='Sign out';logoutSlot.append(logout)}
 profileMenu=menu.querySelector('.crm-profile-menu');
 const button=menu.querySelector('#crmProfileButton');
 button.onclick=event=>{event.stopPropagation();const expand=profileMenu.hidden;closeNotice();hideResults();profileMenu.hidden=!expand;button.setAttribute('aria-expanded',String(expand))};
}
function init(){
 if($('#app')?.hidden)return;
 current=window.SCRM.currentPage();
 const env=$('.environment');if(env)env.hidden=true;
 mountProfile();mountSearch();mountNotifications();
 if(window.SCRM.user?.id){
  try{document.body.classList.toggle('crm-density-compact',localStorage.getItem('scrm:compact:'+userId())==='1')}catch{}
 }
 onNavigate(current);refreshNotifications();
 document.addEventListener('pointerdown',event=>{
  if(!event.target.closest('#globalSearchBtn')){hideResults();closeScope()}
  if(!event.target.closest('#notifBtn,#crmNoticeMenu'))closeNotice();
  if(!event.target.closest('.crm-profile'))closeProfile();
 });
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){hideResults();closeScope();closeNotice();closeProfile()}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){
   event.preventDefault();focusSearch();
  }
 });
}
window.SCRMWorkspace={init,onRender,onNavigate,focusSearch,renderNotificationsPage,refreshNotifications};
})();