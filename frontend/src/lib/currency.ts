/**
 * Daily exchange rates for the island calculator's Currency mode.
 *
 * The daemon owns the cache, the daily refresh, and the offline fallback, so
 * this is a single read of the local endpoint; it never contacts a provider.
 */

const API_BASE = 'http://127.0.0.1:8765';

export interface CurrencyRates {
  base: string;
  rates: Record<string, number>;
  fetched_at: string;
  source: 'network' | 'cache';
  /** True when the daemon served the file while it refreshes behind it. */
  stale: boolean;
}

export async function fetchCurrencyRates(): Promise<CurrencyRates | null> {
  try {
    const response = await fetch(`${API_BASE}/api/currency`);
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object') return null;
    const table = data as CurrencyRates;
    if (!table.rates || typeof table.rates !== 'object') return null;
    if (!Object.keys(table.rates).length) return null;
    return table;
  } catch (err) {
    console.error('Currency rates failed:', err);
    return null;
  }
}
