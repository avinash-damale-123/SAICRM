(()=>{
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ok=x=>x&&x.status==='Active';
const fmt=n=>Number(n||0).toLocaleString();
function mount(host){
 if(!window.SCRM.can('departmentmaster')){host.innerHTML='<div class="mw-state" role="alert"><strong>Access restricted</strong></div>';return {canLeave:()=>true,destroy:()=>{}}}
 const api=window.SCRM.api;
 let state={scope:'Branch',tab:'records',q:'',status:'all',level:'all',page:1,pageSize:25,total:0,records:[],counts:{},refs:{units:[],branches:[],businessLines:[]},
  selectedLine:'',selectedBranch:'',assignments:[],treeRecords:[],columns:['name','displayId','code','level','parent','status','updatedAt'],advancedOpen:false,filtersOpen:false,nameFilter:'',codeFilter:'',parentFilter:'',loading:false,error:'',dialog:false,dirty:false,editing:null,dialogMode:'',destroyed:false};

 const columnDefs=[
  {key:'name',label:'Unit Name',locked:true},
  {key:'displayId',label:'System ID',locked:true},
  {key:'code',label:'Unit Code'},
  {key:'level',label:'Level'},
  {key:'parent',label:'Parent Unit'},
  {key:'scope',label:'Scope'},
  {key:'description',label:'Description'},
  {key:'sortOrder',label:'Display Order'},
  {key:'status',label:'Status'},
  {key:'updatedAt',label:'Last Modified'}];
 const columnsKey='saicrm.department.columns.v1';
 try{
  const saved=JSON.parse(localStorage.getItem(columnsKey));
  if(Array.isArray(saved)&&saved.every(k=>columnDefs.some(c=>c.key===k))&&new Set(saved).size===saved.length){
   state.columns=[...new Set(['name','displayId',...saved])];
  }
 }catch{}
 let shell=null,headerHost=null,requestId=0,timer=0;
 const btn=(label,action,cls='')=>'<button type="button" class="dm-btn '+cls+'" data-dm="'+esc(action)+'" aria-label="'+esc(label)+'">'+esc(label)+'</button>';
 const header=()=>{
  if(headerHost)headerHost.remove();
  headerHost=document.createElement('div');headerHost.className='crm-module-host dm-module-host';
  shell=document.createElement('section');
  shell.className='mw-module-header crm-business-module dm-module-header';
  shell.innerHTML=
   '<div class="mw-module-identity"><span class="mw-module-identity-icon" aria-hidden="true">▦</span><h2>Departments</h2></div>'+
   '<nav class="mw-module-tabs" aria-label="Department views">'+
   '<button type="button" class="mw-module-tab" data-mw="home" data-dm="records">Records</button>'+
   '<button type="button" class="mw-module-tab" data-mw="dashboard" data-dm="overview">Overview</button>'+
   '<button type="button" class="mw-module-tab" data-mw="tree" data-dm="tree">Hierarchy</button></nav>'+
   '<div class="scrm-search-slot"></div>'+
   '<div class="mw-header-actions">'+
   '<button type="button" class="mw-btn" data-mw="import" data-dm="import">Import</button>'+
   '<button type="button" class="mw-btn" data-mw="export" data-dm="transfer-export">Export</button>'+
   '<button type="button" class="mw-btn" data-mw="filter-toggle" data-dm="toggle-filters" aria-expanded="false" aria-controls="dm-filter-panel">Filter</button>'+
   '<details class="mw-settings-menu"><summary class="mw-btn" aria-label="Customize Departments">Customize</summary><div>'+
   btn('Arrange Columns','columns')+btn('Transfer History','transfer-history')+btn('Refresh Records','refresh')+
   '</div></details>'+
   '<button type="button" class="mw-btn" data-mw="create" data-dm="create" aria-label="Add Department">Add Department</button></div>';
  headerHost.append(shell);
  const top=document.querySelector('.topbar');
  if(top)top.insertAdjacentElement('afterend',headerHost);else host.prepend(headerHost);
  host.classList.add('mw-module-content');
  shell.addEventListener('click',click);
 };
 const debounceLoad=()=>{clearTimeout(timer);timer=setTimeout(load,300)};
 function renderHeader(){
  if(!shell||state.destroyed)return;
  for(const [tab,action] of [['home','records'],['dashboard','overview'],['tree','tree']]){
   const control=shell.querySelector('[data-dm="'+action+'"]');
   if(!control)continue;
   const selected=state.tab===action;control.classList.toggle('mw-active-tab',selected);
   if(selected)control.setAttribute('aria-current','page');else control.removeAttribute('aria-current');
  }
  const toggle=shell.querySelector('[data-dm="toggle-filters"]');
  if(toggle){toggle.setAttribute('aria-expanded',String(state.filtersOpen));toggle.classList.toggle('dm-chosen',state.filtersOpen);}
  const add=shell.querySelector('[data-dm="create"]');
  if(add)add.disabled=state.loading;
 }
 const statusTag=s=>'<span class="dm-tag dm-'+esc(s).toLowerCase()+'">'+esc(s)+'</span>';
 const table=rows=>{
  const columns=state.columns.map(k=>columnDefs.find(c=>c.key===k)).filter(Boolean);
  const cell=(r,k)=>k==='name'?'<strong>'+esc(r.name)+'</strong>':k==='status'?statusTag(r.status):
    k==='updatedAt'?esc(r.updatedAt?new Date(r.updatedAt).toLocaleString():'—'):
    esc(r[k]??'—');
  return '<div class="dm-table-wrap"><table class="dm-table"><thead><tr>'+
   columns.map(c=>'<th data-column-key="'+esc(c.key)+'">'+esc(c.label)+'</th>').join('')+
   '<th class="dm-actions-col">Actions</th></tr></thead><tbody>'+
   (rows.length?rows.map(r=>'<tr>'+
    columns.map(c=>'<td data-column-key="'+esc(c.key)+'">'+cell(r,c.key)+'</td>').join('')+
    '<td class="dm-actions-col">'+btn('View','view:'+r.id)+btn('Edit','edit:'+r.id)+btn('Status','lifecycle:'+r.id)+'</td></tr>').join(''):
    '<tr><td colspan="'+(columns.length+1)+'" class="dm-empty">No matching departments. Create the first record or change your filters.</td></tr>')+
   '</tbody></table></div>';
 };

 function controls(){
  const options=(values,value,allLabel)=>values.map(v=>'<option value="'+esc(v)+'" '+(v===value?'selected':'')+'>'+esc(v==='all'?allLabel:v)+'</option>').join('');
  const lines=state.refs.businessLines||[],branches=state.refs.branches||[];
  const parents=(state.refs.units||[]).filter(u=>u.scope===state.scope);
  return '<section id="dm-filter-panel" class="dm-filter-panel" aria-label="Filter Department records">'+
   '<div class="dm-filter-heading"><div><strong>Filters</strong><small>Apply to Records, Overview and Hierarchy</small></div>'+
   btn('Clear all filters','clear')+'</div>'+
   '<div class="dm-filters"><label>Status<select id="dm-status">'+options(['all','Active','Inactive','Archived','Deleted'],state.status,'All statuses')+'</select></label>'+
   '<label>Level<select id="dm-level">'+options(['all','Department','Sub-Department','Team'],state.level,'All levels')+'</select></label>'+
   (state.scope==='Branch'?'<label>Business Line<select id="dm-line"><option value="">All Business Lines</option>'+lines.map(x=>'<option value="'+esc(x.id)+'" '+(state.selectedLine===x.id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label>'+
   '<label>Branch<select id="dm-branch"><option value="">All Branches</option>'+branches.filter(b=>!state.selectedLine||b.businessLineRef===state.selectedLine).map(b=>'<option value="'+esc(b.id)+'" '+(state.selectedBranch===b.id?'selected':'')+'>'+esc(b.name)+' · '+esc(b.code)+'</option>').join('')+'</select></label>':'')+
   btn(state.advancedOpen?'Hide Advanced':'Advanced Filters','advanced',state.advancedOpen?'dm-chosen':'')+'</div>'+
   (state.advancedOpen?'<div class="dm-advanced-filters"><label>Unit Name contains<input id="dm-advanced-name" maxlength="150" value="'+esc(state.nameFilter)+'"></label>'+
   '<label>Unit Code contains<input id="dm-advanced-code" maxlength="30" value="'+esc(state.codeFilter)+'"></label>'+
   '<label>Parent Unit<select id="dm-advanced-parent"><option value="">Any Parent</option>'+
   parents.map(p=>'<option value="'+esc(p.id)+'" '+(state.parentFilter===p.id?'selected':'')+'>'+esc(p.name+' · '+p.level)+'</option>').join('')+
   '</select></label>'+btn('Apply filters','apply-advanced','dm-primary-action')+'</div>':'')+'</section>';
 }
 function scopePanel(){
  const branch=state.scope==='Branch';
  return '<section class="dm-scope-panel" aria-label="Department catalog scope">'+
   '<div class="dm-scope-switch" role="group" aria-label="Catalog">'+
   btn('Central Department','central',!branch?'dm-chosen':'')+
   btn('Branch Department','branch',branch?'dm-chosen':'')+'</div>'+
   '<div class="dm-scope-note">'+(branch?'Shared Branch Department definitions; assign the same unit independently to eligible Branches.':'Central Departments are independent of Branch assignments.')+'</div>'+
   (branch?'<div class="dm-scope-actions">'+btn('Assign to Branch','assign')+btn('Manage Assignments','manage-assignments')+'</div>':'')+
   '</section>';
 }
 const rows=()=>state.tab==='tree'?state.treeRecords:state.records;
 const tree=()=>{
  const matched=rows(),ids=new Set(matched.map(r=>r.id)),byParent=new Map();
  for(const row of matched){const k=row.parentId&&ids.has(row.parentId)?row.parentId:'root';if(!byParent.has(k))byParent.set(k,[]);byParent.get(k).push(row)}
  const draw=(parent,depth)=> (byParent.get(parent)||[]).map(x=>'<div class="dm-tree-node" style="margin-left:'+Math.min(depth*22,66)+'px"><button data-dm="view:'+esc(x.id)+'" type="button"><span class="dm-tree-glyph">'+(depth===0?'▦':depth===1?'◫':'◉')+'</span> <strong>'+esc(x.name)+'</strong><small>'+esc(x.level)+' · '+esc(x.code)+'</small>'+statusTag(x.status)+'</button></div>'+draw(x.id,depth+1)).join('');
  const output=draw('root',0);
  return '<div class="dm-panel"><h3>Department hierarchy</h3><p class="dm-hint">Tree loads all matching units, including additional pages. Search and status filters apply.</p>'+(output||'<div class="dm-empty-state"><strong>'+(state.q||state.status!=='all'||state.level!=='all'||state.nameFilter||state.codeFilter||state.parentFilter||state.selectedBranch||state.selectedLine?'No matching hierarchy units':'Your '+esc(state.scope)+' Department hierarchy is empty')+'</strong><p>'+(state.q||state.status!=='all'||state.level!=='all'||state.nameFilter||state.codeFilter||state.parentFilter||state.selectedBranch||state.selectedLine?'Try clearing the current filters.':'Create a Department first, then add Sub-Departments and Teams under it.')+'</p>'+btn('Add Department','create','dm-primary-action')+'</div>')+'</div>';
 };
 function overview(){
  const c=state.counts||{};
  return '<div class="dm-metrics">'+[['All units',c.total],['Active',c.active],['Inactive',c.inactive],['Archived',c.archived],['Deleted',c.deleted]].map(([n,v])=>'<article class="dm-metric"><span>'+n+'</span><strong>'+fmt(v)+'</strong></article>').join('')+'</div><div class="dm-panel"><h3>Department Overview</h3><p>Counts reflect the current catalog, search, and filters. Central and Branch catalogs remain separate; Branch assignments are not employee counts.</p>'+btn('View records','records')+'</div>';
 }
 const render=()=>{
  if(state.destroyed)return;
  renderHeader();
  const scope=scopePanel(),title='<div class="dm-content-heading"><div><small>ADMINISTRATION / CORE MASTERS</small><h2>'+esc(state.scope)+' Departments</h2><p>Department → Sub-Department → Team</p></div></div>';
  const empty=state.loading?'<p class="dm-loading" role="status">Loading Departments…</p>':state.tab==='overview'?overview():state.tab==='tree'?tree():table(rows())+
   '<footer class="dm-page"><span>'+fmt(state.total)+' matching records · Page '+state.page+' of '+Math.max(1,Math.ceil(state.total/state.pageSize))+'</span><label class="dm-page-size-label">Rows per page<select id="dm-page-size">'+[25,50,75,100].map(n=>'<option value="'+n+'" '+(n===state.pageSize?'selected':'')+'>'+n+'</option>').join('')+'</select></label>'+btn('Previous','prev')+btn('Next','next')+'</footer>';
  host.innerHTML='<div class="dm-workspace">'+scope+title+
   (state.error?'<div role="alert" class="dm-error">'+esc(state.error)+'</div>':'')+
   (state.filtersOpen?controls():'')+
   (!state.filtersOpen&&(state.q||state.status!=='all'||state.level!=='all'||state.nameFilter||state.codeFilter||state.parentFilter||state.selectedLine||state.selectedBranch)?
    '<div class="dm-filter-summary"><span>Filters active · '+fmt(state.total)+' matching units</span>'+btn('Clear filters','clear')+btn('Show filters','toggle-filters')+'</div>':'')+
   '<div class="dm-main-panel">'+empty+'</div></div>';
  host.querySelectorAll('select').forEach(select=>select.addEventListener('change',e=>{
   if(e.target.id==='dm-line'){state.selectedLine=e.target.value;state.selectedBranch='';}
   if(e.target.id==='dm-branch')state.selectedBranch=e.target.value;
   if(e.target.id==='dm-status')state.status=e.target.value;
   if(e.target.id==='dm-level')state.level=e.target.value;
   if(e.target.id==='dm-page-size')state.pageSize=Number(e.target.value)||25;
   if(e.target.id==='dm-advanced-parent')return;
   state.page=1;load();
  }));
 };
 async function references(){try{const data=await api('department-master/references');state.refs={units:data.units||[],branches:data.branches||[],businessLines:data.businessLines||[]}}catch(e){state.error=e.message}}
 function appendAdvancedFilters(query){
  if(state.selectedBranch)query.set('branchId',state.selectedBranch);
  if(state.selectedLine&&state.scope==='Branch')query.set('businessLineId',state.selectedLine);
  if(state.nameFilter)query.set('name',state.nameFilter);
  if(state.codeFilter)query.set('code',state.codeFilter);
  if(state.parentFilter)query.set('parentId',state.parentFilter);
  return query;
 }
 async function load(){
  const id=++requestId;state.loading=true;render();
  try{
   const q=new URLSearchParams({scope:state.scope,q:state.q,status:state.status,level:state.level,page:String(state.page),pageSize:String(state.pageSize)});
   appendAdvancedFilters(q);
   const data=await api('department-master?'+q);
   if(id!==requestId||state.destroyed)return;
   state.records=data.records||[];state.total=data.total||0;state.counts=data.counts||{};state.page=data.page||state.page;
   if(state.tab==='tree'){
    const treeQuery=new URLSearchParams({scope:state.scope,q:state.q,status:state.status,level:state.level,page:'1',pageSize:'100'});
    appendAdvancedFilters(treeQuery);
    const first=await api('department-master?'+treeQuery);
    if(Number(first.total||0)>10000)throw new Error('Tree view supports up to 10,000 matching units. Narrow your filters.');
    const all=[...(first.records||[])],total=Number(first.total||0);
    for(let p=2;all.length<total;p++){
     treeQuery.set('page',String(p));
     const next=await api('department-master?'+treeQuery);
     if(!Array.isArray(next.records)||!next.records.length)throw new Error('Could not load full Department hierarchy');
     all.push(...next.records);
    }
    if(id!==requestId||state.destroyed)return;
    state.treeRecords=all;
   }else state.treeRecords=[];
   state.error='';
  }catch(e){if(id===requestId){state.treeRecords=[];state.error=e.message||'Could not load departments'}}
  finally{if(id===requestId){state.loading=false;render()}}
 }
 const field=(label,key,value='',type='text',options=null,disabled=false)=>'<label>'+esc(label)+(options?'<select name="'+key+'" '+(disabled?'disabled':'')+'>'+options.map(([k,v])=>'<option value="'+esc(k)+'" '+(String(value)===String(k)?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select>':
  type==='textarea'?'<textarea name="'+key+'" '+(disabled?'disabled':'')+'>'+esc(value)+'</textarea>':'<input name="'+key+'" type="'+type+'" value="'+esc(value)+'" '+(disabled?'disabled':'')+'>')+'</label>';
 function dismissModal(wrap){
  if(!wrap)return;
  try{if(wrap.open)wrap.close();}catch{}
  wrap.remove();
  state.dialog=Boolean(document.querySelector('.dm-modal-backdrop'));
  if(!state.dialog)state.dirty=false;
 }
 function notify(message,kind='success'){
  let stack=document.getElementById('r10-toast-stack');
  if(!stack){stack=document.createElement('div');stack.id='r10-toast-stack';stack.setAttribute('aria-live','polite');document.body.append(stack);}
  const toast=document.createElement('div');toast.className='r10-toast r10-'+(kind==='error'?'error':'success');
  toast.setAttribute('role',kind==='error'?'alert':'status');
  toast.innerHTML='<span class="r10-toast-icon" aria-hidden="true">'+(kind==='error'?'!':'✓')+'</span><strong>'+esc(message)+'</strong><button type="button" aria-label="Close notification">×</button>';
  stack.append(toast);
  const close=()=>{toast.remove();if(!stack.children.length)stack.remove()};
  toast.querySelector('button').onclick=close;setTimeout(close,4500);
 }
 function openModal(title,contents,onSave=null){
  state.dialog=true;state.dirty=false;
  const wrap=document.createElement('dialog');wrap.className='dm-modal-backdrop dm-native-dialog';
  wrap.setAttribute('aria-label',title);
  wrap.innerHTML='<section class="dm-dialog" role="document"><header>'+
   '<div class="dm-dialog-heading"><small>SAI-CRM · DEPARTMENT MASTER</small><h2>'+esc(title)+'</h2></div>'+
   '<button type="button" class="dm-modal-close" aria-label="Close '+esc(title)+'">×</button></header>'+
   '<div class="dm-dialog-body">'+contents+'</div>'+
   '<footer><button type="button" class="dm-modal-cancel">'+(onSave?'Cancel':'Close')+'</button>'+
   (onSave?'<button type="submit" form="dm-form" class="dm-btn dm-primary-action">Save changes</button>':'')+'</footer></section>';
  document.body.append(wrap);
  wrap.showModal();
  let saving=false;
  const close=()=>{if(saving)return;if(state.dirty&&!confirm('Discard unsaved changes?'))return;dismissModal(wrap);};
  wrap._dmClose=close;
  wrap.querySelector('.dm-modal-close').onclick=close;wrap.querySelector('.dm-modal-cancel').onclick=close;
  wrap.addEventListener('cancel',event=>{event.preventDefault();close()});
  wrap.addEventListener('click',event=>{if(event.target===wrap)close()});
  const form=wrap.querySelector('#dm-form');
  if(form&&onSave){
   form.addEventListener('input',()=>{state.dirty=true});
   form.addEventListener('change',()=>{state.dirty=true});
   form.onsubmit=async event=>{
    event.preventDefault();if(saving||!form.reportValidity())return;
    const button=wrap.querySelector('button[type="submit"]');
    saving=true;button.disabled=true;
    try{
     await onSave(Object.fromEntries(new FormData(form)));
     state.dirty=false;dismissModal(wrap);
     await references();await load();
     notify('Department changes saved successfully');
    }catch(error){
     const notice=wrap.querySelector('.dm-dialog-notice')||wrap.querySelector('.dm-dialog-body');
     notice.textContent=error?.message||'The change could not be saved.';
     if(notice.matches('.dm-dialog-notice'))notice.hidden=false;
    }finally{saving=false;if(button.isConnected)button.disabled=false}
   };
  }
  return wrap;
 }
 function readItem(label,value){
  return '<div class="dm-read-item"><span>'+esc(label)+'</span><strong>'+esc(value==null||value===''?'—':value)+'</strong></div>';
 }
 function entry(label,key,value='',options={}){
  const {required=false,max=0,disabled=false,type='text',values=null,help='',min=null,maxNumber=null}=options;
  const requiredText=required?' <span class="dm-required" aria-label="required">*</span>':'';
  const attributes=(required?' required':'')+(disabled?' disabled':'')+(max?' maxlength="'+max+'"':'')+
   (min!=null?' min="'+min+'"':'')+(maxNumber!=null?' max="'+maxNumber+'"':'');
  const control=values?'<select name="'+esc(key)+'" id="dm-field-'+esc(key)+'"'+attributes+'>'+
     values.map(([v,t])=>'<option value="'+esc(v)+'"'+(String(value)===String(v)?' selected':'')+'>'+esc(t)+'</option>').join('')+'</select>':
   type==='textarea'?'<textarea name="'+esc(key)+'" id="dm-field-'+esc(key)+'"'+attributes+'>'+esc(value)+'</textarea>':
   '<input type="'+esc(type)+'" name="'+esc(key)+'" id="dm-field-'+esc(key)+'" value="'+esc(value)+'"'+attributes+'>';
  return '<div class="dm-form-field"><label for="dm-field-'+esc(key)+'">'+esc(label)+requiredText+'</label>'+
   '<div class="dm-form-control">'+control+(help?'<small>'+esc(help)+'</small>':'')+'</div></div>';
 }
 async function editor(id='',readonly=false){
  let record=null;
  if(id){try{record=(await api('department-master/'+id)).record;}catch(error){notify(error.message||'Unable to open Department','error');return;}}
  if(record&&['Archived','Deleted'].includes(record.status)&&!readonly){notify('Restore this unit before editing','error');return;}
  const scope=record?.scope||state.scope,level=record?.level||'Department';
  const status=record?.status||'Active';
  const readSection=(heading,items)=>'<section class="dm-form-section"><details open><summary>'+esc(heading)+'</summary><div class="dm-detail-grid">'+items+'</div></details></section>';
  if(readonly){
   const contents='<div class="dm-detail-summary"><div><small>'+esc(record.displayId)+'</small><h3>'+esc(record.name)+'</h3><p>'+esc(record.scope)+' · '+esc(record.level)+'</p></div>'+statusTag(record.status)+'</div>'+
    readSection('Unit Information',[
     readItem('Unit Name',record.name),readItem('Unit Code',record.code),
     readItem('System ID',record.displayId),readItem('Description',record.description)
    ].join(''))+
    readSection('Hierarchy & Organization',[
     readItem('Catalog',record.scope),readItem('Level',record.level),
     readItem('Parent Unit',record.parent?(record.parent+' · '+record.parentDisplayId):'None'),
     readItem('Display Order',record.sortOrder)
    ].join(''))+
    readSection('Status & Audit',[
     readItem('Record Status',record.status),readItem('Created By',record.createdBy),
     readItem('Created At',record.createdAt?new Date(record.createdAt).toLocaleString():'—'),
     readItem('Last Modified By',record.updatedBy),
     readItem('Last Modified At',record.updatedAt?new Date(record.updatedAt).toLocaleString():'—')
    ].join(''))+
    '<div class="dm-detail-actions">'+(status==='Active'||status==='Inactive'?btn('Edit Department','detail-edit:'+id,'dm-primary-action'):'')+
     btn('Related / Used In','related:'+id)+btn('Audit History','history:'+id)+'</div>';
   const h=openModal('Department Details',contents);
   h.querySelector('.dm-detail-actions').addEventListener('click',async event=>{
    const button=event.target.closest('[data-dm]');if(!button)return;
    event.stopPropagation();
    const [action,target]=button.dataset.dm.split(':');dismissModal(h);
    if(action==='detail-edit')await editor(target);
    else await showDetails(target,action);
   });
   return;
  }
  const eligibleParents=targetLevel=>(state.refs.units||[]).filter(unit=>
   unit.scope===scope&&unit.status==='Active'&&unit.id!==id&&
   (targetLevel==='Sub-Department'?unit.level==='Department':targetLevel==='Team'&&['Department','Sub-Department'].includes(unit.level)));
  const parentValues=[['','Select parent unit'],...eligibleParents(level).map(unit=>[unit.id,unit.name+' ('+unit.level+')'])];
  const values=record||{name:'',code:'',description:'',sortOrder:100,parentId:'',status:'Active'};
  const locked=Boolean(record),isChild=level!=='Department';
  const section=(heading,items)=>'<section class="dm-form-section"><details open><summary>'+esc(heading)+'</summary><div class="dm-form-grid">'+items+'</div></details></section>';
  const content='<form id="dm-form" class="dm-form">'+
   section('Department Information',
    entry('Department / Unit Name','name',values.name,{required:true,max:150})+
    entry('Department / Unit Code','code',values.code,{required:true,max:30,help:'2–30 uppercase letters, numbers or hyphens'})+
    '<div class="dm-full">'+entry('Description','description',values.description||'',{type:'textarea',max:1000})+'</div>')+
   section('Hierarchy & Organization',
    entry('Organizational Scope','scope',scope,{values:[['Central','Central'],['Branch','Branch']],disabled:true})+
    entry('Level','level',level,{values:['Department','Sub-Department','Team'].map(x=>[x,x]),disabled:locked})+
    entry('Parent Unit','parentId',values.parentId||'',{values:parentValues,disabled:locked||!isChild,required:!locked&&isChild,help:locked?'Parent changes require an audited reorganization.':'Parent must be Active and in the same catalog.'})+
    entry('Display Order','sortOrder',values.sortOrder,{type:'number',min:1,maxNumber:999999,required:true}))+
   (locked?section('Status & Audit',
     entry('Status','status',status,{values:[['Active','Active'],['Inactive','Inactive']]})+
     entry('Reason for status change','reason','',{type:'textarea',max:500})+
     '<div class="dm-full dm-audit-summary">System ID: '+esc(record.displayId)+' · Last Modified: '+esc(record.updatedAt?new Date(record.updatedAt).toLocaleString():'—')+'</div>'):'')+
   '<p class="dm-dialog-notice" role="alert" hidden></p></form>';
  const dialog=openModal(locked?'Edit Department':'Create Department',content,async data=>{
   const nextLevel=locked?level:data.level,nextParent=locked?record.parentId:(nextLevel==='Department'?null:data.parentId);
   const req={name:String(data.name||'').trim(),code:String(data.code||'').trim().toUpperCase(),
    description:String(data.description||'').trim(),sortOrder:Number(data.sortOrder)};
   if(!req.name||!/^[A-Z0-9][A-Z0-9-]{1,29}$/.test(req.code))throw Error('Enter a Unit Name and a valid 2–30 character Unit Code.');
   if(locked){
    req.version=record.version;req.status=data.status;
    if(data.status!==record.status&&!String(data.reason||'').trim())throw Error('A reason is mandatory when changing status.');
    if(data.status!==record.status)req.reason=String(data.reason).trim();
   }else{
    req.scope=scope;req.level=nextLevel;req.parentId=nextParent;
    if(nextLevel!=='Department'&&!nextParent)throw Error('Choose an Active parent unit for a '+nextLevel+'.');
   }
   await api('department-master'+(id?'/'+id:''),id?'PUT':'POST',req);
  });
  const form=dialog.querySelector('#dm-form');
  const levelInput=form.querySelector('[name="level"]'),parentInput=form.querySelector('[name="parentId"]');
  const statusInput=form.querySelector('[name="status"]'),reasonInput=form.querySelector('[name="reason"]');
  const codeInput=form.querySelector('[name="code"]');
  codeInput.addEventListener('input',()=>{const start=codeInput.selectionStart;codeInput.value=codeInput.value.toUpperCase();try{codeInput.setSelectionRange(start,start);}catch{}});
  codeInput.setAttribute('pattern','[A-Za-z0-9][A-Za-z0-9-]{1,29}');
  const updateParent=()=>{
   if(locked||!parentInput)return;
   const chosen=levelInput.value,available=eligibleParents(chosen);
   parentInput.innerHTML='<option value="">'+(chosen==='Department'?'No parent needed':'Select an Active parent')+'</option>'+
    available.map(unit=>'<option value="'+esc(unit.id)+'">'+esc(unit.name+' ('+unit.level+')')+'</option>').join('');
   parentInput.disabled=chosen==='Department';parentInput.required=chosen!=='Department';
   parentInput.closest('.dm-form-field').hidden=chosen==='Department';
   const help=parentInput.closest('.dm-form-control').querySelector('small');
   if(help&&chosen!=='Department')help.textContent=available.length?'Only eligible Active units can be selected.':'Create an Active parent Department first.';
  };
  const updateStatus=()=>{
   if(!reasonInput||!statusInput)return;
   const changed=statusInput.value!==record.status;
   reasonInput.closest('.dm-form-field').hidden=!changed;
   reasonInput.required=changed;
   if(!changed)reasonInput.value='';
  };
  if(!locked){updateParent();levelInput.addEventListener('change',()=>{updateParent();state.dirty=true;});}
  else updateStatus();
  statusInput?.addEventListener('change',updateStatus);
  form.querySelector('[name="name"]')?.focus();
 }
 async function showDetails(id,mode){
  try{
   const data=await api('department-master/'+id+'/'+mode);
   let html;
   if(mode==='related'){
    const usage=data.related||{},child=usage.childUnits||{},assignments=usage.branchAssignments||{};
    const metric=(label,total,active)=>'<div class="dm-related-metric"><span>'+esc(label)+'</span><strong>'+fmt(total)+'</strong><small>'+fmt(active)+' active</small></div>';
    html='<p class="dm-hint">Dependencies are retained for audit. Active dependencies block inactivation and archiving; all historical links block deletion.</p>'+
     '<div class="dm-related-grid">'+metric('Child Units',child.total,child.active)+metric('Branch Assignments',assignments.total,assignments.active)+'</div>';
    if(Number(usage.total||0)===0)html+='<p class="dm-empty-state">This unit has no linked child units or Branch assignments.</p>';
   }else{
    const history=data.history||[];
    html=history.length?'<div class="dm-table-wrap"><table class="dm-table dm-history-table"><thead><tr><th>Date / Time</th><th>Action</th><th>By</th><th>Reason</th></tr></thead><tbody>'+
     history.map(item=>'<tr><td>'+esc(item.createdAt?new Date(item.createdAt).toLocaleString():'—')+'</td><td>'+esc(item.action)+'</td><td>'+esc(item.actor||'—')+'</td><td>'+esc(item.reason||'—')+'</td></tr>').join('')+'</tbody></table></div>':
     '<div class="dm-empty-state"><strong>No history recorded yet</strong><p>Changes will appear here after a Department record is created or updated.</p></div>';
   }
   openModal(mode==='related'?'Related / Used In':'Audit History',html);
  }catch(error){notify(error.message||'Could not load Department details','error');}
 }
 async function branchAssign(){
  if(state.scope!=='Branch'){alert('Central Department assignments are managed separately from Branches.');return}
  const refs=state.refs,units=refs.units.filter(x=>x.scope==='Branch'&&x.status==='Active'),lines=refs.businessLines,branches=refs.branches;
  const html='<form id="dm-form" class="dm-form">'+field('Business Line','businessLine','', 'text',[['','Select Business Line'],...lines.map(x=>[x.id,x.name])])+
   field('Branch','branchId','','text',[['','Select Branch'],...branches.map(b=>[b.id,b.name+' · '+b.code])])+
   field('Department / Unit','unitId','','text',[['','Select Unit'],...units.map(x=>[x.id,x.name+' ('+x.level+')'])])+
   '<p class="dm-hint">Activate parent units in the same Branch before activating child units. Assignments never connect different Branch identities.</p><p class="dm-dialog-notice" role="alert" hidden></p></form>';
  const dialog=openModal('Assign Department to Branch',html,async v=>{await api('department-master/assignments','POST',{unitId:v.unitId,branchId:v.branchId})});
  const line=dialog.querySelector('[name="businessLine"]'),branch=dialog.querySelector('[name="branchId"]');
  line.onchange=()=>{branch.innerHTML='<option value="">Select Branch</option>'+branches.filter(b=>b.businessLineRef===line.value).map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+' · '+esc(b.code)+'</option>').join('');state.dirty=true;};
  branch.innerHTML='<option value="">Select a Business Line first</option>';
 }
 async function lifecycle(id){
  let record;try{record=(await api('department-master/'+id)).record}catch(e){alert(e.message);return}
  const options=record.status==='Active'?[['Inactive','Inactivate']]:
    record.status==='Inactive'?[['Active','Activate'],['Archived','Archive']]:
    record.status==='Archived'?[['Active','Restore Active'],['Inactive','Restore Inactive'],['Deleted','Delete']]:
    record.status==='Deleted'?[['Archived','Recover Archived'],['Inactive','Recover Inactive'],['Active','Recover Active']]:[];
  const html='<form id="dm-form" class="dm-form">'+field('Choose lifecycle action','destination',options[0]?.[0]||'', 'text',options)+
  field('Reason','reason','','textarea')+'<p class="dm-hint">Linked children and Branch assignments can block this action.</p><p class="dm-dialog-notice" role="alert" hidden></p></form>';
  openModal('Change status · '+record.name,html,async values=>{
   const target=values.destination,reason=values.reason;
   if(!reason.trim())throw Error('A reason is required');
   if(['Active','Inactive'].includes(record.status)){if(target==='Archived'){
    await api('department-master/'+id+'/archive','POST',{version:record.version,reason});return}
    await api('department-master/'+id,'PUT',{version:record.version,status:target,reason});return}
   if(record.status==='Archived'){
    if(target==='Deleted'){await api('department-master/'+id+'/soft-delete','POST',{version:record.version,reason});return}
    await api('department-master/'+id+'/restore','POST',{version:record.version,targetStatus:target,reason});return}
   await api('department-master/'+id+'/restore-deleted','POST',{version:record.version,targetStatus:target,reason});
  });
 }
 async function manageAssignments(){
  if(state.scope!=='Branch'){alert('Central units do not have Branch assignments');return}
  let list;try{list=(await api('department-master/assignments')).assignments||[]}catch(e){alert(e.message);return}
  const values=list.map(x=>'<tr><td>'+esc(x.unit)+' ('+esc(x.unitDisplayId)+')</td><td>'+esc(x.branch)+'</td><td>'+esc(x.businessLine)+'</td><td>'+statusTag(x.status)+'</td><td>'+btn(x.status==='Active'?'Inactivate':'Activate','assignment:'+x.id)+'</td></tr>').join('');
  const h=openModal('Branch Department Assignments','<div class="dm-table-wrap"><table class="dm-table"><thead><tr><th>Department Unit</th><th>Branch</th><th>Business Line</th><th>Status</th><th>Action</th></tr></thead><tbody>'+values+'</tbody></table></div>');
  h.querySelector('.dm-dialog-body').addEventListener('click',async e=>{
   const b=e.target.closest('[data-dm^="assignment:"]');if(!b)return;const x=list.find(v=>v.id===b.dataset.dm.split(':')[1]);if(!x)return;
   const reason=prompt('Reason to '+(x.status==='Active'?'inactivate':'activate')+' this Branch assignment:');
   if(!reason)return;
   try{await api('department-master/assignments/'+x.id,'PUT',{version:x.version,status:x.status==='Active'?'Inactive':'Active',reason});dismissModal(h);await manageAssignments();}
   catch(err){alert(err.message)}
  });
 }

 function saveTransfer(file){
  const bytes=Uint8Array.from(atob(file.data),c=>c.charCodeAt(0));
  const url=URL.createObjectURL(new Blob([bytes],{type:file.mime||'application/octet-stream'}));
  const link=document.createElement('a');link.href=url;link.download=file.filename||'department-export';
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 function transferFilters(){
  const q=new URLSearchParams({scope:state.scope,q:state.q,status:state.status,level:state.level});
  appendAdvancedFilters(q);return Object.fromEntries(q);
 }
 function transferExport(){
  const h=openModal('Export Departments',
   '<p class="dm-hint">Export all matching authorized Departments, not just the displayed page. Large exports are divided into downloadable parts.</p>'+
   '<div class="dm-transfer-options"><label>Format<select id="dm-export-format"><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV (.csv)</option></select></label>'+
   '<label>Columns<select id="dm-export-cols"><option value="visible">Visible columns</option><option value="all">All Department fields</option></select></label></div>'+
   '<button type="button" class="dm-btn dm-primary-action" id="dm-export-start">Create export</button>'+
   '<div class="dm-transfer-status" role="status"></div>');
  const area=h.querySelector('.dm-transfer-status');
  h.querySelector('#dm-export-start').onclick=async event=>{
   const b=event.currentTarget;b.disabled=true;area.textContent='Preparing export...';
   try{
    const format=h.querySelector('#dm-export-format').value;
    const selection=h.querySelector('#dm-export-cols').value;
    const cols=selection==='all'?columnDefs.map(c=>c.key):state.columns;
    const result=await api('department-master/exports','POST',{format,columns:cols,filters:transferFilters()});
    const parts=Number(result.files||0);
    area.innerHTML='<p>Export ready: '+fmt(result.count)+' matching records in '+parts+' part(s).</p>'+
     Array.from({length:parts},(_,i)=>'<button type="button" class="dm-btn" data-dm-export-part="'+(i+1)+'">Download part '+(i+1)+'</button>').join('');
    area.dataset.job=result.job.id;
   }catch(error){area.textContent=error.message||'Export failed';}
   finally{b.disabled=false;}
  };
  area.addEventListener('click',async event=>{
   const b=event.target.closest('[data-dm-export-part]');if(!b)return;
   b.disabled=true;try{saveTransfer(await api('department-master/jobs/'+area.dataset.job+'/file?part='+b.dataset.dmExportPart));}
   catch(error){alert(error.message||'Download failed');}finally{b.disabled=false;}
  });
 }
 function transferImport(){
  const h=openModal('Import Departments','<p class="dm-hint">Only Super Admins can import. Preview and validate all rows before creating records. Existing Unit Codes can be skipped; existing Departments will not be overwritten.</p>'+
   '<div class="dm-transfer-options"><label>File (.csv or .xlsx; up to 2 MB)<input type="file" id="dm-import-file" accept=".csv,.xlsx"></label>'+
   '<label>Catalog<select id="dm-import-scope"><option value="Branch">Branch Department</option><option value="Central">Central Department</option></select></label>'+
   '<label>Existing Unit Code<select id="dm-import-duplicates"><option value="skip">Skip existing records</option><option value="reject">Reject duplicate rows</option></select></label>'+
   '<label><input type="checkbox" id="dm-import-atomic"> All-or-nothing transaction (up to 250 rows)</label></div>'+
   '<button type="button" class="dm-btn" id="dm-import-template">Download CSV template</button>'+
   '<button type="button" class="dm-btn dm-primary-action" id="dm-import-analyze">Analyze file</button>'+
   '<div id="dm-import-mapping"></div><div class="dm-transfer-status" role="status"></div>');
  h.querySelector('#dm-import-scope').value=state.scope;
  const area=h.querySelector('.dm-transfer-status'),mappingBox=h.querySelector('#dm-import-mapping');
  let jobId='',validated=false;
  const mappingFields=[['name','Unit Name'],['code','Unit Code'],['level','Level'],['parentCode','Parent Unit Code'],['description','Description'],['sortOrder','Display Order']];
  h.querySelector('#dm-import-template').onclick=()=>{
   const header=mappingFields.map(([,label])=>'"'+label+'"').join(',');
   const example='"Operations","OPS","Department","","Operations team","100"';
   const blob=new Blob(['\uFEFF'+header+'\r\n'+example+'\r\n'],{type:'text/csv;charset=utf-8'});
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='department-import-template.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  };
  const setError=error=>{area.textContent=error?.message||String(error)||'Transfer failed';};
  h.querySelector('#dm-import-analyze').onclick=async event=>{
   const b=event.currentTarget,file=h.querySelector('#dm-import-file').files?.[0];
   if(!file){area.textContent='Choose a CSV or XLSX file first';return;}
   if(file.size>2*1024*1024){area.textContent='File exceeds 2 MB upload limit';return;}
   b.disabled=true;area.textContent='Reading and analyzing file...';mappingBox.innerHTML='';validated=false;
   try{
    const data=await new Promise((resolve,reject)=>{
     const reader=new FileReader();reader.onerror=()=>reject(Error('Could not read file'));
     reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');reader.readAsDataURL(file);
    });
    const result=await api('department-master/imports/analyze','POST',{filename:file.name,data});
    jobId=result.job.id;
    const headers=result.headers||[];
    mappingBox.innerHTML='<h3>Map file columns</h3><div class="dm-transfer-options">'+mappingFields.map(([key,label])=>{
     const selected=result.recommended?.[key];
     return '<label>'+esc(label)+'<select data-dm-map="'+esc(key)+'"><option value="">Not mapped</option>'+
      headers.map((name,index)=>'<option value="'+index+'" '+(selected===index?'selected':'')+'>'+esc(name)+'</option>').join('')+
      '</select></label>';
    }).join('')+'</div><button type="button" class="dm-btn dm-primary-action" id="dm-import-validate">Validate rows</button>'+
    '<button type="button" class="dm-btn" id="dm-import-commit" disabled>Import validated records</button>';
    area.textContent=fmt(result.job.total)+' rows analyzed. Map Unit Name, Unit Code and Level before validation.'+
     (result.reused?' Existing identical upload was reused.':'');
   }catch(error){setError(error);}finally{b.disabled=false;}
  };
  mappingBox.addEventListener('change',()=>{validated=false;const commit=h.querySelector('#dm-import-commit');if(commit)commit.disabled=true;});
  mappingBox.addEventListener('click',async event=>{
   const validateButton=event.target.closest('#dm-import-validate'),commitButton=event.target.closest('#dm-import-commit');
   if(validateButton){
    validateButton.disabled=true;area.textContent='Validating import rows...';
    try{
     const mapping={};for(const element of mappingBox.querySelectorAll('[data-dm-map]')){
      if(element.value!=='')mapping[element.dataset.dmMap]=Number(element.value);
     }
     const result=await api('department-master/imports/'+jobId+'/validate','POST',{
      mapping,scope:h.querySelector('#dm-import-scope').value,atomic:h.querySelector('#dm-import-atomic').checked,
      duplicates:h.querySelector('#dm-import-duplicates').value
     });
     validated=true;const commit=h.querySelector('#dm-import-commit');commit.disabled=!result.valid;
     const errors=(result.errors||[]).slice(0,15).map(x=>'Row '+esc(x.row)+': '+esc(x.message)).join('; ');
     area.innerHTML='<p>Validated: '+fmt(result.valid)+' ready, '+fmt(result.invalid)+' invalid, '+fmt(result.skipped)+' skipped.</p>'+
      (errors?'<p class="dm-error">'+errors+'</p>':'')+
      '<p class="dm-hint">Review this result before importing. Re-upload a corrected file for rejected rows.</p>';
    }catch(error){setError(error);}finally{validateButton.disabled=false;}
   }
   if(commitButton){
    if(!validated||!jobId)return;commitButton.disabled=true;area.textContent='Importing validated Departments...';
    try{
     const result=await api('department-master/jobs/'+jobId+'/start','POST',{});
     area.innerHTML='<p>Import '+esc(result.job.status)+': '+fmt(result.job.succeeded)+' created, '+
      fmt(result.job.failed)+' failed, '+fmt(result.job.skipped)+' skipped.</p>';
     await references();await load();
    }catch(error){setError(error);commitButton.disabled=false;}
   }
  });
 }
 async function transferHistory(){
  try{
   const result=await api('department-master/jobs');
   const jobs=result.jobs||[];
   const h=openModal('Department Transfer History',
    '<div class="dm-transfer-history">'+(jobs.length?jobs.map(j=>'<div class="dm-column-row"><div><strong>'+
     esc(j.kind.toUpperCase())+'</strong> · '+esc(j.status)+' · '+fmt(j.succeeded)+' / '+fmt(j.total)+
     '<small> · '+esc(j.filename||'')+'</small></div><button class="dm-btn" data-dm-job-detail="'+esc(j.id)+'">Details</button></div>').join(''):
     '<p>No recent Department transfer jobs.</p>')+'</div><div class="dm-transfer-status" role="status"></div>');
   const area=h.querySelector('.dm-transfer-status');
   h.addEventListener('click',async event=>{
    const button=event.target.closest('[data-dm-job-detail],[data-dm-history-file]');
    if(!button)return;
    if(button.dataset.dmHistoryFile){
     const [id,part]=button.dataset.dmHistoryFile.split(':');
     try{saveTransfer(await api('department-master/jobs/'+id+'/file?part='+part));}catch(err){alert(err.message);}return;
    }
    try{
     const info=await api('department-master/jobs/'+button.dataset.dmJobDetail);
     area.innerHTML='<p>'+esc(info.job.kind)+' · '+esc(info.job.status)+' · '+fmt(info.job.total)+' rows</p>'+
      (info.items||[]).slice(0,30).map(x=>'<p>Row '+esc(x.ordinal)+' ('+esc(x.status)+'): '+esc(x.error||'')+'</p>').join('')+
      Array.from({length:Number(info.parts||0)},(_,i)=>'<button type="button" class="dm-btn" data-dm-history-file="'+esc(info.job.id)+':'+(i+1)+'">Download part '+(i+1)+'</button>').join('');
    }catch(error){area.textContent=error.message||'Job details unavailable';}
   });
  }catch(error){alert(error.message||'Could not load transfer history');}
 }
 async function exportCsv(){
  if(state.loading)return;
  const scope=state.scope,search=state.q,status=state.status,level=state.level,branchId=state.selectedBranch;
  const cols=['System ID','Scope','Level','Unit Name','Unit Code','Parent','Status','Description','Last Modified'];
  const safe=s=>{const v=String(s??'');return '"'+(/^[\s]*[=+@-]/.test(v)?"'"+v:v).replace(/"/g,'""')+'"'};
  const rows=[],pageSize=100,limit=10000;
  try{
   const params=new URLSearchParams({scope,q:search,status,level,page:'1',pageSize:String(pageSize)});
   appendAdvancedFilters(params);
   const first=await api('department-master?'+params);
   const total=Number(first.total||0);
   if(total>limit)throw new Error('This export supports up to 10,000 matching departments. Narrow the filters; the full export job is not available yet.');
   rows.push(...(first.records||[]));
   for(let page=2;rows.length<total;page++){
    params.set('page',String(page));
    const data=await api('department-master?'+params);
    if(!Array.isArray(data.records)||!data.records.length)throw new Error('Export was interrupted. Please try again.');
    rows.push(...data.records);
   }
   if(state.scope!==scope||state.q!==search||state.status!==status||state.level!==level||state.selectedBranch!==branchId)throw new Error('Filters changed during export. Please retry.');
   const lines=[cols,...rows.map(r=>[r.displayId,r.scope,r.level,r.name,r.code,r.parent,r.status,r.description,r.updatedAt])];
   const blob=new Blob(['\uFEFF'+lines.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
   const link=document.createElement('a'),url=URL.createObjectURL(blob);
   link.href=url;link.download='department-'+scope.toLowerCase()+'-filtered.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(err){alert(err.message||'Export failed. Please try again.')}
 }
 function customizeColumns(){
  let order=[...state.columns,...columnDefs.map(c=>c.key).filter(k=>!state.columns.includes(k))];
  const selected=new Set(state.columns),locked=new Set(columnDefs.filter(c=>c.locked).map(c=>c.key));
  const h=openModal('Arrange Columns','<div class="dm-column-editor"></div>');
  const container=h.querySelector('.dm-column-editor');
  function draw(){
   container.innerHTML='<p class="dm-hint">Choose the visible columns and move them up or down. Unit Name and System ID stay visible.</p>'+
    order.map((key,index)=>{
     const c=columnDefs.find(x=>x.key===key);
     return '<div class="dm-column-row"><label><input type="checkbox" data-dm-column-visible="'+esc(key)+'" '+
      (selected.has(key)?'checked ':'')+(locked.has(key)?'disabled ':'')+'>'+esc(c.label)+'</label><div>'+
      '<button type="button" class="dm-btn" data-dm-column-move="up:'+esc(key)+'" '+(index===0?'disabled':'')+' aria-label="Move '+esc(c.label)+' up">↑</button>'+
      '<button type="button" class="dm-btn" data-dm-column-move="down:'+esc(key)+'" '+(index===order.length-1?'disabled':'')+' aria-label="Move '+esc(c.label)+' down">↓</button></div></div>';
    }).join('')+'<button type="button" class="dm-btn dm-primary-action" data-dm-column-save>Apply columns</button>';
  }
  container.addEventListener('change',event=>{
   const key=event.target.dataset.dmColumnVisible;
   if(!key||locked.has(key))return;
   if(event.target.checked)selected.add(key);else selected.delete(key);
   state.dirty=true;
  });
  container.addEventListener('click',event=>{
   const move=event.target.closest('[data-dm-column-move]');
   if(move){
    const [way,key]=move.dataset.dmColumnMove.split(':'),i=order.indexOf(key),j=i+(way==='up'?-1:1);
    if(j>=0&&j<order.length){[order[i],order[j]]=[order[j],order[i]];state.dirty=true;draw();}
    return;
   }
   if(event.target.closest('[data-dm-column-save]')){
    state.columns=order.filter(k=>selected.has(k)||locked.has(k));
    try{localStorage.setItem(columnsKey,JSON.stringify(state.columns));}catch{}
    state.dirty=false;dismissModal(h);render();
   }
  });
  draw();
 }
 async function click(event){
  const b=event.target.closest('[data-dm]');if(!b)return;
  const [action,id]=b.dataset.dm.split(':');
  if(action==='toggle-filters'){state.filtersOpen=!state.filtersOpen;render();return;}
  if(action==='central'||action==='branch'){state.scope=action==='central'?'Central':'Branch';state.page=1;state.selectedBranch='';state.selectedLine='';await load();}
  else if(['overview','records','tree'].includes(action)){state.tab=action;if(action==='tree')await load();else render();}
  else if(action==='clear'){state.status='all';state.level='all';state.selectedBranch='';state.selectedLine='';state.nameFilter='';state.codeFilter='';state.parentFilter='';state.page=1;await load();}
  else if(action==='advanced'){state.advancedOpen=!state.advancedOpen;render();}
  else if(action==='apply-advanced'){
   state.nameFilter=(host.querySelector('#dm-advanced-name')?.value||'').trim();
   state.codeFilter=(host.querySelector('#dm-advanced-code')?.value||'').trim();
   state.parentFilter=host.querySelector('#dm-advanced-parent')?.value||'';
   state.page=1;await load();
  }
  else if(action==='prev'&&state.page>1){state.page--;await load()}
  else if(action==='next'&&state.page*state.pageSize<state.total){state.page++;await load()}
  else if(action==='refresh')await load();
  else if(action==='export')await exportCsv();
  else if(action==='transfer-export')transferExport();
  else if(action==='import')transferImport();
  else if(action==='transfer-history')await transferHistory();
  else if(action==='columns')customizeColumns();
  else if(action==='create')await editor();
  else if(action==='view')await editor(id,true);
  else if(action==='edit')await editor(id);
  else if(action==='related'||action==='history')await showDetails(id,action);
  else if(action==='assign')await branchAssign();
  else if(action==='lifecycle')await lifecycle(id);
  else if(action==='manage-assignments')await manageAssignments();
 }
 host.addEventListener('click',click);
 header();references().then(load);
 return {canLeave:()=>!state.dialog||!state.dirty||confirm('Discard unsaved Department Master edits?'),
  destroy(){state.destroyed=true;clearTimeout(timer);window.SCRMHeader?.parkSearch?.();headerHost?.remove();host.classList.remove('mw-module-content');document.querySelectorAll('.dm-modal-backdrop').forEach(dismissModal);return true},
  setSearch(value){state.q=String(value||'').slice(0,100);state.page=1;debounceLoad()},
  openResult(id){editor(id,true)}};
}
window.SCRMDepartmentMaster={mount};
})();