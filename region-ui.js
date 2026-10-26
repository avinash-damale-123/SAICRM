(() => {
'use strict';
window.SCRMRegions = {
 mount(host) {
  if(!window.SCRM.can('regions')){
   host.innerHTML='<div class="mw-state" role="alert"><strong>Access restricted</strong><p>Your current CRM access does not include Region Master.</p></div>';
   return {canLeave(){return true},destroy(){return true}};
  }
  return window.SCRMModuleWorkspace.create(host,{
   key:'regions',endpoint:'regions',title:'Regions',singular:'Region',
   description:'Maintain Business-Line-scoped operational Regions used by Branch records.',recordsFramework:true,api:window.SCRM.api,
   fields:[
    {key:'businessLineRef',label:'Business Line',type:'select',required:true,optionsFrom:'businessLines'},
    {key:'name',label:'Region Name',type:'text',required:true,maxLength:100},
    {key:'code',label:'Region Code',type:'text',required:true,maxLength:16},
    {key:'regionalManager',label:'Regional Manager',type:'text',required:true,maxLength:100},
    {key:'remarks',label:'Remarks',type:'textarea',maxLength:1000,full:true}
   ],
   columns:[
    {key:'displayId',label:'Region ID',type:'id',locked:true},
    {key:'businessLine',label:'Business Line'},
    {key:'name',label:'Region Name',locked:true},
    {key:'code',label:'Region Code'},
    {key:'regionalManager',label:'Regional Manager'},
    {key:'status',label:'Status'},
    {key:'owner',label:'Owner'},
    {key:'updatedAt',system:true,label:'Last Modified At',type:'date'},
    {key:'businessLineId',label:'Business Line ID',type:'id',system:true,default:false},
    {key:'remarks',label:'Remarks',default:false},
    {key:'ownerId',system:true,label:'Owner ID',type:'id',default:false},
    {key:'createdBy',system:true,label:'Created By',default:false},
    {key:'createdById',system:true,label:'Created By ID',type:'id',default:false},
    {key:'createdAt',system:true,label:'Created At',type:'date',default:false},
    {key:'updatedBy',system:true,label:'Last Modified By',default:false},
    {key:'updatedById',system:true,label:'Last Modified By ID',type:'id',default:false},
    {key:'archivedBy',system:true,label:'Archived By',default:false},
    {key:'archivedById',system:true,label:'Archived By ID',type:'id',default:false},
    {key:'archivedAt',system:true,label:'Archived At',type:'date',default:false},
    {key:'deletedBy',system:true,label:'Deleted By',default:false},
    {key:'deletedById',system:true,label:'Deleted By ID',type:'id',default:false},
    {key:'deletedAt',system:true,label:'Deleted At',type:'date',default:false}
   ]
  });
 }
};
})();
