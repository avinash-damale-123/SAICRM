(() => {
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=(name)=>{const paths={search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',plus:'<path d="M12 5v14M5 12h14"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2"/>',filter:'<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',columns:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 4v16M16 4v16"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',settings:'<path d="M4 7h5m5 0h6M4 17h10m5 0h1"/><circle cx="11" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',chevron:'<path d="m8 10 4 4 4-4"/>',briefcase:'<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V3h8v4M3 13h18m-9-2v4"/>'};return '<svg viewBox="0 0 24 24" aria-hidden="true">'+(paths[name]||paths.briefcase)+'</svg>'};
const date=v=>v?new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'—';
function create(host,config) {
 const user=window.SCRM.user||{},api=config.api;
 const storageKey='scrm:view:'+user.id+':'+config.key,recentKey='scrm:recent:'+user.id+':'+config.key;
 const allColumns=config.columns.map(c=>({...c})),defaults=allColumns.filter(c=>c.default!==false).map(c=>c.key);
 let prefs={columns:defaults,freeze:true,pageSize:25};
 try{const p=JSON.parse(localStorage.getItem(storageKey));if(p&&Array.isArray(p.columns)){prefs.columns=[...new Set([...allColumns.filter(c=>c.locked).map(c=>c.key),...p.columns.filter(k=>allColumns.some(c=>c.key===k&&!c.locked))])];prefs.freeze=p.freeze!==false;if([25,50,75,100].includes(p.pageSize))prefs.pageSize=p.pageSize}}catch{}
 const state={q:'',status:'all',archived:'exclude',filters:[],sort:'updatedAt',direction:'desc',page:1,pageSize:prefs.pageSize,records:[],total:0,totalPages:1,counts:null,owners:[],limits:{selectedExport:250},selected:new Set(),loading:true,error:'',message:'',view:'home',filtersOpen:false,permissions:{},permissionsKnown:false};
 let dead=false,sequence=0,timer=null,dialog=null,dialogDirty=null,dialogSaving=false,previousFocus=null,moduleHeader=null,headerRestore=null,blDetail=null,blDraft=null,blBusy=false,blRecord=null,blRecordMode='read';
 const find=selector=>host.querySelector(selector)||moduleHeader?.querySelector(selector);
 const permitted=action=>state.permissions[action]===true;
 const visibleColumns=()=>prefs.columns.map(k=>allColumns.find(c=>c.key===k)).filter(Boolean);
 const savePrefs=()=>{try{localStorage.setItem(storageKey,JSON.stringify(prefs))}catch{}};
 const query=()=>({q:state.q,status:state.status,archived:state.archived,filters:state.filters,sort:state.sort,direction:state.direction});
 const params=()=>{const p=new URLSearchParams({...query(),page:String(state.page),pageSize:String(state.pageSize)});p.set('filters',JSON.stringify(state.filters));return p.toString()};
 const recents=()=>{try{const v=JSON.parse(sessionStorage.getItem(recentKey));return Array.isArray(v)?v.filter(s=>typeof s==='string').slice(0,5):[]}catch{return[]}};
 function rememberSearch(value){if(!value)return;try{sessionStorage.setItem(recentKey,JSON.stringify([value,...recents().filter(s=>s!==value)].slice(0,5)))}catch{}}
 const button=(label,action,extra='',ico='')=>'<button type="button" class="mw-btn '+extra+'" data-mw="'+action+'" aria-label="'+esc(label)+'">'+(ico?icon(ico):'')+'<span>'+esc(label)+'</span></button>';
 function announce(message){if(dead)return;state.message=message;const el=find('.mw-feedback');if(el){el.textContent=message;el.hidden=!message}}
 function mountHeader(){
 const topbar=document.querySelector('.topbar');
 moduleHeader=document.createElement('div');moduleHeader.className='mw-module-header';
 moduleHeader.innerHTML='<div class="mw-header-primary"><nav class="mw-module-tabs" aria-label="'+esc(config.title)+' views"><button type="button" class="mw-module-tab" data-mw="dashboard" aria-label="'+esc(config.title)+' Dashboard"><span>'+esc(config.title)+'</span> Dashboard</button><button type="button" class="mw-module-tab" data-mw="home" aria-label="'+esc(config.title)+' Home" aria-current="page"><span>'+esc(config.title)+'</span> Home</button></nav><div class="mw-header-account"><div class="mw-common-tools"></div><details class="mw-account-menu"><summary aria-label="User menu for '+esc(user.name||user.email)+'"><span class="mw-avatar-slot"></span><span class="mw-profile-name">'+esc(user.name||user.email)+'</span>'+icon('chevron')+'</summary><div class="mw-account-dropdown"><strong>'+esc(user.name||'')+'</strong><small>'+esc(user.email||'')+'</small><div class="mw-logout-slot"></div></div></details>'+button('Add '+config.singular,'create','mw-primary mw-add-record','plus')+'</div></div><div class="mw-header-toolbar"><div class="mw-search"><label class="mw-sr-only" for="mw-search">Search '+esc(config.title)+'</label>'+icon('search')+'<input id="mw-search" type="search" placeholder="Search '+esc(config.title.toLowerCase())+'…" autocomplete="off" list="mw-recent-searches" disabled><datalist id="mw-recent-searches"></datalist></div><div class="mw-header-actions">'+(config.import&&typeof config.onImport==='function'?button('Import','import','','download'):'')+button('Export','export','','download')+'<button type="button" class="mw-btn" data-mw="filter-toggle" aria-label="Filter" aria-controls="mw-filter-controls" aria-expanded="false">'+icon('filter')+'<span>Filter</span><span class="mw-filter-count" hidden></span></button><details class="mw-settings-menu"><summary class="mw-btn" aria-label="Module settings">'+icon('settings')+'<span>Settings</span>'+icon('chevron')+'</summary><div>'+button('Columns','columns','mw-menu-item','columns')+button('Refresh','refresh','mw-menu-item','refresh')+'</div></details></div></div>';
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
 host.innerHTML='<section class="mw-workspace" aria-label="'+esc(config.title)+'"><h1 class="mw-sr-only">'+esc(config.title)+'</h1><section class="mw-dashboard" aria-label="'+esc(config.title)+' Dashboard" hidden></section><div class="mw-home" aria-label="'+esc(config.title)+' Home"><div class="mw-panel"><section id="mw-filter-controls" class="mw-filter-controls" aria-label="Filter '+esc(config.title)+'" hidden><label>Status<select id="mw-status"><option value="all">All statuses</option><option value="Active">Active</option><option value="Inactive">Inactive</option></select></label><label>Record state<select id="mw-archived"><option value="exclude">Current records</option><option value="only">Archived records</option><option value="all">Current & archived</option>'+(config.key==='business-lines'?'<option value="deleted">Deleted records</option>':'')+'</select></label>'+button('Advanced filters','filters','','filter')+'</section><div class="mw-query-summary" hidden></div><div class="mw-selection" hidden></div><p class="mw-feedback" role="status" hidden></p><div class="mw-results" aria-live="polite"></div><footer class="mw-footer"></footer></div></div></section>';
 mountHeader();
 find('#mw-status').value=state.status;find('#mw-archived').value=state.archived;
 find('#mw-status').onchange=e=>{if(!permitted('filter'))return;state.status=e.target.value;state.page=1;load()};
 find('#mw-archived').onchange=e=>{if(!permitted('filter'))return;state.archived=e.target.value;state.page=1;load()};
 host.addEventListener('click',click);host.addEventListener('change',change);
 render();
 }
 function renderViews(){
 if(dead)return;
 if(state.view==='dashboard'&&!permitted('dashboard'))state.view='home';
 find('.mw-home').hidden=state.view!=='home';find('.mw-dashboard').hidden=state.view!=='dashboard';
 moduleHeader?.querySelectorAll('.mw-module-tab').forEach(tab=>{const active=tab.dataset.mw===state.view;tab.classList.toggle('mw-active-tab',active);if(active)tab.setAttribute('aria-current','page');else tab.removeAttribute('aria-current');tab.hidden=tab.dataset.mw==='dashboard'&&!permitted('dashboard')});
 if(config.key==='business-lines'&&moduleHeader){const single=state.permissionsKnown&&!permitted('dashboard');moduleHeader.classList.toggle('scrm-no-tabs',single);const tabs=moduleHeader.querySelector('.mw-module-tabs');if(tabs)tabs.hidden=single;}
 const controlPermission={create:'create',export:'export',import:'import','filter-toggle':'filter',columns:'settings',refresh:'read'};
 moduleHeader?.querySelectorAll('[data-mw]').forEach(control=>{const permission=controlPermission[control.dataset.mw];if(permission){control.hidden=!permitted(permission)||(control.dataset.mw==='import'&&(!config.import||typeof config.onImport!=='function'));control.disabled=state.loading&&control.dataset.mw==='export'}});
 const search=find('#mw-search');if(search){search.disabled=!permitted('search');search.closest('.mw-search').hidden=!permitted('search')}
 const settings=moduleHeader?.querySelector('.mw-settings-menu');if(settings)settings.hidden=!permitted('settings');
 const open=state.filtersOpen&&state.view==='home'&&permitted('filter');find('#mw-filter-controls').hidden=!open;
 const toggle=moduleHeader?.querySelector('[data-mw="filter-toggle"]');if(toggle)toggle.setAttribute('aria-expanded',String(open));
 const count=state.filters.length+(state.status!=='all'?1:0)+(state.archived!=='exclude'?1:0),badge=moduleHeader?.querySelector('.mw-filter-count');if(badge){badge.hidden=!count;badge.textContent=count}
 }
 function stats(){
 const target=find('.mw-dashboard');if(!target)return;if(!permitted('dashboard')){target.innerHTML='';return}
 if(state.loading&&!state.counts){target.innerHTML='<div class="mw-state"><span class="mw-spinner"></span><strong>Loading '+esc(config.title.toLowerCase())+' dashboard…</strong></div>';return}
 if(state.error){target.innerHTML='<div class="mw-state mw-error" role="alert"><strong>Dashboard unavailable</strong><p>'+esc(state.error)+'</p>'+button('Try again','refresh')+'</div>';return}
 const c=state.counts;if(!c){target.innerHTML='<div class="mw-state"><strong>No dashboard data available</strong></div>';return}
 const total=Number(c.total)||0,items=[['Active',Number(c.active)||0,'active'],['Inactive',Number(c.inactive)||0,'inactive'],['Archived',Number(c.archived)||0,'archived']];
 const active=Number(c.active)||0,inactive=Number(c.inactive)||0,archived=Number(c.archived)||0;
 const pct=value=>total?Math.round(value/total*100):0;
 const donut=total?'conic-gradient(#0b9965 0 '+(active/total*100)+'%,#f59a29 '+(active/total*100)+'% '+((active+inactive)/total*100)+'%,#90a2bb '+((active+inactive)/total*100)+'% 100%)':'conic-gradient(#e6ecf3 0 100%)';
 target.innerHTML='<div class="mw-dashboard-metrics">'+[['Total Business Lines',total,'total'],['Active',active,'active'],['Inactive',inactive,'inactive'],['Archived',archived,'archived']].map(([label,value,key])=>'<article class="mw-dashboard-metric mw-dashboard-metric-'+key+'"><span>'+label+'</span><strong>'+value.toLocaleString()+'</strong><span class="mw-metric-glyph" aria-hidden="true">'+({total:'▣',active:'↗',inactive:'◷',archived:'▤'})[key]+'</span></article>').join('')+'</div><div class="mw-dashboard-visuals"><section class="mw-visual-card"><h3>Status Distribution</h3><div class="mw-donut-layout"><div class="mw-donut" role="img" aria-label="'+esc(items.map(([label,value])=>label+': '+value).join(', '))+'" style="background:'+donut+'"><div class="mw-donut-center"><strong>'+total.toLocaleString()+'</strong><span>Total</span></div></div><div class="mw-donut-legend">'+items.map(([label,value,key])=>'<div><span class="mw-legend-dot mw-legend-'+key+'"></span><span>'+label+'</span><strong>'+value+' ('+pct(value)+'%)</strong></div>').join('')+'</div></div></section><section class="mw-visual-card"><h3>Business Line Status</h3><p class="mw-visual-subtitle">Live counts from your CRM database</p><div class="mw-status-chart">'+items.map(([label,value,key])=>'<div class="mw-chart-row"><span>'+label+'</span><div class="mw-chart-track"><div class="mw-chart-bar mw-chart-'+key+'" style="width:'+pct(value)+'%"></div></div><strong>'+value.toLocaleString()+'</strong></div>').join('')+'</div></section><section class="mw-visual-card mw-visual-summary"><h3>At a Glance</h3><p class="mw-visual-subtitle">Business-line coverage overview</p><div class="mw-summary-feature"><strong>'+pct(active)+'%</strong><span>of business lines are active</span></div><div class="mw-summary-divider"></div><div class="mw-summary-detail"><span>Current records</span><strong>'+(active+inactive)+'</strong></div><div class="mw-summary-detail"><span>Archived records</span><strong>'+archived+'</strong></div><p class="mw-summary-footnote">Creation trends and recent activity will appear once reporting endpoints are available.</p></section></div>';
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
 results.innerHTML='<div class="mw-table-wrap" tabindex="0" role="region" aria-label="'+esc(config.title)+' table; scroll for more columns"><table class="mw-table '+(prefs.freeze?'mw-freeze':'')+'"><thead><tr><th class="mw-check-col"><input type="checkbox" id="mw-select-page" aria-label="Select current page" '+(all?'checked':'')+'></th>'+cols.map((c,i)=>'<th scope="col" class="'+(c.locked?'mw-locked mw-locked-'+i:'')+'" aria-sort="'+(state.sort===c.key?(state.direction==='asc'?'ascending':'descending'):'none')+'"><button type="button" data-mw="sort" data-column="'+esc(c.key)+'">'+esc(c.label)+'<span aria-hidden="true">'+(state.sort===c.key?(state.direction==='asc'?'↑':'↓'):'↕')+'</span></button></th>').join('')+'<th scope="col" class="mw-action-col">Actions</th></tr></thead><tbody>'+state.records.map(r=>'<tr class="'+(r.archivedAt?'mw-archived-row':'')+'"><td class="mw-check-col"><input type="checkbox" data-select="'+esc(r.id)+'" aria-label="Select '+esc(r.name)+'" '+(state.selected.has(r.id)?'checked':'')+'></td>'+cols.map((c,i)=>'<td class="'+(c.locked?'mw-locked mw-locked-'+i:'')+'">'+cell(r,c)+'</td>').join('')+'<td class="mw-action-col"><details class="mw-row-menu"><summary aria-label="Actions for '+esc(r.name)+'">•••</summary><div>'+(permitted('read')?button('View','read','mw-menu-item'):'')+(permitted('edit')&&!r.archivedAt&&!r.deletedAt?button('Edit','edit','mw-menu-item'):'')+(config.key==='business-lines'?(r.deletedAt?(permitted('restoreDeleted')?button('Restore Deleted','restore-deleted','mw-menu-item'):''):(r.archivedAt?(permitted('restore')?button('Unarchive','restore','mw-menu-item'):''):(permitted('archive')?button('Archive','archive','mw-menu-item'):'')+(permitted('edit')?button(r.status==='Active'?'Deactivate':'Reactivate','status-change','mw-menu-item'):'')+(permitted('reassignOwner')?button('Reassign Owner','reassign-owner','mw-menu-item'):'') )+(permitted('softDelete')?button('Soft Delete','soft-delete','mw-menu-item'):'')):(r.archivedAt?(permitted('restore')?button('Restore','restore','mw-menu-item'):''):(permitted('archive')?button('Archive','archive','mw-menu-item'):'')))+'</div></details><span hidden data-record-id="'+esc(r.id)+'"></span></td></tr>').join('')+'</tbody></table></div>';
 host.querySelectorAll('.mw-row-menu').forEach(menu=>menu.addEventListener('toggle',()=>{if(!menu.open)return;host.querySelectorAll('.mw-row-menu').forEach(other=>{if(other!==menu)other.open=false});const box=menu.getBoundingClientRect(),panel=menu.querySelector('div');panel.style.position='fixed';panel.style.left=Math.max(8,Math.min(box.right-130,innerWidth-138))+'px';panel.style.right='auto';panel.style.top=Math.min(box.bottom+3,innerHeight-panel.offsetHeight-12)+'px'}));find('.mw-table-wrap').addEventListener('scroll',()=>host.querySelectorAll('.mw-row-menu').forEach(menu=>menu.open=false));
 const pageCheckbox=find('#mw-select-page');if(pageCheckbox)pageCheckbox.indeterminate=!all&&state.records.some(r=>state.selected.has(r.id));
 }
 renderFooter();
 }
 function cell(r,c){const v=r[c.key];if(c.key==='name')return '<button class="mw-record-link" type="button" data-mw="read" data-record="'+esc(r.id)+'">'+esc(v)+'</button>'+(r.deletedAt?'<span class="mw-archive-label">Deleted</span>':r.archivedAt?'<span class="mw-archive-label">Archived</span>':'');if(c.key==='status')return '<span class="mw-status '+(v==='Active'?'mw-active':'mw-inactive')+'">'+esc(v)+'</span>';if(c.type==='date')return '<span title="'+esc(v||'')+'">'+esc(date(v))+'</span>';return '<span class="'+(c.type==='id'?'mw-id':'')+'" title="'+esc(v||'')+'">'+esc(v||'—')+'</span>'}
 function renderFooter(){const max=Math.max(1,state.totalPages),p=state.page,start=state.total?(p-1)*state.pageSize+1:0,end=Math.min(p*state.pageSize,state.total);const pages=new Set([1,max,p-1,p,p+1]);let last=0,links='';[...pages].filter(v=>v>=1&&v<=max).sort((a,b)=>a-b).forEach(v=>{if(last&&v-last>1)links+='<span class="mw-ellipsis" aria-hidden="true">…</span>';links+='<button type="button" data-mw="page" data-page="'+v+'" '+(v===p?'aria-current="page"':'')+'>'+v+'</button>';last=v});
 find('.mw-footer').innerHTML='<div class="mw-range" role="status">'+(state.loading?'Loading records…':state.error?'Records unavailable':'Showing '+start.toLocaleString()+'–'+end.toLocaleString()+' of '+state.total.toLocaleString())+'</div><label class="mw-page-size">Rows <select id="mw-page-size" aria-label="Records per page">'+[25,50,75,100].map(n=>'<option '+(n===state.pageSize?'selected':'')+'>'+n+'</option>').join('')+'</select></label><nav class="mw-pagination" aria-label="Records pagination"><button type="button" data-mw="page" data-page="'+(p-1)+'" '+(p<=1||state.loading?'disabled':'')+' aria-label="Previous page">‹</button>'+links+'<button type="button" data-mw="page" data-page="'+(p+1)+'" '+(p>=max||state.loading?'disabled':'')+' aria-label="Next page">›</button></nav><form class="mw-jump"><label>Go to <input name="page" type="number" min="1" max="'+max+'" value="'+p+'" aria-label="Go to page"></label><button type="submit">Go</button></form>';
 find('.mw-jump').onsubmit=e=>{e.preventDefault();const val=Number(new FormData(e.target).get('page'));if(Number.isInteger(val)&&val>=1&&val<=max){state.page=val;load()}else announce('Enter a page number between 1 and '+max+'.')};
 }
 async function load(){if(dead)return;const current=++sequence;state.loading=true;state.error='';render();try{const data=await api(config.endpoint+'?'+params());if(dead||current!==sequence)return;state.records=data.records||[];state.total=Number(data.total)||0;state.totalPages=Math.max(1,Number(data.totalPages)||Math.ceil(state.total/state.pageSize));state.counts=data.counts;state.owners=data.owners||[];state.permissions=Object.fromEntries(Object.entries(data.permissions||{}).map(([key,value])=>[key,value===true]));state.permissionsKnown=true;if(!permitted('read')){state.records=[];state.total=0;state.counts=null;state.loading=false;state.error='You do not have access to this module.';render();return}state.limits={selectedExport:250,...data.resource?.limits};if(state.page>state.totalPages){state.page=state.totalPages;return load()}state.loading=false;render()}catch(e){if(dead||current!==sequence)return;state.loading=false;state.error=e.message||'Please try again.';render()}}
 function rowFor(button){const id=button.dataset.record||button.closest('tr')?.querySelector('[data-record-id]')?.dataset.recordId;return state.records.find(r=>r.id===id)}
 async function click(event){const b=event.target.closest('[data-mw]');if(dead||!b||(!host.contains(b)&&!moduleHeader?.contains(b)))return;const action=b.dataset.mw;const access={create:'create',read:'read',edit:'edit',archive:'archive',restore:'restore',filters:'filter','filter-toggle':'filter',columns:'settings',refresh:'read',export:'export','export-selected':'export',dashboard:'dashboard',home:'read',import:'import','clear-filters':'filter','remove-filter':'filter',sort:'read',page:'read','clear-selection':'read'};if(access[action]&&!permitted(access[action])&&!(action==='refresh'&&state.error&&!state.permissionsKnown)){announce('You do not have permission to perform this action.');return}moduleHeader?.querySelectorAll('.mw-settings-menu[open]').forEach(menu=>menu.open=false);
 if(action==='home'||action==='dashboard'){if(blDetail&&!closeBlRecord())return;state.view=action;renderViews();stats();}
 else if(action==='filter-toggle'){state.view='home';state.filtersOpen=!state.filtersOpen;renderViews();}
 else if(action==='import'){if(config.import&&typeof config.onImport==='function')config.onImport();}
 else if(action==='refresh'){clearTimeout(timer);load()}
 else if(action==='create')editForm();
 else if(action==='read'){const r=rowFor(b);if(r&&permitted('read'))readRecord(r.id)}
 else if(action==='edit'){const r=rowFor(b);if(r&&!r.archivedAt&&!r.deletedAt)editForm(r)}
 else if(['archive','restore','soft-delete','restore-deleted'].includes(action)){const r=rowFor(b);if(r)archiveRecord(r,action)}
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
 function change(event){if(event.target.id==='mw-page-size'){state.pageSize=Number(event.target.value);prefs.pageSize=state.pageSize;savePrefs();state.page=1;load()}if(event.target.id==='mw-select-page'){state.records.forEach(r=>event.target.checked?state.selected.add(r.id):state.selected.delete(r.id));render()}if(event.target.matches('[data-select]')){event.target.checked?state.selected.add(event.target.dataset.select):state.selected.delete(event.target.dataset.select);render()}}
 function closeDialog(force=false){if(!dialog)return true;if(!force&&(dialogSaving||(dialogDirty&&dialogDirty()&&!window.confirm('Discard your unsaved changes?'))))return false;dialog.close();dialog.remove();document.documentElement.classList.remove('mw-modal-open');dialog=null;dialogDirty=null;dialogSaving=false;previousFocus?.focus();return true}
 function openDialog(title,body,footer='',wide=false){if(dead||!closeDialog())return null;previousFocus=document.activeElement;if(previousFocus?.closest('.mw-settings-menu'))previousFocus=previousFocus.closest('.mw-settings-menu').querySelector('summary');dialog=document.createElement('dialog');dialog.className='mw-dialog'+(wide?' mw-dialog-wide':'')+(config.key==='business-lines'?' mw-bl-dialog':'');dialog.setAttribute('aria-labelledby','mw-dialog-title');dialog.innerHTML='<header><div><p class="mw-eyebrow">'+esc(config.title)+'</p><h2 id="mw-dialog-title">'+esc(title)+'</h2></div><button type="button" class="mw-icon-btn mw-dialog-close" aria-label="Close">'+icon('close')+'</button></header><div class="mw-dialog-body">'+body+'</div>'+(footer?'<footer>'+footer+'</footer>':'');document.body.append(dialog);dialog.querySelector('.mw-dialog-close').onclick=()=>closeDialog();dialog.addEventListener('cancel',e=>{e.preventDefault();closeDialog()});dialog.addEventListener('click',e=>{if(e.target===dialog)closeDialog()});dialog.showModal();document.documentElement.classList.add('mw-modal-open');return dialog}

 function blValue(record,key){
  const value=record?.[key];
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
 function blInput(key,label,record,mode){
  const editable=mode==='create'?['name','code','description'].includes(key):mode==='edit'&&['name','code','description','status'].includes(key);
  const value=mode==='create'?'':blValue(record,key),shown=value==='—'?'':value;
  const required=editable&&['name','code'].includes(key)&&!(key==='code'&&mode==='edit'&&!record?.code),full=key==='description';
  const limit={name:150,code:20,description:500}[key];
  const attrs=editable?(' name="'+esc(key)+'"'+(required?' required':'')+(limit?' maxlength="'+limit+'"':'')):' readonly aria-readonly="true"';
  let control=key==='status'&&editable?'<select name="status" aria-label="Business Line Status"><option value="Active"'+(shown==='Active'?' selected':'')+'>Active</option><option value="Inactive"'+(shown==='Inactive'?' selected':'')+'>Inactive</option></select>':full?'<textarea rows="2"'+attrs+'>'+esc(shown)+'</textarea>':'<input type="text"'+attrs+' value="'+esc(shown)+'"'+(editable?' autocomplete="off"':'')+'>';
  if(mode==='read'||mode==='edit'&&!editable)control='<div class="mw-bl-read-value'+(full?' mw-bl-read-description':'')+'" aria-readonly="true">'+esc(value)+'</div>';
  const hint=editable&&key==='status'?'<small class="mw-bl-hint">Changing status requires a reason and may be blocked when records depend on this line.</small>':editable&&key==='code'?'<small class="mw-bl-hint">Uppercase letters, digits and hyphens; maximum 20 characters.</small>':editable&&key==='description'?'<small class="mw-bl-hint">Maximum 500 characters. <span data-count-for="description">'+shown.length+'</span> / 500</small>':'';
  return '<div class="mw-bl-field mw-bl-field-'+esc(key)+(full?' mw-bl-full':'')+'"><label>'+esc(label)+(required?' <span class="mw-required">*</span>':'')+'</label>'+control+hint+'</div>';
 }
 function blFormSections(record,mode){
  if(mode==='create'){
   const content='<div class="mw-bl-grid">'+[['name','Business Line Name'],['code','Business Line Code'],['description','Business Line Description']].map(([key,label])=>blInput(key,label,record,mode)).join('')+'</div>';
   return '<div class="mw-bl-section-tools" role="group" aria-label="Section display"><button type="button" class="mw-bl-section-action" data-bl-sections="expand">Expand all</button><button type="button" class="mw-bl-section-action" data-bl-sections="collapse">Collapse all</button></div><section class="mw-bl-section"><details open><summary>Basic Information <span class="mw-bl-chevron">⌄</span></summary><div class="mw-bl-section-content">'+content+'</div></details></section>';
  }
  return '<div class="mw-bl-section-tools" role="group" aria-label="Section display"><button type="button" class="mw-bl-section-action" data-bl-sections="expand">Expand all</button><button type="button" class="mw-bl-section-action" data-bl-sections="collapse">Collapse all</button></div>'+blGroups.map((group,index)=>'<section class="mw-bl-section"><details '+(index===0||mode==='read'&&index===1?'open':'')+'><summary>'+esc(group.name)+' <span class="mw-bl-chevron" aria-hidden="true">⌄</span></summary><div class="mw-bl-section-content"><div class="mw-bl-grid">'+group.fields.map(([key,label])=>blInput(key,label,record,mode)).join('')+'</div></div></details></section>').join('');
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
 if(record&&config.key==='business-lines'){openBlRecord(record.id,true);return;}
 const editing=!!record,fields=(config.fields||[]).filter(f=>!f.views||f.views.includes(editing?'edit':'create'));
 const currentValue=f=>record?.[f.key]??(f.key==='owner'?(user.name||user.email):f.default??'');
 const fieldHTML=f=>{const value=currentValue(f),label='<label class="mw-field '+(f.full?'mw-field-full':'')+'">'+esc(f.label)+(f.required?' <span class="mw-required" aria-hidden="true">*</span>':'');const attrs='name="'+esc(f.key)+'" '+(f.required?'required ':'')+(f.maxLength?'maxlength="'+f.maxLength+'" ':'');
 if(f.type==='readonly')return label+'<input value="'+esc(value)+'" readonly aria-readonly="true"></label>';
 if(f.type==='select')return label+'<select '+attrs+'>'+(f.options||[]).map(option=>'<option value="'+esc(option)+'" '+(option===value?'selected':'')+'>'+esc(option)+'</option>').join('')+'</select></label>';
 if(f.type==='textarea')return label+'<textarea '+attrs+' rows="4" data-counted="'+esc(f.key)+'">'+esc(value)+'</textarea>'+(f.maxLength?'<span class="mw-field-hint"><span data-count-for="'+esc(f.key)+'">'+String(value).length+'</span>/'+f.maxLength+' characters</span>':'')+'</label>';
 return label+'<input '+attrs+'type="'+esc(f.type||'text')+'" autocomplete="off" value="'+esc(value)+'"></label>'};
 const body=config.key==='business-lines'?'<form id="mw-record-form" class="mw-bl-form">'+blFormSections(record,editing?'edit':'create')+(editing?'<div class="mw-bl-status-reason" hidden><label for="mw-bl-status-reason">Reason for status change <span class="mw-required">*</span></label><textarea id="mw-bl-status-reason" maxlength="500" rows="2" placeholder="Explain why the status is changing"></textarea><small>Required only when changing Active / Inactive.</small></div>':'')+'<p class="mw-form-error" role="alert" hidden></p></form>':'<form id="mw-record-form"><p class="mw-form-intro">'+(editing?'Update details. Record identifiers and audit fields are protected.':'Create this record. The record owner will be you.')+'</p><h3>Basic information</h3><div class="mw-form-grid">'+fields.map(fieldHTML).join('')+'</div>'+(editing?'<h3>System information</h3><dl class="mw-details-grid"><div><dt>'+esc(allColumns.find(c=>c.key==='displayId')?.label||'Record ID')+'</dt><dd>'+esc(record.displayId)+'</dd></div><div><dt>Last modified</dt><dd>'+esc(date(record.updatedAt))+'</dd></div></dl>':'')+'<p class="mw-form-error" role="alert" hidden></p></form>';
 const d=openDialog(config.key==='business-lines'?(editing?'Edit Business Line':'New Business Line'):(editing?'Edit ':'Create ')+config.singular,body,'<button type="button" class="mw-btn" id="mw-cancel">Cancel</button><button type="submit" form="mw-record-form" class="mw-btn mw-primary" id="mw-save">'+(config.key==='business-lines'?'Save':editing?'Save changes':'Create '+esc(config.singular))+'</button>');if(!d)return;
 const form=d.querySelector('form'),base=formValues(form);dialogDirty=()=>formValues(form)!==base;
 if(config.key==='business-lines'){wireBlSections(d);form.addEventListener('invalid',event=>{const section=event.target.closest('.mw-bl-section details');if(section)section.open=true},true);if(editing){const status=form.querySelector('[name="status"]'),reasonWrap=form.querySelector('.mw-bl-status-reason'),reasonField=form.querySelector('#mw-bl-status-reason');const sync=()=>{const changed=status?.value!==record.status;reasonWrap.hidden=!changed;reasonField.required=changed;if(!changed)reasonField.value='';};status?.addEventListener('change',sync);sync()}}
 d.querySelector('#mw-cancel').onclick=()=>closeDialog();
 form.querySelectorAll('[data-counted],textarea[name="description"]').forEach(input=>input.oninput=()=>{const count=form.querySelector('[data-count-for="'+(input.dataset.counted||input.name)+'"]');if(count)count.textContent=input.value.length});
 if(config.key==='business-lines'){const code=form.elements.code;if(code)code.addEventListener('input',()=>{const p=code.selectionStart;code.value=code.value.toUpperCase();code.setSelectionRange(p,p)})}
 form.onsubmit=async e=>{e.preventDefault();if(dialogSaving||!permitted(editing?'edit':'create'))return;if(!form.checkValidity()){if(config.key==='business-lines')form.querySelectorAll('.mw-bl-section details').forEach(section=>{section.open=true});form.reportValidity();return}const values=new FormData(form),error=d.querySelector('.mw-form-error');error.hidden=true;const body=Object.fromEntries(fields.filter(f=>f.type!=='readonly').map(f=>[f.key,String(values.get(f.key)||'').trim()]));if(editing)body.version=record.version;
 if(config.key==='business-lines'&&editing){
  const status=form.querySelector('[name="status"]')?.value||record.status;
  if(status!==record.status){const reason=form.querySelector('#mw-bl-status-reason')?.value.trim()||'';
   if(!reason){error.textContent='Reason is mandatory for status changes.';error.hidden=false;form.querySelector('#mw-bl-status-reason')?.focus();return;}
   body.status=status;body.reason=reason.slice(0,500);
  }
 }
 const missing=fields.find(f=>f.required&&!body[f.key]);if(missing){error.textContent='Enter '+missing.label.toLowerCase()+'.';error.hidden=false;form.elements[missing.key].focus();return}
 dialogSaving=true;d.querySelector('#mw-save').disabled=true;d.querySelector('#mw-save').textContent='Saving…';
 try{await api(config.endpoint+(editing?'/'+encodeURIComponent(record.id):''),editing?'PUT':'POST',body);if(dead||dialog!==d)return;dialogSaving=false;closeDialog(true);announce(config.singular+(editing?' updated.':' created.'));await load()}
 catch(e){if(dead||dialog!==d)return;dialogSaving=false;error.textContent=e.message;error.hidden=false;d.querySelector('#mw-save').disabled=false;d.querySelector('#mw-save').textContent=config.key==='business-lines'?'Save':editing?'Save changes':'Create '+config.singular;error.scrollIntoView({block:'nearest'})}
 };
 form.querySelector('input:not([readonly]),select,textarea')?.focus();
 }
 async function readRecord(id){if(dead||!permitted('read'))return;if(config.key==='business-lines'){openBlRecord(id);return;}const d=openDialog(config.key==='business-lines'?'Business Line Details':'Record details','<div class="mw-state">Loading record…</div>','<button type="button" class="mw-btn" id="mw-read-close">Close</button>',true);if(!d)return;d.querySelector('#mw-read-close').onclick=()=>closeDialog();try{const [{record},history]=await Promise.all([api(config.endpoint+'/'+encodeURIComponent(id)),permitted('history')?api(config.endpoint+'/'+encodeURIComponent(id)+'/history'):Promise.resolve({history:[]})]);if(dead||dialog!==d)return;
 if(config.key==='business-lines'){d.querySelector('.mw-dialog-body').innerHTML='<div class="mw-bl-read">'+blFormSections(record,'read')+'</div>'+(permitted('history')?'<section class="mw-bl-section"><details><summary>Audit History <span class="mw-bl-chevron">⌄</span></summary><div class="mw-bl-section-content mw-history">'+((history.history||[]).length?(history.history||[]).map(h=>'<article><strong>'+esc(h.action)+'</strong> · '+esc(date(h.createdAt))+' · '+esc(h.actor||'System')+(h.reason?' · Reason: '+esc(h.reason):'')+'</article>').join(''):'<p>No history available.</p>')+'</div></details></section>':'');wireBlSections(d);if(permitted('edit')&&!record.archivedAt&&!record.deletedAt){const edit=document.createElement('button');edit.type='button';edit.className='mw-btn mw-primary';edit.textContent='Edit Business Line';edit.onclick=()=>editForm(record);d.querySelector('footer').append(edit)}return;}
 d.querySelector('.mw-dialog-body').innerHTML='<div class="mw-detail-title"><div><span class="mw-id">'+esc(record.displayId)+'</span><h3>'+esc(record.name)+'</h3></div><span class="mw-status '+(record.status==='Active'?'mw-active':'mw-inactive')+'">'+esc(record.archivedAt?'Archived':record.status)+'</span></div><h3>Basic information</h3><dl class="mw-details-grid">'+allColumns.filter(c=>!c.system).map(c=>'<div class="'+(c.key==='remarks'?'mw-field-full':'')+'"><dt>'+esc(c.label)+'</dt><dd>'+esc(c.type==='date'?date(record[c.key]):record[c.key]||'—')+'</dd></div>').join('')+'</dl><h3>System information</h3><dl class="mw-details-grid">'+allColumns.filter(c=>c.system).map(c=>'<div><dt>'+esc(c.label)+'</dt><dd>'+esc(c.type==='date'?date(record[c.key]):record[c.key]||'—')+'</dd></div>').join('')+'</dl><h3>Audit history</h3><div class="mw-history">'+((history.history||[]).length?(history.history||[]).map(h=>'<article><div><strong>'+esc(h.action)+'</strong><span>'+esc(date(h.createdAt))+'</span></div><p>'+esc(h.actor||'System')+'</p>'+Object.entries(h.changes||{}).map(([key,value])=>'<p class="mw-history-change"><b>'+esc(allColumns.find(c=>c.key===key)?.label||key)+':</b> '+esc(value?.before??'—')+' → '+esc(value?.after??'—')+'</p>').join('')+'</article>').join(''):'<p>No history available.</p>')+'</div>';
 if(!permitted('history')){const historyNode=d.querySelector('.mw-history');if(historyNode){historyNode.hidden=true;historyNode.previousElementSibling.hidden=true}}
 if(permitted('edit')&&!record.archivedAt){const edit=document.createElement('button');edit.type='button';edit.className='mw-btn mw-primary';edit.textContent='Edit '+config.singular;edit.onclick=()=>editForm(record);d.querySelector('footer').append(edit)}
 }catch(e){if(!dead&&dialog===d)d.querySelector('.mw-dialog-body').innerHTML='<p class="mw-form-error" role="alert">'+esc(e.message)+'</p>'}}



 // Dedicated Business Lines record workspace. Uses the same nineteen approved
 // fields as the existing dialogs, without changing backend authorization.
 function leaveBlAllowed(){
  if(blBusy)return false;
  if(!blDraft)return true;
  if(blDraft.dataset.dirty==='true'&&!window.confirm('Discard your unsaved changes?'))return false;
  return true;
 }
 function closeBlRecord(){
  if(!blDetail)return true;
  if(!leaveBlAllowed())return false;
  blDetail.remove();blDetail=null;blDraft=null;blRecord=null;blRecordMode='read';
  host.querySelector('.mw-workspace').hidden=false;
  if(moduleHeader)moduleHeader.hidden=false;
  host.classList.remove('mw-bl-detail-active');
  return true;
 }
 async function openBlRecord(id,startEdit=false){
  if(dead||!permitted('read')||(startEdit&&!permitted('edit')))return;
  if(blDetail&&!closeBlRecord())return;
  const page=document.createElement('section');page.className='mw-bl-detail-page';
  page.setAttribute('aria-label','Business Line record details');page.innerHTML='<div class="mw-state"><span class="mw-spinner"></span> Loading record…</div>';
  blDetail=page;host.append(page);host.querySelector('.mw-workspace').hidden=true;
  if(moduleHeader)moduleHeader.hidden=true;
  host.classList.add('mw-bl-detail-active');
  try{
   const [{record},audit]=await Promise.all([api(config.endpoint+'/'+encodeURIComponent(id)),permitted('history')?api(config.endpoint+'/'+encodeURIComponent(id)+'/history'):Promise.resolve({history:[]})]);
   if(dead||blDetail!==page)return;
   blRecord=record;
   renderBlRecordPage(record,startEdit?'edit':'read',audit.history||[]);
  }catch(e){if(blDetail===page)page.innerHTML='<p class="mw-form-error" role="alert">'+esc(e.message)+'</p><button type="button" class="mw-btn" id="bl-back">Back to Records</button>';page.querySelector('#bl-back')?.addEventListener('click',()=>closeBlRecord())}
 }
 function renderBlRecordPage(record,mode='read',history=[]){
  if(!blDetail)return;
  blRecord=record;blRecordMode=mode;blDraft=null;
  const editing=mode==='edit'&&permitted('edit')&&!record.archivedAt&&!record.deletedAt;
  const order=state.records.findIndex(r=>r.id===record.id),previous=order>0?state.records[order-1]:null,next=order>=0&&order<state.records.length-1?state.records[order+1]:null,hasPrevious=!!previous||order===0&&state.page>1,hasNext=!!next||order===state.records.length-1&&state.page<state.totalPages;
  const status=record.archivedAt?'Archived':record.status;
  const sectionNavigation='<nav class="mw-bl-detail-index" aria-label="Jump to section"><span>Sections</span>'+blGroups.map((g,i)=>'<button type="button" data-bl-jump="'+i+'">'+esc(g.name)+'</button>').join('')+'</nav>';
  blDetail.innerHTML='<div class="mw-bl-detail-breadcrumb"><button type="button" id="bl-back">'+esc(config.title)+'</button><span>›</span><span>'+esc(record.displayId||record.name)+'</span></div>'
   +'<header class="mw-bl-detail-heading"><div><h2>'+esc(record.name)+'</h2><div class="mw-bl-detail-meta"><span>'+esc(record.displayId||'')+'</span><span class="mw-status '+(status==='Active'?'mw-active':'mw-inactive')+'">'+esc(status)+'</span>'+(editing?'<span class="mw-bl-edit-tag">Editing</span>':'')+'</div></div>'
   +'<div class="mw-bl-detail-actions"><button type="button" class="mw-btn" data-bl-prev'+(!hasPrevious?' disabled':'')+'>‹ Previous</button><button type="button" class="mw-btn" data-bl-next'+(!hasNext?' disabled':'')+'>Next ›</button>'+(!editing&&permitted('edit')&&!record.archivedAt&&!record.deletedAt?'<button type="button" class="mw-btn mw-primary" id="bl-edit">Edit</button>':'')+'</div></header>'
   +'<div class="mw-bl-detail-tools"><span>Details</span><button type="button" data-bl-expand="1">Expand all</button><button type="button" data-bl-expand="0">Collapse all</button></div>'
   +'<div class="mw-bl-detail-layout">'+sectionNavigation+'<div class="mw-bl-detail-content">'+(editing?'<form id="mw-bl-page-form" class="mw-bl-form">'+blFormSections(record,'edit')+'<div class="mw-bl-status-reason" hidden><label for="mw-bl-page-reason">Reason for status change <span class="mw-required">*</span></label><textarea id="mw-bl-page-reason" maxlength="500" rows="2"></textarea></div><p class="mw-form-error" role="alert" hidden></p></form>':'<div class="mw-bl-read">'+blFormSections(record,'read')+'</div>')+(permitted('history')?'<section class="mw-bl-section"><details><summary>Audit History <span class="mw-bl-chevron">⌄</span></summary><div class="mw-bl-section-content mw-history">'+(history.length?history.map(h=>'<article><strong>'+esc(h.action)+'</strong> · '+esc(date(h.createdAt))+' · '+esc(h.actor||'System')+(h.reason?' · '+esc(h.reason):'')+'</article>').join(''):'<p>No history available.</p>')+'</div></details></section>':'')+'</div></div>'
   +(editing?'<footer class="mw-bl-page-save"><span>* Required fields</span><div><button type="button" class="mw-btn" id="bl-cancel">Cancel</button><button type="submit" form="mw-bl-page-form" class="mw-btn mw-primary" id="bl-save">Save Changes</button></div></footer>':'');
  const page=blDetail,detailSections=[...page.querySelectorAll('.mw-bl-detail-content .mw-bl-section')];
  const sectionKey='scrm:bl-sections:'+user.id;
  let savedSections={};try{savedSections=JSON.parse(localStorage.getItem(sectionKey)||'{}')||{}}catch{}
  detailSections.slice(0,blGroups.length).forEach((section,index)=>{
   const details=section.querySelector('details'),name=blGroups[index].name;
   if(typeof savedSections[name]==='boolean')details.open=savedSections[name];
   details.addEventListener('toggle',()=>{if(blDetail!==page)return;try{
    const all=Object.fromEntries(detailSections.slice(0,blGroups.length).map((item,i)=>[blGroups[i].name,item.querySelector('details').open]));
    localStorage.setItem(sectionKey,JSON.stringify(all));
   }catch{}});
  });
  page.querySelector('#bl-back').onclick=()=>closeBlRecord();
  const navigate=async direction=>{
   const adjacent=direction<0?previous:next;
   if(adjacent){openBlRecord(adjacent.id);return}
   const newPage=state.page+(direction<0?-1:1);
   if(newPage<1||newPage>state.totalPages||!leaveBlAllowed())return;
   const searchParams=new URLSearchParams(params());searchParams.set('page',String(newPage));
   const prevPage=state.page,prevRecords=state.records;
   try{
    const result=await api(config.endpoint+'?'+searchParams.toString());
    if(dead||blDetail!==page||result.permissions?.read!==true||!result.records?.length)return;
    const nextRecord=direction<0?result.records[result.records.length-1]:result.records[0];
    state.page=newPage;state.records=result.records;
    await openBlRecord(nextRecord.id);
    render();
   }catch(e){state.page=prevPage;state.records=prevRecords;announce('Unable to load adjacent records: '+e.message)}
  };
  page.querySelector('[data-bl-prev]').onclick=()=>navigate(-1);
  page.querySelector('[data-bl-next]').onclick=()=>navigate(1);
  page.querySelector('#bl-edit')?.addEventListener('click',()=>renderBlRecordPage(record,'edit',history));
  page.querySelector('#bl-cancel')?.addEventListener('click',()=>{if(leaveBlAllowed())renderBlRecordPage(record,'read',history)});
  page.querySelectorAll('[data-bl-expand]').forEach(b=>b.onclick=()=>detailSections.forEach(section=>{section.querySelector('details').open=b.dataset.blExpand==='1'}));
  page.querySelectorAll('[data-bl-jump]').forEach(b=>b.onclick=()=>{const section=detailSections[Number(b.dataset.blJump)];if(section){section.querySelector('details').open=true;section.scrollIntoView({block:'start',behavior:'smooth'})}});
  // Display only the page-level expand/collapse controls, not duplicate field-list controls.
  page.querySelectorAll('.mw-bl-detail-content>.mw-bl-read>.mw-bl-section-tools,.mw-bl-detail-content>form>.mw-bl-section-tools').forEach(el=>el.remove());
  if(!editing)return;
  const form=page.querySelector('#mw-bl-page-form');blDraft=form;
  const baseline=formValues(form);
  const mark=()=>{form.dataset.dirty=String(formValues(form)!==baseline)};
  form.addEventListener('input',mark);form.addEventListener('change',mark);
  const code=form.elements.code;if(code)code.addEventListener('input',()=>{const caret=code.selectionStart;code.value=code.value.toUpperCase();code.setSelectionRange(caret,caret);mark()});
  const statusField=form.elements.status,reason=page.querySelector('#mw-bl-page-reason'),reasonWrap=reason.parentElement;
  const syncStatus=()=>{const changed=statusField.value!==record.status;reasonWrap.hidden=!changed;reason.required=changed;if(!changed)reason.value='';mark()};
  statusField?.addEventListener('change',syncStatus);syncStatus();
  form.querySelectorAll('input,select,textarea').forEach(field=>{
   field.addEventListener('blur',()=>{if(field.willValidate&&!field.checkValidity()){const section=field.closest('details');if(section)section.open=true;}},true);
  });
  form.addEventListener('invalid',e=>{const section=e.target.closest('details');if(section)section.open=true},true);
  form.onsubmit=async e=>{
   e.preventDefault();if(blBusy||!permitted('edit'))return;
   const error=page.querySelector('.mw-form-error');error.hidden=true;
   if(!form.checkValidity()){detailSections.forEach(x=>x.querySelector('details').open=true);error.textContent='Review the highlighted required fields before saving.';error.hidden=false;form.reportValidity();return}
   const values=new FormData(form);
   const payload={version:record.version,name:String(values.get('name')||'').trim(),code:String(values.get('code')||'').trim(),description:String(values.get('description')||'').trim()};
   if(statusField.value!==record.status){const reasonText=reason.value.trim();if(!reasonText){error.textContent='Reason is mandatory for status changes.';error.hidden=false;reason.focus();return}payload.status=statusField.value;payload.reason=reasonText}
   blBusy=true;page.querySelector('#bl-save').disabled=true;page.querySelector('#bl-save').textContent='Saving…';
   try{const response=await api(config.endpoint+'/'+encodeURIComponent(record.id),'PUT',payload);
    if(dead||blDetail!==page)return;blBusy=false;blDraft=null;
    const updated=response.record||{...record,...payload};
    renderBlRecordPage(updated,'read',history);announce('Business Line updated.');await load();
   }catch(err){if(dead||blDetail!==page)return;blBusy=false;error.textContent=err.message;error.hidden=false;page.querySelector('#bl-save').disabled=false;page.querySelector('#bl-save').textContent='Save Changes';error.scrollIntoView({block:'nearest'})}
  };
 }

 function ownerRecord(record){
  if(dead||!permitted('reassignOwner')||record.archivedAt||record.deletedAt)return;
  const eligible=state.owners.filter(owner=>typeof owner.ownerId==='string'&&owner.ownerId.startsWith('UID-'));
  const options=eligible.map(owner=>'<option value="'+esc(owner.ownerId)+'" '+(owner.ownerId===record.ownerId?'selected':'')+'>'+esc(owner.name)+' ('+esc(owner.ownerId)+')</option>').join('');
  const d=openDialog('Reassign Business Line Owner','<p>Select an active SCRM User Master record. Created By will remain unchanged.</p><label class="mw-bl-reason">New Owner<select id="mw-new-owner" required>'+options+'</select></label><p class="mw-form-error" role="alert" hidden></p>','<button type="button" class="mw-btn" id="mw-archive-cancel">Cancel</button><button type="button" class="mw-btn mw-primary" id="mw-archive-confirm">Reassign</button>');
  if(!d)return;
  d.querySelector('#mw-archive-cancel').onclick=()=>closeDialog();
  d.querySelector('#mw-archive-confirm').onclick=async()=>{
   const ownerId=d.querySelector('#mw-new-owner').value,error=d.querySelector('.mw-form-error');
   if(!ownerId){error.textContent='Select an eligible owner.';error.hidden=false;return}
   dialogSaving=true;d.querySelector('#mw-archive-confirm').disabled=true;
   try{await api(config.endpoint+'/'+encodeURIComponent(record.id),'PUT',{version:record.version,ownerId});if(dead||dialog!==d)return;dialogSaving=false;closeDialog(true);announce('Business Line owner updated.');await load()}
   catch(e){if(dead||dialog!==d)return;dialogSaving=false;error.textContent=e.message;error.hidden=false;d.querySelector('#mw-archive-confirm').disabled=false}
  };
 }
 function statusRecord(record){
  if(dead||!permitted('edit')||record.archivedAt||record.deletedAt)return;
  const next=record.status==='Active'?'Inactive':'Active',title=next==='Active'?'Reactivate Business Line':'Deactivate Business Line';
  const d=openDialog(title,'<p>Change <strong>'+esc(record.name)+'</strong> to '+esc(next)+'?</p><label class="mw-bl-reason">Reason <span class="mw-required">*</span><textarea id="mw-lifecycle-reason" maxlength="500" rows="3" required placeholder="Explain the change"></textarea></label><p class="mw-form-error" role="alert" hidden></p>','<button type="button" class="mw-btn" id="mw-archive-cancel">Cancel</button><button type="button" class="mw-btn mw-primary" id="mw-archive-confirm">Confirm</button>');
  if(!d)return;
  d.querySelector('#mw-archive-cancel').onclick=()=>closeDialog();
  d.querySelector('#mw-archive-confirm').onclick=async()=>{
   const reason=d.querySelector('#mw-lifecycle-reason').value.trim(),error=d.querySelector('.mw-form-error');
   if(!reason){error.textContent='A reason is required.';error.hidden=false;return}
   dialogSaving=true;d.querySelector('#mw-archive-confirm').disabled=true;
   try{await api(config.endpoint+'/'+encodeURIComponent(record.id),'PUT',{version:record.version,status:next,reason});if(dead||dialog!==d)return;dialogSaving=false;closeDialog(true);announce('Business Line '+(next==='Active'?'reactivated.':'deactivated.'));await load()}
   catch(e){if(dead||dialog!==d)return;dialogSaving=false;error.textContent=e.message;error.hidden=false;d.querySelector('#mw-archive-confirm').disabled=false}
  };
 }
 function businessLifecycle(record,action){
  const operations={
   archive:{permission:'archive',name:'Archive',label:'archived',danger:true},
   restore:{permission:'restore',name:'Unarchive',label:'unarchived',danger:false},
   'soft-delete':{permission:'softDelete',name:'Soft Delete',label:'deleted',danger:true},
   'restore-deleted':{permission:'restoreDeleted',name:'Restore Deleted',label:'restored',danger:false}
  };
  const op=operations[action];if(!op||!permitted(op.permission))return;
  const d=openDialog(op.name+' Business Line','<p>'+op.name+' <strong>'+esc(record.name)+'</strong>?</p><label class="mw-bl-reason">Reason <span class="mw-required">*</span><textarea id="mw-lifecycle-reason" maxlength="500" rows="3" required placeholder="Explain the action"></textarea></label><p class="mw-form-error" role="alert" hidden></p>','<button type="button" class="mw-btn" id="mw-archive-cancel">Cancel</button><button type="button" class="mw-btn '+(op.danger?'mw-danger':'mw-primary')+'" id="mw-archive-confirm">'+esc(op.name)+'</button>');
  if(!d)return;
  d.querySelector('#mw-archive-cancel').onclick=()=>closeDialog();
  d.querySelector('#mw-archive-confirm').onclick=async()=>{
   const reason=d.querySelector('#mw-lifecycle-reason').value.trim(),error=d.querySelector('.mw-form-error');
   if(!reason){error.textContent='A reason is required.';error.hidden=false;return}
   dialogSaving=true;d.querySelector('#mw-archive-confirm').disabled=true;
   try{await api(config.endpoint+'/'+encodeURIComponent(record.id)+'/'+action,'POST',{version:record.version,reason});if(dead||dialog!==d)return;dialogSaving=false;closeDialog(true);announce('Business Line '+op.label+'.');await load()}
   catch(e){if(dead||dialog!==d)return;dialogSaving=false;error.textContent=e.message;error.hidden=false;d.querySelector('#mw-archive-confirm').disabled=false}
  };
 }
 function archiveRecord(record,action){if(config.key==='business-lines'){businessLifecycle(record,action);return}if(dead||!permitted(action))return;const restore=action==='restore';const d=openDialog((restore?'Restore ':'Archive ')+config.singular,'<p>'+(restore?'Restore':'Archive')+' <strong>'+esc(record.name)+'</strong>?</p><p class="mw-muted">'+(restore?'It will return to the current records list. Its prior Active or Inactive status is preserved.':'It will be kept with its history and can be restored later. It will be excluded from current records.')+'</p><p class="mw-form-error" role="alert" hidden></p>','<button type="button" class="mw-btn" id="mw-archive-cancel">Cancel</button><button type="button" class="mw-btn '+(restore?'mw-primary':'mw-danger')+'" id="mw-archive-confirm">'+(restore?'Restore':'Archive')+'</button>');if(!d)return;
 d.querySelector('#mw-archive-cancel').onclick=()=>closeDialog();d.querySelector('#mw-archive-confirm').onclick=async()=>{if(!permitted(action))return;dialogSaving=true;d.querySelector('#mw-archive-confirm').disabled=true;try{await api(config.endpoint+'/'+encodeURIComponent(record.id)+'/'+action,'POST',{version:record.version});if(dead||dialog!==d)return;dialogSaving=false;closeDialog(true);announce(config.singular+' '+(restore?'restored.':'archived.'));load()}catch(e){if(dead||dialog!==d)return;dialogSaving=false;const err=d.querySelector('.mw-form-error');err.textContent=e.message;err.hidden=false;d.querySelector('#mw-archive-confirm').disabled=false}}
 }
 function columnsDialog(){if(dead||!permitted('settings'))return;
 let order=[...prefs.columns,...allColumns.filter(c=>!prefs.columns.includes(c.key)).map(c=>c.key)],enabled=new Set(prefs.columns);
 const d=openDialog('Columns & My View','<p class="mw-muted">Choose visible columns and their order. ID and Name remain visible. Your preferences apply only to your account on this browser.</p><div id="mw-column-options"></div><label class="mw-checkbox-label"><input id="mw-freeze" type="checkbox" '+(prefs.freeze?'checked':'')+'> Freeze ID and Name on wider screens</label>','<button class="mw-btn" type="button" id="mw-columns-reset">Reset default</button><button class="mw-btn mw-primary" type="button" id="mw-columns-save">Save My View</button>');if(!d)return;
 function draw(){d.querySelector('#mw-column-options').innerHTML=order.map((k,i)=>{const c=allColumns.find(c=>c.key===k);return '<div class="mw-column-option"><label><input type="checkbox" data-column-check="'+k+'" '+(enabled.has(k)?'checked':'')+' '+(c.locked?'disabled':'')+'>'+esc(c.label)+(c.locked?' <small>Required</small>':'')+'</label><div><button type="button" data-column-move="'+k+'" data-step="-1" aria-label="Move '+esc(c.label)+' up" '+(c.locked||i<=2?'disabled':'')+'>↑</button><button type="button" data-column-move="'+k+'" data-step="1" aria-label="Move '+esc(c.label)+' down" '+(c.locked||i===order.length-1?'disabled':'')+'>↓</button></div></div>'}).join('')}
 draw();d.querySelector('#mw-column-options').onchange=e=>{const k=e.target.dataset.columnCheck;if(k)e.target.checked?enabled.add(k):enabled.delete(k)};
 d.querySelector('#mw-column-options').onclick=e=>{const b=e.target.closest('[data-column-move]');if(!b)return;const i=order.indexOf(b.dataset.columnMove),j=i+Number(b.dataset.step);if(i<2||j<2||j>=order.length)return;[order[i],order[j]]=[order[j],order[i]];draw()};
 d.querySelector('#mw-columns-reset').onclick=()=>{order=[...defaults,...allColumns.filter(c=>!defaults.includes(c.key)).map(c=>c.key)];enabled=new Set(defaults);d.querySelector('#mw-freeze').checked=true;draw()};
 d.querySelector('#mw-columns-save').onclick=()=>{prefs.columns=order.filter(k=>enabled.has(k));prefs.freeze=d.querySelector('#mw-freeze').checked;savePrefs();closeDialog(true);render();announce('My View saved.')}
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
 const options=[['selected','Selected records',state.selected.size+' selected across pages. All exportable columns. Limit '+state.limits.selectedExport+' records; use Default View or My View for larger exports.'],['default','Default view','All matching records with the standard column set.'],['my','My View','All matching records with your visible columns and order.'],['all','All records','Every authorized record, including archived records. Search and filters do not apply.']];
 const d=openDialog('Export '+config.title,'<p class="mw-muted">Download a CSV file. Pagination never limits an export.</p><form id="mw-export-form" class="mw-export-options">'+options.map(([mode,label,desc])=>'<label><input type="radio" name="mode" value="'+mode+'" '+(mode===selected?'checked':'')+' '+(mode==='selected'&&(!state.selected.size||state.selected.size>state.limits.selectedExport)?'disabled':'')+'><span><strong>'+label+'</strong><small>'+esc(desc)+'</small></span></label>').join('')+'</form><p class="mw-form-error" role="alert" hidden></p>','<button class="mw-btn" type="button" id="mw-export-cancel">Cancel</button><button class="mw-btn mw-primary" type="submit" form="mw-export-form" id="mw-export-download">Download CSV</button>');if(!d)return;d.querySelector('#mw-export-cancel').onclick=()=>closeDialog();d.querySelector('form').onsubmit=async e=>{e.preventDefault();if(dialogSaving||!permitted('export'))return;const mode=new FormData(e.target).get('mode');dialogSaving=true;d.querySelector('#mw-export-download').disabled=true;d.querySelector('#mw-export-download').textContent='Preparing…';try{const result=await api(config.endpoint+'/export','POST',{mode,ids:mode==='selected'?[...state.selected]:[],...(mode==='my'?{columns:prefs.columns}:{}),query:query()});if(dead||dialog!==d)return;if(typeof result.csv!=='string')throw Error('The export could not be prepared.');const url=URL.createObjectURL(new Blob([result.csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=result.filename||config.key+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);dialogSaving=false;closeDialog(true);announce('Export ready: '+Number(result.count||0).toLocaleString()+' records.')}catch(e){dialogSaving=false;const err=d.querySelector('.mw-form-error');err.textContent=e.message;err.hidden=false;d.querySelector('#mw-export-download').disabled=false;d.querySelector('#mw-export-download').textContent='Download CSV'}}
 }
 shell();load();
 return {
  canLeave(){return dead||(leaveBlAllowed()&&closeDialog())},
  destroy(force=false){if(dead)return true;if(!force&&(!leaveBlAllowed()||!closeDialog()))return false;closeBlRecord();dead=true;++sequence;clearTimeout(timer);closeDialog(true);host.removeEventListener('click',click);host.removeEventListener('change',change);moduleHeader?.removeEventListener('click',click);headerRestore?.();return true},
  reload:load,
  setSearch(q){if(dead||!permitted('search'))return false;state.q=String(q??'').trim().slice(0,100);state.view='home';state.page=1;const field=find('#mw-search');if(field)field.value=state.q;renderViews();clearTimeout(timer);timer=setTimeout(()=>{rememberSearch(state.q);load()},300);return true},
  openResult(id,label){if(dead||!permitted('read'))return false;state.view='home';renderViews();readRecord(id);return true},
  focusSearch(){if(dead||!permitted('search'))return false;return window.SCRMWorkspace?.focusSearch?.()||false}
 };
}
window.SCRMModuleWorkspace={create};
})();