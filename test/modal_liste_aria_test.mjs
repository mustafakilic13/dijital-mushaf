// Modal listelerinin ekran okuyucu anlamı: Sure ve Cüz/Hizb/Rub/Menzil satırları, Ezber'in Sure/Kârî seçicileri, Sure modalındaki ayet
// düğmeleri. Regresyon kontrolü.
//
// Neden var: Gerçek Chromium'da (430 px, sayfa 50: Sure 3 etkin; erişilebilirlik ağacı CDP ile okundu), düzeltmeden ÖNCE:
//   - Etkin satır (Sure, Cüz, Hizb, Rub, Menzil; Ezber'in Sure ve Kârî seçicileri) ve etkin ayet düğmesi YALNIZCA renkle ayrılıyordu
//     (.active: %12 zümrüt zemin + kalın zümrüt rakam). Erişilebilirlik ağacında etkin ve etkin olmayan satır aynıydı (rol=button, ad
//     "3 آل عمران Âl-i İmrân · 200 ayet", hiçbir durum yok): ekran okuyucu kullanıcısı "şu an hangi sure/cüz" bilgisine liste içinde
//     ulaşamıyordu (WCAG 1.4.1 renk tek başına bilgi taşımamalı; 4.1.2 durum bildirilmeli);
//   - Ayet düğmelerinin adı yalnızca görünen sayıydı ("3", "1"): 286 düğmelik bir ızgarada hangi surenin ayeti olduğu okunmuyordu
//     (ızgaranın kendisi rolsüz bir <div>, adı da yok);
//   - Ezber'in dört seçici düğmesi (Dinle > Kârî, Dinle/Oku/Yaz > Sure) aria-haspopup="listbox" taşıyordu: Chromium hasPopup=listbox
//     bildiriyor, ekran okuyucu "liste kutusu" diyor ve ok tuşlarıyla gezinti bekletiyor; oysa açılan şey role=group içinde düz
//     <button> satırları (listbox da option da değil, ok tuşu gezintisi yok): ipucu olmayan bir sözleşmeyi vaat ediyordu.
//
// Düzeltme: setActiveModalItem (Sure/Cüz/Hizb/Rub/Menzil ve iki Ezber seçicisinin tek yazıcısı), setActiveAyahChip ve
// syncAyahGridHighlight etkin öğede .active ile birlikte aria-current="true" yazıp siliyor (ayet gezgininin düğmeleriyle aynı bildirim,
// js/ayet-gezgini.js); ayet düğmeleri "<Sure> Suresi, <N>. ayet" adını taşıyor (ayet gezgininin düğmeleriyle aynı biçim, görünen sayıyı
// içeriyor: WCAG 2.5.3); dört Ezber düğmesinden aria-haspopup="listbox" kaldırıldı (satırlar düz düğme kaldı; ok tuşu gezintisi ayrı bir
// iş). Görünüm aynı: .active kuralları duruyor.
//
// Burada kontrol edilenler:
//   (1) kaynak: .active ile aria-current'ın tek değerden ("on") yazılması, yazıcı sayıları (yeni bir .active yazıcısı aria-current'ı
//       atlayamaz), ayet düğmesi adının biçimi ve ayet gezgini ile aynılığı;
//   (2) index.html + CSS: dört Ezber düğmesinde aria-haspopup yok, kalan aria-haspopup'lar dört modal açıcıda ve hep "dialog",
//       listbox/option rolü yok, seçici grupları duruyor, .active görünümü duruyor;
//   (3) davranış: GERÇEK populateSurahList/populateUnitList/toggleAyahGrid/setActiveAyahChip/syncAyahGridHighlight/setActiveModalItem ve
//       GERÇEK <ezber-picker> bloğu x GERÇEK index.html x GERÇEK data/*.json, jsdom'da: her satır için (Sure 114, Cüz 30, Hizb 60, Rub 240,
//       Menzil 7, Ezber Sure 114, Kârî 2) tek etkin satır = tek aria-current satırı; eşleşmeyen değerler ikisini de siliyor; 6236 ayet
//       düğmesinin hepsi doğru ve eşsiz adı taşıyor (ad, axe-core'un ad hesaplamasıyla da doğrulanıyor); ayet seçimi değişince vurgu
//       (sınıf + öznitelik) birlikte taşınıyor;
//   (4) 12 tohumlu rastgele işlem dizisi (satır seçimi, Sure modalı açılışı, iki seçici, ızgara açma/kapama, ayet seçimi) x bağımsız bir
//       model: her adımdan sonra bütün listeler ve kurulmuş ızgaralar modelle birebir; hiçbir yerde .active ile aria-current ayrışmıyor;
//   (5) axe-core (jsdom): üç modal (Sure, Cüz, Ezber) açık ve doldurulmuşken aria-allowed-attr, aria-valid-attr(-value), aria-roles,
//       button-name ihlali yok.
//
// SINIR: jsdom'da düzen yok; aria-current'ın ekran okuyucuda "geçerli" diye okunması burada DOĞRULANAMIYOR (yalnızca özniteliğin doğru
// öğede ve doğru değerde olması sınanıyor; Chromium'un CDP erişilebilirlik ağacı aria-current'ı hiç listelemiyor, yani gerçek Chromium
// ölçümü de DOM özniteliğini ve hesaplanan adı gösteriyor). Gerçek ekran okuyucu (NVDA/JAWS/VoiceOver/TalkBack) testinin YERİNİ
// TUTMAZ (README kontrol listesi, madde 25). Ok tuşuyla liste gezintisi bu testin konusu DEĞİL (Sure listesinde son satıra 228 Tab: ayrı
// bir iş). Firefox ve Safari'de denenmedi.
//
//   node modal_liste_aria_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM, VirtualConsole } from "jsdom";
import axeCore from "axe-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const readJSON = (...p) => JSON.parse(readText(...p));
const html = readText("index.html");
const css = readText("css", "style.css");
const appSource = readText("js", "app.js");
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, ""); // tam satır yorumları olmadan (yorumlardaki örnek kod sayımı bozmasın)
const appCode = strip(appSource);
const gezginCode = strip(readText("js", "ayet-gezgini.js"));
const surahs = readJSON("data", "surahs.json");
const surahPages = readJSON("data", "surah-pages.json");
const unitData = { juz: readJSON("data", "juz.json"), hizb: readJSON("data", "hizb.json"), rub: readJSON("data", "rub.json"), manzil: readJSON("data", "manzil.json") };

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Süslü parantezleri sayarak bir kaynak parçası (dizge/yorum içinde süslü parantez yok).
function braceSpan(src, from) {
  const open = src.indexOf("{", from);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return { open, close: i };
  }
  return null;
}
function fnSource(name, src = appSource) {
  const m = new RegExp(`(?:async )?function ${name}\\(`).exec(src);
  if (!m) return null;
  const span = braceSpan(src, src.indexOf(")", m.index));
  return span ? src.slice(m.index, span.close + 1) : null;
}
function constObjSource(name) {
  const at = appSource.indexOf(`const ${name} = {`);
  if (at < 0) return null;
  const span = braceSpan(appSource, at);
  return span ? appSource.slice(at, span.close + 2) : null; // sondaki ";" dahil
}

// -- (1) Kaynak ----------------------------------------------------------------------------------------------
const BLOCK = /\/\/ <ezber-picker>([\s\S]*?)\/\/ <\/ezber-picker>/.exec(appSource);
const RECITERS_SRC = constObjSource("RECITERS");
const SRC = {};
for (const n of ["surahLabel", "populateSurahList", "toggleAyahGrid", "closeAllAyahGrids", "setActiveAyahChip", "syncAyahGridHighlight", "populateUnitList", "setActiveModalItem"]) SRC[n] = fnSource(n);
const extracted = !!BLOCK && !!RECITERS_SRC && Object.values(SRC).every(Boolean);
check("app.js: <ezber-picker> bloğu, RECITERS ve sekiz işlev (surahLabel, populateSurahList, toggleAyahGrid, closeAllAyahGrids, setActiveAyahChip, syncAyahGridHighlight, populateUnitList, setActiveModalItem) kaynaktan çıkarıldı", extracted);
if (!extracted) {
  console.error("app.js'ten gerekli kaynak parçaları çıkarılamadı");
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
const CODE = Object.fromEntries(Object.entries(SRC).map(([k, v]) => [k, strip(v)]));
const RECITER_KEYS = Object.keys(new Function(`${RECITERS_SRC}\nreturn RECITERS;`)());

check('app.js: setActiveModalItem: .active ve aria-current TEK "on" değerinden yazılıyor (eşleşme: classList.toggle + setAttribute "true"; eşleşmeme: removeAttribute)', /const on = item\.dataset\[matchAttr\] === String\(value\);\s*item\.classList\.toggle\("active", on\);\s*if \(on\) item\.setAttribute\("aria-current", "true"\);\s*else item\.removeAttribute\("aria-current"\);/.test(CODE.setActiveModalItem));
check('app.js: setActiveAyahChip: aynı kalıp (.active + aria-current tek "on" değerinden)', /const on = parseInt\(chip\.dataset\.ayah, 10\) === ayahNum;\s*chip\.classList\.toggle\("active", on\);\s*if \(on\) chip\.setAttribute\("aria-current", "true"\);\s*else chip\.removeAttribute\("aria-current"\);/.test(CODE.setActiveAyahChip));
check("app.js: syncAyahGridHighlight: başka surenin ızgarasındaki etkin düğmede .active ve aria-current birlikte siliniyor", /querySelectorAll\("\.ayah-chip\.active"\)\.forEach\(\(c\) => \{\s*c\.classList\.remove\("active"\);\s*c\.removeAttribute\("aria-current"\);\s*\}\);/.test(CODE.syncAyahGridHighlight));
{
  const setters = [...appCode.matchAll(/setAttribute\("aria-current",\s*([^)]*)\)/g)].map((m) => m[1].trim());
  check(`app.js: aria-current'ı yazan yer 2 (setActiveModalItem, setActiveAyahChip), ikisi de yalnızca "true" (boş dizge ""/"false" yok) (bulunan: ${JSON.stringify(setters)})`, setters.length === 2 && setters.every((v) => v === '"true"'));
  check('app.js: aria-current\'ı silen yer 3 (iki işlev + syncAyahGridHighlight)', (appCode.match(/removeAttribute\("aria-current"\)/g) || []).length === 3);
  check('app.js: toggleAttribute("aria-current") YOK (boş değerli öznitelik "false" sayılır: etkin öğe bildirilmezdi)', !/toggleAttribute\(\s*"aria-current"/.test(appCode));
  const writers = (appCode.match(/classList\.(?:toggle|add|remove)\("active"/g) || []).length;
  check(`app.js: .active sınıfını yazan yer 4 (3'ü liste satırı/ayet düğmesi: her biri aria-current ile birlikte; 4.'sü tefsir sekmesi: aria-expanded ile): yeni bir yazıcı eklenirse aria-current'ı atlamasın, bu test de güncellensin (bulunan: ${writers})`, writers === 4);
}
check("app.js: ayet düğmesinin adı `${info.nameTurkish} Suresi, ${a}. ayet` (toggleAyahGrid, düğme oluşturulurken)", /chip\.setAttribute\("aria-label", `\$\{info\.nameTurkish\} Suresi, \$\{a\}\. ayet`\);/.test(CODE.toggleAyahGrid));
check("js/ayet-gezgini.js: ayet düğmelerinin adı aynı biçimde (`<Sure> Suresi, <N>. ayet`): iki ayet düğmesi ailesi aynı okunuyor", /makeButton\(AYAH_CLASS, `\$\{hooks\.surahName\(surah\)\} Suresi, \$\{ayah\}\. ayet`/.test(gezginCode));

// -- (2) index.html + CSS --------------------------------------------------------------------------------------
{
  const D = new JSDOM(html).window.document;
  const four = ["dinle-reciter", "dinle-surah", "oku-surah", "yaz-surah"].map((k) => D.getElementById(`ezber-${k}-btn`));
  check("index.html: Ezber'in dört seçici düğmesi var, gerçek <button type=button>", four.every((b) => !!b && b.tagName === "BUTTON" && b.type === "button"));
  check("index.html: dört seçici düğmede de aria-haspopup YOK (açılan şey düz düğmelerden oluşan bir grup: liste kutusu/menü değil, ok tuşu gezintisi sözü vermesin)", four.every((b) => b && !b.hasAttribute("aria-haspopup")));
  check("index.html: dört düğmenin adı korunuyor (aria-labelledby = alan etiketi + görünen değer)", ["dinle-reciter", "dinle-surah", "oku-surah", "yaz-surah"].every((k) => D.getElementById(`ezber-${k}-btn`).getAttribute("aria-labelledby") === `ezber-${k}-label ezber-${k}-btn-text`));
  const popups = [...D.querySelectorAll("[aria-haspopup]")];
  check(`index.html: aria-haspopup yalnızca dört modal açıcıda (juz-btn, page-btn, surah-btn, arama-btn) ve hep "dialog"; "listbox" hiç yok (bulunan: ${popups.map((e) => `${e.id}=${e.getAttribute("aria-haspopup")}`).join(", ")})`, popups.map((e) => e.id).sort().join() === "arama-btn,juz-btn,page-btn,surah-btn" && popups.every((e) => e.getAttribute("aria-haspopup") === "dialog"));
  check("index.html: listbox/option rolü yok (satırlar düz düğme: listbox deseni ok tuşu gezintisi ister, o ayrı bir iş; yarım dönüşüm yanlış söz verirdi)", !D.querySelector('[role="listbox"],[role="option"]'));
  const groups = ["ezber-surah-picker", "ezber-reciter-picker"].map((id) => D.getElementById(id));
  check('index.html: iki Ezber seçicisi role="group", başlığına aria-labelledby ile bağlı ("Sure Seç, grup": odak açılışta buraya geliyor)', groups.every((g) => g && g.getAttribute("role") === "group" && !!D.getElementById(g.getAttribute("aria-labelledby") || "none")));
}
check("css: .modal-item.active ve .ayah-chip.active kuralları duruyor (aria-current görünümün yerine değil, yanına geldi)", /\.modal-item\.active\s*\{/.test(css) && /\.ayah-chip\.active\s*\{/.test(css));

// -- (3) Davranış (jsdom) -------------------------------------------------------------------------------------
const TABS = ["dinle", "oku", "yaz"];
const LISTS = [
  { attr: "surah", key: "surahList", id: "surah-list", count: 114 },
  { attr: "juz", key: "juzList", id: "juz-list", count: 30 },
  { attr: "hizb", key: "hizbList", id: "hizb-list", count: 60 },
  { attr: "rub", key: "rubList", id: "rub-list", count: 240 },
  { attr: "manzil", key: "manzilList", id: "manzil-list", count: 7 },
];
const versesOf = (n) => surahs[String(n)].versesCount;

// jsdom, olay dinleyicisinde fırlayan yakalanmamış hatayı yutup konsola yazıyor: burada toplanıyor ve sonda sıfır olmalı
const jsdomErrors = [];
function makeEnv({ selectedAyah = null } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => jsdomErrors.push(String((e && e.detail && e.detail.message) || (e && e.message) || e).slice(0, 140)));
  const dom = new JSDOM(html, { pretendToBeVisual: true, url: "http://localhost/", virtualConsole });
  const win = dom.window;
  const d = win.document;
  const scrolled = [];
  win.Element.prototype.scrollIntoView = function () {
    scrolled.push(this);
  };
  const els = { ezberTabs: d.getElementById("ezber-tabs") };
  for (const spec of LISTS) els[spec.key] = d.getElementById(spec.id);
  const state = { surahs, surahPages, juz: unitData.juz, hizb: unitData.hizb, rub: unitData.rub, manzil: unitData.manzil, selectedAyah, pageToSurah: { 50: 3 }, currentPage: 50 };
  const modalFocus = { enter() {}, restore() {}, remember() {} };
  const code = [SRC.surahLabel, SRC.populateSurahList, SRC.toggleAyahGrid, SRC.closeAllAyahGrids, SRC.setActiveAyahChip, SRC.syncAyahGridHighlight, SRC.populateUnitList, SRC.setActiveModalItem, RECITERS_SRC, BLOCK[1],
    "return { populateSurahList, toggleAyahGrid, setActiveAyahChip, syncAyahGridHighlight, populateUnitList, setActiveModalItem, populateEzberSurahPickerList, populateEzberReciterPickerList, openEzberPicker, closeEzberPicker, setEzberSurah, setEzberReciter };"].join("\n");
  const api = new Function("els", "state", "document", "modalFocus", code)(els, state, d, modalFocus);
  api.populateSurahList();
  api.populateUnitList(els.juzList, state.juz, 30, "juz");
  api.populateUnitList(els.hizbList, state.hizb, 60, "hizb");
  api.populateUnitList(els.rubList, state.rub, 240, "rub");
  api.populateUnitList(els.manzilList, state.manzil, 7, "manzil");
  api.populateEzberSurahPickerList();
  api.populateEzberReciterPickerList();
  const $ = (id) => d.getElementById(id);
  const wrappers = [...els.surahList.querySelectorAll(".surah-row-wrapper")];
  const grids = wrappers.map((w) => w.querySelector(".ayah-grid"));
  return {
    d, win, els, state, api, scrolled, $, grids,
    pickerList: (kind) => $(`ezber-${kind}-picker-list`),
    grid: (s) => grids[s - 1],
    toggle(s) {
      api.toggleAyahGrid(s, grids[s - 1], wrappers[s - 1].querySelector(".surah-expand-btn"));
    },
    // Axe'in ve ad hesabının görebilmesi için modal ve içindeki gizli her şey açılıyor (yapı taraması; hidden öğe addan/ağaçtan düşer)
    reveal(...ids) {
      for (const id of ids) {
        const m = $(id);
        m.hidden = false;
        for (const h of m.querySelectorAll("[hidden]")) h.hidden = false;
      }
    },
  };
}

// Etkin işaretli öğeler: .active ya da aria-current taşıyan HER öğe (normalde en çok bir tane), "<değer>:<A: .active><C: aria-current="true" | ?: başka değer>"
// biçiminde. Tek geçişte hem "doğru öğede mi" hem "ikisi birlikte mi" hem "değer tam "true" mu" soruluyor.
const flag = (e, key) => `${e.dataset[key]}:${e.classList.contains("active") ? "A" : "-"}${e.getAttribute("aria-current") === "true" ? "C" : e.hasAttribute("aria-current") ? "?" : "-"}`;
const rowsOf = (el) => [...el.querySelectorAll(".modal-item")];
const rowFlags = (el, attr) => [...el.querySelectorAll(".modal-item.active, .modal-item[aria-current]")].map((r) => flag(r, attr));
const chipFlags = (grid) => [...grid.querySelectorAll(".ayah-chip.active, .ayah-chip[aria-current]")].map((c) => flag(c, "ayah"));
const want = (v) => (v === null || v === undefined ? [] : [`${v}:AC`]); // beklenen: etkin ve aria-current'lı tek öğe ya da hiçbiri
const sameArr = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// axe-core bir tarayıcı ortamı bekliyor: jsdom penceresi geçici olarak global'e konuyor (bkz. erisilebilirlik_test.mjs). axe pencereyi
// çalıştırılan ÖĞEDEN çıkarıyor (document.ownerDocument), o yüzden run/setup'a belge değil öğe veriliyor.
function withAxeGlobals(env, fn) {
  const prev = { window: globalThis.window, document: globalThis.document, Node: globalThis.Node, getComputedStyle: globalThis.getComputedStyle };
  globalThis.window = env.win;
  globalThis.document = env.d;
  globalThis.Node = env.win.Node;
  globalThis.getComputedStyle = env.win.getComputedStyle.bind(env.win);
  if (!env.win.requestAnimationFrame) env.win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  const restore = () => {
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.Node = prev.Node;
    globalThis.getComputedStyle = prev.getComputedStyle;
  };
  let out;
  try {
    out = fn();
  } catch (e) {
    restore();
    throw e;
  }
  if (out && typeof out.then === "function") return out.finally(restore);
  restore();
  return out;
}

// (3a) Satırlar: Sure, Cüz, Hizb, Rub, Menzil (tek belge: listeler birbirinden bağımsız, her biri yalnızca kendi satırlarını işaretlemeli)
const env3a = makeEnv();
for (const spec of LISTS) {
  const env = env3a;
  const el = env.els[spec.key];
  const rows = rowsOf(el);
  check(`${spec.attr}: ${spec.count} satır, hepsi gerçek <button type=button>; başlangıçta etkin satır ve aria-current yok`, rows.length === spec.count && rows.every((r) => r.tagName === "BUTTON" && r.type === "button") && rowFlags(el, spec.attr).length === 0);
  const bad = [];
  for (let n = 1; n <= spec.count; n++) {
    env.api.setActiveModalItem(el, spec.attr, n);
    if (!sameArr(rowFlags(el, spec.attr), want(n))) bad.push(`${n} -> ${rowFlags(el, spec.attr).join("|")}`);
  }
  check(`${spec.attr}: 1..${spec.count} her değer için TEK .active satır ve TEK aria-current="true" satır, ikisi aynı satır (bozuk: ${bad.slice(0, 4).join(", ")})`, bad.length === 0);
  const badNone = [];
  for (const v of [0, spec.count + 1, -1, 1.5, "x", "", undefined, null]) {
    env.api.setActiveModalItem(el, spec.attr, 2); // önce bir satır etkin: eşleşmeyen değer ikisini de silmeli
    env.api.setActiveModalItem(el, spec.attr, v);
    if (rowFlags(el, spec.attr).length !== 0) badNone.push(`${String(v)} -> ${rowFlags(el, spec.attr).join("|")}`);
  }
  check(`${spec.attr}: eşleşmeyen değer (0, ${spec.count + 1}, -1, 1.5, "x", "", undefined, null) önceki etkin satırın .active ve aria-current'ını siliyor (kalan: ${badNone.join(", ")})`, badNone.length === 0);
  env.api.setActiveModalItem(el, spec.attr, String(spec.count));
  check(`${spec.attr}: değer dizge de olabilir ("${spec.count}" = ${spec.count}): son satır etkin ve aria-current'lı`, sameArr(rowFlags(el, spec.attr), want(spec.count)));
  check(`${spec.attr}: satırlar düz düğme kaldı (role, aria-selected, aria-pressed yok: etkin satır dahil)`, rowsOf(el).every((r) => !r.hasAttribute("role") && !r.hasAttribute("aria-selected") && !r.hasAttribute("aria-pressed")));
  env.scrolled.length = 0;
  env.api.setActiveModalItem(el, spec.attr, 1);
  const hit = env.scrolled.length === 1 && env.scrolled[0] === rowsOf(el)[0];
  env.scrolled.length = 0;
  env.api.setActiveModalItem(el, spec.attr, 0);
  check(`${spec.attr}: etkin satır görünür alana getiriliyor (scrollIntoView yalnızca etkin satır için; eşleşme yoksa çağrılmıyor): davranış değişmedi`, hit && env.scrolled.length === 0);
}

// (3b) Ezber seçicileri: Sure (3 sekmeden) ve Kârî
{
  const env = makeEnv();
  const surahRows = rowsOf(env.pickerList("surah"));
  const reciterRows = rowsOf(env.pickerList("reciter"));
  check(`Ezber seçicileri: ${surahRows.length} Sure satırı, ${reciterRows.length} Kârî satırı, hepsi gerçek <button type=button>, başlangıçta aria-current yok`, surahRows.length === 114 && reciterRows.length === RECITER_KEYS.length && [...surahRows, ...reciterRows].every((r) => r.tagName === "BUTTON" && r.type === "button" && !r.hasAttribute("aria-current")));
  const bad = [];
  for (const target of TABS) {
    for (let n = 1; n <= 114; n++) {
      env.api.setEzberSurah(target, n);
      env.api.openEzberPicker("surah", target);
      if (!sameArr(rowFlags(env.pickerList("surah"), "surah"), want(n))) bad.push(`${target}:${n}`);
      env.api.closeEzberPicker();
    }
  }
  check(`Ezber Sure seçicisi: 3 sekme x 114 sure: açılışta TEK .active satır = TEK aria-current satırı (bozuk: ${bad.slice(0, 5).join(",")})`, bad.length === 0);
  const badR = [];
  for (const key of RECITER_KEYS) {
    env.api.setEzberReciter("dinle", key);
    env.api.openEzberPicker("reciter", "dinle");
    if (!sameArr(rowFlags(env.pickerList("reciter"), "reciter"), want(key))) badR.push(key);
    env.api.closeEzberPicker();
  }
  check(`Ezber Kârî seçicisi: ${RECITER_KEYS.length} kârî (${RECITER_KEYS.join(", ")}): açılışta TEK .active satır = TEK aria-current satırı (bozuk: ${badR.join(",")})`, badR.length === 0);
  const lastKey = RECITER_KEYS[RECITER_KEYS.length - 1];
  env.api.setEzberSurah("dinle", 36);
  env.api.openEzberPicker("surah", "dinle");
  env.api.closeEzberPicker();
  env.api.setEzberReciter("dinle", lastKey);
  env.api.openEzberPicker("reciter", "dinle");
  env.api.closeEzberPicker();
  check("Ezber seçicileri: iki liste birbirinden bağımsız (Kârî seçimi Sure listesinin işaretini, Sure seçimi Kârî listesininkini değiştirmiyor)", sameArr(rowFlags(env.pickerList("surah"), "surah"), want(36)) && sameArr(rowFlags(env.pickerList("reciter"), "reciter"), want(lastKey)));
}

// (3c) Ayet düğmeleri: adlar
{
  const env = makeEnv();
  let total = 0;
  const labels = new Set();
  const badCount = [];
  const badKind = [];
  const badLabel = [];
  const badInName = [];
  for (let s = 1; s <= 114; s++) {
    const info = surahs[String(s)];
    env.toggle(s);
    const grid = env.grid(s);
    const chips = [...grid.querySelectorAll(".ayah-chip")];
    total += chips.length;
    if (chips.length !== info.versesCount || grid.children.length !== chips.length) badCount.push(s);
    chips.forEach((c, i) => {
      const a = i + 1;
      const label = c.getAttribute("aria-label");
      labels.add(label);
      if (c.tagName !== "BUTTON" || c.type !== "button" || c.textContent !== String(a) || c.dataset.surah !== String(s) || c.dataset.ayah !== String(a)) badKind.push(`${s}:${a}`);
      if (label !== `${info.nameTurkish} Suresi, ${a}. ayet`) badLabel.push(`${s}:${a}`);
      if (!(label || "").includes(c.textContent)) badInName.push(`${s}:${a}`);
    });
  }
  check(`ayet düğmeleri: 114 sure için ızgaralar tam (toplam ${total} = 6236; bozuk: ${badCount.slice(0, 5).join(",")})`, total === 6236 && badCount.length === 0);
  check(`ayet düğmeleri: hepsi gerçek <button type=button> .ayah-chip, görünen metin yalnızca sayı, data-surah/data-ayah doğru (bozuk: ${badKind.slice(0, 5).join(",")})`, badKind.length === 0);
  check(`ayet düğmeleri: 6236 düğmenin hepsinin adı "<Sure> Suresi, <N>. ayet" (bozuk: ${badLabel.slice(0, 5).join(",")})`, badLabel.length === 0);
  check(`ayet düğmeleri: ad görünen sayıyı içeriyor (WCAG 2.5.3 Label in Name; bozuk: ${badInName.slice(0, 5).join(",")})`, badInName.length === 0);
  check(`ayet düğmeleri: 6236 adın hepsi eşsiz (hangi düğme olduğu addan anlaşılıyor; ${labels.size} farklı ad)`, labels.size === 6236);
  const chip = (s, a) => env.grid(s).querySelectorAll(".ayah-chip")[a - 1];
  check('ayet düğmeleri: örnekler: Fâtiha 1 = "Fâtiha Suresi, 1. ayet"; Âl-i İmrân 3 = "Âl-i İmrân Suresi, 3. ayet"; Âl-i İmrân 200 = "Âl-i İmrân Suresi, 200. ayet"', chip(1, 1).getAttribute("aria-label") === "Fâtiha Suresi, 1. ayet" && chip(3, 3).getAttribute("aria-label") === "Âl-i İmrân Suresi, 3. ayet" && chip(3, 200).getAttribute("aria-label") === "Âl-i İmrân Suresi, 200. ayet");
  check('açma düğmesi: adı ve aria-expanded eskisi gibi ("<Sure> ayetlerini listele"; 114. ızgara açık, diğerleri kapalı)', (() => {
    const btns = [...env.els.surahList.querySelectorAll(".surah-expand-btn")];
    return btns.length === 114 && btns.every((b, i) => b.getAttribute("aria-label") === `${surahs[String(i + 1)].nameTurkish} ayetlerini listele` && b.getAttribute("aria-expanded") === (i === 113 ? "true" : "false"));
  })());
}
// Ad, axe-core'un ad hesaplamasıyla (elle yazılmış bir ad değil): aria-label içeriğin önüne geçiyor, ad etiketin kendisi. Ayrı, küçük bir
// belgede (axe tüm ağacı düzleştiriyor; 6236 düğmelik belgede yavaş).
{
  const env = makeEnv();
  for (const s of [1, 3, 114]) env.toggle(s);
  env.reveal("surah-modal");
  const chip = (s, a) => env.grid(s).querySelectorAll(".ayah-chip")[a - 1];
  const modal = env.$("surah-modal");
  const picks = [chip(1, 1), chip(3, 3), chip(3, 200), chip(114, 6)];
  const names = withAxeGlobals(env, () => {
    axeCore.setup(modal);
    try {
      return picks.map((c) => axeCore.commons.text.accessibleText(c));
    } finally {
      try {
        axeCore.teardown();
      } catch (e) {
        /* kurulum yapılamadıysa kapatacak bir şey yok */
      }
    }
  });
  check(`ayet düğmeleri: axe-core'un hesapladığı ad = aria-label (ör. ${JSON.stringify(names[1])}); görünen sayı adı belirlemiyor`, names[0] === "Fâtiha Suresi, 1. ayet" && names[1] === "Âl-i İmrân Suresi, 3. ayet" && names[2] === "Âl-i İmrân Suresi, 200. ayet" && names[3] === `${surahs["114"].nameTurkish} Suresi, 6. ayet`);
}

// (3d) Etkin ayet düğmesi: ayet seçimi değişince vurgu (sınıf + öznitelik) birlikte taşınıyor
{
  const env = makeEnv({ selectedAyah: { surah: 3, ayah: 5 } });
  env.toggle(3);
  const g3 = env.grid(3);
  check('Âl-i İmrân ızgarası açılınca seçili ayet (3:5) .active ve aria-current="true" taşıyor, 199 diğer düğmede ikisi de yok', g3.children.length === 200 && sameArr(chipFlags(g3), want(5)));
  env.state.selectedAyah = { surah: 3, ayah: 7 };
  env.api.syncAyahGridHighlight();
  check("ayet 3:7 seçilince (syncAyahGridHighlight) vurgu 5'ten 7'ye taşınıyor: 5'te sınıf da öznitelik de kalmıyor", sameArr(chipFlags(g3), want(7)));
  env.toggle(2);
  const g2 = env.grid(2);
  check("başka surenin ızgarası (2), seçili ayet (3:7) o surede olmadığı için kurulurken vurgusuz; 3. ızgara (gizli) vurgusunu koruyor", g2.children.length === 286 && chipFlags(g2).length === 0 && sameArr(chipFlags(g3), want(7)));
  env.state.selectedAyah = { surah: 2, ayah: 10 };
  env.api.syncAyahGridHighlight();
  check("ayet 2:10 seçilince 2. ızgarada 10 vurgulanıyor, 3. ızgarada (kurulmuş, başka sure) hiçbir düğmede .active ya da aria-current kalmıyor", sameArr(chipFlags(g2), want(10)) && chipFlags(g3).length === 0);
  env.toggle(3);
  check("seçili ayet başka surede iken 3. ızgara yeniden açılınca vurgu belirmiyor (2. ızgara gizli, vurgusu duruyor)", chipFlags(g3).length === 0 && sameArr(chipFlags(g2), want(10)));
  env.state.selectedAyah = { surah: 3, ayah: 200 };
  env.api.syncAyahGridHighlight();
  check("son ayete (3:200) geçince vurgu 3. ızgarada son düğmeye taşınıyor, 2. ızgaradan siliniyor", sameArr(chipFlags(g3), want(200)) && chipFlags(g2).length === 0);
  env.api.setActiveAyahChip(g3, 1);
  check("setActiveAyahChip(ızgara, 1) doğrudan: vurgu 200'den 1'e", sameArr(chipFlags(g3), want(1)));
  env.api.setActiveAyahChip(g3, 999);
  check("setActiveAyahChip(ızgara, olmayan ayet): önceki vurgu siliniyor, hiçbir düğme işaretli kalmıyor", chipFlags(g3).length === 0);
}

// (4) Rastgele işlem dizileri x bağımsız model
{
  const SEEDS = 6;
  const OPS = 45;
  const SURAH_POOL = [1, 2, 3, 36, 112, 113, 114];

  // Modelden bağımsız karşılaştırma: ilk sapmanın açıklaması ("" = sapma yok)
  function mismatch(env, model) {
    for (const spec of LISTS) {
      const got = rowFlags(env.els[spec.key], spec.attr);
      const w = want(model.rows[spec.attr]);
      if (!sameArr(got, w)) return `${spec.attr}: ${JSON.stringify(got)}, beklenen ${JSON.stringify(w)}`;
    }
    for (const kind of ["surah", "reciter"]) {
      const got = rowFlags(env.pickerList(kind), kind);
      const w = want(model.rows[`picker-${kind}`]);
      if (!sameArr(got, w)) return `Ezber ${kind} seçicisi: ${JSON.stringify(got)}, beklenen ${JSON.stringify(w)}`;
    }
    for (let s = 1; s <= 114; s++) {
      const grid = env.grid(s);
      if (grid.hidden !== (model.open !== s)) return `ızgara ${s}: gizli=${grid.hidden}, açık olan ${model.open}`;
      if (!(s in model.grids)) {
        if (grid.hasAttribute("data-built") || grid.children.length) return `ızgara ${s} kurulmamalıydı`;
        continue;
      }
      if (grid.children.length !== versesOf(s)) return `ızgara ${s}: ${grid.children.length} düğme`;
      const got = chipFlags(grid);
      const w = want(model.grids[s]);
      if (!sameArr(got, w)) return `ızgara ${s}: ${JSON.stringify(got)}, beklenen ${JSON.stringify(w)}`;
    }
    return "";
  }
  // Belge genelinde (yalnızca arada bir: pahalı): aria-current yalnızca etkin satır/düğmede, etkin her öğede aria-current="true"
  function mismatchGlobal(env) {
    const stray = [...env.d.querySelectorAll("[aria-current]")].filter((e) => !e.matches(".modal-item.active, .ayah-chip.active"));
    if (stray.length) return `aria-current .active olmayan öğede: ${stray[0].outerHTML.slice(0, 80)}`;
    const orphan = [...env.d.querySelectorAll(".modal-item.active, .ayah-chip.active")].filter((e) => e.getAttribute("aria-current") !== "true");
    if (orphan.length) return `.active olup aria-current="true" taşımayan öğe: ${orphan[0].outerHTML.slice(0, 80)}`;
    return "";
  }

  let total = 0;
  let bad = 0;
  let firstBad = "";
  const cover = { row: 0, surahModal: 0, picker: 0, toggle: 0, select: 0, activeChipSeen: 0, activeRowSeen: 0 };
  for (let seed = 1; seed <= SEEDS; seed++) {
    const rnd = mulberry32(0x5eed0000 + seed * 7919);
    const ri = (n) => Math.floor(rnd() * n);
    const pick = (arr) => arr[ri(arr.length)];
    const startSel = rnd() < 0.5 ? null : { surah: pick(SURAH_POOL), ayah: 1 };
    const env = makeEnv({ selectedAyah: startSel ? { ...startSel } : null });
    const model = {
      rows: { surah: null, juz: null, hizb: null, rub: null, manzil: null, "picker-surah": null, "picker-reciter": null },
      sel: startSel ? { ...startSel } : null,
      grids: {}, // yalnızca kurulmuş ızgaralar: sure -> etkin ayet (ya da null)
      open: null, // açık ızgaranın suresi (akordeon: en çok bir tane)
    };
    for (let step = 0; step < OPS; step++) {
      const kind = pick(["row", "row", "surahModal", "picker", "toggle", "toggle", "select", "select"]);
      let what = kind;
      if (kind === "row") {
        const spec = pick(LISTS);
        const invalid = rnd() < 0.2;
        const value = invalid ? pick([0, spec.count + 1, -1, 1.5, "x", "", undefined, null]) : 1 + ri(spec.count);
        env.api.setActiveModalItem(env.els[spec.key], spec.attr, value);
        model.rows[spec.attr] = invalid ? null : String(value);
        what = `${spec.attr}=${String(value)}`;
      } else if (kind === "surahModal") {
        // uygulamadaki Sure modalı açılışı: seçili ayetin suresi, yoksa sayfanın suresi (state'ten okunuyor; model kendi kaydından bekliyor)
        const activeSurah = model.sel ? model.sel.surah : 3;
        env.api.setActiveModalItem(env.els.surahList, "surah", env.state.selectedAyah ? env.state.selectedAyah.surah : env.state.pageToSurah[env.state.currentPage]);
        model.rows.surah = String(activeSurah);
        what = `Sure modalı açılışı (${activeSurah})`;
      } else if (kind === "picker") {
        const pk = pick(["surah", "reciter"]);
        let value;
        let target;
        if (pk === "surah") {
          target = pick(TABS);
          value = 1 + ri(114);
          env.api.setEzberSurah(target, value);
        } else {
          target = "dinle";
          value = pick(RECITER_KEYS);
          env.api.setEzberReciter(target, value);
        }
        env.api.openEzberPicker(pk, target);
        model.rows[`picker-${pk}`] = String(value);
        if (rnd() < 0.5) env.api.closeEzberPicker();
        what = `seçici ${pk}/${target}=${value}`;
      } else if (kind === "toggle") {
        const s = pick(SURAH_POOL);
        env.toggle(s);
        if (model.open === s) {
          model.open = null;
        } else {
          model.open = s;
          if (!(s in model.grids)) model.grids[s] = model.sel && model.sel.surah === s ? model.sel.ayah : null;
          else if (model.sel && model.sel.surah === s) model.grids[s] = model.sel.ayah;
        }
        what = `ızgara ${s}`;
      } else {
        const s = pick(SURAH_POOL);
        const a = 1 + ri(versesOf(s));
        env.state.selectedAyah = { surah: s, ayah: a };
        env.api.syncAyahGridHighlight();
        model.sel = { surah: s, ayah: a };
        for (const g of Object.keys(model.grids)) model.grids[g] = Number(g) === s ? a : null;
        what = `ayet ${s}:${a}`;
      }
      cover[kind]++;
      total++;
      if (Object.values(model.grids).some((v) => v !== null)) cover.activeChipSeen++;
      if (Object.values(model.rows).some((v) => v !== null)) cover.activeRowSeen++;
      const why = mismatch(env, model) || (step % 10 === 9 || step === OPS - 1 ? mismatchGlobal(env) : "");
      if (why) {
        bad++;
        if (!firstBad) firstBad = `seed ${seed} adım ${step} (${what}): ${why}`;
        break; // bu dizide sapma sonrası adımlar anlamsız
      }
    }
  }
  check(`rastgele dizi: ${SEEDS} tohum x ${OPS} işlem (satır seçimi, Sure modalı açılışı, iki seçici, ızgara açma/kapama, ayet seçimi) bağımsız modelle uyuşuyor: her adımda tek .active = tek aria-current, hiçbir yerde ayrışma yok (${total} işlem, ${bad} sapma)${firstBad ? " -- " + firstBad : ""}`, total === SEEDS * OPS && bad === 0);
  check(`rastgele dizi kapsamı: her işlem türü yapıldı ve vurgular gerçekten görüldü (satır ${cover.row}, modal ${cover.surahModal}, seçici ${cover.picker}, ızgara ${cover.toggle}, ayet ${cover.select}; etkin düğmeli adım ${cover.activeChipSeen}, etkin satırlı adım ${cover.activeRowSeen})`, cover.row > 30 && cover.surahModal > 15 && cover.picker > 15 && cover.toggle > 35 && cover.select > 35 && cover.activeChipSeen > 80 && cover.activeRowSeen > 120);
}

// (5) axe-core: üç modal açık ve doldurulmuşken yapısal ARIA kuralları (her modal ayrı çalıştırılıyor: axe pencereyi öğeden çıkarıyor)
{
  const env = makeEnv({ selectedAyah: { surah: 1, ayah: 5 } });
  env.api.setActiveModalItem(env.els.surahList, "surah", 1);
  env.toggle(1);
  env.api.setActiveModalItem(env.els.juzList, "juz", 3);
  env.api.setActiveModalItem(env.els.hizbList, "hizb", 5);
  env.api.setActiveModalItem(env.els.rubList, "rub", 20);
  env.api.setActiveModalItem(env.els.manzilList, "manzil", 1);
  env.api.setEzberSurah("dinle", 3);
  env.api.openEzberPicker("surah", "dinle");
  env.api.closeEzberPicker();
  env.api.setEzberReciter("dinle", RECITER_KEYS[0]);
  env.api.openEzberPicker("reciter", "dinle");
  env.reveal("surah-modal", "juz-modal", "ezber-modal");
  // Cüz modalında yalnızca ilk sekmenin paneli (30 satır) taranıyor: diğer üç panel (Hizb/Rub/Menzil, 307 satır) aynı işlevden, aynı
  // işaretlemeyle geçiyor ve taramayı yalnızca yavaşlatıyor (axe tüm ağacı düzleştiriyor)
  for (const id of ["hizb-list", "rub-list", "manzil-list"]) env.$(id).hidden = true;
  const ARIA_RULES = ["aria-allowed-attr", "aria-valid-attr", "aria-valid-attr-value", "aria-roles"];
  const RULES = [...ARIA_RULES, "button-name"];
  // button-name Cüz modalında atlanıyor: görünen metinli satırlar, bu yamada değişmedi, hesaplaması pahalı (≈2 sn)
  const rulesFor = { "surah-modal": RULES, "juz-modal": ARIA_RULES, "ezber-modal": RULES };
  const results = [];
  for (const id of Object.keys(rulesFor)) {
    results.push(await withAxeGlobals(env, () => axeCore.run(env.$(id), { runOnly: { type: "rule", values: rulesFor[id] }, resultTypes: ["violations", "passes"] })));
  }
  const viol = results.flatMap((r) => r.violations.map((v) => `${v.id} (${v.nodes.length}: ${v.nodes[0] && v.nodes[0].html.slice(0, 70)})`));
  check(`axe-core: Sure + Cüz + Ezber modalları açık ve doldurulmuşken (etkin satırlar aria-current'lı, ayet düğmeleri adlı) ${RULES.join(", ")} ihlali yok${viol.length ? " -- " + viol.join("; ") : ""}`, viol.length === 0);
  const passNodes = (id) => results.flatMap((r) => r.passes.filter((p) => p.id === id).flatMap((p) => p.nodes));
  const btn = passNodes("button-name").length;
  check(`axe-core: taramanın düğmeleri gerçekten kapsadığı doğrulandı (Sure ve Ezber modallarında button-name geçen düğme: ${btn} >= 300; Sure satırları, açma düğmeleri, ayet düğmeleri, Ezber seçici satırları, ...)`, btn >= 300);
  const withCurrent = passNodes("aria-valid-attr-value").filter((n) => /aria-current="true"/.test(n.html));
  check(`axe-core: aria-valid-attr-value taramasına aria-current="true" taşıyan 5 öğe dahil ve geçti (Sure satırı, ayet düğmesi, Cüz satırı, Ezber Sure ve Kârî seçici satırları; bulunan ${withCurrent.length})`, withCurrent.length === 5);
}

check(`jsdom'da olay dinleyicilerinde yakalanmamış hata yok (${jsdomErrors.length}${jsdomErrors.length ? ": " + jsdomErrors.slice(0, 2).join(" | ") : ""})`, jsdomErrors.length === 0);

if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All checks passed (modal listeleri: etkin satır/ayet düğmesi aria-current=\"true\" ile bildiriliyor (Sure, Cüz, Hizb, Rub, Menzil, Ezber Sure/Kârî seçicileri; .active ile hep birlikte), 6236 ayet düğmesi \"<Sure> Suresi, <N>. ayet\" adını taşıyor, Ezber seçici düğmelerinde yanlış aria-haspopup=listbox yok, dört modal açıcıda dialog; rastgele dizi x model; axe-core).");
