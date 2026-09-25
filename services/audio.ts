// Procedural sound effects built on a single shared AudioContext.
// Browsers cap the number of live contexts, so never create one per sound.

const MUTE_KEY = 'aeroguard.muted';
const MASTER_VOLUME = 0.55;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

let muted = (() => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
})();

export const isMuted = () => muted;

export const setMuted = (value: boolean) => {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // Storage unavailable (private mode etc.); the setting just won't persist.
  }
  if (ctx && master) master.gain.setTargetAtTime(value ? 0 : MASTER_VOLUME, ctx.currentTime, 0.02);
};

/** Create or resume the context. Call from a user gesture so autoplay policies allow it. */
export const initAudio = () => {
  try {
    if (!ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
};

const ready = () => (ctx && master && !muted ? { ctx, out: master } : null);

const noiseBuffer = (c: AudioContext) => {
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
};

const tone = (c: AudioContext, out: AudioNode, type: OscillatorType, from: number, to: number, start: number, dur: number, vol: number) => {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.05);
};

const burst = (c: AudioContext, out: AudioNode, filterType: BiquadFilterType, fromHz: number, toHz: number, start: number, dur: number, vol: number) => {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const filter = c.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(fromHz, start);
  filter.frequency.exponentialRampToValueAtTime(toHz, start + dur);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(gain).connect(out);
  src.start(start);
  src.stop(start + dur + 0.05);
};

const play = (fn: (c: AudioContext, out: AudioNode, t: number) => void) => {
  const a = ready();
  if (!a) return;
  try {
    fn(a.ctx, a.out, a.ctx.currentTime);
  } catch {
    // Audio is decoration; never let it break the simulation.
  }
};

export const sfx = {
  launch: () =>
    play((c, out, t) => {
      tone(c, out, 'square', 1320, 1320, t, 0.07, 0.08);
      tone(c, out, 'square', 1760, 1760, t + 0.1, 0.07, 0.08);
      burst(c, out, 'bandpass', 500, 2400, t + 0.15, 0.35, 0.5);
      burst(c, out, 'lowpass', 1800, 200, t + 0.35, 1.8, 0.35);
      tone(c, out, 'sawtooth', 70, 40, t + 0.15, 1.2, 0.12);
    }),
  explosion: (size = 1) =>
    play((c, out, t) => {
      burst(c, out, 'lowpass', 2400 * size, 60, t, 1.6 + size, 0.9 * size);
      tone(c, out, 'sine', 140, 32, t, 0.6 + size * 0.3, 0.7 * size);
    }),
  fail: () =>
    play((c, out, t) => {
      tone(c, out, 'triangle', 520, 500, t, 0.16, 0.12);
      tone(c, out, 'triangle', 390, 260, t + 0.2, 0.35, 0.12);
    }),
  click: () =>
    play((c, out, t) => {
      tone(c, out, 'sine', 1800, 1200, t, 0.04, 0.04);
    }),
};
