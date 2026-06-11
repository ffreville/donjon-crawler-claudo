import { describe, expect, it } from 'vitest';
import { CHARACTERS, getCharacter } from './characters.js';
import { createGame } from './gameState.js';
import { ITEMS } from './items.js';

describe('characters', () => {
  it('every character id is unique and resolvable', () => {
    const ids = CHARACTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(getCharacter(id)?.id).toBe(id);
  });

  it('the default start (Wanderer) leaves the base stats untouched', () => {
    const base = createGame(1).player; // default characterId
    const wanderer = createGame(1, { characterId: 'wanderer' }).player;
    expect(base.maxHp).toBe(6);
    expect(base.tearDamage).toBe(3);
    expect(base.tearRange).toBe(4);
    expect(base.items).toHaveLength(0);
    expect(base.activeItem).toBeNull();
    expect(base.familiars).toHaveLength(0);
    expect(wanderer.maxHp).toBe(base.maxHp);
  });

  it('an unknown character id falls back to the baseline (no crash)', () => {
    const p = createGame(1, { characterId: 'does-not-exist' }).player;
    expect(p.maxHp).toBe(6);
    expect(p.tearDamage).toBe(3);
  });

  it('every character starts with a Spyglass (+1 range)', () => {
    for (const c of CHARACTERS) {
      const p = createGame(1, { characterId: c.id }).player;
      expect(p.items).toContain('spyglass');
    }
  });

  it('the Brute applies its absolute stat overrides (+1 range from the Spyglass)', () => {
    const p = createGame(1, { characterId: 'brute' }).player;
    expect(p.maxHp).toBe(8);
    expect(p.hp).toBe(8); // full at start
    expect(p.tearDamage).toBe(5);
    expect(p.speed).toBe(5);
    expect(p.tearRange).toBe(4); // 3 base + 1 Spyglass
    expect(p.knife).toBe(true); // TEMP: knife for testing, remove before v1
  });

  it('the Scout is fast, far-reaching, fragile and light-hitting', () => {
    const p = createGame(1, { characterId: 'scout' }).player;
    expect(p.maxHp).toBe(4);
    expect(p.speed).toBe(7.5);
    expect(p.tearRange).toBe(8); // 7 base + 1 Spyglass
    expect(p.tearDamage).toBe(2);
  });

  it('the Tinker starts holding a charged Reroll Die and some coins', () => {
    const p = createGame(1, { characterId: 'tinker' }).player;
    expect(p.maxHp).toBe(5);
    expect(p.fireRate).toBe(4);
    expect(p.activeItem).toBe('reroll-die');
    expect(p.activeCharge).toBe(ITEMS['reroll-die']!.active!.charge);
    expect(p.coins).toBe(3);
  });

  it('the Hoarder starts with a Flying Key familiar, coins and a key', () => {
    const p = createGame(1, { characterId: 'hoarder' }).player;
    expect(p.familiars.map((f) => f.kind)).toEqual(['key-dropper']);
    expect(p.items).toContain('flying-key');
    expect(p.coins).toBe(4);
    expect(p.keys).toBe(1);
  });

  it('the Twins fire two lighter tears', () => {
    const p = createGame(1, { characterId: 'gemini' }).player;
    expect(p.shotCount).toBe(2);
    expect(p.tearDamage).toBe(2);
    expect(p.maxHp).toBe(5);
  });

  it('the Pyromancer starts with burning tears and weak direct damage', () => {
    const p = createGame(1, { characterId: 'ember' }).player;
    expect(p.tearDamage).toBe(2);
    expect(p.items).toContain('fire-tears');
    expect(p.tearEffects.some((e) => e.kind === 'burn')).toBe(true);
  });

  it('the Wraith starts flying and frail', () => {
    const p = createGame(1, { characterId: 'wraith' }).player;
    expect(p.flying).toBe(true);
    expect(p.items).toContain('wings');
    expect(p.maxHp).toBe(4);
    expect(p.speed).toBe(6.5);
  });

  it('is deterministic: same character + seed yields the same starting player', () => {
    const a = createGame(7, { characterId: 'tinker' }).player;
    const b = createGame(7, { characterId: 'tinker' }).player;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
