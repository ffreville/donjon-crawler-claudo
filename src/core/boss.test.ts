import { describe, expect, it } from 'vitest';
import { createGame, enterRoom, FIXED_DT, NO_INPUT, tick, type GameState } from './gameState.js';

const enterBoss = (seed: number): GameState => {
  const s = createGame(seed);
  enterRoom(s, s.dungeon.bossRoom);
  return s;
};

/** Forces a phase and fires exactly one boss attack, returning the projectiles spawned. */
const oneAttackAt = (hpRatio: number): number => {
  const s = enterBoss(1);
  const boss = s.enemies[0]!;
  boss.hp = Math.round(boss.maxHp * hpRatio);
  s.projectiles.length = 0;
  boss.fireCooldown = 0;
  s.graceTimer = 0; // skip the entry grace so the boss acts this tick
  tick(s, NO_INPUT, FIXED_DT);
  return s.projectiles.length;
};

describe('boss', () => {
  it('spawns a single boss-kind enemy in the boss room', () => {
    const s = enterBoss(1);
    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0]!.kind).toBe('boss');
    expect(s.doorsOpen).toBe(false);
  });

  it('fires enemy projectiles in escalating patterns by phase', () => {
    expect(oneAttackAt(1.0)).toBe(8); // phase 1: 8-way radial
    expect(oneAttackAt(0.5)).toBe(5); // phase 2: aimed 5-spread
    expect(oneAttackAt(0.2)).toBe(12); // phase 3: 12-way radial
  });

  it('its projectiles are enemy-sourced and can damage the player', () => {
    const s = enterBoss(1);
    const boss = s.enemies[0]!;
    boss.speed = 0; // hold still so contact damage doesn't confound the test
    // Stand a few tiles below the boss — out of contact range, in the radial's path.
    s.player.pos = { x: boss.pos.x, y: boss.pos.y + 3 };
    const hp0 = s.player.hp;
    let sawBossShot = false;
    for (let i = 0; i < 400; i++) {
      tick(s, NO_INPUT, FIXED_DT);
      if (s.projectiles.some((p) => p.source === 'enemy')) sawBossShot = true;
      if (s.player.hp < hp0) break;
    }
    expect(sawBossShot).toBe(true);
    expect(s.player.hp).toBeLessThan(hp0);
  });

  it('defeating the boss drops the teleporter', () => {
    const s = enterBoss(1);
    s.enemies.length = 0;
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.bossDefeated).toBe(true);
    expect(s.doorsOpen).toBe(true);
  });

  it('is deterministic for a given seed', () => {
    const run = (): string => {
      const s = enterBoss(3);
      for (let i = 0; i < 120; i++) tick(s, NO_INPUT, FIXED_DT);
      return `${s.projectiles.length}:${s.enemies[0]?.hp ?? 'dead'}`;
    };
    expect(run()).toBe(run());
  });
});
