import { describe, expect, it } from 'vitest';
import { makeEnemy } from './entities.js';
import { ITEMS } from './items.js';
import {
  BURN_SLOW_SYNERGY,
  createGame,
  enterRoom,
  FIXED_DT,
  NO_INPUT,
  tick,
  type GameState,
} from './gameState.js';
import { applyStatuses, hasStatus, slowFactor } from './status.js';

const firstNormalId = (s: GameState): number => {
  const r = [...s.dungeon.rooms.values()].find((room) => room.type === 'normal');
  if (!r) throw new Error('no normal room');
  return r.id;
};

describe('status helpers', () => {
  it('applies and refreshes statuses without unbounded stacking', () => {
    const e = makeEnemy(1, { x: 0, y: 0 });
    applyStatuses(e, [{ kind: 'burn', duration: 2, magnitude: 2 }]);
    applyStatuses(e, [{ kind: 'burn', duration: 1, magnitude: 3 }]);
    const burns = e.effects.filter((x) => x.kind === 'burn');
    expect(burns).toHaveLength(1); // refreshed, not duplicated
    expect(burns[0]!.remaining).toBe(2); // max remaining
    expect(burns[0]!.magnitude).toBe(3); // stronger magnitude
  });

  it('slowFactor takes the strongest slow', () => {
    const e = makeEnemy(1, { x: 0, y: 0 });
    expect(slowFactor(e)).toBe(1);
    applyStatuses(e, [{ kind: 'slow', duration: 2, magnitude: 0.6 }]);
    applyStatuses(e, [{ kind: 'slow', duration: 2, magnitude: 0.4 }]);
    expect(slowFactor(e)).toBe(0.4);
  });
});

describe('burn', () => {
  it('deals damage over time and expires', () => {
    const s = createGame(1, { enemyCount: 0 });
    const e = makeEnemy(99, { x: 12, y: 4.5 }, { kind: 'chaser', hp: 100 });
    e.speed = 0; // hold still
    applyStatuses(e, [{ kind: 'burn', duration: 1, magnitude: 5 }]);
    s.enemies.push(e);
    for (let i = 0; i < 90; i++) tick(s, NO_INPUT, FIXED_DT); // 1.5s
    expect(e.hp).toBeCloseTo(95, 0); // ~5 total burn damage over 1s
    expect(hasStatus(e, 'burn')).toBe(false); // expired
  });

  it('burns harder on a slowed enemy (synergy)', () => {
    const burnOnly = makeEnemy(1, { x: 0, y: 0 }, { hp: 100 });
    burnOnly.speed = 0;
    const burnAndSlow = makeEnemy(2, { x: 0, y: 0 }, { hp: 100 });
    burnAndSlow.speed = 0;

    const sA = createGame(1, { enemyCount: 0 });
    sA.enemies.push(burnOnly);
    applyStatuses(burnOnly, [{ kind: 'burn', duration: 5, magnitude: 4 }]);

    const sB = createGame(1, { enemyCount: 0 });
    sB.enemies.push(burnAndSlow);
    applyStatuses(burnAndSlow, [
      { kind: 'burn', duration: 5, magnitude: 4 },
      { kind: 'slow', duration: 5, magnitude: 0.5 },
    ]);

    for (let i = 0; i < 60; i++) {
      tick(sA, NO_INPUT, FIXED_DT);
      tick(sB, NO_INPUT, FIXED_DT);
    }
    const dmgBurn = 100 - burnOnly.hp;
    const dmgSynergy = 100 - burnAndSlow.hp;
    expect(dmgSynergy).toBeCloseTo(dmgBurn * BURN_SLOW_SYNERGY, 1);
  });
});

describe('slow', () => {
  it('reduces how far an enemy travels', () => {
    const make = (slow: boolean): number => {
      const s = createGame(1, { enemyCount: 0 });
      const e = makeEnemy(9, { x: 12, y: 4.5 }, { kind: 'chaser' });
      if (slow) applyStatuses(e, [{ kind: 'slow', duration: 5, magnitude: 0.5 }]);
      s.enemies.push(e);
      const x0 = e.pos.x;
      for (let i = 0; i < 30; i++) tick(s, NO_INPUT, FIXED_DT);
      return x0 - e.pos.x; // distance moved toward the player (at x=7.5)
    };
    expect(make(true)).toBeLessThan(make(false));
  });
});

describe('tear effects from items', () => {
  it('fire-tears makes the player tears apply burn on hit', () => {
    const s = createGame(1, { enemyCount: 0 });
    // Pick up fire-tears.
    s.player.tearEffects.push(ITEMS['fire-tears']!.tearEffect!);
    const e = makeEnemy(99, { x: s.player.pos.x + 2, y: s.player.pos.y }, { hp: 100 });
    e.speed = 0;
    s.enemies.push(e);
    // Fire to the right until the enemy is hit and burning.
    for (let i = 0; i < 60 && !hasStatus(e, 'burn'); i++) {
      tick(s, { moveX: 0, moveY: 0, aimX: 1, aimY: 0 }, FIXED_DT);
    }
    expect(hasStatus(e, 'burn')).toBe(true);
  });
});

describe('determinism', () => {
  it('status outcomes are reproducible for a given seed', () => {
    const run = (): number => {
      const s = createGame(7);
      s.player.tearEffects.push({ kind: 'burn', duration: 2, magnitude: 2 });
      enterRoom(s, firstNormalId(s));
      for (let i = 0; i < 120; i++) tick(s, { moveX: 0, moveY: 0, aimX: 1, aimY: 0 }, FIXED_DT);
      return s.enemies.reduce((acc, e) => acc + e.hp, 0);
    };
    expect(run()).toBe(run());
  });
});
