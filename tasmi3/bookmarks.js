/* ══════════════════════════════════════════════════════════
   Tasmi3 — Local bookmarks helper
   Shared by: index.html (تسميع) · mos7af.html (قراءة) · bookmark.html

   Everything is localStorage only:
     tasmi3_bookmarks  → marks made while memorizing (per ayah)
     mos7af_bookmarks  → marks made while reading   (per page/juz/rub/surah)

   The two stores are never merged.
   ══════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var KEYS = {
    tasmi3: 'tasmi3_bookmarks',
    read: 'mos7af_bookmarks'
  };

  var LAST_KEYS = {
    tasmi3: 'tasmi3_last_position',
    read: 'mos7af_last_position'
  };

  var EVENT_NAME = 'tasmi3:bookmarks-changed';

  var READ_LIMITS = { page: 604, surah: 114, juz: 30, rub: 240 };

  var SURAH_NAMES = [
    'الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف', 'الأنفال', 'التوبة', 'يونس',
    'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر', 'النحل', 'الإسراء', 'الكهف', 'مريم', 'طه',
    'الأنبياء', 'الحج', 'المؤمنون', 'النور', 'الفرقان', 'الشعراء', 'النمل', 'القصص', 'العنكبوت', 'الروم',
    'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر', 'يس', 'الصافات', 'ص', 'الزمر', 'غافر',
    'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية', 'الأحقاف', 'محمد', 'الفتح', 'الحجرات', 'ق',
    'الذاريات', 'الطور', 'النجم', 'القمر', 'الرحمن', 'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة',
    'الصف', 'الجمعة', 'المنافقون', 'التغابن', 'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة', 'المعارج',
    'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة', 'الإنسان', 'المرسلات', 'النبأ', 'النازعات', 'عبس',
    'التكوير', 'الانفطار', 'المطففين', 'الانشقاق', 'البروج', 'الطارق', 'الأعلى', 'الغاشية', 'الفجر', 'البلد',
    'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين', 'العلق', 'القدر', 'البينة', 'الزلزلة', 'العاديات',
    'القارعة', 'التكاثر', 'العصر', 'الهمزة', 'الفيل', 'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر',
    'المسد', 'الإخلاص', 'الفلق', 'الناس'
  ];

  var AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
  var AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  // ── Storage ──────────────────────────────────────────────
  function readKey(key) {
    try {
      var raw = global.localStorage.getItem(key);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(function (e) { return e && typeof e.id === 'string' && e.id; });
    } catch (err) {
      try { global.localStorage.removeItem(key); } catch (e2) { }
      return [];
    }
  }

  function writeKey(key, arr) {
    try { global.localStorage.setItem(key, JSON.stringify(arr)); } catch (err) { }
  }

  function keyFor(mode) {
    return KEYS[mode] || KEYS.tasmi3;
  }

  function list(mode) {
    return readKey(keyFor(mode)).slice().sort(function (a, b) {
      return (b.at || 0) - (a.at || 0);
    });
  }

  function count(mode) {
    return readKey(keyFor(mode)).length;
  }

  // ── Identity ─────────────────────────────────────────────
  function makeId(mode, entry) {
    if (mode === 'read') {
      return 'r:' + entry.view + ':' + entry.index;
    }
    return 't:' + entry.surah + ':' + entry.ayah;
  }

  function has(mode, entry) {
    var id = makeId(mode, entry);
    var arr = readKey(keyFor(mode));
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) return true;
    }
    return false;
  }

  function toggle(mode, entry) {
    var key = keyFor(mode);
    var arr = readKey(key);
    var id = makeId(mode, entry);

    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === id) {
        var removed = arr.splice(i, 1)[0];
        writeKey(key, arr);
        notify(mode);
        return { added: false, entry: removed };
      }
    }

    var stored = {};
    for (var k in entry) {
      if (Object.prototype.hasOwnProperty.call(entry, k)) stored[k] = entry[k];
    }
    stored.id = id;
    stored.mode = mode;
    stored.at = Date.now();

    arr.unshift(stored);
    writeKey(key, arr);
    notify(mode);
    return { added: true, entry: stored };
  }

  function remove(mode, id) {
    var key = keyFor(mode);
    var arr = readKey(key);
    var next = arr.filter(function (x) { return x.id !== id; });
    if (next.length === arr.length) return false;
    writeKey(key, next);
    notify(mode);
    return true;
  }

  function clearAll(mode) {
    writeKey(keyFor(mode), []);
    notify(mode);
  }

  function notify(mode) {
    refreshSidebarCounts();
    try {
      global.dispatchEvent(new global.CustomEvent(EVENT_NAME, { detail: { mode: mode } }));
    } catch (err) { }
  }

  // ── Last position ────────────────────────────────────────
  function getLast(mode) {
    try {
      var raw = global.localStorage.getItem(LAST_KEYS[mode] || LAST_KEYS.tasmi3);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      return obj;
    } catch (err) {
      return null;
    }
  }

  function setLast(mode, data) {
    try {
      global.localStorage.setItem(LAST_KEYS[mode] || LAST_KEYS.tasmi3, JSON.stringify(data));
    } catch (err) { }
  }

  // ── Arabic formatting ────────────────────────────────────
  function toArabicDigits(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/[0-9]/g, function (d) { return AR_DIGITS[Number(d)]; });
  }

  function surahName(n) {
    var i = parseInt(n, 10);
    if (isNaN(i) || i < 1 || i > 114) return '';
    return SURAH_NAMES[i - 1];
  }

  // Strip Arabic diacritics so names read cleanly in lists
  function cleanArabic(str) {
    if (!str) return '';
    try {
      return String(str)
        .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08E1]/g, '')
        .replace(/\u0671/g, '\u0627')
        .trim();
    } catch (err) {
      return String(str);
    }
  }

  function readViewLabel(view, index) {
    var n = toArabicDigits(index);
    if (view === 'page') return 'صفحة ' + n;
    if (view === 'juz') return 'الجزء ' + n;
    if (view === 'rub') return 'الربع ' + n;
    if (view === 'surah') return 'سورة ' + surahName(index);
    return '';
  }

  function _startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  function _formatDate(date, sameYear) {
    try {
      var opts = { day: 'numeric', month: 'long' };
      if (!sameYear) opts.year = 'numeric';
      return new Intl.DateTimeFormat('ar-u-nu-arab', opts).format(date);
    } catch (err) {
      var out = toArabicDigits(date.getDate()) + ' ' + AR_MONTHS[date.getMonth()];
      if (!sameYear) out += ' ' + toArabicDigits(date.getFullYear());
      return out;
    }
  }

  function dayLabel(ts) {
    var date = new Date(ts);
    if (isNaN(date.getTime())) return '';
    var now = new Date();
    var diffDays = Math.round((_startOfDay(now) - _startOfDay(date)) / 86400000);
    var sameYear = date.getFullYear() === now.getFullYear();

    if (diffDays === 0) return 'اليوم';
    if (diffDays === 1 && sameYear) return 'أمس';
    return _formatDate(date, sameYear);
  }

  function formatTime(ts) {
    var date = new Date(ts);
    if (isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('ar-u-nu-arab', { hour: 'numeric', minute: '2-digit' }).format(date);
    } catch (err) {
      var h = date.getHours();
      var m = date.getMinutes();
      var suffix = h < 12 ? 'ص' : 'م';
      var h12 = h % 12;
      if (h12 === 0) h12 = 12;
      var mm = m < 10 ? '0' + m : String(m);
      return toArabicDigits(h12) + ':' + toArabicDigits(mm) + ' ' + suffix;
    }
  }

  // "اليوم · ٩:٤٥ م"
  function formatStamp(ts) {
    var label = dayLabel(ts);
    var time = formatTime(ts);
    if (!label) return time;
    if (!time) return label;
    return label + ' · ' + time;
  }

  // ── Row text helpers ─────────────────────────────────────
  function entryTitle(entry) {
    if (!entry) return '';
    if (entry.mode === 'read' || entry.view) {
      var label = readViewLabel(entry.view, entry.index);
      var sName = cleanArabic(entry.surahName || surahName(entry.surah));
      if (entry.view === 'surah') return label;
      return sName ? label + ' · ' + sName : label;
    }
    var name = cleanArabic(entry.surahName || surahName(entry.surah));
    return name + ' — الآية ' + toArabicDigits(entry.ayah);
  }

  // ── Sidebar badges ───────────────────────────────────────
  function refreshSidebarCounts() {
    var nodes = document.querySelectorAll('[data-bm-count]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var mode = el.getAttribute('data-bm-count') || 'tasmi3';
      var c = count(mode);
      el.textContent = c > 0 ? toArabicDigits(c) : '';
      el.style.display = c > 0 ? 'inline-block' : 'none';
    }
  }

  function initSidebarCounts() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', refreshSidebarCounts);
    } else {
      refreshSidebarCounts();
    }
    global.addEventListener(EVENT_NAME, refreshSidebarCounts);
  }
  initSidebarCounts();

  global.Tasmi3BK = {
    KEYS: KEYS,
    LAST_KEYS: LAST_KEYS,
    READ_LIMITS: READ_LIMITS,
    EVENT: EVENT_NAME,

    list: list,
    count: count,
    has: has,
    toggle: toggle,
    remove: remove,
    clearAll: clearAll,
    makeId: makeId,

    getLast: getLast,
    setLast: setLast,

    toArabicDigits: toArabicDigits,
    surahName: surahName,
    cleanArabic: cleanArabic,
    readViewLabel: readViewLabel,
    dayLabel: dayLabel,
    formatTime: formatTime,
    formatStamp: formatStamp,
    entryTitle: entryTitle,

    refreshSidebarCounts: refreshSidebarCounts
  };
})(window);
