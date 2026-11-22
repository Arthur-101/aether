/**
 * Currency conversion for the island calculator.
 *
 * The backend serves one USD-based daily table; every pair is cross-converted
 * from it, so a lookup never needs its own request and works offline.
 */

import { formatNumber } from './calculatorMath';

export interface CurrencyMeta {
  name: string;
  symbol: string;
}

/** Display metadata for the currencies people reach for; others show the code. */
const CURRENCY_META: Record<string, CurrencyMeta> = {
  USD: { name: 'US Dollar', symbol: '$' },
  EUR: { name: 'Euro', symbol: '€' },
  GBP: { name: 'British Pound', symbol: '£' },
  INR: { name: 'Indian Rupee', symbol: '₹' },
  JPY: { name: 'Japanese Yen', symbol: '¥' },
  CNY: { name: 'Chinese Yuan', symbol: '¥' },
  AUD: { name: 'Australian Dollar', symbol: 'A$' },
  CAD: { name: 'Canadian Dollar', symbol: 'C$' },
  CHF: { name: 'Swiss Franc', symbol: 'Fr' },
  HKD: { name: 'Hong Kong Dollar', symbol: 'HK$' },
  SGD: { name: 'Singapore Dollar', symbol: 'S$' },
  NZD: { name: 'New Zealand Dollar', symbol: 'NZ$' },
  KRW: { name: 'South Korean Won', symbol: '₩' },
  SEK: { name: 'Swedish Krona', symbol: 'kr' },
  NOK: { name: 'Norwegian Krone', symbol: 'kr' },
  DKK: { name: 'Danish Krone', symbol: 'kr' },
  PLN: { name: 'Polish Zloty', symbol: 'zł' },
  CZK: { name: 'Czech Koruna', symbol: 'Kč' },
  HUF: { name: 'Hungarian Forint', symbol: 'Ft' },
  RON: { name: 'Romanian Leu', symbol: 'lei' },
  TRY: { name: 'Turkish Lira', symbol: '₺' },
  RUB: { name: 'Russian Ruble', symbol: '₽' },
  UAH: { name: 'Ukrainian Hryvnia', symbol: '₴' },
  AED: { name: 'UAE Dirham', symbol: 'د.إ' },
  SAR: { name: 'Saudi Riyal', symbol: '﷼' },
  ILS: { name: 'Israeli Shekel', symbol: '₪' },
  EGP: { name: 'Egyptian Pound', symbol: 'E£' },
  ZAR: { name: 'South African Rand', symbol: 'R' },
  NGN: { name: 'Nigerian Naira', symbol: '₦' },
  BRL: { name: 'Brazilian Real', symbol: 'R$' },
  MXN: { name: 'Mexican Peso', symbol: 'MX$' },
  ARS: { name: 'Argentine Peso', symbol: 'AR$' },
  CLP: { name: 'Chilean Peso', symbol: 'CLP$' },
  COP: { name: 'Colombian Peso', symbol: 'COL$' },
  PEN: { name: 'Peruvian Sol', symbol: 'S/' },
  THB: { name: 'Thai Baht', symbol: '฿' },
  IDR: { name: 'Indonesian Rupiah', symbol: 'Rp' },
  MYR: { name: 'Malaysian Ringgit', symbol: 'RM' },
  PHP: { name: 'Philippine Peso', symbol: '₱' },
  VND: { name: 'Vietnamese Dong', symbol: '₫' },
  PKR: { name: 'Pakistani Rupee', symbol: '₨' },
  BDT: { name: 'Bangladeshi Taka', symbol: '৳' },
  LKR: { name: 'Sri Lankan Rupee', symbol: 'Rs' },
};

/** The currencies worth putting at the top of a long list, in order. */
const PREFERRED_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'INR',
  'JPY',
  'CNY',
  'AUD',
  'CAD',
  'CHF',
  'SGD',
  'AED',
  'ZAR',
  'BRL',
  'MXN',
];

export function currencySymbol(code: string): string {
  return CURRENCY_META[code]?.symbol ?? code;
}

/** Select option text: a known currency reads "Indian Rupee (INR)". */
export function currencyLabel(code: string): string {
  const meta = CURRENCY_META[code];
  return meta ? `${meta.name} (${code})` : code;
}

/** Every code the provider sent, favourite currencies first. */
export function currencyCodes(rates: Record<string, number>): string[] {
  const codes = Object.keys(rates)
    .map((code) => code.toUpperCase())
    .filter(Boolean);
  const preferred = PREFERRED_CURRENCIES.filter((code) => codes.includes(code));
  const rest = codes
    .filter((code) => !PREFERRED_CURRENCIES.includes(code))
    .sort();
  return [...preferred, ...rest];
}

/** Converts through the table's base currency; NaN when a code is missing. */
export function convertCurrency(
  value: number,
  from: string,
  to: string,
  rates: Record<string, number>
): number {
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!Number.isFinite(value) || !fromRate || !toRate) return NaN;
  return (value / fromRate) * toRate;
}

export function formatMoney(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  if (Math.abs(value) >= 0.01) {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  // Rates below a cent keep their significant digits instead of rounding to 0.
  return formatNumber(value);
}
