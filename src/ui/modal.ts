import { App, Modal, setIcon } from "obsidian";
import { ACHIEVEMENTS, RARITY_ORDER, type Achievement, type Category } from "../core/achievements";
import { levelInfo } from "../core/levels";
import { questById, questValue, type QuestDef } from "../core/quests";
import { displayedStreak } from "../core/streak";
import { addDays, dayKey } from "../core/text";
import { formatDate, formatNumber, t, type TranslationKey } from "../i18n";
import type { Progress, Settings } from "../types";

export type Tab = "achievements" | "quests" | "stats";
type Filter = "all" | "unlocked" | "locked";

/** What the modal needs from the plugin. */
export interface QuestHost {
  app: App;
  progress: Progress;
  settings: Settings;
  ensureQuests(): void;
}

const CATEGORIES: Category[] = ["writing", "structure", "tasks", "level", "streak", "special"];

export function questLabel(q: QuestDef): string {
  if (q.metric === "notes" && q.target === 1) return t("quest.notes.one");
  return t(`quest.${q.metric}` as TranslationKey, { target: q.target });
}

export function achievementTitle(a: Achievement): string {
  return t(`ach.${a.id}.title` as TranslationKey);
}

export function achievementDesc(a: Achievement): string {
  return t(`ach.${a.id}.desc` as TranslationKey);
}

export class QuestModal extends Modal {
  private tab: Tab;
  private filter: Filter = "all";
  private bodyEl!: HTMLElement;

  constructor(private host: QuestHost, tab: Tab = "achievements") {
    super(host.app);
    this.tab = tab;
  }

  onOpen(): void {
    this.host.ensureQuests();
    this.modalEl.addClass("vq-modal");
    this.titleEl.empty();
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.renderHeader(contentEl);
    this.renderTabs(contentEl);
    this.bodyEl = contentEl.createDiv({ cls: "vq-modal-body" });
    if (this.tab === "achievements") this.renderAchievements();
    else if (this.tab === "quests") this.renderQuests();
    else this.renderStats();
  }

  private renderHeader(parent: HTMLElement): void {
    const p = this.host.progress;
    const info = levelInfo(p.xp);
    const header = parent.createDiv({ cls: "vq-header" });

    const ring = header.createDiv({ cls: "vq-level-ring" });
    ring.style.setProperty("--vq-progress", `${Math.round(info.progress * 360)}deg`);
    const inner = ring.createDiv({ cls: "vq-level-ring-inner" });
    inner.createDiv({ cls: "vq-level-ring-label", text: t("level") });
    inner.createDiv({ cls: "vq-level-ring-value", text: String(info.level) });

    const text = header.createDiv({ cls: "vq-header-text" });
    text.createDiv({ cls: "vq-header-title", text: t("plugin.name") });
    text.createDiv({
      cls: "vq-header-sub",
      text: t("modal.summary", {
        xp: p.xp,
        unlocked: Object.keys(p.unlocked).filter((id) => ACHIEVEMENTS.some((a) => a.id === id)).length,
        total: ACHIEVEMENTS.length,
      }),
    });
    const bar = text.createDiv({ cls: "vq-progress" });
    bar.createDiv({ cls: "vq-progress-fill" }).style.width = `${(info.progress * 100).toFixed(1)}%`;
    text.createDiv({
      cls: "vq-header-hint",
      text: t("modal.toNext", { remaining: info.needed - info.into, next: info.level + 1 }),
    });
  }

  private renderTabs(parent: HTMLElement): void {
    const tabs = parent.createDiv({ cls: "vq-tabs" });
    const make = (id: Tab, icon: string, label: TranslationKey) => {
      const btn = tabs.createEl("button", { cls: "vq-tab" });
      if (this.tab === id) btn.addClass("is-active");
      setIcon(btn.createSpan({ cls: "vq-tab-icon" }), icon);
      btn.createSpan({ text: t(label) });
      btn.addEventListener("click", () => {
        this.tab = id;
        this.render();
      });
    };
    make("achievements", "trophy", "modal.tab.achievements");
    make("quests", "target", "modal.tab.quests");
    make("stats", "bar-chart-3", "modal.tab.stats");
  }

  // ------------------------------------------------------------ achievements

  private renderAchievements(): void {
    const unlocked = this.host.progress.unlocked;
    const chips = this.bodyEl.createDiv({ cls: "vq-chips" });
    (["all", "unlocked", "locked"] as Filter[]).forEach((f) => {
      const chip = chips.createEl("button", { cls: "vq-chip", text: t(`modal.filter.${f}` as TranslationKey) });
      if (this.filter === f) chip.addClass("is-active");
      chip.addEventListener("click", () => {
        this.filter = f;
        this.render();
      });
    });

    for (const cat of CATEGORIES) {
      const list = ACHIEVEMENTS.filter((a) => a.category === cat)
        .filter((a) => this.filter === "all" || (this.filter === "unlocked") === !!unlocked[a.id])
        .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
      if (list.length === 0) continue;
      const done = ACHIEVEMENTS.filter((a) => a.category === cat && unlocked[a.id]).length;
      const total = ACHIEVEMENTS.filter((a) => a.category === cat).length;
      const head = this.bodyEl.createDiv({ cls: "vq-section-head" });
      head.createSpan({ text: t(`category.${cat}` as TranslationKey) });
      head.createSpan({ cls: "vq-section-count", text: `${done} / ${total}` });
      const grid = this.bodyEl.createDiv({ cls: "vq-grid" });
      for (const a of list) this.renderCard(grid, a, unlocked[a.id]);
    }
  }

  private renderCard(parent: HTMLElement, a: Achievement, unlockedAt: number | undefined): void {
    const card = parent.createDiv({ cls: `vq-card vq-rarity-${a.rarity}` });
    if (!unlockedAt) card.addClass("is-locked");
    const icon = card.createDiv({ cls: "vq-card-icon" });
    setIcon(icon, unlockedAt ? a.icon : "lock");
    const body = card.createDiv({ cls: "vq-card-body" });
    const top = body.createDiv({ cls: "vq-card-top" });
    top.createDiv({ cls: "vq-card-title", text: achievementTitle(a) });
    if (a.reward > 0) top.createDiv({ cls: "vq-card-reward", text: t("modal.reward", { xp: a.reward }) });
    body.createDiv({ cls: "vq-card-desc", text: achievementDesc(a) });
    const meta = body.createDiv({ cls: "vq-card-meta" });
    const left = meta.createDiv({ cls: "vq-card-meta-left" });
    left.createSpan({ cls: "vq-rarity-pill", text: t(`rarity.${a.rarity}` as TranslationKey) });
    const when = left.createSpan({ cls: "vq-card-when" });
    setIcon(when.createSpan({ cls: "vq-card-when-icon" }), unlockedAt ? "calendar-check" : "lock");
    when.createSpan({ text: unlockedAt ? formatDate(unlockedAt) : t("modal.locked") });
    if (unlockedAt) when.setAttribute("aria-label", t("modal.unlockedOn", { date: formatDate(unlockedAt) }));
  }

  // ------------------------------------------------------------------ quests

  private renderQuests(): void {
    const { progress, settings } = this.host;
    if (!settings.questsEnabled) {
      this.bodyEl.createDiv({ cls: "vq-empty", text: t("quests.disabled") });
      return;
    }
    const head = this.bodyEl.createDiv({ cls: "vq-section-head" });
    head.createSpan({ text: t("quests.title") });
    this.bodyEl.createDiv({ cls: "vq-muted", text: t("quests.subtitle") });

    const quests = progress.quests;
    if (!quests) return;
    const day = progress.days[dayKey()];
    const list = this.bodyEl.createDiv({ cls: "vq-quests" });
    for (const id of quests.ids) {
      const q = questById(id);
      if (!q) continue;
      const done = quests.completed.includes(id);
      const value = done ? q.target : Math.min(questValue(q, day, quests.base), q.target);
      const row = list.createDiv({ cls: "vq-quest" });
      if (done) row.addClass("is-done");
      setIcon(row.createDiv({ cls: "vq-quest-icon" }), done ? "check" : q.icon);
      const body = row.createDiv({ cls: "vq-quest-body" });
      const top = body.createDiv({ cls: "vq-quest-top" });
      top.createDiv({ cls: "vq-quest-title", text: questLabel(q) });
      top.createDiv({ cls: "vq-card-reward", text: t("modal.reward", { xp: q.reward }) });
      const bar = body.createDiv({ cls: "vq-progress is-small" });
      bar.createDiv({ cls: "vq-progress-fill" }).style.width = `${(value / q.target) * 100}%`;
      body.createDiv({
        cls: "vq-quest-count",
        text: done ? t("quests.done") : `${formatNumber(value)} / ${formatNumber(q.target)}`,
      });
    }
    if (quests.ids.length > 0 && quests.completed.length >= quests.ids.length) {
      this.bodyEl.createDiv({ cls: "vq-empty is-success", text: t("quests.allDone") });
    }
  }

  // ------------------------------------------------------------------- stats

  private renderStats(): void {
    const { progress, settings } = this.host;
    const today = dayKey();
    const info = levelInfo(progress.xp);
    const tiles = this.bodyEl.createDiv({ cls: "vq-tiles" });
    const tile = (icon: string, label: TranslationKey, value: string) => {
      const el = tiles.createDiv({ cls: "vq-tile" });
      setIcon(el.createDiv({ cls: "vq-tile-icon" }), icon);
      el.createDiv({ cls: "vq-tile-value", text: value });
      el.createDiv({ cls: "vq-tile-label", text: t(label) });
    };
    const tot = progress.totals;
    tile("star", "stats.level", String(info.level));
    tile("zap", "stats.totalXp", formatNumber(progress.xp));
    tile("flame", "stats.streak", t("stats.days", { n: displayedStreak(progress.streak, today) }));
    tile("award", "stats.bestStreak", t("stats.days", { n: progress.streak.best }));
    tile("pen-line", "stats.words", formatNumber(tot.words));
    tile("file-text", "stats.notes", formatNumber(tot.notesCreated));
    tile("link", "stats.links", formatNumber(tot.links));
    tile("tag", "stats.tags", formatNumber(tot.tags));
    tile("check-square", "stats.tasks", formatNumber(tot.tasks));
    tile("target", "stats.quests", formatNumber(tot.questsCompleted));

    const head = this.bodyEl.createDiv({ cls: "vq-section-head" });
    head.createSpan({ text: t("stats.last14") });
    const chart = this.bodyEl.createDiv({ cls: "vq-chart" });
    const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
    const values = days.map((d) => progress.days[d]?.words ?? 0);
    const max = Math.max(...values, settings.streakMinWords, 1);
    days.forEach((d, i) => {
      const col = chart.createDiv({ cls: "vq-chart-col" });
      if (values[i] >= settings.streakMinWords) col.addClass("is-streak");
      if (d === today) col.addClass("is-today");
      const barWrap = col.createDiv({ cls: "vq-chart-bar-wrap" });
      const bar = barWrap.createDiv({ cls: "vq-chart-bar" });
      bar.style.height = `${(values[i] / max) * 100}%`;
      bar.setAttribute("aria-label", `${d}: ${formatNumber(values[i])}`);
      col.createDiv({ cls: "vq-chart-label", text: d === today ? t("stats.today") : d.slice(8) });
    });
    this.bodyEl.createDiv({ cls: "vq-muted", text: t("stats.streakHint", { n: settings.streakMinWords }) });
  }
}

/** Small yes/no dialog. */
export class ConfirmModal extends Modal {
  constructor(app: App, private message: string, private onConfirm: () => void) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.createEl("p", { text: this.message });
    const buttons = this.contentEl.createDiv({ cls: "modal-button-container" });
    buttons.createEl("button", { text: t("cancel") }).addEventListener("click", () => this.close());
    const ok = buttons.createEl("button", { cls: "mod-warning", text: t("confirm") });
    ok.addEventListener("click", () => {
      this.close();
      this.onConfirm();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
