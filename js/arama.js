// arama.js
//
// "Arama" modalının ARAYÜZ katmanı (alt çubuktaki Arama düğmesi). Saf
// mantık -- normalleştirme, sorgu ayrıştırma, sure eşleştirme, dizin,
// vurgu, son aramalar -- js/search.js'te; burada yalnızca DOM, olaylar ve
// veri yükleme var. app.js'e bağımlı değil: gereken her şey setupArama'ya
// parametre olarak geliyor (openModal/closeModal, goTo* gezinme
// fonksiyonları, veri yükleyiciler), o yüzden test/arama_ui_test.mjs
// gerçek index.html'i jsdom'a yükleyip app.js'i (HarfBuzz/WASM açılışı
// yüzünden Node'da import edilemiyor) hiç çalıştırmadan sınayabiliyor.
//
// Ekran iki durumlu: kutu boşken "ilk ekran" (son aramalar + popüler
// konular + ipucu), doluyken sonuçlar. Sonuç bölümleri sırayla:
//   Git          -- sorgu bir hedefe dönüşüyorsa (2:255, Bakara 255, cüz 3, sayfa 50 ...)
//   Sureler      -- ad eşleşmesi
//   Konular      -- Konu Fihristi'nde konu ADINA göre; tıklayınca konu modalı açılır
//   Ayetler      -- meal içinde tam metin (kelime başı eşleşme + kök varyantları)
//   Kelime meali -- kelime kartlarında (data/word-meal.json) eşleşen Arapça kelime + karşılığı
//   Arapça metin -- sorguda Arap harfi varsa ayetin Arapça metninde (harekesiz yazılan da
//                   harekeli metni bulur); bu durumda meal/kelime meali aranmaz
//   Tefsir       -- Sa'dî tefsirinde tam metin; ~8 MB olduğu için YALNIZCA kullanıcı
//                   "Tefsirde de ara"ya dokununca indirilir/dizinlenir (oturum boyunca açık kalır)
// Her bölüm önce kısa bir önizleme (Sureler 3, Konular 3, Ayetler 5, Kelime 3
// satır) gösterir, "Tümünü gör" bölümü yerinde açar (25'er satır,
// "Daha fazla göster"); yalnız TEK bölüm varsa doğrudan açık gelir.
// Konular/Kelime meali ikincil kaynaklar: yüklenemezse sessizce atlanır,
// meal (birincil) ve tefsir (kullanıcı istedi) yüklenemezse hata notu gösterilir.
//
// Neden bottom-sheet ve neden yeni bir "tam ekran" değil: uygulamadaki
// bütün modaller .modal-sheet; arama da aynı kalıpta, yalnızca daha uzun
// (mobilde neredeyse tüm ekran). Ekran klavyesi açılınca sheet'in alt
// kenarı klavyenin üstüne oturuyor (visualViewport, bkz. syncViewport)
// -- yoksa sonuçların yarısı klavyenin altında kalırdı.
import {
  parseSearchQuery,
  createSurahMatcher,
  buildTextIndex,
  mealEntries,
  searchTextIndex,
  buildWordIndex,
  searchWordIndex,
  glossMatches,
  isArabicScript,
  buildTextIndexAsync,
  htmlToPlainText,
  tafsirEntries,
  buildTopicsSearchIndex,
  searchTopics,
  findTopicByName,
  snippetHTML,
  normalizeRecentQuery,
  sanitizeRecent,
  addRecentQuery,
  removeRecentQuery,
  escapeHtml,
} from "./search.js";
import { buildWordMealCards } from "./wordmeal.js";

export const RECENT_KEY = "quran-reader-arama-recent-v1";
export const DEBOUNCE_MS = 120;
export const PAGE = 25; // bölüm açılınca ilk sayfa; "Daha fazla göster" bu kadar ekler
export const PREVIEW = { surah: 3, topic: 3, ayah: 5, word: 3, arabic: 3, tafsir: 3 }; // kapalı bölümde satır sayısı
export const LIST_LIMIT = { surah: 114, topic: 100, ayah: 1000, word: 300, arabic: 500, tafsir: 300 }; // aramadan istenen en fazla satır
export const WORD_CARDS_SHOWN = 3; // kelime meali satırında gösterilen eşleşen kart
// Gerçekten Konu Fihristi'nde adıyla bulunan konular (ör. "Şükür"/"Tevekkül"
// bu adla yok) -- tıklayınca doğrudan konu modalı açılır.
export const POPULAR_TOPICS = ["Sabır", "Namaz", "Dua", "Tevbe", "Zekât", "Cennet"];

const ICON = {
  clock: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  chevron: '<svg class="arama-go" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function loadRecent(storage) {
  try {
    return sanitizeRecent(JSON.parse(storage.getItem(RECENT_KEY)));
  } catch {
    return [];
  }
}
function saveRecent(storage, list) {
  try {
    storage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // özel gezinti / dolu depo: son aramalar yalnızca bu oturumda kalır
  }
}

// Tembel yükleyici: load() veriyi bir kez getirir ve build ile dizine çevirir;
// eşzamanlı çağrılar aynı Promise'i paylaşır. Başarısızlıkta Promise
// sıfırlanır (sonraki çağrı yeniden dener); `blockOnFail` ikincil kaynaklar
// için: bir başarısızlıktan sonra unblock() gelene kadar (modal yeniden
// açılana kadar) ağa hiç dokunmaz -- çevrimdışıyken her tuşta boşuna istek
// atılmasın.
function lazy(loadFn, buildFn, { blockOnFail = false } = {}) {
  let value = null;
  let promise = null;
  let blocked = false;
  return {
    get: () => value,
    unblock: () => { blocked = false; },
    load() {
      if (value) return Promise.resolve(value);
      if (blocked) return Promise.reject(new Error("blocked"));
      if (!promise) {
        promise = Promise.resolve()
          .then(loadFn)
          .then((data) => buildFn(data))
          .then((built) => (value = built))
          .catch((err) => {
            promise = null;
            if (blockOnFail) blocked = true;
            throw err;
          });
      }
      return promise;
    },
  };
}

// deps: { modal, openBtn, getSurahs, openModal(onOpen), closeModal(),
//   nav: { goToAyah, goToSurah, goToJuz, goToPage, openTopic },
//   loadMealData, loadWordMealData, loadTopicsData, ayahRawWords(surah, ayah),
//   ayahArabicText(surah, ayah), loadTafsirData(), storage? } -> { open, dispose }
export function setupArama(deps) {
  const { modal, openBtn, nav } = deps;
  const storage = deps.storage || globalThis.localStorage;
  const win = modal.ownerDocument.defaultView;
  const form = modal.querySelector(".arama-form");
  const input = modal.querySelector(".arama-input");
  const clearBtn = modal.querySelector(".arama-clear");
  const body = modal.querySelector(".arama-body");
  const status = modal.querySelector(".arama-status");

  const matcher = createSurahMatcher(deps.getSurahs());
  const st = {
    token: 0,
    timer: null,
    expanded: new Set(), // açık bölüm anahtarları
    shown: {}, // açık bölümde gösterilen satır sayısı
    result: null,
    tafsirOn: false, // kullanıcı "Tefsirde de ara"ya dokundu (oturum boyunca açık)
    recent: loadRecent(storage),
  };

  // -- veri ---------------------------------------------------------------
  const meal = lazy(deps.loadMealData, (data) => {
    const index = buildTextIndex(mealEntries(data));
    const pos = new Map();
    for (let i = 0; i < index.size; i++) pos.set(index.surah[i] * 1000 + index.ayah[i], i);
    return { index, pos };
  });
  const topics = lazy(deps.loadTopicsData, buildTopicsSearchIndex, { blockOnFail: true });
  const words = lazy(deps.loadWordMealData, (data) => ({ data, index: buildWordIndex(data) }), { blockOnFail: true });

  // Arapça metin dizini: mushaf.json zaten bellekte, ağ yok -- ilk Arapça
  // sorguda kurulur (6236 ayet, ~50 ms).
  const arabic = lazy(
    () => {
      const surahs = deps.getSurahs();
      const entries = [];
      for (let s = 1; s <= 114; s++) {
        for (let a = 1; a <= surahs[String(s)].versesCount; a++) {
          const text = deps.ayahArabicText(s, a);
          if (text) entries.push({ surah: s, ayah: a, text });
        }
      }
      return entries;
    },
    (entries) => buildTextIndex(entries)
  );
  // Tefsir: düz metin dizini parça parça kurulur (arayüz donmasın), orijinal
  // metin dizinde SAKLANMAZ -- gösterilecek satırın metni yüklü veriden üretilir.
  const tafsir = lazy(deps.loadTafsirData, async (data) => ({
    data,
    index: await buildTextIndexAsync(tafsirEntries(data), { textOf: (e) => htmlToPlainText(e.html) }),
  }));

  function mealTextFor(surah, ayah) {
    const m = meal.get();
    if (!m) return "";
    const i = m.pos.get(surah * 1000 + ayah);
    return i === undefined ? "" : m.index.raw[i];
  }

  // -- görünüm parçaları ----------------------------------------------------
  const esc = escapeHtml;
  const sectionHead = (title, count, extra) =>
    `<div class="arama-section-head"><h3 class="arama-section-title">${esc(title)}</h3>${
      count ? `<span class="arama-count">${esc(count)}</span>` : ""
    }${extra || ""}</div>`;

  function homeHTML() {
    let html = "";
    if (st.recent.length) {
      html += sectionHead("Son aramalar", "", `<button type="button" class="arama-link" data-act="clear-recent">Temizle</button>`);
      for (const q of st.recent) {
        html +=
          `<div class="arama-recent">` +
          `<button type="button" class="arama-recent-main" data-act="recent" data-q="${esc(q)}">${ICON.clock}<span>${esc(q)}</span></button>` +
          `<button type="button" class="arama-recent-x" data-act="recent-remove" data-q="${esc(q)}" aria-label="${esc(q)} aramasını sil">${ICON.x}</button>` +
          `</div>`;
      }
    }
    html += sectionHead("Popüler konular");
    html += `<div class="topic-chip-row arama-chips">${POPULAR_TOPICS.map(
      (t) => `<button type="button" class="topic-chip" data-act="chip" data-q="${esc(t)}">${esc(t)}</button>`
    ).join("")}</div>`;
    html += `<p class="arama-hint">Doğrudan gitmek için “2:255”, “Bakara 255”, “cüz 30” veya “sayfa 50” yazın.</p>`;
    return html;
  }

  function jumpRowHTML(j) {
    let title;
    let sub;
    let attrs;
    if (j.type === "ayah") {
      title = `${matcher.label(j.surah)} suresi, ${j.ayah}. ayet`;
      sub = mealTextFor(j.surah, j.ayah) || "Ayete git";
      attrs = `data-act="go-ayah" data-surah="${j.surah}" data-ayah="${j.ayah}"`;
    } else if (j.type === "surah") {
      title = `${matcher.label(j.surah)} suresi`;
      sub = j.hint || `${matcher.versesCount(j.surah)} ayet · Sureye git`;
      attrs = `data-act="go-surah" data-surah="${j.surah}"`;
    } else if (j.type === "juz") {
      title = `${j.n}. cüz`;
      sub = "Cüze git";
      attrs = `data-act="go-juz" data-n="${j.n}"`;
    } else {
      title = `${j.n}. sayfa`;
      sub = "Sayfaya git";
      attrs = `data-act="go-page" data-n="${j.n}"`;
    }
    return (
      `<button type="button" class="modal-item arama-jump" ${attrs}>` +
      `<span class="modal-item-main"><span class="arama-jump-title">${esc(title)}</span>` +
      `<span class="modal-item-sub arama-jump-sub">${esc(sub)}</span></span>${ICON.chevron}</button>`
    );
  }

  function surahRowHTML(hit) {
    const s = deps.getSurahs()[String(hit.surah)];
    return (
      `<button type="button" class="modal-item" data-act="go-surah" data-surah="${hit.surah}">` +
      `<span class="modal-item-num">${hit.surah}</span>` +
      `<span class="modal-item-main"><span class="modal-item-arabic">${esc(s.nameArabic)}</span>` +
      `<span class="modal-item-sub">${esc(s.nameTurkish)} · ${s.versesCount} ayet</span></span></button>`
    );
  }

  function topicRowHTML(t, terms) {
    return (
      `<button type="button" class="modal-item arama-jump arama-topic" data-act="go-topic" data-id="${t.id}">` +
      `<span class="modal-item-main"><span class="arama-jump-title">${snippetHTML(t.name, terms)}</span>` +
      `<span class="modal-item-sub">${t.ayahCount} ayet · ${esc(t.categories.join(" · "))}</span></span>${ICON.chevron}</button>`
    );
  }

  function ayahRowHTML(item, terms) {
    return (
      `<button type="button" class="modal-item arama-ayah" data-act="go-ayah" data-surah="${item.surah}" data-ayah="${item.ayah}">` +
      `<span class="arama-ayah-ref">${esc(matcher.label(item.surah))} · ${item.surah}:${item.ayah}</span>` +
      `<span class="arama-snippet">${snippetHTML(meal.get().index.raw[item.i], terms)}</span></button>`
    );
  }

  // Ayetin kelime kartlarından eşleşenler: Arapça kelime + vurgulu karşılığı
  // (ayet panelindeki .wbw-* kartlarıyla aynı görünüm).
  function wordRowHTML(item, terms) {
    const { surah, ayah } = item;
    const cards = buildWordMealCards(deps.ayahRawWords(surah, ayah), words.get().data, surah, ayah);
    const hit = cards.filter((c) => c.translation && glossMatches(c.translation, terms));
    const cardsHTML =
      hit
        .slice(0, WORD_CARDS_SHOWN)
        .map(
          (c) =>
            `<span class="wbw-word"><span class="wbw-ar" lang="ar">${esc(c.arabic)}</span>` +
            `<span class="wbw-tr">${snippetHTML(c.translation, terms)}</span></span>`
        )
        .join("") + (hit.length > WORD_CARDS_SHOWN ? `<span class="arama-wm-more">+${hit.length - WORD_CARDS_SHOWN}</span>` : "");
    return (
      `<button type="button" class="modal-item arama-ayah" data-act="go-ayah" data-surah="${surah}" data-ayah="${ayah}">` +
      `<span class="arama-ayah-ref">${esc(matcher.label(surah))} · ${surah}:${ayah}</span>` +
      `<span class="wbw-container arama-wbw">${cardsHTML}</span></button>`
    );
  }

  function arabicRowHTML(item, terms) {
    return (
      `<button type="button" class="modal-item arama-ayah" data-act="go-ayah" data-surah="${item.surah}" data-ayah="${item.ayah}">` +
      `<span class="arama-ayah-ref">${esc(matcher.label(item.surah))} · ${item.surah}:${item.ayah}</span>` +
      `<span class="arama-snippet arama-snippet--ar" dir="rtl" lang="ar">${snippetHTML(arabic.get().raw[item.i], terms, { maxLen: 170, lead: 40 })}</span></button>`
    );
  }

  function tafsirRowHTML(item, terms) {
    const entry = tafsir.get().data[`${item.surah}:${item.ayah}`];
    const plain = htmlToPlainText(entry && entry.text);
    return (
      `<button type="button" class="modal-item arama-ayah" data-act="go-ayah" data-surah="${item.surah}" data-ayah="${item.ayah}">` +
      `<span class="arama-ayah-ref">${esc(matcher.label(item.surah))} · ${item.surah}:${item.ayah}</span>` +
      `<span class="arama-snippet">${snippetHTML(plain, terms, { maxLen: 260, lead: 80 })}</span></button>`
    );
  }

  // Tefsir isteğe bağlı: henüz açılmadıysa/hata varsa sonuçların altında bir
  // düğme. Bu düğme yalnızca tafsirState "off"/"error" iken render edilir --
  // ikisi de tafsir.load()'ın hiç başarıyla tamamlanmadığı (dolayısıyla
  // tafsir.get()'in hep null olduğu) durumlar, o yüzden boyut uyarısı
  // koşulsuz gösterilir.
  function tafsirButtonHTML() {
    return `<button type="button" class="arama-more arama-tafsir-btn" data-act="tafsir-load">Sa'dî tefsirinde de ara <span class="arama-tafsir-size">(≈8 MB indirilir)</span></button>`;
  }

  // Bir bölüm: başlık + sayaç, kapalıyken önizleme + "Tümünü gör", açıkken
  // sayfalı liste + "Daha fazla göster"/"Daralt".
  function sectionHTML(sec, forceOpen) {
    const { key, items, total } = sec;
    const open = forceOpen || st.expanded.has(key);
    const shown = open ? Math.min(st.shown[key] || PAGE, items.length) : Math.min(PREVIEW[key], items.length);
    const collapse =
      open && !forceOpen && items.length > PREVIEW[key]
        ? `<button type="button" class="arama-link" data-act="collapse" data-key="${key}">Daralt</button>`
        : "";
    let html = sectionHead(sec.title, `${total} sonuç`, collapse);
    if (sec.note) html += `<p class="arama-note">${esc(sec.note)}</p>`;
    for (let k = 0; k < shown; k++) html += sec.row(items[k]);
    if (!open && items.length > shown) {
      html += `<button type="button" class="arama-more" data-act="expand" data-key="${key}">Tümünü gör (${total})</button>`;
    } else if (open && shown < items.length) {
      html += `<button type="button" class="arama-more" data-act="more" data-key="${key}">Daha fazla göster (${items.length - shown})</button>`;
    } else if (open && total > items.length) {
      html += `<p class="arama-note">İlk ${items.length} sonuç gösteriliyor — aramayı daraltmak için kelime ekleyin.</p>`;
    }
    return html;
  }

  function resultsHTML() {
    const { parsed, surahHits, ayah, topics: topicHits, words: wordHits, arabic: arabicHits, tafsir: tafsirHits, mealState, tafsirState } = st.result;
    const terms = parsed.terms;
    const latin = terms.filter((t) => !isArabicScript(t));
    const arabicTerms = terms.filter(isArabicScript);
    let html = "";

    if (parsed.jumps.length) html += sectionHead("Git") + parsed.jumps.map(jumpRowHTML).join("");

    const sections = [];
    if (surahHits.length) sections.push({ key: "surah", title: "Sureler", total: surahHits.length, items: surahHits, row: surahRowHTML });
    if (topicHits && topicHits.total) sections.push({ key: "topic", title: "Konular", total: topicHits.total, items: topicHits.items, row: (t) => topicRowHTML(t, terms) });
    if (ayah && ayah.total) {
      sections.push({
        key: "ayah",
        title: "Ayetler",
        total: ayah.total,
        items: ayah.items,
        row: (it) => ayahRowHTML(it, latin),
        note: ayah.relaxed ? "Tüm kelimeleri içeren ayet yok; bir kısmını içerenler gösteriliyor." : "",
      });
    }
    if (wordHits && wordHits.total) sections.push({ key: "word", title: "Kelime meali", total: wordHits.total, items: wordHits.items, row: (it) => wordRowHTML(it, latin) });
    if (arabicHits && arabicHits.total) sections.push({ key: "arabic", title: "Arapça metin", total: arabicHits.total, items: arabicHits.items, row: (it) => arabicRowHTML(it, arabicTerms) });
    if (tafsirHits && tafsirHits.total) {
      sections.push({
        key: "tafsir",
        title: "Tefsir (Sa'dî)",
        total: tafsirHits.total,
        items: tafsirHits.items,
        row: (it) => tafsirRowHTML(it, latin),
        note: tafsirHits.relaxed ? "Tüm kelimeleri içeren yorum yok; bir kısmını içerenler gösteriliyor." : "",
      });
    }

    // Tek bölüm varsa taranacak başka içerik yok: doğrudan açık gelsin.
    const lone = sections.length === 1 && mealState === "ready";
    for (const sec of sections) html += sectionHTML(sec, lone);
    // Ayet bölümü henüz yokken (meal yükleniyor / yüklenemedi) yerine not gösterilir.
    if (latin.length && !(ayah && ayah.total)) {
      if (mealState === "loading") html += sectionHead("Ayetler") + `<p class="arama-note">Meal yükleniyor…</p>`;
      else if (mealState === "error") html += sectionHead("Ayetler") + `<p class="arama-note arama-note--error">Meal yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.</p>`;
    }

    if (tafsirState === "loading") {
      html += sectionHead("Tefsir (Sa'dî)") + `<p class="arama-note">Tefsir yükleniyor… (ilk seferde birkaç saniye sürebilir)</p>`;
    } else if (tafsirState === "error") {
      html += sectionHead("Tefsir (Sa'dî)") + `<p class="arama-note arama-note--error">Tefsir yüklenemedi. Bağlantınızı kontrol edip yeniden deneyin.</p>`;
    }
    const canTafsir = latin.length > 0 && tafsirState !== "loading" && (tafsirState === "off" || tafsirState === "error");

    const found = parsed.jumps.length + sections.length;
    if (!found && mealState === "ready") {
      if (!parsed.jumps.length && !terms.length) {
        html = `<p class="arama-note">Geçerli bir sure adı, ayet numarası (2:255) ya da en az iki harflik bir kelime yazın.</p>`;
      } else {
        html =
          `<div class="arama-empty"><p class="arama-empty-title">“${esc(st.result.query)}” için sonuç bulunamadı.</p>` +
          `<p class="arama-hint">Sure adı, ayet numarası (2:255) veya mealde geçen bir kelime deneyin.</p></div>`;
      }
    }
    if (canTafsir) html += tafsirButtonHTML();
    return html;
  }

  function statusText() {
    const r = st.result;
    if (!r) return "";
    if (r.mealState === "loading") return "Meal yükleniyor";
    const parts = [];
    if (r.parsed.jumps.length) parts.push(`${r.parsed.jumps.length} hedef`);
    if (r.surahHits.length) parts.push(`${r.surahHits.length} sure`);
    if (r.topics && r.topics.total) parts.push(`${r.topics.total} konu`);
    if (r.ayah && r.ayah.total) parts.push(`${r.ayah.total} ayet`);
    if (r.words && r.words.total) parts.push(`${r.words.total} kelime meali eşleşmesi`);
    if (r.arabic && r.arabic.total) parts.push(`${r.arabic.total} Arapça metin eşleşmesi`);
    if (r.tafsir && r.tafsir.total) parts.push(`${r.tafsir.total} tefsir eşleşmesi`);
    if (r.tafsirState === "loading") return "Tefsir yükleniyor";
    return parts.length ? `${parts.join(", ")} bulundu` : "Sonuç bulunamadı";
  }

  function render(keepScroll) {
    const prev = body.scrollTop;
    body.innerHTML = st.result ? resultsHTML() : homeHTML();
    body.scrollTop = keepScroll ? prev : 0;
    if (status) status.textContent = statusText();
  }

  // -- arama ------------------------------------------------------------------
  // Mevcut kutu içeriğini yeniden hesaplar ve çizer. Sayfalama/açık bölüm
  // durumuna dokunmaz (bir kaynağın yüklenmesi bitince aynı ekran tazelenirken
  // kullanıcının açtığı bölüm kapanmasın); o sıfırlama runNow'da.
  function compute(keepScroll) {
    const raw = input.value;
    const q = normalizeRecentQuery(raw);
    clearBtn.hidden = !raw;
    if (!q) {
      st.result = null;
      render(false);
      return;
    }
    const token = st.token;
    const parsed = parseSearchQuery(raw, matcher);
    const terms = parsed.terms;
    const latin = terms.filter((t) => !isArabicScript(t));
    const arabicTerms = terms.filter(isArabicScript);
    const res = {
      query: q,
      parsed,
      surahHits: terms.length ? matcher.match(terms) : [],
      ayah: null,
      topics: null,
      words: null,
      arabic: null,
      tafsir: null,
      mealState: "ready",
      tafsirState: "off",
    };
    st.result = res;
    if (terms.length) {
      const refresh = () => {
        if (token === st.token) compute(true);
      };
      // Meal / kelime meali / tefsir Türkçe: yalnızca Latin terimlerle aranır
      // (Arapça sorguda hiç yüklenmez); Arapça metin yalnızca Arap harfli terimlerle.
      if (latin.length) {
        if (meal.get()) res.ayah = searchTextIndex(meal.get().index, latin, { limit: LIST_LIMIT.ayah });
        else {
          res.mealState = "loading";
          meal.load().then(refresh, () => {
            if (token === st.token) {
              res.mealState = "error";
              render(true);
            }
          });
        }
        if (words.get()) res.words = searchWordIndex(words.get().index, latin, { limit: LIST_LIMIT.word });
        else words.load().then(refresh, () => {});
        if (st.tafsirOn) {
          if (tafsir.get()) {
            res.tafsirState = "ready";
            res.tafsir = searchTextIndex(tafsir.get().index, latin, { limit: LIST_LIMIT.tafsir });
          } else {
            res.tafsirState = "loading";
            tafsir.load().then(refresh, () => {
              st.tafsirOn = false; // düğme yeniden görünsün
              if (token === st.token) {
                res.tafsirState = "error";
                render(true);
              }
            });
          }
        }
      }
      if (arabicTerms.length) {
        if (arabic.get()) res.arabic = searchTextIndex(arabic.get(), arabicTerms, { limit: LIST_LIMIT.arabic });
        else arabic.load().then(refresh, () => {});
      }
      // Konular hem Türkçe hem Arapça ada göre aranır (dizin ikisini de içeriyor).
      if (topics.get()) res.topics = searchTopics(topics.get(), terms, { limit: LIST_LIMIT.topic });
      else topics.load().then(refresh, () => {});
    }
    render(keepScroll);
  }

  // Kullanıcı sorguyu değiştirdi: sayfalama/açık bölümler sıfırlanır.
  function runNow() {
    win.clearTimeout(st.timer);
    st.token++;
    st.expanded.clear();
    st.shown = {};
    compute(false);
  }

  function schedule() {
    win.clearTimeout(st.timer);
    if (!normalizeRecentQuery(input.value)) runNow();
    else st.timer = win.setTimeout(runNow, DEBOUNCE_MS);
  }

  // -- son aramalar -------------------------------------------------------------
  function remember(q) {
    const n = normalizeRecentQuery(q);
    if (!n) return;
    st.recent = addRecentQuery(st.recent, n);
    saveRecent(storage, st.recent);
  }

  // Bir hedefe git: aranan sorgu son aramalara yazılır, klavye kapanır, hedefe
  // gidilir, modal kapanır. `close: false`, hedefin kendisi bir modal açıyorsa
  // (konu): openModal zaten bu modalı kapatıyor; ikinci bir closeModal, yeni
  // açılan modalın arka plan perdesini de söndürürdü.
  function go(fn, { close = true } = {}) {
    remember(input.value);
    input.blur();
    fn();
    if (close) deps.closeModal();
  }
  function goJump(j) {
    if (j.type === "ayah") go(() => nav.goToAyah(j.surah, j.ayah));
    else if (j.type === "surah") go(() => nav.goToSurah(j.surah));
    else if (j.type === "juz") go(() => nav.goToJuz(j.n));
    else go(() => nav.goToPage(j.n));
  }

  function setQuery(q) {
    input.value = q;
    runNow();
    input.blur(); // ekran klavyesi kapansın, sonuçlar görünsün
  }

  // Popüler konu çipi: adı tam eşleşen konuyu doğrudan aç; konu verisi
  // yüklenemediyse ya da ad bulunamazsa aynı kelimeyi arama olarak çalıştır.
  function openTopicByName(name) {
    topics.load().then(
      (idx) => {
        const t = findTopicByName(idx, name);
        if (t) go(() => nav.openTopic(t.id), { close: false });
        else setQuery(name);
      },
      () => setQuery(name)
    );
  }

  // -- olaylar ---------------------------------------------------------------------
  body.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || !body.contains(el)) return;
    const d = el.dataset;
    switch (d.act) {
      case "recent":
        setQuery(d.q);
        break;
      case "chip":
        openTopicByName(d.q);
        break;
      case "recent-remove":
        st.recent = removeRecentQuery(st.recent, d.q);
        saveRecent(storage, st.recent);
        render(true);
        break;
      case "clear-recent":
        st.recent = [];
        saveRecent(storage, st.recent);
        render(true);
        break;
      case "tafsir-load":
        st.tafsirOn = true;
        st.expanded.delete("tafsir");
        compute(true);
        break;
      case "expand":
        st.expanded.add(d.key);
        st.shown[d.key] = PAGE;
        render(true);
        break;
      case "collapse":
        st.expanded.delete(d.key);
        render(true);
        break;
      case "more":
        st.shown[d.key] = (st.shown[d.key] || PAGE) + PAGE;
        render(true);
        break;
      case "go-ayah":
        go(() => nav.goToAyah(parseInt(d.surah, 10), parseInt(d.ayah, 10)));
        break;
      case "go-surah":
        go(() => nav.goToSurah(parseInt(d.surah, 10)));
        break;
      case "go-juz":
        go(() => nav.goToJuz(parseInt(d.n, 10)));
        break;
      case "go-page":
        go(() => nav.goToPage(parseInt(d.n, 10)));
        break;
      case "go-topic":
        go(() => nav.openTopic(parseInt(d.id, 10)), { close: false });
        break;
    }
  });

  input.addEventListener("input", schedule);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = normalizeRecentQuery(input.value);
    if (!q) return;
    runNow();
    // Enter: sorgu bir hedefe dönüşüyorsa (2:255, cüz 3 ...) doğrudan git.
    const first = st.result && st.result.parsed.jumps[0];
    if (first) {
      goJump(first);
      return;
    }
    remember(q);
    input.blur();
  });
  clearBtn.addEventListener("click", () => {
    input.value = "";
    runNow();
    input.focus({ preventScroll: true });
  });

  // -- ekran klavyesi ---------------------------------------------------------------
  // Sheet'in alt kenarını görünür alanın (klavyenin) üstüne oturtur ve
  // yüksekliğini görünür alana göre sınırlar; CSS'teki --arama-kb/--arama-vh
  // yalnızca dar ekranda kullanılıyor (bkz. .modal-sheet--arama).
  function syncViewport() {
    const vv = win.visualViewport;
    if (!vv || modal.hidden) return;
    const inset = Math.max(0, Math.round(win.innerHeight - vv.offsetTop - vv.height));
    modal.style.setProperty("--arama-kb", `${inset}px`);
    modal.style.setProperty("--arama-vh", `${Math.round(vv.height)}px`);
  }
  if (win.visualViewport) {
    win.visualViewport.addEventListener("resize", syncViewport);
    win.visualViewport.addEventListener("scroll", syncViewport);
  }

  // -- açılış -------------------------------------------------------------------------
  // Her açılışta ilk ekrandan başlar (Konu Fihristi/Ezber modalleriyle aynı
  // ilke). Sıfırlama KAPANIRKEN değil AÇILIRKEN yapılıyor: kapanış
  // animasyonu sürerken içerik boşalıp yanıp sönmesin.
  function open() {
    deps.openModal(() => {
      input.value = "";
      st.result = null;
      st.token++;
      st.expanded.clear();
      st.shown = {};
      clearBtn.hidden = true;
      topics.unblock();
      words.unblock();
      render(false);
      syncViewport();
      // İlk yazışta ve konu çiplerinde beklemesin diye arka planda yükle
      // (kelime meali 1.6 MB: yalnızca ilk metin aramasında yüklenir).
      meal.load().catch(() => {});
      topics.load().catch(() => {});
      // preventScroll: sheet daha ekran dışındayken odaklanıp sayfayı kaydırmasın.
      // Aynı tık olayı içinde çağrılıyor -- iOS klavyeyi ancak böyle açıyor.
      input.focus({ preventScroll: true });
    });
  }
  openBtn.addEventListener("click", open);
  openBtn.disabled = false;

  return {
    open,
    dispose() {
      win.clearTimeout(st.timer);
      if (win.visualViewport) {
        win.visualViewport.removeEventListener("resize", syncViewport);
        win.visualViewport.removeEventListener("scroll", syncViewport);
      }
    },
  };
}
