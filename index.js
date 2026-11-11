/**
 * dsh-session-grep — Host half.
 *
 * Serves a tiny read-only JSON API over the session logs on disk:
 *
 *   GET /dsh-session-grep/api/search?q=&limit=&context=&tools=&session=
 *   GET /dsh-session-grep/api/sessions
 *   GET /dsh-session-grep/api/health
 *
 * Why the logs and not the session-query service: that service builds an
 * FTS5 index with the `unicode61` tokenizer, which matches whole tokens and
 * phrases. Contiguous Chinese is one token, so a fragment inside a sentence
 * ("搜索输出" inside "...只能搜索输出") never matches. This plugin decompresses
 * the same `session.v4.jsonl.zstd` files (a sequence of concatenated zstd
 * frames) and does a literal, case-insensitive substring scan — the same
 * thing `String.prototype.indexOf` does.
 *
 * Zero network access: it reads the local session directory and answers its
 * own loopback route.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

export const inject = ['webServer'];

const VERSION = '1.0.2';
const API = '/dsh-session-grep/api';
const SESSION_FILE = 'session.v4.jsonl.zstd';
const DIAG_FILE = path.join(os.tmpdir(), 'dsh-session-grep-diag.log');
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]); // zstd frame magic
const MAX_HITS_PER_DOC = 3;
const MAX_LIMIT = 200;

/** file path -> parsed entry */
const cache = new Map();

function sessionsRoot() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  return path.join(home, 'sessions');
}

// ---------------------------------------------------------------- decoding

/**
 * One log file is several zstd frames concatenated with no length prefix.
 * Split on the magic and inflate each frame; a magic sequence that shows up
 * inside compressed bytes simply fails to inflate and is merged into the next
 * candidate, so a false positive costs one retry instead of a lost event.
 */
function decodeFrames(buf) {
  const cuts = [];
  let at = 0;
  while ((at = buf.indexOf(MAGIC, at)) !== -1) {
    cuts.push(at);
    at += 4;
  }
  if (cuts.length === 0) return buf;
  const parts = [];
  let start = cuts[0];
  for (let k = 1; k <= cuts.length; k++) {
    const end = k < cuts.length ? cuts[k] : buf.length;
    try {
      parts.push(zlib.zstdDecompressSync(buf.subarray(start, end)));
      start = end;
    } catch {
      // Not a frame boundary after all: keep `start` and try a longer slice.
    }
  }
  return Buffer.concat(parts);
}

function parseEvents(file) {
  const text = decodeFrames(fs.readFileSync(file)).toString('utf8');
  const events = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // A torn last line is expected while a session is still being written.
    }
  }
  return events;
}

// ------------------------------------------------------------ text of event

function textOf(ev, withTools) {
  const d = ev.data;
  if (!d) return '';
  if (ev.type === 'user/message') {
    return (d.content ?? [])
      .filter((c) => c && c.type === 'text')
      .map((c) => c.text)
      .join('\n');
  }
  if (ev.type === 'assistant/message') {
    const parts = d.message?.content ?? d.content ?? [];
    const out = [];
    for (const c of parts) {
      if (!c) continue;
      if (c.type === 'text') out.push(c.text);
      else if (withTools && c.type === 'reasoning') out.push(c.text);
      else if (withTools && (c.type === 'tool-call' || c.type === 'tool_call')) {
        out.push(JSON.stringify(c.arguments ?? c.input ?? ''));
      }
    }
    return out.join('\n');
  }
  if (withTools && ev.type === 'developer/message') {
    return JSON.stringify(d.content ?? '');
  }
  if (withTools && ev.type === 'tool/call') return JSON.stringify(d);
  if (withTools && ev.type === 'tool/result') return JSON.stringify(d).slice(0, 20000);
  return '';
}

function roleOf(type) {
  if (type === 'user/message') return 'user';
  if (type === 'assistant/message') return 'assistant';
  if (type === 'tool/call' || type === 'tool/result') return 'tool';
  return 'other';
}

function timeOf(ev) {
  const value = ev?.time;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function titleOf(events) {
  for (const ev of events) {
    if (ev.type === 'session/title') {
      const t = ev.data?.title ?? ev.data?.text;
      if (typeof t === 'string' && t.trim()) return t.trim();
    }
  }
  for (const ev of events) {
    if (ev.type === 'user/message') {
      const first = textOf(ev, false).replace(/\s+/g, ' ').trim();
      if (first) return first.length > 48 ? `${first.slice(0, 48)}…` : first;
    }
  }
  return null;
}

// ------------------------------------------------------------------- cache

function loadSession(file) {
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    return null;
  }
  const cached = cache.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached;

  const events = parseEvents(file);
  if (events.length === 0) return null;
  const header = events[0] ?? {};
  let updatedAt = 0;
  for (const ev of events) {
    const at = timeOf(ev);
    if (at > updatedAt) updatedAt = at;
  }
  const entry = {
    file,
    id: path.basename(path.dirname(file)),
    cwd: typeof header.cwd === 'string' ? header.cwd : null,
    title: titleOf(events),
    events,
    updatedAt,
    mtimeMs: stat.mtimeMs,
    size: stat.size,
  };
  cache.set(file, entry);
  if (cache.size > 64) {
    const oldest = cache.keys().next().value;
    if (oldest !== file) cache.delete(oldest);
  }
  return entry;
}

function listSessions() {
  const root = sessionsRoot();
  const out = [];
  let cwdDirs = [];
  try {
    cwdDirs = fs.readdirSync(root);
  } catch {
    return { root, sessions: out };
  }
  for (const cwdDir of cwdDirs) {
    const dir = path.join(root, cwdDir);
    let entries = [];
    try {
      if (!fs.statSync(dir).isDirectory()) continue;
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const file = path.join(dir, name, SESSION_FILE);
      if (!fs.existsSync(file)) continue;
      const entry = loadSession(file);
      if (entry) out.push(entry);
    }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return { root, sessions: out };
}

// ------------------------------------------------------------------ search

function snippetOf(text, at, length, context) {
  const from = Math.max(0, at - context);
  const to = Math.min(text.length, at + length + context);
  const collapsed = text.slice(from, to).replace(/\s+/g, ' ');
  const match = text.slice(at, at + length);
  return { snippet: collapsed, match, before: at > from, after: to < text.length };
}

function search(query, options) {
  const needle = query.toLowerCase();
  const limit = Math.min(Math.max(1, options.limit | 0 || 30), MAX_LIMIT);
  const context = Math.min(Math.max(10, options.context | 0 || 60), 400);
  const { tools, session } = options;
  const started = Date.now();
  const { root, sessions } = listSessions();
  const perSessionCap = Math.max(10, Math.ceil(limit / 2));
  const groups = [];
  let scannedSessions = 0;
  let scannedEvents = 0;
  let overflow = false;

  for (const s of sessions) {
    if (session && !s.id.startsWith(session)) continue;
    scannedSessions++;
    const local = [];
    const seen = new Set();
    // Occurrences of the needle in events BEFORE the current one, in event
    // order: the client uses it to flash the exact occurrence a row stands
    // for, instead of always the first one in the transcript.
    let ordinalBase = 0;
    for (const ev of s.events) {
      const text = textOf(ev, tools);
      if (!text) continue;
      scannedEvents++;
      const low = text.toLowerCase();
      const at = low.indexOf(needle);
      if (at === -1) continue;
      // One hit per event, with the number of in-event occurrences: repeating
      // the same event for every occurrence crowds out other sessions.
      const key = typeof ev.seq === 'number' ? `s${ev.seq}` : `e${scannedEvents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let count = 1;
      for (let probe = low.indexOf(needle, at + needle.length); probe !== -1; probe = low.indexOf(needle, probe + needle.length)) {
        count += 1;
      }
      let beforeInEvent = 0;
      for (let probe = low.indexOf(needle); probe !== -1 && probe < at; probe = low.indexOf(needle, probe + needle.length)) {
        beforeInEvent += 1;
      }
      const built = snippetOf(text, at, needle.length, context);
      local.push({
        sessionId: s.id,
        title: s.title,
        cwd: s.cwd,
        seq: typeof ev.seq === 'number' ? ev.seq : null,
        type: ev.type,
        role: roleOf(ev.type),
        time: timeOf(ev) || null,
        snippet: built.snippet,
        match: built.match,
        matchStart: built.snippet.toLowerCase().indexOf(needle),
        matchLength: needle.length,
        truncatedBefore: built.before,
        truncatedAfter: built.after,
        count,
        ordinal: ordinalBase + beforeInEvent,
      });
      ordinalBase += count;
      if (local.length >= perSessionCap) {
        overflow = true;
        break;
      }
    }
    if (local.length > 0) {
      const newest = local.reduce((max, hit) => Math.max(max, Number.isFinite(hit.time) ? hit.time : 0), 0);
      groups.push({ hits: local, newest });
    }
  }

  // Round-robin across sessions so one long conversation cannot swallow the
  // whole result list; sessions with the newest matches contribute first.
  groups.sort((a, b) => b.newest - a.newest);
  const hits = [];
  for (let round = 0; hits.length < limit; round += 1) {
    let added = 0;
    for (const group of groups) {
      const hit = group.hits[round];
      if (!hit) continue;
      hits.push(hit);
      added += 1;
      if (hits.length >= limit) break;
    }
    if (added === 0) break;
  }

  return {
    query,
    hits,
    limit,
    total: hits.length,
    truncated: overflow || hits.length >= limit,
    scannedSessions,
    scannedEvents,
    tookMs: Date.now() - started,
    sessionsRoot: root,
  };
}

// ------------------------------------------------------------------- routes

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function methodNotAllowed(res) {
  res.writeHead(405, { allow: 'GET' });
  res.end();
}

export function apply(ctx) {
  const disposeSearch = ctx.webServer.register({
    kind: 'exact',
    path: `${API}/search`,
    handler: (req, res) => {
      if (req.method !== 'GET') return methodNotAllowed(res);
      const url = new URL(req.url ?? '/', 'http://localhost');
      const q = (url.searchParams.get('q') ?? '').trim();
      if (!q) return sendJson(res, 200, { query: '', hits: [], total: 0, tookMs: 0 });
      try {
        sendJson(
          res,
          200,
          search(q, {
            limit: Number(url.searchParams.get('limit')) || 30,
            context: Number(url.searchParams.get('context')) || 60,
            tools: url.searchParams.get('tools') === '1',
            session: url.searchParams.get('session') || null,
          }),
        );
      } catch (error) {
        sendJson(res, 500, { error: String(error?.message ?? error) });
      }
    },
  });

  const disposeSessions = ctx.webServer.register({
    kind: 'exact',
    path: `${API}/sessions`,
    handler: (req, res) => {
      if (req.method !== 'GET') return methodNotAllowed(res);
      try {
        const { root, sessions } = listSessions();
        sendJson(res, 200, {
          sessionsRoot: root,
          sessions: sessions.map((s) => ({
            sessionId: s.id,
            title: s.title,
            cwd: s.cwd,
            events: s.events.length,
            updatedAt: s.updatedAt,
            bytes: s.size,
          })),
        });
      } catch (error) {
        sendJson(res, 500, { error: String(error?.message ?? error) });
      }
    },
  });

  const disposeHealth = ctx.webServer.register({
    kind: 'exact',
    path: `${API}/health`,
    handler: (req, res) => {
      if (req.method !== 'GET') return methodNotAllowed(res);
      let sessions = 0;
      try {
        sessions = listSessions().sessions.length;
      } catch {
        // reported as zero below
      }
      sendJson(res, 200, {
        ok: true,
        version: VERSION,
        sessionsRoot: sessionsRoot(),
        sessions,
        cached: cache.size,
      });
    },
  });

  const disposeDiag = ctx.webServer.register({
    kind: 'exact',
    path: `${API}/diag`,
    handler: (req, res) => {
      if (req.method === 'GET') {
        let lines = [];
        try {
          lines = fs.readFileSync(DIAG_FILE, 'utf8').split('\n').filter(Boolean).slice(-80);
        } catch {
          // no diagnostics yet
        }
        return sendJson(res, 200, { file: DIAG_FILE, lines });
      }
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'GET, POST' });
        return res.end();
      }
      let body = '';
      req.on('data', (chunk) => {
        if (body.length < 8000) body += chunk;
      });
      req.on('end', () => {
        try {
          fs.appendFileSync(
            DIAG_FILE,
            `${JSON.stringify({ at: new Date().toISOString(), body: body.slice(0, 4000) })}\n`,
          );
        } catch {
          // diagnostics are best-effort
        }
        sendJson(res, 200, { ok: true });
      });
    },
  });

  return () => {
    disposeSearch();
    disposeSessions();
    disposeHealth();
    disposeDiag();
  };
}
