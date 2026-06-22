const TIME_ZONE = "America/New_York";

const dateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const timeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function ordinalSuffix(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) {
    return "th";
  }
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/** "Friday, June 19th, 2026" in America/New_York. */
export function formatEasternDate(date: Date): string {
  const parts = dateParts.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)!.value;
  const weekday = get("weekday");
  const month = get("month");
  const day = Number(get("day"));
  const year = get("year");
  return `${weekday}, ${month} ${day}${ordinalSuffix(day)}, ${year}`;
}

/** "6:05 PM" in America/New_York (12-hour). */
export function formatEasternTime(date: Date): string {
  return timeFormat.format(date);
}
