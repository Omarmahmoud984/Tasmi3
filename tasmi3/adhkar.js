let currentCategory = 'morning';
let dhikrState = {}; // to store current counts

// ── Tab Completion Tracking (session-only, no persistence) ──
const _completedTabs = new Set(); // prevents duplicate popups
const TAB_NAMES = {
  morning: 'أذكار الصباح',
  evening: 'أذكار المساء',
  after_prayer: 'أذكار بعد الصلاة',
  sleep: 'أذكار النوم'
};

function initAdhkar() {
  const savedTheme = localStorage.getItem('tasmi3_theme');
  if (savedTheme === 'dark') {
    setAdhkarTheme('dark');
  } else {
    setAdhkarTheme('light');
  }

  // Initialize state based on ADHIKAR_DB
  resetState();
  renderList(currentCategory);
}

function resetState() {
  dhikrState = {};
  for (let cat in ADHIKAR_DB) {
    dhikrState[cat] = {};
    ADHIKAR_DB[cat].forEach(d => {
      dhikrState[cat][d.id] = d.count;
      if (d.subDhikrs) {
        d.subDhikrs.forEach(sub => {
          dhikrState[cat][sub.id] = sub.count;
        });
      }
    });
  }
}

function setAdhkarTheme(mode) {
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

function switchAdhkarTab(category, btnElement) {
  const tabs = document.querySelectorAll('.tabs-header .tab-btn');
  tabs.forEach(t => t.classList.remove('active'));
  btnElement.classList.add('active');

  currentCategory = category;
  renderList(category);
}

function renderList(category) {
  const container = document.getElementById('adhkarList');
  container.innerHTML = '';

  const list = ADHIKAR_DB[category];
  if (!list) return;

  list.forEach(item => {
    let isFinished = false;
    let cardHtml = '';

    if (item.subDhikrs) {
      let anyLeft = false;
      let subHtml = '<div class="sub-dhikr-container show" id="subc-' + item.id + '">';
      item.subDhikrs.forEach(sub => {
        const subCount = dhikrState[category][sub.id];
        const subFin = subCount <= 0;
        if (!subFin) anyLeft = true;

        subHtml += `
          <div class="sub-dhikr-item">
            <span class="sub-dhikr-text">${sub.text}</span>
            <div class="dhikr-count-circle ${subFin ? 'finished' : ''} sub-circle" onclick="decrementSubCount('${item.id}', '${sub.id}')" id="count-${sub.id}">
              ${subFin ? '\u2713' : subCount}
            </div>
          </div>
        `;
      });
      subHtml += '</div>';
      isFinished = !anyLeft;

      cardHtml = `
        <div class="dhikr-text">${item.text}</div>
        <div class="dhikr-controls">
          <span class="dhikr-info-icon" title="\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0641\u0636\u0644" onclick="openDhikrModal('${item.id}')">❓</span>
          <button class="dhikr-expand-btn" id="expand-${item.id}" onclick="toggleSubDhikr('${item.id}')">▲</button>
        </div>
        ${subHtml}
      `;
    } else {
      const currentCount = dhikrState[category][item.id];
      isFinished = currentCount <= 0;

      cardHtml = `
        <div class="dhikr-text">${item.text}</div>
        <div class="dhikr-controls">
          <span class="dhikr-info-icon" title="معلومات الفضل" onclick="openDhikrModal('${item.id}')">❓</span>
          <div class="dhikr-count-circle ${isFinished ? 'finished' : ''}" onclick="decrementCount('${item.id}')" id="count-${item.id}">
            ${isFinished ? '✓' : currentCount}
          </div>
        </div>
      `;
    }

    const card = document.createElement('div');
    card.className = `dhikr-card ${isFinished ? 'completed' : ''}`;
    card.id = `card-${item.id}`;
    card.innerHTML = cardHtml;

    container.appendChild(card);
  });
}

function decrementCount(dhikrId) {
  const currentCount = dhikrState[currentCategory][dhikrId];
  if (currentCount <= 0) return; // already done

  const newCount = currentCount - 1;
  dhikrState[currentCategory][dhikrId] = newCount;

  const circle = document.getElementById(`count-${dhikrId}`);
  const card = document.getElementById(`card-${dhikrId}`);

  // Animation effect
  circle.style.transform = 'scale(0.85)';
  setTimeout(() => circle.style.transform = '', 150);

  if (newCount <= 0) {
    circle.innerHTML = '✓';
    circle.classList.add('finished');
    card.classList.add('completed');
    checkTabCompletion(currentCategory);
  } else {
    circle.innerHTML = newCount;
  }
}

function toggleSubDhikr(parentId) {
  const container = document.getElementById(`subc-${parentId}`);
  const btn = document.getElementById(`expand-${parentId}`);
  if (container.classList.contains('show')) {
    container.classList.remove('show');
    btn.innerHTML = '▼';
  } else {
    container.classList.add('show');
    btn.innerHTML = '▲';
  }
}

function decrementSubCount(parentId, subId) {
  const currentCount = dhikrState[currentCategory][subId];
  if (currentCount <= 0) return; // already done

  const newCount = currentCount - 1;
  dhikrState[currentCategory][subId] = newCount;

  const circle = document.getElementById(`count-${subId}`);

  // Animation effect
  circle.style.transform = 'scale(0.85)';
  setTimeout(() => circle.style.transform = '', 150);

  if (newCount <= 0) {
    circle.innerHTML = '✓';
    circle.classList.add('finished');
    checkParentCompletion(parentId);
  } else {
    circle.innerHTML = newCount;
  }
}

function checkParentCompletion(parentId) {
  const item = ADHIKAR_DB[currentCategory].find(d => d.id === parentId);
  if (!item || !item.subDhikrs) return;

  let anyLeft = false;
  item.subDhikrs.forEach(sub => {
    if (dhikrState[currentCategory][sub.id] > 0) anyLeft = true;
  });

  if (!anyLeft) {
    const card = document.getElementById(`card-${parentId}`);
    card.classList.add('completed');
    checkTabCompletion(currentCategory);
  }
}

function openDhikrModal(dhikrId) {
  const item = ADHIKAR_DB[currentCategory].find(d => d.id === dhikrId);
  if (!item) return;

  document.getElementById('dhikrRef').textContent = item.ref;
  document.getElementById('dhikrFadhilah').textContent = item.fadhilah;

  const modal = document.getElementById('dhikrInfoModal');
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function closeDhikrModal(e) {
  if (e && e.target && !e.target.classList.contains('custom-modal-overlay') && !e.target.classList.contains('custom-modal-close') && e.target.id !== 'dhikrInfoModal') {
    return;
  }
  const modal = document.getElementById('dhikrInfoModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }
}

// ── Tab Completion Detection ──
function checkTabCompletion(category) {
  if (_completedTabs.has(category)) return; // already shown popup

  const list = ADHIKAR_DB[category];
  if (!list) return;

  let allDone = true;
  for (const item of list) {
    if (item.subDhikrs) {
      for (const sub of item.subDhikrs) {
        if (dhikrState[category][sub.id] > 0) { allDone = false; break; }
      }
    } else {
      if (dhikrState[category][item.id] > 0) { allDone = false; }
    }
    if (!allDone) break;
  }

  if (allDone) {
    _completedTabs.add(category);
    markTabCompleted(category);
    showCompletionPopup(TAB_NAMES[category] || category);
  }
}

// ── Mark Tab Green ──
function markTabCompleted(category) {
  const tabKeys = ['morning', 'evening', 'after_prayer', 'sleep'];
  const idx = tabKeys.indexOf(category);
  if (idx === -1) return;

  const tabBtns = document.querySelectorAll('.tabs-header .tab-btn');
  if (tabBtns[idx]) {
    tabBtns[idx].classList.add('tab-completed');
  }
}

// ── Completion Popup (uses same overlay+card pattern as ? info modal) ──
function showCompletionPopup(tabName) {
  // Remove any existing popup
  const existing = document.getElementById('adhkarCompletionPopup');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'adhkarCompletionPopup';
  overlay.className = 'custom-modal-overlay adhkar-completion-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeCompletionPopup();
  });

  overlay.innerHTML = `
    <div class="custom-modal adhkar-completion-modal" onclick="event.stopPropagation()">
      <div class="custom-modal-header">
        <h3 class="custom-modal-title">تم بحمد الله ✓</h3>
        <button class="custom-modal-close" onclick="closeCompletionPopup()">×</button>
      </div>
      <div class="custom-modal-body" style="text-align: center; padding: 26px 18px;">
        <div style="font-family: 'Scheherazade New', serif; font-size: 1.25rem; line-height: 1.8; color: var(--gold); font-weight: 700; margin-bottom: 8px;">بارك الله فيك</div>
        <div style="font-size: 1rem; line-height: 1.6; color: var(--text2);">لقد أتممت <b style="color: var(--gold);">${tabName}</b> بنجاح</div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Trigger animation on next frame
  requestAnimationFrame(() => {
    overlay.classList.add('show');
  });

  // Auto-dismiss after 3 seconds
  overlay._timer = setTimeout(() => closeCompletionPopup(), 3000);
}

function closeCompletionPopup() {
  const overlay = document.getElementById('adhkarCompletionPopup');
  if (!overlay) return;
  clearTimeout(overlay._timer);
  overlay.classList.remove('show');
  document.body.style.overflow = '';
  setTimeout(() => overlay.remove(), 350);
}

// Start
initAdhkar();

// Global Sidebar Actions for adhkar.html
function toggleNavSidebar() {
  const sidebar = document.getElementById('navSidebar');
  const overlay = document.getElementById('navSidebarOverlay');
  if (sidebar) sidebar.classList.toggle('show');
  if (overlay) overlay.classList.toggle('show');
}

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

// ══════════════════════════════════════════════════════
//  IMAGE EXPORT — تحميل الصورة
// ══════════════════════════════════════════════════════

const SECTION_THEMES = {
  morning: {
    gradient: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
    accent: '#f2a65a',
    accentDim: 'rgba(242, 166, 90, 0.15)',
    borderColor: 'rgba(242, 166, 90, 0.3)',
    emoji: '🌅',
    title: 'أذكار الصباح'
  },
  evening: {
    gradient: 'linear-gradient(135deg, #141e30 0%, #243b55 100%)',
    accent: '#e0c3fc',
    accentDim: 'rgba(224, 195, 252, 0.15)',
    borderColor: 'rgba(224, 195, 252, 0.3)',
    emoji: '🌙',
    title: 'أذكار المساء'
  },
  sleep: {
    gradient: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    accent: '#b47ff5',
    accentDim: 'rgba(180,127,245,0.15)',
    borderColor: 'rgba(180,127,245,0.3)',
    emoji: '😴',
    title: 'أذكار النوم'
  },
  after_prayer: {
    gradient: 'linear-gradient(135deg, #3e2e1e 0%, #2e1e0f 100%)',
    accent: '#d4a853',
    accentDim: 'rgba(212,168,83,0.15)',
    borderColor: 'rgba(212,168,83,0.3)',
    emoji: '🕌',
    title: 'أذكار بعد الصلاة'
  }
};

function formatAdhkarCount(n) {
  const toAr = s => String(s).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
  if (n === 1) return 'مرة واحدة';
  if (n === 2) return 'مرتان';
  if (n <= 10) return `${toAr(n)} مرات`;
  return `${toAr(n)} مرة`;
}

function buildItemCard(text, count, theme, config) {
  const badge = formatAdhkarCount(count);
  const safeText = text.replace(/\n/g, '<br>');
  return `
    <div style="
      background: rgba(0, 0, 0, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 16px;
      padding: ${config.cardPadding}px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    ">
      <div style="
        color: rgba(255,255,255,0.9);
        font-size: ${config.fontSize}px;
        line-height: 1.6;
        font-family: 'Scheherazade New', serif;
        margin-bottom: 8px;
      ">${safeText}</div>
      <div style="text-align: left;">
        <span style="
          color: ${theme.accent};
          font-size: ${config.badgeSize}px;
          font-weight: 700;
          font-family: 'Cairo', sans-serif;
          opacity: 0.9;
        ">✦ ${badge}</span>
      </div>
    </div>`;
}

function buildGroupLabel(text, theme, config) {
  const safeText = text.replace(/\n/g, ' ');
  return `
    <div style="
      width: 100%;
      color:${theme.accent};
      font-size:${config.titleSize}px;
      font-weight:900;
      padding:4px 0;
      font-family:'Cairo',sans-serif;
      margin-top: 8px;
      margin-bottom: 4px;
      text-align: right;
    ">${safeText}</div>`;
}

async function exportSectionImage(category) {
  if (typeof html2canvas === 'undefined') {
    alert('يتطلب اتصالاً بالإنترنت لتحميل الصورة أول مرة');
    return;
  }

  const btn = document.getElementById('btnDownloadImg');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ جاري التحميل...'; }

  const theme = SECTION_THEMES[category] || SECTION_THEMES.morning;
  const items = ADHIKAR_DB[category] || [];

  let totalCards = 0;
  items.forEach(item => {
    totalCards += item.subDhikrs ? item.subDhikrs.length : 1;
  });

  // Adaptive Grid Configuration (Decreased sizes by ~15% to ensure everything fits)
  let config = {};
  if (totalCards <= 8) {
    config = { cols: 2, fontSize: 27, cardPadding: 24, badgeSize: 18, titleSize: 26 };
  } else if (totalCards <= 14) {
    config = { cols: 2, fontSize: 22, cardPadding: 18, badgeSize: 14, titleSize: 22 };
  } else if (totalCards <= 22) { // Perfect for Morning/Evening (~21 cards)
    config = { cols: 3, fontSize: 19, cardPadding: 16, badgeSize: 13, titleSize: 20 };
  } else if (totalCards <= 32) {
    config = { cols: 4, fontSize: 15, cardPadding: 12, badgeSize: 12, titleSize: 18 };
  } else {
    config = { cols: 5, fontSize: 14, cardPadding: 10, badgeSize: 11, titleSize: 16 };
  }

  // Column-based manual distribution to preserve groups while balancing columns
  const targetCardsPerCol = totalCards / config.cols;
  const columnsData = Array.from({ length: config.cols }, () => []);
  let currentCol = 0;
  let currentCardsInCol = 0;

  items.forEach(item => {
    let groupCards = [];
    let groupCardCount = 0;

    if (item.subDhikrs && item.subDhikrs.length) {
      groupCards.push(buildGroupLabel(item.text, theme, config));
      item.subDhikrs.forEach(sub => {
        groupCards.push(buildItemCard(sub.text, sub.count, theme, config));
        groupCardCount++;
      });
    } else {
      groupCards.push(buildItemCard(item.text, item.count, theme, config));
      groupCardCount++;
    }

    // Balance columns more aggressively
    if (currentCardsInCol > 0 && currentCardsInCol + (groupCardCount * 0.7) > targetCardsPerCol && currentCol < config.cols - 1) {
      currentCol++;
      currentCardsInCol = 0;
    }

    columnsData[currentCol].push(...groupCards);
    currentCardsInCol += groupCardCount;
  });

  const gap = config.cols >= 4 ? 12 : 24;
  let columnsHtml = '';
  columnsData.forEach(colItems => {
    columnsHtml += `
      <div style="flex: 1; display: flex; flex-direction: column; gap: ${gap}px;">
        ${colItems.join('')}
      </div>
    `;
  });

  // Build hidden export container (1080P Fixed, NO truncation)
  const wrap = document.createElement('div');
  wrap.style.cssText = `
    position:fixed; left:-9999px; top:0;
    width:1080px; height:1920px;
    font-family:'Cairo',sans-serif;
    direction:rtl;
    background:${theme.gradient};
    padding:40px 40px;
    box-sizing:border-box;
    display:flex; flex-direction:column;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  `;

  wrap.innerHTML = `
    <!-- HEADER -->
    <div style="text-align:center; margin-bottom:20px; flex-shrink:0;">
      <div style="font-size:60px; margin-bottom:0px;">${theme.emoji}</div>
      <div style="
        color:${theme.accent};
        font-size:42px;
        font-weight:900;
        font-family:'Cairo',sans-serif;
      ">${theme.title}</div>
      <div style="width:150px; height:3px; background:${theme.accent}; margin:10px auto 0; opacity:0.5; border-radius:3px;"></div>
    </div>

    <!-- DHIKR ITEMS (Vertical Column Flow) -->
    <div style="
      display: flex; 
      gap: ${gap}px;
      flex: 1;
      overflow: hidden;
    ">
      ${columnsHtml}
    </div>

    <!-- FOOTER -->
    <div style="flex-shrink:0; margin-top:20px;">
      <div style="
        text-align:center;
        padding-top:20px;
        border-top:1px solid rgba(255,255,255,0.1);
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 16px;
      ">
        <span style="color:${theme.accent}; font-size:28px; font-weight:900; font-family:'Cairo',sans-serif; letter-spacing:1px;">Tasmi3</span>
        <span style="color:rgba(255,255,255,0.2); font-size:20px;">|</span>
        <span style="color:rgba(255,255,255,0.5); font-size:18px; font-family:'Cairo',sans-serif;">tasmi3.vercel.app.com</span>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  try {
    const canvas = await html2canvas(wrap, {
      scale: 3, // Increased from 2 for Ultra HD sharpness when zooming
      useCORS: true,
      backgroundColor: null,
      logging: false
    });

    // Use toBlob for binary file
    await new Promise((resolve, reject) => {
      canvas.toBlob(async blob => {
        if (!blob) { reject(new Error('toBlob failed')); return; }

        const fileName = `adhkar-${category}.png`;

        // ── Best on Windows Desktop: File System Access API ──
        if ('showSaveFilePicker' in window) {
          try {
            const handle = await window.showSaveFilePicker({
              suggestedName: fileName,
              types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }]
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            resolve();
            return; // Success, skip fallback
          } catch (err) {
            // User cancelled or API failed, fall through to fallback
            if (err.name === 'AbortError') { resolve(); return; } 
          }
        }

        // ── Fallback for Mobile/Older browsers ──
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = fileName;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        resolve();
      }, 'image/png');
    });
  } catch (err) {
    console.error('[Export]', err);
    alert('فشل تحميل الصورة، حاول مجدداً');
  }

  document.body.removeChild(wrap);
  if (btn) { btn.disabled = false; btn.innerHTML = '📥 تحميل الصورة'; }
}

