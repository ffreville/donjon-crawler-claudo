import { describe, expect, it } from 'vitest';
import { makePickup } from './entities.js';
import {
  createGame,
  descendToNextFloor,
  enterRoom,
  FIXED_DT,
  NO_INPUT,
  tick,
  type GameState,
  type InputState,
} from './gameState.js';
import { ITEMS } from './items.js';

const USE: InputState = { moveX: 0, moveY: 0, useItem: true };
const MED = ITEMS['med-kit']!.active!; // { charge: 3, heal: 1 }

const firstNormalId = (s: GameState): number => {
  const r = [...s.dungeon.rooms.values()].find((room) => room.type === 'normal');
  if (!r) throw new Error('no normal room');
  return r.id;
};

/** Drops an active item onto the player and returns the game (room empty/safe). */
const withActive = (id = 'med-kit', charge = MED.charge): GameState => {
  const s = createGame(1, { enemyCount: 0 });
  s.player.activeItem = id;
  s.player.activeCharge = charge;
  return s;
};

describe('active item: use', () => {
  it('heals when fully charged, and spends the charge', () => {
    const s = withActive('med-kit', MED.charge);
    s.player.hp = 3;
    tick(s, USE, FIXED_DT);
    expect(s.player.hp).toBe(3 + (MED.heal ?? 0));
    expect(s.player.activeCharge).toBe(0); // spent
  });

  it('does nothing when not fully charged', () => {
    const s = withActive('med-kit', MED.charge - 1);
    s.player.hp = 3;
    tick(s, USE, FIXED_DT);
    expect(s.player.hp).toBe(3); // no heal
    expect(s.player.activeCharge).toBe(MED.charge - 1); // unchanged
  });

  it('never heals past max HP', () => {
    const s = withActive('med-kit', MED.charge);
    s.player.hp = s.player.maxHp;
    tick(s, USE, FIXED_DT);
    expect(s.player.hp).toBe(s.player.maxHp);
  });

  it('does nothing with no active item held', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.player.hp = 2;
    tick(s, USE, FIXED_DT);
    expect(s.player.hp).toBe(2);
  });
});

describe('active item: recharge', () => {
  it('gains one charge per room cleared, capped at max', () => {
    const s = createGame(1);
    enterRoom(s, firstNormalId(s));
    s.player.activeItem = 'med-kit';
    s.player.activeCharge = 0;
    s.enemies.length = 0; // simulate clearing the room
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.activeCharge).toBe(1);
  });

  it('does not charge beyond the max', () => {
    const s = createGame(1);
    enterRoom(s, firstNormalId(s));
    s.player.activeItem = 'med-kit';
    s.player.activeCharge = MED.charge; // already full
    s.enemies.length = 0;
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.activeCharge).toBe(MED.charge);
  });
});

describe('active item: single slot + swap', () => {
  it('picking up an active item with one held swaps them and drops the old one for free', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.player.activeItem = 'med-kit';
    s.player.activeCharge = 1;
    s.player.coins = 5;

    // A "shop" active item (cost 5) sitting on the player.
    const incoming = makePickup(900, { x: s.player.pos.x, y: s.player.pos.y }, 'med-kit', 5);
    s.pickups.push(incoming);

    tick(s, NO_INPUT, FIXED_DT);

    // Paid for the new one; the previous active is dropped as a FREE pickup.
    expect(s.player.coins).toBe(0);
    expect(s.player.activeItem).toBe('med-kit');
    expect(s.player.activeCharge).toBe(MED.charge); // re-picked = full
    const dropped = s.pickups.find((p) => p.kind === 'item');
    expect(dropped).toBeDefined();
    expect(dropped!.kind === 'item' ? dropped!.cost : -1).toBe(0); // free
    expect(dropped!.armed).toBe(false); // not re-collected while stood on
  });

  it('does not lose the active slot on swap', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.player.activeItem = 'med-kit';
    s.pickups.push(makePickup(900, { x: s.player.pos.x, y: s.player.pos.y }, 'lucky-coin', 0));
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.activeItem).toBe('lucky-coin');
    expect(s.pickups.some((p) => p.kind === 'item')).toBe(true); // old med-kit dropped
  });

  it('the dropped item is grabbable again only after stepping off it', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.player.activeItem = 'med-kit';
    s.player.coins = 0;
    s.pickups.push(makePickup(900, { x: s.player.pos.x, y: s.player.pos.y }, 'med-kit', 0));

    tick(s, NO_INPUT, FIXED_DT); // collect → drops old (disarmed) under the player
    const dropped = s.pickups.find((p) => p.kind === 'item')!;
    expect(dropped.armed).toBe(false);

    tick(s, NO_INPUT, FIXED_DT); // still standing on it → not collected, still disarmed
    expect(s.pickups).toContain(dropped);

    // Step off: it arms. Step back on: it gets collected (swap again).
    s.player.pos = { x: s.player.pos.x + 3, y: s.player.pos.y };
    tick(s, NO_INPUT, FIXED_DT);
    expect(dropped.armed).toBe(true);
    s.player.pos = { x: dropped.pos.x, y: dropped.pos.y };
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.pickups).not.toContain(dropped);
  });
});

describe('active item: lucky coin', () => {
  it('grants a coin on use and spends the charge', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.player.activeItem = 'lucky-coin';
    s.player.activeCharge = ITEMS['lucky-coin']!.active!.charge;
    s.player.coins = 0;
    tick(s, USE, FIXED_DT);
    expect(s.player.coins).toBe(1);
    expect(s.player.activeCharge).toBe(0);
  });
});

describe('active item: reroll die', () => {
  /** A game parked in a treasure room that still holds its item. */
  const inTreasure = (): GameState => {
    for (let seed = 1; seed < 300; seed++) {
      const s = createGame(seed);
      const t = [...s.dungeon.rooms.values()].find((r) => r.type === 'treasure');
      if (t) {
        enterRoom(s, t.id);
        return s;
      }
    }
    throw new Error('no treasure room found');
  };

  it('rerolls the room item into a different one and spends the charge', () => {
    const s = inTreasure();
    const before = s.pickups.find((p) => p.kind === 'item');
    expect(before).toBeDefined();
    const oldId = before!.kind === 'item' ? before!.itemId : '';

    // Step off the pedestal so the item isn't collected before we reroll.
    s.player.pos = { x: s.player.pos.x + 5, y: s.player.pos.y };
    s.player.activeItem = 'reroll-die';
    s.player.activeCharge = ITEMS['reroll-die']!.active!.charge;
    tick(s, USE, FIXED_DT);

    const after = s.pickups.find((p) => p.kind === 'item');
    const newId = after && after.kind === 'item' ? after.itemId : '';
    expect(newId).not.toBe(oldId); // a fresh item is offered
    expect(s.player.activeCharge).toBe(0); // spent
  });

  it('does nothing (and keeps the charge) in a room with no items', () => {
    const s = createGame(1, { enemyCount: 0 }); // start room: no item pickups
    s.player.activeItem = 'reroll-die';
    const full = ITEMS['reroll-die']!.active!.charge;
    s.player.activeCharge = full;
    tick(s, USE, FIXED_DT);
    expect(s.player.activeCharge).toBe(full); // not wasted
  });
});

describe('active item: dungeon map', () => {
  it('reveals the floor on use and spends the charge', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.player.activeItem = 'dungeon-map';
    s.player.activeCharge = ITEMS['dungeon-map']!.active!.charge;
    expect(s.mapRevealed).toBe(false);
    tick(s, USE, FIXED_DT);
    expect(s.mapRevealed).toBe(true);
    expect(s.player.activeCharge).toBe(0);
  });

  it('the reveal resets on the next floor', () => {
    const s = createGame(1, { enemyCount: 0 });
    s.mapRevealed = true;
    descendToNextFloor(s);
    expect(s.mapRevealed).toBe(false);
  });
});
