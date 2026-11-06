import type { Streak } from "../types";
import { addDays } from "./text";

/**
 * Registers that the streak goal was met on `today`. Returns true if the streak changed.
 */
export function markStreakDay(streak: Streak, today: string): boolean {
  if (streak.lastDay === today) return false;
  streak.current = streak.lastDay === addDays(today, -1) ? streak.current + 1 : 1;
  streak.best = Math.max(streak.best, streak.current);
  streak.lastDay = today;
  return true;
}

/** Current streak as shown to the user: 0 if neither today nor yesterday counted. */
export function displayedStreak(streak: Streak, today: string): number {
  if (streak.lastDay === today || streak.lastDay === addDays(today, -1)) return streak.current;
  return 0;
}
