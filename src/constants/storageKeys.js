// Central registry for the localStorage keys the app bootstrap and feature
// modules read/write, so key names live in one place instead of as scattered
// magic strings. Clothing-preference keys stay colocated with
// domain/clothingPreferences.js since they are only ever used there.
export const ROUTINE_START_STORAGE_KEY = "morningWearRoutineStartMinutes";
export const LEGACY_WAKE_TIME_STORAGE_KEY = "morningWearWakeTimeMinutes";
export const PUSH_SUBSCRIPTION_ID_STORAGE_KEY = "morningWearPushSubscriptionId";
export const SAVED_LOCATION_STORAGE_KEY = "readySavedLocation";
export const TIME_AWAY_STORAGE_KEY = "readyExpectedTimeAwayHours";
export const ONBOARDING_COMPLETED_STORAGE_KEY = "readyOnboardingCompleted";
export const ONBOARDING_STARTED_STORAGE_KEY = "readyOnboardingStarted";
