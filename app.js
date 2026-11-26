'use strict';
/* =====================================================================
   Inkbook — personal handwritten notes (offline PWA for iPad)
   Sections: utils · settings · storage · library · editor · tools ·
             pdf import/export · backup · settings UI · boot
   ===================================================================== */

// ---------- Utils ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtSize = b => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB';
const safeName = s => (s || 'notes').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'notes';

const PAGE_W = 1000, A4_H = 1414, ZMIN = 0.5, ZMAX = 4, MAX_PX = 7e6;
const LIBS = {
  pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
};
const COVER_COLORS = ['#5b6cff', '#0090ff', '#12a594', '#30a46c', '#ffc53d', '#f76b15', '#e5484d', '#d6409f', '#8e4ec6', '#1f2430', '#8d8d86', '#a18072'];
const ACCENTS = ['#5b6cff', '#0090ff', '#12a594', '#30a46c', '#f76b15', '#e5484d', '#d6409f', '#8e4ec6', '#1f2430'];
const TEMPLATES = [['blank', 'Blank'], ['lined', 'Lined'], ['grid', 'Grid'], ['dots', 'Dotted'], ['cornell', 'Cornell']];
const PAPER_COLORS = [['#ffffff', 'White'], ['#fbf6e9', 'Cream'], ['#1e2027', 'Dark']];
const SIZES = { pen: [1.6, 3, 5.5], hl: [12, 20, 30], eraser: [8, 18, 36], text: [18, 26, 38] };

const ICONS = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 000 10h3"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  hl: '<path d="M9 11l-6 6v3h9l3-3"/><path d="M22 12l-4.6 4.6a2 2 0 01-2.8 0l-5.2-5.2a2 2 0 010-2.8L14 4"/>',
  eraser: '<path d="M20 20H7l-4-4a1.5 1.5 0 010-2.1L13.9 3a1.5 1.5 0 012.1 0l5 5a1.5 1.5 0 010 2.1L11 20"/><path d="M6 11l7 7"/>',
  lasso: '<path d="M7 22a5 5 0 01-2-4"/><path d="M3.3 14A6.8 6.8 0 012 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 01-5-1"/><circle cx="5" cy="16" r="2"/>',
  text: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  hand: '<path d="M18 11V6a2 2 0 00-4 0M14 10V4a2 2 0 00-4 0v2M10 10.5V6a2 2 0 00-4 0v8"/><path d="M18 8a2 2 0 114 0v6a8 8 0 01-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 012.8-2.8L7 15"/>',
  addpage: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M12 18v-6M9 15h6"/>',
  pages: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pdf: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/><path d="M12 12v6M9 15l3 3 3-3"/>',
};
const icon = n => `<svg class="i" viewBox="0 0 24 24">${ICONS[n] || ''}</svg>`;

function isDark(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '#ffffff'); if (!m) return false;
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.45;
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
function pickFile(accept) {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept;
    i.onchange = () => res(i.files[0] || null); i.click();
  });
}
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { console.error(e); hideToast(); toast('⚠️ ' + (e.message || e), 5000); } };

// ---------- Settings ----------
const DEFAULTS = {
  appName: 'Inkbook', theme: 'auto', accent: '#5b6cff', pencilOnly: false, pencilSeen: false, pressure: true,
  paper: 'lined', paperColor: '#ffffff',
  pen: ['#1f2430', '#2f5bea', '#e5484d', '#18a058', '#8e4ec6'],
  hl: ['#ffe14d', '#7cf29c', '#7cc8ff', '#ff9ad5', '#ffb86b'],
};
let S = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('inkbook.settings') || '{}') }; } catch { return { ...DEFAULTS }; } })();
function saveSettings() { try { localStorage.setItem('inkbook.settings', JSON.stringify(S)); } catch { } applyTheme(); }
function applyTheme() {
  const r = document.documentElement;
  r.dataset.theme = S.theme;
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
    const r = indexedDB.open('inkbook', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('notebooks', { keyPath: 'id' });
      d.createObjectStore('pages', { keyPath: 'id' }).createIndex('nb', 'notebookId');
      d.createObjectStore('blobs');
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

// Background images (PDF pages) — small LRU so the iPad doesn't run out of memory
const bgCache = new Map(), bgLoading = new Map();
function loadBg(key) {
  if (bgCache.has(key)) { const v = bgCache.get(key); bgCache.delete(key); bgCache.set(key, v); return Promise.resolve(v); }
  if (!bgLoading.has(key)) bgLoading.set(key, db.get('blobs', key).then(async b => {
    if (!b) return null;
    let img;
    try { img = await createImageBitmap(b); }
    catch { img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(b); }); }
    bgCache.set(key, img);
    while (bgCache.size > 8) { const [k, v] = bgCache.entries().next().value; v.close?.(); bgCache.delete(k); }
    return img;
  }).finally(() => bgLoading.delete(key)));
  return bgLoading.get(key);
}

// ---------- Rendering ----------
function widthAt(st, pr) { return st.pr ? st.w * (0.35 + pr * 1.15) : st.w; }
function drawStroke(ctx, st, s, dark) {
  const q = st.p, n = q.length / 3; if (!n) return;
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = st.c; ctx.fillStyle = st.c;
  if (st.t === 'hl') {
    ctx.globalAlpha = dark ? 0.45 : 0.4; if (!dark) ctx.globalCompositeOperation = 'multiply';
    ctx.lineWidth = st.w * s; ctx.beginPath(); ctx.moveTo(q[0] * s, q[1] * s);
    if (n === 1) ctx.lineTo(q[0] * s + 0.01, q[1] * s);
    for (let i = 1; i < n - 1; i++) { const j = i * 3; ctx.quadraticCurveTo(q[j] * s, q[j + 1] * s, (q[j] + q[j + 3]) / 2 * s, (q[j + 1] + q[j + 4]) / 2 * s); }
    if (n > 1) ctx.lineTo(q[(n - 1) * 3] * s, q[(n - 1) * 3 + 1] * s);
    ctx.stroke();
  } else if (n === 1) {
    ctx.beginPath(); ctx.arc(q[0] * s, q[1] * s, Math.max(0.5, widthAt(st, q[2]) * s / 2), 0, Math.PI * 2); ctx.fill();
  } else {
    let px = q[0], py = q[1];
    for (let i = 1; i < n; i++) {
      const j = i * 3, x = q[j], y = q[j + 1], last = i === n - 1;
      const ex = last ? x : (x + q[j + 3]) / 2, ey = last ? y : (y + q[j + 4]) / 2;
      ctx.lineWidth = Math.max(0.6, widthAt(st, q[j + 2]) * s);
      ctx.beginPath(); ctx.moveTo(px * s, py * s); ctx.quadraticCurveTo(x * s, y * s, ex * s, ey * s); ctx.stroke();
      px = ex; py = ey;
    }
  }
  ctx.restore();
}
function drawTemplate(ctx, p, s) {
  const t = p.template; if (!t || t === 'blank') return;
  const dark = isDark(p.paperColor), g = 40, W = p.w * s, H = p.h * s;
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = dark ? 'rgba(255,255,255,0.14)' : 'rgba(60,80,140,0.2)';
  ctx.lineWidth = Math.max(1, 1.1 * s);
  ctx.beginPath();
  if (t === 'lined' || t === 'cornell') for (let y = t === 'cornell' ? 160 : 130; y < p.h - 40; y += g) { ctx.moveTo(0, y * s); ctx.lineTo(W, y * s); }
  if (t === 'grid') {
    for (let x = g; x < p.w; x += g) { ctx.moveTo(x * s, 0); ctx.lineTo(x * s, H); }
    for (let y = g; y < p.h; y += g) { ctx.moveTo(0, y * s); ctx.lineTo(W, y * s); }
  }
  ctx.stroke();
  if (t === 'dots') {
    const r = Math.max(0.9, 1.8 * s); ctx.beginPath();
    for (let x = g; x < p.w; x += g) for (let y = g; y < p.h; y += g) { ctx.moveTo(x * s + r, y * s); ctx.arc(x * s, y * s, r, 0, Math.PI * 2); }
    ctx.fill();
  }
  if (t === 'lined') {
    ctx.strokeStyle = dark ? 'rgba(255,120,120,.28)' : 'rgba(229,72,77,.38)';
    ctx.beginPath(); ctx.moveTo(100 * s, 0); ctx.lineTo(100 * s, H); ctx.stroke();
  }
  if (t === 'cornell') {
    ctx.strokeStyle = dark ? 'rgba(255,255,255,.32)' : 'rgba(60,80,140,.45)'; ctx.lineWidth = Math.max(1, 2 * s);
    ctx.beginPath();
    ctx.moveTo(0, 120 * s); ctx.lineTo(W, 120 * s);
    ctx.moveTo(280 * s, 120 * s); ctx.lineTo(280 * s, (p.h - 260) * s);
    ctx.moveTo(0, (p.h - 260) * s); ctx.lineTo(W, (p.h - 260) * s);
    ctx.stroke();
  }
  ctx.restore();
}
function drawTexts(ctx, p, s) {
  for (const t of p.texts) {
    if (!t.text) continue;
    const fs = t.s * s, lh = fs * 1.3, maxW = (p.w - t.x - 8) * s, x = (t.x + 4) * s;
    let y = (t.y + 2) * s + fs * 0.15;
    ctx.font = `${fs}px -apple-system, system-ui, sans-serif`; ctx.fillStyle = t.c; ctx.textBaseline = 'top';
    for (const para of t.text.split('\n')) {
      let line = '';
      for (const word of para.split(/(\s+)/)) {
        const test = line + word;
        if (line && ctx.measureText(test).width > maxW) { ctx.fillText(line.trimEnd(), x, y); y += lh; line = word.trimStart(); }
        else line = test;
      }
      ctx.fillText(line, x, y); y += lh;
    }
  }
}
function renderPage(ctx, p, s, o = {}) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = p.paperColor || '#fff'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (p.bgKey) {
    const img = bgCache.get(p.bgKey);
    if (img) ctx.drawImage(img, 0, 0, p.w * s, p.h * s);
    else if (!o.sync) loadBg(p.bgKey).then(() => { if (E.byId.get(p.id) === p && E.visible.has(p.id)) paint(p); });
  }
  drawTemplate(ctx, p, s);
  const dark = isDark(p.paperColor);
  for (const st of p.strokes) if (!o.skip || !o.skip.has(st)) drawStroke(ctx, st, s, dark);
  if (o.texts) drawTexts(ctx, p, s);
}

// ---------- Library ----------
const LIB = { filter: 'All', q: '' };
let coverUrls = [];
async function showLibrary() {
  document.body.classList.remove('editing');
  $('#editor').hidden = true; $('#library').hidden = false;
  const nbs = (await db.all('notebooks')).sort((a, b) => b.updated - a.updated);
  const subjects = [...new Set(nbs.map(n => n.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if (LIB.filter !== 'All' && !subjects.includes(LIB.filter)) LIB.filter = 'All';
  const chips = $('#chips');
  chips.innerHTML = subjects.length ? ['All', ...subjects].map(s => `<button class="chip${s === LIB.filter ? ' on' : ''}" data-s="${esc(s)}">${esc(s)}</button>`).join('') : '';
  chips.onclick = e => { const b = e.target.closest('[data-s]'); if (b) { LIB.filter = b.dataset.s; showLibrary(); } };

  coverUrls.forEach(u => URL.revokeObjectURL(u)); coverUrls = [];
  const q = LIB.q.toLowerCase();
  const list = nbs.filter(n => (LIB.filter === 'All' || n.subject === LIB.filter) &&
    (!q || n.title.toLowerCase().includes(q) || (n.subject || '').toLowerCase().includes(q)));
  const grid = $('#grid');
  grid.innerHTML = `<div class="nb new-card"><div class="cover" data-new>${icon('plus')}<span>New notebook</span></div></div>` +
    list.map(n => `<div class="nb" data-id="${n.id}">
      <div class="cover" style="--c:${esc(n.color)}" data-open>${n.coverKey ? `<img alt="" data-key="${esc(n.coverKey)}">` : `<div class="cover-label">${esc(n.title)}</div>`}</div>
      <div class="nb-meta"><div><b>${esc(n.title)}</b><span>${n.subject ? esc(n.subject) + ' · ' : ''}${n.pages.length} pg · ${new Date(n.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></div>
      <button class="icon-btn" data-menu title="Options">${icon('more')}</button></div></div>`).join('') +
    (!list.length && nbs.length ? `<div class="empty">No notebooks match.</div>` : '');
  for (const img of $$('img[data-key]', grid)) {
    const b = await db.get('blobs', img.dataset.key);
    if (b) { const u = URL.createObjectURL(b); coverUrls.push(u); img.src = u; }
  }
}
async function onGridClick(e) {
  if (e.target.closest('[data-new]')) return newNotebook();
  const card = e.target.closest('.nb[data-id]'); if (!card) return;
  const nb = await db.get('notebooks', card.dataset.id); if (!nb) return;
  if (e.target.closest('[data-open]')) return openNotebook(nb.id);
  if (e.target.closest('[data-menu]')) {
    const v = await menu(nb.title, [
      { label: 'Open', value: 'open' },
      { label: 'Edit name, subject & cover', value: 'edit' },
      { label: 'Export as PDF', value: 'export' },
      { label: 'Delete notebook', value: 'del', danger: true },
    ]);
    if (v === 'open') openNotebook(nb.id);
    if (v === 'edit') { const r = await notebookForm(nb); if (r) { Object.assign(nb, r, { updated: Date.now() }); await db.put('notebooks', nb); showLibrary(); } }
    if (v === 'export') { const pages = await orderedPages(nb); await exportPDF(nb, pages); }
    if (v === 'del' && await confirmBox(`Delete “${nb.title}” and all its pages? This can’t be undone.`)) { await deleteNotebook(nb); showLibrary(); }
  }
}
async function orderedPages(nb) {
  const map = new Map((await db.pagesOf(nb.id)).map(p => [p.id, p]));
  return nb.pages.map(id => map.get(id)).filter(Boolean);
}
async function deleteNotebook(nb) {
  for (const p of await db.pagesOf(nb.id)) { await db.del('pages', p.id); if (p.bgKey) await db.del('blobs', p.bgKey); }
  await db.del('notebooks', nb.id);
}
function newPage(nb, o = {}) {
  return { id: uid(), notebookId: nb.id, w: PAGE_W, h: A4_H, template: o.template ?? nb.paper ?? 'lined', paperColor: o.paperColor ?? nb.paperColor ?? '#ffffff', bgKey: null, strokes: [], texts: [] };
}
async function newNotebook() {
  const v = await notebookForm(null); if (!v) return;
  const now = Date.now();
  const nb = { id: uid(), title: v.title, subject: v.subject, color: v.color, paper: v.paper, paperColor: v.paperColor, created: now, updated: now, pages: [], coverKey: null };
  const p = newPage(nb); nb.pages = [p.id];
  await db.put('pages', p); await db.put('notebooks', nb);
  openNotebook(nb.id);
}
async function importPdfNotebook() {
  const f = await pickFile('application/pdf,.pdf'); if (!f) return;
  const now = Date.now();
  const nb = { id: uid(), title: f.name.replace(/\.pdf$/i, ''), subject: LIB.filter !== 'All' ? LIB.filter : '', color: COVER_COLORS[0], paper: S.paper, paperColor: S.paperColor, created: now, updated: now, pages: [], coverKey: null };
  const pages = await pdfToPages(f, nb);
  nb.pages = pages.map(p => p.id); nb.coverKey = pages[0]?.bgKey || null;
  await db.put('notebooks', nb);
  toast(`Imported ${pages.length} pages`);
  openNotebook(nb.id);
}

// ---------- Modals ----------
function openModal(html, cls = '') {
  const back = document.createElement('div'); back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${cls}" role="dialog">${html}</div>`;
  const m = { el: back.firstElementChild, onClose: null, close() { if (!back.isConnected) return; back.remove(); m.onClose?.(); } };
  back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) m.close(); });
  document.body.appendChild(back); return m;
}
function menu(title, items) {
  return new Promise(res => {
    const m = openModal(`${title ? `<h2>${esc(title)}</h2>` : ''}<div class="menu-list">${items.map((it, i) =>
      `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</button>`).join('')}</div>`, 'small');
    let v = null;
    m.el.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) { v = items[+b.dataset.i].value; m.close(); } });
    m.onClose = () => res(v);
  });
}
function confirmBox(msg, ok = 'Delete') {
  return new Promise(res => {
    const m = openModal(`<p class="msg">${esc(msg)}</p><div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn danger" data-ok>${esc(ok)}</button></div>`, 'small');
    let v = false; m.el.querySelector('[data-ok]').onclick = () => { v = true; m.close(); }; m.onClose = () => res(v);
  });
}
function promptText(title, value = '') {
  return new Promise(res => {
    const m = openModal(`<h2>${esc(title)}</h2><input type="text" value="${esc(value)}"><div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>OK</button></div>`, 'small');
    const inp = m.el.querySelector('input'); let v = null;
    const ok = () => { v = inp.value.trim(); m.close(); };
    m.el.querySelector('[data-ok]').onclick = ok; inp.onkeydown = e => { if (e.key === 'Enter') ok(); };
    m.onClose = () => res(v); inp.focus(); inp.select();
  });
}
function wireSeg(root, onPick) {
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    $$('[data-v]', root).forEach(x => x.classList.toggle('on', x === b)); onPick(b.dataset.v);
  });
}
const segHtml = (opts, cur, cls = 'chip') => opts.map(([k, l]) => `<button class="${cls}${k === cur ? ' on' : ''}" data-v="${esc(k)}">${esc(l)}</button>`).join('');
const swatchHtml = (cols, cur) => cols.map(c => `<button class="cswatch${c === cur ? ' on' : ''}" data-v="${c}" style="--c:${c}"></button>`).join('');

async function notebookForm(nb) {
  const all = await db.all('notebooks');
  const subjects = [...new Set(all.map(n => n.subject).filter(Boolean))];
  const isNew = !nb;
  const v = nb ? { title: nb.title, subject: nb.subject || '', color: nb.color } :
    { title: '', subject: LIB.filter !== 'All' ? LIB.filter : '', color: COVER_COLORS[Math.floor(Math.random() * 9)], paper: S.paper, paperColor: S.paperColor };
  return new Promise(res => {
    const m = openModal(`<h2>${isNew ? 'New notebook' : 'Edit notebook'}</h2>
      <div class="field"><label class="lbl">Title</label><input type="text" name="title" value="${esc(v.title)}" placeholder="e.g. Calculus II — Lectures"></div>
      <div class="field"><label class="lbl">Subject / course</label><input type="text" name="subject" list="subjList" value="${esc(v.subject)}" placeholder="e.g. MATH 201"><datalist id="subjList">${subjects.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
      <div class="field"><label class="lbl">Cover color</label><div class="seg" data-k="color">${swatchHtml(COVER_COLORS, v.color)}</div></div>
      ${isNew ? `<div class="field"><label class="lbl">Paper</label><div class="seg" data-k="paper">${segHtml(TEMPLATES, v.paper)}</div></div>
      <div class="field"><label class="lbl">Paper color</label><div class="seg" data-k="paperColor">${segHtml(PAPER_COLORS, v.paperColor)}</div></div>` : ''}
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>${isNew ? 'Create' : 'Save'}</button></div>`);
    $$('.seg[data-k]', m.el).forEach(seg => wireSeg(seg, val => (v[seg.dataset.k] = val)));
    let out = null;
    const ok = () => { v.title = $('[name=title]', m.el).value.trim() || 'Untitled'; v.subject = $('[name=subject]', m.el).value.trim(); out = v; m.close(); };
    $('[data-ok]', m.el).onclick = ok;
    $('[name=title]', m.el).onkeydown = e => { if (e.key === 'Enter') ok(); };
    m.onClose = () => res(out);
    if (isNew) $('[name=title]', m.el).focus();
  });
}
function readyToShare(blob, name) {
  const m = openModal(`<h2>Ready</h2><p class="msg">${esc(name)} · ${fmtSize(blob.size)}</p><p class="hint">Use “Save to Files” to keep it in iCloud Drive, or send it anywhere.</p>
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

// ---------- Editor state ----------
const scroller = $('#scroller'), pagesEl = $('#pages');
const live = document.createElement('canvas'); live.className = 'live';
const E = {
  nb: null, pages: [], byId: new Map(), els: new Map(), visible: new Set(),
  tool: 'pen', color: { pen: S.pen[0], hl: S.hl[0] }, size: { pen: 1, hl: 1, eraser: 1, text: 1 },
  zoom: 1, undo: [], redo: [], sel: null, moving: false,
};
let active = null, pinch = null, io = null, liveQueued = false, selMenu = null;

async function openNotebook(id) {
  const nb = await db.get('notebooks', id); if (!nb) return;
  const map = new Map((await db.pagesOf(id)).map(p => [p.id, p]));
  E.nb = nb; E.pages = nb.pages.map(pid => map.get(pid)).filter(Boolean);
  if (!E.pages.length) { const p = newPage(nb); E.pages.push(p); await db.put('pages', p); }
  nb.pages = E.pages.map(p => p.id);
  E.byId = new Map(E.pages.map(p => [p.id, p]));
  E.undo = []; E.redo = []; E.sel = null; E.zoom = 1;
  $('#library').hidden = true; $('#editor').hidden = false; document.body.classList.add('editing');
  $('#nbTitle').textContent = nb.title;
  updateToolbar(); buildPages(); updateZoomLabel();
  scrollToPage(clamp(nb.lastPage || 0, 0, E.pages.length - 1));
  updateInd();
}
async function leaveNotebook() {
  if (!E.nb) return;
  clearSelection(); document.activeElement?.blur?.();
  E.nb.lastPage = currentIndex();
  await flush(); await saveNb();
  io?.disconnect(); pagesEl.innerHTML = ''; E.els.clear(); E.visible.clear();
  for (const v of bgCache.values()) v.close?.(); bgCache.clear();
  E.nb = null; showLibrary();
}
async function saveNb() { if (!E.nb) return; E.nb.pages = E.pages.map(p => p.id); E.nb.coverKey = E.pages[0]?.bgKey || null; await db.put('notebooks', E.nb); }

const dirty = new Set(); let saveT = null;
function markDirty(p) { dirty.add(p); clearTimeout(saveT); saveT = setTimeout(flush, 700); }
async function flush() {
  clearTimeout(saveT); const list = [...dirty]; dirty.clear();
  for (const p of list) await db.put('pages', p);
  if (E.nb && list.length) { E.nb.updated = Date.now(); await db.put('notebooks', E.nb); }
}

function buildPages() {
  io?.disconnect(); pagesEl.innerHTML = ''; E.els.clear(); E.visible.clear();
  io = new IntersectionObserver(onIntersect, { root: scroller, rootMargin: '120% 0px' });
  for (const p of E.pages) {
    const el = document.createElement('div'); el.className = 'page'; el.dataset.id = p.id;
    el.innerHTML = '<canvas class="ink"></canvas><div class="text-layer"></div><div class="page-num"></div>';
    pagesEl.appendChild(el); E.els.set(p.id, el); renderTexts(p, el); io.observe(el);
  }
  layout();
}
function onIntersect(entries) {
  for (const en of entries) {
    const p = E.byId.get(en.target.dataset.id); if (!p) continue;
    if (en.isIntersecting) { E.visible.add(p.id); paint(p); }
    else { E.visible.delete(p.id); const c = en.target.querySelector('canvas.ink'); c.width = c.height = 0; }
  }
}
function layout(again = true) {
  const cw = scroller.clientWidth;
  const bw = Math.min(cw - 40, 980) * E.zoom;
  E.pages.forEach((p, i) => {
    const el = E.els.get(p.id); if (!el) return;
    el.style.width = bw + 'px'; el.style.height = bw * p.h / p.w + 'px';
    el.style.setProperty('--s', bw / p.w); el.style.background = p.paperColor;
    el.querySelector('.page-num').textContent = i + 1;
  });
  if (again && scroller.clientWidth !== cw) return layout(false); // scrollbar appeared/disappeared
  for (const id of E.visible) paint(E.byId.get(id));
  if (E.sel) { showSelMenu(); scheduleLive(); }
}
function paint(p) {
  const el = E.els.get(p?.id); if (!el) return;
  const c = el.querySelector('canvas.ink');
  const cw = parseFloat(el.style.width), ch = parseFloat(el.style.height);
  let r = Math.min(devicePixelRatio || 1, 2);
  if (cw * ch * r * r > MAX_PX) r = Math.sqrt(MAX_PX / (cw * ch));
  const W = Math.round(cw * r), H = Math.round(ch * r);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  el._scale = W / p.w;
  renderPage(c.getContext('2d'), p, el._scale, { skip: E.moving && E.sel?.page === p ? E.sel.set : null });
}
function refreshPage(p) { const el = E.els.get(p.id); if (!el) return; renderTexts(p, el); if (E.visible.has(p.id)) paint(p); }
function currentIndex() {
  const mid = scroller.scrollTop + scroller.clientHeight * 0.4; let best = 0;
  E.pages.forEach((p, i) => { const el = E.els.get(p.id); if (el && el.offsetTop <= mid) best = i; });
  return best;
}
function scrollToPage(i) { const el = E.els.get(E.pages[i]?.id); if (el) scroller.scrollTop = el.offsetTop - 14; }
function updateInd() { if (E.nb) $('#pageInd').textContent = `${currentIndex() + 1} / ${E.pages.length}`; }
function updateZoomLabel() { $('#zoomLbl').textContent = Math.round(E.zoom * 100) + '%'; }
function zoomAt(z, cx, cy) {
  z = clamp(z, ZMIN, ZMAX); const r = z / E.zoom; if (Math.abs(r - 1) < 0.001) return;
  const pr = pagesEl.getBoundingClientRect(), vx = cx - pr.left, vy = cy - pr.top;
  const sl = scroller.scrollLeft, st = scroller.scrollTop;
  E.zoom = z; layout(); updateZoomLabel();
  scroller.scrollLeft = sl + vx * r - vx; scroller.scrollTop = st + vy * r - vy;
}
function zoomCenter(z) { const r = scroller.getBoundingClientRect(); zoomAt(z, r.left + r.width / 2, r.top + r.height / 2); }

// ---------- Toolbar ----------
function setTool(t) { if (t !== 'lasso') clearSelection(); document.activeElement?.blur?.(); E.tool = t; updateToolbar(); }
function updateToolbar() {
  $$('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === E.tool));
  scroller.classList.toggle('tool-text', E.tool === 'text');
  const pal = E.tool === 'hl' ? 'hl' : E.tool === 'eraser' ? null : 'pen';
  const colors = $('#colors'); colors.innerHTML = '';
  if (pal) S[pal].forEach((c, i) => {
    const b = document.createElement('button'); b.className = 'swatch' + (E.color[pal] === c ? ' on' : '');
    b.style.setProperty('--c', c); b.title = 'Tap again to change this color';
    b.onclick = () => onSwatch(pal, i, b); colors.appendChild(b);
  });
  const sizes = $('#sizes'); sizes.innerHTML = '';
  const sk = E.tool === 'lasso' ? null : E.tool;
  if (sk) SIZES[sk].forEach((_, i) => {
    const b = document.createElement('button'); b.className = 'size' + (E.size[sk] === i ? ' on' : '');
    b.innerHTML = sk === 'text' ? `<span style="font-size:${[12, 16, 21][i]}px">A</span>`
      : `<i style="--d:${({ pen: [4, 7, 11], hl: [8, 13, 18], eraser: [7, 12, 18] })[sk][i]}px"></i>`;
    b.onclick = () => { E.size[sk] = i; updateToolbar(); }; sizes.appendChild(b);
  });
  updateUndoBtns(); updatePencilBtn();
}
function onSwatch(pal, i, b) {
  const c = S[pal][i];
  if (E.color[pal] === c) {
    const inp = $('#colorPick'); inp.value = c;
    inp.oninput = () => { S[pal][i] = inp.value; E.color[pal] = inp.value; b.style.setProperty('--c', inp.value); };
    inp.onchange = () => { saveSettings(); if (E.tool === 'lasso' && E.sel) recolorSel(inp.value); };
    inp.click();
  } else {
    E.color[pal] = c; if (E.tool === 'lasso' && E.sel) recolorSel(c); updateToolbar();
  }
}
function updateUndoBtns() { $('#undoBtn').disabled = !E.undo.length; $('#redoBtn').disabled = !E.redo.length; }
function updatePencilBtn() { $('#pencilBtn').classList.toggle('on', S.pencilOnly); scroller.classList.toggle('pencil-only', S.pencilOnly); }

// ---------- Undo ----------
const snap = p => ({ strokes: p.strokes.slice(), texts: p.texts.slice() });
function pushUndo(p, before) {
  E.undo.push({ id: p.id, before, after: snap(p) }); if (E.undo.length > 300) E.undo.shift();
  E.redo = []; markDirty(p); updateUndoBtns();
}
function applyHist(from, to, key) {
  clearSelection(); const u = from.pop(); if (!u) return;
  const p = E.byId.get(u.id); if (!p) return applyHist(from, to, key);
  p.strokes = u[key].strokes.slice(); p.texts = u[key].texts.slice();
  to.push(u); refreshPage(p); markDirty(p); updateUndoBtns();
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
const shiftPts = (q, dx, dy) => q.map((v, i) => i % 3 === 0 ? +(v + dx).toFixed(1) : i % 3 === 1 ? +(v + dy).toFixed(1) : v);

// ---------- Input: pointer (Pencil / finger / mouse) ----------
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
  toast('✏️ Apple Pencil detected — now only the Pencil draws, fingers scroll & pinch-zoom. Tap the ✋ button to change.', 5000);
}
function onDown(e) {
  if (!E.nb || pinch) return;
  if (e.target.closest('.text-item, .sel-menu')) return;
  if (e.pointerType === 'pen') notePencil();
  const pageEl = e.target.closest('.page');
  if (!pageEl) { if (E.tool === 'lasso') clearSelection(); return; }
  if (active) return;
  if (S.pencilOnly && e.pointerType === 'touch') return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  const page = E.byId.get(pageEl.dataset.id);
  const a = { id: e.pointerId, type: e.pointerType, page, pageEl, rect: pageEl.getBoundingClientRect() };
  const pt = toPt(a, e);
  if (E.tool === 'text') { a.mode = 'text'; a.pt = pt; active = a; return; }
  try { scroller.setPointerCapture(e.pointerId); } catch { }
  active = a;
  if (E.tool === 'pen' || E.tool === 'hl') {
    clearSelection();
    a.mode = 'ink';
    a.stroke = { t: E.tool, c: E.color[E.tool], w: SIZES[E.tool][E.size[E.tool]], pr: E.tool === 'pen' && S.pressure && e.pointerType === 'pen', p: [] };
    addPoint(a, e);
  } else if (E.tool === 'eraser') {
    a.mode = 'erase'; a.before = snap(page); a.last = pt; eraseAt(a, pt.x, pt.y);
  } else if (E.tool === 'lasso') {
    const b = E.sel?.box;
    if (E.sel && E.sel.page === page && pt.x >= b[0] && pt.x <= b[2] && pt.y >= b[1] && pt.y <= b[3]) {
      a.mode = 'move'; a.start = pt; a.dx = a.dy = 0; E.moving = true; hideSelMenu(); paint(page);
    } else { clearSelection(); a.mode = 'lasso'; a.poly = [pt.x, pt.y]; }
  }
  scheduleLive();
}
function onMove(e) {
  const a = active; if (!a || e.pointerId !== a.id) return;
  const ce = e.getCoalescedEvents?.(); const list = ce && ce.length ? ce : [e];
  if (a.mode === 'ink') list.forEach(ev => addPoint(a, ev));
  else if (a.mode === 'erase') {
    const r = SIZES.eraser[E.size.eraser] / 2;
    for (const ev of list) {
      const pt = toPt(a, ev), d = Math.hypot(pt.x - a.last.x, pt.y - a.last.y), steps = Math.max(1, Math.ceil(d / (r * 0.7)));
      for (let i = 1; i <= steps; i++) eraseAt(a, a.last.x + (pt.x - a.last.x) * i / steps, a.last.y + (pt.y - a.last.y) * i / steps);
      a.last = pt;
    }
  } else if (a.mode === 'lasso') list.forEach(ev => { const pt = toPt(a, ev); a.poly.push(pt.x, pt.y); });
  else if (a.mode === 'move') { const pt = toPt(a, e); a.dx = pt.x - a.start.x; a.dy = pt.y - a.start.y; }
  else return;
  scheduleLive();
}
function onUp(e) {
  const a = active; if (!a || e.pointerId !== a.id) return;
  active = null; try { scroller.releasePointerCapture(e.pointerId); } catch { }
  const p = a.page;
  if (a.mode === 'text') { if (e.type === 'pointerup') createText(p, a.pageEl, a.pt); }
  else if (a.mode === 'ink' && a.stroke.p.length) {
    const before = snap(p); p.strokes.push(a.stroke); pushUndo(p, before);
    const c = a.pageEl.querySelector('canvas.ink');
    if (c.width) drawStroke(c.getContext('2d'), a.stroke, a.pageEl._scale, isDark(p.paperColor));
  }
  else if (a.mode === 'erase' && a.changed) pushUndo(p, a.before);
  else if (a.mode === 'lasso') finishLasso(a);
  else if (a.mode === 'move') {
    E.moving = false;
    if (Math.abs(a.dx) + Math.abs(a.dy) > 0.5) moveSelection(a.dx, a.dy); else { paint(p); showSelMenu(); }
  }
  scheduleLive();
}
function cancelActive() {
  if (!active) return;
  if (active.mode === 'move') { E.moving = false; paint(active.page); showSelMenu(); }
  if (active.mode === 'erase' && active.changed) pushUndo(active.page, active.before);
  active = null; scheduleLive();
}
function eraseAt(a, x, y) {
  const p = a.page, r = SIZES.eraser[E.size.eraser] / 2;
  const keep = p.strokes.filter(st => !hitStroke(st, x, y, r));
  if (keep.length !== p.strokes.length) { p.strokes = keep; a.changed = true; paint(p); }
}

// ---------- Live overlay (stroke in progress, lasso, selection) ----------
function scheduleLive() { if (!liveQueued) { liveQueued = true; requestAnimationFrame(drawLive); } }
function drawLive() {
  liveQueued = false;
  const a = active && active.mode !== 'text' ? active : null;
  const host = a?.pageEl || (E.sel && E.els.get(E.sel.page.id));
  if (!host) { live.remove(); return; }
  const c = host.querySelector('canvas.ink');
  if (live.parentNode !== host) host.appendChild(live);
  if (live.width !== c.width || live.height !== c.height) { live.width = c.width; live.height = c.height; }
  const ctx = live.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, live.width, live.height);
  const s = host._scale || 1, page = E.byId.get(host.dataset.id), dark = isDark(page.paperColor);
  if (a?.mode === 'ink') drawStroke(ctx, a.stroke, s, dark);
  if (a?.mode === 'erase') {
    ctx.beginPath(); ctx.arc(a.last.x * s, a.last.y * s, SIZES.eraser[E.size.eraser] / 2 * s, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(128,128,128,.15)'; ctx.fill(); ctx.strokeStyle = 'rgba(100,100,100,.7)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  if (a?.mode === 'lasso' && a.poly.length > 2) {
    ctx.beginPath(); ctx.moveTo(a.poly[0] * s, a.poly[1] * s);
    for (let i = 2; i < a.poly.length; i += 2) ctx.lineTo(a.poly[i] * s, a.poly[i + 1] * s);
    ctx.fillStyle = S.accent + '14'; ctx.fill();
    ctx.setLineDash([6, 5]); ctx.strokeStyle = S.accent; ctx.lineWidth = 1.6; ctx.stroke();
  }
  if (E.sel && E.els.get(E.sel.page.id) === host) {
    const mv = a?.mode === 'move', dx = mv ? a.dx : 0, dy = mv ? a.dy : 0, b = E.sel.box;
    if (mv) { ctx.save(); ctx.translate(dx * s, dy * s); E.sel.set.forEach(st => drawStroke(ctx, st, s, dark)); ctx.restore(); }
    ctx.setLineDash([6, 5]); ctx.strokeStyle = S.accent; ctx.lineWidth = 1.6;
    ctx.strokeRect((b[0] + dx) * s, (b[1] + dy) * s, (b[2] - b[0]) * s, (b[3] - b[1]) * s);
  }
}

// ---------- Lasso selection ----------
function selBox(set) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  set.forEach(st => { const b = bbox(st), w = st.w / 2 + 8; x0 = Math.min(x0, b[0] - w); y0 = Math.min(y0, b[1] - w); x1 = Math.max(x1, b[2] + w); y1 = Math.max(y1, b[3] + w); });
  return [x0, y0, x1, y1];
}
function setSelection(p, set) { E.sel = { page: p, set, box: selBox(set) }; showSelMenu(); scheduleLive(); }
function clearSelection() { if (!E.sel) return; E.sel = null; hideSelMenu(); scheduleLive(); }
function finishLasso(a) {
  const poly = a.poly, p = a.page, set = new Set();
  if (poly.length >= 8) for (const st of p.strokes) {
    const n = st.p.length / 3; let inside = 0;
    for (let i = 0; i < n; i++) if (pip(st.p[i * 3], st.p[i * 3 + 1], poly)) inside++;
    if (inside / n > 0.5) set.add(st);
  }
  if (set.size) setSelection(p, set); else clearSelection();
}
function hideSelMenu() { selMenu?.remove(); selMenu = null; }
function showSelMenu() {
  hideSelMenu(); if (!E.sel) return;
  const p = E.sel.page, b = E.sel.box, host = E.els.get(p.id); if (!host) return;
  selMenu = document.createElement('div'); selMenu.className = 'sel-menu';
  selMenu.style.left = clamp((b[0] + b[2]) / 2, 120, p.w - 120) / p.w * 100 + '%';
  selMenu.style.top = Math.max(b[1], 70) / p.h * 100 + '%';
  selMenu.innerHTML = '<button data-a="dup">Duplicate</button><button data-a="del" class="danger">Delete</button>';
  selMenu.addEventListener('click', e => { const act = e.target.closest('button')?.dataset.a; if (act) selAction(act); });
  host.appendChild(selMenu);
}
function selAction(act) {
  const { page: p, set } = E.sel, before = snap(p);
  if (act === 'del') { p.strokes = p.strokes.filter(s => !set.has(s)); E.sel = null; hideSelMenu(); }
  if (act === 'dup') { const copies = [...set].map(st => ({ ...st, p: shiftPts(st.p, 24, 24) })); p.strokes.push(...copies); setSelection(p, new Set(copies)); }
  pushUndo(p, before); paint(p); scheduleLive();
}
function moveSelection(dx, dy) {
  const { page: p, set } = E.sel, before = snap(p), moved = new Set();
  p.strokes = p.strokes.map(st => { if (!set.has(st)) return st; const n = { ...st, p: shiftPts(st.p, dx, dy) }; moved.add(n); return n; });
  pushUndo(p, before); paint(p); setSelection(p, moved);
}
function recolorSel(c) {
  const { page: p, set } = E.sel, before = snap(p), ns = new Set();
  p.strokes = p.strokes.map(st => { if (!set.has(st)) return st; const n = { ...st, c }; ns.add(n); return n; });
  pushUndo(p, before); paint(p); setSelection(p, ns);
}

// ---------- Text boxes ----------
function renderTexts(p, el) { const layer = el.querySelector('.text-layer'); layer.innerHTML = ''; p.texts.forEach(t => layer.appendChild(makeTextEl(p, t))); }
function positionText(p, t, d) { d.style.left = t.x / p.w * 100 + '%'; d.style.top = t.y / p.h * 100 + '%'; d.style.color = t.c; d.style.setProperty('--fs', t.s); }
function removeText(p, t, d) { p.texts = p.texts.filter(x => x !== t); d.remove(); markDirty(p); }
function makeTextEl(p, t) {
  const d = document.createElement('div'); d.className = 'text-item';
  d.innerHTML = '<div class="grip" title="Drag to move">⠿</div><div class="text-body" spellcheck="true"></div><button class="text-del" title="Delete">×</button>';
  const body = d.querySelector('.text-body');
  body.contentEditable = 'plaintext-only'; if (body.contentEditable !== 'plaintext-only') body.contentEditable = 'true';
  body.textContent = t.text; positionText(p, t, d);
  body.addEventListener('input', () => { t.text = body.innerText.replace(/\n$/, ''); markDirty(p); });
  body.addEventListener('blur', () => { if (!t.text.trim()) removeText(p, t, d); });
  d.querySelector('.text-del').addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); const before = snap(p); removeText(p, t, d); pushUndo(p, before);
  });
  const g = d.querySelector('.grip');
  g.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); g.setPointerCapture(e.pointerId);
    const host = E.els.get(p.id), a = { rect: host.getBoundingClientRect(), page: p }, start = toPt(a, e), ox = t.x, oy = t.y;
    const mv = ev => { const q = toPt(a, ev); t.x = clamp(ox + q.x - start.x, 0, p.w - 20); t.y = clamp(oy + q.y - start.y, 0, p.h - 20); positionText(p, t, d); };
    const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up); markDirty(p); };
    g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
  });
  return d;
}
function createText(p, el, pt) {
  const s = SIZES.text[E.size.text];
  const t = { id: uid(), x: clamp(pt.x, 0, p.w - 40), y: clamp(pt.y - s * 0.7, 0, p.h - 30), s, c: E.color.pen, text: '' };
  p.texts.push(t);
  const d = makeTextEl(p, t); el.querySelector('.text-layer').appendChild(d);
  d.querySelector('.text-body').focus();
}

// ---------- Input: touch gestures (palm rejection, pinch zoom) ----------
function onTouch(e) {
  if (!E.nb) return;
  if ([...e.changedTouches].some(t => t.touchType === 'stylus')) {
    if (!e.target.closest('.text-item, .sel-menu') && e.cancelable) e.preventDefault(); // stop Pencil from scrolling
    return;
  }
  const f = [...e.touches].filter(t => t.touchType !== 'stylus');
  if (f.length >= 2) {
    if (e.cancelable) e.preventDefault();
    if (active && active.type === 'touch') cancelActive();
    pinchMove(f[0], f[1], e.cancelable);
  }
}
function onTouchEnd(e) {
  if (pinch && [...e.touches].filter(t => t.touchType !== 'stylus').length < 2) endPinch();
}
function pinchMove(a, b, manualPan) {
  const mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2, d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
  if (!pinch) {
    const r = pagesEl.getBoundingClientRect();
    pinch = { d0: d, lx: mx, ly: my, ox: mx - r.left, oy: my - r.top, ratio: 1 };
    pagesEl.style.transformOrigin = `${pinch.ox}px ${pinch.oy}px`; return;
  }
  if (manualPan) { scroller.scrollLeft -= mx - pinch.lx; scroller.scrollTop -= my - pinch.ly; }
  pinch.lx = mx; pinch.ly = my;
  pinch.ratio = clamp(E.zoom * d / pinch.d0, ZMIN, ZMAX) / E.zoom;
  pagesEl.style.transform = `scale(${pinch.ratio})`;
}
function endPinch() {
  const p = pinch; pinch = null; const r = p.ratio;
  pagesEl.style.transform = '';
  if (Math.abs(r - 1) < 0.01) return;
  const pr = pagesEl.getBoundingClientRect(), vx = p.lx - pr.left, vy = p.ly - pr.top;
  const X = p.ox + (vx - p.ox) / r, Y = p.oy + (vy - p.oy) / r;
  const sl = scroller.scrollLeft, st = scroller.scrollTop;
  E.zoom *= r; layout(); updateZoomLabel();
  scroller.scrollLeft = sl + X * r - vx; scroller.scrollTop = st + Y * r - vy;
}

// ---------- Page actions ----------
async function addPage() {
  const i = currentIndex(), cur = E.pages[i];
  const p = newPage(E.nb, cur && !cur.bgKey ? { template: cur.template, paperColor: cur.paperColor } : {});
  E.pages.splice(i + 1, 0, p); E.byId.set(p.id, p);
  await db.put('pages', p); await saveNb();
  buildPages(); scrollToPage(i + 1); updateInd(); toast(`Page ${i + 2} added`, 1500);
}
async function duplicatePage(i) {
  const src = E.pages[i];
  const p = { ...src, id: uid(), strokes: src.strokes.slice(), texts: src.texts.map(t => ({ ...t, id: uid() })), bgKey: null };
  if (src.bgKey) { const b = await db.get('blobs', src.bgKey); if (b) { p.bgKey = 'bg_' + p.id; await db.put('blobs', b, p.bgKey); } }
  E.pages.splice(i + 1, 0, p); E.byId.set(p.id, p);
  await db.put('pages', p); await saveNb(); buildPages(); scrollToPage(i + 1); updateInd();
}
async function deletePage(i) {
  if (E.pages.length < 2) return toast('A notebook needs at least one page.');
  if (!await confirmBox(`Delete page ${i + 1}? This can’t be undone.`)) return;
  const p = E.pages[i]; clearSelection();
  E.pages.splice(i, 1); E.byId.delete(p.id); dirty.delete(p);
  E.undo = E.undo.filter(u => u.id !== p.id); E.redo = E.redo.filter(u => u.id !== p.id); updateUndoBtns();
  await db.del('pages', p.id); if (p.bgKey) await db.del('blobs', p.bgKey);
  await saveNb(); buildPages(); scrollToPage(Math.min(i, E.pages.length - 1)); updateInd();
}
async function pickTemplate(i) {
  const t = await menu('Page template', TEMPLATES.map(([k, l]) => ({ label: l, value: k }))); if (!t) return;
  const scope = await menu('Apply to', [{ label: 'This page', value: 'one' }, { label: 'All pages in this notebook', value: 'all' }, { label: 'All pages + new pages', value: 'def' }]); if (!scope) return;
  const list = scope === 'one' ? [E.pages[i]] : E.pages;
  list.forEach(p => { p.template = t; markDirty(p); });
  if (scope === 'def') { E.nb.paper = t; await saveNb(); }
  layout();
}
async function pickPaperColor(i) {
  const c = await menu('Paper color', PAPER_COLORS.map(([k, l]) => ({ label: l, value: k }))); if (!c) return;
  const scope = await menu('Apply to', [{ label: 'This page', value: 'one' }, { label: 'All pages + new pages', value: 'all' }]); if (!scope) return;
  (scope === 'one' ? [E.pages[i]] : E.pages).forEach(p => { if (!p.bgKey) { p.paperColor = c; markDirty(p); } });
  if (scope === 'all') { E.nb.paperColor = c; await saveNb(); }
  layout();
}
async function insertPdf(i) {
  const f = await pickFile('application/pdf,.pdf'); if (!f) return;
  const pages = await pdfToPages(f, E.nb);
  E.pages.splice(i + 1, 0, ...pages); pages.forEach(p => E.byId.set(p.id, p));
  await saveNb(); buildPages(); scrollToPage(i + 1); updateInd(); toast(`Inserted ${pages.length} pages`);
}
async function exportPagePng(i) {
  const p = E.pages[i]; if (p.bgKey) await loadBg(p.bgKey);
  const c = document.createElement('canvas'), s = 2; c.width = p.w * s; c.height = p.h * s;
  renderPage(c.getContext('2d'), p, s, { texts: true, sync: true });
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  readyToShare(blob, `${safeName(E.nb.title)} - page ${i + 1}.png`);
}
async function moreMenu() {
  const i = currentIndex();
  const v = await menu(`Page ${i + 1}`, [
    { label: 'Page template…', value: 'tpl', hint: 'Blank, lined, grid, dotted, Cornell' },
    { label: 'Paper color…', value: 'paper' },
    { label: 'Duplicate page', value: 'dup' },
    { label: 'Insert PDF / slides after this page', value: 'pdf' },
    { label: 'Export notebook as PDF', value: 'export' },
    { label: 'Export this page as image', value: 'png' },
    { label: 'Rename notebook', value: 'rename' },
    { label: 'Delete this page', value: 'del', danger: true },
  ]);
  if (v === 'tpl') await pickTemplate(i);
  if (v === 'paper') await pickPaperColor(i);
  if (v === 'dup') await duplicatePage(i);
  if (v === 'pdf') await insertPdf(i);
  if (v === 'export') { await flush(); await exportPDF(E.nb, E.pages); }
  if (v === 'png') await exportPagePng(i);
  if (v === 'rename') { const t = await promptText('Rename notebook', E.nb.title); if (t) { E.nb.title = t; $('#nbTitle').textContent = t; await saveNb(); } }
  if (v === 'del') await deletePage(i);
}
async function pagesOverview() {
  const cur = currentIndex(); let changed = false;
  const m = openModal(`<h2>Pages · ${esc(E.nb.title)}</h2><div class="thumbs"></div><div class="modal-actions"><button class="btn" data-close>Done</button></div>`, 'wide');
  const wrap = $('.thumbs', m.el); let token = 0;
  const render = async () => {
    const my = ++token; wrap.innerHTML = '';
    const cvs = E.pages.map((p, i) => {
      const d = document.createElement('div'); d.className = 'thumb' + (i === cur ? ' cur' : '');
      d.innerHTML = `<canvas></canvas><div class="row"><button data-mv="-1" title="Move earlier">‹</button><span>${i + 1}</span><button data-mv="1" title="Move later">›</button></div>`;
      const c = d.querySelector('canvas'); c.width = 260; c.height = Math.round(260 * p.h / p.w);
      c.onclick = () => { m.close(); scrollToPage(i); };
      d.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => {
        const j = i + +b.dataset.mv; if (j < 0 || j >= E.pages.length) return;
        [E.pages[i], E.pages[j]] = [E.pages[j], E.pages[i]]; changed = true; render();
      });
      wrap.appendChild(d); return [p, c];
    });
    for (const [p, c] of cvs) {
      if (my !== token || !m.el.isConnected) return;
      if (p.bgKey) await loadBg(p.bgKey);
      renderPage(c.getContext('2d'), p, c.width / p.w, { texts: true, sync: true });
    }
  };
  render();
  m.onClose = async () => { if (changed) { await saveNb(); buildPages(); updateInd(); } };
}

// ---------- PDF import / export ----------
async function loadPdfJs() {
  await loadScript(LIBS.pdf);
  const lib = window.pdfjsLib;
  if (!lib.GlobalWorkerOptions.workerSrc) {
    const src = await (await fetch(LIBS.pdfWorker)).text();
    lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  }
  return lib;
}
async function pdfToPages(file, nb) {
  toast('Opening PDF…', 60000);
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    toast(`Importing page ${i} of ${pdf.numPages}…`, 60000);
    const pg = await pdf.getPage(i), vp0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: 1400 / vp0.width });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88)); c.width = c.height = 0;
    const p = newPage(nb, { template: 'blank', paperColor: '#ffffff' });
    p.h = Math.round(PAGE_W * vp0.height / vp0.width); p.bgKey = 'bg_' + p.id;
    await db.put('blobs', blob, p.bgKey); await db.put('pages', p); out.push(p);
    pg.cleanup();
  }
  pdf.destroy(); hideToast(); return out;
}
async function exportPDF(nb, pages) {
  toast('Preparing PDF…', 60000);
  await loadScript(LIBS.jspdf);
  const { jsPDF } = window.jspdf; let doc;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]; toast(`Exporting page ${i + 1} of ${pages.length}…`, 60000);
    if (p.bgKey) await loadBg(p.bgKey);
    const s = 1.6, c = document.createElement('canvas'); c.width = Math.round(p.w * s); c.height = Math.round(p.h * s);
    renderPage(c.getContext('2d'), p, s, { texts: true, sync: true });
    const W = p.w * 0.6, H = p.h * 0.6, orient = W > H ? 'l' : 'p';
    if (!doc) doc = new jsPDF({ orientation: orient, unit: 'pt', format: [W, H] }); else doc.addPage([W, H], orient);
    doc.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, W, H);
    c.width = c.height = 0;
    await new Promise(r => setTimeout(r));
  }
  hideToast(); readyToShare(doc.output('blob'), safeName(nb.title) + '.pdf');
}

// ---------- Backup ----------
const blobToDataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
async function exportBackup() {
  toast('Creating backup…', 60000);
  await flush();
  const blobs = {};
  for (const k of await db.keys('blobs')) blobs[k] = await blobToDataURL(await db.get('blobs', k));
  const data = { app: 'inkbook', version: 1, date: Date.now(), notebooks: await db.all('notebooks'), pages: await db.all('pages'), blobs };
  hideToast();
  readyToShare(new Blob([JSON.stringify(data)], { type: 'application/json' }), `inkbook-backup-${new Date().toISOString().slice(0, 10)}.json`);
}
async function importBackup() {
  const f = await pickFile('.json,application/json'); if (!f) return;
  toast('Restoring…', 60000);
  const data = JSON.parse(await f.text());
  if (data.app !== 'inkbook') throw new Error('That file is not an Inkbook backup.');
  for (const [k, u] of Object.entries(data.blobs || {})) await db.put('blobs', await (await fetch(u)).blob(), k);
  for (const p of data.pages || []) await db.put('pages', p);
  for (const n of data.notebooks || []) await db.put('notebooks', n);
  hideToast(); toast(`Restored ${data.notebooks.length} notebooks`); showLibrary();
}

// ---------- Settings UI ----------
async function openSettings() {
  const m = openModal(`<h2>Settings</h2>
    <div class="field"><label class="lbl">App name</label><input type="text" id="sName" value="${esc(S.appName)}"></div>
    <div class="field"><label class="lbl">Theme</label><div class="seg" id="sTheme">${segHtml([['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], S.theme)}</div></div>
    <div class="field"><label class="lbl">Accent color</label><div class="seg" id="sAccent">${swatchHtml(ACCENTS, S.accent)}<label class="cswatch custom" title="Custom color"><input type="color" id="sAccentCustom" value="${S.accent}"></label></div></div>
    <div class="field"><label class="lbl">Default paper for new notebooks</label><div class="seg" id="sPaper">${segHtml(TEMPLATES, S.paper)}</div>
      <div class="seg" id="sPaperColor" style="margin-top:8px">${segHtml(PAPER_COLORS, S.paperColor)}</div></div>
    <div class="field"><label class="lbl">Pen colors</label><div class="palette-row" data-pal="pen">${S.pen.map((c, i) => `<input type="color" data-i="${i}" value="${c}">`).join('')}</div></div>
    <div class="field"><label class="lbl">Highlighter colors</label><div class="palette-row" data-pal="hl">${S.hl.map((c, i) => `<input type="color" data-i="${i}" value="${c}">`).join('')}</div></div>
    <div class="field">
      <label class="toggle"><input type="checkbox" id="sPencil" ${S.pencilOnly ? 'checked' : ''}><span>Only Apple Pencil draws (fingers scroll &amp; zoom)</span></label>
      <label class="toggle"><input type="checkbox" id="sPressure" ${S.pressure ? 'checked' : ''}><span>Pressure-sensitive pen</span></label>
    </div>
    <div class="field"><label class="lbl">Your data <span id="sStorage"></span></label>
      <div class="seg"><button class="chip" id="sBackup">Back up everything</button><button class="chip" id="sRestore">Restore a backup</button></div>
      <p class="hint">Your notes are stored only on this device. Back up now and then and keep the file in iCloud Drive (Files app).</p></div>
    <div class="modal-actions"><button class="btn primary" data-close>Done</button></div>`);
  wireSeg($('#sTheme', m.el), v => { S.theme = v; saveSettings(); });
  wireSeg($('#sAccent', m.el), v => { S.accent = v; saveSettings(); });
  $('#sAccentCustom', m.el).oninput = e => { S.accent = e.target.value; saveSettings(); };
  wireSeg($('#sPaper', m.el), v => { S.paper = v; saveSettings(); });
  wireSeg($('#sPaperColor', m.el), v => { S.paperColor = v; saveSettings(); });
  $$('.palette-row', m.el).forEach(row => row.addEventListener('input', e => {
    const k = row.dataset.pal; S[k][+e.target.dataset.i] = e.target.value; saveSettings();
  }));
  $('#sPencil', m.el).onchange = e => { S.pencilOnly = e.target.checked; S.pencilSeen = true; saveSettings(); };
  $('#sPressure', m.el).onchange = e => { S.pressure = e.target.checked; saveSettings(); };
  $('#sBackup', m.el).onclick = guard(async () => { m.close(); await exportBackup(); });
  $('#sRestore', m.el).onclick = guard(async () => { m.close(); await importBackup(); });
  navigator.storage?.estimate?.().then(e => { const el = $('#sStorage', m.el); if (el) el.textContent = `· ${fmtSize(e.usage || 0)} used`; });
  m.onClose = () => { S.appName = $('#sName', m.el).value.trim() || 'Inkbook'; saveSettings(); if (E.nb) updateToolbar(); else showLibrary(); };
}

// ---------- Boot ----------
function boot() {
  $$('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

  $('#grid').addEventListener('click', guard(onGridClick));
  $('#newNb').onclick = guard(newNotebook);
  $('#importPdf').onclick = guard(importPdfNotebook);
  $('#settingsBtn').onclick = openSettings;
  $('#search').oninput = e => { LIB.q = e.target.value; showLibrary(); };

  $('#backBtn').onclick = guard(leaveNotebook);
  $('#undoBtn').onclick = undo; $('#redoBtn').onclick = redo;
  $$('.tool').forEach(b => b.onclick = () => setTool(b.dataset.tool));
  $('#pencilBtn').onclick = () => {
    S.pencilOnly = !S.pencilOnly; S.pencilSeen = true; saveSettings(); updatePencilBtn();
    toast(S.pencilOnly ? '✏️ Pencil-only: fingers scroll & zoom' : '☝️ Finger drawing on: use two fingers to scroll & zoom');
  };
  $('#addPageBtn').onclick = guard(addPage);
  $('#pagesBtn').onclick = pagesOverview;
  $('#moreBtn').onclick = guard(moreMenu);
  $('#zoomIn').onclick = () => zoomCenter(E.zoom * 1.25);
  $('#zoomOut').onclick = () => zoomCenter(E.zoom / 1.25);
  $('#zoomFit').onclick = () => zoomCenter(1);

  scroller.addEventListener('pointerdown', onDown);
  scroller.addEventListener('pointermove', onMove);
  scroller.addEventListener('pointerup', onUp);
  scroller.addEventListener('pointercancel', onUp);
  scroller.addEventListener('touchstart', onTouch, { passive: false });
  scroller.addEventListener('touchmove', onTouch, { passive: false });
  scroller.addEventListener('touchend', onTouchEnd);
  scroller.addEventListener('touchcancel', onTouchEnd);
  scroller.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); zoomAt(E.zoom * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY); } }, { passive: false });
  let indQ = false;
  scroller.addEventListener('scroll', () => { if (!indQ) { indQ = true; requestAnimationFrame(() => { indQ = false; updateInd(); }); } }, { passive: true });
  ['gesturestart', 'gesturechange'].forEach(t => document.addEventListener(t, e => e.preventDefault()));
  let rT, lastW = 0;
  new ResizeObserver(() => {
    if (scroller.clientWidth === lastW) return; lastW = scroller.clientWidth;
    clearTimeout(rT); rT = setTimeout(() => E.nb && layout(), 60);
  }).observe(scroller);

  document.addEventListener('keydown', e => {
    if (!E.nb || e.target.closest?.('[contenteditable], input, textarea')) return;
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    const map = { p: 'pen', h: 'hl', e: 'eraser', l: 'lasso', t: 'text' };
    if (!mod && map[k]) setTool(map[k]);
    if ((e.key === 'Delete' || e.key === 'Backspace') && E.sel) selAction('del');
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (E.nb) E.nb.lastPage = currentIndex(); flush(); saveNb(); } });
  addEventListener('pagehide', () => flush());

  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'))
    navigator.serviceWorker.register('sw.js').catch(() => { });
  showLibrary();
}
boot();
