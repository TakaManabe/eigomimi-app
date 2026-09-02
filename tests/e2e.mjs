// ブラウザ動作確認（Playwright）。node tests/e2e.mjs  ※ http://localhost:8123 で配信中であること
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8123/';
mkdirSync('/tmp/shots', { recursive: true });
const errors = [];
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });

async function run(name, viewport, fn) {
  const ctx = await browser.newContext({ viewport, permissions: ['microphone'], isMobile: viewport.width < 500, hasTouch: viewport.width < 500 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${name}] pageerror: ${e.message}`));
  try { await fn(page, name); } catch (e) { errors.push(`[${name}] ${e.stack}`); }
  await ctx.close();
}

const flow = async (page, tag) => {
  await page.goto(BASE); await page.waitForSelector('.list');
  await page.screenshot({ path: `/tmp/shots/${tag}-home.png`, fullPage: true });
  // 新規 v01 を開く
  await page.click('a.item');
  await page.waitForSelector('.practice');
  await page.screenshot({ path: `/tmp/shots/${tag}-p0.png`, fullPage: true });
  for (let i = 1; i <= 3; i++) { await page.click('text=次へ ›'); await page.waitForTimeout(300); if (i === 2) await page.screenshot({ path: `/tmp/shots/${tag}-p2.png`, fullPage: true }); }
  await page.screenshot({ path: `/tmp/shots/${tag}-p3.png`, fullPage: true });
  // 反復 +1（ボトムバー）×3
  for (let i = 0; i < 3; i++) await page.click('#bb-again');
  // 録音 開始→停止
  await page.click('#bb-rec'); await page.waitForTimeout(1200); await page.click('#bb-rec'); await page.waitForTimeout(800);
  await page.screenshot({ path: `/tmp/shots/${tag}-p4-rec.png`, fullPage: true });
  await page.click('text=次へ ›'); await page.waitForTimeout(400); await page.screenshot({ path: `/tmp/shots/${tag}-p5.png`, fullPage: true });
  await page.click('text=次へ ›'); await page.waitForTimeout(200);
  let sawBreak = false;
  for (let i = 0; i < 8; i++) {
    if (await page.locator('dialog.dlg[open]').count()) { sawBreak = true; await page.screenshot({ path: `/tmp/shots/${tag}-p6-break.png`, fullPage: true }); await page.click('dialog >> text=続ける'); }
    await page.click('text=＋1 同じ形で言えた'); await page.waitForTimeout(250);
  }
  if (!sawBreak) errors.push(`[${tag}] break dialog did not appear`);
  if (await page.locator('dialog.dlg[open]').count()) await page.click('dialog >> text=続ける');
  await page.screenshot({ path: `/tmp/shots/${tag}-p6.png`, fullPage: true });
  await page.click('text=次へ ›'); await page.waitForTimeout(500); await page.screenshot({ path: `/tmp/shots/${tag}-p7-quiz.png`, fullPage: true });
  // クイズ 10問: 常に最初の選択肢
  for (let q = 0; q < 10; q++) {
    await page.waitForSelector('.choices .btn.choice');
    await page.click('.choices .btn.choice >> nth=0');
    const nextBtn = page.locator('.practice button', { hasText: /次の問題|結果を見る/ });
    if (!(await nextBtn.count())) { await page.click('text=答えを見る'); }
    await page.click('.practice button:has-text("次の問題"), .practice button:has-text("結果を見る")');
    await page.waitForTimeout(100);
  }
  await page.screenshot({ path: `/tmp/shots/${tag}-p7-result.png`, fullPage: true });
  await page.click('text=次へ ›'); await page.waitForTimeout(200);
  await page.click('.rate-btn >> nth=2');
  await page.fill('textarea', 'テストメモ');
  await page.screenshot({ path: `/tmp/shots/${tag}-p8.png`, fullPage: true });
  await page.click('text=次へ ›'); await page.waitForTimeout(200);
  await page.screenshot({ path: `/tmp/shots/${tag}-p9.png`, fullPage: true });
  await page.click('text=保存して終了'); await page.waitForSelector('.stats3');
  await page.screenshot({ path: `/tmp/shots/${tag}-home-after.png`, fullPage: true });
  const reps = await page.textContent('.stats3 .stat .val');
  if (Number(reps) < 11) errors.push(`[${tag}] today reps expected >= 11, got ${reps}`);
  // 分類ゲーム
  await page.goto(BASE + '#/sort/v01'); await page.waitForSelector('.sort-card');
  for (let i = 0; i < 4; i++) { await page.click('.sort-col >> nth=0'); await page.waitForTimeout(150); const nb = page.locator('button:has-text("次へ ›")'); if (await nb.isVisible()) await nb.click(); }
  await page.screenshot({ path: `/tmp/shots/${tag}-sort.png`, fullPage: true });
  // 録音一覧
  await page.goto(BASE + '#/records'); await page.waitForSelector('.recview, .list');
  await page.screenshot({ path: `/tmp/shots/${tag}-records.png`, fullPage: true });
  // 設定: サンプル読み込み + エクスポート
  await page.goto(BASE + '#/settings'); await page.waitForSelector('text=バックアップ／復元');
  await page.screenshot({ path: `/tmp/shots/${tag}-settings.png`, fullPage: true });
  page.once('dialog', d => d.accept());
  await page.click('text=サンプルデータを読み込む'); await page.click('dialog.dlg >> text=OK'); await page.waitForSelector('.stats3');
  await page.screenshot({ path: `/tmp/shots/${tag}-home-sample.png`, fullPage: true });
  const nItems = await page.locator('.list a.item').count(); if (nItems < 2) errors.push(`[${tag}] sample plan expected >=2 items (review v02 + learning v03), got ${nItems}`);
  await page.goto(BASE + '#/curriculum'); await page.waitForTimeout(300);
  await page.screenshot({ path: `/tmp/shots/${tag}-curriculum.png`, fullPage: true });
  // 不正な復元ファイル
  await page.goto(BASE + '#/settings'); await page.waitForSelector('text=復元する');
  await page.setInputFiles('input[accept*="json"]', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"other"}') });
  await page.click('text=復元する'); await page.waitForSelector('#toast.error');
  const t = await page.textContent('#toast'); if (!/復元できません/.test(t)) errors.push(`[${tag}] bad import toast: ${t}`);
  await page.setInputFiles('input[accept*="json"]', { name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{not json') });
  await page.click('text=復元する'); await page.waitForSelector('#toast.error');
  // 音声未登録項目 (v02: Track 29 は未配置)
  await page.goto(BASE + '#/practice/v02/1/new'); await page.waitForSelector('.practice'); await page.click('text=次へ ›'); await page.waitForTimeout(600);
  const st = await page.textContent('.tp'); if (!/音声未登録/.test(st)) errors.push(`[${tag}] missing-audio message not shown`);
  await page.screenshot({ path: `/tmp/shots/${tag}-noaudio.png`, fullPage: true });
};

await run('mobile', { width: 390, height: 844 }, flow);
await run('desktop', { width: 1280, height: 800 }, flow);

// 録音拒否
await run('denied', { width: 390, height: 844 }, async (page) => {
  await page.context().clearPermissions();
  await page.goto(BASE + '#/practice/v01/1/new'); await page.waitForSelector('#bb-rec');
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })); });
  await page.click('#bb-rec'); await page.waitForSelector('#toast.error');
  const t = await page.textContent('#toast'); if (!/マイクの使用が許可されていません/.test(t)) errors.push(`[denied] toast: ${t}`);
  await page.screenshot({ path: `/tmp/shots/denied.png` });
});

// 容量不足（put が QuotaExceededError を投げる）
await run('quota', { width: 390, height: 844 }, async (page) => {
  await page.goto(BASE + '#/practice/v01/1/new'); await page.waitForSelector('#bb-rec');
  await page.evaluate(() => { const orig = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (v) { if (this.name === 'recordings') { const e = new DOMException('quota', 'QuotaExceededError'); throw e; } return orig.apply(this, arguments); }; });
  await page.click('#bb-rec'); await page.waitForTimeout(800); await page.click('#bb-rec'); await page.waitForSelector('#toast.error, #toast.warn');
  const t = await page.textContent('#toast'); if (!/容量|保存されません/.test(t)) errors.push(`[quota] toast: ${t}`);
});

// オフライン（Service Worker）
await run('offline', { width: 390, height: 844 }, async (page) => {
  await page.goto(BASE); await page.waitForSelector('.list');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => new Promise(r => setTimeout(r, 1500))));
  await page.context().setOffline(true);
  await page.reload(); await page.waitForSelector('.list', { timeout: 10000 });
  const online = await page.textContent('#online'); if (!/オフライン/.test(online)) errors.push(`[offline] indicator: ${online}`);
  await page.goto(BASE + '#/practice/v01/1/new'); await page.waitForSelector('.practice'); await page.click('text=次へ ›'); await page.waitForTimeout(800);
  const st = await page.textContent('.tp'); if (/音声未登録|読み込めません/.test(st)) errors.push(`[offline] cached audio not available: ${st}`);
  await page.screenshot({ path: `/tmp/shots/offline.png` });
  await page.context().setOffline(false);
});

await browser.close();
if (errors.length) { console.log('ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log('e2e OK');
