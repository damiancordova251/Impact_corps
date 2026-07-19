import { APP_CONFIG } from "../config.js";
import { INSTALLATION_ID_STORAGE_KEY } from "../constants/storageKeys.js";

const MAX_REPORTS_PER_SESSION = 20;
let reportCount = 0;

// Catches uncaught exceptions and unhandled promise rejections anywhere in
// the app and reports them to the dedicated client_errors table (not the
// general analytics_events stream, which doesn't have typed error columns).
// Initialized as early as possible in app.js so it also catches boot-time
// errors from other feature modules.
export function initErrorReporting() {
  window.addEventListener("error", (event) => {
    reportClientError({
      errorType: "uncaught_exception",
      message: event.message,
      stackExcerpt: event.error?.stack
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;

    reportClientError({
      errorType: "unhandled_rejection",
      message: typeof reason?.message === "string" ? reason.message : String(reason),
      stackExcerpt: reason?.stack
    });
  });
}

function reportClientError({ errorType, message, stackExcerpt }) {
  // A bounded cap, not a sliding window: a small pilot doesn't need anything
  // fancier, and this just prevents a rare error-loop from flooding the
  // backend for one bad session.
  if (reportCount >= MAX_REPORTS_PER_SESSION) {
    return;
  }

  reportCount += 1;

  const payload = JSON.stringify({
    installationId: getInstallationId(),
    errorType,
    message: typeof message === "string" ? message.slice(0, 500) : null,
    stackExcerpt: typeof stackExcerpt === "string" ? stackExcerpt.slice(0, 1000) : null,
    appVersion: APP_CONFIG.appVersion,
    platform: typeof navigator.userAgent === "string" ? navigator.userAgent.slice(0, 200) : null,
    occurredAt: new Date().toISOString()
  });

  fetch(apiUrl("/api/client-errors"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true
  }).catch(() => {});
}

function getInstallationId() {
  try {
    return window.localStorage.getItem(INSTALLATION_ID_STORAGE_KEY);
  } catch (error) {
    return null;
  }
}

function apiUrl(path) {
  const baseUrl = APP_CONFIG.pushApiBaseUrl || window.location.origin;

  return new URL(path, baseUrl).toString();
}
