// ezber-modal.js -- Ezber modalı: Dinle / Oku / Yaz sekmeleri, kayıtlı ayarlar, Sure ve Kârî seçicileri, aralık doğrulama ve
// başlat düğmeleri (setupEzberModal). Çalışan oturumlar js/ezber-play.js (Dinle) ve js/ezber-study.js (Oku / Yaz) içinde.
//
// Çevrimsel içe aktarma: bu modül, başka uygulama modülleriyle birbirini içe aktarıyor. Bu güvenli, çünkü içe aktarılan adlar YALNIZCA
// işlev gövdelerinde (çağrı anında) kullanılıyor; modül değerlendirilirken, üst düzeyde, başka bir uygulama modülünden ad okumayın
// (test/modul_siniri_test.mjs bunu denetler; bkz. GELISTIRICI.md "Modül haritası").

import { startEzberPlayback } from "./ezber-play.js";
import { endEzberStudy, startEzberOku, startEzberYaz } from "./ezber-study.js";
import { listRows, setupListNav } from "./liste-gezintisi.js";
import { closeModal, modalFocus, openModal, setActiveModalItem } from "./modals.js";
import { RECITERS } from "./playback.js";
import { setupTablist } from "./sekme-gezintisi.js";
import { els, state } from "./state.js";

// ---------------------------------------------------------------------
// Ezber modal: Dinle / Oku / Yaz. All three share the same Sure picker
// (see openEzberPicker) and the same "auto-fill from/to with that
// surah's first ayah on pick" behaviour (this message's 2nd request).
// Oku/Yaz's actual reveal-as-you-go study sessions live in js/ezber-study.js (see
// startEzberOku/startEzberYaz) -- this block is just their modal/settings
// plumbing, same shape as Dinle's.
// ---------------------------------------------------------------------
const EZBER_TABS = ["dinle", "oku", "yaz"];
function switchEzberTab(tabName) {
  for (const name of EZBER_TABS) {
    const tabBtn = document.getElementById(`ezber-tab-${name}`);
    const panel = document.getElementById(`ezber-panel-${name}`);
    const active = name === tabName;
    if (tabBtn) {
      tabBtn.setAttribute("aria-selected", active ? "true" : "false");
      tabBtn.tabIndex = active ? 0 : -1; // roving tabindex: sekme çubuğu tek Tab durağı (js/sekme-gezintisi.js)
    }
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

// Ezber seçicileri: Sure (Dinle/Oku/Yaz'da ortak liste) ve Kârî (yalnızca Dinle). İkisi de aynı kalıp: alan düğmesi
// (.ezber-picker-btn) sekme çubuğunu ve sekmenin formunu gizleyip yerine alt-görünüm listeyi (.ezber-picker) gösterir;
// bir satıra dokunmak ya da Geri alanı değiştirip formu geri getirir. Kârî eskiden yerel <select>ti (Sure'den farklı
// bir denetim: açılır pencere, ok tuşuyla değer değiştirme, ayrı görünüm); şimdi Sure'nin birebir aynısı.
//
// Odak: iki seçicide de, düğmeye Enter (ya da dokunuş) ve Geri/satır seçimi odaktaki öğeyi gizlenen bölümün içinde
// bırakıyordu. Gerçek Chromium'da ölçülen durum (430 px, yalnızca Tab ve Enter): Sure düğmesine Enter -> odak <body>
// (ekran okuyucu seçicinin açıldığını duymuyor); Geri'ye ya da bir sureye Enter -> yine <body>, sonraki Tab formun
// başına değil sayfanın altındaki "Kaynak Kod" bağlantısına gidiyor (kullanıcı formdaki yerini kaybediyor). Düzeltme
// konu modalındaki ve Sure Bilgisi ayrıntısındaki kalıpla aynı: seçiciye GİRERKEN odak seçicinin kapsayıcısına alınır
// ("Sure Seç, grup" ya da "Kârî Seç, grup" okunur; Tab Geri'den sürer), Geri'de ve satır seçiminde odak seçiciyi
// açan düğmeye döner (etiket yeni değeri okur). Modal kapanırken (closeModal) odağa dokunulmaz: modal-odak.js
// onu modalı açan düğmeye geri veriyor.
//
// Mevcut satır: setActiveModalItem seçili satırı ortalamak için scrollIntoView çağırıyor, ama seçici hâlâ `hidden`
// iken çağrılıyordu (düzen yok, hiçbir şey yapmıyor): gerçek Chromium'da 60. sure seçiliyken liste hep en baştan
// açılıyordu, etkin satır 3605 px aşağıda kalıyordu. Artık seçici görünür olduktan SONRA çağrılıyor.
//
// test/ezber_secici_test.mjs bu bloğu iki işaret arasından çıkarıp jsdom'da çalıştırıyor -- işaretleri silmeyin.
// <ezber-picker>

// Bir sekmenin aralık alanlarındaki özel doğrulama iletisini siler (readEzberRange yazıyor, yalnızca Bitiş alanına). İleti
// kendiliğinden kalkmıyor ve tarayıcının kendi doğrulaması gönderme olayından ÖNCE çalışıyor: bayat bir ileti, aralık
// düzeltilse bile, iletiyi yeniden hesaplayan tek yer olan gönderme işleyicisinin hiç çalışmamasına yol açıyordu. Gerçek
// Chromium'da (430 px, üç sekmede de) ölçülen durum: 5-2 gönder, 1-3'e düzelt (yazarak, Yukarı okla ya da Başlangıç'ı
// değiştirerek), yeniden gönder (Uygula ya da Enter) -> modal açık kalır, Bitiş hâlâ geçersiz, ileti hâlâ "Bitiş ayeti,
// başlangıç ayetinden küçük olamaz."; Esc ile kapatıp yeniden açmak da kurtarmıyordu (kayıtlı geçerli aralıkla bile).
// Yalnızca Sure'yi yeniden seçmek (aşağıda) iletiyi siliyordu. Artık Başlangıç/Bitiş düzenlenince, modal açılınca ve Sure
// seçilince siliniyor.
function clearEzberRangeError(target) {
  document.getElementById(`ezber-${target}-from`).setCustomValidity("");
  document.getElementById(`ezber-${target}-to`).setCustomValidity("");
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
    clearEzberRangeError(target);
  }
}

// Kârî alanı (gizli giriş + görünen düğme etiketi), Sure alanının aynısı. Değer RECITERS anahtarı ("husary").
function setEzberReciter(target, reciterKey) {
  document.getElementById(`ezber-${target}-reciter`).value = reciterKey;
  document.getElementById(`ezber-${target}-reciter-btn-text`).textContent = RECITERS[reciterKey].label;
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
        <span class="modal-item-arabic" lang="ar">${info.nameArabic}</span>
        <span class="modal-item-sub">${info.nameTurkish} · ${info.versesCount} ayet</span>
      </span>`;
    frag.appendChild(btn);
  }
  document.getElementById("ezber-surah-picker-list").appendChild(frag);
}

// Kârî listesi: her satır tek satırlık bir .modal-item (Sure satırlarının Arapça ad + alt satırı yok).
function populateEzberReciterPickerList() {
  const frag = document.createDocumentFragment();
  for (const [key, reciter] of Object.entries(RECITERS)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "modal-item";
    btn.dataset.reciter = key;
    const main = document.createElement("span");
    main.className = "modal-item-main";
    const title = document.createElement("span");
    title.className = "modal-item-title";
    title.textContent = reciter.label;
    main.appendChild(title);
    btn.appendChild(main);
    frag.appendChild(btn);
  }
  document.getElementById("ezber-reciter-picker-list").appendChild(frag);
}

// Açık seçici: { kind: "surah" | "reciter", target: "dinle" | "oku" | "yaz", opener: düğme } ya da null (kapalı).
// kind kimliklerin ve satırların data özniteliğinin de adı (#ezber-<kind>-picker, data-<kind>, #ezber-<sekme>-<kind>-btn).
// Sure için tek paylaşılan liste (114 satır) var, her sekme için ayrı değil.
let ezberPicker = null;

function openEzberPicker(kind, target) {
  const picker = document.getElementById(`ezber-${kind}-picker`);
  ezberPicker = { kind, target, opener: document.getElementById(`ezber-${target}-${kind}-btn`) };
  els.ezberTabs.hidden = true;
  document.getElementById(`ezber-panel-${target}`).hidden = true;
  picker.hidden = false;
  // Görünür olduktan SONRA: hidden bir listede scrollIntoView hiçbir şey yapmıyor (bkz. js/modal-lists.js'te switchJuzTab'ın üstündeki not).
  setActiveModalItem(document.getElementById(`ezber-${kind}-picker-list`), kind, document.getElementById(`ezber-${target}-${kind}`).value);
  picker.focus({ preventScroll: true }); // az önce gizlenen düğmede kalmasın: odak <body>'ye düşerdi
}

// restoreFocus: Geri ve satır seçimi odağı seçiciyi açan düğmeye geri verir. Varsayılan KAPALI: closeModal'ın
// sıfırlaması da buradan geçiyor ve kapanan modalda odağa dokunulmaz. Bir tıklama olayını seçenek nesnesi olarak
// geçmeyin (closeAllModals'taki gibi): hep `() => closeEzberPicker({ restoreFocus: true })`.
function closeEzberPicker({ restoreFocus = false } = {}) {
  const open = ezberPicker;
  ezberPicker = null;
  document.getElementById("ezber-surah-picker").hidden = true;
  document.getElementById("ezber-reciter-picker").hidden = true;
  els.ezberTabs.hidden = false;
  if (!open) return;
  document.getElementById(`ezber-panel-${open.target}`).hidden = false;
  if (!restoreFocus) return;
  open.opener.focus();
  // Düğme odak alamadıysa (kopmuş/gizli/devre dışı) odak <body>'ye düşmesin: modalın kapsayıcısına
  if (document.activeElement !== open.opener) modalFocus.enter(els.ezberModal);
}
// </ezber-picker>

// Validates a tab's From/To pair against the selected surah's ayah count;
// returns {surah,from,to} on success or null (and reports the error on
// the `to` field, matching the browser's own validation-bubble style --
// see the Dinle submit handler this was factored out of) on failure.
// Bu iletiyi kaldıran yer clearEzberRangeError (alanlar düzenlenince, modal açılınca, Sure seçilince): burada yalnızca
// yazılıyor ve her çağrıda baştan hesaplanıyor.
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
  populateEzberReciterPickerList();
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
        setEzberReciter("dinle", d && Object.hasOwn(RECITERS, d.reciter) ? d.reciter : "husary"); // hasOwn: "toString" gibi bozuk bir kayıt kârî sayılmasın
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

        // Önceki açılıştan kalan bayat uyarı yeni (geçerli) değerleri kilitlemesin
        for (const target of EZBER_TABS) clearEzberRangeError(target);
      },
    });
  });

  els.ezberTabs.addEventListener("click", (e) => {
    const tabBtn = e.target.closest(".tab-bar-btn");
    if (tabBtn) switchEzberTab(tabBtn.dataset.tab);
  });
  setupTablist(els.ezberTabs, (tabBtn) => switchEzberTab(tabBtn.dataset.tab));

  for (const target of EZBER_TABS) {
    document.getElementById(`ezber-${target}-surah-btn`).addEventListener("click", () => openEzberPicker("surah", target));
  }
  document.getElementById("ezber-dinle-reciter-btn").addEventListener("click", () => openEzberPicker("reciter", "dinle"));
  for (const kind of ["surah", "reciter"]) {
    document.getElementById(`ezber-${kind}-picker-back`).addEventListener("click", () => closeEzberPicker({ restoreFocus: true }));
    // Oklar + tek Tab durağı (js/liste-gezintisi.js); durak, seçici her açılışta şu anki satıra konuyor (setActiveModalItem).
    const pickerList = document.getElementById(`ezber-${kind}-picker-list`);
    setupListNav(pickerList, listRows(pickerList, ".modal-item"));
    pickerList.addEventListener("click", (e) => {
      const item = e.target.closest(".modal-item");
      if (!item || !ezberPicker || ezberPicker.kind !== kind) return;
      if (kind === "surah") setEzberSurah(ezberPicker.target, parseInt(item.dataset.surah, 10), { autofillRange: true });
      else setEzberReciter(ezberPicker.target, item.dataset.reciter);
      closeEzberPicker({ restoreFocus: true });
    });
  }

  // Aralık düzenlenince eski uyarı kalkar: readEzberRange iletiyi yalnızca gönderme işleyicisinde yeniden hesaplıyor, ama
  // tarayıcının kendi doğrulaması bayat iletiyle göndermeyi işleyici çalışmadan engelliyordu (bkz. clearEzberRangeError).
  // `input`: yazma, sayı oklarıyla artırma/azaltma, yapıştırma ve silme hepsi bu olayı üretiyor.
  for (const target of EZBER_TABS) {
    for (const field of ["from", "to"]) {
      document.getElementById(`ezber-${target}-${field}`).addEventListener("input", () => clearEzberRangeError(target));
    }
  }

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

export { switchEzberTab, closeEzberPicker, setupEzberModal };
