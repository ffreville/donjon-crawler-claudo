import { describe, expect, it } from 'vitest';
import { heal, isDead, resolveAttack } from './combat.js';
import type { Combatant } from './types.js';

const mk = (over: Partial<Combatant> = {}): Combatant => ({
  hp: 10,
  maxHp: 10,
  attack: 3,
  defense: 1,
  ...over,
});

describe('combat', () => {
  it('deals attack minus defense', () => {
    const atk = mk({ attack: 5 });
    const def = mk({ defense: 2, hp: 10 });
    const dmg = resolveAttack(atk, def);
    expect(dmg).toBe(3);
    expect(def.hp).toBe(7);
  });

  it('always deals at least 1 damage', () => {
    const atk = mk({ attack: 1 });
    const def = mk({ defense: 99, hp: 10 });
    expect(resolveAttack(atk, def)).toBe(1);
    expect(def.hp).toBe(9);
  });

  it('never drops hp below zero', () => {
    const def = mk({ hp: 2 });
    resolveAttack(mk({ attack: 100 }), def);
    expect(def.hp).toBe(0);
    expect(isDead(def)).toBe(true);
  });

  it('heal is capped at maxHp', () => {
    const c = mk({ hp: 8, maxHp: 10 });
    heal(c, 5);
    expect(c.hp).toBe(10);
  });
});
