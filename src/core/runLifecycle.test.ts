import { describe, expect, it } from 'vitest';
import { makeEnemy } from './entities.js';
import {
  createGame,
  enterRoom,
  FIXED_DT,
  MAX_FLOORS,
  NO_INPUT,
  tick,
  TELEPORTER_POS,
} from './gameState.js';

describe('run lifecycle', () => {
  it('ends in death when the player reaches 0 HP', () => {
    const s = createGame(1, { enemyCount: 1 }); // locked room
    s.enemies.length = 0;
    s.enemies.push(makeEnemy(99, { x: s.player.pos.x, y: s.player.pos.y })); // on the player
    s.player.hp = 1;
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.hp).toBe(0);
    expect(s.status).toBe('dead');
  });

  it('freezes the world once the run is over', () => {
    const s = createGame(1, { enemyCount: 1 });
    s.enemies.length = 0;
    s.enemies.push(makeEnemy(99, { x: s.player.pos.x, y: s.player.pos.y }));
    s.player.hp = 1;
    tick(s, NO_INPUT, FIXED_DT); // player dies
    const frozen = { ...s.enemies[0]!.pos };
    tick(s, { moveX: 1, moveY: 0, aimX: 1, aimY: 0 }, FIXED_DT);
    expect(s.enemies[0]!.pos).toEqual(frozen); // enemy didn't move
    expect(s.projectiles).toHaveLength(0); // no firing
  });

  it('spawns the player far from the boss on entry', () => {
    const s = createGame(1);
    enterRoom(s, s.dungeon.bossRoom);
    const boss = s.enemies[0]!;
    const dist = Math.hypot(s.player.pos.x - boss.pos.x, s.player.pos.y - boss.pos.y);
    // Comfortably clear of contact range (player.radius + boss.radius ≈ 1.1).
    expect(dist).toBeGreaterThan(3);
  });

  it('drops a teleporter when the boss is defeated, without winning instantly', () => {
    const s = createGame(1);
    enterRoom(s, s.dungeon.bossRoom);
    expect(s.enemies.length).toBeGreaterThan(0); // the boss
    expect(s.doorsOpen).toBe(false);

    s.enemies.length = 0; // defeat the boss
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.status).toBe('playing'); // not an instant win
    expect(s.bossDefeated).toBe(true);
    expect(s.doorsOpen).toBe(true); // floor is open for backtracking
  });

  it('descends to the next floor (not a win) when not on the final floor', () => {
    const s = createGame(1);
    s.player.items.push('marker'); // progression we expect to survive the descent
    enterRoom(s, s.dungeon.bossRoom);
    s.enemies.length = 0;
    tick(s, NO_INPUT, FIXED_DT); // boss defeated
    expect(s.floor).toBe(1);

    s.player.pos = { x: TELEPORTER_POS.x, y: TELEPORTER_POS.y };
    tick(s, NO_INPUT, FIXED_DT); // step on teleporter
    expect(s.status).toBe('playing');
    expect(s.floor).toBe(2);
    expect(s.bossDefeated).toBe(false); // fresh floor
    expect(s.player.items).toContain('marker'); // progression carried over
  });

  it('wins by reaching the teleporter on the final floor', () => {
    const s = createGame(1);
    s.floor = MAX_FLOORS; // pretend we are on the last floor
    enterRoom(s, s.dungeon.bossRoom);
    s.enemies.length = 0;
    tick(s, NO_INPUT, FIXED_DT);
    s.player.pos = { x: TELEPORTER_POS.x, y: TELEPORTER_POS.y };
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.status).toBe('won');
  });

  it('does not advance the simulation when not playing', () => {
    const s = createGame(1, { enemyCount: 1 });
    s.status = 'won';
    const pos = { ...s.player.pos };
    tick(s, { moveX: 1, moveY: 0 }, FIXED_DT);
    expect(s.player.pos).toEqual(pos);
  });
});
