/**
 * Dodo Payments Webhook Handler
 * Receives payment confirmation events and updates subscription status
 * 
 * Environment Variables:
 * - DODO_API_KEY: Secret key for authenticating with Dodo API
 * - DODO_WEBHOOK_SECRET: Secret for verifying webhook signature (if Dodo provides)
 * - D1_DATABASE: D1 database binding for subscriptions table
 */

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

// Map Dodo product IDs to our tier/billing cycle
const DODO_PRODUCTS = {
  'pdt_0NbuM2yMGhrcndSFQSONJ': { tier: 'pro',    cycle: 'monthly', cents: 499  },
  'pdt_0NbuMAYUaN7DFufZHdGRG': { tier: 'pro',    cycle: 'yearly',  cents: 4999 },
  'pdt_0NbuML3eDWo8BlbR48Rfs': { tier: 'family', cycle: 'monthly', cents: 799  },
  'pdt_0NbuMVVlgNEQUah6C5uPC': { tier: 'family', cycle: 'yearly',  cents: 7999 },
};

/**
 * Verify Dodo webhook signature (if provided)
 * This prevents webhook spoofing
 */
async function verifyWebhookSignature({ body, signature, webhookId, webhookTimestamp, webhookSecret }) {
  if (!webhookSecret || !signature || !webhookId || !webhookTimestamp) {
    return false;
  }

  const timestamp = Number(webhookTimestamp);
  if (!Number.isFinite(timestamp)) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }

  const payload = `${webhookId}.${webhookTimestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const expectedBase64 = uint8ArrayToBase64(new Uint8Array(digest));
  const candidates = parseSignatureCandidates(signature);

  return candidates.some((candidate) => timingSafeEqual(candidate, expectedBase64));
}

function parseSignatureCandidates(signatureHeader) {
  return String(signatureHeader || '')
    .split(/\s+/)
    .flatMap((part) => part.split(','))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf('=');
      if (eq !== -1) return part.slice(eq + 1).trim();
      const semi = part.indexOf(';');
      if (semi !== -1) return part.slice(semi + 1).trim();
      return part;
    })
    .filter(Boolean);
}

function uint8ArrayToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function timingSafeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  const max = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < max; i += 1) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

async function ensureWebhookDeliveriesTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      webhook_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      received_at TEXT DEFAULT (datetime('now'))
    )
  `).run();
}

async function markWebhookReceived(db, webhookId) {
  try {
    await db.prepare(
      'INSERT INTO webhook_deliveries (webhook_id, source) VALUES (?, ?)'
    ).bind(webhookId, 'dodo').run();
    return true;
  } catch (error) {
    const message = String(error?.message || error);
    if (/UNIQUE|primary key/i.test(message)) return false;
    throw error;
  }
}

/**
 * Calculate renewal date based on billing cycle
 */
function calculateRenewalDate(billingCycle) {
  const now = new Date();
  const renewal = new Date(now);
  
  if (billingCycle === 'yearly') {
    renewal.setFullYear(renewal.getFullYear() + 1);
  } else {
    renewal.setMonth(renewal.getMonth() + 1);
  }
  
  return renewal.toISOString();
}

/**
 * Format ISO date to SQL datetime format
 */
function toSqlDate(isoDate) {
  return isoDate ? new Date(isoDate).toISOString().replace('T', ' ').slice(0, 19) : null;
}

/**
 * Handle successful payment (order completed)
 */
async function handlePaymentConfirmed(event, db, clerk, env) {
  const { orderId, customerId, productId, metadata } = event;
  const userId = metadata?.user_id || metadata?.userId;

  if (!userId) {
    console.error('Payment confirmed but no userId in metadata:', event);
    return { error: 'No userId in metadata', status: 400 };
  }

  const product = DODO_PRODUCTS[productId];
  if (!product) {
    console.error('Unknown Dodo product:', productId);
    return { error: 'Unknown product', status: 400 };
  }

  const { tier, cycle, cents } = product;
  const renewalDate = calculateRenewalDate(cycle);
  const sqlRenewal = toSqlDate(renewalDate);
  const sqlNow = new Date().toISOString().replace('T', ' ').slice(0, 19);

  try {
    // Insert or update subscription
    const sqlTrialEnd = new Date(Date.now() + 14*24*60*60*1000).toISOString().replace('T', ' ').slice(0, 19);
    
    const result = await db
      .prepare(
        `INSERT INTO subscriptions (
          user_id, dodo_customer_id, dodo_order_id, tier, billing_cycle,
          status, price_cents, trial_ends_at, renews_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          dodo_customer_id = excluded.dodo_customer_id,
          dodo_order_id = excluded.dodo_order_id,
          tier = excluded.tier,
          billing_cycle = excluded.billing_cycle,
          status = 'active',
          price_cents = excluded.price_cents,
          renews_at = excluded.renews_at,
          cancelled_at = NULL,
          updated_at = excluded.updated_at`
      )
      .bind(
        userId,
        customerId,
        orderId,
        tier,
        cycle,
        'active',
        cents,
        sqlTrialEnd,
        sqlRenewal,
        sqlNow,
        sqlNow
      )
      .run();

    console.log(`Subscription created/updated for user ${userId}: ${tier} ${cycle}`);

    // Update Clerk user metadata with subscription info via Clerk API
    if (env.CLERK_SECRET_KEY) {
      try {
        const clerkRes = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${env.CLERK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            public_metadata: {
              subscriptionTier: tier,
              subscriptionStatus: 'active',
              subscriptionExpires: renewalDate,
            },
          }),
        });
        if (clerkRes.ok) {
          console.log(`Updated Clerk metadata for user ${userId}`);
        } else {
          console.error(`Failed to update Clerk metadata: ${clerkRes.status}`);
        }
      } catch (clerkErr) {
        console.error(`Failed to update Clerk metadata for ${userId}:`, clerkErr);
        // Don't fail the webhook if metadata update fails
      }
    }

    return { success: true, status: 200 };
  } catch (err) {
    console.error('Database error inserting subscription:', err);
    return { error: 'Database error', status: 500 };
  }
}

/**
 * Handle subscription renewal (recurring charge)
 */
async function handleSubscriptionRenewed(event, db, clerk, env) {
  const { orderId, customerId, productId } = event;

  try {
    const sub = await db
      .prepare(`SELECT * FROM subscriptions WHERE dodo_customer_id = ?`)
      .bind(customerId)
      .first();

    if (!sub) {
      console.warn('Renewal webhook for unknown customer:', customerId);
      return { error: 'Subscription not found', status: 404 };
    }

    const product = DODO_PRODUCTS[productId];
    if (!product) {
      console.error('Unknown product in renewal:', productId);
      return { error: 'Unknown product', status: 400 };
    }

    const renewalDate = calculateRenewalDate(product.cycle);
    const sqlRenewal = toSqlDate(renewalDate);
    const sqlNow = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // Update subscription with new renewal date
    await db
      .prepare(
        `UPDATE subscriptions SET
          dodo_order_id = ?, status = 'active', renews_at = ?, updated_at = ?
        WHERE dodo_customer_id = ?`
      )
      .bind(orderId, sqlRenewal, sqlNow, customerId)
      .run();

    console.log(`Subscription renewed for customer ${customerId}`);

    // Update Clerk metadata via Clerk API
    if (env.CLERK_SECRET_KEY && sub.user_id) {
      try {
        const clerkRes = await fetch(`https://api.clerk.com/v1/users/${sub.user_id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${env.CLERK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            public_metadata: {
              subscriptionStatus: 'active',
              subscriptionExpires: renewalDate,
            },
          }),
        });
        if (clerkRes.ok) {
          console.log(`Updated Clerk metadata for renewal of ${sub.user_id}`);
        }
      } catch (clerkErr) {
        console.error(`Failed to update Clerk for renewal:`, clerkErr);
      }
    }

    return { success: true, status: 200 };
  } catch (err) {
    console.error('Error handling subscription renewal:', err);
    return { error: 'Database error', status: 500 };
  }
}

/**
 * Handle payment failed / refund
 */
async function handlePaymentFailed(event, db) {
  const { orderId, customerId, reason } = event;

  try {
    // Mark subscription as expired/cancelled
    const sqlNow = new Date().toISOString().replace('T', ' ').slice(0, 19);
    
    await db
      .prepare(
        `UPDATE subscriptions SET
          status = 'expired', cancelled_at = ?, updated_at = ?
        WHERE dodo_customer_id = ? OR dodo_order_id = ?`
      )
      .bind(sqlNow, sqlNow, customerId, orderId)
      .run();

    console.log(`Payment failed for order ${orderId}, customer ${customerId}: ${reason}`);
    return { success: true, status: 200 };
  } catch (err) {
    console.error('Error handling payment failure:', err);
    return { error: 'Database error', status: 500 };
  }
}

/**
 * Handle subscription cancellation
 */
async function handleSubscriptionCancelled(event, db) {
  const { customerId } = event;

  try {
    const sqlNow = new Date().toISOString().replace('T', ' ').slice(0, 19);
    
    await db
      .prepare(
        `UPDATE subscriptions SET
          status = 'cancelled', cancelled_at = ?, updated_at = ?
        WHERE dodo_customer_id = ?`
      )
      .bind(sqlNow, sqlNow, customerId)
      .run();

    console.log(`Subscription cancelled for customer ${customerId}`);
    return { success: true, status: 200 };
  } catch (err) {
    console.error('Error cancelling subscription:', err);
    return { error: 'Database error', status: 500 };
  }
}

/**
 * Main webhook handler
 */
export async function onRequest(context) {
  const { request, env } = context;
  const WEBHOOK_SECRET = env.DODO_WEBHOOK_SECRET;

  // Only POST allowed
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);
    const signature = request.headers.get('webhook-signature') || request.headers.get('X-Dodo-Signature');
    const webhookId = request.headers.get('webhook-id');
    const webhookTimestamp = request.headers.get('webhook-timestamp');
    const eventType = body.type;

    // Verify webhook signature
    if (!await verifyWebhookSignature({
      body: rawBody,
      signature,
      webhookId,
      webhookTimestamp,
      webhookSecret: WEBHOOK_SECRET
    })) {
      console.error('Invalid webhook signature');
      return new Response('Invalid signature', { status: 401 });
    }

    // Get database connection
    const db = env.DB;
    if (!db) {
      console.error('D1 database not bound');
      return new Response('Database error', { status: 500 });
    }

    await ensureWebhookDeliveriesTable(db);
    if (webhookId) {
      const isFirstDelivery = await markWebhookReceived(db, webhookId);
      if (!isFirstDelivery) {
        return new Response(
          JSON.stringify({ success: true, duplicate: true, type: eventType }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get Clerk client (optional, for metadata updates)
    let clerk = null;
    // Note: Clerk is not directly available here, so we'll skip it for now
    // In production, you might use Clerk's API directly with the secret key

    let result;

    // Handle different webhook event types (Dodo event names)
    switch (eventType) {
      case 'subscription.active':
        result = await handlePaymentConfirmed(body.data, db, clerk, env);
        break;
      
      case 'subscription.renewed':
        result = await handleSubscriptionRenewed(body.data, db, clerk, env);
        break;
      
      case 'subscription.failed':
        result = await handlePaymentFailed(body.data, db);
        break;
      
      case 'subscription.cancelled':
        result = await handleSubscriptionCancelled(body.data, db);
        break;
      
      default:
        console.log('Unhandled webhook event:', eventType);
        result = { success: true, status: 200 }; // Accept but don't process
    }

    const { error, status, success } = result;
    return new Response(
      JSON.stringify({ success: success !== false, error, type: eventType }),
      { status: status || 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
