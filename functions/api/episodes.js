/**
 * /api/episodes
 * GET - Get episode analysis for a TV show season
 *   ?tmdb_id=1399&season=1 → returns verdicts for all episodes in that season
 * 
 * Episode-level analysis helps parents identify which specific episodes
 * are risky for their child, so they can skip problematic ones.
 */

import { requireAuth, jsonResponse, handleOptions } from '../_shared/clerk.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const { auth, error } = await requireAuth(request, env);
  if (error) return error;

  const url = new URL(request.url);
  const tmdb_id = url.searchParams.get('tmdb_id');
  const season = url.searchParams.get('season');

  if (!tmdb_id || !season) {
    return jsonResponse({ error: 'tmdb_id and season are required' }, 400);
  }

  try {
    // Fetch season data from TMDB to get episodes
    const seasonData = await fetch(
      `https://api.themoviedb.org/3/tv/${tmdb_id}/season/${season}`,
      {
        headers: {
          'Authorization': `Bearer ${env.TMDB_TOKEN}`,
          'Accept': 'application/json',
        },
      }
    ).then(r => r.json());

    if (!seasonData.episodes || seasonData.episodes.length === 0) {
      return jsonResponse({ episodes: [] });
    }

    // Get cached analyses for these episodes
    const episodes = seasonData.episodes;
    const cacheKeys = episodes.map(
      ep => `${tmdb_id}:${season}:${ep.episode_number}`
    );

    const cachedResults = await env.DB
      .prepare(`
        SELECT cache_key, result_json
        FROM episode_analysis
        WHERE cache_key IN (${cacheKeys.map(() => '?').join(',')})
      `)
      .bind(...cacheKeys)
      .all();

    const cachedMap = {};
    (cachedResults.results || []).forEach(row => {
      cachedMap[row.cache_key] = JSON.parse(row.result_json);
    });

    // Build episode list with verdicts
    const result = episodes.map(ep => {
      const cacheKey = `${tmdb_id}:${season}:${ep.episode_number}`;
      const analysis = cachedMap[cacheKey];
      
      return {
        episode_number: ep.episode_number,
        name: ep.name,
        air_date: ep.air_date,
        overview: ep.overview,
        verdict: analysis ? analysis.verdicts : null,
        categories: analysis ? analysis.categories : null,
        cached: !!analysis,
      };
    });

    return jsonResponse({ episodes: result });
  } catch (e) {
    console.error('Episodes fetch error:', e);
    return jsonResponse({ error: 'Failed to fetch episodes' }, 500);
  }
}

export function onRequestOptions() {
  return handleOptions();
}
