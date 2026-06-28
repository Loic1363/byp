"use strict";
const VF_PASSWORD = "admin";
const VF_REQUIRE_LOGIN = true;
const Backend = {
  connectLogStream() {
    try {
      const es = new EventSource('/stream');
      this._replaying = true;
      setTimeout(() => { this._replaying = false; }, 2000);
      es.addEventListener('log', (e) => App.onLog(e.data));
      es.addEventListener('message_img', () => App.onMessageImg());
      es.onmessage = (e) => App.onLog(e.data);
      es.onerror = () => {};
      this._es = es;
    } catch (err) { console.warn('SSE indisponible', err); }
  },
  startStatusPolling() {
    const poll = () => fetch('/status', { cache:'no-store' })
      .then(r => r.json()).then(j => App.onStatus(j)).catch(() => App.onStatus(null));
    poll();
    this._statusInt = setInterval(poll, 2000);
  },
  async launch() {
    const body = await buildLaunchPayload();
    return fetch('/launch', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }).catch(()=>{});
  },
  stop()    { return fetch('/stop',      { method:'POST' }).catch(()=>{}); },
  skip()    { return fetch('/skip_wait', { method:'POST' }).catch(()=>{}); },
  monitors()    { return fetch('/monitors', { cache:'no-store' }).then(r=>r.json()).catch(()=>[]); },
  loadConfig()  { return fetch('/config',   { cache:'no-store' }).then(r=>r.json()).catch(()=>null); },
  saveConfig(c) { fetch('/config', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(c) }).catch(()=>{}); },
  screenshot(which) {
    return fetch('/screenshot', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ which }) }).catch(()=>{});
  },
  imageUrl(which) { return '/img/screenshot?which=' + encodeURIComponent(which) + '&_t=' + Date.now(); }
};

/* ============== CLASSIFICATION DES LOGS (ajuste au vocabulaire Python) ==== */
function classifyLog(text) {
  const t = (text||'').toLowerCase();
  if (/(erreur|error|échou|echou|fail|rejet|exception|invalide|✗|❌)/.test(t)) return 'error';
  if (/(succès|succes|success|validé|valide|réussi|reussi|soumis|ok\b|http 200|✓|✅)/.test(t)) return 'success';
  if (/(warn|timeout|attente|retry|tentative|attention|relance|⚠)/.test(t)) return 'warn';
  if (/(proxy|polling|rotation|\bsys\b|thread|lock|monitor)/.test(t)) return 'sys';
  return 'info';
}
function voteOutcome(text) {
  if (/vote.*✅/i.test(text||'')) return 'success';
  return null;
}
function captchaOutcome(text) {
  if (/Zone captcha.*✅/.test(text||'')) return 'solved';
  if (/Zone captcha.*❌/.test(text||'')) return 'failed';
  return null;
}

/* ===================== PERSISTANCE (localStorage) ======================== */
const Store = {
  get(k, fb) { try { const v = JSON.parse(localStorage.getItem(k)); return v==null?fb:v; } catch(e){ return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
};
function todayKey() { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function recordVote(outcome) {
  const votes = Store.get('vf_votes', {});
  const k = todayKey();
  votes[k] = votes[k] || { s:0, f:0 };
  if (outcome==='success') votes[k].s++; else votes[k].f++;
  Store.set('vf_votes', votes);
  const hrs = Store.get('vf_hours', { date:k, h:new Array(24).fill(0) });
  if (hrs.date!==k) { hrs.date=k; hrs.h=new Array(24).fill(0); }
  if (outcome==='success') hrs.h[new Date().getHours()]++;
  Store.set('vf_hours', hrs);
}

/* Construit le body envoyé à POST /launch : config complète, zones en %.
   Le backend convertit les % en pixels via les dimensions de /monitors. */
async function buildLaunchPayload() {
  const st = App.state;
  const urls   = Store.get('vf_urls',   st.urls);
  const delays = Store.get('vf_delays', st.delays);
  const serverCfg = await fetch('/config',{cache:'no-store'}).then(r=>r.json()).catch(()=>null);
  if (serverCfg) App._applyServerConfig(serverCfg);
  const zones  = App.state.defaultZones || App.state.zones;
  const mons   = await fetch('/monitors',{cache:'no-store'}).then(r=>r.json()).catch(()=>[]);
  const mon    = (mons && mons[0]) || { width:1920, height:1080, index:0 };
  const W = mon.width, H = mon.height;
  const z   = id => zones.find(zn=>zn.id===id) || { x:50, y:50, w:10, h:10 };
  const pt  = id => { const zn=z(id); return { x:Math.round(zn.x/100*W), y:Math.round(zn.y/100*H) }; };
  const reg = id => { const zn=z(id); return { x:Math.round(zn.x/100*W), y:Math.round(zn.y/100*H), w:Math.round((zn.w||10)/100*W), h:Math.round((zn.h||10)/100*H) }; };
  return {
    url: urls.url2 || '', url_pre: urls.url1 || '',
    point_pre: pt('preetape'), delay_pre: delays.url1,
    region_pre_timer: reg('timer1'), region_decompte: reg('decompte'),
    point_try: pt('try'), point_exten: pt('ext'),
    region_check1: reg('captcha'), point_validate: pt('valider'), region_check2: reg('resultat'),
    delay: delays.url2, delay_click: delays.try, delay_exten: delays.ext,
    delay_final_ok: delays.result, delay_retry: Math.round(delays.wait * 60), delay_error: Math.round(delays.error * 60),
    monitor: mon.index || 0
  };
}

/* ============================ CONSTANTES ================================= */
const COLORS = {
  och:'#9F7420', ochDk:'#876019', brand:'#8A6519', amber:'#D6A845', click:'#A1421F',
  cream:'#FAF7F0', chip:'#F1ECDF', ltOch:'#E7DCC2', empty:'#efece4',
  txt:'#211c12', mid:'#4a4434', mut:'#7d7464', mut2:'#9a9078', faint:'#bdb39a', faint2:'#a99a76',
  bd:'#e2dcce', bdSoft:'#f3efe5',
};
const LOGCLR = { info:'#9ba3b4', success:'#3fb950', warn:'#d29922', error:'#f85149', sys:'#d6a45a' };
const LOGTAG = { info:'INFO', success:'OK', warn:'WARN', error:'ERR', sys:'SYS' };
const STATUS_META = {
  running:{ label:'En cours', color:'#067647', dot:'#10b981' },
  waiting:{ label:'En attente', color:'#9a7b1e', dot:'#D6A845' },
  idle:   { label:'Arrêté', color:'#9a9078', dot:'#c1b59a' },
};
const ZONES_DEFAULT = [
  { id:'decompte', name:'Zone décompte global', type:'zone',  page:'url1', x:5,  y:6,  w:24, h:13 },
  { id:'preetape', name:'Clic pré-étape',       type:'click', page:'url1', x:40, y:22 },
  { id:'timer1',   name:'Zone Timer URL 1',     type:'zone',  page:'url1', x:60, y:7,  w:22, h:13 },
  { id:'try',      name:'Clic try',             type:'click', page:'url2', x:24, y:30 },
  { id:'ext',      name:'Clic extension',       type:'click', page:'url2', x:50, y:30 },
  { id:'captcha',  name:'Zone vérif captcha',   type:'zone',  page:'url2', x:30, y:42, w:38, h:28 },
  { id:'valider',  name:'Clic valider',         type:'click', page:'url2', x:45, y:82 },
  { id:'resultat', name:'Zone résultat',        type:'zone',  page:'url2', x:55, y:74, w:32, h:18 },
];
const DELAY_DEFS = [
  { key:'url1', label:'Chargement URL 1', desc:'Attente après ouverture de la première page', min:0, max:20, step:0.5, unit:'s' },
  { key:'url2', label:'Chargement URL 2', desc:'Attente après ouverture de la page de vote', min:0, max:10, step:0.5, unit:'s' },
  { key:'try',  label:'Délai try', desc:'Pause avant chaque tentative de vote', min:0, max:10, step:0.5, unit:'s' },
  { key:'ext',  label:'Délai extension', desc:"Temps laissé à l'extension pour s'initialiser", min:0, max:10, step:0.5, unit:'s' },
  { key:'wait', label:'Attente du prochain vote', desc:'Intervalle entre deux votes consécutifs', min:0, max:150, step:1, unit:'min' },
  { key:'result', label:'Délai résultat', desc:'Attente de la confirmation du serveur', min:0, max:10, step:0.5, unit:'s' },
  { key:'error', label:'Délai error', desc:'Pause avant relance après une erreur', min:0, max:10, step:0.5, unit:'s' },
];

/* ============================ UTILITAIRES =============================== */
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function fmtN(n){ return (n==null?0:Math.round(n)).toLocaleString('fr-FR'); }
function pad2(n){ return String(n).padStart(2,'0'); }
function nowClock(){ const d=new Date(); return pad2(d.getHours())+':'+pad2(d.getMinutes())+':'+pad2(d.getSeconds()); }
function fmtTimer(sec){ sec=Math.floor(sec)||0; const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60; return h>0?(h+':'+pad2(m)+':'+pad2(s)):(pad2(m)+':'+pad2(s)); }
function fmtDelay(v, unit){ return unit==='min' ? (v+' min') : (Number.isInteger(v)? v+',0 s' : String(v).replace('.',',')+' s'); }

/* ============================================================================
   APP
   ========================================================================== */
const App = {
  state: {
    authed: !VF_REQUIRE_LOGIN,
    view: 'demarrage',
    range: 'semaine',
    chartStyle: 'bars',
    settingsTab: 'delais',
    configView: 'url1',
    selectedZone: 'decompte',
    zones: Store.get('vf_zones', ZONES_DEFAULT.map(z=>Object.assign({},z))),
    defaultZones: Store.get('vf_default_zones', null),
    delays: Store.get('vf_delays', { url1:5, url2:3, try:2, ext:2, wait:30, result:2, error:3 }),
    urls: Store.get('vf_urls', { url1:'', url2:'' }),
    captures: Store.get('vf_captures', { url1:null, url2:null }),
    logs: [],
    frozen:false, pinned:null, filter:'all',
    workerState:'idle', waitUntil:0, nowSec:Math.floor(Date.now()/1000),
    capCount:{ solved:0, failed:0 }, solveTimes:[],
    savedFlash:false,
    lastImg: null,
  },
  _id:0, _capT:{}, _zdrag:null,

  /* ---------- LIVE HOOKS ---------- */
  onLog(text) {
    const type = classifyLog(text);
    const log = { id:++this._id, t:nowClock(), type, msg:String(text) };
    this.state.logs.push(log);
    if (this.state.logs.length > 400) this.state.logs = this.state.logs.slice(-400);
    const vo = voteOutcome(text); if (vo && !Backend._replaying) recordVote(vo);
    const co = captchaOutcome(text);
    if (co==='solved') this.state.capCount.solved++;
    if (co==='failed') this.state.capCount.failed++;
    const m = (text||'').match(/(?:en|in)\s+([0-9]+(?:[.,][0-9]+)?)\s*s/i);
    if (m) { this.state.solveTimes.push(parseFloat(m[1].replace(',','.'))); if (this.state.solveTimes.length>50) this.state.solveTimes.shift(); }
    if (!this.state.frozen && this.state.view==='terminal') this.appendLogLine(log);
    if ((vo||co) && this.state.view==='dashboard') this.render();
  },
  onStatus(j) {
    if (!j) this.state.workerState='idle';
    else { this.state.workerState=(j.state==='running'||j.state==='waiting')?j.state:'idle'; this.state.waitUntil=j.wait_until||0; }
    this.paintStatusEverywhere();
  },
  onMessageImg() {
    const src='/img/message?_t='+Date.now();
    this.state.lastImg={ src, label:'zone OCR' };
    const img=document.getElementById('last-img');
    const lbl=document.getElementById('last-img-label');
    if (img) img.src=src;
    if (lbl) lbl.textContent='zone OCR';
  },

  /* ---------- ACTIONS ---------- */
  act(action, arg, el) {
    const st = this.state;
    switch (action) {
      case 'login': {
        const pwd = document.getElementById('vf-pwd');
        if (!VF_REQUIRE_LOGIN || VF_PASSWORD==='' || (pwd && pwd.value===VF_PASSWORD)) { st.authed=true; this.render(); }
        else { if (pwd) pwd.style.borderColor='#cf6679'; const e=document.getElementById('vf-pwd-err'); if (e) e.style.display='block'; }
        break;
      }
      case 'lock': st.authed=false; this.render(); break;
      case 'nav': st.view=arg; this.render(); break;
      case 'range': st.range=arg; this.render(); break;
      case 'chartStyle': st.chartStyle=el.value; this.render(); break;
      case 'filter': st.filter=arg; this.render(); break;
      case 'toggleFreeze': st.frozen=!st.frozen; st.pinned = st.frozen ? st.logs.slice() : null; this.render(); break;
      case 'exportLogs': this.exportLogs(); break;
      case 'settingsTab': st.settingsTab=arg; this.render(); break;
      case 'resetDelais': st.delays={ url1:5,url2:3,try:2,ext:2,wait:30,result:2,error:3 }; Store.set('vf_delays',st.delays); this._syncConfig(); this.render(); break;
      case 'configView': st.configView=arg; this.render(); break;
      case 'selectZone': st.selectedZone=arg; this.renderConfigEditor(); break;
      case 'resetZones': { const src=st.defaultZones||ZONES_DEFAULT; st.zones=src.map(z=>Object.assign({},z)); Store.set('vf_zones',st.zones); this._syncConfig(); this.render(); break; }
      case 'saveDefault': {
        const snap=st.zones.map(z=>Object.assign({},z));
        st.defaultZones=snap; Store.set('vf_default_zones',snap); Store.set('vf_zones',snap);
        this._syncConfig(); st.savedFlash=true; this.render();
        clearTimeout(this._flashT); this._flashT=setTimeout(()=>{ st.savedFlash=false; this.render(); }, 1600);
        break;
      }
      case 'start': this.state.workerState='running'; this.paintStatusEverywhere(); Backend.launch().finally(()=>{ this.state.workerState='idle'; this.paintStatusEverywhere(); }); break;
      case 'stop': this.state.workerState='idle'; this.paintStatusEverywhere(); Backend.stop(); break;
      case 'skip': Backend.skip(); break;
      case 'capture': this.startCapture(arg); break;
    }
  },

  startCapture(which) {
    if (this._capT[which]) return;
    this.state.captures[which]=5; this.render();
    this._capT[which]=setInterval(()=>{
      const v=this.state.captures[which];
      if (typeof v==='number' && v>1) { this.state.captures[which]=v-1; this.render(); return; }
      clearInterval(this._capT[which]); this._capT[which]=null;
      Backend.screenshot(which).finally(()=>{
        this.state.captures[which]='done';
        Store.set('vf_captures',this.state.captures);
        this.state.lastImg={ src: Backend.imageUrl(which), label: 'live capture · '+which.toUpperCase() };
        this.render();
      });
    }, 1000);
  },
  exportLogs() {
    const txt=this.state.logs.map(l=>l.t+' ['+l.type.toUpperCase()+'] '+l.msg).join('\n');
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([txt],{type:'text/plain'}));
    a.download='vote-logs.txt'; document.body.appendChild(a); a.click(); a.remove();
  },

  onInput(kind, key, el) {
    const st=this.state;
    if (kind==='url') { st.urls[key]=el.value; Store.set('vf_urls',st.urls); this._syncConfig(); }
    if (kind==='delay') {
      const v=parseFloat(el.value); st.delays[key]=v; Store.set('vf_delays',st.delays);
      const def=DELAY_DEFS.find(d=>d.key===key);
      const lab=document.getElementById('delay-val-'+key); if (lab) lab.textContent=fmtDelay(v,def.unit);
      const p=((v-def.min)/(def.max-def.min)*100).toFixed(1);
      el.style.background='linear-gradient(90deg,'+COLORS.och+' 0%,'+COLORS.och+' '+p+'%,'+COLORS.ltOch+' '+p+'%,'+COLORS.ltOch+' 100%)';
      const avgEl=document.getElementById('avg-val');
      if (avgEl) { const dd=st.delays; avgEl.textContent=((dd.url1||0)+(dd.url2||0)+(dd.try||0)+(dd.ext||0)+(dd.result||0)).toFixed(1)+'s'; }
      this._syncConfig();
    }
  },

  /* ---------- DRAG ZONES ---------- */
  zonePointerDown(id, mode, e) {
    e.preventDefault(); e.stopPropagation();
    this._zdrag={ id, mode }; this.state.selectedZone=id;
    window.addEventListener('pointermove', this._zmove);
    window.addEventListener('pointerup', this._zup);
    this.renderConfigEditor();
  },
  _zmove:null, _zup:null,
  zonePointerMove(e) {
    if (!this._zdrag) return;
    const box=document.getElementById('zone-box'); if (!box) return;
    const frame=document.getElementById('zone-img-frame');
    const r=(frame&&frame.offsetWidth>0?frame:box).getBoundingClientRect();
    const px=clamp((e.clientX-r.left)/r.width*100,0,100);
    const py=clamp((e.clientY-r.top)/r.height*100,0,100);
    const { id, mode }=this._zdrag;
    let nz;
    this.state.zones=this.state.zones.map(z=>{
      if (z.id!==id) return z;
      if (mode==='resize') nz=Object.assign({},z,{ w:clamp(px-z.x,3,100-z.x), h:clamp(py-z.y,3,100-z.y) });
      else if (z.type==='zone') nz=Object.assign({},z,{ x:clamp(px-z.w/2,0,100-z.w), y:clamp(py-z.h/2,0,100-z.h) });
      else nz=Object.assign({},z,{ x:px, y:py });
      return nz;
    });
    /* Update zone position directly in DOM — avoids recreating <img> which would flash black */
    if (nz) {
      const el=box.querySelector('[data-zone="'+id+'"][data-mode="move"]');
      if (el) {
        el.style.left=nz.x+'%'; el.style.top=nz.y+'%';
        if (nz.type==='zone') { el.style.width=(nz.w||10)+'%'; el.style.height=(nz.h||10)+'%'; }
      }
    }
  },
  zonePointerUp() {
    this._zdrag=null;
    window.removeEventListener('pointermove', this._zmove);
    window.removeEventListener('pointerup', this._zup);
    Store.set('vf_zones', this.state.zones);
    this._syncConfig();
    this.renderConfigEditor(); /* full re-render only on release */
  },

  /* ---------- CONFIG SYNC (server-side, shared across all origins) ---------- */
  _syncConfig() {
    Backend.saveConfig({ urls:this.state.urls, delays:this.state.delays, zones:this.state.zones, defaultZones:this.state.defaultZones });
  },
  _applyServerConfig(cfg) {
    if (!cfg || !Object.keys(cfg).length) return;
    if (cfg.urls)         { this.state.urls         = cfg.urls;         Store.set('vf_urls',          cfg.urls);         }
    if (cfg.delays)       { this.state.delays       = cfg.delays;       Store.set('vf_delays',        cfg.delays);       }
    if (cfg.zones)        { this.state.zones        = cfg.zones;        Store.set('vf_zones',         cfg.zones);        }
    if (cfg.defaultZones) { this.state.defaultZones = cfg.defaultZones; Store.set('vf_default_zones', cfg.defaultZones); }
    if (cfg._captures)    { this.state.captures     = cfg._captures;    Store.set('vf_captures',      cfg._captures);    }
  },

  /* ---------- BOOT ---------- */
  init() {
    this._zmove=(e)=>this.zonePointerMove(e);
    this._zup=()=>this.zonePointerUp();
    document.addEventListener('click',(e)=>{ const t=e.target.closest('[data-action]'); if (t) this.act(t.getAttribute('data-action'), t.getAttribute('data-arg'), t); });
    document.addEventListener('input',(e)=>{ const t=e.target.closest('[data-input]'); if (t) this.onInput(t.getAttribute('data-input'), t.getAttribute('data-key'), t); });
    document.addEventListener('change',(e)=>{ const t=e.target.closest('[data-change]'); if (t) this.act(t.getAttribute('data-change'), null, t); });
    document.addEventListener('pointerdown',(e)=>{ const t=e.target.closest('[data-zone]'); if (t) this.zonePointerDown(t.getAttribute('data-zone'), t.getAttribute('data-mode')||'move', e); });
    this.render();
    Backend.loadConfig().then(cfg => { this._applyServerConfig(cfg); if (cfg && Object.keys(cfg).length) this.render(); });
    setInterval(()=>{ this.state.nowSec=Math.floor(Date.now()/1000); this.paintTimer(); this.paintClock(); }, 1000);
    Backend.connectLogStream();
    Backend.startStatusPolling();
  },

  /* ---------- RENDER ---------- */
  render() {
    const st=this.state, root=document.getElementById('root');
    if (!st.authed) { root.innerHTML=viewLogin(); return; }
    root.innerHTML=''
      + '<div style="height:100vh;display:flex">'
      +   '<div style="flex:1;background:#fff;overflow:hidden;display:flex">'
      +     sidebar(st)
      +     '<div style="flex:1;min-width:0;display:flex;flex-direction:column;background:#fff">'+currentView(st)+'</div>'
      +   '</div>'
      + '</div>';
    if (st.view==='dashboard') this.paintChart();
    if (st.view==='terminal') this.scrollTermBottom();
    this.paintStatusEverywhere();
  },
  renderConfigEditor() { const h=document.getElementById('config-editor'); if (h) { h.innerHTML=configEditorInner(this.state); this.fitZoneOverlay(); } },
  fitZoneOverlay() {
    const img=document.getElementById('zone-bg-img');
    const frame=document.getElementById('zone-img-frame');
    if (!img||!frame) return;
    const box=img.parentElement; if (!box) return;
    const bw=box.clientWidth, bh=box.clientHeight;
    const iw=img.naturalWidth||bw, ih=img.naturalHeight||bh;
    if (!iw||!ih) return;
    const scale=Math.min(bw/iw,bh/ih);
    const rw=iw*scale, rh=ih*scale;
    frame.style.left=Math.round((bw-rw)/2)+'px';
    frame.style.top=Math.round((bh-rh)/2)+'px';
    frame.style.width=Math.round(rw)+'px';
    frame.style.height=Math.round(rh)+'px';
  },

  appendLogLine(log) {
    const term=document.getElementById('term-body'); if (!term) return;
    if (this.state.filter!=='all' && this.state.filter!==log.type) return;
    const caret=document.getElementById('term-caret');
    const div=document.createElement('div');
    div.style.cssText='display:flex;gap:11px;padding:2px 0;white-space:nowrap';
    div.innerHTML='<span style="color:#5a6371">'+log.t+'</span><span style="color:'+LOGCLR[log.type]+';font-weight:500;min-width:38px">'+LOGTAG[log.type]+'</span><span style="color:#c9d1d9;overflow:hidden;text-overflow:ellipsis">'+esc(log.msg)+'</span>';
    term.insertBefore(div, caret);
    while (term.children.length>60) term.removeChild(term.firstChild);
    this.scrollTermBottom();
  },
  scrollTermBottom() { const t=document.getElementById('term-scroll'); if (t) t.scrollTop=t.scrollHeight; },

  paintStatusEverywhere() {
    const meta=STATUS_META[this.state.workerState]||STATUS_META.idle;
    document.querySelectorAll('[data-status-dot]').forEach(e=>{ e.style.background=meta.dot; });
    document.querySelectorAll('[data-status-label]').forEach(e=>{ e.textContent=meta.label; e.style.color=meta.color; });
    this.paintStartButtons(); this.paintTimer();
  },
  paintStartButtons() {
    const ws=this.state.workerState;
    const set=(id,on)=>{ const b=document.getElementById(id); if (!b) return; b.style.opacity=on?'1':'.45'; b.style.pointerEvents=on?'auto':'none'; };
    set('btn-start', ws==='idle');
    set('btn-stop',  ws!=='idle');
    set('btn-skip',  ws==='waiting'||ws==='running');
  },
  paintTimer() {
    const st=this.state;
    const remain=st.workerState==='idle'?0:Math.max(0, (st.waitUntil||0)-st.nowSec);
    const capped=Math.min(remain, 360*60);
    const display=st.workerState==='idle'?'--:--':fmtTimer(capped);
    const txt=document.getElementById('timer-text');
    if (txt) {
      txt.textContent=display;
      txt.style.fontSize=display.length<=5?'46px':display.length<=7?'34px':'26px';
    }
    const ring=document.getElementById('timer-ring-fg');
    if (ring) {
      const total=Math.max(1, Math.min(360, Math.max(1, st.delays.wait))*60);
      const pct=clamp(capped/total,0,1), C=2*Math.PI*130;
      ring.setAttribute('stroke-dashoffset',(C*(1-pct)).toFixed(1));
      ring.setAttribute('stroke', st.workerState==='running'?COLORS.och:(st.workerState==='waiting'?COLORS.amber:'#cbbfa3'));
    }
  },
  paintClock() { document.querySelectorAll('[data-clock]').forEach(e=>e.textContent=nowClock()); },

  paintChart() {
    const box=document.getElementById('chart-box'); if (!box) return;
    const W=Math.max(60,box.clientWidth), H=Math.max(60,box.clientHeight);
    const d=rangeData(this.state);
    box.innerHTML=buildChart(this.state.chartStyle, d.series, d.curIdx, W, H);
  },
};

/* ====================== DONNÉES DASHBOARD (depuis localStorage) ========= */
function rangeData(st) {
  const votes=Store.get('vf_votes', {});
  const hrs=Store.get('vf_hours', { date:todayKey(), h:new Array(24).fill(0) });
  const now=new Date();
  const dayTotal=(k)=>{ const v=votes[k]; return v?(v.s+v.f):0; };
  const dayKeyOffset=(off)=>{ const d=new Date(); d.setDate(d.getDate()-off); return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); };

  const todayCount = dayTotal(todayKey());
  let series, total, title, xlabels, curIdx, days, successSum=0;

  if (st.range==='jour') {
    series = (hrs.date===todayKey()? hrs.h : new Array(24).fill(0)).slice();
    total = series.reduce((a,b)=>a+b,0); successSum=total;
    title="Aujourd'hui · par heure"; xlabels=['00h','06h','12h','18h','23h']; curIdx=now.getHours(); days=1;
  } else if (st.range==='mois') {
    series=[]; let s=0,f=0;
    for (let i=29;i>=0;i--){ const k=dayKeyOffset(i); const v=votes[k]||{s:0,f:0}; series.push(v.s+v.f); s+=v.s; f+=v.f; }
    total=s+f; successSum=s; title="30 derniers jours"; xlabels=['-30j','-20j','-10j','auj.']; curIdx=series.length-1; days=30;
  } else if (st.range==='toujours') {
    const months={};
    Object.keys(votes).forEach(k=>{ const m=k.slice(0,7); months[m]=(months[m]||0)+votes[k].s+votes[k].f; });
    const Ms=['jan','fév','mar','avr','mai','jui','jul','aoû','sep','oct','nov','déc'];
    series=[]; let s=0,f=0;
    for (let i=11;i>=0;i--){ const d=new Date(); d.setMonth(d.getMonth()-i); const key=d.getFullYear()+'-'+pad2(d.getMonth()+1); series.push(months[key]||0); }
    Object.keys(votes).forEach(k=>{ s+=votes[k].s; f+=votes[k].f; });
    total=s+f; successSum=s; title="12 derniers mois"; const cm=now.getMonth(); xlabels=[]; for (let i=11;i>=0;i-=3) xlabels.push(Ms[(cm-i+12)%12]); curIdx=series.length-1; days=365;
  } else {
    const dl=['D','L','M','M','J','V','S']; series=[]; let s=0,f=0;
    for (let i=6;i>=0;i--){ const k=dayKeyOffset(i); const v=votes[k]||{s:0,f:0}; series.push(v.s+v.f); s+=v.s; f+=v.f; }
    total=s+f; successSum=s; title="7 derniers jours"; const td=now.getDay(); xlabels=[]; for (let i=6;i>=0;i--) xlabels.push(dl[(td-i+7)%7]); curIdx=series.length-1; days=7;
  }
  return { series, total, success:successSum, title, xlabels, curIdx, days, todayCount };
}

/* ====================== GRAPHES ========================================= */
function ptsOf(data, max, W, H, pad) {
  const n=data.length;
  return data.map((v,i)=>{ const x=pad+(W-2*pad)*(n===1?0.5:i/(n-1)); const y=H-pad-(H-2*pad)*(v/max); return [x,y]; });
}
function smoothPath(pts) {
  let d='M '+pts[0][0]+' '+pts[0][1];
  for (let i=0;i<pts.length-1;i++){ const [x0,y0]=pts[i],[x1,y1]=pts[i+1]; const cx=(x0+x1)/2; d+=' C '+cx+' '+y0+' '+cx+' '+y1+' '+x1+' '+y1; }
  return d;
}
function buildChart(style, series, curIdx, W, H) {
  if (!series.length) series=[0];
  const OCH=COLORS.och, LT=COLORS.ltOch, EMPTY=COLORS.empty, STEM='#D8C9A6';
  const dataMax=Math.max(1,...series);
  const max=dataMax*1.12;

  if (style==='bars'||style==='finebars'||style==='lollipop'||style==='cells'||style==='stacked') {
    let inner='';
    series.forEach((v,i)=>{
      const cur=i===curIdx, hPct=(v/max*100).toFixed(1)+'%';
      if (style==='bars') inner+='<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%"><div style="border-radius:3px 3px 0 0;min-height:3px;height:'+hPct+';background:'+(v===0?EMPTY:(cur?OCH:LT))+'"></div></div>';
      else if (style==='finebars') inner+='<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%"><div class="mono" style="font-size:10px;font-weight:600;color:'+(cur?OCH:COLORS.faint)+';margin-bottom:5px">'+v+'</div><div style="width:5px;border-radius:3px;min-height:3px;height:'+hPct+';background:'+(v===0?EMPTY:(cur?OCH:LT))+'"></div></div>';
      else if (style==='lollipop') inner+='<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%"><div style="width:2px;min-height:3px;height:'+hPct+';background:'+(cur?OCH:STEM)+'"></div><div style="width:11px;height:11px;border-radius:50%;background:'+(cur?OCH:LT)+';margin-top:-2px;box-shadow:0 0 0 3px '+(cur?'rgba(159,116,32,.18)':'rgba(216,201,166,.3)')+'"></div></div>';
      else if (style==='cells') { const t=v/dataMax, a=[241,236,223], b=[159,116,32], rgb=a.map((x,k)=>Math.round(x+(b[k]-x)*t)); inner+='<div style="flex:1;display:flex;align-items:center"><div style="width:100%;aspect-ratio:1;border-radius:9px;background:rgb('+rgb.join(',')+');display:flex;align-items:center;justify-content:center;font:600 13px IBM Plex Sans,sans-serif;color:'+(t>0.55?'#fff':COLORS.mut)+'">'+v+'</div></div>'; }
      else { const ok=Math.round(v*0.9), fail=v-ok; inner+='<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%"><div style="border-radius:3px 3px 0 0;min-height:'+(fail>0?2:0)+'px;height:'+(fail/max*100).toFixed(1)+'%;background:#e0a366"></div><div style="min-height:3px;height:'+(ok/max*100).toFixed(1)+'%;background:'+OCH+'"></div></div>'; }
    });
    const gap=style==='cells'?8:(style==='finebars'?14:6);
    return '<div style="display:flex;align-items:'+(style==='cells'?'center':'flex-end')+';gap:'+gap+'px;flex:1;min-height:0">'+inner+'</div>';
  }

  const pad=12, P=ptsOf(series,max,W,H,pad);
  const svg=(inner)=>'<div style="flex:1;min-height:0;position:relative"><svg viewBox="0 0 '+W+' '+H+'" width="100%" height="100%" style="position:absolute;inset:0">'+inner+'</svg></div>';
  if (style==='area') {
    const lp=smoothPath(P), ap=lp+' L '+P[P.length-1][0]+' '+(H-pad)+' L '+P[0][0]+' '+(H-pad)+' Z';
    return svg('<defs><linearGradient id="og" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#9F7420" stop-opacity="0.4"/><stop offset="100%" stop-color="#9F7420" stop-opacity="0.02"/></linearGradient></defs><path d="'+ap+'" fill="url(#og)"/><path d="'+lp+'" fill="none" stroke="#9F7420" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>');
  }
  if (style==='line') {
    const lp=smoothPath(P); let grid='';
    for (let g=0;g<=3;g++){ const y=pad+(H-2*pad)*g/3; grid+='<line x1="'+pad+'" y1="'+y+'" x2="'+(W-pad)+'" y2="'+y+'" stroke="#efece4" stroke-width="1"/>'; }
    const dots=P.map((p,i)=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+(i===curIdx?5:3.5)+'" fill="'+(i===curIdx?'#9F7420':'#fff')+'" stroke="#9F7420" stroke-width="2"/>').join('');
    return svg(grid+'<path d="'+lp+'" fill="none" stroke="#9F7420" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'+dots);
  }
  if (style==='step') {
    let sd='M '+P[0][0]+' '+P[0][1];
    for (let i=1;i<P.length;i++){ sd+=' L '+P[i][0]+' '+P[i-1][1]+' L '+P[i][0]+' '+P[i][1]; }
    const sa=sd+' L '+P[P.length-1][0]+' '+(H-pad)+' L '+P[0][0]+' '+(H-pad)+' Z';
    return svg('<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#9F7420" stop-opacity="0.32"/><stop offset="100%" stop-color="#9F7420" stop-opacity="0.02"/></linearGradient></defs><path d="'+sa+'" fill="url(#sg)"/><path d="'+sd+'" fill="none" stroke="#9F7420" stroke-width="2.5" stroke-linejoin="round"/>');
  }
  let run=0; const cum=series.map(v=>(run+=v)); const cmax=Math.max(1,run)*1.05;
  const CP=ptsOf(cum,cmax,W,H,pad), cumPath=smoothPath(CP);
  const cumDots=CP.map((p,i)=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="'+(i===curIdx?4.5:3)+'" fill="#9F7420"/>').join('');
  let bars=''; series.forEach(v=>{ bars+='<div style="flex:1;border-radius:3px 3px 0 0;min-height:3px;height:'+(v/max*100).toFixed(1)+'%;background:'+LT+'"></div>'; });
  return '<div style="flex:1;min-height:0;position:relative"><div style="position:absolute;inset:0;display:flex;align-items:flex-end;gap:6px">'+bars+'</div><svg viewBox="0 0 '+W+' '+H+'" width="100%" height="100%" style="position:absolute;inset:0"><path d="'+cumPath+'" fill="none" stroke="#9F7420" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'+cumDots+'</svg></div>';
}
function ringGoal(count, goal, tiers) {
  const R=46, C=2*Math.PI*R, pct=clamp(count/goal,0,1);
  let markers='';
  tiers.forEach(v=>{ const ang=(-90+360*(v/goal))*Math.PI/180; const x=60+R*Math.cos(ang), y=60+R*Math.sin(ang); const on=count>=v; markers+='<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="4.5" fill="'+(on?'#9F7420':'#fff')+'" stroke="'+(on?'#9F7420':'#D8C9A6')+'" stroke-width="2"/>'; });
  return '<svg viewBox="0 0 120 120" width="120" height="120"><circle cx="60" cy="60" r="'+R+'" fill="none" stroke="#F1ECDF" stroke-width="9"/><g transform="rotate(-90 60 60)"><circle cx="60" cy="60" r="'+R+'" fill="none" stroke="#9F7420" stroke-width="9" stroke-linecap="round" stroke-dasharray="'+C.toFixed(1)+'" stroke-dashoffset="'+(C*(1-pct)).toFixed(1)+'"/></g>'+markers+'</svg>';
}

/* ========================== VUES ======================================= */
function viewLogin() {
  return ''
  + '<div style="height:100vh;display:flex">'
  + '<div style="flex:1;background:#fff;overflow:hidden;display:flex">'
  +   '<div style="width:460px;background:'+COLORS.brand+';color:#f6efdf;padding:52px 48px;display:flex;flex-direction:column;justify-content:space-between">'
  +     '<div style="display:flex;align-items:center;gap:10px"><div style="width:30px;height:30px;border-radius:8px;background:#f6efdf;color:'+COLORS.brand+';display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px">V</div><span style="font-weight:600;font-size:18px;letter-spacing:-.01em">VoteFlow</span></div>'
  +     '<div><div style="font-size:30px;font-weight:700;line-height:1.15;letter-spacing:-.02em">Votre console<br>de vote, en local.</div><div style="font-size:14px;color:#e6d6b2;margin-top:14px;line-height:1.5;max-width:320px">Suivi en temps réel, terminal intégré et résolution de captchas — sur votre réseau, rien que pour vous.</div></div>'
  +     '<div class="mono" style="font-size:11px;color:#d8c08a">accès local · session</div>'
  +   '</div>'
  +   '<div style="flex:1;display:flex;align-items:center;justify-content:center;background:'+COLORS.cream+'">'
  +     '<div style="width:320px">'
  +       '<div style="font-size:22px;font-weight:700;color:'+COLORS.txt+'">Connexion</div>'
  +       '<div style="font-size:13px;color:'+COLORS.mut+';margin-top:5px;margin-bottom:26px">Entrez votre mot de passe pour déverrouiller la console.</div>'
  +       '<label style="font-size:12px;font-weight:600;color:'+COLORS.mid+';display:block;margin-bottom:7px">Mot de passe</label>'
  +       '<div style="display:flex;align-items:center;gap:8px;border:1px solid '+COLORS.bd+';border-radius:9px;padding:0 12px;background:#fff;height:44px"><span style="color:#b3a98f;font-size:14px">🔒</span><input id="vf-pwd" type="password" placeholder="••••••••" onkeydown="if(event.key===\'Enter\')App.act(\'login\')" style="border:none;outline:none;flex:1;font:400 14px IBM Plex Sans,sans-serif;color:'+COLORS.txt+';background:transparent"></div>'
  +       '<div id="vf-pwd-err" style="display:none;color:#cf6679;font-size:12px;margin-top:8px">Mot de passe incorrect</div>'
  +       '<button data-action="login" style="margin-top:20px;width:100%;height:46px;border:none;border-radius:9px;background:'+COLORS.och+';color:#fff;font:600 15px IBM Plex Sans,sans-serif;cursor:pointer;box-shadow:0 8px 20px -8px rgba(159,116,32,.7)">Déverrouiller →</button>'
  +       '<div class="mono" style="font-size:11px;color:'+COLORS.faint+';margin-top:22px;text-align:center">accès réservé · réseau local</div>'
  +     '</div>'
  +   '</div>'
  + '</div></div>';
}

const NAV=[{ key:'demarrage', label:'Démarrage', icon:'▷' },{ key:'dashboard', label:"Vue d'ensemble", icon:'▦' },{ key:'terminal', label:'Terminal', icon:'▤' },{ key:'settings', label:'Réglages', icon:'⚙' }];
function sidebar(st) {
  let items='';
  NAV.forEach(n=>{ const on=st.view===n.key; items+='<button data-action="nav" data-arg="'+n.key+'" style="display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:9px;border:none;cursor:pointer;text-align:left;width:100%;font:600 13px IBM Plex Sans,sans-serif;margin-bottom:4px;background:'+(on?'#fff':'transparent')+';color:'+(on?COLORS.ochDk:COLORS.mut)+';box-shadow:'+(on?'0 1px 2px rgba(60,48,20,.1)':'none')+'"><span style="font-size:14px">'+n.icon+'</span>'+n.label+'</button>'; });
  return ''
  + '<div style="width:212px;background:'+COLORS.cream+';border-right:1px solid rgba(60,48,20,.08);padding:20px 16px;display:flex;flex-direction:column;flex-shrink:0">'
  +   '<div style="display:flex;align-items:center;gap:9px;margin-bottom:26px;padding:0 4px"><div style="width:26px;height:26px;border-radius:7px;background:'+COLORS.och+';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px">V</div><span style="font-weight:600;font-size:16px;color:'+COLORS.txt+'">VoteFlow</span></div>'
  +   items
  +   '<div style="margin-top:auto">'
  +     '<button data-action="lock" style="width:100%;height:32px;border:1px solid '+COLORS.bd+';background:'+COLORS.cream+';border-radius:7px;font:600 12px IBM Plex Sans,sans-serif;color:'+COLORS.mut+';cursor:pointer">🔒 Verrouiller</button>'
  +   '</div>'
  + '</div>';
}
function currentView(st) {
  if (st.view==='demarrage') return viewDemarrage(st);
  if (st.view==='dashboard') return viewDashboard(st);
  if (st.view==='terminal')  return viewTerminal(st);
  if (st.view==='settings')  return viewSettings(st);
  return '';
}

function viewDemarrage(st) {
  const C=2*Math.PI*130;
  return ''
  + '<div style="flex:1;min-height:0;display:flex;flex-direction:column;padding:26px 30px">'
  +   '<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:8px"><div><div style="font-size:21px;font-weight:700;color:'+COLORS.txt+'">Démarrage</div><div style="font-size:13px;color:'+COLORS.mut2+';margin-top:3px">Pilotage du worker de vote</div></div><div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid rgba(60,48,20,.12);border-radius:999px;padding:7px 14px"><span data-status-dot style="width:8px;height:8px;border-radius:50%;background:#c1b59a;animation:livepulse 1.8s infinite"></span><span data-status-label style="font-size:13px;font-weight:600;color:'+COLORS.mut2+'">—</span></div></div>'
  +   '<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px">'
  +     '<div style="position:relative;width:290px;height:290px"><svg viewBox="0 0 290 290" width="290" height="290"><circle cx="145" cy="145" r="130" fill="none" stroke="#F1ECDF" stroke-width="12"/><g transform="rotate(-90 145 145)"><circle id="timer-ring-fg" cx="145" cy="145" r="130" fill="none" stroke="#cbbfa3" stroke-width="12" stroke-linecap="round" stroke-dasharray="'+C.toFixed(1)+'" stroke-dashoffset="'+C.toFixed(1)+'"/></g></svg><div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:visible"><div class="mono" style="font-size:11px;color:'+COLORS.mut2+';letter-spacing:.1em;text-transform:uppercase">Prochain vote</div><div id="timer-text" class="mono" style="font-weight:600;font-size:46px;color:'+COLORS.txt+';line-height:1.1;white-space:nowrap">--:--</div></div></div>'
  +     '<div style="display:flex;gap:12px">'
  +     btnStart('btn-start','start','<polygon points="6 4 20 12 6 20 6 4"/>','Start','#fff',COLORS.och,'#fff')
  +     btnStart('btn-freeze','toggleFreeze','<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',st.frozen?'Reprendre':'Freeze',st.frozen?COLORS.amber:'#fff',st.frozen?'#fff':COLORS.ochDk,COLORS.amber)
  +     btnStart('btn-skip','skip','<polygon points="5 4 15 12 5 20 5 4"/><rect x="17" y="4" width="3" height="16" rx="1"/>','Skip','#fff',COLORS.mid,COLORS.bd)
  +     btnStart('btn-stop','stop','<rect x="5" y="5" width="14" height="14" rx="2"/>','Stop','#fff',COLORS.click,'#e3b6a6')
  +     '</div>'
  +   '</div>'
  + '</div>';
}
function btnStart(id, action, svg, label, bg, fg, border) {
  return '<button id="'+id+'" data-action="'+action+'" style="display:flex;align-items:center;gap:8px;height:46px;padding:0 20px;border-radius:10px;border:1px solid '+border+';background:'+bg+';color:'+fg+';font:600 14px IBM Plex Sans,sans-serif;cursor:pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">'+svg+'</svg>'+label+'</button>';
}

function viewDashboard(st) {
  const d=rangeData(st);
  const total=d.total, success=Math.round(d.success), fail=total-success;
  const rate=total?(success/total*100).toFixed(1):'0.0';
  const cap=st.capCount, capTot=cap.solved+cap.failed, capRate=capTot?(cap.solved/capTot*100):0;
  const avg=(()=>{ const d=st.delays; return ((d.url1||0)+(d.url2||0)+(d.try||0)+(d.ext||0)+(d.result||0)).toFixed(1)+'s'; })();
  const perDay=(total/d.days).toFixed(d.days===1?0:1);
  const GOAL=8, tiers=[1,2,4,6,7,8], todayCount=Math.min(GOAL,d.todayCount);
  const goalRing=ringGoal(todayCount,GOAL,tiers);
  const nextTier=tiers.find(v=>v>todayCount);
  const goalNote=nextTier?((nextTier-todayCount)+' vote(s) → palier '+nextTier+'/8'):'Tous les paliers atteints ✓';
  let pills=''; tiers.forEach(v=>{ const on=todayCount>=v; pills+='<div style="flex:1;text-align:center;padding:5px 0;border-radius:7px;font:600 11px IBM Plex Mono,monospace;border:1px solid '+(on?COLORS.och:COLORS.bd)+';background:'+(on?COLORS.och:COLORS.cream)+';color:'+(on?'#fff':COLORS.faint2)+'">'+v+'/8</div>'; });
  const ranges=[['jour','Jour'],['semaine','Semaine'],['mois','Mois'],['toujours','Depuis toujours']];
  let rchips=''; ranges.forEach(([k,l])=>{ const on=st.range===k; rchips+='<button data-action="range" data-arg="'+k+'" style="padding:7px 14px;border:none;border-radius:7px;cursor:pointer;font:600 12px IBM Plex Sans,sans-serif;background:'+(on?'#fff':'transparent')+';color:'+(on?COLORS.ochDk:COLORS.mut2)+';box-shadow:'+(on?'0 1px 2px rgba(60,48,20,.18)':'none')+'">'+l+'</button>'; });
  const styles=[['bars','▦ Barres'],['area','◢ Aire dégradée'],['lollipop','┃ Lollipop'],['finebars','▏ Barres fines'],['line','⟋ Courbe + points'],['cells','▤ Cellules'],['cumul','⌁ Barres + cumul'],['stacked','▥ Succès / échec'],['step','⌐ Paliers']];
  let opts=''; styles.forEach(([v,l])=>{ opts+='<option value="'+v+'"'+(st.chartStyle===v?' selected':'')+'>'+l+'</option>'; });
  let xlab=''; d.xlabels.forEach(x=>{ xlab+='<span>'+x+'</span>'; });
  const card=(label,val,sub,vc)=>'<div style="flex:1;background:#fff;border:1px solid rgba(60,48,20,.1);border-radius:13px;padding:17px;box-shadow:0 1px 2px rgba(60,48,20,.05)"><div style="font-size:11px;font-weight:600;color:'+COLORS.faint2+';text-transform:uppercase;letter-spacing:.06em">'+label+'</div><div style="font-size:30px;font-weight:700;color:'+(vc||COLORS.txt)+';margin-top:7px;line-height:1">'+val+'</div><div style="font-size:11px;color:'+COLORS.mut2+';margin-top:6px;font-weight:500">'+sub+'</div></div>';
  return ''
  + '<div style="padding:26px 30px;display:flex;flex-direction:column;height:100%">'
  +   '<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:20px"><div><div style="font-size:21px;font-weight:700;color:'+COLORS.txt+'">Vue d\'ensemble</div><div style="font-size:13px;color:'+COLORS.mut2+';margin-top:3px">'+d.title+' · données réelles (logs)</div></div><div style="display:flex;gap:3px;background:'+COLORS.chip+';padding:3px;border-radius:10px">'+rchips+'</div></div>'
  +   '<div style="display:grid;grid-template-columns:1.75fr 1fr;grid-template-rows:auto 1fr;gap:14px;flex:1;min-height:0"><div style="display:flex;gap:14px">'+card('Total votes',fmtN(total),'≈ '+perDay+' / jour')+card('Taux de succès',rate+'%',fmtN(fail)+' échecs',COLORS.och)+'</div>'+card('Temps moyen','<span id="avg-val">'+avg+'</span>','par captcha')+'<div style="background:#fff;border:1px solid rgba(60,48,20,.1);border-radius:13px;padding:18px 20px;box-shadow:0 1px 2px rgba(60,48,20,.05);display:flex;flex-direction:column;min-width:0;overflow:hidden"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><div style="font-size:14px;font-weight:600;color:'+COLORS.txt+'">'+d.title+'</div><div style="display:flex;align-items:center;gap:10px"><div style="position:relative;display:flex;align-items:center"><select data-change="chartStyle" style="appearance:none;-webkit-appearance:none;border:1px solid '+COLORS.bd+';background:'+COLORS.cream+';border-radius:8px;padding:5px 26px 5px 11px;font:600 11px IBM Plex Sans,sans-serif;color:'+COLORS.ochDk+';cursor:pointer;outline:none">'+opts+'</select><span style="position:absolute;right:9px;font-size:9px;color:'+COLORS.faint2+';pointer-events:none">▼</span></div><div style="display:flex;align-items:center;gap:6px;font-size:11px;color:'+COLORS.och+';font-weight:600"><span style="width:7px;height:7px;border-radius:50%;background:#10b981;animation:livepulse 1.8s infinite"></span>live</div></div></div><div id="chart-box" style="flex:1;min-height:0;display:flex;flex-direction:column"></div><div class="mono" style="display:flex;justify-content:space-between;font-size:10px;color:'+COLORS.faint+';margin-top:9px">'+xlab+'</div></div><div style="display:flex;flex-direction:column;gap:14px;min-width:0"><div style="background:#fff;border:1px solid rgba(60,48,20,.1);border-radius:13px;padding:16px 18px;box-shadow:0 1px 2px rgba(60,48,20,.05);display:flex;flex-direction:column;align-items:center"><div style="font-size:14px;font-weight:600;color:'+COLORS.txt+';align-self:flex-start;margin-bottom:12px">Captchas</div><div style="position:relative;width:104px;height:104px;border-radius:50%;background:conic-gradient('+COLORS.och+' 0% '+capRate.toFixed(1)+'%, '+COLORS.ltOch+' '+capRate.toFixed(1)+'% 100%)"><div style="position:absolute;inset:13px;background:#fff;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="font-size:21px;font-weight:700;color:'+COLORS.txt+'">'+capRate.toFixed(0)+'%</div><div style="font-size:10px;color:'+COLORS.mut2+'">résolus</div></div></div><div style="width:100%;margin-top:14px;font-size:12px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px"><span style="display:flex;align-items:center;gap:7px;color:'+COLORS.mut+'"><span style="width:9px;height:9px;border-radius:3px;background:'+COLORS.och+'"></span>Résolus</span><span style="font-weight:700;color:'+COLORS.txt+'">'+fmtN(cap.solved)+'</span></div><div style="display:flex;align-items:center;justify-content:space-between"><span style="display:flex;align-items:center;gap:7px;color:'+COLORS.mut+'"><span style="width:9px;height:9px;border-radius:3px;background:'+COLORS.ltOch+'"></span>Échoués</span><span style="font-weight:700;color:'+COLORS.txt+'">'+fmtN(cap.failed)+'</span></div></div></div><div style="background:#fff;border:1px solid rgba(60,48,20,.1);border-radius:13px;padding:16px 18px;box-shadow:0 1px 2px rgba(60,48,20,.05);display:flex;flex-direction:column;align-items:center"><div style="font-size:14px;font-weight:600;color:'+COLORS.txt+';align-self:flex-start">Objectif du jour</div><div class="mono" style="font-size:11px;color:'+COLORS.mut2+';align-self:flex-start;margin-bottom:12px">'+goalNote+'</div><div style="position:relative;width:120px;height:120px">'+goalRing+'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="font-size:28px;font-weight:700;color:'+COLORS.txt+';line-height:1">'+todayCount+'<span style="font-size:15px;color:'+COLORS.faint+';font-weight:600">/8</span></div><div style="font-size:9px;color:'+COLORS.mut2+';margin-top:1px">votes auj.</div></div></div><div style="display:flex;gap:5px;margin-top:16px;width:100%;justify-content:space-between">'+pills+'</div></div></div></div>'
  + '</div>';
}

function viewTerminal(st) {
  const base=(st.frozen&&st.pinned)?st.pinned:st.logs;
  const filtered=(st.filter==='all')?base:base.filter(l=>l.type===st.filter);
  const view=filtered.slice(-60);
  let lines=''; view.forEach(l=>{ lines+='<div style="display:flex;gap:11px;padding:2px 0;white-space:nowrap"><span style="color:#5a6371">'+l.t+'</span><span style="color:'+LOGCLR[l.type]+';font-weight:500;min-width:38px">'+LOGTAG[l.type]+'</span><span style="color:#c9d1d9;overflow:hidden;text-overflow:ellipsis">'+esc(l.msg)+'</span></div>'; });
  if (!view.length) lines='<div style="color:#5a6371">En attente de logs du worker… (flux SSE /stream)</div>';
  const chips=[['all','Tous'],['success','Succès'],['info','Info'],['warn','Warn'],['error','Erreur']];
  let cc=''; chips.forEach(([k,l])=>{ const on=st.filter===k; cc+='<button data-action="filter" data-arg="'+k+'" style="font:600 12px IBM Plex Sans,sans-serif;padding:6px 13px;border-radius:999px;cursor:pointer;border:1px solid '+(on?COLORS.och:'rgba(255,255,255,.16)')+';background:'+(on?COLORS.och:'transparent')+';color:'+(on?'#fff':'#9ba3b4')+'">'+l+'</button>'; });
  const imgWhich=st.captures.url2==='done'?'url2':(st.captures.url1==='done'?'url1':null);
  const shownImg  = st.lastImg || (imgWhich ? { src: Backend.imageUrl(imgWhich), label: 'live capture · '+imgWhich.toUpperCase() } : null);
  const imgLabel  = shownImg ? shownImg.label : '—';
  const imgContent= shownImg
    ? '<img id="last-img" src="'+shownImg.src+'" style="max-width:100%;max-height:100%;object-fit:contain;image-rendering:auto" onerror="this.style.opacity=\'0.2\'">'
    : '<span id="last-img" class="mono" style="font-size:11px;color:#4d5666">aucune capture</span>';
  return ''
  + '<div style="padding:26px 30px;display:flex;flex-direction:column;height:100%">'
  +   '<div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:18px"><div><div style="display:flex;align-items:center;gap:9px"><span data-status-dot style="width:9px;height:9px;border-radius:50%;background:#c1b59a;animation:livepulse 1.8s infinite"></span><span style="font-size:21px;font-weight:700;color:'+COLORS.txt+'">Terminal en direct</span></div><div style="font-size:13px;color:'+COLORS.mut2+';margin-top:3px">Flux du worker · <span data-clock>'+nowClock()+'</span></div></div><div style="display:flex;gap:8px"><button data-action="toggleFreeze" style="font:600 13px IBM Plex Sans,sans-serif;padding:8px 14px;border-radius:9px;cursor:pointer;border:1px solid '+(st.frozen?COLORS.och:COLORS.bd)+';background:'+(st.frozen?COLORS.och:'#fff')+';color:'+(st.frozen?'#fff':COLORS.mid)+'">'+(st.frozen?'❚❚ Gelé':'⏸ Geler')+'</button><button data-action="exportLogs" style="font:600 13px IBM Plex Sans,sans-serif;padding:8px 14px;border-radius:9px;cursor:pointer;border:1px solid '+COLORS.bd+';background:#fff;color:'+COLORS.mid+'">↓ Export .txt</button></div></div>'
  +   '<div style="display:flex;gap:7px;margin-bottom:14px">'+cc+'</div>'
  +   '<div style="display:flex;gap:14px;flex:1;min-height:0">'
  +     '<div id="term-scroll" style="flex:2;background:#0d1117;border-radius:12px;padding:16px 22px;min-height:0;overflow:auto;font:400 16px/1.7 IBM Plex Mono,monospace"><div id="term-body" style="display:flex;flex-direction:column;justify-content:flex-start">'+lines+'<div id="term-caret" style="display:flex;gap:8px;color:'+COLORS.och+';padding-top:4px">›<span style="animation:blink 1s steps(1) infinite;color:#c9d1d9">▋</span></div></div></div>'
  +     '<div style="flex:1;background:#0d1117;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px;min-height:0">'
  +       '<div class="mono" style="font-size:11px;color:#9ba3b4;flex-shrink:0"><span id="last-img-label">'+imgLabel+'</span></div>'
  +       '<div style="flex:1;min-height:0;border-radius:7px;border:1px solid #232a35;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#0a0c10">'+imgContent+'</div>'
  +       '<div class="mono" style="display:flex;justify-content:space-between;font-size:11px;color:#6b7480;flex-shrink:0"><span style="color:#3fb950">● '+(shownImg?'capturé':'—')+'</span><span data-clock>'+nowClock()+'</span></div>'
  +     '</div>'
  +   '</div>'
  + '</div>';
}

function viewSettings(st) {
  const tabs=[['delais','⏱ Délais'],['urls','🔗 URLs'],['config','⚙ Config']];
  let tt=''; tabs.forEach(([k,l])=>{ const on=st.settingsTab===k; tt+='<button data-action="settingsTab" data-arg="'+k+'" style="padding:7px 16px;border:none;border-radius:7px;cursor:pointer;font:600 12px IBM Plex Sans,sans-serif;white-space:nowrap;background:'+(on?'#fff':'transparent')+';color:'+(on?COLORS.ochDk:COLORS.mut2)+';box-shadow:'+(on?'0 1px 2px rgba(60,48,20,.18)':'none')+'">'+l+'</button>'; });
  let body='';
  if (st.settingsTab==='delais') body=settingsDelais(st);
  if (st.settingsTab==='urls')   body=settingsUrls(st);
  if (st.settingsTab==='config') body=settingsConfig(st);
  return '<div style="display:flex;flex-direction:column;height:100%"><div style="padding:26px 30px 0"><div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:16px"><div><div style="font-size:21px;font-weight:700;color:'+COLORS.txt+'">Réglages</div><div style="font-size:13px;color:'+COLORS.mut2+';margin-top:3px">Configuration du worker de vote</div></div><div style="display:flex;gap:3px;background:'+COLORS.chip+';padding:3px;border-radius:10px;flex-shrink:0">'+tt+'</div></div></div>'+body+'</div>';
}

function settingsDelais(st) {
  let rows='';
  DELAY_DEFS.forEach(d=>{
    const v=st.delays[d.key], p=((v-d.min)/(d.max-d.min)*100).toFixed(1);
    const fill='linear-gradient(90deg,'+COLORS.och+' 0%,'+COLORS.och+' '+p+'%,'+COLORS.ltOch+' '+p+'%,'+COLORS.ltOch+' 100%)';
    rows+='<div style="display:flex;align-items:center;gap:22px;padding:15px 0;border-bottom:1px solid '+COLORS.bdSoft+'"><div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:600;color:'+COLORS.txt+'">'+d.label+'</div><div style="font-size:12px;color:'+COLORS.mut2+';margin-top:2px">'+d.desc+'</div></div><div style="width:320px;display:flex;align-items:center;gap:16px;flex-shrink:0"><input type="range" data-input="delay" data-key="'+d.key+'" min="'+d.min+'" max="'+d.max+'" step="'+d.step+'" value="'+v+'" style="flex:1;background:'+fill+'"><div id="delay-val-'+d.key+'" class="mono" style="width:62px;text-align:right;font-weight:600;font-size:13px;color:'+COLORS.ochDk+'">'+fmtDelay(v,d.unit)+'</div></div></div>';
  });
  return '<div style="flex:1;min-height:0;overflow-y:auto;padding:6px 30px 0"><div style="background:#fff;border:1px solid rgba(60,48,20,.1);border-radius:13px;padding:6px 22px;box-shadow:0 1px 2px rgba(60,48,20,.05)">'+rows+'</div><div style="display:flex;justify-content:space-between;align-items:center;padding:16px 2px 24px"><button data-action="resetDelais" style="font:600 13px IBM Plex Sans,sans-serif;padding:9px 16px;border-radius:9px;border:1px solid '+COLORS.bd+';background:#fff;color:'+COLORS.mut+';cursor:pointer">↺ Réinitialiser</button><div class="mono" style="font-size:11px;color:'+COLORS.faint+'">Enregistré automatiquement</div></div></div>';
}

function settingsUrls(st) {
  const fields=[{ key:'url1', label:'URL 1', hint:'Première page ouverte par le worker', ph:'https://exemple.com/page-1' },{ key:'url2', label:'URL 2', hint:'Page où le vote est effectué', ph:'https://exemple.com/vote' }];
  let rows='';
  fields.forEach(u=>{
    const cap=st.captures[u.key], counting=typeof cap==='number', done=cap==='done';
    const icon=counting?'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>':(done?'<path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>':'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>');
    const txt=counting?('Capture dans '+cap+' s'):(done?'Recapturer':'Capturer');
    const status=counting?'<div style="display:flex;align-items:center;gap:7px;margin-top:9px;font-size:12px;color:'+COLORS.och+'"><span style="width:7px;height:7px;border-radius:50%;background:'+COLORS.amber+'"></span>Capture dans '+cap+' s · positionnez les zones à l\'écran</div>':(done?'<div style="display:flex;align-items:center;gap:7px;margin-top:9px;font-size:12px;color:#067647"><span style="width:7px;height:7px;border-radius:50%;background:#10b981"></span>Zones capturées — prêtes à configurer (onglet Config)</div>':'');
    rows+='<div style="padding:18px 0;border-bottom:1px solid '+COLORS.bdSoft+'"><div style="display:flex;align-items:center;gap:9px;margin-bottom:9px"><span class="mono" style="font-weight:600;font-size:11px;color:#fff;background:'+COLORS.och+';padding:3px 9px;border-radius:6px">'+u.label+'</span><span style="font-size:12px;color:'+COLORS.mut2+'">'+u.hint+'</span></div><div style="display:flex;align-items:center;gap:10px"><div style="flex:1;display:flex;align-items:center;gap:9px;border:1px solid '+COLORS.bd+';border-radius:9px;padding:0 13px;background:'+COLORS.cream+';height:44px"><span style="color:#b3a98f;font-size:13px">🔗</span><input type="text" data-input="url" data-key="'+u.key+'" value="'+esc(st.urls[u.key])+'" placeholder="'+u.ph+'" class="mono" style="border:none;outline:none;flex:1;font-size:13px;color:'+COLORS.txt+';background:transparent"></div><button '+(counting?'':'data-action="capture" data-arg="'+u.key+'"')+' style="display:flex;align-items:center;gap:8px;height:44px;padding:0 16px;border-radius:9px;border:1px solid '+(counting?COLORS.bd:COLORS.och)+';background:'+(counting?COLORS.chip:'#fff')+';color:'+(counting?COLORS.faint2:COLORS.ochDk)+';font:600 13px IBM Plex Sans,sans-serif;cursor:'+(counting?'default':'pointer')+';white-space:nowrap"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+icon+'</svg><span>'+txt+'</span></button></div>'+status+'</div>';
  });
  return '<div style="flex:1;min-height:0;overflow-y:auto;padding:6px 30px 24px"><div style="background:#fff;border:1px solid rgba(60,48,20,.1);border-radius:13px;padding:22px;box-shadow:0 1px 2px rgba(60,48,20,.05)"><div style="font-size:15px;font-weight:700;color:'+COLORS.txt+'">Pages cibles</div><div style="font-size:12px;color:'+COLORS.mut2+';margin-top:2px">Les deux adresses parcourues par le worker. Capturez chacune pour vérifier le rendu.</div>'+rows+'<div class="mono" style="font-size:11px;color:'+COLORS.faint+';margin-top:16px">Enregistré automatiquement · POST /screenshot après 5 s</div></div></div>';
}

function settingsConfig(st) {
  const cv=st.configView;
  return '<div style="flex:1;min-height:0;display:flex;padding:6px 30px 20px"><div style="flex:1;min-height:0;display:flex;flex-direction:column;background:#fff;border:1px solid rgba(60,48,20,.1);border-radius:13px;padding:18px;box-shadow:0 1px 2px rgba(60,48,20,.05)">'
  + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px"><div><div style="font-size:15px;font-weight:700;color:'+COLORS.txt+'">Repérage des zones</div><div style="font-size:12px;color:'+COLORS.mut2+';margin-top:2px">Placez points (clic) et carrés (zone) sur la capture. Glissez pour ajuster.</div></div>'
  +   '<div style="position:relative;display:flex;background:'+COLORS.chip+';border-radius:10px;padding:4px;width:280px;flex-shrink:0"><div style="position:absolute;top:4px;bottom:4px;left:'+(cv==='url1'?'4px':'50%')+';width:calc(50% - 4px);background:#fff;border-radius:7px;box-shadow:0 1px 2px rgba(60,48,20,.18);transition:left .22s ease"></div><button data-action="configView" data-arg="url1" style="position:relative;z-index:1;flex:1;border:none;background:transparent;padding:7px 0;border-radius:7px;cursor:pointer;font:600 12px IBM Plex Sans,sans-serif;color:'+(cv==='url1'?COLORS.txt:COLORS.mut2)+'">Capture URL 1</button><button data-action="configView" data-arg="url2" style="position:relative;z-index:1;flex:1;border:none;background:transparent;padding:7px 0;border-radius:7px;cursor:pointer;font:600 12px IBM Plex Sans,sans-serif;color:'+(cv==='url2'?COLORS.txt:COLORS.mut2)+'">Capture URL 2</button></div>'
  + '</div>'
  + '<div id="config-editor" style="display:flex;flex-direction:column;gap:11px;flex:1;min-height:0">'+configEditorInner(st)+'</div>'
  + '</div></div>';
}

function configEditorInner(st) {
  const cv=st.configView;
  const zones=st.zones.filter(z=>z.page===cv);
  const ZCLR={ zone:COLORS.och, click:COLORS.click };
  let chips='';
  zones.forEach(z=>{ const sel=z.id===st.selectedZone, c=ZCLR[z.type]; chips+='<button data-action="selectZone" data-arg="'+z.id+'" style="display:flex;align-items:center;gap:7px;border:1px solid '+(sel?c:'transparent')+';background:'+(sel?COLORS.cream:'transparent')+';border-radius:8px;padding:5px 9px;cursor:pointer"><span style="width:11px;height:11px;border-radius:'+(z.type==='click'?'50%':'3px')+';background:'+c+';flex-shrink:0"></span><span style="font-size:12px;font-weight:600;color:'+COLORS.txt+';white-space:nowrap">'+z.name+'</span></button>'; });
  const done=st.captures[cv]==='done';
  const selLabel=cv==='url1'?'URL 1':'URL 2';
  const selUrl=st.urls[cv]||(cv==='url1'?'https://exemple.com/page-1':'https://exemple.com/vote');
  const head='<div style="display:flex;align-items:center;flex-wrap:wrap;gap:7px">'+chips+'<div style="margin-left:auto;display:flex;gap:7px"><button data-action="saveDefault" style="height:30px;border:1px solid '+COLORS.och+';background:'+(st.savedFlash?COLORS.och:'#fff')+';color:'+(st.savedFlash?'#fff':COLORS.ochDk)+';border-radius:8px;padding:0 12px;font:600 11px IBM Plex Sans,sans-serif;cursor:pointer;white-space:nowrap">'+(st.savedFlash?'✓ Enregistré':'★ Définir par défaut')+'</button><button data-action="resetZones" style="height:30px;border:1px solid '+COLORS.bd+';background:#fff;border-radius:8px;padding:0 11px;font:600 11px IBM Plex Sans,sans-serif;color:'+COLORS.mut+';cursor:pointer;white-space:nowrap">↺ Réinitialiser</button></div></div>';
  const winHead='<div style="display:flex;align-items:center;gap:9px;height:38px;padding:0 13px;background:'+COLORS.cream+';border-bottom:1px solid '+COLORS.bd+';flex-shrink:0"><div style="display:flex;gap:6px"><span style="width:9px;height:9px;border-radius:50%;background:#e0c9a0"></span><span style="width:9px;height:9px;border-radius:50%;background:#e0c9a0"></span><span style="width:9px;height:9px;border-radius:50%;background:#e0c9a0"></span></div><div style="flex:1;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #ece4d4;border-radius:7px;height:24px;padding:0 10px;margin-left:6px"><span class="mono" style="font-weight:600;font-size:9px;color:#fff;background:'+COLORS.och+';padding:1px 6px;border-radius:4px">'+selLabel+'</span><span class="mono" style="font-size:11px;color:'+COLORS.mut+';overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(selUrl)+'</span></div></div>';
  let canvas;
  if (done) {
    let overlays='';
    zones.forEach(z=>{
      const c=ZCLR[z.type], sel=z.id===st.selectedZone;
      const ring=sel?'outline:2px solid rgba(159,116,32,.45);outline-offset:2px;':'';
      if (z.type==='zone') overlays+='<div data-zone="'+z.id+'" data-mode="move" style="position:absolute;left:'+z.x+'%;top:'+z.y+'%;width:'+z.w+'%;height:'+z.h+'%;border:2px dashed '+c+';background:'+(sel?'rgba(159,116,32,.14)':'rgba(159,116,32,.07)')+';border-radius:6px;cursor:grab;'+ring+'"><div class="mono" style="position:absolute;top:3px;left:4px;font-weight:600;font-size:9px;color:#fff;background:'+c+';padding:1px 5px;border-radius:4px;white-space:nowrap">'+z.name+'</div><div data-zone="'+z.id+'" data-mode="resize" style="position:absolute;right:-6px;bottom:-6px;width:13px;height:13px;border-radius:3px;background:#fff;border:2px solid '+c+';cursor:nwse-resize"></div></div>';
      else overlays+='<div data-zone="'+z.id+'" data-mode="move" style="position:absolute;left:'+z.x+'%;top:'+z.y+'%;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;border:2px solid '+c+';background:rgba(161,66,31,.16);cursor:grab;'+ring+'display:flex;align-items:center;justify-content:center"><div style="width:5px;height:5px;border-radius:50%;background:'+c+'"></div><div class="mono" style="position:absolute;top:-19px;left:50%;transform:translateX(-50%);font-weight:600;font-size:9px;color:#fff;background:'+c+';padding:1px 5px;border-radius:4px;white-space:nowrap">'+z.name+'</div></div>';
    });
    canvas='<div id="zone-box" style="position:relative;flex:1;min-height:0;overflow:hidden;user-select:none;touch-action:none;background:#11161d"><img id="zone-bg-img" src="'+Backend.imageUrl(cv)+'" draggable="false" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none" onload="App.fitZoneOverlay()" onerror="this.style.opacity=0"><div id="zone-img-frame" style="position:absolute;top:0;left:0;width:100%;height:100%">'+overlays+'</div></div>';
  } else {
    canvas='<div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:'+COLORS.cream+'"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#c9bfa6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg><div style="text-align:center"><div style="font-size:14px;font-weight:600;color:'+COLORS.mut+'">Aucune capture pour '+selLabel+'</div><div style="font-size:12px;color:'+COLORS.mut2+';margin-top:3px">Capturez la page dans l\'onglet URLs pour repérer les zones.</div></div><button data-action="settingsTab" data-arg="urls" style="height:36px;padding:0 16px;border-radius:9px;border:1px solid '+COLORS.och+';background:#fff;color:'+COLORS.ochDk+';font:600 12px IBM Plex Sans,sans-serif;cursor:pointer">Aller à l\'onglet URLs →</button></div>';
  }
  return head + '<div style="flex:1;min-height:0;display:flex;flex-direction:column;border:1px solid '+COLORS.bd+';border-radius:12px;overflow:hidden;background:#fff">'+winHead+canvas+'</div>';
}

/* ============================ BOOT ===================================== */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}
