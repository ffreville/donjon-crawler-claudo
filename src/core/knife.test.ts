import { describe, expect, it } from 'vitest';
import { makeEnemy } from './entities.js';
import { applyItem, ITEMS } from './items.js';
import {
  createGame,
  FIXED_DT,
  KNIFE_BASE_REACH,
  NO_INPUT,
  tick,
  type GameState,
  type InputState,
} from './gameState.js';

const FIRE_RIGHT: InputState = { moveX: 0, moveY: 0, aimX: 1, aimY: 0 };

/** A safe room where the player holds the knife, with one stationary enemy at dx. */
const arena = (dx: number, hp = 100): { s: GameState; e: ReturnType<typeof makeEnemy> } => {
  const s = createGame(1, { enemyCount: 0 });
  s.graceTimer = 0;
  applyItem(s.player, ITEMS['knife']!);
  s.player.knifeDir = { x: 1, y: 0 };
  const e = makeEnemy(99, { x: s.player.pos.x + dx, y: s.player.pos.y }, { hp });
  e.speed = 0;
  s.enemies.push(e);
  return { s, e };
};

describe("Mom's Knife", () => {
  it('replaces tears: holding fire spawns no projectiles', () => {
    const s = createGame(1, { enemyCount: 0 });
    applyItem(s.player, ITEMS['knife']!);
    for (let i = 0; i < 30; i++) tick(s, FIRE_RIGHT, FIXED_DT);
    expect(s.projectiles).toHaveLength(0);
  });

  it('damages an enemy right in front by contact, with no input', () => {
    const { s, e } = arena(KNIFE_BASE_REACH - 0.3); // within the idle blade
    for (let i = 0; i < 30; i++) tick(s, NO_INPUT, FIXED_DT);
    expect(e.hp).toBeLessThan(100);
  });

  it('the held blade stays short while charging; only a thrown knife reaches far', () => {
    const a = arena(4); // enemy ~4 tiles away
    // Holding fire charges but does NOT extend the blade — the far enemy is safe.
    for (let i = 0; i < 40; i++) tick(a.s, FIRE_RIGHT, FIXED_DT);
    expect(a.e.hp).toBe(100);
    // Releasing throws the charged knife, which flies out and hits it.
    tick(a.s, NO_INPUT, FIXED_DT);
    for (let i = 0; i < 120 && a.s.player.knifeThrow; i++) tick(a.s, NO_INPUT, FIXED_DT);
    expect(a.e.hp).toBeLessThan(100);
  });

  it('throws in the charged direction even if the player turns the opposite way', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.graceTimer = 0;
    applyItem(s.player, ITEMS['knife']!);
    const right = makeEnemy(1, { x: s.player.pos.x + 4, y: s.player.pos.y }, { hp: 100 });
    const left = makeEnemy(2, { x: s.player.pos.x - 4, y: s.player.pos.y }, { hp: 100 });
    right.speed = 0;
    left.speed = 0;
    s.enemies.push(right, left);

    for (let i = 0; i < 40; i++) tick(s, FIRE_RIGHT, FIXED_DT); // charge to the right
    // Release on the same tick the player turns LEFT: the throw still locks right.
    tick(s, { moveX: -1, moveY: 0 }, FIXED_DT);
    expect(s.player.knifeThrow!.dir.x).toBeGreaterThan(0.9);
    // Let it fly out and back (player stays put, so we isolate the throw direction).
    for (let i = 0; i < 150 && s.player.knifeThrow; i++) tick(s, NO_INPUT, FIXED_DT);

    expect(right.hp).toBeLessThan(100); // hit in the charged direction
    expect(left.hp).toBe(100); // the opposite side is untouched
  });

  it('points where the player walks (facing follows movement)', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.graceTimer = 0;
    applyItem(s.player, ITEMS['knife']!);
    // Enemy directly above; walking up should orient the blade up and hit it.
    const e = makeEnemy(99, { x: s.player.pos.x, y: s.player.pos.y - (KNIFE_BASE_REACH - 0.3) }, { hp: 100 });
    e.speed = 0;
    s.enemies.push(e);
    for (let i = 0; i < 30; i++) tick(s, { moveX: 0, moveY: -1 }, FIXED_DT);
    expect(e.hp).toBeLessThan(100);
  });

  it('throws on release: the blade leaves the hand, then returns', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.graceTimer = 0;
    applyItem(s.player, ITEMS['knife']!);
    s.player.knifeDir = { x: 1, y: 0 };
    for (let i = 0; i < 20; i++) tick(s, FIRE_RIGHT, FIXED_DT); // charge (still in hand)
    expect(s.player.knifeThrow).toBeNull();

    tick(s, NO_INPUT, FIXED_DT); // release → throw launched
    expect(s.player.knifeThrow).not.toBeNull();
    expect(s.player.knifeThrow!.out).toBe(true);

    let ticks = 0;
    while (s.player.knifeThrow && ticks < 300) {
      tick(s, NO_INPUT, FIXED_DT);
      ticks++;
    }
    expect(s.player.knifeThrow).toBeNull(); // flew out and was caught on return
  });

  it('a thrown knife damages enemies in its flight path', () => {
    const { s, e } = arena(3); // enemy at +3, beyond the idle held reach (1.4)
    // Launch a throw straight at it (bypassing the charge step).
    s.player.knifeThrow = {
      pos: { x: s.player.pos.x, y: s.player.pos.y },
      dir: { x: 1, y: 0 },
      dist: 0,
      maxDist: 6,
      out: true,
      hits: [],
    };
    for (let i = 0; i < 80 && s.player.knifeThrow; i++) tick(s, NO_INPUT, FIXED_DT);
    expect(e.hp).toBeLessThan(100);
  });
});
