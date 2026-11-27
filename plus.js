'use strict';
/* =====================================================================
   Inkbook v13 — pen presets, tool wheel gesture, stickers & page layouts,
   page links, audio recording synced to notes, split view, and the
   exam countdown / study planner.
   ===================================================================== */

Object.assign(ICONS, {
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0"/><path d="M12 18v3"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  sticker: '<path d="M15 3H6a3 3 0 00-3 3v12a3 3 0 003 3h7l8-8V6a3 3 0 00-3-3z"/><path d="M13 21v-5a3 3 0 013-3h5"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 9v12"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  pause: '<path d="M7 4v16M17 4v16"/>',
  wave: '<path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 11v2"/>',
});
const PLUS_DEFAULTS = {
  presets: [{ t: 'pen', c: '#1f2430', w: 1.6, ps: 'fount' }, { t: 'pen', c: '#2f5bea', w: 2.4, ps: 'fount' }, { t: 'pen', c: '#e5484d', w: 2.4, ps: 'ball' }, { t: 'hl', c: '#ffe14d', w: 20 }],
  favBar: true, favOpen: true, wheel: true, dblSwap: true, refW: 0.42,
};
for (const [k, v] of Object.entries(PLUS_DEFAULTS)) if (S[k] === undefined) S[k] = structuredClone(v);
const metaGet = async (k, d) => (await db.get('blobs', 'meta:' + k)) ?? d;
const metaPut = (k, v) => db.put('blobs', v, 'meta:' + k);
const longPress = (el, fn, ms = 520) => {
  let t = null;
  el.addEventListener('pointerdown', e => { clearTimeout(t); t = setTimeout(() => { t = null; el._lp = true; fn(e); }, ms); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => el.addEventListener(n, () => clearTimeout(t)));
  el.addEventListener('contextmenu', e => { e.preventDefault(); el._lp = true; fn(e); });
};
const viewCenter = p => { const vb = visibleBox(p); return { x: p.w / 2, y: (vb[1] + vb[3]) / 2 }; };

// =====================================================================
// Pen presets — a little favorites bar on the left edge
// =====================================================================
let prevTool = 'pen';
{
  const _setTool = setTool;
  setTool = function (t) { if (t !== E.tool && E.tool !== 'laser') prevTool = E.tool; _setTool(t); };
  const _ut = updateToolbar;
  updateToolbar = function () { _ut(); renderFav(); };
}
function presetOn(pr) { return E.tool === pr.t && E.color[pr.t] === pr.c && Math.abs(sz(pr.t) - pr.w) < 0.01 && (pr.t !== 'pen' || !pr.ps || pr.ps === S.penStyle); }
function presetDot(pr) {
  const d = pr.t === 'hl' ? 0 : Math.round(clamp(4 + pr.w * 2.2, 5, 22));
  return pr.t === 'hl' ? `<i class="fav-hl" style="--c:${pr.c};--h:${Math.round(clamp(pr.w * 0.35, 5, 14))}px"></i>` : `<i class="fav-dot" style="--c:${pr.c};--d:${d}px"></i>`;
}
function renderFav() {
  const bar = $('#favBar'); if (!bar) return;
  bar.hidden = !S.favBar || !E.nb;
  if (bar.hidden) return;
  bar.classList.toggle('closed', !S.favOpen);
  bar.innerHTML = S.favOpen
    ? S.presets.map((pr, i) => `<button class="fav${presetOn(pr) ? ' on' : ''}" data-fi="${i}" title="${pr.t === 'hl' ? 'Highlighter' : 'Pen'} preset · hold to remove">${presetDot(pr)}</button>`).join('') +
      `<button class="fav fav-add" data-fadd title="Save the current pen as a preset">+</button><button class="fav fav-tog" data-ftog title="Hide presets">‹</button>`
    : `<button class="fav fav-tog" data-ftog title="Show pen presets">›</button>`;
  $$('[data-fi]', bar).forEach(b => longPress(b, () => presetMenu(+b.dataset.fi)));
}
function applyPreset(pr) {
  setTool(pr.t); E.color[pr.t] = pr.c; E.pw = { t: pr.t, w: pr.w };
  if (pr.t === 'pen' && pr.ps) S.penStyle = pr.ps;
  saveSettings(); updateToolbar();
}
async function presetMenu(i) {
  const v = await menu('Pen preset', [{ label: 'Move up', value: 'up', icon: 'up' }, { label: 'Replace with the current pen', value: 'set', icon: 'pen' }, { label: 'Remove', value: 'del', icon: 'trash', danger: true }]);
  if (v === 'del') S.presets.splice(i, 1);
  if (v === 'up' && i > 0) S.presets.splice(i - 1, 0, S.presets.splice(i, 1)[0]);
  if (v === 'set') { const cur = curPreset(); if (cur) S.presets[i] = cur; }
  saveSettings(); renderFav();
}
function curPreset() {
  const t = E.tool === 'hl' ? 'hl' : E.tool === 'pen' ? 'pen' : null;
  if (!t) { toast('Pick the pen or highlighter first, set its color and size, then tap +'); return null; }
  return { t, c: E.color[t], w: sz(t), ...(t === 'pen' ? { ps: S.penStyle } : {}) };
}
function bootFav() {
  const bar = $('#favBar');
  bar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b._lp) { b._lp = false; return; }
    if (b.dataset.ftog !== undefined) { S.favOpen = !S.favOpen; saveSettings(); return renderFav(); }
    if (b.dataset.fadd !== undefined) {
      const cur = curPreset(); if (!cur) return;
      if (S.presets.length >= 10) return toast('You can keep up to 10 presets: hold one to remove it');
      S.presets.push(cur); saveSettings(); renderFav(); return toast('Preset saved. Hold a preset to move or remove it', 2200);
    }
    if (b.dataset.fi !== undefined) applyPreset(S.presets[+b.dataset.fi]);
  });
  bar.addEventListener('pointerdown', e => e.stopPropagation());
}

// =====================================================================
// Gestures: long-press with a finger = tool wheel; double-tap = previous tool
// =====================================================================
const WHEEL = [['pen', 'pen', 'Pen'], ['hl', 'hl', 'Highlighter'], ['eraser', 'eraser', 'Eraser'], ['shape', 'shape', 'Shapes'],
  ['lasso', 'lasso', 'Lasso'], ['text', 'text', 'Text'], ['undo', 'undo', 'Undo'], ['redo', 'redo', 'Redo']];
let wheelEl = null, lp = null, lastTap = null;
function openWheel(x, y) {
  closeWheel(); closePopover(); hidePasteMenu();
  const R = 86, cx = clamp(x, R + 34, innerWidth - R - 34), cy = clamp(y, R + 34, innerHeight - R - 34);
  const w = document.createElement('div'); w.className = 'tool-wheel'; w.style.left = cx + 'px'; w.style.top = cy + 'px';
  w.innerHTML = WHEEL.map(([k, ic, l], i) => {
    const a = -Math.PI / 2 + i * Math.PI * 2 / WHEEL.length;
    return `<button data-w="${k}" class="${E.tool === k ? 'on' : ''}" style="--x:${Math.round(Math.cos(a) * R)}px;--y:${Math.round(Math.sin(a) * R)}px" title="${l}">${icon(ic)}<small>${l}</small></button>`;
  }).join('') + `<button data-w="prev" class="wheel-mid" title="Back to the previous tool">${icon(prevTool === 'pen' ? 'pen' : prevTool)}<small>Last</small></button>` +
    S.presets.slice(0, 6).map((pr, i) => `<button data-wp="${i}" class="wheel-pre" style="--x:${Math.round((i - (Math.min(6, S.presets.length) - 1) / 2) * 40)}px;--y:${R + 58}px">${presetDot(pr)}</button>`).join('');
  document.body.appendChild(w); wheelEl = w;
  requestAnimationFrame(() => w.classList.add('in'));
  w.addEventListener('pointerdown', e => e.stopPropagation());
  w.addEventListener('click', e => { const b = e.target.closest('button'); if (b) pickWheel(b); });
  setTimeout(() => document.addEventListener('pointerdown', wheelOutside, true), 0);
}
function wheelOutside(e) { if (wheelEl && !wheelEl.contains(e.target)) closeWheel(); }
function closeWheel() { wheelEl?.remove(); wheelEl = null; document.removeEventListener('pointerdown', wheelOutside, true); }
function pickWheel(b) {
  const k = b.dataset.w;
  if (b.dataset.wp !== undefined) applyPreset(S.presets[+b.dataset.wp]);
  else if (k === 'undo') { undo(); return; } else if (k === 'redo') { redo(); return; }
  else if (k === 'prev') setTool(prevTool || 'pen');
  else if (k) setTool(k);
  closeWheel(); toast(TOOL_NAMES[E.tool] || 'Pen preset', 700);
}
function bootGestures() {
  scroller.addEventListener('pointerdown', e => {
    if (!E.nb || !S.wheel || e.pointerType !== 'touch' || !S.pencilOnly) return;
    if (e.target.closest('.text-item, .tbl, .float-menu, .grow, .page-tabs, .hit, .plink-go') || !e.target.closest('.page')) return;
    clearTimeout(lp?.t);
    if (lp && lp.id !== e.pointerId) { lp = null; return; }            // a second finger: that's a pinch
    lp = { id: e.pointerId, x: e.clientX, y: e.clientY, t: setTimeout(() => {
      const l = lp; lp = null;
      if (!l || pinch || palmBlock || penRecent() || (tapG && tapG.max > 1) || E.moving) return;
      fingerTap = null; openWheel(l.x, l.y);
      if (tapG) tapG.moved = true;
    }, 480) };
  });
  scroller.addEventListener('pointermove', e => { if (lp && e.pointerId === lp.id && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) { clearTimeout(lp.t); lp = null; } });
  const end = e => {
    if (lp && e.pointerId === lp.id) { clearTimeout(lp.t); lp = null; }
    // finger double-tap on the page swaps back to the previous tool
    if (e.type !== 'pointerup' || e.pointerType !== 'touch' || !S.pencilOnly || !S.dblSwap || wheelEl) return;
    if (!e.target.closest?.('.page') || e.target.closest('.text-item, .tbl, .hit, .plink-go, .page-tabs')) return;
    const now = Date.now();
    if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 40 && !E.sel) {
      lastTap = null; const t = prevTool && prevTool !== E.tool ? prevTool : (E.tool === 'pen' ? 'eraser' : 'pen'); setTool(t); toast('⇄ ' + TOOL_NAMES[t], 800);
    } else lastTap = { t: now, x: e.clientX, y: e.clientY };
  };
  scroller.addEventListener('pointerup', end); scroller.addEventListener('pointercancel', end);
  scroller.addEventListener('contextmenu', e => { if (!E.nb || !e.target.closest('.page') || e.target.closest('[contenteditable]')) return; e.preventDefault(); openWheel(e.clientX, e.clientY); });
}

// =====================================================================
// Stickers
// =====================================================================
const BADGES = [['Important', '#e5484d'], ['Exam!', '#f76b15'], ['Remember', '#8e4ec6'], ['Formula', '#2f5bea'], ['Definition', '#6e56cf'], ['Example', '#12a594'],
  ['Key idea', '#d6409f'], ['Homework', '#18a058'], ['Review', '#b8860b'], ['Question?', '#0090ff'], ['Done ✓', '#30a46c'], ['To do', '#8d8d86']];
const STK_EMOJIS = '⭐ ✅ ❌ ⚠️ ❗ ❓ 💡 📌 🔥 📝 📚 🎯 ⏰ 🧪 🧮 📐 🧠 💯 👍 ❤️ 🏆 ✏️ 📅 🔑 ➡️ ⬅️ ⬆️ ⬇️ 🔁 ✔️ ✖️ ➕'.split(' ');
const INK_STICKERS = [['Curved arrow', 'carrow'], ['Brace', 'brace'], ['Checkbox', 'check'], ['Star', 'star'], ['Speech bubble', 'bubble'], ['Wavy underline', 'wave'], ['Box', 'box'], ['Double arrow', 'darrow']];
function inkSticker(kind, c) {
  const pts = [], P = (x, y) => pts.push(+x.toFixed(1), +y.toFixed(1), 0.5), S0 = [];
  const st = p => ({ t: 'pen', c, w: 2.6, poly: true, p });
  if (kind === 'carrow') { for (let i = 0; i <= 30; i++) { const a = Math.PI * (1 - i / 30); P(80 + Math.cos(a) * 70, 80 - Math.sin(a) * 50); } S0.push(st(pts.slice())); S0.push(st([135, 72, .5, 150, 80, .5, 158, 64, .5])); }
  else if (kind === 'brace') { const q = []; const B = (x, y) => q.push(x, y, .5); B(30, 0); B(18, 6); B(18, 50); B(4, 60); B(18, 70); B(18, 114); B(30, 120); S0.push(st(q)); }
  else if (kind === 'check') { S0.push(st([0, 0, .5, 40, 0, .5, 40, 40, .5, 0, 40, .5, 0, 0, .5])); S0.push(st([8, 20, .5, 18, 32, .5, 38, 4, .5])); }
  else if (kind === 'star') { for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 20 : 48; P(50 + Math.cos(a) * r, 50 + Math.sin(a) * r); } S0.push(st(pts)); }
  else if (kind === 'bubble') { for (let i = 0; i <= 40; i++) { const a = Math.PI * 2 * i / 40; P(110 + Math.cos(a) * 105, 55 + Math.sin(a) * 50); } S0.push(st(pts)); S0.push(st([60, 98, .5, 40, 135, .5, 90, 103, .5])); }
  else if (kind === 'wave') { for (let i = 0; i <= 60; i++) P(i * 4, 8 + Math.sin(i / 3) * 6); S0.push(st(pts)); }
  else if (kind === 'box') S0.push(st([0, 0, .5, 220, 0, .5, 220, 110, .5, 0, 110, .5, 0, 0, .5]));
  else if (kind === 'darrow') { S0.push(st([20, 30, .5, 200, 30, .5])); S0.push(st([36, 18, .5, 20, 30, .5, 36, 42, .5])); S0.push(st([184, 18, .5, 200, 30, .5, 184, 42, .5])); }
  return S0;
}
function badgeCanvas(text, color, k = 3) {
  const c = document.createElement('canvas'), x = c.getContext('2d'), f = `700 ${22 * k}px -apple-system, system-ui, sans-serif`;
  x.font = f; const tw = x.measureText(text).width, w = Math.ceil(tw + 36 * k), h = 44 * k;
  c.width = w; c.height = h; x.font = f;
  x.fillStyle = color; x.beginPath(); x.roundRect(0, 0, w, h, h / 2); x.fill();
  x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.textAlign = 'center'; x.fillText(text, w / 2, h / 2 + k);
  return c;
}
function emojiCanvas(e, px = 200) {
  const c = document.createElement('canvas'); c.width = c.height = px; const x = c.getContext('2d');
  x.font = `${px * 0.8}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(e, px / 2, px * 0.54); return c;
}
async function addImageSticker(canvas, w) {
  const p = E.pages[currentIndex()], blob = await new Promise(r => canvas.toBlob(r, 'image/png')), key = 'img_' + uid();
  await db.put('blobs', blob, key);
  const h = w * canvas.height / canvas.width, c = viewCenter(p), before = snap(p);
  const im = { id: uid(), key, x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), w, h: Math.round(h) };
  p.images.push(im); pushUndo(p, before); refreshPage(p); setTool('lasso'); setSelection(p, new Set(), new Set([im]));
}
async function pasteGroup(g, p, pt) {
  const keep = E.clip; E.clip = { strokes: g.strokes || [], images: g.images || [], texts: g.texts || [], tables: g.tables || [], box: g.box || [0, 0, g.w || 0, g.h || 0] };
  try { await pasteClip(p, pt); } finally { E.clip = keep; }
}
async function stickersFlow() {
  const mine = await metaGet('stickers', []);
  let tab = mine.length ? 'mine' : 'badges';
  const m = openModal(`<h2>Stickers</h2><div class="seg stk-tabs">${segHtml([['badges', 'Labels'], ['emoji', 'Symbols'], ['ink', 'Ink shapes'], ['mine', 'My stickers']], tab)}</div><div class="stk-body"></div>
    <p class="hint">Make your own: select anything with the lasso, tap ⋯ → <b>Save as sticker</b>.</p>`, 'wide');
  const body = $('.stk-body', m.el);
  const draw = () => {
    if (tab === 'badges') body.innerHTML = `<div class="stk-grid">${BADGES.map(([t, c], i) => `<button class="stk badge-stk" data-b="${i}" style="--c:${c}">${esc(t)}</button>`).join('')}</div>`;
    if (tab === 'emoji') body.innerHTML = `<div class="stk-grid emo">${STK_EMOJIS.map((e, i) => `<button class="stk" data-e="${i}">${e}</button>`).join('')}</div>`;
    if (tab === 'ink') body.innerHTML = `<div class="stk-grid">${INK_STICKERS.map(([l, k]) => `<button class="stk ink-stk" data-k="${k}"><canvas width="120" height="80"></canvas><small>${l}</small></button>`).join('')}</div><p class="hint">Ink shapes use your current pen color and stay editable like handwriting.</p>`;
    if (tab === 'mine') body.innerHTML = mine.length ? `<div class="stk-grid">${mine.map((s, i) => `<div class="stk mine-stk" data-m="${i}">${s.thumb ? `<img src="${s.thumb}" alt="">` : ''}<small>${esc(s.name)}</small><button class="stk-x" data-x="${i}" title="Delete">×</button></div>`).join('')}</div>`
      : `<div class="empty">No stickers yet. Select something you drew with the lasso, then tap ⋯ → Save as sticker.</div>`;
    $$('.ink-stk canvas', body).forEach(cv => {
      const strokes = inkSticker(cv.parentElement.dataset.k, E.color.pen || '#1f2430'), b = groupBox(strokes);
      const k = Math.min(110 / (b[2] - b[0] + 10), 70 / (b[3] - b[1] + 10)), x = cv.getContext('2d');
      x.setTransform(k, 0, 0, k, (120 - (b[2] - b[0]) * k) / 2 - b[0] * k, (80 - (b[3] - b[1]) * k) / 2 - b[1] * k);
      strokes.forEach(s => drawStroke(x, s, 1, false));
    });
  };
  wireSeg($('.stk-tabs', m.el), v => { tab = v; draw(); });
  body.addEventListener('click', guard(async e => {
    const x = e.target.closest('[data-x]');
    if (x) { if (!(await confirmBox('Delete this sticker?'))) return; mine.splice(+x.dataset.x, 1); await metaPut('stickers', mine); return draw(); }
    const b = e.target.closest('[data-b],[data-e],[data-k],[data-m]'); if (!b) return;
    const p = E.pages[currentIndex()], d = b.dataset; m.close();
    if (d.b) { const [t, c] = BADGES[+d.b]; const cv = badgeCanvas(t, c); return addImageSticker(cv, Math.round(cv.width / 3 * 1.1)); }
    if (d.e) return addImageSticker(emojiCanvas(STK_EMOJIS[+d.e]), 90);
    if (d.k) { const strokes = inkSticker(d.k, E.color.pen), bx = groupBox(strokes), c = viewCenter(p); return pasteGroup({ strokes, box: bx }, p, { x: c.x - (bx[2] - bx[0]) / 2, y: c.y - (bx[3] - bx[1]) / 2 }); }
    if (d.m) { const s = mine[+d.m], c = viewCenter(p); return pasteGroup(s, p, { x: c.x - s.w / 2, y: c.y - s.h / 2 }); }
  }));
  draw();
}
function groupBox(strokes) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const s of strokes) for (let i = 0; i < s.p.length; i += 3) { x0 = Math.min(x0, s.p[i]); x1 = Math.max(x1, s.p[i]); y0 = Math.min(y0, s.p[i + 1]); y1 = Math.max(y1, s.p[i + 1]); }
  return [x0, y0, x1, y1];
}
async function saveSticker() {
  const s = E.sel; if (!s) return;
  const name = await promptText('Save as sticker', '', 'Name, e.g. Free-body diagram'); if (name === null) return;
  const p = s.page, b = s.box, [x0, y0] = b;
  const tw = 220, sc = tw / Math.max(20, b[2] - b[0]), cv = document.createElement('canvas');
  cv.width = tw; cv.height = Math.max(20, Math.round((b[3] - b[1]) * sc)); await preloadPage(p);
  const cx = cv.getContext('2d');
  const sub = { ...p, template: 'blank', bgKey: null, strokes: [...s.strokes], images: [...s.images], texts: [...s.texts], tables: [...s.tables] };
  renderPage(cx, sub, sc, { texts: true, sync: true, ox: x0, oy: y0 });
  // transparent thumbnail background: redraw without paper
  const images = [];
  for (const im of s.images) { const key = await copyBlob(im.key); if (key) images.push({ ...im, key }); }
  const mine = await metaGet('stickers', []);
  mine.unshift({ id: uid(), name: name || 'Sticker', w: b[2] - b[0], h: b[3] - b[1], box: [...b], thumb: cv.toDataURL('image/png'),
    strokes: [...s.strokes].map(st => ({ ...st })), texts: [...s.texts].map(t => ({ ...t })), images, tables: [...s.tables].map(t => structuredClone(t)) });
  await metaPut('stickers', mine.slice(0, 120)); toast('⭐ Saved to My stickers (⋯ → Stickers)');
}

// =====================================================================
// Page layouts (planner, Cornell, lab report…) + your own saved layouts
// =====================================================================
const L_ = (x0, y0, x1, y1, c = '#8d93a6', w = 1.6) => ({ t: 'pen', c, w, poly: true, p: [x0, y0, .5, x1, y1, .5] });
const R_ = (x, y, w, h, c = '#8d93a6', lw = 1.6) => ({ t: 'pen', c, w: lw, poly: true, p: [x, y, .5, x + w, y, .5, x + w, y + h, .5, x, y + h, .5, x, y, .5] });
const T_ = (x, y, text, o = {}) => ({ id: uid(), x, y, s: o.s || 22, c: o.c || '#1f2430', f: o.f || 'sans', b: o.b ?? true, text, ...(o.w ? { w: o.w } : {}) });
const LAYOUTS = [
  ['cornell', 'Cornell notes', 'lined', (W, H, a) => ({
    strokes: [L_(30, 140, W - 30, 140, a, 2), L_(290, 140, 290, H - 280, a, 2), L_(30, H - 280, W - 30, H - 280, a, 2)],
    texts: [T_(40, 40, 'Topic:', { s: 26 }), T_(W - 300, 40, 'Date:', { s: 22 }), T_(40, 152, 'Questions / cues', { s: 18, c: a }), T_(305, 152, 'Notes', { s: 18, c: a }), T_(40, H - 268, 'Summary', { s: 18, c: a })] })],
  ['week', 'Weekly planner', 'blank', (W, H, a) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Notes'], top = 120, gw = (W - 90) / 2, gh = (H - top - 50) / 4, strokes = [], texts = [T_(40, 40, 'Week of', { s: 30 })];
    days.forEach((d, i) => { const x = 30 + (i % 2) * (gw + 30), y = top + Math.floor(i / 2) * gh; strokes.push(R_(x, y, gw, gh - 18, a)); texts.push(T_(x + 14, y + 10, d, { s: 20, c: a })); });
    return { strokes, texts };
  }],
  ['lab', 'Lab report', 'lined', (W, H, a) => {
    const heads = ['Aim', 'Hypothesis', 'Materials', 'Method', 'Results', 'Analysis', 'Conclusion'], ys = [130, 250, 370, 490, 700, 1010, 1180].map(y => y * H / 1414);
    const t = makeTable(5, 3, 50, Math.round(ys[4] + 50), W - 100, true); t.cells[0] = ['Trial', 'Measurement', 'Result'];
    return { strokes: heads.map((_, i) => L_(40, ys[i] + 36, W - 40, ys[i] + 36, a, 1.4)), texts: [T_(40, 40, 'Lab report:', { s: 30 }), ...heads.map((h, i) => T_(40, ys[i], h, { s: 22, c: a }))], tables: [t] };
  }],
  ['math', 'Worked solution', 'smallgrid', (W, H, a) => ({
    strokes: [R_(30, 110, (W - 90) / 2, 200, a), R_(60 + (W - 90) / 2, 110, (W - 90) / 2, 200, a), R_(30, 330, W - 60, 140, a), R_(30, 490, W - 60, H - 720, a), R_(30, H - 210, W - 60, 170, a, 2.6), R_(36, H - 204, W - 72, 158, a, 1.2)],
    texts: [T_(40, 40, 'Problem', { s: 28 }), T_(44, 120, 'Given', { s: 18, c: a }), T_(74 + (W - 90) / 2, 120, 'Find', { s: 18, c: a }), T_(44, 340, 'Formula', { s: 18, c: a }), T_(44, 500, 'Solution', { s: 18, c: a }), T_(48, H - 196, 'Answer', { s: 18, c: a })] })],
  ['todo', 'To-do list', 'blank', (W, H, a) => {
    const strokes = [], n = Math.floor((H - 160) / 62);
    for (let i = 0; i < n; i++) { const y = 140 + i * 62; strokes.push(R_(44, y + 14, 30, 30, a, 1.8), L_(92, y + 50, W - 40, y + 50, '#c9ccd6', 1.2)); }
    return { strokes, texts: [T_(40, 40, 'To do', { s: 34 })] };
  }],
  ['lecture', 'Lecture notes', 'lined', (W, H, a) => ({
    strokes: [R_(30, 30, W - 60, 150, a, 1.8), L_(30, 105, W - 30, 105, a, 1.2), L_(W / 2, 30, W / 2, 105, a, 1.2), R_(30, H - 230, W - 60, 190, a, 1.8)],
    texts: [T_(44, 44, 'Course:', { s: 20, c: a }), T_(W / 2 + 14, 44, 'Lecture #   Date:', { s: 20, c: a }), T_(44, 116, 'Topic:', { s: 20, c: a }), T_(44, H - 220, 'Key points to remember', { s: 20, c: a })] })],
  ['revise', 'Exam revision', 'blank', (W, H, a) => {
    const t = makeTable(9, 3, 40, 560, W - 80, true); t.cells[0] = ['Topic', 'Confidence (1–5)', 'To do'];
    return { strokes: [R_(30, 110, (W - 90) / 2, 400, a), R_(60 + (W - 90) / 2, 110, (W - 90) / 2, 400, a)],
      texts: [T_(40, 40, 'Revision:', { s: 30 }), T_(44, 120, '✓ What I know', { s: 20, c: '#18a058' }), T_(74 + (W - 90) / 2, 120, '? What to review', { s: 20, c: '#e5484d' })], tables: [t] };
  }],
];
function buildLayout(entry, base) {
  const [, , tpl, fn] = entry, pg = newPage(E.nb, { w: base.w, h: base.h, template: tpl, paperColor: base.paperColor });
  const dark = isDark(pg.paperColor), r = fn(pg.w, pg.h, dark ? '#9aa4ff' : S.accent);
  if (dark) (r.texts || []).forEach(t => { if (t.c === '#1f2430') t.c = '#ececf1'; });
  Object.assign(pg, { strokes: r.strokes || [], texts: r.texts || [], images: [], tables: r.tables || [] });
  (pg.tables).forEach(t => { t.c = dark ? '#ececf1' : '#1f2430'; });
  return pg;
}
async function layoutsFlow() {
  const base = E.pages[currentIndex()], mine = await metaGet('layouts', []);
  const cards = [...LAYOUTS.map((l, i) => ({ k: 'b' + i, name: l[1] })), ...mine.map((l, i) => ({ k: 'm' + i, name: l.name, mine: true }))];
  const m = openModal(`<h2>Page layouts</h2>
    <div class="lay-grid">${cards.map(c => `<button class="lay" data-l="${c.k}"><canvas width="150" height="${Math.round(150 * base.h / base.w)}"></canvas><span>${esc(c.name)}</span>${c.mine ? `<i class="stk-x" data-lx="${c.k}">×</i>` : ''}</button>`).join('')}</div>
    <div class="field"><label class="lbl">Where</label><div class="seg" data-where>${segHtml([['after', 'New page after this one'], ['end', 'New page at the end']], 'after')}</div></div>
    <div class="modal-actions"><button class="btn" data-mine>Save this page as a layout</button><button class="btn" data-close>Close</button></div>`, 'wide');
  let where = 'after'; wireSeg($('[data-where]', m.el), v => (where = v));
  const pageFor = k => k[0] === 'b' ? buildLayout(LAYOUTS[+k.slice(1)], base) : fromMine(mine[+k.slice(1)]);
  const fromMine = l => { const pg = newPage(E.nb, { w: l.w, h: l.h, template: l.template, paperColor: l.paperColor }); return Object.assign(pg, structuredClone({ strokes: l.strokes, texts: l.texts, tables: l.tables || [], images: [] })); };
  for (const b of $$('.lay', m.el)) { const pg = pageFor(b.dataset.l), cv = $('canvas', b); renderPage(cv.getContext('2d'), pg, cv.width / pg.w, { texts: true, sync: true }); }
  m.el.addEventListener('click', guard(async e => {
    const x = e.target.closest('[data-lx]');
    if (x) { e.stopPropagation(); if (await confirmBox('Delete this layout?')) { mine.splice(+x.dataset.lx.slice(1), 1); await metaPut('layouts', mine); m.close(); layoutsFlow(); } return; }
    if (e.target.closest('[data-mine]')) {
      const name = await promptText('Save page as a layout', '', 'e.g. My physics problem page'); if (name === null) return;
      mine.push({ id: uid(), name: name || 'My layout', w: base.w, h: base.h, template: base.template, paperColor: base.paperColor, strokes: base.strokes, texts: base.texts, tables: base.tables });
      await metaPut('layouts', mine); toast('Layout saved (images are not included)'); m.close(); return;
    }
    const b = e.target.closest('[data-l]'); if (!b) return;
    const pg = pageFor(b.dataset.l); pg.texts.forEach(t => (t.id = uid())); pg.tables.forEach(t => (t.id = uid()));
    await db.put('pages', pg); m.close();
    await insertPagesAt([pg], where === 'end' ? E.pages.length - 1 : currentIndex());
  }));
}

// =====================================================================
// Page links: tap a link to jump to a page, lesson, another notebook or a website
// =====================================================================
let backStack = null;
function renderLinks(p, el) {
  const layer = el.querySelector('.text-layer');
  for (const l of p.links || []) {
    const d = document.createElement('div'); d.className = 'plink'; d.dataset.id = l.id;
    d.style.cssText = `--x:${l.x};--y:${l.y};--w:${l.w};--h:${l.h}`;
    d.innerHTML = `<button class="plink-go" title="Tap to open · hold for options">${icon('link')}<span>${esc(l.label || 'Link')}</span></button>`;
    const b = $('button', d); let t0 = 0, lpT = null, sx = 0, sy = 0;
    b.addEventListener('pointerdown', e => { e.stopPropagation(); t0 = Date.now(); sx = e.clientX; sy = e.clientY; clearTimeout(lpT); lpT = setTimeout(() => { lpT = null; t0 = 0; linkMenu(p, l); }, 550); });
    b.addEventListener('pointerup', e => { e.stopPropagation(); if (lpT) { clearTimeout(lpT); lpT = null; } if (t0 && Date.now() - t0 < 550 && Math.hypot(e.clientX - sx, e.clientY - sy) < 12) { t0 = 0; guard(followLink)(l); } });
    b.addEventListener('pointercancel', () => clearTimeout(lpT));
    b.addEventListener('contextmenu', e => { e.preventDefault(); linkMenu(p, l); });
    layer.appendChild(d);
  }
}
async function linkMenu(p, l) {
  const v = await menu(l.label || 'Link', [{ label: 'Open link', value: 'go', icon: 'go' }, { label: 'Change where it goes', value: 'edit', icon: 'edit' }, { label: 'Remove link', value: 'del', icon: 'trash', danger: true }]);
  if (v === 'go') await followLink(l);
  if (v === 'del') { const before = snap(p); p.links = p.links.filter(x => x !== l); pushUndo(p, before); refreshPage(p); }
  if (v === 'edit') { const to = await linkTargetForm(l.to); if (to) { const before = snap(p); Object.assign(l, { to, label: to.label }); pushUndo(p, before); refreshPage(p); } }
}
async function followLink(l) {
  const to = l.to; if (!to) return;
  if (to.url) { window.open(to.url, '_blank', 'noopener'); return; }
  const from = { nb: E.nb.id, page: E.pages[currentIndex()].id, top: scroller.scrollTop, left: scroller.scrollLeft, title: E.nb.title, no: currentIndex() + 1 };
  if (to.nb && to.nb !== E.nb.id) {
    await globalThis.onLeaveNb?.(); E.nb.lastPage = currentIndex(); await flush(); await saveNb();
    await openNotebook(to.nb, { pageId: to.page });
  } else {
    const i = E.pages.findIndex(p => p.id === to.page); if (i < 0) return toast('That page no longer exists');
    scrollToPage(i, true);
  }
  showBack(from);
}
function showBack(from) {
  backStack = from; $('#backPill')?.remove();
  const b = document.createElement('button'); b.id = 'backPill'; b.className = 'back-pill';
  b.innerHTML = `${icon('back')}<span>Back to ${from.nb !== E.nb?.id ? esc(from.title) + ' · ' : ''}p. ${from.no}</span><i data-x>×</i>`;
  document.body.appendChild(b);
  b.onclick = guard(async e => {
    b.remove(); if (e.target.closest('[data-x]')) return;
    const f = backStack; backStack = null; if (!f) return;
    if (f.nb !== E.nb?.id) { await globalThis.onLeaveNb?.(); await flush(); await saveNb(); await openNotebook(f.nb, { pageId: f.page }); }
    scroller.scrollTo({ top: f.top, left: f.left, behavior: 'smooth' });
  });
  clearTimeout(showBack.t); showBack.t = setTimeout(() => b.remove(), 20000);
}
async function linkTargetForm(cur = {}) {
  const nbs = (await db.all('notebooks')).sort((a, b) => a.title.localeCompare(b.title));
  let kind = cur.url ? 'web' : cur.nb && cur.nb !== E.nb.id ? 'other' : 'here';
  return new Promise(res => {
    const m = openModal(`<h2>Link to…</h2><div class="seg" data-kind>${segHtml([['here', 'This notebook'], ['other', 'Another notebook'], ['web', 'Website']], kind)}</div>
      <div class="link-body"></div><div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Add link</button></div>`, 'small');
    const body = $('.link-body', m.el);
    const pageOpts = (nb, pages) => {
      const idx = new Map(nb.pages.map((id, i) => [id, i])), secs = (nb.sections || []).filter(s => idx.has(s.pageId)).sort((a, b) => idx.get(a.pageId) - idx.get(b.pageId));
      return `${secs.length ? `<optgroup label="Lessons & topics">${secs.map(s => `<option value="${s.pageId}" data-label="${esc(s.title)}">${s.level === 2 ? '　• ' : ''}${esc(s.title)} (p. ${idx.get(s.pageId) + 1})</option>`).join('')}</optgroup>` : ''}
        <optgroup label="Pages">${nb.pages.map((id, i) => `<option value="${id}" data-label="p. ${i + 1}"${cur.page === id ? ' selected' : ''}>Page ${i + 1}</option>`).join('')}</optgroup>`;
    };
    const draw = () => {
      if (kind === 'web') body.innerHTML = `<div class="field"><label class="lbl">Web address</label><input type="url" name="url" value="${esc(cur.url || '')}" placeholder="https://…"></div>`;
      else if (kind === 'here') body.innerHTML = `<div class="field"><label class="lbl">Go to</label><select name="pg">${pageOpts(E.nb)}</select></div>`;
      else body.innerHTML = `<div class="field"><label class="lbl">Notebook</label><select name="nb">${nbs.filter(n => n.id !== E.nb.id).map(n => `<option value="${n.id}"${cur.nb === n.id ? ' selected' : ''}>${esc(n.title)}</option>`).join('')}</select></div><div class="field"><label class="lbl">Go to</label><select name="pg"></select></div>`;
      const nbSel = $('[name=nb]', body);
      if (nbSel) { const fill = () => { const n = nbs.find(x => x.id === nbSel.value); $('[name=pg]', body).innerHTML = n ? pageOpts(n) : ''; }; nbSel.onchange = fill; fill(); }
      $$('input', body).forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
    };
    wireSeg($('[data-kind]', m.el), v => { kind = v; draw(); }); draw();
    let out = null;
    $('[data-ok]', m.el).onclick = () => {
      if (kind === 'web') {
        let u = $('[name=url]', body).value.trim(); if (!u) return toast('Type a web address');
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        let host = u; try { host = new URL(u).hostname.replace(/^www\./, ''); } catch { }
        out = { url: u, label: host };
      } else {
        const sel = $('[name=pg]', body), o = sel?.selectedOptions[0]; if (!o) return toast('Pick a page');
        const nbId = kind === 'here' ? E.nb.id : $('[name=nb]', body).value, n = nbs.find(x => x.id === nbId);
        out = { nb: nbId, page: o.value, label: (kind === 'other' ? (n?.title || 'Notebook') + ' · ' : '') + o.dataset.label };
      }
      m.close();
    };
    m.onClose = () => res(out);
  });
}
async function addLinkFromSel() {
  const s = E.sel; if (!s) return;
  const p = s.page, b = s.box, to = await linkTargetForm(); if (!to) return;
  const before = snap(p); p.links ||= [];
  p.links.push({ id: uid(), x: b[0], y: b[1], w: b[2] - b[0], h: b[3] - b[1], to, label: to.label });
  pushUndo(p, before); clearSelection(); refreshPage(p); toast('🔗 Link added: tap the chip to jump. Hold it to change or remove.', 3000);
}
async function selMoreMenu() {
  if (!E.sel) return;
  const v = await menu('Selection', [{ label: 'Save as image', value: 'img', icon: 'export', hint: 'To Photos or Files' }, { label: 'Add a link…', value: 'link', icon: 'link', hint: 'Tap it later to jump to a page, lesson, notebook or website' },
    { label: 'Save as sticker', value: 'stk', icon: 'sticker', hint: 'Reuse it from ⋯ → Stickers' },
    ...([...E.sel.strokes, ...E.sel.images, ...E.sel.texts, ...(E.sel.tables || [])].some(o => o.g) ? [{ label: 'Ungroup', value: 'ungroup', icon: 'layers', hint: 'Select the pieces of this saved item separately' }] : [])]);
  if (v === 'ungroup') await ungroupSel();
  if (v === 'img') await saveSelectionImage(); if (v === 'link') await addLinkFromSel(); if (v === 'stk') await saveSticker();
}

// =====================================================================
// Audio recording synced to your notes
// =====================================================================
let REC = null, PLAY = null;
function stampRec(o) { if (REC && E.nb && REC.nbId === E.nb.id) { o.ra = REC.id; o.rt = +((Date.now() - REC.t0) / 1000).toFixed(2); } }
const fmtDur = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
// Lecture mode: the microphone goes through a small sound chain before it is saved.
//  · declick.js (an AudioWorklet) removes only the click of the Pencil hitting the glass, the voice around
//    it is left alone. Pencil touch-downs are passed to it as hints.
//  · A high-pass filter removes the low thump that travels through the iPad's body and the table.
//  · A gentle leveler + boost lifts a lecturer a few metres away; a limiter catches anything loud.
// iPad's own call-style voice processing is switched off: it is tuned for a voice right at the mic and
// treats a distant speaker as noise.
async function lectureChain(mic) {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  const ac = new AC(); await ac.resume().catch(() => { });
  const node = (fn, set) => { const n = fn(); for (const [k, v] of Object.entries(set)) n[k].value !== undefined ? (n[k].value = v) : (n[k] = v); return n; };
  const src = ac.createMediaStreamSource(mic);
  const hp = node(() => ac.createBiquadFilter(), { type: 'highpass', frequency: 110, Q: 0.7 });
  const lp = node(() => ac.createBiquadFilter(), { type: 'lowpass', frequency: 8000, Q: 0.7 });
  let dc = null;
  try { await ac.audioWorklet.addModule('declick.js'); dc = new AudioWorkletNode(ac, 'inkbook-declick', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }); }
  catch (e) { console.warn('declick unavailable', e); }
  const level = node(() => ac.createDynamicsCompressor(), { threshold: -40, knee: 14, ratio: 4, attack: 0.01, release: 0.45 });
  const boost = ac.createGain(); boost.gain.value = 3;
  const limit = node(() => ac.createDynamicsCompressor(), { threshold: -4, knee: 0, ratio: 20, attack: 0.001, release: 0.08 });
  const dest = ac.createMediaStreamDestination();
  src.connect(hp); hp.connect(lp);
  if (dc) { lp.connect(dc); dc.connect(level); } else lp.connect(level);
  level.connect(boost); boost.connect(limit); limit.connect(dest);
  const ctxTime = evT => {           // page time (event.timeStamp, ms) → audio clock (s)
    const o = ac.getOutputTimestamp?.();
    return o?.performanceTime ? o.contextTime + (evT - o.performanceTime) / 1000 : ac.currentTime + (evT - performance.now()) / 1000;
  };
  return {
    ac, stream: dest.stream, declick: !!dc,
    tap(evT) { dc?.port.postMessage({ hint: ctxTime(evT) }); },
    stats() { return new Promise(res => { if (!dc) return res(null); dc.port.onmessage = e => res(e.data); dc.port.postMessage({ stats: 1 }); setTimeout(() => res(null), 500); }); },
    stop() { try { src.disconnect(); } catch { } ac.close().catch(() => { }); },
  };
}
document.addEventListener('pointerdown', e => { if (e.pointerType === 'pen' && REC?.chain) REC.chain.tap(e.timeStamp); }, true);
document.addEventListener('change', e => { if (e.target.matches?.('[data-recclean]')) { S.recClean = e.target.checked; saveSettings(); } });
if (S.recClean === undefined) S.recClean = true;
async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Recording is not supported in this browser');
  const clean = S.recClean !== false;
  let mic, chain = null;
  try { mic = await navigator.mediaDevices.getUserMedia({ audio: clean ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : { echoCancellation: true, noiseSuppression: true } }); }
  catch { return toast('Inkbook needs microphone access. Allow it in iPad Settings → Safari → Microphone.', 5000); }
  if (clean) { try { chain = await lectureChain(mic); } catch (e) { console.warn(e); chain = null; } }
  const stream = chain?.stream || mic;
  const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
  const rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 96000 } : { audioBitsPerSecond: 96000 });
  REC = { id: uid(), nbId: E.nb.id, t0: Date.now(), rec, stream, mic, chain, chunks: [], type: rec.mimeType || type || 'audio/mp4' };
  const R = REC;
  rec.ondataavailable = e => { if (e.data?.size) R.chunks.push(e.data); };
  rec.start(1000);
  REC.timer = setInterval(updateRecBtn, 500); updateRecBtn();
  toast('● Recording. Everything you write now is linked to this moment in the audio.', 3000);
}
function stopRecording() {
  const r = REC; if (!r) return Promise.resolve();
  REC = null; clearInterval(r.timer); updateRecBtn();
  return new Promise(res => {
    r.rec.onstop = async () => {
      r.stream.getTracks().forEach(t => t.stop()); r.mic?.getTracks().forEach(t => t.stop()); r.chain?.stop();
      const blob = new Blob(r.chunks, { type: r.type }), dur = (Date.now() - r.t0) / 1000;
      if (blob.size < 500) { toast('The recording was empty'); return res(); }
      const key = 'aud_' + r.id; await db.put('blobs', blob, key);
      const nb = E.nb?.id === r.nbId ? E.nb : await db.get('notebooks', r.nbId);
      if (nb) {
        nb.recordings ||= [];
        const d = new Date(r.t0);
        nb.recordings.push({ id: r.id, key, start: r.t0, dur, type: r.type, title: `Recording · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` });
        await db.put('notebooks', nb);
      }
      toast(`Recording saved (${fmtDur(dur)}). Open it from ⋯ → Recordings.`, 3200); res();
    };
    try { r.rec.stop(); } catch { r.rec.onstop(); }
  });
}
function updateRecBtn() {
  const b = $('#recBtn'); if (!b) return;
  b.classList.toggle('on', !!REC);
  $('#recTime').textContent = REC ? fmtDur((Date.now() - REC.t0) / 1000) : '';
}
const countLinked = id => E.pages.reduce((n, p) => n + p.strokes.filter(s => s.ra === id).length, 0);
async function recordingsFlow() {
  const list = [...(E.nb.recordings || [])].reverse();
  const m = openModal(`<h2>Recordings</h2><label class="toggle"><input type="checkbox" data-recclean ${S.recClean !== false ? 'checked' : ''}><span><b>Lecture mode</b>: remove Pencil taps and lift a far-away voice (for new recordings)</span></label>${list.length ? `<div class="rows">${list.map(r => `<div class="row rec-row" data-r="${r.id}"><button class="icon-btn rec-play" data-play title="Play">${icon('play')}</button>
      <div class="row-main"><b>${esc(r.title)}</b><span>${fmtDur(r.dur)} · ${countLinked(r.id)} strokes linked</span></div><button class="icon-btn" data-rm title="More">${icon('more')}</button></div>`).join('')}</div>`
    : `<div class="empty">No recordings yet. Tap the microphone button in the toolbar during a lecture. Everything you write is linked to the audio, so later you can tap your notes to hear that moment.</div>`}
    <div class="modal-actions"><button class="btn" data-close>Close</button></div>`, '');
  m.el.addEventListener('click', guard(async e => {
    const row = e.target.closest('[data-r]'); if (!row) return; const r = E.nb.recordings.find(x => x.id === row.dataset.r);
    if (e.target.closest('[data-play]')) { m.close(); return playRecording(r); }
    if (e.target.closest('[data-rm]')) {
      const v = await menu(r.title, [{ label: 'Rename', value: 'ren', icon: 'edit' }, { label: 'Share / save audio file', value: 'share', icon: 'export' }, { label: 'Delete recording', value: 'del', icon: 'trash', danger: true }]);
      if (v === 'ren') { const t = await promptText('Rename recording', r.title); if (t) { r.title = t; await saveNb(); } }
      if (v === 'share') { const b = await db.get('blobs', r.key); if (b) readyToShare(b, `${safeName(r.title)}.${/webm/.test(r.type) ? 'webm' : 'm4a'}`, 'Save it to Files or send it to another app.'); return; }
      if (v === 'del' && await confirmBox('Delete this recording? Your notes stay. Only the audio is removed.')) { if (PLAY?.id === r.id) closePlayer(); E.nb.recordings = E.nb.recordings.filter(x => x !== r); await db.del('blobs', r.key); await saveNb(); }
      m.close(); recordingsFlow();
    }
  }));
}
async function playRecording(r) {
  closePlayer();
  const blob = await db.get('blobs', r.key); if (!blob) return toast('The audio file is missing');
  const url = URL.createObjectURL(blob), audio = new Audio(url);
  const marks = []; E.pages.forEach((p, i) => p.strokes.forEach(s => { if (s.ra === r.id) marks.push([s.rt, i]); }));
  marks.sort((a, b) => a[0] - b[0]);
  PLAY = { id: r.id, r, url, audio, marks, follow: true, shown: -1 };
  globalThis.PLAY_DIM = { id: r.id, t: 0 };
  const bar = document.createElement('div'); bar.className = 'player'; bar.id = 'player';
  bar.innerHTML = `<button class="pl-btn" data-pp>${icon('play')}</button><button class="pl-skip" data-sk="-15">−15</button>
    <span class="pl-t" data-cur>0:00</span><input type="range" min="0" max="${Math.max(1, r.dur).toFixed(1)}" step="0.1" value="0" data-seek><span class="pl-t" data-dur>${fmtDur(r.dur)}</span>
    <button class="pl-skip" data-sk="15">+15</button><button class="pl-speed" data-sp>1×</button><button class="pl-follow on" data-fo title="Scroll along with the notes">Follow</button><button class="pl-x" data-x title="Close">×</button>
    <div class="pl-hint">Faded ink was written later. Tap any ink to hear that moment.</div>`;
  document.body.appendChild(bar);
  const seek = $('[data-seek]', bar);
  const tick = () => {
    if (PLAY?.audio !== audio) return;
    const t = audio.currentTime; seek.value = t; $('[data-cur]', bar).textContent = fmtDur(t);
    globalThis.PLAY_DIM.t = t;
    let n = 0; while (n < marks.length && marks[n][0] <= t) n++;
    if (n !== PLAY.shown) {
      PLAY.shown = n; E.visible.forEach(id => { const p = E.byId.get(id); if (p?.strokes.some(s => s.ra === r.id)) schedulePaint(p); });
      if (PLAY.follow && n > 0 && !audio.paused && marks[n - 1][1] !== currentIndex()) scrollToPage(marks[n - 1][1], true);
    }
  };
  audio.ontimeupdate = tick; audio.onseeked = tick;
  audio.onplay = audio.onpause = () => { $('[data-pp]', bar).innerHTML = icon(audio.paused ? 'play' : 'pause'); };
  audio.onloadedmetadata = () => { if (isFinite(audio.duration)) { seek.max = audio.duration; $('[data-dur]', bar).textContent = fmtDur(audio.duration); } };
  seek.oninput = () => { audio.currentTime = +seek.value; };
  bar.addEventListener('pointerdown', e => e.stopPropagation());
  bar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.pp !== undefined) audio.paused ? audio.play() : audio.pause();
    if (b.dataset.sk) audio.currentTime = clamp(audio.currentTime + +b.dataset.sk, 0, audio.duration || r.dur);
    if (b.dataset.sp !== undefined) { const sp = [1, 1.25, 1.5, 2, 0.75], i = (sp.indexOf(audio.playbackRate) + 1) % sp.length; audio.playbackRate = sp[i]; b.textContent = sp[i] + '×'; }
    if (b.dataset.fo !== undefined) { PLAY.follow = !PLAY.follow; b.classList.toggle('on', PLAY.follow); }
    if (b.dataset.x !== undefined) closePlayer();
  });
  E.visible.forEach(id => schedulePaint(E.byId.get(id)));
  audio.play().catch(() => { });
}
function closePlayer() {
  if (!PLAY) return;
  PLAY.audio.pause(); URL.revokeObjectURL(PLAY.url); PLAY = null; globalThis.PLAY_DIM = null;
  $('#player')?.remove(); E.visible.forEach(id => schedulePaint(E.byId.get(id)));
}
function playSeekAt(p, pt) {
  if (!PLAY) return false;
  const st = [...p.strokes].reverse().find(s => s.ra === PLAY.id && hitStroke(s, pt.x, pt.y, 12));
  const tx = !st && p.texts.find(t => { if (t.ra !== PLAY.id) return false; const b = textBox(p, t); return pt.x >= b[0] && pt.x <= b[2] && pt.y >= b[1] && pt.y <= b[3]; });
  const hit = st || tx; if (!hit) return false;
  PLAY.audio.currentTime = Math.max(0, hit.rt - 2); PLAY.audio.play().catch(() => { });
  toast('▶ ' + fmtDur(hit.rt), 900); return true;
}

// =====================================================================
// Split view: another notebook (or another part of this one) beside your notes
// =====================================================================
const REF = { nb: null, pages: [], zoom: 1, io: null, ro: null };
async function openSplit(nbId) {
  const pane = $('#refPane'), nbs = (await db.all('notebooks')).sort((a, b) => b.updated - a.updated);
  if (!nbId) {
    const v = await menu('Show beside your notes', [{ label: `This notebook (${E.nb.title})`, value: E.nb.id, icon: 'split' }, { head: 'Other notebooks' },
      ...nbs.filter(n => n.id !== E.nb.id).slice(0, 30).map(n => ({ label: n.title, value: n.id, icon: 'file', hint: `${n.pages.length} pages` }))]);
    if (!v) return; nbId = v;
  }
  const nb = nbId === E.nb.id ? E.nb : await db.get('notebooks', nbId); if (!nb) return;
  const pages = nbId === E.nb.id ? E.pages : await orderedPages(nb);
  REF.nb = nb; REF.pages = pages.map(normPage); REF.zoom = 1;
  pane.hidden = false; pane.style.setProperty('--rw', (S.refW * 100).toFixed(1) + '%');
  pane.innerHTML = `<div class="ref-drag" title="Drag to resize"></div><div class="ref-head"><button class="ref-nb" data-rnb>${icon('split')}<b>${esc(nb.title)}</b>${icon('chev')}</button>
    <span class="ref-pg" data-rpg></span><button class="icon-btn" data-rz="-1" title="Smaller">−</button><button class="icon-btn" data-rz="1" title="Bigger">+</button><button class="icon-btn" data-rx title="Close split view">${icon('x')}</button></div>
    <div class="ref-scroll"><div class="ref-pages">${REF.pages.map((p, i) => `<div class="ref-page" data-i="${i}"><canvas></canvas><small>${i + 1}</small></div>`).join('')}</div></div>`;
  wireRefPane(pane); layoutRef(); requestAnimationFrame(() => E.nb && layout());
}
function closeSplit() {
  const pane = $('#refPane'); if (!pane || pane.hidden) return;
  REF.io?.disconnect(); REF.ro?.disconnect(); pane.hidden = true; pane.innerHTML = ''; REF.nb = null; REF.pages = [];
  requestAnimationFrame(() => E.nb && layout());
}
function layoutRef() {
  const pane = $('#refPane'), sc = $('.ref-scroll', pane); if (!sc) return;
  const W = Math.max(120, (sc.clientWidth - 24) * REF.zoom);
  REF.io?.disconnect();
  REF.io = new IntersectionObserver(es => es.forEach(e => { const c = $('canvas', e.target); if (e.isIntersecting) drawRefPage(+e.target.dataset.i, c); else { c.width = c.height = 0; c._w = 0; } }), { root: sc, rootMargin: '80% 0px' });
  $$('.ref-page', pane).forEach(d => { const p = REF.pages[+d.dataset.i]; d.style.width = W + 'px'; d.style.height = Math.round(W * p.h / p.w) + 'px'; $('canvas', d)._w = 0; REF.io.observe(d); });
}
async function drawRefPage(i, c) {
  const p = REF.pages[i], W = c.parentElement.clientWidth; if (!p || !W || c._w === W) return;
  c._w = W; const r = Math.min(devicePixelRatio || 1, 2), H = W * p.h / p.w;
  await preloadPage(p); if (c._w !== W) return;
  c.width = Math.round(W * r); c.height = Math.round(H * r); c.style.width = W + 'px'; c.style.height = H + 'px';
  renderPage(c.getContext('2d'), p, c.width / p.w, { texts: true, sync: true });
}
function wireRefPane(pane) {
  const sc = $('.ref-scroll', pane);
  const upd = () => { const kids = $$('.ref-page', pane), top = sc.scrollTop + 40; let i = 0; kids.forEach((k, j) => { if (k.offsetTop <= top) i = j; }); const l = $('[data-rpg]', pane); if (l) l.textContent = `p. ${i + 1} / ${REF.pages.length}`; };
  sc.addEventListener('scroll', () => requestAnimationFrame(upd), { passive: true }); upd();
  pane.onclick = guard(async e => {
    if (e.target.closest('[data-rx]')) return closeSplit();
    if (e.target.closest('[data-rnb]')) return openSplit();
    const z = e.target.closest('[data-rz]'); if (z) { const f = sc.scrollTop / Math.max(1, sc.scrollHeight); REF.zoom = clamp(REF.zoom * (+z.dataset.rz > 0 ? 1.25 : 0.8), 0.5, 3); layoutRef(); sc.scrollTop = f * sc.scrollHeight; }
  });
  // pinch to zoom inside the split view
  let pz = null;
  sc.addEventListener('touchmove', e => {
    if (e.touches.length !== 2) return; e.preventDefault();
    const [a, b] = e.touches, d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (!pz) pz = { d0: d, r: 1 }; pz.r = clamp(REF.zoom * d / pz.d0, 0.5, 3) / REF.zoom;
    $('.ref-pages', pane).style.transform = `scale(${pz.r})`;
  }, { passive: false });
  sc.addEventListener('touchend', e => { if (pz && e.touches.length < 2) { $('.ref-pages', pane).style.transform = ''; REF.zoom = clamp(REF.zoom * pz.r, 0.5, 3); pz = null; layoutRef(); } });
  // drag the left edge to resize
  const dr = $('.ref-drag', pane);
  dr.addEventListener('pointerdown', e => {
    e.preventDefault(); try { dr.setPointerCapture(e.pointerId); } catch { }
    const body = pane.parentElement.getBoundingClientRect();
    const mv = ev => { S.refW = clamp((body.right - ev.clientX) / body.width, 0.25, 0.7); pane.style.setProperty('--rw', (S.refW * 100).toFixed(1) + '%'); };
    const up = () => { dr.removeEventListener('pointermove', mv); dr.removeEventListener('pointerup', up); saveSettings(); layoutRef(); layout(); };
    dr.addEventListener('pointermove', mv); dr.addEventListener('pointerup', up);
  });
  let rT; REF.ro?.disconnect(); REF.ro = new ResizeObserver(() => { clearTimeout(rT); rT = setTimeout(() => REF.nb && layoutRef(), 120); }); REF.ro.observe(sc);
}

// =====================================================================
// Planner: exam countdowns and study tasks per subject (folder)
// =====================================================================
let PLAN = { exams: [], tasks: [] };
const loadPlan = async () => (PLAN = await metaGet('planner', { exams: [], tasks: [] }));
const savePlan = async () => { await metaPut('planner', PLAN); globalThis.onPlanSaved?.(); };
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseDay = s => { const [y, m, d] = (s || '').split('-').map(Number); return y ? new Date(y, m - 1, d) : null; };
const daysTo = s => { const d = parseDay(s); return d ? Math.round((d - today0()) / 864e5) : null; };
const fmtDay = s => parseDay(s)?.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) || '';
const subjColor = id => folderById(id)?.color || S.accent;
const subjName = id => folderById(id)?.name || 'General';
function countdown(days) {
  if (days == null) return ['', ''];
  if (days < 0) return ['✓', days === -1 ? 'yesterday' : `${-days} days ago`];
  if (days === 0) return ['Today', 'good luck!'];
  return [String(days), days === 1 ? 'day left' : 'days left'];
}
function examCard(x) {
  const dd = daysTo(x.date), [n, l] = countdown(dd);
  return `<button class="exam-card${dd < 0 ? ' past' : dd <= 3 ? ' soon' : ''}" data-exam="${x.id}" style="--c:${esc(subjColor(x.folderId))}">
    <div class="ex-num"><b>${n}</b><small>${l}</small></div>
    <div class="ex-main"><b>${esc(x.title)}</b><span>${esc(subjName(x.folderId))}</span><span>${fmtDay(x.date)}${x.time ? ' · ' + esc(x.time) : ''}${x.where ? ' · ' + esc(x.where) : ''}</span></div></button>`;
}
function taskRow(t, showSubj = true) {
  const dd = daysTo(t.due), late = !t.done && dd != null && dd < 0;
  const when = t.due ? (dd === 0 ? 'Today' : dd === 1 ? 'Tomorrow' : dd === -1 ? 'Yesterday' : fmtDay(t.due)) : '';
  return `<div class="task${t.done ? ' done' : ''}${late ? ' late' : ''}" data-task="${t.id}"><button class="tk-box" data-tick title="Done">${t.done ? '✓' : ''}</button>
    <div class="tk-main"><b>${esc(t.text)}</b><span>${showSubj ? `<i style="--c:${esc(subjColor(t.folderId))}"></i>${esc(subjName(t.folderId))}` : ''}${showSubj && when ? ' · ' : ''}${when}</span></div></div>`;
}
function updatePlannerCount() {
  const n = PLAN.tasks.filter(t => !t.done && t.due && daysTo(t.due) <= 0).length;
  const c = $('#plannerCount'); if (c) c.textContent = n || '';
}
async function renderPlannerStrip(box, folderId) {
  await loadPlan(); updatePlannerCount();
  if (LIB.view !== (folderId ? 'folder' : 'home') || (folderId && LIB.folderId !== folderId) || LIB.q.trim()) return;
  const ids = folderId ? subtreeIds(folderId) : null, inF = x => !ids || ids.has(x.folderId);
  const ex = PLAN.exams.filter(x => inF(x) && daysTo(x.date) >= 0).sort((a, b) => a.date.localeCompare(b.date));
  const tk = PLAN.tasks.filter(t => inF(t) && !t.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  if (!folderId && !ex.length && !tk.length) return;
  $('.plan-strip', box)?.remove();
  const h = document.createElement('div'); h.className = 'plan-strip';
  h.innerHTML = `<div class="plan-head"><h3 class="lib-sec">${folderId ? 'Exams & study plan' : 'Coming up'}${globalThis.semChip?.() || ''}</h3>${folderId ? '' : globalThis.statusChipHtml?.() || ''}<div class="plan-btns"><button class="btn small" data-padd="exam">${icon('plus')}Exam</button><button class="btn small" data-padd="task">${icon('plus')}Task</button>${folderId ? '' : `<button class="btn small" data-popen>Planner</button>`}</div></div>
    ${ex.length ? `<div class="exam-row">${ex.slice(0, folderId ? 8 : 4).map(examCard).join('')}</div>` : folderId ? `<div class="hint">No exams yet. Add one for a countdown, then tap it to make a study plan.</div>` : ''}
    ${tk.length ? `<div class="task-list">${tk.slice(0, folderId ? 8 : 4).map(t => taskRow(t, !folderId)).join('')}</div>` : ''}`;
  box.prepend(h); wirePlanner(h, folderId);
}
async function renderPlanner(box) {
  await loadPlan(); updatePlannerCount();
  if (!FOLDERS.length) FOLDERS = await db.all('folders');
  const ex = [...PLAN.exams].sort((a, b) => a.date.localeCompare(b.date)), up = ex.filter(x => daysTo(x.date) >= 0), past = ex.filter(x => daysTo(x.date) < 0).reverse();
  const open = PLAN.tasks.filter(t => !t.done);
  const groups = [['Overdue', t => t.due && daysTo(t.due) < 0], ['Today', t => t.due && daysTo(t.due) === 0], ['Next 7 days', t => t.due && daysTo(t.due) > 0 && daysTo(t.due) <= 7], ['Later', t => t.due && daysTo(t.due) > 7], ['No date', t => !t.due]];
  const done = PLAN.tasks.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 40);
  box.innerHTML = `<div class="planner">
    <div class="plan-head"><h3 class="lib-sec">Exams</h3><div class="plan-btns"><button class="btn small primary" data-padd="exam">${icon('plus')}Exam</button></div></div>
    ${up.length ? `<div class="exam-row">${up.map(examCard).join('')}</div>` : `<div class="empty">Add your exams to see how many days are left and build a study plan.</div>`}
    <div class="plan-head"><h3 class="lib-sec">Study tasks</h3><div class="plan-btns"><button class="btn small primary" data-padd="task">${icon('plus')}Task</button></div></div>
    ${open.length ? groups.map(([g, f]) => { const l = open.filter(f).sort((a, b) => (a.due || '').localeCompare(b.due || '')); return l.length ? `<div class="task-group"><div class="tg-head${g === 'Overdue' ? ' late' : ''}">${g} · ${l.length}</div><div class="task-list">${l.map(t => taskRow(t)).join('')}</div></div>` : ''; }).join('')
      : `<div class="empty">Nothing to do right now. Tap <b>+ Task</b>, or tap an exam → <b>Make a study plan</b>.</div>`}
    ${done.length ? `<details class="task-group"><summary class="tg-head">Done · ${done.length}</summary><div class="task-list">${done.map(t => taskRow(t)).join('')}</div></details>` : ''}
    ${past.length ? `<details class="task-group"><summary class="tg-head">Past exams · ${past.length}</summary><div class="exam-row">${past.map(examCard).join('')}</div></details>` : ''}</div>`;
  wirePlanner($('.planner', box), null, () => renderPlanner(box));
}
function wirePlanner(root, folderId, redraw) {
  const again = redraw || (() => showLibrary());
  root.addEventListener('click', guard(async e => {
    const hit = e.target.closest('[data-popen],[data-padd],[data-task],[data-exam]'); if (!hit) return;
    e.stopPropagation();
    if (hit.dataset.popen !== undefined) { LIB.view = 'planner'; LIB.folderId = null; return showLibrary(); }
    if (hit.dataset.padd) { if (await (hit.dataset.padd === 'exam' ? examForm(null, folderId) : taskForm(null, folderId))) again(); return; }
    if (hit.dataset.task) {
      const t = PLAN.tasks.find(x => x.id === hit.dataset.task); if (!t) return;
      if (e.target.closest('[data-tick]')) { t.done = !t.done; t.doneAt = Date.now(); await savePlan(); if (t.done) toast('✓ Nice work', 900); return again(); }
      if (await taskForm(t)) again(); return;
    }
    const x = PLAN.exams.find(y => y.id === hit.dataset.exam); if (x && await examMenu(x)) again();
  }));
}
const subjSelect = sel => `<select name="f">${folderOptions(sel).replace("Home (no folder)", "General (no subject)")}</select>`;
function planForm(title, fields, onOk, canDel) {
  return new Promise(res => {
    const m = openModal(`<h2>${title}</h2>${fields}<div class="modal-actions">${canDel ? `<button class="btn danger-outline" data-del>Delete</button>` : ''}<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button></div>`, 'small');
    $$('input', m.el).forEach(i => i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('[data-ok]', m.el).click(); }));
    let out = false;
    $('[data-ok]', m.el).onclick = guard(async () => { if (await onOk(m.el, false)) { out = true; m.close(); } });
    $('[data-del]', m.el)?.addEventListener('click', guard(async () => { if (await confirmBox('Delete this?') && await onOk(m.el, true)) { out = true; m.close(); } }));
    m.onClose = () => res(out);
  });
}
async function examForm(x, folderId) {
  if (!FOLDERS.length) FOLDERS = await db.all('folders');
  const v = x || { title: '', folderId: folderId || '', date: isoDay(new Date(Date.now() + 14 * 864e5)), time: '', where: '' };
  return planForm(x ? 'Edit exam' : 'New exam', `
    <div class="field"><label class="lbl">Exam</label><input type="text" name="t" value="${esc(v.title)}" placeholder="e.g. Calculus midterm"></div>
    <div class="field"><label class="lbl">Subject</label>${subjSelect(v.folderId)}</div>
    <div class="field two"><div><label class="lbl">Date</label><input type="date" name="d" value="${esc(v.date)}"></div><div><label class="lbl">Time (optional)</label><input type="time" name="tm" value="${esc(v.time || '')}"></div></div>
    <div class="field"><label class="lbl">Room / what's covered (optional)</label><input type="text" name="w" value="${esc(v.where || '')}" placeholder="e.g. Hall B · chapters 1–6"></div>`,
  async (el, del) => {
    await loadPlan();
    if (del) { PLAN.exams = PLAN.exams.filter(y => y.id !== x.id); await savePlan(); return true; }
    const t = $('[name=t]', el).value.trim(), d = $('[name=d]', el).value; if (!t || !d) { toast('Give the exam a name and a date'); return false; }
    const n = { ...(x || { id: uid() }), title: t, folderId: $('[name=f]', el).value || null, date: d, time: $('[name=tm]', el).value, where: $('[name=w]', el).value.trim() };
    PLAN.exams = [...PLAN.exams.filter(y => y.id !== n.id), n]; await savePlan(); return true;
  }, !!x);
}
async function taskForm(t, folderId) {
  if (!FOLDERS.length) FOLDERS = await db.all('folders');
  const v = t || { text: '', folderId: folderId || '', due: '' };
  return planForm(t ? 'Edit task' : 'New study task', `
    <div class="field"><label class="lbl">Task</label><input type="text" name="t" value="${esc(v.text)}" placeholder="e.g. Finish problem set 4"></div>
    <div class="field"><label class="lbl">Subject</label>${subjSelect(v.folderId)}</div>
    <div class="field"><label class="lbl">Due (optional)</label><input type="date" name="d" value="${esc(v.due || '')}"></div>`,
  async (el, del) => {
    await loadPlan();
    if (del) { PLAN.tasks = PLAN.tasks.filter(y => y.id !== t.id); await savePlan(); return true; }
    const s = $('[name=t]', el).value.trim(); if (!s) { toast('Type the task'); return false; }
    const n = { ...(t || { id: uid(), done: false }), text: s, folderId: $('[name=f]', el).value || null, due: $('[name=d]', el).value };
    PLAN.tasks = [...PLAN.tasks.filter(y => y.id !== n.id), n]; await savePlan(); return true;
  }, !!t);
}
async function examMenu(x) {
  const v = await menu(x.title, [{ label: 'Make a study plan', value: 'plan', icon: 'calendar', hint: 'Spreads a review session for each lesson until the exam' }, { label: 'Edit exam', value: 'edit', icon: 'edit' }]);
  if (v === 'edit') return examForm(x);
  if (v === 'plan') return studyPlanFlow(x);
  return false;
}
async function studyPlanFlow(x) {
  const left = daysTo(x.date); if (left < 1) { toast('This exam is today or already over'); return false; }
  const ids = x.folderId ? subtreeIds(x.folderId) : null, nbs = (await db.all('notebooks')).filter(n => !ids || ids.has(n.folderId));
  const topics = [];
  for (const n of nbs) { const ls = (n.sections || []).filter(s => (s.level || 1) === 1); if (ls.length) ls.forEach(s => topics.push(nbs.length > 1 ? `${s.title} (${n.title})` : s.title)); else topics.push(n.title); }
  if (!topics.length) topics.push('Read through all your notes');
  let mock = left > 1;
  return new Promise(res => {
    const m = openModal(`<h2>Study plan: ${esc(x.title)}</h2><p class="hint">${left} day${left > 1 ? 's' : ''} left · ${topics.length} lesson${topics.length > 1 ? 's' : ''} to review from ${x.folderId ? esc(subjName(x.folderId)) : 'all your notebooks'}. Sessions are spread evenly; you can edit or delete any of them later.</p>
      <label class="toggle"><input type="checkbox" ${mock ? 'checked' : ''} data-mock><span>Keep the day before for practice (saved questions & problems)</span></label>
      <div class="plan-prev"></div>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Add to planner</button></div>`, '');
    const build = () => {
      const days = Math.max(1, left - (mock ? 1 : 0)), start = today0().getTime();
      const out = topics.map((tp, i) => ({ text: 'Review: ' + tp, due: isoDay(new Date(start + Math.min(days - 1, Math.floor(i * days / topics.length)) * 864e5)) }));
      if (mock) out.push({ text: `Practice for ${x.title}: redo saved questions & problems`, due: isoDay(new Date(start + (left - 1) * 864e5)) });
      return out;
    };
    const draw = () => { $('.plan-prev', m.el).innerHTML = `<div class="task-list">${build().map(t => `<div class="task"><span class="tk-box"></span><div class="tk-main"><b>${esc(t.text)}</b><span>${fmtDay(t.due)}</span></div></div>`).join('')}</div>`; };
    $('[data-mock]', m.el).onchange = e => { mock = e.target.checked; draw(); }; draw();
    let ok = false;
    $('[data-ok]', m.el).onclick = guard(async () => { await loadPlan(); PLAN.tasks.push(...build().map(t => ({ id: uid(), done: false, folderId: x.folderId, exam: x.id, ...t }))); await savePlan(); ok = true; m.close(); toast('📅 Study plan added to your planner'); });
    m.onClose = () => res(ok);
  });
}
{
  const _rlc = renderLibContent;
  renderLibContent = function () {
    if (LIB.view === 'planner') { renderPlanner($('#libContent')); return; }
    _rlc();
    if (LIB.view === 'home' || LIB.view === 'folder') renderPlannerStrip($('#libContent'), LIB.view === 'folder' ? LIB.folderId : null);
  };
}

// ---------- Leaving a notebook ----------
globalThis.onLeaveNb = async () => { closeWheel(); closePlayer(); closeSplit(); $('#backPill')?.remove(); if (REC) await stopRecording(); };
Object.assign(globalThis, { stampRec, playSeekAt, renderLinks });

// ---------- Boot ----------
function bootPlus() {
  bootFav(); bootGestures();
  const rb = $('#recBtn');
  rb.onclick = guard(async () => { if (rb._lp) { rb._lp = false; return; } if (REC) await stopRecording(); else await startRecording(); });
  longPress(rb, () => { if (!REC) guard(recordingsFlow)(); });
  const _open = openNotebook;
  openNotebook = async function (...a) { const r = await _open(...a); renderFav(); updateRecBtn(); return r; };
  loadPlan().then(updatePlannerCount);
}
