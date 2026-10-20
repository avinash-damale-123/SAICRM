/* One DOM layout adapter for master and standard CRM record workspaces.
 * Existing controllers keep ownership of permissions, data, tabs and actions.
 */
(() => {
'use strict';
const paths = {
 suitcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 11v4h4v-4"/>',
 dashboard: '<path d="M4 3v17h17M8 16v-5m5 5V6m5 10V9M7 8l6-5 5 3"/>',
 home: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 4v16M9 14h12"/>',
 search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
 export: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
 import: '<path d="M12 16V4m-4 4 4-4 4 4M4 17v4h16v-4"/>',
 filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
 settings: '<path d="M4 7h6m4 0h6M4 17h10m4 0h2"/><circle cx="12" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
 add: '<path d="M12 5v14M5 12h14"/>',
 chevron: '<path d="m7 10 5 5 5-5"/>',
 leads: '<circle cx="12" cy="8" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
 customers: '<path d="M4 21V5h10v16M14 11h6v10M2 21h20M8 8h2m-2 4h2m-2 4h2"/>',
 contacts: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/>',
 opportunities: '<path d="m12 3 9 9-9 9-9-9Z"/>',
 activities: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18m-14 5 3 3 6-6"/>',
 quotes: '<path d="M6 3h8l4 4v14H6ZM14 3v5h4M9 12h6m-6 4h6"/>',
 branches: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18"/>'
};
const svg = name => '<svg class="scrm-ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||paths.suitcase)+'</svg>';
let sharedSearch = null, currentPage = 'home', currentLabel = 'Home', restoringSearchFocus = false;
function searchNode() {
 const current=document.getElementById('globalSearchBtn');
 if(current?.querySelector('#crmSearchInput'))sharedSearch=current;
 return sharedSearch;
}
function parkSearch() {
 const search=searchNode(), top=document.querySelector('.topbar .top-actions');
 if(search&&top&&search.parentElement!==top)top.prepend(search);
 search?.classList.remove('scrm-search','crm-search-in-workbar');
}
function preserveSearch(action) {
 const search=searchNode(), input=search?.querySelector('input');
 const focused=document.activeElement===input;
 const start=input?.selectionStart,end=input?.selectionEnd;
 parkSearch();
 try {return action();}
 finally {
  sync(currentPage,currentLabel);
  if(focused&&input?.isConnected){restoringSearchFocus=true;try{input.focus({preventScroll:true});if(start!=null)input.setSelectionRange(start,end)}catch{}finally{restoringSearchFocus=false}}
 }
}
function control(button,kind,label) {
 // Only replace presentation; keep handler attributes and native disabled state.
 const filterCount=button.querySelector('.mw-filter-count');
 button.innerHTML=svg(kind)+'<span class="scrm-action-label"></span>'+(kind==='settings'?svg('chevron'):'');
 button.querySelector('.scrm-action-label').textContent=label;
 if(filterCount)button.append(filterCount);
 button.classList.add('scrm-action');
 if(kind==='add')button.classList.add('scrm-add');
 if(!button.title)button.title=button.getAttribute('aria-label')||label;
}
function tab(button,view,label) {
 button.innerHTML=svg(view)+'<span class="scrm-view-copy"><small class="scrm-view-context"></small><strong class="scrm-view-title"></strong></span>';
 button.querySelector('small').textContent=label;
 button.querySelector('strong').textContent=view==='dashboard'?'Overview':label==='Business Lines'?'Records':'Home';
 button.classList.add('scrm-view');
 button.title=label+' '+(view==='dashboard'?'Overview':label==='Business Lines'?'Records':'Home');
 button.setAttribute('aria-label',button.title);
}
function decorate(row,page,label) {
 if(row.dataset.scrmHeader===page)return;
 const identity=row.querySelector('.mw-module-identity,.crm-module-heading');
 const tabs=row.querySelector('.mw-module-tabs,.crm-module-tabs');
 const actions=row.querySelector('.mw-header-actions,.crm-module-actions');
 if(!identity||!tabs||!actions)return;
 const title=identity.querySelector('h1,h2');
 if(!title)return;
 identity.querySelectorAll('p,.mw-module-kicker').forEach(node=>node.remove());
 const glyph=identity.querySelector('.mw-module-identity-icon,.crm-module-glyph');
 if(glyph)glyph.innerHTML=svg(page);
 title.textContent=label;
 identity.classList.add('scrm-identity');
 tabs.classList.add('scrm-tabs');
 tabs.querySelectorAll('button').forEach(button=>{
  const view=button.dataset.mw || (button.dataset.action==='moduleDashboard'?'dashboard':'home');
  tab(button,view,label);
 });
 actions.classList.add('scrm-actions');
 actions.querySelectorAll(':scope > button,:scope > details > summary').forEach(button=>{
  const action=button.dataset.mw||button.dataset.action;
  const name=(button.textContent||'').toLowerCase();
  if(action==='export')control(button,'export','Export');
  else if(action==='import'||name.includes('import'))control(button,'import','Import');
  else if(action==='filter-toggle'||action==='moduleFilter')control(button,'filter','Filter');
  else if(button.tagName==='SUMMARY')control(button,'settings','Customize');
  else if(action==='create'||action==='new'){
   if(!button.getAttribute('aria-label'))button.setAttribute('aria-label','Add record to '+label);
   control(button,'add','Add');
  }
 });
 if(label==='Business Lines'){
  row.classList.add('scrm-bl-clean');
  // Standard Records action order: Filter, Import, Export, Settings.
  const filter=actions.querySelector('[data-mw="filter-toggle"]');
  const importer=actions.querySelector('[data-mw="import"]');
  const exporter=actions.querySelector('[data-mw="export"]');
  const settings=actions.querySelector('.mw-settings-menu');
  for(const node of [filter,importer,exporter,settings])if(node)actions.append(node);

  const home=tabs.querySelector('[data-mw="home"]');
  if(home)tabs.prepend(home);
  const add=actions.querySelector('[data-mw="create"]');
  if(add){
   const primary=document.createElement('div');primary.className='scrm-bl-primary';
   primary.append(add);
   add.querySelector('.scrm-action-label').textContent='Add Business Line';
   row.dataset.scrmBlPrimary='yes';
   row._scrmBlPrimary=primary;
  }
 }
 const slot=document.createElement('div');slot.className='scrm-search-slot';
 const legacy=document.createElement('div');legacy.hidden=true;legacy.className='scrm-legacy-search';
 const legacySearch=row.querySelector('.mw-search');if(legacySearch)legacy.append(legacySearch);
 if(label==='Business Lines'&&row._scrmBlPrimary)row.replaceChildren(identity,row._scrmBlPrimary,tabs,slot,actions,legacy);else row.replaceChildren(identity,tabs,slot,actions,legacy);
 row.classList.add('scrm-workbar');row.dataset.scrmHeader=page;
}
function sync(page,label) {
 currentPage=page;currentLabel=label;
 const row=document.querySelector('.crm-business-module,.crm-module-workbar');
 const search=searchNode();
 // Keep these same live controls (and their handlers) in the requested order.
 const bell=document.querySelector('#notifBtn'),focus=document.querySelector('#focusModeBtn');
 if(bell&&focus&&bell.nextElementSibling!==focus)bell.after(focus);
 if(!row){parkSearch();return;}
 decorate(row,page,label);
 const slot=row.querySelector('.scrm-search-slot');
 if(slot&&search){
  if(search.parentElement!==slot)slot.append(search);
  search.classList.add('scrm-search','crm-search-in-workbar');
  const icon=search.querySelector('.crm-search-symbol');if(icon&&!icon.querySelector('svg'))icon.innerHTML=svg('search');
 }
}
window.SCRMHeader={sync,parkSearch,preserveSearch,get restoringSearchFocus(){return restoringSearchFocus}};
})();
