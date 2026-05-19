export const APP_CONFIG = {
  appName: "Morning Wear",
  defaultNotificationTime: "06:30",
  pushApiBaseUrl: window.READY_CHECKLIST_API_BASE_URL ?? "",
  weatherApiBaseUrl: "https://api.open-meteo.com/v1/forecast",
  geolocationOptions: {
    enableHighAccuracy: false,
    timeout: 12000,
    maximumAge: 10 * 60 * 1000
  }
};
