import { elements } from "../../dom/elements.js";
import { state } from "../../state/appState.js";
import { formatTimeLabel } from "../../utils/format.js";
import { getSavedRoutineStartTime } from "../settings/routineStart.js";
import { createChecklistReminder, getRoutineReminderCopy, REMINDER_COPY } from "../../domain/reminders.js";
import { trackPilotEvent } from "../../services/pilotAnalytics.js";
import {
  clearSavedPushSubscriptionId,
  getBrowserTimezone,
  getNotificationEnvironment,
  requestNotificationPermission,
  savePushSubscriptionId,
  sendTestNotification,
  subscribeToPushReminders,
  unsubscribeFromPushReminders
} from "../../services/notificationsApi.js";

// Notification settings manage browser permission, local test notifications,
// and saving/removing the Web Push subscription that drives scheduled
// reminders. The single Settings button doubles as an enable/disable toggle:
// its label and action depend on whether a subscription is currently saved.
export function initNotificationSettings() {
  renderNotificationSetting();
  elements.enableNotificationsButton.addEventListener("click", handleNotificationButtonClick);
  elements.testNotificationButton.addEventListener("click", handleTestNotification);
}

// Wired as the routine-start slider's onInput callback from the app bootstrap
// so this feature can react to routine-time edits without routineStart.js
// having to import this module back (which would create a cycle, since this
// module already imports getSavedRoutineStartTime from routineStart.js).
export function handleRoutineStartInputChanged() {
  renderNotificationSetting();
}

// Wired as the routine-start slider's onCommit callback; re-saves the push
// subscription's schedule so the server sends the next reminder at the new
// time, but only if reminders are actually turned on.
export async function handleRoutineStartCommitted() {
  const environment = getNotificationEnvironment();

  if (environment.permission !== "granted" || !state.pushSubscriptionId) {
    return;
  }

  await syncPushReminderSubscription("Routine start updated. Saving reminder schedule...");
}

async function handleNotificationButtonClick() {
  const environment = getNotificationEnvironment();

  if (environment.permission === "granted" && state.pushSubscriptionId) {
    await handleDisableNotifications();
    return;
  }

  await handleEnableNotifications();
}

async function handleEnableNotifications() {
  renderNotificationSetting("Requesting notification permission...");

  const permission = await requestNotificationPermission();

  if (permission === "granted") {
    await syncPushReminderSubscription("Notifications enabled. Saving server reminder...");
    return;
  }

  if (permission === "denied") {
    renderNotificationSetting("Notifications are blocked. Update browser or iPhone settings to enable them.");
    return;
  }

  if (permission === "default") {
    renderNotificationSetting("Notification permission was not granted. Tap Enable reminders to try again.");
    return;
  }

  renderNotificationSetting("Notifications are not supported in this browser.");
}

// Turns reminders off: removes the browser PushSubscription, deletes the
// matching server row (which is what actually cancels any scheduled
// notification), and clears the locally saved subscription id so the toggle
// and its persisted state agree on app restart.
async function handleDisableNotifications() {
  elements.enableNotificationsButton.disabled = true;
  renderNotificationSetting("Turning off reminders...");

  try {
    await unsubscribeFromPushReminders(state.pushSubscriptionId);
    state.pushSubscriptionId = null;
    clearSavedPushSubscriptionId();
    renderNotificationSetting("Reminders are off. Turn them back on anytime.");
  } catch (error) {
    renderNotificationSetting(`Reminders could not be turned off. ${error.message}`);
  } finally {
    elements.enableNotificationsButton.disabled = false;
  }
}

async function handleTestNotification() {
  elements.testNotificationButton.disabled = true;

  try {
    await sendTestNotification(createChecklistReminder());
    renderNotificationSetting("Test notification sent.");
  } catch (error) {
    renderNotificationSetting(error.message);
  }
}

// Syncs the current browser PushSubscription with the server so scheduled
// reminders can survive restarts through Supabase storage. Exported so the
// onboarding "reminders" step can reuse the exact same enable flow.
export async function syncPushReminderSubscription(statusMessage) {
  renderNotificationSetting(statusMessage);

  try {
    const subscription = await subscribeToPushReminders({
      routineStartMinutes: getSavedRoutineStartTime(),
      timezone: getBrowserTimezone()
    });

    state.pushSubscriptionId = subscription.id;
    savePushSubscriptionId(subscription.id);
    trackPilotEvent("reminders_enabled", { permission: getNotificationEnvironment().permission });
    renderNotificationSetting("Reminders are on. You can still send a local test notification.");
  } catch (error) {
    renderNotificationSetting(`Permission is granted, but server reminders were not saved. ${error.message}`);
  }
}

// Recomputes Settings text and button availability from current browser
// notification support, permission, and saved subscription state. Exported so
// checklist/onboarding flows can refresh this panel after location or
// permission changes without duplicating this logic.
export function renderNotificationSetting(statusOverride = null) {
  const environment = getNotificationEnvironment();
  const routineStartLabel = formatTimeLabel(getSavedRoutineStartTime());

  elements.notificationRoutineNote.textContent = getReminderRoutineNote(routineStartLabel);

  if (!environment.supported) {
    elements.notificationStatus.textContent = statusOverride
      ?? getUnsupportedNotificationStatus(environment);
    elements.enableNotificationsButton.textContent = "Unavailable";
    elements.enableNotificationsButton.disabled = true;
    elements.testNotificationButton.disabled = true;
    return;
  }

  elements.testNotificationButton.disabled = environment.permission !== "granted";

  if (environment.permission === "denied") {
    elements.enableNotificationsButton.disabled = true;
    elements.enableNotificationsButton.textContent = "Blocked";
    elements.notificationStatus.textContent = statusOverride
      ?? "Notifications are blocked. Update browser or iPhone settings to enable them.";
    return;
  }

  elements.enableNotificationsButton.disabled = false;

  if (environment.permission === "granted" && state.pushSubscriptionId) {
    elements.enableNotificationsButton.textContent = "Disable reminders";
    elements.notificationStatus.textContent = statusOverride ?? getEnabledNotificationStatus();
    return;
  }

  if (environment.permission === "granted") {
    elements.enableNotificationsButton.textContent = "Enable reminders";
    elements.notificationStatus.textContent = statusOverride
      ?? "Notifications are enabled, but reminders are off. Tap Enable reminders to turn them on.";
    return;
  }

  elements.enableNotificationsButton.textContent = "Enable reminders";
  elements.notificationStatus.textContent = statusOverride
    ?? getDefaultNotificationStatus(environment);
}

function getUnsupportedNotificationStatus(environment) {
  if (environment.needsHomeScreenInstall) {
    return "Notifications are not supported here yet. On iPhone, install the PWA to the Home Screen and open it there.";
  }

  return "Notifications are not supported in this browser.";
}

function getDefaultNotificationStatus(environment) {
  if (environment.needsHomeScreenInstall) {
    return `On iPhone, install this PWA to the Home Screen before enabling reminders. ${REMINDER_COPY.scheduledServer}`;
  }

  return `Notifications are supported. Tap Enable reminders to request permission and save this PWA with the reminder server. ${REMINDER_COPY.scheduledServer}`;
}

function getEnabledNotificationStatus() {
  return `Reminders are on. ${REMINDER_COPY.scheduledServer}`;
}

function getReminderRoutineNote(routineStartLabel) {
  if (state.latestLocation) {
    return `${getRoutineReminderCopy(routineStartLabel)} Location stays on this device.`;
  }

  return getRoutineReminderCopy(routineStartLabel);
}
