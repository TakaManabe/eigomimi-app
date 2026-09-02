import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const cur = JSON.parse(readFileSync(new URL('../data/curriculum.json', import.meta.url)));
const words = JSON.parse(readFileSync(new URL('../data/words.json', import.meta.url)));
const sample = JSON.parse(readFileSync(new URL('../data/sample-data.json', import.meta.url)));

test('カリキュラム順序は正式な順序と一致', () => {
  const expected = [
    [[26, 27, 28], ['ɑ', 'æ', 'ʌ'], 2], [[29], ['iː', 'ɪ', 'e'], 2], [[30], ['uː', 'ʊ'], 2], [[31], ['aɪ', 'eɪ', 'ɔɪ'], 2],
    [[32], ['aʊ', 'oʊ'], 2], [[33], ['ɔː'], 1], [[34, 35, 36, 37], null, 2], [[38], ['ə'], 1]];
  const items = [...cur.items].sort((a, b) => a.order - b.order);
  assert.equal(items.length, 8);
  items.forEach((it, i) => {
    assert.deepEqual(it.tracks, expected[i][0], `tracks of item ${i + 1}`);
    if (expected[i][1]) assert.deepEqual(it.sounds, expected[i][1]);
    assert.equal(it.dayCount, expected[i][2]);
    assert.equal(it.days.length, it.dayCount);
    it.days.forEach((d, j) => { assert.equal(d.day, j + 1); assert.ok(d.words.length >= 4); assert.ok(d.mouth.length >= 1); });
  });
});

test('単語の sound はその項目の sounds に含まれる（対比用は例外として注記必須）', () => {
  const byId = Object.fromEntries(cur.items.map(i => [i.id, i]));
  for (const w of words.words) {
    const it = byId[w.item];
    assert.ok(it, `unknown item ${w.item} for ${w.word}`);
    if (!it.sounds.includes(w.sound)) assert.ok(w.note, `${w.word} (${w.sound}) は項目外の音。note が必要`);
    assert.ok(w.ipa, `${w.word} に ipa がない`);
  }
});

test('練習単語は words.json に定義されている', () => {
  const set = new Set(words.words.map(w => `${w.item}|${w.word}`));
  for (const it of cur.items) for (const d of it.days) for (const w of d.words) assert.ok(set.has(`${it.id}|${w}`), `${it.id} の ${w} が words.json にない`);
});

test('/ʌ/ の綴り例外語を収録', () => {
  const req = 'love, come, some, done, money, mother, brother, other, nothing, Monday, young, country, cousin, enough, tough, blood, flood, does'.split(', ');
  const u = new Set(words.words.filter(w => w.sound === 'ʌ').map(w => w.word));
  for (const w of req) assert.ok(u.has(w), `${w} がない`);
});

test('minimal pairs は2〜3語で、単語が存在し、音が互いに異なる', () => {
  for (const p of words.pairs) {
    assert.ok(p.words.length >= 2 && p.words.length <= 3);
    const sounds = p.words.map(w => words.words.find(x => x.word === w && x.item === p.item)?.sound);
    sounds.forEach((s, i) => assert.ok(s, `${p.words[i]} (${p.item}) が未定義`));
    assert.equal(new Set(sounds).size, sounds.length, `ペア ${p.words} の音が重複`);
  }
  for (const it of cur.items) assert.ok(words.pairs.some(p => p.item === it.id), `${it.id} にペアがない`);
});

test('サンプルデータの形式', () => {
  assert.equal(sample.app, 'eigomimi'); assert.equal(sample.schema, 1);
  for (const k of ['progress', 'sessions', 'repCounts', 'wordReps', 'quizLog', 'weakWords', 'settings', 'recordings']) assert.ok(Array.isArray(sample.data[k]), k);
  assert.ok(sample.data.sessions.length > 0);
});
