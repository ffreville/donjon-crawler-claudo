import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  charFloor5AchievementId,
  charWinAchievementId,
  floorAchievementId,
  floorClearedAchievements,
  gameWonAchievements,
  hasAnyWin,
} from './achievements.js';
import { CHARACTERS } from './characters.js';
import { MAX_FLOORS } from './gameState.js';

describe('achievements', () => {
  it('has unique ids and one per floor + two per character', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(MAX_FLOORS + CHARACTERS.length * 2);
    for (let f = 1; f <= MAX_FLOORS; f++) {
      expect(ids).toContain(floorAchievementId(f));
    }
    for (const c of CHARACTERS) {
      expect(ids).toContain(charFloor5AchievementId(c.id));
      expect(ids).toContain(charWinAchievementId(c.id));
    }
  });

  it('clearing a normal floor earns only the floor achievement', () => {
    expect(floorClearedAchievements(3, 'wanderer')).toEqual([floorAchievementId(3)]);
  });

  it('clearing floor 5 also earns the character milestone', () => {
    expect(floorClearedAchievements(5, 'brute')).toEqual([
      floorAchievementId(5),
      charFloor5AchievementId('brute'),
    ]);
  });

  it('winning earns the character win achievement', () => {
    expect(gameWonAchievements('scout')).toEqual([charWinAchievementId('scout')]);
  });

  it('hasAnyWin detects a beaten game', () => {
    expect(hasAnyWin([floorAchievementId(1), floorAchievementId(2)])).toBe(false);
    expect(hasAnyWin([charWinAchievementId('hoarder')])).toBe(true);
  });

  it('the Tinker is the win-gated character', () => {
    const tinker = CHARACTERS.find((c) => c.id === 'tinker');
    expect(tinker?.lockedUntilWin).toBe(true);
    expect(CHARACTERS.filter((c) => c.lockedUntilWin)).toHaveLength(1);
  });
});
