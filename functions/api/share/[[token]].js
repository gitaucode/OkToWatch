/**
 * GET /api/share/:token
 * Public endpoint — returns cached analysis for a shared token.
 * No authentication required, but token must be valid and not expired.
 */

export async function onRequestGet(context) {
  const { request, env, params } = context;

  const token = params.token ? (Array.isArray(params.token) ? params.token[0] : params.token) : null;
  if (!token) return jsonError('Token is required', 400);

  try {
    // Fetch the sharing token record
    const share = await env.DB
      .prepare('SELECT * FROM sharing_tokens WHERE id = ?')
      .bind(token)
      .first();

    if (!share) return jsonError('Share not found', 404);

    // Check expiration
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return jsonError('Share has expired', 410);
    }

    // Fetch the cached analysis
    const cacheKey = buildCacheKey(share.tmdb_id, share.media_type, share.season);
    const cache = await env.DB
      .prepare('SELECT result_json FROM analysis_cache WHERE id = ?')
      .bind(cacheKey)
      .first();

    if (!cache) {
      // Analysis hasn't been generated yet (sharing a title that was never analyzed)
      return jsonOk({
        share: {
          token,
          tmdb_id: share.tmdb_id,
          media_type: share.media_type,
          season: share.season,
          created_at: share.created_at,
        },
        analysis: null,
        message: 'Analysis not yet available for this title',
      });
    }

    return jsonOk({
      share: {
        token,
        tmdb_id: share.tmdb_id,
        media_type: share.media_type,
        season: share.season,
        created_at: share.created_at,
      },
      analysis: JSON.parse(cache.result_json),
    });
  } catch (e) {
    console.error('Share fetch error:', e);
    return jsonError('Internal server error', 500);
  }
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────

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
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
