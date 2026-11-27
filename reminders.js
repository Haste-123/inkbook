'use strict';
/* =====================================================================
   Inkbook v14 — quick reminders.
   A bell on every screen opens a panel: type "Lab report due fri 5pm",
   the date, time and subject are picked up for you. Paste a whole list
   from Notes. Alerts 1 day before (while Inkbook is open or when you
   open it) and "Add to Calendar" for alerts even when it is closed.
   Reminders are the planner's tasks, so they also show in Planner.
   ===================================================================== */

Object.assign(ICONS, {
  bell: '<path d="M6 9a6 6 0 0112 0c0 6 2.5 8 2.5 8h-17S6 15 6 9z"/><path d="M10 20.5a2.2 2.2 0 004 0"/>',
  clock2: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  note: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>',
});
if (S.remNotify === undefined) S.remNotify = false;

// ---------- dates & times ----------
const pad2 = n => String(n).padStart(2, '0');
const dayPlus = n => { const t = today0(); return new Date(t.getFullYear(), t.getMonth(), t.getDate() + n); };
const fmtTime = s => { if (!s) return ''; const [h, m] = s.split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
const dueAt = t => { const d = parseDay(t.due); if (!d) return Infinity; const [h, m] = (t.time || '23:59').split(':').map(Number); d.setHours(h, m); return d.getTime(); };
const notifyAt = t => { if (t.time) return dueAt(t) - 864e5; const d = parseDay(t.due); d.setDate(d.getDate() - 1); d.setHours(8, 0); return d.getTime(); };
const isLate = t => !t.done && !!t.due && dueAt(t) < Date.now();
function dueLabel(t) {
  const dd = daysTo(t.due); if (dd == null) return '';
  const day = dd === 0 ? 'Today' : dd === 1 ? 'Tomorrow' : dd === -1 ? 'Yesterday'
    : dd > 1 && dd < 7 ? parseDay(t.due).toLocaleDateString(undefined, { weekday: 'long' }) : fmtDay(t.due);
  return day + (t.time ? ' · ' + fmtTime(t.time) : '');
}
const TAG_COLS = ['#2f5bea', '#e5484d', '#f08c00', '#30a46c', '#8e4ec6', '#0091b3', '#d6409f', '#7c6f64'];
const tagColor = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return TAG_COLS[Math.abs(h) % TAG_COLS.length]; };
const remSubj = t => t.folderId && folderById(t.folderId) ? [subjName(t.folderId), subjColor(t.folderId)] : t.tag ? [t.tag, tagColor(t.tag)] : ['General', '#8a8f98'];

// ---------- "Lab report due fri 5pm" → text, date, time ----------
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const MONTHS3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WDAYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
function parseWhen(raw = '') {
  const t0 = today0(), Y = t0.getFullYear(), M = t0.getMonth(), spans = [];
  let due = null, pri = 9, time = '';
  const dayOf = (y, m, d) => { const x = new Date(y, m, d); return x.getDate() === d && d > 0 ? x : null; };
  const fut = (m, d) => { let x = dayOf(Y, m, d); if (x && x < t0) x = dayOf(Y + 1, m, d); return x; };
  const scan = (re, p, fn) => {
    for (const m of raw.matchAll(re)) {
      const r = fn(m); if (r === false || r === null) continue;
      spans.push([m.index, m.index + m[0].length]);
      if (r instanceof Date && p < pri) { due = r; pri = p; }
      if (typeof r === 'string' && !time) time = r;
    }
  };
  scan(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/gi, 0, m => { const h = +m[1]; if (h < 1 || h > 12) return false; return pad2(h % 12 + (/p/i.test(m[3]) ? 12 : 0)) + ':' + (m[2] || '00'); });
  scan(/\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*(?:am|pm))/gi, 0, m => pad2(+m[1]) + ':' + m[2]);
  scan(/\b(noon|midday|midnight)\b/gi, 0, m => /mid?night/i.test(m[1]) ? '23:59' : '12:00');
  scan(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b\\.?`, 'gi'), 1, m => fut(MONTHS3.indexOf(m[2].slice(0, 3).toLowerCase()), +m[1]));
  scan(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'gi'), 1, m => fut(MONTHS3.indexOf(m[1].slice(0, 3).toLowerCase()), +m[2]));
  scan(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, 1, m => { const mo = +m[2] - 1; if (mo > 11) return false; return m[3] ? dayOf(+m[3] < 100 ? 2000 + +m[3] : +m[3], mo, +m[1]) : fut(mo, +m[1]); });
  scan(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi, 1, m => { const d = +m[1]; let x = dayOf(Y, M, d); if (!x || x < t0) x = dayOf(Y, M + 1, d) || dayOf(Y, M + 2, d); return x; });
  scan(/\b(?:today|tonight|tdy)\b/gi, 2, () => t0);
  scan(/\b(?:tomorrow|tmrw?|tmw|tmr)\b/gi, 2, () => dayPlus(1));
  scan(/\bin\s+(\d{1,2}|an?|one|two|three|four|five)\s+(days?|weeks?)\b/gi, 2, m => dayPlus((NUMW[m[1].toLowerCase()] || +m[1]) * (/w/i.test(m[2]) ? 7 : 1)));
  scan(/\bnext\s+week\b/gi, 2, () => dayPlus(7));
  let wk = null, wd = null;
  scan(/\b(?:week|wk)\s*(\d{1,2})\b|\bw(\d{1,2})\b/gi, 1, m => { if (typeof sem !== 'function' || !sem() || wk != null) return false; const n = +(m[1] || m[2]); if (n < 1 || n > (sem().weeks || 16) + 4) return false; wk = n; return weekStartOf(wk); });
  scan(/\b(next\s+)?(mon|tue|wed|thu|fri|sat|sun)(?:day|s|sday|nesday|rsday|rs|r|urday)?\b/gi, 3, m => {
    if (wd == null) wd = WDAYS[m[2].toLowerCase()];
    let n = (WDAYS[m[2].toLowerCase()] - t0.getDay() + 7) % 7; if (m[1] && n === 0) n = 7; return dayPlus(n);
  });
  if (wk != null && wd != null && pri >= 1) { const a = weekStartOf(wk); due = new Date(a.getFullYear(), a.getMonth(), a.getDate() + (wd - a.getDay() + 7) % 7); }   // "week 16 friday"
  // Take the date words off the end: "Lab report due fri 5pm" → "Lab report"
  let text = raw, cut = false, go = true;
  while (go) {
    go = false; text = text.replace(/[\s,.;:!\-–—(]+$/, '');
    const sp = spans.find(([a, b]) => a < text.length && b >= text.length);
    if (sp) { text = text.slice(0, sp[0]); cut = go = true; continue; }
    const cm = cut && text.match(/\s+(?:due|by|before|on|at|until|till|this|next|or|and|&|from|for)$/i);
    if (cm) { text = text.slice(0, cm.index); go = true; }
  }
  text = text.trim();
  return { text: text || raw.trim(), rest: text, due: due ? isoDay(due) : '', time: due || time ? time : '', found: !!(due || time) };
}

// ---------- subjects ----------
function matchFolder(name) {
  const n = (name || '').trim().toLowerCase(); if (n.length < 2) return null;
  return FOLDERS.find(f => f.name.trim().toLowerCase() === n) || FOLDERS.find(f => { const fn = f.name.trim().toLowerCase(); return fn.length >= 3 && n.length >= 3 && (fn.includes(n) || n.includes(fn)); }) || null;
}
function folderInText(text) {
  const s = ' ' + text.toLowerCase() + ' ';
  return FOLDERS.filter(f => f.name.trim().length >= 3).sort((a, b) => b.name.length - a.name.length).find(f => s.includes(f.name.trim().toLowerCase())) || null;
}
const inEditor = () => !!E.nb && !$('#editor').hidden;
const defaultSubj = () => (inEditor() ? E.nb.folderId : S.remLastF) || '';

// ---------- rows (also used by the Planner) ----------
function remRow(t, showSubj = true) {
  const late = isLate(t), dd = t.due ? daysTo(t.due) : null, [sn, sc] = remSubj(t);
  const cls = t.done ? ' done' : late ? ' late' : dd === 0 ? ' due-today' : dd === 1 ? ' due-soon' : '';
  return `<div class="task${cls}" data-task="${t.id}"><button class="tk-box" data-tick title="Done">${t.done ? '✓' : ''}</button>
    <div class="tk-main"><b>${esc(t.text)}</b><span class="tk-meta">${showSubj ? `<i style="--c:${esc(sc)}"></i><span class="tk-subj">${esc(sn)}</span>` : ''}${showSubj && t.due ? '<span class="tk-dot">·</span>' : ''}${t.due ? `<em>${esc(dueLabel(t))}</em>` : ''}${t.note ? `<span class="tk-ni" title="Has a note">${icon('note')}</span>` : ''}${t.imgs?.length ? `<span class="tk-ni" title="${t.imgs.length} photo${t.imgs.length > 1 ? 's' : ''}">${icon('image')}</span>` : ''}</span></div></div>`;
}
taskRow = remRow;
taskForm = (t, folderId) => remForm(t, folderId);

// ---------- the panel ----------
let REM = null;
function openReminders() {
  if (REM?.m.el.isConnected) { REM.m.close(); return; }
  const m = openModal(`<div class="rem-head"><h2>${icon('bell')}Reminders${globalThis.semChip?.() || ''}</h2><button class="chip rem-alert" data-alert></button><button class="icon-btn" data-close title="Close">${icon('x')}</button></div>
    <div class="rem-add" data-cmp></div>
    <div class="rem-view"><div class="pl-seg small" data-rgroup><button data-v="date">${icon('calendar')}By date</button><button data-v="subject">${icon('folder')}By subject</button></div></div>
    <div class="rem-body" data-body></div>
    <div class="rem-foot"><button class="btn small" data-paste>${icon('list')}Paste a list</button><button class="btn small" data-cal></button><button class="btn small" data-subjects>${icon('folder')}Subjects</button><button class="btn small" data-planner>Planner</button></div>`, 'rem');
  REM = { m };
  const el = m.el;
  const drawAlert = () => {
    const b = $('[data-alert]', el), on = S.remNotify && 'Notification' in window && Notification.permission === 'granted';
    b.classList.toggle('on', on); b.innerHTML = `${icon('bell')}${on ? 'Alerts on' : 'Alerts off'}`;
  };
  const drawList = flash => {
    const open = PLAN.tasks.filter(t => !t.done);
    const ex = PLAN.exams.filter(x => { const d = daysTo(x.date); return d >= 0 && d <= 60; }).sort((a, b) => a.date.localeCompare(b.date));
    const done = PLAN.tasks.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 15);
    $('[data-body]', el).innerHTML =
      (ex.length ? `<div class="rem-exams">${ex.map(x => { const d = daysTo(x.date); return `<button class="rem-exam" data-exam="${x.id}" style="--c:${esc(subjColor(x.folderId))}"><b>${d === 0 ? 'Today' : d + (d === 1 ? ' day' : ' days')}</b><span>${esc(x.title)}</span></button>`; }).join('')}</div>` : '') +
      (open.length ? (S.planGroup === 'subject' ? subjectGroupsHtml(open) : dateGroupsHtml(open))
        : `<div class="rem-empty">${icon('bell')}<b>Nothing to remember</b><span>Type above and press Add. Words like <i>today</i>, <i>fri</i>, <i>27th</i>, <i>5pm</i> set the date for you.</span></div>`) +
      (done.length ? `<details class="task-group"><summary class="tg-head">Done · ${done.length}</summary><div class="task-list">${done.map(t => remRow(t)).join('')}</div></details>` : '');
    if (flash) {                         // highlight the new row briefly (no animation: iPad draws animated rows in the wrong place inside a scrolling panel)
      const r = $(`[data-task="${flash}"]`, el), body = $('[data-body]', el); if (!r) return;
      r.classList.add('just-added'); setTimeout(() => r.classList.remove('just-added'), 600);
      const rb = r.getBoundingClientRect(), bb = body.getBoundingClientRect();
      if (rb.top < bb.top || rb.bottom > bb.bottom) body.scrollTop += rb.top - bb.top - 40;
    }
  };
  REM.redraw = drawList;
  REM.drawCal = () => { const b = $('[data-cal]', el); if (b) b.innerHTML = `${icon('calendar')}${CS?.on ? (CS.err ? '⚠️ Calendar' : 'Calendar ✓') : 'Add to Calendar'}`; };
  el.addEventListener('click', guard(async e => {
    const q = s => e.target.closest(s);
    if (q('[data-cmp]')) return;                                   // the add box handles its own taps
    if (q('[data-rgroup] [data-v]')) { S.planGroup = q('[data-v]').dataset.v; saveSettings(); $$('[data-rgroup] [data-v]', el).forEach(b => b.classList.toggle('on', b.dataset.v === S.planGroup)); drawList(); return; }
    if (q('[data-alert]')) { await toggleAlerts(); drawAlert(); return; }
    if (q('[data-paste]')) { if (await pasteListFlow()) { await loadPlan(); drawList(); remBadges(); remCheck(); } return; }
    if (q('[data-cal]')) { await calendarMenu(); REM?.drawCal(); drawList(); return; }
    if (q('[data-subjects]')) { await subjectsFlow(); await loadPlan(); REM?.cmp?.draw(); drawList(); return; }
    if (q('[data-planner]')) { m.close(); if (inEditor()) await leaveNotebook(); LIB.view = 'planner'; LIB.folderId = null; showLibrary(); return; }
    const ex = q('[data-exam]'); if (ex) { await loadPlan(); const x = PLAN.exams.find(y => y.id === ex.dataset.exam); if (x && await examMenu(x)) { await loadPlan(); drawList(); } return; }
    const row = q('[data-task]'); if (!row) return;
    await loadPlan(); const t = PLAN.tasks.find(x => x.id === row.dataset.task); if (!t) return;
    if (q('[data-tick]')) {
      t.done = !t.done; t.doneAt = Date.now(); await savePlan();
      if (t.done) { row.classList.add('done'); $('.tk-box', row).textContent = '✓'; toast('✓ Done', 900); setTimeout(() => REM && drawList(), 450); } else drawList();
      remBadges(); return;
    }
    if (await remForm(t)) { await loadPlan(); drawList(); remBadges(); remCheck(); }
  }));
  m.onClose = () => { REM = null; if (!$('#library').hidden) showLibrary(); };
  (async () => {
    if (!FOLDERS.length) FOLDERS = await db.all('folders');
    await loadPlan();
    $('[data-cmp]', el).classList.add('cmp-always');
    REM.cmp = makeComposer($('[data-cmp]', el), { placeholder: 'Add a reminder… e.g. Lab report due fri 5pm', subj: defaultSubj, onAdd: t => drawList(t.id) });
    drawAlert(); drawList(); REM.drawCal();
    $$('[data-rgroup] [data-v]', el).forEach(b => b.classList.toggle('on', b.dataset.v === (S.planGroup === 'subject' ? 'subject' : 'date')));
    if (matchMedia('(hover: hover)').matches) REM.cmp.focus();
  })();
}

// ---------- the add box: type, then check or change date, subject and note before adding ----------
// Subjects are keyed: a folder id, 'tag:Name' (a heading from a pasted list) or '' (General).
const normKey = k => (!k || k === 'general') ? '' : k;
function makeComposer(host, { placeholder = 'Add a task… e.g. Lab report due fri 5pm', subj = () => '', onAdd }) {
  host.innerHTML = `<div class="cmp">
    <div class="cmp-in"><span class="cmp-ic">${icon('plus')}</span><input type="text" data-cin placeholder="${esc(placeholder)}" enterkeyhint="done" autocomplete="off"><button class="btn primary small" data-cadd>Add</button></div>
    <div class="cmp-opts">
      <button class="cmp-pill" data-cwhen title="Due date and time">${icon('calendar')}<span></span></button>
      <button class="cmp-pill" data-csubj title="Subject"><i class="sdot"></i><span></span>${icon('chev')}</button>
      <button class="cmp-pill" data-cnote title="Add a note">${icon('edit')}<span>Note</span></button>
      <button class="cmp-pill" data-cphoto title="Add photos">${icon('image')}<span></span></button>
    </div>
    <textarea class="cmp-note" data-cnotetxt rows="2" placeholder="Note (optional), e.g. slides 44–47 not included" hidden></textarea>
  </div>`;
  const el = host.firstElementChild, inp = $('[data-cin]', el), note = $('[data-cnotetxt]', el);
  const st = { auto: parseWhen(''), due: undefined, time: undefined, f: undefined, imgs: [] };
  const due = () => st.due !== undefined ? st.due : st.auto.due;
  const time = () => !due() ? '' : st.time !== undefined ? st.time : st.auto.time;
  const fkey = () => st.f !== undefined ? st.f : normKey(folderInText(inp.value)?.id ?? normKey(subj()));
  let draw = () => {                  // only updates the three buttons: nothing moves while you type
    const d = due(), t = time(), k = fkey(), s = subjInfo(k || 'general');
    const w = $('[data-cwhen]', el); $('span', w).textContent = d ? dueLabel({ due: d, time: t }) : 'No date';
    w.classList.toggle('set', !!d); w.classList.toggle('auto', !!d && st.due === undefined && !!st.auto.due);
    const sb = $('[data-csubj]', el); sb.style.setProperty('--c', s.color); $('span', sb).textContent = s.name;
    sb.classList.toggle('set', !!k); sb.classList.toggle('auto', st.f === undefined && !!folderInText(inp.value));
    $('[data-cnote]', el).classList.toggle('set', !!note.value.trim());
    const ph = $('[data-cphoto]', el); ph.classList.toggle('set', st.imgs.length > 0); $('span', ph).innerHTML = st.imgs.length ? `${st.imgs.length} photo${st.imgs.length > 1 ? 's' : ''}<i class="cph-x" data-cphrm title="Remove photos">✕</i>` : '';
  };
  const add = guard(async () => {
    const raw = inp.value.trim(); if (!raw) { inp.focus(); return toast('Type the task first'); }
    const k = fkey(), d = due();
    const t = { id: uid(), text: st.auto.text || raw, folderId: k && !k.startsWith('tag:') ? k : null, ...(k.startsWith('tag:') ? { tag: k.slice(4) } : {}),
      due: d || '', time: d ? time() || '' : '', note: note.value.trim(), done: false, ...(st.imgs.length ? { imgs: [...st.imgs] } : {}) };
    await loadPlan(); PLAN.tasks.push(t); await savePlan();
    S.remLastF = t.folderId || ''; saveSettings();
    inp.value = ''; note.value = ''; note.hidden = true; st.imgs = [];
    Object.assign(st, { auto: parseWhen(''), due: undefined, time: undefined });   // keep a subject you picked, for the next one
    draw(); remBadges(); remCheck();
    toast(`✓ Added${t.due ? ' · ' + dueLabel(t) : ''}`, 1300);
    await onAdd?.(t);
    if (matchMedia('(hover: hover)').matches) inp.focus();
  });
  inp.addEventListener('input', () => { st.auto = parseWhen(inp.value); draw(); });
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); add(); } });
  note.addEventListener('keydown', e => e.stopPropagation());
  note.addEventListener('input', draw);
  el.addEventListener('click', guard(async e => {
    const q = s => e.target.closest(s);
    if (q('[data-cadd]')) return add();
    if (q('[data-cwhen]')) { const r = await whenPicker(due(), time()); if (r) { st.due = r.due; st.time = r.time; draw(); } return; }
    if (q('[data-csubj]')) { const k = await subjectPicker(fkey()); if (k !== null) { st.f = normKey(k); draw(); } return; }
    if (q('[data-cnote]')) { note.hidden = !note.hidden; if (!note.hidden) note.focus(); return; }
    if (q('[data-cphrm]')) { st.imgs.forEach(k => db.del('blobs', k)); st.imgs = []; draw(); return; }
    if (q('[data-cphoto]')) {
      const files = await pickFiles('image/*', true); if (!files?.length) return;
      st.imgs.push(...await addTaskPhotos(files)); draw(); return;
    }
  }));
  const act = () => el.classList.toggle('active', el.contains(document.activeElement) || !!inp.value.trim() || !note.hidden || st.due !== undefined || st.imgs.length > 0 || picking);
  let picking = false;
  el.addEventListener('focusin', act); el.addEventListener('focusout', () => setTimeout(act, 250));
  el.addEventListener('pointerdown', e => { if (e.target.closest('.cmp-pill')) { picking = true; setTimeout(() => { picking = false; }, 30000); } }, true);
  const _draw = draw; draw = () => { _draw(); picking = false; act(); };
  draw();
  const api = { draw, focus: () => inp.focus(), setSubj: k => { st.f = normKey(k); draw(); inp.focus(); } };
  el._cmp = api; return api;
}
function whenPicker(d = '', t = '') {
  return new Promise(res => {
    const opts = [['', 'No date', ''], [isoDay(dayPlus(0)), 'Today', ''], [isoDay(dayPlus(1)), 'Tomorrow', ''],
      ...[2, 3, 4, 5, 6].map(n => [isoDay(dayPlus(n)), dayPlus(n).toLocaleDateString(undefined, { weekday: 'long' }), dayPlus(n).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })]),
      [isoDay(dayPlus(7)), 'In a week', dayPlus(7).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })]];
    const m = openModal(`<h2>When is it due?</h2>
      <div class="wp-grid">${opts.map(([k, l, sub]) => `<button class="wp-day${k === d ? ' on' : ''}" data-d="${k}"><b>${esc(l)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</button>`).join('')}</div>
      <div class="field two" style="margin-top:14px"><div><label class="lbl">Or pick a date</label><input type="date" data-dd value="${esc(d)}"></div><div><label class="lbl">Time (optional)</label><input type="time" data-tt value="${esc(t)}"></div></div>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Done</button></div>`, 'small');
    const dd = $('[data-dd]', m.el), tt = $('[data-tt]', m.el);
    const mark = () => { $$('[data-d]', m.el).forEach(b => b.classList.toggle('on', b.dataset.d === dd.value)); tt.disabled = !dd.value; if (!dd.value) tt.value = ''; };
    m.el.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) { dd.value = b.dataset.d; mark(); } });
    dd.addEventListener('change', mark); mark();
    let out = null;
    $('[data-ok]', m.el).onclick = () => { out = { due: dd.value, time: dd.value ? tt.value : '' }; m.close(); };
    m.onClose = () => res(out);
  });
}

// ---------- subjects: pick, add, rename, recolor ----------
const SUBJ_COLORS = ['#2f5bea', '#e5484d', '#f08c00', '#30a46c', '#8e4ec6', '#0091b3', '#d6409f', '#b08800', '#7c6f64', '#1f2430'];
const listTags = () => [...new Set(PLAN.tasks.filter(t => t.tag && !(t.folderId && folderById(t.folderId))).map(t => t.tag))].sort();
function subjectPicker(cur = '') {
  return new Promise(async res => {
    if (!FOLDERS.length) FOLDERS = await db.all('folders');
    const keys = ['', ...[...FOLDERS].sort((a, b) => a.name.localeCompare(b.name)).map(f => f.id), ...listTags().map(t => 'tag:' + t)];
    const m = openModal(`<h2>Subject</h2><div class="sp-list">${keys.map(k => { const s = subjInfo(k || 'general'); return `<button class="sp-row${k === cur ? ' on' : ''}" data-k="${esc(k)}" style="--c:${esc(s.color)}"><i class="sp-dot"></i><span>${esc(s.name)}</span>${k.startsWith('tag:') ? '<small>from a list</small>' : ''}${k === cur ? '<b>✓</b>' : ''}</button>`; }).join('')}</div>
      <button class="btn sp-new" data-new>${icon('plus')}New subject</button>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button></div>`, 'small');
    let out = null;
    m.el.addEventListener('click', guard(async e => {
      const r = e.target.closest('[data-k]'); if (r) { out = r.dataset.k; m.close(); return; }
      if (e.target.closest('[data-new]')) { const f = await subjectForm(); if (f) { out = f.id; m.close(); } }
    }));
    m.onClose = () => res(out);
  });
}
// New subject (or edit one). A subject is a folder, so its notebooks can live there too.
function subjectForm(f = null, prefill = '') {
  return new Promise(async res => {
    if (!FOLDERS.length) FOLDERS = await db.all('folders');
    let color = f?.color || SUBJ_COLORS[FOLDERS.length % SUBJ_COLORS.length];
    const m = openModal(`<h2>${f ? 'Edit subject' : 'New subject'}</h2>
      <div class="field"><label class="lbl">Name</label><input type="text" data-name value="${esc(f?.name || prefill)}" placeholder="e.g. Aircraft Design" autocomplete="off"></div>
      <div class="field"><label class="lbl">Color</label><div class="swatches sf-colors">${swatchHtml(SUBJ_COLORS.includes(color) ? SUBJ_COLORS : [color, ...SUBJ_COLORS], color)}</div></div>
      <div class="sf-preview" style="--c:${color}"><i class="sp-dot"></i><span data-prev>${esc(f?.name || prefill || 'Subject')}</span></div>
      ${f ? '' : `<p class="hint">It also appears as a folder in your library, so you can keep this subject's notebooks in it.</p>`}
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>${f ? 'Save' : 'Add subject'}</button></div>`, 'small');
    const name = $('[data-name]', m.el), prev = $('.sf-preview', m.el);
    name.addEventListener('input', () => { $('[data-prev]', m.el).textContent = name.value.trim() || 'Subject'; });
    name.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('[data-ok]', m.el).click(); });
    m.el.addEventListener('click', e => { const s = e.target.closest('.sf-colors [data-v]'); if (s) { color = s.dataset.v; $$('.sf-colors [data-v]', m.el).forEach(x => x.classList.toggle('on', x === s)); prev.style.setProperty('--c', color); } });
    let out = null;
    $('[data-ok]', m.el).onclick = guard(async () => {
      const n = name.value.trim(); if (!n) return toast('Give the subject a name');
      const same = FOLDERS.find(x => x !== f && x.name.trim().toLowerCase() === n.toLowerCase() && !x.parentId);
      if (same && !f) { out = same; m.close(); toast(`“${same.name}” already exists, using it`); return; }
      if (f) { f.name = n; f.color = color; await db.put('folders', f); out = f; }
      else { out = { id: uid(), name: n, color, parentId: null, created: Date.now() }; await db.put('folders', out); FOLDERS.push(out); }
      m.close();
    });
    m.onClose = () => res(out);
    setTimeout(() => name.focus(), 50);
  });
}
async function subjectsFlow() {
  if (!FOLDERS.length) FOLDERS = await db.all('folders');
  await loadPlan();
  return new Promise(res => {
    const m = openModal(`<h2>Subjects</h2><div data-sl></div>
      <button class="btn primary sp-new" data-new>${icon('plus')}New subject</button>
      <div class="modal-actions"><button class="btn" data-close>Done</button></div>`, 'small');
    const draw = () => {
      const cnt = k => { const t = PLAN.tasks.filter(x => !x.done && subjKey(x) === k).length, e = PLAN.exams.filter(x => examKey(x) === k && daysTo(x.date) >= 0).length; return [t && `${t} to do`, e && `${e} exam${e > 1 ? 's' : ''}`].filter(Boolean).join(' · ') || 'Nothing planned'; };
      const fs = [...FOLDERS].sort((a, b) => a.name.localeCompare(b.name)), tags = listTags();
      $('[data-sl]', m.el).innerHTML = (fs.length ? `<div class="sp-list">${fs.map(f => `<div class="sp-row sp-edit" style="--c:${esc(f.color || S.accent)}"><i class="sp-dot"></i><span>${esc(f.name)}<small>${cnt(f.id)}</small></span><button class="btn small" data-edit="${f.id}">Edit</button></div>`).join('')}</div>`
        : `<p class="hint">No subjects yet. Add one for each course you take, e.g. <i>Aircraft Design</i>.</p>`) +
        (tags.length ? `<div class="lib-sec" style="margin:16px 0 6px">From your pasted lists</div><div class="sp-list">${tags.map(t => `<div class="sp-row sp-edit" style="--c:${esc(tagColor(t))}"><i class="sp-dot"></i><span>${esc(t)}<small>${cnt('tag:' + t)}</small></span><button class="btn small" data-mk="${esc(t)}">Make subject</button></div>`).join('')}</div>` : '');
    };
    m.el.addEventListener('click', guard(async e => {
      const ed = e.target.closest('[data-edit]'); if (ed) { if (await subjectForm(folderById(ed.dataset.edit))) draw(); return; }
      const mk = e.target.closest('[data-mk]');
      if (mk) {
        const f = await subjectForm(null, mk.dataset.mk); if (!f) return;
        await loadPlan(); PLAN.tasks.forEach(t => { if (t.tag === mk.dataset.mk && !t.folderId) { t.folderId = f.id; delete t.tag; } }); await savePlan(); draw(); return;
      }
      if (e.target.closest('[data-new]')) { if (await subjectForm()) draw(); }
    }));
    draw();
    m.onClose = () => res();
  });
}

// ---------- edit one reminder ----------
function remForm(t, folderId) {
  return new Promise(async res => {
    if (!FOLDERS.length) FOLDERS = await db.all('folders');
    const v = { text: '', due: '', time: '', note: '', ...(t || {}), folderId: t ? t.folderId : (folderId || null) };
    let due = v.due || '', time = v.time || '', key = v.folderId && folderById(v.folderId) ? v.folderId : v.tag ? 'tag:' + v.tag : '';
    const m = openModal(`<div class="ef-head"><h2>${t ? 'Edit task' : 'New task'}</h2>${t ? `<button class="icon-btn ef-del" data-del title="Delete">${icon('trash')}</button>` : ''}</div>
      <input type="text" class="ef-title" name="t" value="${esc(v.text)}" placeholder="What needs doing?">
      <div class="ef-rows">
        <button class="ef-row" data-when><span class="ef-ic">${icon('calendar')}</span><span class="ef-k">Due</span><span class="ef-v" data-whenv></span>${icon('chev')}</button>
        <button class="ef-row" data-subj><span class="ef-ic"><i class="sdot"></i></span><span class="ef-k">Subject</span><span class="ef-v" data-subjv></span>${icon('chev')}</button>
        ${t?.due && !CS?.on ? `<button class="ef-row" data-cal><span class="ef-ic">${icon('calendar')}</span><span class="ef-k">Add to Calendar</span><span class="ef-v"></span>${icon('chev')}</button>` : ''}
      </div>
      <textarea name="n" rows="3" placeholder="Note (optional), e.g. slides 44–47 not included">${esc(v.note || '')}</textarea>
      <div class="tp-row" data-photos></div>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button></div>`, 'small ef');
    let imgs = [...(v.imgs || [])];
    const drawPh = () => drawThumbs($('[data-photos]', m.el), imgs);
    $('[data-photos]', m.el).addEventListener('click', e => {
      if (e.target.closest('[data-tadd]')) { const f = pickFiles('image/*', true); f.then(async files => { if (!files?.length) return; toast('Adding…', 800); imgs.push(...await addTaskPhotos(files)); drawPh(); }); return; }
      const th = e.target.closest('[data-tk]'); if (th) photoViewer(th.dataset.tk, () => { imgs = imgs.filter(k => k !== th.dataset.tk); drawPh(); });
    });
    drawPh();
    const draw = () => {
      $('[data-whenv]', m.el).textContent = due ? dueLabel({ due, time }) : 'No date';
      $('[data-when]', m.el).classList.toggle('set', !!due);
      const s = subjInfo(key || 'general'); $('[data-subjv]', m.el).textContent = s.name; $('[data-subj] .sdot', m.el).style.background = s.color;
    };
    $$('input, textarea', m.el).forEach(i => i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && i.tagName === 'INPUT') $('[data-ok]', m.el).click(); }));
    let out = false;
    const read = () => ({ text: $('[name=t]', m.el).value.trim(), folderId: key && !key.startsWith('tag:') ? key : null, ...(key.startsWith('tag:') ? { tag: key.slice(4) } : {}), due, time: due ? time : '', note: $('[name=n]', m.el).value.trim(), imgs });
    m.el.addEventListener('click', guard(async e => {
      if (e.target.closest('[data-when]')) { const r = await whenPicker(due, time); if (r) { due = r.due; time = r.time; draw(); } }
      if (e.target.closest('[data-subj]')) { const k = await subjectPicker(key); if (k !== null) { key = normKey(k); draw(); } }
    }));
    $('[data-ok]', m.el).onclick = guard(async () => {
      const n = read(); if (!n.text) return toast('Type the task');
      await loadPlan();
      const old = t && PLAN.tasks.find(x => x.id === t.id);
      const moved = !old || old.due !== n.due || (old.time || '') !== n.time;
      const nt = { ...(old || { id: uid(), done: false }), ...n }; if (moved) { delete nt.n1; delete nt.cal; } if (!n.tag) delete nt.tag; if (!nt.imgs.length) delete nt.imgs;
      for (const k of old?.imgs || []) if (!nt.imgs?.includes(k)) db.del('blobs', k);          // photos you removed
      PLAN.tasks = [...PLAN.tasks.filter(y => y.id !== nt.id), nt]; await savePlan(); out = true; m.close();
    });
    $('[data-del]', m.el)?.addEventListener('click', guard(async () => {
      if (!await confirmBox('Delete this task?')) return;
      await loadPlan(); for (const k of PLAN.tasks.find(y => y.id === t.id)?.imgs || []) db.del('blobs', k);
      PLAN.tasks = PLAN.tasks.filter(y => y.id !== t.id); await savePlan(); out = true; m.close();
    }));
    $('[data-cal]', m.el)?.addEventListener('click', guard(async () => {
      const n = { ...t, ...read() }; if (!n.due) return toast('Give it a due date first');
      if (await calendarFlow([{ id: t.id, title: n.text, due: n.due, time: n.time, desc: [remSubj(n)[0], n.note].filter(Boolean).join(' · ') }])) {
        await loadPlan(); const x = PLAN.tasks.find(y => y.id === t.id); if (x) { Object.assign(x, n, { cal: true }); await savePlan(); } out = true; m.close();
      }
    }));
    m.onClose = () => res(out);
    draw();
  });
}

// ---------- paste a list (e.g. from Notes) ----------
function pasteListFlow() {
  return new Promise(async res => {
    if (!FOLDERS.length) FOLDERS = await db.all('folders');
    const m = openModal(`<h2>Paste a list</h2><p class="hint">Copy your list (from Notes, WhatsApp, anywhere) and paste it below. A line ending in “:” is the subject for the lines under it. Dates like <i>fri</i>, <i>27th</i>, <i>tomorrow 5pm</i> are picked up.</p>
      <textarea data-txt rows="7" placeholder="Aircraft Design:&#10;Lab assignment 3 due friday&#10;&#10;Mechanics of flight:&#10;Project presentation saturday"></textarea>
      <div class="paste-prev" data-prev></div>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok disabled>Add</button></div>`, '');
    const ta = $('[data-txt]', m.el), prev = $('[data-prev]', m.el), ok = $('[data-ok]', m.el);
    let items = [];
    const build = () => {
      items = []; let subj = null;
      for (let line of ta.value.split(/\r?\n/)) {
        line = line.replace(/^\s*(?:[-–•*·▪◦○●☐☑✓✔]|\[[ xX]?\]|\d+[.)])\s+/, '').trim(); if (!line) continue;
        if (/[:：]$/.test(line) && line.length <= 60 && !parseWhen(line.slice(0, -1)).due) {
          const name = line.replace(/[:：]+$/, '').trim(), f = matchFolder(name); subj = f ? { folderId: f.id } : { tag: name }; continue;
        }
        const p = parseWhen(line), last = items[items.length - 1];
        if (!p.rest && p.due && last) { if (!last.due) { last.due = p.due; last.time = p.time; } continue; }   // a date on its own line belongs to the line above
        const inText = folderInText(line);
        items.push({ on: true, text: p.text, due: p.due, time: p.time, ...(inText ? { folderId: inText.id } : subj || {}) });
      }
      prev.innerHTML = items.length ? `<div class="task-list">${items.map((it, i) => { const [sn, sc] = remSubj(it); return `<label class="task"><input type="checkbox" data-i="${i}" ${it.on ? 'checked' : ''}><div class="tk-main"><b>${esc(it.text)}</b><span class="tk-meta"><i style="--c:${esc(sc)}"></i><span class="tk-subj">${esc(sn)}</span><span class="tk-dot">·</span>${it.due ? '<em>' + esc(dueLabel(it)) + '</em>' : '<em>no date</em>'}</span></div></label>`; }).join('')}</div>` : '';
      const n = items.filter(x => x.on).length; ok.disabled = !n; ok.textContent = n ? `Add ${n} reminder${n > 1 ? 's' : ''}` : 'Add';
    };
    ta.addEventListener('input', build); ta.addEventListener('keydown', e => e.stopPropagation());
    prev.addEventListener('change', e => { const i = e.target.dataset.i; if (i != null) { items[+i].on = e.target.checked; const n = items.filter(x => x.on).length; ok.disabled = !n; ok.textContent = n ? `Add ${n} reminder${n > 1 ? 's' : ''}` : 'Add'; } });
    let out = false;
    ok.onclick = guard(async () => {
      await loadPlan();
      const add = items.filter(x => x.on).map(({ on, ...x }) => ({ id: uid(), done: false, folderId: null, ...x }));
      PLAN.tasks.push(...add); await savePlan(); out = true; m.close(); toast(`✓ Added ${add.length} reminder${add.length > 1 ? 's' : ''}`);
    });
    m.onClose = () => res(out);
    try { const txt = await navigator.clipboard?.readText?.(); if (txt && !ta.value) { ta.value = txt; build(); } } catch { }
    ta.focus();
  });
}

// ---------- alerts ----------
const canNotify = () => 'Notification' in window && 'serviceWorker' in navigator;
async function remNotify(title, body, tag) {
  try { const reg = await navigator.serviceWorker.ready; await reg.showNotification(title, { body, tag, icon: 'icon-192.png', badge: 'icon-192.png', data: { reminders: 1 } }); return true; }
  catch { try { new Notification(title, { body, tag, icon: 'icon-192.png' }); return true; } catch { return false; } }
}
async function toggleAlerts() {
  if (S.remNotify && canNotify() && Notification.permission === 'granted') { S.remNotify = false; saveSettings(); toast('Reminder alerts are off'); return; }
  if (!canNotify()) {
    openModal(`<h2>Turn on alerts</h2><p class="msg">iPad only lets Inkbook send notifications when it's opened from its <b>Home Screen icon</b> (not from a Safari tab).</p>
      <ol><li>In Safari, tap <b>Share</b> → <b>Add to Home Screen</b>.</li><li>Open Inkbook from that icon.</li><li>Open Reminders and tap <b>Alerts off</b> again.</li></ol>
      <p class="hint">Or use <b>Add to Calendar</b>: Calendar alerts work everywhere, even when Inkbook is closed.</p><div class="modal-actions"><button class="btn primary" data-close>OK</button></div>`, 'small');
    return;
  }
  let p = Notification.permission;
  if (p === 'default') p = await Notification.requestPermission();
  if (p !== 'granted') { toast(p === 'denied' ? 'Notifications are blocked: turn them on in iPad Settings → Notifications → Inkbook' : 'Alerts not allowed', 5000); return; }
  S.remNotify = true; saveSettings();
  await remNotify('🔔 Alerts are on', 'Inkbook will remind you 1 day before each deadline.', 'rem-on');
  openModal(`<h2>Alerts are on 🔔</h2><p class="msg">You'll get a notification <b>1 day before</b> each reminder and exam.</p>
    <p class="hint">iPad only lets web apps check while they're running, so the alert appears while Inkbook is open, or the moment you next open it. For an alert that arrives even when Inkbook is closed, use <b>Add to Calendar</b> too.</p>
    <div class="modal-actions"><button class="btn primary" data-close>Got it</button></div>`, 'small');
  remCheck();
}
let remChecking = false;
async function remCheck() {
  if (remChecking) return; remChecking = true;
  try {
    await loadPlan(); remBadges();
    if (!S.remNotify || !canNotify() || Notification.permission !== 'granted') return;
    const now = Date.now(); let changed = false;
    for (const t of PLAN.tasks) {
      if (t.done || !t.due || t.n1) continue;
      if (now >= notifyAt(t) && now < dueAt(t)) {
        const dd = daysTo(t.due);
        await remNotify(dd <= 0 ? '⏰ Due today' : '⏰ Due tomorrow', `${t.text}\n${remSubj(t)[0]} · ${dueLabel(t)}`, t.id);
        t.n1 = true; changed = true;
      }
    }
    for (const x of PLAN.exams) {
      if (x.n1) continue; const e = { due: x.date, time: x.time };
      if (now >= notifyAt(e) && now < dueAt(e)) { await remNotify(daysTo(x.date) <= 0 ? '📚 Exam today' : '📚 Exam tomorrow', `${x.title}\n${subjName(x.folderId)} · ${dueLabel(e)}${x.where ? ' · ' + x.where : ''}`, 'ex' + x.id); x.n1 = true; changed = true; }
    }
    if (changed) await savePlan();
  } catch (e) { console.warn(e); } finally { remChecking = false; }
}
function remBadges() {
  const n = PLAN.tasks.filter(t => !t.done && t.due && (isLate(t) || daysTo(t.due) <= 1)).length;
  $$('.rem-badge').forEach(b => (b.textContent = n || ''));
  try { if (n) navigator.setAppBadge?.(n)?.catch(() => { }); else navigator.clearAppBadge?.()?.catch(() => { }); } catch { }
}
{
  const _upc = updatePlannerCount;
  updatePlannerCount = function () { _upc(); remBadges(); };
}

// ---------- Calendar (.ics with an alert 1 day before) ----------
const icsEsc = s => String(s).replace(/[\\;,]/g, c => '\\' + c).replace(/\r?\n/g, '\\n');
// When Calendar alerts you. Kept in the planner, so every device writes the same alerts.
const calAlerts = () => ({ before: true, day: true, near: 60, ...(PLAN.calAlerts || {}) });
function alarmTriggers(it) {
  const a = calAlerts(), out = [];
  if (a.before) out.push(it.time ? '-P1D' : '-PT16H');                         // the day before: 24 h before, or 8 AM the day before
  if (a.day) out.push(it.time ? (a.near ? `-PT${a.near}M` : 'PT0M') : 'PT8H');  // on the day: shortly before, or 8 AM that morning
  return out;
}
const nearText = n => n ? (n >= 60 ? `${n / 60} hour${n > 60 ? 's' : ''}` : `${n} minutes`) + ' before' : 'at the time';
function toIcs(items, o = {}) {
  const stamp = o.stamp || new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''), ymd = d => isoDay(d).replace(/-/g, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Inkbook//Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  if (o.name) L.push(`X-WR-CALNAME:${o.name}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M');
  for (const it of items) {
    L.push('BEGIN:VEVENT', `UID:${it.id}@inkbook`, `DTSTAMP:${stamp}`);
    if (it.time) {
      const s = new Date(dueAt(it)), e = new Date(+s + 30 * 6e4), hm = d => `T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
      L.push(`DTSTART:${ymd(s)}${hm(s)}`, `DTEND:${ymd(e)}${hm(e)}`);
    } else { const d = parseDay(it.due), n = new Date(d); n.setDate(n.getDate() + 1); L.push(`DTSTART;VALUE=DATE:${ymd(d)}`, `DTEND;VALUE=DATE:${ymd(n)}`); }
    L.push(`SUMMARY:${icsEsc(it.title)}`); if (it.desc) L.push(`DESCRIPTION:${icsEsc(it.desc)}`);
    for (const tr of it.triggers || alarmTriggers(it)) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(it.title)}`, `TRIGGER:${tr}`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  // calendar lines may be at most 75 bytes: longer ones continue on the next line after a space
  const enc = new TextEncoder(), fold = line => { if (enc.encode(line).length <= 75) return line; const out = []; let cur = ''; for (const ch of line) { if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ''; } cur += ch; } out.push(cur); return out.join('\r\n '); };
  return L.map(fold).join('\r\n');
}
function calendarFlow(items) {
  return new Promise(res => {
    const file = new File([toIcs(items)], items.length === 1 ? 'Reminder.ics' : 'Inkbook reminders.ics', { type: 'text/calendar' });
    const m = openModal(`<h2>Add to Calendar</h2><p class="msg">${items.length === 1 ? esc(items[0].title) : items.length + ' reminders'} with an alert <b>1 day before</b>. Calendar alerts arrive even when Inkbook is closed.</p>
      <p class="hint">Tap <b>Open in Calendar</b>, then <b>Add All</b>. If a download appears instead, open it from the Downloads list. Changes in Inkbook later won't update the Calendar copy.</p>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button>${navigator.canShare?.({ files: [file] }) ? '<button class="btn" data-share>Share…</button>' : ''}<button class="btn primary" data-go>Open in Calendar</button></div>`, 'small');
    let ok = false;
    $('[data-go]', m.el).onclick = () => {
      const u = URL.createObjectURL(file), a = document.createElement('a'); a.href = u; a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); ok = true; m.close();
    };
    $('[data-share]', m.el)?.addEventListener('click', async () => { try { await navigator.share({ files: [file] }); ok = true; m.close(); } catch { } });
    m.onClose = () => res(ok);
  });
}
async function calendarAllFlow() {
  await loadPlan();
  const ts = PLAN.tasks.filter(t => !t.done && t.due && !t.cal && dueAt(t) > Date.now());
  const xs = PLAN.exams.filter(x => !x.cal && daysTo(x.date) >= 0);
  if (!ts.length && !xs.length) return toast('Everything with a date is already in your Calendar');
  const items = [...ts.map(t => ({ id: t.id, title: t.text, due: t.due, time: t.time, desc: [remSubj(t)[0], t.note].filter(Boolean).join(' · ') })),
    ...xs.map(x => ({ id: 'ex' + x.id, title: '📚 ' + x.title, due: x.date, time: x.time, desc: [subjName(x.folderId), x.where].filter(Boolean).join(' · ') }))];
  if (!await calendarFlow(items)) return;
  ts.forEach(t => (t.cal = true)); xs.forEach(x => (x.cal = true)); await savePlan();
}


// =====================================================================
// Calendar sync: Inkbook keeps a private calendar feed (a secret GitHub
// Gist) up to date; the iPad Calendar subscribes to it once, so every
// add / edit / tick / delete shows up in Calendar by itself.
// =====================================================================
const CS_KEY = 'inkbook.calsync';                       // kept out of backups on purpose (holds the key)
let CS = (() => { try { return JSON.parse(localStorage.getItem(CS_KEY) || 'null'); } catch { return null; } })();
const csSave = () => { try { CS ? localStorage.setItem(CS_KEY, JSON.stringify(CS)) : localStorage.removeItem(CS_KEY); } catch { } };
const csFeed = () => CS?.gistId ? `https://gist.githubusercontent.com/${CS.user}/${CS.gistId}/raw/inkbook.ics` : '';
const csHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
async function gh(path, token, opt = {}) {
  const r = await fetch('https://api.github.com' + path, { ...opt, cache: 'no-store',
    headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (!r.ok) {
    const e = new Error(r.status === 401 ? 'the calendar key was deleted or has expired. Paste a new one'
      : r.status === 404 ? 'the calendar file is gone, or this key belongs to another GitHub account'
      : r.status === 403 ? 'this key can’t edit Gists. Use a classic key with the “gist” box ticked (the notes sync key won’t work here)'
      : 'GitHub error ' + r.status);
    e.status = r.status; throw e;
  }
  return r.status === 204 ? null : r.json();
}
function feedIcs() {
  const since = Date.now() - 30 * 864e5, subj = t => { const n = remSubj(t)[0]; return n === 'General' ? '' : n; };
  const ts = PLAN.tasks.filter(t => !t.done && t.due && dueAt(t) > since)
    .map(t => ({ id: t.id, title: t.text + (subj(t) ? ' · ' + subj(t) : ''), due: t.due, time: t.time, desc: [subj(t), t.note].filter(Boolean).join('\n') }));
  const xs = PLAN.exams.filter(x => x.date && dueAt({ due: x.date, time: x.time }) > since)
    .map(x => ({ id: 'ex' + x.id, title: '📚 ' + x.title, due: x.date, time: x.time, desc: [subjName(x.folderId), x.where].filter(Boolean).join('\n') }));
  const T = PLAN.calTest, test = T && Date.now() < T.at + 3600e3 ? [{ id: 'inkbook-test-' + T.at, title: '✅ Inkbook test alert', due: isoDay(new Date(T.at)), time: `${pad2(new Date(T.at).getHours())}:${pad2(new Date(T.at).getMinutes())}`, desc: 'If you got this alert, Calendar alerts work. It disappears by itself.', triggers: ['PT0M'] }] : [];
  return toIcs([...ts, ...xs, ...test], { name: 'Inkbook', stamp: '20260101T000000Z' });
}
let csTimer = null, csBusy = false;
function calSyncSoon(ms = 2500) {
  if (!CS?.on) return;
  CS.dirty = true; csSave(); clearTimeout(csTimer); csTimer = setTimeout(() => calSyncNow(), ms); refreshStatusChips();
}
// Every Inkbook calendar file on the account (a second device may have made its own): all of them get updated
async function inkbookGists(token) {
  const list = await gh('/gists?per_page=100', token);
  return list.filter(g => /^Inkbook calendar/.test(g.description || '') && g.files?.['inkbook.ics']).sort((a, b) => a.created_at.localeCompare(b.created_at));
}
async function calSyncNow(force = false) {
  if (!CS?.on || csBusy) return false;
  if (!navigator.onLine) { CS.dirty = true; csSave(); return false; }        // not an error: it goes out when you're back online
  csBusy = true;
  refreshStatusChips();
  try {
    await loadPlan();
    const ics = feedIcs(), h = csHash(ics);
    if (!CS.scanAt || Date.now() - CS.scanAt > 6 * 3600e3) {
      try { const gs = await inkbookGists(CS.token); CS.gists = [...new Set([CS.gistId, ...gs.map(g => g.id)])]; CS.scanAt = Date.now(); if (CS.gists.length > 1) force = true; } catch { }
    }
    if (force || h !== CS.hash || CS.err) {
      await gh(`/gists/${CS.gistId}`, CS.token, { method: 'PATCH', body: JSON.stringify({ files: { 'inkbook.ics': { content: ics } } }) });
      for (const id of (CS.gists || []).filter(x => x !== CS.gistId)) {
        try { await gh(`/gists/${id}`, CS.token, { method: 'PATCH', body: JSON.stringify({ files: { 'inkbook.ics': { content: ics } } }) }); }
        catch (e) { if (e.status === 404) CS.gists = CS.gists.filter(x => x !== id); }
      }
    }
    Object.assign(CS, { hash: h, dirty: false, last: Date.now(), err: '' }); csSave(); return true;
  } catch (e) {
    CS.err = e.message; csSave();
    if (e.status === 401 || e.status === 403 || e.status === 404) toast('📅 Calendar sync stopped: ' + e.message + '. Open Reminders → Calendar to fix it.', 6000);
    return false;
  } finally { csBusy = false; REM?.drawCal?.(); refreshStatusChips(); }
}
globalThis.onPlanSaved = () => calSyncSoon();
const agoText = t => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 6e4); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(t).toLocaleDateString(); };

async function calendarMenu() {
  if (CS?.on) {
    const v = await menu('Calendar sync is on', [
      { head: CS.err ? '⚠️ Last update failed: ' + CS.err : `Up to date · updated ${agoText(CS.last)}${(CS.gists || []).length > 1 ? ` · ${CS.gists.length} calendar links` : ''}` },
      { label: CS.err ? 'Try again now' : 'Update Calendar now', value: 'now', icon: 'convert', hint: 'Happens by itself after every change, on any of your devices' },
      { label: 'When to alert me', value: 'alerts', icon: 'bell', hint: (() => { const a = calAlerts(); return [a.before && 'the day before', a.day && 'on the day (' + nearText(a.near) + ' if it has a time)'].filter(Boolean).join(' · ') || 'No alerts'; })() },
      { label: 'Send a test alert', value: 'test', icon: 'check', hint: 'Checks that alerts reach this device' },
      { label: 'Subscribe again / copy the link', value: 'sub', icon: 'calendar', hint: 'If the Inkbook calendar is missing on this device' },
      ...(CS.err ? [{ label: 'Paste a new GitHub key', value: 'key', icon: 'edit' }] : []),
      { label: 'Turn off Calendar sync', value: 'off', icon: 'trash', danger: true }]);
    if (v === 'now') { toast('Updating Calendar…', 1200); CS.scanAt = 0; if (await calSyncNow(true)) toast('📅 Done. Calendar shows it on its next refresh (usually within 15–60 min).', 4000); else toast('⚠️ ' + CS.err, 6000); }
    if (v === 'sub') calSubscribeStep();
    if (v === 'alerts') await calAlertsForm();
    if (v === 'test') await calTestFlow();
    if (v === 'key') await calSetupFlow(true);
    if (v === 'off' && await confirmBox('Stop syncing and delete the private calendar link? The Inkbook calendar on your iPad will empty. You can then remove it in Settings → Calendar → Accounts.', 'Turn off')) {
      try { await gh(`/gists/${CS.gistId}`, CS.token, { method: 'DELETE' }); } catch { }
      CS = null; csSave(); toast('Calendar sync is off');
    }
    return;
  }
  const v = await menu('Calendar', [
    { label: 'Keep Calendar in sync', value: 'sync', icon: 'calendar', hint: 'Recommended: everything goes to Calendar and stays up to date when you edit it' },
    { label: 'One-time export', value: 'once', icon: 'download', hint: 'Adds a copy now. Later edits won’t update it' }]);
  if (v === 'sync') await calSetupFlow();
  if (v === 'once') await calendarAllFlow();
}
function calAlertsForm() {
  return new Promise(res => {
    const a = calAlerts();
    const m = openModal(`<h2>When should Calendar alert you?</h2>
      <label class="toggle"><input type="checkbox" data-before ${a.before ? 'checked' : ''}><span><b>The day before</b><br><small>8 AM the day before, or 24 hours before if it has a time</small></span></label>
      <label class="toggle"><input type="checkbox" data-day ${a.day ? 'checked' : ''}><span><b>On the day</b><br><small>8 AM that morning, or shortly before if it has a time</small></span></label>
      <div class="field" data-nearf><label class="lbl">“Shortly before” means</label><div class="seg" data-near>${segHtml([[0, 'At the time'], [15, '15 min'], [30, '30 min'], [60, '1 hour'], [120, '2 hours']], a.near)}</div></div>
      <p class="hint">Tip: give a reminder a <b>time</b> to be alerted shortly before it. A reminder without a time alerts at 8 AM, so one added for later today won't alert until next time.</p>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button></div>`, 'small');
    let near = a.near; wireSeg($('[data-near]', m.el), v => (near = +v));
    const vis = () => { $('[data-nearf]', m.el).style.opacity = $('[data-day]', m.el).checked ? 1 : .4; }; $('[data-day]', m.el).onchange = vis; vis();
    let ok = false;
    $('[data-ok]', m.el).onclick = guard(async () => {
      await loadPlan(); PLAN.calAlerts = { before: $('[data-before]', m.el).checked, day: $('[data-day]', m.el).checked, near };
      await savePlan(); ok = true; m.close(); await calSyncNow(true); toast('📅 Alerts updated in Calendar', 2000);
    });
    m.onClose = () => res(ok);
  });
}
async function calTestFlow() {
  const at = new Date(Date.now() + 15 * 60e3); at.setSeconds(0, 0); at.setMinutes(Math.ceil(at.getMinutes() / 5) * 5);
  await loadPlan(); PLAN.calTest = { at: +at }; await savePlan(); await calSyncNow(true);
  const t = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }), ready = new Date(Date.now() + 6 * 60e3).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  openModal(`<h2>Test alert at ${esc(t)}</h2>
    <ol class="cs-list"><li>Wait until about <b>${esc(ready)}</b> (GitHub needs ~5 minutes to publish the change).</li>
    <li>Open <b>Calendar</b> → <b>Calendars</b> at the bottom → pull the list down to refresh. “✅ Inkbook test alert” should appear at ${esc(t)}.</li>
    <li>Lock your phone. At <b>${esc(t)}</b> you should get an alert.</li></ol>
    <p class="hint"><b>No alert?</b> Check Settings → Apps → Calendar → Calendar Accounts → Subscribed Calendars → Inkbook → <b>Remove Alerts</b> is <b>off</b>, Settings → Notifications → <b>Calendar</b> is allowed, and Focus / Do Not Disturb is off. The test event removes itself an hour later.</p>
    <div class="modal-actions"><button class="btn primary" data-close>OK</button></div>`, 'small');
}
function calSetupFlow(keyOnly = false) {
  return new Promise(res => {
    const m = openModal(`<h2>${keyOnly ? 'New GitHub key' : 'Keep Calendar in sync'}</h2>
      ${keyOnly ? '' : `<p class="msg">Inkbook keeps a <b>private calendar link</b> up to date. Your iPad Calendar subscribes to it once. After that, every reminder and exam you add, change, tick off or delete here updates in Calendar by itself, with an alert <b>1 day before</b>.</p>
      <p class="hint">The link lives in a secret Gist on your GitHub account. It isn't listed anywhere, but anyone who has the exact link could read your reminders, so don't share it.</p>`}
      <h3 class="cs-step">Make a GitHub key</h3>
      <ol class="cs-list"><li>Tap <b>Create key on GitHub</b> and sign in if asked.</li><li>Set <b>Expiration</b> to <b>No expiration</b>. Only <b>gist</b> should be ticked.</li><li>Tap <b>Generate token</b>, copy it (starts with <b>ghp_</b>), come back and paste it below.</li></ol>
      <a class="btn" href="https://github.com/settings/tokens/new?scopes=gist&description=Inkbook%20calendar" target="_blank" rel="noopener">${icon('go')}Create key on GitHub</a>
      <div class="field" style="margin-top:12px"><input type="password" data-key placeholder="Paste the key here (ghp_…)" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
      <p class="hint">The key stays on this iPad only (not in backups) and can only edit your Gists.</p>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Connect</button></div>`, 'small');
    const inp = $('[data-key]', m.el); inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('[data-ok]', m.el).click(); });
    let ok = false;
    $('[data-ok]', m.el).onclick = guard(async () => {
      const token = inp.value.trim(); if (!token) return toast('Paste the key first');
      const b = $('[data-ok]', m.el); b.disabled = true; b.textContent = 'Connecting…';
      try {
        const user = await gh('/user', token);
        await loadPlan();
        if (keyOnly && CS?.gistId) {
          await gh(`/gists/${CS.gistId}`, token);       // make sure the new key can reach the same calendar
          Object.assign(CS, { token, user: user.login, err: '' }); csSave(); await calSyncNow(true);
        } else {
          const ics = feedIcs(), have = await inkbookGists(token);
          let id;
          if (have.length) {   // another device already made one: use the same calendar, so both keep it up to date
            id = have[0].id; await gh(`/gists/${id}`, token, { method: 'PATCH', body: JSON.stringify({ files: { 'inkbook.ics': { content: ics } } }) });
            toast('📅 Found your Inkbook calendar: this device will keep it up to date too', 4000);
          } else id = (await gh('/gists', token, { method: 'POST', body: JSON.stringify({ description: 'Inkbook calendar (made by the Inkbook app)', public: false, files: { 'inkbook.ics': { content: ics } } }) })).id;
          CS = { on: true, token, user: user.login, gistId: id, gists: have.map(g => g.id).concat(have.length ? [] : [id]), scanAt: Date.now(), hash: csHash(ics), last: Date.now(), dirty: false, err: '' }; csSave();
        }
        ok = true; m.close();
      } catch (e) { b.disabled = false; b.textContent = 'Connect'; toast('⚠️ Couldn’t connect: ' + e.message, 5000); }
    });
    m.onClose = () => { res(ok); if (ok && !keyOnly) calSubscribeStep(true); else if (ok) toast('📅 Calendar sync is working again'); };
    inp.focus();
  });
}
function calSubscribeStep(first = false) {
  const feed = csFeed(), web = feed.replace(/^https:/, 'webcal:');
  const m = openModal(`<h2>${first ? 'Connected ✓ · ' : ''}Subscribe in Calendar</h2>
    <ol class="cs-list"><li>Tap <b>Subscribe in Calendar</b>, then <b>Subscribe</b>.</li>
    <li>On the next screen turn <b>Remove Alerts</b> <b>off</b>, otherwise iPad drops the 1-day-before alerts. Then tap <b>Done</b>.</li>
    <li>For faster updates: iPad <b>Settings → Calendar → Accounts → Fetch New Data</b> → <b>Every 15 Minutes</b>.</li></ol>
    <p class="hint">You only do this once. Changes in Inkbook reach Calendar on the iPad's next refresh (usually within 15–60 minutes).</p>
    <div class="modal-actions"><button class="btn" data-copy>Copy link</button><a class="btn primary" href="${esc(web)}">${icon('calendar')}Subscribe in Calendar</a></div>
    <div class="modal-actions" style="margin-top:8px"><button class="btn" data-close>Done</button></div>`, 'small');
  $('[data-copy]', m.el).onclick = async () => { try { await navigator.clipboard.writeText(feed); toast('Link copied. In Settings → Calendar → Accounts → Add Account → Other → Add Subscribed Calendar, paste it.', 6000); } catch { promptText('Calendar link', feed); } };
}


// =====================================================================
// Planner v2: summary at the top, quick add, group By date or By subject,
// filter by subject, subject cards with progress and next exam.
// =====================================================================
if (S.planGroup === undefined) S.planGroup = 'date';
if (S.planShowDone === undefined) S.planShowDone = false;
let planFilter = '';                                   // '' = everything, else a subject key
const subjKey = t => t.folderId && folderById(t.folderId) ? t.folderId : t.tag ? 'tag:' + t.tag : 'general';
const examKey = x => x.folderId && folderById(x.folderId) ? x.folderId : 'general';
function subjInfo(key) {
  if (key === 'general') return { key, name: 'General', color: '#8a8f98', folderId: null };
  if (key.startsWith('tag:')) { const n = key.slice(4); return { key, name: n, color: tagColor(n), folderId: null, tag: n }; }
  const f = folderById(key); return { key, name: f?.name || 'Subject', color: f?.color || S.accent, folderId: key };
}
const byDue = (a, b) => (a.due ? dueAt(a) : Infinity) - (b.due ? dueAt(b) : Infinity) || (a.text || '').localeCompare(b.text || '');
const DATE_GROUPS = [['Overdue', t => isLate(t)], ['Today', t => !isLate(t) && daysTo(t.due) === 0], ['Tomorrow', t => daysTo(t.due) === 1],
  ['This week', t => daysTo(t.due) > 1 && daysTo(t.due) <= 7], ['Later', t => daysTo(t.due) > 7], ['No date', t => !t.due]];
function dateGroupsHtml(list) {
  return DATE_GROUPS.map(([g, fn]) => { const l = list.filter(t => (g === 'No date' || t.due) && fn(t)).sort(byDue); return l.length ? `<div class="tg-head${g === 'Overdue' ? ' late' : ''}">${g} · ${l.length}</div><div class="task-list">${l.map(t => remRow(t)).join('')}</div>` : ''; }).join('');
}
// subjects in a stable order: folders A–Z, then list headings, then General
function subjectKeys(tasks, exams) {
  const ks = new Set([...tasks.map(subjKey), ...exams.map(examKey)]);
  const rank = k => k === 'general' ? 2 : k.startsWith('tag:') ? 1 : 0;
  return [...ks].sort((a, b) => rank(a) - rank(b) || subjInfo(a).name.localeCompare(subjInfo(b).name));
}
function subjectGroupsHtml(list) {      // compact version for the Reminders panel
  return subjectKeys(list, []).map(k => { const s = subjInfo(k), l = list.filter(t => subjKey(t) === k).sort(byDue);
    return `<div class="tg-head sg-head" style="--c:${esc(s.color)}"><i></i>${esc(s.name)} · ${l.length}</div><div class="task-list">${l.map(t => remRow(t, false)).join('')}</div>`; }).join('');
}

// ---------- semester: which week are we in ----------
const sem = () => PLAN.semester?.start ? PLAN.semester : null;
function semWeek(d = today0()) { const s = sem(); if (!s) return null; const days = Math.round((d - parseDay(s.start)) / 864e5); return Math.floor(days / 7) + 1; }
const weekStartOf = n => { const st = parseDay(sem().start); return new Date(st.getFullYear(), st.getMonth(), st.getDate() + (n - 1) * 7); };
const shortDay = d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
function semText() {
  const s = sem(); if (!s) return null;
  const w = semWeek(), n = s.weeks || 16;
  if (w < 1) { const d = daysTo(s.start); return { big: d === 1 ? 'Tomorrow' : `In ${d} days`, small: `${s.name ? s.name + ' starts' : 'Semester starts'} ${fmtDay(s.start)}`, pct: 0, w }; }
  if (w > n) return { big: 'Done', small: `${s.name || 'Semester'} ended after ${n} weeks`, pct: 100, w };
  const a = weekStartOf(w), b = new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6);
  return { big: `Week ${w}`, small: `of ${n}${s.name ? ' · ' + s.name : ''} · ${shortDay(a)}–${shortDay(b)}`, pct: Math.round((w - 1 + (Math.round((today0() - a) / 864e5) + 1) / 7) / n * 100), w };
}
globalThis.semChip = () => { const t = semText(); return t && t.w >= 1 && t.w <= (sem().weeks || 16) ? `<span class="sem-chip">${esc(t.big)}</span>` : ''; };
function semesterForm() {
  return new Promise(res => {
    const s = sem() || {}, m = openModal(`<h2>Semester</h2>
      <p class="hint" style="margin-top:0">Inkbook shows which week of the semester you're in, groups your tasks by week, and understands dates like <i>week 16 fri</i>.</p>
      <div class="field"><label class="lbl">First day of week 1</label><input type="date" data-start value="${esc(s.start || isoDay(today0()))}"></div>
      <div class="field two"><div><label class="lbl">Number of weeks</label><input type="number" data-weeks min="1" max="40" value="${s.weeks || 16}"></div><div><label class="lbl">Name (optional)</label><input type="text" data-sname value="${esc(s.name || '')}" placeholder="e.g. Fall 2026"></div></div>
      <div class="modal-actions">${s.start ? '<button class="btn danger-outline" data-del>Remove</button>' : ''}<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button></div>`, 'small');
    $$('input', m.el).forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
    let out = false;
    $('[data-ok]', m.el).onclick = guard(async () => {
      const start = $('[data-start]', m.el).value; if (!start) return toast('Pick the first day');
      await loadPlan(); PLAN.semester = { start, weeks: clamp(+$('[data-weeks]', m.el).value || 16, 1, 40), name: $('[data-sname]', m.el).value.trim() }; await savePlan();
      out = true; m.close(); const t = semText(); if (t) toast(`📅 ${t.big}${t.w >= 1 ? ' of ' + PLAN.semester.weeks : ''}`, 1800);
    });
    $('[data-del]', m.el)?.addEventListener('click', guard(async () => { await loadPlan(); delete PLAN.semester; await savePlan(); out = true; m.close(); }));
    m.onClose = () => res(out);
  });
}
// date groups: with a semester, everything after tomorrow is grouped by semester week
function dateGroups(list) {
  const cw = semWeek(), out = [], add = (label, l, sub = '', late = false) => l.length && out.push({ label, l: l.sort(byDue), sub, late });
  add('Overdue', list.filter(isLate), '', true);
  add('Today', list.filter(t => t.due && !isLate(t) && daysTo(t.due) === 0));
  add('Tomorrow', list.filter(t => t.due && daysTo(t.due) === 1));
  const later = list.filter(t => t.due && daysTo(t.due) > 1);
  if (cw != null) {
    const byW = new Map(); for (const t of later) { const w = semWeek(parseDay(t.due)); if (!byW.has(w)) byW.set(w, []); byW.get(w).push(t); }
    for (const w of [...byW.keys()].sort((a, b) => a - b)) {
      const a = w >= 1 ? weekStartOf(w) : null;
      add(w === cw ? 'Later this week' : w === cw + 1 ? `Next week · W${w}` : w >= 1 && w <= (sem().weeks || 16) + 4 ? `Week ${w}` : 'Later', byW.get(w), a && w !== cw ? `${shortDay(a)}–${shortDay(new Date(a.getFullYear(), a.getMonth(), a.getDate() + 6))}` : '');
    }
  } else { add('This week', later.filter(t => daysTo(t.due) <= 7)); add('Later', later.filter(t => daysTo(t.due) > 7)); }
  add('No date', list.filter(t => !t.due));
  return out;
}
dateGroupsHtml = list => dateGroups(list).map(g => `<div class="tg-head${g.late ? ' late' : ''}">${esc(g.label)} · ${g.l.length}${g.sub ? `<small>${esc(g.sub)}</small>` : ''}</div><div class="task-list">${g.l.map(t => remRow(t)).join('')}</div>`).join('');

renderPlanner = async function (box) {
  await loadPlan(); updatePlannerCount();
  if (!FOLDERS.length) FOLDERS = await db.all('folders');
  let root = $('.planner2', box);
  if (!root) {                       // the shell (and the add box in it) is built once, so typing is never interrupted
    box.innerHTML = `<div class="planner2"><div class="pl-sum" data-sum></div><div class="pl-cmp" data-cmp></div><div class="pl-dyn" data-dyn></div></div>`;
    root = $('.planner2', box);
    root._cmp = makeComposer($('[data-cmp]', root), { subj: () => planFilter === 'general' ? '' : planFilter, onAdd: () => renderPlanner(box) });
    wirePlanner2(root, box);
  }
  const inF = x => !planFilter || (x.text !== undefined ? subjKey(x) : examKey(x)) === planFilter;
  const all = PLAN.tasks, open = all.filter(t => !t.done);
  const exams = [...PLAN.exams].sort((a, b) => a.date.localeCompare(b.date)), upEx = exams.filter(x => daysTo(x.date) >= 0);
  const late = open.filter(isLate).length, today = open.filter(t => t.due && !isLate(t) && daysTo(t.due) === 0).length;
  const week = open.filter(t => t.due && daysTo(t.due) >= 1 && daysTo(t.due) <= 7).length;
  // summary: semester week + three small counters
  const st = semText();
  const counts = [[late, 'overdue', 'late', 'Overdue'], [today, 'today', 'tdy', 'Today'], [week, 'next 7 days', 'week', '']].filter(c => c[0]);
  $('[data-sum]', root).innerHTML = statusChipHtml() + (st ? `<button class="sem-card" data-sem title="Change semester"><div class="sem-top"><b>${esc(st.big)}</b><span>${esc(st.small)}</span></div><div class="sem-prog"><i style="width:${st.pct}%"></i></div></button>` : '') +
    `<div class="pl-counts">${counts.length ? counts.map(([n, l, c, j]) => `<button class="pl-count ${c}" ${j ? `data-jump="${j}"` : ''}><b>${n}</b>${l}</button>`).join('') : `<span class="pl-clear">${icon('check')}All caught up</span>`}</div>`;

  const folderKeys = [...FOLDERS].sort((a, b) => a.name.localeCompare(b.name)).map(f => f.id);
  const used = new Set(subjectKeys(all.filter(t => !t.done || S.planShowDone), upEx));
  const chipKeys = [...folderKeys, ...[...used].filter(k => !folderKeys.includes(k))];
  if (planFilter && !chipKeys.includes(planFilter)) planFilter = '';
  const fTasks = all.filter(t => inF(t) && (!t.done || S.planShowDone)), fOpen = fTasks.filter(t => !t.done), fDone = fTasks.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const fEx = upEx.filter(inF), bySubj = S.planGroup === 'subject';

  let tasksHtml;
  if (bySubj) {
    const ks = planFilter ? [planFilter] : [...folderKeys, ...[...used].filter(k => !folderKeys.includes(k))];
    tasksHtml = ks.length ? `<div class="subj-grid">${ks.map(k => {
      const s = subjInfo(k), ts = all.filter(t => subjKey(t) === k), op = ts.filter(t => !t.done).sort(byDue), dn = ts.filter(t => t.done);
      const recent = dn.filter(t => Date.now() - (t.doneAt || 0) < 30 * 864e5).length, total = op.length + recent, pct = total ? Math.round(recent / total * 100) : 0;
      const ex = upEx.find(x => examKey(x) === k), lateN = op.filter(isLate).length, fid = k.startsWith('tag:') || k === 'general' ? '' : k;
      return `<section class="subj-card" style="--c:${esc(s.color)}">
        <div class="sc-head"><i class="sc-dot"></i><b>${esc(s.name)}</b>${lateN ? `<span class="sc-late">${lateN} late</span>` : ''}${ex ? `<button class="sc-exam" data-exam="${ex.id}" title="${esc(ex.title)}">📚 ${daysTo(ex.date) === 0 ? 'today' : daysTo(ex.date) + 'd'}</button>` : ''}${fid ? `<button class="icon-btn sc-more" data-sedit="${fid}" title="Rename or recolor">${icon('edit')}</button>` : ''}<button class="icon-btn sc-add" data-sadd="${esc(k)}" title="Add a task">${icon('plus')}</button></div>
        ${total ? `<div class="sc-prog"><i style="width:${pct}%"></i></div>` : ''}
        ${op.length ? `<div class="task-list">${op.map(t => remRow(t, false)).join('')}</div>` : `<div class="sc-empty">${recent ? 'All done 🎉' : 'Nothing yet'}</div>`}
        ${S.planShowDone && dn.length ? `<div class="task-list sc-done">${dn.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 10).map(t => remRow(t, false)).join('')}</div>` : ''}
      </section>`; }).join('')}<button class="subj-card sc-new" data-newsubj>${icon('plus')}<b>New subject</b></button></div>`
      : `<div class="rem-empty">${icon('folder')}<b>No subjects yet</b><button class="btn primary" data-newsubj>${icon('plus')}New subject</button></div>`;
  } else {
    tasksHtml = fOpen.length || (S.planShowDone && fDone.length) ? dateGroupsHtml(fOpen) + (S.planShowDone && fDone.length ? `<div class="tg-head">Done · ${fDone.length}</div><div class="task-list">${fDone.slice(0, 40).map(t => remRow(t)).join('')}</div>` : '')
      : `<div class="rem-empty">${icon('check')}<b>${planFilter ? 'Nothing to do for ' + esc(subjInfo(planFilter).name) : 'Nothing to do'}</b></div>`;
  }
  $('[data-dyn]', root).innerHTML = `
    ${fEx.length ? `<div class="ex-strip">` : '<div class="ex-strip" hidden>'}${fEx.map(x => { const d = daysTo(x.date); return `<button class="ex-chip" data-exam="${x.id}" style="--c:${esc(subjColor(x.folderId))}"><b>${d === 0 ? 'Today' : d}</b><span>${esc(x.title)}${d ? `<small>${d === 1 ? 'day' : 'days'}</small>` : ''}</span></button>`; }).join('')}<button class="ex-add" data-padd="exam">${icon('plus')}Exam</button>${exams.length - upEx.length ? `<button class="ex-add" data-past>${exams.length - upEx.length} past</button>` : ''}</div>
    <div class="pl-bar">
      <div class="pl-seg" data-group><button class="${!bySubj ? 'on' : ''}" data-v="date" title="Group by date">${icon('calendar')}Date</button><button class="${bySubj ? 'on' : ''}" data-v="subject" title="Group by subject">${icon('folder')}Subject</button></div>
      ${!bySubj ? `<div class="rem-chips pl-filter"><button class="chip${!planFilter ? ' on' : ''}" data-filt="">All</button>${chipKeys.map(k => { const s = subjInfo(k), n = open.filter(t => subjKey(t) === k).length; return `<button class="chip${planFilter === k ? ' on' : ''}" data-filt="${esc(k)}" style="--c:${esc(s.color)}"><i class="sdot"></i>${esc(s.name)}${n ? `<small>${n}</small>` : ''}</button>`; }).join('')}</div>` : '<span style="flex:1"></span>'}
      <button class="btn small pl-opt" data-pmenu>${icon('sliders')}<span>Options</span></button>
    </div>
    ${tasksHtml}`;
  root._cmp.draw();
};
function wirePlanner2(root, box) {
  const again = () => renderPlanner(box);
  root.addEventListener('click', guard(async e => {
    const c = s => e.target.closest(s);
    if (c('[data-cmp]')) return;
    if (c('[data-group] [data-v]')) { S.planGroup = c('[data-v]').dataset.v; saveSettings(); return again(); }
    if (c('[data-filt]')) { planFilter = c('[data-filt]').dataset.filt; return again(); }
    if (c('[data-sem]')) { if (await semesterForm()) again(); return; }
    if (c('[data-past]')) {
      const past = PLAN.exams.filter(x => daysTo(x.date) < 0).sort((a, b) => b.date.localeCompare(a.date));
      const id = await menu('Past exams', past.map(x => ({ label: x.title, value: x.id, icon: 'calendar', hint: `${fmtDay(x.date)} · ${subjName(x.folderId)}` })));
      const x = id && PLAN.exams.find(y => y.id === id); if (x && await examMenu(x)) again(); return;
    }
    if (c('[data-pmenu]')) {
      const v = await menu('Planner', [{ label: S.planShowDone ? 'Hide finished tasks' : 'Show finished tasks', value: 'done', icon: 'check' },
        ...(PLAN.tasks.some(t => t.done) ? [{ label: 'Clear finished tasks', value: 'clear', icon: 'trash' }] : []),
        { label: 'Subjects', value: 'subj', icon: 'folder', hint: 'Add, rename or recolor' }, { label: sem() ? 'Semester' : 'Set semester start', value: 'sem', icon: 'calendar', hint: 'Track which week you are in' },
        { label: 'Add an exam', value: 'exam', icon: 'plus' }, { label: 'Paste a list', value: 'paste', icon: 'list', hint: 'e.g. your homework list from Notes' }]);
      if (v === 'done') { S.planShowDone = !S.planShowDone; saveSettings(); }
      if (v === 'clear') { const n = PLAN.tasks.filter(t => t.done).length; if (await confirmBox(`Remove ${n} finished task${n > 1 ? 's' : ''}?`, 'Clear')) { await loadPlan(); PLAN.tasks = PLAN.tasks.filter(t => !t.done); await savePlan(); } }
      if (v === 'subj') await subjectsFlow();
      if (v === 'sem') await semesterForm();
      if (v === 'exam') await examForm(null, planFilter && !planFilter.includes(':') && planFilter !== 'general' ? planFilter : null);
      if (v === 'paste') await pasteListFlow();
      if (v) again(); return;
    }
    if (c('[data-newsubj]')) { const f = await subjectForm(); if (f) { planFilter = f.id; await again(); } return; }
    if (c('[data-sedit]')) { if (await subjectForm(folderById(c('[data-sedit]').dataset.sedit))) again(); return; }
    if (c('[data-jump]')) { const j = c('[data-jump]').dataset.jump; planFilter = ''; S.planGroup = 'date'; saveSettings(); await again(); [...$$('.tg-head', root)].find(h => h.textContent.startsWith(j))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (c('[data-sadd]')) { root._cmp.setSubj(c('[data-sadd]').dataset.sadd); $('[data-cmp]', root).scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (c('[data-padd]')) { if (await examForm(null, planFilter && !planFilter.includes(':') && planFilter !== 'general' ? planFilter : null)) again(); return; }
    const ex = c('[data-exam]'); if (ex) { const x = PLAN.exams.find(y => y.id === ex.dataset.exam); if (x && await examMenu(x)) again(); return; }
    const row = c('[data-task]'); if (!row) return;
    await loadPlan(); const t = PLAN.tasks.find(x => x.id === row.dataset.task); if (!t) return;
    if (c('[data-tick]')) {
      t.done = !t.done; t.doneAt = Date.now(); await savePlan(); remBadges();
      if (t.done) { row.classList.add('done'); $('.tk-box', row).textContent = '✓'; toast('✓ Nice work', 900); setTimeout(again, 450); } else again();
      return;
    }
    if (await remForm(t)) { again(); remCheck(); }
  }));
}

// ---------- "Everything is up to date" (notes sync + Calendar) ----------
function statusParts() {
  const out = [];
  if (typeof SY !== 'undefined' && SY?.on) out.push({ k: 'notes', name: 'Notes & planner', state: syncing ? 'busy' : SY.err ? 'err' : !navigator.onLine || syDirty.size ? 'wait' : 'ok', last: SY.last, err: SY.err });
  if (CS?.on) out.push({ k: 'cal', name: 'Calendar', state: csBusy ? 'busy' : CS.err ? 'err' : CS.dirty || !navigator.onLine ? 'wait' : 'ok', last: CS.last, err: CS.err });
  return out;
}
const ST_LBL = { ok: 'Up to date', busy: 'Updating…', wait: 'Waiting to sync', err: 'Needs attention' };
const ST_IC = { ok: 'check', busy: 'sync', wait: 'clock', err: 'bell' };
function statusChipHtml() {
  const ps = statusParts(); if (!ps.length) return '';
  const st = ['err', 'busy', 'wait', 'ok'].find(s => ps.some(p => p.state === s));
  return `<button class="st-chip st-${st}" data-status title="Sync and Calendar status">${icon(ST_IC[st])}<span>${ST_LBL[st]}</span></button>`;
}
globalThis.statusChipHtml = statusChipHtml;
function refreshStatusChips() { const h = statusChipHtml(); for (const b of $$('[data-status]')) { if (!h) { b.remove(); continue; } const t = document.createElement('template'); t.innerHTML = h; b.replaceWith(t.content.firstElementChild); } }
function statusSheet() {
  const draw = () => {
    const ps = statusParts();
    return `<h2>Sync status</h2><div class="st-list">${ps.map(p => `<div class="st-row st-${p.state}"><span class="st-ic">${icon(ST_IC[p.state])}</span><div class="st-t"><b>${p.name}</b><small>${p.state === 'err' ? esc(p.err) : p.state === 'busy' ? 'Updating now…' : p.state === 'wait' ? (navigator.onLine ? 'Changes waiting, going out in a few seconds' : 'Offline: goes out when you’re back online') : 'Up to date · ' + agoText(p.last)}</small></div><button class="btn small" data-now="${p.k}">${icon('sync')}Now</button></div>`).join('')}</div>
      ${CS?.on ? `<p class="hint">Calendar shows a change <b>5–60 minutes</b> after it's sent: GitHub keeps each version of the calendar file for 5 minutes, then your iPhone and iPad download it on their own schedule. To check sooner, open Calendar → <b>Calendars</b> and pull the list down.</p>` : ''}
      <div class="modal-actions"><button class="btn primary" data-close>Done</button></div>`;
  };
  const m = openModal(draw(), 'small');
  const t = setInterval(() => { if (!m.el.isConnected) return clearInterval(t); m.el.innerHTML = draw(); }, 1000);
  m.el.addEventListener('click', guard(async e => {
    const b = e.target.closest('[data-now]'); if (!b) return;
    if (b.dataset.now === 'notes') await syncNow().catch(err => toast('⚠️ ' + err.message, 5000));
    else { CS.scanAt = 0; await calSyncNow(true); }
    m.el.innerHTML = draw();
  }));
}
document.addEventListener('click', e => { if (e.target.closest('[data-status]')) { e.stopPropagation(); statusSheet(); } }, true);
setInterval(refreshStatusChips, 30000);
addEventListener('online', refreshStatusChips); addEventListener('offline', refreshStatusChips);

// ---------- the editor top bar never scrolls ----------
function fitToolbar() {
  const tb = $('.toolbar'); if (!tb || $('#editor').hidden) return;
  for (let i = 1; i <= 5; i++) tb.classList.remove('tight' + i);
  for (let i = 1; i <= 5 && tb.scrollWidth > tb.clientWidth + 1; i++) tb.classList.add('tight' + i);
}

// ---------- boot ----------
function bootReminders() {
  { const tb = $('.toolbar'); if (tb) { new ResizeObserver(() => fitToolbar()).observe(tb); } addEventListener('resize', fitToolbar); }
  { const _o = openNotebook; openNotebook = async function (...a) { const r = await _o(...a); requestAnimationFrame(fitToolbar); return r; }; }
  { const _u = updateToolbar; updateToolbar = function (...a) { const r = _u(...a); requestAnimationFrame(fitToolbar); return r; }; }
  const mk = id => { const b = document.createElement('button'); b.className = 'icon-btn rem-bell'; b.id = id; b.title = 'Reminders'; b.innerHTML = icon('bell') + '<span class="rem-badge"></span>'; b.onclick = () => openReminders(); return b; };
  $('#newBtn')?.before(mk('remLibBtn'));
  $('#moreBtn')?.before(mk('remEdBtn'));
  remCheck(); setInterval(remCheck, 5 * 60e3);
  if (CS?.on) setTimeout(() => calSyncNow(), 4000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { remCheck(); if (CS?.on && (CS.dirty || CS.err)) calSyncNow(); } });
  addEventListener('online', () => { if (CS?.on && CS.dirty) calSyncNow(); });
  if (CS?.on && CS.dirty) setTimeout(calSyncNow, 3000);
  navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.openReminders && !REM?.m.el.isConnected) openReminders(); });
  if (new URLSearchParams(location.search).has('reminders')) setTimeout(() => !REM?.m.el.isConnected && openReminders(), 600);
}
