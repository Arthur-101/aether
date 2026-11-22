/**
 * Checks the universal input bar's parsing without a browser.
 *
 * Node strips the types, so this imports the real module the app ships.
 */

import assert from 'node:assert/strict';
import {
  INPUT_COMMANDS,
  formatQuantity,
  looksLikeMath,
  normalizeMath,
  parseCurrencyInput,
  parseDuration,
  parseInputBar,
  parseUnitInput,
} from '../src/components/InputBar/parseInputBar.ts';
import { evaluateExpression } from '../src/components/Island/calculatorMath.ts';

const cur = parseCurrencyInput;
assert.deepEqual(cur('$1'), { amount: 1, from: 'USD', to: null });
assert.deepEqual(cur('1 dollar'), { amount: 1, from: 'USD', to: null });
assert.deepEqual(cur('1 dollar in euro'), { amount: 1, from: 'USD', to: 'EUR' });
assert.deepEqual(cur('1 usd to inr'), { amount: 1, from: 'USD', to: 'INR' });
assert.deepEqual(cur('€25'), { amount: 25, from: 'EUR', to: null });
assert.deepEqual(cur('₹1,000'), { amount: 1000, from: 'INR', to: null });
assert.deepEqual(cur('2.5 eur in jpy'), { amount: 2.5, from: 'EUR', to: 'JPY' });
// Unknown words are questions, not conversions.
assert.equal(cur('1 doller'), null);
assert.equal(cur('hello world'), null);
// Arithmetic must never be mistaken for a currency pair.
assert.equal(cur('43+54-23/12'), null);

assert.equal(looksLikeMath('43+54-23/12'), true);
assert.equal(looksLikeMath('2 * (3 + 4)'), true);
assert.equal(looksLikeMath('42'), false);
assert.equal(looksLikeMath('-7'), false);
assert.equal(looksLikeMath('what is 2+2'), false);

// Spoken percentages: "54% of 200" multiplies, "50 of 200" asks for a share.
assert.equal(normalizeMath('54% of 200'), '54%*200');
assert.equal(normalizeMath('50 of 200'), '(50/200*100)');
assert.equal(normalizeMath('43+54'), '43+54');
const percent = (text) => evaluateExpression(normalizeMath(text));
assert.equal(percent('54% of 200'), 108);
assert.equal(percent('50 of 200'), 25);
assert.equal(percent('54 % of 200'), 108);
assert.equal(looksLikeMath('54% of 200'), true);
assert.equal(looksLikeMath('50 of 200'), true);
assert.equal(looksLikeMath('50 of the users'), false);

assert.equal(parseDuration('5m'), 300);
assert.equal(parseDuration('1h30m'), 5400);
assert.equal(parseDuration('45s'), 45);
assert.equal(parseDuration('5'), 300);
assert.equal(parseDuration('1 day'), null);
assert.equal(parseDuration(''), null);

const names = new Set(INPUT_COMMANDS.map((command) => command.name));
assert.equal(names.size, INPUT_COMMANDS.length, 'command names stay unique');
assert.ok(names.has('/timer'));
assert.ok(names.has('/stopwatch-lap'));

const unit = parseUnitInput;
const shows = (text) => formatQuantity(unit(text).value);
assert.equal(shows('1 feet in inch'), '12');
assert.equal(shows('1 ft to in'), '12');
assert.equal(shows('5ft in cm'), '152.4');
assert.equal(shows('1 mile in km'), '1.609344');
assert.equal(shows('100 cm in m'), '1');
assert.equal(shows('1 kg in lb'), '2.2046226');
assert.equal(shows('100 c in f'), '212');
assert.equal(shows('-40 c in f'), '-40');
assert.equal(shows('273.15 k in c'), '0');
assert.equal(shows('1 l in ml'), '1000');
assert.equal(shows('1 gallon in l'), '3.7854118');
assert.equal(shows('1 acre in m2'), '4046.8564');
assert.equal(shows('1 acre in m\u00B2'), '4046.8564');
assert.equal(shows('1 gb in mb'), '1024');
assert.equal(shows('60 mph in kmh'), '96.56064');
assert.equal(shows('1 week in hours'), '168');
// Spoken forms.
assert.equal(shows('convert 2.5 l to ml'), '2500');
assert.equal(shows("what's 12 in in cm"), '30.48');
assert.equal(shows('how many inches in 2 feet'), '24');
assert.equal(shows('1 feet in inch :'), '12');
// Categories never mix, and prose stays prose.
assert.equal(unit('5 kg in cm'), null);
assert.equal(unit('hello world'), null);
assert.equal(unit('5 ft'), null);
assert.equal(unit('5 in the morning'), null);
assert.equal(formatQuantity(2.2046226218487757), '2.2046226');
assert.equal(formatQuantity(0.000001), '0.000001');

// The bar checks units before currency: "sec" and "ms" look like ISO codes.
assert.equal(parseInputBar('1 sec in ms').kind, 'unit');
assert.equal(parseInputBar('1 ft in cm').kind, 'unit');
assert.equal(parseInputBar('1 usd to inr').kind, 'currency');
assert.equal(parseInputBar('43+54-23/12').kind, 'math');

assert.deepEqual(parseInputBar(''), { kind: 'empty' });
assert.deepEqual(parseInputBar('   '), { kind: 'empty' });
assert.deepEqual(parseInputBar('/'), { kind: 'command-list' });
assert.deepEqual(parseInputBar('/stop'), { kind: 'command-list' });
assert.deepEqual(parseInputBar('/timer 5m'), {
  kind: 'command',
  name: 'timer',
  arg: '5m',
});
assert.deepEqual(parseInputBar('/timer'), {
  kind: 'command',
  name: 'timer',
  arg: '',
});
assert.deepEqual(parseInputBar('/nope now'), {
  kind: 'unknown-command',
  name: 'nope',
});
assert.deepEqual(parseInputBar('$1'), {
  kind: 'currency',
  amount: 1,
  from: 'USD',
  to: null,
});
assert.deepEqual(parseInputBar('43+54-23/12'), {
  kind: 'math',
  expression: '43+54-23/12',
});
assert.deepEqual(parseInputBar('50 of 200'), {
  kind: 'math',
  expression: '50 of 200',
});
assert.deepEqual(parseInputBar('  explain quaternions '), {
  kind: 'text',
  text: 'explain quaternions',
});

console.log('input bar checks passed');