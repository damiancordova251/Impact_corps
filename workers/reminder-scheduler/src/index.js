import { buildPushPayload } from "@block65/webcrypto-web-push";

const DEFAULT_TABLE_NAME = "push_subscriptions";
const DEFAULT_CRON_WINDOW_MINUTES = 5;
const REMINDER = {
  title: "Ready Checklist",
  body: "Your weather checklist is ready.",
  tag: "ready-checklist-test",
  url: "/"
};

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runReminderScheduler({
      env,
      now: getScheduledDate(controller)
    }));
  }
};

export async function runReminderScheduler({ env, now = new Date() }) {
  assertConfigured(env);

  const dryRun = isEnabled(env.DRY_RUN);
  const cronWindowMinutes = getCronWindowMinutes(env.CRON_WINDOW_MINUTES);
  const subscriptions = await getSubscriptions(env);
  const summary = {
    checked: subscriptions.length,
    due: 0,
    sent: 0,
    skippedAlreadySent: 0,
    removed: 0,
    failed: 0,
    dryRun
  };

  await Promise.all(subscriptions.map(async (record) => {
    const localTime = getLocalTimeParts(now, record.timezone);

    if (!isDueWithinWindow(localTime.minuteOfDay, record.routineStartMinutes, cronWindowMinutes)) {
      return;
    }

    if (record.lastSentDate === localTime.dateKey) {
      summary.skippedAlreadySent += 1;
      return;
    }

    summary.due += 1;

    if (dryRun) {
      console.log(`Dry run: Ready reminder due for ${record.id} on ${localTime.dateKey}.`);
      return;
    }

    try {
      await sendReadyChecklistPush(record, env);
      await markReminderSent(record.id, localTime.dateKey, env);
      summary.sent += 1;
      console.log(`Sent Ready Checklist reminder to ${record.id} for ${localTime.dateKey}.`);
    } catch (error) {
      if (isSubscriptionGone(error)) {
        await removeSubscription(record.id, env);
        summary.removed += 1;
        console.log(`Removed expired push subscription ${record.id}.`);
        return;
      }

      summary.failed += 1;
      console.error(`Failed to send Ready Checklist reminder to ${record.id}.`, error);
    }
  }));

  console.log("Ready reminder scheduler summary", summary);
  return summary;
}

async function getSubscriptions(env) {
  const response = await supabaseFetch(env, {
    path: tablePath(env),
    searchParams: new URLSearchParams({
      select: "id,subscription,routine_start_minutes,timezone,last_sent_date,created_at,updated_at",
      order: "created_at.asc"
    })
  });

  const rows = await response.json();

  return rows.map(toRecord);
}

async function markReminderSent(id, localDate, env) {
  await supabaseFetch(env, {
    path: tablePath(env),
    searchParams: new URLSearchParams({
      id: `eq.${id}`
    }),
    init: {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        last_sent_date: localDate,
        updated_at: new Date().toISOString()
      })
    }
  });
}

async function removeSubscription(id, env) {
  await supabaseFetch(env, {
    path: tablePath(env),
    searchParams: new URLSearchParams({
      id: `eq.${id}`
    }),
    init: {
      method: "DELETE"
    }
  });
}

async function sendReadyChecklistPush(record, env) {
  const vapid = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY
  };
  const message = {
    data: REMINDER,
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

async function supabaseFetch(env, { path, searchParams = new URLSearchParams(), init = {} }) {
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

function getLocalTimeParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const value = (type) => parts.find((part) => part.type === type)?.value;
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));

  return {
    hour,
    minute,
    minuteOfDay: hour * 60 + minute,
    dateKey: `${value("year")}-${value("month")}-${value("day")}`
  };
}

function isDueWithinWindow(minuteOfDay, routineStartMinutes, cronWindowMinutes) {
  return minuteOfDay >= routineStartMinutes
    && minuteOfDay < routineStartMinutes + cronWindowMinutes;
}

function getScheduledDate(controller) {
  const scheduledTime = Number(controller?.scheduledTime);

  if (!Number.isFinite(scheduledTime)) {
    return new Date();
  }

  return new Date(scheduledTime < 10_000_000_000 ? scheduledTime * 1000 : scheduledTime);
}

function getCronWindowMinutes(value) {
  const minutes = Number(value);

  return Number.isInteger(minutes) && minutes > 0 && minutes <= 30
    ? minutes
    : DEFAULT_CRON_WINDOW_MINUTES;
}

function tablePath(env) {
  return encodeURIComponent(env.SUPABASE_PUSH_SUBSCRIPTIONS_TABLE || DEFAULT_TABLE_NAME);
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

function assertConfigured(env) {
  [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT"
  ].forEach((key) => {
    if (!env[key]) {
      throw new Error(`${key} is required.`);
    }
  });
}

function isEnabled(value) {
  return String(value).toLowerCase() === "true";
}

function isSubscriptionGone(error) {
  return error?.statusCode === 404 || error?.statusCode === 410;
}

class PushSendError extends Error {
  constructor(statusCode, responseBody) {
    super(`Push service request failed with ${statusCode}. ${responseBody}`);
    this.name = "PushSendError";
    this.statusCode = statusCode;
  }
}
