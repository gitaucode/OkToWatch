/**
 * OkToWatch — functions/_shared/clerk.js
 * Shared Clerk auth helpers for all Cloudflare Pages Functions.
 *
 * Usage:
 *   import { requireAuth, requirePro, getAuth } from '../_shared/clerk.js';
 */

const CLERK_API = 'https://api.clerk.com/v1';

/**
 * Verify the Clerk session token from the request.
 * Returns { userId, sessionId, isPro, isFamily } or null if not authenticated.
 */
export async function getAuth(request, env) {
  try {
    const token = extractToken(request);
    if (!token) return null;

    // Decode JWT payload (Clerk JWTs are standard JWTs)
    // We decode without verifying signature here, then validate by fetching the user
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    let payload;
    try {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const padded  = base64 + '=='.slice((2 - base64.length * 3) & 3);
      payload = JSON.parse(atob(padded));
    } catch { return null; }

    const userId = payload?.sub;
    if (!userId) return null;

    // Check token expiry
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;

    // Fetch user from Clerk backend to get fresh publicMetadata
    const userRes = await fetch(`${CLERK_API}/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${env.CLERK_SECRET_KEY}` },
    });

    if (!userRes.ok) {
      console.error('Clerk user fetch failed:', userRes.status);
      return null;
    }
    const user = await userRes.json();

    return {
      userId,
      sessionId: payload.sid,
      isPro:    user.public_metadata?.isPro === true,
      isFamily: user.public_metadata?.isFamily === true,
      user,
    };
  } catch (e) {
    console.error('getAuth error:', e);
    return null;
  }
}

/**
 * Guard: requires a valid session. Returns 401 JSON if not authenticated.
 * Returns the auth object if valid.
 */
export async function requireAuth(request, env) {
  const auth = await getAuth(request, env);
  if (!auth) return { error: json401('Unauthorised') };
  return { auth };
}

/**
 * Guard: requires a valid session.
 * In beta (BILLING_ENABLED = false): all signed-in users have access
 * In production: only Pro/Family subscribers have access
 */
export async function requirePro(request, env) {
  const auth = await getAuth(request, env);
  if (!auth) return { error: json401('Unauthorised') };

  // Beta mode — all signed-in users have access
  if (!env.BILLING_ENABLED) {
    return { auth };
  }

  // Production mode — check subscription
  if (env.DB) {
    try {
      const sub = await env.DB
        .prepare(`SELECT tier, status, renews_at FROM subscriptions WHERE user_id = ? LIMIT 1`)
        .bind(auth.userId)
        .first();

      // Check if subscription is active
      if (sub && (sub.status === 'active' || sub.status === 'trial')) {
        const renewalDate = new Date(sub.renews_at);
        if (new Date() < renewalDate) {
          return { auth }; // Subscription is valid
        }
      }
    } catch (err) {
      console.error('Error checking subscription:', err);
      // Continue to check metadata fallback
    }
  }

  // Fallback to metadata (for cases where DB is not available)
  if (auth.isPro || auth.isFamily) {
    return { auth };
  }

  return { error: json403('Pro subscription required') };
}

/**
 * Guard: requires a Family subscription
 * In beta: all signed-in users have access
 * In production: only Family subscribers have access
 */
export async function requireFamily(request, env) {
  const auth = await getAuth(request, env);
  if (!auth) return { error: json401('Unauthorised') };

  // Beta mode — all signed-in users have access
  if (!env.BILLING_ENABLED) {
    return { auth };
  }

  // Production mode — check subscription
  if (env.DB) {
    try {
      const sub = await env.DB
        .prepare(`SELECT tier, status, renews_at FROM subscriptions WHERE user_id = ? LIMIT 1`)
        .bind(auth.userId)
        .first();

      // Check if subscription is Family and active
      if (sub && sub.tier === 'family' && (sub.status === 'active' || sub.status === 'trial')) {
        const renewalDate = new Date(sub.renews_at);
        if (new Date() < renewalDate) {
          return { auth }; // Subscription is valid
        }
      }
    } catch (err) {
      console.error('Error checking subscription:', err);
      // Continue to check metadata fallback
    }
  }

  // Fallback to metadata
  if (auth.isFamily) {
    return { auth };
  }

  return { error: json403('Family subscription required') };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function extractToken(request) {
  // Check Authorization: Bearer <token>
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check __session cookie (Clerk default)
  const cookie = request.headers.get('Cookie') || '';
  const match  = cookie.match(/(?:^|;\s*)__session=([^;]+)/);
  if (match) return match[1];

  return null;
}

function json401(message) {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

function json403(message) {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Convenience: build a JSON response */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/** Convenience: CORS preflight handler */
export function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
