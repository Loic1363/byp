"use strict";

/* ============================================================
   CONFIG
   ============================================================ */
const VF_PASSWORD     = "admin";
const VF_REQUIRE_LOGIN = true;

/* ============================================================
   PALETTE & TOKENS
   ============================================================ */
const COLOR = {
  gold:       '#9F7420',
  goldDark:   '#876019',
  brand:      '#8A6519',
  amber:      '#D6A845',
  danger:     '#A1421F',
  cream:      '#FAF7F0',
  chip:       '#F1ECDF',
  goldLight:  '#E7DCC2',
  empty:      '#efece4',
  text:       '#211c12',
  textMid:    '#4a4434',
  muted:      '#7d7464',
  muted2:     '#9a9078',
  faint:      '#bdb39a',
  faint2:     '#a99a76',
  border:     '#e2dcce',
  borderSoft: '#f3efe5',
};

const LOG_COLOR = {
  info:    '#9ba3b4',
  success: '#3fb950',
  warn:    '#d29922',
  error:   '#f85149',
  sys:     '#d6a45a',
};

const LOG_TAG = {
  info:    'INFO',
  success: 'OK',
  warn:    'WARN',
  error:   'ERR',
  sys:     'SYS',
};

const STATUS_META = {
  running: { label: 'En cours',   color: '#067647', dot: '#10b981' },
  waiting: { label: 'En attente', color: '#9a7b1e', dot: '#D6A845' },
  idle:    { label: 'Arrêté',     color: '#9a9078', dot: '#c1b59a' },
};

/* ============================================================
   ZONES PAR DÉFAUT
   ============================================================ */
const ZONES_DEFAULT = [
  { id: 'decompte', name: 'Zone décompte global', type: 'zone',  page: 'url1', x: 5,  y: 6,  w: 24, h: 13 },
  { id: 'preetape', name: 'Clic pré-étape',       type: 'click', page: 'url1', x: 40, y: 22 },
  { id: 'timer1',   name: 'Zone Timer URL 1',     type: 'zone',  page: 'url1', x: 60, y: 7,  w: 22, h: 13 },
  { id: 'try',      name: 'Clic try',             type: 'click', page: 'url2', x: 24, y: 30 },
  { id: 'ext',      name: 'Clic extension',       type: 'click', page: 'url2', x: 50, y: 30 },
  { id: 'captcha',  name: 'Zone vérif captcha',   type: 'zone',  page: 'url2', x: 30, y: 42, w: 38, h: 28 },
  { id: 'valider',  name: 'Clic valider',         type: 'click', page: 'url2', x: 45, y: 82 },
  { id: 'resultat', name: 'Zone résultat',        type: 'zone',  page: 'url2', x: 55, y: 74, w: 32, h: 18 },
];

/* ============================================================
   DÉFINITIONS DES DÉLAIS
   ============================================================ */
const DELAY_DEFS = [
  { key: 'url1',   label: 'Chargement URL 1',         desc: 'Attente après ouverture de la première page',     min: 0, max: 20,  step: 0.5, unit: 's'   },
  { key: 'url2',   label: 'Chargement URL 2',         desc: 'Attente après ouverture de la page de vote',      min: 0, max: 10,  step: 0.5, unit: 's'   },
  { key: 'try',    label: 'Délai try',                desc: 'Pause avant chaque tentative de vote',            min: 0, max: 10,  step: 0.5, unit: 's'   },
  { key: 'ext',    label: 'Délai extension',          desc: "Temps laissé à l'extension pour s'initialiser",  min: 0, max: 10,  step: 0.5, unit: 's'   },
  { key: 'wait',   label: 'Attente du prochain vote', desc: 'Intervalle entre deux votes consécutifs',         min: 0, max: 150, step: 1,   unit: 'min' },
  { key: 'result', label: 'Délai résultat',           desc: 'Attente de la confirmation du serveur',           min: 0, max: 10,  step: 0.5, unit: 's'   },
  { key: 'error',  label: 'Délai error',              desc: 'Pause avant relance après une erreur',            min: 0, max: 10,  step: 0.5, unit: 's'   },
];

/* ============================================================
   NAVIGATION
   ============================================================ */
const NAV_ITEMS = [
  { key: 'demarrage', label: 'Démarrage',     icon: '▷' },
  { key: 'dashboard', label: "Vue d'ensemble", icon: '▦' },
  { key: 'terminal',  label: 'Terminal',       icon: '▤' },
  { key: 'settings',  label: 'Réglages',       icon: '⚙' },
];

/* ============================================================
   BACKEND — toutes les routes Flask en un seul endroit
   ============================================================ */
const Backend = {
  _es: null,
  _replaying: false,
  _statusInt: null,

  connectLogStream() {
    try {
      this._es = new EventSource('/stream');
      this._replaying = true;
      setTimeout(() => { this._replaying = false; }, 2000);
      this._es.addEventListener('log',         (e) => App.onLog(e.data));
      this._es.addEventListener('message_img', ()  => App.onMessageImg());
      this._es.onmessage = (e) => App.onLog(e.data);
      this._es.onerror   = () => {};
    } catch (err) {
      console.warn('SSE indisponible', err);
    }
  },

  startStatusPolling() {
    const poll = () =>
      fetch('/status', { cache: 'no-store' })
        .then(r => r.json())
        .then(j => App.onStatus(j))
        .catch(() => App.onStatus(null));
    poll();
    this._statusInt = setInterval(poll, 2000);
  },

  async launch() {
    const body = await buildLaunchPayload();
    return fetch('/launch', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    }).catch(() => {});
  },

  stop()     { return fetch('/stop',      { method: 'POST' }).catch(() => {}); },
  skip()     { return fetch('/skip_wait', { method: 'POST' }).catch(() => {}); },

  monitors() {
    return fetch('/monitors', { cache: 'no-store' })
      .then(r => r.json())
      .catch(() => []);
  },

  loadConfig() {
    return fetch('/config', { cache: 'no-store' })
      .then(r => r.json())
      .catch(() => null);
  },

  saveConfig(config) {
    fetch('/config', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(config),
    }).catch(() => {});
  },

  screenshot(which) {
    return fetch('/screenshot', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ which }),
    }).catch(() => {});
  },

  imageUrl(which) {
    return `/img/screenshot?which=${encodeURIComponent(which)}&_t=${Date.now()}`;
  },
};

/* ============================================================
   CLASSIFICATION DES LOGS
   ============================================================ */
function classifyLog(text) {
  const t = (text || '').toLowerCase();
  if (/(erreur|error|échou|echou|fail|rejet|exception|invalide|✗|❌)/.test(t)) return 'error';
  if (/(succès|succes|success|validé|valide|réussi|reussi|soumis|ok\b|http 200|✓|✅)/.test(t)) return 'success';
  if (/(warn|timeout|attente|retry|tentative|attention|relance|⚠)/.test(t))                     return 'warn';
  if (/(proxy|polling|rotation|\bsys\b|thread|lock|monitor)/.test(t))                            return 'sys';
  return 'info';
}

function voteOutcome(text) {
  return /vote.*✅/i.test(text || '') ? 'success' : null;
}

function captchaOutcome(text) {
  if (/Zone captcha.*✅/.test(text || '')) return 'solved';
  if (/Zone captcha.*❌/.test(text || '')) return 'failed';
  return null;
}

/* ============================================================
   PERSISTANCE (localStorage)
   ============================================================ */
const Store = {
  get(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function recordVote(outcome) {
  const votes = Store.get('vf_votes', {});
  const key   = todayKey();
  votes[key]  = votes[key] || { s: 0, f: 0 };

  if (outcome === 'success') votes[key].s++;
  else                       votes[key].f++;
  Store.set('vf_votes', votes);

  const hrs = Store.get('vf_hours', { date: key, h: new Array(24).fill(0) });
  if (hrs.date !== key) { hrs.date = key; hrs.h = new Array(24).fill(0); }
  if (outcome === 'success') hrs.h[new Date().getHours()]++;
  Store.set('vf_hours', hrs);
}

/* ============================================================
   CONSTRUCTION DU PAYLOAD /launch
   ============================================================ */
async function buildLaunchPayload() {
  const st     = App.state;
  const urls   = Store.get('vf_urls',   st.urls);
  const delays = Store.get('vf_delays', st.delays);

  // Toujours relire la config serveur pour que les changements de config.json soient pris en compte
  const serverConfig = await fetch('/config', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  if (serverConfig) App._applyServerConfig(serverConfig);

  const zones    = App.state.defaultZones || App.state.zones;
  const monitors = await fetch('/monitors', { cache: 'no-store' }).then(r => r.json()).catch(() => []);
  const monitor  = monitors[0] || { width: 1920, height: 1080, index: 0 };
  const W = monitor.width;
  const H = monitor.height;

  // Helpers : convertir les % de zone en pixels
  const findZone = (id) => zones.find(z => z.id === id) || { x: 50, y: 50, w: 10, h: 10 };
  const toPoint  = (id) => { const z = findZone(id); return { x: Math.round(z.x / 100 * W), y: Math.round(z.y / 100 * H) }; };
  const toRegion = (id) => {
    const z = findZone(id);
    return {
      x: Math.round(z.x / 100 * W),
      y: Math.round(z.y / 100 * H),
      w: Math.round((z.w || 10) / 100 * W),
      h: Math.round((z.h || 10) / 100 * H),
    };
  };

  return {
    url:              urls.url2 || '',
    url_pre:          urls.url1 || '',
    point_pre:        toPoint('preetape'),
    delay_pre:        delays.url1,
    region_pre_timer: toRegion('timer1'),
    region_decompte:  toRegion('decompte'),
    point_try:        toPoint('try'),
    point_exten:      toPoint('ext'),
    region_check1:    toRegion('captcha'),
    point_validate:   toPoint('valider'),
    region_check2:    toRegion('resultat'),
    delay:            delays.url2,
    delay_click:      delays.try,
    delay_exten:      delays.ext,
    delay_final_ok:   delays.result,
    delay_retry:      Math.round(delays.wait  * 60),
    delay_error:      Math.round(delays.error * 60),
    monitor:          monitor.index || 0,
  };
}

/* ============================================================
   UTILITAIRES
   ============================================================ */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fmtNumber(n) {
  return (n == null ? 0 : Math.round(n)).toLocaleString('fr-FR');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function nowClock() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function fmtTimer(seconds) {
  seconds = Math.floor(seconds) || 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

function fmtDelay(value, unit) {
  if (unit === 'min') return `${value} min`;
  return Number.isInteger(value) ? `${value},0 s` : `${String(value).replace('.', ',')} s`;
}

/* ============================================================
   DONNÉES DU DASHBOARD (depuis localStorage)
   ============================================================ */
function rangeData(state) {
  const votes = Store.get('vf_votes', {});
  const hrs   = Store.get('vf_hours', { date: todayKey(), h: new Array(24).fill(0) });
  const now   = new Date();

  const dayTotal = (key) => { const v = votes[key]; return v ? v.s + v.f : 0; };
  const dayKeyOffset = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };

  const todayCount = dayTotal(todayKey());
  let series, total, title, xlabels, curIdx, days, successSum = 0;

  if (state.range === 'jour') {
    series      = (hrs.date === todayKey() ? hrs.h : new Array(24).fill(0)).slice();
    total       = series.reduce((a, b) => a + b, 0);
    successSum  = total;
    title       = "Aujourd'hui · par heure";
    xlabels     = ['00h', '06h', '12h', '18h', '23h'];
    curIdx      = now.getHours();
    days        = 1;

  } else if (state.range === 'mois') {
    series = [];
    let s = 0, f = 0;
    for (let i = 29; i >= 0; i--) {
      const v = votes[dayKeyOffset(i)] || { s: 0, f: 0 };
      series.push(v.s + v.f);
      s += v.s; f += v.f;
    }
    total      = s + f;
    successSum = s;
    title      = '30 derniers jours';
    xlabels    = ['-30j', '-20j', '-10j', 'auj.'];
    curIdx     = series.length - 1;
    days       = 30;

  } else if (state.range === 'toujours') {
    const months = {};
    Object.keys(votes).forEach(k => {
      const m = k.slice(0, 7);
      months[m] = (months[m] || 0) + votes[k].s + votes[k].f;
    });
    const MONTH_NAMES = ['jan', 'fév', 'mar', 'avr', 'mai', 'jui', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
    series = [];
    let s = 0, f = 0;
    for (let i = 11; i >= 0; i--) {
      const d   = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
      series.push(months[key] || 0);
    }
    Object.keys(votes).forEach(k => { s += votes[k].s; f += votes[k].f; });
    total      = s + f;
    successSum = s;
    title      = '12 derniers mois';
    xlabels    = [];
    const currentMonth = now.getMonth();
    for (let i = 11; i >= 0; i -= 3) xlabels.push(MONTH_NAMES[(currentMonth - i + 12) % 12]);
    curIdx = series.length - 1;
    days   = 365;

  } else {
    // semaine (défaut)
    const DAY_NAMES = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    series = [];
    let s = 0, f = 0;
    for (let i = 6; i >= 0; i--) {
      const v = votes[dayKeyOffset(i)] || { s: 0, f: 0 };
      series.push(v.s + v.f);
      s += v.s; f += v.f;
    }
    total      = s + f;
    successSum = s;
    title      = '7 derniers jours';
    xlabels    = [];
    const today = now.getDay();
    for (let i = 6; i >= 0; i--) xlabels.push(DAY_NAMES[(today - i + 7) % 7]);
    curIdx = series.length - 1;
    days   = 7;
  }

  return { series, total, success: successSum, title, xlabels, curIdx, days, todayCount };
}

/* ============================================================
   GRAPHES
   ============================================================ */
function computePoints(data, max, W, H, padding) {
  const n = data.length;
  return data.map((value, i) => {
    const x = padding + (W - 2 * padding) * (n === 1 ? 0.5 : i / (n - 1));
    const y = H - padding - (H - 2 * padding) * (value / max);
    return [x, y];
  });
}

function smoothPath(points) {
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C ${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`;
  }
  return d;
}

function buildChart(style, series, curIdx, W, H) {
  if (!series.length) series = [0];

  const GOLD       = COLOR.gold;
  const GOLD_LIGHT = COLOR.goldLight;
  const EMPTY      = COLOR.empty;
  const STEM       = '#D8C9A6';
  const dataMax    = Math.max(1, ...series);
  const max        = dataMax * 1.12;

  // --- Graphes en barres / cellules ---
  const BAR_STYLES = ['bars', 'finebars', 'lollipop', 'cells', 'stacked'];
  if (BAR_STYLES.includes(style)) {
    const gap  = style === 'cells' ? 8 : style === 'finebars' ? 14 : 6;
    const align = style === 'cells' ? 'center' : 'flex-end';
    const items = series.map((v, i) => {
      const isCurrent = i === curIdx;
      const heightPct = `${(v / max * 100).toFixed(1)}%`;
      const barColor  = v === 0 ? EMPTY : (isCurrent ? GOLD : GOLD_LIGHT);

      if (style === 'bars') {
        return `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%">
          <div style="border-radius:3px 3px 0 0;min-height:3px;height:${heightPct};background:${barColor}"></div>
        </div>`;
      }

      if (style === 'finebars') {
        const labelColor = isCurrent ? GOLD : COLOR.faint;
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
          <div class="mono" style="font-size:10px;font-weight:600;color:${labelColor};margin-bottom:5px">${v}</div>
          <div style="width:5px;border-radius:3px;min-height:3px;height:${heightPct};background:${barColor}"></div>
        </div>`;
      }

      if (style === 'lollipop') {
        const shadow = isCurrent ? 'rgba(159,116,32,.18)' : 'rgba(216,201,166,.3)';
        const dotBg  = isCurrent ? GOLD : GOLD_LIGHT;
        const stemBg = isCurrent ? GOLD : STEM;
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%">
          <div style="width:2px;min-height:3px;height:${heightPct};background:${stemBg}"></div>
          <div style="width:11px;height:11px;border-radius:50%;background:${dotBg};margin-top:-2px;box-shadow:0 0 0 3px ${shadow}"></div>
        </div>`;
      }

      if (style === 'cells') {
        const t   = v / dataMax;
        const a   = [241, 236, 223];
        const b   = [159, 116, 32];
        const rgb = a.map((x, k) => Math.round(x + (b[k] - x) * t));
        const labelColor = t > 0.55 ? '#fff' : COLOR.muted;
        return `<div style="flex:1;display:flex;align-items:center">
          <div style="width:100%;aspect-ratio:1;border-radius:9px;background:rgb(${rgb.join(',')});display:flex;align-items:center;justify-content:center;font:600 13px IBM Plex Sans,sans-serif;color:${labelColor}">${v}</div>
        </div>`;
      }

      // stacked
      const ok   = Math.round(v * 0.9);
      const fail = v - ok;
      return `<div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%">
        <div style="border-radius:3px 3px 0 0;min-height:${fail > 0 ? 2 : 0}px;height:${(fail / max * 100).toFixed(1)}%;background:#e0a366"></div>
        <div style="min-height:3px;height:${(ok / max * 100).toFixed(1)}%;background:${GOLD}"></div>
      </div>`;
    });

    return `<div style="display:flex;align-items:${align};gap:${gap}px;flex:1;min-height:0">${items.join('')}</div>`;
  }

  // --- Graphes vectoriels (SVG) ---
  const PAD     = 12;
  const points  = computePoints(series, max, W, H, PAD);
  const wrapSvg = (inner) =>
    `<div style="flex:1;min-height:0;position:relative">
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" style="position:absolute;inset:0">${inner}</svg>
    </div>`;

  if (style === 'area') {
    const linePath = smoothPath(points);
    const areaPath = `${linePath} L ${points[points.length - 1][0]} ${H - PAD} L ${points[0][0]} ${H - PAD} Z`;
    return wrapSvg(`
      <defs>
        <linearGradient id="og" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#9F7420" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#9F7420" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#og)"/>
      <path d="${linePath}" fill="none" stroke="#9F7420" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    `);
  }

  if (style === 'line') {
    const linePath = smoothPath(points);
    const gridLines = Array.from({ length: 4 }, (_, g) => {
      const y = PAD + (H - 2 * PAD) * g / 3;
      return `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#efece4" stroke-width="1"/>`;
    }).join('');
    const dots = points.map((p, i) => {
      const r    = i === curIdx ? 5 : 3.5;
      const fill = i === curIdx ? '#9F7420' : '#fff';
      return `<circle cx="${p[0]}" cy="${p[1]}" r="${r}" fill="${fill}" stroke="#9F7420" stroke-width="2"/>`;
    }).join('');
    return wrapSvg(`${gridLines}<path d="${linePath}" fill="none" stroke="#9F7420" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}`);
  }

  if (style === 'step') {
    let stepPath = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
      stepPath += ` L ${points[i][0]} ${points[i - 1][1]} L ${points[i][0]} ${points[i][1]}`;
    }
    const areaPath = `${stepPath} L ${points[points.length - 1][0]} ${H - PAD} L ${points[0][0]} ${H - PAD} Z`;
    return wrapSvg(`
      <defs>
        <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#9F7420" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="#9F7420" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      <path d="${areaPath}" fill="url(#sg)"/>
      <path d="${stepPath}" fill="none" stroke="#9F7420" stroke-width="2.5" stroke-linejoin="round"/>
    `);
  }

  // Cumul (barres + courbe cumulative)
  let running = 0;
  const cumulative = series.map(v => (running += v));
  const cumulMax   = Math.max(1, running) * 1.05;
  const cumPoints  = computePoints(cumulative, cumulMax, W, H, PAD);
  const cumPath    = smoothPath(cumPoints);
  const cumDots    = cumPoints.map((p, i) =>
    `<circle cx="${p[0]}" cy="${p[1]}" r="${i === curIdx ? 4.5 : 3}" fill="#9F7420"/>`
  ).join('');
  const bars = series.map(v =>
    `<div style="flex:1;border-radius:3px 3px 0 0;min-height:3px;height:${(v / max * 100).toFixed(1)}%;background:${GOLD_LIGHT}"></div>`
  ).join('');

  return `<div style="flex:1;min-height:0;position:relative">
    <div style="position:absolute;inset:0;display:flex;align-items:flex-end;gap:6px">${bars}</div>
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" style="position:absolute;inset:0">
      <path d="${cumPath}" fill="none" stroke="#9F7420" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${cumDots}
    </svg>
  </div>`;
}

function ringGoal(count, goal, tiers) {
  const RADIUS      = 46;
  const circumference = 2 * Math.PI * RADIUS;
  const pct         = clamp(count / goal, 0, 1);

  const markers = tiers.map(v => {
    const angle = (-90 + 360 * (v / goal)) * Math.PI / 180;
    const x     = (60 + RADIUS * Math.cos(angle)).toFixed(1);
    const y     = (60 + RADIUS * Math.sin(angle)).toFixed(1);
    const filled = count >= v;
    return `<circle cx="${x}" cy="${y}" r="4.5"
      fill="${filled ? '#9F7420' : '#fff'}"
      stroke="${filled ? '#9F7420' : '#D8C9A6'}"
      stroke-width="2"/>`;
  }).join('');

  return `<svg viewBox="0 0 120 120" width="120" height="120">
    <circle cx="60" cy="60" r="${RADIUS}" fill="none" stroke="#F1ECDF" stroke-width="9"/>
    <g transform="rotate(-90 60 60)">
      <circle cx="60" cy="60" r="${RADIUS}" fill="none" stroke="#9F7420" stroke-width="9"
        stroke-linecap="round"
        stroke-dasharray="${circumference.toFixed(1)}"
        stroke-dashoffset="${(circumference * (1 - pct)).toFixed(1)}"/>
    </g>
    ${markers}
  </svg>`;
}

/* ============================================================
   VUES HTML
   ============================================================ */

function viewLogin() {
  return `
    <div style="height:100vh;display:flex">
      <div style="flex:1;background:#fff;overflow:hidden;display:flex">

        <!-- Panneau gauche -->
        <div style="width:460px;background:${COLOR.brand};color:#f6efdf;padding:52px 48px;display:flex;flex-direction:column;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:30px;height:30px;border-radius:8px;background:#f6efdf;color:${COLOR.brand};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px">V</div>
            <span style="font-weight:600;font-size:18px;letter-spacing:-.01em">VoteFlow</span>
          </div>
          <div>
            <div style="font-size:30px;font-weight:700;line-height:1.15;letter-spacing:-.02em">Votre console<br>de vote, en local.</div>
            <div style="font-size:14px;color:#e6d6b2;margin-top:14px;line-height:1.5;max-width:320px">
              Suivi en temps réel, terminal intégré et résolution de captchas — sur votre réseau, rien que pour vous.
            </div>
          </div>
          <div class="mono" style="font-size:11px;color:#d8c08a">accès local · session</div>
        </div>

        <!-- Panneau droit -->
        <div style="flex:1;display:flex;align-items:center;justify-content:center;background:${COLOR.cream}">
          <div style="width:320px">
            <div style="font-size:22px;font-weight:700;color:${COLOR.text}">Connexion</div>
            <div style="font-size:13px;color:${COLOR.muted};margin-top:5px;margin-bottom:26px">
              Entrez votre mot de passe pour déverrouiller la console.
            </div>

            <label style="font-size:12px;font-weight:600;color:${COLOR.textMid};display:block;margin-bottom:7px">Mot de passe</label>
            <div style="display:flex;align-items:center;gap:8px;border:1px solid ${COLOR.border};border-radius:9px;padding:0 12px;background:#fff;height:44px">
              <span style="color:#b3a98f;font-size:14px">🔒</span>
              <input id="vf-pwd" type="password" placeholder="••••••••"
                onkeydown="if(event.key==='Enter') App.act('login')"
                style="border:none;outline:none;flex:1;font:400 14px IBM Plex Sans,sans-serif;color:${COLOR.text};background:transparent">
            </div>
            <div id="vf-pwd-err" style="display:none;color:#cf6679;font-size:12px;margin-top:8px">Mot de passe incorrect</div>

            <button data-action="login"
              style="margin-top:20px;width:100%;height:46px;border:none;border-radius:9px;background:${COLOR.gold};color:#fff;font:600 15px IBM Plex Sans,sans-serif;cursor:pointer;box-shadow:0 8px 20px -8px rgba(159,116,32,.7)">
              Déverrouiller →
            </button>
            <div class="mono" style="font-size:11px;color:${COLOR.faint};margin-top:22px;text-align:center">accès réservé · réseau local</div>
          </div>
        </div>

      </div>
    </div>`;
}

function sidebar(state) {
  const items = NAV_ITEMS.map(({ key, label, icon }) => {
    const isActive = state.view === key;
    return `<button data-action="nav" data-arg="${key}"
      style="display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:9px;border:none;cursor:pointer;text-align:left;width:100%;font:600 13px IBM Plex Sans,sans-serif;margin-bottom:4px;
             background:${isActive ? '#fff' : 'transparent'};
             color:${isActive ? COLOR.goldDark : COLOR.muted};
             box-shadow:${isActive ? '0 1px 2px rgba(60,48,20,.1)' : 'none'}">
      <span style="font-size:14px">${icon}</span>${label}
    </button>`;
  }).join('');

  return `
    <div style="width:212px;background:${COLOR.cream};border-right:1px solid rgba(60,48,20,.08);padding:20px 16px;display:flex;flex-direction:column;flex-shrink:0">
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:26px;padding:0 4px">
        <div style="width:26px;height:26px;border-radius:7px;background:${COLOR.gold};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px">V</div>
        <span style="font-weight:600;font-size:16px;color:${COLOR.text}">VoteFlow</span>
      </div>
      ${items}
      <div style="margin-top:auto">
        <button data-action="lock"
          style="width:100%;height:32px;border:1px solid ${COLOR.border};background:${COLOR.cream};border-radius:7px;font:600 12px IBM Plex Sans,sans-serif;color:${COLOR.muted};cursor:pointer">
          🔒 Verrouiller
        </button>
      </div>
    </div>`;
}

function currentView(state) {
  if (state.view === 'demarrage') return viewDemarrage(state);
  if (state.view === 'dashboard') return viewDashboard(state);
  if (state.view === 'terminal')  return viewTerminal(state);
  if (state.view === 'settings')  return viewSettings(state);
  return '';
}

function viewDemarrage(state) {
  const C = 2 * Math.PI * 130;

  const btnStart = (id, action, svgPath, label, bg, fg, border) => `
    <button id="${id}" data-action="${action}"
      style="display:flex;align-items:center;gap:8px;height:46px;padding:0 20px;border-radius:10px;border:1px solid ${border};background:${bg};color:${fg};font:600 14px IBM Plex Sans,sans-serif;cursor:pointer">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">${svgPath}</svg>
      ${label}
    </button>`;

  const freezeLabel = state.frozen ? 'Reprendre' : 'Freeze';
  const freezeBg    = state.frozen ? COLOR.amber  : '#fff';
  const freezeFg    = state.frozen ? '#fff'       : COLOR.goldDark;

  return `
    <div style="flex:1;min-height:0;display:flex;flex-direction:column;padding:26px 30px">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:8px">
        <div>
          <div style="font-size:21px;font-weight:700;color:${COLOR.text}">Démarrage</div>
          <div style="font-size:13px;color:${COLOR.muted2};margin-top:3px">Pilotage du worker de vote</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid rgba(60,48,20,.12);border-radius:999px;padding:7px 14px">
          <span data-status-dot style="width:8px;height:8px;border-radius:50%;background:#c1b59a;animation:livepulse 1.8s infinite"></span>
          <span data-status-label style="font-size:13px;font-weight:600;color:${COLOR.muted2}">—</span>
        </div>
      </div>

      <div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px">
        <!-- Anneau timer -->
        <div style="position:relative;width:290px;height:290px">
          <svg viewBox="0 0 290 290" width="290" height="290">
            <circle cx="145" cy="145" r="130" fill="none" stroke="#F1ECDF" stroke-width="12"/>
            <g transform="rotate(-90 145 145)">
              <circle id="timer-ring-fg" cx="145" cy="145" r="130" fill="none" stroke="#cbbfa3" stroke-width="12"
                stroke-linecap="round"
                stroke-dasharray="${C.toFixed(1)}"
                stroke-dashoffset="${C.toFixed(1)}"/>
            </g>
          </svg>
          <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:visible">
            <div class="mono" style="font-size:11px;color:${COLOR.muted2};letter-spacing:.1em;text-transform:uppercase">Prochain vote</div>
            <div id="timer-text" class="mono" style="font-weight:600;font-size:46px;color:${COLOR.text};line-height:1.1;white-space:nowrap">--:--</div>
          </div>
        </div>

        <!-- Boutons -->
        <div style="display:flex;gap:12px">
          ${btnStart('btn-start',  'start',        '<polygon points="6 4 20 12 6 20 6 4"/>',                                    'Start',   '#fff',        COLOR.gold,    '#fff')}
          ${btnStart('btn-freeze', 'toggleFreeze', '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>', freezeLabel, freezeBg, freezeFg, COLOR.amber)}
          ${btnStart('btn-skip',   'skip',         '<polygon points="5 4 15 12 5 20 5 4"/><rect x="17" y="4" width="3" height="16" rx="1"/>', 'Skip', '#fff', COLOR.textMid, COLOR.border)}
          ${btnStart('btn-stop',   'stop',         '<rect x="5" y="5" width="14" height="14" rx="2"/>',                        'Stop',    '#fff',        COLOR.danger,  '#e3b6a6')}
        </div>
      </div>
    </div>`;
}

function viewDashboard(state) {
  const d           = rangeData(state);
  const total       = d.total;
  const success     = Math.round(d.success);
  const fail        = total - success;
  const rate        = total ? (success / total * 100).toFixed(1) : '0.0';
  const cap         = state.capCount;
  const capTotal    = cap.solved + cap.failed;
  const capRate     = capTotal ? (cap.solved / capTotal * 100) : 0;
  const perDay      = (total / d.days).toFixed(d.days === 1 ? 0 : 1);

  const avgDelay    = (() => {
    const dd = state.delays;
    return ((dd.url1 || 0) + (dd.url2 || 0) + (dd.try || 0) + (dd.ext || 0) + (dd.result || 0)).toFixed(1) + 's';
  })();

  const GOAL        = 8;
  const TIERS       = [1, 2, 4, 6, 7, 8];
  const todayCount  = Math.min(GOAL, d.todayCount);
  const nextTier    = TIERS.find(v => v > todayCount);
  const goalNote    = nextTier
    ? `${nextTier - todayCount} vote(s) → palier ${nextTier}/8`
    : 'Tous les paliers atteints ✓';

  const goalRing = ringGoal(todayCount, GOAL, TIERS);

  const pills = TIERS.map(v => {
    const filled = todayCount >= v;
    return `<div style="flex:1;text-align:center;padding:5px 0;border-radius:7px;font:600 11px IBM Plex Mono,monospace;
      border:1px solid ${filled ? COLOR.gold : COLOR.border};
      background:${filled ? COLOR.gold : COLOR.cream};
      color:${filled ? '#fff' : COLOR.faint2}">${v}/8</div>`;
  }).join('');

  const rangeButtons = [['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois'], ['toujours', 'Depuis toujours']]
    .map(([key, label]) => {
      const isActive = state.range === key;
      return `<button data-action="range" data-arg="${key}"
        style="padding:7px 14px;border:none;border-radius:7px;cursor:pointer;font:600 12px IBM Plex Sans,sans-serif;
               background:${isActive ? '#fff' : 'transparent'};
               color:${isActive ? COLOR.goldDark : COLOR.muted2};
               box-shadow:${isActive ? '0 1px 2px rgba(60,48,20,.18)' : 'none'}">${label}</button>`;
    }).join('');

  const CHART_STYLES = [
    ['bars', '▦ Barres'], ['area', '◢ Aire dégradée'], ['lollipop', '┃ Lollipop'],
    ['finebars', '▏ Barres fines'], ['line', '⟋ Courbe + points'], ['cells', '▤ Cellules'],
    ['cumul', '⌁ Barres + cumul'], ['stacked', '▥ Succès / échec'], ['step', '⌐ Paliers'],
  ];
  const chartOptions = CHART_STYLES.map(([v, l]) =>
    `<option value="${v}"${state.chartStyle === v ? ' selected' : ''}>${l}</option>`
  ).join('');

  const xLabels = d.xlabels.map(x => `<span>${x}</span>`).join('');

  const statCard = (label, value, sub, valueColor) => `
    <div style="flex:1;background:#fff;border:1px solid rgba(60,48,20,.1);border-radius:13px;padding:17px;box-shadow:0 1px 2px rgba(60,48,20,.05)">
      <div style="font-size:11px;font-weight:600;color:${COLOR.faint2};text-transform:uppercase;letter-spacing:.06em">${label}</div>
      <div style="font-size:30px;font-weight:700;color:${valueColor || COLOR.text};margin-top:7px;line-height:1">${value}</div>
      <div style="font-size:11px;color:${COLOR.muted2};margin-top:6px;font-weight:500">${sub}</div>
    </div>`;

  return `
    <div style="padding:26px 30px;display:flex;flex-direction:column;height:100%">

      <!-- En-tête -->
      <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:20px">
        <div>
          <div style="font-size:21px;font-weight:700;color:${COLOR.text}">Vue d'ensemble</div>
          <div style="font-size:13px;color:${COLOR.muted2};margin-top:3px">${d.title} · données réelles (logs)</div>
        </div>
        <div style="display:flex;gap:3px;background:${COLOR.chip};padding:3px;border-radius:10px">${rangeButtons}</div>
      </div>

      <!-- Grille principale -->
      <div style="display:grid;grid-template-columns:1.75fr 1fr;grid-template-rows:auto 1fr;gap:14px;flex:1;min-height:0">

        <!-- Cartes stats -->
        <div style="display:flex;gap:14px">
          ${statCard('Total votes',      fmtNumber(total),  `≈ ${perDay} / jour`)}
          ${statCard('Taux de succès',   `${rate}%`,        `${fmtNumber(fail)} échecs`, COLOR.gold)}
        </div>
        ${statCard('Temps moyen', `<span id="avg-val">${avgDelay}</span>`, 'par captcha')}

        <!-- Graphe -->
        <div style="background:#fff;border:1px solid rgba(60,48,20,.1);border-radius:13px;padding:18px 20px;box-shadow:0 1px 2px rgba(60,48,20,.05);display:flex;flex-direction:column;min-width:0;overflow:hidden">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
            <div style="font-size:14px;font-weight:600;color:${COLOR.text}">${d.title}</div>
            <div style="display:flex;align-items:center;gap:10px">
              <div style="position:relative;display:flex;align-items:center">
                <select data-change="chartStyle"
                  style="appearance:none;-webkit-appearance:none;border:1px solid ${COLOR.border};background:${COLOR.cream};border-radius:8px;padding:5px 26px 5px 11px;font:600 11px IBM Plex Sans,sans-serif;color:${COLOR.goldDark};cursor:pointer;outline:none">
                  ${chartOptions}
                </select>
                <span style="position:absolute;right:9px;font-size:9px;color:${COLOR.faint2};pointer-events:none">▼</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:${COLOR.gold};font-weight:600">
                <span style="width:7px;height:7px;border-radius:50%;background:#10b981;animation:livepulse 1.8s infinite"></span>live
              </div>
            </div>
          </div>
          <div id="chart-box" style="flex:1;min-height:0;display:flex;flex-direction:column"></div>
          <div class="mono" style="display:flex;justify-content:space-between;font-size:10px;color:${COLOR.faint};margin-top:9px">${xLabels}</div>
        </div>

        <!-- Colonne droite : captchas + objectif -->
        <div style="display:flex;flex-direction:column;gap:14px;min-width:0">

          <!-- Captchas -->
          <div style="background:#fff;border:1px solid rgba(60,48,20,.1);border-radius:13px;padding:16px 18px;box-shadow:0 1px 2px rgba(60,48,20,.05);display:flex;flex-direction:column;align-items:center">
            <div style="font-size:14px;font-weight:600;color:${COLOR.text};align-self:flex-start;margin-bottom:12px">Captchas</div>
            <div style="position:relative;width:104px;height:104px;border-radius:50%;background:conic-gradient(${COLOR.gold} 0% ${capRate.toFixed(1)}%, ${COLOR.goldLight} ${capRate.toFixed(1)}% 100%)">
              <div style="position:absolute;inset:13px;background:#fff;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center">
                <div style="font-size:21px;font-weight:700;color:${COLOR.text}">${capRate.toFixed(0)}%</div>
                <div style="font-size:10px;color:${COLOR.muted2}">résolus</div>
              </div>
            </div>
            <div style="width:100%;margin-top:14px;font-size:12px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">
                <span style="display:flex;align-items:center;gap:7px;color:${COLOR.muted}">
                  <span style="width:9px;height:9px;border-radius:3px;background:${COLOR.gold}"></span>Résolus
                </span>
                <span style="font-weight:700;color:${COLOR.text}">${fmtNumber(cap.solved)}</span>
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between">
                <span style="display:flex;align-items:center;gap:7px;color:${COLOR.muted}">
                  <span style="width:9px;height:9px;border-radius:3px;background:${COLOR.goldLight}"></span>Échoués
                </span>
                <span style="font-weight:700;color:${COLOR.text}">${fmtNumber(cap.failed)}</span>
              </div>
            </div>
          </div>

          <!-- Objectif du jour -->
          <div style="background:#fff;border:1px solid rgba(60,48,20,.1);border-radius:13px;padding:16px 18px;box-shadow:0 1px 2px rgba(60,48,20,.05);display:flex;flex-direction:column;align-items:center">
            <div style="font-size:14px;font-weight:600;color:${COLOR.text};align-self:flex-start">Objectif du jour</div>
            <div class="mono" style="font-size:11px;color:${COLOR.muted2};align-self:flex-start;margin-bottom:12px">${goalNote}</div>
            <div style="position:relative;width:120px;height:120px">
              ${goalRing}
              <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
                <div style="font-size:28px;font-weight:700;color:${COLOR.text};line-height:1">
                  ${todayCount}<span style="font-size:15px;color:${COLOR.faint};font-weight:600">/8</span>
                </div>
                <div style="font-size:9px;color:${COLOR.muted2};margin-top:1px">votes auj.</div>
              </div>
            </div>
            <div style="display:flex;gap:5px;margin-top:16px;width:100%;justify-content:space-between">${pills}</div>
          </div>

        </div>
      </div>
    </div>`;
}

function viewTerminal(state) {
  const source   = state.frozen && state.pinned ? state.pinned : state.logs;
  const filtered = state.filter === 'all' ? source : source.filter(l => l.type === state.filter);
  const visible  = filtered.slice(-300);

  const logLines = visible.map(l => `
    <div style="display:flex;gap:11px;padding:2px 0;white-space:nowrap">
      <span style="color:#5a6371">${l.t}</span>
      <span style="color:${LOG_COLOR[l.type]};font-weight:500;min-width:38px">${LOG_TAG[l.type]}</span>
      <span style="color:#c9d1d9;overflow:hidden;text-overflow:ellipsis">${esc(l.msg)}</span>
    </div>`).join('') || '<div style="color:#5a6371">En attente de logs du worker… (flux SSE /stream)</div>';

  const filterChips = [['all', 'Tous'], ['success', 'Succès'], ['info', 'Info'], ['warn', 'Warn'], ['error', 'Erreur']]
    .map(([key, label]) => {
      const isActive = state.filter === key;
      return `<button data-action="filter" data-arg="${key}"
        style="font:600 12px IBM Plex Sans,sans-serif;padding:6px 13px;border-radius:999px;cursor:pointer;
               border:1px solid ${isActive ? COLOR.gold : 'rgba(255,255,255,.16)'};
               background:${isActive ? COLOR.gold : 'transparent'};
               color:${isActive ? '#fff' : '#9ba3b4'}">${label}</button>`;
    }).join('');

  const capturedWhich = state.captures.url2 === 'done' ? 'url2'
    : state.captures.url1 === 'done' ? 'url1'
    : null;
  const shownImage = state.lastImg
    || (capturedWhich ? { src: Backend.imageUrl(capturedWhich), label: `live capture · ${capturedWhich.toUpperCase()}` } : null);

  const imageContent = shownImage
    ? `<img id="last-img" src="${shownImage.src}" style="max-width:100%;max-height:100%;object-fit:contain" onerror="this.style.opacity='0.2'">`
    : `<span id="last-img" class="mono" style="font-size:11px;color:#4d5666">aucune capture</span>`;

  return `
    <div style="padding:26px 30px;display:flex;flex-direction:column;height:100%">

      <!-- En-tête -->
      <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:18px">
        <div>
          <div style="display:flex;align-items:center;gap:9px">
            <span data-status-dot style="width:9px;height:9px;border-radius:50%;background:#c1b59a;animation:livepulse 1.8s infinite"></span>
            <span style="font-size:21px;font-weight:700;color:${COLOR.text}">Terminal en direct</span>
          </div>
          <div style="font-size:13px;color:${COLOR.muted2};margin-top:3px">
            Flux du worker · <span data-clock>${nowClock()}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button data-action="toggleFreeze"
            style="font:600 13px IBM Plex Sans,sans-serif;padding:8px 14px;border-radius:9px;cursor:pointer;
                   border:1px solid ${state.frozen ? COLOR.gold : COLOR.border};
                   background:${state.frozen ? COLOR.gold : '#fff'};
                   color:${state.frozen ? '#fff' : COLOR.textMid}">
            ${state.frozen ? '❚❚ Gelé' : '⏸ Geler'}
          </button>
          <button data-action="exportLogs"
            style="font:600 13px IBM Plex Sans,sans-serif;padding:8px 14px;border-radius:9px;cursor:pointer;border:1px solid ${COLOR.border};background:#fff;color:${COLOR.textMid}">
            ↓ Export .txt
          </button>
        </div>
      </div>

      <!-- Filtres -->
      <div style="display:flex;gap:7px;margin-bottom:14px">${filterChips}</div>

      <!-- Corps -->
      <div style="display:flex;gap:14px;flex:1;min-height:0">

        <!-- Terminal -->
        <div id="term-scroll" style="flex:2;background:#0d1117;border-radius:12px;padding:16px 22px;min-height:0;overflow:auto;font:400 16px/1.7 IBM Plex Mono,monospace">
          <div id="term-body" style="display:flex;flex-direction:column;justify-content:flex-start">
            ${logLines}
            <div id="term-caret" style="display:flex;gap:8px;color:${COLOR.gold};padding-top:4px">
              ›<span style="animation:blink 1s steps(1) infinite;color:#c9d1d9">▋</span>
            </div>
          </div>
        </div>

        <!-- Panneau image -->
        <div style="flex:1;background:#0d1117;border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px;min-height:0">
          <div class="mono" style="font-size:11px;color:#9ba3b4;flex-shrink:0">
            <span id="last-img-label">${shownImage ? shownImage.label : '—'}</span>
          </div>
          <div style="flex:1;min-height:0;border-radius:7px;border:1px solid #232a35;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#0a0c10">
            ${imageContent}
          </div>
          <div class="mono" style="display:flex;justify-content:space-between;font-size:11px;color:#6b7480;flex-shrink:0">
            <span style="color:#3fb950">● ${shownImage ? 'capturé' : '—'}</span>
            <span data-clock>${nowClock()}</span>
          </div>
        </div>

      </div>
    </div>`;
}

function viewSettings(state) {
  const TABS = [['delais', '⏱ Délais'], ['urls', '🔗 URLs'], ['config', '⚙ Config']];

  const tabButtons = TABS.map(([key, label]) => {
    const isActive = state.settingsTab === key;
    return `<button data-action="settingsTab" data-arg="${key}"
      style="padding:7px 16px;border:none;border-radius:7px;cursor:pointer;font:600 12px IBM Plex Sans,sans-serif;white-space:nowrap;
             background:${isActive ? '#fff' : 'transparent'};
             color:${isActive ? COLOR.goldDark : COLOR.muted2};
             box-shadow:${isActive ? '0 1px 2px rgba(60,48,20,.18)' : 'none'}">${label}</button>`;
  }).join('');

  let body = '';
  if (state.settingsTab === 'delais') body = settingsDelais(state);
  if (state.settingsTab === 'urls')   body = settingsUrls(state);
  if (state.settingsTab === 'config') body = settingsConfig(state);

  return `
    <div style="display:flex;flex-direction:column;height:100%">
      <div style="padding:26px 30px 0">
        <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:16px">
          <div>
            <div style="font-size:21px;font-weight:700;color:${COLOR.text}">Réglages</div>
            <div style="font-size:13px;color:${COLOR.muted2};margin-top:3px">Configuration du worker de vote</div>
          </div>
          <div style="display:flex;gap:3px;background:${COLOR.chip};padding:3px;border-radius:10px;flex-shrink:0">${tabButtons}</div>
        </div>
      </div>
      ${body}
    </div>`;
}

function settingsDelais(state) {
  const rows = DELAY_DEFS.map(def => {
    const value   = state.delays[def.key];
    const pct     = ((value - def.min) / (def.max - def.min) * 100).toFixed(1);
    const fillBg  = `linear-gradient(90deg,${COLOR.gold} 0%,${COLOR.gold} ${pct}%,${COLOR.goldLight} ${pct}%,${COLOR.goldLight} 100%)`;

    return `
      <div style="display:flex;align-items:center;gap:22px;padding:15px 0;border-bottom:1px solid ${COLOR.borderSoft}">
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:600;color:${COLOR.text}">${def.label}</div>
          <div style="font-size:12px;color:${COLOR.muted2};margin-top:2px">${def.desc}</div>
        </div>
        <div style="width:320px;display:flex;align-items:center;gap:16px;flex-shrink:0">
          <input type="range" data-input="delay" data-key="${def.key}"
            min="${def.min}" max="${def.max}" step="${def.step}" value="${value}"
            style="flex:1;background:${fillBg}">
          <div id="delay-val-${def.key}" class="mono"
            style="width:62px;text-align:right;font-weight:600;font-size:13px;color:${COLOR.goldDark}">
            ${fmtDelay(value, def.unit)}
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div style="flex:1;min-height:0;overflow-y:auto;padding:6px 30px 0">
      <div style="background:#fff;border:1px solid rgba(60,48,20,.1);border-radius:13px;padding:6px 22px;box-shadow:0 1px 2px rgba(60,48,20,.05)">
        ${rows}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 2px 24px">
        <button data-action="resetDelais"
          style="font:600 13px IBM Plex Sans,sans-serif;padding:9px 16px;border-radius:9px;border:1px solid ${COLOR.border};background:#fff;color:${COLOR.muted};cursor:pointer">
          ↺ Réinitialiser
        </button>
        <div class="mono" style="font-size:11px;color:${COLOR.faint}">Enregistré automatiquement</div>
      </div>
    </div>`;
}

function settingsUrls(state) {
  const FIELDS = [
    { key: 'url1', label: 'URL 1', hint: 'Première page ouverte par le worker',  placeholder: 'https://exemple.com/page-1' },
    { key: 'url2', label: 'URL 2', hint: 'Page où le vote est effectué',          placeholder: 'https://exemple.com/vote'   },
  ];

  const rows = FIELDS.map(field => {
    const cap      = state.captures[field.key];
    const counting = typeof cap === 'number';
    const done     = cap === 'done';

    const iconPath = counting
      ? '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'
      : done
        ? '<path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>'
        : '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>';

    const btnLabel = counting ? `Capture dans ${cap} s` : done ? 'Recapturer' : 'Capturer';

    const statusBadge = counting
      ? `<div style="display:flex;align-items:center;gap:7px;margin-top:9px;font-size:12px;color:${COLOR.gold}">
           <span style="width:7px;height:7px;border-radius:50%;background:${COLOR.amber}"></span>
           Capture dans ${cap} s · positionnez les zones à l'écran
         </div>`
      : done
        ? `<div style="display:flex;align-items:center;gap:7px;margin-top:9px;font-size:12px;color:#067647">
             <span style="width:7px;height:7px;border-radius:50%;background:#10b981"></span>
             Zones capturées — prêtes à configurer (onglet Config)
           </div>`
        : '';

    return `
      <div style="padding:18px 0;border-bottom:1px solid ${COLOR.borderSoft}">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:9px">
          <span class="mono" style="font-weight:600;font-size:11px;color:#fff;background:${COLOR.gold};padding:3px 9px;border-radius:6px">${field.label}</span>
          <span style="font-size:12px;color:${COLOR.muted2}">${field.hint}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="flex:1;display:flex;align-items:center;gap:9px;border:1px solid ${COLOR.border};border-radius:9px;padding:0 13px;background:${COLOR.cream};height:44px">
            <span style="color:#b3a98f;font-size:13px">🔗</span>
            <input type="text" data-input="url" data-key="${field.key}"
              value="${esc(state.urls[field.key])}" placeholder="${field.placeholder}"
              class="mono" style="border:none;outline:none;flex:1;font-size:13px;color:${COLOR.text};background:transparent">
          </div>
          <button ${counting ? '' : `data-action="capture" data-arg="${field.key}"`}
            style="display:flex;align-items:center;gap:8px;height:44px;padding:0 16px;border-radius:9px;white-space:nowrap;
                   border:1px solid ${counting ? COLOR.border : COLOR.gold};
                   background:${counting ? COLOR.chip : '#fff'};
                   color:${counting ? COLOR.faint2 : COLOR.goldDark};
                   font:600 13px IBM Plex Sans,sans-serif;
                   cursor:${counting ? 'default' : 'pointer'}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              ${iconPath}
            </svg>
            <span>${btnLabel}</span>
          </button>
        </div>
        ${statusBadge}
      </div>`;
  }).join('');

  return `
    <div style="flex:1;min-height:0;overflow-y:auto;padding:6px 30px 24px">
      <div style="background:#fff;border:1px solid rgba(60,48,20,.1);border-radius:13px;padding:22px;box-shadow:0 1px 2px rgba(60,48,20,.05)">
        <div style="font-size:15px;font-weight:700;color:${COLOR.text}">Pages cibles</div>
        <div style="font-size:12px;color:${COLOR.muted2};margin-top:2px">
          Les deux adresses parcourues par le worker. Capturez chacune pour vérifier le rendu.
        </div>
        ${rows}
        <div class="mono" style="font-size:11px;color:${COLOR.faint};margin-top:16px">
          Enregistré automatiquement · POST /screenshot après 5 s
        </div>
      </div>
    </div>`;
}

function settingsConfig(state) {
  const cv = state.configView;
  const slideLeft = cv === 'url1' ? '4px' : '50%';

  return `
    <div style="flex:1;min-height:0;display:flex;padding:6px 30px 20px">
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;background:#fff;border:1px solid rgba(60,48,20,.1);border-radius:13px;padding:18px;box-shadow:0 1px 2px rgba(60,48,20,.05)">

        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px">
          <div>
            <div style="font-size:15px;font-weight:700;color:${COLOR.text}">Repérage des zones</div>
            <div style="font-size:12px;color:${COLOR.muted2};margin-top:2px">Placez points (clic) et carrés (zone) sur la capture. Glissez pour ajuster.</div>
          </div>
          <!-- Switcher URL 1 / URL 2 -->
          <div style="position:relative;display:flex;background:${COLOR.chip};border-radius:10px;padding:4px;width:280px;flex-shrink:0">
            <div style="position:absolute;top:4px;bottom:4px;left:${slideLeft};width:calc(50% - 4px);background:#fff;border-radius:7px;box-shadow:0 1px 2px rgba(60,48,20,.18);transition:left .22s ease"></div>
            <button data-action="configView" data-arg="url1" style="position:relative;z-index:1;flex:1;border:none;background:transparent;padding:7px 0;border-radius:7px;cursor:pointer;font:600 12px IBM Plex Sans,sans-serif;color:${cv === 'url1' ? COLOR.text : COLOR.muted2}">Capture URL 1</button>
            <button data-action="configView" data-arg="url2" style="position:relative;z-index:1;flex:1;border:none;background:transparent;padding:7px 0;border-radius:7px;cursor:pointer;font:600 12px IBM Plex Sans,sans-serif;color:${cv === 'url2' ? COLOR.text : COLOR.muted2}">Capture URL 2</button>
          </div>
        </div>

        <div id="config-editor" style="display:flex;flex-direction:column;gap:11px;flex:1;min-height:0">
          ${configEditorInner(state)}
        </div>

      </div>
    </div>`;
}

function configEditorInner(state) {
  const cv    = state.configView;
  const zones = state.zones.filter(z => z.page === cv);
  const ZONE_COLORS = { zone: COLOR.gold, click: COLOR.danger };

  const zoneChips = zones.map(z => {
    const isSelected = z.id === state.selectedZone;
    const color      = ZONE_COLORS[z.type];
    const radius     = z.type === 'click' ? '50%' : '3px';
    return `<button data-action="selectZone" data-arg="${z.id}"
      style="display:flex;align-items:center;gap:7px;border:1px solid ${isSelected ? color : 'transparent'};background:${isSelected ? COLOR.cream : 'transparent'};border-radius:8px;padding:5px 9px;cursor:pointer">
      <span style="width:11px;height:11px;border-radius:${radius};background:${color};flex-shrink:0"></span>
      <span style="font-size:12px;font-weight:600;color:${COLOR.text};white-space:nowrap">${z.name}</span>
    </button>`;
  }).join('');

  const done     = state.captures[cv] === 'done';
  const cvLabel  = cv === 'url1' ? 'URL 1' : 'URL 2';
  const cvUrl    = state.urls[cv] || (cv === 'url1' ? 'https://exemple.com/page-1' : 'https://exemple.com/vote');

  const header = `
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:7px">
      ${zoneChips}
      <div style="margin-left:auto;display:flex;gap:7px">
        <button data-action="saveDefault"
          style="height:30px;border:1px solid ${COLOR.gold};border-radius:8px;padding:0 12px;font:600 11px IBM Plex Sans,sans-serif;cursor:pointer;white-space:nowrap;
                 background:${state.savedFlash ? COLOR.gold : '#fff'};
                 color:${state.savedFlash ? '#fff' : COLOR.goldDark}">
          ${state.savedFlash ? '✓ Enregistré' : '★ Définir par défaut'}
        </button>
        <button data-action="resetZones"
          style="height:30px;border:1px solid ${COLOR.border};background:#fff;border-radius:8px;padding:0 11px;font:600 11px IBM Plex Sans,sans-serif;color:${COLOR.muted};cursor:pointer;white-space:nowrap">
          ↺ Réinitialiser
        </button>
      </div>
    </div>`;

  const windowHeader = `
    <div style="display:flex;align-items:center;gap:9px;height:38px;padding:0 13px;background:${COLOR.cream};border-bottom:1px solid ${COLOR.border};flex-shrink:0">
      <div style="display:flex;gap:6px">
        <span style="width:9px;height:9px;border-radius:50%;background:#e0c9a0"></span>
        <span style="width:9px;height:9px;border-radius:50%;background:#e0c9a0"></span>
        <span style="width:9px;height:9px;border-radius:50%;background:#e0c9a0"></span>
      </div>
      <div style="flex:1;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #ece4d4;border-radius:7px;height:24px;padding:0 10px;margin-left:6px">
        <span class="mono" style="font-weight:600;font-size:9px;color:#fff;background:${COLOR.gold};padding:1px 6px;border-radius:4px">${cvLabel}</span>
        <span class="mono" style="font-size:11px;color:${COLOR.muted};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(cvUrl)}</span>
      </div>
    </div>`;

  let canvas;
  if (done) {
    const overlays = zones.map(z => {
      const color      = ZONE_COLORS[z.type];
      const isSelected = z.id === state.selectedZone;
      const outline    = isSelected ? 'outline:2px solid rgba(159,116,32,.45);outline-offset:2px;' : '';

      if (z.type === 'zone') {
        return `<div data-zone="${z.id}" data-mode="move"
          style="position:absolute;left:${z.x}%;top:${z.y}%;width:${z.w}%;height:${z.h}%;
                 border:2px dashed ${color};border-radius:6px;cursor:grab;${outline}
                 background:${isSelected ? 'rgba(159,116,32,.14)' : 'rgba(159,116,32,.07)'}">
          <div class="mono" style="position:absolute;top:3px;left:4px;font-weight:600;font-size:9px;color:#fff;background:${color};padding:1px 5px;border-radius:4px;white-space:nowrap">${z.name}</div>
          <div data-zone="${z.id}" data-mode="resize"
            style="position:absolute;right:-6px;bottom:-6px;width:13px;height:13px;border-radius:3px;background:#fff;border:2px solid ${color};cursor:nwse-resize"></div>
        </div>`;
      }

      return `<div data-zone="${z.id}" data-mode="move"
        style="position:absolute;left:${z.x}%;top:${z.y}%;transform:translate(-50%,-50%);
               width:22px;height:22px;border-radius:50%;border:2px solid ${color};
               background:rgba(161,66,31,.16);cursor:grab;${outline}
               display:flex;align-items:center;justify-content:center">
        <div style="width:5px;height:5px;border-radius:50%;background:${color}"></div>
        <div class="mono" style="position:absolute;top:-19px;left:50%;transform:translateX(-50%);font-weight:600;font-size:9px;color:#fff;background:${color};padding:1px 5px;border-radius:4px;white-space:nowrap">${z.name}</div>
      </div>`;
    }).join('');

    canvas = `
      <div id="zone-box" style="position:relative;flex:1;min-height:0;overflow:hidden;user-select:none;touch-action:none;background:#11161d">
        <img id="zone-bg-img" src="${Backend.imageUrl(cv)}" draggable="false"
          style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none"
          onload="App.fitZoneOverlay()" onerror="this.style.opacity=0">
        <div id="zone-img-frame" style="position:absolute;top:0;left:0;width:100%;height:100%">
          ${overlays}
        </div>
      </div>`;
  } else {
    canvas = `
      <div style="flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:${COLOR.cream}">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#c9bfa6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
        <div style="text-align:center">
          <div style="font-size:14px;font-weight:600;color:${COLOR.muted}">Aucune capture pour ${cvLabel}</div>
          <div style="font-size:12px;color:${COLOR.muted2};margin-top:3px">Capturez la page dans l'onglet URLs pour repérer les zones.</div>
        </div>
        <button data-action="settingsTab" data-arg="urls"
          style="height:36px;padding:0 16px;border-radius:9px;border:1px solid ${COLOR.gold};background:#fff;color:${COLOR.goldDark};font:600 12px IBM Plex Sans,sans-serif;cursor:pointer">
          Aller à l'onglet URLs →
        </button>
      </div>`;
  }

  return `
    ${header}
    <div style="flex:1;min-height:0;display:flex;flex-direction:column;border:1px solid ${COLOR.border};border-radius:12px;overflow:hidden;background:#fff">
      ${windowHeader}
      ${canvas}
    </div>`;
}

/* ============================================================
   APP — état global et logique
   ============================================================ */
const App = {
  state: {
    authed:       !VF_REQUIRE_LOGIN,
    view:         'demarrage',
    range:        'semaine',
    chartStyle:   'bars',
    settingsTab:  'delais',
    configView:   'url1',
    selectedZone: 'decompte',
    zones:        Store.get('vf_zones',        ZONES_DEFAULT.map(z => Object.assign({}, z))),
    defaultZones: Store.get('vf_default_zones', null),
    delays:       Store.get('vf_delays',       { url1: 5, url2: 3, try: 2, ext: 2, wait: 30, result: 2, error: 3 }),
    urls:         Store.get('vf_urls',         { url1: '', url2: '' }),
    captures:     Store.get('vf_captures',     { url1: null, url2: null }),
    logs:         [],
    frozen:       false,
    pinned:       null,
    filter:       'all',
    workerState:  'idle',
    waitUntil:    0,
    nowSec:       Math.floor(Date.now() / 1000),
    capCount:     { solved: 0, failed: 0 },
    solveTimes:   [],
    savedFlash:   false,
    lastImg:      null,
  },

  _id:    0,
  _capT:  {},
  _zdrag: null,

  /* ---------- HOOKS TEMPS RÉEL ---------- */

  onLog(text) {
    const tsMatch = /^\[(\d{2}:\d{2}:\d{2})\] /.exec(text);
    const t   = tsMatch ? tsMatch[1] : nowClock();
    const msg = tsMatch ? text.slice(tsMatch[0].length) : String(text);
    const type = classifyLog(msg);
    const log  = { id: ++this._id, t, type, msg };
    this.state.logs.push(log);
    if (this.state.logs.length > 2000) this.state.logs = this.state.logs.slice(-2000);

    const voteResult    = voteOutcome(text);
    const captchaResult = captchaOutcome(text);

    if (voteResult && !Backend._replaying) recordVote(voteResult);
    if (captchaResult === 'solved') this.state.capCount.solved++;
    if (captchaResult === 'failed') this.state.capCount.failed++;

    const solveMatch = (text || '').match(/(?:en|in)\s+([0-9]+(?:[.,][0-9]+)?)\s*s/i);
    if (solveMatch) {
      this.state.solveTimes.push(parseFloat(solveMatch[1].replace(',', '.')));
      if (this.state.solveTimes.length > 50) this.state.solveTimes.shift();
    }

    if (!this.state.frozen && this.state.view === 'terminal') this.appendLogLine(log);
    if ((voteResult || captchaResult) && this.state.view === 'dashboard') this.render();
  },

  onStatus(json) {
    if (!json) {
      this.state.workerState = 'idle';
    } else {
      const isActive = json.state === 'running' || json.state === 'waiting';
      this.state.workerState = isActive ? json.state : 'idle';
      this.state.waitUntil   = json.wait_until || 0;
    }
    this.paintStatusEverywhere();
  },

  onMessageImg() {
    const src = `/img/message?_t=${Date.now()}`;
    this.state.lastImg = { src, label: 'zone OCR' };
    const img = document.getElementById('last-img');
    const lbl = document.getElementById('last-img-label');
    if (img) img.src = src;
    if (lbl) lbl.textContent = 'zone OCR';
  },

  /* ---------- ACTIONS ---------- */

  act(action, arg, el) {
    const state = this.state;

    switch (action) {
      case 'login': {
        const input     = document.getElementById('vf-pwd');
        const isCorrect = !VF_REQUIRE_LOGIN || VF_PASSWORD === '' || (input && input.value === VF_PASSWORD);
        if (isCorrect) {
          state.authed = true;
          this.render();
        } else {
          if (input) input.style.borderColor = '#cf6679';
          const errEl = document.getElementById('vf-pwd-err');
          if (errEl) errEl.style.display = 'block';
        }
        break;
      }
      case 'lock':        state.authed = false;  this.render(); break;
      case 'nav':         state.view   = arg;    this.render(); break;
      case 'range':       state.range  = arg;    this.render(); break;
      case 'chartStyle':  state.chartStyle = el.value; this.render(); break;
      case 'filter':      state.filter = arg;    this.render(); break;

      case 'toggleFreeze':
        state.frozen = !state.frozen;
        state.pinned = state.frozen ? state.logs.slice() : null;
        this.render();
        break;

      case 'exportLogs':  this.exportLogs(); break;
      case 'settingsTab': state.settingsTab = arg; this.render(); break;

      case 'resetDelais':
        state.delays = { url1: 5, url2: 3, try: 2, ext: 2, wait: 30, result: 2, error: 3 };
        Store.set('vf_delays', state.delays);
        this._syncConfig();
        this.render();
        break;

      case 'configView':  state.configView  = arg; this.render(); break;
      case 'selectZone':  state.selectedZone = arg; this.renderConfigEditor(); break;

      case 'resetZones': {
        const source = state.defaultZones || ZONES_DEFAULT;
        state.zones  = source.map(z => Object.assign({}, z));
        Store.set('vf_zones', state.zones);
        this._syncConfig();
        this.render();
        break;
      }

      case 'saveDefault': {
        const snapshot    = state.zones.map(z => Object.assign({}, z));
        state.defaultZones = snapshot;
        Store.set('vf_default_zones', snapshot);
        Store.set('vf_zones',         snapshot);
        this._syncConfig();
        state.savedFlash = true;
        this.render();
        clearTimeout(this._flashT);
        this._flashT = setTimeout(() => { state.savedFlash = false; this.render(); }, 1600);
        break;
      }

      case 'start':
        state.workerState = 'running';
        this.paintStatusEverywhere();
        Backend.launch().finally(() => { state.workerState = 'idle'; this.paintStatusEverywhere(); });
        break;

      case 'stop':
        state.workerState = 'idle';
        this.paintStatusEverywhere();
        Backend.stop();
        break;

      case 'skip':    Backend.skip(); break;
      case 'capture': this.startCapture(arg); break;
    }
  },

  startCapture(which) {
    if (this._capT[which]) return;
    this.state.captures[which] = 5;
    this.render();

    this._capT[which] = setInterval(() => {
      const current = this.state.captures[which];
      if (typeof current === 'number' && current > 1) {
        this.state.captures[which] = current - 1;
        this.render();
        return;
      }
      clearInterval(this._capT[which]);
      this._capT[which] = null;
      Backend.screenshot(which).finally(() => {
        this.state.captures[which] = 'done';
        Store.set('vf_captures', this.state.captures);
        this.state.lastImg = { src: Backend.imageUrl(which), label: `live capture · ${which.toUpperCase()}` };
        this.render();
      });
    }, 1000);
  },

  exportLogs() {
    const content = this.state.logs.map(l => `${l.t} [${l.type.toUpperCase()}] ${l.msg}`).join('\n');
    const anchor  = document.createElement('a');
    anchor.href   = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    anchor.download = 'vote-logs.txt';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  },

  onInput(kind, key, el) {
    const state = this.state;

    if (kind === 'url') {
      state.urls[key] = el.value;
      Store.set('vf_urls', state.urls);
      this._syncConfig();
    }

    if (kind === 'delay') {
      const value = parseFloat(el.value);
      state.delays[key] = value;
      Store.set('vf_delays', state.delays);

      const def    = DELAY_DEFS.find(d => d.key === key);
      const label  = document.getElementById(`delay-val-${key}`);
      if (label) label.textContent = fmtDelay(value, def.unit);

      const pct = ((value - def.min) / (def.max - def.min) * 100).toFixed(1);
      el.style.background = `linear-gradient(90deg,${COLOR.gold} 0%,${COLOR.gold} ${pct}%,${COLOR.goldLight} ${pct}%,${COLOR.goldLight} 100%)`;

      const avgEl = document.getElementById('avg-val');
      if (avgEl) {
        const dd = state.delays;
        avgEl.textContent = ((dd.url1 || 0) + (dd.url2 || 0) + (dd.try || 0) + (dd.ext || 0) + (dd.result || 0)).toFixed(1) + 's';
      }
      this._syncConfig();
    }
  },

  /* ---------- DRAG & DROP DES ZONES ---------- */

  zonePointerDown(id, mode, e) {
    e.preventDefault();
    e.stopPropagation();
    this._zdrag = { id, mode };
    this.state.selectedZone = id;
    window.addEventListener('pointermove', this._zmove);
    window.addEventListener('pointerup',   this._zup);
    this.renderConfigEditor();
  },

  _zmove: null,
  _zup:   null,

  zonePointerMove(e) {
    if (!this._zdrag) return;
    const box   = document.getElementById('zone-box');
    if (!box) return;
    const frame = document.getElementById('zone-img-frame');
    const rect  = (frame && frame.offsetWidth > 0 ? frame : box).getBoundingClientRect();
    const px    = clamp((e.clientX - rect.left) / rect.width  * 100, 0, 100);
    const py    = clamp((e.clientY - rect.top)  / rect.height * 100, 0, 100);
    const { id, mode } = this._zdrag;
    let updatedZone;

    this.state.zones = this.state.zones.map(z => {
      if (z.id !== id) return z;
      if (mode === 'resize') {
        updatedZone = { ...z, w: clamp(px - z.x, 3, 100 - z.x), h: clamp(py - z.y, 3, 100 - z.y) };
      } else if (z.type === 'zone') {
        updatedZone = { ...z, x: clamp(px - z.w / 2, 0, 100 - z.w), y: clamp(py - z.h / 2, 0, 100 - z.h) };
      } else {
        updatedZone = { ...z, x: px, y: py };
      }
      return updatedZone;
    });

    // Mise à jour DOM directe pour éviter le flash de l'image
    if (updatedZone) {
      const el = box.querySelector(`[data-zone="${id}"][data-mode="move"]`);
      if (el) {
        el.style.left = `${updatedZone.x}%`;
        el.style.top  = `${updatedZone.y}%`;
        if (updatedZone.type === 'zone') {
          el.style.width  = `${updatedZone.w || 10}%`;
          el.style.height = `${updatedZone.h || 10}%`;
        }
      }
    }
  },

  zonePointerUp() {
    this._zdrag = null;
    window.removeEventListener('pointermove', this._zmove);
    window.removeEventListener('pointerup',   this._zup);
    Store.set('vf_zones', this.state.zones);
    this._syncConfig();
    this.renderConfigEditor();
  },

  /* ---------- SYNC CONFIG SERVEUR ---------- */

  _syncConfig() {
    Backend.saveConfig({
      urls:         this.state.urls,
      delays:       this.state.delays,
      zones:        this.state.zones,
      defaultZones: this.state.defaultZones,
    });
  },

  _applyServerConfig(config) {
    if (!config || !Object.keys(config).length) return;
    if (config.urls)         { this.state.urls         = config.urls;         Store.set('vf_urls',          config.urls);         }
    if (config.delays)       { this.state.delays       = config.delays;       Store.set('vf_delays',        config.delays);       }
    if (config.zones)        { this.state.zones        = config.zones;        Store.set('vf_zones',         config.zones);        }
    if (config.defaultZones) { this.state.defaultZones = config.defaultZones; Store.set('vf_default_zones', config.defaultZones); }
    if (config._captures)    { this.state.captures     = config._captures;    Store.set('vf_captures',      config._captures);    }
  },

  /* ---------- INITIALISATION ---------- */

  init() {
    this._zmove = (e) => this.zonePointerMove(e);
    this._zup   = ()  => this.zonePointerUp();

    document.addEventListener('click',        (e) => { const t = e.target.closest('[data-action]'); if (t) this.act(t.getAttribute('data-action'), t.getAttribute('data-arg'), t); });
    document.addEventListener('input',        (e) => { const t = e.target.closest('[data-input]');  if (t) this.onInput(t.getAttribute('data-input'), t.getAttribute('data-key'), t); });
    document.addEventListener('change',       (e) => { const t = e.target.closest('[data-change]'); if (t) this.act(t.getAttribute('data-change'), null, t); });
    document.addEventListener('pointerdown',  (e) => { const t = e.target.closest('[data-zone]');   if (t) this.zonePointerDown(t.getAttribute('data-zone'), t.getAttribute('data-mode') || 'move', e); });

    this.render();
    Backend.loadConfig().then(config => { this._applyServerConfig(config); if (config && Object.keys(config).length) this.render(); });
    setInterval(() => { this.state.nowSec = Math.floor(Date.now() / 1000); this.paintTimer(); this.paintClock(); }, 1000);
    Backend.connectLogStream();
    Backend.startStatusPolling();
  },

  /* ---------- RENDU ---------- */

  render() {
    const state = this.state;
    const root  = document.getElementById('root');

    if (!state.authed) {
      root.innerHTML = viewLogin();
      return;
    }

    root.innerHTML = `
      <div style="height:100vh;display:flex">
        <div style="flex:1;background:#fff;overflow:hidden;display:flex">
          ${sidebar(state)}
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:#fff">
            ${currentView(state)}
          </div>
        </div>
      </div>`;

    if (state.view === 'dashboard') this.paintChart();
    if (state.view === 'terminal')  this.scrollTermBottom();
    this.paintStatusEverywhere();
  },

  renderConfigEditor() {
    const el = document.getElementById('config-editor');
    if (el) { el.innerHTML = configEditorInner(this.state); this.fitZoneOverlay(); }
  },

  fitZoneOverlay() {
    const img   = document.getElementById('zone-bg-img');
    const frame = document.getElementById('zone-img-frame');
    if (!img || !frame) return;
    const box  = img.parentElement;
    if (!box) return;
    const bw = box.clientWidth, bh = box.clientHeight;
    const iw = img.naturalWidth || bw, ih = img.naturalHeight || bh;
    if (!iw || !ih) return;
    const scale = Math.min(bw / iw, bh / ih);
    frame.style.left   = `${Math.round((bw - iw * scale) / 2)}px`;
    frame.style.top    = `${Math.round((bh - ih * scale) / 2)}px`;
    frame.style.width  = `${Math.round(iw * scale)}px`;
    frame.style.height = `${Math.round(ih * scale)}px`;
  },

  appendLogLine(log) {
    const body = document.getElementById('term-body');
    if (!body) return;
    if (this.state.filter !== 'all' && this.state.filter !== log.type) return;

    const caret = document.getElementById('term-caret');
    const div   = document.createElement('div');
    div.style.cssText = 'display:flex;gap:11px;padding:2px 0;white-space:nowrap';
    div.innerHTML = `
      <span style="color:#5a6371">${log.t}</span>
      <span style="color:${LOG_COLOR[log.type]};font-weight:500;min-width:38px">${LOG_TAG[log.type]}</span>
      <span style="color:#c9d1d9;overflow:hidden;text-overflow:ellipsis">${esc(log.msg)}</span>`;
    body.insertBefore(div, caret);
    while (body.children.length > 300) body.removeChild(body.firstChild);
    this.scrollTermBottom();
  },

  scrollTermBottom() {
    const el = document.getElementById('term-scroll');
    if (el) el.scrollTop = el.scrollHeight;
  },

  paintStatusEverywhere() {
    const meta = STATUS_META[this.state.workerState] || STATUS_META.idle;
    document.querySelectorAll('[data-status-dot]').forEach(e   => { e.style.background = meta.dot; });
    document.querySelectorAll('[data-status-label]').forEach(e => { e.textContent = meta.label; e.style.color = meta.color; });
    this.paintStartButtons();
    this.paintTimer();
  },

  paintStartButtons() {
    const ws = this.state.workerState;
    const toggle = (id, enabled) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.style.opacity       = enabled ? '1' : '.45';
      btn.style.pointerEvents = enabled ? 'auto' : 'none';
    };
    toggle('btn-start', ws === 'idle');
    toggle('btn-stop',  ws !== 'idle');
    toggle('btn-skip',  ws === 'waiting' || ws === 'running');
  },

  paintTimer() {
    const state     = this.state;
    const remaining = state.workerState === 'idle'
      ? 0
      : Math.max(0, (state.waitUntil || 0) - state.nowSec);
    const capped    = Math.min(remaining, 360 * 60);
    const display   = state.workerState === 'idle' ? '--:--' : fmtTimer(capped);

    const timerText = document.getElementById('timer-text');
    if (timerText) {
      timerText.textContent = display;
      timerText.style.fontSize = display.length <= 5 ? '46px' : display.length <= 7 ? '34px' : '26px';
    }

    const ring = document.getElementById('timer-ring-fg');
    if (ring) {
      const totalSeconds = Math.max(1, Math.min(360, Math.max(1, state.delays.wait))) * 60;
      const pct          = clamp(capped / totalSeconds, 0, 1);
      const C            = 2 * Math.PI * 130;
      ring.setAttribute('stroke-dashoffset', (C * (1 - pct)).toFixed(1));
      ring.setAttribute('stroke',
        state.workerState === 'running' ? COLOR.gold
        : state.workerState === 'waiting' ? COLOR.amber
        : '#cbbfa3'
      );
    }
  },

  paintClock() {
    document.querySelectorAll('[data-clock]').forEach(e => { e.textContent = nowClock(); });
  },

  paintChart() {
    const box = document.getElementById('chart-box');
    if (!box) return;
    const W = Math.max(60, box.clientWidth);
    const H = Math.max(60, box.clientHeight);
    const d = rangeData(this.state);
    box.innerHTML = buildChart(this.state.chartStyle, d.series, d.curIdx, W, H);
  },
};

/* ============================================================
   BOOT
   ============================================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}