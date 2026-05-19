import { getLocalTimeParts } from "./time.js";

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
    });
  };

  run();
  return setInterval(run, intervalMs);
}

export async function checkSubscriptions({
  now,
  getSubscriptions,
  markSent,
  removeSubscription,
  sendReminder
}) {
  const subscriptions = getSubscriptions();

  await Promise.all(subscriptions.map(async (record) => {
    const localTime = getLocalTimeParts(now, record.timezone);

    if (localTime.minuteOfDay !== record.routineStartMinutes) {
      return;
    }

    if (record.lastSentDate === localTime.dateKey) {
      return;
    }

    try {
      await sendReminder(record);
      markSent(record.id, localTime.dateKey);
      console.log(`Sent Ready Checklist reminder to ${record.id} for ${localTime.dateKey}`);
    } catch (error) {
      if (error?.subscriptionGone) {
        removeSubscription(record.id);
        console.log(`Removed expired push subscription ${record.id}`);
        return;
      }

      console.error(`Failed to send Ready Checklist reminder to ${record.id}`, error);
    }
  }));
}
