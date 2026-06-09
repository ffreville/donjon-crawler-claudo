import { describe, expect, it } from 'vitest';
import { makeEnemy } from './entities.js';
import { createGame, FIXED_DT, GRACE_PERIOD, NO_INPUT, tick } from './gameState.js';

describe('entry grace', () => {
  it('arms a grace window on entering a room', () => {
    const s = createGame(1);
    expect(s.graceTimer).toBeCloseTo(GRACE_PERIOD, 5);
  });

  it('freezes enemies and blocks contact damage during the window, then resumes', () => {
    const s = createGame(1, { enemyCount: 0 });
    const chaser = makeEnemy(1, { x: 10, y: 4.5 });
    const toucher = makeEnemy(2, { x: s.player.pos.x, y: s.player.pos.y }); // overlapping
    s.enemies.push(chaser, toucher);
    const x0 = chaser.pos.x;
    const hp0 = s.player.hp;

    // Within the grace window (~0.4s, under GRACE_PERIOD): no movement, no contact damage.
    for (let i = 0; i < 25; i++) tick(s, NO_INPUT, FIXED_DT);
    expect(chaser.pos.x).toBe(x0);
    expect(s.player.hp).toBe(hp0);

    // After the window elapses: enemies act again.
    for (let i = 0; i < 60; i++) tick(s, NO_INPUT, FIXED_DT);
    expect(chaser.pos.x).toBeLessThan(x0);
    expect(s.player.hp).toBeLessThan(hp0);
  });
});
