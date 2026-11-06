# Vault Quest

Gamify your Obsidian vault. Earn XP for writing, level up, unlock achievements and complete daily quests. The design is theme-native: it uses Obsidian's own colours, so it fits every theme in light and dark mode.

Interface in English and German (follows Obsidian's language or can be set manually).

## Features

- **XP and levels:** every new word, note, link, tag and completed task earns XP. Your level and XP bar sit in the status bar at the bottom. Hover for details, click to open the achievements.
- **Achievements:** 27 achievements in six categories (writing, structure, tasks, level, streaks, special) with four rarities. Each unlock shows a notification and grants bonus XP.
- **Retroactive import:** on first start, Vault Quest scans your existing notes and unlocks everything you have already earned. Each note is dated by its `date`/`created` frontmatter, a `YYYY-MM-DD` date in the file name, or its creation time, so achievements, streaks and statistics get real dates.
- **Daily quests:** three new quests every day (e.g. "Write 500 words", "Complete 3 tasks"). They only count what you do after they were issued.
- **Streaks:** a day counts when you write at least 50 words (configurable).
- **Statistics:** totals, current and best streak, and a 14-day word chart.
- **Sounds:** short synthesised sounds for XP, level-ups, achievements and quests. No audio files are shipped.

### Commands

- Open achievements
- Open daily quests
- Open statistics
- Reset progress and re-import vault

## How XP is counted

Choose a difficulty in the settings. It sets all XP values and the streak threshold at once:

| Difficulty | XP per word | per note | per link | per tag | per task | Rewards | Streak from |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Easy (occasional use) | 2 | 20 | 10 | 6 | 10 | ×2 | 25 words |
| Medium (default) | 1 | 10 | 5 | 3 | 5 | ×1 | 50 words |
| Hard | 0.75 | 7.5 | 3.75 | 2.25 | 3.75 | ×0.75 | 100 words |
| Very hard | 0.5 | 5 | 2.5 | 1.5 | 2.5 | ×0.5 | 200 words |
| Hardcore | 0.25 | 2.5 | 1.25 | 0.75 | 1.25 | ×0.25 | 300 words |

"Rewards" scales the bonus XP of quests and achievements. A new difficulty applies to XP earned from then on; use *Reset and re-import* to recalculate everything.

- Only growth counts. Vault Quest remembers the highest count per note, so deleting and re-typing never earns XP twice.
- A single edit counts at most 150 words, so pasting a long text doesn't count fully.
- Frontmatter, code blocks, comments, URLs and task checkboxes are not counted as words.
- Excluded folders never earn XP (default: `Clippings`, the Web Clipper folder).
- Existing content earns 0, 10, 25 (default), 50 or 100 % XP on the retroactive import. It always counts fully for achievements and statistics.

Level curve: level *n* needs `100 · n · (n + 1)` XP in total (level 1 = 200, level 10 = 11,000, level 50 = 255,000).

## Data and privacy

Everything stays on your device. The plugin makes no network requests.

Settings are stored in plain text in `.obsidian/plugins/vault-quest/data.json`. Progress (XP, achievements, statistics) is stored in the same file as an obfuscated string with a checksum. This is **not** real encryption: the key is part of the open source code. It only prevents casual editing. If the checksum doesn't match, the progress is discarded and the vault is re-imported.

If you sync `.obsidian/` between devices (Git, Obsidian Sync), each device writes its own progress, and the last write wins.

## Installing

Manual installation:

1. Build the plugin (see below) or download `main.js`, `manifest.json` and `styles.css` from a release.
2. Copy them to `<your vault>/.obsidian/plugins/vault-quest/`.
3. Enable **Vault Quest** under Settings → Community plugins.

## Development

```bash
npm install
npm run dev     # watch mode, writes main.js
npm run build   # type check + production build
npm test        # unit tests (vitest)
```

For development, clone this repository directly into `<vault>/.obsidian/plugins/vault-quest/` and run `npm run dev`, then reload Obsidian.

| Path | Content |
| --- | --- |
| `src/main.ts` | Plugin entry: event tracking, XP rules, status bar, storage |
| `src/core/` | Pure logic without Obsidian dependencies: text analysis, levels, achievements, quests, streaks, import, storage seal |
| `src/ui/` | Achievements modal, notifications, settings tab |
| `src/i18n/` | English and German translations |
| `styles.css` | Theme-native styles |
| `tests/` | Unit tests for `src/core/` |

### Adding achievements

1. Add an entry to `ACHIEVEMENTS` in `src/core/achievements.ts` (unique `id`, Lucide icon name, rarity, category, reward, check).
2. Add `ach.<id>.title` and `ach.<id>.desc` to `src/i18n/en.ts` and `src/i18n/de.ts`. A test fails if a translation is missing.
3. Never rename or remove an existing `id`: it is stored in users' progress.

After an update, Vault Quest checks new achievements retroactively against the stored day statistics on the next start, dates them correctly and only adds their reward XP. No re-import is needed.

## License

MIT
