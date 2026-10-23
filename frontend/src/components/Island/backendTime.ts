/**
 * SQLite stores `CURRENT_TIMESTAMP` as UTC without a zone suffix. JavaScript
 * would otherwise read it as local time, which makes a just-created session
 * look hours old. Leave ISO strings that already carry a zone alone.
 */
export function parseBackendTimestamp(value?: string | null): Date | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  const sqliteUtc = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?$/.test(raw);
  const date = new Date(sqliteUtc ? `${raw.replace(' ', 'T')}Z` : raw);
  return Number.isNaN(date.getTime()) ? null : date;
}
