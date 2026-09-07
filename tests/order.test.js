import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate } from '../order.js';

const sum = a => a.reduce((x, y) => x + y, 0);

test('取り分の合計はちょうど n', () => {
  for (const sizes of [[141, 14, 2], [92, 83, 22], [56, 3], [48], [10, 10, 10, 10], [1, 1, 1]])
    for (const n of [5, 10, 20, 50]) {
      const q = allocate(sizes, Math.min(n, sum(sizes)));
      assert.equal(sum(q), Math.min(n, sum(sizes)), `${sizes} n=${n} -> ${q}`);
      q.forEach((x, i) => assert.ok(x >= 0 && x <= sizes[i], `${sizes} -> ${q}`));
    }
});
test('語数が少ない音を毎回は出さない（any / many 問題）', () => {
  // P1-1: /æ/141 /ɑ/14 /e/2。/e/ は 2 語しか無いので毎回出てはいけない
  let hit = 0;
  for (let i = 0; i < 400; i++) if (allocate([141, 14, 2], 20)[2] > 0) hit++;
  assert.ok(hit > 0, '少数の音がまったく出ない');
  assert.ok(hit < 240, `少数の音が ${Math.round(hit / 4)}% のセッションで出る（多すぎ）`);
});
test('語数が多い音ほど多く出るが、独占はしない', () => {
  const q = allocate([141, 14, 2], 20);
  assert.ok(q[0] > q[1] && q[1] >= q[2], `${q}`);
  assert.ok(q[0] <= 17, `多数派が ${q[0]}/20 で偏りすぎ`);
});
test('プールより多く要求しても壊れない', () => {
  assert.equal(sum(allocate([3, 2], 100)), 5);
  assert.deepEqual(allocate([0, 0], 10), [0, 0]);
});
