// Sure Bilgisi akordeonu: kapalı bir bölümün içeriği yalnızca görünmez OLMAKLA kalmamalı, Tab sırasından ve
// erişilebilirlik ağacından da çıkmalı. Regresyon kontrolü.
//
// Neden var: bir bölüm "kapalıyken" yalnızca küçülüyordu (grid-template-rows: 0fr + overflow: hidden) ve saydamlaşıyordu
// (opacity: 0). Düğme aria-expanded="false" diyordu ama içerik hâlâ oradaydı. Gerçek Chromium'da ölçülen durum (430 px;
// 50. sayfada gezginin "Âl-i İmrân Suresi hakkında bilgi" düğmesi -> Enter; 5 bölümün 4'ü kapalı), düzeltmeden ÖNCE:
//   - tam bir Tab turu 25 durak; 17'si kapalı bölümlerdeki bağlantılar ("1-32", "33-63", ...): odak ekranda görünmeyen
//     bir öğeye gidiyor;
//   - modal-odak.js'in tabbablesIn'i 24 öğe sayıyor (17'si kapalı bölümlerde) ve SON öğe kapalı bölümdeki "190 - 200"
//     bağlantısı: modal açılışında Shift+Tab (APG sarması: ilk durakta Shift+Tab -> son durak) odağı bu görünmez
//     bağlantıya atıyor;
//   - erişilebilirlik ağacında kapalı bölümdeki bağlantı role=link, ignored=false: ekran okuyucu görünmeyen metni okuyor.
// Düzeltme (css/style.css, .info-section-panel-inner): kapalıyken visibility: hidden, açıkken visible. Geçişler:
// kapanırken `visibility 0s linear 0.3s` (küçülme bitince; 0.3 s, grid-template-rows geçişinin süresi), açılırken
// `visibility 0s` (hemen: içerik animasyonun ilk karesinden itibaren görünür). Düzeltmeden sonra aynı sahne: Tab turu 8
// durak, hiçbiri kapalı bölümde; tabbablesIn 7 öğe, sonuncusu "Konu: Hidayet" düğmesi; Shift+Tab o düğmeye gidiyor;
// kapalı bölümdeki bağlantı ağaçta yok sayılıyor. Animasyon: yükseklik/opacity eğrisi yamasız ağaçla ölçüm gürültüsü
// içinde aynı; visibility açarken sınıfın eklendiği karede visible, kapanırken yükseklik 0'a indiği karede ya da hemen
// sonrasında hidden; hiçbir karede "yükseklik > 0 ama hidden" yok.
//
// Burada kontrol edilenler:
//   (1) css/style.css (jsdom CSSOM'uyla ayrıştırılıyor): kapalı/açık kurallardaki visibility değerleri (!important yok);
//       kapanışın visibility gecikmesi grid geçişinin süresine EŞİT, açılışınki yok; opacity geçişi iki durumda aynı ve
//       değerleri 0/1; 0fr/1fr kalıbını kullanan panellerin kümesi (aşağıya bakın);
//   (2) GERÇEK surahInfoBodyHTML (app.js'ten çıkarılıp) x 114 surenin GERÇEK verisi x GERÇEK style.css (jsdom, enjekte
//       edilmiş): her kapalı bölümde panelin içi, içeriği ve her bağlantısı computed visibility: hidden; her açık bölümde
//       visible; başlık düğmeleri her zaman visible; bölümü açıp kapatınca durum izliyor; aria-expanded ile .open tutarlı;
//   (3) GERÇEK createModalFocus/tabbablesIn: Sure Bilgisi modalında hiçbir durak kapalı bölümde değil, son durak son
//       bölümün başlık düğmesi, açılışta Shift+Tab ona gidiyor, ondan Tab ilk durağa sarıyor.
//
// KASITLI HARİÇ: aynı 0fr/1fr kalıbını kullanan .wm-tafsir-panel (tefsir) ve .word-meal-panel (ayet paneli). Tefsir paneli
// .word-meal-body'nin aria-live bölgesinin içinde ve içerik kapalıyken yazılıp bir kare sonra açılıyor: gizli bir alt ağaca
// yazılan metnin duyurulup duyurulmayacağı gerçek ekran okuyucu olmadan doğrulanamaz (bkz. README, "Sure Bilgisi'nde
// kapalı akordeon bölümleri"). Kapalı tefsir metninin ağaçta durması CSS ile değil, kapanış bitince metnin DOM'dan
// kaldırılmasıyla çözüldü: test/tefsir_sekme_aria_test.mjs.
// Ayet panelinin kapalı hâli kalıcı değil ve odak yönetimiyle iç içe. (1)'deki küme kontrolü, yeni bir 0fr paneli eklenirse
// bu karara dönüp bakılmasını sağlıyor.
//
// ÖNEMLİ SINIR: jsdom'da düzen, geçiş ve checkVisibility() yok. Geçişler yalnızca CSS metninden (süre/gecikme) doğrulanıyor;
// Tab tuzağı testindeki checkVisibility, Chromium'un ilgili kısmını (display:none ve visibilityProperty) taklit eden küçük bir
// yedek. Gerçek tarayıcı ölçümü (Tab durakları, erişilebilirlik ağacı, animasyon zaman çizgisi) README'de; gerçek ekran okuyucu
// (NVDA/JAWS/VoiceOver/TalkBack) çalıştırılmadı.
//
//   node kapali_panel_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";
import { createModalFocus, tabbablesIn } from "../js/modal-odak.js";
import { getSurahInfoEntry, splitInfoSections } from "../js/surahinfo.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const css = readText("css", "style.css");
const html = readText("index.html");
const appSource = readText("js", "app.js");
const infoData = JSON.parse(readText("data", "surah-info-tr.json"));

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}

// -- (1) CSS -------------------------------------------------------------------------------------------------
const cssRules = [...new JSDOM(`<style>${css}</style>`).window.document.styleSheets[0].cssRules].filter((r) => r.selectorText);
const rule = (selector) => cssRules.find((r) => r.selectorText === selector) || null;
const decl = (r, prop) => (r ? r.style.getPropertyValue(prop).trim() : null);

// `a, b(c, d) e` gibi değerleri, parantez içindeki ayırıcılara dokunmadan böler (cubic-bezier(0.2, 0.8, 0.2, 1)).
function splitTop(value, byComma) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && (byComma ? ch === "," : /\s/.test(ch))) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const seconds = (t) => (t.endsWith("ms") ? parseFloat(t) / 1000 : parseFloat(t));
// transition -> { özellik: { duration, delay, timing } } (saniye)
function transitions(r) {
  const out = {};
  for (const item of splitTop(decl(r, "transition") || "", true)) {
    const tokens = splitTop(item, false);
    const times = tokens.slice(1).filter((t) => /^[\d.]+m?s$/.test(t));
    const timing = tokens.slice(1).filter((t) => !/^[\d.]+m?s$/.test(t))[0] || "ease";
    out[tokens[0]] = { duration: times.length ? seconds(times[0]) : 0, delay: times.length > 1 ? seconds(times[1]) : 0, timing };
  }
  return out;
}

const PANEL = rule(".info-section-panel");
const PANEL_OPEN = rule(".info-section-panel.open");
const INNER = rule(".info-section-panel-inner");
const INNER_OPEN = rule(".info-section-panel.open .info-section-panel-inner");
check("css: akordeon kuralları (.info-section-panel, .open, -inner, .open -inner) bulundu", !!PANEL && !!PANEL_OPEN && !!INNER && !!INNER_OPEN);

if (PANEL && PANEL_OPEN && INNER && INNER_OPEN) {
  const gridT = transitions(PANEL)["grid-template-rows"];
  const tClosed = transitions(INNER);
  const tOpen = transitions(INNER_OPEN);
  check("css: panel kapalıyken 0fr, açıkken 1fr (kalıp eskisi gibi)", decl(PANEL, "grid-template-rows") === "0fr" && decl(PANEL_OPEN, "grid-template-rows") === "1fr");
  check("css: grid-template-rows geçişi var (küçülme animasyonu)", !!gridT && gridT.duration > 0);
  check("css: kapalıyken iç öğe visibility: hidden", decl(INNER, "visibility") === "hidden");
  check("css: açıkken iç öğe visibility: visible", decl(INNER_OPEN, "visibility") === "visible");
  check("css: visibility bildirimleri !important değil (öyle olsaydı açık kural kapalıyı ezemez, bölüm hep gizli kalırdı)", INNER.style.getPropertyPriority("visibility") === "" && INNER_OPEN.style.getPropertyPriority("visibility") === "");
  check(
    "css: kapanırken visibility geçişi 0 s sürüyor ve küçülme süresi kadar GECİKMELİ (içerik animasyon bitince gizlenir, küçülürken kesilmez)",
    !!tClosed.visibility && !!gridT && tClosed.visibility.duration === 0 && tClosed.visibility.delay === gridT.duration
  );
  check(
    "css: açılırken visibility geçişi GECİKMESİZ (aksi hâlde açılış animasyonu boyunca içerik hidden kalır; açık kuralın geçişi kapalıkini ezmeli)",
    !!tOpen.visibility && tOpen.visibility.duration === 0 && tOpen.visibility.delay === 0
  );
  // Süreyi dondurmuyoruz (animasyon ayarı değişebilir); açma ve kapama aynı eğriyi kullanmalı ve var olmalı.
  check(
    "css: opacity geçişi var ve açık/kapalı kuralda aynı (açılış ve kapanış aynı solma eğrisini kullanıyor)",
    !!tClosed.opacity && !!tOpen.opacity && tClosed.opacity.duration > 0 && tClosed.opacity.duration === tOpen.opacity.duration && tClosed.opacity.delay === tOpen.opacity.delay && tClosed.opacity.timing === tOpen.opacity.timing
  );
  check("css: opacity değerleri eskisi gibi (kapalı 0, açık 1) ve taşma/min-height kalıbı duruyor", decl(INNER, "opacity") === "0" && decl(INNER_OPEN, "opacity") === "1" && decl(INNER, "overflow") === "hidden" && decl(INNER, "min-height") === "0");
}

// 0fr kalıbını kullanan paneller. Üçüncüsünü (yenisini) eklerken: kapalıyken içeriği Tab sırasından ve erişilebilirlik
// ağacından çıkarmayı (visibility, bkz. .info-section-panel-inner) düşün; bilerek bırakıyorsan nedenini yaz ve buraya ekle.
const collapsePanels = cssRules.filter((r) => decl(r, "grid-template-rows") === "0fr").map((r) => r.selectorText);
const knownPanels = [".info-section-panel", ".wm-tafsir-panel", ".word-meal-panel"];
check(
  `css: 0fr/1fr kalıbını kullanan paneller bilinen üç tane (bulunan: ${collapsePanels.join(", ")}); yenisi eklendiyse kapalı içeriğin gizlenmesine bak`,
  JSON.stringify([...collapsePanels].sort()) === JSON.stringify([...knownPanels].sort())
);

// -- (2) Gerçek surahInfoBodyHTML x 114 sure x gerçek CSS ------------------------------------------------------
// Bir işlevin gövdesi (süslü parantezleri sayarak; şablon dizgelerindeki ${...} dengeli).
function bodyOf(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return null;
  const open = src.indexOf("{", src.indexOf(")", start));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}
const ESCAPE_SRC = /function escapeHtml\(s\) \{[\s\S]*?\n\}/.exec(appSource);
const BODY_SRC = bodyOf(appSource, "surahInfoBodyHTML");
check("app.js: escapeHtml ve surahInfoBodyHTML bulundu", !!ESCAPE_SRC && !!BODY_SRC);

let surahInfoBodyHTML = () => "";
if (ESCAPE_SRC && BODY_SRC) {
  const escapeHtml = new Function(`${ESCAPE_SRC[0]}; return escapeHtml;`)();
  // state.surahs: Arapça ad satırı için; istatistik satırı (surahInfoStatsHTML) akordeonla ilgisiz, boş.
  surahInfoBodyHTML = new Function("state", "escapeHtml", "splitInfoSections", "surahInfoStatsHTML", `return function surahInfoBodyHTML(surahNum, entry) {${BODY_SRC}};`)({ surahs: {} }, escapeHtml, splitInfoSections, () => "");
}
const bodyFor = (n) => surahInfoBodyHTML(n, getSurahInfoEntry(infoData, n));

function makeWindow() {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const D = dom.window.document;
  const style = D.createElement("style");
  style.textContent = css;
  D.head.appendChild(style);
  return { w: dom.window, D };
}

{
  const { w, D } = makeWindow();
  const body = D.getElementById("surah-info-body");
  const vis = (el) => w.getComputedStyle(el).visibility;
  const stats = { surahs: 0, sections: 0, closedPanels: 0, openPanels: 0, closedLinks: 0, openLinks: 0 };
  const bad = { closedNotHidden: [], openNotVisible: [], toggleHidden: [], toggleRoundTrip: [], ariaMismatch: [], sibling: [] };

  for (let n = 1; n <= 114; n++) {
    body.innerHTML = bodyFor(n);
    stats.surahs++;
    for (const section of body.querySelectorAll(".info-section")) {
      stats.sections++;
      const toggle = section.querySelector(":scope > .info-section-toggle");
      const panel = section.querySelector(":scope > .info-section-panel");
      const inner = panel && panel.querySelector(":scope > .info-section-panel-inner");
      const content = inner && inner.querySelector(":scope > .info-section-content");
      const tag = `${n}. sure, "${toggle ? toggle.textContent.trim().slice(0, 20) : "?"}"`;
      if (!toggle || !panel || !inner || !content) {
        bad.sibling.push(tag + " (iskelet)");
        continue;
      }
      if (toggle.nextElementSibling !== panel) bad.sibling.push(tag + " (başlık düğmesinin hemen ardından panel gelmiyor)");
      const open = panel.classList.contains("open");
      if (toggle.getAttribute("aria-expanded") !== (open ? "true" : "false")) bad.ariaMismatch.push(tag);
      if (vis(toggle) !== "visible") bad.toggleHidden.push(tag);
      const links = [...panel.querySelectorAll("a[href]")];
      const want = open ? "visible" : "hidden";
      const got = [vis(inner), vis(content), ...links.map(vis)];
      if (open) {
        stats.openPanels++;
        stats.openLinks += links.length;
        if (got.some((v) => v !== want)) bad.openNotVisible.push(tag);
      } else {
        stats.closedPanels++;
        stats.closedLinks += links.length;
        if (got.some((v) => v !== want)) bad.closedNotHidden.push(tag);
      }
      // Bölümü açıp kapatmak (uygulamanın yaptığı: .open sınıfı) durumu izliyor mu?
      panel.classList.toggle("open");
      const flipped = [vis(inner), ...links.slice(0, 1).map(vis)];
      panel.classList.toggle("open");
      const back = [vis(inner), ...links.slice(0, 1).map(vis)];
      if (flipped.some((v) => v !== (open ? "hidden" : "visible")) || back.some((v) => v !== want)) bad.toggleRoundTrip.push(tag);
    }
  }
  const list = (a) => (a.length ? ` -- ilk ihlaller: ${a.slice(0, 3).join(" | ")}` : "");
  check(`114 surenin hepsi işlendi, bölüm sayısı makul (${stats.sections})`, stats.surahs === 114 && stats.sections >= 300);
  check(`taramanın boş geçmediği: kapalı bölümler (${stats.closedPanels}) ve içlerinde bağlantılar (${stats.closedLinks}) var`, stats.closedPanels >= 200 && stats.closedLinks >= 100);
  check(`taramanın boş geçmediği: açık bölümler (${stats.openPanels}) ve içlerinde bağlantılar (${stats.openLinks}) var`, stats.openPanels >= 100 && stats.openLinks >= 1);
  check(`iskelet: her bölümde başlık düğmesi + hemen ardından panel > iç > içerik${list(bad.sibling)}`, bad.sibling.length === 0);
  check(`aria-expanded ile .open sınıfı her bölümde tutarlı${list(bad.ariaMismatch)}`, bad.ariaMismatch.length === 0);
  check(`kapalı bölümlerde panelin içi, içeriği ve HER bağlantısı computed visibility: hidden (Tab sırasından ve erişilebilirlik ağacından çıkar)${list(bad.closedNotHidden)}`, bad.closedNotHidden.length === 0);
  check(`açık bölümlerde panelin içi, içeriği ve bağlantıları visible${list(bad.openNotVisible)}`, bad.openNotVisible.length === 0);
  check(`başlık düğmeleri (panelin dışında) her zaman visible${list(bad.toggleHidden)}`, bad.toggleHidden.length === 0);
  check(`bölümü açıp kapatınca visibility durumu izliyor${list(bad.toggleRoundTrip)}`, bad.toggleRoundTrip.length === 0);
  console.log(`tarama: ${stats.surahs} sure, ${stats.sections} bölüm; kapalı ${stats.closedPanels} (${stats.closedLinks} bağlantı), açık ${stats.openPanels} (${stats.openLinks} bağlantı)`);
}

// -- (3) Tab tuzağı: gerçek createModalFocus / tabbablesIn ---------------------------------------------------------
{
  const { w, D } = makeWindow();
  // jsdom'da checkVisibility yok; Chromium'un ilgili kısmı: display:none -> false; visibilityProperty (eski adı
  // checkVisibilityCSS) verilmişse visibility: hidden/collapse -> false. Bayrak verilmezse visibility'ye bakılmaz (Chromium gibi).
  w.Element.prototype.checkVisibility = function (opts = {}) {
    for (let n = this; n && n.nodeType === 1; n = n.parentElement) if (w.getComputedStyle(n).display === "none") return false;
    return !((opts.visibilityProperty || opts.checkVisibilityCSS) && ["hidden", "collapse"].includes(w.getComputedStyle(this).visibility));
  };
  const modal = D.getElementById("surah-info-modal");
  modal.hidden = false;
  D.getElementById("surah-info-body").innerHTML = bodyFor(3);
  const toggles = [...modal.querySelectorAll(".info-section-toggle")];
  const items = tabbablesIn(modal);
  const inClosed = items.filter((el) => el.closest(".info-section-panel:not(.open)"));
  check(`3. sure: ${toggles.length} bölüm, en az 3'ü kapalı (sınama anlamlı)`, toggles.length >= 4 && modal.querySelectorAll(".info-section-panel:not(.open)").length >= 3);
  check(`tabbablesIn: kapalı bölümlerdeki hiçbir bağlantı durak sayılmıyor (${inClosed.length} tane sayıldı)`, inClosed.length === 0);
  check("tabbablesIn: tüm başlık düğmeleri ve açık bölümün bağlantıları durak", toggles.every((t) => items.includes(t)) && [...modal.querySelectorAll(".info-section-panel.open a[href]")].every((a) => items.includes(a)));
  check("tabbablesIn: son durak son bölümün başlık düğmesi (görünmez bir bağlantı değil)", items[items.length - 1] === toggles[toggles.length - 1]);

  const mf = createModalFocus(D, () => modal);
  mf.enter(modal);
  check("modal açılışında odak kapsayıcıda", D.activeElement === modal);
  const press = (shiftKey) => {
    const ev = new w.KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
    D.activeElement.dispatchEvent(ev);
  };
  press(true);
  check("açılışta Shift+Tab odağı son GÖRÜNÜR durağa (son bölümün başlık düğmesi) götürüyor", D.activeElement === toggles[toggles.length - 1]);
  press(false);
  check("son duraktan Tab ilk durağa sarıyor", D.activeElement === items[0]);
  mf.dispose();
}

if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All checks passed (kapalı akordeon bölümleri: CSS yapısı, 114 sure x gerçek CSS, Tab tuzağı).");
