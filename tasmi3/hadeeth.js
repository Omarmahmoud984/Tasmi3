function setHadeethTheme(mode) {
  var body = document.body;
  var btnDark = document.getElementById('btnThemeDark');
  var btnLight = document.getElementById('btnThemeLight');
  if (mode === 'light') {
    body.classList.add('theme-light');
    if (btnLight) { btnLight.style.background = 'var(--gold-dim)'; btnLight.style.color = 'var(--gold)'; btnDark.style.background = 'transparent'; btnDark.style.color = 'var(--text2)'; }
    localStorage.setItem('tasmi3_theme', 'light');
  } else {
    body.classList.remove('theme-light');
    if (btnDark) { btnDark.style.background = 'var(--gold-dim)'; btnDark.style.color = 'var(--gold)'; btnLight.style.background = 'transparent'; btnLight.style.color = 'var(--text2)'; }
    localStorage.setItem('tasmi3_theme', 'dark');
  }
}

function toggleNavSidebar() {
  var sidebar = document.getElementById('navSidebar');
  var overlay = document.getElementById('navSidebarOverlay');
  if (sidebar) sidebar.classList.toggle('show');
  if (overlay) overlay.classList.toggle('show');
}
function installApp() { window.location.href = 'index.html'; }
function toggleDhikrPopupSetting(cb) { localStorage.setItem('tasmi3_dhikr_popup_enabled', String(cb.checked)); }

function renderHadeethList() {
  var container = document.getElementById('hadeethList');
  if (!container || typeof HADEETH_DB === 'undefined') return;
  container.innerHTML = '';
  HADEETH_DB.forEach(function(item) {
    var card = document.createElement('div');
    card.className = 'dhikr-card';
    card.id = 'card-' + item.id;
    card.innerHTML = ''
      + '<div style="text-align:center; color:var(--gold); opacity:0.55; font-size:0.72rem; letter-spacing:2px; font-weight:700; font-family:\'Cairo\',sans-serif; margin-bottom:10px;">الحديث ' + toArabicNum(item.id) + '</div>'
      + '<div class="dhikr-text" style="font-family:\'Scheherazade New\',serif; font-size:1.25rem; line-height:1.9;">' + item.text + '</div>'
      + '<div style="color:var(--gold); font-size:0.85rem; font-weight:700; margin-bottom:10px; opacity:0.85;">— ' + item.source + '</div>'
      + '<div class="dhikr-controls" style="justify-content: flex-end;">'
      + '  <span class="dhikr-info-icon" title="الشرح والمقصود" onclick="openHadeethModal(' + item.id + ')">❓</span>'
      + '</div>';
    container.appendChild(card);
  });
}

function openHadeethModal(id) {
  var item = HADEETH_DB.find(function(h){ return h.id === id; });
  if (!item) return;
  document.getElementById('hadeethRef').innerHTML = '<b style="color:var(--gold);">' + item.source + '</b> — الحديث رقم ' + toArabicNum(item.id);
  document.getElementById('hadeethSharh').textContent = item.explanation;
  document.getElementById('hadeethEgyptian').textContent = item.egyptian;
  var modal = document.getElementById('hadeethInfoModal');
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeHadeethModal(e) {
  if (e && e.target && !e.target.classList.contains('custom-modal-overlay') && !e.target.classList.contains('custom-modal-close') && e.target.id !== 'hadeethInfoModal') return;
  var modal = document.getElementById('hadeethInfoModal');
  if (modal) { modal.classList.remove('show'); document.body.style.overflow = ''; }
}
function toArabicNum(n){ return String(n).replace(/\d/g,function(d){ return '٠١٢٣٤٥٦٧٨٩'[d];}); }

(function initHadeeth(){
  var savedTheme = localStorage.getItem('tasmi3_theme');
  if (savedTheme === 'dark') setHadeethTheme('dark'); else setHadeethTheme('light');
  renderHadeethList();
  // count label
  var cnt = document.getElementById('hadeethCount');
  if (cnt && typeof HADEETH_DB !== 'undefined') cnt.textContent = toArabicNum(HADEETH_DB.length) + ' حديثًا';
})();

document.addEventListener('DOMContentLoaded', function(){
  var cb = document.getElementById('toggleDhikrPopup');
  if (cb) { var saved = localStorage.getItem('tasmi3_dhikr_popup_enabled'); cb.checked = saved === null ? true : saved === 'true'; }
});
