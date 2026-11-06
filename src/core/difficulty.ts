import type { Difficulty, XpRules } from "../types";

export interface DifficultyPreset {
  /** Multiplier for every XP source, including quest and achievement rewards. */
  multiplier: number;
  /** Words needed on a day to keep the streak alive. */
  streakMinWords: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyPreset> = {
  easy: { multiplier: 2, streakMinWords: 25 },
  medium: { multiplier: 1, streakMinWords: 50 },
  hard: { multiplier: 0.75, streakMinWords: 100 },
  veryHard: { multiplier: 0.5, streakMinWords: 200 },
  hardcore: { multiplier: 0.25, streakMinWords: 300 },
};

export const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard", "veryHard", "hardcore"];

/** Base values on "medium". */
const BASE: Omit<XpRules, "rewardFactor"> = {
  perWord: 1,
  perNote: 10,
  perLink: 5,
  perTag: 3,
  perTask: 5,
  maxPerEdit: 150,
};

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === "string" && value in DIFFICULTIES;
}

export function xpRules(difficulty: Difficulty): XpRules {
  const m = DIFFICULTIES[difficulty].multiplier;
  return {
    perWord: BASE.perWord * m,
    perNote: BASE.perNote * m,
    perLink: BASE.perLink * m,
    perTag: BASE.perTag * m,
    perTask: BASE.perTask * m,
    maxPerEdit: BASE.maxPerEdit * m,
    rewardFactor: m,
  };
}

export function streakMinWords(difficulty: Difficulty): number {
  return DIFFICULTIES[difficulty].streakMinWords;
}

/** Quest and achievement rewards scaled to the difficulty, rounded to whole XP. */
export function scaledReward(reward: number, difficulty: Difficulty): number {
  return Math.round(reward * DIFFICULTIES[difficulty].multiplier);
}

/** Pasted text only counts up to this many words per edit, on every difficulty. */
export const MAX_WORDS_PER_EDIT = 150;

/** Allowed values for the share of XP that existing content earns on import. */
export const IMPORT_XP_STEPS = [0, 10, 25, 50, 100] as const;
