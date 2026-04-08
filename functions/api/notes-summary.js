/**
 * /api/notes-summary
 * GET — fetch family note summaries for a list of titles
 * Query params: ids=123,456&media_type=movie
 */

import { requireFamily, jsonResponse, handleOptions } from '../_shared/clerk.js';
import { resolveDataScope } from '../_shared/households.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const { auth, error } = await requireFamily(request, env);
  if (error) return error;
  const scope = await resolveDataScope(auth, env);

  if (!env.DB) return jsonResponse({});

  const url = new URL(request.url);
  const idsParam = url.searchParams.get('ids') || '';
  const mediaType = url.searchParams.get('media_type');
  const ids = idsParam.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !Number.isNaN(id));

  if (!mediaType || !ids.length) return jsonResponse({});

  try {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await env.DB.prepare(`
      SELECT tmdb_id, note_type, is_pinned, created_at
      FROM shared_notes
      WHERE family_id IN (?, ?) AND media_type = ? AND tmdb_id IN (${placeholders})
      ORDER BY is_pinned DESC, created_at DESC
    `).bind(scope.householdId || auth.userId, scope.scopeUserId || auth.userId, mediaType, ...ids).all();

    const summaries = {};
    for (const row of (rows.results || [])) {
      const key = String(row.tmdb_id);
      if (!summaries[key]) {
        summaries[key] = {
          count: 0,
          approval_count: 0,
          caution_count: 0,
          observation_count: 0,
          has_pinned: false,
          primary_type: 'observation'
        };
      }

      const summary = summaries[key];
      summary.count += 1;
      if (row.note_type === 'approval') summary.approval_count += 1;
      else if (row.note_type === 'caution') summary.caution_count += 1;
      else summary.observation_count += 1;

      if (row.is_pinned && !summary.has_pinned) {
        summary.has_pinned = true;
        summary.primary_type = row.note_type || 'observation';
        continue;
      }

      if (!summary.has_pinned) {
        if (row.note_type === 'caution') summary.primary_type = 'caution';
        else if (row.note_type === 'approval' && summary.primary_type !== 'caution') summary.primary_type = 'approval';
      }
    }

    return jsonResponse(summaries);
  } catch (e) {
    console.error('Notes summary fetch error:', e);
    return jsonResponse({});
  }
}

export function onRequestOptions() {
  return handleOptions();
}
