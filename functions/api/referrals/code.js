import {
  getOrCreateReferralCode,
  isReferralStoreConfigured,
  isValidAnonymousDeviceId,
  json,
  readJson
} from "../../_shared/backend.js";

// Returns (creating on first call) the installation's own referral code.
export async function onRequestPost({ request, env }) {
  if (!isReferralStoreConfigured(env)) {
    return json({ error: "Referral storage is not configured." }, { status: 503 });
  }

  const body = await readJson(request);

  if (!body.ok) {
    return json({ error: body.error }, { status: body.status });
  }

  const installationId = body.value?.installationId;

  if (!isValidAnonymousDeviceId(installationId)) {
    return json({ error: "A valid installation id is required." }, { status: 400 });
  }

  try {
    const code = await getOrCreateReferralCode(installationId, env);
    return json({ code });
  } catch (error) {
    console.error("Referral code lookup failed.", error);
    return json({ error: "Referral code is not available right now." }, { status: 503 });
  }
}
