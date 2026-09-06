// 課程一覧
import { h, fmtDate, ipa } from './util.js';
import * as store from './store.js';
import { items, drillSets } from './app.js';

const STATUS = { new: '未着手', learning: '学習中', review: '復習中' };

export async function renderCurriculum(main) {
  const progress = await store.getProgressList();
  const byId = Object.fromEntries(progress.map(p => [p.itemId, p]));
  main.append(h('h2', {}, '母音カリキュラム'), h('p', { class: 'small muted' }, '順序は固定です。ホームの「今日の練習」から進めるのが基本ですが、ここから任意の項目を開くこともできます。'));
  for (const it of items()) {
    const p = byId[it.id];
    const day = p ? (p.status === 'review' ? p.dayCount : p.currentDay) : 1;
    const kind = p && p.status === 'review' ? 'review' : 'new';
    main.append(h('section', { class: 'card' },
      h('div', { class: 'row between' }, h('h3', {}, `${it.order}. ${it.title}`), h('span', { class: 'pill' }, p ? STATUS[p.status] : '未着手')),
      h('div', { class: 'small muted' }, `Track ${it.tracks.join('・')} ／ ${it.dayCount}日構成 ／ ${it.sounds.map(ipa).join(' ')}`),
      p ? h('div', { class: 'small' }, `最終 ${fmtDate(p.lastDate)} ／ 次回 ${fmtDate(p.nextDate)} ／ 評価 ${p.lastRating || '—'} ／ 累計反復 ${p.totalReps || 0}`) : null,
      h('div', { class: 'row gap wrap' },
        ...it.days.map(d => h('a', { class: 'btn small' + (d.day === day ? ' primary' : ''), href: `#/practice/${it.id}/${d.day}/${kind}` }, `${d.day}日目を練習`)),
        it.hasSortGame ? h('a', { class: 'btn small ghost', href: `#/sort/${it.id}` }, '単語分類') : null,
        h('a', { class: 'btn small ghost', href: `#/quiz/${it.id}` }, '聞き分け'),
        ...drillSets().filter(s => s.itemId === it.id).map(s => h('a', { class: 'btn small ghost', href: `#/drill/${s.id}` }, `⚡ ${s.title}`)))));
  }
}
