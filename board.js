'use strict';
/* =====================================================================
   Inkbook v37 — the Board: notes with no date.
   "What's on the final", a photo of the exam timetable, "do this later"…
   Sticky-note cards, newest and pinned first, optional subject and colour,
   photos. Kept in the planner data, so they sync and are in backups.
   ===================================================================== */
Object.assign(ICONS, {
  pin: '<path d="M9 4h6l-1 6 3 3H7l3-3z"/><path d="M12 16v5"/>',
  board: '<rect x="3" y="3" width="8" height="10" rx="2"/><rect x="13" y="3" width="8" height="6" rx="2"/><rect x="3" y="15" width="8" height="6" rx="2"/><rect x="13" y="11" width="8" height="10" rx="2"/>',
});
const NOTE_COLORS = [['', 'None'], ['#f5c400', 'Yellow'], ['#30a46c', 'Green'], ['#2f5bea', 'Blue'], ['#e5484d', 'Red'], ['#8e4ec6', 'Purple']];
let boardFilter = '';
const notesOf = () => (PLAN.notes ||= []);
const noteTitle = n => (n.text || '').split('\n')[0].trim();
const noteBody = n => (n.text || '').split('\n').slice(1).join('\n').trim();
const noteColor = n => n.color || (n.folderId && folderById(n.folderId)?.color) || '';
const sortNotes = l => l.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updated || 0) - (a.updated || 0));

function noteCard(n, compact = false) {
  const t = noteTitle(n), body = noteBody(n), c = noteColor(n), subj = n.folderId && folderById(n.folderId);
  return `<button class="bn-card${n.pinned ? ' pinned' : ''}${compact ? ' compact' : ''}" data-note="${n.id}" style="${c ? `--c:${esc(c)}` : ''}">
    ${n.imgs?.length ? `<span class="bn-img" data-bimg="${esc(n.imgs[0])}">${n.imgs.length > 1 ? `<i>+${n.imgs.length - 1}</i>` : ''}</span>` : ''}
    ${t ? `<b>${esc(t)}</b>` : ''}${body && !compact ? `<span class="bn-body">${esc(body)}</span>` : ''}
    <span class="bn-meta">${n.pinned ? `<span class="bn-pin">${icon('pin')}</span>` : ''}${subj ? `<span class="bn-subj"><i style="--c:${esc(subj.color || S.accent)}"></i>${esc(subj.name)}</span>` : ''}</span></button>`;
}
async function fillNoteImages(box) {
  for (const el of $$('[data-bimg]', box)) {
    const b = await db.get('blobs', el.dataset.bimg); if (!(b instanceof Blob)) { el.classList.add('missing'); continue; }
    const u = URL.createObjectURL(b); coverUrls.push(u); el.style.backgroundImage = `url("${u}")`;
  }
}

async function renderBoard(box) {
  await loadPlan(); if (!FOLDERS.length) FOLDERS = await db.all('folders');
  const all = sortNotes([...notesOf()]);
  const subjIds = [...new Set(all.map(n => n.folderId).filter(id => id && folderById(id)))];
  if (boardFilter && !subjIds.includes(boardFilter)) boardFilter = '';
  const shown = all.filter(n => !boardFilter || n.folderId === boardFilter);
  box.innerHTML = `<div class="board">
    <div class="bn-add"><span class="cmp-ic">${icon('plus')}</span><input type="text" data-bnew placeholder="Write a note…" enterkeyhint="done" autocomplete="off">
      <button class="icon-btn" data-bphoto title="New note from a photo">${icon('image')}</button></div>
    ${subjIds.length > 1 ? `<div class="rem-chips bn-filter"><button class="chip${!boardFilter ? ' on' : ''}" data-bf="">All</button>${subjIds.map(id => { const f = folderById(id); return `<button class="chip${boardFilter === id ? ' on' : ''}" data-bf="${id}" style="--c:${esc(f.color || S.accent)}"><i class="sdot"></i>${esc(f.name)}</button>`; }).join('')}</div>` : ''}
    ${shown.length ? `<div class="board-grid">${shown.map(n => noteCard(n)).join('')}</div>`
      : `<div class="rem-empty">${icon('board')}<b>${boardFilter ? 'No notes for this subject' : 'Nothing on your board yet'}</b><span>Things to remember with no date: what's on the final, a photo of the timetable, ideas, things to do later.</span></div>`}
  </div>`;
  fillNoteImages(box);
  const inp = $('[data-bnew]', box);
  inp.addEventListener('keydown', guard(async e => {
    e.stopPropagation(); if (e.key !== 'Enter') return; e.preventDefault();
    const text = inp.value.trim(); if (!text) return;
    await loadPlan(); notesOf().push({ id: uid(), text, folderId: boardFilter || folderInText(text)?.id || null, created: Date.now(), updated: Date.now() });
    await savePlan(); await renderBoard(box); $('[data-bnew]', box)?.focus(); toast('📌 Added to your board', 1100);
  }));
  box.querySelector('.board').addEventListener('click', guard(async e => {
    const c = s => e.target.closest(s);
    if (c('[data-bf]')) { boardFilter = c('[data-bf]').dataset.bf; return renderBoard(box); }
    if (c('[data-bphoto]')) {
      const files = await pickFiles('image/*', true); if (!files?.length) return;     // the picker opens straight from the tap
      const imgs = await addTaskPhotos(files); await loadPlan();
      const n = { id: uid(), text: '', imgs, folderId: boardFilter || null, created: Date.now(), updated: Date.now() }; notesOf().push(n); await savePlan();
      await renderBoard(box); return noteEditor(n.id, () => renderBoard(box));
    }
    const card = c('[data-note]'); if (card) return openNote(card.dataset.note, () => renderBoard(box));
  }));
}

// one note: write, photos, subject, colour, pin; saves when you close it
function noteEditor(id, onDone) {
  return new Promise(async res => {
    await loadPlan(); if (!FOLDERS.length) FOLDERS = await db.all('folders');
    const n0 = notesOf().find(x => x.id === id); if (!n0) return res(false);
    const n = structuredClone(n0);
    const m = openModal(`<div class="ef-head"><h2>Note</h2><div class="bn-tools"><button class="icon-btn" data-pin title="Pin to the top">${icon('pin')}</button><button class="icon-btn" data-more title="More">${icon('more')}</button></div></div>
      <textarea class="bn-text" rows="7" placeholder="First line is the title…">${esc(n.text || '')}</textarea>
      <div class="tp-row" data-photos></div>
      <div class="ef-rows"><button class="ef-row" data-subj><span class="ef-ic"><i class="sdot"></i></span><span class="ef-k">Subject</span><span class="ef-v" data-subjv></span>${icon('chev')}</button></div>
      <div class="bn-colors">${NOTE_COLORS.map(([c, l]) => `<button class="bn-col${(n.color || '') === c ? ' on' : ''}" data-col="${c}" title="${l}" style="--c:${c || 'var(--surface-2)'}">${c ? '' : '∅'}</button>`).join('')}</div>
      <div class="modal-actions"><button class="btn primary" data-close>Done</button></div>`, 'small ef bn-ed');
    const ta = $('.bn-text', m.el);
    ta.addEventListener('keydown', e => e.stopPropagation());
    const draw = () => {
      $('[data-pin]', m.el).classList.toggle('on', !!n.pinned);
      const s = subjInfo(n.folderId && folderById(n.folderId) ? n.folderId : 'general'); $('[data-subjv]', m.el).textContent = s.name; $('[data-subj] .sdot', m.el).style.background = s.color;
      $$('[data-col]', m.el).forEach(b => b.classList.toggle('on', b.dataset.col === (n.color || '')));
      drawThumbs($('[data-photos]', m.el), n.imgs || []);
    };
    m.el.addEventListener('click', guard(async e => {
      const c = s => e.target.closest(s);
      if (c('[data-pin]')) { n.pinned = !n.pinned; draw(); }
      if (c('[data-col]')) { n.color = c('[data-col]').dataset.col || undefined; draw(); }
      if (c('[data-subj]')) { const k = await subjectPicker(n.folderId || ''); if (k !== null) { n.folderId = k && !k.startsWith('tag:') ? k : null; draw(); } }
      if (c('[data-tadd]')) { const files = await pickFiles('image/*', true); if (files?.length) { n.imgs = [...(n.imgs || []), ...await addTaskPhotos(files)]; draw(); } }
      const th = c('[data-tk]'); if (th) photoViewer(th.dataset.tk, () => { n.imgs = n.imgs.filter(k => k !== th.dataset.tk); db.del('blobs', th.dataset.tk); draw(); });
      if (c('[data-more]')) {
        const v = await menu('Note', [{ label: 'Make it a task', value: 'task', icon: 'check', hint: 'Adds it to your Planner with no date (the note stays)' }, { label: 'Delete note', value: 'del', icon: 'trash', danger: true }]);
        if (v === 'task') { n.text = ta.value; await loadPlan(); const imgs = [];   // the task gets its own copies, so deleting one never breaks the other
          for (const k of n.imgs || []) { const bl = await db.get('blobs', k); if (bl instanceof Blob) { const k2 = 'tim_' + uid(); await db.put('blobs', bl, k2); imgs.push(k2); } }
          PLAN.tasks.push({ id: uid(), text: noteTitle(n) || 'Note', note: noteBody(n), folderId: n.folderId || null, due: '', done: false, ...(imgs.length ? { imgs } : {}) }); await savePlan(); toast('Added to your Planner', 1500); }
        if (v === 'del' && await confirmBox('Delete this note?')) { n.deleted = true; m.close(); }
      }
    }));
    m.onClose = guard(async () => {
      await loadPlan(); const list = notesOf(), i = list.findIndex(x => x.id === id);
      n.text = ta.value.trim();
      const empty = !n.text && !(n.imgs || []).length;
      if (n.deleted || empty) { for (const k of new Set([...(i >= 0 ? list[i].imgs || [] : []), ...(n.imgs || [])])) db.del('blobs', k); if (i >= 0) list.splice(i, 1); }
      else { delete n.deleted; if (JSON.stringify(n) !== JSON.stringify(list[i])) n.updated = Date.now(); if (i >= 0) list[i] = n; else list.push(n); }
      await savePlan(); onDone?.(); res(true);
    });
    draw(); if (!n.text && !(n.imgs || []).length) ta.focus();
  });
}

// pinch, drag, double-tap (and ctrl/trackpad wheel) zoom for a picture inside a box
function zoomable(stage, img, { onSwipe } = {}) {
  let s = 1, x = 0, y = 0, g = null, lastTap = 0;
  const pts = new Map();
  // the picture always fills the box (small photos are scaled up too), keeping its shape
  const fit = () => { const r = stage.getBoundingClientRect(), nw = img.naturalWidth, nh = img.naturalHeight; if (!nw || !r.width) return; const k = Math.min(r.width / nw, r.height / nh); img.style.width = nw * k + 'px'; img.style.height = nh * k + 'px'; img.style.maxWidth = img.style.maxHeight = 'none'; clamp(); apply(); };
  const apply = () => { img.style.transform = `translate(${x}px, ${y}px) scale(${s})`; stage.classList.toggle('zoomed', s > 1.01); stage.dispatchEvent(new Event('zoomchange')); };
  const clamp = () => {
    s = Math.min(6, Math.max(1, s)); if (s <= 1.01) { s = 1; x = 0; y = 0; return; }
    const r = stage.getBoundingClientRect(), mx = Math.max(0, (img.offsetWidth * s - r.width) / 2), my = Math.max(0, (img.offsetHeight * s - r.height) / 2);
    x = Math.min(mx, Math.max(-mx, x)); y = Math.min(my, Math.max(-my, y));
  };
  const zoomAt = (ns, cx, cy) => { const r = stage.getBoundingClientRect(), px = cx - r.left - r.width / 2, py = cy - r.top - r.height / 2; ns = Math.min(6, Math.max(1, ns)); x = px - (px - x) * ns / s; y = py - (py - y) * ns / s; s = ns; clamp(); apply(); };
  const start = () => {
    const p = [...pts.values()];
    if (p.length >= 2) { const [a, b] = p; g = { pinch: true, d: Math.hypot(a.x - b.x, a.y - b.y) || 1, s, x, y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
    else if (p.length === 1) g = { pinch: false, sx: p[0].x, sy: p[0].y, x, y, moved: false };
    else g = null;
  };
  stage.addEventListener('pointerdown', e => { if (e.button > 0) return; try { stage.setPointerCapture(e.pointerId); } catch {} pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); start(); });
  stage.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !g) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = [...pts.values()];
    if (g.pinch && p.length >= 2) {
      const [a, b] = p, d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, r = stage.getBoundingClientRect();
      const ns = Math.min(6, Math.max(1, g.s * d / g.d)), px = g.mx - r.left - r.width / 2, py = g.my - r.top - r.height / 2;
      x = px - (px - g.x) * ns / g.s + (mx - g.mx); y = py - (py - g.y) * ns / g.s + (my - g.my); s = ns; clamp(); apply();
    } else if (!g.pinch) {
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy; if (Math.hypot(dx, dy) > 6) g.moved = true;
      if (s > 1) { x = g.x + dx; y = g.y + dy; clamp(); apply(); }
    }
  });
  const end = e => {
    if (!pts.has(e.pointerId)) return; const was = g; pts.delete(e.pointerId);
    if (was && !was.pinch && pts.size === 0) {
      const dx = e.clientX - was.sx, dy = e.clientY - was.sy;
      if (!was.moved) { const now = Date.now(); if (now - lastTap < 300) { lastTap = 0; if (s > 1) { s = 1; clamp(); apply(); } else zoomAt(2.5, e.clientX, e.clientY); } else lastTap = now; }
      else if (s === 1 && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe?.(dx < 0 ? 1 : -1);
    }
    start();
  };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  stage.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey || e.metaKey) zoomAt(s * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY); else if (s > 1) { x -= e.deltaX; y -= e.deltaY; clamp(); apply(); } }, { passive: false });
  img.addEventListener('load', fit); if (img.complete) fit();
  new ResizeObserver(fit).observe(stage);
  return { reset() { s = 1; x = 0; y = 0; apply(); }, get scale() { return s; } };
}

// tapping a note with a photo shows the photo full screen; Edit opens the note
async function noteViewer(id, onDone) {
  await loadPlan(); if (!FOLDERS.length) FOLDERS = await db.all('folders');
  const n = notesOf().find(x => x.id === id); if (!n) return;
  if (!n.imgs?.length) return noteEditor(id, onDone);
  const imgs = [...n.imgs]; let i = 0, url = '';
  const v = document.createElement('div'); v.className = 'nviewer';
  const subj = n.folderId && folderById(n.folderId);
  v.innerHTML = `<div class="nv-top"><button class="nv-btn" data-x title="Close">${icon('x')}</button><span class="nv-count"></span><button class="nv-btn nv-edit" data-edit>${icon('edit')}<span>Edit</span></button></div>
    <div class="nv-stage"><img alt="" draggable="false"><span class="nv-miss" hidden>Photo still syncing…</span></div>
    <button class="nv-nav prev" data-prev title="Previous">‹</button><button class="nv-nav next" data-next title="Next">›</button>
    <div class="nv-cap">${noteTitle(n) ? `<b>${esc(noteTitle(n))}</b>` : ''}${noteBody(n) ? `<span>${esc(noteBody(n))}</span>` : ''}${subj ? `<small><i style="--c:${esc(subj.color || S.accent)}"></i>${esc(subj.name)}</small>` : ''}</div>`;
  document.body.appendChild(v);
  const stage = $('.nv-stage', v), img = $('img', stage), cap = $('.nv-cap', v);
  if (!cap.innerHTML.trim()) cap.remove();
  const show = async k => {
    if (k < 0 || k >= imgs.length) return; i = k;
    $('.nv-count', v).textContent = imgs.length > 1 ? `${i + 1} of ${imgs.length}` : '';
    $('[data-prev]', v).hidden = i === 0; $('[data-next]', v).hidden = i === imgs.length - 1;
    const b = await db.get('blobs', imgs[i]); if (url) URL.revokeObjectURL(url); url = '';
    $('.nv-miss', v).hidden = b instanceof Blob; img.hidden = !(b instanceof Blob);
    if (b instanceof Blob) { url = URL.createObjectURL(b); img.src = url; }
    z.reset();
  };
  const z = zoomable(stage, img, { onSwipe: d => show(i + d) });
  stage.addEventListener('zoomchange', () => v.classList.toggle('zoomed', z.scale > 1.01));
  const close = () => { if (!v.isConnected) return; v.remove(); if (url) URL.revokeObjectURL(url); document.removeEventListener('keydown', key, true); };
  const key = e => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight') show(i + 1); else if (e.key === 'ArrowLeft') show(i - 1);
  };
  document.addEventListener('keydown', key, true);
  v.addEventListener('click', e => {
    const c = s => e.target.closest(s);
    if (c('[data-x]')) close();
    else if (c('[data-edit]')) { close(); guard(noteEditor)(id, onDone); }
    else if (c('[data-prev]')) show(i - 1); else if (c('[data-next]')) show(i + 1);
    else if (c('.nv-cap')) cap.classList.toggle('open');
  });
  await show(0);
}
const openNote = (id, onDone) => guard(noteViewer)(id, onDone);

// the home page gets its own Board strip: pinned and newest notes, a New note tile and See all
async function homeBoard() {
  await loadPlan();
  const box = $('#libContent'); if (LIB.view !== 'home' || LIB.q.trim() || !box || box.querySelector('.home-board')) return;
  const all = notesOf(), list = sortNotes([...all]).slice(0, 10);
  const sec = document.createElement('div'); sec.className = 'home-board';
  sec.innerHTML = `<h3 class="lib-sec"><span>Board</span>${all.length ? `<button class="lib-more" data-allnotes>${all.length > list.length ? `See all ${all.length}` : 'Open'}</button>` : ''}</h3>
    <div class="hb-strip"><button class="hb-add" data-hbadd>${icon('plus')}<span>${all.length ? 'New note' : 'Add a note with no date'}</span></button>${list.map(n => noteCard(n, true)).join('')}</div>`;
  const heads = box.querySelectorAll(':scope > h3.lib-sec'), nbHead = heads[heads.length - 1];
  nbHead ? nbHead.before(sec) : box.prepend(sec);
  fillNoteImages(sec);
  sec.addEventListener('click', guard(async e => {
    const c = s => e.target.closest(s);
    if (c('[data-allnotes]')) { LIB.view = 'board'; return showLibrary(); }
    if (c('[data-hbadd]')) { LIB.view = 'board'; await showLibrary(); return $('[data-bnew]')?.focus(); }
    const card = c('[data-note]'); if (card) openNote(card.dataset.note, () => showLibrary());
  }));
}

function bootBoard() {
  // sidebar (iPad) and title
  $('[data-view="planner"]')?.insertAdjacentHTML('afterend', `<button data-view="board"><span data-icon="board">${icon('board')}</span>Board</button>`);
  const _rc = renderCrumbs;
  renderCrumbs = function () { if (LIB.view === 'board' && !LIB.q.trim()) { $('#crumbs').innerHTML = `<span class="crumb cur">Board</span>`; return; } return _rc(); };
  const _rlc = renderLibContent;
  renderLibContent = function () { if (LIB.view === 'board') { updateTabbar?.(); return renderBoard($('#libContent')); } const r = _rlc(); if (LIB.view === 'home' && !LIB.q.trim()) homeBoard(); return r; };
  // the iPhone tab bar gets a Board tab
  const tb = $('#tabbar'); if (tb && !tb.querySelector('[data-pv="board"]')) {
    tb.querySelector('[data-pv="planner"]')?.insertAdjacentHTML('afterend', `<button data-pv="board">${icon('board')}<span>Board</span></button>`);
    tb.addEventListener('click', e => { const b = e.target.closest('[data-pv="board"]'); if (!b) return; e.stopImmediatePropagation(); LIB.view = 'board'; LIB.folderId = null; LIB.q = ''; showLibrary(); }, true);
  }
  PHONE_VIEWS.board = 'board';
  // pinned notes on the iPhone's Today screen, under the "things due" card
  const _rt = renderToday;
  renderToday = async function (box) {
    await _rt(box);
    const pins = sortNotes(notesOf().filter(n => n.pinned)).slice(0, 4); if (!pins.length) return;
    const sec = document.createElement('div'); sec.className = 'td-pins';
    sec.innerHTML = `<div class="td-sec">Pinned</div><div class="board-grid">${pins.map(n => noteCard(n, true)).join('')}</div>`;
    const focus = box.querySelector('.td-focus'); focus ? focus.after(sec) : box.querySelector('.today')?.appendChild(sec);
    fillNoteImages(sec);
    sec.addEventListener('click', e => { const c = e.target.closest('[data-note]'); if (c) { e.stopPropagation(); openNote(c.dataset.note, () => showLibrary()); } });
  };
  // library search also finds board notes
  const _rs = renderSearch;
  renderSearch = async function (q) {
    await _rs(q); await loadPlan();
    const ql = q.toLowerCase(), hits = notesOf().filter(n => (n.text || '').toLowerCase().includes(ql));
    if (!hits.length) return;
    const sec = document.createElement('div'); sec.innerHTML = `<h3 class="lib-sec">On your board</h3><div class="board-grid">${hits.slice(0, 12).map(n => noteCard(n)).join('')}</div>`;
    $('#libContent').prepend(sec); fillNoteImages(sec);
    sec.addEventListener('click', e => { const c = e.target.closest('[data-note]'); if (c) openNote(c.dataset.note, () => showLibrary()); });
  };
}
