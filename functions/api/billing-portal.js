import { getAuth } from '../_shared/clerk.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

async function getCurrentSubscription(userId, db) {
  if (!db) return null;

  return db.prepare(
    `SELECT user_id, dodo_customer_id, dodo_order_id, tier, status, renews_at
     FROM subscriptions
     WHERE user_id = ?
       AND (status = 'active' OR status = 'trial')
     ORDER BY created_at DESC
     LIMIT 1`
  ).bind(userId).first();
}

async function createPortalLink(customerId, env) {
  const isTestMode = env.DODO_API_KEY?.startsWith('test_');
  const basePath = isTestMode ? 'https://test.dodopayments.com' : 'https://live.dodopayments.com';
  const url = `${basePath}/customers/${encodeURIComponent(customerId)}/customer-portal/session`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.DODO_API_KEY}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
  });

  let body = {};
  try {
    body = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(body?.message || `Billing portal error (${response.status})`);
  }

  const link = body.link || body.url || body.portal_url;
  if (!link) {
    throw new Error('Billing portal link missing from provider response');
  }

  return link;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return json({}, 204);
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const auth = await getAuth(request, env);
    if (!auth) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const subscription = await getCurrentSubscription(auth.userId, env.DB);
    if (!subscription || !subscription.dodo_customer_id || subscription.tier === 'free') {
      return json({ error: 'No active paid subscription found' }, 404);
    }

    if (!env.DODO_API_KEY) {
      return json({ error: 'Billing portal is not configured' }, 500);
    }

    const portalUrl = await createPortalLink(subscription.dodo_customer_id, env);
    return json({ portalUrl });
  } catch (err) {
    console.error('Billing portal error:', err);
    return json({ error: err.message || 'Failed to create billing portal session' }, 500);
  }
}
