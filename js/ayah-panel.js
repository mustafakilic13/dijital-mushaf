// ayah-panel.js -- ayet detay paneli: bir ayete dokununca sayfa o ayetin son satırından ikiye bölünür, araya kelime meali / meal /
// konular / tefsir bölümleri girer (openWordMeal, closeWordMeal); ayet metnine tıklamanın tek giriş noktası (onAyahTextClick).
//
// Çevrimsel içe aktarma: bu modül, başka uygulama modülleriyle birbirini içe aktarıyor. Bu güvenli, çünkü içe aktarılan adlar YALNIZCA
// işlev gövdelerinde (çağrı anında) kullanılıyor; modül değerlendirilirken, üst düzeyde, başka bir uygulama modülünden ad okumayın
// (test/modul_siniri_test.mjs bunu denetler; bkz. GELISTIRICI.md "Modül haritası").

import { announce } from "./announce.js";
import { syncAyahNav } from "./ayah-nav.js";
import { escapeHtml } from "./html.js";
import { ayahBounds, ayahWordRange } from "./lookup.js";
import { getCachedMealData, getMealText, isMealDataReady, loadMealData, renderMealHTML } from "./meal.js";
import { layoutPageContainer, mountClosedPage } from "./page-layout.js";
import { showPage } from "./page.js";
import { els, state } from "./state.js";
import {
  getCachedTafsirData,
  isTafsirDataReady,
  isTafsirSourceAvailable,
  loadTafsirData,
  resolveTafsirText,
  tafsirCreditHTML,
  tafsirSourceIds,
  tafsirSourceLabel,
} from "./tafsir.js";
import { openTopicsModal, topicChipHTML } from "./topics-modal.js";
import { getTopicsIndex, isTopicsDataReady, loadTopicsData } from "./topics.js";
import {
  buildWordMealCards,
  getCachedWordMealData,
  isWordMealDataReady,
  loadWordMealData,
  MARKER as AYAH_END_MARKER,
  renderWordMealCardsHTML,
} from "./wordmeal.js";

// ===================== Ayet detay paneli (kelime meali, meal, ...) =====================
//
// Tapping ayah text toggles a panel open right after that ayah's LAST
// line, stacking each translation type in its own section -- kelime meali
// (word-by-word) first, then meal (full-ayah), tefsir joining the same
// stack in a later step. Since the page itself is one precisely-justified
// SVG (not flowing HTML -- see GELISTIRICI.md), "pushing the rest of the page
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

// Plain Arabic text for `surah`:`ayah`, from data/mushaf.json's own word
// text (already plain Unicode -- see wordmeal.js's header note) rather
// than any glyph/shaping layer. Unlike ayahRawWords above (which only
// reads state.currentPage), this looks the ayah's OWN page up via
// ayahBounds, so it works for any ayah in the Qur'an, not just ones
// currently on screen -- state.mushaf is loaded in full at startup (see
// main()), so every page is already available regardless of which one is
// showing. Used by the Konu Fihristi modal's ayah list
// (topicAyahListHTML); everywhere else in the app, an ayah's Arabic is
// drawn as SVG glyphs on the mushaf page itself, not as plain HTML text.
function ayahArabicText(surah, ayah) {
  const bounds = ayahBounds(surah, ayah);
  if (!bounds) return "";
  const [page, firstWordId, lastWordId] = bounds;
  const lines = state.mushaf.pages[page - 1];
  if (!lines) return "";
  const words = [];
  for (const line of lines) {
    if (!line.w) continue;
    for (const w of line.w) {
      if (w.i >= firstWordId && w.i <= lastWordId && !w.t.startsWith(AYAH_END_MARKER)) words.push(w.t);
    }
  }
  return words.join(" ");
}

// ayahRawWords'ün "her sayfa" hâli: ayetin KENDİ sayfasını ayahBounds'la
// bulur (o an gösterilen sayfaya bağlı değil). Arama modalının kelime meali
// sonuçları, ekranda olmayan ayetlerin kelime kartlarını buradan kuruyor.
function ayahRawWordsAnywhere(surah, ayah) {
  const b = ayahBounds(surah, ayah);
  if (!b) return [];
  const lines = state.mushaf.pages[b[0] - 1];
  if (!lines) return [];
  const out = [];
  for (const line of lines) {
    if (!line.w) continue;
    for (const w of line.w) {
      if (w.i >= b[1] && w.i <= b[2]) out.push(w);
    }
  }
  return out;
}

function wordMealRefLabel(ayah) {
  const info = state.surahs[String(ayah.surah)];
  const name = info ? info.nameTurkish : ayah.surah;
  return `${name} ${ayah.ayah}`;
}

// Konu Fihristi tags for one ayah, as the panel's very first section (see
// ayahPanelBodyHTML) -- "" (no section at all) when the ayah has none, or
// when data/topics-tr.json hasn't finished loading yet (openWordMeal
// re-renders the whole body once it has, same as it already does for
// kelime meali/meal).
//
// The SAME display name can legitimately belong to more than one
// topic_id -- QUL's own taxonomy has, for instance, both a "General" AND
// a "Thematic" entry named "Abdest", both tagged to 5:6 -- roughly 1 in 4
// tagged ayahs hits this at least once. Shown as one tag per NAME
// (picking the lowest topic_id when several share a name) rather than one
// per record, so a single ayah -- some carry 40+ topics -- doesn't repeat
// the same word several times in a row; the dropped duplicate is still
// just a click away, through whichever chip's own parent/related/child
// links happen to reach it.
function ayahTopicsRowHTML(surah, ayah) {
  const index = getTopicsIndex();
  if (!index) return "";
  const ids = index.byAyah.get(`${surah}:${ayah}`) || [];
  if (!ids.length) return "";

  const byName = new Map();
  for (const id of ids) {
    const t = index.byId.get(id);
    if (!t) continue;
    const existing = byName.get(t.name);
    if (!existing || t.topic_id < existing.topic_id) byName.set(t.name, t);
  }
  const tags = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
  if (!tags.length) return "";

  const chipsHTML = tags.map(topicChipHTML).join("");
  return `
    <div class="wm-section">
      <div class="wm-section-label">Konular</div>
      <div class="topic-chip-row">${chipsHTML}</div>
    </div>`;
}

// The panel's full body: each translation type gets its own labelled
// .wm-section, stacked in the order requested -- Konu Fihristi tags (when
// the ayah has any) first, then kelime meal, meal, then Tefsir's two
// source buttons + their shared (collapsed by default) content area, see
// onTafsirTabClick. A section is only as good as the data it had cached
// when this ran, so callers should only use this once the relevant
// loadXData() calls have settled -- see openWordMeal.
function ayahPanelBodyHTML(ayah) {
  const rawWords = ayahRawWords(ayah.surah, ayah.ayah);
  const cards = buildWordMealCards(rawWords, getCachedWordMealData(), ayah.surah, ayah.ayah);
  const mealText = getMealText(getCachedMealData(), ayah.surah, ayah.ayah);

  // Tefsir başlangıçta kapalı: düğmeler baştan aria-expanded="false" ile geliyor (ekran okuyucu düğmeyi
  // "daraltılmış" diye okusun); sonraki durum updateTafsirTabsUI'de.
  const tafsirTabsHTML = tafsirSourceIds()
    .map((id) => `<button type="button" class="wm-tafsir-tab" data-tafsir-id="${escapeHtml(id)}" aria-expanded="false">${escapeHtml(tafsirSourceLabel(id))}</button>`)
    .join("");

  return `${ayahTopicsRowHTML(ayah.surah, ayah.ayah)}
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
  // Kaynağa atıf (QuranEnc.com şartı, bkz. tafsir.js) metnin ALTINA ayrı bir <p> olarak ekleniyor; metin değişmiyor.
  // Yalnızca metin varken: "bulunamadı"/"yakında" ekranlarında gösterilecek bir tefsir yok, atıf da yok. Atıf
  // .wm-tafsir-content'in İÇİNDE, yani panel kapanınca metinle birlikte DOM'dan kalkıyor (clearTafsirContent).
  return text ? text + tafsirCreditHTML(sourceId) : `<p class="word-meal-loading">Bu ayet için tefsir bulunamadı.</p>`;
}

// Sekme düğmelerinin durumu tek yerden, wm.tafsirActive'den türetiliyor: görünen hâl (.active) ile
// aria-expanded birlikte değişiyor, birbirinden ayrışamaz. Düğme bir göster/gizle düğmesi (aynı
// düğmeye tekrar basınca kapanıyor), o yüzden aria-expanded -- Sure Bilgisi akordeonundaki gibi.
// role="tab" KULLANILMAZ (sekme listesinde hep biri seçili olur, burada hepsi kapanabiliyor);
// aria-pressed de değil (düğmenin adı değişmiyor, anlatılması gereken açılan/kapanan içerik).
function updateTafsirTabsUI() {
  const wm = state.wordMeal;
  if (!wm.bodyEl) return;
  wm.bodyEl.querySelectorAll(".wm-tafsir-tab").forEach((btn) => {
    const active = btn.dataset.tafsirId === wm.tafsirActive;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-expanded", active ? "true" : "false");
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

// Kapanmış tefsir bölümünün metnini DOM'dan kaldırır. Kapalı panel yalnızca yükseklik 0 + opacity 0
// ile gizliydi, metin (Sa'dî ~3000 karakter; ya da veri gelirken kapatılınca "Yükleniyor…") hem DOM'da
// hem erişilebilirlik ağacında kalıyordu: düğme "kapalı" derken ekran okuyucu metni okuyabiliyordu.
// Açılış yolu DEĞİŞMEDİ: metin yine kapalı panele yazılıp bir kare sonra açılıyor (showTafsirContent).
// Yalnızca kapanış bitince, arada yeni bir tıklama olmadıysa çağrılıyor (bkz. onTafsirTabClick).
function clearTafsirContent(panelEl) {
  const contentEl = panelEl && panelEl.querySelector(".wm-tafsir-content");
  if (contentEl) contentEl.innerHTML = "";
}

// Fills in and opens .wm-tafsir-content/.wm-tafsir-panel for `sourceId`,
// fetching its data first if this is the first time it's needed this
// session (see tafsir.js's loadTafsirData/cache).
function showTafsirContent(sourceId, ayah, panelEl) {
  const contentEl = panelEl.querySelector(".wm-tafsir-content");
  if (!contentEl) return;

  const needsFetch = isTafsirSourceAvailable(sourceId) && !isTafsirDataReady(sourceId);
  contentEl.innerHTML = needsFetch ? WORD_MEAL_LOADING_HTML : tafsirContentHTML(sourceId, ayah);
  // Bu bir kare içinde sekme yeniden kapatıldıysa (ya da başka kaynağa geçildiyse) panel AÇILMAZ: aksi
  // hâlde düğme "kapalı" (aria-expanded="false") derken panel açık kalırdı.
  requestAnimationFrame(() => {
    if (state.wordMeal.tafsirActive === sourceId) panelEl.classList.add("wm-open");
  });

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
// exactly like re-tapping a single button does. Once a plain close has
// finished, the text is removed from the DOM again (clearTafsirContent),
// so a collapsed Tefsir section (aria-expanded="false") carries no text.
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
    animateTafsirClosed(panelEl).then(() => {
      // Kapanış bitti: arada yeni bir tıklama olmadıysa (olduysa requestId değişmiştir; yeniden
      // açılan ya da başka bir kapanışın animasyonu süren paneli boşaltmamak için) metni kaldır.
      if (wm.tafsirRequestId === requestId) clearTafsirContent(panelEl);
    });
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
  // Alt dilim, üst dilimdeki SVG'nin birebir klonu: görünürde yalnızca kesimin altı var ama görünmez
  // metin katmanının TÜM satırlarını taşıyor; üst dilim de (overflow:hidden yalnızca görsel) hepsini
  // taşıyor. Gizlenmezse sayfa metni erişilebilirlik ağacında panel açıkken iki kez görünür: ekran
  // okuyucu sayfayı okur, paneli okur, sonra sayfayı baştan bir kez daha okur. Gerçek olan üst
  // dilim ağaçta kalıyor, kopya aria-hidden ile çıkarılıyor. `inert` KULLANILMAZ: fare/dokunma
  // tıklamasını da keser, oysa alt dilimdeki ayete dokunmak ve sure başlığına basmak çalışmalı.
  // İçinde odaklanabilir öğe yok (aria-hidden-focus), yani klavye yolu da etkilenmez. Her açılışta
  // yapı baştan kurulduğundan işaret kapanışta kendiliğinden gidiyor (mountClosedPage tek SVG'yi koyar).
  bottomOuterEl.setAttribute("aria-hidden", "true");
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
  // Panelin KENDİ dinamik içeriği (kelime meali/meal ilk kez yüklenince gövdenin
  // yeniden yazılması, tefsir sekmesine basınca içeriğin gelmesi) burada duyurulur.
  // Tefsir sekmesi düğmesinin kendi durumunu aria-expanded söylüyor (updateTafsirTabsUI); metnin
  // GELDİĞİNİ bu bölge duyuruyor. Canlı bölge yalnızca GÖVDE: sayfa metni dilimleri
  // (üst + alt) bunun dışında, yani sayfa metni okutulmuyor.
  state.wordMeal.bodyEl.setAttribute("aria-live", "polite");
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
    if (tabBtn) {
      onTafsirTabClick(tabBtn.dataset.tafsirId);
      return;
    }
    const topicChip = e.target.closest(".topic-chip");
    if (topicChip) openTopicsModal(parseInt(topicChip.getAttribute("data-id"), 10));
  });

  layoutPageContainer();
  announce(`${refText} detayı açıldı`, "panel");

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
  // A surah-header banner (plus its own Bismillah) between this line and
  // nextSeg -- i.e. the tapped ayah is a surah's last on the page -- isn't
  // "the line below" in any useful sense for the midpoint formula below: it
  // has its own spacing (GAP_BEFORE_HEADER/GAP_AFTER_HEADER, see render.js),
  // usually taller than a text line, and nextSeg can end up several lines
  // further down than it looks. Splitting against nextSeg regardless used to
  // let the cut land anywhere from mid-banner to past it, putting the NEXT
  // surah's header above the panel instead of below it (where it belongs --
  // it comes after the tapped ayah). Once any header intervenes there's
  // nothing meaningful below to split against -- same as the
  // last-ayah-on-the-page case -- so the header (and everything after it)
  // is left entirely to the bottom slice.
  const headerBetween = state.currentPageSurahHeaderTopYs.some(
    (topY) => topY > lastSeg.baselineY && (!nextSeg || topY < nextSeg.baselineY)
  );
  // no next line to split against (last ayah on the page, or a surah header
  // sits before it) -- just clear the line above and let the page's own
  // BOTTOM_MARGIN (or the header's own top margin) handle the rest.
  const cutY =
    nextSeg && !headerBetween
      ? (aboveClearEdge + (nextSeg.baselineY - HIGHLIGHT_ABOVE_BASELINE)) / 2
      : aboveClearEdge;

  const target = { surah: ayah.surah, ayah: ayah.ayah };
  state.wordMeal.open = true;
  state.wordMeal.ayah = target;
  state.wordMeal.cutY = cutY;
  state.wordMeal.tafsirActive = null; // Tefsir starts collapsed each time the panel opens -- it's the biggest/priciest data source of the three, so it's fetched only once actually requested (see showTafsirContent)

  const refText = wordMealRefLabel(target);
  const ready = isWordMealDataReady() && isMealDataReady() && isTopicsDataReady();
  openWordMealStructure(ready ? ayahPanelBodyHTML(target) : WORD_MEAL_LOADING_HTML, refText);
  syncAyahNav(); // gezgindeki ayet düğmesi aria-expanded="true" olsun

  if (!ready) {
    // fetch whatever's still missing side by side rather than one after
    // another, and don't let one failing (e.g. a single 404) blank out a
    // section whose own data loaded fine -- each renderer already falls
    // back to a plain "not available" message for data it doesn't have
    const results = await Promise.allSettled([loadWordMealData(), loadMealData(), loadTopicsData()]);
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
  announce("Ayet detayı kapatıldı", "panel");
  const panelEl = state.wordMeal.panelEl;
  // Odak panelin içindeyse (Kapat düğmesi, sekme, konu etiketi, panelin kendisi) panel birazdan DOM'dan
  // kalkacak ve odak <body>'ye düşerdi: şimdi, panel hâlâ yerindeyken seçili ayet düğmesine ver.
  const focusWasInPanel = !!panelEl && panelEl.contains(document.activeElement);
  state.wordMeal.open = false;
  state.wordMeal.ayah = null;
  state.wordMeal.cutY = null;
  state.wordMeal.tafsirActive = null;
  syncAyahNav({ restoreFocus: focusWasInPanel }); // aria-expanded="false" + odağın geri verilmesi

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

export { ayahRawWords, ayahArabicText, ayahRawWordsAnywhere, WORD_MEAL_LOADING_HTML, closeWordMeal, onAyahTextClick };
