'use strict';
/* =====================================================================
   Inkbook v4 — action sheets & dialogs, lesson/topic tabs & moving,
   Find (typed text + handwriting + PDF text), save selection as image.
   Loaded after features.js.
   ===================================================================== */

Object.assign(ICONS, {
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  pin: '<path d="M12 22s-7-6.2-7-12a7 7 0 0114 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  warn: '<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  go: '<path d="M5 12h14M13 5l7 7-7 7"/>',
});

// =====================================================================
// Action sheets & dialogs (replaces the plain menus)
// =====================================================================
const MENU_ICONS = {
  open: 'go', go: 'go', star: 'star', cover: 'palette', edit: 'edit', ren: 'edit', move: 'folder', dup: 'copy', pdf: 'export', docx: 'file',
  del: 'trash', nb: 'plus', folder: 'folder', sub: 'folder', import: 'download', convert: 'convert', addp: 'addpage', up: 'up', down: 'down',
  rm: 'x', start: 'pin', bm: 'bookmark', sec: 'layers', type: 'tpl', topic: 'plus', recent: 'clock', name: 'text', created: 'clock', __root: 'home',
};
function menu(title, items) {
  return new Promise(res => {
    const groups = [[]];
    items.forEach((it, i) => { if (it.head) groups.push([{ head: it.head }]); else groups.at(-1).push({ ...it, i }); });
    const row = it => it.head ? `<div class="sheet-head">${esc(it.head)}</div>`
      : `<button class="sheet-row${it.danger ? ' danger' : ''}" data-i="${it.i}"><span class="sr-ic">${icon(it.icon || MENU_ICONS[it.value] || 'go')}</span>
         <span class="sr-txt">${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</span></button>`;
    const m = openModal(`${title ? `<div class="sheet-title">${esc(title)}</div>` : ''}
      ${groups.filter(g => g.length).map(g => `<div class="sheet-group">${g.map(row).join('')}</div>`).join('')}
      <button class="sheet-cancel" data-close>Cancel</button>`, 'sheet');
    let v = null;
    m.el.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) { v = items[+b.dataset.i].value; m.close(); } });
    m.onClose = () => res(v);
  });
}
function confirmBox(msg, ok = 'Delete') {
  return new Promise(res => {
    const m = openModal(`<div class="confirm-ic">${icon('warn')}</div><p class="confirm-msg">${esc(msg)}</p>
      <div class="confirm-actions"><button class="btn danger" data-ok>${esc(ok)}</button><button class="btn" data-close>Cancel</button></div>`, 'small confirm');
    let v = false; $('[data-ok]', m.el).onclick = () => { v = true; m.close(); }; m.onClose = () => res(v);
  });
}

// =====================================================================
// Lessons & topics — compact tabs on top of the page (they can stack)
// =====================================================================
function tabHtml(s, no) {
  const topic = s.level === 2;
  return `<button class="ptab ${topic ? 'tp' : 'ls'}" data-sid="${s.id}" data-pop-anchor style="--c:${esc(s.color || S.accent)}" title="${topic ? 'Topic' : 'Lesson'}: tap for options, drag onto another page to move">` +
    `${topic ? '<i></i>' : `<b>${no || ''}</b>`}<span>${esc(s.title)}</span></button>`;
}
async function sectionMenu(s) {
  if (!s) return;
  const list = secList(), e = list.find(x => x.s === s); if (!e) return;
  const [a, b] = secRange(e, list), cur = currentIndex(), lv = s.level || 1, noun = lv === 2 ? 'topic' : 'lesson';
  const v = await menu(s.title, [
    { label: 'Go to', value: 'go', hint: `Page ${a + 1}` },
    { label: 'Rename, color & type', value: 'edit' },
    ...(lv === 1 ? [{ label: 'Add a topic to this lesson', value: 'topic' }] : []),
    { label: `Add a page at the end of this ${noun}`, value: 'addp' },
    { head: 'Arrange' },
    { label: `Move ${noun} up`, value: 'up', hint: lv === 2 ? 'Topics can move into the lesson before' : 'Swaps with the lesson before, topics included' },
    { label: `Move ${noun} down`, value: 'down', hint: lv === 2 ? 'Topics can move into the lesson after' : 'Swaps with the lesson after, topics included' },
    ...(cur !== a ? [{ label: `Start it on the page you're on (p. ${cur + 1})`, value: 'start', hint: 'Lessons and topics can share a page' }] : []),
    { head: 'Remove' },
    { label: 'Remove the heading, keep the pages', value: 'rm' },
    { label: `Delete it with its ${b - a} page${b - a > 1 ? 's' : ''}`, value: 'del', danger: true },
  ]);
  if (v === 'go') { scrollToPage(a, true); closeSideIfOverlay(); }
  if (v === 'edit') { const r = await sectionForm(s); if (r) { Object.assign(s, { title: r.title, level: r.level, color: r.color }); await saveNb(); buildPages(); renderEdSide(); updateInd(); } }
  if (v === 'topic') await addTopicTo(s.id);
  if (v === 'addp') {
    const last = E.pages[b - 1], p = newPage(E.nb, last && !last.bgKey ? { template: last.template, paperColor: last.paperColor, w: last.w, h: last.h } : {});
    E.pages.splice(b, 0, p); E.byId.set(p.id, p); await db.put('pages', p); await saveNb(); buildPages(); scrollToPage(b, true); renderEdSide();
  }
  if (v === 'up' || v === 'down') await moveSection(s, v === 'up' ? -1 : 1);
  if (v === 'start') { s.pageId = E.pages[cur].id; await saveNb(); buildPages(); renderEdSide(); updateInd(); toast(`Now starts on page ${cur + 1}`); }
  if (v === 'rm') { E.nb.sections = E.nb.sections.filter(x => x !== s); await saveNb(); buildPages(); renderEdSide(); updateInd(); }
  if (v === 'del' && await confirmBox(`Delete “${s.title}” and its ${b - a} page(s)? This can’t be undone.`)) await deletePages(a, b);
}
// Moves the lesson/topic together with its pages. Topics can cross into the neighbouring lesson.
async function moveSection(s, dir) {
  const list = secList(), e = list.find(x => x.s === s), lv = s.level || 1, [a, b] = secRange(e, list);
  const lessons = list.filter(x => (x.s.level || 1) === 1), lessonAt = i => lessons.filter(x => x.i <= i).pop();
  let dest = null;
  if (lv === 1) {
    if (dir < 0) { const prev = lessons.filter(x => x.i < a).pop(); if (prev) dest = prev.i; }
    else { const next = lessons.find(x => x.i >= b); if (next) dest = secRange(next, list)[1]; }
  } else {
    const my = lessonAt(a);
    if (my && my.i === a) return toast('This topic shares its first page with the lesson. Use “Start it on the page you’re on” to give it its own page first.', 4500);
    const topics = list.filter(x => x.s.level === 2 && x.s !== s);
    if (dir < 0) {
      const prev = topics.filter(x => x.i < a).pop();
      if (prev && lessonAt(prev.i) === my) dest = prev.i;                       // swap with the topic above
      else if (my && lessons.some(x => x.i < my.i)) dest = my.i;               // move to the end of the previous lesson
    } else {
      const next = topics.find(x => x.i >= b);
      const nextLesson = lessons.find(x => x.i >= b);
      if (next && lessonAt(next.i) === my && (!nextLesson || next.i < nextLesson.i)) dest = secRange(next, list)[1];   // swap with the topic below
      else if (nextLesson) {                                                    // become the first topic of the next lesson
        const first = topics.find(x => x.i > nextLesson.i && lessonAt(x.i) === nextLesson);
        dest = first ? first.i : secRange(nextLesson, list)[1];
      }
    }
  }
  if (dest == null) return toast(`It can’t move further ${dir < 0 ? 'up' : 'down'}`);
  const block = E.pages.slice(a, b), rest = [...E.pages.slice(0, a), ...E.pages.slice(b)];
  rest.splice(dest > a ? dest - (b - a) : dest, 0, ...block); E.pages = rest;
  await saveNb(); buildPages(); renderEdSide(); updateInd();
  scrollToPage(E.pages.indexOf(block[0]), true); toast(`Moved ${dir < 0 ? 'up' : 'down'}`, 1200);
}

// =====================================================================
// Save the selection as a picture (Share → Save Image puts it in Photos)
// =====================================================================
async function saveSelectionImage() {
  const s = E.sel; if (!s) return;
  const p = s.page, b = s.box; await preloadPage(p);
  const bw = Math.max(20, b[2] - b[0]), bh = Math.max(20, b[3] - b[1]), sc = Math.min(4, 3200 / Math.max(bw, bh));
  const c = document.createElement('canvas'); c.width = Math.round(bw * sc); c.height = Math.round(bh * sc);
  const ctx = c.getContext('2d'); ctx.fillStyle = p.paperColor || '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  renderPage(ctx, p, sc, { texts: true, sync: true, ox: b[0], oy: b[1] });
  const blob = await new Promise(r => c.toBlob(r, 'image/png')); c.width = c.height = 0;
  readyToShare(blob, `${safeName(E.nb.title)} - selection.png`, 'Tap “Share / Save…” then “Save Image” to put it in your Photos, or send it anywhere.');
}

// =====================================================================
// Find (⌘F): typed text, PDF text and handwriting (read on-device)
// =====================================================================
const TESS = {
  js: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  worker: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
  core: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
  lang: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',
};
let ocrWorkerP = null, ocrRunning = false, ocrFailed = false;
const F = { open: false, q: '', hits: [], cur: -1 };
function getOcr() {
  return ocrWorkerP ||= (async () => {
    await loadScript(TESS.js);
    return window.Tesseract.createWorker('eng', 1, { workerPath: TESS.worker, corePath: TESS.core, langPath: TESS.lang });
  })().catch(e => { ocrWorkerP = null; throw e; });
}
const needsOcr = p => p.strokes.some(st => st.t === 'pen') || (p.bgKey && !p.pdfWords) || p.images.length ? p.ocr?.rev !== (p.rev || 0) : false;
async function ocrPage(p) {
  await preloadPage(p);
  const s = Math.min(1.8, 2200 / p.w, Math.sqrt(9e6 / (p.w * p.h)));
  const c = document.createElement('canvas'); c.width = Math.round(p.w * s); c.height = Math.round(p.h * s);
  // read the ink on plain white paper: no ruled lines, no highlighter, typed text is searched separately
  const view = { ...p, template: 'blank', paperColor: '#ffffff', texts: [], strokes: p.strokes.filter(st => st.t !== 'hl').map(st => ({ ...st, c: isDark(st.c) ? st.c : '#333333' })), bgKey: p.pdfWords ? null : p.bgKey };
  renderPage(c.getContext('2d'), view, s, { sync: true });
  const worker = await getOcr(), rev = p.rev || 0;
  const { data } = await worker.recognize(c); c.width = c.height = 0;
  p.ocr = { rev, words: (data.words || []).filter(w => w.text.trim() && w.confidence > 25).map(w => ({ t: w.text, b: [w.bbox.x0 / s, w.bbox.y0 / s, w.bbox.x1 / s, w.bbox.y1 / s].map(Math.round) })) };
  await db.put('pages', p);
}
async function runOcrQueue() {
  if (ocrRunning || !E.nb) return; ocrRunning = true;
  const nb = E.nb;
  try {
    for (;;) {
      if (E.nb !== nb) break;
      const todo = E.pages.filter(needsOcr); if (!todo.length) break;
      const done = E.pages.length - todo.length;
      setFindStatus(ocrWorkerP ? `Reading handwriting… ${done + 1} of ${E.pages.length} pages` : 'Getting the handwriting reader ready (one-time download, about 7 MB)…');
      try { await ocrPage(todo[0]); }
      catch (e) {
        console.warn(e); ocrFailed = true;
        setFindStatus(navigator.onLine ? 'Couldn’t read handwriting on this device. Typed and PDF text are still searched.' : 'Handwriting search needs a one-time download while online. Typed and PDF text are searched now.');
        break;
      }
      if (F.open) runFind(false);
      await nextFrame();
    }
  } finally { ocrRunning = false; }
  if (!ocrFailed && E.nb === nb) setFindStatus(E.pages.some(p => p.ocr) ? 'Searching handwriting, typed text and PDFs' : '');
}
function setFindStatus(t) { const el = $('#findStatus'); if (el) { el.textContent = t; el.hidden = !t; } }
const normTxt = s => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, '');
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function wordMatch(word, term, last) {
  const w = normTxt(word); if (!w) return false;
  if (w === term || w.includes(term) || (last && w.startsWith(term))) return true;
  // tolerate misread letters in handwriting: 1 for medium words, 2 for long ones
  return term.length >= 5 && lev(w, term) <= (term.length >= 8 ? 2 : 1);
}
function findMatches(q) {
  const ql = normTxt(q).trim(), terms = ql.split(/\s+/).filter(Boolean); if (!terms.length) return [];
  const out = [];
  E.pages.forEach((p, pi) => {
    for (const t of p.texts) if (normTxt(t.text).includes(ql)) out.push({ pi, p, box: textBox(p, t), kind: 'Text' });
    for (const t of p.tables || []) if (t.cells.some(r => r.some(v => normTxt(v).includes(ql)))) out.push({ pi, p, box: tableBox(p, t), kind: 'Table' });
    for (const [words, kind] of [[p.pdfWords || [], 'PDF'], [p.ocr?.words || [], 'Handwriting']]) {
      for (let i = 0; i < words.length; i++) {
        if (!wordMatch(words[i].t, terms[0], terms.length === 1)) continue;
        let ok = true; const box = [...words[i].b];
        for (let k = 1; k < terms.length; k++) {
          const w = words[i + k]; if (!w || !wordMatch(w.t, terms[k], k === terms.length - 1)) { ok = false; break; }
          box[0] = Math.min(box[0], w.b[0]); box[1] = Math.min(box[1], w.b[1]); box[2] = Math.max(box[2], w.b[2]); box[3] = Math.max(box[3], w.b[3]);
        }
        if (ok) out.push({ pi, p, box, kind });
      }
    }
  });
  return out.sort((a, b) => a.pi - b.pi || a.box[1] - b.box[1] || a.box[0] - b.box[0]);
}
function clearHits() { $$('.hit', pagesEl).forEach(h => h.remove()); }
function drawHits() {
  clearHits();
  F.hits.forEach((h, i) => {
    const el = E.els.get(h.p.id); if (!el) return;
    const d = document.createElement('div'); d.className = 'hit' + (i === F.cur ? ' cur' : '');
    d.style.setProperty('--x', h.box[0] - 4); d.style.setProperty('--y', h.box[1] - 3);
    d.style.setProperty('--w', h.box[2] - h.box[0] + 8); d.style.setProperty('--h', h.box[3] - h.box[1] + 6);
    el.appendChild(d);
  });
}
function runFind(jump = true) {
  F.q = $('#findIn').value;
  const prev = F.hits[F.cur];
  F.hits = F.q.trim() ? findMatches(F.q) : [];
  if (prev) { const k = F.hits.findIndex(h => h.p === prev.p && Math.abs(h.box[1] - prev.box[1]) < 5); F.cur = k >= 0 ? k : 0; }
  else F.cur = F.hits.length ? 0 : -1;
  if (jump && F.hits.length) {
    const ci = currentIndex(), k = F.hits.findIndex(h => h.pi >= ci); F.cur = k >= 0 ? k : 0;
  }
  updateFindUi(); drawHits(); if (jump && F.cur >= 0) showHit();
}
function updateFindUi() {
  const n = F.hits.length;
  $('#findCount').textContent = !F.q.trim() ? '' : n ? `${F.cur + 1} of ${n}` : 'No matches';
  $('#findCount').classList.toggle('none', !!F.q.trim() && !n);
  const h = F.hits[F.cur]; $('#findKind').textContent = h ? `${h.kind} · p. ${h.pi + 1}` : '';
}
function showHit() {
  const h = F.hits[F.cur]; if (!h) return;
  const el = E.els.get(h.p.id);
  scroller.scrollTo({ top: el.offsetTop + h.box[1] * E.unit - scroller.clientHeight * 0.35, left: Math.max(0, el.offsetLeft + ((h.box[0] + h.box[2]) / 2) * E.unit - scroller.clientWidth / 2), behavior: 'smooth' });
  $$('.hit', pagesEl).forEach((d, i) => d.classList.toggle('cur', i === F.cur));
  updateFindUi();
}
function stepFind(d) { if (!F.hits.length) return; F.cur = (F.cur + d + F.hits.length) % F.hits.length; showHit(); }
function openFind() {
  if (!E.nb) return;
  F.open = true; $('#findBar').hidden = false; $('#findBtn').classList.add('on');
  const inp = $('#findIn'); inp.focus(); inp.select();
  if (inp.value) runFind();
  if (!ocrFailed) runOcrQueue();
  if (!E.pages.some(needsOcr) && !ocrRunning) setFindStatus(E.pages.some(p => p.ocr || p.pdfWords) ? 'Searching handwriting, typed text and PDFs' : 'Searching typed text');
}
function closeFind() { F.open = false; $('#findBar').hidden = true; $('#findBtn').classList.remove('on'); clearHits(); F.hits = []; F.cur = -1; }
function bootFind() {
  const bar = document.createElement('div'); bar.className = 'find-bar'; bar.id = 'findBar'; bar.hidden = true;
  bar.innerHTML = `<div class="find-row">${icon('search')}<input id="findIn" type="search" placeholder="Find in this notebook: handwriting, typed text, PDFs" autocomplete="off" spellcheck="false">
    <span id="findCount" class="find-count"></span><button class="icon-btn" id="findPrev" title="Previous">${icon('up')}</button><button class="icon-btn" id="findNext" title="Next">${icon('down')}</button>
    <button class="icon-btn" id="findClose" title="Close">${icon('x')}</button></div>
    <div class="find-sub"><span id="findKind"></span><span id="findStatus" hidden></span></div>`;
  $('.ed-body').appendChild(bar);
  let t; $('#findIn').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => runFind(), 160); });
  $('#findIn').addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
    if (e.key === 'Escape') closeFind();
  });
  $('#findPrev').onclick = () => stepFind(-1); $('#findNext').onclick = () => stepFind(1); $('#findClose').onclick = closeFind;
  const btn = document.createElement('button'); btn.className = 'icon-btn'; btn.id = 'findBtn'; btn.title = 'Find (⌘F)'; btn.innerHTML = icon('search');
  btn.onclick = () => F.open ? closeFind() : openFind();
  $('.tb-right').prepend(btn);
  document.addEventListener('keydown', e => {
    if (!E.nb) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); openFind(); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g' && F.open) { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
  }, true);
  // keep highlights in place when pages are rebuilt; read handwriting in the background while a notebook is open
  const ob = buildPages; buildPages = function () { ob.apply(this, arguments); if (F.open) drawHits(); };
  const ol = leaveNotebook; leaveNotebook = async function () { closeFind(); return ol.apply(this, arguments); };
  const oo = openNotebook; openNotebook = async function () { closeFind(); const r = await oo.apply(this, arguments); setTimeout(() => { if (E.nb && !ocrFailed && ocrWorkerP) runOcrQueue(); }, 1500); return r; };
}
