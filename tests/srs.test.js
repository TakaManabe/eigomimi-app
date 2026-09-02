import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRating, newProgress, planToday, computeStreak, addDays, diffDays, suggestRating, confusionPairs, accuracy, rebaseBackupDates, INTERVALS } from '../js/srs.js';

const item2 = { id: 'v01', order: 1, sounds: ['ɑ', 'æ', 'ʌ'], tracks: [26, 27, 28], dayCount: 2 };
const item1 = { id: 'v06', order: 6, sounds: ['ɔː'], tracks: [33], dayCount: 1 };
const T = '2026-09-02';

test('addDays / diffDays', () => {
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(diffDays('2026-09-01', '2026-09-08'), 7);
});

test('新規2日構成: 1日目○ → 翌日2日目、2日目○ → 復習1日後、以降 1,2,4,7,14,30,60', () => {
  let p = newProgress(item2);
  p = applyRating(p, '○', T);
  assert.equal(p.status, 'learning'); assert.equal(p.currentDay, 2); assert.equal(p.nextDate, addDays(T, 1));
  let day = addDays(T, 1);
  p = applyRating(p, '○', day);
  assert.equal(p.status, 'review'); assert.equal(p.stage, 1); assert.equal(p.nextDate, addDays(day, 1));
  const expected = [2, 4, 7, 14, 30, 60, 60];
  for (const iv of expected) {
    day = p.nextDate;
    p = applyRating(p, '○', day);
    assert.equal(diffDays(day, p.nextDate), iv);
  }
  assert.equal(p.stage, INTERVALS.length - 1);
});

test('×: 翌日、段階0にリセット。△: 2日後で段階維持。◎: 2段階進む。未: 翌日持ち越し', () => {
  let p = { ...newProgress(item1), status: 'review', stage: 3 };
  const x = applyRating(p, '×', T); assert.equal(x.nextDate, addDays(T, 1)); assert.equal(x.stage, 0);
  const tri = applyRating(p, '△', T); assert.equal(tri.nextDate, addDays(T, 2)); assert.equal(tri.stage, 3);
  const oo = applyRating(p, '◎', T); assert.equal(oo.stage, 5); assert.equal(diffDays(T, oo.nextDate), INTERVALS[4]);
  const none = applyRating(p, '未', T); assert.equal(none.nextDate, addDays(T, 1)); assert.equal(none.stage, 3); assert.equal(none.ratings.at(-1).rating, '未');
});

test('新規1日目に×: 同じ日をやり直し', () => {
  const p = applyRating(newProgress(item2), '×', T);
  assert.equal(p.currentDay, 1); assert.equal(p.status, 'learning'); assert.equal(p.nextDate, addDays(T, 1));
});

test('1日構成の項目は1日目終了で復習段階へ', () => {
  const p = applyRating(newProgress(item1), '◎', T);
  assert.equal(p.status, 'review'); assert.equal(p.stage, 2); assert.equal(diffDays(T, p.nextDate), INTERVALS[1]);
});

test('planToday: 期限の復習すべて + 新規は1日1つ、延期で0', () => {
  const items = [item2, { ...item2, id: 'v02', order: 2 }, { ...item2, id: 'v03', order: 3 }, item1];
  const prog = [
    { ...newProgress(item2), status: 'review', nextDate: '2026-09-01' },
    { ...newProgress(items[1]), status: 'review', nextDate: T },
    { ...newProgress(items[2]), status: 'review', nextDate: addDays(T, 3) },
  ];
  const plan = planToday(prog, items, T);
  assert.equal(plan.reviews.length, 2);
  assert.equal(plan.fresh.item.id, 'v06');
  assert.equal(plan.learning, null);
  const p2 = planToday(prog, items, T, { postponeNewUntil: addDays(T, 1) });
  assert.equal(p2.fresh, null); assert.equal(p2.postponed, true);
  const p3 = planToday(prog, items, T, { startedNewToday: true });
  assert.equal(p3.fresh, null);
});

test('planToday: 学習中があれば新規は出さない', () => {
  const items = [item2, item1];
  const prog = [{ ...newProgress(item2), status: 'learning', currentDay: 2, nextDate: T }];
  const plan = planToday(prog, items, T);
  assert.equal(plan.learning.item.id, 'v01'); assert.equal(plan.fresh, null);
});

test('streak', () => {
  assert.equal(computeStreak(['2026-09-02', '2026-09-01', '2026-08-31'], T), 3);
  assert.equal(computeStreak(['2026-09-01', '2026-08-31'], T), 2); // 今日未実施でも昨日まで継続
  assert.equal(computeStreak(['2026-08-30'], T), 0);
});

test('suggestRating / accuracy / confusionPairs (最初の回答のみ)', () => {
  assert.equal(suggestRating(9, 10), '◎'); assert.equal(suggestRating(7, 10), '○'); assert.equal(suggestRating(5, 10), '△'); assert.equal(suggestRating(2, 10), '×');
  const log = [
    { first: true, correct: false, playedSound: 'æ', chosenSound: 'ʌ' },
    { first: false, correct: true, playedSound: 'æ', chosenSound: 'æ' },
    { first: true, correct: false, playedSound: 'æ', chosenSound: 'ʌ' },
    { first: true, correct: true, playedSound: 'ɑ', chosenSound: 'ɑ' },
  ];
  assert.deepEqual(accuracy(log), { correct: 1, total: 3, ratio: 1 / 3 });
  assert.deepEqual(confusionPairs(log), [{ from: 'æ', to: 'ʌ', count: 2 }]);
});

test('rebaseBackupDates', () => {
  const b = { data: { sessions: [{ date: '2026-08-30' }, { date: '2026-09-01' }], repCounts: [{ key: '2026-09-01|æ', date: '2026-09-01' }], progress: [{ nextDate: '2026-09-08', ratings: [{ date: '2026-09-01' }] }] } };
  rebaseBackupDates(b, '2026-09-10');
  assert.equal(b.data.sessions[1].date, '2026-09-10');
  assert.equal(b.data.sessions[0].date, '2026-09-08');
  assert.equal(b.data.repCounts[0].key, '2026-09-10|æ');
  assert.equal(b.data.progress[0].nextDate, '2026-09-17');
  assert.equal(b.data.progress[0].ratings[0].date, '2026-09-10');
});
