// Ayet gezgini regresyon kontrolü: js/ayet-gezgini.js ve app.js'teki bağlantısı. Sayfa tek bir <svg> olduğundan
// ayet detay paneli ile Sure Bilgisi'ne yalnızca fareyle/dokunarak ulaşılıyordu (gerçek Chromium ölçümü README'de:
// 28 klavye denemesinin 28'inde ikisi de açılmadı). Burada kontrol edilenler:
//   (1) index.html'deki #ayah-nav işaretlemesi (nav + etiketler + gizli listeler + ipucu), .reader-scroll'dan ÖNCE
//       gelmesi (CSS'teki "~" kardeş seçicisi buna dayanıyor), canlı bölge İÇERMEMESİ, ipucunun aria-hidden olması;
//   (2) CSS: ayet/sure başlığı odak halkası kuralları, panel odak halkası, ipucunun yalnızca klavye odağında görünmesi;
//   (3) saf yardımcılar: ayahsOnPage (çok satırlı ayet tek kez), surahsOfSvg, revealDelta (kaydırma hesabı);
//   (4) createAyahNav, GERÇEK index.html üzerinde: liste kurulumu/etiketler, roving tabindex, aria-current,
//       aria-expanded, Yukarı/Aşağı/Home/End (uçlarda dönme yok, değiştirici tuşlarda ve Sol/Sağ okta DOKUNMAZ: sayfa
//       çevirme belge düzeyinde çalışmaya devam etmeli), Enter tekrarında click bastırma, tıklama -> panel / Sure
//       Bilgisi, sayfa değişince (liste yeniden kurulunca) odağın korunması, restoreFocus, gizleme, :focus-visible
//       işareti, onFocusTarget bildirimleri;
//   (5) app.js'in <ayah-nav> bloğu kaynaktan çıkarılıp GERÇEK denetleyiciyle ve sahte showPage/onAyahTextClick ile
//       çalıştırılıyor: seçim -> showPage({ayah, skipHash}), sure başlığı -> openSurahInfo, panel AÇILDIYSA odağın
//       panele alınması (kapandıysa/başka ayetse alınmaması), açılış animasyonundan sonra kaydırma (transitionend ya da
//       zamanlayıcı yedeği, yalnızca bir kez), yalnızca KLAVYE odağında halka/kaydırma, Ezber'de gizleme;
//   (6) app.js'in showPage/openWordMeal/closeWordMeal/startEzberStudy/endEzberStudy'deki syncAyahNav çağrılarının
//       varlığı VE sırası (odağın DOM'dan kalkmadan ÖNCE ölçülmesi gibi);
//   (7) dolu gezginin axe-core yapısal taraması.
//
// ÖNEMLİ SINIR: jsdom'da düzen, gerçek Tab gezintisi ve gerçek :focus-visible sezgisi yok; ekran okuyucu da yok.
// Burası mantığı ve bağlantıyı sabitliyor; gerçek Chromium'daki uçtan uca ölçüm (Tab durakları, Enter/Escape, odağın
// geri verilmesi, sayfa çevirme, kaydırma, ekran görüntüleri) README'de ve gerçek bir NVDA/JAWS/VoiceOver/TalkBack
// testinin YERİNİ TUTMAZ.
//
//   node ayet_gezgini_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";
import axeCore from "axe-core";
import { createAyahNav, ayahsOnPage, surahsOfSvg, revealDelta } from "../js/ayet-gezgini.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const html = readText("index.html");
const css = readText("css", "style.css");
const appSource = readText("js", "app.js");
const swSource = readText("sw.js");

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NAMES = { 1: "Fâtiha", 2: "Bakara", 3: "Âl-i İmrân" };
const surahName = (n) => NAMES[n] || String(n);
const range = (surah, from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({ surah, ayah: from + i }));
const FATIHA = range(1, 1, 7);

// -- (1) Statik işaretleme ---------------------------------------------------------------------------------------
{
  const d = new JSDOM(html).window.document;
  const nav = d.getElementById("ayah-nav");
  check("index.html: #ayah-nav var ve bir <nav>", !!nav && nav.tagName === "NAV");
  if (nav) {
    check("#ayah-nav: aria-label dolu (nav ilk ekran okuyucu bölgesi)", (nav.getAttribute("aria-label") || "").trim().length > 3);
    check("#ayah-nav: başlangıçta gizli (ilk sayfa gelene kadar boş bölge okunmasın)", nav.hasAttribute("hidden"));
    check("#ayah-nav: .sr-only (görsel olarak gizli, erişilebilirlik ağacında duruyor)", nav.classList.contains("sr-only"));
    check("#ayah-nav: <main class=reader> içinde", !!nav.closest("main.reader"));
    const scroll = d.querySelector(".reader-scroll");
    check("#ayah-nav: .reader-scroll'dan ÖNCE geliyor (CSS '#ayah-nav[data-kbd] ~ .reader-scroll' kardeş seçicisi)", !!scroll && !!(nav.compareDocumentPosition(scroll) & 4 /* FOLLOWING */) && nav.parentElement === scroll.parentElement);
    const surahs = nav.querySelector("ul.ayah-nav-surahs");
    const ayahs = nav.querySelector("ul.ayah-nav-ayahs");
    check("#ayah-nav: sure başlıkları listesi (ul.ayah-nav-surahs) etiketli ve gizli", !!surahs && (surahs.getAttribute("aria-label") || "").length > 3 && surahs.hasAttribute("hidden"));
    check("#ayah-nav: ayet listesi (ul.ayah-nav-ayahs) etiketli ve gizli", !!ayahs && (ayahs.getAttribute("aria-label") || "").length > 3 && ayahs.hasAttribute("hidden"));
    check("#ayah-nav: listeler başlangıçta boş (düğmeleri JS kuruyor)", !nav.querySelector("button"));
    const hint = d.getElementById((ayahs && ayahs.getAttribute("aria-describedby")) || "__yok__");
    check("ayet listesi aria-describedby ile var olan bir ipucu metnine bağlı", !!hint && hint.tagName === "P");
    check("ipucu metni Enter tuşunu ve ok tuşlarını anlatıyor (ekran okuyucu için)", !!hint && /Enter/.test(hint.textContent) && /ok tuşlar/.test(hint.textContent));
    check("ipucu metni gizli (aria-describedby gizli öğeye de işaret edebilir; sayfada iki kez görünmesin)", !!hint && hint.hasAttribute("hidden"));
    check("#ayah-nav canlı bölge İÇERMİYOR (anonslar #nav-announcer'dan gidiyor, çift okuma olmasın)", !nav.querySelector('[aria-live],[role="status"],[role="alert"],[role="log"]') && !nav.closest('[aria-live],[role="status"]'));
    const visualHint = d.querySelector(".ayah-nav-hint");
    check("görsel klavye ipucu (.ayah-nav-hint) var, aria-hidden (aria-describedby zaten okutuyor)", !!visualHint && visualHint.getAttribute("aria-hidden") === "true");
    check("görsel ipucu #ayah-nav'dan SONRA ve aynı kapsayıcıda (CSS '#ayah-nav[data-kbd] ~ .ayah-nav-hint')", !!visualHint && !!(nav.compareDocumentPosition(visualHint) & 4) && visualHint.parentElement === nav.parentElement);
    check("görsel ipucu metni Enter/Esc'i anlatıyor", !!visualHint && /Enter/.test(visualHint.textContent) && /Esc/.test(visualHint.textContent));
  }
  check("tekil: yalnızca bir #ayah-nav var", d.querySelectorAll("#ayah-nav").length === 1);
}

// -- (2) CSS ------------------------------------------------------------------------------------------------------
{
  const rule = (selectorRe) => {
    const m = new RegExp(selectorRe + "\\s*\\{([^}]*)\\}").exec(css);
    return m ? m[1] : null;
  };
  const ring = rule('#ayah-nav\\[data-kbd="ayah"\\] ~ \\.reader-scroll \\.mushaf-page-svg \\.ayah-highlight');
  check('CSS: klavye odağında ayet vurgusuna halka kuralı var (#ayah-nav[data-kbd="ayah"] ~ .reader-scroll ... .ayah-highlight; başlık düğmesindeyken ayet halkası YOK)', !!ring);
  check("CSS: ayet halkası stroke + stroke-width taşıyor", !!ring && /stroke:\s*var\(--emerald-deep\)/.test(ring) && /stroke-width:\s*3px/.test(ring));
  check("CSS: ayet halkası non-scaling-stroke (sayfa ölçeğinden bağımsız, ekranda sabit kalınlık)", !!ring && /vector-effect:\s*non-scaling-stroke/.test(ring));
  const head = rule("\\.mushaf-page-svg \\.surah-header-hit\\.kbd-focus > rect:first-child");
  check("CSS: odaklanan sure başlığına halka kuralı (.surah-header-hit.kbd-focus > rect:first-child)", !!head && /stroke:\s*var\(--emerald-deep\)/.test(head) && /vector-effect:\s*non-scaling-stroke/.test(head));
  check("CSS: halka kuralı yalnızca data-kbd altında: koşulsuz '.ayah-highlight { stroke' YOK (fare kullanıcısı halka görmesin)", !/\.ayah-highlight\s*\{[^}]*stroke:/.test(css.replace(/#ayah-nav\[data-kbd[^{]*\{[^}]*\}/g, "")));
  const focusVis = rule("\\.word-meal-panel:focus-visible");
  check("CSS: panele klavyeyle odak alınınca görünür halka (.word-meal-panel:focus-visible)", !!focusVis && /outline:\s*2px solid var\(--gold\)/.test(focusVis));
  const focusPlain = rule("\\.word-meal-panel:focus");
  check("CSS: panelde fare/sezgisel olmayan odakta tarayıcı varsayılan halkası yok (.word-meal-panel:focus { outline: none })", !!focusPlain && /outline:\s*none/.test(focusPlain));
  check("CSS: :focus-visible kuralı :focus kuralından SONRA (aynı özgüllük, ikincisi kazanır)", css.indexOf(".word-meal-panel:focus-visible") > css.indexOf(".word-meal-panel:focus {"));
  const hintBase = rule("\\.ayah-nav-hint");
  check("CSS: klavye ipucu varsayılan olarak gizli (display: none)", !!hintBase && /display:\s*none/.test(hintBase));
  check("CSS: klavye ipucu fareyi engellemiyor (pointer-events: none)", !!hintBase && /pointer-events:\s*none/.test(hintBase));
  const hintOn = rule("#ayah-nav\\[data-kbd\\] ~ \\.ayah-nav-hint");
  check("CSS: klavye ipucu yalnızca #ayah-nav[data-kbd] iken görünür (display: block)", !!hintOn && /display:\s*block/.test(hintOn));
}
check("sw.js: js/ayet-gezgini.js PRECACHE_URLS'te (çevrimdışı açılışta modül bulunamazsa app.js hiç başlamaz)", /"js\/ayet-gezgini\.js"/.test(swSource));
check('app.js: createAyahNav/ayahsOnPage/surahsOfSvg/revealDelta "./ayet-gezgini.js"ten import ediliyor', /import \{ createAyahNav, ayahsOnPage, surahsOfSvg, revealDelta \} from "\.\/ayet-gezgini\.js";/.test(appSource));
check("app.js: els.ayahNav = #ayah-nav", /ayahNav:\s*document\.getElementById\("ayah-nav"\)/.test(appSource));

// -- (3) Saf yardımcılar ------------------------------------------------------------------------------------------
{
  const seg = (surah, ayah, line) => ({ surah, ayah, baselineY: line * 1800, xMin: 0, xMax: 10 });
  const segs = [seg(1, 1, 1), seg(1, 2, 2), seg(1, 3, 3), seg(1, 3, 4), seg(1, 4, 4), seg(1, 5, 5), seg(1, 5, 6), seg(1, 5, 7)];
  const got = ayahsOnPage(segs);
  check("ayahsOnPage: çok satırlı ayet TEK kez, okuma sırası korunuyor", JSON.stringify(got) === JSON.stringify([1, 2, 3, 4, 5].map((a) => ({ surah: 1, ayah: a }))));
  check("ayahsOnPage: yalnızca {surah, ayah} döndürüyor (segment geometrisi sızmıyor)", got.every((a) => Object.keys(a).sort().join() === "ayah,surah"));
  check("ayahsOnPage: sure sınırını aşan sayfa (1:7 -> 2:1) iki ayrı ayet", JSON.stringify(ayahsOnPage([seg(1, 7, 1), seg(2, 1, 2)])) === JSON.stringify([{ surah: 1, ayah: 7 }, { surah: 2, ayah: 1 }]));
  check("ayahsOnPage: aynı ayet numarası farklı surede ayrı sayılıyor (1:1 != 2:1)", ayahsOnPage([seg(1, 1, 1), seg(2, 1, 2)]).length === 2);
  check("ayahsOnPage: boş / undefined güvenli", ayahsOnPage([]).length === 0 && ayahsOnPage(undefined).length === 0);

  const d = new JSDOM("<svg xmlns='http://www.w3.org/2000/svg'><g class='surah-header-hit' data-surah='9'></g><g class='x'></g><g class='surah-header-hit' data-surah='10'></g><g class='surah-header-hit' data-surah='9'></g><g class='surah-header-hit' data-surah='abc'></g><g class='surah-header-hit'></g></svg>").window.document;
  check("surahsOfSvg: sırayla, benzersiz, geçersizleri atlayarak", JSON.stringify(surahsOfSvg(d.querySelector("svg"))) === "[9,10]");
  check("surahsOfSvg: null / başlıksız SVG güvenli", surahsOfSvg(null).length === 0 && surahsOfSvg(new JSDOM("<svg xmlns='http://www.w3.org/2000/svg'></svg>").window.document.querySelector("svg")).length === 0);

  const view = { top: 100, bottom: 500 };
  check("revealDelta: görünür aralık -> 0", revealDelta({ top: 200, bottom: 300 }, view) === 0);
  check("revealDelta: kenara tam oturan aralıklar (üst kenar 100, alt kenar 500) -> 0", revealDelta({ top: 100, bottom: 200 }, view) === 0 && revealDelta({ top: 400, bottom: 500 }, view) === 0);
  check("revealDelta: altından taşıyor -> pozitif (aşağı kaydır), taşan kadar", revealDelta({ top: 450, bottom: 520 }, view) === 20);
  check("revealDelta: üstünden taşıyor -> negatif (yukarı kaydır), taşan kadar", revealDelta({ top: 60, bottom: 120 }, view) === -40);
  check("revealDelta: tamamen aşağıda -> alt kenar hizalanır", revealDelta({ top: 700, bottom: 760 }, view) === 260);
  check("revealDelta: tamamen yukarıda -> üst kenar hizalanır", revealDelta({ top: -300, bottom: -250 }, view) === -400);
  check("revealDelta: pencereden uzun aralık -> ÜST kenar hizalanır (uzun ayetin başı görünsün)", revealDelta({ top: 300, bottom: 1300 }, view) === 200 && revealDelta({ top: -50, bottom: 950 }, view) === -150);
  check("revealDelta: margin her iki kenarda boşluk bırakıyor", revealDelta({ top: 95, bottom: 140 }, view, 16) === -21 && revealDelta({ top: 450, bottom: 495 }, view, 16) === 11 && revealDelta({ top: 130, bottom: 400 }, view, 16) === 0);
  check("revealDelta: margin'li uzun aralık üst kenarı margin kadar içeride hizalıyor", revealDelta({ top: 300, bottom: 1300 }, view, 16) === 184);
}

// -- (4) createAyahNav, gerçek index.html üzerinde ----------------------------------------------------------------
function make() {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const d = dom.window.document;
  const nav = d.getElementById("ayah-nav");
  const calls = { select: [], activate: [], info: [], focus: [] };
  const api = createAyahNav(d, nav, {
    surahName,
    onSelect: (a) => calls.select.push(a),
    onActivate: (a) => calls.activate.push(a),
    onOpenSurahInfo: (s) => calls.info.push(s),
    onFocusTarget: (t) => calls.focus.push(t),
  });
  const key = (el, k, init = {}) => {
    const e = new dom.window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(e);
    return e;
  };
  return { dom, d, nav, calls, api, key };
}
const itemsOf = (nav) => [...nav.querySelectorAll(".ayah-nav-item")];
const labelOf = (el) => el && el.textContent;
const tabbableCount = (nav) => itemsOf(nav).filter((b) => b.getAttribute("tabindex") === "0").length;

{
  // liste kurulumu
  const { nav, api, d } = make();
  api.sync({ ayahs: FATIHA, surahs: [1], selected: { surah: 1, ayah: 3 } });
  const items = itemsOf(nav);
  check("sync: sayfadaki 7 ayet için 7 düğme", items.length === 7);
  check("sync: etiketler 'Fâtiha Suresi, N. ayet' (anons metniyle aynı kalıp), okuma sırasıyla", items.every((b, i) => labelOf(b) === `Fâtiha Suresi, ${i + 1}. ayet`));
  check("sync: düğmeler type=button (form gönderimi yok) ve data-surah/data-ayah taşıyor", items.every((b, i) => b.type === "button" && b.dataset.surah === "1" && b.dataset.ayah === String(i + 1)));
  const headers = [...nav.querySelectorAll(".ayah-nav-surah")];
  check("sync: sure başlığı düğmesi 'Fâtiha Suresi hakkında bilgi' (data-surah=1)", headers.length === 1 && labelOf(headers[0]) === "Fâtiha Suresi hakkında bilgi" && headers[0].dataset.surah === "1" && headers[0].type === "button");
  check("sync: sure başlığı düğmesi normal Tab durağı (tabindex verilmedi ya da >= 0)", headers.every((b) => !b.hasAttribute("tabindex") || Number(b.getAttribute("tabindex")) >= 0));
  check("sync: gezgin ve iki liste görünür (hidden kalktı)", !nav.hidden && !nav.querySelector(".ayah-nav-surahs").hidden && !nav.querySelector(".ayah-nav-ayahs").hidden);
  check("sync: roving tabindex -- TEK Tab durağı, o da seçili ayet (3)", tabbableCount(nav) === 1 && items[2].getAttribute("tabindex") === "0" && items.filter((b, i) => i !== 2).every((b) => b.getAttribute("tabindex") === "-1"));
  check("sync: aria-current YALNIZCA seçili ayette", items.filter((b) => b.getAttribute("aria-current") === "true").length === 1 && items[2].getAttribute("aria-current") === "true");
  check("sync: hiçbir ayet açık değilken hepsi aria-expanded=false", items.every((b) => b.getAttribute("aria-expanded") === "false"));
  check("sync: sure başlığı düğmesinde aria-expanded/aria-current YOK (modal açar, panel değil)", !headers[0].hasAttribute("aria-expanded") && !headers[0].hasAttribute("aria-current"));
  check("sync: <li> sarmalayıcıları (ekran okuyucuda 'liste, 7 öğe')", items.every((b) => b.parentElement.tagName === "LI" && b.parentElement.parentElement === nav.querySelector(".ayah-nav-ayahs")));

  api.sync({ ayahs: FATIHA, surahs: [1], selected: { surah: 1, ayah: 5 }, expanded: { surah: 1, ayah: 5 } });
  check("sync(expanded): yalnızca o ayet aria-expanded=true", items.filter((b) => b.getAttribute("aria-expanded") === "true").map(labelOf).join() === "Fâtiha Suresi, 5. ayet");
  check("sync(selected değişti): tabindex ve aria-current yeni ayete taşındı", tabbableCount(nav) === 1 && items[4].getAttribute("tabindex") === "0" && items[2].getAttribute("tabindex") === "-1" && items[4].getAttribute("aria-current") === "true" && !items[2].hasAttribute("aria-current"));
  check("sync: liste değişmediyse düğmeler YENİDEN KURULMUYOR (aynı öğeler: odak ve ekran okuyucu konumu korunsun)", itemsOf(nav).every((b, i) => b === items[i]));

  api.sync({ ayahs: FATIHA, surahs: [1], selected: { surah: 9, ayah: 9 } });
  check("sync: seçili ayet listede yoksa roving ilk ayete düşer (sayfada Tab durağı hep var)", tabbableCount(nav) === 1 && items[0].getAttribute("tabindex") === "0" && !items.some((b) => b.hasAttribute("aria-current")));

  api.sync({ ayahs: [], surahs: [], selected: null });
  check("sync: boş sayfada iki liste de gizli ('liste, 0 öğe' okunmasın)", nav.querySelector(".ayah-nav-surahs").hidden && nav.querySelector(".ayah-nav-ayahs").hidden && !nav.querySelector("button"));
  api.sync({ ayahs: range(2, 1, 5), surahs: [], selected: { surah: 2, ayah: 1 } });
  check("sync: başlıksız sayfada sure başlığı listesi gizli, ayet listesi görünür", nav.querySelector(".ayah-nav-surahs").hidden && !nav.querySelector(".ayah-nav-ayahs").hidden && itemsOf(nav).length === 5 && labelOf(itemsOf(nav)[0]) === "Bakara Suresi, 1. ayet");
  api.sync({ ayahs: [...range(1, 7, 7), ...range(2, 1, 2)], surahs: [2], selected: { surah: 1, ayah: 7 } });
  check("sync: iki sureli sayfada etiketler ayetin KENDİ suresini taşıyor", itemsOf(nav).map(labelOf).join("|") === "Fâtiha Suresi, 7. ayet|Bakara Suresi, 1. ayet|Bakara Suresi, 2. ayet");
  check("sync: iki sureli sayfada 1:7 ile 2:1 ayrı düğme (ayet numarası çakışması yok)", itemsOf(nav).filter((b) => b.dataset.ayah === "1").length === 1 && itemsOf(nav)[1].dataset.surah === "2");

  // Aynı ayet numarası iki surede de var (ör. 112:3 ve 113:3): seçili/açık durum yalnızca ait olduğu sureye gitmeli.
  api.sync({ ayahs: [...range(112, 3, 4), ...range(113, 1, 3)], surahs: [113], selected: { surah: 113, ayah: 3 }, expanded: { surah: 113, ayah: 3 } });
  {
    const its = itemsOf(nav);
    const pick = (s, a) => its.find((b) => b.dataset.surah === String(s) && b.dataset.ayah === String(a));
    check("sync: aynı ayet numarası iki surede (112:3 ve 113:3): aria-current YALNIZCA seçili sureninkinde", its.length === 5 && pick(113, 3).getAttribute("aria-current") === "true" && !pick(112, 3).hasAttribute("aria-current") && its.filter((b) => b.hasAttribute("aria-current")).length === 1);
    check("sync: aynı ayet numarası iki surede: aria-expanded=true YALNIZCA açık sureninkinde", pick(113, 3).getAttribute("aria-expanded") === "true" && pick(112, 3).getAttribute("aria-expanded") === "false" && its.filter((b) => b.getAttribute("aria-expanded") === "true").length === 1);
    check("sync: aynı ayet numarası iki surede: roving tabindex seçili sureninkinde (113:3), 112:3'te değil", tabbableCount(nav) === 1 && pick(113, 3).getAttribute("tabindex") === "0" && pick(112, 3).getAttribute("tabindex") === "-1");
  }

  // Liste anahtarı yalnızca ayetleri değil sure başlıklarını da kapsıyor: ayetler aynı kalsa da başlık kümesi değişirse yeniden kurulur.
  api.sync({ ayahs: range(2, 1, 3), surahs: [], selected: { surah: 2, ayah: 1 } });
  check("sync: başlıksız sayfada sure başlığı düğmesi yok", nav.querySelectorAll(".ayah-nav-surah").length === 0 && nav.querySelector(".ayah-nav-surahs").hidden);
  api.sync({ ayahs: range(2, 1, 3), surahs: [2], selected: { surah: 2, ayah: 1 } });
  check("sync: ayetler AYNI ama sure başlığı kümesi değişti -> liste yeniden kuruldu, başlık düğmesi eklendi ve liste göründü", nav.querySelectorAll(".ayah-nav-surah").length === 1 && !nav.querySelector(".ayah-nav-surahs").hidden && labelOf(nav.querySelector(".ayah-nav-surah")) === "Bakara Suresi hakkında bilgi");

  api.sync({ visible: false, ayahs: FATIHA, surahs: [1], selected: { surah: 1, ayah: 1 } });
  check("sync(visible:false): gezgin tümüyle gizli (Ezber çalışırken)", nav.hidden === true);
  api.sync({ ayahs: FATIHA, surahs: [1], selected: { surah: 1, ayah: 1 } });
  check("sync: tekrar görünür olunca gezgin geri geliyor", nav.hidden === false && itemsOf(nav).length === 7);
  check("aria-describedby hedefi gerçek DOM'da çözülüyor", !!d.getElementById(nav.querySelector(".ayah-nav-ayahs").getAttribute("aria-describedby")));
}

{
  // klavye
  const { nav, api, key, calls, d } = make();
  api.sync({ ayahs: FATIHA, surahs: [1], selected: { surah: 1, ayah: 3 } });
  let items = itemsOf(nav);
  items[2].focus();

  let e = key(items[2], "ArrowDown");
  check("ArrowDown: bir sonraki ayete geçiş bildiriliyor (onSelect {1,4})", calls.select.length === 1 && calls.select[0].surah === 1 && calls.select[0].ayah === 4);
  check("ArrowDown: odak HEMEN sonraki düğmeye geçti ve o tek Tab durağı oldu", d.activeElement === items[3] && tabbableCount(nav) === 1 && items[3].getAttribute("tabindex") === "0" && items[2].getAttribute("tabindex") === "-1");
  check("ArrowDown: varsayılan davranış (sayfa kaydırma) engellendi", e.defaultPrevented);

  e = key(items[3], "ArrowUp");
  check("ArrowUp: bir önceki ayete geçiş (onSelect {1,3}), odak geri geldi", calls.select.length === 2 && calls.select[1].ayah === 3 && d.activeElement === items[2] && e.defaultPrevented);

  e = key(items[2], "End");
  check("End: son ayete (7) geçiş", calls.select.length === 3 && calls.select[2].ayah === 7 && d.activeElement === items[6] && e.defaultPrevented);
  const before = calls.select.length;
  e = key(items[6], "ArrowDown");
  check("ArrowDown son ayette: DÖNMEZ ve sayfa değişmez (onSelect çağrılmaz, odak yerinde)", calls.select.length === before && d.activeElement === items[6]);
  check("ArrowDown son ayette: yine de varsayılan engellendi (sayfa kayıp gitmesin)", e.defaultPrevented);
  e = key(items[6], "Home");
  check("Home: ilk ayete (1) geçiş", calls.select[calls.select.length - 1].ayah === 1 && d.activeElement === items[0] && e.defaultPrevented);
  const before2 = calls.select.length;
  key(items[0], "ArrowUp");
  check("ArrowUp ilk ayette: DÖNMEZ (onSelect çağrılmaz, odak yerinde)", calls.select.length === before2 && d.activeElement === items[0]);

  // DOKUNULMAMASI gerekenler
  const n0 = calls.select.length;
  for (const k of ["ArrowLeft", "ArrowRight"]) {
    e = key(items[0], k);
    check(`${k}: ele ALINMIYOR (belge düzeyindeki sayfa çevirme işleyicisi çalışsın): defaultPrevented değil, onSelect yok`, !e.defaultPrevented && calls.select.length === n0);
  }
  for (const k of ["Tab", "Escape", "a", "PageDown", "PageUp"]) {
    e = key(items[0], k);
    check(`${k}: ele alınmıyor (Tab sırası, Escape ile panel kapatma, kaydırma bozulmasın)`, !e.defaultPrevented && calls.select.length === n0);
  }
  for (const init of [{ shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
    e = key(items[0], "ArrowDown", init);
    check(`ArrowDown + ${Object.keys(init)[0]}: ele alınmıyor (tarayıcı/ekran okuyucu kısayolları bozulmasın)`, !e.defaultPrevented && calls.select.length === n0 && d.activeElement === items[0]);
  }
  // Olay zaten ele alınmışsa (başka bir işleyici preventDefault dedi) gezgin dokunmaz
  {
    const guard = (ev) => ev.preventDefault();
    items[0].addEventListener("keydown", guard);
    const n2 = calls.select.length;
    key(items[0], "ArrowDown");
    check("zaten ele alınmış (defaultPrevented) ArrowDown: gezgin DOKUNMUYOR (onSelect yok, odak yerinde)", calls.select.length === n2 && d.activeElement === items[0]);
    items[0].removeEventListener("keydown", guard);
    key(items[0], "ArrowDown");
    check("aynı tuş ele alınmamışsa gezgin çalışıyor (önceki kontrolün kontrolü: kural yalnızca engellenmiş olayı atlıyor)", calls.select.length === n2 + 1 && d.activeElement === items[1]);
    key(items[1], "Home"); // sonraki kontroller ilk ayetten başlasın
  }
  // Enter tekrarı
  e = key(items[0], "Enter", { repeat: true });
  check("Enter (tuş basılı, repeat): bastırıldı (panel saniyede onlarca kez açılıp kapanmasın)", e.defaultPrevented);
  e = key(items[0], "Enter");
  check("Enter (ilk basış): bastırılmadı (yerel düğme etkinleştirmesi -> click)", !e.defaultPrevented);
  e = key(items[0], " ", { repeat: true });
  check("Space tekrarı: dokunulmuyor (Space zaten keyup'ta etkinleşir)", !e.defaultPrevented);

  // sure başlığı düğmesinde ok tuşları ele alınmıyor
  const h = nav.querySelector(".ayah-nav-surah");
  h.focus();
  const n1 = calls.select.length;
  e = key(h, "ArrowDown");
  check("sure başlığı düğmesinde ArrowDown: ele alınmıyor (ayet seçimi ayet listesine ait)", !e.defaultPrevented && calls.select.length === n1 && d.activeElement === h);
  e = key(h, "Enter", { repeat: true });
  check("sure başlığı düğmesinde Enter tekrarı da bastırılıyor (modal tekrar tekrar açılmasın)", e.defaultPrevented);

  // tıklama
  items[4].click();
  check("ayet düğmesine tıklama/Enter/Space -> onActivate {1,5}", calls.activate.length === 1 && calls.activate[0].surah === 1 && calls.activate[0].ayah === 5);
  h.click();
  check("sure başlığı düğmesine tıklama/Enter -> onOpenSurahInfo(1)", calls.info.length === 1 && calls.info[0] === 1);
  nav.click();
  check("gezginin kendisine/boşluğuna tıklama hiçbir şey tetiklemiyor", calls.activate.length === 1 && calls.info.length === 1);
}

{
  // odağın korunması
  const { nav, api, d } = make();
  api.sync({ ayahs: FATIHA, surahs: [1], selected: { surah: 1, ayah: 3 } });
  const old = itemsOf(nav);
  old[2].focus();
  api.sync({ ayahs: range(2, 1, 5), surahs: [], selected: { surah: 2, ayah: 1 } });
  const now = itemsOf(nav);
  check("sayfa değişti (liste yeniden kuruldu), odak gezgindeydi -> odak yeni listenin seçili ayetinde (<body>'ye DÜŞMEDİ)", d.activeElement === now[0] && d.activeElement !== d.body && d.activeElement.getAttribute("tabindex") === "0");

  api.sync({ ayahs: FATIHA, surahs: [1], selected: { surah: 1, ayah: 2 } });
  nav.querySelector(".ayah-nav-surah").focus();
  api.sync({ ayahs: range(1, 3, 7), surahs: [1], selected: { surah: 1, ayah: 3 } });
  check("odak sure başlığı düğmesindeyken sayfa değişti, yeni sayfada da aynı sure başlığı var -> odak başlık düğmesinde kaldı", d.activeElement === nav.querySelector(".ayah-nav-surah") && d.activeElement.dataset.surah === "1");
  api.sync({ ayahs: range(2, 1, 3), surahs: [2], selected: { surah: 2, ayah: 1 } });
  nav.querySelector(".ayah-nav-surah").focus();
  api.sync({ ayahs: range(2, 4, 8), surahs: [], selected: { surah: 2, ayah: 4 } });
  check("odak başlık düğmesindeyken yeni sayfada başlık yok -> odak seçili ayete düştü (body'ye değil)", d.activeElement === itemsOf(nav)[0] && d.activeElement.dataset.ayah === "4");

  // listeyi koruyan senkron odağı oynatmaz
  const first = itemsOf(nav);
  first[2].focus();
  api.sync({ ayahs: range(2, 4, 8), surahs: [], selected: { surah: 2, ayah: 4 } });
  check("liste değişmedi, odak ayet 6'da, seçim 4'te (ör. kıraat ilerliyor): odak YERİNDE kalıyor (odak çalınmıyor)", d.activeElement === first[2] && itemsOf(nav)[2] === first[2]);

  // restoreFocus
  d.body.focus();
  (d.activeElement || d.body).blur && d.activeElement.blur();
  api.sync({ ayahs: range(2, 4, 8), surahs: [], selected: { surah: 2, ayah: 5 }, restoreFocus: true });
  check("restoreFocus:true -> odak (kaldırılan panelden) seçili ayet düğmesine verildi", d.activeElement === itemsOf(nav)[1] && d.activeElement.dataset.ayah === "5");
  d.activeElement.blur();
  api.sync({ ayahs: range(2, 4, 8), surahs: [], selected: { surah: 2, ayah: 6 } });
  check("restoreFocus verilmedi ve odak başka yerde -> gezgin odağı ÇALMIYOR (ör. kıraat sırasında Çal düğmesinde olan kullanıcı)", d.activeElement === d.body);
  // odak gezgin dışında bir yerdeyken liste yeniden kurulursa da çalınmıyor
  const outside = d.getElementById("play-btn");
  outside.focus();
  api.sync({ ayahs: range(3, 1, 4), surahs: [3], selected: { surah: 3, ayah: 1 } });
  check("liste yeniden kuruldu ama odak gezgin DIŞINDA (Çal düğmesi): odak yerinde", d.activeElement === outside);

  // gizleme
  itemsOf(nav)[0].focus();
  api.sync({ visible: false });
  check("visible:false: data-kbd da temizleniyor", !nav.hasAttribute("data-kbd") && nav.hidden);
}

{
  // :focus-visible işareti + onFocusTarget
  const { nav, api, calls, d, dom } = make();
  api.sync({ ayahs: FATIHA, surahs: [1], selected: { surah: 1, ayah: 2 } });
  const items = itemsOf(nav);
  const header = nav.querySelector(".ayah-nav-surah");
  check("başlangıçta data-kbd yok", !nav.hasAttribute("data-kbd"));

  items[1].focus();
  check("odak gezgine girince (ve :focus-visible ise) data-kbd konuyor", nav.hasAttribute("data-kbd"));
  check('data-kbd değeri ayet düğmesinde "ayah" (CSS ayet halkası buna bağlı)', nav.getAttribute("data-kbd") === "ayah");
  check("onFocusTarget: ayet için {kind:'ayah', surah, ayah}", JSON.stringify(calls.focus[calls.focus.length - 1]) === JSON.stringify({ kind: "ayah", surah: 1, ayah: 2 }));
  header.focus();
  check("onFocusTarget: sure başlığı için {kind:'surah', surah}", JSON.stringify(calls.focus[calls.focus.length - 1]) === JSON.stringify({ kind: "surah", surah: 1 }));
  check("gezgin İÇİNDE odak taşınınca data-kbd kalıyor (titreme yok)", nav.hasAttribute("data-kbd"));
  check('sure başlığı düğmesindeyken data-kbd="surah" (ayet vurgusuna halka ÇİZİLMEZ: iki halka birden olmasın)', nav.getAttribute("data-kbd") === "surah");
  const c0 = calls.focus.length;
  items[1].focus();
  check('odak ayete dönünce data-kbd tekrar "ayah"', nav.getAttribute("data-kbd") === "ayah");
  check("gezgin İÇİNDE odak taşınırken ara 'null' bildirimi YOK (halka/kaydırma titremesin): yalnızca yeni hedef bildirilir", calls.focus.length === c0 + 1 && calls.focus[calls.focus.length - 1].kind === "ayah");
  header.focus();
  const n = calls.focus.length;
  d.getElementById("play-btn").focus();
  check("odak gezginden çıkınca data-kbd kalkıyor ve onFocusTarget(null)", !nav.hasAttribute("data-kbd") && calls.focus.length === n + 1 && calls.focus[calls.focus.length - 1] === null);
  d.getElementById("play-btn").blur();
  check("odak zaten dışarıdayken tekrar null bildirilmiyor (gereksiz kaydırma/temizlik yok)", calls.focus.length === n + 1);

  // fare/dokunma kaynaklı odak: :focus-visible false
  items[3].matches = (sel) => (sel === ":focus-visible" ? false : Element.prototype.matches.call(items[3], sel));
  items[3].focus();
  check(":focus-visible DEĞİLSE (fareyle gelen programatik odak) data-kbd KONMUYOR -> fare kullanıcısı halka görmez", !nav.hasAttribute("data-kbd"));
  check(":focus-visible değilken de onFocusTarget bildiriliyor (halka/kaydırma kararı app.js'te data-kbd'ye bakıyor)", JSON.stringify(calls.focus[calls.focus.length - 1]) === JSON.stringify({ kind: "ayah", surah: 1, ayah: 4 }));
  // :focus-visible seçicisi desteklenmiyorsa halka GÖSTERİLİR
  items[4].matches = () => {
    throw new dom.window.DOMException("bad selector", "SyntaxError");
  };
  items[4].focus();
  check(":focus-visible desteklenmiyor (seçici hata veriyor) -> halka gösterilir (klavye kullanıcısı odağı kaybetmesin)", nav.hasAttribute("data-kbd"));

  // sync sırasında odak gezgindeyse bildirim yenilenir (vurgu taşındı, kaydırma yeniden hesaplanır)
  d.getElementById("play-btn").focus();
  items[0].focus();
  const m = calls.focus.length;
  api.sync({ ayahs: FATIHA, surahs: [1], selected: { surah: 1, ayah: 6 } });
  check("sync: odak gezgindeyken onFocusTarget yeniden çağrılıyor (seçim değişti, vurgu başka yere gitti)", calls.focus.length === m + 1 && calls.focus[calls.focus.length - 1].kind === "ayah");
  d.getElementById("play-btn").focus();
  const k = calls.focus.length;
  api.sync({ ayahs: FATIHA, surahs: [1], selected: { surah: 1, ayah: 6 } });
  check("sync: odak gezgin dışındayken bildirim YOK (zaten null)", calls.focus.length === k);
}

// -- (5) app.js <ayah-nav> bloğu, gerçek denetleyiciyle ---------------------------------------------------------
const BLOCK = /\/\/ <ayah-nav>([\s\S]*?)\/\/ <\/ayah-nav>/.exec(appSource);
check("app.js: <ayah-nav> ... </ayah-nav> bloğu bulundu", !!BLOCK);

function makeWiring() {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const d = dom.window.document;
  const NS = "http://www.w3.org/2000/svg";
  const svg = d.createElementNS(NS, "svg");
  svg.setAttribute("class", "mushaf-page-svg");
  const header = d.createElementNS(NS, "g");
  header.setAttribute("class", "surah-header-hit");
  header.setAttribute("data-surah", "1");
  const hl = d.createElementNS(NS, "rect");
  hl.setAttribute("class", "ayah-highlight");
  svg.append(header, hl);
  d.getElementById("page-container").appendChild(svg);
  const rects = { header: { top: 20, bottom: 80 }, hl: { top: 200, bottom: 240 }, panel: { top: 450, bottom: 900 } }; // vurgu varsayılan olarak GÖRÜNÜR alanda (odak almak tek başına kaydırmasın)
  header.getBoundingClientRect = () => rects.header;
  hl.getBoundingClientRect = () => rects.hl;
  const scroller = { scrollTop: 0, getBoundingClientRect: () => ({ top: 100, bottom: 500 }) };
  const els = { ayahNav: d.getElementById("ayah-nav"), readerScroll: scroller };
  const seg = (ayah, line) => ({ surah: 1, ayah, baselineY: line * 1800, xMin: 0, xMax: 10 });
  const state = {
    currentPage: 23, // 1 DEĞİL: showPage'e sabit 1 geçilirse yakalansın
    selectedAyah: { surah: 1, ayah: 3 },
    ezberStudy: null,
    surahs: { 1: { nameTurkish: "Fâtiha" }, 2: { nameTurkish: "Bakara" } },
    currentPageSvg: svg,
    currentPageSegments: [seg(1, 1), seg(2, 2), seg(3, 3), seg(3, 4), seg(4, 4), seg(5, 5), seg(6, 6), seg(7, 7)],
    wordMeal: { open: false, ayah: null, panelEl: null },
  };
  const calls = { showPage: [], info: [], click: [] };
  const timers = [];
  const stubs = { clickImpl: null };
  const showPage = (page, opts) => {
    calls.showPage.push([page, opts]);
  };
  const openSurahInfo = (s) => calls.info.push(s);
  const onAyahTextClick = async (hit) => {
    calls.click.push(hit);
    if (stubs.clickImpl) await stubs.clickImpl(hit);
  };
  const fakeSetTimeout = (fn, ms) => {
    timers.push({ fn, ms });
    return timers.length;
  };
  const api = new Function(
    "state", "els", "document", "createAyahNav", "ayahsOnPage", "surahsOfSvg", "revealDelta", "showPage", "openSurahInfo", "onAyahTextClick", "setTimeout",
    `${BLOCK[1]}\nreturn { ayahNav, syncAyahNav, markAyahNavFocus, activateAyahFromNav, focusWordMealPanel, revealRects, surahNameOf };`
  )(state, els, d, createAyahNav, ayahsOnPage, surahsOfSvg, revealDelta, showPage, openSurahInfo, onAyahTextClick, fakeSetTimeout);
  const addPanel = () => {
    const panel = d.createElement("div");
    panel.className = "word-meal-panel";
    panel.getBoundingClientRect = () => rects.panel;
    d.getElementById("page-container").appendChild(panel);
    return panel;
  };
  return { dom, d, svg, header, hl, rects, scroller, els, state, calls, timers, stubs, api, addPanel };
}

if (BLOCK) {
  {
    const w = makeWiring();
    w.api.syncAyahNav();
    const items = itemsOf(w.els.ayahNav);
    check("syncAyahNav: çok satırlı ayet tek düğme: 7 segmentli sayfa -> 7 ayet", items.length === 7);
    check("syncAyahNav: sure başlıkları SVG'deki .surah-header-hit'ten (1 başlık)", w.els.ayahNav.querySelectorAll(".ayah-nav-surah").length === 1);
    check("syncAyahNav: etiketler state.surahs'taki Türkçe adı kullanıyor", labelOf(items[0]) === "Fâtiha Suresi, 1. ayet" && labelOf(w.els.ayahNav.querySelector(".ayah-nav-surah")) === "Fâtiha Suresi hakkında bilgi");
    check("syncAyahNav: seçili ayet state.selectedAyah (3): aria-current + tek Tab durağı", items[2].getAttribute("aria-current") === "true" && items[2].getAttribute("tabindex") === "0");
    check("syncAyahNav: panel kapalıyken hiçbir ayet aria-expanded=true değil", !items.some((b) => b.getAttribute("aria-expanded") === "true"));
    check("syncAyahNav: gezgin görünür", !w.els.ayahNav.hidden);

    w.state.wordMeal = { open: true, ayah: { surah: 1, ayah: 3 }, panelEl: null };
    w.api.syncAyahNav();
    check("syncAyahNav: panel açıkken o ayet aria-expanded=true (state.wordMeal.ayah)", items.filter((b) => b.getAttribute("aria-expanded") === "true").map(labelOf).join() === "Fâtiha Suresi, 3. ayet");
    w.state.wordMeal = { open: false, ayah: { surah: 1, ayah: 3 }, panelEl: null };
    w.api.syncAyahNav();
    check("syncAyahNav: wordMeal.open false ise ayet bilgisi kalsa da aria-expanded=false", !items.some((b) => b.getAttribute("aria-expanded") === "true"));

    w.state.ezberStudy = { mode: "oku" };
    w.api.syncAyahNav();
    check("syncAyahNav: Ezber çalışırken gezgin GİZLİ", w.els.ayahNav.hidden === true);
    w.state.ezberStudy = null;
    w.api.syncAyahNav();
    check("syncAyahNav: Ezber bitince gezgin geri geldi", w.els.ayahNav.hidden === false);
    w.state.currentPageSvg = null;
    w.api.syncAyahNav();
    check("syncAyahNav: henüz sayfa yokken (currentPageSvg null) gezgin gizli", w.els.ayahNav.hidden === true);
  }

  {
    const w = makeWiring();
    w.api.syncAyahNav();
    const items = itemsOf(w.els.ayahNav);
    items[2].focus();
    w.dom.window.document.activeElement.dispatchEvent(new w.dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    check("ok tuşu -> showPage(state.currentPage, {ayah: {1,4}, skipHash: true}) (tıklamayla aynı yol, URL'ye yazmadan)", w.calls.showPage.length === 1 && w.calls.showPage[0][0] === 23 && w.calls.showPage[0][1].skipHash === true && w.calls.showPage[0][1].ayah.surah === 1 && w.calls.showPage[0][1].ayah.ayah === 4);
    w.els.ayahNav.querySelector(".ayah-nav-surah").click();
    check("sure başlığı düğmesi -> openSurahInfo(1)", w.calls.info.length === 1 && w.calls.info[0] === 1);
    items[5].click();
    check("ayet düğmesi -> onAyahTextClick({surah:1, ayah:6}) (fareyle dokunmakla aynı giriş noktası)", w.calls.click.length === 1 && w.calls.click[0].surah === 1 && w.calls.click[0].ayah === 6);

    // düğme tıklaması activateAyahFromNav'dan geçmeli: panel açılırsa odak panele gider
    const w2 = makeWiring();
    w2.api.syncAyahNav();
    let panel = null;
    w2.stubs.clickImpl = async (hit) => {
      panel = w2.addPanel();
      w2.state.wordMeal = { open: true, ayah: { surah: hit.surah, ayah: hit.ayah }, panelEl: panel };
    };
    const it2 = itemsOf(w2.els.ayahNav);
    it2[3].focus();
    it2[3].click();
    await sleep(10);
    check("ayet düğmesine tıklama (Enter/Space/ekran okuyucu) paneli AÇARSA odak panele geçiyor (düğme activateAyahFromNav'a bağlı)", !!panel && w2.d.activeElement === panel);
  }

  {
    // activateAyahFromNav: odağın panele alınması
    const w = makeWiring();
    w.api.syncAyahNav();
    const items = itemsOf(w.els.ayahNav);
    items[2].focus();
    let panel = null;
    w.stubs.clickImpl = async (hit) => {
      panel = w.addPanel();
      w.state.wordMeal = { open: true, ayah: { surah: hit.surah, ayah: hit.ayah }, panelEl: panel };
    };
    await w.api.activateAyahFromNav({ surah: 1, ayah: 3 });
    check("panel AÇILDI -> odak panelin kendisinde (ekran okuyucu 'detayı, bölge' der; Tab içindeki düğmelere geçer)", w.d.activeElement === panel);
    check("panel odağı için tabindex=-1 (Tab sırasına girmez, programatik odak alır)", panel.getAttribute("tabindex") === "-1");
    check("panel açıldıktan sonra yalnızca bir zamanlayıcı yedeği kuruldu (400 ms)", w.timers.length === 1 && w.timers[0].ms === 400);

    // kaydırma: transitionend ile, yalnızca BİR kez
    const odd = new w.dom.window.Event("transitionend");
    Object.defineProperty(odd, "propertyName", { value: "opacity" });
    panel.dispatchEvent(odd);
    check("başka bir özelliğin transitionend'i panel kaydırmasını tetiklemiyor", w.scroller.scrollTop === 0);
    const te = new w.dom.window.Event("transitionend");
    Object.defineProperty(te, "propertyName", { value: "grid-template-rows" });
    panel.dispatchEvent(te);
    check("açılış animasyonu (grid-template-rows) bitince panel görünür alana kaydırıldı: pencereden uzun panelde ÜST kenar hizalanır (450 - (100+16) = 334)", w.scroller.scrollTop === 334);
    w.timers[0].fn();
    check("zamanlayıcı yedeği transitionend'den sonra İKİNCİ kez kaydırmıyor", w.scroller.scrollTop === 334);

    // yalnızca zamanlayıcı yoluyla
    const w2 = makeWiring();
    w2.api.syncAyahNav();
    let panel2 = null;
    w2.stubs.clickImpl = async (hit) => {
      panel2 = w2.addPanel();
      w2.state.wordMeal = { open: true, ayah: { surah: hit.surah, ayah: hit.ayah }, panelEl: panel2 };
    };
    await w2.api.activateAyahFromNav({ surah: 1, ayah: 3 });
    w2.timers[0].fn();
    check("transitionend gelmezse (animasyon kapalı) zamanlayıcı yedeği paneli yine kaydırıyor", w2.scroller.scrollTop === 334);

    // panel kaybolduysa kaydırma yok
    const w3 = makeWiring();
    w3.api.syncAyahNav();
    let panel3 = null;
    w3.stubs.clickImpl = async (hit) => {
      panel3 = w3.addPanel();
      w3.state.wordMeal = { open: true, ayah: { surah: hit.surah, ayah: hit.ayah }, panelEl: panel3 };
    };
    await w3.api.activateAyahFromNav({ surah: 1, ayah: 3 });
    w3.state.wordMeal = { open: false, ayah: null, panelEl: null }; // kullanıcı bu arada kapattı
    panel3.remove();
    w3.timers[0].fn();
    check("panel bu arada kapandı/kaldırıldı -> kaydırma yapılmıyor", w3.scroller.scrollTop === 0);

    // panel KAPANDI (aç/kapa)
    const w4 = makeWiring();
    w4.api.syncAyahNav();
    const it4 = itemsOf(w4.els.ayahNav);
    it4[2].focus();
    w4.stubs.clickImpl = async () => {}; // onAyahTextClick panelı kapattı: state.wordMeal.open false
    await w4.api.activateAyahFromNav({ surah: 1, ayah: 3 });
    check("panel KAPANDIYSA odak ayet düğmesinde kalıyor (dokunulmuyor), zamanlayıcı kurulmuyor", w4.d.activeElement === it4[2] && w4.timers.length === 0);

    // başka ayet için açıldıysa odak alınmaz
    const w5 = makeWiring();
    w5.api.syncAyahNav();
    const it5 = itemsOf(w5.els.ayahNav);
    it5[2].focus();
    w5.stubs.clickImpl = async () => {
      const p = w5.addPanel();
      w5.state.wordMeal = { open: true, ayah: { surah: 1, ayah: 6 }, panelEl: p };
    };
    await w5.api.activateAyahFromNav({ surah: 1, ayah: 3 });
    check("panel BAŞKA bir ayet için açıldıysa odak panele alınmıyor", w5.d.activeElement === it5[2] && w5.timers.length === 0);
  }

  {
    // markAyahNavFocus
    const w = makeWiring();
    w.api.syncAyahNav();
    w.scroller.scrollTop = 200; // başlık (20..80) ve vurgu (aşağıda ekran dışına alınacak) kaydırma gerektirecek konumda
    w.rects.hl = { top: 520, bottom: 560 };
    w.api.markAyahNavFocus({ kind: "surah", surah: 1 });
    check("data-kbd YOKKEN (fareyle gelen odak): sure başlığına halka konmuyor, kaydırma yok", !w.header.classList.contains("kbd-focus") && w.scroller.scrollTop === 200);
    w.scroller.scrollTop = 0;
    w.api.markAyahNavFocus({ kind: "ayah", surah: 1, ayah: 3 });
    check("data-kbd YOKKEN: ayet için de kaydırma yok (fareyle 'Kapat'a basan kullanıcının sayfası kaymasın)", w.scroller.scrollTop === 0);

    w.els.ayahNav.setAttribute("data-kbd", "");
    w.api.markAyahNavFocus({ kind: "surah", surah: 1 });
    check("data-kbd VARKEN: odaklanan sure başlığına .kbd-focus", w.header.classList.contains("kbd-focus"));
    w.api.markAyahNavFocus(null);
    check("target null: .kbd-focus kaldırıldı", !w.header.classList.contains("kbd-focus"));
    w.api.markAyahNavFocus({ kind: "surah", surah: 1 });
    w.api.markAyahNavFocus({ kind: "ayah", surah: 1, ayah: 3 });
    check("başlıktan ayete geçince önceki başlığın .kbd-focus'u kaldırılıyor", !w.header.classList.contains("kbd-focus"));
    w.scroller.scrollTop = 0;
    w.api.markAyahNavFocus({ kind: "ayah", surah: 1, ayah: 3 });
    check("ayet hedefi: vurgu alttan taşıyorsa (560 > 500-16) kaydırılıyor: 560 - 484 = 76", w.scroller.scrollTop === 76);
    w.rects.hl = { top: 200, bottom: 240 };
    w.api.markAyahNavFocus({ kind: "ayah", surah: 1, ayah: 3 });
    check("ayet hedefi: vurgu görünürse kaydırma YOK", w.scroller.scrollTop === 76);
    w.rects.hl = { top: 90, bottom: 130 };
    w.api.markAyahNavFocus({ kind: "ayah", surah: 1, ayah: 3 });
    check("ayet hedefi: vurgu üstten taşıyorsa yukarı kaydırılıyor: 76 + (90 - 116) = 50", w.scroller.scrollTop === 50);
    w.state.currentPageSvg = null;
    let threw = false;
    try {
      w.api.markAyahNavFocus({ kind: "ayah", surah: 1, ayah: 3 });
      w.api.markAyahNavFocus({ kind: "surah", surah: 1 });
    } catch (_) {
      threw = true;
    }
    check("sayfa SVG'si yokken markAyahNavFocus güvenli (hata vermiyor, kaydırma yok)", !threw && w.scroller.scrollTop === 50);
  }

  {
    // kaydırma: sure başlığı için
    const w = makeWiring();
    w.api.syncAyahNav();
    w.els.ayahNav.setAttribute("data-kbd", "");
    w.scroller.scrollTop = 200;
    w.api.markAyahNavFocus({ kind: "surah", surah: 1 });
    check("sure başlığı ekranın üstünde kaldıysa yukarı kaydırılıyor: 200 + (20 - 116) = 104", w.scroller.scrollTop === 104);
    w.api.markAyahNavFocus({ kind: "surah", surah: 99 });
    check("sayfada olmayan sure numarası için hata/halka yok", !w.header.classList.contains("kbd-focus"));
  }
}

// -- (6) app.js içindeki çağrı noktaları ve SIRALARI --------------------------------------------------------------
function fnBody(name) {
  const re = new RegExp(`(?:async )?function ${name}\\(`);
  const m = re.exec(appSource);
  if (!m) return null;
  // sıradaki sütun-0 "}" satırına kadar
  const end = appSource.indexOf("\n}\n", m.index);
  return appSource.slice(m.index, end + 3);
}
{
  const body = fnBody("showPage") || "";
  const iFocus = body.indexOf("const focusWasInPage = els.pageContainer.contains(document.activeElement);");
  const iMount = body.indexOf("mountClosedPage(svg);");
  const iAnnounce = body.indexOf("announceNavigation();");
  const iSync = body.indexOf("syncAyahNav({ restoreFocus: focusWasInPage });");
  check("showPage: odak ölçümü (focusWasInPage) mountClosedPage'den ÖNCE (sonrasında panel kalkmış, odak <body>'de olurdu)", iFocus > -1 && iMount > -1 && iFocus < iMount);
  check("showPage: syncAyahNav({restoreFocus: focusWasInPage}) mountClosedPage'den ve announceNavigation'dan SONRA", iSync > -1 && iSync > iMount && iSync > iAnnounce);
  check("showPage: syncAyahNav, eski sayfaya dönen erken 'return'den (başka sayfaya geçildi) SONRA", iSync > body.indexOf("if (state.currentPage !== pageNumber || state.selectedAyah !== ayah) return;"));
}
{
  const body = fnBody("openWordMeal") || "";
  const iStruct = body.indexOf("openWordMealStructure(");
  const iSync = body.indexOf("syncAyahNav();");
  check("openWordMeal: panel yapısı kurulduktan SONRA syncAyahNav() (aria-expanded=true; fareyle açılışta da)", iStruct > -1 && iSync > iStruct);
}
{
  const body = fnBody("closeWordMeal") || "";
  const iMeasure = body.indexOf("const focusWasInPanel = !!panelEl && panelEl.contains(document.activeElement);");
  const iClear = body.indexOf("state.wordMeal.open = false;");
  const iSync = body.indexOf("syncAyahNav({ restoreFocus: focusWasInPanel });");
  const iEarlyReturn = body.indexOf("if (!panelEl) {");
  check("closeWordMeal: odak ölçümü state sıfırlanmadan ÖNCE ve panel DOM'dayken", iMeasure > -1 && iClear > -1 && iMeasure < iClear);
  check("closeWordMeal: syncAyahNav({restoreFocus}) durum sıfırlandıktan SONRA ve 'panelEl yok' erken dönüşünden ÖNCE", iSync > iClear && iSync < iEarlyReturn);
}
{
  const start = fnBody("startEzberStudy") || "";
  check("startEzberStudy: state.ezberStudy atandıktan sonra syncAyahNav() (gezgin gizlensin)", start.indexOf("syncAyahNav();") > start.indexOf("state.ezberStudy = {") && start.indexOf("state.ezberStudy = {") > -1);
  const end = fnBody("endEzberStudy") || "";
  check("endEzberStudy: state.ezberStudy = null'dan sonra syncAyahNav() (gezgin geri gelsin)", end.indexOf("syncAyahNav();") > end.indexOf("state.ezberStudy = null;") && end.indexOf("state.ezberStudy = null;") > -1);
}
// Dinleyici artık adlandırılmış işlev (onPageTurnKeydown): açık modalda, değiştirici tuşla, tüketilmiş olayda, bileşimde ve ok kullanan öğede (yazı
// alanı, kaydırıcı...) vazgeçiyor; gezgindeki ayet düğmesi ve panel düğmeleri ok kullanan hedef sayılmıyor, yani odak gezgindeyken DÜZ Sol/Sağ
// eskisi gibi çevirir. Ayrıntılı davranış: test/sayfa_ok_tuslari_test.mjs.
check("belge düzeyindeki sayfa çevirme işleyicisi (onPageTurnKeydown) duruyor ve ilk koşulu açık modalda vazgeçmek (odak gezgindeyken düz Sol/Sağ çalışsın)", /document\.addEventListener\("keydown", onPageTurnKeydown\);/.test(appSource) && /function onPageTurnKeydown\(e\) \{\s*if \(state\.openModalEl\) return;[^]*?goToNextPage\(\);[^]*?goToPrevPage\(\);/.test(appSource));
check("Escape ile ayet panelini kapatma işleyicisi duruyor (odak gezgindeyken de çalışır)", /else if \(state\.wordMeal\.open\) closeWordMeal\(\);/.test(appSource));

// -- (7) Dolu gezginin axe-core yapısal taraması --------------------------------------------------------------------
async function runAxe(document, options) {
  const dom = document.defaultView;
  const prev = { window: globalThis.window, document: globalThis.document, Node: globalThis.Node, getComputedStyle: globalThis.getComputedStyle };
  globalThis.window = dom;
  globalThis.document = document;
  globalThis.Node = dom.Node;
  globalThis.getComputedStyle = dom.getComputedStyle.bind(dom);
  if (!dom.requestAnimationFrame) dom.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  try {
    return await axeCore.run(document.documentElement, options);
  } finally {
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.Node = prev.Node;
    globalThis.getComputedStyle = prev.getComputedStyle;
  }
}
{
  const { d, nav, api } = make();
  api.sync({ ayahs: FATIHA, surahs: [1], selected: { surah: 1, ayah: 3 }, expanded: { surah: 1, ayah: 3 } });
  const rules = [
    "aria-allowed-attr", "aria-required-attr", "aria-required-children", "aria-required-parent", "aria-roles", "aria-valid-attr-value", "aria-valid-attr",
    "aria-hidden-focus", "button-name", "duplicate-id", "duplicate-id-aria", "list", "listitem", "landmark-unique", "landmark-no-duplicate-banner", "nested-interactive", "tabindex",
  ];
  const results = await runAxe(d, { runOnly: { type: "rule", values: rules }, resultTypes: ["violations"] });
  const mine = results.violations.filter((v) => v.nodes.some((n) => n.target.join(" ").includes("ayah-nav")));
  check(`dolu #ayah-nav axe-core yapısal kurallarını ihlal etmiyor (${mine.map((v) => v.id).join(", ") || "yok"})`, mine.length === 0);
  check("dolu #ayah-nav: tabindex > 0 YOK (Tab sırasını bozan pozitif tabindex olmasın)", ![...nav.querySelectorAll("[tabindex]")].some((e) => Number(e.getAttribute("tabindex")) > 0));
}

await sleep(0);
if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log(
    "All checks passed (#ayah-nav işaretlemesi + CSS halka/ipucu kuralları + sw.js önbelleği, saf yardımcılar (ayahsOnPage/surahsOfSvg/revealDelta), createAyahNav (liste, roving tabindex, aria-current/expanded, ok tuşları + uçlarda dönmeme + dokunulmayan tuşlar, Enter tekrarı, tıklama, sayfa değişince odağın korunması, restoreFocus, :focus-visible işareti, onFocusTarget), app.js bağlantısı (seçim -> showPage, başlık -> Sure Bilgisi, panel açılınca odak + kaydırma, yalnızca klavye odağında halka/kaydırma, Ezber'de gizleme), çağrı noktaları ve sıraları, axe-core). NOT: bunlar otomatik/yapısal kontroller -- gerçek bir ekran okuyucu testinin ve gerçek Tab gezintisinin yerini tutmaz (gerçek Chromium ölçümü README'de)."
  );
}
