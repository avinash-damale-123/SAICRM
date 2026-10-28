(() => {
'use strict';
const html=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
const number=value=>Math.max(0,Number(value)||0);
const fmt=value=>number(value).toLocaleString();
function branchOverview({counts={},insights=null,query={}}={}){
 const data=insights||{},c=data.counts||counts;
 const total=number(c.total),active=number(c.active),inactive=number(c.inactive),archived=number(c.archived),deleted=number(c.deleted);
 const setup=data.setup||{},available=number(setup.businessLines),ready=number(setup.readyBusinessLines),
  withRegions=number(setup.withRegions),withCountries=number(setup.withCountries);
 const pc=available?Math.round(ready/available*100):0;
 const scope=[query.q?'Search: '+query.q:'',query.status&&query.status!=='all'?'Status: '+query.status:'',query.archived&&query.archived!=='exclude'?'State: '+query.archived:''].filter(Boolean);
 const tile=(name,value,hint)=>'<article class="mw-branch-kpi"><span>'+html(name)+'</span><strong>'+fmt(value)+'</strong><small>'+html(hint)+'</small></article>';
 const list=(rows,empty)=>rows.length?'<div class="mw-branch-overview-list">'+rows.slice(0,10).map(r=>
  '<div class="mw-branch-overview-row"><span>'+html((r.code?r.code+' — ':'')+r.name)+'</span><strong>'+fmt(r.count)+'</strong></div>').join('')+'</div>':'<p>'+html(empty)+'</p>';
 const groups=(name,description,rows,empty)=>'<section class="mw-branch-panel"><h3>'+html(name)+'</h3><p>'+html(description)+'</p>'+list(rows||[],empty)+'</section>';
 return '<div class="mw-branch-overview" data-branch-overview="live">'
  +'<header><div><h2>Branches at a Glance</h2><p>Branch Master records, operational geography and setup readiness.</p></div><span class="mw-branch-caption">Live CRM data</span></header>'
  +(scope.length?'<p class="mw-branch-caption">Current Overview filters: '+html(scope.join(' · '))+'</p>':'<p class="mw-branch-caption">Counts and breakdowns reflect the current Overview filters. Setup readiness covers all Active Business Lines.</p>')
  +'<div class="mw-branch-kpis">'+tile('Total Branches',total,'Matching current view')+tile('Active Branches',active,'Operationally active')
  +tile('Inactive Branches',inactive,'Not operationally active')+tile('Archived Branches',archived,'Historical, retained')+'</div>'
  +(total===0?'<section class="mw-branch-panel mw-branch-setup-alert"><h3>No Branch records match this view</h3><p>'
   +(scope.length?'Change or clear the Overview filters to locate existing Branch records.':'Use Home → Add to create the first Branch. Select a Business Line with an Active Region and Country presence; no demo records are required.')+'</p></section>':'')
  +'<div class="mw-branch-overview-panels">'
  +'<section class="mw-branch-panel"><h3>Business Line Setup Readiness</h3><p>'+fmt(ready)+' of '+fmt(available)+' Active Business Lines have both prerequisites for creating Branches.</p>'
  +'<strong>'+pc+'% ready</strong><div class="mw-branch-progress" role="img" aria-label="'+ready+' of '+available+' Active Business Lines ready"><div style="width:'+pc+'%"></div></div>'
  +'<div class="mw-branch-overview-list"><div class="mw-branch-overview-row"><span>With at least one Active Region</span><strong>'+fmt(withRegions)+'</strong></div>'
  +'<div class="mw-branch-overview-row"><span>With Active Country presence</span><strong>'+fmt(withCountries)+'</strong></div>'
  +'<div class="mw-branch-overview-row"><span>With both required mappings</span><strong>'+fmt(ready)+'</strong></div></div>'
  +'<p>Missing a mapping? Go to Settings & Masters → Regions or Countries → Business Line Presence.</p></section>'
  +groups('Branches by Business Line','Branch counts by associated Business Line, based on the selected view.',data.businessLines||[],'No Branch records to group by Business Line.')
  +groups('Branches by Region','Counts use each Branch’s linked Region; Region is scoped to Business Line.',data.regions||[],'No Branch records to group by Region.')
  +groups('Branches by Country','Counts use each Branch’s linked Country, not a Region–Country relationship.',data.countries||[],'No Branch records to group by Country.')
  +'</div>'
  +(deleted?'<p class="mw-branch-caption">'+fmt(deleted)+' Deleted Branch records match the current selected view and remain recoverable under lifecycle rules.</p>':'')
  +'</div>';
}
window.SCRMBranchMaster={
 mount(host){
  if(!window.SCRM.can('branchmaster')){
   host.innerHTML='<div class="mw-state" role="alert"><strong>Access restricted</strong><p>Branch Master permission required.</p></div>';
   return {canLeave(){return true},destroy(){return true}};
  }
  return window.SCRMModuleWorkspace.create(host,{
   key:'branch-master',endpoint:'branch-master',title:'Branches',singular:'Branch',
   description:'Business-Line-scoped Branch Master connected to independent Region and Country masters.',
   recordsFramework:true,renderOverview:branchOverview,api:window.SCRM.api,
   fields:[{"key":"businessLineRef","label":"Business Line","type":"select","required":true,"optionsFrom":"businessLines"},{"key":"regionRef","label":"Region","type":"select","required":true,"optionsFrom":"regions"},{"key":"countryRef","label":"Country","type":"select","required":true,"optionsFrom":"countries"},{"key":"name","label":"Branch Name","type":"text","required":true},{"key":"code","label":"Branch Code","type":"text","required":true},{"key":"fullName","label":"Branch Full Name","type":"text"},{"key":"branchType","label":"Branch Type","type":"select","options":["","Head Office","Regional Office","Branch Office","Support Office","Virtual Office"]},{"key":"city","label":"City","type":"text","required":true},{"key":"stateProvince","label":"State / Province","type":"text"},{"key":"timeZone","label":"Time Zone","type":"timezone","required":true,"default":""},{"key":"addressLine1","label":"Address Line 1","type":"text"},{"key":"addressLine2","label":"Address Line 2","type":"text"},{"key":"landmark","label":"Landmark / Area","type":"text"},{"key":"postalCode","label":"Postal / ZIP Code","type":"text"},{"key":"phoneDialCode","label":"Phone Dial Code","type":"text"},{"key":"primaryContact","label":"Primary Contact Number","type":"text"},{"key":"alternateContact","label":"Alternate Contact Number","type":"text"},{"key":"officialEmail","label":"Official Branch Email","type":"email"},{"key":"website","label":"Branch Website","type":"url"},{"key":"operationalStartDate","label":"Operational Start Date","type":"date"},{"key":"legacyBranchCode","label":"External / Legacy Branch Code","type":"text"},{"key":"branchManagerRef","label":"Branch Manager","type":"select","optionsFrom":"branchManagers"},{"key":"remarks","label":"Remarks","type":"textarea","full":true},{"key":"status","label":"Status","type":"select","views":["edit"],"options":["Active","Inactive"]}],
   columns:[{"key":"name","label":"Branch Name","locked":true,"type":"text"},{"key":"displayId","label":"Branch ID","locked":true,"type":"text"},{"key":"businessLine","label":"Business Line","locked":false,"type":"text"},{"key":"region","label":"Region","locked":false,"type":"text"},{"key":"country","label":"Country","locked":false,"type":"text"},{"key":"code","label":"Branch Code","locked":false,"type":"text"},{"key":"city","label":"City","locked":false,"type":"text"},{"key":"timeZone","label":"Time Zone","locked":false,"type":"text"},{"key":"status","label":"Status","locked":false,"type":"text"},{"key":"owner","label":"Owner","locked":false,"type":"text"},{"key":"updatedAt","label":"Last Modified At","locked":false,"type":"date"}]
  });
 }
};
})();