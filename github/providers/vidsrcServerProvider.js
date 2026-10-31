// Server-only Vidsrc adapter.
// Called by api/index.js only after the existing Febbox/Showbox wrapper has no result.
// Do NOT add this file to github/provider.json: it uses Node child_process on the VPS.
//
// Env (all optional):
//   VIDSRC_ENABLED=true|false          master switch                        (default true)
//   PLAYWRIGHT_PYTHON=/path/to/python  python with playwright installed
//   VIDSRC_TIMEOUT_MS=45000            hard limit per resolve (15000-90000)
//   VIDSRC_MAX_CONCURRENT=2            Chromium instances at once (1-4)
//   VIDSRC_MAX_QUEUE=2                 extra requests allowed to wait; more are refused
//   VIDSRC_BASE=https://vidsrc.ru      embed host (read by vidsrc_resolver.py)

'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PYTHON_BIN =
  process.env.PLAYWRIGHT_PYTHON ||
  '/opt/streammaster-browser/venv/bin/python';

const RESOLVER_SCRIPT = path.join(__dirname, 'vidsrc_resolver.py');

const ENABLED =
  String(process.env.VIDSRC_ENABLED || 'true').trim().toLowerCase() === 'true';

function envInt(name, fallback, min, max) {
  const n = Number.parseInt(process.env[name] || '', 10);
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : fallback));
}

const TIMEOUT_MS = envInt('VIDSRC_TIMEOUT_MS', 45000, 15000, 90000);
const MAX_CONCURRENT = envInt('VIDSRC_MAX_CONCURRENT', 2, 1, 4);
const MAX_QUEUE = envInt('VIDSRC_MAX_QUEUE', 2, 0, 10);

// Give Python a little less time than Node so Chromium can close itself cleanly
// before Node resorts to killing the whole process group.
const PY_BUDGET_MS = Math.max(8000, TIMEOUT_MS - 7000);

const CACHE_TTL_MS = 10 * 60 * 1000;      // successful lookups
const NEG_CACHE_TTL_MS = 2 * 60 * 1000;   // failures: stops retries from spawning Chromium repeatedly
const CACHE_MAX = 300;

const cache = new Map();    // key -> { streams, expiresAt }
const pending = new Map();  // key -> Promise (identical concurrent lookups share one browser)

// ---- concurrency gate ------------------------------------------------------
let active = 0;
const waiters = [];

function acquire() {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve(true);
  }
  if (waiters.length >= MAX_QUEUE) return Promise.resolve(false);
  return new Promise(resolve => waiters.push(resolve));
}

function release() {
  const next = waiters.shift();
  if (next) next(true);   // hand the slot straight to the next waiter
  else active -= 1;
}

// ---- child process bookkeeping --------------------------------------------
const liveChildren = new Set();

function killTree(child) {
  if (!child || !child.pid) return;
  try {
    // detached:true made the child a process-group leader, so -pid also reaches Chromium.
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
    else child.kill('SIGKILL');
  } catch (_) {
    try { child.kill('SIGKILL'); } catch (__) {}
  }
}

// Never leave orphaned browsers behind if the API process exits.
process.on('exit', () => {
  for (const child of liveChildren) killTree(child);
});

// ---- helpers ----------------------------------------------------------------
let warnedMissing = false;

function resolverAvailable() {
  const ok = fs.existsSync(PYTHON_BIN) && fs.existsSync(RESOLVER_SCRIPT);
  if (!ok && !warnedMissing) {
    warnedMissing = true;
    console.warn(
      `[Vidsrc] disabled: missing ${!fs.existsSync(PYTHON_BIN) ? PYTHON_BIN : RESOLVER_SCRIPT}`
    );
  }
  return ok;
}

function validRequest(args) {
  const tmdbId = String((args && args.tmdbId) || '').trim();
  const type = String((args && args.type) || 'movie').toLowerCase();
  const season = Number((args && args.season) || 0);
  const episode = Number((args && args.episode) || 0);

  if (!/^\d{1,12}$/.test(tmdbId)) return null;
  if (type !== 'movie' && type !== 'tv') return null;
  if (type === 'tv' &&
      (!Number.isInteger(season) || season < 1 ||
       !Number.isInteger(episode) || episode < 1)) return null;

  return { tmdbId, type, season, episode };
}

// Only plain http(s) URLs and string headers ever leave this module.
function sanitizeStreams(streams) {
  const out = [];
  for (const item of Array.isArray(streams) ? streams : []) {
    if (!item || typeof item.url !== 'string' || !/^https?:\/\//i.test(item.url)) continue;

    const headers = {};
    if (item.headers && typeof item.headers === 'object') {
      for (const [k, v] of Object.entries(item.headers)) {
        if (typeof v === 'string' && v) headers[String(k)] = v;
      }
    }

    out.push({
      name: String(item.name || 'Vidsrc'),
      title: String(item.title || 'Vidsrc'),
      url: item.url,
      quality: String(item.quality || 'Auto'),
      provider: 'vidsrc',
      headers,
      subtitles: Array.isArray(item.subtitles) ? item.subtitles : []
    });
  }
  return out;
}

function runResolver(payload) {
  return new Promise(resolve => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    let timer = null;
    let child = null;

    const finish = streams => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (child) {
        liveChildren.delete(child);
        killTree(child); // no-op if it already exited; guarantees no stray Chromium
      }
      resolve(sanitizeStreams(streams));
    };

    try {
      child = spawn(PYTHON_BIN, [RESOLVER_SCRIPT], {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });
    } catch (error) {
      console.warn('[Vidsrc] Could not launch Python:', error.message);
      return finish([]);
    }

    liveChildren.add(child);

    timer = setTimeout(() => {
      console.warn('[Vidsrc] Playwright resolver timed out.');
      finish([]);
    }, TIMEOUT_MS);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > 1024 * 1024) finish([]);
    });

    child.stderr.on('data', chunk => {
      stderr += chunk;
      if (stderr.length > 10000) stderr = stderr.slice(-10000);
    });

    // Without these two handlers a failed launch (EPIPE on stdin) crashes the whole API process.
    child.stdin.on('error', () => {});
    child.on('error', error => {
      console.warn('[Vidsrc] Could not launch Python:', error.message);
      finish([]);
    });

    child.on('close', code => {
      if (settled) return;
      try {
        const result = JSON.parse(stdout.trim() || '{}');
        const streams = Array.isArray(result.streams) ? result.streams : [];
        if (code === 0 && streams.length) return finish(streams);
      } catch (_) {
        // fall through to diagnostics
      }
      if (stderr) console.warn('[Vidsrc] Resolver:', stderr.slice(-1200));
      finish([]);
    });

    try {
      child.stdin.end(JSON.stringify({ ...payload, budget_ms: PY_BUDGET_MS }));
    } catch (_) {
      finish([]);
    }
  });
}

function cacheSet(key, streams) {
  cache.set(key, {
    streams,
    expiresAt: Date.now() + (streams.length ? CACHE_TTL_MS : NEG_CACHE_TTL_MS)
  });

  if (cache.size > CACHE_MAX) {
    const now = Date.now();
    for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  }
}

async function resolveWithGate(payload) {
  if (!(await acquire())) {
    console.warn('[Vidsrc] Busy: queue full, skipping fallback for this request.');
    return null; // null = "not tried", so it is not negatively cached
  }
  try {
    return await runResolver(payload);
  } finally {
    release();
  }
}

async function getVidsrcStreams(args) {
  if (!ENABLED) return [];

  const payload = validRequest(args);
  if (!payload) return [];
  if (!resolverAvailable()) return [];

  const key = `${payload.type}:${payload.tmdbId}:${payload.season}:${payload.episode}`;

  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.streams;
  if (pending.has(key)) return pending.get(key);

  const task = resolveWithGate(payload)
    .then(streams => {
      if (streams === null) return [];
      cacheSet(key, streams);
      return streams;
    })
    .catch(error => {
      console.warn('[Vidsrc] Unexpected error:', error && error.message ? error.message : error);
      return [];
    })
    .finally(() => pending.delete(key));

  pending.set(key, task);
  return task;
}

module.exports = { getVidsrcStreams };
