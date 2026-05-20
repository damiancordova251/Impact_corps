import { APP_CONFIG } from "./config.js";

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

function createFallbackId() {
  return `ready-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function apiUrl(path) {
  const baseUrl = APP_CONFIG.pushApiBaseUrl || window.location.origin;

  return new URL(path, baseUrl).toString();
}
