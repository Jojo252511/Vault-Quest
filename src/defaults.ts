import type { DayStats, Progress, Settings, Totals } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  language: "auto",
  xp: {
    perWord: 1,
    perNote: 10,
    perLink: 5,
    perTag: 3,
    perTask: 5,
    maxPerEdit: 150,
  },
  showStatusBar: true,
  showToasts: true,
  questsEnabled: true,
  questsPerDay: 3,
  streakMinWords: 50,
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
  };
}

/** Merge stored settings with defaults so new fields survive plugin updates. */
export function mergeSettings(raw: unknown): Settings {
  const stored = (raw ?? {}) as Partial<Settings>;
  const settings: Settings = { ...DEFAULT_SETTINGS, ...stored };
  settings.xp = { ...DEFAULT_SETTINGS.xp, ...(stored.xp ?? {}) };
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
  };
}
