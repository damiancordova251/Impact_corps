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
  markReminderSent,
  removeSubscription,
  toPublicSubscription,
  upsertSubscription
} from "./subscriptionStore.js";
import {
  isValidRoutineStartMinutes,
  isValidTimezone
} from "./time.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";
const schedulerIntervalMs = Number(process.env.SCHEDULER_INTERVAL_MS) || 30000;
const pushConfig = configureWebPush();

app.use(express.json({ limit: "128kb" }));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    vapidConfigured: pushConfig.configured,
    subscriptions: getAllSubscriptions().length
  });
});

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

app.post("/api/push/subscriptions", (req, res) => {
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

  const record = upsertSubscription(parsed.value);

  res.status(201).json({
    subscription: toPublicSubscription(record)
  });
});

app.get("/api/push/subscriptions", (req, res) => {
  res.json({
    count: getAllSubscriptions().length,
    subscriptions: getAllSubscriptions().map(toPublicSubscription)
  });
});

app.post("/api/push/test", async (req, res) => {
  if (!pushConfig.configured) {
    res.status(503).json({
      error: "VAPID keys are not configured on the reminder server."
    });
    return;
  }

  const subscriptionId = req.body?.subscriptionId;
  const targets = subscriptionId
    ? [getSubscription(subscriptionId)].filter(Boolean)
    : getAllSubscriptions();

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

servePwaFiles(app);

app.listen(port, host, () => {
  console.log(`Morning Wear running at http://${host}:${port}`);

  if (!pushConfig.configured) {
    console.log("VAPID keys are missing. Copy .env.example to .env and add generated keys.");
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

function parseSubscriptionPayload(body) {
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
      timezone,
      location: body.location ?? null
    }
  };
}

function isValidPushSubscription(subscription) {
  return typeof subscription?.endpoint === "string"
    && subscription.endpoint.length > 0
    && typeof subscription.keys?.p256dh === "string"
    && typeof subscription.keys?.auth === "string";
}

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
