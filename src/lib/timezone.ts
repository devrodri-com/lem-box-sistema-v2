// src/lib/timezone.ts
export const TZ = "America/Montevideo";

function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - date.getTime();
}

export function zonedStartOfDayUtcMs(yyyyMmDd: string, timeZone: string = TZ): number {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const localMidnight = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const off = tzOffsetMs(localMidnight, timeZone);
  return localMidnight.getTime() - off;
}

export function zonedEndOfDayUtcMs(yyyyMmDd: string, timeZone: string = TZ): number {
  return zonedStartOfDayUtcMs(yyyyMmDd, timeZone) + 24 * 60 * 60 * 1000 - 1;
}

