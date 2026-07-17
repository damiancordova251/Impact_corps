import { elements } from "../../dom/elements.js";
import { state } from "../../state/appState.js";
import { SAVED_LOCATION_STORAGE_KEY } from "../../constants/storageKeys.js";
import { getCurrentLocation, LocationAccessError } from "../../services/location.js";
import { fetchTodayWeather, WeatherFetchError } from "../../services/weather.js";
import { trackPilotEvent } from "../../services/pilotAnalytics.js";
import {
  buildWindowWeather,
  createRecommendation,
  getNextForecastWindow
} from "../../domain/recommendation.js";
import { getSavedGroupedChecklist } from "../../domain/personalizedChecklist.js";
import { getChecklistPrompt, getSavedTimeAwayHours } from "../settings/timeAway.js";
import { renderNotificationSetting } from "../notifications/notificationSettings.js";
import { renderFacts, resetFacts } from "../weatherScreen/weatherScreen.js";

// Wires the main checklist screen's own controls. Other features (onboarding,
// time-away commit) call the exported render/location helpers directly rather
// than this module reaching back into them, which keeps this file free of any
// dependency on onboarding or settings internals.
export function initChecklist() {
  elements.primaryAction.addEventListener("click", handleRecommendationRequest);
  elements.itemList.addEventListener("change", updateCompletionState);
}

export function startAppExperience() {
  if (state.startupFlowStarted) {
    return;
  }

  state.startupFlowStarted = true;
  initializeSavedLocationChecklist();
}

// Re-renders the checklist from whatever weather was last fetched, used after
// a setting changes (time away, clothing preferences) without refetching
// location or weather. Returns false when there is nothing to re-render yet.
export function rerenderLatestChecklist(source) {
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
export async function initializeSavedLocationChecklist() {
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
// recommendation engine. Exported so onboarding can render the very first
// checklist the same way the main app does.
export function renderWindowRecommendation(weather, requestedAt = new Date(), options = {}) {
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
export function setLoading(label) {
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
  listItem.dataset.checklistSection = "true";
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
  const copy = document.createElement("span");
  const text = document.createElement("span");
  const normalizedItem = normalizeChecklistItem(item);

  label.className = "checklist-row";
  checkbox.type = "checkbox";
  box.className = "checkbox-mark";
  box.innerHTML = "&#10003;";
  copy.className = "checklist-copy";
  text.className = "checklist-label";
  text.textContent = normalizedItem.label;
  copy.append(text);

  if (normalizedItem.warning) {
    const warning = document.createElement("span");

    warning.className = "checklist-warning";
    warning.textContent = normalizedItem.warning;
    copy.append(warning);
  }

  label.append(checkbox, box, copy);

  return label;
}

// Marks the screen complete when flat fallback items are all checked, or when
// grouped checklist sections each have at least one selected option.
function updateCompletionState() {
  const checkboxes = [...elements.itemList.querySelectorAll("input[type='checkbox']")];
  const groupedSections = [...elements.itemList.querySelectorAll("[data-checklist-section='true']")];
  const completableSections = groupedSections
    .filter((section) => section.querySelectorAll("input[type='checkbox']").length > 0);
  const isComplete = groupedSections.length > 0
    ? completableSections.length > 0
      && completableSections.every((section) => [...section.querySelectorAll("input[type='checkbox']")].some((checkbox) => checkbox.checked))
    : checkboxes.length > 0 && checkboxes.every((checkbox) => checkbox.checked);

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

function normalizeChecklistItem(item) {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    return {
      label: item.label ?? "",
      warning: item.warning ?? ""
    };
  }

  return {
    label: String(item),
    warning: ""
  };
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

// localStorage readers and writers validate every saved value before using it,
// so corrupted or stale data falls back to safe defaults. Exported so
// onboarding's location step can save/read the same device-local location.
export function getSavedLocationForThisDevice() {
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

export function saveLocationForThisDevice(location) {
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

export function toReminderLocation(location) {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy
  };
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
