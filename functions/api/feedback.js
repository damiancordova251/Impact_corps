import {
  empty,
  isSubscriptionStoreConfigured,
  json,
  parseFeedbackPayload,
  readJson,
  recordFeedbackSubmission
} from "../_shared/backend.js";

// Backs the 3-day feedback prompt's submit action.
export async function onRequestPost({ request, env }) {
  if (!isSubscriptionStoreConfigured(env)) {
    return json({ error: "Feedback storage is not configured." }, { status: 503 });
  }

  const body = await readJson(request);

  if (!body.ok) {
    return json({ error: body.error }, { status: body.status });
  }

  const parsed = parseFeedbackPayload(body.value);

  if (!parsed.ok) {
    return json({ error: parsed.error }, { status: 400 });
  }

  try {
    await recordFeedbackSubmission(parsed.value, env);
    return empty();
  } catch (error) {
    console.error("Feedback submission failed.", error);
    return json({ error: "Feedback could not be saved right now." }, { status: 503 });
  }
}
