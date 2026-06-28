/* ============================================================
   ÉTAT GLOBAL
   ============================================================ */
let bgImg  = null;
let bgImg1 = null;
let bgImg2 = null;
let scaleX = 1;
let scaleY = 1;

let _waitUntil = 0;
let _liveState = 'idle';
let drawMode   = 'try';

let ptPre      = null;
let selPreTimer = null;
let ptTry      = null;
let ptExten    = null;
let selCheck1  = null;
let ptValidate = null;
let selCheck2  = null;

let drawing = false;
let ox = 0;
let oy = 0;

let monitors = [];
let selMon   = 1;

const cv  = document.getElementById('cv');
const ctx = cv.getContext('2d');

/* ============================================================
   CONFIG DES MODES DE DESSIN
   ============================================================ */
const MODE_CFG = {
  pre:       { btn: 'mode-pre', cls: 'm-pre',     info: '🔗 Cliquez sur le bouton à activer sur la page URL 1 (pré-navigation vers URL 2).' },
  pre_timer: { btn: 'mode-pt1', cls: 'm-pre-t',   info: '⏱ Dessinez la zone où apparaît le timer de vote sur URL 1 (ex: "Prochain vote dans 30 minutes").' },
  try:       { btn: 'mode-try', cls: 'm-point',   info: '🖱 Cliquez sur l\'endroit à cliquer en premier sur URL 2 (ouvre / affiche le captcha).' },
  exten:     { btn: 'mode-ext', cls: 'm-refresh', info: '🤖 Cliquez sur l\'endroit que clique l\'extension pour résoudre le captcha.' },
  check1:    { btn: 'mode-ck1', cls: 'm-capture', info: '🟩 Dessinez la zone verte indiquant que le captcha est résolu (apparaît après l\'extension).' },
  validate:  { btn: 'mode-val', cls: 'm-final',   info: '✅ Cliquez sur le bouton de validation du captcha (confirmer quand la zone verte est détectée).' },
  check2:    { btn: 'mode-ck2', cls: 'm-message', info: '📋 Dessinez la zone où apparaît le timer ou le message de résultat (après validation).' },
};

/* ============================================================
   NAVIGATION
   ============================================================ */
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  document.querySelectorAll('.nav-item').forEach((btn, i) => {
    btn.classList.toggle('active', ['dashboard', 'config'][i] === id);
  });
  if (id === 'dashboard') renderDashboard();
}

/* ============================================================
   LOCALSTORAGE
   ============================================================ */
const LS = {
  save() {
    localStorage.setItem('bp_url',     document.getElementById('url-input').value);
    localStorage.setItem('bp_url_pre', document.getElementById('url-pre').value);
    localStorage.setItem('bp_delay',   document.getElementById('delay').value);
    localStorage.setItem('bp_dpre',    document.getElementById('delay-pre').value);
    localStorage.setItem('bp_dclick',  document.getElementById('delay-click').value);
    localStorage.setItem('bp_dexten',  document.getElementById('delay-exten').value);
    localStorage.setItem('bp_monitor', selMon);
    localStorage.setItem('bp_dretry',  document.getElementById('delay-retry').value);
    localStorage.setItem('bp_dfok',    document.getElementById('delay-final-ok').value);

    localStorage.setItem('bp_pt_pre',  ptPre
      ? JSON.stringify({ sx: ptPre.sx, sy: ptPre.sy })
      : '');
    localStorage.setItem('bp_sel_pt1', selPreTimer
      ? JSON.stringify({ sx: selPreTimer.sx, sy: selPreTimer.sy, sw: selPreTimer.sw, sh: selPreTimer.sh })
      : '');
    localStorage.setItem('bp_pt_try',  ptTry
      ? JSON.stringify({ sx: ptTry.sx, sy: ptTry.sy })
      : '');
    localStorage.setItem('bp_pt_ext',  ptExten
      ? JSON.stringify({ sx: ptExten.sx, sy: ptExten.sy })
      : '');
    localStorage.setItem('bp_sel_ck1', selCheck1
      ? JSON.stringify({ sx: selCheck1.sx, sy: selCheck1.sy, sw: selCheck1.sw, sh: selCheck1.sh })
      : '');
    localStorage.setItem('bp_pt_val',  ptValidate
      ? JSON.stringify({ sx: ptValidate.sx, sy: ptValidate.sy })
      : '');
    localStorage.setItem('bp_sel_ck2', selCheck2
      ? JSON.stringify({ sx: selCheck2.sx, sy: selCheck2.sy, sw: selCheck2.sw, sh: selCheck2.sh })
      : '');
  },

  loadSettings() {
    const url   = localStorage.getItem('bp_url');
    const urlPre = localStorage.getItem('bp_url_pre');
    const delay = localStorage.getItem('bp_delay');
    const dpre  = localStorage.getItem('bp_dpre');
    const dc    = localStorage.getItem('bp_dclick');
    const dext  = localStorage.getItem('bp_dexten');
    const mon   = localStorage.getItem('bp_monitor');
    const drr   = localStorage.getItem('bp_dretry');
    const dfok  = localStorage.getItem('bp_dfok');

    if (url)    document.getElementById('url-input').value = url;
    if (urlPre) document.getElementById('url-pre').value   = urlPre;

    if (delay) { document.getElementById('delay').value       = delay; document.getElementById('dv1').textContent = delay + 's'; }
    if (dpre)  { document.getElementById('delay-pre').value   = dpre;  document.getElementById('dvp').textContent = dpre  + 's'; }
    if (dc)    { document.getElementById('delay-click').value = dc;    document.getElementById('dv2').textContent = dc    + 's'; }
    if (dext)  { document.getElementById('delay-exten').value = dext;  document.getElementById('dv3').textContent = dext  + 's'; }
    if (drr)   { document.getElementById('delay-retry').value = drr;   document.getElementById('dv4').textContent = drr   + 'min'; }

    if (dfok) {
      const clamped = Math.min(40, Math.max(5, parseFloat(dfok)));
      document.getElementById('delay-final-ok').value = clamped;
      document.getElementById('dv5').textContent      = clamped + 's';
    }

    if (mon) selMon = parseInt(mon);
  },

  restoreZones() {
    const rPre = localStorage.getItem('bp_pt_pre');
    const rPt1 = localStorage.getItem('bp_sel_pt1');
    const rTry = localStorage.getItem('bp_pt_try');
    const rExt = localStorage.getItem('bp_pt_ext');
    const rCk1 = localStorage.getItem('bp_sel_ck1');
    const rVal = localStorage.getItem('bp_pt_val');
    const rCk2 = localStorage.getItem('bp_sel_ck2');
    let restored = false;

    if (rPre) {
      const p = JSON.parse(rPre);
      ptPre = { sx: p.sx, sy: p.sy, cx: p.sx / scaleX, cy: p.sy / scaleY };
      setTag('pre', `🔗 (${p.sx},${p.sy})`);
      show('btn-clear-pre');
      restored = true;
    }
    if (rPt1) {
      const s = JSON.parse(rPt1);
      selPreTimer = { sx: s.sx, sy: s.sy, sw: s.sw, sh: s.sh, cx: s.sx / scaleX, cy: s.sy / scaleY, cw: s.sw / scaleX, ch: s.sh / scaleY };
      setTag('pre-timer', `⏱ ${s.sw}×${s.sh}px`);
      show('btn-clear-pt1');
      restored = true;
    }
    if (rTry) {
      const p = JSON.parse(rTry);
      ptTry = { sx: p.sx, sy: p.sy, cx: p.sx / scaleX, cy: p.sy / scaleY };
      setTag('try', `🖱 (${p.sx},${p.sy})`);
      show('btn-clear-try');
      restored = true;
    }
    if (rExt) {
      const p = JSON.parse(rExt);
      ptExten = { sx: p.sx, sy: p.sy, cx: p.sx / scaleX, cy: p.sy / scaleY };
      setTag('exten', `🤖 (${p.sx},${p.sy})`);
      show('btn-clear-ext');
      restored = true;
    }
    if (rCk1) {
      const s = JSON.parse(rCk1);
      selCheck1 = { sx: s.sx, sy: s.sy, sw: s.sw, sh: s.sh, cx: s.sx / scaleX, cy: s.sy / scaleY, cw: s.sw / scaleX, ch: s.sh / scaleY };
      setTag('check1', `🟩 ${s.sw}×${s.sh}px`);
      show('btn-clear-ck1');
      restored = true;
    }
    if (rVal) {
      const p = JSON.parse(rVal);
      ptValidate = { sx: p.sx, sy: p.sy, cx: p.sx / scaleX, cy: p.sy / scaleY };
      setTag('validate', `✅ (${p.sx},${p.sy})`);
      show('btn-clear-val');
      restored = true;
    }
    if (rCk2) {
      const s = JSON.parse(rCk2);
      selCheck2 = { sx: s.sx, sy: s.sy, sw: s.sw, sh: s.sh, cx: s.sx / scaleX, cy: s.sy / scaleY, cw: s.sw / scaleX, ch: s.sh / scaleY };
      setTag('check2', `📋 ${s.sw}×${s.sh}px`);
      show('btn-clear-ck2');
      restored = true;
    }

    if (restored) {
      redraw();
      refreshLaunch();
      setInfo('Zones restaurées. ▶ Lancer dès que prêt.');
    } else {
      setInfo('Étape 1 : capturez URL 1 pour définir le clic pré-étape (si besoin), puis capturez URL 2 pour les 3 clics et 2 zones.');
    }
  },
};

/* ============================================================
   STATS & HISTORIQUE
   ============================================================ */
function todayKey() {
  return 'bp_stats_' + new Date().toISOString().slice(0, 10);
}

function getStats() {
  const raw = localStorage.getItem(todayKey());
  return raw ? JSON.parse(raw) : { total: 0, success: 0, failed: 0, attemptsSum: 0 };
}

function saveStats(stats) {
  localStorage.setItem(todayKey(), JSON.stringify(stats));
}

function getHistory() {
  const raw = localStorage.getItem('bp_history');
  return raw ? JSON.parse(raw) : [];
}

function recordResult(data) {
  const stats = getStats();
  stats.total++;
  if (data.status === 'success') stats.success++;
  else if (data.status === 'error') stats.failed++;
  stats.attemptsSum += (data.cycles || 1);
  saveStats(stats);

  const hist = getHistory();
  hist.unshift({
    time:   new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    cycles: data.cycles || 1,
    status: data.status,
  });
  if (hist.length > 30) hist.pop();
  localStorage.setItem('bp_history', JSON.stringify(hist));

  renderDashboard();
  updateSidebarLast(data);
}

function renderDashboard() {
  const stats = getStats();
  document.getElementById('st-total').textContent   = stats.total;
  document.getElementById('st-success').textContent = stats.success;
  document.getElementById('st-failed').textContent  = stats.failed;

  const rate = stats.total > 0 ? Math.round(stats.success / stats.total * 100) : null;
  document.getElementById('st-rate').textContent = rate !== null ? rate + '%' : '—';
  document.getElementById('st-avg').textContent  = `moy. ${stats.total > 0 ? (stats.attemptsSum / stats.total).toFixed(1) : '—'} tentative(s)`;
  document.getElementById('today-date').textContent = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const hist      = getHistory();
  const container = document.getElementById('history-container');

  if (!hist.length) {
    container.innerHTML = '<div class="empty-state">Aucune session enregistrée aujourd\'hui.</div>';
    return;
  }

  const rows = hist.map(h => {
    const badgeClass = h.status === 'success' ? 'b-ok' : h.status === 'error' ? 'b-err' : 'b-unk';
    const label      = h.status === 'success' ? '✓ Succès'
                     : h.status === 'error'   ? '✗ Échec'
                     : h.status === 'timer'   ? '⏳ Timer'
                     : '? Arrêté';
    return `<tr>
      <td>${h.time}</td>
      <td style="color:var(--accent)">${h.cycles || 1}</td>
      <td><span class="badge ${badgeClass}">${label}</span></td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="hist-table">
      <thead><tr><th>Heure</th><th>Cycles</th><th>Statut</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function clearHistory() {
  localStorage.removeItem('bp_history');
  localStorage.removeItem(todayKey());
  renderDashboard();
}

function updateSidebarLast(data) {
  const el = document.getElementById('sidebar-last');
  if (data.status === 'success') {
    el.style.color  = 'var(--green)';
    el.textContent  = `✓ Succès — ${data.cycles || 1} cycle(s)`;
  } else if (data.status === 'timer') {
    el.style.color  = 'var(--gold)';
    el.textContent  = `⏳ Timer — ${data.cycles || 1} cycle(s)`;
  } else {
    el.style.color  = 'var(--muted)';
    el.textContent  = '? Arrêté';
  }
}

/* ============================================================
   MONITEURS
   ============================================================ */
async function loadMonitors() {
  const res = await fetch('/monitors');
  monitors  = await res.json();

  const wrap = document.getElementById('mon-buttons');
  wrap.innerHTML = '';

  monitors.forEach(m => {
    const btn = document.createElement('button');
    btn.className   = 'mon-btn' + (m.index === selMon ? ' active' : '');
    btn.textContent = `Écran ${m.index}`;
    btn.title       = `${m.width}×${m.height}`;
    btn.addEventListener('click', () => {
      selMon = m.index;
      document.querySelectorAll('.mon-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      LS.save();
      resetAll();
    });

    const badge = document.createElement('span');
    badge.className   = 'mon-badge';
    badge.textContent = ` ${m.width}×${m.height}`;

    const cell = document.createElement('span');
    cell.style.cssText = 'display:inline-flex;align-items:center;gap:3px;margin-right:6px';
    cell.append(btn, badge);
    wrap.appendChild(cell);
  });

  document.querySelectorAll('.mon-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.textContent.replace('Écran ', '')) === selMon);
  });
}

/* ============================================================
   SWITCHER DE VUE (URL 1 / URL 2)
   ============================================================ */
function switchView(which) {
  if (which === 'url1' && bgImg1) {
    bgImg = bgImg1;
    updateViewBtns('url1');
    redraw();
    setMode('pre');
    setInfo('🔗 Vue URL 1 — définissez le clic pré-étape et/ou la zone timer.');
  } else if (which === 'url2' && bgImg2) {
    bgImg = bgImg2;
    updateViewBtns('url2');
    redraw();
    setMode('try');
    setInfo('🖱 Vue URL 2 — définissez les 3 clics (try, extension, valider) et les 2 zones de vérification.');
  }
}

function updateViewBtns(which) {
  const b1  = document.getElementById('btn-view1');
  const b2  = document.getElementById('btn-view2');
  const lbl = document.getElementById('view-label');

  if (b1) {
    b1.disabled        = !bgImg1;
    b1.style.opacity   = which === 'url1' ? '1' : '0.5';
    b1.style.fontWeight  = which === 'url1' ? 'bold' : 'normal';
    b1.style.borderWidth = which === 'url1' ? '2px'  : '1px';
  }
  if (b2) {
    b2.disabled        = !bgImg2;
    b2.style.opacity   = which === 'url2' ? '1' : '0.5';
    b2.style.fontWeight  = which === 'url2' ? 'bold' : 'normal';
    b2.style.borderWidth = which === 'url2' ? '2px'  : '1px';
  }
  if (lbl) lbl.textContent = which === 'url1' ? '← pré-clic + timer' : '← 3 clics + 2 zones vérif';
  if (bgImg1 || bgImg2) show('view-toggle');
}

/* ============================================================
   SCREENSHOTS
   ============================================================ */
function _applyBg(data) {
  const img = new Image();
  img.onload = () => {
    bgImg1 = img;
    bgImg  = img;
    const maxW  = Math.floor(window.innerWidth * 0.94) - 210;
    const ratio = Math.min(1, maxW / data.width);
    cv.width  = Math.round(data.width  * ratio);
    cv.height = Math.round(data.height * ratio);
    scaleX = data.width  / cv.width;
    scaleY = data.height / cv.height;
    show('canvas-wrap');
    show('mode-row');
    show('zones-row');
    updateViewBtns('url1');
    redraw();
  };
  img.src = 'data:image/png;base64,' + data.image;
}

function applyScreenshot(data, restore = false) {
  const img = new Image();
  img.onload = () => {
    bgImg2 = img;
    bgImg  = img;
    const maxW  = Math.floor(window.innerWidth * 0.94) - 210;
    const ratio = Math.min(1, maxW / data.width);
    cv.width  = Math.round(data.width  * ratio);
    cv.height = Math.round(data.height * ratio);
    scaleX = data.width  / cv.width;
    scaleY = data.height / cv.height;
    show('canvas-wrap');
    show('mode-row');
    show('zones-row');
    updateViewBtns('url2');
    if (restore) {
      ptTry = ptExten = selCheck1 = ptValidate = selCheck2 = null;
      LS.restoreZones();
    }
    if (!ptTry) setMode('try');
    redraw();
  };
  img.src = 'data:image/png;base64,' + data.image;
}

async function captureScreen() {
  const delay = parseInt(document.getElementById('capture-delay').value);
  const btn   = document.getElementById('btn-capture');
  const cd    = document.getElementById('capture-countdown');

  if (delay > 0) {
    btn.disabled    = true;
    cd.style.display = 'inline';
    for (let i = delay; i > 0; i--) {
      cd.textContent = `📸 ${i}s`;
      setInfo(`⏳ Capture URL 2 dans ${i}s — passez sur la bonne fenêtre…`);
      await new Promise(r => setTimeout(r, 1000));
    }
    cd.textContent = '📸 …';
  }

  setInfo('⏳ Capture URL 2 en cours…');
  const res = await fetch('/screenshot', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ monitor: selMon, which: 'url2' }),
  });
  cd.style.display = 'none';
  btn.disabled     = false;
  applyScreenshot(await res.json(), true);
}

async function captureScreenPre() {
  const delay = parseInt(document.getElementById('capture-delay').value);
  const btn   = document.getElementById('btn-capture-pre');
  const cd    = document.getElementById('capture-countdown');

  if (delay > 0) {
    btn.disabled    = true;
    cd.style.display = 'inline';
    for (let i = delay; i > 0; i--) {
      cd.textContent = `📸 ${i}s`;
      setInfo(`⏳ Capture URL 1 dans ${i}s — passez sur la page URL 1…`);
      await new Promise(r => setTimeout(r, 1000));
    }
    cd.textContent = '📸 …';
  }

  setInfo('⏳ Capture URL 1 en cours…');
  const res  = await fetch('/screenshot', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ monitor: selMon, which: 'url1' }),
  });
  const data = await res.json();
  cd.style.display = 'none';
  btn.disabled     = false;

  // Charge le screenshot SANS réinitialiser les zones captcha, switch vers mode pré
  _applyBg(data);
  setTimeout(() => {
    setMode('pre');
    setInfo('🔗 Cliquez sur le bouton à activer sur URL 1 pour définir le point de clic pré-étape.');
  }, 50);
}

async function tryLoadLastScreenshot() {
  const [res1, res2]   = await Promise.all([fetch('/last_screenshot?which=url1'), fetch('/last_screenshot?which=url2')]);
  const [data1, data2] = await Promise.all([res1.json(), res2.json()]);

  if (data1) {
    const img = new Image();
    img.onload = () => { bgImg1 = img; updateViewBtns(data2 ? 'url2' : 'url1'); };
    img.src = 'data:image/png;base64,' + data1.image;
  }

  if (data2) {
    setInfo('⏳ Restauration de la dernière session…');
    applyScreenshot(data2, true);
  } else if (data1) {
    setInfo('⏳ Restauration de la dernière session…');
    _applyBg(data1);
  } else {
    setInfo('Étape 1 : capturez URL 1 si besoin, puis capturez URL 2 pour les zones captcha.');
  }
}

/* ============================================================
   MODE DE DESSIN
   ============================================================ */
function setMode(mode) {
  drawMode = mode;
  Object.keys(MODE_CFG).forEach(m => {
    const isActive = m === mode;
    document.getElementById(MODE_CFG[m].btn).className = 'mode-btn' + (isActive ? ' ' + MODE_CFG[mode].cls : '');
  });
  setInfo(MODE_CFG[mode].info);
}

/* ============================================================
   CANVAS — RENDU
   ============================================================ */
function redraw() {
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (bgImg)       ctx.drawImage(bgImg, 0, 0, cv.width, cv.height);
  if (selPreTimer) drawRect(selPreTimer, 'var(--gold)');
  if (selCheck1)   drawRect(selCheck1,  'var(--green)');
  if (selCheck2)   drawRect(selCheck2,  'var(--purple)');
  if (ptPre)       drawCross(ptPre,      'var(--accent)');
  if (ptTry)       drawCross(ptTry,      'var(--orange)');
  if (ptExten)     drawCross(ptExten,    'var(--cyan)');
  if (ptValidate)  drawCross(ptValidate, 'var(--gold)');
}

function drawRect(sel, color) {
  const { cx, cy, cw, ch } = sel;

  // Assombrir l'extérieur de la zone
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(0,       0,        cv.width,      cy);
  ctx.fillRect(0,       cy + ch,  cv.width,      cv.height - cy - ch);
  ctx.fillRect(0,       cy,       cx,            ch);
  ctx.fillRect(cx + cw, cy,       cv.width - cx - cw, ch);

  // Bordure pointillée
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;
  ctx.setLineDash([6, 3]);
  ctx.strokeRect(cx, cy, cw, ch);

  // Poignées de coin
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  [[cx, cy], [cx + cw, cy], [cx, cy + ch], [cx + cw, cy + ch]].forEach(([x, y]) => {
    ctx.fillRect(x - 3, y - 3, 6, 6);
  });
}

function drawCross(point, color) {
  const { cx, cy } = point;
  const r = 13;

  ctx.setLineDash([]);
  ctx.strokeStyle = color;
  ctx.lineWidth   = 2;

  // Cercle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Croix
  ctx.beginPath();
  ctx.moveTo(cx - r - 5, cy); ctx.lineTo(cx + r + 5, cy);
  ctx.moveTo(cx, cy - r - 5); ctx.lineTo(cx, cy + r + 5);
  ctx.stroke();

  // Point central
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
}

/* ============================================================
   ÉVÉNEMENTS SOURIS (canvas)
   ============================================================ */
cv.addEventListener('mousedown', e => {
  const rect = cv.getBoundingClientRect();
  ox      = e.clientX - rect.left;
  oy      = e.clientY - rect.top;
  drawing = true;
});

cv.addEventListener('mousemove', e => {
  const POINT_MODES = ['pre', 'try', 'exten', 'validate'];
  if (!drawing || POINT_MODES.includes(drawMode)) return;

  const rect = cv.getBoundingClientRect();
  const mx   = e.clientX - rect.left;
  const my   = e.clientY - rect.top;
  const sel  = { cx: Math.min(ox, mx), cy: Math.min(oy, my), cw: Math.abs(mx - ox), ch: Math.abs(my - oy) };

  if      (drawMode === 'pre_timer') selPreTimer = sel;
  else if (drawMode === 'check1')    selCheck1   = sel;
  else                               selCheck2   = sel;
  redraw();
});

cv.addEventListener('mouseup', e => {
  drawing = false;
  const rect = cv.getBoundingClientRect();
  const mx   = e.clientX - rect.left;
  const my   = e.clientY - rect.top;

  const RECT_MODES = ['pre_timer', 'check1', 'check2'];

  if (RECT_MODES.includes(drawMode)) {
    const sel = drawMode === 'pre_timer' ? selPreTimer
              : drawMode === 'check1'    ? selCheck1
              :                            selCheck2;
    if (!sel || sel.cw < 4 || sel.ch < 4) return;

    sel.sx = Math.round(sel.cx * scaleX);
    sel.sy = Math.round(sel.cy * scaleY);
    sel.sw = Math.round(sel.cw * scaleX);
    sel.sh = Math.round(sel.ch * scaleY);

    if (drawMode === 'pre_timer') {
      setTag('pre-timer', `⏱ ${sel.sw}×${sel.sh}px`);
      show('btn-clear-pt1');
      setInfo('Zone timer URL 1 définie. Passez sur URL 2 pour les clics.');
    } else if (drawMode === 'check1') {
      setTag('check1', `🟩 ${sel.sw}×${sel.sh}px`);
      show('btn-clear-ck1');
      setMode('validate');
    } else {
      setTag('check2', `📋 ${sel.sw}×${sel.sh}px`);
      show('btn-clear-ck2');
      setInfo('Zone résultat définie. ▶ Lancer dès que prêt.');
    }
  } else {
    const p = { cx: mx, cy: my, sx: Math.round(mx * scaleX), sy: Math.round(my * scaleY) };

    if (drawMode === 'pre') {
      ptPre = p;
      setTag('pre', `🔗 (${p.sx},${p.sy})`);
      show('btn-clear-pre');
      setMode('pre_timer');
    } else if (drawMode === 'try') {
      ptTry = p;
      setTag('try', `🖱 (${p.sx},${p.sy})`);
      show('btn-clear-try');
      setMode('exten');
    } else if (drawMode === 'exten') {
      ptExten = p;
      setTag('exten', `🤖 (${p.sx},${p.sy})`);
      show('btn-clear-ext');
      setMode('check1');
    } else if (drawMode === 'validate') {
      ptValidate = p;
      setTag('validate', `✅ (${p.sx},${p.sy})`);
      show('btn-clear-val');
      setMode('check2');
    }
    redraw();
  }

  refreshLaunch();
  LS.save();
});

/* ============================================================
   GESTION DES ZONES
   ============================================================ */
function clearZone(which) {
  const map = {
    pre:       ['btn-clear-pre', 'pre',       '🔗 Pré-clic'],
    pre_timer: ['btn-clear-pt1', 'pre-timer', '⏱ Timer URL1'],
    try:       ['btn-clear-try', 'try',       '🖱 Clic try'],
    exten:     ['btn-clear-ext', 'exten',     '🤖 Clic ext.'],
    check1:    ['btn-clear-ck1', 'check1',    '🟩 Zone vérif'],
    validate:  ['btn-clear-val', 'validate',  '✅ Clic valider'],
    check2:    ['btn-clear-ck2', 'check2',    '📋 Zone résultat'],
  };
  const [btnId, tagId, emptyLabel] = map[which];

  if      (which === 'pre')       ptPre       = null;
  else if (which === 'pre_timer') selPreTimer = null;
  else if (which === 'try')       ptTry       = null;
  else if (which === 'exten')     ptExten     = null;
  else if (which === 'check1')    selCheck1   = null;
  else if (which === 'validate')  ptValidate  = null;
  else                            selCheck2   = null;

  setTag(tagId, emptyLabel, true);
  document.getElementById(btnId).style.display = 'none';
  redraw();
  refreshLaunch();
  LS.save();
}

function resetAll() {
  ptPre = selPreTimer = ptTry = ptExten = selCheck1 = ptValidate = selCheck2 = bgImg = bgImg1 = bgImg2 = null;
  cv.width  = 0;
  cv.height = 0;

  ['canvas-wrap', 'mode-row', 'zones-row', 'view-toggle'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
  ['btn-clear-pre', 'btn-clear-pt1', 'btn-clear-try', 'btn-clear-ext', 'btn-clear-ck1', 'btn-clear-val', 'btn-clear-ck2'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });

  document.getElementById('btn-launch').disabled = true;
  setInfo('');
}

/* ============================================================
   HELPERS
   ============================================================ */
function show(id)                        { document.getElementById(id).style.display = 'block'; }
function setInfo(msg)                    { document.getElementById('info-bar').textContent = msg; }
function refreshLaunch()                 { document.getElementById('btn-launch').disabled = !ptTry?.sx; }

function setTag(which, text, empty = false) {
  const el = document.getElementById('tag-' + which);
  el.textContent = text;
  el.classList.toggle('empty', empty);
}

/* ============================================================
   LANCEMENT
   ============================================================ */
async function launch() {
  const url    = document.getElementById('url-input').value.trim();
  const urlPre = document.getElementById('url-pre').value.trim();

  if (!url)       { alert('Entrez une URL (URL 2).'); return; }
  if (!ptTry?.sx) { alert('Définissez au moins le clic try sur URL 2.'); return; }
  LS.save();

  const delay = parseInt(document.getElementById('delay').value);
  const dpre  = parseFloat(document.getElementById('delay-pre').value);
  const dc    = parseFloat(document.getElementById('delay-click').value);
  const dext  = parseFloat(document.getElementById('delay-exten').value);
  const dfok  = parseFloat(document.getElementById('delay-final-ok').value);
  const drr   = parseInt(document.getElementById('delay-retry').value) * 60;

  document.getElementById('status-panel').style.display = 'block';
  document.getElementById('result-panel').style.display = 'none';
  setLiveStatus('running', `Ouverture… attente ${delay}s puis clics.`);

  const pollTimer = setInterval(async () => {
    try {
      const status = await (await fetch('/status')).json();
      _liveState = status.state;
      if (status.state === 'waiting' && status.wait_until > 0) {
        _waitUntil = status.wait_until;
        setLiveStatus('waiting', status.msg);
      } else {
        if (status.state !== 'waiting') _waitUntil = 0;
        setLiveStatus(status.state, status.msg);
      }
    } catch {}
  }, 3000);

  // Construction du body
  const body = { url, delay, delay_pre: dpre, delay_click: dc, delay_exten: dext, delay_final_ok: dfok, delay_retry: drr, monitor: selMon };
  if (urlPre)                        body.url_pre          = urlPre;
  if (ptPre?.sx      !== undefined)  body.point_pre        = { x: ptPre.sx,      y: ptPre.sy };
  if (selPreTimer?.sx !== undefined) body.region_pre_timer = { x: selPreTimer.sx, y: selPreTimer.sy, w: selPreTimer.sw, h: selPreTimer.sh };
  if (ptTry?.sx      !== undefined)  body.point_try        = { x: ptTry.sx,      y: ptTry.sy };
  if (ptExten?.sx    !== undefined)  body.point_exten      = { x: ptExten.sx,    y: ptExten.sy };
  if (selCheck1?.sx  !== undefined)  body.region_check1    = { x: selCheck1.sx,  y: selCheck1.sy,  w: selCheck1.sw,  h: selCheck1.sh };
  if (ptValidate?.sx !== undefined)  body.point_validate   = { x: ptValidate.sx, y: ptValidate.sy };
  if (selCheck2?.sx  !== undefined)  body.region_check2    = { x: selCheck2.sx,  y: selCheck2.sy,  w: selCheck2.sw,  h: selCheck2.sh };

  let data = null;
  try {
    const res = await fetch('/launch', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    clearInterval(pollTimer);

    if (!res.ok && res.status !== 200) {
      let errMsg = `Erreur serveur (${res.status})`;
      try { const e = await res.json(); if (e.error) errMsg = e.error; } catch {}
      setLiveStatus('idle', `⚠ ${errMsg}`);
      return;
    }
    data = await res.json();
  } catch (err) {
    clearInterval(pollTimer);
    setLiveStatus('idle', `⚠ Erreur réseau : ${err.message}`);
    return;
  } finally {
    clearInterval(pollTimer);
  }

  _liveState = 'idle';
  _waitUntil = 0;
  setLiveStatus('idle', 'Terminé');
  document.getElementById('timer-card').classList.remove('visible');
  document.getElementById('result-panel').style.display = 'block';
  document.getElementById('result-text').textContent    = `${data.cycles || 0}`;

  const statusMap = {
    success: `<span style="color:var(--green);font-weight:bold">✓ Vote réussi !</span>`,
    timer:   `<span style="color:var(--gold)">⏳ Timer détecté — attente imposée</span>`,
    unknown: `<span style="color:var(--muted)">? Arrêté manuellement</span>`,
  };
  const cyclesSuffix = (data.cycles || 0) > 1
    ? ` <span style="color:var(--muted);font-size:.78rem">— ${data.cycles} cycle(s)</span>`
    : '';
  document.getElementById('status-msg').innerHTML =
    (statusMap[data.status] || `<span style="color:var(--muted)">${data.status}</span>`) + cyclesSuffix;

  recordResult(data);
}

function setLiveStatus(state, msg) {
  document.getElementById('status-dot').className    = 'status-dot dot-' + state;
  document.getElementById('status-text').textContent = msg;
}

/* ============================================================
   TIMER (affiché pendant l'attente entre votes)
   ============================================================ */
function _fmtRemaining(secs) {
  if (secs <= 0) return '00:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

function _tickTimer() {
  const card     = document.getElementById('timer-card');
  const bigEl    = document.getElementById('timer-big');
  const targetEl = document.getElementById('timer-target');
  const cycleEl  = document.getElementById('timer-cycle');
  const cdEl     = document.getElementById('countdown');

  if (_waitUntil > 0) {
    const remaining = Math.max(0, Math.round(_waitUntil - Date.now() / 1000));
    const fmt       = _fmtRemaining(remaining);

    cdEl.textContent    = fmt;
    cdEl.style.display  = 'block';
    card.classList.add('visible');
    bigEl.textContent   = fmt;
    targetEl.textContent = `Prochain vote à ${new Date(_waitUntil * 1000).toLocaleTimeString('fr-FR')}`;

    const statusText = document.getElementById('status-text').textContent;
    const icon       = _liveState === 'waiting' ? '⏸' : '▶';
    cycleEl.innerHTML = statusText ? `<span>${icon}</span> ${statusText}` : '';

  } else {
    cdEl.style.display = 'none';

    if (_liveState === 'idle') {
      card.classList.remove('visible');
    } else if (_liveState === 'running') {
      card.classList.add('visible');
      bigEl.textContent    = '—';
      targetEl.textContent = '';
      cycleEl.innerHTML    = `<span>▶</span> ${document.getElementById('status-text').textContent}`;
    }
  }
}

setInterval(_tickTimer, 1000);

/* ============================================================
   INITIALISATION
   ============================================================ */
LS.loadSettings();
renderDashboard();
loadMonitors().then(() => tryLoadLastScreenshot());

['url-input', 'url-pre'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => LS.save());
});
['delay', 'delay-pre', 'delay-click', 'delay-exten', 'delay-retry', 'delay-final-ok'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => LS.save());
});