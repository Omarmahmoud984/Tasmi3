// ══════════════════════════════════════════════════════════
// Premium Mushaf System (mos7af.js)
// ══════════════════════════════════════════════════════════

// ── State ──
let currentMode  = 'page';
let currentIndex = 1;
let loadedSurahs = {};

const SURAH_NAMES = [
  "الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس",
  "هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه",
  "الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم",
  "لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر",
  "فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق",
  "الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة",
  "الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج",
  "نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس",
  "التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد",
  "الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات",
  "القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر",
  "المسد","الإخلاص","الفلق","الناس"
];

const RUB_ARABIC = ['الأول','الثاني','الثالث','الرابع','الخامس','السادس','السابع','الثامن'];

// ── DOM References ──
const container      = document.getElementById('mos7afContainer');
const loadingOverlay = document.getElementById('mos7afLoading');
const btnNext        = document.getElementById('btnNext');
const btnPrev        = document.getElementById('btnPrev');
const positionBtn    = document.getElementById('positionBtn');
const indicatorText  = document.getElementById('indicatorText');

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  const savedFont  = localStorage.getItem('mos7af_font')  || 'default';
  const savedMode  = localStorage.getItem('mos7af_mode')  || 'page';
  const savedIndex = parseInt(localStorage.getItem('mos7af_index_' + savedMode)) || 1;

  setFontSize(savedFont);
  currentMode  = savedMode;
  currentIndex = savedIndex;

  // Init theme toggle checkbox
  const isDark = (localStorage.getItem('tasmi3_theme') || 'light') === 'dark';
  const cb = document.getElementById('toggleTheme');
  if (cb) cb.checked = isDark;

  updateSidebarUI();
  loadCurrentView();
});

// ── Sidebar ──
function toggleSidebar() {
  document.getElementById('mos7afSidebar').classList.toggle('show');
  document.getElementById('mos7afSidebarOverlay').classList.toggle('show');
}

// ── Theme Toggle ──
function toggleMos7afTheme(isDark) {
  const theme = isDark ? 'dark' : 'light';
  localStorage.setItem('tasmi3_theme', theme);
  const html = document.documentElement;
  html.classList.remove('theme-dark', 'theme-dark-early', 'theme-light', 'theme-light-early');
  if (isDark) {
    html.classList.add('theme-dark', 'theme-dark-early');
  } else {
    html.classList.add('theme-light', 'theme-light-early');
  }
}

function updateSidebarUI() {
  document.querySelectorAll('.mode-controls button').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('modeBtn_' + currentMode);
  if (btn) btn.classList.add('active');
}

// ── Font & Mode ──
function setFontSize(size) {
  localStorage.setItem('mos7af_font', size);
  document.querySelectorAll('.font-size-controls button').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('fontBtn_' + size);
  if (btn) btn.classList.add('active');
  document.documentElement.style.setProperty('--mos7af-active-font', `var(--mos7af-font-${size})`);
}

function setMode(mode) {
  if (currentMode === mode) return;
  currentMode  = mode;
  currentIndex = parseInt(localStorage.getItem('mos7af_index_' + mode)) || 1;
  localStorage.setItem('mos7af_mode', mode);
  container.className = 'mos7af-container mode-' + mode;
  updateSidebarUI();
  loadCurrentView();
}

// ── Data Loader (IDB → localStorage → Network) ──
async function fetchSurah(surahId) {
  if (loadedSurahs[surahId]) return loadedSurahs[surahId];

  // 1. IndexedDB
  try {
    const idb = await new Promise((res, rej) => {
      const r = indexedDB.open('tasmi3_quran_offline', 1);
      r.onsuccess = () => res(r.result);
      r.onerror   = () => rej();
    });
    const stored = await new Promise(res => {
      const tx  = idb.transaction('surahs', 'readonly');
      const req = tx.objectStore('surahs').get(parseInt(surahId));
      req.onsuccess = () => res(req.result || null);
      req.onerror   = () => res(null);
    });
    if (stored && Array.isArray(stored.ayahs)) {
      loadedSurahs[surahId] = stored;
      return stored;
    }
  } catch (e) {}

  // 2. localStorage
  try {
    const raw = localStorage.getItem('tasmi3_api_surah_' + surahId);
    if (raw) {
      const data = JSON.parse(raw);
      const ayahsList = [];
      data.data.ayahs.forEach((a, i) => {
        let text = a.text;
        if (surahId != 1 && surahId != 9 && i === 0) {
          const bare = text.replace(/[\u064B-\u065F\u06D6-\u06ED\u0670\u0640\u06E1]/g, '');
          if (bare.startsWith('\u0628\u0633\u0645') || bare.startsWith('\u0628\u0650\u0633'))
            text = text.split(/\s+/).slice(4).join(' ');
        }
        ayahsList.push(text);
      });
      loadedSurahs[surahId] = {
        name: data.data.name.replace('سُورَةُ ', '').replace('سورة ', ''),
        ayahs: ayahsList
      };
      return loadedSurahs[surahId];
    }
  } catch (e) {}

  // 3. Network
  if (!navigator.onLine) throw new Error('Offline');
  const res = await fetch('https://api.alquran.cloud/v1/surah/' + surahId);
  if (!res.ok) throw new Error('Network error');
  const data = await res.json();
  const ayahsList = [];
  data.data.ayahs.forEach((a, i) => {
    let text = a.text;
    if (surahId != 1 && surahId != 9 && i === 0) {
      const bare = text.replace(/[\u064B-\u065F\u06D6-\u06ED\u0670\u0640\u06E1]/g, '');
      if (bare.startsWith('\u0628\u0633\u0645') || bare.startsWith('\u0628\u0650\u0633'))
        text = text.split(/\s+/).slice(4).join(' ');
    }
    ayahsList.push(text);
  });
  try { localStorage.setItem('tasmi3_api_surah_' + surahId, JSON.stringify(data)); } catch (e) {}
  loadedSurahs[surahId] = {
    name: data.data.name.replace('سُورَةُ ', '').replace('سورة ', ''),
    ayahs: ayahsList
  };
  return loadedSurahs[surahId];
}

function getSurahsInRange(s, e) {
  const list = [];
  for (let i = s; i <= e; i++) list.push(i);
  return list;
}

// ── View Loader ──
async function loadCurrentView() {
  loadingOverlay.style.display = 'block';
  container.innerHTML = '';
  localStorage.setItem('mos7af_index_' + currentMode, currentIndex);

  let startRef, endRef, limits;

  if (currentMode === 'page') {
    limits   = { max: 604, name: 'الصفحة' };
    startRef = QURAN_MAPPING.pages[currentIndex - 1];
    endRef   = currentIndex < 604 ? QURAN_MAPPING.pages[currentIndex] : { surah: 114, ayah: 7 };
  } else if (currentMode === 'surah') {
    limits   = { max: 114, name: 'السورة' };
    startRef = { surah: currentIndex, ayah: 1 };
    endRef   = { surah: currentIndex + 1, ayah: 1 };
  } else if (currentMode === 'juz') {
    limits   = { max: 30, name: 'الجزء' };
    startRef = QURAN_MAPPING.juzs[currentIndex - 1];
    endRef   = currentIndex < 30 ? QURAN_MAPPING.juzs[currentIndex] : { surah: 114, ayah: 7 };
  } else {
    limits   = { max: 240, name: 'الربع' };
    startRef = QURAN_MAPPING.rubs[currentIndex - 1];
    endRef   = currentIndex < 240 ? QURAN_MAPPING.rubs[currentIndex] : { surah: 114, ayah: 7 };
  }

  updateNavButtons(limits.max, limits.name);
  updatePositionIndicator();

  let surahsToLoad;
  if (endRef.surah > startRef.surah)
    surahsToLoad = getSurahsInRange(startRef.surah, endRef.ayah === 1 ? endRef.surah - 1 : endRef.surah);
  else
    surahsToLoad = [startRef.surah];

  try {
    await Promise.all(surahsToLoad.map(id => fetchSurah(id)));
    renderContent(startRef, endRef, surahsToLoad);
    container.scrollTop = 0;
  } catch (e) {
    container.innerHTML = `<div style="color:#ff8888;padding:30px;font-size:1.2rem;font-family:'Cairo';text-align:center;">
      تعذر تحميل البيانات.<br>تأكد من الاتصال بالإنترنت أو تنزيل المصحف مسبقاً من الرئيسية.
    </div>`;
  }

  loadingOverlay.style.display = 'none';
}

// ── Renderer ──
function toArabicNum(n) {
  return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

function renderContent(startRef, endRef, surahsUsed) {
  let html = '';
  for (const sId of surahsUsed) {
    const surahData = loadedSurahs[sId];
    if (!surahData) continue;
    const startAyah = sId === startRef.surah ? startRef.ayah : 1;
    const endAyah   = sId === endRef.surah   ? endRef.ayah - 1 : surahData.ayahs.length;

    if (startAyah === 1) {
      html += `<div class="surah-header">سُورَةُ ${surahData.name}</div>`;
      if (sId !== 1 && sId !== 9)
        html += `<div class="bismillah">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>`;
    }
    for (let i = startAyah - 1; i < endAyah; i++) {
      html += `<span class="mushaf-ayah">${surahData.ayahs[i]} <span class="ayah-end">۝${toArabicNum(i+1)}</span></span> `;
    }
  }
  container.innerHTML = html;
}

// ── Navigation ──
let currentMax = 1;
function updateNavButtons(maxIndex, labelName) {
  currentMax = maxIndex;
  btnPrev.disabled = currentIndex === 1;
  btnNext.disabled = currentIndex === maxIndex;
}

function goNext() { if (currentIndex < currentMax) { currentIndex++; loadCurrentView(); } }
function goPrev() { if (currentIndex > 1)          { currentIndex--; loadCurrentView(); } }

// ── Position Indicator (permanent, in nav bar) ──
function updatePositionIndicator() {
  let text = '';
  if (currentMode === 'page') {
    text = `الصفحة ${currentIndex}`;
  } else if (currentMode === 'surah') {
    text = `${SURAH_NAMES[currentIndex - 1]}`;
  } else if (currentMode === 'juz') {
    text = `الجزء ${currentIndex}`;
  } else {
    const juzIndex = Math.floor((currentIndex - 1) / 8) + 1;
    const rubInJuz = ((currentIndex - 1) % 8) + 1;
    text = `ج${juzIndex} · ر${rubInJuz}`;
  }
  indicatorText.textContent = text;
}

// ══════════════════════════════════════════════════════════
// JUMP TO MODAL
// ══════════════════════════════════════════════════════════

let _pageInputVal   = 1;
let _rubJuzSelected = null;

function openJumpModal() {
  const overlay = document.getElementById('jumpModalOverlay');
  const body    = document.getElementById('jumpModalBody');
  const title   = document.getElementById('jumpModalTitle');
  overlay.style.display = 'flex';

  // ── PAGE: Number input + quick ±10/±50 ──
  if (currentMode === 'page') {
    title.textContent = 'انتقل إلى صفحة';
    _pageInputVal = currentIndex;
    body.innerHTML = `
      <div class="jump-page-wrap">
        <div class="jump-page-label">أدخل رقم الصفحة (١ – ٦٠٤)</div>
        <input class="jump-page-input-field" type="number" id="pageInput"
               min="1" max="604" value="${currentIndex}">
        <div class="jump-page-quick">
          <button onclick="adjustPageInput(-50)">−٥٠</button>
          <button onclick="adjustPageInput(-10)">−١٠</button>
          <button onclick="adjustPageInput(10)">+١٠</button>
          <button onclick="adjustPageInput(50)">+٥٠</button>
        </div>
        <button class="jump-page-go" onclick="jumpToPageInput()">انتقل ➔</button>
      </div>`;
    setTimeout(() => document.getElementById('pageInput').select(), 80);

  // ── SURAH: Search + combo box (select) ──
  } else if (currentMode === 'surah') {
    title.textContent = 'اختر السورة';
    let opts = '';
    SURAH_NAMES.forEach((name, i) => {
      const num      = i + 1;
      const selected = num === currentIndex ? 'selected' : '';
      opts += `<option value="${num}" ${selected}>${num}. ${name}</option>`;
    });
    body.innerHTML = `
      <div class="jump-surah-wrap">
        <input class="jump-surah-search" id="surahSearchInput" placeholder="ابحث باسم السورة..." autocomplete="off" oninput="filterSurahSelect(this.value)">
        <select class="jump-surah-select" id="surahSelect" size="6">${opts}</select>
        <button class="jump-surah-go" onclick="jumpToSurahSelect()">انتقل ➔</button>
      </div>`;
    setTimeout(() => {
      const sel = document.getElementById('surahSelect');
      if (sel) sel.scrollTop = sel.querySelector('option[selected]')?.offsetTop || 0;
    }, 60);

  // ── JUZ: Grid 1–30 ──
  } else if (currentMode === 'juz') {
    title.textContent = 'اختر الجزء';
    let html = '<div class="jump-juz-grid">';
    for (let j = 1; j <= 30; j++) {
      const active = j === currentIndex ? 'active' : '';
      html += `<div class="jump-juz-item ${active}" onclick="jumpTo(${j})">${j}</div>`;
    }
    html += '</div>';
    body.innerHTML = html;

  // ── RUB: Two-step — pick Juz → pick Rub ──
  } else if (currentMode === 'rub') {
    title.textContent = 'اختر الجزء ثم الربع';
    _rubJuzSelected = Math.floor((currentIndex - 1) / 8) + 1;
    body.innerHTML  = buildRubUI(_rubJuzSelected, currentIndex);
    setTimeout(() => {
      const active = body.querySelector('.rub-pick-cell.active');
      if (active) active.scrollIntoView({ block: 'nearest' });
    }, 50);
  }
}

// ── Page input helpers ──
function adjustPageInput(delta) {
  const input = document.getElementById('pageInput');
  if (!input) return;
  let val = parseInt(input.value) || currentIndex;
  val = Math.max(1, Math.min(604, val + delta));
  input.value = val;
  input.focus();
}

function jumpToPageInput() {
  const val = parseInt(document.getElementById('pageInput')?.value);
  jumpTo(val);
}

// ── Surah select helpers ──
function filterSurahSelect(query) {
  const sel = document.getElementById('surahSelect');
  const q   = query.trim();
  Array.from(sel.options).forEach(opt => {
    opt.hidden = q ? !opt.text.includes(q) : false;
  });
}

function jumpToSurahSelect() {
  const sel = document.getElementById('surahSelect');
  const val = sel ? parseInt(sel.value) : null;
  jumpTo(val);
}

// ── Rub two-step ──
function buildRubUI(selectedJuz, activeRub) {
  let html = '<div class="rub-step-label">اختر الجزء</div><div class="rub-juz-grid">';
  for (let j = 1; j <= 30; j++) {
    const sel = j === selectedJuz ? 'selected' : '';
    html += `<div class="rub-juz-cell ${sel}" onclick="selectRubJuz(${j})">${j}</div>`;
  }
  html += `</div><div class="rub-step-label">الربع في الجزء ${selectedJuz}</div><div class="rub-pick-row">`;
  for (let r = 1; r <= 8; r++) {
    const rubIdx = (selectedJuz - 1) * 8 + r;
    const active = rubIdx === activeRub ? 'active' : '';
    html += `<div class="rub-pick-cell ${active}" onclick="jumpTo(${rubIdx})">${RUB_ARABIC[r-1]}</div>`;
  }
  html += '</div>';
  return html;
}

function selectRubJuz(juz) {
  _rubJuzSelected = juz;
  document.getElementById('jumpModalBody').innerHTML = buildRubUI(juz, currentIndex);
  const rubSection = document.querySelector('.rub-pick-row');
  if (rubSection) rubSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Core jump ──
function closeJumpModal() {
  document.getElementById('jumpModalOverlay').style.display = 'none';
}

function jumpTo(index) {
  const limits = { page: 604, surah: 114, juz: 30, rub: 240 };
  const max    = limits[currentMode];
  if (!index || index < 1 || index > max) return;
  currentIndex = index;
  closeJumpModal();
  loadCurrentView();
}
