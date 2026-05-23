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
      runtime: "cloudflare-pages-functions",
      vapidConfigured: isPushConfigured(env),
      subscriptionStoreConfigured: storeConfigured,
      subscriptions: subscriptions.length,
      envDebug: getEnvDebug(env)
    });
  } catch (error) {
    console.error("Subscription storage health check failed.", error);

    return json({
      ok: false,
      runtime: "cloudflare-pages-functions",
      vapidConfigured: isPushConfigured(env),
      subscriptionStoreConfigured: storeConfigured,
      error: "Subscription storage is unavailable.",
      envDebug: getEnvDebug(env)
    }, { status: 503 });
  }
}

function getEnvDebug(env) {
  return {
    hasSupabaseUrl: Boolean(env.SUPABASE_URL),
    hasSupabaseServiceRoleKey: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
    hasSupabasePushSubscriptionsTable: Boolean(env.SUPABASE_PUSH_SUBSCRIPTIONS_TABLE),
    hasSupabasePilotEventsTable: Boolean(env.SUPABASE_PILOT_EVENTS_TABLE),
    hasVapidPublicKey: Boolean(env.VAPID_PUBLIC_KEY),
    hasVapidPrivateKey: Boolean(env.VAPID_PRIVATE_KEY),
    hasVapidSubject: Boolean(env.VAPID_SUBJECT)
  };
}
