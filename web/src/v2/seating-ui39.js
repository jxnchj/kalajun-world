// The candidate uses the existing exploration panel and leaves door/lamp keys free.
export function installSeatingUI39(seating,doc=globalThis.document){
 const panel=doc?.querySelector('#world-panel details');
 if(!seating.enabled||!panel)return{update(){},dispose(){}};
 const button=doc.createElement('button'),status=doc.createElement('span');
 button.id='seat-switch';button.type='button';button.hidden=true;
 button.style.cssText='border:0;border-top:1px solid #ffffff26;background:none;padding:12px 0;width:100%;text-align:left;font-size:11px';
 status.id='seat-status';status.setAttribute('role','status');status.style.cssText='display:block;font-size:11px;line-height:1.6';
 panel.insertBefore(button,panel.querySelector('#map-toggle'));button.after(status);
 const update=()=>{
  const active=seating.active,near=seating.nearest(),state=seating.state;
  button.hidden=!active&&!near;button.disabled=active&&state!=='seated';
  button.textContent=state==='seated'?'起身 · 继续漫游':state==='sitting'?'正在坐下…':state==='standing'?'正在起身…':'坐下休息';
  const text=(active||near)?seating.stats.blocked??'':'';if(status.textContent!==text)status.textContent=text;
  status.hidden=!text;
 };
 const toggle=()=>{seating.toggle();update();};button.addEventListener('click',toggle);update();
 return{update,dispose(){button.removeEventListener('click',toggle);button.remove();status.remove();}};
}
