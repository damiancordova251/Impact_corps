import {
  empty,
  isNotificationEventStoreConfigured,
  isValidUuid,
  json,
  recordNotificationDismissed
} from "../../../../_shared/backend.js";

// Called by the service worker's notificationclose handler. Best-effort and
// idempotent, same as opened.js.
export async function onRequestPost({ params, env }) {
  if (!isNotificationEventStoreConfigured(env)) {
    return json({ ok: false }, { status: 202 });
  }

  if (!isValidUuid(params.id)) {
    return json({ error: "A valid notification event id is required." }, { status: 400 });
  }

  await recordNotificationDismissed(params.id, env);
  return empty();
}
