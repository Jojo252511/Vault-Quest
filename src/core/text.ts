import type { NoteCounts } from "../types";
import { countFeatures } from "./features";

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
const FENCED_CODE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g;
const COMMENT = /%%[\s\S]*?%%/g;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** Remove parts of a note that should never count as written words. */
export function stripNonProse(text: string): string {
  return text
    .replace(FRONTMATTER, "")
    .replace(FENCED_CODE, " ")
    .replace(COMMENT, " ")
    .replace(HTML_COMMENT, " ");
}

/** Counts words (any run of letters/digits, including umlauts and other scripts). */
export function countWords(text: string): number {
  const prose = stripNonProse(text)
    // embeds, link targets and URLs are not words the user wrote
    .replace(/!\[\[[^\]]*\]\]/g, " ")
    .replace(/!\[[^\]\n]*\]\([^)]*\)/g, " ")
    .replace(/\]\([^)]*\)/g, "]")
    // task checkboxes like "- [x]"
    .replace(/^(\s*(?:[-*+]|\d+[.)])\s+)\[.\]/gm, "$1")
    .replace(/https?:\/\/\S+/g, " ");
  const matches = prose.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

export function countLinks(text: string): number {
  const prose = stripNonProse(text);
  const wiki = prose.match(/(?<!!)\[\[[^\]\n]+\]\]/g)?.length ?? 0;
  const md = prose.match(/(?<!!)\[[^\]\n]*\]\((?!https?:)[^)\n]+\)/g)?.length ?? 0;
  return wiki + md;
}

export function countTags(text: string): number {
  // Tags inside frontmatter count too (tags: [a, b] or list form), body tags as #tag.
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  let fmTags = 0;
  const inline = fm.match(/^tags:[ \t]*\[([^\]]*)\]/m);
  if (inline) fmTags = inline[1].split(",").filter((t) => t.trim()).length;
  else {
    const block = fm.match(/^tags:[ \t]*\r?\n((?:[ \t]*-[ \t]+\S.*(?:\r?\n|$))+)/m);
    if (block) fmTags = block[1].split(/\r?\n/).filter((l) => /^[ \t]*-[ \t]+\S/.test(l)).length;
    else {
      const single = fm.match(/^tags:[ \t]*(\S.*)$/m);
      if (single) fmTags = single[1].split(/[,\s]+/).filter(Boolean).length;
    }
  }
  const body = stripNonProse(text).replace(/`[^`\n]*`/g, " ");
  const bodyTags = body.match(/(?:^|\s)#[\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*/gu)?.length ?? 0;
  return fmTags + bodyTags;
}

export function countCompletedTasks(text: string): number {
  return stripNonProse(text).match(/^\s*(?:[-*+]|\d+[.)])\s+\[[xX]\]/gm)?.length ?? 0;
}

export function analyze(text: string): NoteCounts {
  return {
    words: countWords(text),
    links: countLinks(text),
    tags: countTags(text),
    tasks: countCompletedTasks(text),
    features: countFeatures(text),
  };
}

/** Where daily notes live and how they are named (from Obsidian's Daily Notes settings). */
export interface DailyNoteConfig {
  /** Folder of the daily notes, "" = whole vault. Subfolders are included. */
  folder: string;
  /** Moment.js format of the file name, e.g. "YYYY-MM-DD". Only the last path segment is used. */
  format: string;
}

export const DEFAULT_DAILY_NOTE_CONFIG: DailyNoteConfig = { folder: "", format: "YYYY-MM-DD" };

/** Parses a file name with a date format; returns YYYY-MM-DD or null. */
export type DateParser = (name: string, format: string) => string | null;

/** Fallback parser without moment.js: understands only the default format YYYY-MM-DD. */
export const parseIsoDate: DateParser = (name, format) => {
  if (format !== "YYYY-MM-DD") return null;
  const m = name.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getMonth() === mo - 1 && date.getDate() === d ? m[0] : null;
};

/**
 * Returns the date of a daily note (YYYY-MM-DD), or null if the path is not a daily note:
 * it must be a Markdown file inside the configured folder whose name matches the format.
 */
export function dailyNoteDate(
  path: string,
  config: DailyNoteConfig = DEFAULT_DAILY_NOTE_CONFIG,
  parse: DateParser = parseIsoDate,
): string | null {
  if (!path.toLowerCase().endsWith(".md")) return null;
  const folder = config.folder.replace(/^\/+|\/+$/g, "");
  if (folder && !path.startsWith(folder + "/")) return null;
  const name = (path.split("/").pop() ?? path).replace(/\.md$/i, "");
  const format = (config.format || DEFAULT_DAILY_NOTE_CONFIG.format).split("/").pop() ?? "YYYY-MM-DD";
  return parse(name, format);
}

/** Local date as YYYY-MM-DD. */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + delta));
}
