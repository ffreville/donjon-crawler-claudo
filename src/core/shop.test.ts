import { describe, expect, it } from 'vitest';
import type { CoinPickup, ItemPickup } from './entities.js';
import { createGame, enterRoom, FIXED_DT, NO_INPUT, tick, type GameState } from './gameState.js';

const firstNormalId = (s: GameState): number => {
  const r = [...s.dungeon.rooms.values()].find((room) => room.type === 'normal');
  if (!r) throw new Error('no normal room');
  return r.id;
};

/** Finds a seed whose dungeon contains a shop room. */
const seedWithShop = (): { seed: number; shopId: number } => {
  for (let seed = 1; seed < 500; seed++) {
    const s = createGame(seed);
    const shop = [...s.dungeon.rooms.values()].find((r) => r.type === 'shop');
    if (shop) return { seed, shopId: shop.id };
  }
  throw new Error('no shop room found in seeds 1..499');
};

describe('coins', () => {
  it('drop from cleared combat rooms and are collected', () => {
    const s = createGame(1);
    enterRoom(s, firstNormalId(s));
    s.enemies.length = 0;
    tick(s, NO_INPUT, FIXED_DT); // room clears, drops a coin
    const coin = s.pickups.find((p): p is CoinPickup => p.kind === 'coin');
    expect(coin).toBeDefined();

    s.player.pos = { x: coin!.pos.x, y: coin!.pos.y };
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.coins).toBe(coin!.value);
    expect(s.pickups.some((p) => p.kind === 'coin')).toBe(false);
  });
});

describe('shop', () => {
  it('stocks priced items and a heart', () => {
    const { seed, shopId } = seedWithShop();
    const s = createGame(seed);
    enterRoom(s, shopId);
    expect(s.pickups.length).toBeGreaterThanOrEqual(2);
    expect(s.pickups.every((p) => (p.kind === 'coin' ? true : p.cost > 0))).toBe(true);
  });

  it('refuses purchase without enough coins, and buys when affordable', () => {
    const { seed, shopId } = seedWithShop();
    const s = createGame(seed);
    enterRoom(s, shopId);
    const item = s.pickups.find((p): p is ItemPickup => p.kind === 'item');
    expect(item).toBeDefined();
    const { cost, itemId } = item!;

    // Broke: standing on it does nothing.
    s.player.coins = cost - 1;
    s.player.pos = { x: item!.pos.x, y: item!.pos.y };
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.items).not.toContain(itemId);
    expect(s.pickups.some((p) => p.id === item!.id)).toBe(true);

    // Enough coins: it gets bought and the cost deducted.
    s.player.coins = cost + 5;
    tick(s, NO_INPUT, FIXED_DT);
    expect(s.player.items).toContain(itemId);
    expect(s.player.coins).toBe(5);
    expect(s.pickups.some((p) => p.id === item!.id)).toBe(false);
  });

  it('stocks the same goods deterministically for a given seed', () => {
    const { seed, shopId } = seedWithShop();
    const a = createGame(seed);
    const b = createGame(seed);
    enterRoom(a, shopId);
    enterRoom(b, shopId);
    const sig = (s: GameState): string =>
      s.pickups.map((p) => `${p.kind}:${p.kind === 'coin' ? p.value : p.cost}`).join('|');
    expect(sig(a)).toBe(sig(b));
  });
});
