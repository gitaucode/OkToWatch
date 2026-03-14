/**
 * PUT /api/settings/name
 * Updates the user's display name via Clerk.
 */

import { requireAuth, jsonResponse, handleOptions } from '../../_shared/clerk.js';

const CLERK_API = 'https://api.clerk.com/v1';

export async function onRequestPut(context) {
  const { request, env } = context;
  const { auth, error } = await requireAuth(request, env);
  if (error) return error;

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { firstName, lastName } = body;
  if (!firstName?.trim()) return jsonResponse({ error: 'firstName is required' }, 400);

  const res = await fetch(`${CLERK_API}/users/${auth.userId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${env.CLERK_SECRET_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      first_name: firstName.trim(),
      last_name:  lastName?.trim() ?? '',
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return jsonResponse({ error: err?.errors?.[0]?.message || 'Failed to update name' }, 500);
  }

  const user = await res.json();
  return jsonResponse({
    firstName: user.first_name,
    lastName:  user.last_name,
  });
}

export async function onRequestOptions() {
  return handleOptions();
}
