// Converts a Date into local calendar and minute-of-day values for a subscription
// timezone, which lets the scheduler compare reminder times correctly.
export function getLocalTimeParts(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const value = (type) => parts.find((part) => part.type === type)?.value;
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));

  return {
    hour,
    minute,
    minuteOfDay: hour * 60 + minute,
    dateKey: `${value("year")}-${value("month")}-${value("day")}`
  };
}

// Validates IANA timezone names by asking Intl.DateTimeFormat to format with
// them; invalid names throw and are rejected.
export function isValidTimezone(timezone) {
  if (typeof timezone !== "string" || timezone.trim().length === 0) {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch (error) {
    return false;
  }
}

// Routine reminders are stored as minutes after midnight and limited to
// 30-minute steps to match the frontend slider.
export function isValidRoutineStartMinutes(value) {
  return Number.isInteger(value)
    && value >= 0
    && value < 24 * 60
    && value % 30 === 0;
}
