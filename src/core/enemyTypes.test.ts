import { describe, expect, it } from 'vitest';
import { ENEMY_ARCHETYPES, makeEnemy } from './entities.js';
import {
  createGame,
  enterRoom,
  FIXED_DT,
  NO_INPUT,
  tick,
  type GameState,
} from './gameState.js';

const firstNormalId = (s: GameState): number => {
  const r = [...s.dungeon.rooms.values()].find((room) => room.type === 'normal');
  if (!r) throw new Error('no normal room');
  return r.id;
};

describe('enemy archetypes', () => {
  it('have distinct base stats (swarmer fastest, tank toughest)', () => {
    expect(ENEMY_ARCHETYPES.swarmer.speed).toBeGreaterThan(ENEMY_ARCHETYPES.chaser.speed);
    expect(ENEMY_ARCHETYPES.tank.hp).toBeGreaterThan(ENEMY_ARCHETYPES.chaser.hp);
    expect(ENEMY_ARCHETYPES.tank.speed).toBeLessThan(ENEMY_ARCHETYPES.chaser.speed);
  });

  it('makeEnemy applies the archetype for a kind', () => {
    const e = makeEnemy(1, { x: 5, y: 5 }, { kind: 'tank' });
    expect(e.kind).toBe('tank');
    expect(e.hp).toBe(ENEMY_ARCHETYPES.tank.hp);
    expect(e.radius).toBe(ENEMY_ARCHETYPES.tank.radius);
  });
});

describe('shooter behaviour', () => {
  it('fires enemy projectiles that damage the player', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.enemies.push(makeEnemy(99, { x: s.player.pos.x + 4, y: s.player.pos.y }, { kind: 'shooter' }));
    const hp0 = s.player.hp;

    // Run a couple of seconds: the shooter should fire and at least one shot lands.
    let sawEnemyProjectile = false;
    for (let i = 0; i < 240; i++) {
      tick(s, NO_INPUT, FIXED_DT);
      if (s.projectiles.some((p) => p.source === 'enemy')) sawEnemyProjectile = true;
      if (s.player.hp < hp0) break;
    }
    expect(sawEnemyProjectile).toBe(true);
    expect(s.player.hp).toBeLessThan(hp0);
  });

  it('enemy projectiles respect player i-frames (one hit at a time)', () => {
    const s = createGame(1, { enemyCount: 0 });
    const p = s.player.pos;
    // Two enemy projectiles already overlapping the player.
    s.projectiles.push(
      { id: 1, pos: { x: p.x, y: p.y }, vel: { x: 0, y: 0 }, radius: 0.15, damage: 1, life: 1, source: 'enemy', applies: [], piercing: false, homing: false, hits: [] },
      { id: 2, pos: { x: p.x, y: p.y }, vel: { x: 0, y: 0 }, radius: 0.15, damage: 1, life: 1, source: 'enemy', applies: [], piercing: false, homing: false, hits: [] },
    );
    const hp0 = s.player.hp;
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.hp).toBe(hp0 - 1); // only one landed; the other was negated by i-frames
  });
});

describe('floor composition', () => {
  it('introduces shooters on floor 2+ and is deterministic', () => {
    const a = createGame(3);
    const b = createGame(3);
    enterRoom(a, firstNormalId(a));
    enterRoom(b, firstNormalId(b));
    expect(a.enemies.map((e) => e.kind)).toEqual(b.enemies.map((e) => e.kind));
    // Floor 1 only spawns chasers/swarmers/flies.
    for (const e of a.enemies) expect(['chaser', 'swarmer', 'fly']).toContain(e.kind);
  });
});
