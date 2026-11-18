// modals.js -- modal açma/kapama (odak yönetimi dahil), etkin satır işaretleme ve tüm modalların düğme / Esc / arka plan
// kablolaması (setupModals).
//
// Çevrimsel içe aktarma: bu modül, başka uygulama modülleriyle birbirini içe aktarıyor. Bu güvenli, çünkü içe aktarılan adlar YALNIZCA
// işlev gövdelerinde (çağrı anında) kullanılıyor; modül değerlendirilirken, üst düzeyde, başka bir uygulama modülünden ad okumayın
// (test/modul_siniri_test.mjs bunu denetler; bkz. GELISTIRICI.md "Modül haritası").

import { closeWordMeal } from "./ayah-panel.js";
import { closeEzberPicker, switchEzberTab } from "./ezber-modal.js";
import { setupGridNav } from "./izgara-gezintisi.js";
import { listRows, setupListNav, syncListStop } from "./liste-gezintisi.js";
import { currentHizbNumber, currentJuzNumber, currentManzilNumber, currentRubNumber } from "./lookup.js";
import {
  closeAllAyahGrids,
  populateJuzList,
  populateSurahList,
  populateUnitList,
  switchJuzTab,
  toggleAyahGrid,
} from "./modal-lists.js";
import { createModalFocus } from "./modal-odak.js";
import { goToAyah, goToHizbNum, goToJuzNum, goToManzilNum, goToPage, goToRubNum, goToSurah } from "./page.js";
import { setupTablist } from "./sekme-gezintisi.js";
import { els, state } from "./state.js";
import { closeSurahInfoDetail } from "./surahinfo-modal.js";
import { resetTopicsModal } from "./topics-modal.js";

// Etkin satır: .active (görünüm) ile aria-current="true" (ekran okuyucu) birlikte, bkz. js/modal-lists.js'teki setActiveAyahChip'in üstündeki not.
// Sure, Cüz/Hizb/Rub/Menzil listelerinin ve Ezber'in Sure/Kârî seçicilerinin hepsi buradan geçiyor.
function setActiveModalItem(listEl, matchAttr, value) {
  listEl.querySelectorAll(".modal-item").forEach((item) => {
    const on = item.dataset[matchAttr] === String(value);
    item.classList.toggle("active", on);
    if (on) item.setAttribute("aria-current", "true");
    else item.removeAttribute("aria-current");
  });
  // Listenin tek Tab durağı (roving tabindex, js/liste-gezintisi.js) etkin satırla AYNI yerde, AYNI anda ayarlanıyor: liste her
  // açılışta durak şu anki satırda başlar, ok tuşlarıyla gezilen son satırda değil (hiçbiri etkin değilse ilk hücre).
  syncListStop(listEl);
  const active = listEl.querySelector(".modal-item.active");
  if (active && active.scrollIntoView) active.scrollIntoView({ block: "center" });
}

// Modal odak yönetimi (bkz. js/modal-odak.js): açılışta odak modalın içine girer,
// Tab modalın içinde döner, kapanışta odak modalı açan öğeye geri döner.
const modalFocus = createModalFocus(document, () => state.openModalEl);

function openModal(modalEl, { onOpen } = {}) {
  // Başka bir modalın içinden açılıyorsa (arama -> konu) en baştaki açan öğe korunur. Açan öğe,
  // closeAllModals()'tan ÖNCE yakalanmalı: sonrasında odak hâlâ eski modalın içinde olurdu.
  modalFocus.remember({ keepExisting: !!state.openModalEl });
  closeAllModals({ restoreFocus: false }); // yeni modala geçiliyor: odağı eski açana geri verme
  state.openModalEl = modalEl;
  els.modalBackdrop.hidden = false;
  modalEl.hidden = false;
  // onOpen'dan ÖNCE: arama modalı onOpen içinde kendi giriş alanına odaklanıyor, bu onu ezmemeli.
  modalFocus.enter(modalEl);
  // next frame, so the hidden->visible change doesn't get collapsed into
  // the transform transition (no "from" state to animate from otherwise)
  requestAnimationFrame(() => {
    els.modalBackdrop.classList.add("open");
    modalEl.classList.add("open");
  });
  if (onOpen) onOpen();
}

function closeModal(modalEl, { restoreFocus = true } = {}) {
  if (!modalEl || modalEl.hidden) return;
  modalEl.classList.remove("open");
  els.modalBackdrop.classList.remove("open");

  // Reset any per-modal transient state so it isn't still showing the next
  // time the modal reopens -- generic so it applies no matter which path
  // closed the modal (backdrop, X, Escape, or picking an item, all of
  // which funnel through here).
  closeAllAyahGrids(); // Sure modalindeki açık ayet ızgaraları
  if (modalEl === els.surahInfoModal) closeSurahInfoDetail(); // Sure Bilgisi hep ana içerikte açılsın, kaldığı linkte değil
  if (modalEl === els.topicsModal) resetTopicsModal(); // Konu Fihristi hep kök konudan açılsın, kaldığı alt konuda değil
  if (modalEl === els.juzModal) switchJuzTab("juz"); // Cüz modalı hep "Cüz" sekmesinde açılsın
  if (modalEl === els.ezberModal) {
    // Önce seçici: açık olduğu sekmenin formunu geri getiriyor; switchEzberTab SONRA çalışmalı, yoksa Oku/Yaz'da
    // seçici açıkken kapatılan modal bir sonraki açılışta Dinle formuyla birlikte o sekmenin formunu da gösterirdi.
    closeEzberPicker(); // sure/kârî seçici listesi değil, ilgili formu göstersin
    switchEzberTab("dinle"); // Ezber modalı hep Dinle sekmesinde açılsın
  }

  // wait for the slide/fade transition to actually finish before hiding,
  // with a fallback in case transitionend doesn't fire (reduced-motion,
  // already mid-transition, etc.)
  const finish = () => {
    // Kapanış animasyonu sürerken modal YENİDEN açıldıysa (Escape, hemen ardından Enter: odak artık açan
    // düğmede olduğu için klavyeyle mümkün) eski kapanışın zamanlayıcısı onu gizlemesin. Gizlerse modal
    // görünmez ama "açık" kalır, perde ekranda takılır ve Escape bile çalışmaz (closeModal gizli modalı atlıyor).
    if (state.openModalEl === modalEl) return;
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
  if (state.openModalEl === modalEl) {
    state.openModalEl = null;
    // state.openModalEl temizlendikten SONRA: odak modalın içine geri çeken güvenlik ağı artık bu modalı korumuyor.
    if (restoreFocus) modalFocus.restore();
  }
}

function closeAllModals({ restoreFocus = true } = {}) {
  [els.surahModal, els.juzModal, els.pageModal, els.ezberModal, els.surahInfoModal, els.topicsModal, els.aramaModal].forEach((m) => closeModal(m, { restoreFocus }));
}

function setupModals() {
  populateSurahList();
  populateJuzList();
  populateUnitList(els.hizbList, state.hizb, 60, "hizb");
  populateUnitList(els.rubList, state.rub, 240, "rub");
  populateUnitList(els.manzilList, state.manzil, 7, "manzil");

  // Ok tuşu gezintisi + tek Tab durağı (js/liste-gezintisi.js). Sure listesinde bir satır iki hücre (sure düğmesi + "ayetlerini
  // listele"); açılan ayet ızgarasındaki düğmeler (.ayah-chip) bu gezintiye girmiyor, onlarınki ayrı (js/izgara-gezintisi.js).
  setupListNav(els.surahList, listRows(els.surahList, ".modal-item, .surah-expand-btn", ".surah-row"));
  for (const listEl of [els.juzList, els.hizbList, els.rubList, els.manzilList]) setupListNav(listEl, listRows(listEl, ".modal-item"));
  // Ayet düğmeleri ızgarası: tek Tab durağı + iki boyutlu ok tuşu gezintisi. Izgaralar tembel kurulduğu için dinleyici Sure listesinde (olay devri).
  setupGridNav(els.surahList);

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
  // Sol/Sağ/Home/End ile sekmeler arası gezinti (APG "Tabs", otomatik etkinleştirme)
  setupTablist(els.juzTabs, (tabBtn) => switchJuzTab(tabBtn.dataset.tab));

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

  // Ok işlevi: click olayı closeAllModals'a seçenek nesnesi olarak geçmesin.
  els.modalBackdrop.addEventListener("click", () => closeAllModals());
  document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => closeAllModals()));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (state.openModalEl) closeAllModals();
    else if (state.wordMeal.open) closeWordMeal();
  });
}

export { setActiveModalItem, modalFocus, openModal, closeModal, setupModals };
