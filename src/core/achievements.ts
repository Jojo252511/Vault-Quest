import data from "../data/achievements.json";
import { emptyDay } from "../defaults";
import type { DayStats, Progress, Totals } from "../types";
import { levelInfo } from "./levels";
import { dayKey } from "./text";

export type Rarity = "common" | "rare" | "epic" | "legendary";
export type Category = "writing" | "structure" | "tasks" | "level" | "streak" | "special";

export const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];
export const CATEGORIES: Category[] = ["writing", "structure", "tasks", "level", "streak", "special"];

/**
 * Declarative unlock condition, as written in src/data/achievements.json.
 * - total: lifetime counter `stat` reaches `min`
 * - day: a single day's `stat` reaches `min`
 * - level / streak: current level / best streak reaches `min`
 * - vaultNotes: number of notes currently in the vault reaches `min`
 * - allQuestsToday: every daily quest of the day is done
 */
export type Condition =
  | { type: "total"; stat: keyof Totals; min: number }
  | { type: "day"; stat: keyof Omit<DayStats, "xp">; min: number }
  | { type: "level"; min: number }
  | { type: "streak"; min: number }
  | { type: "vaultNotes"; min: number }
  | { type: "allQuestsToday" };

export interface LocalizedText {
  en: string;
  de: string;
}

/** One entry of src/data/achievements.json. */
export interface Achievement {
  id: string;
  category: Category;
  rarity: Rarity;
  /** Lucide icon name (Obsidian's built-in icon set). */
  icon: string;
  /** Extra XP granted on unlock (on medium difficulty). */
  reward: number;
  /** Plugin version that introduced the achievement. */
  added: string;
  condition: Condition;
  title: LocalizedText;
  description: LocalizedText;
}

export const ACHIEVEMENTS: Achievement[] = (data as { achievements: Achievement[] }).achievements;

/** Snapshot of everything a condition may look at. */
export interface AchievementContext {
  progress: Progress;
  level: number;
  /** Day being evaluated (today when live, the replayed day during imports). */
  dayKey: string;
  day: DayStats;
  noteCount: number;
}

export function evaluate(cond: Condition, c: AchievementContext): boolean {
  switch (cond.type) {
    case "total":
      return (c.progress.totals[cond.stat] ?? 0) >= cond.min;
    case "day":
      return (c.day[cond.stat] ?? 0) >= cond.min;
    case "level":
      return c.level >= cond.min;
    case "streak":
      return c.progress.streak.best >= cond.min;
    case "vaultNotes":
      return c.noteCount >= cond.min;
    case "allQuestsToday": {
      const q = c.progress.quests;
      return !!q && q.date === c.dayKey && q.ids.length > 0 && q.completed.length >= q.ids.length;
    }
    default:
      return false;
  }
}

export function buildContext(progress: Progress, noteCount: number, key: string = dayKey()): AchievementContext {
  return {
    progress,
    level: levelInfo(progress.xp).level,
    dayKey: key,
    day: progress.days[key] ?? emptyDay(),
    noteCount,
  };
}

/** Returns achievements whose condition is met but which are not unlocked yet. */
export function newlyEarned(ctx: AchievementContext): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !ctx.progress.unlocked[a.id] && evaluate(a.condition, ctx));
}
