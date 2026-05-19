const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const PERIOD_PIVOT_MINUTES = 60;
const PERIOD_LENGTH_HOURS = 6;
const CHECKLIST_PERIODS = [
  { key: "midnight", label: "Midnight", hour: 0 },
  { key: "morning", label: "Morning", hour: 6 },
  { key: "afternoon", label: "Afternoon", hour: 12 },
  { key: "evening", label: "Evening", hour: 18 }
];

export function getActivePeriod(now = new Date()) {
  const starts = getPeriodStartsAround(now);
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
  const rainRisk = precipProbability >= 40 || currentPrecip > 0 || hasCode(RAIN_CODES, currentCode, dailyCode);
  const snowRisk = snowAmount > 0 || (precipProbability >= 35 && hasCode(SNOW_CODES, currentCode, dailyCode));

  const actions = [];
  const reasons = [];

  if (snowRisk) {
    actions.push({ label: "Wear a warm coat and boots", item: "Warm coat and boots", priority: 110 });
    reasons.push("Snow is likely today.");
  } else if (rainRisk) {
    actions.push({ label: "Bring an umbrella", item: "Umbrella", priority: 100 });
    reasons.push(getRainReason(precipProbability));
  }

  if (feelsLike <= 34 || low <= 34) {
    actions.push({ label: "Wear a warm coat", item: "Warm coat", priority: 90 });
    reasons.push(`It feels like ${formatTemp(feelsLike)}.`);
  } else if (feelsLike <= 48 || low <= 45) {
    actions.push({ label: "Wear a jacket", item: "Jacket", priority: 80 });
    reasons.push(`It feels like ${formatTemp(feelsLike)}.`);
  } else if (feelsLike <= 61 || low <= 55) {
    actions.push({ label: "Wear a light jacket", item: "Light jacket", priority: 70 });
    reasons.push(`It feels like ${formatTemp(feelsLike)}.`);
  }

  if (wind >= 24) {
    actions.push({ label: "Wear a wind-resistant layer", item: "Wind layer", priority: 60 });
    reasons.push(`Wind may reach ${Math.round(wind)} mph.`);
  }

  if (high >= 88 && feelsLike >= 72 && actions.length === 0) {
    actions.push({ label: "Wear light clothing", item: "Light clothing", priority: 50 });
    reasons.push(`The high is ${formatTemp(high)}.`);
  }

  const uniqueActions = dedupeActions(actions).sort((a, b) => b.priority - a.priority);

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
    items: uniqueActions.slice(0, 3).map((action) => action.item)
  };
}

function getPeriodStartsAround(now) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const starts = [];

  for (let dayOffset = -1; dayOffset <= 1; dayOffset += 1) {
    CHECKLIST_PERIODS.forEach((period) => {
      const start = new Date(dayStart);
      start.setDate(dayStart.getDate() + dayOffset);
      start.setHours(period.hour, 0, 0, 0);
      starts.push({ ...period, start });
    });
  }

  return starts.sort((a, b) => a.start - b.start);
}

function withPeriodEnd(period) {
  const end = new Date(period.start);
  end.setHours(end.getHours() + PERIOD_LENGTH_HOURS);

  return { ...period, end };
}

function getChecklistTitle(period) {
  return `${period?.label ?? "Morning"} Checklist:`;
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

function dedupeActions(actions) {
  const seen = new Set();
  return actions.filter((action) => {
    if (seen.has(action.item)) {
      return false;
    }

    seen.add(action.item);
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
