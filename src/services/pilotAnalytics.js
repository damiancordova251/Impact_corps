import { APP_CONFIG } from "../config.js";

// Pilot analytics intentionally stays anonymous and small: one local device id,
// a limited event allowlist, and minimal non-sensitive metadata.
const DEVICE_ID_STORAGE_KEY = "readyPilotAnonymousDeviceId";
const ALLOWED_EVENT_TYPES = new Set([
  "app_opened",
  "checklist_generated",
  "checklist_completed",
  "reminders_enabled",
  "notification_clicked",
  "weather_screen_viewed",
  "location_updated"
]);

// Sends fire-and-forget activity events so analytics failures never block the
// checklist or notification flows.
export function trackPilotEvent(eventType, metadata = {}) {
  if (!ALLOWED_EVENT_TYPES.has(eventType)) {
    return;
  }

  const anonymousDeviceId = getAnonymousDeviceId();

  if (!anonymousDeviceId) {
    return;
  }

  const payload = JSON.stringify({
    anonymousDeviceId,
    eventType,
    metadata: sanitizeMetadata(metadata)
  });

  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });

    if (navigator.sendBeacon(apiUrl("/api/pilot-events"), blob)) {
      return;
    }
  }

  fetch(apiUrl("/api/pilot-events"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: payload,
    keepalive: true
  }).catch(() => {});
}

// Stores a random anonymous id on this browser only; no account, email, or exact
// location is involved.
function getAnonymousDeviceId() {
  try {
    const existingId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);

    if (existingId) {
      return existingId;
    }

    const newId = window.crypto?.randomUUID ? window.crypto.randomUUID() : createFallbackId();

    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, newId);
    return newId;
  } catch (error) {
    return null;
  }
}

// Only passes known, bounded metadata fields to the backend so accidental
// personal details or large payloads are not recorded.
function sanitizeMetadata(metadata) {
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

  if (typeof metadata.has_clothing_preferences === "boolean") {
    clean.has_clothing_preferences = metadata.has_clothing_preferences;
  }

  if (typeof metadata.personalized_checklist === "boolean") {
    clean.personalized_checklist = metadata.personalized_checklist;
  }

  if (typeof metadata.standalone === "boolean") {
    clean.standalone = metadata.standalone;
  }

  if (typeof metadata.permission === "string") {
    clean.permission = metadata.permission.slice(0, 20);
  }

  return clean;
}

// Used only when crypto.randomUUID is unavailable.
function createFallbackId() {
  return `ready-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// Keeps analytics endpoint construction aligned with the notification API base.
function apiUrl(path) {
  const baseUrl = APP_CONFIG.pushApiBaseUrl || window.location.origin;

  return new URL(path, baseUrl).toString();
}
