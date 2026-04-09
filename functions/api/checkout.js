/**
 * Checkout Endpoint
 * Generates Dodo Payments checkout links for Pro and Family subscriptions
 *
 * POST /api/checkout
 * Body: { plan: "pro|family", billingCycle: "monthly|yearly", redirectUrl?: string }
 *
 * Returns: { checkoutUrl: "https://checkout.dodopayments.com/..." }
 */

import { getAuth } from '../_shared/clerk.js';
import { jsonWithCors, optionsResponse } from '../_shared/cors.js';

// We'll dynamically determine the Dodo API base URL based on the API key prefix
// Checkouts will use either test.dodopayments.com or live.dodopayments.com
// Map our tiers to Dodo product IDs (set up in Dodo dashboard)
const PRODUCT_MAP = {
  'pro-monthly': {
    productId: 'pdt_0NbuM2yMGhrcndSFQSONJ',
    name: 'Pro Monthly',
  },
  'pro-yearly': {
    productId: 'pdt_0NbuMAYUaN7DFufZHdGRG',
    name: 'Pro Yearly',
  },
  'family-monthly': {
    productId: 'pdt_0NbuML3eDWo8BlbR48Rfs',
    name: 'Family Monthly',
  },
  'family-yearly': {
    productId: 'pdt_0NbuMVVlgNEQUah6C5uPC',
    name: 'Family Yearly',
  },
};

/**
 * Create a Dodo Payments hosted checkout.
 * Uses the correct POST /checkouts endpoint with inline customer + product_cart.
 * Returns the checkout_url to redirect the user to.
 */
async function createDodoCheckout(userEmail, userName, plan, billingCycle, returnUrl, env, userId) {
  const key = `${plan}-${billingCycle}`;
  const product = PRODUCT_MAP[key];

  if (!product) {
    throw new Error(`Invalid plan combination: ${key}`);
  }

  const isTestMode = env.DODO_API_KEY?.startsWith('test_');
  const basePath = isTestMode ? 'https://test.dodopayments.com' : 'https://live.dodopayments.com';

  const response = await fetch(`${basePath}/checkouts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.DODO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      customer: {
        email: userEmail,
        name: userName,
      },
      product_cart: [
        {
          product_id: product.productId,
          quantity: 1,
        },
      ],
      return_url: returnUrl,
      metadata: {
        user_id: userId,
        plan,
        billing_cycle: billingCycle,
      },
    }),
  });

  let body;
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    console.error('Dodo checkout creation failed:', response.status, body);
    throw new Error(
      `Dodo API error: ${response.status} — ${body?.message || JSON.stringify(body)}`
    );
  }

  // Dodo returns the hosted checkout URL in `checkout_url`
  const checkoutUrl = body.checkout_url || body.url;
  if (!checkoutUrl) {
    throw new Error(
      'Dodo did not return a checkout URL. Response: ' + JSON.stringify(body)
    );
  }

  return checkoutUrl;
}

/**
 * Handler
 */
export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return optionsResponse(request, env, {
      methods: 'POST, OPTIONS',
      headers: 'Content-Type, Authorization',
      maxAge: 86400
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Verify user is authenticated
    const auth = await getAuth(request, env);

    if (!auth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { plan, billingCycle, redirectUrl } = await request.json();

    // Validate inputs
    if (!plan || !billingCycle) {
      return jsonWithCors({ error: 'Missing plan or billingCycle' }, request, env, { status: 400 });
    }

    if (!['pro', 'family'].includes(plan)) {
      return jsonWithCors({ error: 'Invalid plan. Must be "pro" or "family".' }, request, env, { status: 400 });
    }

    if (!['monthly', 'yearly'].includes(billingCycle)) {
      return jsonWithCors({ error: 'Invalid billingCycle. Must be "monthly" or "yearly".' }, request, env, { status: 400 });
    }

    // Build an absolute return URL
    const origin = new URL(request.url).origin;
    let returnUrl = redirectUrl || '/dashboard';
    if (returnUrl.startsWith('/')) {
      returnUrl = `${origin}${returnUrl}`;
    }

    // Extract user info from the Clerk user object returned by getAuth
    const userData = auth.user;
    const userEmail =
      userData?.email_addresses?.[0]?.email_address ||
      userData?.emails?.[0]?.email_address ||
      `user_${auth.userId}@oktowatch.local`;
    const userName =
      `${userData?.first_name || ''} ${userData?.last_name || ''}`.trim() ||
      userData?.username ||
      `User ${auth.userId}`;

    // Create Dodo hosted checkout and get redirect URL
    const checkoutUrl = await createDodoCheckout(
      userEmail,
      userName,
      plan,
      billingCycle,
      returnUrl,
      env,
      auth.userId
    );

    return jsonWithCors({ checkoutUrl }, request, env);
  } catch (err) {
    console.error('Checkout error:', err);
    return jsonWithCors({ error: err.message }, request, env, { status: 500 });
  }
}
