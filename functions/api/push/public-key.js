import {
  isPushConfigured,
  json
} from "../../_shared/backend.js";

// The browser needs only the public VAPID key to create a PushSubscription.
export async function onRequestGet({ env }) {
  if (!isPushConfigured(env)) {
    return json({
      error: "VAPID keys are not configured on the reminder server."
    }, { status: 503 });
  }

  return json({
    publicKey: env.VAPID_PUBLIC_KEY
  });
}
