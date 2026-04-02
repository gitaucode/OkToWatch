/**
 * /api/share
 * POST   — creates a new shareable token for a title
 * GET    — lists user's own shares (owner only)
 * DELETE — revoke a share (?token= required)
 */

import { requireAuth, jsonResponse, handleOptions } from '../_shared/clerk.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const { auth, error } = await requireAuth(request, env);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { tmdb_id, media_type, season, profile_id } = body;
  if (!tmdb_id)    return jsonResponse({ error: 'tmdb_id is required' }, 400);
  if (!media_type) return jsonResponse({ error: 'media_type is required' }, 400);

  // Generate a compact token (16 hex chars = 64-bit uniqueness)
  const token = crypto.getRandomValues(new Uint8Array(8));
  const tokenStr = Array.from(token).map(b => b.toString(16).padStart(2, '0')).join('');

  try {
    await env.DB
      .prepare(`
        INSERT INTO sharing_tokens (id, user_id, tmdb_id, media_type, season, profile_id, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now', '+30 days'))
      `)
      .bind(tokenStr, auth.userId, tmdb_id, media_type, season ?? null, profile_id ?? null)
      .run();

    const share = await env.DB
      .prepare('SELECT * FROM sharing_tokens WHERE id = ?')
      .bind(tokenStr)
      .first();

    return jsonResponse({
      token: tokenStr,
      shareUrl: `${new URL(request.url).origin}/share.html?token=${tokenStr}`,
      data: share,
    }, 201);
  } catch (e) {
    console.error('Share creation failed:', e);
    return jsonResponse({ error: 'Failed to create share' }, 500);
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const { auth, error } = await requireAuth(request, env);
  if (error) return error;

  try {
    const shares = await env.DB
      .prepare('SELECT * FROM sharing_tokens WHERE user_id = ? ORDER BY created_at DESC')
      .bind(auth.userId)
      .all();

    return jsonResponse(shares.results ?? []);
  } catch (e) {
    console.error('Share listing failed:', e);
    return jsonResponse({ error: 'Failed to list shares' }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const { auth, error } = await requireAuth(request, env);
  if (error) return error;

  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return jsonResponse({ error: 'token is required' }, 400);

  try {
    // Verify ownership before deleting
    const share = await env.DB
      .prepare('SELECT * FROM sharing_tokens WHERE id = ?')
      .bind(token)
      .first();

    if (!share) return jsonResponse({ error: 'Share not found' }, 404);
    if (share.user_id !== auth.userId) return jsonResponse({ error: 'Unauthorized' }, 403);

    await env.DB
      .prepare('DELETE FROM sharing_tokens WHERE id = ?')
      .bind(token)
      .run();

    return jsonResponse({ deleted: true });
  } catch (e) {
    console.error('Share deletion failed:', e);
    return jsonResponse({ error: 'Failed to delete share' }, 500);
  }
}

export function onRequestOptions() {
  return handleOptions();
}
