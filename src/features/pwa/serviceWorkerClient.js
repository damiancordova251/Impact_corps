import { elements } from "../../dom/elements.js";
import { APP_CONFIG } from "../../config.js";
import { trackPilotEvent } from "../../services/pilotAnalytics.js";
import { getLocale, t } from "../../i18n/i18n.js";

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
        elements.appStatus.textContent = t("pwa.runningWithoutOfflineCache", { appName: APP_CONFIG.appName });
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
    elements.appStatus.textContent = t("pwa.updateAvailableRefreshPrompt");
    return;
  }

  elements.updateBanner.hidden = false;
  showLatestChangelogMessage();
}

// The currently-running page's own copy of changelog.js is whatever shipped
// with ITS load, not the update that was just detected — so this is
// imported fresh (the service worker's network-first fetch handling, same as
// every other core asset, means this actually reaches the new deployed
// file rather than a stale cached one).
async function showLatestChangelogMessage() {
  if (!elements.updateBannerMessage) {
    return;
  }

  try {
    const { CHANGELOG } = await import("../../changelog.js");
    const latest = CHANGELOG[CHANGELOG.length - 1];
    const message = latest?.[getLocale()] ?? latest?.en;

    if (message) {
      elements.updateBannerMessage.textContent = message;
    }
  } catch (error) {
    // Best-effort; the banner still works without a "what's new" message.
  }
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
