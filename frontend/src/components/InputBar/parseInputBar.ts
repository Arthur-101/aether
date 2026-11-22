/**
 * What the universal input bar does with one line of text: a slash command, a
 * unit conversion, a currency conversion, a math expression, or a question for
 * the assistant.
 *
 * Pure and dependency-free on purpose: `scripts/check-input-bar.mjs` loads it
 * straight from Node, and the bar supplies the rate table and evaluator.
 */

export interface InputCommand {
  /** Includes the leading slash, so the list renders exactly what to type. */
  name: string;
  description: string;
  /** Placeholder for the value the command still needs, if any. */
  argHint?: string;
}

export const INPUT_COMMANDS: InputCommand[] = [
  { name: '/settings', description: 'Open Settings' },
  { name: '/model', description: 'Open the AI & Models settings' },
  {
    name: '/speed-test',
    description: 'Measure the connection (12 s by default)',
    argHint: 'seconds',
  },
  { name: '/new-session', description: 'Start a new chat session' },
  { name: '/theme', description: 'Toggle dark mode' },
  { name: '/mute', description: 'Mute or unmute the output' },
  { name: '/volume', description: 'Set the output volume', argHint: '0-100' },
  { name: '/brightness', description: 'Set the screen brightness', argHint: '0-100' },
  { name: '/color-picker', description: 'Pick a colour from the screen' },
  { name: '/timer', description: 'Start, pause or reset the timer', argHint: '5m | reset' },
  { name: '/stopwatch', description: 'Start or pause the stopwatch' },
  { name: '/stopwatch-lap', description: 'Record a stopwatch lap' },
  { name: '/stopwatch-reset', description: 'Reset the stopwatch' },
];

export type ParsedInput =
  | { kind: 'empty' }
  | { kind: 'command-list' }
  | { kind: 'command'; name: string; arg: string }
  | { kind: 'unknown-command'; name: string }
  | { kind: 'unit'; conversion: UnitConversion }
  | { kind: 'currency'; amount: number; from: string; to: string | null }
  | { kind: 'math'; expression: string }
  | { kind: 'text'; text: string };

export interface UnitDef {
  /** Shown next to the number, e.g. `cm`. */
  label: string;
  /** Card heading, so `kg` and `km` are never silently mixed. */
  group: string;
  /** base = value * factor + offset */
  factor: number;
  offset?: number;
}

export interface UnitConversion {
  amount: number;
  from: UnitDef;
  to: UnitDef;
  /** The converted amount, in ``to``. */
  value: number;
}

/** Units with their own short label; aliases live in ``UNIT_ALIASES``. */
const UNITS: Record<string, UnitDef> = {
  // Length, base metre.
  mm: { label: 'mm', group: 'Length', factor: 0.001 },
  cm: { label: 'cm', group: 'Length', factor: 0.01 },
  m: { label: 'm', group: 'Length', factor: 1 },
  km: { label: 'km', group: 'Length', factor: 1000 },
  in: { label: 'in', group: 'Length', factor: 0.0254 },
  ft: { label: 'ft', group: 'Length', factor: 0.3048 },
  yd: { label: 'yd', group: 'Length', factor: 0.9144 },
  mi: { label: 'mi', group: 'Length', factor: 1609.344 },

  // Mass, base gram.
  mg: { label: 'mg', group: 'Mass', factor: 0.001 },
  g: { label: 'g', group: 'Mass', factor: 1 },
  kg: { label: 'kg', group: 'Mass', factor: 1000 },
  oz: { label: 'oz', group: 'Mass', factor: 28.349523125 },
  lb: { label: 'lb', group: 'Mass', factor: 453.59237 },

  // Volume, base litre; cooking units are US customary.
  ml: { label: 'ml', group: 'Volume', factor: 0.001 },
  l: { label: 'l', group: 'Volume', factor: 1 },
  tsp: { label: 'tsp', group: 'Volume', factor: 0.00492892159375 },
  tbsp: { label: 'tbsp', group: 'Volume', factor: 0.01478676478125 },
  cup: { label: 'cup', group: 'Volume', factor: 0.2365882365 },
  pt: { label: 'pt', group: 'Volume', factor: 0.473176473 },
  qt: { label: 'qt', group: 'Volume', factor: 0.946352946 },
  gal: { label: 'gal', group: 'Volume', factor: 3.785411784 },

  // Temperature, base Celsius; the offset makes it affine.
  c: { label: '°C', group: 'Temperature', factor: 1 },
  f: { label: '°F', group: 'Temperature', factor: 5 / 9, offset: (-32 * 5) / 9 },
  k: { label: 'K', group: 'Temperature', factor: 1, offset: -273.15 },

  // Area, base square metre.
  m2: { label: 'm²', group: 'Area', factor: 1 },
  cm2: { label: 'cm²', group: 'Area', factor: 0.0001 },
  km2: { label: 'km²', group: 'Area', factor: 1000000 },
  in2: { label: 'in²', group: 'Area', factor: 0.00064516 },
  ft2: { label: 'ft²', group: 'Area', factor: 0.09290304 },
  acre: { label: 'acre', group: 'Area', factor: 4046.8564224 },
  hectare: { label: 'ha', group: 'Area', factor: 10000 },

  // Time, base second.
  ms: { label: 'ms', group: 'Time', factor: 0.001 },
  s: { label: 's', group: 'Time', factor: 1 },
  min: { label: 'min', group: 'Time', factor: 60 },
  h: { label: 'h', group: 'Time', factor: 3600 },
  day: { label: 'day', group: 'Time', factor: 86400 },
  week: { label: 'week', group: 'Time', factor: 604800 },

  // Speed, base metre per second.
  'm/s': { label: 'm/s', group: 'Speed', factor: 1 },
  kmh: { label: 'km/h', group: 'Speed', factor: 1 / 3.6 },
  mph: { label: 'mph', group: 'Speed', factor: 0.44704 },

  // Data, base byte.
  kb: { label: 'KB', group: 'Data', factor: 1024 },
  mb: { label: 'MB', group: 'Data', factor: 1024 ** 2 },
  gb: { label: 'GB', group: 'Data', factor: 1024 ** 3 },
  tb: { label: 'TB', group: 'Data', factor: 1024 ** 4 },
};

/** Every spelling people type, including the short forms. */
const UNIT_ALIASES: Record<string, string> = {
  millimeter: 'mm', millimeters: 'mm', millimetre: 'mm', millimetres: 'mm', mm: 'mm',
  centimeter: 'cm', centimeters: 'cm', centimetre: 'cm', centimetres: 'cm', cm: 'cm',
  meter: 'm', meters: 'm', metre: 'm', metres: 'm', m: 'm',
  kilometer: 'km', kilometers: 'km', kilometre: 'km', kilometres: 'km', km: 'km',
  inch: 'in', inches: 'in', in: 'in',
  foot: 'ft', feet: 'ft', ft: 'ft',
  yard: 'yd', yards: 'yd', yd: 'yd',
  mile: 'mi', miles: 'mi', mi: 'mi',

  milligram: 'mg', milligrams: 'mg', mg: 'mg',
  gram: 'g', grams: 'g', g: 'g',
  kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg', kg: 'kg',
  ounce: 'oz', ounces: 'oz', oz: 'oz',
  pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',

  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', ml: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', l: 'l',
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp',
  cup: 'cup', cups: 'cup',
  pint: 'pt', pints: 'pt', pt: 'pt',
  quart: 'qt', quarts: 'qt', qt: 'qt',
  gallon: 'gal', gallons: 'gal', gal: 'gal',

  celsius: 'c', centigrade: 'c', c: 'c',
  fahrenheit: 'f', f: 'f',
  kelvin: 'k', k: 'k',

  m2: 'm2', sqm: 'm2',
  cm2: 'cm2', sqcm: 'cm2',
  km2: 'km2', sqkm: 'km2',
  in2: 'in2', sqin: 'in2',
  ft2: 'ft2', sqft: 'ft2',
  acre: 'acre', acres: 'acre',
  hectare: 'hectare', hectares: 'hectare', ha: 'hectare',

  millisecond: 'ms', milliseconds: 'ms', ms: 'ms',
  second: 's', seconds: 's', sec: 's', secs: 's', s: 's',
  minute: 'min', minutes: 'min', mins: 'min', min: 'min',
  hour: 'h', hours: 'h', hr: 'h', hrs: 'h', h: 'h',
  day: 'day', days: 'day',
  week: 'week', weeks: 'week', wk: 'week',

  'm/s': 'm/s',
  kmh: 'kmh', kph: 'kmh', 'km/h': 'kmh',
  mph: 'mph', 'mi/h': 'mph',

  kilobyte: 'kb', kilobytes: 'kb', kib: 'kb', kb: 'kb',
  megabyte: 'mb', megabytes: 'mb', mib: 'mb', mb: 'mb',
  gigabyte: 'gb', gigabytes: 'gb', gib: 'gb', gb: 'gb',
  terabyte: 'tb', terabytes: 'tb', tib: 'tb', tb: 'tb',
};

const UNIT_AMOUNT = '(-?\\d[\\d,]*(?:\\.\\d+)?)';
const UNIT_WORD = '([a-z][a-z0-9/]*)';
const UNIT_SEPARATOR = '(?:in|to|as|into|=|->|→|>)';

const UNIT_PAIR = new RegExp(
  `^${UNIT_AMOUNT}\\s*${UNIT_WORD}\\s*${UNIT_SEPARATOR}\\s*${UNIT_WORD}$`
);
const UNIT_HOW_MANY = new RegExp(
  `^how many\\s+${UNIT_WORD}\\s+(?:in|are in|is)\\s+${UNIT_AMOUNT}\\s*${UNIT_WORD}$`
);

function resolveUnit(word: string): UnitDef | null {
  const key = UNIT_ALIASES[word];
  return key ? UNITS[key] ?? null : null;
}

/** ``°`` and ``²`` are decoration; a trailing colon is just a person typing. */
function normalizeUnitText(text: string): string {
  return text
    .toLowerCase()
    .replace(/²/g, '2')
    .replace(/°/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[?!:;.]+$/, '')
    .trim();
}

function unitPair(amountRaw: string, fromRaw: string, toRaw: string): UnitConversion | null {
  const amount = Number(amountRaw.replace(/,/g, ''));
  const from = resolveUnit(fromRaw);
  const to = resolveUnit(toRaw);
  if (!Number.isFinite(amount) || !from || !to) return null;
  if (from.group !== to.group) return null;
  const base = amount * from.factor + (from.offset ?? 0);
  const value = (base - (to.offset ?? 0)) / to.factor;
  // Twelve digits absorb binary-float noise (1 ft reads 12 in, not 12.000000000000002).
  return { amount, from, to, value: Number(value.toPrecision(12)) };
}

/**
 * `1 feet in inch`, `5ft to cm`, `100 c in f`, `convert 2 l to ml`,
 * `how many inches in 2 feet`.
 */
export function parseUnitInput(text: string): UnitConversion | null {
  let raw = normalizeUnitText(text);
  if (!raw) return null;
  raw = raw
    .replace(/^(?:convert|calculate|change)\s+/, '')
    .replace(/^(?:what is|what's|how much is)\s+/, '');

  const howMany = UNIT_HOW_MANY.exec(raw);
  if (howMany) return unitPair(howMany[2], howMany[3], howMany[1]);

  const pair = UNIT_PAIR.exec(raw);
  return pair ? unitPair(pair[1], pair[2], pair[3]) : null;
}

/** Short, honest display for a converted amount; 8 digits keeps exact values exact. */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e12 || magnitude < 1e-6) {
    return value
      .toExponential(6)
      .replace(/(\.\d*?)0+e/, '$1e')
      .replace(/\.e/, 'e')
      .replace('e+', 'e');
  }
  return Number(value.toPrecision(8)).toString();
}

const SYMBOL_CODES: Record<string, string> = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '₹': 'INR',
  '¥': 'JPY',
  '₩': 'KRW',
  '₺': 'TRY',
  '₽': 'RUB',
  '฿': 'THB',
  '₦': 'NGN',
  '₪': 'ILS',
  '₫': 'VND',
  '₴': 'UAH',
  '₱': 'PHP',
  '₨': 'PKR',
};

/** Spoken names people type, mapped to the codes the rate table uses. */
const NAME_CODES: Record<string, string> = {
  dollar: 'USD',
  dollars: 'USD',
  buck: 'USD',
  bucks: 'USD',
  usd: 'USD',
  euro: 'EUR',
  euros: 'EUR',
  eur: 'EUR',
  pound: 'GBP',
  pounds: 'GBP',
  quid: 'GBP',
  gbp: 'GBP',
  rupee: 'INR',
  rupees: 'INR',
  inr: 'INR',
  yen: 'JPY',
  jpy: 'JPY',
  yuan: 'CNY',
  rmb: 'CNY',
  cny: 'CNY',
  won: 'KRW',
  krw: 'KRW',
  aud: 'AUD',
  cad: 'CAD',
  chf: 'CHF',
  hkd: 'HKD',
  sgd: 'SGD',
  nzd: 'NZD',
  dirham: 'AED',
  dirhams: 'AED',
  aed: 'AED',
  riyal: 'SAR',
  riyals: 'SAR',
  sar: 'SAR',
  shekel: 'ILS',
  shekels: 'ILS',
  ils: 'ILS',
  rand: 'ZAR',
  zar: 'ZAR',
  naira: 'NGN',
  ngn: 'NGN',
  real: 'BRL',
  reais: 'BRL',
  brl: 'BRL',
  peso: 'MXN',
  pesos: 'MXN',
  mxn: 'MXN',
  sol: 'PEN',
  pen: 'PEN',
  baht: 'THB',
  thb: 'THB',
  rupiah: 'IDR',
  idr: 'IDR',
  ringgit: 'MYR',
  myr: 'MYR',
  dong: 'VND',
  vnd: 'VND',
  taka: 'BDT',
  bdt: 'BDT',
  lira: 'TRY',
  try: 'TRY',
  ruble: 'RUB',
  rubles: 'RUB',
  rouble: 'RUB',
  roubles: 'RUB',
  rub: 'RUB',
  zloty: 'PLN',
  pln: 'PLN',
  krona: 'SEK',
  krone: 'NOK',
  forint: 'HUF',
  leu: 'RON',
  hryvnia: 'UAH',
  franc: 'CHF',
  francs: 'CHF',
};

const SYMBOL = '([$€£₹¥₩₺₽฿₦₪₫₴₱₨])';
const NUMBER = '([\\d][\\d,._]*)';
const WORD = '([a-z]{2,})';

const SYMBOL_ONLY = new RegExp(`^${SYMBOL}\\s*${NUMBER}$`);
const AMOUNT_ONLY = new RegExp(`^${NUMBER}\\s*${WORD}$`);
const AMOUNT_PAIR = new RegExp(`^${NUMBER}\\s*${WORD}\\s+(?:in|to)\\s+${WORD}$`);
const SYMBOL_PAIR = new RegExp(`^${SYMBOL}\\s*${NUMBER}\\s+(?:in|to)\\s+${WORD}$`);

function codeFor(word: string): string | null {
  const known = NAME_CODES[word];
  if (known) return known;
  // Anything that looks like an ISO code is passed through; a code the daily
  // table does not carry simply renders no conversion.
  return /^[a-z]{3}$/.test(word) ? word.toUpperCase() : null;
}

function amountOf(raw: string): number | null {
  const amount = Number(raw.replace(/,/g, ''));
  return Number.isFinite(amount) ? amount : null;
}

export function parseCurrencyInput(
  text: string
): { amount: number; from: string; to: string | null } | null {
  const raw = text.trim().toLowerCase();
  if (!raw) return null;

  const symbolPair = SYMBOL_PAIR.exec(raw);
  if (symbolPair) {
    const amount = amountOf(symbolPair[2]);
    const from = SYMBOL_CODES[symbolPair[1]];
    const to = codeFor(symbolPair[3]);
    if (amount !== null && from && to) return { amount, from, to };
    return null;
  }

  const pair = AMOUNT_PAIR.exec(raw);
  if (pair) {
    const amount = amountOf(pair[1]);
    const from = codeFor(pair[2]);
    const to = codeFor(pair[3]);
    if (amount !== null && from && to) return { amount, from, to };
    return null;
  }

  const symbolOnly = SYMBOL_ONLY.exec(raw);
  if (symbolOnly) {
    const amount = amountOf(symbolOnly[2]);
    const from = SYMBOL_CODES[symbolOnly[1]];
    if (amount !== null && from) return { amount, from, to: null };
    return null;
  }

  const amountOnly = AMOUNT_ONLY.exec(raw);
  if (amountOnly) {
    const amount = amountOf(amountOnly[1]);
    const from = codeFor(amountOnly[2]);
    if (amount !== null && from) return { amount, from, to: null };
  }

  return null;
}

/**
 * Rewrites the two spoken forms the evaluator does not parse:
 *
 * - `54% of 200` keeps the percent, so it reads as 54 hundredths of 200 → 108
 * - `50 of 200` has no percent, so it asks for a share → 25%
 */
export function normalizeMath(text: string): string {
  return text
    .replace(/(\d+(?:\.\d+)?\s*%)\s+of\s+/gi, '$1*')
    .replace(/(\d+(?:\.\d+)?)\s+of\s+(\d+(?:\.\d+)?)/gi, '($1/$2*100)');
}

/** True when the whole line is arithmetic worth answering locally. */
export function looksLikeMath(text: string): boolean {
  const raw = normalizeMath(text).trim().replace(/\s+/g, '');
  if (!/\d/.test(raw)) return false;
  if (!/^[-+*/().%^\d]+$/.test(raw)) return false;
  return /[-+*/%^]/.test(raw.slice(1));
}

/**
 * `5m`, `1h30m`, `45s` and a bare number of minutes. Returns seconds, or null
 * for anything that is not a duration.
 */
export function parseDuration(text: string): number | null {
  const raw = text.trim().toLowerCase().replace(/\s+/g, '');
  if (!raw) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    return Math.min(Math.round(Number(raw) * 60), 24 * 60 * 60);
  }

  let total = 0;
  let consumed = '';
  const units = /(\d+(?:\.\d+)?)(h|m|s)/g;
  for (let match = units.exec(raw); match; match = units.exec(raw)) {
    const value = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(value) || value <= 0) return null;
    total += unit === 'h' ? value * 3600 : unit === 'm' ? value * 60 : value;
    consumed += match[0];
  }
  if (!consumed || consumed !== raw) return null;
  return total > 0 ? Math.min(Math.round(total), 24 * 60 * 60) : null;
}

export function parseInputBar(text: string): ParsedInput {
  const trimmed = text.trim();
  if (!trimmed) return { kind: 'empty' };

  if (trimmed.startsWith('/')) {
    const [head, ...rest] = trimmed.split(/\s+/);
    const name = head.slice(1).toLowerCase();
    const known = INPUT_COMMANDS.some((command) => command.name === `/${name}`);
    // A bare name that matches a command can run now; a partial one keeps the
    // list open for picking.
    if (known) return { kind: 'command', name, arg: rest.join(' ').trim() };
    if (!rest.length) return { kind: 'command-list' };
    return { kind: 'unknown-command', name };
  }

  // Units first: "1 sec in ms" is a duration, but the currency parser would
  // read both words as ISO-shaped codes.
  const conversion = parseUnitInput(trimmed);
  if (conversion) return { kind: 'unit', conversion };

  const currency = parseCurrencyInput(trimmed);
  if (currency) return { kind: 'currency', ...currency };

  if (looksLikeMath(trimmed)) return { kind: 'math', expression: trimmed };

  return { kind: 'text', text: trimmed };
}