/**
 * GET /api/tmdb/cache-ids?type=movie|tv
 * Returns list of tmdb_ids that are already in the analysis cache.
 * Used by the dashboard trending section to badge already-analysed titles.
 * Public endpoint — no auth needed (IDs are not sensitive).
 */
import { jsonWithCors } from '../../_shared/cors.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url  = new URL(request.url);
  const type = url.searchParams.get('type') || 'movie';

  try {
    const rows = await env.DB.prepare(
      'SELECT DISTINCT tmdb_id FROM analysis_cache WHERE media_type = ? LIMIT 500'
    ).bind(type).all();

    const ids = rows.results.map(r => r.tmdb_id);
    return jsonWithCors(ids, request, env, { cacheControl: 'public, max-age=120' });
  } catch {
    return jsonWithCors([], request, env);
  }
}
