import { getAuth } from '../_shared/clerk.js';

/**
 * POST /api/analyze
 * Content analysis with D1 caching.
 *
 * Request body:
 *   { tmdb_id, media_type, season?,
 *     title, year, overview, genres,
 *     certRating, keywords, type, childAge,
 *     seasonContext? }
 *
 * Cache key: "{tmdb_id}:{media_type}:{season|all}"
 * TTL: 90 days
 *
 * childAge is excluded from the cache key: the base breakdown is the same
 * for all ages; the frontend applies age-specific verdict rendering
 * client-side.
 */

const CACHE_TTL_DAYS = 90;
const MODEL = 'llama-3.3-70b-versatile';

export async function onRequestPost(context) {
  const request = context.request;
  const env = context.env;

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON', 400);
  }

  const tmdb_id = body.tmdb_id;
  const media_type = body.media_type;
  const season = body.season == null ? null : body.season;
  const title = body.title;
  const year = body.year;
  const overview = body.overview;
  const genres = body.genres;
  const certRating = body.certRating;
  const keywords = body.keywords;
  const type = body.type;
  const childAge = body.childAge;
  const seasonContext = body.seasonContext;

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

  if (auth && auth.userId) {
    identity = 'user:' + auth.userId;
    errorCode = 'rate_limit';

    if (env.DB) {
      try {
        const sub = await env.DB
          .prepare('SELECT tier, status, renews_at FROM subscriptions WHERE user_id = ? LIMIT 1')
          .bind(auth.userId)
          .first();

        if (sub && (sub.status === 'active' || sub.status === 'trial')) {
          const renewalDate = new Date(sub.renews_at);
          if (!Number.isNaN(renewalDate.getTime()) && new Date() < renewalDate) {
            if (sub.tier === 'pro' || sub.tier === 'family') {
              limit = 100;
            } else {
              limit = 20;
            }
          } else {
            limit = 20;
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
      identity = 'guest:' + ip;
    }
  }

  if (identity && env.DB) {
    const now = Date.now();
    const WINDOW = 86400000;

    await env.DB.prepare(
      "DELETE FROM request_limits WHERE endpoint = 'analyze' AND window_start < ?"
    ).bind(now - WINDOW).run();

    const row = await env.DB.prepare(
      "SELECT count, window_start FROM request_limits WHERE identity = ? AND endpoint = 'analyze'"
    ).bind(identity).first();

    if (row && row.window_start > (now - WINDOW)) {
      if (row.count >= limit) {
        return new Response(JSON.stringify({
          error: errorCode,
          resetsAt: row.window_start + WINDOW,
          limit: limit
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      await env.DB.prepare(
        "UPDATE request_limits SET count = count + 1 WHERE identity = ? AND endpoint = 'analyze'"
      ).bind(identity).run();
    } else {
      await env.DB.prepare(
        "INSERT INTO request_limits (identity, endpoint, count, window_start) VALUES (?, 'analyze', 1, ?) ON CONFLICT(identity, endpoint) DO UPDATE SET count = 1, window_start = excluded.window_start"
      ).bind(identity, now).run();
    }
  }

  // Helper to attach usage tracking
  async function attachUsage(data, identityVal, limitVal) {
    if (!identityVal || !env.DB || !limitVal) return data;
    try {
      const row = await env.DB.prepare(
        "SELECT count, window_start FROM request_limits WHERE identity = ? AND endpoint = 'analyze'"
      ).bind(identityVal).first();
      if (row) {
        const used = row.count;
        const remaining = Math.max(0, limitVal - used);
        const resetsAt = row.window_start + WINDOW;
        data._usage = { limit: limitVal, used, remaining, resetsAt };
      }
    } catch (e) {
      console.error('Usage tracking error:', e);
    }
    return data;
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
        const ageDays = (Date.now() - new Date(row.cached_at).getTime()) / 86400000;

        if (ageDays < CACHE_TTL_DAYS) {
          const cachedData = mergeCachedFlag(JSON.parse(row.result_json), true);
          const withUsage = await attachUsage(cachedData, identity, limit);
          return jsonOk(withUsage);
        }
      }
    } catch (e) {
      console.error('Cache lookup error:', e);
    }
  }

  // ── 2. Build Groq messages ───────────────────────────────
  const messages = buildMessages({
    title: title,
    year: year,
    overview: overview,
    genres: genres,
    certRating: certRating,
    keywords: keywords,
    type: type,
    childAge: childAge,
    seasonContext: seasonContext
  });

  // ── 3. Call Groq ─────────────────────────────────────────
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.GROQ_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      messages: messages,
      stream: false
    })
  });

  if (!groqRes.ok) {
    const err = await groqRes.text();
    return jsonError('Groq error: ' + err, groqRes.status);
  }

  const groqData = await groqRes.json();

  // ── 4. Cache write ───────────────────────────────────────
  if (env.DB && tmdb_id && media_type) {
    const cacheKey = buildCacheKey(tmdb_id, media_type, season);

    env.DB.prepare(
      "INSERT INTO analysis_cache (id, tmdb_id, media_type, season, result_json, cached_at) VALUES (?, ?, ?, ?, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET result_json = excluded.result_json, cached_at = excluded.cached_at"
    )
      .bind(cacheKey, tmdb_id, media_type, season == null ? null : season, JSON.stringify(groqData))
      .run()
      .catch(function (e) {
        console.error('Cache write error:', e);
      });
  }

  const withUsage = await attachUsage(groqData, identity, limit);
  return jsonOk(withUsage);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

// ── Helpers ───────────────────────────────────────────────

function buildCacheKey(tmdb_id, media_type, season) {
  return String(tmdb_id) + ':' + String(media_type) + ':' + String(season == null ? 'all' : season);
}

function mergeCachedFlag(data, cached) {
  var out = {};
  if (data && typeof data === 'object') {
    Object.assign(out, data);
  }
  out._cached = cached;
  return out;
}

function jsonOk(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status: status || 400,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

function buildMessages(input) {
  const title = input.title;
  const year = input.year;
  const overview = input.overview;
  const genres = input.genres;
  const certRating = input.certRating;
  const keywords = input.keywords;
  const type = input.type;
  const childAge = input.childAge;
  const seasonContext = input.seasonContext;

  const ageNote = childAge != null
    ? 'The viewer is ' + childAge + ' years old — tailor the "verdict" section accordingly.'
    : '';

  const seasonNote = seasonContext ? '\nSeason context: ' + seasonContext : '';

  const systemPrompt = 'You are a parental content advisor. Analyse the provided movie or TV show and return a structured JSON breakdown of its content suitability. Be factual, specific, and consistent. Always respond with valid JSON only — no markdown, no preamble.';

  let userPrompt = 'Analyse this title for parental content suitability:\n\n';

  userPrompt += 'Title: ' + title;
  if (year) {
    userPrompt += ' (' + year + ')';
  }
  userPrompt += '\n';

  userPrompt += 'Type: ' + (type || 'Unknown') + '\n';

  if (certRating) {
    userPrompt += 'Rating: ' + certRating + '\n';
  }

  if (genres) {
    userPrompt += 'Genres: ' + genres + '\n';
  }

  if (overview) {
    userPrompt += 'Overview: ' + overview + '\n';
  }

  if (keywords) {
    userPrompt += 'Keywords: ' + keywords;
  }

  userPrompt += seasonNote + '\n';
  userPrompt += ageNote + '\n\n';

  userPrompt += 'Return a JSON object with this exact structure:\n';
  userPrompt += '{\n';
  userPrompt += '  "summary": "2-3 sentence plain-English summary of content concerns",\n';
  userPrompt += '  "categories": [\n';
  userPrompt += '    { "name": "Sex & Nudity",    "level": "none|mild|moderate|strong", "note": "brief specific detail" },\n';
  userPrompt += '    { "name": "Violence & Gore", "level": "none|mild|moderate|strong", "note": "brief specific detail" },\n';
  userPrompt += '    { "name": "Language",        "level": "none|mild|moderate|strong", "note": "brief specific detail" },\n';
  userPrompt += '    { "name": "Drugs & Alcohol", "level": "none|mild|moderate|strong", "note": "brief specific detail" },\n';
  userPrompt += '    { "name": "Horror & Fear",   "level": "none|mild|moderate|strong", "note": "brief specific detail" },\n';
  userPrompt += '    { "name": "LGBTQ+ Themes",   "level": "none|mild|moderate|strong", "note": "brief specific detail" }\n';
  userPrompt += '  ],\n';
  userPrompt += '  "verdicts": {\n';
  userPrompt += '    "young":  { "tier": "safe|warn|danger", "text": "one-line verdict", "sub": "short explanation" },\n';
  userPrompt += '    "teens":  { "tier": "safe|warn|danger", "text": "one-line verdict", "sub": "short explanation" },\n';
  userPrompt += '    "adults": { "tier": "safe|warn|danger", "text": "one-line verdict", "sub": "short explanation" }\n';
  userPrompt += '  }\n';
  userPrompt += '}';

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
}
