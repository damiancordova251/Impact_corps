import { APP_CONFIG } from "./config.js";

const APP_ICON_URL = "./icons/app-icon-192.png";

// Capability checks are kept together because iOS, installed PWAs, and desktop
// browsers expose slightly different pieces of the notification APIs.
export function areNotificationsSupported() {
  return "Notification" in window
    && "serviceWorker" in navigator
    && "ServiceWorkerRegistration" in window
    && "showNotification" in ServiceWorkerRegistration.prototype;
}

export function getNotificationPermission() {
  if (!("Notification" in window)) {
    return "unsupported";
  }

  return Notification.permission;
}

export function getNotificationEnvironment() {
  return {
    supported: areNotificationsSupported(),
    permission: getNotificationPermission(),
    needsHomeScreenInstall: isLikelyIos() && !isStandalonePwa()
  };
}

// Permission and local test notification helpers power the Settings controls
// without touching the backend subscription store.
export async function requestNotificationPermission() {
  if (!areNotificationsSupported()) {
    return "unsupported";
  }

  return Notification.requestPermission();
}

export async function sendTestNotification(reminder) {
  if (!areNotificationsSupported()) {
    throw new Error("Notifications are not supported in this browser.");
  }

  if (getNotificationPermission() !== "granted") {
    throw new Error("Notification permission is not granted yet.");
  }

  const registration = await navigator.serviceWorker.ready;

  await registration.showNotification(reminder.title, {
    body: reminder.body,
    tag: reminder.tag,
    renotify: true,
    icon: APP_ICON_URL,
    badge: APP_ICON_URL,
    data: {
      url: reminder.url
    }
  });
}

// Creates or reuses the browser PushSubscription, then saves the subscription
// details to the Express backend for scheduled Web Push reminders.
export async function subscribeToPushReminders({ routineStartMinutes, timezone }) {
  if (!areNotificationsSupported()) {
    throw new Error("Push notifications are not supported in this browser.");
  }

  if (getNotificationPermission() !== "granted") {
    throw new Error("Notification permission is not granted yet.");
  }

  const registration = await navigator.serviceWorker.ready;
  const vapidPublicKey = await fetchVapidPublicKey();
  const subscription = await getOrCreatePushSubscription(registration, vapidPublicKey);
  const response = await postJson("/api/push/subscriptions", {
    subscription: subscription.toJSON(),
    routineStartMinutes,
    timezone
  });

  return response.subscription;
}

// Backend helpers wrap small JSON API calls and keep URL construction compatible
// with both local development and hosted deployments.
export async function sendServerTestNotification(subscriptionId) {
  const response = await postJson("/api/push/test", { subscriptionId });

  return response;
}

export function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

async function fetchVapidPublicKey() {
  const response = await fetch(apiUrl("/api/push/public-key"));

  if (!response.ok) {
    throw new Error("Reminder server is missing VAPID keys.");
  }

  const data = await response.json();

  if (!data.publicKey) {
    throw new Error("Reminder server did not return a VAPID public key.");
  }

  return data.publicKey;
}

async function getOrCreatePushSubscription(registration, vapidPublicKey) {
  const existingSubscription = await registration.pushManager.getSubscription();

  if (existingSubscription) {
    return existingSubscription;
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
  });
}

async function postJson(path, payload) {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error ?? "Reminder server request failed.");
  }

  return data;
}

// Resolves relative API paths against either an override base URL or the current
// app origin.
function apiUrl(path) {
  const baseUrl = APP_CONFIG.pushApiBaseUrl || window.location.origin;

  return new URL(path, baseUrl).toString();
}

// Browser Push expects the VAPID key as bytes, while the backend exposes it as
// URL-safe base64 text.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = `${base64String}${padding}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

// iPhone notification support depends on the app being opened from the Home
// Screen, so these helpers guide the Settings copy.
function isLikelyIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalonePwa() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}
