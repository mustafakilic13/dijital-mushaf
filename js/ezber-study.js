// ezber-study.js -- Ezber -> Oku ve Yaz: "açtıkça gör" çalışma motoru. Kapaklar (drawEzberCovers), kelime/harf birimleri, kelime açma,
// ekran ve fiziksel klavye (Yaz), oturumun başlatılması ve bitirilmesi.
//
// Çevrimsel içe aktarma: bu modül, başka uygulama modülleriyle birbirini içe aktarıyor. Bu güvenli, çünkü içe aktarılan adlar YALNIZCA
// işlev gövdelerinde (çağrı anında) kullanılıyor; modül değerlendirilirken, üst düzeyde, başka bir uygulama modülünden ad okumayın
// (test/modul_siniri_test.mjs bunu denetler; bkz. GELISTIRICI.md "Modül haritası").

import { announce } from "./announce.js";
import { syncAyahNav } from "./ayah-nav.js";
import { ayahRawWords } from "./ayah-panel.js";
import { ayahPage, wordIdToAyah } from "./lookup.js";
import { showPage } from "./page.js";
import { recitationAudioUrl, stopPlayback } from "./playback.js";
import { splitIntoUnits } from "./render.js";
import { els, state } from "./state.js";
import { getCachedWordMealData, isWordMealDataReady, loadWordMealData } from "./wordmeal.js";

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
// Aynı çağrı, kapaklı kelimelerin metin katmanındaki karşılıklarını erişilebilirlik ağacından da çıkarıyor
// (syncEzberTextLayer); `drawEzberCovers(svg, [])` (oturum sonu) ikisini birden temizliyor.
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
  syncEzberTextLayer(svg, coverDefs);
}

// Kapaklar yalnızca GÖRSEL bir örtü: kelimeyi örten dikdörtgen SVG'de, görünmez metin katmanının (render.js
// addTextSelectionLayer) ÜSTÜNE çiziliyor; katmanın kendisi ise erişilebilirlik ağacında tam metin olarak duruyordu,
// yani ekran okuyucu kullanıcısı açılmamış kelimeleri sayfadan okuyabiliyordu (gerçek Chromium'da ölçüldü, GELISTIRICI.md).
// Kapağı olan her kelimenin metin katmanındaki <span>'ı gizleniyor; açılan kelimenin işareti kalkıyor, kapaklar
// boşalınca (oturum sonu) hepsi kalkıyor. İşaret, kapağı çizen AYNI fonksiyonda ve AYNI veriden (coverDefs)
// türüyor: ikisi birbirinden ayrışamaz. Yaz'da bir kelimenin kapağı harf harf açılıyor; kelime son harfi açılana
// kadar gizli kalıyor (yarım bir kelime ağaçta anlamsız olurdu). Görünümü, seçimi ve kopyalamayı etkilemez.
function syncEzberTextLayer(svg, coverDefs) {
  const covered = new Set(coverDefs.map((c) => c.wordId));
  for (const span of svg.querySelectorAll(".text-layer-word")) {
    if (covered.has(Number(span.getAttribute("data-word-id")))) span.setAttribute("aria-hidden", "true");
    else span.removeAttribute("aria-hidden");
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
  // How many steps to go: Oku -> words, Yaz -> letters (a base letter + its marks is one step). showPage's own
  // "Sayfa N, ... M. ayet" anonsu hemen önce yazıldı; ikisi aynı ~50 ms penceresinde TEK metinde birleşiyor
  // (bkz. announce).
  announce(`Bu ayette ${es.units.length} ${es.mode === "oku" ? "kelime" : "harf"} var`, "ezber-ayet");
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
  // "error" olayı VE play()'in reddi aynı başarısız klip için (çevrimdışı, ses sunucusuna ulaşılamıyor) İKİSİ
  // birden geliyor: tek seferde ilerlemezse her başarısız klip bir ayet atlatıyordu (1. ayet bitti -> doğrudan
  // 3. ayet) ve sondan bir önceki ayette oturum erken bitiyordu.
  let settled = false;
  const onSettled = () => {
    if (settled) return;
    settled = true;
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

// Ekran okuyucu satırı: Oku'da az önce açılan kelime. `index` 1'den başlar, `total` ayetin kelime
// sayısı, `gloss` kelimenin Türkçe karşılığı ("" = veri yok). Bilerek YALNIZCA Türkçe: #nav-announcer
// tek dilli bir canlı bölge; Arapça kelimenin kendisi, açıldığı anda sayfanın metin katmanında (lang="ar")
// erişilebilirlik ağacına giriyor (kapağı kalkınca syncEzberTextLayer gizlemeyi kaldırır) -- açılmamışlar girmiyor.
function ezberRevealAnnouncement(index, total, gloss) {
  let text = `${index}. kelime`;
  if (gloss) text += `: ${gloss}`;
  if (index >= total) text += ". Ayet tamamlandı";
  return text;
}

// Oku: the active ayah's NEXT word is revealed -- by tapping the ayah (onEzberStudyTap) or, for
// keyboard / screen-reader users, by the #ezber-reveal button (setupEzberReveal). This is the ONE
// place that does it, so the two ways in can't drift apart. Returns false when there was nothing to
// reveal: no Oku session, or the ayah is already fully revealed (its recitation is playing / the
// next ayah is still loading -- es.units still holds the old ayah's units until then).
function ezberRevealNextWord() {
  const es = state.ezberStudy;
  if (!es || es.mode !== "oku") return false;
  if (es.revealedCount >= es.units.length) return false;

  const revealedWordId = es.units[es.revealedCount].wordId;
  es.revealedCount++;
  ezberRenderCoverState();

  const wordSeg = state.currentPageWordSegments.find((s) => s.wordId === revealedWordId);
  const text = ezberWordMealText(es.surah, es.currentAyah, revealedWordId);
  if (wordSeg && text) showEzberWordTooltip(state.currentPageSvg, wordSeg, text);
  // The tooltip above is a 1.5 s picture drawn into the SVG -- nothing a screen reader is told about.
  announce(ezberRevealAnnouncement(es.revealedCount, es.units.length, text), "ezber-kelime");

  if (es.revealedCount >= es.units.length) ezberStudyPlayAyahThenAdvance();
  return true;
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
  ezberRevealNextWord();
}

// Oku's keyboard / screen-reader way in: the sr-only #ezber-reveal button (index.html; visible only
// while keyboard-focused, see its CSS). Before it, revealing a word needed a tap on the page's <svg>,
// which has nothing a keyboard can reach.
function setupEzberReveal() {
  els.ezberReveal.addEventListener("click", () => ezberRevealNextWord());
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
  // Türkçe karşılıklar iki modda da lazım: Yaz'ın 💡 ipucu, Oku'nun açılan kelime baloncuğu ve ekran okuyucu
  // satırı. Yalnızca Yaz için yükleniyordu; Oku'da (ayet paneli/arama hiç açılmadıysa) veri hiç gelmiyor,
  // baloncuk hiç çıkmıyordu.
  if (!isWordMealDataReady()) {
    loadWordMealData().catch((err) => console.warn("Word-meal data could not be loaded (Ezber gloss)", err));
  }
  state.ezberStudy = { mode, surah, from, to, currentAyah: from, units: [], revealedCount: 0, expectedPage: null };
  syncAyahNav(); // Ezber çalışırken ayet gezgini gizli (orada ayete dokunmak kelime açmak demek, panel değil)
  els.ezberBtn.textContent = "Bitir";
  announce(mode === "yaz" ? "Yaz çalışması başladı" : "Oku çalışması başladı", "ezber-oturum");
  if (mode === "yaz") {
    els.ezberReveal.hidden = true;
    els.yazKeyboard.hidden = false;
    positionYazKeyboard();
    // Klavye / ekran okuyucu yolu: odak ilk tuşa geçer (modal kapanırken odak Ezber/Bitir'e geri verilmişti, aynı
    // senkron turda; bkz. Oku'daki #ezber-reveal). Bitir'den ilk tuşa 3 Tab (Oynat, Arama) gerekmesin; oklarla ve
    // (Arapça düzenle) doğrudan yazarak devam edilebilir. İlk tuş cevabı ele vermiyor (alfabe sırasının ilk harfi).
    const firstKey = els.yazKeyboard.querySelector(".yaz-key");
    if (firstKey) firstKey.focus();
  } else {
    // switching straight from an in-progress Yaz session into Oku (modal
    // re-opened mid-session) without going through endEzberStudy first --
    // make sure its keyboard and the reserved space (--yaz-keyboard-space)
    // don't linger.
    els.yazKeyboard.hidden = true;
    els.yazHintText.hidden = true;
    document.documentElement.style.setProperty("--yaz-keyboard-space", "0px");
    // Klavye / ekran okuyucu yolu (bkz. setupEzberReveal): kelime açma düğmesi görünür (hidden kalkar) ve odak ona
    // geçer -- modal kapanırken odak Ezber/Bitir'e geri verilmişti (closeModal, aynı senkron turda), Enter hemen
    // ilk kelimeyi açsın diye bir Tab daha gerekmesin.
    els.ezberReveal.hidden = false;
    els.ezberReveal.focus();
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
  // Odak, kaybolmak üzere olan bir oturum denetiminde mi (Oku'nun kelime açma düğmesi ya da Yaz klavyesinin bir tuşu --
  // son kelime/harften sonra oturum kendiliğinden bitti, ya da ok tuşuyla sayfa çevrildi)? Chromium, odaktaki öğe
  // gizlenince odağı <body>'ye düşürür: GİZLEMEDEN ÖNCE ölçüyoruz, sonra Ezber düğmesine veriyoruz. Odak başka yerdeyse
  // (Oynat, Arama...) ona dokunulmuyor.
  const focusInSession = document.activeElement === els.ezberReveal || els.yazKeyboard.contains(document.activeElement);
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
  els.ezberReveal.hidden = true;
  state.ezberStudy = null;
  syncAyahNav(); // gezgin yeniden görünsün
  els.ezberBtn.textContent = "Ezber";
  if (focusInSession) els.ezberBtn.focus();
  announce("Ezber çalışması bitti", "ezber-oturum");
}

// Ekran okuyucu satırı: Yaz'da basılan harf eşleşti. Oku'daki gibi YALNIZCA Türkçe (bkz. ezberRevealAnnouncement);
// harfin kendisi söylenmiyor: kullanıcı az önce bastığı tuşun adını zaten duydu. Ayetin son harfi aynı zamanda
// kelimenin de sonu olduğundan "Ayet tamamlandı" ağır basıyor.
function ezberYazAnnouncement(wordDone, ayahDone) {
  if (ayahDone) return "Doğru. Ayet tamamlandı";
  if (wordDone) return "Doğru. Kelime tamamlandı";
  return "Doğru";
}

// Yaz: a keyboard key was pressed (see setupEzberYazKeyboard -- the on-screen keys AND, with an Arabic layout, the
// physical keyboard, see onEzberYazPhysicalKey). Matches against the CURRENT unit's base letter only (ezberBaseChar
// on both sides, so hamza-seat/ligature variants the learner wouldn't distinguish by ear all count as a match); a
// non-matching key does nothing VISIBLE -- no error state, no penalty -- same as eski-uygulama's yazCheckChar. Ekran
// okuyucu kullanıcısı için sessizlik "tuş çalışmadı mı?" ile "yanlış harf"i ayırt ettirmiyor: nötr bir söz yazılıyor.
function handleEzberYazKeyPress(pressedChar) {
  const es = state.ezberStudy;
  if (!es || es.mode !== "yaz") return;
  const target = es.units[es.revealedCount];
  if (!target) return;
  if (ezberBaseChar(pressedChar) !== target.baseChar) {
    announce("Bu harf değil", "ezber-harf");
    return;
  }

  es.revealedCount++;
  ezberRenderCoverState();
  const ayahDone = es.revealedCount >= es.units.length;
  announce(ezberYazAnnouncement(ayahDone || es.units[es.revealedCount].wordId !== target.wordId, ayahDone), "ezber-harf");
  if (ayahDone) ezberStudyPlayAyahThenAdvance();
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
    announce("İpucu kapatıldı", "ezber-ipucu");
    return;
  }
  const target = es.units[es.revealedCount];
  if (!target) return;
  const gloss = ezberWordMealText(es.surah, es.currentAyah, target.wordId);
  els.yazHintText.textContent = gloss || "(anlam bulunamadı)";
  els.yazHintText.hidden = false;
  // Metin canlı bölge olmayan bir <p>'ye yazılıyor (yeni canlı bölge eklenmedi): ekran okuyucu bilsin diye ayrıca duyuruluyor.
  announce(`İpucu: ${gloss || "anlam bulunamadı"}`, "ezber-ipucu");
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

// Gerçek (fiziksel) klavyede Arapça düzen açıkken basılan Arapça harf: ekran tuşuna basmakla AYNI iş (`e.key` o zaman
// harfin kendisi; her harf için Tab ile tuşa gitmek yerine tek basış). "لا" gibi tek tuşta iki harf veren tuşlar (2
// karakter) sırayla işleniyor; tatweel (ـ) ve harakeler harf değil. Yalnızca Yaz sürerken, modal kapalıyken (Arama gibi
// alanlara Arapça yazılırken harf açılmasın), değiştirici tuşsuz ve tuş tekrarı değilken; tüketilen tuşun varsayılanı
// (ör. Firefox'un yazarak arama kutusu) iptal ediliyor.
const YAZ_PHYSICAL_KEY = /^[ء-غف-يٱ]{1,2}$/;
function onEzberYazPhysicalKey(e) {
  const es = state.ezberStudy;
  if (!es || es.mode !== "yaz") return;
  if (state.openModalEl) return;
  if (e.defaultPrevented || e.isComposing || e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.target && e.target.closest && e.target.closest("input, textarea, select, [contenteditable]")) return;
  if (!YAZ_PHYSICAL_KEY.test(e.key)) return;
  e.preventDefault();
  for (const ch of e.key) handleEzberYazKeyPress(ch);
}

// Ekran klavyesinde oklarla gezinme: Sol/Sağ DOM sırasıyla (= görünen sıra) önceki/sonraki tuş, Yukarı/Aşağı bir üst/alt
// satırda aynı sütun; uçlarda durur (dönmez). Her tuş yine ayrı bir Tab durağı -- Tab davranışı değişmedi, oklar ek bir
// kısayol. Bu tuşlar BURADA tüketiliyor (stopPropagation): setupNav'ın document'teki sayfa çevirme dinleyicisi Sol/Sağ'a
// ayrıca tepki verir ve oturumu bitirirdi.
function onEzberYazKeyboardKeydown(e) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
  const key = e.target && e.target.closest ? e.target.closest(".yaz-key") : null;
  if (!key) return;
  let next;
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    const keys = [...els.yazKeyboard.querySelectorAll(".yaz-key")];
    next = keys[keys.indexOf(key) + (e.key === "ArrowRight" ? 1 : -1)];
  } else {
    const rows = [...els.yazKeyboard.querySelectorAll(".yaz-keyboard-row")];
    const other = rows[rows.indexOf(key.parentElement) + (e.key === "ArrowDown" ? 1 : -1)];
    next = other && other.children[Math.min([...key.parentElement.children].indexOf(key), other.children.length - 1)];
  }
  e.preventDefault();
  e.stopPropagation();
  if (next) next.focus();
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
  els.yazKeyboard.addEventListener("keydown", onEzberYazKeyboardKeydown);
  document.addEventListener("keydown", onEzberYazPhysicalKey);
  window.addEventListener("resize", () => {
    if (!els.yazKeyboard.hidden) positionYazKeyboard();
  });
}

export { onEzberStudyTap, setupEzberReveal, startEzberOku, startEzberYaz, endEzberStudy, setupEzberYazKeyboard };
