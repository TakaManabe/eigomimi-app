// Playwright 動作確認: node tests/e2e.mjs（http://localhost:8123 で配信中であること）
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:8123/';
mkdirSync('/tmp/shots', { recursive: true });
const errors = [];
const browser = await chromium.launch();
async function run(name, viewport, fn) {
  const ctx = await browser.newContext({ viewport, isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${name}] pageerror: ${e.message}`));
  try { await fn(page, name); } catch (e) { errors.push(`[${name}] ${e.stack}`); }
  await ctx.close();
}
const flow = async (page, tag) => {
  await page.goto(BASE); await page.waitForSelector('text=始める');
  await page.screenshot({ path: `/tmp/shots/d-${tag}-home.png`, fullPage: true });
  await page.click('a[href="#/s/P1-1"]'); await page.waitForSelector('text=スタート');
  if (!(await page.locator('.seg button.on:has-text("1.5秒")').count())) errors.push(`[${tag}] autoNext default not on`);
  if (!(await page.locator('.seg button.on:text-is("3秒")').count())) errors.push(`[${tag}] limit default not 3s`);
  await page.click('.seg button:has-text("20")'); await page.click('text=スタート'); await page.waitForSelector('.word');
  await page.screenshot({ path: `/tmp/shots/d-${tag}-drill.png` });
  let shot = false;
  for (let i = 0; i < 40 && await page.locator('.word').isVisible(); i++) {
    await page.keyboard.press('1'); await page.waitForTimeout(120);
    const nb = page.locator('button.btn.primary.big:text-is("次へ")');
    if (await nb.isVisible()) { if (!shot) { await page.screenshot({ path: `/tmp/shots/d-${tag}-wrong.png` }); shot = true; } await page.waitForTimeout(1700); if (await nb.isVisible()) errors.push(`[${tag}] autoNext did not advance`); }
    else await page.waitForTimeout(600);
  }
  await page.waitForSelector('text=結果:', { timeout: 15000 });
  await page.screenshot({ path: `/tmp/shots/d-${tag}-result.png`, fullPage: true });
  const res = await page.textContent('h2:has-text("結果:")'); if (!/結果: \d+ \/ 20/.test(res)) errors.push(`[${tag}] result: ${res}`);
  const hl = await page.locator('.chip .hl').count(); if (!hl) errors.push(`[${tag}] no highlight in missed list`);
  await page.goto(BASE + '#/'); await page.waitForSelector('text=フォニックス・コース');
  const home = await page.textContent('main'); if (!/今日/.test(home) || !/20/.test(home)) errors.push(`[${tag}] home stats missing`);
  if (!/直近 \d+%/.test(home)) errors.push(`[${tag}] step rate not shown on home`);
  // 苦手だけ
  await page.goto(BASE + '#/s/P1-1?weak=1'); await page.waitForSelector('text=苦手な語だけ');
  // バックアップ形式エラー
  await page.goto(BASE + '#/'); await page.waitForSelector('text=復元');
  await page.setInputFiles('input[type=file]', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"other"}') });
  await page.waitForSelector('#toast.err');
  // リロード後もデータが残る
  await page.reload(); await page.waitForSelector('text=フォニックス・コース');
  const after = await page.textContent('main'); if (!/直近 \d+%/.test(after)) errors.push(`[${tag}] persistence`);
  // 今日の復習キュー（間違えた語は翌日から。今日は 0 語のはず）
  if (!/今日の復習/.test(after)) errors.push(`[${tag}] review card missing`);
  // 従来のセットは details の中に残っている
  await page.click('summary:has-text("音のコントラスト別セット")');
  await page.waitForSelector('a[href="#/d/d01"]');
  // 弱音節ステージと追加コースがある
  if (!/弱音節/.test(await page.textContent('main'))) errors.push(`[${tag}] 弱音節ステージが無い`);
  await page.click('summary:has-text("一綴り多音の罠")');
  await page.waitForSelector('a[href="#/s/T-o"]');
  // 英語耳 Lesson 別
  await page.click('summary:has-text("英語耳 Lesson 別")');
  await page.waitForSelector('a[href="#/s/L13"]');
  const lt = await page.textContent('main');
  if (!/Lesson 25/.test(lt) || !/p\.83/.test(lt)) errors.push(`[${tag}] Lesson 一覧が不足`);
};
await run('mobile', { width: 390, height: 844 }, flow);
await run('desktop', { width: 1280, height: 800 }, flow);
await run('mixed', { width: 390, height: 844 }, async page => {
  // 総合ステップ（音が 6 つ以上）は毎問 3 択を作る
  await page.goto(BASE + '#/s/X-all'); await page.waitForSelector('text=スタート');
  if (!/毎問 3 択/.test(await page.textContent('main'))) errors.push('[mixed] 3択の説明が出ていない');
  await page.click('.seg button:text-is("なし")');
  await page.click('.seg button:has-text("20")'); await page.click('text=スタート'); await page.waitForSelector('.word');
  for (let i = 0; i < 5; i++) {
    const n = await page.locator('.choice').count();
    if (n !== 3) { errors.push(`[mixed] 選択肢が ${n} 個`); break; }
    await page.keyboard.press('1'); await page.waitForTimeout(700);
    const nb = page.locator('button.btn.primary.big:text-is("次へ")');
    if (await nb.isVisible()) { await nb.click(); await page.waitForTimeout(200); }
  }
  await page.screenshot({ path: '/tmp/shots/d-mixed.png' });
});
await run('review', { width: 390, height: 844 }, async page => {
  // 復習キューに期限切れの語を仕込むと #/r で出題される
  await page.goto(BASE);
  await page.evaluate(() => localStorage.setItem('vd:words', JSON.stringify({ hot: { s: 1, c: 0, w: 1, lw: '2020-01-01', iv: 0, due: '2020-01-02' } })));
  await page.reload(); await page.waitForSelector('text=フォニックス・コース');
  if (!/復習する（1）/.test(await page.textContent('main'))) errors.push('[review] 復習 1 語が出ていない');
  await page.click('a[href="#/r"]'); await page.waitForSelector('text=スタート');
  await page.click('text=スタート'); await page.waitForSelector('.word');
  if ((await page.textContent('.word')) !== 'hot') errors.push('[review] 復習語が出題されない');
  await page.screenshot({ path: '/tmp/shots/d-review.png' });
});
await run('schwa', { width: 390, height: 844 }, async page => {
  // 弱音節: 同じ語でも赤字の位置で答えが変わる
  await page.goto(BASE + '#/s/P6-1'); await page.waitForSelector('text=スタート');
  await page.click('.seg button:text-is("なし")'); await page.click('.seg button:has-text("20")');
  await page.click('text=スタート'); await page.waitForSelector('.word');
  if (!(await page.locator('.choice:has-text("/ə/")').count())) errors.push('[schwa] /ə/ の選択肢が無い');
  if (!(await page.locator('.word .hl').count())) errors.push('[schwa] 赤字が出ていない');
  await page.screenshot({ path: '/tmp/shots/d-schwa.png' });
});
await run('cards', { width: 390, height: 844 }, async page => {
  // ミックス（カード）モード: 出題はフォニックス、選択肢は英語耳＋綴りの罠
  await page.goto(BASE + '#/s/P1-1'); await page.waitForSelector('text=スタート');
  await page.click('.seg button:has-text("ミックス")');
  if (!(await page.locator('.field:has-text("1 ラウンドの枚数")').isVisible())) errors.push('[cards] ラウンド枚数の設定が出ない');
  await page.click('.seg button:text-is("5枚")');
  await page.click('.seg button:text-is("なし")');
  await page.click('.seg button:has-text("20")');
  await page.click('text=スタート'); await page.waitForSelector('.mk-card');
  if ((await page.locator('.mk-choices .choice').count()) !== 4) errors.push('[cards] 選択肢が 4 つでない');
  if (!/ラウンド 1/.test(await page.textContent('.mk-round'))) errors.push('[cards] ラウンド表示が無い');
  await page.screenshot({ path: '/tmp/shots/d-cards.png' });
  // 5 枚でラウンドが切れる
  let shot = false;
  for (let i = 0; i < 40; i++) {
    if (await page.locator('.mk-round:has-text("完了")').count()) break;
    if (await page.locator('.mk-why').isVisible()) {
      if (!shot) { await page.screenshot({ path: '/tmp/shots/d-cards-why.png' }); shot = true; }
      const w = await page.textContent('.mk-why');
      // 表になっていること: 見出し・正解行・選んだ行・規則（または例外）
      if (!/の読み方 \d+ 通り/.test(w)) errors.push(`[cards] 表の見出しが無い: ${w}`);
      if (!/規則|例外/.test(w)) errors.push(`[cards] 規則も例外も出ていない: ${w}`);
      if (!(await page.locator('.mk-why table.why tr.hit').count())) errors.push('[cards] 正解の行が色分けされていない');
      if (!(await page.locator('.mk-why table.why tr.miss').count())) errors.push('[cards] 選んだ音の行が色分けされていない');
      if (!(await page.locator('.mk-why table.why tr.hit.mouth').count())) errors.push('[cards] 口の作り方が出ていない');
      await page.click('.mk-next');
    } else { await page.keyboard.press('1'); }
    await page.waitForTimeout(300);
  }
  if (!(await page.locator('.mk-round:has-text("完了")').count())) errors.push('[cards] ラウンドが完了しない');
  await page.screenshot({ path: '/tmp/shots/d-cards-round.png' });
  // 設定は覚えている
  await page.goto(BASE + '#/s/P1-2'); await page.waitForSelector('text=スタート');
  if (!(await page.locator('.seg button.on:has-text("ミックス")').count())) errors.push('[cards] 形式が保存されていない');
  if (!(await page.locator('.seg button.on:text-is("5枚")').count())) errors.push('[cards] ラウンド枚数が保存されていない');
  // ふつうに戻す（後続テストのため）
  await page.click('.seg button:text-is("ふつう")');
});
await run('lesson', { width: 390, height: 844 }, async page => {
  // 英語耳 Lesson 別: 出題の 6 割がその Lesson の音に寄る
  await page.goto(BASE + '#/s/L25'); await page.waitForSelector('text=スタート');
  if (!/一番よく出てくる/.test(await page.textContent('main'))) errors.push('[lesson] Lesson の説明が出ていない');
  await page.click('.seg button:text-is("なし")');
  await page.click('.seg button:has-text("50")');
  await page.click('text=スタート'); await page.waitForSelector('.word');
  await page.screenshot({ path: '/tmp/shots/d-lesson.png' });
});
await run('abort', { width: 390, height: 844 }, async page => {
  // 中止すると、その回の記録が一切残らない
  await page.goto(BASE);
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload();
  await page.goto(BASE + '#/s/P1-1'); await page.waitForSelector('text=スタート');
  await page.click('.seg button:text-is("なし")'); await page.click('.seg button:has-text("20")');
  await page.click('text=スタート'); await page.waitForSelector('.word');
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('1'); await page.waitForTimeout(250);
    const nb = page.locator('button.btn.primary.big:text-is("次へ")');
    if (await nb.isVisible()) { await nb.click(); await page.waitForTimeout(150); }
  }
  const mid = await page.evaluate(() => ({ w: Object.keys((JSON.parse(localStorage.getItem('vd:mine') || '{}').words) || {}).length }));
  if (!mid.w) errors.push('[abort] 回答が記録されていない（前提が崩れている）');
  page.once('dialog', d => d.accept());
  await page.click('button:text-is("中止")');
  await page.waitForSelector('text=スタート');
  const after = await page.evaluate(() => {
    const m = JSON.parse(localStorage.getItem('vd:mine') || '{}');
    return { w: Object.keys(m.words || {}).length, log: (m.log || []).length,
             conf: Object.keys(m.conf || {}).length, prog: Object.keys(m.prog || {}).length };
  });
  if (after.w || after.log || after.conf || after.prog) errors.push(`[abort] 中止後に記録が残っている: ${JSON.stringify(after)}`);
  if (await page.locator('button:text-is("ここで終了")').count()) errors.push('[abort] 「ここで終了」が残っている');
  await page.screenshot({ path: '/tmp/shots/d-abort.png' });
});
await run('reset', { width: 390, height: 844 }, async page => {
  // 設定の「記録のリセット」— 粒度ごとに消える範囲が違う
  await page.goto(BASE);
  await page.evaluate(() => {
    localStorage.setItem('vd:mine', JSON.stringify({
      words: { hot: { s: 3, c: 2, w: 1, lw: '2020-01-01', ls: '2020-01-01', iv: 1, due: '2020-01-05' } },
      log: [], prog: { 'P1-1': { runs: [{ n: 20, c: 19, ts: 1 }] } }, conf: { 'æ→ʌ': 3 } }));
  });
  await page.reload(); await page.waitForSelector('text=記録のリセット');
  const rows = await page.locator('.field:has-text("リセット")').count();
  if (rows < 4) errors.push(`[reset] リセットの選択肢が ${rows} 件`);
  await page.screenshot({ path: '/tmp/shots/d-reset.png', fullPage: true });
  // 復習キューだけ消す → 単語の成績と合格は残る
  page.once('dialog', d => d.accept());
  await page.click('.field:has-text("復習キューだけ") button:text-is("リセット")');
  await page.waitForTimeout(300);
  const a = await page.evaluate(() => {
    const m = JSON.parse(localStorage.getItem('vd:mine'));
    return { due: m.words.hot.due, s: m.words.hot.s, prog: Object.keys(m.prog || {}).length };
  });
  if (a.due !== undefined) errors.push('[reset] 復習キューが消えていない');
  if (a.s !== 3 || a.prog !== 1) errors.push('[reset] 復習キューだけのはずが他も消えた');
  // すべて消す
  page.once('dialog', d => d.accept());
  await page.click('.field:has-text("すべての記録") button:text-is("リセット")');
  await page.waitForTimeout(300);
  const b = await page.evaluate(() => {
    const m = JSON.parse(localStorage.getItem('vd:mine') || '{}');
    return Object.keys(m.words || {}).length + (m.log || []).length + Object.keys(m.prog || {}).length
      + Object.keys(m.conf || {}).length + Object.keys(JSON.parse(localStorage.getItem('vd:peers') || '{}')).length;
  });
  if (b) errors.push(`[reset] すべて消えていない: ${b}`);
});
await run('exception', { width: 390, height: 844 }, async page => {
  // 例外語（o なのに /ʌ/: money, mother, love …）でルールと答えが矛盾しないこと
  await page.goto(BASE);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vd:settings', JSON.stringify({ count: 50, limit: 0, autoNext: false, cards: false, speak: 'off' })); });
  await page.reload();   // ハッシュ移動だけでは設定が読み直されない
  await page.goto(BASE + '#/s/P1-2'); await page.waitForSelector('text=スタート');
  await page.click('text=スタート'); await page.waitForSelector('.word');
  const fam = new Set(['money', 'mother', 'brother', 'other', 'another', 'nothing', 'love', 'come', 'some', 'done', 'none', 'cover', 'color', 'honey', 'oven', 'glove', 'above', 'dozen', 'front', 'son', 'ton', 'won', 'wonder', 'govern', 'sponge', 'stomach', 'onion', 'shove', 'Monday', 'month']);
  let seen = false;
  for (let i = 0; i < 60 && !seen; i++) {
    if (!(await page.locator('.word').isVisible())) break;
    const word = (await page.textContent('.word')).trim();
    const hit = fam.has(word);
    // 例外語なら、わざと違う音を選んで理由を出す
    const btns = page.locator('.choice'); const n = await btns.count();
    let clicked = false;
    for (let k = 0; k < n; k++) { const t = await btns.nth(k).textContent(); if (hit ? !t.includes('/ʌ/') : true) { await btns.nth(k).click(); clicked = true; break; } }
    if (!clicked) await page.keyboard.press('1');
    await page.waitForTimeout(200);
    if (hit) {
      const fb = await page.textContent('.fb');
      if (!/例外/.test(fb)) errors.push(`[exception] ${word}: 例外の表示が無い — ${fb}`);
      if (!/はふつう/.test(fb)) errors.push(`[exception] ${word}: 通常ルールの但し書きが無い — ${fb}`);
      if (!/同じ例外/.test(fb)) errors.push(`[exception] ${word}: 同じ例外の仲間が出ていない — ${fb}`);
      // 表に正解 /ʌ/ の行があること
      const hit = await page.locator('.fb table.why tr.hit .ipa').first().textContent();
      if (hit !== '/ʌ/') errors.push(`[exception] ${word}: 正解の行が /ʌ/ でない — ${hit}`);
      await page.screenshot({ path: '/tmp/shots/d-exception.png' });
      seen = true; break;
    }
    const nb = page.locator('button.btn.primary.big:text-is("次へ")');
    if (await nb.isVisible()) { await nb.click(); await page.waitForTimeout(150); }
  }
  if (!seen) errors.push('[exception] 50 問めくっても o→/ʌ/ の例外語が出なかった');
});
await run('merge', { width: 390, height: 844 }, async page => {
  // 端末ごとの持ち分を合算して表示し、同じものを何度取り込んでも変わらない
  const D = (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })();
  const slot = (n, ts) => ({ words: { hot: { s: n, c: n, w: 0, lw: null, ls: D } },
    log: [{ d: D, ts, set: 'P1-1', n, c: n, conf: { 'æ→ʌ': n }, sec: 60 }],
    prog: { 'P1-1': { runs: [{ n: 20, c: 20, ts }, { n: 20, c: 20, ts: ts + 1 }] } }, conf: { 'æ→ʌ': n } });
  await page.goto(BASE);
  await page.evaluate(s => {
    localStorage.clear();
    localStorage.setItem('vd:device', JSON.stringify('A'));
    localStorage.setItem('vd:mine', JSON.stringify(s.a));
    localStorage.setItem('vd:peers', JSON.stringify({ B: s.b }));
  }, { a: slot(3, 1000), b: slot(4, 2000) });
  await page.reload(); await page.waitForSelector('text=フォニックス・コース');
  const txt = await page.textContent('main');
  if (!/æ→ʌ|\/æ\/ → \/ʌ\//.test(txt)) errors.push('[merge] 混同が合算されていない');
  // 今日の語数 = 3 + 4 = 7
  const todayN = await page.evaluate(() => document.querySelectorAll('.stats .val')[0].textContent);
  if (todayN !== '7') errors.push(`[merge] 今日の語数が合算されていない: ${todayN}`);
  // 合格は合算した runs から導かれる（各端末 2 回ずつ = 4 回）
  if (!/1 \/ 30 合格|✓/.test(txt)) errors.push('[merge] 合格が導かれていない');
  // 同じ B をもう一度入れても変わらない
  await page.evaluate(s => localStorage.setItem('vd:peers', JSON.stringify({ B: s.b })), { b: slot(4, 2000) });
  await page.reload(); await page.waitForSelector('text=フォニックス・コース');
  const again = await page.evaluate(() => document.querySelectorAll('.stats .val')[0].textContent);
  if (again !== '7') errors.push(`[merge] 二度取り込むと値が変わる: ${again}`);
  await page.screenshot({ path: '/tmp/shots/d-merge.png', fullPage: true });
});
await run('sync', { width: 390, height: 844 }, async page => {
  // 同期: 2 台ぶんのブラウザで同じコードを使い、記録が合算されること
  const code = 'e2e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const setup = async (p2, dev, seed) => {
    await p2.goto(BASE);
    await p2.evaluate(([dev, seed, code]) => {
      localStorage.clear();
      localStorage.setItem('vd:device', JSON.stringify(dev));
      localStorage.setItem('vd:mine', JSON.stringify(seed));
      localStorage.setItem('vd:settings', JSON.stringify({ sync: code, count: 20, speak: 'off' }));
    }, [dev, seed, code]);
    await p2.reload(); await p2.waitForSelector('text=フォニックス・コース');
  };
  const slot = (n, ts) => ({ words: { hot: { s: n, c: n, w: 0, lw: null, ls: today() } },
    log: [{ d: today(), ts, set: 'P1-1', n, c: n, conf: {}, sec: 60 }], prog: {}, conf: {} });
  const today = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  const fix = s2 => { s2.log[0].d = today(); return s2; };

  await setup(page, 'e2edevAAAA', fix(slot(3, 1000)));
  await page.click('button:text-is("今すぐ同期")').catch(() => {});
  await page.waitForTimeout(1500);

  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage();
  await setup(p2, 'e2edevBBBB', fix(slot(4, 2000)));
  await p2.click('button:text-is("今すぐ同期")').catch(() => {});
  await p2.waitForTimeout(1500);
  const n2 = await p2.evaluate(() => document.querySelectorAll('.stats .val')[0].textContent);
  if (n2 !== '7') errors.push(`[sync] B 側で合算されていない: ${n2}（3+4=7 のはず）`);
  if (!/合算中: 2 台/.test(await p2.textContent('main'))) errors.push('[sync] 台数が出ていない');
  await p2.screenshot({ path: '/tmp/shots/d-sync.png', fullPage: true });

  // A 側に戻って同期すると、B の分が入る
  await page.reload(); await page.waitForSelector('text=フォニックス・コース');
  await page.click('button:text-is("今すぐ同期")'); await page.waitForTimeout(1500);
  const n1 = await page.evaluate(() => document.querySelectorAll('.stats .val')[0].textContent);
  if (n1 !== '7') errors.push(`[sync] A 側で合算されていない: ${n1}`);
  // 何度同期しても増えない
  await page.click('button:text-is("今すぐ同期")'); await page.waitForTimeout(1500);
  const n3 = await page.evaluate(() => document.querySelectorAll('.stats .val')[0].textContent);
  if (n3 !== '7') errors.push(`[sync] 繰り返し同期で値が変わる: ${n3}`);
  // 同期オフの表記
  if (!/同期オン/.test(await page.textContent('main'))) errors.push('[sync] 同期オンの表示が無い');
  await ctx2.close();
  await fetch(`https://eigomimi-sync.mahiro-original.workers.dev/${code}`, { method: 'DELETE' }).catch(() => {});
});
await run('book', { width: 390, height: 844 }, async page => {
  // 単語帳: 状態ごとの内訳と終了率
  await page.goto(BASE);
  await page.evaluate(() => {
    const D = (() => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })();
    const y = (() => { const t = new Date(Date.now() - 86400000); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; })();
    localStorage.clear();
    localStorage.setItem('vd:mine', JSON.stringify({ words: {
      hot: { s: 4, c: 4, w: 0, ls: D },                          // クリア
      pot: { s: 5, c: 3, w: 2, lw: y, ls: y, iv: 0, due: y },    // 要復習
      lot: { s: 1, c: 0, w: 1, lw: D, ls: D, iv: 0, due: '2099-01-01' },  // 練習中
    }, log: [], prog: {}, conf: {} }));
  });
  await page.reload();   // ハッシュ移動だけだと再読込されず、種データが反映されない
  await page.goto(BASE + '#/w/P1-2'); await page.waitForSelector('text=終了率');
  const txt = await page.textContent('main');
  if (!/クリア/.test(txt)) errors.push('[book] 状態の内訳が無い');
  const rate = await page.evaluate(() => document.querySelectorAll('.stats .val')[0].textContent);
  if (!/^\d+%$/.test(rate)) errors.push(`[book] 終了率が出ていない: ${rate}`);
  if (!(await page.locator('.wbar > i').count())) errors.push('[book] 進捗バーが無い');
  await page.screenshot({ path: '/tmp/shots/d-book.png', fullPage: true });
  // 「要復習」で絞ると pot だけ
  await page.click('.chip:has-text("要復習")'); await page.waitForTimeout(200);
  const rows = await page.locator('.wrow .ww').allTextContents();
  if (rows.join() !== 'pot') errors.push(`[book] 要復習の絞り込みがおかしい: ${rows}`);
  // 「クリア」で絞ると hot だけ
  await page.click('.chip:has-text("クリア")'); await page.waitForTimeout(200);
  const rows2 = await page.locator('.wrow .ww').allTextContents();
  if (rows2.join() !== 'hot') errors.push(`[book] クリアの絞り込みがおかしい: ${rows2}`);
  // 「まだの語だけ」でドリルに入れる
  await page.click('a:has-text("まだの語だけ")'); await page.waitForSelector('text=まだクリアしていない語だけ');
  // ホームにも終了率が出る
  await page.goto(BASE + '#/'); await page.waitForSelector('text=フォニックス・コース');
  if (!/終了率/.test(await page.textContent('main'))) errors.push('[book] ホームに終了率が無い');
  if (!(await page.locator('a[href="#/w/P1-1"]').count())) errors.push('[book] ホームに単語帳へのリンクが無い');
  await page.screenshot({ path: '/tmp/shots/d-book-home.png', fullPage: true });
});
await run('speak', { width: 390, height: 844 }, async page => {
  // 音声を鳴らすタイミング: 既定は「出題時」
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForSelector('text=フォニックス・コース');
  const def = await page.evaluate(() => JSON.parse(localStorage.getItem('vd:settings') || '{}').speak);
  if (def !== 'q') errors.push(`[speak] 既定が出題時でない: ${def}`);
  if (!(await page.locator('.field:has-text("音声を鳴らす") .seg button.on:text-is("出題時")').count()))
    errors.push('[speak] 設定画面で「出題時」が選ばれていない');
  // 発話の呼び出しを記録する
  await page.addInitScript(() => {
    window.__spoken = [];
    const orig = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = u => { window.__spoken.push(u.text); try { orig(u); } catch { /* ignore */ } };
  });
  await page.goto(BASE + '#/s/P1-1'); await page.reload(); await page.waitForSelector('text=スタート');
  await page.click('.seg button:text-is("なし")').catch(() => {});        // 制限時間なし
  await page.click('text=スタート'); await page.waitForSelector('.word');
  await page.waitForTimeout(400);
  const w1 = (await page.textContent('.word')).trim();
  const spokenBefore = await page.evaluate(() => window.__spoken.slice());
  if (!spokenBefore.includes(w1)) errors.push(`[speak] 出題時に鳴っていない: ${w1} / ${JSON.stringify(spokenBefore)}`);
  // 「回答後」に切り替えると出題時には鳴らない
  await page.goto(BASE + '#/'); await page.waitForSelector('text=音声を鳴らす');
  await page.click('.field:has-text("音声を鳴らす") .seg button:text-is("回答後")');
  await page.goto(BASE + '#/s/P1-1'); await page.reload(); await page.waitForSelector('text=スタート');
  await page.evaluate(() => { window.__spoken = []; });
  await page.click('text=スタート'); await page.waitForSelector('.word');
  await page.waitForTimeout(400);
  const w2 = (await page.textContent('.word')).trim();
  const mid = await page.evaluate(() => window.__spoken.slice());
  if (mid.includes(w2)) errors.push(`[speak] 「回答後」なのに出題時に鳴った: ${w2}`);
  await page.keyboard.press('1'); await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__spoken.slice());
  if (!after.includes(w2)) errors.push(`[speak] 回答後に鳴っていない: ${w2} / ${JSON.stringify(after)}`);
  await page.screenshot({ path: '/tmp/shots/d-speak.png' });
});
await run('timeout', { width: 390, height: 844 }, async page => {
  await page.goto(BASE + '#/s/P5-1'); await page.waitForSelector('text=スタート');
  await page.click('.seg button:text-is("2秒")'); await page.click('.seg button:has-text("20")'); await page.click('text=スタート'); await page.waitForSelector('.word');
  await page.waitForSelector('text=時間切れ', { timeout: 5000 });
  await page.screenshot({ path: '/tmp/shots/d-timeout.png' });
  await page.waitForTimeout(1800);
  const t = await page.textContent('.fb'); if (/時間切れ/.test(t)) errors.push('[timeout] did not auto-advance after timeout');
});
await run('offline', { width: 390, height: 844 }, async page => {
  await page.goto(BASE); await page.waitForSelector('text=始める');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => new Promise(r => setTimeout(r, 1500))));
  await page.context().setOffline(true); await page.reload(); await page.waitForSelector('text=始める', { timeout: 10000 });
  await page.click('a[href="#/s/P1-1"]'); await page.waitForSelector('text=スタート');
  await page.context().setOffline(false);
});
await browser.close();
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('e2e OK');
