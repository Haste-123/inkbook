'use strict';
/* =====================================================================
   Inkbook v3 — covers & personalization, outline/sidebar, the ⋯ menu,
   Ask Claude and the offline calculator. Loaded after app.js.
   ===================================================================== */

Object.assign(ICONS, {
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  layers: '<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
  photos: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 012 2v12"/><path d="M3 15l4-4 5 5"/>',
  file: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  paste: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>',
  tpl: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  size: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1.3"/><circle cx="17.5" cy="10.5" r="1.3"/><circle cx="8.5" cy="7.5" r="1.3"/><circle cx="6.5" cy="12.5" r="1.3"/><path d="M12 2a10 10 0 000 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A5.6 5.6 0 0022 10c0-4.4-4.5-8-10-8z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
  export: '<path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>',
  selall: '<path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>',
  edit: '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4z"/>',
  calc: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h4"/>',
  sparkle: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
});

// =====================================================================
// Covers
// =====================================================================
const GRADS = [['#667eea', '#764ba2'], ['#f093fb', '#f5576c'], ['#4facfe', '#00f2fe'], ['#43e97b', '#38f9d7'], ['#fa709a', '#fee140'], ['#30cfd0', '#330867'],
  ['#a18cd1', '#fbc2eb'], ['#ff9a44', '#fc6076'], ['#0f2027', '#2c5364'], ['#d4fc79', '#96e6a1'], ['#232526', '#414345'], ['#ffecd2', '#fcb69f']];
const PATTERNS = {
  stripes: 'repeating-linear-gradient(45deg, rgba(255,255,255,.17) 0 10px, transparent 10px 20px)',
  dots: 'radial-gradient(rgba(255,255,255,.38) 2px, transparent 2.6px) 0 0/16px 16px',
  grid: 'linear-gradient(rgba(255,255,255,.2) 1px, transparent 1px) 0 0/16px 16px, linear-gradient(90deg, rgba(255,255,255,.2) 1px, transparent 1px) 0 0/16px 16px',
  linen: 'repeating-linear-gradient(0deg, rgba(0,0,0,.08) 0 1px, transparent 1px 3px), repeating-linear-gradient(90deg, rgba(0,0,0,.06) 0 1px, transparent 1px 4px)',
  checks: 'conic-gradient(rgba(255,255,255,.15) 25%, transparent 0 50%, rgba(255,255,255,.15) 0 75%, transparent 0) 0 0/24px 24px',
  waves: 'radial-gradient(circle at 50% 120%, transparent 14px, rgba(255,255,255,.2) 15px 17px, transparent 18px) 0 0/26px 18px',
};
const PATTERN_NAMES = [['stripes', 'Stripes'], ['dots', 'Dots'], ['grid', 'Grid'], ['linen', 'Linen'], ['checks', 'Checks'], ['waves', 'Waves']];
const EMOJIS = ['📘', '📗', '📕', '📙', '📓', '🧮', '📐', '🧪', '🧬', '⚛️', '💻', '🧠', '🩺', '⚖️', '🌍', '📜', '🎨', '🎵', '💼', '📊', '✏️', '⭐', '🔥', '💡'];

const coverOf = n => n.cover || (n.coverKey ? { type: 'page', label: false } : { type: 'color' });
function coverBg(n) {
  const c = coverOf(n), base = c.color || n.color || '#5b6cff';
  if (c.type === 'gradient') { const g = GRADS[c.grad || 0] || GRADS[0]; return `linear-gradient(135deg, ${g[0]}, ${g[1]})`; }
  if (c.type === 'pattern') return `${PATTERNS[c.pattern || 'stripes']}, ${base}`;
  return base;
}
function coverImgKey(n) { const c = coverOf(n); return c.type === 'photo' ? c.imgKey : c.type === 'page' ? (n.thumbKey || n.coverKey) : null; }
function coverInner(n, o = {}) {
  const c = coverOf(n), k = coverImgKey(n), label = c.label ?? (c.type !== 'page');
  return `${k ? `<img alt="" data-key="${esc(k)}">` : ''}${c.emoji ? `<span class="cover-emoji">${esc(c.emoji)}</span>` : ''}` +
    `${label ? `<div class="cover-label">${esc(n.title)}</div>` : ''}${n.starred && !o.noStar ? `<span class="cover-star">${icon('star')}</span>` : ''}`;
}
function nbCard(n, list) {
  const bg = esc(coverBg(n));
  if (list) {
    const k = coverImgKey(n), em = coverOf(n).emoji;
    return `<div class="row nb" data-id="${n.id}"><div class="mini-cover" style="background:${bg}" data-open>${k ? `<img alt="" data-key="${esc(k)}">` : ''}${em ? `<span class="mini-emoji">${esc(em)}</span>` : ''}</div>
      <div class="row-main" data-open><b>${esc(n.title)}</b><span>${nbMeta(n)}</span></div>
      <button class="icon-btn star${n.starred ? ' on' : ''}" data-star title="Favorite">${icon('star')}</button><button class="icon-btn" data-menu>${icon('more')}</button></div>`;
  }
  return `<div class="nb" data-id="${n.id}"><div class="cover" style="background:${bg}" data-open>${coverInner(n)}</div>
    <div class="nb-meta"><div><b>${esc(n.title)}</b><span>${nbMeta(n)}</span></div><button class="icon-btn" data-menu>${icon('more')}</button></div></div>`;
}
function folderCard(f, list) {
  const n = NBS.filter(x => x.folderId === f.id).length, k = childFolders(f.id).length;
  const meta = [k ? `${k} folder${k > 1 ? 's' : ''}` : '', `${n} notebook${n === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
  if (list) return `<div class="row" data-fid="${f.id}"><div class="mini-folder" style="--c:${esc(f.color)}" data-openf>${f.emoji ? `<span class="mini-emoji">${esc(f.emoji)}</span>` : icon('folder')}</div>
    <div class="row-main" data-openf><b>${esc(f.name)}</b><span>${meta}</span></div><button class="icon-btn" data-fmenu>${icon('more')}</button></div>`;
  return `<div class="folder" data-fid="${f.id}"><div class="fcover" style="--c:${esc(f.color)}" data-openf>${f.emoji ? `<i class="f-emoji">${esc(f.emoji)}</i>` : ''}<span>${esc(f.name)}</span></div>
    <div class="nb-meta"><div><b>${esc(f.name)}</b><span>${meta}</span></div><button class="icon-btn" data-fmenu>${icon('more')}</button></div></div>`;
}
function renderSide() {
  $$('#libSide [data-view]').forEach(b => b.classList.toggle('on', LIB.view === b.dataset.view));
  const row = (f, d) => {
    const kids = childFolders(f.id), open = LIB.open.has(f.id), n = NBS.filter(x => x.folderId === f.id).length;
    return `<div class="tree-row${LIB.view === 'folder' && LIB.folderId === f.id ? ' on' : ''}" data-tf="${f.id}" style="--d:${d}">
      <button class="tw${kids.length ? '' : ' none'}" data-tw="${f.id}">${open ? '▾' : '▸'}</button>
      ${f.emoji ? `<span class="temoji">${esc(f.emoji)}</span>` : `<span class="fdot" style="--c:${esc(f.color)}"></span>`}<span class="tname">${esc(f.name)}</span><span class="tcount">${n || ''}</span></div>` +
      (open ? kids.map(k => row(k, d + 1)).join('') : '');
  };
  $('#folderTree').innerHTML = childFolders(null).map(f => row(f, 0)).join('') || `<div class="side-empty">Make a folder for each course or subject.</div>`;
}
function folderForm(f, parentId = null) {
  const v = f ? { name: f.name, color: f.color, emoji: f.emoji || '' } : { name: '', color: COVER_COLORS[FOLDERS.length % COVER_COLORS.length], emoji: '' };
  return new Promise(res => {
    const m = openModal(`<h2>${f ? 'Edit folder' : 'New folder'}</h2>
      ${!f && parentId ? `<p class="hint">Inside: ${esc(folderPath(parentId).map(x => x.name).join(' › '))}</p>` : ''}
      <div class="field"><label class="lbl">Name</label><input type="text" name="n" value="${esc(v.name)}" placeholder="e.g. Calculus II, Semester 3, Biology"></div>
      <div class="field"><label class="lbl">Color</label><div class="seg" data-k="color">${swatchHtml(COVER_COLORS, v.color)}</div></div>
      <div class="field"><label class="lbl">Icon</label><div class="seg emoji-seg" data-k="emoji"><button class="chip${!v.emoji ? ' on' : ''}" data-v="">None</button>${EMOJIS.map(e => `<button class="chip emoji${v.emoji === e ? ' on' : ''}" data-v="${e}">${e}</button>`).join('')}</div></div>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>${f ? 'Save' : 'Create'}</button></div>`);
    $$('.seg[data-k]', m.el).forEach(s => wireSeg(s, x => (v[s.dataset.k] = x)));
    let out = null; const ok = () => { v.name = $('[name=n]', m.el).value.trim() || 'Untitled folder'; out = v; m.close(); };
    $('[data-ok]', m.el).onclick = ok; $('[name=n]', m.el).onkeydown = e => { if (e.key === 'Enter') ok(); };
    m.onClose = () => res(out); $('[name=n]', m.el).focus();
  });
}
async function makeThumb(nb, pages) {
  pages ||= await orderedPages(nb);
  const p = pages[0]; if (!p) return;
  await preloadPage(p);
  const c = document.createElement('canvas'); c.width = 360; c.height = Math.round(Math.min(360 * p.h / p.w, 480));
  renderPage(c.getContext('2d'), p, 360 / p.w, { texts: true, sync: true });
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85)); c.width = c.height = 0;
  const key = 'thumb_' + nb.id; await db.put('blobs', blob, key); nb.thumbKey = key;
}
async function coverEditor(nb) {
  const orig = coverOf(nb), v = structuredClone(orig);
  v.color ||= nb.color || COVER_COLORS[0];
  return new Promise(res => {
    const m = openModal(`<h2>Customize cover</h2>
      <div class="cover-editor">
        <div class="ce-preview"><div class="cover" id="cePrev"></div><b class="ce-title">${esc(nb.title)}</b></div>
        <div class="ce-controls">
          <div class="seg" id="ceType">${segHtml([['color', 'Color'], ['gradient', 'Gradient'], ['pattern', 'Pattern'], ['photo', 'Photo'], ['page', 'First page']], v.type)}</div>
          <div id="ceBody"></div>
          <div class="field"><label class="lbl">Sticker</label><div class="seg emoji-seg" id="ceEmoji"><button class="chip${!v.emoji ? ' on' : ''}" data-v="">None</button>${EMOJIS.map(e => `<button class="chip emoji${v.emoji === e ? ' on' : ''}" data-v="${e}">${e}</button>`).join('')}</div></div>
          <label class="toggle"><input type="checkbox" id="ceLabel"><span>Show the title on the cover</span></label>
        </div>
      </div>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save cover</button></div>`, 'wide');
    let url = null, saved = false;
    const preview = async () => {
      const tmp = { ...nb, cover: v }, el = $('#cePrev', m.el);
      el.style.background = coverBg(tmp); el.innerHTML = coverInner(tmp, { noStar: true });
      $('#ceLabel', m.el).checked = v.label ?? (v.type !== 'page');
      const img = $('img', el);
      if (img) { const b = await db.get('blobs', img.dataset.key); if (b) { if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(b); img.src = url; } }
    };
    const body = () => {
      const b = $('#ceBody', m.el);
      if (v.type === 'color' || v.type === 'pattern')
        b.innerHTML = `<div class="field"><label class="lbl">Color</label><div class="seg" id="ceColor">${swatchHtml(COVER_COLORS, v.color)}<label class="cswatch custom" title="Any color"><input type="color" value="${esc(v.color)}"></label></div></div>` +
          (v.type === 'pattern' ? `<div class="field"><label class="lbl">Pattern</label><div class="pat-grid">${PATTERN_NAMES.map(([k, l]) =>
            `<button class="pat${(v.pattern || 'stripes') === k ? ' on' : ''}" data-pat="${k}" style="background:${PATTERNS[k]}, ${esc(v.color)}"><span>${l}</span></button>`).join('')}</div></div>` : '');
      else if (v.type === 'gradient')
        b.innerHTML = `<div class="field"><label class="lbl">Gradient</label><div class="pat-grid">${GRADS.map((g, i) =>
          `<button class="pat${(v.grad || 0) === i ? ' on' : ''}" data-grad="${i}" style="background:linear-gradient(135deg,${g[0]},${g[1]})"></button>`).join('')}</div></div>`;
      else if (v.type === 'photo')
        b.innerHTML = `<div class="field"><button class="btn primary" id="cePick">${icon('image')}${v.imgKey ? 'Choose a different photo' : 'Choose a photo…'}</button><p class="hint">From Photos, the camera or Files. It fills the whole cover.</p></div>`;
      else b.innerHTML = `<p class="hint">Shows your actual first page (handwriting, slides and all). It refreshes every time you close the notebook.</p>`;
    };
    wireSeg($('#ceType', m.el), t => { v.type = t; delete v.label; body(); preview(); });
    $('#ceBody', m.el).addEventListener('click', guard(async e => {
      const pick = e.target.closest('#cePick');
      if (pick) {
        const files = pickFiles('image/*');       // opened synchronously inside the tap
        const f = (await files)[0]; if (!f) return;
        const { blob } = await prepImage(f, 900), key = 'cover_' + uid();
        await db.put('blobs', blob, key);
        if (v.imgKey && v.imgKey !== orig.imgKey) await db.del('blobs', v.imgKey);
        v.imgKey = key; body(); return preview();
      }
      const s = e.target.closest('#ceColor [data-v]'); if (s) { v.color = s.dataset.v; body(); return preview(); }
      const pt = e.target.closest('[data-pat]'); if (pt) { v.pattern = pt.dataset.pat; body(); return preview(); }
      const gr = e.target.closest('[data-grad]'); if (gr) { v.grad = +gr.dataset.grad; body(); return preview(); }
    }));
    $('#ceBody', m.el).addEventListener('input', e => { if (e.target.type === 'color') { v.color = e.target.value; preview(); } });
    $('#ceBody', m.el).addEventListener('change', e => { if (e.target.type === 'color') body(); });
    wireSeg($('#ceEmoji', m.el), x => { v.emoji = x; preview(); });
    $('#ceLabel', m.el).onchange = e => { v.label = e.target.checked; preview(); };
    $('[data-ok]', m.el).onclick = guard(async () => {
      if (v.type === 'photo' && !v.imgKey) return toast('Choose a photo first');
      if (v.type === 'page' && !nb.thumbKey && !nb.coverKey) await makeThumb(nb, E.nb?.id === nb.id ? E.pages : null);
      if (orig.imgKey && orig.imgKey !== v.imgKey) await db.del('blobs', orig.imgKey);
      nb.cover = v; if (v.color) nb.color = v.color;
      await db.put('notebooks', nb); saved = true; m.close(); toast('Cover updated');
    });
    m.onClose = () => {
      if (url) URL.revokeObjectURL(url);
      if (!saved && v.imgKey && v.imgKey !== orig.imgKey) db.del('blobs', v.imgKey);
      res(saved); if (saved && !E.nb) showLibrary();
    };
    body(); preview();
  });
}

// =====================================================================
// Lessons, topics & the sidebar
// =====================================================================
function dividerHtml(s, num, meta) {
  if (s.level === 2) return `<span class="sd-dot"></span><span class="sd-kind">Topic</span><span class="sd-title">${esc(s.title)}</span>`;
  return `<div class="sd-band"></div><div class="sd-body"><span class="sd-kind">Lesson ${num || ''}</span><span class="sd-title">${esc(s.title)}</span>${meta ? `<span class="sd-meta">${meta}</span>` : ''}</div>`;
}
function sectionForm(s, i, preset = {}) {
  const isNew = !s;
  const v = s ? { title: s.title, level: s.level || 1, color: s.color }
    : { title: '', level: preset.level || 1, color: preset.color || COVER_COLORS[secList().length % 9], at: preset.at || 'new' };
  const fixedAt = preset.atIndex != null;
  return new Promise(res => {
    const m = openModal(`<h2>${isNew ? 'Add to the outline' : 'Edit ' + (v.level === 2 ? 'topic' : 'lesson')}</h2>
      <div class="type-cards seg">
        <button class="type-card${v.level === 1 ? ' on' : ''}" data-v="1"><span class="tc-icon">📖</span><b>Lesson</b><span>A lecture, chapter or week</span></button>
        <button class="type-card${v.level === 2 ? ' on' : ''}" data-v="2"><span class="tc-icon">🔹</span><b>Topic</b><span>A part inside a lesson</span></button>
      </div>
      <input type="text" class="big-input" name="t" value="${esc(v.title)}" placeholder="Title, e.g. Lecture 3: Integration by parts">
      <div class="field"><label class="lbl">Color</label><div class="seg" id="sfColor">${swatchHtml(COVER_COLORS.slice(0, 9), v.color)}</div></div>
      ${isNew && !fixedAt ? `<div class="field"><label class="lbl">Where does it start?</label><div class="opt-cards seg" id="sfAt">
        <button class="opt-card${v.at === 'new' ? ' on' : ''}" data-v="new"><b>＋ New page</b><span>after page ${i + 1}</span></button>
        <button class="opt-card${v.at === 'here' ? ' on' : ''}" data-v="here"><b>📍 This page</b><span>page ${i + 1} becomes the start</span></button>
        <button class="opt-card${v.at === 'end' ? ' on' : ''}" data-v="end"><b>⤓ At the end</b><span>new page after page ${E.pages.length}</span></button>
      </div></div>` : ''}
      ${fixedAt ? `<p class="hint">A new page is added for it ${esc(preset.where || '')}.</p>` : ''}
      <div class="field"><label class="lbl">Preview</label><div class="sd-preview"><div class="sec-divider" id="sfPrev"></div></div></div>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>${isNew ? 'Add' : 'Save'}</button></div>`);
    const prev = () => {
      const d = $('#sfPrev', m.el); d.className = 'sec-divider lv' + v.level; d.style.setProperty('--c', v.color);
      d.innerHTML = dividerHtml({ title: $('[name=t]', m.el).value.trim() || (v.level === 2 ? 'New topic' : 'New lesson'), level: v.level }, secList().filter(e => (e.s.level || 1) === 1).length + 1, '1 page');
    };
    wireSeg($('.type-cards', m.el), x => { v.level = +x; prev(); });
    wireSeg($('#sfColor', m.el), x => { v.color = x; prev(); });
    if ($('#sfAt', m.el)) wireSeg($('#sfAt', m.el), x => (v.at = x));
    $('[name=t]', m.el).addEventListener('input', prev);
    let out = null; const ok = () => { v.title = $('[name=t]', m.el).value.trim() || (v.level === 2 ? 'New topic' : 'New lesson'); out = v; m.close(); };
    $('[data-ok]', m.el).onclick = ok; $('[name=t]', m.el).onkeydown = e => { if (e.key === 'Enter') ok(); };
    m.onClose = () => res(out); prev(); $('[name=t]', m.el).focus();
  });
}
async function addSectionFlow(preset = {}) {
  const i = currentIndex(), r = await sectionForm(null, i, preset); if (!r) return;
  let pid;
  if (r.at === 'here' && preset.atIndex == null) pid = E.pages[i].id;
  else {
    const at = preset.atIndex != null ? preset.atIndex : r.at === 'end' ? E.pages.length : i + 1;
    const ref = E.pages[Math.max(0, at - 1)];
    const p = newPage(E.nb, ref && !ref.bgKey ? { template: ref.template, paperColor: ref.paperColor, w: ref.w, h: ref.h } : {});
    E.pages.splice(at, 0, p); E.byId.set(p.id, p); await db.put('pages', p); pid = p.id;
  }
  E.nb.sections.push({ id: uid(), title: r.title, level: r.level, color: r.color, pageId: pid });
  await saveNb(); buildPages(); scrollToPage(E.pages.findIndex(p => p.id === pid)); updateInd(); renderEdSide();
}
function addTopicTo(lessonId) {
  const list = secList(), e = list.find(x => x.s.id === lessonId); if (!e) return;
  const [, b] = secRange(e, list);
  return addSectionFlow({ level: 2, color: e.s.color, atIndex: b, where: `at the end of “${e.s.title}”` });
}
async function renderCrop(c, p, box) {
  await preloadPage(p);
  const bw = Math.max(60, box[2] - box[0]), bh = Math.max(30, box[3] - box[1]);
  const s = Math.min(c.width / bw, 2.5);
  c.height = Math.round(clamp(bh * s, 50, c.width * 0.62));
  const ctx = c.getContext('2d'); ctx.fillStyle = p.paperColor || '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  renderPage(ctx, p, s, { texts: true, sync: true, ox: box[0] - (c.width / s - bw) / 2, oy: box[1] });
}
function outlineHtml(cur) {
  const list = secList();
  if (!list.length) return `<div class="side-empty-card"><div class="se-icon">📚</div><b>Organize this notebook</b><p>Split it into <b>lessons</b> (lectures, chapters, weeks) with <b>topics</b> inside. They show as headings between pages and here, so you can jump anywhere instantly.</p></div>`;
  const { lesson, topic } = secAt(cur), on = topic || lesson;
  const groups = []; let g = null;
  for (const e of list) { if ((e.s.level || 1) === 1) { g = { e, topics: [] }; groups.push(g); } else if (g) g.topics.push(e); else groups.push({ e: null, topics: [e] }); }
  let n = 0;
  return groups.map(gr => {
    const topics = gr.topics.map(t => `<div class="tp-row${t.s === on ? ' on' : ''}" style="--c:${esc(t.s.color || S.accent)}" data-go="${t.i}">
      <span class="tp-dot"></span><span class="tp-title">${esc(t.s.title)}</span><span class="tp-pg">p.${t.i + 1}</span>
      <button class="mini-more" data-smenu="${t.s.id}">${icon('more')}</button></div>`).join('');
    if (!gr.e) return `<div class="les loose">${topics}</div>`;
    n++;
    const s = gr.e.s, [a, b] = secRange(gr.e, list), act = s === on || gr.topics.some(t => t.s === on);
    return `<div class="les${act ? ' on' : ''}" style="--c:${esc(s.color || S.accent)}">
      <div class="les-head" data-go="${a}"><span class="les-num">${n}</span>
        <div class="les-main"><b>${esc(s.title)}</b><span>p. ${a + 1}${b - 1 > a ? '–' + b : ''} · ${b - a} page${b - a > 1 ? 's' : ''}${gr.topics.length ? ` · ${gr.topics.length} topic${gr.topics.length > 1 ? 's' : ''}` : ''}</span></div>
        <button class="mini-more" data-smenu="${s.id}">${icon('more')}</button></div>
      ${topics ? `<div class="les-topics">${topics}</div>` : ''}
      <button class="add-topic" data-addtopic="${s.id}">${icon('plus')}Add topic</button></div>`;
  }).join('');
}
async function renderEdSide() {
  if (!S.sideOpen || !E.nb) return;
  $('#sideTitle').textContent = E.nb.title;
  $$('.side-tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === S.sideTab));
  $('#sideFoot').hidden = S.sideTab !== 'outline';
  const body = $('#sideBody'), cur = currentIndex(); sideIO?.disconnect();
  const pageNo = new Map(E.pages.map((p, i) => [p.id, i]));
  if (S.sideTab === 'outline') body.innerHTML = outlineHtml(cur);
  else if (S.sideTab === 'saved') {
    const items = await collectItems(E.nb, E.pages);
    const types = ITEM_TYPES.filter(([k]) => items.some(i => i.type === k));
    const shown = items.filter(i => savedFilter === 'all' || i.type === savedFilter);
    body.innerHTML = (items.length ? `<div class="filter-chips">${segHtml([['all', `All ${items.length}`], ...types.map(([k, l]) => [k, `${l} ${items.filter(i => i.type === k).length}`])], savedFilter)}</div>` : '') +
      (shown.length ? shown.map(it => `<div class="sv-card" style="--c:${ITEM_MAP[it.type].color}" data-item="${it.pageId}|${it.box.join(',')}">
        <canvas class="crop" width="240" height="90" data-crop="${it.pageId}|${it.box.join(',')}"></canvas>
        <div class="sv-main"><span class="sv-type">${ITEM_MAP[it.type].label}${it.auto ? ' · auto' : ''}</span><b>${esc(it.title)}</b><span class="sv-loc">p. ${it.pageNo}${it.section ? ' · ' + esc(it.section) : ''}</span></div>
        ${it.auto ? '' : `<button class="mini-more" data-imenu="${it.id}">${icon('more')}</button>`}</div>`).join('')
        : `<div class="side-empty-card"><div class="se-icon">⭐</div><b>Keep important things one tap away</b><p>Select a question, problem or formula with the <b>lasso</b> and tap <b>★ Save</b>.</p><p>Text boxes starting with <b>Q:</b>, <b>Problem 2:</b>, <b>Def:</b>, <b>Formula:</b> or <b>!!</b> appear here automatically. You can handwrite in a text box with Apple Pencil too.</p></div>`);
    const fc = $('.filter-chips', body); if (fc) wireSeg(fc, x => { savedFilter = x; renderEdSide(); });
  } else if (S.sideTab === 'pages') {
    const starts = new Map(); let no = 0;
    for (const e of secList()) { if ((e.s.level || 1) === 1) no++; starts.set(e.i, { s: e.s, no }); }
    let html = '<div class="pg-grid">';
    E.pages.forEach((p, i) => {
      const st = starts.get(i);
      if (st) html += `</div><div class="pg-group lv${st.s.level || 1}" style="--c:${esc(st.s.color || S.accent)}">${st.s.level === 2 ? '<span class="tp-dot"></span>' : `<span class="les-num sm">${st.no}</span>`}${esc(st.s.title)}</div><div class="pg-grid">`;
      html += `<div class="pg-card${i === cur ? ' cur' : ''}${p.bookmark ? ' bm' : ''}" data-pi="${i}"><canvas width="240" height="${Math.round(240 * Math.min(p.h / p.w, 1.6))}"></canvas>
        <span class="pg-no">${i + 1}</span><button class="pg-more" data-pm="${i}">${icon('more')}</button></div>`;
    });
    body.innerHTML = html + '</div>';
  } else {
    const marks = E.pages.map((p, i) => ({ p, i })).filter(x => x.p.bookmark);
    body.innerHTML = marks.length ? marks.map(({ p, i }) => {
      const { lesson, topic } = secAt(i);
      return `<div class="sv-card" style="--c:var(--danger)" data-go="${i}"><canvas class="crop" width="240" height="90" data-crop="${p.id}|0,0,${p.w},${Math.round(p.w * 0.4)}"></canvas>
        <div class="sv-main"><span class="sv-type">🔖 Page ${i + 1}</span><b>${esc((topic || lesson)?.title || 'Page ' + (i + 1))}</b><span class="sv-loc">${lesson && topic ? esc(lesson.title) : ''}</span></div>
        <button class="mini-more" data-unmark="${i}" title="Remove bookmark">${icon('x')}</button></div>`;
    }).join('') : `<div class="side-empty-card"><div class="se-icon">🔖</div><b>No bookmarks yet</b><p>Tap the bookmark button in the toolbar (or press B) to mark the page you're on.</p></div>`;
  }
  sideIO = new IntersectionObserver(ents => ents.forEach(en => {
    if (!en.isIntersecting) return; sideIO.unobserve(en.target);
    const c = en.target.tagName === 'CANVAS' ? en.target : $('canvas', en.target);
    if (c.dataset.crop) { const [pid, b] = c.dataset.crop.split('|'), p = E.byId.get(pid); if (p) renderCrop(c, p, b.split(',').map(Number)); }
    else { const p = E.pages[+en.target.dataset.pi]; if (p) renderThumb(c, p); }
  }), { root: body, rootMargin: '300px' });
  $$('canvas.crop, .pg-card', body).forEach(t => sideIO.observe(t));
  void pageNo;
}
async function onSideClick(e) {
  const t = e.target;
  const tab = t.closest('[data-tab]'); if (tab) return setSideTab(tab.dataset.tab);
  const sm = t.closest('[data-smenu]'); if (sm) return sectionMenu(E.nb.sections.find(s => s.id === sm.dataset.smenu));
  const at = t.closest('[data-addtopic]'); if (at) return addTopicTo(at.dataset.addtopic);
  const im = t.closest('[data-imenu]'); if (im) return itemMenu(E.nb.items.find(x => x.id === im.dataset.imenu));
  const um = t.closest('[data-unmark]'); if (um) return toggleBookmark(+um.dataset.unmark);
  const pm = t.closest('[data-pm]'); if (pm) return pageMenu(+pm.dataset.pm);
  const it = t.closest('[data-item]');
  if (it) { const [pid, box] = it.dataset.item.split('|'); closeSideIfOverlay(); return goToBox(E.byId.get(pid), box.split(',').map(Number)); }
  const go = t.closest('[data-go]'); if (go) { scrollToPage(+go.dataset.go, true); closeSideIfOverlay(); return; }
  const th = t.closest('[data-pi]'); if (th) { scrollToPage(+th.dataset.pi); closeSideIfOverlay(); }
}

// =====================================================================
// The ⋯ menu — tiles + visual pickers
// =====================================================================
function moreMenu() { openPopover($('#moreBtn'), 'more', box => moreRoot(box)); }
const tile = (k, ic, l, cls = '') => `<button class="tile ${cls}" data-m="${k}"><span class="tile-ic">${icon(ic)}</span><span>${l}</span></button>`;
const backHead = title => `<div class="pop-back"><button class="icon-btn" data-back>${icon('back')}</button><b>${title}</b></div>`;
function moreRoot(box) {
  const i = currentIndex(), p = E.pages[i], { lesson, topic } = secAt(i), sec = topic || lesson;
  box.innerHTML = `<div class="more-head"><b>${esc(E.nb.title)}</b><span>Page ${i + 1} of ${E.pages.length}${sec ? ' · ' + esc(sec.title) : ''}</span></div>
    <div class="tile-sec">Insert</div><div class="tiles">${tile('img', 'image', 'Image')}${tile('photos', 'photos', 'Photo pages')}${tile('doc', 'file', 'PDF / Word')}${E.clip ? tile('paste', 'paste', 'Paste') : ''}</div>
    <div class="tile-sec">This page</div><div class="tiles">${tile('tpl', 'tpl', 'Template')}${tile('size', 'size', 'Size')}${tile('paper', 'palette', 'Paper')}${tile('bm', 'bookmark', p.bookmark ? 'Bookmarked' : 'Bookmark', p.bookmark ? 'on' : '')}
      ${tile('dup', 'copy', 'Duplicate')}${tile('png', 'export', 'Save image')}${tile('selall', 'selall', 'Select all')}${tile('del', 'trash', 'Delete', 'danger')}</div>
    <div class="tile-sec">Notebook</div><div class="tiles">${tile('sec', 'layers', 'Lesson / topic')}${tile('saved', 'star', 'Saved items')}${tile('cover', 'palette', 'Cover')}${tile('rename', 'edit', 'Rename')}
      ${tile('pdf', 'export', 'Export PDF')}${tile('docx', 'file', 'Export Word')}</div>
    <div class="tile-sec">Study tools</div><div class="tiles">${tile('ask', 'sparkle', 'Ask Claude', 'claude')}${tile('calc', 'calc', 'Calculator')}${tile('laser', 'laser', 'Laser')}${tile('help', 'help', 'Help')}</div>`;
  box.onclick = guard(async e => { const t = e.target.closest('[data-m]'); if (t) await moreAction(t.dataset.m, box); });
}
function rePlace() { placePopover($('#moreBtn')); }
async function moreAction(k, box) {
  const i = currentIndex(), p = E.pages[i];
  const panels = { tpl: tplPanel, size: sizePanel, paper: paperPanel, calc: calcPanel };
  if (panels[k]) { panels[k](box); return rePlace(); }
  // things that open the file picker must start synchronously inside the tap
  if (k === 'img') { const f = pickFiles('image/*', true); closePopover(); return insertImages(await f); }
  if (k === 'photos') { const f = pickFiles('image/*', true); closePopover(); return insertPhotoPages(await f, i); }
  if (k === 'doc') { const f = pickFile('.pdf,.docx,application/pdf'); closePopover(); const file = await f; if (file) { showProgress('Importing…'); return insertDocFile(file, i); } return; }
  closePopover();
  const act = {
    paste: async () => { const sr = scroller.getBoundingClientRect(), er = E.els.get(p.id).getBoundingClientRect(); await pasteClip(p, { x: 60, y: clamp((sr.top + 80 - er.top) / E.unit, 20, p.h - 40) }); },
    bm: () => toggleBookmark(i), dup: () => duplicatePage(i), png: () => exportPagePng(i), selall: () => selectAll(), del: () => deletePage(i),
    sec: () => addSectionFlow({ level: 1 }), saved: () => setSideTab('saved'),
    cover: async () => { await flush(); await makeThumb(E.nb, E.pages); await coverEditor(E.nb); },
    rename: () => inlineRename($('#nbTitle'), E.nb.title, async v => { E.nb.title = v; await saveNb(); }),
    pdf: async () => { await flush(); await exportPDF(E.nb, E.pages); }, docx: async () => { await flush(); await exportDocx(E.nb, E.pages); },
    ask: () => { const r = visibleBox(p); return askClaude(p, r); },
    laser: () => { setTool('laser'); toast('Laser pointer on: tap the pen to go back', 2200); }, help: () => openHelp(),
  }[k];
  if (act) await act();
}
function visibleBox(p) {
  const sr = scroller.getBoundingClientRect(), er = E.els.get(p.id).getBoundingClientRect();
  const y0 = clamp((sr.top - er.top) / E.unit, 0, p.h), y1 = clamp((sr.bottom - er.top) / E.unit, 0, p.h);
  return [0, y0, p.w, Math.max(y0 + 100, y1)];
}
function scopeSeg() { return `<div class="seg scope" data-scope>${segHtml([['one', 'This page'], ['all', 'All pages']], 'one')}</div>`; }
function tplPanel(box) {
  const p = E.pages[currentIndex()]; let scope = 'one';
  box.innerHTML = backHead('Page template') + scopeSeg() + `<div class="tpl-grid">${TEMPLATES.map(([k, l]) =>
    `<button class="tpl${p.template === k ? ' on' : ''}" data-t="${k}"><canvas width="84" height="118"></canvas><span>${l}</span></button>`).join('')}</div>`;
  $$('.tpl', box).forEach(b => {
    const c = $('canvas', b), ctx = c.getContext('2d'), s = c.width / 1000;
    ctx.fillStyle = p.bgKey ? '#fff' : p.paperColor; ctx.fillRect(0, 0, c.width, c.height);
    drawTemplate(ctx, { w: 1000, h: 1414, template: b.dataset.t, paperColor: p.bgKey ? '#fff' : p.paperColor }, s);
  });
  wireSeg($('[data-scope]', box), x => (scope = x));
  box.onclick = e => {
    if (e.target.closest('[data-back]')) { moreRoot(box); return rePlace(); }
    const t = e.target.closest('[data-t]'); if (!t) return;
    const k = t.dataset.t; (scope === 'one' ? [p] : E.pages).forEach(x => { x.template = k; markDirty(x); });
    if (scope === 'all') { E.nb.paper = k; saveNb(); }
    $$('.tpl', box).forEach(x => x.classList.toggle('on', x === t)); layout();
  };
}
function sizePanel(box) {
  const p = E.pages[currentIndex()]; let scope = 'one';
  box.innerHTML = backHead('Page size') + scopeSeg() + `<div class="sz-grid">${PAGE_SIZES.map(([k, l, w, h]) =>
    `<button class="sz${p.w === w && p.h === h ? ' on' : ''}" data-s="${k}"><i style="aspect-ratio:${w}/${h}"></i><span>${l}</span></button>`).join('')}</div>
    <button class="btn block" data-longer style="margin-top:10px">${icon('size')}Make this page 50% longer</button>
    <p class="opt-hint">Tip: you can also drag the blue handle on a page's bottom or right edge.</p>`;
  wireSeg($('[data-scope]', box), x => (scope = x));
  box.onclick = e => {
    if (e.target.closest('[data-back]')) { moreRoot(box); return rePlace(); }
    if (e.target.closest('[data-longer]')) { if (p.bgKey && !p.bgH) p.bgH = p.h; p.h = Math.round(p.h * 1.5); markDirty(p); layout(); return toast('Page extended'); }
    const t = e.target.closest('[data-s]'); if (!t) return;
    const sz = PAGE_SIZES.find(x => x[0] === t.dataset.s);
    (scope === 'one' ? [p] : E.pages).forEach(x => { if (!x.bgKey) { x.w = sz[2]; x.h = sz[3]; markDirty(x); } });
    if (scope === 'all') { E.nb.pw = sz[2]; E.nb.ph = sz[3]; saveNb(); }
    $$('.sz', box).forEach(x => x.classList.toggle('on', x === t)); layout();
  };
}
const MORE_PAPERS = [...PAPER_COLORS, ['#eefaf1', 'Mint'], ['#fdf0f2', 'Rose'], ['#f3f0ff', 'Lavender'], ['#f2f2f2', 'Gray'], ['#fff8d6', 'Legal pad'], ['#121212', 'Black']];
function paperPanel(box) {
  const p = E.pages[currentIndex()]; let scope = 'one';
  box.innerHTML = backHead('Paper color') + scopeSeg() + `<div class="paper-grid">${MORE_PAPERS.map(([k, l]) =>
    `<button class="paper${p.paperColor === k ? ' on' : ''}" data-pc="${k}"><i style="background:${k}"></i><span>${l}</span></button>`).join('')}
    <label class="paper custom"><i class="custom-sw"><input type="color" value="${esc(p.paperColor || '#ffffff')}"></i><span>Any color</span></label></div>
    ${p.bgKey ? '<p class="opt-hint">PDF and photo pages keep their own background.</p>' : ''}`;
  wireSeg($('[data-scope]', box), x => (scope = x));
  const apply = c => { (scope === 'one' ? [p] : E.pages).forEach(x => { if (!x.bgKey) { x.paperColor = c; markDirty(x); } }); if (scope === 'all') { E.nb.paperColor = c; saveNb(); } layout(); };
  box.onclick = e => {
    if (e.target.closest('[data-back]')) { moreRoot(box); return rePlace(); }
    const t = e.target.closest('[data-pc]'); if (!t) return;
    apply(t.dataset.pc); $$('.paper', box).forEach(x => x.classList.toggle('on', x === t));
  };
  box.oninput = e => { if (e.target.type === 'color') apply(e.target.value); };
}

// =====================================================================
// Offline calculator (with a simple one-unknown equation solver)
// =====================================================================
const CALC_FN = { sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round };
const CALC_CONST = { pi: Math.PI, 'π': Math.PI, e: Math.E };
function calcTokens(src) {
  src = src.replace(/×/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/²/g, '^2').replace(/³/g, '^3');
  const re = /\s*(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+|[A-Za-zπθ_][A-Za-z0-9_]*|\*\*|[-+*/^(),=!%√])/y, out = [];
  while (re.lastIndex < src.length) {
    const at = re.lastIndex, m = re.exec(src);
    if (!m) { if (/^\s*$/.test(src.slice(at))) break; throw new Error(`I don't understand “${src.slice(at).trim()[0]}”`); }
    out.push(m[1]);
  }
  return out;
}
function calcCompile(toks, deg) {
  let i = 0; const peek = () => toks[i], next = () => toks[i++];
  const isNum = t => /^[\d.]/.test(t), isId = t => t && /^[A-Za-zπθ_]/.test(t);
  const fact = n => { if (n < 0 || n !== Math.floor(n) || n > 170) return NaN; let r = 1; for (let k = 2; k <= n; k++) r *= k; return r; };
  const fn = (k, a) => {
    const f = CALC_FN[k], trig = ['sin', 'cos', 'tan'].includes(k), inv = ['asin', 'acos', 'atan'].includes(k);
    return v => { const x = a(v); const r = f(deg && trig ? x * Math.PI / 180 : x); return deg && inv ? r * 180 / Math.PI : r; };
  };
  const expr = () => { let a = term(); while (peek() === '+' || peek() === '-') { const op = next(), b = term(), x = a; a = op === '+' ? v => x(v) + b(v) : v => x(v) - b(v); } return a; };
  const term = () => {
    let a = unary();
    for (;;) {
      const t = peek();
      if (t === '*' || t === '/' || t === '%') { next(); const b = unary(), x = a; a = t === '*' ? v => x(v) * b(v) : t === '/' ? v => x(v) / b(v) : v => x(v) % b(v); }
      else if (t !== undefined && (isNum(t) || isId(t) || t === '(' || t === '√')) { const b = unary(), x = a; a = v => x(v) * b(v); }   // 2x, 3(…)
      else return a;
    }
  };
  const unary = () => { if (peek() === '-') { next(); const a = unary(); return v => -a(v); } if (peek() === '+') { next(); return unary(); } return power(); };
  const power = () => { const a = postfix(); if (peek() === '^' || peek() === '**') { next(); const b = unary(); return v => Math.pow(a(v), b(v)); } return a; };
  const postfix = () => { let a = primary(); while (peek() === '!') { next(); const x = a; a = v => fact(x(v)); } return a; };
  const primary = () => {
    const t = next(); if (t === undefined) throw new Error('The expression is incomplete');
    if (isNum(t)) { const n = parseFloat(t); return () => n; }
    if (t === '(') { const a = expr(); if (next() !== ')') throw new Error('A “)” is missing'); return a; }
    if (t === '√') { const a = power(); return v => Math.sqrt(a(v)); }
    if (isId(t)) {
      const k = t.toLowerCase();
      if (CALC_FN[k]) { if (peek() === '(') { next(); const a = expr(); if (next() !== ')') throw new Error('A “)” is missing'); return fn(k, a); } return fn(k, power()); }
      if (k in CALC_CONST) return () => CALC_CONST[k];
      return v => { if (!(t in v)) throw new Error('Unknown ' + t); return v[t]; };
    }
    throw new Error(`Unexpected “${t}”`);
  };
  const f = expr(); if (i < toks.length) throw new Error(`Unexpected “${toks[i]}”`); return f;
}
const calcUnknowns = toks => [...new Set(toks.filter(t => /^[A-Za-zθ_]/.test(t) && !CALC_FN[t.toLowerCase()] && !(t.toLowerCase() in CALC_CONST)))];
function fmtNum(n) {
  if (!Number.isFinite(n)) return Number.isNaN(n) ? 'undefined' : (n > 0 ? '∞' : '−∞');
  if (Object.is(n, -0) || Math.abs(n) < 1e-12) return '0';
  const s = String(+n.toPrecision(12));
  return s.includes('e') ? n.toExponential(6).replace(/\.?0+e/, 'e') : s;
}
function findRoots(f) {
  const roots = [], add = r => { if (Number.isFinite(r) && !roots.some(x => Math.abs(x - r) < 1e-7 * Math.max(1, Math.abs(r)))) roots.push(r); };
  const scan = (a, b, step) => {
    let x0 = a, y0 = f(a);
    for (let x = a + step; x <= b + 1e-12 && roots.length < 8; x += step) {
      const y = f(x);
      if (Math.abs(y0) < 1e-10) add(x0);
      if (Number.isFinite(y0) && Number.isFinite(y) && Math.sign(y0) !== Math.sign(y) && Math.abs(y - y0) < 1e6) {
        let lo = x0, hi = x, flo = y0;
        for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2, fm = f(mid); if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else hi = mid; }
        add((lo + hi) / 2);
      }
      x0 = x; y0 = y;
    }
  };
  scan(-100, 100, 0.01); if (!roots.length) scan(-1e5, 1e5, 1);
  return roots.sort((a, b) => a - b).map(r => Math.abs(r - Math.round(r)) < 1e-9 ? Math.round(r) : r);
}
function calcRun(src, deg) {
  if (!src.trim()) return '';
  if (src.includes('=')) {
    const [L, R] = src.split('='); if (!R?.trim()) throw new Error('Add something after “=”');
    const tl = calcTokens(L), tr = calcTokens(R), unk = calcUnknowns([...tl, ...tr]);
    if (unk.length !== 1) throw new Error(unk.length ? `I can solve for one unknown at a time (found ${unk.join(', ')})` : 'There is nothing to solve for');
    const fl = calcCompile(tl, deg), fr = calcCompile(tr, deg), x = unk[0];
    const roots = findRoots(t => { try { return fl({ [x]: t }) - fr({ [x]: t }); } catch { return NaN; } });
    return roots.length ? roots.map(r => `${x} = ${fmtNum(r)}`).join('   or   ') : 'No real solution found';
  }
  const toks = calcTokens(src), unk = calcUnknowns(toks);
  if (unk.length) throw new Error(`Unknown ${unk.join(', ')}. Add “= …” to solve for it`);
  return '= ' + fmtNum(calcCompile(toks, deg)({}));
}
let calcHist = [], calcDeg = false;
function calcPanel(box) {
  box.innerHTML = backHead('Calculator') + `<input type="text" class="calc-in" placeholder="e.g. 2x + 3 = 11   or   sin(30)² + √16" autocomplete="off" spellcheck="false">
    <div class="calc-out">&nbsp;</div>
    <div class="calc-keys">${['√', '^', '²', 'π', '(', ')', 'x', '=', 'sin(', 'cos(', 'tan(', 'log(', 'ln(', '!'].map(k => `<button class="ck" data-k="${esc(k)}">${esc(k)}</button>`).join('')}</div>
    <div class="seg" data-deg>${segHtml([['rad', 'Radians'], ['deg', 'Degrees']], calcDeg ? 'deg' : 'rad')}</div>
    <div class="calc-actions"><button class="btn block" data-ins>Insert on page</button></div>
    <div class="calc-hist"></div>
    <p class="opt-hint">Works offline. For word problems, proofs or several unknowns, select it and use ✦ Ask Claude.</p>`;
  const inp = $('.calc-in', box), out = $('.calc-out', box), hist = $('.calc-hist', box);
  const run = () => { try { const r = calcRun(inp.value, calcDeg); out.textContent = r || ' '; out.classList.remove('err'); return r; } catch (e) { out.textContent = e.message; out.classList.add('err'); return null; } };
  const drawHist = () => { hist.innerHTML = calcHist.map(h => `<button class="ch" data-h="${esc(h.q)}"><span>${esc(h.q)}</span><b>${esc(h.r)}</b></button>`).join(''); };
  inp.addEventListener('input', run);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const r = run(); if (r) { calcHist = [{ q: inp.value, r }, ...calcHist.filter(h => h.q !== inp.value)].slice(0, 6); drawHist(); } } e.stopPropagation(); });
  wireSeg($('[data-deg]', box), x => { calcDeg = x === 'deg'; run(); });
  box.onclick = e => {
    if (e.target.closest('[data-back]')) { moreRoot(box); return rePlace(); }
    const k = e.target.closest('[data-k]'); if (k) { const v = k.dataset.k, s = inp.selectionStart ?? inp.value.length; inp.value = inp.value.slice(0, s) + v + inp.value.slice(inp.selectionEnd ?? s); inp.focus(); inp.setSelectionRange(s + v.length, s + v.length); run(); return; }
    const h = e.target.closest('[data-h]'); if (h) { inp.value = h.dataset.h; run(); return; }
    if (e.target.closest('[data-ins]')) {
      const r = run(); if (!r) return;
      const p = E.pages[currentIndex()], vb = visibleBox(p), before = snap(p);
      p.texts.push({ id: uid(), x: 80, y: clamp(vb[1] + 120, 20, p.h - 60), s: 24, c: E.color.pen, f: 'sans', text: `${inp.value.trim()}   ${r.startsWith('=') ? r : '→ ' + r}` });
      pushUndo(p, before); refreshPage(p); closePopover(); toast('Added to the page');
    }
  };
  drawHist(); setTimeout(() => inp.focus(), 50);
}

// =====================================================================
// Ask Claude — send a selected region of the page to Claude
// =====================================================================
const CLAUDE_MODEL = 'claude-opus-5-5';
const ANTHROPIC_SDK = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.8.0/+esm';
const ASK_SYSTEM = `You are a study helper inside a student's handwritten notes app. The image is a region the student selected from their notes. It may contain handwriting, typed text, diagrams, formulas, worked problems or lecture slides.
Read it carefully first. If any handwriting is ambiguous, briefly say how you read it.
Then do what the student asks, accurately and directly. When solving, show the key steps, then finish with one line that starts with "Answer:".
The app cannot render LaTeX or Markdown tables, so write math in plain Unicode (x², √, ∫, π, ≤, ≥, →, Δ, θ, ½) and keep formatting simple: short paragraphs, "-" bullet points, and **bold** only for key results.`;
const ASK_PRESETS = [['Solve this and show the steps', 'Solve'], ['Find the value of each variable', 'Find the variables'], ['Explain this simply, step by step', 'Explain'],
  ['Check my working and point out any mistakes', 'Check my work'], ['Summarize this in a few bullet points', 'Summarize'], ['Write 3 practice questions like this, with answers', 'Practice questions']];
let anthropicMod = null;
async function anthropicSdk() { return (anthropicMod ||= await import(ANTHROPIC_SDK)).default; }
async function claudeClient() {
  const Anthropic = await anthropicSdk();
  // The key is the student's own, stored only on this device; requests go straight to Anthropic.
  return new Anthropic({ apiKey: S.claudeKey, dangerouslyAllowBrowser: true });
}
function claudeError(e, A) {
  if (A && e instanceof A.AuthenticationError) return 'Your Claude API key was rejected. Check it in Settings → Ask Claude.';
  if (A && e instanceof A.PermissionDeniedError) return 'This API key isn’t allowed to use Claude. Check your Anthropic Console account.';
  if (A && e instanceof A.RateLimitError) return 'Too many requests right now. Wait a moment and try again.';
  if (A && e instanceof A.APIConnectionError) return 'Couldn’t reach Claude. Check your internet connection.';
  if (A && e instanceof A.APIError) return `Claude returned an error (${e.status ?? 'unknown'}): ${e.message}`;
  return e?.message || String(e);
}
async function testClaudeKey() {
  if (!S.claudeKey) return 'Paste a key first';
  if (!navigator.onLine) return 'You’re offline, so the key can’t be checked right now';
  let A;
  try { A = await anthropicSdk(); const client = await claudeClient(); await client.models.retrieve(CLAUDE_MODEL); return '✅ Key works. Ask Claude is ready'; }
  catch (e) { return '⚠️ ' + claudeError(e, A); }
}
async function regionImage(p, box) {
  await preloadPage(p);
  const bw = Math.max(20, box[2] - box[0]), bh = Math.max(20, box[3] - box[1]), sc = Math.min(2.5, 1500 / Math.max(bw, bh));
  const c = document.createElement('canvas'); c.width = Math.round(bw * sc); c.height = Math.round(bh * sc);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  renderPage(ctx, p, sc, { texts: true, sync: true, ox: box[0], oy: box[1] });
  return c.toDataURL('image/png');
}
function mdLite(s) {
  let h = esc(s);
  h = h.replace(/^#{1,4} (.*)$/gm, '<b class="h">$1</b>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/^(\s*)[-*] (.*)$/gm, '$1• $2').replace(/^(Answer:.*)$/gm, '<span class="ans">$1</span>');
  return h.replace(/\n/g, '<br>');
}
const plainText = s => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/^#{1,4} /gm, '').replace(/^(\s*)[-*] /gm, '$1• ').trim();
async function askClaude(p, box) {
  const dataUrl = await regionImage(p, box), b64 = dataUrl.split(',')[1];
  const m = openModal(`<div class="ask-head"><span class="ask-badge">${icon('sparkle')}Ask Claude</span><button class="icon-btn" data-close>${icon('x')}</button></div>
    <div class="ask-top"><div class="ask-shot"><img src="${dataUrl}" alt="Your selection"></div>
      <div class="ask-chips">${ASK_PRESETS.map(([q, l]) => `<button class="chip" data-q="${esc(q)}">${l}</button>`).join('')}</div></div>
    <div class="ask-thread"></div>
    <form class="ask-input"><input type="text" placeholder="Ask anything about this, e.g. “solve for x”" autocomplete="off"><button class="btn primary" type="submit">Ask</button></form>`, 'wide ask');
  const thread = $('.ask-thread', m.el), input = $('.ask-input input', m.el), history = []; let busy = false;
  const bubble = (cls, html) => { const d = document.createElement('div'); d.className = 'bubble ' + cls; d.innerHTML = html; thread.appendChild(d); thread.scrollTop = thread.scrollHeight; return d; };
  const needKey = () => bubble('note', `<b>One-time setup:</b> Ask Claude uses your own Claude API key.<ol><li>Go to <b>console.anthropic.com</b> → API Keys → Create key.</li><li>Open Inkbook <b>Settings → Ask Claude</b> and paste it in.</li></ol>Each question usually costs a few cents on your Anthropic account. <button class="chip" data-settings>Open Settings</button>`);
  const send = async q => {
    q = q.trim(); if (!q || busy) return;
    if (!S.claudeKey) return needKey();
    if (!navigator.onLine) return bubble('note', 'You’re offline. Ask Claude needs an internet connection. The offline Calculator (⋯ menu) still works.');
    busy = true; input.value = ''; $('.ask-chips', m.el).classList.add('used');
    bubble('me', esc(q));
    const out = bubble('claude typing', '<span class="dots"><i></i><i></i><i></i></span>');
    history.push({ role: 'user', content: history.length ? [{ type: 'text', text: q }]
      : [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } }, { type: 'text', text: q }] });
    let A, text = '';
    try {
      A = await anthropicSdk();
      const client = await claudeClient();
      const stream = client.beta.messages.stream({
        model: CLAUDE_MODEL, max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',   // a declined request is retried on a fallback model automatically
        output_config: { effort: 'high' },
        system: ASK_SYSTEM, messages: history,
      });
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          text += ev.delta.text; out.classList.remove('typing'); out.innerHTML = mdLite(text); thread.scrollTop = thread.scrollHeight;
        }
      }
      const msg = await stream.finalMessage();
      if (msg.stop_reason === 'refusal') { out.innerHTML = '<i>Claude can’t help with this one.</i>'; history.pop(); }
      else {
        history.push({ role: 'assistant', content: msg.content });
        if (msg.stop_reason === 'max_tokens') text += '\n\n(The answer was cut off because it was very long.)';
        out.innerHTML = mdLite(text);
        const acts = document.createElement('div'); acts.className = 'bubble-acts';
        acts.innerHTML = `<button class="chip" data-ins>Insert on page</button><button class="chip" data-copy>Copy</button>`;
        out.after(acts);
        $('[data-ins]', acts).onclick = () => {
          const before = snap(p), right = box[2] + 340 < p.w;
          p.texts.push({ id: uid(), x: right ? box[2] + 24 : box[0], y: right ? box[1] : Math.min(box[3] + 16, p.h - 80), s: 20, c: '#2f5bea', f: 'sans', text: plainText(text) });
          pushUndo(p, before); refreshPage(p); m.close(); toast('Answer added to the page');
        };
        $('[data-copy]', acts).onclick = async () => { try { await navigator.clipboard.writeText(plainText(text)); toast('Copied'); } catch { toast('Couldn’t copy'); } };
      }
    } catch (e) { console.error(e); history.pop(); out.classList.remove('typing'); out.classList.add('err'); out.textContent = claudeError(e, A); }
    busy = false;
  };
  $('.ask-input', m.el).addEventListener('submit', e => { e.preventDefault(); send(input.value); });
  m.el.addEventListener('click', e => {
    const c = e.target.closest('[data-q]'); if (c) send(c.dataset.q);
    if (e.target.closest('[data-settings]')) { m.close(); openSettings(); }
  });
  input.addEventListener('keydown', e => e.stopPropagation());
  if (!S.claudeKey) needKey();
}
