import { elements } from "../../dom/elements.js";
import { state } from "../../state/appState.js";
import {
  ONBOARDING_COMPLETED_STORAGE_KEY,
  ONBOARDING_STARTED_STORAGE_KEY
} from "../../constants/storageKeys.js";
import { formatHourLabel, formatTimeLabel } from "../../utils/format.js";
import { prefersReducedMotion } from "../../utils/browser.js";
import { getCurrentLocation } from "../../services/location.js";
import { fetchTodayWeather, WeatherFetchError } from "../../services/weather.js";
import { requestNotificationPermission } from "../../services/notificationsApi.js";
import { trackPilotEvent } from "../../services/pilotAnalytics.js";
import { hasCompletedClothingPreferences, markClothingPreferencesSkipped } from "../../domain/clothingPreferences.js";
import {
  DEFAULT_ROUTINE_START_MINUTES,
  getSavedRoutineStartTime,
  initializeRoutineStartSetting,
  ROUTINE_START_STEP_MINUTES,
  saveRoutineStartTime
} from "../settings/routineStart.js";
import {
  getSavedTimeAwayHours,
  hasStoredTimeAwayHours,
  initializeTimeAwaySetting,
  isValidTimeAwayHours,
  ONBOARDING_DEFAULT_TIME_AWAY_HOURS,
  saveTimeAwayHours,
  TIME_AWAY_OPTIONS
} from "../settings/timeAway.js";
import { renderNotificationSetting, syncPushReminderSubscription } from "../notifications/notificationSettings.js";
import {
  setOnboardingContinueHandler,
  setOnboardingSkipHandler,
  showClothingPreferencesScreen
} from "../clothingPreferences/clothingPreferencesUI.js";
import {
  getSavedLocationForThisDevice,
  renderWindowRecommendation,
  saveLocationForThisDevice,
  startAppExperience,
  toReminderLocation
} from "../checklist/checklist.js";
import { showScreen } from "../weatherScreen/weatherScreen.js";

// First-run onboarding collects the same local settings available in Settings.
// Existing testers with saved setup data are quietly migrated so they are not
// trapped in the new flow.
export function initOnboarding() {
  setOnboardingContinueHandler(continueToReminders);
  setOnboardingSkipHandler(continueToReminders);

  elements.onboardingPrimary.addEventListener("click", handleOnboardingPrimaryAction);
  elements.onboardingSecondary.addEventListener("click", handleOnboardingSecondaryAction);

  initializeOnboardingFlow();
}

function continueToReminders() {
  state.onboardingReminderCanContinue = false;
  showOnboardingStep("reminders");
}

function initializeOnboardingFlow() {
  if (hasCompletedOnboarding()) {
    startAppExperience();
    return;
  }

  if (shouldAutoCompleteOnboardingForExistingUser()) {
    markOnboardingComplete();
    startAppExperience();
    return;
  }

  markOnboardingStarted();
  showOnboardingStep("welcome");
}

function showOnboardingStep(step, options = {}) {
  state.onboardingStep = step;
  elements.clothingPreferencesScreen.hidden = true;
  elements.onboardingScreen.dataset.step = step;

  if (step === "clothing") {
    elements.onboardingScreen.hidden = true;
    showClothingPreferencesScreen("onboarding");
    return;
  }

  elements.onboardingScreen.hidden = false;
  elements.onboardingScreen.scrollTop = 0;
  elements.onboardingMessage.textContent = options.message ?? "";
  elements.onboardingControl.replaceChildren();
  elements.onboardingVisual.className = "onboarding-visual";
  elements.onboardingPrimary.disabled = false;
  elements.onboardingSecondary.disabled = false;
  elements.onboardingSecondary.hidden = true;

  const stepCopy = getOnboardingStepCopy(step);

  elements.onboardingProgress.textContent = stepCopy.progress;
  elements.onboardingKicker.textContent = stepCopy.kicker;
  elements.onboardingTitle.textContent = stepCopy.title;
  elements.onboardingBody.textContent = stepCopy.body;
  elements.onboardingPrimary.textContent = stepCopy.primaryLabel;
  elements.onboardingSecondary.textContent = stepCopy.secondaryLabel ?? "";
  elements.onboardingSecondary.hidden = !stepCopy.secondaryLabel;

  if (stepCopy.visualClass) {
    elements.onboardingVisual.classList.add(stepCopy.visualClass);
  }

  if (step === "routine") {
    renderOnboardingRoutineControl();
  }

  if (step === "location") {
    renderOnboardingLocationControl();
  }

  if (step === "timeAway") {
    renderOnboardingTimeAwayControl();
  }

  if (step === "creating") {
    renderOnboardingProgressBar();
  }

  if (step === "reminders" && state.onboardingReminderCanContinue) {
    elements.onboardingPrimary.textContent = "Continue";
  }

  if (step === "creating") {
    elements.onboardingPrimary.disabled = true;
    elements.onboardingSecondary.hidden = true;
    runOnboardingChecklistCreation();
  }
}

function getOnboardingStepCopy(step) {
  const copy = {
    welcome: {
      progress: "Step 1 of 8",
      kicker: "Welcome",
      title: "Hello!",
      body: "This is Ready, your on-the-go clothing checklist for the day's weather.",
      primaryLabel: "Get Started"
    },
    setup: {
      progress: "Step 2 of 8",
      kicker: "Setup",
      title: "Let's set up your checklist",
      body: "Ready asks a few quick questions so your checklist matches your day, your schedule, and the clothes you actually wear.",
      primaryLabel: "Continue",
      secondaryLabel: "Skip setup"
    },
    location: {
      progress: "Step 3 of 8",
      kicker: "Location",
      title: "Where should Ready check the weather?",
      body: "Ready needs your general location to create accurate clothing recommendations for today's weather.",
      primaryLabel: "Use Current Location",
      visualClass: "is-location"
    },
    routine: {
      progress: "Step 4 of 8",
      kicker: "Schedule",
      title: "When do you usually leave home?",
      body: "Ready can time reminders around when you normally start your day.",
      primaryLabel: "Continue",
      secondaryLabel: "Skip"
    },
    timeAway: {
      progress: "Step 5 of 8",
      kicker: "Forecast Window",
      title: "How long are you usually away?",
      body: "Ready uses this window to check the weather you are likely to run into.",
      primaryLabel: "Continue",
      secondaryLabel: "Skip"
    },
    reminders: {
      progress: "Step 7 of 8",
      kicker: "Reminders",
      title: "Want Ready to remind you?",
      body: "Ready can send a daily reminder so your checklist is ready before you leave.",
      primaryLabel: "Enable Reminders",
      secondaryLabel: "Not Now"
    },
    creating: {
      progress: "Step 8 of 8",
      kicker: "Almost There",
      title: "Creating your checklist",
      body: "Checking weather, layers, and accessories…",
      primaryLabel: "Creating..."
    }
  };

  return copy[step] ?? copy.welcome;
}

async function handleOnboardingPrimaryAction() {
  if (state.onboardingStep === "welcome") {
    showOnboardingStep("setup");
    return;
  }

  if (state.onboardingStep === "setup") {
    showOnboardingStep("location");
    return;
  }

  if (state.onboardingStep === "location") {
    await handleOnboardingLocationRequest();
    return;
  }

  if (state.onboardingStep === "routine") {
    applyOnboardingRoutineStart(getOnboardingRoutineStartValue());
    showOnboardingStep("timeAway");
    return;
  }

  if (state.onboardingStep === "timeAway") {
    applyOnboardingTimeAway(getOnboardingTimeAwayValue());
    showOnboardingStep("clothing");
    return;
  }

  if (state.onboardingStep === "reminders") {
    if (state.onboardingReminderCanContinue) {
      showOnboardingStep("creating");
      return;
    }

    await handleOnboardingEnableReminders();
  }
}

function handleOnboardingSecondaryAction() {
  if (state.onboardingStep === "setup") {
    applyOnboardingDefaults();
    state.onboardingSkipOptionalSteps = true;
    showOnboardingStep("location");
    return;
  }

  if (state.onboardingStep === "routine") {
    applyOnboardingRoutineStart(DEFAULT_ROUTINE_START_MINUTES);
    showOnboardingStep("timeAway");
    return;
  }

  if (state.onboardingStep === "timeAway") {
    applyOnboardingTimeAway(ONBOARDING_DEFAULT_TIME_AWAY_HOURS);
    showOnboardingStep("clothing");
    return;
  }

  if (state.onboardingStep === "reminders") {
    showOnboardingStep("creating");
  }
}

async function handleOnboardingLocationRequest() {
  const requestedAt = new Date();

  elements.onboardingPrimary.disabled = true;
  elements.onboardingMessage.textContent = "Getting your location...";

  try {
    const location = await getCurrentLocation();

    state.latestLocation = toReminderLocation(location);
    saveLocationForThisDevice(state.latestLocation);
    renderNotificationSetting();
    trackPilotEvent("location_updated", { source: "onboarding" });
    elements.onboardingMessage.textContent = "Checking today's weather...";

    state.onboardingWeather = await fetchTodayWeather(location);
    state.onboardingRequestedAt = requestedAt;

    if (state.onboardingSkipOptionalSteps) {
      showOnboardingStep("creating");
      return;
    }

    showOnboardingStep("routine");
  } catch (error) {
    elements.onboardingPrimary.disabled = false;
    elements.onboardingMessage.textContent = getOnboardingLocationError(error);
  }
}

async function handleOnboardingEnableReminders() {
  state.onboardingReminderCanContinue = false;
  elements.onboardingPrimary.disabled = true;
  elements.onboardingSecondary.disabled = true;
  elements.onboardingMessage.textContent = "Requesting notification permission...";

  const permission = await requestNotificationPermission();

  if (permission === "granted") {
    await syncPushReminderSubscription("Notifications enabled. Saving server reminder...");
    showOnboardingStep("creating");
    return;
  }

  state.onboardingReminderCanContinue = true;
  elements.onboardingPrimary.disabled = false;
  elements.onboardingSecondary.disabled = false;

  if (permission === "denied") {
    showOnboardingStep("reminders", {
      message: "Notifications are blocked. You can continue now and enable reminders later from Settings."
    });
    return;
  }

  if (permission === "default") {
    showOnboardingStep("reminders", {
      message: "Notification permission was not granted. You can continue now and enable reminders later from Settings."
    });
    return;
  }

  showOnboardingStep("reminders", {
    message: "Notifications are not supported here yet. You can continue without reminders."
  });
}

function runOnboardingChecklistCreation() {
  if (state.onboardingCompleting) {
    return;
  }

  if (!state.onboardingWeather) {
    showOnboardingStep("location", {
      message: "Ready needs your general location before creating a checklist."
    });
    return;
  }

  state.onboardingCompleting = true;

  window.setTimeout(() => {
    renderWindowRecommendation(
      state.onboardingWeather,
      state.onboardingRequestedAt ?? new Date(),
      { source: "onboarding" }
    );
    markOnboardingComplete();
    elements.onboardingScreen.hidden = true;
    state.startupFlowStarted = true;
    state.onboardingCompleting = false;
    elements.appStatus.textContent = "Setup complete. You can change everything later in Settings.";
    showScreen("checklist");
  }, prefersReducedMotion() ? 120 : 850);
}

function applyOnboardingDefaults() {
  applyOnboardingRoutineStart(DEFAULT_ROUTINE_START_MINUTES);
  applyOnboardingTimeAway(ONBOARDING_DEFAULT_TIME_AWAY_HOURS);
  markClothingPreferencesSkipped();
}

function applyOnboardingRoutineStart(routineStartTime) {
  saveRoutineStartTime(routineStartTime);
  initializeRoutineStartSetting();
  renderNotificationSetting();
}

function applyOnboardingTimeAway(timeAwayHours) {
  saveTimeAwayHours(timeAwayHours);
  initializeTimeAwaySetting();
}

function renderOnboardingRoutineControl() {
  const wrapper = document.createElement("label");
  const value = document.createElement("strong");
  const input = document.createElement("input");
  const currentMinutes = getSavedRoutineStartTime();

  wrapper.className = "onboarding-slider-control";
  wrapper.textContent = "Leave time";
  value.textContent = formatTimeLabel(currentMinutes);
  input.className = "routine-start-slider";
  input.type = "range";
  input.min = "0";
  input.max = "47";
  input.step = "1";
  input.value = String(currentMinutes / ROUTINE_START_STEP_MINUTES);

  input.addEventListener("input", () => {
    value.textContent = formatTimeLabel(getOnboardingRoutineStartValue());
  });

  wrapper.append(value, input);
  elements.onboardingControl.replaceChildren(wrapper);
}

function renderOnboardingLocationControl() {
  const helper = document.createElement("p");

  helper.className = "onboarding-helper";
  helper.textContent = "Location stays on this device only. You can change browser location permission later in Safari or your browser settings.";
  elements.onboardingControl.replaceChildren(helper);
}

function renderOnboardingProgressBar() {
  const progress = document.createElement("div");
  const bar = document.createElement("span");

  progress.className = "onboarding-loading-bar";
  progress.setAttribute("role", "progressbar");
  progress.setAttribute("aria-label", "Creating checklist");
  progress.append(bar);
  elements.onboardingControl.replaceChildren(progress);
}

function renderOnboardingTimeAwayControl() {
  const group = document.createElement("div");
  const currentHours = hasStoredTimeAwayHours()
    ? getSavedTimeAwayHours()
    : ONBOARDING_DEFAULT_TIME_AWAY_HOURS;

  group.className = "onboarding-option-grid";
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", "Expected time away");
  group.replaceChildren(...TIME_AWAY_OPTIONS.map((hours) => createOnboardingTimeAwayOption(hours, hours === currentHours)));
  elements.onboardingControl.replaceChildren(group);
}

function createOnboardingTimeAwayOption(hours, checked) {
  const label = document.createElement("label");
  const input = document.createElement("input");
  const text = document.createElement("span");

  label.className = "onboarding-option";
  input.type = "radio";
  input.name = "onboardingTimeAway";
  input.value = String(hours);
  input.checked = checked;
  text.textContent = formatHourLabel(hours);
  label.append(input, text);

  return label;
}

function getOnboardingRoutineStartValue() {
  const input = elements.onboardingControl.querySelector("input[type='range']");

  if (!input) {
    return DEFAULT_ROUTINE_START_MINUTES;
  }

  return Number(input.value) * ROUTINE_START_STEP_MINUTES;
}

function getOnboardingTimeAwayValue() {
  const checked = elements.onboardingControl.querySelector("input[name='onboardingTimeAway']:checked");
  const value = Number(checked?.value);

  return isValidTimeAwayHours(value) ? value : ONBOARDING_DEFAULT_TIME_AWAY_HOURS;
}

function getOnboardingLocationError(error) {
  if (error instanceof WeatherFetchError) {
    return "Ready found your location, but could not check the weather yet. Please try again.";
  }

  return "Ready needs your general location to create an accurate clothing checklist. Please allow location access to continue.";
}

function hasCompletedOnboarding() {
  try {
    return window.localStorage.getItem(ONBOARDING_COMPLETED_STORAGE_KEY) === "true";
  } catch (error) {
    return true;
  }
}

function markOnboardingStarted() {
  try {
    window.localStorage.setItem(ONBOARDING_STARTED_STORAGE_KEY, "true");
  } catch (error) {
    return false;
  }

  return true;
}

function markOnboardingComplete() {
  try {
    window.localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, "true");
    window.localStorage.removeItem(ONBOARDING_STARTED_STORAGE_KEY);
  } catch (error) {
    return false;
  }

  return true;
}

function hasStartedOnboarding() {
  try {
    return window.localStorage.getItem(ONBOARDING_STARTED_STORAGE_KEY) === "true";
  } catch (error) {
    return false;
  }
}

function shouldAutoCompleteOnboardingForExistingUser() {
  if (hasStartedOnboarding()) {
    return false;
  }

  return Boolean(getSavedLocationForThisDevice()) || hasCompletedClothingPreferences();
}
