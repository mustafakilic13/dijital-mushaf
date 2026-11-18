// announce.js -- ekran okuyucu anonsları için tek canlı bölge (#nav-announcer).

import { els, state } from "./state.js";

// Ekran okuyucu anonsları için TEK canlı bölge: #nav-announcer. Sayfa/ayet her
// değiştiğinde (goToPage/goToSurah/goToAyah/goToJuz vb. -- hepsi showPage'e
// çıkıyor) ve ayet paneli açılıp kapanınca buraya kısa bir anons yazılır; ekran
// okuyucu kullanıcısı "nereye gittim" diye mushaf metnini taramak zorunda
// kalmasın.
//
// #page-container'ın KENDİSİ canlı bölge DEĞİL (bkz. index.html). Eskiden
// aria-live="polite" taşıyordu; ama sayfa her değiştiğinde yeniden kurulan SVG'nin
// görünmez metin katmanı (sayfa başına ~1200 karakter Arapça) "eklenen içerik"
// sayılıp baştan sona okutuluyor, 37 karakterlik gerçek anons onun yanında
// kayboluyordu; ayet paneli açılıp kapanırken de sayfa metni (üst + alt dilim)
// yeniden okunuyordu. Panelin KENDİ dinamik içeriği için canlı bölge artık yalnızca
// panel gövdesinde (bkz. openWordMealStructure).
//
// Önce boşaltıp KISA BİR GECİKMEYLE asıl metni yazıyoruz -- art arda AYNI
// sayfaya/sureye gidilirse (metin değişmeden kalırsa) birçok ekran okuyucu
// değişmeyen bir aria-live içeriğini sessizce yok sayar; önce boşaltmak her
// seferinde gerçek bir DOM değişikliği garantiler.
//
// Aynı ~50 ms penceresinde gelen FARKLI anonslar (bir ayete dokununca hem "Sayfa
// N, ... ayet" hem "... detayı açıldı") tek metinde birleşir -- yoksa ikincisi
// birincinin yerine yazılır ve biri hiç duyulmaz. Aynı `key` ile gelen yeni anons
// bekleyen eskisinin YERİNE geçer (tuşa basılı tutarak sayfa çevirirken yalnızca
// sonuncusu söylenir). test/erisilebilirlik_test.mjs bu bloğu iki işaret
// arasından çıkarıp Node'da çalıştırıyor -- işaretleri silmeyin.
// <announce>
const pendingAnnouncements = new Map();
let announceTimer = null;
function announce(text, key) {
  pendingAnnouncements.set(key, text);
  if (announceTimer !== null) return; // zaten planlı bir yazma var; bu anons da onunla birlikte gidecek
  els.navAnnouncer.textContent = "";
  announceTimer = setTimeout(() => {
    els.navAnnouncer.textContent = [...pendingAnnouncements.values()].join(". ");
    pendingAnnouncements.clear();
    announceTimer = null;
  }, 50);
}

function announceNavigation() {
  const { surah, ayah } = state.selectedAyah;
  const surahInfo = state.surahs[String(surah)];
  const surahName = surahInfo ? surahInfo.nameTurkish : "";
  announce(`Sayfa ${state.currentPage}, ${surahName} Suresi, ${ayah}. ayet`, "nav");
}
// </announce>

export { announce, announceNavigation };
