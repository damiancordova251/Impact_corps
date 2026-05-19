import webPush from "web-push";
import { createChecklistReminder } from "../src/reminders.js";

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

export async function sendReadyChecklistPush(record) {
  const reminder = createChecklistReminder({ url: "/" });
  const payload = JSON.stringify(reminder);

  return webPush.sendNotification(record.subscription, payload);
}

export function isSubscriptionGone(error) {
  return error?.statusCode === 404 || error?.statusCode === 410;
}
