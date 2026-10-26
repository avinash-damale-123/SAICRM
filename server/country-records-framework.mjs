import {countries,countryView,countryLookup} from './countries.mjs';
import {countryResource,countryPermissions} from './resources.mjs';
import {fail,keys,queryOptions,compileWhere,compileOrder,selectSQL,joinSQL,publicColumns} from './country-records-schema.mjs';
import {loadPolicy,effectivePolicy,preferences,savePreferences,configureColumns,projectRecord} from './country-records-policy.mjs';
import {fileLimits,importFields,template,fileResponse,fileBytes,importGuidelines,exportTimeZone,exportFilename} from './country-records-files.mjs';
import {uploadImport,validateImport,exportPlan,createExport,bulkPlan,createBulk,startJob,stepJob,jobHistory,jobDetails,jobFile,errorReport,cancelJob,jobGuidelines,resultReport} from './country-records-jobs.mjs';

async function overviewCounts(client,query,effective){const options=queryOptions(query||{},effective.allowed),where=compileWhere(options,effective.allowed);return (await client.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE c.archived_at IS NULL AND c.deleted_at IS NULL AND c.status='Active')::int AS active,count(*) FILTER(WHERE c.archived_at IS NULL AND c.deleted_at IS NULL AND c.status='Inactive')::int AS inactive,count(*) FILTER(WHERE c.archived_at IS NOT NULL AND c.deleted_at IS NULL)::int AS archived,count(*) FILTER(WHERE c.deleted_at IS NOT NULL)::int AS deleted `+joinSQL+where.sql,where.params)).rows[0];}

/**
 * Country Overview is computed from the current server-filtered Country set.
 * Presence only counts operational mappings to ACTIVE Business Lines; historical
 * mapping rows are retained separately and never counted as active coverage.
 * CRM usage is based on explicit Country fields in dependent records.
 */
async function countryOverviewInsights(client,query,effective){
 const options=queryOptions(query||{},effective.allowed),where=compileWhere(options,effective.allowed);
 const matched=`WITH matched AS (
 SELECT c.id,c.name,c.code,c.continent,c.status,c.archived_at,c.deleted_at
 ${joinSQL}${where.sql}
 )`;
 const active="c.status='Active' AND c.archived_at IS NULL AND c.deleted_at IS NULL";
 const operational="bl.status='Active' AND bl.archived_at IS NULL AND bl.deleted_at IS NULL";
 const [continents,lines,coverage,available,usage]=await Promise.all([
  client.query(matched+` SELECT c.continent AS name,count(*)::int AS count
   FROM matched c WHERE ${active} GROUP BY c.continent ORDER BY count DESC,c.continent`,where.params),
  client.query(matched+` SELECT bl.id,bl.code,bl.name,count(DISTINCT c.id)::int AS count
   FROM matched c JOIN country_business_lines m ON m.country_id=c.id AND m.removed_at IS NULL
   JOIN business_lines bl ON bl.id=m.business_line_id
   WHERE ${active} AND ${operational}
   GROUP BY bl.id,bl.code,bl.name ORDER BY count DESC,lower(bl.name),bl.id`,where.params),
  client.query(matched+` SELECT count(DISTINCT c.id)::int AS mapped_countries,count(*)::int AS presence_links
   FROM matched c JOIN country_business_lines m ON m.country_id=c.id AND m.removed_at IS NULL
   JOIN business_lines bl ON bl.id=m.business_line_id
   WHERE ${active} AND ${operational}`,where.params),
  client.query("SELECT count(*)::int AS count FROM business_lines WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL"),
  client.query(matched+` SELECT r.module,count(DISTINCT r.id)::int AS count
   FROM records r WHERE EXISTS (SELECT 1 FROM matched c
    WHERE r.data->>'countryId'=c.id::text OR r.data->>'country_id'=c.id::text
    OR lower(COALESCE(r.data->>'country',''))=lower(c.name)
    OR lower(COALESCE(r.data->>'countryCode',''))=lower(c.code))
   GROUP BY r.module ORDER BY count DESC,r.module`,where.params)
 ]);
 const allLines=lines.rows.map(r=>({id:r.id,code:r.code,name:r.name,count:Number(r.count)}));
 const mappedCountries=Number(coverage.rows[0]?.mapped_countries||0);
 const statusCounts=await overviewCounts(client,options,effective);
 const activeCountries=Number(statusCounts.active||0);
 return {
  counts:statusCounts,
  insights:{
   source:'Country Master and live operational relationships',
   mappedCountries,
   unmappedCountries:Math.max(0,activeCountries-mappedCountries),
   activePresenceLinks:Number(coverage.rows[0]?.presence_links||0),
   activeBusinessLinesAvailable:Number(available.rows[0]?.count||0),
   activeBusinessLinesRepresented:allLines.length,
   continents:continents.rows.map(r=>({name:r.name,count:Number(r.count)})),
   businessLines:allLines,
   usedIn:usage.rows.map(r=>({module:r.module,count:Number(r.count)}))
  }
 };
}

export async function countryRecordsFramework(context){const {client,user,path,method,url,body}=context;if(path.length===2&&path[1]==='lookup'&&method==='GET')return countryLookup(client,user,url);const permissions=countryPermissions(user);if(!permissions.read)fail(403,'You do not have access to Countries');const requirePermission=action=>{if(permissions[action]!==true)fail(403,'You do not have permission for this action');};
 if(path[1]==='overview-export'&&method==='POST'&&path.length===2){
  requirePermission('dashboard');requirePermission('export');keys(body,['query','format','timeZone']);
  const format=body.format||'xlsx';if(!['csv','xlsx'].includes(format))fail(400,'Choose CSV or XLSX format');
  const effective=effectivePolicy(await loadPolicy(client),user),{counts,insights}=await countryOverviewInsights(client,body.query,effective);
  const values=[
   ['Matching Countries',counts.total],['Active Countries',counts.active],['Inactive Countries',counts.inactive],
   ['Archived Countries',counts.archived],['Deleted Countries',counts.deleted],
   ['Active Countries with Operational Presence',insights.mappedCountries],
   ['Active Countries without Operational Presence',insights.unmappedCountries],
   ['Active Country / Business Line Associations',insights.activePresenceLinks],
   ['Active Business Lines Available',insights.activeBusinessLinesAvailable],
   ['Business Lines with Active Country Presence',insights.activeBusinessLinesRepresented],
   ...insights.continents.map(row=>['Continent: '+row.name,row.count]),
   ...insights.businessLines.map(row=>['Business Line: '+(row.code||row.name),row.count]),
   ...insights.usedIn.map(row=>['CRM Usage: '+row.module,row.count])
  ].map(([metric,value])=>({metric,value}));
  await client.query('INSERT INTO audit(actor,action,module,record_id) VALUES($1,$2,$3,$4)',[user.id,'Exported filtered Countries Overview','countries','overview-export']);
  const timeZone=exportTimeZone(body.timeZone===undefined?'UTC':body.timeZone);return fileResponse(await fileBytes(format,['metric','value'],values,{metric:'Metric',value:'Matching records'},{title:'Countries Overview',timeZone,query:body.query}),exportFilename('Countries Overview',format,{timeZone}));
 }
 if(path[1]==='configuration'&&path.length===2)return configureColumns(client,user,method,body);
 if(path[1]==='preferences'&&path.length===2){requirePermission('settings');const effective=effectivePolicy(await loadPolicy(client),user);if(method==='GET')return {policy:effective,preferences:await preferences(client,user,effective)};if(method==='PUT')return {policy:effective,preferences:await savePreferences(client,user,body,effective)};fail(405,'Unsupported preference action');}
 if(path[1]==='framework'&&path.length===2&&method==='GET'){const effective=effectivePolicy(await loadPolicy(client),user);return {version:1,fields:publicColumns(effective.allowed),importFields,limits:fileLimits,policy:effective,preferences:await preferences(client,user,effective),permissions};}
 if(path[1]==='imports'&&path[2]==='template'&&method==='GET'){requirePermission('import');const format=url.searchParams.get('format')||'xlsx';return fileResponse(await template(format),'countries-import-template.'+format);}
 if(path[1]==='imports'&&path[2]==='guidelines'&&path.length===3&&method==='GET'){requirePermission('import');const format=url.searchParams.get('format')||'csv';return fileResponse(await importGuidelines(format),'countries-import-guidelines.'+format);}
 if(path[1]==='imports'&&path[2]==='analyze'&&method==='POST')return uploadImport(client,user,body);
 if(path[1]==='imports'&&path[3]==='validate'&&path.length===4&&method==='POST')return validateImport(client,user,path[2],body);
 if(path[1]==='exports'&&path[2]==='plan'&&method==='POST')return exportPlan(client,user,body);
 if(path[1]==='exports'&&path.length===2&&method==='POST')return createExport(client,user,body);
 if(path[1]==='bulk'&&path[2]==='plan'&&method==='POST')return bulkPlan(client,user,body);
 if(path[1]==='bulk'&&path.length===2&&method==='POST')return createBulk(client,user,body);
 if(path[1]==='jobs'){if(path.length===2&&method==='GET')return jobHistory(client,user);if(path.length===3&&method==='GET')return jobDetails(client,user,path[2]);if(method==='POST'&&path.length===4){if(path[3]==='start'){keys(body,['validationToken']);return startJob(client,user,path[2],body);}keys(body,[]);if(path[3]==='step')return stepJob(client,user,path[2]);if(path[3]==='cancel')return cancelJob(client,user,path[2]);}if(method==='GET'&&path.length===4){if(path[3]==='file')return jobFile(client,user,path[2],url.searchParams.get('part')||1);if(path[3]==='errors')return errorReport(client,user,path[2],url.searchParams.get('part')||1);if(path[3]==='guidelines')return jobGuidelines(client,user,path[2],url.searchParams.get('format')||'csv');if(path[3]==='results')return resultReport(client,user,path[2],url.searchParams.get('part')||1,url.searchParams.get('format')||'csv');}fail(405,'Unsupported job action');}
 if(path.length===1&&method==='GET'){const effective=effectivePolicy(await loadPolicy(client),user),options=queryOptions(Object.fromEntries(url.searchParams),effective.allowed);if(options.q)requirePermission('search');if(options.filters.conditions?.length||options.status!=='all'||options.archived!=='exclude')requirePermission('filter');const where=compileWhere(options,effective.allowed);const total=Number((await client.query('SELECT count(*) AS total '+joinSQL+where.sql,where.params)).rows[0].total),totalPages=Math.max(1,Math.ceil(total/options.pageSize)),page=Math.min(totalPages,options.page);const records=(await client.query(selectSQL+where.sql+compileOrder(options.sorts)+' LIMIT $'+(where.params.length+1)+' OFFSET $'+(where.params.length+2),[...where.params,options.pageSize,(page-1)*options.pageSize])).rows.map(countryView);const counts=(await client.query("SELECT count(*) FILTER(WHERE deleted_at IS NULL)::int AS total,count(*) FILTER(WHERE deleted_at IS NULL AND archived_at IS NULL AND status='Active')::int AS active,count(*) FILTER(WHERE deleted_at IS NULL AND archived_at IS NULL AND status='Inactive')::int AS inactive,count(*) FILTER(WHERE deleted_at IS NULL AND archived_at IS NOT NULL)::int AS archived FROM countries")).rows[0];const owners=(await client.query("SELECT id,display_id AS \"ownerId\",name,email FROM users WHERE status='approved' AND email_verified=true ORDER BY name,id")).rows;
 const businessLines=(await client.query("SELECT id,display_id AS \"displayId\",code,name FROM business_lines WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL ORDER BY lower(name),id")).rows;
 const allBusinessLines=(await client.query("SELECT id,display_id AS \"displayId\",code,name,status FROM business_lines ORDER BY lower(name),id")).rows;
 return {records:records.map(row=>projectRecord(row,effective)),total,totalPages,page,pageSize:options.pageSize,counts,owners,referenceData:{businessLines,allBusinessLines},permissions,resource:{...countryResource,frameworkVersion:1,columns:publicColumns(effective.allowed),limits:{selectedExport:250,maxExportRows:fileLimits.exportRows}},ui:{policy:effective,preferences:await preferences(client,user,effective),...permissions.dashboard?((({counts,insights})=>({overviewCounts:counts,overviewInsights:insights}))(await countryOverviewInsights(client,options,effective))):{overviewCounts:null,overviewInsights:null}}};}
 return countries(context);
}
