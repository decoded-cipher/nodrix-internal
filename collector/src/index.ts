// nodrix-collector — anonymous install/usage telemetry sink.
//
//   POST /ingest  — a self-hosted instance reports an 'install' or 'heartbeat'.
//                   Payload is allow-listed and upserted into the instances
//                   table. The client IP is deliberately never read or stored.
//   GET  /stats   — bearer-gated aggregate counts (installs / active / versions).
//   GET  /        — health check.

import type { D1Database } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
  STATS_TOKEN?: string;
}

const MAX_BODY_BYTES = 4096;
// nanoid: URL-safe alphabet, length-bounded (default 21).
const ID_RE = /^[A-Za-z0-9_-]{16,32}$/;

const DAY_MS = 86_400_000;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

// kinds → JSON array of strings.
function kindsJson(v: unknown): string | null {
  if (!Array.isArray(v)) return null;
  const out = v.filter((k): k is string => typeof k === 'string' && k.length > 0);
  return out.length ? JSON.stringify(out) : null;
}

// counts → JSON object of finite numbers.
function countsJson(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'number' && Number.isFinite(val)) out[k] = val;
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

// flags → JSON object of booleans.
function flagsJson(v: unknown): string | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Record<string, boolean> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'boolean') out[k] = val;
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}

async function handleIngest(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: 'payload too large' }, 413);

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid json' }, 400);
  }

  const event = body.event;
  if (event !== 'install' && event !== 'heartbeat') {
    return json({ ok: false, error: 'invalid event' }, 400);
  }

  const instanceId = typeof body.instance_id === 'string' ? body.instance_id : '';
  if (!ID_RE.test(instanceId)) {
    return json({ ok: false, error: 'invalid instance_id' }, 400);
  }

  // Allow-list only — anything else on the body is ignored. The IP is never read.
  const version = str(body.version);
  const commitSha = str(body.commit_sha);
  const kinds = kindsJson(body.kinds);
  const counts = countsJson(body.counts);
  const flags = flagsJson(body.flags);
  const now = Date.now();

  try {
    await env.DB.prepare(
      `INSERT INTO instances (instance_id, first_seen, last_seen, version, commit_sha, kinds, counts, flags, ping_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(instance_id) DO UPDATE SET
         last_seen  = excluded.last_seen,
         -- COALESCE so a sparse ping refreshes last_seen without nulling
         -- previously-reported metadata; a field present in the new ping wins.
         version    = COALESCE(excluded.version, instances.version),
         commit_sha = COALESCE(excluded.commit_sha, instances.commit_sha),
         kinds      = COALESCE(excluded.kinds, instances.kinds),
         counts     = COALESCE(excluded.counts, instances.counts),
         flags      = COALESCE(excluded.flags, instances.flags),
         ping_count = instances.ping_count + 1`,
    )
      .bind(instanceId, now, now, version, commitSha, kinds, counts, flags)
      .run();
  } catch (err) {
    console.error('ingest upsert failed', err);
    return json({ ok: false, error: 'storage error' }, 500);
  }

  return new Response(null, { status: 204 });
}

async function handleStats(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get('authorization') ?? '';
  if (!env.STATS_TOKEN || auth !== `Bearer ${env.STATS_TOKEN}`) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const now = Date.now();
  const since7 = now - 7 * DAY_MS;
  const since30 = now - 30 * DAY_MS;

  try {
    const totals = await env.DB.prepare(
      `SELECT
         COUNT(*)                                   AS installs_total,
         COUNT(CASE WHEN last_seen > ?1 THEN 1 END) AS active_7d,
         COUNT(CASE WHEN last_seen > ?2 THEN 1 END) AS active_30d
       FROM instances`,
    )
      .bind(since7, since30)
      .first<{ installs_total: number; active_7d: number; active_30d: number }>();

    const { results: byVersion } = await env.DB.prepare(
      `SELECT COALESCE(version, 'unknown') AS version, COUNT(*) AS count
       FROM instances GROUP BY version ORDER BY count DESC`,
    ).all();

    const { results: newByDay } = await env.DB.prepare(
      `SELECT date(first_seen / 1000, 'unixepoch') AS day, COUNT(*) AS count
       FROM instances GROUP BY day ORDER BY day DESC LIMIT 90`,
    ).all();

    return json({
      installs_total: totals?.installs_total ?? 0,
      active_7d: totals?.active_7d ?? 0,
      active_30d: totals?.active_30d ?? 0,
      by_version: byVersion,
      new_installs_by_day: newByDay,
    });
  } catch (err) {
    console.error('stats query failed', err);
    return json({ ok: false, error: 'query error' }, 500);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ingest') {
      if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'POST' } });
      return handleIngest(request, env);
    }

    if (url.pathname === '/stats') {
      if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } });
      return handleStats(request, env);
    }

    if (url.pathname === '/' && request.method === 'GET') {
      return new Response('ok', { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  },
};
