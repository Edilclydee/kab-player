// Range-requests a sample of clip URLs (built the same way the app builds them).
//   node scripts/check-clip-urls.mjs [count]
import { readFile } from 'node:fs/promises';

const { base, folders } = JSON.parse(await readFile('site/clips.json', 'utf8'));
const pathOf = (i) => { const p = []; for (; i > 0; i = folders[i][1]) p.unshift(folders[i][0]); return p; };
const urlOf = (fi, name) => base + [...pathOf(fi), /\.mp3$/i.test(name) ? name : name + '.mp3'].map(encodeURIComponent).join('/');

const all = [];
folders.forEach((f, fi) => f[2].forEach((name) => all.push([fi, name])));
const n = Number(process.argv[2]) || 15;
const pick = [];
for (let i = 0; i < n; i++) pick.push(all[Math.floor(Math.random() * all.length)]);
pick.push(...all.filter(([, x]) => x.includes('+')).slice(0, 2));
pick.push(...all.filter(([, x]) => x.endsWith('.MP3')).slice(0, 2));
pick.push(...all.filter(([, x]) => x.includes('`')).slice(0, 2));
pick.push(...all.filter(([fi]) => pathOf(fi).join('/').includes('`')).slice(0, 1));
let bad = 0;
for (const [fi, name] of pick) {
  const url = urlOf(fi, name);
  const r = await fetch(url, { headers: { Range: 'bytes=0-0', 'User-Agent': 'kab-player/1.0 (personal listening app)' } });
  await r.body?.cancel();
  const ok = (r.status === 206 || r.status === 200) && (r.headers.get('content-type') || '').includes('audio');
  if (!ok) bad++;
  console.log(ok ? 'ok ' : 'BAD', r.status, [...pathOf(fi), name].join('/').slice(0, 110));
  await new Promise((res) => setTimeout(res, 400));
}
console.log(`${pick.length - bad}/${pick.length} playable`);
