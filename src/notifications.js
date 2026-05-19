const APP_ICON_URL = "./icons/app-icon.svg";

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

function isLikelyIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalonePwa() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}
