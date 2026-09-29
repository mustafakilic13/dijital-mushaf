// Regression check for js/arama.js (Arama modalının arayüz katmanı) -- bkz.
// o dosyanın başlık yorumu. GERÇEK index.html jsdom'a yükleniyor (modalın
// işaretlemesi, sınıf/ID'ler, alt çubuk düğmesi -- app.js/HarfBuzz açılışı
// olmadan; app.js Node'da import edilemiyor, bkz. juz_subdivisions_test.mjs
// başlığı) ve setupArama'ya sahte gezinme/modal fonksiyonları verilip
// gerçek data/surahs.json + meal.json + word-meal.json + topics-tr.json
// üzerinde uçtan uca sınanıyor: düğme -> ilk ekran -> yazma -> bölümler
// (önizleme / tümünü gör) -> tık -> gezinme + son aramalar. Son bölümde
// app.js'in KAYNAK metni de kontrol ediliyor (kablolama: import, closeAllModals
// listesi, setupArama bağımlılıkları) ve ayahRawWordsAnywhere fonksiyonu
// app.js'ten çıkarılıp sahte state ile çalıştırılıyor.
//
// jsdom gerekiyor (test/package.json'da devDependency):
//   npm install && node arama_ui_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";
import { setupArama, RECENT_KEY, PAGE, PREVIEW, POPULAR_TOPICS, DEBOUNCE_MS } from "../js/arama.js";
import { buildTopicsSearchIndex, findTopicByName, fold, isArabicScript } from "../js/search.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const html = readText("index.html");
const surahs = JSON.parse(readText("data", "surahs.json"));
const meal = JSON.parse(readText("data", "meal.json"));
const wordMeal = JSON.parse(readText("data", "word-meal.json"));
const topicsData = JSON.parse(readText("data", "topics-tr.json"));
const tafsirData = JSON.parse(readText("data", "tafsir-saadi.json"));
const ayahBoundsData = JSON.parse(readText("data", "ayahs.json"));
const mushaf = JSON.parse(readText("data", "mushaf.json"));
const appSource = readText("js", "app.js");

// Gerçek mushaf verisinden ayetin kelimeleri (app.js'teki ayahRawWordsAnywhere ile aynı iş;
// o fonksiyonun kendisi en altta app.js kaynağından çıkarılıp ayrıca sınanıyor).
function rawWordsOf(s, a) {
  const b = (ayahBoundsData[String(s)] || [])[a - 1];
  if (!b) return [];
  const out = [];
  for (const line of mushaf.pages[b[0] - 1] || []) {
    for (const w of line.w || []) if (w.i >= b[1] && w.i <= b[2]) out.push(w);
  }
  return out;
}
const AYAH_END = "\u06dd";
function arabicTextOf(s, a) {
  return rawWordsOf(s, a).filter((w) => !w.t.startsWith(AYAH_END)).map((w) => w.t).join(" ");
}

// Bağımsız gerçek: "الله" kaç ayetin Arapça metninde geçiyor (fold ile, tam
// olarak arama.js'in kullandığı normalleştirmeyle) -- arama sonucunu buna
// karşı doğrulamak için, sabit bir sayı tahmin etmek yerine.
const ALLAH_AYAHS = (() => {
  const term = fold("الله");
  let n = 0;
  for (let s = 1; s <= 114; s++) {
    for (let a = 1; a <= surahs[String(s)].versesCount; a++) {
      if (fold(arabicTextOf(s, a)).includes(term)) n++;
    }
  }
  return n;
})();

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Sabit bir sleep yerine koşulu anket eder -- yavaş/CI ortamında sabit
// gecikmeler (özellikle 1739 girdilik tefsir dizini, aralarda yield ederek
// kuruluyor) kırılgan olabiliyor. 20ms aralıklarla en fazla `timeout` ms bekler.
async function waitFor(cond, timeout = 4000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error("waitFor: zaman aşımı");
    await sleep(20);
  }
}
const ok = (v) => () => Promise.resolve(v);

// Her senaryo kendi jsdom'unda + kendi depolamasında (sızıntı olmasın).
function makeEnv(deps = {}) {
  const { loadMeal, loadTopics, loadWords, viewport } = deps;
  const dom = new JSDOM(html, { url: "http://localhost/", pretendToBeVisual: true });
  const { window } = dom;
  if (viewport) Object.defineProperty(window, "visualViewport", { value: viewport, configurable: true });
  const doc = window.document;
  const modal = doc.getElementById("arama-modal");
  const openBtn = doc.getElementById("arama-btn");
  const calls = [];
  const env = {
    window, doc, modal, openBtn, calls,
    input: modal.querySelector(".arama-input"),
    body: modal.querySelector(".arama-body"),
    clear: modal.querySelector(".arama-clear"),
    form: modal.querySelector(".arama-form"),
    status: modal.querySelector(".arama-status"),
    storage: window.localStorage,
    loads: { meal: 0, topics: 0, words: 0, tafsir: 0 },
  };
  env.api = setupArama({
    modal,
    openBtn,
    getSurahs: () => surahs,
    openModal: (onOpen) => {
      modal.hidden = false;
      calls.push(["open"]);
      if (onOpen) onOpen();
    },
    closeModal: () => {
      modal.hidden = true;
      calls.push(["close"]);
    },
    nav: {
      goToAyah: (s, a) => calls.push(["ayah", s, a]),
      goToSurah: (s) => calls.push(["surah", s]),
      goToJuz: (n) => calls.push(["juz", n]),
      goToPage: (n) => calls.push(["page", n]),
      openTopic: (id) => calls.push(["topic", id]),
    },
    loadMealData: loadMeal || (() => { env.loads.meal++; return Promise.resolve(meal); }),
    loadTopicsData: loadTopics || (() => { env.loads.topics++; return Promise.resolve(topicsData); }),
    loadWordMealData: loadWords || (() => { env.loads.words++; return Promise.resolve(wordMeal); }),
    ayahRawWords: rawWordsOf,
    ayahArabicText: arabicTextOf,
    loadTafsirData: deps.loadTafsir || (() => { env.loads.tafsir = (env.loads.tafsir || 0) + 1; return Promise.resolve(tafsirData); }),
    storage: env.storage,
  });
  env.type = async (text) => {
    env.input.value = text;
    env.input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await sleep(DEBOUNCE_MS + 120);
  };
  env.submit = () => env.form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  env.rows = (act) => [...env.body.querySelectorAll(act ? `[data-act="${act}"]` : "[data-act]")];
  env.sections = () => [...env.body.querySelectorAll(".arama-section-title")].map((e) => e.textContent);
  // Bir bölümün başlığından sonraki (sonraki başlığa kadar) elemanlar.
  env.sectionEls = (title) => {
    const head = [...env.body.querySelectorAll(".arama-section-head")].find((h) => h.querySelector(".arama-section-title").textContent === title);
    const out = [];
    if (!head) return out;
    for (let n = head.nextElementSibling; n && !n.classList.contains("arama-section-head"); n = n.nextElementSibling) out.push(n);
    return out;
  };
  env.sectionRows = (title, act) => env.sectionEls(title).filter((x) => x.matches(act ? `[data-act="${act}"]` : "[data-act]"));
  env.sectionCount = (title) => {
    const head = [...env.body.querySelectorAll(".arama-section-head")].find((h) => h.querySelector(".arama-section-title").textContent === title);
    const c = head && head.querySelector(".arama-count");
    return c ? parseInt(c.textContent, 10) : 0;
  };
  env.recent = () => JSON.parse(env.storage.getItem(RECENT_KEY) || "[]");
  env.tafsirBtn = () => env.body.querySelector('[data-act="tafsir-load"]');
  // Bölüm BAŞLIĞI hem "yükleniyor" hem "sonuçlarla hazır" durumunda render edilir --
  // gerçekten hazır olmayı beklemek için satır (ya da sonuçsuzsa sayaç) varlığına bakılır.
  env.tafsirReady = () => env.sectionRows("Tefsir (Sa'dî)", "go-ayah").length > 0 || (env.sections().includes("Tefsir (Sa'dî)") && !/Tefsir yükleniyor/.test(env.body.textContent));
  env.last = () => env.calls[env.calls.length - 1];
  return env;
}

// -- işaretleme ----------------------------------------------------------------
{
  const dom = new JSDOM(html);
  const d = dom.window.document;
  const btn = d.getElementById("arama-btn");
  check("alt çubuktaki Arama düğmesi artık etkin (disabled değil)", btn && !btn.disabled);
  const modal = d.getElementById("arama-modal");
  check("modal .modal-sheet ve başlangıçta gizli, dialog rolünde", modal && modal.classList.contains("modal-sheet") && modal.hidden && modal.getAttribute("role") === "dialog" && modal.getAttribute("aria-modal") === "true");
  check("modalda [data-close] kapatma düğmesi var (app.js closeAllModals'a bağlıyor)", !!modal.querySelector("[data-close]"));
  const input = modal.querySelector(".arama-input");
  check("giriş: type=search, enterkeyhint=search, otomatik düzeltme kapalı", input && input.type === "search" && input.getAttribute("enterkeyhint") === "search" && input.getAttribute("autocorrect") === "off" && input.getAttribute("spellcheck") === "false");
  check("giriş: ARIA etiketi var", !!input.getAttribute("aria-label"));
  check("form role=search, sonuç alanı ve durum (aria-live) alanı var", modal.querySelector('form[role="search"]') && modal.querySelector(".arama-body") && modal.querySelector('.arama-status[aria-live="polite"]'));
  check("kimlik çakışması yok: arama-modal / arama-btn tekil", d.querySelectorAll("#arama-modal").length === 1 && d.querySelectorAll("#arama-btn").length === 1);
  const css = readText("css", "style.css");
  check("CSS: giriş 16px (iOS odaklanınca yakınlaştırmasın)", /\.arama-input\s*\{[^}]*font-size:\s*16px/.test(css));
  check("CSS: .modal-sheet--arama ve klavye değişkenleri tanımlı", /\.modal-sheet--arama/.test(css) && /--arama-kb/.test(css) && /--arama-vh/.test(css));
  check("CSS: vurgu sınıfı ve kelime kartı satırı tanımlı", /\.arama-hit\s*\{/.test(css) && /\.arama-wbw\s*\{/.test(css));
}

// -- açılış / ilk ekran ---------------------------------------------------------------
{
  const e = makeEnv();
  check("setupArama düğmeyi etkinleştiriyor", !e.openBtn.disabled);
  e.openBtn.click();
  check("düğme tıklanınca modal açılıyor", e.calls[0][0] === "open" && !e.modal.hidden);
  check("ilk ekran: popüler konu çipleri (hepsi)", e.rows("chip").length === POPULAR_TOPICS.length && e.rows("chip")[0].textContent === "Sabır");
  check("ilk ekran: geçmiş yokken 'Son aramalar' bölümü yok", !e.sections().includes("Son aramalar"));
  check("ilk ekran: ipucu satırı var", /2:255/.test(e.body.textContent));
  check("giriş açılışta odakta", e.doc.activeElement === e.input);
  check("temizle düğmesi başta gizli", e.clear.hidden === true);
  await sleep(50);
  check("açılışta meal + konular arka planda yüklendi (1'er kez), kelime meali YÜKLENMEDİ", e.loads.meal === 1 && e.loads.topics === 1 && e.loads.words === 0);
}

// -- hızlı gitme ---------------------------------------------------------------------------
{
  const e = makeEnv();
  e.openBtn.click();
  await e.type("2:255");
  check("'2:255' -> 'Git' bölümü, tek satır, doğru veri", e.sections()[0] === "Git" && e.rows("go-ayah").length === 1 && e.rows("go-ayah")[0].dataset.surah === "2" && e.rows("go-ayah")[0].dataset.ayah === "255");
  check("'Git' satırı ayetin mealini önizliyor", /Allah/.test(e.rows("go-ayah")[0].textContent));
  check("hedef sorguda başka bölüm yok (gürültü yok)", e.sections().length === 1);
  check("hedef sorgusunda kelime meali yüklenmiyor", e.loads.words === 0);
  check("temizle düğmesi yazınca görünüyor", e.clear.hidden === false);
  e.submit();
  check("Enter: doğrudan 2:255'e gidiyor ve modal kapanıyor", e.calls.some((c) => c[0] === "ayah" && c[1] === 2 && c[2] === 255) && e.last()[0] === "close");
  check("Enter: sorgu son aramalara yazıldı", JSON.stringify(e.recent()) === JSON.stringify(["2:255"]));
}
{
  const e = makeEnv();
  e.openBtn.click();
  await e.type("bakara suresi 255. ayet");
  check("'bakara suresi 255. ayet' -> 2:255", e.rows("go-ayah").length === 1 && e.rows("go-ayah")[0].dataset.surah === "2" && e.rows("go-ayah")[0].dataset.ayah === "255");
  await e.type("2:300");
  check("'2:300' -> sureye gidiş + '286 ayettir' ipucu", e.rows("go-surah").length === 1 && /286 ayettir/.test(e.body.textContent));
  await e.type("cüz 30");
  check("'cüz 30' -> cüze git", e.rows("go-juz").length === 1 && e.rows("go-juz")[0].dataset.n === "30");
  e.rows("go-juz")[0].click();
  check("cüz satırına tık -> goToJuz(30) + modal kapanır", e.calls.some((c) => c[0] === "juz" && c[1] === 30) && e.last()[0] === "close");
}
{
  const e = makeEnv();
  e.openBtn.click();
  await e.type("12");
  check("'12' -> hem sure 12 hem sayfa 12", e.rows("go-surah")[0].dataset.surah === "12" && e.rows("go-page").length === 1 && e.rows("go-page")[0].dataset.n === "12");
  e.submit();
  check("'12' + Enter -> ilk hedef (sure 12)", e.calls.some((c) => c[0] === "surah" && c[1] === 12));
}
{
  const e = makeEnv();
  e.openBtn.click();
  await e.type("sayfa 50");
  e.rows("go-page")[0].click();
  check("sayfa satırına tık -> goToPage(50)", e.calls.some((c) => c[0] === "page" && c[1] === 50));
}

// -- bölümler: 'sabır' ---------------------------------------------------------------------
{
  const e = makeEnv();
  e.openBtn.click();
  await e.type("sabır");
  const order = e.sections();
  check("'sabır' bölümleri sırayla: Konular, Ayetler, Kelime meali", JSON.stringify(order) === JSON.stringify(["Konular", "Ayetler", "Kelime meali"]));
  check("kelime meali ilk metin aramasında (tembel) yüklendi, tek kez", e.loads.words === 1);

  const topicRows = e.sectionRows("Konular", "go-topic");
  check(`Konular önizlemesi <= ${PREVIEW.topic} satır, ilki 'Sabır' (1651)`, topicRows.length > 0 && topicRows.length <= PREVIEW.topic && topicRows[0].dataset.id === "1651");
  check("konu satırında ayet sayısı + kategori", /\d+ ayet · /.test(topicRows[0].textContent) && topicRows[0].querySelector("mark.arama-hit") !== null);

  const ayahRows = e.sectionRows("Ayetler", "go-ayah");
  check(`Ayetler önizlemesi tam ${PREVIEW.ayah} satır`, ayahRows.length === PREVIEW.ayah);
  check("Ayetler sayacı >= 80 sonuç", e.sectionCount("Ayetler") >= 80);
  check("eşleşmeler <mark class=arama-hit> ile vurgulu", ayahRows[0].querySelector("mark.arama-hit") !== null);
  check("her satırda sure adı + sure:ayet başlığı", /· \d+:\d+/.test(ayahRows[0].querySelector(".arama-ayah-ref").textContent));
  const expand = e.sectionRows("Ayetler", "expand");
  check("'Tümünü gör (N)' düğmesi var ve N sayaçla aynı", expand.length === 1 && expand[0].textContent.includes(`(${e.sectionCount("Ayetler")})`));

  const wordRows = e.sectionRows("Kelime meali", "go-ayah");
  check(`Kelime meali önizlemesi <= ${PREVIEW.word} satır`, wordRows.length > 0 && wordRows.length <= PREVIEW.word);
  check("kelime meali satırı: Arapça kelime kartı (Arap harfleri)", /[\u0600-\u06ff]/.test(wordRows[0].querySelector(".wbw-ar").textContent));
  check("kelime meali satırı: karşılıkta vurgu", wordRows[0].querySelector(".wbw-tr mark.arama-hit") !== null);
  check("kelime meali satırı: ayet panelindeki kart sınıflarıyla (.wbw-container/.wbw-word)", wordRows[0].querySelector(".wbw-container .wbw-word") !== null);

  // Tümünü gör -> sayfalı açık liste
  expand[0].click();
  check(`'Tümünü gör' -> ${PAGE} satır`, e.sectionRows("Ayetler", "go-ayah").length === PAGE);
  check("açık bölümde 'Daralt' bağlantısı var", e.body.querySelector('[data-act="collapse"][data-key="ayah"]') !== null);
  check("açık bölümde 'Daha fazla göster'", e.sectionRows("Ayetler", "more").length === 1);
  e.sectionRows("Ayetler", "more")[0].click();
  check(`'Daha fazla' ${PAGE} satır daha ekliyor`, e.sectionRows("Ayetler", "go-ayah").length === PAGE * 2);
  check("diğer bölümler etkilenmedi (Kelime meali hâlâ önizleme)", e.sectionRows("Kelime meali", "go-ayah").length <= PREVIEW.word);
  e.body.querySelector('[data-act="collapse"][data-key="ayah"]').click();
  check("'Daralt' -> önizlemeye dönüş", e.sectionRows("Ayetler", "go-ayah").length === PREVIEW.ayah && e.sectionRows("Ayetler", "expand").length === 1);

  // ayet satırına tık
  const first = e.sectionRows("Ayetler", "go-ayah")[0];
  const s = parseInt(first.dataset.surah, 10);
  const a = parseInt(first.dataset.ayah, 10);
  first.click();
  check("ayet satırına tık -> goToAyah(sure, ayet) + modal kapanır", e.calls.some((c) => c[0] === "ayah" && c[1] === s && c[2] === a) && e.last()[0] === "close");
  check("tıklanan aramanın sorgusu son aramalara yazıldı", JSON.stringify(e.recent()) === JSON.stringify(["sabır"]));
}
{
  // konu satırına tık: konu modalı açılır; arama modalını İKİNCİ kez kapatmamalı
  const e = makeEnv();
  e.openBtn.click();
  await e.type("sabır");
  e.sectionRows("Konular", "go-topic")[0].click();
  check("konu satırına tık -> openTopic(1651)", e.calls.some((c) => c[0] === "topic" && c[1] === 1651));
  check("konu açılırken arama modalı AYRICA kapatılmıyor (openModal zaten kapatıyor; ikinci closeModal yeni modalın perdesini söndürürdü)", !e.calls.some((c) => c[0] === "close"));
  check("konu tıklanınca sorgu son aramalara yazıldı", JSON.stringify(e.recent()) === JSON.stringify(["sabır"]));
}
{
  // tek bölüm -> doğrudan açık
  const e = makeEnv({ loadTopics: ok([]), loadWords: ok({}) });
  e.openBtn.click();
  await e.type("sabır");
  check("tek bölüm (yalnız Ayetler) doğrudan açık: sayfa dolusu satır, 'Tümünü gör' ve 'Daralt' yok", JSON.stringify(e.sections()) === JSON.stringify(["Ayetler"]) && e.sectionRows("Ayetler", "go-ayah").length === PAGE && e.rows("expand").length === 0 && e.rows("collapse").length === 0);
}
{
  // geç gelen ikincil kaynak, kullanıcının açtığı bölümü kapatmamalı
  let release;
  const e = makeEnv({ loadWords: () => new Promise((res) => (release = () => res(wordMeal))) });
  e.openBtn.click();
  await e.type("sabır");
  check("kelime meali yüklenirken bölümü henüz yok, diğerleri var", !e.sections().includes("Kelime meali") && e.sections().includes("Ayetler"));
  e.sectionRows("Ayetler", "expand")[0].click();
  e.body.scrollTop = 0;
  release();
  await sleep(80);
  check("kelime meali gelince bölümü ekleniyor", e.sections().includes("Kelime meali"));
  check("... ve kullanıcının açtığı Ayetler bölümü AÇIK kalıyor", e.sectionRows("Ayetler", "go-ayah").length === PAGE);
}
{
  // ikincil kaynak yüklenemezse sessizce atlanır; tekrar tekrar denenmez
  let topicCalls = 0;
  let wordCalls = 0;
  const e = makeEnv({
    loadTopics: () => { topicCalls++; return Promise.reject(new Error("ağ yok")); },
    loadWords: () => { wordCalls++; return Promise.reject(new Error("ağ yok")); },
  });
  e.openBtn.click();
  await sleep(30);
  await e.type("sabır");
  await e.type("sabır ve namaz");
  await e.type("namaz");
  check("konu/kelime meali yüklenemezse o bölümler yok, hata notu da yok, Ayetler çalışıyor", !e.sections().includes("Konular") && !e.sections().includes("Kelime meali") && e.sections().includes("Ayetler") && !/yüklenemedi/.test(e.body.textContent));
  check("başarısız ikincil kaynaklara her tuşta yeniden istek atılmıyor (1'er deneme)", topicCalls === 1 && wordCalls === 1);
  e.calls.length = 0;
  e.openBtn.click();
  await sleep(30);
  check("modal yeniden açılınca yeniden deneniyor (konular)", topicCalls === 2);
}

// -- sure adı ---------------------------------------------------------------------------------------
{
  const e = makeEnv();
  e.openBtn.click();
  await e.type("yasin");
  check("'yasin' -> 'Sureler' bölümünde Yâsîn (36) ilk", e.sections().includes("Sureler") && e.sectionRows("Sureler", "go-surah")[0].dataset.surah === "36");
  const row = e.sectionRows("Sureler", "go-surah")[0];
  check("sure satırı: numara + Arapça ad + ad · ayet sayısı", /^36/.test(row.querySelector(".modal-item-num").textContent) && row.querySelector(".modal-item-arabic").textContent.length > 0 && /83 ayet/.test(row.textContent));
  row.click();
  check("sure satırına tık -> goToSurah(36)", e.calls.some((c) => c[0] === "surah" && c[1] === 36));
  const e2 = makeEnv();
  e2.openBtn.click();
  await e2.type("yasin suresi");
  check("'yasin suresi' -> doğrudan sureye git (başka bölüm yok)", e2.rows("go-surah").length === 1 && e2.rows("go-surah")[0].dataset.surah === "36" && e2.sections().length === 1);
  const e3 = makeEnv();
  e3.openBtn.click();
  await e3.type("al");
  const total = e3.sectionCount("Sureler");
  check(`çok eşleşen kısa sorguda sure önizlemesi ${PREVIEW.surah} satır + 'Tümünü gör (${total})'`, e3.sectionRows("Sureler", "go-surah").length === PREVIEW.surah && total > PREVIEW.surah && e3.sectionRows("Sureler", "expand").length === 1);
  e3.sectionRows("Sureler", "expand")[0].click();
  check("sure listesi açılınca hepsi (sayfa sayfa) geliyor", e3.sectionRows("Sureler", "go-surah").length === Math.min(total, PAGE));
}

// -- Arapça metin arama -------------------------------------------------------------------------------
{
  const e = makeEnv();
  e.openBtn.click();
  await e.type("الله"); // harekesiz -- mushaf.json'daki harekeli metinlerle eşleşmeli
  check("Arapça sorgu -> 'Arapça metin' var; Latin-terim kaynakları (Ayetler/Kelime meali/Tefsir) YOK", e.sections().includes("Arapça metin") && !e.sections().includes("Ayetler") && !e.sections().includes("Kelime meali") && !e.sections().includes("Tefsir (Sa'dî)"));
  check("Arapça sorguda kelime meali/tefsir hiç yüklenmedi (yalnız Latin terimlerle tetiklenir)", e.loads.words === 0 && e.loads.tafsir === 0);
  // Not: "Konular" da çıkabilir (konunun arabic_name alanı eşleşirse, ör. "Allah" konusu) --
  // vurgu yalnızca GÖSTERİLEN Türkçe ada uygulandığından o durumda <mark> olmayabilir;
  // bu, ayrı ve zaten kanıtlanmış bir davranış (Faz 2 testlerinde Türkçe ad vurgusu sınandı).
  const arRows = e.rows("go-ayah");
  check(`Arapça sonuç sayısı bağımsız hesaba eşit (${ALLAH_AYAHS})`, e.sectionCount("Arapça metin") === ALLAH_AYAHS);
  check("ilk sayfa PREVIEW.arabic kadar satır", arRows.length === PREVIEW.arabic);
  const snip = arRows[0].querySelector(".arama-snippet--ar");
  check("satır sağdan sola (dir=rtl), Arapça font sınıfında, harekeli metni vurguluyor", snip && snip.getAttribute("dir") === "rtl" && snip.querySelector("mark.arama-hit") !== null && /[\u064b-\u065f\u0670]/.test(snip.querySelector("mark.arama-hit").textContent));
  const s0 = parseInt(arRows[0].dataset.surah, 10);
  const a0 = parseInt(arRows[0].dataset.ayah, 10);
  arRows[0].click();
  check("Arapça sonucuna tık -> goToAyah + kapat", e.calls.some((c) => c[0] === "ayah" && c[1] === s0 && c[2] === a0) && e.last()[0] === "close");
}
{
  // Arapça sure adıyla da arama: sonuç Sureler + (Bakara'nın Arapça adı ile) Konular'da da çıkabilir; en az Sureler kesin.
  const e = makeEnv();
  e.openBtn.click();
  await e.type(surahs["2"].nameArabic);
  check("Arapça sure adı -> Sureler bölümünde Bakara ilk", e.sectionRows("Sureler", "go-surah")[0].dataset.surah === "2");
}
{
  const e = makeEnv();
  e.openBtn.click();
  await e.type("قزوكسث"); // Kur'an'da geçmeyecek rastgele harf dizisi
  check("olmayan Arapça dizisi -> 'sonuç bulunamadı', çökme yok", /sonuç bulunamadı/.test(e.body.textContent) && e.rows("go-ayah").length === 0);
}

// -- Tefsir (isteğe bağlı) ------------------------------------------------------------------------------
{
  const e = makeEnv();
  e.openBtn.click();
  await e.type("sabır");
  check("tefsir varsayılan KAPALI: bölüm yok, indirilmedi", !e.sections().includes("Tefsir (Sa'dî)") && e.loads.tafsir === 0);
  const btn = e.tafsirBtn();
  check("altta \"Sa'dî tefsirinde de ara\" düğmesi, boyut uyarısıyla", btn && /Sa.dî tefsirinde de ara/.test(btn.textContent) && /8 MB/.test(btn.textContent));
  btn.click();
  check("düğmeye tık -> 'Tefsir yükleniyor' notu, düğme kayboldu", /Tefsir yükleniyor/.test(e.body.textContent) && !e.tafsirBtn());
  await waitFor(() => e.tafsirReady());
  check("yükleme bitince 'Tefsir (Sa'dî)' bölümü sonuçlarla geliyor", e.sections().includes("Tefsir (Sa'dî)") && e.sectionCount("Tefsir (Sa'dî)") > 50);
  check("tefsir yalnız bir kez indirildi", e.loads.tafsir === 1);
  const tRows = e.sectionRows("Tefsir (Sa'dî)", "go-ayah");
  check("tefsir satırında kaynak HTML'i sızmıyor (orijinaldeki span/div/class kalıntısı yok)", !/class="green"|class="tr|<div|lang="tr"/.test(tRows[0].innerHTML) && tRows[0].querySelector("mark.arama-hit") !== null);
  check("tefsir satırının metni gerçek karakterler içeriyor, etiket parçası değil (< veya > yok düz metinde)", !tRows[0].textContent.includes("<") && !tRows[0].textContent.includes("class="));

  // Aynı oturumda BAŞKA bir arama: düğmeye tekrar basmadan tefsir sonucu geliyor
  await e.type("namaz");
  check("tefsir kalıcı açık: yeni sorguda düğme yok, bölüm otomatik geldi", !e.tafsirBtn() && e.sections().includes("Tefsir (Sa'dî)"));
  check("tekrar indirilmedi (önbellekten)", e.loads.tafsir === 1);

  // Modalı kapatıp yeniden aç: tefsir açık kalmalı (oturum boyunca)
  e.openBtn.click();
  await e.type("sabır");
  check("modal yeniden açılınca da tefsir otomatik dahil (düğme yok)", !e.tafsirBtn() && e.sections().includes("Tefsir (Sa'dî)") && e.loads.tafsir === 1);
}
{
  // Arapça sorguda tefsir aranmaz (Türkçe metin), açık olsa bile
  const e = makeEnv();
  e.openBtn.click();
  await e.type("sabır");
  e.tafsirBtn().click();
  await waitFor(() => e.tafsirReady());
  const soloCount = e.sectionCount("Tefsir (Sa'dî)");
  await e.type("الله");
  check("tefsir açıkken bile Arapça sorguda 'Tefsir' bölümü çıkmıyor", !e.sections().includes("Tefsir (Sa'dî)"));
  // Karma sorgu: tefsir eşleşmesi YALNIZ Latin terimle ('sabır' tek başınayken aynı sayı) --
  // Arapça terim tefsir aramasına karışmıyor (karışsaydı sayı düşer/sıfırlanırdı, çünkü
  // düz metne çevrilmiş Türkçe tefsirde ham Arapça harf dizisi neredeyse hiç geçmez).
  await e.type("sabır الله");
  check(`karma sorguda tefsir sayısı yalnız 'sabır' ile aynı (${soloCount})`, e.sectionCount("Tefsir (Sa'dî)") === soloCount);
}
{
  // Hata sonrası kullanıcı BAŞKA bir şey yazarsa sessizce yeniden denenmemeli --
  // yalnız düğmeye tekrar basınca. (Aksi hâlde bozuk bir bağlantıda her tuşta ağa gidilir.)
  let attempts = 0;
  const e = makeEnv({ loadTafsir: () => { attempts++; return Promise.reject(new Error("ağ yok")); } });
  e.openBtn.click();
  await e.type("sabır");
  e.tafsirBtn().click();
  await sleep(60);
  check("ilk hata sonrası tam 1 deneme", attempts === 1);
  await e.type("namaz"); // düğmeye basmadan başka bir arama
  await sleep(60);
  check("ilgisiz bir sonraki aramada SESSİZCE yeniden denenmiyor (hâlâ 1 deneme)", attempts === 1);
  check("...ve o ekranda düğme yine görünüyor (kullanıcı isterse tekrar dener)", !!e.tafsirBtn());
}
{
  // hata + yeniden deneme
  let fail = true;
  const e = makeEnv({ loadTafsir: () => (fail ? Promise.reject(new Error("ağ yok")) : Promise.resolve(tafsirData)) });
  e.openBtn.click();
  await e.type("sabır");
  e.tafsirBtn().click();
  await sleep(60);
  check("tefsir yüklenemezse hata notu + düğme yeniden görünüyor (aynı ekranda)", /Tefsir yüklenemedi/.test(e.body.textContent) && !!e.tafsirBtn());
  fail = false;
  e.tafsirBtn().click();
  await waitFor(() => e.tafsirReady());
  check("yeniden denenince başarıyla yükleniyor", e.sections().includes("Tefsir (Sa'dî)") && !e.tafsirBtn());
}
{
  // Konular/Kelime meali kapalıyken bile tefsir düğmesi çalışıyor ve tek bölüm
  // (yalnız Tefsir) doğrudan açık geliyor.
  const e = makeEnv({ loadTopics: ok([]), loadWords: ok({}) });
  e.openBtn.click();
  await e.type("kürsi");
  check("Ayetler dışında bölüm yok, tefsir düğmesi var", e.sections().length === 1 && !!e.tafsirBtn());
  e.tafsirBtn().click();
  await waitFor(() => e.tafsirReady());
  check("tefsir açılınca da doğru çalışıyor", e.sectionCount("Tefsir (Sa'dî)") > 0);
}

// -- metin araması: kenar durumlar ----------------------------------------------------------------
{
  const e = makeEnv();
  e.openBtn.click();
  await e.type("sukur");
  check("Türkçe karaktersiz 'sukur' -> sonuç var", e.rows("go-ayah").length > 0);
  await e.type("ayetel kürsi");
  check("'ayetel kürsi' -> gevşek eşleşme notu + 2:255 dahil", /bir kısmını içerenler/.test(e.body.textContent) && e.sectionRows("Ayetler", "go-ayah").length > 0);
  await e.type("qzxwvbnm");
  check("olmayan kelime -> 'sonuç bulunamadı'", /sonuç bulunamadı/.test(e.body.textContent) && e.rows("go-ayah").length === 0);
  check("durum alanı (aria-live) sonucu bildiriyor", /bulunamadı/i.test(e.status.textContent));
  await e.type("a");
  check("tek harf -> yönlendirici not (arama yapılmıyor)", /en az iki harflik/.test(e.body.textContent) && e.rows("go-ayah").length === 0);
  await e.type("115:1");
  check("olmayan sure -> yönlendirici not", /Geçerli bir sure adı/.test(e.body.textContent));
  await e.type("sabır");
  check("durum alanı bölüm sayılarını bildiriyor", /konu/.test(e.status.textContent) && /ayet/.test(e.status.textContent));
}

// -- son aramalar ---------------------------------------------------------------------------------------
{
  const dom = new JSDOM(html, { url: "http://localhost/", pretendToBeVisual: true });
  const st = dom.window.localStorage;
  st.setItem(RECENT_KEY, JSON.stringify(["yusuf", "sabır", 42, null, "YUSUF"]));
  const modal = dom.window.document.getElementById("arama-modal");
  setupArama({
    modal,
    openBtn: dom.window.document.getElementById("arama-btn"),
    getSurahs: () => surahs,
    openModal: (cb) => { modal.hidden = false; cb(); },
    closeModal: () => { modal.hidden = true; },
    nav: { goToAyah() {}, goToSurah() {}, goToJuz() {}, goToPage() {}, openTopic() {} },
    loadMealData: ok(meal),
    loadTopicsData: ok(topicsData),
    loadWordMealData: ok(wordMeal),
    ayahRawWords: rawWordsOf,
    storage: st,
  });
  dom.window.document.getElementById("arama-btn").click();
  const body = modal.querySelector(".arama-body");
  const items = [...body.querySelectorAll('[data-act="recent"]')].map((x) => x.dataset.q);
  check("bozuk/yinelenen depo değerleri temizlenip listeleniyor", JSON.stringify(items) === JSON.stringify(["yusuf", "sabır"]));
  check("'Son aramalar' ilk ekranda, çiplerden önce", [...body.querySelectorAll(".arama-section-title")].map((x) => x.textContent).join("|") === "Son aramalar|Popüler konular");
  body.querySelector('[data-act="recent"][data-q="sabır"]').click();
  check("son aramaya tık -> kutu doluyor", modal.querySelector(".arama-input").value === "sabır");
  await sleep(120);
  check("son aramaya tık -> sonuçlar geliyor", body.querySelectorAll('[data-act="go-ayah"]').length > 0);
  dom.window.document.getElementById("arama-btn").click();
  check("yeniden açılış: kutu boş, ilk ekran", modal.querySelector(".arama-input").value === "" && body.querySelectorAll('[data-act="recent"]').length === 2);
  body.querySelector('[data-act="recent-remove"][data-q="yusuf"]').click();
  check("tek son arama siliniyor", JSON.stringify([...body.querySelectorAll('[data-act="recent"]')].map((x) => x.dataset.q)) === JSON.stringify(["sabır"]) && JSON.parse(st.getItem(RECENT_KEY)).length === 1);
  body.querySelector('[data-act="clear-recent"]').click();
  check("'Temizle' hepsini siliyor (depo dahil)", body.querySelectorAll('[data-act="recent"]').length === 0 && JSON.parse(st.getItem(RECENT_KEY)).length === 0 && !body.textContent.includes("Son aramalar"));
}
{
  const e = makeEnv();
  e.openBtn.click();
  await e.type("sabır");
  e.sectionRows("Ayetler", "go-ayah")[0].click();
  e.openBtn.click();
  await e.type("namaz");
  e.sectionRows("Ayetler", "go-ayah")[0].click();
  e.openBtn.click();
  check("en yeni arama başta (namaz, sabır)", JSON.stringify(e.recent()) === JSON.stringify(["namaz", "sabır"]) && e.rows("recent")[0].dataset.q === "namaz");
  await e.type("SABIR");
  e.sectionRows("Ayetler", "go-ayah")[0].click();
  check("aynı sorgu (SABIR = sabır) yeniden başa taşınır, çoğalmaz", e.recent().length === 2 && e.recent()[0] === "SABIR");
}

// -- çipler ------------------------------------------------------------------------------------------------
{
  const e = makeEnv();
  e.openBtn.click();
  await sleep(50);
  e.rows("chip")[0].click(); // Sabır
  await sleep(30);
  check("çipe tık -> konu modalı doğrudan açılıyor (openTopic 1651)", e.calls.some((c) => c[0] === "topic" && c[1] === 1651));
  check("... arama modalı ayrıca kapatılmıyor, arama yapılmıyor, son aramalara yazılmıyor", !e.calls.some((c) => c[0] === "close") && e.input.value === "" && e.recent().length === 0);
  const idx = buildTopicsSearchIndex(topicsData);
  check("BÜTÜN popüler konu çipleri gerçekten bir konuya çözülüyor (ad Konu Fihristi'nde var)", POPULAR_TOPICS.every((n) => { const t = findTopicByName(idx, n); return t && t.ayahCount > 0; }));
  check("... ve hepsi tık ile doğru konuyu açıyor", await (async () => {
    for (const name of POPULAR_TOPICS) {
      const e2 = makeEnv();
      e2.openBtn.click();
      await sleep(20);
      [...e2.rows("chip")].find((c) => c.dataset.q === name).click();
      await sleep(20);
      const want = findTopicByName(idx, name).id;
      if (!e2.calls.some((c) => c[0] === "topic" && c[1] === want)) { console.error("  çip açmadı:", name); return false; }
    }
    return true;
  })());
}
{
  const e = makeEnv({ loadTopics: () => Promise.reject(new Error("ağ yok")) });
  e.openBtn.click();
  await sleep(30);
  e.rows("chip")[0].click();
  await sleep(150);
  check("konu verisi yüklenemezse çip aynı kelimeyi ARAMA olarak çalıştırıyor", e.input.value === "Sabır" && e.rows("go-ayah").length > 0 && !e.calls.some((c) => c[0] === "topic"));
}
{
  const e = makeEnv();
  e.openBtn.click();
  await e.type("sabır");
  e.clear.click();
  check("temizle düğmesi -> kutu boş, ilk ekrana dönüş, düğme gizli", e.input.value === "" && e.rows("chip").length === POPULAR_TOPICS.length && e.clear.hidden === true);
}

// -- yükleme / hata / yarış ---------------------------------------------------------------------------------
{
  let release;
  const e = makeEnv({ loadMeal: () => new Promise((res) => (release = () => res(meal))) });
  e.openBtn.click();
  await e.type("sabır");
  check("meal yüklenirken 'Meal yükleniyor…' (konular yine de gösteriliyor)", /Meal yükleniyor/.test(e.body.textContent) && e.sections().includes("Konular"));
  release();
  await sleep(80);
  check("yükleme bitince sonuçlar kendiliğinden geliyor", e.sectionRows("Ayetler", "go-ayah").length > 0 && !/Meal yükleniyor/.test(e.body.textContent));
}
{
  let fail = true;
  let loads = 0;
  const e = makeEnv({ loadMeal: () => { loads++; return fail ? Promise.reject(new Error("ağ yok")) : Promise.resolve(meal); } });
  e.openBtn.click();
  await e.type("sabır");
  await sleep(50);
  check("meal yüklenemezse hata notu (çökmüyor)", /Meal yüklenemedi/.test(e.body.textContent));
  fail = false;
  await e.type("sabır ");
  await sleep(50);
  check("sonraki yazışta yeniden deneniyor ve düzeliyor", e.rows("go-ayah").length > 0 && loads >= 2);
}
{
  let release;
  const e = makeEnv({ loadMeal: () => new Promise((res) => (release = () => res(meal))) });
  e.openBtn.click();
  await e.type("sabır");
  await e.type("2:255");
  release();
  await sleep(80);
  check("yarış: sorgu değişince eski meal yüklemesi yeni ekranı bozmuyor", e.rows("go-ayah").length === 1 && e.rows("go-ayah")[0].dataset.ayah === "255" && e.sections().length === 1);
}

// -- güvenlik ------------------------------------------------------------------------------------------------
{
  const e = makeEnv();
  e.openBtn.click();
  await e.type('<img src=x onerror="window.__pwn=1"> & "tırnak"');
  check("XSS: sorgudaki HTML DOM'a eleman olarak girmiyor, olay işleyici çalışmıyor", e.body.querySelector("img") === null && e.window.__pwn === undefined);
  check("XSS: eşleşen ayet metni kaçışlı ve vurgulu basılıyor (tırnak)", e.rows("go-ayah").length > 0 && e.rows("go-ayah")[0].querySelector("mark.arama-hit") !== null);
  await e.type('<b id="pwn2">qzxwvbnm</b>');
  check("XSS: boş sonuç mesajı sorguyu kaçışlı gösteriyor (eleman değil, metin)", e.body.querySelector("#pwn2") === null && e.body.querySelector(".arama-empty-title") && e.body.querySelector(".arama-empty-title").textContent.includes('<b id="pwn2">'));
}
{
  const dom = new JSDOM(html, { url: "http://localhost/", pretendToBeVisual: true });
  const st = dom.window.localStorage;
  st.setItem(RECENT_KEY, JSON.stringify(['<b id="pwn">kalın</b>', '"><img src=x>']));
  const modal = dom.window.document.getElementById("arama-modal");
  setupArama({
    modal,
    openBtn: dom.window.document.getElementById("arama-btn"),
    getSurahs: () => surahs,
    openModal: (cb) => { modal.hidden = false; cb(); },
    closeModal: () => {},
    nav: { goToAyah() {}, goToSurah() {}, goToJuz() {}, goToPage() {}, openTopic() {} },
    loadMealData: ok(meal),
    loadTopicsData: ok(topicsData),
    loadWordMealData: ok(wordMeal),
    ayahRawWords: rawWordsOf,
    storage: st,
  });
  dom.window.document.getElementById("arama-btn").click();
  const body = modal.querySelector(".arama-body");
  check("XSS: depodaki tehlikeli 'son arama' metni eleman/öznitelik olarak girmiyor", body.querySelector("#pwn") === null && body.querySelector("img") === null);
  const chips = [...body.querySelectorAll('[data-act="recent"]')].map((x) => x.dataset.q);
  check("XSS: tehlikeli son arama metni aynen (kaçışlı) geri okunuyor", chips.includes('<b id="pwn">kalın</b>') && chips.includes('"><img src=x>'));
}
{
  const dom = new JSDOM(html, { url: "http://localhost/", pretendToBeVisual: true });
  const st = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const modal = dom.window.document.getElementById("arama-modal");
  let fine = true;
  try {
    setupArama({
      modal,
      openBtn: dom.window.document.getElementById("arama-btn"),
      getSurahs: () => surahs,
      openModal: (cb) => { modal.hidden = false; cb(); },
      closeModal: () => {},
      nav: { goToAyah() {}, goToSurah() {}, goToJuz() {}, goToPage() {}, openTopic() {} },
      loadMealData: ok(meal),
      loadTopicsData: ok(topicsData),
      loadWordMealData: ok(wordMeal),
      ayahRawWords: rawWordsOf,
      storage: st,
    });
    dom.window.document.getElementById("arama-btn").click();
    modal.querySelector(".arama-input").value = "2:255";
    modal.querySelector(".arama-form").dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  } catch (err) {
    fine = false;
    console.error(err);
  }
  check("localStorage erişilemezse (özel gezinti) arama çökmüyor", fine);
}

// -- ekran klavyesi (visualViewport) -------------------------------------------------------------------------
{
  const listeners = {};
  const vv = {
    height: 800,
    offsetTop: 0,
    addEventListener: (t, f) => (listeners[t] = f),
    removeEventListener: () => {},
  };
  const e = makeEnv({ viewport: vv });
  e.window.innerHeight = 800;
  e.openBtn.click();
  check("açılışta --arama-kb=0 ve --arama-vh=görünür yükseklik", e.modal.style.getPropertyValue("--arama-kb") === "0px" && e.modal.style.getPropertyValue("--arama-vh") === "800px");
  vv.height = 450; // ekran klavyesi açıldı
  listeners.resize();
  check("klavye açılınca sheet klavyenin üstüne oturuyor (kb=350px, vh=450px)", e.modal.style.getPropertyValue("--arama-kb") === "350px" && e.modal.style.getPropertyValue("--arama-vh") === "450px");
  vv.height = 800;
  listeners.resize();
  check("klavye kapanınca eski hâle dönüyor", e.modal.style.getPropertyValue("--arama-kb") === "0px");
  vv.height = 450;
  vv.offsetTop = 120; // iOS: klavye açılınca görünür alan kayabiliyor
  listeners.scroll();
  check("görünür alan kayınca (iOS offsetTop) alt boşluk buna göre hesaplanıyor (kb=230px)", e.modal.style.getPropertyValue("--arama-kb") === "230px");
}

// -- app.js kablolaması (kaynak metin) ------------------------------------------------------------------------
check('app.js: setupArama import ediliyor', /import \{ setupArama \} from "\.\/arama\.js";/.test(appSource));
check("app.js: els.aramaModal tanımlı", /aramaModal:\s*document\.getElementById\("arama-modal"\)/.test(appSource));
check("app.js: closeAllModals listesinde arama modalı var (Escape/perde/[data-close] hepsi buradan)", /\[els\.surahModal[^\]]*els\.aramaModal\]\.forEach\(closeModal\)/.test(appSource));
{
  const call = appSource.slice(appSource.indexOf("setupArama({"), appSource.indexOf("setupArama({") + 900);
  check("app.js: setupArama gerekli bağımlılıkların hepsiyle çağrılıyor", ["modal: els.aramaModal", "openBtn: els.aramaBtn", "getSurahs", "openModal", "closeModal", "goToAyah", "goToSurah", "goToJuz: goToJuzNum", "goToPage", "openTopic: openTopicsModal", "loadMealData", "loadWordMealData", "loadTopicsData", "ayahRawWords: ayahRawWordsAnywhere"].every((k) => call.includes(k)));
}
{
  const m = /function ayahRawWordsAnywhere\(surah, ayah\) \{[\s\S]*?\n\}\n/.exec(appSource);
  check("app.js: ayahRawWordsAnywhere bulundu", !!m);
  if (m) {
    const state = { mushaf };
    const ayahBounds = (s, a) => (ayahBoundsData[String(s)] || [])[a - 1] || null;
    const fn = new Function("state", "ayahBounds", `${m[0]}\nreturn ayahRawWordsAnywhere;`)(state, ayahBounds);
    const w = fn(2, 255);
    check("ayahRawWordsAnywhere: 2:255 kendi sayfasından, sondaki ayet işaretiyle", w.length > 40 && w[w.length - 1].t.startsWith("\u06dd") && eqWords(w, rawWordsOf(2, 255)));
    check("ayahRawWordsAnywhere: bilinmeyen ayet -> []", fn(2, 9999).length === 0 && fn(999, 1).length === 0);
  }
}
function eqWords(a, b) {
  return a.length === b.length && a.every((w, i) => w.i === b[i].i && w.t === b[i].t);
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("All checks passed (Arama modalı: işaretleme, ilk ekran, hızlı gitme, bölümler + önizleme/tümünü gör, konular, kelime meali, çipler, son aramalar, yükleme/hata/yarış, XSS, klavye, app.js kablolaması).");
}
