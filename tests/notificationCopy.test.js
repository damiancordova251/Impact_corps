import assert from "node:assert/strict";
import { buildNotificationCopy, selectNotificationVariant } from "../server/notificationCopy.js";

// No weather data at all -> always the generic fallback, regardless of language.
assert.equal(selectNotificationVariant(null), "generic");
assert.equal(buildNotificationCopy({ language: "en" }).variant, "generic");
assert.equal(buildNotificationCopy({ language: "en" }).body, "Your weather checklist is ready.");
assert.equal(buildNotificationCopy({ language: "es" }).body, "Tu lista del clima está lista.");

// Rain takes priority when the probability clears the threshold.
assert.equal(selectNotificationVariant({ precipitationProbability: 60 }), "rain");
assert.equal(buildNotificationCopy({ language: "en", weatherSummary: { precipitationProbability: 60 } }).body, "Rain may be likely today. Check Ready to see what you should wear.");
assert.equal(buildNotificationCopy({ language: "es", weatherSummary: { precipitationProbability: 60 } }).body, "Puede que llueva hoy. Consulta Ready para ver qué ponerte.");

// Below the rain threshold, a cold feels-like wins next.
assert.equal(selectNotificationVariant({ precipitationProbability: 20, feelsLike: 38 }), "cold");
assert.equal(buildNotificationCopy({ language: "en", weatherSummary: { feelsLike: 30 } }).body, "It may feel colder this morning. Open Ready before heading out.");
assert.equal(buildNotificationCopy({ language: "es", weatherSummary: { feelsLike: 30 } }).body, "Esta mañana puede sentirse más frío. Abre Ready antes de salir.");

// A big rise from current to today's high surfaces the "warm" variant.
assert.equal(selectNotificationVariant({ currentTemp: 55, highTemp: 75 }), "warm");
assert.equal(buildNotificationCopy({ language: "en", weatherSummary: { currentTemp: 55, highTemp: 75 } }).body, "Temperatures may rise later today. Review your outfit recommendation.");
assert.equal(buildNotificationCopy({ language: "es", weatherSummary: { currentTemp: 55, highTemp: 75 } }).body, "Las temperaturas pueden subir más tarde hoy. Revisa tu recomendación de atuendo.");

// Mild, unremarkable weather falls back to the generic message.
assert.equal(selectNotificationVariant({ precipitationProbability: 10, feelsLike: 65, currentTemp: 65, highTemp: 70 }), "generic");

// Rain outranks cold and warm when multiple thresholds are crossed at once.
assert.equal(selectNotificationVariant({ precipitationProbability: 80, feelsLike: 30, currentTemp: 40, highTemp: 70 }), "rain");

// Unrecognized language falls back to English rather than throwing.
assert.equal(buildNotificationCopy({ language: "fr" }).title, "Ready Checklist");

console.log("Notification copy examples passed.");
