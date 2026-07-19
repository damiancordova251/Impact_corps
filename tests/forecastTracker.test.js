import assert from "node:assert/strict";
import {
  buildActualRow,
  errorOf,
  findNearestHour,
  getHorizonHours,
  groupBy,
  isEnabled,
  toLocationBucket,
  toNumber
} from "../workers/forecast-tracker/src/index.js";

// errorOf: observed - predicted, rounded to one decimal; null when either side is missing.
assert.equal(errorOf(60, 65), 5);
assert.equal(errorOf(60.25, 58.1), -2.1);
assert.equal(errorOf(null, 65), null);
assert.equal(errorOf(60, undefined), null);

// findNearestHour picks whichever hourly entry is closest in time to the target.
const hourly = [
  { time: new Date("2026-07-17T10:00:00Z"), temperature: 60 },
  { time: new Date("2026-07-17T12:00:00Z"), temperature: 65 },
  { time: new Date("2026-07-17T14:00:00Z"), temperature: 70 }
];
assert.equal(findNearestHour(hourly, new Date("2026-07-17T12:40:00Z")).temperature, 65);
assert.equal(findNearestHour(hourly, new Date("2026-07-17T13:10:00Z")).temperature, 70);
assert.equal(findNearestHour([], new Date()), null);

// toLocationBucket rounds to the same 1-decimal-degree precision used client-side.
assert.equal(toLocationBucket(42.3736, -71.1097), "42.4,-71.1");

// getHorizonHours parses the comma-separated env var and falls back to the default.
assert.deepEqual(getHorizonHours("6,12,24"), [6, 12, 24]);
assert.deepEqual(getHorizonHours("6, bogus ,24"), [6, 24]);
assert.deepEqual(getHorizonHours(""), [6, 12, 24]);
assert.deepEqual(getHorizonHours(undefined), [6, 12, 24]);

// isEnabled only treats the literal string "true" (case-insensitive) as enabled.
assert.equal(isEnabled("true"), true);
assert.equal(isEnabled("TRUE"), true);
assert.equal(isEnabled("false"), false);
assert.equal(isEnabled(undefined), false);

// toNumber coerces to a finite number or null, never NaN.
assert.equal(toNumber("72.5"), 72.5);
assert.equal(toNumber(null), null);
assert.equal(toNumber("not-a-number"), null);

// groupBy buckets items by key while preserving each item's shape.
const grouped = groupBy([{ bucket: "a", n: 1 }, { bucket: "b", n: 2 }, { bucket: "a", n: 3 }], (item) => item.bucket);
assert.deepEqual(grouped.get("a").map((item) => item.n), [1, 3]);
assert.deepEqual(grouped.get("b").map((item) => item.n), [2]);

// buildActualRow computes error columns and the would-change-recommendation heuristic.
const now = new Date("2026-07-17T15:00:00Z");
const closePrediction = {
  id: 1,
  predicted_temp: 60,
  predicted_feels_like: 58,
  predicted_precip_probability: 20,
  predicted_condition_code: 1
};
const closeActual = { temperature: 62, feelsLike: 60, precipitationProbability: 25, precipitation: 0, conditionCode: 1, windSpeed: 5, humidity: 40 };
const closeRow = buildActualRow(closePrediction, closeActual, now);
assert.equal(closeRow.temp_error, 2);
assert.equal(closeRow.condition_match, true);
assert.equal(closeRow.would_change_recommendation, false);
assert.equal(closeRow.recorded_at, now.toISOString());

const missedPrediction = { id: 2, predicted_temp: 50, predicted_feels_like: 48, predicted_precip_probability: 10, predicted_condition_code: 0 };
const missedActual = { temperature: 68, feelsLike: 66, precipitationProbability: 80, precipitation: 0.4, conditionCode: 61, windSpeed: 8, humidity: 70 };
const missedRow = buildActualRow(missedPrediction, missedActual, now);
assert.equal(missedRow.temp_error, 18);
assert.equal(missedRow.condition_match, false);
assert.equal(missedRow.would_change_recommendation, true);

console.log("Forecast tracker examples passed.");
