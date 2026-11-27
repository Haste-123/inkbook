'use strict';
/* =====================================================================
   Inkbook v12 — tables on the page, and graphs made from table columns.
   A table: { id, x, y, w (total width, page units), cols: [fractions], cells: [[text]], s, c, head }
   Tables are edited with the Text tool (like text boxes).
   ===================================================================== */

const CHART_JS = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
const CHART_COLORS = ['#2f5bea', '#e5484d', '#18a058', '#f76b15', '#8e4ec6', '#12a594', '#d6409f', '#8d8d86'];

function makeTable(rows, cols, x, y, w, head = true) {
  return { id: uid(), x: Math.round(x), y: Math.round(y), w: Math.round(w), cols: Array(cols).fill(1 / cols),
    cells: Array.from({ length: rows }, () => Array(cols).fill('')), s: 18, c: isDark(E.pages[currentIndex()]?.paperColor) ? '#ececf1' : '#1f2430', head };
}
const tableEl = (p, t) => E.els.get(p.id)?.querySelector(`.tbl[data-id="${t.id}"]`);
function tableBox(p, t) {
  const d = tableEl(p, t)?.querySelector('.tbl-grid');
  if (d && d.offsetWidth) return [t.x, t.y, t.x + d.offsetWidth / E.unit, t.y + d.offsetHeight / E.unit];
  return [t.x, t.y, t.x + t.w, t.y + tableRowHeights(t).reduce((a, b) => a + b, 0)];
}

// ---------- On-screen table ----------
function renderTables(p, el) {
  const layer = el.querySelector('.text-layer');
  for (const t of p.tables || []) layer.appendChild(makeTableEl(p, t));
}
function positionTable(d, t) {
  d.style.setProperty('--x', t.x); d.style.setProperty('--y', t.y); d.style.setProperty('--fs', t.s); d.style.color = t.c;
  d.classList.toggle('tb-below', t.y < 70);
  const g = $('.tbl-grid', d); if (g) g.style.gridTemplateColumns = t.cols.map(f => `calc(${(f * t.w).toFixed(2)} * var(--s) * 1px)`).join(' ');
}
function replaceTable(p, t, nt, before) {
  p.tables = p.tables.map(x => x === t ? nt : x);
  pushUndo(p, before); refreshPage(p);
  return nt;
}
function makeTableEl(p, t) {
  const d = document.createElement('div'); d.className = 'tbl'; d.dataset.id = t.id;
  d.innerHTML = `<div class="tbl-tools">
      <div class="grip tbl-grip" title="Drag to move">⠿ Move</div>
      <button data-tb="row+" title="Add a row below">+ Row</button><button data-tb="col+" title="Add a column to the right">+ Column</button>
      <button data-tb="row-" title="Remove this row">− Row</button><button data-tb="col-" title="Remove this column">− Column</button>
      <button data-tb="head" title="Bold first row">Header</button>
      <button data-tb="graph" class="tb-graph">📈 Graph</button>
      <button data-tb="del" class="text-del">Delete</button></div>
    <div class="tbl-grid"></div><div class="tbl-resize" title="Drag to change the width"></div>`;
  const grid = $('.tbl-grid', d);
  t.cells.forEach((row, r) => row.forEach((val, c) => {
    const cell = document.createElement('div');
    cell.className = 'tc' + (r === 0 && t.head ? ' th' : ''); cell.dataset.r = r; cell.dataset.c = c;
    cell.contentEditable = 'plaintext-only'; if (cell.contentEditable !== 'plaintext-only') cell.contentEditable = 'true';
    cell.textContent = val; grid.appendChild(cell);
  }));
  positionTable(d, t);
  if (E.editTbl === t.id) d.classList.add('editing');
  // "editing" stays on until you tap somewhere else (not tied to keyboard focus, which iPad drops when the keyboard hides)
  d.addEventListener('pointerdown', () => setTableEditing(d, t), true);
  d.addEventListener('focusin', () => setTableEditing(d, t));
  let focus = { r: 0, c: 0 };
  const remember = e => { const c = e.target.closest('.tc'); if (c) { focus = { r: +c.dataset.r, c: +c.dataset.c }; d._focus = focus; } };
  grid.addEventListener('focusin', remember); grid.addEventListener('pointerdown', remember);
  grid.addEventListener('input', e => { const c = e.target.closest('.tc'); if (!c) return; t.cells[+c.dataset.r][+c.dataset.c] = c.innerText.replace(/\n$/, ''); markDirty(p); });
  grid.addEventListener('keydown', e => {
    e.stopPropagation();
    const c = e.target.closest('.tc'); if (!c) return;
    const r = +c.dataset.r, k = +c.dataset.c, rows = t.cells.length, cols = t.cols.length;
    const go = (rr, kk) => { const n = grid.querySelector(`.tc[data-r="${rr}"][data-c="${kk}"]`); if (n) { n.focus(); const s = getSelection(); s.selectAllChildren(n); s.collapseToEnd(); } };
    if (e.key === 'Tab') { e.preventDefault(); const i = r * cols + k + (e.shiftKey ? -1 : 1); if (i >= 0 && i < rows * cols) go(Math.floor(i / cols), i % cols); }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (r + 1 < rows) go(r + 1, k);
      else { const before = snap(p), nt = structuredClone(t); nt.cells.push(Array(cols).fill('')); replaceTable(p, t, nt, before); setTimeout(() => tableEl(p, nt)?.querySelector(`.tc[data-r="${r + 1}"][data-c="${k}"]`)?.focus(), 0); }
    }
  });
  // toolbar actions keep the cell focused
  $('.tbl-tools', d).addEventListener('pointerdown', e => { if (e.target.closest('button')) e.preventDefault(); });
  $('.tbl-tools', d).addEventListener('click', guard(async e => {
    const b = e.target.closest('[data-tb]'); if (!b) return;
    const a = b.dataset.tb, before = snap(p), nt = structuredClone(t), rows = nt.cells.length, cols = nt.cols.length;
    if (a === 'graph') return tableGraph(p, t);
    if (a === 'del') { if (await confirmBox('Delete this table?')) { p.tables = p.tables.filter(x => x !== t); stopTableEditing(); pushUndo(p, before); refreshPage(p); } return; }
    if (a === 'row+') nt.cells.splice(focus.r + 1, 0, Array(cols).fill(''));
    if (a === 'row-') { if (rows <= 1) return toast('A table needs at least one row'); nt.cells.splice(focus.r, 1); }
    if (a === 'col+') { nt.cells.forEach(row => row.splice(focus.c + 1, 0, '')); nt.cols.splice(focus.c + 1, 0, 1 / cols); }
    if (a === 'col-') { if (cols <= 1) return toast('A table needs at least one column'); nt.cells.forEach(row => row.splice(focus.c, 1)); nt.cols.splice(focus.c, 1); }
    if (a === 'head') nt.head = !nt.head;
    const sum = nt.cols.reduce((x, y) => x + y, 0); nt.cols = nt.cols.map(f => f / sum);
    replaceTable(p, t, nt, before);
    const fr = clamp(a === 'row+' ? focus.r + 1 : focus.r, 0, nt.cells.length - 1), fc = clamp(a === 'col+' ? focus.c + 1 : focus.c, 0, nt.cols.length - 1);
    setTimeout(() => tableEl(p, nt)?.querySelector(`.tc[data-r="${fr}"][data-c="${fc}"]`)?.focus(), 0);
  }));
  // move
  const g = $('.tbl-grip', d);
  g.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); try { g.setPointerCapture(e.pointerId); } catch { }
    const host = E.els.get(p.id), a = { rect: host.getBoundingClientRect(), page: p }, start = toPt(a, e), ox = t.x, oy = t.y;
    const tb = tableBox(p, t), th = tb[3] - tb[1];
    const mv = ev => { const q = toPt(a, ev); t.x = Math.round(clamp(ox + q.x - start.x, 0, Math.max(0, p.w - t.w))); t.y = Math.round(clamp(oy + q.y - start.y, 0, Math.max(0, p.h - th))); positionTable(d, t); };
    const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up); markDirty(p); };
    g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
  });
  // resize (whole table width; columns keep their proportions)
  const rz = $('.tbl-resize', d);
  rz.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); try { rz.setPointerCapture(e.pointerId); } catch { }
    const sx = e.clientX, w0 = t.w;
    const mv = ev => { t.w = Math.round(clamp(w0 + (ev.clientX - sx) / E.unit, 120, Math.max(120, p.w - t.x))); positionTable(d, t); };
    const up = () => { rz.removeEventListener('pointermove', mv); rz.removeEventListener('pointerup', up); rz.removeEventListener('pointercancel', up); markDirty(p); };
    rz.addEventListener('pointermove', mv); rz.addEventListener('pointerup', up); rz.addEventListener('pointercancel', up);
  });
  return d;
}

function setTableEditing(d, t) {
  $$('.tbl.editing').forEach(x => { if (x !== d) x.classList.remove('editing'); });
  d?.classList.add('editing'); E.editTbl = t?.id || null;
}
function stopTableEditing() { $$('.tbl.editing').forEach(x => x.classList.remove('editing')); E.editTbl = null; }
document.addEventListener('pointerdown', e => { if (E.editTbl && !e.target.closest('.tbl, .modal, .popover, .sheet')) stopTableEditing(); }, true);
// Open a table for editing from any tool (tap it, then Edit table)
function editTable(p, t, r = 0, c = 0) {
  if (!t) return;
  clearSelection(); setTool('text'); E.editTbl = t.id; refreshPage(p);
  setTimeout(() => {
    const d = tableEl(p, t); if (!d) return; setTableEditing(d, t);
    const cell = d.querySelector(`.tc[data-r="${r}"][data-c="${c}"]`) || d.querySelector('.tc');
    cell?.focus(); try { const s = getSelection(); s.selectAllChildren(cell); s.collapseToEnd(); } catch { }
  }, 30);
}

// ---------- Drawing tables for export / previews (same layout as on screen) ----------
const TBL_PAD_X = 8, TBL_PAD_Y = 6;
function tableRowHeights(t, ctx = mctx(), s = 1) {
  return t.cells.map((row, r) => Math.max(...row.map((val, c) => {
    const lines = wrapLines(ctx, { text: val || ' ', s: t.s, f: 'sans', b: r === 0 && t.head, w: t.cols[c] * t.w - 2 * TBL_PAD_X + 8 }, s).length;
    return lines * t.s * 1.3 + 2 * TBL_PAD_Y;
  })));
}
function drawTables(ctx, p, s, list = p.tables || []) {
  for (const t of list) {
    const heights = tableRowHeights(t, ctx, 1), total = heights.reduce((a, b) => a + b, 0);
    ctx.save();
    if (t.head && heights.length) { ctx.fillStyle = 'rgba(120,130,160,.14)'; ctx.fillRect(t.x * s, t.y * s, t.w * s, heights[0] * s); }
    ctx.strokeStyle = 'rgba(90,100,130,.55)'; ctx.lineWidth = Math.max(1, 1.2 * s);
    ctx.strokeRect(t.x * s, t.y * s, t.w * s, total * s);
    let y = t.y;
    t.cells.forEach((row, r) => {
      let x = t.x;
      row.forEach((val, c) => {
        const cw = t.cols[c] * t.w;
        if (val) {
          const tt = { text: val, s: t.s, f: 'sans', b: r === 0 && t.head, w: cw - 2 * TBL_PAD_X + 8 };
          const lines = wrapLines(ctx, tt, s); ctx.fillStyle = t.c; ctx.textBaseline = 'top';
          lines.forEach((ln, i) => ctx.fillText(ln, (x + TBL_PAD_X) * s, (y + TBL_PAD_Y + i * t.s * 1.3 + t.s * 0.15) * s));
        }
        if (c > 0) { ctx.beginPath(); ctx.moveTo(x * s, y * s); ctx.lineTo(x * s, (y + heights[r]) * s); ctx.stroke(); }
        x += cw;
      });
      if (r > 0) { ctx.beginPath(); ctx.moveTo(t.x * s, y * s); ctx.lineTo((t.x + t.w) * s, y * s); ctx.stroke(); }
      y += heights[r];
    });
    ctx.restore();
  }
}

// ---------- Inserting a table ----------
function insertTableFlow() {
  const v = { rows: 4, cols: 3, head: true };
  return new Promise(res => {
    const m = openModal(`<h2>Insert a table</h2>
      <div class="tbl-size"><div class="stepper-row"><span>Rows</span><button class="icon-btn" data-d="rows,-1">−</button><b data-v="rows">${v.rows}</b><button class="icon-btn" data-d="rows,1">+</button></div>
      <div class="stepper-row"><span>Columns</span><button class="icon-btn" data-d="cols,-1">−</button><b data-v="cols">${v.cols}</b><button class="icon-btn" data-d="cols,1">+</button></div></div>
      <label class="toggle"><input type="checkbox" checked data-head><span>First row is a header (bold)</span></label>
      <div class="tbl-mini"></div>
      <p class="hint">Type in the cells, or handwrite in them with Apple Pencil (Scribble). Tab moves to the next cell, Return to the cell below.</p>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Insert table</button></div>`, 'small');
    const mini = () => { $('.tbl-mini', m.el).style.gridTemplateColumns = `repeat(${v.cols}, 1fr)`; $('.tbl-mini', m.el).innerHTML = Array.from({ length: v.rows * v.cols }, (_, i) => `<i class="${v.head && i < v.cols ? 'h' : ''}"></i>`).join(''); };
    m.el.addEventListener('click', e => {
      const b = e.target.closest('[data-d]'); if (!b) return;
      const [k, d] = b.dataset.d.split(','); v[k] = clamp(v[k] + +d, 1, k === 'rows' ? 40 : 10); $(`[data-v="${k}"]`, m.el).textContent = v[k]; mini();
    });
    $('[data-head]', m.el).onchange = e => { v.head = e.target.checked; mini(); };
    let out = false;
    $('[data-ok]', m.el).onclick = () => {
      const p = E.pages[currentIndex()], vb = visibleBox(p), w = Math.min(Math.max(240, v.cols * 170), p.w - 80);
      const t = makeTable(v.rows, v.cols, Math.max(40, (p.w - w) / 2), clamp(vb[1] + 80, 20, p.h - 60), w, v.head);
      const before = snap(p); p.tables.push(t); pushUndo(p, before);
      editTable(p, t);
      out = true; m.close();
    };
    m.onClose = () => res(out); mini();
  });
}


// ---------- Trendlines (same kinds and maths as Excel) ----------
const SUPS = { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶' };
const fmtN = n => { if (!Number.isFinite(n)) return '?'; const a = Math.abs(n); if (a !== 0 && (a < 1e-3 || a >= 1e6)) return n.toExponential(3).replace('e+', 'e'); return String(+n.toPrecision(4)); };
function solveLin(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
function polyfit(xs, ys, order) {
  const n = order + 1, A = Array.from({ length: n }, () => Array(n).fill(0)), b = Array(n).fill(0);
  xs.forEach((x, k) => { for (let i = 0; i < n; i++) { b[i] += ys[k] * x ** i; for (let j = 0; j < n; j++) A[i][j] += x ** (i + j); } });
  return solveLin(A, b);
}
const cf = n => { const t = fmtN(n); return t === '1' ? '' : t === '-1' ? '−' : t; };   // coefficient: hide a leading 1
const rSquared = (ys, fx) => { const m = ys.reduce((a, b) => a + b, 0) / ys.length; let sr = 0, st = 0; ys.forEach((y, i) => { sr += (y - fx[i]) ** 2; st += (y - m) ** 2; }); return st ? 1 - sr / st : 1; };
function polyEq(c) {
  const big = Math.max(...c.map(Math.abs)); c = c.map(v => Math.abs(v) < big * 1e-9 ? 0 : v);   // rounding noise like 3e-15 is really 0
  let s = '';
  for (let k = c.length - 1; k >= 0; k--) {
    const v = c[k]; if (v === 0 && c.length > 1) continue;
    const mag = fmtN(Math.abs(v)), term = k === 0 ? mag : (mag === '1' ? '' : mag) + 'x' + (k > 1 ? SUPS[k] || '^' + k : '');
    s += s ? (v < 0 ? ' − ' : ' + ') + term : (v < 0 ? '−' : '') + term;
  }
  return 'y = ' + (s || '0');
}
// kind: linear | poly | exp | log | power  →  { f, eq, r2 } or { err }
function fitTrend(pts, kind, order = 2) {
  let P = pts.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (kind === 'exp' || kind === 'power') { if (P.some(([, y]) => y <= 0)) return { err: 'needs values above 0' }; }
  if (kind === 'log' || kind === 'power') { if (P.some(([x]) => x <= 0)) return { err: 'needs x values above 0' }; }
  const need = kind === 'poly' ? order + 1 : 2;
  if (P.length < need) return { err: `needs at least ${need} points` };
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
  if (kind === 'linear' || kind === 'poly') {
    const c = polyfit(xs, ys, kind === 'linear' ? 1 : order); if (!c) return { err: 'cannot fit these numbers' };
    const f = x => c.reduce((a, v, i) => a + v * x ** i, 0);
    return { f, eq: polyEq(c), r2: rSquared(ys, xs.map(f)) };
  }
  if (kind === 'exp') {           // ln y = ln a + b x
    const c = polyfit(xs, ys.map(Math.log), 1); if (!c) return { err: 'cannot fit these numbers' };
    const a = Math.exp(c[0]), b = c[1], f = x => a * Math.exp(b * x);
    return { f, eq: `y = ${cf(a)}e^(${cf(b)}x)`, r2: rSquared(ys.map(Math.log), xs.map(x => c[0] + b * x)) };
  }
  if (kind === 'log') {           // y = a + b ln x
    const c = polyfit(xs.map(Math.log), ys, 1); if (!c) return { err: 'cannot fit these numbers' };
    const f = x => c[0] + c[1] * Math.log(x);
    return { f, eq: `y = ${cf(c[1])}ln(x)${fmtN(c[0]) === '0' || Math.abs(c[0]) < Math.abs(c[1]) * 1e-9 ? '' : ` ${c[0] < 0 ? '−' : '+'} ${fmtN(Math.abs(c[0]))}`}`, r2: rSquared(ys, xs.map(f)) };
  }
  if (kind === 'power') {         // ln y = ln a + b ln x
    const lx = xs.map(Math.log), c = polyfit(lx, ys.map(Math.log), 1); if (!c) return { err: 'cannot fit these numbers' };
    const a = Math.exp(c[0]), b = c[1], f = x => a * x ** b;
    return { f, eq: `y = ${cf(a)}x^${fmtN(b)}`, r2: rSquared(ys.map(Math.log), lx.map(x => c[0] + b * x)) };
  }
  return { err: 'unknown' };
}

// ---------- Graphs from table columns ----------
const parseNum = s => { const n = parseFloat(String(s ?? '').replace(/[\s,%$€£]/g, '').replace(/[−–]/g, '-')); return Number.isFinite(n) ? n : null; };
async function tableGraph(p, t) {
  await loadScript(CHART_JS);
  const header = t.head ? t.cells[0].map((h, i) => h.trim() || `Column ${i + 1}`) : t.cells[0].map((_, i) => `Column ${i + 1}`);
  const rows = (t.head ? t.cells.slice(1) : t.cells).filter(r => r.some(v => v.trim()));
  if (!rows.length) return toast('Fill in some rows first, then make a graph.');
  const numeric = header.map((_, c) => rows.filter(r => parseNum(r[c]) !== null).length >= Math.max(1, rows.length * 0.6));
  const ys0 = header.map((_, c) => c).filter(c => c !== 0 && numeric[c]);
  if (!ys0.length && !numeric.some(Boolean)) return toast('A graph needs at least one column of numbers.');
  const v = { type: 'line', x: 0, ys: ys0.length ? ys0 : [numeric.findIndex(Boolean)], title: '', trend: 'none', order: 2, eq: true, r2: true };
  const m = openModal(`<h2>Make a graph</h2>
    <div class="graph-wrap"><canvas class="graph-prev" width="680" height="400"></canvas></div>
    <div class="field"><label class="lbl">Type</label><div class="seg" data-k="type">${segHtml([['line', '📈 Line'], ['bar', '📊 Bar'], ['scatter', '⋰ Scatter'], ['pie', '◔ Pie']], v.type)}</div></div>
    <div class="field"><label class="lbl" data-xl>Across the bottom (x)</label><div class="seg" data-k="x">${segHtml(header.map((h, i) => [i, h]), v.x)}</div></div>
    <div class="field"><label class="lbl" data-yl>Values to plot (y) · tap to choose one or more</label><div class="seg ys">${header.map((h, i) => `<button class="chip${v.ys.includes(i) ? ' on' : ''}${numeric[i] ? '' : ' dim'}" data-y="${i}" ${numeric[i] ? '' : 'disabled title="This column has no numbers"'}>${esc(h)}</button>`).join('')}</div>
      <small class="hint graph-note" data-gnote hidden></small></div>
    <div class="field trend-field"><label class="lbl">Trendline (like Excel)</label><div class="seg" data-k="trend">${segHtml([['none', 'None'], ['linear', 'Linear'], ['poly', 'Polynomial'], ['exp', 'Exponential'], ['log', 'Logarithmic'], ['power', 'Power']], 'none')}</div>
      <div class="trend-opts" hidden><span class="poly-ord">Order <button class="icon-btn" data-ord="-1">−</button><b data-ordv>2</b><button class="icon-btn" data-ord="1">+</button></span>
        <label class="toggle"><input type="checkbox" checked data-eq><span>Show equation</span></label><label class="toggle"><input type="checkbox" checked data-r2><span>Show R²</span></label></div>
      <div class="trend-out"></div></div>
    <div class="field"><label class="lbl">Title (optional)</label><input type="text" name="title" placeholder="e.g. Velocity over time"></div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Add graph to page</button></div>`, 'wide');
  let chart = null;
  const xNumeric = () => rows.every(r => parseNum(r[v.x]) !== null);
  const xOf = i => (xNumeric() ? parseNum(rows[i][v.x]) : i + 1);   // text labels → 1, 2, 3… (like Excel)
  const trends = () => {
    if (v.trend === 'none' || v.type === 'pie') return [];
    return v.ys.map((c, k) => ({ c, k, ...fitTrend(rows.map((r, i) => [xOf(i), parseNum(r[c])]), v.trend, v.order) }));
  };
  const sliceColor = i => i < CHART_COLORS.length ? CHART_COLORS[i] : `hsl(${Math.round((i * 137.508) % 360)}, 62%, 55%)`;   // enough distinct colours for any number of slices
  const pieRows = () => { const c = v.ys[0]; return rows.map((r, i) => ({ i, label: String(r[v.x] ?? '').trim() || `Row ${i + 1}`, val: parseNum(r[c]) })); };
  const cfg = (dpr) => {
    const pie = v.type === 'pie', scatter = v.type === 'scatter';
    if (pie) {
      const all = pieRows(), keep = all.filter(d => d.val > 0), total = keep.reduce((a, d) => a + d.val, 0);
      const pct = d => (d.val / total * 100);
      const labelsPlugin = { id: 'pct', afterDatasetsDraw(ch) {
        const x = ch.ctx, meta = ch.getDatasetMeta(0); x.save(); x.font = '700 13px -apple-system, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        meta.data.forEach((arc, i) => { const d = keep[i], p = pct(d); if (p < 4) return; const pos = arc.tooltipPosition(); x.fillStyle = '#fff'; x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 3; x.fillText(`${p >= 10 ? Math.round(p) : p.toFixed(1)}%`, pos.x, pos.y); });
        x.restore();
      } };
      return {
        type: 'pie', data: { labels: keep.map(d => d.label), datasets: [{ label: header[v.ys[0]], data: keep.map(d => d.val), backgroundColor: keep.map((_, i) => sliceColor(i)), borderColor: '#fff', borderWidth: 2 }] },
        plugins: [labelsPlugin],
        options: { animation: false, responsive: false, devicePixelRatio: dpr, layout: { padding: 8 },
          plugins: { legend: { display: true, position: 'right', labels: { boxWidth: 14, padding: 10, generateLabels: ch => keep.map((d, i) => ({ text: `${d.label}  ${fmtN(d.val)} (${pct(d) >= 10 ? Math.round(pct(d)) : pct(d).toFixed(1)}%)`, fillStyle: sliceColor(i), strokeStyle: '#fff', index: i })) } },
            title: { display: true, text: v.title || header[v.ys[0]], font: { size: 16, weight: '600' } } } },
      };
    }
    const labels = rows.map(r => r[v.x]);
    const ys = v.ys;
    const datasets = ys.map((c, k) => ({
      label: header[c],
      data: scatter ? rows.map((r, i) => ({ x: xOf(i), y: parseNum(r[c]) })).filter(d => d.x !== null && d.y !== null) : rows.map(r => parseNum(r[c])),   // text x → 1, 2, 3… like the trendline
      borderColor: CHART_COLORS[k % 8], backgroundColor: CHART_COLORS[k % 8] + (v.type === 'bar' ? 'cc' : '33'),
      borderWidth: 2, tension: 0.25, pointRadius: 4, fill: false,
    }));
    const tr = trends().filter(t => t.f), scatterX = rows.map((_, i) => xOf(i)).filter(Number.isFinite);
    tr.forEach(t => {
      let data;
      if (scatter) {
        let x0 = Math.min(...scatterX), x1 = Math.max(...scatterX); if ((v.trend === 'log' || v.trend === 'power') && x0 <= 0) x0 = x1 / 1000;
        data = Array.from({ length: 81 }, (_, i) => { const x = x0 + (x1 - x0) * i / 80; return { x, y: t.f(x) }; });
      } else data = rows.map((_, i) => t.f(xOf(i)));
      datasets.push({ type: 'line', label: header[t.c] + ' trend', data, borderColor: CHART_COLORS[t.k % 8], borderDash: [7, 5], borderWidth: 2, pointRadius: 0, fill: false, tension: scatter ? 0 : 0.35, isTrend: true });
    });
    const eqPlugin = { id: 'eqs', afterDraw(ch) {
      if (!tr.length || (!v.eq && !v.r2)) return;
      const x = ch.ctx, a = ch.chartArea, lines = tr.map(t => `${tr.length > 1 ? header[t.c] + ':  ' : ''}${v.eq ? t.eq : ''}${v.eq && v.r2 ? '     ' : ''}${v.r2 ? 'R² = ' + t.r2.toFixed(4) : ''}`);
      x.save(); x.font = '600 13px -apple-system, system-ui, sans-serif';
      const w = Math.max(...lines.map(l => x.measureText(l).width)) + 16, h = lines.length * 19 + 10;
      x.fillStyle = 'rgba(255,255,255,.88)'; x.strokeStyle = 'rgba(0,0,0,.12)'; x.beginPath(); x.roundRect(a.left + 8, a.top + 8, w, h, 7); x.fill(); x.stroke();
      lines.forEach((l, i) => { x.fillStyle = CHART_COLORS[tr[i].k % 8]; x.textBaseline = 'top'; x.fillText(l, a.left + 16, a.top + 14 + i * 19); });
      x.restore();
    } };
    return {
      type: v.type, data: { labels, datasets }, plugins: [eqPlugin],
      options: {
        animation: false, responsive: false, devicePixelRatio: dpr,
        plugins: { legend: { display: pie || ys.length > 1, labels: { filter: it => !/ trend$/.test(it.text) } }, title: { display: !!v.title, text: v.title, font: { size: 16, weight: '600' } } },
        scales: pie ? {} : {
          x: { type: scatter ? 'linear' : 'category', title: { display: true, text: header[v.x] } },
          y: { title: { display: ys.length === 1, text: header[ys[0]] }, beginAtZero: v.type === 'bar' },
        },
      },
    };
  };
  const draw = () => {
    const pie = v.type === 'pie';
    if (pie && v.ys.length > 1) { v.ys = v.ys.slice(0, 1); $$('.ys [data-y]', m.el).forEach(b => b.classList.toggle('on', v.ys.includes(+b.dataset.y))); }
    $('[data-xl]', m.el).textContent = pie ? 'Slice names' : 'Across the bottom (x)';
    $('[data-yl]', m.el).textContent = pie ? 'Slice sizes · a pie shows one column' : 'Values to plot (y) · tap to choose one or more';
    const note = $('[data-gnote]', m.el);
    if (pie && v.ys.length) {
      const all = pieRows(), out = all.filter(d => !(d.val > 0));
      note.hidden = !out.length;
      note.textContent = out.length ? `Left out of the pie: ${out.map(d => `${d.label} (${d.val === null ? 'empty' : d.val === 0 ? '0' : 'negative'})`).join(', ')}. A pie can only show amounts above 0.` : '';
      if (!all.some(d => d.val > 0)) note.textContent = 'This column has no amounts above 0, so there is nothing to show as a pie.', note.hidden = false;
    } else if (v.type === 'scatter' && v.ys.length && !xNumeric()) { note.hidden = false; note.textContent = `“${header[v.x]}” isn’t numbers, so the points are placed at 1, 2, 3… Pick a number column for x to plot real values.`; }
    else note.hidden = true;
    $('.trend-field', m.el).hidden = pie;
    $('.trend-opts', m.el).hidden = v.trend === 'none';
    $('.poly-ord', m.el).style.display = v.trend === 'poly' ? '' : 'none';
    $('[data-ordv]', m.el).textContent = v.order;
    const tr = trends();
    $('.trend-out', m.el).innerHTML = tr.map(t => `<div style="color:${CHART_COLORS[t.k % 8]}"><b>${esc(header[t.c])}</b>: ${t.err ? `can't fit (${esc(t.err)})` : `${esc(t.eq)} &nbsp; R² = ${t.r2.toFixed(4)}`}</div>`).join('') +
      (tr.length && !xNumeric() ? `<small class="hint">The x column isn't numbers, so x = 1, 2, 3… like Excel.</small>` : '');
    chart?.destroy();
    if (!v.ys.length) { const c = $('.graph-prev', m.el); c.getContext('2d').clearRect(0, 0, c.width, c.height); return; }
    chart = new window.Chart($('.graph-prev', m.el), cfg(2));
  };
  $$('.seg[data-k]', m.el).forEach(s => wireSeg(s, x => { v[s.dataset.k] = s.dataset.k === 'x' ? +x : x; draw(); }));
  $('.ys', m.el).addEventListener('click', e => {
    const b = e.target.closest('[data-y]'); if (!b || b.disabled) return;
    const i = +b.dataset.y;
    if (v.type === 'pie') v.ys = [i];                                  // a pie shows one column: tapping another switches to it
    else v.ys = v.ys.includes(i) ? v.ys.filter(x => x !== i) : [...v.ys, i].sort((a, b) => a - b);
    $$('.ys [data-y]', m.el).forEach(x => x.classList.toggle('on', v.ys.includes(+x.dataset.y))); draw();
  });
  m.el.addEventListener('click', e => { const o = e.target.closest('[data-ord]'); if (o) { v.order = clamp(v.order + +o.dataset.ord, 2, 6); draw(); } });
  $('[data-eq]', m.el).onchange = e => { v.eq = e.target.checked; draw(); };
  $('[data-r2]', m.el).onchange = e => { v.r2 = e.target.checked; draw(); };
  $('[name=title]', m.el).addEventListener('input', e => { v.title = e.target.value.trim(); draw(); });
  $('[name=title]', m.el).addEventListener('keydown', e => e.stopPropagation());
  $('[data-ok]', m.el).onclick = guard(async () => {
    if (!v.ys.length) return toast('Choose at least one column to plot');
    if (v.type === 'pie' && !pieRows().some(d => d.val > 0)) return toast('This column has no amounts above 0 to show as a pie');
    // render the final picture off screen at high resolution
    const holder = document.createElement('div'); holder.style.cssText = 'position:absolute;left:-12000px;top:0'; document.body.appendChild(holder);
    const c = document.createElement('canvas'); c.width = 900; c.height = 540; holder.appendChild(c);
    const ch = new window.Chart(c, cfg(2));                     // 1800×1080: sharp at the size it sits on the page, and about twice as quick to save as 3×
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); ch.destroy(); holder.remove();
    const key = 'img_' + uid(); await db.put('blobs', blob, key);
    const tb = tableBox(p, t), W = Math.round(Math.min(560, p.w - 40)), H = Math.round(W * 540 / 900);
    let x = tb[2] + 30, y = tb[1];
    if (x + W > p.w - 10) { x = clamp(tb[0], 20, Math.max(20, p.w - W - 20)); y = tb[3] + 24; }
    const before = snap(p);
    if (y + H + 30 > p.h) { if (p.bgKey) { p.bgW ||= p.w; p.bgH ||= p.h; } p.h = Math.ceil((y + H + 60) / 10) * 10; layout(); }
    const im = { id: uid(), key, x: Math.round(x), y: Math.round(y), w: W, h: H };
    p.images.push(im); pushUndo(p, before); refreshPage(p); m.close();
    setTool('lasso'); setSelection(p, new Set(), new Set([im]));
    toast('Graph added. Drag to move, corner dot to resize.', 2600);
  });
  m.onClose = () => chart?.destroy();
  draw();
}
