import {
  empty,
  isSubscriptionStoreConfigured,
  json,
  parseClientErrorPayload,
  readJson,
  recordClientError
} from "../_shared/backend.js";

// Global client-side error reports (window.onerror/unhandledrejection).
// Soft-fails like analytics/events.js: error reporting must never itself
// surface an error to the user.
export async function onRequestPost({ request, env }) {
  if (!isSubscriptionStoreConfigured(env)) {
    return json({ ok: false }, { status: 202 });
  }

  const body = await readJson(request);

  if (!body.ok) {
    return json({ error: body.error }, { status: body.status });
  }

  const parsed = parseClientErrorPayload(body.value);

  if (!parsed.ok) {
    return json({ error: parsed.error }, { status: 400 });
  }

  try {
    await recordClientError(parsed.value, env);
    return empty();
  } catch (error) {
    console.error("Client error logging failed.", error);
    return json({ ok: false }, { status: 202 });
  }
}
