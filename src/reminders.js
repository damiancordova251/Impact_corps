export const REMINDER_COPY = {
  title: "Ready Checklist",
  body: "Your weather checklist is ready.",
  scheduledServer: "The server will send a simple daily reminder at your routine start time."
};

export function createChecklistReminder({ url = "./" } = {}) {
  return {
    title: REMINDER_COPY.title,
    body: REMINDER_COPY.body,
    tag: "ready-checklist-test",
    url
  };
}

export function getRoutineReminderCopy(routineStartLabel) {
  return `Scheduled reminders will use your ${routineStartLabel} routine start.`;
}
