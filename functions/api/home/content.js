const CURATED = {
  trending: [
    { title: 'Inside Out 2', type: 'Movie', age_guidance: 'Ages 6+', safety_label: 'Safe', summary: 'Big feelings, gentle tone, family-friendly emotional themes.' },
    { title: 'Bluey', type: 'TV Show', age_guidance: 'Ages 3+', safety_label: 'Safe', summary: 'Very parent-friendly, calm humor, easy family watch.' },
    { title: 'Moana', type: 'Movie', age_guidance: 'Ages 6+', safety_label: 'Safe', summary: 'Adventure with mild peril and strong family themes.' },
    { title: 'Minecraft', type: 'Game', search_query: 'A Minecraft Movie', age_guidance: 'Ages 8+', safety_label: 'Caution', summary: 'Creative and social, but online play needs parent awareness.' },
    { title: 'Wednesday', type: 'TV Show', age_guidance: 'Teens', safety_label: 'Caution', summary: 'Dark humor, creepy tone, better for older kids.' },
  ],
  safe_picks: [
    { title: 'Inside Out 2', type: 'Movie', age_guidance: 'Ages 6+', safety_label: 'Safe', summary: 'Emotional but family-friendly, with themes most kids can handle well.', deck: 'Recognizable, current, and a strong first impression for parents landing on the site.' },
    { title: 'Bluey', type: 'TV Show', age_guidance: 'Ages 3+', safety_label: 'Safe', summary: 'Reliable pick for younger kids and one of the easiest family watches.', deck: 'A trusted go-to for families who want something safe without doing research first.' },
    { title: 'Moana', type: 'Movie', age_guidance: 'Ages 6+', safety_label: 'Safe', summary: 'Adventure, music, and mild peril without pushing too far.', deck: 'A familiar title that instantly communicates the product category and use case.' },
    { title: 'The Wild Robot', type: 'Movie', age_guidance: 'Ages 7+', safety_label: 'Safe', summary: 'Warm-hearted story with action moments that stay manageable for most families.', deck: 'A newer family title that helps the homepage feel current instead of static.' },
  ],
  popular: [
    { title: 'Inside Out 2', type: 'Movie', age_guidance: 'Ages 6+', safety_label: 'Safe', summary: 'One of the most recognizable family titles right now.' },
    { title: 'Bluey', type: 'TV Show', age_guidance: 'Ages 3+', safety_label: 'Safe', summary: 'A dependable option for family co-viewing.' },
    { title: 'Moana', type: 'Movie', age_guidance: 'Ages 6+', safety_label: 'Safe', summary: 'Still a strong family-night favorite.' },
    { title: 'Wednesday', type: 'TV Show', age_guidance: 'Teens', safety_label: 'Caution', summary: 'Popular older-kid and teen pick.' },
    { title: 'Minecraft', type: 'Game', search_query: 'A Minecraft Movie', age_guidance: 'Ages 8+', safety_label: 'Caution', summary: 'Huge recognition value for parents with gaming kids.' },
  ],
};

export async function onRequestGet({ env }) {
  try {
    if (!env?.TMDB_TOKEN) {
      return json(CURATED);
    }

    const enriched = {};
    for (const [section, items] of Object.entries(CURATED)) {
      enriched[section] = await Promise.all(items.map(item => enrichItem(item, env)));
    }

    return json(enriched);
  } catch (error) {
    console.error('Homepage content error:', error);
    return json(CURATED);
  }
}

async function enrichItem(item, env) {
  const mediaTypeHint = item.type === 'TV Show' ? 'tv' : item.type === 'Movie' ? 'movie' : null;
  const result = await searchTmdb(item.search_query || item.title, mediaTypeHint, env.TMDB_TOKEN);
  if (!result) return item;

  return {
    ...item,
    tmdb_id: result.id,
    media_type: result.media_type,
    poster_path: result.poster_path || null,
    year: getYear(result),
  };
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

  const preferred = results.find(item => {
    if (!['movie', 'tv'].includes(item.media_type)) return false;
    const candidate = (item.title || item.name || '').toLowerCase();
    if (candidate !== title.toLowerCase()) return false;
    return mediaTypeHint ? item.media_type === mediaTypeHint : true;
  });

  if (preferred) return preferred;

  return results.find(item => ['movie', 'tv'].includes(item.media_type)) || null;
}

function getYear(item) {
  const value = item.release_date || item.first_air_date || '';
  return value ? String(value).slice(0, 4) : null;
}

function json(data) {
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=900',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
