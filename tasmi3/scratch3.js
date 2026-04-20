const fs = require('fs');

let code = fs.readFileSync('app.js', 'utf8');

// 1. Wipe out SURAHS object completely
const startIdx = code.indexOf('const SURAHS = {');
const endIdx = code.indexOf('// ── Surah order');
if (startIdx !== -1 && endIdx !== -1) {
    code = code.slice(0, startIdx) + 'const SURAHS = {};\n\n' + code.slice(endIdx);
}

// 2. Wipe out SURAH_ORDER
const orderStart = code.indexOf('const SURAH_ORDER = [');
if (orderStart !== -1) {
    const orderEnd = code.indexOf(';', orderStart);
    code = code.slice(0, orderStart) + 'let SURAH_ORDER = Array.from({length: 114}, (_, i) => i + 1)' + code.slice(orderEnd);
}

// 3. Make loadSurah async and fetch data
const loadSurahStart = code.indexOf('function loadSurah(id) {');
if (loadSurahStart !== -1) {
    const snippetEnd = code.indexOf('if (!surah) return;', loadSurahStart) + 'if (!surah) return;'.length;
    
    const newLoadSurah = `async function loadSurah(id) {
  currentSurah = parseInt(id);

  if (!SURAHS[id]) {
      const container = document.getElementById('ayahsContainer');
      container.innerHTML = '<div style="text-align:center; color: var(--gold); font-size: 1.5rem; margin-top: 40px; animation: sajdaPulse 1.5s infinite;">جاري التحميل...</div>';
      try {
          const res = await fetch('https://api.alquran.cloud/v1/surah/' + id);
          if (!res.ok) throw new Error('Network Error');
          const data = await res.json();
          
          let ayahsList = [];
          data.data.ayahs.forEach((a, i) => {
              let text = a.text;
              if (id != 1 && id != 9 && i === 0 && text.startsWith('بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِیمِ')) {
                  text = text.replace(/^بِسۡمِ ٱللَّهِ ٱلرَّحۡمَـٰنِ ٱلرَّحِیمِ\\s*/, '');
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
  if (!surah) return;`;

    code = code.slice(0, loadSurahStart) + newLoadSurah + code.slice(snippetEnd);
}

// 4. Update Initialization script at bottom to fetch Surah list
const initCodeStart = code.lastIndexOf('// Init');
if (initCodeStart !== -1) {
    const initCodeEnd = code.indexOf('initCustomSelect();', initCodeStart) + 'initCustomSelect();'.length;
    
    const initCode = `// Init
async function initApi() {
  try {
    const res = await fetch('https://api.alquran.cloud/v1/surah');
    if(!res.ok) throw new Error("Could not load Surah list");
    const data = await res.json();
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
    if (surahParam && parseInt(surahParam) >= 1 && parseInt(surahParam) <= 114) {
      nativeSelect.value = surahParam;
    } else {
      nativeSelect.value = '1';
    }
    
    initCustomSelect();
    
    // We also need to set the text wrapper
    const initialOpt = document.querySelector(\`#surahSelect option[value="\${nativeSelect.value}"]\`);
    if(initialOpt) {
       document.getElementById('customSurahText').textContent = initialOpt.text;
    }
  } catch(e) {
    console.error(e);
  }
}
initApi();`;

    code = code.slice(0, initCodeStart) + initCode + code.slice(initCodeEnd);
}

fs.writeFileSync('app.js', code, 'utf8');
console.log('App.js perfectly and reliably rewritten via manual bounds.');
