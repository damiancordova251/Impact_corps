import { APP_CONFIG } from "../config.js";
import {
  INSTALLATION_ID_STORAGE_KEY,
  PENDING_REFERRAL_VISIT_STORAGE_KEY,
  REFERRAL_CODE_STORAGE_KEY
} from "../constants/storageKeys.js";
import { trackEvent } from "./analytics.js";

// Referral code/visit/conversion tracking: a share link embeds the sharer's
// own referral code as ?ref=CODE; landing on that link logs a visit, and
// completing onboarding later marks that visit converted. Everything here is
// best-effort — any failure falls back to sharing a plain (uncoded) link, or
// simply not recording a visit, never blocking the app.

// Fetches (and caches locally) this installation's own referral code, used to
// build its share link. Returns null on any failure so callers can fall back
// to a plain link.
export async function getOrFetchReferralCode() {
  const cached = readStorage(REFERRAL_CODE_STORAGE_KEY);

  if (cached) {
    return cached;
  }

  const installationId = getInstallationId();

  if (!installationId) {
    return null;
  }

  try {
    const response = await fetch(apiUrl("/api/referrals/code"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installationId })
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (typeof data.code !== "string") {
      return null;
    }

    writeStorage(REFERRAL_CODE_STORAGE_KEY, data.code);
    return data.code;
  } catch (error) {
    return null;
  }
}

// Parses `?ref=CODE` from the current URL, logs a visit once, strips the
// param from the visible URL, and remembers the visit locally so
// convertPendingReferralVisit() can mark it converted later.
export function recordReferralVisitIfNeeded() {
  const url = new URL(window.location.href);
  const referralCode = url.searchParams.get("ref");

  if (!referralCode || readStorage(PENDING_REFERRAL_VISIT_STORAGE_KEY)) {
    return;
  }

  url.searchParams.delete("ref");
  window.history.replaceState({}, "", url.toString());

  const installationId = getInstallationId();

  trackEvent("referral_link_visited", {});

  fetch(apiUrl("/api/referrals/visits"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ referralCode, installationId, shareChannel: null })
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      if (data?.id) {
        writeStorage(PENDING_REFERRAL_VISIT_STORAGE_KEY, JSON.stringify({ referralCode, visitId: data.id }));
      }
    })
    .catch(() => {});
}

// Called once onboarding completes: if this device arrived via a referral
// link, marks that visit as converted.
export function convertPendingReferralVisit() {
  const raw = readStorage(PENDING_REFERRAL_VISIT_STORAGE_KEY);

  if (!raw) {
    return;
  }

  removeStorage(PENDING_REFERRAL_VISIT_STORAGE_KEY);

  let pending;

  try {
    pending = JSON.parse(raw);
  } catch (error) {
    return;
  }

  const installationId = getInstallationId();

  if (!pending?.visitId || !pending?.referralCode || !installationId) {
    return;
  }

  fetch(apiUrl(`/api/referrals/visits/${pending.visitId}/convert`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ installationId, referralCode: pending.referralCode })
  }).catch(() => {});
}

function getInstallationId() {
  return readStorage(INSTALLATION_ID_STORAGE_KEY);
}

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    // Best-effort; worst case the value is refetched/relogged next time.
  }
}

function removeStorage(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    // Best-effort.
  }
}

function apiUrl(path) {
  const baseUrl = APP_CONFIG.pushApiBaseUrl || window.location.origin;

  return new URL(path, baseUrl).toString();
}
