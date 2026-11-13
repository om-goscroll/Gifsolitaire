/**
 * Keeps sound effects clean: the same sound cannot restart within a few
 * milliseconds of itself (no machine-gun stacking when many things happen at
 * once), and only so many sounds may play together. Pure logic, no audio.
 *
 * @example
 * const gate = new SfxGate({ minIntervalMs: 40, maxVoices: 8 });
 * if (gate.tryStart('merge', performance.now(), 400)) playMergeSound();
 */
export class SfxGate {
  /**
   * @param {{minIntervalMs?: number, maxVoices?: number}} [options]
   */
  constructor({ minIntervalMs = 40, maxVoices = 8 } = {}) {
    this.minIntervalMs = minIntervalMs;
    this.maxVoices = maxVoices;
    /** When each sound last started, by name. */
    this.lastStart = new Map();
    /** When each playing sound will end. */
    this.voiceEnds = [];
  }

  /** How many sounds are still playing at this time. */
  activeVoices(nowMs) {
    this.voiceEnds = this.voiceEnds.filter((end) => end > nowMs);
    return this.voiceEnds.length;
  }

  /**
   * Ask to start a sound. When allowed, the sound is recorded as playing.
   * @param {string} name Which sound.
   * @param {number} nowMs The current time.
   * @param {number} durationMs How long the sound lasts.
   * @returns {boolean} Whether the sound may play.
   */
  tryStart(name, nowMs, durationMs) {
    const last = this.lastStart.get(name);
    if (last !== undefined && nowMs - last < this.minIntervalMs) return false;
    if (this.activeVoices(nowMs) >= this.maxVoices) return false;
    this.lastStart.set(name, nowMs);
    this.voiceEnds.push(nowMs + Math.max(0, durationMs));
    return true;
  }
}
