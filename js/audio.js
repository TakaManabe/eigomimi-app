// 音声再生（Web Audio API）・録音（MediaRecorder）・波形・合成音声
import * as db from './db.js';

let ctx = null;
export function getContext() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// ---------- 見本トラックのURL解決 ----------
const urlCache = new Map();
export function trackFileName(speaker, track) {
  return `${speaker}-Practice-${String(track).padStart(2, '0')}.mp3`;
}
export async function resolveTrackUrl(speaker, track) {
  const key = `${speaker}-${track}`;
  if (urlCache.has(key)) return urlCache.get(key);
  let url = null;
  try {
    const rec = await db.get('trackAudio', key);
    if (rec && rec.blob) url = URL.createObjectURL(rec.blob);
  } catch { /* ignore */ }
  if (!url) {
    const candidate = `audio/${trackFileName(speaker, track)}`;
    try {
      const res = await fetch(candidate, { method: 'HEAD' });
      if (res.ok) url = candidate;
    } catch { /* offline & not cached */ }
  }
  urlCache.set(key, url);
  return url;
}
export function invalidateTrackCache() { urlCache.clear(); }

// ---------- 再生プレイヤー（HTMLAudio + MediaElementSource, 音程保持で速度変更） ----------
export class Player {
  constructor() {
    this.el = new Audio();
    this.el.preload = 'auto';
    this.el.crossOrigin = 'anonymous';
    if ('preservesPitch' in this.el) this.el.preservesPitch = true;
    if ('mozPreservesPitch' in this.el) this.el.mozPreservesPitch = true;
    this.node = null;
    this.loop = null; // {a, b}
    this._raf = null;
    this.onTime = null;
    this.onEnd = null;
    this.el.addEventListener('ended', () => { this._stopRaf(); this.onEnd && this.onEnd(); });
    this.el.addEventListener('error', () => { this._stopRaf(); this.onEnd && this.onEnd(new Error('再生に失敗しました')); });
  }
  _connect() {
    const c = getContext();
    if (!c || this.node) return;
    try {
      this.node = c.createMediaElementSource(this.el);
      this.node.connect(c.destination);
    } catch { this.node = null; }
  }
  get duration() { return isFinite(this.el.duration) ? this.el.duration : 0; }
  get currentTime() { return this.el.currentTime; }
  set rate(r) { this.el.playbackRate = r; }
  get rate() { return this.el.playbackRate; }

  async load(src) {
    if (this.el.src !== src) {
      this.el.src = src;
      await new Promise((res, rej) => {
        const ok = () => { cleanup(); res(); };
        const bad = () => { cleanup(); rej(new Error('音声を読み込めません')); };
        const cleanup = () => { this.el.removeEventListener('loadedmetadata', ok); this.el.removeEventListener('error', bad); };
        this.el.addEventListener('loadedmetadata', ok);
        this.el.addEventListener('error', bad);
        this.el.load();
      });
    }
    this._connect();
  }
  async play(src, { rate = 1, from = null, loop = null } = {}) {
    getContext();
    if (src) await this.load(src);
    this.el.playbackRate = rate;
    this.loop = loop;
    if (from != null) this.el.currentTime = from;
    else if (loop) this.el.currentTime = loop.a;
    await this.el.play();
    this._startRaf();
  }
  pause() { this.el.pause(); this._stopRaf(); }
  stop() { this.el.pause(); try { this.el.currentTime = 0; } catch { /* not loaded */ } this._stopRaf(); }
  seek(t) { this.el.currentTime = Math.max(0, Math.min(t, this.duration || t)); }
  get playing() { return !this.el.paused && !this.el.ended; }
  _startRaf() {
    this._stopRaf();
    const step = () => {
      if (this.loop && this.el.currentTime >= this.loop.b) {
        this.el.currentTime = this.loop.a;
      }
      this.onTime && this.onTime(this.el.currentTime, this.duration);
      if (this.playing) this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }
  _stopRaf() { if (this._raf) cancelAnimationFrame(this._raf); this._raf = null; }
  /** 終了まで待って再生 */
  playToEnd(src, opts = {}) {
    return new Promise((resolve, reject) => {
      this.loop = null;
      const prev = this.onEnd;
      this.onEnd = (err) => { this.onEnd = prev; err ? reject(err) : resolve(); };
      this.play(src, { ...opts, loop: null }).catch(e => { this.onEnd = prev; reject(e); });
    });
  }
}

// ---------- 録音 ----------
export function recordingSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && globalThis.MediaRecorder);
}
export function pickMime() {
  const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac'];
  for (const m of cands) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* ignore */ } }
  return '';
}
export class Recorder {
  constructor() { this.stream = null; this.rec = null; this.chunks = []; this.startedAt = 0; this.analyser = null; }
  async start(onLevel) {
    if (!recordingSupported()) throw new RecError('unsupported', 'このブラウザは録音に対応していません。iPhoneでは Safari を使ってください。');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } });
    } catch (e) {
      if (e.name === 'NotAllowedError' || e.name === 'SecurityError') throw new RecError('denied', 'マイクの使用が許可されていません。設定 > Safari（またはブラウザ）> マイク で許可してください。');
      if (e.name === 'NotFoundError') throw new RecError('nodevice', 'マイクが見つかりません。');
      throw new RecError('other', 'マイクを開けませんでした: ' + e.message);
    }
    const mime = pickMime();
    this.rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
    // レベルメーター
    const c = getContext();
    if (c && onLevel) {
      try {
        const src = c.createMediaStreamSource(this.stream);
        this.analyser = c.createAnalyser(); this.analyser.fftSize = 512;
        src.connect(this.analyser);
        const buf = new Uint8Array(this.analyser.fftSize);
        const tick = () => {
          if (!this.rec || this.rec.state !== 'recording') return;
          this.analyser.getByteTimeDomainData(buf);
          let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
          onLevel(Math.sqrt(sum / buf.length));
          requestAnimationFrame(tick);
        };
        this.rec.addEventListener('start', () => requestAnimationFrame(tick));
      } catch { /* ignore */ }
    }
    this.rec.start(250);
    this.startedAt = performance.now();
  }
  stop() {
    return new Promise((resolve, reject) => {
      if (!this.rec) return reject(new RecError('notstarted', '録音が開始されていません'));
      const rec = this.rec;
      rec.onstop = () => {
        const duration = (performance.now() - this.startedAt) / 1000;
        const blob = new Blob(this.chunks, { type: rec.mimeType || this.chunks[0]?.type || 'audio/webm' });
        this.stream.getTracks().forEach(t => t.stop());
        this.rec = null; this.stream = null;
        resolve({ blob, duration, mime: blob.type });
      };
      rec.onerror = e => reject(new RecError('other', '録音エラー: ' + (e.error?.message || '')));
      if (rec.state !== 'inactive') rec.stop(); else rec.onstop();
    });
  }
  cancel() {
    try { this.rec && this.rec.state !== 'inactive' && this.rec.stop(); } catch { /* ignore */ }
    this.stream && this.stream.getTracks().forEach(t => t.stop());
    this.rec = null; this.stream = null;
  }
  get recording() { return !!this.rec && this.rec.state === 'recording'; }
}
export class RecError extends Error { constructor(code, msg) { super(msg); this.code = code; this.name = 'RecError'; } }

// ---------- 波形 ----------
const peaksCache = new Map();
export async function computePeaks(src, buckets = 200) {
  const key = (src instanceof Blob ? 'blob:' + src.size + ':' + src.type : src) + ':' + buckets;
  if (peaksCache.has(key)) return peaksCache.get(key);
  const c = getContext();
  if (!c) return null;
  let ab;
  if (src instanceof Blob) ab = await src.arrayBuffer();
  else ab = await (await fetch(src)).arrayBuffer();
  const audio = await new Promise((res, rej) => {
    // Safari は Promise 版を返さないことがある
    const p = c.decodeAudioData(ab, res, rej);
    if (p && p.then) p.then(res, rej);
  });
  const data = audio.getChannelData(0);
  const step = Math.max(1, Math.floor(data.length / buckets));
  const peaks = new Float32Array(buckets);
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    const start = i * step, end = Math.min(data.length, start + step);
    for (let j = start; j < end; j++) { const v = Math.abs(data[j]); if (v > max) max = v; }
    peaks[i] = max;
  }
  const out = { peaks, duration: audio.duration };
  peaksCache.set(key, out);
  return out;
}
export function drawWaveform(canvas, peaks, { color = '#3b82f6', progress = null, region = null } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 300, h = canvas.clientHeight || 60;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  if (region) {
    g.fillStyle = 'rgba(250, 204, 21, 0.25)';
    g.fillRect(region.a * w, 0, Math.max(2, (region.b - region.a) * w), h);
  }
  if (!peaks) {
    g.fillStyle = '#9ca3af'; g.font = '12px sans-serif'; g.textAlign = 'center';
    g.fillText('波形を表示できません', w / 2, h / 2 + 4);
    return;
  }
  const n = peaks.length, bw = w / n;
  const norm = Math.max(0.05, ...peaks);
  for (let i = 0; i < n; i++) {
    const amp = (peaks[i] / norm) * (h / 2) * 0.95;
    g.fillStyle = progress != null && i / n <= progress ? color : color + '88';
    g.fillRect(i * bw, h / 2 - amp, Math.max(1, bw - 1), amp * 2 || 1);
  }
  if (progress != null) {
    g.fillStyle = '#ef4444';
    g.fillRect(progress * w - 1, 0, 2, h);
  }
}

// ---------- 合成音声（単語用フォールバック。発音判定には使用しない） ----------
export function ttsSupported() { return 'speechSynthesis' in globalThis; }
export function listVoices() {
  if (!ttsSupported()) return [];
  return speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang)).sort((a, b) => (b.lang === 'en-US') - (a.lang === 'en-US'));
}
export function speak(text, { voiceURI = null, rate = 0.9 } = {}) {
  return new Promise((resolve) => {
    if (!ttsSupported()) return resolve(false);
    try { speechSynthesis.cancel(); } catch { /* ignore */ }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = rate;
    const voices = listVoices();
    const v = voices.find(v => v.voiceURI === voiceURI) || voices.find(v => v.lang === 'en-US') || voices[0];
    if (v) u.voice = v;
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    speechSynthesis.speak(u);
    setTimeout(() => resolve(true), 8000); // 保険
  });
}

/** 単語音声: 登録済み（wordAudio）があればそれを、なければTTS。戻り値 'file' | 'tts' | null */
export async function playWord(word, { speaker = null, player = null, voiceURI = null, rate = 0.9 } = {}) {
  let recs = [];
  try {
    const all = await db.getAll('wordAudio');
    recs = all.filter(r => r.word === word && (!speaker || r.speaker === speaker));
    if (!recs.length && speaker) recs = all.filter(r => r.word === word);
  } catch { /* ignore */ }
  if (recs.length && player) {
    const r = recs[Math.floor(Math.random() * recs.length)];
    const url = URL.createObjectURL(r.blob);
    try { await player.playToEnd(url, { rate }); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
    return 'file';
  }
  const ok = await speak(word, { voiceURI, rate });
  return ok ? 'tts' : null;
}
