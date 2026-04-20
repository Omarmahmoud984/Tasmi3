# Tasmi3 (تسميع) — Project Documentation

## 1. Project Overview
**Tasmi3** is a frontend-only, vanilla JavaScript Progressive Web App (PWA) for Quran memorization. It uses a **hide-and-reveal** mechanic: all words in a Surah start hidden, and the user taps/clicks to reveal them one by one or in groups.

- Supports all **114 Surahs** via live API fetching from `alquran.cloud`
- Persistent state via `localStorage` (revealed words, Surah status, last opened Surah, theme)
- Offline-capable via Service Worker (`sw.js`, currently **v9**)
- Light / Dark theme with Arabic Uthmanic script rendering

---

## 2. File Architecture

| File | Role |
|---|---|
| `index.html` | Main app shell: header, overlays, bottom bar, sidebars |
| `app.js` | All application logic: state, API, audio, UI |
| `style.css` | All styling: design tokens, components, animations |
| `sw.js` | Service Worker for PWA caching (v9) |
| `manifest.json` | PWA manifest (name, icons, theme color) |
| `review_boards.js` | Logic for good/perfect/needs_review board pages |
| `good.html`, `perfect.html`, `needs_review.html` | Status board pages |

---

## 3. State Variables (`app.js`)

| Variable | Description |
|---|---|
| `SURAHS` | In-memory cache object: `{ [id]: { name, ayahs[], sajda } }`. Populated lazily per Surah. |
| `currentSurah` | Integer ID of currently displayed Surah |
| `totalWords` | Total word count of the rendered Surah |
| `revealedCount` | Number of words currently revealed |
| `hideDelay` | Delay (ms) for auto-hide in hardcore mode (legacy, kept for timer chip UI) |
| `wordTimers` | Map of `{ wordId: timeoutId }` for pending hide timers |
| `isHardcoreMode` | Boolean for hardcore mode (currently unused in UI) |
| `tasbeehCount` | Counter for the Tasbeeh sidebar |
| `isMushafMode` | Boolean toggling Mushaf continuous-text layout |
| `_ayahAudio` | Current `Audio` object for per-ayah or whole-surah playback |
| `_activeAyahBtn` | The currently active audio button element (for `playing` CSS class) |
| `_isPlayingWholeSurah` | Boolean flag for whole-surah sequential playback |
| `_currentWholeSurahAyahIndex` | Index pointer for whole-surah playback |
| `currentNWordsPattern` | Number of words to reveal per "كشف N كلمة" tap (1–5) |

---

## 4. Core Functions

### Initialization
- **`initApi()`** *(async)* — Fetches the full Surah list from `alquran.cloud` (or from `localStorage` cache). Populates the `<select>` dropdown and the custom searchable UI. **If a `?surah=X` URL parameter exists** (e.g. coming from a board page), automatically hides the intro overlay and calls `loadSurah(X)` directly, skipping the tutorial screen.

- **`initCustomSelect()`** — Builds the custom-styled, searchable Surah dropdown from the native hidden `<select>`. Supports Arabic text search.

- **`startApp()`** — Called when the user clicks "ابدأ التحفيظ" on the intro overlay. Reads `?surah=` URL param first; falls back to `tasmi3_last_surah` in localStorage, then defaults to Surah 1.

### Surah Loading
- **`loadSurah(id)`** *(async)* — The core rendering function:
  1. Checks `SURAHS[id]` in memory; if missing, fetches from `alquran.cloud/v1/surah/{id}` (with `localStorage` caching).
  2. Strips the Bismillah prefix from Ayah 1 of all Surahs **except** Surah 1 (Fatiha) and Surah 9 (Tawbah).
  3. Detects and stores `sajda` ayah index if present.
  4. Renders each Ayah as a `.ayah-block` div, splitting text into individual `.word.hidden` spans (each with a unique `data-id="ayah-word"` format).
  5. Appends an ۝ end-of-ayah marker (tappable to reveal entire ayah) and an audio button per ayah.
  6. Re-applies the saved revealed state from `localStorage` (`tasmi3_revealed_state`).
  7. Updates the Surah status buttons and progress stats.
  8. Appends a "Next Surah" card at the bottom if the next Surah is already in memory.

### Word Reveal
- **`revealWord(span)`** — Reveals a single clicked word: removes `.hidden`/`.fading`/`.hinted`, adds `.revealed`, increments `revealedCount`, calls `updateStats()`.
- **`revealNextAyah()`** — Finds the next target ayah block (using `getNextTargetIndex()`) and reveals all its hidden words.
- **`revealNWords()`** — Reveals exactly `currentNWordsPattern` words sequentially, spanning across ayahs if needed.
- **`revealAll()`** — Reveals all words in the current Surah instantly.
- **`resetSurah()`** — **Deletes** the current Surah's entry from `tasmi3_revealed_state` in localStorage, then calls `loadSurah()` to re-render a fully hidden Surah.
- **`getNextTargetIndex()`** — Scans all `.ayah-block` elements to find the correct next target: the currently-being-revealed ayah (has both revealed and hidden words), or the first fully-hidden ayah after the last revealed one.
- **`changeNWords(delta)`** — Increments or decrements `currentNWordsPattern` between 1 and 5.

### State Persistence
- **`saveRevealedState()`** — Collects all `.word.revealed` and `.word.fading` span `data-id` values, saves them under `tasmi3_revealed_state[currentSurah]` in `localStorage`.
- **`updateStats()`** — Calls `saveRevealedState()`, updates the revealed/total counters, progress bar, and the next-ayah button label.

### Status Tracking (Board System)
- **`toggleSurahStatus(val)`** — Toggles the status (`needs_review`, `good`, `perfect`) for `currentSurah` in `tasmi3_surah_status` localStorage object. Clicking the same status again removes it (toggle off).
- **`updateStatusButtons()`** — Reads `tasmi3_surah_status` and applies/removes the `.active` class on the 🔴/🟡/🟢 header buttons.
- **`review_boards.js → initBoard(targetStatus)`** — On board pages, reads `tasmi3_surah_status`, renders cards for each matching Surah. Clicking a card navigates to `index.html?surah=X`.

### Audio Engine
- **`getAyahUrl(surahId, ayahNum)`** — Builds the audio URL: `https://everyayah.com/data/{reciterId}/{surah_padded}{ayah_padded}.mp3`. Ayah numbers use `idx + 1` universally (Surah 1's Bismillah is correctly Ayah 1).
- **`playAyahAudio(btn, surahId, ayahNum)`** — Plays a single ayah. Toggling the same button pauses/resumes. Stops any currently playing audio first.
- **`playWholeSurah()`** — Starts sequential whole-surah playback from index 0. Shows the sticky audio player bar. Clicking again stops playback.
- **`playNextAyahInSurah()`** — Recursive function: plays the current index's ayah, auto-scrolls to it, listens for the `ended` event, then increments the index and calls itself.
- **`stopAyahAudio()`** / **`stopAllAudio()`** — Pauses and clears audio state; hides the sticky player bar.
- **`toggleStickyPause()`** — Pauses/resumes `_ayahAudio` from the sticky bar.

### UI & Theming
- **`setTheme(mode)`** — Toggles `body.theme-light` class, updates button styles, saves to `tasmi3_theme` in localStorage.
- **`toggleMushafMode()`** — Toggles `#ayahsContainer.mushaf-mode`, which via CSS turns the card-based layout into a continuous, justified text block.
- **`toggleSidebar()`** / **`toggleNavSidebar()`** — Show/hide the Tasbeeh and Navigation sidebars by toggling `.show` on the sidebar and overlay elements.
- **`goNextSurah(id)`** — Updates the dropdown UI and calls `loadSurah(id)`, then scrolls to top.

### Tasbeeh & Dhikr
- **`incrementTasbeeh()`** / **`resetTasbeeh()`** — Manages the counter in the Tasbeeh sidebar with a tap animation.
- **`closeDhikrPopup()`** — Hides the global Dhikr popup that appears every 2 minutes via `setInterval`.

### Helpers
- **`toArabicNum(n)`** — Converts a 0-based index to a 1-based Eastern Arabic numeral string (٠١٢٣...).
- **`getNextSurahId(currentId)`** — Returns the next Surah ID in `SURAH_ORDER` array (1–114).

---

## 5. Audio URL Notes
- **Surah 1 (Fatiha):** Ayah numbering starts at 1 (Bismillah = Ayah 1). **No special offset needed.**
- **All other Surahs:** Ayah 1 = first Ayah after Bismillah (Bismillah is stripped from display and not played separately).
- Reciters are added by adding `<option value="EveryAyah_ID">Name</option>` to `#reciterSelect` in `index.html`.

---

## 6. PWA & Caching Strategy

### Service Worker (`sw.js`)
- **Cache version:** `v9` (increment on every JS/CSS update to bust stale cache)
- **Cached:** All local files (HTML, CSS, JS, manifest)
- **Not cached:** `.mp3` audio files, `api.alquran.cloud` API responses (these are managed by `localStorage`)
- **Strategy:** Cache-first for static assets; network-first fallback for new resources

### localStorage Keys
| Key | Content |
|---|---|
| `tasmi3_revealed_state` | `{ [surahId]: [wordId, ...] }` — revealed words per Surah |
| `tasmi3_surah_status` | `{ [surahId]: 'needs_review' | 'good' | 'perfect' }` |
| `tasmi3_last_surah` | Last opened Surah ID (integer string) |
| `tasmi3_theme` | `'light'` or `'dark'` |
| `tasmi3_api_surah_list` | Cached full Surah list from alquran.cloud |
| `tasmi3_api_surah_{id}` | Cached individual Surah data from alquran.cloud |

---

## 7. Development Rules
1. **Never break `.word` / `.hidden` paradigm** — all word tracking uses `querySelectorAll('.word.hidden')`.
2. **CSS class state machine per word:** `.hidden` → `.revealed` (or `.fading` for auto-hide, `.hinted` for hint mode).
3. **Bumping SW cache version is mandatory** after any change to `app.js`, `style.css`, or any HTML file.
4. **`resetSurah()` must clear localStorage** before calling `loadSurah()`, otherwise the save-state restoration at the end of `loadSurah()` will undo the reset.
5. **`?surah=` URL param** is the handshake between board pages and the main app — it causes `initApi()` to bypass the intro overlay entirely.

---

## 8. April 2024 Rendering & UX Update

### performance Optimization: Windowed Rendering
- **Problem**: Surahs with 100+ ayahs (like Al-Baqarah) were heavy to render and slow on mobile.
- **Solution**: Implemented a sliding window rendering system.
- **Mechanism**:
    - Only renders ±12 ayahs from the current scroll position.
    - Uses `IntersectionObserver` to detect visible ayahs and shift the window dynamically.
    - **Memory State**: `_ayahMemoryState` tracks which words were revealed in ayahs that are currently removed from the DOM, ensuring progress is never lost during scrolls.
- **Trigger**: Automatic for any Surah with > 100 ayahs.

### UX Features
- **4s Undo Reset**: Clicking "إعادة الضبط" now triggers a 4-second "Undo" toast. The reset only executes if the 4 seconds pass without hitting "تراجع".
- **Haptic Feedback**: Added subtle 10ms vibration on mobile when revealing words or tapping the Tasbeeh counter.
- **Light Mode Default**: The application now defaults to light mode for better readability, while preserving the user's manual preference.
- **Toast Notifications**: Added `showToast(msg)` for system messages and user feedback.
- **Next Surah Fix**: The end-of-surah card now correctly shows the name of the next Surah even before it is fetched.
- **Board Summaries**: Board pages (needs review, good, perfect) now display a count of how many Surahs are in that category.

### Technical Debt & Cleanup
- Cleaned up duplicate CSS blocks that were causing layout issues.
- Fixed Dhikr popup close button (pointer-events bug).
- Service Worker bumped to **v36**.

---

## 9. Tafsir & Adhkar Expansion

### Tafsir Modal System
- **Integration**: A `📖` icon is appended next to the end-of-ayah marker (۝) for every rendered Ayah.
- **Tafsir Sources**: Al-Muyassar (ID: 16), Ibn Kathir (ID: 14), Al-Tabari (ID: 15) fetched from `api.quran.com`.
- **UI**: A custom modal displaying scrollable content with Tabs (`.tab-btn`) to switch Tafsirs dynamically without re-opening.
- **Performance**: Heavy caching via `localStorage` (`tasmi3_tafsir_cache_surah_ayah_tafsirId`) ensures instant loads on subsequent views.

### Adhkar Section
- **Dedicated Page**: Moved to `adhkar.html` with its own script (`adhkar.js`) and structured database (`adhkar_data.js`) to keep the main app lightweight.
- **Database (`ADHIKAR_DB`)**: Contains fully authentic Adhkar categorized into Tabs: Morning, Evening, After Prayer, and Sleep.
- **Interactive Counters**: Circular counters (`.dhikr-count-circle`) that decrease on tap (with haptic feedback and scaling animation) and turn green upon completion.
- **Virtues & Evidence**: A secondary info modal is triggered via a `❓` icon next to each Dhikr, displaying the authentic Hadith reference (`ref`) and its precise virtue/benefit (`fadhilah`).
- **State Support**: Follows the global app theme (Light/Dark).

### Infrastructure & PWA Updates (v39+)
- **Stale-While-Revalidate Caching**: The Service Worker (`sw.js`) fetch strategy was completely overhauled. It now instantly serves local cache for speed while *silently fetching the latest files in the background*. This guarantees users always get the newest app updates seamlessly upon their next refresh without ever getting stuck on old state.
- **Aggressive Update Nuke**: The `installApp()` function (tied to "تحديث التطبيق") was rewritten. It now programmatically unregisters all active service workers and fundamentally deletes all `caches` under the hood before forcefully reloading. This serves as an ultimate fallback to clear stale connections securely.
- **UI Stabilizations**: Flexbox containers specifically modified (`flex-shrink: 0`, `min-height`) in `style.css` to prevent long Modal text (like Tafsir Ibn Kathir) from compressing system tabs or navigation layouts.
