(()=>{
'use strict';
/* Client-side column visibility/order for simple master tables.
   Leaves data, API permissions, and locked identity/action columns unchanged. */
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=(id)=>'scrm:master-table-columns:'+id+':v1';
const config=(id,labels)=>{
 const locked=[0,1,labels.length-1];
 let selected=labels.map((_,i)=>i);
 try{
  const found=JSON.parse(localStorage.getItem(key(id)));
  if(Array.isArray(found)&&found.every(i=>Number.isInteger(i)&&i>=0&&i<labels.length)&&new Set(found).size===found.length&&locked.every(i=>found.includes(i))) selected=found;
 }catch{}
 return {selected,locked};
};
function apply(table,id,labels){
 if(!table)return;
 const {selected}=config(id,labels);
 const rows=[...table.querySelectorAll('tr')];
 for(const row of rows){
  const cells=[...row.children];
  if(cells.length!==labels.length){
   if(cells.length===1&&cells[0].hasAttribute('colspan'))cells[0].colSpan=selected.length;
   continue;
  }
  cells.forEach((cell,index)=>{if(!cell.hasAttribute('data-original-column'))cell.dataset.originalColumn=String(index)});
  const byIndex=new Map(cells.map(cell=>[Number(cell.dataset.originalColumn),cell]));
  for(const i of [...selected,...labels.map((_,i)=>i).filter(i=>!selected.includes(i))]){
   const cell=byIndex.get(i);
   if(cell){row.append(cell);cell.hidden=!selected.includes(i);cell.style.display=selected.includes(i)?'':'none';}
  }
 }
}
function open(table,id,labels){
 if(!table)return;
 document.querySelector('dialog.scrm-column-dialog')?.remove();
 const original=config(id,labels),draft=[...original.selected],locked=original.locked;
 const dialog=document.createElement('dialog');dialog.className='scrm-column-dialog';
 const render=()=>{
  dialog.innerHTML='<form method="dialog" class="scrm-column-panel"><header><h2>Arrange Columns</h2><button type="button" data-col-action="cancel" aria-label="Close">×</button></header><p>Choose and reorder visible columns. Identity and Actions columns are required.</p>'+
   '<div class="scrm-column-items">'+draft.map((i,n)=>'<div class="scrm-column-item"><label><input type="checkbox" data-col-index="'+i+'" checked '+(locked.includes(i)?'disabled':'')+'>'+esc(labels[i])+'</label><div><button type="button" data-col-action="up" data-col-position="'+n+'" '+(n===0?'disabled':'')+' aria-label="Move '+esc(labels[i])+' up">↑</button><button type="button" data-col-action="down" data-col-position="'+n+'" '+(n===draft.length-1?'disabled':'')+' aria-label="Move '+esc(labels[i])+' down">↓</button></div></div>').join('')+
   '</div><div class="scrm-column-hidden">'+labels.map((label,i)=>draft.includes(i)?'':'<label><input type="checkbox" data-col-index="'+i+'">'+esc(label)+'</label>').join('')+'</div><footer><button type="button" data-col-action="reset">Reset</button><button type="button" data-col-action="cancel">Cancel</button><button type="button" data-col-action="save" class="scrm-column-save">Apply</button></footer></form>';
 };
 render();document.body.append(dialog);dialog.showModal();
 dialog.addEventListener('click',event=>{
  const btn=event.target.closest('[data-col-action]');
  if(!btn)return;
  const action=btn.dataset.colAction,n=Number(btn.dataset.colPosition);
  if(action==='cancel'){dialog.close();dialog.remove();return;}
  if(action==='reset'){draft.splice(0,draft.length,...labels.map((_,i)=>i));render();return;}
  if(action==='up'&&n>0){[draft[n-1],draft[n]]=[draft[n],draft[n-1]];render();}
  if(action==='down'&&n<draft.length-1){[draft[n+1],draft[n]]=[draft[n],draft[n+1]];render();}
  if(action==='save'){
   if(!locked.every(i=>draft.includes(i)))return;
   localStorage.setItem(key(id),JSON.stringify(draft));
   dialog.close();dialog.remove();window.SCRMColumns.apply(table,id,labels);
  }
 });
 dialog.addEventListener('change',event=>{
  const input=event.target.closest('[data-col-index]');if(!input)return;
  const i=Number(input.dataset.colIndex);if(locked.includes(i))return;
  if(input.checked&&!draft.includes(i))draft.push(i);
  if(!input.checked){const n=draft.indexOf(i);if(n>=0)draft.splice(n,1);}
  render();
 });
 dialog.addEventListener('close',()=>dialog.remove());
}
window.SCRMColumns={apply,open};
})();
