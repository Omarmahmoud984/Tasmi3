/**
 * offline_quran.js
 * Full Offline Quran Download System
 * ─────────────────────────────────────
 * Features:
 *  - IndexedDB storage for all 114 surahs
 *  - Sequential fetch (no UI freeze via async/await + yielding)
 *  - Real-time progress bar + surah name display
 *  - Cancel & Resume support (persists last downloaded index)
 *  - Graceful error handling for slow/lost networks
 *  - Transparent integration: loadSurah() prefers IndexedDB over network
 */

// ══════════════════════════════════════════════════════════
// 1. IndexedDB Helper Layer
// ══════════════════════════════════════════════════════════

const OQ_DB_NAME    = 'tasmi3_quran_offline';
const OQ_DB_VERSION = 1;
const OQ_STORE      = 'surahs';
const OQ_META_STORE = 'meta';

let _oqDb = null;

/** Open (or create) the IndexedDB database */
function oqOpenDB() {
  return new Promise((resolve, reject) => {
    if (_oqDb) return resolve(_oqDb);

    const req = indexedDB.open(OQ_DB_NAME, OQ_DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(OQ_STORE)) {
        db.createObjectStore(OQ_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(OQ_META_STORE)) {
        db.createObjectStore(OQ_META_STORE, { keyPath: 'key' });
      }
    };

    req.onsuccess = (e) => {
      _oqDb = e.target.result;
      resolve(_oqDb);
    };

    req.onerror = () => reject(req.error);
  });
}

/** Save a surah object to IndexedDB */
async function oqSaveSurah(surahData) {
  const db = await oqOpenDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(OQ_STORE, 'readwrite');
    const req = tx.objectStore(OQ_STORE).put(surahData);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/** Retrieve a surah by its number (1–114) */
async function oqGetSurah(id) {
  const db = await oqOpenDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(OQ_STORE, 'readonly');
    const req = tx.objectStore(OQ_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => reject(req.error);
  });
}

/** Count how many surahs are stored */
async function oqCountSurahs() {
  const db = await oqOpenDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(OQ_STORE, 'readonly');
    const req = tx.objectStore(OQ_STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** Save a meta key/value (used for resume pointer) */
async function oqSetMeta(key, value) {
  const db = await oqOpenDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(OQ_META_STORE, 'readwrite');
    const req = tx.objectStore(OQ_META_STORE).put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/** Get a meta value */
async function oqGetMeta(key) {
  const db = await oqOpenDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(OQ_META_STORE, 'readonly');
    const req = tx.objectStore(OQ_META_STORE).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror   = () => reject(req.error);
  });
}

/** Delete all stored surah data (for a full re-download) */
async function oqClearAllSurahs() {
  const db = await oqOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([OQ_STORE, OQ_META_STORE], 'readwrite');
    tx.objectStore(OQ_STORE).clear();
    tx.objectStore(OQ_META_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ══════════════════════════════════════════════════════════
// 2. Surah Metadata (names in Arabic — avoids extra API call)
// ══════════════════════════════════════════════════════════

const OQ_SURAH_NAMES = [
  '', // 1-indexed — index 0 unused
  'الفاتحة','البقرة','آل عمران','النساء','المائدة',
  'الأنعام','الأعراف','الأنفال','التوبة','يونس',
  'هود','يوسف','الرعد','إبراهيم','الحجر',
  'النحل','الإسراء','الكهف','مريم','طه',
  'الأنبياء','الحج','المؤمنون','النور','الفرقان',
  'الشعراء','النمل','القصص','العنكبوت','الروم',
  'لقمان','السجدة','الأحزاب','سبأ','فاطر',
  'يس','الصافات','ص','الزمر','غافر',
  'فصلت','الشورى','الزخرف','الدخان','الجاثية',
  'الأحقاف','محمد','الفتح','الحجرات','ق',
  'الذاريات','الطور','النجم','القمر','الرحمن',
  'الواقعة','الحديد','المجادلة','الحشر','الممتحنة',
  'الصف','الجمعة','المنافقون','التغابن','الطلاق',
  'التحريم','الملك','القلم','الحاقة','المعارج',
  'نوح','الجن','المزمل','المدثر','القيامة',
  'الإنسان','المرسلات','النبأ','النازعات','عبس',
  'التكوير','الانفطار','المطففين','الانشقاق','البروج',
  'الطارق','الأعلى','الغاشية','الفجر','البلد',
  'الشمس','الليل','الضحى','الشرح','التين',
  'العلق','القدر','البينة','الزلزلة','العاديات',
  'القارعة','التكاثر','العصر','الهمزة','الفيل',
  'قريش','الماعون','الكوثر','الكافرون','النصر',
  'المسد','الإخلاص','الفلق','الناس'
];

// ══════════════════════════════════════════════════════════
// 3. Download Engine
// ══════════════════════════════════════════════════════════

const OQ_API_BASE   = 'https://api.alquran.cloud/v1/surah/';
const OQ_TOTAL      = 114;
const OQ_RESUME_KEY = 'oq_last_downloaded';

let _oqCancelFlag   = false;
let _oqDownloading  = false;

/**
 * Parse a raw API surah response into our stored format.
 * Mirrors the same Bismillah-strip logic used in app.js loadSurah().
 */
function _oqParseSurahData(data, id) {
  let ayahsList = [];
  data.data.ayahs.forEach((a, i) => {
    let text = a.text;
    if (id != 1 && id != 9 && i === 0) {
      const bare = text.replace(/[\u064B-\u065F\u06D6-\u06ED\u0670\u0640\u06E1]/g, '');
      if (bare.startsWith('\u0628\u0633\u0645') || bare.startsWith('\u0628\u0650\u0633')) {
        const words = text.split(/\s+/);
        text = words.slice(4).join(' ');
      }
    }
    ayahsList.push(text);
  });

  let sajdaIndex = undefined;
  const s = data.data.ayahs.find(a => a.sajda);
  if (s) sajdaIndex = s.numberInSurah - 1;

  return {
    id,
    name: data.data.name.replace('سُورَةُ ', '').replace('سورة ', ''),
    ayahs: ayahsList,
    sajda: sajdaIndex,
    downloadedAt: Date.now()
  };
}

/** Fetch one surah from the network with a retry on failure.
 * Uses cache:'reload' to ALWAYS hit the real network — bypasses browser HTTP cache.
 * This ensures re-downloads after a reset actually prove the data was cleared.
 */
async function _oqFetchSurah(id, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // cache: 'reload' = send network request, ignore & update HTTP cache
      const res = await fetch(OQ_API_BASE + id, { cache: 'reload' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return _oqParseSurahData(data, id);
    } catch (err) {
      if (attempt === retries) throw err;
      // Exponential back-off: 1s, 2s
      await new Promise(r => setTimeout(r, attempt * 1000));
    }
  }
}

/**
 * Yield to the browser between surahs so the UI stays responsive.
 * 40ms is enough to repaint the progress bar on every surah.
 */
function _oqYield() {
  return new Promise(r => setTimeout(r, 40));
}

/**
 * Main download orchestrator.
 * Calls progress callback: { downloaded, total, surahId, surahName, percent }
 */
async function oqDownloadAll(onProgress, onError, onComplete) {
  if (_oqDownloading) return;
  _oqDownloading = true;
  _oqCancelFlag  = false;

  // Determine resume point
  const lastDone = (await oqGetMeta(OQ_RESUME_KEY)) || 0;
  let downloaded = lastDone;

  // Count already-stored surahs for accurate progress
  // (In case meta is out of sync)
  const alreadyStored = await oqCountSurahs();
  downloaded = Math.max(lastDone, alreadyStored);

  for (let id = downloaded + 1; id <= OQ_TOTAL; id++) {
    // Check cancel
    if (_oqCancelFlag) {
      _oqDownloading = false;
      return;
    }

    try {
      // Fetch
      const surahData = await _oqFetchSurah(id);

      // Store in IndexedDB
      await oqSaveSurah(surahData);

      // Also update the in-memory SURAHS cache if app is loaded
      if (typeof SURAHS !== 'undefined') {
        SURAHS[id] = {
          name: surahData.name,
          ayahs: surahData.ayahs,
          sajda: surahData.sajda
        };
      }

      // Save resume pointer
      await oqSetMeta(OQ_RESUME_KEY, id);

      downloaded = id;
      const percent = Math.round((downloaded / OQ_TOTAL) * 100);
      if (onProgress) onProgress({ downloaded, total: OQ_TOTAL, surahId: id, surahName: OQ_SURAH_NAMES[id], percent });

    } catch (err) {
      // Network or parse failure
      if (onError) onError({ surahId: id, surahName: OQ_SURAH_NAMES[id], error: err.message });
      _oqDownloading = false;
      return;
    }

    // Yield between surahs to keep UI responsive
    await _oqYield();
  }

  _oqDownloading = false;
  if (onComplete) onComplete({ total: OQ_TOTAL });
}

/** Cancel the running download */
function oqCancelDownload() {
  _oqCancelFlag = true;
}

/** Check if a download is currently running */
function oqIsDownloading() {
  return _oqDownloading;
}

// ══════════════════════════════════════════════════════════
// 4. Offline-Aware Surah Loader
//    Drop-in integration with the existing loadSurah() flow
// ══════════════════════════════════════════════════════════

/**
 * Try to load a surah from IndexedDB first.
 * Returns the surah object { name, ayahs, sajda } or null.
 */
async function oqGetSurahOffline(id) {
  try {
    const stored = await oqGetSurah(parseInt(id));
    if (!stored) return null;
    return { name: stored.name, ayahs: stored.ayahs, sajda: stored.sajda };
  } catch {
    return null;
  }
}

/**
 * Attach to app.js loadSurah():
 * Call this BEFORE the network fetch — if it returns data, skip the fetch.
 * 
 * Usage in app.js loadSurah():
 *   const offlineData = await oqGetSurahOffline(id);
 *   if (offlineData) { SURAHS[id] = offlineData; }
 *   else { ... fetch from network ... }
 */
window.oqGetSurahOffline  = oqGetSurahOffline;
window.oqDownloadAll      = oqDownloadAll;
window.oqCancelDownload   = oqCancelDownload;
window.oqIsDownloading    = oqIsDownloading;
window.oqCountSurahs      = oqCountSurahs;
window.oqClearAllSurahs   = oqClearAllSurahs;
window.OQ_SURAH_NAMES     = OQ_SURAH_NAMES;

// ══════════════════════════════════════════════════════════
// 5. Download UI Controller
// ══════════════════════════════════════════════════════════

/** Show status badge next to the download button */
async function oqUpdateDownloadBadge() {
  try {
    const count = await oqCountSurahs();
    const badge = document.getElementById('oqDownloadBadge');
    if (!badge) return;

    if (count >= OQ_TOTAL) {
      badge.textContent = '✓ محفوظ';
      badge.className = 'oq-badge oq-badge--done';
    } else if (count > 0) {
      badge.textContent = count + '/' + OQ_TOTAL;
      badge.className = 'oq-badge oq-badge--partial';
    } else {
      badge.textContent = '';
      badge.className = 'oq-badge';
    }
  } catch { /* ignore */ }
}

/** Open the confirmation modal */
async function oqOpenModal() {
  const modal = document.getElementById('oqModal');
  if (!modal) return;

  const count = await oqCountSurahs();
  const resumePoint = await (async () => {
    try { return await oqGetMeta ? (await oqGetMeta(OQ_RESUME_KEY) || 0) : 0; }
    catch { return 0; }
  })();

  const infoEl = document.getElementById('oqModalInfo');
  if (infoEl) {
    if (count >= OQ_TOTAL) {
      infoEl.innerHTML = `
        <div class="oq-info-row oq-done-row">✅ القرآن الكريم محفوظ بالكامل على جهازك (${OQ_TOTAL} سورة)</div>
        <div class="oq-info-row">يمكنك حذف البيانات وإعادة التنزيل في أي وقت.</div>`;
      document.getElementById('oqBtnStart').style.display = 'none';
      document.getElementById('oqBtnReset').style.display = '';
    } else if (count > 0 || resumePoint > 0) {
      const done = Math.max(count, resumePoint);
      infoEl.innerHTML = `
        <div class="oq-info-row">📦 تم تحميل <b>${done}</b> سورة من ${OQ_TOTAL}</div>
        <div class="oq-info-row oq-hint">سيتم الاستكمال من حيث توقفت تلقائياً.</div>
        <div class="oq-info-row oq-size">المساحة المخزَّنة: ~٢–٣ ميجابايت (نص عربي مع التشكيل)</div>`;
      document.getElementById('oqBtnStart').textContent = '▶ استكمال التنزيل';
      document.getElementById('oqBtnStart').style.display = '';
    } else {
      infoEl.innerHTML = `
        <div class="oq-info-row">📖 تنزيل النص الكامل للقرآن الكريم (١١٤ سورة) على جهازك</div>
        <div class="oq-info-row oq-size">المساحة المخزَّنة: ~٢–٣ ميجابايت | يُنزَّل تدريجياً</div>
        <div class="oq-info-row oq-hint">بعد التنزيل، يعمل التطبيق بالكامل بدون إنترنت ✈️</div>`;
      document.getElementById('oqBtnStart').textContent = '⬇ ابدأ التنزيل';
      document.getElementById('oqBtnStart').style.display = '';
    }
  }

  // Hide progress section by default
  _oqShowProgress(false);

  modal.classList.add('oq-modal--open');
  document.body.style.overflow = 'hidden';
}

/** Close the download modal */
function oqCloseModal(force) {
  if (_oqDownloading && !force) return; // don't close while downloading
  const modal = document.getElementById('oqModal');
  if (modal) modal.classList.remove('oq-modal--open');
  document.body.style.overflow = '';
}

/** Toggle progress section visibility */
function _oqShowProgress(show) {
  const section = document.getElementById('oqProgressSection');
  if (section) section.style.display = show ? 'block' : 'none';
}

/** Called when user presses "Start Download" */
async function oqStartDownload() {
  if (_oqDownloading) return;

  const btnStart  = document.getElementById('oqBtnStart');
  const btnCancel = document.getElementById('oqBtnCancel');
  const btnClose  = document.getElementById('oqBtnClose');
  const infoEl    = document.getElementById('oqModalInfo');

  if (btnStart)  btnStart.style.display  = 'none';
  if (btnCancel) btnCancel.style.display = '';
  if (btnClose)  btnClose.style.display  = 'none';

  _oqShowProgress(true);
  _oqSetProgress(0, OQ_SURAH_NAMES[1], 0, OQ_TOTAL);

  await oqDownloadAll(
    // onProgress
    ({ downloaded, total, surahId, surahName, percent }) => {
      _oqSetProgress(percent, surahName, downloaded, total);
    },
    // onError
    ({ surahId, surahName, error }) => {
      _oqShowProgress(false);
      if (btnStart) {
        btnStart.textContent = '↺ إعادة المحاولة';
        btnStart.style.display = '';
      }
      if (btnCancel) btnCancel.style.display = 'none';
      if (btnClose)  btnClose.style.display  = '';

      const infoEl = document.getElementById('oqModalInfo');
      if (infoEl) {
        infoEl.innerHTML = `<div class="oq-info-row oq-error">⚠️ فشل تنزيل سورة "${surahName}". تحقق من الاتصال وأعد المحاولة.</div>`;
      }
      oqUpdateDownloadBadge();
    },
    // onComplete
    ({ total }) => {
      _oqSetProgress(100, 'اكتمل التنزيل', total, total);
      if (btnCancel) btnCancel.style.display = 'none';
      if (btnClose)  btnClose.style.display  = '';

      const infoEl = document.getElementById('oqModalInfo');
      if (infoEl) {
        infoEl.innerHTML = `<div class="oq-info-row oq-done-row">🎉 تم تنزيل القرآن الكريم بالكامل! يعمل الآن بدون إنترنت.</div>`;
      }
      oqUpdateDownloadBadge();
      if (typeof showToast === 'function') showToast('✅ تم تنزيل القرآن الكريم بالكامل!');
    }
  );
}

/** Cancel ongoing download */
function oqUserCancel() {
  oqCancelDownload();
  const btnStart  = document.getElementById('oqBtnStart');
  const btnCancel = document.getElementById('oqBtnCancel');
  const btnClose  = document.getElementById('oqBtnClose');

  if (btnCancel) btnCancel.style.display = 'none';
  if (btnClose)  btnClose.style.display  = '';
  if (btnStart) {
    btnStart.textContent = '▶ استكمال التنزيل';
    btnStart.style.display = '';
  }

  const infoEl = document.getElementById('oqModalInfo');
  if (infoEl) {
    infoEl.innerHTML += `<div class="oq-info-row oq-hint" style="margin-top:8px">⏸ تم إيقاف التنزيل. يمكنك الاستكمال لاحقاً.</div>`;
  }
  oqUpdateDownloadBadge();
}

/** Update progress bar UI */
function _oqSetProgress(percent, surahName, downloaded, total) {
  const fill  = document.getElementById('oqProgressFill');
  const pct   = document.getElementById('oqProgressPct');
  const label = document.getElementById('oqProgressLabel');
  const count = document.getElementById('oqProgressCount');

  if (fill)  fill.style.width  = percent + '%';
  if (pct)   pct.textContent   = percent + '%';
  if (label) label.textContent = surahName ? 'جاري: سورة ' + surahName : '';
  if (count) count.textContent = downloaded + ' / ' + total + ' سورة';
}



// ══════════════════════════════════════════════════════════
// 6. App Integration: Patch loadSurah() to prefer IndexedDB
// ══════════════════════════════════════════════════════════

/**
 * This patches the existing app.js loadSurah() by hooking into
 * the localStorage surah cache check — we add IndexedDB as a
 * higher-priority source BEFORE localStorage / network.
 *
 * Call oqPatchLoadSurah() once after both scripts are loaded.
 */
function oqPatchLoadSurah() {
  const _originalLoadSurah = window.loadSurah;
  if (!_originalLoadSurah) return;

  window.loadSurah = async function(id) {
    const numId = parseInt(id);

    // If not in memory, try IndexedDB first
    if (typeof SURAHS !== 'undefined' && !SURAHS[numId]) {
      const offline = await oqGetSurahOffline(numId);
      if (offline) {
        SURAHS[numId] = offline;
      }
    }

    // Then call original (which will find it in SURAHS cache and skip network)
    return _originalLoadSurah.call(this, id);
  };
}

// ══════════════════════════════════════════════════════════
// 7. Init: run on page load
// ══════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  // Update badge with current download count
  await oqUpdateDownloadBadge();

  // Patch loadSurah to prefer IndexedDB
  oqPatchLoadSurah();

  // Expose modal functions globally for onclick attributes
  window.oqOpenModal    = oqOpenModal;
  window.oqCloseModal   = oqCloseModal;
  window.oqStartDownload = oqStartDownload;
  window.oqUserCancel   = oqUserCancel;
});
