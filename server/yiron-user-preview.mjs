// Parse a Yiron User Master response without retaining the full upstream payload.
// The upstream API can ignore from/to and return all users, including secret fields.
const SAFE_FIELDS=['user_id','role_id','first_name','last_name','email_id','role','branch_code','branch_id','department','status','last_login','reporting_person','region','usertype','managerid','created_on','updated_on'];
export async function readYironUserPreview(response,{maxBytes=120000000,maxPreview=50}={}){
 const reader=response.body?.getReader();
 if(!reader)throw Object.assign(new Error('Yiron User Master response could not be streamed'),{status:502});
 const decoder=new TextDecoder();
 let bytes=0,buffer='',started=false,done=false,depth=0,inString=false,escaped=false,part='',count=0,rowStarted=false;
 const rows=[];
 const fail=message=>{throw Object.assign(new Error(message),{status:502});};
 const pushRow=()=>{
  const raw=part.trim();part='';
  if(!rowStarted)return;
  rowStarted=false;
  count++;
  if(count>maxPreview)return;
  let value;try{value=JSON.parse(raw);}catch{fail('Yiron User Master contains invalid JSON records');}
  if(!value||typeof value!=='object'||Array.isArray(value))fail('Yiron User Master record is not an object');
  rows.push(Object.fromEntries(SAFE_FIELDS.filter(k=>Object.hasOwn(value,k)).map(k=>[k,value[k]])));
 };
 try{
  while(!done){
   const {value,done:end}=await reader.read();
   if(end)break;
   bytes+=value.byteLength;
   if(bytes>maxBytes)fail('Yiron User Master exceeded the maximum safe transfer size (120 MB)');
   const chunk=decoder.decode(value,{stream:true});
   let pos=0;
   if(!started){
    buffer+=chunk;
    const trimmed=buffer.trimStart();
    let match;
    if(trimmed.startsWith('['))match={index:buffer.indexOf('['),length:1};
    else match=/"data"\s*:\s*\[/.exec(buffer);
    if(!match){
     if(buffer.length>524288)fail('Yiron User Master response has no data array within the header limit');
     continue;
    }
    started=true;
    pos=match.index+match[0].length;
    const remaining=buffer.slice(pos);
    buffer='';
    pos=0;
    for(const ch of remaining){
     if(done)break;
     if(ch!==','&&!(ch===']'&&!inString&&depth===0)&&!/^\\s$/.test(ch))rowStarted=true;
     if(inString){if(count<maxPreview)part+=ch;if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')inString=false;continue;}
     if(ch==='"'){inString=true;if(count<maxPreview)part+=ch;continue;}
     if(ch==='['||ch==='{'){depth++;if(count<maxPreview)part+=ch;continue;}
     if(ch==='}'||ch===']'){
      if(depth>0){depth--;if(count<maxPreview)part+=ch;continue;}
      if(ch===']'){pushRow();done=true;break;}
      fail('Yiron User Master has invalid array structure');
     }
     if(ch===','&&depth===0){pushRow();continue;}
     if(count<maxPreview){
      part+=ch;
      if(part.length>1048576)fail('Yiron User Master preview row exceeds 1 MB');
     }
    }
    continue;
   }
   for(const ch of chunk){
    if(done)break;
    if(ch!==','&&!(ch===']'&&!inString&&depth===0)&&!/^\\s$/.test(ch))rowStarted=true;
    if(inString){if(count<maxPreview)part+=ch;if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch==='"')inString=false;continue;}
    if(ch==='"'){inString=true;if(count<maxPreview)part+=ch;continue;}
    if(ch==='['||ch==='{'){depth++;if(count<maxPreview)part+=ch;continue;}
    if(ch==='}'||ch===']'){
     if(depth>0){depth--;if(count<maxPreview)part+=ch;continue;}
     if(ch===']'){pushRow();done=true;break;}
     fail('Yiron User Master has invalid array structure');
    }
    if(ch===','&&depth===0){pushRow();continue;}
    if(count<maxPreview){part+=ch;if(part.length>1048576)fail('Yiron User Master preview row exceeds 1 MB');}
   }
  }
  if(!done)fail('Yiron User Master response is not a complete record array');
  return {data:rows,returnedCount:count,previewLimited:count>maxPreview,upstreamBytesRead:bytes};
 }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
