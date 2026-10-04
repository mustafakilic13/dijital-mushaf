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
// anonsların birleşmesi.
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
import { JSDOM } from "jsdom";
import axeCore from "axe-core";

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

// -- Gerçek addTextSelectionLayer çıktısının BİREBİR yapısı jsdom'a monte edilip axe ile taranıyor -----
{
  const dom = new JSDOM(`<!DOCTYPE html><html lang="tr"><body></body></html>`, { pretendToBeVisual: true });
  const d = dom.window.document;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const svg = d.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 700 1000");
  const pageG = d.createElementNS(SVG_NS, "g");
  svg.appendChild(pageG);
  // addTextSelectionLayer'ın kendisiyle BİREBİR aynı DOM inşası (render.js'ten kopya):
  const fo = d.createElementNS(SVG_NS, "foreignObject");
  fo.setAttribute("x", "10");
  fo.setAttribute("y", "20");
  fo.setAttribute("width", "300");
  fo.setAttribute("height", "40");
  fo.setAttribute("class", "text-layer-fo");
  const div = d.createElement("div");
  div.className = "text-layer-line";
  div.style.fontSize = "900px";
  div.style.transform = "scaleX(1)";
  div.dir = "rtl";
  div.textContent = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
  fo.appendChild(div);
  pageG.appendChild(fo);
  d.body.appendChild(svg);

  check("kurulan test DOM'unda gerçek Arapça metin sorgulanabilir (jsdom seviyesinde en azından mevcut)", d.querySelector(".text-layer-line").textContent === "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ");
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
    "All checks passed (nav-announcer yapısı + gecikmeli/tekrar-anons/birleşik-anons mantığı, canlı bölge kapsamı (#page-container canlı değil, panel gövdesi canlı, panel açılış/kapanış anonsu), showPage huni kontrolü, metin katmanının aria-hiding'siz yapısı, axe-core yapısal tarama). NOT: bunlar otomatik/yapısal kontroller -- gerçek bir ekran okuyucu testinin yerini tutmaz."
  );
}
