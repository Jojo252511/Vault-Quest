import type { Progress } from "../types";
import { levelInfo } from "./levels";
import { dayKey } from "./text";

export type Rarity = "common" | "rare" | "epic" | "legendary";
export type Category = "writing" | "structure" | "tasks" | "level" | "streak" | "special";

/** Snapshot of everything an achievement may check. */
export interface AchievementContext {
  progress: Progress;
  level: number;
  todayWords: number;
  noteCount: number;
  folderCount: number;
}

export interface Achievement {
  id: string;
  /** Lucide icon name (Obsidian's built-in icon set). */
  icon: string;
  rarity: Rarity;
  category: Category;
  /** Extra XP granted on unlock. */
  reward: number;
  check: (c: AchievementContext) => boolean;
}

const t = (c: AchievementContext) => c.progress.totals;

export const ACHIEVEMENTS: Achievement[] = [
  // writing
  { id: "first_words", icon: "pencil", rarity: "common", category: "writing", reward: 10, check: (c) => t(c).words >= 1 },
  { id: "words_day_500", icon: "pen-line", rarity: "common", category: "writing", reward: 25, check: (c) => c.todayWords >= 500 },
  { id: "words_day_2000", icon: "flame", rarity: "rare", category: "writing", reward: 100, check: (c) => c.todayWords >= 2000 },
  { id: "words_10k", icon: "scroll-text", rarity: "rare", category: "writing", reward: 100, check: (c) => t(c).words >= 10_000 },
  { id: "words_100k", icon: "library", rarity: "legendary", category: "writing", reward: 1000, check: (c) => t(c).words >= 100_000 },

  // structure
  { id: "first_note", icon: "file-plus", rarity: "common", category: "structure", reward: 10, check: (c) => t(c).notesCreated >= 1 },
  { id: "first_folder", icon: "folder-plus", rarity: "common", category: "structure", reward: 10, check: (c) => t(c).foldersCreated >= 1 },
  { id: "first_link", icon: "link", rarity: "common", category: "structure", reward: 10, check: (c) => t(c).links >= 1 },
  { id: "links_100", icon: "network", rarity: "rare", category: "structure", reward: 100, check: (c) => t(c).links >= 100 },
  { id: "first_tag", icon: "tag", rarity: "common", category: "structure", reward: 10, check: (c) => t(c).tags >= 1 },
  { id: "notes_100", icon: "book-open", rarity: "rare", category: "structure", reward: 50, check: (c) => c.noteCount >= 100 },
  { id: "notes_1000", icon: "landmark", rarity: "epic", category: "structure", reward: 250, check: (c) => c.noteCount >= 1000 },

  // tasks
  { id: "first_task", icon: "check-square", rarity: "common", category: "tasks", reward: 10, check: (c) => t(c).tasks >= 1 },
  { id: "tasks_100", icon: "list-checks", rarity: "rare", category: "tasks", reward: 100, check: (c) => t(c).tasks >= 100 },
  { id: "tasks_1000", icon: "trophy", rarity: "epic", category: "tasks", reward: 500, check: (c) => t(c).tasks >= 1000 },

  // level
  { id: "level_5", icon: "star", rarity: "common", category: "level", reward: 0, check: (c) => c.level >= 5 },
  { id: "level_10", icon: "sparkles", rarity: "rare", category: "level", reward: 0, check: (c) => c.level >= 10 },
  { id: "level_25", icon: "gem", rarity: "epic", category: "level", reward: 0, check: (c) => c.level >= 25 },
  { id: "level_50", icon: "crown", rarity: "legendary", category: "level", reward: 0, check: (c) => c.level >= 50 },

  // streak
  { id: "streak_3", icon: "calendar-check", rarity: "common", category: "streak", reward: 30, check: (c) => c.progress.streak.best >= 3 },
  { id: "streak_7", icon: "calendar-range", rarity: "rare", category: "streak", reward: 100, check: (c) => c.progress.streak.best >= 7 },
  { id: "streak_30", icon: "calendar-heart", rarity: "epic", category: "streak", reward: 500, check: (c) => c.progress.streak.best >= 30 },

  // special
  { id: "night_owl", icon: "moon", rarity: "rare", category: "special", reward: 25, check: (c) => t(c).nightWords > 0 },
  { id: "early_bird", icon: "sunrise", rarity: "rare", category: "special", reward: 25, check: (c) => t(c).earlyWords > 0 },
  { id: "first_quest", icon: "target", rarity: "common", category: "special", reward: 10, check: (c) => t(c).questsCompleted >= 1 },
  {
    id: "quest_day",
    icon: "medal",
    rarity: "rare",
    category: "special",
    reward: 50,
    check: (c) => {
      const q = c.progress.quests;
      return !!q && q.date === dayKey() && q.ids.length > 0 && q.completed.length >= q.ids.length;
    },
  },
  { id: "quests_50", icon: "swords", rarity: "epic", category: "special", reward: 250, check: (c) => t(c).questsCompleted >= 50 },
];

export const RARITY_ORDER: Rarity[] = ["common", "rare", "epic", "legendary"];

export function buildContext(progress: Progress, noteCount: number, folderCount: number): AchievementContext {
  const today = progress.days[dayKey()];
  return {
    progress,
    level: levelInfo(progress.xp).level,
    todayWords: today?.words ?? 0,
    noteCount,
    folderCount,
  };
}

/** Returns achievements whose condition is met but which are not unlocked yet. */
export function newlyEarned(ctx: AchievementContext): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !ctx.progress.unlocked[a.id] && a.check(ctx));
}
