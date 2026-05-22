import {
  getAllSubscriptions,
  isPushConfigured,
  json,
  parseSubscriptionPayload,
  readJson,
  subscriptionStoreErrorResponse,
  toPublicSubscription,
  upsertSubscription
} from "../../_shared/backend.js";

// Saves or updates the current browser subscription for scheduled reminders.
export async function onRequestPost({ request, env }) {
  if (!isPushConfigured(env)) {
    return json({
      error: "VAPID keys are not configured on the reminder server."
    }, { status: 503 });
  }

  const body = await readJson(request);

  if (!body.ok) {
    return json({ error: body.error }, { status: body.status });
  }

  const parsed = parseSubscriptionPayload(body.value);

  if (!parsed.ok) {
    return json({ error: parsed.error }, { status: 400 });
  }

  try {
    const record = await upsertSubscription(parsed.value, env);

    return json({
      subscription: toPublicSubscription(record)
    }, { status: 201 });
  } catch (error) {
    return subscriptionStoreErrorResponse(error);
  }
}

// Lists safe public summaries for manual pilot debugging.
export async function onRequestGet({ env }) {
  try {
    const subscriptions = await getAllSubscriptions(env);

    return json({
      count: subscriptions.length,
      subscriptions: subscriptions.map(toPublicSubscription)
    });
  } catch (error) {
    return subscriptionStoreErrorResponse(error);
  }
}
