// Weather code groups and thresholds define the checklist rules. Keeping them
// here makes it easier to tune recommendations without hunting through UI code.
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const SUNNY_CODES = new Set([0, 1, 2]);
const READY_CHECKLIST_TITLE = "Ready Checklist:";
const DEFAULT_FORECAST_WINDOW_HOURS = 12;
const DAYLIGHT_START_HOUR = 6;
const DAYLIGHT_END_HOUR = 20;
const MAX_CHECKLIST_ITEMS = 6;
const RAIN_PROBABILITY_THRESHOLD = 40;
const LONG_RAIN_WINDOW_HOURS = 9;
const LONG_WINDOW_RAIN_PROBABILITY_THRESHOLD = 35;
const MEASURABLE_RAIN_INCHES = 0.01;
const MEANINGFUL_RAIN_PROBABILITY = 60;
const MEANINGFUL_PRECIPITATION_INCHES = 0.03;
const WATERPROOF_RAIN_INCHES = 0.06;
const COLD_RAIN_WATERPROOF_INCHES = 0.03;
const SUSTAINED_RAIN_HOURS = 2;
const SUSTAINED_RAIN_PROBABILITY = 50;
const HEAVY_RAIN_CODES = new Set([63, 65, 80, 81, 82, 95, 96, 99]);
const VERY_COLD_TEMP = 32;
const COLD_TEMP = 45;
const COOL_TEMP = 58;
const SWEATSHIRT_TEMP = 66;
const WINDY_MPH = 24;
const COLD_WIND_MPH = 18;
const HOT_TEMP = 86;

// Selects the forecast hours that match how long the user expects to be away
// from home, falling back to the nearest hour when no hourly data is available.
export function getNextForecastWindow(weather, now = new Date(), durationHours = DEFAULT_FORECAST_WINDOW_HOURS) {
  const hourly = Array.isArray(weather.hourly) ? weather.hourly : [];
  const normalizedDurationHours = normalizeForecastWindowHours(durationHours);
  const start = new Date(now);
  const end = new Date(start);

  end.setHours(end.getHours() + normalizedDurationHours);

  const hours = hourly.filter((hour) => isWithinWindow(hour, start, end));
  const representativeHour = findNearestHour(hourly, start);

  return {
    title: READY_CHECKLIST_TITLE,
    start,
    end,
    durationHours: normalizedDurationHours,
    hours,
    representativeHour,
    usableHours: hours.length > 0 ? hours : [representativeHour].filter(Boolean),
    containsDaylight: hasDaylightHours(hours)
  };
}

// Summarizes the selected hourly window into a weather object shaped like the
// original forecast, so the recommendation rules can stay simple.
export function buildWindowWeather(weather, forecastWindow) {
  const windowHours = forecastWindow.usableHours ?? [];
  const representative = forecastWindow.representativeHour ?? weather.current ?? {};

  if (windowHours.length === 0) {
    return {
      ...weather,
      checklistTitle: READY_CHECKLIST_TITLE,
      checklistWindow: forecastWindow
    };
  }

  return {
    ...weather,
    checklistTitle: READY_CHECKLIST_TITLE,
    checklistWindow: forecastWindow,
    current: {
      ...weather.current,
      time: representative.time ?? weather.current.time,
      temperature: bestNumber(representative.temperature, weather.current.temperature),
      feelsLike: bestNumber(representative.feelsLike, weather.current.feelsLike, weather.current.temperature),
      precipitation: maxFromHours(windowHours, "precipitation", weather.current.precipitation),
      rain: maxFromHours(windowHours, "rain", weather.current.rain),
      showers: maxFromHours(windowHours, "showers", weather.current.showers),
      snowfall: maxFromHours(windowHours, "snowfall", weather.current.snowfall),
      weatherCode: bestNumber(representative.weatherCode, weather.current.weatherCode),
      windSpeed: bestNumber(representative.windSpeed, weather.current.windSpeed)
    },
    daily: {
      ...weather.daily,
      weatherCode: getWindowWeatherCode(windowHours, bestNumber(representative.weatherCode, weather.daily.weatherCode)),
      high: maxFromHours(windowHours, "temperature", weather.daily.high),
      low: minFromHours(windowHours, "temperature", weather.daily.low),
      precipitationProbability: maxFromHours(windowHours, "precipitationProbability", weather.daily.precipitationProbability),
      windMax: maxFromHours(windowHours, "windSpeed", weather.daily.windMax)
    }
  };
}

// Converts summarized weather conditions into checklist items, keeping each
// item scored so the most important recommendations appear first.
export function createRecommendation(windowWeather) {
  const durationHours = windowWeather.checklistWindow?.durationHours ?? DEFAULT_FORECAST_WINDOW_HOURS;
  const feelsLike = bestNumber(windowWeather.current.feelsLike, windowWeather.current.temperature, windowWeather.daily.high);
  const currentTemp = bestNumber(windowWeather.current.temperature, windowWeather.daily.high, feelsLike);
  const high = bestNumber(windowWeather.daily.high, currentTemp);
  const low = bestNumber(windowWeather.daily.low, feelsLike);
  const wind = Math.max(
    bestNumber(windowWeather.current.windSpeed, 0),
    bestNumber(windowWeather.daily.windMax, 0)
  );
  const precipProbability = bestNumber(windowWeather.daily.precipitationProbability, 0);
  const snowAmount = bestNumber(windowWeather.current.snowfall, 0);
  const rainProfile = getRainProfile(windowWeather, durationHours);
  const currentCode = windowWeather.current.weatherCode;
  const dailyCode = windowWeather.daily.weatherCode;
  const rainRisk = rainProfile.umbrellaRisk;
  const snowRisk = snowAmount > 0 || (precipProbability >= 35 && hasCode(SNOW_CODES, currentCode, dailyCode));
  const veryCold = feelsLike <= VERY_COLD_TEMP || low <= VERY_COLD_TEMP;
  const cold = feelsLike <= COLD_TEMP || low <= COLD_TEMP - 3;
  const cool = feelsLike <= COOL_TEMP || low <= COOL_TEMP - 4;
  const sweatshirtWeather = feelsLike <= SWEATSHIRT_TEMP || low <= SWEATSHIRT_TEMP - 6;
  const coldWind = cold && wind >= COLD_WIND_MPH;
  const windy = wind >= WINDY_MPH || coldWind;
  const hot = high >= HOT_TEMP || feelsLike >= HOT_TEMP - 4;
  const coldRainFootwear = cold
    && rainRisk
    && (rainProfile.meaningfulRain || rainProfile.maxPrecipitation >= COLD_RAIN_WATERPROOF_INCHES);
  const waterproofShoesRisk = snowRisk
    || (rainRisk && (rainProfile.heavyRain || rainProfile.sustainedRain || coldRainFootwear));

  const actions = [];
  const reasons = [];

  if (snowRisk) {
    addAction(actions, "Heavy coat", "Wear a heavy coat", 130);
    addAction(actions, "Gloves", "Wear gloves", 120);
    addAction(actions, "Beanie", "Wear a beanie", 115);
    addAction(actions, "Scarf", "Wear a scarf", 110);
    addAction(actions, "Rain boots or waterproof shoes", "Wear rain boots or waterproof shoes", 105);
    reasons.push("Snow is likely today.");
  } else if (veryCold) {
    addAction(actions, "Heavy coat", "Wear a heavy coat", 130);
    addAction(actions, "Gloves", "Wear gloves", 120);
    addAction(actions, "Beanie", "Wear a beanie", 115);
    addAction(actions, "Scarf", "Wear a scarf", 110);
    reasons.push(`It feels like ${formatTemp(feelsLike)}.`);
  } else if (cold) {
    addAction(actions, "Heavy coat", "Wear a heavy coat", 130);
    reasons.push(`It feels like ${formatTemp(feelsLike)}.`);

    if (coldWind || feelsLike <= 40 || low <= 38) {
      addAction(actions, "Gloves", "Wear gloves", 120);
      addAction(actions, "Beanie", "Wear a beanie", 115);
    }

    if (feelsLike <= 36 || low <= 34) {
      addAction(actions, "Scarf", "Wear a scarf", 110);
    }
  } else if (rainRisk && feelsLike <= 72) {
    addAction(actions, "Light jacket", "Wear a light jacket", 90);
    reasons.push(getRainReason(precipProbability, durationHours));
  } else if (cool) {
    addAction(actions, "Light jacket", "Wear a light jacket", 90);
    reasons.push(`It feels like ${formatTemp(feelsLike)}.`);
  } else if (sweatshirtWeather && !rainRisk) {
    addAction(actions, "Sweatshirt", "Wear a sweatshirt", 80);
    reasons.push(`It feels like ${formatTemp(feelsLike)}.`);
  } else if (hot) {
    addAction(actions, "Light clothing", "Wear light clothing", 70);
    reasons.push(`The high is ${formatTemp(high)}.`);
  }

  if (rainRisk && !snowRisk) {
    addAction(actions, "Umbrella", "Bring an umbrella", 125);
    reasons.push(getRainReason(precipProbability, durationHours));
  }

  if (waterproofShoesRisk) {
    addAction(actions, "Rain boots or waterproof shoes", "Wear rain boots or waterproof shoes", 105);
  }

  if (cold && !veryCold && !rainRisk && !snowRisk && (feelsLike <= 42 || low <= 40)) {
    addAction(actions, "Sweatpants", "Wear sweatpants", 75);
  }

  if (windy) {
    addAction(actions, "Wind-resistant layer", "Wear a wind-resistant layer", 95);
    reasons.push(`Wind may reach ${Math.round(wind)} mph.`);
  }

  if (shouldRecommendSunProtection(windowWeather, { hot, high, currentTemp, rainRisk, snowRisk })) {
    addAction(actions, "Sunglasses or hat", "Bring sunglasses or a hat", 65);
  }

  const uniqueActions = removeLayerConflicts(dedupeActions(actions)).sort((a, b) => b.priority - a.priority);

  if (uniqueActions.length === 0) {
    return {
      title: "No extra layer needed",
      reason: `It feels like ${formatTemp(feelsLike)}, with a high of ${formatTemp(high)}.`,
      checklistTitle: READY_CHECKLIST_TITLE,
      items: []
    };
  }

  return {
    title: combineActionLabels(uniqueActions.slice(0, 2)),
    reason: combineReasons(reasons, durationHours),
    checklistTitle: READY_CHECKLIST_TITLE,
    items: uniqueActions.slice(0, MAX_CHECKLIST_ITEMS).map((action) => action.item)
  };
}

// Rain uses a window-level profile so an umbrella can be recommended before
// later rain starts, while shoes stay reserved for heavier or sustained wetness.
function getRainProfile(weather, durationHours) {
  const hours = weather.checklistWindow?.usableHours ?? [];
  const probabilityThreshold = durationHours >= LONG_RAIN_WINDOW_HOURS
    ? LONG_WINDOW_RAIN_PROBABILITY_THRESHOLD
    : RAIN_PROBABILITY_THRESHOLD;
  const maxProbability = maxFromHours(hours, "precipitationProbability", weather.daily.precipitationProbability);
  const maxPrecipitation = Math.max(
    maxFromHours(hours, "precipitation", weather.current.precipitation),
    maxFromHours(hours, "rain", weather.current.rain),
    maxFromHours(hours, "showers", weather.current.showers)
  );
  const wetHours = hours.filter((hour) => isRainyHour(hour, probabilityThreshold));
  const hasRainCode = hasCode(RAIN_CODES, weather.current.weatherCode, weather.daily.weatherCode)
    || hours.some((hour) => hasCode(RAIN_CODES, hour.weatherCode));
  const heavyRain = maxPrecipitation >= WATERPROOF_RAIN_INCHES
    || hasCode(HEAVY_RAIN_CODES, weather.current.weatherCode, weather.daily.weatherCode)
    || hours.some((hour) => hasCode(HEAVY_RAIN_CODES, hour.weatherCode));
  const sustainedRain = wetHours.length >= SUSTAINED_RAIN_HOURS
    && (maxProbability >= SUSTAINED_RAIN_PROBABILITY || maxPrecipitation >= MEASURABLE_RAIN_INCHES);
  const umbrellaRisk = maxProbability >= probabilityThreshold
    || maxPrecipitation >= MEASURABLE_RAIN_INCHES
    || hasRainCode;
  const meaningfulRain = umbrellaRisk
    && (
      maxProbability >= MEANINGFUL_RAIN_PROBABILITY
      || maxPrecipitation >= MEANINGFUL_PRECIPITATION_INCHES
      || sustainedRain
    );

  return {
    umbrellaRisk,
    meaningfulRain,
    heavyRain,
    sustainedRain,
    maxProbability,
    maxPrecipitation
  };
}

function isRainyHour(hour, probabilityThreshold) {
  const hourPrecipitation = Math.max(
    bestNumber(hour.precipitation, 0),
    bestNumber(hour.rain, 0),
    bestNumber(hour.showers, 0)
  );

  return hourPrecipitation >= MEASURABLE_RAIN_INCHES
    || bestNumber(hour.precipitationProbability, 0) >= probabilityThreshold
    || hasCode(RAIN_CODES, hour.weatherCode);
}

// Sun protection is deliberately tied to daylight and sunny hours inside the
// selected checklist window, not the full day.
function shouldRecommendSunProtection(weather, conditions) {
  const daylightHours = getDaylightHours(weather.checklistWindow?.usableHours ?? []);
  const daylightWarmEnough = daylightHours.some((hour) => {
    const temperature = bestNumber(hour.feelsLike, hour.temperature);

    return temperature >= 70;
  });
  const daylightSunny = daylightHours.some((hour) => hasCode(SUNNY_CODES, hour.weatherCode));
  const warmEnough = conditions.hot || conditions.high >= 75 || conditions.currentTemp >= 70 || daylightWarmEnough;

  return daylightHours.length > 0
    && daylightSunny
    && warmEnough
    && !conditions.rainRisk
    && !conditions.snowRisk;
}

// Daylight helpers support the sunglasses/hat rule without depending on a
// separate sunrise API.
export function hasDaylightHours(hours) {
  return getDaylightHours(Array.isArray(hours) ? hours : []).length > 0;
}

function getDaylightHours(hours) {
  return hours.filter((hour) => {
    const forecastHour = parseForecastTime(hour.time).getHours();

    return forecastHour >= DAYLIGHT_START_HOUR && forecastHour < DAYLIGHT_END_HOUR;
  });
}

// Window and aggregation helpers turn a list of hourly objects into max/min
// values for rain, wind, temperature, and condition codes.
function isWithinWindow(hour, start, end) {
  const hourTime = parseForecastTime(hour.time);

  return hourTime >= start && hourTime < end;
}

function findNearestHour(hourly, targetTime) {
  return hourly.reduce((nearest, hour) => {
    const hourTime = parseForecastTime(hour.time);
    const distance = Math.abs(hourTime.getTime() - targetTime.getTime());

    if (!nearest || distance < nearest.distance) {
      return { hour, distance };
    }

    return nearest;
  }, null)?.hour ?? null;
}

function maxFromHours(hours, key, fallback) {
  const values = hours.map((hour) => hour[key]).filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return bestNumber(fallback, 0);
  }

  return Math.max(...values);
}

function minFromHours(hours, key, fallback) {
  const values = hours.map((hour) => hour[key]).filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return bestNumber(fallback, 0);
  }

  return Math.min(...values);
}

// Chooses the most important weather code in a window, preferring snow and rain
// over calmer conditions because those affect checklist items more.
function getWindowWeatherCode(hours, fallback) {
  const codes = hours.map((hour) => hour.weatherCode).filter((code) => Number.isFinite(code));

  return codes.find((code) => hasCode(SNOW_CODES, code))
    ?? codes.find((code) => hasCode(RAIN_CODES, code))
    ?? codes[0]
    ?? fallback;
}

function parseForecastTime(value) {
  return new Date(value);
}

function bestNumber(...values) {
  return values.find((value) => Number.isFinite(value)) ?? 0;
}

function hasCode(codeSet, ...codes) {
  return codes.some((code) => codeSet.has(Number(code)));
}

// Action helpers handle priority, duplicate removal, and clothing layer
// conflicts after all weather rules have had a chance to add suggestions.
function addAction(actions, item, label, priority) {
  actions.push({ item, label, priority });
}

function dedupeActions(actions) {
  const bestActions = new Map();

  actions.forEach((action) => {
    const current = bestActions.get(action.item);

    if (!current || action.priority > current.priority) {
      bestActions.set(action.item, action);
    }
  });

  return [...bestActions.values()];
}

function removeLayerConflicts(actions) {
  const items = new Set(actions.map((action) => action.item));

  return actions.filter((action) => {
    if (items.has("Heavy coat") && ["Light jacket", "Sweatshirt", "Light clothing"].includes(action.item)) {
      return false;
    }

    if (items.has("Light jacket") && ["Sweatshirt", "Light clothing"].includes(action.item)) {
      return false;
    }

    if (items.has("Sweatshirt") && action.item === "Light clothing") {
      return false;
    }

    return true;
  });
}

// Copy helpers keep the checklist title, reason, and rain explanation concise.
function combineActionLabels(actions) {
  if (actions.length === 1) {
    return actions[0].label;
  }

  return `${actions[0].label} and ${lowerFirst(actions[1].label)}`;
}

function combineReasons(reasons, durationHours) {
  const uniqueReasons = [...new Set(reasons)];

  if (uniqueReasons.length === 0) {
    return `The next ${durationHours} hours look manageable.`;
  }

  return uniqueReasons.slice(0, 2).join(" ");
}

function getRainReason(precipProbability, durationHours) {
  if (precipProbability > 0) {
    return `Rain risk is ${Math.round(precipProbability)}%.`;
  }

  return `Rain is in the next ${durationHours}-hour forecast.`;
}

function lowerFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function normalizeForecastWindowHours(value) {
  const durationHours = Number(value);

  return Number.isFinite(durationHours) && durationHours > 0
    ? durationHours
    : DEFAULT_FORECAST_WINDOW_HOURS;
}

// Shared temperature formatter for both recommendation copy and weather details.
export function formatTemp(value) {
  return `${Math.round(value)}\u00b0F`;
}
