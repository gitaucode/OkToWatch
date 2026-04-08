import { requireFamily, jsonResponse, handleOptions } from '../_shared/clerk.js';
import { ensureHouseholdTables, generateUniqueInviteCode, getOrCreateHouseholdForFamily } from '../_shared/households.js';

const CLERK_API = 'https://api.clerk.com/v1';

async function enrichMembers(env, members) {
  return Promise.all((members || []).map(async (member) => {
    try {
      const res = await fetch(`${CLERK_API}/users/${member.user_id}`, {
        headers: {
          'Authorization': 'Bearer ' + env.CLERK_SECRET_KEY,
          'Accept': 'application/json'
        }
      });
      if (!res.ok) throw new Error(String(res.status));
      const user = await res.json();
      return {
        ...member,
        display_name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username || member.user_id,
        email: user.email_addresses?.[0]?.email_address || null,
        image_url: user.image_url || null
      };
    } catch {
      return {
        ...member,
        display_name: member.user_id,
        email: null,
        image_url: null
      };
    }
  }));
}

async function listMembers(env, householdId) {
  const rows = await env.DB.prepare(`
    SELECT user_id, role, created_at
    FROM household_members
    WHERE household_id = ?
    ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, created_at ASC
  `).bind(householdId).all();

  return enrichMembers(env, rows.results || []);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const { auth, error } = await requireFamily(request, env);
  if (error) return error;

  const household = await getOrCreateHouseholdForFamily(auth, env);
  const members = await listMembers(env, household.householdId);

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
      const members = await listMembers(env, target.id);
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

    const members = await listMembers(env, target.id);
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

  if (action === 'update_name') {
    if (currentHousehold.role !== 'owner') {
      return jsonResponse({ error: 'Only household owners can rename the household' }, 403);
    }

    const name = String(body.name || '').trim();
    if (!name) return jsonResponse({ error: 'Household name is required' }, 400);
    if (name.length > 60) return jsonResponse({ error: 'Household name must be 60 characters or fewer' }, 400);

    await env.DB.prepare('UPDATE households SET name = ? WHERE id = ?').bind(name, currentHousehold.householdId).run();
    const members = await listMembers(env, currentHousehold.householdId);
    return jsonResponse({
      updated: true,
      household: {
        id: currentHousehold.householdId,
        name,
        inviteCode: currentHousehold.inviteCode,
        role: currentHousehold.role,
        ownerUserId: currentHousehold.ownerUserId
      },
      members
    });
  }

  if (action === 'remove_member') {
    if (currentHousehold.role !== 'owner') {
      return jsonResponse({ error: 'Only household owners can remove caregivers' }, 403);
    }

    const targetUserId = String(body.user_id || '').trim();
    if (!targetUserId) return jsonResponse({ error: 'user_id is required' }, 400);
    if (targetUserId === currentHousehold.ownerUserId) {
      return jsonResponse({ error: 'Household owner cannot be removed' }, 400);
    }

    const member = await env.DB.prepare(`
      SELECT id, role
      FROM household_members
      WHERE household_id = ? AND user_id = ?
      LIMIT 1
    `).bind(currentHousehold.householdId, targetUserId).first();

    if (!member) return jsonResponse({ error: 'Caregiver not found' }, 404);

    await env.DB.prepare('DELETE FROM household_members WHERE id = ?').bind(member.id).run();
    const members = await listMembers(env, currentHousehold.householdId);
    return jsonResponse({
      removed: true,
      household: {
        id: currentHousehold.householdId,
        name: currentHousehold.name,
        inviteCode: currentHousehold.inviteCode,
        role: currentHousehold.role,
        ownerUserId: currentHousehold.ownerUserId
      },
      members
    });
  }

  if (action === 'leave') {
    const membership = await env.DB.prepare(`
      SELECT id
      FROM household_members
      WHERE household_id = ? AND user_id = ?
      LIMIT 1
    `).bind(currentHousehold.householdId, auth.userId).first();

    if (!membership) return jsonResponse({ error: 'Membership not found' }, 404);

    if (currentHousehold.role === 'owner') {
      const memberCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM household_members WHERE household_id = ?').bind(currentHousehold.householdId).first();
      if (Number(memberCount?.n || 0) > 1) {
        return jsonResponse({ error: 'Remove other caregivers before the owner leaves the household' }, 409);
      }
      await env.DB.prepare('DELETE FROM household_members WHERE id = ?').bind(membership.id).run();
      await env.DB.prepare('DELETE FROM households WHERE id = ?').bind(currentHousehold.householdId).run();
      return jsonResponse({ left: true, reset: true });
    }

    await env.DB.prepare('DELETE FROM household_members WHERE id = ?').bind(membership.id).run();
    const nextHousehold = await getOrCreateHouseholdForFamily(auth, env);
    const members = await listMembers(env, nextHousehold.householdId);
    return jsonResponse({
      left: true,
      household: {
        id: nextHousehold.householdId,
        name: nextHousehold.name,
        inviteCode: nextHousehold.inviteCode,
        role: nextHousehold.role,
        ownerUserId: nextHousehold.ownerUserId
      },
      members
    });
  }

  return jsonResponse({ error: 'Unsupported action' }, 400);
}

export function onRequestOptions() {
  return handleOptions();
}
