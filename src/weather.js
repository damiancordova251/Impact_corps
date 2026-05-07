import { APP_CONFIG } from "./config.js";

export class WeatherFetchError extends Error {
  constructor(message) {
    super(message);
    this.name = "WeatherFetchError";
  }
}

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
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "auto",
    forecast_days: "1"
  }).toString();

  let response;

  try {
    response = await fetch(url);
  } catch (error) {
    throw new WeatherFetchError("Weather is unavailable right now.");
  }

  if (!response.ok) {
    throw new WeatherFetchError("Weather is unavailable right now.");
  }

  const data = await response.json();
  return normalizeWeather(data);
}

function normalizeWeather(data) {
  const current = data.current ?? {};
  const daily = data.daily ?? {};

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
    }
  };

  if (!Number.isFinite(weather.current.temperature) && !Number.isFinite(weather.daily.high)) {
    throw new WeatherFetchError("Weather data came back incomplete.");
  }

  return weather;
}

function first(value) {
  return Array.isArray(value) ? value[0] : null;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
