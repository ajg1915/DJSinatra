/* DJSinatra — instrumental MP3 player that hands playback to VLC.
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
  settings: $('#settings'), install: $('#installBtn'),
};

/* ---------- device detection ---------- */
const ua = navigator.userAgent;
const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
const isTV = /\b(TV|AFT\w*|BRAVIA|SMART-TV|SmartTV|Tizen|Web0S|webOS|CrKey|GoogleTV)\b/i.test(ua);
const device = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';
$('#deviceName').textContent = isIOS ? 'iPhone / iPad' : isAndroid ? (isTV ? 'Android TV / Fire TV' : 'Android') : isTV ? 'Smart TV' : 'Computer';

/* ---------- state ---------- */
let tracks = [];      // {id, file, title, size, url, local, blob?}
let view = [];        // filtered tracks currently shown
let current = -1;     // index into view of the built-in player track
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
let defaultPlayer = store.get('djs.player', 'vlc');

/* ---------- helpers ---------- */
function prettify(file) {
  return file
    .replace(/\.mp3$/i, '')
    .replace(/^poppop\.ai\s*-\s*/i, '')
    .replace(/^\d+_/, '')
    .replace(/_/g, ' ')
    .replace(/\b(64|96|128|160|192|256|320)k\b/gi, '')
    .replace(/inst-gabox-fv\d+/gi, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\s*\(\d\)\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
const fmtSize = b => b ? (b / 1048576).toFixed(1) + ' MB' : '';
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
function m3u(list) {
  return '#EXTM3U\n' + list.map(t => `#EXTINF:-1,${t.title}\n${t.url}`).join('\n') + '\n';
}
function saveFile(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
const safeName = s => s.replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) || 'DJSinatra';

/* ---------- VLC hand-off ---------- */
function vlcLink(url, type = 'audio/mpeg') {
  if (device === 'android') {
    const u = new URL(url);
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};` +
           `type=${type};package=org.videolan.vlc;end`;
  }
  if (device === 'ios') return 'vlc-x-callback://x-callback-url/stream?url=' + encodeURIComponent(url);
  return null; // desktop: use a playlist file instead
}
function launch(link) {
  let left = false;
  const onHide = () => { left = true; };
  document.addEventListener('visibilitychange', onHide, { once: true });
  window.addEventListener('blur', onHide, { once: true });
  location.href = link;
  if (device === 'ios') {
    setTimeout(() => {
      if (!left) say('VLC did not open — install the free "VLC for Mobile" app from the App Store, then try again.', 12000);
    }, 1800);
  }
}
function openInVLC(t) {
  if (t.local) {
    say('Tracks uploaded on this device can only play in the built-in player. Publish them to GitHub to stream in VLC everywhere.');
    return playBuiltin(view.indexOf(t));
  }
  const link = vlcLink(t.url);
  if (link) { say(`Opening “${t.title}” in VLC…`); return launch(link); }
  saveFile(safeName(t.title) + '.m3u', m3u([t]), 'audio/x-mpegurl');
  say('Playlist downloaded — open it and it plays in VLC (set VLC as the default for .m3u files once).', 9000);
}
function playAllInVLC() {
  const list = view.filter(t => !t.local);
  if (!list.length) return say('Nothing to send to VLC yet.');
  if (device === 'desktop') {
    saveFile('DJSinatra.m3u', m3u(list), 'audio/x-mpegurl');
    return say(`Playlist with ${list.length} tracks downloaded — open it in VLC.`, 9000);
  }
  // Phones / TVs: stream the published playlist file (built by the GitHub workflow).
  const playlistUrl = new URL('playlist.m3u', location.href).href;
  fetch(playlistUrl, { method: 'HEAD' }).then(r => {
    if (r.ok) launch(vlcLink(playlistUrl, 'audio/x-mpegurl'));
    else openInVLC(list[0]);
  }).catch(() => openInVLC(list[0]));
}
async function copyLink(t) {
  if (t.local) return say('This track only lives on this device — publish it to GitHub to get a link.');
  try { await navigator.clipboard.writeText(t.url); say('Link copied. In VLC: Media/Network → Open Network Stream → paste.'); }
  catch { prompt('Copy this link into VLC → Open Network Stream:', t.url); }
}

/* ---------- built-in player ---------- */
function playBuiltin(i) {
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
function markPlaying() {
  const id = view[current]?.id;
  els.list.querySelectorAll('.row').forEach(r => r.classList.toggle('playing', r.dataset.id === id));
}
els.audio.addEventListener('ended', () => playBuiltin(current + 1 < view.length ? current + 1 : 0));
els.audio.addEventListener('play', () => els.player.classList.add('on'));
els.audio.addEventListener('pause', () => els.player.classList.remove('on'));
$('#nextBtn').onclick = () => playBuiltin((current + 1) % view.length);
$('#prevBtn').onclick = () => playBuiltin((current - 1 + view.length) % view.length);
$('#nowVlcBtn').onclick = () => { if (view[current]) { els.audio.pause(); openInVLC(view[current]); } };
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('nexttrack', () => $('#nextBtn').click());
  navigator.mediaSession.setActionHandler('previoustrack', () => $('#prevBtn').click());
}

/* ---------- rendering ---------- */
function render() {
  const q = els.search.value.trim().toLowerCase();
  const playingId = view[current]?.id;
  view = tracks.filter(t => !q || t.title.toLowerCase().includes(q) || t.file.toLowerCase().includes(q));
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
    $('.meta', li).textContent = [t.local ? '📱 Only on this device' : 'MP3', fmtSize(t.size)].filter(Boolean).join(' · ');
    if (t.local) li.classList.add('local');
    $('.play', li).onclick = () => (defaultPlayer === 'vlc' ? openInVLC(t) : playBuiltin(i));
    $('.vlc', li).onclick = () => openInVLC(t);
    $('.builtin', li).onclick = () => playBuiltin(i);
    $('.copy', li).onclick = () => copyLink(t);
    const dl = $('.dl', li);
    if (t.local) {
      dl.onclick = e => { e.preventDefault(); const u = URL.createObjectURL(t.blob); dl.href = u; saveBlob(u, t.file); };
      const del = $('.del', li); del.hidden = false; del.onclick = () => removeLocal(t);
    } else { dl.href = t.url; dl.download = t.file; }
    frag.appendChild(li);
  });
  els.list.appendChild(frag);
  els.empty.hidden = view.length > 0;
  const nPub = view.filter(t => !t.local).length, nLoc = view.length - nPub;
  els.libTitle.textContent = `Library · ${nPub} song${nPub === 1 ? '' : 's'}` +
    (nLoc ? ` · +${nLoc} only on this device` : '');
  markPlaying();
}
function saveBlob(u, name) {
  const a = document.createElement('a'); a.href = u; a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000);
}
els.search.addEventListener('input', render);
$('#vlcAllBtn').onclick = playAllInVLC;

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
    .map(x => ({ id: 'p:' + x.file, file: x.file, title: prettify(x.file), size: x.size, url: absUrl(x.file), local: false }));
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
    return (await DB.all()).map(x => ({ id: x.id, file: x.file, title: prettify(x.file), size: x.size, blob: x.blob, local: true }));
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
  const byTitle = (a, b) => a.title.localeCompare(b.title);
  const next = [...pub.sort(byTitle), ...loc.sort(byTitle)];   // device-only songs listed last
  const key = list => list.map(t => t.id).join('|');
  if (onlyIfChanged && (key(next) === key(tracks) || (!pub.length && tracks.some(t => !t.local)))) return;
  tracks = next;
  render();
}

/* ---------- settings ---------- */
$('#settingsBtn').onclick = () => {
  els.settings.querySelector(`input[value="${defaultPlayer}"]`).checked = true;
  els.settings.showModal();
};
els.settings.addEventListener('change', e => {
  if (e.target.name === 'player') { defaultPlayer = e.target.value; store.set('djs.player', defaultPlayer); }
});

/* ---------- TV remote / keyboard (D-pad) navigation ---------- */
addEventListener('keydown', e => {
  if (els.settings.open) return;
  const row = document.activeElement?.closest?.('.row');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (document.activeElement === els.search && e.key === 'ArrowUp') return;
    const rows = [...els.list.querySelectorAll('.row')];
    if (!rows.length) return;
    let i = row ? rows.indexOf(row) + (e.key === 'ArrowDown' ? 1 : -1) : 0;
    if (i < 0) { els.search.focus(); e.preventDefault(); return; }
    i = Math.min(i, rows.length - 1);
    $('.play', rows[i]).focus(); rows[i].scrollIntoView({ block: 'nearest' }); e.preventDefault();
  } else if (row && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    const btns = [...row.querySelectorAll('button:not([hidden]), a')];
    const i = btns.indexOf(document.activeElement) + (e.key === 'ArrowRight' ? 1 : -1);
    if (btns[i]) { btns[i].focus(); e.preventDefault(); }
  } else if (e.key === 'MediaPlayPause') {
    els.audio.paused ? els.audio.play() : els.audio.pause();
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
