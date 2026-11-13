/**
 * Small generated sound effects for moments that have no recorded sound file:
 * drops, mistakes, merges, the win fanfare, hints and UI clicks. Each synth
 * plays into a destination node at a start time and returns its length in
 * seconds. Generated in the browser with the Web Audio API; no files needed.
 *
 * @example SYNTHS.merge(ctx, sfxBus, ctx.currentTime, { pitch: 1.12 });
 */

/** One enveloped oscillator note. */
function tone(ctx, dest, t0, { type = 'sine', freq, freqEnd = freq, peak = 0.3, attack = 0.005, decay = 0.2, detune = 0 }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.detune.value = detune;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + attack + decay);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  osc.connect(gain).connect(dest);
  osc.start(t0);
  osc.stop(t0 + attack + decay + 0.02);
  return attack + decay;
}

const noiseBuffers = new WeakMap();
/** A short burst of white noise, made once per audio context. */
function noiseBuffer(ctx) {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/** Filtered noise with an envelope. */
function noise(ctx, dest, t0, { duration = 0.05, peak = 0.2, filter = 'bandpass', freq = 2000, freqEnd = freq, q = 1 }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const bq = ctx.createBiquadFilter();
  bq.type = filter;
  bq.Q.value = q;
  bq.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== freq) bq.frequency.exponentialRampToValueAtTime(freqEnd, t0 + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.01, duration / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(bq).connect(gain).connect(dest);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
  return duration;
}

/** Note frequency for a number of semitones above A4 (440 Hz). */
const note = (semitones) => 440 * Math.pow(2, semitones / 12);

/** Every generated sound, by name. */
export const SYNTHS = {
  /** A soft wooden thunk: a tile settling into its slot. */
  drop(ctx, dest, t0, { pitch = 1 } = {}) {
    tone(ctx, dest, t0, { freq: 210 * pitch, freqEnd: 95 * pitch, peak: 0.55, attack: 0.004, decay: 0.13 });
    noise(ctx, dest, t0, { duration: 0.035, peak: 0.18, filter: 'lowpass', freq: 1800 });
    return 0.15;
  },

  /** Two falling notes: that drop did not count. */
  invalid(ctx, dest, t0) {
    tone(ctx, dest, t0, { type: 'triangle', freq: 330, freqEnd: 290, peak: 0.35, decay: 0.09 });
    tone(ctx, dest, t0 + 0.09, { type: 'triangle', freq: 247, freqEnd: 196, peak: 0.35, decay: 0.14 });
    return 0.25;
  },

  /** A bright two-note chime: pieces locked together. Pitch rises with each merge. */
  merge(ctx, dest, t0, { pitch = 1 } = {}) {
    const root = note(7) * pitch; // E5
    tone(ctx, dest, t0, { freq: root, peak: 0.35, decay: 0.35 });
    tone(ctx, dest, t0, { type: 'triangle', freq: root * 2, peak: 0.08, decay: 0.2 });
    tone(ctx, dest, t0 + 0.07, { freq: root * 1.5, peak: 0.3, decay: 0.45 });
    tone(ctx, dest, t0 + 0.07, { type: 'triangle', freq: root * 3, peak: 0.05, decay: 0.25, detune: 6 });
    noise(ctx, dest, t0 + 0.02, { duration: 0.18, peak: 0.04, filter: 'highpass', freq: 6000 });
    return 0.55;
  },

  /** A rising arpeggio and a held chord with sparkles: the puzzle is solved. */
  win(ctx, dest, t0) {
    const steps = [3, 7, 10, 15]; // C5 E5 G5 C6
    steps.forEach((step, i) => {
      const t = t0 + i * 0.09;
      tone(ctx, dest, t, { type: 'triangle', freq: note(step), peak: 0.32, decay: 0.32 });
      tone(ctx, dest, t, { freq: note(step + 12), peak: 0.08, decay: 0.2 });
    });
    const chordAt = t0 + steps.length * 0.09;
    for (const step of [3, 7, 10, 15]) {
      tone(ctx, dest, chordAt, { type: 'triangle', freq: note(step), peak: 0.16, attack: 0.02, decay: 1.1, detune: 4 });
      tone(ctx, dest, chordAt, { freq: note(step), peak: 0.12, attack: 0.02, decay: 1.2, detune: -4 });
    }
    for (let i = 0; i < 7; i++) {
      const t = chordAt + 0.05 + i * 0.08 + Math.random() * 0.03;
      tone(ctx, dest, t, { freq: note(27 + Math.floor(Math.random() * 10)), peak: 0.06, decay: 0.16 });
    }
    return chordAt - t0 + 1.25;
  },

  /** A light "ding-ding" pointing something out. */
  hint(ctx, dest, t0) {
    tone(ctx, dest, t0, { freq: note(15), freqEnd: note(17), peak: 0.28, decay: 0.18 });
    tone(ctx, dest, t0 + 0.11, { freq: note(22), freqEnd: note(24), peak: 0.24, decay: 0.3 });
    tone(ctx, dest, t0 + 0.11, { type: 'triangle', freq: note(34), peak: 0.04, decay: 0.2 });
    return 0.45;
  },

  /** A short soft tick for buttons. */
  click(ctx, dest, t0) {
    tone(ctx, dest, t0, { freq: 1100, freqEnd: 720, peak: 0.4, attack: 0.002, decay: 0.05 });
    return 0.06;
  },

  /** A muffled double buzz: that level is still locked. */
  locked(ctx, dest, t0) {
    const out = ctx.createBiquadFilter();
    out.type = 'lowpass';
    out.frequency.value = 900;
    out.connect(dest);
    tone(ctx, out, t0, { type: 'square', freq: 150, peak: 0.3, decay: 0.07 });
    tone(ctx, out, t0 + 0.1, { type: 'square', freq: 130, peak: 0.3, decay: 0.09 });
    return 0.21;
  },

  /** An airy sweep for a banner sliding in. */
  whoosh(ctx, dest, t0) {
    noise(ctx, dest, t0, { duration: 0.32, peak: 0.35, filter: 'bandpass', freq: 500, freqEnd: 2600, q: 0.8 });
    return 0.33;
  },
};
