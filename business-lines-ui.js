(() => {
'use strict';
window.SCRMBusinessLines = {
 mount(host) {
  if(!window.SCRM.can('businesslines')){host.innerHTML='<div class="mw-state" role="alert"><strong>Access restricted</strong><p>Business Lines is available to the Super Admin.</p></div>';return {canLeave(){return true},destroy(){return true}}}
  return window.SCRMModuleWorkspace.create(host,{
   key:'business-lines',endpoint:'business-lines',title:'Business Lines',singular:'Business Line',
   description:'Manage the business lines that organize your enterprise.',import:false,api:window.SCRM.api,
   fields:[
    {key:'name',label:'Business Line Name',type:'text',required:true,maxLength:150,full:false},
    {key:'code',label:'Business Line Code',type:'text',required:true,maxLength:20,views:['create','edit']},
    {key:'owner',label:'Owner',type:'readonly'},
    {key:'description',label:'Business Line Description',type:'textarea',maxLength:500,full:true,views:['create','edit']}
   ],
   columns:[
    {key:'displayId',label:'Business Line ID',type:'id',locked:true},
    {key:'name',label:'Business Line Name',locked:true},
    {key:'status',label:'Status'},
    {key:'owner',label:'Owner'},
    {key:'code',label:'Business Line Code',default:false},
    {key:'description',label:'Business Line Description',default:false},
    {key:'isArchived',label:'Is Archived',system:true,default:false},
    {key:'archivedById',label:'Archived By ID',system:true,default:false},
    {key:'archivedAt',label:'Archived At',system:true,type:'date',default:false},
    {key:'isDeleted',label:'Is Deleted',system:true,default:false},
    {key:'deletedById',label:'Deleted By ID',system:true,default:false},
    {key:'deletedAt',label:'Deleted At',system:true,type:'date',default:false},
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