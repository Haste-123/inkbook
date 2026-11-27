'use strict';
/* =====================================================================
   Inkbook v19 — sync between devices through a private GitHub repository.
   Every folder, notebook, page and file is one file in the repo:
     f/<id>.json  folders      n/<id>.json  notebooks     p/<id>.json  pages
     m/<key>.json app data (planner, stickers, layouts)
     b/<key>.txt  pictures, PDF pages, recordings ("<type>\n<base64>")
   Each sync compares three versions of every file (this device, GitHub,
   and how it was at the last sync) and only moves what changed. If both
   sides changed the same page, this device's version wins.
   The key stays on this device (localStorage, never in backups).
   ===================================================================== */

Object.assign(ICONS, {
  cloud: '<path d="M7 18.5a4.5 4.5 0 01-.5-8.97A6 6 0 0118 8.5a4.5 4.5 0 01-.5 10H7z"/>',
  cloudok: '<path d="M7 18.5a4.5 4.5 0 01-.5-8.97A6 6 0 0118 8.5a4.5 4.5 0 01-.5 10H7z"/><path d="M9.5 13.5l2 2 3.5-4"/>',
  sync: '<path d="M20 11a8 8 0 00-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0014.3 4.9L20 16"/><path d="M20 21v-5h-5"/>',
});

const SY_KEY = 'inkbook.sync', SY_DIRTY = 'inkbook.syncdirty', SY_STATE = 'sync:state';
let SY = (() => { try { return JSON.parse(localStorage.getItem(SY_KEY) || 'null'); } catch { return null; } })();
const sySave = () => { try { SY ? localStorage.setItem(SY_KEY, JSON.stringify(SY)) : localStorage.removeItem(SY_KEY); } catch { } };
let syDirty = new Set((() => { try { return JSON.parse(localStorage.getItem(SY_DIRTY) || '[]'); } catch { return []; } })());
let syDirtyT = null;
const syDirtySave = () => { clearTimeout(syDirtyT); syDirtyT = setTimeout(() => { try { localStorage.setItem(SY_DIRTY, JSON.stringify([...syDirty])); } catch { } }, 300); };

// ---------- notice every change (the sync engine itself writes through raw*) ----------
const rawPut = db.put, rawDel = db.del;
const SYNCED = new Set(['notebooks', 'pages', 'folders', 'blobs']);
const skipKey = (n, k) => n === 'blobs' && typeof k === 'string' && k.startsWith('sync:');
db.put = async (n, v, k) => { const r = await rawPut(n, v, k); const key = k ?? v?.id; if (SYNCED.has(n) && key != null && !skipKey(n, key)) { syDirty.add(n + '|' + key); syDirtySave(); syncSoon(); } return r; };
db.del = async (n, k) => { const r = await rawDel(n, k); if (SYNCED.has(n) && !skipKey(n, k)) { syDirty.add(n + '|' + k); syDirtySave(); syncSoon(); } return r; };

// ---------- paths, hashing, encoding ----------
const PFX = { folders: 'f/', notebooks: 'n/', pages: 'p/' };
const enc = k => encodeURIComponent(k).replace(/\./g, '%2E');
function pathsFor(store, key) {          // a blob key may be stored either as data (m/) or as a file (b/)
  if (store === 'blobs') return ['m/' + enc(key) + '.json', 'b/' + enc(key) + '.txt'];
  return [PFX[store] + enc(key) + '.json'];
}
function fromPath(p) {
  const pre = p.slice(0, 2), name = decodeURIComponent(p.slice(2).replace(/\.(json|txt)$/, ''));
  const store = { 'f/': 'folders', 'n/': 'notebooks', 'p/': 'pages', 'm/': 'blobs', 'b/': 'blobs' }[pre];
  return store ? { store, key: name, bin: pre === 'b/' } : null;
}
const te = new TextEncoder();
async function gitSha(str) {
  const body = te.encode(str), head = te.encode(`blob ${body.length}\0`), all = new Uint8Array(head.length + body.length);
  all.set(head); all.set(body, head.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1', all))].map(b => b.toString(16).padStart(2, '0')).join('');
}
const blobB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, '')); r.onerror = rej; r.readAsDataURL(b); });
async function b64Blob(type, b64) { return (await fetch(`data:${type || 'application/octet-stream'};base64,${b64}`)).blob(); }

// What this device has for one record: { path, sha, content() } or null
async function localEntry(store, key, state) {
  const v = await db.get(store, key); if (v == null) return null;
  if (store === 'blobs' && v instanceof Blob) {
    const path = 'b/' + enc(key) + '.txt', fp = `${v.size}|${v.type}`, c = state.bfp[key];
    const content = async () => (v.type || 'application/octet-stream') + '\n' + await blobB64(v);
    if (c && c.fp === fp) return { path, sha: c.sha, content, size: v.size };
    const s = await content(), sha = await gitSha(s); state.bfp[key] = { fp, sha };
    return { path, sha, content: async () => s, size: v.size };
  }
  const s = JSON.stringify(v), path = store === 'blobs' ? 'm/' + enc(key) + '.json' : PFX[store] + enc(key) + '.json';
  return { path, sha: await gitSha(s), content: async () => s, size: s.length };
}

// ---------- GitHub ----------
async function gha(path, opt = {}, raw = false) {
  const r = await fetch(`https://api.github.com/repos/${SY.repo}${path}`, { ...opt, cache: 'no-store',
    headers: { Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', Authorization: 'Bearer ' + SY.token, ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (!r.ok) {
    let msg = ''; try { msg = (await r.json()).message || ''; } catch { }
    const e = new Error(r.status === 401 ? 'the sync key is wrong or has expired' : r.status === 403 || r.status === 404 ? 'the key can’t open this repository (check it has Contents: Read and write)' : `GitHub said ${r.status}${msg ? ': ' + msg : ''}`);
    e.status = r.status; e.ghMsg = msg; throw e;
  }
  if (raw) return r.text();
  return r.status === 204 ? null : r.json();
}
async function remoteState() {
  let ref;
  try { ref = await gha('/git/ref/heads/' + SY.branch); }
  catch (e) { if (e.status === 409 || e.status === 404) return { head: null, tree: null, files: {} }; throw e; }
  const head = ref.object.sha, c = await gha('/git/commits/' + head);
  const t = await gha(`/git/trees/${c.tree.sha}?recursive=1`);
  if (t.truncated) throw new Error('the repository has too many files to read at once');
  const files = {}; for (const e of t.tree) if (e.type === 'blob' && fromPath(e.path)) files[e.path] = e.sha;
  return { head, tree: c.tree.sha, files };
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } })); }

// ---------- combining two versions of the same record ----------
// b = how it was at the last sync, l = this device, r = the other device.
// Lists of things with ids (tasks, exams…) are combined item by item, objects key by key;
// only when the very same field changed on both sides does this device's value win.
function merge3(b, l, r) {
  const S = JSON.stringify, isObj = x => x && typeof x === 'object' && !Array.isArray(x);
  if (S(l) === S(r)) return l;
  if (S(l) === S(b)) return r;
  if (S(r) === S(b)) return l;
  if (l === undefined) return r;                                   // deleted on one side, edited on the other: keep the edit
  if (r === undefined) return l;
  const idList = a => Array.isArray(a) && a.every(x => isObj(x) && x.id != null);
  if (idList(l) && idList(r)) {
    const bm = new Map((idList(b) ? b : []).map(x => [x.id, x])), lm = new Map(l.map(x => [x.id, x])), rm = new Map(r.map(x => [x.id, x]));
    const out = [];
    for (const id of new Set([...l.map(x => x.id), ...r.map(x => x.id)])) {
      const bv = bm.get(id), lv = lm.get(id), rv = rm.get(id);
      if (bv && (!lv || !rv)) { const kept = lv || rv; if (S(kept) === S(bv)) continue; }   // deleted on one side and untouched on the other: stays deleted
      const v = merge3(bv, lv, rv); if (v !== undefined) out.push(v);
    }
    return out;
  }
  if (isObj(l) && isObj(r)) {
    const o = {}, bo = isObj(b) ? b : {};
    for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) { const v = merge3(bo[k], l[k], r[k]); if (v !== undefined) o[k] = v; }
    return o;
  }
  return l;
}

// ---------- the sync ----------
let syncing = false, syncAgain = false, syncT = null;
function syncSoon(ms = 8000) { if (!SY?.on) return; clearTimeout(syncT); syncT = setTimeout(() => syncNow(), ms); }
async function loadState() { return (await db.get('blobs', SY_STATE)) || { head: null, base: {}, bfp: {} }; }
const saveState = st => rawPut('blobs', st, SY_STATE);

async function syncNow({ full = false, progress = null } = {}) {
  if (!SY?.on) return false;
  if (syncing) { syncAgain = true; return false; }
  if (!navigator.onLine) { setSyncStatus('offline'); return false; }
  syncing = true; setSyncStatus('syncing');
  const say = (msg, f) => progress?.(msg, f);
  let changedLocal = new Set(), conflicts = 0;
  try {
    if (E.nb) { await flush(); await saveNb(); }
    const st = await loadState(), dirtyNow = [...syDirty];
    say('Checking GitHub…', 0.02);
    const R = await remoteState();
    // this device
    const local = {};
    const first = !st.head && !Object.keys(st.base).length;
    if (full || first) {
      say('Looking at your notes…', 0.05);
      const recs = [];
      for (const s of ['folders', 'notebooks', 'pages']) for (const k of await db.keys(s)) recs.push([s, k]);
      for (const k of await db.keys('blobs')) if (!skipKey('blobs', k)) recs.push(['blobs', k]);
      await pool(recs, 4, async ([s, k]) => { const e = await localEntry(s, k, st); if (e) local[e.path] = e; });
    } else {
      for (const [p, sha] of Object.entries(st.base)) local[p] = { path: p, sha };
      for (const d of dirtyNow) {
        const i = d.indexOf('|'), s = d.slice(0, i), k = d.slice(i + 1);
        for (const p of pathsFor(s, k)) delete local[p];
        const e = await localEntry(s, k, st); if (e) local[e.path] = e;
      }
    }
    // decide what moves
    const up = [], down = [], delRemote = [], delLocal = [], merge = [];
    for (const p of new Set([...Object.keys(local), ...Object.keys(R.files), ...Object.keys(st.base)])) {
      const L = local[p]?.sha, Rm = R.files[p], B = st.base[p];
      if (L === Rm) { if (L) st.base[p] = L; else delete st.base[p]; continue; }
      if (L !== B && Rm === B) (L ? up : delRemote).push(p);
      else if (Rm !== B && L === B) (Rm ? down : delLocal).push(p);
      else if (L && Rm) { if (p.endsWith('.json')) merge.push(p); else { up.push(p); if (B) conflicts++; } }   // both changed: combine them (files: this device wins)
      else if (L) up.push(p); else down.push(p);                     // one side deleted, the other edited: keep the edit
    }
    // 0. both devices changed the same record (e.g. the planner): combine the two instead of dropping one
    for (const p of merge) {
      const f = fromPath(p), get = sha => gha('/git/blobs/' + sha, {}, true).then(JSON.parse);
      const [bv, rv] = await Promise.all([st.base[p] ? get(st.base[p]).catch(() => undefined) : undefined, get(R.files[p])]);
      const mv = merge3(bv, JSON.parse(await local[p].content()), rv), s = JSON.stringify(mv);
      await (f.store === 'blobs' ? rawPut('blobs', mv, f.key) : rawPut(f.store, mv));
      local[p] = { path: p, sha: await gitSha(s), content: async () => s };
      changedLocal.add(f.store + '|' + f.key);
      if (local[p].sha === R.files[p]) st.base[p] = R.files[p]; else up.push(p);
    }
    // 1. bring GitHub's changes here
    let done = 0; const totalDown = down.length + delLocal.length;
    await pool(down, 6, async p => {
      const t = await gha('/git/blobs/' + R.files[p], {}, true), f = fromPath(p);
      if (f.bin) { const nl = t.indexOf('\n'), b = await b64Blob(t.slice(0, nl), t.slice(nl + 1)); await rawPut('blobs', b, f.key); st.bfp[f.key] = { fp: `${b.size}|${b.type}`, sha: R.files[p] }; }
      else { const v = JSON.parse(t); await (f.store === 'blobs' ? rawPut('blobs', v, f.key) : rawPut(f.store, v)); }
      st.base[p] = R.files[p]; changedLocal.add(f.store + '|' + f.key);
      say(`Downloading ${++done} of ${totalDown}…`, 0.1 + 0.4 * done / Math.max(1, totalDown));
    });
    for (const p of delLocal) {
      const f = fromPath(p);
      // only remove it here if it isn't still stored under the other kind of path for the same key
      if (!(f.store === 'blobs' && pathsFor('blobs', f.key).some(q => q !== p && (local[q] || R.files[q])))) await rawDel(f.store, f.key);
      delete st.base[p]; changedLocal.add(f.store + '|' + f.key);
    }
    if (down.length || delLocal.length) await saveState(st);
    // 2. send this device's changes (several small commits, so a big first upload can resume)
    if (up.length || delRemote.length) {
      let head = R.head, tree = R.tree;
      if (!head) { // an empty repository needs a first commit before the Git API works
        await gha('/contents/README.md', { method: 'PUT', body: JSON.stringify({ message: 'Inkbook sync', content: btoa('Private notes synced by the Inkbook app. Please don\'t edit these files by hand.\n'), branch: SY.branch }) });
        const r2 = await remoteState(); head = r2.head; tree = r2.tree;
      }
      const jobs = [...up.map(p => ({ p })), ...delRemote.map(p => ({ p, del: true }))];
      let i = 0, sent = 0;
      while (i < jobs.length) {
        const entries = [], paths = []; let bytes = 0;
        while (i < jobs.length && (bytes < 3e6 || !entries.length) && entries.length < 400) {
          const j = jobs[i++];
          if (j.del) { entries.push({ path: j.p, mode: '100644', type: 'blob', sha: null }); paths.push([j.p, null]); continue; }
          const e = local[j.p], c = await e.content();
          if (c.length > 2.5e6) { const b = await gha('/git/blobs', { method: 'POST', body: JSON.stringify({ content: c, encoding: 'utf-8' }) }); entries.push({ path: j.p, mode: '100644', type: 'blob', sha: b.sha }); }
          else entries.push({ path: j.p, mode: '100644', type: 'blob', content: c });
          paths.push([j.p, e.sha]); bytes += c.length;
        }
        const t = await gha('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: tree, tree: entries }) });
        const cm = await gha('/git/commits', { method: 'POST', body: JSON.stringify({ message: `Inkbook: ${SY.device || 'device'} (${entries.length} change${entries.length > 1 ? 's' : ''})`, tree: t.sha, parents: [head] }) });
        try { await gha('/git/refs/heads/' + SY.branch, { method: 'PATCH', body: JSON.stringify({ sha: cm.sha, force: false }) }); }
        catch (e) { if (e.status === 422) { syncAgain = true; break; } throw e; }   // another device synced meanwhile: go round again
        head = cm.sha; tree = t.sha;
        for (const [p, sha] of paths) { if (sha) st.base[p] = sha; else delete st.base[p]; }
        st.head = head; await saveState(st);
        sent += entries.length; say(`Uploading ${sent} of ${jobs.length}…`, 0.5 + 0.5 * sent / jobs.length);
      }
      if (!syncAgain) st.head = head;
    } else st.head = R.head;
    await saveState(st);
    if (!syncAgain) for (const d of dirtyNow) syDirty.delete(d);   // refused by GitHub (another device synced first)? keep them for the retry
    syDirtySave(); try { localStorage.setItem(SY_DIRTY, JSON.stringify([...syDirty])); } catch { }
    Object.assign(SY, { last: Date.now(), err: '', conflicts: (SY.conflicts || 0) + conflicts }); sySave();
    say('Done', 1);
    return { down: down.length + delLocal.length, up: up.length + delRemote.length, conflicts };
  } catch (e) {
    console.warn('sync', e); SY.err = e.message; sySave();
    if (e.status === 401 || e.status === 403 || e.status === 404) toast('☁️ Sync stopped: ' + e.message + '. Tap the cloud to fix it.', 6000);
    throw e;
  } finally {
    syncing = false; setSyncStatus();
    if (changedLocal.size) await afterRemoteChanges(changedLocal).catch(console.warn);
    if (syncAgain) { syncAgain = false; setTimeout(() => syncNow().catch(() => { }), 1500); }
  }
}
// Show what arrived from the other device
async function afterRemoteChanges(changed) {
  FOLDERS = await db.all('folders');
  if (changed.has('blobs|meta:planner')) { await loadPlan(); remBadges?.(); globalThis.calSyncSoon?.(1500); REM?.redraw?.(); }
  if (E.nb) {
    const nbId = E.nb.id, touched = changed.has('notebooks|' + nbId) || [...changed].some(c => c.startsWith('pages|') && E.byId.has(c.slice(6)));
    if (touched && !active) {
      const stillThere = await db.get('notebooks', nbId);
      if (!stillThere) { io?.disconnect(); pagesEl.innerHTML = ''; E.els.clear(); E.visible.clear(); E.nb = null; showLibrary(); toast('This notebook was deleted on another device'); return; }
      const pageId = E.pages[currentIndex()]?.id, top = scroller.scrollTop, left = scroller.scrollLeft, z = E.zoom;
      await openNotebook(nbId, { pageId });
      if (z !== 1) { E.zoom = z; layout(); updateZoomLabel(); }
      scroller.scrollTop = top; scroller.scrollLeft = left;
      toast('☁️ Updated from your other device', 1800);
    }
  } else if (!$('#library').hidden) showLibrary();
}

// ---------- status ----------
function setSyncStatus(s) {
  setTimeout(() => globalThis.refreshStatusChips?.(), 0);
  const st = s || (!SY?.on ? 'off' : SY.err ? 'error' : navigator.onLine ? 'ok' : 'offline');
  for (const b of $$('.sync-btn')) {
    b.dataset.state = st;
    b.innerHTML = icon(st === 'ok' ? 'cloudok' : st === 'syncing' ? 'sync' : 'cloud') + (st === 'error' ? '<i class="sync-bang">!</i>' : '');
    b.title = { off: 'Sync is off: tap to set up', ok: 'Synced ' + agoText(SY?.last), syncing: 'Syncing…', error: 'Sync problem: tap for details', offline: 'Offline: will sync when you’re back online' }[st];
  }
  const side = $('#syncSide small'); if (side) side.textContent = st === 'off' ? 'Off' : st === 'syncing' ? 'Syncing…' : st === 'error' ? 'Problem' : st === 'offline' ? 'Offline' : agoText(SY?.last);
}

// ---------- screens ----------
function defaultDevice() { const ua = navigator.userAgent; return /iPhone/.test(ua) ? 'iPhone' : /iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1 ? 'iPad' : /Android/.test(ua) ? 'Android' : 'Computer'; }
async function syncMenu() {
  if (!SY?.on) return syncSetup();
  const v = await menu('Sync between devices', [
    { head: SY.err ? '⚠️ ' + SY.err : `On · last synced ${agoText(SY.last)} · ${SY.repo}` },
    { label: 'Sync now', value: 'now', icon: 'sync' },
    { label: 'Set up another device', value: 'code', icon: 'link', hint: 'Copies a code to paste into Inkbook on your iPhone' },
    ...(SY.err ? [{ label: 'Paste a new key', value: 'key', icon: 'edit' }] : []),
    { label: 'Check everything again', value: 'full', icon: 'search', hint: 'Compares every page, if something seems missing' },
    { label: 'Turn off sync on this device', value: 'off', icon: 'x', danger: true, hint: 'Your notes stay on this device and on GitHub' }]);
  if (v === 'now' || v === 'full') await runSyncWithProgress(v === 'full');
  if (v === 'code') return copySetupCode();
  if (v === 'key') return syncSetup(true);
  if (v === 'off' && await confirmBox('Stop syncing on this device? Nothing is deleted: your notes stay here and in your GitHub repository.', 'Turn off')) {
    SY = null; sySave(); await rawDel('blobs', SY_STATE); syDirty.clear(); localStorage.removeItem(SY_DIRTY); setSyncStatus(); toast('Sync is off on this device');
  }
}
async function runSyncWithProgress(full = false) {
  showProgress('Syncing…');
  try {
    const r = await syncNow({ full, progress: (m, f) => setProgress(m, f) });
    closeProgress();
    if (r) toast(r.up || r.down ? `☁️ Synced · ${r.up} sent, ${r.down} received${r.conflicts ? ` · ${r.conflicts} edited on both devices (kept this one)` : ''}` : '☁️ Everything is up to date', 3500);
  } catch (e) { closeProgress(); toast('⚠️ Sync failed: ' + e.message, 6000); }
}
async function copySetupCode() {
  const code = `inkbook-sync:${SY.repo}:${SY.token}`;
  openModal(`<h2>Set up another device</h2>
    <ol class="cs-list"><li>Tap <b>Copy setup code</b> below.</li><li>On your iPhone, open Inkbook → tap the <b>cloud</b> (top right) → <b>Paste setup code</b>.</li><li>If both devices use the same Apple ID, it pastes straight across (Universal Clipboard). Otherwise send it to yourself in Notes and copy it there.</li></ol>
    <p class="hint">⚠️ The code contains your sync key. Don't send it to anyone else, and delete the note afterwards if you used one.</p>
    <div class="modal-actions"><button class="btn" data-close>Close</button><button class="btn primary" data-copy>Copy setup code</button></div>`, 'small');
  $('.modal-back:last-child [data-copy]').onclick = async e => { try { await navigator.clipboard.writeText(code); e.target.textContent = 'Copied ✓'; } catch { promptText('Setup code', code); } };
}
function syncSetup(keyOnly = false) {
  return new Promise(res => {
    const tokUrl = 'https://github.com/settings/personal-access-tokens/new?name=Inkbook%20sync&description=Lets%20Inkbook%20sync%20my%20notes&expires_in=none&contents=write';
    const m = openModal(`<h2>${keyOnly ? 'New sync key' : 'Sync between your devices'}</h2>
      ${keyOnly ? '' : `<p class="msg">Your notes, planner and recordings are kept in a <b>private</b> GitHub repository that only you can see. Every device signed in to it stays up to date. It's free.</p>
      <div class="seg sy-mode"><button class="chip on" data-mode="new">First device</button><button class="chip" data-mode="code">I have a setup code</button></div>`}
      <div data-new>
        ${keyOnly ? '' : `<h3 class="cs-step">1 · Make the private repository</h3>
        <ol class="cs-list"><li>Tap <b>Create repository</b> and sign in to GitHub.</li><li>Keep the name <b>inkbook-data</b>, make sure <b>Private</b> is selected, then tap <b>Create repository</b>.</li></ol>
        <a class="btn" href="https://github.com/new?name=inkbook-data&visibility=private&description=My%20Inkbook%20notes%20(private)" target="_blank" rel="noopener">${icon('go')}Create repository</a>`}
        <h3 class="cs-step">${keyOnly ? '' : '2 · '}Make a key for that repository only</h3>
        <ol class="cs-list"><li>Tap <b>Create key</b>. Set <b>Expiration</b> to <b>No expiration</b>.</li>
          <li>Under <b>Repository access</b> choose <b>Only select repositories</b> → <b>inkbook-data</b>.</li>
          <li>Under <b>Permissions → Repository permissions</b>, set <b>Contents</b> to <b>Read and write</b>.</li>
          <li>Tap <b>Generate token</b>, copy it (starts with <b>github_pat_</b>) and paste it below.</li></ol>
        <a class="btn" href="${tokUrl}" target="_blank" rel="noopener">${icon('go')}Create key</a>
        <div class="field" style="margin-top:12px"><label class="lbl">Key</label><input type="password" data-tok placeholder="github_pat_…" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        ${keyOnly ? '' : `<div class="field"><label class="lbl">Repository name</label><input type="text" data-repo value="inkbook-data" autocapitalize="off" spellcheck="false"></div>`}
      </div>
      <div data-code hidden><p class="hint">On the device that's already syncing: cloud → <b>Set up another device</b> → <b>Copy setup code</b>. Then paste it here.</p>
        <div class="field"><input type="password" data-scode placeholder="inkbook-sync:…" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
        <button class="btn" data-pastecode>${icon('copy')}Paste</button></div>
      <p class="hint">The key can only reach that one repository. It stays on this device and isn't included in backups.</p>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-ok>Connect</button></div>`, 'small');
    let mode = 'new', ok = false;
    m.el.addEventListener('click', async e => {
      const b = e.target.closest('[data-mode]');
      if (b) { mode = b.dataset.mode; $$('[data-mode]', m.el).forEach(x => x.classList.toggle('on', x === b)); $('[data-new]', m.el).hidden = mode !== 'new'; $('[data-code]', m.el).hidden = mode !== 'code'; }
      if (e.target.closest('[data-pastecode]')) { try { $('[data-scode]', m.el).value = (await navigator.clipboard.readText()).trim(); } catch { toast('Long-press the box and tap Paste'); } }
    });
    $$('input', m.el).forEach(i => i.addEventListener('keydown', e => e.stopPropagation()));
    $('[data-ok]', m.el).onclick = guard(async () => {
      let token, repo;
      if (mode === 'code') {
        const c = $('[data-scode]', m.el).value.trim(), mt = c.match(/^inkbook-sync:([\w.-]+\/[\w.-]+):(\S+)$/);
        if (!mt) return toast('That doesn’t look like a setup code');
        repo = mt[1]; token = mt[2];
      } else {
        token = $('[data-tok]', m.el).value.trim(); if (!token) return toast('Paste the key first');
        repo = keyOnly ? SY.repo : ($('[data-repo]', m.el).value.trim() || 'inkbook-data');
      }
      const btn = $('[data-ok]', m.el); btn.disabled = true; btn.textContent = 'Connecting…';
      try {
        const H = { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token };
        if (!repo.includes('/')) { const u = await fetch('https://api.github.com/user', { headers: H, cache: 'no-store' }); if (!u.ok) throw new Error(u.status === 401 ? 'the key is wrong or has expired' : 'GitHub said ' + u.status); repo = (await u.json()).login + '/' + repo; }
        const r = await fetch('https://api.github.com/repos/' + repo, { headers: H, cache: 'no-store' });
        if (r.status === 404) throw new Error(`can’t find “${repo}”. Check the name, and that the key was given access to it`);
        if (!r.ok) throw new Error(r.status === 401 ? 'the key is wrong or has expired' : 'GitHub said ' + r.status);
        const info = await r.json();
        if (!info.private) throw new Error('that repository is public. Make it private first (repository Settings → Danger Zone → Change visibility)');
        if (info.permissions && !info.permissions.push) throw new Error('the key can only read. Give it Contents: Read and write');
        SY = { on: true, repo, token, branch: info.default_branch || 'main', device: SY?.device || defaultDevice(), last: SY?.last || 0, err: '' }; sySave();
        ok = true; m.close();
      } catch (e) { btn.disabled = false; btn.textContent = 'Connect'; toast('⚠️ Couldn’t connect: ' + e.message, 7000); }
    });
    m.onClose = async () => {
      res(ok); if (!ok) return;
      setSyncStatus();
      await runSyncWithProgress(true);
      if (!keyOnly && !SY.err) openModal(`<h2>Sync is on ☁️</h2><p class="msg">This ${esc(SY.device)} now syncs by itself: when you open Inkbook, a few seconds after you change something, and when you switch away.</p>
        <p class="hint">To add your iPhone: tap the cloud → <b>Set up another device</b>.</p><div class="modal-actions"><button class="btn primary" data-close>Done</button></div>`, 'small');
    };
  });
}

// ---------- boot ----------
function bootSync() {
  const mk = () => { const b = document.createElement('button'); b.className = 'icon-btn sync-btn'; b.onclick = () => guard(syncMenu)(); return b; };
  $('#remLibBtn')?.before(mk());
  const side = document.createElement('button'); side.id = 'syncSide'; side.innerHTML = `<span data-icon="cloud">${icon('cloud')}</span>Sync<small></small>`; side.onclick = () => guard(syncMenu)();
  $('#settingsBtn')?.before(side);
  setSyncStatus(); setInterval(() => setSyncStatus(syncing ? 'syncing' : undefined), 60000);
  // while Inkbook is open, check for changes from your other device every minute
  setInterval(() => { if (SY?.on && !document.hidden && !syncing && navigator.onLine) syncNow().catch(() => { }); }, 60000);
  addEventListener('online', () => { setSyncStatus(); syncSoon(1000); });
  addEventListener('offline', () => setSyncStatus());
  document.addEventListener('visibilitychange', () => { if (!SY?.on) return; if (document.hidden) { if (syDirty.size) syncNow().catch(() => { }); } else syncSoon(800); });
  if (SY?.on) setTimeout(() => syncNow().catch(() => { }), 1500);
  // leaving a notebook is a good moment to send it
  const _leave = leaveNotebook;
  leaveNotebook = async function (...a) { const r = await _leave(...a); if (SY?.on && syDirty.size) syncSoon(1500); return r; };
}
