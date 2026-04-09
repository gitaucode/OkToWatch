/**
 * /api/verdicts
 * GET — fetch cached verdict summaries for a list of TMDB IDs
 * Query params: ids=123,456,789 (comma-separated TMDB IDs)
 * Returns: { [id]: { level, summary } } for IDs with cached verdicts
 */

import { jsonWithCors, optionsResponse } from '../_shared/cors.js';

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return jsonWithCors({}, request, env);
  }

  const url = new URL(request.url);
  const idsParam = url.searchParams.get('ids');

  if (!idsParam) {
    return jsonWithCors({}, request, env);
  }

  const ids = idsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

  if (!ids.length) {
    return jsonWithCors({}, request, env);
  }

  try {
    // Query analysis_cache for these IDs
    const placeholders = ids.map(() => '?').join(',');
    const query = `
      SELECT tmdb_id, result_json 
      FROM analysis_cache 
      WHERE tmdb_id IN (${placeholders})
      LIMIT ${ids.length}
    `;

    const rows = await env.DB.prepare(query).bind(...ids).all();
    const results = {};

    (rows.results || []).forEach(row => {
      try {
        const data = JSON.parse(row.result_json);
        const level = data.level || 'unknown';
        const summary = data.summary || '';

        results[row.tmdb_id] = {
          level,
          summary
        };
      } catch (e) {
        // Skip if JSON parse fails
      }
    });

    return jsonWithCors(results, request, env);
  } catch (e) {
    console.error('Verdicts endpoint error:', e);
    return jsonWithCors({}, request, env);
  }
}

export async function onRequestOptions(context) {
  return optionsResponse(context.request, context.env, {
    methods: 'GET, OPTIONS',
    headers: 'Content-Type',
    maxAge: 86400
  });
}
