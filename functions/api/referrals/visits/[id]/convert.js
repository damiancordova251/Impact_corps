import {
  empty,
  isReferralStoreConfigured,
  json,
  markReferralVisitConverted,
  parseReferralConversionPayload,
  readJson
} from "../../../../_shared/backend.js";

// Marks a previously-logged visit as having resulted in a completed
// installation (called once, when this device finishes onboarding).
export async function onRequestPost({ request, env, params }) {
  if (!isReferralStoreConfigured(env)) {
    return json({ ok: false }, { status: 202 });
  }

  const body = await readJson(request);

  if (!body.ok) {
    return json({ error: body.error }, { status: body.status });
  }

  const parsed = parseReferralConversionPayload(body.value, params.id);

  if (!parsed.ok) {
    return json({ error: parsed.error }, { status: 400 });
  }

  try {
    await markReferralVisitConverted(parsed.value, env);
    return empty();
  } catch (error) {
    console.error("Referral conversion failed.", error);
    return json({ ok: false }, { status: 202 });
  }
}
