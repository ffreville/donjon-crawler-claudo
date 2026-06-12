/**
 * Achievement persistence (render-side). Unlocked ids are saved to localStorage
 * so they survive across runs and sessions. Core (achievements.ts) owns the
 * definitions and the event→ids logic; this just records what's been earned.
 */

import { ACHIEVEMENTS, hasAnyWin } from '../core/index.js';

const STORAGE_KEY = 'donjon-achievements';
const VALID_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));

let unlocked: Set<string> | null = null;

function load(): Set<string> {
  if (unlocked) return unlocked;
  unlocked = new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) for (const id of JSON.parse(raw) as string[]) if (VALID_IDS.has(id)) unlocked.add(id);
  } catch {
    // ignore storage/parse errors — start with none
  }
  return unlocked;
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...load()]));
  } catch {
    // ignore (e.g. storage disabled)
  }
}

export function isAchievementUnlocked(id: string): boolean {
  return load().has(id);
}

/** Records an achievement; returns true only if it was newly unlocked. */
export function unlockAchievement(id: string): boolean {
  const set = load();
  if (set.has(id) || !VALID_IDS.has(id)) return false;
  set.add(id);
  persist();
  return true;
}

export function unlockedAchievements(): ReadonlySet<string> {
  return load();
}

/** True once any character has beaten the game (gates the Tinker). */
export function hasBeatenGame(): boolean {
  return hasAnyWin(load());
}
