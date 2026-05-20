import assert from "node:assert/strict";
import {
  buildWindowWeather,
  createRecommendation,
  getNextForecastWindow
} from "../src/recommendation.js";

const NOW = new Date("2026-05-20T08:00:00-04:00");
const UMBRELLA = "Umbrella";
const WATERPROOF_SHOES = "Rain boots or waterproof shoes";
const LIGHT_JACKET = "Light jacket";
const HEAVY_COAT = "Heavy coat";

function recommendationItems(weather, durationHours) {
  const forecastWindow = getNextForecastWindow(weather, NOW, durationHours);
  const windowWeather = buildWindowWeather(weather, forecastWindow);

  return createRecommendation(windowWeather).items;
}

function makeWeather({
  temperature = 72,
  feelsLike = temperature,
  high = Math.max(temperature, 75),
  low = Math.min(temperature, 65),
  hourlyOverrides = []
} = {}) {
  const hourly = Array.from({ length: 14 }, (_, offset) => ({
    time: addHours(NOW, offset).toISOString(),
    temperature,
    feelsLike,
    precipitationProbability: 0,
    precipitation: 0,
    rain: 0,
    showers: 0,
    snowfall: 0,
    weatherCode: 2,
    windSpeed: 5
  }));

  hourlyOverrides.forEach(({ offset, ...override }) => {
    Object.assign(hourly[offset], override);
  });

  return {
    current: {
      time: NOW.toISOString(),
      temperature,
      feelsLike,
      precipitation: 0,
      rain: 0,
      showers: 0,
      snowfall: 0,
      weatherCode: 2,
      windSpeed: 5
    },
    daily: {
      date: "2026-05-20",
      weatherCode: 2,
      high,
      low,
      precipitationProbability: 0,
      windMax: 5
    },
    hourly
  };
}

function rainAt(offset, {
  probability = 70,
  precipitation = 0.03,
  weatherCode = 61
} = {}) {
  return {
    offset,
    precipitationProbability: probability,
    precipitation,
    rain: precipitation,
    weatherCode
  };
}

function addHours(date, hours) {
  const copy = new Date(date);

  copy.setHours(copy.getHours() + hours);
  return copy;
}

function assertIncludes(items, item, message) {
  assert.equal(items.includes(item), true, message);
}

function assertExcludes(items, item, message) {
  assert.equal(items.includes(item), false, message);
}

function assertNoRainGear(items, message) {
  [UMBRELLA, WATERPROOF_SHOES].forEach((item) => {
    assertExcludes(items, item, message);
  });
}

{
  const weather = makeWeather({ hourlyOverrides: [rainAt(8)] });

  assertExcludes(recommendationItems(weather, 3), UMBRELLA, "3h window should ignore rain starting 8 hours later.");
  assertExcludes(recommendationItems(weather, 6), UMBRELLA, "6h window should ignore rain starting 8 hours later.");
  assertIncludes(recommendationItems(weather, 9), UMBRELLA, "9h window should catch rain starting 8 hours later.");
  assertIncludes(recommendationItems(weather, 12), UMBRELLA, "12h window should catch rain starting 8 hours later.");
}

{
  const thirtyPercentLater = makeWeather({
    hourlyOverrides: [rainAt(8, { probability: 30, precipitation: 0, weatherCode: 2 })]
  });
  const thirtyFivePercentLater = makeWeather({
    hourlyOverrides: [rainAt(8, { probability: 35, precipitation: 0, weatherCode: 2 })]
  });

  assertNoRainGear(recommendationItems(thirtyPercentLater, 12), "30% future chance alone should not add rain gear.");
  assertNoRainGear(recommendationItems(thirtyFivePercentLater, 6), "35% future chance should not add rain gear for shorter windows.");
  assertIncludes(recommendationItems(thirtyFivePercentLater, 9), UMBRELLA, "35% future chance should add umbrella for longer windows.");
}

{
  const weather = makeWeather({
    hourlyOverrides: [rainAt(8, { probability: 85, precipitation: 0.08, weatherCode: 65 })]
  });
  const items = recommendationItems(weather, 12);

  assertIncludes(items, UMBRELLA, "Heavy rain later should add umbrella.");
  assertIncludes(items, WATERPROOF_SHOES, "Heavy rain later should add waterproof shoes.");
}

{
  const weather = makeWeather({
    hourlyOverrides: [rainAt(8, { probability: 45, precipitation: 0.01, weatherCode: 51 })]
  });
  const items = recommendationItems(weather, 12);

  assertIncludes(items, UMBRELLA, "Light drizzle later may still justify an umbrella.");
  assertExcludes(items, WATERPROOF_SHOES, "Light drizzle alone should not add waterproof shoes.");
}

{
  const weather = makeWeather({
    temperature: 42,
    feelsLike: 40,
    high: 45,
    low: 39,
    hourlyOverrides: [rainAt(2, { probability: 70, precipitation: 0.04, weatherCode: 61 })]
  });
  const items = recommendationItems(weather, 6);

  assertIncludes(items, HEAVY_COAT, "Cold rain should keep a warm layer.");
  assertIncludes(items, UMBRELLA, "Cold rain should add umbrella.");
  assertIncludes(items, WATERPROOF_SHOES, "Cold meaningful rain should add waterproof shoes.");
}

{
  const weather = makeWeather({
    temperature: 82,
    feelsLike: 82,
    high: 86,
    low: 75,
    hourlyOverrides: [rainAt(2, { probability: 70, precipitation: 0.04, weatherCode: 61 })]
  });
  const items = recommendationItems(weather, 6);

  assertIncludes(items, UMBRELLA, "Warm rain should add umbrella.");
  assertExcludes(items, HEAVY_COAT, "Warm rain should not add a heavy coat.");
  assertExcludes(items, LIGHT_JACKET, "Warm rain should not add a cool-weather jacket.");
}

{
  const items = recommendationItems(makeWeather(), 12);

  assertNoRainGear(items, "No rain should not add rain gear.");
}

console.log("Recommendation examples passed.");
