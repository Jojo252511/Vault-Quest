import { describe, expect, it } from "vitest";
import { levelInfo, xpForLevel } from "../src/core/levels";
import { analyze, countCompletedTasks, countLinks, countTags, countWords, addDays } from "../src/core/text";
import { newlyCompleted, pickQuests } from "../src/core/quests";
import { displayedStreak, markStreakDay } from "../src/core/streak";
import { importVault, isExcluded, noteDay } from "../src/core/importer";
import { seal, unseal } from "../src/core/store";
import { DEFAULT_SETTINGS, emptyDay, emptyProgress, mergeProgress } from "../src/defaults";
import { ACHIEVEMENTS } from "../src/core/achievements";
import { en } from "../src/i18n/en";
import { de } from "../src/i18n/de";

describe("levels", () => {
  it("follows the curve", () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(1)).toBe(200);
    expect(xpForLevel(10)).toBe(11000);
    expect(xpForLevel(50)).toBe(255000);
    expect(levelInfo(0).level).toBe(0);
    expect(levelInfo(199).level).toBe(0);
    expect(levelInfo(200).level).toBe(1);
    const info = levelInfo(250);
    expect(info.level).toBe(1);
    expect(info.into).toBe(50);
    expect(info.needed).toBe(400);
  });
});

describe("text analysis", () => {
  it("counts words incl. umlauts, ignores frontmatter and code", () => {
    const text = "---\ntags: [a, b]\ndate: 2026-11-06\n---\nÄpfel und Birnen sind lecker.\n```js\nconst x = 1;\n```\n%% hidden comment %%";
    expect(countWords(text)).toBe(5);
  });
  it("reads single-line and inline frontmatter tags", () => {
    expect(countTags("---\ntags: [projekt, obsidian, plugin]\n---\ntext")).toBe(3);
    expect(countTags("---\ntags: daily\n---\ntext")).toBe(1);
  });
  it("does not count checkbox markers as words", () => {
    expect(countWords("- [x] erledigt\n- [ ] offen")).toBe(2);
  });
  it("does not count urls as words", () => {
    expect(countWords("see [docs](https://example.com/a/b) now")).toBe(3);
  });
  it("counts links, tags and tasks", () => {
    const text = "---\ntags:\n  - one\n  - two\n---\n[[A]] and [[B|b]] and [c](C.md) and ![[img.png]] #tag #123 #ok/sub\n- [x] done\n- [ ] open\n* [X] also";
    expect(countLinks(text)).toBe(3);
    expect(countTags(text)).toBe(4);
    expect(countCompletedTasks(text)).toBe(2);
    expect(analyze(text).tasks).toBe(2);
  });
  it("handles day arithmetic across months", () => {
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("quests", () => {
  it("is deterministic per day and uses distinct metrics", () => {
    const a = pickQuests("2026-11-06", 3);
    const b = pickQuests("2026-11-06", 3);
    expect(a.ids).toEqual(b.ids);
    expect(a.ids.length).toBe(3);
    expect(new Set(a.ids.map((id) => id.split("_")[0])).size).toBe(3);
  });
  it("detects completion", () => {
    const q = { date: "x", ids: ["words_200", "tasks_3"], completed: [] as string[] };
    const day = { ...emptyDay(), words: 250, tasks: 1 };
    expect(newlyCompleted(q, day).map((x) => x.id)).toEqual(["words_200"]);
  });
  it("only counts progress made after the quests were issued", () => {
    const base = { ...emptyDay(), words: 400 };
    const q = pickQuests("2026-11-06", 5, base);
    q.ids = ["words_200"];
    expect(newlyCompleted(q, { ...emptyDay(), words: 500 })).toEqual([]);
    expect(newlyCompleted(q, { ...emptyDay(), words: 600 }).map((x) => x.id)).toEqual(["words_200"]);
  });
});

describe("streak", () => {
  it("counts consecutive days and resets after a gap", () => {
    const s = { current: 0, best: 0, lastDay: null as string | null };
    markStreakDay(s, "2026-11-01");
    markStreakDay(s, "2026-11-02");
    markStreakDay(s, "2026-11-02");
    expect(s.current).toBe(2);
    markStreakDay(s, "2026-11-05");
    expect(s.current).toBe(1);
    expect(s.best).toBe(2);
    expect(displayedStreak(s, "2026-11-06")).toBe(1);
    expect(displayedStreak(s, "2026-11-08")).toBe(0);
  });
});

describe("importer", () => {
  it("dates notes by frontmatter, file name, then ctime", () => {
    const ctime = new Date(2026, 0, 15, 10).getTime();
    expect(noteDay({ path: "a.md", text: "---\ndate: 2026-03-04\n---\nx", ctime }, "2026-11-06")).toBe("2026-03-04");
    expect(noteDay({ path: "Daily/2026-05-10.md", text: "x", ctime }, "2026-11-06")).toBe("2026-05-10");
    expect(noteDay({ path: "a.md", text: "x", ctime }, "2026-11-06")).toBe("2026-01-15");
    expect(noteDay({ path: "2030-01-01.md", text: "x", ctime }, "2026-11-06")).toBe("2026-11-06");
  });

  it("excludes folders", () => {
    expect(isExcluded("Templates/a.md", ["Templates"])).toBe(true);
    expect(isExcluded("TemplatesX/a.md", ["Templates"])).toBe(false);
    expect(isExcluded("a.md", [])).toBe(false);
  });

  it("imports existing notes and unlocks achievements retroactively with dates", () => {
    const p = emptyProgress();
    const notes = [
      { path: "05 Daily/2026-11-01.md", text: "- [x] erledigt\n" + "wort ".repeat(60) + "[[Link]] #tag", ctime: 0 },
      { path: "05 Daily/2026-11-02.md", text: "wort ".repeat(60), ctime: 0 },
      { path: "05 Daily/2026-11-03.md", text: "wort ".repeat(600), ctime: 0 },
    ];
    const r = importVault(p, notes, 2, DEFAULT_SETTINGS.xp, 50, "2026-11-06");
    expect(r.notes).toBe(3);
    expect(p.totals.words).toBe(723);
    expect(p.totals.tasks).toBe(1);
    expect(p.totals.links).toBe(1);
    expect(p.totals.tags).toBe(1);
    expect(p.totals.foldersCreated).toBe(2);
    expect(p.streak.best).toBe(3);
    expect(p.days["2026-11-03"].words).toBe(600);
    expect(p.unlocked.first_words).toBe(new Date(2026, 10, 1, 12).getTime());
    expect(p.unlocked.words_day_500).toBe(new Date(2026, 10, 3, 12).getTime());
    expect(p.unlocked.streak_3).toBe(new Date(2026, 10, 3, 12).getTime());
    expect(p.unlocked.first_folder).toBe(new Date(2026, 10, 6, 12).getTime());
    expect(p.unlocked.night_owl).toBeUndefined();
    expect(p.importedAt).not.toBeNull();
    expect(r.levelAfter).toBeGreaterThan(0);
    expect(p.xp).toBe(r.xpGained);
  });

  it("scales imported XP but not achievement progress", () => {
    const notes = [{ path: "2026-11-01.md", text: "wort ".repeat(1000), ctime: 0 }];
    const full = emptyProgress();
    const part = emptyProgress();
    importVault(full, notes, 0, DEFAULT_SETTINGS.xp, 50, "2026-11-06", 1);
    importVault(part, notes, 0, DEFAULT_SETTINGS.xp, 50, "2026-11-06", 0.25);
    expect(part.totals.words).toBe(full.totals.words);
    expect(part.days["2026-11-01"].xp).toBe(Math.round(full.days["2026-11-01"].xp * 0.25));
    expect(part.unlocked.words_day_500).toBeDefined();
  });
});

describe("store", () => {
  it("round-trips and hides the content", () => {
    const p = emptyProgress();
    p.xp = 1502;
    p.unlocked.first_words = 123;
    const sealed = seal(p);
    expect(sealed).not.toContain("1502");
    expect(sealed).not.toContain("first_words");
    const back = unseal<typeof p>(sealed);
    expect(back.ok && mergeProgress(back.value).xp).toBe(1502);
  });
  it("detects tampering", () => {
    const sealed = seal({ xp: 10 });
    const parts = sealed.split(".");
    const chars = parts[2].split("");
    chars[3] = chars[3] === "A" ? "B" : "A";
    parts[2] = chars.join("");
    expect(unseal(parts.join(".")).ok).toBe(false);
    expect(unseal("{\"xp\": 999999}").ok).toBe(false);
  });
  it("handles non-ASCII content", () => {
    const back = unseal<{ s: string }>(seal({ s: "Größe Ü" }));
    expect(back.ok && back.value.s).toBe("Größe Ü");
  });
});

describe("i18n", () => {
  it("has a title and description for every achievement in both languages", () => {
    for (const a of ACHIEVEMENTS) {
      for (const dict of [en, de] as Record<string, string>[]) {
        expect(dict[`ach.${a.id}.title`], a.id).toBeTruthy();
        expect(dict[`ach.${a.id}.desc`], a.id).toBeTruthy();
      }
    }
  });
});
