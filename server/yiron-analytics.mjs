// Yiron CRM Analytics-Y1 source registry. Paths are provided by the business owner;
// the Branch endpoint path is supplied in the Postman collection; its response has not been validated.
export const YIRON_SOURCE_HOST = 'https://crm.satgurutravel.com';
export const YIRON_SOURCES = Object.freeze([
 {id:'account_view',label:'Accounts',domain:'legacyaccounts',path:'/api/account_view'},
 {id:'log_a_call_view',label:'Logged Calls',domain:'legacycalls',path:'/staging/api/log_a_call_view'},
 {id:'facts_details',label:'FACTS Details',domain:'legacyoverview',path:'/staging/api/facts-details'},
 {id:'meeting_visit_BI',label:'Meeting Visits',domain:'legacymeetings',path:'/api/meeting_visit_BI'},
 {id:'call_log_BI',label:'Call Logs BI',domain:'legacycalls',path:'/staging/api/call_log_BI'},
 {id:'potential_amount',label:'Potential Amount',domain:'legacyaccounts',path:'/api/potential-amount'},
 {id:'last_login',label:'Last Login',domain:'legacyusers',path:'/staging/api/last_login'},
 {id:'role_list_BI',label:'Role List',domain:'legacyusers',path:'/api/role_list_BI'},
 {id:'contact_list_BI',label:'Contacts',domain:'legacycontacts',path:'/api/contact_list_BI'},
 {id:'branch_list_BI',label:'Branches',domain:'legacybranches',path:'/crm_v12/api/branch_list_BI'},
 {id:'region_master_data',label:'Regions',domain:'legacyregions',path:'/staging/api/region_master_data'},
 {id:'erv_account_view_post_for_superadmin',label:'ERV Accounts',domain:'legacyaccounts',path:'/api/erv_account_view_post_for_superadmin'},
 {id:'meeting_view_post_for_superadmin',label:'Meetings',domain:'legacymeetings',path:'/api/meeting_view_post_for_superadmin'},
 {id:'call_log_view_post_for_superadmin',label:'Call Logs Superadmin',domain:'legacycalls',path:'/api/call_log_view_post_for_superadmin'},
 {id:'nca_account_view_post_for_superadmin',label:'NCA Accounts',domain:'legacyaccounts',path:'/api/nca_account_view_post_for_superadmin'}
].map(source=>Object.freeze(source)));
export const YIRON_SOURCE_MAP = new Map(YIRON_SOURCES.map(item=>[item.id,item]));
const digits = value => typeof value==='string' && /^[1-9][0-9]{0,5}$/.test(value);
export function yironRequestRange(url){
 const from=url.searchParams.get('from'),to=url.searchParams.get('to');
 if(from===null&&to===null)return null;
 if(!digits(from)||!digits(to)||Number(to)<Number(from)||Number(to)-Number(from)>499)
  throw Object.assign(new Error('Invalid Yiron row range (maximum 500 rows)'),{status:400});
 return {from,to};
}
export function yironConfiguration(env=process.env){
 const enabled=env.YIRON_ANALYTICS_ENABLED==='true';
 const configured=!!env.YIRON_API_KEY && !!env.YIRON_API_BASE_URL;
 if(!enabled||!configured)return {enabled:false,configured,reason:'Yiron API connection is not configured'};
 let base;try{base=new URL(env.YIRON_API_BASE_URL)}catch{throw new Error('Invalid YIRON_API_BASE_URL');}
 if(base.protocol!=='https:'||base.origin!==YIRON_SOURCE_HOST||base.username||base.password||base.search||base.hash||base.pathname!=='/')
  throw new Error('Yiron API origin is not allowlisted');
 if(!/^[^\r\n]{8,512}$/.test(env.YIRON_API_KEY))throw new Error('Invalid YIRON_API_KEY');
 return {enabled:true,configured:true,base:base.origin,apiKey:env.YIRON_API_KEY};
}
export function yironCatalog(env=process.env){
 const config=yironConfiguration(env);
 return {enabled:config.enabled,configured:config.configured,mode:'read-only',source:'Yiron CRM',
   sources:YIRON_SOURCES.map(({id,label,domain,path})=>({id,label,domain,path,status:config.enabled?'Available for manual retrieval':'Not connected'}))};
}
export async function fetchYironSource(sourceId,url,{env=process.env,fetchImpl=fetch}={}){
 const source=YIRON_SOURCE_MAP.get(sourceId);
 if(!source)throw Object.assign(new Error('Unknown Yiron dataset'),{status:404});
 const config=yironConfiguration(env);
 if(!config.enabled)throw Object.assign(new Error('Yiron API connection is not configured'),{status:503});
 const range=yironRequestRange(url);
 const endpoint=new URL(source.path,config.base);
 const body=sourceId==='branch_list_BI'?undefined:new FormData();
 // Some Yiron BI endpoints use numeric from/to form-data for row ranges.
 // Explicitly bounded, caller-provided ranges are sent only when supplied.
 if(range&&body){body.append('from',range.from);body.append('to',range.to);}
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetchImpl(endpoint,{method:'POST',headers:{'x-api-key':config.apiKey,'Accept':'application/json'},body,signal:controller.signal,redirect:'error'});
  if(!response.ok)throw Object.assign(new Error('Yiron upstream service failed'),{status:502});
  if(!String(response.headers.get('content-type')||'').includes('application/json'))
   throw Object.assign(new Error('Yiron returned an unsupported response format'),{status:502});
  const text=await response.text();
  if(text.length>750000)throw Object.assign(new Error('Yiron response exceeds the display size limit'),{status:502});
  let data;try{data=JSON.parse(text)}catch{throw Object.assign(new Error('Yiron response was not valid JSON'),{status:502});}
  return {source:sourceId,sourceSystem:'Yiron CRM',fetchedAt:new Date().toISOString(),range,data};
 }catch(error){
  if(error.name==='AbortError')throw Object.assign(new Error('Yiron request timed out'),{status:504});
  if(error.status)throw error;
  throw Object.assign(new Error('Yiron API could not be reached'),{status:502});
 }finally{clearTimeout(timeout);}
}
