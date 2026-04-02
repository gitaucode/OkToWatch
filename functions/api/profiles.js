/**
 * /api/profiles
 * GET    — list user's child profiles
 * POST   — create a profile (max 5 enforced)
 * PUT    — update a profile (?id=)
 * DELETE — delete a profile + cascade nullify history/list entries (?id=)
 */

import { requirePro, jsonResponse, handleOptions } from '../_shared/clerk.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const { auth, error } = await requirePro(request, env);
  if (error) return error;

  const rows = await env.DB
    .prepare('SELECT * FROM profiles WHERE user_id = ? ORDER BY created_at ASC')
    .bind(auth.userId)
    .all();

  return jsonResponse(rows.results ?? []);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { auth, error } = await requirePro(request, env);
  if (error) return error;

  // Enforce max 5 profiles
  const { results: existing } = await env.DB
    .prepare('SELECT id FROM profiles WHERE user_id = ?')
    .bind(auth.userId)
    .all();

  if ((existing?.length ?? 0) >= 5) {
    return jsonResponse({ error: 'Maximum 5 profiles allowed' }, 403);
  }

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { name, age, emoji = '👧', sensitivity_preset = null, blocked_categories = null, notes = null } = body;
  if (!name?.trim())               return jsonResponse({ error: 'Name is required' }, 400);
  if (!age || age < 1 || age > 17) return jsonResponse({ error: 'Age must be between 1 and 17' }, 400);

  // Validate sensitivity_preset
  if (sensitivity_preset && !['balanced', 'cautious', 'sensitive'].includes(sensitivity_preset)) {
    return jsonResponse({ error: 'Invalid sensitivity_preset' }, 400);
  }

  // Validate blocked_categories is a valid JSON array if provided
  let blockedCategoriesJson = null;
  if (blocked_categories !== null && blocked_categories !== undefined) {
    try {
      blockedCategoriesJson = JSON.stringify(blocked_categories);
    } catch (e) {
      return jsonResponse({ error: 'blocked_categories must be a valid JSON array' }, 400);
    }
  }

  const id = crypto.randomUUID().replace(/-/g, '');

  await env.DB
    .prepare('INSERT INTO profiles (id, user_id, name, age, emoji, sensitivity_preset, blocked_categories, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, auth.userId, name.trim(), parseInt(age), emoji, sensitivity_preset, blockedCategoriesJson, notes)
    .run();

  const profile = await env.DB
    .prepare('SELECT * FROM profiles WHERE id = ?')
    .bind(id)
    .first();

  return jsonResponse(profile, 201);
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const { auth, error } = await requirePro(request, env);
  if (error) return error;

  const url = new URL(request.url);
  const id  = url.searchParams.get('id');
  if (!id) return jsonResponse({ error: 'id is required' }, 400);

  // Verify ownership
  const existing = await env.DB
    .prepare('SELECT id FROM profiles WHERE id = ? AND user_id = ?')
    .bind(id, auth.userId)
    .first();
  if (!existing) return jsonResponse({ error: 'Profile not found' }, 404);

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { name, age, emoji, sensitivity_preset, blocked_categories, notes } = body;
  if (name && !name.trim())        return jsonResponse({ error: 'Name cannot be empty' }, 400);
  if (age && (age < 1 || age > 17)) return jsonResponse({ error: 'Age must be between 1 and 17' }, 400);
  
  // Validate sensitivity_preset
  if (sensitivity_preset && !['balanced', 'cautious', 'sensitive'].includes(sensitivity_preset)) {
    return jsonResponse({ error: 'Invalid sensitivity_preset' }, 400);
  }

  // Validate blocked_categories is a valid JSON array if provided
  let blockedCategoriesJson = null;
  if (blocked_categories !== undefined && blocked_categories !== null) {
    try {
      blockedCategoriesJson = JSON.stringify(blocked_categories);
    } catch (e) {
      return jsonResponse({ error: 'blocked_categories must be a valid JSON array' }, 400);
    }
  }

  await env.DB
    .prepare(`UPDATE profiles SET
      name                 = COALESCE(?, name),
      age                  = COALESCE(?, age),
      emoji                = COALESCE(?, emoji),
      sensitivity_preset   = COALESCE(?, sensitivity_preset),
      blocked_categories   = COALESCE(?, blocked_categories),
      notes                = COALESCE(?, notes)
      WHERE id = ? AND user_id = ?`)
    .bind(
      name?.trim() ?? null,
      age ? parseInt(age) : null,
      emoji ?? null,
      sensitivity_preset ?? null,
      blockedCategoriesJson ?? null,
      notes ?? null,
      id,
      auth.userId
    )
    .run();

  const updated = await env.DB
    .prepare('SELECT * FROM profiles WHERE id = ?')
    .bind(id)
    .first();

  return jsonResponse(updated);
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const { auth, error } = await requirePro(request, env);
  if (error) return error;

  const url = new URL(request.url);
  const id  = url.searchParams.get('id');
  const all = url.searchParams.get('all');

  // ?all=1 — delete all profiles for this user (used by account deletion)
  if (all === '1') {
    await env.DB.prepare('DELETE FROM profiles WHERE user_id = ?').bind(auth.userId).run();
    return jsonResponse({ deleted: true });
  }

  if (!id) return jsonResponse({ error: 'id is required' }, 400);

  // Verify ownership
  const existing = await env.DB
    .prepare('SELECT id FROM profiles WHERE id = ? AND user_id = ?')
    .bind(id, auth.userId)
    .first();
  if (!existing) return jsonResponse({ error: 'Profile not found' }, 404);

  // D1 foreign keys set NULL automatically (ON DELETE SET NULL in schema)
  await env.DB
    .prepare('DELETE FROM profiles WHERE id = ? AND user_id = ?')
    .bind(id, auth.userId)
    .run();

  return jsonResponse({ deleted: true, id });
}

export async function onRequestOptions() {
  return handleOptions();
}
