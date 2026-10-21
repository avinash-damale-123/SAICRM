import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import yauzl from 'yauzl';
import {fileBytes,template,importGuidelines,parseCSV,safeCSV,exportTimeZone,localDateParts,exportFilename,exportGuideRows} from '../server/records-files.mjs';
import {jobView,exportQuerySummary} from '../server/records-jobs.mjs';
import {verifyMaintenance,maintenanceRequest} from '../server/records-maintenance.mjs';
import {sourceTimeZone} from '../server/time-zone.mjs';
import {queryOptions} from '../server/records-schema.mjs';

async function workbook(file){const book=new ExcelJS.Workbook();await book.xlsx.load(file.bytes);return book;}
async function zipEntry(bytes,filename){return new Promise((resolve,reject)=>yauzl.fromBuffer(bytes,{lazyEntries:true},(error,zip)=>{if(error)return reject(error);zip.on('error',reject);zip.on('entry',entry=>{if(entry.fileName!==filename)return zip.readEntry();zip.openReadStream(entry,(err,stream)=>{if(err)return reject(err);const chunks=[];stream.on('data',x=>chunks.push(x));stream.on('error',reject);stream.on('end',()=>{zip.close();resolve(Buffer.concat(chunks).toString('utf8'));});});});zip.on('end',()=>resolve(null));zip.readEntry();}));}

test('Create templates contain only writable fields and a separate CSV guideline explains matching and dependencies',async()=>{
 const csv=await template('csv');const header=parseCSV(csv.bytes)[0];
 assert.deepEqual(header,['Business Line Code','Business Line Name','Business Line Description']);
 const book=await workbook(await template('xlsx'));
 assert.equal(book.getWorksheet('Import Data').columnCount,3);
 const guide=await importGuidelines('csv'),text=guide.bytes.toString('utf8');
 assert.match(text,/Dependencies/);assert.match(text,/System generated/);assert.match(text,/No dependency on Region, Country or Branch/);assert.match(text,/mapped blank clears/);assert.match(text,/All-or-nothing/);
 assert.ok(book.getWorksheet('Guidelines'));
});

test('XLSX exports style only the used table and keep native dates, numbers, text IDs and literal formulas',async()=>{
 const out=await fileBytes('xlsx',['code','name','createdAt','isArchived','amount'],[{code:'000123',name:'=1+1',createdAt:'2026-10-21T12:34:56.789Z',isArchived:false,amount:42.75}],{amount:'Amount'},{timeZone:'Asia/Kolkata',generatedAt:'2026-10-21T12:34:56Z'});
 const book=await workbook(out),sheet=book.getWorksheet('Records');
 assert.equal(sheet.columnCount,6);assert.equal(sheet.rowCount,2);
 assert.deepEqual(sheet.getRow(1).values.slice(1),['Business Line Code','Business Line Name','Created At','Created At Time Zone','Is Archived','Amount']);
 assert.equal(sheet.getCell('A2').value,'000123');assert.equal(sheet.getCell('A2').numFmt,'@');assert.equal(sheet.getCell('B2').value,'=1+1');
 assert.ok(sheet.getCell('C2').value instanceof Date);assert.equal(sheet.getCell('C2').value.toISOString(),'2026-10-21T18:04:56.789Z');
 assert.equal(sheet.getCell('D2').value,'Asia/Kolkata (UTC+05:30)');assert.equal(sheet.getCell('E2').value,'No');assert.equal(sheet.getCell('F2').value,42.75);
 assert.equal(sheet.getCell('A1').fill.fgColor.argb,'FF176348');assert.equal(sheet.getCell('A2').border.bottom.style,'thin');
 assert.equal(sheet.views[0].state,'frozen');assert.equal(sheet.views[0].showGridLines,false);assert.equal(sheet.autoFilter,'A1:F2');assert.ok(book.getWorksheet('Export Details'));
 const xml=await zipEntry(out.bytes,'xl/worksheets/sheet1.xml');
 assert.match(xml,/<dimension ref="A1:F2"/);assert.doesNotMatch(xml,/XFD|16384/);assert.doesNotMatch(xml,/<f[ >]/);
 assert.ok(sheet.columns.every(c=>c.width>=15&&c.width<=46));
});

test('CSV dates have adjacent per-instant zones and empty events have empty zones',async()=>{
 const out=await fileBytes('csv',['displayId','createdAt','archivedAt'],[{displayId:'BL-000001',createdAt:'2026-01-01T23:30:00Z',archivedAt:null}],undefined,{timeZone:'Asia/Kolkata'});
 assert.deepEqual(parseCSV(out.bytes),[['Business Line ID','Created At','Created At Time Zone','Archived At','Archived At Time Zone'],['BL-000001','2026-01-02 05:00:00','Asia/Kolkata (UTC+05:30)','','']]);
 assert.equal(localDateParts('2026-01-15T12:00:00Z','America/New_York').zone,'America/New_York (UTC-05:00)');
 assert.equal(localDateParts('2026-07-15T12:00:00Z','America/New_York').zone,'America/New_York (UTC-04:00)');
 assert.equal(localDateParts('2026-01-01T00:00:00Z','UTC').text,'2026-01-01 00:00:00');
 assert.throws(()=>exportTimeZone('Not/ARealZone'),/time zone/);
});

test('Export filenames include safe local date and time and numeric CSV values remain numeric text',()=>{
 assert.equal(exportFilename('Business Lines','xlsx',{generatedAt:'2026-12-31T11:42:59Z',timeZone:'Asia/Kolkata',suffix:'part-001'}),'Business Lines 2026-12-31 17-12-59 part-001.xlsx');
 assert.doesNotMatch(exportFilename('Bad:/\\* title','csv'),/[<>:"/\\|?*]/);
 assert.equal(safeCSV(-1.25),'"-1.25"');assert.equal(safeCSV('-1.25'),'"\'-1.25"');
});

test('Origin zones remain unknown when absent and accept IANA rules without inventing a UTC source',()=>{
 assert.equal(sourceTimeZone(undefined),null);assert.equal(sourceTimeZone(null),null);
 assert.equal(sourceTimeZone('Asia/Kolkata'),'Asia/Kolkata');assert.equal(sourceTimeZone('America/New_York'),'America/New_York');assert.equal(sourceTimeZone(' utc '),'UTC');
 for(const value of ['',false,42,{},'Not/ARealZone','+05:30','Asia/Kolkata\nInjected'])assert.throws(()=>sourceTimeZone(value),error=>error.status===400);
 assert.equal(exportTimeZone(undefined),'UTC');
 const base={kind:'import',total:0,succeeded:0,failed:0,skipped:0,request:{},state:{},created_at:'2026-10-21',updated_at:'2026-10-21',expires_at:'2099-01-01'};
 assert.equal(jobView(base).timeZone,null);assert.equal(jobView({...base,kind:'bulk'}).timeZone,null);assert.equal(jobView({...base,kind:'export'}).timeZone,'UTC');
});

test('Export summaries and guidelines describe effective scope instead of ignored list filters',()=>{
 const options=queryOptions({q:'Ignored list search',status:'Inactive',archived:'only',filters:[{field:'code',operator:'equals',value:'HIDDEN-FILTER'}],sorts:[{field:'name',direction:'asc'}],page:3,pageSize:50});
 const selected=exportQuerySummary('selected',options),all=exportQuerySummary('all',options);
 assert.deepEqual(selected,{sorts:options.sorts});
 assert.deepEqual(all,{q:'',status:'all',archived:'all',filters:{logic:'and',conditions:[]},sorts:options.sorts});
 assert.deepEqual(exportQuerySummary('page',options),options);
 const matching=exportQuerySummary('matching',options);assert.equal(matching.q,options.q);assert.deepEqual(matching.filters,options.filters);assert.ok(!('page'in matching));assert.ok(!('pageSize'in matching));
 for(const scope of ['selected','all']){
  // Older saved jobs may still contain ignored filters: narration remains honest.
  const guide=exportGuideRows(['code'],[],{scope,query:options}).flat().join('\n');
  assert.doesNotMatch(guide,/Ignored list search|HIDDEN-FILTER/);assert.match(guide,/not applied/);assert.match(guide,/Business Line Name ascending/);
 }
 const pageGuide=exportGuideRows(['code'],[],{scope:'page',query:options}).flat().join('\n');assert.match(pageGuide,/Current page\n3; 50 records per page/);assert.match(pageGuide,/Ignored list search/);
});

test('Job summaries expose only safe configuration, preserve outcomes and calculate ETA from observed processing',()=>{
 const base={id:'x',kind:'export',status:'running',filename:'file',total:100,succeeded:20,failed:0,skipped:0,created_at:'2026-10-21T10:00:00Z',updated_at:'2026-10-21T10:00:10Z',expires_at:'2099-01-01T00:00:00Z',request:{scope:'custom',columns:['code'],format:'csv',timeZone:'Asia/Kolkata',query:{q:'Air'},requestId:'private-request-id'},state:{summary:{processed:20,processingMs:10000},rows:[['private-source-row']]}};
 const view=jobView(base);assert.equal(view.estimatedSecondsRemaining,40);assert.equal(view.progress,20);assert.equal(view.summary.query.q,'Air');assert.ok(!('requestId'in view.summary));assert.ok(!('state'in view));
 assert.equal(jobView({...base,state:{}}).estimatedSecondsRemaining,null);assert.equal(jobView({...base,error:'Processing paused'}).estimatedSecondsRemaining,null);
 assert.equal(jobView({...base,status:'completed'}).estimatedSecondsRemaining,0);assert.equal(jobView({...base,expires_at:'2000-01-01'}).expired,true);
 const imported=jobView({...base,kind:'import',state:{summary:{created:3,updated:2}}});assert.equal(imported.created,3);assert.equal(imported.updated,2);
});

test('Scheduled cleanup requires a private bearer secret and never queries data when unauthenticated',async()=>{
 const secret='maintenance-test-'.repeat(4);assert.equal(verifyMaintenance(secret,'Bearer '+secret),true);assert.equal(verifyMaintenance(secret,'Bearer wrong'),false);assert.equal(verifyMaintenance('', 'Bearer '),false);
 let accessed=false;const pool={query:()=>{accessed=true;throw new Error('must not query');}},response={headers:{},setHeader(k,v){this.headers[k]=v;},end(v){this.body=JSON.parse(v);}};
 await maintenanceRequest({method:'GET',headers:{}},response,{pool,config:{},waitUntil:()=>{},secret});
 assert.equal(response.statusCode,403);assert.equal(accessed,false);assert.equal(response.headers['Cache-Control'],'no-store');
});
