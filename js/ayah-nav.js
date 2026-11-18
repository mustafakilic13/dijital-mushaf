// ayah-nav.js -- ayet gezgini bağlantısı (js/ayet-gezgini.js, index.html #ayah-nav): sayfadaki ayetlere ve sure başlıklarına
// klavye / ekran okuyucu yolu.
//
// Çevrimsel içe aktarma: bu modül, başka uygulama modülleriyle birbirini içe aktarıyor. Bu güvenli, çünkü içe aktarılan adlar YALNIZCA
// işlev gövdelerinde (çağrı anında) kullanılıyor; modül değerlendirilirken, üst düzeyde, başka bir uygulama modülünden ad okumayın
// (test/modul_siniri_test.mjs bunu denetler; bkz. GELISTIRICI.md "Modül haritası").

import { onAyahTextClick } from "./ayah-panel.js";
import { ayahsOnPage, createAyahNav, revealDelta, surahsOfSvg } from "./ayet-gezgini.js";
import { showPage } from "./page.js";
import { els, state } from "./state.js";
import { openSurahInfo } from "./surahinfo-modal.js";

// ---------------------------------------------------------------------
// Ayet gezgini (js/ayet-gezgini.js, index.html #ayah-nav): sayfadaki ayetlere ve sure başlıklarına
// klavye / ekran okuyucu yolu. Burası yalnızca bağlantı: gezgin ayetleri ve başlıkları düğme olarak
// sunuyor; seçim ve panel mantığı fareyle tıklamayla AYNI yoldan (showPage / onAyahTextClick /
// openSurahInfo) geçiyor, yani iki yol birbirinden ayrışamaz. test/ayet_gezgini_test.mjs bu bloğu
// iki işaret arasından çıkarıp Node'da çalıştırıyor -- işaretleri silmeyin.
// ---------------------------------------------------------------------
// <ayah-nav>
function surahNameOf(n) {
  const info = state.surahs[String(n)];
  return info ? info.nameTurkish : String(n);
}

const ayahNav = createAyahNav(document, els.ayahNav, {
  surahName: surahNameOf,
  onSelect: (ayah) => showPage(state.currentPage, { ayah, skipHash: true }),
  onActivate: (ayah) => activateAyahFromNav(ayah),
  onOpenSurahInfo: (surah) => openSurahInfo(surah),
  onFocusTarget: (target) => markAyahNavFocus(target),
});

// Gezginin durumunu (liste, seçili ayet, panel açık mı) uygulamanın durumuyla eşitler: showPage'in
// sonunda, panel açılıp kapanınca ve Ezber başlayıp bitince. restoreFocus: odak, kaldırılmak üzere
// olan bir yerdeydi (panel ya da sayfa SVG'si): <body>'ye düşmesin, seçili ayet düğmesine gitsin.
// Ezber çalışırken gezgin gizli: orada ayete dokunmak kelime açmak demek, panel değil.
function syncAyahNav({ restoreFocus = false } = {}) {
  ayahNav.sync({
    visible: !!state.currentPageSvg && !state.ezberStudy,
    ayahs: ayahsOnPage(state.currentPageSegments),
    surahs: surahsOfSvg(state.currentPageSvg),
    selected: state.selectedAyah,
    expanded: state.wordMeal.open ? state.wordMeal.ayah : null,
    restoreFocus,
  });
}

// Dikey bir aralığı okuyucunun görünür alanına getirir (okuyucunun kendi kaydırıcısı: .reader-scroll).
function revealRects(rects) {
  const scroller = els.readerScroll;
  if (!scroller || !rects.length) return;
  const view = scroller.getBoundingClientRect();
  const rect = { top: Math.min(...rects.map((r) => r.top)), bottom: Math.max(...rects.map((r) => r.bottom)) };
  const delta = revealDelta(rect, view, 16);
  if (delta) scroller.scrollTop += delta;
}

// Odak gezgine girince / gezgin içinde taşınınca: sure başlığına odak halkası (.kbd-focus) ve hedef
// görünür alanın dışındaysa kaydırma. Ayet halkası CSS'te (#ayah-nav[data-kbd]) seçili ayetin vurgusuna
// çiziliyor; burada yalnızca o vurgunun ekrana getirilmesi gerekiyor. target null: odak gezginden çıktı.
let ayahNavMarkedHeader = null;
function markAyahNavFocus(target) {
  if (ayahNavMarkedHeader) {
    ayahNavMarkedHeader.classList.remove("kbd-focus");
    ayahNavMarkedHeader = null;
  }
  const svg = state.currentPageSvg;
  if (!target || !svg) return;
  // Yalnızca klavye odağında (gezgin data-kbd'yi yalnızca :focus-visible iken koyuyor): fareyle "Kapat"a
  // basınca odak programatik olarak ayet düğmesine geçer, ama o kullanıcının sayfası kaymamalı, başlığa
  // halka çizilmemeli.
  if (!els.ayahNav.hasAttribute("data-kbd")) return;
  if (target.kind === "surah") {
    const g = [...svg.querySelectorAll(".surah-header-hit")].find((el) => el.getAttribute("data-surah") === String(target.surah));
    if (!g) return;
    g.classList.add("kbd-focus");
    ayahNavMarkedHeader = g;
    revealRects([g.getBoundingClientRect()]);
    return;
  }
  revealRects([...svg.querySelectorAll(".ayah-highlight")].map((r) => r.getBoundingClientRect()));
}

// Ayet düğmesinde Enter/Space (ya da ekran okuyucunun "etkinleştir"i): fareyle ayete dokunmakla AYNI yol
// (onAyahTextClick: seçili değilse seç + aç, açıksa kapat). Tek fark: panel AÇILDIYSA odak panelin içine
// alınır. Ekran okuyucu "Bakara 255 detayı, bölge" der, klavye kullanıcısı Tab ile panelin düğmelerine
// geçer ve Escape ile kapatınca odak bu ayet düğmesine döner (closeWordMeal). Panel KAPANDIYSA odak zaten
// ayet düğmesinde, dokunulmaz.
async function activateAyahFromNav(hit) {
  await onAyahTextClick(hit);
  const wm = state.wordMeal;
  if (wm.open && wm.panelEl && wm.ayah && wm.ayah.surah === hit.surah && wm.ayah.ayah === hit.ayah) {
    focusWordMealPanel(wm.panelEl);
  }
}

function focusWordMealPanel(panelEl) {
  panelEl.tabIndex = -1; // programatik odak için; Tab sırasına girmez
  panelEl.focus({ preventScroll: true });
  // Açılış animasyonu (grid-template-rows) bitmeden panelin yüksekliği henüz yok: kaydırma bitince yapılıyor.
  // transitionend gelmezse (animasyon kapalı, sekme arka planda) kapanıştaki gibi bir zamanlayıcı yedeği.
  let done = false;
  const reveal = () => {
    if (done) return;
    done = true;
    panelEl.removeEventListener("transitionend", onEnd);
    if (panelEl.isConnected && state.wordMeal.panelEl === panelEl) revealRects([panelEl.getBoundingClientRect()]);
  };
  const onEnd = (e) => {
    if (e.target === panelEl && e.propertyName === "grid-template-rows") reveal();
  };
  panelEl.addEventListener("transitionend", onEnd);
  setTimeout(reveal, 400);
}
// </ayah-nav>

export { syncAyahNav };
