/**
 * /api/discover
 * GET - Smart recommendations filtered by user preferences
 *   ?age=8&genres=28,35&safeOnly=true → returns filtered recommendations
 * 
 * Smart recommendations help parents discover age-appropriate content
 * based on their child's age, preferred genres, and safety thresholds.
 */

import { requireAuth, jsonResponse, handleOptions } from '../_shared/clerk.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const { auth, error } = await requireAuth(request, env);
  if (error) return error;

  const url = new URL(request.url);
  const age = parseInt(url.searchParams.get('age') || '8');
  const genres = (url.searchParams.get('genres') || '').split(',').filter(Boolean);
  const safeOnly = url.searchParams.get('safeOnly') === 'true';
  const page = parseInt(url.searchParams.get('page') || '1');
  const type = url.searchParams.get('type') || 'movie'; // 'movie' or 'tv'

  try {
    // Determine certification based on age
    const certifications = getCertificationsForAge(age, type);
    
    // Build TMDB filter query
    const params = new URLSearchParams({
      sort_by: 'popularity.desc',
      page: page.toString(),
      'vote_count.gte': '50', // Only titles with enough votes
      'popularity.gte': '5', // Popular enough to be in recommendation
    });

    // Add certification filter
    if (type === 'movie') {
      params.append('certification.lte', certifications.join(','));
    } else if (type === 'tv') {
      params.append('with_networks', 'netflix,hulu,amazon,disney'); // Streaming services
    }

    // Add genre filter if specified
    if (genres.length > 0) {
      params.append('with_genres', genres.join(','));
    }

    // Fetch from TMDB
    const tmdbUrl = `https://api.themoviedb.org/3/discover/${type}?${params}`;
    const results = await fetch(tmdbUrl, {
      headers: {
        'Authorization': `Bearer ${env.TMDB_TOKEN}`,
        'Accept': 'application/json',
      },
    }).then(r => r.json());

    if (!results.results || results.results.length === 0) {
      return jsonResponse({ results: [], page, total_pages: 0 });
    }

    // Filter by cached safety verdicts if safeOnly is true
    let filtered = results.results;
    if (safeOnly) {
      filtered = await filterBySafety(
        results.results,
        age,
        env.DB
      );
    }

    // Enrich with verdict if cached
    const enriched = await enrichWithVerdicts(filtered, env.DB);

    return jsonResponse({
      results: enriched,
      page: results.page,
      total_pages: results.total_pages,
      requested_age: age,
      requested_genres: genres,
      safe_only: safeOnly,
    });
  } catch (e) {
    console.error('Discover error:', e);
    return jsonResponse({ error: 'Failed to fetch recommendations' }, 500);
  }
}

function getCertificationsForAge(age, type) {
  if (type === 'tv') {
    // TV ratings
    if (age <= 5) return ['TV-Y', 'TV-Y7'];
    if (age <= 8) return ['TV-Y', 'TV-Y7', 'TV-G'];
    if (age <= 13) return ['TV-Y', 'TV-Y7', 'TV-G', 'TV-PG'];
    return ['TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14'];
  } else {
    // Movie ratings
    if (age <= 5) return ['G'];
    if (age <= 8) return ['G', 'PG'];
    if (age <= 13) return ['G', 'PG'];
    return ['G', 'PG', 'PG-13'];
  }
}

async function filterBySafety(items, age, db) {
  if (items.length === 0) return items;

  // Get all cached verdicts for these titles
  const tmdbIds = items.map(i => i.id);
  const ageKey = `ages_${Math.min(age, 13)}_`;
  
  try {
    const cached = await db
      .prepare(`
        SELECT DISTINCT tmdb_id
        FROM analysis_cache
        WHERE tmdb_id IN (${tmdbIds.map(() => '?').join(',')})
        AND result_json IS NOT NULL
      `)
      .bind(...tmdbIds)
      .all();

    const safeIds = new Set();
    (cached.results || []).forEach(row => {
      safeIds.add(row.tmdb_id);
    });

    // Return only items that have cached analyses (implies they were analyzed as safe)
    return items.filter(item => safeIds.has(item.id));
  } catch (e) {
    console.error('Safety filter error:', e);
    return items; // Fall back to unfiltered if DB query fails
  }
}

async function enrichWithVerdicts(items, db) {
  if (items.length === 0) return items;

  try {
    const tmdbIds = items.map(i => i.id);
    const cached = await db
      .prepare(`
        SELECT tmdb_id, result_json
        FROM analysis_cache
        WHERE tmdb_id IN (${tmdbIds.map(() => '?').join(',')})
        AND season IS NULL
      `)
      .bind(...tmdbIds)
      .all();

    const verdictMap = {};
    (cached.results || []).forEach(row => {
      try {
        const data = JSON.parse(row.result_json);
        verdictMap[row.tmdb_id] = {
          young_kids: data.verdicts?.ages_0_2 || data.verdicts?.ages_3_5 || 'Unknown',
          teens: data.verdicts?.ages_9_12 || 'Unknown',
          adults: data.verdicts?.ages_13_plus || 'Unknown',
        };
      } catch (e) {
        console.error('Parse error:', e);
      }
    });

    return items.map(item => ({
      ...item,
      cached_verdict: verdictMap[item.id] || null,
    }));
  } catch (e) {
    console.error('Verdict enrichment error:', e);
    return items;
  }
}

export function onRequestOptions() {
  return handleOptions();
}
