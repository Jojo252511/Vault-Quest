import type { DayStats, QuestDay } from "../types";

export type QuestMetric = "words" | "tasks" | "notes" | "links" | "tags";

export interface QuestDef {
  id: string;
  metric: QuestMetric;
  target: number;
  reward: number;
  icon: string;
}

export const QUEST_POOL: QuestDef[] = [
  { id: "words_200", metric: "words", target: 200, reward: 30, icon: "pen-line" },
  { id: "words_500", metric: "words", target: 500, reward: 60, icon: "pen-line" },
  { id: "words_1000", metric: "words", target: 1000, reward: 120, icon: "flame" },
  { id: "tasks_3", metric: "tasks", target: 3, reward: 30, icon: "check-square" },
  { id: "tasks_5", metric: "tasks", target: 5, reward: 50, icon: "list-checks" },
  { id: "notes_1", metric: "notes", target: 1, reward: 20, icon: "file-plus" },
  { id: "notes_3", metric: "notes", target: 3, reward: 50, icon: "files" },
  { id: "links_3", metric: "links", target: 3, reward: 30, icon: "link" },
  { id: "links_5", metric: "links", target: 5, reward: 50, icon: "network" },
  { id: "tags_2", metric: "tags", target: 2, reward: 20, icon: "tag" },
];

export function questById(id: string): QuestDef | undefined {
  return QUEST_POOL.find((q) => q.id === id);
}

/** Small deterministic PRNG so every date always yields the same quests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Picks `count` quests for a date, at most one per metric. */
export function pickQuests(date: string, count: number, base?: DayStats): QuestDay {
  const rand = mulberry32(hash(date));
  const shuffled = [...QUEST_POOL]
    .map((q) => ({ q, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.q);
  const ids: string[] = [];
  const usedMetrics = new Set<QuestMetric>();
  for (const q of shuffled) {
    if (ids.length >= count) break;
    if (usedMetrics.has(q.metric)) continue;
    usedMetrics.add(q.metric);
    ids.push(q.id);
  }
  return { date, ids, completed: [], base: base ? { ...base } : undefined };
}

export function questValue(q: QuestDef, day: DayStats | undefined, base?: Partial<DayStats>): number {
  if (!day) return 0;
  return Math.max(0, day[q.metric] - (base?.[q.metric] ?? 0));
}

/** Returns quests that are now fulfilled but not yet marked completed. */
export function newlyCompleted(quests: QuestDay, day: DayStats | undefined): QuestDef[] {
  const result: QuestDef[] = [];
  for (const id of quests.ids) {
    if (quests.completed.includes(id)) continue;
    const q = questById(id);
    if (q && questValue(q, day, quests.base) >= q.target) result.push(q);
  }
  return result;
}
