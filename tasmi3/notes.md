# Tasmi3 Project Notes

## Recent Updates
- Removed the Hint toggle button and implemented accurate marking options (Needs Review / Good / Perfect) directly in the UI as button icons.
- Restored missing sidebar CSS that was causing the Navigation and Tasbeeh sidebars to render incorrectly (as a black overlay instead of sliding sidebars).
- Fixed Progressive Web App caching so that CSS/JS updates actually reach you. Service Worker cache incremented to `v6` to load sidebar fixes.
- Launched Python internal server on port `5050` to fix the random crash on port `8000`.

## Next Steps
- [x] Verify if any other sections need formatting. (Fixed a stray `</div>` in `index.html`).
- [x] Check if Surah metadata is accurately scraping from `alquran.cloud` API. (Verified: Name stripping and Sajda extraction are correct).
