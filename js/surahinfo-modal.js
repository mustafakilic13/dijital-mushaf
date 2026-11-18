// surahinfo-modal.js -- "Sure Bilgisi" modalı (sure başlığı kutusuna dokununca): istatistik şeridi, bölümler ve ayet / sure
// bağlantılarının modal içi ayrıntı görünümü. Veri js/surahinfo.js'ten gelir.
//
// Çevrimsel içe aktarma: bu modül, başka uygulama modülleriyle birbirini içe aktarıyor. Bu güvenli, çünkü içe aktarılan adlar YALNIZCA
// işlev gövdelerinde (çağrı anında) kullanılıyor; modül değerlendirilirken, üst düzeyde, başka bir uygulama modülünden ad okumayın
// (test/modul_siniri_test.mjs bunu denetler; bkz. GELISTIRICI.md "Modül haritası").

import { ayahArabicText, WORD_MEAL_LOADING_HTML } from "./ayah-panel.js";
import { escapeHtml } from "./html.js";
import { getCachedMealData, getMealText, isMealDataReady, loadMealData, renderMealHTML } from "./meal.js";
import { closeModal, modalFocus, openModal } from "./modals.js";
import { goToAyah, goToSurah } from "./page.js";
import { els, state } from "./state.js";
import {
  getCachedSurahInfoData,
  getSurahInfoEntry,
  isSurahInfoDataReady,
  loadSurahInfoData,
  parseInfoLink,
  splitInfoSections,
} from "./surahinfo.js";

// ---------------------------------------------------------------------
// "Sure Bilgisi" modalı: sayfadaki sure başlığı kutusuna dokununca açılır
// (bkz. render.js drawSurahHeader'ın çizdiği .surah-header-hit hedefi ve
// js/page-nav.js'teki els.pageContainer "click" işleyicisi). Veri js/surahinfo.js
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
  const nameHTML = meta && meta.nameArabic ? `<div class="info-name-arabic" lang="ar">${escapeHtml(meta.nameArabic)}</div>` : "";
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

// Sure Bilgisi içeriğindeki <a href> hedefleri (js/surahinfo.js
// parseInfoLink) QUL'un site-içi linkleri -- bu uygulamada karşılıkları
// yok, o yüzden normal link gibi takip edilirse 404 veriyordu (bkz.
// parseInfoLink'in başındaki yorum). Onun yerine tıklamayı burada
// yakalayıp modal içinde, geri gidilebilir bir alt-görünümde
// (#surah-info-detail) karşılıyoruz: #surah-info-body ile #surah-info-detail
// aynı modal içinde iki kardeş panel, sadece biri her zaman [hidden] --
// "geri" ana içeriği YENİDEN KURMUYOR, sadece tekrar gösteriyor, o yüzden
// kullanıcının orada bıraktığı kaydırma konumu (ve açık akordeon
// bölümleri) olduğu gibi duruyor.
//
// Odak: iki geçişte de odaktaki öğe az önce gizlenen panelin içinde kalıyordu
// (bağlantıya Enter -> #surah-info-body gizleniyor; Geri'ye Enter ->
// #surah-info-detail gizleniyor) ve Chromium'da ölçülen sonuç aynıydı: odak
// <body>'ye düşüyor, ekran okuyucu yeni görünümü duymuyor, Tab görünümün
// ortasından sürüyor. showSurahInfoDetail ayrıntıya girerken odağı modalın
// kapsayıcısına alır (Konu Fihristi'ndeki pushTopicsModalTopic gibi);
// backFromSurahInfoDetail Geri'de odağı ayrıntıyı açan bağlantıya geri verir.
// test/sure_bilgisi_odak_test.mjs bu bloğu iki işaret arasından çıkarıp
// jsdom'da çalıştırıyor -- işaretleri silmeyin.
// <surah-info-detail>
let surahInfoDetailRequestId = 0;
// Ayrıntı görünümünü açan bağlantı (#surah-info-body içinde). null: açan yok
// (görünüm kapalı) ya da bağlantı yok sayıldı.
let surahInfoLinkOpener = null;

function showSurahInfoDetail(bodyHTML) {
  // Ana içerikten ayrıntıya geçiş mi, yoksa görünüm zaten açıkken içerik mi
  // yenileniyor ("Yükleniyor…" -> ayetlerin meali)? İkincisinde odağa
  // dokunulmaz: kullanıcı bu arada Geri'ye ya da bir düğmeye gelmiş olabilir.
  const entering = els.surahInfoDetail.hidden;
  els.surahInfoDetailBody.innerHTML = bodyHTML;
  els.surahInfoBody.hidden = true;
  els.surahInfoDetail.hidden = false;
  // Etkinleştirilen bağlantı az önce gizlenen #surah-info-body'deydi: odağı
  // modal açılırkenki gibi kapsayıcıya al ("3. Âl-i İmrân, iletişim kutusu"
  // okunur; Tab görünümün başından -- Kapat, Geri -- sürer).
  if (entering) modalFocus.enter(els.surahInfoModal);
}

// Genel sıfırlama: Geri düğmesi ve modal kapanışı (closeModal) aynı yoldan
// geçiyor; odak taşıma işi burada DEĞİL (kapanan modalda odağa dokunulmaz).
function closeSurahInfoDetail() {
  surahInfoDetailRequestId++; // olası bir loadMealData().then() devamını geçersiz kılar (aşağıdaki openSurahInfoLink'e bkz.)
  surahInfoLinkOpener = null;
  els.surahInfoDetail.hidden = true;
  els.surahInfoBody.hidden = false;
}

// "Geri" düğmesi. Ana içerik yeniden kurulmadan geri geliyor (kaydırma konumu
// ve açık bölümler yerinde), yani ayrıntıyı açan bağlantı hâlâ orada: odak
// ona dönsün, okuyucu kaldığı yerden sürsün. Kapsayıcıya dönmek, bazı
// surelerde 13-18 bağlantılı bir metinde Tab'la en baştan başlamak demek
// olurdu. Bağlantı yoksa ya da odak alamıyorsa kapsayıcı (Geri düğmesi
// gizlendi, odak <body>'ye düşmesin).
function backFromSurahInfoDetail() {
  const link = surahInfoLinkOpener; // closeSurahInfoDetail temizlemeden ÖNCE al
  closeSurahInfoDetail();
  if (link) link.focus(); // DOM'dan kalkmış ya da odak alamayan bağlantıda sessizce işe yaramaz
  if (!link || document.activeElement !== link) modalFocus.enter(els.surahInfoModal);
}

function surahInfoDetailSurahHTML(surahNum) {
  const meta = state.surahs[String(surahNum)];
  const label = meta ? `${surahNum}. ${meta.nameTurkish} Sûresi` : `${surahNum}. Sûre`;
  return `
    <div class="info-detail-surah">
      <div class="info-detail-surah-label">${escapeHtml(label)}</div>
      <button type="button" class="info-detail-goto-btn" data-goto-surah="${surahNum}">Mushaf'a Sureye Git</button>
    </div>`;
}

// ayahStart===ayahEnd için tek ayet, farklıysa aralık -- ikisi de (ve
// dipnot linkleri de, parseInfoLink'te aynı "ayah" şekline indirgendiği
// için) buradan geçiyor: aralıktaki HER ayet kendi Arapça metni (bkz.
// ayahArabicText -- Konu Fihristi'nin ayet listesiyle aynı) + kendi
// Elmalılı meali + kendi "git" butonuyla ayrı ayrı listeleniyor.
function surahInfoDetailAyahHTML(surah, ayahStart, ayahEnd) {
  const data = getCachedMealData();
  const meta = state.surahs[String(surah)];
  let html = "";
  for (let a = ayahStart; a <= ayahEnd; a++) {
    const ref = meta ? `${meta.nameTurkish} ${a}` : `${surah}:${a}`;
    const arabic = ayahArabicText(surah, a);
    const arabicHTML = arabic ? `<p class="ayah-arabic-text" lang="ar">${escapeHtml(arabic)}</p>` : "";
    html += `
      <div class="info-detail-ayah">
        <div class="info-detail-ayah-ref">${escapeHtml(ref)}</div>
        ${arabicHTML}
        ${renderMealHTML(getMealText(data, surah, a))}
        <div class="info-detail-ayah-actions">
          <button type="button" class="info-detail-goto-btn" data-goto-surah="${surah}" data-goto-ayah="${a}">Mushaf'ta Ayete Git</button>
        </div>
      </div>`;
  }
  return html;
}

function openSurahInfoLink(target) {
  if (target.type === "surah") {
    showSurahInfoDetail(surahInfoDetailSurahHTML(target.surah));
    return;
  }
  const requestId = ++surahInfoDetailRequestId;
  const render = () => {
    // kullanıcı geri gitmiş ya da bu arada başka bir linke tıklamışsa
    // (closeSurahInfoDetail / bir sonraki openSurahInfoLink çağrısı
    // requestId'yi zaten ilerletmiş olur), bu artık bayat -- ekranı
    // güncelleme.
    if (surahInfoDetailRequestId !== requestId) return;
    showSurahInfoDetail(surahInfoDetailAyahHTML(target.surah, target.ayahStart, target.ayahEnd));
  };
  if (isMealDataReady()) {
    render();
  } else {
    showSurahInfoDetail(WORD_MEAL_LOADING_HTML);
    loadMealData()
      .then(render)
      .catch(() => {
        if (surahInfoDetailRequestId !== requestId) return;
        els.surahInfoDetailBody.innerHTML = `<p class="word-meal-loading">Yüklenemedi, lütfen tekrar deneyin.</p>`;
      });
  }
}

function setupSurahInfoModal() {
  // Akordeon bölümlerinin açık/kapalı durumu ayrıca state'te tutulmuyor --
  // sadece kendi .info-section-panel'inin sınıfında; modal her açıldığında
  // surahInfoBodyHTML zaten sıfırdan kuruluyor, bir önceki surenin açık
  // bıraktığı bölümler otomatik olarak sıfırlanmış oluyor.
  els.surahInfoBody.addEventListener("click", (e) => {
    const toggle = e.target.closest(".info-section-toggle");
    if (toggle) {
      const panel = toggle.nextElementSibling;
      const open = panel.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      return;
    }
    const link = e.target.closest("a[href]");
    if (!link) return;
    e.preventDefault();
    const target = parseInfoLink(link.getAttribute("href"));
    if (!target) return;
    surahInfoLinkOpener = link; // Geri'de odak ona dönecek (openSurahInfoLink'ten ÖNCE: ayrıntı hemen açılabilir)
    openSurahInfoLink(target);
  });

  els.surahInfoDetailBack.addEventListener("click", backFromSurahInfoDetail);

  els.surahInfoDetail.addEventListener("click", (e) => {
    const btn = e.target.closest(".info-detail-goto-btn");
    if (!btn) return;
    const surah = parseInt(btn.dataset.gotoSurah, 10);
    const ayah = btn.dataset.gotoAyah ? parseInt(btn.dataset.gotoAyah, 10) : null;
    if (ayah) goToAyah(surah, ayah);
    else goToSurah(surah);
    closeModal(els.surahInfoModal);
  });
}
// </surah-info-detail>

export { openSurahInfo, closeSurahInfoDetail, setupSurahInfoModal };
