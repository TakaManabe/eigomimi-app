// ドメイン層: db + srs をまとめた保存・集計
import * as db from './db.js';
import { todayStr, addDays, computeStreak, newProgress, planToday, accuracy, confusionPairs } from './srs.js';

export const DEFAULT_SETTINGS = {
  targetReps: 10,
  breakEvery: 10,
  quizCount: 10,
  speaker: 'M',
  altSpeaker: true,      // 聞き分けで話者をランダムに
  ttsVoice: null,
  keepRecordings: 60,    // 録音の保持上限（件）
  postponeNewUntil: null,
};

export async function loadSettings() {
  const rows = await db.getAll('settings');
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}
export const saveSetting = db.setSetting;

// ---- progress ----
export async function getProgressList() { return db.getAll('progress'); }
export async function getProgress(item) {
  return (await db.get('progress', item.id)) || newProgress(item);
}
export async function saveProgress(p) { return db.put('progress', p); }

export async function todayPlan(items, settings) {
  const today = todayStr();
  const list = await getProgressList();
  const sessions = await db.getAllByIndex('sessions', 'date', today);
  const startedNewToday = sessions.some(s => s.type === 'new');
  return { today, ...planToday(list, items, today, { postponeNewUntil: settings.postponeNewUntil, startedNewToday }) };
}

// ---- reps ----
export async function addReps(itemId, sound, word, n = 1) {
  const date = todayStr();
  const key = `${date}|${sound}`;
  const r = (await db.get('repCounts', key)) || { key, date, sound, count: 0 };
  r.count += n;
  await db.put('repCounts', r);
  if (word) {
    const w = (await db.get('wordReps', word)) || { word, itemId, count: 0, lastDate: null };
    w.count += n; w.lastDate = date; w.itemId = itemId;
    await db.put('wordReps', w);
  }
  const p = await db.get('progress', itemId);
  if (p) { p.totalReps = (p.totalReps || 0) + n; await db.put('progress', p); }
}
export async function repsByDate(date) {
  const all = await db.getAll('repCounts');
  return all.filter(r => r.date === date).reduce((s, r) => s + r.count, 0);
}
export async function repsBySound() {
  const all = await db.getAll('repCounts');
  const m = {};
  for (const r of all) m[r.sound] = (m[r.sound] || 0) + r.count;
  return m;
}

// ---- quiz ----
export async function logQuiz(entry) {
  return db.put('quizLog', { date: todayStr(), ts: Date.now(), ...entry });
}
export async function quizStats(itemId = null) {
  let log = await db.getAll('quizLog');
  if (itemId) log = log.filter(q => q.itemId === itemId);
  return { ...accuracy(log), confusions: confusionPairs(log) };
}

// ---- weak words ----
export async function markWeak(word, itemId) {
  const w = (await db.get('weakWords', word)) || { word, itemId, missCount: 0, lastMiss: null, dueDate: null };
  w.missCount += 1; w.lastMiss = todayStr(); w.dueDate = addDays(todayStr(), 1); w.itemId = itemId;
  await db.put('weakWords', w);
}
export async function clearWeak(word) {
  const w = await db.get('weakWords', word);
  if (!w) return;
  if (w.missCount <= 1) return db.del('weakWords', word);
  w.missCount -= 1; w.dueDate = null; await db.put('weakWords', w);
}
export async function weakWordsFor(itemId) {
  const all = await db.getAll('weakWords');
  return all.filter(w => w.itemId === itemId);
}
export async function weakWordsDue(itemId, today = todayStr()) {
  return (await weakWordsFor(itemId)).filter(w => w.dueDate && w.dueDate <= today);
}

// ---- recordings ----
export async function saveRecording(meta, blob, settings) {
  const id = await db.put('recordings', { date: todayStr(), ts: Date.now(), size: blob.size, mime: blob.type, ...meta, blob });
  await enforceRecordingLimit(settings?.keepRecordings ?? DEFAULT_SETTINGS.keepRecordings);
  return id;
}
export async function updateRecording(id, patch) {
  const r = await db.get('recordings', id);
  if (!r) return null;
  Object.assign(r, patch);
  await db.put('recordings', r);
  return r;
}
export async function deleteRecording(id) { return db.del('recordings', id); }
export async function enforceRecordingLimit(limit) {
  const all = (await db.getAll('recordings')).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const excess = all.length - limit;
  for (let i = 0; i < excess; i++) await db.del('recordings', all[i].id);
  return Math.max(0, excess);
}
export async function recordingsFor(word = null, itemId = null) {
  let all = await db.getAll('recordings');
  if (word) all = all.filter(r => r.word === word);
  if (itemId) all = all.filter(r => r.itemId === itemId);
  return all.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}
export async function recordingsTotalSize() {
  return (await db.getAll('recordings')).reduce((s, r) => s + (r.size || 0), 0);
}

// ---- sessions ----
export async function saveSession(s) {
  return db.put('sessions', { date: todayStr(), ts: Date.now(), ...s });
}
export async function sessionsToday() { return db.getAllByIndex('sessions', 'date', todayStr()); }

// ---- dashboard aggregates ----
export async function dashboardStats(items) {
  const today = todayStr();
  const [reps, sessions, progress, quiz] = await Promise.all([
    db.getAll('repCounts'), db.getAll('sessions'), db.getAll('progress'), db.getAll('quizLog')]);
  const dates = new Set([...sessions.map(s => s.date), ...reps.map(r => r.date)]);
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    week.push({
      date: d,
      reps: reps.filter(r => r.date === d).reduce((s, r) => s + r.count, 0),
      sessions: sessions.filter(s => s.date === d).length,
      quiz: accuracy(quiz.filter(q => q.date === d)),
    });
  }
  const bySound = {};
  for (const r of reps) bySound[r.sound] = (bySound[r.sound] || 0) + r.count;
  const ratingsTimeline = sessions.filter(s => s.rating).map(s => ({ date: s.date, itemId: s.itemId, rating: s.rating })).sort((a, b) => a.date.localeCompare(b.date));
  const nextReviews = progress.filter(p => p.nextDate).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  return {
    today,
    todayReps: week[6].reps,
    streak: computeStreak(dates, today),
    week,
    bySound,
    quiz: { ...accuracy(quiz), confusions: confusionPairs(quiz) },
    ratingsTimeline,
    nextReviews,
    progress,
    itemsById: Object.fromEntries(items.map(i => [i.id, i])),
    totalReps: reps.reduce((s, r) => s + r.count, 0),
  };
}
