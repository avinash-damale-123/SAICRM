import ExcelJS from 'exceljs';
import yauzl from 'yauzl';
import {fail,schema,text} from './branch-master-schema.mjs';
import {ianaTimeZone} from './time-zone.mjs';
export const fileLimits=Object.freeze({uploadBytes:2*1024*1024,uncompressedBytes:25*1024*1024,maxRows:10000,maxColumns:64,maxCell:2000,atomicRows:250,exportRows:500000,exportPartRows:1000});
export const importFields=Object.freeze([
 {key:'displayId',label:'Branch ID',group:'Record Matching',type:'text',required:false,matchOnly:true,help:'Existing permanent Branch ID only for updates',example:'BR-001'},
 {key:'businessLineCode',label:'Business Line Code',group:'Branch Information',type:'text',required:true,help:'Existing Active Business Line Code',example:'STTS'},
 {key:'regionCode',label:'Region Code',group:'Branch Information',type:'text',required:true,help:'Existing Active Region Code belonging to the Business Line',example:'AF-WEST'},
 {key:'countryCode',label:'Country Code',group:'Branch Information',type:'text',required:true,help:'Country ISO-2 code marked present for the selected Business Line',example:'KE'},
 {key:'name',label:'Branch Name',group:'Branch Information',type:'text',required:true,example:'Nairobi'},
 {key:'code',label:'Branch Code',group:'Branch Information',type:'text',required:true,example:'NBO'},
 {key:'city',label:'City',group:'Branch Information',type:'text',required:true,example:'Nairobi'},
 {key:'timeZone',label:'Time Zone',group:'Branch Information',type:'text',required:true,example:'Africa/Nairobi'},
 ...[['fullName','Branch Full Name'],['branchType','Branch Type'],['stateProvince','State / Province'],['addressLine1','Address Line 1'],['addressLine2','Address Line 2'],['landmark','Landmark / Area'],['postalCode','Postal Code'],['phoneDialCode','Phone Dial Code'],['primaryContact','Primary Contact Number'],['alternateContact','Alternate Contact Number'],['officialEmail','Official Branch Email'],['website','Branch Website'],['operationalStartDate','Operational Start Date'],['legacyBranchCode','External / Legacy Branch Code'],['remarks','Remarks']].map(([key,label])=>({key,label,group:'Additional Details',type:'text',required:false}))
]);
export const templateFields=Object.freeze(importFields.filter(f=>!f.matchOnly));
const decoder=new TextDecoder('utf-8',{fatal:true});
export function parseCSV(input){let str;try{str=typeof input==='string'?input:decoder.decode(input);}catch{fail(400,'Save the CSV file in UTF-8 encoding');}str=str.replace(/^\uFEFF/,'');if(str.includes('\u0000'))fail(400,'CSV contains invalid characters');const rows=[],row=[];let value='',quoted=false,closed=false;
 const cell=()=>{if(value.length>fileLimits.maxCell)fail(400,'A cell exceeds 2,000 characters');row.push(value);value='';closed=false;if(row.length>fileLimits.maxColumns)fail(400,'Too many columns');};const line=()=>{cell();if(row.some(x=>x.trim()!==''))rows.push([...row]);row.length=0;if(rows.length>fileLimits.maxRows+1)fail(400,'At most 10,000 data rows are supported per import');};
 for(let i=0;i<str.length;i++){const c=str[i];if(quoted){if(c==='"'){if(str[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;}else if(c==='"'){if(value||closed)fail(400,'Unexpected quote in CSV');quoted=true;}else if(c===',')cell();else if(c==='\n'||c==='\r'){if(c==='\r'&&str[i+1]==='\n')i++;line();}else{if(closed&&c!==' '&&c!=='\t')fail(400,'Unexpected text after a quoted CSV cell');if(!closed)value+=c;}}
 if(quoted)fail(400,'CSV contains an unclosed quote');if(value||row.length||closed)line();return rows;}
async function inspectZip(bytes){if(bytes.readUInt32LE(0)!==0x04034b50)fail(400,'Invalid XLSX signature');await new Promise((resolve,reject)=>{yauzl.fromBuffer(bytes,{lazyEntries:true,validateEntrySizes:true},(err,zip)=>{if(err)return reject(Object.assign(new Error('Invalid XLSX archive'),{status:400}));let total=0,count=0,finished=false;const bad=message=>{if(!finished){finished=true;zip.close();reject(Object.assign(new Error(message),{status:400}));}};zip.on('error',()=>bad('Invalid XLSX archive'));zip.on('entry',entry=>{total+=entry.uncompressedSize;count++;if(count>1000||total>fileLimits.uncompressedBytes||entry.uncompressedSize>fileLimits.uncompressedBytes||/\.\.|^\/|vbaProject|externalLinks/i.test(entry.fileName))return bad('Workbook contains unsupported content or exceeds the safe extraction limit');zip.readEntry();});zip.on('end',()=>{if(!finished){finished=true;resolve();}});zip.readEntry();});});}
export async function readUpload(filename,data){const name=text(filename,'filename',180,true);const match=name.match(/\.(csv|xlsx)$/i);if(!match)fail(400,'Upload .csv or .xlsx; .xls and macro-enabled files are not supported');if(typeof data!=='string'||data.length>Math.ceil(fileLimits.uploadBytes/3)*4+4||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))fail(413,'Upload must be at most 2 MB');const bytes=Buffer.from(data,'base64');if(!bytes.length||bytes.length>fileLimits.uploadBytes)fail(413,'Upload must be between 1 byte and 2 MB');let table;
 if(match[1].toLowerCase()==='csv')table=parseCSV(bytes);else{await inspectZip(bytes);const book=new ExcelJS.Workbook();try{await book.xlsx.load(bytes);}catch{fail(400,'The XLSX workbook could not be read');}const sheet=book.getWorksheet('Import Data')||book.worksheets.find(s=>s.state==='visible'&&!/guideline|example/i.test(s.name));if(!sheet)fail(400,'Workbook needs an Import Data sheet');if(sheet.rowCount>fileLimits.maxRows+1||sheet.columnCount>fileLimits.maxColumns)fail(400,'Workbook exceeds the 10,000-row or 64-column limit');table=[];sheet.eachRow({includeEmpty:false},row=>{const values=[];for(let i=1;i<=Math.max(sheet.columnCount,row.cellCount);i++){const cell=row.getCell(i),v=cell.value;if(v&&typeof v==='object'&&('formula'in v||'sharedFormula'in v))fail(400,'Formula cells are not accepted. Paste values first ('+cell.address+')');const s=v==null?'':v instanceof Date?v.toISOString():typeof v==='object'?Array.isArray(v.richText)?v.richText.map(x=>x.text).join(''):v.text||'':String(v);if(s.length>fileLimits.maxCell)fail(400,'Cell '+cell.address+' exceeds 2,000 characters');values.push(s);}if(values.some(v=>v.trim()))table.push(values);});}
 if(table.length<2)fail(400,'Add data rows below the template headers');const headers=table[0].map(h=>h.trim());if(!headers.length||headers.some(h=>!h||h.length>120)||new Set(headers.map(h=>h.toLowerCase())).size!==headers.length)fail(400,'Column headers must be nonempty and unique');const rows=table.slice(1).map((r,i)=>{if(r.length>headers.length)fail(400,'Row '+(i+2)+' has more values than the header');return headers.map((_,j)=>r[j]||'');});const recommended={};for(const f of importFields){const index=headers.findIndex(h=>h.toLowerCase()===f.label.toLowerCase()||h.toLowerCase()===f.key.toLowerCase());if(index>=0)recommended[f.key]=index;}return {headers,rows,recommended};}
export function safeCSV(value){
 let s=value==null?'':typeof value==='boolean'?(value?'Yes':'No'):String(value);
 // Actual numeric values remain numeric text. Untrusted strings are protected against spreadsheet formulas.
 if(typeof value!=='number'&&/^[\s\uFEFF]*[=+\-@]/u.test(s))s="'"+s;
 return '"'+s.replaceAll('"','""')+'"';
}
export function csvBytes(headers,rows){return Buffer.from('\uFEFF'+[headers,...rows].map(row=>row.map(safeCSV).join(',')).join('\r\n')+'\r\n','utf8');}
const dateFormatters=new Map();
export function exportTimeZone(value='UTC'){return ianaTimeZone(value);}
export function localDateParts(value,timeZone='UTC'){
 const date=value instanceof Date?value:new Date(value);
 if(!Number.isFinite(date.getTime()))return null;
 const zone=exportTimeZone(timeZone);let formatter=dateFormatters.get(zone);
 if(!formatter){formatter=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'});if(dateFormatters.size>=32)dateFormatters.delete(dateFormatters.keys().next().value);dateFormatters.set(zone,formatter);}
 const parts=Object.fromEntries(formatter.formatToParts(date).map(p=>[p.type,p.value]));
 const milliseconds=date.getUTCMilliseconds(),offset=parts.timeZoneName==='GMT'?'UTC+00:00':parts.timeZoneName.replace(/^GMT/,'UTC');
 return {text:parts.year+'-'+parts.month+'-'+parts.day+' '+parts.hour+':'+parts.minute+':'+parts.second+(milliseconds?'.'+String(milliseconds).padStart(3,'0'):''),date:new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second),milliseconds)),zone:zone+' ('+offset+')'};
}
export function exportFilename(title='Branches',format='xlsx',{generatedAt=new Date(),timeZone='UTC',suffix=''}={}){
 const when=localDateParts(generatedAt,timeZone)?.text.replaceAll(':','-').replace(/\.\d+$/,'')||'export';
 const clean=String(title).replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g,'').trim()||'Records';
 return clean+' '+when+(suffix?' '+suffix:'')+'.'+format;
}
export function exportColumns(columns,labels){return columns.flatMap(key=>[{key,label:labels?.[key]||schema[key]?.label||key,type:schema[key]?.type||'auto'},...(schema[key]?.type==='date'?[{key:key+'TimeZone',label:(labels?.[key]||schema[key].label)+' Time Zone',type:'text',dateKey:key}]:[])]);}
const MIME_XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const border={style:'thin',color:{argb:'FFDCE5DF'}};
const cellText=value=>value instanceof Date?value.toISOString().replace('T',' ').replace(/Z$/,''):String(value??'');
function styleTable(sheet,headers,rows,{textColumns=[]}={}){
 sheet.views=[{state:'frozen',ySplit:1,showGridLines:false}];
 sheet.properties.defaultRowHeight=20;
 headers.forEach((header,i)=>{
  const lengths=rows.map(r=>cellText(r[i]).split(/\r?\n/).reduce((n,line)=>Math.max(n,line.length),0));
  sheet.getColumn(i+1).width=Math.min(46,Math.max(15,header.length+2,...lengths.map(n=>Math.min(n+2,46))));
 });
 sheet.addRow(headers);
 rows.forEach(values=>sheet.addRow(values));
 for(let r=1;r<=rows.length+1;r++){
  const row=sheet.getRow(r);let lines=1;
  for(let c=1;c<=headers.length;c++){
   const cell=row.getCell(c);cell.border={top:border,left:border,bottom:border,right:border};
   cell.alignment={vertical:'top',wrapText:true};
   if(r===1){cell.font={name:'Calibri',size:11,bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF176348'}};}
   else{
    cell.font={name:'Calibri',size:11,bold:false,color:{argb:'FF243D32'}};
    if(cell.value instanceof Date)cell.numFmt='dd mmm yyyy hh:mm:ss.000';
    else if(textColumns.includes(c-1))cell.numFmt='@';
    const length=cellText(cell.value).split(/\r?\n/).reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/(sheet.getColumn(c).width-2))),0);lines=Math.max(lines,length);
   }
  }
  row.height=r===1?Math.min(48,Math.max(30,Math.ceil(Math.max(...headers.map((h,i)=>h.length/(sheet.getColumn(i+1).width-2))))*15)):Math.min(90,Math.max(20,lines*15));
 }
 if(headers.length)sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,rows.length+1),column:headers.length}};
 sheet.pageSetup={orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
}
const importRules=[
 ['File preparation','Upload CSV or XLSX. CSV must be UTF-8; no formulas, macros or external links. Only the Import Data worksheet is read from XLSX.'],
 ['Size limits','Up to 2 MB, 10,000 rows and 64 columns. Each cell may contain at most 2,000 characters. All-or-nothing mode supports at most 250 rows.'],
 ['Create Branch','Branch ID is generated as BR-001 style, status defaults to Active, and the importing user becomes Owner and Created By. System fields cannot be imported.'],
 ['Update Branch','Branch ID is mandatory for Update. Existing Branch records can be corrected by exporting Branch IDs, editing the permitted business fields, and reimporting. Archived and Deleted Branches must be restored separately.'],
 ['Business Line','The Business Line Code must identify an Active Business Line. Each Branch belongs to exactly one Business Line.'],
 ['Region','Region Code must identify an Active Region assigned to the selected Business Line. Region and Country are independent masters, both mandatory for Branch.'],
 ['Country','Country Code is the two-letter ISO Country Code. The selected Country must be Active and Business Line Presence must be enabled for the selected Business Line.'],
 ['Unique Branch Code','Branch Code is globally unique across all Business Lines and lifecycle states. Uppercase letters, digits and hyphens only, maximum 20 characters.'],
 ['Unique Branch Name','Branch Name must be unique within the selected Business Line and Country, including Archived/Deleted Branches.'],
 ['Branch Type','Optional choices are Head Office, Regional Office, Branch Office, Support Office and Virtual Office.'],
 ['Time Zone','Mandatory valid IANA time zone such as Africa/Nairobi or Asia/Kolkata. Time Zone is a business field, not the browser time zone.'],
 ['Import column mapping','Map every mandatory field. Each source column can map to only one destination field. Unmapped columns are ignored. Blank mandatory cells fail validation.'],
 ['Review before import','Choose a file, map columns, select Create, Update or Create and Update; validate and review results before confirmation. Upload and validation do not save Branch records.'],
 ['Partial mode','Import valid rows while rejecting invalid rows. Download the failed-row report, correct it, and upload separately. Successful records remain saved.'],
 ['All-or-nothing mode','If any row is invalid or changes after validation, commit no rows. Split files of more than 250 rows or choose partial mode.'],
 ['Duplicate and unchanged rows','Create rejects existing Branch Codes or Business-Line/Country names. Identical rows that produce no changes are skipped. Reuploading the exact same completed file returns the previous outcome.'],
 ['History','Import/Export History reports Created, Updated, Failed, Unchanged and downloadable outcomes; export includes Branch ID so records can be updated later.'],
 ['Date handling','Operational Start Date is a calendar date. Audit timestamps are UTC instants; exported audit timestamps use the chosen export time zone.'],
 ['CSV format','CSV contains a plain data table. Download companion guidelines, or select XLSX for formatted worksheets and typed columns.'],
 ['CSV safety','Potential formula-looking text is escaped on export. When opening CSV externally, import ID and Code columns as text to preserve identifiers.']
];
export function importGuideRows(){return [
 ...importFields.map(f=>[f.group,f.label,f.required?'Yes':f.matchOnly?'Optional update matching':'No',f.type,f.format||'',[f.help,f.dependency].filter(Boolean).join(' '),f.blank||'',f.example||'']),
 ...importRules.map(([rule,instructions])=>['Instructions',rule,'','','',instructions,'',''])
];}
const guideHeaders=['Section','Field / Rule','Required','Data type','Accepted values / format','Dependencies / instructions','Default / blank behaviour','Example'];
export async function importGuidelines(format='csv'){
 const rows=importGuideRows();if(format==='csv')return {bytes:csvBytes(guideHeaders,rows),mime:'text/csv;charset=utf-8'};
 if(format!=='xlsx')fail(400,'Select CSV or XLSX');
 const book=new ExcelJS.Workbook();book.creator='SCRM';styleTable(book.addWorksheet('Guidelines'),guideHeaders,rows);
 return {bytes:Buffer.from(await book.xlsx.writeBuffer()),mime:MIME_XLSX};
}
function businessFilter(node){
 if(!node)return 'None';if(Array.isArray(node))return node.map(businessFilter).join(' AND ')||'None';
 if(node.conditions)return node.conditions.length?'('+node.conditions.map(businessFilter).join(node.logic==='or'?' OR ':' AND ')+')':'None';
 const operator={contains:'contains',notContains:'does not contain',equals:'equals',notEquals:'does not equal',startsWith:'starts with',endsWith:'ends with',in:'is one of',notIn:'is not one of',isEmpty:'is empty',isNotEmpty:'is not empty',before:'is before',after:'is after',between:'is between',lastDays:'is within the last days',gt:'is greater than',gte:'is at least',lt:'is less than',lte:'is at most'}[node.operator]||node.operator;
 return (schema[node.field]?.label||node.field)+' '+operator+(node.value===undefined?'':' '+(Array.isArray(node.value)?node.value.join(' / '):String(node.value)));
}
export function exportGuideRows(columns,records,options={}){
 const zone=exportTimeZone(options.timeZone||'UTC'),generated=localDateParts(options.generatedAt||new Date(),zone),query=options.query||{};
 return [
 ['Report',options.title||'Branches'],['Generated at',generated.text+' '+generated.zone],[options.exportCount===undefined?'Records in this file':'Records exported',String(options.exportCount??records.length)],
 ['Requested records',options.scope?({page:'Current page',selected:'Selected records',matching:'All matching records',all:'All authorized records',custom:'Custom filters'}[options.scope]||options.scope):'As selected'],
 ...(options.scope==='selected'?[['Selection filters','The selected record IDs define membership. Search, status, archive and custom list filters are not applied.']]:options.scope==='all'?[['Selection filters','All authorized non-deleted records, including archived records. Search, status and custom list filters are not applied.']]:[['Search',query.q||'None'],['Status filter',query.status||'All'],['Archive filter',query.archived||'As selected'],['Custom filters',businessFilter(query.filters)]]),
 ...(options.scope==='page'?[['Current page',String(query.page||1)+'; '+String(query.pageSize||25)+' records per page']]:[]),
 ['Sort order',(query.sorts||[]).map(s=>(schema[s.field]?.label||s.field)+' '+(s.direction==='desc'?'descending':'ascending')).join('; ')||'As selected'],
 ['Columns',exportColumns(columns,options.labels).map(c=>c.label).join('; ')],
 ['Date and time','Date cells show the export time zone selected when the job was created. Each date column has an adjacent Time Zone column with the IANA zone and UTC offset applicable to that instant, including daylight-saving changes.'],
 ['Stored timestamps','CRM timestamps remain absolute UTC instants. New record events retain the originating browser time zone when supplied; missing and historical origin zones remain unknown. The adjacent Time Zone is the export conversion zone, not the original event zone or a claim about where the original user was located.'],
 ['Excel date values','XLSX dates are real spreadsheet date values in the displayed local time. Use the adjacent zone and offset when converting them back to an absolute instant. Fractional seconds are retained.'],
 ['Record identity','Branch IDs, Codes and user IDs are text. Boolean values are displayed as Yes or No. Blank dates and their Time Zone cells mean that the event has not happened.'],
 ['File lifetime','Generated export files can be downloaded for 24 hours after the export completes. After expiry generate a new export. The history summary remains available.'],
 ['Large exports','Large exports are split into numbered parts. Records selected at confirmation are retained as the job selection; each part reads the current authorized values when it is generated.'],
 ['CSV format','CSV contains a single UTF-8 data table. It cannot store worksheets, visual formatting, freeze panes or spreadsheet cell types. Download this companion guide. Import IDs and Codes as Text in your spreadsheet application.'],
 ['Text safety','Text that resembles a spreadsheet formula is prefixed with an apostrophe in CSV. XLSX text remains a literal text cell and is never an executable formula.']
 ];
}
export async function exportGuidelines(format,columns,records=[],options={}){
 const rows=exportGuideRows(columns,records,options);
 if(format==='csv')return {bytes:csvBytes(['Detail','Explanation'],rows),mime:'text/csv;charset=utf-8'};
 if(format!=='xlsx')fail(400,'Select CSV or XLSX');
 const book=new ExcelJS.Workbook();book.creator='SCRM';styleTable(book.addWorksheet('Export Details'),['Detail','Explanation'],rows);
 return {bytes:Buffer.from(await book.xlsx.writeBuffer()),mime:MIME_XLSX};
}
export async function fileBytes(format,columns,records,labels,options={}){
 const zone=exportTimeZone(options.timeZone||'UTC'),descriptors=exportColumns(columns,labels),headers=descriptors.map(c=>c.label);
 const rows=records.map(record=>descriptors.map(column=>{
  if(column.dateKey)return record[column.dateKey]?localDateParts(record[column.dateKey],zone)?.zone||'':'';
  const value=record[column.key];if(value===null||value===undefined)return '';
  if(column.type==='date'){const date=localDateParts(value,zone);return date?(format==='xlsx'?date.date:date.text):'';}
  if(typeof value==='boolean')return value?'Yes':'No';
  if(column.type==='number'||column.type==='auto'&&typeof value==='number')return Number.isFinite(Number(value))?Number(value):String(value);
  if(value instanceof Date){const date=localDateParts(value,zone);return format==='xlsx'?date.date:date.text;}
  return String(value);
 }));
 if(format==='csv')return {bytes:csvBytes(headers,rows),mime:'text/csv;charset=utf-8'};
 if(format!=='xlsx')fail(400,'Select CSV or XLSX');
 const book=new ExcelJS.Workbook();book.creator='SCRM';book.created=new Date(options.generatedAt||Date.now());
 styleTable(book.addWorksheet('Records'),headers,rows,{textColumns:descriptors.flatMap((c,i)=>['text','user','enum','boolean'].includes(c.type)?[i]:[])});
 styleTable(book.addWorksheet('Export Details'),['Detail','Explanation'],exportGuideRows(columns,records,{...options,labels,timeZone:zone}));
 return {bytes:Buffer.from(await book.xlsx.writeBuffer()),mime:MIME_XLSX};
}
export async function template(format){
 const headers=templateFields.map(f=>f.label);
 if(format==='csv')return {bytes:csvBytes(headers,[]),mime:'text/csv;charset=utf-8'};
 if(format!=='xlsx')fail(400,'Select CSV or XLSX');
 const book=new ExcelJS.Workbook();book.creator='SCRM';const data=book.addWorksheet('Import Data');
 styleTable(data,headers,[]);templateFields.forEach((f,i)=>{data.getColumn(i+1).width=f.key==='remarks'?46:30;data.getColumn(i+1).numFmt='@';});
 styleTable(book.addWorksheet('Guidelines'),guideHeaders,importGuideRows());
 return {bytes:Buffer.from(await book.xlsx.writeBuffer()),mime:MIME_XLSX};
}
export const fileResponse=(file,filename)=>({filename,mime:file.mime,data:file.bytes.toString('base64'),size:file.bytes.length});
