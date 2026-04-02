/**
 * GET /api/tmdb/*
 * Wildcard proxy to TMDB API — keeps the API key server-side.
 * Example: /api/tmdb/search/multi?query=inception
 *          → https://api.themoviedb.org/3/search/multi?query=inception&api_key=...
 */

export async function onRequestGet(context) {
  const { request, env, params } = context;

  const tmdbPath = params.path ? (Array.isArray(params.path) ? params.path.join('/') : params.path) : '';
  const url      = new URL(request.url);
  const search   = url.searchParams.toString();

  const tmdbUrl = `https://api.themoviedb.org/3/${tmdbPath}${search ? '?' + search : ''}`;

  const res = await fetch(tmdbUrl, {
    headers: {
      'Authorization': `Bearer ${env.TMDB_TOKEN}`,
      'Accept': 'application/json',
    },
  });

  const data = await res.text();

  return new Response(data, {
    status: res.status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=300', // 5-min cache for TMDB responses
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
