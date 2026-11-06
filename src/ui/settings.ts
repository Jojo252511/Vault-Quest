import { App, Notice, PluginSettingTab, Setting, type Plugin } from "obsidian";
import { DIFFICULTY_ORDER, IMPORT_XP_STEPS, streakMinWords, xpRules } from "../core/difficulty";
import { formatDecimal, setLanguage, t, type TranslationKey } from "../i18n";
import type { Difficulty, Language, Settings } from "../types";
import { ConfirmModal } from "./modal";

export interface SettingsHost extends Plugin {
  settings: Settings;
  saveAll(): Promise<void>;
  refreshUi(): void;
  reimport(): Promise<void>;
  resetProgress(): Promise<void>;
}

export class VaultQuestSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: SettingsHost) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const save = async () => {
      await this.plugin.saveAll();
      this.plugin.refreshUi();
    };
    containerEl.empty();

    // general
    new Setting(containerEl).setName(t("settings.general")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.language"))
      .setDesc(t("settings.language.desc"))
      .addDropdown((d) =>
        d
          .addOption("auto", t("settings.language.auto"))
          .addOption("en", "English")
          .addOption("de", "Deutsch")
          .setValue(s.language)
          .onChange(async (v) => {
            s.language = v as Language;
            setLanguage(s.language);
            await save();
            this.display();
          }),
      );
    new Setting(containerEl)
      .setName(t("settings.statusBar"))
      .setDesc(t("settings.statusBar.desc"))
      .addToggle((tg) => tg.setValue(s.showStatusBar).onChange(async (v) => ((s.showStatusBar = v), await save())));
    new Setting(containerEl)
      .setName(t("settings.toasts"))
      .setDesc(t("settings.toasts.desc"))
      .addToggle((tg) => tg.setValue(s.showToasts).onChange(async (v) => ((s.showToasts = v), await save())));
    new Setting(containerEl)
      .setName(t("settings.excluded"))
      .setDesc(t("settings.excluded.desc"))
      .addTextArea((ta) =>
        ta
          .setPlaceholder("Templates\n99 Vorlagen")
          .setValue(s.excludedFolders.join("\n"))
          .onChange(async (v) => {
            s.excludedFolders = v.split("\n").map((x) => x.trim()).filter(Boolean);
            await save();
          }),
      );

    // difficulty
    new Setting(containerEl).setName(t("settings.xp")).setHeading();
    const rules = xpRules(s.difficulty);
    const desc = createFragment((f) => {
      f.appendText(t("settings.difficulty.desc"));
      f.createDiv({
        cls: "vq-setting-values",
        text: t("settings.difficulty.values", {
          word: formatDecimal(rules.perWord),
          note: formatDecimal(rules.perNote),
          link: formatDecimal(rules.perLink),
          tag: formatDecimal(rules.perTag),
          task: formatDecimal(rules.perTask),
          streak: streakMinWords(s.difficulty),
          reward: formatDecimal(rules.rewardFactor),
        }),
      });
    });
    new Setting(containerEl)
      .setName(t("settings.difficulty"))
      .setDesc(desc)
      .addDropdown((d) => {
        for (const id of DIFFICULTY_ORDER) d.addOption(id, t(`difficulty.${id}` as TranslationKey));
        d.setValue(s.difficulty).onChange(async (v) => {
          s.difficulty = v as Difficulty;
          await save();
          this.display();
        });
      });
    new Setting(containerEl)
      .setName(t("settings.xp.import"))
      .setDesc(t("settings.xp.import.desc"))
      .addDropdown((d) => {
        for (const step of IMPORT_XP_STEPS) {
          d.addOption(String(step), step === 25 ? t("settings.xp.import.default", { n: step }) : `${step} %`);
        }
        d.setValue(String(s.importXpPercent)).onChange(async (v) => {
          s.importXpPercent = Number(v);
          await save();
        });
      });

    // quests
    new Setting(containerEl).setName(t("settings.quests")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.quests.enabled"))
      .addToggle((tg) => tg.setValue(s.questsEnabled).onChange(async (v) => ((s.questsEnabled = v), await save())));
    new Setting(containerEl).setName(t("settings.quests.count")).addSlider((sl) =>
      sl
        .setLimits(1, 5, 1)
        .setValue(s.questsPerDay)
        .setDynamicTooltip()
        .onChange(async (v) => ((s.questsPerDay = v), await save())),
    );

    // sounds
    new Setting(containerEl).setName(t("settings.sounds")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.sounds.enabled"))
      .addToggle((tg) => tg.setValue(s.sounds).onChange(async (v) => ((s.sounds = v), await save())));
    new Setting(containerEl).setName(t("settings.sounds.volume")).addSlider((sl) =>
      sl
        .setLimits(0, 1, 0.05)
        .setValue(s.volume)
        .setDynamicTooltip()
        .onChange(async (v) => ((s.volume = v), await save())),
    );
    new Setting(containerEl)
      .setName(t("settings.sounds.xp"))
      .addToggle((tg) => tg.setValue(s.soundXp).onChange(async (v) => ((s.soundXp = v), await save())));
    new Setting(containerEl)
      .setName(t("settings.sounds.levelUp"))
      .addToggle((tg) => tg.setValue(s.soundLevelUp).onChange(async (v) => ((s.soundLevelUp = v), await save())));
    new Setting(containerEl)
      .setName(t("settings.sounds.achievement"))
      .addToggle((tg) => tg.setValue(s.soundAchievement).onChange(async (v) => ((s.soundAchievement = v), await save())));

    // data
    new Setting(containerEl).setName(t("settings.data")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.reimport"))
      .setDesc(t("settings.reimport.desc"))
      .addButton((b) =>
        b.setButtonText(t("settings.reimport.button")).onClick(() =>
          new ConfirmModal(this.app, t("settings.reimport.confirm"), () => void this.plugin.reimport()).open(),
        ),
      );
    new Setting(containerEl)
      .setName(t("settings.reset"))
      .setDesc(t("settings.reset.desc"))
      .addButton((b) =>
        b
          .setButtonText(t("settings.reset.button"))
          .setWarning()
          .onClick(() =>
            new ConfirmModal(this.app, t("settings.reset.confirm"), async () => {
              await this.plugin.resetProgress();
              new Notice(t("settings.reset.done"));
            }).open(),
          ),
      );
  }
}
