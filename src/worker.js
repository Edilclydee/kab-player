// kab-player Worker: the player's API plus the weekly check for new shows.
// Everything outside /api/* is served straight from ./site by the assets layer.
import { buildCatalog, decodePage, SOURCE } from './parse.js';

const UA = 'kab-player/1.0 (personal listening app)';
const MAX_PROBES = 10;

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

async function authorized(req, env) {
  const m = /^Bearer (.+)$/.exec(req.headers.get('Authorization') || '');
  if (!m || !env.APP_KEY) return false;
  const enc = new TextEncoder();
  const a = enc.encode(m[1]);
  const b = enc.encode(env.APP_KEY);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (!(await authorized(req, env))) return json({ error: 'unauthorized' }, 401);
    try {
      switch (`${req.method} ${url.pathname}`) {
        case 'GET /api/ping': return json({ ok: true });
        case 'GET /api/episodes': return getEpisodes(req, env);
        case 'GET /api/status': return getStatus(env);
        case 'GET /api/progress': return getProgress(url, env);
        case 'POST /api/progress': return postProgress(req, env);
        case 'POST /api/refresh': return json(await refresh(env));
        case 'PUT /api/catalog': return putCatalogHandler(req, env);
        default: return json({ error: 'not found' }, 404);
      }
    } catch (err) {
      console.error(err);
      return json({ error: String(err?.message || err) }, 500);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refresh(env).then(
      (s) => console.log('weekly check', JSON.stringify(s)),
      (e) => console.error('weekly check failed', e),
    ));
  },
};

// ---------- catalog ----------

async function getEpisodes(req, env) {
  const row = await env.DB.prepare("SELECT v, updated FROM catalog WHERE k = 'episodes'").first();
  if (!row) return json({ error: 'The episode list has not been loaded yet.' }, 503);
  const etag = `"${row.updated}"`;
  // Cloudflare marks the tag weak (W/"...") when it compresses the response.
  const inm = (req.headers.get('If-None-Match') || '').replace(/^W\//, '');
  if (inm === etag) return new Response(null, { status: 304, headers: { ETag: etag } });
  return new Response(row.v, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ETag: etag },
  });
}

async function getStatus(env) {
  const { results } = await env.DB.prepare('SELECT k, v, updated FROM catalog').all();
  const by = Object.fromEntries(results.map((r) => [r.k, r]));
  const cat = by.episodes ? JSON.parse(by.episodes.v) : null;
  return json({
    count: cat?.episodes.length ?? 0,
    newest: cat?.episodes.at(-1)?.date ?? null,
    built: cat?.built ?? null,
    lastCheck: by.status ? JSON.parse(by.status.v) : null,
  });
}

async function saveCatalog(env, cat) {
  await env.DB.prepare("INSERT OR REPLACE INTO catalog (k, v, updated) VALUES ('episodes', ?, ?)")
    .bind(JSON.stringify(cat), Date.now()).run();
}

async function putCatalogHandler(req, env) {
  const cat = await req.json();
  const ok = Array.isArray(cat?.episodes) && cat.episodes.length > 100 && cat.episodes.every(
    (e) => typeof e.id === 'string' && /^\d{4}-\d{2}-\d{2}/.test(e.date) && /^https:\/\//.test(e.url));
  if (!ok) return json({ error: 'not a valid catalog' }, 400);
  await saveCatalog(env, { source: cat.source || SOURCE, built: cat.built || new Date().toISOString(), episodes: cat.episodes });
  return json({ ok: true, count: cat.episodes.length });
}

async function probeAudio(url) {
  try {
    const r = await fetch(url, { headers: { Range: 'bytes=0-0', 'User-Agent': UA } });
    await r.body?.cancel();
    return (r.status === 200 || r.status === 206) && (r.headers.get('Content-Type') || '').includes('audio');
  } catch {
    return false;
  }
}

// Re-read only the newest year on the archive page (cheap enough for the free
// plan's CPU limit) and merge it into the stored catalog.
async function refresh(env) {
  const row = await env.DB.prepare("SELECT v FROM catalog WHERE k = 'episodes'").first();
  if (!row) throw new Error('No episode list yet; upload it with scripts/seed-catalog.mjs first.');
  const old = JSON.parse(row.v);
  const latestYear = +old.episodes.at(-1).date.slice(0, 4);

  const res = await fetch(SOURCE, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`archive site returned ${res.status}`);
  const html = decodePage(await res.arrayBuffer());

  let probes = 0;
  const fresh = await buildCatalog(html, {
    minYear: latestYear,
    probe: (path) => (++probes > MAX_PROBES ? Promise.resolve(false) : probeAudio(SOURCE + path)),
  });

  const cutoff = `${latestYear}-01-01`;
  const kept = old.episodes.filter((e) => e.date < cutoff);
  const oldRecent = old.episodes.filter((e) => e.date >= cutoff);
  const status = { checked: new Date().toISOString(), problems: fresh.problems };

  if (fresh.episodes.length < oldRecent.length - 3) {
    // Page layout probably changed; don't throw away shows we already have.
    status.error = `Found ${fresh.episodes.length} shows since ${cutoff}, expected at least ${oldRecent.length}. Kept the old list.`;
  } else {
    const oldIds = new Set(old.episodes.map((e) => e.id));
    status.added = fresh.episodes.filter((e) => !oldIds.has(e.id)).map((e) => e.id);
    status.changed = JSON.stringify(oldRecent) !== JSON.stringify(fresh.episodes);
    if (status.changed) {
      await saveCatalog(env, { ...old, built: status.checked, episodes: kept.concat(fresh.episodes) });
    }
    status.count = kept.length + fresh.episodes.length;
  }
  await env.DB.prepare("INSERT OR REPLACE INTO catalog (k, v, updated) VALUES ('status', ?, ?)")
    .bind(JSON.stringify(status), Date.now()).run();
  return status;
}

// ---------- progress sync ----------

async function getProgress(url, env) {
  const since = Number(url.searchParams.get('since')) || 0;
  const now = Date.now();
  const [rows, favs] = await env.DB.batch([
    env.DB.prepare('SELECT id, pos, dur, done, updated FROM progress WHERE srv > ?').bind(since),
    env.DB.prepare('SELECT id, fav, updated FROM favorites WHERE srv > ?').bind(since),
  ]);
  // Overlap the next pull a little so a write landing during this read isn't missed.
  return json({ rows: rows.results, favs: favs.results, cursor: now - 10_000 });
}

// Show ids are dates ("2017-06-07", "2018-08-31-2"); clip ids are "c" + a base-36 hash.
const ID_RE = /^(\d{4}-\d{2}-\d{2}(-\d+)?|c[0-9a-z]{4,12})$/;

async function postProgress(req, env) {
  const body = await req.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  const favs = Array.isArray(body?.favs) ? body.favs : [];
  if (!body || rows.length + favs.length > 1000) return json({ error: 'bad request' }, 400);
  const now = Date.now();
  const stmt = env.DB.prepare(`
    INSERT INTO progress (id, pos, dur, done, updated, srv) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(id) DO UPDATE SET
      pos = excluded.pos, dur = COALESCE(excluded.dur, progress.dur), done = excluded.done,
      updated = excluded.updated, srv = excluded.srv
    WHERE excluded.updated > progress.updated`);
  const batch = [];
  for (const r of rows) {
    if (typeof r?.id !== 'string' || !ID_RE.test(r.id)) continue;
    const pos = Number(r.pos);
    const dur = r.dur == null ? null : Number(r.dur);
    const updated = Number(r.updated);
    if (!Number.isFinite(pos) || pos < 0 || !Number.isFinite(updated)) continue;
    batch.push(stmt.bind(r.id, pos, Number.isFinite(dur) ? dur : null, r.done ? 1 : 0, Math.round(updated), now));
  }
  const favStmt = env.DB.prepare(`
    INSERT INTO favorites (id, fav, updated, srv) VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(id) DO UPDATE SET fav = excluded.fav, updated = excluded.updated, srv = excluded.srv
    WHERE excluded.updated > favorites.updated`);
  for (const f of favs) {
    const updated = Number(f?.updated);
    if (typeof f?.id !== 'string' || !ID_RE.test(f.id) || !Number.isFinite(updated)) continue;
    batch.push(favStmt.bind(f.id, f.fav ? 1 : 0, Math.round(updated), now));
  }
  if (batch.length) await env.DB.batch(batch);
  return json({ ok: true, saved: batch.length });
}
