// Generates bilingual, weather-aware scheduled-reminder copy. Pure and
// dependency-free by design (no Node built-ins, no Supabase/network calls)
// so the exact same logic can be duplicated into
// workers/reminder-scheduler/src/ later, matching the project's existing
// server/functions duplication convention, once the scheduler actually has a
// coarse location + weather fetch to feed it (tracked separately — this
// module is deliberately not wired into server/pushService.js or the Worker
// yet).
//
// Deliberately NOT the full recommendation engine: only the single most
// notable condition is surfaced, phrased with "may"/"likely" rather than
// certainty, per the requirement to avoid alarming or overly certain wording.
const RAIN_PROBABILITY_THRESHOLD = 45;
const COLD_FEELS_LIKE_F = 45;
const WARM_TEMP_RISE_F = 15;

const COPY = {
  en: {
    title: "Ready Checklist",
    rain: "Rain may be likely today. Check Ready to see what you should wear.",
    cold: "It may feel colder this morning. Open Ready before heading out.",
    warm: "Temperatures may rise later today. Review your outfit recommendation.",
    generic: "Your weather checklist is ready."
  },
  es: {
    title: "Lista de Ready",
    rain: "Puede que llueva hoy. Consulta Ready para ver qué ponerte.",
    cold: "Esta mañana puede sentirse más frío. Abre Ready antes de salir.",
    warm: "Las temperaturas pueden subir más tarde hoy. Revisa tu recomendación de atuendo.",
    generic: "Tu lista del clima está lista."
  }
};

// weatherSummary is intentionally a small, coarse shape — never exact
// location, never the full forecast — just what's needed to pick one variant:
// { precipitationProbability, feelsLike, currentTemp, highTemp }
export function selectNotificationVariant(weatherSummary) {
  if (!weatherSummary) {
    return "generic";
  }

  const { precipitationProbability, feelsLike, currentTemp, highTemp } = weatherSummary;

  if (Number.isFinite(precipitationProbability) && precipitationProbability >= RAIN_PROBABILITY_THRESHOLD) {
    return "rain";
  }

  if (Number.isFinite(feelsLike) && feelsLike <= COLD_FEELS_LIKE_F) {
    return "cold";
  }

  if (Number.isFinite(currentTemp) && Number.isFinite(highTemp) && (highTemp - currentTemp) >= WARM_TEMP_RISE_F) {
    return "warm";
  }

  return "generic";
}

// language should be the subscription's saved preferred_language ("en"/"es");
// falls back to English for anything unrecognized so a bad/legacy value
// never breaks a send.
export function buildNotificationCopy({ language = "en", weatherSummary = null } = {}) {
  const dictionary = COPY[language] ?? COPY.en;
  const variant = selectNotificationVariant(weatherSummary);

  return {
    title: dictionary.title,
    body: dictionary[variant],
    variant
  };
}
