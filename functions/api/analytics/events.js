import {
  empty,
  isSubscriptionStoreConfigured,
  json,
  parseAnalyticsEventPayload,
  readJson,
  recordAnalyticsEvent
} from "../../_shared/backend.js";

// Backs src/services/analytics.js's trackEvent(). Soft-fails like
// pilot-events.js: analytics must never break the app experience.
export async function onRequestPost({ request, env }) {
  if (!isSubscriptionStoreConfigured(env)) {
    return json({ ok: false }, { status: 202 });
  }

  const body = await readJson(request);

  if (!body.ok) {
    return json({ error: body.error }, { status: body.status });
  }

  const parsed = parseAnalyticsEventPayload(body.value);

  if (!parsed.ok) {
    return json({ error: parsed.error }, { status: 400 });
  }

  try {
    await recordAnalyticsEvent(parsed.value, env);
    return empty();
  } catch (error) {
    console.error("Analytics event logging failed.", error);
    return json({ ok: false }, { status: 202 });
  }
}
