/**
 * Secure Clerk auth with JWT signature verification
 */

const JWKS_CACHE_TTL = 60 * 60 * 1000; // 1 hour
let jwksCache = null;
let jwksFetchedAt = 0;

export async function getAuth(request, env) {
  try {
    const token = extractToken(request);
    if (!token) return null;

    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = JSON.parse(decodeBase64(parts[0]));
    const payload = JSON.parse(decodeBase64(parts[1]));

    if (!header.kid || !payload.sub) return null;

    if (payload.exp && Date.now() / 1000 > payload.exp) return null;

    const jwks = await getJWKS(env, header.kid);
    if (!jwks) return null;

    const key = jwks.keys.find(function (k) {
      return k.kid === header.kid;
    });

    if (!key) return null;

    const publicKey = await crypto.subtle.importKey(
      'jwk',
      key,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      base64ToArrayBuffer(parts[2]),
      new TextEncoder().encode(parts[0] + '.' + parts[1])
    );

    if (!valid) return null;

    const userRes = await fetch('https://api.clerk.com/v1/users/' + payload.sub, {
      headers: {
        Authorization: 'Bearer ' + env.CLERK_SECRET_KEY
      }
    });

    if (!userRes.ok) return null;

    const user = await userRes.json();

    return {
      userId: payload.sub,
      sessionId: payload.sid,
      isPro: user.public_metadata && user.public_metadata.isPro === true,
      isFamily: user.public_metadata && user.public_metadata.isFamily === true,
      user: user
    };

  } catch (e) {
    console.error('getAuth error:', e);
    return null;
  }
}

async function getJWKS(env, kid) {
  const now = Date.now();

  if (jwksCache && now - jwksFetchedAt < JWKS_CACHE_TTL) {
    return jwksCache;
  }

  try {
    const url = 'https://' + env.CLERK_FRONTEND_API + '/.well-known/jwks.json';

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();

    jwksCache = data;
    jwksFetchedAt = now;

    return data;
  } catch {
    return null;
  }
}

function extractToken(request) {
  const authHeader = request.headers.get('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)__session=([^;]+)/);

  if (match) return match[1];

  return null;
}

function decodeBase64(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '=='.slice((2 - base64.length * 3) & 3);
  return atob(padded);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}
