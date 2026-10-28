import {branchMasters,branchMasterView,branchMasterLookup} from './branch-masters.mjs';
import {branchMasterResource,branchMasterPermissions} from './resources.mjs';
import {fail,queryOptions,compileWhere,compileOrder,selectSQL,joinSQL,publicColumns,keys} from './branch-master-schema.mjs';
import {loadPolicy,effectivePolicy,preferences,savePreferences,configureColumns,projectRecord} from './branch-master-policy.mjs';
import {importFields,fileLimits,template,fileResponse} from './branch-master-files.mjs';

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
 if(path[1]==='references'&&method==='GET')return branchMasters(context);
 if(path.length===1&&method==='GET'){
  const effective=effectivePolicy(await loadPolicy(client),user),options=queryOptions(Object.fromEntries(url.searchParams),effective.allowed);
  if(options.q)need('search');
  const where=compileWhere(options,effective.allowed),total=Number((await client.query('SELECT count(*) AS total '+joinSQL+where.sql,where.params)).rows[0].total);
  const totalPages=Math.max(1,Math.ceil(total/options.pageSize)),page=Math.min(options.page,totalPages);
  const records=(await client.query(selectSQL+where.sql+compileOrder(options.sorts)+' LIMIT $'+(where.params.length+1)+' OFFSET $'+(where.params.length+2),[...where.params,options.pageSize,(page-1)*options.pageSize])).rows.map(branchMasterView).map(row=>projectRecord(row,effective));
  const counts=(await client.query("SELECT count(*) FILTER (WHERE deleted_at IS NULL)::int AS total,count(*) FILTER(WHERE status='Active' AND archived_at IS NULL AND deleted_at IS NULL)::int AS active,count(*) FILTER(WHERE status='Inactive' AND archived_at IS NULL AND deleted_at IS NULL)::int AS inactive,count(*) FILTER(WHERE archived_at IS NOT NULL AND deleted_at IS NULL)::int AS archived FROM branch_masters")).rows[0];
  const overviewCounts=(await client.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE b.status='Active' AND b.archived_at IS NULL AND b.deleted_at IS NULL)::int AS active,count(*) FILTER(WHERE b.status='Inactive' AND b.archived_at IS NULL AND b.deleted_at IS NULL)::int AS inactive,count(*) FILTER(WHERE b.archived_at IS NOT NULL AND b.deleted_at IS NULL)::int AS archived,count(*) FILTER(WHERE b.deleted_at IS NOT NULL)::int AS deleted "+joinSQL+where.sql,where.params)).rows[0];
  const ref=(await branchMasters({...context,path:['branch-master','references'],method:'GET'}));
  return {records,total,totalPages,page,pageSize:options.pageSize,counts,owners:ref.owners,referenceData:{businessLines:ref.businessLines,regions:ref.regions,countries:ref.countries,branchManagers:ref.owners,branchTypes:ref.branchTypes},permissions,resource:{...branchMasterResource,frameworkVersion:1,columns:publicColumns(effective.allowed),limits:{selectedExport:250,maxExportRows:50000}},ui:{policy:effective,preferences:await preferences(client,user,effective),overviewCounts}};
 }
 return branchMasters(context);
}
