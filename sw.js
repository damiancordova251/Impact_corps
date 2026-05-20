const CACHE_NAME = "ready-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/app-icon.svg",
  "./icons/app-icon-180.png",
  "./icons/app-icon-192.png",
  "./icons/app-icon-512.png",
  "./src/app.js",
  "./src/config.js",
  "./src/location.js",
  "./src/notifications.js",
  "./src/pilotAnalytics.js",
  "./src/reminders.js",
  "./src/weather.js",
  "./src/recommendation.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }

        return null;
      })))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

self.addEventListener("push", (event) => {
  const reminder = getPushReminder(event);

  event.waitUntil(
    self.registration.showNotification(reminder.title, {
      body: reminder.body,
      tag: reminder.tag ?? "ready-checklist",
      icon: "./icons/app-icon-192.png",
      badge: "./icons/app-icon-192.png",
      data: {
        url: reminder.url ?? "./"
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(openOrFocusAppFromNotification(event.notification.data?.url));
});

function getPushReminder(event) {
  if (!event.data) {
    return getDefaultReminder();
  }

  try {
    return {
      ...getDefaultReminder(),
      ...event.data.json()
    };
  } catch (error) {
    return {
      ...getDefaultReminder(),
      body: event.data.text() || getDefaultReminder().body
    };
  }
}

function getDefaultReminder() {
  return {
    title: "Ready Checklist",
    body: "Your weather checklist is ready.",
    tag: "ready-checklist",
    url: "./"
  };
}

async function openOrFocusAppFromNotification(notificationUrl = "./") {
  const targetUrl = getNotificationClickUrl(notificationUrl);
  const windowClients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  });

  const matchingClient = windowClients.find((client) => {
    const clientUrl = new URL(client.url);

    return clientUrl.origin === new URL(targetUrl).origin;
  });

  if (matchingClient) {
    matchingClient.postMessage({ type: "notification_clicked" });
    return matchingClient.focus();
  }

  if (self.clients.openWindow) {
    return self.clients.openWindow(targetUrl);
  }

  return null;
}

function getNotificationClickUrl(notificationUrl) {
  const targetUrl = new URL(notificationUrl, self.registration.scope);

  targetUrl.searchParams.set("notification", "clicked");
  return targetUrl.href;
}
