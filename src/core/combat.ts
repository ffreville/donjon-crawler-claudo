import type { Combatant } from './types.js';

/**
 * Pure damage resolution. A hit always deals at least 1 damage so that no
 * combatant is permanently invincible behind high defense.
 *
 * Mutates `defender.hp`. Returns the damage actually dealt.
 */
export function resolveAttack(attacker: Combatant, defender: Combatant): number {
  const dmg = Math.max(1, attacker.attack - defender.defense);
  defender.hp = Math.max(0, defender.hp - dmg);
  return dmg;
}

export function isDead(c: Combatant): boolean {
  return c.hp <= 0;
}

export function heal(c: Combatant, amount: number): void {
  c.hp = Math.min(c.maxHp, c.hp + Math.max(0, amount));
}
