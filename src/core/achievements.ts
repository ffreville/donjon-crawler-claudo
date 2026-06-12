/**
 * Achievements: pure definitions + the pure logic that maps a game event to the
 * achievement ids it satisfies. Persistence and popups live in the render layer;
 * this file just describes WHAT exists and WHEN it's earned, so it's testable.
 *
 * Three families:
 *  - `floor-N`            — clear floor N's boss with any character (N = 1..MAX_FLOORS).
 *  - `char-<id>-floor5`   — clear floor 5's boss with a specific character.
 *  - `char-<id>-win`      — beat the game with a specific character.
 */

import { CHARACTERS } from './characters.js';
import { MAX_FLOORS } from './gameState.js';

export interface Achievement {
  id: string;
  name: string;
  description: string;
}

export const floorAchievementId = (floor: number): string => `floor-${floor}`;
export const charFloor5AchievementId = (characterId: string): string => `char-${characterId}-floor5`;
export const charWinAchievementId = (characterId: string): string => `char-${characterId}-win`;

/** The floor whose per-character "reached" achievement exists. */
export const MILESTONE_FLOOR = 5;

export const ACHIEVEMENTS: readonly Achievement[] = [
  ...Array.from({ length: MAX_FLOORS }, (_, i) => {
    const floor = i + 1;
    return {
      id: floorAchievementId(floor),
      name: `Étage ${floor} franchi`,
      description: `Vaincre le boss de l'étage ${floor}.`,
    };
  }),
  ...CHARACTERS.flatMap((c) => [
    {
      id: charFloor5AchievementId(c.id),
      name: `${c.name} — Étage ${MILESTONE_FLOOR}`,
      description: `Vaincre le boss de l'étage ${MILESTONE_FLOOR} avec ${c.name}.`,
    },
    {
      id: charWinAchievementId(c.id),
      name: `${c.name} — Jeu terminé`,
      description: `Terminer le jeu avec ${c.name}.`,
    },
  ]),
];

/** True if `id` is a "beat the game with character X" achievement. */
export const isWinAchievementId = (id: string): boolean =>
  id.startsWith('char-') && id.endsWith('-win');

/** Achievement ids earned by clearing `floor`'s boss as `characterId`. */
export function floorClearedAchievements(floor: number, characterId: string): string[] {
  const ids = [floorAchievementId(floor)];
  if (floor === MILESTONE_FLOOR) ids.push(charFloor5AchievementId(characterId));
  return ids;
}

/** Achievement ids earned by beating the game as `characterId`. */
export function gameWonAchievements(characterId: string): string[] {
  return [charWinAchievementId(characterId)];
}

/** Whether any "beat the game" achievement is present (unlocks win-gated characters). */
export function hasAnyWin(unlocked: Iterable<string>): boolean {
  for (const id of unlocked) if (isWinAchievementId(id)) return true;
  return false;
}
