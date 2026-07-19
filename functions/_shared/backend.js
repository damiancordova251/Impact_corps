const DEFAULT_PUSH_SUBSCRIPTIONS_TABLE = "push_subscriptions";
const DEFAULT_PILOT_EVENTS_TABLE = "pilot_events";
const DEFAULT_APP_INSTALLATIONS_TABLE = "app_installations";
const DEFAULT_ANALYTICS_EVENTS_TABLE = "analytics_events";
const DEFAULT_FEEDBACK_SUBMISSIONS_TABLE = "feedback_submissions";
const MAX_JSON_BODY_LENGTH = 128 * 1024;
const PILOT_EVENT_TYPES = new Set([
  "app_opened",
  "checklist_generated",
  "checklist_completed",
  "reminders_enabled",
  "notification_clicked",
  "weather_screen_viewed",
  "location_updated"
]);
const SUBSCRIPTION_SELECT_COLUMNS = "id,subscription,routine_start_minutes,timezone,coarse_latitude,coarse_longitude,preferred_language,last_sent_date,created_at,updated_at";

// Kept in sync with src/services/analytics.js and server/analyticsService.js's
// own allowlists.
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

// Shared API response helpers keep all Pages Functions returning JSON with the
// same no-store behavior as small backend endpoints.
export function json(data, { status = 200 } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export function empty({ status = 204 } = {}) {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export async function readJson(request) {
  const text = await request.text();

  if (!text) {
    return {
      ok: true,
      value: {}
    };
  }

  if (text.length > MAX_JSON_BODY_LENGTH) {
    return {
      ok: false,
      status: 413,
      error: "Request body is too large."
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(text)
    };
  } catch (error) {
    return {
      ok: false,
      status: 400,
      error: "Request body must be valid JSON."
    };
  }
}

// Pages Functions receive secrets through context.env, keeping service-role and
// VAPID private keys out of frontend JavaScript.
export function isPushConfigured(env) {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

export function isSubscriptionStoreConfigured(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

export function isPilotEventStoreConfigured(env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

// Subscription storage mirrors the Express API contract while using Supabase
// REST calls that run in Cloudflare's Worker runtime. Schedule changes reset
// duplicate-reminder state so the updated time can send later the same day.
export async function upsertSubscription(input, env) {
  const subscription = input.subscription;
  const id = await createSubscriptionId(subscription.endpoint);
  const existing = await getSubscription(id, env);
  const now = new Date().toISOString();
  const scheduleChanged = hasScheduleChanged(existing, input);
  const row = {
    id,
    subscription,
    routine_start_minutes: input.routineStartMinutes,
    timezone: input.timezone,
    coarse_latitude: input.coarseLatitude ?? null,
    coarse_longitude: input.coarseLongitude ?? null,
    preferred_language: input.preferredLanguage ?? null,
    last_sent_date: scheduleChanged ? null : (existing?.lastSentDate ?? null),
    updated_at: now
  };

  const response = await supabaseFetch(env, {
    path: pushSubscriptionsTablePath(env),
    searchParams: new URLSearchParams({
      on_conflict: "id",
      select: SUBSCRIPTION_SELECT_COLUMNS
    }),
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation"
      },
      body: JSON.stringify(row)
    }
  });
  const rows = await response.json();
  const saved = Array.isArray(rows) ? rows[0] : rows;

  if (!saved) {
    throw new Error("Subscription storage did not return a saved row.");
  }

  return toSubscriptionRecord(saved);
}

export async function getSubscription(id, env) {
  const response = await supabaseFetch(env, {
    path: pushSubscriptionsTablePath(env),
    searchParams: new URLSearchParams({
      select: SUBSCRIPTION_SELECT_COLUMNS,
      id: `eq.${id}`,
      limit: "1"
    })
  });
  const rows = await response.json();

  return rows[0] ? toSubscriptionRecord(rows[0]) : null;
}

export async function getAllSubscriptions(env) {
  const response = await supabaseFetch(env, {
    path: pushSubscriptionsTablePath(env),
    searchParams: new URLSearchParams({
      select: SUBSCRIPTION_SELECT_COLUMNS,
      order: "created_at.asc"
    })
  });
  const rows = await response.json();

  return rows.map(toSubscriptionRecord);
}

export async function removeSubscription(id, env) {
  await supabaseFetch(env, {
    path: pushSubscriptionsTablePath(env),
    searchParams: new URLSearchParams({
      id: `eq.${id}`
    }),
    init: {
      method: "DELETE"
    }
  });
}

export function toPublicSubscription(record) {
  return {
    id: record.id,
    routineStartMinutes: record.routineStartMinutes,
    timezone: record.timezone,
    hasLocation: false,
    hasCoarseLocation: record.coarseLatitude !== null && record.coarseLongitude !== null,
    preferredLanguage: record.preferredLanguage,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSentDate: record.lastSentDate
  };
}

// Records one analytics event and keeps app_installations.last_active_at
// (and preferred_language, if provided) current via upsert. Mirrors
// server/analyticsService.js's recordAnalyticsEvent for the Cloudflare
// Pages Functions runtime.
export async function recordAnalyticsEvent({ installationId, eventName, category, language, metadata, occurredAt }, env) {
  await supabaseFetch(env, {
    path: appInstallationsTablePath(env),
    searchParams: new URLSearchParams({ on_conflict: "id" }),
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({
        id: installationId,
        last_active_at: new Date().toISOString(),
        ...(language ? { preferred_language: language } : {})
      })
    }
  });

  await supabaseFetch(env, {
    path: analyticsEventsTablePath(env),
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        installation_id: installationId,
        event_name: eventName,
        category: category ?? null,
        language: language ?? null,
        metadata: metadata ?? {},
        occurred_at: occurredAt ?? new Date().toISOString()
      })
    }
  });
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
}, env) {
  await supabaseFetch(env, {
    path: feedbackSubmissionsTablePath(env),
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        installation_id: installationId,
        rating: rating ?? null,
        comment: comment ?? null,
        clothing_suggestions: clothingSuggestions ?? null,
        category: category ?? null,
        app_version: appVersion ?? null,
        language: language ?? null,
        from_scheduled_prompt: Boolean(fromScheduledPrompt),
        allow_follow_up: Boolean(allowFollowUp)
      })
    }
  });
}

// Pilot event writes remain anonymous and intentionally small.
// Failures are handled softly by the route so analytics never break the app.
export async function insertPilotEvent({ anonymousDeviceId, eventType, metadata }, env) {
  await supabaseFetch(env, {
    path: pilotEventsTablePath(env),
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        anonymous_device_id: anonymousDeviceId,
        event_type: eventType,
        metadata
      })
    }
  });
}

// Validation mirrors the existing Express routes before anything reaches
// Supabase or browser push services.
export function parseSubscriptionPayload(body) {
  const subscription = body?.subscription;
  const routineStartMinutes = Number(body?.routineStartMinutes);
  const timezone = body?.timezone;
  const coarseLocation = parseOptionalCoarseLocation(body?.coarseLatitude, body?.coarseLongitude);

  if (!isValidPushSubscription(subscription)) {
    return {
      ok: false,
      error: "A valid push subscription is required."
    };
  }

  if (!isValidRoutineStartMinutes(routineStartMinutes)) {
    return {
      ok: false,
      error: "A valid 30-minute routine start time is required."
    };
  }

  if (!isValidTimezone(timezone)) {
    return {
      ok: false,
      error: "A valid IANA timezone is required."
    };
  }

  if (coarseLocation === undefined) {
    return {
      ok: false,
      error: "coarseLatitude and coarseLongitude must both be finite numbers, or both omitted."
    };
  }

  return {
    ok: true,
    value: {
      subscription,
      routineStartMinutes,
      timezone,
      coarseLatitude: coarseLocation?.coarseLatitude ?? null,
      coarseLongitude: coarseLocation?.coarseLongitude ?? null,
      preferredLanguage: isValidLanguage(body?.preferredLanguage) ? body.preferredLanguage : null
    }
  };
}

function parseOptionalCoarseLocation(rawLatitude, rawLongitude) {
  if (rawLatitude === undefined && rawLongitude === undefined) {
    return null;
  }

  const coarseLatitude = Number(rawLatitude);
  const coarseLongitude = Number(rawLongitude);

  if (
    !Number.isFinite(coarseLatitude) || coarseLatitude < -90 || coarseLatitude > 90
    || !Number.isFinite(coarseLongitude) || coarseLongitude < -180 || coarseLongitude > 180
  ) {
    return undefined;
  }

  return { coarseLatitude, coarseLongitude };
}

function isValidLanguage(value) {
  return typeof value === "string" && /^[a-z]{2}$/.test(value);
}

export function parseAnalyticsEventPayload(body) {
  const installationId = body?.installationId;
  const eventName = body?.eventName;

  if (!isValidAnonymousDeviceId(installationId)) {
    return {
      ok: false,
      error: "A valid installation id is required."
    };
  }

  if (typeof eventName !== "string" || !ALLOWED_EVENT_NAMES.has(eventName)) {
    return {
      ok: false,
      error: "A valid event name is required."
    };
  }

  return {
    ok: true,
    value: {
      installationId,
      eventName,
      category: typeof body?.category === "string" ? body.category.slice(0, 40) : null,
      language: isValidLanguage(body?.language) ? body.language : null,
      metadata: sanitizeAnalyticsMetadata(body?.metadata),
      occurredAt: isValidIsoDate(body?.occurredAt) ? body.occurredAt : new Date().toISOString()
    }
  };
}

export function parseFeedbackPayload(body) {
  const installationId = body?.installationId;

  if (!isValidAnonymousDeviceId(installationId)) {
    return {
      ok: false,
      error: "A valid installation id is required."
    };
  }

  const rating = Number.isInteger(body?.rating) && body.rating >= 1 && body.rating <= 5
    ? body.rating
    : null;
  const comment = typeof body?.comment === "string" ? body.comment.slice(0, 2000) : null;
  const clothingSuggestions = typeof body?.clothingSuggestions === "string"
    ? body.clothingSuggestions.slice(0, 500)
    : null;

  return {
    ok: true,
    value: {
      installationId,
      rating,
      comment,
      clothingSuggestions,
      category: typeof body?.category === "string" ? body.category.slice(0, 40) : null,
      appVersion: typeof body?.appVersion === "string" ? body.appVersion.slice(0, 20) : null,
      language: isValidLanguage(body?.language) ? body.language : null,
      fromScheduledPrompt: Boolean(body?.fromScheduledPrompt),
      allowFollowUp: Boolean(body?.allowFollowUp)
    }
  };
}

function isValidIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function sanitizeAnalyticsMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const clean = {};

  Object.entries(metadata).forEach(([key, value]) => {
    if (typeof key !== "string" || key.length > 60) {
      return;
    }

    if (typeof value === "string") {
      clean[key] = value.slice(0, 200);
      return;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      clean[key] = value;
      return;
    }

    if (typeof value === "boolean") {
      clean[key] = value;
    }
  });

  return clean;
}

export function parsePilotEventPayload(body) {
  const anonymousDeviceId = body?.anonymousDeviceId;
  const eventType = body?.eventType;

  if (!isValidAnonymousDeviceId(anonymousDeviceId)) {
    return {
      ok: false,
      error: "A valid anonymous device id is required."
    };
  }

  if (!PILOT_EVENT_TYPES.has(eventType)) {
    return {
      ok: false,
      error: "A valid pilot event type is required."
    };
  }

  return {
    ok: true,
    value: {
      anonymousDeviceId,
      eventType,
      metadata: sanitizePilotEventMetadata(body?.metadata)
    }
  };
}

export function subscriptionStoreErrorResponse(error) {
  console.error("Subscription storage request failed.", error);

  return json({
    error: "Subscription storage is unavailable. Check Supabase configuration and table setup."
  }, { status: 503 });
}

async function supabaseFetch(env, { path, searchParams = new URLSearchParams(), init = {} }) {
  if (!isSubscriptionStoreConfigured(env)) {
    throw new Error("Supabase storage is not configured.");
  }

  const url = new URL(`/rest/v1/${path}`, env.SUPABASE_URL);

  searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...init.headers
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed with ${response.status}: ${await response.text()}`);
  }

  return response;
}

async function createSubscriptionId(endpoint) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(endpoint)
  );

  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 20);
}

function hasScheduleChanged(existing, input) {
  return Boolean(existing)
    && (
      existing.routineStartMinutes !== input.routineStartMinutes
      || existing.timezone !== input.timezone
    );
}

function pushSubscriptionsTablePath(env) {
  return encodeURIComponent(env.SUPABASE_PUSH_SUBSCRIPTIONS_TABLE || DEFAULT_PUSH_SUBSCRIPTIONS_TABLE);
}

function pilotEventsTablePath(env) {
  return encodeURIComponent(env.SUPABASE_PILOT_EVENTS_TABLE || DEFAULT_PILOT_EVENTS_TABLE);
}

function appInstallationsTablePath(env) {
  return encodeURIComponent(env.SUPABASE_APP_INSTALLATIONS_TABLE || DEFAULT_APP_INSTALLATIONS_TABLE);
}

function analyticsEventsTablePath(env) {
  return encodeURIComponent(env.SUPABASE_ANALYTICS_EVENTS_TABLE || DEFAULT_ANALYTICS_EVENTS_TABLE);
}

function feedbackSubmissionsTablePath(env) {
  return encodeURIComponent(env.SUPABASE_FEEDBACK_SUBMISSIONS_TABLE || DEFAULT_FEEDBACK_SUBMISSIONS_TABLE);
}

function toSubscriptionRecord(row) {
  return {
    id: row.id,
    subscription: row.subscription,
    routineStartMinutes: row.routine_start_minutes,
    timezone: row.timezone,
    coarseLatitude: row.coarse_latitude ?? null,
    coarseLongitude: row.coarse_longitude ?? null,
    preferredLanguage: row.preferred_language ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSentDate: row.last_sent_date
  };
}

function isValidPushSubscription(subscription) {
  return typeof subscription?.endpoint === "string"
    && subscription.endpoint.length > 0
    && typeof subscription.keys?.p256dh === "string"
    && typeof subscription.keys?.auth === "string";
}

function isValidRoutineStartMinutes(value) {
  return Number.isInteger(value)
    && value >= 0
    && value < 24 * 60
    && value % 30 === 0;
}

function isValidTimezone(timezone) {
  if (typeof timezone !== "string" || timezone.trim().length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch (error) {
    return false;
  }
}

function isValidAnonymousDeviceId(value) {
  return typeof value === "string"
    && value.length >= 8
    && value.length <= 80
    && /^[a-zA-Z0-9_-]+$/.test(value);
}

function sanitizePilotEventMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const clean = {};

  if (typeof metadata.source === "string") {
    clean.source = metadata.source.slice(0, 40);
  }

  if (Number.isInteger(metadata.itemCount)) {
    clean.itemCount = Math.max(0, Math.min(metadata.itemCount, 20));
  }

  if (Number.isInteger(metadata.expected_time_away_hours)) {
    clean.expected_time_away_hours = Math.max(3, Math.min(metadata.expected_time_away_hours, 15));
  }

  if (typeof metadata.hasItems === "boolean") {
    clean.hasItems = metadata.hasItems;
  }

  if (typeof metadata.standalone === "boolean") {
    clean.standalone = metadata.standalone;
  }

  if (typeof metadata.permission === "string") {
    clean.permission = metadata.permission.slice(0, 20);
  }

  return clean;
}
