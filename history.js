'use strict';
/* =====================================================================
   Inkbook v21 — page history.
   · On this device: before a page is saved, its previous version is kept
     (at most every 2 minutes) for one hour.
   · In the cloud: with sync on, every synced version of a page stays in
     your private GitHub repository, so you can go back further.
   Restoring a version is one step you can undo.
   ===================================================================== */
const HIST_MS = 60 * 60e3, HIST_GAP = 2 * 60e3, HK = id => 'sync:hist:' + id;   // 'sync:' keys never sync and never go into backups
{
  const put0 = db.put;
  db.put = async (n, v, k) => { if (n === 'pages' && v?.id) await keepLocalVersion(v).catch(() => { }); return put0(n, v, k); };
}
async function keepLocalVersion(next) {
  const now = Date.now(), h = ((await db.get('blobs', HK(next.id))) || []).filter(x => now - x.t < HIST_MS);
  if (h.length && now - h[h.length - 1].t < HIST_GAP) return;
  const old = await db.get('pages', next.id); if (!old) return;
  if (JSON.stringify(old.strokes) === JSON.stringify(next.strokes) && JSON.stringify(old.texts) === JSON.stringify(next.texts) && old.w === next.w && old.h === next.h && (old.images || []).length === (next.images || []).length && JSON.stringify(old.tables || []) === JSON.stringify(next.tables || [])) return;
  h.push({ t: now, page: old }); await rawPut('blobs', h.slice(-30), HK(next.id));
}
async function pruneLocalHistory() {
  const now = Date.now();
  for (const k of await db.keys('blobs')) {
    if (typeof k !== 'string' || !k.startsWith('sync:hist:')) continue;
    const h = ((await db.get('blobs', k)) || []).filter(x => now - x.t < HIST_MS);
    if (h.length) await rawPut('blobs', h, k); else await rawDel('blobs', k);
  }
}
async function cloudVersions(pid) {
  if (!SY?.on) return [];
  const list = await gha(`/commits?path=${encodeURIComponent('p/' + enc(pid) + '.json')}&per_page=40`);
  return list.map(c => ({ src: 'cloud', sha: c.sha, t: Date.parse(c.commit.committer?.date || c.commit.author?.date), who: (c.commit.message.match(/Inkbook: (\S+)/) || [])[1] || '' }));
}
const cloudPage = async (pid, sha) => JSON.parse(await gha(`/contents/p/${enc(pid)}.json?ref=${sha}`, {}, true));
const whenText = t => { const d = new Date(t), today = isoDay(new Date()) === isoDay(d); return (today ? '' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ') + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
async function drawVersion(canvas, pg) {
  normPage(pg); await preloadPage(pg).catch(() => { });
  const s = canvas.width / pg.w; canvas.height = Math.round(pg.h * s);
  renderPage(canvas.getContext('2d'), pg, s, { texts: true, sync: true });
}
async function pageHistoryFlow(p) {
  await flush();
  const local = ((await db.get('blobs', HK(p.id))) || []).filter(x => Date.now() - x.t < HIST_MS).map(x => ({ src: 'local', t: x.t, page: x.page })).reverse();
  const m = openModal(`<h2>Page history</h2><p class="hint" style="margin-top:-6px">Tap a version to see it. Restoring it can be undone.</p>
    <div class="hv-wrap"><div class="hv-list" data-list><div class="hint">Loading…</div></div><div class="hv-prev" data-prev><div class="hv-empty">${icon('clock')}<span>Pick a version on the left</span></div></div></div>
    <div class="modal-actions"><button class="btn" data-close>Close</button><button class="btn primary" data-restore disabled>Restore this version</button></div>`, 'wide hv');
  let cloud = [], cloudErr = '', chosen = null;
  const list = $('[data-list]', m.el), prev = $('[data-prev]', m.el), restore = $('[data-restore]', m.el);
  const draw = () => {
    const rows = (arr, from) => arr.map((v, i) => `<button class="hv-row" data-src="${from}" data-i="${i}"><b>${esc(whenText(v.t))}</b><small>${from === 'local' ? 'Saved on this device' : v.who ? 'Synced from ' + esc(v.who) : 'Synced'}${from === 'cloud' && i === 0 ? ' · latest' : ''}</small></button>`).join('');
    list.innerHTML = `<div class="hv-sec">${icon('clock')}Last hour on this device</div>${local.length ? rows(local, 'local') : '<div class="hv-none">No earlier versions in the last hour.</div>'}
      <div class="hv-sec">${icon('cloud')}In your cloud</div>${!SY?.on ? '<div class="hv-none">Turn on sync (the cloud button in the library) to keep every version of your pages.</div>' : cloudErr ? `<div class="hv-none">${esc(cloudErr)}</div>` : cloud.length ? rows(cloud, 'cloud') : '<div class="hv-none">Loading…</div>'}`;
  };
  draw();
  if (SY?.on) cloudVersions(p.id).then(v => { cloud = v; if (!v.length) cloudErr = 'Not in the cloud yet: it will be after the next sync.'; draw(); }).catch(e => { cloudErr = 'Couldn’t load: ' + e.message; draw(); });
  list.addEventListener('click', guard(async e => {
    const b = e.target.closest('.hv-row'); if (!b) return;
    $$('.hv-row', list).forEach(x => x.classList.toggle('on', x === b));
    const v = (b.dataset.src === 'local' ? local : cloud)[+b.dataset.i];
    prev.innerHTML = `<div class="hv-empty">${icon('clock')}<span>Loading…</span></div>`; restore.disabled = true;
    try {
      v.page ||= await cloudPage(p.id, v.sha);
      const c = document.createElement('canvas'); c.width = Math.min(900, prev.clientWidth * 2 || 600);
      await drawVersion(c, structuredClone(v.page)); prev.innerHTML = ''; prev.appendChild(c);
      chosen = v; restore.disabled = false;
    } catch (err) { prev.innerHTML = `<div class="hv-empty">${icon('clock')}<span>${esc(err.message)}</span></div>`; }
  }));
  restore.onclick = guard(async () => {
    if (!chosen) return;
    const v = structuredClone(chosen.page), before = snap(p);
    for (const k of ['strokes', 'texts', 'images', 'tables', 'links', 'w', 'h', 'template', 'paperColor', 'bgX', 'bgY', 'bgW', 'bgH']) if (v[k] !== undefined) p[k] = v[k];
    normPage(p); pushUndo(p, before); refreshPage(p); layout();
    m.close(); toast(`↶ Restored the version from ${whenText(chosen.t)}. Tap undo to go back.`, 3500);
  });
}
function bootHistory() { setTimeout(() => pruneLocalHistory().catch(() => { }), 5000); }
