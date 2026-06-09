import { describe, expect, it } from 'vitest';
import { makeEnemy } from './entities.js';
import {
  createGame,
  FIXED_DT,
  tick,
  type GameState,
  type InputState,
} from './gameState.js';

const fireRight: InputState = { moveX: 0, moveY: 0, aimX: 1, aimY: 0 };
const idle: InputState = { moveX: 0, moveY: 0 };

const runTicks = (s: GameState, input: InputState, n: number): void => {
  for (let i = 0; i < n; i++) tick(s, input, FIXED_DT);
};

describe('firing', () => {
  it('spawns a projectile and starts the fire cooldown', () => {
    const s = createGame(1, { enemyCount: 0 });
    tick(s, fireRight, FIXED_DT);
    expect(s.projectiles).toHaveLength(1);
    expect(s.player.fireCooldown).toBeGreaterThan(0);
  });

  it('does not fire again while on cooldown', () => {
    const s = createGame(1, { enemyCount: 0 });
    tick(s, fireRight, FIXED_DT);
    tick(s, fireRight, FIXED_DT); // still cooling down → no new projectile
    expect(s.projectiles).toHaveLength(1);
  });

  it('does not fire when the aim vector is zero', () => {
    const s = createGame(1, { enemyCount: 0 });
    runTicks(s, idle, 10);
    expect(s.projectiles).toHaveLength(0);
  });
});

describe('projectiles', () => {
  it('travel in the aim direction', () => {
    const s = createGame(1, { enemyCount: 0 });
    tick(s, fireRight, FIXED_DT);
    const x0 = s.projectiles[0]!.pos.x;
    runTicks(s, idle, 5);
    expect(s.projectiles[0]!.pos.x).toBeGreaterThan(x0);
  });

  it('are removed when they hit a wall', () => {
    const s = createGame(1, { enemyCount: 0 });
    tick(s, fireRight, FIXED_DT); // fire once
    runTicks(s, idle, 90); // let it fly into the right wall (no re-fire)
    expect(s.projectiles).toHaveLength(0);
  });
});

describe('enemies', () => {
  it('chase the player', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.enemies.push(makeEnemy(99, { x: 10, y: 4.5 }));
    s.graceTimer = 0; // skip the entry grace; we're testing chase
    const startX = s.enemies[0]!.pos.x;
    runTicks(s, idle, 30); // player stays put at (7.5, 4.5)
    expect(s.enemies[0]!.pos.x).toBeLessThan(startX);
  });

  it('die to player projectiles', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.enemies.push(makeEnemy(99, { x: 9, y: 4.5 }, { hp: 3 }));
    for (let i = 0; i < 60 && s.enemies.length > 0; i++) tick(s, fireRight, FIXED_DT);
    expect(s.enemies).toHaveLength(0);
  });

  it('a single projectile is consumed by the first enemy and does not pierce', () => {
    const s = createGame(1, { enemyCount: 0 });
    // Two stationary enemies in a line; one shot should kill only the nearer one.
    s.enemies.push(makeEnemy(1, { x: 9, y: 4.5 }, { hp: 3, speed: 0 }));
    s.enemies.push(makeEnemy(2, { x: 9.7, y: 4.5 }, { hp: 3, speed: 0 }));
    tick(s, fireRight, FIXED_DT); // exactly one shot
    runTicks(s, idle, 40); // let it travel; no further firing
    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0]!.id).toBe(2); // the far enemy survives
  });
});

describe('contact damage', () => {
  it('damages the player on contact, then grants i-frames', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.enemies.push(makeEnemy(99, { x: 7.5, y: 4.5 })); // overlapping the player
    s.graceTimer = 0; // skip the entry grace; we're testing contact damage
    const hp0 = s.player.hp;
    tick(s, idle, FIXED_DT);
    expect(s.player.hp).toBe(hp0 - 1);
    expect(s.player.invuln).toBeGreaterThan(0);
    tick(s, idle, FIXED_DT); // invulnerable → no further damage
    expect(s.player.hp).toBe(hp0 - 1);
  });
});

describe('determinism', () => {
  it('same seed + same input sequence => identical combat state', () => {
    const inputs: InputState[] = [
      { moveX: 1, moveY: 0, aimX: 1, aimY: 0 },
      { moveX: 0, moveY: 1, aimX: 0, aimY: 1 },
      { moveX: -1, moveY: 0, aimX: -1, aimY: 0 },
    ];
    const a = createGame(7, { enemyCount: 4 });
    const b = createGame(7, { enemyCount: 4 });
    for (const input of inputs) {
      for (let i = 0; i < 25; i++) {
        tick(a, input, FIXED_DT);
        tick(b, input, FIXED_DT);
      }
    }
    expect(a.enemies.map((e) => e.pos)).toEqual(b.enemies.map((e) => e.pos));
    expect(a.projectiles.map((p) => p.pos)).toEqual(b.projectiles.map((p) => p.pos));
    expect(a.player.hp).toBe(b.player.hp);
    expect(a.player.pos).toEqual(b.player.pos);
  });
});
