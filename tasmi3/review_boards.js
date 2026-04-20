const SURAH_NAMES = [
  "الفاتحة", "البقرة", "آل عمران", "النساء", "المائدة", "الأنعام", "الأعراف", "الأنفال", "التوبة", "يونس",
  "هود", "يوسف", "الرعد", "إبراهيم", "الحجر", "النحل", "الإسراء", "الكهف", "مريم", "طه",
  "الأنبياء", "الحج", "المؤمنون", "النور", "الفرقان", "الشعراء", "النمل", "القصص", "العنكبوت", "الروم",
  "لقمان", "السجدة", "الأحزاب", "سبأ", "فاطر", "يس", "الصافات", "ص", "الزمر", "غافر",
  "فصلت", "الشورى", "الزخرف", "الدخان", "الجاثية", "الأحقاف", "محمد", "الفتح", "الحجرات", "ق",
  "الذاريات", "الطور", "النجم", "القمر", "الرحمن", "الواقعة", "الحديد", "المجادلة", "الحشر", "الممتحنة",
  "الصف", "الجمعة", "المنافقون", "التغابن", "الطلاق", "التحريم", "الملك", "القلم", "الحاقة", "المعارج",
  "نوح", "الجن", "المزمل", "المدثر", "القيامة", "الإنسان", "المرسلات", "النبأ", "النازعات", "عبس",
  "التكوير", "الانفطار", "المطففين", "الانشقاق", "البروج", "الطارق", "الأعلى", "الغاشية", "الفجر", "البلد",
  "الشمس", "الليل", "الضحى", "الشرح", "التين", "العلق", "القدر", "البينة", "الزلزلة", "العاديات",
  "القارعة", "التكاثر", "العصر", "الهمزة", "الفيل", "قريش", "الماعون", "الكوثر", "الكافرون", "النصر",
  "المسد", "الإخلاص", "الفلق", "الناس"
];

function initBoard(targetStatus) {
  const container = document.getElementById('boardContainer');
  const statuses = JSON.parse(localStorage.getItem('tasmi3_surah_status') || '{}');

  let hasItems = false;
  let count = 0;

  // Count first
  for (let i = 1; i <= 114; i++) {
    if (statuses[i] === targetStatus) count++;
  }

  // Show count summary
  if (count > 0) {
    const summary = document.createElement('div');
    summary.style.cssText = `
      grid-column: 1 / -1;
      text-align: center;
      color: var(--text3);
      font-size: 0.85rem;
      padding: 10px 0 4px;
      letter-spacing: 1px;
      font-family: 'Cairo', sans-serif;
    `;
    const arabicCount = String(count).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
    summary.textContent = `${arabicCount} سورة في هذا القسم`;
    container.appendChild(summary);
  }

  for (let i = 1; i <= 114; i++) {
    if (statuses[i] === targetStatus) {
      hasItems = true;
      const card = document.createElement('div');
      card.className = 'next-surah-card'; // Reuse styling from original app
      card.style.opacity = '1';
      card.style.transform = 'none';
      card.style.animation = 'none';
      card.style.cursor = 'pointer';

      card.innerHTML = `
        <div class="next-surah-label">سورة رقم ${i}</div>
        <div class="next-surah-name">${SURAH_NAMES[i-1]}</div>
        <div style="margin-top:10px; color:var(--text2); font-size:0.8rem;">انقر للانتقال للسورة</div>
      `;
      card.addEventListener('click', () => {
        window.location.href = 'index.html?surah=' + i;
      });
      container.appendChild(card);
    }
  }

  if (!hasItems) {
    container.innerHTML = '<div style="text-align:center; color: var(--text3); margin-top:50px; font-size: 1.2rem;">لا يوجد سور مسجلة قي هذا القسم بعد.</div>';
  }
}


function toggleNavSidebar() {
  const sidebar = document.getElementById('navSidebar');
  const overlay = document.getElementById('navSidebarOverlay');
  sidebar.classList.toggle('show');
  overlay.classList.toggle('show');
}

// Load theme preference
const savedTheme = localStorage.getItem('tasmi3_theme');
if (savedTheme === 'light') {
  document.body.classList.add('theme-light');
}

// Global Sidebar Actions for Sub-pages
function installApp() {
  window.location.href = 'index.html'; // Go to homepage to trigger built-in install logic
}

function toggleDhikrPopupSetting(checkbox) {
  const enabled = checkbox.checked;
  localStorage.setItem('tasmi3_dhikr_popup_enabled', String(enabled));
}

// Sync check on load
document.addEventListener('DOMContentLoaded', () => {
  const popCheck = document.getElementById('toggleDhikrPopup');
  if (popCheck) {
    const saved = localStorage.getItem('tasmi3_dhikr_popup_enabled');
    popCheck.checked = saved === null ? true : saved === 'true';
  }
});
