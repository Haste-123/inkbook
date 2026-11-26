'use strict';
/* =====================================================================
   Inkbook v2 — import / export / converters / backup / help
   (loaded after app.js; starts the app at the bottom)
   ===================================================================== */

// ---------- PDF → pages ----------
async function loadPdfJs() {
  await loadScript(LIBS.pdf);
  const lib = window.pdfjsLib;
  if (!lib.GlobalWorkerOptions.workerSrc) {
    const src = await (await fetch(LIBS.pdfWorker)).text();
    lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  }
  return lib;
}
async function canvasToPage(c, nb, label) {
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
  const p = newPage(nb, { template: 'blank', paperColor: '#ffffff', w: PAGE_W, h: Math.round(PAGE_W * c.height / c.width) });
  p.bgKey = 'bg_' + p.id; if (label) p.source = label;
  await db.put('blobs', blob, p.bgKey); await db.put('pages', p);
  c.width = c.height = 0; return p;
}
async function pdfToPages(file, nb, label = file.name) {
  setProgress(`Opening ${label}…`, 0);
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    setProgress(`${label}: page ${i} of ${pdf.numPages}`, i / pdf.numPages);
    const pg = await pdf.getPage(i), vp0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: 1400 / vp0.width });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    const p = await canvasToPage(c, nb);
    try {   // keep the PDF's own text (with positions) so Find can search it exactly
      const tc = await pg.getTextContent(), k = PAGE_W / vp.width, words = [];
      for (const it of tc.items) {
        if (!it.str?.trim()) continue;
        const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
        const w = it.width * vp.scale, h = (it.height || Math.hypot(it.transform[2], it.transform[3])) * vp.scale, n = it.str.length;
        let off = 0;
        for (const part of it.str.split(/(\s+)/)) {
          if (part.trim()) words.push({ t: part, b: [x + w * off / n, y - h, x + w * (off + part.length) / n, y].map(v => Math.round(v * k)) });
          off += part.length;
        }
      }
      if (words.length) { p.pdfWords = words; await db.put('pages', p); }
    } catch (e) { console.warn(e); }
    out.push(p); pg.cleanup();
  }
  pdf.destroy(); return out;
}

// ---------- Photos → pages ----------
async function photosToPages(files, nb) {
  const out = [], own = !prog; if (own) showProgress('Adding photos…');
  for (const [i, f] of files.entries()) {
    setProgress(`Photo ${i + 1} of ${files.length}`, (i + 1) / files.length);
    const { blob, w, h } = await prepImage(f, 2000);
    const p = newPage(nb, { template: 'blank', paperColor: '#ffffff', w: PAGE_W, h: Math.round(PAGE_W * h / w) });
    p.bgKey = 'bg_' + p.id; await db.put('blobs', blob, p.bgKey); await db.put('pages', p); out.push(p);
  }
  if (own) closeProgress();
  return out;
}

// ---------- Word (.docx) → pages ----------
async function docxToPages(file, nb, label = file.name) {
  setProgress(`Reading ${label}…`, 0.05);
  await Promise.all([loadScript(LIBS.mammoth), loadScript(LIBS.html2canvas)]);
  const { value: html } = await window.mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const PAD_X = 80, PAD_Y = 70, CONTENT_H = A4_H - PAD_Y * 2;
  const box = document.createElement('div'); box.className = 'render-sandbox';
  box.style.position = 'absolute'; box.innerHTML = html || '<p>(This document is empty)</p>';
  document.body.appendChild(box);
  try {
    await Promise.all($$('img', box).map(img => img.complete ? 0 : new Promise(r => { img.onload = img.onerror = r; })));
    // group top-level blocks into pages without cutting a paragraph in half
    const blocks = [...box.children], groups = []; let cur = [], top = null;
    for (const b of blocks) {
      const y0 = b.offsetTop - PAD_Y, y1 = y0 + b.offsetHeight;
      if (top === null) top = y0;
      if (cur.length && y1 - top > CONTENT_H) { groups.push(cur); cur = []; top = y0; }
      cur.push(b);
    }
    if (cur.length) groups.push(cur);
    const out = [];
    for (const [i, g] of groups.entries()) {
      setProgress(`${label}: page ${i + 1} of ${groups.length}`, (i + 1) / groups.length);
      const pg = document.createElement('div'); pg.className = 'render-sandbox';
      pg.style.position = 'absolute'; pg.style.minHeight = A4_H + 'px';
      g.forEach(b => pg.appendChild(b.cloneNode(true))); document.body.appendChild(pg);
      const c = await window.html2canvas(pg, { scale: 1.4, backgroundColor: '#ffffff', logging: false, useCORS: true });
      pg.remove(); out.push(await canvasToPage(c, nb)); await nextFrame();
    }
    return out;
  } finally { box.remove(); }
}

// ---------- Export: PDF ----------
function exportScale(p, max = 1.6) { return Math.min(max, Math.sqrt(6e6 / (p.w * p.h))); }
async function renderForExport(p) {
  await preloadPage(p);
  const s = exportScale(p), c = document.createElement('canvas'); c.width = Math.round(p.w * s); c.height = Math.round(p.h * s);
  renderPage(c.getContext('2d'), p, s, { texts: true, sync: true });
  return c;
}
async function buildPdf(pages, onStep) {
  await loadScript(LIBS.jspdf);
  const { jsPDF } = window.jspdf; let doc;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]; onStep?.(i);
    const c = await renderForExport(p);
    const W = p.w * 0.6, H = p.h * 0.6, orient = W > H ? 'l' : 'p';
    if (!doc) doc = new jsPDF({ orientation: orient, unit: 'pt', format: [W, H], compress: true }); else doc.addPage([W, H], orient);
    doc.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, W, H);
    c.width = c.height = 0; await nextFrame();
  }
  return doc.output('blob');
}
async function exportPDF(nb, pages) {
  showProgress('Exporting PDF…');
  const blob = await buildPdf(pages, i => setProgress(`Page ${i + 1} of ${pages.length}`, (i + 1) / pages.length));
  closeProgress(); readyToShare(blob, safeName(nb.title) + '.pdf');
}

// ---------- Export: Word (.docx) ----------
const xmlEsc = s => String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
async function buildDocx(title, pages, sections = [], onStep) {
  await loadScript(LIBS.jszip);
  const zip = new window.JSZip(), rels = [], body = [];
  const para = (text, size = 24, bold = false) => `<w:p><w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>`;
  if (title) body.push(para(title, 40, true));
  const secAtPage = new Map(sections.map(s => [s.pageId, s]));
  const MAXW = 6400800, MAXH = 8686800; // 7in × 9.5in in EMU
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]; onStep?.(i);
    const sec = secAtPage.get(p.id); if (sec) body.push(para(sec.title, sec.level === 2 ? 28 : 34, true));
    const c = await renderForExport(p);
    const data = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88)); c.width = c.height = 0;
    const n = i + 1, rid = 'rId' + n;
    zip.file(`word/media/page${n}.jpeg`, data);
    rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page${n}.jpeg"/>`);
    let cx = MAXW, cy = Math.round(MAXW * p.h / p.w); if (cy > MAXH) { cx = Math.round(cx * MAXH / cy); cy = MAXH; }
    body.push(`<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Page ${n}"/>` +
      `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="page${n}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
      `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
    const typed = (p.texts || []).map(t => t.text).filter(Boolean);
    if (typed.length) typed.forEach(t => t.split('\n').forEach(line => body.push(para(line, 22))));
    if (i < pages.length - 1) body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    await nextFrame();
  }
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
async function exportDocx(nb, pages) {
  showProgress('Exporting Word document…');
  const blob = await buildDocx(nb.title, pages, nb.sections, i => setProgress(`Page ${i + 1} of ${pages.length}`, (i + 1) / pages.length));
  closeProgress(); readyToShare(blob, safeName(nb.title) + '.docx');
}

// ---------- Import (from other note apps, PDFs, Word, ZIPs, photos) ----------
const kindOf = name => /\.pdf$/i.test(name) ? 'pdf' : /\.docx$/i.test(name) ? 'docx' : /\.zip$/i.test(name) ? 'zip'
  : /\.(jpe?g|png|heic|heif|gif|webp)$/i.test(name) ? 'img' : /\.json$/i.test(name) ? 'json' : null;
async function folderFor(parentId, name) {
  FOLDERS = await db.all('folders');
  let f = FOLDERS.find(x => (x.parentId || '') === (parentId || '') && x.name === name);
  if (!f) { f = { id: uid(), name, color: COVER_COLORS[FOLDERS.length % COVER_COLORS.length], parentId: parentId || null, created: Date.now() }; await db.put('folders', f); FOLDERS.push(f); }
  return f.id;
}
async function fileToNotebook(file, kind, folderId, title) {
  const nb = makeNotebook({ title: title || file.name.replace(/\.[^.]+$/, ''), folderId, color: COVER_COLORS[Math.floor(Math.random() * 9)] });
  const pages = kind === 'pdf' ? await pdfToPages(file, nb, file.name) : kind === 'docx' ? await docxToPages(file, nb, file.name) : [];
  if (!pages.length) return null;
  nb.pages = pages.map(p => p.id); nb.coverKey = pages[0].bgKey; nb.imported = true;
  await db.put('notebooks', nb); return nb;
}
async function importFiles(files, folderId = '') {
  if (!files.length) return;
  const json = files.find(f => kindOf(f.name) === 'json'); if (json) return importBackup(json);
  showProgress(`Importing ${files.length} file${files.length > 1 ? 's' : ''}…`);
  let made = 0; const imgs = [], failed = [];
  for (const f of files) {
    const k = kindOf(f.name) || (f.type.startsWith('image/') ? 'img' : null);
    try {
      if (k === 'pdf' || k === 'docx') { if (await fileToNotebook(f, k, folderId)) made++; }
      else if (k === 'img') imgs.push(f);
      else if (k === 'zip') made += await importZip(f, folderId);
      else failed.push(f.name);
    } catch (e) { console.error(e); failed.push(f.name); }
  }
  if (imgs.length) {
    const nb = makeNotebook({ title: 'Imported photos ' + fmtDate(Date.now()), folderId });
    const pages = await photosToPages(imgs, nb); nb.pages = pages.map(p => p.id); nb.coverKey = pages[0]?.bgKey || null;
    await db.put('notebooks', nb); made++;
  }
  closeProgress();
  toast(`Imported ${made} notebook${made === 1 ? '' : 's'}${failed.length ? ` · couldn’t read: ${failed.slice(0, 3).join(', ')}` : ''}`, 5000);
  if (!E.nb) showLibrary();
}
async function importZip(file, folderId) {
  setProgress(`Unpacking ${file.name}…`, 0);
  await loadScript(LIBS.jszip);
  const zip = await window.JSZip.loadAsync(file), entries = [];
  zip.forEach((path, entry) => { if (!entry.dir && !/(^|\/)(__MACOSX|\.)/.test(path) && kindOf(path)) entries.push([path, entry]); });
  const rootName = file.name.replace(/\.zip$/i, '');
  const root = entries.length > 1 ? await folderFor(folderId, rootName) : folderId;
  let made = 0; const imgsByDir = new Map();
  for (const [i, [path, entry]] of entries.entries()) {
    const parts = path.split('/'), name = parts.pop(), k = kindOf(name);
    let fid = root; for (const dir of parts) if (dir && dir !== rootName) fid = await folderFor(fid, dir);
    const blob = await entry.async('blob'), f = new File([blob], name, { type: k === 'pdf' ? 'application/pdf' : blob.type });
    setProgress(`${i + 1} of ${entries.length}: ${name}`, i / entries.length);
    try {
      if (k === 'pdf' || k === 'docx') { if (await fileToNotebook(f, k, fid)) made++; }
      else if (k === 'img') { if (!imgsByDir.has(fid)) imgsByDir.set(fid, []); imgsByDir.get(fid).push(new File([blob], name, { type: 'image/' + (name.split('.').pop().toLowerCase().replace('jpg', 'jpeg')) })); }
    } catch (e) { console.error(e); }
  }
  for (const [fid, imgs] of imgsByDir) {
    const nb = makeNotebook({ title: 'Photos', folderId: fid }), pages = await photosToPages(imgs, nb);
    nb.pages = pages.map(p => p.id); nb.coverKey = pages[0]?.bgKey || null; await db.put('notebooks', nb); made++;
  }
  return made;
}
async function importNotesFlow() {
  FOLDERS = await db.all('folders');
  const m = openModal(`<h2>Import notes</h2>
    <p class="msg">Move your notes from another app in one go:</p>
    <ol>
      <li>In your old app, select the notebooks you want and choose <b>Share / Export → PDF</b>. Many apps also have <b>Export all</b>, which makes a single ZIP.</li>
      <li>Save them to the <b>Files</b> app (On My iPad or iCloud Drive).</li>
      <li>Tap <b>Choose files</b> below and select them all at once.</li>
    </ol>
    <p class="hint"><b>GoodNotes:</b> Library → Select → pick notebooks → Share → Export → PDF.<br><b>Notability:</b> select notes → Share → PDF.<br><b>OneNote / Word:</b> share as PDF or .docx.<br><b>Apple Notes:</b> open a note → Share → Save to Files (or Print → share as PDF).</p>
    <p class="hint">Each PDF or Word file becomes a notebook, and folders inside a ZIP become folders here. Old handwriting arrives as the page background: you can write, highlight and add to it, but not edit the old strokes. Photos become a “Photos” notebook.</p>
    <div class="field"><label class="lbl">Put them in</label><select class="select" name="folder">${folderOptions(curFolder())}</select></div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-go>Choose files…</button></div>`);
  $('[data-go]', m.el).onclick = guard(async () => {
    const fid = $('[name=folder]', m.el).value;
    const files = await pickFiles('.pdf,.docx,.zip,.json,image/*,application/pdf,application/zip', true);
    m.close(); await importFiles(files, fid);
  });
}

// ---------- Converter (PDF ↔ Word, either → notebook) ----------
async function converterFlow() {
  const f = await pickFile('.pdf,.docx,application/pdf'); if (!f) return;
  const k = kindOf(f.name); if (k !== 'pdf' && k !== 'docx') return toast('Choose a PDF or Word (.docx) file.');
  const v = await menu(`Convert “${f.name}” to…`, k === 'pdf'
    ? [{ label: 'Word document (.docx)', value: 'docx', hint: 'Each page becomes a full-page picture in Word' }, { label: 'Inkbook notebook', value: 'nb', hint: 'Write and highlight on it' }]
    : [{ label: 'PDF', value: 'pdf' }, { label: 'Inkbook notebook', value: 'nb', hint: 'Write and highlight on it' }]);
  if (!v) return;
  if (v === 'nb') {
    showProgress('Converting…'); const nb = await fileToNotebook(f, k, curFolder()); closeProgress();
    if (nb) { toast('Notebook created'); return openNotebook(nb.id); } return;
  }
  showProgress('Converting…');
  const tmp = makeNotebook({ title: '(converting) ' + f.name });
  let pages = [];
  try {
    pages = k === 'pdf' ? await pdfToPages(f, tmp) : await docxToPages(f, tmp);
    const base = safeName(f.name.replace(/\.[^.]+$/, ''));
    const blob = v === 'docx' ? await buildDocx('', pages, [], i => setProgress(`Writing page ${i + 1} of ${pages.length}`, (i + 1) / pages.length))
      : await buildPdf(pages, i => setProgress(`Writing page ${i + 1} of ${pages.length}`, (i + 1) / pages.length));
    closeProgress(); readyToShare(blob, base + (v === 'docx' ? '.docx' : '.pdf'));
  } finally {
    for (const p of pages) { await db.del('pages', p.id); if (p.bgKey) await db.del('blobs', p.bgKey); }
    closeProgress();
  }
}

// ---------- Backup ----------
const blobToDataURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
async function exportBackup() {
  showProgress('Creating backup…'); await flush();
  const keys = await db.keys('blobs'), blobs = {};
  for (const [i, k] of keys.entries()) { setProgress(`Packing file ${i + 1} of ${keys.length}`, i / keys.length); blobs[k] = await blobToDataURL(await db.get('blobs', k)); }
  const data = { app: 'inkbook', version: 2, date: Date.now(), folders: await db.all('folders'), notebooks: await db.all('notebooks'), pages: await db.all('pages'), blobs };
  closeProgress();
  readyToShare(new Blob([JSON.stringify(data)], { type: 'application/json' }), `inkbook-backup-${new Date().toISOString().slice(0, 10)}.json`);
}
async function importBackup(file) {
  const f = file || await pickFile('.json,application/json'); if (!f) return;
  showProgress('Restoring backup…');
  const data = JSON.parse(await f.text());
  if (data.app !== 'inkbook') throw new Error('That file is not an Inkbook backup.');
  const blobs = Object.entries(data.blobs || {});
  for (const [i, [k, u]] of blobs.entries()) { setProgress(`File ${i + 1} of ${blobs.length}`, i / blobs.length); await db.put('blobs', await (await fetch(u)).blob(), k); }
  for (const x of data.folders || []) await db.put('folders', x);
  for (const p of data.pages || []) await db.put('pages', p);
  for (const n of data.notebooks || []) await db.put('notebooks', n);
  await migrate(); closeProgress(); toast(`Restored ${data.notebooks.length} notebooks`); showLibrary();
}

// ---------- Help ----------
const HELP = [
  ['Getting started', `
    <p>Your library has <b>folders</b> (one per course or semester, and folders can go inside folders) and <b>notebooks</b>. Tap <b>New</b> to make either. Inside a notebook, pages scroll up and down.</p>
    <p>The first time you write with Apple Pencil, Inkbook switches to <b>Pencil-only mode</b>: only the Pencil draws, and your palm and fingers scroll and zoom. Turn it on or off with the ✋ button.</p>`],
  ['Tools', `
    <p><b>Tap a tool</b> to pick it. <b>Tap it again</b> to open its options (colors, size slider, styles). The colored dot button next to the tools also opens the options.</p>
    <ul>
      <li><b>Pen</b>: choose Ballpoint, Fountain (pressure-sensitive) or Brush. Draw a line, rectangle or circle and <b>hold still</b> at the end: it snaps into a clean shape. After a snapped line, keep dragging to adjust its end.</li>
      <li><b>Highlighter</b>: see-through ink that stays behind your writing. Option: straight lines.</li>
      <li><b>Eraser</b>: <i>Whole stroke</i> removes whole strokes. <i>Precise</i> erases only the part you rub over. Option: erase only highlighter. Also has <i>Clear this page</i>.</li>
      <li><b>Shapes</b>: line, arrow, rectangle, ellipse, triangle. Drag to draw.</li>
      <li><b>Lasso</b>: circle things (or switch to Rectangle mode) to select strokes, images and text. Tap a single stroke or image to select just that. Drag inside the box to move, drag the round corner handle to resize, and tap a color to recolor. The menu has Cut, Copy, Duplicate, <b>★ Save as</b> and Delete. Tap an empty spot to paste, on any page or even another notebook.</li>
      <li><b>Text</b>: tap to type. Drag the ⠿ handle to move, × to delete. Choose font and size in the options. With Apple Pencil you can handwrite inside a text box and iPad turns it into typed text (Scribble).</li>
      <li><b>Style</b>: select anything with the lasso, then tap <b>Style</b> to change its color, the thickness of handwriting, or the font, size, bold and italic of text. A text box being typed in has its own <b>Aa</b> button.</li>
      <li><b>Save image</b>: select anything with the lasso, then tap <b>Save image</b> → Share / Save → <b>Save Image</b> to put it in your Photos.</li>
      <li><b>✦ Ask Claude</b>: select a question or formula. <b>Open in the Claude app</b> sends it to Claude using your subscription; copy the reply and tap <b>Paste the answer</b> to put it on your page. With an API key (Settings), answers can appear right inside Inkbook.</li>
      <li><b>Laser pointer</b> (⋯ menu → Tools): a fading red trail for presenting. Never saved. Tap the pen to leave it.</li>
      <li><b>Image</b>: insert from Photos, the camera or Files. You can also drag images in from Photos in Split View, or paste them.</li>
    </ul>
    <p>Tap a color that's already selected to change it to any color you like.</p>`],
  ['Gestures', `
    <ul>
      <li><b>Two-finger tap</b>: undo · <b>three-finger tap</b>: redo</li>
      <li><b>Pinch</b>: zoom · <b>one finger</b> (Pencil-only mode) or <b>two fingers</b>: scroll</li>
      <li><b>Hold the pen still</b> at the end of a stroke: snap to a shape</li>
      <li><b>Drag any edge of a page</b> (the blue handles on all four sides): grow the page up, down, left or right, like in Paint. Your notes stay where they are.</li>
      <li><b>⌘F</b> or the 🔍 button: <b>Find</b> words in your handwriting, typed text and PDFs. Handwriting is read on your iPad; the first time, a small reader (about 7 MB) downloads once.</li>
      <li>Tap the <b>page counter</b> at the bottom to jump to any lesson or topic</li>
      <li>In Pencil-only mode, <b>tap an image or text box with your finger</b> to select it, then drag it with your finger</li>
      <li><b>Double-tap a notebook's name</b> (at the top, or under its cover in the library) to rename it. This also works for folder names.</li>
    </ul>`],
  ['Lessons, topics & navigation', `
    <p>Split a notebook into <b>Lessons</b> (lectures, chapters) and <b>Topics</b> inside them: ⋯ → <i>+ Lesson / topic</i>, or the sidebar button. They show as headings between pages.</p>
    <p>The <b>sidebar</b> (panel button next to the back arrow) has:</p>
    <ul><li><b>Outline</b>: every lesson and topic, with page ranges. ⋯ lets you rename, recolor, move up or down, add a page, remove the heading, or delete it with its pages.</li>
    <li><b>Saved</b>: your saved questions, problems and so on</li><li><b>Pages</b>: thumbnails, plus reorder, duplicate and delete</li><li><b>Bookmarks</b>: pages you marked with 🔖</li></ul>`],
  ['Saved questions, problems & notes', `
    <p>Keep important things one tap away:</p>
    <ul><li>Select something with the <b>lasso</b>, then <b>★ Save as…</b>. Pick Question, Problem, Example, Definition, Formula, Note or Important, and give it a title.</li>
    <li><b>Automatic:</b> text boxes that start with <b>Q:</b>, <b>Q3)</b>, <b>Problem 2:</b>, <b>Ex:</b>, <b>Def:</b>, <b>Formula:</b>, <b>Theorem:</b>, <b>Example:</b>, <b>Note:</b> or <b>!!</b> are picked up by themselves.</li></ul>
    <p>Find them in the notebook's <b>Saved</b> tab, and for a whole subject at the bottom of its <b>folder</b> in the library. Tapping one jumps to the exact spot and flashes it.</p>
    <p class="hint">Handwriting itself can't be read automatically while offline. Use a text box with Scribble, or Save as, to make it findable.</p>`],
  ['Pages, paper & size', `
    <ul><li>⋯ → <b>Page template</b>: blank, lined, narrow or wide ruled, grid, small grid, graph paper, dotted, Cornell, to-do, music staff</li>
    <li>⋯ → <b>Page size</b>: A4, landscape, Letter, square, 16:9, long scroll, whiteboard. Or drag the page edges.</li>
    <li>⋯ → <b>Paper color</b> · <b>Duplicate</b> · <b>Delete</b> · 🔖 bookmark · <b>+ page</b> button</li></ul>`],
  ['Import, convert & export', `
    <ul><li><b>Import notes</b> (library sidebar): bring in many PDFs, Word files, ZIPs or photos at once. Each becomes a notebook, and folders inside a ZIP are kept.</li>
    <li><b>Convert files</b>: PDF → Word, Word → PDF, or either → notebook</li>
    <li>In a notebook: ⋯ → insert a PDF, slides or a Word document as pages, or <b>photos as pages</b> (great for handouts)</li>
    <li>Export a notebook as <b>PDF</b> or <b>Word</b>, or a page as an image. Then use Share → Save to Files.</li></ul>
    <p class="hint">Word documents are converted by laying out their text and images; complex layouts may shift slightly. PDF → Word puts each page into Word as a picture.</p>`],
  ['Backup & offline', `
    <p>Everything works offline and stays <b>on this iPad only</b>. Settings → <b>Back up everything</b> makes one file. Save it to iCloud Drive now and then. Restore it any time, or on a new iPad.</p>`],
  ['Presets & gestures', `
    <ul><li><b>Pen presets</b>: the bar on the left edge. Tap one to switch pen, color and size at once. Set up a pen, then tap <b>+</b> to save it. Hold a preset to move, replace or remove it. ‹ hides the bar.</li>
    <li><b>Tool wheel</b>: press and hold one finger on the page (Pencil-only mode). Pick a tool, undo/redo, a preset, or <b>Last</b> to go back to the previous tool.</li>
    <li><b>Double-tap</b> with a finger: swap between your current and previous tool (e.g. pen ⇄ eraser).</li>
    <li>Two-finger tap = undo, three-finger tap = redo. Turn any of these off in Settings.</li></ul>`],
  ['Tables & graphs', `
    <ul><li>⋯ → <b>Table</b>. Type in the cells, or handwrite in them with the Pencil. Tab = next cell, Return = cell below.</li>
    <li>To change a table later, tap it with any tool (or your finger) → <b>✎ Edit table</b>. With the Text tool you can tap a cell directly. Lasso it to move, resize, duplicate or delete it.</li>
    <li><b>📈 Graph</b>: line, bar, scatter or pie from your columns. Add a <b>trendline</b> like Excel: linear, polynomial (order 2–6), exponential, logarithmic or power, with its <b>equation</b> and <b>R²</b> shown on the graph.</li></ul>`],
  ['Stickers & page layouts', `
    <ul><li>⋯ → <b>Stickers</b>: labels (Important, Exam!, Formula…), symbols, and ink shapes (arrows, braces, checkboxes) that stay editable.</li>
    <li>Make your own: lasso something → ⋯ → <b>Save as sticker</b>. It appears under <b>My stickers</b>.</li>
    <li>⋯ → <b>Page layout</b>: Cornell notes, weekly planner, lab report (with a results table), worked math solution, to-do list, lecture notes, exam revision. You can also <b>save any page as your own layout</b>.</li></ul>`],
  ['Links between pages', `
    <p>Lasso some writing → ⋯ → <b>Add a link</b>. Choose a page or lesson in this notebook, another notebook, or a website. A small 🔗 chip appears: tap it to jump there, and a <b>Back</b> button takes you back. Hold the chip to change or remove the link.</p>`],
  ['Audio recording', `
    <ul><li>Tap the <b>microphone</b> in the toolbar to record a lecture; tap again to stop. Everything you write while recording is linked to that moment.</li>
    <li>⋯ → <b>Recordings</b> (or hold the microphone): play, rename, share or delete.</li>
    <li>While playing, ink written later is faded, so you can watch your notes appear. <b>Tap any ink</b> to jump the audio to when you wrote it. <b>Follow</b> scrolls along with the notes.</li></ul>
    <p class="hint">The first time, iPad asks for microphone permission. Recording stops if you leave the notebook or close the app.</p>`],
  ['Split view', `
    <p>⋯ → <b>Split view</b> shows another notebook (or another part of this one) beside your notes, e.g. lecture slides next to your writing. Scroll and pinch it separately, drag its left edge to resize, and tap its title to switch notebook. On a narrow screen it opens at the bottom.</p>`],
  ['Planner & exams', `
    <ul><li>Library → <b>Planner</b>: your exams with a <b>countdown</b>, and study tasks grouped by Overdue, Today, Next 7 days and Later.</li>
    <li>Each subject folder shows its own exams and tasks at the top. Home shows what's <b>coming up</b>.</li>
    <li>Tap an exam → <b>Make a study plan</b>: Inkbook spreads a review session for each lesson in that subject until the exam, and keeps the day before for practice.</li></ul>`],
  ['Keyboard shortcuts', `
    <p>With a keyboard: <b>P</b> pen · <b>H</b> highlighter · <b>E</b> eraser · <b>S</b> shapes · <b>L</b> lasso · <b>T</b> text · <b>K</b> laser · <b>I</b> image · <b>B</b> bookmark · <b>⌘Z</b> / <b>⇧⌘Z</b> undo / redo · <b>⌘C / ⌘X / ⌘V / ⌘D</b> copy / cut / paste / duplicate · <b>⌘A</b> select all · <b>Delete</b> remove selection · <b>?</b> this help</p>`],
];
function openHelp(topic = 0) {
  const m = openModal(`<h2>Help & tips</h2><div class="seg" style="margin-bottom:6px">${HELP.map(([t], i) => `<button class="chip${i === topic ? ' on' : ''}" data-v="${i}">${esc(t)}</button>`).join('')}</div>
    <div class="help-body"></div><div class="modal-actions"><button class="btn primary" data-close>Got it</button></div>`, 'wide');
  const show = i => { $('.help-body', m.el).innerHTML = `<h3>${HELP[i][0]}</h3>${HELP[i][1]}`; };
  wireSeg($('.seg', m.el), v => show(+v)); show(topic);
}

// ---------- Start ----------
boot().then(() => {
  bootFind(); bootOrganize(); bootPlus();
  $('#helpSide')?.addEventListener('click', () => openHelp());
  document.addEventListener('keydown', e => { if (e.key === '?' && !e.target.closest?.('[contenteditable], input, textarea')) openHelp(); });
  if (!localStorage.getItem('inkbook.seenHelp2')) { try { localStorage.setItem('inkbook.seenHelp2', '1'); } catch { } toast('New: folders, lessons, images, shapes, saved questions, import & convert. Tap Help in the sidebar for a tour.', 6000); }
});
