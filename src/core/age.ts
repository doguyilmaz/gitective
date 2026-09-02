export type AgeBucket = 1 | 2 | 3 | 4 | 5;

const DAY = 86400;
const BOUNDS: Array<[seconds: number, bucket: AgeBucket]> = [
  [DAY, 1],
  [7 * DAY, 2],
  [30 * DAY, 3],
  [365 * DAY, 4],
];

export function ageBucket(epochSec: number, nowMs = Date.now()): AgeBucket {
  const elapsed = nowMs / 1000 - epochSec;
  for (const [limit, bucket] of BOUNDS) if (elapsed < limit) return bucket;
  return 5;
}
