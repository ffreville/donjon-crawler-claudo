/**
 * Procedural sound effects — no audio assets shipped. Everything is synthesised
 * live via the Web Audio API in a retro/arcade style. One-shot cues (shoot, hurt,
 * pickups, doors, boss, UI, win/lose) plus a small enemy-ambience controller
 * (a continuous fly buzz and periodic zombie groans). Designed to be swappable
 * for real samples later without changing the call sites.
 */

let ctx: AudioContext | null = null;

/** Lazily creates the shared AudioContext and resumes it (browsers start it suspended). */
function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

let masterGain: GainNode | null = null;
let sfxVolume = 0.8;
/** Shared output bus for all SFX, so a single gain scales their volume. */
function master(ac: AudioContext): GainNode {
  if (!masterGain) {
    masterGain = ac.createGain();
    masterGain.gain.value = sfxVolume;
    masterGain.connect(ac.destination);
  }
  return masterGain;
}
/** Sets the master SFX volume (0..1), applied live. */
export function setSfxVolume(v: number): void {
  sfxVolume = Math.max(0, Math.min(1, v));
  const ac = audioContext();
  if (ac) master(ac).gain.setTargetAtTime(sfxVolume, ac.currentTime, 0.02);
}

type Wave = OscillatorType;

/** A tone gliding from→to (Hz) with a quick attack and exponential decay. */
function tone(from: number, to: number, peak: number, dur: number, type: Wave = 'triangle'): void {
  const ac = audioContext();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + dur * 0.85);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(gain).connect(master(ac));
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

/** Plays the notes (Hz) in sequence, each a short blip — for jingles. */
function arp(notes: number[], step: number, peak: number, type: Wave = 'square'): void {
  notes.forEach((f, i) => setTimeout(() => tone(f, f, peak, step * 1.4, type), i * step * 1000));
}

let noiseBuf: AudioBuffer | null = null;
function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** A burst of low-passed noise (impacts, whooshes, squishes). */
function noise(dur: number, lpFrom: number, lpTo: number, peak: number): void {
  const ac = audioContext();
  if (!ac) return;
  const now = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(lpFrom, now);
  lp.frequency.exponentialRampToValueAtTime(Math.max(60, lpTo), now + dur);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(peak, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(lp).connect(gain).connect(master(ac));
  src.start(now);
  src.stop(now + dur + 0.02);
}

// ── One-shot cues ────────────────────────────────────────────────────────────

/** A short tear "ploop", with a touch of pitch variation per shot. */
export function playShoot(): void {
  tone(620 * (0.94 + Math.random() * 0.12), 280, 0.16, 0.11);
}
export function playCoin(): void {
  tone(880, 1320, 0.16, 0.09);
}
export function playKey(): void {
  tone(560, 760, 0.15, 0.12);
}
/** Player gets hit: a low thud + noise. */
export function playHurt(): void {
  tone(220, 80, 0.22, 0.18, 'square');
  noise(0.16, 900, 200, 0.18);
}
/** A small tick when a tear connects (throttled by the caller). */
export function playEnemyHit(): void {
  tone(300, 220, 0.07, 0.05, 'square');
}
/** An enemy dies: a squishy noise burst + low drop. */
export function playEnemyDeath(): void {
  noise(0.22, 1400, 250, 0.16);
  tone(260, 90, 0.12, 0.18, 'sawtooth');
}
/** Picking up an item: a bright rising arpeggio. */
export function playPickup(): void {
  arp([660, 880, 1170], 0.07, 0.16, 'square');
}
/** Healing / heart pickup: a warm rising pair. */
export function playHeart(): void {
  arp([520, 780], 0.08, 0.14, 'sine');
}
/** Room transition through a door. */
export function playDoor(): void {
  noise(0.2, 500, 1200, 0.12);
}
/** Spending a key to open a locked door. */
export function playUnlock(): void {
  tone(420, 300, 0.16, 0.07, 'square');
  setTimeout(() => tone(300, 520, 0.16, 0.09, 'square'), 70);
}
/** Using an active item: a little magical shimmer. */
export function playUseItem(): void {
  arp([700, 1050, 1400], 0.06, 0.14, 'triangle');
}
/** Throwing / swinging the knife: a quick swoosh. */
export function playKnife(): void {
  noise(0.16, 2200, 700, 0.14);
}
/** A ram boss launches its dash: a heavy low whoosh. */
export function playBossDash(): void {
  noise(0.3, 1200, 120, 0.22);
  tone(180, 60, 0.18, 0.3, 'sawtooth');
}
/** An achievement unlocks: a pleasant 3-note jingle. */
export function playAchievement(): void {
  arp([784, 988, 1319], 0.1, 0.16, 'triangle');
}
/** Victory jingle. */
export function playWin(): void {
  arp([523, 659, 784, 1047], 0.12, 0.18, 'square');
}
/** Game-over: a descending sad motif. */
export function playGameOver(): void {
  arp([392, 330, 262, 196], 0.16, 0.18, 'sawtooth');
}
/** A tiny UI click for menu buttons. */
export function playClick(): void {
  tone(420, 520, 0.1, 0.04, 'square');
}

// ── Enemy ambience (continuous) ───────────────────────────────────────────────

let buzzOsc: OscillatorNode | null = null;
let buzzGain: GainNode | null = null;
let groanTimer = 0; // seconds until the next groan

/** Ensures the sustained fly-buzz nodes exist and are running. */
function ensureBuzz(ac: AudioContext): void {
  if (buzzOsc) return;
  buzzOsc = ac.createOscillator();
  buzzOsc.type = 'sawtooth';
  buzzOsc.frequency.value = 150;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  buzzGain = ac.createGain();
  buzzGain.gain.value = 0;
  // A slow LFO wobbles the pitch for a "buzz" character.
  const lfo = ac.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 28;
  const lfoGain = ac.createGain();
  lfoGain.gain.value = 22;
  lfo.connect(lfoGain).connect(buzzOsc.frequency);
  buzzOsc.connect(lp).connect(buzzGain).connect(master(ac));
  buzzOsc.start();
  lfo.start();
}

/**
 * Updates the enemy ambience each frame: a fly buzz whose volume tracks the fly
 * count, and periodic groans while melee/undead enemies are around.
 * @param flies number of fly-type enemies alive
 * @param melee number of melee/undead enemies alive
 * @param dtMs frame delta in ms
 * @param enabled whether SFX are on (silences/holds when off)
 */
export function updateEnemyAmbience(flies: number, melee: number, dtMs: number, enabled: boolean): void {
  const ac = audioContext();
  if (!ac) return;
  ensureBuzz(ac);
  const target = enabled ? Math.min(0.1, flies * 0.045) : 0;
  buzzGain?.gain.setTargetAtTime(target, ac.currentTime, 0.12);

  if (!enabled || melee <= 0) {
    groanTimer = 1.2; // re-arm so a groan doesn't fire the instant they appear
    return;
  }
  groanTimer -= dtMs / 1000;
  if (groanTimer <= 0) {
    groan();
    groanTimer = 2.2 + Math.random() * 3; // next groan in 2.2–5.2s
  }
}

/** A short, wobbling low groan (zombie-ish). */
function groan(): void {
  const ac = audioContext();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'sawtooth';
  const base = 80 + Math.random() * 30;
  osc.frequency.setValueAtTime(base, now);
  osc.frequency.linearRampToValueAtTime(base * 0.7, now + 0.25);
  osc.frequency.linearRampToValueAtTime(base * 0.95, now + 0.55);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 500;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  osc.connect(lp).connect(gain).connect(master(ac));
  osc.start(now);
  osc.stop(now + 0.62);
}

/** Silences the buzz (e.g. when leaving the game scene). */
export function stopEnemyAmbience(): void {
  const ac = audioContext();
  if (ac && buzzGain) buzzGain.gain.setTargetAtTime(0, ac.currentTime, 0.05);
}
