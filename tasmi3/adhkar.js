let currentCategory = 'morning';
let dhikrState = {}; // to store current counts

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
  for(let cat in ADHIKAR_DB) {
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
  if(!list) return;

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
  if(currentCount <= 0) return; // already done

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
  if(currentCount <= 0) return; // already done

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
  }
}

function openDhikrModal(dhikrId) {
  const item = ADHIKAR_DB[currentCategory].find(d => d.id === dhikrId);
  if(!item) return;

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
