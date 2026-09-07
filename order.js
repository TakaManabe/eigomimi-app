// 音ごとの出題数の割り振り。app.js と tests/order.test.js の両方から使う。
const RARE = 5;   // これ未満しか語が無い音は「たまに出る例外」として比例配分にする
export function allocate(sizes, n) {
  const w = sizes.map(x => Math.sqrt(x)), tot = w.reduce((a, b) => a + b, 0);
  const all = sizes.reduce((a, b) => a + b, 0);
  if (!tot) return sizes.map(() => 0);
  // 語数の平方根に比例（均等割りだと少数の音が毎回出てしまう）。
  // ごく少数の音はさらに落として素の比例配分にし、端数は確率で切り上げる。
  const q = sizes.map((x, i) => {
    if (!x) return 0;
    const target = x < RARE ? n * x / all : n * w[i] / tot;
    return Math.min(x, Math.floor(target) + (Math.random() < target % 1 ? 1 : 0));
  });
  for (let guard = 0; guard < 1000; guard++) {
    const d = n - q.reduce((a, b) => a + b, 0);
    if (!d) break;
    const idx = sizes.map((_, i) => i).sort((a, b) => d > 0 ? (sizes[b] - q[b]) - (sizes[a] - q[a]) : q[b] - q[a]);
    const i = idx.find(i => d > 0 ? q[i] < sizes[i] : q[i] > 0);
    if (i == null) break;
    q[i] += d > 0 ? 1 : -1;
  }
  return q;
}
