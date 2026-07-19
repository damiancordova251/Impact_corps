import { createClient } from "@supabase/supabase-js";

// Backs the referral code / visit / conversion endpoints. Mirrors the same
// lazy-client, backend-only-service-role-key pattern as
// server/subscriptionStore.js and server/analyticsService.js.
const REFERRALS_TABLE_DEFAULT = "referrals";
const REFERRAL_VISITS_TABLE_DEFAULT = "referral_visits";
const APP_INSTALLATIONS_TABLE_DEFAULT = "app_installations";
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L — avoids visual ambiguity when shared as text
const CODE_LENGTH = 7;
const MAX_CODE_GENERATION_ATTEMPTS = 5;

let supabaseClient = null;

export function isReferralStoreConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Returns the installation's existing referral code, or generates and stores
// a new one. Codes are public/shareable by design (embedded in a share link),
// not secrets, so a short random alphabet is enough — collisions are handled
// by retrying on the table's unique-constraint violation.
export async function getOrCreateReferralCode(installationId) {
  const client = getClient();

  await upsertInstallation(client, installationId);

  const { data: existing, error: selectError } = await client
    .from(getTableName(REFERRALS_TABLE_DEFAULT, "SUPABASE_REFERRALS_TABLE"))
    .select("code")
    .eq("owner_installation_id", installationId)
    .maybeSingle();

  if (selectError) {
    throw new ReferralStoreError(selectError.message);
  }

  if (existing) {
    return existing.code;
  }

  for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const code = generateReferralCode();
    const { error: insertError } = await client
      .from(getTableName(REFERRALS_TABLE_DEFAULT, "SUPABASE_REFERRALS_TABLE"))
      .insert({ code, owner_installation_id: installationId });

    if (!insertError) {
      return code;
    }

    if (insertError.code !== "23505") {
      throw new ReferralStoreError(insertError.message);
    }
  }

  throw new ReferralStoreError("Could not generate a unique referral code.");
}

// Logs one visit to a referral link. The visiting installation id is already
// known at this point (the anonymous id is created at app boot, before this
// ever runs), so it's recorded immediately; resulted_in_install starts false
// and is flipped by markReferralVisitConverted() once/if that visitor
// actually completes onboarding.
export async function recordReferralVisit({ referralCode, visitorInstallationId, shareChannel }) {
  const client = getClient();

  if (visitorInstallationId) {
    await upsertInstallation(client, visitorInstallationId);
  }

  const { data, error } = await client
    .from(getTableName(REFERRAL_VISITS_TABLE_DEFAULT, "SUPABASE_REFERRAL_VISITS_TABLE"))
    .insert({
      referral_code: referralCode,
      share_channel: shareChannel ?? null,
      new_installation_id: visitorInstallationId ?? null,
      resulted_in_install: false
    })
    .select("id")
    .single();

  if (error) {
    throw new ReferralStoreError(error.message);
  }

  return data.id;
}

// Only flips a visit belonging to the same installation that's confirming
// the conversion (matched via new_installation_id) — a lightweight integrity
// check, not real auth, appropriate for a pilot-scale anonymous system.
export async function markReferralVisitConverted({ visitId, installationId, referralCode }) {
  const client = getClient();

  const { error: visitError } = await client
    .from(getTableName(REFERRAL_VISITS_TABLE_DEFAULT, "SUPABASE_REFERRAL_VISITS_TABLE"))
    .update({ resulted_in_install: true })
    .eq("id", visitId)
    .eq("new_installation_id", installationId);

  if (visitError) {
    throw new ReferralStoreError(visitError.message);
  }

  const { error: installationError } = await client
    .from(getTableName(APP_INSTALLATIONS_TABLE_DEFAULT, "SUPABASE_APP_INSTALLATIONS_TABLE"))
    .update({ referral_code: referralCode })
    .eq("id", installationId);

  if (installationError) {
    throw new ReferralStoreError(installationError.message);
  }
}

async function upsertInstallation(client, installationId) {
  const { error } = await client
    .from(getTableName(APP_INSTALLATIONS_TABLE_DEFAULT, "SUPABASE_APP_INSTALLATIONS_TABLE"))
    .upsert({ id: installationId, last_active_at: new Date().toISOString() }, { onConflict: "id" });

  if (error) {
    throw new ReferralStoreError(error.message);
  }
}

function generateReferralCode() {
  let code = "";

  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }

  return code;
}

function getClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new ReferralStoreError(
      "Supabase storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  supabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return supabaseClient;
}

function getTableName(defaultName, envVar) {
  return process.env[envVar] || defaultName;
}

class ReferralStoreError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReferralStoreError";
  }
}
