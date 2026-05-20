import { createClient } from "@supabase/supabase-js";

const DEFAULT_TABLE_NAME = "pilot_events";

let supabaseClient = null;

export function isPilotEventStoreConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

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

function getTableName() {
  return process.env.SUPABASE_PILOT_EVENTS_TABLE || DEFAULT_TABLE_NAME;
}

class PilotEventStoreError extends Error {
  constructor(message) {
    super(message);
    this.name = "PilotEventStoreError";
  }
}
