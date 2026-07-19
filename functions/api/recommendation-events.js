import {
  empty,
  isSubscriptionStoreConfigured,
  json,
  parseRecommendationEventPayload,
  readJson,
  recordRecommendationEvent
} from "../_shared/backend.js";

// The rich, typed counterpart to the flat "recommendation_generated"
// analytics event. Soft-fails like the other analytics endpoints.
export async function onRequestPost({ request, env }) {
  if (!isSubscriptionStoreConfigured(env)) {
    return json({ ok: false }, { status: 202 });
  }

  const body = await readJson(request);

  if (!body.ok) {
    return json({ error: body.error }, { status: body.status });
  }

  const parsed = parseRecommendationEventPayload(body.value);

  if (!parsed.ok) {
    return json({ error: parsed.error }, { status: 400 });
  }

  try {
    await recordRecommendationEvent(parsed.value, env);
    return empty();
  } catch (error) {
    console.error("Recommendation event logging failed.", error);
    return json({ ok: false }, { status: 202 });
  }
}
