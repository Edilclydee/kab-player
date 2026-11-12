// Build the full episode catalog on this computer and (optionally) upload it.
//
//   node scripts/seed-catalog.mjs                 # fetch live page -> build/catalog.json
//   node scripts/seed-catalog.mjs --file page.html
//   node scripts/seed-catalog.mjs --upload https://kab.edilcly.de   (needs env KAB_KEY)
//
// The Worker's weekly check only re-reads the newest year, so run this if the
// archive ever fixes or adds older shows.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { buildCatalog, decodePage, SOURCE } from '../src/parse.js';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const UA = 'kab-player/1.0 (personal listening app)';

async function probe(path) {
  await new Promise((r) => setTimeout(r, 500)); // be gentle with the fan's server
  try {
    const r = await fetch(SOURCE + path, { headers: { Range: 'bytes=0-0', 'User-Agent': UA } });
    await r.body?.cancel();
    return (r.status === 200 || r.status === 206) && (r.headers.get('content-type') || '').includes('audio');
  } catch { return false; }
}

let html;
if (opt('--file')) html = decodePage(await readFile(opt('--file')));
else {
  const r = await fetch(SOURCE, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`archive returned ${r.status}`);
  html = decodePage(await r.arrayBuffer());
}

const t0 = performance.now();
const cat = await buildCatalog(html, { probe });
const ms = performance.now() - t0;
const { episodes } = cat;
console.log(`${episodes.length} episodes, ${episodes[0].date} .. ${episodes.at(-1).date} (parsed in ${ms.toFixed(0)} ms incl. probes)`);
for (const p of cat.problems) console.log('  ' + p);

const out = { source: SOURCE, built: new Date().toISOString(), episodes };
await mkdir('build', { recursive: true });
await writeFile('build/catalog.json', JSON.stringify(out));
console.log('wrote build/catalog.json');

const target = opt('--upload');
if (target) {
  if (!process.env.KAB_KEY) throw new Error('set KAB_KEY');
  const r = await fetch(new URL('/api/catalog', target), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${process.env.KAB_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(out),
  });
  console.log('upload:', r.status, await r.text());
  if (!r.ok) process.exit(1);
}
