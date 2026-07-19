import { elements } from "../../dom/elements.js";
import { state } from "../../state/appState.js";
import { bestNumber, formatTemp, formatTime, formatWeatherCode } from "../../utils/format.js";
import { trackPilotEvent } from "../../services/pilotAnalytics.js";
import { t } from "../../i18n/i18n.js";

// Wires screen navigation (tabs + swipe track) and owns the Weather screen's
// facts rendering.
export function initWeatherScreen() {
  elements.checklistTab.addEventListener("click", () => showScreen("checklist"));
  elements.weatherTab.addEventListener("click", () => showScreen("weather"));
  elements.screenTrack.addEventListener("scroll", syncActiveScreenFromScroll, { passive: true });
  window.addEventListener("resize", () => syncActiveScreenFromScroll());
  elements.checklistTab.textContent = t("tabs.checklist");
  elements.weatherTab.textContent = t("tabs.weather");
}

// Populates the Weather screen with the current forecast summary. Called from
// features/checklist/checklist.js after every successful weather fetch.
export function renderFacts(weather) {
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
  elements.rainFact.textContent = t("weather.rainChanceValue", { percent: Math.round(rainChance) });
  elements.windFact.textContent = t("weather.windValue", { mph: Math.round(wind) });
  elements.precipFact.textContent = t("weather.precipValue", { amount: currentPrecip.toFixed(2) });
  elements.conditionFact.textContent = formatWeatherCode(bestNumber(weather.daily.weatherCode, weather.current.weatherCode));
  elements.lastUpdatedFact.textContent = formatTime(weather.fetchedAt);
  elements.appStatus.textContent = t("checklist.checklistUpdatedStatus");
}

export function resetFacts() {
  elements.temperatureTitle.textContent = "--";
  elements.feelsFact.textContent = "--";
  elements.rangeFact.textContent = "--";
  elements.rainFact.textContent = "--";
  elements.windFact.textContent = "--";
  elements.precipFact.textContent = "--";
  elements.conditionFact.textContent = "--";
  elements.lastUpdatedFact.textContent = "--";
}

// Screen navigation keeps tabs and horizontal swipe scrolling in sync.
// Exported so onboarding can land on the checklist tab the same way tapping
// the tab itself would.
export function showScreen(screenName) {
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
