import { describe, expect, it } from 'vitest';
import { applyItem, ITEMS } from './items.js';
import { makeProjectile } from './entities.js';
import {
  createGame,
  FIXED_DT,
  getOrbitalPositions,
  NO_INPUT,
  ORBITAL_RADIUS,
  tick,
  type GameState,
} from './gameState.js';

const giveOrbitals = (n: number): GameState => {
  const s = createGame(1, { enemyCount: 0 });
  const ids = ['orbital-fly-1', 'orbital-fly-2', 'orbital-fly-3'];
  for (let i = 0; i < n; i++) applyItem(s.player, ITEMS[ids[i]!]!);
  return s;
};

describe('orbitals', () => {
  it('each Orbital Fly grants one orbital', () => {
    const s = giveOrbitals(3);
    expect(s.player.orbitals).toBe(3);
  });

  it('are evenly spaced: two sit opposite, three at 120°', () => {
    const two = getOrbitalPositions(giveOrbitals(2).player);
    expect(two).toHaveLength(2);
    // Opposite means their offsets from the player negate each other.
    const p = giveOrbitals(2).player;
    const a = getOrbitalPositions(p);
    expect(a[0]!.x - p.pos.x).toBeCloseTo(-(a[1]!.x - p.pos.x), 6);
    expect(a[0]!.y - p.pos.y).toBeCloseTo(-(a[1]!.y - p.pos.y), 6);

    const three = getOrbitalPositions(giveOrbitals(3).player);
    expect(three).toHaveLength(3);
    // All at the orbit radius from the player.
    const pp = giveOrbitals(3).player;
    for (const o of getOrbitalPositions(pp)) {
      expect(Math.hypot(o.x - pp.pos.x, o.y - pp.pos.y)).toBeCloseTo(ORBITAL_RADIUS, 6);
    }
  });

  it('rotate over time', () => {
    const s = giveOrbitals(1);
    const a0 = s.player.orbitalAngle;
    for (let i = 0; i < 10; i++) tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.orbitalAngle).toBeGreaterThan(a0);
  });

  it('block an enemy projectile that overlaps one (player takes no damage)', () => {
    const s = giveOrbitals(1);
    s.graceTimer = 0;
    const hp0 = s.player.hp;
    const o = getOrbitalPositions(s.player)[0]!;
    // An enemy shot sitting right on the orbital, heading nowhere.
    s.projectiles.push(makeProjectile(900, { x: o.x, y: o.y }, { x: 0, y: 0 }, 1, 1, 'enemy'));
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.projectiles.some((p) => p.id === 900)).toBe(false); // consumed by the orbital
    expect(s.player.hp).toBe(hp0); // and the player is unharmed
  });

  it('do not block the player\'s own tears', () => {
    const s = giveOrbitals(2);
    const o = getOrbitalPositions(s.player)[0]!;
    s.projectiles.push(makeProjectile(901, { x: o.x, y: o.y }, { x: 0, y: 0 }, 1, 1, 'player'));
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.projectiles.some((p) => p.id === 901)).toBe(true); // still alive
  });
});
