// ── CONSTANTS ────────────────────────────
const DATA_KEY='dp-data';
const FIL_KEY='dp-filiale';
const BL_KEY='dp-bl';
const WH_KEY='dp-wh';
const WH_DATA_KEY='dp-wh-data';
const WH_MSG_KEY='dp-whmsg';
const WH_LOCK_KEY='dp-whlocked';
const WH_DATA_ID='dp-wh-dataid';
const WH_REG_ID='dp-wh-regid';  // registry message ID for data webhook
const WH_SHIFTS_ID='dp-wh-shiftsid';
const VAC_KEY='dp-vac';
const DAYS=['So','Mo','Di','Mi','Do','Fr','Sa'];
const MONTHS=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const TYPE_L={vz:'Vollzeit',tz:'Teilzeit',gfb:'Geringf.',rk:'Reinigung'};
const TYPE_B={vz:'badge-vz',tz:'badge-tz',gfb:'badge-gfb',rk:'badge-rk'};
const COL={blue:'#58a6ff',green:'#2ea043',yellow:'#e8b800',red:'#dc3545',purple:'#a78bfa'};

// ── STATE ────────────────────────────────
let filiale=localStorage.getItem(FIL_KEY)||'';
let state={
  monday:getMondayOfWeek(new Date()),
  bundesland:localStorage.getItem(BL_KEY)||'BY',
  employees:[],
  shifts:{}
};
let editCtx=null;
let mgmtTab='staff';
let autoWH=false;
let _whDebounce=null;
let pendingImport=null;

// ── INIT ─────────────────────────────────
function init(){
  if(!filiale){
    document.getElementById('setup-modal').style.display='flex';
    setTimeout(()=>document.getElementById('setup-fil').focus(),50);
  } else {
    loadData();
    startApp();
  }
}
function doSetup(){
  const v=document.getElementById('setup-fil').value.trim();
  if(!v){document.getElementById('setup-err').style.display='block';return;}
  filiale=v;
  localStorage.setItem(FIL_KEY,filiale);
  document.getElementById('setup-modal').style.display='none';
  loadData();
  startApp();
}
function startApp(){
  document.getElementById('main-app').style.display='flex';
  document.getElementById('fil-display').textContent=filiale;
  document.getElementById('mgmt-fil').textContent=filiale;
  document.getElementById('wh-fil').textContent=filiale;
  document.getElementById('d-fil-ch').textContent=filiale;
  document.getElementById('bl-sel').value=state.bundesland;
  render();
  updateSyncBadge();
}
function loadData(){
  const raw=localStorage.getItem(DATA_KEY+'-'+filiale);
  if(raw){const d=JSON.parse(raw);state.employees=d.employees||[];state.shifts=d.shifts||{};}
  else{state.employees=[];state.shifts={};}
}
function saveData(){
  localStorage.setItem(DATA_KEY+'-'+filiale,JSON.stringify({employees:state.employees,shifts:state.shifts,ts:new Date().toISOString()}));
  showSave('Gespeichert');
  debouncedWH();
}
function showSave(msg){
  const el=document.getElementById('save-lbl');
  el.textContent='✓ '+msg;clearTimeout(el._t);
  el._t=setTimeout(()=>el.textContent='',3500);
}

// ── FILIALE EDIT ─────────────────────────
function openFilialEdit(){
  document.getElementById('fil-inp').value=filiale;
  document.getElementById('fil-modal').style.display='flex';
  setTimeout(()=>document.getElementById('fil-inp').focus(),50);
}
function closeFil(){document.getElementById('fil-modal').style.display='none';}
function saveFil(){
  const v=document.getElementById('fil-inp').value.trim();
  if(!v)return;
  filiale=v;
  localStorage.setItem(FIL_KEY,filiale);
  document.getElementById('fil-display').textContent=filiale;
  document.getElementById('mgmt-fil').textContent=filiale;
  document.getElementById('wh-fil').textContent=filiale;
  document.getElementById('d-fil-ch').textContent=filiale;
  loadData();closeFil();render();updateSyncBadge();
}

// ── DATE / HOLIDAYS ──────────────────────
function getMondayOfWeek(d){const r=new Date(d);const dy=r.getDay();r.setDate(r.getDate()-(dy===0?6:dy-1));r.setHours(0,0,0,0);return r;}
function addDays(d,n){const r=new Date(d);r.setDate(r.getDate()+n);return r;}
function fmtDate(d){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function getKW(d){const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const dn=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-dn);const ys=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-ys)/86400000+1)/7);}
function getEaster(y){const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),dy=(h+l-7*m+114)%31+1;return new Date(y,mo-1,dy);}
function getHols(y,bl){
  const ea=getEaster(y),a=(d,n)=>addDays(d,n),f=d=>fmtDate(d),H={};
  const s=(d,n)=>{H[f(d)]=n;};
  s(new Date(y,0,1),'Neujahrstag');s(a(ea,-2),'Karfreitag');s(a(ea,1),'Ostermontag');
  s(new Date(y,4,1),'Tag der Arbeit');s(a(ea,39),'Christi Himmelfahrt');s(a(ea,50),'Pfingstmontag');
  s(new Date(y,9,3),'Dt. Einheit');s(new Date(y,11,25),'1. Weihnachtstag');s(new Date(y,11,26),'2. Weihnachtstag');
  if(['BY','BW','ST'].includes(bl))s(new Date(y,0,6),'Heilige Drei Könige');
  if(['BY','BW','HE','NW','RP','SL','SN','TH'].includes(bl))s(a(ea,60),'Fronleichnam');
  if(['BY','SL'].includes(bl))s(new Date(y,7,15),'Mariä Himmelfahrt');
  if(['BY','BW','NW','RP','SL'].includes(bl))s(new Date(y,10,1),'Allerheiligen');
  if(['BB','MV','SN','ST','TH','HB','HH','NI','SH'].includes(bl))s(new Date(y,9,31),'Reformationstag');
  return H;
}
function getAllHols(mon,bl){let H={};for(let i=0;i<7;i++)Object.assign(H,getHols(addDays(mon,i).getFullYear(),bl));return H;}

// ── CALC ─────────────────────────────────
function calcH(s,e,p){if(!s||!e)return 0;const[sh,sm]=s.split(':').map(Number),[eh,em]=e.split(':').map(Number);let m=eh*60+em-(sh*60+sm);if(m<0)m+=1440;m-=(p||0);return Math.max(0,m/60);}
function fmtH(h){if(!h)return'';const v=Math.round(h*100)/100;return v.toFixed(2).replace(/\.?0+$/,'').replace('.',',')+' Std';}
function vacHPD(emp){
  // vacation hours per day: explicit override → weeklyTarget/6 → 0
  if(emp&&emp.vacationHoursPerDay) return parseFloat(emp.vacationHoursPerDay);
  if(emp&&emp.weeklyTarget) return Math.round(parseFloat(emp.weeklyTarget)/6*100)/100;
  return 0;
}
function wkH(id){
  let t=0;
  for(let i=0;i<6;i++){
    const d=fmtDate(addDays(state.monday,i));
    const s=state.shifts[d]?.[id];
    if(s&&s.type==='work'&&!s.goFil) t+=calcH(s.start,s.end,s.pause);
  }
  return t;
}
function wkD(id){let c=0;for(let i=0;i<6;i++){const d=fmtDate(addDays(state.monday,i));const s=state.shifts[d]?.[id];if(s&&s.type==='work')c++;}return c;}

const RK_CAP=10; // max hours per week for Reinigungskraft

function teamTotalH(){
  // sum all non-RK home employees
  return state.employees
    .filter(e=>!e.isGuest&&e.type!=='rk')
    .reduce((sum,e)=>sum+wkH(e.id),0);
}

function dayTotalH(ds){
  // sum all non-RK, non-guest work shifts for one date
  return state.employees
    .filter(e=>!e.isGuest&&e.type!=='rk')
    .reduce((sum,e)=>{
      const s=state.shifts[ds]?.[e.id];
      return sum+(s&&s.type==='work'&&!s.goFil?calcH(s.start,s.end,s.pause):0);
    },0);
}

// ── SHIFT TIME COLOR ─────────────────────
function shiftTimeClass(start, end){
  if(!start||!end) return '';
  const toM=t=>{const[h,m]=t.split(':').map(Number);return h*60+m;};
  const s=toM(start),e=toM(end);
  const SPLIT=12*60+30; // 12:30
  const MS=6*60,ME=SPLIT,AS=SPLIT,AE=20*60;
  const mMins=Math.max(0,Math.min(e,ME)-Math.max(s,MS));
  const aMins=Math.max(0,Math.min(e,AE)-Math.max(s,AS));
  const total=mMins+aMins;
  if(total===0) return '';
  const mr=mMins/total;
  if(mr>0.65) return 'sh-early';   // mostly 6-12:30 → yellow
  if(mr<0.35) return 'sh-late';    // mostly 12:30-20 → blue
  return 'sh-mixed';               // split → orange
}

// ── RENDER ───────────────────────────────
function render(){
  // draw canvas
  const canvas=document.getElementById('sched-canvas');
  if(canvas) drawPlanToCanvas(canvas);
  // attach click handler (replace each time to stay current)
  if(canvas){
    canvas.onclick=null;
    canvas.onclick=function(e){handleCanvasClick(e,canvas);};
  }
  updateDayTotals();
}

function updateDayTotals(){
  // (footer badge kept in footer bar)
}


// ── SHIFT ────────────────────────────────
function openShift(ds,empId,dayLabel,empName){
  editCtx={ds,empId};
  document.getElementById('modal-lbl').textContent=`${dayLabel} · ${empName}`;
  const ex=(state.shifts[ds]||{})[empId];
  document.getElementById('s-start').value=ex?.start||'08:00';
  document.getElementById('s-end').value=ex?.end||'16:00';
  document.getElementById('s-pause').value=ex?.pause??30;
  document.getElementById('s-type').value=ex?.type||'work';
  document.getElementById('s-note').value=ex?.note||'';
  const goOn=!!(ex?.goFil);
  document.getElementById('go-on').checked=goOn;
  document.getElementById('go-fil').value=ex?.goFil||'';
  document.getElementById('go-times').value=ex?.goTimes||'yes';
  document.getElementById('go-fields').style.display=goOn?'block':'none';
  const emp=state.employees.find(e=>e.id===empId);
  document.getElementById('go-box').style.display=(emp&&emp.isGuest)?'none':'block';
  document.getElementById('shift-modal').style.display='flex';
}
function toggleGo(){document.getElementById('go-fields').style.display=document.getElementById('go-on').checked?'block':'none';}
function closeShift(){document.getElementById('shift-modal').style.display='none';editCtx=null;}
function saveShift(){
  if(!editCtx)return;
  const{ds,empId}=editCtx;
  if(!state.shifts[ds])state.shifts[ds]={};
  const goOn=document.getElementById('go-on').checked;
  state.shifts[ds][empId]={
    start:document.getElementById('s-start').value,end:document.getElementById('s-end').value,
    pause:parseInt(document.getElementById('s-pause').value)||0,
    type:document.getElementById('s-type').value,note:document.getElementById('s-note').value.trim(),
    goFil:goOn?document.getElementById('go-fil').value.trim():'',
    goTimes:document.getElementById('go-times').value,
  };
  closeShift();saveData();render();
}
function clearShift(){
  if(!editCtx)return;
  const{ds,empId}=editCtx;
  if(state.shifts[ds])delete state.shifts[ds][empId];
  closeShift();saveData();render();
}

// ── MGMT ─────────────────────────────────
function showMgmt(tab){
  mgmtTab=tab||'staff';switchMTab(mgmtTab);
  renderEmpList();renderGuestList();
  document.getElementById('mgmt-ov').style.display='flex';
}
function closeMgmt(){document.getElementById('mgmt-ov').style.display='none';}
function switchMTab(tab){
  mgmtTab=tab;
  document.getElementById('mt-staff-body').style.display=tab==='staff'?'block':'none';
  document.getElementById('mt-guest-body').style.display=tab==='guest'?'block':'none';
  document.getElementById('mt-staff').style.background=tab==='staff'?'var(--card2)':'var(--card)';
  document.getElementById('mt-guest').style.background=tab==='guest'?'rgba(249,115,22,.18)':'var(--card)';
}
function renderEmpList(){
  const home=state.employees.filter(e=>!e.isGuest);
  const el=document.getElementById('emp-list');
  if(!home.length){el.innerHTML='<div style="color:var(--text3);font-size:12px;padding:7px">Keine Mitarbeiter. Füge unten welche hinzu.</div>';return;}
  el.innerHTML=home.map(e=>{
    const h=wkH(e.id);const tgt=e.weeklyTarget?parseFloat(e.weeklyTarget):null;
    let tgtLine='';
    if(tgt){const dv=Math.round((h-tgt)*100)/100;const sign=dv>0?'+':'';const cls=dv>0.05?'over':dv<-0.5?'under':'near';tgtLine=`<div class="ei-tgt">Soll <b>${String(tgt).replace('.',',')} Std</b> · Ist <b>${fmtH(h)||'0 Std'}</b> <span class="${cls}">${sign}${String(dv).replace('.',',')} Std</span></div>`;}
    return`<div class="ei">
      <div style="width:8px;height:8px;border-radius:50%;background:${COL[e.col]||'#888'};flex-shrink:0"></div>
      <div class="ei-info"><div class="ei-name">${esc(e.name)}</div><div class="ei-meta">${esc(e.role)} · ${TYPE_L[e.type]||e.type}${e.phone?` · 📱`:''}</div>${tgtLine}</div>
      <button class="btn-ic edit" onclick="openEditEmp('${e.id}')" title="Bearbeiten">✏</button>
      <button class="btn-ic" onclick="moveEmp('${e.id}',-1)">▲</button>
      <button class="btn-ic" onclick="moveEmp('${e.id}',1)">▼</button>
      <button class="btn-ic" onclick="removeEmp('${e.id}')">✕</button>
    </div>`;
  }).join('');
}
function renderGuestList(){
  const gs=state.employees.filter(e=>e.isGuest);
  const el=document.getElementById('guest-list');
  if(!gs.length){el.innerHTML='<div style="color:var(--text3);font-size:12px;padding:7px">Keine Gäste aktuell.</div>';return;}
  el.innerHTML=gs.map(e=>{const u=e.guestUntil?new Date(e.guestUntil):null;return`<div class="ei gi-item"><div style="width:8px;height:8px;border-radius:50%;background:var(--gi);flex-shrink:0"></div><div class="ei-info"><div class="ei-name" style="color:var(--gi)">${esc(e.name)}</div><div class="ei-meta">← aus Filiale ${esc(e.guestFrom||'?')} · ${esc(e.role)}${u?' · bis '+u.getDate()+'.'+(u.getMonth()+1)+'.':''}</div></div><button class="btn-ic" onclick="removeEmp('${e.id}')">✕</button></div>`;}).join('');
}
function addEmp(){
  const name=document.getElementById('n-name').value.trim();
  const role=document.getElementById('n-role').value.trim();
  if(!name)return;
  state.employees.push({id:'e'+Date.now(),name,role:role||'Mitarbeiter/-in',type:document.getElementById('n-type').value,col:document.getElementById('n-col').value,isGuest:false});
  document.getElementById('n-name').value='';document.getElementById('n-role').value='';
  saveData();renderEmpList();render();
}
function addGuest(){
  const name=document.getElementById('gn-name').value.trim();
  const from=document.getElementById('gn-from').value.trim();
  if(!name||!from)return;
  state.employees.push({id:'eg'+Date.now(),name,role:document.getElementById('gn-role').value.trim()||'Mitarbeiter/-in',type:'gfb',col:document.getElementById('gn-col').value,isGuest:true,guestFrom:from,guestUntil:document.getElementById('gn-until').value||''});
  document.getElementById('gn-name').value='';document.getElementById('gn-from').value='';document.getElementById('gn-role').value='';document.getElementById('gn-until').value='';
  saveData();renderGuestList();render();
}
function removeEmp(id){
  state.employees=state.employees.filter(e=>e.id!==id);
  Object.keys(state.shifts).forEach(d=>{delete state.shifts[d][id];});
  saveData();renderEmpList();renderGuestList();render();
}
function moveEmp(id,dir){
  const arr=state.employees;const idx=arr.findIndex(e=>e.id===id);
  const ni=idx+dir;if(ni<0||ni>=arr.length||arr[ni].isGuest)return;
  [arr[idx],arr[ni]]=[arr[ni],arr[idx]];saveData();renderEmpList();render();
}

// ── EDIT EMP ─────────────────────────────
function openEditEmp(id){
  const e=state.employees.find(x=>x.id===id);if(!e)return;
  document.getElementById('ee-id').value=id;
  document.getElementById('ee-name').value=e.name;
  document.getElementById('ee-role').value=e.role;
  document.getElementById('ee-type').value=e.type;
  document.getElementById('ee-col').value=e.col||'blue';
  document.getElementById('ee-target').value=e.weeklyTarget||'';
  document.getElementById('ee-vac').value=e.vacationHoursPerDay||'';
  document.getElementById('ee-phone').value=e.phone||'';
  document.getElementById('edit-emp-modal').style.display='flex';
}
function closeEditEmp(){document.getElementById('edit-emp-modal').style.display='none';}
function saveEditEmp(){
  const id=document.getElementById('ee-id').value;
  const e=state.employees.find(x=>x.id===id);if(!e)return;
  e.name=document.getElementById('ee-name').value.trim()||e.name;
  e.role=document.getElementById('ee-role').value.trim()||e.role;
  e.type=document.getElementById('ee-type').value;
  e.col=document.getElementById('ee-col').value;
  const tv=document.getElementById('ee-target').value.trim();
  e.weeklyTarget=tv?parseFloat(tv):null;
  const vv=document.getElementById('ee-vac').value.trim();
  e.vacationHoursPerDay=vv?parseFloat(vv):null;
  e.phone=document.getElementById('ee-phone').value.trim();
  closeEditEmp();saveData();renderEmpList();render();
}

// ── JSON SAVE / LOAD ─────────────────────
function exportJSON(){
  const data={filiale,exportedAt:new Date().toISOString(),employees:state.employees.map(e=>({name:e.name,role:e.role,type:e.type,col:e.col,weeklyTarget:e.weeklyTarget||null,vacationHoursPerDay:e.vacationHoursPerDay||null,phone:e.phone||'',isGuest:e.isGuest||false,guestFrom:e.guestFrom||'',guestUntil:e.guestUntil||''}))};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`mitarbeiter-${filiale}-${fmtDate(new Date())}.json`;a.click();URL.revokeObjectURL(url);
  showSave('Exportiert');
}
function importJSON(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=function(ev){
    try{
      const data=JSON.parse(ev.target.result);
      if(!data.employees||!Array.isArray(data.employees)){showImportErr('Keine employees-Liste gefunden.');return;}
      const imported=data.employees.map(emp=>({id:'e'+Date.now()+Math.random().toString(36).slice(2,6),name:String(emp.name||'').trim(),role:String(emp.role||'Mitarbeiter/-in').trim(),type:['vz','tz','gfb','rk'].includes(emp.type)?emp.type:'gfb',col:['blue','green','yellow','red','purple'].includes(emp.col)?emp.col:'blue',weeklyTarget:emp.weeklyTarget?parseFloat(emp.weeklyTarget):null,vacationHoursPerDay:emp.vacationHoursPerDay?parseFloat(emp.vacationHoursPerDay):null,phone:String(emp.phone||'').trim(),isGuest:!!emp.isGuest,guestFrom:String(emp.guestFrom||'').trim(),guestUntil:String(emp.guestUntil||'').trim()})).filter(e=>e.name);
      if(!imported.length){showImportErr('Keine gültigen Mitarbeiter in der Datei.');return;}
      pendingImport=imported;
      document.getElementById('ic-msg').textContent=`${imported.length} Mitarbeiter${data.filiale?' aus Filiale '+data.filiale:''} gefunden.`;
      document.getElementById('ic-replace').style.display=state.employees.length?'':'none';
      document.getElementById('ic-box').style.display='flex';
    }catch(err){showImportErr('Datei konnte nicht gelesen werden.');}
    input.value='';
  };
  reader.readAsText(file);
}
function doImport(mode){
  document.getElementById('ic-box').style.display='none';
  if(!pendingImport)return;
  state.employees=mode==='replace'?pendingImport:[...state.employees,...pendingImport];
  pendingImport=null;
  saveData();renderEmpList();renderGuestList();render();
  showSave('Importiert');
}
function showImportErr(msg){
  const el=document.getElementById('import-err');
  el.textContent='⚠ '+msg;el.style.display='block';
  setTimeout(()=>el.style.display='none',5000);
}

// ── NAV ──────────────────────────────────
function changeWeek(dir){state.monday=addDays(state.monday,dir*7);render();updateSyncBadge();if(document.getElementById('discord-ov').style.display!=='none')refreshArchive();}
function goToday(){state.monday=getMondayOfWeek(new Date());render();updateSyncBadge();}
function setBL(bl){state.bundesland=bl;localStorage.setItem(BL_KEY,bl);render();}

// ── WEBHOOK ──────────────────────────────
const getWH=()=>localStorage.getItem(WH_KEY+'-'+filiale)||'';
const setWH=url=>localStorage.setItem(WH_KEY+'-'+filiale,url);
const getDataWH=()=>localStorage.getItem(WH_DATA_KEY+'-'+filiale)||getWH(); // fallback to plan WH if not set separately
const setDataWH=url=>localStorage.setItem(WH_DATA_KEY+'-'+filiale,url);
const getWHMsgIds=wk=>{try{return JSON.parse(localStorage.getItem(WH_MSG_KEY+'-'+filiale+'-'+wk))||[];}catch{return[];}};
const setWHMsgIds=(wk,ids)=>localStorage.setItem(WH_MSG_KEY+'-'+filiale+'-'+wk,JSON.stringify(ids));
const isWkLocked=wk=>{try{const l=JSON.parse(localStorage.getItem(WH_LOCK_KEY+'-'+filiale)||'[]');return l.includes(wk);}catch{return false;}};
const setWkLocked=(wk,on)=>{try{const l=JSON.parse(localStorage.getItem(WH_LOCK_KEY+'-'+filiale)||'[]');const s=new Set(l);on?s.add(wk):s.delete(wk);localStorage.setItem(WH_LOCK_KEY+'-'+filiale,JSON.stringify([...s]));}catch{}};

// All weeks that have been posted (have stored message IDs)
function getPostedWeeks(){
  const prefix=WH_MSG_KEY+'-'+filiale+'-';
  const weeks=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(key&&key.startsWith(prefix)){
      const wk=key.slice(prefix.length);
      try{const ids=JSON.parse(localStorage.getItem(key)||'[]');if(ids.length)weeks.push(wk);}catch{}
    }
  }
  return weeks.sort().reverse(); // newest first
}

function updateSyncBadge(){
  const b=document.getElementById('sync-b');if(!b)return;
  const wk=fmtDate(state.monday);
  const hasUrl=!!getWH();const hasMsgIds=!!getWHMsgIds(wk).length;
  const locked=isWkLocked(wk);
  if(!hasUrl){b.className='sync-b sync-none';b.textContent='⬡ Discord';return;}
  if(locked){b.className='sync-b sync-lock';b.textContent='🔒 KW archiviert';return;}
  if(!hasMsgIds){b.className='sync-b sync-off';b.textContent='⬡ Noch nicht gepostet';return;}
  if(autoWH){b.className='sync-b sync-on';b.textContent='⬡ Auto-Sync aktiv';}
  else{b.className='sync-b sync-off';b.textContent='⬡ Discord nicht synchron';}
}

function refreshArchive(){
  const el=document.getElementById('archive-list');if(!el)return;
  const weeks=getPostedWeeks();
  const curWk=fmtDate(state.monday);
  if(!weeks.length){el.innerHTML='<div style="font-size:11px;color:var(--text3);padding:6px 8px;">Noch keine Wochen gepostet.</div>';return;}
  el.innerHTML=weeks.map(wk=>{
    const locked=isWkLocked(wk);
    const isCur=wk===curWk;
    const d=new Date(wk);const kw=getKW(d);
    const label=`KW ${kw} · ${d.getDate()}.${d.getMonth()+1}.${d.getFullYear()}`;
    const ids=getWHMsgIds(wk);
    return`<div class="archive-row${locked?' locked':''}">
      <span class="archive-kw">${locked?'🔒 ':''}KW ${kw}</span>
      <span class="archive-date">${d.getDate()}.${d.getMonth()+1}.${d.getFullYear()}${isCur?' ← aktuell':''}</span>
      <span class="archive-count">${ids.length} Msg</span>
      <button class="btn btn-sm" style="font-size:10px;padding:2px 6px" onclick="lockWeek('${wk}',${!locked})">${locked?'🔓 Entsperren':'🔒 Sperren'}</button>
    </div>`;
  }).join('');
  // Show/hide past-warn
  const pw=document.getElementById('past-warn');
  if(pw) pw.style.display=(getWHMsgIds(curWk).length&&!isWkLocked(curWk)&&curWk!==fmtDate(getMondayOfWeek(new Date())))?'block':'none';
}

function lockWeek(wk,lock){
  setWkLocked(wk,lock);
  refreshArchive();updateSyncBadge();
  if(lock&&autoWH&&wk===fmtDate(state.monday)){
    autoWH=false;
    const auto=document.getElementById('wh-auto');if(auto)auto.checked=false;
    const st=document.getElementById('wh-st');if(st)st.textContent='Auto-Sync deaktiviert (KW gesperrt)';
    setTimeout(()=>{if(st)st.textContent='';},3000);
  }
}

function toggleAutoWH(on){
  const wk=fmtDate(state.monday);
  if(on&&isWkLocked(wk)){
    const st=document.getElementById('wh-st');
    if(st)st.textContent='⚠ KW ist gesperrt — erst entsperren';
    setTimeout(()=>{if(st)st.textContent='';},3000);
    document.getElementById('wh-auto').checked=false;return;
  }
  autoWH=on;updateSyncBadge();
  const st=document.getElementById('wh-st');
  if(on&&!getWHMsgIds(wk).length&&getWH()){
    st.textContent='⚠ Erst Jetzt senden klicken';
    autoWH=false;document.getElementById('wh-auto').checked=false;updateSyncBadge();return;
  }
  st.textContent=on?'✓ Auto-Sync aktiv':'Auto-Sync deaktiviert';
  setTimeout(()=>st.textContent='',3500);
}

function debouncedWH(){
  const wk=fmtDate(state.monday);
  if(!autoWH||!getWHMsgIds(wk).length||isWkLocked(wk))return;
  clearTimeout(_whDebounce);_whDebounce=setTimeout(()=>postWH(),2500);
}

async function postWH(forceNew=false){
  const url=getWH();if(!url)return;
  const wk=fmtDate(state.monday);
  if(isWkLocked(wk)){
    const st=document.getElementById('wh-st');
    if(st)st.textContent='🔒 KW ist gesperrt — in Archiv entsperren';
    setTimeout(()=>{if(st)st.textContent='';},4000);return;
  }
  await postWHImage(url,wk,forceNew);return;
  // (text mode removed)
  const st=document.getElementById('wh-st');
  if(st)st.textContent=`⏳ Sende ${chunks.length} Nachrichten…`;
  // forceNew = ignore existing IDs → creates new archive messages instead of editing
  const existingIds=forceNew?[]:getWHMsgIds(wk);
  const newIds=[];let allOk=true;
  try{
    for(let i=0;i<chunks.length;i++){
      const text=chunks[i];const msgId=existingIds[i]||'';
      let resp;
      if(msgId){
        resp=await fetch(`${url}/messages/${msgId}?wait=true`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:text})});
        if(!resp.ok)resp=null;
      }
      if(!resp||!resp.ok){
        resp=await fetch(`${url}?wait=true`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:text})});
      }
      if(resp&&resp.ok){const d=await resp.json();newIds.push(d.id);}
      else{allOk=false;if(st)st.textContent=`✕ Fehler bei Nachricht ${i+1} — URL prüfen`;break;}
      if(i<chunks.length-1)await new Promise(r=>setTimeout(r,600));
    }
    if(allOk){
      setWHMsgIds(wk,newIds);
      document.getElementById('wh-first-notice').style.display='none';
      updateSyncBadge();refreshArchive();
      showSave(`Gespeichert · Discord ✓ (${chunks.length} Nachrichten)`);
      if(st)st.textContent=`✓ ${chunks.length} Nachrichten ${forceNew?'neu erstellt':'aktualisiert'}`;
      setTimeout(()=>{if(st)st.textContent='';},4000);
    }
  }catch(e){if(st)st.textContent='✕ Netzwerkfehler';console.error(e);}
}
function saveWH(){
  const raw=document.getElementById('wh-url').value.trim();
  const {url}=parseSyncString(raw);
  setWH(url);
  document.getElementById('wh-url').value=url; // strip any accidental suffix
  const wk=fmtDate(state.monday);
  const hasMsgIds=!!getWHMsgIds(wk).length;
  document.getElementById('wh-first-notice').style.display=(url&&!hasMsgIds)?'block':'none';
  if(!url){autoWH=false;document.getElementById('wh-auto').checked=false;}
  updateSyncBadge();refreshArchive();
  const st=document.getElementById('wh-st');
  st.textContent=url?'✓ Gespeichert':'✓ Deaktiviert';
  setTimeout(()=>st.textContent='',3000);
}

function saveDataWH(){
  const raw=document.getElementById('wh-data-url').value.trim();
  const {url,regId}=parseSyncString(raw);
  setDataWH(url);
  setSyncSt('⏳ Überprüfe Discord…','var(--text2)');
  if(!url){setSyncSt('✓ Deaktiviert','var(--text2)');return;}
  if(regId){
    // New device — has registry ID baked into the sync string → fetch it
    localStorage.setItem(WH_REG_ID+'-'+filiale,regId);
    setSyncSt('⏳ Lade Nachrichten-Index…','var(--text2)');
    fetchRegistry(url,regId).then(reg=>{
      if(!reg){setSyncSt('✕ Index-Nachricht nicht gefunden. Sync-String prüfen.','var(--red)');return;}
      setDataMsgIds(reg.dataIds||[]);
      setShiftsMsgIds(reg.shiftsIds||[]);
      updateSyncString();
      setSyncSt('⏳ Lade Daten von Discord…','var(--text2)');
      pullDataFromDiscord();
    });
  } else {
    // Same device — check if we already have a registry
    const existingReg=localStorage.getItem(WH_REG_ID+'-'+filiale);
    if(existingReg){
      updateSyncString();
      setSyncSt('✓ URL gespeichert. Sync-String aktualisiert.','var(--gi)');
    } else {
      setSyncSt('ℹ URL gespeichert. Noch keine Daten gesichert — klicke 💾 Daten sichern.','var(--text2)');
    }
  }
}

// Parse a webhook URL — registry ID stored as #fragment, never sent to server
function parseSyncString(raw){
  const s=raw.trim();
  try{
    const u=new URL(s);
    const regId=u.hash?u.hash.slice(1):''; // strip leading #
    u.hash='';
    return{url:u.toString().replace(/\/$/,''),regId};
  }catch{
    // fallback for legacy |||  format
    const idx=s.indexOf('|||');
    if(idx>=0) return{url:s.slice(0,idx).trim(),regId:s.slice(idx+3).trim()};
    return{url:s,regId:''};
  }
}

// Embed registry ID as #fragment in the URL field
function updateSyncString(){
  const url=localStorage.getItem(WH_DATA_KEY+'-'+filiale)||'';
  const regId=localStorage.getItem(WH_REG_ID+'-'+filiale)||'';
  const el=document.getElementById('wh-data-url');
  if(!el||!url) return;
  try{
    const u=new URL(url);
    if(regId) u.hash=regId;
    el.value=u.toString();
  }catch{el.value=regId?`${url}#${regId}`:url;}
}

async function fetchRegistry(url,regId){
  const msg=await whGet(url,regId);
  if(!msg) return null;
  return decodeMsg(msg.content);
}
function testWH(){postWH();}
function testWHNew(){postWH(true);}

// ── PLAN IMAGE RENDERER ──────────────────
function renderPlanCanvas(){
  const canvas=document.getElementById('plan-canvas');
  if(!canvas)return null;
  drawPlanToCanvas(canvas);
  return canvas;
}

function drawPlanToCanvas(canvas){
  const {monday,employees,shifts,bundesland}=state;
  const hols=getAllHols(monday,bundesland);
  const home=employees.filter(e=>!e.isGuest);
  const kw=getKW(monday);
  const end=addDays(monday,5);
  const today=fmtDate(new Date());

  // ── DIMENSIONS ───────────────────────────
  const SCALE=2;
  const MIN_COL=110; // minimum column width before horizontal scroll kicks in
  const PAD=14, DAYW=88;
  const empCount=home.length||1;
  const wrap=canvas.parentElement;
  const wrapW=(wrap?wrap.clientWidth:window.innerWidth)||1000;
  const wrapH=(wrap?wrap.clientHeight:window.innerHeight)||700;
  // Height: always fill the container exactly
  const H=Math.max(wrapH,320);
  // Width: fill container, or expand + scroll if min column width hit
  const naturalColW=Math.floor((wrapW-PAD*2-DAYW)/empCount);
  const COL_TOTAL=Math.max(naturalColW,MIN_COL);
  const W=PAD*2+DAYW+COL_TOTAL*empCount;
  // CSS dimensions
  canvas.style.width=W<=wrapW?'100%':W+'px';
  canvas.style.height='100%';

  canvas.width=W*SCALE; canvas.height=H*SCALE;
  const ctx=canvas.getContext('2d');
  ctx.scale(SCALE,SCALE);

  // ── PALETTE ──────────────────────────────
  const C={
    bg:'#0b0b0e',       surface:'#131318',  card:'#1a1a22',
    border:'#2a2a3a',   border2:'#3a3a50',  border3:'#4a4a62',
    accent:'#e8b800',   blue:'#58a6ff',     green:'#2ea043',
    red:'#dc3545',      orange:'#f97316',   gi:'#10b981',
    text:'#dddde8',     text2:'#8888a0',    text3:'#44444f',
    // highlighter fills (opaque-ish like marker)
    earlyFill:'rgba(232,184,0,0.22)',
    lateFill:'rgba(58,130,246,0.22)',
    mixedFill:'rgba(249,115,22,0.20)',
    earlyText:'#f0c800',
    lateText:'#82b8ff',
    mixedText:'#fba060',
    freiDiag:'#2a2a3a',
    holBg:'#140e00',
    todayBg:'#091220',
  };

  // ── LAYOUT CONSTANTS ─────────────────────
  const SUBT=8;

  // Header row heights
  const H_TITLE=34;
  const H_NAME=30;
  const H_ROLE=24;
  const H_WSOLL=22;
  const H_SUBHDR=20;
  const HDR_H=H_TITLE+H_NAME+H_ROLE+H_WSOLL+H_SUBHDR;

  // Day group with 4 equal sub-rows
  const FOOT_H=38;
  const DAY_AVAIL=H-HDR_H-FOOT_H;
  const DG=Math.floor(DAY_AVAIL/6);
  const SR=Math.floor(DG/4);  // sub-row height (all equal)
  // legacy aliases for backward compat
  const R_MAIN=SR, R_P1=SR, R_P2=SR, R_P3=DG-SR*3;

  const COL_Z=Math.round(COL_TOTAL*0.62);
  const COL_S=COL_TOTAL-COL_Z;

  // ── HELPERS ──────────────────────────────
  function fx(ci){return PAD+DAYW+ci*COL_TOTAL;}  // x start of employee ci
  function fz(ci){return fx(ci);}                  // Zeit sub-col x
  function fs(ci){return fx(ci)+COL_Z;}            // Std sub-col x
  function line(x1,y1,x2,y2,col,w=0.5){
    ctx.strokeStyle=col;ctx.lineWidth=w;
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
  }
  function rect(x,y,w,h,col){ctx.fillStyle=col;ctx.fillRect(x,y,w,h);}
  function txt(s,x,y,font,col,align='left'){
    ctx.font=font;ctx.fillStyle=col;ctx.textAlign=align;
    ctx.fillText(String(s||''),x,y);ctx.textAlign='left';
  }
  function clip(s,maxPx,font){
    ctx.font=font;
    if(ctx.measureText(s).width<=maxPx)return s;
    while(s.length>1&&ctx.measureText(s+'…').width>maxPx)s=s.slice(0,-1);
    return s+'…';
  }
  function hline(y,col=C.border,w=0.5){line(0,y,W,y,col,w);}
  function vline(x,y1,y2,col=C.border,w=0.5){line(x,y1,x,y2,col,w);}

  // ── BACKGROUND ───────────────────────────
  rect(0,0,W,H,C.bg);

  // ── TITLE ROW ────────────────────────────
  rect(0,0,W,H_TITLE,C.card);
  txt(`Woche: KW ${kw}`,PAD+4,H_TITLE-10,'bold 13px system-ui',C.accent);
  const dr=`${monday.getDate()}.${monday.getMonth()+1}. – ${end.getDate()}.${end.getMonth()+1}.${monday.getFullYear()}`;
  txt(`Filiale ${filiale}  ·  ${dr}`,PAD+110,H_TITLE-10,'13px system-ui',C.text);
  txt(`Stand: ${new Date().toLocaleString('de-DE')}`,W-PAD,H_TITLE-10,'10px system-ui',C.text3,'right');
  hline(H_TITLE,C.border2,1);

  // ── EMPLOYEE HEADER ROWS ─────────────────
  let hy=H_TITLE;

  // Row: Name
  rect(0,hy,DAYW+PAD,H_NAME,C.surface);
  txt('Name:',PAD+4,hy+H_NAME-8,'bold 9px system-ui',C.text3);
  home.forEach((e,ci)=>{
    const empColor=COL[e.col]||C.text;
    const x=fz(ci);
    rect(x,hy,COL_TOTAL,H_NAME,C.card);
    const fn='bold 10px system-ui';
    // Split name: last word = Nachname (top), rest = Vorname (bottom)
    const parts=e.name.trim().split(/\s+/);
    const lastName=parts.length>1?parts[parts.length-1]:parts[0];
    const firstName=parts.length>1?parts.slice(0,-1).join(' '):'';
    txt(clip(lastName,COL_TOTAL-8,fn),x+SUBT,hy+H_NAME*0.48,fn,empColor);
    if(firstName)txt(clip(firstName,COL_TOTAL-8,fn),x+SUBT,hy+H_NAME*0.92,fn,empColor);
    vline(x,hy,hy+H_NAME,C.border2);
  });
  hy+=H_NAME; hline(hy,C.border);

  // Row: Tätigkeit
  rect(0,hy,DAYW+PAD,H_ROLE,C.surface);
  txt('Tätigkeit:',PAD+4,hy+H_ROLE-7,'bold 8px system-ui',C.text3);
  home.forEach((e,ci)=>{
    const x=fz(ci);
    const fn='9px system-ui';
    txt(clip(e.role,COL_TOTAL-8,fn),x+SUBT,hy+H_ROLE-7,fn,C.text2);
    vline(x,hy,hy+H_ROLE,C.border2);
  });
  hy+=H_ROLE; hline(hy,C.border);

  // Row: Wochen-Std
  rect(0,hy,DAYW+PAD,H_WSOLL,C.surface);
  txt('Wochen-Std.:',PAD+4,hy+H_WSOLL-6,'bold 8px system-ui',C.text3);
  home.forEach((e,ci)=>{
    const x=fz(ci);
    const label=e.weeklyTarget?String(e.weeklyTarget).replace('.',','):'—';
    txt(label,x+COL_TOTAL/2,hy+H_WSOLL-6,'bold 10px system-ui',C.accent,'center');
    vline(x,hy,hy+H_WSOLL,C.border2);
  });
  hy+=H_WSOLL; hline(hy,C.border);

  // Row: sub-column headers (Zeit | Std per employee)
  rect(0,hy,DAYW+PAD,H_SUBHDR,C.surface);
  txt('Soll-Std.',PAD+2,hy+H_SUBHDR-5,'bold 7px system-ui',C.text3);
  home.forEach((e,ci)=>{
    const zx=fz(ci); const sx=fs(ci);
    txt('Zeit',zx+COL_Z/2,hy+H_SUBHDR-5,'bold 8px system-ui',C.text2,'center');
    txt('Std.',sx+COL_S/2,hy+H_SUBHDR-5,'bold 8px system-ui',C.text2,'center');
    vline(zx,hy,hy+H_SUBHDR,C.border2);
    vline(sx,hy,hy+H_SUBHDR,C.border,0.4);
  });
  hy+=H_SUBHDR; hline(hy,C.border2,1);
  const BODY_Y=hy;

  // ── DAY GROUPS ───────────────────────────
  // Day column width + split point — define once (reused in footer)
  const DCOL_W=DAYW+PAD;
  const DATE_W=Math.round(DCOL_W*0.58);
  for(let i=0;i<6;i++){
    const day=addDays(monday,i); const ds=fmtDate(day);
    const ft=hols[ds]; const isTod=ds===today;
    const gy=BODY_Y+i*DG; // group top y

    // 4 equal sub-row y positions
    const y1=gy, y2=gy+SR, y3=gy+2*SR, y4=gy+3*SR;

    // Day group background
    const dayBg=ft?C.holBg:isTod?C.todayBg:C.bg;
    rect(0,gy,W,DG,dayBg);

    // Day label column background
    rect(0,gy,DCOL_W,DG,C.surface);
    // Slightly dimmer bg for rows 2–4 of day col (visual break after the date row)
    rect(0,y2,DCOL_W,DG-SR,'rgba(13,13,18,0.5)');

    // Today/holiday accent bar
    if(isTod){rect(0,gy,3,DG,C.blue);}
    else if(ft){rect(0,gy,3,DG,C.accent);}

    // Sub-row 1: left = date, right = day total hours (split with vertical line)
    vline(DATE_W,y1,y2,C.border,0.4);

    const dlName=DAYS[day.getDay()];
    const dateStr=`${day.getDate()}.${day.getMonth()+1}`;
    // Consistent font size for the whole day column
    const dayFS=Math.max(10,Math.min(13,Math.floor(SR*0.52)));

    txt(dateStr,PAD+4,y1+Math.round(SR*0.62),`bold ${dayFS}px system-ui`,isTod?C.blue:ft?C.accent:C.text);

    // Day total hours (right of split)
    const dtH=dayTotalH(ds);
    if(dtH>0){
      const dtStr=String(Math.round(dtH*100)/100).replace('.',',');
      txt(dtStr,DATE_W+4,y1+Math.round(SR*0.62),`bold ${dayFS}px 'JetBrains Mono',monospace`,C.accent);
    }

    // Sub-row 2: day name, full width
    txt(dlName,PAD+4,y2+Math.round(SR*0.62),`bold ${dayFS}px system-ui`,isTod?C.blue:C.text2);
    if(ft){txt(ft.length>12?ft.slice(0,11)+'…':ft,PAD+4,y2+Math.round(SR*0.62)+dayFS+2,`bold ${dayFS-2}px system-ui`,C.accent);}

    // Sub-rows 3 & 4: empty in day column

    // Sub-row dividers
    hline(y2,C.border,0.4);
    hline(y3,C.border,0.4);
    hline(y4,C.border,0.4);

    // Employee cells
    home.forEach((e,ci)=>{
      const zx=fz(ci); const sx=fs(ci);
      const sh=(shifts[ds]||{})[e.id];

      // Column dividers
      vline(zx,gy,gy+DG,C.border2,0.8);
      vline(sx,gy,gy+DG,C.border,0.4);

      // Sub-row dividers in cell
      // (sub-row dividers already drawn for the whole row in day group)

      if(!sh||sh.type==='free'){
        ctx.strokeStyle=C.freiDiag; ctx.lineWidth=1.2; ctx.globalAlpha=0.5;
        ctx.beginPath(); ctx.moveTo(zx+2,gy+2); ctx.lineTo(zx+COL_TOTAL-2,gy+DG-2); ctx.stroke();
        ctx.globalAlpha=1; return;
      }

      if(sh.type==='work'&&!sh.goFil){
        const tc=shiftTimeClass(sh.start,sh.end);
        const fills={'sh-early':C.earlyFill,'sh-late':C.lateFill,'sh-mixed':C.mixedFill};
        const txts={'sh-early':C.earlyText,'sh-late':C.lateText,'sh-mixed':C.mixedText};
        const fill=tc?fills[tc]:null;
        const tColor=tc?txts[tc]:C.text;

        // Highlight fill spans sub-rows 2 and 3 (start + end times)
        if(fill){rect(zx+1,y2+1,COL_Z-2,SR*2-2,fill);}

        const FS=Math.max(9,Math.min(14,Math.floor(SR*0.6)));
        // Start time in sub-row 2, hours next to it in Std col
        txt(sh.start,zx+SUBT,y2+Math.round(SR*0.62),`bold ${FS}px 'JetBrains Mono',monospace`,tColor);
        const h=calcH(sh.start,sh.end,sh.pause);
        if(h>0){
          const hs=String(Math.round(h*100)/100).replace('.',',');
          txt(hs,sx+COL_S/2,y2+Math.round(SR*0.62),`bold 11px system-ui`,C.accent,'center');
        }
        // End time in sub-row 3
        txt(sh.end,zx+SUBT,y3+Math.round(SR*0.62),`bold ${FS}px 'JetBrains Mono',monospace`,tColor);
        // Notiz in sub-row 4 (its own dedicated row)
        if(sh.note){
          txt(clip(sh.note,COL_TOTAL-10,'9px system-ui'),zx+SUBT,y4+Math.round(SR*0.62),'italic 9px system-ui',C.accent);
        }
      } else if(sh.type==='work'&&sh.goFil){
        rect(zx+1,y2+1,COL_Z-2,SR*2-2,'rgba(16,185,129,0.15)');
        txt(`→ ${sh.goFil}`,zx+SUBT,y2+Math.round(SR*0.62),'bold 10px system-ui',C.gi);
        if(sh.goTimes==='yes'){
          txt(sh.start,zx+SUBT,y3+Math.round(SR*0.62),'9px system-ui',C.text2);
          txt(sh.end,zx+SUBT+Math.round(COL_Z*0.45),y3+Math.round(SR*0.62),'9px system-ui',C.text2);
        }
      } else {
        const icons={vacation:'🏖',sick:'🤒',bs:'🏫',absent:'◌'};
        const txtsMap={vacation:'Urlaub',sick:'Krank',bs:'BS',absent:'Abw.'};
        const cols={vacation:C.blue,sick:C.red,bs:C.blue,absent:C.text2};
        const ec=cols[sh.type]||C.text2;
        rect(zx+1,y2+1,COL_Z-2,SR*2-2,ec+'18');
        const iconY=y2+SR+Math.round(SR*0.1);
        ctx.font=`${Math.round(SR*0.45)}px system-ui`;
        ctx.fillText(icons[sh.type]||'',zx+SUBT,iconY);
        txt(txtsMap[sh.type]||sh.type,zx+SUBT+Math.round(SR*0.5)+2,iconY,'10px system-ui',ec);
      }
    });

    // Copy-source highlight
    if(_copyBuf&&_copyBuf.ds===ds){
      const srcIdx=home.findIndex(e=>e.id===_copyBuf.empId);
      if(srcIdx>=0){
        const sx2=fz(srcIdx);
        ctx.strokeStyle=C.accent; ctx.lineWidth=2.5;
        ctx.strokeRect(sx2+1,gy+1,COL_TOTAL-2,DG-2);
      }
    }
    // Full-width group bottom border
    hline(gy+DG,C.border2,0.8);
  }

  // ── FOOTER / TOTALS ROW ──────────────────
  const fy=BODY_Y+6*DG;
  rect(0,fy,W,FOOT_H,C.card);
  hline(fy,C.border2,1);
  // Show team total in day label col (no Gesamtstunden text)
  {
    const tt=teamTotalH();
    vline(DATE_W,fy,fy+FOOT_H,C.border,0.4);
    txt('Gesamt',PAD+4,fy+FOOT_H*0.6,'bold 9px system-ui',C.text3);
    if(tt>0){
      const ts=String(Math.round(tt*10)/10).replace('.',',');
      txt(ts,DATE_W+4,fy+FOOT_H*0.6,"bold 11px 'JetBrains Mono',monospace",C.accent);
    }
  }

  home.forEach((e,ci)=>{
    const zx=fz(ci); const sx=fs(ci);
    const h=wkH(e.id); const tgt=e.weeklyTarget?parseFloat(e.weeklyTarget):null;
    vline(zx,fy,fy+FOOT_H,C.border2,0.8);
    vline(sx,fy,fy+FOOT_H,C.border,0.4);
    if(!h)return;
    let col=C.accent; let label=String(Math.round(h*10)/10).replace('.',',');
    if(tgt){
      const dv=Math.round((h-tgt)*100)/100;
      col=dv>0.05?C.red:dv<-0.5?C.green:C.accent;
      const sign=dv>0?'+':'';
      label+=` (${sign}${String(dv).replace('.',',')})`;
    }
    const FS=Math.max(8,Math.min(11,Math.floor(COL_TOTAL/12)));
    txt(label,zx+COL_TOTAL/2,fy+FOOT_H-10,`bold ${FS}px 'JetBrains Mono',monospace`,col,'center');
  });

  // Outer border
  ctx.strokeStyle=C.border2; ctx.lineWidth=1.5;
  ctx.strokeRect(PAD,0,W-PAD*2,H);
  // Right vertical close-off
  vline(W-PAD,0,H,C.border2,1.5);

}
function getPlanPNGBlob(){
  return new Promise(resolve=>{
    // Export always at A4 landscape regardless of screen size
    const offscreen=document.createElement('canvas');
    // Temporarily override clientHeight/Width by drawing to a fixed-size canvas
    const orig=HTMLCanvasElement.prototype.getContext;
    // Just draw to a dedicated offscreen canvas at A4 size
    const a4w=1754,a4h=1240,sc=2;
    offscreen.width=a4w*sc; offscreen.height=a4h*sc;
    const ctx=offscreen.getContext('2d');
    ctx.scale(sc,sc);
    // Re-draw with fixed A4 dimensions by temporarily patching parentElement
    const fakeParent={clientWidth:a4w,clientHeight:a4h};
    const realParent=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'parentElement');
    // Simpler: just call drawPlanToCanvas with A4 canvas
    drawPlanToCanvasFixed(offscreen,a4w,a4h);
    offscreen.toBlob(resolve,'image/png');
  });
}

// Draw at an explicit W×H (used for A4 PNG export)
function drawPlanToCanvasFixed(canvas,forcedW,forcedH){
  // Temporarily spoof parentElement clientWidth/Height
  const _orig=canvas.__proto__;
  const saved=canvas.parentElement;
  Object.defineProperty(canvas,'parentElement',{get:()=>({clientWidth:forcedW,clientHeight:forcedH}),configurable:true});
  drawPlanToCanvas(canvas);
  Object.defineProperty(canvas,'parentElement',{get:()=>saved,configurable:true});
}

function downloadPlanPNG(){
  const canvas=document.getElementById('plan-canvas');
  if(!canvas)return;
  const link=document.createElement('a');
  link.download=`dienstplan-kw${getKW(state.monday)}-${state.monday.getFullYear()}.png`;
  link.href=canvas.toDataURL('image/png');
  link.click();
}

async function postWHImage(url,wk,forceNew){
  const st=document.getElementById('wh-st');
  if(st)st.textContent='⏳ Bild wird erstellt…';
  try{
    const blob=await getPlanPNGBlob();
    const kw=getKW(state.monday);
    const caption=`📋 **Dienstplan KW ${kw} · Filiale ${filiale}**`;
    const existingIds=forceNew?[]:getWHMsgIds(wk);
    const msgId=existingIds[0]||'';

    const fd=new FormData();
    fd.append('files[0]',blob,`dienstplan-kw${kw}.png`);
    fd.append('payload_json',JSON.stringify({content:caption}));

    let resp;
    // Discord images can't be patched (no file edit via PATCH), always post new
    // but delete old one if exists — actually just always post fresh
    resp=await fetch(`${url}?wait=true`,{method:'POST',body:fd});

    if(resp&&resp.ok){
      const d=await resp.json();
      setWHMsgIds(wk,[d.id]);
      document.getElementById('wh-first-notice').style.display='none';
      updateSyncBadge();refreshArchive();
      showSave('Bild gepostet · Discord ✓');
      if(st)st.textContent='✓ Bild gepostet';
      setTimeout(()=>{if(st)st.textContent='';},4000);
    } else {
      const err=resp?await resp.text():'';
      if(st)st.textContent='✕ Fehler — '+err.slice(0,60);
    }
  }catch(e){if(st)st.textContent='✕ Netzwerkfehler';console.error(e);}
}

// ── DISCORD TEXT ─────────────────────────
// ── DISCORD TEXT ─────────────────────────


// ── TEXT TABLE ENGINE ─────────────────────────────────────
// Renders a tablesgenerator.com-style ASCII table, works in
// both Discord (code block) and WhatsApp (monospace block).
function textTable(rows, colWidths){
  // rows: array of arrays of strings. First row = header.
  // colWidths: array of column widths (auto-calculated if omitted)
  if(!colWidths){
    colWidths=rows[0].map((_,ci)=>Math.max(...rows.map(r=>String(r[ci]||'').length)));
  }
  const sep='+'+colWidths.map(w=>'-'.repeat(w+2)).join('+')+'+';
  const row=cells=>('|'+cells.map((c,i)=>' '+String(c||'').padEnd(colWidths[i])+' ').join('|')+'|');
  const lines=[];
  lines.push(sep);
  rows.forEach((r,i)=>{
    lines.push(row(r));
    if(i===0||i===rows.length-1) lines.push(sep);
  });
  return lines.join('\n');
}

function shiftStr(s,includeHours=true){
  if(!s||s.type==='free') return '';
  if(s.type==='work'&&!s.goFil){
    const t=`${s.start}-${s.end}`;
    const h=calcH(s.start,s.end,s.pause);
    return includeHours&&h>0?`${t} (${fmtH(h)})`:t;
  }
  if(s.type==='work'&&s.goFil) return`→ ${s.goFil}${s.goTimes==='yes'?' '+s.start+'-'+s.end:''}`;
  return{vacation:'Urlaub',bs:'BS',sick:'Krank',absent:'Abw.'}[s.type]||s.type;
}

function genDiscord(){
  renderPlanCanvas();
}

function showDiscord(){
  genDiscord();
  document.getElementById('discord-ov').style.display='flex';
  document.getElementById('wh-fil').textContent=filiale||'–';
  document.getElementById('d-fil-ch').textContent=filiale||'XXXX';
  document.getElementById('wh-url').value=getWH();
  updateSyncString(); // show url|||regId if available, else just url
  document.getElementById('wh-auto').checked=autoWH;
  document.getElementById('wh-st').textContent='';
  document.getElementById('sync-st').textContent='';
  const wk=fmtDate(state.monday);
  const hasMsgIds=!!getWHMsgIds(wk).length;
  document.getElementById('wh-first-notice').style.display=(getWH()&&!hasMsgIds&&!isWkLocked(wk))?'block':'none';
  updateSyncBadge();
  refreshArchive();
}
function closeDiscord(){document.getElementById('discord-ov').style.display='none';}


// ── UTILS ────────────────────────────────
function copyEl(id,okId){const ta=document.getElementById(id);ta.select();document.execCommand('copy');const ok=document.getElementById(okId);ok.style.display='inline';setTimeout(()=>ok.style.display='none',2500);}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ── VACATION ─────────────────────────────
let vacYear=new Date().getFullYear();

function getVacData(){
  try{return JSON.parse(localStorage.getItem(VAC_KEY+'-'+filiale))||{};}catch{return{};}
}
function saveVacData(d){localStorage.setItem(VAC_KEY+'-'+filiale,JSON.stringify(d));}

function getKWsInYear(y){
  // Count ISO weeks in year
  const lastDay=new Date(y,11,31);
  const kw=getKW(lastDay);
  return kw===1?52:kw;
}

function kwToMonday(kw,y){
  // Get Monday of ISO week kw in year y
  const jan4=new Date(y,0,4);
  const jan4Day=jan4.getDay()||7;
  const weekStart=new Date(jan4);
  weekStart.setDate(jan4.getDate()-(jan4Day-1)+(kw-1)*7);
  return weekStart;
}

function showVac(){
  document.getElementById('vac-ov').style.display='flex';
  document.getElementById('vac-year-lbl').textContent=vacYear;
  renderVac();
}
function closeVac(){document.getElementById('vac-ov').style.display='none';}
function changeVacYear(d){vacYear+=d;document.getElementById('vac-year-lbl').textContent=vacYear;renderVac();}

function toggleVacCell(empId,kw){
  const data=getVacData();
  if(!data[empId])data[empId]=[];
  const key=vacYear+'-'+kw;
  const idx=data[empId].indexOf(key);
  if(idx>=0)data[empId].splice(idx,1);
  else data[empId].push(key);
  saveVacData(data);renderVac();
}

function renderVac(){
  const data=getVacData();
  const home=state.employees.filter(e=>!e.isGuest);
  const totalKWs=getKWsInYear(vacYear);
  const curKW=getKW(new Date());
  const curYear=new Date().getFullYear();
  const MAX_WEEKS=6;

  // Compute used weeks per employee this year
  const used={};
  home.forEach(e=>{
    const marked=(data[e.id]||[]).filter(k=>k.startsWith(vacYear+'-'));
    used[e.id]=marked.length;
  });

  // Compute overlap per KW (how many employees on vacation that week)
  const overlap={};
  for(let kw=1;kw<=totalKWs;kw++){
    const key=vacYear+'-'+kw;
    const cnt=home.filter(e=>(data[e.id]||[]).includes(key)).length;
    overlap[kw]=cnt;
  }

  // Summary chips
  const sumEl=document.getElementById('vac-summary');
  sumEl.innerHTML=home.map(e=>{
    const u=used[e.id]||0;
    const over=u>MAX_WEEKS;
    return`<span class="vac-chip ${over?'over':u===MAX_WEEKS?'ok':''}">${e.name.split(' ').pop()}: ${u}/${MAX_WEEKS} Wo.</span>`;
  }).join('');

  // Table — Mitarbeiter = rows, KW = columns
  let t=`<thead><tr><th style="position:sticky;left:0;z-index:3;background:var(--card);min-width:90px;padding:6px 8px;font-size:10px;font-weight:600;">Mitarbeiter</th>`;
  for(let kw=1;kw<=totalKWs;kw++){
    const isCur=kw===curKW&&vacYear===curYear;
    const mon=kwToMonday(kw,vacYear);
    const monStr=`${mon.getDate()}.${mon.getMonth()+1}.`;
    t+=`<th id="vac-kw-${kw}" style="min-width:38px;padding:4px 2px;font-size:9px;font-weight:${isCur?700:500};color:${isCur?'var(--accent)':'var(--text2)'};white-space:nowrap;text-align:center;">${kw}<br><span style="font-size:8px;color:var(--text3)">${monStr}</span></th>`;
  }
  t+=`</tr></thead><tbody>`;
  home.forEach(e=>{
    const u=used[e.id]||0;
    const over=u>MAX_WEEKS;
    t+=`<tr>`;
    t+=`<td style="position:sticky;left:0;background:var(--surface);padding:4px 8px;z-index:1;white-space:nowrap;">`;
    t+=`<div style="font-size:12px;font-weight:600;color:${COL[e.col]||'var(--text)'}">${esc(e.name.split(' ').pop())}</div>`;
    t+=`<div style="font-size:9px;color:${over?'var(--red)':u===MAX_WEEKS?'var(--gi)':'var(--text3)'};">${u}/${MAX_WEEKS} Wo.</div>`;
    t+=`</td>`;
    for(let kw=1;kw<=totalKWs;kw++){
      const key=vacYear+'-'+kw;
      const marked=(data[e.id]||[]).includes(key);
      const isOverlap=marked&&overlap[kw]>1;
      const cls=isOverlap?'vc overlap':marked?'vc marked':'vc';
      t+=`<td><button class="${cls}" onclick="toggleVacCell('${e.id}',${kw})">${marked?(isOverlap?'⚠':'✓'):''}</button></td>`;
    }
    t+=`</tr>`;
  });
  t+=`</tbody>`;
  document.getElementById('vac-table').innerHTML=t;
  // Scroll current KW into view horizontally
  if(vacYear===curYear){
    setTimeout(()=>{
      const th=document.getElementById('vac-kw-'+curKW);
      if(th)th.scrollIntoView({inline:'center',behavior:'smooth'});
    },50);
  }
}

// ── CLOUD DATA SYNC ──────────────────────
const DATA_PREFIX='🗄️ DIENSTPLAN-DATEN';
const SHIFTS_PREFIX='🗄️ SCHICHTEN-DATEN';
const MAX_MSG=1900;

// Storage: arrays of message IDs for multi-chunk payloads
function getDataMsgIds(){try{return JSON.parse(localStorage.getItem(WH_DATA_ID+'-'+filiale))||[];}catch{return[];}}
function setDataMsgIds(ids){localStorage.setItem(WH_DATA_ID+'-'+filiale,JSON.stringify(ids));}
// legacy single-ID compat
function getDataMsgId(){const ids=getDataMsgIds();return ids[0]||'';}
function setDataMsgId(id){setDataMsgIds(id?[id]:[]);}
function getShiftsMsgIds(){try{return JSON.parse(localStorage.getItem(WH_SHIFTS_ID+'-'+filiale))||[];}catch{return[];}}
function setShiftsMsgIds(ids){localStorage.setItem(WH_SHIFTS_ID+'-'+filiale,JSON.stringify(ids));}

// ── Encode / decode helpers ─────────────────────────────
function encodeChunks(prefix,obj){
  // Split a JSON object into ≤MAX_MSG messages.
  // Strategy: try full payload first; if too big, split arrays by halving recursively.
  const ts=new Date().toISOString();
  function header(idx,total){return `${prefix} · Filiale ${filiale} [${idx+1}/${total}]\n`;}
  function pack(data){return JSON.stringify(data);}

  const full=`${header(0,1)}\`\`\`json\n${pack(obj)}\n\`\`\``;
  if(full.length<=MAX_MSG) return[full];

  // Split by chunking the largest array inside the object
  const chunks=[];
  // For employees/vacations: split employees array
  if(obj.employees&&Array.isArray(obj.employees)){
    const emps=obj.employees;
    const base={...obj,employees:[]};
    // first message: metadata + first batch of employees
    let batch=[];
    let batchChunks=[];
    for(const emp of emps){
      batch.push(emp);
      const test=`${header(0,99)}\`\`\`json\n${pack({...base,employees:batch,_chunk:'emp'})}\n\`\`\``;
      if(test.length>MAX_MSG){
        if(batch.length>1){batchChunks.push([...batch.slice(0,-1)]);batch=[emp];}
        else{batchChunks.push([...batch]);batch=[];}
      }
    }
    if(batch.length)batchChunks.push(batch);
    const total=batchChunks.length;
    batchChunks.forEach((b,i)=>{
      const isFirst=i===0;
      const payload=isFirst?{...base,employees:b,_chunk:'emp',_total:total}:{_chunk:'emp',_idx:i,_total:total,filiale,ts,employees:b};
      chunks.push(`${header(i,total)}\`\`\`json\n${pack(payload)}\n\`\`\``);
    });
    return chunks;
  }
  // For shifts: split by date keys
  if(obj.shifts){
    const keys=Object.keys(obj.shifts);
    const base={...obj,shifts:{}};
    let batch={};let batchChunks=[];
    for(const k of keys){
      batch[k]=obj.shifts[k];
      const test=`${header(0,99)}\`\`\`json\n${pack({...base,shifts:batch,_chunk:'shifts'})}\n\`\`\``;
      if(test.length>MAX_MSG){
        const prev={...batch};delete prev[k];
        if(Object.keys(prev).length){batchChunks.push(prev);batch={[k]:obj.shifts[k]};}
        else{batchChunks.push({[k]:obj.shifts[k]});batch={};}
      }
    }
    if(Object.keys(batch).length)batchChunks.push(batch);
    const total=batchChunks.length;
    batchChunks.forEach((b,i)=>{
      const payload=i===0?{...base,shifts:b,_chunk:'shifts',_total:total}:{_chunk:'shifts',_idx:i,_total:total,filiale,ts,shifts:b};
      chunks.push(`${header(i,total)}\`\`\`json\n${pack(payload)}\n\`\`\``);
    });
    return chunks;
  }
  // fallback: truncate (shouldn't happen)
  return[full.slice(0,MAX_MSG)];
}

function decodeMsg(content){
  const tag='```json\n';const tagEnd='\n```';
  const start=content.indexOf(tag);const end=content.lastIndexOf(tagEnd);
  if(start<0||end<0) return null;
  try{return JSON.parse(content.slice(start+tag.length,end));}catch{return null;}
}

// Reassemble multi-chunk payload from array of parsed JSON objects
function reassembleChunks(parts){
  if(!parts.length) return null;
  const base=parts[0];
  for(let i=1;i<parts.length;i++){
    const p=parts[i];
    if(p._chunk==='emp'&&p.employees) base.employees=[...(base.employees||[]),...p.employees];
    if(p._chunk==='shifts'&&p.shifts) Object.assign(base.shifts||(base.shifts={}),p.shifts);
  }
  return base;
}

async function whPost(url,text,existingId){
  let resp;
  if(existingId){
    resp=await fetch(`${url}/messages/${existingId}?wait=true`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:text})});
    if(!resp.ok)resp=null;
  }
  if(!resp||!resp.ok){
    resp=await fetch(`${url}?wait=true`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({content:text})});
  }
  if(resp&&resp.ok) return await resp.json();
  return null;
}

async function whGet(url,msgId){
  if(!msgId) return null;
  try{
    const resp=await fetch(`${url}/messages/${msgId}`,{method:'GET'});
    if(!resp.ok) return null;
    return await resp.json();
  }catch{return null;}
}

// Post an array of chunks, patching existing message IDs or creating new ones
async function postChunks(url,chunks,existingIds,delayMs=600){
  const newIds=[];
  for(let i=0;i<chunks.length;i++){
    const msg=await whPost(url,chunks[i],existingIds[i]||'');
    if(!msg) return null;
    newIds.push(msg.id);
    if(i<chunks.length-1) await new Promise(r=>setTimeout(r,delayMs));
  }
  // If we posted fewer chunks than before (data shrank), the old extra messages
  // are now orphaned — harmless, just leave them.
  return newIds;
}

// Fetch and decode all chunks for a stored ID list
async function fetchChunks(url,ids){
  const parts=[];
  for(const id of ids){
    const msg=await whGet(url,id);
    if(!msg) continue;
    const p=decodeMsg(msg.content);
    if(p) parts.push(p);
  }
  return parts;
}

async function pushDataToDiscord(){
  const url=getDataWH();if(!url){setSyncSt('⚠ Erst Webhook-URL eingeben und speichern.','var(--go)');return;}
  setSyncSt('⏳ Speichere in Discord…','var(--text2)');
  try{
    // 1. Employees + vacations
    const dPayload={
      v:4,ts:new Date().toISOString(),filiale,
      employees:state.employees,
      vacations:(()=>{try{return JSON.parse(localStorage.getItem(VAC_KEY+'-'+filiale)||'{}')}catch{return{}}})()
    };
    const dChunks=encodeChunks(DATA_PREFIX,dPayload);
    setSyncSt(`⏳ Mitarbeiter: ${dChunks.length} Nachrichten…`,'var(--text2)');
    const dIds=await postChunks(url,dChunks,getDataMsgIds());
    if(!dIds){setSyncSt('✕ Fehler beim Speichern der Mitarbeiterdaten — Webhook-URL prüfen.','var(--red)');return;}
    setDataMsgIds(dIds);

    // 2. Shifts (rolling 12+4 week window)
    const now=getMondayOfWeek(new Date());
    const from=addDays(now,-84);const to=addDays(now,35);
    const subShifts={};
    Object.keys(state.shifts).forEach(ds=>{
      const d=new Date(ds);
      if(d>=from&&d<=to&&Object.keys(state.shifts[ds]||{}).length)subShifts[ds]=state.shifts[ds];
    });
    const sPayload={v:4,ts:new Date().toISOString(),filiale,shifts:subShifts};
    const sChunks=encodeChunks(SHIFTS_PREFIX,sPayload);
    setSyncSt(`⏳ Schichten: ${sChunks.length} Nachrichten…`,'var(--text2)');
    const sIds=await postChunks(url,sChunks,getShiftsMsgIds());
    if(sIds) setShiftsMsgIds(sIds);

    // 3. Post/update registry message — contains all chunk IDs so any device can bootstrap
    const registry={v:1,ts:new Date().toISOString(),filiale,dataIds:dIds,shiftsIds:sIds||[]};
    const regText=`🗂️ SYNC-INDEX · Filiale ${filiale}
\`\`\`json
${JSON.stringify(registry)}
\`\`\``;
    const existingRegId=localStorage.getItem(WH_REG_ID+'-'+filiale)||'';
    const regMsg=await whPost(url,regText,existingRegId);
    if(regMsg){
      localStorage.setItem(WH_REG_ID+'-'+filiale,regMsg.id);
      updateSyncString();
    }

    const total=dIds.length+(sIds?sIds.length:0)+1;
    setSyncSt(`✓ Gespeichert — ${total} Nachrichten · Sync-String aktualisiert`,`var(--gi)`);
    showSave('In Discord gespeichert');updateSyncBadge();
  }catch(e){setSyncSt('✕ Netzwerkfehler: '+e.message,'var(--red)');console.error(e);}
}

async function pullDataFromDiscord(){
  const url=getDataWH();if(!url){setSyncSt('⚠ Erst Webhook-URL eingeben und speichern.','var(--go)');return;}
  setSyncSt('⏳ Lade von Discord…','var(--text2)');
  try{
    const dataIds=getDataMsgIds();
    if(!dataIds.length){
      setSyncSt('ℹ Noch keine Daten auf Discord. Erst "In Discord speichern" ausführen.','var(--text2)');return;
    }
    const dParts=await fetchChunks(url,dataIds);
    if(!dParts.length){setSyncSt('✕ Nachrichten nicht gefunden — möglicherweise gelöscht.','var(--red)');return;}
    const discordData=reassembleChunks(dParts);
    if(!discordData||discordData.filiale!==filiale){
      setSyncSt('✕ Daten gehören zu einer anderen Filiale oder sind beschädigt.','var(--red)');return;
    }

    const shiftIds=getShiftsMsgIds();
    let discordShifts=null;
    if(shiftIds.length){
      const sParts=await fetchChunks(url,shiftIds);
      if(sParts.length){const sr=reassembleChunks(sParts);if(sr)discordShifts=sr.shifts||{};}
    }
    if(discordShifts) discordData._shifts=discordShifts;

    // Check for conflicts
    const localTs=new Date(JSON.parse(localStorage.getItem(DATA_KEY+'-'+filiale)||'{}').ts||0);
    const discordTs=new Date(discordData.ts||0);
    const localEmpCount=state.employees.length;
    const discordEmpCount=(discordData.employees||[]).length;
    const hasLocalData=state.employees.length>0||Object.keys(state.shifts).length>0;
    const isConflict=hasLocalData&&(
      localEmpCount!==discordEmpCount||
      JSON.stringify(state.employees.map(e=>e.id).sort())!==
      JSON.stringify((discordData.employees||[]).map(e=>e.id).sort())
    );

    updateSyncString(); // ensure field always shows current sync string
    if(isConflict){
      _pendingDiscordData=discordData;
      showConflictModal(localTs,discordTs,localEmpCount,discordEmpCount,discordShifts);
      setSyncSt('ℹ Konflikt erkannt — bitte im Dialog entscheiden.','var(--go)');
    } else {
      applyDiscordData(discordData);
      setSyncSt(`✓ Daten geladen von Discord (${discordTs.toLocaleString('de-DE')})`,`var(--gi)`);
    }
  }catch(e){setSyncSt('✕ Netzwerkfehler: '+e.message,'var(--red)');console.error(e);}
}

let _pendingDiscordData=null;

function showConflictModal(localTs,discordTs,localEmpCount,discordEmpCount,discordShifts){
  const localNewer=localTs>discordTs;
  const dNewer=discordTs>localTs;
  document.getElementById('conflict-desc').textContent=
    `Lokale Daten und Discord-Daten unterscheiden sich. Wähle welche Version du verwenden möchtest.`;
  const localDetail=`${localEmpCount} Mitarbeiter\n${Object.keys(state.shifts).length} Schicht-Tage\nStand: ${localTs.toLocaleString('de-DE')||'unbekannt'}`;
  const discordDetail=`${discordEmpCount} Mitarbeiter\n${Object.keys(discordShifts||{}).length} Schicht-Tage\nStand: ${new Date(_pendingDiscordData.ts).toLocaleString('de-DE')}`;
  document.getElementById('cf-local-detail').textContent=localDetail;
  document.getElementById('cf-discord-detail').textContent=discordDetail;
  document.getElementById('cf-local-lbl').textContent=localNewer?'💻 Lokal (neuer)':'💻 Lokal';
  document.getElementById('cf-discord-lbl').textContent=dNewer?'☁ Discord (neuer)':'☁ Discord';
  document.getElementById('cf-local').classList.toggle('newer',localNewer);
  document.getElementById('cf-discord').classList.toggle('newer',dNewer);
  document.getElementById('cf-merge-hint').textContent=
    'Zusammenführen: Mitarbeiter aus beiden Listen kombiniert. Schichten: die neuere Version gewinnt.';
  document.getElementById('conflict-modal').style.display='flex';
}

function resolveConflict(choice){
  document.getElementById('conflict-modal').style.display='none';
  if(!_pendingDiscordData) return;
  if(choice==='discord'){
    applyDiscordData(_pendingDiscordData);
    setSyncSt('✓ Discord-Daten übernommen.','var(--gi)');
  } else if(choice==='local'){
    setSyncSt('✓ Lokale Daten behalten.','var(--text2)');
  } else if(choice==='merge'){
    // Merge: combine employee lists, keep local shifts but add discord shifts for dates not in local
    const discordEmps=_pendingDiscordData.employees||[];
    const localIds=new Set(state.employees.map(e=>e.id));
    const merged=[...state.employees];
    discordEmps.forEach(e=>{if(!localIds.has(e.id))merged.push(e);});
    state.employees=merged;
    if(_pendingDiscordData._shifts){
      Object.keys(_pendingDiscordData._shifts).forEach(ds=>{
        if(!state.shifts[ds]||Object.keys(state.shifts[ds]).length===0){
          state.shifts[ds]=_pendingDiscordData._shifts[ds];
        }
      });
    }
    if(_pendingDiscordData.vacations){
      const vd=getVacData();
      const dv=_pendingDiscordData.vacations;
      Object.keys(dv).forEach(id=>{
        if(!vd[id])vd[id]=dv[id];
        else{const merged=[...new Set([...vd[id],...dv[id]])];vd[id]=merged;}
      });
      saveVacData(vd);
    }
    saveData();render();
    setSyncSt(`✓ Zusammengeführt: ${state.employees.length} Mitarbeiter.`,'var(--gi)');
  }
  _pendingDiscordData=null;
}

function applyDiscordData(data){
  if(data.employees) state.employees=data.employees;
  if(data._shifts){
    Object.assign(state.shifts,data._shifts);
  }
  if(data.vacations) saveVacData(data.vacations);
  saveData();render();renderEmpList();
}

function setSyncSt(msg,color){
  const el=document.getElementById('sync-st');
  if(!el) return;
  el.style.color=color||'var(--text2)';
  el.textContent=msg;
}

// ── COPY / PASTE CELL ────────────────────
let _copyBuf=null; // {ds, empId, shift}

function copyCell(ds,empId){
  const sh=(state.shifts[ds]||{})[empId];
  _copyBuf={ds,empId,shift:sh?JSON.parse(JSON.stringify(sh)):null};
  render(); // re-draw canvas with copy indicator
  showSave('Schicht kopiert — Zelle klicken zum Einfügen · Esc = Abbrechen');
}

function cellClick(event,ds,empId,dayLabel,empName){
  if(_copyBuf){
    // paste mode
    event.stopPropagation();
    if(_copyBuf.ds===ds&&_copyBuf.empId===empId){
      // clicked source again → cancel
      cancelCopy();return;
    }
    pasteCell(ds,empId);
  } else {
    openShift(ds,empId,dayLabel,empName);
  }
}

function pasteCell(ds,empId){
  if(!_copyBuf) return;
  if(!state.shifts[ds]) state.shifts[ds]={};
  if(_copyBuf.shift){
    state.shifts[ds][empId]=JSON.parse(JSON.stringify(_copyBuf.shift));
  } else {
    delete state.shifts[ds][empId];
  }
  cancelCopy();
  saveData();render();
}

function cancelCopy(){
  _copyBuf=null;
  render(); // remove copy highlight
}

// Cancel copy on Escape key
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&_copyBuf)cancelCopy();});

// ── CANVAS CLICK HANDLER ────────────────
function handleCanvasClick(e,canvas){
  const {monday,employees,shifts,bundesland}=state;
  const home=employees.filter(emp=>!emp.isGuest);
  if(!home.length) return;

  const rect=canvas.getBoundingClientRect();
  // Account for CSS scaling (canvas CSS width may differ from logical W)
  const scaleX=canvas.width/(canvas.getBoundingClientRect().width*2); // ×2 for SCALE
  const scaleY=canvas.height/(canvas.getBoundingClientRect().height*2);
  const mx=(e.clientX-rect.left)*(canvas.width/rect.width)/2; // logical px
  const my=(e.clientY-rect.top)*(canvas.height/rect.height)/2;

  // Reconstruct layout constants (must match drawPlanToCanvas)
  const PAD=14,DAYW=88;
  const empCount=home.length;
  const wrapW=canvas.parentElement?canvas.parentElement.clientWidth:window.innerWidth;
  const wrapH=canvas.parentElement?canvas.parentElement.clientHeight:window.innerHeight;
  const H=Math.max(wrapH||700,320);
  const naturalColW=Math.floor((wrapW-PAD*2-DAYW)/empCount);
  const COL_TOTAL=Math.max(naturalColW,110);
  const H_TITLE=34,H_NAME=30,H_ROLE=24,H_WSOLL=22,H_SUBHDR=20;
  const HDR_H=H_TITLE+H_NAME+H_ROLE+H_WSOLL+H_SUBHDR;
  const FOOT_H=38;
  const DAY_AVAIL=H-HDR_H-FOOT_H;
  const DG=Math.floor(DAY_AVAIL/6);

  // Click in header or footer → ignore
  if(my<HDR_H||my>HDR_H+6*DG) return;

  // Which day row?
  const dayIdx=Math.floor((my-HDR_H)/DG);
  if(dayIdx<0||dayIdx>5) return;
  const day=addDays(monday,dayIdx);
  const ds=fmtDate(day);
  const dl=DAYS[day.getDay()];
  const dayLabel=`${dl} ${day.getDate()}.${day.getMonth()+1}.`;

  // Which employee column?
  const cx=mx-PAD-DAYW;
  if(cx<0) return; // clicked day label column
  const ci=Math.floor(cx/COL_TOTAL);
  if(ci<0||ci>=home.length) return;
  const emp=home[ci];

  // Check for copy mode first
  if(_copyBuf){
    pasteCell(ds,emp.id);
  } else {
    openShift(ds,emp.id,dayLabel,emp.name);
  }
}

// backdrop close
['shift-modal','edit-emp-modal','fil-modal'].forEach(id=>document.getElementById(id).addEventListener('click',function(e){if(e.target===this)this.style.display='none';}));
['mgmt-ov','discord-ov','vac-ov'].forEach(id=>document.getElementById(id).addEventListener('click',function(e){if(e.target===this)this.style.display='none';}));
document.getElementById('conflict-modal').addEventListener('click',function(e){if(e.target===this)this.style.display='none';});

window.addEventListener('resize',()=>{if(document.getElementById('sched-canvas'))render();});
init();
