// Express server entry point: serves the PWA, exposes push/analytics APIs, and
// starts the reminder scheduler when required backend configuration exists.
import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  configureWebPush,
  isSubscriptionGone,
  sendReadyChecklistPush
} from "./pushService.js";
import { startReminderScheduler } from "./scheduler.js";
import {
  getAllSubscriptions,
  getSubscription,
  isSubscriptionStoreConfigured,
  markReminderSent,
  removeSubscription,
  toPublicSubscription,
  upsertSubscription
} from "./subscriptionStore.js";
import {
  insertPilotEvent,
  isPilotEventStoreConfigured
} from "./pilotEventStore.js";
import {
  ALLOWED_EVENT_NAMES,
  isAnalyticsStoreConfigured,
  recordAnalyticsEvent,
  recordFeedbackSubmission
} from "./analyticsService.js";
import {
  isValidRoutineStartMinutes,
  isValidTimezone
} from "./time.js";

// File paths and hosting settings support both local development and Render's
// platform-provided PORT/HOST behavior.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
const schedulerIntervalMs = Number(process.env.SCHEDULER_INTERVAL_MS) || 30000;
const pushConfig = configureWebPush();

// Only these anonymous event names are accepted from the frontend pilot
// analytics endpoint.
const pilotEventTypes = new Set([
  "app_opened",
  "checklist_generated",
  "checklist_completed",
  "reminders_enabled",
  "notification_clicked",
  "weather_screen_viewed",
  "location_updated"
]);

app.use(express.json({ limit: "128kb" }));

// Health check reports whether push keys and persistent subscription storage are
// configured, which is useful during local and hosted deployment testing.
app.get("/api/health", async (req, res) => {
  const storeConfigured = isSubscriptionStoreConfigured();

  try {
    const subscriptions = storeConfigured ? await getAllSubscriptions() : [];

    res.json({
      ok: true,
      vapidConfigured: pushConfig.configured,
      subscriptionStoreConfigured: storeConfigured,
      subscriptions: subscriptions.length
    });
  } catch (error) {
    console.error("Subscription storage health check failed.", error);
    res.status(503).json({
      ok: false,
      vapidConfigured: pushConfig.configured,
      subscriptionStoreConfigured: storeConfigured,
      error: "Subscription storage is unavailable."
    });
  }
});

// Exposes the public VAPID key so the browser can create a PushSubscription.
app.get("/api/push/public-key", (req, res) => {
  if (!pushConfig.configured) {
    res.status(503).json({
      error: "VAPID keys are not configured on the reminder server."
    });
    return;
  }

  res.json({
    publicKey: pushConfig.publicKey
  });
});

// Saves or updates a browser push subscription with its reminder schedule.
app.post("/api/push/subscriptions", async (req, res) => {
  if (!pushConfig.configured) {
    res.status(503).json({
      error: "VAPID keys are not configured on the reminder server."
    });
    return;
  }

  const parsed = parseSubscriptionPayload(req.body);

  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    const record = await upsertSubscription(parsed.value);

    res.status(201).json({
      subscription: toPublicSubscription(record)
    });
  } catch (error) {
    sendSubscriptionStoreError(res, error);
  }
});

// Lists public subscription summaries for manual pilot debugging; it never
// exposes the full push subscription JSON.
app.get("/api/push/subscriptions", async (req, res) => {
  try {
    const subscriptions = await getAllSubscriptions();

    res.json({
      count: subscriptions.length,
      subscriptions: subscriptions.map(toPublicSubscription)
    });
  } catch (error) {
    sendSubscriptionStoreError(res, error);
  }
});

// Removes a saved subscription so scheduled reminders stop immediately. This
// is what "turn reminders off" in the app actually calls.
app.delete("/api/push/subscriptions/:id", async (req, res) => {
  try {
    await removeSubscription(req.params.id);
    res.status(204).send();
  } catch (error) {
    sendSubscriptionStoreError(res, error);
  }
});

// Sends an immediate backend push to one subscription or all subscriptions for
// end-to-end notification testing.
app.post("/api/push/test", async (req, res) => {
  if (!pushConfig.configured) {
    res.status(503).json({
      error: "VAPID keys are not configured on the reminder server."
    });
    return;
  }

  let targets;

  try {
    const subscriptionId = req.body?.subscriptionId;
    targets = subscriptionId
      ? [await getSubscription(subscriptionId)].filter(Boolean)
      : await getAllSubscriptions();
  } catch (error) {
    sendSubscriptionStoreError(res, error);
    return;
  }

  if (targets.length === 0) {
    res.status(404).json({
      error: "No matching push subscription found."
    });
    return;
  }

  const results = await Promise.allSettled(targets.map(sendReminder));

  res.json({
    sent: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length
  });
});

// Accepts anonymous pilot activity events. Logging failures are intentionally
// soft so analytics never break the app experience.
app.post("/api/pilot-events", async (req, res) => {
  if (!isPilotEventStoreConfigured()) {
    res.status(202).json({ ok: false });
    return;
  }

  const parsed = parsePilotEventPayload(req.body);

  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    await insertPilotEvent(parsed.value);
    res.status(204).send();
  } catch (error) {
    console.error("Pilot event logging failed.", error);
    res.status(202).json({ ok: false });
  }
});

// Accepts the expanded analytics event stream from src/services/analytics.js.
// Soft-fails like /api/pilot-events: analytics must never break the app.
app.post("/api/analytics/events", async (req, res) => {
  if (!isAnalyticsStoreConfigured()) {
    res.status(202).json({ ok: false });
    return;
  }

  const parsed = parseAnalyticsEventPayload(req.body);

  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    await recordAnalyticsEvent(parsed.value);
    res.status(204).send();
  } catch (error) {
    console.error("Analytics event logging failed.", error);
    res.status(202).json({ ok: false });
  }
});

// Accepts a feedback-prompt submission (rating + optional comment).
app.post("/api/feedback", async (req, res) => {
  if (!isAnalyticsStoreConfigured()) {
    res.status(503).json({ error: "Feedback storage is not configured." });
    return;
  }

  const parsed = parseFeedbackPayload(req.body);

  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    await recordFeedbackSubmission(parsed.value);
    res.status(204).send();
  } catch (error) {
    console.error("Feedback submission failed.", error);
    res.status(503).json({ error: "Feedback could not be saved right now." });
  }
});

servePwaFiles(app);

// Starts the web server first, then starts scheduled reminders only when VAPID
// keys and Supabase subscription storage are configured.
app.listen(port, host, () => {
  console.log(`Ready running at http://${host}:${port}`);

  if (!isExpressSchedulerEnabled()) {
    console.log("Express reminder scheduler disabled by ENABLE_EXPRESS_SCHEDULER=false.");
    return;
  }

  if (!pushConfig.configured) {
    console.log("VAPID keys are missing. Copy .env.example to .env and add generated keys.");
    return;
  }

  if (!isSubscriptionStoreConfigured()) {
    console.log("Supabase storage is missing. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.");
    return;
  }

  startReminderScheduler({
    getSubscriptions: getAllSubscriptions,
    markSent: markReminderSent,
    removeSubscription,
    sendReminder,
    intervalMs: schedulerIntervalMs
  });
  console.log(`Reminder scheduler running every ${schedulerIntervalMs}ms.`);
});

// Wraps push delivery so expired subscriptions can be identified and removed by
// the scheduler.
async function sendReminder(record) {
  try {
    await sendReadyChecklistPush(record);
  } catch (error) {
    if (isSubscriptionGone(error)) {
      error.subscriptionGone = true;
    }

    throw error;
  }
}

function isExpressSchedulerEnabled() {
  return String(process.env.ENABLE_EXPRESS_SCHEDULER ?? "true").toLowerCase() !== "false";
}

// Validates the subscription payload before it reaches Supabase or Web Push.
// coarseLatitude/coarseLongitude/preferredLanguage are optional: existing
// clients (and the fallback if a user declines) omit them entirely, and the
// scheduler falls back to the generic reminder message when they're absent.
function parseSubscriptionPayload(body) {
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

// Returns null when both are omitted (valid — coarse location is optional),
// an object when both are present and finite, or undefined for a malformed
// partial/invalid pair (rejected by the caller).
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

// Validates the general analytics event payload from src/services/analytics.js.
function parseAnalyticsEventPayload(body) {
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

// Validates a feedback-prompt submission.
function parseFeedbackPayload(body) {
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

// Bounded, allow-listed fields only, mirroring sanitizePilotEventMetadata's
// approach but generalized since analytics_events' metadata shape varies by
// event name.
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

function isValidPushSubscription(subscription) {
  return typeof subscription?.endpoint === "string"
    && subscription.endpoint.length > 0
    && typeof subscription.keys?.p256dh === "string"
    && typeof subscription.keys?.auth === "string";
}

// Validates and sanitizes anonymous pilot events before inserting them.
function parsePilotEventPayload(body) {
  const anonymousDeviceId = body?.anonymousDeviceId;
  const eventType = body?.eventType;

  if (!isValidAnonymousDeviceId(anonymousDeviceId)) {
    return {
      ok: false,
      error: "A valid anonymous device id is required."
    };
  }

  if (!pilotEventTypes.has(eventType)) {
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

// Keeps subscription storage errors consistent across endpoints.
function sendSubscriptionStoreError(res, error) {
  console.error("Subscription storage request failed.", error);
  res.status(503).json({
    error: "Subscription storage is unavailable. Check Supabase configuration and table setup."
  });
}

// Serves the static PWA files from the same Express app as the API.
function servePwaFiles(appInstance) {
  appInstance.use("/icons", express.static(path.join(projectRoot, "icons")));
  appInstance.use("/src", express.static(path.join(projectRoot, "src")));

  appInstance.get("/", (req, res) => {
    res.sendFile(path.join(projectRoot, "index.html"));
  });

  [
    "index.html",
    "styles.css",
    "manifest.webmanifest",
    "sw.js"
  ].forEach((fileName) => {
    appInstance.get(`/${fileName}`, (req, res) => {
      res.sendFile(path.join(projectRoot, fileName));
    });
  });
}
