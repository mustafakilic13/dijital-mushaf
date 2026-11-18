// app.js -- uygulamanın giriş noktası (index.html bunu <script type="module"> ile yükler).
//
// Uygulama kodu js/ altındaki odaklı modüllere bölünmüştür (bkz. GELISTIRICI.md "Modül haritası"). Burada yalnızca açılış var:
// main() verileri yükler, her modülün kurulum (setup*) işlevini çağırır ve ilk sayfayı gösterir.

import { setupArama } from "./arama.js";
import { ayahArabicText, ayahRawWordsAnywhere } from "./ayah-panel.js";
import { buildPageLookups, loadHarfBuzzAndFont, loadJSON } from "./data-load.js";
import { setupEzberModal } from "./ezber-modal.js";
import { setupEzberReveal, setupEzberYazKeyboard } from "./ezber-study.js";
import { loadMealData } from "./meal.js";
import { closeModal, openModal, setupModals } from "./modals.js";
import { setupNav } from "./page-nav.js";
import { getInitialPosition, goToAyah, goToJuzNum, goToPage, goToSurah, showPage } from "./page.js";
import { setupPlayback } from "./playback.js";
import { LineRenderer } from "./render.js";
import { els, state } from "./state.js";
import { setupSurahInfoModal } from "./surahinfo-modal.js";
import { loadTafsirData } from "./tafsir.js";
import { openTopicsModal, setupTopicsModal } from "./topics-modal.js";
import { loadTopicsData } from "./topics.js";
import { setupWakeLock } from "./wake-lock.js";
import { loadWordMealData } from "./wordmeal.js";

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
    setupTopicsModal();
    setupEzberModal();
    setupEzberReveal();
    setupEzberYazKeyboard();
    setupArama({
      modal: els.aramaModal,
      openBtn: els.aramaBtn,
      getSurahs: () => state.surahs,
      openModal: (onOpen) => openModal(els.aramaModal, { onOpen }),
      closeModal: () => closeModal(els.aramaModal),
      nav: { goToAyah, goToSurah, goToJuz: goToJuzNum, goToPage, openTopic: openTopicsModal },
      loadMealData,
      loadWordMealData,
      loadTopicsData,
      ayahRawWords: ayahRawWordsAnywhere,
      ayahArabicText,
      loadTafsirData: () => loadTafsirData("saadi"),
    });
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

// Ses dosyalarını (audio-cdn.tarteel.ai) çevrimdışı için dinlendikçe
// önbelleğe almak üzere sw.js'i kaydeder -- bkz. o dosyanın başlık yorumu.
// main()'in kritik yolunu bloklamasın diye ayrı ve "fire and forget";
// desteklenmeyen bir tarayıcıda ya da kayıt başarısız olursa uygulama
// olağan (çevrimiçi, önbelleksiz) şekilde çalışmaya devam eder.
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("sw.js").catch((err) => {
    console.warn("Servis worker kaydı başarısız (ses çevrimdışı önbelleklemesi devre dışı kalacak)", err);
  });
}

main();
registerServiceWorker();
