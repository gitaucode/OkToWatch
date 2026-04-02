/**
 * /api/episodes/analyze
 * POST - Analyze a specific episode and cache the verdict
 * Body: { tmdb_id, season, episode, title }
 */

import { requireAuth, jsonResponse, handleOptions } from '../_shared/clerk.js';

const GROQ_MODEL = 'llama-3.3-70b-versatile';

async function analyzeEpisodeWithAI(episodeInfo, env) {
  const prompt = `You are a parental content advisor. Analyze this TV episode for child safety.

Episode: ${episodeInfo.title} - Season ${episodeInfo.season}, Episode ${episodeInfo.episode}
Overview: ${episodeInfo.overview || 'No description'}
First Air Date: ${episodeInfo.air_date || 'Unknown'}

Provide a verdict for each age group and list content concerns:

Return ONLY valid JSON (no markdown, no extra text):
{
  "verdicts": {
    "ages_0_2": "Not suitable",
    "ages_3_5": "Not suitable",
    "ages_6_8": "verdict",
    "ages_9_12": "verdict",
    "ages_13_plus": "verdict"
  },
  "categories": [
    {"category": "Violence", "severity": "strong|moderate|mild", "note": "description"},
    {"category": "Language", "severity": "strong|moderate|mild", "note": "description"}
  ],
  "episode_specific_concerns": "Any unique issues for this specific episode (e.g., 'This episode contains a major character death' or 'Contains intense battle sequences')"
}`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || '{}';
  
  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = content;
  if (jsonStr.includes('```json')) {
    jsonStr = jsonStr.split('```json')[1].split('```')[0];
  } else if (jsonStr.includes('```')) {
    jsonStr = jsonStr.split('```')[1].split('```')[0];
  }
  
  return JSON.parse(jsonStr.trim());
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { auth, error } = await requireAuth(request, env);
  if (error) return error;

  try {
    const body = await request.json();
    const { tmdb_id, season, episode, title } = body;

    if (!tmdb_id || !season || !episode || !title) {
      return jsonResponse({ 
        error: 'tmdb_id, season, episode, and title are required' 
      }, 400);
    }

    const cacheKey = `${tmdb_id}:${season}:${episode}`;

    // Check cache first
    const cached = await env.DB
      .prepare(`
        SELECT result_json, expires_at
        FROM episode_analysis
        WHERE cache_key = ?
      `)
      .bind(cacheKey)
      .first();

    if (cached && new Date(cached.expires_at) > new Date()) {
      return jsonResponse({
        verdict: JSON.parse(cached.result_json),
        cached: true,
        cacheKey,
      });
    }

    // Fetch episode data from TMDB
    const episodeData = await fetch(
      `https://api.themoviedb.org/3/tv/${tmdb_id}/season/${season}/episode/${episode}`,
      {
        headers: {
          'Authorization': `Bearer ${env.TMDB_TOKEN}`,
          'Accept': 'application/json',
        },
      }
    ).then(r => r.json());

    // Analyze with AI
    const verdict = await analyzeEpisodeWithAI({
      title,
      season,
      episode,
      overview: episodeData.overview,
      air_date: episodeData.air_date,
    }, env);

    // Cache the result
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days

    await env.DB
      .prepare(`
        INSERT INTO episode_analysis (cache_key, tmdb_id, season_number, episode_number, result_json, cached_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(cache_key) DO UPDATE SET
          result_json = excluded.result_json,
          cached_at = excluded.cached_at,
          expires_at = excluded.expires_at
      `)
      .bind(cacheKey, tmdb_id, season, episode, JSON.stringify(verdict), now.toISOString(), expiresAt.toISOString())
      .run();

    return jsonResponse({
      verdict,
      cached: false,
      cacheKey,
    });
  } catch (e) {
    console.error('Episode analysis error:', e);
    return jsonResponse({ error: 'Failed to analyze episode' }, 500);
  }
}

export function onRequestOptions() {
  return handleOptions();
}
