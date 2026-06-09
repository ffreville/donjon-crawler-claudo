import { describe, expect, it } from 'vitest';
import { makeEnemy } from './entities.js';
import { aabbHitsWall } from './physics.js';
import { createGame, FIXED_DT, tick, type GameState } from './gameState.js';

const fireRight = { moveX: 0, moveY: 0, aimX: 1, aimY: 0 };

const setup = (kind: 'chaser' | 'boss', dx = 2.5): { s: GameState; e: ReturnType<typeof makeEnemy> } => {
  const s = createGame(1, { enemyCount: 0 });
  s.graceTimer = 0;
  const e = makeEnemy(99, { x: s.player.pos.x + dx, y: s.player.pos.y }, { kind, hp: 1000 });
  e.speed = 0; // isolate knockback from chase movement
  s.enemies.push(e);
  return { s, e };
};

describe('knockback', () => {
  it('shoves a hit enemy in the tear travel direction', () => {
    const { s, e } = setup('chaser');
    const x0 = e.pos.x;
    for (let i = 0; i < 30; i++) tick(s, fireRight, FIXED_DT);
    expect(e.pos.x).toBeGreaterThan(x0); // pushed to the right (tear direction)
  });

  it('decays: a hit enemy is not shoved indefinitely', () => {
    const { s, e } = setup('chaser', 1.5);
    tick(s, fireRight, FIXED_DT); // a single tear
    const idle = { moveX: 0, moveY: 0 };
    for (let i = 0; i < 80; i++) tick(s, idle, FIXED_DT); // hits, recoils, settles
    const a = e.pos.x;
    for (let i = 0; i < 40; i++) tick(s, idle, FIXED_DT);
    expect(Math.abs(e.pos.x - a)).toBeLessThan(0.01); // at rest
  });

  it('never knocks an enemy out of bounds', () => {
    const { s, e } = setup('chaser', 5); // near the right wall
    for (let i = 0; i < 120; i++) tick(s, fireRight, FIXED_DT);
    expect(aabbHitsWall(s.grid, e.pos.x, e.pos.y, e.radius)).toBe(false);
  });

  it('the boss resists knockback far more than a basic enemy', () => {
    const basic = setup('chaser', 1.5);
    const boss = setup('boss', 1.5);
    const bx0 = basic.e.pos.x;
    const sx0 = boss.e.pos.x;
    for (let i = 0; i < 30; i++) {
      tick(basic.s, fireRight, FIXED_DT);
      tick(boss.s, fireRight, FIXED_DT);
    }
    expect(basic.e.pos.x - bx0).toBeGreaterThan((boss.e.pos.x - sx0) * 2);
  });
});
