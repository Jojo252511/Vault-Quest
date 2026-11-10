import {
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  TFolder,
  debounce,
  moment,
  setTooltip,
  type Debouncer,
  type Editor,
  type MarkdownFileInfo,
} from "obsidian";
import { ACHIEVEMENTS, buildContext, newlyEarned } from "./core/achievements";
import { MAX_WORDS_PER_EDIT, scaledReward, streakMinWords, xpRules } from "./core/difficulty";
import {
  backfillAchievements,
  importVault,
  isExcluded,
  unknownAchievements,
  type ScannedNote,
} from "./core/importer";
import { levelInfo } from "./core/levels";
import { newlyCompleted, pickQuests } from "./core/quests";
import { Sounds } from "./core/sounds";
import { seal, unseal } from "./core/store";
import { displayedStreak, markStreakDay } from "./core/streak";
import {
  DEFAULT_DAILY_NOTE_CONFIG,
  analyze,
  dailyNoteDate,
  dayKey,
  type DailyNoteConfig,
  type DateParser,
} from "./core/text";
import { FEATURES, emptyFeatures, maxFeatures, type FeatureCounts } from "./core/features";
import { computeVaultStats, type VaultStats } from "./core/vault";
import { emptyDay, emptyProgress, mergeProgress, mergeSettings } from "./defaults";
import { formatNumber, setLanguage, t } from "./i18n";
import type { DayStats, NoteCounts, Progress, Settings, StoredData } from "./types";
import { QuestModal, achievementDesc, achievementTitle, questLabel, type Tab } from "./ui/modal";
import { VaultQuestSettingTab } from "./ui/settings";
import { Toasts } from "./ui/toasts";

/** Content that appears this soon after a note was created comes from a template. */
const FRESH_NOTE_MS = 3000;

/** Obsidian ships moment.js; its typings expose it as a namespace, so call it through a narrow type. */
type MomentFn = (input: string, format: string, strict: boolean) => {
  isValid(): boolean;
  format(format: string): string;
};

const parseWithMoment: DateParser = (name, format) => {
  const m = (moment as unknown as MomentFn)(name, format, true);
  return m.isValid() ? m.format("YYYY-MM-DD") : null;
};

type Gain = Partial<Pick<DayStats, "words" | "notes" | "links" | "tags" | "tasks">>;

export default class VaultQuestPlugin extends Plugin {
  settings!: Settings;
  progress!: Progress;

  private sounds!: Sounds;
  private toasts!: Toasts;
  private statusEl!: HTMLElement;
  private ready = false;
  private importing = false;
  /** High-water marks per note so deleting and re-typing never earns XP twice. */
  private seen = new Map<string, NoteCounts>();
  private editTimers = new Map<string, number>();
  private requestSave!: Debouncer<[], void>;
  /** Cached vault structure, refreshed when files or folders change. */
  private vaultStats!: VaultStats;
  private requestVaultRefresh!: Debouncer<[], void>;
  /** Notes created in the last seconds: their first content (e.g. a template) is not counted as written. */
  private fresh = new Map<string, number>();

  async onload(): Promise<void> {
    const tampered = await this.loadAll();
    setLanguage(this.settings.language);

    this.sounds = new Sounds(() => this.settings);
    this.toasts = new Toasts();
    this.requestSave = debounce(() => void this.saveAll(), 1000, true);
    this.requestVaultRefresh = debounce(
      () => {
        this.refreshVaultStats();
        if (this.ready) this.afterChange(0, false);
      },
      1000,
      true,
    );

    // status bar: level pill + XP bar, click opens achievements
    this.statusEl = this.addStatusBarItem();
    this.statusEl.addClass("vq-status", "mod-clickable");
    this.statusEl.createSpan({ cls: "vq-status-level" });
    this.statusEl.createDiv({ cls: "vq-status-bar" }).createDiv({ cls: "vq-status-fill" });
    this.statusEl.addEventListener("click", () => this.openModal("achievements"));

    this.addRibbonIcon("trophy", t("cmd.open"), () => this.openModal("achievements"));
    this.addCommand({ id: "open-achievements", name: t("cmd.open"), callback: () => this.openModal("achievements") });
    this.addCommand({ id: "open-quests", name: t("cmd.quests"), callback: () => this.openModal("quests") });
    this.addCommand({ id: "open-stats", name: t("cmd.stats"), callback: () => this.openModal("stats") });
    this.addCommand({ id: "reimport", name: t("cmd.rescan"), callback: () => void this.reimport() });
    this.addSettingTab(new VaultQuestSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(async () => {
      if (tampered) new Notice(t("import.tampered"), 10_000);
      this.refreshVaultStats();
      if (!this.progress.importedAt) await this.runImport();
      await this.backfillNewAchievements();
      this.ensureQuests();
      this.seedOpenNotes();
      this.ready = true;
      this.refreshUi();

      // events are registered after layout-ready, otherwise Obsidian reports every existing file as "created"
      this.registerEvent(this.app.workspace.on("editor-change", (editor, info) => this.onEditorChange(editor, info)));
      this.registerEvent(this.app.workspace.on("file-open", (file) => file && void this.seedFile(file)));
      this.registerEvent(this.app.vault.on("modify", (file) => this.onModify(file)));
      this.registerEvent(this.app.vault.on("create", (file) => this.onCreate(file)));
      this.registerEvent(this.app.vault.on("delete", () => this.requestVaultRefresh()));
      this.registerEvent(this.app.vault.on("rename", () => this.requestVaultRefresh()));
      this.registerEvent(
        this.app.vault.on("rename", (file, oldPath) => {
          const counts = this.seen.get(oldPath);
          if (counts) {
            this.seen.delete(oldPath);
            this.seen.set(file.path, counts);
          }
        }),
      );
      // day rollover: new quests, status bar tooltip
      this.registerInterval(window.setInterval(() => this.onTick(), 60_000));
    });
  }

  onunload(): void {
    for (const timer of this.editTimers.values()) window.clearTimeout(timer);
    this.toasts?.destroy();
    this.sounds?.dispose();
    void this.saveAll();
  }

  // ---------------------------------------------------------------- storage

  /** Returns true if the stored progress was manipulated and had to be discarded. */
  private async loadAll(): Promise<boolean> {
    const raw = ((await this.loadData()) ?? {}) as Partial<StoredData> & { progress?: unknown };
    this.settings = mergeSettings(raw.settings);
    if (raw.progress === undefined) {
      this.progress = emptyProgress();
      return false;
    }
    if (typeof raw.progress === "string") {
      const result = unseal<Progress>(raw.progress);
      if (result.ok) {
        this.progress = mergeProgress(result.value);
        return false;
      }
    }
    console.warn("Vault Quest: stored progress failed its integrity check, rebuilding it from the vault.");
    this.progress = emptyProgress();
    return true;
  }

  async saveAll(): Promise<void> {
    if (!this.settings || !this.progress) return;
    const data: StoredData = { settings: this.settings, progress: seal(this.progress) };
    await this.saveData(data);
  }

  // ----------------------------------------------------------------- import

  private async runImport(): Promise<void> {
    if (this.importing) return;
    this.importing = true;
    const notice = new Notice(t("import.running"), 0);
    try {
      const notes = await this.scanNotes();
      const folders = this.app.vault
        .getAllLoadedFiles()
        .filter((f) => f instanceof TFolder && !f.isRoot() && !isExcluded(f.path, this.settings.excludedFolders)).length;
      const result = importVault(
        this.progress,
        notes,
        folders,
        xpRules(this.settings.difficulty),
        streakMinWords(this.settings.difficulty),
        undefined,
        this.settings.importXpPercent / 100,
        this.vaultStats,
      );
      await this.saveAll();
      new Notice(
        t("import.done", {
          notes: result.notes,
          xp: result.xpGained,
          level: result.levelAfter,
          count: result.unlocked.length,
        }),
        10_000,
      );
    } catch (e) {
      console.error("Vault Quest: import failed", e);
    } finally {
      notice.hide();
      this.importing = false;
    }
  }

  /** Achievements added by a plugin update are checked retroactively against the stored statistics. */
  private refreshVaultStats(): void {
    const entries = this.app.vault
      .getAllLoadedFiles()
      .filter((f) => !this.excluded(f.path) && !(f instanceof TFolder && f.isRoot()))
      .map((f) => ({ path: f.path, isFolder: f instanceof TFolder }));
    this.vaultStats = computeVaultStats(entries);
    // "have N daily notes" always reflects the vault as it is, which also repairs older counts
    const config = this.dailyNoteConfig();
    if (this.progress) {
      this.progress.totals.dailyNotes = entries.filter(
        (e) => !e.isFolder && dailyNoteDate(e.path, config, parseWithMoment) !== null,
      ).length;
    }
  }

  /** Folder and file name format from Obsidian's core Daily Notes plugin. */
  private dailyNoteConfig(): DailyNoteConfig {
    const plugins = (this.app as unknown as {
      internalPlugins?: { getPluginById?: (id: string) => { instance?: { options?: Partial<DailyNoteConfig> } } };
    }).internalPlugins;
    const options = plugins?.getPluginById?.("daily-notes")?.instance?.options ?? {};
    return {
      folder: (options.folder ?? DEFAULT_DAILY_NOTE_CONFIG.folder).trim(),
      format: options.format?.trim() || DEFAULT_DAILY_NOTE_CONFIG.format,
    };
  }

  private dailyDateOf(path: string): string | null {
    return dailyNoteDate(path, this.dailyNoteConfig(), parseWithMoment);
  }

  /** Reads every non-excluded note of the vault. */
  private async scanNotes(): Promise<ScannedNote[]> {
    const notes: ScannedNote[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (this.excluded(file.path)) continue;
      notes.push({
        path: file.path,
        text: await this.app.vault.cachedRead(file),
        ctime: file.stat.ctime,
        dailyDate: this.dailyDateOf(file.path),
      });
    }
    return notes;
  }

  private async backfillNewAchievements(): Promise<void> {
    // progress from v0.1 has no list yet; everything that existed then was already evaluated
    this.progress.knownAchievements ??= ACHIEVEMENTS.map((a) => a.id);
    const ids = unknownAchievements(this.progress);
    if (ids.length === 0) return;
    const notes = await this.scanNotes();
    const unlocked = backfillAchievements(
      this.progress,
      ids,
      xpRules(this.settings.difficulty),
      streakMinWords(this.settings.difficulty),
      this.vaultStats,
      undefined,
      notes,
    );
    void this.saveAll();
    new Notice(t("backfill.done", { total: ids.length, count: unlocked.length }), 10_000);
  }

  async reimport(): Promise<void> {
    this.progress = emptyProgress();
    this.seen.clear();
    await this.runImport();
    this.ensureQuests();
    this.seedOpenNotes();
    this.refreshUi();
  }

  async resetProgress(): Promise<void> {
    this.progress = emptyProgress();
    this.progress.importedAt = Date.now(); // explicit reset: don't import again on next start
    this.progress.knownAchievements = ACHIEVEMENTS.map((a) => a.id);
    this.seen.clear();
    this.seedOpenNotes();
    this.ensureQuests();
    await this.saveAll();
    this.refreshUi();
  }

  // --------------------------------------------------------------- tracking

  private excluded(path: string): boolean {
    return isExcluded(path, this.settings.excludedFolders);
  }

  private seedOpenNotes(): void {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file) this.seedCounts(view.file.path, analyze(view.editor.getValue()));
    }
  }

  private async seedFile(file: TFile): Promise<void> {
    if (file.extension !== "md" || this.excluded(file.path)) return;
    this.seedCounts(file.path, analyze(await this.app.vault.cachedRead(file)));
  }

  /** Raise the high-water mark without awarding anything. */
  private seedCounts(path: string, now: NoteCounts): void {
    const prev = this.seen.get(path);
    this.seen.set(path, prev ? maxCounts(prev, now) : now);
  }

  private onEditorChange(editor: Editor, info: MarkdownView | MarkdownFileInfo): void {
    const file = info.file;
    if (!file || this.excluded(file.path)) return;
    window.clearTimeout(this.editTimers.get(file.path));
    this.editTimers.set(
      file.path,
      window.setTimeout(() => {
        this.editTimers.delete(file.path);
        this.measure(file.path, editor.getValue());
      }, 500),
    );
  }

  /** Catches changes outside the editor, e.g. ticking a checkbox in reading view. */
  private onModify(file: unknown): void {
    if (!this.ready || !(file instanceof TFile) || file.extension !== "md" || this.excluded(file.path)) return;
    // only notes that are open count; external changes (sync, git pull) are not the user's typing here
    const open = this.app.workspace
      .getLeavesOfType("markdown")
      .some((l) => l.view instanceof MarkdownView && l.view.file?.path === file.path);
    if (!open) return;
    void this.app.vault.cachedRead(file).then((text) => this.measure(file.path, text));
  }

  private onCreate(file: unknown): void {
    if (!this.ready || this.importing) return;
    this.refreshVaultStats();
    if (file instanceof TFolder) {
      if (this.excluded(file.path)) return;
      this.progress.totals.foldersCreated++;
      this.afterChange(0, false);
      return;
    }
    if (!(file instanceof TFile) || this.excluded(file.path)) return;
    if (file.extension !== "md") {
      // attachments, canvases, bases: only the vault structure changed
      this.afterChange(0, false);
      return;
    }
    // content written by the creator (Daily Notes, Templates, Templater) is not the user's typing:
    // start from what the file contains now and ignore further content for a few seconds
    this.seen.set(file.path, { words: 0, links: 0, tags: 0, tasks: 0, features: emptyFeatures() });
    this.fresh.set(file.path, Date.now());
    void this.app.vault.cachedRead(file).then((text) => this.seedCounts(file.path, analyze(text)));
    this.award({ notes: 1 });
  }

  private measure(path: string, text: string): void {
    const now = analyze(text);
    const prev = this.seen.get(path);
    const created = this.fresh.get(path);
    if (created !== undefined && Date.now() - created < FRESH_NOTE_MS) {
      // template content arriving right after creation
      this.seedCounts(path, now);
      return;
    }
    this.fresh.delete(path);
    if (!prev) {
      this.seen.set(path, now);
      return;
    }
    this.seen.set(path, maxCounts(prev, now));
    const tot = this.progress.totals;
    tot.longestNote = Math.max(tot.longestNote, now.words);
    tot.maxLinksInNote = Math.max(tot.maxLinksInNote, now.links);
    const gain: Gain = {
      words: Math.max(0, now.words - prev.words),
      links: Math.max(0, now.links - prev.links),
      tags: Math.max(0, now.tags - prev.tags),
      tasks: Math.max(0, now.tasks - prev.tasks),
    };
    const featureGain = this.addFeatureGain(prev.features, now.features);
    if (gain.words || gain.links || gain.tags || gain.tasks) this.award(gain);
    else if (featureGain) this.afterChange(0, false);
  }

  /** Adds newly used Markdown features to the lifetime counts. Returns true if any were added. */
  private addFeatureGain(prev: FeatureCounts, now: FeatureCounts): boolean {
    let any = false;
    for (const k of FEATURES) {
      const diff = (now[k] ?? 0) - (prev[k] ?? 0);
      if (diff > 0) {
        this.progress.features[k] = (this.progress.features[k] ?? 0) + diff;
        any = true;
      }
    }
    return any;
  }

  // ------------------------------------------------------------------ rules

  private today(): DayStats {
    const key = dayKey();
    return (this.progress.days[key] ??= emptyDay());
  }

  private award(gain: Gain): void {
    const rules = xpRules(this.settings.difficulty);
    // pasted text only counts up to the per-edit cap
    const words = Math.min(gain.words ?? 0, MAX_WORDS_PER_EDIT);
    const notes = gain.notes ?? 0;
    const links = gain.links ?? 0;
    const tags = gain.tags ?? 0;
    const tasks = gain.tasks ?? 0;

    let xp =
      words * rules.perWord + notes * rules.perNote + links * rules.perLink + tags * rules.perTag + tasks * rules.perTask;
    xp = Math.min(xp, rules.maxPerEdit);

    const day = this.today();
    day.words += words;
    day.notes += notes;
    day.links += links;
    day.tags += tags;
    day.tasks += tasks;
    day.xp += xp;

    const tot = this.progress.totals;
    tot.words += words;
    tot.notesCreated += notes;
    tot.links += links;
    tot.tags += tags;
    tot.tasks += tasks;
    const hour = new Date().getHours();
    if (words > 0 && hour < 5) tot.nightWords += words;
    if (words > 0 && hour >= 5 && hour < 7) tot.earlyWords += words;

    if (day.words >= streakMinWords(this.settings.difficulty)) markStreakDay(this.progress.streak, dayKey());

    this.afterChange(xp, true);
  }

  /** Adds XP, then resolves quests, achievements and level-ups. */
  private afterChange(xp: number, playXpSound: boolean): void {
    const levelBefore = levelInfo(this.progress.xp).level;
    this.progress.xp += xp;
    if (xp > 0) this.floatXp(xp);

    this.checkQuests();
    this.checkAchievements();

    const levelAfter = levelInfo(this.progress.xp).level;
    if (levelAfter > levelBefore) {
      this.sounds.levelUp();
      this.toast({
        icon: "arrow-big-up-dash",
        heading: t("toast.levelUp"),
        title: t("toast.levelUpText", { level: levelAfter }),
        variant: "level",
      });
      this.statusEl.removeClass("is-levelling");
      void this.statusEl.offsetWidth;
      this.statusEl.addClass("is-levelling");
    } else if (xp > 0 && playXpSound) {
      this.sounds.xp();
    }
    this.renderStatus();
    this.requestSave();
  }

  ensureQuests(): void {
    const today = dayKey();
    if (!this.progress.quests || this.progress.quests.date !== today) {
      this.progress.quests = pickQuests(today, this.settings.questsPerDay, this.progress.days[today]);
      this.requestSave?.();
    }
  }

  private checkQuests(): void {
    if (!this.settings.questsEnabled) return;
    this.ensureQuests();
    const quests = this.progress.quests!;
    for (const q of newlyCompleted(quests, this.progress.days[dayKey()])) {
      quests.completed.push(q.id);
      this.progress.totals.questsCompleted++;
      if (quests.completed.length === quests.ids.length) this.progress.totals.questDays++;
      const reward = scaledReward(q.reward, this.settings.difficulty);
      this.progress.xp += reward;
      this.today().xp += reward;
      this.sounds.quest();
      this.toast({
        icon: q.icon,
        heading: t("toast.quest"),
        title: questLabel(q),
        reward: t("modal.reward", { xp: reward }),
        variant: "quest",
      });
    }
  }

  private checkAchievements(): void {
    // rewards can unlock level achievements, so resolve until stable
    for (let guard = 0; guard < 10; guard++) {
      const earned = newlyEarned(buildContext(this.progress, this.vaultStats));
      if (earned.length === 0) break;
      for (const a of earned) {
        const reward = scaledReward(a.reward, this.settings.difficulty);
        this.progress.unlocked[a.id] = Date.now();
        this.progress.xp += reward;
        this.sounds.achievement();
        this.toast({
          icon: a.icon,
          heading: t("toast.achievement"),
          title: achievementTitle(a),
          description: achievementDesc(a),
          reward: reward > 0 ? t("modal.reward", { xp: reward }) : undefined,
          variant: a.rarity,
        });
      }
    }
  }

  private onTick(): void {
    const before = this.progress.quests?.date;
    this.ensureQuests();
    if (before !== this.progress.quests?.date) this.requestSave();
    this.renderStatus();
  }

  // --------------------------------------------------------------------- ui

  refreshUi(): void {
    setLanguage(this.settings.language);
    this.renderStatus();
  }

  private toast(opts: Parameters<Toasts["show"]>[0]): void {
    if (this.settings.showToasts && this.ready) this.toasts.show(opts);
  }

  private openModal(tab: Tab): void {
    new QuestModal(this, tab).open();
  }

  private renderStatus(): void {
    if (!this.statusEl) return;
    this.statusEl.toggle(this.settings.showStatusBar);
    const info = levelInfo(this.progress.xp);
    this.statusEl.querySelector(".vq-status-level")?.setText(`${t("level.short")} ${info.level}`);
    (this.statusEl.querySelector(".vq-status-fill") as HTMLElement | null)?.style.setProperty(
      "width",
      `${(info.progress * 100).toFixed(1)}%`,
    );
    const today = this.progress.days[dayKey()]?.words ?? 0;
    setTooltip(
      this.statusEl,
      t("status.tooltip", {
        level: info.level,
        into: info.into,
        needed: info.needed,
        today,
        streak: displayedStreak(this.progress.streak, dayKey()),
      }),
      { placement: "top" },
    );
  }

  /** Small "+12 XP" that floats up from the status bar. */
  private floatXp(xp: number): void {
    if (!this.settings.showStatusBar || !this.statusEl.isShown()) return;
    const rect = this.statusEl.getBoundingClientRect();
    const el = document.body.createDiv({ cls: "vq-float", text: `+${formatNumber(xp)} XP` });
    el.style.left = `${rect.left + rect.width / 2}px`;
    el.style.top = `${rect.top - 4}px`;
    window.setTimeout(() => el.remove(), 1200);
  }
}

function maxCounts(a: NoteCounts, b: NoteCounts): NoteCounts {
  return {
    words: Math.max(a.words, b.words),
    links: Math.max(a.links, b.links),
    tags: Math.max(a.tags, b.tags),
    tasks: Math.max(a.tasks, b.tasks),
    features: maxFeatures(a.features, b.features),
  };
}
