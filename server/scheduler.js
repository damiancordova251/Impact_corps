import { getLocalTimeParts } from "./time.js";

// Starts a polling loop that checks whether any subscription has reached its
// local routine start time.
export function startReminderScheduler({
  getSubscriptions,
  markSent,
  removeSubscription,
  sendReminder,
  intervalMs = 30000
}) {
  const run = () => {
    checkSubscriptions({
      now: new Date(),
      getSubscriptions,
      markSent,
      removeSubscription,
      sendReminder
    }).catch((error) => {
      console.error("Reminder scheduler check failed.", error);
    });
  };

  run();
  return setInterval(run, intervalMs);
}

// For each subscription, compare the current time in that user's timezone
// against their saved routine start and skip any reminder already sent today.
export async function checkSubscriptions({
  now,
  getSubscriptions,
  markSent,
  removeSubscription,
  sendReminder
}) {
  const subscriptions = await getSubscriptions();

  await Promise.all(subscriptions.map(async (record) => {
    const localTime = getLocalTimeParts(now, record.timezone);

    if (localTime.minuteOfDay !== record.routineStartMinutes) {
      return;
    }

    if (record.lastSentDate === localTime.dateKey) {
      return;
    }

    // Expired push endpoints are cleaned up so future scheduler runs stay small.
    try {
      await sendReminder(record);
      await markSent(record.id, localTime.dateKey);
      console.log(`Sent Ready Checklist reminder to ${record.id} for ${localTime.dateKey}`);
    } catch (error) {
      if (error?.subscriptionGone) {
        await removeSubscription(record.id);
        console.log(`Removed expired push subscription ${record.id}`);
        return;
      }

      console.error(`Failed to send Ready Checklist reminder to ${record.id}`, error);
    }
  }));
}
