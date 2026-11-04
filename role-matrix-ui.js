(()=>{
'use strict';
const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const option=(v,label,selected)=>'<option value="'+e(v)+'"'+(String(v)===String(selected)?' selected':'')+'>'+e(label)+'</option>';
const button=(label,action,cls='')=>'<button type="button" class="rpm-btn '+cls+'" data-rpm="'+e(action)+'">'+e(label)+'</button>';
const steps=['Role Details','Permission Set','Field-Level Security','Review & Submit'];
function mount(host){
 if(!window.SCRM.can('rolematrix')){host.innerHTML='<p role="alert">Roles & Permissions is restricted.</p>';return {destroy:()=>true,canLeave:()=>true};}
 const api=window.SCRM.api;
 const state={roles:[],counts:{},q:'',setup:null,loading:false,error:'',notice:'',wizard:null,step:0,dirty:false,removed:false};
 let seq=0,timer=null;
 const catalog=()=>state.setup?.resources[state.wizard?.userType]||[];
 const available=()=>catalog().filter(r=>r.eligible&&!r.locked&&!r.essential);
 function paintList(){
  const c=state.counts;
  host.innerHTML='<main class="rpm-layout"><header class="rpm-title"><small>ADMINISTRATION / SECURITY</small><h2>Roles & Permissions</h2><p>Define reusable access roles per Department and User Type. Module Directory sets the maximum eligibility.</p>'+
   button('Create Role','create','rpm-primary')+'</header>'+
   '<div class="rpm-metrics">'+[['Total Roles',c.total],['Active',c.active],['Configured',c.configured],['Not Configured',Math.max(0,(c.total||0)-(c.configured||0))]].map(([name,n])=>
   '<article><span>'+e(name)+'</span><strong>'+Number(n||0)+'</strong></article>').join('')+'</div>'+
   (state.notice?'<p role="status" class="rpm-notice">'+e(state.notice)+'</p>':'')+
   (state.error?'<p role="alert" class="rpm-error">'+e(state.error)+'</p>':'')+
   '<section class="rpm-panel"><label>Search Roles<input id="rpm-search" type="search" value="'+e(state.q)+'" placeholder="Role, Code or Department"></label>'+
   '<div class="rpm-scroll">'+(state.loading?'<p>Loading roles…</p>':
    '<table class="rpm-table"><thead><tr>'+['Role ID','Role Name','Role Code','Department','User Type','Status','Actions'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+
    (state.roles.length?state.roles.map(r=>'<tr><td>'+e(r.displayId)+'</td><td><strong>'+e(r.name)+'</strong></td><td>'+e(r.code)+'</td><td>'+e(r.department)+'</td><td>'+e(r.userType)+'</td><td>'+e(r.status)+'</td><td>'+button('View','view:'+r.id)+button('Edit','edit:'+r.id)+button('History','history:'+r.id)+'</td></tr>').join(''):
     '<tr><td colspan="7"><div class="rpm-empty">No permission roles found. Create a Department-specific role to begin.</div></td></tr>')+'</tbody></table>')+'</div></section></main>';
  host.querySelector('#rpm-search').oninput=ev=>{state.q=ev.target.value;clearTimeout(timer);timer=setTimeout(load,250);};
 }
 async function load(){
  const id=++seq;state.loading=true;paintList();
  try{const data=await api('role-matrix?q='+encodeURIComponent(state.q));if(state.removed||id!==seq)return;state.roles=data.roles||[];state.counts=data.counts||{};state.error='';}
  catch(err){if(id===seq)state.error=err.message||'Unable to load Roles';}
  finally{if(id===seq){state.loading=false;paintList();}}
 }
 async function fetchSetup(){
  if(!state.setup)state.setup=await api('role-matrix/setup');
 }
 function formState(old=null){return {id:old?.id||null,version:old?.version||null,name:old?.name||'',code:old?.code||'',departmentId:old?.departmentId||'',userType:old?.userType||'Standard User',description:old?.description||'',status:old?.status||'Active',
  permissions:structuredClone(old?.permissions||{}),fields:structuredClone(old?.fields||{})};}
 function dialog(title,body){
  const d=document.createElement('dialog');d.className='rpm-modal';
  d.innerHTML='<section class="rpm-dialog"><header><h2>'+e(title)+'</h2><button type="button" aria-label="Close" data-rpm="close">×</button></header>'+
    '<div class="rpm-body">'+body+'</div></section>';
  document.body.append(d);d.showModal();return d;
 }
 function closeWizard(){
  if(state.dirty&&!confirm('Discard unsaved Role Matrix changes?'))return;
  document.querySelector('dialog.rpm-modal')?.remove();state.wizard=null;state.dirty=false;state.step=0;
 }
 function rules(){
  const d=state.wizard,scope=state.setup.scopes,actions=state.setup.actions;
  return '<div class="rpm-rule-table"><table><thead><tr><th>Resource</th>'+actions.map(a=>'<th>'+e(a)+'</th>').join('')+'<th>Record Scope</th></tr></thead><tbody>'+
    catalog().map(r=>{
     const data=d.permissions[r.key]||{actions:[],scope:'None'},locked=!r.eligible||r.locked||r.essential;
     return '<tr class="'+(locked?'rpm-disabled':'')+'"><td><strong>'+e(r.name)+'</strong><small>'+e(r.section)+(locked?' · Blocked / Locked':'')+'</small></td>'+
      actions.map(a=>'<td><input type="checkbox" data-resource="'+e(r.key)+'" data-action="'+e(a)+'" aria-label="'+e(r.name+' '+a)+'"'+(data.actions.includes(a)?' checked':'')+(locked?' disabled':'')+'></td>').join('')+
      '<td><select data-resource="'+e(r.key)+'" data-scope="true" aria-label="'+e(r.name)+' Record Scope"'+(locked?' disabled':'')+'>'+
      scope.map(v=>option(v,v,data.scope)).join('')+'</select></td></tr>';
    }).join('')+'</tbody></table></div>';
 }
 function fields(){
  const d=state.wizard;
  const source=available().filter(r=>d.permissions[r.key]?.actions.includes('View')&&state.setup.fieldCatalog[r.key]);
  return source.length?source.map(r=>'<article class="rpm-field-module"><h4>'+e(r.name)+'</h4><table><thead><tr><th>Field</th><th>Editable</th><th>Read Only</th><th>Hidden</th></tr></thead><tbody>'+
   state.setup.fieldCatalog[r.key].map(f=>{
    const selected=d.fields[r.key]?.[f.key]||(f.locked?'Read Only':'Editable');
    return '<tr><td>'+e(f.label)+(f.locked?' <small>Locked</small>':'')+'</td>'+state.setup.fieldStates.map(v=>'<td><input type="radio" name="field-'+e(r.key)+'-'+e(f.key)+'" data-field-resource="'+e(r.key)+'" data-field-key="'+e(f.key)+'" value="'+e(v)+'"'+(selected===v?' checked':'')+(f.locked?' disabled':'')+'></td>').join('')+'</tr>';
   }).join('')+'</tbody></table></article>').join(''):'<p class="rpm-hint">No field catalogue is available for the selected modules with View permission.</p>';
 }
 function review(){
  const d=state.wizard,dept=state.setup.departments.find(x=>x.id===d.departmentId);
  return '<div class="rpm-review"><h4>Role Details</h4><p><strong>'+e(d.name)+'</strong> ('+e(d.code)+') · '+e(d.userType)+' · '+e(dept?.name)+'</p>'+
   '<p>'+e(d.description||'No description')+'</p><h4>Permission Set</h4>'+
   (Object.entries(d.permissions).filter(([,v])=>v.actions.length).map(([key,v])=>'<p>'+e(catalog().find(r=>r.key===key)?.name||key)+': '+e(v.actions.join(', '))+' · '+e(v.scope)+'</p>').join('')||'<p>No actions granted</p>')+
   '<h4>Field-Level Security</h4><p>'+Object.keys(d.fields).length+' module(s) configured</p>'+
   '<p class="rpm-hint">These are reusable configurations only. No user is granted a Role Matrix role until User Management assigns it.</p></div>';
 }
 function wizardMarkup(){
  const d=state.wizard,lock=!!d.id;
  let html='';
  if(state.step===0)html='<form class="rpm-details" id="rpm-details">'+
   '<label>Role Name *<input name="name" required maxlength="150" value="'+e(d.name)+'"></label>'+
   '<label>Role Code *<input name="code" required maxlength="30" value="'+e(d.code)+'"></label>'+
   '<label>Department *<select name="departmentId" required'+(lock?' disabled':'')+'>'+option('','Select Department',d.departmentId)+state.setup.departments.map(x=>option(x.id,x.name+' ('+x.scope+')',d.departmentId)).join('')+'</select></label>'+
   '<label>User Type *<select name="userType" required'+(lock?' disabled':'')+'>'+['Admin','Manager','Standard User'].map(x=>option(x,x,d.userType)).join('')+'</select></label>'+
   '<label class="rpm-full">Description<textarea name="description" maxlength="1000">'+e(d.description)+'</textarea></label></form>';
  if(state.step===1)html='<p class="rpm-hint">Unavailable or system-locked resources are greyed out. Permissions are subject to the higher-level Module Directory ceiling.</p>'+rules();
  if(state.step===2)html='<p class="rpm-hint">Editable is the default. System-managed fields are locked. Only modules with View are configurable.</p>'+fields();
  if(state.step===3)html=review();
  return '<div class="rpm-stepbar">'+steps.map((s,i)=>'<span class="'+(i===state.step?'rpm-current':'')+'">'+(i+1)+'. '+e(s)+'</span>').join('')+'</div>'+
   '<div class="rpm-stepbody">'+html+'</div><p class="rpm-form-error" role="alert"></p>'+
   '<footer class="rpm-foot">'+button('Cancel','close')+button('Back','back')+button(state.step===3?'Save Role':'Next',state.step===3?'save':'next','rpm-primary')+'</footer>';
 }
 function redrawWizard(){
  const d=document.querySelector('dialog.rpm-modal');if(!d)return;
  d.querySelector('.rpm-body').innerHTML=wizardMarkup();
  const back=d.querySelector('[data-rpm="back"]');back.disabled=state.step===0;
  const form=d.querySelector('form');if(form)form.oninput=()=>{state.dirty=true;};
  d.querySelectorAll('[data-resource]').forEach(el=>el.onchange=()=>{
   const key=el.dataset.resource,entry=state.wizard.permissions[key]||{actions:[],scope:'None'};
   if(el.dataset.action){
    const actions=new Set(entry.actions);el.checked?actions.add(el.dataset.action):actions.delete(el.dataset.action);
    if(el.dataset.action==='View'&&!el.checked){actions.clear();entry.scope='None';delete state.wizard.fields[key];}
    entry.actions=[...actions];
    if(entry.actions.includes('View')&&entry.scope==='None')entry.scope='My Records';
   }else entry.scope=el.value;
   if(!entry.actions.length){delete state.wizard.permissions[key];delete state.wizard.fields[key];}
   else state.wizard.permissions[key]=entry;
   state.dirty=true;redrawWizard();
  });
  d.querySelectorAll('[data-field-key]').forEach(el=>el.onchange=()=>{
   const key=el.dataset.fieldResource,name=el.dataset.fieldKey;
   state.wizard.fields[key]||={};state.wizard.fields[key][name]=el.value;state.dirty=true;
  });
 }
 function captureDetails(){
  const form=document.querySelector('dialog.rpm-modal #rpm-details');if(!form.reportValidity())return false;
  const d=state.wizard;d.name=form.elements.name.value.trim();d.code=form.elements.code.value.trim().toUpperCase();
  d.description=form.elements.description.value.trim();
  if(!d.id){d.departmentId=form.elements.departmentId.value;d.userType=form.elements.userType.value;}
  if(!d.departmentId)return false;
  return true;
 }
 async function wizard(action,id){
  try{
   await fetchSetup();const old=id?(await api('role-matrix/'+id)).role:null;
   state.wizard=formState(old);state.step=0;state.dirty=false;
   const d=dialog(old?'Edit Permission Role':'Create Permission Role','');redrawWizard();
  }catch(err){state.error=err.message;paintList();}
 }
 async function doSave(){
  const d=state.wizard;
  try{
   const payload={name:d.name,code:d.code,description:d.description,permissions:d.permissions,fields:d.fields};
   if(d.id){payload.version=d.version;payload.status=d.status;}
   else{payload.departmentId=d.departmentId;payload.userType=d.userType;}
   await api('role-matrix'+(d.id?'/'+d.id:''),d.id?'PUT':'POST',payload);
   state.dirty=false;closeWizard();state.notice='Permission Role saved.';await load();
  }catch(err){const p=document.querySelector('.rpm-form-error');if(p)p.textContent=err.message||'Unable to save role';}
 }
 async function onClick(ev){
  const b=ev.target.closest('[data-rpm]');if(!b)return;
  const [action,id]=b.dataset.rpm.split(':');ev.preventDefault();
  if(action==='create'||action==='edit'){await wizard(action,id);return;}
  if(action==='view'){const r=state.roles.find(x=>x.id===id);if(r){await wizard(action,id);state.step=3;redrawWizard();}return;}
  if(action==='history'){try{const data=await api('role-matrix/'+id+'/history'),d=dialog('Role Audit History','<div class="rpm-history">'+(data.history||[]).map(x=>'<p>'+e(x.action)+' · '+e(x.actor)+' · '+e(new Date(x.createdAt).toLocaleString())+'</p>').join('')+'</div><footer>'+button('Close','close')+'</footer>');state.dirty=false;}catch(err){state.error=err.message;paintList();}return;}
  if(action==='close'){closeWizard();return;}
  if(action==='back'){if(state.step>0)state.step--;redrawWizard();return;}
  if(action==='next'){
   if(state.step===0&&!captureDetails())return;
   if(state.step===1){
    for(const [key,p] of Object.entries(state.wizard.permissions))if(p.actions.includes('View')&&p.scope==='None'){document.querySelector('.rpm-form-error').textContent='Select a Record Scope for every module with View.';return;}
   }
   if(state.step<3)state.step++;redrawWizard();return;
  }
  if(action==='save'){await doSave();}
 }
 host.addEventListener('click',onClick);
 document.addEventListener('click',onClick);
 load();
 return {canLeave:()=>!state.dirty||confirm('Discard unsaved role changes?'),
  destroy(){state.removed=true;clearTimeout(timer);document.removeEventListener('click',onClick);document.querySelector('dialog.rpm-modal')?.remove();return true;},
  setSearch(x){state.q=String(x||'').slice(0,100);clearTimeout(timer);timer=setTimeout(load,250);}};
}
window.SCRMRoleMatrix={mount};
})();
