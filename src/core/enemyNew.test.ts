import { describe, expect, it } from 'vitest';
import { makeEnemy } from './entities.js';
import {
  createGame,
  EXPLODER_DAMAGE,
  EXPLODER_RADIUS,
  FIXED_DT,
  NO_INPUT,
  SPLITTER_CHILDREN,
  tick,
  type GameState,
} from './gameState.js';

/** A fresh game in the start room with no spawned enemies, grace disabled. */
const emptyArena = (): GameState => {
  const s = createGame(1, { enemyCount: 0 });
  s.enemies.splice(0, s.enemies.length);
  s.graceTimer = 0;
  return s;
};

describe('fly', () => {
  it('buzzes toward the player overall but does not travel in a straight line', () => {
    const s = emptyArena();
    const start = { x: s.player.pos.x + 5, y: s.player.pos.y };
    s.enemies.push(makeEnemy(1, start, { kind: 'fly' }));
    const fly = s.enemies[0]!;

    const dist0 = Math.hypot(fly.pos.x - s.player.pos.x, fly.pos.y - s.player.pos.y);
    let maxOffAxis = 0;
    for (let i = 0; i < 90; i++) {
      tick(s, NO_INPUT, FIXED_DT);
      maxOffAxis = Math.max(maxOffAxis, Math.abs(fly.pos.y - s.player.pos.y));
    }
    const dist1 = Math.hypot(fly.pos.x - s.player.pos.x, fly.pos.y - s.player.pos.y);

    expect(dist1).toBeLessThan(dist0); // net approach
    expect(maxOffAxis).toBeGreaterThan(0.2); // wobbled off the straight line
  });
});

describe('charger', () => {
  it('telegraphs (holds still) then dashes faster than it walks', () => {
    const s = emptyArena();
    const charger = makeEnemy(1, { x: s.player.pos.x + 4, y: s.player.pos.y }, { kind: 'charger' });
    s.enemies.push(charger);

    let maxStep = 0;
    let minStep = Infinity;
    let prev = { x: charger.pos.x, y: charger.pos.y };
    // One full cycle (~1.8s = 108 ticks): a windup with near-zero steps, then a dash.
    for (let i = 0; i < 108; i++) {
      tick(s, NO_INPUT, FIXED_DT);
      const step = Math.hypot(charger.pos.x - prev.x, charger.pos.y - prev.y);
      maxStep = Math.max(maxStep, step);
      minStep = Math.min(minStep, step);
      prev = { x: charger.pos.x, y: charger.pos.y };
    }
    const walkStep = charger.speed * FIXED_DT;
    expect(minStep).toBeLessThan(walkStep * 0.5); // telegraph: nearly motionless
    expect(maxStep).toBeGreaterThan(walkStep * 2); // dash: much faster than a walk
  });
});

describe('exploder', () => {
  it('blasts the player on death when in range', () => {
    const s = emptyArena();
    // Inside the blast radius but clear of body contact, so only the blast can hit.
    const e = makeEnemy(1, { x: s.player.pos.x + 1.2, y: s.player.pos.y }, { kind: 'exploder' });
    s.enemies.push(e);
    const hp0 = s.player.hp;
    e.hp = 0; // killed this tick; reap fires the blast
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.enemies).toHaveLength(0);
    expect(s.player.hp).toBe(hp0 - EXPLODER_DAMAGE);
  });

  it('does nothing on death when the player is out of range', () => {
    const s = emptyArena();
    const e = makeEnemy(1, { x: s.player.pos.x + EXPLODER_RADIUS + 2, y: s.player.pos.y }, { kind: 'exploder' });
    s.enemies.push(e);
    const hp0 = s.player.hp;
    e.hp = 0;
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.enemies).toHaveLength(0);
    expect(s.player.hp).toBe(hp0);
  });
});

describe('splitter', () => {
  it('is replaced by flies on death', () => {
    const s = emptyArena();
    const sp = makeEnemy(1, { x: s.player.pos.x + 4, y: s.player.pos.y }, { kind: 'splitter' });
    s.enemies.push(sp);
    sp.hp = 0;
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.enemies).toHaveLength(SPLITTER_CHILDREN);
    expect(s.enemies.every((e) => e.kind === 'fly')).toBe(true);
  });
});
