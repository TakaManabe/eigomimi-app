// 復習間隔ロジック（純粋関数。テスト対象）
export const INTERVALS = [1, 2, 4, 7, 14, 30, 60];
export const RATINGS = ['×', '△', '○', '◎', '未'];

export function todayStr(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return todayStr(dt);
}
export function diffDays(a, b) { // b - a in days
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function newProgress(item) {
  return {
    itemId: item.id,
    sounds: item.sounds,
    tracks: item.tracks,
    stage: 0,              // INTERVALS のインデックス
    status: 'new',         // new | learning | review
    currentDay: 1,         // 次に行う日（1 or 2）
    dayCount: item.dayCount || 1,
    lastDate: null,
    nextDate: null,
    lastRating: null,
    ratings: [],           // {date, day, rating, type}
    totalReps: 0,
    notes: '',
  };
}

/**
 * 評価を適用して次回日を決める。
 * 新規学習中（status new/learning）は day 進行を優先し、最終日の評価で復習段階に入る。
 */
export function applyRating(progress, rating, today) {
  const p = { ...progress, ratings: [...(progress.ratings || [])] };
  const isLearning = p.status === 'new' || p.status === 'learning';
  const type = isLearning ? 'new' : 'review';
  p.ratings.push({ date: today, day: p.currentDay, rating, type });
  p.lastRating = rating;
  p.lastDate = today;

  if (rating === '未') {
    // 翌日へ持ち越し。失敗としては扱わず段階も変えない
    p.nextDate = addDays(today, 1);
    return p;
  }

  if (isLearning) {
    const lastDay = p.currentDay >= p.dayCount;
    if (rating === '×') {
      // 同じ日を翌日やり直す
      p.status = 'learning';
      p.nextDate = addDays(today, 1);
      return p;
    }
    if (!lastDay) {
      p.status = 'learning';
      p.currentDay += 1;
      p.nextDate = addDays(today, 1);
      return p;
    }
    // 最終日終了 → 復習段階へ
    p.status = 'review';
    p.currentDay = p.dayCount; // 復習は最終日（対比）の内容で行う
    p.stage = 0;
  }

  switch (rating) {
    case '×':
      p.stage = 0;
      p.nextDate = addDays(today, 1);
      break;
    case '△':
      p.nextDate = addDays(today, 2); // 段階は進めない
      break;
    case '○': {
      const interval = INTERVALS[Math.min(p.stage, INTERVALS.length - 1)];
      p.nextDate = addDays(today, interval);
      p.stage = Math.min(p.stage + 1, INTERVALS.length - 1);
      break;
    }
    case '◎': {
      const idx = Math.min(p.stage + 1, INTERVALS.length - 1);
      p.nextDate = addDays(today, INTERVALS[idx]);
      p.stage = Math.min(p.stage + 2, INTERVALS.length - 1);
      break;
    }
    default:
      throw new Error('unknown rating: ' + rating);
  }
  return p;
}

/**
 * 今日の計画。
 * - 期限の来た復習はすべて
 * - 学習中（learning）の続きは1つ
 * - 学習中がなく、今日まだ新規を始めていなければ新規1つ（延期中は除く）
 */
export function planToday(progressList, items, today, { postponeNewUntil = null, startedNewToday = false } = {}) {
  const byId = Object.fromEntries(progressList.map(p => [p.itemId, p]));
  const ordered = [...items].sort((a, b) => a.order - b.order);

  const reviews = ordered
    .filter(it => byId[it.id] && byId[it.id].status === 'review' && byId[it.id].nextDate && byId[it.id].nextDate <= today)
    .map(it => ({ item: it, progress: byId[it.id], kind: 'review' }));

  let learning = null;
  for (const it of ordered) {
    const p = byId[it.id];
    if (p && p.status === 'learning' && (!p.nextDate || p.nextDate <= today)) { learning = { item: it, progress: p, kind: 'learning' }; break; }
  }
  // 学習中で未完了だが nextDate が未来（今日すでに実施済み）の項目
  const learningDoneToday = ordered.some(it => byId[it.id] && byId[it.id].status === 'learning' && byId[it.id].lastDate === today);

  let fresh = null;
  const postponed = postponeNewUntil && postponeNewUntil > today;
  if (!learning && !learningDoneToday && !startedNewToday && !postponed) {
    for (const it of ordered) {
      const p = byId[it.id];
      if (!p || p.status === 'new') { fresh = { item: it, progress: p || newProgress(it), kind: 'new' }; break; }
    }
  }
  return { reviews, learning, fresh, postponed: !!postponed };
}

export function computeStreak(dateSet, today) {
  const set = dateSet instanceof Set ? dateSet : new Set(dateSet);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

/**
 * バックアップ内の日付を、exportedAt の日付（なければ最新のセッション日）が today になるよう平行移動する（サンプルデータ用）。
 * 対象: date / lastDate / nextDate / lastMiss / dueDate / ratings[].date / repCounts.key
 */
export function rebaseBackupDates(backup, today) {
  const data = backup.data || {};
  const dates = (data.sessions || []).map(s => s.date).filter(Boolean).sort();
  const ref = (typeof backup.exportedAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(backup.exportedAt)) ? backup.exportedAt.slice(0, 10) : dates[dates.length - 1];
  if (!ref) return backup;
  const shift = diffDays(ref, today);
  if (!shift) return backup;
  const mv = s => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) ? addDays(s, shift) : s;
  const fields = ['date', 'lastDate', 'nextDate', 'lastMiss', 'dueDate'];
  for (const rows of Object.values(data)) {
    if (!Array.isArray(rows)) continue;
    for (const r of rows) {
      if (!r || typeof r !== 'object') continue;
      for (const f of fields) if (f in r) r[f] = mv(r[f]);
      if (Array.isArray(r.ratings)) r.ratings.forEach(x => { x.date = mv(x.date); });
      if (typeof r.key === 'string' && /^\d{4}-\d{2}-\d{2}\|/.test(r.key)) { const [dt, rest] = r.key.split('|'); r.key = `${mv(dt)}|${rest}`; }
      if (typeof r.notes === 'string') r.notes = r.notes.replace(/\d{4}-\d{2}-\d{2}/g, m => mv(m));
    }
  }
  return backup;
}

/** 聞き分け結果から評価の目安を返す（自己評価の補助。自動判定ではない） */
export function suggestRating(correct, total) {
  if (!total) return null;
  const ratio = correct / total;
  if (ratio >= 0.9) return '◎';
  if (ratio >= 0.7) return '○';
  if (ratio >= 0.5) return '△';
  return '×';
}

/** 混同ペアの集計: [{from, to, count}] 降順 */
export function confusionPairs(quizLog) {
  const m = new Map();
  for (const q of quizLog) {
    if (!q.first || q.correct) continue;
    const k = `${q.playedSound}→${q.chosenSound}`;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].map(([k, count]) => { const [from, to] = k.split('→'); return { from, to, count }; })
    .sort((a, b) => b.count - a.count);
}

/** 正答率（最初の回答のみ） */
export function accuracy(quizLog) {
  const first = quizLog.filter(q => q.first);
  const correct = first.filter(q => q.correct).length;
  return { correct, total: first.length, ratio: first.length ? correct / first.length : null };
}
