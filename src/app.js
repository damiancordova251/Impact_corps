import { APP_CONFIG } from "./config.js";
import { getCurrentLocation, LocationAccessError } from "./location.js";
import { fetchTodayWeather, WeatherFetchError } from "./weather.js";
import {
  buildWindowWeather,
  createRecommendation,
  formatTemp,
  getNextForecastWindow
} from "./recommendation.js";

const ROUTINE_START_STORAGE_KEY = "morningWearRoutineStartMinutes";
const LEGACY_WAKE_TIME_STORAGE_KEY = "morningWearWakeTimeMinutes";
const ROUTINE_START_STEP_MINUTES = 30;
const DEFAULT_ROUTINE_START_MINUTES = 6 * 60;

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
  appStatus: document.querySelector("#appStatus")
};

elements.primaryAction.addEventListener("click", handleRecommendationRequest);
elements.itemList.addEventListener("change", updateCompletionState);
elements.checklistTab.addEventListener("click", () => showScreen("checklist"));
elements.weatherTab.addEventListener("click", () => showScreen("weather"));
elements.screenTrack.addEventListener("scroll", syncActiveScreenFromScroll, { passive: true });
elements.routineStartInput.addEventListener("input", handleRoutineStartChange);
window.addEventListener("resize", () => syncActiveScreenFromScroll());
initializeRoutineStartSetting();
registerServiceWorker();

async function handleRecommendationRequest() {
  const requestedAt = new Date();

  setLoading("Getting location");

  try {
    const location = await getCurrentLocation();
    setLoading("Checking weather");

    const weather = await fetchTodayWeather(location);
    renderWindowRecommendation(weather, requestedAt);
  } catch (error) {
    renderError(error);
  }
}

function renderWindowRecommendation(weather, requestedAt = new Date()) {
  const forecastWindow = getNextForecastWindow(weather, requestedAt);
  const windowWeather = buildWindowWeather(weather, forecastWindow);
  const recommendation = createRecommendation(windowWeather);

  renderRecommendation(weather, recommendation);
}

function renderRecommendation(weather, recommendation) {
  elements.appShell.classList.remove("is-error", "is-warning", "is-complete");
  elements.statusPill.textContent = "Updated";
  elements.kicker.textContent = "Today";
  elements.recommendationTitle.textContent = recommendation.checklistTitle ?? "Ready Checklist:";
  elements.reasonText.textContent = getChecklistPrompt();
  elements.primaryAction.disabled = false;
  elements.primaryAction.textContent = "Refresh";

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
  elements.appStatus.textContent = "Checklist updated.";
}

function renderItems(items) {
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
  elements.appStatus.textContent = "Location is used only for this forecast.";
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
  elements.appStatus.textContent = `Routine start saved for ${formatTimeLabel(routineStartTime)}.`;
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

function showScreen(screenName) {
  const target = screenName === "weather" ? elements.weatherScreen : elements.checklistScreen;

  elements.screenTrack.scrollTo({
    left: getScreenLeft(target),
    behavior: "smooth"
  });
  setActiveScreen(screenName);
}

function syncActiveScreenFromScroll() {
  const halfway = getScreenLeft(elements.weatherScreen) / 2;
  const activeScreen = elements.screenTrack.scrollLeft > halfway ? "weather" : "checklist";

  setActiveScreen(activeScreen);
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
