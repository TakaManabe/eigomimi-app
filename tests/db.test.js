import { test } from 'node:test';
import assert from 'node:assert/strict';
// Node には IndexedDB がないため、localStorage フォールバック経路をテストする
const mem = new Map();
globalThis.localStorage = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const db = await import('../js/db.js');

test('put/get/getAll/del (fallback)', async () => {
  await db.put('progress', { itemId: 'v01', stage: 1 });
  await db.put('progress', { itemId: 'v01', stage: 2 });
  assert.equal((await db.get('progress', 'v01')).stage, 2);
  assert.equal((await db.getAll('progress')).length, 1);
  const id = await db.put('sessions', { date: '2026-09-02', itemId: 'v01' });
  assert.equal(id, 1);
  assert.equal((await db.getAllByIndex('sessions', 'date', '2026-09-02')).length, 1);
  await db.del('progress', 'v01');
  assert.equal(await db.get('progress', 'v01'), null);
  assert.ok(db.isFallback());
});

test('validateBackup が不正な入力を拒否する', () => {
  assert.throws(() => db.validateBackup(null), /形式/);
  assert.throws(() => db.validateBackup({ app: 'other' }), /バックアップファイルではありません/);
  assert.throws(() => db.validateBackup({ app: 'eigomimi', schema: 99, data: {} }), /未対応/);
  assert.throws(() => db.validateBackup({ app: 'eigomimi', schema: 1, data: { progress: 'x' } }), /配列/);
  assert.ok(db.validateBackup({ app: 'eigomimi', schema: 1, data: {} }));
});

test('export → import (replace) roundtrip', async () => {
  await db.put('settings', { key: 'targetReps', value: 12 });
  await db.put('repCounts', { key: '2026-09-02|æ', date: '2026-09-02', sound: 'æ', count: 30 });
  const dump = await db.exportAll();
  assert.equal(dump.app, 'eigomimi');
  assert.equal(dump.data.repCounts.length, 1);
  await db.clear('repCounts');
  const st = await db.importAll(dump, { mode: 'replace' });
  assert.equal(st.repCounts, 1);
  assert.equal((await db.get('repCounts', '2026-09-02|æ')).count, 30);
  assert.equal((await db.get('settings', 'targetReps')).value, 12);
});

test('importAll は破損行をスキップし、不正なファイルで例外を投げる', async () => {
  await assert.rejects(db.importAll({ app: 'eigomimi', schema: 1, data: { progress: 'bad' } }), /配列/);
  const st = await db.importAll({ app: 'eigomimi', schema: 1, data: { progress: [null, 5, { stage: 1 }, { itemId: 'v02' }] } });
  assert.equal(st.progress, 1);
});
