import type { DayStats, Progress, XpRules } from "../types";
import { emptyDay, emptyProgress } from "../defaults";
import { ACHIEVEMENTS, type AchievementContext } from "./achievements";
import { levelInfo } from "./levels";
import { markStreakDay } from "./streak";
import { analyze, dayKey } from "./text";

export interface ScannedNote {
  path: string;
  text: string;
  /** File creation time (ms), used when no better date is known. */
  ctime: number;
}

export interface ImportResult {
  notes: number;
  words: number;
  xpGained: number;
  unlocked: string[];
  levelBefore: number;
  levelAfter: number;
}

const ISO_DAY = /(\d{4})-(\d{2})-(\d{2})/;

function validDay(match: RegExpMatchArray | null | undefined): string | null {
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) return null;
  return `${y}-${m}-${d}`;
}

/**
 * Best guess for the day a note was written:
 * frontmatter `date`/`created` > a date in the file name > file creation time.
 * Dates in the future are clamped to today.
 */
export function noteDay(note: ScannedNote, today: string = dayKey()): string {
  const fm = note.text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  const fromFm = fm ? validDay(fm.match(/^(?:date|created|erstellt)\s*:\s*["']?(\d{4})-(\d{2})-(\d{2})/m)) : null;
  const base = note.path.split("/").pop() ?? note.path;
  const day = fromFm ?? validDay(base.match(ISO_DAY)) ?? dayKey(new Date(note.ctime));
  return day > today ? today : day;
}

export function isExcluded(path: string, excluded: string[]): boolean {
  return excluded.some((folder) => {
    const f = folder.trim().replace(/^\/+|\/+$/g, "");
    return f.length > 0 && (path === f || path.startsWith(f + "/"));
  });
}

function xpOf(day: DayStats, rules: XpRules): number {
  return (
    day.words * rules.perWord +
    day.notes * rules.perNote +
    day.links * rules.perLink +
    day.tags * rules.perTag +
    day.tasks * rules.perTask
  );
}

/** Noon of a YYYY-MM-DD day, used as the retroactive unlock time. */
function dayTimestamp(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

/**
 * Imports existing vault content into `progress` (mutates it).
 * Days are replayed in chronological order so that achievements, levels and streaks
 * get the date on which they would have been earned.
 */
export function importVault(
  progress: Progress,
  notes: ScannedNote[],
  folderCount: number,
  rules: XpRules,
  streakMinWords: number,
  today: string = dayKey(),
  xpFactor = 1,
): ImportResult {
  const levelBefore = levelInfo(progress.xp).level;

  // 1. aggregate per day
  const days = new Map<string, DayStats>();
  let words = 0;
  for (const note of notes) {
    const key = noteDay(note, today);
    const c = analyze(note.text);
    const day = days.get(key) ?? emptyDay();
    day.words += c.words;
    day.notes += 1;
    day.links += c.links;
    day.tags += c.tags;
    day.tasks += c.tasks;
    days.set(key, day);
    words += c.words;
  }
  const factor = Math.min(Math.max(xpFactor, 0), 1);
  for (const day of days.values()) day.xp = Math.round(xpOf(day, rules) * factor);

  // 2. replay chronologically on a fresh simulation
  const sim = emptyProgress();
  const unlockedAt: Record<string, number> = {};
  let noteCount = 0;
  const check = (dayStats: DayStats, key: string, folders: number) => {
    const ctx: AchievementContext = {
      progress: sim,
      level: levelInfo(sim.xp).level,
      todayWords: dayStats.words,
      noteCount,
      folderCount: folders,
    };
    // loop because achievement rewards can lift the level and unlock level achievements
    for (let guard = 0; guard < 10; guard++) {
      let any = false;
      for (const a of ACHIEVEMENTS) {
        if (sim.unlocked[a.id] || !a.check(ctx)) continue;
        sim.unlocked[a.id] = dayTimestamp(key);
        unlockedAt[a.id] = sim.unlocked[a.id];
        sim.xp += Math.round(a.reward * rules.rewardFactor);
        any = true;
      }
      if (!any) break;
      ctx.level = levelInfo(sim.xp).level;
    }
  };

  for (const key of [...days.keys()].sort()) {
    const day = days.get(key)!;
    sim.xp += day.xp;
    sim.totals.words += day.words;
    sim.totals.notesCreated += day.notes;
    sim.totals.links += day.links;
    sim.totals.tags += day.tags;
    sim.totals.tasks += day.tasks;
    noteCount += day.notes;
    if (day.words >= streakMinWords) markStreakDay(sim.streak, key);
    check(day, key, 0);
  }
  // folders have no reliable date, they count from today
  sim.totals.foldersCreated += folderCount;
  check(days.get(today) ?? emptyDay(), today, folderCount);

  // 3. merge into the real progress
  progress.xp += sim.xp;
  for (const k of Object.keys(sim.totals) as (keyof typeof sim.totals)[]) progress.totals[k] += sim.totals[k];
  for (const [key, day] of days) {
    const existing = progress.days[key] ?? emptyDay();
    for (const k of Object.keys(day) as (keyof DayStats)[]) existing[k] += day[k];
    progress.days[key] = existing;
  }
  const newUnlocks: string[] = [];
  for (const [id, ts] of Object.entries(unlockedAt)) {
    if (!progress.unlocked[id] || progress.unlocked[id] > ts) {
      if (!progress.unlocked[id]) newUnlocks.push(id);
      progress.unlocked[id] = ts;
    }
  }
  if (!progress.streak.lastDay || (sim.streak.lastDay && sim.streak.lastDay >= progress.streak.lastDay)) {
    progress.streak = { ...sim.streak, best: Math.max(sim.streak.best, progress.streak.best) };
  } else {
    progress.streak.best = Math.max(progress.streak.best, sim.streak.best);
  }
  progress.importedAt = Date.now();
  progress.knownAchievements = ACHIEVEMENTS.map((a) => a.id);

  return {
    notes: notes.length,
    words,
    xpGained: sim.xp,
    unlocked: newUnlocks,
    levelBefore,
    levelAfter: levelInfo(progress.xp).level,
  };
}

/** Achievements added by an update since progress was last evaluated. */
export function unknownAchievements(progress: Progress): string[] {
  if (!progress.knownAchievements) return [];
  const known = new Set(progress.knownAchievements);
  return ACHIEVEMENTS.filter((a) => !known.has(a.id) && !progress.unlocked[a.id]).map((a) => a.id);
}

/**
 * Checks the given achievements retroactively against the stored day statistics (mutates `progress`).
 * Each one gets the date on which it would have been earned; only its reward is added as XP.
 * Counters without per-day history (folders, quests, night/early writing) are checked against
 * today's totals.
 */
export function backfillAchievements(
  progress: Progress,
  ids: string[],
  rules: XpRules,
  streakMinWords: number,
  noteCount: number,
  today: string = dayKey(),
): string[] {
  const targets = ACHIEVEMENTS.filter((a) => ids.includes(a.id) && !progress.unlocked[a.id]);
  const unlocked: string[] = [];
  if (targets.length > 0) {
    const sim = emptyProgress();
    let notes = 0;
    const check = (ctx: AchievementContext, ts: number) => {
      for (const a of targets) {
        if (progress.unlocked[a.id] || !a.check(ctx)) continue;
        progress.unlocked[a.id] = ts;
        progress.xp += Math.round(a.reward * rules.rewardFactor);
        unlocked.push(a.id);
      }
    };

    for (const key of Object.keys(progress.days).sort()) {
      if (key > today) continue;
      const day = progress.days[key];
      sim.xp += day.xp;
      sim.totals.words += day.words;
      sim.totals.notesCreated += day.notes;
      sim.totals.links += day.links;
      sim.totals.tags += day.tags;
      sim.totals.tasks += day.tasks;
      notes += day.notes;
      if (day.words >= streakMinWords) markStreakDay(sim.streak, key);
      check(
        { progress: sim, level: levelInfo(sim.xp).level, todayWords: day.words, noteCount: notes, folderCount: 0 },
        dayTimestamp(key),
      );
    }
    // everything without history, against the real current state
    check(
      {
        progress,
        level: levelInfo(progress.xp).level,
        todayWords: progress.days[today]?.words ?? 0,
        noteCount,
        folderCount: progress.totals.foldersCreated,
      },
      Date.now(),
    );
  }
  progress.knownAchievements = ACHIEVEMENTS.map((a) => a.id);
  return unlocked;
}
