import { requireAuth, jsonResponse, handleOptions } from '../_shared/clerk.js';

async function ensureOnboardingTable(env) {
  if (!env.DB) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS onboarding_state (
      user_id              TEXT PRIMARY KEY,
      parent_name          TEXT,
      child_count          INTEGER DEFAULT 0,
      children_json        TEXT,
      preferences_json     TEXT,
      created_profile_count INTEGER DEFAULT 0,
      deferred_profiles    INTEGER DEFAULT 0,
      completed_at         TEXT,
      created_at           TEXT DEFAULT (datetime('now')),
      updated_at           TEXT DEFAULT (datetime('now'))
    )
  `).run();
}

function safeParseJson(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeChildren(children) {
  if (!Array.isArray(children)) return [];
  return children
    .map((child) => ({
      name: String(child?.name || '').trim(),
      age: Number.parseInt(child?.age, 10) || null,
    }))
    .filter((child) => child.name || child.age);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const { auth, error } = await requireAuth(request, env);
  if (error) return error;

  await ensureOnboardingTable(env);

  const row = await env.DB
    .prepare(`SELECT parent_name, child_count, children_json, preferences_json, created_profile_count, deferred_profiles, completed_at
              FROM onboarding_state
              WHERE user_id = ?
              LIMIT 1`)
    .bind(auth.userId)
    .first();

  return jsonResponse({
    completed: !!row?.completed_at,
    parentName: row?.parent_name || '',
    childCount: Number(row?.child_count || 0),
    children: normalizeChildren(safeParseJson(row?.children_json, [])),
    preferences: safeParseJson(row?.preferences_json, null),
    createdProfileCount: Number(row?.created_profile_count || 0),
    deferredProfiles: Number(row?.deferred_profiles || 0),
    completedAt: row?.completed_at || null,
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { auth, error } = await requireAuth(request, env);
  if (error) return error;

  await ensureOnboardingTable(env);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const parentName = String(body?.parentName || '').trim();
  const childCount = Math.max(0, Math.min(5, Number.parseInt(body?.childCount, 10) || 0));
  const children = normalizeChildren(body?.children);
  const preferences = body?.preferences && typeof body.preferences === 'object' ? body.preferences : null;
  const createdProfileCount = Math.max(0, Number.parseInt(body?.createdProfileCount, 10) || 0);
  const deferredProfiles = Math.max(0, Number.parseInt(body?.deferredProfiles, 10) || 0);
  const completed = !!body?.completed;

  await env.DB
    .prepare(`
      INSERT INTO onboarding_state (
        user_id, parent_name, child_count, children_json, preferences_json, created_profile_count, deferred_profiles, completed_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? THEN datetime('now') ELSE NULL END, datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        parent_name = excluded.parent_name,
        child_count = excluded.child_count,
        children_json = excluded.children_json,
        preferences_json = excluded.preferences_json,
        created_profile_count = excluded.created_profile_count,
        deferred_profiles = excluded.deferred_profiles,
        completed_at = CASE
          WHEN excluded.completed_at IS NOT NULL THEN excluded.completed_at
          ELSE onboarding_state.completed_at
        END,
        updated_at = datetime('now')
    `)
    .bind(
      auth.userId,
      parentName,
      childCount,
      JSON.stringify(children),
      preferences ? JSON.stringify(preferences) : null,
      createdProfileCount,
      deferredProfiles,
      completed ? 1 : 0
    )
    .run();

  return jsonResponse({
    saved: true,
    completed,
    parentName,
    childCount,
    children,
    preferences,
    createdProfileCount,
    deferredProfiles,
  });
}

export async function onRequestOptions() {
  return handleOptions();
}
