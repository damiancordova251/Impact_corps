const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

export function createRecommendation(weather) {
  const feelsLike = bestNumber(weather.current.feelsLike, weather.current.temperature, weather.daily.high);
  const currentTemp = bestNumber(weather.current.temperature, weather.daily.high, feelsLike);
  const high = bestNumber(weather.daily.high, currentTemp);
  const low = bestNumber(weather.daily.low, feelsLike);
  const wind = Math.max(
    bestNumber(weather.current.windSpeed, 0),
    bestNumber(weather.daily.windMax, 0)
  );
  const precipProbability = bestNumber(weather.daily.precipitationProbability, 0);
  const currentPrecip = Math.max(
    bestNumber(weather.current.precipitation, 0),
    bestNumber(weather.current.rain, 0),
    bestNumber(weather.current.showers, 0),
    bestNumber(weather.current.snowfall, 0)
  );
  const snowAmount = bestNumber(weather.current.snowfall, 0);
  const currentCode = weather.current.weatherCode;
  const dailyCode = weather.daily.weatherCode;
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
      items: []
    };
  }

  return {
    title: combineActionLabels(uniqueActions.slice(0, 2)),
    reason: combineReasons(reasons),
    items: uniqueActions.slice(0, 3).map((action) => action.item)
  };
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
