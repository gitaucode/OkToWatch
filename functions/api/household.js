import { requireFamily, jsonResponse, handleOptions } from '../_shared/clerk.js';
import { ensureHouseholdTables, generateUniqueInviteCode, getOrCreateHouseholdForFamily } from '../_shared/households.js';

async function listMembers(db, householdId) {
  const rows = await db.prepare(`
    SELECT user_id, role, created_at
    FROM household_members
    WHERE household_id = ?
    ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, created_at ASC
  `).bind(householdId).all();

  return rows.results || [];
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const { auth, error } = await requireFamily(request, env);
  if (error) return error;

  const household = await getOrCreateHouseholdForFamily(auth, env);
  const members = await listMembers(env.DB, household.householdId);

  return jsonResponse({
    household: {
      id: household.householdId,
      name: household.name,
      inviteCode: household.inviteCode,
      role: household.role,
      ownerUserId: household.ownerUserId
    },
    members
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { auth, error } = await requireFamily(request, env);
  if (error) return error;

  await ensureHouseholdTables(env.DB);

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const action = body?.action;
  if (!action) return jsonResponse({ error: 'action is required' }, 400);

  const currentHousehold = await getOrCreateHouseholdForFamily(auth, env);

  if (action === 'join') {
    const code = String(body.code || '').trim().toUpperCase();
    if (!code) return jsonResponse({ error: 'Invite code is required' }, 400);

    const target = await env.DB.prepare(`
      SELECT id, owner_user_id, name, invite_code
      FROM households
      WHERE invite_code = ?
      LIMIT 1
    `).bind(code).first();

    if (!target) return jsonResponse({ error: 'Invite code not found' }, 404);
    if (target.id === currentHousehold.householdId) {
      const members = await listMembers(env.DB, target.id);
      return jsonResponse({
        joined: true,
        household: {
          id: target.id,
          name: target.name,
          inviteCode: target.invite_code,
          role: currentHousehold.role,
          ownerUserId: target.owner_user_id
        },
        members
      });
    }

    const existingMembership = await env.DB.prepare('SELECT id, role FROM household_members WHERE user_id = ? LIMIT 1').bind(auth.userId).first();
    if (existingMembership?.role === 'owner' && currentHousehold.ownerUserId === auth.userId) {
      const memberCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM household_members WHERE household_id = ?').bind(currentHousehold.householdId).first();
      if (Number(memberCount?.n || 0) <= 1) {
        await env.DB.prepare('DELETE FROM household_members WHERE user_id = ?').bind(auth.userId).run();
        await env.DB.prepare('DELETE FROM households WHERE id = ?').bind(currentHousehold.householdId).run();
      } else {
        return jsonResponse({ error: 'Owner household already has members. Leave flow is not supported yet.' }, 409);
      }
    } else if (existingMembership) {
      await env.DB.prepare('DELETE FROM household_members WHERE user_id = ?').bind(auth.userId).run();
    }

    await env.DB.prepare(`
      INSERT INTO household_members (id, household_id, user_id, role)
      VALUES (?, ?, ?, 'member')
    `).bind(crypto.randomUUID().replace(/-/g, ''), target.id, auth.userId).run();

    const members = await listMembers(env.DB, target.id);
    return jsonResponse({
      joined: true,
      household: {
        id: target.id,
        name: target.name,
        inviteCode: target.invite_code,
        role: 'member',
        ownerUserId: target.owner_user_id
      },
      members
    });
  }

  if (action === 'regenerate_invite') {
    if (currentHousehold.role !== 'owner') {
      return jsonResponse({ error: 'Only household owners can regenerate invite codes' }, 403);
    }

    const inviteCode = await generateUniqueInviteCode(env.DB);
    await env.DB.prepare('UPDATE households SET invite_code = ? WHERE id = ?').bind(inviteCode, currentHousehold.householdId).run();
    return jsonResponse({ inviteCode });
  }

  return jsonResponse({ error: 'Unsupported action' }, 400);
}

export function onRequestOptions() {
  return handleOptions();
}
