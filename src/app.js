import { APP_CONFIG } from "./config.js";
import { getCurrentLocation, LocationAccessError } from "./location.js";
import {
  getBrowserTimezone,
  getNotificationEnvironment,
  requestNotificationPermission,
  sendTestNotification,
  subscribeToPushReminders
} from "./notifications.js";
import {
  createChecklistReminder,
  getRoutineReminderCopy,
  REMINDER_COPY
} from "./reminders.js";
import { fetchTodayWeather, WeatherFetchError } from "./weather.js";
import {
  buildWindowWeather,
  createRecommendation,
  formatTemp,
  getNextForecastWindow
} from "./recommendation.js";
import { trackPilotEvent } from "./pilotAnalytics.js";

const ROUTINE_START_STORAGE_KEY = "morningWearRoutineStartMinutes";
const LEGACY_WAKE_TIME_STORAGE_KEY = "morningWearWakeTimeMinutes";
const PUSH_SUBSCRIPTION_ID_STORAGE_KEY = "morningWearPushSubscriptionId";
const SAVED_LOCATION_STORAGE_KEY = "readySavedLocation";
const ROUTINE_START_STEP_MINUTES = 30;
const DEFAULT_ROUTINE_START_MINUTES = 6 * 60;

const state = {
  latestLocation: null,
  pushSubscriptionId: getSavedPushSubscriptionId(),
  completedTrackedForChecklist: false,
  weatherScreenTracked: false
};

const elements = {
  appShell: document.querySelector(".app-shell"),
  statusPill: document.querySelector("#statusPill"),
  screenTrack: document.querySelector("#screenTrack"),
  checklistTab: document.querySelector("#checklistTab"),
  weatherTab: document.querySelector("#weatherTab"),
  checklistScreen: document.querySelector("#checklistScreen"),
  weatherScreen: document.querySelector("#weatherScreen"),
  kicker: document.querySelector("#kicker"),
  recommendationTitle: document.querySelector("#recommendationTitle"),
  reasonText: document.querySelector("#reasonText"),
  itemList: document.querySelector("#itemList"),
  primaryAction: document.querySelector("#primaryAction"),
  temperatureTitle: document.querySelector("#temperatureTitle"),
  feelsFact: document.querySelector("#feelsFact"),
  rangeFact: document.querySelector("#rangeFact"),
  rainFact: document.querySelector("#rainFact"),
  windFact: document.querySelector("#windFact"),
  precipFact: document.querySelector("#precipFact"),
  conditionFact: document.querySelector("#conditionFact"),
  lastUpdatedFact: document.querySelector("#lastUpdatedFact"),
  routineStartInput: document.querySelector("#routineStartInput"),
  routineStartValue: document.querySelector("#routineStartValue"),
  notificationStatus: document.querySelector("#notificationStatus"),
  notificationRoutineNote: document.querySelector("#notificationRoutineNote"),
  enableNotificationsButton: document.querySelector("#enableNotificationsButton"),
  testNotificationButton: document.querySelector("#testNotificationButton"),
  appStatus: document.querySelector("#appStatus")
};

elements.primaryAction.addEventListener("click", handleRecommendationRequest);
elements.itemList.addEventListener("change", updateCompletionState);
elements.checklistTab.addEventListener("click", () => showScreen("checklist"));
elements.weatherTab.addEventListener("click", () => showScreen("weather"));
elements.screenTrack.addEventListener("scroll", syncActiveScreenFromScroll, { passive: true });
elements.routineStartInput.addEventListener("input", handleRoutineStartChange);
elements.routineStartInput.addEventListener("change", handleRoutineStartCommit);
elements.enableNotificationsButton.addEventListener("click", handleEnableNotifications);
elements.testNotificationButton.addEventListener("click", handleTestNotification);
window.addEventListener("resize", () => syncActiveScreenFromScroll());
initializeRoutineStartSetting();
initializeNotificationSetting();
registerServiceWorker();
registerServiceWorkerMessages();
trackPilotEvent("app_opened", { standalone: isStandalonePwa() });
trackNotificationClickFromUrl();
initializeSavedLocationChecklist();

async function handleRecommendationRequest() {
  const requestedAt = new Date();

  setLoading("Getting location");

  try {
    const location = await getCurrentLocation();
    state.latestLocation = toReminderLocation(location);
    saveLocationForThisDevice(state.latestLocation);
    renderNotificationSetting();
    trackPilotEvent("location_updated", { source: "current_location" });
    setLoading("Checking weather");

    const weather = await fetchTodayWeather(location);
    renderWindowRecommendation(weather, requestedAt, { source: "current_location" });
  } catch (error) {
    renderError(error);
  }
}

async function initializeSavedLocationChecklist() {
  const savedLocation = getSavedLocationForThisDevice();

  if (!savedLocation) {
    elements.appStatus.textContent = "Tap Use current location once. Location can be stored on this device for faster starts.";
    return;
  }

  state.latestLocation = savedLocation;
  renderNotificationSetting();
  setLoading("Checking saved location");

  try {
    const weather = await fetchTodayWeather(savedLocation);
    renderWindowRecommendation(weather, new Date(), { source: "saved_location" });
  } catch (error) {
    renderError(error);
    elements.primaryAction.textContent = "Use current location";
    elements.appStatus.textContent = "Saved location could not update the checklist. Tap Use current location to refresh it.";
  }
}

function renderWindowRecommendation(weather, requestedAt = new Date(), options = {}) {
  const forecastWindow = getNextForecastWindow(weather, requestedAt);
  const windowWeather = buildWindowWeather(weather, forecastWindow);
  const recommendation = createRecommendation(windowWeather);

  renderRecommendation(weather, recommendation);
  trackPilotEvent("checklist_generated", {
    source: options.source ?? "unknown",
    itemCount: recommendation.items.length,
    hasItems: recommendation.items.length > 0
  });
}

function renderRecommendation(weather, recommendation) {
  elements.appShell.classList.remove("is-error", "is-warning", "is-complete");
  elements.statusPill.textContent = "Updated";
  elements.kicker.textContent = "Today";
  elements.recommendationTitle.textContent = recommendation.checklistTitle ?? "Ready Checklist:";
  elements.reasonText.textContent = getChecklistPrompt();
  elements.primaryAction.disabled = false;
  elements.primaryAction.textContent = "Update location";

  renderItems(recommendation.items);
  updateCompletionState();
  renderFacts(weather);
}

function renderFacts(weather) {
  const currentTemp = bestNumber(weather.current.temperature, weather.daily.high);
  const feelsLike = bestNumber(weather.current.feelsLike, weather.current.temperature);
  const high = bestNumber(weather.daily.high, weather.current.temperature);
  const low = bestNumber(weather.daily.low, weather.current.temperature);
  const rainChance = bestNumber(weather.daily.precipitationProbability, 0);
  const currentPrecip = bestNumber(weather.current.precipitation, 0);
  const wind = Math.max(
    bestNumber(weather.current.windSpeed, 0),
    bestNumber(weather.daily.windMax, 0)
  );

  elements.temperatureTitle.textContent = formatTemp(currentTemp);
  elements.feelsFact.textContent = formatTemp(feelsLike);
  elements.rangeFact.textContent = `${formatTemp(high)} / ${formatTemp(low)}`;
  elements.rainFact.textContent = `${Math.round(rainChance)}% chance`;
  elements.windFact.textContent = `${Math.round(wind)} mph`;
  elements.precipFact.textContent = `${currentPrecip.toFixed(2)} in now`;
  elements.conditionFact.textContent = formatWeatherCode(bestNumber(weather.daily.weatherCode, weather.current.weatherCode));
  elements.lastUpdatedFact.textContent = formatTime(weather.fetchedAt);
  elements.appStatus.textContent = "Checklist updated. Location stays on this device only.";
}

function renderItems(items) {
  state.completedTrackedForChecklist = false;

  if (items.length === 0) {
    const listItem = document.createElement("li");
    listItem.className = "empty-checklist";
    listItem.textContent = "No extra items needed";
    elements.itemList.replaceChildren(listItem);
    return;
  }

  elements.itemList.replaceChildren(...items.map(createChecklistItem));
}

function setLoading(label) {
  elements.appShell.classList.remove("is-error", "is-warning", "is-complete");
  elements.statusPill.textContent = "Loading";
  elements.kicker.textContent = label;
  elements.recommendationTitle.textContent = "Ready Checklist:";
  elements.reasonText.textContent = "Checking today's weather.";
  elements.primaryAction.disabled = true;
  elements.primaryAction.textContent = "Checking...";
  elements.appStatus.textContent = "Location is stored on this device only.";
  clearItems();
}

function renderError(error) {
  const copy = getErrorCopy(error);

  elements.appShell.classList.toggle("is-warning", copy.kind === "warning");
  elements.appShell.classList.toggle("is-error", copy.kind === "error");
  elements.appShell.classList.remove("is-complete");
  elements.statusPill.textContent = copy.status;
  elements.kicker.textContent = copy.kicker;
  elements.recommendationTitle.textContent = copy.title;
  elements.reasonText.textContent = copy.reason;
  elements.primaryAction.disabled = false;
  elements.primaryAction.textContent = "Try again";
  elements.appStatus.textContent = copy.footer;
  clearItems();
  resetFacts();
}

function createChecklistItem(item) {
  const listItem = document.createElement("li");
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  const box = document.createElement("span");
  const text = document.createElement("span");

  label.className = "checklist-row";
  checkbox.type = "checkbox";
  box.className = "checkbox-mark";
  box.innerHTML = "&#10003;";
  text.className = "checklist-label";
  text.textContent = item;

  label.append(checkbox, box, text);
  listItem.append(label);

  return listItem;
}

function updateCompletionState() {
  const checkboxes = [...elements.itemList.querySelectorAll("input[type='checkbox']")];
  const isComplete = checkboxes.length > 0 && checkboxes.every((checkbox) => checkbox.checked);

  elements.appShell.classList.toggle("is-complete", isComplete);

  if (isComplete && !state.completedTrackedForChecklist) {
    state.completedTrackedForChecklist = true;
    trackPilotEvent("checklist_completed", { itemCount: checkboxes.length });
  }
}

function clearItems() {
  elements.itemList.replaceChildren();
  updateCompletionState();
}

function getChecklistPrompt() {
  return "Prepared for the next 12 hours.";
}

function getErrorCopy(error) {
  if (error instanceof LocationAccessError) {
    if (error.code === "DENIED") {
      return {
        kind: "warning",
        status: "Location off",
        kicker: "Location",
        title: "Turn on location",
        reason: "Location permission is needed to check today's weather.",
        footer: "On iPhone, allow location for this site in Safari settings."
      };
    }

    if (error.code === "INSECURE_CONTEXT") {
      return {
        kind: "warning",
        status: "HTTPS needed",
        kicker: "Location",
        title: "Use HTTPS or localhost",
        reason: "iPhone requires a secure page before GPS can work.",
        footer: "Localhost works for development. A hosted pilot should use HTTPS."
      };
    }

    return {
      kind: "warning",
      status: "No location",
      kicker: "Location",
      title: "Location unavailable",
      reason: error.message,
      footer: "Try again from a place with a stronger signal."
    };
  }

  if (error instanceof WeatherFetchError) {
    return {
      kind: "error",
      status: "No weather",
      kicker: "Weather",
      title: "Weather unavailable",
      reason: error.message,
      footer: "No recommendation shown because the forecast could not be checked."
    };
  }

  return {
    kind: "error",
    status: "Error",
    kicker: "Error",
    title: "Something went wrong",
    reason: "The recommendation could not be made.",
    footer: "Try again in a moment."
  };
}

function resetFacts() {
  elements.temperatureTitle.textContent = "--";
  elements.feelsFact.textContent = "--";
  elements.rangeFact.textContent = "--";
  elements.rainFact.textContent = "--";
  elements.windFact.textContent = "--";
  elements.precipFact.textContent = "--";
  elements.conditionFact.textContent = "--";
  elements.lastUpdatedFact.textContent = "--";
}

function initializeRoutineStartSetting() {
  const routineStartTime = getSavedRoutineStartTime();

  elements.routineStartInput.value = String(routineStartTime / ROUTINE_START_STEP_MINUTES);
  elements.routineStartValue.textContent = formatTimeLabel(routineStartTime);
}

function handleRoutineStartChange() {
  const routineStartTime = Number(elements.routineStartInput.value) * ROUTINE_START_STEP_MINUTES;

  saveRoutineStartTime(routineStartTime);
  elements.routineStartValue.textContent = formatTimeLabel(routineStartTime);
  renderNotificationSetting();
  elements.appStatus.textContent = `Routine start saved for ${formatTimeLabel(routineStartTime)}.`;
}

async function handleRoutineStartCommit() {
  const environment = getNotificationEnvironment();

  if (environment.permission !== "granted" || !state.pushSubscriptionId) {
    return;
  }

  await syncPushReminderSubscription("Routine start updated. Saving reminder schedule...");
}

function initializeNotificationSetting() {
  renderNotificationSetting();
}

async function handleEnableNotifications() {
  renderNotificationSetting("Requesting notification permission...");

  const permission = await requestNotificationPermission();

  if (permission === "granted") {
    await syncPushReminderSubscription("Notifications enabled. Saving server reminder...");
    return;
  }

  if (permission === "denied") {
    renderNotificationSetting("Notifications are blocked. Update browser or iPhone settings to enable them.");
    return;
  }

  if (permission === "default") {
    renderNotificationSetting("Notification permission was not granted. Tap Enable reminders to try again.");
    return;
  }

  renderNotificationSetting("Notifications are not supported in this browser.");
}

async function handleTestNotification() {
  elements.testNotificationButton.disabled = true;

  try {
    await sendTestNotification(createChecklistReminder());
    renderNotificationSetting("Test notification sent.");
  } catch (error) {
    renderNotificationSetting(error.message);
  }
}

async function syncPushReminderSubscription(statusMessage) {
  renderNotificationSetting(statusMessage);

  try {
    const subscription = await subscribeToPushReminders({
      routineStartMinutes: getSavedRoutineStartTime(),
      timezone: getBrowserTimezone()
    });

    state.pushSubscriptionId = subscription.id;
    savePushSubscriptionId(subscription.id);
    trackPilotEvent("reminders_enabled", { permission: getNotificationEnvironment().permission });
    renderNotificationSetting("Server reminders are saved. You can still send a local test notification.");
  } catch (error) {
    renderNotificationSetting(`Permission is granted, but server reminders were not saved. ${error.message}`);
  }
}

function renderNotificationSetting(statusOverride = null) {
  const environment = getNotificationEnvironment();
  const routineStartLabel = formatTimeLabel(getSavedRoutineStartTime());

  elements.notificationRoutineNote.textContent = getReminderRoutineNote(routineStartLabel);

  if (!environment.supported) {
    elements.notificationStatus.textContent = statusOverride
      ?? getUnsupportedNotificationStatus(environment);
    elements.enableNotificationsButton.textContent = "Unavailable";
    elements.enableNotificationsButton.disabled = true;
    elements.testNotificationButton.disabled = true;
    return;
  }

  elements.enableNotificationsButton.disabled = environment.permission === "denied";
  elements.testNotificationButton.disabled = environment.permission !== "granted";

  if (environment.permission === "granted") {
    elements.enableNotificationsButton.textContent = state.pushSubscriptionId ? "Update reminders" : "Save reminders";
    elements.notificationStatus.textContent = statusOverride
      ?? getGrantedNotificationStatus();
    return;
  }

  if (environment.permission === "denied") {
    elements.enableNotificationsButton.textContent = "Blocked";
    elements.notificationStatus.textContent = statusOverride
      ?? "Notifications are blocked. Update browser or iPhone settings to enable them.";
    return;
  }

  elements.enableNotificationsButton.textContent = "Enable reminders";
  elements.notificationStatus.textContent = statusOverride
    ?? getDefaultNotificationStatus(environment);
}

function getUnsupportedNotificationStatus(environment) {
  if (environment.needsHomeScreenInstall) {
    return "Notifications are not supported here yet. On iPhone, install the PWA to the Home Screen and open it there.";
  }

  return "Notifications are not supported in this browser.";
}

function getDefaultNotificationStatus(environment) {
  if (environment.needsHomeScreenInstall) {
    return `On iPhone, install this PWA to the Home Screen before enabling reminders. ${REMINDER_COPY.scheduledServer}`;
  }

  return `Notifications are supported. Tap Enable reminders to request permission and save this PWA with the reminder server. ${REMINDER_COPY.scheduledServer}`;
}

function getGrantedNotificationStatus() {
  if (state.pushSubscriptionId) {
    return `Server reminders are saved. ${REMINDER_COPY.scheduledServer}`;
  }

  return "Notifications are enabled. Tap Save reminders to finish server scheduling.";
}

function getReminderRoutineNote(routineStartLabel) {
  if (state.latestLocation) {
    return `${getRoutineReminderCopy(routineStartLabel)} Location stays on this device.`;
  }

  return getRoutineReminderCopy(routineStartLabel);
}

function getSavedRoutineStartTime() {
  try {
    const storedValue = window.localStorage.getItem(ROUTINE_START_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_WAKE_TIME_STORAGE_KEY);

    if (storedValue === null) {
      return DEFAULT_ROUTINE_START_MINUTES;
    }

    const savedValue = Number(storedValue);

    if (isValidRoutineStartTime(savedValue)) {
      return savedValue;
    }
  } catch (error) {
    return DEFAULT_ROUTINE_START_MINUTES;
  }

  return DEFAULT_ROUTINE_START_MINUTES;
}

function saveRoutineStartTime(routineStartTime) {
  if (!isValidRoutineStartTime(routineStartTime)) {
    return;
  }

  try {
    window.localStorage.setItem(ROUTINE_START_STORAGE_KEY, String(routineStartTime));
  } catch (error) {
    elements.appStatus.textContent = "Start time could not be saved.";
  }
}

function getSavedPushSubscriptionId() {
  try {
    return window.localStorage.getItem(PUSH_SUBSCRIPTION_ID_STORAGE_KEY);
  } catch (error) {
    return null;
  }
}

function savePushSubscriptionId(subscriptionId) {
  try {
    window.localStorage.setItem(PUSH_SUBSCRIPTION_ID_STORAGE_KEY, subscriptionId);
  } catch (error) {
    elements.appStatus.textContent = "Reminder subscription could not be saved locally.";
  }
}

function getSavedLocationForThisDevice() {
  try {
    const rawValue = window.localStorage.getItem(SAVED_LOCATION_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const location = JSON.parse(rawValue);

    if (isValidSavedLocation(location)) {
      return {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        accuracy: Number.isFinite(Number(location.accuracy)) ? Number(location.accuracy) : null,
        savedAt: location.savedAt ?? null
      };
    }

    window.localStorage.removeItem(SAVED_LOCATION_STORAGE_KEY);
  } catch (error) {
    return null;
  }

  return null;
}

function saveLocationForThisDevice(location) {
  if (!isValidSavedLocation(location)) {
    return;
  }

  try {
    window.localStorage.setItem(SAVED_LOCATION_STORAGE_KEY, JSON.stringify({
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      accuracy: Number.isFinite(Number(location.accuracy)) ? Number(location.accuracy) : null,
      savedAt: new Date().toISOString()
    }));
  } catch (error) {
    elements.appStatus.textContent = "Location could not be saved on this device.";
  }
}

function isValidSavedLocation(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);

  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

function isValidRoutineStartTime(value) {
  return Number.isInteger(value)
    && value >= 0
    && value < 24 * 60
    && value % ROUTINE_START_STEP_MINUTES === 0;
}

function formatTimeLabel(minutes) {
  const date = new Date();
  date.setHours(0, minutes, 0, 0);

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function toReminderLocation(location) {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy
  };
}

function showScreen(screenName) {
  const target = screenName === "weather" ? elements.weatherScreen : elements.checklistScreen;

  elements.screenTrack.scrollTo({
    left: getScreenLeft(target),
    behavior: "smooth"
  });
  setActiveScreen(screenName);
  trackWeatherScreenView(screenName);
}

function syncActiveScreenFromScroll() {
  const halfway = getScreenLeft(elements.weatherScreen) / 2;
  const activeScreen = elements.screenTrack.scrollLeft > halfway ? "weather" : "checklist";

  setActiveScreen(activeScreen);
  trackWeatherScreenView(activeScreen);
}

function getScreenLeft(screen) {
  const paddingLeft = Number.parseFloat(getComputedStyle(elements.screenTrack).paddingLeft) || 0;

  return Math.max(0, screen.offsetLeft - elements.screenTrack.offsetLeft - paddingLeft);
}

function setActiveScreen(screenName) {
  const showChecklist = screenName === "checklist";

  elements.checklistScreen.classList.toggle("is-active", showChecklist);
  elements.weatherScreen.classList.toggle("is-active", !showChecklist);
  elements.checklistTab.classList.toggle("is-active", showChecklist);
  elements.weatherTab.classList.toggle("is-active", !showChecklist);
  elements.checklistTab.setAttribute("aria-selected", String(showChecklist));
  elements.weatherTab.setAttribute("aria-selected", String(!showChecklist));
}

function trackWeatherScreenView(screenName) {
  if (screenName !== "weather" || state.weatherScreenTracked) {
    return;
  }

  state.weatherScreenTracked = true;
  trackPilotEvent("weather_screen_viewed");
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatWeatherCode(code) {
  const labels = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Cloudy",
    45: "Fog",
    48: "Fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    56: "Freezing drizzle",
    57: "Freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Rain showers",
    81: "Rain showers",
    82: "Heavy showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Thunderstorm with hail"
  };

  return labels[code] ?? "Unavailable";
}

function bestNumber(...values) {
  return values.find((value) => Number.isFinite(value)) ?? 0;
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      elements.appStatus.textContent = `${APP_CONFIG.appName} is running without offline cache.`;
    });
  });
}

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

function isStandalonePwa() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}
