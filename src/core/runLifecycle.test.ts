import { describe, expect, it } from 'vitest';
import { makeEnemy } from './entities.js';
import { createGame, enterRoom, FIXED_DT, NO_INPUT, tick } from './gameState.js';

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

  it('is won when the boss room is cleared', () => {
    const s = createGame(1);
    enterRoom(s, s.dungeon.bossRoom);
    expect(s.currentRoom).toBe(s.dungeon.bossRoom);
    expect(s.enemies.length).toBeGreaterThan(0); // the boss
    expect(s.doorsOpen).toBe(false);
    expect(s.status).toBe('playing');

    s.enemies.length = 0; // defeat the boss
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.status).toBe('won');
    expect(s.doorsOpen).toBe(true);
  });

  it('does not advance the simulation when not playing', () => {
    const s = createGame(1, { enemyCount: 1 });
    s.status = 'won';
    const pos = { ...s.player.pos };
    tick(s, { moveX: 1, moveY: 0 }, FIXED_DT);
    expect(s.player.pos).toEqual(pos);
  });
});
