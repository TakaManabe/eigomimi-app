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
      if (!/綴り/.test(w) || !/口/.test(w)) errors.push(`[cards] 理由に両軸が出ていない: ${w}`);
      if (!/→/.test(w)) errors.push(`[cards] 綴りの一行ルールが出ていない: ${w}`);
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
  await page.goto(BASE + '#/s/P1-1'); await page.waitForSelector('text=スタート');
  await page.click('.seg button:text-is("なし")'); await page.click('.seg button:has-text("20")');
  await page.click('text=スタート'); await page.waitForSelector('.word');
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('1'); await page.waitForTimeout(250);
    const nb = page.locator('button.btn.primary.big:text-is("次へ")');
    if (await nb.isVisible()) { await nb.click(); await page.waitForTimeout(150); }
  }
  const mid = await page.evaluate(() => ({ w: Object.keys(JSON.parse(localStorage.getItem('vd:words') || '{}')).length }));
  if (!mid.w) errors.push('[abort] 回答が記録されていない（前提が崩れている）');
  page.once('dialog', d => d.accept());
  await page.click('button:text-is("中止")');
  await page.waitForSelector('text=スタート');
  const after = await page.evaluate(() => ({
    w: Object.keys(JSON.parse(localStorage.getItem('vd:words') || '{}')).length,
    log: JSON.parse(localStorage.getItem('vd:log') || '[]').length,
    conf: Object.keys(JSON.parse(localStorage.getItem('vd:conf') || '{}')).length,
    prog: Object.keys(JSON.parse(localStorage.getItem('vd:prog') || '{}')).length,
  }));
  if (after.w || after.log || after.conf || after.prog) errors.push(`[abort] 中止後に記録が残っている: ${JSON.stringify(after)}`);
  if (await page.locator('button:text-is("ここで終了")').count()) errors.push('[abort] 「ここで終了」が残っている');
  await page.screenshot({ path: '/tmp/shots/d-abort.png' });
});
await run('reset', { width: 390, height: 844 }, async page => {
  // 設定の「記録のリセット」— 粒度ごとに消える範囲が違う
  await page.goto(BASE);
  await page.evaluate(() => {
    localStorage.setItem('vd:words', JSON.stringify({ hot: { s: 3, c: 2, w: 1, lw: '2020-01-01', iv: 1, due: '2020-01-05' } }));
    localStorage.setItem('vd:prog', JSON.stringify({ 'P1-1': { runs: [{ n: 20, c: 19 }], passed: 1 } }));
    localStorage.setItem('vd:conf', JSON.stringify({ 'æ→ʌ': 3 }));
  });
  await page.reload(); await page.waitForSelector('text=記録のリセット');
  const rows = await page.locator('.field:has-text("リセット")').count();
  if (rows < 4) errors.push(`[reset] リセットの選択肢が ${rows} 件`);
  await page.screenshot({ path: '/tmp/shots/d-reset.png', fullPage: true });
  // 復習キューだけ消す → 単語の成績と合格は残る
  page.once('dialog', d => d.accept());
  await page.click('.field:has-text("復習キューだけ") button:text-is("リセット")');
  await page.waitForTimeout(300);
  const a = await page.evaluate(() => ({
    due: JSON.parse(localStorage.getItem('vd:words')).hot.due,
    s: JSON.parse(localStorage.getItem('vd:words')).hot.s,
    prog: Object.keys(JSON.parse(localStorage.getItem('vd:prog') || '{}')).length,
  }));
  if (a.due !== undefined) errors.push('[reset] 復習キューが消えていない');
  if (a.s !== 3 || a.prog !== 1) errors.push('[reset] 復習キューだけのはずが他も消えた');
  // すべて消す
  page.once('dialog', d => d.accept());
  await page.click('.field:has-text("すべての記録") button:text-is("リセット")');
  await page.waitForTimeout(300);
  const b = await page.evaluate(() => ['vd:words', 'vd:log', 'vd:prog', 'vd:conf']
    .map(k => Object.keys(JSON.parse(localStorage.getItem(k) || '{}')).length).reduce((x, y) => x + y, 0));
  if (b) errors.push(`[reset] すべて消えていない: ${b}`);
});
await run('exception', { width: 390, height: 844 }, async page => {
  // 例外語（o なのに /ʌ/: money, mother, love …）でルールと答えが矛盾しないこと
  await page.goto(BASE);
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('vd:settings', JSON.stringify({ count: 50, limit: 0, autoNext: false, cards: false, audio: false })); });
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
      if (!/ふつうは/.test(fb)) errors.push(`[exception] ${word}: 通常ルールの但し書きが無い — ${fb}`);
      if (/綴り o →/.test(fb)) errors.push(`[exception] ${word}: 答えと矛盾する規則をそのまま出している — ${fb}`);
      if (!/o の内訳/.test(fb) || !/ʌ/.test(fb.split('内訳')[1] || '')) errors.push(`[exception] ${word}: 内訳に正解の音が無い — ${fb}`);
      await page.screenshot({ path: '/tmp/shots/d-exception.png' });
      seen = true; break;
    }
    const nb = page.locator('button.btn.primary.big:text-is("次へ")');
    if (await nb.isVisible()) { await nb.click(); await page.waitForTimeout(150); }
  }
  if (!seen) errors.push('[exception] 50 問めくっても o→/ʌ/ の例外語が出なかった');
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
