export const PASS_RATE = 0.9, PASS_RUNS = 2, PASS_MIN = 20;   // 合格: 20問以上を正答率90%で2回連続

// 端末ごとの持ち分を合算する。app.js と tests/merge.test.js の両方から使う。
// 合算は「足し算」と「新しい方を採る」だけなので、同じものを何度入れても結果は変わらない。
// 合格は保存せず、合算した runs から毎回導く（端末をまたいでも同じ結果になる）
export function derivePassed(runs) {
  for (let i = 0; i + PASS_RUNS <= runs.length; i++)
    if (runs.slice(i, i + PASS_RUNS).every(r => r.n >= PASS_MIN && r.c / r.n >= PASS_RATE)) return true;
  return false;
}
export function mergeSlots(slots) {
  const words = {}, conf = {}, prog = {}; let log = [];
  for (const sl of slots) {
    for (const [k, d] of Object.entries(sl.words || {})) {
      const t = words[k] || (words[k] = { s: 0, c: 0, w: 0, lw: null, ls: null });
      t.s += d.s | 0; t.c += d.c | 0; t.w += d.w | 0;
      if (d.lw && (!t.lw || d.lw > t.lw)) t.lw = d.lw;
      const seen = d.ls || d.lw;                       // 復習の予定は最後にさわった端末のものを採る
      if (seen && (!t.ls || seen >= t.ls)) { t.ls = seen; t.iv = d.iv; t.due = d.due; }
      else if (!t.due && d.due) { t.iv = d.iv; t.due = d.due; }
    }
    log = log.concat(sl.log || []);
    for (const [k, v] of Object.entries(sl.conf || {})) conf[k] = (conf[k] || 0) + (v | 0);
    for (const [k, v] of Object.entries(sl.prog || {})) (prog[k] || (prog[k] = { runs: [] })).runs.push(...(v.runs || []));
  }
  log.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  for (const p of Object.values(prog)) { p.runs.sort((a, b) => (a.ts || 0) - (b.ts || 0)); p.passed = derivePassed(p.runs); }
  return { words, log, prog, conf };
}
