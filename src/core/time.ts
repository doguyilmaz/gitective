const UNITS: Array<[seconds: number, singular: string]> = [
  [365 * 86400, "year"],
  [30 * 86400, "month"],
  [7 * 86400, "week"],
  [86400, "day"],
  [3600, "hour"],
  [60, "minute"],
];

export function formatAgo(epochSec: number, nowMs = Date.now()): string {
  const elapsed = nowMs / 1000 - epochSec;
  for (const [size, name] of UNITS) {
    if (elapsed >= size) {
      const count = Math.floor(elapsed / size);
      return `${count} ${name}${count === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}

export type DateStyle = "short" | "medium" | "long" | "full";

export function formatDate(epochSec: number, locale?: string, style: DateStyle = "medium"): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: style,
    timeStyle: "short",
  }).format(new Date(epochSec * 1000));
}

export function formatDateOnly(
  epochSec: number,
  locale?: string,
  style: DateStyle = "medium",
): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: style }).format(new Date(epochSec * 1000));
}
