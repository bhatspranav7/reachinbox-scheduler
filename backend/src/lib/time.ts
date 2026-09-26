export const HOUR_MS = 60 * 60 * 1000;

/** Start (ms) of the UTC hour window that contains `ts`. */
export const hourWindowStart = (ts: number) => Math.floor(ts / HOUR_MS) * HOUR_MS;

/** Stable id for an hour window, e.g. "2026-09-26T10". Used in Redis keys. */
export const hourWindowId = (ts: number) => new Date(hourWindowStart(ts)).toISOString().slice(0, 13);
