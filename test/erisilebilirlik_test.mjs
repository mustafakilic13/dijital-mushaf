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
// Arapça öğe lang'sız gelirse test kırılır; (6) ayet paneli açıkken sayfa
// metninin erişilebilirlik ağacında BİR kez görünmesi: panelin alt sayfa
// dilimi (üst SVG'nin klonu, tüm metin katmanıyla) aria-hidden olmalı, gerçek
// üst dilim/panel ağaçta kalmalı, kapanınca hiçbir işaret kalmamalı, alt
// dilime tıklama (inert/pointer-events yok) ve içindeki metnin
// seçilebilirliği (klon sadık) bozulmamalı; (7) Oynat düğmesinin erişilebilir
// adı: ad = "<Türkçe eylem> <görünen Arapça etiket>" (aria-labelledby; boşta
// "Oynat", çalarken ve yüklenirken "Duraklat"), ekrandaki metni içeriyor (WCAG
// 2.5.3), aria-pressed yok (ad durumla birlikte değişiyor), eylem sözcüğü ile
// .playing sınıfı tek fonksiyondan (setPlayActive) yazılıyor; ad, axe-core'un
// accname uygulamasıyla HESAPLANIYOR (elle yazılmış bir ad değil); (8) renk
// kontrastı (WCAG 1.4.3 / 1.4.11) ve odak göstergesi: CSS'ten (token'lar,
// color-mix dahil) türetilen oranlar -- altın metin/dolgu --gold-deep, tefsir
// yeşil/kahve/mavi yazısı panel ve .translation zeminlerinde, alternatif rüku
// rakamı kâğıt zeminde >= 4,5:1; dekoratif altınlar (--gold, --gold-soft) metin
// rengi olamaz; `outline: none` yalnızca yerine başka gösterge konmuş yerlerde.
// (Gerçek tarayıcıda axe-core color-contrast taraması test'in dışında, elle
// çalıştırıldı; README'de sayıları var.)
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

// -- ayet paneli açıkken sayfa metni erişilebilirlik ağacında BİR kez ---------------------------------------
// openWordMealStructure sayfayı üçe böler: üst dilim (gerçek, önbellekteki SVG), panel, alt dilim (AYNI SVG'nin
// klonu, yukarı kaydırılmış). Kesim yalnızca görsel (overflow:hidden); iki SVG de görünmez metin katmanının TÜM
// satırlarını taşıyor. Alt kopya gizlenmeden panel açılınca sayfa metni ağaçta iki kez görünüyordu (başsız
// Chromium'da 1. sayfa: 7 + 7 Arapça satır, Bakara 3. sayfa: 15 + 15). Beklenen: alt kopya aria-hidden; GERÇEK olan
// üst dilim, panel ve kapanınca geri kurulan tek SVG ağaçta KALIR (metin katmanını erişilebilirlikten çıkarmak
// yanlış olurdu). aria-hidden yerine `inert` KULLANILAMAZ: inert fare/dokunma tıklamasını da keser, oysa alt
// dilimdeki ayete dokunmak çalışmaya devam etmeli. Gerçek openWordMealStructure/mountClosedPage (app.js'ten
// kaynak olarak çıkarılıp) gerçek index.html'e, gerçek LineRenderer metin katmanıyla çalıştırılıyor.
{
  const fnSrc = (re, what) => {
    const m = re.exec(appSource);
    check(`app.js: ${what} bulundu`, !!m);
    return m ? m[0] : "";
  };
  const openSrc = fnSrc(/function openWordMealStructure\([\s\S]*?\n\}\n/, "openWordMealStructure");
  const mountSrc = fnSrc(/function mountClosedPage\(svg\) \{[\s\S]*?\n\}\n/, "mountClosedPage");
  const escSrc = fnSrc(/function escapeHtml\(s\) \{[\s\S]*?\n\}\n/, "escapeHtml");

  const dom = new JSDOM(html, { pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const d = dom.window.document;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const LINES = ["بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ", "الرَّحْمَٰنِ الرَّحِيمِ", "مَالِكِ يَوْمِ الدِّينِ"];
  const svg = d.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "mushaf-page-svg");
  svg.setAttribute("viewBox", "0 0 700 1000");
  const pageG = d.createElementNS(SVG_NS, "g");
  svg.appendChild(pageG);
  const prevDocument = globalThis.document;
  globalThis.document = d;
  try {
    const r = new LineRenderer(null, null, 0, "");
    LINES.forEach((t, i) => r.addTextSelectionLayer(pageG, t, 300, 200 + i * 150, 100));
  } finally {
    if (prevDocument === undefined) delete globalThis.document;
    else globalThis.document = prevDocument;
  }

  const pc = d.getElementById("page-container");
  const state = {
    currentPage: 1,
    pageCache: new Map([[1, { svg }]]),
    wordMeal: { open: false, panelEl: null, bodyEl: null, topEl: null, topSvg: null, bottomOuterEl: null, bottomInnerEl: null, bottomSvg: null, cutY: 500 },
  };
  const els = { pageContainer: pc };
  const calls = { layout: 0, announce: [], raf: [] };
  const stubs = {
    announce: (text, key) => calls.announce.push([text, key]),
    layoutPageContainer: () => calls.layout++,
    closeWordMeal: () => {},
    onTafsirTabClick: () => {},
    openTopicsModal: () => {},
    requestAnimationFrame: (cb) => calls.raf.push(cb),
  };
  const env = new Function(
    "state", "els", "document", "announce", "layoutPageContainer", "closeWordMeal", "onTafsirTabClick", "openTopicsModal", "requestAnimationFrame",
    `${escSrc}\n${openSrc}\n${mountSrc}\nreturn { openWordMealStructure, mountClosedPage };`
  )(state, els, d, stubs.announce, stubs.layoutPageContainer, stubs.closeWordMeal, stubs.onTafsirTabClick, stubs.openTopicsModal, stubs.requestAnimationFrame);

  // Erişilebilirlik ağacında GÖRÜNEN: kendisi ya da herhangi bir atası aria-hidden="true" olmayan.
  const exposed = (el) => !el.closest('[aria-hidden="true"]');
  const exposedLines = (root) => [...root.querySelectorAll(".text-layer-line")].filter(exposed).map((l) => l.textContent);
  const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex],[contenteditable]';
  const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  env.mountClosedPage(svg);
  check("kapalı sayfa (başlangıç): metin satırlarının hepsi ağaçta, bir kez", sameList(exposedLines(pc), LINES));
  const canonicalBefore = svg.outerHTML;

  const open = () => {
    const panel = env.openWordMealStructure("<p>gövde</p>", "Fâtiha Suresi, 1. ayet");
    return { panel, top: pc.querySelector(".page-slice--top"), bottom: pc.querySelector(".page-slice--bottom") };
  };
  let o = open();
  check("panel açıldı: #page-container = [üst dilim, panel, alt dilim] sırasıyla", sameList([...pc.children].map((c) => c.classList.contains("page-slice--top") ? "top" : c.classList.contains("word-meal-panel") ? "panel" : c.classList.contains("page-slice--bottom") ? "bottom" : "?"), ["top", "panel", "bottom"]));
  check("üst dilim GERÇEK (önbellekteki) SVG'yi taşıyor, alt dilim ayrı bir klon taşıyor", o.top.querySelector("svg") === svg && !!o.bottom.querySelector("svg") && o.bottom.querySelector("svg") !== svg);
  check(`alt kopya gerçekten yinelenen metni taşıyor (${LINES.length} satır; test boş bir kopyayı gizlemiyor)`, o.bottom.querySelectorAll(".text-layer-line").length === LINES.length);
  check("alt dilim (kopya) aria-hidden=\"true\" taşıyor", o.bottom.getAttribute("aria-hidden") === "true");
  check(`panel açıkken sayfa metni ağaçta BİR kez: ${LINES.length} satır (iki kez olsaydı ${LINES.length * 2})`, sameList(exposedLines(pc), LINES));
  check("ağaçta kalan satırlar üst dilimin (gerçek SVG'nin) satırları; alt kopyadan hiçbiri görünmüyor", sameList(exposedLines(o.top), LINES) && exposedLines(o.bottom).length === 0);
  check("üst dilim ve panel ağaçta (hiçbirinin atasında aria-hidden=true yok)", exposed(o.top) && exposed(o.panel) && exposed(pc));
  check("panel kendi adını koruyor (role=region, aria-label '<ref> detayı') ve gövdesi canlı bölge", o.panel.getAttribute("role") === "region" && o.panel.getAttribute("aria-label") === "Fâtiha Suresi, 1. ayet detayı" && o.panel.querySelector(".word-meal-body").getAttribute("aria-live") === "polite");
  const hiddenOutsidePanel = [...pc.querySelectorAll('[aria-hidden="true"]')].filter((e) => !e.closest(".word-meal-panel"));
  check("#page-container içinde (panelin kendi süs ikonu hariç) aria-hidden taşıyan TEK öğe alt dilim", hiddenOutsidePanel.length === 1 && hiddenOutsidePanel[0] === o.bottom);
  check("gerçek (üst) SVG'ye HİÇ dokunulmadı: işaretlemesi açılıştan önceki ile birebir aynı (kapanınca eski işaret kalma riski yok)", svg.outerHTML === canonicalBefore);
  check("klon sadık: alt dilimdeki SVG'nin işaretlemesi gerçek SVG ile birebir aynı (metin seçilebilir/kopyalanabilir kalıyor, yalnızca ağaçtan çıkarıldı)", o.bottom.querySelector("svg").outerHTML === svg.outerHTML);

  // Fare/dokunma yolu: aria-hidden tıklamayı etkilemez, ama inert/pointer-events etkiler -- ikisi de olmamalı.
  check("alt dilimde ve içinde `inert` YOK (inert, alt dilimdeki ayete dokunmayı keserdi)", !o.bottom.querySelector("[inert]") && !o.bottom.hasAttribute("inert") && !o.bottom.querySelector(".page-slice-inner").hasAttribute("inert"));
  check("alt dilimde satır içi pointer-events yok", !/pointer-events/.test(o.bottom.getAttribute("style") || "") && !/pointer-events/.test(o.bottom.querySelector(".page-slice-inner").getAttribute("style") || ""));
  const cssNoComments2 = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const sliceRules = [...cssNoComments2.matchAll(/([^{}]*\.page-slice[^{}]*)\{([^{}]*)\}/g)];
  check(`CSS: .page-slice* kurallarında (${sliceRules.length}) pointer-events:none yok`, sliceRules.length >= 3 && sliceRules.every((m) => !/pointer-events\s*:\s*none/.test(m[2])));
  check("app.js: openWordMealStructure alt dilimi inert YAPMIYOR (setAttribute('inert') / .inert = yok)", !/setAttribute\(\s*["']inert["']|\.inert\s*=/.test(openSrc));

  // aria-hidden içinde odaklanabilir öğe olmamalı (WCAG 4.1.2): yoksa klavye kullanıcısı ağaçta olmayan bir öğeye
  // düşerdi. Bu açıkça denetleniyor, çünkü jsdom'da axe'in 'aria-hidden-focus' kuralı bir <button>'ı bile yakalamadı.
  check("alt kopyada odaklanabilir öğe YOK (gizlemek klavye yolunu etkilemiyor)", o.bottom.querySelectorAll(FOCUSABLE).length === 0 && svg.querySelectorAll(FOCUSABLE).length === 0);
  {
    const results = await runAxe(d, { ...AXE_OPTIONS, runOnly: { type: "rule", values: STRUCTURAL_RULES } });
    check(`panel AÇIKKEN belge axe-core yapısal kurallarını ihlal etmiyor (${results.violations.map((v) => v.id).join(", ") || "yok"})`, results.violations.length === 0);
  }

  // Her açılış yapıyı baştan kuruyor: ikinci açılışta da (başka bir ayet için) kopya gizli, metin yine bir kez.
  env.mountClosedPage(svg);
  check("panel kapanınca (mountClosedPage): tek SVG geri geliyor, #page-container içinde HİÇ aria-hidden kalmıyor", pc.children.length === 1 && pc.firstElementChild === svg && pc.querySelectorAll("[aria-hidden]").length === 0);
  check("...ve sayfa metni yine ağaçta, bir kez", sameList(exposedLines(pc), LINES));
  check("...panel durumundaki alt dilim işaretçileri sıfırlandı", state.wordMeal.bottomOuterEl === null && state.wordMeal.bottomSvg === null);
  o = open();
  check("ikinci açılış: alt dilim yine aria-hidden, sayfa metni yine bir kez", o.bottom.getAttribute("aria-hidden") === "true" && sameList(exposedLines(pc), LINES));
  check("ikinci açılış: gerçek SVG yine değişmedi", svg.outerHTML === canonicalBefore);
  env.mountClosedPage(svg);
  check("ikinci kapanış: temiz", pc.querySelectorAll("[aria-hidden]").length === 0 && sameList(exposedLines(pc), LINES));

  // Kaynak: gizleme alt dilim üzerinde ve aria-hidden ile yapılıyor (davranış kontrolleri asıl güvence, bu yalnızca kayıt).
  check('app.js: openWordMealStructure alt dilime aria-hidden="true" veriyor', /bottomOuterEl\.setAttribute\(\s*"aria-hidden"\s*,\s*"true"\s*\)/.test(openSrc));
  check("app.js: üst dilime/panele/#page-container'a aria-hidden verilmiyor", !/(topEl|panelEl|innerEl|svg|els\.pageContainer)\.setAttribute\(\s*["']aria-hidden["']/.test(openSrc + mountSrc));
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

// -- Oynat düğmesinin erişilebilir adı: Türkçe eylem + görünen etiket ----------------------------------------
// Ad eskiden YALNIZCA görünen Arapça ibareydi ("بسم الله الرحمن الرحيم", çalarken "صدق الله العظيم") ve düğme ayrıca
// aria-pressed taşıyordu: gerçek Chromium'da ad ibareden, durum "pressed=false/true"dan ibaretti; düğmenin ne
// yaptığını söyleyen Türkçe tek sözcük yoktu (yükleme anındaki "Yükleniyor…" hariç). Şimdi ad = "<eylem> <görünen
// etiket>" (aria-labelledby="play-btn-action play-btn-label"): eylem Türkçe ve görünmez (.sr-only; boştayken
// "Oynat", çalarken -yüklenirken de, ikinci dokunuş durdurur- "Duraklat"), etiket ekranda görünen metin. Ad görünen
// metni içeriyor (WCAG 2.5.3: sesle kumanda eden kullanıcı ekrandaki metni söyleyerek düğmeye basabilsin). Ad
// durumla birlikte değiştiği için aria-pressed YOK (ad da durum da değişirse "Duraklat, geçiş düğmesi, basılı"
// gibi çelişkili okunur). Gerçek setPlayLabel/setPlayActive (app.js'ten kaynak olarak çıkarılıp) gerçek
// index.html'e uygulanıyor ve ad, axe-core'un accname uygulamasıyla HESAPLANIYOR (elle yazılmış bir ad hesabı değil).
playName: {
  const d = new JSDOM(html, { pretendToBeVisual: true, virtualConsole: new VirtualConsole() }).window.document;
  const dom = d.defaultView;
  function accessibleName(el) {
    const prev = { window: globalThis.window, document: globalThis.document, Node: globalThis.Node, getComputedStyle: globalThis.getComputedStyle };
    globalThis.window = dom;
    globalThis.document = d;
    globalThis.Node = dom.Node;
    globalThis.getComputedStyle = dom.getComputedStyle.bind(dom);
    try {
      axeCore.setup(d.documentElement); // düz ağaç bir anlık görüntü: her ölçümden önce yeniden kuruluyor
      return axeCore.commons.text.accessibleText(el);
    } finally {
      try {
        axeCore.teardown();
      } catch (e) {
        /* kurulum hiç yapılamadıysa kapatacak bir şey yok */
      }
      globalThis.window = prev.window;
      globalThis.document = prev.document;
      globalThis.Node = prev.Node;
      globalThis.getComputedStyle = prev.getComputedStyle;
    }
  }
  const btn = d.getElementById("play-btn");
  const actionEl = d.getElementById("play-btn-action");
  const labelEl = d.getElementById("play-btn-label");
  const BESMELE = "بسم الله الرحمن الرحيم";
  const SADAKA = "صدق الله العظيم";

  // (a) Statik işaretleme
  check("#play-btn, #play-btn-action ve #play-btn-label var; ikisi de düğmenin içinde", !!btn && !!actionEl && !!labelEl && btn.contains(actionEl) && btn.contains(labelEl));
  if (!btn || !actionEl || !labelEl || !btn.contains(actionEl) || !btn.contains(labelEl)) break playName; // öğeler yoksa kalan kontroller anlamsız (ve null'a erişip çöker)
  check('#play-btn type="button"', btn.getAttribute("type") === "button");
  check("#play-btn aria-pressed TAŞIMIYOR (ad durumla birlikte değişiyor; ikisi birden çelişkili okunur)", !btn.hasAttribute("aria-pressed"));
  check('#play-btn aria-labelledby="play-btn-action play-btn-label" (önce Türkçe eylem, sonra görünen etiket)', btn.getAttribute("aria-labelledby") === "play-btn-action play-btn-label");
  check("#play-btn aria-label TAŞIMIYOR (aria-label görünen Arapça ibareyi addan çıkarırdı: WCAG 2.5.3)", !btn.hasAttribute("aria-label"));
  // (spesifikasyon aria-labelledby ile doğrudan başvurulan gizli öğeyi de adda sayıyor; ama gerçek ekran okuyucuyla
  // denenmedi -- bu yüzden en az riskli, yaygın kalıp seçildi: görsel olarak gizli ama erişilebilirlik ağacında)
  check("eylem öğesi görsel olarak gizli (.sr-only), hidden/aria-hidden/display:none DEĞİL", actionEl.classList.contains("sr-only") && !actionEl.hasAttribute("hidden") && !actionEl.hasAttribute("aria-hidden") && !actionEl.closest("[hidden],[aria-hidden]"));
  check('eylem öğesi Türkçe kapsamında (kendi lang\'ı yok, etkin dil html lang="tr")', !actionEl.hasAttribute("lang") && actionEl.closest("[lang]").getAttribute("lang") === "tr" && d.documentElement.getAttribute("lang") === "tr");
  check('görünen etiket Arapça kapsamında kalıyor (lang="ar") ve ilk metni besmele', labelEl.getAttribute("lang") === "ar" && labelEl.textContent === BESMELE);
  check('eylem öğesinin ilk metni "Oynat"', actionEl.textContent === "Oynat");
  check(`ilk hâlin erişilebilir adı (axe-core accname) "Oynat ${BESMELE}"`, accessibleName(btn) === `Oynat ${BESMELE}`);

  // (b) Davranış: gerçek setPlayLabel/setPlayActive; startPlayback / stopPlayback / startEzberPlayback'in yazdığı dizilerle
  const setPlayLabelSrc2 = /function setPlayLabel\(text, lang\) \{[\s\S]*?\n\}/.exec(appSource);
  const setPlayActiveSrc = /function setPlayActive\(active\) \{[\s\S]*?\n\}/.exec(appSource);
  check("app.js: setPlayLabel ve setPlayActive bulundu", !!setPlayLabelSrc2 && !!setPlayActiveSrc);
  if (setPlayLabelSrc2 && setPlayActiveSrc) {
    const els = { playBtn: btn, playBtnAction: actionEl, playBtnLabel: labelEl };
    const { setPlayLabel, setPlayActive } = new Function("els", `${setPlayLabelSrc2[0]}\n${setPlayActiveSrc[0]}\nreturn { setPlayLabel, setPlayActive };`)(els);
    const states = [
      ["startPlayback, veri yüklenirken", () => { setPlayActive(true); setPlayLabel("Yükleniyor…", "tr"); }, "Duraklat", "Yükleniyor…", "tr", true],
      ["startPlayback, veri geldi, çalıyor", () => setPlayLabel(SADAKA, "ar"), "Duraklat", SADAKA, "ar", true],
      ["stopPlayback", () => { setPlayActive(false); setPlayLabel(BESMELE, "ar"); }, "Oynat", BESMELE, "ar", false],
      ["startEzberPlayback (Ezber > Dinle)", () => { setPlayActive(true); setPlayLabel(SADAKA, "ar"); }, "Duraklat", SADAKA, "ar", true],
      ["stopPlayback (Ezber > Dinle bitti)", () => { setPlayActive(false); setPlayLabel(BESMELE, "ar"); }, "Oynat", BESMELE, "ar", false],
    ];
    for (const [what, run, action, label, lang, playing] of states) {
      run();
      const name = accessibleName(btn);
      check(`${what}: ad = "${action} ${label}" (hesaplanan: "${name}")`, name === `${action} ${label}`);
      check(`${what}: ad Türkçe eylemle BAŞLIYOR ("${action}")`, name.startsWith(`${action} `));
      check(`${what}: ad ekranda görünen etiketi içeriyor (WCAG 2.5.3)`, name.includes(labelEl.textContent) && labelEl.textContent === label);
      check(`${what}: etiketin dili metne uyuyor ("${lang}")`, labelEl.getAttribute("lang") === lang);
      check(`${what}: aria-pressed yok, .playing ${playing ? "var" : "yok"}`, !btn.hasAttribute("aria-pressed") && btn.classList.contains("playing") === playing);
    }
  }

  // (c) Kaynak: eylem sözcüğü ve .playing TEK yerden yazılıyor; üç çağrı noktası + tıklama işleyicisiyle tutarlı
  check("app.js: .playing sınıfı yalnızca setPlayActive içinde yazılıyor (ad ile görünüm ayrışmasın)", (appSource.match(/playBtn\.classList\.(?:add|remove|toggle)\(/g) || []).length === 1 && /function setPlayActive\(active\) \{[\s\S]*?playBtn\.classList\.toggle\("playing", active\)/.test(appSource));
  check("app.js: eylem sözcüğü (#play-btn-action) yalnızca setPlayActive içinde yazılıyor", (appSource.match(/els\.playBtnAction\.textContent\s*=/g) || []).length === 1);
  check('app.js: setPlayActive eylemi "Duraklat"/"Oynat" olarak yazıyor', /els\.playBtnAction\.textContent = active \? "Duraklat" : "Oynat";/.test(appSource));
  check("app.js: düğmeye hiçbir yerde aria-pressed yazılmıyor", !/playBtn\.(?:setAttribute|toggleAttribute|removeAttribute)\(\s*["']aria-pressed/.test(appSource));
  const startFn = /async function startPlayback\(\) \{[\s\S]*?\n\}\n/.exec(appSource);
  const stopFn = /function stopPlayback\(\) \{[\s\S]*?\n\}\n/.exec(appSource);
  const ezberFn = /async function startEzberPlayback\([^)]*\) \{[\s\S]*?\n\}\n/.exec(appSource);
  check("app.js: startPlayback / stopPlayback / startEzberPlayback bulundu", !!startFn && !!stopFn && !!ezberFn);
  check("startPlayback: setPlayActive(true) İLK await'ten ÖNCE (veri yüklenirken de çalıyor sayılır: ad 'Duraklat Yükleniyor…', ikinci dokunuş durdurur)", !!startFn && startFn[0].includes("setPlayActive(true)") && startFn[0].includes("await ") && startFn[0].indexOf("setPlayActive(true)") < startFn[0].indexOf("await ") && startFn[0].indexOf("setPlayActive(true)") < startFn[0].indexOf('setPlayLabel("Yükleniyor…"'));
  check('app.js: els.playBtnAction, index.html\'deki #play-btn-action\'ı bulacak şekilde tanımlı (yoksa setPlayActive ilk durdurmada null.textContent ile çöker)', /\bplayBtnAction: document\.getElementById\("play-btn-action"\),/.test(appSource) && html.includes('id="play-btn-action"'));
  check("stopPlayback: setPlayActive(false) ve besmele etiketi", !!stopFn && /setPlayActive\(false\)/.test(stopFn[0]) && /setPlayLabel\("بسم الله الرحمن الرحيم", "ar"\)/.test(stopFn[0]));
  check("startEzberPlayback: setPlayActive(true)", !!ezberFn && /setPlayActive\(true\)/.test(ezberFn[0]));
  check("app.js: setPlayActive tam 3 yerden çağrılıyor (başlat, durdur, Ezber başlat)", (appSource.match(/setPlayActive\(/g) || []).length === 4); // 3 çağrı + 1 tanım
  check("tıklama işleyicisi: çalıyorsa durdur, değilse başlat (ad 'Duraklat' iken düğme gerçekten durduruyor)", /els\.playBtn\.addEventListener\("click", \(\) => \{\s*if \(state\.playback\.active\) stopPlayback\(\);\s*else startPlayback\(\);\s*\}\);/.test(appSource));
}

// -- Renk kontrastı (WCAG 1.4.3 / 1.4.11) ve odak göstergesi: CSS'ten türetilen kontroller ----------------------
// Gerçek Chromium'da axe-core color-contrast + elle (arka planı katman katman birleştiren) denetim, 17 durumda
// (açılış, 7 modal, ayet paneli + tefsir, klavye ipucu, çalarken, 2. ve 3. sayfa) ve 430/1200 px'te yamadan ÖNCE
// şu ihlal çiftlerini buldu: beyaz yazı / altın rozet 3,58:1 ("Ontoloji"), altın bağlantı metni / --shell-bg 3,26:1
// (konu açıklamaları, sure bilgisi), açık yazı / altın dolgu 3,26:1 (çalarken Oynat düğmesi), tefsirdeki yeşil yazı
// 4,29:1 (panel gövdesinde; .translation bloğunda 3,90:1) ve kahve yazı .translation bloğunda 4,48:1. Ayrıca
// alternatif rüku rakamları (SVG dolgusu, --gold) --paper üzerinde 2,95:1 idi ve Ezber alanlarında `outline: none`
// odağı yalnızca --gold-soft kenarlık rengiyle (beyaz üstünde 2,4:1) gösteriyordu. Burada oranlar elle yazılmış
// sayılarla değil CSS'in kendisinden (token'lar, color-mix, kural kaynak sırası) hesaplanıyor.
// (Tanımsız bir token ya da çözülemeyen bir renk testi çökertmez; açıklayıcı tek bir FAIL olarak bildirilir.)
try {
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ selectors: m[1].split(",").map((x) => x.trim().replace(/\s+/g, " ")), decls: m[2] });
  }
  const declMap = (decls) => {
    const out = {};
    for (const m of decls.matchAll(/(?:^|;)\s*([a-z-]+)\s*:\s*([^;]+)/g)) out[m[1]] = m[2].trim();
    return out;
  };
  const tokens = {};
  for (const r of rules) if (r.selectors.includes(":root")) for (const m of r.decls.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
  // Aynı seçici birden çok yerde geçerse kaynak sırasındaki SON bildirim kazanır (özgüllük eşit olduğunda CSS böyle çözer).
  const valueOf = (selector, prop) => {
    let v = null;
    for (const r of rules) if (r.selectors.includes(selector)) { const d = declMap(r.decls); if (prop in d) v = d[prop]; }
    return v;
  };
  const splitTop = (str) => {
    const parts = [];
    let depth = 0, cur = "";
    for (const ch of str) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch;
    }
    parts.push(cur.trim());
    return parts;
  };
  function parseColor(v) {
    v = v.trim();
    let m = /^var\(--([\w-]+)\)$/.exec(v);
    if (m) {
      if (!(m[1] in tokens)) throw new Error(`CSS token'ı tanımsız: --${m[1]} (:root'ta yok)`);
      return parseColor(tokens[m[1]]);
    }
    if (v === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    m = /^#([0-9a-f]{3})$/i.exec(v);
    if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
    m = /^#([0-9a-f]{6})$/i.exec(v);
    if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
    m = /^color-mix\(\s*in srgb\s*,(.*)\)$/.exec(v);
    if (m) {
      const [a, b] = splitTop(m[1]);
      const pa = /\s+([\d.]+)%$/.exec(a), pb = /\s+([\d.]+)%$/.exec(b);
      const ca = parseColor(pa ? a.slice(0, pa.index) : a), cb = parseColor(pb ? b.slice(0, pb.index) : b);
      let wa = pa ? Number(pa[1]) / 100 : pb ? 1 - Number(pb[1]) / 100 : 0.5;
      let wb = pb ? Number(pb[1]) / 100 : 1 - wa;
      const sum = wa + wb;
      wa /= sum; wb /= sum;
      // saydam renk karışımı: renk kanalları alfa ağırlıklı, alfa doğrusal (CSS color-mix, srgb, "premultiplied")
      const alpha = ca.a * wa + cb.a * wb;
      if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return { r: (ca.r * ca.a * wa + cb.r * cb.a * wb) / alpha, g: (ca.g * ca.a * wa + cb.g * cb.a * wb) / alpha, b: (ca.b * ca.a * wa + cb.b * cb.a * wb) / alpha, a: alpha };
    }
    throw new Error("renk çözülemedi: " + v);
  }
  const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const need = (what, fg, bg, min = 4.5) => {
    const r = ratio(fg, bg);
    check(`${what}: ${r.toFixed(2)}:1 (en az ${min}:1)`, r >= min);
  };
  const T = (name) => parseColor(`var(--${name})`);
  const shell = T("shell-bg"), paper = T("paper"), white = parseColor("#fff");

  // (a) token'lar
  check("CSS token'ları çözüldü (--gold, --gold-soft, --gold-deep, --shell-bg, --paper, --emerald)", ["gold", "gold-soft", "gold-deep", "shell-bg", "paper", "emerald"].every((k) => tokens[k]));
  if (tokens["gold-deep"]) {
    const deep = T("gold-deep");
    need("--gold-deep, --shell-bg üzerinde (bağlantı metni)", deep, shell);
    need("--gold-deep, --paper üzerinde (alternatif rüku rakamı)", deep, paper);
    need("beyaz yazı, --gold-deep dolgusunda (Ontoloji rozeti)", white, deep);
    need("--shell-bg yazısı, --gold-deep dolgusunda (çalarken Oynat düğmesi)", shell, deep);
    check("--gold-deep hâlâ altın tonunda (--gold ile aynı ton ±6°; koyulaştırılmış, başka renge kaymamış)", (() => {
      const hue = (c) => { const r = c.r / 255, g = c.g / 255, b = c.b / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx === mn ? 0 : (mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4) * 60; };
      return Math.abs(hue(T("gold")) - hue(T("gold-deep"))) <= 6;
    })());
  }
  const deepHex = tokens["gold-deep"];

  // (b) altın metin/dolgu kullanımları --gold-deep'e bağlı
  for (const sel of [".info-section-content a", ".info-intro a", ".topic-description topic"]) {
    check(`${sel}: metin rengi var(--gold-deep)`, valueOf(sel, "color") === "var(--gold-deep)");
    if (valueOf(sel, "color")) need(`${sel}: metin / --shell-bg`, parseColor(valueOf(sel, "color")), shell);
  }
  const badgeText = valueOf(".topic-badge", "color");
  for (const [sel, bgSel] of [[".topic-badge--ontology", ".topic-badge--ontology"], [".topic-badge--thematic", ".topic-badge--thematic"], [".topic-badge--general", ".topic-badge--general"]]) {
    const bg = valueOf(bgSel, "background");
    check(`${sel}: arka plan tanımlı`, !!bg && !!badgeText);
    if (bg && badgeText) need(`${sel}: ${badgeText} yazı / ${bg} dolgu`, parseColor(badgeText), parseColor(bg));
  }
  check(".topic-badge--ontology: dolgu var(--gold-deep)", valueOf(".topic-badge--ontology", "background") === "var(--gold-deep)");
  const playLabel = valueOf(".action-btn-play-label", "color");
  check(".action-btn--play.playing: dolgu ve kenarlık var(--gold-deep)", valueOf(".action-btn--play.playing", "background") === "var(--gold-deep)" && valueOf(".action-btn--play.playing", "border-color") === "var(--gold-deep)");
  if (playLabel) {
    need("Oynat düğmesi, boşta: etiket / zümrüt dolgu", parseColor(playLabel), parseColor(valueOf(".action-btn--play", "background")));
    need("Oynat düğmesi, çalarken: etiket / altın dolgu", parseColor(playLabel), parseColor(valueOf(".action-btn--play.playing", "background")));
  }
  check("alternatif rüku rakamı (.ayah-num-alt): dolgu var(--gold-deep)", valueOf(".mushaf-page-svg .ayah-num-alt", "fill") === "var(--gold-deep)");
  if (valueOf(".mushaf-page-svg .ayah-num-alt", "fill")) need("alternatif rüku rakamı / --paper", parseColor(valueOf(".mushaf-page-svg .ayah-num-alt", "fill")), paper);

  // (c) tefsir yeşil/kahve/mavi yazısı: iki gerçek zeminde (panel gövdesi; üstündeki .translation bloğu)
  {
    const panelBg = valueOf(".word-meal-panel-inner", "background");
    const translationBg = valueOf(".wm-tafsir-content .translation", "background");
    check("panel gövdesi ve .translation zeminleri CSS'te bulundu", !!panelBg && !!translationBg);
    if (panelBg && translationBg) {
      const panel = over(parseColor(panelBg), shell);
      const translation = over(parseColor(translationBg), panel);
      for (const cls of ["green", "brown", "blue"]) {
        const col = valueOf(`.wm-tafsir-content .${cls}`, "color");
        check(`.wm-tafsir-content .${cls}: renk tanımlı`, !!col);
        if (col) {
          need(`tefsir .${cls} / panel gövdesi`, parseColor(col), panel);
          need(`tefsir .${cls} / .translation bloğu`, parseColor(col), translation);
        }
      }
      need("tefsir gövde metni (--ink) / .translation bloğu", T("ink"), translation);
    }
  }

  // (d) dekoratif altınlar metin rengi olamaz; altın dolgu yalnızca yazı taşımayan yerlerde
  const colorDecl = [];
  const goldBg = [];
  const isDecorativeGold = (v) => /^var\(--gold(?:-soft)?\)$/.test(v) || /^#(?:a9812e|c9a24f)$/i.test(v);
  for (const r of rules) {
    const d = declMap(r.decls);
    if (d.color && isDecorativeGold(d.color)) colorDecl.push(r.selectors.join(", "));
    for (const prop of ["background", "background-color"]) if (d[prop] && isDecorativeGold(d[prop])) goldBg.push(r.selectors.join(", "));
  }
  check(`dekoratif altın (--gold / --gold-soft / #a9812e / #c9a24f) hiçbir metin rengi (color:) olarak kullanılmıyor${colorDecl.length ? " -- kullanan: " + colorDecl.join(" | ") : ""}`, colorDecl.length === 0);
  const GOLD_BG_OK = [".yaz-key--hint"]; // yalnızca 💡 emojisi taşıyan klavye tuşu: yazı kontrastı söz konusu değil
  check(`dekoratif altın dolgu (background: --gold / --gold-soft) yalnızca yazı taşımayan izinli yerlerde${goldBg.length ? " -- bulunan: " + goldBg.join(" | ") : ""}`, goldBg.every((x) => GOLD_BG_OK.includes(x)) && goldBg.length === GOLD_BG_OK.length);

  // (e) odak göstergesi
  const outlineNone = [];
  for (const r of rules) {
    const d = declMap(r.decls);
    if (d.outline && /^(none|0)(\s|$)/.test(d.outline)) outlineNone.push(r.selectors.join(", "));
  }
  // izinli: kapsayıcı odaklarında (halka içerideki öğede/:focus-visible'da) ve arama giriş alanında (halkayı .arama-form:focus-within çiziyor)
  const OUTLINE_NONE_OK = [".modal-sheet:focus", ".word-meal-panel:focus", ".arama-input"];
  check(`\`outline: none\` yalnızca yerine başka gösterge konmuş yerlerde (${OUTLINE_NONE_OK.join(", ")})${outlineNone.length ? " -- bulunan: " + outlineNone.join(" | ") : ""}`, outlineNone.length === OUTLINE_NONE_OK.length && OUTLINE_NONE_OK.every((x) => outlineNone.includes(x)));
  check(".ezber-field select/input:focus: outline kapatılmıyor (halka genel select/input:focus-visible kuralından geliyor)", (() => {
    const sel = '.ezber-field select:focus';
    const sel2 = '.ezber-field input[type="number"]:focus';
    const found = rules.filter((r) => r.selectors.includes(sel) || r.selectors.includes(sel2));
    return found.length > 0 && found.every((r) => !("outline" in declMap(r.decls)));
  })());
  check("genel odak halkası: select/input/button:focus-visible -> 2px solid var(--gold)", (() => {
    const r = rules.find((x) => x.selectors.includes("select:focus-visible") && x.selectors.includes("input:focus-visible") && x.selectors.includes("button:focus-visible"));
    return !!r && /^2px solid var\(--gold\)$/.test(declMap(r.decls).outline || "");
  })());
  need("odak halkası (--gold) / --shell-bg (WCAG 1.4.11, metin olmayan öğe)", T("gold"), shell, 3);
} catch (e) {
  check(`renk kontrastı denetimi çalışamadı: ${e.message}`, false);
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
    "All checks passed (nav-announcer yapısı + gecikmeli/tekrar-anons/birleşik-anons mantığı, canlı bölge kapsamı (#page-container canlı değil, panel gövdesi canlı, panel açılış/kapanış anonsu), panel açıkken sayfa metninin ağaçta bir kez görünmesi (alt kopya aria-hidden, gerçek openWordMealStructure/mountClosedPage), showPage huni kontrolü, metin katmanının aria-hiding'siz yapısı, Arapça metin parçalarında lang=\"ar\" (gerçek LineRenderer çıktısı, statik kabuk, CSS'ten türetilen şablon taraması, Oynat etiketi), Oynat düğmesinin erişilebilir adı (Türkçe eylem + görünen etiket, accname ile hesaplanan, aria-pressed yok), renk kontrastı ve odak göstergesi (CSS'ten hesaplanan oranlar, --gold-deep, tefsir renkleri, outline: none izin listesi), axe-core yapısal tarama (dil kuralları dahil)). NOT: bunlar otomatik/yapısal kontroller -- gerçek bir ekran okuyucu testinin yerini tutmaz."
  );
}
