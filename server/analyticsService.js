import { createClient } from "@supabase/supabase-js";

// Backs POST /api/analytics/events and POST /api/feedback. Mirrors the same
// lazy-client, backend-only-service-role-key pattern as
// server/pilotEventStore.js and server/subscriptionStore.js — the browser
// never talks to Supabase directly.
const ANALYTICS_EVENTS_TABLE_DEFAULT = "analytics_events";
const APP_INSTALLATIONS_TABLE_DEFAULT = "app_installations";
const FEEDBACK_SUBMISSIONS_TABLE_DEFAULT = "feedback_submissions";
const CLIENT_ERRORS_TABLE_DEFAULT = "client_errors";
const API_PERFORMANCE_EVENTS_TABLE_DEFAULT = "api_performance_events";
const RECOMMENDATION_EVENTS_TABLE_DEFAULT = "recommendation_events";

// Kept in sync with src/services/analytics.js's own allowlist on the client;
// this is the actual source of truth since the client's copy is only a
// fail-fast convenience.
export const ALLOWED_EVENT_NAMES = new Set([
  "app_installation_seen",
  "session_started",
  "session_ended",
  "language_changed",
  "share_opened",
  "share_completed",
  "install_instructions_viewed",
  "notification_scheduled",
  "notification_opened",
  "notification_dismissed",
  "notification_opt_in",
  "notification_opt_out",
  "recommendation_generated",
  "recommendation_feedback",
  "checklist_completed",
  "referral_link_visited",
  "feedback_prompt_shown",
  "feedback_prompt_postponed",
  "feedback_prompt_dismissed",
  "feedback_submitted",
  "client_error",
  "api_performance"
]);

let supabaseClient = null;

export function isAnalyticsStoreConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Records one analytics event and keeps app_installations.last_active_at (and
// preferred_language, if provided) current via upsert — a dimension-table
// touch alongside every event, not a separate write path the client has to
// manage itself.
export async function recordAnalyticsEvent({ installationId, eventName, category, language, metadata, occurredAt }) {
  const client = getClient();

  const { error: upsertError } = await client
    .from(getTableName(APP_INSTALLATIONS_TABLE_DEFAULT, "SUPABASE_APP_INSTALLATIONS_TABLE"))
    .upsert({
      id: installationId,
      last_active_at: new Date().toISOString(),
      ...(language ? { preferred_language: language } : {})
    }, { onConflict: "id" });

  if (upsertError) {
    throw new AnalyticsStoreError(upsertError.message);
  }

  const { error } = await client
    .from(getTableName(ANALYTICS_EVENTS_TABLE_DEFAULT, "SUPABASE_ANALYTICS_EVENTS_TABLE"))
    .insert({
      installation_id: installationId,
      event_name: eventName,
      category: category ?? null,
      language: language ?? null,
      metadata: metadata ?? {},
      occurred_at: occurredAt ?? new Date().toISOString()
    });

  if (error) {
    throw new AnalyticsStoreError(error.message);
  }
}

export async function recordFeedbackSubmission({
  installationId,
  rating,
  comment,
  clothingSuggestions,
  category,
  appVersion,
  language,
  fromScheduledPrompt,
  allowFollowUp
}) {
  const { error } = await getClient()
    .from(getTableName(FEEDBACK_SUBMISSIONS_TABLE_DEFAULT, "SUPABASE_FEEDBACK_SUBMISSIONS_TABLE"))
    .insert({
      installation_id: installationId,
      rating: rating ?? null,
      comment: comment ?? null,
      clothing_suggestions: clothingSuggestions ?? null,
      category: category ?? null,
      app_version: appVersion ?? null,
      language: language ?? null,
      from_scheduled_prompt: Boolean(fromScheduledPrompt),
      allow_follow_up: Boolean(allowFollowUp)
    });

  if (error) {
    throw new AnalyticsStoreError(error.message);
  }
}

// Structured client-side error records, separate from the general
// analytics_events stream so they get typed columns (stack excerpt, platform)
// instead of a metadata blob. installationId is optional — an error can be
// worth recording even before an installation row is guaranteed to exist.
export async function recordClientError({ installationId, errorType, message, stackExcerpt, appVersion, platform, occurredAt }) {
  const { error } = await getClient()
    .from(getTableName(CLIENT_ERRORS_TABLE_DEFAULT, "SUPABASE_CLIENT_ERRORS_TABLE"))
    .insert({
      installation_id: installationId ?? null,
      error_type: errorType,
      message: message ?? null,
      stack_excerpt: stackExcerpt ?? null,
      app_version: appVersion ?? null,
      platform: platform ?? null,
      occurred_at: occurredAt ?? new Date().toISOString()
    });

  if (error) {
    throw new AnalyticsStoreError(error.message);
  }
}

export async function recordApiPerformanceEvent({ installationId, endpoint, durationMs, statusCode, occurredAt }) {
  const { error } = await getClient()
    .from(getTableName(API_PERFORMANCE_EVENTS_TABLE_DEFAULT, "SUPABASE_API_PERFORMANCE_EVENTS_TABLE"))
    .insert({
      installation_id: installationId ?? null,
      endpoint,
      duration_ms: durationMs ?? null,
      status_code: statusCode ?? null,
      occurred_at: occurredAt ?? new Date().toISOString()
    });

  if (error) {
    throw new AnalyticsStoreError(error.message);
  }
}

// The rich counterpart to the flat "recommendation_generated" analytics_events
// row: typed weather-conditions/items/generation-timing columns, so
// recommendation usefulness can eventually be measured. Upserts
// app_installations first since recommendation_events.installation_id has a
// not-null FK to it (mirrors recordAnalyticsEvent's own upsert-then-insert).
export async function recordRecommendationEvent({ installationId, weatherConditions, expectedTimeAwayHours, items, personalized, generationTimeMs, occurredAt }) {
  const client = getClient();

  const { error: upsertError } = await client
    .from(getTableName(APP_INSTALLATIONS_TABLE_DEFAULT, "SUPABASE_APP_INSTALLATIONS_TABLE"))
    .upsert({ id: installationId, last_active_at: new Date().toISOString() }, { onConflict: "id" });

  if (upsertError) {
    throw new AnalyticsStoreError(upsertError.message);
  }

  const { error } = await client
    .from(getTableName(RECOMMENDATION_EVENTS_TABLE_DEFAULT, "SUPABASE_RECOMMENDATION_EVENTS_TABLE"))
    .insert({
      installation_id: installationId,
      occurred_at: occurredAt ?? new Date().toISOString(),
      expected_time_away_hours: expectedTimeAwayHours ?? null,
      weather_conditions: weatherConditions ?? {},
      items: items ?? [],
      personalized: Boolean(personalized),
      generation_time_ms: generationTimeMs ?? null
    });

  if (error) {
    throw new AnalyticsStoreError(error.message);
  }
}

function getClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new AnalyticsStoreError(
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

class AnalyticsStoreError extends Error {
  constructor(message) {
    super(message);
    this.name = "AnalyticsStoreError";
  }
}
