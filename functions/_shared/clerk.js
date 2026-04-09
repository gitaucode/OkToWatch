import { jsonWithCors, optionsResponse } from './cors.js';

/**
 * OkToWatch — functions/_shared/clerk.js
 * Shared Clerk auth helpers for all Cloudflare Pages Functions.
 *
 * Drop-in compatible with existing imports:
 * - getAuth
 * - requireAuth
 * - requirePro
 * - requireFamily
 * - jsonResponse
 * - handleOptions
 */

const CLERK_API = 'https://api.clerk.com/v1';
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

let jwksCache = null;
let jwksFetchedAt = 0;

export async function getAuth(request, env) {
  try {
    const token = extractToken(request);
    if (!token) return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = decodeJwtPart(parts[0]);
    const payload = decodeJwtPart(parts[1]);

    if (!header || !payload) return null;
    if (header.alg !== 'RS256') return null;
    if (!header.kid) return null;
    if (!payload.sub) return null;

    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    if (payload.nbf && Date.now() / 1000 < payload.nbf) return null;

    let jwks = await getJWKS(env, false);
    if (!jwks || !jwks.keys || !Array.isArray(jwks.keys)) return null;

    let key = findKeyByKid(jwks, header.kid);

    if (!key) {
      jwks = await getJWKS(env, true);
      if (!jwks || !jwks.keys || !Array.isArray(jwks.keys)) return null;
      key = findKeyByKid(jwks, header.kid);
      if (!key) return null;
    }

    const publicKey = await crypto.subtle.importKey(
      'jwk',
      key,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256'
      },
      false,
      ['verify']
    );

    const signingInput = new TextEncoder().encode(parts[0] + '.' + parts[1]);
    const signature = base64UrlToUint8Array(parts[2]);

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      signature,
      signingInput
    );

    if (!valid) return null;

    const userRes = await fetch(CLERK_API + '/users/' + payload.sub, {
      headers: {
        'Authorization': 'Bearer ' + env.CLERK_SECRET_KEY,
        'Accept': 'application/json'
      }
    });

    if (!userRes.ok) {
      console.error('Clerk user fetch failed:', userRes.status);
      return null;
    }

    const user = await userRes.json();

    return {
      userId: payload.sub,
      sessionId: payload.sid || null,
      isPro: !!(user.public_metadata && user.public_metadata.isPro === true),
      isFamily: !!(user.public_metadata && user.public_metadata.isFamily === true),
      user: user
    };
  } catch (e) {
    console.error('getAuth error:', e);
    return null;
  }
}

export async function requireAuth(request, env) {
  const auth = await getAuth(request, env);
  if (!auth) return { error: json401('Unauthorised') };
  return { auth: auth };
}

export async function requirePro(request, env) {
  const auth = await getAuth(request, env);
  if (!auth) return { error: json401('Unauthorised') };

  if (env.DB) {
    try {
      const sub = await env.DB
        .prepare('SELECT tier, status, renews_at FROM subscriptions WHERE user_id = ? LIMIT 1')
        .bind(auth.userId)
        .first();

      if (sub && (sub.status === 'active' || sub.status === 'trial')) {
        const renewalDate = new Date(sub.renews_at);
        if (!Number.isNaN(renewalDate.getTime()) && new Date() < renewalDate) {
          return { auth: auth };
        }
      }
    } catch (err) {
      console.error('Error checking subscription:', err);
    }
  }

  if (auth.isPro || auth.isFamily) {
    return { auth: auth };
  }

  return { error: json403('Pro subscription required') };
}

export async function requireFamily(request, env) {
  const auth = await getAuth(request, env);
  if (!auth) return { error: json401('Unauthorised') };

  if (env.DB) {
    try {
      const sub = await env.DB
        .prepare('SELECT tier, status, renews_at FROM subscriptions WHERE user_id = ? LIMIT 1')
        .bind(auth.userId)
        .first();

      if (sub && sub.tier === 'family' && (sub.status === 'active' || sub.status === 'trial')) {
        const renewalDate = new Date(sub.renews_at);
        if (!Number.isNaN(renewalDate.getTime()) && new Date() < renewalDate) {
          return { auth: auth };
        }
      }
    } catch (err) {
      console.error('Error checking subscription:', err);
    }
  }

  if (auth.isFamily) {
    return { auth: auth };
  }

  return { error: json403('Family subscription required') };
}

export function jsonResponse(data, status, request = new Request('https://oktowatch.local'), env = {}) {
  return jsonWithCors(data, request, env, {
    status: status || 200,
    methods: 'GET, POST, PUT, DELETE, OPTIONS',
    headers: 'Content-Type, Authorization'
  });
}

export function handleOptions(request = new Request('https://oktowatch.local'), env = {}) {
  return optionsResponse(request, env, {
    methods: 'GET, POST, PUT, DELETE, OPTIONS',
    headers: 'Content-Type, Authorization',
    maxAge: 86400
  });
}

async function getJWKS(env, forceRefresh) {
  const now = Date.now();

  if (!forceRefresh && jwksCache && (now - jwksFetchedAt) < JWKS_CACHE_TTL_MS) {
    return jwksCache;
  }

  const jwksUrl = getJwksUrl(env);
  if (!jwksUrl) {
    console.error('Missing CLERK_FRONTEND_API');
    return null;
  }

  try {
    const res = await fetch(jwksUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      console.error('JWKS fetch failed:', res.status);
      return null;
    }

    const data = await res.json();
    if (!data || !data.keys || !Array.isArray(data.keys)) return null;

    jwksCache = data;
    jwksFetchedAt = now;

    return data;
  } catch (e) {
    console.error('JWKS fetch error:', e);
    return null;
  }
}

function getJwksUrl(env) {
  if (!env || !env.CLERK_FRONTEND_API) return null;

  let base = String(env.CLERK_FRONTEND_API).replace(/\/+$/, '');

  if (base.indexOf('http://') !== 0 && base.indexOf('https://') !== 0) {
    base = 'https://' + base;
  }

  return base + '/.well-known/jwks.json';
}

function findKeyByKid(jwks, kid) {
  if (!jwks || !jwks.keys) return null;

  for (let i = 0; i < jwks.keys.length; i++) {
    if (jwks.keys[i] && jwks.keys[i].kid === kid) {
      return jwks.keys[i];
    }
  }

  return null;
}

function extractToken(request) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.indexOf('Bearer ') === 0) {
    return authHeader.slice(7);
  }

  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)__session=([^;]+)/);
  if (match) return match[1];

  return null;
}

function decodeJwtPart(part) {
  try {
    const bytes = base64UrlToUint8Array(part);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function base64UrlToUint8Array(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function json401(message) {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
}

function json403(message) {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' }
  });
}
