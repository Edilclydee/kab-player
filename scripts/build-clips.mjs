// build/clips-raw.json (from crawl-clips.mjs) -> site/clips.json for the app.
//   node scripts/build-clips.mjs
// Format (compact on purpose, ~65k clips):
//   { built, folders: [[name, parentIndex, [fileName, ...]], ...] }
// folders[0] is the root ("audio"). File names have ".mp3" removed (other spellings kept).
import { readFile, writeFile } from 'node:fs/promises';

const raw = JSON.parse(await readFile('build/clips-raw.json', 'utf8'));
const byDir = new Map(raw.map((f) => [f.dir, f]));

// Total clip count under each folder, so empty pointer folders can be dropped.
const total = new Map();
function count(dir) {
  if (total.has(dir)) return total.get(dir);
  const f = byDir.get(dir);
  if (!f) return 0;
  total.set(dir, 0);
  const n = f.files.filter((x) => /\.mp3$/i.test(x)).length + f.folders.reduce((s, d) => s + count(d), 0);
  total.set(dir, n);
  return n;
}

const folders = [];
function add(dir, parent) {
  const f = byDir.get(dir);
  const idx = folders.length;
  const name = dir === 'audio' ? '' : dir.split('/').pop();
  // ".mp3" is dropped to save space; any other spelling (".MP3") is kept so the URL is exact.
  // The same clip listed twice (e.g. .mp3 and .MP3 copies) is kept once.
  const seen = new Set();
  const files = f.files.filter((x) => /\.mp3$/i.test(x))
    .filter((x) => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((x) => x.replace(/\.mp3$/, ''));
  folders.push([name, parent, files]);
  const subs = f.folders.filter((d) => count(d) > 0).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  for (const d of subs) add(d, idx);
}
add('audio', -1);

const clips = folders.reduce((n, f) => n + f[2].length, 0);
const out = { built: new Date().toISOString(), base: 'https://www.kevinandbeanarchive.com/audio/', folders };
const json = JSON.stringify(out);
await writeFile('site/clips.json', json);
console.log(`${folders.length} folders, ${clips} clips, ${(json.length / 1e6).toFixed(1)} MB -> site/clips.json`);
