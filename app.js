/* SRP Site Visit — Sarasota Residential Painting (no prices). Visits save on the phone (IndexedDB). */
(function(){
'use strict';

// ---------- Catálogo ----------
const SIZES = [
  {v:'Small',  d:'≈ 10×10 ft'},
  {v:'Medium', d:'≈ 12×14 ft'},
  {v:'Large',  d:'≈ 15×20 ft or more'}
];
const HEIGHTS = ['Standard (8–9 ft)','10 ft','12 ft','Over 12 ft'];
const SURF_IN = ['Walls','Ceiling','Baseboards','Crown molding','Wood paneling / wainscot'];
const COUNTS_IN = [
  ['puertas','Doors (1 per side)'],
  ['marcos','Door frames'],
  ['ventanas','Windows / window trim'],
  ['closets','Closet / bifold doors'],
  ['gabPuertas','Cabinet doors'],
  ['gabCajones','Cabinet drawers'],
  ['heaters','Baseboard heaters (mask around)']
];
const REPAIRS = [
  ['parcheCh','Small patches (nail hole / coin)'],
  ['parcheMd','Medium patches (hand size)'],
  ['parcheGr','Large patches (bigger than a sheet of paper)'],
  ['grietas','Cracks']
];
const COND_IN = ['Big color change','Needs primer','Popcorn ceiling','Damaged texture','Stains / moisture','Lots of furniture','Occupied home','Wallpaper on wall','Knotty / stained wood (needs stain-blocking primer)','Wall decor to remove'];

const COUNTS_OUT = [
  ['puertasExt','Exterior doors'],
  ['puertasGaraje','Garage doors'],
  ['ventanas','Windows / trim'],
  ['shutters','Shutters'],
  ['grietas','Stucco / wall cracks'],
  ['madera','Wood repairs'],
  ['gables','Gables (siding triangles)'],
  ['bajantes','Downspouts']
];
const SOFFIT_W = [
  {v:'Standard', d:'≈ 1 ft (12–16 in)'},
  {v:'Wide', d:'≈ 2 ft'},
  {v:'Extra wide', d:'3 ft or more'}
];
const SOFFIT_MAT = ['Vented aluminum / vinyl','Wood','Stucco','Tongue & groove boards'];
const hasSoffit = t => /Soffit|Lanai|House/.test(t);
const EXTRA_TYPES = ['Stucco crack','Map cracking (many fine cracks)','Old patch that shows','Peeling paint','Rust on metal','Rotten wood','Mildew / mold','Old caulk','Water damage','Hole / dent','Torn drywall paper (seal + skim coat)','Glue / adhesive residue','Other'];
const EXTRA_SIZE = ['Small','Medium','Large','Whole wall'];
const SHUT_TYPE = ['Accordion','Storm panels','Roll-down','Bahama / colonial'];
const SHUT_PREP = [
  {v:'Clean and paint only', d:'good condition'},
  {v:'Sand + degrease', d:'loose old paint'},
  {v:'Remove rust + metal primer', d:'rust or heavy peeling'}
];
const COND_OUT = ['Peeling paint','Heavy mildew','Cracked stucco','Rotten wood','Rust','Hard access / tall ladder','Plants against the wall'];

const TYPES_IN = ['Bedroom','Master bedroom','Living room','Foyer','Dining room','Kitchen','Kitchen island','Bathroom','Master bathroom','Half bath','Hallway','Stairway','Office','Laundry room','Closet','Entry','Garage (interior)','Other interior'];
const TYPES_OUT = ['House — exterior walls','Soffit & fascia','Lanai / porch ceiling','Doors & garage','Windows & shutters','Pressure washing','Garage floor / concrete','Fence / gate','Other exterior'];

// ---------- Estado ----------
let state = blank();
function blank(){
  return {id:'V'+Date.now().toString(36).toUpperCase(), creado:new Date().toISOString(), modo:'antes',
    cliente:{nombre:'',tel:'',dir:'',ciudad:'Sarasota',tipo:'House',pisos:'1',pintura:'SRP',notas:''}, areas:[]};
}
const photos = new Map(); // photoId -> dataURL

// ---------- Saved on the phone (IndexedDB) ----------
let db=null, saveT=null;
const DBN='srp-visits', IDB=window['indexed'+'DB'];
function openDB(){
  return new Promise(res=>{
    if(!IDB){ res(null); return; }
    let r; try{ r=IDB.open(DBN,1); }catch(e){ res(null); return; }
    r.onupgradeneeded=()=>{ const d=r.result;
      if(!d.objectStoreNames.contains('visits')) d.createObjectStore('visits',{keyPath:'id'});
      if(!d.objectStoreNames.contains('photos')){ const ps=d.createObjectStore('photos',{keyPath:'id'}); ps.createIndex('visit','visit'); }
      if(!d.objectStoreNames.contains('meta')) d.createObjectStore('meta'); };
    r.onsuccess=()=>res(r.result); r.onerror=()=>res(null); r.onblocked=()=>res(null);
  });
}
function tx(store,mode,fn){
  return new Promise((res,rej)=>{ if(!db){ res(null); return; }
    try{ const t=db.transaction(store,mode); const out=fn(t.objectStore(store)); t.oncomplete=()=>res(out&&out.result!==undefined?out.result:out); t.onerror=()=>rej(t.error); t.onabort=()=>rej(t.error); }
    catch(e){ rej(e); } });
}
const reqP=r=>new Promise((res,rej)=>{ r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
function save(){ updHdr&&updHdr(); if(!db) return; clearTimeout(saveT); saveT=setTimeout(saveNow,350); }
async function saveNow(){
  if(!db) return;
  state.actualizado=new Date().toISOString();
  try{ await tx('visits','readwrite',s=>s.put(JSON.parse(JSON.stringify(state))));
       await tx('meta','readwrite',s=>s.put(state.id,'current')); }
  catch(e){ toast('Phone storage is full — send the report now'); }
}
function dbPut(id,url){ if(!db) return; tx('photos','readwrite',s=>s.put({id,visit:state.id,url})).catch(()=>toast('Phone storage is full — send the report now')); }
function dbDel(id){ if(!db) return; tx('photos','readwrite',s=>s.delete(id)).catch(()=>{}); }
function dbClear(){}
async function listVisits(){ if(!db) return []; const t=db.transaction('visits'); const all=await reqP(t.objectStore('visits').getAll()); return all.sort((a,b)=>(b.actualizado||b.creado).localeCompare(a.actualizado||a.creado)); }
async function loadVisit(id){
  const t=db.transaction(['visits','photos']);
  const v=await reqP(t.objectStore('visits').get(id)); if(!v) return false;
  const ps=await reqP(t.objectStore('photos').index('visit').getAll(id));
  state=v; photos.clear(); ps.forEach(p=>photos.set(p.id,p.url));
  await tx('meta','readwrite',s=>s.put(id,'current'));
  renderClient(); renderAreas(); updHdr(); return true;
}
async function deleteVisit(id){
  const t=db.transaction(['visits','photos'],'readwrite');
  t.objectStore('visits').delete(id);
  const idx=t.objectStore('photos').index('visit'); const keys=await reqP(idx.getAllKeys(id));
  keys.forEach(k=>t.objectStore('photos').delete(k));
  await new Promise(r=>{t.oncomplete=r; t.onerror=r;});
}
window.addEventListener('beforeunload',e=>{ if(!db && state.areas.length){ e.preventDefault(); e.returnValue=''; } });
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden' && db){ clearTimeout(saveT); saveNow(); } });

// ---------- Saved visits list ----------
const fmtD=iso=>{ try{ return new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}); }catch(e){ return ''; } };
async function openVisits(){
  if(!db){ toast('Saving works in the installed app (home screen)'); return; }
  await saveNow();
  const list=await listVisits();
  $('#vlist').innerHTML = list.length? list.map(v=>{
    const n=(v.areas||[]).reduce((s,a)=>s+(a.fotos||[]).length,0), cur=v.id===state.id;
    const c=v.cliente||{};
    return `<div class="vrow ${cur?'cur':''}" data-vid="${esc(v.id)}">
      <button class="vopen" data-vopen="${esc(v.id)}">
        <span class="vname">${esc(c.nombre||'(no name)')}${cur?' <em>open now</em>':''}</span>
        <span class="vsub">${esc([c.dir,c.ciudad].filter(Boolean).join(', ')||'No address')}</span>
        <span class="vmeta"><b class="${v.modo==='despues'?'done':''}">${v.modo==='despues'?'COMPLETED':'ESTIMATE'}</b> ${(v.areas||[]).length} areas · ${n} photos · ${fmtD(v.actualizado||v.creado)}</span>
      </button>
      <button class="vdel" data-vdel="${esc(v.id)}" aria-label="Delete visit">Delete</button></div>`; }).join('')
    : '<p class="hint">No saved visits yet.</p>';
  $('#visits').hidden=false;
}
document.addEventListener('click',async e=>{
  const o=e.target.closest('[data-vopen]'), d=e.target.closest('[data-vdel]');
  if(o){ await saveNow(); await loadVisit(o.dataset.vopen); $('#visits').hidden=true; $('#splash').hidden=true; go('visit'); toast('Visit opened'); }
  else if(d){
    if(!d.dataset.sure){ d.dataset.sure='1'; d.textContent='Sure?'; setTimeout(()=>{d.dataset.sure=''; d.textContent='Delete';},2500); return; }
    const id=d.dataset.vdel; await deleteVisit(id);
    if(id===state.id){ state=blank(); photos.clear(); renderClient(); renderAreas(); saveNow(); }
    openVisits(); toast('Visit deleted');
  }
});

// ---------- Utilidades ----------
const $ = s=>document.querySelector(s);
const esc = s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function toast(m){ const t=$('#toast'); t.textContent=m; t.hidden=false; clearTimeout(t._t); t._t=setTimeout(()=>t.hidden=true,2600); }
const isOut = a=> TYPES_OUT.includes(a.tipo);
const CO_CITIES=['Steamboat Springs','Hayden','Oak Creek','Craig'];
const stateOf = c=> CO_CITIES.includes(c)?'Colorado':(c==='Other'?'—':'Florida');

function newArea(tipo){
  const n = state.areas.filter(a=>a.tipo===tipo).length;
  return {id:'A'+Math.random().toString(36).slice(2,8), tipo, nombre: n? `${tipo} ${n+1}`:tipo,
    tam:'Medium', altura:HEIGHTS[0], sup: isOutT(tipo)?[]:['Walls'], ancho:'Standard', mat:'', shutTipo:'', shutPrep:'', extras:[], cnt:{}, cond:[], nota:'', fotos:[]};
}
function isOutT(t){ return TYPES_OUT.includes(t); }

// ---------- Render ----------
function segBind(el, get, set){
  el.querySelectorAll('button').forEach(b=>{
    b.classList.toggle('on', b.dataset.v===get());
    b.onclick=()=>{ set(b.dataset.v); el.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); save(); renderChecks(); };
  });
}

function renderClient(){
  const c=state.cliente;
  [['c_nombre','nombre'],['c_tel','tel'],['c_dir','dir'],['c_ciudad','ciudad'],['c_tipo','tipo'],['c_pisos','pisos'],['c_notas','notas']].forEach(([id,k])=>{
    const el=$('#'+id); el.value=c[k]; el.oninput=()=>{c[k]=el.value; save(); renderChecks();};
  });
  segBind($('#c_pintura'), ()=>c.pintura, v=>c.pintura=v);
  segBind($('#mode'), ()=>state.modo, v=>{state.modo=v; renderAreas();});
}

function chips(list, sel, cls){
  return `<div class="chips">${list.map(x=>{
    const v = typeof x==='string'?x:x.v, d = typeof x==='string'?'':` <small>${x.d}</small>`;
    return `<button class="chip ${sel(v)?'on':''}" data-${cls}="${esc(v)}">${esc(v)}${d}</button>`;}).join('')}</div>`;
}
function steppers(list, cnt){
  return `<div class="steps">${list.map(([k,l])=>{const n=cnt[k]||0;
    return `<div class="step"><span>${l}</span><div class="ctl"><button data-dec="${k}" aria-label="less">−</button><output class="${n?'has':''}">${n}</output><button data-inc="${k}" aria-label="more">+</button></div></div>`;}).join('')}</div>`;
}

function phHTML(list){
  return list.map(f=>{const t=f.tipo==='despues'?'AFTER':(f.ex?'DETAIL':'BEFORE');
    return `<div class="ph"><img src="${photos.get(f.id)||''}" alt=""><span class="tag ${f.tipo==='despues'?'d':''} ${f.ex?'det':''}">${t}</span><button data-delph="${f.id}" aria-label="Delete photo">✕</button></div>`;}).join('');
}
function extraHTML(a,x,k){
  const ph=phHTML(a.fotos.filter(f=>f.ex===x.id));
  return `<div class="extra" data-ex="${x.id}">
    <div class="extra-top"><b>Extra ${k+1}</b>
      <select data-xf="tipo" aria-label="Extra work type">${EXTRA_TYPES.map(t=>`<option ${x.tipo===t?'selected':''}>${t}</option>`).join('')}</select>
      <button class="del" data-delex="${x.id}">Delete</button></div>
    ${chips(EXTRA_SIZE, v=>x.tam===v, 'xtam')}
    <div class="photos">${ph}</div>
    <div class="photo-btns">
      <label>Detail photo<input type="file" accept="image/*" capture="environment" data-photo="antes" data-ex="${x.id}"></label>
      <label class="alt">From gallery<input type="file" accept="image/*" multiple data-photo="antes" data-ex="${x.id}"></label>
    </div>
    <input data-xf="nota" value="${esc(x.nota)}" placeholder="Where it is / what it needs (e.g. back wall, next to electric panel)">
  </div>`;
}
function areaHTML(a,i){
  a.extras=a.extras||[];
  const out=isOut(a);
  const ph=phHTML(a.fotos.filter(f=>!f.ex));
  const mainLbl = state.modo==='despues' ? 'AFTER photo' : 'BEFORE photo';
  const mainTipo = state.modo==='despues' ? 'despues' : 'antes';
  return `<div class="area" data-id="${a.id}" data-kind="${out?'out':'in'}">
    <div class="area-top"><div class="num">${i+1}</div><div class="tt"><small>${out?'Exterior':'Interior'}</small><input value="${esc(a.nombre)}" data-f="nombre" aria-label="Area name"></div><button class="del" data-delarea>Delete</button></div>
    <div class="area-body">
      <div class="sub">Photos</div>
      <div class="photos">${ph}</div>
      <div class="photo-btns">
        <label>${mainLbl}<input type="file" accept="image/*" capture="environment" data-photo="${mainTipo}"></label>
        <label class="alt">From gallery<input type="file" accept="image/*" multiple data-photo="${mainTipo}"></label>
      </div>
      ${out?'':`
      <div class="sub">Size</div>${chips(SIZES, v=>a.tam===v, 'tam')}
      <div class="sub">Ceiling height</div>${chips(HEIGHTS, v=>a.altura===v, 'alt')}
      <div class="sub">What gets painted?</div>${chips(SURF_IN, v=>a.sup.includes(v), 'sup')}`}
      ${out&&hasSoffit(a.tipo)?`
      <div class="sub">Soffit / overhang width</div>${chips(SOFFIT_W, v=>(a.ancho||'Standard')===v, 'ancho')}
      <div class="sub">Soffit material</div>${chips(SOFFIT_MAT, v=>a.mat===v, 'mat')}`:''}
      <div class="sub">Count</div>${steppers(out?COUNTS_OUT:COUNTS_IN, a.cnt)}
      ${out&&((a.cnt.shutters||0)>0||/shutters/i.test(a.tipo))?`
      <div class="sub">Shutter type</div>${chips(SHUT_TYPE, v=>a.shutTipo===v, 'sht')}
      <div class="sub">Shutter prep</div>${chips(SHUT_PREP, v=>a.shutPrep===v, 'shp')}`:''}
      ${out?'':`<div class="sub">Repairs</div>${steppers(REPAIRS, a.cnt)}`}
      <div class="sub">Condition</div>${chips(out?COND_OUT:COND_IN, v=>a.cond.includes(v), 'cond')}
      <div class="sub">Extra work / details</div>
      <p class="mini">Cracks, rust, rotten wood, peeling paint… Each detail with its own photo so it can be priced separately.</p>
      ${a.extras.map((x,k)=>extraHTML(a,x,k)).join('')}
      <button class="btn-extra" data-addex>+ Add extra work</button>
      <div class="sub">Note</div><textarea rows="2" data-f="nota" placeholder="Anything important for the estimate…">${esc(a.nota)}</textarea>
    </div></div>`;
}

function renderAreas(){
  const box=$('#areas');
  box.innerHTML = state.areas.length ? state.areas.map(areaHTML).join('') : '<p class="hint">Add each room or part of the house the customer wants painted.</p>';
  $('#areaCount').textContent=state.areas.length;
  const nb=$('#navBadge'); nb.textContent=state.areas.length; nb.hidden=!state.areas.length;
  renderChecks();
}

function renderChecks(){
  const c=state.cliente, A=state.areas, tipo=state.modo;
  updHdr();
  const noPh = A.filter(a=>!a.fotos.some(f=>f.tipo===tipo&&!f.ex)).map(a=>a.nombre);
  const items=[
    [!!c.nombre.trim(),'Customer name'],
    [!!c.dir.trim(),'Address'],
    [A.length>0, A.length? `${A.length} area(s)` : 'At least one area'],
    [A.length>0 && noPh.length===0, noPh.length? `Missing ${tipo==='despues'?'AFTER':'BEFORE'} photo: ${noPh.join(', ')}` : `${tipo==='despues'?'AFTER':'BEFORE'} photos in every area`]
  ];
  $('#checks').innerHTML=items.map(([ok,t])=>`<div class="chk ${ok?'':'no'}"><b>${ok?'✓':'!'}</b><span>${esc(t)}</span></div>`).join('');
}

// ---------- Eventos de áreas ----------
function areaOf(el){ const id=el.closest('.area')?.dataset.id; return state.areas.find(a=>a.id===id); }
$('#areas').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return; const a=areaOf(b); if(!a) return;
  if(b.dataset.tam){ a.tam=b.dataset.tam; }
  else if(b.dataset.alt){ a.altura=b.dataset.alt; }
  else if('addex' in b.dataset){ a.extras.push({id:'X'+Math.random().toString(36).slice(2,8), tipo:EXTRA_TYPES[0], tam:'Small', nota:''}); }
  else if(b.dataset.delex){ const id=b.dataset.delex; a.fotos.filter(f=>f.ex===id).forEach(f=>photos.delete(f.id)); a.fotos=a.fotos.filter(f=>f.ex!==id); a.extras=a.extras.filter(x=>x.id!==id); }
  else if(b.dataset.xtam){ const x=a.extras.find(x=>x.id===b.closest('.extra').dataset.ex); if(x) x.tam=b.dataset.xtam; }
  else if(b.dataset.sht){ a.shutTipo = a.shutTipo===b.dataset.sht?'':b.dataset.sht; }
  else if(b.dataset.shp){ a.shutPrep = b.dataset.shp; }
  else if(b.dataset.ancho){ a.ancho=b.dataset.ancho; }
  else if(b.dataset.mat){ a.mat = a.mat===b.dataset.mat?'':b.dataset.mat; }
  else if(b.dataset.sup){ const v=b.dataset.sup; a.sup=a.sup.includes(v)?a.sup.filter(x=>x!==v):[...a.sup,v]; }
  else if(b.dataset.cond){ const v=b.dataset.cond; a.cond=a.cond.includes(v)?a.cond.filter(x=>x!==v):[...a.cond,v]; }
  else if(b.dataset.inc){ a.cnt[b.dataset.inc]=(a.cnt[b.dataset.inc]||0)+1; }
  else if(b.dataset.dec){ a.cnt[b.dataset.dec]=Math.max(0,(a.cnt[b.dataset.dec]||0)-1); }
  else if(b.dataset.delph){ const id=b.dataset.delph; a.fotos=a.fotos.filter(f=>f.id!==id); photos.delete(id); dbDel(id); }
  else if('delarea' in b.dataset){
    if(!b.dataset.sure){ b.dataset.sure='1'; b.textContent='Sure?'; setTimeout(()=>{b.dataset.sure='';b.textContent='Delete';},2500); return; }
    a.fotos.forEach(f=>{photos.delete(f.id); dbDel(f.id);}); state.areas=state.areas.filter(x=>x!==a);
  } else return;
  save(); const y=window.scrollY; renderAreas(); window.scrollTo(0,y);
});
$('#areas').addEventListener('input',e=>{
  const xf=e.target.dataset.xf;
  if(xf){ const a=areaOf(e.target); const x=a&&a.extras.find(x=>x.id===e.target.closest('.extra').dataset.ex); if(x){ x[xf]=e.target.value; save(); } return; }
  const f=e.target.dataset.f; if(!f) return; const a=areaOf(e.target); if(a){ a[f]=e.target.value; save(); if(f==='nombre') renderChecks(); }
});
$('#areas').addEventListener('change',async e=>{
  const inp=e.target; if(!inp.dataset.photo) return; const a=areaOf(inp); if(!a||!inp.files.length) return;
  const files=[...inp.files]; inp.value='';
  $('#busyTxt').textContent='Saving photo…'; $('#busy').hidden=false;
  for(const file of files){
    try{
      const url=await compress(file);
      const id='P'+Math.random().toString(36).slice(2,10);
      photos.set(id,url); dbPut(id,url);
      const ph={id, tipo:inp.dataset.photo, t:new Date().toISOString()}; if(inp.dataset.ex) ph.ex=inp.dataset.ex;
      a.fotos.push(ph);
    }catch(err){ toast('Could not read the photo'); }
  }
  $('#busy').hidden=true; save(); const y=window.scrollY; renderAreas(); window.scrollTo(0,y);
});

function compress(file){
  return new Promise((res,rej)=>{
    const img=new Image(); const u=URL.createObjectURL(file);
    img.onload=()=>{
      const M=1400, s=Math.min(1, M/Math.max(img.naturalWidth,img.naturalHeight));
      const w=Math.round(img.naturalWidth*s), h=Math.round(img.naturalHeight*s);
      const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h); URL.revokeObjectURL(u);
      try{ res(cv.toDataURL('image/jpeg',0.72)); }catch(e){ rej(e); }
    };
    img.onerror=()=>{URL.revokeObjectURL(u); rej(new Error('img'));};
    img.src=u;
  });
}

// ---------- Selector de tipo ----------
function fillGrid(id,list,kind){ $(id).innerHTML=list.map(t=>`<button data-t="${esc(t)}"><span class="gname">${esc(t)}</span><span class="grow"><span class="gsub">${kind}</span><span class="gplus">+</span></span></button>`).join(''); }
fillGrid('#gridIn',TYPES_IN,'Interior'); fillGrid('#gridOut',TYPES_OUT,'Exterior');
$('#addArea').onclick=()=>{ $('#picker').hidden=false; };
$('#pickClose').onclick=()=>{ $('#picker').hidden=true; };
$('#picker').addEventListener('click',e=>{
  if(e.target.id==='picker'){ $('#picker').hidden=true; return; }
  const b=e.target.closest('button[data-t]'); if(!b) return;
  state.areas.push(newArea(b.dataset.t)); $('#picker').hidden=true; save(); go('areas'); renderAreas();
  setTimeout(()=>{ const els=document.querySelectorAll('.area'); els[els.length-1]?.scrollIntoView({behavior:'smooth',block:'start'}); },60);
});

// ---------- Resumen y PDF ----------
function labelCnt(k){ const all=[...COUNTS_IN,...REPAIRS,...COUNTS_OUT]; return (all.find(x=>x[0]===k)||[k,k])[1]; }
function areaLines(a){
  const L=[];
  if(!isOut(a)){ L.push(`Size: ${a.tam}   ·   Ceiling: ${a.altura}`); L.push(`Paint: ${a.sup.length?a.sup.join(', '):'—'}`); }
  if(isOut(a)&&hasSoffit(a.tipo)) L.push(`Soffit: ${a.ancho||'Standard'}${a.mat?'   ·   '+a.mat:''}`);
  const c=Object.entries(a.cnt).filter(([,n])=>n>0).map(([k,n])=>`${labelCnt(k)}: ${n}`);
  if(c.length) L.push(c.join('   ·   '));
  if(a.shutTipo||a.shutPrep) L.push(`Shutter type & prep: ${[a.shutTipo,a.shutPrep].filter(Boolean).join('   ·   ')}`);
  if(a.cond.length) L.push(`Condition: ${a.cond.join(', ')}`);
  if(a.nota.trim()) L.push(`Note: ${a.nota.trim()}`);
  return L;
}
function fileBase(){
  const c=state.cliente; const n=(c.nombre||'customer').trim().replace(/[^\wÁÉÍÓÚÑáéíóúñ ]+/g,'').replace(/\s+/g,'-');
  const d=new Date().toISOString().slice(0,10); return `Visit-${state.modo==='despues'?'COMPLETED':'ESTIMATE'}-${n}-${d}`;
}

async function buildPDF(){
  const { jsPDF } = window.jspdf;
  const doc=new jsPDF({unit:'pt',format:'letter'}); const W=612,H=792,M=40; let y=M;
  const navy=[31,46,74], slate=[90,103,125];
  const c=state.cliente;
  // logo
  try{ const lg=await toDataURL('assets/logo.png'); doc.addImage(lg,'PNG',M,y,120,52); }catch(e){}
  doc.setFont('helvetica','bold'); doc.setFontSize(18); doc.setTextColor(...navy);
  doc.text(state.modo==='despues'?'COMPLETED JOB REPORT':'SITE VISIT REPORT', W-M, y+22, {align:'right'});
  doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(...slate);
  doc.text(`${new Date().toLocaleString('en-US')}   ·   ${state.id}`, W-M, y+38, {align:'right'});
  y+=70; doc.setDrawColor(...navy); doc.setLineWidth(1.2); doc.line(M,y,W-M,y); y+=18;
  doc.setTextColor(20,30,45); doc.setFontSize(11);
  const info=[['Customer',c.nombre],['Phone',c.tel],['Address',`${c.dir}, ${c.ciudad}`],['State',stateOf(c.ciudad)],['Property',`${c.tipo} · ${c.pisos} story(ies)`],['Paint',c.pintura==='Cliente'?'Customer buys':'SRP buys'],['Areas',String(state.areas.length)]];
  info.forEach(([k,v])=>{ doc.setFont('helvetica','bold'); doc.text(k+':',M,y); doc.setFont('helvetica','normal'); doc.text(String(v||'—'),M+80,y); y+=16; });
  if(c.notas.trim()){ doc.setFont('helvetica','bold'); doc.text('Notes:',M,y); doc.setFont('helvetica','normal'); const t=doc.splitTextToSize(c.notas.trim(),W-2*M-80); doc.text(t,M+80,y); y+=t.length*14+2; }
  y+=8;
  const need=h=>{ if(y+h>H-M){ doc.addPage(); y=M; } };
  state.areas.forEach((a,i)=>{
    need(60);
    doc.setFillColor(...navy); doc.rect(M,y,W-2*M,22,'F'); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(12);
    doc.text(`${i+1}. ${a.nombre}`, M+8, y+15); y+=34;
    doc.setTextColor(20,30,45); doc.setFont('helvetica','normal'); doc.setFontSize(10.5);
    areaLines(a).forEach(l=>{ const t=doc.splitTextToSize(l,W-2*M); need(t.length*13); doc.text(t,M,y); y+=t.length*13+3; });
    y+=4;
    const cols=3, gap=8, cw=(W-2*M-gap*(cols-1))/cols, ch=cw*0.75;
    const grid=list=>list.forEach((f,j)=>{
      const col=j%cols; if(col===0){ need(ch+gap); }
      const x=M+col*(cw+gap); const u=photos.get(f.id);
      if(u){ try{ const p=doc.getImageProperties(u); const s=Math.min(cw/p.width,ch/p.height); const iw=p.width*s, ih=p.height*s;
        doc.setFillColor(243,245,248); doc.rect(x,y,cw,ch,'F'); doc.addImage(u,'JPEG',x+(cw-iw)/2,y+(ch-ih)/2,iw,ih);
        const lbl=f.tipo==='despues'?'AFTER':(f.ex?'DETAIL':'BEFORE');
        doc.setFillColor(...(f.tipo==='despues'?[47,125,79]:(f.ex?[200,134,42]:navy))); doc.rect(x,y,58,14,'F'); doc.setTextColor(255,255,255); doc.setFontSize(8); doc.setFont('helvetica','bold');
        doc.text(lbl,x+5,y+10); doc.setTextColor(20,30,45); doc.setFont('helvetica','normal'); }catch(e){} }
      if(col===cols-1 || j===list.length-1) y+=ch+gap;
    });
    grid(a.fotos.filter(f=>!f.ex));
    (a.extras||[]).forEach((x,k)=>{
      need(a.fotos.some(f=>f.ex===x.id)? 60+ch : 40);
      doc.setFillColor(253,244,230); doc.rect(M,y-2,W-2*M,20,'F');
      doc.setFont('helvetica','bold'); doc.setFontSize(10.5); doc.setTextColor(140,85,15);
      doc.text(`EXTRA WORK ${k+1}: ${x.tipo} · ${x.tam}`, M+6, y+12); y+=26;
      doc.setTextColor(20,30,45); doc.setFont('helvetica','normal');
      if(x.nota&&x.nota.trim()){ const t=doc.splitTextToSize(x.nota.trim(),W-2*M); need(t.length*13); doc.text(t,M,y); y+=t.length*13+4; }
      grid(a.fotos.filter(f=>f.ex===x.id));
    });
    y+=10;
  });
  const n=doc.getNumberOfPages();
  for(let p=1;p<=n;p++){ doc.setPage(p); doc.setFontSize(8.5); doc.setTextColor(...slate); doc.text(`Sarasota Residential Painting · Visit ${state.id} · Page ${p} of ${n}`, W/2, H-20, {align:'center'}); }
  return doc.output('blob');
}
function toDataURL(src){ return fetch(src).then(r=>r.blob()).then(b=>new Promise(r=>{const f=new FileReader(); f.onload=()=>r(f.result); f.readAsDataURL(b);})); }

function jsonExport(){
  return JSON.stringify({formato:'srp-visita-1', ...state, areas: state.areas.map(a=>({...a, fotos:a.fotos.map(f=>({...f}))}))}, null, 2);
}
function summaryText(){
  const c=state.cliente;
  return `${state.modo==='despues'?'COMPLETED JOB':'ESTIMATE VISIT'} — ${c.nombre||'(no name)'}\n${c.dir}, ${c.ciudad}\n${state.areas.length} area(s): ${state.areas.map(a=>a.nombre).join(', ')}`;
}

$('#sendBtn').onclick=async()=>{
  if(!state.areas.length){ toast('Add at least one area'); return; }
  if(!window.jspdf){ toast('No connection: could not create the PDF'); return; }
  $('#busyTxt').textContent='Preparing report…'; $('#busy').hidden=false;
  try{
    const pdf=await buildPDF(); const base=fileBase();
    const fPdf=new File([pdf],base+'.pdf',{type:'application/pdf'});
    const fJson=new File([jsonExport()],base+'.json',{type:'application/json'});
    $('#busy').hidden=true;
    const data={files:[fPdf,fJson], title:base, text:summaryText()};
    if(navigator.canShare && navigator.canShare(data)){
      try{ await navigator.share(data); toast('Report sent'); return; }catch(e){ if(e.name==='AbortError') return; }
    }
    if(navigator.canShare && navigator.canShare({files:[fPdf]})){
      try{ await navigator.share({files:[fPdf], title:base}); toast('Report sent'); return; }catch(e){ if(e.name==='AbortError') return; }
    }
    download(fPdf); setTimeout(()=>download(fJson),400); toast('Report downloaded. Send it to the office by WhatsApp or email.');
  }catch(err){ $('#busy').hidden=true; console.error(err); toast('Error creating the report'); }
};
function download(f){ const a=document.createElement('a'); a.href=URL.createObjectURL(f); a.download=f.name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},2000); }

$('#newBtn').onclick=e=>{
  const b=e.currentTarget;
  if(!db){
    if(!b.dataset.sure){ b.dataset.sure='1'; b.textContent='Tap again to erase everything'; setTimeout(()=>{b.dataset.sure='';b.textContent='Start new visit';},3000); return; }
    b.dataset.sure=''; b.textContent='Start new visit';
  }
  (async()=>{ await saveNow(); state=blank(); photos.clear(); renderClient(); renderAreas(); await saveNow(); go('visit'); toast(db?'New visit — the last one is saved':'New visit'); })();
};

// ---------- Views, header, nav ----------
function go(v){
  document.querySelectorAll('.view').forEach(x=>x.classList.toggle('on',x.dataset.view===v));
  document.querySelectorAll('.bnav [data-go]').forEach(x=>x.classList.toggle('on',x.dataset.go===v));
  window.scrollTo(0,0);
}
document.addEventListener('click',e=>{ const b=e.target.closest('[data-go]'); if(b) go(b.dataset.go); });
$('#navAdd').onclick=()=>{ $('#picker').hidden=false; };
function updHdr(){
  const c=state.cliente, done=state.modo==='despues';
  $('#hdrCity').textContent=c.ciudad==='Other'?'Other city':`${c.ciudad}, ${stateOf(c.ciudad)==='Colorado'?'CO':'FL'}`;
  $('#hdrCust').textContent=c.nombre.trim()||'New customer';
  $('#hdrMode').textContent=done?'COMPLETED':'ESTIMATE';
  $('#bnTag').textContent=done?'Job completed':'Estimate';
  $('#bnTitle').textContent=done?'Take AFTER photos of every area':'Take BEFORE photos of every area';
}
$('#cats').addEventListener('click',e=>{ const b=e.target.closest('button[data-f]'); if(!b) return;
  $('#cats').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); $('#areas').dataset.filter=b.dataset.f; });
$('#pickTabs').addEventListener('click',e=>{ const b=e.target.closest('button[data-p]'); if(!b) return;
  $('#pickTabs').querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
  $('#gridIn').hidden=b.dataset.p!=='in'; $('#gridOut').hidden=b.dataset.p!=='out'; });
$('#startBtn').onclick=()=>{ $('#splash').hidden=true; };

$('#visitsBtn').onclick=openVisits; $('#splashVisits').onclick=openVisits;
$('#vClose').onclick=()=>{ $('#visits').hidden=true; };
$('#visits').addEventListener('click',e=>{ if(e.target.id==='visits') $('#visits').hidden=true; });

// ---------- Inicio ----------
renderClient(); renderAreas();
(async()=>{
  db=await openDB();
  if(db){
    try{ navigator.storage && navigator.storage.persist && navigator.storage.persist(); }catch(e){}
    let cur=null; try{ cur=await tx('meta','readonly',s=>s.get('current')); }catch(e){}
    if(cur){ try{ await loadVisit(cur); }catch(e){} }
    const n=(await listVisits()).length; $('#splashVisits').hidden=!n; $('#splashVisits').textContent=`Saved visits (${n})`;
  } else { $('#saveNote').hidden=false; }
})();
if('serviceWorker' in navigator && location.protocol==='https:' && !/perplexity|pplx/.test(location.hostname)){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
})();
