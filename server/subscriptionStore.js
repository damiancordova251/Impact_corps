import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Supabase-backed subscription storage replaces the old in-memory store so push
// reminders survive server restarts.
const DEFAULT_TABLE_NAME = "push_subscriptions";

let supabaseClient = null;

// The server treats storage as unavailable until both backend-only Supabase
// credentials are present.
export function isSubscriptionStoreConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Creates or updates the row for one browser push endpoint. Re-saving the same
// schedule preserves duplicate-reminder state; changing reminder timing resets it.
export async function upsertSubscription(input) {
  const subscription = input.subscription;
  const id = createSubscriptionId(subscription.endpoint);
  const existing = await getSubscription(id);
  const now = new Date().toISOString();
  const scheduleChanged = hasScheduleChanged(existing, input);

  const row = {
    id,
    subscription,
    routine_start_minutes: input.routineStartMinutes,
    timezone: input.timezone,
    last_sent_date: scheduleChanged ? null : (existing?.lastSentDate ?? null),
    updated_at: now
  };

  const { data, error } = await getClient()
    .from(getTableName())
    .upsert(row, { onConflict: "id" })
    .select()
    .single();

  assertNoStoreError(error);

  return toRecord(data);
}

// Read helpers expose one subscription or the full pilot list to API routes and
// the scheduler.
export async function getSubscription(id) {
  const { data, error } = await getClient()
    .from(getTableName())
    .select()
    .eq("id", id)
    .maybeSingle();

  assertNoStoreError(error);

  return data ? toRecord(data) : null;
}

export async function getAllSubscriptions() {
  const { data, error } = await getClient()
    .from(getTableName())
    .select()
    .order("created_at", { ascending: true });

  assertNoStoreError(error);

  return data.map(toRecord);
}

// Scheduler write helpers update reminder state or remove expired browser
// subscriptions.
export async function markReminderSent(id, localDate) {
  const { error } = await getClient()
    .from(getTableName())
    .update({
      last_sent_date: localDate,
      updated_at: new Date().toISOString()
    })
    .eq("id", id);

  assertNoStoreError(error);
}

export async function removeSubscription(id) {
  const { error } = await getClient()
    .from(getTableName())
    .delete()
    .eq("id", id);

  assertNoStoreError(error);
}

// Public summaries intentionally omit the raw push subscription JSON and any
// exact location data.
export function toPublicSubscription(record) {
  return {
    id: record.id,
    routineStartMinutes: record.routineStartMinutes,
    timezone: record.timezone,
    hasLocation: false,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSentDate: record.lastSentDate
  };
}

// Lazily creates one Supabase client with service-role credentials on the
// backend only; frontend JavaScript never imports this file.
function getClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new SubscriptionStoreError(
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

// Small mapping helpers keep database snake_case rows separate from the
// camelCase records used by server code.
function getTableName() {
  return process.env.SUPABASE_PUSH_SUBSCRIPTIONS_TABLE || DEFAULT_TABLE_NAME;
}

function createSubscriptionId(endpoint) {
  return crypto
    .createHash("sha256")
    .update(endpoint)
    .digest("hex")
    .slice(0, 20);
}

function hasScheduleChanged(existing, input) {
  return Boolean(existing)
    && (
      existing.routineStartMinutes !== input.routineStartMinutes
      || existing.timezone !== input.timezone
    );
}

function toRecord(row) {
  return {
    id: row.id,
    subscription: row.subscription,
    routineStartMinutes: row.routine_start_minutes,
    timezone: row.timezone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSentDate: row.last_sent_date
  };
}

// Converts Supabase SDK errors into a named store error for route-level handling.
function assertNoStoreError(error) {
  if (error) {
    throw new SubscriptionStoreError(error.message);
  }
}

class SubscriptionStoreError extends Error {
  constructor(message) {
    super(message);
    this.name = "SubscriptionStoreError";
  }
}
