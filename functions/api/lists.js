/**
 * /api/lists
 * GET    — returns all saved items; optionally ?list_type=approved|blocked|watchlater
 * POST   — saves a title to a list (upserts — moves to new list_type if already saved)
 * PUT    — updates item note (?id= required)
 * DELETE — removes item (?id= required)
 */

import { requirePro, jsonResponse, handleOptions } from '../_shared/clerk.js';
import { resolveDataScope } from '../_shared/households.js';

const VALID_TYPES = ['approved', 'blocked', 'watchlater'];

export async function onRequestGet(context) {
  const { request, env } = context;
  const { auth, error } = await requirePro(request, env);
  if (error) return error;
  const scope = await resolveDataScope(auth, env);

  const url       = new URL(request.url);
  const listType  = url.searchParams.get('list_type');
  const profileId = url.searchParams.get('profile_id');

  let query  = 'SELECT * FROM lists WHERE user_id = ?';
  const args = [scope.scopeUserId];

  if (listType) {
    if (!VALID_TYPES.includes(listType)) return jsonResponse({ error: 'Invalid list_type' }, 400);
    query += ' AND list_type = ?';
    args.push(listType);
  }

  if (profileId) {
    query += ' AND profile_id = ?';
    args.push(profileId);
  }

  query += ' ORDER BY saved_at DESC';

  const rows = await env.DB.prepare(query).bind(...args).all();
  return jsonResponse(rows.results ?? []);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { auth, error } = await requirePro(request, env);
  if (error) return error;
  const scope = await resolveDataScope(auth, env);

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { tmdb_id, media_type, title, year, poster, list_type, profile_id, note } = body;
  if (!tmdb_id)   return jsonResponse({ error: 'tmdb_id is required' }, 400);
  if (!media_type) return jsonResponse({ error: 'media_type is required' }, 400);
  if (!title)     return jsonResponse({ error: 'title is required' }, 400);
  if (!list_type || !VALID_TYPES.includes(list_type)) {
    return jsonResponse({ error: `list_type must be one of: ${VALID_TYPES.join(', ')}` }, 400);
  }

  // Check if already in any list for this user
  const existing = await env.DB
    .prepare('SELECT id, list_type FROM lists WHERE user_id = ? AND tmdb_id = ? AND media_type = ?')
    .bind(scope.scopeUserId, tmdb_id, media_type)
    .first();

  if (existing) {
    // Move to new list type
    await env.DB
      .prepare('UPDATE lists SET list_type = ?, note = ?, saved_at = datetime(\'now\') WHERE id = ?')
      .bind(list_type, note ?? null, existing.id)
      .run();
    const updated = await env.DB
      .prepare('SELECT * FROM lists WHERE id = ?')
      .bind(existing.id)
      .first();
    return jsonResponse(updated);
  }

  const id = crypto.randomUUID().replace(/-/g, '');
  await env.DB
    .prepare('INSERT INTO lists (id, user_id, tmdb_id, media_type, title, year, poster, list_type, profile_id, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, scope.scopeUserId, tmdb_id, media_type, title, year ?? null, poster ?? null, list_type, profile_id ?? null, note ?? null)
    .run();

  const item = await env.DB
    .prepare('SELECT * FROM lists WHERE id = ?')
    .bind(id)
    .first();

  return jsonResponse(item, 201);
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const { auth, error } = await requirePro(request, env);
  if (error) return error;
  const scope = await resolveDataScope(auth, env);

  const url = new URL(request.url);
  const id  = url.searchParams.get('id');
  if (!id) return jsonResponse({ error: 'id is required' }, 400);

  const existing = await env.DB
    .prepare('SELECT id FROM lists WHERE id = ? AND user_id = ?')
    .bind(id, scope.scopeUserId)
    .first();
  if (!existing) return jsonResponse({ error: 'Item not found' }, 404);

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { note } = body;
  await env.DB
    .prepare('UPDATE lists SET note = ? WHERE id = ? AND user_id = ?')
    .bind(note ?? null, id, scope.scopeUserId)
    .run();

  const updated = await env.DB
    .prepare('SELECT * FROM lists WHERE id = ?')
    .bind(id)
    .first();

  return jsonResponse(updated);
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const { auth, error } = await requirePro(request, env);
  if (error) return error;
  const scope = await resolveDataScope(auth, env);

  const url = new URL(request.url);
  const id  = url.searchParams.get('id');
  const all = url.searchParams.get('all');

  // ?all=1 — delete all lists for this user (used by account deletion)
  if (all === '1') {
    if (scope.isFamilyScope && scope.role !== 'owner') {
      return jsonResponse({ error: 'Only the household owner can clear all lists' }, 403);
    }
    await env.DB.prepare('DELETE FROM lists WHERE user_id = ?').bind(scope.scopeUserId).run();
    return jsonResponse({ deleted: true });
  }

  if (!id) return jsonResponse({ error: 'id is required' }, 400);

  const existing = await env.DB
    .prepare('SELECT id FROM lists WHERE id = ? AND user_id = ?')
    .bind(id, scope.scopeUserId)
    .first();
  if (!existing) return jsonResponse({ error: 'Item not found' }, 404);

  await env.DB
    .prepare('DELETE FROM lists WHERE id = ? AND user_id = ?')
    .bind(id, scope.scopeUserId)
    .run();

  return jsonResponse({ deleted: true, id });
}

export async function onRequestOptions() {
  return handleOptions();
}
