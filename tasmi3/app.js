// ── Data ──
const SURAHS = {};

// ── Surah order (dropdown order) ──
let SURAH_ORDER = Array.from({ length: 114 }, (_, i) => i + 1);

function getNextSurahId(currentId) {
  const idx = SURAH_ORDER.indexOf(parseInt(currentId));
  if (idx === -1 || idx === SURAH_ORDER.length - 1) return null;
  return SURAH_ORDER[idx + 1];
}

// ── State ──
let hideDelay = 4000;
let totalWords = 0;
let revealedCount = 0;
let currentSurah = 1;
let isHardcoreMode = false;
let wordTimers = {};

function saveRevealedState() {
  const revealedWords = [];
  document.querySelectorAll('.word.revealed, .word.fading').forEach(span => {
    revealedWords.push(span.dataset.id);
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

// ── PWA Install & Update Logic ──
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Button is always visible now as requested, so we just store the event
});

window.installApp = async function() {
  if (deferredPrompt) {
    // If it's installable, trigger prompt
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      deferredPrompt = null;
    }
  } else {
    // If already installed or prompt unavailable, clicking it forces a cache reload for "updates"
    showToast("جاري البحث عن تحديثات...");
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

  const btnPlayWhole = document.getElementById('btnPlayWholeSurah');
  if (btnPlayWhole) {
    btnPlayWhole.style.display = 'block';
  }

  const container = document.getElementById('ayahsContainer');
  container.innerHTML = '';

  surah.ayahs.forEach((ayah, idx) => {
    const block = document.createElement('div');
    block.className = 'ayah-block';
    block.style.animationDelay = (idx * 0.1) + 's';

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
      totalWords++;
    });

    // ayah end marker — tap to reveal full ayah
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

    // sajda marker
    if (surah.sajda !== undefined && surah.sajda === idx) {
      const sajdaMark = document.createElement('span');
      sajdaMark.className = 'sajda-mark';
      sajdaMark.textContent = ' ۩';
      sajdaMark.title = 'آية سجدة التلاوة';
      textDiv.appendChild(sajdaMark);
    }

    block.appendChild(textDiv);

    // ── Per-ayah audio button & undo button ──
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

    container.appendChild(block);
  });

  const savedState = JSON.parse(localStorage.getItem('tasmi3_revealed_state')) || {};
  if (savedState[id]) {
    savedState[id].forEach(wordId => {
      const span = container.querySelector(`.word[data-id="${wordId}"]`);
      if (span) {
        span.classList.remove('hidden', 'fading');
        span.classList.add('revealed');
        revealedCount++;
      }
    });
  }

  localStorage.setItem('tasmi3_last_surah', id);

  updateStats();

  // Next surah card
  const nextId = parseInt(id) < 114 ? parseInt(id) + 1 : null;
  if (nextId) {
    const nativeSelect = document.getElementById('surahSelect');
    const opt = nativeSelect ? nativeSelect.querySelector(`option[value="${nextId}"]`) : null;
    const nextName = opt ? opt.text : ('سورة ' + nextId);

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

function resetSurah() {
  // Clear the saved revealed state for this surah so loadSurah starts fresh
  const saved = JSON.parse(localStorage.getItem('tasmi3_revealed_state')) || {};
  delete saved[currentSurah];
  localStorage.setItem('tasmi3_revealed_state', JSON.stringify(saved));
  loadSurah(currentSurah);
}

function revealAll() {
  document.querySelectorAll('.word').forEach(span => {
    const id = span.dataset.id;
    if (wordTimers[id]) { clearTimeout(wordTimers[id]); delete wordTimers[id]; }
    span.classList.remove('hidden', 'fading', 'hinted');
    span.classList.add('revealed');
  });
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
  if (isMushafMode) {
    container.classList.add('mushaf-mode');
    btn.style.background = 'rgba(212,168,83,0.15)';
    btn.style.borderColor = 'var(--gold)';
  } else {
    container.classList.remove('mushaf-mode');
    btn.style.background = 'transparent';
    btn.style.borderColor = 'var(--gold-line)';
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
if (savedTheme === 'light') {
  setTheme('light');
} else {
  setTheme('dark'); // default
}
