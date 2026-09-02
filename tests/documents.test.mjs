import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const records = new Map();
let commits = 0;
let failAt = Infinity;
const ref = (...parts) =>
  parts.filter((part) => typeof part === 'string').join('/');
globalThis.__readycarMock = {
  Bytes: { fromUint8Array: (bytes) => ({ toUint8Array: () => bytes }) },
  collection: ref,
  doc: ref,
  query: (path) => path,
  orderBy: () => null,
  onSnapshot: () => () => {},
  getDocs: async (path) => {
    const docs = [...records]
      .filter(
        ([key]) =>
          key.startsWith(path + '/') &&
          !key.slice(path.length + 1).includes('/'),
      )
      .map(([key, value]) => ({
        ref: key,
        id: key.split('/').at(-1),
        data: () => value,
      }))
      .sort((a, b) => a.data().index - b.data().index);
    return {
      docs,
      size: docs.length,
      empty: !docs.length,
      forEach: (callback) => docs.forEach(callback),
    };
  },
  writeBatch: () => {
    const pending = [];
    return {
      set: (key, value) => pending.push(() => records.set(key, value)),
      delete: (key) => pending.push(() => records.delete(key)),
      update: (key, value) =>
        pending.push(() => records.set(key, { ...records.get(key), ...value })),
      commit: async () => {
        commits++;
        if (commits === failAt) throw new Error('Simulated interruption');
        pending.forEach((op) => op());
      },
    };
  },
};
const inputCode = ts.transpileModule(
  readFileSync(new URL('../lib/document-input.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext } },
).outputText;
const inputUrl =
  'data:text/javascript;base64,' + Buffer.from(inputCode).toString('base64');
const source = readFileSync(
  new URL('../lib/readycar-cloud.ts', import.meta.url),
  'utf8',
);
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  .outputText.replace(
    /import\s*\{([^}]+)\}\s*from 'firebase\/firestore';/,
    'const {$1} = globalThis.__readycarMock;',
  )
  .replace(
    /import\s*\{ firestore \}\s*from '.\/firebase';/,
    'const firestore = {};',
  )
  .replace("'./document-input'", JSON.stringify(inputUrl));
const { saveCloudDocument, getCloudDocumentBlob } = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
);
const user = { uid: 'test-user' };
const document = {
  id: 1,
  name: 'SOAP',
  type: 'SOAP',
  vehicleId: 1,
  expirationDate: '2027-01-01',
};

test('interrupted replacement preserves the previous downloadable file', async () => {
  records.clear();
  commits = 0;
  failAt = Infinity;
  const original = await saveCloudDocument(
    user,
    document,
    new File(['original'], 'original.pdf', { type: 'application/pdf' }),
  );
  failAt = commits + 2;
  await assert.rejects(
    saveCloudDocument(
      user,
      original,
      new File([new Uint8Array(4 * 1024 * 1024)], 'new.pdf', {
        type: 'application/pdf',
      }),
    ),
  );
  assert.equal(
    records.get('users/test-user/documents/1').fileName,
    'original.pdf',
  );
  assert.equal(
    await (await getCloudDocumentBlob(user.uid, original)).text(),
    'original',
  );
});
test('successful renewal archives the previous record and keeps its file', async () => {
  records.clear();
  commits = 0;
  failAt = Infinity;
  const original = await saveCloudDocument(
    user,
    document,
    new File(['old'], 'old.pdf', { type: 'application/pdf' }),
  );
  await saveCloudDocument(
    user,
    { ...document, id: 2, previousId: 1 },
    new File(['renewed'], 'renewed.pdf', { type: 'application/pdf' }),
  );
  assert.equal(records.get('users/test-user/documents/1').archived, true);
  assert.equal(
    await (await getCloudDocumentBlob(user.uid, original)).text(),
    'old',
  );
});
test('oversized and unsupported files are rejected before changing the document', async () => {
  records.clear();
  commits = 0;
  failAt = Infinity;
  await assert.rejects(
    saveCloudDocument(
      user,
      document,
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.pdf', {
        type: 'application/pdf',
      }),
    ),
    /10 MB/,
  );
  await assert.rejects(
    saveCloudDocument(
      user,
      document,
      new File(['script'], 'script.html', { type: 'text/html' }),
    ),
  );
  assert.equal(records.has('users/test-user/documents/1'), false);
});

test('progress reaches 100 only after the document is committed', async () => {
  records.clear();
  commits = 0;
  failAt = Infinity;
  const progress = [];
  await saveCloudDocument(
    user,
    document,
    new File([new Uint8Array(4 * 1024 * 1024)], 'scan.pdf', {
      type: 'application/pdf',
    }),
    (value) => {
      progress.push(value);
      if (value === 100)
        assert.equal(
          records.get('users/test-user/documents/1').fileName,
          'scan.pdf',
        );
    },
  );
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 100);
  assert.ok(progress.some((value) => value > 0 && value < 95));
});
test('invalid calendar date and zero-byte file are rejected without writes', async () => {
  records.clear();
  commits = 0;
  failAt = Infinity;
  await assert.rejects(
    saveCloudDocument(
      user,
      { ...document, expirationDate: '2026-02-30' },
      new File(['scan'], 'scan.pdf', { type: 'application/pdf' }),
    ),
    /Fecha/,
  );
  await assert.rejects(
    saveCloudDocument(
      user,
      document,
      new File([], 'empty.pdf', { type: 'application/pdf' }),
    ),
    /vacío/,
  );
  assert.equal(commits, 0);
});
