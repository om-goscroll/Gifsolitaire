import { SfxGate } from './sfxGate.js';
import { SYNTHS } from './synth.js';

const MUTE_STORAGE_KEY = 'picture-swap-muted-v1';
/** Rough lengths of the generated sounds, for the overlap limiter. */
const SYNTH_LENGTH_MS = { drop: 150, invalid: 250, merge: 550, win: 1700, hint: 450, click: 60, locked: 210, whoosh: 330 };

/**
 * All game audio: looping background music and short sound effects, through
 * one Web Audio graph so a single master control mutes everything at once.
 *
 *   sound effects ─► sfx bus ─┐
 *   music element ─► music ───┴─► master (mute) ─► speakers
 *
 * - Browsers block audio until the player interacts; unlock() must be called
 *   from a user gesture (it is safe to call on every gesture).
 * - Recorded effects are decoded once and played from memory, so they start
 *   instantly and never stack up as dozens of <audio> elements.
 * - The same sound cannot machine-gun, and only a few play at once (SfxGate).
 * - Mute is saved and restored, pauses the music, and silences effects already
 *   playing. Music pauses while the tab is hidden.
 *
 * @example
 * const audio = new AudioManager({ audioUrls, config: CONFIG.audio, storage: localStorage });
 * window.addEventListener('pointerdown', () => audio.unlock());
 * audio.play('merge', { pitch: 1.12 });
 */
export class AudioManager {
  /**
   * @param {object} deps
   * @param {Object<string, string>} deps.audioUrls Map of audio fileName -> URL.
   * @param {object} deps.config CONFIG.audio.
   * @param {Storage | null} [deps.storage] Where the mute choice is saved (or null).
   * @param {typeof AudioContext | null} [deps.AudioContextClass] Injected for tests; defaults to the browser's.
   */
  constructor({ audioUrls, config, storage = null, AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext ?? null }) {
    this.audioUrls = audioUrls;
    this.config = config;
    this.storage = storage;
    this.AudioContextClass = AudioContextClass;
    this.muted = this.#loadMuted();
    /** Listeners told when the mute state changes. */
    this.listeners = new Set();
    this.gate = new SfxGate({ minIntervalMs: config.minIntervalMs, maxVoices: config.maxVoices });

    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicGain = null;
    this.bgmStarted = false;
    this.unlocked = false;
    this.duckTimer = 0;

    /** Recorded effects: fetched now (network only), decoded once audio is unlocked. */
    this.files = new Map();
    for (const def of Object.values(config.sfx)) {
      if (!def.file || this.files.has(def.file)) continue;
      const url = audioUrls[def.file];
      if (!url) {
        console.warn(`[audio] Sound file not found: ${def.file}`);
        continue;
      }
      this.files.set(def.file, {
        raw: fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.status)))).catch(() => null),
        buffer: null,
      });
    }

    const bgmUrl = audioUrls[config.bgmFile];
    if (!bgmUrl) console.warn(`[audio] Music file not found: ${config.bgmFile}`);
    this.bgm = bgmUrl ? new Audio(bgmUrl) : null;
    if (this.bgm) {
      this.bgm.loop = true;
      this.bgm.preload = 'auto';
    }

    this.onVisibility = () => this.#handleVisibility();
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  /**
   * Start audio. Call from a user gesture (pointerdown, keydown); later calls
   * only resume audio if the browser suspended it.
   */
  unlock() {
    if (!this.ctx && this.AudioContextClass) this.#buildGraph();
    if (this.ctx?.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {});
    this.unlocked = true;
    this.#startMusic();
  }

  /** Create the Web Audio graph and decode the recorded effects. */
  #buildGraph() {
    try {
      const ctx = new this.AudioContextClass();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.config.sfxVolume;
      this.sfxBus.connect(this.master);
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.master);
      if (this.bgm) ctx.createMediaElementSource(this.bgm).connect(this.musicGain);
      for (const [name, entry] of this.files) {
        entry.raw
          .then((data) => (data ? ctx.decodeAudioData(data) : null))
          .then((buffer) => {
            entry.buffer = buffer;
          })
          .catch(() => console.warn(`[audio] Could not decode ${name}`));
      }
    } catch {
      // No Web Audio: play the music element directly; effects stay silent.
      this.ctx = null;
      if (this.bgm) this.bgm.volume = this.config.bgmVolume;
    }
  }

  #startMusic() {
    if (!this.bgm || this.muted || document.hidden || !this.unlocked) return;
    if (!this.bgm.paused) return;
    this.bgm
      .play()
      .then(() => {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const gain = this.musicGain.gain;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(this.bgmStarted ? gain.value : 0, now);
        gain.linearRampToValueAtTime(this.config.bgmVolume, now + this.config.bgmFadeInMs / 1000);
        this.bgmStarted = true;
      })
      .catch(() => {
        // Still blocked (not inside a gesture): the next gesture tries again.
      });
  }

  /**
   * Mute or unmute everything, and remember the choice.
   * @param {boolean} muted
   */
  setMuted(muted) {
    if (this.muted === muted) return;
    this.muted = muted;
    this.#saveMuted(muted);
    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(muted ? 0 : 1, now, 0.03);
    } else if (this.bgm) {
      this.bgm.muted = muted;
    }
    if (muted) {
      // Let the fade finish before pausing, unless the player has unmuted again.
      setTimeout(() => {
        if (this.muted) this.bgm?.pause();
      }, 150);
    } else {
      this.unlock();
    }
    for (const listener of this.listeners) listener(muted);
  }

  /** Flip mute. Returns the new state. */
  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Be told whenever mute changes (from any button or key).
   * @param {(muted: boolean) => void} listener
   */
  onMuteChange(listener) {
    this.listeners.add(listener);
  }

  /**
   * Play a sound effect by name (see CONFIG.audio.sfx).
   * @param {string} name
   * @param {{pitch?: number, gain?: number}} [options] pitch 1 = normal; gain scales loudness.
   * @returns {boolean} Whether it played.
   */
  play(name, { pitch = 1, gain = 1 } = {}) {
    const def = this.config.sfx[name];
    if (!def || this.muted || !this.ctx || this.ctx.state !== 'running') return false;

    if (def.file) {
      const buffer = this.files.get(def.file)?.buffer;
      if (!buffer) return false;
      const rate = (def.rate ?? 1) * pitch;
      const offset = Math.min(def.offset ?? 0, buffer.duration);
      const length = Math.min(def.duration ?? buffer.duration, buffer.duration - offset);
      if (!this.gate.tryStart(name, performance.now(), (length / rate) * 1000)) return false;
      const t0 = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = rate;
      const amp = this.ctx.createGain();
      const level = (def.gain ?? 1) * gain;
      const end = t0 + length / rate;
      amp.gain.setValueAtTime(level, t0);
      // A short fade at the cut point so trimming never clicks.
      amp.gain.setValueAtTime(level, Math.max(t0, end - 0.04));
      amp.gain.linearRampToValueAtTime(0, end);
      src.connect(amp).connect(this.sfxBus);
      src.start(t0, offset, length);
      return true;
    }

    const synth = SYNTHS[def.synth];
    if (!synth) return false;
    if (!this.gate.tryStart(name, performance.now(), SYNTH_LENGTH_MS[def.synth] ?? 300)) return false;
    const amp = this.ctx.createGain();
    amp.gain.value = (def.gain ?? 1) * gain;
    amp.connect(this.sfxBus);
    const seconds = synth(this.ctx, amp, this.ctx.currentTime + 0.005, { pitch });
    setTimeout(() => amp.disconnect(), (seconds + 0.3) * 1000);
    return true;
  }

  /** Turn the music down for a moment (under the win fanfare), then back up. */
  duckMusic() {
    if (!this.ctx || !this.bgmStarted) return;
    const { level, ms } = this.config.duck;
    const now = this.ctx.currentTime;
    const gain = this.musicGain.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(this.config.bgmVolume * level, now + 0.12);
    gain.setValueAtTime(this.config.bgmVolume * level, now + ms / 1000);
    gain.linearRampToValueAtTime(this.config.bgmVolume, now + ms / 1000 + 0.8);
  }

  #handleVisibility() {
    if (document.hidden) {
      this.bgm?.pause();
      this.ctx?.suspend().catch(() => {});
    } else if (this.unlocked && !this.muted) {
      this.ctx?.resume().catch(() => {});
      this.#startMusic();
    }
  }

  #loadMuted() {
    try {
      return this.storage?.getItem(MUTE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  #saveMuted(value) {
    try {
      this.storage?.setItem(MUTE_STORAGE_KEY, value ? '1' : '0');
    } catch {
      // Storage is off or full: mute still works for this visit.
    }
  }
}
