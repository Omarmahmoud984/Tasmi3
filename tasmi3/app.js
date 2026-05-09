// ── Data ──
const SURAHS = {};

// ── Tafsir cache version — bump this when switching API endpoints ──
// v3 = reverted to /tafsirs/by_ayah/ (the correct working endpoint)
const TAFSIR_CACHE_VERSION = 'v3';
const _tafsirVersionKey = 'tasmi3_tafsir_cache_ver';
try {
  if (localStorage.getItem(_tafsirVersionKey) !== TAFSIR_CACHE_VERSION) {
    // Purge all stale tafsir cache entries fetched with the old endpoint
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('tasmi3_tafsir_')) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    localStorage.setItem(_tafsirVersionKey, TAFSIR_CACHE_VERSION);
  }
} catch (e) { }

// ── Arabic Search Normalization ──
// Compiled once; strips all diacritics (tashkeel), Quranic annotation signs,
// and tatweel so search works with or without diacritics.
// Dagger alif (U+0670) is replaced with normal alef (not stripped) because
// Also strips invisible Unicode: HAIR SPACE, ZWSP, ZWNJ, ZWJ, WORD JOINER, BOM.
const _ARABIC_DIACRITICS_RE = /[\u064B-\u065F\u06D6-\u06ED\u0640\u200A\u200B\u200C\u200D\u2060\uFEFF]/g;
const _ALEF_RE = /[أإآٱ\u0670]/g;
const _YA_RE = /[ىئ\u06CC]/g;
const _WAW_HAMZA_RE = /ؤ/g;
function normalizeArabic(text) {
  return text.replace(_ALEF_RE, 'ا').replace(_ARABIC_DIACRITICS_RE, '').replace(_YA_RE, 'ي').replace(_WAW_HAMZA_RE, 'و');
}

// ── Search Highlight Helpers ──
// Used when navigating from search.html → index.html?surah=X&ayah=Y&q=QUERY
// Highlights the matched query text inside the ayah while preserving diacritics.

function _highlightInNode(container, query) {
  const fullText = container.textContent;
  const normQuery = normalizeArabic(query);
  if (!normQuery || !fullText) return;

  // Walk all text nodes, collect them with their positions
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  let node;
  while (node = walker.nextNode()) {
    nodes.push({ node, start: 0, text: node.textContent });
  }
  let cum = 0;
  for (const n of nodes) { n.start = cum; cum += n.text.length; }

  // Build norm map (with ا kept)
  function _buildMap(stripAlef) {
    const chars = [], map = [];
    let pendingPos = -1;
    for (let i = 0; i < fullText.length; i++) {
      const ch = fullText[i];
      _ARABIC_DIACRITICS_RE.lastIndex = 0;
      if (_ARABIC_DIACRITICS_RE.test(ch)) continue;
      const nc = ch.replace(_ALEF_RE, 'ا').replace(_YA_RE, 'ي');
      if (stripAlef && nc === 'ا') {
        if (pendingPos === -1) pendingPos = i;
        continue;
      }
      map.push(stripAlef && pendingPos !== -1 ? pendingPos : i);
      pendingPos = -1;
      chars.push(nc);
    }
    return { normalized: chars.join(''), map };
  }

  // Find matches in a normalized string
  function _findMatches(normalized, q, map) {
    const matches = [];
    let si = 0;
    while (si <= normalized.length - q.length) {
      const found = normalized.indexOf(q, si);
      if (found === -1) break;
      const origStart = map[found];
      const origEnd = (found + q.length < map.length) ? map[found + q.length] : fullText.length;
      matches.push({ start: origStart, end: origEnd });
      si = found + q.length;
    }
    return matches;
  }

  // Try exact match first, then loose (strip ا)
  let { normalized, map } = _buildMap(false);
  let matches = _findMatches(normalized, normQuery, map);

  if (!matches.length) {
    const loose = _buildMap(true);
    const looseQ = normQuery.replace(/ا/g, '');
    if (looseQ) matches = _findMatches(loose.normalized, looseQ, loose.map);
  }
  if (!matches.length) return;

  // Apply <mark> (backwards to preserve positions)
  for (let mi = matches.length - 1; mi >= 0; mi--) {
    const m = matches[mi];
    for (let ni = nodes.length - 1; ni >= 0; ni--) {
      const n = nodes[ni];
      const nEnd = n.start + n.text.length;
      if (m.start >= nEnd || m.end <= n.start) continue;
      const localStart = Math.max(0, m.start - n.start);
      const localEnd = Math.min(n.text.length, m.end - n.start);
      const before = n.node.textContent.slice(0, localStart);
      const matched = n.node.textContent.slice(localStart, localEnd);
      const after = n.node.textContent.slice(localEnd);

      const frag = document.createDocumentFragment();
      if (before) frag.appendChild(document.createTextNode(before));
      const mark = document.createElement('mark');
      mark.textContent = matched;
      frag.appendChild(mark);
      if (after) frag.appendChild(document.createTextNode(after));
      n.node.parentNode.replaceChild(frag, n.node);
    }
  }
}


/** Normal mode: highlight query inside .ayah-text of a specific block */
function _applySearchHighlight(block, query) {
  const textDiv = block.querySelector('.ayah-text');
  if (textDiv) _highlightInNode(textDiv, query);
}

/** Mushaf mode: highlight query only within a specific ayah's words in .mushaf-text */
function _applySearchHighlightMushaf(query, ayahIdx) {
  const mushafP = document.querySelector('.mushaf-text');
  if (!mushafP || ayahIdx === null || ayahIdx === undefined) return;

  const wordSpans = mushafP.querySelectorAll(`.word[data-ayah="${ayahIdx}"]`);
  if (!wordSpans.length) return;

  const texts = Array.from(wordSpans).map(s => s.textContent);
  const fullText = texts.join(' ');
  const normQuery = normalizeArabic(query);
  if (!normQuery) return;

  // Build norm map, optionally stripping ا
  function _buildMap(stripAlef) {
    const chars = [], map = [];
    let pendingPos = -1;
    for (let i = 0; i < fullText.length; i++) {
      const ch = fullText[i];
      _ARABIC_DIACRITICS_RE.lastIndex = 0;
      if (_ARABIC_DIACRITICS_RE.test(ch)) continue;
      const nc = ch.replace(_ALEF_RE, 'ا').replace(_YA_RE, 'ي');
      if (stripAlef && nc === 'ا') {
        if (pendingPos === -1) pendingPos = i;
        continue;
      }
      map.push(stripAlef && pendingPos !== -1 ? pendingPos : i);
      pendingPos = -1;
      chars.push(nc);
    }
    return { normalized: chars.join(''), map };
  }

  function _findMatches(normalized, q, map) {
    const matches = [];
    let si = 0;
    while (si <= normalized.length - q.length) {
      const found = normalized.indexOf(q, si);
      if (found === -1) break;
      const origStart = map[found];
      const origEnd = (found + q.length < map.length) ? map[found + q.length] : fullText.length;
      matches.push({ start: origStart, end: origEnd });
      si = found + q.length;
    }
    return matches;
  }

  // Try exact, then loose
  let { normalized, map } = _buildMap(false);
  let matches = _findMatches(normalized, normQuery, map);
  if (!matches.length) {
    const loose = _buildMap(true);
    const looseQ = normQuery.replace(/ا/g, '');
    if (looseQ) matches = _findMatches(loose.normalized, looseQ, loose.map);
  }
  if (!matches.length) return;

  // Map character positions back to individual word spans
  let offset = 0;
  const wordOffsets = [];
  for (const span of wordSpans) {
    const len = span.textContent.length;
    wordOffsets.push({ span, start: offset, end: offset + len });
    offset += len + 1;
  }

  // Apply <mark> to overlapping word spans
  for (const m of matches) {
    for (const wo of wordOffsets) {
      if (m.start >= wo.end || m.end <= wo.start) continue;
      const wordText = wo.span.querySelector('.word-text');
      if (!wordText) continue;
      const txt = wordText.textContent;
      const localStart = Math.max(0, m.start - wo.start);
      const localEnd = Math.min(txt.length, m.end - wo.start);

      const before = txt.slice(0, localStart);
      const matched = txt.slice(localStart, localEnd);
      const after = txt.slice(localEnd);

      wordText.innerHTML = '';
      if (before) wordText.appendChild(document.createTextNode(before));
      const mark = document.createElement('mark');
      mark.textContent = matched;
      wordText.appendChild(mark);
      if (after) wordText.appendChild(document.createTextNode(after));
    }
  }
}


// ── State ──
let hideDelay = 4000;
let totalWords = 0;
let revealedCount = 0;
let currentSurah = 1;

// ── Search Navigation State (persists across mode toggles) ──
let _searchHighlightQuery = null;  // e.g. "الله لا اله"
let _searchHighlightAyah = null;  // 0-based ayah index
let isHardcoreMode = false;
let wordTimers = {};

// ── Progressive Loading State ──
const BATCH_SIZE = 25;
let _loadedUpTo = 0;
let _savedWordsForCurrentSurah = []; // words saved from prev session for not-yet-rendered ayahs
let _scrollListener = null;
let _lastInteractedAyah = 0;

function _setInteraction(idx) {
  _lastInteractedAyah = parseInt(idx);
}

function saveRevealedState() {
  const revealedWords = [];
  document.querySelectorAll('.word.revealed, .word.fading').forEach(span => {
    revealedWords.push(span.dataset.id);
  });
  // Also preserve saved words for ayahs not yet rendered in the DOM
  _savedWordsForCurrentSurah.forEach(wordId => {
    const ayahIdx = parseInt(wordId.split('-')[0]);
    if (ayahIdx >= _loadedUpTo && !revealedWords.includes(wordId)) {
      revealedWords.push(wordId);
    }
  });
  _savedWordsForCurrentSurah = revealedWords;
  const saved = JSON.parse(localStorage.getItem('tasmi3_revealed_state')) || {};
  saved[currentSurah] = revealedWords;
  localStorage.setItem('tasmi3_revealed_state', JSON.stringify(saved));
}

function selectDelay(el) {
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  hideDelay = parseInt(el.dataset.sec) * 1000;
  document.getElementById('timerSec').textContent = el.dataset.sec;
  if (hideDelay >= 9999000) {
    document.getElementById('timerBadge').style.display = 'none';
  }
}

// ── Global Dhikr Popup Logic ──
let dhikrTimeout;
let autoHideTimeout;

// ── Toast Notification ──
function showToast(msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast-msg';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 8000);
}

// ── PWA Install & Update Logic ──
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Button is always visible now as requested, so we just store the event
});

window.installApp = async function () {
  if (deferredPrompt) {
    // If it's installable, trigger prompt
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      deferredPrompt = null;
    }
  } else {
    // Force aggressive update: unregister SW and purge Cache Storage
    showToast('جاري تحديث التطبيق وتنزيل أحدث نسخة...');

    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        // Delete all caches to force a clean update
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      } catch (err) { }
    }

    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
        }
      } catch (err) { }
    }

    setTimeout(() => {
      window.location.reload(true);
    }, 1500);
  }
};

function scheduleNextDhikr() {
  // Try again in 2 minutes
  dhikrTimeout = setTimeout(showDhikrPopup, 120000);
}

function isDhikrPopupEnabled() {
  const saved = localStorage.getItem('tasmi3_dhikr_popup_enabled');
  return saved === null ? true : saved === 'true'; // default ON
}

function toggleDhikrPopupSetting(checkbox) {
  const enabled = checkbox.checked;
  localStorage.setItem('tasmi3_dhikr_popup_enabled', String(enabled));
  if (!enabled) {
    // immediately hide if shown
    clearTimeout(dhikrTimeout);
    clearTimeout(autoHideTimeout);
    const popup = document.getElementById('globalDhikrPopup');
    if (popup) popup.classList.remove('show');
  } else {
    // restart the cycle
    clearTimeout(dhikrTimeout);
    scheduleNextDhikr();
  }
}

function showDhikrPopup() {
  if (!isDhikrPopupEnabled()) {
    // Don't show, don't reschedule
    return;
  }

  const popup = document.getElementById('globalDhikrPopup');
  const overlay = document.getElementById('overlay');

  // Show if overlay is hide (startApp) or none (navigated via ?surah=)
  const isOverlayHidden = !overlay || overlay.classList.contains('hide') || overlay.style.display === 'none';

  if (popup && isOverlayHidden) {
    popup.classList.add('show');

    // Auto-hide after 6 seconds
    clearTimeout(autoHideTimeout);
    autoHideTimeout = setTimeout(() => {
      closeDhikrPopup();
    }, 6000);
  } else {
    // If we couldn't show it (e.g. still in tutorial), simply schedule the next one
    scheduleNextDhikr();
  }
}

function closeDhikrPopup() {
  const popup = document.getElementById('globalDhikrPopup');
  if (popup) popup.classList.remove('show');

  clearTimeout(autoHideTimeout);

  // Schedule the next popup ONLY after this one fully closes
  clearTimeout(dhikrTimeout);
  scheduleNextDhikr();
}

// Init checkbox state from saved preference
document.addEventListener('DOMContentLoaded', () => {
  const cb = document.getElementById('toggleDhikrPopup');
  if (cb) cb.checked = isDhikrPopupEnabled();
});

// Start the first cycle only if enabled
if (isDhikrPopupEnabled()) {
  scheduleNextDhikr();
}

// ── Tasbeeh Logic ──
let tasbeehCount = 0;

function toggleSidebar() {
  const sidebar = document.getElementById('tasbeehSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar.classList.toggle('show');
  overlay.classList.toggle('show');
}

function toggleNavSidebar() {
  const sidebar = document.getElementById('navSidebar');
  const overlay = document.getElementById('navSidebarOverlay');
  sidebar.classList.toggle('show');
  overlay.classList.toggle('show');
}

function toggleHeader() {
  const header = document.querySelector('header');
  const btn = document.getElementById('btnHeaderToggle');
  header.classList.toggle('collapsed');
  if (header.classList.contains('collapsed')) {
    btn.innerHTML = '▼';
  } else {
    btn.innerHTML = '▲';
  }
}

function toggleBottomBar() {
  const bar = document.querySelector('.bottom-bar');
  const btn = document.getElementById('btnBottomToggle');
  bar.classList.toggle('collapsed');
  if (bar.classList.contains('collapsed')) {
    btn.innerHTML = '▲';
  } else {
    btn.innerHTML = '▼';
  }
}

function toggleSurahStatus(val) {
  if (!currentSurah) return;
  const statuses = JSON.parse(localStorage.getItem('tasmi3_surah_status') || '{}');

  if (statuses[currentSurah] === val) {
    delete statuses[currentSurah];
  } else {
    statuses[currentSurah] = val;
  }

  localStorage.setItem('tasmi3_surah_status', JSON.stringify(statuses));
  updateStatusButtons();
}

function updateStatusButtons() {
  const statuses = JSON.parse(localStorage.getItem('tasmi3_surah_status') || '{}');
  const currentStat = statuses[currentSurah] || '';

  ['needs_review', 'good', 'perfect'].forEach(stat => {
    const btn = document.getElementById('btnStatus_' + stat);
    if (btn) {
      if (currentStat === stat) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });
}

function incrementTasbeeh() {
  tasbeehCount++;
  const circle = document.getElementById('tasbeehCircle');
  circle.textContent = tasbeehCount;

  // Animation effect
  circle.style.transform = 'scale(0.9)';
  setTimeout(() => circle.style.transform = '', 100);
}

function resetTasbeeh() {
  tasbeehCount = 0;
  document.getElementById('tasbeehCircle').textContent = tasbeehCount;
}

async function startApp() {
  const btn = document.querySelector('.overlay-btn');

  // Check for SW update before proceeding
  if ('serviceWorker' in navigator && window._swReg) {
    try {
      if (btn) {
        btn.textContent = 'جاري التحقّق من التحديثات...';
        btn.disabled = true;
      }

      // Trigger a network check for a new SW
      await window._swReg.update();

      if (window._swReg.installing || window._swReg.waiting) {
        // A new version is being installed — reload will happen automatically
        // via the controllerchange listener. Show feedback and wait.
        if (btn) btn.textContent = '🔄 يتم تحديث التطبيق...';
        // Safety fallback: if reload hasn't happened in 4s, force it
        setTimeout(() => window.location.reload(true), 4000);
        return;
      }
    } catch (e) {
      // Network unavailable — proceed offline
    }
  }

  _proceedStartApp();
}

function _proceedStartApp() {
  const ov = document.getElementById('overlay');
  ov.classList.add('hide');
  setTimeout(() => ov.style.display = 'none', 400);

  const urlParams = new URLSearchParams(window.location.search);
  const surahParam = urlParams.get('surah');
  const ayahParam = urlParams.get('ayah');
  const lastSurah = localStorage.getItem('tasmi3_last_surah') || currentSurah;

  const targetSurah = (surahParam && parseInt(surahParam) >= 1 && parseInt(surahParam) <= 114) ? surahParam : lastSurah;

  loadSurah(targetSurah).then(() => {
    if (ayahParam) {
      const ayahIdx = parseInt(ayahParam) - 1; // 0-based index
      if (ayahIdx >= 0) {
        // Force-render ayahs up to the target (handles progressive loading)
        _ensureAyahsLoadedUpTo(ayahIdx);

        // Find the ayah block and scroll to it
        setTimeout(() => {
          const block = document.querySelector(`.ayah-block[data-ayah-idx="${ayahIdx}"]`);
          if (block) {
            block.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Brief gold flash to highlight the target ayah
            block.style.transition = 'box-shadow 0.3s, border-color 0.3s';
            block.style.boxShadow = '0 0 20px rgba(212,168,83,0.5)';
            block.style.borderColor = 'var(--gold)';
            setTimeout(() => {
              block.style.boxShadow = '';
              block.style.borderColor = '';
            }, 2000);
          }
        }, 150);
      }
    }
  });
}

async function loadSurah(id) {
  currentSurah = parseInt(id);

  if (!SURAHS[id]) {
    const container = document.getElementById('ayahsContainer');
    container.innerHTML = '<div style="text-align:center; color: var(--gold); font-size: 1.5rem; margin-top: 40px; animation: sajdaPulse 1.5s infinite;">جاري التحميل...</div>';

    // ── Priority 1: Direct IndexedDB lookup (no dependency on offline_quran.js load timing) ──
    // This fixes a race condition: initApi() can call loadSurah() before offline_quran.js loads,
    // making typeof oqGetSurahOffline === 'function' false and silently skipping IDB.
    try {
      const _idb = await new Promise((res, rej) => {
        const r = indexedDB.open('tasmi3_quran_offline', 1);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej();
      });
      const _stored = await new Promise((res) => {
        const tx = _idb.transaction('surahs', 'readonly');
        const req = tx.objectStore('surahs').get(parseInt(id));
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => res(null);
      });
      if (_stored && Array.isArray(_stored.ayahs) && _stored.ayahs.length > 0) {
        SURAHS[id] = { name: _stored.name, ayahs: _stored.ayahs, sajda: _stored.sajda };
      }
    } catch { /* IDB unavailable — fall through to localStorage/network */ }

    if (!SURAHS[id]) {
      // ── Priority 2: localStorage cache → Priority 3: Network ──
      try {
        let data;
        const surahApiUrl = 'https://api.alquran.cloud/v1/surah/' + id;

        let cachedSurah = localStorage.getItem('tasmi3_api_surah_' + id);
        if (cachedSurah) {
          data = JSON.parse(cachedSurah);
        } else {
          const res = await fetch(surahApiUrl);
          if (!res.ok) throw new Error('Network Error');
          data = await res.json();
          try { localStorage.setItem('tasmi3_api_surah_' + id, JSON.stringify(data)); } catch (e) { }
        }

        let ayahsList = [];
        data.data.ayahs.forEach((a, i) => {
          let text = a.text;
          // Strip Bismillah from first ayah (robust - strips diacritics to detect)
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

        SURAHS[id] = {
          name: data.data.name.replace('سُورَةُ ', '').replace('سورة ', ''),
          ayahs: ayahsList,
          sajda: sajdaIndex
        };
      } catch (err) {
        const _offlineMsg = !navigator.onLine
          ? 'أنت غير متصل بالإنترنت — هذه السورة غير محفوظة محلياً.<br><small style="opacity:0.75">من القائمة (☰) اختر 📥 تنزيل القرآن أوفلاين لتنزيل المصحف كاملاً</small>'
          : 'فشل التحميل. تأكد من الاتصال بالإنترنت.';
        container.innerHTML = `<div style="text-align:center;color:#ff8888;font-size:1.1rem;margin-top:40px;padding:20px;line-height:2">${_offlineMsg}</div>`;
        return;
      }
    }
  }

  const surah = SURAHS[id];
  if (!surah) return;

  // If mushaf mode is active, delegate to mushaf renderer instead
  if (isMushafMode) {
    localStorage.setItem('tasmi3_last_surah', id);
    renderMushafMode(id);
    return;
  }

  // Reset state
  totalWords = 0;
  revealedCount = 0;
  Object.values(wordTimers).forEach(clearTimeout);
  wordTimers = {};
  stopAllAudio();
  _loadedUpTo = 0;
  _savedWordsForCurrentSurah = [];
  if (_scrollListener) { window.removeEventListener('scroll', _scrollListener); _scrollListener = null; }

  const btnPlayWhole = document.getElementById('btnPlayWholeSurah');
  if (btnPlayWhole) {
    btnPlayWhole.style.display = 'block';
  }

  // Restore bismillah visibility for normal mode
  const bismillahDiv = document.getElementById('bismillah');
  if (bismillahDiv) bismillahDiv.style.display = '';

  const container = document.getElementById('ayahsContainer');
  container.innerHTML = '';

  // Compute totalWords for ALL ayahs upfront
  totalWords = surah.ayahs.reduce((sum, ayah) => sum + ayah.split(' ').filter(w => w.length > 0).length, 0);

  // Auto-migrate saved state to fix corrupted indices from previous empty-word bugs
  const savedState = JSON.parse(localStorage.getItem('tasmi3_revealed_state')) || {};
  const rawSavedWords = savedState[id] || [];
  const ayahWordCounts = {};
  rawSavedWords.forEach(idStr => {
    const parts = idStr.split('-');
    if (parts.length === 2) ayahWordCounts[parts[0]] = (ayahWordCounts[parts[0]] || 0) + 1;
  });

  _savedWordsForCurrentSurah = [];
  _lastInteractedAyah = 0;
  Object.keys(ayahWordCounts).forEach(aIdxStr => {
    const aIdx = parseInt(aIdxStr);
    if (aIdx >= surah.ayahs.length) return;
    if (aIdx > _lastInteractedAyah) _lastInteractedAyah = aIdx;
    const newWordsCount = surah.ayahs[aIdx].split(' ').filter(w => w.length > 0).length;
    const revealCount = Math.min(ayahWordCounts[aIdxStr], newWordsCount);
    for (let wIdx = 0; wIdx < revealCount; wIdx++) {
      _savedWordsForCurrentSurah.push(`${aIdx}-${wIdx}`);
    }
  });
  revealedCount = _savedWordsForCurrentSurah.length;

  // Render first batch of ayahs
  const initialEnd = Math.min(BATCH_SIZE, surah.ayahs.length);
  for (let idx = 0; idx < initialEnd; idx++) {
    const block = createAyahBlock(idx, surah, idx < 12);
    _restoreBlockState(block, idx);
    container.appendChild(block);
  }
  _loadedUpTo = initialEnd;

  localStorage.setItem('tasmi3_last_surah', id);
  updateStats();

  // Setup append-only progressive scroll loading (no jumps — we never remove from top)
  _scrollListener = function () { _loadMoreAyahs(); };
  window.addEventListener('scroll', _scrollListener, { passive: true });

  // Next surah card — prefer in-memory SURAHS cache, fall back to select option
  const nextId = parseInt(id) < 114 ? parseInt(id) + 1 : null;
  if (nextId) {
    let nextName;
    if (SURAHS[nextId] && SURAHS[nextId].name) {
      nextName = SURAHS[nextId].name;
    } else {
      const nativeSelect = document.getElementById('surahSelect');
      const opt = nativeSelect ? nativeSelect.querySelector(`option[value="${nextId}"]`) : null;
      nextName = opt ? opt.text : ('سورة ' + nextId);
    }

    const card = document.createElement('div');
    card.className = 'next-surah-card';
    card.innerHTML = `
      <div class="next-surah-label">السورة التالية</div>
      <div class="next-surah-name">${nextName}</div>
      <button class="btn-next-surah" onclick="goNextSurah(${nextId})">
        <span>انتقل إلى ${nextName}</span>
        <span class="arrow">←</span>
      </button>
    `;
    container.appendChild(card);
  }

  // Load Status
  updateStatusButtons();
}

function goNextSurah(id) {
  document.getElementById('surahSelect').value = id;
  const opt = document.querySelector(`#surahSelect option[value="${id}"]`);
  if (opt) document.getElementById('customSurahText').textContent = opt.text;
  loadSurah(id);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function revealWord(span) {
  if (!span.classList.contains('hidden') && !span.classList.contains('fading') && !span.classList.contains('hinted')) return;

  const id = span.dataset.id;
  if (!id) return;
  _setInteraction(id.split('-')[0]);

  if (wordTimers[id]) {
    clearTimeout(wordTimers[id]);
    delete wordTimers[id];
  }

  const wasHidden = span.classList.contains('hidden') || span.classList.contains('fading');
  const wasHinted = span.classList.contains('hinted');

  span.classList.remove('hidden', 'fading', 'hinted');
  span.classList.add('revealed');

  if (wasHidden || wasHinted) {
    if (!wasHinted) {
      revealedCount++;
    } else if (wasHinted) {
      // if it was hinted, count it, wait, when we hint it we DID NOT increment revealedCount
      revealedCount++;
    }
    updateStats();
  }
}

function toArabicNum(n) {
  return String(n + 1).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

let currentNWordsPattern = 2;
function changeNWords(delta) {
  let val = currentNWordsPattern + delta;
  if (val < 1) val = 1;
  if (val > 5) val = 5;
  currentNWordsPattern = val;
  const ar = ['١', '٢', '٣', '٤', '٥'];
  document.getElementById('btnRevealN').textContent = 'كشف ' + ar[val - 1] + ' كلمة';
}

function _ensureAyahsLoadedUpTo(targetIdx) {
  const surah = SURAHS[currentSurah];
  if (!surah || isMushafMode) return;

  if (targetIdx >= _loadedUpTo) {
    const container = document.getElementById('ayahsContainer');
    const nextCard = container ? container.querySelector('.next-surah-card') : null;
    const end = Math.min(targetIdx + 5, surah.ayahs.length);
    const frag = document.createDocumentFragment();
    for (let idx = _loadedUpTo; idx < end; idx++) {
      const block = createAyahBlock(idx, surah, false);
      _restoreBlockState(block, idx);
      frag.appendChild(block);
    }
    if (nextCard) container.insertBefore(frag, nextCard);
    else if (container) container.appendChild(frag);
    _loadedUpTo = end;
  }
}

function getNextTargetIndex() {
  const surah = SURAHS[currentSurah];
  if (!surah) return -1;
  if (revealedCount >= totalWords && totalWords > 0) return -1;

  const revealedSet = new Set(_savedWordsForCurrentSurah);

  for (let i = _lastInteractedAyah; i < surah.ayahs.length; i++) {
    const wordCount = surah.ayahs[i].split(' ').filter(w => w.length > 0).length;
    let revealedInAyah = 0;
    for (let w = 0; w < wordCount; w++) {
      if (revealedSet.has(`${i}-${w}`)) revealedInAyah++;
    }
    if (revealedInAyah < wordCount) return i;
  }

  for (let i = 0; i < _lastInteractedAyah; i++) {
    const wordCount = surah.ayahs[i].split(' ').filter(w => w.length > 0).length;
    let revealedInAyah = 0;
    for (let w = 0; w < wordCount; w++) {
      if (revealedSet.has(`${i}-${w}`)) revealedInAyah++;
    }
    if (revealedInAyah < wordCount) return i;
  }

  return -1;
}

function revealNextAyah() {
  const targetIndex = getNextTargetIndex();
  if (targetIndex === -1) return;

  _setInteraction(targetIndex);

  _ensureAyahsLoadedUpTo(targetIndex);

  if (isMushafMode) {
    const paragraph = document.querySelector('.mushaf-text');
    if (paragraph) {
      paragraph.querySelectorAll(`.word[data-ayah="${targetIndex}"]`).forEach(span => {
        if (span.classList.contains('hidden') || span.classList.contains('fading') || span.classList.contains('hinted')) {
          span.classList.remove('hidden', 'fading', 'hinted');
          span.classList.add('revealed');
          revealedCount++;
        }
      });
      const firstWord = paragraph.querySelector(`.word[data-ayah="${targetIndex}"]`);
      if (firstWord) firstWord.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else {
    const block = document.querySelector(`.ayah-block[data-ayah-idx="${targetIndex}"]`);
    if (block) {
      block.querySelectorAll('.word').forEach(span => {
        if (span.classList.contains('hidden') || span.classList.contains('fading') || span.classList.contains('hinted')) {
          span.classList.remove('hidden', 'fading', 'hinted');
          span.classList.add('revealed');
          revealedCount++;
        }
      });
      block.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  updateStats();
}

function revealNWords() {
  const n = currentNWordsPattern;
  let count = 0;
  let lastWord = null;

  const surah = SURAHS[currentSurah];
  if (!surah) return;

  let startIdx = getNextTargetIndex();
  if (startIdx === -1) startIdx = 0;

  _setInteraction(startIdx);

  for (let i = startIdx; i < surah.ayahs.length && count < n; i++) {
    _ensureAyahsLoadedUpTo(i);

    let container;
    if (isMushafMode) container = document.querySelector('.mushaf-text');
    else container = document.querySelector(`.ayah-block[data-ayah-idx="${i}"]`);

    if (!container) continue;

    const query = isMushafMode
      ? `.word.hidden[data-ayah="${i}"], .word.fading[data-ayah="${i}"], .word.hinted[data-ayah="${i}"]`
      : `.word.hidden, .word.fading, .word.hinted`;

    const hiddenWords = Array.from(container.querySelectorAll(query));
    for (let j = 0; j < hiddenWords.length && count < n; j++) {
      const word = hiddenWords[j];
      word.classList.remove('hidden', 'fading', 'hinted');
      word.classList.add('revealed');
      revealedCount++;
      count++;
      lastWord = word;
    }
  }

  // If there are still words to reveal (e.g. skipped words in older ayahs)
  if (count < n) {
    const allHidden = document.querySelectorAll('.word.hidden, .word.fading, .word.hinted');
    for (let i = 0; i < allHidden.length && count < n; i++) {
      const word = allHidden[i];
      word.classList.remove('hidden', 'fading', 'hinted');
      word.classList.add('revealed');
      revealedCount++;
      count++;
      lastWord = word;
    }
  }

  updateStats();

  if (lastWord) {
    const rect = lastWord.getBoundingClientRect();
    const bottomBarHeight = document.querySelector('.bottom-bar').offsetHeight || 80;
    // Scroll only if the word is hidden behind the bottom bar or scrolled above viewport
    if (rect.bottom > window.innerHeight - bottomBarHeight - 20 || rect.top < 80) {
      lastWord.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

let _resetUndoTimeout = null;
function resetSurah() {
  // Show undo toast for 4 seconds before actually resetting
  if (_resetUndoTimeout) return; // already pending

  const surahBeingReset = currentSurah;
  const undoEl = document.createElement('div');
  undoEl.className = 'toast-msg';
  undoEl.style.cssText = 'display:flex;align-items:center;gap:12px;animation:none;opacity:1;transform:none;pointer-events:auto;';
  undoEl.innerHTML = `<span>سيتم مسح التقدم خلال ٤ ثواني...</span><button onclick="cancelReset()" style="background:var(--gold);color:#000;border:none;padding:4px 10px;border-radius:6px;font-family:Cairo;font-weight:bold;cursor:pointer;">تراجع</button>`;
  const container = document.getElementById('toastContainer');
  if (container) container.appendChild(undoEl);

  _resetUndoTimeout = setTimeout(() => {
    _resetUndoTimeout = null;
    if (undoEl.parentNode) undoEl.remove();
    // Perform the actual reset
    const saved = JSON.parse(localStorage.getItem('tasmi3_revealed_state')) || {};
    delete saved[surahBeingReset];
    localStorage.setItem('tasmi3_revealed_state', JSON.stringify(saved));
    loadSurah(surahBeingReset);
    showToast('تم إعادة ضبط السورة ✓');
  }, 4000);
}

function cancelReset() {
  if (_resetUndoTimeout) {
    clearTimeout(_resetUndoTimeout);
    _resetUndoTimeout = null;
  }
  // Remove pending undo toast
  const container = document.getElementById('toastContainer');
  if (container) container.innerHTML = '';
  showToast('تم إلغاء الريست ✓');
}

function revealAll() {
  document.querySelectorAll('.word').forEach(span => {
    const id = span.dataset.id;
    if (wordTimers[id]) { clearTimeout(wordTimers[id]); delete wordTimers[id]; }
    span.classList.remove('hidden', 'fading', 'hinted');
    span.classList.add('revealed');
  });
  // Also mark all not-yet-rendered ayahs as fully revealed so progress is saved
  const surahForReveal = SURAHS[currentSurah];
  if (surahForReveal) {
    const allWordIds = [];
    surahForReveal.ayahs.forEach((ayah, idx) => {
      ayah.split(' ').filter(w => w.length > 0).forEach((_, wi) => allWordIds.push(`${idx}-${wi}`));
    });
    _savedWordsForCurrentSurah = allWordIds;
    const savedAll = JSON.parse(localStorage.getItem('tasmi3_revealed_state')) || {};
    savedAll[currentSurah] = allWordIds;
    localStorage.setItem('tasmi3_revealed_state', JSON.stringify(savedAll));
  }
  revealedCount = totalWords;
  updateStats();
}

function updateStats() {
  saveRevealedState();
  document.getElementById('statRevealed').textContent = revealedCount;
  document.getElementById('statTotal').textContent = totalWords;
  const pct = totalWords > 0 ? Math.round((revealedCount / totalWords) * 100) : 0;
  document.getElementById('statPct').textContent = pct + '%';
  document.getElementById('progressFill').style.width = pct + '%';

  const btn = document.getElementById('btnRevealAyah');
  if (btn) {
    const targetIdx = getNextTargetIndex();
    if (targetIdx !== -1) {
      btn.innerHTML = 'إظهار الآية <span id="nextAyahNum">' + toArabicNum(targetIdx) + '</span>';
      btn.disabled = false;
      btn.style.opacity = '1';
    } else {
      btn.innerHTML = '✓ كل الآيات';
      btn.disabled = true;
      btn.style.opacity = '0.4';
    }
  }
}

// ── Progressive Loading Functions ──

// Restore revealed state for a freshly created block (from saved localStorage data)
function _restoreBlockState(block, idx) {
  _savedWordsForCurrentSurah.forEach(wordId => {
    if (parseInt(wordId.split('-')[0]) !== idx) return;
    const span = block.querySelector(`.word[data-id="${wordId}"]`);
    if (span) {
      span.classList.remove('hidden', 'fading');
      span.classList.add('revealed');
    }
  });
}

// Append the next batch of ayahs when the user scrolls near the bottom
function _loadMoreAyahs() {
  const surah = SURAHS[currentSurah];
  if (!surah || _loadedUpTo >= surah.ayahs.length) return;

  // Only load when within 400px of the bottom
  const scrollBottom = window.scrollY + window.innerHeight;
  const docHeight = document.documentElement.scrollHeight;
  if (scrollBottom < docHeight - 400) return;

  const container = document.getElementById('ayahsContainer');
  if (!container) return;
  const nextCard = container.querySelector('.next-surah-card');

  const end = Math.min(_loadedUpTo + BATCH_SIZE, surah.ayahs.length);
  const frag = document.createDocumentFragment();
  for (let idx = _loadedUpTo; idx < end; idx++) {
    const block = createAyahBlock(idx, surah, false);
    _restoreBlockState(block, idx);
    frag.appendChild(block);
  }
  // Always append at bottom — never insert above viewport = zero scroll jumps
  if (nextCard) container.insertBefore(frag, nextCard);
  else container.appendChild(frag);

  _loadedUpTo = end;

  // If all ayahs are now rendered, remove the scroll listener
  if (_loadedUpTo >= surah.ayahs.length && _scrollListener) {
    window.removeEventListener('scroll', _scrollListener);
    _scrollListener = null;
  }
}

function createAyahBlock(idx, surah, animate) {
  const ayah = surah.ayahs[idx];
  const block = document.createElement('div');
  block.className = 'ayah-block';
  block.dataset.ayahIdx = String(idx);
  block.style.animationDelay = animate ? Math.min(idx * 0.05, 0.4) + 's' : '0s';

  const numDiv = document.createElement('div');
  numDiv.className = 'ayah-number';
  numDiv.textContent = 'الآية ' + (idx + 1);
  block.appendChild(numDiv);

  const textDiv = document.createElement('div');
  textDiv.className = 'ayah-text';

  const words = ayah.split(' ').filter(w => w.length > 0);
  words.forEach((word, wi) => {
    const span = document.createElement('span');
    span.className = 'word hidden';
    span.dataset.id = `${idx}-${wi}`;
    const inner = document.createElement('span');
    inner.className = 'word-text';
    inner.textContent = word;
    span.appendChild(inner);
    span.addEventListener('click', () => revealWord(span));
    textDiv.appendChild(span);
    if (wi < words.length - 1) textDiv.appendChild(document.createTextNode(' '));
  });

  const endMark = document.createElement('span');
  endMark.className = 'aya-end';
  endMark.textContent = ' ۝' + toArabicNum(idx);
  endMark.title = 'دوس لتظهر الآية كلها';
  endMark.style.cursor = 'pointer';
  endMark.addEventListener('click', () => {
    _setInteraction(idx);
    block.querySelectorAll('.word').forEach(span => {
      if (span.classList.contains('hidden') || span.classList.contains('fading')) {
        span.classList.remove('hidden', 'fading', 'revealed');
        span.classList.add('revealed');
        revealedCount++;
      }
    });
    updateStats();
  });
  textDiv.appendChild(endMark);

  // Tafsir Icon
  const tafsirIcon = document.createElement('span');
  tafsirIcon.className = 'tafsir-icon';
  tafsirIcon.textContent = '📖';
  tafsirIcon.title = 'تفسير الآية';
  tafsirIcon.addEventListener('click', () => openTafsirModal(currentSurah, idx + 1));
  textDiv.appendChild(tafsirIcon);

  // Sajda marker
  if (surah.sajda !== undefined && surah.sajda === idx) {
    const sajdaMark = document.createElement('span');
    sajdaMark.className = 'sajda-mark';
    sajdaMark.textContent = ' ۩';
    sajdaMark.title = 'آية سجدة التلاوة';
    textDiv.appendChild(sajdaMark);
  }

  block.appendChild(textDiv);

  // Per-ayah audio + undo row
  const audioRow = document.createElement('div');
  audioRow.className = 'ayah-audio-row';
  const undoBtn = document.createElement('button');
  undoBtn.className = 'btn-undo-ayah';
  undoBtn.title = 'إخفاء الآية (تراجع)';
  undoBtn.innerHTML = '↺';
  undoBtn.addEventListener('click', () => {
    _setInteraction(idx);
    let hidCount = 0;
    block.querySelectorAll('.word.revealed, .word.fading').forEach(span => {
      span.classList.remove('revealed', 'fading');
      span.classList.add('hidden');
      hidCount++;
    });
    revealedCount -= hidCount;
    if (revealedCount < 0) revealedCount = 0;
    updateStats();
  });

  const ayahNum = idx + 1;
  const audioBtn = document.createElement('button');
  audioBtn.className = 'btn-ayah-audio';
  audioBtn.setAttribute('aria-label', 'استمع للآية');
  audioBtn.innerHTML = `<span class="audio-waves"><span></span><span></span><span></span><span></span></span><span>اسمع الآية</span>`;
  audioBtn.addEventListener('click', () => playAyahAudio(audioBtn, currentSurah, ayahNum));
  audioRow.appendChild(undoBtn);
  audioRow.appendChild(audioBtn);
  block.appendChild(audioRow);

  return block;
}

// ── Audio Engine ──
function getAyahUrl(surahId, ayahNum) {
  const reciter = document.getElementById('reciterSelect').value;
  return `https://everyayah.com/data/${reciter}/${String(surahId).padStart(3, '0')}${String(ayahNum).padStart(3, '0')}.mp3`;
}

let _ayahAudio = null;
let _activeAyahBtn = null;

function setTheme(mode) {
  const body = document.body;
  const html = document.documentElement;
  const btnDark = document.getElementById('btnThemeDark');
  const btnLight = document.getElementById('btnThemeLight');

  // Clean up early classes
  html.classList.remove('theme-light-early', 'theme-dark-early');

  if (mode === 'light') {
    body.classList.add('theme-light');
    html.style.colorScheme = 'light';
    if (btnLight) {
      btnLight.style.background = 'var(--gold-dim)';
      btnLight.style.color = 'var(--gold)';
      btnDark.style.background = 'transparent';
      btnDark.style.color = 'var(--text2)';
    }
    localStorage.setItem('tasmi3_theme', 'light');
  } else {
    body.classList.remove('theme-light');
    html.style.colorScheme = 'dark';
    if (btnDark) {
      btnDark.style.background = 'var(--gold-dim)';
      btnDark.style.color = 'var(--gold)';
      btnLight.style.background = 'transparent';
      btnLight.style.color = 'var(--text2)';
    }
    localStorage.setItem('tasmi3_theme', 'dark');
  }
}

let isMushafMode = false;
let _activeMushafPopup = null; // track open popup to close on outside click

function _getScrollAyahIndex() {
  // Works in BOTH normal mode and mushaf mode
  const viewCenter = window.innerHeight / 2;
  let bestIdx = 0, bestDist = Infinity;

  if (isMushafMode) {
    // Mushaf mode: words have data-ayah attribute
    const seen = new Set();
    document.querySelectorAll('.word[data-ayah]').forEach(w => {
      const aIdx = parseInt(w.dataset.ayah);
      if (seen.has(aIdx)) return;
      seen.add(aIdx);
      const rect = w.getBoundingClientRect();
      const dist = Math.abs(rect.top - viewCenter);
      if (dist < bestDist) { bestDist = dist; bestIdx = aIdx; }
    });
  } else {
    // Normal mode: ayah-blocks have data-ayah-idx attribute
    document.querySelectorAll('.ayah-block').forEach(block => {
      const aIdx = parseInt(block.dataset.ayahIdx);
      if (isNaN(aIdx)) return;
      const rect = block.getBoundingClientRect();
      const dist = Math.abs(rect.top - viewCenter);
      if (dist < bestDist) { bestDist = dist; bestIdx = aIdx; }
    });
  }
  return bestIdx;
}

function _scrollToAyahIndex(ayahIdx) {
  // Use double-rAF to ensure DOM is fully painted after render
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (isMushafMode) {
        // Mushaf: find word with data-ayah
        const target = document.querySelector(`.word[data-ayah="${ayahIdx}"]`);
        if (target) target.scrollIntoView({ block: 'center' });
      } else {
        // Normal mode: may need to force-load more ayahs first (progressive loading)
        _ensureAyahsLoadedUpTo(ayahIdx);
        const block = document.querySelector(`.ayah-block[data-ayah-idx="${ayahIdx}"]`);
        if (block) block.scrollIntoView({ block: 'center' });
      }
    });
  });
}

function toggleMushafMode() {
  // Capture scroll position BEFORE re-render
  const scrollAyah = _getScrollAyahIndex();

  isMushafMode = !isMushafMode;
  const btn = document.getElementById('btnMushaf');

  if (isMushafMode) {
    btn.style.background = 'rgba(212,168,83,0.15)';
    btn.style.borderColor = 'var(--gold)';
    saveRevealedState();
    renderMushafMode(currentSurah);
    // Re-apply search highlight in mushaf mode
    if (_searchHighlightQuery) {
      _applySearchHighlightMushaf(_searchHighlightQuery, _searchHighlightAyah);
    }
  } else {
    btn.style.background = 'transparent';
    btn.style.borderColor = 'var(--gold-line)';
    saveRevealedState();
    isMushafMode = false; // ensure loadSurah knows
    loadSurah(currentSurah).then(() => {
      // Re-apply search highlight in normal mode
      if (_searchHighlightQuery && _searchHighlightAyah !== null) {
        _ensureAyahsLoadedUpTo(_searchHighlightAyah);
        // Use timeout to allow DOM to flush after ensureAyahsLoadedUpTo
        setTimeout(() => {
          const block = document.querySelector(`.ayah-block[data-ayah-idx="${_searchHighlightAyah}"]`);
          if (block) {
            block.classList.add('search-glow');
            _applySearchHighlight(block, _searchHighlightQuery);
          }
        }, 50);
      }
    });
  }

  // Restore scroll position to same ayah
  _scrollToAyahIndex(scrollAyah);
}

function _showMushafAyahPopup(marker, paragraph, idx) {
  // Close any existing popup
  const existingOverlay = document.getElementById('mushafPopupOverlay');
  if (existingOverlay) existingOverlay.remove();

  const overlay = document.createElement('div');
  overlay.id = 'mushafPopupOverlay';
  overlay.className = 'mushaf-popup-overlay';
  overlay.addEventListener('click', () => overlay.remove());

  const popup = document.createElement('div');
  popup.className = 'mushaf-ayah-popup';
  popup.addEventListener('click', (e) => e.stopPropagation());

  // Reveal button
  const revealBtn = document.createElement('button');
  revealBtn.textContent = '👁 كشف';
  revealBtn.title = 'كشف كل كلمات الآية';
  revealBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    _setInteraction(idx);
    paragraph.querySelectorAll(`.word[data-ayah="${idx}"]`).forEach(span => {
      if (span.classList.contains('hidden') || span.classList.contains('fading') || span.classList.contains('hinted')) {
        span.classList.remove('hidden', 'fading', 'hinted');
        span.classList.add('revealed');
        revealedCount++;
      }
    });
    updateStats();
    overlay.remove();
  });

  // Undo button
  const undoBtn = document.createElement('button');
  undoBtn.textContent = '↺ إخفاء';
  undoBtn.title = 'إخفاء كل كلمات الآية';
  undoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    _setInteraction(idx);
    let hidCount = 0;
    paragraph.querySelectorAll(`.word[data-ayah="${idx}"]`).forEach(span => {
      if (span.classList.contains('revealed') || span.classList.contains('fading')) {
        span.classList.remove('revealed', 'fading');
        span.classList.add('hidden');
        hidCount++;
      }
    });
    revealedCount -= hidCount;
    if (revealedCount < 0) revealedCount = 0;
    updateStats();
    overlay.remove();
  });

  // Play button
  const playBtn = document.createElement('button');
  playBtn.textContent = '🎧 سماع';
  playBtn.title = 'استمع للآية';
  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const ayahNum = idx + 1;
    stopAyahAudio();
    _ayahAudio = new Audio(getAyahUrl(currentSurah, ayahNum));
    _ayahAudio.play().catch(() => { });
    _ayahAudio.addEventListener('ended', () => { _ayahAudio = null; });
    overlay.remove();
  });

  // Tafsir button
  const tafsirBtn = document.createElement('button');
  tafsirBtn.textContent = '📖 تفسير';
  tafsirBtn.title = 'تفسير الآية';
  tafsirBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openTafsirModal(currentSurah, idx + 1);
    overlay.remove();
  });

  popup.appendChild(revealBtn);
  popup.appendChild(undoBtn);
  popup.appendChild(playBtn);
  popup.appendChild(tafsirBtn);

  overlay.appendChild(popup);
  document.body.appendChild(overlay);
}

// ── Mushaf Mode Renderer ──
function renderMushafMode(id) {
  const surah = SURAHS[id];
  if (!surah) return;

  // Remove progressive scroll listener from normal mode
  if (_scrollListener) { window.removeEventListener('scroll', _scrollListener); _scrollListener = null; }

  // Reset counts — recompute from saved state
  totalWords = surah.ayahs.reduce((sum, ayah) => sum + ayah.split(' ').filter(w => w.length > 0).length, 0);
  // Auto-migrate saved state to fix corrupted indices from previous empty-word bugs
  const savedState = JSON.parse(localStorage.getItem('tasmi3_revealed_state')) || {};
  const rawSavedWords = savedState[id] || [];
  const ayahWordCounts = {};
  rawSavedWords.forEach(idStr => {
    const parts = idStr.split('-');
    if (parts.length === 2) ayahWordCounts[parts[0]] = (ayahWordCounts[parts[0]] || 0) + 1;
  });

  const savedWords = [];
  _lastInteractedAyah = 0;
  Object.keys(ayahWordCounts).forEach(aIdxStr => {
    const aIdx = parseInt(aIdxStr);
    if (aIdx >= surah.ayahs.length) return;
    if (aIdx > _lastInteractedAyah) _lastInteractedAyah = aIdx;
    const newWordsCount = surah.ayahs[aIdx].split(' ').filter(w => w.length > 0).length;
    const revealCount = Math.min(ayahWordCounts[aIdxStr], newWordsCount);
    for (let wIdx = 0; wIdx < revealCount; wIdx++) {
      savedWords.push(`${aIdx}-${wIdx}`);
    }
  });

  const container = document.getElementById('ayahsContainer');
  container.innerHTML = '';

  // Bismillah handling
  const bismillahDiv = document.getElementById('bismillah');
  if (parseInt(id) === 1) {
    if (bismillahDiv) bismillahDiv.style.display = 'none';
  } else {
    if (bismillahDiv) bismillahDiv.style.display = '';
  }

  // Create the mushaf page wrapper
  const mushafPage = document.createElement('div');
  mushafPage.className = 'mushaf-page';

  // Single continuous paragraph
  const paragraph = document.createElement('p');
  paragraph.className = 'mushaf-text';

  revealedCount = 0;

  surah.ayahs.forEach((ayah, idx) => {
    const words = ayah.split(' ').filter(w => w.length > 0);
    words.forEach((word, wi) => {
      const span = document.createElement('span');
      span.className = 'word hidden';
      span.dataset.id = `${idx}-${wi}`;
      span.dataset.ayah = String(idx);

      const inner = document.createElement('span');
      inner.className = 'word-text';
      inner.textContent = word;
      span.appendChild(inner);

      // Restore state
      if (savedWords.includes(`${idx}-${wi}`)) {
        span.classList.remove('hidden');
        span.classList.add('revealed');
        revealedCount++;
      }

      span.addEventListener('click', () => revealWord(span));
      paragraph.appendChild(span);

      if (wi < words.length - 1) {
        paragraph.appendChild(document.createTextNode(' '));
      }
    });

    // Ayah number marker — ۝ with number
    const marker = document.createElement('span');
    marker.className = 'ayah-marker';
    marker.textContent = '\u06DD' + toArabicNum(idx);
    marker.dataset.ayah = String(idx);
    marker.title = 'خيارات الآية';
    marker.addEventListener('click', (e) => {
      e.stopPropagation();
      _showMushafAyahPopup(marker, paragraph, idx);
    });
    paragraph.appendChild(marker);

    // Sajda marker
    if (surah.sajda !== undefined && surah.sajda === idx) {
      const sajdaMark = document.createElement('span');
      sajdaMark.className = 'sajda-mark';
      sajdaMark.textContent = ' ۩';
      sajdaMark.title = 'آية سجدة التلاوة';
      paragraph.appendChild(sajdaMark);
    }

    // Space after marker
    paragraph.appendChild(document.createTextNode(' '));
  });

  mushafPage.appendChild(paragraph);
  container.appendChild(mushafPage);

  // Next surah card
  const nextId = parseInt(id) < 114 ? parseInt(id) + 1 : null;
  if (nextId) {
    let nextName;
    if (SURAHS[nextId] && SURAHS[nextId].name) {
      nextName = SURAHS[nextId].name;
    } else {
      const nativeSelect = document.getElementById('surahSelect');
      const opt = nativeSelect ? nativeSelect.querySelector(`option[value="${nextId}"]`) : null;
      nextName = opt ? opt.text : ('سورة ' + nextId);
    }
    const card = document.createElement('div');
    card.className = 'next-surah-card';
    card.innerHTML = `
      <div class="next-surah-label">السورة التالية</div>
      <div class="next-surah-name">${nextName}</div>
      <button class="btn-next-surah" onclick="goNextSurah(${nextId})">
        <span>انتقل إلى ${nextName}</span>
        <span class="arrow">←</span>
      </button>
    `;
    container.appendChild(card);
  }

  // Hide the "play whole surah" button in mushaf mode
  const btnPlayWhole = document.getElementById('btnPlayWholeSurah');
  if (btnPlayWhole) btnPlayWhole.style.display = 'none';

  localStorage.setItem('tasmi3_last_surah', id);
  updateStats();
  updateStatusButtons();
}

let _isPlayingWholeSurah = false;
let _currentWholeSurahAyahIndex = 0;

function stopAllAudio() {
  stopAyahAudio();
}

function stopAyahAudio() {
  _isPlayingWholeSurah = false;
  if (_ayahAudio) { _ayahAudio.pause(); _ayahAudio = null; }
  if (_activeAyahBtn) { _activeAyahBtn.classList.remove('playing'); _activeAyahBtn = null; }

  const btnWhole = document.getElementById('btnPlayWholeSurah');
  if (btnWhole) {
    btnWhole.textContent = '▶ استماع للسورة';
    btnWhole.style.background = 'rgba(212, 168, 83, 0.1)';
  }

  const stickyPlayer = document.getElementById('stickyAudioPlayer');
  if (stickyPlayer) stickyPlayer.classList.remove('show');
}

function toggleStickyPause() {
  const btn = document.getElementById('btnStickyPause');
  if (_ayahAudio) {
    if (_ayahAudio.paused) {
      _ayahAudio.play();
      btn.innerHTML = '⏸ إيقاف مؤقت';
    } else {
      _ayahAudio.pause();
      btn.innerHTML = '▶ استكمال';
    }
  }
}

function playWholeSurah() {
  if (_isPlayingWholeSurah) {
    stopAyahAudio();
    return;
  }
  stopAyahAudio();
  _isPlayingWholeSurah = true;
  _currentWholeSurahAyahIndex = 0;

  const btnWhole = document.getElementById('btnPlayWholeSurah');
  if (btnWhole) {
    btnWhole.textContent = '⏸ إيقاف السورة';
    btnWhole.style.background = 'rgba(200, 50, 50, 0.2)';
  }

  const stickyPlayer = document.getElementById('stickyAudioPlayer');
  if (stickyPlayer) stickyPlayer.classList.add('show');

  playNextAyahInSurah();
}

function playNextAyahInSurah() {
  if (!_isPlayingWholeSurah) return;
  const surah = SURAHS[currentSurah];
  if (!surah || _currentWholeSurahAyahIndex >= surah.ayahs.length) {
    stopAyahAudio();
    return;
  }

  const blocks = document.querySelectorAll('.ayah-block');
  if (_currentWholeSurahAyahIndex < blocks.length) {
    const block = blocks[_currentWholeSurahAyahIndex];
    const btn = block.querySelector('.btn-ayah-audio');
    const ayahNum = _currentWholeSurahAyahIndex + 1;

    _ayahAudio = new Audio(getAyahUrl(currentSurah, ayahNum));
    _activeAyahBtn = btn;
    if (btn) btn.classList.add('playing');

    block.scrollIntoView({ behavior: 'smooth', block: 'center' });

    _ayahAudio.play().catch(() => { stopAyahAudio(); });
    _ayahAudio.addEventListener('ended', () => {
      if (btn) btn.classList.remove('playing');
      _activeAyahBtn = null;
      _currentWholeSurahAyahIndex++;
      playNextAyahInSurah();
    });
    _ayahAudio.addEventListener('error', () => { stopAyahAudio(); });
  } else {
    stopAyahAudio();
  }
}

function playAyahAudio(btn, surahId, ayahNum) {
  // Toggle off same button
  if (_activeAyahBtn === btn && _ayahAudio && !_ayahAudio.paused) {
    _ayahAudio.pause();
    btn.classList.remove('playing');
    _activeAyahBtn = null;
    return;
  }

  stopAyahAudio();

  _ayahAudio = new Audio(getAyahUrl(surahId, ayahNum));
  _activeAyahBtn = btn;
  btn.classList.add('playing');

  _ayahAudio.play().catch(() => { btn.classList.remove('playing'); _activeAyahBtn = null; });
  _ayahAudio.addEventListener('ended', () => {
    btn.classList.remove('playing');
    _activeAyahBtn = null;
  });
  _ayahAudio.addEventListener('error', () => {
    btn.classList.remove('playing');
    _activeAyahBtn = null;
  });
}

function initCustomSelect() {
  const wrap = document.getElementById('customSurahWrap');
  const selected = document.getElementById('customSurahSelected');
  const dropdown = document.getElementById('customSurahDropdown');
  const search = document.getElementById('customSurahSearch');
  const optionsDiv = document.getElementById('customSurahOptions');
  const textSpan = document.getElementById('customSurahText');
  const nativeSelect = document.getElementById('surahSelect');

  Array.from(nativeSelect.options).forEach(opt => {
    const div = document.createElement('div');
    div.className = 'custom-option';
    div.textContent = opt.text;
    div.dataset.value = opt.value;
    // Pre-cache normalized (diacritics-stripped) name so the search
    // listener never runs regex inside the keystroke loop.
    div.dataset.normalized = normalizeArabic(opt.text);
    div.addEventListener('click', () => {
      nativeSelect.value = opt.value;
      textSpan.textContent = opt.text;
      dropdown.classList.remove('show');
      loadSurah(opt.value);
    });
    optionsDiv.appendChild(div);
  });

  selected.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('show');
    if (dropdown.classList.contains('show')) {
      search.value = '';
      search.dispatchEvent(new Event('input'));
      search.focus();
    }
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) dropdown.classList.remove('show');
  });

  search.addEventListener('input', (e) => {
    // Normalize query so typing with or without diacritics both work.
    const val = normalizeArabic(e.target.value);
    Array.from(optionsDiv.children).forEach(opt => {
      // Compare against the pre-cached normalized name (no regex in loop).
      if (opt.dataset.normalized.includes(val)) opt.classList.remove('hidden');
      else opt.classList.add('hidden');
    });
  });
}

// Init
async function initApi() {
  try {
    let data;
    const cachedList = localStorage.getItem('tasmi3_api_surah_list');
    if (cachedList) {
      data = JSON.parse(cachedList);
    } else {
      const res = await fetch('https://api.alquran.cloud/v1/surah');
      if (!res.ok) throw new Error("Could not load Surah list");
      data = await res.json();
      try { localStorage.setItem('tasmi3_api_surah_list', JSON.stringify(data)); } catch (e) { }
    }
    const nativeSelect = document.getElementById('surahSelect');
    nativeSelect.innerHTML = '';
    data.data.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.number;
      opt.text = s.name.replace('سُورَةُ ', '').replace('سورة ', '');
      nativeSelect.appendChild(opt);
    });

    // Check if URL has a ?surah parameter
    const urlParams = new URLSearchParams(window.location.search);
    const surahParam = urlParams.get('surah');
    const lastSurah = localStorage.getItem('tasmi3_last_surah');

    if (surahParam && parseInt(surahParam) >= 1 && parseInt(surahParam) <= 114) {
      nativeSelect.value = surahParam;
    } else if (lastSurah && parseInt(lastSurah) >= 1 && parseInt(lastSurah) <= 114) {
      nativeSelect.value = lastSurah;
    } else {
      nativeSelect.value = '1';
    }

    initCustomSelect();

    // Set the text wrapper
    const initialOpt = document.querySelector(`#surahSelect option[value="${nativeSelect.value}"]`);
    if (initialOpt) {
      document.getElementById('customSurahText').textContent = initialOpt.text;
    }

    // If a ?surah= param is present (coming from a board/search page), skip the overlay entirely
    if (surahParam && parseInt(surahParam) >= 1 && parseInt(surahParam) <= 114) {
      const ov = document.getElementById('overlay');
      if (ov) { ov.style.display = 'none'; }

      const ayahParam = urlParams.get('ayah');
      const searchQuery = urlParams.get('q') ? decodeURIComponent(urlParams.get('q')) : null;

      // Store globally so toggleMushafMode can re-apply highlights
      _searchHighlightQuery = searchQuery;
      _searchHighlightAyah = ayahParam ? parseInt(ayahParam) - 1 : null;

      loadSurah(surahParam).then(() => {
        if (ayahParam) {
          const ayahIdx = parseInt(ayahParam) - 1; // 0-based
          if (ayahIdx >= 0) {
            _ensureAyahsLoadedUpTo(ayahIdx);
            setTimeout(() => {
              const block = document.querySelector(`.ayah-block[data-ayah-idx="${ayahIdx}"]`);
              if (block) {
                // Permanent gold glow on the block (normal mode)
                block.classList.add('search-glow');
                block.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Highlight the searched query inside the ayah text
                if (searchQuery) {
                  _applySearchHighlight(block, searchQuery);
                }
              }

              // If mushaf mode is active, highlight in the mushaf text too
              if (isMushafMode && searchQuery) {
                _applySearchHighlightMushaf(searchQuery, ayahIdx);
              }
            }, 200);
          }
        }
      });
    }
  } catch (e) {
    console.error(e);
  }
}
initApi();




// =========================================
// TAFSIR MODAL SYSTEM
// =========================================
let currentTafsirContext = { surah: null, ayah: null };

function openTafsirModal(surah, ayah) {
  currentTafsirContext = { surah, ayah };
  document.getElementById('tafsirAyahNum').textContent = toArabicNum(ayah - 1); // ayahNum starts from 1, toArabicNum adds 1, passing ayah-1 yields correct arabic num

  const modal = document.getElementById('tafsirModal');
  modal.classList.add('show');
  document.body.style.overflow = 'hidden'; // stop background scrolling

  // Reset tabs to default (Al-Muyassar -> id: 16)
  const tabs = document.querySelectorAll('#tafsirModal .tab-btn');
  tabs.forEach(t => t.classList.remove('active'));
  tabs[0].classList.add('active'); // 16 is first

  loadTafsirContent(16, surah, ayah);
}

function closeTafsirModal(e) {
  if (e && e.target && !e.target.classList.contains('custom-modal-overlay') && !e.target.classList.contains('custom-modal-close') && e.target.id !== 'tafsirModal') {
    return;
  }
  const modal = document.getElementById('tafsirModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }
}

function switchTafsirTab(tafsirId, btn) {
  const tabs = document.querySelectorAll('#tafsirModal .tab-btn');
  tabs.forEach(t => t.classList.remove('active'));
  btn.classList.add('active');

  const { surah, ayah } = currentTafsirContext;
  if (surah && ayah) {
    loadTafsirContent(tafsirId, surah, ayah);
  }
}

async function loadTafsirContent(tafsirId, surah, ayah) {
  const container = document.getElementById('tafsirContent');
  container.innerHTML = '<div class="custom-spinner"></div>';

  try {
    const apiUrl = `https://api.quran.com/api/v4/tafsirs/${tafsirId}/by_ayah/${surah}:${ayah}`;
    let data;

    const cacheKey = `tasmi3_tafsir_${tafsirId}_${surah}_${ayah}`;
    let cachedTafsir = localStorage.getItem(cacheKey);

    if (cachedTafsir) {
      data = JSON.parse(cachedTafsir);
    } else {
      const res = await fetch(apiUrl);
      if (!res.ok) throw new Error('API Error');
      data = await res.json();
      try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (e) { }
    }

    let textResult = data && data.tafsir && data.tafsir.text ? data.tafsir.text : 'لا يوجد تفسير متاح لهذه الآية حالياً.';

    container.innerHTML = `<div class="tafsir-content-wrap">${textResult}</div>`;
    container.scrollTop = 0;

  } catch (err) {
    container.innerHTML = '<div style="text-align:center; color:#ff8888; font-family: Cairo; margin-top:20px;">حدث خطأ أثناء جلب التفسير. يرجى المحاولة لاحقاً أو التأكد من توفر الإنترنت.</div>';
  }
}
const savedTheme = localStorage.getItem('tasmi3_theme');
if (savedTheme === 'dark') {
  setTheme('dark');
} else {
  setTheme('light'); // default is now light
}