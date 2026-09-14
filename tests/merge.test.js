import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSlots, derivePassed } from '../merge.js';

const slot = o => Object.assign({ words: {}, log: [], prog: {}, conf: {} }, o);
const A = slot({
  words: { hot: { s: 3, c: 2, w: 1, lw: '2026-09-10', ls: '2026-09-10', iv: 0, due: '2026-09-11' } },
  log: [{ d: '2026-09-10', ts: 100, set: 'P1-1', n: 20, c: 18 }],
  prog: { 'P1-1': { runs: [{ n: 20, c: 19, ts: 100 }] } }, conf: { 'æ→ʌ': 2 },
});
const B = slot({
  words: { hot: { s: 5, c: 5, w: 0, lw: null, ls: '2026-09-12', iv: 2, due: '2026-09-19' }, bat: { s: 1, c: 1, w: 0 } },
  log: [{ d: '2026-09-12', ts: 200, set: 'P1-1', n: 20, c: 20 }],
  prog: { 'P1-1': { runs: [{ n: 20, c: 20, ts: 200 }] } }, conf: { 'æ→ʌ': 1, 'ɑ→ʌ': 4 },
});

test('回数は足し算、復習の予定は最後にさわった端末のものを採る', () => {
  const m = mergeSlots([A, B]);
  assert.deepEqual([m.words.hot.s, m.words.hot.c, m.words.hot.w], [8, 7, 1]);
  assert.equal(m.words.hot.due, '2026-09-19');   // B のほうが新しい
  assert.equal(m.words.hot.iv, 2);
  assert.equal(m.words.hot.lw, '2026-09-10');    // 誤答日は残っている方
  assert.equal(m.words.bat.s, 1);
  assert.deepEqual(m.conf, { 'æ→ʌ': 3, 'ɑ→ʌ': 4 });
  assert.equal(m.log.length, 2);
  assert.deepEqual(m.log.map(l => l.ts), [100, 200]);
});
test('順番を入れ替えても結果は同じ', () => {
  assert.deepEqual(mergeSlots([A, B]), mergeSlots([B, A]));
});
test('同じ持ち分を取り込み直しても増えない（冪等）', () => {
  // 実際の同期は「端末 ID をキーにしたスロットの置き換え」なので、同じ内容を
  // 何度受け取っても合算結果は変わらない
  const once = mergeSlots([A, B]);
  for (let i = 0; i < 5; i++) assert.deepEqual(mergeSlots([A, structuredClone(B)]), once);
});
test('合算しても元の持ち分を書き換えない', () => {
  // 入力を壊すと、同期のたびに値がずれていく
  const a0 = structuredClone(A), b0 = structuredClone(B);
  mergeSlots([A, B]); mergeSlots([A, B]);
  assert.deepEqual(A, a0);
  assert.deepEqual(B, b0);
});
test('合格は合算した runs から導かれ、端末をまたいで成立する', () => {
  // A も B も 1 回ずつなので単独では不合格、合わせると 2 回連続で合格
  assert.equal(mergeSlots([A]).prog['P1-1'].passed, false);
  assert.equal(mergeSlots([B]).prog['P1-1'].passed, false);
  assert.equal(mergeSlots([A, B]).prog['P1-1'].passed, true);
});
test('合格の判定は「20問以上・90%以上が2回連続」', () => {
  const r = (n, c, ts) => ({ n, c, ts });
  assert.equal(derivePassed([r(20, 18, 1), r(20, 18, 2)]), true);
  assert.equal(derivePassed([r(20, 17, 1), r(20, 18, 2)]), false);   // 85% は不可
  assert.equal(derivePassed([r(19, 19, 1), r(20, 20, 2)]), false);   // 19 問は不可
  assert.equal(derivePassed([r(20, 20, 1), r(20, 10, 2), r(20, 20, 3), r(20, 20, 4)]), true);
  // 一度合格したら、あとで崩れても合格のまま
  assert.equal(derivePassed([r(20, 20, 1), r(20, 20, 2), r(20, 5, 3)]), true);
});
test('空でも壊れない', () => {
  const m = mergeSlots([]);
  assert.deepEqual([m.words, m.log, m.prog, m.conf], [{}, [], {}, {}]);
  assert.deepEqual(mergeSlots([slot({})]).words, {});
});
