'use strict';
/* =====================================================================
   Inkbook v7 — easier organizing:
   • a quick panel for any lesson/topic (rename, color, type, move heading, move with pages…)
   • drag a lesson/topic tab onto any page
   • press-and-hold to drag pages and lessons/topics in the sidebar
   Loaded after extras.js.
   ===================================================================== */

const refreshSections = async () => { await saveNb(); buildPages(); renderEdSide(); updateInd(); };
function secAnchor(s) {
  return $(`.ptab[data-sid="${s.id}"]`) || $(`#sideBody [data-smenu="${s.id}"]`) || $('#pageInd');
}

// ---------- Quick panel ----------
function sectionPopover(s, anchor) {
  if (!s) return;
  openPopover(anchor || secAnchor(s), 'section', box => drawSecPop(box, s));
}
function drawSecPop(box, s) {
  const list = secList(), e = list.find(x => x.s === s);
  if (!e) { closePopover(); return; }
  const [a, b] = secRange(e, list), lv = s.level || 1, cur = currentIndex(), n = b - a;
  box.innerHTML = `<div class="pop-title">${lv === 2 ? 'Topic' : 'Lesson'}</div>
    <input type="text" class="sp-title" value="${esc(s.title)}" placeholder="Title">
    <div class="sp-row"><div class="seg sp-type">${segHtml([[1, 'Lesson'], [2, 'Topic']], lv)}</div></div>
    <div class="opt-row sp-colors">${COVER_COLORS.slice(0, 9).map(c => `<button class="swatch${c === s.color ? ' on' : ''}" style="--c:${c}" data-c="${c}"></button>`).join('')}</div>
    <div class="sp-block">
      <div class="opt-label">Heading starts on</div>
      <div class="stepper"><button class="icon-btn" data-st="-1" title="Earlier page">${icon('back')}</button>
        <div class="st-val"><b>Page ${a + 1}</b><span>of ${E.pages.length}</span></div>
        <button class="icon-btn fwd" data-st="1" title="Later page">${icon('back')}</button>
        ${cur !== a ? `<button class="chip" data-here>Page ${cur + 1} (here)</button>` : ''}</div>
      <p class="opt-hint">Moves just the heading, so your pages stay in order. You can also drag the tab onto any page.</p>
    </div>
    <div class="sp-block">
      <div class="opt-label">Move it with its ${n} page${n > 1 ? 's' : ''}</div>
      <div class="sp-row"><button class="chip" data-mv="-1">${icon('up')}Up</button><button class="chip" data-mv="1">${icon('down')}Down</button>
        <span class="opt-hint" style="margin:0">or press and hold it in the Outline to drag</span></div>
    </div>
    <div class="sp-actions">
      <button class="chip" data-go>${icon('go')}Go to</button>
      ${lv === 1 ? `<button class="chip" data-addtopic>${icon('plus')}Topic</button>` : ''}
      <button class="chip" data-addp>${icon('addpage')}Page</button>
      <button class="chip" data-rm>Remove heading</button>
      <button class="chip danger" data-del>${icon('trash')}Delete…</button>
    </div>`;
  const reanchor = () => { if (!pop) return; const an = secAnchor(s); pop._anchor = an; drawSecPop(box, s); placePopover(an); };
  const title = $('.sp-title', box);
  title.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') title.blur(); });
  title.addEventListener('change', async () => { const v = title.value.trim(); if (v && v !== s.title) { s.title = v; await refreshSections(); reanchor(); } });
  wireSeg($('.sp-type', box), async v => { s.level = +v; await refreshSections(); reanchor(); });
  box.onclick = guard(async ev => {
    const t = ev.target.closest('button'); if (!t) return;
    const d = t.dataset;
    if (d.c) { s.color = d.c; await refreshSections(); return reanchor(); }
    if (d.st) {
      const ni = clamp(a + +d.st, 0, E.pages.length - 1); if (ni === a) return;
      s.pageId = E.pages[ni].id; await refreshSections(); scrollToPage(ni, true); return reanchor();
    }
    if ('here' in d) { s.pageId = E.pages[cur].id; await refreshSections(); return reanchor(); }
    if (d.mv) { await moveSection(s, +d.mv); return reanchor(); }
    closePopover();
    if ('go' in d) { scrollToPage(a, true); closeSideIfOverlay(); }
    if ('addtopic' in d) await addTopicTo(s.id);
    if ('addp' in d) {
      const last = E.pages[b - 1], p = newPage(E.nb, last && !last.bgKey ? { template: last.template, paperColor: last.paperColor, w: last.w, h: last.h } : {});
      E.pages.splice(b, 0, p); E.byId.set(p.id, p); await db.put('pages', p); await refreshSections(); scrollToPage(b, true);
    }
    if ('rm' in d) { E.nb.sections = E.nb.sections.filter(x => x !== s); await refreshSections(); toast('Heading removed. Your pages are kept.'); }
    if ('del' in d && await confirmBox(`Delete “${s.title}” and its ${n} page${n > 1 ? 's' : ''}? This can’t be undone.`)) await deletePages(a, b);
  });
}

// ---------- Moving with pages: to an exact position (used by drag & drop) ----------
async function movePageTo(from, to) {
  if (to > from) to--;
  if (to === from || to < 0) return;
  const [pg] = E.pages.splice(from, 1); E.pages.splice(to, 0, pg);
  await refreshSections(); scrollToPage(to, true); toast(`Page moved to position ${to + 1}`, 1400);
}
async function moveSectionTo(s, target, after) {
  const list = secList(), e = list.find(x => x.s === s); if (!e) return;
  const lv = s.level || 1, [a, b] = secRange(e, list);
  const lessons = list.filter(x => (x.s.level || 1) === 1), lessonAt = i => lessons.filter(x => x.i <= i).pop();
  if (lv === 2) { const my = lessonAt(a); if (my && my.i === a) return toast('This topic shares its first page with the lesson. Move its heading to another page first.', 4000); }
  let dest;
  if (target === 'end') dest = E.pages.length;
  else {
    const te = list.find(x => x.s === target); if (!te || target === s) return;
    const tlv = target.level || 1;
    if (lv === 1) { const tl = tlv === 1 ? te : lessonAt(te.i); if (!tl) return; dest = after ? secRange(tl, list)[1] : tl.i; }
    else if (tlv === 2) dest = after ? secRange(te, list)[1] : te.i;
    else { const first = list.find(x => x.s.level === 2 && x.i > te.i && lessonAt(x.i) === te); dest = first && !after ? first.i : secRange(te, list)[1]; }
  }
  if (dest > a && dest <= b) return;                         // dropped onto itself
  const block = E.pages.slice(a, b), rest = [...E.pages.slice(0, a), ...E.pages.slice(b)];
  rest.splice(dest > a ? dest - (b - a) : dest, 0, ...block); E.pages = rest;
  await refreshSections(); scrollToPage(E.pages.indexOf(block[0]), true); toast('Moved', 1000);
}

// ---------- Drag a lesson/topic tab onto another page ----------
function pageAtPoint(x, y) { return document.elementsFromPoint(x, y).map(el => el.closest?.('.page')).find(Boolean) || null; }
function bootTabDrag() {
  pagesEl.addEventListener('pointerdown', e => {
    const tab = e.target.closest('.ptab'); if (!tab) return;
    e.preventDefault(); e.stopPropagation();
    const s = E.nb.sections.find(x => x.id === tab.dataset.sid); if (!s) return;
    const sx = e.clientX, sy = e.clientY; let ghost = null, over = null;
    const mv = ev => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return;
        ghost = tab.cloneNode(true); ghost.classList.add('drag-ghost'); document.body.appendChild(ghost); tab.classList.add('lifted');
      }
      ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
      const pg = pageAtPoint(ev.clientX, ev.clientY);
      if (pg !== over) { over?.classList.remove('drop-target'); over = pg; over?.classList.add('drop-target'); }
      const r = scroller.getBoundingClientRect();
      if (ev.clientY < r.top + 50) scroller.scrollTop -= 14; else if (ev.clientY > r.bottom - 50) scroller.scrollTop += 14;
    };
    const up = guard(async ev => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (!ghost) return sectionPopover(s, tab);              // a tap opens the quick panel
      ghost.remove(); tab.classList.remove('lifted'); over?.classList.remove('drop-target');
      const pg = ev.type === 'pointerup' && pageAtPoint(ev.clientX, ev.clientY); if (!pg) return;
      const i = E.pages.findIndex(p => p.id === pg.dataset.id);
      if (i >= 0 && s.pageId !== pg.dataset.id) { s.pageId = pg.dataset.id; await refreshSections(); toast(`“${s.title}” now starts on page ${i + 1}`); }
    });
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }, true);
}

// ---------- Press-and-hold to drag in the sidebar (pages grid and outline) ----------
let sideDrag = null, sideJustDragged = false;
function bootSideDrag() {
  const body = $('#sideBody');
  body.addEventListener('touchmove', e => { if (sideDrag) e.preventDefault(); }, { passive: false });
  body.addEventListener('click', e => { if (sideJustDragged) { e.stopPropagation(); e.preventDefault(); } }, true);
  body.addEventListener('contextmenu', e => { if (e.target.closest('.pg-card, .les-head, .tp-row')) e.preventDefault(); });
  body.addEventListener('pointerdown', e => {
    if (e.button > 0 || sideDrag) return;
    const item = e.target.closest('.pg-card, .les-head, .tp-row');
    if (!item || e.target.closest('.mini-more, .pg-more, .add-topic')) return;
    const sx = e.clientX, sy = e.clientY;
    const timer = setTimeout(() => { cleanup(); startSideDrag(item, sx, sy); }, e.pointerType === 'mouse' ? 220 : 320);
    const early = ev => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) { clearTimeout(timer); cleanup(); } };
    const cancel = () => { clearTimeout(timer); cleanup(); };
    const cleanup = () => { removeEventListener('pointermove', early); removeEventListener('pointerup', cancel); removeEventListener('pointercancel', cancel); };
    addEventListener('pointermove', early); addEventListener('pointerup', cancel); addEventListener('pointercancel', cancel);
  });
}
function startSideDrag(item, x, y) {
  const body = $('#sideBody'), kind = item.classList.contains('pg-card') ? 'page' : 'sec';
  const r = item.getBoundingClientRect();
  const ghost = item.cloneNode(true); ghost.classList.add('drag-ghost', 'side-ghost');
  ghost.style.width = r.width + 'px'; document.body.appendChild(ghost);
  if (kind === 'page') { const src = $('canvas', item), dst = $('canvas', ghost); if (src && dst) dst.getContext('2d').drawImage(src, 0, 0); }
  item.classList.add('lifted'); body.classList.add('dragging');
  if (kind === 'sec') body.insertAdjacentHTML('beforeend', '<div class="out-end" data-end>Drop here to move to the end</div>');
  sideDrag = { item, kind, ghost, target: null, after: false, ox: x - r.left, oy: y - r.top };
  const place = (cx, cy) => { ghost.style.left = cx - sideDrag.ox + 'px'; ghost.style.top = cy - sideDrag.oy + 'px'; };
  place(x, y);
  let scrollV = 0; const tick = setInterval(() => { if (scrollV) body.scrollTop += scrollV; }, 16);
  const mv = ev => {
    place(ev.clientX, ev.clientY);
    const br = body.getBoundingClientRect();
    scrollV = ev.clientY < br.top + 50 ? -10 : ev.clientY > br.bottom - 50 ? 10 : 0;
    const el = document.elementsFromPoint(ev.clientX, ev.clientY).find(n => n !== ghost && !ghost.contains(n) &&
      (kind === 'page' ? n.closest?.('.pg-card') : n.closest?.('.les-head, .tp-row, .out-end')));
    const t = el && (kind === 'page' ? el.closest('.pg-card') : el.closest('.les-head, .tp-row, .out-end'));
    $$('.drop-before, .drop-after, .drop-on', body).forEach(n => n.classList.remove('drop-before', 'drop-after', 'drop-on'));
    sideDrag.target = t && t !== item ? t : null;
    if (sideDrag.target) {
      const tr = sideDrag.target.getBoundingClientRect();
      sideDrag.after = kind === 'page' ? ev.clientX > tr.left + tr.width / 2 : ev.clientY > tr.top + tr.height / 2;
      sideDrag.target.classList.add(sideDrag.target.matches('.out-end') ? 'drop-on' : sideDrag.after ? 'drop-after' : 'drop-before');
    }
  };
  const up = guard(async () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); clearInterval(tick);
    const d = sideDrag; sideDrag = null; ghost.remove(); item.classList.remove('lifted'); body.classList.remove('dragging'); $('.out-end', body)?.remove();
    sideJustDragged = true; setTimeout(() => (sideJustDragged = false), 50);
    if (!d.target) return;
    if (kind === 'page') return movePageTo(+item.dataset.pi, +d.target.dataset.pi + (d.after ? 1 : 0));
    const idOf = n => n.querySelector('[data-smenu]')?.dataset.smenu;
    const s = E.nb.sections.find(x => x.id === idOf(item));
    const target = d.target.matches('.out-end') ? 'end' : E.nb.sections.find(x => x.id === idOf(d.target));
    if (s && target) await moveSectionTo(s, target, d.after);
  });
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

function bootOrganize() {
  bootTabDrag(); bootSideDrag();
  // a short hint in the Pages and Outline tabs
  const orig = renderEdSide;
  renderEdSide = async function () {
    await orig.apply(this, arguments);
    const body = $('#sideBody'); if (!S.sideOpen || !body) return;
    if ((S.sideTab === 'pages' || (S.sideTab === 'outline' && secList().length > 1)) && !$('.drag-hint', body))
      body.insertAdjacentHTML('afterbegin', `<div class="drag-hint">Press and hold ${S.sideTab === 'pages' ? 'a page' : 'a lesson or topic'} to drag it</div>`);
  };
}
