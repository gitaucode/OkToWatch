import { jsonWithCors, optionsResponse } from '../../_shared/cors.js';

export async function onRequestGet(context) {
  const { request, env, params } = context;

  try {
    const tmdbPath = params.path
      ? (Array.isArray(params.path) ? params.path.join('/') : params.path)
      : '';

    const url = new URL(request.url);
    const search = url.searchParams.toString();

    const fullPath = `${tmdbPath}${search ? '?' + search : ''}`;

    const cacheKey = getCacheKey(tmdbPath);

    if (cacheKey) {
      const cached = await env.DB
        .prepare(`
          SELECT data, expires_at
          FROM tmdb_cache
          WHERE cache_key = ?
          LIMIT 1
        `)
        .bind(cacheKey)
        .first();

      if (cached && cached.expires_at > Date.now()) {
        return jsonResponse(JSON.parse(cached.data), true, request, env);
      }
    }

    const tmdbUrl = `https://api.themoviedb.org/3/${fullPath}`;

    const res = await fetch(tmdbUrl, {
      headers: {
        Authorization: `Bearer ${env.TMDB_TOKEN}`,
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      return jsonWithCors(
        { error: 'TMDB request failed' },
        request,
        env,
        {
          status: res.status,
          methods: 'GET, OPTIONS',
          headers: 'Content-Type',
          maxAge: 86400
        }
      );
    }

    const data = await res.json();

    if (cacheKey) {
      const now = Date.now();
      const expiresAt = now + (24 * 60 * 60 * 1000);

      await env.DB.prepare(`
        DELETE FROM tmdb_cache
        WHERE expires_at < (strftime('%s','now') * 1000)
      `).run();

      await env.DB.prepare(`
        INSERT OR REPLACE INTO tmdb_cache
        (cache_key, data, cached_at, expires_at)
        VALUES (?, ?, ?, ?)
      `)
        .bind(cacheKey, JSON.stringify(data), now, expiresAt)
        .run();
    }

    return jsonResponse(data, false, request, env);

  } catch (err) {
    console.error('TMDB proxy error:', err);
    return jsonWithCors(
      { error: 'Internal error' },
      request,
      env,
      {
        status: 500,
        methods: 'GET, OPTIONS',
        headers: 'Content-Type',
        maxAge: 86400
      }
    );
  }
}

function getCacheKey(path) {
  const parts = path.split('/');

  if (parts[0] === 'movie' && parts[1] && !parts[2]) {
    return `movie:${parts[1]}:details`;
  }

  if (parts[0] === 'movie' && parts[1] && parts[2] === 'credits') {
    return `movie:${parts[1]}:credits`;
  }

  if (parts[0] === 'tv' && parts[1] && !parts[2]) {
    return `tv:${parts[1]}:details`;
  }

  if (parts[0] === 'tv' && parts[1] && parts[2] === 'credits') {
    return `tv:${parts[1]}:credits`;
  }

  return null;
}

function jsonResponse(data, cached = false, request, env) {
  return jsonWithCors({
    ...data,
    _cached: cached,
  }, request, env, {
    cacheControl: 'no-store',
    methods: 'GET, OPTIONS',
    headers: 'Content-Type',
    maxAge: 86400
  });
}

export async function onRequestOptions(context) {
  return optionsResponse(context.request, context.env, {
    methods: 'GET, OPTIONS',
    headers: 'Content-Type',
    maxAge: 86400
  });
}
