import type { FeatureCounts } from "./core/features";

export type Language = "auto" | "en" | "de";

export type Difficulty = "easy" | "medium" | "hard" | "veryHard" | "hardcore";

export interface XpRules {
  perWord: number;
  perNote: number;
  perLink: number;
  perTag: number;
  perTask: number;
  /** Upper bound of XP that a single edit burst can award (guards against pastes). */
  maxPerEdit: number;
  /** Factor for quest and achievement rewards. */
  rewardFactor: number;
}

export interface Settings {
  language: Language;
  /** Sets all XP values and the streak threshold, see core/difficulty.ts. */
  difficulty: Difficulty;
  showStatusBar: boolean;
  showToasts: boolean;
  questsEnabled: boolean;
  questsPerDay: number;
  /** Share of XP (0-100 %) that existing content earns on the retroactive import. */
  importXpPercent: number;
  /** Folder paths (and their subfolders) that are ignored completely. */
  excludedFolders: string[];
  sounds: boolean;
  volume: number;
  soundXp: boolean;
  soundLevelUp: boolean;
  soundAchievement: boolean;
}

/** Lifetime counters. */
export interface Totals {
  words: number;
  notesCreated: number;
  foldersCreated: number;
  links: number;
  tags: number;
  tasks: number;
  questsCompleted: number;
  nightWords: number;
  earlyWords: number;
  /** Words in the longest note ever written or imported. */
  longestNote: number;
  /** Most links in a single note. */
  maxLinksInNote: number;
  /** Notes named YYYY-MM-DD.md. */
  dailyNotes: number;
  /** Days on which every daily quest was completed. */
  questDays: number;
}

export interface DayStats {
  words: number;
  xp: number;
  notes: number;
  links: number;
  tags: number;
  tasks: number;
}

export interface QuestDay {
  date: string;
  ids: string[];
  completed: string[];
  /** Day stats at the moment the quests were issued; quests only count what happens afterwards. */
  base?: Partial<DayStats>;
}

export interface Streak {
  current: number;
  best: number;
  /** Last day (YYYY-MM-DD) on which the streak goal was met. */
  lastDay: string | null;
}

export interface Progress {
  xp: number;
  /** achievement id -> unlock timestamp (ms) */
  unlocked: Record<string, number>;
  totals: Totals;
  /** YYYY-MM-DD -> stats */
  days: Record<string, DayStats>;
  streak: Streak;
  quests: QuestDay | null;
  /** When existing vault content was imported (ms), null = not yet. */
  importedAt: number | null;
  /**
   * Achievement ids that existed when progress was last evaluated. Achievements added by a
   * plugin update are missing here and get checked retroactively on the next start.
   */
  knownAchievements: string[] | null;
  /** Lifetime counts of Markdown features added to notes (images, code blocks, ...). */
  features: Partial<FeatureCounts>;
}

/** Shape of data.json: settings in plain text, progress sealed (see core/store.ts). */
export interface StoredData {
  settings: Settings;
  progress: string;
}

/** Things that can earn XP while editing a note. */
export interface NoteCounts {
  words: number;
  links: number;
  tags: number;
  tasks: number;
  features: FeatureCounts;
}
