// Shared formatting helpers used across recommendation output, checklist
// rendering, and weather details so every feature module formats numbers and
// times the same way instead of each defining its own copy.
export function bestNumber(...values) {
  return values.find((value) => Number.isFinite(value)) ?? 0;
}

export function formatTemp(value) {
  return `${Math.round(value)}°F`;
}

export function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatTimeLabel(minutes) {
  const date = new Date();
  date.setHours(0, minutes, 0, 0);

  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

export function formatHourLabel(hours) {
  return `${hours} ${hours === 1 ? "hour" : "hours"}`;
}

export function formatWeatherCode(code) {
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
