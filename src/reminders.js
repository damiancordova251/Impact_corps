export const REMINDER_COPY = {
  title: "Ready Checklist",
  body: "Your weather checklist is ready.",
  scheduledLater: "Daily scheduled reminders will be added next."
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
  return `Future reminders will use your ${routineStartLabel} routine start.`;
}
