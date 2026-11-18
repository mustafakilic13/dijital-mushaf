// modal-lists.js -- Sure ve Cüz/Hizb/Rub/Menzil modallarının listeleri: sure satırları ve (tembel kurulan) ayet düğmesi ızgarası,
// birim listeleri, Cüz modalının sekmeleri ve etkin ayet düğmesinin işaretlenmesi.

import { syncGridStop } from "./izgara-gezintisi.js";
import { surahLabel } from "./lookup.js";
import { els, state } from "./state.js";

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
        <span class="modal-item-arabic" lang="ar">${info.nameArabic}</span>
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
    // Adlı grup: odak ızgaraya girince ekran okuyucu hangi surenin ayetleri olduğunu söyler ("Bakara Suresi ayetleri, grup").
    // Izgara rolsüz ve adsız bir <div> idi (erişilebilirlik ağacında yok sayılıyordu); rolsüz <div>'de aria-label geçersiz, o
    // yüzden role="group" ile birlikte. 114 ızgaranın hepsine baştan yazılıyor: açılış/kapanışta ayrıca bir iş gerekmiyor.
    ayahGrid.setAttribute("role", "group");
    ayahGrid.setAttribute("aria-label", `${info.nameTurkish} Suresi ayetleri`);
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
    const info = state.surahs[String(surahNum)];
    const frag = document.createDocumentFragment();
    for (let a = 1; a <= info.versesCount; a++) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ayah-chip";
      chip.textContent = a;
      // Görünen metin yalnızca sayı: ekran okuyucu düğmeyi "3, düğme" diye okuyordu (hangi sure?). Ad, ayet
      // gezgininin düğmeleriyle aynı biçimde ve görünen sayıyı içeriyor (WCAG 2.5.3, ad görünen etiketi kapsasın).
      chip.setAttribute("aria-label", `${info.nameTurkish} Suresi, ${a}. ayet`);
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
  // Izgaranın tek Tab durağı (roving tabindex, js/izgara-gezintisi.js): seçili ayet, yoksa ilk düğme; ızgara her açılışta oradan başlar.
  syncGridStop(gridEl);
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

// Etkin ayet düğmesi (ve js/modals.js'teki setActiveModalItem'daki etkin satır) yalnızca renkle (.active) değil aria-current ile de
// bildirilir: ekran okuyucu "geçerli" der. Gerçek Chromium'da (430 px) etkin satır/düğmenin erişilebilirlik düğümünde hiçbir
// durum yoktu. İkisi hep birlikte değişir (.active <=> aria-current="true"); özniteliğin boş değeri ("") "false" sayılır, o
// yüzden toggleAttribute değil setAttribute/removeAttribute.
function setActiveAyahChip(gridEl, ayahNum) {
  gridEl.querySelectorAll(".ayah-chip").forEach((chip) => {
    const on = parseInt(chip.dataset.ayah, 10) === ayahNum;
    chip.classList.toggle("active", on);
    if (on) chip.setAttribute("aria-current", "true");
    else chip.removeAttribute("aria-current");
  });
  // Izgaranın tek Tab durağı seçili ayetle AYNI yerde, AYNI anda ayarlanıyor (js/izgara-gezintisi.js).
  syncGridStop(gridEl);
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
      gridEl.querySelectorAll(".ayah-chip.active").forEach((c) => {
        c.classList.remove("active");
        c.removeAttribute("aria-current");
      });
      syncGridStop(gridEl);
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
        <span class="modal-item-arabic" lang="ar">${surahLabel(surahNum).replace(/^\d+\.\s*/, "")}</span>
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
    if (tabBtn) {
      tabBtn.setAttribute("aria-selected", active ? "true" : "false");
      tabBtn.tabIndex = active ? 0 : -1; // roving tabindex: sekme çubuğu tek Tab durağı (js/sekme-gezintisi.js)
    }
    if (panel) panel.hidden = !active;
  }
  const shownPanel = els[`${tabName}List`];
  const activeItem = shownPanel && shownPanel.querySelector(".modal-item.active");
  if (activeItem && activeItem.scrollIntoView) activeItem.scrollIntoView({ block: "center" });
}

export {
  populateSurahList,
  toggleAyahGrid,
  closeAllAyahGrids,
  syncAyahGridHighlight,
  populateUnitList,
  populateJuzList,
  switchJuzTab,
};
