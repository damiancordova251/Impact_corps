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

export function isValidRoutineStartMinutes(value) {
  return Number.isInteger(value)
    && value >= 0
    && value < 24 * 60
    && value % 30 === 0;
}
