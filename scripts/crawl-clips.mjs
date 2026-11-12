// Maps the archive's clip folders (audio.php?dir=...) into build/clips-raw.json.
//   node scripts/crawl-clips.mjs [--delay 800]
// One request per folder, spaced out to be gentle on the fan's server.
import { writeFile, mkdir } from 'node:fs/promises';

const BASE = 'https://www.kevinandbeanarchive.com/';
const UA = 'kab-player/1.0 (personal listening app)';
const args = process.argv.slice(2);
const delay = Number(args[args.indexOf('--delay') + 1]) || 800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"');

function parseListing(html) {
  const folders = [];
  const files = [];
  // Only look at the listing part, after "Folders:".
  const body = html.slice(Math.max(0, html.indexOf('Folders:')));
  for (const m of body.matchAll(/<a href='\?dir=([^'&]*)(?:&file=([^']*))?'>/g)) {
    const dir = decode(m[1]);
    if (m[2] !== undefined) files.push({ dir, file: decode(m[2]) });
    else folders.push(dir);
  }
  return { folders, files };
}

const seen = new Set();
const queue = ['audio'];
const out = [];
let requests = 0;
while (queue.length) {
  const dir = queue.shift();
  if (seen.has(dir)) continue;
  seen.add(dir);
  const url = `${BASE}audio.php?${new URLSearchParams({ dir })}`;
  let html;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    requests++;
    html = new TextDecoder('windows-1252').decode(await res.arrayBuffer());
  } catch (err) {
    console.log('FAILED', dir, err.message);
    continue;
  }
  const { folders, files } = parseListing(html);
  out.push({ dir, folders, files: files.map((f) => f.file) });
  console.log(`${String(files.length).padStart(5)} files ${String(folders.length).padStart(3)} folders  ${dir}`);
  for (const f of folders) if (!seen.has(f)) queue.push(f);
  await sleep(delay);
}
await mkdir('build', { recursive: true });
await writeFile('build/clips-raw.json', JSON.stringify(out, null, 1));
const total = out.reduce((n, d) => n + d.files.length, 0);
console.log(`\n${out.length} folders, ${total} files, ${requests} requests -> build/clips-raw.json`);
