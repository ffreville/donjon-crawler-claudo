/**
 * Tiny procedural sound effects — no audio assets are shipped. The shoot cue is
 * a soft, wet "ploop" in the spirit of The Binding of Isaac's tear sound: a
 * short triangle blip with a fast downward pitch glide, low-passed and quickly
 * enveloped, synthesised live via the Web Audio API. It is an approximation of
 * that feel, not the original (copyrighted) asset.
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

/** A short blip: a triangle tone gliding between two pitches, softly enveloped. */
function blip(from: number, to: number, peak: number, dur: number): void {
  const ac = audioContext();
  if (!ac) return;
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(from, now);
  osc.frequency.exponentialRampToValueAtTime(to, now + dur * 0.8);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

/** Bright two-note "ching" when grabbing a coin. */
export function playCoin(): void {
  blip(880, 1320, 0.16, 0.09); // up-chirp, like a coin pickup
}

/** A short metallic "clink" when grabbing a key. */
export function playKey(): void {
  blip(560, 760, 0.15, 0.12);
}

/** A short tear "ploop", with a touch of pitch variation per shot. */
export function playShoot(): void {
  const ac = audioContext();
  if (!ac) return;
  const now = ac.currentTime;

  const osc = ac.createOscillator();
  osc.type = 'triangle';
  const base = 620 * (0.94 + Math.random() * 0.12); // slight per-shot wobble
  osc.frequency.setValueAtTime(base, now);
  osc.frequency.exponentialRampToValueAtTime(base * 0.45, now + 0.08); // downward glide

  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(1800, now);
  lp.frequency.exponentialRampToValueAtTime(700, now + 0.09);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.008); // quick soft attack
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11); // short decay

  osc.connect(lp).connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}
