import { describe, expect, it } from 'vitest';
import { makeEnemy } from './entities.js';
import { ITEMS } from './items.js';
import { createGame, FIXED_DT, tick, type GameState } from './gameState.js';

const fireRight = { moveX: 0, moveY: 0, aimX: 1, aimY: 0 };

/** Spawns one stationary enemy at an offset from the player. */
const addEnemy = (s: GameState, id: number, dx: number, dy: number, hp = 100) => {
  const e = makeEnemy(id, { x: s.player.pos.x + dx, y: s.player.pos.y + dy }, { hp });
  e.speed = 0;
  s.enemies.push(e);
  return e;
};

describe('multishot', () => {
  it('fires shotCount tears per shot, spread around the aim', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.player.shotCount = 3;
    tick(s, fireRight, FIXED_DT);
    expect(s.projectiles).toHaveLength(3);
    // Spread: the three tears have distinct headings.
    const angles = s.projectiles.map((p) => Math.atan2(p.vel.y, p.vel.x));
    expect(new Set(angles.map((a) => a.toFixed(4))).size).toBe(3);
  });
});

describe('piercing', () => {
  it('passes through and damages two lined-up enemies', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.player.piercing = true;
    s.player.tearRange = 5; // long enough to reach both; we're testing piercing, not range
    const near = addEnemy(s, 1, 1.5, 0);
    const far = addEnemy(s, 2, 3, 0);
    for (let i = 0; i < 40; i++) tick(s, fireRight, FIXED_DT);
    expect(near.hp).toBeLessThan(100);
    expect(far.hp).toBeLessThan(100);
  });

  it('a non-piercing tear is consumed on its first hit (does not reach the one behind)', () => {
    const s = createGame(1, { enemyCount: 0 }); // piercing defaults false
    const near = addEnemy(s, 1, 1.5, 0);
    const far = addEnemy(s, 2, 3, 0);
    for (let i = 0; i < 40; i++) tick(s, fireRight, FIXED_DT);
    expect(near.hp).toBeLessThan(100);
    expect(far.hp).toBe(100); // shielded by the enemy in front
  });

  it('damages each enemy only once even while overlapping for several ticks', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.player.piercing = true;
    const dmg = s.player.tearDamage;
    const e = addEnemy(s, 1, 1.5, 0, 100);
    // Fire exactly one tear, then let it cross fully through the enemy.
    tick(s, fireRight, FIXED_DT);
    for (let i = 0; i < 40; i++) tick(s, { moveX: 0, moveY: 0 }, FIXED_DT);
    // A single hit's worth of damage, not one per overlapping tick.
    expect(100 - e.hp).toBe(dmg);
  });
});

describe('homing', () => {
  it('curves toward an off-axis enemy and hits it', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.player.homing = true;
    s.player.tearRange = 8; // a curving tear travels a longer path; give it room
    const e = addEnemy(s, 1, 3, 3, 100); // down-right; we fire straight right
    for (let i = 0; i < 60 && e.hp === 100; i++) tick(s, fireRight, FIXED_DT);
    expect(e.hp).toBeLessThan(100);
  });
});

describe('tear-mod items', () => {
  it('expose their tear-mod data', () => {
    expect(ITEMS['split-shot']!.tearMods).toEqual({ shotCount: 1 });
    expect(ITEMS['piercing-tears']!.tearMods).toEqual({ piercing: true });
    expect(ITEMS['homing-tears']!.tearMods).toEqual({ homing: true });
  });

  it('is deterministic: same seed + same inputs => same projectiles', () => {
    const run = (): string => {
      const s = createGame(9, { enemyCount: 0 });
      s.player.shotCount = 2;
      s.player.homing = true;
      addEnemy(s, 1, 2, 1);
      for (let i = 0; i < 30; i++) tick(s, fireRight, FIXED_DT);
      return s.projectiles.map((p) => `${p.pos.x.toFixed(3)},${p.pos.y.toFixed(3)}`).join('|');
    };
    expect(run()).toBe(run());
  });
});
