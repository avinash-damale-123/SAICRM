(() => {
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(name)=>{const paths={search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',plus:'<path d="M12 5v14M5 12h14"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2"/>',filter:'<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',columns:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 4v16M16 4v16"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',settings:'<path d="M4 7h5m5 0h6M4 17h10m5 0h1"/><circle cx="11" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',chevron:'<path d="m8 10 4 4 4-4"/>',briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 13h18m-9-2v4"/>'};return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(paths[name]||paths.briefcase)+'</svg>'};
const date=v=>v?new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'—';
const actionTimeZone=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||undefined;}catch{return undefined;}};
function create(host,config) {
 const user=window.SCRM.user||{},api=config.api;
 const storageKey='scrm:view:'+user.id+':'+config.key,recentKey='scrm:recent:'+user.id+':'+config.key;
 const allColumns=config.columns.map(c=>({...c})),defaults=allColumns.filter(c=>c.default!==false).map(c=>c.key);
 let prefs={columns:defaults,freeze:true,pageSize:25};
 try{const p=JSON.parse(localStorage.getItem(storageKey));if(p&&Array.isArray(p.columns)){prefs.columns=[...new Set([...allColumns.filter(c=>c.locked).map(c=>c.key),...p.columns.filter(k=>allColumns.some(c=>c.key===k&&!c.locked))])];prefs.freeze=p.freeze!==false;if([25,50,75,100].includes(p.pageSize))prefs.pageSize=p.pageSize}}catch{}
 const state={q:'',status:'all',archived:'exclude',filters:[],sort:'updatedAt',direction:'desc',page:1,pageSize:prefs.pageSize,records:[],total:0,totalPages:1,counts:null,overviewInsights:null,owners:[],referenceData:{},limits:{selectedExport:250},selected:new Set(),loading:true,error:'',message:'',view:'home',filtersOpen:false,permissions:{},permissionsKnown:false};
 let dead=false,sequence=0,timer=null,dialog=null,dialogDirty=null,dialogSaving=false,previousFocus=null,moduleHeader=null,headerRestore=null,blDetail=null,blDraft=null,blBusy=false,blRecord=null,blRecordMode='read',blLoadSequence=0,dialogReturnTarget=null,recordsTools=null;
 const find=selector=>host.querySelector(selector)||moduleHeader?.querySelector(selector);
 const permitted=action=>state.permissions[action]===true;
 const visibleColumns=()=>prefs.columns.map(k=>allColumns.find(c=>c.key===k)).filter(Boolean);
 const columnWidthKey='scrm:widths:'+user.id+':'+config.key;
 let columnWidths={};try{columnWidths=JSON.parse(localStorage.getItem(columnWidthKey)||'{}')||{}}catch{}
 const savePrefs=()=>{try{localStorage.setItem(storageKey,JSON.stringify(prefs))}catch{}};
 const query=()=>recordsTools?.enabled?recordsTools.query():({q:state.q,status:state.status,archived:state.archived,filters:state.filters,sort:state.sort,direction:state.direction});
 const params=()=>{const p=new URLSearchParams({...query(),page:String(state.page),pageSize:String(state.pageSize)});p.set('filters',JSON.stringify(recordsTools?.enabled?recordsTools.query().filters:state.filters));if(recordsTools?.enabled)p.set('sorts',JSON.stringify(recordsTools.query().sorts));return p.toString()};
 const recents=()=>{try{const v=JSON.parse(sessionStorage.getItem(recentKey));return Array.isArray(v)?v.filter(s=>typeof s==='string').slice(0,5):[]}catch{return[]}};
 function rememberSearch(value){if(!value)return;try{sessionStorage.setItem(recentKey,JSON.stringify([value,...recents().filter(s=>s!==value)].slice(0,5)))}catch{}}
 const button=(label,action,extra='',ico='')=>'<button type="button" class="mw-btn '+extra+'" data-mw="'+action+'" aria-label="'+esc(label)+'">'+(ico?icon(ico):'')+'<span>'+esc(label)+'</span></button>';
 function announce(message){if(dead||!message)return;state.message=message;const inline=find('.mw-feedback');if(inline){inline.textContent='';inline.hidden=true}let stack=document.getElementById('r10-toast-stack');if(!stack){stack=document.createElement('div');stack.id='r10-toast-stack';stack.setAttribute('aria-live','polite');stack.setAttribute('aria-atomic','true');document.body.append(stack)}const text=String(message),kind=/fail|error|unable|not permitted|rejected|invalid/i.test(text)?'error':/partial|warning|skipped|attention/i.test(text)?'warning':/success|saved|created|updated|archived|restored|recovered|published|ready|completed|queued/i.test(text)?'success':'info',icons={success:'✓',info:'i',warning:'!',error:'×'},toast=document.createElement('div');toast.className='r10-toast r10-'+kind;toast.setAttribute('role',kind==='error'?'alert':'status');toast.innerHTML='<span class="r10-toast-icon" aria-hidden="true">'+icons[kind]+'</span><strong>'+esc(text)+'</strong><button type="button" aria-label="Close notification">×</button>';stack.append(toast);const close=()=>{if(!toast.isConnected)return;toast.classList.add('r10-leaving');setTimeout(()=>{toast.remove();if(stack.isConnected&&!stack.children.length)stack.remove()},220)};toast.querySelector('button').onclick=close;setTimeout(close,kind==='error'?5000:kind==='warning'?4500:kind==='info'?3500:3000)}
 function mountHeader(){
 const topbar=document.querySelector('.topbar');
 moduleHeader=document.createElement('div');moduleHeader.className='mw-module-header';
 moduleHeader.innerHTML='<div class="mw-header-primary"><nav class="mw-module-tabs" aria-label="'+esc(config.title)+' views"><button type="button" class="mw-module-tab" data-mw="dashboard" aria-label="'+esc(config.title)+' Overview"><span>'+esc(config.title)+'</span> Overview</button><button type="button" class="mw-module-tab" data-mw="home" aria-label="'+esc(config.title)+' Home" aria-current="page"><span>'+esc(config.title)+'</span> Home</button></nav><div class="mw-header-account"><div class="mw-common-tools"></div><details class="mw-account-menu"><summary aria-label="User menu for '+esc(user.name||user.email)+'"><span class="mw-avatar-slot"></span><span class="mw-profile-name">'+esc(user.name||user.email)+'</span>'+icon('chevron')+'</summary><div class="mw-account-dropdown"><strong>'+esc(user.name||'')+'</strong><small>'+esc(user.email||'')+'</small><div class="mw-logout-slot"></div></div></details>'+button('Add '+config.singular,'create','mw-primary mw-add-record','plus')+'</div></div><div class="mw-header-toolbar"><div class="mw-search"><label class="mw-sr-only" for="mw-search">Search '+esc(config.title)+'</label>'+icon('search')+'<input id="mw-search" type="search" placeholder="Search '+esc(config.title.toLowerCase())+'…" autocomplete="off" list="mw-recent-searches" disabled><datalist id="mw-recent-searches"></datalist></div><div class="mw-header-actions">'+(config.recordsFramework&&window.SCRMRecords||config.import&&typeof config.onImport==='function'?button('Import','import','','download'):'')+button('Export','export','','download')+'<button type="button" class="mw-btn" data-mw="filter-toggle" aria-label="Filter" aria-controls="mw-filter-controls" aria-expanded="false">'+icon('filter')+'<span>Filter</span><span class="mw-filter-count" hidden></span></button><details class="mw-settings-menu"><summary class="mw-btn" aria-label="Module settings">'+icon('settings')+'<span>Settings</span>'+icon('chevron')+'</summary><div>'+button('Column Selection','columns','mw-menu-item','columns')+'</div></details></div></div>';
 const heading=document.createElement('div');heading.className='mw-module-identity';
 heading.innerHTML='<span class="mw-module-identity-icon">'+icon('briefcase')+'</span><h2>'+esc(config.title)+'</h2>';
 moduleHeader.prepend(heading);
 moduleHeader.classList.add('crm-business-module');
 const add=moduleHeader.querySelector('.mw-add-record');
 add.setAttribute('aria-label','Add '+config.singular);
 add.innerHTML=icon('plus')+'<span class="mw-add-label">Add</span>';
 moduleHeader.querySelector('.mw-header-actions').append(add);
 // Show a disabled placeholder only to the Super Admin; secure import is not wired yet.
 if(user.systemRole==='super_admin'){
  const hint=document.createElement('button');hint.type='button';hint.className='mw-btn crm-disabled-import';hint.disabled=true;hint.textContent='↑ Import';hint.title='Secure Business Lines import is awaiting backend validation';
  const actions=moduleHeader.querySelector('.mw-header-actions');actions.insertBefore(hint,actions.querySelector('[data-mw="filter-toggle"]'));
 }
 // Global bell, fullscreen, profile and search remain in the persistent global header.
 // Only this module's local actions/tabs appear in the module work bar.
 moduleHeader.querySelector('.mw-header-account').remove();
 const sharedSearch=document.getElementById('globalSearchBtn');
 const searchOrigin=sharedSearch?.parentNode||null;
 const searchNext=sharedSearch?.nextSibling||null;
 if(sharedSearch){moduleHeader.querySelector('.mw-header-toolbar').prepend(sharedSearch);sharedSearch.classList.add('crm-search-in-workbar');}
 const restoreSearch=()=>{if(!sharedSearch||!searchOrigin)return;sharedSearch.classList.remove('crm-search-in-workbar');if(searchNext&&searchNext.parentNode===searchOrigin)searchOrigin.insertBefore(sharedSearch,searchNext);else searchOrigin.append(sharedSearch)};

 if(topbar) {
  const workbar=document.createElement('div');workbar.className='crm-module-host';
  topbar.insertAdjacentElement('afterend',workbar);
  workbar.append(moduleHeader);host.classList.add('mw-module-content');
  headerRestore=()=>{restoreSearch();workbar.remove();host.classList.remove('mw-module-content')};
 }else{host.prepend(moduleHeader);headerRestore=()=>{restoreSearch();moduleHeader?.remove()}}
 moduleHeader.addEventListener('click',click);
 moduleHeader.querySelector('#mw-search').value=state.q;
 moduleHeader.querySelector('#mw-search').addEventListener('input',e=>{if(!permitted('search'))return;state.view='home';state.q=e.target.value.trim();clearTimeout(timer);renderViews();timer=setTimeout(()=>{rememberSearch(state.q);state.page=1;load()},400)});
 moduleHeader.querySelector('#mw-search').addEventListener('keydown',e=>{if(e.key==='Enter'&&permitted('search')){e.preventDefault();state.view='home';clearTimeout(timer);rememberSearch(state.q);state.page=1;load()}});
 }
 function shell(){
 host.innerHTML='<section class="mw-workspace" aria-label="'+esc(config.title)+'"><h1 class="mw-sr-only">'+esc(config.title)+'</h1><section class="mw-dashboard" aria-label="'+esc(config.title)+' Dashboard" hidden></section><div class="mw-home" aria-label="'+esc(config.title)+' Home"><div class="mw-panel"><section id="mw-filter-controls" class="mw-filter-controls" aria-label="Filter '+esc(config.title)+'" hidden><label>Status<select id="mw-status"><option value="all">All statuses</option><option value="Active">Active</option><option value="Inactive">Inactive</option><option value="Archived">Archived</option><option value="Deleted">Deleted</option></select></label><label>Record state<select id="mw-archived"><option value="exclude">Current records</option><option value="only">Archived records</option><option value="all">Current & archived</option>'+(config.recordsFramework?'<option value="deleted">Deleted records</option>':'')+'</select></label>'+button('Advanced filters','filters','','filter')+'</section><div class="mw-query-summary" hidden></div><div class="mw-selection" hidden></div><p class="mw-feedback" role="status" hidden></p><div class="mw-results" aria-live="polite"></div><footer class="mw-footer"></footer></div></div></section>';
 // Save confirmations must remain visible after returning to either view.
 if(config.recordsFramework){const workspace=find('.mw-workspace'),dashboard=find('.mw-dashboard'),filters=find('#mw-filter-controls'),summary=find('.mw-query-summary'),feedback=find('.mw-feedback');workspace.insertBefore(filters,dashboard);workspace.insertBefore(summary,dashboard);workspace.insertBefore(feedback,dashboard);feedback.hidden=true;}
 mountHeader();
 find('#mw-status').value=state.status;find('#mw-archived').value=state.archived;
 find('#mw-status').onchange=e=>{if(!permitted('filter'))return;state.status=e.target.value;state.page=1;load()};
 find('#mw-archived').onchange=e=>{if(!permitted('filter'))return;state.archived=e.target.value;state.page=1;load()};
 host.addEventListener('click',click);host.addEventListener('change',change);
  if(config.key==='countries')host.addEventListener('click',event=>{
   const link=event.target.closest('[data-country-line-id]');
   if(!link||!host.contains(link)||!permitted('read'))return;
   const id=link.dataset.countryLineId;if(!id||!window.SCRM?.navigateRecord)return;
   event.preventDefault();
   Promise.resolve(window.SCRM.navigateRecord('businesslines',id,'Business Line')).catch(error=>announce(error.message));
  });
 render();
 }
 function renderViews(){
 if(dead)return;
 if(state.view==='dashboard'&&!permitted('dashboard'))state.view='home';
 find('.mw-home').hidden=state.view!=='home';find('.mw-dashboard').hidden=state.view!=='dashboard';
 moduleHeader?.querySelectorAll('.mw-module-tab').forEach(tab=>{const active=tab.dataset.mw===state.view;tab.classList.toggle('mw-active-tab',active);if(active)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');tab.hidden=tab.dataset.mw==='dashboard'&&!permitted('dashboard')});
 if(config.recordsFramework&&moduleHeader){const single=state.permissionsKnown&&!permitted('dashboard');moduleHeader.classList.toggle('scrm-no-tabs',single);const tabs=moduleHeader.querySelector('.mw-module-tabs');if(tabs)tabs.hidden=single;}
 const controlPermission={create:'create',export:'export',import:'import','filter-toggle':'filter',columns:'settings',refresh:'read'};
 moduleHeader?.querySelectorAll('[data-mw]').forEach(control=>{const permission=controlPermission[control.dataset.mw];if(permission){control.hidden=!permitted(permission)||(control.dataset.mw==='import'&&(!recordsTools?.enabled&&(!config.import||typeof config.onImport!=='function')));control.disabled=state.loading&&control.dataset.mw==='export'}});
 const search=find('#mw-search');if(search){search.disabled=!permitted('search');search.closest('.mw-search').hidden=!permitted('search')}
 const settings=moduleHeader?.querySelector('.mw-settings-menu');if(settings)settings.hidden=!permitted('settings');
 const open=state.filtersOpen&&permitted('filter');find('#mw-filter-controls').hidden=!open;
 const toggle=moduleHeader?.querySelector('[data-mw="filter-toggle"]');if(toggle)toggle.setAttribute('aria-expanded',String(open));
 const count=state.filters.length+(state.status!=='all'?1:0)+(state.archived!=='exclude'?1:0),badge=moduleHeader?.querySelector('.mw-filter-count');if(badge){badge.hidden=!count;badge.textContent=count}
 }
 function stats(){
 const target=find('.mw-dashboard');if(!target)return;if(!permitted('dashboard')){target.innerHTML='';return}
 if(state.loading&&!state.counts){target.innerHTML='<div class="mw-state"><span class="mw-spinner"></span><strong>Loading '+esc(config.title.toLowerCase())+' dashboard…</strong></div>';return}
 if(state.error){target.innerHTML='<div class="mw-state mw-error" role="alert"><strong>Dashboard unavailable</strong><p>'+esc(state.error)+'</p>'+button('Try again','refresh')+'</div>';return}
 const c=state.counts;if(!c){target.innerHTML='<div class="mw-state"><strong>No dashboard data available</strong></div>';return}
 if(typeof config.renderOverview==='function'){target.innerHTML=config.renderOverview({counts:c,insights:state.overviewInsights,query:{q:state.q,status:state.status,archived:state.archived}});return;}
 const total=Number(c.total)||0,items=[['Active',Number(c.active)||0,'active'],['Inactive',Number(c.inactive)||0,'inactive'],['Archived',Number(c.archived)||0,'archived']];
 const active=Number(c.active)||0,inactive=Number(c.inactive)||0,archived=Number(c.archived)||0;
 const pct=value=>total?Math.round(value/total*100):0;
 const donut=total?'conic-gradient(#0b9965 0 '+(active/total*100)+'%,#f59a29 '+(active/total*100)+'% '+((active+inactive)/total*100)+'%,#90a2bb '+((active+inactive)/total*100)+'% 100%)':'conic-gradient(#e6ecf3 0 100%)';
 target.innerHTML='<div class="mw-dashboard-metrics">'+[['Total '+esc(config.title)+'',total,'total'],['Active',active,'active'],['Inactive',inactive,'inactive'],['Archived',archived,'archived']].map(([label,value,key])=>'<article class="mw-dashboard-metric mw-dashboard-metric-'+key+'"><span>'+label+'</span><strong>'+value.toLocaleString()+'</strong><span class="mw-metric-glyph" aria-hidden="true">'+({total:'▣',active:'↗',inactive:'◷',archived:'▤'})[key]+'</span></article>').join('')+'</div><div class="mw-dashboard-visuals"><section class="mw-visual-card"><h3>Status Distribution</h3><div class="mw-donut-layout"><div class="mw-donut" role="img" aria-label="'+esc(items.map(([label,value])=>label+': '+value).join(', '))+'" style="background:'+donut+'"><div class="mw-donut-center"><strong>'+total.toLocaleString()+'</strong><span>Total</span></div></div><div class="mw-donut-legend">'+items.map(([label,value,key])=>'<div><span class="mw-legend-dot mw-legend-'+key+'"></span><span>'+label+'</span><strong>'+value+' ('+pct(value)+'%)</strong></div>').join('')+'</div></div></section><section class="mw-visual-card"><h3>'+esc(config.singular)+' Status</h3><p class="mw-visual-subtitle">Live counts from your CRM database</p><div class="mw-status-chart">'+items.map(([label,value,key])=>'<div class="mw-chart-row"><span>'+label+'</span><div class="mw-chart-track"><div class="mw-chart-bar mw-chart-'+key+'" style="width:'+pct(value)+'%"></div></div><strong>'+value.toLocaleString()+'</strong></div>').join('')+'</div></section><section class="mw-visual-card mw-visual-summary"><h3>At a Glance</h3><p class="mw-visual-subtitle">'+esc(config.singular)+' coverage overview</p><div class="mw-summary-feature"><strong>'+pct(active)+'%</strong><span>of '+esc(config.title.toLowerCase())+' are active</span></div><div class="mw-summary-divider"></div><div class="mw-summary-detail"><span>Current records</span><strong>'+(active+inactive)+'</strong></div><div class="mw-summary-detail"><span>Archived records</span><strong>'+archived+'</strong></div><p class="mw-summary-footnote">Creation trends and recent activity will appear once reporting endpoints are available.</p></section></div>';
 }
 function render(){
 if(dead)return;renderViews();stats();
 find('#mw-recent-searches').innerHTML=recents().map(s=>'<option value="'+esc(s)+'"></option>').join('');
 const summary=find('.mw-query-summary');
 summary.hidden=!state.filters.length;
 summary.innerHTML=state.filters.map((f,i)=>'<span class="mw-chip">'+esc(allColumns.find(c=>c.key===f.field)?.label||f.field)+' '+esc(({contains:'contains',equals:'is',startsWith:'starts with',before:'before',after:'after',isEmpty:'is empty',isNotEmpty:'is not empty'})[f.operator])+' '+esc(f.value)+' <button data-mw="remove-filter" data-index="'+i+'" type="button" aria-label="Remove filter '+(i+1)+'">×</button></span>').join('')+(state.filters.length?button('Clear filters','clear-filters','mw-text-btn'):'');
 const selected=find('.mw-selection');selected.hidden=!state.selected.size;
 selected.innerHTML='<strong>'+state.selected.size.toLocaleString()+' record'+(state.selected.size===1?'':'s')+' selected across pages</strong><span>Selections remain until cleared.</span>'+(permitted('export')?button('Export selected','export-selected','mw-text-btn'):'')+button('Clear selection','clear-selection','mw-text-btn');
 const results=find('.mw-results');results.setAttribute('aria-busy',String(state.loading));
 if(state.loading)results.innerHTML='<div class="mw-state"><span class="mw-spinner"></span><strong>Loading '+esc(config.title.toLowerCase())+'…</strong></div>';
 else if(state.error)results.innerHTML='<div class="mw-state mw-error" role="alert"><strong>We couldn’t load these records</strong><p>'+esc(state.error)+'</p>'+button('Try again','refresh')+'</div>';
 else if(!state.records.length)results.innerHTML='<div class="mw-state"><span class="mw-empty-icon">'+icon('briefcase')+'</span><strong>'+(state.q||state.filters.length||state.status!=='all'?'No matching records':state.archived==='only'?'No archived records':'No '+esc(config.title.toLowerCase())+' yet')+'</strong><p>'+(state.q||state.filters.length||state.status!=='all'?'Try another search or clear your filters.':state.archived==='only'?'Archived records will appear here.':'Create your first '+esc(config.singular.toLowerCase())+' to get started.')+'</p>'+(state.q||state.filters.length||state.status!=='all'?button('Clear search and filters','clear-query'):state.archived==='only'?'':(permitted('create')?button('Create '+config.singular,'create','mw-primary','plus'):''))+'</div>';
 else {
 const cols=visibleColumns(),all=state.records.every(r=>state.selected.has(r.id));
 results.innerHTML='<div class="mw-table-wrap" tabindex="0" role="region" aria-label="'+esc(config.title)+' table; scroll for more columns"><table class="mw-table '+(prefs.freeze?'mw-freeze':'')+'"><thead><tr><th class="mw-check-col"><input type="checkbox" id="mw-select-page" aria-label="Select current page" '+(all?'checked':'')+'></th>'+cols.map((c,i)=>'<th scope="col" data-column-key="'+esc(c.key)+'" style="'+(columnWidths[c.key]?'width:'+Number(columnWidths[c.key])+'px;min-width:'+Number(columnWidths[c.key])+'px;max-width:'+Number(columnWidths[c.key])+'px':'')+'" class="'+(c.locked?'mw-locked mw-locked-'+i:'')+(state.sort===c.key?' mw-sorted':'')+'" aria-sort="'+(state.sort===c.key?(state.direction==='asc'?'ascending':'descending'):'none')+'"><button type="button" data-mw="sort" data-column="'+esc(c.key)+'">'+esc(c.label)+'<span aria-hidden="true">'+(state.sort===c.key?(state.direction==='asc'?'↑':'↓'):'↕')+'</span></button><span class="mw-column-resizer" data-resize="'+esc(c.key)+'" role="separator" aria-label="Resize '+esc(c.label)+' column" tabindex="0"></span></th>').join('')+'<th scope="col" class="mw-action-col">Actions</th></tr></thead><tbody>'+state.records.map(r=>'<tr class="'+(r.archivedAt?'mw-archived-row':'')+'"><td class="mw-check-col"><input type="checkbox" data-select="'+esc(r.id)+'" aria-label="Select '+esc(r.name)+'" '+(state.selected.has(r.id)?'checked':'')+'></td>'+cols.map((c,i)=>'<td style="'+(columnWidths[c.key]?'width:'+Number(columnWidths[c.key])+'px;min-width:'+Number(columnWidths[c.key])+'px;max-width:'+Number(columnWidths[c.key])+'px':'')+'" class="'+(c.locked?'mw-locked mw-locked-'+i:'')+'">'+cell(r,c)+'</td>').join('')+'<td class="mw-action-col"><details class="mw-row-menu"><summary aria-label="Actions for '+esc(r.name)+'">•••</summary><div>'+(permitted('read')?button('View','read','mw-menu-item'):'')+(permitted('edit')&&!r.archivedAt&&!r.deletedAt?button('Edit','edit','mw-menu-item'):'')+(config.recordsFramework?(r.deletedAt?(permitted('restoreDeleted')?button('Restore Deleted','restore-deleted','mw-menu-item'):''):(r.archivedAt?(permitted('restore')?button('Unarchive','restore','mw-menu-item'):''):(permitted('archive')?button('Archive','archive','mw-menu-item'):'')+(permitted('edit')?button(r.status==='Active'?'Deactivate':'Reactivate','status-change','mw-menu-item'):'')+(permitted('reassignOwner')?button('Reassign Owner','reassign-owner','mw-menu-item'):'') )+(permitted('softDelete')?button('Soft Delete','soft-delete','mw-menu-item'):'')):(r.archivedAt?(permitted('restore')?button('Restore','restore','mw-menu-item'):''):(permitted('archive')?button('Archive','archive','mw-menu-item'):'')))+'</div></details><span hidden data-record-id="'+esc(r.id)+'"></span></td></tr>').join('')+'</tbody></table></div>';
 host.querySelectorAll('.mw-row-menu').forEach(menu=>menu.addEventListener('toggle',()=>{if(!menu.open)return;host.querySelectorAll('.mw-row-menu').forEach(other=>{if(other!==menu)other.open=false});const box=menu.getBoundingClientRect(),panel=menu.querySelector('div');panel.style.position='fixed';panel.style.left=Math.max(8,Math.min(box.right-130,innerWidth-138))+'px';panel.style.right='auto';panel.style.top=Math.min(box.bottom+3,innerHeight-panel.offsetHeight-12)+'px'}));find('.mw-table-wrap').addEventListener('scroll',()=>host.querySelectorAll('.mw-row-menu').forEach(menu=>menu.open=false));
 const pageCheckbox=find('#mw-select-page');if(pageCheckbox)pageCheckbox.indeterminate=!all&&state.records.some(r=>state.selected.has(r.id));
 }
 renderFooter();recordsTools?.render();
 }
 function cell(r,c){const v=r[c.key];if(c.key==='name')return '<button class="mw-record-link" type="button" data-mw="read" data-record="'+esc(r.id)+'">'+esc(v)+'</button>'+(r.deletedAt?'<span class="mw-archive-label">Deleted</span>':r.archivedAt?'<span class="mw-archive-label">Archived</span>':'');if(c.key==='status')return '<span class="mw-status '+(v==='Active'?'mw-active':'mw-inactive')+'">'+esc(v)+'</span>';if(c.type==='date')return '<span title="'+esc(v||'')+'">'+esc(date(v))+'</span>';return '<span class="'+(c.type==='id'?'mw-id':'')+'" title="'+esc(v||'')+'">'+esc(v||'—')+'</span>'}
 function renderFooter(){const max=Math.max(1,state.totalPages),p=state.page,start=state.total?(p-1)*state.pageSize+1:0,end=Math.min(p*state.pageSize,state.total);const pages=new Set([1,max,p-1,p,p+1]);let last=0,links='';[...pages].filter(v=>v>=1&&v<=max).sort((a,b)=>a-b).forEach(v=>{if(last&&v-last>1)links+='<span class="mw-ellipsis" aria-hidden="true">…</span>';links+='<button type="button" data-mw="page" data-page="'+v+'" '+(v===p?'aria-current="page"':'')+'>'+v+'</button>';last=v});
 find('.mw-footer').innerHTML='<div class="mw-range" role="status">'+(state.loading?'Loading records…':state.error?'Records unavailable':'Showing '+start.toLocaleString()+'–'+end.toLocaleString()+' of '+state.total.toLocaleString())+'</div><label class="mw-page-size">Rows <select id="mw-page-size" aria-label="Records per page">'+[25,50,75,100].map(n=>'<option '+(n===state.pageSize?'selected':'')+'>'+n+'</option>').join('')+'</select></label><nav class="mw-pagination" aria-label="Records pagination"><button type="button" data-mw="page" data-page="1" '+(p<=1||state.loading?'disabled':'')+' aria-label="First page">«</button><button type="button" data-mw="page" data-page="'+(p-1)+'" '+(p<=1||state.loading?'disabled':'')+' aria-label="Previous page">‹</button>'+links+'<button type="button" data-mw="page" data-page="'+(p+1)+'" '+(p>=max||state.loading?'disabled':'')+' aria-label="Next page">›</button><button type="button" data-mw="page" data-page="'+max+'" '+(p>=max||state.loading?'disabled':'')+' aria-label="Last page">»</button></nav><form class="mw-jump"><label>Go to <input name="page" type="number" min="1" max="'+max+'" value="'+p+'" aria-label="Go to page"></label><button type="submit">Go</button></form>';
 find('.mw-jump').onsubmit=e=>{e.preventDefault();const val=Number(new FormData(e.target).get('page'));if(Number.isInteger(val)&&val>=1&&val<=max){state.page=val;load()}else announce('Enter a page number between 1 and '+max+'.')};
 }
 async function load(){if(dead)return;recordsTools?.beforeLoad();const current=++sequence;state.loading=true;state.error='';render();try{const data=await api(config.endpoint+'?'+params());if(dead||current!==sequence)return;state.records=data.records||[];state.total=Number(data.total)||0;state.totalPages=Math.max(1,Number(data.totalPages)||Math.ceil(state.total/state.pageSize));state.counts=data.counts;state.overviewInsights=data.ui?.overviewInsights||null;state.owners=data.owners||[];state.referenceData=data.referenceData||{};state.permissions=Object.fromEntries(Object.entries(data.permissions||{}).map(([key,value])=>[key,value===true]));state.permissionsKnown=true;if(permitted('read')&&recordsTools?.receive(data))return load();if(!permitted('read')){state.records=[];state.total=0;state.counts=null;state.loading=false;state.error='You do not have access to this module.';render();return}state.limits={selectedExport:250,...data.resource?.limits};if(state.page>state.totalPages){state.page=state.totalPages;return load()}state.loading=false;render();recordsTools?.save();}catch(e){if(dead||current!==sequence)return;state.loading=false;state.error=e.message||'Please try again.';render()}}
 function rowFor(button){const id=button.dataset.record||button.closest('tr')?.querySelector('[data-record-id]')?.dataset.recordId;return state.records.find(r=>r.id===id)}
 async function click(event){const b=event.target.closest('[data-mw]');if(dead||!b||(!host.contains(b)&&!moduleHeader?.contains(b)))return;const action=b.dataset.mw;const access={create:'create',read:'read',edit:'edit',archive:'archive',restore:'restore',filters:'filter','filter-toggle':'filter','hide-filters':'filter',columns:'settings','column-customization':'settings','sort-table':'settings','filter-customization':'settings',refresh:'read',export:'export','export-selected':'export',dashboard:'dashboard',home:'read',import:'import','clear-filters':'filter','clear-all-filters':'filter','remove-filter':'filter',sort:'read',page:'read','clear-selection':'read'};if(access[action]&&!permitted(access[action])&&!(action==='refresh'&&state.error&&!state.permissionsKnown)){announce('You do not have permission to perform this action.');return}moduleHeader?.querySelectorAll('.mw-settings-menu[open]').forEach(menu=>menu.open=false);
 if(recordsTools?.enabled&&await recordsTools.handle(action,event,b))return;
 if(action==='home'||action==='dashboard'){if(blDetail&&!closeBlRecord())return;if(recordsTools?.enabled){await recordsTools.switchView(action);return;}state.view=action;renderViews();stats();}
 else if(action==='filter-toggle'){state.filtersOpen=!state.filtersOpen;renderViews();}
 else if(action==='import'){if(config.import&&typeof config.onImport==='function')config.onImport();}
 else if(action==='refresh'){clearTimeout(timer);load()}
 else if(action==='create')editForm();
 else if(action==='read'){const r=rowFor(b);if(r&&permitted('read'))readRecord(r.id)}
 else if(action==='edit'){const r=rowFor(b);if(r&&!r.archivedAt&&!r.deletedAt){if(config.key==='countries'){openCountryRecord(r.id,true)}else if(config.key==='regions'){openBlRecord(r.id,true)}else editForm(r)}}
 else if(['archive','restore','soft-delete','restore-deleted'].includes(action)){const r=rowFor(b);if(r)archiveRecord(r,action,b.dataset.targetStatus||'')}
 else if(action==='status-change'){const r=rowFor(b);if(r)statusRecord(r)}
 else if(action==='reassign-owner'){const r=rowFor(b);if(r)ownerRecord(r)}
 else if(action==='filters')filterDialog();
 else if(action==='columns')columnsDialog();
 else if(action==='export')exportDialog();
 else if(action==='export-selected')exportDialog('selected');
 else if(action==='clear-selection'){state.selected.clear();render()}
 else if(action==='clear-filters'){state.filters=[];state.page=1;load()}
 else if(action==='remove-filter'){state.filters.splice(Number(b.dataset.index),1);state.page=1;load()}
 else if(action==='clear-query'){state.q='';state.filters=[];state.status='all';state.page=1;find('#mw-search').value='';find('#mw-status').value='all';load()}
 else if(action==='sort'){state.sort=b.dataset.column;state.direction=state.sort===b.dataset.column&&b.closest('th').getAttribute('aria-sort')==='ascending'?'desc':'asc';state.page=1;load()}
 else if(action==='page'){const p=Number(b.dataset.page);if(!state.loading&&p>=1&&p<=state.totalPages){state.page=p;load()}}
 }
 let resizing=null;
 host.addEventListener('pointerdown',event=>{const grip=event.target.closest('[data-resize]');if(!grip||!host.contains(grip))return;
  event.preventDefault();const th=grip.closest('th');resizing={key:grip.dataset.resize,startX:event.clientX,startWidth:th.getBoundingClientRect().width};grip.setPointerCapture?.(event.pointerId);
 });
 host.addEventListener('pointermove',event=>{if(!resizing)return;const width=Math.min(650,Math.max(90,Math.round(resizing.startWidth+event.clientX-resizing.startX)));host.querySelectorAll('[data-column-key="'+resizing.key+'"]').forEach(th=>{th.style.width=th.style.minWidth=th.style.maxWidth=width+'px'});host.querySelectorAll('.mw-table tbody tr').forEach(tr=>{const index=visibleColumns().findIndex(c=>c.key===resizing.key);const td=tr.children[index+1];if(td)td.style.width=td.style.minWidth=td.style.maxWidth=width+'px'});columnWidths[resizing.key]=width;});
 host.addEventListener('pointerup',()=>{if(!resizing)return;resizing=null;try{localStorage.setItem(columnWidthKey,JSON.stringify(columnWidths))}catch{}});
 host.addEventListener('keydown',event=>{const grip=event.target.closest('[data-resize]');if(!grip||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const th=grip.closest('th');const width=Math.min(650,Math.max(90,Math.round(th.getBoundingClientRect().width+(event.key==='ArrowRight'?16:-16))));columnWidths[grip.dataset.resize]=width;try{localStorage.setItem(columnWidthKey,JSON.stringify(columnWidths))}catch{}render()});
 function change(event){if(event.target.id==='mw-page-size'){state.pageSize=Number(event.target.value);prefs.pageSize=state.pageSize;savePrefs();state.page=1;load()}if(event.target.id==='mw-select-page'){state.records.forEach(r=>event.target.checked?state.selected.add(r.id):state.selected.delete(r.id));render()}if(event.target.matches('[data-select]')){event.target.checked?state.selected.add(event.target.dataset.select):state.selected.delete(event.target.dataset.select);render()}}
 function hasUnsavedDialog(){return !!((dialogDirty&&dialogDirty())||(blDraft&&blDraft.dataset.dirty==='true'));}
 function beforeDialogUnload(event){if(dialog&&(dialogSaving||blBusy||hasUnsavedDialog())){event.preventDefault();event.returnValue='';}}
 window.addEventListener('beforeunload',beforeDialogUnload);
 function restoreDialogFocus(){
  let target=previousFocus;
  if(!target?.isConnected||!target.getClientRects().length){
   target=null;
   if(dialogReturnTarget){const {id,action}=dialogReturnTarget;target=[...host.querySelectorAll('[data-id]')].find(el=>el.dataset.id===id&&el.dataset.mw===action&&el.getClientRects().length);}
   target=target||moduleHeader?.querySelector('[aria-current="page"]')||moduleHeader?.querySelector('[data-mw="create"]')||host;
  }
  target?.focus({preventScroll:true});
 }
 function closeDialog(force=false){
  if(!dialog)return true;
  if(!force&&(dialogSaving||blBusy||(hasUnsavedDialog()&&!window.confirm('Discard your unsaved changes?'))))return false;
  const closing=dialog;dialog=null;dialogDirty=null;dialogSaving=false;blBusy=false;
  ++blLoadSequence;blDetail=null;blDraft=null;blRecord=null;blRecordMode='read';
  closing.close();closing.remove();document.documentElement.classList.remove('mw-modal-open');restoreDialogFocus();return true;
 }
 function openDialog(title,body,footer='',wide=false){
  if(dead||!closeDialog())return null;
  previousFocus=document.activeElement;
  const opener=previousFocus?.closest('[data-id]');dialogReturnTarget=opener?{id:opener.dataset.id,action:opener.dataset.mw}:null;
  if(previousFocus?.closest('.mw-settings-menu'))previousFocus=previousFocus.closest('.mw-settings-menu').querySelector('summary');
  const d=document.createElement('dialog');dialog=d;
  d.className='mw-dialog'+(wide?' mw-dialog-wide':'')+(config.recordsFramework?' mw-bl-dialog':'');
  d.setAttribute('aria-labelledby','mw-dialog-title');d.setAttribute('aria-modal','true');
  d.innerHTML='<header><div><p class="mw-eyebrow">'+esc(config.title)+'</p><h2 id="mw-dialog-title" tabindex="-1">'+esc(title)+'</h2></div><button type="button" class="mw-icon-btn mw-dialog-close" aria-label="Close">'+icon('close')+'</button></header><div class="mw-dialog-body">'+body+'</div>'+(footer?'<footer>'+footer+'</footer>':'');
  document.body.append(d);d.querySelector('.mw-dialog-close').onclick=()=>closeDialog();
  d.addEventListener('cancel',e=>{e.preventDefault();closeDialog()});
  d.addEventListener('keydown',event=>{
   if(event.key==='Escape')event.stopPropagation();
   if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();event.stopPropagation();return;}
   if(event.key!=='Tab')return;
   const items=[...d.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex]')].filter(el=>el.tabIndex>=0&&!el.disabled&&el.getClientRects().length&&!el.closest('[hidden]'));
   const first=items[0],last=items.at(-1),active=document.activeElement;
   if(!first){event.preventDefault();d.querySelector('#mw-dialog-title').focus();}
   else if(event.shiftKey&&(active===first||!items.includes(active))){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&(active===last||!items.includes(active))){event.preventDefault();first.focus();}
  });
  let backdropPointer=false;
  const onBackdrop=e=>{const r=d.getBoundingClientRect();return e.target===d&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)};
  d.addEventListener('pointerdown',e=>{backdropPointer=onBackdrop(e);
   // A footer click must not be displaced by blur validation recentering the modal.
   // Keyboard focus is unaffected; validation still runs on blur and submit.
   if(e.button===0&&e.target.closest('footer button,.mw-dialog-close'))e.preventDefault();
  });
  d.addEventListener('pointercancel',()=>{backdropPointer=false});
  d.addEventListener('click',e=>{const dismiss=backdropPointer&&onBackdrop(e);backdropPointer=false;if(dismiss)closeDialog()});
  d.showModal();document.documentElement.classList.add('mw-modal-open');return d;
 }

 // Popup presentation only: existing form and permission handlers stay authoritative.
 function blPopupGlyph(name){
  const paths={edit:'<path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/>',chevron:'<path d="m6 9 6 6 6-6"/>',previous:'<path d="m14 5-7 7 7 7"/>',next:'<path d="m10 5 7 7-7 7"/>',expand:'<path d="M12 9V3m-4 4 4-4 4 4M12 15v6m-4-4 4 4 4-4"/>',collapse:'<path d="M12 3v6m-4-4 4 4 4-4M12 21v-6m-4 4 4-4 4 4"/>'};
  return '<svg class="mw-bl-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+(paths[name]||paths.chevron)+'</svg>';
 }
 function blPopupHeader(d,editable=false){
  const header=d.querySelector(':scope > header');if(!header)return;
  const body=d.querySelector('.mw-dialog-body');
  body.tabIndex=0;body.setAttribute('role','region');body.setAttribute('aria-label','Scrollable '+config.singular+' details');
  let actions=header.querySelector('.mw-bl-title-actions');
  if(!actions){
   header.querySelector(':scope > div').classList.add('mw-bl-title-copy');
   actions=document.createElement('div');actions.className='mw-bl-title-actions';
   actions.append(header.querySelector('.mw-dialog-close'));header.append(actions);
  }
  let edit=actions.querySelector('#bl-edit-top');
  if(!editable){edit?.remove();return;}
  if(!edit){
   edit=document.createElement('button');edit.id='bl-edit-top';edit.type='button';edit.className='mw-icon-btn mw-bl-quick-edit';
   edit.setAttribute('aria-label','Edit '+config.singular);edit.title='Edit '+config.singular;edit.innerHTML=blPopupGlyph('edit');
   // Delegate to the same permission-checked footer action, never create a second write path.
   edit.onclick=()=>{if(dialog!==d||dialogSaving||blBusy)return;const action=d.querySelector(config.key==='countries'?'#country-edit':'#bl-edit');if(action&&!action.disabled)action.click();};
   actions.prepend(edit);
  }
 }
 function blDisclosureAffordance(root){
  root.querySelectorAll('.mw-bl-section > details').forEach(details=>{
   const summary=details.querySelector(':scope > summary'),chevron=summary?.querySelector('.mw-bl-chevron');
   if(!summary||!chevron)return;
   const label=summary.textContent.replace(/[\u2304\u2303]/g,'').trim();
   chevron.innerHTML=blPopupGlyph('chevron');chevron.setAttribute('aria-hidden','true');
   const update=()=>{summary.title=(details.open?'Collapse ':'Expand ')+label;};
   update();details.addEventListener('toggle',update);
  });
 }
 function blValue(record,key){
  const value=record?.[key];
  if(key==='businessLineRef')return record?.businessLine||record?.businessLineId||'—';
  if(key==='isArchived')return record?.archivedAt?'Yes':'No';
  if(key==='isDeleted')return record?.deletedAt?'Yes':'No';
  if(key==='status')return record?.status||'Active';
  if(key==='createdAt'||key==='updatedAt'||key==='archivedAt'||key==='deletedAt')return date(value);
  return value===null||value===undefined||value===''?'—':String(value);
 }
 const blGroups=[
  {name:'Basic Information',fields:[['name','Business Line Name'],['displayId','Business Line ID'],['code','Business Line Code'],['status','Business Line Status'],['description','Business Line Description']]},
  {name:'Ownership Details',fields:[['owner','Owner'],['ownerId','Owner ID']]},
  {name:'Record Information',fields:[['createdBy','Created By'],['createdAt','Created At'],['createdById','Created By ID'],['updatedBy','Last Modified By'],['updatedAt','Last Modified At'],['updatedById','Last Modified By ID']]},
  {name:'Lifecycle Information',fields:[['isArchived','Is Archived'],['archivedAt','Archived At'],['archivedById','Archived By ID'],['isDeleted','Is Deleted'],['deletedAt','Deleted At'],['deletedById','Deleted By ID']]}
 ];
 const regionGroups=[
  {name:'Region Information',fields:[['name','Region Name'],['displayId','Region ID'],['code','Region Code'],['status','Region Status'],['businessLineRef','Business Line'],['regionalManager','Regional Manager'],['remarks','Remarks']]},
  {name:'Ownership Details',fields:[['owner','Owner'],['ownerId','Owner ID']]},
  {name:'Record Information',fields:[['businessLineId','Business Line ID'],['createdBy','Created By'],['createdAt','Created At'],['createdById','Created By ID'],['updatedBy','Last Modified By'],['updatedAt','Last Modified At'],['updatedById','Last Modified By ID']]},
  {name:'Lifecycle Information',fields:[['archivedBy','Archived By'],['archivedAt','Archived At'],['archivedById','Archived By ID'],['deletedBy','Deleted By'],['deletedAt','Deleted At'],['deletedById','Deleted By ID']]}
 ];
 const masterGroups=()=>config.key==='regions'?regionGroups:blGroups;
 const masterEditableKeys=()=>config.key==='regions'?['businessLineRef','name','code','regionalManager','remarks','status']:['name','code','description','status'];
 const masterCreateKeys=()=>config.key==='regions'?['businessLineRef','name','code','regionalManager','remarks']:['name','code','description'];
 function blFieldActionAllowed(key,record,mode){
  const editable=masterEditableKeys(),create=masterCreateKeys();
  if(mode==='create')return permitted('create')&&create.includes(key);
  return permitted('edit')&&!record?.archivedAt&&!record?.deletedAt&&editable.includes(key);
 }
 function wireBlFieldActions(root,record,mode){
  const d=root.closest('dialog');
  root.querySelectorAll('[data-bl-field-edit]').forEach(button=>{
   button.addEventListener('pointerdown',event=>{if(event.button===0)event.preventDefault();});
   button.addEventListener('click',()=>{
    const key=button.dataset.blFieldEdit;
    if(dead||dialog!==d||dialogSaving||blBusy||!blFieldActionAllowed(key,record,mode))return;
    if(mode==='read'){
     const edit=d.querySelector('#bl-edit');if(!edit||edit.disabled)return;
     edit.click();
    }
    const form=d.querySelector(mode==='create'?'#mw-record-form':'#mw-bl-page-form');
    const field=form?.elements.namedItem(key);
    if(!field||field.disabled||field.readOnly)return;
    const section=field.closest('details');if(section)section.open=true;
    field.focus({preventScroll:true});field.scrollIntoView({block:'nearest',inline:'nearest'});
   });
  });
 }
 function blInput(key,label,record,mode){
  const editKeys=masterEditableKeys(),createKeys=masterCreateKeys();
  const editable=mode==='create'?createKeys.includes(key):mode==='edit'&&editKeys.includes(key);
  const value=mode==='create'?'':(key==='businessLineRef'?(record?.businessLineRef||''):blValue(record,key)),shown=value==='—'?'':value;
  const required=editable&&(config.key==='regions'?['businessLineRef','name','code','regionalManager'].includes(key):['name','code'].includes(key))&&!(key==='code'&&mode==='edit'&&!record?.code);
  const full=config.key==='regions'?key==='remarks':key==='description';
  const limit=config.key==='regions'?{name:100,code:16,regionalManager:100,remarks:1000}[key]:{name:150,code:20,description:500}[key];
  const controlId='mw-bl-'+mode+'-'+key;
  const attrs=editable?(' id="'+controlId+'" name="'+esc(key)+'"'+(required?' required':'')+(limit?' maxlength="'+limit+'"':'')):' readonly aria-readonly="true"';
  let control;
  if(key==='status'&&editable){
   control='<select id="'+controlId+'" name="status" aria-label="'+esc(config.singular)+' Status"><option value="Active"'+(shown==='Active'?' selected':'')+'>Active</option><option value="Inactive"'+(shown==='Inactive'?' selected':'')+'>Inactive</option></select>';
  }else if(key==='businessLineRef'&&editable){
   const options=[...(state.referenceData.businessLines||[])];
   if(record?.businessLineRef&&!options.some(option=>option.id===record.businessLineRef))options.push({id:record.businessLineRef,code:record.businessLineCode||record.businessLineId||'',name:(record.businessLine||'Current Business Line')+' (current)'});
   control='<select id="'+controlId+'" name="businessLineRef"'+(required?' required':'')+'><option value="">- Select -</option>'+options.map(option=>'<option value="'+esc(option.id)+'" '+(option.id===shown?'selected':'')+'>'+esc((option.code?option.code+' — ':'')+(option.name||option.id))+'</option>').join('')+'</select>';
  }else if(full){
   control='<textarea rows="2"'+attrs+' data-counted="'+esc(key)+'">'+esc(shown)+'</textarea>';
  }else{
   control='<input type="text"'+attrs+' value="'+esc(shown)+'"'+(editable?' autocomplete="off"':'')+'>';
  }
  if(mode==='read'||mode==='edit'&&!editable)control='<div class="mw-bl-read-value'+(full?' mw-bl-read-description':'')+'" aria-labelledby="'+controlId+'-label">'+esc(blValue(record,key))+'</div>';
  let hint='';
  if(editable&&key==='status')hint='<small class="mw-bl-hint">Changing status requires a reason and may be blocked when dependent records exist.</small>';
  else if(editable&&key==='code')hint='<small class="mw-bl-hint">'+(config.key==='regions'?'Uppercase letters, digits and hyphens; maximum 16 characters. Region Code is globally unique.':'Uppercase letters, digits and hyphens; maximum 20 characters.')+'</small>';
  else if(editable&&key==='description')hint='<small class="mw-bl-hint">Maximum 500 characters. <span data-count-for="description">'+String(shown).length+'</span> / 500</small>';
  else if(editable&&key==='remarks')hint='<small class="mw-bl-hint">Maximum 1000 characters. <span data-count-for="remarks">'+String(shown).length+'</span> / 1000</small>';
  else if(editable&&key==='businessLineRef')hint='<small class="mw-bl-hint">Only Active Business Lines can be newly selected. Changing Business Line can be blocked when this Region is already referenced.</small>';
  const action=blFieldActionAllowed(key,record,mode)?'<button type="button" class="mw-bl-field-edit" data-bl-field-edit="'+esc(key)+'" aria-label="Edit '+esc(label)+'" title="Edit '+esc(label)+'">'+blPopupGlyph('edit')+'</button>':'';
  return '<div class="mw-bl-field mw-bl-field-'+esc(key)+(full?' mw-bl-full':'')+(editable?' mw-bl-editable':' mw-bl-readonly')+(action?' mw-bl-field-actionable':'')+'"><label id="'+controlId+'-label"'+(editable?' for="'+controlId+'"':'')+'><span>'+esc(label)+(required?'&nbsp;<span class="mw-required">*</span>':'')+'</span></label><div class="mw-bl-value-cell">'+control+hint+action+'</div></div>';
 }
 function blFormSections(record,mode){
  const groups=masterGroups();
  if(mode==='create'){
   const fields=config.key==='regions'
    ?[['businessLineRef','Business Line'],['name','Region Name'],['code','Region Code'],['regionalManager','Regional Manager'],['remarks','Remarks']]
    :[['name','Business Line Name'],['code','Business Line Code'],['description','Business Line Description']];
   const content='<div class="mw-bl-grid">'+fields.map(([key,label])=>blInput(key,label,record,mode)).join('')+'</div>';
   return '<div class="mw-bl-section-tools" role="group" aria-label="Section display"><button type="button" class="mw-bl-section-action" data-bl-sections="expand">Expand all</button><button type="button" class="mw-bl-section-action" data-bl-sections="collapse">Collapse all</button></div><section class="mw-bl-section"><details open><summary>'+esc(groups[0].name)+' <span class="mw-bl-chevron">⌄</span></summary><div class="mw-bl-section-content">'+content+'</div></details></section>';
  }
  return '<div class="mw-bl-section-tools" role="group" aria-label="Section display"><button type="button" class="mw-bl-section-action" data-bl-sections="expand">Expand all</button><button type="button" class="mw-bl-section-action" data-bl-sections="collapse">Collapse all</button></div>'+groups.map((group,index)=>'<section class="mw-bl-section"><details '+(index===0||mode==='read'&&index===1?'open':'')+'><summary>'+esc(group.name)+' <span class="mw-bl-chevron" aria-hidden="true">⌄</span></summary><div class="mw-bl-section-content"><div class="mw-bl-grid">'+group.fields.map(([key,label])=>blInput(key,label,record,mode)).join('')+'</div></div></details></section>').join('');
 }
 function wireBlSections(dialogNode){
  dialogNode.querySelectorAll('[data-bl-sections]').forEach(button=>button.addEventListener('click',()=>{
   const expand=button.dataset.blSections==='expand';
   dialogNode.querySelectorAll('.mw-bl-section details').forEach(section=>{section.open=expand;});
  }));
  dialogNode.querySelectorAll('.mw-bl-section details').forEach(section=>section.addEventListener('toggle',()=>{
   const field=section.querySelector('input,select,textarea');
   if(!section.open&&field&&field===document.activeElement)section.querySelector('summary')?.focus();
  }));
 }
 function formValues(form){return JSON.stringify([...new FormData(form).entries()])}
 function editForm(record){
 if(dead||!permitted(record?'edit':'create'))return;
 if(record&&['business-lines','regions'].includes(config.key)){openBlRecord(record.id,true);return;}
 const editing=!!record,fields=(config.fields||[]).filter(f=>!f.views||f.views.includes(editing?'edit':'create'));
 const currentValue=f=>record?.[f.key]??(f.key==='owner'?(user.name||user.email):f.default??'');
 const fieldHTML=f=>{const value=currentValue(f),label='<label class="mw-field '+(f.full?'mw-field-full':'')+'">'+esc(f.label)+(f.required?' <span class="mw-required" aria-hidden="true">*</span>':'');const attrs='name="'+esc(f.key)+'" '+(f.required?'required ':'')+(f.maxLength?'maxlength="'+f.maxLength+'" ':'');
 if(f.type==='readonly')return label+'<input value="'+esc(value)+'" readonly aria-readonly="true"></label>';
 if(f.type==='multi-select'){const selected=new Set(Array.isArray(value)?value:[]),options=[...(f.optionsFrom?(state.referenceData[f.optionsFrom]||[]):(f.options||[]))];if(f.key==='businessLineIds'&&record?.businessLines){for(const line of record.businessLines)if(!options.some(option=>typeof option==='object'&&option.id===line.id))options.push({...line,name:line.name+' (Inactive — existing mapping)'});}return label+'<select '+attrs+' multiple size="'+Math.min(7,Math.max(3,options.length||3))+'">'+options.map(option=>{const key=typeof option==='object'?option.id:option,text=typeof option==='object'?(option.code?option.code+' — ':'')+(option.name||option.label||option.id):option;return '<option value="'+esc(key)+'" '+(selected.has(key)?'selected':'')+'>'+esc(text)+'</option>';}).join('')+'</select><span class="mw-field-hint">Use Ctrl/Cmd-click to select multiple Business Lines.</span></label>';}
 if(f.type==='select'){const options=f.optionsFrom?(state.referenceData[f.optionsFrom]||[]):(f.options||[]);const rendered=options.map(option=>{const key=typeof option==='object'?option.id:option,text=typeof option==='object'?(option.code?option.code+' — ':'')+(option.name||option.label||option.id):option;return '<option value="'+esc(key)+'" '+(key===value?'selected':'')+'>'+esc(text)+'</option>';}).join('');return label+'<select '+attrs+'>'+(f.optionsFrom?'<option value="">- Select -</option>':'')+rendered+'</select></label>';}
 if(f.type==='textarea')return label+'<textarea '+attrs+' rows="4" data-counted="'+esc(f.key)+'">'+esc(value)+'</textarea>'+(f.maxLength?'<span class="mw-field-hint"><span data-count-for="'+esc(f.key)+'">'+String(value).length+'</span>/'+f.maxLength+' characters</span>':'')+'</label>';
 return label+'<input '+attrs+'type="'+esc(f.type||'text')+'" autocomplete="off" value="'+esc(value)+'"></label>'};
 function countryForm(){
  const section=(title,content,open)=>'<section class="mw-bl-section"><details '+(open?'open':'')+'><summary>'+title+' <span class="mw-bl-chevron" aria-hidden="true">⌄</span></summary><div class="mw-bl-section-content">'+content+'</div></details></section>';
  const readOnly=(label,value)=>'<div class="mw-field"><span class="mw-muted">'+esc(label)+'</span><div class="mw-readonly-value">'+esc(value??'—')+'</div></div>';
  const info='<div class="mw-form-grid mw-bl-grid">'+fields.filter(f=>f.key!=='businessLineIds').map(fieldHTML).join('')+'</div><p class="mw-field-hint">Country Flag is generated automatically from the 2-letter Country Code.</p>';
  const relation='<div class="mw-form-grid mw-bl-grid">'+fields.filter(f=>f.key==='businessLineIds').map(fieldHTML).join('')+'</div><p class="mw-field-hint">Only Active Business Lines can be newly assigned. Existing relationships remain until removed.</p>';
  const owner='<div class="mw-form-grid mw-bl-grid">'+readOnly('Owner',record?.owner||user.name||user.email)+readOnly('Owner ID',record?.ownerId||'Assigned on creation')+'</div>';
  const audit='<div class="mw-form-grid mw-bl-grid">'+readOnly('Country ID',record?.displayId||'Generated on creation')+readOnly('Status',record?.status||'Active')+readOnly('Created By',record?.createdBy||user.name||user.email)+readOnly('Created At',record?.createdAt?date(record.createdAt):'On creation')+readOnly('Last Modified By',record?.updatedBy||'On creation')+readOnly('Last Modified At',record?.updatedAt?date(record.updatedAt):'On creation')+'</div>';
  return '<form id="mw-record-form" class="mw-bl-form"><div class="mw-bl-section-tools" role="group" aria-label="Country form sections"><button type="button" class="mw-bl-section-action" data-bl-sections="expand">Expand all</button><button type="button" class="mw-bl-section-action" data-bl-sections="collapse">Collapse all</button></div>'+section('Country Information',info,true)+section('Business Line Presence',relation,true)+section('Ownership',owner,false)+section('Record Information',audit,false)+'<p class="mw-form-error" role="alert" hidden></p></form>';
 }
 function regionForm(){
  const section=(title,content,open)=>'<section class="mw-bl-section"><details '+(open?'open':'')+'><summary>'+title+' <span class="mw-bl-chevron" aria-hidden="true">⌄</span></summary><div class="mw-bl-section-content">'+content+'</div></details></section>';
  const readOnly=(label,value)=>'<div class="mw-field"><span class="mw-muted">'+esc(label)+'</span><div class="mw-readonly-value">'+esc(value??'—')+'</div></div>';
  const info='<div class="mw-form-grid mw-bl-grid">'+fields.map(fieldHTML).join('')+'</div><p class="mw-field-hint">Region belongs to one Active Business Line. Country is intentionally not part of Region.</p>';
  const owner='<div class="mw-form-grid mw-bl-grid">'+readOnly('Owner',record?.owner||user.name||user.email)+readOnly('Owner ID',record?.ownerId||'Assigned on creation')+'</div>';
  const audit='<div class="mw-form-grid mw-bl-grid">'+readOnly('Region ID',record?.displayId||'Generated on creation')+readOnly('Status',record?.status||'Active')+readOnly('Business Line ID',record?.businessLineId||'Derived from Business Line')+readOnly('Created By',record?.createdBy||user.name||user.email)+readOnly('Created At',record?.createdAt?date(record.createdAt):'On creation')+readOnly('Last Modified By',record?.updatedBy||'On creation')+readOnly('Last Modified At',record?.updatedAt?date(record.updatedAt):'On creation')+'</div>';
  return '<form id="mw-record-form" class="mw-bl-form"><div class="mw-bl-section-tools" role="group" aria-label="Region form sections"><button type="button" class="mw-bl-section-action" data-bl-sections="expand">Expand all</button><button type="button" class="mw-bl-section-action" data-bl-sections="collapse">Collapse all</button></div>'+section('Region Information',info,true)+section('Ownership',owner,false)+section('Record Information',audit,false)+'<p class="mw-form-error" role="alert" hidden></p></form>';
 }
 const body=['business-lines','regions'].includes(config.key)?'<form id="mw-record-form" class="mw-bl-form">'+blFormSections(record,editing?'edit':'create')+(editing?'<div class="mw-bl-status-reason" hidden><label for="mw-bl-status-reason">Reason for status change <span class="mw-required">*</span></label><textarea id="mw-bl-status-reason" maxlength="500" rows="2" placeholder="Explain why the status is changing"></textarea><small>Required only when changing Active / Inactive.</small></div>':'')+'<p class="mw-form-error" role="alert" hidden></p></form>':config.key==='countries'?countryForm():'<form id="mw-record-form"><p class="mw-form-intro">'+(editing?'Update details. Record identifiers and audit fields are protected.':'Create this record. The record owner will be you.')+'</p><h3>Basic information</h3><div class="mw-form-grid">'+fields.map(fieldHTML).join('')+'</div>'+(editing?'<h3>System information</h3><dl class="mw-details-grid"><div><dt>'+esc(allColumns.find(c=>c.key==='displayId')?.label||'Record ID')+'</dt><dd>'+esc(record.displayId)+'</dd></div><div><dt>Last modified</dt><dd>'+esc(date(record.updatedAt))+'</dd></div></dl>':'')+'<p class="mw-form-error" role="alert" hidden></p></form>';
 const d=openDialog(['business-lines','regions','countries'].includes(config.key)?(editing?'Edit '+config.singular:'New '+config.singular):(editing?'Edit ':'Create ')+config.singular,body,'<button type="button" class="mw-btn" id="mw-cancel">Cancel</button><button type="submit" form="mw-record-form" class="mw-btn mw-primary" id="mw-save">'+(['business-lines','regions','countries'].includes(config.key)?'Save':editing?'Save changes':'Create '+esc(config.singular))+'</button>');if(!d)return;
 if(['business-lines','countries','regions'].includes(config.key)){d.classList.add('mw-bl-create-dialog');if(config.key==='countries')d.classList.add('mw-country-create-dialog');blPopupHeader(d);if(config.key==='countries')d.querySelector('.mw-dialog-body')?.setAttribute('aria-label','Scrollable Country details');if(config.key==='regions')d.querySelector('.mw-dialog-body')?.setAttribute('aria-label','Scrollable Region details');}
 const form=d.querySelector('form'),base=formValues(form);dialogDirty=()=>formValues(form)!==base;recordsTools?.wireForm(form);
 if(config.key==='countries'){wireBlSections(d);form.addEventListener('invalid',event=>{const section=event.target.closest('.mw-bl-section details');if(section)section.open=true;},true);}
 if(['business-lines','regions'].includes(config.key)){wireBlSections(d);wireBlFieldActions(form,record,editing?'edit':'create');form.addEventListener('invalid',event=>{const section=event.target.closest('.mw-bl-section details');if(section)section.open=true},true);if(editing){const status=form.querySelector('[name="status"]'),reasonWrap=form.querySelector('.mw-bl-status-reason'),reasonField=form.querySelector('#mw-bl-status-reason');const sync=()=>{const changed=status?.value!==record.status;reasonWrap.hidden=!changed;reasonField.required=changed;if(!changed)reasonField.value='';};status?.addEventListener('change',sync);sync()}}
 d.querySelector('#mw-cancel').onclick=()=>closeDialog();
 form.querySelectorAll('[data-counted],textarea[name="description"]').forEach(input=>input.oninput=()=>{const count=form.querySelector('[data-count-for="'+(input.dataset.counted||input.name)+'"]');if(count)count.textContent=input.value.length});
 if(['business-lines','regions'].includes(config.key)){const code=form.elements.code;if(code)code.addEventListener('input',()=>{const p=code.selectionStart;code.value=code.value.toUpperCase();code.setSelectionRange(p,p)})}
 if(config.key==='countries')form.querySelectorAll('[name="code"],[name="iso3"],[name="defaultCurrency"]').forEach(field=>field.addEventListener('input',()=>{const caret=field.selectionStart;field.value=field.value.toUpperCase();field.setSelectionRange(caret,caret)}));
 form.onsubmit=async e=>{e.preventDefault();if(dialogSaving||!permitted(editing?'edit':'create'))return;if(!form.checkValidity()){if(['business-lines','regions'].includes(config.key))form.querySelectorAll('.mw-bl-section details').forEach(section=>{section.open=true});form.reportValidity();return}const values=new FormData(form),error=d.querySelector('.mw-form-error');error.hidden=true;const body=Object.fromEntries(fields.filter(f=>f.type!=='readonly').map(f=>[f.key,f.type==='multi-select'?values.getAll(f.key).map(v=>String(v).trim()).filter(Boolean):String(values.get(f.key)||'').trim()]));if(editing)body.version=record.version;
 if(config.recordsFramework)body.timeZone=actionTimeZone();
 if(config.key==='business-lines'&&editing){
  const status=form.querySelector('[name="status"]')?.value||record.status;
  if(status!==record.status){const reason=form.querySelector('#mw-bl-status-reason')?.value.trim()||'';
   if(!reason){error.textContent='Reason is mandatory for status changes.';error.hidden=false;form.querySelector('#mw-bl-status-reason')?.focus();return;}
   body.status=status;body.reason=reason.slice(0,500);
  }
 }
 const missing=fields.find(f=>f.required&&!body[f.key]);if(missing){error.textContent='Enter '+missing.label.toLowerCase()+'.';error.hidden=false;form.elements[missing.key].focus();return}
 const saveControls=[...d.querySelectorAll('input,select,textarea,button')].map(el=>[el,el.disabled]);
 dialogSaving=true;d.setAttribute('aria-busy','true');saveControls.forEach(([el])=>el.disabled=true);d.querySelector('#mw-save').textContent='Saving…';
 try{await api(config.endpoint+(editing?'/'+encodeURIComponent(record.id):''),editing?'PUT':'POST',body);if(dead||dialog!==d)return;dialogSaving=false;closeDialog(true);if(config.recordsFramework){if(!editing&&state.view==='dashboard'){state.view='home';renderViews()}recordsTools?.showLatest?.()}announce(config.singular+(editing?' updated.':' created.'));await load()}
 catch(e){if(dead||dialog!==d)return;dialogSaving=false;d.removeAttribute('aria-busy');saveControls.forEach(([el,disabled])=>el.disabled=disabled);error.textContent=e.message;error.hidden=false;d.querySelector('#mw-save').disabled=false;d.querySelector('#mw-save').textContent=['business-lines','regions','countries'].includes(config.key)?'Save':editing?'Save changes':'Create '+config.singular;error.scrollIntoView({block:'nearest'})}
 };
 form.querySelector('input:not([readonly]),select,textarea')?.focus();
 }
 const countrySections=[
  {name:'Country Information',fields:[
   ['name','Country Name'],['displayId','Country ID'],['code','Country Code'],['iso3','ISO 3-Letter Code'],
   ['isoNumeric','ISO Numeric Code'],['dialingCode','International Dialing Code'],
   ['defaultCurrency','Default Currency'],['nationality','Nationality'],['continent','Continent'],
   ['alias','Country Alias / Short Name'],['flag','Country Flag'],['status','Country Status'],
   ['description','Description / Remarks']
  ]},
  {name:'Business Line Presence',fields:[['businessLineIds','Business Line Presence']]},
  {name:'Ownership',fields:[['owner','Owner'],['ownerId','Owner ID']]},
  {name:'Record Information',fields:[
   ['createdBy','Created By'],['createdById','Created By ID'],['createdAt','Created At'],
   ['updatedBy','Last Modified By'],['updatedById','Last Modified By ID'],['updatedAt','Last Modified At']
  ]},
  {name:'Lifecycle Information',fields:[
   ['archivedBy','Archived By'],['archivedById','Archived By ID'],['archivedAt','Archived At'],
   ['deletedBy','Deleted By'],['deletedById','Deleted By ID'],['deletedAt','Deleted At']
  ]}
 ];
 const countryEditable=new Set(['name','code','iso3','isoNumeric','dialingCode','defaultCurrency','nationality','continent','alias','description','status','businessLineIds']);
 const countryRequired=new Set(['name','code','iso3','isoNumeric','dialingCode','defaultCurrency','nationality','continent']);
 const countryLimits={name:150,code:2,iso3:3,isoNumeric:3,dialingCode:16,defaultCurrency:40,nationality:150,alias:150,description:500};
 const countryContinentOptions=['Africa','Asia','Europe','North America','South America','Oceania','Antarctica'];
 function countryDetailField(key,label,record,mode){
  const editing=mode==='edit'&&countryEditable.has(key);
  const full=['description','businessLineIds'].includes(key);
  const current=record?.[key],value=key==='businessLineIds'
   ?(record?.businessLines||[]).map(line=>line.code||line.name).join(', ') 
   :['createdAt','updatedAt','archivedAt','deletedAt'].includes(key)?date(current)
   :current===null||current===undefined||current===''?'—':String(current);
  const id='mw-country-detail-'+key;
  const text=editing?(current??''):value;
  const head='<label id="'+id+'-label"'+(editing?' for="'+id+'"':'')+'><span>'+esc(label)+(editing&&countryRequired.has(key)?' <span class="mw-required">*</span>':'')+'</span></label>';
  let control;
  if(!editing){
   control='<div class="mw-bl-read-value'+(full?' mw-bl-read-description':'')+'" aria-labelledby="'+id+'-label">'+esc(value)+'</div>';
  }else if(key==='businessLineIds'){
   const selected=new Set(record?.businessLineIds||[]);
   const options=[...(state.referenceData.businessLines||[])];
   for(const line of record?.businessLines||[])if(!options.some(option=>option.id===line.id))options.push({...line,name:line.name+' (Inactive — existing mapping)'});
   control='<select id="'+id+'" name="businessLineIds" multiple size="'+Math.min(7,Math.max(3,options.length))+'" aria-label="Business Line Presence">'
    +options.map(line=>'<option value="'+esc(line.id)+'"'+(selected.has(line.id)?' selected':'')+'>'+esc((line.code?line.code+' — ':'')+line.name)+'</option>').join('')+'</select>'
    +'<small class="mw-bl-hint">Select multiple with Ctrl/Cmd-click. Only Active Business Lines can be newly assigned.</small>';
  }else if(key==='continent'||key==='status'){
   const choices=key==='continent'?countryContinentOptions:['Active','Inactive'];
   control='<select id="'+id+'" name="'+key+'"'+(countryRequired.has(key)?' required':'')+'>'
    +choices.map(option=>'<option value="'+esc(option)+'"'+(option===current?' selected':'')+'>'+esc(option)+'</option>').join('')+'</select>';
  }else if(key==='description'){
   control='<textarea id="'+id+'" name="'+key+'" maxlength="500" rows="3">'+esc(text)+'</textarea><small class="mw-bl-hint">Maximum 500 characters.</small>';
  }else{
   control='<input type="text" id="'+id+'" name="'+key+'" value="'+esc(text)+'"'
    +(countryRequired.has(key)?' required':'')+(countryLimits[key]?' maxlength="'+countryLimits[key]+'"':'')
    +(key==='code'||key==='iso3'?' autocapitalize="characters"':'')+' autocomplete="off">';
   if(key==='isoNumeric')control+='<small class="mw-bl-hint">Exactly three digits; leading zeroes are preserved.</small>';
   if(key==='dialingCode')control+='<small class="mw-bl-hint">Include the international prefix, for example +91.</small>';
  }
  const pencil=!editing&&countryEditable.has(key)&&!record?.archivedAt&&!record?.deletedAt&&permitted('edit')
   ?'<button type="button" class="mw-bl-field-edit" data-country-edit-field="'+esc(key)+'" aria-label="Edit '+esc(label)+'" title="Edit '+esc(label)+'">'+blPopupGlyph('edit')+'</button>':'';
  return '<div class="mw-bl-field'+(full?' mw-bl-full':'')+(editing?' mw-bl-editable':' mw-bl-readonly')+(pencil?' mw-bl-field-actionable':'')+'">'
   +head+'<div class="mw-bl-value-cell">'+control+pencil+'</div></div>';
 }
 function countryRelatedMarkup(related,record){
  const lines=Array.isArray(related?.businessLines)?related.businessLines:record?.businessLines||[];
  const modules=Array.isArray(related?.related)?related.related:[];
  const lineRows=lines.length?lines.map(line=>'<button type="button" class="mw-country-relationship" data-country-linked-line="'+esc(line.id)+'" aria-label="View Business Line '+esc(line.name||line.code)+'"><strong>'+esc(line.code||line.display_id||line.name)+'</strong><span>'+esc(line.name||'Business Line')+'</span><span class="mw-country-link-action">View Business Line</span></button>').join('')
   :'<p class="mw-country-empty">No Business Line Presence has been assigned to this Country.</p>';
  const moduleRows=modules.length?modules.map(item=>'<div class="mw-country-reference-row"><span>'+esc(item.module)+'</span><strong>'+Number(item.count||0).toLocaleString()+' linked records</strong></div>').join('')
   :'<p class="mw-country-empty">No supported CRM record references were found.</p>';
  return '<div class="mw-country-detail-links"><div><h4>Business Line Presence</h4><p class="mw-bl-hint">Current mappings to Business Lines; click a line to review its master record.</p>'+lineRows+'</div>'
   +'<div><h4>CRM Records Using This Country</h4><p class="mw-bl-hint">Existing references identified through supported Country fields.</p>'+moduleRows+'</div></div>';
 }
 function countryHistoryMarkup(history){
  if(history===null)return '<p role="status">Loading audit history…</p>';
  if(!Array.isArray(history))return '<p role="status">Audit history is unavailable; Country details remain accessible.</p>';
  if(!history.length)return '<p>No recorded changes yet.</p>';
  return history.map(item=>{
   const changes=Object.entries(item.changes||{}).filter(([key])=>key!=='_context');
   return '<article><strong>'+esc(item.action)+'</strong> · '+esc(date(item.createdAt))+' · '+esc(item.actor||'System')
    +(item.reason?' · Reason: '+esc(item.reason):'')
    +(changes.length?'<div class="mw-country-change-list">'+changes.slice(0,20).map(([key,value])=>'<div>'+esc(allColumns.find(c=>c.key===key)?.label||key)+': '+esc(value?.before??'—')+' → '+esc(value?.after??'—')+'</div>').join('')+'</div>':'')+'</article>';
  }).join('');
 }
 async function openCountryRecord(id,startEdit=false,discardChecked=false){
  if(dead||!permitted('read')||(startEdit&&!permitted('edit')))return;
  let d=dialog;
  if(blDetail){if(!discardChecked&&!leaveBlAllowed())return;blDraft=null;dialogDirty=null;}
  else{d=openDialog(startEdit?'Edit Country':'View Country','','<button type="button" class="mw-btn" id="bl-back">Close</button>',true);if(!d)return;d.classList.add('mw-bl-record-dialog','mw-country-record-dialog');}
  blPopupHeader(d);
  const request=++blLoadSequence;
  const page=document.createElement('section');page.className='mw-bl-detail-page mw-country-detail-page';page.setAttribute('aria-label','Country record details');
  page.innerHTML='<div class="mw-state" role="status"><span class="mw-spinner"></span> Loading Country…</div>';
  blDetail=page;blRecord=null;d.querySelector('.mw-dialog-body').replaceChildren(page);
  d.querySelector('footer').innerHTML='<button type="button" class="mw-btn" id="bl-back">Close</button>';
  d.querySelector('#bl-back').onclick=()=>closeDialog();
  d.querySelector('#mw-dialog-title').textContent=startEdit?'Edit Country':'View Country';
  try{
   const {record}=await api(config.endpoint+'/'+encodeURIComponent(id));
   if(dead||dialog!==d||request!==blLoadSequence)return;
   const results=await Promise.allSettled([
    permitted('history')?api(config.endpoint+'/'+encodeURIComponent(id)+'/history'):Promise.resolve({history:[]}),
    api(config.endpoint+'/'+encodeURIComponent(id)+'/related')
   ]);
   if(dead||dialog!==d||request!==blLoadSequence)return;
   const history=results[0].status==='fulfilled'?results[0].value.history||[]:undefined;
   const related=results[1].status==='fulfilled'?results[1].value:null;
   renderCountryRecordPage(record,startEdit?'edit':'read',related,history);
  }catch(error){
   if(dead||dialog!==d||request!==blLoadSequence)return;
   page.innerHTML='<div class="mw-state"><p class="mw-form-error" role="alert">'+esc(error.message)+'</p><button type="button" class="mw-btn" data-country-retry>Try again</button></div>';
   page.querySelector('[data-country-retry]').onclick=()=>openCountryRecord(id,startEdit,true);
  }
 }
 function renderCountryRecordPage(record,mode='read',related=null,history=null){
  if(!blDetail||!dialog)return;
  const d=dialog,page=blDetail;blRecord=record;blRecordMode=mode;blDraft=null;dialogDirty=null;
  const editing=mode==='edit'&&permitted('edit')&&!record.archivedAt&&!record.deletedAt;
  const editable=permitted('edit')&&!record.archivedAt&&!record.deletedAt;
  const status=record.deletedAt?'Deleted':record.archivedAt?'Archived':record.status;
  const index=state.records.findIndex(row=>row.id===record.id),previous=index>0?state.records[index-1]:null,next=index>=0&&index<state.records.length-1?state.records[index+1]:null;
  const hasPrevious=!!previous||index===0&&state.page>1,hasNext=!!next||index>=0&&index===state.records.length-1&&state.page<state.totalPages;
  const groups=[...countrySections,{name:'Related / Used In'},{name:'Audit History'}];
  const content=countrySections.map((group,i)=>
   '<section class="mw-bl-section"><details '+(i===0||!editing&&i===1?'open':'')+'><summary>'+esc(group.name)+' <span class="mw-bl-chevron" aria-hidden="true">⌄</span></summary><div class="mw-bl-section-content"><div class="mw-bl-grid">'
   +group.fields.map(([key,label])=>countryDetailField(key,label,record,editing?'edit':'read')).join('')
   +'</div></div></details></section>').join('');
  const relationships='<section class="mw-bl-section"><details open><summary>Related / Used In <span class="mw-bl-chevron" aria-hidden="true">⌄</span></summary><div class="mw-bl-section-content">'+countryRelatedMarkup(related,record)+'</div></details></section>';
  const audit=permitted('history')?'<section class="mw-bl-section"><details><summary>Audit History <span class="mw-bl-chevron" aria-hidden="true">⌄</span></summary><div class="mw-bl-section-content mw-history" data-country-audit>'+countryHistoryMarkup(history)+'</div></details></section>':'';
  page.innerHTML='<header class="mw-bl-detail-heading"><div><h2>'+esc((record.flag?record.flag+' ':'')+record.name)+'</h2><div class="mw-bl-detail-meta"><span>'+esc(record.displayId)+'</span><span class="mw-status '+(status==='Active'?'mw-active':'mw-inactive')+'">'+esc(status)+'</span></div></div>'
   +'<div class="mw-bl-detail-actions"><button type="button" class="mw-btn" data-bl-prev'+(!hasPrevious?' disabled':'')+'>'+blPopupGlyph('previous')+'<span>Previous</span></button><button type="button" class="mw-btn" data-bl-next'+(!hasNext?' disabled':'')+'><span>Next</span>'+blPopupGlyph('next')+'</button></div></header>'
   +'<p class="mw-bl-record-notice" role="status" hidden></p>'
   +'<div class="mw-bl-detail-layout"><div class="mw-bl-navigation"><nav class="mw-bl-detail-index" aria-label="Jump to Country section">'+groups.filter(g=>g.name!=='Audit History'||permitted('history')).map((g,i)=>'<button type="button" data-country-jump="'+i+'">'+esc(g.name)+'</button>').join('')+'</nav><div class="mw-bl-detail-tools" role="group" aria-label="Section display"><button type="button" data-country-expand="1">Expand all</button><button type="button" data-country-expand="0">Collapse all</button></div></div>'
   +'<div class="mw-bl-detail-content">'+(editing?'<form id="mw-record-form" class="mw-bl-form">'+content+'<div class="mw-bl-status-reason" hidden><label for="mw-country-status-reason">Reason for Status Change <span class="mw-required">*</span></label><textarea id="mw-country-status-reason" maxlength="500" rows="3" placeholder="Explain the status change"></textarea></div><p class="mw-form-error" role="alert" hidden></p></form>':content)+relationships+audit+'</div></div>';
  const footer=d.querySelector('footer');
  footer.innerHTML='<button type="button" class="mw-btn" id="bl-back">Close</button>'
   +(editing?'<span class="mw-bl-footer-hint">* Required fields</span><button type="button" class="mw-btn mw-bl-cancel" id="country-cancel">Cancel</button><button type="submit" form="mw-record-form" class="mw-btn mw-primary" id="mw-save">Save</button>'
    :editable?'<button type="button" class="mw-btn mw-primary" id="country-edit">Edit Country</button>':'');
  footer.querySelector('#bl-back').onclick=()=>closeDialog();
  footer.querySelector('#country-edit')?.addEventListener('click',()=>renderCountryRecordPage(record,'edit',related,history));
  footer.querySelector('#country-cancel')?.addEventListener('click',()=>{if(leaveBlAllowed())renderCountryRecordPage(record,'read',related,history);});
  d.dataset.recordMode=editing?'edit':'read';
  d.querySelector('#mw-dialog-title').textContent=editing?'Edit Country':'View Country';
  blPopupHeader(d,!editing&&editable);
  blDisclosureAffordance(page);
  const sections=[...page.querySelectorAll('.mw-bl-detail-content .mw-bl-section')];
  page.querySelectorAll('[data-country-expand]').forEach(button=>button.onclick=()=>sections.forEach(section=>section.querySelector('details').open=button.dataset.countryExpand==='1'));
  page.querySelectorAll('[data-country-jump]').forEach(button=>button.onclick=()=>{
   const section=sections[Number(button.dataset.countryJump)];if(section){
    section.querySelector('details').open=true;
    section.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
    section.querySelector('summary')?.focus({preventScroll:true});
   }
  });
  page.querySelectorAll('[data-country-edit-field]').forEach(button=>button.onclick=()=>{
   const key=button.dataset.countryEditField;if(!editable)return;
   renderCountryRecordPage(record,'edit',related,history);
   const control=page.querySelector('[name="'+key+'"]');control?.closest('details')?.setAttribute('open','');control?.focus({preventScroll:true});
  });
  page.querySelectorAll('[data-country-linked-line]').forEach(button=>button.onclick=async()=>{
   if(!leaveBlAllowed()||!window.SCRM?.navigateRecord)return;
   const lineId=button.dataset.countryLinkedLine;closeDialog(true);
   await window.SCRM.navigateRecord('businesslines',lineId,'Business Line');
  });
  const navigate=async direction=>{
   if(!leaveBlAllowed())return;
   const adjacent=direction<0?previous:next;
   if(adjacent){await openCountryRecord(adjacent.id,false,true);return;}
   const nextPage=state.page+(direction<0?-1:1);if(nextPage<1||nextPage>state.totalPages)return;
   const priorPage=state.page;state.page=nextPage;
   try{await load();if(state.error||!state.records.length)throw new Error(state.error||'Unable to load adjacent Countries.');
    await openCountryRecord((direction<0?state.records.at(-1):state.records[0]).id,false,true);
   }catch(e){state.page=priorPage;const notice=page.querySelector('.mw-bl-record-notice');if(notice){notice.textContent=e.message;notice.hidden=false;}}
  };
  page.querySelector('[data-bl-prev]').onclick=()=>navigate(-1);
  page.querySelector('[data-bl-next]').onclick=()=>navigate(1);
  d.querySelector('.mw-dialog-body').scrollTop=0;
  if(!editing)return;
  const form=page.querySelector('#mw-record-form');blDraft=form;recordsTools?.wireForm(form);
  const initial=formValues(form),mark=()=>{form.dataset.dirty=String(formValues(form)!==initial)};
  form.addEventListener('input',mark);form.addEventListener('change',mark);
  form.querySelectorAll('[name="code"],[name="iso3"],[name="defaultCurrency"]').forEach(field=>field.addEventListener('input',()=>{
   const pos=field.selectionStart;field.value=field.value.toUpperCase();field.setSelectionRange(pos,pos);mark();
  }));
  const statusField=form.elements.namedItem('status'),reason=form.querySelector('#mw-country-status-reason'),reasonWrap=reason.parentElement;
  const syncStatus=()=>{const changed=statusField?.value!==record.status;reasonWrap.hidden=!changed;reason.required=changed;if(!changed)reason.value='';mark();};
  statusField.addEventListener('change',syncStatus);syncStatus();
  form.addEventListener('invalid',event=>event.target.closest('details')?.setAttribute('open',''),true);
  form.onsubmit=async event=>{
   event.preventDefault();if(blBusy||!permitted('edit'))return;
   const error=form.querySelector('.mw-form-error');error.hidden=true;
   if(!form.checkValidity()){sections.forEach(s=>s.querySelector('details').open=true);form.reportValidity();error.textContent='Review the highlighted Country fields.';error.hidden=false;return;}
   const values=new FormData(form),payload={version:record.version,timeZone:actionTimeZone()};
   for(const key of countryEditable)if(key!=='status'&&key!=='businessLineIds')payload[key]=String(values.get(key)||'').trim();
   payload.businessLineIds=values.getAll('businessLineIds').map(x=>String(x).trim()).filter(Boolean);
   if(statusField.value!==record.status){
    if(!reason.value.trim()){error.textContent='Reason is mandatory for status changes.';error.hidden=false;reason.focus();return;}
    payload.status=statusField.value;payload.reason=reason.value.trim();
   }
   blBusy=true;dialogSaving=true;
   const controls=[...d.querySelectorAll('input,select,textarea,button')].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);
   d.setAttribute('aria-busy','true');d.querySelector('#mw-save').textContent='Saving…';
   try{
    await api(config.endpoint+'/'+encodeURIComponent(record.id),'PUT',payload);
    if(dead||dialog!==d||blDetail!==page)return;
   }catch(e){
    if(dead||dialog!==d||blDetail!==page)return;
    blBusy=false;dialogSaving=false;d.removeAttribute('aria-busy');controls.forEach(([el,disabled])=>el.disabled=disabled);
    error.textContent=e.message;error.hidden=false;error.tabIndex=-1;error.focus();d.querySelector('#mw-save').textContent='Save';return;
   }
   blBusy=false;dialogSaving=false;blDraft=null;dialogDirty=null;
   closeDialog(true);recordsTools?.showLatest?.();announce('Country saved successfully.');await load();
  };
  form.querySelector('input:not([readonly]),select,textarea')?.focus({preventScroll:true});
 }

 async function readRecord(id){if(dead||!permitted('read'))return;if(['business-lines','regions'].includes(config.key)){openBlRecord(id);return;}if(config.key==='countries'){openCountryRecord(id);return;}const d=openDialog('View '+config.singular,'<div class="mw-state">Loading record…</div>','<button type="button" class="mw-btn" id="mw-read-close">Close</button>',true);if(!d)return;d.querySelector('#mw-read-close').onclick=()=>closeDialog();try{const [{record},history,related]=await Promise.all([api(config.endpoint+'/'+encodeURIComponent(id)),permitted('history')?api(config.endpoint+'/'+encodeURIComponent(id)+'/history'):Promise.resolve({history:[]}),['countries','regions'].includes(config.key)?api(config.endpoint+'/'+encodeURIComponent(id)+'/related'):Promise.resolve(null)]);if(dead||dialog!==d)return;
 if(config.key==='business-lines'){d.querySelector('.mw-dialog-body').innerHTML='<div class="mw-bl-read">'+blFormSections(record,'read')+'</div>'+(config.key==='regions'?'<section class="mw-bl-section"><details><summary>Related / Used In <span class="mw-bl-chevron" aria-hidden="true">&#8964;</span></summary><div class="mw-bl-section-content"><div class="mw-details-grid">'+((related?.related||[]).length?(related.related||[]).map(item=>'<div><dt>'+esc(item.module)+'</dt><dd>'+Number(item.count).toLocaleString()+' linked records'+(Number(item.active)?' · '+Number(item.active).toLocaleString()+' active':'')+'</dd></div>').join(''):'<div><dt>CRM references</dt><dd>None</dd></div>')+'</div></div></details></section>':'')+(permitted('history')?'<section class="mw-bl-section"><details><summary>Audit History <span class="mw-bl-chevron">⌄</span></summary><div class="mw-bl-section-content mw-history">'+((history.history||[]).length?(history.history||[]).map(h=>'<article><strong>'+esc(h.action)+'</strong> · '+esc(date(h.createdAt))+' · '+esc(h.actor||'System')+(h.reason?' · Reason: '+esc(h.reason):'')+'</article>').join(''):'<p>No history available.</p>')+'</div></details></section>':'');wireBlSections(d);if(permitted('edit')&&!record.archivedAt&&!record.deletedAt){const edit=document.createElement('button');edit.type='button';edit.className='mw-btn mw-primary';edit.textContent='Edit Business Line';edit.onclick=()=>editForm(record);d.querySelector('footer').append(edit)}return;}
 d.querySelector('.mw-dialog-body').innerHTML='<div class="mw-detail-title"><div><span class="mw-id">'+esc(record.displayId)+'</span><h3>'+esc(record.name)+'</h3></div><span class="mw-status '+(record.status==='Active'?'mw-active':'mw-inactive')+'">'+esc(record.deletedAt?'Deleted':record.archivedAt?'Archived':record.status)+'</span></div><h3>Basic information</h3><dl class="mw-details-grid">'+allColumns.filter(c=>!c.system).map(c=>'<div class="'+(c.key==='remarks'?'mw-field-full':'')+'"><dt>'+esc(c.label)+'</dt><dd>'+esc(c.type==='date'?date(record[c.key]):record[c.key]||'—')+'</dd></div>').join('')+'</dl><h3>System information</h3><dl class="mw-details-grid">'+allColumns.filter(c=>c.system).map(c=>'<div><dt>'+esc(c.label)+'</dt><dd>'+esc(c.type==='date'?date(record[c.key]):record[c.key]||'—')+'</dd></div>').join('')+'</dl>'+(config.key==='countries'?'<h3>Related / Used In</h3><div class="mw-details-grid">'+((related?.businessLines||[]).length?'<div class="mw-field-full"><dt>Business Line Presence</dt><dd>'+esc((related.businessLines||[]).map(x=>(x.code||x.name)).join(', '))+'</dd></div>':'<div><dt>Business Line Presence</dt><dd>None</dd></div>')+(related?.related||[]).map(item=>'<div><dt>'+esc(item.module)+'</dt><dd>'+Number(item.count).toLocaleString()+' linked records</dd></div>').join('')+(!related?.total?'<div><dt>Other CRM references</dt><dd>None</dd></div>':'')+'</div>':config.key==='regions'?'<h3>Related / Used In</h3><div class="mw-details-grid">'+(related?.related||[]).map(item=>'<div><dt>'+esc(item.module)+'</dt><dd>'+Number(item.count).toLocaleString()+' linked records'+(Number(item.active)?' · '+Number(item.active).toLocaleString()+' active':'')+'</dd></div>').join('')+(!related?.total?'<div><dt>CRM references</dt><dd>None</dd></div>':'')+'</div>':'')+'<h3>Audit history</h3><div class="mw-history">'+((history.history||[]).length?(history.history||[]).map(h=>'<article><div><strong>'+esc(h.action)+'</strong><span>'+esc(date(h.createdAt))+'</span></div><p>'+esc(h.actor||'System')+'</p>'+Object.entries(h.changes||{}).map(([key,value])=>'<p class="mw-history-change"><b>'+esc(allColumns.find(c=>c.key===key)?.label||key)+':</b> '+esc(value?.before??'—')+' → '+esc(value?.after??'—')+'</p>').join('')+'</article>').join(''):'<p>No history available.</p>')+'</div>';
 if(!permitted('history')){const historyNode=d.querySelector('.mw-history');if(historyNode){historyNode.hidden=true;historyNode.previousElementSibling.hidden=true}}
 if(permitted('edit')&&!record.archivedAt){const edit=document.createElement('button');edit.type='button';edit.className='mw-btn mw-primary';edit.textContent='Edit '+config.singular;edit.onclick=()=>editForm(record);d.querySelector('footer').append(edit)}
 }catch(e){if(!dead&&dialog===d)d.querySelector('.mw-dialog-body').innerHTML='<p class="mw-form-error" role="alert">'+esc(e.message)+'</p>'}}



 // Create, Read and Edit share the native modal service. The Records/Overview
 // workspace remains mounted behind it, preserving query, selection and scroll.
 function leaveBlAllowed(){return !blBusy&&!(blDraft?.dataset.dirty==='true'&&!window.confirm('Discard your unsaved changes?'));}
 function closeBlRecord(force=false){return !blDetail||closeDialog(force);}
 function blAuditMarkup(history){
  if(history===null)return '<p role="status">Loading audit history...</p>';
  return history.length?history.map(h=>'<article><strong>'+esc(h.action)+'</strong> &middot; '+esc(date(h.createdAt))+' &middot; '+esc(h.actor||'System')+(h.reason?' &middot; '+esc(h.reason):'')+'</article>').join(''):'<p>No history available.</p>';
 }
 async function refreshBlAudit(d,id){
  if(!permitted('history'))return;
  try{const result=await api(config.endpoint+'/'+encodeURIComponent(id)+'/history');
   if(dead||dialog!==d||blRecord?.id!==id)return;
   d.querySelector('[data-bl-history]')?.replaceChildren();
   const area=d.querySelector('[data-bl-history]');if(area)area.innerHTML=blAuditMarkup(result.history||[]);
  }catch(e){if(dead||dialog!==d||blRecord?.id!==id)return;const area=d.querySelector('[data-bl-history]');if(area){area.innerHTML='<p role="status">Audit history could not be loaded. Record details are still available.</p><button type="button" class="mw-btn" data-audit-retry>Retry history</button>';area.querySelector('[data-audit-retry]').onclick=()=>refreshBlAudit(d,id);}}
 }
 async function openBlRecord(id,startEdit=false,discardChecked=false){
  if(dead||!permitted('read')||(startEdit&&!permitted('edit')))return;
  let d=dialog;
  if(blDetail){if(!discardChecked&&!leaveBlAllowed())return;blDraft=null;dialogDirty=null;}
  else{
   d=openDialog(startEdit?'Edit '+config.singular:'View '+config.singular,'','<button type="button" class="mw-btn" id="bl-back">Close</button>',true);
   if(!d)return;d.classList.add('mw-bl-record-dialog');
  }
  blPopupHeader(d);
  const request=++blLoadSequence;
  const page=document.createElement('section');page.className='mw-bl-detail-page';page.setAttribute('aria-label',config.singular+' record details');
  page.innerHTML='<div class="mw-state" role="status"><span class="mw-spinner"></span> Loading record...</div>';
  blDetail=page;blRecord=null;d.querySelector('.mw-dialog-body').replaceChildren(page);
  d.querySelector('footer').innerHTML='<button type="button" class="mw-btn" id="bl-back">Close</button>';d.querySelector('#bl-back').onclick=()=>closeDialog();
  d.querySelector('#mw-dialog-title').textContent=startEdit?'Edit '+config.singular:'View '+config.singular;d.querySelector('#mw-dialog-title').focus({preventScroll:true});
  try{const [{record},related]=await Promise.all([api(config.endpoint+'/'+encodeURIComponent(id)),config.key==='regions'?api(config.endpoint+'/'+encodeURIComponent(id)+'/related'):Promise.resolve(null)]);
   if(dead||dialog!==d||request!==blLoadSequence)return;
   renderBlRecordPage(record,startEdit?'edit':'read',related);refreshBlAudit(d,record.id);
  }catch(e){if(dead||dialog!==d||request!==blLoadSequence)return;page.innerHTML='<div class="mw-state"><p class="mw-form-error" role="alert">'+esc(e.message)+'</p><button type="button" class="mw-btn" data-bl-retry>Try again</button></div>';page.querySelector('[data-bl-retry]').onclick=()=>openBlRecord(id,startEdit);}
 }
 function renderBlRecordPage(record,mode='read',related=null){
  if(!blDetail||!dialog)return;
  const d=dialog,page=blDetail;blRecord=record;blRecordMode=mode;blDraft=null;dialogDirty=null;
  const editing=mode==='edit'&&permitted('edit')&&!record.archivedAt&&!record.deletedAt;
  const editable=permitted('edit')&&!record.archivedAt&&!record.deletedAt;
  d.dataset.recordMode=editing?'edit':'read';d.querySelector('#mw-dialog-title').textContent=editing?'Edit '+config.singular:'View '+config.singular;
  const index=state.records.findIndex(r=>r.id===record.id),previous=index>0?state.records[index-1]:null,next=index>=0&&index<state.records.length-1?state.records[index+1]:null;
  const hasPrevious=!!previous||index===0&&state.page>1,hasNext=!!next||index>=0&&index===state.records.length-1&&state.page<state.totalPages;
  const status=record.deletedAt?'Deleted':record.archivedAt?'Archived':record.status;
  page.innerHTML='<header class="mw-bl-detail-heading"><div><h2>'+esc(record.name)+'</h2><div class="mw-bl-detail-meta"><span>'+esc(record.displayId||'')+'</span><span class="mw-status '+(status==='Active'?'mw-active':'mw-inactive')+'">'+esc(status)+'</span></div></div><div class="mw-bl-detail-actions"><button type="button" class="mw-btn" data-bl-prev'+(!hasPrevious?' disabled':'')+'>'+blPopupGlyph('previous')+'<span>Previous</span></button><button type="button" class="mw-btn" data-bl-next'+(!hasNext?' disabled':'')+'><span>Next</span>'+blPopupGlyph('next')+'</button></div></header>'
   +'<p class="mw-bl-record-notice" role="status" hidden></p>'
   +'<div class="mw-bl-detail-tools" role="group" aria-label="Section display"><button type="button" data-bl-expand="1">'+blPopupGlyph('expand')+'<span>Expand all</span></button><button type="button" data-bl-expand="0">'+blPopupGlyph('collapse')+'<span>Collapse all</span></button></div>'
   +'<div class="mw-bl-detail-layout"><nav class="mw-bl-detail-index" aria-label="Jump to section">'+masterGroups().map((g,i)=>'<button type="button" data-bl-jump="'+i+'">'+esc(g.name)+'</button>').join('')+'</nav><div class="mw-bl-detail-content">'
   +(editing?'<form id="mw-bl-page-form" class="mw-bl-form">'+blFormSections(record,'edit')+'<div class="mw-bl-status-reason" hidden><label for="mw-bl-page-reason">Reason for status change <span class="mw-required">*</span></label><textarea id="mw-bl-page-reason" name="lifecycleReason" maxlength="500" rows="2"></textarea></div><p class="mw-form-error" role="alert" hidden></p></form>':'<div class="mw-bl-read">'+blFormSections(record,'read')+'</div>')
   +(config.key==='regions'?'<section class="mw-bl-section"><details><summary>Related / Used In <span class="mw-bl-chevron" aria-hidden="true">&#8964;</span></summary><div class="mw-bl-section-content"><div class="mw-details-grid">'+((related?.related||[]).length?(related.related||[]).map(item=>'<div><dt>'+esc(item.module)+'</dt><dd>'+Number(item.count).toLocaleString()+' linked records'+(Number(item.active)?' · '+Number(item.active).toLocaleString()+' active':'')+'</dd></div>').join(''):'<div><dt>CRM references</dt><dd>None</dd></div>')+'</div></div></details></section>':'')+(permitted('history')?'<section class="mw-bl-section"><details><summary>Audit History <span class="mw-bl-chevron" aria-hidden="true">&#8964;</span></summary><div class="mw-bl-section-content mw-history" data-bl-history>'+blAuditMarkup(null)+'</div></details></section>':'')+'</div></div>';
  const footer=d.querySelector('footer');
  footer.innerHTML='<button type="button" class="mw-btn" id="bl-back">Close</button>'+(editing?'<span class="mw-bl-footer-hint">* Required fields</span><button type="button" class="mw-btn mw-bl-cancel" id="bl-cancel">Cancel</button><button type="submit" form="mw-bl-page-form" class="mw-btn mw-primary" id="bl-save">Save</button>':editable?'<button type="button" class="mw-btn mw-primary" id="bl-edit">Edit</button>':'');
  footer.querySelector('#bl-back').onclick=()=>closeDialog();
  footer.querySelector('#bl-edit')?.addEventListener('click',()=>{renderBlRecordPage(record,'edit',related);refreshBlAudit(d,record.id)});
  footer.querySelector('#bl-cancel')?.addEventListener('click',()=>{if(leaveBlAllowed()){renderBlRecordPage(record,'read',related);refreshBlAudit(d,record.id)}});
  blPopupHeader(d,!editing&&editable);
  // Consolidate section jumps and all-section controls into one wrapping navigation row.
  const navigation=document.createElement('div');navigation.className='mw-bl-navigation';
  navigation.append(page.querySelector('.mw-bl-detail-index'),page.querySelector('.mw-bl-detail-tools'));
  page.querySelector('.mw-bl-detail-layout').prepend(navigation);
  blDisclosureAffordance(page);
  const sections=[...page.querySelectorAll('.mw-bl-detail-content .mw-bl-section')];
  const sectionKey='scrm:master-sections:'+user.id+':'+config.key;
  let saved=recordsTools?.sections()||{};if(!recordsTools?.enabled)try{saved=JSON.parse(localStorage.getItem(sectionKey)||'{}')||{}}catch{}
  sections.slice(0,masterGroups().length).forEach((section,i)=>{const details=section.querySelector('details'),name=masterGroups()[i].name;
   if(typeof saved[name]==='boolean')details.open=saved[name];
   details.addEventListener('toggle',()=>{if(!section.isConnected||dialog!==d)return;try{const all=Object.fromEntries(sections.slice(0,masterGroups().length).map((item,j)=>[masterGroups()[j].name,item.querySelector('details').open]));localStorage.setItem(sectionKey,JSON.stringify(all));for(const [key,open]of Object.entries(all))recordsTools?.section(key,open);}catch{}});
  });
  page.querySelectorAll('[data-bl-expand]').forEach(b=>b.onclick=()=>sections.forEach(section=>{section.querySelector('details').open=b.dataset.blExpand==='1'}));
  page.querySelectorAll('[data-bl-jump]').forEach(b=>b.onclick=()=>{const section=sections[Number(b.dataset.blJump)];if(section){section.querySelector('details').open=true;section.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});section.querySelector('summary').focus({preventScroll:true})}});
  page.querySelectorAll('.mw-bl-section-tools').forEach(el=>el.remove());
  const navigate=async direction=>{
   if(!leaveBlAllowed())return;
   const adjacent=direction<0?previous:next;
   if(adjacent){await openBlRecord(adjacent.id,false,true);return;}
   const nextPage=state.page+(direction<0?-1:1);if(nextPage<1||nextPage>state.totalPages)return;
   const request=++blLoadSequence,priorPage=state.page;
   page.querySelectorAll('[data-bl-prev],[data-bl-next]').forEach(b=>b.disabled=true);
   try{
    state.page=nextPage;await load();
    if(dead||dialog!==d||request!==blLoadSequence)return;
    if(state.error||!state.records.length)throw Error(state.error||'Adjacent records are no longer available. Close and review the current results.');
    await openBlRecord((direction<0?state.records.at(-1):state.records[0]).id,false,true);render();
   }catch(e){if(dialog!==d||request!==blLoadSequence)return;state.page=priorPage;const notice=page.querySelector('.mw-bl-record-notice');notice.textContent=e.message;notice.hidden=false;page.querySelector('[data-bl-prev]').disabled=!hasPrevious;page.querySelector('[data-bl-next]').disabled=!hasNext;}
  };
  page.querySelector('[data-bl-prev]').onclick=()=>navigate(-1);page.querySelector('[data-bl-next]').onclick=()=>navigate(1);
  d.querySelector('.mw-dialog-body').scrollTop=0;
  wireBlFieldActions(page,record,editing?'edit':'read');
  if(!editing){d.querySelector('#mw-dialog-title').focus({preventScroll:true});return;}
  const form=page.querySelector('#mw-bl-page-form');blDraft=form;recordsTools?.wireForm(form);
  const baseline=formValues(form),mark=()=>{form.dataset.dirty=String(formValues(form)!==baseline)};
  form.addEventListener('input',mark);form.addEventListener('change',mark);
  const code=form.elements.code;if(code)code.addEventListener('input',()=>{const caret=code.selectionStart;code.value=code.value.toUpperCase();code.setSelectionRange(caret,caret);mark()});
  const counted=form.elements[config.key==='regions'?'remarks':'description'];counted?.addEventListener('input',()=>{const key=config.key==='regions'?'remarks':'description',count=form.querySelector('[data-count-for="'+key+'"]');if(count)count.textContent=counted.value.length});
  const statusField=form.elements.status,reason=form.querySelector('#mw-bl-page-reason'),reasonWrap=reason.parentElement;
  const syncStatus=()=>{const changed=statusField.value!==record.status;reasonWrap.hidden=!changed;reason.required=changed;if(!changed){reason.value='';reason.setCustomValidity('');reason.dispatchEvent(new Event('input',{bubbles:true}));}mark()};
  statusField.addEventListener('change',syncStatus);syncStatus();
  form.addEventListener('invalid',e=>{const section=e.target.closest('details');if(section)section.open=true},true);
  form.onsubmit=async e=>{
   e.preventDefault();if(blBusy||!permitted('edit'))return;
   const error=form.querySelector('.mw-form-error');error.hidden=true;
   if(!form.checkValidity()){sections.forEach(x=>x.querySelector('details').open=true);error.textContent='Review the highlighted fields before saving.';error.hidden=false;form.reportValidity();return}
   const values=new FormData(form),payload=config.key==='regions'?{version:record.version,businessLineRef:String(values.get('businessLineRef')||'').trim(),name:String(values.get('name')||'').trim(),code:String(values.get('code')||'').trim(),regionalManager:String(values.get('regionalManager')||'').trim(),remarks:String(values.get('remarks')||'').trim(),timeZone:actionTimeZone()}:{version:record.version,name:String(values.get('name')||'').trim(),code:String(values.get('code')||'').trim(),description:String(values.get('description')||'').trim(),timeZone:actionTimeZone()};
   if(statusField.value!==record.status){const text=reason.value.trim();if(!text){error.textContent='Reason is mandatory for status changes.';error.hidden=false;reason.focus();return}payload.status=statusField.value;payload.reason=text;}
   blBusy=true;dialogSaving=true;
   const controls=[...d.querySelectorAll('input,select,textarea,button')].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);d.setAttribute('aria-busy','true');d.querySelector('#bl-save').textContent='Saving...';
   try{await api(config.endpoint+'/'+encodeURIComponent(record.id),'PUT',payload);
    if(dead||dialog!==d||blDetail!==page)return;
   }catch(e){
    if(dead||dialog!==d||blDetail!==page)return;
    blBusy=false;dialogSaving=false;d.removeAttribute('aria-busy');
    controls.forEach(([el,disabled])=>el.disabled=disabled);
    error.textContent=e.message;error.hidden=false;error.tabIndex=-1;error.focus();
    d.querySelector('#bl-save').textContent='Save';error.scrollIntoView({block:'nearest'});return;
   }
   // A successful write is complete: close only this popup, not the workspace.
   // Keep the tab/query/sort/page and column preferences; refresh failures must
   // never be presented as failed writes or reopen the completed form.
   blBusy=false;dialogSaving=false;blDraft=null;dialogDirty=null;
   closeDialog(true);recordsTools?.showLatest?.();announce(config.singular+' saved successfully.');
   await load();
   if(!dead&&!dialog&&(document.activeElement===document.body||!document.activeElement?.isConnected))restoreDialogFocus();
  };
  const first=form.querySelector('input:not([readonly]),select,textarea');if(first){first.closest('details').open=true;first.focus({preventScroll:true})}
 }

 function ownerRecord(record){
  if(dead||!permitted('reassignOwner')||record.archivedAt||record.deletedAt)return;
  const eligible=state.owners.filter(owner=>typeof owner.ownerId==='string'&&owner.ownerId.startsWith('UID-'));
  const options=eligible.map(owner=>'<option value="'+esc(owner.ownerId)+'" '+(owner.ownerId===record.ownerId?'selected':'')+'>'+esc(owner.name)+' ('+esc(owner.ownerId)+')</option>').join('');
  const d=openDialog('Reassign '+config.singular+' Owner','<p>Select an active SCRM User Master record. Created By will remain unchanged.</p><label class="mw-bl-reason">New Owner<select id="mw-new-owner" required>'+options+'</select></label><p class="mw-form-error" role="alert" hidden></p>','<button type="button" class="mw-btn" id="mw-archive-cancel">Cancel</button><button type="button" class="mw-btn mw-primary" id="mw-archive-confirm">Reassign</button>');
  if(!d)return;
  d.querySelector('#mw-archive-cancel').onclick=()=>closeDialog();
  d.querySelector('#mw-archive-confirm').onclick=async()=>{
   const ownerId=d.querySelector('#mw-new-owner').value,error=d.querySelector('.mw-form-error');
   if(!ownerId){error.textContent='Select an eligible owner.';error.hidden=false;return}
   dialogSaving=true;d.querySelector('#mw-archive-confirm').disabled=true;
   try{await api(config.endpoint+'/'+encodeURIComponent(record.id),'PUT',{version:record.version,ownerId,timeZone:actionTimeZone()});if(dead||dialog!==d)return;dialogSaving=false;closeDialog(true);recordsTools?.showLatest?.();announce(config.singular+' owner updated.');await load()}
   catch(e){if(dead||dialog!==d)return;dialogSaving=false;error.textContent=e.message;error.hidden=false;d.querySelector('#mw-archive-confirm').disabled=false}
  };
 }
 function statusRecord(record){
  if(dead||!permitted('edit')||record.archivedAt||record.deletedAt)return;
  const next=record.status==='Active'?'Inactive':'Active',title=(next==='Active'?'Reactivate ':'Deactivate ')+config.singular;
  const d=openDialog(title,'<p>Change <strong>'+esc(record.name)+'</strong> to '+esc(next)+'?</p><label class="mw-bl-reason">Reason <span class="mw-required">*</span><textarea id="mw-lifecycle-reason" maxlength="500" rows="3" required placeholder="Explain the change"></textarea></label><p class="mw-form-error" role="alert" hidden></p>','<button type="button" class="mw-btn" id="mw-archive-cancel">Cancel</button><button type="button" class="mw-btn mw-primary" id="mw-archive-confirm">Confirm</button>');
  if(!d)return;
  d.querySelector('#mw-archive-cancel').onclick=()=>closeDialog();
  d.querySelector('#mw-archive-confirm').onclick=async()=>{
   const reason=d.querySelector('#mw-lifecycle-reason').value.trim(),error=d.querySelector('.mw-form-error');
   if(!reason){error.textContent='A reason is required.';error.hidden=false;return}
   dialogSaving=true;d.querySelector('#mw-archive-confirm').disabled=true;
   try{await api(config.endpoint+'/'+encodeURIComponent(record.id),'PUT',{version:record.version,status:next,reason,timeZone:actionTimeZone()});if(dead||dialog!==d)return;dialogSaving=false;closeDialog(true);recordsTools?.showLatest?.();announce(config.singular+' '+(next==='Active'?'reactivated.':'deactivated.'));await load()}
   catch(e){if(dead||dialog!==d)return;dialogSaving=false;error.textContent=e.message;error.hidden=false;d.querySelector('#mw-archive-confirm').disabled=false}
  };
 }
 function businessLifecycle(record,action,targetStatus=''){
  const operations={
   archive:{permission:'archive',name:'Archive',label:'archived',danger:true},
   restore:{permission:'restore',name:'Return Archived Record',label:'returned',danger:false},
   'soft-delete':{permission:'softDelete',name:'Soft Delete',label:'deleted',danger:true},
   'restore-deleted':{permission:'restoreDeleted',name:'Recover Deleted Record',label:'recovered',danger:false}
  };
  const op=operations[action];if(!op||!permitted(op.permission))return;
  if(action==='soft-delete'&&!record.archivedAt){announce('This record must be Archived before it can be deleted.');return}
  const strict=['countries','regions'].includes(config.key);const destination=action==='restore'?(strict?'':'<label class="mw-bl-reason">Return record to <span class="mw-required">*</span><select id="mw-lifecycle-target" required><option value="Active" '+(targetStatus==='Active'?'selected':'')+'>Active</option><option value="Inactive" '+(targetStatus==='Inactive'?'selected':'')+'>Inactive</option></select></label>'):action==='restore-deleted'?(strict?'':'<label class="mw-bl-reason">Recover record to <span class="mw-required">*</span><select id="mw-lifecycle-target" required><option value="Archived">Archived</option><option value="Inactive">Inactive</option><option value="Active">Active</option></select></label>'):'';
  const prompt=action==='restore'?(strict?'Return this Archived '+esc(config.singular)+' to Inactive?':'Choose whether this Archived record should return to Active or Inactive.'):action==='restore-deleted'?(strict?'Recover this Deleted '+esc(config.singular)+' to Archived?':'Choose the state this Deleted record should return to.'):op.name+' <strong>'+esc(record.name)+'</strong>?';
  const d=openDialog(op.name+' — '+config.singular,'<p>'+prompt+'</p>'+destination+'<label class="mw-bl-reason">Reason <span class="mw-required">*</span><textarea id="mw-lifecycle-reason" maxlength="500" rows="3" required placeholder="Explain the action"></textarea></label><p class="mw-form-error" role="alert" hidden></p>','<button type="button" class="mw-btn" id="mw-archive-cancel">Cancel</button><button type="button" class="mw-btn '+(op.danger?'mw-danger':'mw-primary')+'" id="mw-archive-confirm">'+esc(action==='restore'?'Apply State':action==='restore-deleted'?'Recover Record':op.name)+'</button>');
  if(!d)return;
  d.querySelector('#mw-archive-cancel').onclick=()=>closeDialog();
  d.querySelector('#mw-archive-confirm').onclick=async()=>{
   const reason=d.querySelector('#mw-lifecycle-reason').value.trim(),error=d.querySelector('.mw-form-error'),selectedTarget=d.querySelector('#mw-lifecycle-target')?.value||targetStatus;
   if(!reason){error.textContent='A reason is required.';error.hidden=false;return}
   if(!strict&&action==='restore'&&!['Active','Inactive'].includes(selectedTarget)){error.textContent='Choose Active or Inactive.';error.hidden=false;return}
   if(!strict&&action==='restore-deleted'&&!['Archived','Inactive','Active'].includes(selectedTarget)){error.textContent='Choose Archived, Inactive or Active.';error.hidden=false;return}
   dialogSaving=true;d.querySelector('#mw-archive-confirm').disabled=true;
   const body={version:record.version,reason,timeZone:actionTimeZone()};if(!strict&&(action==='restore'||action==='restore-deleted'))body.targetStatus=selectedTarget;
   try{await api(config.endpoint+'/'+encodeURIComponent(record.id)+'/'+action,'POST',body);if(dead||dialog!==d)return;dialogSaving=false;closeDialog(true);recordsTools?.showLatest?.();announce(action==='restore'?(strict?config.singular+' returned to Inactive.':config.singular+' moved to '+selectedTarget+'.'):action==='restore-deleted'?(strict?config.singular+' recovered to Archived.':config.singular+' recovered to '+selectedTarget+'.'):config.singular+' '+op.label+'.');await load()}
   catch(e){if(dead||dialog!==d)return;dialogSaving=false;error.textContent=e.message;error.hidden=false;d.querySelector('#mw-archive-confirm').disabled=false}
  };
 }
 function archiveRecord(record,action,targetStatus=''){if(config.recordsFramework){businessLifecycle(record,action,targetStatus);return}if(dead||!permitted(action))return;const restore=action==='restore';const d=openDialog((restore?'Restore ':'Archive ')+config.singular,'<p>'+(restore?'Restore':'Archive')+' <strong>'+esc(record.name)+'</strong>?</p><p class="mw-muted">'+(restore?'It will return to the current records list. Its prior Active or Inactive status is preserved.':'It will be kept with its history and can be restored later. It will be excluded from current records.')+'</p><p class="mw-form-error" role="alert" hidden></p>','<button type="button" class="mw-btn" id="mw-archive-cancel">Cancel</button><button type="button" class="mw-btn '+(restore?'mw-primary':'mw-danger')+'" id="mw-archive-confirm">'+(restore?'Restore':'Archive')+'</button>');if(!d)return;
 d.querySelector('#mw-archive-cancel').onclick=()=>closeDialog();d.querySelector('#mw-archive-confirm').onclick=async()=>{if(!permitted(action))return;dialogSaving=true;d.querySelector('#mw-archive-confirm').disabled=true;try{await api(config.endpoint+'/'+encodeURIComponent(record.id)+'/'+action,'POST',{version:record.version});if(dead||dialog!==d)return;dialogSaving=false;closeDialog(true);announce(config.singular+' '+(restore?'restored.':'archived.'));load()}catch(e){if(dead||dialog!==d)return;dialogSaving=false;const err=d.querySelector('.mw-form-error');err.textContent=e.message;err.hidden=false;d.querySelector('#mw-archive-confirm').disabled=false}}
 }
 function columnsDialog(){if(dead||!permitted('settings'))return;
 const keys=allColumns.map(c=>c.key),required=allColumns.filter(c=>c.locked).map(c=>c.key);
 let order=[...prefs.columns,...keys.filter(k=>!prefs.columns.includes(k))],enabled=new Set(prefs.columns),view='my',term='';
 const d=openDialog('Column Selection','<p class="mw-muted">Choose a view or customize your own. Required identity columns cannot be hidden.</p><div class="mw-column-presets" role="group" aria-label="Select table view"><button type="button" id="mw-view-default" class="mw-btn">Default View</button><button type="button" id="mw-view-my" class="mw-btn">My View</button><button type="button" id="mw-view-all" class="mw-btn">All Columns</button></div><label class="mw-field">Search columns<input type="search" id="mw-column-search" placeholder="Find a column..."></label><div class="mw-column-quick"><button type="button" id="mw-column-select-all" class="mw-btn">Select all permitted</button><button type="button" id="mw-column-clear" class="mw-btn">Clear optional</button></div><div id="mw-column-options"></div><label class="mw-checkbox-label"><input id="mw-freeze" type="checkbox" '+(prefs.freeze?'checked':'')+'> Freeze identity columns on wider screens</label>','<button class="mw-btn" type="button" id="mw-columns-reset">Reset default</button><button class="mw-btn mw-primary" type="button" id="mw-columns-save">Save My View</button>',true);if(!d)return;
 const group=c=>config.key==='business-lines'?(['name','displayId','code','status','description'].includes(c.key)?'Basic Information':['owner','ownerId'].includes(c.key)?'Ownership Details':['createdBy','createdAt','createdById','updatedBy','updatedAt','updatedById'].includes(c.key)?'Record Information':'Lifecycle Information'):config.key==='regions'?(['name','displayId','code','status','businessLine','regionalManager','remarks'].includes(c.key)?'Region Information':['owner','ownerId'].includes(c.key)?'Ownership Details':['businessLineId','createdBy','createdAt','createdById','updatedBy','updatedAt','updatedById'].includes(c.key)?'Record Information':'Lifecycle Information'):(c.system?'Record Information':'Basic Information');
 const groups=[...new Set(allColumns.map(group))];
 function draw(){
  const matched=order.filter(k=>allColumns.some(c=>c.key===k&&(c.label.toLowerCase().includes(term)||k.toLowerCase().includes(term))));
  d.querySelectorAll('.mw-column-presets button').forEach(b=>b.classList.toggle('mw-primary',b.id==='mw-view-'+(view==='default'?'default':view==='all'?'all':'my')));
  d.querySelector('#mw-column-options').innerHTML=groups.map(g=>{
   const items=matched.filter(k=>group(allColumns.find(c=>c.key===k))===g);
   if(!items.length)return '';
   return '<section class="mw-column-group"><h3>'+esc(g)+'</h3>'+items.map(k=>{
    const i=order.indexOf(k),c=allColumns.find(c=>c.key===k);
    return '<div class="mw-column-option" draggable="'+(!c.locked)+'" data-column-row="'+esc(k)+'"><label><input type="checkbox" data-column-check="'+esc(k)+'" '+(enabled.has(k)?'checked':'')+' '+(c.locked?'disabled':'')+'>'+esc(c.label)+(c.locked?' <small>Required</small>':'')+'</label><div><button type="button" data-column-move="'+esc(k)+'" data-step="-1" aria-label="Move '+esc(c.label)+' up" '+(c.locked||i<=0?'disabled':'')+'>↑</button><button type="button" data-column-move="'+esc(k)+'" data-step="1" aria-label="Move '+esc(c.label)+' down" '+(c.locked||i===order.length-1?'disabled':'')+'>↓</button></div></div>';
   }).join('')+'</section>';
  }).join('');
 }
 const changeView=next=>{view=next;enabled=new Set([...required,...(next==='all'?keys:next==='default'?defaults:prefs.columns)]);draw()};
 d.querySelector('#mw-view-default').onclick=()=>changeView('default');
 d.querySelector('#mw-view-my').onclick=()=>changeView('my');
 d.querySelector('#mw-view-all').onclick=()=>changeView('all');
 d.querySelector('#mw-column-search').oninput=e=>{term=e.target.value.toLowerCase().trim();draw()};
 d.querySelector('#mw-column-select-all').onclick=()=>{view='my';enabled=new Set(keys);draw()};
 d.querySelector('#mw-column-clear').onclick=()=>{view='my';enabled=new Set(required);draw()};
 d.querySelector('#mw-column-options').onchange=e=>{const k=e.target.dataset.columnCheck;if(k){view='my';e.target.checked?enabled.add(k):enabled.delete(k);draw()}};
 d.querySelector('#mw-column-options').onclick=e=>{const b=e.target.closest('[data-column-move]');if(!b)return;const i=order.indexOf(b.dataset.columnMove),j=i+Number(b.dataset.step);if(i<0||j<0||j>=order.length||allColumns.find(c=>c.key===order[i])?.locked)return;[order[i],order[j]]=[order[j],order[i]];view='my';draw()};
 let dragged='';
 d.querySelector('#mw-column-options').addEventListener('dragstart',e=>{dragged=e.target.closest('[data-column-row]')?.dataset.columnRow||''});
 d.querySelector('#mw-column-options').addEventListener('dragover',e=>{if(e.target.closest('[data-column-row]'))e.preventDefault()});
 d.querySelector('#mw-column-options').addEventListener('drop',e=>{e.preventDefault();const destination=e.target.closest('[data-column-row]')?.dataset.columnRow;if(!dragged||!destination||dragged===destination)return;const i=order.indexOf(dragged),j=order.indexOf(destination);if(i<0||j<0)return;order.splice(i,1);order.splice(j,0,dragged);view='my';draw()});
 d.querySelector('#mw-columns-reset').onclick=()=>{order=[...defaults,...keys.filter(k=>!defaults.includes(k))];changeView('default');d.querySelector('#mw-freeze').checked=true};
 d.querySelector('#mw-columns-save').onclick=()=>{prefs.columns=order.filter(k=>enabled.has(k));prefs.freeze=d.querySelector('#mw-freeze').checked;savePrefs();closeDialog(true);render();announce('My View saved.')};
 draw();
 }
 function filterDialog(){if(dead||!permitted('filter'))return;
 let filters=state.filters.map(f=>({...f}));
 const fields=allColumns.filter(c=>c.filter!==false);
 const d=openDialog('Filter records','<p class="mw-muted">All conditions must match. Search and status filters also apply.</p><div id="mw-filter-options"></div><button class="mw-btn" type="button" id="mw-filter-add">+ Add condition</button><p class="mw-form-error" role="alert" hidden></p>','<button type="button" class="mw-btn" id="mw-filters-clear">Clear filters</button><button type="button" class="mw-btn mw-primary" id="mw-filters-apply">Apply filters</button>',true);if(!d)return;
 const operators=field=>allColumns.find(c=>c.key===field)?.type==='date'?[['before','Before'],['after','After'],['isEmpty','Is empty'],['isNotEmpty','Is not empty']]:[['contains','Contains'],['equals','Equals'],['startsWith','Starts with'],['isEmpty','Is empty'],['isNotEmpty','Is not empty']];
 function draw(){d.querySelector('#mw-filter-options').innerHTML=filters.length?filters.map((f,i)=>'<div class="mw-filter-row"><select data-filter-field="'+i+'" aria-label="Filter '+(i+1)+' field">'+fields.map(c=>'<option value="'+c.key+'" '+(c.key===f.field?'selected':'')+'>'+esc(c.label)+'</option>').join('')+'</select><select data-filter-operator="'+i+'" aria-label="Filter '+(i+1)+' operator">'+operators(f.field).map(([key,label])=>'<option value="'+key+'" '+(key===f.operator?'selected':'')+'>'+label+'</option>').join('')+'</select><input data-filter-value="'+i+'" aria-label="Filter '+(i+1)+' value" type="'+(allColumns.find(c=>c.key===f.field)?.type==='date'?'date':'text')+'" value="'+esc(f.value)+'" '+(['isEmpty','isNotEmpty'].includes(f.operator)?'disabled':'')+'><button type="button" data-filter-remove="'+i+'" aria-label="Remove filter '+(i+1)+'">×</button></div>').join(''):'<p class="mw-muted">No additional conditions.</p>';d.querySelector('#mw-filter-add').disabled=filters.length>=10}
 draw();d.querySelector('#mw-filter-add').onclick=()=>{if(filters.length<10){filters.push({field:'name',operator:'contains',value:''});draw()}};
 d.querySelector('#mw-filter-options').onchange=e=>{if(e.target.hasAttribute('data-filter-field')){const f=filters[Number(e.target.dataset.filterField)];f.field=e.target.value;f.operator=operators(f.field)[0][0];f.value='';draw()}if(e.target.hasAttribute('data-filter-operator')){filters[Number(e.target.dataset.filterOperator)].operator=e.target.value;draw()}};
 d.querySelector('#mw-filter-options').oninput=e=>{if(e.target.hasAttribute('data-filter-value'))filters[Number(e.target.dataset.filterValue)].value=e.target.value};
 d.querySelector('#mw-filter-options').onclick=e=>{const b=e.target.closest('[data-filter-remove]');if(b){filters.splice(Number(b.dataset.filterRemove),1);draw()}};
 d.querySelector('#mw-filters-clear').onclick=()=>{filters=[];draw()};
 d.querySelector('#mw-filters-apply').onclick=()=>{const invalid=filters.some(f=>!['isEmpty','isNotEmpty'].includes(f.operator)&&!String(f.value).trim());if(invalid){const err=d.querySelector('.mw-form-error');err.textContent='Enter a value for each condition.';err.hidden=false;return}state.filters=filters.map(f=>({...f,value:String(f.value).trim()}));state.page=1;closeDialog(true);load()};
 }
 function exportDialog(selected='default'){if(dead||!permitted('export'))return;
 if(selected==='selected'&&state.selected.size>state.limits.selectedExport)selected='default';
 const options=[['page','Current page','Only the records displayed on the current results page, using standard columns.'],['selected','Selected records',state.selected.size+' selected across pages. All exportable columns. Limit '+state.limits.selectedExport+' records; use Default View or My View for larger exports.'],['default','Default view','All matching records with the standard column set.'],['my','My View','All matching records with your visible columns and order.'],['all','All records','Every authorized record, including archived records. Search and filters do not apply.']];
 const d=openDialog('Export '+config.title,'<p class="mw-muted">Download a CSV file. Current Page respects pagination; other modes export their full authorized scope.</p><form id="mw-export-form" class="mw-export-options">'+options.map(([mode,label,desc])=>'<label><input type="radio" name="mode" value="'+mode+'" '+(mode===selected?'checked':'')+' '+(mode==='selected'&&(!state.selected.size||state.selected.size>state.limits.selectedExport)?'disabled':'')+'><span><strong>'+label+'</strong><small>'+esc(desc)+'</small></span></label>').join('')+'</form><p class="mw-form-error" role="alert" hidden></p>','<button class="mw-btn" type="button" id="mw-export-cancel">Cancel</button><button class="mw-btn mw-primary" type="submit" form="mw-export-form" id="mw-export-download">Download CSV</button>');if(!d)return;d.querySelector('#mw-export-cancel').onclick=()=>closeDialog();d.querySelector('form').onsubmit=async e=>{e.preventDefault();if(dialogSaving||!permitted('export'))return;const mode=new FormData(e.target).get('mode');dialogSaving=true;d.querySelector('#mw-export-download').disabled=true;d.querySelector('#mw-export-download').textContent='Preparing…';try{const result=await api(config.endpoint+'/export','POST',{mode,ids:mode==='selected'?[...state.selected]:[],...(mode==='my'?{columns:prefs.columns}:{}),query:{...query(),page:state.page,pageSize:state.pageSize}});if(dead||dialog!==d)return;if(typeof result.csv!=='string')throw Error('The export could not be prepared.');const url=URL.createObjectURL(new Blob([result.csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=result.filename||config.key+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);dialogSaving=false;closeDialog(true);announce('Export ready: '+Number(result.count||0).toLocaleString()+' records.')}catch(e){dialogSaving=false;const err=d.querySelector('.mw-form-error');err.textContent=e.message;err.hidden=false;d.querySelector('#mw-export-download').disabled=false;d.querySelector('#mw-export-download').textContent='Download CSV'}}
 }
 if(config.recordsFramework&&window.SCRMRecords)recordsTools=window.SCRMRecords.attach({api,state,prefs,columns:allColumns,host,find,render,reload:load,announce,openDialog,closeDialog,permitted,user,widths:columnWidths,header:()=>moduleHeader,config});
 shell();load();
 return {
  canLeave(){return dead||closeDialog()},
  destroy(force=false){if(dead)return true;if(!closeDialog(force))return false;window.removeEventListener('beforeunload',beforeDialogUnload);recordsTools?.destroy();dead=true;++sequence;clearTimeout(timer);closeDialog(true);host.removeEventListener('click',click);host.removeEventListener('change',change);moduleHeader?.removeEventListener('click',click);headerRestore?.();return true},
  reload:load,
  setSearch(q){if(dead||!permitted('search'))return false;state.q=String(q??'').trim().slice(0,100);state.view='home';state.page=1;const field=find('#mw-search');if(field)field.value=state.q;renderViews();clearTimeout(timer);timer=setTimeout(()=>{rememberSearch(state.q);load()},300);return true},
  openResult(id,label){if(dead||!permitted('read'))return false;state.view='home';renderViews();readRecord(id);return true},
  focusSearch(){if(dead||!permitted('search'))return false;return window.SCRMWorkspace?.focusSearch?.()||false}
 };
}
window.SCRMModuleWorkspace={create};
})();
