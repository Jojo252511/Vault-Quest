import type { DayStats, Progress, XpRules } from "../types";
import { emptyDay, emptyProgress } from "../defaults";
import { ACHIEVEMENTS, evaluate, type AchievementContext } from "./achievements";
import { FEATURES, addFeatures, type FeatureCounts } from "./features";
import { levelInfo } from "./levels";
import { emptyVaultStats, type VaultStats } from "./vault";
import { markStreakDay } from "./streak";
import { analyze, dailyNoteDate, dayKey } from "./text";

export interface ScannedNote {
  path: string;
  text: string;
  /** File creation time (ms), used when no better date is known. */
  ctime: number;
  /**
   * Date of the note if it is a daily note (YYYY-MM-DD), null if it is none. When missing,
   * notes named YYYY-MM-DD.md anywhere in the vault count as daily notes.
   */
  dailyDate?: string | null;
}

function dailyDateOf(note: ScannedNote): string | null {
  return note.dailyDate !== undefined ? note.dailyDate : dailyNoteDate(note.path);
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
 * daily note date > frontmatter `date`/`created` > a date in the file name > file creation time.
 * Dates in the future are skipped (e.g. notes prepared in advance), so such a note falls back to
 * the next candidate, at the latest its creation time.
 */
export function noteDay(note: ScannedNote, today: string = dayKey()): string {
  const fm = note.text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  const fromFm = fm ? validDay(fm.match(/^(?:date|created|erstellt)\s*:\s*["']?(\d{4})-(\d{2})-(\d{2})/m)) : null;
  const base = note.path.split("/").pop() ?? note.path;
  for (const candidate of [dailyDateOf(note), fromFm, validDay(base.match(ISO_DAY))]) {
    if (candidate && candidate <= today) return candidate;
  }
  const created = dayKey(new Date(note.ctime));
  return created > today ? today : created;
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

/** Per-note facts that are maxima or counts rather than sums of words. */
interface DayMeta {
  longestNote: number;
  maxLinksInNote: number;
  dailyNotes: number;
  features: Partial<FeatureCounts>;
}

/** Groups the per-note facts by the day each note is attributed to. */
export function collectNoteMeta(notes: ScannedNote[], today: string = dayKey()): Map<string, DayMeta> {
  const meta = new Map<string, DayMeta>();
  for (const note of notes) {
    const key = noteDay(note, today);
    const c = analyze(note.text);
    const m = meta.get(key) ?? { longestNote: 0, maxLinksInNote: 0, dailyNotes: 0, features: {} };
    addFeatures(m.features, c.features);
    m.longestNote = Math.max(m.longestNote, c.words);
    m.maxLinksInNote = Math.max(m.maxLinksInNote, c.links);
    if (dailyDateOf(note)) m.dailyNotes++;
    meta.set(key, m);
  }
  return meta;
}

function applyMeta(target: Progress, m: DayMeta | undefined): void {
  if (!m) return;
  const totals = target.totals;
  addFeatures(target.features, m.features);
  totals.longestNote = Math.max(totals.longestNote, m.longestNote);
  totals.maxLinksInNote = Math.max(totals.maxLinksInNote, m.maxLinksInNote);
  totals.dailyNotes += m.dailyNotes;
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
  vault: VaultStats = emptyVaultStats(),
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
  const meta = collectNoteMeta(notes, today);
  const factor = Math.min(Math.max(xpFactor, 0), 1);
  for (const day of days.values()) day.xp = Math.round(xpOf(day, rules) * factor);

  // 2. replay chronologically on a fresh simulation
  const sim = emptyProgress();
  const unlockedAt: Record<string, number> = {};
  let noteCount = 0;
  const check = (dayStats: DayStats, key: string, vaultNow: VaultStats = emptyVaultStats()) => {
    const ctx: AchievementContext = {
      progress: sim,
      level: levelInfo(sim.xp).level,
      dayKey: key,
      day: dayStats,
      noteCount,
      vault: vaultNow,
    };
    // loop because achievement rewards can lift the level and unlock level achievements
    for (let guard = 0; guard < 10; guard++) {
      let any = false;
      for (const a of ACHIEVEMENTS) {
        if (sim.unlocked[a.id] || !evaluate(a.condition, ctx)) continue;
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
    sim.days[key] = day;
    applyMeta(sim, meta.get(key));
    sim.xp += day.xp;
    sim.totals.words += day.words;
    sim.totals.notesCreated += day.notes;
    sim.totals.links += day.links;
    sim.totals.tags += day.tags;
    sim.totals.tasks += day.tasks;
    noteCount += day.notes;
    if (day.words >= streakMinWords) markStreakDay(sim.streak, key);
    check(day, key);
  }
  // folders have no reliable date, they count from today
  sim.totals.foldersCreated += folderCount;
  check(days.get(today) ?? emptyDay(), today, vault);

  // 3. merge into the real progress
  progress.xp += sim.xp;
  for (const k of Object.keys(sim.totals) as (keyof typeof sim.totals)[]) {
    if (k === "longestNote" || k === "maxLinksInNote") progress.totals[k] = Math.max(progress.totals[k], sim.totals[k]);
    else progress.totals[k] += sim.totals[k];
  }
  addFeatures(progress.features, sim.features);
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
 * today's totals. If `notes` is given, per-note facts that older versions did not record
 * (longest note, links per note, daily notes) are taken from the vault and dated as well.
 */
export function backfillAchievements(
  progress: Progress,
  ids: string[],
  rules: XpRules,
  streakMinWords: number,
  vault: VaultStats,
  today: string = dayKey(),
  notes?: ScannedNote[],
): string[] {
  const meta = notes ? collectNoteMeta(notes, today) : new Map<string, DayMeta>();
  if (notes) {
    // stats introduced after the import: take them from the vault as it is now
    const scanned = emptyProgress();
    for (const m of meta.values()) applyMeta(scanned, m);
    const t = progress.totals;
    t.longestNote = Math.max(t.longestNote, scanned.totals.longestNote);
    t.maxLinksInNote = Math.max(t.maxLinksInNote, scanned.totals.maxLinksInNote);
    t.dailyNotes = Math.max(t.dailyNotes, scanned.totals.dailyNotes);
    for (const k of FEATURES) {
      const v = Math.max(progress.features[k] ?? 0, scanned.features[k] ?? 0);
      if (v > 0) progress.features[k] = v;
    }
  }
  const targets = ACHIEVEMENTS.filter((a) => ids.includes(a.id) && !progress.unlocked[a.id]);
  const unlocked: string[] = [];
  if (targets.length > 0) {
    const sim = emptyProgress();
    let notes = 0;
    const check = (ctx: AchievementContext, ts: number) => {
      for (const a of targets) {
        if (progress.unlocked[a.id] || !evaluate(a.condition, ctx)) continue;
        progress.unlocked[a.id] = ts;
        progress.xp += Math.round(a.reward * rules.rewardFactor);
        unlocked.push(a.id);
      }
    };

    for (const key of Object.keys(progress.days).sort()) {
      if (key > today) continue;
      const day = progress.days[key];
      sim.days[key] = day;
      applyMeta(sim, meta.get(key));
      sim.xp += day.xp;
      sim.totals.words += day.words;
      sim.totals.notesCreated += day.notes;
      sim.totals.links += day.links;
      sim.totals.tags += day.tags;
      sim.totals.tasks += day.tasks;
      notes += day.notes;
      if (day.words >= streakMinWords) markStreakDay(sim.streak, key);
      check(
        { progress: sim, level: levelInfo(sim.xp).level, dayKey: key, day, noteCount: notes, vault: emptyVaultStats() },
        dayTimestamp(key),
      );
    }
    // everything without history, against the real current state
    check(
      {
        progress,
        level: levelInfo(progress.xp).level,
        dayKey: today,
        day: progress.days[today] ?? emptyDay(),
        noteCount: vault.notes,
        vault,
      },
      Date.now(),
    );
  }
  progress.knownAchievements = ACHIEVEMENTS.map((a) => a.id);
  return unlocked;
}
