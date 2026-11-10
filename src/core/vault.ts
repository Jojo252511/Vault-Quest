/**
 * Facts about the vault's structure. Achievements use them with
 * { "type": "vault", "stat": "<key>", "min": n }. They describe the vault as it is now,
 * so these achievements have no historic date.
 */
export const VAULT_STATS = [
  "notes",
  "folders",
  "maxSubfolders",
  "maxFolderDepth",
  "maxNotesInFolder",
  "attachments",
  "images",
  "pdfs",
  "canvases",
  "bases",
  "drawings",
] as const;

export type VaultStat = (typeof VAULT_STATS)[number];
export type VaultStats = Record<VaultStat, number>;

export interface VaultEntry {
  path: string;
  isFolder: boolean;
}

export function emptyVaultStats(): VaultStats {
  return Object.fromEntries(VAULT_STATS.map((k) => [k, 0])) as VaultStats;
}

function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** Computes the stats from a flat list of files and folders (root excluded). */
export function computeVaultStats(entries: VaultEntry[]): VaultStats {
  const s = emptyVaultStats();
  const subfolders = new Map<string, number>();
  const notesIn = new Map<string, number>();
  for (const e of entries) {
    if (!e.path) continue;
    const parent = parentOf(e.path);
    const lower = e.path.toLowerCase();
    if (e.isFolder) {
      s.folders++;
      s.maxFolderDepth = Math.max(s.maxFolderDepth, e.path.split("/").length);
      if (parent) subfolders.set(parent, (subfolders.get(parent) ?? 0) + 1);
      continue;
    }
    if (lower.endsWith(".excalidraw.md") || lower.endsWith(".excalidraw")) s.drawings++;
    if (lower.endsWith(".md")) {
      s.notes++;
      if (parent) notesIn.set(parent, (notesIn.get(parent) ?? 0) + 1);
    } else if (lower.endsWith(".canvas")) s.canvases++;
    else if (lower.endsWith(".base")) s.bases++;
    else {
      s.attachments++;
      if (/\.(png|jpe?g|gif|webp|svg|bmp|avif|heic)$/.test(lower)) s.images++;
      else if (lower.endsWith(".pdf")) s.pdfs++;
    }
  }
  s.maxSubfolders = Math.max(0, ...subfolders.values());
  s.maxNotesInFolder = Math.max(0, ...notesIn.values());
  return s;
}
