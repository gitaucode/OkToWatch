/**
 * /api/verdicts
 * GET — fetch cached verdict summaries for a list of TMDB IDs
 * Query params: ids=123,456,789 (comma-separated TMDB IDs)
 * Returns: { [id]: { level, summary } } for IDs with cached verdicts
 */

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.DB) {
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const url = new URL(request.url);
  const idsParam = url.searchParams.get('ids');

  if (!idsParam) {
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const ids = idsParam.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));

  if (!ids.length) {
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
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

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    console.error('Verdicts endpoint error:', e);
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
