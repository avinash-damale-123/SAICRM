(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function mount(root){
 let data=null,loading=false,error='',message='',destroyed=false;
 const api=window.SCRM.api;
 const select=(id,label,items,optionLabel)=>'<label for="'+id+'">'+esc(label)+'</label><select class="input" id="'+id+'" required><option value="">Select '+esc(label)+'</option>'+
  items.map(item=>'<option value="'+esc(item.id)+'">'+esc(optionLabel(item))+'</option>').join('')+'</select>';
 const draw=()=>{
  if(destroyed)return;
  root.innerHTML='<section class="crm-v3"><header class="crm-v3-head"><div><span class="crm-v3-eyebrow">Operational CRM / Administration</span><h1>CRM User Access</h1><p>Assign and revoke department-based Role Matrix permissions per Business Line and Branch. Only a Super Admin can make assignments.</p></div></header>'+
    '<p class="crm-v3-note">A Role Matrix definition does not grant access until it is assigned here. Finance approval requires an active Finance Department role with View and Approve permissions for CRF / Finance, scoped to Branch. No role can bypass maker-checker validation. Review the user, department, role and branch before granting.</p>'+
    (error?'<p class="crm-v3-error" role="alert">'+esc(error)+'</p>':'')+
    (message?'<p role="status">'+esc(message)+'</p>':'')+
    (loading?'<p>Loading authorized access information...</p>':'');
  if(!data)return;
  const form='<form id="v3AssignForm" class="crm-v3-modal" style="max-width:780px;margin:1rem 0;padding:1rem">'+
   '<h2>Assign an Operational CRM role</h2>'+
   select('v3GrantUser','Approved employee',data.users,u=>u.name+' ('+u.role+') — '+u.email)+
   select('v3GrantRole','Active Role Matrix role',data.roles,r=>r.department+' / '+r.name+' / '+r.user_type)+
   select('v3GrantBranch','Active Business Line / Branch',data.branches,b=>b.business_line+' / '+b.name)+
   '<label for="v3GrantNote">Reason or approval reference</label><input id="v3GrantNote" class="input" type="text" maxlength="500" placeholder="Reason / approval reference">'+
   '<button type="submit" class="btn">Assign role</button></form>';
  const rows=data.assignments.map(a=>'<tr><td>'+esc(a.userName)+'</td><td>'+esc(a.department+' / '+a.roleName)+'</td>'+
   '<td>'+esc(a.branchName)+'</td><td>'+esc(new Date(a.assignedAt).toLocaleString())+'</td><td>'+
   '<button type="button" class="btn" data-v3-revoke="'+esc(a.id)+'" aria-label="Revoke '+esc(a.userName)+' role">Revoke</button></td></tr>').join('');
  const table='<h2>Active assignments</h2><div class="crm-v3-table-wrap" style="overflow-x:auto"><table class="crm-v3-table"><thead><tr><th>Employee</th><th>Department / Role</th><th>Branch</th><th>Assigned at</th><th>Action</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  root.insertAdjacentHTML('beforeend',form+table);
  root.querySelector('#v3AssignForm')?.addEventListener('submit',async e=>{
   e.preventDefault();
   const userId=root.querySelector('#v3GrantUser').value,roleId=root.querySelector('#v3GrantRole').value,branchId=root.querySelector('#v3GrantBranch').value;
   if(!userId||!roleId||!branchId)return;
   const user=data.users.find(x=>x.id===userId),role=data.roles.find(x=>x.id===roleId);
   if(user?.role==='admin'&&role?.user_type!=='Admin'||user?.role==='manager'&&role?.user_type!=='Manager'||user?.role==='member'&&role?.user_type!=='Standard User'){
    error='The selected Role Matrix user type does not match the employee';draw();return;
   }
   if(!window.confirm('Grant '+user.name+' the configured '+role.name+' role for this Branch?'))return;
   await write('POST','crm-v3/access',{userId,roleId,branchId,note:root.querySelector('#v3GrantNote').value});
  });
  root.querySelectorAll('[data-v3-revoke]').forEach(btn=>btn.addEventListener('click',async()=>{
   const id=btn.dataset.v3Revoke,record=data.assignments.find(x=>x.id===id);
   if(!record||!window.confirm('Revoke '+record.userName+' access to '+record.branchName+'?'))return;
   await write('DELETE','crm-v3/access/'+encodeURIComponent(id),{reason:'Revoked through CRM User Access'});
  }));
 };
 async function write(method,path,body){loading=true;error='';message='';draw();try{const r=await api(path,method,body);message=r.message||'Access saved';data=await api('crm-v3/access');}catch(e){error=e.message}finally{loading=false;draw()}}
 async function load(){loading=true;draw();try{data=await api('crm-v3/access')}catch(e){error=e.message}finally{loading=false;draw()}}
 load();
 return {canLeave:()=>true,destroy:()=>{destroyed=true;root.classList.remove('crm-v3')}};
}
window.SCRMCRMv3Access={mount};
})();