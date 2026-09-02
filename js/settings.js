// 設定・バックアップ・音声取り込み
import { h, clear, toast, fmtBytes, confirmDialog, downloadJSON, readFileAsText } from './util.js';
import * as db from './db.js';
import * as store from './store.js';
import { listVoices, ttsSupported, invalidateTrackCache, trackFileName } from './audio.js';
import { state, items, navigate } from './app.js';
import { rebaseBackupDates, todayStr } from './srs.js';

export async function renderSettings(main) {
  const s = state.settings;
  const set = async (k, v) => { await store.saveSetting(k, v); state.settings[k] = v; };

  // ---- 練習設定 ----
  const voiceSel = h('select', { class: 'input', onChange: e => set('ttsVoice', e.target.value || null) });
  const fillVoices = () => { clear(voiceSel).append(h('option', { value: '' }, '自動（en-US）'), ...listVoices().map(v => h('option', { value: v.voiceURI, selected: v.voiceURI === s.ttsVoice }, `${v.name} (${v.lang})`))); };
  fillVoices();
  if (ttsSupported()) speechSynthesis.addEventListener('voiceschanged', fillVoices);

  main.append(h('section', { class: 'card' }, h('h2', {}, '練習設定'),
    field('1語の目標回数（初期値）', numInput(s.targetReps, 1, 100, v => set('targetReps', v))),
    field('休憩を促す間隔（回）', numInput(s.breakEvery, 5, 50, v => set('breakEvery', v))),
    field('聞き分けの出題数', numInput(s.quizCount, 4, 30, v => set('quizCount', v))),
    field('見本の話者', h('select', { class: 'input', onChange: e => set('speaker', e.target.value) }, ...state.curriculum.speakers.map(sp => h('option', { value: sp.id, selected: sp.id === s.speaker }, sp.label)))),
    field('聞き分けで話者をランダムに', h('input', { type: 'checkbox', checked: s.altSpeaker, onChange: e => set('altSpeaker', e.target.checked) })),
    field('単語音声の合成音声（フォールバック）', ttsSupported() ? voiceSel : h('span', { class: 'muted small' }, 'この端末では使えません')),
    field('録音の保持上限（件）', numInput(s.keepRecordings, 5, 500, async v => { await set('keepRecordings', v); const n = await store.enforceRecordingLimit(v); if (n) toast(`古い録音 ${n} 件を削除しました`); })),
  ));

  // ---- 音声取り込み ----
  const trackList = h('div', { class: 'small' });
  const wordList = h('div', { class: 'small' });
  const refreshAudio = async () => {
    const tr = await db.getAll('trackAudio');
    clear(trackList).append(tr.length ? h('div', { class: 'chips' }, ...tr.map(t => h('span', { class: 'chip' }, `${t.key}.mp3 `, h('button', { class: 'x', title: '削除', onClick: async () => { await db.del('trackAudio', t.key); invalidateTrackCache(); refreshAudio(); } }, '×')))) : h('span', { class: 'muted' }, 'アプリ内に取り込んだトラックはありません（audio/ フォルダのファイルはそのまま使われます）'));
    const wa = await db.getAll('wordAudio');
    clear(wordList).append(wa.length ? h('div', { class: 'chips' }, ...wa.map(w => h('span', { class: 'chip' }, `${w.word} (${w.speaker}) `, h('button', { class: 'x', onClick: async () => { await db.del('wordAudio', w.key); refreshAudio(); } }, '×')))) : h('span', { class: 'muted' }, '登録なし。単語の音声がない場合は合成音声を使います'));
  };
  const trackFile = h('input', { type: 'file', accept: 'audio/*', multiple: true, class: 'input', onChange: async e => {
    let ok = 0, ng = [];
    for (const f of e.target.files) {
      const m = f.name.match(/^([A-Za-z0-9]+)-Practice-(\d+)[a-z]?\.(mp3|m4a|wav|ogg)$/i);
      if (!m) { ng.push(f.name); continue; }
      try { await db.put('trackAudio', { key: `${m[1].toUpperCase()}-${Number(m[2])}`, speaker: m[1].toUpperCase(), track: Number(m[2]), blob: f, mime: f.type, name: f.name }); ok++; }
      catch (err) { ng.push(`${f.name}（${err.message}）`); }
    }
    invalidateTrackCache();
    toast(`${ok} 件を取り込みました` + (ng.length ? `。対象外: ${ng.join(', ')}` : ''), { type: ng.length ? 'warn' : 'ok', ms: 5000 });
    e.target.value = ''; refreshAudio();
  } });
  const wWord = h('input', { class: 'input', placeholder: '単語（例: hot）' });
  const wSpeaker = h('select', { class: 'input' }, ...state.curriculum.speakers.map(sp => h('option', { value: sp.id }, sp.label)), h('option', { value: 'X' }, 'その他'));
  const wFile = h('input', { type: 'file', accept: 'audio/*', class: 'input' });
  const addWord = h('button', { class: 'btn small', onClick: async () => {
    const word = wWord.value.trim(); const f = wFile.files[0];
    if (!word || !f) return toast('単語とファイルを指定してください', { type: 'warn' });
    try { await db.put('wordAudio', { key: `${word}|${wSpeaker.value}|${Date.now()}`, word, speaker: wSpeaker.value, blob: f, mime: f.type }); toast('登録しました', { type: 'ok' }); wWord.value = ''; wFile.value = ''; refreshAudio(); }
    catch (err) { toast(err.message, { type: 'error' }); }
  } }, '単語音声を登録');
  main.append(h('section', { class: 'card' }, h('h2', {}, '音声の取り込み'),
    h('p', { class: 'small muted' }, `見本トラックは公開フォルダ audio/ に ${trackFileName('M', 26)} のような名前で置くか、ここから端末内のファイルを取り込みます（アプリ内に保存され、オフラインでも使えます）。ファイル名は「話者-Practice-番号.mp3」形式が必要です。`),
    field('トラック（複数可）', trackFile), trackList,
    h('h4', {}, '単語音声（任意）'),
    h('p', { class: 'small muted' }, '聞き分けクイズ・分類ゲームの単語音声。複数話者を登録すると出題時にランダムに使われ、同じ録音の暗記を防げます。'),
    h('div', { class: 'row gap wrap' }, wWord, wSpeaker), field('ファイル', wFile), addWord, wordList));
  refreshAudio();

  // ---- バックアップ ----
  const importMode = h('select', { class: 'input' }, h('option', { value: 'merge' }, '既存データに追加・上書き（推奨）'), h('option', { value: 'replace' }, '既存データを消して置き換え'));
  const importFile = h('input', { type: 'file', accept: 'application/json,.json', class: 'input' });
  main.append(h('section', { class: 'card' }, h('h2', {}, 'バックアップ／復元'),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn', onClick: async () => { try { downloadJSON(await db.exportAll(), `eigomimi-backup-${today()}.json`); } catch (e) { toast('エクスポート失敗: ' + e.message, { type: 'error' }); } } }, '学習データを書き出し（JSON）'),
      h('button', { class: 'btn ghost', onClick: async () => {
        const size = await store.recordingsTotalSize();
        if (size > 30 * 1048576 && !await confirmDialog(`録音が ${fmtBytes(size)} あります。JSON は約1.35倍の大きさになります。続けますか？`)) return;
        try { toast('作成中…'); downloadJSON(await db.exportAll({ includeRecordings: true }), `eigomimi-backup-with-audio-${today()}.json`); } catch (e) { toast('エクスポート失敗: ' + e.message, { type: 'error' }); }
      } }, '録音も含めて書き出し')),
    h('h4', {}, '復元'), importMode, importFile,
    h('button', { class: 'btn', onClick: async () => {
      const f = importFile.files[0];
      if (!f) return toast('JSON ファイルを選んでください', { type: 'warn' });
      let obj;
      try { obj = JSON.parse(await readFileAsText(f)); } catch { return toast('JSON として読み込めません（ファイルが壊れているか形式が違います）', { type: 'error', ms: 5000 }); }
      try { db.validateBackup(obj); } catch (e) { return toast('復元できません: ' + e.message, { type: 'error', ms: 5000 }); }
      if (importMode.value === 'replace' && !await confirmDialog('現在の学習データと録音をすべて消して置き換えます。よろしいですか？', { ok: '置き換える', danger: true })) return;
      try {
        const st = await db.importAll(obj, { mode: importMode.value });
        toast(`復元しました: 進捗 ${st.progress}、セッション ${st.sessions}、録音 ${st.recordings}`, { type: 'ok', ms: 5000 });
        navigate('');
      } catch (e) { toast('復元に失敗しました: ' + e.message, { type: 'error', ms: 6000 }); }
    } }, '復元する'),
    h('p', { class: 'small muted' }, 'iPhone では書き出したファイルは「ファイル」アプリのダウンロードに保存されます。iCloud などに置いておくと機種変更時に復元できます。'),
    h('button', { class: 'btn ghost small', onClick: async () => {
      if (!await confirmDialog('サンプルデータ（数日分の架空の学習履歴）を読み込みますか？既存データに追加されます。')) return;
      try { const res = await fetch('data/sample-data.json'); const obj = rebaseBackupDates(await res.json(), todayStr()); const st = await db.importAll(obj, { mode: 'merge' }); toast(`サンプルを読み込みました（セッション ${st.sessions}）`, { type: 'ok' }); navigate(''); }
      catch (e) { toast('サンプルの読み込みに失敗: ' + e.message, { type: 'error' }); }
    } }, 'サンプルデータを読み込む')));

  // ---- ストレージ ----
  const est = await db.storageEstimate();
  const recSize = await store.recordingsTotalSize();
  const recCount = await db.count('recordings');
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => null) : null;
  main.append(h('section', { class: 'card' }, h('h2', {}, 'ストレージ'),
    h('p', { class: 'small' }, `録音 ${recCount} 件 / ${fmtBytes(recSize)}`, est.quota ? `　使用 ${fmtBytes(est.usage)} / 上限目安 ${fmtBytes(est.quota)}` : ''),
    h('p', { class: 'small muted' }, 'iOS の Safari は、7日間サイトを開かないとデータを削除することがあります。ホーム画面に追加して使うか、定期的にバックアップしてください。', persisted === false ? ' 現在「永続化」は未許可です。' : persisted ? ' 永続化: 許可済み。' : ''),
    h('div', { class: 'row gap wrap' },
      h('button', { class: 'btn small', onClick: async () => { const ok = await db.requestPersistence(); toast(ok ? 'ストレージの永続化が許可されました' : '永続化は許可されませんでした（ブラウザの判断）', { type: ok ? 'ok' : 'warn' }); } }, '永続化を要求'),
      h('button', { class: 'btn small ghost', onClick: () => navigate('records') }, '録音を管理'),
      h('button', { class: 'btn small danger', onClick: async () => {
        if (!await confirmDialog('すべての学習データと録音を削除します。元に戻せません。', { ok: '全削除', danger: true })) return;
        await db.wipeAll(); toast('削除しました'); navigate('');
      } }, 'すべて削除'))));

  // ---- アプリ情報 ----
  main.append(h('section', { class: 'card' }, h('h2', {}, 'このアプリについて'),
    h('p', { class: 'small' }, '『英語耳』の母音練習を反復・聞き分け・録音比較・復習間隔で支えるための個人用ツールです。自動の発音判定は行いません。評価はすべて自己評価です。'),
    h('p', { class: 'small muted' }, 'ホーム画面に追加: iPhone は Safari の共有ボタン →「ホーム画面に追加」。Android/PC は ブラウザのメニュー →「インストール」。'),
    state.deferredInstall ? h('button', { class: 'btn small', onClick: () => state.deferredInstall.prompt() }, 'インストール') : null,
    h('p', { class: 'small muted' }, `カリキュラム v${state.curriculum.version} ／ 単語 ${state.words.words.length} 語 ／ 項目 ${items().length}`)));
}

function field(label, input) { return h('label', { class: 'field' }, h('span', { class: 'small' }, label), input); }
function numInput(v, min, max, onChange) {
  return h('input', { class: 'input num', type: 'number', min, max, value: v, onChange: e => { const n = Math.min(max, Math.max(min, Number(e.target.value) || min)); e.target.value = n; onChange(n); } });
}
function today() { return new Date().toISOString().slice(0, 10); }
