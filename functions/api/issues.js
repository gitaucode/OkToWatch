/**
 * /api/issues
 * POST   — create a new issue report on a title
 * GET    — list user's own reports
 */

import { requireAuth, jsonResponse, handleOptions } from '../_shared/clerk.js';

const VALID_CATEGORIES = ['inaccurate', 'missing', 'unclear', 'other'];

export async function onRequestPost(context) {
  const { request, env } = context;
  const { auth, error } = await requireAuth(request, env);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { tmdb_id, media_type, season, category, message } = body;
  if (!tmdb_id)    return jsonResponse({ error: 'tmdb_id is required' }, 400);
  if (!media_type) return jsonResponse({ error: 'media_type is required' }, 400);
  if (!message)    return jsonResponse({ error: 'message is required' }, 400);

  // Validate category if provided
  if (category && !VALID_CATEGORIES.includes(category)) {
    return jsonResponse({
      error: `category must be one of: ${VALID_CATEGORIES.join(', ')}`
    }, 400);
  }

  try {
    const report = {
      id: crypto.getRandomValues(new Uint8Array(8)),
      user_id: auth.userId,
      tmdb_id,
      media_type,
      season: season || null,
      category: category || 'other',
      message,
      resolved: 0,
      created_at: new Date().toISOString(),
    };

    // Format ID as hex string
    const reportId = Array.from(report.id)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    await env.DB
      .prepare(`
        INSERT INTO issue_reports (id, user_id, tmdb_id, media_type, season, category, message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      .bind(reportId, auth.userId, tmdb_id, media_type, season ?? null, category || 'other', message)
      .run();

    const created = await env.DB
      .prepare('SELECT * FROM issue_reports WHERE id = ?')
      .bind(reportId)
      .first();

    return jsonResponse(created, 201);
  } catch (e) {
    console.error('Issue report creation failed:', e);
    return jsonResponse({ error: 'Failed to create report' }, 500);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const { auth, error } = await requireAuth(request, env);
  if (error) return error;

  try {
    const reports = await env.DB
      .prepare('SELECT * FROM issue_reports WHERE user_id = ? ORDER BY created_at DESC')
      .bind(auth.userId)
      .all();

    return jsonResponse(reports.results ?? []);
  } catch (e) {
    console.error('Issue listing failed:', e);
    return jsonResponse({ error: 'Failed to list reports' }, 500);
  }
}

export function onRequestOptions() {
  return handleOptions();
}
