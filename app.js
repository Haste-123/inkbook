'use strict';
/* =====================================================================
   Inkbook v2 — core, library and editor.
   File import/export, converters and backup live in io.js.
   ===================================================================== */

// ---------- Utils ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtSize = b => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const safeName = s => (s || 'notes').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'notes';
const nextFrame = () => new Promise(r => setTimeout(r));

const APP_VERSION = '24';
const PAGE_W = 1000, A4_H = 1414, ZMIN = 0.25, ZMAX = 4, MAX_PX = 12e6;
// Keep the installed app up to date: check for a new version whenever the app comes back to the
// front, and switch to it automatically (or offer a one-tap update while a notebook is open).
let swReg = null;
function setupUpdates() {
  let hadController = !!navigator.serviceWorker.controller, reloading = false;
  navigator.serviceWorker.register('sw.js').then(reg => {
    swReg = reg; reg.update().catch(() => { });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => { }); });
    setInterval(() => reg.update().catch(() => { }), 20 * 60e3);
  }).catch(() => { });
  navigator.serviceWorker.addEventListener('controllerchange', async () => {
    if (!hadController) { hadController = true; return; }       // first install, nothing to refresh
    if (reloading) return; reloading = true;
    if (!E.nb) { location.reload(); return; }
    await flush();
    const b = document.createElement('div'); b.className = 'update-bar';
    b.innerHTML = `<span>✨ A new version of ${esc(S.appName)} is ready</span><button class="btn primary">Update now</button>`;
    b.querySelector('button').onclick = async () => { await flush(); await saveNb(); location.reload(); };
    document.body.appendChild(b);
  });
}
async function checkForUpdate() {
  if (!swReg) return toast('Updates work once the app is installed from its web address');
  if (!navigator.onLine) return toast('You’re offline. Connect to check for updates.');
  toast('Checking…', 4000);
  await swReg.update().catch(() => { });
  setTimeout(() => { if (!swReg.installing && !swReg.waiting) toast(`You have the latest version (${APP_VERSION})`); }, 2500);
}
const LIBS = {
  pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  mammoth: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
  html2canvas: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
};
const COVER_COLORS = ['#5b6cff', '#0090ff', '#12a594', '#30a46c', '#ffc53d', '#f76b15', '#e5484d', '#d6409f', '#8e4ec6', '#1f2430', '#8d8d86', '#a18072'];
const ACCENTS = ['#5b6cff', '#0090ff', '#12a594', '#30a46c', '#f76b15', '#e5484d', '#d6409f', '#8e4ec6', '#1f2430'];
const TEMPLATES = [['blank', 'Blank'], ['lined', 'Lined'], ['narrow', 'Narrow ruled'], ['wide', 'Wide ruled'], ['grid', 'Grid'], ['smallgrid', 'Small grid'],
  ['graph', 'Graph paper'], ['dots', 'Dotted'], ['cornell', 'Cornell'], ['todo', 'To-do'], ['music', 'Music staff']];
const PAPER_COLORS = [['#ffffff', 'White'], ['#fbf6e9', 'Cream'], ['#eef4ff', 'Blue tint'], ['#1e2027', 'Dark']];
const PAGE_SIZES = [['a4', 'A4 portrait', 1000, 1414], ['a4l', 'A4 landscape', 1414, 1000], ['letter', 'US Letter', 1000, 1294],
  ['square', 'Square', 1000, 1000], ['wide', 'Wide 16:9', 1600, 900], ['long', 'Long scroll', 1000, 4000], ['board', 'Whiteboard', 2400, 1800]];
const SHAPES = [['line', 'Line'], ['arrow', 'Arrow'], ['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['triangle', 'Triangle']];
const FONT_OPTS = [['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono'], ['hand', 'Handwritten']];
const FONTS = { sans: '-apple-system, system-ui, "Segoe UI", sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: 'ui-monospace, Menlo, Consolas, monospace', hand: '"Noteworthy", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive' };
const ITEM_TYPES = [['question', 'Question', '#0090ff'], ['problem', 'Problem', '#f76b15'], ['example', 'Example', '#12a594'], ['definition', 'Definition', '#8e4ec6'],
  ['formula', 'Formula', '#d6409f'], ['note', 'Note', '#5b6cff'], ['important', 'Important', '#e5484d']];
const ITEM_MAP = Object.fromEntries(ITEM_TYPES.map(([k, l, c]) => [k, { label: l, color: c }]));
const AUTO_PATTERNS = [
  [/^\s*(q|question|qn)\s*\d*\s*[:.)\-]/i, 'question'], [/^\s*(problem|prob|exercise|ex)\s*\d*\s*[:.)\-]/i, 'problem'],
  [/^\s*example\s*\d*\s*[:.)\-]/i, 'example'], [/^\s*(def|definition)\s*\d*\s*[:.)\-]/i, 'definition'],
  [/^\s*(formula|eq|equation|thm|theorem)\s*\d*\s*[:.)\-]/i, 'formula'], [/^\s*(note|nb)\s*[:.)\-]/i, 'note'],
  [/^\s*(important|imp)\s*[:.)\-]|^\s*!{2,}/i, 'important']];
const TOOL_NAMES = { pen: 'Pen', hl: 'Highlighter', eraser: 'Eraser', shape: 'Shapes', lasso: 'Lasso select', text: 'Text', laser: 'Laser pointer' };
const SIZE_DEFAULTS = { pen: [1.6, 3, 5.5], hl: [12, 20, 30], eraser: [8, 18, 36], shape: [2, 3.5, 6], text: [18, 26, 38] };
const SIZE_RANGE = { pen: [0.5, 12, 0.1], hl: [4, 50, 1], eraser: [4, 80, 1], shape: [0.5, 12, 0.1], text: [10, 80, 1] };

const ICONS = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 000 10h3"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  hl: '<path d="M9 11l-6 6v3h9l3-3"/><path d="M22 12l-4.6 4.6a2 2 0 01-2.8 0l-5.2-5.2a2 2 0 010-2.8L14 4"/>',
  eraser: '<path d="M20 20H7l-4-4a1.5 1.5 0 010-2.1L13.9 3a1.5 1.5 0 012.1 0l5 5a1.5 1.5 0 010 2.1L11 20"/><path d="M6 11l7 7"/>',
  lasso: '<path d="M7 22a5 5 0 01-2-4"/><path d="M3.3 14A6.8 6.8 0 012 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 01-5-1"/><circle cx="5" cy="16" r="2"/>',
  text: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  shape: '<rect x="3" y="11" width="9" height="9" rx="1"/><circle cx="16.5" cy="7.5" r="4.5"/>',
  laser: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  hand: '<path d="M18 11V6a2 2 0 00-4 0M14 10V4a2 2 0 00-4 0v2M10 10.5V6a2 2 0 00-4 0v8"/><path d="M18 8a2 2 0 114 0v6a8 8 0 01-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 012.8-2.8L7 15"/>',
  addpage: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6M9 15h6"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  home: '<path d="M3 10l9-7 9 7v10a2 2 0 01-2 2h-4v-7H9v7H5a2 2 0 01-2-2z"/>',
  star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  sort: '<path d="M3 6h13M3 12h9M3 18h5M17 8v12M14 17l3 3 3-3"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  gridv: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>',
  folder: '<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01"/>',
  download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
  convert: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/>',
};
const icon = n => `<svg class="i" viewBox="0 0 24 24">${ICONS[n] || ''}</svg>`;

function isDark(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '#ffffff'); if (!m) return false;
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.45;
}
let toastT = null;
function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms);
}
const hideToast = () => { clearTimeout(toastT); $('#toast').hidden = true; };
const loaded = {};
function loadScript(src) {
  return loaded[src] ||= new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous';
    s.onload = res;
    s.onerror = () => { delete loaded[src]; s.remove(); rej(new Error('Could not load a helper library. Open the app once while online so it can be saved for offline use.')); };
    document.head.appendChild(s);
  });
}
function pickFiles(accept, multiple = false) {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = multiple;
    i.onchange = () => res([...i.files]); i.click();
  });
}
const pickFile = async accept => (await pickFiles(accept))[0] || null;
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { console.error(e); hideToast(); closeProgress(); toast('⚠️ ' + (e.message || e), 5000); } };

// ---------- Settings ----------
const DEFAULTS = {
  appName: 'Inkbook', theme: 'auto', accent: '#5b6cff', pencilOnly: false, pencilSeen: false,
  penStyle: 'fount', shapeSnap: true, hlStraight: false, eraserMode: 'stroke', eraseHlOnly: false, fingerTaps: true,
  shape: 'line', font: 'sans', selMode: 'free', sideOpen: false, sideTab: 'outline',
  paper: 'lined', paperColor: '#ffffff', pageSize: 'a4', sort: 'recent', libLayout: 'grid',
  uiFont: 'system', desk: 'dots', coverSize: 'm', claudeKey: '',
  pen: ['#1f2430', '#2f5bea', '#e5484d', '#18a058', '#8e4ec6', '#f76b15', '#12a594', '#8d8d86'],
  hl: ['#ffe14d', '#7cf29c', '#7cc8ff', '#ff9ad5', '#ffb86b', '#c3a6ff'],
  sizes: null,
};
let S = (() => {
  let s; try { s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('inkbook.settings') || '{}') }; } catch { s = { ...DEFAULTS }; }
  if (s.pressure === false && !s.penStyleSet) { s.penStyle = 'ball'; s.penStyleSet = true; }
  s.pen = [...s.pen, ...DEFAULTS.pen.slice(s.pen.length)].slice(0, 8);
  s.hl = [...s.hl, ...DEFAULTS.hl.slice(s.hl.length)].slice(0, 6);
  s.sizes = Object.fromEntries(Object.entries(SIZE_DEFAULTS).map(([k, v]) => [k, (s.sizes?.[k]?.length === 3 ? s.sizes[k] : [...v])]));
  return s;
})();
function saveSettings() { try { localStorage.setItem('inkbook.settings', JSON.stringify(S)); } catch { } applyTheme(); }
function applyTheme() {
  const r = document.documentElement;
  r.dataset.theme = S.theme; r.dataset.font = S.uiFont; r.dataset.desk = S.desk; r.dataset.cover = S.coverSize;
  r.style.setProperty('--accent', S.accent);
  r.style.setProperty('--accent-soft', S.accent + '29');
  document.title = S.appName; $('#appName').textContent = S.appName;
  const dark = S.theme === 'dark' || (S.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name=theme-color]').content = dark ? '#1d1f25' : '#ffffff';
}

// ---------- Storage (IndexedDB) ----------
const db = (() => {
  let p;
  const open = () => p ||= new Promise((res, rej) => {
    const r = indexedDB.open('inkbook', 2);
    r.onupgradeneeded = () => {
      const d = r.result, has = n => d.objectStoreNames.contains(n);
      if (!has('notebooks')) d.createObjectStore('notebooks', { keyPath: 'id' });
      if (!has('pages')) d.createObjectStore('pages', { keyPath: 'id' }).createIndex('nb', 'notebookId');
      if (!has('blobs')) d.createObjectStore('blobs');
      if (!has('folders')) d.createObjectStore('folders', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const wrap = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const st = async (n, m = 'readonly') => (await open()).transaction(n, m).objectStore(n);
  return {
    get: async (n, k) => wrap((await st(n)).get(k)),
    all: async n => wrap((await st(n)).getAll()),
    keys: async n => wrap((await st(n)).getAllKeys()),
    put: async (n, v, k) => wrap(k === undefined ? (await st(n, 'readwrite')).put(v) : (await st(n, 'readwrite')).put(v, k)),
    del: async (n, k) => wrap((await st(n, 'readwrite')).delete(k)),
    pagesOf: async id => wrap((await st('pages')).index('nb').getAll(id)),
  };
})();
const normPage = p => { p.strokes ||= []; p.texts ||= []; p.images ||= []; p.tables ||= []; return p; };
const pageBlobKeys = p => [p.bgKey, ...(p.images || []).map(i => i.key)].filter(Boolean);
async function copyBlob(key, prefix = 'img_') {
  const b = await db.get('blobs', key); if (!b) return null;
  const k = prefix + uid(); await db.put('blobs', b, k); return k;
}

// Decoded images (PDF backgrounds + inserted pictures) — small LRU to protect iPad memory
const imgCache = new Map(), imgLoading = new Map();
const cachedImg = k => imgCache.get(k);
function loadImg(key) {
  if (imgCache.has(key)) { const v = imgCache.get(key); imgCache.delete(key); imgCache.set(key, v); return Promise.resolve(v); }
  if (!imgLoading.has(key)) imgLoading.set(key, db.get('blobs', key).then(async b => {
    if (!b) return null;
    let img;
    try { img = await createImageBitmap(b); }
    catch { img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(b); }); }
    imgCache.set(key, img);
    while (imgCache.size > 16) { const [k, v] = imgCache.entries().next().value; v.close?.(); imgCache.delete(k); }
    return img;
  }).finally(() => imgLoading.delete(key)));
  return imgLoading.get(key);
}
const preloadPage = p => Promise.all(pageBlobKeys(p).map(loadImg));
function clearImgCache() { for (const v of imgCache.values()) v.close?.(); imgCache.clear(); }

// ---------- Rendering ----------
const PEN_K = { ball: [0.85, 0.3], fount: [0.35, 1.15], brush: [0.15, 1.9] };
function widthAt(st, pr) { if (!st.pr) return st.w; const k = PEN_K[st.ps] || PEN_K.fount; return st.w * (k[0] + pr * k[1]); }
function penSeg(ctx, st, s, i, n) {
  const q = st.p, j = i * 3;
  const sx = i === 1 ? q[0] : (q[j - 3] + q[j]) / 2, sy = i === 1 ? q[1] : (q[j - 2] + q[j + 1]) / 2;
  const last = i === n - 1, ex = last ? q[j] : (q[j] + q[j + 3]) / 2, ey = last ? q[j + 1] : (q[j + 1] + q[j + 4]) / 2;
  ctx.lineWidth = Math.max(0.6, widthAt(st, q[j + 2]) * s);
  ctx.beginPath(); ctx.moveTo(sx * s, sy * s); ctx.quadraticCurveTo(q[j] * s, q[j + 1] * s, ex * s, ey * s); ctx.stroke();
}
function drawStroke(ctx, st, s, dark) {
  const q = st.p, n = q.length / 3; if (!n) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = st.c; ctx.fillStyle = st.c;
  if (st.t === 'hl') { ctx.globalAlpha = dark ? 0.45 : 0.4; if (!dark) ctx.globalCompositeOperation = 'multiply'; }
  if (st.poly || st.t === 'hl') {
    ctx.lineWidth = st.w * s; ctx.beginPath(); ctx.moveTo(q[0] * s, q[1] * s);
    if (n === 1) ctx.lineTo(q[0] * s + 0.01, q[1] * s);
    if (st.poly) for (let i = 1; i < n; i++) ctx.lineTo(q[i * 3] * s, q[i * 3 + 1] * s);
    else {
      for (let i = 1; i < n - 1; i++) { const j = i * 3; ctx.quadraticCurveTo(q[j] * s, q[j + 1] * s, (q[j] + q[j + 3]) / 2 * s, (q[j + 1] + q[j + 4]) / 2 * s); }
      if (n > 1) ctx.lineTo(q[(n - 1) * 3] * s, q[(n - 1) * 3 + 1] * s);
    }
    ctx.stroke();
  } else if (n === 1) {
    ctx.beginPath(); ctx.arc(q[0] * s, q[1] * s, Math.max(0.5, widthAt(st, q[2]) * s / 2), 0, Math.PI * 2); ctx.fill();
  } else {
    // Consecutive pieces whose width rounds to the same value (1/8 px steps, 1/4 px when thick) share one path:
    // real Pencil pressure changes smoothly, so this cuts the stroke() calls a lot with no visible change.
    let cur = -1;
    for (let i = 1; i < n; i++) {
      const j = i * 3, lw = Math.max(0.6, widthAt(st, q[j + 2]) * s), qw = lw < 4 ? Math.round(lw * 8) / 8 : Math.round(lw * 4) / 4;
      const sx = i === 1 ? q[0] : (q[j - 3] + q[j]) / 2, sy = i === 1 ? q[1] : (q[j - 2] + q[j + 1]) / 2;
      const last = i === n - 1, ex = last ? q[j] : (q[j] + q[j + 3]) / 2, ey = last ? q[j + 1] : (q[j + 1] + q[j + 4]) / 2;
      if (qw !== cur) { if (cur > 0) ctx.stroke(); ctx.lineWidth = qw; ctx.beginPath(); ctx.moveTo(sx * s, sy * s); cur = qw; }
      ctx.quadraticCurveTo(q[j] * s, q[j + 1] * s, ex * s, ey * s);
    }
    if (cur > 0) ctx.stroke();
  }
  ctx.restore();
}
const LINED = { lined: [40, 130], narrow: [30, 120], wide: [52, 140] };
function drawTemplate(ctx, p, s) {
  const t = p.template; if (!t || t === 'blank') return;
  const dark = isDark(p.paperColor), W = p.w * s, H = p.h * s;
  const ink = dark ? 'rgba(255,255,255,0.14)' : 'rgba(60,80,140,0.2)', strong = dark ? 'rgba(255,255,255,0.32)' : 'rgba(60,80,140,0.45)';
  ctx.save(); ctx.strokeStyle = ctx.fillStyle = ink; ctx.lineWidth = Math.max(1, 1.1 * s);
  const hl = y => { ctx.moveTo(0, y * s); ctx.lineTo(W, y * s); }, vl = x => { ctx.moveTo(x * s, 0); ctx.lineTo(x * s, H); };
  const grid = g => { ctx.beginPath(); for (let x = g; x < p.w; x += g) vl(x); for (let y = g; y < p.h; y += g) hl(y); ctx.stroke(); };
  if (LINED[t]) {
    const [g, top] = LINED[t]; ctx.beginPath(); for (let y = top; y < p.h - 30; y += g) hl(y); ctx.stroke();
    ctx.strokeStyle = dark ? 'rgba(255,120,120,.28)' : 'rgba(229,72,77,.38)'; ctx.beginPath(); vl(100); ctx.stroke();
  } else if (t === 'grid') grid(40);
  else if (t === 'smallgrid') grid(20);
  else if (t === 'graph') { ctx.globalAlpha = 0.5; grid(10); ctx.globalAlpha = 1; ctx.strokeStyle = strong; grid(50); }
  else if (t === 'dots') {
    const r = Math.max(0.9, 1.8 * s); ctx.beginPath();
    for (let x = 40; x < p.w; x += 40) for (let y = 40; y < p.h; y += 40) { ctx.moveTo(x * s + r, y * s); ctx.arc(x * s, y * s, r, 0, Math.PI * 2); }
    ctx.fill();
  } else if (t === 'cornell') {
    ctx.beginPath(); for (let y = 160; y < p.h - 40; y += 40) hl(y); ctx.stroke();
    ctx.strokeStyle = strong; ctx.lineWidth = Math.max(1, 2 * s); ctx.beginPath();
    hl(120); ctx.moveTo(280 * s, 120 * s); ctx.lineTo(280 * s, (p.h - 260) * s); hl(p.h - 260); ctx.stroke();
  } else if (t === 'todo') {
    ctx.beginPath(); for (let y = 150; y < p.h - 40; y += 56) hl(y); ctx.stroke();
    ctx.strokeStyle = strong; ctx.lineWidth = Math.max(1, 1.8 * s);
    for (let y = 150; y < p.h - 40; y += 56) ctx.strokeRect(50 * s, (y - 38) * s, 26 * s, 26 * s);
  } else if (t === 'music') {
    ctx.strokeStyle = strong; ctx.beginPath();
    for (let top = 110; top + 48 < p.h - 60; top += 120) for (let k = 0; k < 5; k++) { const y = top + k * 12; ctx.moveTo(60 * s, y * s); ctx.lineTo((p.w - 60) * s, y * s); }
    ctx.stroke();
  }
  ctx.restore();
}
// A text box either has no width (t.w unset: it is as wide as its longest line and only breaks where you
// pressed Return) or a fixed width t.w in page units (it wraps inside that width). The width never depends
// on where the box sits on the page, so moving a box never re-wraps its text.
const textFont = (t, fs) => `${t.i ? 'italic ' : ''}${t.b ? '700 ' : ''}${fs}px ${FONTS[t.f] || FONTS.sans}`;
function wrapLines(ctx, t, s) {
  ctx.font = textFont(t, t.s * s);
  const maxW = t.w ? (t.w - 8) * s : Infinity, out = [];
  for (const para of (t.text || '').split('\n')) {
    if (maxW === Infinity) { out.push(para); continue; }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const test = line + word;
      if (line && ctx.measureText(test).width > maxW) { out.push(line.trimEnd()); line = word.trimStart(); }
      else line = test;
    }
    out.push(line);
  }
  return out;
}
let measureCtx = null;
const mctx = () => (measureCtx ||= document.createElement('canvas').getContext('2d'));
function textNaturalWidth(t) { const c = mctx(); c.font = textFont(t, t.s); return Math.max(0, ...(t.text || '').split('\n').map(l => c.measureText(l).width)) + 8; }
function textHeight(t) { return wrapLines(mctx(), t, 1).length * t.s * 1.3 + 4; }
// An auto-width box that would run past the page's right edge gets a fixed width so it wraps instead
function fitTextWidth(p, t) {
  if (t.w) return false;
  if (t.x + textNaturalWidth(t) > p.w - 10) { t.w = Math.round(Math.max(120, p.w - t.x - 10)); return true; }
  return false;
}
function drawTexts(ctx, p, s, list = p.texts) {
  for (const t of list) {
    if (!t.text) continue;
    const fs = t.s * s, lh = fs * 1.3, x = (t.x + 4) * s;
    let y = (t.y + 2) * s + fs * 0.15;
    fitTextWidth(p, t);
    const lines = wrapLines(ctx, t, s);
    ctx.fillStyle = t.c; ctx.textBaseline = 'top';
    for (const line of lines) { ctx.fillText(line, x, y); y += lh; }
  }
}
function drawImg(ctx, p, im, s, o = {}) {
  const b = cachedImg(im.key);
  if (b) ctx.drawImage(b, im.x * s, im.y * s, im.w * s, im.h * s);
  else {
    ctx.fillStyle = 'rgba(128,128,128,.12)'; ctx.fillRect(im.x * s, im.y * s, im.w * s, im.h * s);
    if (!o.sync) loadImg(im.key).then(() => { if (E.visible.has(p.id)) schedulePaint(p); });
  }
}
function renderPage(ctx, p, s, o = {}) {
  // o.ox / o.oy shift the view so a cropped region of the page can be drawn (previews, Ask Claude)
  ctx.setTransform(1, 0, 0, 1, -(o.ox || 0) * s, -(o.oy || 0) * s); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = p.paperColor || '#fff'; ctx.fillRect(0, 0, p.w * s, p.h * s);
  if (p.bgKey) {
    const img = cachedImg(p.bgKey);
    if (img) ctx.drawImage(img, (p.bgX || 0) * s, (p.bgY || 0) * s, (p.bgW || p.w) * s, (p.bgH || p.h) * s);
    else if (!o.sync) loadImg(p.bgKey).then(() => { if (E.visible.has(p.id)) schedulePaint(p); });
  }
  drawTemplate(ctx, p, s);
  // skip anything outside the area being drawn (big speed-up on full pages)
  const v = o.view, off = (a0, b0, a1, b1) => v && (a1 < v[0] || a0 > v[2] || b1 < v[1] || b0 > v[3]);
  for (const im of p.images) if (!o.skipImg?.has(im) && !off(im.x, im.y, im.x + im.w, im.y + im.h)) drawImg(ctx, p, im, s, o);
  const dark = isDark(p.paperColor);
  for (const st of p.strokes) {
    if (o.skip?.has(st)) continue;
    if (v) { const b = bbox(st), m = st.w; if (off(b[0] - m, b[1] - m, b[2] + m, b[3] + m)) continue; }
    const pd = globalThis.PLAY_DIM;                     // audio playback: ink written later than "now" is faded
    if (pd && !o.texts && st.ra === pd.id && st.rt > pd.t) { ctx.globalAlpha = 0.16; drawStroke(ctx, st, s, dark); ctx.globalAlpha = 1; continue; }
    drawStroke(ctx, st, s, dark);
  }
  if (o.texts) { drawTexts(ctx, p, s); drawTables(ctx, p, s); }
}
async function renderThumb(canvas, p) {
  await preloadPage(p);
  renderPage(canvas.getContext('2d'), p, canvas.width / p.w, { texts: true, sync: true });
}

// ---------- Modals ----------
function openModal(html, cls = '') {
  const back = document.createElement('div'); back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${cls}" role="dialog">${html}</div>`;
  const m = { el: back.firstElementChild, onClose: null, close() { if (!back.isConnected) return; back.remove(); m.onClose?.(); } };
  back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) m.close(); });
  document.body.appendChild(back); return m;
}
function promptText(title, value = '', placeholder = '') {
  return new Promise(res => {
    const m = openModal(`<h2>${esc(title)}</h2><input type="text" value="${esc(value)}" placeholder="${esc(placeholder)}"><div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>OK</button></div>`, 'small');
    const inp = $('input', m.el); let v = null;
    const ok = () => { v = inp.value.trim(); m.close(); };
    $('[data-ok]', m.el).onclick = ok; inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
    m.onClose = () => res(v); inp.focus(); inp.select();
  });
}
function wireSeg(root, onPick) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    $$('[data-v]', root).forEach(x => x.classList.toggle('on', x === b)); onPick(b.dataset.v);
  });
}
const segHtml = (opts, cur) => opts.map(([k, l]) => `<button class="chip${String(k) === String(cur) ? ' on' : ''}" data-v="${esc(k)}">${esc(l)}</button>`).join('');
const swatchHtml = (cols, cur) => cols.map(c => `<button class="cswatch${c === cur ? ' on' : ''}" data-v="${c}" style="--c:${c}"></button>`).join('');
let prog = null;
function showProgress(title) {
  closeProgress();
  prog = openModal(`<h2>${esc(title)}</h2><p class="msg" data-msg>Starting…</p><div class="progress"><i></i></div><p class="hint">Keep the app open until this finishes.</p>`, 'small');
  prog.el.parentElement.style.pointerEvents = 'auto';
  return prog;
}
function setProgress(msg, frac) { if (!prog) return; $('[data-msg]', prog.el).textContent = msg; if (frac != null) $('.progress i', prog.el).style.width = clamp(frac, 0, 1) * 100 + '%'; }
function closeProgress() { prog?.close(); prog = null; }
function readyToShare(blob, name, hint = 'Use “Save to Files” to keep it in iCloud Drive, or send it to another app.') {
  const isImg = blob.type.startsWith('image/'), url = isImg ? URL.createObjectURL(blob) : null;
  const m = openModal(`<h2>Ready</h2>${isImg ? `<div class="ready-img"><img src="${url}" alt=""></div>` : ''}<p class="msg">${esc(name)} · ${fmtSize(blob.size)}</p><p class="hint">${esc(hint)}</p>
    <div class="modal-actions"><button class="btn" data-close>Close</button><button class="btn primary" data-go>Share / Save…</button></div>`, 'small');
  $('[data-go]', m.el).onclick = async () => {
    const file = new File([blob], name, { type: blob.type });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); m.close(); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 30000); m.close();
  };
}

// ---------- Library ----------
const LIB = { view: 'home', folderId: null, q: '', open: new Set() };
let FOLDERS = [], NBS = [], coverUrls = [];
const folderById = id => FOLDERS.find(f => f.id === id);
function folderPath(id) { const out = []; let f = folderById(id), g = 0; while (f && g++ < 30) { out.unshift(f); f = folderById(f.parentId); } return out; }
const childFolders = pid => FOLDERS.filter(f => (f.parentId || null) === (pid || null)).sort((a, b) => a.name.localeCompare(b.name));
function subtreeIds(id) {
  const s = new Set([id]); let grew = true;
  while (grew) { grew = false; for (const f of FOLDERS) if (f.parentId && s.has(f.parentId) && !s.has(f.id)) { s.add(f.id); grew = true; } }
  return s;
}
function sortNbs(list) {
  const k = S.sort;
  return list.sort(k === 'name' ? (a, b) => a.title.localeCompare(b.title) : k === 'created' ? (a, b) => b.created - a.created : (a, b) => b.updated - a.updated);
}
const curFolder = () => LIB.view === 'folder' ? LIB.folderId : '';

async function showLibrary() {
  E.nb = null; closePopover();
  $('#editor').hidden = true; $('#library').hidden = false;
  FOLDERS = await db.all('folders'); NBS = await db.all('notebooks');
  if (LIB.view === 'folder' && !folderById(LIB.folderId)) { LIB.view = 'home'; LIB.folderId = null; }
  if (LIB.view === 'folder') folderPath(LIB.folderId).slice(0, -1).forEach(f => LIB.open.add(f.id));
  $('#layoutBtn').innerHTML = icon(S.libLayout === 'list' ? 'gridv' : 'list');
  renderSide(); renderCrumbs();
  coverUrls.forEach(u => URL.revokeObjectURL(u)); coverUrls = [];
  if (LIB.q.trim()) return renderSearch(LIB.q.trim());
  renderLibContent();
}
function renderCrumbs() {
  let html;
  if (LIB.q.trim()) html = `<span class="crumb cur">Search</span>`;
  else if (LIB.view === 'folder') {
    const path = folderPath(LIB.folderId);
    html = `<button class="crumb" data-crumb="">Home</button>` + path.map((f, i) => `<span class="crumb-sep">›</span>` +
      (i === path.length - 1 ? `<span class="crumb cur">${esc(f.name)}</span>` : `<button class="crumb" data-crumb="${f.id}">${esc(f.name)}</button>`)).join('');
  } else html = `<span class="crumb cur">${{ home: 'Home', fav: 'Favorites', recent: 'Recent', planner: 'Planner' }[LIB.view]}</span>`;
  $('#crumbs').innerHTML = html;
}
function nbMeta(n) {
  const f = folderById(n.folderId), secs = (n.sections || []).filter(s => (s.level || 1) === 1).length;
  return `${n.pages.length} pg${secs ? ` · ${secs} lesson${secs > 1 ? 's' : ''}` : ''} · ${fmtDate(n.updated)}${f && LIB.view !== 'folder' ? ' · ' + esc(f.name) : ''}`;
}
const newCard = list => list
  ? `<div class="row" data-new><div class="mini-cover dashed">${icon('plus')}</div><div class="row-main"><b>New notebook</b><span>Lined, grid, Cornell and more</span></div></div>`
  : `<div class="nb new-card"><div class="cover" data-new>${icon('plus')}<span>New notebook</span></div></div>`;
async function loadCovers(root) {
  for (const img of $$('img[data-key]', root)) {
    const b = await db.get('blobs', img.dataset.key);
    if (b) { const u = URL.createObjectURL(b); coverUrls.push(u); img.src = u; }
  }
}
function renderLibContent() {
  let folders = [], nbs = [];
  if (LIB.view === 'folder') { folders = childFolders(LIB.folderId); nbs = NBS.filter(n => n.folderId === LIB.folderId); }
  else if (LIB.view === 'fav') nbs = NBS.filter(n => n.starred);
  else if (LIB.view === 'recent') nbs = [...NBS].sort((a, b) => b.updated - a.updated).slice(0, 24);
  else { folders = childFolders(null); nbs = NBS.filter(n => !n.folderId || !folderById(n.folderId)); }
  if (LIB.view !== 'recent') sortNbs(nbs);
  const list = S.libLayout === 'list', canNew = LIB.view === 'home' || LIB.view === 'folder';
  let html = '';
  if (folders.length) html += `<h3 class="lib-sec">Folders</h3><div class="${list ? 'rows' : 'fgrid'}">${folders.map(f => folderCard(f, list)).join('')}</div>`;
  html += `<h3 class="lib-sec">${LIB.view === 'fav' ? 'Favorites' : LIB.view === 'recent' ? 'Recently edited' : 'Notebooks'}</h3>`;
  html += `<div class="${list ? 'rows' : 'grid'}">${canNew ? newCard(list) : ''}${nbs.map(n => nbCard(n, list)).join('')}</div>`;
  if (!nbs.length && LIB.view === 'fav') html += `<div class="empty">Tap ⋯ on a notebook → “Add to favorites”.</div>`;
  if (LIB.view === 'home' && !NBS.length && !FOLDERS.length)
    html += `<div class="empty">Welcome! Make a folder for each course, then notebooks inside it.<br>Coming from another notes app? Tap <b>Import notes</b> in the sidebar.</div>`;
  if (LIB.view === 'folder') html += `<div id="subjectSaved"></div>`;
  const box = $('#libContent'); box.innerHTML = html; loadCovers(box);
  if (LIB.view === 'folder') renderSubjectSaved(LIB.folderId);
}
async function renderSubjectSaved(folderId) {
  const ids = subtreeIds(folderId), nbs = NBS.filter(n => ids.has(n.folderId));
  const items = [];
  for (const nb of nbs) items.push(...await collectItems(nb, await db.pagesOf(nb.id)));
  const box = $('#subjectSaved'); if (!box || LIB.folderId !== folderId) return;
  if (!items.length) return;
  items.sort((a, b) => (b.created || 0) - (a.created || 0));
  box.innerHTML = `<h3 class="lib-sec">Saved in this subject · ${items.length}</h3><div class="rows">${items.slice(0, 80).map(it =>
    `<div class="row item-row" data-item="${it.nbId}|${it.pageId}|${it.box.join(',')}"><span class="kind"><span class="badge" style="--c:${ITEM_MAP[it.type].color}">${ITEM_MAP[it.type].label}</span></span>
      <div class="row-main"><b>${esc(it.title)}</b><span>${esc(it.nbTitle)} · p. ${it.pageNo}${it.section ? ' · ' + esc(it.section) : ''}${it.auto ? ' · from text' : ''}</span></div></div>`).join('')}</div>`;
}
async function renderSearch(q) {
  const ql = q.toLowerCase(), pages = await db.all('pages'), nbMap = new Map(NBS.map(n => [n.id, n]));
  const hl = s => esc(s).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), m => `<mark>${m}</mark>`);
  const fRes = FOLDERS.filter(f => f.name.toLowerCase().includes(ql));
  const nRes = NBS.filter(n => n.title.toLowerCase().includes(ql));
  const hits = [];
  for (const n of NBS) {
    for (const s of n.sections || []) if (s.title.toLowerCase().includes(ql)) hits.push({ nb: n, pageId: s.pageId, kind: s.level === 2 ? 'Topic' : 'Lesson', text: s.title, color: s.color });
    for (const it of n.items || []) if (it.title.toLowerCase().includes(ql)) hits.push({ nb: n, pageId: it.pageId, kind: ITEM_MAP[it.type]?.label || 'Saved', text: it.title, color: ITEM_MAP[it.type]?.color, box: it.box });
  }
  for (const p of pages) {
    const n = nbMap.get(p.notebookId); if (!n) continue;
    const words = [...(p.pdfWords || []), ...(p.ocr?.words || [])], wi = words.findIndex(w => w.t.toLowerCase().includes(ql.split(/\s+/)[0]));
    if (wi >= 0 && words.map(w => w.t).join(' ').toLowerCase().includes(ql)) {
      const w = words[wi], from = p.pdfWords?.includes(w) ? 'PDF' : 'Handwriting';
      hits.push({ nb: n, pageId: p.id, kind: from, text: words.slice(Math.max(0, wi - 5), wi + 9).map(x => x.t).join(' '), box: w.b, color: from === 'PDF' ? '#8d8d86' : '#12a594' });
    }
    for (const t of p.texts || []) {
      const i = t.text.toLowerCase().indexOf(ql);
      if (i >= 0) hits.push({ nb: n, pageId: p.id, kind: 'Text', text: (i > 30 ? '…' : '') + t.text.slice(Math.max(0, i - 30), i + q.length + 50), box: [t.x, t.y, t.x + 100, t.y + 40] });
    }
  }
  let html = '';
  if (fRes.length) html += `<h3 class="lib-sec">Folders</h3><div class="rows">${fRes.map(f => folderCard(f, true)).join('')}</div>`;
  if (nRes.length) html += `<h3 class="lib-sec">Notebooks</h3><div class="rows">${nRes.map(n => nbCard(n, true)).join('')}</div>`;
  if (hits.length) html += `<h3 class="lib-sec">Inside your notes</h3><div class="rows">${hits.slice(0, 100).map(h => {
    const pi = h.nb.pages.indexOf(h.pageId);
    return `<div class="row item-row" data-item="${h.nb.id}|${h.pageId}|${(h.box || []).join(',')}"><span class="kind"><span class="badge" style="--c:${h.color || '#8d8d86'}">${esc(h.kind)}</span></span>
      <div class="row-main"><b>${hl(h.text)}</b><span>${esc(h.nb.title)} · p. ${pi + 1}</span></div></div>`;
  }).join('')}</div>`;
  if (!html) html = `<div class="empty">Nothing found for “${esc(q)}”.<br><span class="hint">Search covers titles, lessons, saved items and typed text. Handwriting isn’t searchable — write with Apple Pencil inside a text box (Scribble) to make it searchable.</span></div>`;
  const box = $('#libContent'); box.innerHTML = html; loadCovers(box);
}
// ---------- Inline rename (double-tap a name) ----------
function inlineRename(el, value, save) {
  if (el.isContentEditable) return;
  el.contentEditable = 'plaintext-only'; if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
  el.classList.add('renaming'); el.textContent = value; el.focus();
  const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  const done = async () => {
    el.removeEventListener('blur', done); el.removeEventListener('keydown', onKey);
    el.contentEditable = 'false'; el.classList.remove('renaming');
    const v = el.textContent.replace(/\s+/g, ' ').trim();
    if (v && v !== value) await save(v); else el.textContent = value;
  };
  const onKey = e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
    if (e.key === 'Escape') { el.textContent = value; el.blur(); }
  };
  el.addEventListener('blur', done); el.addEventListener('keydown', onKey);
}
let libTap = null;
async function onLibClick(e) {
  const t = e.target;
  if (t.closest('.renaming')) return;
  const nameEl = t.closest('.nb-meta b');
  if (nameEl) {
    // single tap = open, double tap = rename
    const fEl = nameEl.closest('[data-fid]'), card = nameEl.closest('[data-id]'), now = Date.now();
    const f = fEl && folderById(fEl.dataset.fid), nb = card && NBS.find(n => n.id === card.dataset.id);
    if (libTap?.el === nameEl && now - libTap.t < 420) {
      clearTimeout(libTap.timer); libTap = null;
      if (f) return inlineRename(nameEl, f.name, async v => { f.name = v; await db.put('folders', f); showLibrary(); });
      if (nb) return inlineRename(nameEl, nb.title, async v => { nb.title = v; await db.put('notebooks', nb); showLibrary(); });
      return;
    }
    clearTimeout(libTap?.timer);
    libTap = { el: nameEl, t: now, timer: setTimeout(() => { libTap = null; if (f) openFolder(f.id); else if (nb) openNotebook(nb.id); }, 420) };
    return;
  }
  if (t.closest('[data-new]')) return newNotebook();
  const it = t.closest('[data-item]');
  if (it) { const [nbId, pageId, box] = it.dataset.item.split('|'); return openNotebook(nbId, { pageId, box: box ? box.split(',').map(Number) : null }); }
  const fEl = t.closest('[data-fid]');
  if (fEl) { const f = folderById(fEl.dataset.fid); if (t.closest('[data-fmenu]')) return folderMenu(f); if (t.closest('[data-openf]')) return openFolder(f.id); return; }
  const card = t.closest('[data-id]'); if (!card) return;
  const nb = NBS.find(n => n.id === card.dataset.id); if (!nb) return;
  if (t.closest('[data-star]')) { nb.starred = !nb.starred; await db.put('notebooks', nb); return showLibrary(); }
  if (t.closest('[data-menu]')) return nbMenu(nb);
  if (t.closest('[data-open]')) return openNotebook(nb.id);
}
function openFolder(id) {
  LIB.view = id ? 'folder' : 'home'; LIB.folderId = id || null; LIB.q = ''; $('#search').value = '';
  document.body.classList.remove('drawer-open'); showLibrary();
}
function folderOptions(sel) {
  const out = [`<option value="">Home (no folder)</option>`];
  const walk = (pid, d) => childFolders(pid).forEach(f => { out.push(`<option value="${f.id}"${f.id === sel ? ' selected' : ''}>${' '.repeat(d)}${esc(f.name)}</option>`); walk(f.id, d + 1); });
  walk(null, 0); return out.join('');
}
function folderPicker(title, exclude = new Set()) {
  const items = [{ label: 'Home (no folder)', value: '__root' }];
  const walk = (pid, d) => childFolders(pid).forEach(f => { if (exclude.has(f.id)) return; items.push({ label: ' '.repeat(d) + '📁 ' + f.name, value: f.id }); walk(f.id, d + 1); });
  walk(null, 0);
  return menu(title, items).then(v => v === null ? null : v === '__root' ? '' : v);
}
async function nbMenu(nb) {
  const v = await menu(nb.title, [
    { label: 'Open', value: 'open' },
    { label: nb.starred ? 'Remove from favorites' : 'Add to favorites', value: 'star' },
    { label: 'Customize cover…', value: 'cover', hint: 'Color, gradient, pattern, photo or first page' },
    { label: 'Edit name & folder', value: 'edit' },
    { label: 'Move to folder…', value: 'move' },
    { label: 'Duplicate', value: 'dup' },
    { label: 'Export as PDF', value: 'pdf' },
    { label: 'Export as Word (.docx)', value: 'docx' },
    { label: 'Delete notebook', value: 'del', danger: true },
  ]);
  if (v === 'open') return openNotebook(nb.id);
  if (v === 'star') { nb.starred = !nb.starred; await db.put('notebooks', nb); }
  if (v === 'edit') { const r = await notebookForm(nb); if (r) { Object.assign(nb, { title: r.title, color: r.color, folderId: r.folderId }); await db.put('notebooks', nb); } }
  if (v === 'cover') await coverEditor(nb);
  if (v === 'move') { const f = await folderPicker('Move to'); if (f !== null) { nb.folderId = f; await db.put('notebooks', nb); toast('Moved'); } }
  if (v === 'dup') await duplicateNotebook(nb);
  if (v === 'pdf') await exportPDF(nb, await orderedPages(nb));
  if (v === 'docx') await exportDocx(nb, await orderedPages(nb));
  if (v === 'del' && await confirmBox(`Delete “${nb.title}” and all its pages? This can’t be undone.`)) await deleteNotebook(nb);
  if (v) showLibrary();
}
async function folderMenu(f) {
  const v = await menu(f.name, [
    { label: 'Open', value: 'open' }, { label: 'Rename & color', value: 'edit' }, { label: 'New notebook here', value: 'nb' },
    { label: 'New subfolder', value: 'sub' }, { label: 'Move folder…', value: 'move' }, { label: 'Delete folder', value: 'del', danger: true },
  ]);
  if (v === 'open') return openFolder(f.id);
  if (v === 'edit') { const r = await folderForm(f); if (r) { Object.assign(f, r); await db.put('folders', f); } }
  if (v === 'nb') { LIB.view = 'folder'; LIB.folderId = f.id; return newNotebook(); }
  if (v === 'sub') await newFolder(f.id);
  if (v === 'move') { const to = await folderPicker('Move folder to', subtreeIds(f.id)); if (to !== null) { f.parentId = to || null; await db.put('folders', f); } }
  if (v === 'del' && await confirmBox(`Delete folder “${f.name}”? Its notebooks and subfolders move up one level — nothing is deleted.`, 'Delete folder')) {
    for (const c of childFolders(f.id)) { c.parentId = f.parentId || null; await db.put('folders', c); }
    for (const n of NBS.filter(n => n.folderId === f.id)) { n.folderId = f.parentId || ''; await db.put('notebooks', n); }
    await db.del('folders', f.id); if (LIB.folderId === f.id) { LIB.view = f.parentId ? 'folder' : 'home'; LIB.folderId = f.parentId || null; }
  }
  if (v) showLibrary();
}
async function newFolder(parentId = null) {
  const r = await folderForm(null, parentId); if (!r) return null;
  const f = { id: uid(), name: r.name, color: r.color, parentId: parentId || null, created: Date.now() };
  await db.put('folders', f); FOLDERS.push(f); if (parentId) LIB.open.add(parentId);
  return f;
}
async function notebookForm(nb) {
  const isNew = !nb;
  const v = nb ? { title: nb.title, color: nb.color, folderId: nb.folderId || '' }
    : { title: '', folderId: curFolder() || '', color: COVER_COLORS[Math.floor(Math.random() * 9)], paper: S.paper, paperColor: S.paperColor, size: S.pageSize };
  return new Promise(res => {
    const m = openModal(`<h2>${isNew ? 'New notebook' : 'Edit notebook'}</h2>
      <div class="field"><label class="lbl">Title</label><input type="text" name="title" value="${esc(v.title)}" placeholder="e.g. Lectures, Tutorials, Past papers"></div>
      <div class="field"><label class="lbl">Folder</label><select class="select" name="folder">${folderOptions(v.folderId)}</select></div>
      <div class="field"><label class="lbl">Cover color</label><div class="seg" data-k="color">${swatchHtml(COVER_COLORS, v.color)}</div></div>
      ${isNew ? `<div class="field"><label class="lbl">Paper</label><div class="seg" data-k="paper">${segHtml(TEMPLATES, v.paper)}</div></div>
      <div class="field"><label class="lbl">Page size</label><div class="seg" data-k="size">${segHtml(PAGE_SIZES.map(s => [s[0], s[1]]), v.size)}</div></div>
      <div class="field"><label class="lbl">Paper color</label><div class="seg" data-k="paperColor">${segHtml(PAPER_COLORS, v.paperColor)}</div></div>` : ''}
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>${isNew ? 'Create' : 'Save'}</button></div>`);
    $$('.seg[data-k]', m.el).forEach(seg => wireSeg(seg, val => (v[seg.dataset.k] = val)));
    let out = null;
    const ok = () => { v.title = $('[name=title]', m.el).value.trim() || 'Untitled'; v.folderId = $('[name=folder]', m.el).value; out = v; m.close(); };
    $('[data-ok]', m.el).onclick = ok;
    $('[name=title]', m.el).onkeydown = e => { if (e.key === 'Enter') ok(); };
    m.onClose = () => res(out);
    if (isNew) $('[name=title]', m.el).focus();
  });
}
function makeNotebook(o) {
  const now = Date.now(), size = PAGE_SIZES.find(s => s[0] === (o.size || S.pageSize)) || PAGE_SIZES[0];
  return { id: uid(), title: o.title || 'Untitled', folderId: o.folderId || '', color: o.color || COVER_COLORS[0], paper: o.paper || S.paper,
    paperColor: o.paperColor || S.paperColor, pw: size[2], ph: size[3], created: now, updated: now, pages: [], sections: [], items: [], coverKey: null };
}
async function newNotebook() {
  const v = await notebookForm(null); if (!v) return;
  const nb = makeNotebook(v), p = newPage(nb); nb.pages = [p.id];
  await db.put('pages', p); await db.put('notebooks', nb);
  openNotebook(nb.id);
}
async function orderedPages(nb) {
  const map = new Map((await db.pagesOf(nb.id)).map(p => [p.id, normPage(p)]));
  return nb.pages.map(id => map.get(id)).filter(Boolean);
}
async function deleteNotebook(nb) {
  for (const p of await db.pagesOf(nb.id)) { await db.del('pages', p.id); for (const k of pageBlobKeys(p)) await db.del('blobs', k); }
  for (const k of [nb.thumbKey, nb.cover?.imgKey]) if (k) await db.del('blobs', k);
  await db.del('notebooks', nb.id);
}
async function duplicateNotebook(nb) {
  showProgress('Duplicating…');
  const copy = { ...structuredClone(nb), id: uid(), title: nb.title + ' copy', created: Date.now(), updated: Date.now(), pages: [] };
  const idMap = {}, pages = await orderedPages(nb);
  for (const [i, p] of pages.entries()) {
    setProgress(`Page ${i + 1} of ${pages.length}`, i / pages.length);
    const np = { ...structuredClone(p), id: uid(), notebookId: copy.id };
    if (p.bgKey) np.bgKey = await copyBlob(p.bgKey, 'bg_');
    for (const im of np.images) im.key = await copyBlob(im.key);
    idMap[p.id] = np.id; copy.pages.push(np.id); await db.put('pages', np);
  }
  copy.sections = (copy.sections || []).map(s => ({ ...s, id: uid(), pageId: idMap[s.pageId] })).filter(s => s.pageId);
  copy.items = (copy.items || []).map(s => ({ ...s, id: uid(), pageId: idMap[s.pageId] })).filter(s => s.pageId);
  copy.coverKey = null; const first = await db.get('pages', copy.pages[0]); copy.coverKey = first?.bgKey || null;
  await db.put('notebooks', copy); closeProgress(); toast('Duplicated');
}
async function newMenu() {
  const v = await menu('Create', [
    { label: 'New notebook', value: 'nb', hint: LIB.view === 'folder' ? 'In ' + folderById(LIB.folderId)?.name : 'Paper, size and cover of your choice' },
    { label: 'New folder', value: 'folder', hint: LIB.view === 'folder' ? 'Inside ' + folderById(LIB.folderId)?.name : 'For a course, semester or subject' },
    { label: 'Import notes (PDF, Word, ZIP, photos)…', value: 'import', hint: 'Bring notes over from another app' },
    { label: 'Convert a file (PDF ↔ Word)…', value: 'convert' },
  ]);
  if (v === 'nb') await newNotebook();
  if (v === 'folder') { if (await newFolder(curFolder() || null)) showLibrary(); }
  if (v === 'import') await importNotesFlow();
  if (v === 'convert') await converterFlow();
}

// ---------- Editor state ----------
const scroller = $('#scroller'), pagesEl = $('#pages');
const live = document.createElement('canvas'); live.className = 'live';
const lctx = live.getContext('2d');
const E = {
  nb: null, pages: [], byId: new Map(), els: new Map(), visible: new Set(),
  tool: 'pen', color: { pen: S.pen[0], hl: S.hl[0] }, size: { pen: 1, hl: 1, eraser: 1, shape: 1, text: 1 },
  zoom: 1, unit: 1, undo: [], redo: [], sel: null, moving: false, clip: null, lastIdx: -1,
};
let active = null, pinch = null, io = null, liveQueued = false, selMenu = null, pasteMenu = null, pop = null, tapG = null;
const laser = { el: null, pts: [], raf: 0 };
const sz = t => (E.pw && E.pw.t === t) ? E.pw.w : S.sizes[t][E.size[t]];   // E.pw: width from a pen preset
const palFor = t => t === 'hl' ? 'hl' : ['pen', 'shape', 'text', 'lasso'].includes(t) ? 'pen' : null;
const sizeKey = t => ['pen', 'hl', 'eraser', 'shape', 'text'].includes(t) ? t : null;

function newPage(nb, o = {}) {
  return { id: uid(), notebookId: nb.id, w: o.w ?? nb.pw ?? PAGE_W, h: o.h ?? nb.ph ?? A4_H, template: o.template ?? nb.paper ?? 'lined',
    paperColor: o.paperColor ?? nb.paperColor ?? '#ffffff', bgKey: null, strokes: [], texts: [], images: [] };
}
async function openNotebook(id, goto) {
  const nb = await db.get('notebooks', id); if (!nb) return;
  nb.sections ||= []; nb.items ||= [];
  const map = new Map((await db.pagesOf(id)).map(p => [p.id, normPage(p)]));
  E.nb = nb; E.pages = nb.pages.map(pid => map.get(pid)).filter(Boolean);
  if (!E.pages.length) { const p = newPage(nb); E.pages.push(p); await db.put('pages', p); }
  nb.pages = E.pages.map(p => p.id);
  E.byId = new Map(E.pages.map(p => [p.id, p]));
  E.undo = []; E.redo = []; E.sel = null; E.zoom = 1; E.lastIdx = -1;
  $('#library').hidden = true; $('#editor').hidden = false; document.body.classList.remove('drawer-open');
  $('#nbTitle').textContent = nb.title;
  $('#edSide').hidden = !S.sideOpen; $('#sideBtn').classList.toggle('on', S.sideOpen);
  updateToolbar(); buildPages(); updateZoomLabel();
  const gi = goto?.pageId ? E.pages.findIndex(p => p.id === goto.pageId) : -1;
  scrollToPage(gi >= 0 ? gi : clamp(nb.lastPage || 0, 0, E.pages.length - 1));
  if (gi >= 0 && goto.box?.length === 4) goToBox(E.pages[gi], goto.box);
  updateInd(); if (S.sideOpen) renderEdSide();
}
async function leaveNotebook() {
  if (!E.nb) return;
  clearSelection(); hidePasteMenu(); closePopover(); document.activeElement?.blur?.();
  await globalThis.onLeaveNb?.();
  E.nb.lastPage = currentIndex();
  await flush();
  try { await makeThumb(E.nb, E.pages); } catch (e) { console.warn(e); }
  await saveNb();
  io?.disconnect(); sideIO?.disconnect(); pagesEl.innerHTML = ''; E.els.clear(); E.visible.clear(); clearImgCache();
  E.nb = null; showLibrary();
}
async function saveNb() { if (!E.nb) return; E.nb.pages = E.pages.map(p => p.id); E.nb.coverKey = E.pages[0]?.bgKey || null; await db.put('notebooks', E.nb); }

const dirty = new Set(); let saveT = null;
function markDirty(p) { p.rev = (p.rev || 0) + 1; dirty.add(p); clearTimeout(saveT); saveT = setTimeout(flush, 700); if (S.sideOpen) queueThumb(p); }
async function flush() {
  clearTimeout(saveT); const list = [...dirty]; dirty.clear();
  for (const p of list) await db.put('pages', p);
  if (E.nb && list.length) { E.nb.updated = Date.now(); await db.put('notebooks', E.nb); }
}

function buildPages() {
  io?.disconnect(); pagesEl.innerHTML = ''; E.els.clear(); E.visible.clear(); live.remove(); hideSelMenu(); hidePasteMenu();
  io = new IntersectionObserver(onIntersect, { root: scroller, rootMargin: '60% 0px' });
  const starts = new Map(), list = secList(); let lessonNo = 0;
  for (const e of list) {
    if ((e.s.level || 1) === 1) lessonNo++;
    const [a, b] = secRange(e, list), topics = (e.s.level || 1) === 1 ? list.filter(x => x.s.level === 2 && x.i >= a && x.i < b).length : 0;
    if (!starts.has(e.i)) starts.set(e.i, []);
    starts.get(e.i).push({ s: e.s, no: lessonNo, meta: `${b - a} page${b - a > 1 ? 's' : ''}${topics ? ` · ${topics} topic${topics > 1 ? 's' : ''}` : ''}` });
  }
  E.pages.forEach((p, i) => {
    const el = document.createElement('div'); el.className = 'page' + (p.bookmark ? ' bookmarked' : ''); el.dataset.id = p.id;
    el.innerHTML = '<canvas class="ink"></canvas><div class="text-layer"></div><div class="page-num"></div>' +
      ['t', 'b', 'l', 'r'].map(d => `<div class="grow grow-${d}" data-grow="${d}" title="Drag to grow the page"><i></i></div>`).join('');
    const tabs = starts.get(i);
    if (tabs) el.insertAdjacentHTML('beforeend', `<div class="page-tabs">${tabs.map(({ s, no }) => tabHtml(s, no)).join('')}</div>`);
    pagesEl.appendChild(el); E.els.set(p.id, el); renderTexts(p, el); io.observe(el);
  });
  layout();
}
function onIntersect(entries) {
  for (const en of entries) {
    const p = E.byId.get(en.target.dataset.id); if (!p) continue;
    if (en.isIntersecting) { E.visible.add(p.id); schedulePaint(p); }
    else { E.visible.delete(p.id); const c = en.target.querySelector('canvas.ink'); c.width = c.height = 0; }
  }
}
function layout(again = true, ratio = 0) {
  const cw = scroller.clientWidth, base = Math.min(cw - 40, 980) * E.zoom;
  E.unit = base / PAGE_W;
  E.pages.forEach((p, i) => {
    const el = E.els.get(p.id); if (!el) return;
    el.style.width = p.w * E.unit + 'px'; el.style.height = p.h * E.unit + 'px';
    el.style.setProperty('--s', E.unit); el.style.background = p.paperColor;
    el.querySelector('.page-num').textContent = i + 1;
  });
  $$('.sec-divider', pagesEl).forEach(d => (d.style.width = base + 'px'));
  if (again && scroller.clientWidth !== cw) return layout(false, ratio);
  if (ratio) {
    // Zoom: keep showing the current (slightly blurry) picture at the new size, then sharpen it page by
    // page over the next frames, nearest page first, so the app never freezes after a pinch.
    for (const id of E.visible) {
      const el = E.els.get(id), c = el?.querySelector('canvas.ink'), g = el?._reg; if (!g) continue;
      c.style.left = g.x0 * ratio + 'px'; c.style.top = g.y0 * ratio + 'px'; c.style.width = (g.x1 - g.x0) * ratio + 'px'; c.style.height = (g.y1 - g.y0) * ratio + 'px';
      el._reg = null; schedulePaint(E.byId.get(id));
    }
  } else for (const id of E.visible) paint(E.byId.get(id));
  if (E.sel) { showSelMenu(); scheduleLive(); }
}
// Each page's canvas covers only the part of the page that is on screen (plus a margin), at the full
// screen resolution. Zooming in stays crisp, memory stays low, and redraws only touch visible ink.
const REG_MARGIN = 0.3;
function pageRegion(el, margin = REG_MARGIN) {
  const sr = scroller.getBoundingClientRect(), r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const mx = sr.width * margin, my = sr.height * margin;
  const x0 = clamp(sr.left - mx - r.left, 0, r.width), x1 = clamp(sr.right + mx - r.left, 0, r.width);
  const y0 = clamp(sr.top - my - r.top, 0, r.height), y1 = clamp(sr.bottom + my - r.top, 0, r.height);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) };
}
function paint(p) {
  const el = E.els.get(p?.id); if (!el) return;
  const c = el.querySelector('canvas.ink');
  const g = pageRegion(el);
  if (!g) { c.width = c.height = 0; el._reg = null; return; }
  const cw = g.x1 - g.x0, ch = g.y1 - g.y0;
  let r = Math.min(devicePixelRatio || 1, 3);
  if (cw * ch * r * r > MAX_PX) r = Math.sqrt(MAX_PX / (cw * ch));
  const W = Math.max(1, Math.round(cw * r)), H = Math.max(1, Math.round(ch * r));
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  c.style.left = g.x0 + 'px'; c.style.top = g.y0 + 'px'; c.style.width = cw + 'px'; c.style.height = ch + 'px';
  el._scale = (W / cw) * E.unit;                     // canvas pixels per page unit
  el._ox = g.x0 / E.unit; el._oy = g.y0 / E.unit; el._reg = g;
  const sel = E.moving && E.sel?.page === p ? E.sel : null;
  renderPage(c.getContext('2d'), p, el._scale, { skip: sel?.strokes, skipImg: sel?.images, ox: el._ox, oy: el._oy, view: [el._ox, el._oy, el._ox + cw / E.unit, el._oy + ch / E.unit] });
  if (live.parentNode === el) scheduleLive();
}
// When scrolling brings an unpainted part of a page into view, repaint that page
function checkRegions() {
  for (const id of E.visible) {
    const el = E.els.get(id), g = el && pageRegion(el, 0.04), have = el?._reg;
    if (!g) continue;
    if (!have || g.x0 < have.x0 || g.y0 < have.y0 || g.x1 > have.x1 || g.y1 > have.y1) schedulePaint(E.byId.get(id));
  }
}
// Sets a canvas context to draw in page units for the painted region of a page
function setPageTransform(ctx, el) { const s = el._scale || 1; ctx.setTransform(1, 0, 0, 1, -(el._ox || 0) * s, -(el._oy || 0) * s); }
const paintQ = new Set(); let paintRaf = 0;
function schedulePaint(p) {
  if (!p) return;
  paintQ.add(p);
  if (!paintRaf) paintRaf = requestAnimationFrame(runPaintQ);
}
function runPaintQ() {
  paintRaf = 0; if (pinch?.live) { paintRaf = requestAnimationFrame(runPaintQ); return; }   // wait until the fingers lift
  const sr = scroller.getBoundingClientRect(), mid = sr.top + sr.height / 2;
  const dist = p => { const r = E.els.get(p.id)?.getBoundingClientRect(); return r ? (mid < r.top ? r.top - mid : mid > r.bottom ? mid - r.bottom : 0) : 1e9; };
  const l = [...paintQ].sort((a, b) => dist(a) - dist(b)), t0 = performance.now();
  for (const p of l) { if (performance.now() - t0 > 10 && paintQ.size < l.length) break; paintQ.delete(p); paint(p); }
  if (paintQ.size) paintRaf = requestAnimationFrame(runPaintQ);
}
function refreshPage(p) { const el = E.els.get(p.id); if (!el) return; renderTexts(p, el); if (E.visible.has(p.id)) paint(p); }
function currentIndex() {
  const mid = scroller.scrollTop + scroller.clientHeight * 0.4; let best = 0;
  E.pages.forEach((p, i) => { const el = E.els.get(p.id); if (el && el.offsetTop <= mid) best = i; });
  return best;
}
function scrollToPage(i, smooth) {
  const el = E.els.get(E.pages[i]?.id); if (!el) return;
  // Centre the page horizontally (pages can have different widths) and, if it fits, vertically too
  const vw = scroller.clientWidth, vh = scroller.clientHeight;
  const left = el.offsetLeft + el.offsetWidth / 2 - vw / 2;
  const blockTop = el.offsetTop - ($('.page-tabs', el) ? 30 : 0), blockH = el.offsetTop + el.offsetHeight - blockTop;
  const top = blockH + 20 < vh ? blockTop - (vh - blockH) / 2 : blockTop - 10;
  scroller.scrollTo({ top: Math.max(0, top), left: Math.max(0, left), behavior: smooth ? 'smooth' : 'auto' });
}
function goToBox(p, box) {
  const el = E.els.get(p.id); if (!el) return;
  scroller.scrollTop = el.offsetTop + box[1] * E.unit - scroller.clientHeight * 0.25;
  const f = document.createElement('div'); f.className = 'flash';
  f.style.setProperty('--x', box[0] - 8); f.style.setProperty('--y', box[1] - 8);
  f.style.setProperty('--w', box[2] - box[0] + 16); f.style.setProperty('--h', box[3] - box[1] + 16);
  el.appendChild(f); setTimeout(() => f.remove(), 1900);
}
function updateInd() {
  if (!E.nb) return;
  const i = currentIndex(), { lesson, topic } = secAt(i), sec = topic || lesson, p = E.pages[i];
  $('#pageInd').innerHTML = `${sec ? `<b>${esc(sec.title)}</b> · ` : ''}${i + 1} / ${E.pages.length}`;
  $('#bookmarkBtn').classList.toggle('on', !!p?.bookmark);
  if (i !== E.lastIdx) {
    E.els.get(E.pages[E.lastIdx]?.id)?.classList.remove('cur'); E.els.get(p?.id)?.classList.add('cur');
    E.lastIdx = i; if (S.sideOpen) updateSideCurrent(i);
  }
}
function updateZoomLabel() { $('#zoomLbl').textContent = Math.round(E.zoom * 100) + '%'; }
// Zoom keeps the exact spot under your fingers (or the screen centre) in place: remember which page point
// is under that screen point, re-layout, then scroll so the same page point is back under it.
function anchorAt(cx, cy) {
  let best = null, bd = Infinity;
  for (const p of E.pages) {
    const el = E.els.get(p.id); if (!el) continue;
    const r = el.getBoundingClientRect(), d = cy < r.top ? r.top - cy : cy > r.bottom ? cy - r.bottom : 0;
    if (d < bd) { bd = d; best = { p, r }; if (!d) break; }
  }
  return best && { p: best.p, fx: (cx - best.r.left) / best.r.width, fy: (cy - best.r.top) / best.r.height };
}
function restoreAnchor(a, cx, cy) {
  if (!a) return;
  const r = E.els.get(a.p.id).getBoundingClientRect();
  scroller.scrollLeft += r.left + a.fx * r.width - cx;
  scroller.scrollTop += r.top + a.fy * r.height - cy;
}
function zoomAt(z, cx, cy) {
  z = clamp(z, ZMIN, ZMAX); if (Math.abs(z / E.zoom - 1) < 0.001) return;
  const a = anchorAt(cx, cy);
  const ratio = z / E.zoom; E.zoom = z; layout(true, ratio); updateZoomLabel(); restoreAnchor(a, cx, cy);
}
function zoomCenter(z) { const r = scroller.getBoundingClientRect(); zoomAt(z, r.left + r.width / 2, r.top + r.height / 2); }

// ---------- Toolbar & tool options ----------
function setTool(t) {
  if (t !== 'lasso') clearSelection();
  hidePasteMenu(); closePopover(); document.activeElement?.blur?.();
  E.tool = t; updateToolbar();
}
function updateToolbar() {
  $$('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === E.tool));
  scroller.classList.toggle('tool-text', E.tool === 'text');
  buildToolOptions($('#optsInline'), false);
  const pal = palFor(E.tool), ob = $('#optsBtn');
  ob.style.setProperty('--c', pal ? E.color[pal] : 'transparent'); ob.classList.toggle('nocolor', !pal);
  if (pop?.dataset.kind === 'tool') buildToolOptions(pop.firstElementChild, true);
  updateUndoBtns(); updatePencilBtn();
}
function sizeDot(sk, v) {
  if (sk === 'text') return `<span style="font-size:${Math.round(clamp(9 + v * 0.35, 10, 24))}px">A</span>`;
  const d = sk === 'hl' ? 4 + v * 0.45 : sk === 'eraser' ? 4 + v * 0.35 : 3 + v * 1.4;
  return `<i style="--d:${Math.round(clamp(d, 3, 20))}px"></i>`;
}
function buildToolOptions(box, full) {
  box.innerHTML = '';
  const t = E.tool, pal = palFor(t), sk = sizeKey(t);
  const add = html => { box.insertAdjacentHTML('beforeend', html); return box.lastElementChild; };
  if (full) add(`<div class="pop-title">${TOOL_NAMES[t]}</div>`);
  if (pal) {
    const row = add(`<div class="opt-row swatches"></div>`);
    S[pal].forEach((c, i) => {
      const b = document.createElement('button'); b.className = 'swatch' + (E.color[pal] === c ? ' on' : '');
      b.style.setProperty('--c', c); b.title = 'Tap again to change this color';
      b.onclick = () => onSwatch(pal, i, b); row.appendChild(b);
    });
  }
  if (sk) {
    const row = add(`<div class="opt-row sizes"></div>`);
    S.sizes[sk].forEach((v, i) => {
      const b = document.createElement('button'); b.className = 'size' + (E.size[sk] === i ? ' on' : ''); b.innerHTML = sizeDot(sk, v);
      b.onclick = () => { E.size[sk] = i; E.pw = null; updateToolbar(); }; row.appendChild(b);
    });
    if (full) {
      const [mn, mx, step] = SIZE_RANGE[sk], cur = S.sizes[sk][E.size[sk]];
      const r = add(`<label class="opt-slider"><span>Size</span><input type="range" min="${mn}" max="${mx}" step="${step}" value="${cur}"><b>${cur}</b></label>`);
      const inp = $('input', r);
      inp.oninput = () => { E.pw = null; S.sizes[sk][E.size[sk]] = +inp.value; $('b', r).textContent = inp.value; buildToolOptions($('#optsInline'), false); };
      inp.onchange = () => { saveSettings(); updateToolbar(); };
    }
  }
  if (!full) return;
  const seg = (label, opts, cur, on) => {
    const r = add(`<div class="opt-block"><div class="opt-label">${label}</div><div class="seg">${segHtml(opts, cur)}</div></div>`);
    wireSeg($('.seg', r), v => { on(v); saveSettings(); updateToolbar(); });
  };
  const tog = (label, key) => {
    const r = add(`<label class="toggle"><input type="checkbox" ${S[key] ? 'checked' : ''}><span>${label}</span></label>`);
    $('input', r).onchange = e => { S[key] = e.target.checked; saveSettings(); };
  };
  if (t === 'pen') { seg('Pen style', [['ball', 'Ballpoint'], ['fount', 'Fountain'], ['brush', 'Brush']], S.penStyle, v => (S.penStyle = v)); tog('Hold still at the end of a stroke to snap it into a straight line, rectangle or circle', 'shapeSnap'); }
  if (t === 'hl') tog('Straight highlighter lines', 'hlStraight');
  if (t === 'eraser') {
    seg('Erase', [['stroke', 'Whole stroke'], ['precise', 'Precise (partial)']], S.eraserMode, v => (S.eraserMode = v));
    tog('Only erase highlighter', 'eraseHlOnly');
    const b = add(`<button class="btn danger-outline">Clear this page…</button>`); b.onclick = () => { closePopover(); clearPage(); };
  }
  if (t === 'shape') seg('Shape', SHAPES, S.shape, v => (S.shape = v));
  if (t === 'text') seg('Font', FONT_OPTS, S.font, v => (S.font = v));
  if (t === 'lasso') {
    seg('Select by', [['free', 'Freehand lasso'], ['rect', 'Rectangle']], S.selMode, v => (S.selMode = v));
    const b = add(`<button class="btn block" style="margin-top:6px">Select everything on this page</button>`);
    b.onclick = () => { closePopover(); selectAll(); };
    add(`<p class="opt-hint">Tap a stroke or image to select it. Drag inside the box to move, drag the round corner handle to resize. Tap an empty spot to paste. Tap a color above to recolor the selection.</p>`);
  }
  if (t === 'laser') add(`<p class="opt-hint">Point at things while presenting or explaining. The trail fades away and is never saved.</p>`);
}
function onSwatch(pal, i, b) {
  const c = S[pal][i];
  if (E.color[pal] === c && !(E.tool === 'lasso' && E.sel)) {
    const inp = $('#colorPick'); inp.value = c;
    inp.oninput = () => { S[pal][i] = inp.value; E.color[pal] = inp.value; b.style.setProperty('--c', inp.value); };
    inp.onchange = () => { saveSettings(); updateToolbar(); };
    inp.click();
  } else {
    E.color[pal] = c; if (E.tool === 'lasso' && E.sel) recolorSel(c); updateToolbar();
  }
}
function updateUndoBtns() { $('#undoBtn').disabled = !E.undo.length; $('#redoBtn').disabled = !E.redo.length; }
function updatePencilBtn() { $('#pencilBtn').classList.toggle('on', S.pencilOnly); scroller.classList.toggle('pencil-only', S.pencilOnly); }
function closePopover() { if (pop) { pop.remove(); pop = null; document.removeEventListener('pointerdown', popOutside, true); } }
function popOutside(e) { if (pop && !pop.contains(e.target) && !e.target.closest('[data-pop-anchor]') && e.target !== $('#colorPick')) closePopover(); }
// avoid: a screen rect the popover must not cover (e.g. the selected handwriting)
function openPopover(anchor, kind, build, avoid) {
  if (pop && pop._anchor === anchor) { closePopover(); return; }
  closePopover();
  pop = document.createElement('div'); pop.className = 'popover pop-' + kind; pop._anchor = anchor; pop.dataset.kind = kind;
  const inner = document.createElement('div'); pop.appendChild(inner); document.body.appendChild(pop);
  build(inner);
  placePopover(anchor, avoid);
  setTimeout(() => document.addEventListener('pointerdown', popOutside, true));
}
function placePopover(anchor, avoid) {
  if (!pop) return;
  const r = anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, M = 8, vw = innerWidth, vh = innerHeight;
  const cx = x => clamp(x, M, vw - w - M), cy = y => clamp(y, M + 50, vh - h - M);
  const c = [];
  if (avoid) c.push({ x: avoid.right + 14, y: cy(avoid.top) }, { x: avoid.left - 14 - w, y: cy(avoid.top) },
    { x: cx(avoid.left + avoid.width / 2 - w / 2), y: avoid.bottom + 14 }, { x: cx(avoid.left + avoid.width / 2 - w / 2), y: avoid.top - 14 - h });
  c.push({ x: cx(r.left + r.width / 2 - w / 2), y: r.bottom + 8 }, { x: cx(r.left + r.width / 2 - w / 2), y: r.top - h - 8 });
  const fits = q => q.x >= M && q.y >= M && q.x + w <= vw - M && q.y + h <= vh - M;
  const hits = q => avoid && !(q.x >= avoid.right || q.x + w <= avoid.left || q.y >= avoid.bottom || q.y + h <= avoid.top);
  const best = c.find(q => fits(q) && !hits(q)) || c.find(fits) || { x: M, y: M };
  pop.style.left = best.x + 'px'; pop.style.top = best.y + 'px';
  // drag the popover by its title if it's ever in the way
  const t = $('.pop-title', pop);
  if (t && !t._drag) {
    t._drag = true; t.classList.add('draggable');
    t.addEventListener('pointerdown', e => {
      e.preventDefault(); const sx = e.clientX - pop.offsetLeft, sy = e.clientY - pop.offsetTop;
      const mv = ev => { pop.style.left = clamp(ev.clientX - sx, 0, vw - 60) + 'px'; pop.style.top = clamp(ev.clientY - sy, 0, vh - 40) + 'px'; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
  }
}
function selScreenRect() {
  const s = E.sel; if (!s) return null;
  const r = E.els.get(s.page.id).getBoundingClientRect(), b = s.box, u = E.unit;
  return { left: r.left + b[0] * u, top: r.top + b[1] * u - 60, right: r.left + b[2] * u, bottom: r.top + b[3] * u, width: (b[2] - b[0]) * u, height: (b[3] - b[1]) * u + 60 };
}

// ---------- Undo ----------
const snap = p => ({ strokes: p.strokes.slice(), texts: p.texts.slice(), images: p.images.slice(), tables: (p.tables || []).map(t => structuredClone(t)), links: (p.links || []).map(l => ({ ...l })), geo: { w: p.w, h: p.h, bgX: p.bgX, bgY: p.bgY, bgW: p.bgW, bgH: p.bgH } });
function pushUndo(p, before) {
  E.undo.push({ id: p.id, before, after: snap(p) }); if (E.undo.length > 300) E.undo.shift();
  E.redo = []; markDirty(p); updateUndoBtns();
}
function applyHist(from, to, key) {
  clearSelection(); const u = from.pop(); if (!u) return;
  const p = E.byId.get(u.id); if (!p) return applyHist(from, to, key);
  p.strokes = u[key].strokes.slice(); p.texts = u[key].texts.slice(); p.images = u[key].images.slice();
  if (u[key].tables) p.tables = u[key].tables.map(t => structuredClone(t));
  if (u[key].links) p.links = u[key].links.map(l => ({ ...l }));
  const g = u[key].geo, resized = g && (g.w !== p.w || g.h !== p.h);
  if (g) Object.assign(p, g);
  to.push(u); refreshPage(p); markDirty(p); updateUndoBtns();
  if (resized) { layout(); toast(`↶ Page size ${p.w} × ${p.h}`, 900); }
}
const undo = () => applyHist(E.undo, E.redo, 'before');
const redo = () => applyHist(E.redo, E.undo, 'after');

// ---------- Geometry ----------
const bbCache = new WeakMap();
function bbox(st) {
  let b = bbCache.get(st); if (b) return b;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const q = st.p;
  for (let i = 0; i < q.length; i += 3) { x0 = Math.min(x0, q[i]); x1 = Math.max(x1, q[i]); y0 = Math.min(y0, q[i + 1]); y1 = Math.max(y1, q[i + 1]); }
  b = [x0, y0, x1, y1]; bbCache.set(st, b); return b;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function hitStroke(st, x, y, r) {
  const b = bbox(st), rr = r + st.w * 0.5;
  if (x < b[0] - rr || x > b[2] + rr || y < b[1] - rr || y > b[3] + rr) return false;
  const q = st.p, n = q.length / 3;
  if (n === 1) return Math.hypot(q[0] - x, q[1] - y) <= rr;
  for (let i = 1; i < n; i++) if (segDist(x, y, q[i * 3 - 3], q[i * 3 - 2], q[i * 3], q[i * 3 + 1]) <= rr) return true;
  return false;
}
function pip(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function densify(q, step) {
  const out = [q[0], q[1], q[2]];
  for (let i = 3; i < q.length; i += 3) {
    const d = Math.hypot(q[i] - q[i - 3], q[i + 1] - q[i - 2]), k = Math.floor(d / step);
    for (let j = 1; j < k; j++) { const t = j / k; out.push(q[i - 3] + (q[i] - q[i - 3]) * t, q[i - 2] + (q[i + 1] - q[i - 2]) * t, q[i - 1] + (q[i + 2] - q[i - 1]) * t); }
    out.push(q[i], q[i + 1], q[i + 2]);
  }
  return out;
}
const shiftPts = (q, dx, dy) => q.map((v, i) => i % 3 === 0 ? +(v + dx).toFixed(1) : i % 3 === 1 ? +(v + dy).toFixed(1) : v);
function shapePts(kind, x0, y0, x1, y1) {
  const P = [], add = (x, y) => P.push(+x.toFixed(1), +y.toFixed(1), 0.5);
  if (kind === 'line') { add(x0, y0); add(x1, y1); }
  else if (kind === 'arrow') {
    const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0), h = Math.min(30, L * 0.35) + 4;
    add(x0, y0); add(x1, y1); add(x1 - h * Math.cos(a - 0.45), y1 - h * Math.sin(a - 0.45)); add(x1, y1); add(x1 - h * Math.cos(a + 0.45), y1 - h * Math.sin(a + 0.45));
  } else if (kind === 'rect') { add(x0, y0); add(x1, y0); add(x1, y1); add(x0, y1); add(x0, y0); }
  else if (kind === 'ellipse') {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
    for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2; add(cx + rx * Math.cos(a), cy + ry * Math.sin(a)); }
  } else if (kind === 'triangle') { add((x0 + x1) / 2, y0); add(x1, y1); add(x0, y1); add((x0 + x1) / 2, y0); }
  return P;
}
// Shape recognition for "hold to snap". The stroke is first smoothed and re-spaced evenly, which removes
// Pencil jitter and the cluster of points made while holding still, then compared with a line, an
// ellipse and a rectangle. Tuned to accept honest hand-drawn shapes but leave scribbles alone.
function resampleStroke(q, step = 4) {
  const pts = [];
  for (let i = 0; i < q.length; i += 3) pts.push([q[i], q[i + 1]]);
  const sm = pts.map((p, i) => i === 0 || i === pts.length - 1 ? p
    : [(pts[i - 1][0] + p[0] * 2 + pts[i + 1][0]) / 4, (pts[i - 1][1] + p[1] * 2 + pts[i + 1][1]) / 4]);
  const out = [sm[0]]; let carry = 0;
  for (let i = 1; i < sm.length; i++) {
    let [ax, ay] = sm[i - 1]; const [bx, by] = sm[i]; let d = Math.hypot(bx - ax, by - ay);
    while (carry + d >= step) {
      const t = (step - carry) / d; ax += (bx - ax) * t; ay += (by - ay) * t; out.push([ax, ay]);
      d = Math.hypot(bx - ax, by - ay); carry = 0;
    }
    carry += d;
  }
  const last = sm[sm.length - 1];
  if (Math.hypot(last[0] - out[out.length - 1][0], last[1] - out[out.length - 1][1]) > step * 0.5) out.push(last);
  return out;
}
function recognize(q) {
  if (q.length / 3 < 4) return null;
  const P = resampleStroke(q), n = P.length;
  let L = 0; for (let i = 1; i < n; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  if (L < 40 || n < 6) return null;
  const [x0, y0] = P[0], [xe, ye] = P[n - 1], dEnd = Math.hypot(xe - x0, ye - y0);
  // Straight line
  if (dEnd > 40) {
    let maxDev = 0, sumDev = 0;
    for (const [x, y] of P) { const dev = Math.abs((xe - x0) * (y0 - y) - (x0 - x) * (ye - y0)) / dEnd; maxDev = Math.max(maxDev, dev); sumDev += dev; }
    if (L / dEnd < 1.15 && maxDev < Math.max(8, dEnd * 0.07) && sumDev / n < Math.max(3, dEnd * 0.03)) return { kind: 'line', x0, y0, x1: xe, y1: ye };
  }
  // Closed shapes: the end must come back near the start (a small gap or overshoot is fine)
  let bx0 = 1e9, by0 = 1e9, bx1 = -1e9, by1 = -1e9;
  for (const [x, y] of P) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
  const w = bx1 - bx0, h = by1 - by0; if (w < 30 || h < 30) return null;
  const m = Math.min(w, h), head = P.slice(0, Math.max(3, Math.round(n * 0.25)));
  const gap = Math.min(...head.map(([x, y]) => Math.hypot(x - xe, y - ye)));
  if (gap > m * 0.38 || dEnd > L * 0.3) return null;
  const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, rx = w / 2, ry = h / 2;
  let eErr = 0, eMax = 0, rErr = 0, rMax = 0;
  const C = [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]], corners = [Infinity, Infinity, Infinity, Infinity];
  for (const [x, y] of P) {
    const e = Math.abs(Math.hypot((x - cx) / rx, (y - cy) / ry) - 1); eErr += e; eMax = Math.max(eMax, e);
    const r = Math.min(Math.abs(x - bx0), Math.abs(x - bx1), Math.abs(y - by0), Math.abs(y - by1)) / m; rErr += r; rMax = Math.max(rMax, r);
    C.forEach(([kx, ky], k) => { corners[k] = Math.min(corners[k], Math.hypot(x - kx, y - ky)); });
  }
  eErr /= n; rErr /= n;
  // the path must also be about as long as the shape's outline (a scribble is much longer)
  const ellP = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry))), rectP = 2 * (w + h);
  const isEllipse = eErr < 0.12 && eMax < 0.35 && L / ellP > 0.8 && L / ellP < 1.35;
  const isRect = rErr < 0.08 && rMax < 0.25 && corners.every(d => d < m * 0.25) && L / rectP > 0.8 && L / rectP < 1.3;
  if (isRect && (!isEllipse || rErr < eErr)) return { kind: 'rect', x0: bx0, y0: by0, x1: bx1, y1: by1 };
  if (isEllipse) return { kind: 'ellipse', x0: bx0, y0: by0, x1: bx1, y1: by1 };
  return null;
}

// ---------- Pointer input (Pencil / finger / mouse) ----------
function toPt(a, e) { return { x: (e.clientX - a.rect.left) / a.rect.width * a.page.w, y: (e.clientY - a.rect.top) / a.rect.height * a.page.h }; }
function addPoint(a, ev) {
  const { x, y } = toPt(a, ev), q = a.stroke.p, n = q.length;
  let pr = ev.pointerType === 'pen' ? (ev.pressure || 0.5) : 0.5;
  if (n) { const dx = x - q[n - 3], dy = y - q[n - 2]; if (dx * dx + dy * dy < 0.36) return; pr = q[n - 1] * 0.6 + pr * 0.4; }
  q.push(+x.toFixed(1), +y.toFixed(1), +pr.toFixed(3));
}
function notePencil() {
  if (S.pencilSeen) return;
  S.pencilSeen = true; S.pencilOnly = true; saveSettings(); updatePencilBtn();
  toast('✏️ Apple Pencil detected — only the Pencil draws now; fingers scroll & pinch-zoom. Two-finger tap = undo. Tap ✋ to change.', 5500);
}
const handleR = () => 26 / E.unit;
let fingerTap = null;
function selHit(page, pt) {
  const sel = E.sel; if (!sel || sel.page !== page) return null;
  const b = sel.box;
  if (Math.hypot(pt.x - b[2], pt.y - b[3]) <= handleR()) return 'scale';
  if (pt.x >= b[0] && pt.x <= b[2] && pt.y >= b[1] && pt.y <= b[3]) return 'move';
  return null;
}
function hitObject(p, pt, strokesToo) {
  for (let i = p.images.length - 1; i >= 0; i--) {
    const im = p.images[i];
    if (pt.x >= im.x && pt.x <= im.x + im.w && pt.y >= im.y && pt.y <= im.y + im.h) return { images: new Set([im]) };
  }
  for (const t of p.texts) { const b = textBox(p, t); if (pt.x >= b[0] && pt.x <= b[2] && pt.y >= b[1] && pt.y <= b[3]) return { texts: new Set([t]) }; }
  for (let i = p.tables.length - 1; i >= 0; i--) { const t = p.tables[i], b = tableBox(p, t); if (pt.x >= b[0] && pt.x <= b[2] && pt.y >= b[1] && pt.y <= b[3]) return { tables: new Set([t]) }; }
  if (strokesToo) for (let i = p.strokes.length - 1; i >= 0; i--) if (hitStroke(p.strokes[i], pt.x, pt.y, 8)) return { strokes: new Set([p.strokes[i]]) };
  return null;
}
function onFingerUp(e) {
  const f = fingerTap; if (!f || e.pointerId !== f.id) return;
  fingerTap = null;
  if (e.type !== 'pointerup' || Date.now() - f.t > 400 || Math.hypot(e.clientX - f.x, e.clientY - f.y) > 10) return;
  if (globalThis.playSeekAt?.(f.page, f.pt)) return;
  const hit = hitObject(f.page, f.pt, false);
  if (hit) { if (E.tool !== 'lasso') setTool('lasso'); setSelection(f.page, hit.strokes, hit.images, hit.texts, hit.tables); }
  else if (E.sel) clearSelection();
}
function armHold(a) { clearTimeout(a.holdT); a.holdT = setTimeout(() => trySnap(a), 650); }
function trySnap(a) {
  if (active !== a || a.mode !== 'ink') return;
  const r = recognize(a.stroke.p); if (!r) return;
  a.mode = 'snapped'; a.snap = r;
  a.stroke = { t: 'pen', c: a.stroke.c, w: a.stroke.w, poly: true, p: shapePts(r.kind, r.x0, r.y0, r.x1, r.y1) };
  scheduleLive();
}
function onDown(e) {
  if (!E.nb || pinch) return;
  if (e.target.closest('.text-item, .tbl, .float-menu, .grow, .page-tabs, .hit, .plink-go')) return;
  if (e.pointerType === 'pen') { notePencil(); notePen(); }
  const pageEl = e.target.closest('.page');
  if (!pageEl) { if (E.tool === 'lasso') clearSelection(); hidePasteMenu(); return; }
  if (active) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const page = E.byId.get(pageEl.dataset.id);
  const a = { id: e.pointerId, type: e.pointerType, page, pageEl, rect: pageEl.getBoundingClientRect() };
  const pt = toPt(a, e); a.start = pt;
  if (S.pencilOnly && e.pointerType === 'touch') {
    // Fingers don't draw in Pencil-only mode — but they can tap to select, and drag a selection
    const hit = selHit(page, pt);
    if (!hit) { fingerTap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: Date.now(), page, pt }; return; }
    e.preventDefault(); closePopover();
    try { scroller.setPointerCapture(e.pointerId); } catch { }
    active = a; a.mode = hit; a.dx = a.dy = 0; a.k = 1; startSelOp(); scheduleLive(); return;
  }
  e.preventDefault(); closePopover(); hidePasteMenu();
  if (E.tool === 'text') { a.mode = 'text'; a.pt = pt; active = a; return; }
  try { scroller.setPointerCapture(e.pointerId); } catch { }
  active = a;
  const tool = E.tool;
  if (tool === 'pen' || tool === 'hl') {
    clearSelection(); a.mode = 'ink';
    a.stroke = { t: tool, c: E.color[tool], w: sz(tool), p: [] };
    if (tool === 'pen' && e.pointerType === 'pen' && S.penStyle !== 'ball') { a.stroke.pr = true; a.stroke.ps = S.penStyle; }
    if (tool === 'hl' && S.hlStraight) { a.stroke.poly = true; a.straight = true; }
    a.drawn = 0; a.fresh = true; addPoint(a, e);
    if (tool === 'pen' && S.shapeSnap) { a.anchor = pt; armHold(a); }
  } else if (tool === 'eraser') { a.mode = 'erase'; a.before = snap(page); a.last = pt; eraseAt(a, pt.x, pt.y); }
  else if (tool === 'shape') { clearSelection(); a.mode = 'shape'; a.stroke = { t: 'pen', c: E.color.pen, w: sz('shape'), poly: true, p: shapePts(S.shape, pt.x, pt.y, pt.x, pt.y) }; }
  else if (tool === 'laser') {
    a.mode = 'laser'; a.cur = pt;
    if (laser.el !== pageEl) laser.pts = [];
    laser.el = pageEl; laser.pts.push([pt.x, pt.y, performance.now(), 1]); laserLoop();
  } else if (tool === 'lasso') {
    const hit = selHit(page, pt);
    if (hit) { a.mode = hit; a.k = 1; a.dx = a.dy = 0; startSelOp(); scheduleLive(); return; }
    clearSelection(); a.mode = 'lasso'; a.poly = [pt.x, pt.y];
  }
  scheduleLive();
}
function onMove(e) {
  // only a Pencil that is touching the screen counts (newer iPads also report the Pencil hovering above it)
  if (e.pointerType === 'pen' && (e.buttons || e.pressure > 0)) lastPenAt = performance.now();
  const a = active; if (!a || e.pointerId !== a.id) return;
  const ce = e.getCoalescedEvents?.(); const list = ce && ce.length ? ce : [e];
  const pt = toPt(a, e);
  if (a.mode === 'ink') {
    if (a.straight) { const s0 = a.start; a.stroke.p = [+s0.x.toFixed(1), +s0.y.toFixed(1), 0.5, +pt.x.toFixed(1), +pt.y.toFixed(1), 0.5]; }
    else list.forEach(ev => addPoint(a, ev));
    if (a.anchor && Math.hypot(pt.x - a.anchor.x, pt.y - a.anchor.y) > 3) { a.anchor = pt; armHold(a); }
  } else if (a.mode === 'snapped') { if (a.snap.kind === 'line') a.stroke.p = shapePts('line', a.snap.x0, a.snap.y0, pt.x, pt.y); }
  else if (a.mode === 'shape') { a.end = pt; a.stroke.p = shapePts(S.shape, a.start.x, a.start.y, pt.x, pt.y); }
  else if (a.mode === 'erase') {
    const r = sz('eraser') / 2;
    for (const ev of list) {
      const q = toPt(a, ev), d = Math.hypot(q.x - a.last.x, q.y - a.last.y), steps = Math.max(1, Math.ceil(d / (r * 0.7)));
      for (let i = 1; i <= steps; i++) eraseAt(a, a.last.x + (q.x - a.last.x) * i / steps, a.last.y + (q.y - a.last.y) * i / steps);
      a.last = q;
    }
  } else if (a.mode === 'lasso') {
    if (S.selMode === 'rect') a.poly = [a.start.x, a.start.y, pt.x, a.start.y, pt.x, pt.y, a.start.x, pt.y];
    else list.forEach(ev => { const q = toPt(a, ev); a.poly.push(q.x, q.y); });
  } else if (a.mode === 'move') { a.dx = pt.x - a.start.x; a.dy = pt.y - a.start.y; }
  else if (a.mode === 'scale') {
    const b = E.sel.box;
    a.k = clamp(((pt.x - b[0]) / (b[2] - b[0]) + (pt.y - b[1]) / (b[3] - b[1])) / 2, 0.1, 12);
  } else if (a.mode === 'laser') { list.forEach(ev => { const q = toPt(a, ev); laser.pts.push([q.x, q.y, performance.now(), 0]); }); a.cur = pt; }
  else return;
  scheduleLive();
}
function onUp(e) {
  const a = active; if (!a || e.pointerId !== a.id) return;
  active = null; clearTimeout(a.holdT);
  try { scroller.releasePointerCapture(e.pointerId); } catch { }
  const p = a.page;
  if (a.mode === 'text') { if (e.type === 'pointerup') createText(p, a.pageEl, a.pt); }
  else if (a.mode === 'ink' || a.mode === 'snapped' || a.mode === 'shape') {
    const tiny = a.mode === 'shape' && (!a.end || Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y) < 3);
    if (a.stroke.p.length && !tiny) {
      const before = snap(p); globalThis.stampRec?.(a.stroke); p.strokes.push(a.stroke); pushUndo(p, before);
      const c = a.pageEl.querySelector('canvas.ink');
      if (c.width) { const cx = c.getContext('2d'); setPageTransform(cx, a.pageEl); drawStroke(cx, a.stroke, a.pageEl._scale, isDark(p.paperColor)); }
    }
  }
  else if (a.mode === 'erase' && a.changed) pushUndo(p, a.before);
  else if (a.mode === 'lasso') finishLasso(a);
  else if (a.mode === 'move' || a.mode === 'scale') {
    E.moving = false;
    const changed = a.mode === 'move' ? Math.abs(a.dx) + Math.abs(a.dy) > 0.5 : Math.abs(a.k - 1) > 0.01;
    if (changed) applySelTransform(a.dx || 0, a.dy || 0, a.k || 1); else { refreshPage(p); showSelMenu(); }
  }
  scheduleLive();
}
function cancelActive() {
  const a = active; if (!a) return;
  active = null; clearTimeout(a.holdT);
  if (a.mode === 'move' || a.mode === 'scale') { E.moving = false; refreshPage(a.page); showSelMenu(); }
  if (a.mode === 'erase' && a.changed) pushUndo(a.page, a.before);
  scheduleLive();
}
function eraseAt(a, x, y) {
  const p = a.page, r = sz('eraser') / 2, precise = S.eraserMode === 'precise';
  let changed = false; const out = [];
  for (const st of p.strokes) {
    if ((S.eraseHlOnly && st.t !== 'hl') || !hitStroke(st, x, y, r)) { out.push(st); continue; }
    changed = true;
    if (!precise) continue;
    const rr = r + st.w * 0.5, q = densify(st.p, Math.max(1.5, r * 0.4));
    let run = [];
    const cut = () => { if (run.length >= 6) out.push({ ...st, p: run }); run = []; };
    for (let i = 0; i < q.length; i += 3) {
      if (Math.hypot(q[i] - x, q[i + 1] - y) <= rr) cut(); else run.push(+q[i].toFixed(1), +q[i + 1].toFixed(1), q[i + 2]);
    }
    cut();
  }
  if (changed) { p.strokes = out; a.changed = true; schedulePaint(p); }
}
async function clearPage() {
  const p = E.pages[currentIndex()];
  if (!await confirmBox(`Clear everything on page ${currentIndex() + 1}? You can undo this.`, 'Clear page')) return;
  const before = snap(p); p.strokes = []; p.texts = []; p.images = []; pushUndo(p, before); refreshPage(p);
}

// ---------- Live overlay ----------
function scheduleLive() { if (!liveQueued) { liveQueued = true; requestAnimationFrame(drawLive); } }
function drawLive() {
  liveQueued = false;
  const a = active && active.mode !== 'text' ? active : null;
  const host = a?.pageEl || (laser.pts.length && laser.el) || (E.sel && E.els.get(E.sel.page.id)) || null;
  if (!host || !host.isConnected) { live.remove(); return; }
  const c = host.querySelector('canvas.ink');
  let fresh = false;
  if (live.parentNode !== host) { host.appendChild(live); fresh = true; }
  if (live.width !== c.width || live.height !== c.height) { live.width = c.width; live.height = c.height; fresh = true; }
  if (live._ox !== host._ox || live._oy !== host._oy) { live._ox = host._ox; live._oy = host._oy; fresh = true; }
  live.style.left = c.style.left; live.style.top = c.style.top; live.style.width = c.style.width; live.style.height = c.style.height;
  const ctx = lctx, s = host._scale || 1, page = E.byId.get(host.dataset.id), dark = isDark(page.paperColor);
  // Fast path: pen ink is drawn incrementally (only new segments) for minimum latency
  if (a?.mode === 'ink' && a.stroke.t === 'pen' && !a.stroke.poly && !laser.pts.length) {
    if (a.fresh || fresh) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, live.width, live.height); a.drawn = 0; a.fresh = false; }
    setPageTransform(ctx, host);
    const n = a.stroke.p.length / 3;
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = a.stroke.c;
    let i = a.drawn + 1; for (; i <= n - 2; i++) penSeg(ctx, a.stroke, s, i, n);
    ctx.restore(); a.drawn = i - 1;
    return;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, live.width, live.height);
  setPageTransform(ctx, host);
  if (a && (a.mode === 'ink' || a.mode === 'shape' || a.mode === 'snapped')) drawStroke(ctx, a.stroke, s, dark);
  if (a?.mode === 'erase') {
    ctx.beginPath(); ctx.arc(a.last.x * s, a.last.y * s, sz('eraser') / 2 * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(128,128,128,.15)'; ctx.fill(); ctx.strokeStyle = 'rgba(100,100,100,.7)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  if (a?.mode === 'lasso' && a.poly.length > 2) {
    ctx.beginPath(); ctx.moveTo(a.poly[0] * s, a.poly[1] * s);
    for (let i = 2; i < a.poly.length; i += 2) ctx.lineTo(a.poly[i] * s, a.poly[i + 1] * s);
    ctx.closePath(); ctx.fillStyle = S.accent + '14'; ctx.fill();
    ctx.setLineDash([6, 5]); ctx.strokeStyle = S.accent; ctx.lineWidth = 1.6; ctx.stroke(); ctx.setLineDash([]);
  }
  if (E.sel && E.els.get(E.sel.page.id) === host) drawSelection(ctx, a, s, dark, page);
  if (laser.pts.length && laser.el === host) drawLaser(ctx, s);
}
function drawSelection(ctx, a, s, dark, page) {
  const sel = E.sel, b = sel.box, op = a && (a.mode === 'move' || a.mode === 'scale');
  const dx = a?.mode === 'move' ? a.dx : 0, dy = a?.mode === 'move' ? a.dy : 0, k = a?.mode === 'scale' ? a.k : 1;
  if (op) {
    ctx.save(); ctx.translate((b[0] + dx) * s, (b[1] + dy) * s); ctx.scale(k, k); ctx.translate(-b[0] * s, -b[1] * s);
    sel.images.forEach(im => drawImg(ctx, page, im, s, { sync: true }));
    sel.strokes.forEach(st => drawStroke(ctx, st, s, dark));
    drawTexts(ctx, page, s, [...sel.texts]); drawTables(ctx, page, s, [...sel.tables]);
    ctx.restore();
  }
  const x0 = (b[0] + dx) * s, y0 = (b[1] + dy) * s, w = (b[2] - b[0]) * k * s, h = (b[3] - b[1]) * k * s;
  ctx.save();
  ctx.fillStyle = S.accent + '0d'; ctx.fillRect(x0, y0, w, h);
  ctx.setLineDash([6, 5]); ctx.strokeStyle = S.accent; ctx.lineWidth = 1.6; ctx.strokeRect(x0, y0, w, h); ctx.setLineDash([]);
  const hr = 9 * (s / E.unit);
  ctx.beginPath(); ctx.arc(x0 + w, y0 + h, hr, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
  ctx.restore();
}
function laserLoop() {
  if (laser.raf) return;
  const tick = () => {
    const now = performance.now();
    laser.pts = laser.pts.filter(q => now - q[2] < 900);
    drawLive();
    if (laser.pts.length || active?.mode === 'laser') laser.raf = requestAnimationFrame(tick); else { laser.raf = 0; drawLive(); }
  };
  laser.raf = requestAnimationFrame(tick);
}
function drawLaser(ctx, s) {
  const now = performance.now(), P = laser.pts;
  ctx.save(); ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(255,40,40,.9)'; ctx.shadowBlur = 12; ctx.strokeStyle = '#ff3b30';
  for (let i = 1; i < P.length; i++) {
    if (P[i][3]) continue;
    const age = (now - P[i][2]) / 900; if (age >= 1) continue;
    ctx.globalAlpha = 1 - age; ctx.lineWidth = Math.max(1.5, 5 * s * (1 - age * 0.6));
    ctx.beginPath(); ctx.moveTo(P[i - 1][0] * s, P[i - 1][1] * s); ctx.lineTo(P[i][0] * s, P[i][1] * s); ctx.stroke();
  }
  if (active?.mode === 'laser' && active.cur) { ctx.globalAlpha = 1; ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(active.cur.x * s, active.cur.y * s, 6 * s, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

// ---------- Selection ----------
function textEl(p, t) { return E.els.get(p.id)?.querySelector(`.text-item[data-id="${t.id}"] .text-body`); }
function textBox(p, t) {
  const d = textEl(p, t);
  if (d && d.offsetWidth) return [t.x, t.y, t.x + d.offsetWidth / E.unit, t.y + d.offsetHeight / E.unit];
  return [t.x, t.y, t.x + (t.w || textNaturalWidth(t)), t.y + textHeight(t)];
}
function selBox(sel) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const grow = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
  sel.strokes.forEach(st => { const b = bbox(st), w = st.w / 2 + 6; grow(b[0] - w, b[1] - w, b[2] + w, b[3] + w); });
  sel.images.forEach(im => grow(im.x - 4, im.y - 4, im.x + im.w + 4, im.y + im.h + 4));
  sel.texts.forEach(t => { const b = textBox(sel.page, t); grow(b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4); });
  sel.tables?.forEach(t => { const b = tableBox(sel.page, t); grow(b[0] - 4, b[1] - 4, b[2] + 4, b[3] + 4); });
  return [x0, y0, x1, y1];
}
function setSelection(p, strokes = new Set(), images = new Set(), texts = new Set(), tables = new Set()) {
  if (!strokes.size && !images.size && !texts.size && !tables.size) return clearSelection();
  E.sel = { page: p, strokes, images, texts, tables }; E.sel.box = selBox(E.sel);
  showSelMenu(); scheduleLive();
}
function clearSelection() { if (!E.sel) return; E.sel = null; hideSelMenu(); scheduleLive(); }
function selectAll() {
  setTool('lasso'); const p = E.pages[currentIndex()];
  setSelection(p, new Set(p.strokes), new Set(p.images), new Set(p.texts), new Set(p.tables));
}
function finishLasso(a) {
  const poly = a.poly, p = a.page;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i < poly.length; i += 2) { x0 = Math.min(x0, poly[i]); x1 = Math.max(x1, poly[i]); y0 = Math.min(y0, poly[i + 1]); y1 = Math.max(y1, poly[i + 1]); }
  if (x1 - x0 < 6 && y1 - y0 < 6) return lassoTap(a.start, p, a.pageEl);
  const strokes = new Set(), images = new Set(), texts = new Set();
  for (const st of p.strokes) {
    const n = st.p.length / 3; let inside = 0;
    for (let i = 0; i < n; i++) if (pip(st.p[i * 3], st.p[i * 3 + 1], poly)) inside++;
    if (inside / n > 0.5) strokes.add(st);
  }
  for (const im of p.images) if (pip(im.x + im.w / 2, im.y + im.h / 2, poly)) images.add(im);
  for (const t of p.texts) { const b = textBox(p, t); if (pip((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, poly)) texts.add(t); }
  const tables = new Set();
  for (const t of p.tables) { const b = tableBox(p, t); if (pip((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, poly) || pip(b[0] + 10, b[1] + 10, poly)) tables.add(t); }
  setSelection(p, strokes, images, texts, tables);
}
function lassoTap(pt, p, el) {
  if (globalThis.playSeekAt?.(p, pt)) return;
  const hit = hitObject(p, pt, true);
  if (hit) return setSelection(p, hit.strokes, hit.images, hit.texts, hit.tables);
  clearSelection();
  if (E.clip) showPasteMenu(p, el, pt);
}
function startSelOp() {
  E.moving = true; hideSelMenu();
  E.sel.texts.forEach(t => { const d = textEl(E.sel.page, t); if (d) d.parentElement.style.visibility = 'hidden'; });
  E.sel.tables.forEach(t => { const d = tableEl(E.sel.page, t); if (d) d.style.visibility = 'hidden'; });
  paint(E.sel.page);
}
function applySelTransform(dx, dy, k) {
  const sel = E.sel, p = sel.page, b = sel.box, before = snap(p);
  const tx = x => b[0] + (x - b[0]) * k + dx, ty = y => b[1] + (y - b[1]) * k + dy;
  const ns = new Set(), ni = new Set(), nt = new Set();
  p.strokes = p.strokes.map(st => {
    if (!sel.strokes.has(st)) return st;
    const n = { ...st, w: +(st.w * k).toFixed(2), p: st.p.map((v, i) => i % 3 === 0 ? +tx(v).toFixed(1) : i % 3 === 1 ? +ty(v).toFixed(1) : v) };
    ns.add(n); return n;
  });
  p.images = p.images.map(im => { if (!sel.images.has(im)) return im; const n = { ...im, x: tx(im.x), y: ty(im.y), w: im.w * k, h: im.h * k }; ni.add(n); return n; });
  p.texts = p.texts.map(t => {
    if (!sel.texts.has(t)) return t;
    const n = { ...t, x: tx(t.x), y: ty(t.y), s: +(t.s * k).toFixed(1) };
    if (t.w) n.w = Math.round(t.w * k);                 // resizing keeps the same line breaks
    nt.add(n); return n;
  });
  // page links attached to the selected area move with it
  p.links = (p.links || []).map(l => { const cx = l.x + l.w / 2, cy = l.y + l.h / 2; return cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3] ? { ...l, x: tx(l.x), y: ty(l.y), w: l.w * k, h: l.h * k } : l; });
  const nb = new Set();
  p.tables = p.tables.map(t => {
    if (!sel.tables.has(t)) return t;
    const n = { ...structuredClone(t), x: Math.round(tx(t.x)), y: Math.round(ty(t.y)), w: Math.round(Math.max(120, t.w * k)), s: +clamp(t.s * k, 8, 120).toFixed(1) };
    nb.add(n); return n;
  });
  pushUndo(p, before); refreshPage(p); setSelection(p, ns, ni, nt, nb);
}
function hideSelMenu() { selMenu?.remove(); selMenu = null; }
// Floating menus live on screen (not inside the page) so they can always be kept fully visible:
// above the selection if there's room, otherwise below it, wrapping onto two rows on narrow screens.
function floatMenu(host, p, x, y, html, onAct, yb = y) {
  const m = document.createElement('div'); m.className = 'float-menu';
  m.innerHTML = html; m._at = { host, p, x, y, yb };
  m.addEventListener('pointerdown', e => e.stopPropagation());
  m.addEventListener('click', e => { const b = e.target.closest('button'); if (b?.dataset.a) onAct(b.dataset.a, b); });
  document.body.appendChild(m); placeFloat(m); return m;
}
function placeFloat(m) {
  if (!m?.isConnected) return;
  const { host, p, x, y, yb } = m._at;
  if (!host.isConnected || $('#editor').hidden) { m.remove(); return; }
  const r = host.getBoundingClientRect(), u = r.width / p.w, w = m.offsetWidth, h = m.offsetHeight, M = 8;
  const topLimit = $('.toolbar').getBoundingClientRect().bottom + M, botLimit = innerHeight - M - 50;
  const cx = r.left + x * u, sTop = r.top + y * u, sBot = r.top + yb * u;
  let top = sTop - h - 12, below = false;
  if (top < topLimit) { top = sBot + 12; below = true; }
  if (top + h > botLimit) { top = clamp(Math.max(sTop, topLimit) + 8, topLimit, botLimit - h); below = false; }
  m.style.left = clamp(cx - w / 2, M, innerWidth - w - M) + 'px';
  m.style.top = top + 'px';
  m.classList.toggle('below', below);
  m.style.visibility = sBot < topLimit - 30 || sTop > innerHeight ? 'hidden' : '';
}
const placeFloats = () => { placeFloat(selMenu); placeFloat(pasteMenu); };
function showSelMenu() {
  hideSelMenu(); if (!E.sel) return;
  const p = E.sel.page, b = E.sel.box, host = E.els.get(p.id); if (!host) return;
  const onlyTable = E.sel.tables.size === 1 && !E.sel.strokes.size && !E.sel.images.size && !E.sel.texts.size;
  selMenu = floatMenu(host, p, (b[0] + b[2]) / 2, b[1],
    (onlyTable ? `<button data-a="tedit" class="ask-btn">✎ Edit table</button><button data-a="tgraph">📈 Graph</button>` : '') +
    `<button data-a="ask" class="ask-btn">✦ Ask Claude</button><button data-a="style" data-pop-anchor>Style</button><button data-a="img">Save image</button><button data-a="copy">Copy</button><button data-a="dup">Duplicate</button><button data-a="save">★ Save</button><button data-a="del" class="danger">Delete</button><button data-a="more" title="Cut, link, sticker">⋯</button>`,
    (act, btn) => act === 'more' ? guard(selMoreMenu)() : act === 'tedit' ? editTable(p, [...E.sel.tables][0]) : act === 'tgraph' ? guard(tableGraph)(p, [...E.sel.tables][0]) : act === 'style' ? openSelStyle(btn) : act === 'ask' ? guard(askClaude)(E.sel.page, E.sel.box)
      : act === 'img' ? guard(saveSelectionImage)() : selAction(act), b[3]);
}
function hidePasteMenu() { pasteMenu?.remove(); pasteMenu = null; }
function showPasteMenu(p, el, pt) {
  hidePasteMenu();
  pasteMenu = floatMenu(el, p, pt.x, pt.y, '<button data-a="paste">Paste</button>', () => { hidePasteMenu(); pasteClip(p, pt); });
}
function copySel() {
  const s = E.sel; if (!s) return;
  E.clip = { strokes: [...s.strokes], images: [...s.images].map(i => ({ ...i })), texts: [...s.texts].map(t => ({ ...t })), tables: [...(s.tables || [])].map(t => structuredClone(t)), box: [...s.box] };
}
async function pasteClip(p, pt) {
  const c = E.clip; if (!c) return;
  const dx = pt.x - c.box[0], dy = pt.y - c.box[1], before = snap(p);
  const strokes = c.strokes.map(st => ({ ...st, p: shiftPts(st.p, dx, dy) }));
  const images = [];
  for (const im of c.images) { const key = await copyBlob(im.key); if (key) images.push({ ...im, id: uid(), key, x: im.x + dx, y: im.y + dy }); }
  const texts = c.texts.map(t => ({ ...t, id: uid(), x: t.x + dx, y: t.y + dy }));
  const tables = (c.tables || []).map(t => ({ ...structuredClone(t), id: uid(), x: Math.round(t.x + dx), y: Math.round(t.y + dy) }));
  p.strokes.push(...strokes); p.images.push(...images); p.texts.push(...texts); p.tables.push(...tables);
  pushUndo(p, before); refreshPage(p);
  if (E.tool !== 'lasso') setTool('lasso');
  setSelection(p, new Set(strokes), new Set(images), new Set(texts), new Set(tables));
}
async function selAction(act) {
  const sel = E.sel; if (!sel) return;
  const p = sel.page;
  if (act === 'copy') { copySel(); toast('Copied — tap an empty spot with the lasso (any page) to paste', 2200); return; }
  if (act === 'save') return saveItemFlow(p, sel.box);
  if (act === 'dup') { copySel(); return pasteClip(p, { x: sel.box[0] + 24, y: sel.box[1] + 24 }); }
  if (act === 'cut') copySel();
  if (act === 'del' || act === 'cut') {
    const before = snap(p);
    p.strokes = p.strokes.filter(s => !sel.strokes.has(s)); p.images = p.images.filter(s => !sel.images.has(s)); p.texts = p.texts.filter(s => !sel.texts.has(s)); p.tables = p.tables.filter(s => !sel.tables.has(s));
    E.sel = null; hideSelMenu(); pushUndo(p, before); refreshPage(p); scheduleLive();
  }
}
function restyleSel(fs, ft) {
  const sel = E.sel; if (!sel) return;
  const p = sel.page, before = snap(p), ns = new Set(), nt = new Set();
  p.strokes = p.strokes.map(st => { if (!sel.strokes.has(st)) return st; const n = fs({ ...st }); ns.add(n); return n; });
  p.texts = p.texts.map(t => { if (!sel.texts.has(t)) return t; const n = ft({ ...t }); nt.add(n); return n; });
  const nb = new Set();
  p.tables = p.tables.map(t => { if (!sel.tables.has(t)) return t; const n = ft(structuredClone(t)); delete n.f; delete n.b; delete n.i; nb.add(n); return n; });
  pushUndo(p, before); refreshPage(p); setSelection(p, ns, sel.images, nt, nb);
}
const recolorSel = c => restyleSel(st => ({ ...st, c }), t => ({ ...t, c }));

// Style panel — used for a lasso selection and for a single text box
function buildStyleControls(box, o) {
  const draw = () => {
    const cur = o.cur(), cols = [...new Set([...S.pen, ...S.hl])];
    box.innerHTML = `<div class="pop-title">Style</div>
      <div class="opt-label">Color</div>
      <div class="opt-row">${cols.map(c => `<button class="swatch${c === cur.c ? ' on' : ''}" style="--c:${c}" data-c="${c}"></button>`).join('')}
        <label class="swatch custom-sw" title="Any color"><input type="color" value="${/^#[0-9a-f]{6}$/i.test(cur.c || '') ? cur.c : '#000000'}"></label></div>
      ${o.strokes ? `<div class="opt-block"><div class="opt-label">Handwriting thickness</div><div class="seg"><button class="chip" data-w="0.7">Thinner</button><button class="chip" data-w="1.4">Thicker</button></div></div>` : ''}
      ${o.texts ? `<div class="opt-block"><div class="opt-label">Font</div><div class="seg">${FONT_OPTS.map(([k, l]) => `<button class="chip${cur.f === k ? ' on' : ''}" data-f="${k}">${l}</button>`).join('')}</div></div>
        <div class="opt-block"><div class="opt-label">Size & emphasis</div><div class="seg"><button class="chip" data-ds="-4">A−</button><button class="chip" data-ds="4">A+</button>
        <button class="chip${cur.b ? ' on' : ''}" data-b="1"><b>Bold</b></button><button class="chip${cur.i ? ' on' : ''}" data-i="1"><i>Italic</i></button></div></div>` : ''}`;
  };
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.c) o.apply({ c: d.c }); else if (d.w) o.apply({ wk: +d.w }); else if (d.f) o.apply({ f: d.f });
    else if (d.ds) o.apply({ ds: +d.ds }); else if (d.b) o.apply({ b: true }); else if (d.i) o.apply({ i: true }); else return;
    draw();
  });
  box.addEventListener('change', e => { if (e.target.type === 'color') { o.apply({ c: e.target.value }); draw(); } });
  draw();
}
function openSelStyle(anchor) {
  if (!E.sel) return;
  openPopover(anchor, 'style', box => buildStyleControls(box, {
    strokes: E.sel.strokes.size > 0, texts: E.sel.texts.size > 0 || E.sel.tables.size > 0,
    cur: () => {
      const s = E.sel; if (!s) return {};
      const ts = [...s.texts], first = ts[0] || [...s.tables][0] || [...s.strokes][0];
      return { c: first?.c, f: ts[0]?.f || 'sans', b: ts.length && ts.every(t => t.b), i: ts.length && ts.every(t => t.i) };
    },
    apply: ch => {
      const ts = [...E.sel.texts], allB = ts.every(t => t.b), allI = ts.every(t => t.i);
      restyleSel(st => { if (ch.c) st.c = ch.c; if (ch.wk) st.w = +clamp(st.w * ch.wk, 0.3, 80).toFixed(2); return st; },
        t => { if (ch.c) t.c = ch.c; if (ch.f) t.f = ch.f; if (ch.ds) t.s = clamp(t.s + ch.ds, 8, 160); if (ch.b) t.b = !allB; if (ch.i) t.i = !allI; return t; });
    },
  }), selScreenRect());
}

// ---------- Text boxes ----------
function renderTexts(p, el) { const layer = el.querySelector('.text-layer'); layer.innerHTML = ''; p.texts.forEach(t => layer.appendChild(makeTextEl(p, t))); renderTables(p, el); globalThis.renderLinks?.(p, el); }
function positionText(p, t, d) {
  d.style.setProperty('--x', t.x); d.style.setProperty('--y', t.y); d.style.color = t.c;
  d.style.setProperty('--fs', t.s); d.style.fontFamily = FONTS[t.f] || FONTS.sans;
  d.style.fontWeight = t.b ? '700' : ''; d.style.fontStyle = t.i ? 'italic' : '';
  d.classList.toggle('fixed', !!t.w); d.style.setProperty('--tw', t.w || 0);
}
function removeText(p, t, d) { p.texts = p.texts.filter(x => x !== t); d.remove(); markDirty(p); }
function makeTextEl(p, t) {
  const d = document.createElement('div'); d.className = 'text-item'; d.dataset.id = t.id;
  d.innerHTML = '<div class="text-tools"><div class="grip" title="Drag to move">⠿ Move</div><button class="text-style" data-pop-anchor title="Color, font, size">Aa</button><button class="text-del" title="Delete">Delete</button></div><div class="text-body" spellcheck="true"></div><div class="text-resize" title="Drag to change the width"></div>';
  const body = $('.text-body', d);
  fitTextWidth(p, t);                                  // older long boxes get a fixed width once, so they never re-wrap
  const rz = $('.text-resize', d);
  rz.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); try { rz.setPointerCapture(e.pointerId); } catch { }
    const sx = e.clientX, w0 = t.w || body.offsetWidth / E.unit;
    const mv = ev => { t.w = Math.round(clamp(w0 + (ev.clientX - sx) / E.unit, 60, Math.max(60, p.w - t.x))); positionText(p, t, d); };
    const up = () => { rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', up); rz.removeEventListener('pointercancel', up); markDirty(p); };
    rz.addEventListener('pointermove', mv); rz.addEventListener('pointerup', up); rz.addEventListener('pointercancel', up);
  });
  $('.text-style', d).addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    openPopover(e.currentTarget, 'style', box => buildStyleControls(box, {
      strokes: false, texts: true,
      cur: () => ({ c: t.c, f: t.f || 'sans', b: t.b, i: t.i }),
      apply: ch => {
        if (ch.c) t.c = ch.c; if (ch.f) t.f = ch.f; if (ch.ds) t.s = clamp(t.s + ch.ds, 8, 160);
        if (ch.b) t.b = !t.b; if (ch.i) t.i = !t.i; positionText(p, t, d); markDirty(p);
      },
    }), body.getBoundingClientRect());
  });
  body.contentEditable = 'plaintext-only'; if (body.contentEditable !== 'plaintext-only') body.contentEditable = 'true';
  body.textContent = t.text; positionText(p, t, d);
  body.addEventListener('input', () => { t.text = body.innerText.replace(/\n$/, ''); if (fitTextWidth(p, t)) positionText(p, t, d); markDirty(p); });
  body.addEventListener('blur', () => { if (!t.text.trim()) removeText(p, t, d); else if (S.sideOpen && S.sideTab === 'saved') renderEdSide(); });
  $('.text-del', d).addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); const before = snap(p); removeText(p, t, d); pushUndo(p, before);
  });
  const g = $('.grip', d);
  g.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); try { g.setPointerCapture(e.pointerId); } catch { }
    const host = E.els.get(p.id), a = { rect: host.getBoundingClientRect(), page: p }, start = toPt(a, e), ox = t.x, oy = t.y;
    const mv = ev => { const q = toPt(a, ev); t.x = clamp(ox + q.x - start.x, 0, Math.max(0, p.w - (t.w || 20))); t.y = clamp(oy + q.y - start.y, 0, p.h - 20); positionText(p, t, d); };
    const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up); markDirty(p); };
    g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
  });
  return d;
}
function createText(p, el, pt) {
  const s = sz('text');
  const t = { id: uid(), x: clamp(pt.x, 0, p.w - 40), y: clamp(pt.y - s * 0.7, 0, p.h - 30), s, c: E.color.pen, f: S.font, text: '' };
  globalThis.stampRec?.(t); p.texts.push(t);
  const d = makeTextEl(p, t); el.querySelector('.text-layer').appendChild(d);
  $('.text-body', d).focus();
}

// ---------- Touch gestures: palm rejection, pinch zoom, 2/3-finger taps ----------
// ---- palm rejection for gestures ----
// While (or just after) the Pencil is writing, finger/palm touches can't zoom, scroll or undo.
// 3+ touches that stay on the page (not a quick 3-finger tap) are treated as a resting hand.
let lastPenAt = 0, palmBlock = false;
const notePen = () => { lastPenAt = performance.now(); };
const penRecent = () => performance.now() - lastPenAt < 500;
function onTouch(e) {
  if (!E.nb) return;
  if ([...e.changedTouches].some(t => t.touchType === 'stylus')) {
    notePen();
    if (!e.target.closest('.text-item, .float-menu') && e.cancelable) e.preventDefault();
    return;
  }
  // a finger dragging a selection must not scroll the page
  if (active?.type === 'touch' && (active.mode === 'move' || active.mode === 'scale') && e.touches.length === 1) { if (e.cancelable) e.preventDefault(); return; }
  const f = [...e.touches].filter(t => t.touchType !== 'stylus');
  // a hand resting on the page: no zooming, no scrolling, no 2/3-finger taps until it lifts
  if ((e.type === 'touchstart' && penRecent()) || (f.length >= 3 && tapG && Date.now() - tapG.t > 350)) palmBlock = true;
  if (palmBlock) {
    if (e.cancelable && (penRecent() || f.length >= 2)) e.preventDefault();
    if (pinch) cancelPinch();
    if (tapG) tapG.moved = true;
    return;
  }
  if (e.type === 'touchstart') {
    tapG ||= { t: Date.now(), max: 0, start: new Map(), moved: false };
    for (const t of e.changedTouches) tapG.start.set(t.identifier, [t.clientX, t.clientY]);
    tapG.max = Math.max(tapG.max, f.length);
  } else if (tapG) {
    for (const t of e.changedTouches) { const s0 = tapG.start.get(t.identifier); if (s0 && Math.hypot(t.clientX - s0[0], t.clientY - s0[1]) > 12) tapG.moved = true; }
  }
  if (f.length >= 2) {
    if (e.target.closest('.grow')) return;
    if (e.cancelable) e.preventDefault();
    if (active && active.type === 'touch') cancelActive();
    // always follow the same two fingers, even if other touches come and go
    const a = pinch ? f.find(t => t.identifier === pinch.ida) : f[0], b = pinch ? f.find(t => t.identifier === pinch.idb) : f[1];
    if (a && b) pinchMove(a, b, e.cancelable);
  }
}
function onTouchEnd(e) {
  const left = [...e.touches].filter(t => t.touchType !== 'stylus');
  if (palmBlock && !left.length) { palmBlock = false; tapG = null; return; }
  if (pinch && (left.length < 2 || !left.some(t => t.identifier === pinch.ida) || !left.some(t => t.identifier === pinch.idb))) endPinch();
  if (tapG && e.touches.length === 0) {
    const g = tapG; tapG = null;
    if (S.fingerTaps && !g.moved && Date.now() - g.t < 350) {
      if (g.max === 2) { undo(); toast('↶ Undo', 700); } else if (g.max === 3) { redo(); toast('↷ Redo', 700); }
    }
  }
}
function pinchMove(a, b, manualPan) {
  const mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2, d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
  if (!pinch) {
    const r = pagesEl.getBoundingClientRect();
    pinch = { d0: d, sx: mx, sy: my, lx: mx, ly: my, ox: mx - r.left, oy: my - r.top, ratio: 1, live: false, ida: a.identifier, idb: b.identifier };
    pagesEl.style.transformOrigin = `${pinch.ox}px ${pinch.oy}px`; pagesEl.classList.add('pinching'); return;
  }
  // small wobbles (like fingers resting) don't zoom or scroll: the gesture has to really move first
  if (!pinch.live) {
    if (Math.abs(d - pinch.d0) < 22 && Math.hypot(mx - pinch.sx, my - pinch.sy) < 22) return;
    pinch.live = true; pinch.d0 = d; pinch.lx = mx; pinch.ly = my;
  }
  if (manualPan) { scroller.scrollLeft -= mx - pinch.lx; scroller.scrollTop -= my - pinch.ly; }
  pinch.lx = mx; pinch.ly = my;
  pinch.ratio = clamp(E.zoom * d / pinch.d0, ZMIN, ZMAX) / E.zoom;
  pagesEl.style.transform = `scale(${pinch.ratio})`;
}
function cancelPinch() { pinch = null; pagesEl.style.transform = ''; pagesEl.classList.remove('pinching'); }
function endPinch() {
  const p = pinch; pinch = null; const r = p.ratio;
  pagesEl.style.transform = ''; pagesEl.classList.remove('pinching');
  if (!p.live || Math.abs(r - 1) < 0.01) return;
  if (tapG) tapG.moved = true;
  // The point that stayed still during the pinch preview is the transform origin, so keep exactly that
  // page point where it was. (Using the fingers' final position could land in empty space after a big
  // zoom-out and jump to the last page.)
  const pr = pagesEl.getBoundingClientRect(), sx = pr.left + p.ox, sy = pr.top + p.oy;
  const a = anchorAt(sx, sy);
  const z = clamp(E.zoom * r, ZMIN, ZMAX), ratio = z / E.zoom; E.zoom = z; layout(true, ratio); updateZoomLabel();
  restoreAnchor(a, sx, sy); updateInd(); placeFloats();
}

// ---------- Page resizing (drag edges like Paint) ----------
function shiftContent(p, dx, dy) {
  p.strokes = p.strokes.map(st => ({ ...st, p: shiftPts(st.p, dx, dy) }));
  p.texts = p.texts.map(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
  p.images = p.images.map(im => ({ ...im, x: im.x + dx, y: im.y + dy }));
  p.tables = (p.tables || []).map(t => ({ ...t, x: t.x + dx, y: t.y + dy }));
  p.links = (p.links || []).map(l => ({ ...l, x: l.x + dx, y: l.y + dy }));
  if (p.bgKey) { p.bgX = (p.bgX || 0) + dx; p.bgY = (p.bgY || 0) + dy; }
  for (const it of E.nb.items) if (it.pageId === p.id) it.box = [it.box[0] + dx, it.box[1] + dy, it.box[2] + dx, it.box[3] + dy];
  p.ocr = null;
}
function onGrowDown(e) {
  const g = e.target.closest('.grow'); if (!g || !E.nb) return;
  e.preventDefault(); e.stopPropagation();
  const el = g.closest('.page'), p = E.byId.get(el.dataset.id), dir = g.dataset.grow;
  try { g.setPointerCapture(e.pointerId); } catch { }
  g.classList.add('dragging'); clearSelection();
  if (p.bgKey) { p.bgW ||= p.w; p.bgH ||= p.h; }   // a PDF/photo background keeps its own size
  const sx = e.clientX, sy = e.clientY, w0 = p.w, h0 = p.h, snap10 = v => Math.round(v / 10) * 10, before = snap(p);
  let shiftX = 0, shiftY = 0;                          // growing up/left moves the content so it stays where it is
  const lbl = document.createElement('div'); lbl.className = 'grow-size'; el.appendChild(lbl);
  const mv = ev => {
    const dx = (ev.clientX - sx) / E.unit, dy = (ev.clientY - sy) / E.unit;
    let scrollBy = 0;
    if (dir === 'b') p.h = clamp(snap10(h0 + dy), 300, 30000);
    if (dir === 'r') p.w = clamp(snap10(w0 + dx), 400, 8000);
    if (dir === 't') { const add = clamp(snap10(-dy), 300 - h0, 30000 - h0); if (add !== shiftY) { shiftContent(p, 0, add - shiftY); scrollBy = (add - shiftY) * E.unit; shiftY = add; renderTexts(p, el); } p.h = h0 + add; }
    if (dir === 'l') { const add = clamp(snap10(-dx), 400 - w0, 8000 - w0); if (add !== shiftX) { shiftContent(p, add - shiftX, 0); shiftX = add; renderTexts(p, el); } p.w = w0 + add; }
    el.style.width = p.w * E.unit + 'px'; el.style.height = p.h * E.unit + 'px';
    if (scrollBy) scroller.scrollTop += scrollBy;
    lbl.textContent = `${p.w} × ${p.h}`; schedulePaint(p);
  };
  const up = () => {
    try { g.releasePointerCapture(e.pointerId); } catch { }
    g.classList.remove('dragging'); lbl.remove();
    g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up);
    if (p.w !== w0 || p.h !== h0) pushUndo(p, before); else markDirty(p);   // resizing can be undone like any other change
    if (shiftX || shiftY) saveNb();
    layout();
  };
  g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
}

// ---------- Images ----------
async function prepImage(file, max = 1800) {
  let bm;
  try { bm = await createImageBitmap(file); }
  catch { bm = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That image format isn’t supported.')); i.src = URL.createObjectURL(file); }); }
  const k = Math.min(1, max / Math.max(bm.width, bm.height)), w = Math.round(bm.width * k), h = Math.round(bm.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bm, 0, 0, w, h);
  const png = file.type === 'image/png' || file.type === 'image/gif';
  const blob = await new Promise(r => c.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.88));
  bm.close?.(); c.width = c.height = 0;
  return { blob, w, h };
}
async function insertImages(files, target) {
  files = files.filter(f => /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|gif|webp)$/i.test(f.name)); if (!files.length) return;
  toast(files.length > 1 ? `Adding ${files.length} images…` : 'Adding image…', 60000);
  const p = target?.page || E.pages[currentIndex()], el = E.els.get(p.id);
  let cx = target?.x, cy = target?.y;
  if (cx == null) {
    const sr = scroller.getBoundingClientRect(), er = el.getBoundingClientRect();
    cx = clamp((sr.left + sr.width / 2 - er.left) / er.width * p.w, 0, p.w);
    cy = clamp((sr.top + sr.height / 2 - er.top) / er.height * p.h, 0, p.h);
  }
  const before = snap(p), added = new Set(); let off = 0;
  for (const f of files) {
    const { blob, w, h } = await prepImage(f), key = 'img_' + uid();
    await db.put('blobs', blob, key);
    let iw = Math.min(p.w * 0.6, Math.max(120, w / 1.5)), ih = iw * h / w;
    if (ih > p.h * 0.6) { ih = p.h * 0.6; iw = ih * w / h; }
    const im = { id: uid(), key, x: clamp(cx - iw / 2 + off, 0, Math.max(0, p.w - iw)), y: clamp(cy - ih / 2 + off, 0, Math.max(0, p.h - ih)), w: iw, h: ih };
    p.images.push(im); added.add(im); off += 30;
  }
  hideToast(); pushUndo(p, before); refreshPage(p);
  setTool('lasso'); setSelection(p, new Set(), added);
  toast('Drag to move · corner dot to resize', 1800);
}

// ---------- Sections (lessons & topics) ----------
function secList() {
  if (!E.nb) return [];
  const idx = new Map(E.pages.map((p, i) => [p.id, i]));
  // lessons and topics can share a page ("stacked"): the lesson always comes first
  return E.nb.sections.filter(s => idx.has(s.pageId)).map(s => ({ s, i: idx.get(s.pageId) })).sort((a, b) => a.i - b.i || (a.s.level || 1) - (b.s.level || 1));
}
function secAt(i) {
  let lesson = null, topic = null;
  for (const { s, i: si } of secList()) { if (si > i) break; if (s.level === 2) topic = s; else { lesson = s; topic = null; } }
  return { lesson, topic };
}
function secRange(entry, list) {
  const k = list.indexOf(entry), lv = entry.s.level || 1; let end = E.pages.length;
  for (let j = k + 1; j < list.length; j++) if ((list[j].s.level || 1) <= lv && list[j].i > entry.i) { end = list[j].i; break; }
  return [entry.i, end];
}
async function deletePages(a, b) {
  clearSelection();
  const gone = E.pages.slice(a, b), goneIds = new Set(gone.map(p => p.id));
  E.pages.splice(a, b - a);
  if (!E.pages.length) { const p = newPage(E.nb); E.pages.push(p); E.byId.set(p.id, p); await db.put('pages', p); }
  const nextId = E.pages[Math.min(a, E.pages.length - 1)]?.id;
  E.nb.sections = E.nb.sections.filter(s => !goneIds.has(s.pageId) || (b - a === 1 && nextId && (s.pageId = nextId)));
  E.nb.items = E.nb.items.filter(it => !goneIds.has(it.pageId));
  for (const p of gone) {
    E.byId.delete(p.id); dirty.delete(p);
    await db.del('pages', p.id); for (const k of pageBlobKeys(p)) await db.del('blobs', k);
  }
  E.undo = E.undo.filter(u => !goneIds.has(u.id)); E.redo = E.redo.filter(u => !goneIds.has(u.id)); updateUndoBtns();
  await saveNb(); buildPages(); scrollToPage(Math.min(a, E.pages.length - 1)); updateInd(); renderEdSide();
}

// ---------- Saved items (questions, problems, definitions…) ----------
async function collectItems(nb, pages) {
  const byId = new Map(pages.map(p => [p.id, p])), order = new Map(nb.pages.map((id, i) => [id, i]));
  const secTitle = i => { let t = null; for (const s of nb.sections || []) { const si = order.get(s.pageId); if (si != null && si <= i && (!t || order.get(t.pageId) <= si)) t = s; } return t?.title || ''; };
  const out = [];
  for (const it of nb.items || []) if (byId.has(it.pageId)) out.push({ ...it, nbId: nb.id, nbTitle: nb.title, pageNo: order.get(it.pageId) + 1, section: secTitle(order.get(it.pageId)) });
  for (const p of pages) for (const t of p.texts || []) {
    const hit = AUTO_PATTERNS.find(([re]) => re.test(t.text || '')); if (!hit) continue;
    out.push({ id: 'auto_' + t.id, auto: true, type: hit[1], title: t.text.split('\n')[0].slice(0, 120), pageId: p.id, box: [Math.round(t.x), Math.round(t.y), Math.round(t.x + 300), Math.round(t.y + t.s * 1.4)],
      nbId: nb.id, nbTitle: nb.title, pageNo: order.get(p.id) + 1, section: secTitle(order.get(p.id)), created: 0 });
  }
  return out.sort((a, b) => a.pageNo - b.pageNo || a.box[1] - b.box[1]);
}
function saveItemFlow(p, box) {
  return new Promise(res => {
    const v = { type: 'question' };
    const m = openModal(`<h2>Save to this subject</h2>
      <div class="field"><label class="lbl">What is it?</label><div class="seg">${ITEM_TYPES.map(([k, l, c]) => `<button class="chip${k === v.type ? ' on' : ''}" data-v="${k}" style="${k === v.type ? '' : `color:${c}`}">${l}</button>`).join('')}</div></div>
      <div class="field"><label class="lbl">Title</label><input type="text" name="t" placeholder="e.g. Q3 — chain rule with trig"></div>
      <p class="hint">It appears under “Saved” in this notebook and in the subject folder, and jumps straight back here when tapped.</p>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button></div>`);
    wireSeg($('.seg', m.el), k => (v.type = k));
    const ok = async () => {
      const title = $('[name=t]', m.el).value.trim() || `${ITEM_MAP[v.type].label} · p. ${E.pages.indexOf(p) + 1}`;
      E.nb.items.push({ id: uid(), type: v.type, title, pageId: p.id, box: box.map(n => Math.round(n)), created: Date.now() });
      await saveNb(); m.close(); clearSelection(); toast(`Saved “${title}”`);
      if (S.sideOpen && S.sideTab === 'saved') renderEdSide();
    };
    $('[data-ok]', m.el).onclick = ok; $('[name=t]', m.el).onkeydown = e => { if (e.key === 'Enter') ok(); };
    m.onClose = () => res(); $('[name=t]', m.el).focus();
  });
}

// ---------- Editor sidebar ----------
let sideIO = null, thumbQ = new Set(), thumbT = null, savedFilter = 'all';
function toggleSide(force) {
  S.sideOpen = force ?? !S.sideOpen; saveSettings();
  $('#edSide').hidden = !S.sideOpen; $('#sideBtn').classList.toggle('on', S.sideOpen);
  if (S.sideOpen) renderEdSide(); else sideIO?.disconnect();
}
function closeSideIfOverlay() { if (innerWidth < 1100 && S.sideOpen) toggleSide(false); }
function setSideTab(t) { S.sideTab = t; saveSettings(); if (!S.sideOpen) toggleSide(true); else renderEdSide(); }
function updateSideCurrent(i) {
  if (S.sideTab === 'pages') $$('#sideBody .pg-card').forEach(t => t.classList.toggle('cur', +t.dataset.pi === i));
  else if (S.sideTab === 'outline') renderEdSide();
}
function queueThumb(p) {
  if (S.sideTab !== 'pages') return; thumbQ.add(p); clearTimeout(thumbT);
  thumbT = setTimeout(() => { for (const q of thumbQ) { const c = $(`#sideBody .pg-card[data-pi="${E.pages.indexOf(q)}"] canvas`); if (c) renderThumb(c, q); } thumbQ.clear(); }, 900);
}
async function itemMenu(it) {
  if (!it) return;
  const v = await menu(it.title, [{ label: 'Go to', value: 'go' }, { label: 'Rename', value: 'ren' }, { label: 'Change type…', value: 'type' }, { label: 'Remove from saved', value: 'del', danger: true }]);
  if (v === 'go') return goToBox(E.byId.get(it.pageId), it.box);
  if (v === 'ren') { const t = await promptText('Rename', it.title); if (t) it.title = t; }
  if (v === 'type') { const k = await menu('Type', ITEM_TYPES.map(([k, l]) => ({ label: l, value: k }))); if (k) it.type = k; }
  if (v === 'del') E.nb.items = E.nb.items.filter(x => x !== it);
  await saveNb(); renderEdSide();
}
function quickJump() {
  const list = secList(), cur = currentIndex(), { lesson, topic } = secAt(cur), on = topic || lesson;
  openPopover($('#pageInd'), 'jump', box => {
    box.innerHTML = `<div class="pop-title">Jump to</div><div class="quick-list">${list.length ? list.map(e => `<button class="lv${e.s.level || 1}${e.s === on ? ' on' : ''}" data-go="${e.i}">
      <span class="qdot" style="--c:${esc(e.s.color || S.accent)}"></span>${esc(e.s.title)}<span class="qpg">p. ${e.i + 1}</span></button>`).join('')
      : `<p class="opt-hint">No lessons or topics yet.</p>`}</div>
      <div class="seg" style="margin-top:10px"><button class="chip" data-a="first">First page</button><button class="chip" data-a="last">Last page</button><button class="chip" data-a="add">+ Lesson / topic</button><button class="chip" data-a="side">Open outline</button></div>`;
    box.addEventListener('click', e => {
      const g = e.target.closest('[data-go]'), a = e.target.closest('[data-a]')?.dataset.a;
      if (g) { scrollToPage(+g.dataset.go, true); closePopover(); }
      if (a === 'first') { scrollToPage(0, true); closePopover(); }
      if (a === 'last') { scrollToPage(E.pages.length - 1, true); closePopover(); }
      if (a === 'add') { closePopover(); addSectionFlow(); }
      if (a === 'side') { closePopover(); setSideTab('outline'); }
    });
  });
}

// ---------- Page actions ----------
async function addPage() {
  const i = currentIndex(), cur = E.pages[i];
  const p = newPage(E.nb, cur && !cur.bgKey ? { template: cur.template, paperColor: cur.paperColor, w: cur.w, h: cur.h } : {});
  E.pages.splice(i + 1, 0, p); E.byId.set(p.id, p);
  await db.put('pages', p); await saveNb();
  buildPages(); scrollToPage(i + 1); updateInd(); renderEdSide(); toast(`Page ${i + 2} added`, 1400);
}
async function duplicatePage(i) {
  const src = E.pages[i];
  const p = { ...structuredClone(src), id: uid() };
  p.texts.forEach(t => (t.id = uid()));
  if (src.bgKey) p.bgKey = await copyBlob(src.bgKey, 'bg_');
  for (const im of p.images) im.key = await copyBlob(im.key);
  E.pages.splice(i + 1, 0, p); E.byId.set(p.id, p);
  await db.put('pages', p); await saveNb(); buildPages(); scrollToPage(i + 1); updateInd(); renderEdSide();
}
async function deletePage(i) {
  if (!await confirmBox(`Delete page ${i + 1}? This can’t be undone.`)) return;
  await deletePages(i, i + 1);
}
async function movePage(i, d) {
  const j = i + d; if (j < 0 || j >= E.pages.length) return;
  [E.pages[i], E.pages[j]] = [E.pages[j], E.pages[i]];
  await saveNb(); buildPages(); renderEdSide(); scrollToPage(j);
}
async function pageMenu(i) {
  const p = E.pages[i];
  const v = await menu(`Page ${i + 1}`, [
    { label: 'Go to', value: 'go' }, { label: p.bookmark ? 'Remove bookmark' : 'Bookmark', value: 'bm' },
    { label: 'Move earlier', value: 'up' }, { label: 'Move later', value: 'down' },
    { label: 'Duplicate', value: 'dup' }, { label: 'Start a lesson / topic here', value: 'sec' }, { label: 'Delete page', value: 'del', danger: true },
  ]);
  if (v === 'go') scrollToPage(i);
  if (v === 'bm') toggleBookmark(i);
  if (v === 'up') movePage(i, -1);
  if (v === 'down') movePage(i, 1);
  if (v === 'dup') duplicatePage(i);
  if (v === 'sec') { scrollToPage(i); addSectionFlow(); }
  if (v === 'del') deletePage(i);
}
function toggleBookmark(i = currentIndex()) {
  const p = E.pages[i]; p.bookmark = !p.bookmark; markDirty(p);
  E.els.get(p.id)?.classList.toggle('bookmarked', p.bookmark);
  updateInd(); toast(p.bookmark ? '🔖 Bookmarked' : 'Bookmark removed', 1200);
  if (S.sideOpen && (S.sideTab === 'marks' || S.sideTab === 'pages')) renderEdSide();
}
async function applyToPages(title, scopeOpts, fn) {
  const scope = await menu(title, scopeOpts); if (!scope) return null;
  const i = currentIndex(), list = scope === 'one' ? [E.pages[i]] : E.pages;
  list.forEach(p => { fn(p); markDirty(p); });
  return scope;
}
async function exportPagePng(i) {
  const p = E.pages[i]; await preloadPage(p);
  const s = Math.min(2, Math.sqrt(16e6 / (p.w * p.h))), c = document.createElement('canvas'); c.width = Math.round(p.w * s); c.height = Math.round(p.h * s);
  renderPage(c.getContext('2d'), p, s, { texts: true, sync: true });
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  readyToShare(blob, `${safeName(E.nb.title)} - page ${i + 1}.png`);
}
async function insertPagesAt(pages, i) {
  E.pages.splice(i + 1, 0, ...pages); pages.forEach(p => E.byId.set(p.id, p));
  await saveNb(); buildPages(); scrollToPage(i + 1); updateInd(); renderEdSide();
  toast(`Added ${pages.length} page${pages.length > 1 ? 's' : ''}`);
}
async function insertPhotoPages(files, i) { if (!files.length) return; await insertPagesAt(await photosToPages(files, E.nb), i); }
async function insertDocFile(f, i) {
  const pages = /\.docx$/i.test(f.name) ? await docxToPages(f, E.nb) : await pdfToPages(f, E.nb);
  closeProgress(); await insertPagesAt(pages, i);
}

// ---------- Settings UI ----------
function openSettings() {
  const m = openModal(`<h2>Settings</h2>
    <div class="version-row"><span>Version <b>${APP_VERSION}</b></span><button class="chip" id="sUpdate">Check for updates</button></div>
    <div class="field"><label class="lbl">App name</label><input type="text" id="sName" value="${esc(S.appName)}"></div>
    <div class="field"><label class="lbl">Theme</label><div class="seg" id="sTheme">${segHtml([['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], S.theme)}</div></div>
    <div class="field"><label class="lbl">Accent color</label><div class="seg" id="sAccent">${swatchHtml(ACCENTS, S.accent)}<label class="cswatch custom" title="Custom color"><input type="color" id="sAccentCustom" value="${S.accent}"></label></div></div>
    <div class="field"><label class="lbl">Interface font</label><div class="seg" id="sFont">${segHtml([['system', 'System'], ['rounded', 'Rounded'], ['serif', 'Serif'], ['mono', 'Typewriter']], S.uiFont)}</div></div>
    <div class="field"><label class="lbl">Desk behind the pages</label><div class="seg" id="sDesk">${segHtml([['dots', 'Dots'], ['plain', 'Plain'], ['grid', 'Grid'], ['warm', 'Warm wood'], ['night', 'Night']], S.desk)}</div></div>
    <div class="field"><label class="lbl">Cover size in the library</label><div class="seg" id="sCover">${segHtml([['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], S.coverSize)}</div></div>
    <div class="field"><label class="lbl">Ask Claude</label>
      <input type="password" id="sKey" autocomplete="off" spellcheck="false" placeholder="Paste your Claude API key (sk-ant-…)" value="${S.claudeKey ? '••••••••••••' + esc(S.claudeKey.slice(-4)) : ''}">
      <div class="seg" style="margin-top:8px"><button class="chip" id="sKeyTest">Test key</button><button class="chip" id="sKeyDel">Remove key</button></div>
      <p class="hint">Lets you select a formula, equation or question and ask Claude about it (needs internet). Create a key at console.anthropic.com → API Keys. Use is billed to your Anthropic account: usually a few cents per question. The key stays on this device and is sent only to Anthropic.</p></div>
    <div class="field"><label class="lbl">New notebooks</label><div class="seg" id="sPaper">${segHtml(TEMPLATES, S.paper)}</div>
      <div class="seg" id="sSize" style="margin-top:8px">${segHtml(PAGE_SIZES.map(s => [s[0], s[1]]), S.pageSize)}</div>
      <div class="seg" id="sPaperColor" style="margin-top:8px">${segHtml(PAPER_COLORS, S.paperColor)}</div></div>
    <div class="field"><label class="lbl">Pen colors</label><div class="palette-row" data-pal="pen">${S.pen.map((c, i) => `<input type="color" data-i="${i}" value="${c}">`).join('')}</div></div>
    <div class="field"><label class="lbl">Highlighter colors</label><div class="palette-row" data-pal="hl">${S.hl.map((c, i) => `<input type="color" data-i="${i}" value="${c}">`).join('')}</div></div>
    <div class="field"><label class="lbl">Writing</label>
      <div class="seg" id="sPen">${segHtml([['ball', 'Ballpoint'], ['fount', 'Fountain'], ['brush', 'Brush']], S.penStyle)}</div>
      <label class="toggle"><input type="checkbox" data-k="pencilOnly" ${S.pencilOnly ? 'checked' : ''}><span>Only Apple Pencil draws (fingers scroll &amp; zoom)</span></label>
      <label class="toggle"><input type="checkbox" data-k="fingerTaps" ${S.fingerTaps ? 'checked' : ''}><span>Two-finger tap = undo, three-finger tap = redo</span></label>
      <label class="toggle"><input type="checkbox" data-k="shapeSnap" ${S.shapeSnap ? 'checked' : ''}><span>Hold the pen still to snap lines and shapes</span></label>
      <label class="toggle"><input type="checkbox" data-k="favBar" ${S.favBar ? 'checked' : ''}><span>Show the pen presets bar</span></label>
      <label class="toggle"><input type="checkbox" data-k="wheel" ${S.wheel ? 'checked' : ''}><span>Press and hold a finger on the page for the tool wheel</span></label>
      <label class="toggle"><input type="checkbox" data-k="dblSwap" ${S.dblSwap ? 'checked' : ''}><span>Double-tap with a finger to switch back to the last tool</span></label>
    </div>
    <div class="field"><label class="lbl">Your data <span id="sStorage"></span></label>
      <div class="seg"><button class="chip" id="sBackup">Back up everything</button><button class="chip" id="sRestore">Restore a backup</button></div>
      <p class="hint">Notes are stored only on this device. Back up now and then and keep the file in iCloud Drive (Files app).</p></div>
    <div class="modal-actions"><button class="btn primary" data-close>Done</button></div>`);
  wireSeg($('#sTheme', m.el), v => { S.theme = v; saveSettings(); });
  wireSeg($('#sAccent', m.el), v => { S.accent = v; saveSettings(); });
  $('#sAccentCustom', m.el).oninput = e => { S.accent = e.target.value; saveSettings(); };
  wireSeg($('#sPaper', m.el), v => { S.paper = v; saveSettings(); });
  wireSeg($('#sSize', m.el), v => { S.pageSize = v; saveSettings(); });
  wireSeg($('#sPaperColor', m.el), v => { S.paperColor = v; saveSettings(); });
  wireSeg($('#sPen', m.el), v => { S.penStyle = v; saveSettings(); });
  $('#sUpdate', m.el).onclick = () => checkForUpdate();
  wireSeg($('#sFont', m.el), v => { S.uiFont = v; saveSettings(); });
  wireSeg($('#sDesk', m.el), v => { S.desk = v; saveSettings(); });
  wireSeg($('#sCover', m.el), v => { S.coverSize = v; saveSettings(); });
  const keyIn = $('#sKey', m.el);
  keyIn.onchange = () => { const v = keyIn.value.trim(); if (v && !v.startsWith('••')) { S.claudeKey = v; saveSettings(); keyIn.value = '••••••••••••' + v.slice(-4); toast('Key saved on this device'); } };
  $('#sKeyDel', m.el).onclick = () => { S.claudeKey = ''; saveSettings(); keyIn.value = ''; toast('Key removed'); };
  $('#sKeyTest', m.el).onclick = guard(async () => { keyIn.onchange(); toast('Testing…', 8000); toast(await testClaudeKey(), 4000); });
  $$('.palette-row', m.el).forEach(row => row.addEventListener('input', e => { S[row.dataset.pal][+e.target.dataset.i] = e.target.value; saveSettings(); }));
  $$('[data-k]', m.el).forEach(c => c.onchange = () => { S[c.dataset.k] = c.checked; if (c.dataset.k === 'pencilOnly') S.pencilSeen = true; saveSettings(); if (E.nb) renderFav(); });
  $('#sBackup', m.el).onclick = guard(async () => { m.close(); await exportBackup(); });
  $('#sRestore', m.el).onclick = guard(async () => { m.close(); await importBackup(); });
  navigator.storage?.estimate?.().then(e => { const el = $('#sStorage', m.el); if (el) el.textContent = `· ${fmtSize(e.usage || 0)} used`; });
  m.onClose = () => { S.appName = $('#sName', m.el).value.trim() || 'Inkbook'; saveSettings(); if (E.nb) updateToolbar(); else showLibrary(); };
}

// ---------- Migration from v1 ----------
async function migrate() {
  const nbs = await db.all('notebooks'), folders = await db.all('folders'), byName = new Map(folders.map(f => [f.name, f]));
  for (const n of nbs) {
    let ch = false;
    if (n.subject && n.folderId === undefined) {
      let f = byName.get(n.subject);
      if (!f) { f = { id: uid(), name: n.subject, color: COVER_COLORS[byName.size % COVER_COLORS.length], parentId: null, created: Date.now() }; byName.set(f.name, f); await db.put('folders', f); }
      n.folderId = f.id; ch = true;
    }
    if (!n.sections) { n.sections = []; ch = true; }
    if (!n.items) { n.items = []; ch = true; }
    if (ch) await db.put('notebooks', n);
  }
}

// ---------- Boot ----------
async function boot() {
  $$('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

  // library
  $('#libContent').addEventListener('click', guard(onLibClick));
  $('#libSide').addEventListener('click', guard(async e => {
    const v = e.target.closest('[data-view]'); if (v) { LIB.view = v.dataset.view; LIB.folderId = null; LIB.q = ''; $('#search').value = ''; document.body.classList.remove('drawer-open'); return showLibrary(); }
    const tw = e.target.closest('[data-tw]'); if (tw) { const id = tw.dataset.tw; LIB.open.has(id) ? LIB.open.delete(id) : LIB.open.add(id); return renderSide(); }
    const tf = e.target.closest('[data-tf]'); if (tf) return openFolder(tf.dataset.tf);
  }));
  $('#crumbs').addEventListener('click', e => { const c = e.target.closest('[data-crumb]'); if (c) openFolder(c.dataset.crumb); });
  $('#newFolderSide').onclick = guard(async e => { e.stopPropagation(); if (await newFolder(null)) showLibrary(); });
  $('#newBtn').onclick = guard(newMenu);
  $('#importSide').onclick = guard(importNotesFlow);
  $('#convertSide').onclick = guard(converterFlow);
  $('#settingsBtn').onclick = openSettings;
  $('#libMenuBtn').onclick = () => document.body.classList.toggle('drawer-open');
  $('#drawerBack').onclick = () => document.body.classList.remove('drawer-open');
  $('#sortBtn').onclick = guard(async () => {
    const v = await menu('Sort notebooks by', [{ label: 'Last edited', value: 'recent' }, { label: 'Name', value: 'name' }, { label: 'Date created', value: 'created' }]);
    if (v) { S.sort = v; saveSettings(); showLibrary(); }
  });
  $('#layoutBtn').onclick = () => { S.libLayout = S.libLayout === 'list' ? 'grid' : 'list'; saveSettings(); showLibrary(); };
  let sT; $('#search').oninput = e => { LIB.q = e.target.value; clearTimeout(sT); sT = setTimeout(() => showLibrary(), 220); };

  // editor
  $('#backBtn').onclick = guard(leaveNotebook);
  let titleTap = 0;
  $('#nbTitle').addEventListener('click', () => {
    const now = Date.now();
    if (now - titleTap < 420) {
      titleTap = 0;
      inlineRename($('#nbTitle'), E.nb.title, async v => { E.nb.title = v; await saveNb(); toast('Renamed', 1200); });
    } else titleTap = now;
  });
  $('#sideBtn').onclick = () => toggleSide();
  $('#edSide').addEventListener('click', guard(onSideClick));
  $('#addSecBtn').onclick = guard(() => addSectionFlow({ level: 1 }));
  $('#addTopicBtn').onclick = guard(() => addSectionFlow({ level: 2 }));
  $('#sideClose').onclick = () => toggleSide(false);
  $('#undoBtn').onclick = undo; $('#redoBtn').onclick = redo;
  $$('.tool').forEach(b => b.onclick = () => {
    if (E.tool === b.dataset.tool) openPopover(b, 'tool', box => buildToolOptions(box, true)); else setTool(b.dataset.tool);
  });
  $('#optsBtn').onclick = e => openPopover(e.currentTarget, 'tool', box => buildToolOptions(box, true));
  $('#imageBtn').onclick = guard(async () => insertImages(await pickFiles('image/*', true)));
  $('#bookmarkBtn').onclick = () => toggleBookmark();
  $('#pencilBtn').onclick = () => {
    S.pencilOnly = !S.pencilOnly; S.pencilSeen = true; saveSettings(); updatePencilBtn();
    toast(S.pencilOnly ? '✏️ Pencil-only: fingers scroll & zoom' : '☝️ Finger drawing on: use two fingers to scroll & zoom');
  };
  $('#addPageBtn').onclick = guard(addPage);
  $('#moreBtn').onclick = guard(moreMenu);
  $('#pageInd').onclick = quickJump;
  $('#zoomIn').onclick = () => zoomCenter(E.zoom * 1.25);
  $('#zoomOut').onclick = () => zoomCenter(E.zoom / 1.25);
  $('#zoomFit').onclick = () => zoomCenter(1);

  scroller.addEventListener('pointerdown', onGrowDown, true);
  scroller.addEventListener('pointerdown', onDown);
  scroller.addEventListener('pointermove', onMove);
  scroller.addEventListener('pointerup', onUp);
  scroller.addEventListener('pointercancel', onUp);
  scroller.addEventListener('pointerup', onFingerUp);
  scroller.addEventListener('pointercancel', onFingerUp);
  scroller.addEventListener('touchstart', onTouch, { passive: false });
  scroller.addEventListener('touchmove', onTouch, { passive: false });
  scroller.addEventListener('touchend', onTouchEnd);
  scroller.addEventListener('touchcancel', onTouchEnd);
  scroller.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); zoomAt(E.zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY); } }, { passive: false });
  let indQ = false;
  scroller.addEventListener('scroll', () => { if (!indQ) { indQ = true; requestAnimationFrame(() => { indQ = false; if (pinch?.live) return; updateInd(); placeFloats(); checkRegions(); }); } }, { passive: true });
  addEventListener('resize', () => requestAnimationFrame(placeFloats));
  ['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => e.preventDefault()));
  let rT, lastW = 0;
  new ResizeObserver(() => {
    if (scroller.clientWidth === lastW) return; lastW = scroller.clientWidth;
    clearTimeout(rT); rT = setTimeout(() => E.nb && layout(), 60);
  }).observe(scroller);

  // drag & drop and paste (images, PDFs, Word)
  scroller.addEventListener('dragover', e => { if (E.nb) e.preventDefault(); });
  scroller.addEventListener('drop', guard(async e => {
    if (!E.nb) return; e.preventDefault();
    const files = [...e.dataTransfer.files], pageEl = e.target.closest?.('.page');
    let target = null;
    if (pageEl) { const p = E.byId.get(pageEl.dataset.id), pt = toPt({ rect: pageEl.getBoundingClientRect(), page: p }, e); target = { page: p, x: pt.x, y: pt.y }; }
    const imgs = files.filter(f => f.type.startsWith('image/')); if (imgs.length) await insertImages(imgs, target);
    for (const f of files.filter(f => /\.(pdf|docx)$/i.test(f.name))) await insertDocFile(f, currentIndex());
  }));
  $('#libMain').addEventListener('dragover', e => e.preventDefault());
  $('#libMain').addEventListener('drop', guard(async e => { e.preventDefault(); const files = [...e.dataTransfer.files]; if (files.length) await importFiles(files, curFolder()); }));
  document.addEventListener('paste', guard(async e => {
    if (!E.nb || e.target.closest?.('[contenteditable], input, textarea')) return;
    const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); await insertImages(files); }
    else if (E.clip) { e.preventDefault(); const p = E.pages[currentIndex()]; await pasteClip(p, { x: E.clip.box[0] + 24, y: E.clip.box[1] + 24 }); }
  }));

  document.addEventListener('keydown', e => {
    if (!E.nb || e.target.closest?.('[contenteditable], input, textarea, select')) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (mod && k === 'c' && E.sel) { e.preventDefault(); selAction('copy'); return; }
    if (mod && k === 'x' && E.sel) { e.preventDefault(); selAction('cut'); return; }
    if (mod && k === 'd' && E.sel) { e.preventDefault(); selAction('dup'); return; }
    if (mod && k === 'a') { e.preventDefault(); selectAll(); return; }
    if (mod) return;
    const map = { p: 'pen', h: 'hl', e: 'eraser', s: 'shape', l: 'lasso', t: 'text', k: 'laser' };
    if (map[k]) setTool(map[k]);
    if (k === 'i') $('#imageBtn').click();
    if (k === 'b') toggleBookmark();
    if (k === 'escape') { clearSelection(); closePopover(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && E.sel) selAction('del');
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && E.nb) { E.nb.lastPage = currentIndex(); flush(); saveNb(); } });
  addEventListener('pagehide', () => flush());

  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) setupUpdates();
  await migrate();
  showLibrary();
}
