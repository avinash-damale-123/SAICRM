(() => {
'use strict';
window.SCRMCountries = {
 mount(host) {
  if(!window.SCRM.can('countries')){
   host.innerHTML='<div class="mw-state" role="alert"><strong>Access restricted</strong><p>Countries is available to the Super Admin.</p></div>';
   return {canLeave(){return true},destroy(){return true}};
  }
  return window.SCRMModuleWorkspace.create(host,{
   key:'countries',endpoint:'countries',title:'Countries',singular:'Country',
   description:'Maintain the global Country reference master and Business Line Presence.',recordsFramework:true,api:window.SCRM.api,
   fields:[
    {key:'name',label:'Country Name',type:'text',required:true,maxLength:150},
    {key:'code',label:'Country Code',type:'text',required:true,maxLength:2},
    {key:'iso3',label:'ISO 3-Letter Code',type:'text',required:true,maxLength:3},
    {key:'isoNumeric',label:'ISO Numeric Code',type:'text',required:true,maxLength:3},
    {key:'dialingCode',label:'International Dialing Code',type:'text',required:true,maxLength:16},
    {key:'defaultCurrency',label:'Default Currency',type:'text',required:true,maxLength:40},
    {key:'nationality',label:'Nationality',type:'text',required:true,maxLength:150},
    {key:'continent',label:'Continent',type:'select',required:true,options:['Africa','Asia','Europe','North America','South America','Oceania','Antarctica']},
    {key:'alias',label:'Country Alias / Short Name',type:'text',maxLength:150},
    {key:'description',label:'Description / Remarks',type:'textarea',maxLength:500,full:true},
    {key:'businessLineIds',label:'Business Line Presence',type:'multi-select',optionsFrom:'businessLines',full:true}
   ],
   columns:[
    {key:'displayId',label:'Country ID',type:'id',locked:true},
    {key:'name',label:'Country Name',locked:true},
    {key:'code',label:'Country Code'},
    {key:'iso3',label:'ISO 3-Letter Code'},
    {key:'defaultCurrency',label:'Default Currency'},
    {key:'continent',label:'Continent'},
    {key:'status',label:'Status'},
    {key:'owner',label:'Owner'},
    {key:'updatedAt',system:true,label:'Last Modified At',type:'date'},
    {key:'isoNumeric',label:'ISO Numeric Code',default:false},
    {key:'dialingCode',label:'International Dialing Code',default:false},
    {key:'nationality',label:'Nationality',default:false},
    {key:'alias',label:'Country Alias / Short Name',default:false},
    {key:'description',label:'Description / Remarks',default:false},
    {key:'flag',label:'Country Flag',default:false},
    {key:'businessLinePresence',label:'Business Line Presence',default:false},
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
    {key:'deletedAt',system:true,label:'Deleted At',type:'date',default:false},
    {key:'id',system:true,label:'Record UUID',type:'id',default:false}
   ]
  });
 }
};
})();