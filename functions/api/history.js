/**
 * /api/history
 * GET    — returns user's history, newest first
 * POST   — upserts a search entry (bumps searched_at if tmdb_id already exists)
 * DELETE — ?id= removes one item; no param clears all history
 */

import { requirePro, jsonResponse, handleOptions } from '../_shared/clerk.js';
import { resolveDataScope } from '../_shared/households.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const { auth, error } = await requirePro(request, env);
  if (error) return error;
  const scope = await resolveDataScope(auth, env);

  const url   = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

  // Query history with LEFT JOIN to lists table to get verdict (if any)
  const rows = await env.DB
    .prepare(`
      SELECT 
        h.id, h.user_id, h.tmdb_id, h.media_type, h.title, h.year, h.poster, h.profile_id,
        h.searched_at as created_at,
        COALESCE(l.list_type, 'allowed') as verdict
      FROM history h
      LEFT JOIN lists l ON h.user_id = l.user_id 
        AND h.tmdb_id = l.tmdb_id 
        AND h.media_type = l.media_type
      WHERE h.user_id = ? 
      ORDER BY h.searched_at DESC 
      LIMIT ?
    `)
    .bind(scope.scopeUserId, limit)
    .all();

  return jsonResponse(rows.results ?? []);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { auth, error } = await requirePro(request, env);
  if (error) return error;
  const scope = await resolveDataScope(auth, env);

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { tmdb_id, media_type, title, year, poster, profile_id } = body;
  if (!tmdb_id)    return jsonResponse({ error: 'tmdb_id is required' }, 400);
  if (!media_type) return jsonResponse({ error: 'media_type is required' }, 400);
  if (!title)      return jsonResponse({ error: 'title is required' }, 400);

  // Check if this title is already in history for this user
  const existing = await env.DB
    .prepare('SELECT id FROM history WHERE user_id = ? AND tmdb_id = ? AND media_type = ?')
    .bind(scope.scopeUserId, tmdb_id, media_type)
    .first();

  if (existing) {
    // Bump searched_at and update profile_id
    await env.DB
      .prepare('UPDATE history SET searched_at = datetime(\'now\'), profile_id = ? WHERE id = ?')
      .bind(profile_id ?? null, existing.id)
      .run();
    const updated = await env.DB
      .prepare('SELECT * FROM history WHERE id = ?')
      .bind(existing.id)
      .first();
    return jsonResponse(updated);
  }

  // Insert new entry
  const id = crypto.randomUUID().replace(/-/g, '');
  await env.DB
    .prepare('INSERT INTO history (id, user_id, tmdb_id, media_type, title, year, poster, profile_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, scope.scopeUserId, tmdb_id, media_type, title, year ?? null, poster ?? null, profile_id ?? null)
    .run();

  const entry = await env.DB
    .prepare('SELECT * FROM history WHERE id = ?')
    .bind(id)
    .first();

  return jsonResponse(entry, 201);
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const { auth, error } = await requirePro(request, env);
  if (error) return error;
  const scope = await resolveDataScope(auth, env);

  const url = new URL(request.url);
  const id  = url.searchParams.get('id');

  if (id) {
    // Delete single entry — verify ownership first
    const existing = await env.DB
      .prepare('SELECT id FROM history WHERE id = ? AND user_id = ?')
      .bind(id, scope.scopeUserId)
      .first();
    if (!existing) return jsonResponse({ error: 'Entry not found' }, 404);

    await env.DB
      .prepare('DELETE FROM history WHERE id = ? AND user_id = ?')
      .bind(id, scope.scopeUserId)
      .run();

    return jsonResponse({ deleted: true, id });
  }

  // No id param → clear all history for this user
  if (scope.isFamilyScope && scope.role !== 'owner') {
    return jsonResponse({ error: 'Only the household owner can clear all history' }, 403);
  }
  await env.DB
    .prepare('DELETE FROM history WHERE user_id = ?')
    .bind(scope.scopeUserId)
    .run();

  return jsonResponse({ deleted: true, all: true });
}

export async function onRequestOptions() {
  return handleOptions();
}
