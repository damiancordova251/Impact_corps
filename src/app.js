// Main browser entry point: wires together location, weather, checklist rules,
// reminders, service worker updates, and anonymous pilot analytics.
import { APP_CONFIG } from "./config.js";
import {
  CLOTHING_PREFERENCE_CATEGORIES,
  getSavedClothingPreferences,
  hasCompletedClothingPreferences,
  markClothingPreferencesSkipped,
  saveClothingPreferences,
  validateClothingPreferences
} from "./clothingPreferences.js";
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
import { getSavedGroupedChecklist } from "./personalizedChecklist.js";
import {
  buildWindowWeather,
  createRecommendation,
  formatTemp,
  getNextForecastWindow
} from "./recommendation.js";
import { trackPilotEvent } from "./pilotAnalytics.js";

// localStorage keys keep user preferences on this device without adding
// accounts or storing exact location in Supabase.
const ROUTINE_START_STORAGE_KEY = "morningWearRoutineStartMinutes";
const LEGACY_WAKE_TIME_STORAGE_KEY = "morningWearWakeTimeMinutes";
const PUSH_SUBSCRIPTION_ID_STORAGE_KEY = "morningWearPushSubscriptionId";
const SAVED_LOCATION_STORAGE_KEY = "readySavedLocation";
const TIME_AWAY_STORAGE_KEY = "readyExpectedTimeAwayHours";
const ROUTINE_START_STEP_MINUTES = 30;
const DEFAULT_ROUTINE_START_MINUTES = 6 * 60;
const DEFAULT_TIME_AWAY_HOURS = 6;
const MAX_TIME_AWAY_HOURS = 12;
const LEGACY_MAX_TIME_AWAY_HOURS = 15;
const TIME_AWAY_OPTIONS = [3, 6, 9, 12];

// Runtime state stores the current forecast/session values that multiple UI
// handlers need to coordinate.
const state = {
  latestWeather: null,
  latestRecommendationRequestedAt: null,
  latestLocation: null,
  pushSubscriptionId: getSavedPushSubscriptionId(),
  completedTrackedForChecklist: false,
  weatherScreenTracked: false,
  clothingPreferencesMode: "onboarding",
  startupFlowStarted: false
};

// DOM references are collected once so rendering functions can update the page
// without repeatedly querying the document.
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
  timeAwayInput: document.querySelector("#timeAwayInput"),
  timeAwayValue: document.querySelector("#timeAwayValue"),
  routineStartInput: document.querySelector("#routineStartInput"),
  routineStartValue: document.querySelector("#routineStartValue"),
  editClothingPreferencesButton: document.querySelector("#editClothingPreferencesButton"),
  notificationStatus: document.querySelector("#notificationStatus"),
  notificationRoutineNote: document.querySelector("#notificationRoutineNote"),
  enableNotificationsButton: document.querySelector("#enableNotificationsButton"),
  testNotificationButton: document.querySelector("#testNotificationButton"),
  clothingPreferencesScreen: document.querySelector("#clothingPreferencesScreen"),
  clothingPreferencesForm: document.querySelector("#clothingPreferencesForm"),
  clothingPreferencesSkip: document.querySelector("#clothingPreferencesSkip"),
  clothingPreferenceCategories: document.querySelector("#clothingPreferenceCategories"),
  clothingPreferencesMessage: document.querySelector("#clothingPreferencesMessage"),
  updateBanner: document.querySelector("#updateBanner"),
  updateRefreshButton: document.querySelector("#updateRefreshButton"),
  appStatus: document.querySelector("#appStatus")
};

// Event listeners turn user actions, scrolling, and setting changes into app
// state updates.
elements.primaryAction.addEventListener("click", handleRecommendationRequest);
elements.itemList.addEventListener("change", updateCompletionState);
elements.checklistTab.addEventListener("click", () => showScreen("checklist"));
elements.weatherTab.addEventListener("click", () => showScreen("weather"));
elements.screenTrack.addEventListener("scroll", syncActiveScreenFromScroll, { passive: true });
elements.timeAwayInput.addEventListener("input", handleTimeAwayChange);
elements.timeAwayInput.addEventListener("change", handleTimeAwayCommit);
elements.routineStartInput.addEventListener("input", handleRoutineStartChange);
elements.routineStartInput.addEventListener("change", handleRoutineStartCommit);
elements.editClothingPreferencesButton.addEventListener("click", () => showClothingPreferencesScreen("settings"));
elements.enableNotificationsButton.addEventListener("click", handleEnableNotifications);
elements.testNotificationButton.addEventListener("click", handleTestNotification);
elements.clothingPreferencesForm.addEventListener("submit", handleClothingPreferencesSave);
elements.clothingPreferencesSkip.addEventListener("click", handleClothingPreferencesSkip);
elements.updateRefreshButton?.addEventListener("click", () => {
  window.location.reload();
});
window.addEventListener("resize", () => syncActiveScreenFromScroll());

// Startup initializes saved settings, notification copy, service worker wiring,
// analytics, and the saved-location auto-checklist.
initializeTimeAwaySetting();
initializeRoutineStartSetting();
initializeNotificationSetting();
renderClothingPreferenceCategories();
registerServiceWorker();
registerServiceWorkerMessages();
trackPilotEvent("app_opened", { standalone: isStandalonePwa() });
trackNotificationClickFromUrl();
initializePersonalizationFlow();

// First-run personalization is local-only. Saving or skipping dismisses the
// screen and lets the normal saved-location startup continue.
function initializePersonalizationFlow() {
  if (hasCompletedClothingPreferences()) {
    startAppExperience();
    return;
  }

  showClothingPreferencesScreen("onboarding");
}

function startAppExperience() {
  if (state.startupFlowStarted) {
    return;
  }

  state.startupFlowStarted = true;
  initializeSavedLocationChecklist();
}

function showClothingPreferencesScreen(mode) {
  state.clothingPreferencesMode = mode;
  renderClothingPreferenceCategories();
  elements.clothingPreferencesMessage.textContent = "";
  elements.clothingPreferencesScreen.hidden = false;
  elements.clothingPreferencesScreen.scrollTop = 0;
}

function hideClothingPreferencesScreen() {
  elements.clothingPreferencesScreen.hidden = true;
}

function renderClothingPreferenceCategories() {
  const savedPreferences = getSavedClothingPreferences();
  const categorySections = CLOTHING_PREFERENCE_CATEGORIES.map((category) => createClothingPreferenceCategory(
    category,
    savedPreferences[category.id] ?? []
  ));

  elements.clothingPreferenceCategories.replaceChildren(...categorySections);
}

function createClothingPreferenceCategory(category, selectedOptions) {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  const helper = document.createElement("p");
  const chipGroup = document.createElement("div");
  const selectedSet = new Set(selectedOptions);

  section.className = "preference-category";
  heading.textContent = category.label;
  helper.textContent = "Choose at least one";
  chipGroup.className = "preference-chip-group";

  chipGroup.replaceChildren(...category.options.map((option) => createClothingPreferenceChip(category.id, option, selectedSet.has(option))));
  section.append(heading, helper, chipGroup);

  return section;
}

function createClothingPreferenceChip(categoryId, option, selected) {
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  const text = document.createElement("span");

  label.className = "preference-chip";
  checkbox.type = "checkbox";
  checkbox.name = categoryId;
  checkbox.value = option;
  checkbox.checked = selected;
  text.textContent = option;

  label.append(checkbox, text);
  return label;
}

function handleClothingPreferencesSave(event) {
  event.preventDefault();

  const preferences = getClothingPreferencesFromForm();
  const validation = validateClothingPreferences(preferences);

  if (!validation.valid) {
    elements.clothingPreferencesMessage.textContent = `Choose at least one item for ${formatMissingPreferenceCategories(validation.missingCategories)}.`;
    return;
  }

  try {
    saveClothingPreferences(preferences);
    hideClothingPreferencesScreen();
    elements.appStatus.textContent = "Clothing preferences saved on this device only.";

    if (rerenderLatestChecklist("clothing_preferences_updated")) {
      elements.appStatus.textContent = "Clothing preferences saved. Checklist updated.";
      return;
    }

    startAppExperience();
  } catch (error) {
    elements.clothingPreferencesMessage.textContent = "Preferences could not be saved on this device.";
  }
}

function handleClothingPreferencesSkip() {
  if (state.clothingPreferencesMode === "onboarding") {
    markClothingPreferencesSkipped();
  }

  hideClothingPreferencesScreen();
  elements.appStatus.textContent = "Clothing preferences skipped. You can edit them from Settings.";
  startAppExperience();
}

function getClothingPreferencesFromForm() {
  return CLOTHING_PREFERENCE_CATEGORIES.reduce((preferences, category) => {
    preferences[category.id] = [...elements.clothingPreferencesForm.querySelectorAll(`input[name="${category.id}"]:checked`)]
      .map((input) => input.value);

    return preferences;
  }, {});
}

function formatMissingPreferenceCategories(categories) {
  if (categories.length <= 1) {
    return categories[0] ?? "each category";
  }

  return `${categories.slice(0, -1).join(", ")} and ${categories.at(-1)}`;
}

// Handles the explicit "Use current location" / "Update location" button flow:
// get GPS, save it locally, fetch weather, then render the checklist.
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

// On later app opens, reuses the locally saved location so the checklist can
// generate without asking the user to tap the location button again.
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

// Applies the selected time-away setting to the forecast before running the
// recommendation engine.
function renderWindowRecommendation(weather, requestedAt = new Date(), options = {}) {
  const timeAwayHours = getSavedTimeAwayHours();
  const forecastWindow = getNextForecastWindow(weather, requestedAt, timeAwayHours);
  const windowWeather = buildWindowWeather(weather, forecastWindow);
  const recommendation = createRecommendation(windowWeather);
  const groupedChecklist = getSavedGroupedChecklist(recommendation);
  const renderedChecklist = groupedChecklist ?? recommendation.items;

  state.latestWeather = weather;
  state.latestRecommendationRequestedAt = requestedAt;
  renderRecommendation(weather, recommendation, timeAwayHours, renderedChecklist);
  trackPilotEvent("checklist_generated", {
    source: options.source ?? "unknown",
    itemCount: getChecklistItemCount(renderedChecklist),
    hasItems: getChecklistItemCount(renderedChecklist) > 0,
    expected_time_away_hours: timeAwayHours,
    has_clothing_preferences: Boolean(groupedChecklist?.personalized),
    personalized_checklist: Boolean(groupedChecklist?.personalized)
  });
}

function rerenderLatestChecklist(source) {
  if (!state.latestWeather) {
    return false;
  }

  renderWindowRecommendation(
    state.latestWeather,
    state.latestRecommendationRequestedAt ?? new Date(),
    { source }
  );
  return true;
}

// Updates the main checklist screen after a successful weather fetch.
function renderRecommendation(weather, recommendation, timeAwayHours, checklist) {
  elements.appShell.classList.remove("is-error", "is-warning", "is-complete");
  elements.statusPill.textContent = "Updated";
  elements.kicker.textContent = "Today";
  elements.recommendationTitle.textContent = recommendation.checklistTitle ?? "Ready Checklist:";
  elements.reasonText.textContent = getChecklistPrompt(timeAwayHours);
  elements.primaryAction.disabled = false;
  elements.primaryAction.textContent = "Update location";

  renderItems(checklist);
  updateCompletionState();
  renderFacts(weather);
}

// Populates the Weather screen with the current forecast summary.
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

// Rebuilds the checklist rows from generic strings or personalized grouped
// sections, while preserving checkbox completion behavior.
function renderItems(checklist) {
  state.completedTrackedForChecklist = false;

  if (isPersonalizedChecklist(checklist)) {
    renderPersonalizedItems(checklist.sections);
    return;
  }

  const items = Array.isArray(checklist) ? checklist : [];

  if (items.length === 0) {
    const listItem = document.createElement("li");
    listItem.className = "empty-checklist";
    listItem.textContent = "No extra items needed";
    elements.itemList.replaceChildren(listItem);
    return;
  }

  elements.itemList.replaceChildren(...items.map(createChecklistItem));
}

function renderPersonalizedItems(sections) {
  if (sections.length === 0) {
    renderItems([]);
    return;
  }

  elements.itemList.replaceChildren(...sections.map(createChecklistSection));
}

// Loading and error renderers keep the main screen in a clear state while async
// location/weather/reminder work is running or has failed.
function setLoading(label) {
  elements.appShell.classList.remove("is-error", "is-warning", "is-complete");
  elements.statusPill.textContent = "Loading";
  elements.kicker.textContent = label;
  elements.recommendationTitle.textContent = "Ready Checklist:";
  elements.reasonText.textContent = `Checking weather for the next ${getSavedTimeAwayHours()} hours.`;
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

// Builds one accessible checklist row with a hidden checkbox and styled check
// mark.
function createChecklistItem(item) {
  const listItem = document.createElement("li");

  listItem.append(createChecklistRow(item));

  return listItem;
}

function createChecklistSection(section) {
  const listItem = document.createElement("li");
  const heading = document.createElement("h2");
  const rows = document.createElement("div");

  listItem.className = "checklist-section";
  heading.className = "checklist-section-title";
  heading.textContent = section.title;
  rows.className = "checklist-section-items";
  rows.replaceChildren(...section.items.map(createChecklistRow));
  listItem.append(heading, rows);

  return listItem;
}

function createChecklistRow(item) {
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

  return label;
}

// Marks the screen complete when every item is checked and records that pilot
// event only once per generated checklist.
function updateCompletionState() {
  const checkboxes = [...elements.itemList.querySelectorAll("input[type='checkbox']")];
  const isComplete = checkboxes.length > 0 && checkboxes.every((checkbox) => checkbox.checked);

  elements.appShell.classList.toggle("is-complete", isComplete);

  if (isComplete && !state.completedTrackedForChecklist) {
    state.completedTrackedForChecklist = true;
    trackPilotEvent("checklist_completed", { itemCount: checkboxes.length });
  }
}

// Small text and reset helpers keep checklist display copy consistent.
function clearItems() {
  elements.itemList.replaceChildren();
  updateCompletionState();
}

function isPersonalizedChecklist(checklist) {
  return checklist
    && typeof checklist === "object"
    && Array.isArray(checklist.sections);
}

function getChecklistItemCount(checklist) {
  if (isPersonalizedChecklist(checklist)) {
    return checklist.sections.reduce((total, section) => total + section.items.length, 0);
  }

  return Array.isArray(checklist) ? checklist.length : 0;
}

function getChecklistPrompt(timeAwayHours = getSavedTimeAwayHours()) {
  return `Prepared for the next ${timeAwayHours} hours.`;
}

// Maps known error types to concise UI states and recovery guidance.
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

// Time-away settings control the recommendation forecast window and stay
// separate from the reminder schedule.
function initializeTimeAwaySetting() {
  const timeAwayHours = getSavedTimeAwayHours();

  elements.timeAwayInput.value = String(timeAwayHours);
  elements.timeAwayValue.textContent = formatHourLabel(timeAwayHours);
  elements.reasonText.textContent = getChecklistPrompt(timeAwayHours);
}

function handleTimeAwayChange() {
  const timeAwayHours = Number(elements.timeAwayInput.value);

  saveTimeAwayHours(timeAwayHours);
  elements.timeAwayValue.textContent = formatHourLabel(getSavedTimeAwayHours());
  elements.reasonText.textContent = getChecklistPrompt();
  elements.appStatus.textContent = `Checklist window saved for ${formatHourLabel(getSavedTimeAwayHours())}.`;
}

function handleTimeAwayCommit() {
  if (!state.latestWeather) {
    return;
  }

  renderWindowRecommendation(state.latestWeather, new Date(), { source: "time_away_updated" });
}

// Routine start settings control when reminders are sent, not how much forecast
// data the checklist uses.
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

// Notification settings manage browser permission, local test notifications,
// and saving Web Push subscriptions to the backend.
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

// Syncs the current browser PushSubscription with the server so scheduled
// reminders can survive restarts through Supabase storage.
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

// Recomputes Settings text and button availability from current browser
// notification support, permission, and saved subscription state.
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

// localStorage readers and writers validate every saved value before using it,
// so corrupted or stale data falls back to safe defaults.
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

function getSavedTimeAwayHours() {
  try {
    const storedValue = window.localStorage.getItem(TIME_AWAY_STORAGE_KEY);

    if (storedValue === null) {
      return DEFAULT_TIME_AWAY_HOURS;
    }

    const savedValue = Number(storedValue);

    if (isValidTimeAwayHours(savedValue)) {
      return savedValue;
    }

    if (savedValue === LEGACY_MAX_TIME_AWAY_HOURS) {
      window.localStorage.setItem(TIME_AWAY_STORAGE_KEY, String(MAX_TIME_AWAY_HOURS));
      return MAX_TIME_AWAY_HOURS;
    }

    window.localStorage.removeItem(TIME_AWAY_STORAGE_KEY);
  } catch (error) {
    return DEFAULT_TIME_AWAY_HOURS;
  }

  return DEFAULT_TIME_AWAY_HOURS;
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

function saveTimeAwayHours(timeAwayHours) {
  if (!isValidTimeAwayHours(timeAwayHours)) {
    return;
  }

  try {
    window.localStorage.setItem(TIME_AWAY_STORAGE_KEY, String(timeAwayHours));
  } catch (error) {
    elements.appStatus.textContent = "Checklist window could not be saved.";
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

// Validation and formatting helpers keep sliders, stored values, and labels in
// the exact shapes the rest of the app expects.
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

function isValidTimeAwayHours(value) {
  return Number.isInteger(value) && TIME_AWAY_OPTIONS.includes(value);
}

function formatTimeLabel(minutes) {
  const date = new Date();
  date.setHours(0, minutes, 0, 0);

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatHourLabel(hours) {
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

function toReminderLocation(location) {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy
  };
}

// Screen navigation keeps tabs and horizontal swipe scrolling in sync.
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

// Display formatters for timestamps, weather codes, and numeric fallbacks.
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

function isStandalonePwa() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
}
