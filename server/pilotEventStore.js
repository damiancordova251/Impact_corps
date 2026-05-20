import { createClient } from "@supabase/supabase-js";

// Minimal Supabase event storage for pilot analytics. This stores anonymous
// usage events only, separate from push subscriptions.
const DEFAULT_TABLE_NAME = "pilot_events";

let supabaseClient = null;

// Event logging is optional in development; missing Supabase env vars make the
// API accept events without breaking the app.
export function isPilotEventStoreConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Inserts one already-sanitized pilot event row.
export async function insertPilotEvent({ anonymousDeviceId, eventType, metadata }) {
  const { error } = await getClient()
    .from(getTableName())
    .insert({
      anonymous_device_id: anonymousDeviceId,
      event_type: eventType,
      metadata
    });

  if (error) {
    throw new PilotEventStoreError(error.message);
  }
}

// Lazily creates the backend-only Supabase client used for event inserts.
function getClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new PilotEventStoreError(
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

// Allows a custom table name while defaulting to the README's pilot_events table.
function getTableName() {
  return process.env.SUPABASE_PILOT_EVENTS_TABLE || DEFAULT_TABLE_NAME;
}

// Named errors make analytics storage failures easy to distinguish in logs.
class PilotEventStoreError extends Error {
  constructor(message) {
    super(message);
    this.name = "PilotEventStoreError";
  }
}
