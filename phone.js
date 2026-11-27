'use strict';
/* =====================================================================
   Inkbook v21 — iPhone design.
   The phone is for checking things at a glance:
   · a Today screen: what's overdue, due today and tomorrow, exams, and
     the notebooks you were last reading
   · a tab bar at the bottom: Today · Notes · Planner, and a + button to
     add a task from anywhere
   · notebooks open for reading (scroll and pinch, links work); tap Edit
     to get the writing tools, Done to go back to reading
   ===================================================================== */
Object.assign(ICONS, {
  today: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M8.5 14.5l2.2 2.2 4.8-4.8"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 016.5 2H20v17H6.5A2.5 2.5 0 004 21.5z"/><path d="M4 21.5V4.5M20 19v3H6.5"/>',
  pencil2: '<path d="M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4z"/>',
});
const isPhone = () => matchMedia('(max-width: 640px)').matches;
const PHONE_VIEWS = { today: 'today', home: 'notes', folder: 'notes', fav: 'notes', recent: 'notes', planner: 'planner' };

function applyPhone() {
  const ph = isPhone(); document.body.classList.toggle('phone', ph);
  if (!ph) setReading(false);
  updateTabbar();
}
function updateTabbar() {
  const cur = PHONE_VIEWS[LIB.view] || 'notes';
  $$('#tabbar [data-pv]').forEach(b => b.classList.toggle('on', b.dataset.pv === cur));
  document.body.dataset.lv = LIB.view;
}

// ---------- Today ----------
async function renderToday(box) {
  await loadPlan(); updatePlannerCount();
  if (!FOLDERS.length) FOLDERS = await db.all('folders');
  const now = new Date(), open = PLAN.tasks.filter(t => !t.done);
  const late = open.filter(isLate).sort(byDue), today = open.filter(t => t.due && !isLate(t) && daysTo(t.due) === 0).sort(byDue);
  const tmrw = open.filter(t => t.due && daysTo(t.due) === 1).sort(byDue), soon = open.filter(t => t.due && daysTo(t.due) > 1 && daysTo(t.due) <= 7).sort(byDue);
  const ex = PLAN.exams.filter(x => daysTo(x.date) >= 0 && daysTo(x.date) <= 30).sort((a, b) => a.date.localeCompare(b.date));
  const st = typeof semText === 'function' ? semText() : null;
  const due = late.length + today.length;
  const head = due ? `<b>${due}</b><span>${due === 1 ? 'thing' : 'things'} due${late.length ? ` · ${late.length} overdue` : ' today'}</span>` : `<b>✓</b><span>Nothing due today</span>`;
  const sec = (title, list, cls = '') => list.length ? `<div class="td-sec ${cls}">${title}<small>${list.length}</small></div><div class="task-list">${list.map(t => remRow(t)).join('')}</div>` : '';
  const recent = [...NBS].sort((a, b) => (b.updated || 0) - (a.updated || 0)).slice(0, 8);
  box.innerHTML = `<div class="today">
    <div class="td-date"><span>${now.toLocaleDateString(undefined, { weekday: 'long' })}</span><b>${now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</b>${st && st.w >= 1 && st.w <= (sem().weeks || 16) ? `<i class="td-week">${esc(st.big)} of ${sem().weeks || 16}</i>` : ''}${globalThis.statusChipHtml?.() || ''}</div>
    <div class="td-focus ${late.length ? 'late' : due ? 'due' : 'clear'}">${head}</div>
    ${sec('Overdue', late, 'late')}${sec('Today', today)}${sec('Tomorrow', tmrw)}
    ${soon.length ? `<div class="td-sec">Next 7 days<small>${soon.length}</small></div><div class="task-list">${soon.slice(0, 4).map(t => remRow(t)).join('')}</div>${soon.length > 4 ? `<button class="td-more" data-go="planner">+ ${soon.length - 4} more in Planner</button>` : ''}` : ''}
    ${!open.length ? `<div class="td-none">No tasks yet. Tap <b>+</b> to add one.</div>` : ''}
    ${ex.length ? `<div class="td-sec">Exams</div><div class="ex-strip">${ex.map(x => { const d = daysTo(x.date); return `<button class="ex-chip" data-exam="${x.id}" style="--c:${esc(subjColor(x.folderId))}"><b>${d === 0 ? 'Today' : d}</b><span>${esc(x.title)}${d ? `<small>${d === 1 ? 'day' : 'days'}</small>` : ''}</span></button>`; }).join('')}</div>` : ''}
    ${recent.length ? `<div class="td-sec">Continue reading</div><div class="td-nbs">${recent.map(n => `<button class="td-nb" data-nb="${n.id}"><span class="td-cover" data-thumb="${esc(n.thumbKey || '')}" style="--c:${esc(folderById(n.folderId)?.color || S.accent)}">${icon('book')}</span><b>${esc(n.title)}</b><small>${n.folderId ? esc(folderById(n.folderId)?.name || '') : ''}</small></button>`).join('')}</div>` : ''}
  </div>`;
  for (const el of $$('[data-thumb]', box)) {
    const k = el.dataset.thumb; if (!k) continue;
    const b = await db.get('blobs', k); if (b instanceof Blob) { const u = URL.createObjectURL(b); coverUrls.push(u); el.style.backgroundImage = `url("${u}")`; el.classList.add('img'); }
  }
}
async function todayClick(e) {
  const c = s => e.target.closest(s);
  if (c('[data-go]')) { LIB.view = c('[data-go]').dataset.go; return showLibrary(); }
  const nb = c('[data-nb]'); if (nb) return openNotebook(nb.dataset.nb);
  const ex = c('[data-exam]'); if (ex) { await loadPlan(); const x = PLAN.exams.find(y => y.id === ex.dataset.exam); if (x && await examMenu(x)) showLibrary(); return; }
  const row = c('[data-task]'); if (!row) return;
  await loadPlan(); const t = PLAN.tasks.find(x => x.id === row.dataset.task); if (!t) return;
  if (c('[data-tick]')) { t.done = !t.done; t.doneAt = Date.now(); await savePlan(); remBadges(); row.classList.toggle('done', t.done); $('.tk-box', row).textContent = t.done ? '✓' : ''; if (t.done) toast('✓ Done', 900); setTimeout(() => LIB.view === 'today' && showLibrary(), 500); return; }
  if (await remForm(t)) showLibrary();
}

// ---------- add a task from anywhere (bottom sheet) ----------
function addTaskSheet() {
  const m = openModal(`<div class="as-grab"></div><h2>New task</h2><div data-cmp></div><div class="modal-actions"><button class="btn" data-close>Done</button></div>`, 'small add-sheet');
  $('[data-cmp]', m.el).classList.add('cmp-always');
  const cmp = makeComposer($('[data-cmp]', m.el), { placeholder: 'e.g. Lab report due fri 5pm', subj: () => LIB.view === 'planner' && planFilter && planFilter !== 'general' ? planFilter : defaultSubj(), onAdd: () => { if (!$('#library').hidden) showLibrary(); } });
  m.el.closest('.modal-back').classList.add('sheet-back');
  setTimeout(() => cmp.focus(), 80);
}

// ---------- reading mode for notebooks on the phone ----------
let reading = false;
function setReading(on) {
  reading = !!on && isPhone() && !!E.nb;
  document.body.classList.toggle('reading', reading);
  scroller.classList.toggle('pencil-only', reading || S.pencilOnly);
  const b = $('#readBtn'); if (b) b.innerHTML = reading ? `${icon('pencil2')}<span>Edit</span>` : `${icon('check')}<span>Done</span>`;
  if (reading) { clearSelection?.(); closePopover?.(); }
  requestAnimationFrame(() => globalThis.fitToolbar?.());
}

function bootPhone() {
  // tab bar
  const bar = document.createElement('nav'); bar.id = 'tabbar'; bar.className = 'tabbar';
  bar.innerHTML = `<button data-pv="today">${icon('today')}<span>Today</span></button><button data-pv="notes">${icon('book')}<span>Notes</span></button><button data-pv="planner">${icon('calendar')}<span>Planner</span><i class="tb-count" id="tabCount"></i></button>`;
  $('#library').appendChild(bar);
  bar.onclick = e => { const b = e.target.closest('[data-pv]'); if (!b) return; LIB.view = { today: 'today', notes: 'home', planner: 'planner' }[b.dataset.pv]; LIB.folderId = null; LIB.q = ''; const s = $('#search'); if (s) s.value = ''; showLibrary(); };
  const fab = document.createElement('button'); fab.className = 'fab'; fab.id = 'fab'; fab.title = 'Add a task'; fab.innerHTML = icon('plus'); fab.onclick = addTaskSheet;
  $('#library').appendChild(fab);
  // edit / done button in the notebook bar
  const rb = document.createElement('button'); rb.id = 'readBtn'; rb.className = 'read-btn'; rb.onclick = () => setReading(!reading);
  $('.tb-right')?.prepend(rb);
  // reading: taps don't draw or edit (links still work), fingers scroll and pinch
  scroller.addEventListener('pointerdown', e => { if (reading && !e.target.closest('.plink-go')) e.stopImmediatePropagation(); }, true);
  // Today view + titles
  const _rlc = renderLibContent;
  renderLibContent = function () { updateTabbar(); if (LIB.view === 'today') return renderToday($('#libContent')); return _rlc(); };
  const _rc = renderCrumbs;
  renderCrumbs = function () { if (LIB.view === 'today' && !LIB.q.trim()) { $('#crumbs').innerHTML = `<span class="crumb cur">Today</span>`; return; } _rc(); if (isPhone() && LIB.view === 'home' && !LIB.q.trim()) $('#crumbs').innerHTML = `<span class="crumb cur">Notes</span>`; };
  $('#libContent').addEventListener('click', e => { if (LIB.view === 'today') guard(todayClick)(e); });
  const _upc = updatePlannerCount;
  updatePlannerCount = function () { _upc(); const n = PLAN.tasks.filter(t => !t.done && t.due && (isLate(t) || daysTo(t.due) === 0)).length; const c = $('#tabCount'); if (c) c.textContent = n || ''; };
  // notebooks open for reading on the phone
  const _open = openNotebook;
  openNotebook = async function (...a) { const r = await _open(...a); setReading(isPhone()); return r; };
  const _leave = leaveNotebook;
  leaveNotebook = async function (...a) { setReading(false); return _leave(...a); };
  matchMedia('(max-width: 640px)').addEventListener('change', () => { applyPhone(); if (isPhone() && !$('#library').hidden && LIB.view === 'home') { LIB.view = 'today'; showLibrary(); } });
  applyPhone();
  if (isPhone() && LIB.view === 'home' && !E.nb) { LIB.view = 'today'; showLibrary(); }
}
