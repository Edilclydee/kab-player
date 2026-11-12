// API smoke test.  node scripts/smoke-test.mjs <baseUrl> [--write] [--refresh] [--scheduled]
// Needs env KAB_KEY. --write uses test episode 2006-11-01 and puts it back the way it was.
const base = process.argv[2] || 'http://localhost:8787';
const flags = new Set(process.argv.slice(3));
const key = process.env.KAB_KEY;
const H = { Authorization: `Bearer ${key}` };
let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) failures++;
};
const get = (p, h = {}) => fetch(base + p, { headers: { ...H, ...h } });
const post = (p, body) => fetch(base + p, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

let r = await fetch(base + '/api/ping');
check('no passphrase -> 401', r.status === 401);
r = await fetch(base + '/api/ping', { headers: { Authorization: 'Bearer wrong' } });
check('wrong passphrase -> 401', r.status === 401);
r = await get('/api/ping');
check('right passphrase -> 200', r.ok);

r = await get('/api/episodes');
const etag = r.headers.get('etag');
const cat = await r.json();
check('episodes list', cat.episodes?.length > 4000, `${cat.episodes?.length} shows, newest ${cat.episodes?.at(-1)?.date}, ${r.headers.get('content-encoding') || 'uncompressed'}`);
r = await get('/api/episodes', { 'If-None-Match': etag });
check('unchanged list -> 304', r.status === 304);

r = await get('/api/status');
const st = await r.json();
check('status', r.ok && st.count === cat.episodes.length, JSON.stringify(st).slice(0, 160));

for (const p of ['/', '/app.js', '/style.css', '/sw.js', '/manifest.webmanifest', '/icons/icon-512.png', '/year/2017']) {
  r = await fetch(base + p);
  check(`asset ${p}`, r.ok, r.headers.get('content-type'));
}

if (flags.has('--write')) {
  const id = '2006-11-01';
  r = await get('/api/progress?since=0');
  const before = (await r.json()).rows.find((x) => x.id === id);
  const t = Date.now();
  r = await post('/api/progress', { rows: [{ id, pos: 1234.5, dur: 9000, done: 0, updated: t }] });
  check('save progress', r.ok, await r.text());
  r = await post('/api/progress', { rows: [{ id, pos: 1, dur: 9000, done: 0, updated: t - 60000 }] });
  check('older write accepted but ignored', r.ok);
  r = await post('/api/progress', { rows: [{ id: 'bad id', pos: 1, updated: t }, { id, pos: -5, updated: t + 1 }] });
  check('invalid rows skipped', (await r.json()).saved === 0);
  r = await get('/api/progress?since=0');
  const row = (await r.json()).rows.find((x) => x.id === id);
  check('newest write wins', row?.pos === 1234.5 && row?.dur === 9000, JSON.stringify(row));
  const { cursor } = await (await get('/api/progress?since=0')).json();
  r = await get('/api/progress?since=' + (cursor + 20000));
  check('incremental pull returns only newer rows', (await r.json()).rows.length === 0);
  // clip ids ("c" + hash) are accepted alongside show ids
  r = await post('/api/progress', { rows: [{ id: 'czzzztest', pos: 0, dur: 1, done: 0, updated: 1 }] });
  check('clip ids accepted', (await r.json()).saved === 1);
  // favorites: newest write wins, independent of progress
  const favBefore = (await (await get('/api/progress?since=0')).json()).favs?.find((x) => x.id === id);
  r = await post('/api/progress', { favs: [{ id, fav: 1, updated: t }] });
  check('save favorite', r.ok);
  await post('/api/progress', { favs: [{ id, fav: 0, updated: t - 5000 }] });
  const fav = (await (await get('/api/progress?since=0')).json()).favs?.find((x) => x.id === id);
  check('older unfavorite ignored', fav?.fav === 1, JSON.stringify(fav));
  // put everything back
  await post('/api/progress', {
    rows: [before ? { ...before, updated: t + 2 } : { id, pos: 0, dur: 9000, done: 0, updated: t + 2 }],
    favs: [{ id, fav: favBefore?.fav ?? 0, updated: t + 2 }],
  });
}

if (flags.has('--refresh')) {
  const t0 = Date.now();
  r = await post('/api/refresh', {});
  const s = await r.json();
  check('check for new shows', r.ok && !s.error, `${Date.now() - t0} ms ${JSON.stringify(s).slice(0, 200)}`);
}

if (flags.has('--scheduled')) {
  const lastChecked = async () => (await (await get('/api/status')).json()).lastCheck?.checked;
  const before = await lastChecked();
  r = await fetch(base + '/__scheduled?cron=0+12+*+*+SAT');
  const text = await r.text();
  let after = before;
  for (let i = 0; i < 30 && after === before; i++) {
    await new Promise((res) => setTimeout(res, 500)); // the job finishes after the trigger responds
    after = await lastChecked();
  }
  check('weekly trigger runs the check', r.ok && !text.includes('<html') && after !== before, `${text.trim().slice(0, 40)} | last check ${before} -> ${after}`);
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
