import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const drill = JSON.parse(readFileSync(new URL('../data/drill-words.json', import.meta.url)));

test('語と赤字位置の組は一意で、語数が十分', () => {
  const seen = new Set();
  for (const w of drill.words) {
    assert.ok(w.word && w.sound, JSON.stringify(w));
    const k = `${w.word}@${w.hl}`;
    assert.ok(!seen.has(k), `重複 ${k}`); seen.add(k);
  }
  assert.ok(drill.words.length >= 1700);
});
test('同じ語を 2 回出すときは赤字位置が重ならず、記録キー k が分かれている', () => {
  const byWord = new Map();
  for (const w of drill.words) { if (!byWord.has(w.word)) byWord.set(w.word, []); byWord.get(w.word).push(w); }
  for (const [word, es] of byWord) {
    if (es.length === 1) { assert.ok(!es[0].k, `${word} は 1 件なのに k がある`); continue; }
    assert.equal(es.filter(e => !e.k).length, 1, `${word} の記録キーが分かれていない`);
    for (const a of es) for (const b of es) if (a !== b) assert.ok(a.hl[1] <= b.hl[0] || b.hl[1] <= a.hl[0], `${word} 赤字位置が重なる`);
    assert.equal(new Set(es.map(e => e.k || e.word)).size, es.length, `${word} k が重複`);
  }
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
    if (w.st === 'P6') continue;   // 弱音節は位置ごとに別途検証（次のテスト）
    if (cmu.cmu_missing[w.word]) continue;
    const cand = cmu.vowels[w.word];
    assert.ok(cand, `${w.word} が CMU 照合結果にない`);
    if (cmu.dialect_ok[w.word]) continue;
    assert.ok(cand.includes(w.sound), `${w.word}: bank=${w.sound} cmu=${cand.join('/')}`);
  }
});
test('弱音節の語は CMU でその位置が無強勢だと確認済み', () => {
  const weak = drill.words.filter(w => w.st === 'P6');
  assert.ok(weak.length >= 200, `弱音節が ${weak.length} 語`);
  for (const w of weak) {
    const arpa = cmu.weak[`${w.word}@${w.hl[0]},${w.hl[1]}`];
    assert.ok(arpa, `${w.word} の弱音節検証結果が無い`);
    assert.ok(/0$/.test(arpa), `${w.word}: ${arpa} は無強勢でない`);
    assert.equal({ 'ə': true, 'ɚ': true, 'i': true }[w.sound], true, `${w.word} の音 ${w.sound}`);
  }
});
test('品詞や方言で読みが割れる語は入っていない', () => {
  const has = new Set(drill.words.map(w => w.word));
  for (const w of 'live minute dove our object contract conflict idea hotel wallet'.split(' ')) assert.ok(!has.has(w), w);
});

// ---------- フォニックス・コース ----------
const STAGES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
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
      if (step.sounds.length > 5) assert.ok(step.mix, `${step.id} に mix が付いていない`);
    }
  }
});
test('本コースは全語・全綴りをちょうど 1 回ずつ通る', () => {
  const covered = new Map();   // 'st|g' -> ステップ数
  const words = new Set();
  for (const stage of drill.course.filter(c => !c.extra)) for (const step of stage.steps) {
    for (const w of selectWords(step.sel)) words.add(`${w.word}@${w.hl}`);
    for (const g of step.sel.g || []) { const k = `${step.sel.st[0]}|${g}`; covered.set(k, (covered.get(k) || 0) + 1); }
  }
  assert.equal(words.size, drill.words.length, `未収録 ${drill.words.length - words.size} 語`);
  const all = new Set(drill.words.map(w => `${w.st}|${w.g}`));
  for (const k of all) assert.equal(covered.get(k), 1, `綴り ${k} が本コースに ${covered.get(k) || 0} 回`);
  for (const k of covered.keys()) assert.ok(all.has(k), `存在しない綴り ${k}`);
});
test('6 つの音節タイプと弱音節の音がそろっている', () => {
  const sounds = new Set(drill.words.map(w => w.sound));
  for (const s of ['ə', 'ɚ', 'i']) assert.ok(sounds.has(s), `${s} が無い`);
  assert.equal(drill.course.filter(c => !c.extra).length, 6, '音節タイプのステージが 6 つでない');
  const cle = drill.words.filter(w => w.st === 'P6' && w.g === 'le');
  assert.ok(cle.length >= 20, `consonant-le が ${cle.length} 語`);
  for (const w of ['about', 'sofa', 'lemon', 'table', 'hammer', 'happy']) assert.ok(drill.words.some(x => x.word === w && x.st === 'P6'), w);
});
test('全ステップの選択肢が 3 つ以上作れる', () => {
  for (const stage of drill.course) for (const step of stage.steps)
    assert.ok(step.mix ? step.sounds.length >= 3 : step.sounds.length >= 2, step.id);
});

// ---------- 一行ルール ----------
test('全語に「綴りの規則」と「口の作り方」の一行が用意されている', () => {
  for (const w of drill.words) {
    const r = drill.rules[`${w.st}|${w.g}`];
    assert.ok(r && r.length >= 4, `${w.word} (${w.st}|${w.g}) のルールが無い`);
    assert.ok(r.length <= 40, `${w.word} のルールが長すぎる: ${r}`);
    assert.ok(drill.mouth[w.sound], `${w.sound} の口の作り方が無い`);
    assert.ok(drill.mouth[w.sound].length <= 24, `${w.sound} の口の作り方が長すぎる`);
  }
});
test('20 語以上の綴りには専用ルールがある（ステージ共通の文言で済ませない）', () => {
  const c = new Map(), generic = new Set(Object.values({
    P1: '子音で閉じた音節の母音は短く読む', P2: '母音で終わる音節と、語末に e がある語は母音字を名前読み',
    P3: '母音字が並ぶと 2 字で 1 つの母音', P4: '母音 + r は r に引かれて別の音になる',
    P5: '二重母音。語中か語末かで綴りを使い分ける', P6: '強勢の無い音節は弱く曖昧になる' }));
  for (const w of drill.words) { const k = `${w.st}|${w.g}`; c.set(k, (c.get(k) || 0) + 1); }
  for (const [k, n] of c) if (n >= 20) assert.ok(!generic.has(drill.rules[k]), `${k}（${n}語）が共通文言のまま`);
});

// ---------- 英語耳 Lesson との対応 ----------
test('第3章 母音編の Lesson 13〜25 が全部あり、音が本の目次と合う', () => {
  assert.deepEqual(drill.lessons.map(l => l.n), [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);
  const want = { 13: ['ɑ'], 14: ['æ'], 15: ['ʌ'], 16: ['iː', 'ɪ', 'e', 'i'], 17: ['uː', 'ʊ'],
    18: ['aɪ', 'eɪ', 'ɔɪ'], 19: ['aʊ', 'oʊ'], 20: ['ɔː'], 21: ['ɝː'], 22: ['ɚ'], 23: ['ɑr'], 24: ['ɔr'], 25: ['ə'] };
  for (const L of drill.lessons) {
    assert.deepEqual(L.focus, want[L.n], `Lesson ${L.n}`);
    for (const f of L.focus) assert.ok(L.sounds.includes(f), `Lesson ${L.n} の ${f}`);
    assert.ok(L.page > 0 && L.title, `Lesson ${L.n}`);
  }
});
test('Lesson 別ステップは対象の音を十分に含む', () => {
  const stage = drill.course.find(c => c.id === 'L');
  assert.ok(stage && stage.extra, 'Lesson 別コースが無い');
  assert.equal(stage.steps.length, 13);
  for (const step of stage.steps) {
    const ws = selectWords(step.sel);
    const own = ws.filter(w => step.focus.includes(w.sound)).length;
    assert.ok(own >= 30, `${step.id} の対象音が ${own} 語`);
    // Lesson が対比グループ全体を扱う回（16〜19）は focus = sounds なので、そこは 2 音以上あればよい
    if (step.focus.length < step.sel.sounds.length) assert.ok(ws.length - own >= 20, `${step.id} に対比の音が足りない`);
    else assert.ok(step.sel.sounds.length >= 2, `${step.id} は 1 音しかない`);
  }
});
test('本の母音編に Lesson が無い音を明記している', () => {
  const covered = new Set(drill.lessons.flatMap(l => l.focus));
  const all = new Set(drill.words.map(w => w.sound));
  for (const s of all) assert.ok(covered.has(s) || drill.noLesson[s], `${s} が Lesson にも noLesson にも無い`);
});
