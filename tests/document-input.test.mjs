import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(
  new URL('../lib/document-input.ts', import.meta.url),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText;
const { fileError, validExpiration, searchText, compareExpiration } =
  await import(
    'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  );

test('real calendar dates including leap days are validated', () => {
  assert.equal(validExpiration('2026-02-29'), false);
  assert.equal(validExpiration('2028-02-29'), true);
  assert.equal(validExpiration('2026-04-31'), false);
  assert.equal(validExpiration('2026-13-01'), false);
  assert.equal(validExpiration(''), true);
});
test('search treats accented Spanish words and capitalization alike', () => {
  assert.equal(
    searchText('  REVISIÓN técnica  '),
    searchText('revision tecnica'),
  );
});
test('undated documents sort after dated documents', () => {
  assert.deepEqual(['', '2027-01-01', '2026-09-01'].sort(compareExpiration), [
    '2026-09-01',
    '2027-01-01',
    '',
  ]);
});
test('file selection rejects empty, oversized and unsupported files', () => {
  assert.equal(
    fileError({ size: 10 * 1024 * 1024, type: 'application/pdf' }),
    null,
  );
  assert.ok(fileError({ size: 0, type: 'image/jpeg' }));
  assert.ok(fileError({ size: 10 * 1024 * 1024 + 1, type: 'application/pdf' }));
  assert.ok(fileError({ size: 100, type: 'text/html' }));
});
