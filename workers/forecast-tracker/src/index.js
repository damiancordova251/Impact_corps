// Forecast-accuracy data pipeline. Snapshots Open-Meteo predictions for the
// distinct coarse locations currently in use (reusing push_subscriptions'
// coarse_latitude/coarse_longitude — no new location collection), then later
// records the actual conditions for predictions whose target_time has
// passed, computing simple error metrics.
//
// This is a data-collection and evaluation pipeline ONLY. It never writes to
// domain/recommendation.js or changes production behavior — proposed
// adjustments belong in model_change_proposals for manual review (see
// supabase/migrations/0007_forecast_accuracy.sql).
const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";
const DEFAULT_PUSH_SUBSCRIPTIONS_TABLE = "push_subscriptions";
const DEFAULT_FORECAST_PREDICTIONS_TABLE = "forecast_predictions";
const DEFAULT_FORECAST_ACTUALS_TABLE = "forecast_actuals";
const DEFAULT_HORIZON_HOURS = [6, 12, 24];
const MAX_DUE_PREDICTIONS_PER_RUN = 200;

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runForecastTracker({ env, now: getScheduledDate(controller) }));
  }
};

export async function runForecastTracker({ env, now = new Date() }) {
  assertConfigured(env);

  const dryRun = isEnabled(env.DRY_RUN);
  const horizonHours = getHorizonHours(env.FORECAST_HORIZON_HOURS);
  const summary = { locationsChecked: 0, predictionsSnapshotted: 0, actualsRecorded: 0, dryRun };

  const locations = await getActiveCoarseLocations(env);
  summary.locationsChecked = locations.length;

  await Promise.all(locations.map(async (location) => {
    const inserted = await snapshotPredictions(location, horizonHours, env, now, dryRun);
    summary.predictionsSnapshotted += inserted;
  }));

  summary.actualsRecorded = await recordDueActuals(env, now, dryRun);

  console.log("Forecast tracker summary", summary);
  return summary;
}

// --- Predictions -----------------------------------------------------------

async function snapshotPredictions(location, horizonHours, env, now, dryRun) {
  let hourly;

  try {
    hourly = await fetchHourlyForecast(location.latitude, location.longitude);
  } catch (error) {
    console.error(`Forecast fetch failed for ${location.latitude},${location.longitude}.`, error);
    return 0;
  }

  const locationBucket = toLocationBucket(location.latitude, location.longitude);
  let inserted = 0;

  for (const horizon of horizonHours) {
    const targetTime = new Date(now.getTime() + horizon * 60 * 60 * 1000);
    const hour = findNearestHour(hourly, targetTime);

    if (!hour) {
      continue;
    }

    const row = {
      location_bucket: locationBucket,
      coarse_latitude: location.latitude,
      coarse_longitude: location.longitude,
      provider: "open-meteo",
      provider_metadata: { source: "workers/forecast-tracker" },
      forecast_created_at: now.toISOString(),
      target_time: targetTime.toISOString(),
      horizon_hours: horizon,
      predicted_temp: hour.temperature,
      predicted_feels_like: hour.feelsLike,
      predicted_precip_probability: hour.precipitationProbability,
      predicted_precip_amount: hour.precipitation,
      predicted_condition_code: hour.conditionCode,
      predicted_wind_speed: hour.windSpeed,
      predicted_humidity: hour.humidity
    };

    if (dryRun) {
      console.log(`Dry run: would snapshot prediction for ${locationBucket} at +${horizon}h.`);
    } else {
      await supabaseFetch(env, {
        path: forecastPredictionsPath(env),
        init: {
          method: "POST",
          headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify(row)
        }
      });
    }

    inserted += 1;
  }

  return inserted;
}

// --- Actuals -----------------------------------------------------------------

async function recordDueActuals(env, now, dryRun) {
  const duePredictions = await getDuePredictionsNeedingActuals(env, now);
  const byBucket = groupBy(duePredictions, (prediction) => prediction.location_bucket);
  let recorded = 0;

  for (const [, predictions] of byBucket) {
    const { coarse_latitude: latitude, coarse_longitude: longitude } = predictions[0];
    let current;

    try {
      current = await fetchCurrentConditions(latitude, longitude);
    } catch (error) {
      console.error(`Current-conditions fetch failed for ${latitude},${longitude}.`, error);
      continue;
    }

    for (const prediction of predictions) {
      const row = buildActualRow(prediction, current, now);

      if (dryRun) {
        console.log(`Dry run: would record actual for prediction ${prediction.id}.`);
      } else {
        await supabaseFetch(env, {
          path: forecastActualsPath(env),
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify(row)
          }
        });
      }

      recorded += 1;
    }
  }

  return recorded;
}

export function buildActualRow(prediction, current, now) {
  const tempError = errorOf(prediction.predicted_temp, current.temperature);
  const feelsLikeError = errorOf(prediction.predicted_feels_like, current.feelsLike);
  const precipProbabilityError = errorOf(prediction.predicted_precip_probability, current.precipitationProbability);
  const conditionMatch = Number.isFinite(prediction.predicted_condition_code) && Number.isFinite(current.conditionCode)
    ? prediction.predicted_condition_code === current.conditionCode
    : null;

  return {
    prediction_id: prediction.id,
    observed_temp: current.temperature,
    observed_feels_like: current.feelsLike,
    observed_precip_probability: current.precipitationProbability,
    observed_precip_amount: current.precipitation,
    observed_condition_code: current.conditionCode,
    observed_wind_speed: current.windSpeed,
    observed_humidity: current.humidity,
    temp_error: tempError,
    feels_like_error: feelsLikeError,
    precip_probability_error: precipProbabilityError,
    condition_match: conditionMatch,
    // A rough, explainable heuristic for "would this have changed the
    // checklist": a large miss on temperature or a completely wrong
    // rain/no-rain call. This is intentionally simple — it feeds
    // model_change_proposals for a human to interpret, not a scoring
    // function the app trusts blindly.
    would_change_recommendation: Boolean(
      (Number.isFinite(tempError) && Math.abs(tempError) >= 10)
      || (Number.isFinite(precipProbabilityError) && Math.abs(precipProbabilityError) >= 35)
    ),
    recorded_at: now.toISOString()
  };
}

export function errorOf(predicted, observed) {
  if (!Number.isFinite(predicted) || !Number.isFinite(observed)) {
    return null;
  }

  return Math.round((observed - predicted) * 10) / 10;
}

// --- Open-Meteo fetch helpers ------------------------------------------------

async function fetchHourlyForecast(latitude, longitude) {
  const url = new URL(OPEN_METEO_URL);

  url.search = new URLSearchParams({
    latitude: latitude.toFixed(1),
    longitude: longitude.toFixed(1),
    hourly: "temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,relative_humidity_2m",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "auto",
    forecast_days: "2"
  }).toString();

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Open-Meteo hourly request failed with ${response.status}.`);
  }

  const data = await response.json();
  const hourly = data.hourly ?? {};
  const times = Array.isArray(hourly.time) ? hourly.time : [];

  return times.map((time, index) => ({
    time: new Date(time),
    temperature: toNumber(hourly.temperature_2m?.[index]),
    feelsLike: toNumber(hourly.apparent_temperature?.[index]),
    precipitationProbability: toNumber(hourly.precipitation_probability?.[index]),
    precipitation: toNumber(hourly.precipitation?.[index]),
    conditionCode: toNumber(hourly.weather_code?.[index]),
    windSpeed: toNumber(hourly.wind_speed_10m?.[index]),
    humidity: toNumber(hourly.relative_humidity_2m?.[index])
  }));
}

async function fetchCurrentConditions(latitude, longitude) {
  const url = new URL(OPEN_METEO_URL);

  url.search = new URLSearchParams({
    latitude: Number(latitude).toFixed(1),
    longitude: Number(longitude).toFixed(1),
    current: "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,relative_humidity_2m",
    daily: "precipitation_probability_max",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "auto",
    forecast_days: "1"
  }).toString();

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Open-Meteo current request failed with ${response.status}.`);
  }

  const data = await response.json();

  return {
    temperature: toNumber(data.current?.temperature_2m),
    feelsLike: toNumber(data.current?.apparent_temperature),
    precipitation: toNumber(data.current?.precipitation),
    precipitationProbability: toNumber(data.daily?.precipitation_probability_max?.[0]),
    conditionCode: toNumber(data.current?.weather_code),
    windSpeed: toNumber(data.current?.wind_speed_10m),
    humidity: toNumber(data.current?.relative_humidity_2m)
  };
}

export function findNearestHour(hourly, targetTime) {
  return hourly.reduce((nearest, hour) => {
    const distance = Math.abs(hour.time.getTime() - targetTime.getTime());

    if (!nearest || distance < nearest.distance) {
      return { hour, distance };
    }

    return nearest;
  }, null)?.hour ?? null;
}

// --- Supabase helpers ---------------------------------------------------------

async function getActiveCoarseLocations(env) {
  const response = await supabaseFetch(env, {
    path: pushSubscriptionsPath(env),
    searchParams: new URLSearchParams({
      select: "coarse_latitude,coarse_longitude",
      coarse_latitude: "not.is.null",
      coarse_longitude: "not.is.null"
    })
  });
  const rows = await response.json();
  const seen = new Set();
  const locations = [];

  rows.forEach((row) => {
    const key = `${row.coarse_latitude},${row.coarse_longitude}`;

    if (!seen.has(key)) {
      seen.add(key);
      locations.push({ latitude: Number(row.coarse_latitude), longitude: Number(row.coarse_longitude) });
    }
  });

  return locations;
}

async function getDuePredictionsNeedingActuals(env, now) {
  const response = await supabaseFetch(env, {
    path: forecastPredictionsPath(env),
    searchParams: new URLSearchParams({
      select: "id,location_bucket,coarse_latitude,coarse_longitude,predicted_temp,predicted_feels_like,predicted_precip_probability,predicted_condition_code,forecast_actuals(id)",
      target_time: `lte.${now.toISOString()}`,
      order: "target_time.asc",
      limit: String(MAX_DUE_PREDICTIONS_PER_RUN)
    })
  });
  const rows = await response.json();

  return rows.filter((row) => !Array.isArray(row.forecast_actuals) || row.forecast_actuals.length === 0);
}

async function supabaseFetch(env, { path, searchParams = new URLSearchParams(), init = {} }) {
  const url = new URL(`/rest/v1/${path}`, env.SUPABASE_URL);

  searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      ...init.headers
    }
  });

  if (!response.ok) {
    throw new Error(`Supabase request failed with ${response.status}: ${await response.text()}`);
  }

  return response;
}

function pushSubscriptionsPath(env) {
  return encodeURIComponent(env.SUPABASE_PUSH_SUBSCRIPTIONS_TABLE || DEFAULT_PUSH_SUBSCRIPTIONS_TABLE);
}

function forecastPredictionsPath(env) {
  return encodeURIComponent(env.SUPABASE_FORECAST_PREDICTIONS_TABLE || DEFAULT_FORECAST_PREDICTIONS_TABLE);
}

function forecastActualsPath(env) {
  return encodeURIComponent(env.SUPABASE_FORECAST_ACTUALS_TABLE || DEFAULT_FORECAST_ACTUALS_TABLE);
}

// --- Small utilities -----------------------------------------------------------

export function toLocationBucket(latitude, longitude) {
  return `${latitude.toFixed(1)},${longitude.toFixed(1)}`;
}

export function groupBy(items, keyFn) {
  const groups = new Map();

  items.forEach((item) => {
    const key = keyFn(item);
    const existing = groups.get(key) ?? [];

    existing.push(item);
    groups.set(key, existing);
  });

  return groups;
}

export function toNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

export function getHorizonHours(value) {
  const parsed = String(value ?? "")
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((hours) => Number.isFinite(hours) && hours > 0);

  return parsed.length > 0 ? parsed : DEFAULT_HORIZON_HOURS;
}

function getScheduledDate(controller) {
  const scheduledTime = Number(controller?.scheduledTime);

  if (!Number.isFinite(scheduledTime)) {
    return new Date();
  }

  return new Date(scheduledTime < 10_000_000_000 ? scheduledTime * 1000 : scheduledTime);
}

export function isEnabled(value) {
  return String(value).toLowerCase() === "true";
}

function assertConfigured(env) {
  ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].forEach((key) => {
    if (!env[key]) {
      throw new Error(`${key} is required.`);
    }
  });
}
