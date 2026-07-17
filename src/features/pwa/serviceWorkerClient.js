import { elements } from "../../dom/elements.js";
import { APP_CONFIG } from "../../config.js";
import { trackPilotEvent } from "../../services/pilotAnalytics.js";

// Registers the service worker, wires the update-available banner, tracks
// notification-click opens, and reflects install state into pilot analytics.
export function initPwaClient() {
  elements.updateRefreshButton?.addEventListener("click", () => {
    window.location.reload();
  });

  registerServiceWorker();
  registerServiceWorkerMessages();
  trackNotificationClickFromUrl();
}

// Service worker registration supports offline cache and shows a refresh prompt
// when a new app version is installed.
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .then(watchForServiceWorkerUpdates)
      .catch(() => {
        elements.appStatus.textContent = `${APP_CONFIG.appName} is running without offline cache.`;
      });
  });
}

function watchForServiceWorkerUpdates(registration) {
  const hadController = Boolean(navigator.serviceWorker.controller);

  if (registration.waiting && hadController) {
    showUpdateBanner();
  }

  registration.addEventListener("updatefound", () => {
    const newWorker = registration.installing;

    if (!newWorker) {
      return;
    }

    newWorker.addEventListener("statechange", () => {
      if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
        showUpdateBanner();
      }
    });
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) {
      showUpdateBanner();
    }
  });
}

function showUpdateBanner() {
  if (!elements.updateBanner) {
    elements.appStatus.textContent = "Update available. Refresh to get the latest version.";
    return;
  }

  elements.updateBanner.hidden = false;
}

// Notification click tracking can arrive either as a service worker message from
// an already open app or as a URL flag when the app opens from a push.
function registerServiceWorkerMessages() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "notification_clicked") {
      trackPilotEvent("notification_clicked");
    }
  });
}

function trackNotificationClickFromUrl() {
  const url = new URL(window.location.href);

  if (url.searchParams.get("notification") !== "clicked") {
    return;
  }

  trackPilotEvent("notification_clicked");
  url.searchParams.delete("notification");
  window.history.replaceState({}, "", url);
}
