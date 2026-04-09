/**
 * /api/admin/[[path]]
 * All admin API endpoints. Every request is validated for isAdmin flag in Clerk metadata.
 *
 * Routes:
 *   GET  /api/admin/stats              — app-wide stats
 *   GET  /api/admin/users              — paginated user list (via Clerk API)
 *   GET  /api/admin/users/:id          — single user detail
 *   POST /api/admin/users/:id/plan     — grant/revoke plan { plan: 'pro'|'family'|null }
 *   POST /api/admin/users/:id/ban      — ban user { reason }
 *   POST /api/admin/users/:id/unban    — unban user
 *   DELETE /api/admin/users/:id        — delete user from Clerk + D1 data
 *   GET  /api/admin/cache              — list cache entries (paginated)
 *   DELETE /api/admin/cache/:id        — delete one cache entry
 *   DELETE /api/admin/cache            — flush entire cache
 *   GET  /api/admin/announcements      — list all announcements
 *   POST /api/admin/announcements      — create announcement
 *   PATCH /api/admin/announcements/:id — toggle active / edit
 *   DELETE /api/admin/announcements/:id — delete announcement
 *   GET  /api/admin/log                — audit log
 */

import { getAuth } from '../../_shared/clerk.js';
import { withCors, optionsResponse } from '../../_shared/cors.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  requestContext = { request, env };
  const method = request.method;

  // ── CORS preflight ────────────────────────────────────────────────────────
  if (method === 'OPTIONS') {
    return optionsResponse(request, env, {
      methods: 'GET,POST,PATCH,DELETE,OPTIONS',
      headers: 'Content-Type, Authorization',
      maxAge: 86400
    });
  }

  // ── Auth: must be logged in AND isAdmin ───────────────────────────────────
  const auth = await getAuth(request, env);
  if (!auth) return cors(jsonError('Unauthorised', 401));

  // Fetch full user to check isAdmin in publicMetadata
  const clerkUserRes = await clerkFetch(`/users/${auth.userId}`, env);
  if (!clerkUserRes.ok) return cors(jsonError('Could not verify admin status', 500));
  const clerkUser = await clerkUserRes.json();
  if (!clerkUser.public_metadata?.isAdmin) {
    return cors(jsonError('Forbidden', 403));
  }

  // ── Route ─────────────────────────────────────────────────────────────────
  const path = (params.path || []).join('/');

  try {
    // Stats
    if (path === 'stats' && method === 'GET') return cors(await handleStats(env));

    // Users
    if (path === 'users' && method === 'GET') return cors(await handleListUsers(request, env));
    if (path.match(/^users\/[^/]+$/) && method === 'GET') {
      const uid = path.split('/')[1];
      return cors(await handleGetUser(uid, env));
    }
    if (path.match(/^users\/[^/]+\/plan$/) && method === 'POST') {
      const uid = path.split('/')[1];
      return cors(await handleSetPlan(uid, request, env, auth.userId));
    }
    if (path.match(/^users\/[^/]+\/ban$/) && method === 'POST') {
      const uid = path.split('/')[1];
      return cors(await handleBan(uid, request, env, auth.userId));
    }
    if (path.match(/^users\/[^/]+\/unban$/) && method === 'POST') {
      const uid = path.split('/')[1];
      return cors(await handleUnban(uid, env, auth.userId));
    }
    if (path.match(/^users\/[^/]+$/) && method === 'DELETE') {
      const uid = path.split('/')[1];
      return cors(await handleDeleteUser(uid, env, auth.userId));
    }

    // Cache
    if (path === 'cache' && method === 'GET')    return cors(await handleListCache(request, env));
    if (path === 'cache' && method === 'DELETE') return cors(await handleFlushCache(env, auth.userId));
    if (path.match(/^cache\/.+$/) && method === 'DELETE') {
      const cacheId = decodeURIComponent(path.slice(6));
      return cors(await handleDeleteCache(cacheId, env, auth.userId));
    }

    // Announcements
    if (path === 'announcements' && method === 'GET')  return cors(await handleListAnnouncements(env));
    if (path === 'announcements' && method === 'POST') return cors(await handleCreateAnnouncement(request, env, auth.userId));
    if (path.match(/^announcements\/[^/]+$/) && method === 'PATCH') {
      const id = path.split('/')[1];
      return cors(await handleUpdateAnnouncement(id, request, env, auth.userId));
    }
    if (path.match(/^announcements\/[^/]+$/) && method === 'DELETE') {
      const id = path.split('/')[1];
      return cors(await handleDeleteAnnouncement(id, env, auth.userId));
    }

    // Audit log
    if (path === 'log' && method === 'GET') return cors(await handleLog(request, env));

    return cors(jsonError('Not found', 404));
  } catch (e) {
    console.error('Admin API error:', e);
    return cors(jsonError('Internal server error', 500));
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleStats(env) {
  const [totalSearches, totalLists, totalProfiles, cacheSize, recentSearches, bannedCount] =
    await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as n FROM history').first(),
      env.DB.prepare('SELECT COUNT(*) as n FROM lists').first(),
      env.DB.prepare('SELECT COUNT(*) as n FROM profiles').first(),
      env.DB.prepare('SELECT COUNT(*) as n FROM analysis_cache').first(),
      env.DB.prepare("SELECT COUNT(*) as n FROM history WHERE searched_at >= datetime('now','-7 days')").first(),
      env.DB.prepare('SELECT COUNT(*) as n FROM banned_users').first(),
    ]);

  // Clerk user count (total + recent signups)
  const clerkRes = await clerkFetch('/users?limit=1', env);
  let totalUsers = '?', recentSignups = '?';
  if (clerkRes.ok) {
    // Clerk returns total_count in headers for list endpoints
    totalUsers = clerkRes.headers.get('X-Total-Count') || '?';
  }
  // Signups in last 7 days via Clerk created_after
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const recentRes = await clerkFetch(`/users?limit=1&created_after=${sevenDaysAgo}`, env);
  if (recentRes.ok) {
    recentSignups = recentRes.headers.get('X-Total-Count') || '?';
  }

  return json({
    users: { total: totalUsers, recentSignups },
    searches: { total: totalSearches.n, last7days: recentSearches.n },
    lists:    totalLists.n,
    profiles: totalProfiles.n,
    cache:    cacheSize.n,
    banned:   bannedCount.n,
  });
}

async function handleListUsers(request, env) {
  const url    = new URL(request.url);
  const query  = url.searchParams.get('q') || '';
  const page   = parseInt(url.searchParams.get('page') || '1');
  const limit  = 20;
  const offset = (page - 1) * limit;

  const clerkPath = query
    ? `/users?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&order_by=-created_at`
    : `/users?limit=${limit}&offset=${offset}&order_by=-created_at`;

  const res = await clerkFetch(clerkPath, env);
  if (!res.ok) return jsonError('Failed to fetch users', 502);

  const users = await res.json();
  const total = parseInt(res.headers.get('X-Total-Count') || '0');

  // Enrich with ban status
  const userIds = users.map(u => u.id);
  let banned = [];
  if (userIds.length) {
    const placeholders = userIds.map(() => '?').join(',');
    const rows = await env.DB.prepare(
      `SELECT user_id FROM banned_users WHERE user_id IN (${placeholders})`
    ).bind(...userIds).all();
    banned = rows.results.map(r => r.user_id);
  }

  const enriched = users.map(u => ({
    id:         u.id,
    firstName:  u.first_name,
    lastName:   u.last_name,
    email:      u.email_addresses?.[0]?.email_address || '',
    imageUrl:   u.image_url,
    isPro:      u.public_metadata?.isPro === true,
    isFamily:   u.public_metadata?.isFamily === true,
    isAdmin:    u.public_metadata?.isAdmin === true,
    isBanned:   banned.includes(u.id),
    createdAt:  u.created_at,
    lastSignIn: u.last_sign_in_at,
  }));

  return json({ users: enriched, total, page, pages: Math.ceil(total / limit) });
}

async function handleGetUser(userId, env) {
  const res = await clerkFetch(`/users/${userId}`, env);
  if (!res.ok) return jsonError('User not found', 404);
  const u = await res.json();

  const [searches, listCount, banRow] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as n FROM history WHERE user_id = ?').bind(userId).first(),
    env.DB.prepare('SELECT COUNT(*) as n FROM lists WHERE user_id = ?').bind(userId).first(),
    env.DB.prepare('SELECT * FROM banned_users WHERE user_id = ?').bind(userId).first(),
  ]);

  return json({
    id:         u.id,
    firstName:  u.first_name,
    lastName:   u.last_name,
    email:      u.email_addresses?.[0]?.email_address || '',
    imageUrl:   u.image_url,
    isPro:      u.public_metadata?.isPro === true,
    isFamily:   u.public_metadata?.isFamily === true,
    isAdmin:    u.public_metadata?.isAdmin === true,
    isBanned:   !!banRow,
    banReason:  banRow?.reason || null,
    bannedAt:   banRow?.banned_at || null,
    createdAt:  u.created_at,
    lastSignIn: u.last_sign_in_at,
    stats: { searches: searches.n, lists: listCount.n },
  });
}

async function handleSetPlan(userId, request, env, adminId) {
  const { plan } = await request.json(); // 'pro' | 'family' | null
  const meta = { isPro: plan === 'pro', isFamily: plan === 'family' };

  // Fetch existing metadata to preserve other flags (isAdmin etc)
  const userRes = await clerkFetch(`/users/${userId}`, env);
  if (!userRes.ok) return jsonError('User not found', 404);
  const existing = (await userRes.json()).public_metadata || {};

  const res = await clerkFetch(`/users/${userId}`, env, {
    method: 'PATCH',
    body: JSON.stringify({
      public_metadata: { ...existing, isPro: meta.isPro, isFamily: meta.isFamily }
    }),
  });
  if (!res.ok) return jsonError('Failed to update plan', 502);

  await auditLog(env, adminId, 'set_plan', userId, `plan=${plan || 'none'}`);
  return json({ ok: true, plan: plan || null });
}

async function handleBan(userId, request, env, adminId) {
  const { reason = '' } = await request.json();
  await env.DB.prepare(
    'INSERT INTO banned_users (user_id, reason, banned_by) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET reason=excluded.reason, banned_by=excluded.banned_by, banned_at=datetime(\'now\')'
  ).bind(userId, reason, adminId).run();

  // Revoke all Clerk sessions for immediate effect
  await clerkFetch(`/users/${userId}/sessions?status=active`, env).then(async r => {
    if (r.ok) {
      const sessions = await r.json();
      await Promise.all(sessions.map(s =>
        clerkFetch(`/sessions/${s.id}/revoke`, env, { method: 'POST' })
      ));
    }
  }).catch(() => {});

  await auditLog(env, adminId, 'ban_user', userId, reason);
  return json({ ok: true });
}

async function handleUnban(userId, env, adminId) {
  await env.DB.prepare('DELETE FROM banned_users WHERE user_id = ?').bind(userId).run();
  await auditLog(env, adminId, 'unban_user', userId);
  return json({ ok: true });
}

async function handleDeleteUser(userId, env, adminId) {
  // Delete from Clerk
  const res = await clerkFetch(`/users/${userId}`, env, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) return jsonError('Failed to delete from Clerk', 502);

  // Delete all D1 data
  await Promise.all([
    env.DB.prepare('DELETE FROM history  WHERE user_id = ?').bind(userId).run(),
    env.DB.prepare('DELETE FROM lists    WHERE user_id = ?').bind(userId).run(),
    env.DB.prepare('DELETE FROM profiles WHERE user_id = ?').bind(userId).run(),
    env.DB.prepare('DELETE FROM banned_users WHERE user_id = ?').bind(userId).run(),
  ]);

  await auditLog(env, adminId, 'delete_user', userId);
  return json({ ok: true });
}

async function handleListCache(request, env) {
  const url   = new URL(request.url);
  const page  = parseInt(url.searchParams.get('page') || '1');
  const limit = 30;
  const offset = (page - 1) * limit;
  const q = url.searchParams.get('q') || '';

  const [rows, count] = await Promise.all([
    q
      ? env.DB.prepare("SELECT id, tmdb_id, media_type, season, cached_at, length(result_json) as size FROM analysis_cache WHERE id LIKE ? ORDER BY cached_at DESC LIMIT ? OFFSET ?")
          .bind(`%${q}%`, limit, offset).all()
      : env.DB.prepare('SELECT id, tmdb_id, media_type, season, cached_at, length(result_json) as size FROM analysis_cache ORDER BY cached_at DESC LIMIT ? OFFSET ?')
          .bind(limit, offset).all(),
    env.DB.prepare('SELECT COUNT(*) as n FROM analysis_cache').first(),
  ]);

  return json({ entries: rows.results, total: count.n, page, pages: Math.ceil(count.n / limit) });
}

async function handleDeleteCache(cacheId, env, adminId) {
  await env.DB.prepare('DELETE FROM analysis_cache WHERE id = ?').bind(cacheId).run();
  await auditLog(env, adminId, 'delete_cache', cacheId);
  return json({ ok: true });
}

async function handleFlushCache(env, adminId) {
  const count = await env.DB.prepare('SELECT COUNT(*) as n FROM analysis_cache').first();
  await env.DB.prepare('DELETE FROM analysis_cache').run();
  await auditLog(env, adminId, 'flush_cache', null, `${count.n} entries deleted`);
  return json({ ok: true, deleted: count.n });
}

async function handleListAnnouncements(env) {
  const rows = await env.DB.prepare(
    'SELECT * FROM announcements ORDER BY created_at DESC'
  ).all();
  return json(rows.results);
}

async function handleCreateAnnouncement(request, env, adminId) {
  const { message, type = 'info', expires_at = null } = await request.json();
  if (!message?.trim()) return jsonError('message is required', 400);

  const row = await env.DB.prepare(
    'INSERT INTO announcements (message, type, active, created_by, expires_at) VALUES (?, ?, 1, ?, ?) RETURNING *'
  ).bind(message.trim(), type, adminId, expires_at).first();

  await auditLog(env, adminId, 'create_announcement', row.id, message.slice(0, 80));
  return json(row);
}

async function handleUpdateAnnouncement(id, request, env, adminId) {
  const { active, message, type, expires_at } = await request.json();
  const fields = [], values = [];

  if (active !== undefined) { fields.push('active = ?');     values.push(active ? 1 : 0); }
  if (message !== undefined){ fields.push('message = ?');    values.push(message); }
  if (type    !== undefined){ fields.push('type = ?');       values.push(type); }
  if (expires_at !== undefined){ fields.push('expires_at = ?'); values.push(expires_at); }

  if (!fields.length) return jsonError('Nothing to update', 400);
  values.push(id);

  const row = await env.DB.prepare(
    `UPDATE announcements SET ${fields.join(', ')} WHERE id = ? RETURNING *`
  ).bind(...values).first();

  await auditLog(env, adminId, 'update_announcement', id);
  return json(row);
}

async function handleDeleteAnnouncement(id, env, adminId) {
  await env.DB.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
  await auditLog(env, adminId, 'delete_announcement', id);
  return json({ ok: true });
}

async function handleLog(request, env) {
  const url   = new URL(request.url);
  const page  = parseInt(url.searchParams.get('page') || '1');
  const limit = 50;
  const offset = (page - 1) * limit;

  const [rows, count] = await Promise.all([
    env.DB.prepare('SELECT * FROM admin_log ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .bind(limit, offset).all(),
    env.DB.prepare('SELECT COUNT(*) as n FROM admin_log').first(),
  ]);
  return json({ entries: rows.results, total: count.n, page, pages: Math.ceil(count.n / limit) });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clerkFetch(path, env, options = {}) {
  return fetch(`https://api.clerk.com/v1${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${env.CLERK_SECRET_KEY}`,
      'Content-Type':  'application/json',
      ...(options.headers || {}),
    },
  });
}

async function auditLog(env, adminId, action, targetId = null, detail = null) {
  await env.DB.prepare(
    'INSERT INTO admin_log (admin_id, action, target_id, detail) VALUES (?, ?, ?, ?)'
  ).bind(adminId, action, targetId, detail).run().catch(() => {});
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
function jsonError(msg, status = 400) {
  return json({ error: msg }, status);
}
function cors(response) {
  return withCors(response, requestContext.request, requestContext.env, {
    methods: 'GET,POST,PATCH,DELETE,OPTIONS',
    headers: 'Content-Type, Authorization',
    maxAge: 86400
  });
}

let requestContext = { request: new Request('https://oktowatch.local'), env: {} };
