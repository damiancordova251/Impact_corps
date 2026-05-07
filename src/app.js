import { APP_CONFIG } from "./config.js";
import { getCurrentLocation, LocationAccessError } from "./location.js";
import { fetchTodayWeather, WeatherFetchError } from "./weather.js";
import { createRecommendation, formatTemp } from "./recommendation.js";

const elements = {
  appShell: document.querySelector(".app-shell"),
  statusPill: document.querySelector("#statusPill"),
  kicker: document.querySelector("#kicker"),
  recommendationTitle: document.querySelector("#recommendationTitle"),
  reasonText: document.querySelector("#reasonText"),
  itemList: document.querySelector("#itemList"),
  primaryAction: document.querySelector("#primaryAction"),
  feelsFact: document.querySelector("#feelsFact"),
  rangeFact: document.querySelector("#rangeFact"),
  rainFact: document.querySelector("#rainFact"),
  windFact: document.querySelector("#windFact"),
  lastUpdated: document.querySelector("#lastUpdated")
};

elements.primaryAction.addEventListener("click", handleRecommendationRequest);
registerServiceWorker();

async function handleRecommendationRequest() {
  setLoading("Getting location");

  try {
    const location = await getCurrentLocation();
    setLoading("Checking weather");

    const weather = await fetchTodayWeather(location);
    const recommendation = createRecommendation(weather);

    renderRecommendation(weather, recommendation);
  } catch (error) {
    renderError(error);
  }
}

function renderRecommendation(weather, recommendation) {
  elements.appShell.classList.remove("is-error", "is-warning");
  elements.statusPill.textContent = "Updated";
  elements.kicker.textContent = "Today";
  elements.recommendationTitle.textContent = recommendation.title;
  elements.reasonText.textContent = recommendation.reason;
  elements.primaryAction.disabled = false;
  elements.primaryAction.textContent = "Refresh";

  renderItems(recommendation.items);
  renderFacts(weather);
}

function renderFacts(weather) {
  const feelsLike = bestNumber(weather.current.feelsLike, weather.current.temperature);
  const high = bestNumber(weather.daily.high, weather.current.temperature);
  const low = bestNumber(weather.daily.low, weather.current.temperature);
  const rainChance = bestNumber(weather.daily.precipitationProbability, 0);
  const wind = Math.max(
    bestNumber(weather.current.windSpeed, 0),
    bestNumber(weather.daily.windMax, 0)
  );

  elements.feelsFact.textContent = formatTemp(feelsLike);
  elements.rangeFact.textContent = `${formatTemp(high)} / ${formatTemp(low)}`;
  elements.rainFact.textContent = `${Math.round(rainChance)}%`;
  elements.windFact.textContent = `${Math.round(wind)} mph`;
  elements.lastUpdated.textContent = `Last updated ${formatTime(weather.fetchedAt)}.`;
}

function renderItems(items) {
  elements.itemList.replaceChildren(
    ...items.map((item) => {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      return listItem;
    })
  );
}

function setLoading(label) {
  elements.appShell.classList.remove("is-error", "is-warning");
  elements.statusPill.textContent = "Loading";
  elements.kicker.textContent = label;
  elements.recommendationTitle.textContent = "One moment";
  elements.reasonText.textContent = "Checking today's weather.";
  elements.primaryAction.disabled = true;
  elements.primaryAction.textContent = "Checking...";
  elements.lastUpdated.textContent = "Location is used only for this forecast.";
  renderItems([]);
}

function renderError(error) {
  const copy = getErrorCopy(error);

  elements.appShell.classList.toggle("is-warning", copy.kind === "warning");
  elements.appShell.classList.toggle("is-error", copy.kind === "error");
  elements.statusPill.textContent = copy.status;
  elements.kicker.textContent = copy.kicker;
  elements.recommendationTitle.textContent = copy.title;
  elements.reasonText.textContent = copy.reason;
  elements.primaryAction.disabled = false;
  elements.primaryAction.textContent = "Try again";
  elements.lastUpdated.textContent = copy.footer;
  renderItems([]);
  resetFacts();
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
  elements.feelsFact.textContent = "--";
  elements.rangeFact.textContent = "--";
  elements.rainFact.textContent = "--";
  elements.windFact.textContent = "--";
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
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
      elements.lastUpdated.textContent = `${APP_CONFIG.appName} is running without offline cache.`;
    });
  });
}
