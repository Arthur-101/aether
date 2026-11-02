import React, { useMemo, useReducer, useState } from 'react';
import { ArrowDownUp, Delete } from 'lucide-react';
import { autoCloseExpression, evaluateExpression, formatNumber, prettyExpression } from './calculatorMath';
import { CALC_HEIGHT } from './tabSizes';
import {
  QUICK_CONVERSIONS,
  UNIT_CATEGORIES,
  convertUnits,
  findCategory,
  findUnit,
  type QuickConversion,
  type UnitCategory,
} from './unitConversion';

type CalculatorMode = 'standard' | 'units';

type CalcKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '.'
  | '+'
  | '-'
  | '*'
  | '/'
  | '^'
  | '%'
  | '('
  | ')'
  | 'sqrt'
  | 'square'
  | 'log'
  | 'ln'
  | 'pi'
  | 'e'
  | 'clear'
  | 'back'
  | 'sign'
  | 'eq';

interface HistoryEntry {
  expression: string;
  result: string;
}

interface StandardState {
  expression: string;
  result: string;
  justEvaluated: boolean;
  error: string;
  history: HistoryEntry[];
}

type StandardAction =
  | { type: 'key'; key: CalcKey }
  | { type: 'recall'; value: string }
  | { type: 'clear-history' };

const INITIAL_STATE: StandardState = {
  expression: '',
  result: '',
  justEvaluated: false,
  error: '',
  history: [],
};

const KEYPAD: CalcKey[][] = [
  ['clear', 'back', '(', ')', '%'],
  ['sqrt', 'square', '^', 'log', 'ln'],
  ['7', '8', '9', '/', '*'],
  ['4', '5', '6', '-', '+'],
  ['1', '2', '3', 'sign', 'pi'],
  // The zero key spans two columns, filling the fifth slot in this row.
  ['0', '.', 'e', 'eq'],
];

const MODES: Array<{ id: CalculatorMode; label: string; hint: string }> = [
  { id: 'standard', label: 'Standard', hint: 'Type or click. Enter evaluates.' },
  { id: 'units', label: 'Units', hint: 'Pick a category, then convert both ways.' },
];

function isOperatorKey(key: CalcKey): boolean {
  return (
    key === '+' ||
    key === '-' ||
    key === '*' ||
    key === '/' ||
    key === '^' ||
    key === '%'
  );
}

function isFunctionKey(key: CalcKey): boolean {
  return (
    key === 'sqrt' ||
    key === 'square' ||
    key === 'log' ||
    key === 'ln' ||
    key === 'pi' ||
    key === 'e'
  );
}

function keyFace(key: CalcKey): string {
  if (key === '*') return '×';
  if (key === '/') return '÷';
  if (key === '-') return '−';
  if (key === 'sign') return '±';
  if (key === 'clear') return 'C';
  if (key === 'eq') return '=';
  if (key === 'sqrt') return '√';
  if (key === 'square') return 'x²';
  if (key === '^') return 'xʸ';
  if (key === 'pi') return 'π';
  if (key === 'e') return 'e';
  return key;
}

function keyLabel(key: CalcKey): string {
  switch (key) {
    case 'clear':
      return 'Clear';
    case 'back':
      return 'Backspace';
    case 'sign':
      return 'Change sign';
    case 'eq':
      return 'Equals';
    case '*':
      return 'Multiply';
    case '/':
      return 'Divide';
    case '-':
      return 'Subtract';
    case '+':
      return 'Add';
    case '%':
      return 'Percent';
    case '^':
      return 'Raise to power';
    case 'sqrt':
      return 'Square root';
    case 'square':
      return 'Square';
    case 'log':
      return 'Logarithm base 10';
    case 'ln':
      return 'Natural logarithm';
    case 'pi':
      return 'Pi';
    case 'e':
      return 'Euler’s number';
    case '(':
      return 'Open bracket';
    case ')':
      return 'Close bracket';
    case '.':
      return 'Decimal point';
    default:
      return key;
  }
}

/** Flips the sign of the number being typed, or starts a negative number. */
function toggleSign(expression: string): string {
  const match = expression.match(/(\d*\.?\d+)$/);
  if (!match || match.index === undefined) {
    return `${expression}-`;
  }

  const start = match.index;
  const before = expression[start - 1];
  const beforePrevious = expression[start - 2];
  const alreadyNegative =
    before === '-' && (start === 1 || /[+\-*/%(]/.test(beforePrevious ?? ''));

  if (alreadyNegative) {
    return expression.slice(0, start - 1) + expression.slice(start);
  }
  return `${expression.slice(0, start)}-${expression.slice(start)}`;
}

function standardReducer(state: StandardState, action: StandardAction): StandardState {
  if (action.type === 'recall') {
    return {
      ...state,
      expression: action.value,
      result: '',
      justEvaluated: false,
      error: '',
    };
  }
  if (action.type === 'clear-history') {
    return { ...state, history: [] };
  }

  const key = action.key;

  switch (key) {
    case 'clear':
      return { ...state, expression: '', result: '', justEvaluated: false, error: '' };

    case 'back':
      if (state.justEvaluated) {
        return { ...state, expression: '', result: '', justEvaluated: false, error: '' };
      }
      return { ...state, expression: state.expression.slice(0, -1), error: '' };

    case 'eq': {
      if (state.justEvaluated) return state;
      const expression = autoCloseExpression(state.expression.trim());
      if (!expression) return state;
      try {
        const result = formatNumber(evaluateExpression(expression));
        return {
          ...state,
          result,
          justEvaluated: true,
          error: '',
          history: [{ expression, result }, ...state.history].slice(0, 20),
        };
      } catch (error) {
        return {
          ...state,
          error: error instanceof Error ? error.message : 'Invalid expression',
        };
      }
    }

    case 'sign': {
      if (state.justEvaluated) {
        const value = state.result;
        return {
          ...state,
          expression: value.startsWith('-') ? value.slice(1) : `-${value}`,
          result: '',
          justEvaluated: false,
          error: '',
        };
      }
      return {
        ...state,
        expression: toggleSign(state.expression),
        result: '',
        justEvaluated: false,
        error: '',
      };
    }

    case '.': {
      if (state.justEvaluated) {
        return { ...state, expression: '0.', result: '', justEvaluated: false, error: '' };
      }
      const trailing = state.expression.match(/(\d*\.?\d*)$/)?.[0] ?? '';
      if (trailing.includes('.')) return state;
      if (/[)%πe]$/.test(state.expression)) {
        return { ...state, expression: `${state.expression}*0.`, error: '' };
      }
      return {
        ...state,
        expression: state.expression + (trailing ? '.' : '0.'),
        error: '',
      };
    }

    case '%': {
      if (state.justEvaluated) {
        return {
          ...state,
          expression: `${state.result || '0'}%`,
          result: '',
          justEvaluated: false,
          error: '',
        };
      }
      if (!/[\d)%πe]$/.test(state.expression)) return state;
      return { ...state, expression: `${state.expression}%`, error: '' };
    }

    case 'sqrt':
    case 'log':
    case 'ln': {
      // Functions wrap the whole expression that is currently on the display,
      // which keeps the transformation visible instead of guessing at the
      // "current entry".
      const target = (state.justEvaluated ? state.result : state.expression).trimEnd();
      if (!target || /[+\-*/^(]$/.test(target)) {
        return {
          ...state,
          expression: `${target}${key}(`,
          result: '',
          justEvaluated: false,
          error: '',
        };
      }
      return {
        ...state,
        expression: `${key}(${target})`,
        result: '',
        justEvaluated: false,
        error: '',
      };
    }

    case 'square': {
      const target = (state.justEvaluated ? state.result : state.expression).trimEnd();
      if (!target || /[+\-*/^(]$/.test(target)) return state;
      return {
        ...state,
        expression: `(${target})^2`,
        result: '',
        justEvaluated: false,
        error: '',
      };
    }

    case 'pi':
    case 'e': {
      const symbol = key === 'pi' ? 'π' : 'e';
      if (state.justEvaluated) {
        return {
          ...state,
          expression: symbol,
          result: '',
          justEvaluated: false,
          error: '',
        };
      }
      if (!state.expression) {
        return { ...state, expression: symbol, error: '' };
      }
      const previousChar = state.expression[state.expression.length - 1];
      const needsProduct = /[\d)%πe]/.test(previousChar);
      return {
        ...state,
        expression: `${state.expression}${needsProduct ? '*' : ''}${symbol}`,
        error: '',
      };
    }

    case '(':
    case ')':
    case '+':
    case '-':
    case '*':
    case '/':
    case '^': {
      if (state.justEvaluated) {
        if (key === '(') {
          return { ...state, expression: '(', result: '', justEvaluated: false, error: '' };
        }
        if (key === ')') return state;
        return {
          ...state,
          expression: `${state.result || '0'}${key}`,
          result: '',
          justEvaluated: false,
          error: '',
        };
      }

      const expression = state.expression;

      if (key === '(') {
        if (!expression) return { ...state, expression: '(', error: '' };
        if (/[+\-*/^(]$/.test(expression)) {
          return { ...state, expression: `${expression}(`, error: '' };
        }
        // Write implicit multiplication explicitly so the parser stays simple.
        return { ...state, expression: `${expression}*(`, error: '' };
      }

      if (key === ')') {
        if (!expression) return state;
        const open = (expression.match(/\(/g) ?? []).length;
        const close = (expression.match(/\)/g) ?? []).length;
        if (close >= open) return state;
        if (/[+\-*/^(]$/.test(expression)) return state;
        return { ...state, expression: `${expression})`, error: '' };
      }

      if (!expression) {
        return key === '-' ? { ...state, expression: '-', error: '' } : state;
      }

      if (/[+\-*/^]$/.test(expression)) {
        if (expression === '-') {
          return key === '-' ? state : { ...state, expression: key, error: '' };
        }
        return {
          ...state,
          expression: expression.slice(0, -1) + key,
          error: '',
        };
      }

      if (key === '^' && expression.endsWith('%')) {
        return { ...state, expression: `(${expression})^`, error: '' };
      }

      return { ...state, expression: expression + key, error: '' };
    }

    default: {
      // Digits.
      if (state.justEvaluated) {
        return { ...state, expression: key, result: '', justEvaluated: false, error: '' };
      }
      const expression = state.expression;
      if (/[)%πe]$/.test(expression)) {
        return { ...state, expression: `${expression}*${key}`, error: '' };
      }
      if (expression === '0') {
        return { ...state, expression: key, error: '' };
      }
      return { ...state, expression: expression + key, error: '' };
    }
  }
}

function keypadClass(key: CalcKey): string {
  if (key === 'eq') return 'accent-fill text-[17px] font-semibold';
  if (isOperatorKey(key)) {
    return 'border border-[var(--aether-line)] bg-[var(--aether-fill)] font-semibold text-[var(--aether-accent)] hover:bg-[var(--aether-fill-2)]';
  }
  if (isFunctionKey(key)) {
    return 'border border-[var(--aether-line)] bg-[var(--aether-fill-2)] text-[var(--aether-text-1)] hover:bg-[var(--aether-fill-3)]';
  }
  if (key === 'clear' || key === 'back') {
    return 'border border-[var(--aether-line)] bg-[var(--aether-fill)] text-[var(--aether-text-3)] hover:bg-[var(--aether-fill-2)]';
  }
  return 'border border-[var(--aether-line)] bg-[var(--aether-fill)] text-[var(--aether-text-1)] hover:bg-[var(--aether-fill-2)]';
}

/**
 * Calculator.
 *
 * Two modes share one fixed frame: a standard keypad with a running history,
 * and a unit converter covering the categories people actually reach for. The
 * arithmetic engine and the conversion tables are separate modules so both
 * stay testable without React.
 */
export const CalculatorTab: React.FC = () => {
  const [mode, setMode] = useState<CalculatorMode>('standard');
  const [standard, dispatch] = useReducer(standardReducer, INITIAL_STATE);

  const [categoryId, setCategoryId] = useState(UNIT_CATEGORIES[0].id);
  const [fromId, setFromId] = useState(UNIT_CATEGORIES[0].defaultFrom);
  const [toId, setToId] = useState(UNIT_CATEGORIES[0].defaultTo);
  const [unitValue, setUnitValue] = useState('1');

  const press = (key: CalcKey) => dispatch({ type: 'key', key });

  const preview = useMemo(() => {
    if (!standard.expression.trim() || standard.justEvaluated) return '';
    try {
      return formatNumber(evaluateExpression(standard.expression));
    } catch {
      return '';
    }
  }, [standard.expression, standard.justEvaluated]);

  const category: UnitCategory = findCategory(categoryId) ?? UNIT_CATEGORIES[0];
  const fromUnit = findUnit(category, fromId) ?? category.units[0];
  const toUnit = findUnit(category, toId) ?? category.units[0];

  const trimmedValue = unitValue.trim();
  const numericValue = trimmedValue === '' ? NaN : Number(trimmedValue.replace(/,/g, ''));
  const conversion = Number.isFinite(numericValue)
    ? convertUnits(numericValue, category, fromUnit.id, toUnit.id)
    : NaN;
  const converted = Number.isFinite(conversion) ? formatNumber(conversion) : '—';
  const unitRate = formatNumber(convertUnits(1, category, fromUnit.id, toUnit.id));

  const chooseCategory = (id: string) => {
    const next = findCategory(id);
    if (!next) return;
    setCategoryId(next.id);
    setFromId(next.defaultFrom);
    setToId(next.defaultTo);
  };

  const applyQuick = (quick: QuickConversion) => {
    setCategoryId(quick.category);
    setFromId(quick.from);
    setToId(quick.to);
  };

  const swapUnits = () => {
    setFromId(toUnit.id);
    setToId(fromUnit.id);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (mode !== 'standard') return;
    const target = event.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'TEXTAREA'
    ) {
      return;
    }

    const key = event.key;
    if (key === 'Enter' || key === '=') {
      // A focused keypad button already handles Enter as its own activation.
      if (target.tagName === 'BUTTON') return;
      event.preventDefault();
      press('eq');
      return;
    }
    if (key === 'Backspace') {
      event.preventDefault();
      press('back');
      return;
    }
    if (key === 'Escape' || key === 'Delete') {
      event.preventDefault();
      press('clear');
      return;
    }
    if (/^[0-9]$/.test(key)) {
      event.preventDefault();
      press(key as CalcKey);
      return;
    }
    if (key.length === 1 && '+-*/%()^.'.includes(key)) {
      event.preventDefault();
      press(key as CalcKey);
    }
  };

  const activeHint = MODES.find((entry) => entry.id === mode)?.hint ?? '';

  return (
    <div
      className="flex flex-col gap-3 outline-none"
      style={{ height: CALC_HEIGHT }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      aria-label="Calculator"
    >
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--aether-text-3)]">
            Utilities
          </p>
          <h3 className="mt-0.5 text-[17px] font-semibold text-[var(--aether-text-1)]">
            Calculator
          </h3>
          <p className="mt-1 text-[10px] text-[var(--aether-text-3)]">{activeHint}</p>
        </div>
        <div className="flex shrink-0 rounded-lg border border-[var(--aether-line)] bg-[var(--aether-fill)] p-0.5">
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setMode(option.id)}
              aria-pressed={mode === option.id}
              className={`rounded-md px-3 py-1 text-[9.5px] font-semibold transition ${
                mode === option.id
                  ? 'bg-[var(--aether-fill-3)] text-[var(--aether-text-1)]'
                  : 'text-[var(--aether-text-3)] hover:text-[var(--aether-text-1)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'standard' ? (
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="notch-card shrink-0 rounded-2xl px-4 py-2.5">
              <div className="h-4 overflow-hidden text-right text-[10px] text-[var(--aether-text-3)]">
                {standard.justEvaluated ? `${prettyExpression(standard.expression)} =` : ''}
              </div>
              <div
                className="no-scrollbar overflow-x-auto whitespace-nowrap text-right font-mono text-[30px] font-semibold leading-tight text-[var(--aether-text-1)]"
                aria-live="polite"
              >
                {standard.justEvaluated
                  ? standard.result
                  : standard.expression
                    ? prettyExpression(standard.expression)
                    : '0'}
              </div>
              <div className="h-4 overflow-hidden text-right text-[10px]">
                {standard.error ? (
                  <span className="text-[var(--aether-danger)]">{standard.error}</span>
                ) : !standard.justEvaluated && preview ? (
                  <span className="text-[var(--aether-accent)]">= {preview}</span>
                ) : null}
              </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-5 grid-rows-6 gap-1.5">
              {KEYPAD.flat().map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => press(key)}
                  aria-label={keyLabel(key)}
                  className={`flex min-h-0 items-center justify-center rounded-xl transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--aether-accent)] ${
                    key === '0' ? 'col-span-2' : ''
                  } ${
                    isFunctionKey(key)
                      ? key === 'sqrt'
                        ? 'text-[17px] font-semibold'
                        : 'text-[12px] font-semibold'
                      : 'text-[15px] font-medium'
                  } ${keypadClass(key)}`}
                >
                  {key === 'back' ? <Delete size={15} /> : keyFace(key)}
                </button>
              ))}
            </div>
          </div>

          <aside className="notch-card flex w-[212px] shrink-0 flex-col rounded-2xl p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--aether-text-3)]">
                History
              </p>
              {standard.history.length ? (
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'clear-history' })}
                  className="rounded px-1 text-[9px] text-[var(--aether-text-3)] transition hover:text-[var(--aether-text-1)]"
                >
                  Clear
                </button>
              ) : null}
            </div>
            <div className="no-scrollbar mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
              {standard.history.length ? (
                standard.history.map((entry, index) => (
                  <button
                    key={`${entry.expression}-${index}`}
                    type="button"
                    onClick={() =>
                      dispatch({ type: 'recall', value: entry.result })
                    }
                    title={`${prettyExpression(entry.expression)} = ${entry.result}`}
                    className="block w-full rounded-lg px-2 py-1.5 text-right transition hover:bg-[var(--aether-fill-2)]"
                  >
                    <span className="block truncate text-[9px] text-[var(--aether-text-3)]">
                      {prettyExpression(entry.expression)}
                    </span>
                    <span className="block truncate font-mono text-[12px] text-[var(--aether-text-1)]">
                      = {entry.result}
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-[9.5px] leading-relaxed text-[var(--aether-text-3)]">
                  Results you calculate land here. Click one to keep working from it.
                </p>
              )}
            </div>
          </aside>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex shrink-0 flex-wrap gap-1">
            {UNIT_CATEGORIES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => chooseCategory(entry.id)}
                aria-pressed={entry.id === category.id}
                className={`rounded-full px-2.5 py-1 text-[9px] font-semibold transition ${
                  entry.id === category.id
                    ? 'accent-fill'
                    : 'border border-[var(--aether-line)] bg-[var(--aether-fill)] text-[var(--aether-text-2)] hover:text-[var(--aether-text-1)]'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-2.5">
            <div className="notch-card flex min-w-0 flex-col gap-2 rounded-2xl p-3">
              <div>
                <label
                  htmlFor="aether-calc-from-value"
                  className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--aether-text-3)]"
                >
                  From
                </label>
                <input
                  id="aether-calc-from-value"
                  value={unitValue}
                  onChange={(event) => setUnitValue(event.target.value)}
                  inputMode="decimal"
                  spellCheck={false}
                  placeholder="0"
                  aria-label="Value to convert"
                  className="mt-1 w-full min-w-0 bg-transparent font-mono text-[28px] font-semibold leading-none text-[var(--aether-text-1)] outline-none placeholder:text-[var(--aether-text-3)]"
                />
              </div>
              <select
                value={fromUnit.id}
                onChange={(event) => setFromId(event.target.value)}
                aria-label="Convert from unit"
                className="w-full rounded-lg border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2 py-1.5 text-[10px] text-[var(--aether-text-1)] outline-none"
              >
                {category.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.label} ({unit.symbol})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={swapUnits}
              aria-label="Swap units"
              title="Swap units"
              className="h-8 w-8 shrink-0 self-center rounded-full border border-[var(--aether-line)] bg-[var(--aether-fill)] text-[var(--aether-text-3)] transition hover:text-[var(--aether-text-1)]"
            >
              <ArrowDownUp size={14} className="mx-auto" />
            </button>

            <div className="notch-card flex min-w-0 flex-col gap-2 rounded-2xl p-3">
              <div>
                <p className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--aether-text-3)]">
                  To
                </p>
                <div
                  className="mt-1 truncate font-mono text-[28px] font-semibold leading-none text-[var(--aether-accent)]"
                  aria-live="polite"
                >
                  {converted}
                </div>
                <p className="mt-1 truncate text-[9px] text-[var(--aether-text-3)]">
                  1 {fromUnit.symbol} = {unitRate} {toUnit.symbol}
                </p>
              </div>
              <select
                value={toUnit.id}
                onChange={(event) => setToId(event.target.value)}
                aria-label="Convert to unit"
                className="w-full rounded-lg border border-[var(--aether-line)] bg-[var(--aether-fill)] px-2 py-1.5 text-[10px] text-[var(--aether-text-1)] outline-none"
              >
                {category.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.label} ({unit.symbol})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="notch-card flex min-h-0 flex-1 flex-col rounded-2xl p-3">
            <p className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--aether-text-3)]">
              All {category.label.toLowerCase()} units
            </p>
            <div className="no-scrollbar mt-2 grid min-h-0 flex-1 grid-cols-3 content-start gap-1 overflow-y-auto pr-0.5">
              {category.units.map((unit) => {
                const allUnitsValue = Number.isFinite(numericValue)
                  ? convertUnits(numericValue, category, fromUnit.id, unit.id)
                  : NaN;
                return (
                  <div
                    key={unit.id}
                    className="flex items-baseline justify-between gap-2 rounded-lg bg-[var(--aether-fill)] px-2 py-1.5"
                  >
                    <span className="shrink-0 text-[9px] text-[var(--aether-text-3)]">
                      {unit.symbol}
                    </span>
                    <span className="truncate font-mono text-[10px] text-[var(--aether-text-1)]">
                      {Number.isFinite(allUnitsValue) ? formatNumber(allUnitsValue) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="shrink-0">
            <p className="text-[8.5px] font-semibold uppercase tracking-[0.16em] text-[var(--aether-text-3)]">
              Common conversions
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {QUICK_CONVERSIONS.map((quick) => {
                const active =
                  quick.category === category.id &&
                  quick.from === fromUnit.id &&
                  quick.to === toUnit.id;
                return (
                  <button
                    key={quick.label}
                    type="button"
                    onClick={() => applyQuick(quick)}
                    aria-pressed={active}
                    className={`rounded-full px-2.5 py-1 text-[9px] font-semibold transition ${
                      active
                        ? 'accent-fill'
                        : 'border border-[var(--aether-line)] bg-[var(--aether-fill)] text-[var(--aether-text-2)] hover:border-[var(--aether-line-strong)] hover:text-[var(--aether-text-1)]'
                    }`}
                  >
                    {quick.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};