(()=>{
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ok=x=>x&&x.status==='Active';
const fmt=n=>Number(n||0).toLocaleString();
function mount(host){
 if(!window.SCRM.can('departmentmaster')){host.innerHTML='<div class="mw-state" role="alert"><strong>Access restricted</strong></div>';return {canLeave:()=>true,destroy:()=>{}}}
 const api=window.SCRM.api;
 let state={scope:'Branch',tab:'records',q:'',status:'all',level:'all',page:1,pageSize:25,total:0,records:[],counts:{},refs:{units:[],branches:[],businessLines:[]},
  selectedLine:'',selectedBranch:'',assignments:[],loading:false,error:'',dialog:false,dirty:false,editing:null,dialogMode:'',destroyed:false};
 let shell=null,requestId=0;
 const btn=(text,action,cls='')=>'<button type="button" class="dm-btn '+cls+'" data-dm="'+action+'">'+esc(text)+'</button>';
 const header=()=>{
  const existing=document.querySelector('.dm-module-header');existing?.remove();
  shell=document.createElement('section');shell.className='dm-module-header';
  shell.innerHTML='<div class="dm-primary"><div class="dm-header-title"><span>▦</span><strong>Departments</strong></div><nav class="dm-tabs" aria-label="Department views">'+btn('Overview','overview')+btn('Records','records')+btn('Hierarchy Tree','tree')+'</nav></div>'+
   '<div class="dm-toolbar">'+btn('Central Department','central')+btn('Branch Department','branch')+
   '<label class="dm-search">Search <input type="search" id="dm-search" placeholder="Name, code, ID"></label>'+btn('Refresh','refresh')+btn('Export CSV','export')+btn('Add Department','create','dm-primary-action')+'</div>';
  const top=document.querySelector('.topbar');if(top)top.insertAdjacentElement('afterend',shell);else host.prepend(shell);
  shell.addEventListener('click',click);
  shell.querySelector('#dm-search').addEventListener('input',e=>{state.q=e.target.value;state.page=1;debounceLoad()});
 };
 let timer=0;
 const debounceLoad=()=>{clearTimeout(timer);timer=setTimeout(load,240)};
 function renderHeader(){
  if(!shell)return;
  shell.querySelector('[data-dm="central"]').classList.toggle('dm-chosen',state.scope==='Central');
  shell.querySelector('[data-dm="branch"]').classList.toggle('dm-chosen',state.scope==='Branch');
  for(const tab of ['overview','records','tree'])shell.querySelector('[data-dm="'+tab+'"]').classList.toggle('dm-chosen',state.tab===tab);
  shell.querySelector('[data-dm="create"]').disabled=state.loading;
 }
 const statusTag=s=>'<span class="dm-tag dm-'+esc(s).toLowerCase()+'">'+esc(s)+'</span>';
 const table=rows=>'<div class="dm-table-wrap"><table class="dm-table"><thead><tr><th>Unit Name</th><th>System ID</th><th>Unit Code</th><th>Level</th><th>Parent Unit</th><th>Status</th><th>Last Modified</th><th>Actions</th></tr></thead><tbody>'+
  (rows.length?rows.map(r=>'<tr><td><strong>'+esc(r.name)+'</strong></td><td>'+esc(r.displayId)+'</td><td>'+esc(r.code)+'</td><td>'+esc(r.level)+'</td><td>'+esc(r.parent||'—')+'</td><td>'+statusTag(r.status)+'</td><td>'+esc(r.updatedAt?new Date(r.updatedAt).toLocaleString():'—')+'</td><td>'+btn('View','view:'+r.id)+btn('Edit','edit:'+r.id)+'</td></tr>').join(''):'<tr><td colspan="8" class="dm-empty">No matching departments. Create the first record or change your filters.</td></tr>')+'</tbody></table></div>';
 function controls(){
  const options=(values,value)=>values.map(v=>'<option value="'+esc(v)+'" '+(v===value?'selected':'')+'>'+esc(v)+'</option>').join('');
  const lines=state.refs.businessLines||[],branches=state.refs.branches||[];
  return '<div class="dm-filters"><label>Status<select id="dm-status">'+options(['all','Active','Inactive','Archived','Deleted'],state.status)+'</select></label>'+
  '<label>Level<select id="dm-level">'+options(['all','Department','Sub-Department','Team'],state.level)+'</select></label>'+
  (state.scope==='Branch'?'<label>Business Line<select id="dm-line"><option value="">All Business Lines</option>'+lines.map(x=>'<option value="'+esc(x.id)+'" '+(state.selectedLine===x.id?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label>'+
   '<label>Branch<select id="dm-branch"><option value="">All Branches</option>'+branches.filter(b=>!state.selectedLine||b.businessLineRef===state.selectedLine).map(b=>'<option value="'+esc(b.id)+'" '+(state.selectedBranch===b.id?'selected':'')+'>'+esc(b.name)+' · '+esc(b.code)+'</option>').join('')+'</select></label>':'')+
   btn('Clear filters','clear')+'</div>';
 }
 const rows=()=>state.records;
 const tree=()=>{
  const byParent=new Map();for(const row of rows()){const k=row.parentId||'root';if(!byParent.has(k))byParent.set(k,[]);byParent.get(k).push(row)}
  const draw=(parent,depth)=> (byParent.get(parent)||[]).map(x=>'<div class="dm-tree-node" style="margin-left:'+Math.min(depth*22,66)+'px"><button data-dm="view:'+esc(x.id)+'" type="button"><span class="dm-tree-glyph">'+(depth===0?'▦':depth===1?'◫':'◉')+'</span> <strong>'+esc(x.name)+'</strong><small>'+esc(x.level)+' · '+esc(x.code)+'</small>'+statusTag(x.status)+'</button></div>'+draw(x.id,depth+1)).join('');
  const output=draw('root',0);
  return '<div class="dm-panel"><h3>Department hierarchy</h3><p class="dm-hint">Tree uses all loaded records for the selected filter/page; view Records for pagination.</p>'+(output||'<p>No hierarchy nodes in the current view.</p>')+'</div>';
 };
 function overview(){
  const c=state.counts||{};
  return '<div class="dm-metrics">'+[['All units',c.total],['Active',c.active],['Inactive',c.inactive],['Archived',c.archived],['Deleted',c.deleted]].map(([n,v])=>'<article class="dm-metric"><span>'+n+'</span><strong>'+fmt(v)+'</strong></article>').join('')+'</div><div class="dm-panel"><h3>Department Overview</h3><p>Catalog counts are loaded from the Department Master database. Separate Central and Branch catalogs are independent. Branch assignment counts are not equivalent to distinct employee counts.</p>'+btn('View records','records')+'</div>';
 }
 const render=()=>{
  if(state.destroyed)return;renderHeader();
  host.innerHTML='<div class="dm-workspace"><div class="dm-content-heading"><div><small>ADMINISTRATION / CORE MASTERS</small><h2>'+esc(state.scope)+' Department</h2><p>Department → Sub-Department → Team</p></div>'+btn('Assign to Branch','assign','')+'</div>'+
    (state.error?'<div role="alert" class="dm-error">'+esc(state.error)+'</div>':'')+
    (state.loading?'<p class="dm-loading">Loading departments…</p>':state.tab==='overview'?overview():state.tab==='tree'?tree():controls()+table(rows())+
    '<footer class="dm-page"><span>'+fmt(state.total)+' records · Page '+state.page+' of '+Math.max(1,Math.ceil(state.total/state.pageSize))+'</span>'+btn('Previous','prev')+btn('Next','next')+'</footer>')+'</div>';
  host.querySelectorAll('select').forEach(select=>select.addEventListener('change',e=>{
    if(e.target.id==='dm-line'){state.selectedLine=e.target.value;state.selectedBranch='';}
    if(e.target.id==='dm-branch')state.selectedBranch=e.target.value;
    if(e.target.id==='dm-status')state.status=e.target.value;
    if(e.target.id==='dm-level')state.level=e.target.value;
    state.page=1;load();
  }));
  host.addEventListener('click',click,{once:true});
 };
 async function references(){try{const data=await api('department-master/references');state.refs={units:data.units||[],branches:data.branches||[],businessLines:data.businessLines||[]}}catch(e){state.error=e.message}}
 async function load(){
  const id=++requestId;state.loading=true;render();
  try{
   const q=new URLSearchParams({scope:state.scope,q:state.q,status:state.status,level:state.level,page:String(state.page),pageSize:String(state.pageSize)});
   if(state.selectedBranch)q.set('branchId',state.selectedBranch);
   const data=await api('department-master?'+q);
   if(id!==requestId||state.destroyed)return;
   state.records=data.records||[];state.total=data.total||0;state.counts=data.counts||{};state.page=data.page||state.page;
   state.error='';
  }catch(e){if(id===requestId)state.error=e.message||'Could not load departments'}
  finally{if(id===requestId){state.loading=false;render()}}
 }
 const field=(label,key,value='',type='text',options=null,disabled=false)=>'<label>'+esc(label)+(options?'<select name="'+key+'" '+(disabled?'disabled':'')+'>'+options.map(([k,v])=>'<option value="'+esc(k)+'" '+(String(value)===String(k)?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select>':
  type==='textarea'?'<textarea name="'+key+'" '+(disabled?'disabled':'')+'>'+esc(value)+'</textarea>':'<input name="'+key+'" type="'+type+'" value="'+esc(value)+'" '+(disabled?'disabled':'')+'>')+'</label>';
 function openModal(title,contents,onSave=null){
  state.dialog=true;state.dirty=false;
  const wrap=document.createElement('div');wrap.className='dm-modal-backdrop';wrap.innerHTML='<section class="dm-dialog" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><header><div><small>SAI-CRM · DEPARTMENT MASTER</small><h2>'+esc(title)+'</h2></div><button type="button" class="dm-modal-close" aria-label="Close">×</button></header><div class="dm-dialog-body">'+contents+'</div><footer><button type="button" class="dm-modal-cancel">Close</button>'+(onSave?'<button type="submit" form="dm-form" class="dm-btn dm-primary-action">Save changes</button>':'')+'</footer></section>';
  document.body.append(wrap);
  const close=()=>{if(state.dirty&&!confirm('Discard unsaved changes?'))return;wrap.remove();state.dialog=false;state.dirty=false;};
  wrap.querySelector('.dm-modal-close').onclick=close;wrap.querySelector('.dm-modal-cancel').onclick=close;
  wrap.addEventListener('click',e=>{if(e.target===wrap)close()});
  const form=wrap.querySelector('#dm-form');if(form&&onSave){form.addEventListener('change',()=>{state.dirty=true});
   form.onsubmit=async e=>{e.preventDefault();const submit=wrap.querySelector('[type="submit"]');submit.disabled=true;
    try{await onSave(Object.fromEntries(new FormData(form)));state.dirty=false;wrap.remove();state.dialog=false;await references();await load();}
    catch(err){const n=wrap.querySelector('.dm-dialog-notice');n.textContent=err.message;n.hidden=false;}finally{submit.disabled=false}};
  }
  return wrap;
 }
 async function editor(id='',readonly=false){
  let record=null;if(id){try{record=(await api('department-master/'+id)).record}catch(e){alert(e.message);return}}
  const parentOptions=[['','No parent'],...state.refs.units.filter(x=>x.scope===(record?.scope||state.scope)&&x.id!==id).map(x=>[x.id,x.name+' · '+x.level])];
  const values=record||{scope:state.scope,level:'Department',sortOrder:100};
  const body='<form id="dm-form" class="dm-form"><div class="dm-form-grid">'+field('Organizational Scope','scope',values.scope,'text',[['Central','Central'],['Branch','Branch']],!!record)+
  field('Level','level',values.level,'text',['Department','Sub-Department','Team'].map(x=>[x,x]),!!record)+
  field('Department / Unit Name','name',values.name)+field('Department / Unit Code','code',values.code)+
  field('Parent Unit','parentId',values.parentId||'','text',parentOptions,!!record)+
  field('Display Order','sortOrder',values.sortOrder,'number')+
  (record?field('Status','status',values.status,'text',[['Active','Active'],['Inactive','Inactive']],false):'')+
  '<div class="dm-full">'+field('Description','description',values.description||'','textarea')+'</div>'+
  (record?'<div class="dm-full">'+field('Reason for status change','reason','','textarea')+'</div>':'')+'</div><p class="dm-dialog-notice" role="alert" hidden></p></form>';
  if(readonly){
   const h=openModal('View '+record.name,body);h.querySelectorAll('#dm-form input,#dm-form select,#dm-form textarea').forEach(x=>x.disabled=true);
   const f=h.querySelector('.dm-dialog-body');f.insertAdjacentHTML('beforeend',btn('Related / Used In','related:'+id)+btn('Audit History','history:'+id));
   f.addEventListener('click',click);
   return;
  }
  openModal(record?'Edit '+record.name:'Create Department Unit',body,async data=>{
   const req={name:data.name,code:data.code,description:data.description,sortOrder:Number(data.sortOrder),parentId:data.parentId||null};
   if(record){req.version=record.version;req.status=data.status;req.reason=data.reason||'';}
   else {req.scope=data.scope;req.level=data.level;}
   await api('department-master'+(id?'/'+id:''),id?'PUT':'POST',req);
  });
 }
 async function showDetails(id,mode){
  try{const data=await api('department-master/'+id+'/'+mode);const value=mode==='related'?data.related:data.history;
   const h=openModal(mode==='related'?'Related / Used In':'Audit History','<pre class="dm-json">'+esc(JSON.stringify(value,null,2))+'</pre>');
  }catch(e){alert(e.message)}
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
 function exportCsv(){
  const cols=['System ID','Scope','Level','Unit Name','Unit Code','Parent','Status','Description','Last Modified'];
  const value=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
  const lines=[cols,...state.records.map(r=>[r.displayId,r.scope,r.level,r.name,r.code,r.parent,r.status,r.description,r.updatedAt])];
  const blob=new Blob([lines.map(row=>row.map(value).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const link=document.createElement('a'),url=URL.createObjectURL(blob);
  link.href=url;link.download='department-'+state.scope.toLowerCase()+'-visible-page.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function click(event){
  const b=event.target.closest('[data-dm]');if(!b)return;
  const [action,id]=b.dataset.dm.split(':');
  if(action==='central'||action==='branch'){state.scope=action==='central'?'Central':'Branch';state.page=1;state.selectedBranch='';state.selectedLine='';await load();}
  else if(['overview','records','tree'].includes(action)){state.tab=action;render();}
  else if(action==='clear'){state.status='all';state.level='all';state.selectedBranch='';state.selectedLine='';state.page=1;await load();}
  else if(action==='prev'&&state.page>1){state.page--;await load()}
  else if(action==='next'&&state.page*state.pageSize<state.total){state.page++;await load()}
  else if(action==='refresh')await load();
  else if(action==='export')exportCsv();
  else if(action==='create')await editor();
  else if(action==='view')await editor(id,true);
  else if(action==='edit')await editor(id);
  else if(action==='related'||action==='history')await showDetails(id,action);
  else if(action==='assign')await branchAssign();
 }
 header();references().then(load);
 return {canLeave:()=>!state.dialog||!state.dirty||confirm('Discard unsaved Department Master edits?'),
  destroy(){state.destroyed=true;clearTimeout(timer);shell?.remove();document.querySelector('.dm-modal-backdrop')?.remove();return true},
  setSearch(value){state.q=String(value||'');if(shell)shell.querySelector('#dm-search').value=state.q;debounceLoad()},
  openResult(id){editor(id,true)}};
}
window.SCRMDepartmentMaster={mount};
})();