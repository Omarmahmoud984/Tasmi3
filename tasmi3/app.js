// ── Data ──
const SURAHS = {};


// ── State ──
let hideDelay = 4000;
let totalWords = 0;
let revealedCount = 0;
let currentSurah = 1;
let isHardcoreMode = false;
let wordTimers = {};

// ── Progressive Loading State ──
const BATCH_SIZE = 25;
let _loadedUpTo = 0;
let _savedWordsForCurrentSurah = []; // words saved from prev session for not-yet-rendered ayahs
let _scrollListener = null;

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
    // If already installed or prompt unavailable, clicking it forces a cache reload for "updates"
    showToast('جاري البحث عن تحديثات...');
    setTimeout(() => {
      window.location.reload(true);
    }, 1000);
  }
};

function scheduleNextDhikr() {
  // Try again in 2 minutes
  dhikrTimeout = setTimeout(showDhikrPopup, 120000);
}

function showDhikrPopup() {
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

// Start the first cycle
scheduleNextDhikr();

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

function startApp() {
  const ov = document.getElementById('overlay');
  ov.classList.add('hide');
  setTimeout(() => ov.style.display = 'none', 400);

  const urlParams = new URLSearchParams(window.location.search);
  const surahParam = urlParams.get('surah');
  const lastSurah = localStorage.getItem('tasmi3_last_surah') || currentSurah;

  const targetSurah = (surahParam && parseInt(surahParam) >= 1 && parseInt(surahParam) <= 114) ? surahParam : lastSurah;
  loadSurah(targetSurah);
}

async function loadSurah(id) {
  currentSurah = parseInt(id);

  if (!SURAHS[id]) {
    const container = document.getElementById('ayahsContainer');
    container.innerHTML = '<div style="text-align:center; color: var(--gold); font-size: 1.5rem; margin-top: 40px; animation: sajdaPulse 1.5s infinite;">جاري التحميل...</div>';
    try {
      let data;
      const cached = localStorage.getItem('tasmi3_api_surah_' + id);
      if (cached) {
        data = JSON.parse(cached);
      } else {
        const res = await fetch('https://api.alquran.cloud/v1/surah/' + id);
        if (!res.ok) throw new Error('Network Error');
        data = await res.json();
        try { localStorage.setItem('tasmi3_api_surah_' + id, JSON.stringify(data)); } catch (e) { }
      }

      let ayahsList = [];
      data.data.ayahs.forEach((a, i) => {
        let text = a.text;
        if (id != 1 && id != 9 && i === 0 && text.startsWith('بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِیمِ')) {
          text = text.replace(/^بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِیمِ\s*/, '');
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
      container.innerHTML = '<div style="text-align:center; color: #ff8888; font-size: 1.2rem; margin-top: 40px;">فشل التحميل. تأكد من الاتصال بالإنترنت.</div>';
      return;
    }
  }

  const surah = SURAHS[id];
  if (!surah) return;

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

  const container = document.getElementById('ayahsContainer');
  container.innerHTML = '';

  // Compute totalWords for ALL ayahs upfront
  totalWords = surah.ayahs.reduce((sum, ayah) => sum + ayah.split(' ').length, 0);

  // Load saved state & count all previously revealed words upfront (even for unrendered ayahs)
  const savedState = JSON.parse(localStorage.getItem('tasmi3_revealed_state')) || {};
  _savedWordsForCurrentSurah = savedState[id] || [];
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

function getNextTargetIndex() {
  const blocks = document.querySelectorAll('.ayah-block');
  let maxRevealedIdx = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].querySelector('.word.revealed')) {
      maxRevealedIdx = i;
    }
  }

  if (maxRevealedIdx === -1) return 0;

  if (blocks[maxRevealedIdx].querySelector('.word.hidden, .word.fading')) {
    return maxRevealedIdx;
  }

  if (maxRevealedIdx + 1 < blocks.length) {
    return maxRevealedIdx + 1;
  }

  return -1;
}

function revealNextAyah() {
  const targetIndex = getNextTargetIndex();
  if (targetIndex === -1) return;

  const blocks = document.querySelectorAll('.ayah-block');
  const block = blocks[targetIndex];
  block.querySelectorAll('.word').forEach(span => {
    if (span.classList.contains('hidden') || span.classList.contains('fading') || span.classList.contains('hinted')) {
      span.classList.remove('hidden', 'fading', 'hinted');
      span.classList.add('revealed');
      revealedCount++;
    }
  });

  // Scroll to revealed ayah smoothly
  block.scrollIntoView({ behavior: 'smooth', block: 'center' });

  updateStats();
}

function revealNWords() {
  const n = currentNWordsPattern;
  let count = 0;
  let lastWord = null;

  const blocks = document.querySelectorAll('.ayah-block');
  let startIdx = getNextTargetIndex();

  if (startIdx === -1) {
    startIdx = 0; // If everything is revealed or nothing is, start from 0
  }

  // Go through ayahs starting from the current target ayah
  for (let i = startIdx; i < blocks.length && count < n; i++) {
    const block = blocks[i];
    const hiddenWords = Array.from(block.querySelectorAll('.word.hidden, .word.fading, .word.hinted'));
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
      ayah.split(' ').forEach((_, wi) => allWordIds.push(`${idx}-${wi}`));
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

  const words = ayah.split(' ');
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

  // Ayah end marker — tap to reveal full ayah
  const endMark = document.createElement('span');
  endMark.className = 'aya-end';
  endMark.textContent = ' ۝' + toArabicNum(idx);
  endMark.title = 'دوس لتظهر الآية كلها';
  endMark.style.cursor = 'pointer';
  endMark.addEventListener('click', () => {
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
  const btnDark = document.getElementById('btnThemeDark');
  const btnLight = document.getElementById('btnThemeLight');

  if (mode === 'light') {
    body.classList.add('theme-light');
    if (btnLight) {
      btnLight.style.background = 'var(--gold-dim)';
      btnLight.style.color = 'var(--gold)';
      btnDark.style.background = 'transparent';
      btnDark.style.color = 'var(--text2)';
    }
    localStorage.setItem('tasmi3_theme', 'light');
  } else {
    body.classList.remove('theme-light');
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
function toggleMushafMode() {
  isMushafMode = !isMushafMode;
  const container = document.getElementById('ayahsContainer');
  const btn = document.getElementById('btnMushaf');

  // Find the ayah block closest to the center of the viewport BEFORE layout changes
  const blocks = container.querySelectorAll('.ayah-block');
  let anchorBlock = null;
  const viewportCenter = window.innerHeight / 2;
  let bestDist = Infinity;
  blocks.forEach(b => {
    const rect = b.getBoundingClientRect();
    const blockCenter = rect.top + rect.height / 2;
    const dist = Math.abs(blockCenter - viewportCenter);
    if (dist < bestDist) { bestDist = dist; anchorBlock = b; }
  });

  if (isMushafMode) {
    container.classList.add('mushaf-mode');
    btn.style.background = 'rgba(212,168,83,0.15)';
    btn.style.borderColor = 'var(--gold)';
  } else {
    container.classList.remove('mushaf-mode');
    btn.style.background = 'transparent';
    btn.style.borderColor = 'var(--gold-line)';
  }

  // After layout reflows, scroll back to the same ayah
  if (anchorBlock) {
    requestAnimationFrame(() => {
      anchorBlock.scrollIntoView({ block: 'center' });
    });
  }
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
    const val = e.target.value;
    Array.from(optionsDiv.children).forEach(opt => {
      if (opt.textContent.includes(val)) opt.classList.remove('hidden');
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

    // If a ?surah= param is present (coming from a board page), skip the overlay entirely
    if (surahParam && parseInt(surahParam) >= 1 && parseInt(surahParam) <= 114) {
      const ov = document.getElementById('overlay');
      if (ov) { ov.style.display = 'none'; }
      loadSurah(surahParam);
    }
  } catch (e) {
    console.error(e);
  }
}
initApi();

const savedTheme = localStorage.getItem('tasmi3_theme');
if (savedTheme === 'dark') {
  setTheme('dark');
} else {
  setTheme('light'); // default is now light
}
