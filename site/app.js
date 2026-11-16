'use strict';
// K&B Archive player. No framework: hash routes render into <main>, one shared
// <audio> element plays, and progress lives in localStorage + syncs to /api.

// ---------- small helpers ----------
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem('kab.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kab.' + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem('kab.' + k); } catch { /* ignore */ } },
};

const ICON = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  volHigh: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>',
  volLow: '<svg viewBox="0 0 24 24"><path d="M5 9v6h4l5 5V4L9 9H5zm13.5 3A4.5 4.5 0 0 0 16 8v8a4.5 4.5 0 0 0 2.5-4z"/></svg>',
  volOff: '<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0 0 14 8v2.2l2.45 2.45c.03-.2.05-.41.05-.65zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12a9 9 0 0 0-7-8.77v2.06A7 7 0 0 1 19 12zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  wave: '<svg viewBox="0 0 24 24"><path d="M3 10h2v4H3zm4-4h2v12H7zm4-3h2v18h-2zm4 5h2v8h-2zm4 3h2v2h-2z"/></svg>',
  folder: '<svg viewBox="0 0 24 24"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20.3s-7.4-4.5-9.1-9.1C1.8 8 3.9 4.6 7.3 4.6c2 0 3.7 1.1 4.7 2.7 1-1.6 2.7-2.7 4.7-2.7 3.4 0 5.5 3.4 4.4 6.6-1.7 4.6-9.1 9.1-9.1 9.1z"/></svg>',
  heartFill: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20.3s-7.4-4.5-9.1-9.1C1.8 8 3.9 4.6 7.3 4.6c2 0 3.7 1.1 4.7 2.7 1-1.6 2.7-2.7 4.7-2.7 3.4 0 5.5 3.4 4.4 6.6-1.7 4.6-9.1 9.1-9.1 9.1z"/></svg>',
};
// Per-show look. `logo` is optional; shows without one fall back to a date tile.
const ERA = {
  'Kevin & Bean': { color: 'var(--era-kb)', logo: { src: '/logos/kevin-and-bean.png', w: 241, h: 262 } },
  'Kevin in the Morning': { color: 'var(--era-kitm)', logo: { src: '/logos/kevin-in-the-morning.png', w: 178, h: 167 } },
  'Kevin & Sluggo': { color: 'var(--era-ks)', logo: { src: '/logos/kevin-and-sluggo.png', w: 233, h: 194 } },
  'Kevin Ryder on KROQ': { color: 'var(--era-kroq)', logo: { src: '/logos/kevin-ryder-kroq.jpg', w: 241, h: 238, photo: true } },
};
const eraColor = (era) => ERA[era]?.color || 'var(--accent)';
const eraLogo = (era) => ERA[era]?.logo || null;
const logoImg = (era, cls) => {
  const l = eraLogo(era);
  return l ? `<img class="${cls}${l.photo ? ' photo' : ''}" src="${l.src}" width="${l.w}" height="${l.h}" alt="${esc(era)}">` : '';
};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const asDate = (iso) => new Date(iso + 'T12:00:00Z');
const fmtDate = (iso, opts) => asDate(iso).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
const longDate = (iso) => fmtDate(iso, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
const shortDate = (iso) => fmtDate(iso, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
const dayTitle = (iso) => fmtDate(iso, { weekday: 'long', month: 'long', day: 'numeric' });

function fmtClock(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function fmtSpan(sec) {
  sec = Math.max(0, Math.round(sec / 60));
  const h = Math.floor(sec / 60), m = sec % 60;
  return h ? (m ? `${h} hr ${m} min` : `${h} hr`) : `${Math.max(1, m)} min`;
}
function ago(ms) {
  if (!ms) return 'never';
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return new Date(ms).toLocaleString();
}

let toastTimer;
function toast(msg, action) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('has-action', !!action);
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-action';
    b.textContent = action.label;
    b.onclick = () => { el.classList.remove('show'); clearTimeout(toastTimer); action.run(); };
    el.append(b);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2600);
}

// ---------- state ----------
const S = {
  key: store.get('key', ''),
  eps: [], byId: new Map(), idx: new Map(), years: new Map(), eras: [],
  catalogTag: '',
  prog: store.get('prog', {}),
  dirty: new Set(store.get('dirty', [])),
  favs: store.get('favs', {}), // id -> {fav: 0|1, updated}
  dirtyFavs: new Set(store.get('dirtyFavs', [])),
  cursor: store.get('cursor', 0),
  current: store.get('current', null),
  settings: { autoplay: true, rate: 1, volume: 1, muted: false, ...store.get('settings', {}) },
  lastPull: 0, lastPush: store.get('lastPush', 0), lastCatalogCheck: 0,
  syncState: 'idle',
  sleep: null, // {mode: minutes|'end', until}
};

function setCatalog(cat) {
  S.eps = cat.episodes;
  S.byId = new Map(S.eps.map((e) => [e.id, e]));
  S.idx = new Map(S.eps.map((e, i) => [e.id, i]));
  S.years = new Map();
  for (const e of S.eps) {
    const y = +e.date.slice(0, 4);
    if (!S.years.has(y)) S.years.set(y, { year: y, era: e.era, eps: [] });
    S.years.get(y).eps.push(e);
  }
  // Eras newest first, each with its years newest first.
  const eras = new Map();
  for (const Y of [...S.years.values()].sort((a, b) => b.year - a.year)) {
    if (!eras.has(Y.era)) eras.set(Y.era, []);
    eras.get(Y.era).push(Y);
  }
  S.eras = [...eras].map(([name, years]) => ({ name, years }));
  S.epByDate = new Map();
  for (const e of S.eps) if (!S.epByDate.has(e.date)) S.epByDate.set(e.date, e);
  S.showHay = null;
}

// ---------- clips (the archive's audio.php folders, from /clips.json) ----------
const C = { loaded: false, loading: null, base: '', folders: [], byId: new Map(), byDate: new Map(), byPath: new Map(), list: [], hay: null };

// Stable id from the clip's path (cyrb53), so progress/favorites survive re-crawls.
function clipId(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'c' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const isClipId = (id) => typeof id === 'string' && id[0] === 'c';
const cleanName = (s) => s.replace(/_/g, ' ').replace(/`/g, "'").replace(/\s+/g, ' ').replace(/^[-\s]+|[-\s]+$/g, '').trim();

function clipTitle(raw, stripNumber) {
  let t = cleanName(raw.replace(/\.mp3$/i, ''));
  if (stripNumber) t = t.replace(/^\d{2}[a-z]?\s+/i, '');
  const m = /\d{4}-\d{2}-\d{2}/.exec(t);
  if (m) {
    const before = t.slice(0, m.index).replace(/[\s\-–,]+$/, '');
    const after = t.slice(m.index + 10).replace(/^[\s\-–,]+/, '');
    t = before && after ? `${before} — ${after}` : before || after;
  }
  return t || cleanName(raw);
}

function loadClips() {
  if (C.loading) return C.loading;
  C.loading = fetch('/clips.json').then((r) => {
    if (!r.ok) throw new Error("Couldn't load the clip list");
    return r.json();
  }).then((data) => {
    C.base = data.base;
    C.folders = data.folders.map(([name, parent], i) => ({ i, name, title: i ? cleanName(name) : 'Other clips', parent, subs: [], files: [], total: 0, path: [] }));
    for (const f of C.folders) {
      if (f.parent >= 0) {
        f.path = [...C.folders[f.parent].path, f.name];
        C.folders[f.parent].subs.push(f);
      }
      C.byPath.set(f.path.join('/'), f);
    }
    data.folders.forEach(([, , files], i) => {
      const f = C.folders[i];
      const numbered = files.length >= 3 && files.filter((x) => /^\d{2}[a-z]?\s/i.test(x)).length >= files.length * 0.6;
      const prefix = f.path.length ? f.path.join('/') + '/' : '';
      for (const raw of files) {
        const m = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
        const date = m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31 ? m[0] : null;
        const c = { id: clipId(prefix + raw), kind: 'clip', fi: i, raw, title: clipTitle(raw, numbered), date };
        f.files.push(c);
        C.list.push(c);
        C.byId.set(c.id, c);
        if (date) { if (!C.byDate.has(date)) C.byDate.set(date, []); C.byDate.get(date).push(c); }
      }
    });
    for (let i = C.folders.length - 1; i >= 0; i--) {
      const f = C.folders[i];
      f.total += f.files.length;
      if (f.parent >= 0) C.folders[f.parent].total += f.total;
    }
    C.loaded = true;
  }).catch((err) => { C.loading = null; throw err; });
  return C.loading;
}

const clipUrl = (c) => C.base + [...C.folders[c.fi].path, /\.mp3$/i.test(c.raw) ? c.raw : c.raw + '.mp3'].map(encodeURIComponent).join('/');
const folderHash = (f) => '#/clips/f/' + encodeURIComponent(f.path.join('/'));
const folderLabel = (fi) => {
  const f = C.folders[fi];
  if (!f || !f.path.length) return 'Other clips';
  return f.path.length > 1 ? `${cleanName(f.path[0])} › ${f.title}` : f.title;
};
const itemOf = (id) => (isClipId(id) ? C.byId.get(id) : S.byId.get(id)) || null;
const hasClipState = () => isClipId(S.current) || Object.keys(S.prog).some(isClipId) ||
  Object.entries(S.favs).some(([id, f]) => isClipId(id) && f.fav === 1);

// ---------- search (shows + clips, dates or words) ----------
const MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const monthNum = (s) => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(s.slice(0, 3).toLowerCase()) + 1;
const pad2 = (n) => String(n).padStart(2, '0');
const MONTH_LONG = MONTH_NAMES;

function dayQ(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (y < 1980 || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  const date = `${y}-${pad2(m)}-${pad2(d)}`;
  return { kind: 'day', date, label: longDate(date), test: (s) => s === date };
}
function monthQ(y, m) {
  if (m < 1 || m > 12 || y < 1980) return null;
  const prefix = `${y}-${pad2(m)}-`;
  return { kind: 'month', year: y, prefix, label: `${MONTH_LONG[m - 1]} ${y}`, test: (s) => !!s && s.startsWith(prefix) };
}
function monthDayQ(m, d) {
  const dt = new Date(Date.UTC(2000, m - 1, d)); // leap year, so Feb 29 is allowed
  if (m < 1 || m > 12 || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  const md = `${pad2(m)}-${pad2(d)}`;
  return { kind: 'monthday', label: `${MONTH_LONG[m - 1]} ${d}, any year`, test: (s) => !!s && s.slice(5) === md };
}
function yearQ(y) {
  return { kind: 'year', year: y, label: String(y), test: (s) => !!s && s.startsWith(y + '-') };
}
const fullYear = (s) => (s.length === 2 ? (+s < 50 ? 2000 + +s : 1900 + +s) : +s);

// Finds a date in the query ("June 7 2017", "6/7/17", "2017-06-07", "June 2017", "June 7", "2008").
// Returns the date filter plus whatever words are left over, or null.
function parseDateQuery(q) {
  const tries = [
    [/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/, (m) => dayQ(+m[1], +m[2], +m[3])],
    [/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/, (m) => dayQ(fullYear(m[3]), +m[1], +m[2])],
    [new RegExp(`\\b${MON_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'i'), (m) => dayQ(+m[3], monthNum(m[1]), +m[2])],
    [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON_RE},?\\s+(\\d{4})\\b`, 'i'), (m) => dayQ(+m[3], monthNum(m[2]), +m[1])],
    [new RegExp(`\\b${MON_RE},?\\s+(\\d{4})\\b`, 'i'), (m) => monthQ(+m[2], monthNum(m[1]))],
    [/\b(\d{4})-(\d{1,2})\b/, (m) => monthQ(+m[1], +m[2])],
    [new RegExp(`\\b${MON_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), (m) => monthDayQ(monthNum(m[1]), +m[2])],
    [/\b(19[89]\d|20[0-4]\d)\b/, (m) => yearQ(+m[1])],
  ];
  for (const [re, make] of tries) {
    const m = re.exec(q);
    const d = m && make(m);
    if (d) return { ...d, rest: `${q.slice(0, m.index)} ${q.slice(m.index + m[0].length)}`.trim() };
  }
  return null;
}
const searchWords = (s) => s.toLowerCase().replace(/[`’]/g, "'").replace(/[,]/g, ' ').split(/\s+/).filter(Boolean);
const byDateDesc = (a, b) => ((b.date || '') > (a.date || '') ? 1 : (b.date || '') < (a.date || '') ? -1 : 0);

function runSearch(q) {
  const dq = parseDateQuery(q);
  const words = searchWords(dq ? dq.rest : q);
  const out = { dq, words, shows: [], clips: [], folders: [] };
  if (!dq && !words.length) return out;
  // Shows: match on the date (spelled out, with weekday), label and note.
  if (!S.showHay) S.showHay = S.eps.map((e) => `${longDate(e.date)} ${e.label || ''} ${e.note || ''}`.toLowerCase());
  for (let i = S.eps.length - 1; i >= 0; i--) {
    const e = S.eps[i];
    if (dq && !dq.test(e.date)) continue;
    if (words.length && !words.every((w) => S.showHay[i].includes(w))) continue;
    out.shows.push(e);
  }
  if (C.loaded) {
    if (!C.hay) C.hay = C.list.map((c) => `${c.title} ${C.folders[c.fi].title}`.toLowerCase());
    const yearText = dq?.kind === 'year' ? String(dq.year) : null;
    for (let i = 0; i < C.list.length; i++) {
      const c = C.list[i];
      // Undated clips can still match a year through their title or folder ("2000-The Real Slim Santa").
      if (dq && !dq.test(c.date) && !(yearText && !c.date && C.hay[i].includes(yearText))) continue;
      if (words.length && !words.every((w) => C.hay[i].includes(w))) continue;
      out.clips.push(c);
    }
    out.clips.sort(byDateDesc);
    if (words.length) {
      out.folders = C.folders.filter((f) => f.i && words.every((w) => f.title.toLowerCase().includes(w)))
        .sort((a, b) => b.total - a.total).slice(0, 8);
    }
  }
  return out;
}

// Hand-picked collections for the Specials shelf.
const SPECIALS = [
  { path: 'Kevin and Bean Christmas CDs', title: 'Christmas CDs', sub: 'The holiday albums', color: '#e5484d' },
  { path: 'BEAN`S FINAL SHOW - November 07, 2019', title: "Bean's Final Show", sub: 'November 7, 2019', color: '#f5a524' },
  { path: 'Live Shows from Remote Locations-BREAKFAST WITH, Singles Parties, Cinco de Mayo, etc', title: 'Live Remote Shows', sub: 'Breakfast With, Cinco de Mayo, NYC 1997', color: '#38bdf8' },
  { path: 'Kevin And Bean Party Machine', title: 'Party Machine', sub: 'The all-music shows', color: '#a78bfa' },
  { path: 'Live In-Studio Performances', title: 'In-Studio Performances', sub: 'Live in the KROQ studio', color: '#4ade80' },
  { path: 'Loveline with Psycho Mike Catherwood', title: 'Loveline', sub: 'With Psycho Mike', color: '#f472b6' },
  { path: 'Opening Audio Montages', title: 'Opening Montages', sub: 'How every show began', color: '#ff6a3d' },
  { path: 'Tops of The Year-Kevin And Bean segments', title: 'Tops of the Year', sub: 'Year-end countdowns', color: '#f2c94c' },
  { path: 'Miss Double December', title: 'Miss Double December', sub: 'The pageant', color: '#e5484d' },
  { path: 'The B-Team podcast - episodes 1-30', title: 'The B-Team Podcast', sub: 'Episodes 1–30', color: '#38bdf8' },
  { path: 'This Week In Rage with Adam Carolla', title: 'This Week in Rage', sub: 'With Adam Carolla', color: '#ff6a3d' },
  { path: 'Kevin and Bean- Before the show or early in the history of the show', title: 'The Early Days', sub: 'Before and early on', color: '#a78bfa' },
];

let saveTimer = null;
function saveLocal() {
  clearTimeout(saveTimer);
  saveTimer = null;
  store.set('prog', S.prog);
  store.set('dirty', [...S.dirty]);
  store.set('favs', S.favs);
  store.set('dirtyFavs', [...S.dirtyFavs]);
  store.set('cursor', S.cursor);
}
function saveLocalSoon() { if (!saveTimer) saveTimer = setTimeout(saveLocal, 1500); }

function setProgress(id, patch) {
  const p = { pos: 0, dur: null, done: 0, ...S.prog[id], ...patch, updated: Date.now() };
  S.prog[id] = p;
  S.dirty.add(id);
  saveLocalSoon();
  return p;
}

const isFav = (id) => S.favs[id]?.fav === 1;
function toggleFav(id) {
  const fav = isFav(id) ? 0 : 1;
  S.favs[id] = { fav, updated: Date.now() };
  S.dirtyFavs.add(id);
  saveLocal();
  push();
  toast(fav ? 'Added to favorites' : 'Removed from favorites');
  renderPlayer();
  if (/^#\/(favorites)?$/.test(location.hash || '#/')) refreshView(); else refreshRows();
}
function favoriteEps() {
  return Object.entries(S.favs)
    .filter(([id, f]) => f.fav === 1 && itemOf(id))
    .map(([id, f]) => ({ ep: itemOf(id), added: f.updated }));
}

// ---------- API + sync ----------
async function api(path, opts = {}) {
  const headers = { Authorization: 'Bearer ' + S.key, ...(opts.headers || {}) };
  if (opts.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { ...opts, headers });
  if (res.status === 401) {
    const err = new Error('Passphrase not accepted');
    err.code = 401;
    throw err;
  }
  return res;
}

function setSync(state) {
  S.syncState = state;
  if (location.hash.startsWith('#/settings')) renderSettings();
}

let pushing = false;
async function push({ keepalive = false } = {}) {
  if (!S.key || (!S.dirty.size && !S.dirtyFavs.size) || pushing) return;
  const rows = [...S.dirty].filter((id) => S.prog[id]).slice(0, 300).map((id) => ({ id, ...S.prog[id] }));
  const favs = [...S.dirtyFavs].filter((id) => S.favs[id]).slice(0, 300).map((id) => ({ id, ...S.favs[id] }));
  pushing = true;
  try {
    const res = await api('/api/progress', { method: 'POST', body: JSON.stringify({ rows, favs }), keepalive });
    if (!res.ok) throw new Error('sync failed ' + res.status);
    for (const r of rows) if (S.prog[r.id]?.updated === r.updated) S.dirty.delete(r.id);
    for (const f of favs) if (S.favs[f.id]?.updated === f.updated) S.dirtyFavs.delete(f.id);
    S.lastPush = Date.now();
    store.set('lastPush', S.lastPush);
    saveLocal();
    setSync('ok');
  } catch (err) {
    setSync(err.code === 401 ? 'auth' : 'offline');
  } finally {
    pushing = false;
  }
}

// Pull rows changed on other devices. Returns true if anything changed.
async function pull() {
  const res = await api('/api/progress?since=' + S.cursor);
  if (!res.ok) throw new Error('sync failed ' + res.status);
  const { rows, favs = [], cursor } = await res.json();
  let changed = false;
  for (const f of favs) {
    const local = S.favs[f.id];
    if (!local || f.updated > local.updated) {
      S.favs[f.id] = { fav: f.fav, updated: f.updated };
      S.dirtyFavs.delete(f.id);
      changed = true;
    }
  }
  const playingId = !audio.paused ? S.current : null;
  for (const r of rows) {
    if (r.id === playingId) continue; // this device is the authority while it plays
    const local = S.prog[r.id];
    if (!local || r.updated > local.updated) {
      S.prog[r.id] = { pos: r.pos, dur: r.dur, done: r.done, updated: r.updated };
      S.dirty.delete(r.id);
      changed = true;
    }
  }
  S.cursor = cursor;
  S.lastPull = Date.now();
  saveLocal();
  setSync('ok');
  return changed;
}

async function syncNow({ adopt = true } = {}) {
  try {
    await push();
    const changed = await pull();
    if (changed) {
      if (adopt) adoptLatest();
      refreshView();
      // Another device touched clips? Load the clip list so they show up here too.
      if (!C.loaded && hasClipState()) loadClips().then(() => { if (adopt) adoptLatest(); refreshView(); }).catch(() => {});
    }
  } catch (err) {
    setSync(err.code === 401 ? 'auth' : 'offline');
    if (err.code === 401) renderSetup('That passphrase stopped working. Enter it again.');
  }
}

// Paused here but you kept listening on another device? Pick up from there.
function adoptLatest() {
  if (!audio.paused) return;
  let best = null;
  for (const [id, p] of Object.entries(S.prog)) {
    if (p.done || !(p.pos > 0) || !itemOf(id)) continue;
    if (!best || p.updated > best.p.updated) best = { id, p };
  }
  if (!best) return;
  if (best.id !== S.current) loadEpisode(best.id, { autoplay: false });
  else if (Math.abs(audio.currentTime - best.p.pos) > 5) seekTo(best.p.pos);
}

async function loadCatalog() {
  const cached = store.get('catalog', null);
  if (cached && !S.eps.length) {
    setCatalog(cached);
    S.catalogTag = store.get('catalogTag', '');
  }
  const res = await api('/api/episodes', { headers: S.eps.length && S.catalogTag ? { 'If-None-Match': S.catalogTag } : {} });
  S.lastCatalogCheck = Date.now();
  if (res.status === 304) return false;
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not load the episode list');
  const cat = await res.json();
  setCatalog(cat);
  S.catalogTag = res.headers.get('ETag') || '';
  if (store.set('catalog', cat)) store.set('catalogTag', S.catalogTag);
  else store.del('catalogTag');
  return true;
}

// ---------- audio ----------
const audio = new Audio();
audio.preload = 'metadata';
let pendingSeek = null;
let lastSaveAt = 0;
let lastPosState = 0;

function currentEp() { return S.current ? itemOf(S.current) : null; }
const isClip = (it) => it?.kind === 'clip';
const itemUrl = (it) => (isClip(it) ? clipUrl(it) : it.url);
const itemTitle = (it) => (isClip(it) ? it.title : longDate(it.date));
const clipDate = (d) => fmtDate(d, { month: 'short', day: 'numeric', year: 'numeric' });

// Volume. iPhone/iPad ignore audio.volume (hardware buttons only), so hide it there.
const VOLUME_OK = (() => {
  try { const a = document.createElement('audio'); a.volume = 0.5; return a.volume === 0.5; } catch { return false; }
})();
if (!VOLUME_OK) document.documentElement.classList.add('no-volume');
function applyVolume() {
  audio.volume = Math.min(1, Math.max(0, S.settings.volume));
  audio.muted = !!S.settings.muted;
  renderVolume();
}
function renderVolume() {
  const v = S.settings.muted ? 0 : S.settings.volume;
  for (const el of $$('.vol')) el.value = Math.round(v * 100);
  const icon = v === 0 ? ICON.volOff : v < 0.5 ? ICON.volLow : ICON.volHigh;
  for (const b of $$('.vol-btn')) {
    b.innerHTML = icon;
    b.setAttribute('aria-label', v === 0 ? 'Unmute' : 'Mute');
  }
}
function setVolume(v) {
  S.settings.volume = Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
  S.settings.muted = S.settings.volume === 0;
  store.set('settings', S.settings);
  applyVolume();
}
function toggleMute() {
  if (S.settings.muted || S.settings.volume === 0) {
    S.settings.muted = false;
    if (S.settings.volume === 0) S.settings.volume = 0.5;
  } else {
    S.settings.muted = true;
  }
  store.set('settings', S.settings);
  applyVolume();
}
applyVolume();

function loadEpisode(id, { autoplay = true, fromStart = false } = {}) {
  const ep = itemOf(id);
  if (!ep) return;
  if (S.current && S.current !== id && audio.src) savePosition();
  const p = S.prog[id];
  let start = 0;
  if (p && !p.done && !fromStart) start = Math.max(0, p.pos - (autoplay ? 3 : 0));
  if (p && p.done && autoplay) setProgress(id, { pos: 0, done: 0 });
  if (S.current !== id || !audio.currentSrc) {
    S.current = id;
    store.set('current', id);
    pendingSeek = start;
    audio.src = itemUrl(ep);
    audio.load();
  } else {
    seekTo(start);
  }
  audio.defaultPlaybackRate = audio.playbackRate = S.settings.rate;
  updateMediaSession(ep);
  renderPlayer();
  refreshRows();
  if (autoplay) play();
}

function play() {
  if (!S.current) return;
  audio.playbackRate = S.settings.rate;
  const pr = audio.play();
  if (pr) pr.catch((err) => { if (err.name !== 'AbortError') toast('Tap play to start'); });
}
function toggle() {
  if (!S.current) return;
  if (audio.paused) play(); else audio.pause();
}
function seekTo(t) {
  if (pendingSeek !== null || audio.readyState < 1) { pendingSeek = t; return; }
  const d = audio.duration;
  audio.currentTime = Math.max(0, Number.isFinite(d) ? Math.min(t, d - 1) : t);
  savePosition();
  renderProgress();
}
const skip = (delta) => seekTo((pendingSeek ?? audio.currentTime) + delta);

function savePosition() {
  if (!S.current || pendingSeek !== null || audio.readyState < 1) return;
  const dur = Number.isFinite(audio.duration) ? audio.duration : null;
  const pos = audio.currentTime;
  const prev = S.prog[S.current];
  if (!prev && pos < 1) return; // loaded but never actually listened
  // "Finished" near the end: last 30 s of a show, proportionally less for short clips.
  const done = dur && pos >= dur - Math.min(30, dur * 0.05) ? 1 : 0;
  if (prev && Math.abs(prev.pos - pos) < 0.5 && prev.done === done && prev.dur === dur) return;
  setProgress(S.current, { pos, dur, done });
}

// Next/previous: shows go day by day; clips go through their folder in order.
function neighbor(id, dir) {
  if (isClipId(id)) {
    const c = C.byId.get(id);
    if (!c) return null;
    const files = C.folders[c.fi].files;
    return files[files.indexOf(c) + dir] || null;
  }
  const i = S.idx.get(id);
  return i == null ? null : S.eps[i + dir] || null;
}
function playAdjacent(dir) {
  const n = S.current && neighbor(S.current, dir);
  if (n) loadEpisode(n.id, { autoplay: true });
  else if (isClipId(S.current)) toast(dir > 0 ? 'Last clip in this folder' : 'First clip in this folder');
  else toast(dir > 0 ? 'This is the newest show' : 'This is the oldest show');
}

audio.addEventListener('loadedmetadata', () => {
  if (pendingSeek !== null) {
    const t = pendingSeek;
    pendingSeek = null;
    if (t > 0) audio.currentTime = Math.min(t, (audio.duration || t + 1) - 1);
  }
  const p = S.prog[S.current];
  if (p && Number.isFinite(audio.duration) && p.dur !== audio.duration) { p.dur = audio.duration; saveLocalSoon(); }
  renderProgress();
});
audio.addEventListener('timeupdate', () => {
  if (pendingSeek !== null) return;
  const now = Date.now();
  renderProgress();
  if (!audio.paused && now - lastSaveAt > 5000) { lastSaveAt = now; savePosition(); }
  if (!audio.paused && now - S.lastPush > 30000 && S.dirty.size) { S.lastPush = now; push(); }
  if (now - lastPosState > 4000) { lastPosState = now; updatePositionState(); }
  if (S.sleep?.until && now >= S.sleep.until) { S.sleep = null; audio.pause(); toast('Sleep timer: paused'); renderPlayer(); }
});
audio.addEventListener('play', () => { renderPlayer(); refreshRows(); });
// Buffering ring: only if a stall lasts long enough to notice, so quick seeks don't flicker.
let bufferTimer = null;
function setBuffering(on) {
  clearTimeout(bufferTimer);
  bufferTimer = null;
  if (on) bufferTimer = setTimeout(() => $$('.icon.play').forEach((b) => b.classList.add('buffering')), 500);
  else $$('.icon.play').forEach((b) => b.classList.remove('buffering'));
}
audio.addEventListener('waiting', () => { if (!audio.paused) setBuffering(true); });
for (const ev of ['playing', 'canplay', 'seeked']) audio.addEventListener(ev, () => setBuffering(false));
audio.addEventListener('pause', () => {
  setBuffering(false);
  savePosition(); saveLocal(); push(); renderPlayer(); refreshRows();
});
audio.addEventListener('ratechange', () => { if (S.current) renderPlayer(); });
audio.addEventListener('ended', () => {
  const id = S.current;
  setProgress(id, { pos: audio.duration || S.prog[id]?.pos || 0, dur: audio.duration || null, done: 1 });
  saveLocal();
  push();
  const stopHere = S.sleep?.mode === 'end';
  if (stopHere) S.sleep = null;
  const n = neighbor(id, 1);
  if (S.settings.autoplay && !stopHere && n) loadEpisode(n.id, { autoplay: true });
  else { renderPlayer(); refreshRows(); }
});
audio.addEventListener('error', () => {
  if (!audio.src) return;
  setBuffering(false);
  toast(isClipId(S.current) ? "Couldn't load this clip. The archive site may be down." : "Couldn't load this show. The archive site may be down.");
});

// Lock screen / headphone / car controls.
function updateMediaSession(ep) {
  if (!('mediaSession' in navigator) || !ep) return;
  const clip = isClip(ep);
  const logo = clip ? null : eraLogo(ep.era);
  navigator.mediaSession.metadata = new MediaMetadata({
    title: clip ? ep.title : shortDate(ep.date) + (ep.label ? ` · ${ep.label}` : ''),
    artist: clip ? folderLabel(ep.fi) : ep.era,
    album: clip ? 'Kevin & Bean Archive · Clips' : 'Kevin & Bean Archive',
    artwork: logo
      ? [{ src: new URL(logo.src, location.href).href, sizes: `${logo.w}x${logo.h}`, type: logo.src.endsWith('.jpg') ? 'image/jpeg' : 'image/png' }]
      : [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
  });
}
function updatePositionState() {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
  const d = audio.duration;
  if (!Number.isFinite(d) || d <= 0) return;
  try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(audio.currentTime, d), playbackRate: audio.playbackRate }); } catch { /* ignore */ }
}
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const set = (action, fn) => { try { ms.setActionHandler(action, fn); } catch { /* unsupported */ } };
  set('play', () => play());
  set('pause', () => audio.pause());
  set('stop', () => audio.pause());
  set('seekbackward', (d) => skip(-(d.seekOffset || 15)));
  set('seekforward', (d) => skip(d.seekOffset || 30));
  set('seekto', (d) => { if (d.fastSeek && 'fastSeek' in audio) audio.fastSeek(d.seekTime); else seekTo(d.seekTime); });
}

// ---------- rendering: shared bits ----------
const view = () => $('#view');

function statusHTML(ep) {
  const p = S.prog[ep.id];
  if (p?.done) return `<span class="ep-status played">${ICON.check}Played</span>`;
  if (p && p.pos > 0) return `<span class="ep-status">${p.dur ? fmtSpan(p.dur - p.pos) + ' left' : 'In progress'}</span>`;
  if (p?.dur) return `<span class="ep-status">${fmtSpan(p.dur)}</span>`;
  return '';
}

function rowHTML(ep, { withYear = false, withEra = false } = {}) {
  const p = S.prog[ep.id];
  const pct = p && !p.done && p.dur ? Math.min(100, (p.pos / p.dur) * 100) : 0;
  const isCur = S.current === ep.id;
  const playing = isCur && !audio.paused;
  const title = withYear ? shortDate(ep.date) : dayTitle(ep.date);
  const badges = [
    isFav(ep.id) ? `<span class="ep-fav" title="Favorite">${ICON.heartFill}</span>` : '',
    withEra ? `<span class="badge era" style="--era:${eraColor(ep.era)}">${esc(ep.era)}</span>` : '',
    ep.label ? `<span class="badge">${esc(ep.label)}</span>` : '',
    ep.note ? `<span class="badge">${esc(ep.note)}</span>` : '',
  ].join('');
  return `<li class="ep${p?.done ? ' done' : ''}${isCur ? ' current' : ''}" data-id="${ep.id}">
    <button class="ep-main" data-act="row" aria-label="${esc((playing ? 'Pause ' : 'Play ') + longDate(ep.date))}">
      <span class="ep-date">${playing ? '<span class="eq"><i></i><i></i><i></i></span>' : `<b>${+ep.date.slice(8)}</b>`}<small>${fmtDate(ep.date, { month: 'short' })}</small></span>
      <span class="ep-body">
        <span class="ep-title">${esc(title)}</span>
        <span class="ep-meta">${badges}${statusHTML(ep)}</span>
        ${pct ? `<span class="ep-bar"><i style="width:${pct.toFixed(1)}%"></i></span>` : ''}
      </span>
    </button>
    <button class="ep-more" data-act="more" aria-label="More options">${ICON.more}</button>
  </li>`;
}

function clipRowHTML(c, { withFolder = false } = {}) {
  const p = S.prog[c.id];
  const pct = p && !p.done && p.dur ? Math.min(100, (p.pos / p.dur) * 100) : 0;
  const isCur = S.current === c.id;
  const playing = isCur && !audio.paused;
  const meta = [
    isFav(c.id) ? `<span class="ep-fav" title="Favorite">${ICON.heartFill}</span>` : '',
    c.date ? `<span>${clipDate(c.date)}</span>` : '',
    withFolder ? `<span class="clip-folder">${esc(folderLabel(c.fi))}</span>` : '',
    statusHTML(c),
  ].join('');
  return `<li class="ep clip${p?.done ? ' done' : ''}${isCur ? ' current' : ''}" data-id="${c.id}">
    <button class="ep-main" data-act="row" aria-label="${esc((playing ? 'Pause ' : 'Play ') + c.title)}">
      <span class="ep-date clip-ico">${playing ? '<span class="eq"><i></i><i></i><i></i></span>' : ICON.wave}</span>
      <span class="ep-body">
        <span class="ep-title">${esc(c.title)}</span>
        <span class="ep-meta">${meta}</span>
        ${pct ? `<span class="ep-bar"><i style="width:${pct.toFixed(1)}%"></i></span>` : ''}
      </span>
    </button>
    <button class="ep-more" data-act="more" aria-label="More options">${ICON.more}</button>
  </li>`;
}
// Shows and clips in one list (Continue listening, Favorites).
const itemRowHTML = (it, opts = {}) => (isClip(it) ? clipRowHTML(it, { withFolder: true }) : rowHTML(it, opts));

// Re-render rows in place (cheap) when play state or progress changes.
function refreshRows() {
  for (const li of $$('.ep[data-id]')) {
    if (li.classList.contains('swiping')) continue; // mid-swipe: don't yank the row out from under the finger
    const it = itemOf(li.dataset.id);
    if (!it) continue;
    const tmp = document.createElement('template');
    tmp.innerHTML = (isClip(it)
      ? clipRowHTML(it, { withFolder: li.closest('[data-with-folder]') != null || li.closest('[data-with-era]') != null })
      : rowHTML(it, { withYear: li.closest('[data-with-year]') != null, withEra: li.closest('[data-with-era]') != null })).trim();
    li.replaceWith(tmp.content.firstChild);
  }
}

function artHTML(ep, big = false) {
  if (!ep) return '';
  if (isClip(ep)) {
    const top = C.folders[ep.fi].path[0];
    return big
      ? `<span class="clip-art-ico">${ICON.wave}</span><span class="art-date">${esc(top ? cleanName(top) : 'Clips')}</span>`
      : `<span class="clip-art-ico">${ICON.wave}</span>`;
  }
  const d = asDate(ep.date);
  const mon = MONTH_NAMES[d.getUTCMonth()].slice(0, 3);
  if (eraLogo(ep.era)) {
    return big
      ? `${logoImg(ep.era, 'art-logo')}<span class="art-date">${mon} ${d.getUTCDate()}, ${d.getUTCFullYear()}</span>`
      : logoImg(ep.era, 'art-logo');
  }
  return big
    ? `<span class="m">${mon}</span><span class="d">${d.getUTCDate()}</span><span class="y">${d.getUTCFullYear()}</span>`
    : `<b>${d.getUTCDate()}</b><small>${mon} ${String(d.getUTCFullYear()).slice(2)}</small>`;
}

function renderPlayer() {
  const ep = currentEp();
  const bar = $('#player');
  if (!ep) { bar.hidden = true; return; }
  bar.hidden = false;
  const clip = isClip(ep);
  const color = clip ? 'var(--accent)' : eraColor(ep.era);
  const sub = clip
    ? [folderLabel(ep.fi), ep.date && clipDate(ep.date)].filter(Boolean).join(' · ')
    : [ep.era, ep.label, ep.note].filter(Boolean).join(' · ');
  bar.style.setProperty('--era', color);
  const hasLogo = !clip && !!eraLogo(ep.era);
  const hasPhoto = hasLogo && !!eraLogo(ep.era).photo;
  for (const el of [$('.pb-art', bar), $('.np-art')]) {
    el.classList.toggle('has-logo', hasLogo);
    el.classList.toggle('has-photo', hasPhoto);
    el.classList.toggle('is-clip', clip);
  }
  $('.pb-art', bar).innerHTML = artHTML(ep);
  $('.pb-title', bar).textContent = itemTitle(ep);
  $('.pb-meta', bar).textContent = sub;
  const playing = !audio.paused;
  for (const b of $$('[data-act="toggle"]')) {
    b.innerHTML = playing ? ICON.pause : ICON.play;
    b.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  }
  const sheet = $('#sheet');
  sheet.style.setProperty('--era', color);
  $('.sheet-era', sheet).textContent = clip ? 'Clip' : ep.era;
  $('.np-art', sheet).innerHTML = artHTML(ep, true);
  $('.np-title', sheet).textContent = itemTitle(ep);
  $('.np-sub', sheet).textContent = clip ? sub : [ep.label, ep.note].filter(Boolean).join(' · ');
  $('[data-act="goto-year"]', sheet).textContent = clip ? 'Open folder' : `All shows from ${ep.date.slice(0, 4)}`;
  // Link between a show and the clips cut from it, in either direction.
  const rel = $('[data-act="related"]', sheet);
  const fullShow = clip && ep.date && S.epByDate?.get(ep.date);
  rel.hidden = clip ? !fullShow : false;
  rel.textContent = clip ? 'Play the full show from that day' : 'Clips from this day';
  const favBtn = $('.fav-btn', sheet);
  favBtn.innerHTML = isFav(ep.id) ? ICON.heartFill : ICON.heart;
  favBtn.classList.toggle('on', isFav(ep.id));
  favBtn.setAttribute('aria-label', isFav(ep.id) ? 'Remove from favorites' : 'Add to favorites');
  $('[data-act="speed"]', sheet).textContent = `${S.settings.rate}× speed`;
  const sl = $('[data-act="sleep"]', sheet);
  sl.classList.toggle('on', !!S.sleep);
  sl.textContent = !S.sleep ? 'Sleep timer'
    : S.sleep.mode === 'end' ? (clip ? 'Sleep: end of clip' : 'Sleep: end of show')
      : `Sleep: ${Math.max(1, Math.ceil((S.sleep.until - Date.now()) / 60000))} min`;
  renderProgress();
}

let seeking = false;
function renderProgress() {
  const ep = currentEp();
  if (!ep) return;
  const p = S.prog[ep.id];
  const d = Number.isFinite(audio.duration) ? audio.duration : p?.dur || 0;
  const t = pendingSeek ?? (audio.readyState ? audio.currentTime : p?.pos || 0);
  const pct = d ? Math.min(100, (t / d) * 100) : 0;
  $('.pb-progress i').style.width = pct + '%';
  if (!seeking) $('.np-seek').value = d ? Math.round((t / d) * 1000) : 0;
  $('.t-cur').textContent = fmtClock(t);
  $('.t-left').textContent = d ? '-' + fmtClock(d - t) : '--:--';
  $('.pb-time').textContent = d ? `${fmtClock(t)} / ${fmtClock(d)}` : fmtClock(t);
}

// ---------- views ----------
let lastRoute = '';
const scrollMemory = new Map();

function route() {
  const hash = location.hash || '#/';
  if (lastRoute) scrollMemory.set(lastRoute, window.scrollY);
  const changed = hash !== lastRoute;
  lastRoute = hash;
  if (!S.key) return renderSetup();
  if (!S.eps.length) { view().innerHTML = '<p class="loading">Loading shows…</p>'; return; }
  const parts = hash.slice(2).split('/');
  if (parts[0] !== 'search' && document.activeElement !== $('#top-q')) $('#top-q').value = '';
  for (const a of $$('.tabs a')) a.classList.toggle('on', a.dataset.tab === (parts[0] === 'clips' ? 'clips' : parts[0] ? '' : 'shows'));
  if (parts[0] === 'clips') {
    if (!C.loaded) {
      view().innerHTML = '<p class="loading">Loading 65,000 clips…</p>';
      loadClips().then(() => { if ((location.hash || '#/') === hash) { lastRoute = ''; route(); } })
        .catch((err) => { view().innerHTML = `<p class="loading">${esc(err.message)}. Check your connection and try again.</p>`; });
      return;
    }
    if (parts[1] === 'f') renderFolder(decodeURIComponent(parts.slice(2).join('/')));
    else if (parts[1] === 'day') renderDayClips(parts[2]);
    else renderClipsHome();
  } else if (parts[0] === 'search') renderSearch();
  else if (parts[0] === 'year' && S.years.has(+parts[1])) renderYear(+parts[1], parts[2]);
  else if (parts[0] === 'favorites') renderFavorites();
  else if (parts[0] === 'settings') renderSettings();
  else renderHome();
  if (changed && !(parts[0] === 'year' && parts[2])) window.scrollTo(0, scrollMemory.get(hash) || 0);
}
function refreshView() {
  const y = window.scrollY;
  route();
  window.scrollTo(0, y);
  renderPlayer();
}

function continueList() {
  return Object.entries(S.prog)
    .filter(([id, p]) => !p.done && p.pos > 10 && itemOf(id))
    .sort((a, b) => b[1].updated - a[1].updated)
    .slice(0, 8)
    .map(([id]) => itemOf(id));
}

function specialsHTML() {
  return SPECIALS.map((s) => {
    const f = C.loaded ? C.byPath.get(s.path) : null;
    if (C.loaded && !f) return '';
    return `<a class="special" style="--c:${s.color}" href="#/clips/f/${encodeURIComponent(s.path)}">
      <span class="special-ico">${ICON.wave}</span>
      <b>${esc(s.title)}</b><small>${esc(s.sub)}${f ? ` · ${f.total.toLocaleString()} clips` : ''}</small></a>`;
  }).join('');
}

function renderHome() {
  const cont = continueList();
  const favs = favoriteEps().sort((a, b) => b.added - a.added);

  const eras = S.eras.map(({ name, years }) => {
    const total = years.reduce((n, Y) => n + Y.eps.length, 0);
    const span = years.length > 1 ? `${years.at(-1).year}–${years[0].year}` : `${years[0].year}`;
    const logo = logoImg(name, 'era-logo');
    return `<div class="era-block" style="--era:${eraColor(name)}">
      <div class="era-head${logo ? ' with-logo' : ''}">${logo || '<span class="era-dot"></span>'}
        <div><h3>${esc(name)}</h3><small>${span} · ${total.toLocaleString()} shows</small></div></div>
      <div class="years">${years.map((Y) => {
        const played = Y.eps.filter((e) => S.prog[e.id]?.done).length;
        return `<a class="year" href="#/year/${Y.year}"><b>${Y.year}</b><small>${Y.eps.length} shows${played ? ` · ${played} played` : ''}</small>
          <span class="bar"><i style="width:${((played / Y.eps.length) * 100).toFixed(1)}%"></i></span></a>`;
      }).join('')}</div></div>`;
  }).join('');

  view().innerHTML = `
    ${cont.length ? `<section class="section"><h2>Continue listening</h2>
      <ul class="eps" data-swipe data-with-year data-with-era>${cont.map((e) => itemRowHTML(e, { withYear: true, withEra: true })).join('')}</ul></section>` : ''}
    ${favs.length ? `<section class="section"><h2>Favorites
        ${favs.length > 5 ? `<a class="section-link" href="#/favorites">See all ${favs.length}</a>` : ''}</h2>
      <ul class="eps" data-with-year data-with-era>${favs.slice(0, 5).map(({ ep }) => itemRowHTML(ep, { withYear: true, withEra: true })).join('')}</ul></section>` : ''}
    <section class="section">
      <h2>All shows <button class="section-link" data-act="random">Random show</button></h2>
      ${eras}
    </section>
    <section class="section">
      <h2>Specials <a class="section-link" href="#/clips">All clips</a></h2>
      <div class="specials shelf">${specialsHTML()}</div>
    </section>`;
}

function renderYear(year, focusId) {
  const Y = S.years.get(year);
  const years = [...S.years.keys()].sort((a, b) => a - b);
  const i = years.indexOf(year);
  const prevY = years[i - 1], nextY = years[i + 1];
  const played = Y.eps.filter((e) => S.prog[e.id]?.done).length;
  const next = Y.eps.find((e) => !S.prog[e.id]?.done);
  const nextP = next && S.prog[next.id];
  const months = new Map();
  for (const e of Y.eps) {
    const m = +e.date.slice(5, 7);
    if (!months.has(m)) months.set(m, []);
    months.get(m).push(e);
  }
  view().innerHTML = `
    <div class="year-head" style="--era:${eraColor(Y.era)}">
      <div class="year-title">
        ${logoImg(Y.era, 'year-logo')}
        <div>
          <span class="badge era" style="--era:${eraColor(Y.era)}">${esc(Y.era)}</span>
          <h1>${year}</h1>
          <p>${Y.eps.length} shows · ${played} played</p>
        </div>
      </div>
      <div class="year-nav">
        ${prevY ? `<a class="icon" href="#/year/${prevY}" aria-label="${prevY}" title="${prevY}">${ICON.left}</a>` : ''}
        ${nextY ? `<a class="icon" href="#/year/${nextY}" aria-label="${nextY}" title="${nextY}">${ICON.right}</a>` : ''}
        ${next ? `<button class="btn primary" data-act="play-id" data-id="${next.id}">${ICON.play}${nextP?.pos > 0 ? 'Resume' : 'Play'} ${fmtDate(next.date, { month: 'short', day: 'numeric' })}</button>` : ''}
      </div>
    </div>
    ${[...months].map(([m, eps]) => `<section class="month"><h3>${MONTH_NAMES[m - 1]}</h3>
      <ul class="eps">${eps.map((e) => rowHTML(e)).join('')}</ul></section>`).join('')}`;
  if (focusId) {
    const li = $(`.ep[data-id="${CSS.escape(focusId)}"]`);
    if (li) {
      requestAnimationFrame(() => {
        li.scrollIntoView({ block: 'center' });
        li.classList.add('flash');
      });
    }
  }
}

function renderFavorites() {
  const favs = favoriteEps().sort((a, b) => ((a.ep.date || '') < (b.ep.date || '') ? 1 : -1));
  const shows = favs.filter(({ ep }) => !isClip(ep));
  const clips = favs.filter(({ ep }) => isClip(ep));
  const hiddenClips = !C.loaded && Object.entries(S.favs).some(([id, f]) => isClipId(id) && f.fav === 1);
  if (hiddenClips) loadClips().then(() => { if (location.hash === '#/favorites') refreshView(); }).catch(() => {});
  view().innerHTML = `
    <div class="year-head"><div><h1 style="font-size:32px">Favorites</h1>
      <p>${shows.length} show${shows.length === 1 ? '' : 's'}${clips.length ? ` · ${clips.length} clip${clips.length === 1 ? '' : 's'}` : ''}, newest first</p></div></div>
    ${shows.length ? `<ul class="eps" data-with-year data-with-era>${shows.map(({ ep }) => rowHTML(ep, { withYear: true, withEra: true })).join('')}</ul>` : ''}
    ${clips.length ? `<section class="section"><h2>Clips</h2><ul class="eps" data-with-folder>${clips.map(({ ep }) => clipRowHTML(ep, { withFolder: true })).join('')}</ul></section>` : ''}
    ${!favs.length && !hiddenClips ? '<p class="empty">No favorites yet. Tap the heart in the player, or ⋯ on any show or clip, to save it here.</p>' : ''}`;
}

// ---------- clip views ----------
const PAGE = 200;
const clipListState = { key: '', shown: PAGE };

function clipListHTML(clips, key, { withFolder = false } = {}) {
  if (clipListState.key !== key) { clipListState.key = key; clipListState.shown = PAGE; }
  const shown = clips.slice(0, clipListState.shown);
  return `<ul class="eps"${withFolder ? ' data-with-folder' : ''}>${shown.map((c) => clipRowHTML(c, { withFolder })).join('')}</ul>
    ${clips.length > shown.length ? `<button class="btn more-rows" data-act="more-rows">Show more (${(clips.length - shown.length).toLocaleString()} left)</button>` : ''}`;
}

function folderRowsHTML(folders) {
  return `<div class="folders">${folders.map((f) => `<a class="folder-row" href="${folderHash(f)}">
      <span class="folder-ico">${ICON.folder}</span><span class="folder-name">${esc(f.title)}</span>
      <small>${f.total.toLocaleString()}</small>${ICON.right}</a>`).join('')}</div>`;
}

function renderClipsHome() {
  const top = C.folders[0];
  const cats = top.subs.slice().sort((a, b) => a.title.localeCompare(b.title));
  view().innerHTML = `
    <div class="year-head"><div><h1 style="font-size:32px">Clips &amp; Specials</h1>
      <p>${C.list.length.toLocaleString()} clips in ${cats.length} categories · <a class="section-link" href="#/search">Search</a></p></div></div>
    <section class="section"><h2>Specials</h2><div class="specials grid">${specialsHTML()}</div></section>
    <section class="section"><h2>All categories</h2>${folderRowsHTML(cats)}
      ${top.files.length ? folderRowsHTML([top]) : ''}</section>`;
}

// ---------- search view ----------
let searchQuery = '';
let showsShown = 30;
const SEARCH_EXAMPLES = ["Bean's final show", 'June 7 2017', 'Party Machine', 'Christmas', 'Kimmel', 'Jed the Fish', '2008'];

// The search field lives in the top bar; #/search just shows its results.
function renderSearch() {
  const input = $('#top-q');
  if (document.activeElement !== input) input.value = searchQuery;
  view().innerHTML = '<div id="search-results"></div>';
  if (!C.loaded) loadClips().then(() => { if (location.hash === '#/search') renderSearchResults(); }).catch(() => {});
  renderSearchResults();
}
{
  const input = $('#top-q');
  let t;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      searchQuery = input.value;
      showsShown = 30;
      if (location.hash !== '#/search') location.hash = '#/search';
      else renderSearchResults();
    }, 180);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur(); // closes the phone keyboard
    if (e.key === 'Escape') { input.value = ''; searchQuery = ''; input.blur(); if (location.hash === '#/search') renderSearchResults(); }
  });
}

function renderSearchResults() {
  const box = $('#search-results');
  if (!box) return;
  const q = searchQuery.trim();
  if (!q) {
    box.innerHTML = `<p class="search-hint">Search by date (<i>June 7 2017</i>, <i>6/7/17</i>, <i>June 2017</i>, <i>2008</i>) or by words in show and clip titles.</p>
      <div class="np-extras start">${SEARCH_EXAMPLES.map((x) => `<button class="chip" data-act="search-example" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>`;
    return;
  }
  const r = runSearch(q);
  const parts = [];
  if (r.dq) {
    const y = r.dq.year || (r.dq.date && +r.dq.date.slice(0, 4));
    const yearLink = y && S.years.has(y) && r.dq.kind !== 'monthday'
      ? `<a class="btn small" href="#/year/${y}${r.shows.length && r.dq.kind !== 'year' ? '/' + r.shows.at(-1).id : ''}">Open ${y}</a>` : '';
    let nearest = '';
    if (r.dq.kind === 'day' && !r.shows.length) {
      const ep = S.eps.find((e) => e.date >= r.dq.date) || S.eps.at(-1);
      nearest = `<p class="search-hint">No show on that day. Nearest: <a class="section-link" href="#/year/${ep.date.slice(0, 4)}/${ep.id}">${esc(shortDate(ep.date))}</a></p>`;
    }
    parts.push(`<div class="search-date"><span>Date: <b>${esc(r.dq.label)}</b>${r.words.length ? ` + “${esc(r.words.join(' '))}”` : ''}</span>${yearLink}</div>${nearest}`);
  }
  if (r.shows.length) {
    const shown = r.shows.slice(0, showsShown);
    parts.push(`<section class="section"><h2>Shows <small>${r.shows.length.toLocaleString()}</small></h2>
      <ul class="eps" data-with-year data-with-era>${shown.map((e) => rowHTML(e, { withYear: true, withEra: true })).join('')}</ul>
      ${r.shows.length > shown.length ? `<button class="btn more-rows" data-act="more-shows">Show more (${(r.shows.length - shown.length).toLocaleString()} left)</button>` : ''}</section>`);
  }
  if (r.folders.length) parts.push(`<section class="section"><h2>Folders</h2>${folderRowsHTML(r.folders)}</section>`);
  if (!C.loaded) parts.push('<p class="loading">Searching clips…</p>');
  else if (r.clips.length) {
    parts.push(`<section class="section"><h2>Clips <small>${r.clips.length.toLocaleString()}, newest first</small></h2>
      ${clipListHTML(r.clips, 'q:' + q, { withFolder: true })}</section>`);
  }
  if (C.loaded && !r.shows.length && !r.clips.length && !r.folders.length) {
    parts.push('<p class="empty">Nothing matches. Try fewer words, or a different spelling.</p>');
  }
  box.innerHTML = parts.join('');
}

function crumbsHTML(f) {
  const out = ['<a href="#/clips">Clips</a>'];
  for (let i = 1; i < f.path.length; i++) {
    const anc = C.byPath.get(f.path.slice(0, i).join('/'));
    if (anc) out.push(`<a href="${folderHash(anc)}">${esc(anc.title)}</a>`);
  }
  return `<nav class="crumbs">${out.join('<span>›</span>')}</nav>`;
}

function renderFolder(path) {
  const f = C.byPath.get(path);
  if (!f) { view().innerHTML = '<p class="empty">That folder is no longer in the archive.</p>'; return; }
  const special = SPECIALS.find((s) => s.path === path);
  const next = f.files.find((c) => !S.prog[c.id]?.done);
  view().innerHTML = `
    ${crumbsHTML(f)}
    <div class="year-head folder-head" style="--c:${special?.color || 'var(--accent)'}">
      <div><h1>${esc(special?.title || f.title)}</h1>
        <p>${f.total.toLocaleString()} clip${f.total === 1 ? '' : 's'}${f.subs.length ? ` · ${f.subs.length} folder${f.subs.length === 1 ? '' : 's'}` : ''}</p></div>
      ${next ? `<div class="year-nav"><button class="btn primary" data-act="play-id" data-id="${next.id}">${ICON.play}${next === f.files[0] ? 'Play all' : 'Continue'}</button></div>` : ''}
    </div>
    ${f.subs.length ? `<section class="section">${folderRowsHTML(f.subs)}</section>` : ''}
    ${f.files.length ? `<section class="section">${clipListHTML(f.files, 'f:' + path)}</section>` : ''}`;
}

function renderDayClips(date) {
  const clips = C.byDate.get(date) || [];
  const ep = S.epByDate?.get(date);
  view().innerHTML = `
    <nav class="crumbs"><a href="#/clips">Clips</a></nav>
    <div class="year-head"><div><h1 style="font-size:28px">${esc(longDate(date))}</h1>
      <p>${clips.length} clip${clips.length === 1 ? '' : 's'} from this day</p></div>
      ${ep ? `<div class="year-nav"><button class="btn primary" data-act="play-id" data-id="${ep.id}">${ICON.play}Play the full show</button></div>` : ''}
    </div>
    ${clips.length ? clipListHTML(clips, 'd:' + date, { withFolder: true }) : '<p class="empty">No clips are filed under this date.</p>'}`;
}

function renderSettings() {
  const pending = S.dirty.size;
  const syncText = {
    idle: 'Not synced yet', ok: 'Up to date', offline: "Can't reach the server; changes are saved on this device",
    auth: 'Passphrase not accepted',
  }[S.syncState];
  const listened = Object.values(S.prog).filter((p) => p.done).length;
  const started = Object.values(S.prog).filter((p) => !p.done && p.pos > 0).length;
  view().innerHTML = `
    <div class="year-head"><div><h1 style="font-size:32px">Settings</h1></div></div>
    <div class="card">
      <h3>Sync</h3>
      <dl class="kv">
        <dt>Status</dt><dd>${esc(syncText)}${pending ? ` (${pending} change${pending > 1 ? 's' : ''} waiting)` : ''}</dd>
        <dt>Last synced</dt><dd>${esc(ago(Math.max(S.lastPull, S.lastPush)))}</dd>
        <dt>Your listening</dt><dd>${listened} played · ${started} in progress · ${favoriteEps().length} favorites</dd>
      </dl>
      <div class="row"><button class="btn small" data-act="sync-now">Sync now</button></div>
    </div>
    <div class="card">
      <h3>Shows</h3>
      <dl class="kv" id="cat-status">
        <dt>Shows</dt><dd>${S.eps.length.toLocaleString()} (${esc(shortDate(S.eps[0].date))} to ${esc(shortDate(S.eps.at(-1).date))})</dd>
        <dt>Last check</dt><dd>…</dd>
      </dl>
      <p>New shows are picked up automatically once a week (Saturday mornings).</p>
      <div class="row"><button class="btn small" data-act="refresh-catalog">Check for new shows now</button></div>
    </div>
    <div class="card">
      <h3>Playback</h3>
      <label class="toggle">Play the next show automatically when one ends
        <input type="checkbox" data-setting="autoplay" ${S.settings.autoplay ? 'checked' : ''}></label>
    </div>
    <div class="card">
      <h3>This device</h3>
      <p>Your progress is stored on this device and synced to your server.</p>
      <div class="row"><button class="btn small" data-act="forget">Disconnect this device</button></div>
    </div>`;
  api('/api/status').then((r) => r.json()).then((s) => {
    const el = $('#cat-status');
    if (!el || !s) return;
    const lc = s.lastCheck;
    const when = lc?.checked ? new Date(lc.checked).toLocaleString() : 'not yet';
    const what = !lc ? '' : lc.error ? ` (problem: ${lc.error})` : lc.added?.length ? ` (${lc.added.length} new)` : ' (nothing new)';
    el.lastElementChild.textContent = when + what;
  }).catch(() => {});
}

function renderSetup(message = '') {
  $('#player').hidden = true;
  view().innerHTML = `
    <form class="setup" id="setup">
      <img src="/logo.png" alt="Kevin &amp; Bean">
      <h1>Kevin &amp; Bean Archive</h1>
      <p>Enter your passphrase to connect this device.</p>
      <input class="field" name="key" type="password" autocomplete="current-password" placeholder="Passphrase" autofocus required>
      <button class="btn primary" type="submit">Connect</button>
      <div class="err">${esc(message)}</div>
    </form>`;
  $('#setup').addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = e.target.key.value.trim();
    const err = $('.err', e.target);
    err.textContent = '';
    S.key = key;
    try {
      const r = await api('/api/ping');
      if (!r.ok) throw new Error('Server error ' + r.status);
      store.set('key', key);
      boot();
    } catch (ex) {
      S.key = '';
      err.textContent = ex.code === 401 ? "That passphrase didn't work." : "Couldn't reach the server. Check your connection.";
    }
  });
}

// ---------- menus ----------
function openMenu(title, sub, items) {
  const m = $('#menu');
  $('.menu-panel', m).innerHTML = `<div class="menu-head"><div class="menu-title">${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>
      <button class="menu-close" data-menu="close" aria-label="Close">${ICON.close}</button></div>` +
    items.map((it, i) => `<button data-menu="${i}">${esc(it.label)}</button>`).join('');
  m.hidden = false;
  m.onclick = (e) => {
    const b = e.target.closest('[data-menu]');
    if (!b && e.target !== m) return;
    m.hidden = true;
    if (b && b.dataset.menu !== 'close') items[+b.dataset.menu].run();
  };
}

// Forget the resume point so it drops off Continue listening (synced to other devices).
function removeFromContinue(id) {
  const prev = S.prog[id] ? { ...S.prog[id] } : null;
  if (id === S.current) {
    // Rewind first, so the pause handler's savePosition() doesn't write the old position back.
    seekTo(0);
    audio.pause();
  }
  setProgress(id, { pos: 0, done: 0 });
  saveLocal();
  push();
  refreshView();
  toast('Removed from Continue listening', prev && {
    label: 'Undo',
    run: () => {
      setProgress(id, { pos: prev.pos, dur: prev.dur, done: prev.done });
      if (id === S.current) seekTo(prev.pos);
      saveLocal();
      push();
      refreshView();
    },
  });
}

// ---------- swipe left to remove (Continue listening, touch only) ----------
let sw = null;
let swipedAt = 0;
document.addEventListener('touchstart', (e) => {
  const li = e.touches.length === 1 && e.target.closest('[data-swipe] .ep[data-id]');
  if (!li || li.classList.contains('swiping')) { sw = null; return; }
  const t = e.touches[0];
  sw = { li, x: t.clientX, y: t.clientY, t: Date.now(), dx: 0, active: false, dead: false };
}, { passive: true });
document.addEventListener('touchmove', (e) => {
  if (!sw || sw.dead) return;
  const t = e.touches[0];
  const dx = t.clientX - sw.x;
  const dy = t.clientY - sw.y;
  if (!sw.active) {
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    // Mostly vertical = scrolling; rightward = not ours. Either way, leave it alone.
    if (Math.abs(dy) >= Math.abs(dx) || dx > 0) { sw.dead = true; return; }
    sw.active = true;
    sw.li.classList.add('swiping');
  }
  e.preventDefault();
  sw.dx = Math.min(0, dx);
  sw.li.style.setProperty('--dx', sw.dx + 'px');
}, { passive: false });
function endSwipe() {
  if (!sw) return;
  const { li, dx, active, t } = sw;
  sw = null;
  if (!active) return;
  swipedAt = Date.now();
  const w = li.offsetWidth;
  const fling = dx < -50 && Date.now() - t < 250;
  li.classList.add('settling');
  if (dx < -Math.min(120, w * 0.35) || fling) {
    li.style.setProperty('--dx', -w + 'px');
    li.style.height = li.offsetHeight + 'px';
    setTimeout(() => { li.classList.add('collapsing'); li.style.height = '0px'; }, 180);
    setTimeout(() => removeFromContinue(li.dataset.id), 400);
  } else {
    li.style.setProperty('--dx', '0px');
    setTimeout(() => li.classList.remove('swiping', 'settling'), 200);
  }
}
document.addEventListener('touchend', endSwipe);
document.addEventListener('touchcancel', endSwipe);
// A swipe shouldn't also count as a tap on the row.
document.addEventListener('click', (e) => {
  if (Date.now() - swipedAt < 400 && e.target.closest('.ep')) { e.stopPropagation(); e.preventDefault(); }
}, true);

function episodeMenu(id) {
  const ep = itemOf(id);
  if (!ep) return;
  const clip = isClip(ep);
  const p = S.prog[id];
  const items = [];
  if (p && p.pos > 0 && !p.done) items.push({ label: `Resume at ${fmtClock(p.pos)}`, run: () => loadEpisode(id) });
  if (p && p.pos > 10 && !p.done) items.push({ label: 'Remove from Continue listening', run: () => removeFromContinue(id) });
  items.push({ label: isFav(id) ? 'Remove from favorites' : 'Add to favorites', run: () => toggleFav(id) });
  if (clip) {
    const f = C.folders[ep.fi];
    if (location.hash !== folderHash(f)) items.push({ label: `Open folder: ${f.title}`, run: () => { location.hash = folderHash(f); } });
    const show = ep.date && S.epByDate?.get(ep.date);
    if (show) items.push({ label: `Play the full show from ${clipDate(ep.date)}`, run: () => loadEpisode(show.id) });
    openMenu(ep.title, [folderLabel(ep.fi), ep.date && clipDate(ep.date)].filter(Boolean).join(' · '), items);
    return;
  }
  openMenu(longDate(ep.date), [ep.era, ep.label, ep.note].filter(Boolean).join(' · '), items);
}

// ---------- events ----------
const SPEEDS = [1, 1.1, 1.25, 1.5, 1.75, 2, 0.9];
const SLEEPS = [null, 15, 30, 45, 60, 'end'];

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const li = el.closest('.ep');
  switch (act) {
    case 'row': {
      const id = li.dataset.id;
      if (S.current === id && audio.currentSrc) toggle();
      else loadEpisode(id);
      break;
    }
    case 'more': episodeMenu(li.dataset.id); break;
    case 'play-id': loadEpisode(el.dataset.id); break;
    case 'toggle': toggle(); break;
    case 'back': skip(-15); break;
    case 'fwd': skip(30); break;
    case 'prev': playAdjacent(-1); break;
    case 'next': playAdjacent(1); break;
    case 'open-sheet': $('#sheet').hidden = false; renderPlayer(); break;
    case 'close-sheet': $('#sheet').hidden = true; break;
    case 'sheet-more': if (S.current) episodeMenu(S.current); break;
    case 'fav-current': if (S.current) toggleFav(S.current); break;
    case 'mute': toggleMute(); break;
    case 'goto-year': {
      $('#sheet').hidden = true;
      const ep = currentEp();
      if (isClip(ep)) location.hash = folderHash(C.folders[ep.fi]);
      else if (ep) location.hash = `#/year/${ep.date.slice(0, 4)}/${ep.id}`;
      break;
    }
    case 'related': {
      const ep = currentEp();
      if (!ep) break;
      if (isClip(ep)) {
        const show = ep.date && S.epByDate?.get(ep.date);
        if (show) loadEpisode(show.id);
      } else {
        $('#sheet').hidden = true;
        location.hash = `#/clips/day/${ep.date}`;
      }
      break;
    }
    case 'more-rows': {
      clipListState.shown += PAGE;
      if (location.hash === '#/search') renderSearchResults(); else refreshView();
      break;
    }
    case 'more-shows': showsShown += 100; renderSearchResults(); break;
    case 'search-example': {
      searchQuery = el.dataset.q;
      showsShown = 30;
      $('#top-q').value = searchQuery;
      renderSearchResults();
      break;
    }
    case 'speed': {
      const i = SPEEDS.indexOf(S.settings.rate);
      S.settings.rate = SPEEDS[(i + 1) % SPEEDS.length];
      store.set('settings', S.settings);
      audio.defaultPlaybackRate = audio.playbackRate = S.settings.rate;
      renderPlayer();
      break;
    }
    case 'sleep': {
      const cur = S.sleep ? SLEEPS.indexOf(S.sleep.mode) : 0;
      const mode = SLEEPS[(cur + 1) % SLEEPS.length];
      S.sleep = mode == null ? null : { mode, until: mode === 'end' ? null : Date.now() + mode * 60000 };
      renderPlayer();
      break;
    }
    case 'random': {
      const pool = S.eps.filter((ep) => !S.prog[ep.id]?.done);
      const ep = pool[Math.floor(Math.random() * pool.length)];
      if (ep) { loadEpisode(ep.id); $('#sheet').hidden = false; }
      break;
    }
    case 'sync-now': syncNow().then(() => toast(S.syncState === 'ok' ? 'Synced' : 'Sync failed')); break;
    case 'refresh-catalog': {
      el.disabled = true;
      el.textContent = 'Checking…';
      api('/api/refresh', { method: 'POST' })
        .then((r) => r.json())
        .then(async (s) => {
          if (s.error) throw new Error(s.error);
          await loadCatalog();
          toast(s.added?.length ? `${s.added.length} new show${s.added.length > 1 ? 's' : ''} added` : 'No new shows');
        })
        .catch((err) => toast(err.message || 'Check failed'))
        .finally(() => refreshView());
      break;
    }
    case 'forget': {
      if (!confirm('Disconnect this device? Progress already synced stays on your server.')) break;
      push().finally(() => {
        for (const k of ['key', 'prog', 'dirty', 'favs', 'dirtyFavs', 'cursor', 'current', 'catalog', 'catalogTag', 'lastPush']) store.del(k);
        location.hash = '#/';
        location.reload();
      });
      break;
    }
  }
});

document.addEventListener('change', (e) => {
  const k = e.target.dataset?.setting;
  if (k) { S.settings[k] = e.target.checked; store.set('settings', S.settings); }
});

$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') e.target.hidden = true; });

document.addEventListener('input', (e) => {
  if (e.target.classList?.contains('vol')) setVolume(e.target.value / 100);
});

const seekEl = $('.np-seek');
seekEl.addEventListener('input', () => {
  seeking = true;
  const d = Number.isFinite(audio.duration) ? audio.duration : S.prog[S.current]?.dur || 0;
  const t = (seekEl.value / 1000) * d;
  $('.t-cur').textContent = fmtClock(t);
  $('.t-left').textContent = '-' + fmtClock(d - t);
});
seekEl.addEventListener('change', () => {
  seeking = false;
  const d = Number.isFinite(audio.duration) ? audio.duration : S.prog[S.current]?.dur || 0;
  if (d) seekTo((seekEl.value / 1000) * d);
});

document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape') { $('#sheet').hidden = true; $('#menu').hidden = true; return; }
  if (!S.current) return;
  if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
  else if (e.key === 'ArrowLeft' || e.key === 'j') { e.preventDefault(); skip(-15); }
  else if (e.key === 'ArrowRight' || e.key === 'l') { e.preventDefault(); skip(30); }
  else if (VOLUME_OK && e.key === 'ArrowUp') { e.preventDefault(); setVolume((S.settings.muted ? 0 : S.settings.volume) + 0.05); }
  else if (VOLUME_OK && e.key === 'ArrowDown') { e.preventDefault(); setVolume((S.settings.muted ? 0 : S.settings.volume) - 0.05); }
  else if (VOLUME_OK && e.key === 'm') { e.preventDefault(); toggleMute(); }
});

window.addEventListener('hashchange', () => { $('#sheet').hidden = true; route(); });

// Leaving the app: save and sync now. Coming back: pull what other devices did.
document.addEventListener('visibilitychange', () => {
  if (!S.key) return;
  if (document.visibilityState === 'hidden') {
    savePosition();
    saveLocal();
    push({ keepalive: true });
  } else {
    if (Date.now() - S.lastPull > 10000) syncNow();
    if (Date.now() - S.lastCatalogCheck > 6 * 3600 * 1000) loadCatalog().then((c) => c && refreshView()).catch(() => {});
  }
});
window.addEventListener('pagehide', () => { savePosition(); saveLocal(); push({ keepalive: true }); });
setInterval(() => { if (S.sleep?.until && S.current) renderPlayer(); }, 30000);

// ---------- boot ----------
async function boot() {
  if (!S.key) { route(); return; }
  route(); // shows cached catalog immediately if we have one
  try {
    await loadCatalog();
  } catch (err) {
    if (err.code === 401) { S.key = ''; store.del('key'); renderSetup('That passphrase no longer works.'); return; }
    if (!S.eps.length) { view().innerHTML = `<p class="loading">${esc(err.message || "Couldn't load shows")}. Reload the page to try again.</p>`; return; }
  }
  route();
  await syncNow({ adopt: false });
  // Clips in play, in progress or favorited? The clip list is needed to show them.
  if (hasClipState()) {
    const p = loadClips().catch(() => {});
    if (isClipId(S.current)) await p; else p.then(() => refreshView());
  }
  // Restore the player: the last thing this device played, unless another
  // device has listened to something more recently.
  if (S.current && itemOf(S.current)) loadEpisode(S.current, { autoplay: false });
  adoptLatest();
  refreshView();
}

// Optional one-time setup link: https://…/#key=PASSPHRASE
if (location.hash.startsWith('#key=')) {
  S.key = decodeURIComponent(location.hash.slice(5));
  store.set('key', S.key);
  history.replaceState(null, '', location.pathname);
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
boot();
