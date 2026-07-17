import { elements } from "../../dom/elements.js";
import {
  LEGACY_WAKE_TIME_STORAGE_KEY,
  ROUTINE_START_STORAGE_KEY
} from "../../constants/storageKeys.js";
import { formatTimeLabel } from "../../utils/format.js";

export const ROUTINE_START_STEP_MINUTES = 30;
export const DEFAULT_ROUTINE_START_MINUTES = 6 * 60;

// Routine start settings control when reminders are sent, not how much
// forecast data the checklist uses (see features/settings/timeAway.js).
export function initializeRoutineStartSetting() {
  const routineStartTime = getSavedRoutineStartTime();

  elements.routineStartInput.value = String(routineStartTime / ROUTINE_START_STEP_MINUTES);
  elements.routineStartValue.textContent = formatTimeLabel(routineStartTime);
}

// onInput/onCommit are supplied by the app bootstrap (wired to
// features/notifications/notificationSettings.js) so this module never has to
// import the notifications feature directly, which would create a cycle since
// that feature already imports getSavedRoutineStartTime from here.
export function initRoutineStartSettingListeners({ onInput, onCommit } = {}) {
  elements.routineStartInput.addEventListener("input", () => {
    handleRoutineStartChange();
    onInput?.();
  });
  elements.routineStartInput.addEventListener("change", () => {
    onCommit?.();
  });
}

function handleRoutineStartChange() {
  const routineStartTime = Number(elements.routineStartInput.value) * ROUTINE_START_STEP_MINUTES;

  saveRoutineStartTime(routineStartTime);
  elements.routineStartValue.textContent = formatTimeLabel(routineStartTime);
  elements.appStatus.textContent = `Routine start saved for ${formatTimeLabel(routineStartTime)}.`;
}

export function getSavedRoutineStartTime() {
  try {
    const storedValue = window.localStorage.getItem(ROUTINE_START_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_WAKE_TIME_STORAGE_KEY);

    if (storedValue === null) {
      return DEFAULT_ROUTINE_START_MINUTES;
    }

    const savedValue = Number(storedValue);

    if (isValidRoutineStartTime(savedValue)) {
      return savedValue;
    }
  } catch (error) {
    return DEFAULT_ROUTINE_START_MINUTES;
  }

  return DEFAULT_ROUTINE_START_MINUTES;
}

export function saveRoutineStartTime(routineStartTime) {
  if (!isValidRoutineStartTime(routineStartTime)) {
    return;
  }

  try {
    window.localStorage.setItem(ROUTINE_START_STORAGE_KEY, String(routineStartTime));
  } catch (error) {
    elements.appStatus.textContent = "Start time could not be saved.";
  }
}

export function isValidRoutineStartTime(value) {
  return Number.isInteger(value)
    && value >= 0
    && value < 24 * 60
    && value % ROUTINE_START_STEP_MINUTES === 0;
}
