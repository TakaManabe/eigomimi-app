import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const drill = JSON.parse(readFileSync(new URL('../data/drill-words.json', import.meta.url)));

test('単語は一意で、語数が十分', () => {
  const seen = new Set();
  for (const w of drill.words) { assert.ok(w.word && w.sound, JSON.stringify(w)); assert.ok(!seen.has(w.word), `重複 ${w.word}`); seen.add(w.word); }
  assert.ok(drill.words.length >= 1000);
});
test('セットの各音に 20 語以上、例語は同じ音', () => {
  for (const s of drill.sets) {
    assert.ok(s.sounds.length >= 2, s.id);
    for (const snd of s.sounds) assert.ok(drill.words.filter(w => w.sound === snd).length >= 20, `${s.id} ${snd}`);
    for (const [snd, ex] of Object.entries(s.examples || {})) { const w = drill.words.find(w => w.word === ex); assert.ok(w && w.sound === snd, `${s.id} 例語 ${ex}`); }
  }
});
test('強調範囲 hl は語内に収まり母音字を含む', () => {
  for (const w of drill.words) {
    assert.ok(w.hl, `${w.word} hl なし`);
    const [a, b] = w.hl; assert.ok(a >= 0 && b > a && b <= w.word.length, w.word);
    assert.ok(/[aeiouy]/i.test(w.word.slice(a, b)), `${w.word} "${w.word.slice(a, b)}"`);
  }
});
test('/ʌ/ の綴り例外語を収録', () => {
  const u = new Set(drill.words.filter(w => w.sound === 'ʌ').map(w => w.word));
  for (const w of 'love come some done money mother brother other nothing Monday young country cousin enough tough blood flood does'.split(' ')) assert.ok(u.has(w), w);
});
test('body / bat / but が基準語', () => {
  const d01 = drill.sets.find(s => s.id === 'd01');
  assert.deepEqual(d01.examples, { 'ɑ': 'body', 'æ': 'bat', 'ʌ': 'but' });
});
