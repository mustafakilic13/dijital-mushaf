// state.js -- uygulamanın paylaşılan durumu (`state`) ve DOM öğe tablosu (`els`).
//
// Her modül bu ikisini buradan alır; ikisi de modül yüklenirken BİR KEZ kurulur. `els`, index.html'deki kimlikleri import
// sırasında arar: bu modül yalnızca sayfa yüklüyken (ya da index.html'i taklit eden bir DOM'da) içe aktarılabilir. Başka
// hiçbir uygulama modülünü içe aktarmaz ("yaprak"): her yoldan önce ve eksiksiz değerlendirilir.

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
  currentPageSurahHeaderTopYs: [], // top-edge Y of every surah-header line on the displayed page, in placement order -- see openWordMeal's cutY calc
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

  // "Konu Fihristi" modal (js/topics.js's data, see openTopicsModal /
  // pushTopicsModalTopic / popTopicsModalTopic / renderTopicsModalView).
  // stack is an ordered list of topic_ids -- stack[stack.length-1] is the
  // one currently shown; clicking a parent/related/child chip (or a
  // <topic data-id> link inside a description) pushes onto it, the
  // header's back button pops it, so the SAME modal can be browsed
  // arbitrarily deep (topic -> its parent -> THAT topic's own parent ->
  // ...) with "back" always returning exactly one step -- unlike the Sure
  // Bilgisi modal's #surah-info-detail (a single fixed "detail" sibling
  // panel), every level here is the same view type, so one array plus a
  // full re-render on each push/pop is enough; no second DOM panel needed.
  topicsModal: {
    stack: [],
  },

  // Ezber -> Oku/Yaz's shared "study session" state -- null while neither
  // is running. Both modes step through the same surah/from/to range one
  // ayah at a time, revealing that ayah's units (words for Oku, letters
  // for Yaz) one at a time on interaction, then playing that ayah's audio
  // and moving on once every unit is revealed. See startEzberOku/
  // startEzberYaz (js/ezber-study.js) for what populates this and
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
  ezberReciter: document.getElementById("ezber-dinle-reciter"), // gizli giriş: değer = RECITERS anahtarı (Kârî düğmesi bunu gösterir)
  ezberRepeat: document.getElementById("ezber-repeat"),
  ezberRepeatAll: document.getElementById("ezber-repeat-all"),
  ezberOkuForm: document.getElementById("ezber-oku-form"),
  ezberYazForm: document.getElementById("ezber-yaz-form"),

  ezberBtn: document.getElementById("ezber-btn"),
  ezberReveal: document.getElementById("ezber-reveal"),
  bottombar: document.querySelector(".bottombar"),
  yazKeyboard: document.getElementById("yaz-keyboard"),
  yazHintText: document.getElementById("yaz-hint-text"),
  playBtn: document.getElementById("play-btn"),
  playBtnAction: document.getElementById("play-btn-action"),
  playBtnLabel: document.getElementById("play-btn-label"),
  aramaBtn: document.getElementById("arama-btn"),
  aramaModal: document.getElementById("arama-modal"),
  navAnnouncer: document.getElementById("nav-announcer"),
  ayahNav: document.getElementById("ayah-nav"),

  surahInfoModal: document.getElementById("surah-info-modal"),
  surahInfoTitle: document.getElementById("surah-info-modal-title"),
  surahInfoBody: document.getElementById("surah-info-body"),
  surahInfoDetail: document.getElementById("surah-info-detail"),
  surahInfoDetailBack: document.getElementById("surah-info-detail-back"),
  surahInfoDetailBody: document.getElementById("surah-info-detail-body"),

  topicsModal: document.getElementById("topics-modal"),
  topicsModalTitle: document.getElementById("topics-modal-title"),
  topicsModalBack: document.getElementById("topics-modal-back"),
  topicsModalBody: document.getElementById("topics-modal-body"),
};

export { state, els };
