import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(
  new URL('../lib/expiry.ts', import.meta.url),
  'utf8',
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { daysUntil, formatExpiry } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
);

test('today, tomorrow and yesterday use complete calendar days', () => {
  const now = new Date('2026-09-02T16:00:00Z');
  assert.equal(daysUntil('2026-09-02', now), 0);
  assert.equal(daysUntil('2026-09-03', now), 1);
  assert.equal(daysUntil('2026-09-01', now), -1);
});
test('UTC date changes do not move the date in Chile early', () => {
  assert.equal(daysUntil('2026-09-02', new Date('2026-09-03T02:00:00Z')), 0);
});
test('summer timezone and month/year boundaries are supported', () => {
  assert.equal(daysUntil('2027-01-01', new Date('2027-01-01T01:00:00Z')), 1);
  assert.equal(daysUntil('2026-03-01', new Date('2026-02-28T15:00:00Z')), 1);
});
test('documents without expiration do not trigger reminders', () => {
  assert.equal(daysUntil(''), Infinity);
  assert.equal(formatExpiry(''), 'Sin vencimiento');
});
test('invalid date text cannot become an urgent reminder', () => {
  assert.ok(Number.isNaN(daysUntil('invalid')));
});
