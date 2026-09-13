/**
 * offline_tafsir.js
 * Offline Tafsir System — الميسر only (16)
 * Fixed: TransactionInactiveError, gap-fill, retry, save
 */

const OT_DB_NAME = 'tasmi3_tafsir_offline';
const OT_DB_VERSION = 1;
const OT_STORE = 'tafsir_data';

let _otDb = null;

function otOpenDB() {
  return new Promise((resolve, reject) => {
    if (_otDb) return resolve(_otDb);
    const req = indexedDB.open(OT_DB_NAME, OT_DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(OT_STORE)) {
        db.createObjectStore(OT_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => {
      _otDb = e.target.result;
      resolve(_otDb);
    };
    req.onerror = () => reject(req.error);
  });
}

async function otSaveAyahTafsir(tafsirId, surah, ayah, text) {
  tafsirId = String(tafsirId);
  const db = await otOpenDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OT_STORE, 'readwrite');
    const store = tx.objectStore(OT_STORE);
    const req = store.put({
      id: `tafsir_${tafsirId}_surah_${surah}_ayah_${ayah}`,
      tafsirId,
      surah,
      ayah,
      text
    });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

window.otGetTafsirOffline = async function(tafsirId, surah, ayah) {
  try {
    tafsirId = String(tafsirId);
    const db = await otOpenDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OT_STORE, 'readonly');
      const req = tx.objectStore(OT_STORE).get(`tafsir_${tafsirId}_surah_${surah}_ayah_${ayah}`);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
};

// FIXED: no single transaction for 114 parallel gets (TransactionInactiveError)
// Instead sequential gets, each in its own transaction
window.otCheckDownloadedSurahs = async function(tafsirId) {
  tafsirId = String(tafsirId);
  try {
    const downloaded = [];
    for (let i = 1; i <= 114; i++) {
      const data = await window.otGetTafsirOffline(tafsirId, i, 1);
      if (data) downloaded.push(i);
    }
    return downloaded;
  } catch {
    return [];
  }
};

// Surah ayah counts for correct tail-fill (instead of pagination.total_records which is group count)
const OT_SURAH_AYAH_COUNT = [0,7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];

async function _fetchWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { cache: 'reload' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, attempt * 800));
    }
  }
}

window.fetchSurahTafsirQuranCom = async function(tafsirId, surah) {
  tafsirId = String(tafsirId);
  surah = parseInt(surah);
  const res = await _fetchWithRetry(`https://api.quran.com/api/v4/tafsirs/${tafsirId}/by_chapter/${surah}?per_page=360`);
  const data = await res.json();
  const ayahs = data.tafsirs || [];
  const totalAyahs = OT_SURAH_AYAH_COUNT[surah] || 0;
  let lastAyahNum = 0;
  let lastText = "";

  for (let i = 0; i < ayahs.length; i++) {
    const a = ayahs[i];
    // verse_key can be "2:1" or "2:1-5" (grouped) — take first number
    const versePart = a.verse_key.split(':')[1];
    const ayahNum = parseInt(versePart.split('-')[0]);
    if (ayahNum > lastAyahNum + 1) {
      for (let g = lastAyahNum + 1; g < ayahNum; g++) {
        await otSaveAyahTafsir(tafsirId, surah, g, lastText);
      }
    }
    await otSaveAyahTafsir(tafsirId, surah, ayahNum, a.text);
    // If grouped range like 2:1-5, fill the rest of the range with same text
    if (versePart.includes('-')) {
      const endNum = parseInt(versePart.split('-')[1]);
      for (let g = ayahNum + 1; g <= endNum; g++) {
        await otSaveAyahTafsir(tafsirId, surah, g, a.text);
      }
      lastAyahNum = endNum;
    } else {
      lastAyahNum = ayahNum;
    }
    lastText = a.text;
  }
  // Fill tail to real ayah count (not pagination count)
  if (totalAyahs > 0 && lastAyahNum < totalAyahs) {
    for (let g = lastAyahNum + 1; g <= totalAyahs; g++) {
      await otSaveAyahTafsir(tafsirId, surah, g, lastText);
    }
  }
};

// Purge utility
window.otClearTafsir = async function(tafsirId) {
  try {
    tafsirId = String(tafsirId);
    const db = await otOpenDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(OT_STORE, 'readwrite');
      const store = tx.objectStore(OT_STORE);
      const req = store.openCursor();
      let deleted = 0;
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (String(cursor.key).startsWith(`tafsir_${tafsirId}_`)) {
            cursor.delete();
            deleted++;
          }
          cursor.continue();
        } else {
          console.log(`[otClearTafsir] Deleted ${deleted} for ${tafsirId}`);
          resolve(deleted);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
};

// Auto-purge old tafsirs (14,15,ar.miqbas) on load — keep only 16
(async () => {
  try {
    const purged = localStorage.getItem('tasmi3_purged_old_tafsir');
    if (!purged) {
      await window.otClearTafsir('14');
      await window.otClearTafsir('15');
      await window.otClearTafsir('ar.miqbas');
      localStorage.setItem('tasmi3_purged_old_tafsir', '1');
      console.log('[offline_tafsir] purged old tafsirs');
    }
  } catch {}
})();
