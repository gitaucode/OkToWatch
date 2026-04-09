const HERO_TITLES = [
  { title: 'Inside Out 2', type: 'Movie' },
  { title: 'Moana', type: 'Movie' },
  { title: 'The Wild Robot', type: 'Movie' },
  { title: 'Bluey', type: 'TV Show' },
  { title: 'Wednesday', type: 'TV Show' },
  { title: 'Encanto', type: 'Movie' },
  { title: 'Frozen', type: 'Movie' },
  { title: 'Lilo & Stitch', type: 'Movie' },
  { title: 'Paddington 2', type: 'Movie' },
  { title: 'Kung Fu Panda 4', type: 'Movie' },
  { title: 'Despicable Me 4', type: 'Movie' },
  { title: 'Blue Beetle', type: 'Movie' },
];

import { jsonWithCors, optionsResponse } from '../../_shared/cors.js';

export async function onRequestGet({ request, env }) {
  try {
    if (!env?.TMDB_TOKEN) {
      return json([], request, env);
    }

    const posters = [];
    for (const item of HERO_TITLES) {
      const result = await searchTmdb(item.title, item.type === 'TV Show' ? 'tv' : 'movie', env.TMDB_TOKEN);
      if (!result?.poster_path) continue;
      posters.push({
        title: item.title,
        type: item.type,
        poster_path: result.poster_path,
        tmdb_id: result.id,
        media_type: result.media_type,
      });
    }

    return json(posters, request, env);
  } catch (error) {
    console.error('Hero posters error:', error);
    return json([], request, env);
  }
}

async function searchTmdb(title, mediaTypeHint, token) {
  const url = `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(title)}&page=1&include_adult=false`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) return null;
  const data = await response.json();
  const results = Array.isArray(data.results) ? data.results : [];

  const exact = results.find(item => {
    if (!['movie', 'tv'].includes(item.media_type)) return false;
    const candidate = (item.title || item.name || '').toLowerCase();
    if (candidate !== title.toLowerCase()) return false;
    return mediaTypeHint ? item.media_type === mediaTypeHint : true;
  });

  if (exact) return exact;
  return results.find(item => ['movie', 'tv'].includes(item.media_type) && item.poster_path) || null;
}

function json(data, request, env) {
  return jsonWithCors(data, request, env, {
    cacheControl: 'public, max-age=900',
    methods: 'GET, OPTIONS',
    headers: 'Content-Type',
    maxAge: 86400
  });
}

export function onRequestOptions({ request, env }) {
  return optionsResponse(request, env, {
    methods: 'GET, OPTIONS',
    headers: 'Content-Type',
    maxAge: 86400
  });
}
