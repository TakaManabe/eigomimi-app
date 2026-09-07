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
  await page.click('a[href="#/d/d01"]'); await page.waitForSelector('text=スタート');
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
  await page.goto(BASE + '#/'); await page.waitForSelector('text=既出');
  const home = await page.textContent('main'); if (!/今日/.test(home) || !/20/.test(home)) errors.push(`[${tag}] home stats missing`);
  // 苦手だけ
  await page.click('a[href="#/d/d01?weak=1"]'); await page.waitForSelector('text=苦手な語だけ');
  // バックアップ形式エラー
  await page.goto(BASE + '#/'); await page.waitForSelector('text=復元');
  await page.setInputFiles('input[type=file]', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"other"}') });
  await page.waitForSelector('#toast.err');
  // リロード後もデータが残る
  await page.reload(); await page.waitForSelector('text=既出');
  const after = await page.textContent('main'); if (!/正答率 \d+%/.test(after)) errors.push(`[${tag}] persistence`);
};
await run('mobile', { width: 390, height: 844 }, flow);
await run('desktop', { width: 1280, height: 800 }, flow);
await run('timeout', { width: 390, height: 844 }, async page => {
  await page.goto(BASE + '#/d/d05'); await page.waitForSelector('text=スタート');
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
  await page.click('a[href="#/d/d02"]'); await page.waitForSelector('text=スタート');
  await page.context().setOffline(false);
});
await browser.close();
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('e2e OK');
