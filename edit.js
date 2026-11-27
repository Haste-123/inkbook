'use strict';
/* =====================================================================
   Inkbook v27 — a tool wheel you can customise (with Paste), snipping
   part of the split-view notebook as an image, and photos on tasks.
   ===================================================================== */

Object.assign(ICONS, { cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>' });

// ---------- the tool wheel ----------
const WHEEL_ALL = [['pen', 'pen', 'Pen'], ['hl', 'hl', 'Highlighter'], ['eraser', 'eraser', 'Eraser'], ['shape', 'shape', 'Shapes'], ['lasso', 'lasso', 'Lasso'],
  ['text', 'text', 'Text'], ['laser', 'laser', 'Laser'], ['undo', 'undo', 'Undo'], ['redo', 'redo', 'Redo'], ['paste', 'paste', 'Paste'], ['image', 'image', 'Image'],
  ['sticker', 'sticker', 'Stickers'], ['table', 'table', 'Table'], ['addpage', 'addpage', 'Add page'], ['find', 'search', 'Find'], ['rem', 'bell', 'Reminders'],
  ['rec', 'mic', 'Record'], ['selall', 'selall', 'Select all']];
const WHEEL_DEFAULT = ['pen', 'hl', 'eraser', 'shape', 'lasso', 'text', 'undo', 'redo', 'paste'];
if (!Array.isArray(S.wheelItems)) S.wheelItems = [...WHEEL_DEFAULT];
let wheelAt = { x: 0, y: 0 };
const WHEEL_ACT = {
  paste: () => pasteAtPoint(wheelAt.x, wheelAt.y),
  image: () => pickFiles('image/*', true).then(f => insertImages(f)),                // the file picker must open straight from the tap
  sticker: () => stickersFlow(), table: () => insertTableFlow(), addpage: () => $('#addPageBtn').click(),
  find: () => openFind(), rem: () => openReminders(), rec: () => $('#recBtn').click(), selall: () => selectAll(),
};
{
  const _ow = openWheel;
  openWheel = function (x, y) {
    wheelAt = { x, y };
    WHEEL.splice(0, WHEEL.length, ...S.wheelItems.map(k => WHEEL_ALL.find(w => w[0] === k)).filter(Boolean));
    _ow(x, y);
    wheelEl?.insertAdjacentHTML('beforeend', `<button data-wcust class="wheel-cust" title="Customise the wheel">${icon('settings')}</button>`);
    if (!E.clip) wheelEl?.querySelector('[data-w="paste"]')?.classList.add('dim');
  };
  const _pw = pickWheel;
  pickWheel = function (b) {
    if (b.dataset.wcust !== undefined) { closeWheel(); return wheelSettings(); }
    const act = WHEEL_ACT[b.dataset.w]; if (act) { closeWheel(); return guard(act)(); }
    return _pw(b);
  };
}
// Paste where you are: under the wheel, centred on that spot, never off the page
async function pasteAtPoint(x, y) {
  if (!E.clip) return toast('Nothing copied yet: select something and tap Copy (or snip from split view)', 2600);
  const tg = pageAt(x, y); if (!tg) return;
  const r = tg.el.getBoundingClientRect(), u = r.width / tg.p.w, c = E.clip.box;
  await pasteClip(tg.p, { x: (x - r.left) / u - (c[2] - c[0]) / 2, y: (y - r.top) / u - (c[3] - c[1]) / 2 });
}
{
  const _pc = pasteClip;
  pasteClip = async function (p, pt) {                // whatever pastes, it lands fully on the page
    const c = E.clip; if (!c) return;
    const bw = c.box[2] - c.box[0], bh = c.box[3] - c.box[1];
    return _pc(p, { x: clamp(pt.x, 0, Math.max(0, p.w - bw)), y: clamp(pt.y, 0, Math.max(0, p.h - bh)) });
  };
}
function wheelSettings() {
  let sel = [...S.wheelItems];
  const m = openModal(`<h2>Customise the wheel</h2><p class="hint" style="margin-top:-6px">Choose up to 10. They go round the wheel in the order you pick them, starting at the top. The middle button always goes back to your last tool.</p>
    <div class="wc-grid" data-g></div>
    <div class="modal-actions"><button class="btn" data-reset>Reset</button><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button></div>`, 'small');
  const draw = () => { $('[data-g]', m.el).innerHTML = WHEEL_ALL.map(([k, ic, l]) => { const i = sel.indexOf(k); return `<button class="wc-it${i >= 0 ? ' on' : ''}" data-k="${k}">${icon(ic)}<span>${l}</span>${i >= 0 ? `<i>${i + 1}</i>` : ''}</button>`; }).join(''); };
  m.el.addEventListener('click', e => {
    const b = e.target.closest('[data-k]');
    if (b) { const k = b.dataset.k; if (sel.includes(k)) sel = sel.filter(x => x !== k); else if (sel.length < 10) sel.push(k); else toast('The wheel holds up to 10'); draw(); }
    if (e.target.closest('[data-reset]')) { sel = [...WHEEL_DEFAULT]; draw(); }
  });
  $('[data-ok]', m.el).onclick = () => { if (sel.length < 3) return toast('Pick at least 3'); S.wheelItems = sel; saveSettings(); m.close(); toast('Wheel saved: hold a finger on the page to use it', 2200); };
  draw();
}

// ---------- split view: snip part of the other notebook as an image ----------
{
  const _os = openSplit;
  openSplit = async function (...a) {
    const r = await _os(...a);
    const pane = $('#refPane'); if (!REF.nb || !pane || $('[data-rsnip]', pane)) return r;
    $('[data-rx]', pane).insertAdjacentHTML('beforebegin', `<button class="icon-btn ref-snip" data-rsnip title="Snip: drag over part of a page to copy it as an image">${icon('cut')}</button>`);
    wireSnip(pane); return r;
  };
}
function wireSnip(pane) {
  const sc = $('.ref-scroll', pane), btn = $('[data-rsnip]', pane);
  const setSnip = on => { REF.snip = on; btn.classList.toggle('on', on); sc.classList.toggle('snipping', on); if (on) toast('Drag over the part you want to copy', 1800); };
  btn.addEventListener('click', e => { e.stopPropagation(); setSnip(!REF.snip); });
  let d = null;
  sc.addEventListener('pointerdown', e => {
    const pg = e.target.closest('.ref-page'); if (!pg) return;
    if (!(REF.snip || (E.tool === 'lasso' && e.pointerType !== 'touch'))) return;     // with the lasso tool, the Pencil snips; fingers still scroll
    e.preventDefault(); e.stopPropagation(); try { sc.setPointerCapture(e.pointerId); } catch { }
    const r = pg.getBoundingClientRect(), box = document.createElement('div'); box.className = 'snip-box'; pg.appendChild(box);
    d = { id: e.pointerId, pg, r, x0: e.clientX - r.left, y0: e.clientY - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top, box };
  });
  sc.addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.id) return;
    d.x1 = clamp(e.clientX - d.r.left, 0, d.r.width); d.y1 = clamp(e.clientY - d.r.top, 0, d.r.height);
    Object.assign(d.box.style, { left: Math.min(d.x0, d.x1) + 'px', top: Math.min(d.y0, d.y1) + 'px', width: Math.abs(d.x1 - d.x0) + 'px', height: Math.abs(d.y1 - d.y0) + 'px' });
  });
  const end = guard(async e => {
    if (!d || e.pointerId !== d.id) return;
    const s = d; d = null; s.box.remove();
    if (Math.abs(s.x1 - s.x0) < 8 || Math.abs(s.y1 - s.y0) < 8) return;
    const p = REF.pages[+s.pg.dataset.i], k = p.w / s.r.width;      // screen px → page units
    const x0 = Math.min(s.x0, s.x1) * k, y0 = Math.min(s.y0, s.y1) * k, W = Math.abs(s.x1 - s.x0) * k, H = Math.abs(s.y1 - s.y0) * k;
    const sc2 = Math.min(3, 2000 / W), c = document.createElement('canvas'); c.width = Math.round(W * sc2); c.height = Math.round(H * sc2);
    await preloadPage(p); renderPage(c.getContext('2d'), p, sc2, { texts: true, sync: true, ox: x0, oy: y0 });
    const blob = await new Promise(r => c.toBlob(r, 'image/png')), key = 'img_' + uid(); await db.put('blobs', blob, key);
    E.clip = { strokes: [], images: [{ id: uid(), key, x: 0, y: 0, w: W, h: H }], texts: [], tables: [], box: [0, 0, W, H] };
    setSnip(false); snipDone(s.pg);
  });
  sc.addEventListener('pointerup', end); sc.addEventListener('pointercancel', () => { d?.box.remove(); d = null; });
}
function snipDone(pg) {
  $('.snip-done')?.remove();
  const b = document.createElement('div'); b.className = 'snip-done';
  b.innerHTML = `<span>${icon('check')}Copied as an image</span><button class="btn small primary" data-sp>Paste on my page</button>`;
  $('#refPane').appendChild(b);
  b.querySelector('[data-sp]').onclick = guard(async () => {
    b.remove(); const sr = scroller.getBoundingClientRect();
    await pasteAtPoint(sr.left + sr.width / 2, sr.top + sr.height / 2);
  });
  setTimeout(() => b.remove(), 7000);
}

// ---------- photos on tasks ----------
async function addTaskPhotos(files) {
  const keys = [];
  for (const f of files) { const { blob } = await prepImage(f, 1600); const k = 'tim_' + uid(); await db.put('blobs', blob, k); keys.push(k); }
  return keys;
}
async function photoViewer(key, onDelete) {
  const b = await db.get('blobs', key); if (!(b instanceof Blob)) return toast('This photo hasn’t arrived on this device yet');
  const u = URL.createObjectURL(b);
  const m = openModal(`<div class="pv-wrap"><img src="${u}" alt=""></div><div class="modal-actions"><button class="btn danger-outline" data-del>Remove photo</button><button class="btn primary" data-close>Done</button></div>`, 'wide pv');
  $('[data-del]', m.el).onclick = () => { m.close(); onDelete?.(); };
  m.onClose = () => URL.revokeObjectURL(u);
}
async function drawThumbs(box, keys) {
  box.innerHTML = keys.map(k => `<button class="tp-th" data-tk="${esc(k)}"></button>`).join('') + `<button class="tp-add" data-tadd>${icon('image')}<span>${keys.length ? 'Add' : 'Add photo'}</span></button>`;
  for (const el of $$('[data-tk]', box)) { const b = await db.get('blobs', el.dataset.tk); if (b instanceof Blob) { const u = URL.createObjectURL(b); el.style.backgroundImage = `url("${u}")`; setTimeout(() => URL.revokeObjectURL(u), 60000); } }
}

// ---------- saved items are one object ----------
// Everything saved together (★ Save → Important, Question…) carries the saved item's id (g).
// Touching any part selects all of it, and the saved item always points to where it is now.
const liveGroups = () => new Set((E.nb?.items || []).map(it => it.id));
const pageObjs = p => [...p.strokes, ...p.images, ...p.texts, ...(p.tables || [])];
{
  const _ss = setSelection;
  setSelection = function (p, strokes = new Set(), images = new Set(), texts = new Set(), tables = new Set()) {
    const ok = liveGroups(), gs = new Set();
    for (const set of [strokes, images, texts, tables]) for (const o of set) if (o.g && ok.has(o.g)) gs.add(o.g);
    if (gs.size) {
      for (const o of p.strokes) if (gs.has(o.g)) strokes.add(o);
      for (const o of p.images) if (gs.has(o.g)) images.add(o);
      for (const o of p.texts) if (gs.has(o.g)) texts.add(o);
      for (const o of p.tables || []) if (gs.has(o.g)) tables.add(o);
    }
    return _ss(p, strokes, images, texts, tables);
  };
}
// the saved item's box = wherever its pieces are now
function groupBox(p, id) {
  const sel = { page: p, strokes: new Set(p.strokes.filter(o => o.g === id)), images: new Set(p.images.filter(o => o.g === id)), texts: new Set(p.texts.filter(o => o.g === id)), tables: new Set((p.tables || []).filter(o => o.g === id)) };
  return sel.strokes.size + sel.images.size + sel.texts.size + sel.tables.size ? selBox(sel).map(n => Math.round(n)) : null;
}
function refreshSavedBoxes(pages) {
  let changed = false;
  for (const it of E.nb?.items || []) for (const p of pages) {
    const b = groupBox(p, it.id); if (!b) continue;
    if (it.pageId !== p.id || b.join() !== it.box.join()) { it.box = b; it.pageId = p.id; changed = true; }
  }
  if (changed) { saveNb(); if (S.sideOpen && S.sideTab === 'saved') renderEdSide(); }
}
{
  const _fs = followSaved;
  followSaved = function (p, b, tx, ty, toPage = p) { _fs(p, b, tx, ty, toPage); setTimeout(() => refreshSavedBoxes(toPage === p ? [p] : [p, toPage]), 0); };
  const _ah = applyHist;
  applyHist = function (from, to, key) { const u = from[from.length - 1]; _ah(from, to, key); const ids = u ? (u.group ? u.group.map(g => g.id) : [u.id]) : []; refreshSavedBoxes(ids.map(id => E.byId.get(id)).filter(Boolean)); };
}
// saving makes the selection one object
{
  const _sif = saveItemFlow;
  saveItemFlow = async function (p, box) {
    const sel = E.sel, n0 = E.nb.items.length, r = await _sif(p, box);
    const it = E.nb.items[E.nb.items.length - 1];
    if (sel && E.nb.items.length > n0 && it) {
      for (const set of [sel.strokes, sel.images, sel.texts, sel.tables || new Set()]) for (const o of set) o.g = it.id;
      it.grouped = true; markDirty(p); await saveNb();
    }
    return r;
  };
}
// copies are their own thing (not part of the saved item)
{
  const _cs = copySel;
  copySel = function () { _cs(); if (!E.clip) return; for (const k of ['strokes', 'images', 'texts', 'tables']) E.clip[k] = (E.clip[k] || []).map(o => { const n = { ...o }; delete n.g; return n; }); };
}
// items saved before this version: group what's inside their box, once
async function groupOldSaved() {
  let changed = false;
  for (const it of E.nb?.items || []) {
    if (it.grouped) continue; it.grouped = true; changed = true;
    const p = E.byId.get(it.pageId); if (!p) continue;
    const inside = (x0, y0, x1, y1) => { const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; return cx >= it.box[0] && cx <= it.box[2] && cy >= it.box[1] && cy <= it.box[3]; };
    let n = 0;
    for (const st of p.strokes) { if (st.g) continue; const b = bbox(st); if (inside(...b)) { st.g = it.id; n++; } }
    for (const o of p.images) if (!o.g && inside(o.x, o.y, o.x + o.w, o.y + o.h)) { o.g = it.id; n++; }
    for (const o of p.texts) if (!o.g) { const b = textBox(p, o); if (inside(...b)) { o.g = it.id; n++; } }
    for (const o of p.tables || []) if (!o.g) { const b = tableBox(p, o); if (inside(...b)) { o.g = it.id; n++; } }
    if (n) markDirty(p);
  }
  if (changed) await saveNb();
}
async function ungroupSel() {
  const sel = E.sel; if (!sel) return;
  const p = sel.page, before = snap(p);
  const strip = arr => arr.map(o => { if (!o.g) return o; const n = { ...o }; delete n.g; return n; });
  const ids = new Set(); for (const set of [sel.strokes, sel.images, sel.texts, sel.tables]) for (const o of set) if (o.g) ids.add(o);
  p.strokes = p.strokes.map(o => ids.has(o) ? strip([o])[0] : o); p.images = p.images.map(o => ids.has(o) ? strip([o])[0] : o);
  p.texts = p.texts.map(o => ids.has(o) ? strip([o])[0] : o); p.tables = (p.tables || []).map(o => ids.has(o) ? strip([o])[0] : o);
  clearSelection(); pushUndo(p, before); refreshPage(p);
  toast('Ungrouped: you can select the pieces separately now. The saved item stays where it is.', 3000);
}

function bootEdit() {
  const _open = openNotebook;
  openNotebook = async function (...a) { const r = await _open(...a); requestAnimationFrame(() => groupOldSaved().catch(console.warn)); return r; };
}
