import {
  empty,
  isSubscriptionStoreConfigured,
  json,
  parsePerformanceEventPayload,
  readJson,
  recordApiPerformanceEvent
} from "../_shared/backend.js";

// Lightweight API-latency samples. Soft-fails for the same reason as
// client-errors.js above.
export async function onRequestPost({ request, env }) {
  if (!isSubscriptionStoreConfigured(env)) {
    return json({ ok: false }, { status: 202 });
  }

  const body = await readJson(request);

  if (!body.ok) {
    return json({ error: body.error }, { status: body.status });
  }

  const parsed = parsePerformanceEventPayload(body.value);

  if (!parsed.ok) {
    return json({ error: parsed.error }, { status: 400 });
  }

  try {
    await recordApiPerformanceEvent(parsed.value, env);
    return empty();
  } catch (error) {
    console.error("Performance event logging failed.", error);
    return json({ ok: false }, { status: 202 });
  }
}
