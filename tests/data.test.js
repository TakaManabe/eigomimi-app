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

// ---------- CMU 発音辞書との照合（tests/cmu-vowels.json は build-drill-words.py が生成）----------
const cmu = JSON.parse(readFileSync(new URL('./cmu-vowels.json', import.meta.url)));
test('全語の母音が CMU 発音辞書と一致（方言差・未収録は明示的に許容）', () => {
  for (const w of drill.words) {
    if (cmu.cmu_missing[w.word]) continue;
    const cand = cmu.vowels[w.word];
    assert.ok(cand, `${w.word} が CMU 照合結果にない`);
    if (cmu.dialect_ok[w.word]) continue;
    assert.ok(cand.includes(w.sound), `${w.word}: bank=${w.sound} cmu=${cand.join('/')}`);
  }
});
test('品詞や方言で読みが割れる語は入っていない', () => {
  const has = new Set(drill.words.map(w => w.word));
  for (const w of 'live minute dove our object contract conflict idea hotel wallet'.split(' ')) assert.ok(!has.has(w), w);
});

// ---------- フォニックス・コース ----------
const STAGES = ['P1', 'P2', 'P3', 'P4', 'P5'];
// app.js の selectWords / build-drill-words.py の select と同じ規則
function selectWords(sel) {
  let out = drill.words;
  if (sel.st) out = out.filter(w => sel.st.includes(w.st));
  if (sel.upto) { const lim = STAGES.indexOf(sel.upto); out = out.filter(w => STAGES.indexOf(w.st) >= 0 && STAGES.indexOf(w.st) <= lim); }
  if (sel.g) out = out.filter(w => sel.g.includes(w.g));
  if (sel.note) out = out.filter(w => w.note);
  if (sel.sounds) out = out.filter(w => sel.sounds.includes(w.sound));
  return out;
}
test('全語に綴りパターン g とステージ st が付いている', () => {
  for (const w of drill.words) {
    assert.ok(w.g && /[aeiouy]/.test(w.g), `${w.word} g=${w.g}`);
    assert.ok(STAGES.includes(w.st), `${w.word} st=${w.st}`);
    assert.equal(w.g.replace('_e', ''), w.word.slice(w.hl[0], w.hl[1]).toLowerCase(), `${w.word} g と hl が食い違う`);
  }
});
test('コースの各ステップは 40 語以上・選択肢 2 つ以上、n と sounds が実データと一致', () => {
  const ids = new Set();
  for (const stage of drill.course) {
    assert.ok(stage.steps.length, stage.id);
    for (const step of stage.steps) {
      assert.ok(!ids.has(step.id), `重複 ${step.id}`); ids.add(step.id);
      const ws = selectWords(step.sel);
      assert.equal(ws.length, step.n, `${step.id} 語数 ${ws.length} != ${step.n}`);
      assert.ok(ws.length >= 40, `${step.id} ${ws.length} 語`);
      assert.deepEqual([...new Set(ws.map(w => w.sound))].sort(), [...step.sounds].sort(), step.id);
      assert.ok(step.sounds.length >= 2, step.id);
      // 選択肢が 6 つ以上のステップは毎問 3 択を作るので、各音に紛らわしい音が 2 つ以上必要
      if (step.sounds.length > 5) {
        assert.ok(step.mix, `${step.id} に mix が付いていない`);
        for (const s of step.sounds) assert.ok((drill.neighbors[s] || []).filter(x => step.sounds.includes(x)).length >= 2, `${step.id} ${s}`);
      }
    }
  }
});
test('コースは 5 ステージすべての語を覆う', () => {
  const covered = new Set();
  for (const stage of drill.course) for (const step of stage.steps) for (const w of selectWords(step.sel)) covered.add(w.word);
  assert.equal(covered.size, drill.words.length, `未収録 ${drill.words.length - covered.size} 語`);
});
