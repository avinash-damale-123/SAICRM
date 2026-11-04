(()=>{
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const badge=x=>'<span class="mm-pill '+(x==='Active'?'mm-active':'mm-inactive')+'">'+esc(x)+'</span>';
function mount(host){
 if(!window.SCRM.can('modulemaster')){host.innerHTML='<p role="alert">Only Super Admin can access Module Directory.</p>';return {destroy:()=>true,canLeave:()=>true};}
 const api=window.SCRM.api;
 const state={resources:[],counts:{},registryCount:0,q:'',status:'all',type:'all',loading:false,notice:'',error:'',editing:false,dirty:false,destroyed:false};
 let requestId=0,searchTimer=0;
 const b=(label,action,style='')=>'<button type="button" class="mm-btn '+style+'" data-mm="'+esc(action)+'">'+esc(label)+'</button>';
 const filter=['all','Active','Inactive'],types=['all','MODULE','PAGE','FUNCTION'];
 const opts=(values,selected)=>values.map(x=>'<option value="'+esc(x)+'"'+(x===selected?' selected':'')+'>'+esc(x==='all'?'All':x)+'</option>').join('');
 function render(){
  if(state.destroyed)return;
  const c=state.counts;
  host.innerHTML='<section class="mm-container"><header class="mm-heading"><small>SETTINGS & MASTERS</small>'+
   '<h2>Module Directory</h2><p>Access-eligibility registry — determine which resources can be granted to Admin, Manager or Standard User. Super Admin always has access.</p>'+
   '<div class="mm-actions">'+b('⟳ Sync Resources','sync')+b('Export CSV','export')+'</div></header>'+
   '<div class="mm-metrics">'+[
    ['Total',c.total],['Active',c.active],['Pending Config',c.pendingConfig],['System Locked',c.locked],
    ['Admin Eligible',c.admin],['Manager Eligible',c.manager],['Standard Eligible',c.standard]
   ].map(([k,v])=>'<article><span>'+esc(k)+'</span><strong>'+Number(v||0).toLocaleString()+'</strong></article>').join('')+'</div>'+
   '<div class="mm-feedback" role="status">'+esc(state.notice)+'</div>'+
   (state.error?'<div class="mm-error" role="alert">'+esc(state.error)+'</div>':'')+
   '<div class="mm-filters"><label class="mm-search-label">Search resources<input type="search" id="mm-search" placeholder="Search name, key, section, route…" value="'+esc(state.q)+'"></label>'+
   '<label>Status<select id="mm-status">'+opts(filter,state.status)+'</select></label>'+
   '<label>Type<select id="mm-type">'+opts(types,state.type)+'</select></label></div>'+
   '<div class="mm-panel">'+(state.loading?'<p>Loading registered resources…</p>':
    '<div class="mm-scroller"><table class="mm-table"><thead><tr>'+
    ['Res ID','Name','Type','Section','Admin','Manager','Standard','Status','Actions'].map(x=>'<th>'+x+'</th>').join('')+
    '</tr></thead><tbody>'+(state.resources.length?state.resources.map(r=>
     '<tr><td>'+esc(r.displayId)+'</td><td><strong>'+esc(r.name)+'</strong><small>'+esc(r.key)+'</small>'+
     (r.essential?'<small>Essential · Always available</small>':'')+'</td><td>'+esc(r.type)+'</td><td>'+esc(r.section)+'</td>'+
     ['adminAllowed','managerAllowed','standardAllowed'].map(k=>'<td>'+((r[k]||r.commonResource)?'✓':'—')+'</td>').join('')+
     '<td>'+badge(r.status)+'</td><td>'+b('Edit','edit:'+r.id)+b('History','history:'+r.id)+'</td></tr>').join(''):
     '<tr><td colspan="9"><div class="mm-empty">No registered resources match the current filters. Use Sync Resources to reconcile deployed resources.</div></td></tr>')+
    '</tbody></table></div>')+'</div></section>';
  host.querySelector('#mm-search').oninput=e=>{state.q=e.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(load,250);};
  host.querySelector('#mm-status').onchange=e=>{state.status=e.target.value;load();};
  host.querySelector('#mm-type').onchange=e=>{state.type=e.target.value;load();};
 }
 async function load(){
  const n=++requestId;state.loading=true;render();
  try{
   const q=new URLSearchParams({q:state.q,status:state.status,type:state.type});
   const data=await api('module-master?'+q);
   if(state.destroyed||requestId!==n)return;
   state.resources=data.resources||[];state.counts=data.counts||{};state.registryCount=data.registryCount;state.error='';
  }catch(e){if(requestId===n)state.error=e.message||'Unable to read Module Directory';}
  finally{if(n===requestId){state.loading=false;render();}}
 }
 function modal(title,html,save){
  const d=document.createElement('dialog');d.className='mm-modal';state.editing=true;state.dirty=false;
  d.innerHTML='<section class="mm-dialog"><header><h2>'+esc(title)+'</h2><button class="mm-dismiss" type="button" aria-label="Close">×</button></header>'+
   '<div class="mm-modal-content">'+html+'</div><footer><button type="button" class="mm-cancel">Cancel</button>'+
   (save?'<button type="submit" form="mm-form" class="mm-btn mm-primary">Save</button>':'')+'</footer></section>';
  document.body.append(d);d.showModal();
  const close=()=>{if(state.dirty&&!confirm('Discard unsaved changes?'))return;state.editing=false;state.dirty=false;d.close();d.remove();};
  d.querySelector('.mm-dismiss').onclick=close;d.querySelector('.mm-cancel').onclick=close;
  d.addEventListener('cancel',e=>{e.preventDefault();close();});
  if(save){
   const f=d.querySelector('form');f.onchange=()=>{state.dirty=true;};
   f.onsubmit=async e=>{e.preventDefault();const button=d.querySelector('[type="submit"]');button.disabled=true;
    try{await save(f);state.dirty=false;d.close();d.remove();state.editing=false;state.notice='Resource eligibility updated.';await load();}
    catch(err){d.querySelector('.mm-modal-error').textContent=err.message;button.disabled=false;}};
  }
 }
 function edit(id){
  const r=state.resources.find(x=>x.id===id);if(!r)return;
  const check=(name,key,disabled=false)=>'<label class="mm-check"><input type="checkbox" name="'+key+'"'+(r[key]?' checked':'')+
   (disabled?' disabled':'')+'><span>'+esc(name)+'</span></label>';
  const html='<p><strong>'+esc(r.name)+'</strong> · '+esc(r.key)+'</p><p>Section: '+esc(r.section)+' · Type: '+esc(r.type)+
   '</p><form id="mm-form"><fieldset><legend>ELIGIBILITY — Super Admin always has access</legend>'+
   check('Admin Allowed','adminAllowed',r.essential||r.key==='MODULE_MASTER')+
   check('Manager Allowed','managerAllowed',r.essential||r.key==='MODULE_MASTER')+
   check('Standard User Allowed','standardAllowed',r.essential||r.key==='MODULE_MASTER')+
   check('Common Resource','commonResource',r.essential||r.key==='MODULE_MASTER')+'</fieldset>'+
   '<label class="mm-field">Status<select name="status"'+(r.essential?' disabled':'')+'>'+['Active','Inactive'].map(x=>'<option'+(x===r.status?' selected':'')+'>'+x+'</option>').join('')+'</select></label>'+
   '<p class="mm-hint">'+(r.essential?'Essential resources cannot be disabled.':r.key==='MODULE_MASTER'?'Module Directory cannot be granted to non-Super-Admins.':'Disabled resources cannot be re-enabled by Role Matrix or Permission Sets.')+
   '</p><p class="mm-modal-error" role="alert"></p></form>';
  modal('Edit Module Eligibility',html,async f=>{
   const data={version:r.version,adminAllowed:f.elements.adminAllowed.checked,managerAllowed:f.elements.managerAllowed.checked,
    standardAllowed:f.elements.standardAllowed.checked,commonResource:f.elements.commonResource.checked,
    status:f.elements.status.disabled?r.status:f.elements.status.value};
   if(r.essential){data.commonResource=true;data.status='Active';}
   if(r.key==='MODULE_MASTER'){data.adminAllowed=false;data.managerAllowed=false;data.standardAllowed=false;data.commonResource=false;}
   await api('module-master/'+id,'PUT',data);
  });
 }
 async function history(id){
  try{
   const r=state.resources.find(x=>x.id===id),data=await api('module-master/'+id+'/history');
   modal('Module Directory Audit — '+r.name,'<div class="mm-events">'+(data.history?.length?data.history.map(x=>'<p><strong>'+esc(x.action)+'</strong> · '+esc(x.actor)+' · '+esc(new Date(x.createdAt).toLocaleString())+'</p>').join(''):'<p>No events recorded.</p>')+'</div>');
  }catch(e){state.error=e.message;render();}
 }
 function exportCsv(){
  const head=['Res ID','Name','Key','Type','Section','Route','Admin','Manager','Standard','Common','Status'];
  const body=state.resources.map(x=>[x.displayId,x.name,x.key,x.type,x.section,x.route,x.adminAllowed,x.managerAllowed,x.standardAllowed,x.commonResource,x.status]);
  const cell=v=>{let s=String(v??'');if(/^\s*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const blob=new Blob(['\uFEFF'+[head,...body].map(x=>x.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='module-master.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
 }
 async function click(e){
  const x=e.target.closest('[data-mm]');if(!x)return;const [action,id]=x.dataset.mm.split(':');
  if(action==='sync'){x.disabled=true;try{const r=await api('module-master/sync','POST',{});state.notice='Seeded: '+r.sync.created+' created, '+r.sync.refreshed+' refreshed';await load();}catch(err){state.error=err.message;render();}finally{x.disabled=false;}}
  if(action==='edit')edit(id);
  if(action==='history')history(id);
  if(action==='export')exportCsv();
 }
 host.addEventListener('click',click);load();
 return {canLeave:()=>!state.editing||!state.dirty||confirm('Discard unsaved Module Directory changes?'),
  destroy(){state.destroyed=true;clearTimeout(searchTimer);document.querySelectorAll('dialog.mm-modal').forEach(x=>x.remove());return true;},
  setSearch(q){state.q=String(q||'').slice(0,150);clearTimeout(searchTimer);searchTimer=setTimeout(load,250);}};
}
window.SCRMModuleMaster={mount};
})();