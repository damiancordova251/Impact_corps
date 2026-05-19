const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const SUNNY_CODES = new Set([0, 1, 2]);
const MINUTES_PER_DAY = 24 * 60;
const PERIOD_PIVOT_MINUTES = 60;
const PERIOD_LENGTH_MINUTES = 8 * 60;
export const DEFAULT_ROUTINE_START_MINUTES = 6 * 60;
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
const CHECKLIST_PERIODS = [
  { key: "morning", label: "Morning", anchorMinute: 6 * 60 },
  { key: "afternoon", label: "Afternoon", anchorMinute: 14 * 60 },
  { key: "night", label: "Night", anchorMinute: 22 * 60 }
];

export function getActivePeriod(now = new Date(), routineStartMinutes = DEFAULT_ROUTINE_START_MINUTES) {
  const starts = getPeriodStartsAround(now, routineStartMinutes);
  const current = [...starts].reverse().find((period) => period.start <= now) ?? starts[0];
  const next = starts.find((period) => period.start > now);

  if (next) {
    const minutesToNext = (next.start.getTime() - now.getTime()) / 60000;

    if (minutesToNext <= PERIOD_PIVOT_MINUTES) {
      return withPeriodEnd(next);
    }
  }

  return withPeriodEnd(current);
}

export function buildPeriodSchedule(routineStartMinutes = DEFAULT_ROUTINE_START_MINUTES) {
  const startMinute = normalizeMinute(routineStartMinutes);
  const anchorPeriod = getClosestAnchorPeriod(startMinute);
  const shiftMinutes = getSignedMinuteDelta(startMinute, anchorPeriod.anchorMinute);

  return CHECKLIST_PERIODS.map((period) => ({
    ...period,
    startMinute: normalizeMinute(period.anchorMinute + shiftMinutes)
  }));
}

export function getClosestAnchorPeriod(routineStartMinutes = DEFAULT_ROUTINE_START_MINUTES) {
  const startMinute = normalizeMinute(routineStartMinutes);

  return CHECKLIST_PERIODS.reduce((closest, period) => {
    const delta = getSignedMinuteDelta(startMinute, period.anchorMinute);
    const distance = Math.abs(delta);

    if (!closest || distance < closest.distance || (distance === closest.distance && delta >= 0 && closest.delta < 0)) {
      return { period, distance, delta };
    }

    return closest;
  }, null).period;
}

export function getPeriodForecast(weather, period) {
  const hourly = Array.isArray(weather.hourly) ? weather.hourly : [];
  const hours = hourly.filter((hour) => isWithinPeriod(hour, period));
  const representativeHour = findNearestHour(hourly, period.start);

  return {
    period,
    hours,
    representativeHour,
    usableHours: hours.length > 0 ? hours : [representativeHour].filter(Boolean)
  };
}

export function buildPeriodWeather(weather, periodForecast) {
  const periodHours = periodForecast.usableHours ?? [];
  const representative = periodForecast.representativeHour ?? weather.current ?? {};

  if (periodHours.length === 0) {
    return {
      ...weather,
      checklistPeriod: periodForecast.period,
      checklistForecast: periodForecast
    };
  }

  return {
    ...weather,
    checklistPeriod: periodForecast.period,
    checklistForecast: periodForecast,
    current: {
      ...weather.current,
      time: representative.time ?? weather.current.time,
      temperature: bestNumber(representative.temperature, weather.current.temperature),
      feelsLike: bestNumber(representative.feelsLike, weather.current.feelsLike, weather.current.temperature),
      precipitation: maxFromHours(periodHours, "precipitation", weather.current.precipitation),
      rain: maxFromHours(periodHours, "rain", weather.current.rain),
      showers: maxFromHours(periodHours, "showers", weather.current.showers),
      snowfall: maxFromHours(periodHours, "snowfall", weather.current.snowfall),
      weatherCode: bestNumber(representative.weatherCode, weather.current.weatherCode),
      windSpeed: bestNumber(representative.windSpeed, weather.current.windSpeed)
    },
    daily: {
      ...weather.daily,
      weatherCode: getPeriodWeatherCode(periodHours, bestNumber(representative.weatherCode, weather.daily.weatherCode)),
      high: maxFromHours(periodHours, "temperature", weather.daily.high),
      low: minFromHours(periodHours, "temperature", weather.daily.low),
      precipitationProbability: maxFromHours(periodHours, "precipitationProbability", weather.daily.precipitationProbability),
      windMax: maxFromHours(periodHours, "windSpeed", weather.daily.windMax)
    }
  };
}

export function createRecommendation(periodWeather) {
  const period = periodWeather.checklistPeriod;
  const feelsLike = bestNumber(periodWeather.current.feelsLike, periodWeather.current.temperature, periodWeather.daily.high);
  const currentTemp = bestNumber(periodWeather.current.temperature, periodWeather.daily.high, feelsLike);
  const high = bestNumber(periodWeather.daily.high, currentTemp);
  const low = bestNumber(periodWeather.daily.low, feelsLike);
  const wind = Math.max(
    bestNumber(periodWeather.current.windSpeed, 0),
    bestNumber(periodWeather.daily.windMax, 0)
  );
  const precipProbability = bestNumber(periodWeather.daily.precipitationProbability, 0);
  const currentPrecip = Math.max(
    bestNumber(periodWeather.current.precipitation, 0),
    bestNumber(periodWeather.current.rain, 0),
    bestNumber(periodWeather.current.showers, 0),
    bestNumber(periodWeather.current.snowfall, 0)
  );
  const snowAmount = bestNumber(periodWeather.current.snowfall, 0);
  const currentCode = periodWeather.current.weatherCode;
  const dailyCode = periodWeather.daily.weatherCode;
  const rainRisk = precipProbability >= RAIN_PROBABILITY_THRESHOLD || currentPrecip > 0 || hasCode(RAIN_CODES, currentCode, dailyCode);
  const snowRisk = snowAmount > 0 || (precipProbability >= 35 && hasCode(SNOW_CODES, currentCode, dailyCode));
  const meaningfulRain = rainRisk && (precipProbability >= MEANINGFUL_RAIN_PROBABILITY || currentPrecip >= MEANINGFUL_PRECIPITATION_INCHES);
  const sunny = hasCode(SUNNY_CODES, currentCode, dailyCode);
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

  if (shouldRecommendSunProtection(periodWeather, period, { sunny, hot, high, currentTemp, rainRisk, snowRisk })) {
    addAction(actions, "Sunglasses or hat", "Bring sunglasses or a hat", 65);
  }

  const uniqueActions = removeLayerConflicts(dedupeActions(actions)).sort((a, b) => b.priority - a.priority);

  if (uniqueActions.length === 0) {
    return {
      title: "No extra layer needed",
      reason: `It feels like ${formatTemp(feelsLike)}, with a high of ${formatTemp(high)}.`,
      period,
      checklistTitle: getChecklistTitle(period),
      items: []
    };
  }

  return {
    title: combineActionLabels(uniqueActions.slice(0, 2)),
    reason: combineReasons(reasons),
    period,
    checklistTitle: getChecklistTitle(period),
    items: uniqueActions.slice(0, MAX_CHECKLIST_ITEMS).map((action) => action.item)
  };
}

function getPeriodStartsAround(now, routineStartMinutes) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const starts = [];
  const schedule = buildPeriodSchedule(routineStartMinutes);

  for (let dayOffset = -1; dayOffset <= 2; dayOffset += 1) {
    schedule.forEach((period) => {
      const start = new Date(dayStart);
      start.setDate(dayStart.getDate() + dayOffset);
      start.setMinutes(period.startMinute);
      starts.push({ ...period, start });
    });
  }

  return starts.sort((a, b) => a.start - b.start);
}

function withPeriodEnd(period) {
  const end = new Date(period.start);
  end.setMinutes(end.getMinutes() + PERIOD_LENGTH_MINUTES);

  return { ...period, end };
}

function normalizeMinute(minutes) {
  return ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function getSignedMinuteDelta(targetMinute, anchorMinute) {
  const delta = normalizeMinute(targetMinute - anchorMinute);

  if (delta > MINUTES_PER_DAY / 2) {
    return delta - MINUTES_PER_DAY;
  }

  return delta;
}

function getChecklistTitle(period) {
  return `${period?.label ?? "Morning"} Checklist:`;
}

function shouldRecommendSunProtection(weather, period, conditions) {
  const warmEnough = conditions.hot || conditions.high >= 75 || conditions.currentTemp >= 70;

  return isDaylightPeriod(period)
    && conditions.sunny
    && warmEnough
    && !conditions.rainRisk
    && !conditions.snowRisk
    && !isFullyOvernightForecast(weather);
}

function isDaylightPeriod(period) {
  return ["morning", "afternoon"].includes(period?.key);
}

function isFullyOvernightForecast(weather) {
  const hours = weather.checklistForecast?.usableHours ?? [];

  if (hours.length === 0) {
    return weather.checklistPeriod?.key === "night";
  }

  return hours.every((hour) => {
    const forecastHour = parseForecastTime(hour.time).getHours();

    return forecastHour >= 0 && forecastHour < 6;
  });
}

function isWithinPeriod(hour, period) {
  const hourTime = parseForecastTime(hour.time);

  return hourTime >= period.start && hourTime < period.end;
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

function getPeriodWeatherCode(hours, fallback) {
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
    return "Today's weather looks manageable.";
  }

  return uniqueReasons.slice(0, 2).join(" ");
}

function getRainReason(precipProbability) {
  if (precipProbability > 0) {
    return `Rain risk is ${Math.round(precipProbability)}%.`;
  }

  return "Rain is in today's forecast.";
}

function lowerFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export function formatTemp(value) {
  return `${Math.round(value)}\u00b0F`;
}
