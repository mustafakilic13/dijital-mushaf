// app.js
import { LineRenderer, renderPage, PAGE_WIDTH, INTERLINE, splitIntoUnits } from "./render.js";
import {
  loadWordMealData,
  isWordMealDataReady,
  getCachedWordMealData,
  buildWordMealCards,
  renderWordMealCardsHTML,
} from "./wordmeal.js";
import { loadMealData, isMealDataReady, getCachedMealData, getMealText, renderMealHTML } from "./meal.js";
import {
  tafsirSourceIds,
  tafsirSourceLabel,
  isTafsirSourceAvailable,
  isTafsirDataReady,
  getCachedTafsirData,
  loadTafsirData,
  resolveTafsirText,
} from "./tafsir.js";
import {
  isSurahInfoDataReady,
  getCachedSurahInfoData,
  loadSurahInfoData,
  getSurahInfoEntry,
  splitInfoSections,
} from "./surahinfo.js";

const state = {
  lineRenderer: null,
  mushaf: null,
  surahs: null,
  surahPages: null,
  juz: null,
  hizb: null, // { "1": {firstVerseKey, page}, ... } x60 -- same shape as juz; see unitForAyah/goToUnitNum
  rub: null, // same shape x240 (rub'ul hizb -- quarter of a hizb)
  manzil: null, // same shape x7 -- NOT nested under juz (a manzil spans several juz, not the reverse), so it's kept as its own independent list, same as hizb/rub
  ayahs: null, // { "1": [[page,firstWordId,lastWordId], ...], ... } indexed by ayah-1
  pageFirstAyah: null, // { "1": [surah, ayah], ... }
  ruku: null, // { "1": [[startAyah, surahRukuNumber], ...], ... } -- ruku boundaries per surah, for alternating ayah-number colour
  recitationCache: {}, // RECITERS key -> { "1": [ [[wordPosInAyah,startMs,endMs], ...], ... ], ... } surah -> array indexed by ayah-1. Lazy-loaded per reciter on first use (see loadRecitationData).
  pageToSurah: [], // 1-indexed by page number
  pageToJuz: [],
  pageToHizb: [],
  pageToRub: [],
  pageToManzil: [],
  wordAyahIndex: [], // flat, wordId-sorted [{wordId,surah,ayah}, ...] for tap-to-select hit testing
  currentPage: 1,
  selectedAyah: null, // {surah, ayah} currently highlighted on the page
  currentPageSvg: null, // the <svg> currently mounted in #page-container -- kept alongside currentPageSegments so playback's per-frame word-highlight loop doesn't need to re-query the DOM
  currentPageSegments: [], // [{surah,ayah,baselineY,xMin,xMax}, ...] for the displayed page
  currentPageWordSegments: [], // same idea, one entry per WORD instead of per ayah-run: [{wordId,baselineY,xMin,xMax}, ...]
  currentPageUnitSegments: [], // same idea again, one entry per LETTER UNIT: [{wordId,unitIndex,baselineY,xMin,xMax}, ...] -- Ezber -> Yaz mode only (see render.js's splitIntoUnits)
  currentTotalHeight: 28900, // updated per-page once rendered; used to size the container
  pageCache: new Map(), // pageNumber -> {svg, totalHeight, segments, wordSegments}
  headerCache: new Map(), // surahNumber -> parsed header glyph JSON
  openModalEl: null,

  // Continuous "play from the selected ayah through the rest of the
  // Qur'an, word-highlighted, until stopped" (the besmele/play button --
  // see startPlayback/stopPlayback/playAyah). requestId is bumped on every
  // start/stop/advance-to-next-ayah, same guard pattern as
  // wordMeal.tafsirRequestId: each async step (showPage, loading a new
  // ayah's audio) checks it's still current before touching state/DOM, so
  // a stop (or a second rapid start) can't be clobbered by a stale
  // continuation that was already in flight.
  playback: {
    active: false,
    phase: "ayah", // "intro" (isti'adha/besmele, no highlighting) or "ayah" (the recited ayah itself, word-highlighted)
    surah: null,
    ayah: null,
    audio: null,
    lastWordId: null,
    rafId: null,
    requestId: 0,
    reciter: "husary", // RECITERS key; normal playback always husary, Ezber->Dinle can pick either
    ezber: null, // null = normal sequential playback; else the cumulative-repeat state machine's own state (see startEzberPlayback)
  },

  // The ayah detail panel (internal name kept as "wordMeal" -- it started
  // as just kelime meali; see openWordMeal/closeWordMeal/ayahPanelBodyHTML
  // for how meal, and later tefsir, joined the same panel). Only ever open
  // for an ayah on the CURRENTLY shown page; any real navigation closes it.
  wordMeal: {
    open: false,
    ayah: null, // {surah, ayah} the panel is currently showing, while open
    cutY: null, // svg-space Y (page coordinate system) where the page is split, while open
    panelEl: null, // the .word-meal-panel element, while open
    bodyEl: null, // its .word-meal-body content slot, while open
    topEl: null, // .page-slice--top wrapper, while open
    topSvg: null, // the page's real <svg> (moved into topEl), while open
    bottomOuterEl: null, // .page-slice--bottom wrapper, while open
    bottomInnerEl: null, // shifted-up inner wrapper that crops to the bottom slice, while open
    bottomSvg: null, // a *clone* of the page's <svg> (moved into bottomInnerEl), while open
    tafsirActive: null, // tafsir source id ("saadi", ...) currently shown in the Tefsir section, or null if collapsed
    tafsirRequestId: 0, // bumped on every tab click; guards onTafsirTabClick's delayed continuation against a rapid second click landing first
  },

  // Ezber -> Oku/Yaz's shared "study session" state -- null while neither
  // is running. Both modes step through the same surah/from/to range one
  // ayah at a time, revealing that ayah's units (words for Oku, letters
  // for Yaz) one at a time on interaction, then playing that ayah's audio
  // and moving on once every unit is revealed. See startEzberOku/
  // startEzberYaz further down for what populates this and
  // endEzberStudy for what tears it down.
  ezberStudy: null,
  // {
  //   mode: "oku" | "yaz",
  //   surah, from, to,        // the configured range (ayah numbers)
  //   currentAyah,            // ayah currently being revealed
  //   units,                  // this ayah's reveal targets, in order:
  //                           //   oku -> [{wordId}, ...] (one per real word)
  //                           //   yaz -> [{wordId, unitIndex, baseChar}, ...] (one per letter)
  //   revealedCount,          // how many leading `units` are revealed so far
  //   expectedPage,           // page showPage() is about to be told to show
  //                           // BY this session's own navigation -- lets
  //                           // showPage tell "I caused this" apart from
  //                           // the person navigating away manually (which
  //                           // ends the session -- see showPage's guard)
  // }
};

const els = {
  pageContainer: document.getElementById("page-container"),
  readerScroll: document.querySelector(".reader-scroll"),
  prevBtn: document.getElementById("prev-page"),
  nextBtn: document.getElementById("next-page"),
  loading: document.getElementById("loading"),

  juzBtn: document.getElementById("juz-btn"),
  juzBtnValue: document.getElementById("juz-btn-value"),
  hizbBtnValue: document.getElementById("hizb-btn-value"),
  rubBtnValue: document.getElementById("rub-btn-value"),
  manzilBtnValue: document.getElementById("manzil-btn-value"),
  pageBtn: document.getElementById("page-btn"),
  pageBtnValue: document.getElementById("page-btn-value"),
  pageBtnTotal: document.getElementById("page-btn-total"),
  surahBtn: document.getElementById("surah-btn"),
  surahBtnNum: document.getElementById("surah-btn-num"),
  surahBtnArabic: document.getElementById("surah-btn-arabic"),

  modalBackdrop: document.getElementById("modal-backdrop"),
  surahModal: document.getElementById("surah-modal"),
  surahList: document.getElementById("surah-list"),
  juzModal: document.getElementById("juz-modal"),
  juzTabs: document.getElementById("juz-modal").querySelector(".tab-bar"),
  juzList: document.getElementById("juz-list"),
  hizbList: document.getElementById("hizb-list"),
  rubList: document.getElementById("rub-list"),
  manzilList: document.getElementById("manzil-list"),
  pageModal: document.getElementById("page-modal"),
  pageJumpForm: document.getElementById("page-jump-form"),
  pageJumpInput: document.getElementById("page-jump-input"),
  pageJumpDec: document.getElementById("page-jump-dec"),
  pageJumpInc: document.getElementById("page-jump-inc"),
  pageJumpSlider: document.getElementById("page-jump-slider"),

  ezberModal: document.getElementById("ezber-modal"),
  ezberTabs: document.getElementById("ezber-tabs"),
  ezberDinleForm: document.getElementById("ezber-dinle-form"),
  ezberReciter: document.getElementById("ezber-reciter"),
  ezberRepeat: document.getElementById("ezber-repeat"),
  ezberRepeatAll: document.getElementById("ezber-repeat-all"),
  ezberOkuForm: document.getElementById("ezber-oku-form"),
  ezberYazForm: document.getElementById("ezber-yaz-form"),
  ezberSurahPicker: document.getElementById("ezber-surah-picker"),
  ezberSurahPickerList: document.getElementById("ezber-surah-picker-list"),
  ezberSurahPickerBack: document.getElementById("ezber-surah-picker-back"),

  ezberBtn: document.getElementById("ezber-btn"),
  bottombar: document.querySelector(".bottombar"),
  yazKeyboard: document.getElementById("yaz-keyboard"),
  yazHintText: document.getElementById("yaz-hint-text"),
  playBtn: document.getElementById("play-btn"),
  playBtnLabel: document.getElementById("play-btn-label"),
  aramaBtn: document.getElementById("arama-btn"),

  surahInfoModal: document.getElementById("surah-info-modal"),
  surahInfoTitle: document.getElementById("surah-info-modal-title"),
  surahInfoBody: document.getElementById("surah-info-body"),
};

// Sizes the page to fill the reader's available WIDTH ("Page Width" mode,
// like a PDF viewer, matching digitalkhatt.org) -- height follows from the
// CURRENT page's actual aspect ratio (pages vary: a surah header is drawn
// at full column width with its height following proportionally, plus 5
// lines of space before it and 3 after, so pages with headers are taller
// than plain ones). .reader-scroll handles the vertical scrolling for
// whatever that works out to, so on a short/landscape screen -- or a page
// with one or more headers -- the page reads at full width instead of
// being shrunk down to fit in one screenful.
//
// While the word-meal panel is open, #page-container instead holds THREE
// stacked children -- a cropped "top slice" of the page (down to the
// tapped ayah's last line), the HTML panel, and a cropped "bottom slice"
// (the rest of the page, a *clone* of the same svg shifted up so only its
// remainder shows) -- see openWordMeal. #page-container's own height is
// left automatic in that case (so it simply grows to fit the panel's
// content, pushing the bottom slice down); this function only ever sets
// pixel width/height on the svg(s)/slices themselves, computed from the
// container's own padding so the true 17000:currentTotalHeight page aspect
// ratio is kept exactly regardless of that padding.
function layoutPageContainer() {
  const scroller = els.readerScroll;
  if (!scroller) return;
  const scs = getComputedStyle(scroller);
  const scrollPadX = parseFloat(scs.paddingLeft || 0) + parseFloat(scs.paddingRight || 0);
  const outerW = Math.max(0, scroller.clientWidth - scrollPadX);
  if (outerW === 0) return;
  els.pageContainer.style.width = `${Math.floor(outerW)}px`;

  const pcs = getComputedStyle(els.pageContainer);
  const containerPadX = parseFloat(pcs.paddingLeft || 0) + parseFloat(pcs.paddingRight || 0);
  const contentW = Math.max(0, outerW - containerPadX);
  const contentH = (contentW * state.currentTotalHeight) / PAGE_WIDTH;

  if (!state.wordMeal.open) {
    const svg = els.pageContainer.firstElementChild;
    if (svg && svg.classList && svg.classList.contains("mushaf-page-svg")) {
      svg.style.width = `${contentW}px`;
      svg.style.height = `${contentH}px`;
    }
    return;
  }

  const wm = state.wordMeal;
  if (!wm.topSvg || !wm.bottomSvg || !wm.topEl || !wm.bottomOuterEl || !wm.bottomInnerEl || wm.cutY == null) return;
  const cutYpx = (wm.cutY * contentW) / PAGE_WIDTH;

  wm.topSvg.style.width = `${contentW}px`;
  wm.topSvg.style.height = `${contentH}px`;
  wm.topEl.style.height = `${cutYpx}px`;

  wm.bottomSvg.style.width = `${contentW}px`;
  wm.bottomSvg.style.height = `${contentH}px`;
  wm.bottomInnerEl.style.height = `${contentH}px`;
  wm.bottomInnerEl.style.marginTop = `-${cutYpx}px`;
  wm.bottomOuterEl.style.height = `${Math.max(0, contentH - cutYpx)}px`;
}

// Puts `svg` (a page's canonical, cached <svg>) back as #page-container's
// only child -- tearing down the word-meal panel's top/bottom slice split
// if it was showing -- and (re)applies sizing. Used both for normal page
// display (showPage) and once the panel's close animation finishes.
function mountClosedPage(svg) {
  if (els.pageContainer.firstElementChild !== svg || els.pageContainer.children.length !== 1) {
    els.pageContainer.innerHTML = "";
    els.pageContainer.appendChild(svg);
  }
  state.wordMeal.panelEl = null;
  state.wordMeal.bodyEl = null;
  state.wordMeal.topEl = null;
  state.wordMeal.topSvg = null;
  state.wordMeal.bottomOuterEl = null;
  state.wordMeal.bottomInnerEl = null;
  state.wordMeal.bottomSvg = null;
  layoutPageContainer();
}

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

async function loadHarfBuzzAndFont() {
  const instance = await window.createHarfBuzz();
  const hb = window.hbjs(instance);

  // Font WOFF2 olarak servis ediliyor (ham OTF'e göre ~%86 daha küçük --
  // bkz. vendor/woff2-decompress/), çünkü CSS'teki @font-face bunu
  // tarayıcının kendi motoruyla native çözüyor. HarfBuzz ise WOFF2
  // kapsayıcısını anlamaz, sadece ham sfnt byte'ları kabul eder; bu yüzden
  // burada aynı dosyayı tarayıcıda tekrar OTF'e açıp öyle veriyoruz. Bu
  // dönüşüm kayıpsızdır (WOFF2 aynı tablo verisinin sadece sıkıştırılmış
  // hali olduğu için sonuç, orijinal OTF ile birebir aynı sfnt tablolarını
  // üretir).
  const fontResp = await fetch("fonts/DigitalKhattV2.woff2");
  const compressed = new Uint8Array(await fontResp.arrayBuffer());
  const fontBuf = await window.woff2Decompress(compressed);
  const blob = hb.createBlob(fontBuf);
  const face = hb.createFace(blob, 0);
  const font = hb.createFont(face);

  // natural space glyph width, used as the un-stretched baseline
  const buf = hb.createBuffer();
  buf.addText(" ");
  buf.setDirection("rtl");
  buf.setScript("Arab");
  buf.setLanguage("ar");
  hb.shape(font, buf, "");
  const spaceWidth = buf.json()[0].ax;
  buf.destroy();

  return { hb, font, spaceWidth };
}

// Fills a 1-indexed (index 0 unused) array of length pagesCount+1 where
// arr[page] = which unit (1..count) that page falls in, by walking each
// unit's own starting page forward. Shared by juz/hizb/rub/manzil, which
// all share the exact same { "n": {firstVerseKey, page} } shape.
function buildPageToUnitArray(map, count, pagesCount) {
  const arr = new Array(pagesCount + 1).fill(1);
  for (let n = 1; n <= count; n++) {
    const startPage = map[String(n)] && map[String(n)].page;
    if (!startPage) continue;
    for (let p = startPage; p <= pagesCount; p++) arr[p] = n;
  }
  return arr;
}

function buildPageLookups() {
  const pagesCount = state.mushaf.pagesCount;
  state.pageToSurah = new Array(pagesCount + 1).fill(1);

  for (let s = 1; s <= 114; s++) {
    const startPage = state.surahPages[String(s)];
    if (!startPage) continue;
    for (let p = startPage; p <= pagesCount; p++) state.pageToSurah[p] = s;
  }
  state.pageToJuz = buildPageToUnitArray(state.juz, 30, pagesCount);
  state.pageToHizb = buildPageToUnitArray(state.hizb, 60, pagesCount);
  state.pageToRub = buildPageToUnitArray(state.rub, 240, pagesCount);
  state.pageToManzil = buildPageToUnitArray(state.manzil, 7, pagesCount);

  // flatten data.ayahs (per-surah arrays) into one wordId-sorted list, so a
  // click anywhere on the page can be mapped back to "which ayah is this
  // word part of" with a binary search -- naturally sorted by construction
  // since both surah order (1..114) and ayah order within a surah, and
  // therefore word id, all increase monotonically together.
  const flat = [];
  for (let s = 1; s <= 114; s++) {
    const list = state.ayahs[String(s)];
    if (!list) continue;
    for (let a = 0; a < list.length; a++) {
      flat.push({ wordId: list[a][1], surah: s, ayah: a + 1 });
    }
  }
  state.wordAyahIndex = flat;
}

// data/juz.json (and hizb/rub/manzil.json, same shape) only maps each unit
// to its starting PAGE, but a mushaf page can itself straddle two units (a
// juz/hizb/rub/manzil doesn't always begin exactly at the top line of a
// page) -- so "which unit is this PAGE in" and "which unit is this AYAH in"
// can disagree right at a boundary. This resolves it from the ayah itself,
// walking unit 1..count's firstVerseKey (which increases monotonically
// through the Qur'an for all four) and stopping at the last one that starts
// at or before {surah,ayah}.
function unitForAyah(map, count, surah, ayah) {
  let result = 1;
  for (let n = 1; n <= count; n++) {
    const info = map[String(n)];
    if (!info || !info.firstVerseKey) continue;
    const [s, a] = info.firstVerseKey.split(":").map(Number);
    if (s < surah || (s === surah && a <= ayah)) {
      result = n;
    } else {
      break;
    }
  }
  return result;
}
function juzForAyah(surah, ayah) { return unitForAyah(state.juz, 30, surah, ayah); }
function hizbForAyah(surah, ayah) { return unitForAyah(state.hizb, 60, surah, ayah); }
function rubForAyah(surah, ayah) { return unitForAyah(state.rub, 240, surah, ayah); }
function manzilForAyah(surah, ayah) { return unitForAyah(state.manzil, 7, surah, ayah); }

// Single source of truth for "which juz/hizb/rub/menzil is currently being
// read", used by both the topbar's indicators and the Cüz modal's opening
// highlight so they always agree: the SELECTED ayah's unit when there is
// one, falling back to the page's unit only before any ayah has been
// selected yet.
function currentUnitNumber(unitForAyahFn, pageToUnitArr) {
  if (state.selectedAyah) return unitForAyahFn(state.selectedAyah.surah, state.selectedAyah.ayah);
  return pageToUnitArr[state.currentPage];
}
function currentJuzNumber() { return currentUnitNumber(juzForAyah, state.pageToJuz); }
function currentHizbNumber() { return currentUnitNumber(hizbForAyah, state.pageToHizb); }
function currentRubNumber() { return currentUnitNumber(rubForAyah, state.pageToRub); }
function currentManzilNumber() { return currentUnitNumber(manzilForAyah, state.pageToManzil); }

// {surah,ayah} the given global word id belongs to, or null.
function wordIdToAyah(wordId) {
  const flat = state.wordAyahIndex;
  let lo = 0;
  let hi = flat.length - 1;
  let ans = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (flat[mid].wordId <= wordId) {
      ans = flat[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans ? { surah: ans.surah, ayah: ans.ayah } : null;
}

function surahLabel(surahNumber) {
  const info = state.surahs[String(surahNumber)];
  return info ? `${surahNumber}. ${info.nameArabic}` : `${surahNumber}`;
}

// [page, firstWordId, lastWordId] for a given ayah, or null if unknown.
function ayahBounds(surah, ayah) {
  const list = state.ayahs[String(surah)];
  return list ? list[ayah - 1] || null : null;
}
function ayahWordRange(surah, ayah) {
  const b = ayahBounds(surah, ayah);
  return b ? { firstWordId: b[1], lastWordId: b[2] } : null;
}
function ayahPage(surah, ayah) {
  const b = ayahBounds(surah, ayah);
  return b ? b[0] : null;
}
function pageFirstAyah(pageNumber) {
  const a = state.pageFirstAyah[String(pageNumber)];
  return a ? { surah: a[0], ayah: a[1] } : { surah: state.pageToSurah[pageNumber] || 1, ayah: 1 };
}

// Whether `ayah`'s ruku (within `surah`) should get the alternate ayah-number
// colour: the 1st, 3rd, 5th... ruku of a surah keeps the normal ink colour,
// the 2nd, 4th, 6th... gets the alternate -- see data/ruku.json (built from
// quran-metadata-ruku.json), a per-surah list of [startAyah, surahRukuNumber]
// pairs marking where each new ruku begins.
function isAltRuku(surah, ayah) {
  const boundaries = state.ruku && state.ruku[String(surah)];
  if (!boundaries || !boundaries.length) return false;
  // boundaries are sorted by startAyah -- find the last one whose startAyah
  // is <= ayah (binary search since some surahs have 40+ rukus)
  let lo = 0;
  let hi = boundaries.length - 1;
  let rukuNumber = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (boundaries[mid][0] <= ayah) {
      rukuNumber = boundaries[mid][1];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return rukuNumber % 2 === 0;
}

function populateSurahList() {
  const frag = document.createDocumentFragment();
  for (let i = 1; i <= 114; i++) {
    const info = state.surahs[String(i)];

    const wrapper = document.createElement("div");
    wrapper.className = "surah-row-wrapper";

    const row = document.createElement("div");
    row.className = "surah-row";

    const btn = document.createElement("button");
    btn.className = "modal-item";
    btn.type = "button";
    btn.dataset.page = state.surahPages[String(i)];
    btn.dataset.surah = i;
    btn.innerHTML = `
      <span class="modal-item-num">${i}</span>
      <span class="modal-item-main">
        <span class="modal-item-arabic">${info.nameArabic}</span>
        <span class="modal-item-sub">${info.nameTurkish} · ${info.versesCount} ayet</span>
      </span>`;

    const expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className = "surah-expand-btn";
    expandBtn.dataset.surah = i;
    expandBtn.setAttribute("aria-label", `${info.nameTurkish} ayetlerini listele`);
    expandBtn.setAttribute("aria-expanded", "false");
    expandBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    row.appendChild(btn);
    row.appendChild(expandBtn);

    const ayahGrid = document.createElement("div");
    ayahGrid.className = "ayah-grid";
    ayahGrid.dataset.surah = i;
    ayahGrid.hidden = true;

    wrapper.appendChild(row);
    wrapper.appendChild(ayahGrid);
    frag.appendChild(wrapper);
  }
  els.surahList.appendChild(frag);
}

// Lazily builds (first time only) and toggles the ayah-number grid under a
// surah row, so opening the Sure modal doesn't have to create thousands of
// ayah buttons for all 114 surahs up front. Accordion behaviour: opening
// one closes whichever other surah's grid was open.
function toggleAyahGrid(surahNum, gridEl, expandBtn) {
  const isOpen = !gridEl.hidden;
  if (isOpen) {
    gridEl.hidden = true;
    expandBtn.classList.remove("open");
    expandBtn.setAttribute("aria-expanded", "false");
    return;
  }

  closeAllAyahGrids();

  if (!gridEl.dataset.built) {
    const versesCount = state.surahs[String(surahNum)].versesCount;
    const frag = document.createDocumentFragment();
    for (let a = 1; a <= versesCount; a++) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ayah-chip";
      chip.textContent = a;
      chip.dataset.surah = surahNum;
      chip.dataset.ayah = a;
      frag.appendChild(chip);
    }
    gridEl.appendChild(frag);
    gridEl.dataset.built = "1";
  }
  gridEl.hidden = false;
  expandBtn.classList.add("open");
  expandBtn.setAttribute("aria-expanded", "true");
  if (state.selectedAyah && state.selectedAyah.surah === surahNum) {
    setActiveAyahChip(gridEl, state.selectedAyah.ayah);
  }
  if (expandBtn.scrollIntoView) expandBtn.scrollIntoView({ block: "nearest" });
}

function closeAllAyahGrids() {
  els.surahList.querySelectorAll(".ayah-grid").forEach((g) => {
    g.hidden = true;
  });
  els.surahList.querySelectorAll(".surah-expand-btn.open").forEach((b) => {
    b.classList.remove("open");
    b.setAttribute("aria-expanded", "false");
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function setActiveAyahChip(gridEl, ayahNum) {
  gridEl.querySelectorAll(".ayah-chip").forEach((chip) => {
    chip.classList.toggle("active", parseInt(chip.dataset.ayah, 10) === ayahNum);
  });
  const active = gridEl.querySelector(".ayah-chip.active");
  if (active && active.scrollIntoView) active.scrollIntoView({ block: "center" });
}

// Keeps every already-built ayah grid in the Sure modal in sync with
// state.selectedAyah -- so selecting an ayah some other way (tapping it
// directly on the page, or via the Cüz/Sayfa modals) is reflected there
// immediately, not just the next time that grid happens to be opened.
function syncAyahGridHighlight() {
  if (!state.selectedAyah) return;
  els.surahList.querySelectorAll(".ayah-grid[data-built]").forEach((gridEl) => {
    const surahNum = parseInt(gridEl.dataset.surah, 10);
    if (surahNum === state.selectedAyah.surah) {
      setActiveAyahChip(gridEl, state.selectedAyah.ayah);
    } else {
      gridEl.querySelectorAll(".ayah-chip.active").forEach((c) => c.classList.remove("active"));
    }
  });
}

// Shared by the Cüz modal's flat cüz list AND its Hizb/Rub/Menzil accordion
// lists -- all four datasets share the exact same
// { "n": {firstVerseKey, page} } shape and the exact same "number + starting
// surah + sayfa" row format, so one function builds all of them.
// datasetAttr is the dataset property used both for navigation (read back
// in the click handler) and for setActiveModalItem's row highlighting,
// e.g. "juz" -> item.dataset.juz / data-juz="n".
function populateUnitList(listEl, map, count, datasetAttr) {
  const frag = document.createDocumentFragment();
  for (let n = 1; n <= count; n++) {
    const info = map[String(n)];
    const page = info ? info.page : null;
    const [surahNum, ayahNum] = (info && info.firstVerseKey ? info.firstVerseKey : "1:1").split(":");
    const btn = document.createElement("button");
    btn.className = "modal-item";
    btn.type = "button";
    btn.dataset.page = page || 1;
    btn.dataset[datasetAttr] = n;
    btn.innerHTML = `
      <span class="modal-item-num">${n}</span>
      <span class="modal-item-main">
        <span class="modal-item-arabic">${surahLabel(surahNum).replace(/^\d+\.\s*/, "")}</span>
        <span class="modal-item-sub">${surahNum}:${ayahNum}'den başlar · sayfa ${page ?? "?"}</span>
      </span>`;
    frag.appendChild(btn);
  }
  listEl.appendChild(frag);
}
function populateJuzList() {
  populateUnitList(els.juzList, state.juz, 30, "juz");
}

// Cüz modalının Cüz/Hizb/Rub/Menzil sekmeleri arasında geçiş -- aynı anda
// tam olarak bir panel (.modal-list) görünür, seçili sekme
// aria-selected="true" alır. Modal her kapandığında "juz"a sıfırlanır
// (bkz. closeModal).
//
// setActiveModalItem, modal her açıldığında (openModal'ın onOpen'ı) dört
// panelin de vurgusunu birden ayarlıyor -- ama o an sadece "juz" görünür,
// diğer üçü hidden'dır; hidden bir elemanda scrollIntoView hiçbir şey
// yapmıyor (layout'a girmediği için ölçülecek bir konum yok), yani hizb/
// rub/menzil listelerindeki vurgulu satırın kendiliğinden ortalı gelmesi
// gerektiği varsayımı hiç doğru olmuyordu. Panel gerçekten görünür hale
// geldiği an (aşağıdaki hidden=false satırından hemen sonra, ki panelde
// hiç geçiş animasyonu da yok) burada tekrar scrollIntoView çağırmak bunu
// düzeltiyor: sekmeye her tıklandığında o listenin vurgulu satırı görünür
// alanın ortasına gelir.
const JUZ_TABS = ["juz", "hizb", "rub", "manzil"];
function switchJuzTab(tabName) {
  for (const name of JUZ_TABS) {
    const tabBtn = document.getElementById(`juz-tab-${name}`);
    const panel = els[`${name}List`];
    const active = name === tabName;
    if (tabBtn) tabBtn.setAttribute("aria-selected", active ? "true" : "false");
    if (panel) panel.hidden = !active;
  }
  const shownPanel = els[`${tabName}List`];
  const activeItem = shownPanel && shownPanel.querySelector(".modal-item.active");
  if (activeItem && activeItem.scrollIntoView) activeItem.scrollIntoView({ block: "center" });
}

function setActiveModalItem(listEl, matchAttr, value) {
  listEl.querySelectorAll(".modal-item").forEach((item) => {
    item.classList.toggle("active", item.dataset[matchAttr] === String(value));
  });
  const active = listEl.querySelector(".modal-item.active");
  if (active && active.scrollIntoView) active.scrollIntoView({ block: "center" });
}

function openModal(modalEl, { onOpen } = {}) {
  closeAllModals();
  state.openModalEl = modalEl;
  els.modalBackdrop.hidden = false;
  modalEl.hidden = false;
  // next frame, so the hidden->visible change doesn't get collapsed into
  // the transform transition (no "from" state to animate from otherwise)
  requestAnimationFrame(() => {
    els.modalBackdrop.classList.add("open");
    modalEl.classList.add("open");
  });
  if (onOpen) onOpen();
}

function closeModal(modalEl) {
  if (!modalEl || modalEl.hidden) return;
  modalEl.classList.remove("open");
  els.modalBackdrop.classList.remove("open");

  // Reset any per-modal transient state so it isn't still showing the next
  // time the modal reopens -- generic so it applies no matter which path
  // closed the modal (backdrop, X, Escape, or picking an item, all of
  // which funnel through here).
  closeAllAyahGrids(); // Sure modalindeki açık ayet ızgaraları
  if (modalEl === els.juzModal) switchJuzTab("juz"); // Cüz modalı hep "Cüz" sekmesinde açılsın
  if (modalEl === els.ezberModal) {
    switchEzberTab("dinle"); // Ezber modalı hep Dinle sekmesinde açılsın
    closeEzberSurahPicker(); // ... ve sure seçici listesi değil, ilgili formu göstersin
  }

  // wait for the slide/fade transition to actually finish before hiding,
  // with a fallback in case transitionend doesn't fire (reduced-motion,
  // already mid-transition, etc.)
  const finish = () => {
    modalEl.hidden = true;
    if (!els.modalBackdrop.classList.contains("open")) els.modalBackdrop.hidden = true;
  };
  let done = false;
  const onEnd = (e) => {
    if (e.target !== modalEl) return;
    done = true;
    modalEl.removeEventListener("transitionend", onEnd);
    finish();
  };
  modalEl.addEventListener("transitionend", onEnd);
  setTimeout(() => {
    if (!done) {
      modalEl.removeEventListener("transitionend", onEnd);
      finish();
    }
  }, 320);
  if (state.openModalEl === modalEl) state.openModalEl = null;
}

function closeAllModals() {
  [els.surahModal, els.juzModal, els.pageModal, els.ezberModal, els.surahInfoModal].forEach(closeModal);
}

function setupModals() {
  populateSurahList();
  populateJuzList();
  populateUnitList(els.hizbList, state.hizb, 60, "hizb");
  populateUnitList(els.rubList, state.rub, 240, "rub");
  populateUnitList(els.manzilList, state.manzil, 7, "manzil");

  els.surahBtn.addEventListener("click", () => {
    openModal(els.surahModal, {
      onOpen: () => {
        const activeSurah = state.selectedAyah ? state.selectedAyah.surah : state.pageToSurah[state.currentPage];
        setActiveModalItem(els.surahList, "surah", activeSurah);
      },
    });
  });
  els.juzBtn.addEventListener("click", () => {
    openModal(els.juzModal, {
      onOpen: () => {
        // All 4 panels' active row is highlighted unconditionally, even the
        // 3 currently-hidden ones -- cheap (just DOM class toggling; the
        // scrollIntoView it does is a harmless no-op while hidden), and
        // whichever tab the user switches to already shows the right row.
        setActiveModalItem(els.juzList, "juz", currentJuzNumber());
        setActiveModalItem(els.hizbList, "hizb", currentHizbNumber());
        setActiveModalItem(els.rubList, "rub", currentRubNumber());
        setActiveModalItem(els.manzilList, "manzil", currentManzilNumber());
      },
    });
  });
  els.pageBtn.addEventListener("click", () => {
    els.pageJumpInput.value = state.currentPage;
    els.pageJumpSlider.value = state.currentPage;
    openModal(els.pageModal);
  });

  els.surahList.addEventListener("click", (e) => {
    const chip = e.target.closest(".ayah-chip");
    if (chip) {
      goToAyah(parseInt(chip.dataset.surah, 10), parseInt(chip.dataset.ayah, 10));
      closeModal(els.surahModal);
      return;
    }
    const expandBtn = e.target.closest(".surah-expand-btn");
    if (expandBtn) {
      const grid = expandBtn.closest(".surah-row-wrapper").querySelector(".ayah-grid");
      toggleAyahGrid(parseInt(expandBtn.dataset.surah, 10), grid, expandBtn);
      return;
    }
    const item = e.target.closest(".modal-item");
    if (item) {
      goToSurah(parseInt(item.dataset.surah, 10));
      closeModal(els.surahModal);
    }
  });
  els.juzList.addEventListener("click", (e) => {
    const item = e.target.closest(".modal-item");
    if (!item) return;
    goToJuzNum(parseInt(item.dataset.juz, 10));
    closeModal(els.juzModal);
  });
  els.hizbList.addEventListener("click", (e) => {
    const item = e.target.closest(".modal-item");
    if (!item) return;
    goToHizbNum(parseInt(item.dataset.hizb, 10));
    closeModal(els.juzModal);
  });
  els.rubList.addEventListener("click", (e) => {
    const item = e.target.closest(".modal-item");
    if (!item) return;
    goToRubNum(parseInt(item.dataset.rub, 10));
    closeModal(els.juzModal);
  });
  els.manzilList.addEventListener("click", (e) => {
    const item = e.target.closest(".modal-item");
    if (!item) return;
    goToManzilNum(parseInt(item.dataset.manzil, 10));
    closeModal(els.juzModal);
  });

  els.juzTabs.addEventListener("click", (e) => {
    const tabBtn = e.target.closest(".tab-bar-btn");
    if (tabBtn) switchJuzTab(tabBtn.dataset.tab);
  });

  els.pageJumpForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const n = parseInt(els.pageJumpInput.value, 10);
    if (!isNaN(n)) {
      goToPage(n);
      closeModal(els.pageModal);
    }
  });
  els.pageJumpDec.addEventListener("click", () => {
    els.pageJumpInput.value = Math.max(1, (parseInt(els.pageJumpInput.value, 10) || 1) - 1);
  });
  els.pageJumpInc.addEventListener("click", () => {
    els.pageJumpInput.value = Math.min(state.mushaf.pagesCount, (parseInt(els.pageJumpInput.value, 10) || 1) + 1);
  });
  els.pageJumpSlider.addEventListener("input", () => {
    els.pageJumpInput.value = els.pageJumpSlider.value;
  });

  els.modalBackdrop.addEventListener("click", closeAllModals);
  document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", closeAllModals));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (state.openModalEl) closeAllModals();
    else if (state.wordMeal.open) closeWordMeal();
  });
}

// ---------------------------------------------------------------------
// Ezber modal: Dinle / Oku / Yaz. All three share the same Sure picker
// (see openEzberSurahPicker) and the same "auto-fill from/to with that
// surah's first ayah on pick" behaviour (this message's 2nd request).
// Oku/Yaz's actual reveal-as-you-go study sessions are further down (see
// startEzberOku/startEzberYaz) -- this block is just their modal/settings
// plumbing, same shape as Dinle's.
// ---------------------------------------------------------------------
const EZBER_TABS = ["dinle", "oku", "yaz"];
function switchEzberTab(tabName) {
  for (const name of EZBER_TABS) {
    const tabBtn = document.getElementById(`ezber-tab-${name}`);
    const panel = document.getElementById(`ezber-panel-${name}`);
    const active = name === tabName;
    if (tabBtn) tabBtn.setAttribute("aria-selected", active ? "true" : "false");
    if (panel) panel.hidden = !active;
  }
}

// Remembers each tab's last-used settings (range, repeat counts, reciter)
// across sessions so reopening Ezber doesn't mean re-entering the same
// range every time -- eski-uygulama reset its form on every tab switch
// instead; persisting this is a deliberate improvement, not a port of
// that behaviour.
const EZBER_SETTINGS_KEY = "quran-reader-ezber-v1";
function loadEzberSettings() {
  try {
    const raw = localStorage.getItem(EZBER_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveEzberSettings(tabName, settings) {
  try {
    const all = loadEzberSettings();
    all[tabName] = settings;
    localStorage.setItem(EZBER_SETTINGS_KEY, JSON.stringify(all));
  } catch {
    // Private browsing / quota / disabled storage -- settings just won't
    // be remembered next time; not worth failing the whole action over.
  }
}

// Sets a tab's Sure field (hidden input + visible button label) and,
// unless told not to, resets its From/To to that surah's own 1st ayah
// (this message's 1st request) -- every caller of this wants that except
// the initial prefill from a saved/previous session, which already has
// its own remembered range to restore instead.
function setEzberSurah(target, surahNum, { autofillRange = false } = {}) {
  const info = state.surahs[String(surahNum)];
  document.getElementById(`ezber-${target}-surah`).value = surahNum;
  document.getElementById(`ezber-${target}-surah-btn-text`).textContent = `${surahNum}. ${info.nameTurkish}`;
  if (autofillRange) {
    const fromEl = document.getElementById(`ezber-${target}-from`);
    const toEl = document.getElementById(`ezber-${target}-to`);
    fromEl.value = 1;
    toEl.value = info.versesCount;
    fromEl.setCustomValidity("");
    toEl.setCustomValidity("");
  }
}

function populateEzberSurahPickerList() {
  const frag = document.createDocumentFragment();
  for (let i = 1; i <= 114; i++) {
    const info = state.surahs[String(i)];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "modal-item";
    btn.dataset.surah = i;
    btn.innerHTML = `
      <span class="modal-item-num">${i}</span>
      <span class="modal-item-main">
        <span class="modal-item-arabic">${info.nameArabic}</span>
        <span class="modal-item-sub">${info.nameTurkish} · ${info.versesCount} ayet</span>
      </span>`;
    frag.appendChild(btn);
  }
  els.ezberSurahPickerList.appendChild(frag);
}

// Which tab's Sure field the picker is currently open for -- null while
// closed. One shared picker/list (114 rows) rather than one per tab.
let ezberSurahPickerTarget = null;

function openEzberSurahPicker(target) {
  ezberSurahPickerTarget = target;
  const current = parseInt(document.getElementById(`ezber-${target}-surah`).value, 10);
  setActiveModalItem(els.ezberSurahPickerList, "surah", current);
  els.ezberTabs.hidden = true;
  document.getElementById(`ezber-panel-${target}`).hidden = true;
  els.ezberSurahPicker.hidden = false;
}
function closeEzberSurahPicker() {
  els.ezberSurahPicker.hidden = true;
  els.ezberTabs.hidden = false;
  if (ezberSurahPickerTarget) document.getElementById(`ezber-panel-${ezberSurahPickerTarget}`).hidden = false;
  ezberSurahPickerTarget = null;
}

function populateEzberReciterSelect() {
  els.ezberReciter.innerHTML = Object.entries(RECITERS)
    .map(([key, r]) => `<option value="${key}">${r.label}</option>`)
    .join("");
}

// Validates a tab's From/To pair against the selected surah's ayah count;
// returns {surah,from,to} on success or null (and reports the error on
// the `to` field, matching the browser's own validation-bubble style --
// see the Dinle submit handler this was factored out of) on failure.
function readEzberRange(target, formEl) {
  const surah = parseInt(document.getElementById(`ezber-${target}-surah`).value, 10);
  const fromEl = document.getElementById(`ezber-${target}-from`);
  const toEl = document.getElementById(`ezber-${target}-to`);
  const from = parseInt(fromEl.value, 10);
  const to = parseInt(toEl.value, 10);
  const versesCount = (state.surahs[String(surah)] || {}).versesCount;

  toEl.setCustomValidity("");
  if (from > to) {
    toEl.setCustomValidity("Bitiş ayeti, başlangıç ayetinden küçük olamaz.");
  } else if (versesCount && (from < 1 || to > versesCount)) {
    toEl.setCustomValidity(`Bu sure ${versesCount} ayetten oluşuyor.`);
  }
  if (!formEl.reportValidity()) return null;
  return { surah, from, to };
}

function setupEzberModal() {
  populateEzberReciterSelect();
  populateEzberSurahPickerList();

  els.ezberBtn.addEventListener("click", () => {
    if (state.ezberStudy) {
      endEzberStudy();
      return;
    }
    openModal(els.ezberModal, {
      onOpen: () => {
        const saved = loadEzberSettings();
        const fallbackSurah = state.selectedAyah ? state.selectedAyah.surah : state.pageToSurah[state.currentPage];
        const fallbackAyah = state.selectedAyah ? state.selectedAyah.ayah : 1;

        const d = saved.dinle;
        els.ezberReciter.value = d && RECITERS[d.reciter] ? d.reciter : "husary";
        setEzberSurah("dinle", d ? d.surah : fallbackSurah);
        document.getElementById("ezber-dinle-from").value = d ? d.from : fallbackAyah;
        document.getElementById("ezber-dinle-to").value = d ? d.to : fallbackAyah;
        els.ezberRepeat.value = d ? d.repeat : 1;
        els.ezberRepeatAll.value = d ? d.repeatAll : 1;

        const o = saved.oku;
        setEzberSurah("oku", o ? o.surah : fallbackSurah);
        document.getElementById("ezber-oku-from").value = o ? o.from : fallbackAyah;
        document.getElementById("ezber-oku-to").value = o ? o.to : fallbackAyah;

        const y = saved.yaz;
        setEzberSurah("yaz", y ? y.surah : fallbackSurah);
        document.getElementById("ezber-yaz-from").value = y ? y.from : fallbackAyah;
        document.getElementById("ezber-yaz-to").value = y ? y.to : fallbackAyah;
      },
    });
  });

  els.ezberTabs.addEventListener("click", (e) => {
    const tabBtn = e.target.closest(".tab-bar-btn");
    if (tabBtn) switchEzberTab(tabBtn.dataset.tab);
  });

  for (const target of EZBER_TABS) {
    document.getElementById(`ezber-${target}-surah-btn`).addEventListener("click", () => openEzberSurahPicker(target));
  }
  els.ezberSurahPickerBack.addEventListener("click", closeEzberSurahPicker);
  els.ezberSurahPickerList.addEventListener("click", (e) => {
    const item = e.target.closest(".modal-item");
    if (!item || !ezberSurahPickerTarget) return;
    setEzberSurah(ezberSurahPickerTarget, parseInt(item.dataset.surah, 10), { autofillRange: true });
    closeEzberSurahPicker();
  });

  els.ezberDinleForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const range = readEzberRange("dinle", els.ezberDinleForm);
    if (!range) return;
    const reciter = els.ezberReciter.value;
    const repeat = Math.max(1, parseInt(els.ezberRepeat.value, 10) || 1);
    const repeatAll = Math.max(1, parseInt(els.ezberRepeatAll.value, 10) || 1);

    saveEzberSettings("dinle", { reciter, ...range, repeat, repeatAll });
    closeModal(els.ezberModal);
    startEzberPlayback(reciter, range.surah, range.from, range.to, repeat, repeatAll);
  });

  els.ezberOkuForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const range = readEzberRange("oku", els.ezberOkuForm);
    if (!range) return;
    saveEzberSettings("oku", range);
    closeModal(els.ezberModal);
    startEzberOku(range.surah, range.from, range.to);
  });

  els.ezberYazForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const range = readEzberRange("yaz", els.ezberYazForm);
    if (!range) return;
    saveEzberSettings("yaz", range);
    closeModal(els.ezberModal);
    startEzberYaz(range.surah, range.from, range.to);
  });
}

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

  const { svg, totalHeight, segments, wordSegments, unitSegments } = renderPage(state.lineRenderer, lines, headerDataBySurah, wordIdToAyah, isAltRuku);

  const entry = { svg, totalHeight, segments, wordSegments, unitSegments };
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

  const { svg, totalHeight, segments, wordSegments, unitSegments } = await buildPage(pageNumber);

  // if the user already navigated further while this was loading, don't
  // clobber the newer page with a stale one
  if (state.currentPage !== pageNumber || state.selectedAyah !== ayah) return;

  saveLastPosition(pageNumber, ayah);

  state.currentPageSvg = svg;
  state.currentPageSegments = segments;
  state.currentPageWordSegments = wordSegments;
  state.currentPageUnitSegments = unitSegments;
  state.currentTotalHeight = totalHeight;
  // buildPage returns the SAME cached svg element on repeat visits (e.g.
  // re-selecting an ayah on the page already on screen) -- mountClosedPage
  // only touches the DOM when it isn't already showing exactly that svg.
  mountClosedPage(svg);
  updateAyahHighlight(svg, segments, ayah);
  // Always start a freshly-shown page with no word highlighted -- if
  // recitation playback is active, playAyah's own loop repaints the right
  // word right after this (see its "await showPage" call), same as how
  // updateAyahHighlight above isn't skipped just because a caller is about
  // to change the ayah again a moment later.
  updateWordHighlight(svg, wordSegments, null);
  updateTopbar();
  syncAyahGridHighlight();

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

// Maps a click/tap point (viewport coordinates) to the ayah drawn under it,
// using the segments returned alongside the currently-displayed page's SVG
// (see render.js's renderPage/renderLineGroup) -- or null if the point
// isn't over any ayah text (margins, the surah header band, etc). `svgEl`
// is the SPECIFIC <svg> the tap landed in: while the word-meal panel is
// open there are two on screen at once (the top slice's real one, the
// bottom slice's clone), each with its own on-screen position, so the
// caller must resolve the right one (e.g. via e.target.closest("svg"))
// rather than this function guessing -- the segments' coordinates apply
// identically to either, since a clone is pixel-for-pixel identical to
// the original, but the screen->svg-space transform (getScreenCTM) is
// naturally different for each because they sit in different places.
function pointToAyah(clientX, clientY, svgEl) {
  if (!svgEl || !state.currentPageSegments.length || typeof svgEl.getScreenCTM !== "function") return null;
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return null;
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const local = pt.matrixTransform(ctm.inverse());
  // a tap can fall within two adjacent lines' (generous, rounded) hit
  // bands at once near a line boundary -- prefer whichever line's
  // baseline is actually closest to the tap, not just the first match
  let best = null;
  let bestDist = Infinity;
  for (const seg of state.currentPageSegments) {
    if (local.x < seg.xMin || local.x > seg.xMax) continue;
    if (local.y < seg.baselineY - 1350 || local.y > seg.baselineY + 550) continue;
    const dist = Math.abs(local.y - seg.baselineY);
    if (dist < bestDist) {
      bestDist = dist;
      best = { surah: seg.surah, ayah: seg.ayah };
    }
  }
  return best;
}

// ===================== Ayet detay paneli (kelime meali, meal, ...) =====================
//
// Tapping ayah text toggles a panel open right after that ayah's LAST
// line, stacking each translation type in its own section -- kelime meali
// (word-by-word) first, then meal (full-ayah), tefsir joining the same
// stack in a later step. Since the page itself is one precisely-justified
// SVG (not flowing HTML -- see the README), "pushing the rest of the page
// down" is done by visually splitting that SAME svg in two around a Y
// coordinate that falls in the blank gap between the ayah's last line and
// whatever comes next:
//  - a "top slice" -- the page's real, canonical <svg> (still the one
//    cached in state.pageCache, so ayah-selection highlighting etc. keeps
//    working exactly as before) sitting inside an overflow:hidden box
//    just tall enough to show everything down to the cut,
//  - the HTML panel,
//  - a "bottom slice" -- a *clone* of that same svg, shifted up by the
//    cut's height inside its own overflow:hidden box, so only the portion
//    AFTER the cut peeks out the bottom.
// Both slices show the exact same pixels the single uncut page would have
// -- the cut is invisible except for the panel now sitting in the middle
// -- so opening/closing only ever animates the PANEL's own height (a CSS
// grid 0fr->1fr transition -- see .word-meal-panel in style.css); the
// bottom slice is simply pushed down as a normal consequence of sitting
// right after the panel in document flow, no separate animation needed
// for it.

// [{i, t}, ...] mushaf.json word entries for one ayah on the CURRENTLY
// shown page, in reading order, INCLUDING the trailing end-of-ayah marker
// token -- ready to hand to wordmeal.js's buildWordMealCards.
function ayahRawWords(surah, ayah) {
  const range = ayahWordRange(surah, ayah);
  if (!range) return [];
  const { firstWordId, lastWordId } = range;
  const lines = state.mushaf.pages[state.currentPage - 1];
  const out = [];
  for (const line of lines) {
    if (!line.w) continue;
    for (const w of line.w) {
      if (w.i >= firstWordId && w.i <= lastWordId) out.push(w);
    }
  }
  return out;
}

function wordMealRefLabel(ayah) {
  const info = state.surahs[String(ayah.surah)];
  const name = info ? info.nameTurkish : ayah.surah;
  return `${name} ${ayah.ayah}`;
}

// The panel's full body: each translation type gets its own labelled
// .wm-section, stacked in the order requested -- kelime meal, meal, then
// Tefsir's two source buttons + their shared (collapsed by default)
// content area, see onTafsirTabClick. A section is only as good as the
// data it had cached when this ran, so callers should only use this once
// the relevant loadXData() calls have settled -- see openWordMeal.
function ayahPanelBodyHTML(ayah) {
  const rawWords = ayahRawWords(ayah.surah, ayah.ayah);
  const cards = buildWordMealCards(rawWords, getCachedWordMealData(), ayah.surah, ayah.ayah);
  const mealText = getMealText(getCachedMealData(), ayah.surah, ayah.ayah);

  const tafsirTabsHTML = tafsirSourceIds()
    .map((id) => `<button type="button" class="wm-tafsir-tab" data-tafsir-id="${escapeHtml(id)}">${escapeHtml(tafsirSourceLabel(id))}</button>`)
    .join("");

  return `
    <div class="wm-section">
      <div class="wm-section-label">Kelime Meali</div>
      ${renderWordMealCardsHTML(cards)}
    </div>
    <div class="wm-section">
      <div class="wm-section-label">Meal</div>
      ${renderMealHTML(mealText)}
    </div>
    <div class="wm-section">
      <div class="wm-section-label">Tefsir</div>
      <div class="wm-tafsir-tabs">${tafsirTabsHTML}</div>
      <div class="wm-tafsir-panel">
        <div class="wm-tafsir-panel-inner">
          <div class="wm-tafsir-content"></div>
        </div>
      </div>
    </div>`;
}

const WORD_MEAL_LOADING_HTML = `<p class="word-meal-loading">Yükleniyor…</p>`;

function tafsirContentHTML(sourceId, ayah) {
  if (!isTafsirSourceAvailable(sourceId)) {
    return `<p class="word-meal-loading">${escapeHtml(tafsirSourceLabel(sourceId))} yakında eklenecek.</p>`;
  }
  // deliberately NOT escaped -- the source data's own <p>/<div>/<span
  // class="..."> markup (colors, emphasis) is meant to reach the page as
  // real HTML, see tafsir.js's file-level comment
  const text = resolveTafsirText(getCachedTafsirData(sourceId), ayah.surah, ayah.ayah);
  return text || `<p class="word-meal-loading">Bu ayet için tefsir bulunamadı.</p>`;
}

function updateTafsirTabsUI() {
  const wm = state.wordMeal;
  if (!wm.bodyEl) return;
  wm.bodyEl.querySelectorAll(".wm-tafsir-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tafsirId === wm.tafsirActive);
  });
}

// Animates `panelEl` (a .wm-tafsir-panel) shut if it's open, resolving
// once that's visually finished -- transitionend, with the same
// fallback-timeout robustness as closeWordMeal. Resolves immediately if
// it's already closed. Used to sequence "close the old tafsir, THEN show
// the new one" as two visibly separate steps when switching sources,
// rather than an instant content swap.
function animateTafsirClosed(panelEl) {
  return new Promise((resolve) => {
    if (!panelEl || !panelEl.classList.contains("wm-open")) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      panelEl.removeEventListener("transitionend", onEnd);
      resolve();
    };
    const onEnd = (e) => {
      if (e.target !== panelEl || e.propertyName !== "grid-template-rows") return;
      finish();
    };
    panelEl.addEventListener("transitionend", onEnd);
    panelEl.classList.remove("wm-open");
    setTimeout(finish, 400);
  });
}

// Fills in and opens .wm-tafsir-content/.wm-tafsir-panel for `sourceId`,
// fetching its data first if this is the first time it's needed this
// session (see tafsir.js's loadTafsirData/cache).
function showTafsirContent(sourceId, ayah, panelEl) {
  const contentEl = panelEl.querySelector(".wm-tafsir-content");
  if (!contentEl) return;

  const needsFetch = isTafsirSourceAvailable(sourceId) && !isTafsirDataReady(sourceId);
  contentEl.innerHTML = needsFetch ? WORD_MEAL_LOADING_HTML : tafsirContentHTML(sourceId, ayah);
  requestAnimationFrame(() => panelEl.classList.add("wm-open"));

  if (needsFetch) {
    loadTafsirData(sourceId)
      .catch((err) => console.error(err))
      .then(() => {
        // bail if the user closed the ayah panel, moved to a different
        // ayah, or picked a different tafsir tab while that fetch was in
        // flight
        const wm = state.wordMeal;
        if (wm.open && wm.ayah === ayah && wm.tafsirActive === sourceId) {
          contentEl.innerHTML = tafsirContentHTML(sourceId, ayah);
        }
      });
  }
}

// The Tefsir section's tab click handler: same button again closes it;
// the OTHER button closes whichever was open and opens this one in that
// same area, as two distinct steps (see animateTafsirClosed) rather than
// swapping content in place, so switching reads as "close, then open"
// exactly like re-tapping a single button does.
async function onTafsirTabClick(sourceId) {
  const wm = state.wordMeal;
  if (!wm.open || !wm.bodyEl) return;
  const ayah = wm.ayah;
  const panelEl = wm.bodyEl.querySelector(".wm-tafsir-panel");
  if (!panelEl) return;

  // guards the delayed branch below: if the user clicks a DIFFERENT
  // tafsir tab again before this click's own close-then-reopen sequence
  // finishes, that second click's requestId will no longer match once
  // this one's await resolves, so it bails out instead of clobbering
  // whatever the newer click already put on screen
  const requestId = ++wm.tafsirRequestId;

  if (wm.tafsirActive === sourceId) {
    wm.tafsirActive = null;
    updateTafsirTabsUI();
    animateTafsirClosed(panelEl);
    return;
  }

  if (wm.tafsirActive) {
    wm.tafsirActive = null;
    updateTafsirTabsUI();
    await animateTafsirClosed(panelEl);
    // bail if the user closed the panel, moved to a different ayah, or
    // clicked another tafsir tab while that close animation was playing
    if (!wm.open || wm.ayah !== ayah || wm.tafsirRequestId !== requestId) return;
  }

  wm.tafsirActive = sourceId;
  updateTafsirTabsUI();
  showTafsirContent(sourceId, ayah, panelEl);
}

// Builds the three-part (top slice / panel / bottom slice) DOM structure
// fresh, with `bodyHTML` as the panel's initial content, and kicks off the
// grid-row open transition. Returns the panel element.
function openWordMealStructure(bodyHTML, refText) {
  const entry = state.pageCache.get(state.currentPage);
  const svg = entry && entry.svg;
  if (!svg) return null;

  els.pageContainer.innerHTML = "";

  const topEl = document.createElement("div");
  topEl.className = "page-slice page-slice--top";
  topEl.appendChild(svg);

  const panelEl = document.createElement("div");
  panelEl.className = "word-meal-panel";
  panelEl.setAttribute("role", "region");
  panelEl.setAttribute("aria-label", `${refText} detayı`);
  const innerEl = document.createElement("div");
  innerEl.className = "word-meal-panel-inner";
  innerEl.innerHTML = `
    <div class="word-meal-header">
      <span class="word-meal-title">${escapeHtml(refText)}</span>
      <button type="button" class="word-meal-close-btn" aria-label="Kapat">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="word-meal-body">${bodyHTML}</div>`;
  panelEl.appendChild(innerEl);

  const bottomOuterEl = document.createElement("div");
  bottomOuterEl.className = "page-slice page-slice--bottom";
  const bottomInnerEl = document.createElement("div");
  bottomInnerEl.className = "page-slice-inner";
  const bottomSvg = svg.cloneNode(true);
  bottomInnerEl.appendChild(bottomSvg);
  bottomOuterEl.appendChild(bottomInnerEl);

  els.pageContainer.appendChild(topEl);
  els.pageContainer.appendChild(panelEl);
  els.pageContainer.appendChild(bottomOuterEl);

  state.wordMeal.panelEl = panelEl;
  state.wordMeal.bodyEl = innerEl.querySelector(".word-meal-body");
  state.wordMeal.topEl = topEl;
  state.wordMeal.topSvg = svg;
  state.wordMeal.bottomOuterEl = bottomOuterEl;
  state.wordMeal.bottomInnerEl = bottomInnerEl;
  state.wordMeal.bottomSvg = bottomSvg;

  const closeBtn = innerEl.querySelector(".word-meal-close-btn");
  if (closeBtn) closeBtn.addEventListener("click", closeWordMeal);

  // Delegated (not per-button) on purpose: ayahPanelBodyHTML's markup gets
  // replaced wholesale once kelime meali/meal finish their first-ever
  // load (see openWordMeal), which would silently drop a listener
  // attached to the buttons themselves. bodyEl itself is never replaced
  // for the life of this panel, so this keeps working across that swap.
  state.wordMeal.bodyEl.addEventListener("click", (e) => {
    const tabBtn = e.target.closest(".wm-tafsir-tab");
    if (tabBtn) onTafsirTabClick(tabBtn.dataset.tafsirId);
  });

  layoutPageContainer();

  // next frame, so the panel's initial (collapsed) grid-row size isn't
  // collapsed into the same paint as its open size, same reasoning as
  // openModal's requestAnimationFrame
  requestAnimationFrame(() => {
    panelEl.classList.add("wm-open");
  });

  return panelEl;
}

// Opens the panel for `ayah` (must be on the currently shown page),
// showing every translation type that's ready -- kelime meal and meal for
// now, tefsir in a later step. Shows a brief loading state only the very
// first time any of that data is needed this session; each loadXData()
// caches itself afterwards (see wordmeal.js / meal.js).
async function openWordMeal(ayah) {
  const segsForAyah = state.currentPageSegments.filter((s) => s.surah === ayah.surah && s.ayah === ayah.ayah);
  if (!segsForAyah.length) return;
  // a long ayah can span several lines -- cut after the LAST one, at the Y
  // that best clears both the line above's diacritics (which reach up to
  // baselineY + 550, see updateAyahHighlight's rect: y = baselineY-1350,
  // height 1900) and the line below's (which reach down to
  // nextBaselineY - 1350). On a normal page those two safe zones actually
  // overlap slightly -- 1900 (highlight height) > INTERLINE (1800), i.e.
  // consecutive lines' diacritic clearance already eats ~100 units into
  // each other by design -- so no single Y can sit fully clear of both;
  // splitting the difference (the midpoint of the two edges) minimises
  // whichever side ends up slightly short, which in practice keeps actual
  // glyph ink (rarely using the full clearance) off the panel edges.
  const lastSeg = segsForAyah.reduce((best, s) => (!best || s.baselineY > best.baselineY ? s : best), null);
  const nextSeg = state.currentPageSegments.reduce(
    (best, s) => (s.baselineY > lastSeg.baselineY && (!best || s.baselineY < best.baselineY) ? s : best),
    null
  );
  const HIGHLIGHT_ABOVE_BASELINE = 1350; // matches updateAyahHighlight's rect y-offset
  const HIGHLIGHT_HEIGHT = 1900; // matches updateAyahHighlight's rect height
  const aboveClearEdge = lastSeg.baselineY + (HIGHLIGHT_HEIGHT - HIGHLIGHT_ABOVE_BASELINE); // bottom of the line-above's diacritic zone
  // no next line (last ayah on the page) -- nothing to split against, just
  // clear the line above and let the page's own BOTTOM_MARGIN handle the rest.
  const cutY = nextSeg
    ? (aboveClearEdge + (nextSeg.baselineY - HIGHLIGHT_ABOVE_BASELINE)) / 2
    : aboveClearEdge;

  const target = { surah: ayah.surah, ayah: ayah.ayah };
  state.wordMeal.open = true;
  state.wordMeal.ayah = target;
  state.wordMeal.cutY = cutY;
  state.wordMeal.tafsirActive = null; // Tefsir starts collapsed each time the panel opens -- it's the biggest/priciest data source of the three, so it's fetched only once actually requested (see showTafsirContent)

  const refText = wordMealRefLabel(target);
  const ready = isWordMealDataReady() && isMealDataReady();
  openWordMealStructure(ready ? ayahPanelBodyHTML(target) : WORD_MEAL_LOADING_HTML, refText);

  if (!ready) {
    // fetch whatever's still missing side by side rather than one after
    // another, and don't let one failing (e.g. a single 404) blank out a
    // section whose own data loaded fine -- each renderer already falls
    // back to a plain "not available" message for data it doesn't have
    const results = await Promise.allSettled([loadWordMealData(), loadMealData()]);
    results.forEach((r) => {
      if (r.status === "rejected") console.error(r.reason);
    });
    // bail if the user closed the panel, or switched pages/ayahs, while
    // those fetches were in flight
    if (state.wordMeal.open && state.wordMeal.ayah === target && state.wordMeal.bodyEl) {
      state.wordMeal.bodyEl.innerHTML = ayahPanelBodyHTML(target);
    }
  }
}

// Animates the panel shut (reversing openWordMealStructure's grid-row
// transition), then restores the plain single-svg page once that finishes
// -- with a fallback timeout in case transitionend doesn't fire, same
// robustness pattern as closeModal.
function closeWordMeal() {
  if (!state.wordMeal.open) return;
  const panelEl = state.wordMeal.panelEl;
  state.wordMeal.open = false;
  state.wordMeal.ayah = null;
  state.wordMeal.cutY = null;
  state.wordMeal.tafsirActive = null;

  if (!panelEl) {
    const entry = state.pageCache.get(state.currentPage);
    if (entry) mountClosedPage(entry.svg);
    return;
  }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    panelEl.removeEventListener("transitionend", onEnd);
    const entry = state.pageCache.get(state.currentPage);
    if (entry) mountClosedPage(entry.svg);
  };
  const onEnd = (e) => {
    if (e.target !== panelEl || e.propertyName !== "grid-template-rows") return;
    finish();
  };
  panelEl.addEventListener("transitionend", onEnd);
  panelEl.classList.remove("wm-open");
  setTimeout(finish, 400);
}

// The single entry point for tapping ayah text on the page:
//  - closed -> opens the panel for the tapped ayah (selecting it too, if
//    it wasn't already the selected one),
//  - open (for that same ayah, tapped again) -> closes it,
//  - open (for a DIFFERENT ayah) -> selects the newly-tapped ayah and
//    closes the panel (matching tap again to open a fresh one for it).
async function onAyahTextClick(hit) {
  const alreadySelected = state.selectedAyah && state.selectedAyah.surah === hit.surah && state.selectedAyah.ayah === hit.ayah;
  const panelWasOpen = state.wordMeal.open;

  if (!alreadySelected) {
    await showPage(state.currentPage, { ayah: hit, skipHash: true });
  } else if (panelWasOpen) {
    closeWordMeal();
  }

  if (!panelWasOpen) {
    openWordMeal(hit);
  }
}

// ---------------------------------------------------------------------
// "Sure Bilgisi" modalı: sayfadaki sure başlığı kutusuna dokununca açılır
// (bkz. render.js drawSurahHeader'ın çizdiği .surah-header-hit hedefi ve
// yukarıdaki els.pageContainer "click" işleyicisi). Veri js/surahinfo.js
// üzerinden, tafsir.js ile aynı tembel-yükle-ve-önbelleğe-al düzeninde
// geliyor -- ilk açılışta data/surah-info-tr.json (~950KB) indirilir,
// sonraki açılışlarda önbellekten anında gelir.
//
// Üstteki istatistik şeridi (ayet sayısı / nüzul yeri / cüz) zaten yüklü
// olan state.surahs + state.surahPages/state.pageToJuz'dan çıkarılıyor, o
// yüzden veri henüz gelmemişken bile hemen gösterilebiliyor -- sadece
// asıl metin (isim/iniş dönemi/tema... bölümleri) "Yükleniyor…" durumunda
// bekliyor.
function surahInfoStatsHTML(surahNum) {
  const meta = state.surahs[String(surahNum)];
  const startPage = state.surahPages[String(surahNum)];
  const juzNum = startPage ? state.pageToJuz[startPage] : null;
  const placeLabel = !meta ? "—" : meta.revelationPlace === "makkah" ? "Mekkî" : meta.revelationPlace === "madinah" ? "Medenî" : "—";
  return `<div class="info-stats">
      <div class="info-stat"><span class="info-stat-value">${meta ? meta.versesCount : "—"}</span><span class="info-stat-label">Ayet</span></div>
      <div class="info-stat"><span class="info-stat-value">${escapeHtml(placeLabel)}</span><span class="info-stat-label">Nüzul Yeri</span></div>
      <div class="info-stat"><span class="info-stat-value">${juzNum || "—"}</span><span class="info-stat-label">Cüz</span></div>
    </div>`;
}

// Bölüm sayısı ve başlıkları sureden sureye değişiyor (İsim ve İniş Dönemi
// hep var, ama bazı surelerde Tarihî Arka Plan, adlı yan sorular vb. de
// geliyor -- en fazla 11 bölümlü sureler var), o yüzden akordeon burada
// sabit bir şemaya göre değil, splitInfoSections'ın kaynağın kendi <h2>
// sınırlarından çıkardığı listeye göre kuruluyor. .text zaten güvenilir
// (kendi çevirdiğimiz) markup, tafsirContentHTML'in tafsir-saadi.json
// içeriğine yaptığı gibi doğrudan innerHTML'e veriliyor.
function surahInfoBodyHTML(surahNum, entry) {
  const meta = state.surahs[String(surahNum)];
  const nameHTML = meta && meta.nameArabic ? `<div class="info-name-arabic">${escapeHtml(meta.nameArabic)}</div>` : "";
  const { intro, sections } = splitInfoSections(entry.text);
  const introHTML = intro.trim() ? `<div class="info-intro">${intro}</div>` : "";
  const sectionsHTML = sections
    .map(
      (s, i) => `<div class="info-section">
        <button type="button" class="info-section-toggle" aria-expanded="${i === 0 ? "true" : "false"}">
          <span>${escapeHtml(s.title)}</span>
          <svg class="info-section-chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="info-section-panel${i === 0 ? " open" : ""}">
          <div class="info-section-panel-inner"><div class="info-section-content">${s.bodyHTML}</div></div>
        </div>
      </div>`
    )
    .join("");
  return `${nameHTML}${surahInfoStatsHTML(surahNum)}${introHTML}<div class="info-sections">${sectionsHTML}</div>`;
}

function openSurahInfo(surahNum) {
  const meta = state.surahs[String(surahNum)];
  els.surahInfoTitle.textContent = meta ? `${surahNum}. ${meta.nameTurkish}` : "Sure Bilgisi";

  const showEntry = () => {
    const entry = getSurahInfoEntry(getCachedSurahInfoData(), surahNum);
    els.surahInfoBody.innerHTML = entry
      ? surahInfoBodyHTML(surahNum, entry)
      : `${surahInfoStatsHTML(surahNum)}<p class="word-meal-loading">Bu sure için bilgi bulunamadı.</p>`;
  };

  if (isSurahInfoDataReady()) {
    showEntry();
  } else {
    els.surahInfoBody.innerHTML = `${surahInfoStatsHTML(surahNum)}${WORD_MEAL_LOADING_HTML}`;
    loadSurahInfoData()
      .then(showEntry)
      .catch(() => {
        els.surahInfoBody.innerHTML = `${surahInfoStatsHTML(surahNum)}<p class="word-meal-loading">Yüklenemedi, lütfen tekrar deneyin.</p>`;
      });
  }
  openModal(els.surahInfoModal);
}

function setupSurahInfoModal() {
  // Akordeon bölümlerinin açık/kapalı durumu ayrıca state'te tutulmuyor --
  // sadece kendi .info-section-panel'inin sınıfında; modal her açıldığında
  // surahInfoBodyHTML zaten sıfırdan kuruluyor, bir önceki surenin açık
  // bıraktığı bölümler otomatik olarak sıfırlanmış oluyor.
  els.surahInfoBody.addEventListener("click", (e) => {
    const toggle = e.target.closest(".info-section-toggle");
    if (!toggle) return;
    const panel = toggle.nextElementSibling;
    const open = panel.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

// Uygulama açık/görünür olduğu sürece ekranın kararıp kilitlenmesini
// önler (mushaf okurken ekran sürekli kapanmasın diye). Desteklenmeyen
// tarayıcılarda ya da izin verilmediğinde sessizce devre dışı kalır --
// okuma deneyimini bozacak bir hataya yol açmaz.
let wakeLock = null;
async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch (err) {
    // pil tasarrufu modu, izin reddi, https olmayan bağlam vb. -- uygulama
    // ekran kilidi olmadan da normal şekilde çalışmaya devam eder.
  }
}
function setupWakeLock() {
  requestWakeLock();
  // Wake Lock, sekme arka plana alındığında (uygulama değiştirme, ekranı
  // kısaca kapatma vb.) tarayıcı tarafından otomatik serbest bırakılır;
  // sekme tekrar görünür olduğunda burada yeniden istenir.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestWakeLock();
  });
}

function setupNav() {
  els.prevBtn.addEventListener("click", goToPrevPage);
  els.nextBtn.addEventListener("click", goToNextPage);

  // Anything NOT inside an <svg> at all (the word-meal panel's own HTML --
  // its close button, word cards, whitespace) is ignored here; the close
  // button has its own listener, and the rest is inert by design.
  els.pageContainer.addEventListener("click", (e) => {
    const svgEl = e.target.closest("svg.mushaf-page-svg");
    if (!svgEl) return;
    const headerHit = e.target.closest(".surah-header-hit");
    if (headerHit) {
      openSurahInfo(parseInt(headerHit.dataset.surah, 10));
      return;
    }
    const hit = pointToAyah(e.clientX, e.clientY, svgEl);
    if (!hit) return;
    if (state.ezberStudy) {
      onEzberStudyTap(hit);
      return;
    }
    onAyahTextClick(hit);
  });

  document.addEventListener("keydown", (e) => {
    if (state.openModalEl) return; // don't page-turn while a modal is open
    // matches the on-screen tap-arrows: left arrow -> next, right -> previous
    if (e.key === "ArrowLeft") goToNextPage();
    if (e.key === "ArrowRight") goToPrevPage();
  });

  let touchStartX = null;
  let touchStartY = null;
  let touchStartTime = 0;
  els.pageContainer.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) {
      // pinch or other multi-touch gesture in progress: don't treat as a swipe
      touchStartX = null;
      return;
    }
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  });
  els.pageContainer.addEventListener("touchend", (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;
    // require a fast, mostly-horizontal gesture so it doesn't fire on
    // scrolling/pinching/selecting text
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 600) {
      // finger moving right (dx > 0) = next page, left = previous -- the
      // same direction a real mushaf page turns, opposite of a Latin book
      if (dx > 0) goToNextPage();
      else goToPrevPage();
    }
    touchStartX = null;
  });

  window.addEventListener("hashchange", () => {
    const n = initialPageFromHash();
    if (n !== null && n !== state.currentPage) showPage(n, { skipHash: true });
  });

  layoutPageContainer();
  window.addEventListener("resize", layoutPageContainer);
  window.addEventListener("orientationchange", () => setTimeout(layoutPageContainer, 60));
  if (window.ResizeObserver) {
    new ResizeObserver(() => layoutPageContainer()).observe(els.readerScroll);
  }
}

// ---------------------------------------------------------------------
// Recitation playback (besmele/play button): continuous, word-highlighted
// playback, starting from the selected ayah and continuing sequentially
// through the rest of the Qur'an until stopped. See state.playback's doc
// comment for the requestId guard. The main play button always uses
// Husary (unchanged); Ezber -> Dinle (further below) is the only caller
// that ever passes a different RECITERS key.
// ---------------------------------------------------------------------

// Mirrors tools/build_recitation.py's own RECITERS dict -- one entry per
// reciter whose word-timing data has been built into data/. introLocal
// is the isti'adha clip played before 1:1 (see introAudioFor); every
// other surah's besmele is just reciter's own 1:1 recitation (see below),
// so only the isti'adha itself needs its own per-reciter local file.
const RECITERS = {
  husary: {
    label: "Husarî (Mücevved)",
    cdnSlug: "husaryMujawwad",
    introLocal: "audio/euzuhusari.mp3",
    dataFile: "data/recitation-husary-mujawwad.json",
  },
  abdulsamad: {
    label: "Abdülbâsıt Abdüssamed (Mücevved)",
    cdnSlug: "abdulBasitMujawwad",
    introLocal: "audio/euzuabdulsamad.mp3",
    dataFile: "data/recitation-abdulsamad-mujawwad.json",
  },
};

// QUL's own export has one audio_url per ayah, but every single one (all
// 6236, verified per-reciter when its data/recitation-*.json was built --
// see tools/build_recitation.py) is this exact template, so it isn't
// stored per-ayah at all, just rebuilt here.
function recitationAudioUrl(surah, ayah, reciter = "husary") {
  const pad3 = (n) => String(n).padStart(3, "0");
  return `https://audio-cdn.tarteel.ai/quran/${RECITERS[reciter].cdnSlug}/${pad3(surah)}${pad3(ayah)}.mp3`;
}

// The clip that should play immediately BEFORE a given ayah's own
// recitation, or null if none applies -- standard recitation convention:
// the isti'adha ("eûzü billâhi mine'ş-şeytâni'r-racîm") is said once,
// right before Sûre-i Fâtiha's first ayah (the very start of a
// start-to-finish recitation); the besmele is said before the first ayah
// of every OTHER surah except Tevbe (sure 9), the one surah that doesn't
// open with it. Reuses 1:1's own recitation (an actual, already-fetched
// ayah) as that besmele audio rather than a separate clip.
function introAudioFor(surah, ayah, reciter = "husary") {
  if (ayah !== 1) return null;
  if (surah === 1) return RECITERS[reciter].introLocal;
  if (surah === 9) return null;
  return recitationAudioUrl(1, 1, reciter);
}

// Lazy-loads (and caches) a reciter's word-timing data -- see
// state.recitationCache's doc comment. Shared by normal playback
// (always "husary") and Ezber -> Dinle (either reciter).
async function loadRecitationData(reciter) {
  if (!state.recitationCache[reciter]) {
    state.recitationCache[reciter] = await loadJSON(RECITERS[reciter].dataFile);
  }
  return state.recitationCache[reciter];
}

// {surah,ayah} right after the given one, walking into the next surah once
// the current one runs out -- or null after 114:6, the last ayah of the
// Qur'an (playback stops there rather than looping back to the start; see
// advancePlayback).
function nextAyahRef(surah, ayah) {
  const versesCount = state.surahs[String(surah)] && state.surahs[String(surah)].versesCount;
  if (versesCount && ayah < versesCount) return { surah, ayah: ayah + 1 };
  if (surah < 114) return { surah: surah + 1, ayah: 1 };
  return null;
}

// Finds which segment currentTimeMs falls in BY TIME (not by its `pos`
// field -- see build_recitation.py's doc comment on why some ayahs repeat
// a position), and returns the GLOBAL word id it corresponds to, or null
// if it's before the first segment / doesn't resolve to a real word in
// THIS ayah (a couple of ayahs have one more recited segment than the
// mushaf has word-slots for them; silently not highlighting that last
// split-second is preferable to highlighting the wrong word).
function wordIdAtTime(surah, ayah, segments, currentTimeMs) {
  const bounds = ayahBounds(surah, ayah);
  if (!bounds) return null;
  const [, firstWordId, lastWordId] = bounds;
  let pos = null;
  for (const seg of segments) {
    if (currentTimeMs >= seg[1] && currentTimeMs < seg[2]) {
      pos = seg[0];
      break;
    }
  }
  if (pos == null) return null;
  const wordId = firstWordId + (pos - 1);
  return wordId <= lastWordId ? wordId : null;
}

// Navigates to {surah,ayah}, clears any leftover word-highlight, and starts
// whichever comes first: an intro clip (isti'adha/besmele -- introAudioFor)
// if this ayah needs one, or straight to the ayah's own recitation if not.
// Does NOT await any of the audio finishing -- the (persistent, see
// setupPlayback) audio element's "ended"/"error" events drive what happens
// next (onPlaybackAudioEnded: intro -> the ayah itself; ayah -> advance).
async function playAyah(surah, ayah, requestId) {
  if (state.playback.requestId !== requestId) return;
  state.playback.surah = surah;
  state.playback.ayah = ayah;
  state.playback.lastWordId = null;

  const page = ayahPage(surah, ayah);
  if (page) await showPage(page, { ayah: { surah, ayah } });
  if (state.playback.requestId !== requestId) return;
  // Nothing above is word-highighted (an intro clip isn't Qur'an text on
  // the page at all; the ayah itself hasn't started yet either way).
  if (state.currentPageSvg) updateWordHighlight(state.currentPageSvg, state.currentPageWordSegments, null);

  const introUrl = introAudioFor(surah, ayah, state.playback.reciter);
  if (introUrl) {
    state.playback.phase = "intro";
    await playClip(introUrl, requestId, /* onFailure */ () => playCurrentAyahAudio(requestId));
  } else {
    playCurrentAyahAudio(requestId);
  }
}

// Sets the shared audio element's src and plays it. On a play() rejection
// (autoplay policy, network, etc.) calls onFailure instead of leaving
// playback stuck -- used both for the intro clip (skip straight to the
// ayah) and, via playCurrentAyahAudio, for the ayah itself (stop outright).
async function playClip(url, requestId, onFailure) {
  const audio = state.playback.audio;
  audio.src = url;
  try {
    await audio.play();
  } catch (err) {
    if (state.playback.requestId !== requestId) return; // expected: a stop/restart interrupted this play() call
    console.warn(`Playback audio could not start (${url})`, err);
    onFailure();
  }
}

// Starts the CURRENT ayah's (state.playback.surah/ayah) own recitation +
// per-frame word-highlight sync -- called once directly from playAyah (no
// intro needed) or once from onPlaybackAudioEnded (intro clip finished).
function playCurrentAyahAudio(requestId) {
  if (state.playback.requestId !== requestId) return;
  state.playback.phase = "ayah";
  const { surah, ayah, reciter } = state.playback;
  playClip(recitationAudioUrl(surah, ayah, reciter), requestId, () => stopPlayback());
  if (state.playback.requestId !== requestId) return;
  if (state.playback.rafId) cancelAnimationFrame(state.playback.rafId); // guard against a prior ayah's loop still pending
  state.playback.rafId = requestAnimationFrame(() => syncHighlightLoop(requestId));
}

function syncHighlightLoop(requestId) {
  if (state.playback.requestId !== requestId || state.playback.phase !== "ayah") return;
  const { surah, ayah, audio, reciter } = state.playback;
  const segments = ((state.recitationCache[reciter] || {})[String(surah)] || [])[ayah - 1] || [];
  const wordId = wordIdAtTime(surah, ayah, segments, audio.currentTime * 1000);
  if (wordId !== state.playback.lastWordId) {
    state.playback.lastWordId = wordId;
    if (state.currentPageSvg) updateWordHighlight(state.currentPageSvg, state.currentPageWordSegments, wordId);
  }
  state.playback.rafId = requestAnimationFrame(() => syncHighlightLoop(requestId));
}

// Called from the (persistent) audio element's "ended"/"error" listeners.
// What "done" means depends on the phase that just finished: an intro clip
// hands off to that same ayah's own recitation; the ayah itself moves on
// to whatever's next in the sequence (or stops at the end of the Qur'an,
// nextAyahRef returning null).
function onPlaybackAudioEnded() {
  if (!state.playback.active) return;
  if (state.playback.ezber) {
    ezberAdvance(state.playback.requestId);
    return;
  }
  if (state.playback.phase === "intro") playCurrentAyahAudio(state.playback.requestId);
  else advancePlayback();
}
function onPlaybackAudioError() {
  if (!state.playback.active) return;
  console.warn(
    `Playback audio failed (phase=${state.playback.phase}) for ${state.playback.surah}:${state.playback.ayah}`,
    state.playback.audio.error
  );
  onPlaybackAudioEnded(); // same "what's next" logic as a clean finish
}
function advancePlayback() {
  const next = nextAyahRef(state.playback.surah, state.playback.ayah);
  if (!next) {
    stopPlayback();
    return;
  }
  playAyah(next.surah, next.ayah, state.playback.requestId);
}

async function startPlayback() {
  if (state.playback.active) return;
  // Set immediately (before the possibly-async data load below) so a rapid
  // second tap on the button is read as "stop", not a re-entrant 2nd start.
  state.playback.active = true;
  state.playback.reciter = "husary"; // the main play button is always Husary
  state.playback.ezber = null; // in case a previous Ezber->Dinle session left this set
  els.playBtn.classList.add("playing");
  els.playBtn.setAttribute("aria-pressed", "true");

  if (!state.recitationCache.husary) {
    els.playBtnLabel.textContent = "Yükleniyor…";
    try {
      await loadRecitationData("husary");
    } catch (err) {
      console.warn("Recitation data could not be loaded", err);
      stopPlayback();
      return;
    }
    if (!state.playback.active) return; // stopped again while the data was loading
  }

  els.playBtnLabel.textContent = "صدق الله العظيم";
  state.playback.requestId += 1;
  const startAyah = state.selectedAyah || pageFirstAyah(state.currentPage);
  playAyah(startAyah.surah, startAyah.ayah, state.playback.requestId);
}

function stopPlayback() {
  state.playback.active = false;
  state.playback.phase = "ayah";
  state.playback.ezber = null;
  state.playback.requestId += 1; // invalidates any in-flight playAyah continuation
  if (state.playback.rafId) {
    cancelAnimationFrame(state.playback.rafId);
    state.playback.rafId = null;
  }
  if (state.playback.audio) state.playback.audio.pause();
  state.playback.lastWordId = null;
  if (state.currentPageSvg) updateWordHighlight(state.currentPageSvg, state.currentPageWordSegments, null);
  els.playBtn.classList.remove("playing");
  els.playBtn.setAttribute("aria-pressed", "false");
  els.playBtnLabel.textContent = "بسم الله الرحمن الرحيم";
}

// ---------------------------------------------------------------------
// Ezber -> Dinle: cumulative-repetition memorization playback. Reuses the
// same <audio> element / word-highlight sync loop / page navigation as
// normal playback above (state.playback) -- it's really the same engine,
// just driven by state.playback.ezber's own stage machine instead of
// nextAyahRef's simple "next ayah in Qur'an order" progression, and kept
// mutually exclusive with it (startEzberPlayback opens by calling
// stopPlayback, same as starting normal playback would need to stop an
// in-progress Ezber session -- both share the one <audio> element).
//
// Ported from eski-uygulama's ezberStep(): play the current ayah `repeat`
// times, then replay besmele + every ayah from the start of the range
// through the current one once each ("review" -- reinforces the growing
// chain), then move to the next ayah; once the whole range is done, loop
// back to the start if repeatAll > 1, else stop. The one structural
// difference from the port: eski-uygulama chains steps through each
// playAudioUrl() call's own callback; here, ALL clips (normal or Ezber)
// share one "ended" listener (see setupPlayback), so ez.stage records
// which clip just finished/is about to play, and ezberAdvance reads it
// to decide what comes next -- see ezberPlayStage's cases for what each
// stage means.
// ---------------------------------------------------------------------

function ezberBasmalaNeeded(ez) {
  return !((ez.surah === 1 || ez.surah === 9) && ez.from === 1);
}

async function startEzberPlayback(reciter, surah, from, to, repeat, repeatAll) {
  stopPlayback(); // Ezber can't run alongside normal playback -- same <audio>
  state.playback.active = true;
  state.playback.reciter = reciter;
  els.playBtn.classList.add("playing");
  els.playBtn.setAttribute("aria-pressed", "true");
  els.playBtnLabel.textContent = "صدق الله العظيم";
  state.playback.requestId += 1;
  const requestId = state.playback.requestId;
  state.playback.ezber = {
    surah,
    from,
    to,
    repeat,
    repeatAll,
    repeatAllCurrent: 0,
    ayahOffset: 0, // 0-based; current main-phase ayah = from + ayahOffset
    repeatCurrent: 0, // how many times the current main-phase ayah has played so far
    reviewIndex: 0, // 0-based; only meaningful during "review-ayah"
    stage: "euzu",
  };

  if (!state.recitationCache[reciter]) {
    try {
      await loadRecitationData(reciter);
    } catch (err) {
      console.warn("Recitation data could not be loaded", err);
      stopPlayback();
      return;
    }
    if (state.playback.requestId !== requestId) return;
  }

  const page = ayahPage(surah, from);
  if (page) await showPage(page, { ayah: { surah, ayah: from } });
  if (state.playback.requestId !== requestId) return;
  ezberPlayStage(requestId);
}

// Starts whichever clip ez.stage currently points to. Called once to
// kick a session off and again every time ezberAdvance moves to a new
// stage -- never called directly from an "ended"/failure callback itself
// (those always go through ezberAdvance first, even when the next stage
// needs no real audio wait; see ezberAdvance's own recursive calls).
function ezberPlayStage(requestId) {
  if (state.playback.requestId !== requestId || !state.playback.active) return;
  const ez = state.playback.ezber;
  if (!ez) return;
  const reciter = state.playback.reciter;

  if (ez.stage === "euzu") {
    state.playback.phase = "intro";
    playClip(RECITERS[reciter].introLocal, requestId, () => ezberAdvance(requestId));
    return;
  }
  if (ez.stage === "besmele" || ez.stage === "review-besmele") {
    state.playback.phase = "intro";
    playClip(recitationAudioUrl(1, 1, reciter), requestId, () => ezberAdvance(requestId));
    return;
  }
  // "ayah" (main phase) or "review-ayah" (cumulative review)
  const ayahNum = ez.stage === "review-ayah" ? ez.from + ez.reviewIndex : ez.from + ez.ayahOffset;
  ezberPlayAyah(ez.surah, ayahNum, requestId);
}

// Plays one specific ayah's own recitation with the normal page-nav +
// ayah-highlight + word-sync treatment (same pieces playAyah/
// playCurrentAyahAudio use above), but WITHOUT their automatic
// intro-before-ayah-1 injection -- Ezber controls euzu/besmele timing
// itself via ez.stage, so an ayah clip here is always just the ayah.
async function ezberPlayAyah(surah, ayah, requestId) {
  state.playback.surah = surah;
  state.playback.ayah = ayah;
  state.playback.lastWordId = null;
  const page = ayahPage(surah, ayah);
  if (page) await showPage(page, { ayah: { surah, ayah } });
  if (state.playback.requestId !== requestId) return;
  if (state.currentPageSvg) updateWordHighlight(state.currentPageSvg, state.currentPageWordSegments, null);
  state.playback.phase = "ayah";
  playClip(recitationAudioUrl(surah, ayah, state.playback.reciter), requestId, () => ezberAdvance(requestId));
  if (state.playback.requestId !== requestId) return;
  if (state.playback.rafId) cancelAnimationFrame(state.playback.rafId);
  syncHighlightLoop(requestId);
}

// Called whenever ez.stage's clip just finished (onPlaybackAudioEnded)
// or failed to even start (ezberPlayStage/ezberPlayAyah's playClip
// onFailure) -- decides ez's next stage and starts it. See the module
// comment above for the stage sequence this implements.
function ezberAdvance(requestId) {
  if (state.playback.requestId !== requestId || !state.playback.active) return;
  const ez = state.playback.ezber;
  if (!ez) return;
  const totalAyahs = ez.to - ez.from + 1;

  if (ez.stage === "euzu") {
    ez.stage = ezberBasmalaNeeded(ez) ? "besmele" : "ayah";
    ezberPlayStage(requestId);
    return;
  }
  if (ez.stage === "besmele") {
    ez.stage = "ayah";
    ezberPlayStage(requestId);
    return;
  }
  if (ez.stage === "ayah") {
    ez.repeatCurrent++;
    if (ez.repeatCurrent < ez.repeat) {
      ezberPlayStage(requestId); // same ayah again
      return;
    }
    ez.repeatCurrent = 0;
    ez.reviewIndex = 0;
    ez.stage = ezberBasmalaNeeded(ez) ? "review-besmele" : "review-ayah";
    ezberPlayStage(requestId);
    return;
  }
  if (ez.stage === "review-besmele") {
    ez.stage = "review-ayah";
    ezberPlayStage(requestId);
    return;
  }
  // "review-ayah": keep replaying from(+0) .. from(+ayahOffset) until the
  // just-finished one WAS that last one, then move on to the next ayah.
  if (ez.reviewIndex < ez.ayahOffset) {
    ez.reviewIndex++;
    ezberPlayStage(requestId);
    return;
  }
  ez.ayahOffset++;
  if (ez.ayahOffset >= totalAyahs) {
    ez.repeatAllCurrent++;
    if (ez.repeatAllCurrent < ez.repeatAll) {
      ez.ayahOffset = 0;
      ez.stage = "euzu";
      ezberPlayStage(requestId);
    } else {
      stopPlayback();
    }
    return;
  }
  ez.stage = "ayah";
  ezberPlayStage(requestId);
}

// ---------------------------------------------------------------------
// Ezber -> Oku & Yaz: the shared "reveal as you go" study engine (see
// state.ezberStudy's doc comment for the session shape). Oku reveals one
// WORD per tap; Yaz reveals one LETTER UNIT per matching keypress on the
// virtual keyboard. Both otherwise share every other piece here:
// covering/uncovering the active ayah, advancing between ayahs, playing
// an ayah's recitation once it's fully revealed, and ending the session.
// ---------------------------------------------------------------------

// Draws (replacing whatever was there) one paper-coloured rounded rect
// per still-hidden unit into svg's .ezber-cover-layer (see render.js's
// renderPage -- always present, painted after every glyph so it actually
// hides them, not just tints them like the highlight layers do). Same
// per-line vertical box (baselineY-1350 .. +550) as
// updateWordHighlight/updateAyahHighlight use, so a cover lines up with
// the text it's hiding exactly as precisely as a highlight does.
function drawEzberCovers(svg, coverDefs) {
  const layer = svg && svg.querySelector(".ezber-cover-layer");
  if (!layer) return;
  layer.innerHTML = "";
  const PAD = 50;
  for (const c of coverDefs) {
    const rect = document.createElementNS(svg.namespaceURI, "rect");
    rect.setAttribute("class", "ezber-cover");
    rect.setAttribute("x", c.xMin - PAD);
    rect.setAttribute("y", c.baselineY - 1350);
    rect.setAttribute("width", c.xMax - c.xMin + PAD * 2);
    rect.setAttribute("height", 1900);
    rect.setAttribute("rx", 70);
    layer.appendChild(rect);
  }
}

// An ayah's real words (mushaf.json order), i.e. everything ayahRawWords
// returns EXCEPT the trailing end-of-ayah marker+number "word" -- same
// exclusion wordmeal.js's own MARKER filter applies and for the same
// reason: it's a structural glyph, not something to reveal/type.
// Depends on state.currentPage already being that ayah's page (see
// ayahRawWords itself) -- every caller here reaches it through
// ezberStudyGoToAyah, which navigates first.
function ezberRealWords(surah, ayah) {
  return ayahRawWords(surah, ayah).filter((w) => !w.t.startsWith("\u06dd"));
}

// This message's Yaz keyboard-matching needs a word's letters compared
// ignoring hamza-seat/ligature variants a learner wouldn't distinguish by
// ear (all alef forms read the same, a taa marbuta closes like a haa,
// etc.) -- same normalization eski-uygulama's ARABIC_BASE_MAP applied for
// the same reason, ported directly rather than re-derived.
const ARABIC_BASE_MAP = {
  أ: "ا", إ: "ا", آ: "ا", ٱ: "ا", "ٰ": "ا",
  ة: "ه",
  ؤ: "و",
  ئ: "ي", ى: "ي",
};
function ezberBaseChar(ch) {
  return ARABIC_BASE_MAP[ch] || ch;
}

// This ayah's reveal targets, in order -- oku: one entry per real word;
// yaz: one entry per letter unit within each real word (see render.js's
// splitIntoUnits, reused here with startChar=0 since these indices only
// need to be consistent WITHIN a word's own text, not the shaped line's
// full coordinate space the render-side call needs them in).
function ezberBuildUnits(mode, surah, ayah) {
  const words = ezberRealWords(surah, ayah);
  if (mode === "oku") {
    return words.map((w) => ({ wordId: w.i }));
  }
  const units = [];
  for (const w of words) {
    splitIntoUnits(w.t, 0).forEach((u, unitIndex) => {
      units.push({ wordId: w.i, unitIndex, baseChar: ezberBaseChar(w.t[u.startChar]) });
    });
  }
  return units;
}

// Turkish gloss for the real word at `wordId`, falling back to the
// nearest earlier word's gloss the same way the word-meal panel's own
// card-grouping does (see wordmeal.js's header comment) -- for Yaz's 💡
// hint, which only ever needs one word's text, not the whole ayah's
// card list buildWordMealCards produces.
function ezberWordMealText(surah, ayah, wordId) {
  const translations = getCachedWordMealData();
  if (!translations) return "";
  const words = ezberRealWords(surah, ayah);
  const pos = words.findIndex((w) => w.i === wordId) + 1; // 1-based; 0 = not found
  if (pos <= 0) return "";
  for (let idx = pos; idx >= 1; idx--) {
    const tr = translations[`${surah}:${ayah}:${idx}`];
    if (tr !== undefined) return tr;
  }
  return "";
}

// Redraws covers for:
//  - the current ayah's still-hidden units (everything from revealedCount
//    onward, as before), and
//  - every OTHER ayah in the study range (from..to) that's visible on the
//    current page and hasn't been reached yet (i.e. comes after
//    currentAyah) -- fully covered, word-for-word/unit-for-unit, same as a
//    freshly-arrived current ayah starts out. Ayahs before currentAyah
//    (already studied) and ayahs outside the from..to range entirely are
//    left uncovered, same as always.
// This is what makes the WHOLE selected range read as hidden at a glance
// (this message's 2nd request) rather than only ever one ayah at a time
// -- eski-uygulama (and this codebase before this change) covered just the
// active ayah, so the rest of a multi-ayah range sat in plain view until
// its own turn came up, reading as "revealing one ayah at a time" instead
// of "the whole range is hidden, revealing bit by bit".
// Looks up each covered unit's on-screen bounding box from the CURRENT
// page's own segment data -- state.currentPageWordSegments for oku,
// state.currentPageUnitSegments for yaz (see render.js). Call after any
// change to revealedCount or after the page they're drawn on changes.
function ezberRenderCoverState() {
  const es = state.ezberStudy;
  if (!es || !state.currentPageSvg) return;
  const hidden = es.units.slice(es.revealedCount);
  let coverDefs;
  if (es.mode === "oku") {
    const byWordId = new Map(state.currentPageWordSegments.map((s) => [s.wordId, s]));
    coverDefs = hidden.map((u) => byWordId.get(u.wordId)).filter(Boolean);
    for (const s of state.currentPageWordSegments) {
      if (ezberWordIsUpcoming(es, s.wordId)) coverDefs.push(s);
    }
  } else {
    const byKey = new Map(state.currentPageUnitSegments.map((s) => [`${s.wordId}:${s.unitIndex}`, s]));
    coverDefs = hidden.map((u) => byKey.get(`${u.wordId}:${u.unitIndex}`)).filter(Boolean);
    for (const s of state.currentPageUnitSegments) {
      if (ezberWordIsUpcoming(es, s.wordId)) coverDefs.push(s);
    }
  }
  drawEzberCovers(state.currentPageSvg, coverDefs);
}

// Whether `wordId` belongs to an ayah strictly after the session's current
// ayah but still within its from..to range -- i.e. a not-yet-reached ayah
// that should read as fully hidden regardless of what page it's on.
function ezberWordIsUpcoming(es, wordId) {
  const owner = wordIdToAyah(wordId);
  return !!owner && owner.surah === es.surah && owner.ayah > es.currentAyah && owner.ayah <= es.to;
}

// Navigates to `ayahNum`'s page (setting expectedPage first -- see
// showPage's guard), rebuilds its reveal units, and covers all of them
// (a freshly-shown ayah always starts fully hidden).
async function ezberStudyGoToAyah(ayahNum) {
  const es = state.ezberStudy;
  if (!es) return;
  es.currentAyah = ayahNum;
  const page = ayahPage(es.surah, ayahNum);
  es.expectedPage = page;
  await showPage(page, { ayah: { surah: es.surah, ayah: ayahNum } });
  if (state.ezberStudy !== es) return; // session ended while showPage was loading
  es.units = ezberBuildUnits(es.mode, es.surah, ayahNum);
  es.revealedCount = 0;
  ezberRenderCoverState();
}

let ezberStudyAudioGuard = 0;

// The active ayah is now fully revealed: play its recitation once
// (Husary, unsynced -- this is a confirmation replay of text already
// fully shown, not a listen-along, so the extra machinery word-sync
// needs isn't worth pulling in here), then move on. Uses the SAME shared
// <audio> element normal playback/Ezber->Dinle do (so nothing tries to
// play two clips over each other), but its own tiny guard counter rather
// than state.playback's -- this is a one-shot, self-contained play, not
// a session for that engine's phase/requestId bookkeeping to track.
function ezberStudyPlayAyahThenAdvance() {
  const es = state.ezberStudy;
  if (!es) return;
  const audio = state.playback.audio;
  const guard = ++ezberStudyAudioGuard;
  const onSettled = () => {
    audio.removeEventListener("ended", onSettled);
    audio.removeEventListener("error", onSettled);
    if (ezberStudyAudioGuard !== guard || !state.ezberStudy) return;
    if (es.currentAyah >= es.to) {
      endEzberStudy();
      return;
    }
    ezberStudyGoToAyah(es.currentAyah + 1);
  };
  audio.addEventListener("ended", onSettled);
  audio.addEventListener("error", onSettled);
  audio.src = recitationAudioUrl(es.surah, es.currentAyah, "husary");
  audio.currentTime = 0;
  audio.play().catch(onSettled);
}

// Oku: tapping the active ayah reveals its next word (see
// setupNav's pageContainer click handler, which routes here instead of
// the normal tap-to-select/open-word-meal flow while a study session is
// running). Taps elsewhere on the page -- a different ayah, blank margin
// -- are ignored; Yaz has no tap interaction at all (its input is the
// virtual keyboard, see handleEzberYazKeyPress).
function onEzberStudyTap(hit) {
  const es = state.ezberStudy;
  if (!es || es.mode !== "oku") return;
  if (hit.surah !== es.surah || hit.ayah !== es.currentAyah) return;
  if (es.revealedCount >= es.units.length) return;

  const revealedWordId = es.units[es.revealedCount].wordId;
  es.revealedCount++;
  ezberRenderCoverState();

  const wordSeg = state.currentPageWordSegments.find((s) => s.wordId === revealedWordId);
  const text = ezberWordMealText(es.surah, es.currentAyah, revealedWordId);
  if (wordSeg && text) showEzberWordTooltip(state.currentPageSvg, wordSeg, text);

  if (es.revealedCount >= es.units.length) ezberStudyPlayAyahThenAdvance();
}

// A brief (matches eski-uygulama's own ~1.5s) Turkish-gloss tooltip over
// a just-revealed word, drawn straight into the SVG (own <g>, appended
// after -- so on top of -- the cover layer) rather than an absolutely
// positioned HTML element, so it needs no SVG-to-screen coordinate
// conversion. Sized from the live text's own getBBox() (only available
// once it's actually in the DOM) rather than a guessed character width,
// so it fits short and long glosses equally well.
function showEzberWordTooltip(svg, wordSeg, text) {
  const old = svg.querySelector(".ezber-tooltip");
  if (old) old.remove();

  const g = document.createElementNS(svg.namespaceURI, "g");
  g.setAttribute("class", "ezber-tooltip");
  const midX = (wordSeg.xMin + wordSeg.xMax) / 2;
  const textY = wordSeg.baselineY - 1650;

  const textEl = document.createElementNS(svg.namespaceURI, "text");
  textEl.setAttribute("x", midX);
  textEl.setAttribute("y", textY);
  textEl.setAttribute("text-anchor", "middle");
  textEl.textContent = text;
  g.appendChild(textEl);
  svg.appendChild(g);

  const bbox = textEl.getBBox();
  const padX = 60;
  const padY = 40;
  const rect = document.createElementNS(svg.namespaceURI, "rect");
  rect.setAttribute("x", bbox.x - padX);
  rect.setAttribute("y", bbox.y - padY);
  rect.setAttribute("width", bbox.width + padX * 2);
  rect.setAttribute("height", bbox.height + padY * 2);
  rect.setAttribute("rx", 30);
  g.insertBefore(rect, textEl);

  setTimeout(() => g.remove(), 1500);
}

// Shared entry point for both modes: stop any other audio, set up the
// session, and jump to the range's first ayah.
async function startEzberStudy(mode, surah, from, to) {
  stopPlayback(); // shares the <audio> element with normal/Dinle playback
  if (mode === "yaz" && !isWordMealDataReady()) {
    loadWordMealData().catch((err) => console.warn("Word-meal data could not be loaded (Yaz hint)", err));
  }
  state.ezberStudy = { mode, surah, from, to, currentAyah: from, units: [], revealedCount: 0, expectedPage: null };
  els.ezberBtn.textContent = "Bitir";
  if (mode === "yaz") {
    els.yazKeyboard.hidden = false;
    positionYazKeyboard();
  } else {
    // switching straight from an in-progress Yaz session into Oku (modal
    // re-opened mid-session) without going through endEzberStudy first --
    // make sure its keyboard and the reserved space (--yaz-keyboard-space)
    // don't linger.
    els.yazKeyboard.hidden = true;
    els.yazHintText.hidden = true;
    document.documentElement.style.setProperty("--yaz-keyboard-space", "0px");
  }
  await ezberStudyGoToAyah(from);
}
function startEzberOku(surah, from, to) {
  startEzberStudy("oku", surah, from, to);
}
function startEzberYaz(surah, from, to) {
  startEzberStudy("yaz", surah, from, to);
}

function endEzberStudy() {
  if (!state.ezberStudy) return;
  ezberStudyAudioGuard++; // invalidate any in-flight ezberStudyPlayAyahThenAdvance
  if (state.playback.audio) state.playback.audio.pause();
  if (state.currentPageSvg) {
    drawEzberCovers(state.currentPageSvg, []);
    const tip = state.currentPageSvg.querySelector(".ezber-tooltip");
    if (tip) tip.remove();
  }
  els.yazKeyboard.hidden = true;
  els.yazHintText.hidden = true;
  document.documentElement.style.setProperty("--yaz-keyboard-space", "0px");
  state.ezberStudy = null;
  els.ezberBtn.textContent = "Ezber";
}

// Yaz: a keyboard key was pressed (see setupEzberYazKeyboard). Matches
// against the CURRENT unit's base letter only (ezberBaseChar on both
// sides, so hamza-seat/ligature variants the learner wouldn't
// distinguish by ear all count as a match); a non-matching key does
// nothing at all -- no error state, no penalty -- same as
// eski-uygulama's yazCheckChar.
function handleEzberYazKeyPress(pressedChar) {
  const es = state.ezberStudy;
  if (!es || es.mode !== "yaz") return;
  const target = es.units[es.revealedCount];
  if (!target) return;
  if (ezberBaseChar(pressedChar) !== target.baseChar) return;

  es.revealedCount++;
  ezberRenderCoverState();
  if (es.revealedCount >= es.units.length) ezberStudyPlayAyahThenAdvance();
}

// Yaz: 💡 toggles the current (still-hidden) unit's word's Turkish gloss,
// shown as plain text above the keyboard rather than as an SVG tooltip --
// eski-uygulama's hint is similarly a persistent toggle, not a timed
// flash like Oku's per-word reveal tooltip, since here it's requested,
// not automatic.
function toggleEzberYazHint() {
  const es = state.ezberStudy;
  if (!es || es.mode !== "yaz") return;
  if (!els.yazHintText.hidden) {
    els.yazHintText.hidden = true;
    return;
  }
  const target = es.units[es.revealedCount];
  if (!target) return;
  els.yazHintText.textContent = ezberWordMealText(es.surah, es.currentAyah, target.wordId) || "(anlam bulunamadı)";
  els.yazHintText.hidden = false;
}

// Sits the keyboard directly above the bottombar's own real, rendered
// height (measured, not assumed -- its height comes from its buttons'
// content/padding, not a fixed CSS value, so a hardcoded offset would
// drift out of sync with actual font metrics across platforms), and
// reserves that same real height as extra bottom space on .reader-scroll
// (via --yaz-keyboard-space, see its CSS rule) so the fixed/overlaid
// keyboard never covers the page's own bottom lines -- short pages
// (sayfa 1-2, header+besmele eating into their line count) that used to
// sit centered right behind the keyboard now get pushed up above it, and
// full pages get real extra scroll room instead of their last lines
// being permanently covered.
function positionYazKeyboard() {
  if (els.bottombar) els.yazKeyboard.style.bottom = `${els.bottombar.getBoundingClientRect().height}px`;
  const kbH = els.yazKeyboard.hidden ? 0 : els.yazKeyboard.getBoundingClientRect().height;
  document.documentElement.style.setProperty("--yaz-keyboard-space", `${kbH}px`);
}

function setupEzberYazKeyboard() {
  els.yazKeyboard.addEventListener("click", (e) => {
    const key = e.target.closest(".yaz-key");
    if (!key) return;
    if (key.dataset.hint !== undefined) {
      toggleEzberYazHint();
      return;
    }
    handleEzberYazKeyPress(key.dataset.char);
  });
  window.addEventListener("resize", () => {
    if (!els.yazKeyboard.hidden) positionYazKeyboard();
  });
}

function setupPlayback() {
  state.playback.audio = new Audio();
  state.playback.audio.addEventListener("ended", onPlaybackAudioEnded);
  state.playback.audio.addEventListener("error", onPlaybackAudioError);

  els.playBtn.addEventListener("click", () => {
    if (state.playback.active) stopPlayback();
    else startPlayback();
  });
}

async function main() {
  try {
    const [{ hb, font, spaceWidth }, mushaf, surahs, surahPages, juz, hizb, rub, manzil, ayahs, pageFirstAyahData, ruku] = await Promise.all([
      loadHarfBuzzAndFont(),
      loadJSON("data/mushaf.json"),
      loadJSON("data/surahs.json"),
      loadJSON("data/surah-pages.json"),
      loadJSON("data/juz.json"),
      loadJSON("data/hizb.json"),
      loadJSON("data/rub.json"),
      loadJSON("data/manzil.json"),
      loadJSON("data/ayahs.json"),
      loadJSON("data/page-first-ayah.json"),
      loadJSON("data/ruku.json"),
    ]);

    state.mushaf = mushaf;
    state.surahs = surahs;
    state.surahPages = surahPages;
    state.juz = juz;
    state.hizb = hizb;
    state.rub = rub;
    state.manzil = manzil;
    state.ayahs = ayahs;
    state.pageFirstAyah = pageFirstAyahData;
    state.ruku = ruku;
    state.lineRenderer = new LineRenderer(hb, font, spaceWidth, mushaf.basmallahText);
    buildPageLookups();

    els.pageBtnTotal.textContent = mushaf.pagesCount;
    els.pageJumpInput.max = mushaf.pagesCount;
    els.pageJumpSlider.max = mushaf.pagesCount;
    setupModals();
    setupSurahInfoModal();
    setupEzberModal();
    setupEzberYazKeyboard();
    setupNav();
    setupWakeLock();
    setupPlayback();

    const initial = getInitialPosition();
    await showPage(initial.page, { ayah: initial.ayah, skipHash: true });

    els.loading.classList.add("hidden");
  } catch (err) {
    console.error(err);
    els.loading.textContent = "Yükleme hatası: " + err.message;
  }
}

main();
