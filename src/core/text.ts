import type { NoteCounts } from "../types";

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
    // link targets and URLs are not words the user wrote
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
  };
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
