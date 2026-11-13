import { describe, it, expect } from 'vitest';
import { SfxGate } from '../../../src/audio/sfxGate.js';

// Fixtures
const MIN_INTERVAL = 40;
const MAX_VOICES = 2;
const LENGTH = 300;

describe('SfxGate', () => {
  it('lets a sound play the first time', () => {
    const gate = new SfxGate({ minIntervalMs: MIN_INTERVAL, maxVoices: MAX_VOICES });

    expect(gate.tryStart('click', 0, LENGTH)).toBe(true);
  });

  it('blocks the same sound from restarting too soon', () => {
    const gate = new SfxGate({ minIntervalMs: MIN_INTERVAL, maxVoices: MAX_VOICES });
    gate.tryStart('click', 0, 10);

    expect(gate.tryStart('click', MIN_INTERVAL - 1, 10)).toBe(false);
    expect(gate.tryStart('click', MIN_INTERVAL, 10)).toBe(true);
  });

  it('lets different sounds start together', () => {
    const gate = new SfxGate({ minIntervalMs: MIN_INTERVAL, maxVoices: MAX_VOICES });
    gate.tryStart('click', 0, LENGTH);

    expect(gate.tryStart('merge', 0, LENGTH)).toBe(true);
  });

  it('refuses a new sound while the voice limit is reached, and allows it once one ends', () => {
    const gate = new SfxGate({ minIntervalMs: MIN_INTERVAL, maxVoices: MAX_VOICES });
    gate.tryStart('a', 0, LENGTH);
    gate.tryStart('b', 0, LENGTH);

    expect(gate.tryStart('c', 100, LENGTH)).toBe(false);
    expect(gate.tryStart('c', LENGTH, LENGTH)).toBe(true);
  });

  it('counts only the sounds still playing', () => {
    const gate = new SfxGate({ minIntervalMs: MIN_INTERVAL, maxVoices: MAX_VOICES });
    gate.tryStart('a', 0, LENGTH);

    expect(gate.activeVoices(LENGTH - 1)).toBe(1);
    expect(gate.activeVoices(LENGTH)).toBe(0);
  });
});
