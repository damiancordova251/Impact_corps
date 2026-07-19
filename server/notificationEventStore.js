import { createClient } from "@supabase/supabase-js";

// Backs the notification_events lifecycle (scheduled -> delivered ->
// opened/dismissed). Every function here is best-effort: a failure never
// blocks sending a reminder or handling a click/close, it just means that
// one row (or one timestamp on it) doesn't get recorded.
const NOTIFICATION_EVENTS_TABLE_DEFAULT = "notification_events";

let supabaseClient = null;

export function isNotificationEventStoreConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Recorded at send time, immediately after the push provider accepts the
// notification — the closest proxy this app has for "delivered" without a
// device-side delivery receipt. Returns the new row's id (embedded in the
// push payload so the service worker can report back on click/close), or
// null if it couldn't be recorded (never throws).
export async function recordNotificationScheduled({ installationId, notificationType, messageVariant, weatherContext }) {
  if (!installationId || !isNotificationEventStoreConfigured()) {
    return null;
  }

  try {
    const now = new Date().toISOString();
    const { data, error } = await getClient()
      .from(getTableName())
      .insert({
        installation_id: installationId,
        notification_type: notificationType,
        message_variant: messageVariant ?? null,
        weather_context: weatherContext ?? null,
        scheduled_at: now,
        delivered_at: now
      })
      .select("id")
      .single();

    if (error) {
      throw error;
    }

    return data.id;
  } catch (error) {
    console.error("notification_events insert failed.", error);
    return null;
  }
}

export async function recordNotificationOpened(id) {
  await updateTimestamp(id, "opened_at");
}

export async function recordNotificationDismissed(id) {
  await updateTimestamp(id, "dismissed_at");
}

async function updateTimestamp(id, column) {
  if (!isNotificationEventStoreConfigured()) {
    return;
  }

  try {
    const { error } = await getClient()
      .from(getTableName())
      .update({ [column]: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error(`notification_events.${column} update failed.`, error);
  }
}

function getClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  return supabaseClient;
}

function getTableName() {
  return process.env.SUPABASE_NOTIFICATION_EVENTS_TABLE || NOTIFICATION_EVENTS_TABLE_DEFAULT;
}
