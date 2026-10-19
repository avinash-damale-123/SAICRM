(() => {
'use strict';
window.SCRMBusinessLines = {
 mount(host) {
  if(!window.SCRM.can('businesslines')){host.innerHTML='<div class="mw-state" role="alert"><strong>Access restricted</strong><p>Business Lines is available to the Super Admin.</p></div>';return {canLeave(){return true},destroy(){return true}}}
  return window.SCRMModuleWorkspace.create(host,{
   key:'business-lines',endpoint:'business-lines',title:'Business Lines',singular:'Business Line',
   description:'Manage the business lines that organize your enterprise.',import:false,api:window.SCRM.api,
   fields:[
    {key:'name',label:'Business Line Name',type:'text',required:true,maxLength:120,full:true},
    {key:'status',label:'Status',type:'select',options:['Active','Inactive'],default:'Active',views:['edit']},
    {key:'owner',label:'Owner',type:'readonly'},
    {key:'remarks',label:'Remarks',type:'textarea',maxLength:255,full:true}
   ],
   columns:[
    {key:'displayId',label:'Business Line ID',type:'id',locked:true},
    {key:'name',label:'Business Line Name',locked:true},
    {key:'status',label:'Status'},
    {key:'owner',label:'Owner'},
    {key:'remarks',label:'Remarks',default:false},
    {key:'createdBy',system:true,label:'Created By',default:false},
    {key:'createdAt',system:true,label:'Created At',type:'date',default:false},
    {key:'updatedBy',system:true,label:'Last Modified By'},
    {key:'updatedAt',system:true,label:'Last Modified At',type:'date'},
    {key:'id',system:true,label:'Record UUID',type:'id',default:false},
    {key:'ownerId',system:true,label:'Owner ID',type:'id',default:false},
    {key:'createdById',system:true,label:'Created By ID',type:'id',default:false},
    {key:'updatedById',system:true,label:'Last Modified By ID',type:'id',default:false}
   ]
  });
 }
};
})();