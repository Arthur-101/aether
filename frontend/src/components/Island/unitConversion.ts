/**
 * Unit conversion tables for the island calculator.
 *
 * Linear units store one factor to their category's base unit. Temperature is
 * the exception: it converts through Celsius, because offsets make a single
 * multiplying factor impossible.
 */

export interface Unit {
  id: string;
  label: string;
  symbol: string;
  toBase: (value: number) => number;
  fromBase: (value: number) => number;
}

export interface UnitCategory {
  id: string;
  label: string;
  units: Unit[];
  defaultFrom: string;
  defaultTo: string;
}

export interface QuickConversion {
  label: string;
  category: string;
  from: string;
  to: string;
}

function linear(
  id: string,
  label: string,
  symbol: string,
  factor: number
): Unit {
  return {
    id,
    label,
    symbol,
    toBase: (value) => value * factor,
    fromBase: (value) => value / factor,
  };
}

const celsius: Unit = {
  id: 'c',
  label: 'Celsius',
  symbol: '°C',
  toBase: (value) => value,
  fromBase: (value) => value,
};

const fahrenheit: Unit = {
  id: 'f',
  label: 'Fahrenheit',
  symbol: '°F',
  toBase: (value) => ((value - 32) * 5) / 9,
  fromBase: (value) => (value * 9) / 5 + 32,
};

const kelvin: Unit = {
  id: 'k',
  label: 'Kelvin',
  symbol: 'K',
  toBase: (value) => value - 273.15,
  fromBase: (value) => value + 273.15,
};

const rankine: Unit = {
  id: 'r',
  label: 'Rankine',
  symbol: '°R',
  toBase: (value) => ((value - 491.67) * 5) / 9,
  fromBase: (value) => ((value + 273.15) * 9) / 5,
};

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: 'length',
    label: 'Length',
    defaultFrom: 'm',
    defaultTo: 'cm',
    units: [
      linear('mm', 'Millimetre', 'mm', 0.001),
      linear('cm', 'Centimetre', 'cm', 0.01),
      linear('m', 'Metre', 'm', 1),
      linear('km', 'Kilometre', 'km', 1000),
      linear('in', 'Inch', 'in', 0.0254),
      linear('ft', 'Foot', 'ft', 0.3048),
      linear('yd', 'Yard', 'yd', 0.9144),
      linear('mi', 'Mile', 'mi', 1609.344),
      linear('nmi', 'Nautical mile', 'nmi', 1852),
    ],
  },
  {
    id: 'mass',
    label: 'Mass',
    defaultFrom: 'kg',
    defaultTo: 'lb',
    units: [
      linear('mg', 'Milligram', 'mg', 0.000001),
      linear('g', 'Gram', 'g', 0.001),
      linear('kg', 'Kilogram', 'kg', 1),
      linear('t', 'Tonne', 't', 1000),
      linear('oz', 'Ounce', 'oz', 0.028349523125),
      linear('lb', 'Pound', 'lb', 0.45359237),
      linear('st', 'Stone', 'st', 6.35029318),
      linear('ton_us', 'US ton', 'ton', 907.18474),
    ],
  },
  {
    id: 'temperature',
    label: 'Temperature',
    defaultFrom: 'c',
    defaultTo: 'f',
    units: [celsius, fahrenheit, kelvin, rankine],
  },
  {
    id: 'area',
    label: 'Area',
    defaultFrom: 'm2',
    defaultTo: 'ft2',
    units: [
      linear('mm2', 'Square millimetre', 'mm²', 0.000001),
      linear('cm2', 'Square centimetre', 'cm²', 0.0001),
      linear('m2', 'Square metre', 'm²', 1),
      linear('km2', 'Square kilometre', 'km²', 1000000),
      linear('in2', 'Square inch', 'in²', 0.00064516),
      linear('ft2', 'Square foot', 'ft²', 0.09290304),
      linear('yd2', 'Square yard', 'yd²', 0.83612736),
      linear('acre', 'Acre', 'ac', 4046.8564224),
      linear('ha', 'Hectare', 'ha', 10000),
    ],
  },
  {
    id: 'volume',
    label: 'Volume',
    defaultFrom: 'l',
    defaultTo: 'gal_us',
    units: [
      linear('ml', 'Millilitre', 'mL', 0.001),
      linear('l', 'Litre', 'L', 1),
      linear('m3', 'Cubic metre', 'm³', 1000),
      linear('cm3', 'Cubic centimetre', 'cm³', 0.001),
      linear('tsp', 'Teaspoon (US)', 'tsp', 0.00492892159375),
      linear('tbsp', 'Tablespoon (US)', 'tbsp', 0.01478676478125),
      linear('floz_us', 'Fluid ounce (US)', 'fl oz', 0.0295735295625),
      linear('cup_us', 'Cup (US)', 'cup', 0.2365882365),
      linear('pt_us', 'Pint (US)', 'pt', 0.473176473),
      linear('qt_us', 'Quart (US)', 'qt', 0.946352946),
      linear('gal_us', 'Gallon (US)', 'gal', 3.785411784),
      linear('gal_uk', 'Gallon (UK)', 'gal UK', 4.54609),
    ],
  },
  {
    id: 'speed',
    label: 'Speed',
    defaultFrom: 'kmh',
    defaultTo: 'mph',
    units: [
      linear('mps', 'Metres per second', 'm/s', 1),
      linear('kmh', 'Kilometres per hour', 'km/h', 1 / 3.6),
      linear('mph', 'Miles per hour', 'mph', 0.44704),
      linear('knot', 'Knot', 'kn', 0.5144444444444445),
      linear('fps', 'Feet per second', 'ft/s', 0.3048),
    ],
  },
  {
    id: 'data',
    label: 'Data',
    defaultFrom: 'mb',
    defaultTo: 'mib',
    units: [
      linear('bit', 'Bit', 'bit', 0.125),
      linear('b', 'Byte', 'B', 1),
      linear('kb', 'Kilobyte', 'KB', 1000),
      linear('mb', 'Megabyte', 'MB', 1000000),
      linear('gb', 'Gigabyte', 'GB', 1000000000),
      linear('tb', 'Terabyte', 'TB', 1000000000000),
      linear('kib', 'Kibibyte', 'KiB', 1024),
      linear('mib', 'Mebibyte', 'MiB', 1048576),
      linear('gib', 'Gibibyte', 'GiB', 1073741824),
      linear('tib', 'Tebibyte', 'TiB', 1099511627776),
    ],
  },
  {
    id: 'time',
    label: 'Time',
    defaultFrom: 'h',
    defaultTo: 'min',
    units: [
      linear('ms', 'Millisecond', 'ms', 0.001),
      linear('s', 'Second', 's', 1),
      linear('min', 'Minute', 'min', 60),
      linear('h', 'Hour', 'h', 3600),
      linear('day', 'Day', 'd', 86400),
      linear('week', 'Week', 'wk', 604800),
      linear('month', 'Month (30.4 d)', 'mo', 2629800),
      linear('year', 'Year (365.25 d)', 'yr', 31557600),
    ],
  },
  {
    id: 'angle',
    label: 'Angle',
    defaultFrom: 'deg',
    defaultTo: 'rad',
    units: [
      linear('deg', 'Degree', '°', 1),
      linear('rad', 'Radian', 'rad', 180 / Math.PI),
      linear('grad', 'Gradian', 'grad', 0.9),
      linear('turn', 'Turn', 'turn', 360),
    ],
  },
  {
    id: 'pressure',
    label: 'Pressure',
    defaultFrom: 'bar',
    defaultTo: 'psi',
    units: [
      linear('pa', 'Pascal', 'Pa', 1),
      linear('kpa', 'Kilopascal', 'kPa', 1000),
      linear('mpa', 'Megapascal', 'MPa', 1000000),
      linear('bar', 'Bar', 'bar', 100000),
      linear('psi', 'Pounds per square inch', 'psi', 6894.757293168361),
      linear('atm', 'Atmosphere', 'atm', 101325),
      linear('mmhg', 'Millimetre of mercury', 'mmHg', 133.322387415),
    ],
  },
];

/** The pairs people reach for most often, surfaced as one-click chips. */
export const QUICK_CONVERSIONS: QuickConversion[] = [
  { label: 'in → cm', category: 'length', from: 'in', to: 'cm' },
  { label: 'm → mm', category: 'length', from: 'm', to: 'mm' },
  { label: 'ft → m', category: 'length', from: 'ft', to: 'm' },
  { label: 'mi → km', category: 'length', from: 'mi', to: 'km' },
  { label: 'kg → lb', category: 'mass', from: 'kg', to: 'lb' },
  { label: '°C → °F', category: 'temperature', from: 'c', to: 'f' },
  { label: 'L → gal', category: 'volume', from: 'l', to: 'gal_us' },
  { label: 'MB → MiB', category: 'data', from: 'mb', to: 'mib' },
];

export function findCategory(id: string): UnitCategory | undefined {
  return UNIT_CATEGORIES.find((category) => category.id === id);
}

export function findUnit(category: UnitCategory, id: string): Unit | undefined {
  return category.units.find((unit) => unit.id === id);
}

/** Converts `value` between two units of the same category. */
export function convertUnits(
  value: number,
  category: UnitCategory,
  fromId: string,
  toId: string
): number {
  const from = findUnit(category, fromId) ?? category.units[0];
  const to = findUnit(category, toId) ?? category.units[0];
  return to.fromBase(from.toBase(value));
}