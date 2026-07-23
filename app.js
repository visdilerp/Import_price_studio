/* ============================================================
   Visdil Ventures Private Limited — Import Cost Studio
   Frontend: vanilla JS · Backend: Supabase · Hosting: Netlify
   ============================================================ */

const COMPANY = 'Visdil Ventures Private Limited';

/* ---------------- Supabase ---------------- */
const CFG = window.APP_CONFIG || {};
const cfgOk = (CFG.SUPABASE_URL||'').startsWith('https');
let sb = null, me = null, myProfile = null;
if (cfgOk) sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

/* ---------------- Calculator state ---------------- */
const S = { country:'china', mode:'single', inc:'FOB', repName:'', date:new Date().toISOString().slice(0,10),
            bls:1, fxUsd:100, fxGbp:130, dutyPct:9, gstPct:18, occManual:0, products:[] };
const R = { frCN:10, frUK:35, occFlat:200, occ36:80, occ612:75, occ12p:70,
            lcl:500, doBl:1500, cfsLo:2000, cfsHi:1800, docs:1500, cha:4500,
            t5:5000, t8:8000, t10:12000, t16:15000, t16p:20000 };
const R_DEFAULTS = {...R};
let pid = 0;
let currentCalc = null;      // DB row currently being edited
let allCalcs = [];           // cache for list tab

const newProduct = () => ({ id:++pid, name:'', price:0, qty:1, cbm:0, duty:'', muType:'pct', muVal:0, dsType:'pct', dsVal:0 });
S.products.push(newProduct());

/* ---------------- Helpers ---------------- */
const $ = id => document.getElementById(id);
const isCN = () => S.country==='china';
const cur  = () => isCN() ? 'USD' : 'GBP';
const sym  = () => isCN() ? '$' : '£';
const ofx  = () => isCN() ? S.fxUsd : S.fxGbp;
const f0 = n => Math.round(isFinite(n)?n:0).toLocaleString('en-IN');
const f2 = n => (isFinite(n)?n:0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const inr = n => '₹' + f0(n);
const esc = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2600); }

function occCalc(cbm){
  if(cbm<=0) return 0;
  if(cbm<=3) return R.occFlat;
  if(cbm<=6) return R.occ36*cbm;
  if(cbm<=12) return R.occ612*cbm;
  return R.occ12p*cbm;
}
function occLabel(cbm){
  if(isCN()) return 'Manual input (China EXW)';
  if(cbm<=0) return '—';
  if(cbm<=3) return 'Flat '+f2(R.occFlat)+' GBP (≤ 3 CBM slab)';
  if(cbm<=6) return f2(R.occ36)+' GBP × '+f2(cbm)+' CBM (3.1–6 slab)';
  if(cbm<=12) return f2(R.occ612)+' GBP × '+f2(cbm)+' CBM (6.1–12 slab)';
  return f2(R.occ12p)+' GBP × '+f2(cbm)+' CBM (> 12 slab)';
}
function transCalc(cbm){
  if(cbm<=0) return 0;
  if(cbm<=5) return R.t5; if(cbm<=8) return R.t8;
  if(cbm<=10) return R.t10; if(cbm<=16) return R.t16;
  return R.t16p;
}
function transLabel(cbm){
  if(cbm<=0) return '—';
  if(cbm<=5) return '≤ 5 CBM slab'; if(cbm<=8) return '≤ 8 CBM slab';
  if(cbm<=10) return '≤ 10 CBM slab'; if(cbm<=16) return '≤ 16 CBM slab';
  return '> 16 CBM slab';
}

/* ---------------- Core computation ---------------- */
function compute(){
  const prods = S.products;
  const totCbm = prods.reduce((a,p)=>a+(+p.cbm||0),0);
  const exw = S.inc==='EXW';
  const frRate = isCN() ? R.frCN : R.frUK;
  const frOrig = frRate*totCbm, frInr = frOrig*ofx();
  const occOrig = exw ? (isCN() ? S.occManual : occCalc(totCbm)) : 0;
  const occInr  = occOrig*ofx();

  const d = { lcl:R.lcl*totCbm, doC:R.doBl*S.bls, cfsRate: totCbm<10?R.cfsLo:R.cfsHi };
  d.cfs = d.cfsRate*totCbm; d.docs = R.docs*S.bls; d.cha = R.cha*S.bls; d.trans = transCalc(totCbm);
  d.total = d.lcl+d.doC+d.cfs+d.docs+d.cha+d.trans;

  const rows = prods.map(p=>{
    const cbm=+p.cbm||0, qty=+p.qty||1;
    const share = totCbm>0 ? cbm/totCbm : (prods.length===1?1:0);
    const valCur = (+p.price||0)*qty;
    const valInr = valCur*ofx();
    const frS = frInr*share, occS = occInr*share, destS = d.total*share;
    const av = valInr + frS + (exw?occS:0);
    const dpct = p.duty!=='' && p.duty!=null && !isNaN(+p.duty) ? +p.duty : S.dutyPct;
    const duty = av*dpct/100;
    const gstBase = av+duty, gst = gstBase*S.gstPct/100;
    const dutyPayable = duty+gst;
    const landed = valInr + frS + (exw?occS:0) + duty + destS;
    const unitLanded = qty>0 ? landed/qty : landed;
    const mu = p.muType==='pct' ? landed*(+p.muVal||0)/100 : (+p.muVal||0);
    const offer1 = landed+mu, prof1 = offer1-landed, prof1Pct = landed>0?prof1/landed*100:0;
    const ds = p.dsType==='pct' ? offer1*(+p.dsVal||0)/100 : (+p.dsVal||0);
    const offer2 = offer1-ds, prof2 = offer2-landed, prof2Pct = landed>0?prof2/landed*100:0;
    return {p,cbm,qty,share,valCur,valInr,frS,occS,destS,av,dpct,duty,gstBase,gst,dutyPayable,
            landed,unitLanded,mu,offer1,prof1,prof1Pct,ds,offer2,prof2,prof2Pct};
  });
  const T = k => rows.reduce((a,r)=>a+r[k],0);
  return { rows, totCbm, exw, frRate, frOrig, frInr, occOrig, occInr, d,
    tot:{ valCur:T('valCur'), valInr:T('valInr'), av:T('av'), duty:T('duty'), gstBase:T('gstBase'), gst:T('gst'),
          dutyPayable:T('dutyPayable'), landed:T('landed'), offer1:T('offer1'), prof1:T('prof1'),
          offer2:T('offer2'), prof2:T('prof2') } };
}

/* ---------------- Controls ---------------- */
function setCountry(c, keepInc){
  S.country=c;
  if(!keepInc) S.inc = c==='china' ? 'FOB' : 'EXW';
  $('tabCN').classList.toggle('on',c==='china');
  $('tabUK').classList.toggle('on',c==='uk');
  $('curHint').textContent = 'Prices in '+cur();
  syncInc(); renderProducts(); calc();
}
function setInc(i){ S.inc=i; syncInc(); calc(); }
function syncInc(){
  $('incFOB').classList.toggle('on',S.inc==='FOB');
  $('incEXW').classList.toggle('on',S.inc==='EXW');
  $('occManualWrap').style.display = (isCN()&&S.inc==='EXW')?'':'none';
  $('headSub').textContent = 'Import Cost Studio · '+(isCN()?'China':'United Kingdom')+' · '+S.inc+' · '+cur()+' → India (INR)';
}
function setMode(m, silent){
  if(m==='single' && S.products.length>1){
    if(!silent && !confirm('Single product mode keeps only the first product. Continue?')) return;
    S.products = [S.products[0]];
  }
  S.mode=m;
  $('modeS').classList.toggle('on',m==='single');
  $('modeM').classList.toggle('on',m==='multi');
  $('addBtn').style.display = m==='multi'?'':'none';
  renderProducts(); calc();
}

/* ---------------- Products ---------------- */
function addProduct(){ S.products.push(newProduct()); renderProducts(); calc(); }
function delProduct(id){
  if(S.products.length<=1) return;
  S.products = S.products.filter(p=>p.id!==id);
  renderProducts(); calc();
}
function up(id,key,val){ const p=S.products.find(x=>x.id===id); if(p){ p[key]=val; calc(); } }
function renderProducts(){
  $('prodList').innerHTML = S.products.map((p,i)=>`
    <div class="prod">
      <div class="prod-top">
        <span class="pchip">PRODUCT ${i+1}</span>
        ${S.mode==='multi'&&S.products.length>1?`<button onclick="delProduct(${p.id})">Remove</button>`:''}
      </div>
      <div class="grid">
        <div class="fld" style="grid-column:span 2"><label>Product name *</label>
          <input class="name-in" value="${esc(p.name)}" oninput="up(${p.id},'name',this.value)"></div>
        <div class="fld"><label>Unit price (${cur()})</label>
          <input type="number" value="${p.price||''}" step="0.01" min="0" oninput="up(${p.id},'price',+this.value||0)"></div>
        <div class="fld"><label>Quantity</label>
          <input type="number" value="${p.qty}" step="1" min="1" oninput="up(${p.id},'qty',+this.value||1)"></div>
        <div class="fld"><label>CBM (this product)</label>
          <input type="number" value="${p.cbm||''}" step="0.01" min="0" oninput="up(${p.id},'cbm',+this.value||0)"></div>
        <div class="fld"><label>Duty % override</label>
          <input type="number" value="${p.duty}" step="0.1" placeholder="default ${S.dutyPct}%" oninput="up(${p.id},'duty',this.value)"></div>
        <div class="fld"><label>Markup type</label>
          <select onchange="up(${p.id},'muType',this.value)">
            <option value="pct" ${p.muType==='pct'?'selected':''}>% of landed cost</option>
            <option value="amt" ${p.muType==='amt'?'selected':''}>Bulk value (INR)</option>
          </select></div>
        <div class="fld"><label>Markup value</label>
          <input type="number" value="${p.muVal||''}" step="0.01" min="0" oninput="up(${p.id},'muVal',+this.value||0)"></div>
        <div class="fld"><label>Discount type</label>
          <select onchange="up(${p.id},'dsType',this.value)">
            <option value="pct" ${p.dsType==='pct'?'selected':''}>% of Offer 1</option>
            <option value="amt" ${p.dsType==='amt'?'selected':''}>Bulk value (INR)</option>
          </select></div>
        <div class="fld"><label>Discount value</label>
          <input type="number" value="${p.dsVal||''}" step="0.01" min="0" oninput="up(${p.id},'dsVal',+this.value||0)"></div>
      </div>
    </div>`).join('');
}

/* ---------------- Results ---------------- */
function calc(){
  const C = compute(), exw = C.exw, s = sym();
  const nm = (r,i)=> r.p.name || 'Product '+(i+1);

  $('kpis').innerHTML = `
    <div class="kpi hero"><div class="kl">Total landed cost</div><div class="kv">${inr(C.tot.landed)}</div><div class="ks">GST excluded · ${C.totCbm?f2(C.totCbm):'0'} CBM</div></div>
    <div class="kpi"><div class="kl">Duty payable</div><div class="kv">${inr(C.tot.dutyPayable)}</div><div class="ks">Duty ${inr(C.tot.duty)} + IGST ${inr(C.tot.gst)}</div></div>
    <div class="kpi"><div class="kl">Offer 1</div><div class="kv">${inr(C.tot.offer1)}</div><div class="ks">Profit ${inr(C.tot.prof1)}</div></div>
    <div class="kpi"><div class="kl">Final offer</div><div class="kv">${inr(C.tot.offer2)}</div><div class="ks">Profit ${inr(C.tot.prof2)} (${f2(C.tot.landed>0?C.tot.prof2/C.tot.landed*100:0)}%)</div></div>`;

  const prodRows = C.rows.map((r,i)=>`
    <tr><td>${esc(nm(r,i))}</td><td class="num">${r.qty}</td><td class="num">${s}${f2(+r.p.price||0)}</td>
      <td class="num">${s}${f2(r.valCur)}</td><td class="num">${f2(r.cbm)}</td>
      <td class="num">${(r.share*100).toFixed(1)}%</td><td class="num">${inr(r.valInr)}</td></tr>`).join('');
  const dutyRows = C.rows.map((r,i)=>`
    <tr><td>${esc(nm(r,i))}</td><td class="num">${inr(r.av)}</td><td class="num">${f2(r.dpct)}%</td>
      <td class="num">${inr(r.duty)}</td><td class="num">${inr(r.gstBase)}</td>
      <td class="num">${inr(r.gst)}</td><td class="num">${inr(r.dutyPayable)}</td></tr>`).join('');
  const landRows = C.rows.map((r,i)=>`
    <tr><td>${esc(nm(r,i))}</td><td class="num">${inr(r.valInr)}</td><td class="num">${inr(r.frS)}</td>
      ${exw?`<td class="num">${inr(r.occS)}</td>`:''}
      <td class="num">${inr(r.duty)}</td><td class="num">${inr(r.destS)}</td>
      <td class="num"><b>${inr(r.landed)}</b></td><td class="num">${inr(r.unitLanded)}</td></tr>`).join('');
  const offRows = C.rows.map((r,i)=>`
    <tr><td>${esc(nm(r,i))}</td><td class="num">${inr(r.landed)}</td>
      <td class="num">${inr(r.mu)}</td><td class="num"><b>${inr(r.offer1)}</b></td>
      <td class="num ${r.prof1>=0?'pos':'neg'}">${inr(r.prof1)} (${f2(r.prof1Pct)}%)</td>
      <td class="num">${inr(r.ds)}</td><td class="num"><b>${inr(r.offer2)}</b></td>
      <td class="num ${r.prof2>=0?'pos':'neg'}">${inr(r.prof2)} (${f2(r.prof2Pct)}%)</td></tr>`).join('');

  $('results').innerHTML = `
  <div class="sec"><div class="sec-head"><span class="dot"></span><h2>Consignment summary</h2></div>
    <div class="sec-body tbl-scroll"><table class="rt">
      <tr><th>Product</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Value (${cur()})</th><th class="num">CBM</th><th class="num">Share</th><th class="num">Value (INR)</th></tr>
      ${prodRows}
      <tr class="tot"><td>Total</td><td></td><td></td><td class="num">${s}${f2(C.tot.valCur)}</td><td class="num">${f2(C.totCbm)}</td><td class="num">100%</td><td class="num">${inr(C.tot.valInr)}</td></tr>
    </table></div></div>

  <div class="sec"><div class="sec-head"><span class="dot"></span><h2>Origin charges</h2><span class="hint">${exw?'EXW — freight + origin charges':'FOB — freight only'}</span></div>
    <div class="sec-body tbl-scroll"><table class="rt">
      <tr><th>Charge</th><th>Basis</th><th class="num">${cur()}</th><th class="num">INR</th></tr>
      <tr><td>Freight charges</td><td>${f2(C.frRate)} ${cur()} × ${f2(C.totCbm)} CBM</td><td class="num">${s}${f2(C.frOrig)}</td><td class="num">${inr(C.frInr)}</td></tr>
      ${exw?`<tr><td>Origin clearance charges</td><td>${occLabel(C.totCbm)}</td><td class="num">${s}${f2(C.occOrig)}</td><td class="num">${inr(C.occInr)}</td></tr>`:''}
      <tr class="tot"><td>Total origin charges</td><td></td><td class="num">${s}${f2(C.frOrig+C.occOrig)}</td><td class="num">${inr(C.frInr+C.occInr)}</td></tr>
    </table></div></div>

  <div class="sec"><div class="sec-head"><span class="dot"></span><h2>Assessment value &amp; duty</h2><span class="hint">AV = ${exw?'EXW + Freight + Origin charges':'FOB + Freight'}</span></div>
    <div class="sec-body tbl-scroll"><table class="rt">
      <tr><th>Product</th><th class="num">Assessment value</th><th class="num">Duty %</th><th class="num">Duty</th><th class="num">AV + Duty</th><th class="num">IGST ${f2(S.gstPct)}%</th><th class="num">Duty payable</th></tr>
      ${dutyRows}
      <tr class="tot"><td>Total</td><td class="num">${inr(C.tot.av)}</td><td></td><td class="num">${inr(C.tot.duty)}</td><td class="num">${inr(C.tot.gstBase)}</td><td class="num">${inr(C.tot.gst)}</td><td class="num">${inr(C.tot.dutyPayable)}</td></tr>
    </table>
    <div class="note">Duty payable = Basic duty + IGST. IGST is shown separately and is <b>not</b> included in the landed cost.</div></div></div>

  <div class="sec"><div class="sec-head"><span class="dot"></span><h2>Destination clearance charges</h2></div>
    <div class="sec-body tbl-scroll"><table class="rt">
      <tr><th>Charge</th><th>Basis</th><th class="num">INR</th></tr>
      <tr><td>LCL charges</td><td>${f0(R.lcl)} × ${f2(C.totCbm)} CBM</td><td class="num">${inr(C.d.lcl)}</td></tr>
      <tr><td>DO charges</td><td>${f0(R.doBl)} × ${S.bls} BL</td><td class="num">${inr(C.d.doC)}</td></tr>
      <tr><td>CFS charges</td><td>${f0(C.d.cfsRate)} × ${f2(C.totCbm)} CBM (${C.totCbm<10?'&lt; 10 CBM rate':'≥ 10 CBM rate'})</td><td class="num">${inr(C.d.cfs)}</td></tr>
      <tr><td>Docs charges</td><td>${f0(R.docs)} × ${S.bls} BL</td><td class="num">${inr(C.d.docs)}</td></tr>
      <tr><td>CHA charges</td><td>${f0(R.cha)} × ${S.bls} BL</td><td class="num">${inr(C.d.cha)}</td></tr>
      <tr><td>Transport charges</td><td>${transLabel(C.totCbm)}</td><td class="num">${inr(C.d.trans)}</td></tr>
      <tr class="tot"><td>Total destination charges</td><td></td><td class="num">${inr(C.d.total)}</td></tr>
    </table></div></div>

  <div class="sec"><div class="sec-head"><span class="dot"></span><h2>Product landed cost</h2><span class="hint">${exw?'EXW + Origin charges + Freight + Duty + Destination':'FOB + Freight + Duty + Destination'} · GST excluded</span></div>
    <div class="sec-body tbl-scroll"><table class="rt">
      <tr><th>Product</th><th class="num">Goods value</th><th class="num">Freight</th>${exw?'<th class="num">Origin chg.</th>':''}<th class="num">Duty</th><th class="num">Dest.</th><th class="num">Landed cost</th><th class="num">Per unit</th></tr>
      ${landRows}
      <tr class="tot"><td>Total</td><td class="num">${inr(C.tot.valInr)}</td><td class="num">${inr(C.frInr)}</td>${exw?`<td class="num">${inr(C.occInr)}</td>`:''}<td class="num">${inr(C.tot.duty)}</td><td class="num">${inr(C.d.total)}</td><td class="num">${inr(C.tot.landed)}</td><td></td></tr>
    </table>
    <div class="pill">TOTAL LANDED COST &nbsp; ${inr(C.tot.landed)}</div></div></div>

  <div class="sec"><div class="sec-head"><span class="dot"></span><h2>Offer &amp; discount</h2><span class="hint">Profit vs landed cost</span></div>
    <div class="sec-body tbl-scroll"><table class="rt">
      <tr><th>Product</th><th class="num">Landed</th><th class="num">Markup</th><th class="num">Offer 1</th><th class="num">Profit @ O1</th><th class="num">Discount</th><th class="num">Final offer</th><th class="num">Profit @ Final</th></tr>
      ${offRows}
      <tr class="tot"><td>Total</td><td class="num">${inr(C.tot.landed)}</td><td></td><td class="num">${inr(C.tot.offer1)}</td>
        <td class="num ${C.tot.prof1>=0?'pos':'neg'}">${inr(C.tot.prof1)} (${f2(C.tot.landed>0?C.tot.prof1/C.tot.landed*100:0)}%)</td><td></td>
        <td class="num">${inr(C.tot.offer2)}</td>
        <td class="num ${C.tot.prof2>=0?'pos':'neg'}">${inr(C.tot.prof2)} (${f2(C.tot.landed>0?C.tot.prof2/C.tot.landed*100:0)}%)</td></tr>
    </table></div></div>`;

  $('barSum').innerHTML = 'Landed <b>'+inr(C.tot.landed)+'</b> &nbsp;·&nbsp; Final offer <b>'+inr(C.tot.offer2)+'</b>';
}

/* ============================================================
   AUTH
   ============================================================ */
async function doLogin(){
  if(!cfgOk){ return; }
  const email = $('loginEmail').value.trim(), pass = $('loginPass').value;
  $('authErr').style.display='none';
  $('loginBtn').disabled = true; $('loginBtn').textContent = 'Signing in…';
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  $('loginBtn').disabled = false; $('loginBtn').textContent = 'Sign in';
  if(error){ $('authErr').textContent = error.message; $('authErr').style.display=''; }
}
async function doLogout(){ await sb.auth.signOut(); }

async function enterApp(session){
  me = session.user;
  const { data } = await sb.from('profiles').select('*').eq('id', me.id).single();
  myProfile = data || { id: me.id, email: me.email, full_name:'', role:'user' };
  $('userName').textContent = myProfile.full_name || myProfile.email;
  $('roleBadge').style.display = myProfile.role==='admin' ? '' : 'none';
  $('navUsers').style.display  = myProfile.role==='admin' ? '' : 'none';
  $('authView').style.display='none'; $('appView').style.display='';
  showTab('calc');
}
function showAuth(){
  me = null; myProfile = null; currentCalc = null;
  $('appView').style.display='none'; $('authView').style.display='';
  if(!cfgOk) $('cfgNotice').style.display='';
}

/* ============================================================
   TABS
   ============================================================ */
function showTab(t){
  ['calc','list','users'].forEach(x=>{
    $('tab-'+x).style.display = x===t ? '' : 'none';
    const nav = $('nav'+x.charAt(0).toUpperCase()+x.slice(1));
    if(nav) nav.classList.toggle('on', x===t);
  });
  $('calcBar').style.display = t==='calc' ? '' : 'none';
  if(t==='list') loadList();
  if(t==='users') loadUsers();
}

/* ============================================================
   SAVE / LOAD / LIST
   ============================================================ */
function snapshotData(){ return JSON.parse(JSON.stringify({ S, R })); }

function updateEditingChip(){
  $('editingChip').innerHTML = currentCalc
    ? '✎ Editing saved report: <b>'+esc(currentCalc.report_name)+'</b>'
    : '✦ New calculation (not saved yet)';
}

async function saveCalc(){
  if(!S.repName.trim()){ toast('Enter a Report / Consignment name first'); $('repName').focus(); return; }
  if(S.products.some(p=>!p.name.trim())){ toast('Every product needs a name before saving'); return; }
  const C = compute();
  const payload = {
    report_name: S.repName.trim(), country: S.country, incoterm: S.inc, mode: S.mode,
    total_landed: Math.round(C.tot.landed), final_offer: Math.round(C.tot.offer2),
    data: snapshotData(), updated_at: new Date().toISOString()
  };
  try{
    if(currentCalc){
      const changes = diffData(currentCalc.data, payload.data);
      const { data, error } = await sb.from('calculations').update(payload).eq('id', currentCalc.id).select().single();
      if(error) throw error;
      currentCalc = data;
      await sb.from('edit_logs').insert({ calculation_id: currentCalc.id, editor: me.id,
        editor_email: myProfile.email, action:'updated', changes: changes.length?changes:['Saved (no field changes detected)'] });
      toast('Report updated · change logged');
    } else {
      const { data, error } = await sb.from('calculations').insert({ ...payload, owner: me.id }).select().single();
      if(error) throw error;
      currentCalc = data;
      await sb.from('edit_logs').insert({ calculation_id: currentCalc.id, editor: me.id,
        editor_email: myProfile.email, action:'created', changes:['Report created'] });
      toast('Report saved');
    }
    updateEditingChip();
  }catch(e){ console.error(e); toast('Save failed: '+e.message); }
}

function newCalc(){
  currentCalc = null;
  Object.assign(R, R_DEFAULTS);
  Object.assign(S, { country:'china', mode:'single', inc:'FOB', repName:'', date:new Date().toISOString().slice(0,10),
    bls:1, fxUsd:100, fxGbp:130, dutyPct:9, gstPct:18, occManual:0 });
  pid=0; S.products = [newProduct()];
  hydrateInputs();
  setCountry('china'); setMode('single', true);
  updateEditingChip();
  showTab('calc'); window.scrollTo({top:0});
}

function hydrateInputs(){
  $('repName').value=S.repName; $('repDate').value=S.date; $('bls').value=S.bls;
  $('fxUsd').value=S.fxUsd; $('fxGbp').value=S.fxGbp; $('dutyPct').value=S.dutyPct;
  $('gstPct').value=S.gstPct; $('occManual').value=S.occManual;
  const m={rFrCN:'frCN',rFrUK:'frUK',rOccFlat:'occFlat',rOcc36:'occ36',rOcc612:'occ612',rOcc12p:'occ12p',
    rLcl:'lcl',rDoBl:'doBl',rCfsLo:'cfsLo',rCfsHi:'cfsHi',rDocs:'docs',rCha:'cha',
    rT5:'t5',rT8:'t8',rT10:'t10',rT16:'t16',rT16p:'t16p'};
  for(const id in m) $(id).value = R[m[id]];
}

function loadCalc(row){
  currentCalc = row;
  const d = row.data;
  Object.assign(R, R_DEFAULTS, d.R||{});
  Object.assign(S, { country:'china', inc:'FOB', mode:'single', occManual:0 }, d.S||{}, { products: [] });
  pid=0; S.products = (d.S?.products||[]).map(p=>({ ...newProduct(), ...p, id:++pid }));
  if(!S.products.length) S.products=[newProduct()];
  hydrateInputs();
  setCountry(S.country, true);
  setMode(S.mode, true);
  updateEditingChip();
  showTab('calc'); window.scrollTo({top:0});
}

/* ---- field-level diff for edit log ---- */
function diffData(oldD, newD){
  const out = [];
  const so=oldD.S||{}, sn=newD.S||{}, ro=oldD.R||{}, rn=newD.R||{};
  const fields = [['repName','Report name'],['country','Country'],['inc','Incoterm'],['mode','Mode'],['date','Date'],
    ['bls','No. of BLs'],['fxUsd','USD-INR rate'],['fxGbp','GBP-INR rate'],['dutyPct','Duty %'],['gstPct','GST %'],['occManual','China EXW origin charges']];
  fields.forEach(([k,l])=>{ if(String(so[k])!==String(sn[k])) out.push(l+': '+so[k]+' → '+sn[k]); });
  const rlabels = {frCN:'China freight/CBM',frUK:'UK freight/CBM',occFlat:'OCC flat ≤3',occ36:'OCC 3.1-6',occ612:'OCC 6.1-12',occ12p:'OCC >12',
    lcl:'LCL/CBM',doBl:'DO/BL',cfsLo:'CFS <10',cfsHi:'CFS ≥10',docs:'Docs/BL',cha:'CHA/BL',t5:'Transport ≤5',t8:'Transport ≤8',t10:'Transport ≤10',t16:'Transport ≤16',t16p:'Transport >16'};
  for(const k in rlabels){ if(String(ro[k])!==String(rn[k])) out.push(rlabels[k]+': '+ro[k]+' → '+rn[k]); }
  const po=so.products||[], pn=sn.products||[];
  const pf=[['name','name'],['price','unit price'],['qty','qty'],['cbm','CBM'],['duty','duty % override'],
    ['muType','markup type'],['muVal','markup value'],['dsType','discount type'],['dsVal','discount value']];
  const n = Math.max(po.length, pn.length);
  for(let i=0;i<n;i++){
    const a=po[i], b=pn[i];
    const tag = 'Product '+(i+1)+((b?.name||a?.name)?' ('+(b?.name||a?.name)+')':'');
    if(a&&!b){ out.push(tag+': removed'); continue; }
    if(!a&&b){ out.push(tag+': added'); continue; }
    pf.forEach(([k,l])=>{ if(String(a[k]??'')!==String(b[k]??'')) out.push(tag+' '+l+': '+(a[k]===''?'—':a[k])+' → '+(b[k]===''?'—':b[k])); });
  }
  return out;
}

/* ---- list tab ---- */
async function loadList(){
  const sel = myProfile.role==='admin' ? '*, profiles:owner ( email, full_name )' : '*';
  const { data, error } = await sb.from('calculations').select(sel).order('report_name', { ascending:true });
  if(error){ toast('Could not load list: '+error.message); return; }
  allCalcs = data||[];
  renderList();
}
function renderList(){
  const q = ($('searchBox').value||'').toLowerCase();
  const rows = allCalcs.filter(c=>c.report_name.toLowerCase().includes(q));
  const admin = myProfile.role==='admin';
  $('listEmpty').style.display = rows.length ? 'none' : '';
  $('listTable').innerHTML = !rows.length ? '' : `
    <tr><th>Report name</th>${admin?'<th>Owner</th>':''}<th>Route</th><th class="num">Landed cost</th><th class="num">Final offer</th><th>Updated</th><th>Actions</th></tr>
    ${rows.map(c=>`
      <tr>
        <td><b>${esc(c.report_name)}</b></td>
        ${admin?`<td>${esc(c.profiles?.full_name || c.profiles?.email || '—')}</td>`:''}
        <td>${c.country==='china'?'🇨🇳 China':'🇬🇧 UK'} · ${c.incoterm}</td>
        <td class="num">${inr(c.total_landed)}</td>
        <td class="num">${inr(c.final_offer)}</td>
        <td>${new Date(c.updated_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</td>
        <td><div class="row-actions">
          <button onclick='loadCalc(${JSON.stringify(c).replace(/'/g,"&#39;")})'>Open / Edit</button>
          <button onclick="viewRevisions('${c.id}','${esc(c.report_name)}')">Revisions</button>
          <button onclick="viewLog('${c.id}','${esc(c.report_name)}')">Edit log</button>
          <button class="danger" onclick="deleteCalc('${c.id}')">Delete</button>
        </div></td>
      </tr>`).join('')}`;
}
async function deleteCalc(id){
  if(!confirm('Delete this report and its full history? This cannot be undone.')) return;
  const { error } = await sb.from('calculations').delete().eq('id', id);
  if(error){ toast('Delete failed: '+error.message); return; }
  if(currentCalc && currentCalc.id===id) newCalc();
  toast('Report deleted');
  loadList();
}

/* ============================================================
   REVISIONS  (Offer 1 -> Offer 2 -> ...)
   ============================================================ */
async function recordRevision(){
  if(!currentCalc){ toast('Save the report first, then record a revision'); return; }
  const note = prompt('Note for this revision (e.g. "Offer 2 — after customer negotiation"):','');
  if(note===null) return;
  const C = compute();
  const snapshot = {
    products: C.rows.map((r,i)=>({ name: r.p.name||('Product '+(i+1)),
      landed: Math.round(r.landed), markup: Math.round(r.mu), offer1: Math.round(r.offer1),
      discount: Math.round(r.ds), final_offer: Math.round(r.offer2),
      profit: Math.round(r.prof2), profit_pct: +r.prof2Pct.toFixed(2) })),
    totals: { landed: Math.round(C.tot.landed), offer1: Math.round(C.tot.offer1),
      final_offer: Math.round(C.tot.offer2), profit: Math.round(C.tot.prof2) }
  };
  const { count } = await sb.from('revisions').select('*',{count:'exact',head:true}).eq('calculation_id', currentCalc.id);
  const { error } = await sb.from('revisions').insert({ calculation_id: currentCalc.id, rev_no:(count||0)+1,
    note, snapshot, created_by: me.id, created_by_email: myProfile.email });
  if(error){ toast('Could not record revision: '+error.message); return; }
  toast('Revision '+((count||0)+1)+' recorded');
}
async function viewRevisions(calcId, name){
  const { data, error } = await sb.from('revisions').select('*').eq('calculation_id', calcId).order('rev_no',{ascending:false});
  if(error){ toast(error.message); return; }
  openModal('Price revisions — '+name, !data.length
    ? '<p class="note">No revisions recorded yet. Open the report, adjust markup/discount, then press "Record revision" in the bottom bar of the calculator.</p>'
    : data.map(r=>`
      <div class="rev-card">
        <div class="rev-top"><span class="rev-no">Revision ${r.rev_no}</span>
          <span class="rev-meta">${new Date(r.created_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})} · ${esc(r.created_by_email||'')}</span>
          ${r.note?`<span class="rev-meta">· ${esc(r.note)}</span>`:''}</div>
        <div class="tbl-scroll"><table class="rt">
          <tr><th>Product</th><th class="num">Landed</th><th class="num">Markup</th><th class="num">Offer 1</th><th class="num">Discount</th><th class="num">Final offer</th><th class="num">Profit</th></tr>
          ${r.snapshot.products.map(p=>`<tr><td>${esc(p.name)}</td><td class="num">${inr(p.landed)}</td><td class="num">${inr(p.markup)}</td>
            <td class="num">${inr(p.offer1)}</td><td class="num">${inr(p.discount)}</td><td class="num"><b>${inr(p.final_offer)}</b></td>
            <td class="num ${p.profit>=0?'pos':'neg'}">${inr(p.profit)} (${f2(p.profit_pct)}%)</td></tr>`).join('')}
          <tr class="tot"><td>Total</td><td class="num">${inr(r.snapshot.totals.landed)}</td><td></td>
            <td class="num">${inr(r.snapshot.totals.offer1)}</td><td></td><td class="num">${inr(r.snapshot.totals.final_offer)}</td>
            <td class="num">${inr(r.snapshot.totals.profit)}</td></tr>
        </table></div>
      </div>`).join(''));
}

/* ============================================================
   EDIT LOG
   ============================================================ */
async function viewLog(calcId, name){
  const { data, error } = await sb.from('edit_logs').select('*').eq('calculation_id', calcId).order('created_at',{ascending:false});
  if(error){ toast(error.message); return; }
  openModal('Edit log — '+name, !data.length ? '<p class="note">No log entries.</p>'
    : data.map(l=>`
      <div class="log-item">
        <div class="lg-top"><b>${l.action.toUpperCase()}</b> · ${new Date(l.created_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})} · ${esc(l.editor_email||'')}</div>
        <ul>${(l.changes||[]).map(c=>'<li>'+esc(c)+'</li>').join('')}</ul>
      </div>`).join(''));
}

/* ============================================================
   USERS (admin)
   ============================================================ */
async function loadUsers(){
  const { data, error } = await sb.from('profiles').select('*').order('created_at');
  if(error){ toast(error.message); return; }
  $('usersTable').innerHTML = `
    <tr><th>Name</th><th>Email</th><th>Role</th><th>Created</th></tr>
    ${(data||[]).map(u=>`<tr><td>${esc(u.full_name)||'—'}</td><td>${esc(u.email)}</td>
      <td>${u.role==='admin'?'<span class="badge">ADMIN</span>':'User'}</td>
      <td>${new Date(u.created_at).toLocaleDateString('en-IN')}</td></tr>`).join('')}`;
}
async function createUser(){
  const name=$('nuName').value.trim(), email=$('nuEmail').value.trim(), pass=$('nuPass').value, role=$('nuRole').value;
  const msg=$('nuMsg');
  if(!email || pass.length<6){ msg.textContent='Enter a valid email and a password of at least 6 characters.'; return; }
  msg.textContent='Creating…';
  // Use a separate client so the admin's own session is untouched
  const temp = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY,
    { auth: { persistSession:false, autoRefreshToken:false } });
  const { error } = await temp.auth.signUp({ email, password: pass, options:{ data:{ full_name:name } } });
  if(error){ msg.textContent='Failed: '+error.message; return; }
  if(role==='admin'){
    await new Promise(r=>setTimeout(r,800));   // wait for profile trigger
    const { error: e2 } = await sb.from('profiles').update({ role:'admin' }).eq('email', email);
    if(e2){ msg.textContent='User created, but promoting to admin failed: '+e2.message; loadUsers(); return; }
  }
  msg.textContent='✓ User created. They can sign in immediately with the email and password you set.';
  $('nuName').value=$('nuEmail').value=$('nuPass').value='';
  loadUsers();
}

/* ============================================================
   MODAL
   ============================================================ */
function openModal(title, html){ $('modalTitle').textContent=title; $('modalBody').innerHTML=html; $('modalBack').style.display=''; }
function closeModal(){ $('modalBack').style.display='none'; }

/* ============================================================
   PDF  — professional serif report, company-branded
   ============================================================ */
function makePDF(){
  if(S.products.some(p=>!p.name.trim())){ alert('Please enter a product name for every product before generating the PDF.'); return; }
  const C = compute(), exw = C.exw;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'mm',format:'a4'});
  const W = doc.internal.pageSize.getWidth(), M=14;
  const INK=[23,27,46], SOFT=[107,113,148], ACC=[79,70,229], ACCBG=[238,240,255], LINE=[228,231,242];
  const pName = (r,i)=> r.p.name || 'Product '+(i+1);
  const px = v => String(v).replace(/\u2192/g,'\u00BB').replace(/\u2264/g,'<=').replace(/\u2265/g,'>=')
                  .replace(/[\u2014\u2013]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"')
                  .replace(/\u00D7/g,'x').replace(/\u20B9/g,'INR ');
  let y;

  /* ---- header ---- */
  doc.setFillColor(14,19,48); doc.rect(0,0,W,38,'F');
  doc.setFillColor(...ACC); doc.rect(0,38,W,1.6,'F');
  doc.setTextColor(255); doc.setFont('times','bold'); doc.setFontSize(17);
  doc.text(COMPANY, M, 15);
  doc.setFont('times','italic'); doc.setFontSize(10.5); doc.setTextColor(190,196,236);
  doc.text('Import Landed Cost Report', M, 22.5);
  doc.setFont('times','normal'); doc.setFontSize(9); doc.setTextColor(165,172,214);
  doc.text(px((isCN()?'China':'United Kingdom')+'  ·  '+S.inc+'  ·  '+cur()+'  »  India (INR)'), M, 29);
  doc.text(px('Report:  '+(S.repName||'-')), M, 34.5);
  doc.setTextColor(255); doc.setFontSize(9.5);
  doc.text('Date:  '+S.date, W-M, 15, {align:'right'});
  doc.setTextColor(165,172,214); doc.setFontSize(9);
  doc.text('BLs:  '+S.bls, W-M, 22.5, {align:'right'});
  doc.text(px((isCN()?('USD-INR '+f2(S.fxUsd)+'     '):'')+'GBP-INR '+f2(S.fxGbp)), W-M, 29, {align:'right'});
  if(myProfile) doc.text(px('Prepared by:  '+(myProfile.full_name||myProfile.email||'')), W-M, 34.5, {align:'right'});

  /* ---- KPI cards ---- */
  y = 45;
  const kpis = [
    ['TOTAL LANDED COST', f0(C.tot.landed), true],
    ['DUTY PAYABLE', f0(C.tot.dutyPayable), false],
    ['OFFER 1', f0(C.tot.offer1), false],
    ['FINAL OFFER', f0(C.tot.offer2), false]
  ];
  const kw = (W-2*M-3*4)/4;
  kpis.forEach((k,i)=>{
    const x = M + i*(kw+4);
    if(k[2]){ doc.setFillColor(...ACC); doc.roundedRect(x,y,kw,17,2.5,2.5,'F'); }
    else { doc.setFillColor(...ACCBG); doc.setDrawColor(...LINE); doc.roundedRect(x,y,kw,17,2.5,2.5,'FD'); }
    doc.setFont('times','bold'); doc.setFontSize(6.6);
    doc.setTextColor(...(k[2]?[216,219,255]:SOFT));
    doc.text(k[0], x+4, y+6);
    doc.setFontSize(12);
    doc.setTextColor(...(k[2]?[255,255,255]:INK));
    doc.text('INR '+k[1], x+4, y+13);
  });
  y += 25;

  const secHead = (n,title,sub)=>{
    if(y > 258){ doc.addPage(); y=18; }
    doc.setFillColor(...ACC); doc.roundedRect(M, y-3.8, 6.8, 6.8, 1.5, 1.5, 'F');
    doc.setTextColor(255); doc.setFont('times','bold'); doc.setFontSize(9);
    doc.text(String(n), M+3.4, y+1, {align:'center'});
    doc.setTextColor(...INK); doc.setFontSize(11.5);
    doc.text(px(title), M+10.5, y+0.6);
    if(sub){ doc.setFont('times','italic'); doc.setFontSize(8); doc.setTextColor(...SOFT); doc.text(px(sub), W-M, y+0.6, {align:'right'}); }
    y += 6;
  };

  /* one font, and header/body/footer of numeric columns all right-aligned */
  const tbl = (head, body, numCols, foot, fs)=>{
    doc.autoTable({ startY:y, margin:{left:M,right:M},
      head:[head.map(px)], body: body.map(r=>r.map(px)), foot: foot?[foot.map(px)]:undefined,
      theme:'plain',
      styles:{font:'times',fontSize:fs||8.5,textColor:INK,cellPadding:{top:2.1,bottom:2.1,left:2.4,right:2.4},
              lineColor:LINE,lineWidth:{bottom:0.15},overflow:'ellipsize'},
      headStyles:{fillColor:ACCBG,textColor:ACC,fontSize:(fs||8.5)-0.8,fontStyle:'bold'},
      footStyles:{textColor:INK,fontStyle:'bold',fillColor:[246,247,252],lineColor:ACC,lineWidth:{top:0.4}},
      alternateRowStyles:{fillColor:[251,251,254]},
      didParseCell: d => { if(numCols.includes(d.column.index)) d.cell.styles.halign='right'; }
    });
    y = doc.lastAutoTable.finalY + 8;
  };

  /* 1 Consignment */
  secHead(1,'Consignment Summary');
  tbl(['Product','Qty','Unit price ('+cur()+')','Value ('+cur()+')','CBM','Share','Value (INR)'],
    C.rows.map((r,i)=>[pName(r,i), String(r.qty), f2(+r.p.price||0), f2(r.valCur), f2(r.cbm), (r.share*100).toFixed(1)+'%', f0(r.valInr)]),
    [1,2,3,4,5,6],
    ['TOTAL','','',f2(C.tot.valCur),f2(C.totCbm),'100%',f0(C.tot.valInr)]);

  /* 2 Origin */
  secHead(2,'Origin Charges', exw?'EXW - freight + origin charges':'FOB - freight only');
  const orows = [['Freight charges', f2(C.frRate)+' '+cur()+' x '+f2(C.totCbm)+' CBM', f2(C.frOrig), f0(C.frInr)]];
  if(exw) orows.push(['Origin clearance charges', occLabel(C.totCbm), f2(C.occOrig), f0(C.occInr)]);
  tbl(['Charge','Basis',cur(),'INR'], orows, [2,3],
    ['TOTAL ORIGIN CHARGES','', f2(C.frOrig+C.occOrig), f0(C.frInr+C.occInr)]);

  /* 3 Duty */
  secHead(3,'Assessment Value & Duty', 'AV = '+(exw?'EXW + Freight + Origin charges':'FOB + Freight'));
  tbl(['Product','Assessment value','Duty %','Duty','AV + Duty','IGST '+f2(S.gstPct)+'%','Duty payable'],
    C.rows.map((r,i)=>[pName(r,i), f0(r.av), f2(r.dpct)+'%', f0(r.duty), f0(r.gstBase), f0(r.gst), f0(r.dutyPayable)]),
    [1,2,3,4,5,6],
    ['TOTAL', f0(C.tot.av),'', f0(C.tot.duty), f0(C.tot.gstBase), f0(C.tot.gst), f0(C.tot.dutyPayable)]);
  doc.setFont('times','italic'); doc.setFontSize(8); doc.setTextColor(...SOFT);
  doc.text('Duty payable = Basic duty + IGST. IGST is shown separately and is NOT included in the landed cost.', M, y-4);
  y += 6;

  /* 4 Destination */
  secHead(4,'Destination Clearance Charges');
  tbl(['Charge','Basis','INR'],
    [['LCL charges', f0(R.lcl)+' x '+f2(C.totCbm)+' CBM', f0(C.d.lcl)],
     ['DO charges', f0(R.doBl)+' x '+S.bls+' BL', f0(C.d.doC)],
     ['CFS charges', f0(C.d.cfsRate)+' x '+f2(C.totCbm)+' CBM ('+(C.totCbm<10?'< 10':'>= 10')+' CBM rate)', f0(C.d.cfs)],
     ['Docs charges', f0(R.docs)+' x '+S.bls+' BL', f0(C.d.docs)],
     ['CHA charges', f0(R.cha)+' x '+S.bls+' BL', f0(C.d.cha)],
     ['Transport charges', transLabel(C.totCbm), f0(C.d.trans)]],
    [2], ['TOTAL DESTINATION CHARGES','', f0(C.d.total)]);

  /* 5 Landed cost */
  secHead(5,'Product Landed Cost', (exw?'EXW + Origin chg + Freight + Duty + Destination':'FOB + Freight + Duty + Destination')+' - GST excluded');
  const lHead = exw ? ['Product','Goods value','Freight','Origin chg.','Duty','Destination','Landed cost','Per unit']
                    : ['Product','Goods value','Freight','Duty','Destination','Landed cost','Per unit'];
  const lBody = C.rows.map((r,i)=> exw
    ? [pName(r,i), f0(r.valInr), f0(r.frS), f0(r.occS), f0(r.duty), f0(r.destS), f0(r.landed), f0(r.unitLanded)]
    : [pName(r,i), f0(r.valInr), f0(r.frS), f0(r.duty), f0(r.destS), f0(r.landed), f0(r.unitLanded)]);
  const lFoot = exw
    ? ['TOTAL', f0(C.tot.valInr), f0(C.frInr), f0(C.occInr), f0(C.tot.duty), f0(C.d.total), f0(C.tot.landed),'']
    : ['TOTAL', f0(C.tot.valInr), f0(C.frInr), f0(C.tot.duty), f0(C.d.total), f0(C.tot.landed),''];
  tbl(lHead, lBody, lHead.map((_,i)=>i).slice(1), lFoot);

  if(y > 252){ doc.addPage(); y=18; }
  doc.setFillColor(...ACC); doc.roundedRect(M, y-4, 100, 10, 2.5, 2.5, 'F');
  doc.setTextColor(255); doc.setFont('times','bold'); doc.setFontSize(10.5);
  doc.text('TOTAL LANDED COST    INR '+f0(C.tot.landed), M+5, y+2.6);
  y += 15;

  /* 6 Offer */
  secHead(6,'Offer & Discount', 'Profit measured against landed cost');
  tbl(['Product','Landed','Markup','Offer 1','Profit @O1','%','Discount','Final offer','Profit @Final','%'],
    C.rows.map((r,i)=>[pName(r,i), f0(r.landed), f0(r.mu), f0(r.offer1), f0(r.prof1), f2(r.prof1Pct)+'%', f0(r.ds), f0(r.offer2), f0(r.prof2), f2(r.prof2Pct)+'%']),
    [1,2,3,4,5,6,7,8,9],
    ['TOTAL', f0(C.tot.landed),'', f0(C.tot.offer1), f0(C.tot.prof1), f2(C.tot.landed>0?C.tot.prof1/C.tot.landed*100:0)+'%','', f0(C.tot.offer2), f0(C.tot.prof2), f2(C.tot.landed>0?C.tot.prof2/C.tot.landed*100:0)+'%'],
    7.6);

  /* footer */
  const pages = doc.getNumberOfPages();
  for(let i=1;i<=pages;i++){
    doc.setPage(i);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(M,288,W-M,288);
    doc.setFont('times','normal'); doc.setFontSize(7.5); doc.setTextColor(150,155,180);
    doc.text(px(COMPANY+'  ·  '+(S.repName||'Report')+'  ·  '+S.date+'  ·  All amounts in INR unless stated. Verify rates before quoting.'), M, 292);
    doc.text('Page '+i+' / '+pages, W-M, 292, {align:'right'});
  }
  doc.save('Landed-Cost_'+(S.repName||'report').replace(/[^\w\-]+/g,'-')+'_'+S.date+'.pdf');
}

/* ============================================================
   INIT
   ============================================================ */
(function init(){
  // "Record revision" button lives in the calculator bottom bar
  const bar = $('calcBar');
  const revBtn = document.createElement('button');
  revBtn.className='ghost-btn'; revBtn.textContent='⟳ Record revision'; revBtn.onclick=recordRevision;
  bar.insertBefore(revBtn, bar.querySelector('.pdfbtn'));

  $('repDate').value = S.date;
  setCountry('china');
  updateEditingChip();

  if(!cfgOk){ showAuth(); return; }
  sb.auth.onAuthStateChange((_e, session)=>{ session ? enterApp(session) : showAuth(); });
  $('loginPass').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
})();
