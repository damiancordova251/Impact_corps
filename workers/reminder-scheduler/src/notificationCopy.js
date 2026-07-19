// Duplicated from server/notificationCopy.js — this Worker is a separate
// deployable package (its own package.json/wrangler.toml) that can't import
// files outside its own source tree, matching this project's existing
// server/functions duplication convention for the same reason (Cloudflare
// Workers can't use Node built-ins, and can't reach across sibling
// packages at build time). Keep both copies in sync if this logic changes.
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

export function buildNotificationCopy({ language = "en", weatherSummary = null } = {}) {
  const dictionary = COPY[language] ?? COPY.en;
  const variant = selectNotificationVariant(weatherSummary);

  return {
    title: dictionary.title,
    body: dictionary[variant],
    variant
  };
}
