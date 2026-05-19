const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const SUNNY_CODES = new Set([0, 1, 2]);
const READY_CHECKLIST_TITLE = "Ready Checklist:";
const FORECAST_WINDOW_HOURS = 12;
const DAYLIGHT_START_HOUR = 6;
const DAYLIGHT_END_HOUR = 20;
const MAX_CHECKLIST_ITEMS = 6;
const RAIN_PROBABILITY_THRESHOLD = 40;
const MEANINGFUL_RAIN_PROBABILITY = 75;
const MEANINGFUL_PRECIPITATION_INCHES = 0.05;
const VERY_COLD_TEMP = 32;
const COLD_TEMP = 45;
const COOL_TEMP = 58;
const SWEATSHIRT_TEMP = 66;
const WINDY_MPH = 24;
const COLD_WIND_MPH = 18;
const HOT_TEMP = 86;

export function getNextForecastWindow(weather, now = new Date()) {
  const hourly = Array.isArray(weather.hourly) ? weather.hourly : [];
  const start = new Date(now);
  const end = new Date(start);

  end.setHours(end.getHours() + FORECAST_WINDOW_HOURS);

  const hours = hourly.filter((hour) => isWithinWindow(hour, start, end));
  const representativeHour = findNearestHour(hourly, start);

  return {
    title: READY_CHECKLIST_TITLE,
    start,
    end,
    hours,
    representativeHour,
    usableHours: hours.length > 0 ? hours : [representativeHour].filter(Boolean),
    containsDaylight: hasDaylightHours(hours)
  };
}

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

export function createRecommendation(windowWeather) {
  const feelsLike = bestNumber(windowWeather.current.feelsLike, windowWeather.current.temperature, windowWeather.daily.high);
  const currentTemp = bestNumber(windowWeather.current.temperature, windowWeather.daily.high, feelsLike);
  const high = bestNumber(windowWeather.daily.high, currentTemp);
  const low = bestNumber(windowWeather.daily.low, feelsLike);
  const wind = Math.max(
    bestNumber(windowWeather.current.windSpeed, 0),
    bestNumber(windowWeather.daily.windMax, 0)
  );
  const precipProbability = bestNumber(windowWeather.daily.precipitationProbability, 0);
  const currentPrecip = Math.max(
    bestNumber(windowWeather.current.precipitation, 0),
    bestNumber(windowWeather.current.rain, 0),
    bestNumber(windowWeather.current.showers, 0),
    bestNumber(windowWeather.current.snowfall, 0)
  );
  const snowAmount = bestNumber(windowWeather.current.snowfall, 0);
  const currentCode = windowWeather.current.weatherCode;
  const dailyCode = windowWeather.daily.weatherCode;
  const rainRisk = precipProbability >= RAIN_PROBABILITY_THRESHOLD || currentPrecip > 0 || hasCode(RAIN_CODES, currentCode, dailyCode);
  const snowRisk = snowAmount > 0 || (precipProbability >= 35 && hasCode(SNOW_CODES, currentCode, dailyCode));
  const meaningfulRain = rainRisk && (precipProbability >= MEANINGFUL_RAIN_PROBABILITY || currentPrecip >= MEANINGFUL_PRECIPITATION_INCHES);
  const veryCold = feelsLike <= VERY_COLD_TEMP || low <= VERY_COLD_TEMP;
  const cold = feelsLike <= COLD_TEMP || low <= COLD_TEMP - 3;
  const cool = feelsLike <= COOL_TEMP || low <= COOL_TEMP - 4;
  const sweatshirtWeather = feelsLike <= SWEATSHIRT_TEMP || low <= SWEATSHIRT_TEMP - 6;
  const coldWind = cold && wind >= COLD_WIND_MPH;
  const windy = wind >= WINDY_MPH || coldWind;
  const hot = high >= HOT_TEMP || feelsLike >= HOT_TEMP - 4;

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
    reasons.push(getRainReason(precipProbability));
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
    reasons.push(getRainReason(precipProbability));
  }

  if (snowRisk || (rainRisk && (cold || meaningfulRain))) {
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
    reason: combineReasons(reasons),
    checklistTitle: READY_CHECKLIST_TITLE,
    items: uniqueActions.slice(0, MAX_CHECKLIST_ITEMS).map((action) => action.item)
  };
}

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

export function hasDaylightHours(hours) {
  return getDaylightHours(Array.isArray(hours) ? hours : []).length > 0;
}

function getDaylightHours(hours) {
  return hours.filter((hour) => {
    const forecastHour = parseForecastTime(hour.time).getHours();

    return forecastHour >= DAYLIGHT_START_HOUR && forecastHour < DAYLIGHT_END_HOUR;
  });
}

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

function combineActionLabels(actions) {
  if (actions.length === 1) {
    return actions[0].label;
  }

  return `${actions[0].label} and ${lowerFirst(actions[1].label)}`;
}

function combineReasons(reasons) {
  const uniqueReasons = [...new Set(reasons)];

  if (uniqueReasons.length === 0) {
    return "The next 12 hours look manageable.";
  }

  return uniqueReasons.slice(0, 2).join(" ");
}

function getRainReason(precipProbability) {
  if (precipProbability > 0) {
    return `Rain risk is ${Math.round(precipProbability)}%.`;
  }

  return "Rain is in the next 12-hour forecast.";
}

function lowerFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export function formatTemp(value) {
  return `${Math.round(value)}\u00b0F`;
}
