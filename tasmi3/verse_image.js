/**
 * verse_image.js
 * Reusable verse image export — theme-aware, HQ PNG
 */
(function () {
  'use strict';

  function getThemeTokens() {
    const cs = getComputedStyle(document.documentElement);
    const isLight = document.body.classList.contains('theme-light') || document.documentElement.classList.contains('theme-light-early');
    if (isLight) {
      return {
        bg: '#f9f6f0',
        card: '#ffffff',
        gold: '#9e7a2b',
        goldLine: 'rgba(173,125,43,0.22)',
        goldDim: 'rgba(173,125,43,0.10)',
        text: '#1e1e1e',
        textMuted: '#6b6b6b',
        isLight: true
      };
    }
    return {
      bg: '#080b0e',
      card: '#0f141b',
      gold: '#C49A3B',
      goldLine: 'rgba(196,154,59,0.22)',
      goldDim: 'rgba(196,154,59,0.12)',
      text: '#f0e6d2',
      textMuted: '#a09880',
      isLight: false
    };
  }

  function toArabicNum(n) {
    return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
  }

  function getSurahName(surahId) {
    if (typeof SURAHS !== 'undefined' && SURAHS[surahId] && SURAHS[surahId].name) return SURAHS[surahId].name;
    const opt = document.querySelector('#surahSelect option[value="' + surahId + '"]');
    if (opt) return opt.textContent.trim();
    return 'سورة ' + surahId;
  }

  function getDynamicFontSize(textLen) {
    if (textLen > 550) return { verse: 26, line: 2.95 };
    if (textLen > 400) return { verse: 30, line: 2.85 };
    if (textLen > 280) return { verse: 34, line: 2.8 };
    if (textLen > 180) return { verse: 38, line: 2.7 };
    if (textLen > 100) return { verse: 44, line: 2.6 };
    if (textLen > 60) return { verse: 48, line: 2.5 };
    return { verse: 54, line: 2.45 };
  }

  function buildVerseTemplate(surahId, ayahNum, ayahText) {
    const t = getThemeTokens();
    const surahName = getSurahName(surahId);
    const len = ayahText.length;
    const fs = getDynamicFontSize(len);
    const isLong = len > 260;

    const wrap = document.createElement('div');
    wrap.id = 'verseExportTemplate';
    wrap.dir = 'rtl';
    wrap.style.cssText = [
      'position:fixed',
      'left:-9999px',
      'top:0',
      'width:1080px',
      'box-sizing:border-box',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:flex-start',
      'height:auto',
      'padding:32px',
      'background:' + t.bg,
      'font-family:"Scheherazade New",serif',
      '-webkit-font-smoothing:antialiased',
      'text-rendering:optimizeLegibility'
    ].join(';');

    // Quran card — compact, no huge empty
    const cardStyle = [
      'width:100%',
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'justify-content:flex-start',
      'background:' + t.card,
      'border:1.2px solid ' + t.goldLine,
      'border-radius:22px',
      'padding:' + (isLong ? '32px 36px 28px 36px' : '36px 40px 32px 40px'),
      'box-sizing:border-box',
      'box-shadow:0 8px 32px rgba(0,0,0,' + (t.isLight ? '0.06' : '0.35') + ')'
    ].join(';');

    wrap.innerHTML = ''
      + '<div style="' + cardStyle + '">'
      // Header — clean, sharp, no blur
      + '  <div style="text-align:center; margin-bottom:' + (isLong ? '24px' : '30px') + '; width:100%;">'
      + '    <div style="color:' + t.gold + '; font-family:Cairo,sans-serif; font-size:28px; font-weight:800; letter-spacing:0; line-height:1.4; -webkit-font-smoothing:antialiased;">سورة ' + surahName + '</div>'
      + '    <div style="width:72px; height:2px; background:' + t.gold + '; margin:12px auto 0; border-radius:2px;"></div>'
      + '  </div>'
      // Verse — compact, no flex stretch
      + '  <div style="width:100%; max-width:860px; text-align:center; direction:rtl; unicode-bidi:plaintext; display:block;">'
      + '    <div style="color:' + t.text + '; font-family:\'Scheherazade New\',serif; font-size:' + fs.verse + 'px; line-height:' + fs.line + '; text-align:center; direction:rtl; unicode-bidi:plaintext; white-space:normal; overflow-wrap:break-word; word-break:normal; width:100%;">'
      + '      ﴿ ' + ayahText + ' ﴾'
      + '    </div>'
      + '  </div>'
      // Reference
      + '  <div style="margin-top:' + (isLong ? '26px' : '36px') + '; background:' + t.goldDim + '; border:1px solid ' + t.goldLine + '; border-radius:999px; padding:10px 22px; display:inline-flex; align-items:center; justify-content:center;">'
      + '    <span style="color:' + t.gold + '; font-family:Cairo,sans-serif; font-size:19px; font-weight:700;">' + surahName + ' : ' + toArabicNum(ayahNum) + '</span>'
      + '  </div>'
      // Footer — URL only
      + '  <div style="margin-top:20px; display:flex; align-items:center; justify-content:center; opacity:0.5;">'
      + '    <span style="color:' + t.textMuted + '; font-family:Cairo,sans-serif; font-size:12px; letter-spacing:0.3px;">tasmi3.vercel.app</span>'
      + '  </div>'
      + '</div>';

    return wrap;
  }

  async function exportVerseImage(surahId, ayahNum, ayahText) {
    if (typeof html2canvas === 'undefined') {
      alert('يتطلب اتصالاً بالإنترنت لتحميل المكتبة أول مرة');
      return;
    }
    // Ensure Scheherazade is loaded before capture
    if (document.fonts) {
      try {
        await document.fonts.load('400 1px "Scheherazade New"');
        await document.fonts.load('700 1px "Scheherazade New"');
        await document.fonts.ready;
      } catch (e) {}
    }
    const wrap = buildVerseTemplate(surahId, ayahNum, ayahText);
    document.body.appendChild(wrap);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 150));
    try {
      const canvas = await html2canvas(wrap, {
        scale: 3,
        useCORS: true,
        backgroundColor: null,
        logging: false,
        width: 1080,
        height: wrap.offsetHeight,
        windowWidth: 1080,
        windowHeight: wrap.offsetHeight
      });
      const fileName = 'ayah-' + surahId + '-' + ayahNum + '.png';
      canvas.toBlob(function (blob) {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = fileName;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
      }, 'image/png');
    } catch (err) {
      console.error('[verseImage]', err);
      alert('فشل إنشاء الصورة، حاول مجدداً');
    } finally {
      setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 600);
    }
  }

  window.exportVerseImage = exportVerseImage;
  window.buildVerseTemplate = buildVerseTemplate;
  window.getThemeTokens = getThemeTokens;
})();
