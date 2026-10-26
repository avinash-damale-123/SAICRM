(() => {
'use strict';
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const amount=value=>Math.max(0,Number(value)||0);
const fmt=value=>amount(value).toLocaleString();
const share=(value,total)=>total?Math.round(amount(value)/total*100):0;
const moduleLabel=value=>String(value||'CRM').split(/[-_]/).map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(' ');

function countryOverview({counts={},insights=null,query={}}={}){
 const data=insights||{},total=amount(counts.total),active=amount(counts.active),inactive=amount(counts.inactive),archived=amount(counts.archived),deleted=amount(counts.deleted);
 const mapped=amount(data.mappedCountries),unmapped=amount(data.unmappedCountries),associations=amount(data.activePresenceLinks),
  represented=amount(data.activeBusinessLinesRepresented),available=amount(data.activeBusinessLinesAvailable);
 const continents=Array.isArray(data.continents)?data.continents:[],businessLines=Array.isArray(data.businessLines)?data.businessLines:[],
  usage=Array.isArray(data.usedIn)?data.usedIn:[];
 const scope=[query.q?'Search: '+query.q:'',query.status&&query.status!=='all'?'Status: '+query.status:'',query.archived&&query.archived!=='exclude'?'State: '+query.archived:''].filter(Boolean);
 const statuses=[{name:'Active',value:active,kind:'active',color:'#0b9965'},{name:'Inactive',value:inactive,kind:'inactive',color:'#f59a29'},
  {name:'Archived',value:archived,kind:'archived',color:'#90a2bb'},{name:'Deleted',value:deleted,kind:'deleted',color:'#64748b'}];
 let accumulated=0;
 const stops=statuses.map(item=>{const from=accumulated;accumulated+=total?item.value/total*100:0;return item.color+' '+from+'% '+accumulated+'%';});
 const donut=total?'conic-gradient('+stops.join(',')+')':'conic-gradient(#e6ecf3 0 100%)';
 const card=(title,value,hint,key)=>'<article class="mw-dashboard-metric mw-country-metric" data-country-metric="'+key+'"><span>'+esc(title)+'</span><strong>'+fmt(value)+'</strong><small>'+esc(hint)+'</small></article>';
 const empty=message=>'<p class="mw-country-empty">'+esc(message)+'</p>';
 const bars=(rows,denominator,labelFn,limit=12,linkBusinessLines=false)=>{
  const visible=rows.slice(0,limit);
  return '<div class="mw-country-chart" role="list">'+visible.map(row=>{
   const name=labelFn(row),value=amount(row.count),percentage=share(value,denominator);
   return '<div class="mw-country-bar-row" role="listitem"><div class="mw-country-bar-head">'+(linkBusinessLines&&row.id?'<button type="button" class="mw-country-overview-link" data-country-line-id="'+esc(row.id)+'" title="View Business Line '+esc(row.name||row.code)+'">'+esc(name)+'</button>':'<span title="'+esc(name)+'">'+esc(name)+'</span>')+'<strong>'+fmt(value)+' <small>('+percentage+'%)</small></strong></div><div class="mw-country-track"><div class="mw-country-fill" style="width:'+percentage+'%"></div></div></div>';
  }).join('')+'</div>'+(rows.length>limit?'<p class="mw-country-footnote">Showing '+limit+' of '+rows.length+' groups, ordered by active Country count.</p>':'');
 };
 return '<div class="mw-country-overview" data-country-overview="live">'
  +'<header class="mw-country-overview-head"><div><h2>Countries at a Glance</h2><p>Country Master information, business-line relationships and recorded CRM usage.</p></div><span class="mw-country-source">Live CRM data</span></header>'
  +(scope.length?'<p class="mw-country-scope">Current Overview filters: '+esc(scope.join(' · '))+'</p>':'<p class="mw-country-scope">Metrics reflect the current Overview search and filters across all matching records—not just one page.</p>')
  +(total===0?'<div class="mw-country-empty-banner" role="status"><strong>No Countries in this view yet.</strong><span>Country totals and relationships will appear as records are created or imported. Filters may also be hiding existing records.</span></div>':'')
  +'<div class="mw-dashboard-metrics mw-country-metrics">'
  +card('Total Countries',total,'Matching current Overview filters','total')
  +card('Active Countries',active,share(active,total)+'% of matching Countries','active')
  +card('With Business Line Presence',mapped,'Active Countries mapped to Active Business Lines','mapped')
  +card('Without Business Line Presence',unmapped,'Active Countries without an operational mapping','unmapped')
  +card('Active Business Lines Covered',represented,'Of '+fmt(available)+' currently Active Business Lines','covered')
  +card('Country–Business Line Links',associations,'Operational Country/Business Line associations','links')
  +'</div>'
  +'<div class="mw-dashboard-visuals mw-country-visuals">'
  +'<section class="mw-visual-card mw-country-panel" data-country-panel="status"><h3>Country Status Distribution</h3><p class="mw-visual-subtitle">Based on the matching Country records.</p><div class="mw-donut-layout"><div class="mw-donut" role="img" aria-label="'+esc(statuses.map(row=>row.name+': '+row.value).join(', '))+'" style="background:'+donut+'"><div class="mw-donut-center"><strong>'+fmt(total)+'</strong><span>Countries</span></div></div><div class="mw-donut-legend">'+statuses.map(row=>'<div><span class="mw-legend-dot mw-country-legend-'+row.kind+'"></span><span>'+row.name+'</span><strong>'+fmt(row.value)+' ('+share(row.value,total)+'%)</strong></div>').join('')+'</div></div></section>'
  +'<section class="mw-visual-card mw-country-panel" data-country-panel="continent"><h3>Countries by Continent</h3><p class="mw-visual-subtitle">Active Countries in the selected view; each Country counted once.</p>'
  +(continents.length?bars(continents,active,row=>row.name):empty('No Active Country records are available for continent analysis.'))+'</section>'
  +'<section class="mw-visual-card mw-country-panel" data-country-panel="presence"><h3>Business Line Presence</h3><p class="mw-visual-subtitle">Only Active Countries mapped to currently Active Business Lines are included.</p>'
  +'<div class="mw-country-coverage"><strong>'+fmt(represented)+' / '+fmt(available)+'</strong><span>Active Business Lines with operational Country presence</span></div>'
  +(businessLines.length?bars(businessLines,active,row=>(row.code?row.code+' — ':'')+row.name,12,true):empty('No operational Country–Business Line mappings in the selected view.'))
  +'</section>'
  +'<section class="mw-visual-card mw-country-panel" data-country-panel="usage"><h3>Related CRM Record Usage</h3><p class="mw-visual-subtitle">Existing CRM records that reference Countries in this view through supported Country fields.</p>'
  +(usage.length?'<div class="mw-country-usage">'+usage.map(row=>'<div class="mw-country-usage-row"><span>'+esc(moduleLabel(row.module))+'</span><strong>'+fmt(row.count)+' record'+(amount(row.count)===1?'':'s')+'</strong></div>').join('')+'</div>':empty('No linked CRM records were found for the selected Countries.'))
  +'<p class="mw-country-footnote">Business Line Presence is a separate relationship and is counted above; CRM usage only counts supported record references.</p></section>'
  +'</div></div>';
}
window.SCRMCountries = {
 mount(host) {
  if(!window.SCRM.can('countries')){
   host.innerHTML='<div class="mw-state" role="alert"><strong>Access restricted</strong><p>Countries is available to the Super Admin.</p></div>';
   return {canLeave(){return true},destroy(){return true}};
  }
  return window.SCRMModuleWorkspace.create(host,{
   key:'countries',endpoint:'countries',title:'Countries',singular:'Country',
   description:'Maintain the global Country reference master and Business Line Presence.',recordsFramework:true,renderOverview:countryOverview,api:window.SCRM.api,
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