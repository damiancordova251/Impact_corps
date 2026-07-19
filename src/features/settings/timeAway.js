import { elements } from "../../dom/elements.js";
import { TIME_AWAY_STORAGE_KEY } from "../../constants/storageKeys.js";
import { formatHourLabel } from "../../utils/format.js";
import { t } from "../../i18n/i18n.js";

export const TIME_AWAY_OPTIONS = [3, 6, 9, 12];
export const DEFAULT_TIME_AWAY_HOURS = 6;
export const ONBOARDING_DEFAULT_TIME_AWAY_HOURS = 9;
const MAX_TIME_AWAY_HOURS = 12;
const LEGACY_MAX_TIME_AWAY_HOURS = 15;

// Time-away settings control the recommendation forecast window and stay
// separate from the reminder schedule (see features/settings/routineStart.js).
export function initializeTimeAwaySetting() {
  const timeAwayHours = getSavedTimeAwayHours();

  elements.timeAwayInput.value = String(timeAwayHours);
  elements.timeAwayValue.textContent = formatHourLabel(timeAwayHours);
  elements.reasonText.textContent = getChecklistPrompt(timeAwayHours);
}

// Attaches the slider's own listeners: "input" saves and updates the label
// live; "change" (fires once the user releases the slider) is exposed via
// onCommit so features/checklist/checklist.js can re-render without this
// module needing to import checklist.js back.
export function initTimeAwaySettingListeners({ onCommit } = {}) {
  elements.timeAwayInput.addEventListener("input", handleTimeAwayChange);
  elements.timeAwayInput.addEventListener("change", () => {
    onCommit?.();
  });
}

function handleTimeAwayChange() {
  const timeAwayHours = Number(elements.timeAwayInput.value);

  saveTimeAwayHours(timeAwayHours);
  elements.timeAwayValue.textContent = formatHourLabel(getSavedTimeAwayHours());
  elements.reasonText.textContent = getChecklistPrompt();
  elements.appStatus.textContent = t("checklist.checklistWindowSaved", { hours: formatHourLabel(getSavedTimeAwayHours()) });
}

export function getChecklistPrompt(timeAwayHours = getSavedTimeAwayHours()) {
  return t("checklist.prepared", { hours: timeAwayHours });
}

export function getSavedTimeAwayHours() {
  try {
    const storedValue = window.localStorage.getItem(TIME_AWAY_STORAGE_KEY);

    if (storedValue === null) {
      return DEFAULT_TIME_AWAY_HOURS;
    }

    const savedValue = Number(storedValue);

    if (isValidTimeAwayHours(savedValue)) {
      return savedValue;
    }

    if (savedValue === LEGACY_MAX_TIME_AWAY_HOURS) {
      window.localStorage.setItem(TIME_AWAY_STORAGE_KEY, String(MAX_TIME_AWAY_HOURS));
      return MAX_TIME_AWAY_HOURS;
    }

    window.localStorage.removeItem(TIME_AWAY_STORAGE_KEY);
  } catch (error) {
    return DEFAULT_TIME_AWAY_HOURS;
  }

  return DEFAULT_TIME_AWAY_HOURS;
}

export function saveTimeAwayHours(timeAwayHours) {
  if (!isValidTimeAwayHours(timeAwayHours)) {
    return;
  }

  try {
    window.localStorage.setItem(TIME_AWAY_STORAGE_KEY, String(timeAwayHours));
  } catch (error) {
    elements.appStatus.textContent = t("checklist.checklistWindowSaveFailed");
  }
}

export function hasStoredTimeAwayHours() {
  try {
    return window.localStorage.getItem(TIME_AWAY_STORAGE_KEY) !== null;
  } catch (error) {
    return false;
  }
}

export function isValidTimeAwayHours(value) {
  return Number.isInteger(value) && TIME_AWAY_OPTIONS.includes(value);
}
