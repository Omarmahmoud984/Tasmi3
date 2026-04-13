# تسميع (Tasmi3) - Quran Memorization Follow-up 📖

Welcome to **Tasmi3 (تسميع)**, a modern, fully dynamic, lightweight, offline-first Progressive Web Application designed to help you strictly track and follow up on your Quranic memorization progress across all 114 Surahs.

## 🌟 Features
- **Full Quranic Coverage:** Asynchronously fetches and parses the entire Quran dynamically.
- **Smart Tracking Boards:** Categorize your saved memorizations efficiently:
  - 🟢 **ممتاز** (Perfect) - For firmly memorized Surahs.
  - 🟡 **جيد** (Good) - Needs minor checking.
  - 🔴 **يحتاج مراجعة** (Needs Review) - Flagged for active daily reviewing.
- **Micro-testing / Spaced Word Reveal:** Hide verses and seamlessly reveal them word-by-word with beautiful fading animations to test your exact recall.
- **Global Dhikr Notifications:** Polite, elegant timed popups prompting "الصلاة على النبي ﷺ" while navigating.
- **Tasbeeh Counter:** Built-in floating sidebar for Dhikr counting with fluid tactile animations.
- **Offline & Installable (PWA):** Installs natively on iOS/Android from Vercel. Operates entirely without internet once loaded.
- **Theming:** Full Support for Dark / Light modes with gorgeous Arabic Web-fonts (Cairo & Scheherazade New).

## 🚀 How to Deploy on Vercel
Deploying this project is extremely easy. No builds, frameworks, or dependencies are required!

1. Create a `tasmi3 2` folder.
2. Ensure you have the `10` core files ready:
   - **HTML**: `index.html`, `needs_review.html`, `good.html`, `perfect.html`
   - **CSS/JS**: `style.css`, `app.js`, `review_boards.js`
   - **PWA Configuration**: `sw.js`, `manifest.json`, `icon.svg`
3. Log into your [Vercel](https://vercel.com/new) account.
4. Drag and Drop your folder into the Vercel console deployment window.
5. It will immediately map to an `HTTPS` link.
6. Open that link on your mobile browser, and you can now physically install the app via the internal "**تثبيت / تحديث التطبيق**" button!

## ⚙️ How Update/Caching Works (Service Worker)
Because this is an offline-capable PWA, it leverages `sw.js` (Service Worker) to cache all code locally.
Whenever you push an update to your HTML/CSS/JS, simply **increment the `CACHE_NAME`** at the very top of `sw.js` (e.g., from `tasmi3-v30-cache` to `tasmi3-v31-cache`). This guarantees all user devices will automatically refresh their caches seamlessly upon next open!
