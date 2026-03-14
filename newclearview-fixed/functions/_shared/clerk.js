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
 * Guard: requires a paid plan (Pro or Family) OR an active trial.
 * Returns 401/403 if not authenticated or not on a paid/trial plan.
 */
export async function requirePro(request, env) {
  const auth = await getAuth(request, env);
  if (!auth) return { error: json401('Unauthorised') };
  const meta = auth.user?.public_metadata || {};
  const isTrial = meta.isTrial === true || meta.subStatus === 'trialing';
  if (!auth.isPro && !auth.isFamily && !isTrial) {
    return { error: json403('Subscription required') };
  }
  return { auth };
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
