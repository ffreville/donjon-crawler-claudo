import { describe, expect, it } from 'vitest';
import {
  createGame,
  descendToNextFloor,
  enterRoom,
  FIXED_DT,
  NO_INPUT,
  RAM_CHARGE_TIME,
  tick,
  type GameState,
} from './gameState.js';
import { ROOM_H, ROOM_W } from './room.js';

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

  it('defeating the boss drops the teleporter and a reward item', () => {
    const s = enterBoss(1);
    s.enemies.length = 0;
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.bossDefeated).toBe(true);
    expect(s.doorsOpen).toBe(true);
    // Floor 1: the bag still has items, so the boss drops a free item.
    const drop = s.pickups.find((p) => p.kind === 'item');
    expect(drop).toBeDefined();
    expect(drop!.kind === 'item' ? drop!.cost : -1).toBe(0); // free
  });

  it('a mini-boss does NOT drop an item on death', () => {
    const s = createGame(1);
    const mini = [...s.dungeon.rooms.values()].find((r) => r.type === 'miniboss')!;
    enterRoom(s, mini.id);
    s.enemies.length = 0;
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.pickups.some((p) => p.kind === 'item')).toBe(false);
  });

  it('a mini-boss room spawns a single, weaker boss-pattern enemy', () => {
    const s = createGame(1);
    const mini = [...s.dungeon.rooms.values()].find((r) => r.type === 'miniboss');
    expect(mini).toBeDefined();
    enterRoom(s, mini!.id);
    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0]!.kind).toBe('boss'); // reuses the boss attack patterns
    expect(s.doorsOpen).toBe(false);

    const floorBoss = enterBoss(1).enemies[0]!;
    expect(s.enemies[0]!.maxHp).toBeLessThan(floorBoss.maxHp);
  });

  it('has three attack-pattern variants with distinct openers', () => {
    const opener = (variant: number): number => {
      const s = enterBoss(1);
      const boss = s.enemies[0]!;
      boss.bossVariant = variant;
      boss.hp = boss.maxHp; // phase 1
      s.projectiles.length = 0;
      boss.fireCooldown = 0;
      s.graceTimer = 0;
      tick(s, NO_INPUT, FIXED_DT);
      return s.projectiles.length;
    };
    expect(opener(0)).toBe(8); // bombardier: 8-way radial
    expect(opener(1)).toBe(3); // spiral: 3 arms
    expect(opener(2)).toBe(3); // barrage: aimed 3-spread
    // ...and they diverge in the final phase.
    const low = (variant: number): number => {
      const s = enterBoss(1);
      const boss = s.enemies[0]!;
      boss.bossVariant = variant;
      boss.hp = Math.round(boss.maxHp * 0.2);
      s.projectiles.length = 0;
      boss.fireCooldown = 0;
      s.graceTimer = 0;
      tick(s, NO_INPUT, FIXED_DT);
      return s.projectiles.length;
    };
    expect(new Set([low(0), low(1), low(2)]).size).toBe(3); // 12 / 5 / 17
  });

  describe('ram boss (variant 3)', () => {
    /** A boss room with the boss forced to the ram variant, centered, charging. */
    const ramBoss = (seed: number): GameState => {
      const s = enterBoss(seed);
      const boss = s.enemies[0]!;
      boss.bossVariant = 3;
      boss.aiTimer = 0;
      boss.dashSpeed = 0;
      boss.pos = { x: ROOM_W / 2, y: ROOM_H / 2 };
      s.graceTimer = 0;
      s.projectiles.length = 0;
      return s;
    };

    it('charges then dashes, and never fires a projectile', () => {
      const s = ramBoss(1);
      const boss = s.enemies[0]!;
      const start = { x: boss.pos.x, y: boss.pos.y };
      for (let i = 0; i < Math.ceil(RAM_CHARGE_TIME * 60) + 30; i++) tick(s, NO_INPUT, FIXED_DT);
      expect(s.projectiles).toHaveLength(0);
      expect(Math.hypot(boss.pos.x - start.x, boss.pos.y - start.y)).toBeGreaterThan(1);
    });

    it('locks its dash direction toward the player', () => {
      const s = ramBoss(1);
      const boss = s.enemies[0]!;
      s.player.pos = { x: boss.pos.x + 5, y: boss.pos.y }; // player to the right
      let guard = 0;
      while (boss.dashSpeed === 0 && guard < 300) {
        tick(s, NO_INPUT, FIXED_DT);
        guard++;
      }
      expect(boss.dashSpeed).toBeGreaterThan(0);
      expect(boss.aiDir.x).toBeGreaterThan(0.5); // aimed at the player's side
    });

    it('decelerates and stays inside the room', () => {
      const s = ramBoss(1);
      const boss = s.enemies[0]!;
      for (let i = 0; i < 600; i++) {
        tick(s, NO_INPUT, FIXED_DT);
        expect(boss.pos.x).toBeGreaterThan(0.5);
        expect(boss.pos.x).toBeLessThan(ROOM_W - 0.5);
        expect(boss.pos.y).toBeGreaterThan(0.5);
        expect(boss.pos.y).toBeLessThan(ROOM_H - 0.5);
      }
    });
  });

  it('the floor boss variant cycles with the floor', () => {
    const s = createGame(1);
    enterRoom(s, s.dungeon.bossRoom);
    expect(s.enemies[0]!.bossVariant).toBe(0); // floor 1
    descendToNextFloor(s);
    enterRoom(s, s.dungeon.bossRoom);
    expect(s.enemies[0]!.bossVariant).toBe(1); // floor 2
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
