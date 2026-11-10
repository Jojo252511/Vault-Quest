/**
 * Markdown / Obsidian features found in a note. Each one can be used by achievements
 * with the condition { "type": "feature", "feature": "<key>", "min": n }.
 */
export const FEATURES = [
  "images",
  "codeBlocks",
  "mermaid",
  "dataview",
  "callouts",
  "tables",
  "math",
  "footnotes",
  "noteEmbeds",
  "pdfEmbeds",
  "mediaEmbeds",
  "headings",
  "highlights",
  "strikethrough",
  "deepLinks",
  "externalLinks",
  "comments",
  "properties",
  "openTasks",
  "nestedTags",
] as const;

export type Feature = (typeof FEATURES)[number];
export type FeatureCounts = Record<Feature, number>;

const IMAGE_EXT = "png|jpe?g|gif|webp|svg|bmp|avif|heic";
const MEDIA_EXT = "mp3|wav|m4a|ogg|flac|webm|mp4|mov|mkv|3gp";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const FENCE = /^[ \t]*(```|~~~)[ \t]*([\w+-]*)[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm;
const COMMENT = /%%[\s\S]*?%%/g;

export function emptyFeatures(): FeatureCounts {
  return Object.fromEntries(FEATURES.map((f) => [f, 0])) as FeatureCounts;
}

function count(text: string, re: RegExp): number {
  return text.match(re)?.length ?? 0;
}

export function countFeatures(text: string): FeatureCounts {
  const f = emptyFeatures();
  const fm = text.match(FRONTMATTER);
  const body = fm ? text.slice(fm[0].length) : text;

  // fenced code blocks and their languages
  for (const m of body.matchAll(FENCE)) {
    f.codeBlocks++;
    const lang = m[2].toLowerCase();
    if (lang === "mermaid") f.mermaid++;
    if (lang === "dataview" || lang === "dataviewjs") f.dataview++;
  }
  f.comments = count(body, COMMENT);

  // everything else ignores code and comments
  const prose = body.replace(FENCE, "\n").replace(COMMENT, " ").replace(/`[^`\n]*`/g, " ");

  const embeds = [...prose.matchAll(/!\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map((m) => m[1].trim());
  const mdEmbeds = [...prose.matchAll(/!\[[^\]\n]*\]\(([^)\s]+)[^)]*\)/g)].map((m) => m[1].trim());
  for (const target of [...embeds, ...mdEmbeds]) {
    const lower = target.toLowerCase();
    if (new RegExp(`\\.(${IMAGE_EXT})$`).test(lower)) f.images++;
    else if (lower.endsWith(".pdf")) f.pdfEmbeds++;
    else if (new RegExp(`\\.(${MEDIA_EXT})$`).test(lower)) f.mediaEmbeds++;
    else if (!/^https?:/.test(lower) && (!/\.[a-z0-9]{1,5}$/.test(lower) || lower.endsWith(".md"))) f.noteEmbeds++;
  }

  f.callouts = count(prose, /^[ \t]*>[ \t]*\[![\w-]+\]/gm);
  f.tables = count(prose, /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/gm);
  f.math = count(prose, /\$\$[\s\S]+?\$\$/g);
  f.footnotes = count(prose, /^\[\^[^\]\s]+\]:/gm);
  f.headings = count(prose, /^#{1,6}[ \t]+\S/gm);
  f.highlights = count(prose, /==[^=\n]+==/g);
  f.strikethrough = count(prose, /~~[^~\n]+~~/g);
  f.deepLinks = count(prose, /(?<!!)\[\[[^\]|#]*#[^\]]+\]\]/g);
  f.externalLinks = count(prose, /\]\(https?:\/\/[^)\s]+\)|<https?:\/\/[^>\s]+>|(?:^|[\s(])https?:\/\/[^\s)>\]]+/gm);
  f.openTasks = count(prose, /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[ \]/gm);
  f.nestedTags = count(prose, /(?:^|\s)#[\p{L}\p{N}_-]+\/[\p{L}\p{N}_/-]+/gu);

  if (fm) {
    f.properties = count(fm[1], /^[A-Za-z_][\w -]*:/gm);
    const tagBlock = fm[1].match(/^tags:[ \t]*\[([^\]]*)\]/m)?.[1] ?? "";
    f.nestedTags += tagBlock.split(",").filter((tag) => tag.includes("/")).length;
    f.nestedTags += count(fm[1].replace(/^(?!\s*-).*$/gm, ""), /^\s*-\s*[^\s/]+\/\S+/gm);
  }
  return f;
}

export function maxFeatures(a: FeatureCounts, b: FeatureCounts): FeatureCounts {
  const out = emptyFeatures();
  for (const k of FEATURES) out[k] = Math.max(a[k] ?? 0, b[k] ?? 0);
  return out;
}

export function addFeatures(target: Partial<FeatureCounts>, add: Partial<FeatureCounts>): void {
  for (const k of FEATURES) if (add[k]) target[k] = (target[k] ?? 0) + (add[k] ?? 0);
}
