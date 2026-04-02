/**
 * Subscription Status Endpoint
 * Returns current subscription info for authenticated user
 * 
 * GET /api/subscription-status
 * Returns: { tier: "free|pro|family", status: "active|trial|cancelled|expired", ... }
 */

import { getAuth } from '../_shared/clerk.js';

/**
 * Get subscription status for user
 */
async function getUserSubscription(userId, db) {
  if (!db) return null;

  try {
    const sub = await db
      .prepare(
        `SELECT * FROM subscriptions
         WHERE user_id = ? AND (status = 'active' OR status = 'trial')
         ORDER BY created_at DESC LIMIT 1`
      )
      .bind(userId)
      .first();

    return sub;
  } catch (err) {
    console.error('Error fetching subscription:', err);
    return null;
  }
}

/**
 * Check if trial period is still active
 */
function isTrialActive(sub) {
  if (!sub || sub.status !== 'trial') return false;
  if (!sub.trial_ends_at) return false;

  const trialEnd = new Date(sub.trial_ends_at);
  return new Date() < trialEnd;
}

/**
 * Check if subscription is valid and active
 */
function isSubscriptionActive(sub) {
  if (!sub) return false;
  if (sub.status === 'cancelled' || sub.status === 'expired') return false;

  const renewalDate = new Date(sub.renews_at);
  if (new Date() >= renewalDate) {
    // Subscription has expired
    return false;
  }

  return true;
}

/**
 * Handler
 */
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Verify authentication
    const auth = await getAuth(request, env);

    if (!auth) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userId = auth.userId;

    // Get subscription from database
    const db = env.DB;
    const subscription = await getUserSubscription(userId, db);

    // Determine current tier and status
    let tier = 'free'; // Default
    let status = 'free'; // Default status
    let renewsAt = null;
    let trialEndsAt = null;

    if (subscription) {
      if (isSubscriptionActive(subscription)) {
        tier = subscription.tier;
        status = isTrialActive(subscription) ? 'trial' : 'active';
        renewsAt = subscription.renews_at;
        trialEndsAt = subscription.trial_ends_at;
      } else if (subscription.status === 'cancelled') {
        tier = 'free'; // Downgrade to free after cancellation
        status = 'cancelled';
      } else {
        tier = 'free';
        status = 'expired';
      }
    }

    // Return subscription info
    return new Response(
      JSON.stringify({
        tier,
        status,
        renewsAt,
        trialEndsAt,
        isPro: tier === 'pro',
        isFamily: tier === 'family',
        isActive: tier !== 'free' && status !== 'expired' && status !== 'cancelled',
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
    console.error('Subscription status error:', err);
    return new Response(
      JSON.stringify({ error: err.message, tier: 'free', status: 'error' }),
      {
        status: 200, // Return 200 to avoid breaking client code
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
