import { requireAuth, jsonResponse, handleOptions } from '../_shared/clerk.js';

const GENRE_NAMES = {
  16: 'Animation',
  18: 'Drama',
  27: 'Horror',
  28: 'Action',
  35: 'Comedy',
  53: 'Thriller',
  80: 'Crime',
  99: 'Documentary',
  10751: 'Family',
  10759: 'Adventure',
  10762: 'Kids',
};

const VIOLENT_GENRES = new Set([27, 28, 53, 80, 10752]);
const FALLBACK_RECOMMENDATIONS = [
  { id: 1022789, media_type: 'movie', title: 'Inside Out 2', poster_path: null, genre_ids: [16, 35, 10751], popularity: 80 },
  { id: 1241982, media_type: 'movie', title: 'Moana 2', poster_path: null, genre_ids: [16, 10751, 12], popularity: 72 },
  { id: 1184918, media_type: 'movie', title: 'The Wild Robot', poster_path: null, genre_ids: [16, 10751, 878], popularity: 68 },
  { id: 82728, media_type: 'tv', title: 'Bluey', poster_path: null, genre_ids: [16, 10762, 10751], popularity: 76 },
  { id: 202879, media_type: 'movie', title: 'Flow', poster_path: null, genre_ids: [16, 12, 10751], popularity: 58 },
  { id: 211672, media_type: 'movie', title: 'Migration', poster_path: null, genre_ids: [16, 12, 35, 10751], popularity: 61 },
];

export async function onRequestGet(context) {
  const { request, env } = context;
  const { auth, error } = await requireAuth(request, env);
  if (error) return error;

  const url = new URL(request.url);
  const profileId = url.searchParams.get('profile_id');
  const type = url.searchParams.get('type') === 'tv' ? 'tv' : 'movie';

  try {
    const [profilesRes, historyRes, listsRes] = await Promise.all([
      env.DB.prepare('SELECT id, name, age, emoji, blocked_categories FROM profiles WHERE user_id = ? ORDER BY created_at ASC').bind(auth.userId).all(),
      env.DB.prepare('SELECT tmdb_id, media_type, title, searched_at, profile_id FROM history WHERE user_id = ? ORDER BY searched_at DESC LIMIT 20').bind(auth.userId).all(),
      env.DB.prepare('SELECT tmdb_id, media_type, title, list_type, saved_at, profile_id FROM lists WHERE user_id = ? ORDER BY saved_at DESC LIMIT 30').bind(auth.userId).all(),
    ]);

    const profiles = profilesRes.results || [];
    const history = historyRes.results || [];
    const lists = listsRes.results || [];
    const profile = profiles.find((p) => p.id === profileId) || profiles[0] || null;
    const age = clampAge(profile?.age ?? 8);
    const blockedCategories = parseBlockedCategories(profile?.blocked_categories);

    const relevantHistory = history.filter((item) => item.media_type === type && (!profile || !item.profile_id || item.profile_id === profile.id));
    const relevantLists = lists.filter((item) => item.media_type === type && (!profile || !item.profile_id || item.profile_id === profile.id));
    const seenIds = new Set([...relevantHistory, ...relevantLists].map((item) => String(item.tmdb_id)));
    const blockedIds = new Set(relevantLists.filter((item) => item.list_type === 'blocked').map((item) => String(item.tmdb_id)));
    const seedEntries = [
      ...relevantLists.filter((item) => item.list_type === 'approved' || item.list_type === 'watchlater').slice(0, 6),
      ...relevantHistory.slice(0, 6),
    ];
    const seedIds = [...new Set(seedEntries.map((item) => Number(item.tmdb_id)).filter(Boolean))].slice(0, 8);

    const seedGenreProfile = env.TMDB_TOKEN
      ? await buildSeedGenreProfile(seedIds, type, env.TMDB_TOKEN)
      : { counts: new Map(), titles: [], topGenres: [] };
    const candidateItems = env.TMDB_TOKEN
      ? await fetchCandidatePool(type, age, env.TMDB_TOKEN, seedGenreProfile.topGenres)
      : FALLBACK_RECOMMENDATIONS.filter((item) => item.media_type === type);

    const verdictMap = await loadVerdictMap(candidateItems.map((item) => item.id), env.DB);
    const recommendations = candidateItems
      .filter((item) => !seenIds.has(String(item.id)) && !blockedIds.has(String(item.id)))
      .map((item) => decorateRecommendation(item, {
        age,
        blockedCategories,
        seedGenreProfile,
        verdict: verdictMap.get(item.id) || null,
        seedEntries,
      }))
      .filter((item) => item.score > -2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    return jsonResponse({
      profile: profile ? { id: profile.id, name: profile.name, age: profile.age, emoji: profile.emoji || '' } : null,
      type,
      results: recommendations,
    });
  } catch (err) {
    console.error('Recommendations error:', err);
    return jsonResponse({ error: 'Failed to load recommendations' }, 500);
  }
}

async function fetchCandidatePool(type, age, token, topGenres) {
  const batches = [
    discoverTitles(type, age, token, ''),
    discoverTitles(type, age, token, topGenres[0] ? `&with_genres=${topGenres[0]}` : ''),
    discoverTitles(type, age, token, topGenres.length > 1 ? `&with_genres=${topGenres.slice(0, 2).join(',')}` : ''),
  ];

  const settled = await Promise.allSettled(batches);
  const merged = [];
  const seen = new Set();
  settled.forEach((result) => {
    if (result.status !== 'fulfilled') return;
    result.value.forEach((item) => {
      if (!item || seen.has(String(item.id))) return;
      seen.add(String(item.id));
      merged.push(item);
    });
  });
  return merged;
}

async function discoverTitles(type, age, token, extraQuery) {
  const params = new URLSearchParams({
    include_adult: 'false',
    page: '1',
    sort_by: 'popularity.desc',
    'vote_count.gte': '120',
  });

  if (type === 'movie') {
    params.set('certification_country', 'US');
    params.set('certification.lte', movieRatingForAge(age));
  } else if (age <= 7) {
    params.set('with_genres', '16,10762');
  }

  const url = `https://api.themoviedb.org/3/discover/${type}?${params.toString()}${extraQuery}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data.results) ? data.results.slice(0, 18) : [];
}

async function buildSeedGenreProfile(seedIds, type, token) {
  const counts = new Map();
  const titles = [];
  if (!seedIds.length) return { counts, titles, topGenres: [] };

  const details = await Promise.allSettled(seedIds.map((id) => fetchTmdbDetails(id, type, token)));
  details.forEach((result) => {
    if (result.status !== 'fulfilled' || !result.value) return;
    const item = result.value;
    titles.push(item.title || item.name || 'recent picks');
    const genres = Array.isArray(item.genres) ? item.genres : [];
    genres.forEach((genre) => counts.set(genre.id, (counts.get(genre.id) || 0) + 1));
  });

  const topGenres = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => id);

  return { counts, titles, topGenres };
}

async function fetchTmdbDetails(id, type, token) {
  const response = await fetch(`https://api.themoviedb.org/3/${type}/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) return null;
  return response.json();
}

async function loadVerdictMap(ids, db) {
  const verdictMap = new Map();
  if (!ids.length) return verdictMap;

  const rows = await db.prepare(`
    SELECT tmdb_id, result_json
    FROM analysis_cache
    WHERE tmdb_id IN (${ids.map(() => '?').join(',')})
    AND season IS NULL
  `).bind(...ids).all();

  (rows.results || []).forEach((row) => {
    try {
      verdictMap.set(row.tmdb_id, JSON.parse(row.result_json));
    } catch {}
  });
  return verdictMap;
}

function decorateRecommendation(item, context) {
  const genreIds = Array.isArray(item.genre_ids) ? item.genre_ids : [];
  const genreMatches = genreIds.filter((id) => context.seedGenreProfile.counts.has(id));
  const verdictTier = getVerdictTierForAge(context.verdict, context.age);
  const violent = genreIds.some((id) => VIOLENT_GENRES.has(id));
  const isFamilyLean = genreIds.includes(16) || genreIds.includes(10751) || genreIds.includes(10762);

  let score = Math.min(Number(item.popularity || 0) / 18, 5);
  score += genreMatches.reduce((sum, id) => sum + Math.min(context.seedGenreProfile.counts.get(id) || 0, 2), 0) * 2.2;

  if (context.age <= 8 && isFamilyLean) score += 3;
  if (context.age <= 11 && isFamilyLean) score += 2;
  if (violent && context.age <= 11) score -= 5;
  if (violent && context.blockedCategories.includes('Violence')) score -= 8;

  if (verdictTier === 'safe') score += 5;
  if (verdictTier === 'caution') score += 1;
  if (verdictTier === 'not_recommended') score -= 7;

  const seedLabel = context.seedEntries[0]?.title || context.seedGenreProfile.titles[0] || null;
  let reason = 'Popular with families checking titles right now.';
  if (verdictTier === 'safe') {
    reason = `Cached verdict looks like a strong fit for age ${context.age}.`;
  } else if (genreMatches.length && seedLabel) {
    reason = `Similar in tone to ${seedLabel} and other recent picks.`;
  } else if (context.age <= 8 && isFamilyLean) {
    reason = 'Leans family-friendly for younger kids.';
  } else if (context.blockedCategories.includes('Violence') && !violent) {
    reason = 'Avoids the more intense action and horror genres.';
  }

  const primaryGenre = GENRE_NAMES[genreIds[0]] || (item.media_type === 'tv' ? 'TV Series' : 'Movie');

  return {
    id: item.id,
    media_type: item.media_type || (item.first_air_date ? 'tv' : 'movie'),
    title: item.title || item.name || 'Untitled',
    year: String(item.release_date || item.first_air_date || '').slice(0, 4) || null,
    poster_path: item.poster_path || null,
    genre_label: primaryGenre,
    match_score: Math.max(64, Math.min(98, Math.round(70 + score * 4))),
    reason,
    score,
  };
}

function getVerdictTierForAge(verdict, age) {
  if (!verdict?.verdicts) return null;
  const key = age <= 2 ? 'ages_0_2' : age <= 5 ? 'ages_3_5' : age <= 8 ? 'ages_6_8' : age <= 12 ? 'ages_9_12' : 'ages_13_plus';
  return verdict.verdicts?.[key]?.tier || null;
}

function parseBlockedCategories(value) {
  if (!value) return [];
  try {
    return Array.isArray(value) ? value : JSON.parse(value);
  } catch {
    return [];
  }
}

function movieRatingForAge(age) {
  if (age <= 5) return 'G';
  if (age <= 11) return 'PG';
  return 'PG-13';
}

function clampAge(age) {
  const n = Number(age || 8);
  return Math.max(1, Math.min(17, Number.isFinite(n) ? n : 8));
}

export async function onRequestOptions() {
  return handleOptions();
}
