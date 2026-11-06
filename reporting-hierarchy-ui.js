(()=>{
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString();
const list=(values,chosen)=>values.map(([value,name])=>'<option value="'+esc(value)+'"'+(String(value)===String(chosen)?' selected':'')+'>'+esc(name)+'</option>').join('');
const btn=(label,action,cls='')=>'<button type="button" class="rh-btn '+cls+'" data-rh="'+esc(action)+'">'+esc(label)+'</button>';
const tag=status=>'<span class="rh-status rh-'+esc(status.toLowerCase())+'">'+esc(status)+'</span>';
function mount(host){
 if(!window.SCRM.can('reportinghierarchy')){host.innerHTML='<p role="alert">Access restricted.</p>';return {canLeave:()=>true,destroy:()=>true};}
 const api=window.SCRM.api;
 const state={tab:'records',q:'',type:'all',status:'all',scope:'all',applicability:'all',page:1,pageSize:25,records:[],
 total:0,counts:{},refs:{roles:[],businessLines:[],regions:[],branches:[],departments:[]},
 loading:false,filtersOpen:false,error:'',dirty:false,dialog:false,destroyed:false};
 let headerHost=null,bar=null,timer=null,reqId=0;
 function header(){
  headerHost=document.createElement('div');headerHost.className='crm-module-host rh-module-host';
  bar=document.createElement('section');bar.className='mw-module-header crm-business-module rh-module-header';
  bar.innerHTML='<div class="mw-module-identity"><span class="mw-module-identity-icon">▧</span><h2>Reporting Hierarchy</h2></div>'+
   '<nav class="mw-module-tabs" aria-label="Hierarchy views">'+
   '<button type="button" data-mw="home" data-rh="records" class="mw-module-tab">Records</button>'+
   '<button type="button" data-mw="dashboard" data-rh="overview" class="mw-module-tab">Overview</button>'+
   '<button type="button" data-mw="tree" data-rh="tree" class="mw-module-tab">Hierarchy</button></nav>'+
   '<div class="scrm-search-slot"></div><div class="mw-header-actions">'+
   '<button type="button" class="mw-btn" data-rh="export">Export CSV</button>'+ 
   '<button type="button" class="mw-btn" data-mw="filter-toggle" data-rh="filters">Filter</button>'+
   '<button type="button" class="mw-btn" data-rh="columns">Customize</button>'+
   '<button type="button" class="mw-btn mw-primary" data-mw="create" data-rh="create">Add Reporting Rule</button></div>';
  headerHost.append(bar);const top=document.querySelector('.topbar');if(top)top.insertAdjacentElement('afterend',headerHost);else host.prepend(headerHost);
  host.classList.add('mw-module-content');bar.addEventListener('click',click);
 }
 function controls(){
  return '<div class="rh-filters">'+
   '<label>Hierarchy Type<select id="rh-filter-type">'+list([['all','All types'],['Administrative','Administrative'],['Functional','Functional']],state.type)+'</select></label>'+
   '<label>Scope Level<select id="rh-filter-scope">'+list([['all','All scopes'],['Global','Global'],['Business Line','Business Line'],['Region','Region'],['Branch','Branch'],['Department','Department']],state.scope)+'</select></label>'+
   '<label>Context<select id="rh-filter-applicability">'+list([['all','Central + Branch'],['Central','Central'],['Branch','Branch']],state.applicability)+'</select></label>'+
   '<label>Status<select id="rh-filter-status">'+list([['all','Active + Inactive'],['Active','Active'],['Inactive','Inactive'],['Archived','Archived'],['Deleted','Deleted']],state.status)+'</select></label>'+
   btn('Clear Filters','clear')+'</div>';
 }
 function table(){
  const rows=state.records;
  const empty=state.q||state.type!=='all'||state.scope!=='all'||state.status!=='all'||state.applicability!=='all';
  return '<div class="rh-scroll"><table class="rh-table"><thead><tr>'+
   ['System ID','Hierarchy Type','Parent Role','Child Role','Context','Scope','Status','Last Modified','Actions'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+
   (rows.length?rows.map(r=>'<tr><td>'+esc(r.displayId)+'</td><td>'+esc(r.hierarchyType)+'</td>'+
    '<td>'+esc(r.parentRole)+'</td><td>'+esc(r.childRole)+'</td><td>'+esc(r.applicability)+'</td>'+
    '<td>'+esc(r.scopeLevel==='Global'?'Global':r.scopeLevel+' · '+r.scopeName)+'</td><td>'+tag(r.status)+'</td>'+
    '<td>'+esc(r.updatedAt?new Date(r.updatedAt).toLocaleDateString():'—')+'</td><td>'+btn('View','view:'+r.id)+
    (['Active','Inactive'].includes(r.status)?btn('Edit','edit:'+r.id):'')+btn('Lifecycle','lifecycle:'+r.id)+'</td></tr>').join(''):
    '<tr><td colspan="9"><div class="rh-empty"><strong>'+(empty?'No matching rules':'No Reporting Rules created yet')+
    '</strong><p>'+(empty?'Clear the filters to see other hierarchy rules.':'Define which Organizational Roles may report to which other roles, independently for Administrative and Functional reporting.')+'</p>'+
    btn('Add Reporting Rule','create','rh-primary')+'</div></td></tr>')+
   '</tbody></table></div><footer class="rh-pagination"><span>'+fmt(state.total)+' matching rules · Page '+state.page+' of '+Math.max(1,Math.ceil(state.total/state.pageSize))+'</span>'+
   '<label>Rows per page <select id="rh-page-size">'+list([25,50,75,100].map(x=>[x,String(x)]),state.pageSize)+'</select></label>'+
   btn('Previous','prev')+btn('Next','next')+'</footer>';
 }
 function overview(){
  const c=state.counts,items=[['Matching Rules',c.total],['Administrative',c.administrative],['Functional',c.functional],['Active',c.active],['Inactive',c.inactive]];
  return '<section class="rh-overview"><p>Counts come from the filtered Reporting Hierarchy configuration, not employee assignments.</p>'+
   '<div class="rh-metrics">'+items.map(([name,n])=>'<article><span>'+esc(name)+'</span><strong>'+fmt(n)+'</strong></article>').join('')+'</div>'+
   '<div class="rh-note"><strong>Reporting policy is not a CRM permission</strong><p>A rule establishes an allowed role-to-role relationship. Actual named managers, effective dates and reporting-based access will be handled during Employee Master and Permission Matrix implementation.</p></div></section>';
 }
 function hierarchy(){
  if(!state.records.length)return '<div class="rh-empty"><strong>No hierarchy rules in this view</strong><p>Create an Administrative or Functional rule to see reporting connections. Change filters if rules already exist.</p>'+btn('Add Reporting Rule','create','rh-primary')+'</div>';
  return '<section class="rh-tree"><h3>Configured Reporting Relationships</h3><p>Parent Organizational Role → Child Organizational Role. These are rules, not named employee assignments.</p>'+
   state.records.map(r=>'<div class="rh-edge"><div><small>'+esc(r.hierarchyType)+' · '+esc(r.applicability)+' · '+esc(r.scopeLevel==='Global'?'Global':r.scopeName)+'</small>'+
    '<strong>'+esc(r.parentRole)+'</strong><span class="rh-arrow">↓</span><strong>'+esc(r.childRole)+'</strong></div>'+
    '<div>'+tag(r.status)+btn('View','view:'+r.id)+'</div></div>').join('')+'</section>';
 }
 function render(){
  if(state.destroyed)return;
  for(const a of ['records','overview','tree']){const x=bar.querySelector('[data-rh="'+a+'"]');x?.classList.toggle('mw-active-tab',state.tab===a);}
  host.innerHTML='<div class="rh-workspace"><header class="rh-heading"><small>ADMINISTRATION / CORE MASTERS</small>'+
   '<h2>Functional & Administrative Hierarchy</h2>'+
   '<p>Manage role-to-role reporting structures. Organizational Roles, Branches and Departments remain the source masters.</p></header>'+
   (state.error?'<p role="alert" class="rh-error">'+esc(state.error)+'</p>':'')+(state.filtersOpen?controls():'')+
   '<section class="rh-panel">'+(state.loading?'<p>Loading reporting rules…</p>':state.tab==='overview'?overview():state.tab==='tree'?hierarchy():table())+'</section></div>';
  window.SCRMColumns?.apply(host.querySelector('.rh-table'),'reporting-hierarchy',["System ID","Hierarchy Type","Parent Role","Child Role","Context","Scope","Status","Last Modified","Actions"]);
  host.querySelectorAll('select').forEach(select=>select.onchange=e=>{
   const map={'rh-filter-type':'type','rh-filter-scope':'scope','rh-filter-status':'status','rh-filter-applicability':'applicability','rh-page-size':'pageSize'};
   const k=map[e.target.id];if(!k)return;
   state[k]=k==='pageSize'?Number(e.target.value):e.target.value;state.page=1;load();
  });
 }
 async function load(){
  const id=++reqId;state.loading=true;render();
  try{const q=new URLSearchParams({q:state.q,type:state.type,scope:state.scope,status:state.status,
    applicability:state.applicability,page:String(state.page),pageSize:String(state.pageSize)});
   const data=await api('reporting-hierarchy?'+q);
   if(state.destroyed||reqId!==id)return;
   state.records=data.records||[];state.total=Number(data.total||0);state.page=data.page||state.page;state.counts=data.counts||{};state.error='';
  }catch(e){if(reqId===id)state.error=e.message||'Unable to load Reporting Hierarchy';}
  finally{if(reqId===id){state.loading=false;render();}}
 }
 async function references(){
  try{state.refs=await api('reporting-hierarchy/references');}
  catch(e){state.error=e.message||'Unable to load Role and scope references';render();}
 }
 function dialog(title,content,onSave=null){
  state.dialog=true;state.dirty=false;const d=document.createElement('dialog');d.className='rh-modal';
  d.innerHTML='<section class="rh-dialog"><header><div><small>SAI-CRM · REPORTING HIERARCHY</small><h2>'+esc(title)+'</h2></div>'+
   '<button type="button" aria-label="Close" class="rh-dismiss">×</button></header><div class="rh-dialog-body">'+content+'</div>'+
   '<footer><button type="button" class="rh-cancel">'+(onSave?'Cancel':'Close')+'</button>'+(onSave?'<button class="rh-btn rh-primary" type="submit" form="rh-form">Save changes</button>':'')+'</footer></section>';
  document.body.append(d);d.showModal();let saving=false;
  const close=()=>{if(saving)return;if(state.dirty&&!confirm('Discard unsaved reporting changes?'))return;d.close();d.remove();state.dialog=false;state.dirty=false;};
  d.querySelector('.rh-dismiss').onclick=close;d.querySelector('.rh-cancel').onclick=close;
  d.addEventListener('cancel',e=>{e.preventDefault();close();});
  const form=d.querySelector('#rh-form');
  if(form&&onSave){
   form.oninput=()=>{state.dirty=true;};form.onchange=()=>{state.dirty=true;};
   form.onsubmit=async e=>{
    e.preventDefault();if(saving||!form.reportValidity())return;saving=true;
    const b=d.querySelector('[type="submit"]');b.disabled=true;
    try{await onSave(Object.fromEntries(new FormData(form)));state.dirty=false;d.close();d.remove();state.dialog=false;await references();await load();}
    catch(err){d.querySelector('.rh-form-error').textContent=err.message||'Could not save';}
    finally{saving=false;if(b.isConnected)b.disabled=false;}
   };
  }
  return d;
 }
 const field=(label,key,value='',o={})=>'<label class="rh-field">'+esc(label)+(o.required?' <em>*</em>':'')+
  (o.options?'<select name="'+key+'" '+(o.required?'required':'')+'>'+list(o.options,value)+'</select>':
   o.multiline?'<textarea name="'+key+'" maxlength="'+(o.max||1000)+'">'+esc(value)+'</textarea>':
   '<input name="'+key+'" value="'+esc(value)+'" '+(o.required?'required':'')+' maxlength="'+(o.max||150)+'" '+(o.numeric?'type="number" min="1" max="999999"':'')+'>')+'</label>';
 async function editor(id='',readonly=false){
  let old=null;if(id)try{old=(await api('reporting-hierarchy/'+id)).record;}catch(e){alert(e.message);return;}
  if(readonly){
   const row=(label,value)=>'<div class="rh-read"><span>'+esc(label)+'</span><strong>'+esc(value||'—')+'</strong></div>';
   const html='<div class="rh-read-grid">'+[
    row('System ID',old.displayId),row('Hierarchy Type',old.hierarchyType),row('Parent Role',old.parentRole),row('Child Role',old.childRole),
    row('Context',old.applicability),row('Scope Level',old.scopeLevel),row('Scope Record',old.scopeName),
    row('Status',old.status),row('Description',old.description),row('Display Order',old.sortOrder)
   ].join('')+'</div><div class="rh-detail-actions">'+btn('Audit History','history:'+id)+btn('Related / Used In','related:'+id)+'</div>';
   const d=dialog('Reporting Rule Details',html);
   d.querySelector('.rh-detail-actions').onclick=async e=>{
    const b=e.target.closest('[data-rh]');if(!b)return;
    const [action,rid]=b.dataset.rh.split(':');d.querySelector('.rh-cancel').click();await showExtra(action,rid);
   };return;
  }
  if(old&&['Archived','Deleted'].includes(old.status)){alert('Restore the rule before editing');return;}
  const v=old||{hierarchyType:'Administrative',applicability:'Branch',scopeLevel:'Global',scopeId:null,parentRoleId:'',childRoleId:'',description:'',sortOrder:100,status:'Active'};
  const fields=['hierarchyType','applicability','scopeLevel','scopeId','parentRoleId','childRoleId'];
  const roles=state.refs.roles||[];
  const html='<form id="rh-form" class="rh-form"><fieldset><legend>Hierarchy Rule</legend><div class="rh-form-grid">'+
   field('Hierarchy Type','hierarchyType',v.hierarchyType,{required:true,options:[['Administrative','Administrative'],['Functional','Functional']]})+
   field('Context','applicability',v.applicability,{required:true,options:[['Central','Central'],['Branch','Branch']]})+
   field('Scope Level','scopeLevel',v.scopeLevel,{required:true,options:['Global','Business Line','Region','Branch','Department'].map(x=>[x,x])})+
   field('Scope Record','scopeId',v.scopeId||'',{options:[['','Select Scope Record']]})+
   field('Parent Organizational Role','parentRoleId',v.parentRoleId,{required:true,options:[['','Select Parent Role'],...roles.map(r=>[r.id,r.name+' ('+r.code+')'])]})+
   field('Child Organizational Role','childRoleId',v.childRoleId,{required:true,options:[['','Select Child Role'],...roles.map(r=>[r.id,r.name+' ('+r.code+')'])]})+
   field('Display Order','sortOrder',v.sortOrder,{required:true,numeric:true})+
   (old?field('Status','status',v.status,{options:[['Active','Active'],['Inactive','Inactive']]}):'')+
   '</div>'+field('Description','description',v.description,{multiline:true,max:1000})+'</fieldset>'+
   (old?'<fieldset><legend>Change Reason</legend>'+field('Reason','reason','',{max:500})+'</fieldset>':'')+
   '<p class="rh-note-text">Role relationships do not automatically assign named managers or CRM access.</p><p class="rh-form-error" role="alert"></p></form>';
  const d=dialog(old?'Edit Reporting Rule':'Create Reporting Rule',html,async values=>{
   const data={description:values.description.trim(),sortOrder:Number(values.sortOrder)};
   if(old){data.version=old.version;data.status=values.status;
    if(values.status!==old.status&&!values.reason.trim())throw Error('Reason required for status change');
    if(values.status!==old.status)data.reason=values.reason.trim();}
   else{
    for(const k of fields)data[k]=values[k];data.scopeId=data.scopeLevel==='Global'?null:data.scopeId;
    if(data.parentRoleId===data.childRoleId)throw Error('Parent and Child must be different roles');
   }
   await api('reporting-hierarchy'+(id?'/'+id:''),id?'PUT':'POST',data);
  });
  const form=d.querySelector('#rh-form');
  const context=form.elements.applicability,scope=form.elements.scopeLevel,record=form.elements.scopeId,parent=form.elements.parentRoleId,child=form.elements.childRoleId;
  function optionsFor(){
   const contextValue=context.value,scopeValue=scope.value;
   const roleList=roles.filter(r=>r.applicability==='Both'||r.applicability===contextValue);
   for(const [control,picked] of [[parent,v.parentRoleId],[child,v.childRoleId]]){
    control.innerHTML=list([['','Select Organizational Role'],...roleList.map(r=>[r.id,r.name+' ('+r.code+')'])],control.value||picked);
   }
   const source={'Business Line':'businessLines',Region:'regions',Branch:'branches',Department:'departments'}[scopeValue];
   const items=(state.refs[source]||[]).filter(x=>scopeValue!=='Department'||x.scope===contextValue);
   record.innerHTML=list([['','Select Scope Record'],...items.map(r=>[r.id,r.name+' ('+r.displayId+')'])],record.value||v.scopeId);
   const hide=scopeValue==='Global';record.closest('.rh-field').hidden=hide;
   record.disabled=hide;record.required=!hide;
   if(['Region','Branch'].includes(scopeValue)&&context.value!=='Branch'){context.value='Branch';optionsFor();}
  }
  if(old){for(const k of fields)form.elements[k].disabled=true;
    form.elements.description.disabled=false;form.elements.sortOrder.disabled=false;
    record.closest('.rh-field').hidden=v.scopeLevel==='Global';
    if(form.elements.status)form.elements.status.onchange=()=>{form.elements.reason.required=form.elements.status.value!==old.status;state.dirty=true;};}
  else{optionsFor();context.onchange=optionsFor;scope.onchange=optionsFor;}
 }
 async function showExtra(action,id){
  try{const data=await api('reporting-hierarchy/'+id+'/'+action);
   const html=action==='history'?(data.history?.length?data.history.map(x=>'<p>'+esc(x.action)+' · '+esc(x.actor)+' · '+esc(x.reason||'')+'</p>').join(''):'<p>No history yet.</p>'):
    '<p>Named employee assignments are not linked until Employee Master is implemented. No CRM permission is inherited from these rules.</p>';
   dialog(action==='history'?'Hierarchy Audit History':'Related / Used In',html);
  }catch(e){alert(e.message);}
 }
 async function lifecycle(id){
  let r;try{r=(await api('reporting-hierarchy/'+id)).record;}catch(e){alert(e.message);return;}
  const actions=r.status==='Inactive'?['archive']:r.status==='Archived'?['restore','soft-delete']:r.status==='Deleted'?['restore-deleted']:[];
  if(!actions.length){await editor(id);return;}
  const html='<form id="rh-form" class="rh-form"><fieldset><legend>Lifecycle Change</legend>'+
   field('Action','action',actions[0],{options:actions.map(x=>[x,x]),required:true})+
   (r.status==='Archived'?field('Restore To','targetStatus','Inactive',{options:[['Inactive','Inactive'],['Active','Active']]}):
    r.status==='Deleted'?field('Restore To','targetStatus','Archived',{options:['Archived','Inactive','Active'].map(x=>[x,x])}):'')+
   field('Reason','reason','',{required:true,max:500})+
   '<p class="rh-form-error" role="alert"></p></fieldset></form>';
  dialog('Change Reporting Rule Status',html,async values=>{
   await api('reporting-hierarchy/'+id+'/'+values.action,'POST',{version:r.version,reason:values.reason,targetStatus:values.targetStatus});
  });
 }
 async function exportCsv(){
  const q=new URLSearchParams({q:state.q,type:state.type,scope:state.scope,status:state.status,applicability:state.applicability,page:'1',pageSize:'100'});
  try{
   const first=await api('reporting-hierarchy?'+q),total=Number(first.total||0);
   if(total>10000)throw Error('Export limit is 10,000 reporting rules. Narrow your filters.');
   const records=[...(first.records||[])];
   for(let p=2;records.length<total;p++){
    q.set('page',String(p));const data=await api('reporting-hierarchy?'+q);
    if(!data.records?.length)throw Error('Export interrupted; please retry.');
    records.push(...data.records);
   }
   const header=['System ID','Hierarchy Type','Parent Role','Child Role','Context','Scope Level','Scope Record','Status','Last Modified'];
   const cell=value=>{const s=String(value??'');return '"'+(/^[\\s]*[=+@-]/.test(s)?"'"+s:s).replace(/"/g,'""')+'"';};
   const rows=[header,...records.map(r=>[r.displayId,r.hierarchyType,r.parentRole,r.childRole,r.applicability,r.scopeLevel,r.scopeName,r.status,r.updatedAt])];
   const blob=new Blob([String.fromCharCode(0xFEFF)+rows.map(row=>row.map(cell).join(',')).join(String.fromCharCode(13,10))],{type:'text/csv;charset=utf-8'});
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download='reporting-hierarchy.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }catch(e){alert(e.message||'Unable to export Reporting Hierarchy');}
 }
 async function click(e){
  const b=e.target.closest('[data-rh]');if(!b)return;e.preventDefault();
  const [action,id]=b.dataset.rh.split(':');
  if(action==='records'||action==='overview'||action==='tree'){state.tab=action;render();}
  else if(action==='filters'){state.filtersOpen=!state.filtersOpen;render();}
  else if(action==='columns')window.SCRMColumns?.open(host.querySelector('.rh-table'),'reporting-hierarchy',["System ID","Hierarchy Type","Parent Role","Child Role","Context","Scope","Status","Last Modified","Actions"]);
  else if(action==='export')await exportCsv();
  else if(action==='clear'){state.type='all';state.status='all';state.scope='all';state.applicability='all';state.page=1;load();}
  else if(action==='prev'&&state.page>1){state.page--;load();}
  else if(action==='next'&&state.page*state.pageSize<state.total){state.page++;load();}
  else if(action==='create'){await references();await editor();}
  else if(action==='view')await editor(id,true);
  else if(action==='edit'){await references();await editor(id);}
  else if(action==='lifecycle')await lifecycle(id);
  else if(action==='related'||action==='history')await showExtra(action,id);
 }
 header();host.addEventListener('click',click);load();
 return {canLeave:()=>!state.dialog||!state.dirty||confirm('Discard unsaved hierarchy changes?'),
  destroy(){state.destroyed=true;clearTimeout(timer);window.SCRMHeader?.parkSearch?.();headerHost?.remove();host.classList.remove('mw-module-content');
    document.querySelectorAll('dialog.rh-modal').forEach(d=>d.remove());return true;},
  setSearch(value){state.q=String(value||'').slice(0,100);state.page=1;clearTimeout(timer);timer=setTimeout(load,300);},
  openResult(id){editor(id,true)}};
}
window.SCRMReportingHierarchy={mount};
})();
