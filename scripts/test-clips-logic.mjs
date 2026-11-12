// Runs the app's clip + search helpers (pulled straight out of site/app.js)
// against site/clips.json and build/catalog.json.
import { readFile } from 'node:fs/promises';

const app = await readFile('site/app.js', 'utf8');
const slice = (from, to) => {
  const a = app.indexOf(from), b = app.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error(`marker not found: ${a < 0 ? from : to}`);
  return app.slice(a, b);
};
const S = { current: null, prog: {}, favs: {}, byId: new Map(), eps: [], showHay: null };
const C = { loaded: false, loading: null, base: '', folders: [], byId: new Map(), byDate: new Map(), byPath: new Map(), list: [], hay: null };
let fetchJson;
const fetch = async () => ({ ok: true, json: async () => fetchJson });
const code = [
  slice('const MONTH_NAMES', 'function fmtClock'),
  slice('// Stable id from the clip', 'const clipUrl'),
  slice('// ---------- search (shows', '// Hand-picked collections'),
  slice('// Hand-picked collections', 'function favoriteEps') .replace(/const isFav[\s\S]*$/, ''),
  'return { loadClips, runSearch, parseDateQuery, SPECIALS };',
].join('\n');
const lib = new Function('S', 'C', 'fetch', code)(S, C, fetch);

S.eps = JSON.parse(await readFile('build/catalog.json', 'utf8')).episodes;
fetchJson = JSON.parse(await readFile('site/clips.json', 'utf8'));
let t = performance.now();
await lib.loadClips();
console.log(`load: ${C.list.length} clips, ${C.folders.length} folders in ${(performance.now() - t).toFixed(0)} ms`);
const ids = new Set(C.list.map((c) => c.id));
console.log(`unique ids: ${ids.size} / ${C.list.length}`);
console.log(`specials found: ${lib.SPECIALS.filter((s) => C.byPath.has(s.path)).length} / ${lib.SPECIALS.length}`);

console.log('\ndate parsing:');
for (const q of ['June 7 2017', '6/7/17', '2017-06-07', '7 June 2017', 'june 7th, 2017', 'June 2017', '2017-06', 'June 7', '2008',
  'christmas 2005', 'kimmel', 'Feb 30 2010', '911 calls', 'may']) {
  const d = lib.parseDateQuery(q);
  console.log(`  ${JSON.stringify(q).padEnd(18)} -> ${d ? `${d.kind}: ${d.label}${d.rest ? ` + words "${d.rest}"` : ''}` : 'no date (words only)'}`);
}
console.log('\nsearches:');
for (const q of ['June 7 2017', 'June 8 2019', 'June 2017', 'June 7', '2008', 'christmas 2005', "Bean's final show", 'Party Machine', 'kimmel', 'jed the fish', 'zzqx']) {
  t = performance.now();
  const r = lib.runSearch(q);
  console.log(`  ${JSON.stringify(q).padEnd(20)} shows ${String(r.shows.length).padStart(4)}  clips ${String(r.clips.length).padStart(5)}  folders ${r.folders.length}  ${(performance.now() - t).toFixed(0)} ms  ${r.clips[0] ? 'e.g. ' + r.clips[0].title.slice(0, 50) : ''}`);
}
