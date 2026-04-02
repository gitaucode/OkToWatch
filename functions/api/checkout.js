/**
 * Checkout Endpoint
 * Generates Dodo Payments checkout links for Pro and Family subscriptions
 * 
 * POST /api/checkout
 * Body: { plan: "pro|family", billingCycle: "monthly|yearly" }
 * 
 * Returns: { checkoutUrl: "https://dodo.payments/checkout/..." }
 */

import { getAuth } from '../_shared/clerk.js';

const DODO_API_BASE = 'https://api.dodopayments.com/v1';
const DODO_API_KEY = env.DODO_API_KEY;

// Map our tiers to Dodo product IDs
const PRODUCT_MAP = {
  'pro-monthly': {
    productId: 'pdt_0Nbr4kPAG5n9yXCxF7w62',
    name: 'Pro Monthly',
    price: 499, // $4.99 in cents
    interval: 'month',
  },
  'pro-yearly': {
    productId: 'pdt_0Nbr4wkuJCZ2G0JWAetog',
    name: 'Pro Yearly',
    price: 4999, // $49.99 in cents
    interval: 'year',
  },
  'family-monthly': {
    productId: 'pdt_0Nbr54CnvJt3KBKEBBYeM',
    name: 'Family Monthly',
    price: 799, // $7.99 in cents
    interval: 'month',
  },
  'family-yearly': {
    productId: 'pdt_0Nbr5tE4vwLj4afwcdvFm',
    name: 'Family Yearly',
    price: 7999, // $79.99 in cents
    interval: 'year',
  },
};

/**
 * Create or get Dodo customer for this user
 */
async function getOrCreateDodoCustomer(userId, email, name) {
  try {
    // First, check if we already have a Dodo customer ID stored
    const db = env.DB;
    if (db) {
      const sub = await db
        .prepare(`SELECT dodo_customer_id FROM subscriptions WHERE user_id = ?`)
        .bind(userId)
        .first();
      
      if (sub?.dodo_customer_id) {
        return sub.dodo_customer_id;
      }
    }

    // Create new Dodo customer
    const response = await fetch(`${DODO_API_BASE}/customers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DODO_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        name,
        metadata: {
          user_id: userId,
          signup_date: new Date().toISOString(),
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Dodo customer creation failed:', error);
      throw new Error(`Dodo API error: ${response.status}`);
    }

    const data = await response.json();
    return data.id;
  } catch (err) {
    console.error('Error managing Dodo customer:', err);
    throw err;
  }
}

/**
 * Create checkout session with Dodo
 */
async function createDodoCheckoutSession(customerId, plan, billingCycle, returnUrl) {
  const key = `${plan}-${billingCycle}`;
  const product = PRODUCT_MAP[key];

  if (!product) {
    throw new Error(`Invalid plan: ${key}`);
  }

  try {
    const response = await fetch(`${DODO_API_BASE}/checkout_sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DODO_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer_id: customerId,
        line_items: [
          {
            product_id: product.productId,
            quantity: 1,
            price_cents: product.price,
            interval: product.interval,
            trial_days: 30, // 30-day free trial
          },
        ],
        success_url: `${returnUrl}?checkout=success`,
        cancel_url: `${returnUrl}?checkout=cancelled`,
        automatic_tax: true,
        allow_discount_codes: true,
        metadata: {
          plan,
          billing_cycle: billingCycle,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Dodo checkout session creation failed:', error);
      throw new Error(`Dodo API error: ${response.status}`);
    }

    const data = await response.json();
    return data.url; // Dodo returns the checkout URL directly
  } catch (err) {
    console.error('Error creating checkout session with Dodo:', err);
    throw err;
  }
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

    const userId = auth.userId;

    // Parse request body
    const { plan, billingCycle, redirectUrl } = await request.json();

    // Validate input
    if (!plan || !billingCycle) {
      return new Response(
        JSON.stringify({ error: 'Missing plan or billingCycle' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!['pro', 'family'].includes(plan)) {
      return new Response(
        JSON.stringify({ error: 'Invalid plan' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!['monthly', 'yearly'].includes(billingCycle)) {
      return new Response(
        JSON.stringify({ error: 'Invalid billingCycle' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const returnUrl = redirectUrl || `${new URL(request.url).origin}/dashboard`;

    // Get user info from Clerk (using the token to fetch user details)
    // Note: In a real implementation, you'd decode the token or use Clerk's API
    // For now, we'll use the user ID directly
    const userEmail = `user_${userId}@oktowatch.local`; // Placeholder
    const userName = `User ${userId}`; // Placeholder

    // Get or create Dodo customer
    const customerId = await getOrCreateDodoCustomer(userId, userEmail, userName);

    // Create checkout session
    const checkoutUrl = await createDodoCheckoutSession(
      customerId,
      plan,
      billingCycle,
      returnUrl
    );

    return new Response(
      JSON.stringify({
        checkoutUrl,
        customerId, // Return for reference (optional)
      }),
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
