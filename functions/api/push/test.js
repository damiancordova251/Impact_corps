import {
  getAllSubscriptions,
  getSubscription,
  isPushConfigured,
  json,
  readJson,
  sendReadyChecklistPush,
  subscriptionStoreErrorResponse
} from "../../_shared/backend.js";

// Sends an immediate backend push to one subscription or all subscriptions.
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

  let targets;

  try {
    const subscriptionId = body.value?.subscriptionId;
    targets = subscriptionId
      ? [await getSubscription(subscriptionId, env)].filter(Boolean)
      : await getAllSubscriptions(env);
  } catch (error) {
    return subscriptionStoreErrorResponse(error);
  }

  if (targets.length === 0) {
    return json({
      error: "No matching push subscription found."
    }, { status: 404 });
  }

  const results = await Promise.allSettled(targets.map((record) => {
    return sendReadyChecklistPush(record, env);
  }));

  return json({
    sent: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length
  });
}
