import type { StatusEffect, StatusKind, StatusSpec } from './entities.js';

/** A target that can carry status effects. */
export interface StatusTarget {
  effects: StatusEffect[];
}

export function hasStatus(target: StatusTarget, kind: StatusKind): boolean {
  return target.effects.some((e) => e.kind === kind);
}

/**
 * Applies status specs to a target. Re-applying a kind refreshes it to the
 * longer remaining time and the stronger magnitude (no unbounded stacking).
 * For 'slow', "stronger" means a smaller multiplier (slows more).
 */
export function applyStatuses(target: StatusTarget, specs: readonly StatusSpec[]): void {
  for (const spec of specs) {
    const existing = target.effects.find((e) => e.kind === spec.kind);
    if (!existing) {
      target.effects.push({ kind: spec.kind, remaining: spec.duration, magnitude: spec.magnitude });
      continue;
    }
    existing.remaining = Math.max(existing.remaining, spec.duration);
    existing.magnitude =
      spec.kind === 'slow'
        ? Math.min(existing.magnitude, spec.magnitude)
        : Math.max(existing.magnitude, spec.magnitude);
  }
}

/** Combined speed multiplier from active slow effects (1 = no slow).
 * Invariant: slow magnitude is expected in (0, 1) — a smaller value slows more. */
export function slowFactor(target: StatusTarget): number {
  let factor = 1;
  for (const e of target.effects) {
    if (e.kind === 'slow') factor = Math.min(factor, e.magnitude);
  }
  return factor;
}
