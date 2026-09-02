// エントリーポイント: データ読み込み・ルーティング・共通レイアウト
import { h, clear, toast } from './util.js';
import * as store from './store.js';
import * as db from './db.js';
import { renderHome } from './dashboard.js';
import { renderPractice } from './practice.js';
import { renderSortGame } from './sortgame.js';
import { renderQuiz } from './quiz.js';
import { renderRecords } from './records.js';
import { renderSettings } from './settings.js';
import { renderCurriculum } from './curriculum.js';

export const state = {
  curriculum: null,
  words: null,
  settings: null,
  ready: false,
  deferredInstall: null,
};

export function items() { return state.curriculum.items; }
export function itemById(id) { return items().find(i => i.id === id); }
export function wordsFor(itemId) { return state.words.words.filter(w => w.item === itemId); }
export function wordInfo(word, itemId = null) {
  return state.words.words.find(w => w.word === word && (!itemId || w.item === itemId)) || state.words.words.find(w => w.word === word) || null;
}
export function pairsFor(itemId) { return state.words.pairs.filter(p => p.item === itemId); }

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' }).catch(() => null);
  if (!res || !res.ok) throw new Error(`${path} を読み込めません`);
  return res.json();
}

const routes = {
  '': renderHome,
  'home': renderHome,
  'practice': renderPractice,   // #/practice/:itemId/:day/:kind
  'sort': renderSortGame,       // #/sort/:itemId
  'quiz': renderQuiz,           // #/quiz/:itemId
  'records': renderRecords,
  'settings': renderSettings,
  'curriculum': renderCurriculum,
};

export function navigate(path) { location.hash = '#/' + path.replace(/^#?\/?/, ''); }

let currentCleanup = null;
async function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [name, ...params] = hash.split('/').filter(Boolean);
  const fn = routes[name || ''] || renderHome;
  const main = document.getElementById('main');
  if (typeof currentCleanup === 'function') { try { currentCleanup(); } catch { /* ignore */ } }
  currentCleanup = null;
  clear(main);
  window.scrollTo(0, 0);
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.dataset.route === (name || 'home')));
  try {
    state.settings = await store.loadSettings();
    currentCleanup = await fn(main, params.map(decodeURIComponent));
  } catch (e) {
    console.error(e);
    clear(main).append(h('div', { class: 'card error' },
      h('h2', {}, 'エラーが発生しました'), h('p', {}, String(e.message || e)),
      h('button', { class: 'btn', onClick: () => navigate('') }, 'ホームへ')));
  }
}

function layout() {
  const app = document.getElementById('app');
  clear(app);
  app.append(
    h('header', { class: 'top' },
      h('a', { href: '#/', class: 'brand' }, '英語耳 母音トレーナー'),
      h('span', { id: 'online', class: 'pill', title: '接続状態' }, navigator.onLine ? 'オンライン' : 'オフライン')),
    h('main', { id: 'main' }),
    h('nav', { class: 'nav' },
      navLink('home', '今日', '🏠'), navLink('curriculum', '課程', '📚'), navLink('records', '録音', '🎙'), navLink('settings', '設定', '⚙️')),
  );
  window.addEventListener('online', () => { const o = document.getElementById('online'); if (o) o.textContent = 'オンライン'; });
  window.addEventListener('offline', () => { const o = document.getElementById('online'); if (o) o.textContent = 'オフライン'; });
}
function navLink(route, label, icon) {
  return h('a', { href: '#/' + route, dataset: { route } }, h('span', { class: 'ico', 'aria-hidden': 'true' }, icon), h('span', {}, label));
}

async function boot() {
  layout();
  const main = document.getElementById('main');
  main.append(h('p', { class: 'muted center' }, '読み込み中…'));
  try {
    [state.curriculum, state.words] = await Promise.all([loadJSON('data/curriculum.json'), loadJSON('data/words.json')]);
  } catch (e) {
    clear(main).append(h('div', { class: 'card error' }, h('h2', {}, 'データを読み込めません'), h('p', {}, e.message),
      h('p', { class: 'muted' }, 'オフラインで初回起動した場合は、一度オンラインで開いてください。')));
    return;
  }
  state.ready = true;
  if (db.isFallback()) toast('IndexedDB が使えないため、録音は保存されません', { type: 'warn', ms: 5000 });
  window.addEventListener('hashchange', route);
  await route();

  // PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) toast('新しいバージョンがあります。再読み込みすると更新されます。', { ms: 5000 });
        });
      });
    }).catch(err => console.warn('SW 登録失敗', err));
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.deferredInstall = e; });
}

boot();
