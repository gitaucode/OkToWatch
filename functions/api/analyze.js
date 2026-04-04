```js
import { getAuth } from '../_shared/clerk.js';

/**
 * POST /api/analyze
 * Content analysis with D1 caching.
 */

const CACHE_TTL_DAYS = 90;
const MODEL = 'llama-3.3-70b-versatile';

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const {
    tmdb_id, media_type, season = null,
    title, year, overview, genres, certRating, keywords, type, childAge, seasonContext,
  } = body;

  if (!title) return jsonError('title is required', 400);

  // ── 0. Rate limiting (/analyze only) ─────────────────────
  let auth = null;
  let identity = null;
  let limit = 10;
  let errorCode = 'guest_limit';

  try {
    auth = await getAuth(request, env);
  } catch {
    auth = null;
  }

  if (auth?.userId) {
    identity = `user:${auth.userId}`;
    errorCode = 'rate_limit';

    if (env.DB) {
      try {
        const sub = await env.DB
          .prepare(`SELECT tier, status, renews_at FROM subscriptions WHERE user_id = ? LIMIT 1`)
          .bind(auth.userId)
          .first();

        if (sub && (sub.status === 'active' || sub.status === 'trial')) {
          const renewalDate = new Date(sub.renews_at);
          if (new Date() < renewalDate) {
            if (sub.tier === 'pro' || sub.tier === 'family') {
              limit = 100;
            } else {
              limit = 20;
            }
          }
        } else {
          limit = 20;
        }
      } catch {
        limit = 20;
      }
    } else {
      limit = 20;
    }

  } else {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (ip !== 'unknown') {
      identity = `guest:${ip}`;
    }
  }

  if (identity && env.DB) {
    const now = Date.now();
    const WINDOW = 86400000;

    await env.DB.prepare(`
      DELETE FROM request_limits
      WHERE endpoint = 'analyze'
        AND window_start < ?
    `).bind(now - WINDOW).run();

    const row = await env.DB.prepare(`
      SELECT count, window_start
      FROM request_limits
      WHERE identity = ? AND endpoint = 'analyze'
    `).bind(identity).first();

    if (row && row.window_start > (now - WINDOW)) {
      if (row.count >= limit) {
        return new Response(JSON.stringify({
          error: errorCode,
          resetsAt: row.window_start + WINDOW,
          limit
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      await env.DB.prepare(`
        UPDATE request_limits
        SET count = count + 1
        WHERE identity = ? AND endpoint = 'analyze'
      `).bind(identity).run();

    } else {
      await env.DB.prepare(`
        INSERT INTO request_limits (identity, endpoint, count, window_start)
        VALUES (?, 'analyze', 1, ?)
        ON CONFLICT(identity, endpoint) DO UPDATE SET
          count = 1,
          window_start = excluded.window_start
      `).bind(identity, now).run();
    }
  }

  // ── 1. Cache lookup ─────────────────────────────────────
  if (env.DB && tmdb_id && media_type) {
    const cacheKey = buildCacheKey(tmdb_id, media_type, season);

    try {
      const row = await env.DB
        .prepare('SELECT result_json, cached_at FROM analysis_cache WHERE id = ?')
        .bind(cacheKey)
        .first();

      if (row) {
        const ageDays = (Date.now() - new Date(row.cached_at).getTime()) / 86_400_000;

        if (ageDays < CACHE_TTL_DAYS) {
          return jsonOk({ ...JSON.parse(row.result_json), _cached: true });
        }
      }
    } catch (e) {
      console.error('Cache lookup error:', e);
    }
  }

  // ── 2. Build Groq messages ───────────────────────────────
  const messages = buildMessages({
    title, year, overview, genres, certRating, keywords, type, childAge, seasonContext
  });

  // ── 3. Call Groq ─────────────────────────────────────────
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, messages, stream: false }),
  });

  if (!groqRes.ok) {
    const err = await groqRes.text();
    return jsonError(`Groq error: ${err}`, groqRes.status);
  }

  const groqData = await groqRes.json();

  // ── 4. Cache write ───────────────────────────────────────
  if (env.DB && tmdb_id && media_type) {
    const cacheKey = buildCacheKey(tmdb_id, media_type, season);

    env.DB.prepare(`
      INSERT INTO analysis_cache (id, tmdb_id, media_type, season, result_json, cached_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        result_json = excluded.result_json,
        cached_at = excluded.cached_at
    `)
      .bind(cacheKey, tmdb_id, media_type, season ?? null, JSON.stringify(groqData))
      .run()
      .catch(e => console.error('Cache write error:', e));
  }

  return jsonOk(groqData);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// ── Helpers ───────────────────────────────────────────────

function buildCacheKey(tmdb_id, media_type, season) {
  return `${tmdb_id}:${media_type}:${season ?? 'all'}`;
}

function jsonOk(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildMessages({ title, year, overview, genres, certRating, keywords, type, childAge, seasonContext }) {
  const ageNote = childAge != null
    ? `The viewer is ${childAge} years old — tailor the verdict accordingly.`
    : '';

  const seasonNote = seasonContext ? `\nSeason context: ${seasonContext}` : '';

  const systemPrompt = `You are a parental content advisor. Return valid JSON only.`;

  const userPrompt = `Analyse this title:

Title: ${title}${year ? ` (${year})` : ''}
${overview || ''}${seasonNote}
${ageNote}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}
```
