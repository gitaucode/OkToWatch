/**
 * Subscription Middleware
 * Helpers for checking subscription status and gating features
 * 
 * Usage:
 *   import { requireSubscription, getUserTier } from '../_shared/subscription.js';
 *   
 *   const tier = await getUserTier(userId, db);
 *   if (!tier === 'pro') return error(...);
 */

/**
 * Get user's current subscription tier
 * Returns: 'free', 'pro', 'family'
 */
export async function getUserTier(userId, db) {
  if (!db) return 'free';

  try {
    const sub = await db
      .prepare(
        `SELECT tier, status, trial_ends_at, renews_at FROM subscriptions
         WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`
      )
      .bind(userId)
      .first();

    if (!sub) return 'free';

    // Check if subscription is still valid
    if (sub.status === 'cancelled' || sub.status === 'expired') {
      return 'free';
    }

    const renewalDate = new Date(sub.renews_at);
    if (new Date() >= renewalDate) {
      return 'free'; // Time to renew
    }

    return sub.tier; // pro or family
  } catch (err) {
    console.error('Error getting user tier:', err);
    return 'free';
  }
}

/**
 * Check if user has Pro or Family subscription
 */
export async function hasPaidSubscription(userId, db) {
  const tier = await getUserTier(userId, db);
  return tier === 'pro' || tier === 'family';
}

/**
 * Check if user has Family subscription specifically
 */
export async function hasFamily(userId, db) {
  const tier = await getUserTier(userId, db);
  return tier === 'family';
}

/**
 * Middleware to require feature gating
 * Throws error if user doesn't have required tier
 */
export async function requireTier(userId, db, requiredTier) {
  const tier = await getUserTier(userId, db);

  if (requiredTier === 'pro' && (tier !== 'pro' && tier !== 'family')) {
    throw new Error('Pro subscription required for this feature');
  }

  if (requiredTier === 'family' && tier !== 'family') {
    throw new Error('Family subscription required for this feature');
  }

  return tier;
}

/**
 * Middleware response for gated features
 */
export function gateFeaturesResponse(feature, tier) {
  return new Response(
    JSON.stringify({
      error: 'Feature requires subscription',
      feature,
      currentTier: tier,
      requiredTier: feature === 'lists' || feature === 'profiles' || feature === 'history' ? 'pro' : 'family',
      message: tier === 'free' 
        ? `${feature} is only available with Pro or Family. Start your free trial to unlock.`
        : `${feature} requires a higher tier subscription.`,
    }),
    {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
