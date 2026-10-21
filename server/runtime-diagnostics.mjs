// No request bodies, query strings, connection URLs or credentials are recorded.
const installed=Symbol.for('scrm.runtime.deprecation-diagnostics');
export function warningLocations(warning){
 if(warning?.code!=='DEP0169')return [];
 return String(warning.stack||'').split('\n').slice(1).flatMap(line=>{
  const match=line.match(/(?:\(|\s)((?:node:|\/var\/task\/|\/var\/runtime\/)[A-Za-z0-9_./:@-]+:\d+:\d+)\)?$/);
  return match?[match[1]]:[];
 }).slice(0,8);
}
export function installRuntimeDiagnostics(){
 if(process[installed])return;
 process[installed]=true;
 let reported=false;
 process.on('warning',warning=>{
  if(reported||warning?.code!=='DEP0169')return;
  reported=true;
  console.warn('SCRM runtime deprecation locations',{code:warning.code,locations:warningLocations(warning)});
 });
}
installRuntimeDiagnostics();
