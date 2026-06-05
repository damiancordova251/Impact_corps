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
const CLOTHING_WEIGHT_PATTERN = "(Light|Light-Medium|Medium|Medium-Heavy|Heavy)";
const TOP_LABEL_PATTERN = new RegExp(`^Top \\(${CLOTHING_WEIGHT_PATTERN}\\): `);
const BOTTOM_LABEL_PATTERN = new RegExp(`^Bottom \\(${CLOTHING_WEIGHT_PATTERN}\\): `);
const REMOVED_PHRASES = [
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
  assert.equal(items.some(isTopItem), true, `${message} should include a labelled top item.`);
  assert.equal(items.some(isBottomItem), true, `${message} should include a labelled bottom item.`);
  assert.equal(items.some((item) => isTopItem(item) && hasAnyOption(item, TOP_OPTIONS)), true, `${message} should include top options.`);
  assert.equal(items.some((item) => isBottomItem(item) && hasAnyOption(item, BOTTOM_OPTIONS)), true, `${message} should include bottom options.`);
}

function assertAccessoriesLabelFree(items) {
  items.forEach((item) => {
    if (!isTopItem(item) && !isBottomItem(item)) {
      assert.equal(item.startsWith("Accessory:"), false, `${item} should stay label-free.`);
      assert.equal(/^[A-Za-z]+ \([^)]+\): /.test(item), false, `${item} should not use clothing label format.`);
    }
  });
}

function assertNoWideWeightRanges(items) {
  items.forEach((item) => {
    assert.equal(item.includes("(Light-Heavy)"), false, `${item} should not use a Light-Heavy range.`);
    assert.equal(item.includes("(Light-Medium-Heavy)"), false, `${item} should not use an awkward long range.`);
  });
}

function assertClothingWeightIn(items, category, weights, message) {
  const item = items.find(category === "Top" ? isTopItem : isBottomItem);
  const acceptedLabels = weights.map((weight) => `${category} (${weight}):`);

  assert.equal(acceptedLabels.some((label) => item?.startsWith(label)), true, message);
}

function assertRemovedPhrasesAbsent(items) {
  REMOVED_PHRASES.forEach((phrase) => {
    assertExcludes(items, phrase, `${phrase} should not be emitted.`);
  });
}

function assertNoOption(items, option, message) {
  assert.equal(items.some((item) => optionGroup(item).includes(option)), false, message);
}

function isTopItem(item) {
  return TOP_LABEL_PATTERN.test(item);
}

function isBottomItem(item) {
  return BOTTOM_LABEL_PATTERN.test(item);
}

function hasAnyOption(item, options) {
  const group = optionGroup(item);

  return options.some((option) => group.includes(option));
}

function optionGroup(item) {
  return stripClothingLabel(item).split(" / ").map((option) => option.trim());
}

function stripClothingLabel(item) {
  return item.replace(new RegExp(`^(Top|Bottom) \\(${CLOTHING_WEIGHT_PATTERN}\\): `), "");
}

{
  const items = recommendationItems(makeWeather({
    temperature: 84,
    feelsLike: 84,
    high: 90,
    low: 78,
    weatherCode: 0
  }), 6);

  assertIncludes(items, "Top (Light): T-shirt / Polo Shirt / Tank Top", "Hot sunny dry day should include labelled light tops.");
  assertIncludes(items, "Bottom (Light): Shorts / Skirt / Cargo Pants", "Hot sunny dry day should include labelled light bottoms.");
  assertIncludes(items, "Sunglasses / Hat", "Hot sunny dry day should include sun protection.");
  assertHasTopAndBottom(items, "Hot sunny dry day");
  assertAccessoriesLabelFree(items);
  assertNoWideWeightRanges(items);
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

  assertIncludes(items, "Top (Light-Medium): T-shirt / Polo Shirt / Light Long-Sleeve", "Mild sunny day should include labelled light-medium tops.");
  assertIncludes(items, "Bottom (Light-Medium): Shorts / Cargo Pants / Jeans", "Mild sunny day should bridge shorts and pants.");
  assertIncludes(items, "Sunglasses / Hat", "Mild sunny daytime forecast should include sun protection.");
  assertAccessoriesLabelFree(items);
  assertNoWideWeightRanges(items);
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

  assertIncludes(items, "Top (Medium-Heavy): Light Long-Sleeve / Sweater / Light Jacket", "Cloudy windy 60s should bias toward labelled layers.");
  assertIncludes(items, "Bottom (Medium): Cargo Pants / Jeans / Pants", "Cloudy windy 60s should bias away from shorts.");
  assertNoOption(items, "Shorts", "Cloudy windy 60s should not suggest shorts.");
  assertNoWideWeightRanges(items);
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

  assertIncludes(items, "Top (Medium-Heavy): Light Long-Sleeve / Sweater / Light Jacket", "Cool rain should include normal labelled layer options.");
  assertIncludes(items, "Bottom (Medium): Cargo Pants / Jeans / Pants", "Cool rain should include normal labelled bottom options.");
  assertIncludes(items, "Umbrella / Rain Jacket", "Rain should use umbrella/rain jacket copy.");
  assertExcludes(items, "Sunglasses / Hat", "Rainy/cloudy-only forecast should not include sun protection.");
  assertAccessoriesLabelFree(items);
  assertRemovedPhrasesAbsent(items);
  assertNoWideWeightRanges(items);
}

{
  const items = recommendationItems(makeWeather({
    temperature: 42,
    feelsLike: 38,
    high: 45,
    low: 36,
    weatherCode: 3,
    windSpeed: 16
  }), 6);

  assertClothingWeightIn(items, "Top", ["Medium-Heavy", "Heavy"], "Cold forecast should use medium-heavy or heavy top guidance.");
  assertClothingWeightIn(items, "Bottom", ["Medium-Heavy", "Heavy"], "Cold forecast should use medium-heavy or heavy bottom guidance.");
  assertHasTopAndBottom(items, "Cold forecast");
  assertNoWideWeightRanges(items);
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

  assertIncludes(items, "Top (Heavy): Thermal Layer / Heavy Coat", "Snow/freezing should include serious labelled upper-body layers.");
  assertIncludes(items, "Bottom (Heavy): Thermal Pants / Sweatpants", "Snow/freezing should include serious labelled bottom layers.");
  assertIncludes(items, "Winter shoes / Snow boots", "Snow/freezing should include winter footwear.");
  assertNoOption(items, "Shorts", "Snow/freezing should not suggest shorts.");
  assertNoOption(items, "Tank Top", "Snow/freezing should not suggest tank tops.");
  assertNoOption(items, "Sandals", "Snow/freezing should not suggest sandals.");
  assertAccessoriesLabelFree(items);
  assertNoWideWeightRanges(items);
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
  assertNoWideWeightRanges(items);
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
    assertAccessoriesLabelFree(items);
    assertRemovedPhrasesAbsent(items);
    assertNoWideWeightRanges(items);
  });
}

console.log("Recommendation examples passed.");
