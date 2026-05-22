import { buildPushPayload } from "@block65/webcrypto-web-push";
import { createChecklistReminder } from "../../src/reminders.js";

const DEFAULT_PUSH_SUBSCRIPTIONS_TABLE = "push_subscriptions";
const DEFAULT_PILOT_EVENTS_TABLE = "pilot_events";
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
// REST calls that run in Cloudflare's Worker runtime.
export async function upsertSubscription(input, env) {
  const subscription = input.subscription;
  const id = await createSubscriptionId(subscription.endpoint);
  const existing = await getSubscription(id, env);
  const now = new Date().toISOString();
  const row = {
    id,
    subscription,
    routine_start_minutes: input.routineStartMinutes,
    timezone: input.timezone,
    last_sent_date: existing?.lastSentDate ?? null,
    updated_at: now
  };

  const response = await supabaseFetch(env, {
    path: pushSubscriptionsTablePath(env),
    searchParams: new URLSearchParams({
      on_conflict: "id",
      select: "id,subscription,routine_start_minutes,timezone,last_sent_date,created_at,updated_at"
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
      select: "id,subscription,routine_start_minutes,timezone,last_sent_date,created_at,updated_at",
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
      select: "id,subscription,routine_start_minutes,timezone,last_sent_date,created_at,updated_at",
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
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSentDate: record.lastSentDate
  };
}

// Pilot event writes remain anonymous and intentionally small. Failures are
// handled softly by the route so analytics never break the app.
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

// Web Push uses the same Worker-compatible Web Crypto library as the Cron
// Worker, avoiding the Node-only web-push package in Cloudflare.
export async function sendReadyChecklistPush(record, env) {
  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY
  };
  const message = {
    data: createChecklistReminder({ url: "/" }),
    options: {
      ttl: 60 * 60,
      topic: "ready-checklist"
    }
  };
  const requestInit = await buildPushPayload(message, record.subscription, vapid);
  const response = await fetch(record.subscription.endpoint, requestInit);

  if (response.ok) {
    return;
  }

  throw new PushSendError(response.status, await response.text().catch(() => ""));
}

export function isSubscriptionGone(error) {
  return error?.statusCode === 404 || error?.statusCode === 410;
}

// Validation mirrors the existing Express routes before anything reaches
// Supabase or browser push services.
export function parseSubscriptionPayload(body) {
  const subscription = body?.subscription;
  const routineStartMinutes = Number(body?.routineStartMinutes);
  const timezone = body?.timezone;

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

  return {
    ok: true,
    value: {
      subscription,
      routineStartMinutes,
      timezone
    }
  };
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

function pushSubscriptionsTablePath(env) {
  return encodeURIComponent(env.SUPABASE_PUSH_SUBSCRIPTIONS_TABLE || DEFAULT_PUSH_SUBSCRIPTIONS_TABLE);
}

function pilotEventsTablePath(env) {
  return encodeURIComponent(env.SUPABASE_PILOT_EVENTS_TABLE || DEFAULT_PILOT_EVENTS_TABLE);
}

function toSubscriptionRecord(row) {
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

class PushSendError extends Error {
  constructor(statusCode, responseBody) {
    super(`Push service request failed with ${statusCode}. ${responseBody}`);
    this.name = "PushSendError";
    this.statusCode = statusCode;
  }
}
