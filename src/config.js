// Shared frontend settings keep app-wide names, API endpoints, and browser
// permission options in one place so feature modules do not duplicate them.
export const APP_CONFIG = {
  appName: "Ready",
  appVersion: "0.1.0",
  defaultNotificationTime: "06:30",
  pushApiBaseUrl: window.READY_CHECKLIST_API_BASE_URL ?? "",
  weatherApiBaseUrl: "https://api.open-meteo.com/v1/forecast",
  geolocationOptions: {
    enableHighAccuracy: false,
    timeout: 12000,
    maximumAge: 10 * 60 * 1000
  }
};
