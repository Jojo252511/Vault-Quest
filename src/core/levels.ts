/**
 * Total XP needed to reach a level.
 * Quadratic curve: level 1 = 200 XP, level 10 = 11,000 XP, level 25 = 65,000 XP, level 50 = 255,000 XP.
 */
export function xpForLevel(level: number): number {
  if (level <= 0) return 0;
  return 100 * level * (level + 1);
}

export interface LevelInfo {
  level: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level spans. */
  needed: number;
  /** 0..1 */
  progress: number;
}

export function levelInfo(xp: number): LevelInfo {
  let level = 0;
  while (xpForLevel(level + 1) <= xp) level++;
  const base = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const into = xp - base;
  const needed = next - base;
  return { level, into, needed, progress: needed > 0 ? into / needed : 0 };
}
