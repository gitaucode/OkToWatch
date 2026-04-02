/**
 * GET /api/me
 * Returns the current user's full profile. Requires auth.
 */

import { requireAuth, jsonResponse, handleOptions } from '../_shared/clerk.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const { auth, error } = await requireAuth(request, env);
  if (error) return error;

  return jsonResponse({
    id:          auth.userId,
    firstName:   auth.user.first_name,
    lastName:    auth.user.last_name,
    displayName: auth.user.username || auth.user.first_name,
    email:       auth.user.email_addresses?.[0]?.email_address,
    imageUrl:    auth.user.image_url,
    isPro:       auth.isPro,
    isFamily:    auth.isFamily,
    memberSince: auth.user.created_at,
  });
}

export async function onRequestOptions() {
  return handleOptions();
}
