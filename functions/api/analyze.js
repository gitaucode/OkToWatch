/**
 * POST /api/analyze
 * Content analysis with D1 caching.
 *
 * Request body:
 *   { tmdb_id, media_type, season?,        ← cache key fields
 *     title, year, overview, genres,        ← context for Groq
 *     certRating, keywords, type, childAge,
 *     seasonContext? }
 *
 * Cache key: "{tmdb_id}:{media_type}:{season|all}"
 * TTL: 90 days — results older than this are re-fetched from Groq.
 *
 * childAge is excluded from the cache key: the base breakdown is the same
 * for all ages; the frontend applies age-specific verdict rendering
 * client-side. One cached result serves all users.
 */

const CACHE_TTL_DAYS = 90;
const MODEL          = 'llama-3.3-70b-versatile';

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); } catch {
    return jsonError('Invalid JSON', 400);
  }

  const {
    tmdb_id, media_type, season = null,
    title, year, overview, genres, certRating, keywords, type, childAge, seasonContext,
  } = body;

  if (!title) return jsonError('title is required', 400);

  // ── 1. Cache lookup ──────────────────────────────────────────────────────
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
          // Cache hit — return immediately, skip Groq entirely
          return jsonOk({ ...JSON.parse(row.result_json), _cached: true });
        }
        // Stale — fall through to re-fetch Groq, then overwrite cache row
      }
    } catch (e) {
      // D1 unavailable — proceed without cache rather than failing
      console.error('Cache lookup error:', e);
    }
  }

  // ── 2. Build Groq messages server-side ───────────────────────────────────
  const messages = buildMessages({ title, year, overview, genres, certRating, keywords, type, childAge, seasonContext });

  // ── 3. Call Groq ─────────────────────────────────────────────────────────
  const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ model: MODEL, messages, stream: false }),
  });

  if (!groqRes.ok) {
    const err = await groqRes.text();
    return jsonError(`Groq error: ${err}`, groqRes.status);
  }

  const groqData = await groqRes.json();

  // ── 4. Store result in cache (fire-and-forget) ───────────────────────────
  if (env.DB && tmdb_id && media_type) {
    const cacheKey = buildCacheKey(tmdb_id, media_type, season);
    env.DB
      .prepare(`
        INSERT INTO analysis_cache (id, tmdb_id, media_type, season, result_json, cached_at)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          result_json = excluded.result_json,
          cached_at   = excluded.cached_at
      `)
      .bind(cacheKey, tmdb_id, media_type, season ?? null, JSON.stringify(groqData))
      .run()
      .catch(e => console.error('Cache write error:', e));
  }

  // ── 5. Return to client ───────────────────────────────────────────────────
  return jsonOk(groqData);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────

function buildCacheKey(tmdb_id, media_type, season) {
  return `${tmdb_id}:${media_type}:${season ?? 'all'}`;
}

function jsonOk(data) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type':                'application/json',
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
  const ageNote    = childAge != null ? `The viewer is ${childAge} years old — tailor the "verdict" section accordingly.` : '';
  const seasonNote = seasonContext ? `\nSeason context: ${seasonContext}` : '';

  const systemPrompt = `You are a parental content advisor. Analyse the provided movie or TV show and return a structured JSON breakdown of its content suitability. Be factual, specific, and consistent. Always respond with valid JSON only — no markdown, no preamble.`;

  const userPrompt = `Analyse this title for parental content suitability:

Title: ${title}${year ? ` (${year})` : ''}
Type: ${type || 'Unknown'}
${certRating ? `Rating: ${certRating}` : ''}
${genres ? `Genres: ${genres}` : ''}
${overview ? `Overview: ${overview}` : ''}
${keywords ? `Keywords: ${keywords}` : ''}${seasonNote}
${ageNote}

Return a JSON object with this exact structure:
{
  "summary": "2-3 sentence plain-English summary of content concerns",
  "categories": [
    { "name": "Sex & Nudity",    "level": "none|mild|moderate|strong", "note": "brief specific detail" },
    { "name": "Violence & Gore", "level": "none|mild|moderate|strong", "note": "brief specific detail" },
    { "name": "Language",        "level": "none|mild|moderate|strong", "note": "brief specific detail" },
    { "name": "Drugs & Alcohol", "level": "none|mild|moderate|strong", "note": "brief specific detail" },
    { "name": "Horror & Fear",   "level": "none|mild|moderate|strong", "note": "brief specific detail" },
    { "name": "LGBTQ+ Themes",   "level": "none|mild|moderate|strong", "note": "brief specific detail" }
  ],
  "verdicts": {
    "young":  { "tier": "safe|warn|danger", "text": "one-line verdict", "sub": "short explanation" },
    "teens":  { "tier": "safe|warn|danger", "text": "one-line verdict", "sub": "short explanation" },
    "adults": { "tier": "safe|warn|danger", "text": "one-line verdict", "sub": "short explanation" }
  }
}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt   },
  ];
}
