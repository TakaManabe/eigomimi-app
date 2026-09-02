// 共通UI部品: 見本トラックプレイヤー、録音波形
import { h, clear, toast, fmtSec } from './util.js';
import { Player, resolveTrackUrl, computePeaks, drawWaveform } from './audio.js';
import { state } from './app.js';

/**
 * 見本トラックプレイヤー。
 * opts: { tracks:[26,27], speaker:'M', showRate:true, showLoop:true, onSpeakerChange }
 * 返り値: { el, player, play(), stop(), getLoop(), setSpeaker(), destroy(), available }
 */
export function trackPlayer(opts) {
  const player = new Player();
  let speaker = opts.speaker || state.settings.speaker || 'M';
  let trackIdx = 0;
  let url = null;
  let peaks = null;
  let loop = null; // {a,b} seconds
  let rate = 1;
  let available = false;
  let pendingA = null;

  const canvas = h('canvas', { class: 'wave', height: 70 });
  const timeEl = h('span', { class: 'small muted mono' }, '0:00 / 0:00');
  const status = h('div', { class: 'small muted' });
  const speakerBtns = h('div', { class: 'seg' }, ...state.curriculum.speakers.map(s =>
    h('button', { class: 'seg-btn' + (s.id === speaker ? ' on' : ''), dataset: { id: s.id }, onClick: () => setSpeaker(s.id) }, s.label)));
  const trackBtns = h('div', { class: 'seg' }, ...opts.tracks.map((t, i) =>
    h('button', { class: 'seg-btn' + (i === 0 ? ' on' : ''), dataset: { i }, onClick: () => setTrack(i) }, `Track ${t}`)));
  const rateBtns = h('div', { class: 'seg' }, ...[0.75, 1].map(r =>
    h('button', { class: 'seg-btn' + (r === rate ? ' on' : ''), dataset: { r }, onClick: () => { rate = r; player.rate = r; rateBtns.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('on', Number(b.dataset.r) === r)); } }, r === 1 ? '1倍' : '0.75倍')));
  const loopInfo = h('span', { class: 'small muted' }, '区間なし');
  const loopBtns = h('div', { class: 'row gap wrap tp-loop' },
    h('button', { class: 'btn small', onClick: () => { pendingA = player.currentTime; loopInfo.textContent = `A=${fmtSec(pendingA)} … 終点をタップ`; } }, 'A 始点'),
    h('button', { class: 'btn small', onClick: () => {
      const a = pendingA ?? loop?.a ?? 0; const b = player.currentTime;
      if (b <= a + 0.2) return toast('終点は始点より後にしてください', { type: 'warn' });
      loop = { a, b }; pendingA = null; player.loop = loop; loopInfo.textContent = `区間 ${fmtSec(a)}–${fmtSec(b)}`; redraw();
    } }, 'B 終点'),
    h('button', { class: 'btn small ghost', onClick: () => { loop = null; pendingA = null; player.loop = null; loopInfo.textContent = '区間なし'; redraw(); } }, '解除'),
    loopInfo);
  const playBtn = h('button', { class: 'btn primary', onClick: () => toggle() }, '▶ 再生');

  const el = h('div', { class: 'tp' },
    h('div', { class: 'row between wrap gap' }, speakerBtns, opts.tracks.length > 1 ? trackBtns : null),
    canvas,
    h('div', { class: 'row between' }, playBtn, timeEl),
    opts.showRate !== false ? h('div', { class: 'row gap wrap tp-rate' }, h('span', { class: 'small muted' }, '速さ'), rateBtns) : null,
    opts.showLoop ? loopBtns : null,
    status);

  canvas.addEventListener('click', e => {
    if (!available || !player.duration) return;
    const r = canvas.getBoundingClientRect();
    player.seek((e.clientX - r.left) / r.width * player.duration);
    redraw();
  });

  function redraw(progress) {
    const d = player.duration || (peaks && peaks.duration) || 0;
    const p = progress != null ? progress : (d ? player.currentTime / d : 0);
    drawWaveform(canvas, peaks && peaks.peaks, { progress: p, region: loop && d ? { a: loop.a / d, b: loop.b / d } : null });
    timeEl.textContent = `${fmtSec(player.currentTime)} / ${fmtSec(d)}`;
  }
  player.onTime = () => redraw();
  player.onEnd = (err) => { playBtn.textContent = '▶ 再生'; if (err) toast(err.message, { type: 'error' }); redraw(0); };

  async function load() {
    player.stop(); url = null; peaks = null; available = false;
    status.textContent = '読み込み中…';
    url = await resolveTrackUrl(speaker, opts.tracks[trackIdx]);
    if (!url) {
      status.textContent = `音声未登録: ${speaker}-Practice-${String(opts.tracks[trackIdx]).padStart(2, '0')}.mp3（設定 → 音声の取り込み で追加できます）`;
      playBtn.disabled = true; redraw(0); return;
    }
    playBtn.disabled = false;
    try { await player.load(url); } catch (e) { status.textContent = e.message; playBtn.disabled = true; return; }
    status.textContent = '';
    redraw(0);
    computePeaks(url, 240).then(p => { peaks = p; available = true; redraw(0); }).catch(() => { available = true; redraw(0); });
  }
  async function toggle() {
    if (player.playing) { player.pause(); playBtn.textContent = '▶ 再生'; return; }
    try { await player.play(null, { rate, loop }); playBtn.textContent = '❚❚ 停止'; }
    catch (e) { toast('再生できません: ' + e.message, { type: 'error' }); }
  }
  function setSpeaker(id) {
    speaker = id;
    speakerBtns.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('on', b.dataset.id === id));
    opts.onSpeakerChange && opts.onSpeakerChange(id);
    load();
  }
  function setTrack(i) {
    trackIdx = i; loop = null; player.loop = null; loopInfo.textContent = '区間なし';
    trackBtns.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('on', Number(b.dataset.i) === i));
    load();
  }
  load();

  return {
    el, player,
    get available() { return !!url; },
    get url() { return url; },
    get speaker() { return speaker; },
    getLoop: () => loop,
    getRate: () => rate,
    play: () => toggle(),
    /** 区間（または全体）を1回だけ再生して終了を待つ */
    playOnce: async () => {
      if (!url) return false;
      player.loop = null;
      const a = loop ? loop.a : 0, b = loop ? loop.b : (player.duration || 9999);
      await new Promise((res, rej) => {
        const prevEnd = player.onEnd;
        let raf;
        const check = () => { if (player.currentTime >= b) { player.pause(); finish(); return; } raf = requestAnimationFrame(check); };
        const finish = (err) => { cancelAnimationFrame(raf); player.onEnd = prevEnd; playBtn.textContent = '▶ 再生'; redraw(); err ? rej(err) : res(); };
        player.onEnd = finish;
        player.play(null, { rate, from: a }).then(() => { playBtn.textContent = '❚❚ 停止'; raf = requestAnimationFrame(check); }).catch(finish);
      });
      return true;
    },
    stop: () => { player.stop(); playBtn.textContent = '▶ 再生'; redraw(0); },
    setSpeaker,
    destroy: () => { player.stop(); },
  };
}

/** Blob の波形＋再生ボタン（録音用） */
export function recordingView(blob, { label = '自分の録音', color = '#10b981', onDelete = null } = {}) {
  const player = new Player();
  const url = URL.createObjectURL(blob);
  const canvas = h('canvas', { class: 'wave small', height: 48 });
  const btn = h('button', { class: 'btn small', onClick: async () => {
    if (player.playing) { player.stop(); btn.textContent = '▶'; return; }
    try { btn.textContent = '❚❚'; await player.playToEnd(url); } catch (e) { toast('再生できません: ' + e.message, { type: 'error' }); }
    btn.textContent = '▶';
  } }, '▶');
  let peaks = null;
  const redraw = () => drawWaveform(canvas, peaks, { color, progress: player.duration ? player.currentTime / player.duration : 0 });
  player.onTime = redraw;
  computePeaks(blob, 160).then(p => { peaks = p.peaks; redraw(); }).catch(() => redraw());
  const el = h('div', { class: 'recview' },
    h('div', { class: 'row between' }, h('span', { class: 'small' }, label), h('div', { class: 'row gap' }, btn, onDelete ? h('button', { class: 'btn small ghost', onClick: onDelete }, '削除') : null)),
    canvas);
  requestAnimationFrame(redraw);
  return { el, player, url, playOnce: () => player.playToEnd(url), destroy: () => { player.stop(); URL.revokeObjectURL(url); } };
}

export function stepper(n, total) {
  return h('div', { class: 'stepper' }, ...Array.from({ length: total }, (_, i) => h('span', { class: 'dot' + (i < n ? ' done' : '') + (i === n ? ' cur' : '') })));
}

export { clear };
