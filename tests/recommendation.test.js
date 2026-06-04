import assert from "node:assert/strict";
import {
  buildWindowWeather,
  createRecommendation,
  getNextForecastWindow
} from "../src/recommendation.js";

const NOW = new Date("2026-05-20T08:00:00-04:00");
const TOP_OPTIONS = [
  "Tank Top",
  "T-shirt",
  "Polo Shirt",
  "Light Long-Sleeve",
  "Button-Up Shirt",
  "Sweater",
  "Hoodie",
  "Light Jacket",
  "Heavy Coat",
  "Thermal Layer"
];
const BOTTOM_OPTIONS = [
  "Shorts",
  "Skirt",
  "Cargo Pants",
  "Jeans",
  "Pants",
  "Joggers",
  "Sweatpants",
  "Thermal Pants"
];
const REMOVED_PHRASES = [
  "Sunglasses / Hat",
  "Sunglasses or hat",
  "Waterproof Layer",
  "Water-resistant pants",
  "Wind-resistant Layer",
  "Rain boots or waterproof shoes"
];

function recommendationItems(weather, durationHours, now = NOW) {
  const forecastWindow = getNextForecastWindow(weather, now, durationHours);
  const windowWeather = buildWindowWeather(weather, forecastWindow);

  return createRecommendation(windowWeather).items;
}

function makeWeather({
  now = NOW,
  temperature = 72,
  feelsLike = temperature,
  high = Math.max(temperature, 75),
  low = Math.min(temperature, 65),
  weatherCode = 2,
  windSpeed = 5,
  hourlyOverrides = []
} = {}) {
  const hourly = Array.from({ length: 14 }, (_, offset) => ({
    time: addHours(now, offset).toISOString(),
    temperature,
    feelsLike,
    precipitationProbability: 0,
    precipitation: 0,
    rain: 0,
    showers: 0,
    snowfall: 0,
    weatherCode,
    windSpeed
  }));

  hourlyOverrides.forEach(({ offset, ...override }) => {
    Object.assign(hourly[offset], override);
  });

  return {
    current: {
      time: now.toISOString(),
      temperature,
      feelsLike,
      precipitation: 0,
      rain: 0,
      showers: 0,
      snowfall: 0,
      weatherCode,
      windSpeed
    },
    daily: {
      date: "2026-05-20",
      weatherCode,
      high,
      low,
      precipitationProbability: 0,
      windMax: windSpeed
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

function snowAt(offset, {
  probability = 70,
  snowfall = 0.2,
  weatherCode = 71
} = {}) {
  return {
    offset,
    precipitationProbability: probability,
    snowfall,
    weatherCode
  };
}

function warmHour(offset, temperature) {
  return {
    offset,
    temperature,
    feelsLike: temperature
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

function assertHasTopAndBottom(items, message) {
  assert.equal(items.some((item) => hasAnyOption(item, TOP_OPTIONS)), true, `${message} should include a top item.`);
  assert.equal(items.some((item) => hasAnyOption(item, BOTTOM_OPTIONS)), true, `${message} should include a bottom item.`);
}

function assertLabelFree(items) {
  items.forEach((item) => {
    assert.equal(item.startsWith("Top:"), false, `${item} should not include a top label.`);
    assert.equal(item.startsWith("Bottom:"), false, `${item} should not include a bottom label.`);
  });
}

function assertRemovedPhrasesAbsent(items) {
  REMOVED_PHRASES.forEach((phrase) => {
    assertExcludes(items, phrase, `${phrase} should not be emitted.`);
  });
}

function assertNoOption(items, option, message) {
  assert.equal(items.some((item) => optionGroup(item).includes(option)), false, message);
}

function hasAnyOption(item, options) {
  const group = optionGroup(item);

  return options.some((option) => group.includes(option));
}

function optionGroup(item) {
  return item.split(" / ").map((option) => option.trim());
}

{
  const items = recommendationItems(makeWeather({
    temperature: 84,
    feelsLike: 84,
    high: 90,
    low: 78,
    weatherCode: 0
  }), 6);

  assertIncludes(items, "T-shirt / Polo Shirt / Tank Top", "Hot sunny dry day should include flexible warm tops.");
  assertIncludes(items, "Shorts / Skirt / Cargo Pants", "Hot sunny dry day should include flexible warm bottoms.");
  assertExcludes(items, "Sunglasses / Hat", "Hot sunny dry day should not include sun protection.");
  assertHasTopAndBottom(items, "Hot sunny dry day");
}

{
  const items = recommendationItems(makeWeather({
    temperature: 64,
    feelsLike: 64,
    high: 72,
    low: 58,
    weatherCode: 1,
    hourlyOverrides: [warmHour(4, 70)]
  }), 6);

  assertIncludes(items, "T-shirt / Polo Shirt / Light Long-Sleeve", "Mild sunny day should include flexible mild tops.");
  assertIncludes(items, "Shorts / Cargo Pants / Jeans", "Mild sunny day should bridge shorts and pants.");
  assertExcludes(items, "Sunglasses / Hat", "Mild sunny daytime forecast should not include sun protection.");
}

{
  const items = recommendationItems(makeWeather({
    temperature: 60,
    feelsLike: 60,
    high: 64,
    low: 56,
    weatherCode: 3,
    windSpeed: 25
  }), 6);

  assertIncludes(items, "Light Long-Sleeve / Sweater / Light Jacket", "Cloudy windy 60s should bias toward layers.");
  assertIncludes(items, "Cargo Pants / Jeans / Pants", "Cloudy windy 60s should bias away from shorts.");
  assertNoOption(items, "Shorts", "Cloudy windy 60s should not suggest shorts.");
}

{
  const items = recommendationItems(makeWeather({
    temperature: 55,
    feelsLike: 55,
    high: 59,
    low: 51,
    weatherCode: 3,
    hourlyOverrides: [rainAt(2, { probability: 70, precipitation: 0.04, weatherCode: 61 })]
  }), 6);

  assertIncludes(items, "Light Long-Sleeve / Sweater / Light Jacket", "Cool rain should include normal layer options.");
  assertIncludes(items, "Cargo Pants / Jeans / Pants", "Cool rain should include normal bottom options.");
  assertIncludes(items, "Umbrella / Rain Jacket", "Rain should use umbrella/rain jacket copy.");
  assertExcludes(items, "Sunglasses / Hat", "Rainy/cloudy-only forecast should not include sun protection.");
  assertRemovedPhrasesAbsent(items);
}

{
  const items = recommendationItems(makeWeather({
    temperature: 30,
    feelsLike: 25,
    high: 32,
    low: 24,
    weatherCode: 71,
    windSpeed: 18,
    hourlyOverrides: [snowAt(1)]
  }), 6);

  assertIncludes(items, "Thermal Layer / Heavy Coat", "Snow/freezing should include serious upper-body layers.");
  assertIncludes(items, "Thermal Pants / Sweatpants", "Snow/freezing should include serious bottom layers.");
  assertIncludes(items, "Winter shoes / Snow boots", "Snow/freezing should include winter footwear.");
  assertNoOption(items, "Shorts", "Snow/freezing should not suggest shorts.");
  assertNoOption(items, "Tank Top", "Snow/freezing should not suggest tank tops.");
  assertNoOption(items, "Sandals", "Snow/freezing should not suggest sandals.");
}

{
  const weather = makeWeather({ hourlyOverrides: [rainAt(8)] });

  assertExcludes(recommendationItems(weather, 3), "Umbrella / Rain Jacket", "3h window should ignore rain starting 8 hours later.");
  assertExcludes(recommendationItems(weather, 6), "Umbrella / Rain Jacket", "6h window should ignore rain starting 8 hours later.");
  assertIncludes(recommendationItems(weather, 9), "Umbrella / Rain Jacket", "9h window should catch rain starting 8 hours later.");
  assertIncludes(recommendationItems(weather, 12), "Umbrella / Rain Jacket", "12h window should catch rain starting 8 hours later.");
}

{
  const nightNow = new Date("2026-05-20T21:00:00-04:00");
  const items = recommendationItems(makeWeather({
    now: nightNow,
    temperature: 78,
    feelsLike: 78,
    high: 82,
    low: 74,
    weatherCode: 0
  }), 3, nightNow);

  assertExcludes(items, "Sunglasses / Hat", "Night-only forecast should not include sun protection.");
}

{
  [
    makeWeather(),
    makeWeather({ temperature: 48, feelsLike: 45, high: 50, low: 42 }),
    makeWeather({ temperature: 82, feelsLike: 82, high: 86, low: 75 }),
    makeWeather({ temperature: 36, feelsLike: 32, high: 38, low: 30 })
  ].forEach((weather, index) => {
    const items = recommendationItems(weather, 6);

    assertHasTopAndBottom(items, `Normal forecast ${index + 1}`);
    assertLabelFree(items);
    assertRemovedPhrasesAbsent(items);
  });
}

console.log("Recommendation examples passed.");
