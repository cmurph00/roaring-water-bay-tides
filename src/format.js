export function fmtTime(date, timezone) {
  return date.toLocaleTimeString("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fmtDistance(km) {
  return `${Math.round(km)} km`;
}
