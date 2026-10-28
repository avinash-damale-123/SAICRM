(() => {
'use strict';
window.SCRMBranchMaster={
 mount(host){
  if(!window.SCRM.can('branchmaster')){
   host.innerHTML='<div class="mw-state" role="alert"><strong>Access restricted</strong><p>Branch Master permission required.</p></div>';
   return {canLeave(){return true},destroy(){return true}};
  }
  return window.SCRMModuleWorkspace.create(host,{
   key:'branch-master',endpoint:'branch-master',title:'Branches',singular:'Branch',
   description:'Business-Line-scoped Branch Master connected to independent Region and Country masters.',
   recordsFramework:true,api:window.SCRM.api,
   fields:[{"key":"businessLineRef","label":"Business Line","type":"select","required":true,"optionsFrom":"businessLines"},{"key":"regionRef","label":"Region","type":"select","required":true,"optionsFrom":"regions"},{"key":"countryRef","label":"Country","type":"select","required":true,"optionsFrom":"countries"},{"key":"name","label":"Branch Name","type":"text","required":true},{"key":"code","label":"Branch Code","type":"text","required":true},{"key":"fullName","label":"Branch Full Name","type":"text"},{"key":"branchType","label":"Branch Type","type":"select","options":["","Head Office","Regional Office","Branch Office","Support Office","Virtual Office"]},{"key":"city","label":"City","type":"text","required":true},{"key":"stateProvince","label":"State / Province","type":"text"},{"key":"timeZone","label":"Time Zone","type":"text","required":true,"default":"UTC"},{"key":"addressLine1","label":"Address Line 1","type":"text"},{"key":"addressLine2","label":"Address Line 2","type":"text"},{"key":"landmark","label":"Landmark / Area","type":"text"},{"key":"postalCode","label":"Postal / ZIP Code","type":"text"},{"key":"phoneDialCode","label":"Phone Dial Code","type":"text"},{"key":"primaryContact","label":"Primary Contact Number","type":"text"},{"key":"alternateContact","label":"Alternate Contact Number","type":"text"},{"key":"officialEmail","label":"Official Branch Email","type":"email"},{"key":"website","label":"Branch Website","type":"url"},{"key":"operationalStartDate","label":"Operational Start Date","type":"date"},{"key":"legacyBranchCode","label":"External / Legacy Branch Code","type":"text"},{"key":"branchManagerRef","label":"Branch Manager","type":"select","optionsFrom":"branchManagers"},{"key":"remarks","label":"Remarks","type":"textarea","full":true},{"key":"status","label":"Status","type":"select","views":["edit"],"options":["Active","Inactive"]}],
   columns:[{"key":"name","label":"Branch Name","locked":true,"type":"text"},{"key":"displayId","label":"Branch ID","locked":true,"type":"text"},{"key":"businessLine","label":"Business Line","locked":false,"type":"text"},{"key":"region","label":"Region","locked":false,"type":"text"},{"key":"country","label":"Country","locked":false,"type":"text"},{"key":"code","label":"Branch Code","locked":false,"type":"text"},{"key":"city","label":"City","locked":false,"type":"text"},{"key":"timeZone","label":"Time Zone","locked":false,"type":"text"},{"key":"status","label":"Status","locked":false,"type":"text"},{"key":"owner","label":"Owner","locked":false,"type":"text"},{"key":"updatedAt","label":"Last Modified At","locked":false,"type":"date"}]
  });
 }
};
})();