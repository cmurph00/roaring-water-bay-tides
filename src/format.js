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

/** The "YYYY-MM-DD" calendar date of `date` as observed in `timezone`. */
export function localDayISO(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

/**
 * Groups tides by their station-local calendar day. Returns
 * `[{ day: "YYYY-MM-DD", tides: [...] }, ...]` ordered by day ascending;
 * tides within a group preserve their original (time-ascending) order.
 * Does not mutate the input array.
 */
export function groupByLocalDay(tides, timezone) {
  const byDay = new Map();
  for (const t of tides) {
    const day = localDayISO(t.time, timezone);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(t);
  }
  return [...byDay.keys()].sort().map((day) => ({ day, tides: byDay.get(day) }));
}

/** A human label like "Tue 14 Jul" for an ISO day, in the given timezone. */
export function fmtDayLabel(isoDay, timezone) {
  const noon = new Date(`${isoDay}T12:00:00Z`);
  return noon.toLocaleDateString("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
