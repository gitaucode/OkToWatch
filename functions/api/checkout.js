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

const DODO_API_BASE = 'https://api.dodopayments.com/v1';

// Map our tiers to Dodo product IDs (set up in Dodo dashboard)
const PRODUCT_MAP = {
  'pro-monthly': {
    productId: 'pdt_0Nbr4kPAG5n9yXCxF7w62',
    name: 'Pro Monthly',
  },
  'pro-yearly': {
    productId: 'pdt_0Nbr4wkuJCZ2G0JWAetog',
    name: 'Pro Yearly',
  },
  'family-monthly': {
    productId: 'pdt_0Nbr54CnvJt3KBKEBBYeM',
    name: 'Family Monthly',
  },
  'family-yearly': {
    productId: 'pdt_0Nbr5tE4vwLj4afwcdvFm',
    name: 'Family Yearly',
  },
};

/**
 * Create a Dodo Payments hosted checkout.
 * Uses the correct POST /checkouts endpoint with inline customer + product_cart.
 * Returns the checkout_url to redirect the user to.
 */
async function createDodoCheckout(userEmail, userName, plan, billingCycle, returnUrl, env) {
  const key = `${plan}-${billingCycle}`;
  const product = PRODUCT_MAP[key];

  if (!product) {
    throw new Error(`Invalid plan combination: ${key}`);
  }

  const response = await fetch(`${DODO_API_BASE}/checkouts`, {
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
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
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
      return new Response(
        JSON.stringify({ error: 'Missing plan or billingCycle' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!['pro', 'family'].includes(plan)) {
      return new Response(
        JSON.stringify({ error: 'Invalid plan. Must be "pro" or "family".' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!['monthly', 'yearly'].includes(billingCycle)) {
      return new Response(
        JSON.stringify({ error: 'Invalid billingCycle. Must be "monthly" or "yearly".' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
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
      env
    );

    return new Response(
      JSON.stringify({ checkoutUrl }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err) {
    console.error('Checkout error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
