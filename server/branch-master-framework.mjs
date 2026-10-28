import {branchMasters,branchMasterView,branchMasterLookup} from './branch-masters.mjs';
import {branchMasterResource,branchMasterPermissions} from './resources.mjs';
import {fail,queryOptions,compileWhere,compileOrder,selectSQL,joinSQL,publicColumns,keys} from './branch-master-schema.mjs';
import {loadPolicy,effectivePolicy,preferences,savePreferences,configureColumns,projectRecord} from './branch-master-policy.mjs';
import {importFields,fileLimits,template,fileResponse,fileBytes,exportTimeZone,exportFilename} from './branch-master-files.mjs';
import {uploadImport,validateImport,exportPlan,createExport,bulkPlan,createBulk,startJob,stepJob,jobHistory,jobDetails,jobFile,errorReport,cancelJob,jobGuidelines,resultReport} from './branch-master-jobs.mjs';

async function branchOverviewInsights(client,where,counts){
 const scoped=joinSQL+where.sql,params=where.params;
 const [lines,regions,countries,setup]=await Promise.all([
  client.query("SELECT bl.name,bl.code,count(*)::int AS count "+scoped+" GROUP BY bl.id,bl.name,bl.code ORDER BY count DESC,lower(bl.name) LIMIT 12",params),
  client.query("SELECT rg.name,rg.code,count(*)::int AS count "+scoped+" GROUP BY rg.id,rg.name,rg.code ORDER BY count DESC,lower(rg.name) LIMIT 12",params),
  client.query("SELECT ct.name,ct.code,count(*)::int AS count "+scoped+" GROUP BY ct.id,ct.name,ct.code ORDER BY count DESC,lower(ct.name) LIMIT 12",params),
  client.query("SELECT count(*)::int AS business_lines, "+
   "count(*) FILTER(WHERE EXISTS(SELECT 1 FROM regions rg WHERE rg.business_line_id=bl.id AND rg.status='Active' AND rg.archived_at IS NULL AND rg.deleted_at IS NULL))::int AS with_regions, "+
   "count(*) FILTER(WHERE EXISTS(SELECT 1 FROM country_business_lines p JOIN countries c ON c.id=p.country_id WHERE p.business_line_id=bl.id AND p.removed_at IS NULL AND c.status='Active' AND c.archived_at IS NULL AND c.deleted_at IS NULL))::int AS with_countries, "+
   "count(*) FILTER(WHERE EXISTS(SELECT 1 FROM regions rg WHERE rg.business_line_id=bl.id AND rg.status='Active' AND rg.archived_at IS NULL AND rg.deleted_at IS NULL) "+
   "AND EXISTS(SELECT 1 FROM country_business_lines p JOIN countries c ON c.id=p.country_id WHERE p.business_line_id=bl.id AND p.removed_at IS NULL AND c.status='Active' AND c.archived_at IS NULL AND c.deleted_at IS NULL))::int AS ready_business_lines "+
   "FROM business_lines bl WHERE bl.status='Active' AND bl.archived_at IS NULL AND bl.deleted_at IS NULL")
 ]);
 const rows=result=>result.rows.map(row=>({name:row.name,code:row.code,count:Number(row.count)}));
 const ready=setup.rows[0]||{};
 return {counts,businessLines:rows(lines),regions:rows(regions),countries:rows(countries),
  setup:{businessLines:Number(ready.business_lines||0),withRegions:Number(ready.with_regions||0),
   withCountries:Number(ready.with_countries||0),readyBusinessLines:Number(ready.ready_business_lines||0)}};
}

export async function branchMasterFramework(context){
 const {client,user,path,method,url,body={}}=context;
 if(path.length===2&&path[1]==='lookup'&&method==='GET')return branchMasterLookup(client,user,url);
 const permissions=branchMasterPermissions(user),need=action=>{if(!permissions[action])fail(403,'Branch Master access required: '+action);};
 need('read');
 if(path[1]==='configuration'&&path.length===2)return configureColumns(client,user,method,body);
 if(path[1]==='preferences'&&path.length===2){
  need('settings');const effective=effectivePolicy(await loadPolicy(client),user);
  if(method==='GET')return {policy:effective,preferences:await preferences(client,user,effective)};
  if(method==='PUT')return {policy:effective,preferences:await savePreferences(client,user,body,effective)};
  fail(405,'Unsupported preference action');
 }
 if(path[1]==='framework'&&path.length===2&&method==='GET'){
  const effective=effectivePolicy(await loadPolicy(client),user);
  return {version:1,fields:publicColumns(effective.allowed),importFields,limits:fileLimits,policy:effective,preferences:await preferences(client,user,effective),permissions};
 }
 if(path[1]==='imports'&&path[2]==='template'&&path.length===3&&method==='GET'){need('import');const format=url.searchParams.get('format')||'xlsx';return fileResponse(await template(format),'branches-import-template.'+format);}
 if(path[1]==='imports'&&path[2]==='guidelines'&&path.length===3&&method==='GET'){need('import');const format=url.searchParams.get('format')||'csv';const {importGuidelines}=await import('./branch-master-files.mjs');return fileResponse(await importGuidelines(format),'branches-import-guidelines.'+format);}
 if(path[1]==='imports'&&path[2]==='analyze'&&method==='POST')return uploadImport(client,user,body);
 if(path[1]==='imports'&&path[3]==='validate'&&method==='POST')return validateImport(client,user,path[2],body);
 if(path[1]==='exports'&&path[2]==='plan'&&method==='POST')return exportPlan(client,user,body);
 if(path[1]==='exports'&&path.length===2&&method==='POST')return createExport(client,user,body);
 if(path[1]==='bulk'&&path[2]==='plan'&&method==='POST')return bulkPlan(client,user,body);
 if(path[1]==='bulk'&&path.length===2&&method==='POST')return createBulk(client,user,body);
 if(path[1]==='jobs'){
  if(path.length===2&&method==='GET')return jobHistory(client,user);
  if(path.length===3&&method==='GET')return jobDetails(client,user,path[2]);
  if(method==='POST'&&path.length===4){
   if(path[3]==='start')return startJob(client,user,path[2],body);
   keys(body,[]);
   if(path[3]==='step')return stepJob(client,user,path[2]);
   if(path[3]==='cancel')return cancelJob(client,user,path[2]);
  }
  if(method==='GET'&&path.length===4){
   if(path[3]==='file')return jobFile(client,user,path[2],url.searchParams.get('part')||1);
   if(path[3]==='errors')return errorReport(client,user,path[2],url.searchParams.get('part')||1);
   if(path[3]==='guidelines')return jobGuidelines(client,user,path[2],url.searchParams.get('format')||'csv');
   if(path[3]==='results')return resultReport(client,user,path[2],url.searchParams.get('part')||1,url.searchParams.get('format')||'csv');
  }
  fail(405,'Unsupported Branch transfer job action');
 }
 if(path[1]==='overview-export'&&path.length===2&&method==='POST'){
  need('dashboard');need('export');keys(body,['query','format','timeZone']);const format=body.format||'xlsx';
  if(!['csv','xlsx'].includes(format))fail(400,'Choose CSV or XLSX');
  const effective=effectivePolicy(await loadPolicy(client),user);
  const opt=queryOptions(body.query||{},effective.allowed),where=compileWhere(opt,effective.allowed);
  const c=(await client.query("SELECT count(*)::int total,count(*) FILTER(WHERE r.status='Active' AND r.archived_at IS NULL AND r.deleted_at IS NULL)::int active,count(*) FILTER(WHERE r.status='Inactive' AND r.archived_at IS NULL AND r.deleted_at IS NULL)::int inactive,count(*) FILTER(WHERE r.archived_at IS NOT NULL AND r.deleted_at IS NULL)::int archived,count(*) FILTER(WHERE r.deleted_at IS NOT NULL)::int deleted "+joinSQL+where.sql,where.params)).rows[0];
  const data=Object.entries(c).map(([metric,value])=>({metric,value})),tz=exportTimeZone(body.timeZone??'UTC');
  return fileResponse(await fileBytes(format,['metric','value'],data,{metric:'Metric',value:'Matching records'},{title:'Branches Overview',timeZone:tz}),exportFilename('Branches Overview',format,{timeZone:tz}));
 }
 if(path[1]==='references'&&method==='GET')return branchMasters(context);
 if(path.length===1&&method==='GET'){
  const effective=effectivePolicy(await loadPolicy(client),user),options=queryOptions(Object.fromEntries(url.searchParams),effective.allowed);
  if(options.q)need('search');
  const where=compileWhere(options,effective.allowed),total=Number((await client.query('SELECT count(*) AS total '+joinSQL+where.sql,where.params)).rows[0].total);
  const totalPages=Math.max(1,Math.ceil(total/options.pageSize)),page=Math.min(options.page,totalPages);
  const records=(await client.query(selectSQL+where.sql+compileOrder(options.sorts)+' LIMIT $'+(where.params.length+1)+' OFFSET $'+(where.params.length+2),[...where.params,options.pageSize,(page-1)*options.pageSize])).rows.map(branchMasterView).map(row=>projectRecord(row,effective));
  const counts=(await client.query("SELECT count(*) FILTER (WHERE deleted_at IS NULL)::int AS total,count(*) FILTER(WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL)::int AS active,count(*) FILTER(WHERE status='Inactive' AND archived_at IS NULL AND deleted_at IS NULL)::int AS inactive,count(*) FILTER(WHERE archived_at IS NOT NULL AND deleted_at IS NULL)::int AS archived FROM branch_masters")).rows[0];
  const overviewCounts=(await client.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE r.status='Active' AND r.archived_at IS NULL AND r.deleted_at IS NULL)::int AS active,count(*) FILTER(WHERE r.status='Inactive' AND r.archived_at IS NULL AND r.deleted_at IS NULL)::int AS inactive,count(*) FILTER(WHERE r.archived_at IS NOT NULL AND r.deleted_at IS NULL)::int AS archived,count(*) FILTER(WHERE r.deleted_at IS NOT NULL)::int AS deleted "+joinSQL+where.sql,where.params)).rows[0];
  const overviewInsights=permissions.dashboard?await branchOverviewInsights(client,where,overviewCounts):null;
  const ref=(await branchMasters({...context,path:['branch-master','references'],method:'GET'}));
  return {records,total,totalPages,page,pageSize:options.pageSize,counts,owners:ref.owners,referenceData:{businessLines:ref.businessLines,regions:ref.regions,countries:ref.countries,branchManagers:ref.owners,branchTypes:ref.branchTypes},permissions,resource:{...branchMasterResource,frameworkVersion:1,columns:publicColumns(effective.allowed),limits:{selectedExport:250,maxExportRows:50000}},ui:{policy:effective,preferences:await preferences(client,user,effective),overviewCounts,overviewInsights}};
 }
 return branchMasters(context);
}
