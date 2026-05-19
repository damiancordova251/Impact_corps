import crypto from "node:crypto";

const subscriptions = new Map();

export function upsertSubscription(input) {
  const subscription = input.subscription;
  const id = createSubscriptionId(subscription.endpoint);
  const existing = subscriptions.get(id);
  const now = new Date().toISOString();

  const record = {
    id,
    subscription,
    routineStartMinutes: input.routineStartMinutes,
    timezone: input.timezone,
    location: normalizeLocation(input.location),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastSentDate: existing?.lastSentDate ?? null
  };

  subscriptions.set(id, record);

  return record;
}

export function getSubscription(id) {
  return subscriptions.get(id) ?? null;
}

export function getAllSubscriptions() {
  return [...subscriptions.values()];
}

export function markReminderSent(id, localDate) {
  const record = subscriptions.get(id);

  if (!record) {
    return;
  }

  subscriptions.set(id, {
    ...record,
    lastSentDate: localDate,
    updatedAt: new Date().toISOString()
  });
}

export function removeSubscription(id) {
  subscriptions.delete(id);
}

export function toPublicSubscription(record) {
  return {
    id: record.id,
    routineStartMinutes: record.routineStartMinutes,
    timezone: record.timezone,
    hasLocation: Boolean(record.location),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastSentDate: record.lastSentDate
  };
}

function createSubscriptionId(endpoint) {
  return crypto
    .createHash("sha256")
    .update(endpoint)
    .digest("hex")
    .slice(0, 20);
}

function normalizeLocation(location) {
  if (!location || typeof location !== "object") {
    return null;
  }

  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const accuracy = Number(location.accuracy);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) ? accuracy : null
  };
}
