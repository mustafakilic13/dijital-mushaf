// page.js -- sayfa gösterimi ve gezinme: üst çubuk, sayfa kurma (buildPage), ayet/kelime vurgusu, showPage, goTo* işlevleri,
// adres çubuğu (#sayfa) ve son kalınan konum.
//
// Çevrimsel içe aktarma: bu modül, başka uygulama modülleriyle birbirini içe aktarıyor. Bu güvenli, çünkü içe aktarılan adlar YALNIZCA
// işlev gövdelerinde (çağrı anında) kullanılıyor; modül değerlendirilirken, üst düzeyde, başka bir uygulama modülünden ad okumayın
// (test/modul_siniri_test.mjs bunu denetler; bkz. GELISTIRICI.md "Modül haritası").

import { announceNavigation } from "./announce.js";
import { syncAyahNav } from "./ayah-nav.js";
import { loadJSON } from "./data-load.js";
import { endEzberStudy } from "./ezber-study.js";
import {
  ayahPage,
  currentHizbNumber,
  currentJuzNumber,
  currentManzilNumber,
  currentRubNumber,
  isAltRuku,
  pageFirstAyah,
  wordIdToAyah,
} from "./lookup.js";
import { syncAyahGridHighlight } from "./modal-lists.js";
import { mountClosedPage } from "./page-layout.js";
import { renderPage } from "./render.js";
import { els, state } from "./state.js";

function updateTopbar() {
  const p = state.currentPage;
  els.pageBtnValue.textContent = p;
  const surahNum = state.selectedAyah ? state.selectedAyah.surah : state.pageToSurah[p];
  const surahInfo = state.surahs[String(surahNum)];
  els.surahBtnNum.textContent = surahInfo ? `${surahNum}.` : `${surahNum}`;
  els.surahBtnArabic.textContent = surahInfo ? surahInfo.nameArabic : "";
  els.juzBtnValue.textContent = `${currentJuzNumber()}`;
  els.hizbBtnValue.textContent = `${currentHizbNumber()}`;
  els.rubBtnValue.textContent = `${currentRubNumber()}`;
  els.manzilBtnValue.textContent = `${currentManzilNumber()}`;
}

async function fetchHeaderGlyph(surahNumber) {
  if (state.headerCache.has(surahNumber)) return state.headerCache.get(surahNumber);
  const data = await loadJSON(`data/surah-headers/${surahNumber}.json`);
  state.headerCache.set(surahNumber, data);
  return data;
}

// Builds (or returns the cached) SVG for a page's CONTENT only -- no ayah
// selection baked in, on purpose. Selection is applied afterwards as a
// cheap overlay (see updateAyahHighlight) so tapping between ayahs/words on
// an already-visited page never re-runs the expensive HarfBuzz shape +
// justify + glyph-path pass, just moves a couple of <rect>s.
async function buildPage(pageNumber) {
  const cached = state.pageCache.get(pageNumber);
  if (cached) return cached;

  const lines = state.mushaf.pages[pageNumber - 1];

  // Headers need their real bbox up front -- the layout pass sizes each
  // header at full column width, so its height (and therefore where every
  // later line on the page lands) depends on that data.
  const surahsOnPage = [...new Set(lines.filter((l) => l.t === "s").map((l) => l.surah))];
  const headerDataBySurah = new Map();
  await Promise.all(
    surahsOnPage.map(async (surah) => {
      try {
        headerDataBySurah.set(surah, await fetchHeaderGlyph(surah));
      } catch (err) {
        console.warn(`Could not load header glyph for surah ${surah}`, err);
      }
    })
  );

  const { svg, totalHeight, segments, wordSegments, unitSegments, surahHeaderTopYs } = renderPage(state.lineRenderer, lines, headerDataBySurah, wordIdToAyah, isAltRuku);

  const entry = { svg, totalHeight, segments, wordSegments, unitSegments, surahHeaderTopYs };
  state.pageCache.set(pageNumber, entry);
  if (state.pageCache.size > 12) {
    const oldestKey = state.pageCache.keys().next().value;
    state.pageCache.delete(oldestKey);
  }
  return entry;
}

// Draws the ayah-selection highlight into `svg`'s (always-present, see
// render.js) ".ayah-highlight-layer" <g>, replacing whatever was there --
// one <rect> per (surah,ayah)-matching segment, since a selected ayah can
// span more than one line. `segments` are already in the svg's own
// coordinate space (see renderLineGroup), so no extra transform is needed.
function updateAyahHighlight(svg, segments, ayah) {
  const layer = svg.querySelector(".ayah-highlight-layer");
  if (!layer) return;
  layer.innerHTML = "";
  if (!ayah) return;

  const PAD = 90;
  for (const seg of segments) {
    if (seg.surah !== ayah.surah || seg.ayah !== ayah.ayah) continue;
    const rect = document.createElementNS(svg.namespaceURI, "rect");
    rect.setAttribute("class", "ayah-highlight");
    rect.setAttribute("x", seg.xMin - PAD);
    rect.setAttribute("y", seg.baselineY - 1350);
    rect.setAttribute("width", seg.xMax - seg.xMin + PAD * 2);
    rect.setAttribute("height", 1900);
    rect.setAttribute("rx", 140);
    layer.appendChild(rect);
  }
}

// Same idea as updateAyahHighlight, into the ".word-highlight-layer" <g>
// that sits just above it (see render.js's renderPage) -- but at most ONE
// rect, for whichever single word is currently sounding during recitation
// playback (see the rAF loop in playAyah). wordId null/not-on-this-page
// just clears it, same as ayah=null does for updateAyahHighlight.
function updateWordHighlight(svg, wordSegments, wordId) {
  const layer = svg.querySelector(".word-highlight-layer");
  if (!layer) return;
  layer.innerHTML = "";
  if (wordId == null) return;

  const PAD = 60;
  const seg = wordSegments.find((s) => s.wordId === wordId);
  if (!seg) return;
  const rect = document.createElementNS(svg.namespaceURI, "rect");
  rect.setAttribute("class", "word-highlight");
  rect.setAttribute("x", seg.xMin - PAD);
  rect.setAttribute("y", seg.baselineY - 1350);
  rect.setAttribute("width", seg.xMax - seg.xMin + PAD * 2);
  rect.setAttribute("height", 1900);
  rect.setAttribute("rx", 130);
  layer.appendChild(rect);
}

// Navigates to `pageNumber`. `opts.ayah` ({surah,ayah}), if given, is what
// gets highlighted; otherwise the page's own first ayah is selected (see
// the module doc comment above showPage's callers for the exact rules).
async function showPage(pageNumber, opts = {}) {
  // Ezber -> Oku/Yaz navigates the reader itself as it advances between
  // ayahs (see ezberStudyGoToAyah), setting expectedPage right before its
  // own showPage call so this line can tell "that was me" apart from the
  // person tapping prev/next, swiping, or jumping via a modal WHILE a
  // study session is running -- any of which should just cleanly end the
  // session rather than leave its cover rectangles stranded on a page
  // that's about to be replaced. Single guard here rather than teaching
  // every navigation entry point about Ezber individually, since they all
  // funnel through this one function.
  if (state.ezberStudy && pageNumber !== state.ezberStudy.expectedPage) {
    endEzberStudy();
  }

  pageNumber = Math.min(Math.max(1, pageNumber), state.mushaf.pagesCount);
  const ayah = opts.ayah || pageFirstAyah(pageNumber);
  state.currentPage = pageNumber;
  state.selectedAyah = ayah;
  // Any real navigation/reselection closes the word-meal panel -- it's
  // only ever meaningful for a specific ayah on the page it was opened
  // from (see onAyahTextClick, the one place that reopens it right after,
  // for a same-page tap on a previously-unselected ayah).
  state.wordMeal.open = false;
  state.wordMeal.ayah = null;
  state.wordMeal.cutY = null;
  state.wordMeal.tafsirActive = null;

  const { svg, totalHeight, segments, wordSegments, unitSegments, surahHeaderTopYs } = await buildPage(pageNumber);

  // if the user already navigated further while this was loading, don't
  // clobber the newer page with a stale one
  if (state.currentPage !== pageNumber || state.selectedAyah !== ayah) return;

  saveLastPosition(pageNumber, ayah);

  state.currentPageSvg = svg;
  state.currentPageSegments = segments;
  state.currentPageWordSegments = wordSegments;
  state.currentPageUnitSegments = unitSegments;
  state.currentPageSurahHeaderTopYs = surahHeaderTopYs;
  state.currentTotalHeight = totalHeight;
  // buildPage returns the SAME cached svg element on repeat visits (e.g.
  // re-selecting an ayah on the page already on screen) -- mountClosedPage
  // only touches the DOM when it isn't already showing exactly that svg.
  // Odak sayfa kapsayıcısının içindeyse (açık panelin düğmesi/kendisi) mountClosedPage onu DOM'dan
  // kaldırır ve odak <body>'ye düşerdi: önceden ölç, aşağıda gezgindeki seçili ayet düğmesine ver.
  const focusWasInPage = els.pageContainer.contains(document.activeElement);
  mountClosedPage(svg);
  updateAyahHighlight(svg, segments, ayah);
  // Always start a freshly-shown page with no word highlighted -- if
  // recitation playback is active, playAyah's own loop repaints the right
  // word right after this (see its "await showPage" call), same as how
  // updateAyahHighlight above isn't skipped just because a caller is about
  // to change the ayah again a moment later.
  updateWordHighlight(svg, wordSegments, null);
  updateTopbar();
  announceNavigation();
  syncAyahGridHighlight();
  syncAyahNav({ restoreFocus: focusWasInPage });

  if (!opts.skipHash) {
    history.replaceState(null, "", `#page=${pageNumber}`);
  }

  // opportunistically pre-render neighbours for instant nav
  requestIdleCallback ? requestIdleCallback(() => prefetchNeighbours(pageNumber)) : setTimeout(() => prefetchNeighbours(pageNumber), 50);
}

function prefetchNeighbours(pageNumber) {
  for (const p of [pageNumber - 1, pageNumber + 1]) {
    if (p >= 1 && p <= state.mushaf.pagesCount) {
      buildPage(p);
    }
  }
}

// Each of these picks the ayah that ends up highlighted on arrival:
//  - goToPage: no explicit ayah -> defaults to that page's own first ayah
//  - goToSurah: that surah's first ayah
//  - goToAyah: exactly the ayah given
//  - goToJuzNum/goToHizbNum/goToRubNum/goToManzilNum: that unit's first ayah
function goToPage(n) {
  showPage(n);
}
function goToSurah(surahNum) {
  const page = state.surahPages[String(surahNum)];
  if (page) showPage(page, { ayah: { surah: surahNum, ayah: 1 } });
}
function goToAyah(surahNum, ayahNum) {
  const page = ayahPage(surahNum, ayahNum);
  if (page) showPage(page, { ayah: { surah: surahNum, ayah: ayahNum } });
}
function goToUnitNum(map, n) {
  const info = map[String(n)];
  if (!info || !info.page) return;
  const [s, a] = (info.firstVerseKey || "1:1").split(":").map(Number);
  showPage(info.page, { ayah: { surah: s, ayah: a } });
}
function goToJuzNum(juzNum) { goToUnitNum(state.juz, juzNum); }
function goToHizbNum(n) { goToUnitNum(state.hizb, n); }
function goToRubNum(n) { goToUnitNum(state.rub, n); }
function goToManzilNum(n) { goToUnitNum(state.manzil, n); }

// Next/previous follow the real mushaf's own page-turn direction (opposite
// of a Latin book): swiping/pressing right advances (page number goes up),
// left goes back -- and it wraps around at the ends, so "next" from the
// last page (604) loops to page 1, and "previous" from page 1 loops to 604.
function goToNextPage() {
  const n = state.currentPage >= state.mushaf.pagesCount ? 1 : state.currentPage + 1;
  showPage(n);
}
function goToPrevPage() {
  const n = state.currentPage <= 1 ? state.mushaf.pagesCount : state.currentPage - 1;
  showPage(n);
}

function initialPageFromHash() {
  const m = location.hash.match(/page=(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

const LAST_POSITION_KEY = "mushaf:lastPosition";

// Son bakılan sayfa/ayet, sekme kapatılıp tekrar açıldığında da hatırlansın
// diye localStorage'a yazılır. Bu bir "olursa iyi olur" özelliğidir: yazma
// başarısız olursa (gizli/private sekme, depolama kapalı, kota dolu vb.)
// sessizce yok sayılır -- sayfa gezinmesini asla bozmaz.
function saveLastPosition(pageNumber, ayah) {
  try {
    localStorage.setItem(LAST_POSITION_KEY, JSON.stringify({ page: pageNumber, surah: ayah.surah, ayah: ayah.ayah }));
  } catch (err) {
    // depolama dolu/kapalı/gizli sekme -- konumu hatırlamak olmazsa da olur.
  }
}

function loadLastPosition() {
  try {
    const raw = localStorage.getItem(LAST_POSITION_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const page = parseInt(saved.page, 10);
    const surah = parseInt(saved.surah, 10);
    const ayah = parseInt(saved.ayah, 10);
    if (!Number.isInteger(page) || page < 1 || page > state.mushaf.pagesCount) return null;
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) return null;
    if (!Number.isInteger(ayah) || ayah < 1) return null;
    return { page, surah, ayah };
  } catch (err) {
    return null;
  }
}

// Uygulama ilk açıldığında nereden başlanacağına karar verir:
//  1) URL'de #page=N varsa (paylaşılan bir bağlantı gibi) her zaman ona
//     öncelik verilir,
//  2) yoksa localStorage'daki son kalınan sayfa/ayet kullanılır,
//  3) o da yoksa 1. sayfadan başlanır.
function getInitialPosition() {
  const hashPage = initialPageFromHash();
  if (hashPage !== null) return { page: hashPage };
  const saved = loadLastPosition();
  if (saved) return { page: saved.page, ayah: { surah: saved.surah, ayah: saved.ayah } };
  return { page: 1 };
}

export {
  updateWordHighlight,
  showPage,
  goToPage,
  goToSurah,
  goToAyah,
  goToJuzNum,
  goToHizbNum,
  goToRubNum,
  goToManzilNum,
  goToNextPage,
  goToPrevPage,
  initialPageFromHash,
  getInitialPosition,
};
