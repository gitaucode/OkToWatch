/**
 * GET /api/auth/status
 * Called by public/js/auth.js on every page load.
 * Returns auth state without requiring a valid session (never 401s).
 */

import { getAuth, jsonResponse, handleOptions } from '../../_shared/clerk.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await getAuth(request, env);

  if (!auth) {
    return jsonResponse({ loggedIn: false, isPro: false, isFamily: false, user: null });
  }

  return jsonResponse({
    loggedIn: true,
    isPro:    auth.isPro,
    isFamily: auth.isFamily,
    user: {
      id:          auth.userId,
      firstName:   auth.user.first_name,
      lastName:    auth.user.last_name,
      displayName: auth.user.username || auth.user.first_name,
      email:       auth.user.email_addresses?.[0]?.email_address,
      imageUrl:    auth.user.image_url,
      memberSince: auth.user.created_at,
    },
  });
}

export async function onRequestOptions() {
  return handleOptions();
}
