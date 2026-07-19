import {
  isReferralStoreConfigured,
  json,
  parseReferralVisitPayload,
  readJson,
  recordReferralVisit
} from "../../_shared/backend.js";

// Logs one visit to a referral link (fired once per landing with ?ref=...).
// Soft-fails like /api/pilot-events and /api/analytics/events: referral
// tracking must never break the app.
export async function onRequestPost({ request, env }) {
  if (!isReferralStoreConfigured(env)) {
    return json({ ok: false }, { status: 202 });
  }

  const body = await readJson(request);

  if (!body.ok) {
    return json({ error: body.error }, { status: body.status });
  }

  const parsed = parseReferralVisitPayload(body.value);

  if (!parsed.ok) {
    return json({ error: parsed.error }, { status: 400 });
  }

  try {
    const id = await recordReferralVisit(parsed.value, env);
    return json({ id }, { status: 201 });
  } catch (error) {
    console.error("Referral visit logging failed.", error);
    return json({ ok: false }, { status: 202 });
  }
}
