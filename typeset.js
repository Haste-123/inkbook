'use strict';
/* =====================================================================
   Inkbook v11 — typeset Claude's answers like a math document
   (fractions, roots, exponents, Greek letters…) and place them on the page
   as a crisp picture in a handwritten or clean style. Uses KaTeX.
   ===================================================================== */

const KATEX = {
  css: 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css',
  js: 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js',
};
let katexP = null;
function loadKatex() {
  return katexP ||= (async () => {
    if (!$('link[data-katex]')) {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = KATEX.css; l.crossOrigin = 'anonymous'; l.dataset.katex = '1';
      document.head.appendChild(l);
      await new Promise((res, rej) => { l.onload = res; l.onerror = () => rej(new Error('Couldn’t load the math typesetter. Connect to the internet once so it can be saved for offline use.')); });
    }
    await loadScript(KATEX.js);
  })().catch(e => { katexP = null; $('link[data-katex]')?.remove(); throw e; });
}

// Markdown-ish answer → HTML, with every $…$ / $$…$$ / \(…\) / \[…\] typeset by KaTeX
function mdToHtml(raw) {
  const math = [];
  const keep = (tex, display) => { math.push([tex.trim(), display]); return `\u0000${math.length - 1}\u0000`; };
  const s = String(raw || '').replace(/\r/g, '')
    .replace(/\$\$([\s\S]+?)\$\$/g, (m, t) => keep(t, true))
    .replace(/\\\[([\s\S]+?)\\\]/g, (m, t) => keep(t, true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (m, t) => keep(t, false))
    .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (m, pre, t) => pre + keep(t, false));
  const inline = t => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*(\S[^*\n]*?)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  let html = '', list = null, para = [];
  const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
  const flushPara = () => { if (para.length) { html += `<p>${para.map(inline).join('<br>')}</p>`; para = []; } };
  for (const line of s.split('\n')) {
    const l = line.trim(); let m;
    if (!l || /^[-*_]{3,}$/.test(l)) { flushPara(); closeList(); continue; }
    if (/^(final\s+)?answer\s*[:：]/i.test(l.replace(/\*\*/g, ''))) { flushPara(); closeList(); html += `<div class="ans">${inline(l.replace(/\*\*/g, ''))}</div>`; continue; }
    if ((m = l.match(/^#{1,6}\s+(.+)$/)) || (m = l.match(/^\*\*([^*]+)\*\*\s*:?$/))) { flushPara(); closeList(); html += `<h4>${inline(m[1].replace(/:$/, ''))}</h4>`; continue; }
    if ((m = l.match(/^[-*•]\s+(.+)$/))) { flushPara(); if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; continue; }
    if ((m = l.match(/^(\d+)[.)]\s+(.+)$/))) { flushPara(); if (list !== 'ol') { closeList(); html += `<ol start="${m[1]}">`; list = 'ol'; } html += `<li>${inline(m[2])}</li>`; continue; }
    if (/^\u0000\d+\u0000$/.test(l) && math[+l.slice(1, -1)]?.[1]) { flushPara(); closeList(); html += `<div class="disp">${l}</div>`; continue; }
    closeList(); para.push(l);
  }
  flushPara(); closeList();
  return html.replace(/\u0000(\d+)\u0000/g, (m, i) => {
    const [tex, display] = math[+i];
    try { return window.katex.renderToString(tex, { displayMode: display, throwOnError: false, output: 'html', strict: 'ignore' }); }
    catch { return `<code>${esc(tex)}</code>`; }
  });
}

const ANSWER_STYLES = [['hand', 'Handwritten'], ['clean', 'Clean']];
const ANSWER_INKS = ['#1e3a8a', '#1f2430', '#0f766e', '#7c2d12'];
let answerPrefs = (() => { try { return JSON.parse(localStorage.getItem('inkbook.answerPrefs') || '') || null; } catch { return null; } })() || { style: 'hand', ink: '#1e3a8a', as: 'picture' };
const sheetHtml = (raw, q) => `<div class="ans-head">✦ Claude${q ? ' · ' + esc(q.length > 70 ? q.slice(0, 67) + '…' : q) : ''}</div>${mdToHtml(raw)}`;

// Renders the answer to a transparent, high-resolution picture
async function typesetToCanvas(raw, q, style, ink, widthPx) {
  await Promise.all([loadKatex(), loadScript(LIBS.html2canvas)]);
  const box = document.createElement('div');
  box.className = `answer-sheet render ${style}`; box.style.width = widthPx + 'px'; box.style.color = ink;
  box.innerHTML = sheetHtml(raw, q);
  document.body.appendChild(box);
  try {
    await document.fonts.ready; await nextFrame(); await document.fonts.ready;    // math fonts load on first use
    return await window.html2canvas(box, { scale: 3, backgroundColor: null, logging: false });
  } finally { box.remove(); }
}

// Preview window: choose style / ink / picture-or-text, then place it on the page
function answerPreview(p, box, raw, question) {
  raw = String(raw || '').trim();
  if (!raw) { toast('Nothing to paste. Copy Claude’s answer first.'); return Promise.resolve(false); }
  return new Promise(res => {
    const v = { ...answerPrefs };
    const m = openModal(`<h2>Add Claude’s answer to your notes</h2>
      <div class="ans-preview"><div class="answer-sheet ${v.style}" style="color:${v.ink}"><p class="hint">Typesetting…</p></div></div>
      <div class="ans-controls">
        <div class="field"><label class="lbl">Style</label><div class="seg" data-k="style">${segHtml(ANSWER_STYLES, v.style)}</div></div>
        <div class="field"><label class="lbl">Ink</label><div class="seg" data-k="ink">${swatchHtml(ANSWER_INKS, v.ink)}</div></div>
        <div class="field"><label class="lbl">Add it as</label><div class="seg" data-k="as">${segHtml([['picture', 'Typeset math (recommended)'], ['text', 'Editable text']], v.as)}</div>
          <p class="hint">Typeset math shows real fractions, roots and powers, like a math document. You can move and resize it, but not edit the words. Editable text can be changed later, with simpler math.</p></div>
      </div>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Add to page</button></div>`, 'wide');
    const prev = $('.ans-preview .answer-sheet', m.el);
    const draw = async () => {
      prev.className = `answer-sheet ${v.style}`; prev.style.color = v.ink;
      try { await loadKatex(); prev.innerHTML = sheetHtml(raw, question); }
      catch (e) { prev.innerHTML = `<p>${esc(plainText(raw)).replace(/\n/g, '<br>')}</p><p class="hint">${esc(e.message)}</p>`; }
    };
    $$('.seg[data-k]', m.el).forEach(s => wireSeg(s, x => { v[s.dataset.k] = x; draw(); }));
    let done = false;
    $('[data-ok]', m.el).onclick = guard(async () => {
      answerPrefs = { ...v }; try { localStorage.setItem('inkbook.answerPrefs', JSON.stringify(answerPrefs)); } catch { }
      if (v.as === 'text') { done = insertAnswerNotes(p, box, raw, question); m.close(); return; }
      $('[data-ok]', m.el).textContent = 'Adding…'; $('[data-ok]', m.el).disabled = true;
      try {
        const W = Math.round(Math.min(560, p.w - 40));
        const canvas = await typesetToCanvas(raw, question, v.style, v.ink, W);
        await insertAnswerPicture(p, box, canvas, W);
        done = true; m.close();
      } catch (e) {
        console.error(e);
        toast('Couldn’t typeset it (' + (e.message || e) + '). Added as text instead.', 5000);
        done = insertAnswerNotes(p, box, raw, question); m.close();
      }
    });
    m.onClose = () => res(done);
    draw();
  });
}
async function insertAnswerPicture(p, box, canvas, W) {
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  const key = 'img_' + uid(); await db.put('blobs', blob, key);
  const H = Math.round(W * canvas.height / canvas.width); canvas.width = canvas.height = 0;
  let x = box[2] + 28, y = box[1];
  if (x + W > p.w - 10) { x = clamp(box[0], 20, Math.max(20, p.w - W - 20)); y = box[3] + 20; }
  if (y + H + 30 > p.h) { if (p.bgKey) { p.bgW ||= p.w; p.bgH ||= p.h; } p.h = Math.ceil((y + H + 60) / 10) * 10; layout(); }
  const before = snap(p), im = { id: uid(), key, x: Math.round(x), y: Math.round(y), w: W, h: H };
  p.images.push(im); pushUndo(p, before); refreshPage(p);
  if (E.tool !== 'lasso') setTool('lasso');
  setSelection(p, new Set(), new Set([im]));
  toast('Answer added. Drag to move it, or use the corner dot to resize.', 3000);
}
