(()=>{
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString();
const qs=(el,s)=>el.querySelector(s);
const statusTag=x=>'<span class="org-status org-'+esc(x.toLowerCase())+'">'+esc(x)+'</span>';
function mount(host){
 if(!window.SCRM.can('orgroles')){host.innerHTML='<div class="mw-state" role="alert">Access restricted</div>';return {canLeave:()=>true,destroy:()=>true};}
 const api=window.SCRM.api;
 const state={tab:'records',q:'',status:'all',applicability:'all',family:'',page:1,pageSize:25,total:0,records:[],counts:{},filtersOpen:false,loading:false,error:'',dialog:false,dirty:false,destroyed:false};
 let headerHost=null,shell=null,timer=0,requestId=0;
 const btn=(label,action,cls='')=>'<button type="button" class="org-btn '+cls+'" data-org="'+esc(action)+'">'+esc(label)+'</button>';
 function header(){
  headerHost=document.createElement('div');headerHost.className='crm-module-host org-module-host';
  shell=document.createElement('section');shell.className='mw-module-header crm-business-module org-module-header';
  shell.innerHTML='<div class="mw-module-identity"><span class="mw-module-identity-icon" aria-hidden="true">▦</span><h2>Organizational Roles</h2></div>'+
   '<nav class="mw-module-tabs" aria-label="Organizational Role views"><button type="button" class="mw-module-tab" data-mw="home" data-org="records">Records</button>'+
   '<button type="button" class="mw-module-tab" data-mw="dashboard" data-org="overview">Overview</button></nav>'+
   '<div class="scrm-search-slot"></div><div class="mw-header-actions">'+
   '<button type="button" class="mw-btn" data-mw="export" data-org="export">Export CSV</button>'+
   '<button type="button" class="mw-btn" data-mw="filter-toggle" data-org="filters">Filter</button>'+
   '<button type="button" class="mw-btn" data-org="columns">Customize</button>'+
   '<button type="button" class="mw-btn mw-primary" data-mw="create" data-org="create">Add Organizational Role</button></div>';
  headerHost.append(shell);
  const bar=document.querySelector('.topbar');if(bar)bar.insertAdjacentElement('afterend',headerHost);else host.prepend(headerHost);
  host.classList.add('mw-module-content');shell.addEventListener('click',click);
 }
 function render(){
  if(state.destroyed)return;
  for(const [tab,a] of [['records','records'],['overview','overview']]){
   const button=qs(shell,'[data-org="'+a+'"]');if(button){button.classList.toggle('mw-active-tab',state.tab===tab);
    if(state.tab===tab)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
  }
  const counts=state.counts||{},rows=state.records||[];
  const filters='<section class="org-filters"><label>Status<select id="org-status">'+
   ['all','Active','Inactive','Archived','Deleted'].map(v=>'<option value="'+v+'" '+(v===state.status?'selected':'')+'>'+esc(v==='all'?'All statuses':v)+'</option>').join('')+'</select></label>'+
   '<label>Applicability<select id="org-applicability">'+
   ['all','Central','Branch','Both'].map(v=>'<option value="'+v+'" '+(v===state.applicability?'selected':'')+'>'+esc(v==='all'?'All applicability':v)+'</option>').join('')+'</select></label>'+
   '<label>Role Family contains<input id="org-family" value="'+esc(state.family)+'" maxlength="80"></label>'+
   btn('Apply Filters','apply')+btn('Clear Filters','clear')+'</section>';
  const table='<div class="org-table-scroll"><table class="org-table"><thead><tr>'+
   ['System ID','Role Name','Code','Applicability','Role Family','Status','Last Modified','Actions'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+
   (rows.length?rows.map(r=>'<tr><td>'+esc(r.displayId)+'</td><td><strong>'+esc(r.name)+'</strong></td><td>'+esc(r.code)+'</td><td>'+esc(r.applicability)+'</td>'+
    '<td>'+esc(r.family||'—')+'</td><td>'+statusTag(r.status)+'</td><td>'+esc(r.updatedAt?new Date(r.updatedAt).toLocaleDateString():'—')+'</td>'+
    '<td>'+btn('View','view:'+r.id)+(r.status==='Active'||r.status==='Inactive'?btn('Edit','edit:'+r.id):'')+btn('Status','status:'+r.id)+'</td></tr>').join(''):
    '<tr><td colspan="8"><div class="org-empty"><strong>'+(state.q||state.status!=='all'||state.applicability!=='all'||state.family?'No matching organizational roles':'No Organizational Roles created yet')+
     '</strong><p>'+(state.q||state.status!=='all'||state.applicability!=='all'||state.family?'Adjust or clear your filters.':'Create positions such as Branch Manager, Regional Manager or Sales Executive. Role titles never grant CRM access automatically.')+
     '</p>'+btn('Add Organizational Role','create','org-primary')+'</div></td></tr>')+'</tbody></table></div>'+
   '<footer class="org-pagination"><span>'+fmt(state.total)+' matching roles · Page '+state.page+' / '+Math.max(1,Math.ceil(state.total/state.pageSize))+'</span>'+
   '<label>Rows per page <select id="org-page-size">'+[25,50,75,100].map(x=>'<option '+(x===state.pageSize?'selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
   btn('Previous','prev')+btn('Next','next')+'</footer>';
  const overview='<div class="org-overview"><p>Counts reflect currently applied filters, not sample data.</p>'+
   '<div class="org-stats">'+[['Matching Roles',counts.total],['Active',counts.active],['Inactive',counts.inactive],['Archived',counts.archived],['Deleted',counts.deleted]].map(([name,value])=>
   '<article><span>'+esc(name)+'</span><strong>'+fmt(value)+'</strong></article>').join('')+'</div>'+
   '<div class="org-info"><strong>Organizational position ≠ CRM permission</strong><p>An Organizational Role defines a job position. Permission Roles and employee reporting relationships will be linked in later planned modules, without granting access by job title.</p></div></div>';
  host.innerHTML='<div class="org-workspace"><header class="org-heading"><small>ADMINISTRATION / CORE MASTERS</small><h2>Organizational Roles</h2>'+
   '<p>Reusable job positions across Central and Branch organizations. Reporting hierarchy and CRM permissions are managed independently.</p></header>'+
   (state.error?'<div role="alert" class="org-error">'+esc(state.error)+'</div>':'')+
   (state.filtersOpen?filters:'')+
   '<section class="org-panel">'+(state.loading?'<p>Loading roles…</p>':state.tab==='overview'?overview:table)+'</section></div>';
  window.SCRMColumns?.apply(host.querySelector('.org-table'),'organizational-roles',["System ID","Role Name","Code","Applicability","Role Family","Status","Last Modified","Actions"]);
  host.querySelectorAll('select').forEach(x=>x.onchange=()=>{
   if(x.id==='org-page-size'){state.pageSize=Number(x.value);state.page=1;load();}
   if(x.id==='org-status'){state.status=x.value;state.page=1;load();}
   if(x.id==='org-applicability'){state.applicability=x.value;state.page=1;load();}
  });
 }
 async function load(){
  const id=++requestId;state.loading=true;render();
  try{
   const query=new URLSearchParams({q:state.q,status:state.status,applicability:state.applicability,family:state.family,
     page:String(state.page),pageSize:String(state.pageSize)});
   const data=await api('organizational-roles?'+query);
   if(state.destroyed||id!==requestId)return;
   state.records=data.records||[];state.total=data.total||0;state.counts=data.counts||{};state.page=data.page||state.page;state.error='';
  }catch(e){if(id===requestId)state.error=e.message||'Unable to load Organizational Roles';}
  finally{if(id===requestId){state.loading=false;render();}}
 }
 function modal(title,body,submit=null){
  state.dialog=true;state.dirty=false;
  const dialog=document.createElement('dialog');dialog.className='org-modal';
  dialog.innerHTML='<section class="org-dialog"><header><div><small>SAI-CRM · ORGANIZATIONAL ROLE MASTER</small><h2>'+esc(title)+'</h2></div>'+
   '<button type="button" class="org-dismiss" aria-label="Close">×</button></header>'+
   '<div class="org-dialog-content">'+body+'</div><footer><button type="button" class="org-cancel">'+(submit?'Cancel':'Close')+'</button>'+
   (submit?'<button type="submit" form="org-form" class="org-btn org-primary">Save changes</button>':'')+'</footer></section>';
  document.body.append(dialog);dialog.showModal();let busy=false;
  const close=()=>{if(busy)return;if(state.dirty&&!confirm('Discard unsaved role changes?'))return;dialog.close();dialog.remove();state.dialog=false;state.dirty=false;};
  qs(dialog,'.org-dismiss').onclick=close;qs(dialog,'.org-cancel').onclick=close;
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  const form=qs(dialog,'#org-form');
  if(form&&submit){
   form.oninput=()=>{state.dirty=true;};form.onchange=()=>{state.dirty=true;};
   form.onsubmit=async e=>{
    e.preventDefault();if(busy||!form.reportValidity())return;busy=true;
    const button=qs(dialog,'button[type="submit"]');button.disabled=true;
    try{await submit(Object.fromEntries(new FormData(form)));state.dirty=false;dialog.close();dialog.remove();state.dialog=false;await load();}
    catch(err){qs(dialog,'.org-error').textContent=err.message||'Unable to save changes';button.disabled=false;}
    finally{busy=false;}
   };
  }
  return dialog;
 }
 const field=(name,key,value='',opts={})=>'<label class="org-field">'+esc(name)+(opts.required?' <span aria-label="required">*</span>':'')+
  (opts.options?'<select name="'+key+'" '+(opts.required?'required':'')+'>'+opts.options.map(v=>'<option value="'+esc(v)+'" '+(v===value?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select>':
   opts.area?'<textarea name="'+key+'" maxlength="'+(opts.max||1000)+'">'+esc(value)+'</textarea>':
    '<input name="'+key+'" value="'+esc(value)+'" '+(opts.required?'required':'')+' maxlength="'+(opts.max||150)+'" '+(opts.type?'type="'+opts.type+'"':'')+' '+(opts.min?'min="'+opts.min+'"':'')+'>')+'</label>';
 async function editor(id='',readonly=false){
  let old=null;if(id)try{old=(await api('organizational-roles/'+id)).record;}catch(e){alert(e.message);return;}
  if(old&&['Archived','Deleted'].includes(old.status)&&!readonly){alert('Restore this role before editing');return;}
  if(readonly){
   const row=(label,value)=>'<div class="org-read"><span>'+esc(label)+'</span><strong>'+esc(value||'—')+'</strong></div>';
   const html='<div class="org-read-grid">'+[
    row('System ID',old.displayId),row('Role Name',old.name),row('Role Code',old.code),row('Applicability',old.applicability),
    row('Role Family',old.family),row('Status',old.status),row('Display Order',old.sortOrder),row('Description',old.description),
    row('Created By',old.createdBy),row('Last Modified By',old.updatedBy)].join('')+'</div>'+
    '<div class="org-detail-actions">'+btn('History','history:'+id)+btn('Related / Used In','related:'+id)+'</div>';
   const d=modal('Organizational Role Details',html);
   qs(d,'.org-detail-actions').onclick=async event=>{
    const b=event.target.closest('[data-org]');if(!b)return;
    const [op,target]=b.dataset.org.split(':');qs(d,'.org-cancel').click();await details(op,target);
   };return;
  }
  const v=old||{name:'',code:'',applicability:'Both',family:'',description:'',sortOrder:100,status:'Active'};
  const html='<form id="org-form" class="org-form"><fieldset><legend>Role Information</legend><div class="org-form-grid">'+
   field('Role Name','name',v.name,{required:true,max:150})+field('Role Code','code',v.code,{required:true,max:30})+
   field('Applicability','applicability',v.applicability,{required:true,options:['Central','Branch','Both']})+
   field('Role Family','family',v.family,{max:80})+
   field('Display Order','sortOrder',v.sortOrder,{required:true,type:'number',min:1})+
   (old?field('Status','status',v.status,{options:['Active','Inactive']}):'')+
   '</div>'+field('Description','description',v.description,{area:true,max:1000})+'</fieldset>'+
   (old?'<fieldset><legend>Change Reason</legend>'+field('Reason (mandatory for status changes)','reason','',{max:500})+'</fieldset>':'')+
   '<p class="org-hint">This position does not grant any CRM permissions. User access will be managed separately.</p>'+
   '<p class="org-error" role="alert"></p></form>';
  const d=modal(old?'Edit Organizational Role':'Create Organizational Role',html,async data=>{
   const payload={name:data.name.trim(),code:data.code.trim().toUpperCase(),applicability:data.applicability,
    family:data.family.trim(),description:data.description.trim(),sortOrder:Number(data.sortOrder)};
   if(old){payload.version=old.version;payload.status=data.status;
    if(data.status!==old.status&&!data.reason.trim())throw Error('Reason is required to change status');
    if(data.status!==old.status)payload.reason=data.reason.trim();}
   await api('organizational-roles'+(id?'/'+id:''),id?'PUT':'POST',payload);
  });
  if(old)qs(d,'[name="status"]').onchange=()=>{qs(d,'[name="reason"]').required=qs(d,'[name="status"]').value!==old.status;state.dirty=true;};
 }
 async function details(op,id){
  try{
   const result=await api('organizational-roles/'+id+'/'+op);
   const html=op==='history'?(result.history?.length?result.history.map(x=>'<p>'+esc(x.action)+' · '+esc(x.actor)+' · '+esc(x.reason||'')+'</p>').join(''):'<p>No history recorded yet.</p>'):
    '<p>Employee / Reporting mapping is planned in the next stages. No Organizational Role is automatically linked to a CRM Permission Role.</p>';
   modal(op==='history'?'Organizational Role Audit History':'Related / Used In',html);
  }catch(e){alert(e.message);}
 }
 async function lifecycle(id){
  let record;try{record=(await api('organizational-roles/'+id)).record;}catch(e){alert(e.message);return;}
  const choices=record.status==='Inactive'?['archive']:record.status==='Archived'?['restore','soft-delete']:record.status==='Deleted'?['restore-deleted']:[];
  if(!choices.length){await editor(id);return;}
  const html='<form id="org-form" class="org-form"><fieldset><legend>Lifecycle Change</legend>'+
   field('Action','action',choices[0],{required:true,options:choices})+
   (record.status==='Archived'?field('Restore To','targetStatus','Inactive',{options:['Inactive','Active']}):record.status==='Deleted'?field('Restore To','targetStatus','Archived',{options:['Archived','Inactive','Active']}):'')+
   field('Reason','reason','',{required:true,max:500})+
   '<p class="org-error" role="alert"></p></fieldset></form>';
  modal('Change Organizational Role Status',html,async values=>{
   await api('organizational-roles/'+id+'/'+values.action,'POST',{version:record.version,reason:values.reason,targetStatus:values.targetStatus});
  });
 }
 async function exportCsv(){
  const q=new URLSearchParams({q:state.q,status:state.status,applicability:state.applicability,family:state.family,pageSize:'100',page:'1'});
  try{
   const first=await api('organizational-roles?'+q),total=Number(first.total||0);
   if(total>10000)throw Error('Export limit 10,000 matching roles. Narrow filters.');
   const records=[...(first.records||[])];
   for(let p=2;records.length<total;p++){q.set('page',p);const data=await api('organizational-roles?'+q);if(!data.records?.length)throw Error('Export interrupted');records.push(...data.records);}
   const cols=['System ID','Role Name','Role Code','Applicability','Role Family','Description','Status','Last Modified'];
   const safe=v=>{const x=String(v??'');return '"'+(/^\s*[=+@-]/.test(x)?"'"+x:x).replace(/"/g,'""')+'"';};
   const matrix=[cols,...records.map(r=>[r.displayId,r.name,r.code,r.applicability,r.family,r.description,r.status,r.updatedAt])];
   const blob=new Blob(['\uFEFF'+matrix.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
   const link=document.createElement('a'),uri=URL.createObjectURL(blob);link.href=uri;link.download='organizational-roles.csv';link.click();setTimeout(()=>URL.revokeObjectURL(uri),5000);
  }catch(e){alert(e.message);}
 }
 async function click(event){
  const button=event.target.closest('[data-org]');if(!button)return;
  const [action,id]=button.dataset.org.split(':');event.preventDefault();
  if(action==='filters'){state.filtersOpen=!state.filtersOpen;render();}
  else if(action==='columns')window.SCRMColumns?.open(host.querySelector('.org-table'),'organizational-roles',["System ID","Role Name","Code","Applicability","Role Family","Status","Last Modified","Actions"]);
  else if(action==='records'||action==='overview'){state.tab=action;render();}
  else if(action==='apply'){state.family=qs(host,'#org-family').value.trim();state.page=1;await load();}
  else if(action==='clear'){state.status='all';state.applicability='all';state.family='';state.page=1;await load();}
  else if(action==='prev'&&state.page>1){state.page--;await load();}
  else if(action==='next'&&state.page*state.pageSize<state.total){state.page++;await load();}
  else if(action==='create')await editor();
  else if(action==='view')await editor(id,true);
  else if(action==='edit')await editor(id);
  else if(action==='status')await lifecycle(id);
  else if(action==='history'||action==='related')await details(action,id);
  else if(action==='export')await exportCsv();
 }
 host.addEventListener('click',click);header();load();
 return {canLeave:()=>!state.dialog||!state.dirty||confirm('Discard unsaved Organizational Role edits?'),
  destroy(){state.destroyed=true;clearTimeout(timer);window.SCRMHeader?.parkSearch?.();headerHost?.remove();
    host.classList.remove('mw-module-content');document.querySelectorAll('dialog.org-modal').forEach(d=>d.remove());return true;},
  setSearch(value){state.q=String(value||'').slice(0,100);state.page=1;clearTimeout(timer);timer=setTimeout(load,250);},
  openResult(id){editor(id,true)}};
}
window.SCRMOrganizationalRoles={mount};
})();