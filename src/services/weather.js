import { APP_CONFIG } from "../config.js";
import { trackApiPerformance } from "./analytics.js";

// A named error type keeps forecast failures separate from location or app
// rendering errors.
export class WeatherFetchError extends Error {
  constructor(message) {
    super(message);
    this.name = "WeatherFetchError";
  }
}

// Builds the Open-Meteo request for current, daily, and hourly values that the
// checklist and weather detail screen need.
export async function fetchTodayWeather({ latitude, longitude }) {
  const url = new URL(APP_CONFIG.weatherApiBaseUrl);
  url.search = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current: [
      "temperature_2m",
      "apparent_temperature",
      "precipitation",
      "rain",
      "showers",
      "snowfall",
      "weather_code",
      "wind_speed_10m"
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
      "wind_speed_10m_max"
    ].join(","),
    hourly: [
      "temperature_2m",
      "apparent_temperature",
      "precipitation_probability",
      "precipitation",
      "rain",
      "showers",
      "snowfall",
      "weather_code",
      "wind_speed_10m"
    ].join(","),
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "auto",
    forecast_days: "2"
  }).toString();

  let response;
  const startedAt = performance.now();

  try {
    response = await fetch(url);
  } catch (error) {
    trackApiPerformance({ endpoint: "open-meteo:forecast", durationMs: performance.now() - startedAt, statusCode: null });
    throw new WeatherFetchError("Weather is unavailable right now.");
  }

  trackApiPerformance({ endpoint: "open-meteo:forecast", durationMs: performance.now() - startedAt, statusCode: response.status });

  if (!response.ok) {
    throw new WeatherFetchError("Weather is unavailable right now.");
  }

  const data = await response.json();
  return normalizeWeather(data);
}

// Converts the Open-Meteo response shape into the smaller weather object used
// by the recommendation and UI layers.
function normalizeWeather(data) {
  const current = data.current ?? {};
  const daily = data.daily ?? {};
  const hourly = data.hourly ?? {};

  const weather = {
    latitude: toNumber(data.latitude),
    longitude: toNumber(data.longitude),
    timezone: data.timezone ?? "Local time",
    fetchedAt: new Date().toISOString(),
    current: {
      time: current.time ?? null,
      temperature: toNumber(current.temperature_2m),
      feelsLike: toNumber(current.apparent_temperature),
      precipitation: toNumber(current.precipitation),
      rain: toNumber(current.rain),
      showers: toNumber(current.showers),
      snowfall: toNumber(current.snowfall),
      weatherCode: toNumber(current.weather_code),
      windSpeed: toNumber(current.wind_speed_10m)
    },
    daily: {
      date: first(daily.time),
      weatherCode: toNumber(first(daily.weather_code)),
      high: toNumber(first(daily.temperature_2m_max)),
      low: toNumber(first(daily.temperature_2m_min)),
      precipitationProbability: toNumber(first(daily.precipitation_probability_max)),
      windMax: toNumber(first(daily.wind_speed_10m_max))
    },
    hourly: normalizeHourly(hourly)
  };

  if (!Number.isFinite(weather.current.temperature) && !Number.isFinite(weather.daily.high)) {
    throw new WeatherFetchError("Weather data came back incomplete.");
  }

  return weather;
}

// Rebuilds the hourly arrays into one object per forecast hour so later code can
// filter and summarize the selected checklist window.
function normalizeHourly(hourly) {
  const times = Array.isArray(hourly.time) ? hourly.time : [];

  return times.map((time, index) => ({
    time,
    temperature: toNumber(valueAt(hourly.temperature_2m, index)),
    feelsLike: toNumber(valueAt(hourly.apparent_temperature, index)),
    precipitationProbability: toNumber(valueAt(hourly.precipitation_probability, index)),
    precipitation: toNumber(valueAt(hourly.precipitation, index)),
    rain: toNumber(valueAt(hourly.rain, index)),
    showers: toNumber(valueAt(hourly.showers, index)),
    snowfall: toNumber(valueAt(hourly.snowfall, index)),
    weatherCode: toNumber(valueAt(hourly.weather_code, index)),
    windSpeed: toNumber(valueAt(hourly.wind_speed_10m, index))
  }));
}

// Small guards below keep missing API fields from leaking undefined values into
// recommendation math or display formatting.
function valueAt(values, index) {
  return Array.isArray(values) ? values[index] : null;
}

function first(value) {
  return Array.isArray(value) ? value[0] : null;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
