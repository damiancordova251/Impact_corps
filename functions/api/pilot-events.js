import {
  empty,
  insertPilotEvent,
  isPilotEventStoreConfigured,
  json,
  parsePilotEventPayload,
  readJson
} from "../_shared/backend.js";

// Stores minimal anonymous pilot activity without blocking the app on failures.
export async function onRequestPost({ request, env }) {
  if (!isPilotEventStoreConfigured(env)) {
    return json({ ok: false }, { status: 202 });
  }

  const body = await readJson(request);

  if (!body.ok) {
    return json({ error: body.error }, { status: body.status });
  }

  const parsed = parsePilotEventPayload(body.value);

  if (!parsed.ok) {
    return json({ error: parsed.error }, { status: 400 });
  }

  try {
    await insertPilotEvent(parsed.value, env);
    return empty();
  } catch (error) {
    console.error("Pilot event logging failed.", error);
    return json({ ok: false }, { status: 202 });
  }
}
