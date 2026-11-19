(function(){
'use strict';
const pages={v3targets:'targets',v3leads:'leads',v3crfs:'crfs',v3accounts:'accounts',v3contacts:'contacts',v3activities:'activities',v3campaigns:'campaigns',v3dashboard:'dashboard',v3globalclients:'globalclients'};
const labels={targets:'Target Lists',leads:'Qualified Leads',crfs:'CRF / Finance Approvals',accounts:'Local Accounts',contacts:'Shared Contacts',activities:'Activities & Tasks',campaigns:'Campaigns / Email Sequencing',dashboard:'Sales Dashboard',globalclients:'Global Clients'};
const descriptions={targets:'Prospect Corporate and Non-IATA organisations before qualification.',leads:'Manage qualified business opportunities up to Commercially Won.',crfs:'Collect verified onboarding details and route an approved commercial win to Finance.',accounts:'Approved existing clients, created only after CRF Finance approval.',contacts:'Reusable Contact records linked to Targets, Leads and Accounts.',activities:'Shared Calls, Emails, Meetings, Visits, MoMs, Tasks and Notes.',campaigns:'Draft campaigns only. Automated external sends are disabled pending provider and policy verification.',dashboard:'Metrics from actual SAI-CRM v3 records, not projected or imported figures.',globalclients:'Central organisation identity and parent relationships; local records remain isolated.'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=x=>x?new Date(x).toLocaleString():'-';
const read=x=>x===null||x===undefined||x===''?'-':String(x);
function el(name,attrs={},html=''){const node=document.createElement(name);for(const[k,v]of Object.entries(attrs))node.setAttribute(k,v);node.innerHTML=html;return node;}
function fields(kind){
 if(kind==='targets')return [['name','Company / Agency Name','text',true],['segment','Segment','select',true,['Corporate','Non-IATA']],['branchId','Business Line / Branch','branch',true],['source','Lead Source','text',false]];
 if(kind==='contacts')return [['fullName','Full Name','text',true],['email','Business Email','email',false],['phone','Phone (with country code)','text',false],['designation','Designation','text',false],['language','Preferred Language','text',false],['branchId','Business Line / Branch','branch',true]];
 if(kind==='campaigns')return [['name','Campaign Name','text',true],['branchId','Business Line / Branch','branch',true],['purpose','Purpose','select',true,['Marketing','Operational']]];
 if(kind==='globalclients')return [['name','Global Client Name','text',true]];
 if(kind==='activities')return [['kind','Activity Type','select',true,['Call','Email','Meeting','Visit','MoM','Task','Note']],['subject','Subject','text',true],['details','Details','textarea',false],['linkedKind','Related Record Type','select',true,['Target','Lead','Account']],['linkedId','Related Record UUID','text',true],['dueAt','Due Date/Time','datetime-local',false]];
 return [];
}
function rowText(item,kind){
 const name=kind==='contacts'?item.full_name:kind==='crfs'?item.lead_name:kind==='activities'?item.subject:item.name;
 const status=kind==='targets'||kind==='leads'?item.stage:item.status;
 const cols=[item.display_id,name,item.segment||item.kind||item.verification||'',status||'',date(item.updated_at||item.created_at)];
 return cols.map(x=>'<td>'+esc(read(x))+'</td>').join('');
}
function formMarkup(kind,bootstrap,item){
 const arr=kind==='crfedit'?[
 ['legalName','Legal / Agency Name','text',true],['registrationNumber','Registration Number','text',false],['businessAddress','Business Address','textarea',true],['country','Country','text',true],['city','City','text',false],['requestedArrangement','Requested Arrangement','select',true,['Cash','Credit','KYC (Cash)','KYC (Credit)']],['contactRole','Primary Contact Role','text',true],['agencyType','Non-IATA Agency Type','text',false],['industry','Industry','text',false],['notes','Finance / Onboarding Notes','textarea',false]
 ]:fields(kind);
 return '<form id="crmV3Form" data-form="'+esc(kind)+'"><div class="crm-v3-form-grid">'+arr.map(([key,label,type,mandatory,options])=>{
 const value=item?.profile?.[key]||'';
 const attrs=' name="'+esc(key)+'" '+(mandatory?'required':'')+' ';
 let control='';
 if(type==='branch')control='<select'+attrs+'><option value="">Select Business Line / Branch</option>'+(bootstrap?.branches||[]).map(b=>'<option value="'+esc(b.id)+'" data-line="'+esc(b.business_line_id)+'">'+esc(b.business_line)+' / '+esc(b.name)+' ('+esc(b.code)+')</option>').join('')+'</select>';
 else if(type==='select')control='<select'+attrs+'><option value="">Select '+esc(label)+'</option>'+options.map(o=>'<option value="'+esc(o)+'" '+(o===value?'selected':'')+'>'+esc(o)+'</option>').join('')+'</select>';
 else if(type==='textarea')control='<textarea'+attrs+' rows="3">'+esc(value)+'</textarea>';
 else control='<input type="'+esc(type)+'"'+attrs+' value="'+esc(value)+'">';
 return '<label>'+esc(label)+(mandatory?' *':'')+control+'</label>';
 }).join('')+'</div><div class="crm-v3-actions"><button type="button" data-v3="close" class="crm-v3-secondary">Cancel</button><button type="submit">Save '+(kind==='crfedit'?'CRF Details':'Record')+'</button></div></form>';
}
function mount(root,pageId){
 const kind=pages[pageId]||'targets';
 let bootstrap=null,rows=[],total=0,page=1,q='',status='',loading=false,error='',modal='',detail=null,dialogKind='',destroyed=false;
 const api=window.SCRM.api;
 const isSuper=window.SCRM.user?.systemRole==='super_admin';
 function allowedCreate(){return ['targets','contacts','activities','campaigns'].includes(kind)||kind==='globalclients'&&isSuper;}
 function notice(){return '<p class="crm-v3-note">Corporate and Non-IATA only. No Retail or automatic FACTS ledger. Outbound email sends are disabled until all approval, consent and mailbox controls are validated.</p>';}
 function render(){
  if(destroyed)return;
  root.classList.add('crm-v3');
  const count=kind==='dashboard'?'':'<span class="crm-v3-count">'+total.toLocaleString()+' records</span>';
  let body='';
  if(kind==='dashboard'){
   if(detail?.metrics){body='<div class="crm-v3-metrics">'+Object.entries(detail.metrics).map(([k,v])=>'<article class="crm-v3-metric"><div>'+esc(labels[k]||k)+'</div><strong>'+v.total.toLocaleString()+'</strong><small>'+esc(v.byStatus.map(y=>y.category+': '+y.total).join(' | '))+'</small></article>').join('')+'</div>';}
   else body='<p class="crm-v3-empty">No dashboard data loaded.</p>';
  }else{
   const statusOptions=kind==='targets'?bootstrap?.targetStages:kind==='leads'?bootstrap?.leadStages:kind==='crfs'?bootstrap?.crfStatuses:null;
   const filters='<div class="crm-v3-filters"><input id="crmV3Search" value="'+esc(q)+'" placeholder="Search accessible records" aria-label="Search records"><button type="button" data-v3="search">Search</button>'+(statusOptions?'<select id="crmV3Status"><option value="">All statuses</option>'+statusOptions.map(v=>'<option '+(v===status?'selected':'')+'>'+esc(v)+'</option>').join('')+'</select>':'')+'<button type="button" data-v3="refresh" class="crm-v3-secondary">Refresh</button></div>';
   const table='<div class="crm-v3-table-wrap"><table class="crm-v3-table"><thead><tr><th>ID</th><th>Name / Subject</th><th>Segment / Type</th><th>Stage / Status</th><th>Last Modified</th><th>Actions</th></tr></thead><tbody>'+(
    rows.length?rows.map(r=>'<tr>'+rowText(r,kind)+'<td class="crm-v3-row-actions"><button type="button" data-v3="view" data-id="'+esc(r.id)+'">View</button>'+
    (kind==='targets'&&!r.converted_at?'<button type="button" data-v3="qualify" data-id="'+esc(r.id)+'">Qualify</button>':'')+
    (kind==='leads'?'<button type="button" data-v3="stage" data-id="'+esc(r.id)+'">Stage</button>':'')+
    (kind==='crfs'&&['Pending','In Progress','Returned for Correction'].includes(r.status)&&!r.submitted_at?'<button type="button" data-v3="crfedit" data-id="'+esc(r.id)+'">Edit CRF</button><button type="button" data-v3="crfsubmit" data-id="'+esc(r.id)+'">Submit</button>':'')+
    (kind==='crfs'&&r.submitted_at&&r.status==='Pending'&&isSuper?'<button type="button" data-v3="crfdecide" data-id="'+esc(r.id)+'">Finance Decision</button>':'')+
    (kind==='contacts'?'<button type="button" data-v3="link" data-id="'+esc(r.id)+'">Link</button>':'')+
    '</td></tr>').join(''):'<tr><td colspan="6" class="crm-v3-empty">No matching records in this accessible dataset.</td></tr>')+
    '</tbody></table></div><div class="crm-v3-pagination"><span>Page '+page+' of '+Math.max(1,Math.ceil(total/25))+'</span><button type="button" data-v3="previous" '+(page<=1?'disabled':'')+'>Previous</button><button type="button" data-v3="next" '+(page*25>=total?'disabled':'')+'>Next</button></div>';
   body=filters+table;
  }
  root.innerHTML='<div class="crm-v3-head"><div><span class="crm-v3-eyebrow">SAI-CRM / Operational CRM v3</span><h1>'+esc(labels[kind])+'</h1><p>'+esc(descriptions[kind])+'</p></div><div class="crm-v3-head-actions">'+count+(allowedCreate()?'<button type="button" data-v3="new">+ Add '+esc(kind==='targets'?'Target':kind==='contacts'?'Contact':kind==='activities'?'Activity':kind==='campaigns'?'Draft Campaign':'Global Client')+'</button>':'')+'</div></div>'+notice()+(error?'<div class="crm-v3-error" role="alert">'+esc(error)+'</div>':'')+(loading?'<p class="crm-v3-loading" aria-live="polite">Loading verified CRM records...</p>':'')+body+(modal?'<section class="crm-v3-modal-bg" role="presentation"><div class="crm-v3-modal" role="dialog" aria-modal="true" aria-label="Record form"><header><h2>'+esc(dialogKind==='view'?'Record details':dialogKind==='crfedit'?'CRF Details':'New '+(labels[kind]||'Record'))+'</h2><button type="button" data-v3="close" aria-label="Close">×</button></header>'+modal+'</div></section>':'');
 }
 function setError(e){error=e?.message||String(e);render();}
 async function refresh(){
  loading=true;error='';render();
  try{
   if(!bootstrap){bootstrap=await api('crm-v3/bootstrap');}
   if(kind==='dashboard')detail=await api('crm-v3/dashboard');
   else {const params=new URLSearchParams({page:String(page),limit:'25'});if(q)params.set('q',q);if(status)params.set('status',status);const res=await api('crm-v3/'+kind+'?'+params);rows=res.records||[];total=res.total||0;}
  }catch(e){error=e?.message||'Unable to read CRM v3. Migration 017 may not be applied to this environment.';rows=[];total=0;}
  loading=false;render();
 }
 function show(kindOfForm,item){
  dialogKind=kindOfForm;
  if(kindOfForm==='view'){const entries=Object.entries(item||{}).filter(([k,v])=>!['id','profile'].includes(k)&&v!==null&&typeof v!=='object');
   const prof=item?.profile?Object.entries(item.profile).map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(Array.isArray(v)?v.join(', '):v)+'</dd>').join(''):'';
   modal='<div class="crm-v3-details"><dl>'+entries.map(([k,v])=>'<dt>'+esc(k.replace(/_/g,' '))+'</dt><dd>'+esc(String(v))+'</dd>').join('')+prof+'</dl></div><div class="crm-v3-actions"><button type="button" data-v3="close">Close</button></div>';
  }else modal=formMarkup(kindOfForm==='crfedit'?'crfedit':kind,bootstrap,item);
  render();
 }
 async function handle(event){
  const btn=event.target.closest('[data-v3]');if(!btn||loading)return;
  const action=btn.dataset.v3,id=btn.dataset.id;error='';
  try{
   if(action==='close'){modal='';dialogKind='';render();return;}
   if(action==='refresh'){await refresh();return;}
   if(action==='search'){q=root.querySelector('#crmV3Search')?.value?.trim()||'';page=1;await refresh();return;}
   if(action==='previous'){page=Math.max(1,page-1);await refresh();return;}
   if(action==='next'){page++;await refresh();return;}
   if(action==='new'){show('new',null);return;}
   if(action==='view'){const res=await api('crm-v3/'+kind+'/'+id);show('view',res.record);return;}
   if(action==='qualify'){
    const note=window.prompt('Record the actual qualifying business interest/requirement (minimum 10 characters):');
    if(note===null)return;
    const amount=window.prompt('Estimated annual potential (USD):','0');if(amount===null)return;
    const row=rows.find(x=>x.id===id);
    await api('crm-v3/targets/'+id+'/qualify','POST',{version:row.version,qualificationEvidence:note,potentialUsd:Number(amount)});
    await refresh();return;
   }
   if(action==='stage'){
    const row=rows.find(x=>x.id===id);
    const next=window.prompt('Next Lead stage: '+bootstrap.leadStages.join(' | '),row.stage);
    if(next===null)return;
    const reason=next==='Closed & Dead'?window.prompt('Closure reason (mandatory):',''):'';
    if(reason===null)return;
    await api('crm-v3/leads/'+id,'PUT',{version:row.version,stage:next,closeReason:reason});
    await refresh();return;
   }
   if(action==='crfedit'){const res=await api('crm-v3/crfs/'+id);show('crfedit',res.record);root.dataset.crfId=id;root.dataset.crfVersion=String(res.record.version);return;}
   if(action==='crfsubmit'){
    const row=rows.find(x=>x.id===id);
    await api('crm-v3/crfs/'+id+'/submit','POST',{version:row.version});
    await refresh();return;
   }
   if(action==='crfdecide'){
    const row=rows.find(x=>x.id===id);
    const decision=window.prompt('Finance decision: Approved | Rejected | Returned for Correction','Returned for Correction');
    if(decision===null)return;
    const reason=window.prompt('Reason / Finance review notes (required for non-approval):','');
    if(reason===null)return;
    const evidenceVerified=decision==='Approved'&&window.confirm('Have you independently verified all mandatory legal/KYC evidence and cash/credit conditions outside this pilot screen?');
    await api('crm-v3/crfs/'+id+'/decide','POST',{version:row.version,decision,reason,evidenceVerified});
    await refresh();return;
   }
   if(action==='link'){
    const type=window.prompt('Link Contact to: Target | Lead | Account','Target');
    if(type===null)return;
    const linkedId=window.prompt('Enter the relevant record UUID');if(!linkedId)return;
    const key={Target:'targetId',Lead:'leadId',Account:'accountId'}[type];if(!key)throw Error('Select Target, Lead or Account');
    await api('crm-v3/contacts/'+id+'/link','POST',{[key]:linkedId,relation:'Other'});
    await refresh();return;
   }
  }catch(e){setError(e);}
 }
 async function submit(event){
  const form=event.target.closest('#crmV3Form');if(!form)return;
  event.preventDefault();if(loading)return;
  const data=Object.fromEntries(new FormData(form).entries());
  try{
   if(dialogKind==='crfedit'){
    const id=root.dataset.crfId,version=Number(root.dataset.crfVersion);
    const profile=Object.fromEntries(Object.entries(data).filter(([k,v])=>v!==''));await api('crm-v3/crfs/'+id,'PUT',{version,profile});
   }else{
    if(data.branchId){const b=(bootstrap.branches||[]).find(x=>x.id===data.branchId);if(!b)throw Error('Select a valid active Branch');data.businessLineId=b.business_line_id;}
    if(kind==='activities'){
     const key={Target:'targetId',Lead:'leadId',Account:'accountId'}[data.linkedKind];
     if(!key)throw Error('Select Target, Lead or Account');data[key]=data.linkedId;delete data.linkedKind;delete data.linkedId;
    }
    await api('crm-v3/'+kind,'POST',data);
   }
   modal='';dialogKind='';await refresh();
  }catch(e){setError(e);}
 }
 const onClick=e=>{handle(e);},onSubmit=e=>{submit(e);},onChange=e=>{if(e.target.id==='crmV3Status'){status=e.target.value;page=1;refresh();}};
 const onKeydown=e=>{if(e.target.id==='crmV3Search'&&e.key==='Enter'){e.preventDefault();q=e.target.value.trim();page=1;refresh();}};
 root.addEventListener('click',onClick);root.addEventListener('submit',onSubmit);root.addEventListener('change',onChange);root.addEventListener('keydown',onKeydown);
 refresh();
 return{destroy(){destroyed=true;root.removeEventListener('click',onClick);root.removeEventListener('submit',onSubmit);root.removeEventListener('change',onChange);root.removeEventListener('keydown',onKeydown);root.classList.remove('crm-v3');},canLeave(){return true;},setSearch(next){q=next||'';page=1;refresh();}};
}
window.SCRMCRMv3={mount};
})();