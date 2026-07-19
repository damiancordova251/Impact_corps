import {
  empty,
  isNotificationEventStoreConfigured,
  isValidUuid,
  json,
  recordNotificationOpened
} from "../../../../_shared/backend.js";

// Called by the service worker's notificationclick handler. Best-effort and
// idempotent: always responds 204 for a well-formed id, whether or not a
// matching row exists, so this never becomes a way to probe row existence.
export async function onRequestPost({ params, env }) {
  if (!isNotificationEventStoreConfigured(env)) {
    return json({ ok: false }, { status: 202 });
  }

  if (!isValidUuid(params.id)) {
    return json({ error: "A valid notification event id is required." }, { status: 400 });
  }

  await recordNotificationOpened(params.id, env);
  return empty();
}
