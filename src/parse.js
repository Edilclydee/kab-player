// Parser for kevinandbeanarchive.com, a single Word-generated HTML page that
// lists every show as: era heading -> year heading -> month rows of day links.
//
// Dates come from the page structure (year heading + month row + day link
// text), NOT from file names, which are sometimes wrong. When a day links to a
// file named for a different day, `probe` is asked whether a correctly named
// file exists on the server, and that file is used instead.
//
// Shared by the Worker (weekly check, current year only) and by
// scripts/seed-catalog.mjs (full build on this computer).

export const SOURCE = 'https://www.kevinandbeanarchive.com/';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
  'august', 'september', 'october', 'november', 'december'];

// Era headings on the page, newest first.
const ERA_HEADINGS = [
  [/back on KROQ/i, 'Kevin Ryder on KROQ'],
  [/Sluggo/i, 'Kevin & Sluggo'],
  [/^Kevin in the Morning$/i, 'Kevin in the Morning'],
  [/^KEVIN & BEAN$/i, 'Kevin & Bean'],
];

// Tidy names for special shows, matched as lowercase substrings of the file name.
const LABELS = [
  ['party_machine', 'Party Machine'],
  ['bestof', 'Best Of'],
  ['yes_songs', 'With songs'],
  ['all_songs', 'With songs'],
  ['everyone_fired', 'Everyone fired; Kevin says goodbye'],
  ['incomplete', 'Incomplete'],
  ['second-half-of-the-show-only', 'Second half only'],
  ['last_2_hours_only', 'Last 2 hours only'],
  ['jd subs', 'JD subs'],
  ['st_jude_rocks', 'St. Jude Rocks'],
  ['remembering jed the fish', 'Remembering Jed the Fish'],
];

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  ndash: '–', mdash: '—', hellip: '…',
};

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export const norm = (s) => s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

const BREAK_START = new Set(['p', 'br', 'div', 'tr', 'li', 'h1', 'h2', 'h3']);
const BREAK_END = new Set(['p', 'div', 'tr', 'li', 'h1', 'h2', 'h3']);
const SKIP = new Set(['style', 'script', 'xml', 'title']);
const TOKEN = /<!\[[^\]]*\]>|<![^>]*>|<\?[^>]*>|<(\/?)([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)|</g;
const HREF = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

// Yields logical lines (split at <p>/<br>/... boundaries) in document order.
// Each line is an array of {t:'text', s} and {t:'a', href, s} items.
export function* htmlLines(html) {
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  let cur = [];
  let href = null;
  let atext = [];
  let skip = 0;
  const take = () => {
    const line = cur;
    cur = [];
    return line.some((i) => i.t === 'a' || norm(i.s)) ? line : null;
  };
  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(html))) {
    let out = null;
    if (m[2]) {
      const tag = m[2].toLowerCase();
      if (m[1] !== '/') {
        if (SKIP.has(tag)) skip++;
        else if (BREAK_START.has(tag)) { if (href === null) out = take(); }
        else if (tag === 'a') {
          const h = HREF.exec(m[3]);
          if (h) { href = decodeEntities(h[1] ?? h[2] ?? h[3]); atext = []; }
        }
      } else if (SKIP.has(tag)) skip = Math.max(0, skip - 1);
      else if (tag === 'a' && href !== null) {
        cur.push({ t: 'a', href, s: norm(atext.join('')) });
        href = null;
      } else if (BREAK_END.has(tag) && href === null) out = take();
    } else if (!skip && (m[4] !== undefined || m[0] === '<')) {
      const s = m[4] !== undefined ? decodeEntities(m[4]) : '<';
      if (href !== null) atext.push(s);
      else cur.push({ t: 'text', s });
    }
    if (out) yield out;
  }
  const last = take();
  if (last) yield last;
}

const lineText = (line) => norm(line.map((i) => i.s).join(' '));

function isoDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

// 'Nov', 'M ay', or a single letter 'J' (rows run in calendar order) -> 1..12
function monthFromLabel(label, prev, descending) {
  const letters = label.toLowerCase().replace(/[^a-z]/g, '');
  if (!letters) return null;
  if (letters.length >= 3) {
    const i = MONTHS.findIndex((n) => n.startsWith(letters.slice(0, 3)));
    return i >= 0 ? i + 1 : null;
  }
  if (descending) {
    for (let mo = prev - 1; mo >= 1; mo--) if (MONTHS[mo - 1][0] === letters[0]) return mo;
  } else {
    for (let mo = prev + 1; mo <= 12; mo++) if (MONTHS[mo - 1][0] === letters[0]) return mo;
  }
  return null;
}

function filenameDate(fname) {
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(fname);
  if (m) return m[0];
  m = /([A-Za-z]+)_0*(\d{1,3})_(\d{4})/.exec(fname);
  if (m) {
    const mo = MONTHS.indexOf(m[1].toLowerCase());
    if (mo >= 0) return isoDate(+m[3], mo + 1, +m[2]);
  }
  return null;
}

function labelFor(fname) {
  const low = fname.toLowerCase();
  const found = [...new Set(LABELS.filter(([k]) => low.includes(k)).map(([, v]) => v))];
  return found.length ? found.join(', ') : null;
}

// File name the page date implies, given a file named for another date.
function correctedPath(path, fdate, pageDate) {
  let cand = path.split(fdate).join(pageDate);
  if (cand === path) {
    const [fy, fm, fd] = fdate.split('-').map(Number);
    const [y, m, d] = pageDate.split('-').map(Number);
    const month = MONTHS[m - 1][0].toUpperCase() + MONTHS[m - 1].slice(1);
    cand = path.replace(new RegExp(`${MONTHS[fm - 1]}_0*${fd}_${fy}`, 'gi'),
      `${month}_${String(d).padStart(2, '0')}_${y}`);
  }
  return cand === path ? null : cand;
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

/**
 * Parse the archive page.
 * @param {string} html
 * @param {{probe?: (path: string) => Promise<boolean>, minYear?: number}} opts
 *   probe: does SOURCE + path exist as audio?  minYear: stop at older years.
 */
export async function buildCatalog(html, { probe = async () => false, minYear = 0 } = {}) {
  let era = null;
  let year = null;
  let prevMonth = 0;
  let descending = false;
  const episodes = [];
  const notes = [];
  const problems = [];
  const seen = new Set();

  for (const line of htmlLines(html)) {
    const text = lineText(line);
    const links = line.filter((i) => i.t === 'a');

    if (!links.length) for (const [rx, name] of ERA_HEADINGS) if (rx.test(text)) era = name;
    const ym = /^(\d{4})$/.exec(text);
    if (ym && !links.length) {
      year = +ym[1];
      if (year < minYear) break;
      descending = year >= 2020; // newer years list months Nov, Oct, ...
      prevMonth = descending ? 13 : 0;
      continue;
    }
    if (year === null) continue; // page header

    const audio = links.filter((i) => /mp3$/i.test(i.href));
    if (!audio.length) {
      if (text && !ym && !ERA_HEADINGS.some(([rx]) => rx.test(text))) notes.push({ year, text });
      continue;
    }

    let label = '';
    for (const item of line) { if (item.t === 'a') break; label += item.s; }
    const month = monthFromLabel(norm(label), prevMonth, descending);
    if (month === null) {
      problems.push(`${year}: can't tell the month from ${JSON.stringify(label)} in: ${text.slice(0, 80)}`);
      continue;
    }
    prevMonth = month;

    const lastIdx = line.indexOf(audio[audio.length - 1]);
    const tail = norm(line.slice(lastIdx + 1).filter((i) => i.t === 'text').map((i) => i.s).join(''))
      .replace(/^[-– ]+/, '').trim();

    for (const a of audio) {
      if (!a.s) continue; // Word leaves invisible duplicate links before real ones
      const dm = /^(\d{1,2})\s*(.*)$/.exec(a.s);
      if (!dm) { problems.push(`${year}-${month}: link without a day number ${JSON.stringify(a.s)}: ${a.href}`); continue; }
      const date = isoDate(year, month, +dm[1]);
      if (!date) { problems.push(`invalid date ${year}-${month}-${dm[1]}: ${a.href}`); continue; }
      const extra = dm[2].replace(/^[ \-–*]+|[ \-–*]+$/g, '');

      let path;
      try { path = new URL(a.href, SOURCE).pathname.replace(/^\/+/, ''); } catch {
        problems.push(`bad link for ${date}: ${a.href}`); continue;
      }
      let fname = safeDecode(path.split('/').pop());
      const fdate = filenameDate(fname);
      if ((fdate && fdate !== date) || seen.has(a.href)) {
        const cand = fdate && correctedPath(path, fdate, date);
        if (cand && await probe(cand)) {
          problems.push(`FIXED ${date}: page linked ${fname}, using ${safeDecode(cand)}`);
          path = cand;
          fname = safeDecode(cand);
        } else if (seen.has(a.href)) {
          problems.push(`SKIPPED ${date}: links to ${fname}, which another day already uses`);
          continue;
        } else {
          problems.push(`KEPT ${date}: file name says ${fdate} (${fname}); trusting the page`);
        }
      }
      seen.add(a.href);
      const ep = { date, era, url: SOURCE + path, fname };
      const lab = labelFor(fname);
      if (lab) ep.label = lab;
      if (extra) ep.note = extra;
      episodes.push(ep);
    }
    if (tail && episodes.length) episodes[episodes.length - 1].note = tail;
  }

  // Stable ids: the date, plus -2, -3 for extra files on the same day.
  episodes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1
    : (('label' in a) - ('label' in b)) || (a.fname < b.fname ? -1 : a.fname > b.fname ? 1 : 0)));
  const counts = new Map();
  const out = episodes.map((e) => {
    const n = (counts.get(e.date) || 0) + 1;
    counts.set(e.date, n);
    const ep = { id: n === 1 ? e.date : `${e.date}-${n}`, date: e.date, era: e.era, url: e.url };
    if (e.label) ep.label = e.label;
    if (e.note) ep.note = e.note;
    return ep;
  });
  return { episodes: out, notes, problems };
}

// The page is Windows-1252; only ASCII matters for parsing, so fall back to latin1.
export function decodePage(buf) {
  try { return new TextDecoder('windows-1252').decode(buf); } catch { /* fall through */ }
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return s;
}
