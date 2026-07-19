import { elements } from "../../dom/elements.js";
import { state } from "../../state/appState.js";
import { formatTimeLabel } from "../../utils/format.js";
import { getLocale, t } from "../../i18n/i18n.js";
import { getSavedRoutineStartTime } from "../settings/routineStart.js";
import { createChecklistReminder } from "../../domain/reminders.js";
import { trackPilotEvent } from "../../services/pilotAnalytics.js";
import { trackEvent } from "../../services/analytics.js";
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
  elements.testNotificationButton.textContent = t("settings.sendTest");
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

  await syncPushReminderSubscription(t("notifications.notificationsEnabledSaving"));
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
  renderNotificationSetting(t("notifications.requestingPermission"));

  const permission = await requestNotificationPermission();

  if (permission === "granted") {
    await syncPushReminderSubscription(t("notifications.notificationsEnabledSaving"));
    return;
  }

  if (permission === "denied") {
    renderNotificationSetting(t("notifications.blockedStatus"));
    return;
  }

  if (permission === "default") {
    renderNotificationSetting(t("notifications.permissionNotGranted"));
    return;
  }

  renderNotificationSetting(t("notifications.unsupportedBrowser"));
}

// Turns reminders off: removes the browser PushSubscription, deletes the
// matching server row (which is what actually cancels any scheduled
// notification), and clears the locally saved subscription id so the toggle
// and its persisted state agree on app restart.
async function handleDisableNotifications() {
  elements.enableNotificationsButton.disabled = true;
  renderNotificationSetting(t("notifications.turningOff"));

  try {
    await unsubscribeFromPushReminders(state.pushSubscriptionId);
    state.pushSubscriptionId = null;
    clearSavedPushSubscriptionId();
    trackEvent("notification_opt_out", {});
    renderNotificationSetting(t("notifications.turnedOff"));
  } catch (error) {
    renderNotificationSetting(t("notifications.turnOffFailed", { error: error.message }));
  } finally {
    elements.enableNotificationsButton.disabled = false;
  }
}

async function handleTestNotification() {
  elements.testNotificationButton.disabled = true;

  try {
    // domain/reminders.js is shared with the Node backend (server/pushService.js),
    // so it can't import the browser-only i18n module itself; the client-only
    // local test notification is translated here instead, after the fact.
    await sendTestNotification({
      ...createChecklistReminder(),
      title: t("notifications.testTitle"),
      body: t("notifications.testBody")
    });
    renderNotificationSetting(t("notifications.testSent"));
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
      timezone: getBrowserTimezone(),
      location: state.latestLocation,
      preferredLanguage: getLocale()
    });

    state.pushSubscriptionId = subscription.id;
    savePushSubscriptionId(subscription.id);
    trackPilotEvent("reminders_enabled", { permission: getNotificationEnvironment().permission });
    trackEvent("notification_opt_in", { permission: getNotificationEnvironment().permission });
    renderNotificationSetting(t("notifications.enabledOn", { scheduledServer: t("notifications.scheduledServer") }));
  } catch (error) {
    renderNotificationSetting(t("notifications.permissionGrantedNotSaved", { error: error.message }));
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
    elements.enableNotificationsButton.textContent = t("notifications.unavailable");
    elements.enableNotificationsButton.disabled = true;
    elements.testNotificationButton.disabled = true;
    return;
  }

  elements.testNotificationButton.disabled = environment.permission !== "granted";

  if (environment.permission === "denied") {
    elements.enableNotificationsButton.disabled = true;
    elements.enableNotificationsButton.textContent = t("notifications.blocked");
    elements.notificationStatus.textContent = statusOverride
      ?? t("notifications.blockedStatus");
    return;
  }

  elements.enableNotificationsButton.disabled = false;

  if (environment.permission === "granted" && state.pushSubscriptionId) {
    elements.enableNotificationsButton.textContent = t("notifications.disableReminders");
    elements.notificationStatus.textContent = statusOverride ?? getEnabledNotificationStatus();
    return;
  }

  if (environment.permission === "granted") {
    elements.enableNotificationsButton.textContent = t("notifications.enableReminders");
    elements.notificationStatus.textContent = statusOverride
      ?? t("notifications.onButStillOff");
    return;
  }

  elements.enableNotificationsButton.textContent = t("notifications.enableReminders");
  elements.notificationStatus.textContent = statusOverride
    ?? getDefaultNotificationStatus(environment);
}

function getUnsupportedNotificationStatus(environment) {
  if (environment.needsHomeScreenInstall) {
    return t("notifications.unsupportedHomeScreen");
  }

  return t("notifications.unsupportedBrowser");
}

function getDefaultNotificationStatus(environment) {
  if (environment.needsHomeScreenInstall) {
    return t("notifications.homeScreenRequired", { scheduledServer: t("notifications.scheduledServer") });
  }

  return t("notifications.supportedDefault", { scheduledServer: t("notifications.scheduledServer") });
}

function getEnabledNotificationStatus() {
  return t("notifications.enabledOn", { scheduledServer: t("notifications.scheduledServer") });
}

function getReminderRoutineNote(routineStartLabel) {
  const note = t("notifications.routineReminderCopy", { time: routineStartLabel });

  if (state.latestLocation) {
    return t("notifications.routineNoteLocation", { note });
  }

  return note;
}
