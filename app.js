/* DJSinatra — instrumental MP3 player.
 * Static site: works on GitHub Pages, any phone, tablet, PC or TV browser. */
'use strict';

/* Optional: set to "owner/repo" if the site is NOT hosted at owner.github.io/repo
 * (e.g. on a custom domain), so the "Publish to GitHub" button knows where to go. */
const GITHUB_REPO = '';

const $ = (s, el = document) => el.querySelector(s);
const els = {
  list: $('#list'), tpl: $('#rowTpl'), search: $('#search'), status: $('#status'), empty: $('#empty'),
  player: $('#player'), audio: $('#audio'), nowTitle: $('#nowTitle'), libTitle: $('#libTitle'),
  fileInput: $('#fileInput'), drop: $('#dropZone'), publish: $('#publishLink'),
  install: $('#installBtn'), cats: $('#cats'), playPause: $('#playPauseBtn'),
  catDialog: $('#catDialog'), catName: $('#catName'), tagDialog: $('#tagDialog'), tagList: $('#tagList'),
  tagNew: $('#tagNew'),
};

/* ---------- device detection ---------- */
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/* ---------- state ---------- */
let tracks = [];      // {id, file, title, size, url, local, blob?}
let view = [];        // filtered tracks currently shown
let current = -1;     // index into view of the built-in player track
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

/* ---------- categories (saved on this device) ----------
 * { names: ["Christmas", ...], songs: { "<file name, lower-case>": ["Christmas", ...] } } */
const cats = (() => {
  let d = null;
  try { d = JSON.parse(store.get('djs.cats', 'null')); } catch {}
  if (!d || !Array.isArray(d.names) || typeof d.songs !== 'object' || !d.songs) d = { names: [], songs: {} };
  return d;
})();
let activeCat = cats.names.includes(store.get('djs.cat', '')) ? store.get('djs.cat', '') : '';
const saveCats = () => store.set('djs.cats', JSON.stringify(cats));
const catKey = t => t.file.toLowerCase();
const catsOf = t => (cats.songs[catKey(t)] || []).filter(c => cats.names.includes(c));
const findCat = name => cats.names.find(n => n.toLowerCase() === name.toLowerCase());
function addCat(name) {
  name = name.trim().replace(/\s+/g, ' ');
  if (!name) return null;
  const existing = findCat(name);
  if (existing) return existing;
  cats.names.push(name);
  cats.names.sort((a, b) => a.localeCompare(b));
  saveCats();
  return name;
}
function setSongCat(t, name, on) {
  const k = catKey(t);
  const list = new Set(cats.songs[k] || []);
  on ? list.add(name) : list.delete(name);
  if (list.size) cats.songs[k] = [...list]; else delete cats.songs[k];
  saveCats();
}
function renameCat(from, to) {
  cats.names = cats.names.map(n => (n === from ? to : n)).sort((a, b) => a.localeCompare(b));
  for (const k in cats.songs) cats.songs[k] = cats.songs[k].map(n => (n === from ? to : n));
  if (activeCat === from) setActiveCat(to, false);
  saveCats();
}
function deleteCat(name) {
  cats.names = cats.names.filter(n => n !== name);
  for (const k in cats.songs) {
    cats.songs[k] = cats.songs[k].filter(n => n !== name);
    if (!cats.songs[k].length) delete cats.songs[k];
  }
  if (activeCat === name) setActiveCat('', false);
  saveCats();
}
function setActiveCat(name, doRender = true) {
  activeCat = name;
  store.set('djs.cat', name);
  if (doRender) render();
}

/* ---------- helpers ---------- */
function prettify(file) {
  return file
    .replace(/\.mp3$/i, '')
    .replace(/^poppop\.ai\s*-\s*/i, '')
    .replace(/^\d+_/, '')
    .replace(/_/g, ' ')
    .replace(/\b(64|96|128|160|192|256|320)k\b/gi, '')
    .replace(/\b(144|240|360|480|720|1080)p\b/gi, '')
    .replace(/inst-gabox-fv\d+/gi, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s*\(\d\)\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
const fmtSize = b => b ? (b / 1048576).toFixed(1) + ' MB' : '';
const fmtDate = ms => ms ? 'Added ' + new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const newestFirst = (a, b) => (b.added || 0) - (a.added || 0) || a.title.localeCompare(b.title);
/* Where the MP3s live. On GitHub Pages they stream straight from the repo (Pages sites are
 * capped at 1 GB, so songs aren't copied into the site); locally they're served from tracks/. */
function mediaBase() {
  const repo = githubRepo();
  return repo ? `https://raw.githubusercontent.com/${repo}/main/tracks/` : new URL('tracks/', location.href).href;
}
const absUrl = file => mediaBase() + encodeURIComponent(file);
let statusTimer;
function say(msg, ms = 6000) {
  els.status.textContent = msg;
  clearTimeout(statusTimer);
  if (ms) statusTimer = setTimeout(() => (els.status.textContent = ''), ms);
}
/* ---------- player ---------- */
function playTrack(i) {
  const t = view[i];
  if (!t) return;
  current = i;
  if (els.audio.dataset.url && els.audio.dataset.url.startsWith('blob:')) URL.revokeObjectURL(els.audio.dataset.url);
  const src = t.local ? URL.createObjectURL(t.blob) : t.url;
  els.audio.dataset.url = src;
  els.audio.src = src;
  els.audio.play().catch(() => {});
  els.nowTitle.textContent = t.title;
  els.player.hidden = false;
  markPlaying();
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title, artist: 'DJSinatra', album: 'Instrumentals',
      artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
  }
}
/* Stop playback completely and hide the player bar. */
function stopPlayer() {
  if (els.player.hidden) return false;
  const focusWasInPlayer = els.player.contains(document.activeElement);
  els.audio.pause();
  if (els.audio.dataset.url && els.audio.dataset.url.startsWith('blob:')) URL.revokeObjectURL(els.audio.dataset.url);
  els.audio.removeAttribute('src');
  delete els.audio.dataset.url;
  els.audio.load();
  els.player.hidden = true;
  const playingRow = els.list.querySelector('.row.playing');
  current = -1;
  markPlaying();
  if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
  if (focusWasInPlayer) ($('.play', playingRow || els.list) || els.search).focus();
  say('Player stopped.', 3000);
  return true;
}
/* Android TV app: the remote's Back button calls this first. true = handled (player closed). */
window.djsBack = () => {
  if (document.querySelector('dialog[open]')) { document.querySelector('dialog[open]').close(); return true; }
  return stopPlayer();
};
function togglePlay() {
  if (els.player.hidden) return;
  els.audio.paused ? els.audio.play().catch(() => {}) : els.audio.pause();
}
/* Called by the Android TV app for the remote's media keys. */
window.djsMedia = key => {
  if (key === 'stop') stopPlayer();
  else if (key === 'toggle') togglePlay();
  else if (key === 'next' && !els.player.hidden) $('#nextBtn').click();
  else if (key === 'prev' && !els.player.hidden) $('#prevBtn').click();
};
function markPlaying() {
  const id = view[current]?.id;
  els.list.querySelectorAll('.row').forEach(r => r.classList.toggle('playing', r.dataset.id === id));
}
function playAll() {
  if (!view.length) return say('No songs to play yet.');
  playTrack(0);
  els.playPause.focus();
}
els.audio.addEventListener('ended', () => playTrack(current + 1 < view.length ? current + 1 : 0));
els.audio.addEventListener('play', () => { els.player.classList.add('on'); els.playPause.textContent = '⏸'; els.playPause.setAttribute('aria-label', 'Pause'); });
els.audio.addEventListener('pause', () => { els.player.classList.remove('on'); els.playPause.textContent = '▶'; els.playPause.setAttribute('aria-label', 'Play'); });
$('#nextBtn').onclick = () => playTrack((current + 1) % view.length);
$('#prevBtn').onclick = () => playTrack((current - 1 + view.length) % view.length);
els.playPause.onclick = togglePlay;
$('#stopBtn').onclick = stopPlayer;
const fmtTime = s => !isFinite(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
els.audio.addEventListener('timeupdate', () => {
  const { currentTime: t, duration: d } = els.audio;
  $('#timeNow').textContent = fmtTime(t);
  $('#timeTotal').textContent = fmtTime(d);
  $('#seekFill').style.width = d ? (t / d * 100) + '%' : '0';
});
$('#seek').addEventListener('click', e => {
  const r = e.currentTarget.getBoundingClientRect();
  if (els.audio.duration) els.audio.currentTime = (e.clientX - r.left) / r.width * els.audio.duration;
});
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('nexttrack', () => $('#nextBtn').click());
  navigator.mediaSession.setActionHandler('previoustrack', () => $('#prevBtn').click());
  try { navigator.mediaSession.setActionHandler('stop', stopPlayer); } catch {}
}

/* ---------- rendering ---------- */
function render() {
  const q = els.search.value.trim().toLowerCase();
  const playingId = view[current]?.id;
  renderCats();
  view = tracks.filter(t =>
    (!q || t.title.toLowerCase().includes(q) || t.file.toLowerCase().includes(q)) &&
    (!activeCat || catsOf(t).includes(activeCat)));
  current = view.findIndex(t => t.id === playingId);
  els.list.textContent = '';
  const frag = document.createDocumentFragment();
  let dividerDone = false;
  view.forEach((t, i) => {
    if (t.local && !dividerDone) {
      dividerDone = true;
      const d = document.createElement('li');
      d.className = 'divider';
      d.innerHTML = '<b>📱 Only on this device</b><span>Uploaded with “Upload MP3s” in this browser — your TV and other devices can’t see these. ' +
        (els.publish.href ? 'Use ☁ Publish to GitHub (or add them to your songs folder on the PC) to share them everywhere.' : '') + '</span>';
      frag.appendChild(d);
    }
    const li = els.tpl.content.firstElementChild.cloneNode(true);
    li.dataset.id = t.id;
    $('.num', li).textContent = i + 1;
    $('.title', li).textContent = t.title;
    $('.title', li).title = t.file;
    const tc = catsOf(t);
    $('.meta', li).textContent = [t.local ? '📱 Only on this device' : 'MP3', fmtSize(t.size), fmtDate(t.added),
      tc.length ? '🏷 ' + tc.join(', ') : ''].filter(Boolean).join(' · ');
    if (t.local) li.classList.add('local');
    $('.tagBtn', li).onclick = () => openTagDialog(t);
    $('.play', li).onclick = () => playTrack(i);
    $('.builtin', li).onclick = () => playTrack(i);
    const dl = $('.dl', li);
    if (t.local) {
      dl.onclick = e => { e.preventDefault(); const u = URL.createObjectURL(t.blob); dl.href = u; saveBlob(u, t.file); };
      const del = $('.del', li); del.hidden = false; del.onclick = () => removeLocal(t);
    } else { dl.href = t.url; dl.download = t.file; }
    frag.appendChild(li);
  });
  els.list.appendChild(frag);
  els.empty.hidden = view.length > 0;
  els.empty.textContent = activeCat && tracks.length
    ? `No songs in “${activeCat}” yet. Tap 🏷 on any song to add it to this category.`
    : 'No instrumentals yet. Upload some MP3s to get started.';
  const nPub = view.filter(t => !t.local).length, nLoc = view.length - nPub;
  els.libTitle.textContent = `${activeCat || 'Library'} · ${nPub} song${nPub === 1 ? '' : 's'}` +
    (nLoc ? ` · +${nLoc} only on this device` : '') + ' · newest first';
  markPlaying();
}

/* ---------- category bar + dialogs ---------- */
function renderCats() {
  const counts = new Map(cats.names.map(n => [n, 0]));
  tracks.forEach(t => catsOf(t).forEach(c => counts.set(c, counts.get(c) + 1)));
  const focusedCat = document.activeElement?.closest?.('#cats') ? document.activeElement.dataset.cat : undefined;
  els.cats.textContent = '';
  const button = (label, cls, onclick, extra = {}) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip ' + cls; b.textContent = label; b.onclick = onclick;
    Object.assign(b.dataset, extra);
    return b;
  };
  const chip = (label, value, n) => {
    const b = button(label, '', () => setActiveCat(value), { cat: value });
    const s = document.createElement('span'); s.className = 'count'; s.textContent = n;
    b.append(s);
    b.setAttribute('aria-pressed', String(activeCat === value));
    return b;
  };
  els.cats.append(chip('All songs', '', tracks.length));
  cats.names.forEach(n => els.cats.append(chip(n, n, counts.get(n))));
  els.cats.append(button('+ New category', 'add', () => openCatDialog(), { cat: '+new' }));
  if (activeCat) {
    els.cats.append(button('✎ Rename', 'ghost', () => openCatDialog(activeCat), { cat: '+rename' }));
    els.cats.append(button('🗑 Delete', 'ghost', () => {
      if (confirm(`Delete the category “${activeCat}”? The songs stay in your library.`)) { deleteCat(activeCat); render(); }
    }, { cat: '+delete' }));
  }
  if (focusedCat !== undefined) {
    const again = [...els.cats.children].find(b => b.dataset.cat === focusedCat);
    (again || els.cats.querySelector('[aria-pressed="true"]'))?.focus();
  }
}

let catDialogRename = null;
function openCatDialog(renaming = null) {
  catDialogRename = renaming;
  $('#catDialogTitle').textContent = renaming ? `Rename “${renaming}”` : 'New category';
  els.catName.value = renaming || '';
  els.catDialog.showModal();
  els.catName.select();
}
// Enter / the on-screen keyboard's "Done" saves (otherwise the form's first button, Cancel, would win).
els.catName.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  if (els.catName.value.trim()) els.catDialog.close('ok');
});
els.catDialog.addEventListener('close', () => {
  if (els.catDialog.returnValue !== 'ok') return;
  const name = els.catName.value.trim().replace(/\s+/g, ' ');
  if (!name) return;
  if (catDialogRename) {
    const clash = findCat(name);
    if (clash && clash !== catDialogRename) return say(`There is already a category called “${clash}”.`);
    renameCat(catDialogRename, name);
    render();
    say(`Renamed to “${name}”.`);
  } else {
    const existed = findCat(name);
    const created = addCat(name);
    setActiveCat(created);
    say(existed ? `“${created}” already exists — showing it.` : `Category “${created}” created. Tap 🏷 on a song to add it.`, 9000);
  }
});

let tagTrack = null;
function renderTagList() {
  const mine = catsOf(tagTrack);
  els.tagList.textContent = '';
  if (!cats.names.length) {
    const p = document.createElement('p'); p.className = 'hint'; p.textContent = 'No categories yet — type a name below to create one.';
    els.tagList.append(p);
  }
  // Toggle buttons (not checkboxes): a TV remote's OK button sends Enter, which can't tick a checkbox.
  cats.names.forEach(n => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tag-opt'; b.dataset.cat = n;
    const tick = document.createElement('span'); tick.className = 'tick'; tick.setAttribute('aria-hidden', 'true');
    b.append(tick, n);
    const show = on => { b.setAttribute('aria-pressed', String(on)); tick.textContent = on ? '✓' : ''; };
    show(mine.includes(n));
    b.onclick = () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      setSongCat(tagTrack, n, on);
      show(on);
    };
    els.tagList.append(b);
  });
}
function openTagDialog(t) {
  tagTrack = t;
  $('#tagSong').textContent = t.title;
  els.tagNew.value = '';
  renderTagList();
  els.tagDialog.showModal();
  (els.tagList.querySelector('button') || els.tagNew).focus();
}
function addTagFromInput() {
  const name = addCat(els.tagNew.value);
  if (!name) return els.tagNew.focus();
  setSongCat(tagTrack, name, true);
  els.tagNew.value = '';
  renderTagList();
  els.tagNew.focus();
}
$('#tagAdd').onclick = addTagFromInput;
els.tagNew.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTagFromInput(); } });
els.tagDialog.addEventListener('close', () => { tagTrack = null; render(); });
function saveBlob(u, name) {
  const a = document.createElement('a'); a.href = u; a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
}
els.search.addEventListener('input', render);
$('#playAllBtn').onclick = playAll;

/* ---------- loading the published library ---------- */
function githubRepo() {
  if (GITHUB_REPO) return GITHUB_REPO;
  const h = location.hostname;
  if (!h.endsWith('.github.io')) return null;
  const owner = h.split('.')[0];
  const first = location.pathname.split('/').filter(Boolean)[0];
  return `${owner}/${first && !first.includes('.') ? first : h}`;
}
async function loadPublished() {
  let items = [];
  try {
    const r = await fetch('tracks.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    items = await r.json();
  } catch {
    const repo = githubRepo(); // fallback: ask GitHub directly what is in /tracks
    if (repo) {
      try {
        const r = await fetch(`https://api.github.com/repos/${repo}/contents/tracks`);
        if (r.ok) items = (await r.json()).map(f => ({ file: f.name, size: f.size }));
      } catch {}
    }
  }
  return items
    .filter(x => /\.mp3$/i.test(x.file))
    .map(x => ({ id: 'p:' + x.file, file: x.file, title: prettify(x.file), size: x.size, url: absUrl(x.file),
                 added: x.added ? x.added * 1000 : 0, local: false }));   // tracks.json "added" is in seconds
}

/* ---------- uploads (stored on this device with IndexedDB) ---------- */
const DB = (() => {
  let p;
  const open = () => p || (p = new Promise((res, rej) => {
    const req = indexedDB.open('djsinatra', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('tracks', { keyPath: 'id' });
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction('tracks', mode); const r = fn(t.objectStore('tracks'));
      t.oncomplete = () => res(r?.result); t.onerror = () => rej(t.error);
    });
  };
  return {
    all: () => tx('readonly', s => s.getAll()),
    put: v => tx('readwrite', s => s.put(v)),
    del: id => tx('readwrite', s => s.delete(id)),
  };
})();
async function isMp3(file) {
  if (!/\.mp3$/i.test(file.name)) return false;
  const b = new Uint8Array(await file.slice(0, 3).arrayBuffer());
  const id3 = b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33;           // "ID3"
  const frame = b[0] === 0xff && (b[1] & 0xe0) === 0xe0;                  // MPEG frame sync
  return id3 || frame;
}
async function addFiles(files) {
  let added = 0, rejected = [];
  for (const f of files) {
    if (!(await isMp3(f))) { rejected.push(f.name); continue; }
    const rec = { id: 'l:' + f.name + ':' + f.size, file: f.name, size: f.size, blob: f, added: Date.now() };
    try { await DB.put(rec); added++; } catch { rejected.push(f.name); }
  }
  await refresh();
  let msg = added ? `Added ${added} MP3${added > 1 ? 's' : ''} to this device.` : '';
  if (rejected.length) msg += ` Skipped ${rejected.length} non-MP3 file${rejected.length > 1 ? 's' : ''} (MP3 only).`;
  if (added && els.publish.href) msg += ' Use “Publish to GitHub” to share them with every device.';
  say(msg.trim(), 10000);
}
async function removeLocal(t) {
  if (!confirm(`Remove “${t.title}” from this device?`)) return;
  await DB.del(t.id); refresh();
}
async function loadLocal() {
  try {
    return (await DB.all()).map(x => ({ id: x.id, file: x.file, title: prettify(x.file), size: x.size, blob: x.blob,
                                        added: x.added || 0, local: true }));
  } catch { return []; }
}
els.fileInput.onchange = () => { addFiles([...els.fileInput.files]); els.fileInput.value = ''; };
$('#uploadLabel').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); } });
let dragDepth = 0;
addEventListener('dragenter', e => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; els.drop.hidden = false; } });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; els.drop.hidden = true; } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; els.drop.hidden = true; addFiles([...e.dataTransfer.files]); });

const repo = githubRepo();
if (repo) {
  els.publish.href = `https://github.com/${repo}/upload/main/tracks`;
  els.publish.hidden = false;
}

async function refresh(onlyIfChanged = false) {
  const [pub, allLoc] = await Promise.all([loadPublished(), loadLocal()]);
  // A song uploaded on this device that is now published on GitHub: drop the private copy
  // so it isn't listed (or counted) twice, and free the space it used.
  const pubNames = new Set(pub.map(t => t.file.toLowerCase()));
  const loc = pub.length ? allLoc.filter(t => !pubNames.has(t.file.toLowerCase())) : allLoc;
  if (pub.length) allLoc.filter(t => pubNames.has(t.file.toLowerCase())).forEach(t => DB.del(t.id).catch(() => {}));
  const next = [...pub.sort(newestFirst), ...loc.sort(newestFirst)];   // newest first; device-only songs listed last
  const key = list => list.map(t => t.id).join('|');
  if (onlyIfChanged && (key(next) === key(tracks) || (!pub.length && tracks.some(t => !t.local)))) return;
  tracks = next;
  render();
}

/* ---------- TV remote / keyboard (D-pad) navigation ---------- */
addEventListener('keydown', e => {
  const dlg = document.querySelector('dialog[open]');
  if (dlg) {
    // Remote / arrow keys move through everything in the open pop-up (top to bottom).
    const inText = document.activeElement?.tagName === 'INPUT' && document.activeElement.type === 'text';
    const vertical = e.key === 'ArrowDown' || e.key === 'ArrowUp';
    const horizontal = !inText && (e.key === 'ArrowRight' || e.key === 'ArrowLeft');
    if (!vertical && !horizontal) return;
    const items = [...dlg.querySelectorAll('button, input, a[href]')].filter(x => !x.hidden && x.offsetParent !== null);
    const i = items.indexOf(document.activeElement);
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    const next = items[i < 0 ? 0 : Math.max(0, Math.min(items.length - 1, i + step))];
    if (next) { next.focus(); next.scrollIntoView?.({ block: 'nearest' }); }
    e.preventDefault();
    return;
  }
  const row = document.activeElement?.closest?.('.row');
  const inCats = !!document.activeElement?.closest?.('#cats');
  const inPlayer = !!document.activeElement?.closest?.('#player');
  const playerOpen = !els.player.hidden;
  const activeChip = () => els.cats.querySelector('[aria-pressed="true"]') || els.cats.firstElementChild;
  const rows = () => [...els.list.querySelectorAll('.row')];
  // Remote / keyboard media keys work from anywhere
  const k = e.key;
  if (k === 'MediaPlayPause' || k === 'MediaPlay' || k === 'MediaPause') { togglePlay(); e.preventDefault(); return; }
  if (k === 'MediaStop') { stopPlayer(); e.preventDefault(); return; }
  if (k === 'MediaTrackNext' && playerOpen) { $('#nextBtn').click(); e.preventDefault(); return; }
  if (k === 'MediaTrackPrevious' && playerOpen) { $('#prevBtn').click(); e.preventDefault(); return; }
  // Back on TV browsers / Esc on a keyboard closes the player
  if ((k === 'Escape' || k === 'GoBack' || k === 'BrowserBack' || e.keyCode === 461 || e.keyCode === 10009) && playerOpen) {
    if (document.activeElement !== els.search) { stopPlayer(); e.preventDefault(); return; }
  }
  if (inPlayer) {
    const btns = [...els.player.querySelectorAll('button')];
    const i = btns.indexOf(document.activeElement);
    if (k === 'ArrowRight' || k === 'ArrowLeft') {
      const next = btns[i + (k === 'ArrowRight' ? 1 : -1)];
      if (next) next.focus();
      e.preventDefault();
    } else if (k === 'ArrowUp') {
      const r = els.list.querySelector('.row.playing') || rows().at(-1);
      if (r) { $('.play', r).focus(); r.scrollIntoView({ block: 'nearest' }); }
      e.preventDefault();
    } else if (k === 'ArrowDown') e.preventDefault();
    return;
  }
  if (inCats && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const sib = e.key === 'ArrowRight' ? document.activeElement.nextElementSibling : document.activeElement.previousElementSibling;
    if (sib) { sib.focus(); e.preventDefault(); }
  } else if (row && e.key === 'ArrowDown' && playerOpen && row === rows().at(-1)) {
    els.playPause.focus(); e.preventDefault();      // past the last song → the player controls
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (document.activeElement === els.search && e.key === 'ArrowUp') return;
    if (document.activeElement === els.search && e.key === 'ArrowDown') { activeChip()?.focus(); e.preventDefault(); return; }
    if (inCats && e.key === 'ArrowUp') { els.search.focus(); e.preventDefault(); return; }
    const all = rows();
    if (!all.length) return;
    let i = row ? all.indexOf(row) + (e.key === 'ArrowDown' ? 1 : -1) : 0;
    if (i < 0) { activeChip()?.focus(); e.preventDefault(); return; }
    i = Math.min(i, all.length - 1);
    $('.play', all[i]).focus(); all[i].scrollIntoView({ block: 'nearest' }); e.preventDefault();
  } else if (row && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const btns = [...row.querySelectorAll('button:not([hidden]), a')];
    const i = btns.indexOf(document.activeElement) + (e.key === 'ArrowRight' ? 1 : -1);
    if (btns[i]) { btns[i].focus(); e.preventDefault(); }
  }
});

/* ---------- install as an app ---------- */
let deferredPrompt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; els.install.hidden = false; });
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (isIOS && !standalone) els.install.hidden = false;
els.install.onclick = async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice; deferredPrompt = null; els.install.hidden = true;
  } else if (isIOS) {
    alert('To install DJSinatra: tap the Share button in Safari, then “Add to Home Screen”.');
  }
};
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

refresh();

/* ---------- auto-update the song list ----------
 * New songs pushed to GitHub show up on their own: when you come back to the app,
 * and every 5 minutes while it is open. No reinstall needed. */
let lastRefresh = Date.now();
async function autoRefresh() {
  if (document.hidden || Date.now() - lastRefresh < 60000) return;
  lastRefresh = Date.now();
  const before = new Set(tracks.map(t => t.id));
  await refresh(true);
  const added = tracks.filter(t => !before.has(t.id)).length;
  if (added) say(`🎵 ${added} new song${added > 1 ? 's' : ''} added!`, 8000);
}
document.addEventListener('visibilitychange', autoRefresh);
addEventListener('focus', autoRefresh);
setInterval(autoRefresh, 5 * 60000);
