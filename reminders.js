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
  scan(/\b(next\s+)?(mon|tue|wed|thu|fri|sat|sun)(?:day|s|sday|nesday|rsday|rs|r|urday)?\b/gi, 3, m => {
    let n = (WDAYS[m[2].toLowerCase()] - t0.getDay() + 7) % 7; if (m[1] && n === 0) n = 7; return dayPlus(n);
  });
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
    <div class="tk-main"><b>${esc(t.text)}</b><span>${showSubj ? `<i style="--c:${esc(sc)}"></i>${esc(sn)}` : ''}${showSubj && t.due ? ' · ' : ''}${t.due ? `<em>${esc(dueLabel(t))}</em>` : ''}${t.note ? ' · 📝' : ''}${t.cal && !CS?.on ? ' · 📅' : ''}</span>${t.note ? `<small class="tk-note">${esc(t.note)}</small>` : ''}</div></div>`;
}
taskRow = remRow;
taskForm = (t, folderId) => remForm(t, folderId);

// ---------- the panel ----------
let REM = null;
function openReminders() {
  if (REM?.m.el.isConnected) { REM.m.close(); return; }
  const m = openModal(`<div class="rem-head"><h2>${icon('bell')}Reminders</h2><button class="chip rem-alert" data-alert></button><button class="icon-btn" data-close title="Close">${icon('x')}</button></div>
    <div class="rem-add">
      <div class="rem-in"><input type="text" data-in placeholder="Add a reminder… e.g. Lab report due fri 5pm" enterkeyhint="done" autocomplete="off"><button class="btn primary" data-add>Add</button></div>
      <div class="rem-auto" data-auto hidden></div>
      <div class="rem-row"><span class="rem-lbl">When</span><div class="rem-chips" data-when></div></div>
      <div class="rem-row"><span class="rem-lbl">Subject</span><div class="rem-chips" data-subj></div></div>
    </div>
    <div class="rem-view"><div class="pl-seg small" data-rgroup><button data-v="date">${icon('calendar')}By date</button><button data-v="subject">${icon('folder')}By subject</button></div></div>
    <div class="rem-body" data-body></div>
    <div class="rem-foot"><button class="btn small" data-paste>${icon('list')}Paste a list</button><button class="btn small" data-cal></button><button class="btn small" data-planner>Planner</button></div>`, 'rem');
  REM = { m };
  const el = m.el, inp = $('[data-in]', el);
  const st = { auto: parseWhen(''), due: undefined, time: undefined, f: undefined, keep: false };
  const curDue = () => st.due !== undefined ? st.due : st.keep ? '' : st.auto.due;
  const curTime = () => st.time !== undefined ? st.time : st.keep ? '' : st.auto.time;
  const curF = () => st.f !== undefined ? st.f : (folderInText(inp.value)?.id ?? defaultSubj());

  const drawAlert = () => {
    const b = $('[data-alert]', el), on = S.remNotify && 'Notification' in window && Notification.permission === 'granted';
    b.classList.toggle('on', on); b.innerHTML = `${icon('bell')}${on ? 'Alerts on' : 'Alerts off'}`;
  };
  const drawAdd = () => {
    const due = curDue(), time = curTime(), f = curF();
    const a = $('[data-auto]', el), shown = st.auto.found && !st.keep && inp.value.trim();
    a.hidden = !shown;
    if (shown) a.innerHTML = `<span>Found:</span>${st.auto.due ? `<b>📅 ${esc(dueLabel({ due: st.auto.due }))}</b>` : ''}${st.auto.time ? `<b>⏰ ${esc(fmtTime(st.auto.time))}</b>` : ''}<button class="rem-x" data-keep title="Ignore">✕</button>`;
    const days = [['', 'No date'], [isoDay(dayPlus(0)), 'Today'], [isoDay(dayPlus(1)), 'Tomorrow'],
      ...[2, 3, 4, 5, 6].map(n => [isoDay(dayPlus(n)), dayPlus(n).toLocaleDateString(undefined, { weekday: 'short' })])];
    const other = due && !days.some(([k]) => k === due);
    $('[data-when]', el).innerHTML = days.map(([k, l]) => `<button class="chip${k === due ? ' on' : ''}" data-due="${k}">${l}</button>`).join('') +
      `<label class="chip rem-pick${other ? ' on' : ''}">${icon('calendar')}<span>${other ? esc(fmtDay(due)) : 'Date'}</span><input type="date" data-date value="${esc(due)}"></label>` +
      (due ? `<label class="chip rem-pick${time ? ' on' : ''}">${icon('clock2')}<span>${time ? esc(fmtTime(time)) : 'Time'}</span><input type="time" data-time value="${esc(time)}"></label>${time ? `<button class="chip" data-notime>✕</button>` : ''}` : '');
    const subs = [['', 'General', '#8a8f98'], ...[...FOLDERS].sort((x, y) => x.name.localeCompare(y.name)).map(x => [x.id, x.name, x.color || S.accent])];
    $('[data-subj]', el).innerHTML = subs.map(([k, l, c]) => `<button class="chip${(k || '') === (f || '') ? ' on' : ''}" data-f="${k}" style="--c:${esc(c)}"><i class="sdot"></i>${esc(l)}</button>`).join('');
    $('[data-when] .on', el)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('[data-subj] .on', el)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
    if (flash) { const r = $(`[data-task="${flash}"]`, el); r?.classList.add('flash'); r?.scrollIntoView({ block: 'nearest' }); }
  };
  REM.redraw = drawList;
  REM.drawCal = () => { const b = $('[data-cal]', el); if (b) b.innerHTML = `${icon('calendar')}${CS?.on ? (CS.err ? '⚠️ Calendar' : 'Calendar ✓') : 'Add to Calendar'}`; };

  const add = guard(async () => {
    const raw = inp.value.trim(); if (!raw) { inp.focus(); return toast('Type what you need to remember'); }
    const due = curDue(), f = curF();
    await loadPlan();
    const t = { id: uid(), text: (st.keep ? raw : st.auto.text) || raw, folderId: f || null, due: due || '', time: due ? curTime() || '' : '', done: false };
    PLAN.tasks.push(t); await savePlan();
    S.remLastF = t.folderId || ''; saveSettings();
    inp.value = ''; Object.assign(st, { auto: parseWhen(''), due: undefined, time: undefined, f: undefined, keep: false });
    drawAdd(); drawList(t.id); remBadges(); remCheck();
    toast(`✓ Added${t.due ? ' · ' + dueLabel(t) : ''}`, 1400);
    if (matchMedia('(hover: hover)').matches) inp.focus();
  });
  inp.addEventListener('input', () => { st.auto = parseWhen(inp.value); if (!inp.value.trim()) st.keep = false; drawAdd(); });
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); add(); } });
  $('[data-add]', el).onclick = add;
  el.addEventListener('change', e => {
    if (e.target.matches('[data-date]')) { st.due = e.target.value; drawAdd(); }
    if (e.target.matches('[data-time]')) { st.time = e.target.value; drawAdd(); }
  });
  el.addEventListener('click', guard(async e => {
    const q = s => e.target.closest(s);
    if (q('[data-keep]')) { st.keep = true; drawAdd(); return; }
    if (q('[data-rgroup] [data-v]')) { S.planGroup = q('[data-v]').dataset.v; saveSettings(); $$('[data-rgroup] [data-v]', el).forEach(b => b.classList.toggle('on', b.dataset.v === S.planGroup)); drawList(); return; }
    if (q('[data-due]')) { st.due = q('[data-due]').dataset.due; if (!st.due) st.time = ''; drawAdd(); return; }
    if (q('[data-notime]')) { st.time = ''; drawAdd(); return; }
    if (q('[data-f]')) { st.f = q('[data-f]').dataset.f; drawAdd(); return; }
    if (q('[data-alert]')) { await toggleAlerts(); drawAlert(); return; }
    if (q('[data-paste]')) { if (await pasteListFlow()) { await loadPlan(); drawList(); remBadges(); remCheck(); } return; }
    if (q('[data-cal]')) { await calendarMenu(); REM?.drawCal(); drawList(); return; }
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
    await loadPlan(); drawAlert(); drawAdd(); drawList(); REM.drawCal();
    $$('[data-rgroup] [data-v]', el).forEach(b => b.classList.toggle('on', b.dataset.v === (S.planGroup === 'subject' ? 'subject' : 'date')));
    if (matchMedia('(hover: hover)').matches) inp.focus();
  })();
}

// ---------- edit one reminder ----------
function remForm(t, folderId) {
  return new Promise(async res => {
    if (!FOLDERS.length) FOLDERS = await db.all('folders');
    const v = t || { text: '', folderId: folderId || '', due: '', time: '', note: '' };
    const m = openModal(`<h2>${t ? 'Edit reminder' : 'New reminder'}</h2>
      <div class="field"><label class="lbl">Reminder</label><input type="text" name="t" value="${esc(v.text)}" placeholder="e.g. Finish problem set 4"></div>
      <div class="field"><label class="lbl">Subject</label>${subjSelect(v.folderId)}${!v.folderId && v.tag ? `<small class="hint">From your list: ${esc(v.tag)}</small>` : ''}</div>
      <div class="field two"><div><label class="lbl">Due date</label><input type="date" name="d" value="${esc(v.due || '')}"></div><div><label class="lbl">Time (optional)</label><input type="time" name="tm" value="${esc(v.time || '')}"></div></div>
      <div class="field"><label class="lbl">Note (optional)</label><textarea name="n" rows="2" placeholder="e.g. Slides 44–47 not included">${esc(v.note || '')}</textarea></div>
      <div class="modal-actions">${t ? `<button class="btn danger-outline" data-del>Delete</button>` : ''}${t?.due && !CS?.on ? `<button class="btn" data-cal>${icon('calendar')}Calendar</button>` : ''}<button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Save</button></div>`, 'small');
    $$('input, textarea', m.el).forEach(i => i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && i.tagName === 'INPUT') $('[data-ok]', m.el).click(); }));
    let out = false;
    const read = () => ({ text: $('[name=t]', m.el).value.trim(), folderId: $('[name=f]', m.el).value || null, due: $('[name=d]', m.el).value, time: $('[name=d]', m.el).value ? $('[name=tm]', m.el).value : '', note: $('[name=n]', m.el).value.trim() });
    $('[data-ok]', m.el).onclick = guard(async () => {
      const n = read(); if (!n.text) return toast('Type the reminder');
      await loadPlan();
      const old = t && PLAN.tasks.find(x => x.id === t.id);
      const moved = !old || old.due !== n.due || (old.time || '') !== n.time;
      const nt = { ...(old || { id: uid(), done: false }), ...n }; if (moved) { delete nt.n1; delete nt.cal; }
      PLAN.tasks = [...PLAN.tasks.filter(y => y.id !== nt.id), nt]; await savePlan(); out = true; m.close();
    });
    $('[data-del]', m.el)?.addEventListener('click', guard(async () => {
      if (!await confirmBox('Delete this reminder?')) return;
      await loadPlan(); PLAN.tasks = PLAN.tasks.filter(y => y.id !== t.id); await savePlan(); out = true; m.close();
    }));
    $('[data-cal]', m.el)?.addEventListener('click', guard(async () => {
      const n = { ...t, ...read() }; if (!n.due) return toast('Give it a due date first');
      if (await calendarFlow([{ id: t.id, title: n.text, due: n.due, time: n.time, desc: [remSubj(n)[0], n.note].filter(Boolean).join(' · ') }])) {
        await loadPlan(); const x = PLAN.tasks.find(y => y.id === t.id); if (x) { Object.assign(x, n, { cal: true }); await savePlan(); } out = true; m.close();
      }
    }));
    m.onClose = () => res(out);
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
      prev.innerHTML = items.length ? `<div class="task-list">${items.map((it, i) => { const [sn, sc] = remSubj(it); return `<label class="task"><input type="checkbox" data-i="${i}" ${it.on ? 'checked' : ''}><div class="tk-main"><b>${esc(it.text)}</b><span><i style="--c:${esc(sc)}"></i>${esc(sn)}${it.due ? ' · <em>' + esc(dueLabel(it)) + '</em>' : ' · no date'}</span></div></label>`; }).join('')}</div>` : '';
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
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(it.title)}`, `TRIGGER:${it.time ? '-P1D' : '-PT16H'}`, 'END:VALARM', 'END:VEVENT');
  }
  L.push('END:VCALENDAR'); return L.join('\r\n');
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
    const e = new Error(r.status === 401 ? 'the GitHub key is wrong or has expired' : r.status === 404 ? 'not found: the key needs the “gist” permission' : r.status === 403 ? 'GitHub refused (the key needs the “gist” permission)' : 'GitHub error ' + r.status);
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
  return toIcs([...ts, ...xs], { name: 'Inkbook', stamp: '20260101T000000Z' });
}
let csTimer = null, csBusy = false;
function calSyncSoon(ms = 2500) {
  if (!CS?.on) return;
  CS.dirty = true; csSave(); clearTimeout(csTimer); csTimer = setTimeout(() => calSyncNow(), ms);
}
async function calSyncNow(force = false) {
  if (!CS?.on || csBusy) return false;
  if (!navigator.onLine) { CS.err = 'offline: will sync when you are back online'; csSave(); REM?.drawCal?.(); return false; }
  csBusy = true;
  try {
    await loadPlan();
    const ics = feedIcs(), h = csHash(ics);
    if (force || h !== CS.hash) await gh(`/gists/${CS.gistId}`, CS.token, { method: 'PATCH', body: JSON.stringify({ files: { 'inkbook.ics': { content: ics } } }) });
    Object.assign(CS, { hash: h, dirty: false, last: Date.now(), err: '' }); csSave(); return true;
  } catch (e) {
    CS.err = e.message; csSave();
    if (e.status === 401 || e.status === 403 || e.status === 404) toast('📅 Calendar sync stopped: ' + e.message + '. Open Reminders → Calendar to fix it.', 6000);
    return false;
  } finally { csBusy = false; REM?.drawCal?.(); }
}
globalThis.onPlanSaved = () => calSyncSoon();
const agoText = t => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 6e4); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(t).toLocaleDateString(); };

async function calendarMenu() {
  if (CS?.on) {
    const v = await menu('Calendar sync is on', [
      { head: CS.err ? '⚠️ ' + CS.err : 'Last updated ' + agoText(CS.last) },
      { label: 'Update Calendar now', value: 'now', icon: 'convert', hint: 'Happens by itself after every change' },
      { label: 'Subscribe again / copy the link', value: 'sub', icon: 'calendar', hint: 'If the Inkbook calendar is missing on this iPad' },
      ...(CS.err ? [{ label: 'Paste a new GitHub key', value: 'key', icon: 'edit' }] : []),
      { label: 'Turn off Calendar sync', value: 'off', icon: 'trash', danger: true }]);
    if (v === 'now') { toast('Updating Calendar…', 1200); if (await calSyncNow(true)) toast('📅 Calendar feed updated. iPad picks it up on its next refresh.', 3500); }
    if (v === 'sub') calSubscribeStep();
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
          const ics = feedIcs();
          const g = await gh('/gists', token, { method: 'POST', body: JSON.stringify({ description: 'Inkbook calendar (made by the Inkbook app)', public: false, files: { 'inkbook.ics': { content: ics } } }) });
          CS = { on: true, token, user: user.login, gistId: g.id, hash: csHash(ics), last: Date.now(), dirty: false, err: '' }; csSave();
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

renderPlanner = async function (box) {
  await loadPlan(); updatePlannerCount();
  if (!FOLDERS.length) FOLDERS = await db.all('folders');
  const inF = x => !planFilter || (x.text !== undefined ? subjKey(x) : examKey(x)) === planFilter;
  const all = PLAN.tasks, open = all.filter(t => !t.done);
  const exams = [...PLAN.exams].sort((a, b) => a.date.localeCompare(b.date)), upEx = exams.filter(x => daysTo(x.date) >= 0);
  const late = open.filter(isLate).length, today = open.filter(t => t.due && !isLate(t) && daysTo(t.due) === 0).length;
  const week = open.filter(t => t.due && daysTo(t.due) >= 1 && daysTo(t.due) <= 7).length, nx = upEx[0];
  const stat = (n, label, c, f) => `<button class="pl-stat${n ? '' : ' zero'}" style="--c:${c}" ${f ? `data-jump="${f}"` : ''}><b>${n}</b><span>${label}</span></button>`;
  const keys = subjectKeys(all.filter(t => !t.done || S.planShowDone), upEx);
  if (planFilter && !keys.includes(planFilter)) keys.push(planFilter);
  const fTasks = all.filter(t => inF(t) && (!t.done || S.planShowDone)), fOpen = fTasks.filter(t => !t.done), fDone = fTasks.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const fEx = upEx.filter(inF), pastEx = exams.filter(x => daysTo(x.date) < 0 && inF(x)).reverse();

  let tasksHtml;
  if (S.planGroup === 'subject') {
    const ks = planFilter ? [planFilter] : keys;
    tasksHtml = ks.length ? `<div class="subj-grid">${ks.map(k => {
      const s = subjInfo(k), ts = all.filter(t => subjKey(t) === k), op = ts.filter(t => !t.done).sort(byDue), dn = ts.filter(t => t.done);
      const recent = dn.filter(t => Date.now() - (t.doneAt || 0) < 30 * 864e5).length, total = op.length + recent, pct = total ? Math.round(recent / total * 100) : 0;
      const ex = upEx.find(x => examKey(x) === k), lateN = op.filter(isLate).length;
      return `<section class="subj-card" style="--c:${esc(s.color)}">
        <div class="sc-head"><i class="sc-dot"></i><b>${esc(s.name)}</b>${lateN ? `<span class="sc-late">${lateN} overdue</span>` : ''}<button class="icon-btn sc-add" data-sadd="${esc(k)}" title="Add a task for ${esc(s.name)}">${icon('plus')}</button></div>
        <div class="sc-meta"><span>${op.length ? `${op.length} to do` : 'Nothing to do'}${recent ? ` · ${recent} done` : ''}</span>${ex ? `<button class="sc-exam" data-exam="${ex.id}">📚 ${esc(ex.title)} · ${daysTo(ex.date) === 0 ? 'today' : daysTo(ex.date) + 'd'}</button>` : ''}</div>
        ${total ? `<div class="sc-prog"><i style="width:${pct}%"></i></div>` : ''}
        ${op.length ? `<div class="task-list">${op.map(t => remRow(t, false)).join('')}</div>` : `<div class="sc-empty">${recent ? 'All done 🎉' : 'No tasks yet. Tap + to add one.'}</div>`}
        ${S.planShowDone && dn.length ? `<div class="task-list sc-done">${dn.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 10).map(t => remRow(t, false)).join('')}</div>` : ''}
      </section>`; }).join('')}</div>` : '';
  } else {
    tasksHtml = dateGroupsHtml(fOpen) + (S.planShowDone && fDone.length ? `<div class="tg-head">Done · ${fDone.length}</div><div class="task-list">${fDone.slice(0, 40).map(t => remRow(t)).join('')}</div>` : '');
  }
  const emptyTasks = !fOpen.length && !(S.planGroup === 'subject' && keys.length && !planFilter);

  box.innerHTML = `<div class="planner2">
    <div class="pl-stats">${stat(late, 'Overdue', '#e5484d', 'Overdue')}${stat(today, 'Due today', '#f08c00', 'Today')}${stat(week, 'Next 7 days', S.accent)}
      <button class="pl-stat${nx ? '' : ' zero'}" style="--c:${nx ? esc(subjColor(nx.folderId)) : '#8a8f98'}" ${nx ? `data-exam="${nx.id}"` : 'data-padd="exam"'}><b>${nx ? (daysTo(nx.date) === 0 ? 'Today' : daysTo(nx.date)) : '–'}</b><span>${nx ? (daysTo(nx.date) === 0 ? '' : 'days to ') + esc(nx.title) : 'No exams yet'}</span></button></div>
    <div class="pl-add"><span class="pl-add-ic">${icon('plus')}</span><input type="text" data-qadd placeholder="Add a task… e.g. Lab report due fri 5pm" enterkeyhint="done" autocomplete="off"><button class="btn primary small" data-qgo>Add</button></div>
    <div class="pl-qhint" data-qhint hidden></div>
    <div class="pl-bar">
      <div class="pl-seg" data-group><button class="${S.planGroup !== 'subject' ? 'on' : ''}" data-v="date">${icon('calendar')}By date</button><button class="${S.planGroup === 'subject' ? 'on' : ''}" data-v="subject">${icon('folder')}By subject</button></div>
      <label class="pl-done"><input type="checkbox" data-showdone ${S.planShowDone ? 'checked' : ''}><span>Show done</span></label>
    </div>
    ${keys.length > 1 || planFilter ? `<div class="rem-chips pl-filter"><button class="chip${!planFilter ? ' on' : ''}" data-filt="">All subjects</button>${keys.map(k => { const s = subjInfo(k), n = open.filter(t => subjKey(t) === k).length; return `<button class="chip${planFilter === k ? ' on' : ''}" data-filt="${esc(k)}" style="--c:${esc(s.color)}"><i class="sdot"></i>${esc(s.name)}${n ? `<small>${n}</small>` : ''}</button>`; }).join('')}</div>` : ''}
    <div class="plan-head"><h3 class="lib-sec">Exams</h3><div class="plan-btns"><button class="btn small" data-padd="exam">${icon('plus')}Exam</button></div></div>
    ${fEx.length ? `<div class="exam-row">${fEx.map(examCard).join('')}</div>` : `<div class="pl-none">No upcoming exams${planFilter ? ' for ' + esc(subjInfo(planFilter).name) : ''}. Add one for a countdown and a study plan.</div>`}
    <div class="plan-head"><h3 class="lib-sec">Tasks</h3>${S.planShowDone && all.some(t => t.done) ? `<div class="plan-btns"><button class="btn small" data-cleardone>Clear done</button></div>` : ''}</div>
    ${emptyTasks ? `<div class="rem-empty">${icon('bell')}<b>${planFilter ? 'Nothing to do for ' + esc(subjInfo(planFilter).name) : 'Nothing to do'}</b><span>Type above to add a task. Words like <i>today</i>, <i>fri</i>, <i>27th</i>, <i>5pm</i> set the date. Mention a subject's name to file it there.</span></div>` : tasksHtml}
    ${pastEx.length ? `<details class="task-group"><summary class="tg-head">Past exams · ${pastEx.length}</summary><div class="exam-row">${pastEx.map(examCard).join('')}</div></details>` : ''}
  </div>`;

  const root = $('.planner2', box), again = () => renderPlanner(box);
  const q = $('[data-qadd]', root), hint = $('[data-qhint]', root);
  const qSubj = () => folderInText(q.value)?.id ?? (planFilter && !planFilter.startsWith('tag:') && planFilter !== 'general' ? planFilter : null);
  q.addEventListener('input', () => {
    const p = parseWhen(q.value), f = qSubj(); hint.hidden = !q.value.trim();
    hint.innerHTML = `${p.due ? `<b>📅 ${esc(dueLabel(p))}</b>` : '<span>No date</span>'}<b style="--c:${esc(f ? subjColor(f) : planFilter.startsWith('tag:') ? tagColor(planFilter.slice(4)) : '#8a8f98')}" class="qh-subj"><i class="sdot"></i>${esc(f ? subjName(f) : planFilter.startsWith('tag:') ? planFilter.slice(4) : 'General')}</b>`;
  });
  const qAdd = guard(async () => {
    const raw = q.value.trim(); if (!raw) { q.focus(); return; }
    const p = parseWhen(raw), f = qSubj();
    await loadPlan(); PLAN.tasks.push({ id: uid(), text: p.text, folderId: f, ...(!f && planFilter.startsWith('tag:') ? { tag: planFilter.slice(4) } : {}), due: p.due, time: p.due ? p.time : '', done: false });
    await savePlan(); toast(`✓ Added${p.due ? ' · ' + dueLabel(p) : ''}`, 1200); remCheck();
    await again(); const nq = $('.planner2 [data-qadd]', box); if (matchMedia('(hover: hover)').matches) nq?.focus();
  });
  q.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); qAdd(); } });
  $('[data-qgo]', root).onclick = qAdd;
  $('[data-showdone]', root).onchange = e => { S.planShowDone = e.target.checked; saveSettings(); again(); };
  root.addEventListener('click', guard(async e => {
    const c = s => e.target.closest(s);
    if (c('[data-group] [data-v]')) { S.planGroup = c('[data-v]').dataset.v; saveSettings(); return again(); }
    if (c('[data-filt]')) { planFilter = c('[data-filt]').dataset.filt; return again(); }
    if (c('[data-jump]')) { planFilter = ''; S.planGroup = 'date'; saveSettings(); await again(); [...$$('.tg-head', box)].find(h => h.textContent.startsWith(c('[data-jump]')?.dataset.jump || '§'))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (c('[data-cleardone]')) { const n = PLAN.tasks.filter(t => t.done).length; if (await confirmBox(`Remove ${n} finished task${n > 1 ? 's' : ''}?`, 'Clear')) { await loadPlan(); PLAN.tasks = PLAN.tasks.filter(t => !t.done); await savePlan(); again(); } return; }
    if (c('[data-sadd]')) { const k = c('[data-sadd]').dataset.sadd; if (k.startsWith('tag:') || k === 'general') { planFilter = k; await again(); $('.planner2 [data-qadd]', box)?.focus(); return; } if (await remForm(null, k)) { again(); remCheck(); } return; }
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
};

// ---------- boot ----------
function bootReminders() {
  const mk = id => { const b = document.createElement('button'); b.className = 'icon-btn rem-bell'; b.id = id; b.title = 'Reminders'; b.innerHTML = icon('bell') + '<span class="rem-badge"></span>'; b.onclick = () => openReminders(); return b; };
  $('#newBtn')?.before(mk('remLibBtn'));
  $('#bookmarkBtn')?.before(mk('remEdBtn'));
  remCheck(); setInterval(remCheck, 5 * 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { remCheck(); if (CS?.on && CS.dirty) calSyncNow(); } });
  addEventListener('online', () => { if (CS?.on && CS.dirty) calSyncNow(); });
  if (CS?.on && CS.dirty) setTimeout(calSyncNow, 3000);
  navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.openReminders && !REM?.m.el.isConnected) openReminders(); });
  if (new URLSearchParams(location.search).has('reminders')) setTimeout(() => !REM?.m.el.isConnected && openReminders(), 600);
}
