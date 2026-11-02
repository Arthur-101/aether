/**
 * Expression evaluation for the island calculator.
 *
 * A hand-written recursive-descent parser keeps this honest: no `eval`, no
 * `Function`, and every failure is a sentence we can show the user. The
 * grammar covers numbers, constants, brackets, `+ - * / ^`, unary signs, the
 * `sqrt` / `log` / `ln` functions, and a postfix `%` meaning "divide by one
 * hundred".
 */

type Token =
  | { type: 'number'; value: number }
  | { type: 'operator'; value: string }
  | { type: 'identifier'; value: string };

const OPERATORS = new Set(['+', '-', '*', '/', '^', '%', '(', ')']);

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

const FUNCTIONS: Record<string, (value: number) => number> = {
  sqrt: Math.sqrt,
  log: Math.log10,
  ln: Math.log,
};

/** Maps the symbols the keypad paints onto the ASCII the parser expects. */
export function normalizeExpression(input: string): string {
  return input
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–]/g, '-')
    .replace(/π/g, 'pi')
    .replace(/√/g, 'sqrt');
}

/** Maps parser symbols back onto the typography the keypad shows. */
export function prettyExpression(input: string): string {
  return input
    .replace(/\*/g, '×')
    .replace(/\//g, '÷')
    .replace(/-/g, '−')
    .replace(/sqrt\(/g, '√(');
}

/**
 * Appends any closing brackets the user left implicit.
 *
 * Function buttons insert `sqrt(` and people often evaluate without typing
 * the `)`. Completing it here keeps that gesture working without loosening
 * the parser.
 */
export function autoCloseExpression(input: string): string {
  const open = (input.match(/\(/g) ?? []).length;
  const close = (input.match(/\)/g) ?? []).length;
  return open > close ? input + ')'.repeat(open - close) : input;
}

function tokenize(input: string): Token[] {
  const source = normalizeExpression(input);
  const tokens: Token[] = [];
  let index = 0;

  /**
   * Reads a number, including a leading `.` and exponent notation.
   *
   * Exponents matter because `formatNumber` switches to `1e13` style for huge
   * results, and those results can be fed straight back into the parser when
   * the user keeps calculating.
   */
  const readNumber = (): Token => {
    const start = index;
    while (index < source.length && source[index] >= '0' && source[index] <= '9') {
      index += 1;
    }
    if (source[index] === '.') {
      index += 1;
      while (index < source.length && source[index] >= '0' && source[index] <= '9') {
        index += 1;
      }
    }
    if (index === start || source.slice(start, index) === '.') {
      throw new Error('Unexpected decimal point');
    }

    if (source[index] === 'e' || source[index] === 'E') {
      const exponentStart = index;
      index += 1;
      if (source[index] === '+' || source[index] === '-') {
        index += 1;
      }
      const digitsStart = index;
      while (index < source.length && source[index] >= '0' && source[index] <= '9') {
        index += 1;
      }
      if (index === digitsStart) {
        // Not a real exponent (`2e` alone); leave the `e` for the error path.
        index = exponentStart;
      }
    }

    return { type: 'number', value: Number(source.slice(start, index)) };
  };

  while (index < source.length) {
    const char = source[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if ((char >= '0' && char <= '9') || char === '.') {
      tokens.push(readNumber());
      continue;
    }

    if (/[a-zA-Z]/.test(char)) {
      const start = index;
      while (index < source.length && /[a-zA-Z]/.test(source[index])) {
        index += 1;
      }
      tokens.push({
        type: 'identifier',
        value: source.slice(start, index).toLowerCase(),
      });
      continue;
    }

    if (OPERATORS.has(char)) {
      tokens.push({ type: 'operator', value: char });
      index += 1;
      continue;
    }

    throw new Error(`Unexpected "${char}"`);
  }

  return tokens;
}

/**
 * Evaluates one expression and returns a finite number.
 *
 * Throws an `Error` with a short, user-facing message when the expression is
 * incomplete or cannot be evaluated.
 */
export function evaluateExpression(input: string): number {
  const tokens = tokenize(input);
  if (tokens.length === 0) {
    throw new Error('Nothing to calculate');
  }

  let index = 0;

  const peek = (): Token | undefined => tokens[index];
  const take = (): Token | undefined => tokens[index++];

  const expression = (): number => {
    let value = term();
    for (;;) {
      const token = peek();
      if (token?.type !== 'operator' || (token.value !== '+' && token.value !== '-')) {
        return value;
      }
      take();
      const right = term();
      value = token.value === '+' ? value + right : value - right;
    }
  };

  const term = (): number => {
    let value = unary();
    for (;;) {
      const token = peek();
      if (token?.type !== 'operator' || (token.value !== '*' && token.value !== '/')) {
        return value;
      }
      take();
      const right = unary();
      if (token.value === '/' && right === 0) {
        throw new Error('Cannot divide by zero');
      }
      value = token.value === '*' ? value * right : value / right;
    }
  };

  const unary = (): number => {
    const token = peek();
    if (token?.type === 'operator' && (token.value === '+' || token.value === '-')) {
      take();
      const value = unary();
      return token.value === '-' ? -value : value;
    }
    return postfix();
  };

  const postfix = (): number => {
    let value = power();
    for (;;) {
      const token = peek();
      if (token?.type !== 'operator' || token.value !== '%') {
        return value;
      }
      take();
      value /= 100;
    }
  };

  // Right-associative, and the exponent may carry its own sign: `2^-3`.
  const power = (): number => {
    const base = primary();
    const token = peek();
    if (token?.type !== 'operator' || token.value !== '^') {
      return base;
    }
    take();
    return Math.pow(base, signedPower());
  };

  const signedPower = (): number => {
    const token = peek();
    if (token?.type === 'operator' && (token.value === '+' || token.value === '-')) {
      take();
      const value = signedPower();
      return token.value === '-' ? -value : value;
    }
    return power();
  };

  const primary = (): number => {
    const token = take();
    if (!token) {
      throw new Error('Incomplete expression');
    }
    if (token.type === 'number') {
      return token.value;
    }
    if (token.type === 'identifier') {
      if (token.value in CONSTANTS) {
        return CONSTANTS[token.value];
      }
      const apply = FUNCTIONS[token.value];
      if (!apply) {
        throw new Error(`Unknown function "${token.value}"`);
      }
      const open = take();
      if (!open || open.type !== 'operator' || open.value !== '(') {
        throw new Error(`Expected "(" after ${token.value}`);
      }
      const argument = expression();
      const close = take();
      if (!close || close.type !== 'operator' || close.value !== ')') {
        throw new Error('Missing closing bracket');
      }
      return apply(argument);
    }
    if (token.value === '(') {
      const value = expression();
      const close = take();
      if (!close || close.type !== 'operator' || close.value !== ')') {
        throw new Error('Missing closing bracket');
      }
      return value;
    }
    throw new Error('Incomplete expression');
  };

  const result = expression();
  if (index < tokens.length) {
    throw new Error('Unexpected input');
  }
  if (!Number.isFinite(result)) {
    throw new Error('Result is out of range');
  }
  return result;
}

/**
 * Formats a number for the display.
 *
 * Twelve significant digits absorb the usual binary-float noise
 * (`0.1 + 0.2` shows `0.3`) without hiding real precision, and very large or
 * very small magnitudes switch to exponent form so the display never scrolls
 * off the card.
 */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0';

  const magnitude = Math.abs(value);
  if (magnitude >= 1e12 || magnitude < 1e-9) {
    return value
      .toExponential(8)
      .replace(/(\.\d*?)0+e/, '$1e')
      .replace(/\.e/, 'e')
      .replace('e+', 'e');
  }

  return Number(value.toPrecision(12)).toString();
}