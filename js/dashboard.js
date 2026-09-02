// ホーム / ダッシュボード
import { h, toast, fmtDate, ipa } from './util.js';
import * as store from './store.js';
import { state, items, navigate } from './app.js';
import { addDays } from './srs.js';

const RATING_CLASS = { '×': 'r-x', '△': 'r-tri', '○': 'r-o', '◎': 'r-oo', '未': 'r-none' };

export async function renderHome(main) {
  const plan = await store.todayPlan(items(), state.settings);
  const stats = await store.dashboardStats(items());
  const sessionsToday = await store.sessionsToday();
  const doneIds = new Set(sessionsToday.map(s => s.itemId));

  // ---- 今日の練習 ----
  const todayCard = h('section', { class: 'card' },
    h('div', { class: 'row between' },
      h('h2', {}, '今日の練習'),
      h('span', { class: 'muted small' }, plan.today)),
  );
  const list = h('div', { class: 'list' });
  const mkRow = (entry, label) => {
    const { item, progress, kind } = entry;
    const day = kind === 'review' ? progress.dayCount : (progress.currentDay || 1);
    const done = doneIds.has(item.id) && progress.lastDate === plan.today;
    return h('a', { class: 'item' + (done ? ' done' : ''), href: `#/practice/${item.id}/${day}/${kind}` },
      h('div', {},
        h('div', { class: 'title' }, item.title),
        h('div', { class: 'small muted' }, `Track ${item.tracks.join('・')} ／ ${label}${item.dayCount > 1 ? ` ／ ${day}日目` : ''}`)),
      h('span', { class: 'chev' }, done ? '✓' : '›'));
  };
  plan.reviews.forEach(r => list.append(mkRow(r, '復習')));
  if (plan.learning) list.append(mkRow(plan.learning, '学習中'));
  if (plan.fresh) list.append(mkRow(plan.fresh, '新規'));
  if (!plan.reviews.length && !plan.learning && !plan.fresh) {
    list.append(h('p', { class: 'muted' }, plan.postponed ? '新規は明日に延期しました。復習はありません。' : '今日の予定はすべて終わりました。おつかれさまでした。'));
    const nextDue = stats.nextReviews.find(p => p.nextDate > plan.today);
    if (nextDue) list.append(h('p', { class: 'small muted' }, `次の復習: ${fmtDate(nextDue.nextDate)}（${stats.itemsById[nextDue.itemId]?.title || nextDue.itemId}）`));
  }
  todayCard.append(list);
  if (plan.fresh && plan.reviews.length) {
    todayCard.append(h('button', { class: 'btn ghost small', onClick: async () => {
      await store.saveSetting('postponeNewUntil', addDays(plan.today, 1));
      toast('新規項目を明日へ延期しました'); navigate('');
    } }, '時間がないので新規を明日へ延期'));
  }
  if (plan.postponed) {
    todayCard.append(h('button', { class: 'btn ghost small', onClick: async () => {
      await store.saveSetting('postponeNewUntil', null); navigate('');
    } }, '延期を取り消す'));
  }

  // ---- 今日の数字 ----
  const target = state.settings.targetReps;
  const numCard = h('section', { class: 'card stats3' },
    stat('今日の反復', stats.todayReps, '回'),
    stat('連続学習', stats.streak, '日'),
    stat('累計反復', stats.totalReps, '回'),
  );

  // ---- 7日間 ----
  const maxReps = Math.max(1, ...stats.week.map(w => w.reps));
  const weekCard = h('section', { class: 'card' }, h('h3', {}, '7日間の学習履歴'),
    h('div', { class: 'bars' }, ...stats.week.map(w => h('div', { class: 'bar-col' },
      h('div', { class: 'bar-wrap' }, h('div', { class: 'bar' + (w.date === plan.today ? ' today' : ''), style: { height: `${Math.round(w.reps / maxReps * 100)}%` }, title: `${w.reps}回` })),
      h('div', { class: 'small' }, w.reps || ''),
      h('div', { class: 'small muted' }, fmtDate(w.date))))));

  // ---- 音別累計 ----
  const soundEntries = Object.entries(stats.bySound).sort((a, b) => b[1] - a[1]);
  const soundCard = h('section', { class: 'card' }, h('h3', {}, '音別の累計反復数'),
    soundEntries.length ? h('div', { class: 'chips' }, ...soundEntries.map(([s, n]) => h('span', { class: 'chip' }, h('b', {}, ipa(s)), ` ${n}`))) : h('p', { class: 'muted small' }, 'まだ記録がありません'));

  // ---- 聞き分け ----
  const q = stats.quiz;
  const quizCard = h('section', { class: 'card' }, h('h3', {}, '聞き分け'),
    h('p', {}, q.total ? `正答率 ${Math.round(q.ratio * 100)}%（${q.correct}/${q.total}、最初の回答のみ）` : '未実施'),
    q.confusions.length ? h('div', {}, h('div', { class: 'small muted' }, '混同しやすい音（聞いた音 → 選んだ音）'),
      h('div', { class: 'chips' }, ...q.confusions.slice(0, 6).map(c => h('span', { class: 'chip warn' }, `${ipa(c.from)} → ${ipa(c.to)} ×${c.count}`)))) : null);

  // ---- 評価の推移 / 次回復習 ----
  const progCard = h('section', { class: 'card' }, h('h3', {}, '項目ごとの状況'),
    h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, '項目'), h('th', {}, '評価の推移'), h('th', {}, '次回'))),
      h('tbody', {}, ...items().map(it => {
        const p = stats.progress.find(p => p.itemId === it.id);
        const seq = (p?.ratings || []).slice(-8).map(r => h('span', { class: 'rt ' + RATING_CLASS[r.rating], title: r.date }, r.rating));
        return h('tr', {}, h('td', {}, it.title), h('td', {}, seq.length ? seq : h('span', { class: 'muted' }, '—')),
          h('td', {}, p?.nextDate ? fmtDate(p.nextDate) : h('span', { class: 'muted' }, p ? '—' : '未着手')));
      }))));

  main.append(todayCard, numCard, weekCard, soundCard, quizCard, progCard,
    h('p', { class: 'small muted center' }, `1語の目標 ${target}回。設定で変更できます。`));
}

function stat(label, value, unit) {
  return h('div', { class: 'stat' }, h('div', { class: 'val' }, String(value)), h('div', { class: 'small muted' }, `${label}（${unit}）`));
}
