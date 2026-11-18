// topics-modal.js -- "Konu Fihristi" modalı: konu çipleri, bir konunun ayrıntısı (ana / ilişkili / alt konu, ayet listesi) ve
// geri yığını. Veri js/topics.js'ten gelir.
//
// Çevrimsel içe aktarma: bu modül, başka uygulama modülleriyle birbirini içe aktarıyor. Bu güvenli, çünkü içe aktarılan adlar YALNIZCA
// işlev gövdelerinde (çağrı anında) kullanılıyor; modül değerlendirilirken, üst düzeyde, başka bir uygulama modülünden ad okumayın
// (test/modul_siniri_test.mjs bunu denetler; bkz. GELISTIRICI.md "Modül haritası").

import { ayahArabicText } from "./ayah-panel.js";
import { escapeHtml } from "./html.js";
import { getCachedMealData, getMealText, renderMealHTML } from "./meal.js";
import { closeModal, modalFocus, openModal } from "./modals.js";
import { goToAyah } from "./page.js";
import { els, state } from "./state.js";
import {
  getTopicsIndex,
  markArabicSpans,
  markTopicLinks,
  parseAyahsField,
  parseRelatedTopicsField,
  topicCategoryLabels,
} from "./topics.js";

// ---------------------------------------------------------------------
// "Konu Fihristi" modalı: ayet detay panelindeki bir konu etiketine (bkz.
// ayahTopicsRowHTML) ya da modal içindeki bir Ana Konu/İlişkili Konu/Alt
// Konu çipine veya açıklama metni içindeki <topic data-id> bağlantısına
// dokununca açılır/gezinir. Veri js/topics.js üzerinden, diğerleriyle aynı
// tembel-yükle-ve-önbelleğe-al düzeninde geliyor (bkz. openWordMeal'daki
// Promise.allSettled -- ilk ayet paneli açıldığında data/topics-tr.json
// (~950KB) indirilir, sonraki açılışlarda önbellekten anında gelir).
//
// Modal tek bir görünüm TÜRÜ etrafında kurulu -- "bir konunun ayrıntısı"
// -- Sure Bilgisi modalındaki #surah-info-body/#surah-info-detail gibi
// İKİ FARKLI türde kardeş panel yok, çünkü her gezinme adımı (ana konu,
// ilişkili konu, alt konu, açıklama içi bağlantı) hep AYNI türde bir
// hedefe gidiyor. Bunun yerine state.topicsModal.stack bir topic_id
// yığını tutuyor; her tıklama bir id daha PUSH ediyor, geri butonu POP
// ediyor, renderTopicsModalView de her seferinde yığının TEPESİNDEKİ
// konuyu #topics-modal-body'ye baştan basıyor -- böylece kaç adım
// gidilirse gidilsin geri her zaman tam bir adım geri götürüyor.
// <topics-modal>
// Bir konu çipinin HTML'i -- adı + parantez içinde o konuya bağlı ayet
// sayısı (182 konuda 0). Ana Konu/İlişkili Konu/Alt Konu çiplerinde
// (topicChipsHTML) VE ayet panelindeki "Konular" etiketlerinde
// (ayahTopicsRowHTML) aynı biçim kullanılıyor, tek bir yerden.
function topicChipHTML(t) {
  const count = parseAyahsField(t.ayahs).length;
  return `<button type="button" class="topic-chip" data-id="${t.topic_id}">${escapeHtml(t.name)} (${count})</button>`;
}

function topicChipsHTML(ids, index) {
  return ids
    .map((id) => index.byId.get(id))
    .filter(Boolean)
    .map(topicChipHTML)
    .join("");
}

function topicAyahRefLabel(surah, ayah) {
  const info = state.surahs[String(surah)];
  return info ? `${info.nameTurkish} ${ayah}` : `${surah}:${ayah}`;
}

// Bir konuya bağlı ayetlerin tamamı, alt alta -- her biri kendi Arapça
// metni (ayahArabicText, sayfa bağımsız) + kendi meali (meal.js,
// surah-info-detail'deki .info-detail-ayah düzeniyle birebir aynı) + kendi
// "Mushaf'ta Ayete Git" butonuyla.
function topicAyahListHTML(ayahList) {
  const mealData = getCachedMealData();
  return ayahList
    .map(({ surah, ayah }) => {
      const arabic = ayahArabicText(surah, ayah);
      const arabicHTML = arabic ? `<p class="ayah-arabic-text" lang="ar">${escapeHtml(arabic)}</p>` : "";
      return `
        <div class="info-detail-ayah">
          <div class="info-detail-ayah-ref">${escapeHtml(topicAyahRefLabel(surah, ayah))}</div>
          ${arabicHTML}
          ${renderMealHTML(getMealText(mealData, surah, ayah))}
          <div class="info-detail-ayah-actions">
            <button type="button" class="info-detail-goto-btn" data-goto-surah="${surah}" data-goto-ayah="${ayah}">Mushaf'ta Ayete Git</button>
          </div>
        </div>`;
    })
    .join("");
}

// Bir konunun tam ayrıntı görünümü: Arapça adı, Ontoloji/Tematik/Genel
// rozetleri, açıklama (varsa -- içindeki <topic data-id> bağlantıları ve
// .ar span'ları css/style.css'te stilleniyor, tıklaması aşağıdaki
// setupTopicsModal'daki genel [data-id] yakalayıcısından geçiyor), Ana
// Konu (parent_id/thematic_parent_id/ontology_parent_id -- ÜÇÜ DE ayrı
// ayrı gösterilir, tek bir kaydın birden fazlası dolu olabiliyor),
// İlişkili Konular (related_topics), Alt Konular (childrenOf -- QUL'un
// "Child Topics" listesinin karşılığı, kaynak veride ayrı bir alan değil,
// diğer kayıtların KENDİ ana konu alanlarının tersinden çıkarılıyor --
// bkz. topics.js buildTopicsIndex), en sonda o konuya bağlı ayetlerin
// tamamı. İsim modal başlığına ayrıca yazılıyor (bkz.
// renderTopicsModalView), burada tekrar edilmiyor.
function topicDetailBodyHTML(topicId) {
  const index = getTopicsIndex();
  const t = index && index.byId.get(topicId);
  if (!t) return `<p class="word-meal-loading">Konu bulunamadı.</p>`;

  const arabicNameHTML = t.arabic_name ? `<div class="info-name-arabic" lang="ar">${escapeHtml(t.arabic_name)}</div>` : "";

  const badgeClassFor = { Ontoloji: "ontology", Tematik: "thematic", Genel: "general" };
  const badgesHTML = `<div class="topic-badges">${topicCategoryLabels(t)
    .map((label) => `<span class="topic-badge topic-badge--${badgeClassFor[label]}">${label}</span>`)
    .join("")}</div>`;

  const descriptionHTML = t.description
    ? `<div class="wm-section"><div class="wm-section-label">Açıklama</div><div class="topic-description">${markTopicLinks(markArabicSpans(t.description))}</div></div>`
    : "";

  // Aynı id iki farklı ana-konu alanında birden görünmüyor (bkz.
  // test/topics_test.mjs), ama yine de Set ile tekilleştirmek ucuz ve
  // güvenli bir ek güvence.
  const parentIds = [...new Set([t.thematic_parent_id, t.ontology_parent_id, t.parent_id].filter((id) => id != null))];
  const parentHTML = parentIds.length
    ? `<div class="wm-section"><div class="wm-section-label">Ana Konu</div><div class="topic-chip-row">${topicChipsHTML(parentIds, index)}</div></div>`
    : "";

  const relatedIds = parseRelatedTopicsField(t.related_topics);
  const relatedHTML = relatedIds.length
    ? `<div class="wm-section"><div class="wm-section-label">İlişkili Konular</div><div class="topic-chip-row">${topicChipsHTML(relatedIds, index)}</div></div>`
    : "";

  const childIds = index.childrenOf.get(topicId) || [];
  const childHTML = childIds.length
    ? `<div class="wm-section"><div class="wm-section-label">Alt Konular</div><div class="topic-chip-row">${topicChipsHTML(childIds, index)}</div></div>`
    : "";

  const ayahList = parseAyahsField(t.ayahs).sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
  const ayahsHTML = `
    <div class="wm-section">
      <div class="wm-section-label">Ayetler${ayahList.length ? ` (${ayahList.length})` : ""}</div>
      ${ayahList.length ? topicAyahListHTML(ayahList) : `<p class="word-meal-empty">Bu konuya bağlı ayet bulunamadı.</p>`}
    </div>`;

  return `${arabicNameHTML}${badgesHTML}${descriptionHTML}${parentHTML}${relatedHTML}${childHTML}${ayahsHTML}`;
}

// Yığının tepesindeki konuyu başlığa/gövdeye basar; geri butonu yalnızca
// birden fazla adım gidilmişse görünür (kökten -- ayet panelindeki
// etiketten açılan ilk konudan -- geri, modalı kapatmak demektir, o da
// zaten X butonunda var).
function renderTopicsModalView() {
  const stack = state.topicsModal.stack;
  const topicId = stack[stack.length - 1];
  const index = getTopicsIndex();
  const t = index && index.byId.get(topicId);
  els.topicsModalTitle.textContent = t ? t.name : "Konu";
  els.topicsModalBack.hidden = stack.length <= 1;
  els.topicsModalBody.innerHTML = topicDetailBodyHTML(topicId);
  els.topicsModalBody.scrollTop = 0;
}

// Ayet panelindeki bir konu etiketinden -- her zaman KÖKTEN (yığın
// sıfırlanır) açılır. topics-tr.json bu noktada zaten yüklü olmak zorunda
// -- etiketin kendisi ancak veri yüklendikten sonra render ediliyor (bkz.
// ayahTopicsRowHTML), o yüzden burada ayrıca bir yükleniyor durumu yok.
function openTopicsModal(topicId) {
  state.topicsModal.stack = [topicId];
  renderTopicsModalView();
  openModal(els.topicsModal);
}

function pushTopicsModalTopic(topicId) {
  state.topicsModal.stack.push(topicId);
  renderTopicsModalView();
  // Gövde baştan basıldı: etkinleştirilen çip ya da bağlantı DOM'dan kalktı ve odak <body>'ye düşerdi (Chromium'da
  // ölçüldü: yeni konunun adını duyuracak bir odak değişimi yok, Tab bir sonraki görünümün ortasından sürüyor). Modal
  // açılırkenki gibi odağı kapsayıcıya al: yeni başlık ("Gayb, iletişim kutusu") okunur, Tab görünümün başından
  // (Geri düğmesi) sürer. Fareyle/dokunmayla de aynı yol; kapsayıcıda odak halkası yok (.modal-sheet:focus).
  modalFocus.enter(els.topicsModal);
}

function popTopicsModalTopic() {
  if (state.topicsModal.stack.length <= 1) return;
  state.topicsModal.stack.pop();
  renderTopicsModalView();
  // Geri'ye basılan düğme kökte gizleniyor (odaktayken gizlenince odak <body>'ye düşerdi: ekran okuyucu nerede
  // olduğunu kaybeder, Tab sayfanın başından sürer); ara adımlarda görünür kalıyor ama başlık sessizce değişirdi.
  // İkisinde de pushTopicsModalTopic'teki gibi odağı kapsayıcıya al: yeni başlık okunur, Tab görünümün başından sürer.
  modalFocus.enter(els.topicsModal);
}

function resetTopicsModal() {
  state.topicsModal.stack = [];
}

function setupTopicsModal() {
  els.topicsModalBack.addEventListener("click", popTopicsModalTopic);

  // Delegated: her renderTopicsModalView çağrısı #topics-modal-body'yi
  // baştan basıyor, o yüzden butonlara tek tek dinleyici eklemenin bir
  // anlamı yok -- openWordMealStructure'daki wm-tafsir-tab/topic-chip
  // yakalayıcısıyla aynı gerekçe.
  els.topicsModalBody.addEventListener("click", (e) => {
    const gotoBtn = e.target.closest(".info-detail-goto-btn");
    if (gotoBtn) {
      const surah = parseInt(gotoBtn.dataset.gotoSurah, 10);
      const ayah = parseInt(gotoBtn.dataset.gotoAyah, 10);
      goToAyah(surah, ayah);
      closeModal(els.topicsModal);
      return;
    }
    // Ana Konu/İlişkili Konu/Alt Konu çipleri (.topic-chip, data-id) VE
    // açıklama metni içindeki <topic data-id="X"> bağlantıları aynı
    // öznitelikle geliyor (ikincisi QUL'un kendi veri şeması, buradaki
    // çiplerin data-id'si de bilerek onunla eşleşecek şekilde seçildi --
    // bkz. topicChipsHTML), o yüzden tek bir [data-id] yakalayıcısı
    // ikisini de kapsıyor.
    const nav = e.target.closest("[data-id]");
    if (!nav) return;
    const id = parseInt(nav.getAttribute("data-id"), 10);
    if (Number.isInteger(id)) pushTopicsModalTopic(id);
  });

  // Açıklamadaki <topic data-id> bağlantıları odaklanabiliyor (markTopicLinks: role="link" tabindex="0") ama bir
  // <button> değiller: Enter'ı kendileri tıklamaya çevirmiyor. Yerel bir <a> gibi YALNIZCA Enter ile açılır
  // (Space değil; ARIA APG Link deseni). Tıklamayı yeniden kullanmak fare ve klavyeyi tek yola bağlıyor: yukarıdaki
  // [data-id] yakalayıcısı (yığına ekle + odağı kapsayıcıya al) iki durumda da aynı. data-id'siz <topic>
  // odaklanamaz, bu seçiciye girmez.
  els.topicsModalBody.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
    const link = e.target.closest && e.target.closest("topic[data-id]");
    if (!link) return;
    e.preventDefault();
    link.click();
  });
}
// </topics-modal>

export { topicChipHTML, openTopicsModal, resetTopicsModal, setupTopicsModal };
