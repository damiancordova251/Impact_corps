import {
  getAllSubscriptions,
  isPushConfigured,
  isSubscriptionStoreConfigured,
  json
} from "../_shared/backend.js";

// Mirrors Express /api/health for deployment checks on Cloudflare Pages.
export async function onRequestGet({ env }) {
  const storeConfigured = isSubscriptionStoreConfigured(env);

  try {
    const subscriptions = storeConfigured ? await getAllSubscriptions(env) : [];

    return json({
      ok: true,
      vapidConfigured: isPushConfigured(env),
      subscriptionStoreConfigured: storeConfigured,
      subscriptions: subscriptions.length
    });
  } catch (error) {
    console.error("Subscription storage health check failed.", error);

    return json({
      ok: false,
      vapidConfigured: isPushConfigured(env),
      subscriptionStoreConfigured: storeConfigured,
      error: "Subscription storage is unavailable."
    }, { status: 503 });
  }
}
