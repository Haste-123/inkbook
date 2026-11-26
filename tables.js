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
    if (a === 'del') { if (await confirmBox('Delete this table?')) { p.tables = p.tables.filter(x => x !== t); pushUndo(p, before); refreshPage(p); } return; }
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
    const mv = ev => { const q = toPt(a, ev); t.x = Math.round(clamp(ox + q.x - start.x, 0, Math.max(0, p.w - 40))); t.y = Math.round(clamp(oy + q.y - start.y, 0, p.h - 30)); positionTable(d, t); };
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

// ---------- Drawing tables for export / previews (same layout as on screen) ----------
const TBL_PAD_X = 8, TBL_PAD_Y = 6;
function tableRowHeights(t, ctx = mctx(), s = 1) {
  return t.cells.map((row, r) => Math.max(...row.map((val, c) => {
    const lines = wrapLines(ctx, { text: val || ' ', s: t.s, f: 'sans', b: r === 0 && t.head, w: t.cols[c] * t.w - 2 * TBL_PAD_X + 8 }, s).length;
    return lines * t.s * 1.3 + 2 * TBL_PAD_Y;
  })));
}
function drawTables(ctx, p, s) {
  for (const t of p.tables || []) {
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
      setTool('text'); refreshPage(p);
      setTimeout(() => tableEl(p, t)?.querySelector('.tc')?.focus(), 30);
      out = true; m.close();
    };
    m.onClose = () => res(out); mini();
  });
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
  const v = { type: 'line', x: 0, ys: ys0.length ? ys0 : [numeric.findIndex(Boolean)], title: '' };
  const m = openModal(`<h2>Make a graph</h2>
    <div class="graph-wrap"><canvas class="graph-prev" width="680" height="400"></canvas></div>
    <div class="field"><label class="lbl">Type</label><div class="seg" data-k="type">${segHtml([['line', '📈 Line'], ['bar', '📊 Bar'], ['scatter', '⋰ Scatter'], ['pie', '◔ Pie']], v.type)}</div></div>
    <div class="field"><label class="lbl">Across the bottom (x)</label><div class="seg" data-k="x">${segHtml(header.map((h, i) => [i, h]), v.x)}</div></div>
    <div class="field"><label class="lbl">Values to plot (y) · tap to choose one or more</label><div class="seg ys">${header.map((h, i) => `<button class="chip${v.ys.includes(i) ? ' on' : ''}${numeric[i] ? '' : ' dim'}" data-y="${i}">${esc(h)}</button>`).join('')}</div></div>
    <div class="field"><label class="lbl">Title (optional)</label><input type="text" name="title" placeholder="e.g. Velocity over time"></div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Add graph to page</button></div>`, 'wide');
  let chart = null;
  const cfg = (dpr) => {
    const pie = v.type === 'pie', scatter = v.type === 'scatter';
    const labels = rows.map(r => r[v.x]);
    const ys = pie ? v.ys.slice(0, 1) : v.ys;
    const datasets = ys.map((c, k) => ({
      label: header[c],
      data: scatter ? rows.map(r => ({ x: parseNum(r[v.x]), y: parseNum(r[c]) })).filter(d => d.x !== null && d.y !== null) : rows.map(r => parseNum(r[c])),
      borderColor: pie ? '#fff' : CHART_COLORS[k % 8], backgroundColor: pie ? rows.map((_, i) => CHART_COLORS[i % 8]) : CHART_COLORS[k % 8] + (v.type === 'bar' ? 'cc' : '33'),
      borderWidth: 2, tension: 0.25, pointRadius: 4, fill: false,
    }));
    return {
      type: v.type, data: { labels, datasets },
      options: {
        animation: false, responsive: false, devicePixelRatio: dpr,
        plugins: { legend: { display: pie || ys.length > 1 }, title: { display: !!v.title, text: v.title, font: { size: 16, weight: '600' } } },
        scales: pie ? {} : {
          x: { type: scatter ? 'linear' : 'category', title: { display: true, text: header[v.x] } },
          y: { title: { display: ys.length === 1, text: header[ys[0]] }, beginAtZero: v.type === 'bar' },
        },
      },
    };
  };
  const draw = () => {
    chart?.destroy();
    if (!v.ys.length) { const c = $('.graph-prev', m.el); c.getContext('2d').clearRect(0, 0, c.width, c.height); return; }
    chart = new window.Chart($('.graph-prev', m.el), cfg(2));
  };
  $$('.seg[data-k]', m.el).forEach(s => wireSeg(s, x => { v[s.dataset.k] = s.dataset.k === 'x' ? +x : x; draw(); }));
  $('.ys', m.el).addEventListener('click', e => {
    const b = e.target.closest('[data-y]'); if (!b) return;
    const i = +b.dataset.y; v.ys = v.ys.includes(i) ? v.ys.filter(x => x !== i) : [...v.ys, i].sort((a, b) => a - b);
    b.classList.toggle('on', v.ys.includes(i)); draw();
  });
  $('[name=title]', m.el).addEventListener('input', e => { v.title = e.target.value.trim(); draw(); });
  $('[name=title]', m.el).addEventListener('keydown', e => e.stopPropagation());
  $('[data-ok]', m.el).onclick = guard(async () => {
    if (!v.ys.length) return toast('Choose at least one column to plot');
    // render the final picture off screen at high resolution
    const holder = document.createElement('div'); holder.style.cssText = 'position:absolute;left:-12000px;top:0'; document.body.appendChild(holder);
    const c = document.createElement('canvas'); c.width = 900; c.height = 540; holder.appendChild(c);
    const ch = new window.Chart(c, cfg(3));
    const blob = await new Promise(r => c.toBlob(r, 'image/png')); ch.destroy(); holder.remove();
    const key = 'img_' + uid(); await db.put('blobs', blob, key);
    const tb = tableBox(p, t), W = Math.round(Math.min(560, p.w - 40)), H = Math.round(W * 540 / 900);
    let x = tb[2] + 30, y = tb[1];
    if (x + W > p.w - 10) { x = clamp(tb[0], 20, Math.max(20, p.w - W - 20)); y = tb[3] + 24; }
    if (y + H + 30 > p.h) { if (p.bgKey) { p.bgW ||= p.w; p.bgH ||= p.h; } p.h = Math.ceil((y + H + 60) / 10) * 10; layout(); }
    const before = snap(p), im = { id: uid(), key, x: Math.round(x), y: Math.round(y), w: W, h: H };
    p.images.push(im); pushUndo(p, before); refreshPage(p); m.close();
    setTool('lasso'); setSelection(p, new Set(), new Set([im]));
    toast('Graph added. Drag to move, corner dot to resize.', 2600);
  });
  m.onClose = () => chart?.destroy();
  draw();
}
