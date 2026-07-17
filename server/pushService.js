import webPush from "web-push";
import { createChecklistReminder } from "../src/domain/reminders.js";

// Reads VAPID keys from environment variables and configures web-push only when
// the backend has everything needed to send browser push notifications.
export function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;

  if (!publicKey || !privateKey || !subject) {
    return {
      configured: false,
      publicKey: publicKey ?? null
    };
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);

  return {
    configured: true,
    publicKey
  };
}

// Sends the shared Ready Checklist reminder payload to one stored subscription.
export async function sendReadyChecklistPush(record) {
  const reminder = createChecklistReminder({ url: "/" });
  const payload = JSON.stringify(reminder);

  return webPush.sendNotification(record.subscription, payload);
}

// Browsers return 404/410 when a push subscription is no longer valid.
export function isSubscriptionGone(error) {
  return error?.statusCode === 404 || error?.statusCode === 410;
}
