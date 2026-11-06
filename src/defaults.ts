import { IMPORT_XP_STEPS, isDifficulty } from "./core/difficulty";
import type { DayStats, Progress, Settings, Totals } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  language: "auto",
  difficulty: "medium",
  showStatusBar: true,
  showToasts: true,
  questsEnabled: true,
  questsPerDay: 3,
  importXpPercent: 25,
  excludedFolders: ["Clippings"],
  sounds: true,
  volume: 0.5,
  soundXp: true,
  soundLevelUp: true,
  soundAchievement: true,
};

export function emptyTotals(): Totals {
  return {
    words: 0,
    notesCreated: 0,
    foldersCreated: 0,
    links: 0,
    tags: 0,
    tasks: 0,
    questsCompleted: 0,
    nightWords: 0,
    earlyWords: 0,
  };
}

export function emptyDay(): DayStats {
  return { words: 0, xp: 0, notes: 0, links: 0, tags: 0, tasks: 0 };
}

export function emptyProgress(): Progress {
  return {
    xp: 0,
    unlocked: {},
    totals: emptyTotals(),
    days: {},
    streak: { current: 0, best: 0, lastDay: null },
    quests: null,
    importedAt: null,
    knownAchievements: null,
  };
}

/** Merge stored settings with defaults so new fields survive plugin updates. */
export function mergeSettings(raw: unknown): Settings {
  const stored = (raw ?? {}) as Partial<Settings> & Record<string, unknown>;
  // fields from v0.1 that are now set by the difficulty
  const { xp: _xp, streakMinWords: _streak, ...rest } = stored;
  const settings: Settings = { ...DEFAULT_SETTINGS, ...rest };
  if (!isDifficulty(settings.difficulty)) settings.difficulty = DEFAULT_SETTINGS.difficulty;
  if (!(IMPORT_XP_STEPS as readonly number[]).includes(settings.importXpPercent)) {
    // snap free values from v0.1 to the nearest allowed step
    const v = Number(settings.importXpPercent) || 0;
    settings.importXpPercent = IMPORT_XP_STEPS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  }
  settings.excludedFolders = Array.isArray(stored.excludedFolders)
    ? stored.excludedFolders
    : [...DEFAULT_SETTINGS.excludedFolders];
  return settings;
}

/** Merge stored progress with defaults so new fields survive plugin updates. */
export function mergeProgress(raw: unknown): Progress {
  const base = emptyProgress();
  const p = (raw ?? {}) as Partial<Progress>;
  return {
    xp: p.xp ?? 0,
    unlocked: p.unlocked ?? {},
    totals: { ...base.totals, ...(p.totals ?? {}) },
    days: p.days ?? {},
    streak: { ...base.streak, ...(p.streak ?? {}) },
    quests: p.quests ?? null,
    importedAt: p.importedAt ?? null,
    knownAchievements: Array.isArray(p.knownAchievements) ? p.knownAchievements : null,
  };
}
