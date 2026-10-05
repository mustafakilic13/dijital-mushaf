// Erişilebilirlik regresyon kontrolü: (1) #nav-announcer canlı bölgesi ve
// announceNavigation() -- sayfa/sure/ayet geçişlerinde kısa bir anons
// üretiyor mu, "aynı metin tekrar gelirse de yeniden anons edilsin" kuralı
// çalışıyor mu; (2) js/render.js'teki addTextSelectionLayer'ın ürettiği
// gerçek/görünmez metin katmanının GERÇEK yapısı (foreignObject+div,
// aria-hidden YOK, üst SVG'de role="img" YOK) hem kaynak metin üzerinden
// hem jsdom'a monte edilip axe-core ile taranarak; (3) statik index.html
// kabuğunun (topbar/bottombar/modaller/nav-announcer) axe-core ile genel
// bir ARIA/etiket taraması; (4) canlı bölge KAPSAMI: #page-container canlı
// bölge DEĞİL (sayfa başına ~1200 karakter Arapça metin katmanını "eklenen
// içerik" diye okutuyordu), statik kabukta yalnızca #nav-announcer + arama
// durumu canlı, panelin kendi içeriği için canlı bölge yalnızca
// .word-meal-body'de, panel açılış/kapanış anonsları ve aynı pencerede gelen
// anonsların birleşmesi; (5) Arapça metin parçalarının DİLİ (WCAG 3.1.2):
// belge dili `tr`; sayfa metin katmanı, Arapça sure adları/ayet metinleri/kelime
// kartları, klavye tuşları ve konu açıklamalarındaki satır içi parçalar
// lang="ar" taşımalı -- yoksa ekran okuyucu Arapça metni Türkçe sesle okumaya
// çalışır. CSS'te Arapça font (--font-arabic) kullanan HER sınıf otomatik
// bulunup şablonlarda lang="ar" aranıyor; yani ileride eklenecek yeni bir
// Arapça öğe lang'sız gelirse test kırılır.
//
// ÖNEMLİ SINIR: axe-core burada jsdom üzerinde çalışıyor -- gerçek bir
// tarayıcının erişilebilirlik ağacını DEĞİL, yalnızca DOM/ARIA yapısını
// kural bazlı denetliyor (renk kontrastı, gerçek düzen/görünürlük gibi
// GÖRSEL kurallar jsdom'da güvenilir değil, o yüzden burada çalıştırılmıyor).
// Bu da gerçek bir NVDA/JAWS/VoiceOver/TalkBack testinin YERİNİ TUTMAZ --
// yalnızca yapısal bir ön-kontrol. app.js Node'da import edilemediği için
// (HarfBuzz/WASM açılışı, bkz. juz_subdivisions_test.mjs) announce /
// announceNavigation bloğu (app.js'te <announce> işaretleri arasında) kaynak
// metninden çıkarılıp sahte state/els ile çalıştırılıyor, aynı
// arama_ui_test.mjs'teki ayahRawWordsAnywhere kontrolü gibi.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM, VirtualConsole } from "jsdom";
import axeCore from "axe-core";
import { LineRenderer } from "../js/render.js";
import { renderWordMealCardsHTML } from "../js/wordmeal.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const html = readText("index.html");
const css = readText("css", "style.css");
const appSource = readText("js", "app.js");
const renderSource = readText("js", "render.js");
const surahs = JSON.parse(readText("data", "surahs.json"));

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// axe-core bir tarayıcı ortamı (window/document, requestAnimationFrame vb.)
// bekliyor; jsdom penceresini geçici olarak global'e koyup sonra geri alıyoruz
// ki başka bir jsdom penceresiyle çakışmasın.
async function runAxe(document, options) {
  const dom = document.defaultView;
  const context = document.documentElement; // document'ın kendisinin ownerDocument'ı null olduğundan axe context olarak kabul etmiyor
  const prev = { window: globalThis.window, document: globalThis.document, Node: globalThis.Node, getComputedStyle: globalThis.getComputedStyle };
  globalThis.window = dom;
  globalThis.document = document;
  globalThis.Node = dom.Node;
  globalThis.getComputedStyle = dom.getComputedStyle.bind(dom);
  if (!dom.requestAnimationFrame) dom.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  try {
    return await axeCore.run(context, options);
  } finally {
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.Node = prev.Node;
    globalThis.getComputedStyle = prev.getComputedStyle;
  }
}
// jsdom'da anlamlı sonuç vermeyen (gerçek düzen/renk hesabı gerektiren) ve
// dinamik olarak yüklenmeyen içerikle ilgili kurallar hariç tutuluyor --
// bkz. dosya başlığı.
const AXE_OPTIONS = {
  runOnly: { type: "rule", values: [] }, // aşağıda her çağrıda dolduruluyor
  resultTypes: ["violations"],
};
const STRUCTURAL_RULES = [
  "aria-allowed-attr", "aria-required-attr", "aria-required-children", "aria-required-parent",
  "aria-roles", "aria-valid-attr-value", "aria-valid-attr", "aria-hidden-body",
  "aria-hidden-focus", "button-name", "duplicate-id", "duplicate-id-aria",
  "image-alt", "label", "link-name", "role-img-alt", "svg-img-alt",
  "html-has-lang", "html-lang-valid", "valid-lang",
];

// -- #nav-announcer işaretlemesi ------------------------------------------------------------------
{
  const dom = new JSDOM(html);
  const d = dom.window.document;
  const ann = d.getElementById("nav-announcer");
  check("#nav-announcer var", !!ann);
  check("#nav-announcer: role=status + aria-live=polite + aria-atomic=true", ann.getAttribute("role") === "status" && ann.getAttribute("aria-live") === "polite" && ann.getAttribute("aria-atomic") === "true");
  check("#nav-announcer: .sr-only sınıfında (display:none/visibility:hidden DEĞİL, bkz. CSS kontrolü)", ann.classList.contains("sr-only"));
  check("#nav-announcer: body'nin doğrudan altında, kalıcı (page-container gibi dinamik yeniden yazılan bir alanın içinde değil)", ann.parentElement === d.body);
  check("#nav-announcer: başlangıçta boş (ilk render'da anlamsız bir metinle açılmasın)", ann.textContent.trim() === "");
  check("tekil: yalnızca bir #nav-announcer var", d.querySelectorAll("#nav-announcer").length === 1);
}
check(".sr-only CSS: display:none/visibility:hidden KULLANILMIYOR (ikisi de erişilebilirlik ağacından da kaldırır)", (() => {
  const m = /\.sr-only\s*\{([^}]*)\}/.exec(css);
  return !!m && !/display:\s*none/.test(m[1]) && !/visibility:\s*hidden/.test(m[1]);
})());
check(".sr-only CSS: standart 'visually hidden' kalıbı (position:absolute + clip + 1px boyut)", (() => {
  const m = /\.sr-only\s*\{([^}]*)\}/.exec(css);
  return !!m && /position:\s*absolute/.test(m[1]) && /clip:/.test(m[1]) && /width:\s*1px/.test(m[1]);
})());

// -- Canlı bölge KAPSAMI (index.html) ---------------------------------------------------------------------
// #page-container eskiden aria-live="polite" taşıyordu: sayfa her değiştiğinde yeniden kurulan SVG'nin
// görünmez metin katmanı (~1200 karakter Arapça) "eklenen içerik" sayılıp okutuluyor, 37 karakterlik gerçek
// anons onun yanında kayboluyordu (ayet paneli açılıp kapanırken de sayfa metni yeniden okunuyordu).
{
  const d = new JSDOM(html).window.document;
  const LIVE = '[aria-live]:not([aria-live="off"]),[role="status"],[role="alert"],[role="log"]';
  const pc = d.getElementById("page-container");
  check("#page-container var", !!pc);
  check("#page-container: aria-live YOK", !pc.hasAttribute("aria-live"));
  check("#page-container: canlı rol (status/alert/log) YOK ve canlı bir atanın içinde de değil", !pc.closest(LIVE));
  const liveIds = [...d.querySelectorAll(LIVE)].map((e) => e.id || e.className);
  check(`statik kabukta canlı bölgeler YALNIZCA #nav-announcer ve arama durumu (bulunan: ${liveIds.join(", ")})`, liveIds.length === 2 && liveIds.includes("nav-announcer") && liveIds.includes("arama-status"));
}

// -- announce()/announceNavigation() -- app.js'teki <announce> bloğu kaynak metinden çıkarılıp sahte state/els ile --
const ANNOUNCE_BLOCK = /\/\/ <announce>([\s\S]*?)\/\/ <\/announce>/.exec(appSource);
check("app.js: <announce> ... </announce> bloğu (announce + announceNavigation) bulundu", !!ANNOUNCE_BLOCK);
function makeAnnounce(state) {
  const els = { navAnnouncer: { textContent: "" } };
  // Blok kendi modül-düzeyi durumunu (bekleyen anonslar + zamanlayıcı) taşıdığından her çağrıda TAZE bir örnek kuruluyor.
  const api = new Function("state", "els", `${ANNOUNCE_BLOCK[1]}\nreturn { announce, announceNavigation };`)(state, els);
  return { fn: api.announceNavigation, announce: api.announce, els };
}
{
  const { fn, els } = makeAnnounce({ currentPage: 46, selectedAyah: { surah: 2, ayah: 142 }, surahs });
  check("hemen çağrıldığında bölge ÖNCE boşalıyor (senkron)", els.navAnnouncer.textContent === "");
  fn();
  check("çağrı ANINDA bölge boş kalıyor (gecikmeli set -- 'temizle sonra yaz' deseni)", els.navAnnouncer.textContent === "");
  await sleep(120);
  check("gecikme sonrası doğru metin: 'Sayfa 46, Bakara Suresi, 142. ayet'", els.navAnnouncer.textContent === "Sayfa 46, Bakara Suresi, 142. ayet");
}
{
  // Yâsîn (36) -- Türkçe adın gerçek surahs.json'dan doğru okunduğunu teyit
  const { fn, els } = makeAnnounce({ currentPage: 440, selectedAyah: { surah: 36, ayah: 1 }, surahs });
  fn();
  await sleep(120);
  check("sure adı gerçek surahs.json'dan doğru okunuyor (Yâsîn)", els.navAnnouncer.textContent === `Sayfa 440, ${surahs["36"].nameTurkish} Suresi, 1. ayet`);
}
{
  // Aynı hedefe İKİNCİ kez gidiş: metin öncekiyle AYNI olsa bile yine
  // boşalt-sonra-yaz döngüsünden geçmeli (aksi hâlde bazı AT'ler değişmeyen
  // canlı bölge içeriğini yeniden anons etmez).
  const { fn, els } = makeAnnounce({ currentPage: 2, selectedAyah: { surah: 1, ayah: 1 }, surahs });
  fn();
  await sleep(120);
  const first = els.navAnnouncer.textContent;
  els.navAnnouncer.textContent = first; // AT'nin son gördüğü hâli simüle ediyoruz
  fn();
  check("ikinci (aynı hedefe) çağrıda da ÖNCE boşalıyor -- tekrar anons garantisi", els.navAnnouncer.textContent === "");
  await sleep(120);
  check("...ve gecikme sonrası aynı doğru metne dönüyor", els.navAnnouncer.textContent === first && first.length > 0);
}
{
  const { fn, els } = makeAnnounce({ currentPage: 1, selectedAyah: { surah: 999, ayah: 1 }, surahs });
  fn();
  await sleep(120);
  check("olmayan sure numarasında ÇÖKMÜYOR, boş ada düşüyor", els.navAnnouncer.textContent === "Sayfa 1,  Suresi, 1. ayet");
}
{
  // Bir ayete dokununca AYNI senkron turda hem showPage'in "nav" anonsu hem panelin "panel" anonsu gelir:
  // ikincisi birincinin yerine yazılıp biri hiç duyulmamalı -- TEK metinde, geliş sırasıyla birleşmeli.
  const { fn, announce, els } = makeAnnounce({ currentPage: 51, selectedAyah: { surah: 3, ayah: 13 }, surahs });
  fn();
  announce("Âl-i İmrân 13 detayı açıldı", "panel");
  check("birleşik anonsta da yazma gecikmeli (bölge hemen boş)", els.navAnnouncer.textContent === "");
  await sleep(120);
  check("aynı pencerede gelen nav + panel anonsları TEK metinde, geliş sırasıyla birleşiyor", els.navAnnouncer.textContent === `Sayfa 51, ${surahs["3"].nameTurkish} Suresi, 13. ayet. Âl-i İmrân 13 detayı açıldı`);
}
{
  // Tuşa basılı tutarak sayfa çevirme: art arda "nav" anonsları -- yalnızca SONUNCUSU söylenmeli, birikmemeli.
  const st = { currentPage: 10, selectedAyah: { surah: 2, ayah: 1 }, surahs };
  const { fn, els } = makeAnnounce(st);
  fn();
  st.currentPage = 11;
  fn();
  st.currentPage = 12;
  fn();
  await sleep(120);
  check("art arda sayfa çevirmede yalnızca SON nav anonsu söyleniyor (birikmiyor)", els.navAnnouncer.textContent === `Sayfa 12, ${surahs["2"].nameTurkish} Suresi, 1. ayet`);
}
{
  // Bekleyen yazma gerçekleştikten SONRA gelen anons yeni bir tur açar; öncekini taşımaz.
  const { announce, els } = makeAnnounce({ currentPage: 1, selectedAyah: { surah: 1, ayah: 1 }, surahs });
  announce("birinci", "a");
  await sleep(120);
  check("tek anons: gecikme sonrası metin yazıldı", els.navAnnouncer.textContent === "birinci");
  announce("ikinci", "b");
  check("yeni tur ÖNCE bölgeyi boşaltıyor", els.navAnnouncer.textContent === "");
  await sleep(120);
  check("yeni tur yalnızca YENİ metni taşıyor (öncekinin artığı sızmıyor)", els.navAnnouncer.textContent === "ikinci");
}

// -- showPage tüm gezinmenin tek huni'si + her çağrıdan sonra anons ediyor ------------------------------
check("showPage: updateTopbar()'dan hemen sonra announceNavigation() çağrılıyor", /updateTopbar\(\);\s*\n\s*announceNavigation\(\);/.test(appSource));
for (const [name, re] of [
  ["goToPage", /function goToPage\(n\) \{\s*showPage\(n\);/],
  ["goToSurah", /function goToSurah\(surahNum\) \{[\s\S]{0,150}showPage\(page,/],
  ["goToAyah", /function goToAyah\(surahNum, ayahNum\) \{[\s\S]{0,150}showPage\(/],
  ["goToJuzNum (goToUnitNum üzerinden)", /function goToJuzNum\(juzNum\) \{ goToUnitNum\(state\.juz, juzNum\); \}/],
  ["goToNextPage", /function goToNextPage\(\) \{[\s\S]{0,120}showPage\(/],
  ["goToPrevPage", /function goToPrevPage\(\) \{[\s\S]{0,120}showPage\(/],
]) {
  check(`${name} → showPage'e çıkıyor (dolayısıyla anons da kapsıyor)`, re.test(appSource));
}
check("goToUnitNum da showPage'e çıkıyor (goToJuz/Hizb/Rub/Manzil'in ortak yolu)", /function goToUnitNum\([\s\S]{0,300}showPage\(/.test(appSource));

// -- ayet paneli: canlı bölge yalnızca GÖVDEDE + açılış/kapanış anonsu ---------------------------------------
// #page-container artık canlı değil; panelin KENDİ dinamik içeriği (kelime meali/meal ilk kez yüklenince gövdenin
// yeniden yazılması, tefsir sekmesine basınca içeriğin gelmesi) için duyuru yeri .word-meal-body. Tefsir sekmesi
// düğmeleri aria-expanded/aria-pressed taşımadığından içeriğin geldiğini bildiren tek şey bu bölge.
{
  const openFn = /function openWordMealStructure\([\s\S]*?\n\}\n/.exec(appSource);
  const closeFn = /function closeWordMeal\(\) \{[\s\S]*?\n\}\n/.exec(appSource);
  check("app.js: openWordMealStructure ve closeWordMeal bulundu", !!openFn && !!closeFn);
  check("openWordMealStructure: panel GÖVDESİ (.word-meal-body) kendi canlı bölgesi (aria-live=polite)", /state\.wordMeal\.bodyEl\.setAttribute\("aria-live", "polite"\)/.test(openFn[0]));
  check("openWordMealStructure: panel açılışı #nav-announcer üzerinden duyuruluyor ('<ref> detayı açıldı')", /announce\(`\$\{refText\} detayı açıldı`, "panel"\)/.test(openFn[0]));
  check("closeWordMeal: panel kapanışı #nav-announcer üzerinden duyuruluyor ('Ayet detayı kapatıldı')", /announce\("Ayet detayı kapatıldı", "panel"\)/.test(closeFn[0]));
  check("app.js hiçbir yerde #page-container'a aria-live atamıyor (sayfa metni yeniden okutulmasın)", !/pageContainer\.setAttribute\(\s*["']aria-live["']/.test(appSource));
  check("canlı bölge panelin sayfa dilimlerine (üst/alt, metin katmanı taşıyan) VERİLMİYOR", !/(topEl|bottomOuterEl|bottomInnerEl|panelEl)\.setAttribute\(\s*["']aria-live["']/.test(appSource));
}

// -- js/render.js: metin katmanı yapısı kaynak üzerinden -------------------------------------------------
check("render.js: addTextSelectionLayer hiçbir yerde aria-hidden UYGULAMIYOR", !/addTextSelectionLayer[\s\S]{0,900}aria-hidden/.test(renderSource));
check("render.js: metin katmanı foreignObject+div, gerçek textContent taşıyor (innerHTML/innerText değil -- kaçışsız enjeksiyon riski de yok)", /fo\.appendChild\(div\)/.test(renderSource) && /div\.textContent = lineText/.test(renderSource));
check("render.js/CSS: text-layer-line görünmezliği color:transparent ile (display:none/visibility:hidden DEĞİL -- ikisi erişilebilirlik ağacından da kaldırırdı)", (() => {
  const m = /\.text-layer-line\s*\{([^}]*)\}/.exec(css);
  return !!m && /color:\s*transparent/.test(m[1]) && !/display:\s*none/.test(m[1]) && !/visibility:\s*hidden/.test(m[1]);
})());
check("kaynakta hiçbir yerde SVG sayfa grubuna/köküne role=\"img\" verilmiyor (verilseydi içindeki gerçek metni tek bir resim gibi 'yutabilirdi')", !/role=\\?"img\\?"/.test(renderSource) && !/setAttribute\(\s*["']role["']\s*,\s*["']img["']\s*\)/.test(appSource + renderSource));

// -- GERÇEK addTextSelectionLayer çıktısı jsdom'a monte edilip kontrol ediliyor + axe ile taranıyor --------
// Bu blok eskiden render.js'teki DOM inşasının elle yazılmış bir KOPYASINI kuruyordu; render.js'ten ayrışırsa
// (ör. lang düşerse) test yine geçerdi. Artık sınıfın kendisi çalışıyor. render.js çıplak `document` kullandığından
// jsdom belgesi çağrı süresince global'e konuyor; canvas ölçümü jsdom'da yok, measureTextWidth kendi yedeğine düşüyor.
const ARABIC_LETTER_RE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
{
  const dom = new JSDOM(`<!DOCTYPE html><html lang="tr"><body></body></html>`, { pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const d = dom.window.document;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const svg = d.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 700 1000");
  const pageG = d.createElementNS(SVG_NS, "g");
  svg.appendChild(pageG);
  const LINE = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
  const prevDocument = globalThis.document;
  globalThis.document = d;
  try {
    new LineRenderer(null, null, 0, "").addTextSelectionLayer(pageG, LINE, 300, 300, 100);
  } finally {
    if (prevDocument === undefined) delete globalThis.document;
    else globalThis.document = prevDocument;
  }
  d.body.appendChild(svg);

  const line = d.querySelector(".text-layer-line");
  check("gerçek addTextSelectionLayer bir .text-layer-line üretti ve gerçek Arapça metni taşıyor", !!line && line.textContent === LINE);
  check('metin katmanı satırı lang="ar" taşıyor (belge dili tr; Arapça metin Arapça sesle okunsun)', !!line && line.getAttribute("lang") === "ar");
  check('...dir="rtl" da korunuyor', !!line && line.getAttribute("dir") === "rtl");
  check("...etkin dil Arapça (en yakın lang atası), belge dili ise tr kalıyor", !!line && line.closest("[lang]").getAttribute("lang") === "ar" && d.documentElement.getAttribute("lang") === "tr");
  check("bu düğümün hiçbir atasında aria-hidden=true YOK (kök html dahil)", (() => {
    let n = d.querySelector(".text-layer-line");
    while (n) {
      if (n.getAttribute && n.getAttribute("aria-hidden") === "true") return false;
      n = n.parentElement;
    }
    return true;
  })());

  const results = await runAxe(d, { ...AXE_OPTIONS, runOnly: { type: "rule", values: STRUCTURAL_RULES } });
  check(`metin katmanı parçası axe-core yapısal kurallarını ihlal etmiyor (${results.violations.map((v) => v.id).join(", ") || "yok"})`, results.violations.length === 0);
}

// -- Arapça metin parçaları: lang="ar" (WCAG 3.1.2, Dil Parçaları) --------------------------------------------
// Belge dili `tr`. Ekran okuyucunun/TTS'in sesi `lang`e göre seçildiği için işaretsiz Arapça metin Türkçe sesle
// okunmaya çalışılır. (a) statik kabuk, (b) çizim anında JS'in ürettiği şablonlar, (c) dili metinle birlikte
// değişen Oynat etiketi ve (d) veriden gelen / yardımcıyla üretilen parçalar denetleniyor. (b) için işaretlenecek
// sınıflar elle yazılmış bir liste DEĞİL, CSS'te Arapça font (--font-arabic) kullanan sınıflardan türetiliyor.
{
  const d = new JSDOM(html).window.document;
  const langOf = (el) => (el.closest("[lang]") ? el.closest("[lang]").getAttribute("lang") : "");
  const isArabicScope = (el) => /^ar(-|$)/i.test(langOf(el));

  // (a) Statik kabuk: Arapça harf içeren HER metin düğümü lang="ar" kapsamında olmalı...
  const walker = d.createTreeWalker(d.body, 4 /* NodeFilter.SHOW_TEXT */);
  let arabicTextNodes = 0;
  const unmarked = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!ARABIC_LETTER_RE.test(n.nodeValue)) continue;
    arabicTextNodes++;
    if (!isArabicScope(n.parentElement)) unmarked.push(n.parentElement.id || n.parentElement.className || n.parentElement.tagName);
  }
  check(`statik index.html: Arapça harf içeren ${arabicTextNodes} metin düğümünün hepsi lang="ar" kapsamında (işaretsiz: ${unmarked.slice(0, 5).join(", ") || "yok"})`, arabicTextNodes > 0 && unmarked.length === 0);
  // ...ve ters yön: lang="ar" kapsamına yanlışlıkla Türkçe metin girmesin.
  const turkishUnderAr = [...d.querySelectorAll('[lang="ar"]')].filter((el) => el.textContent.trim() && !ARABIC_LETTER_RE.test(el.textContent));
  check(`statik index.html: lang="ar" taşıyan hiçbir öğe Arapça harf içermeyen metin taşımıyor (${turkishUnderAr.map((e) => e.id || e.className).join(", ") || "yok"})`, turkishUnderAr.length === 0);
  // İçeriği JS ile dolan öğelerde statik metin düğümü yok; genel tarama onları görmez, ayrıca açıkça bakılıyor.
  check('#surah-btn-arabic lang="ar" (içeriği JS ile doluyor: Arapça sure adı)', !!d.getElementById("surah-btn-arabic") && d.getElementById("surah-btn-arabic").getAttribute("lang") === "ar");
  check('#play-btn-label ilk hâliyle lang="ar" (Arapça ibare)', !!d.getElementById("play-btn-label") && d.getElementById("play-btn-label").getAttribute("lang") === "ar");
  const keys = [...d.querySelectorAll(".yaz-key[data-char]")];
  check(`Arapça klavye: ${keys.length} harf tuşunun hepsi lang="ar"`, keys.length > 20 && keys.every((k) => k.getAttribute("lang") === "ar"));
  const hint = d.querySelector(".yaz-key[data-hint]");
  check("klavyedeki İpucu tuşu Arapça kapsamında DEĞİL (aria-label Türkçe)", !!hint && !hint.closest('[lang="ar"]') && /İpucu/.test(hint.getAttribute("aria-label") || ""));

  // (b) Şablonlar: CSS'te --font-arabic kullanan her sınıf, taşındığı her etiketle birlikte lang="ar" almalı.
  const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const arabicFontClasses = new Set();
  for (const m of cssNoComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/font-family:\s*var\(--font-arabic\)/.test(m[2])) continue;
    for (const selector of m[1].split(",")) {
      const lastCompound = selector.trim().split(/\s+/).pop();
      for (const c of lastCompound.matchAll(/\.([A-Za-z0-9_-]+)/g)) arabicFontClasses.add(c[1]);
    }
  }
  check(`CSS ayrıştırması: --font-arabic kullanan sınıflar bulundu (${[...arabicFontClasses].join(", ")})`, ["modal-item-arabic", "info-name-arabic", "wbw-ar", "ayah-arabic-text", "yaz-key", "ar"].every((c) => arabicFontClasses.has(c)));
  // `.ar` (konu açıklamalarındaki satır içi parça) şablonda değil VERİDE geliyor: markArabicSpans ve topics_test.mjs kapsıyor (bkz. (d)).
  const stripJsComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\w"'`\\])\/\/.*$/gm, "$1");
  const jsDir = path.join(ROOT, "js");
  const scanTargets = [
    ["index.html", html],
    ...fs.readdirSync(jsDir).filter((f) => f.endsWith(".js")).map((f) => [`js/${f}`, stripJsComments(fs.readFileSync(path.join(jsDir, f), "utf-8"))]),
  ];
  let verifiedTags = 0;
  const missingLang = [];
  for (const [file, src] of scanTargets) {
    for (const m of src.matchAll(/<([a-zA-Z][\w-]*)\b([^<>]*)>/g)) {
      const cls = /\bclass="([^"]*)"/.exec(m[2]);
      if (!cls) continue;
      const classes = cls[1].split(/\s+/);
      if (!classes.some((c) => c !== "ar" && arabicFontClasses.has(c))) continue;
      if (classes.includes("yaz-key--hint")) continue; // klavyedeki 💡 İpucu tuşu: tuş sınıfını paylaşıyor ama Arapça metin taşımıyor
      verifiedTags++;
      if (!/\blang="ar"/.test(m[2])) missingLang.push(`${file}: <${m[1]} class="${cls[1]}">`);
    }
  }
  check(`Arapça fontlu sınıf taşıyan ${verifiedTags} etiketin (index.html + js/*.js şablonları) hepsi lang="ar" içeriyor (eksik: ${missingLang.slice(0, 4).join(" | ") || "yok"})`, verifiedTags > 30 && missingLang.length === 0);

  // (c) Oynat düğmesinin etiketi (düğmenin erişilebilir adı) hem Arapça ibare hem Türkçe durum metni taşıyor:
  // metin ve dil birlikte değişmeli, yoksa "Yükleniyor…" Arapça sesle ya da ibare Türkçe sesle okunur.
  const labelWrites = appSource.match(/els\.playBtnLabel\.textContent\s*=/g) || [];
  check("app.js: #play-btn-label metni yalnızca setPlayLabel() içinde yazılıyor (dil metinle birlikte değişsin)", labelWrites.length === 1);
  const setPlayLabelSrc = /function setPlayLabel\(text, lang\) \{[\s\S]*?\n\}/.exec(appSource);
  check("app.js: setPlayLabel bulundu", !!setPlayLabelSrc);
  if (setPlayLabelSrc) {
    const labelEls = { playBtnLabel: { textContent: "", lang: "" } };
    const setPlayLabel = new Function("els", `${setPlayLabelSrc[0]}\nreturn setPlayLabel;`)(labelEls);
    setPlayLabel("Yükleniyor…", "tr");
    check('setPlayLabel: metin ve dil birlikte yazılıyor (Türkçe durum metni → "tr")', labelEls.playBtnLabel.textContent === "Yükleniyor…" && labelEls.playBtnLabel.lang === "tr");
    setPlayLabel("بسم الله الرحمن الرحيم", "ar");
    check('setPlayLabel: metin ve dil birlikte yazılıyor (Arapça ibare → "ar")', labelEls.playBtnLabel.textContent === "بسم الله الرحمن الرحيم" && labelEls.playBtnLabel.lang === "ar");
  }
  const labelCalls = [...appSource.matchAll(/setPlayLabel\(\s*"([^"]+)"\s*,\s*"([a-z]+)"\s*\)/g)];
  check(`app.js: ${labelCalls.length} setPlayLabel çağrısı bulundu`, labelCalls.length >= 4);
  for (const [, text, lang] of labelCalls) {
    check(`setPlayLabel("${text}", "${lang}"): dil metne uyuyor (Arapça harf varsa "ar", yoksa "tr")`, lang === (ARABIC_LETTER_RE.test(text) ? "ar" : "tr"));
  }

  // (d) Veriden gelen / yardımcıyla üretilen parçalar. markArabicSpans'in kendi birim testi ve veri taraması
  // test/topics_test.mjs'te; burada yalnızca app.js'e BAĞLI olduğuna (ham ${t.description} enjeksiyonu kalmadığına) bakılıyor.
  check("app.js: konu açıklaması markArabicSpans() ile basılıyor, ham ${t.description} enjeksiyonu kalmadı", /markArabicSpans\(t\.description\)/.test(appSource) && !/\$\{t\.description\}/.test(appSource));
  const cardsHTML = renderWordMealCardsHTML([{ arabic: "كِتَٰبٌ", translation: "kitap" }]);
  check('renderWordMealCardsHTML: Arapça kelime lang="ar" taşıyor, Türkçe karşılığı (.wbw-tr) taşımıyor', /<span class="wbw-ar" lang="ar">كِتَٰبٌ<\/span>/.test(cardsHTML) && /<span class="wbw-tr">kitap<\/span>/.test(cardsHTML));
}

// -- Statik index.html kabuğu: axe-core genel yapısal tarama ------------------------------------------------
{
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const results = await runAxe(dom.window.document, { ...AXE_OPTIONS, runOnly: { type: "rule", values: STRUCTURAL_RULES } });
  const details = results.violations.map((v) => `${v.id} (${v.nodes.length})`).join(", ");
  check(`statik HTML kabuğu (topbar/bottombar/modaller/#nav-announcer) axe-core yapısal kurallarını ihlal etmiyor (${details || "yok"})`, results.violations.length === 0);
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log(
    "All checks passed (nav-announcer yapısı + gecikmeli/tekrar-anons/birleşik-anons mantığı, canlı bölge kapsamı (#page-container canlı değil, panel gövdesi canlı, panel açılış/kapanış anonsu), showPage huni kontrolü, metin katmanının aria-hiding'siz yapısı, Arapça metin parçalarında lang=\"ar\" (gerçek LineRenderer çıktısı, statik kabuk, CSS'ten türetilen şablon taraması, Oynat etiketi), axe-core yapısal tarama (dil kuralları dahil)). NOT: bunlar otomatik/yapısal kontroller -- gerçek bir ekran okuyucu testinin yerini tutmaz."
  );
}
