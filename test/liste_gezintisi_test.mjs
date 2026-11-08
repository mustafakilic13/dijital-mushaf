// Modal listelerinde ok tuşu gezintisi ve tek Tab durağı (roving tabindex): js/liste-gezintisi.js ve app.js'teki kablolama.
// Regresyon kontrolü.
//
// Neden var: Sure, Cüz/Hizb/Rub/Menzil ve Ezber'in Sure/Kârî seçicilerinin her satırı ayrı bir Tab durağıydı ve ok tuşları hiçbir
// şey yapmıyordu. Gerçek Chromium'da (430x900, sayfa 50: Sure 3 etkin, yalnızca klavye), düzeltmeden ÖNCE ölçülen:
//   - Sure modalında 229 Tab durağı (Kapat + 114 sure düğmesi + 114 "ayetlerini listele" düğmesi); Kapat'tan sonraki ilk Tab
//     etkin satıra değil 1. satıra gidiyor; 36. sureye 72, 114. sureye 228 Tab;
//   - Cüz modalında sekmeden son satıra: Cüz 30, Hizb 60, Rub 240, Menzil 7 Tab;
//   - Ezber Sure seçicisinde 36. sureye 37, 114. sureye 115 Tab; Kârî seçicisi açıkken modalda 5 Tab durağı;
//   - Yukarı, Aşağı, Home, End, PageUp, PageDown, Sol, Sağ: her listede odak yerinden oynamıyor (Sure, Rub, iki seçici).
//
// Düzeltme: js/liste-gezintisi.js (yeni) bir listenin TEK Tab durağını koyuyor (etkin satır, yoksa ilk hücre; sonra odaklanan hücre)
// ve Yukarı/Aşağı/Home/End/PageUp/PageDown ile satırlar arasında, Sure listesinde Sağ/Sol ile bir satırın iki hücresi (sure düğmesi,
// "ayetlerini listele") arasında gezdiriyor. app.js: setActiveModalItem durağı etkin satıra koyuyor (syncListStop); setupModals
// (Sure, Cüz, Hizb, Rub, Menzil) ve setupEzberModal (iki seçici) listeleri kaydediyor; sw.js yeni dosyayı önbelleğe alıyor.
//
// Burada kontrol edilenler:
//   (1) kaynak: modülün dışa aktardıkları, PAGE_STEP, app.js'in import'u ve her kayıt (hangi liste, hangi hücre/satır seçicisi),
//       setActiveModalItem'in syncListStop çağırması, tabIndex'i yazan tek yer (modül), sw.js ön yüklemesi;
//   (2) targetCell (saf): tablo + küçük matrislerde tüm (matris, konum, tuş) birleşimleri + 600 rastgele durum x bağımsız model;
//       geçersiz girdi, işlenmeyen tuş, değişmezlik (dondurulmuş dizi);
//   (3) davranış, GERÇEK setupModals/setupEzberModal/openModal/closeModal/populate*/setActiveModalItem/toggleAyahGrid x GERÇEK
//       modal-odak.js x GERÇEK index.html x GERÇEK data/*.json, jsdom'da:
//         Sure modalı: açılışta Tab durakları (Kapat + etkin satır), tek tabindex="0", Tab turu, tuş tablosu (Aşağı/Yukarı/PageDown/
//         PageUp/Home/End/Sağ/Sol, uçlarda durma), işlenmeyen ve değiştiricili tuşlar, başka işleyicinin tükettiği olay, ayet düğmesinden
//         gelen olay, Enter/tıklama odaktaki satırı seçiyor, yeniden açılışta durak etkin satıra dönüyor, ayet ızgarası açıkken Tab sırası
//         (liste durağı + ızgaranın tek durağı) ve ızgara düğmelerinden gelen tuşların liste gezintisine karışmaması;
//         Cüz modalı: dört sekmede durak etkin satır, tuşlar, Sol/Sağ yok sayılıyor, sekme çubuğu + liste Tab sırası;
//         Ezber: Sure ve Kârî seçicileri (Geri + tek durak + alt bilgi), tuşlar, seçim ve odağın açan düğmeye dönmesi;
//         syncListStop kenar durumları (etkin satır yok, kayıtsız liste, boş liste), dispose;
//   (4) 8 tohum x 70 işlemlik rastgele dizi (tuş, odaklama, etkin satırı değiştirme, ızgara açma, ayet düğmesinde tuş) x bağımsız model:
//       yedi listenin hepsinde her adımdan sonra tabindex, odak, aria-current/.active ve tuşun engellenip engellenmediği modelle birebir;
//       açık ızgarada tek tabindex="0" (odaklanan düğme) ve ızgara düğmesindeki tuşun (jsdom'da yerleşim yok: tüm düğmeler tek görsel
//       satır) ızgara gezintisince işlenip liste gezintisine ve listenin durağına karışmaması.
//
// SINIR: jsdom'da düzen ve gerçek Tab yok: Tab, modal-odak.js'in dönüş mantığı (GERÇEK) + DOM sırasında bir sonraki durak (taklit) ile
// yürütülüyor; kaydırma (odaklanan satırın görünür alana gelmesi), odak halkası ve ekran okuyucu davranışı burada DOĞRULANAMIYOR (gerçek
// Chromium'da ölçüldü, README'de var; NVDA/JAWS/VoiceOver/TalkBack ile DENENMEDİ, kontrol listesi madde 26). Ayet düğmeleri ızgarası
// (.ayah-chip) bu gezintiye girmiyor: kendi tek Tab durağı ve iki boyutlu gezintisi ayrı (js/izgara-gezintisi.js,
// test/izgara_gezintisi_test.mjs); burada yalnızca iki gezintinin birbirine karışmadığı sınanıyor. Firefox ve Safari'de denenmedi.
//
//   node liste_gezintisi_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM, VirtualConsole } from "jsdom";
import { PAGE_STEP, targetCell, setupListNav, syncListStop, listRows } from "../js/liste-gezintisi.js";
import * as listeModulu from "../js/liste-gezintisi.js";
import { setupGridNav, syncGridStop } from "../js/izgara-gezintisi.js";
import { createModalFocus, tabbablesIn } from "../js/modal-odak.js";
import { setupTablist } from "../js/sekme-gezintisi.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const readJSON = (...p) => JSON.parse(readText(...p));
const html = readText("index.html");
const appSource = readText("js", "app.js");
const moduleSource = readText("js", "liste-gezintisi.js");
const swSource = readText("sw.js");
const strip = (s) => s.replace(/^\s*\/\/.*$/gm, ""); // tam satır yorumları olmadan (yorumlardaki örnek kod sayımı bozmasın)
const appCode = strip(appSource);
const moduleCode = strip(moduleSource);
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
// Çok sayıda küçük denetimi tek check'te toplar: ilk birkaç sapma iletiye yazılır.
function checkAll(name, bad) {
  check(`${name}${bad.length ? ` -- ${bad.length} sapma: ${bad.slice(0, 4).join(" | ")}` : ""}`, bad.length === 0);
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
const constLine = (name) => {
  const m = new RegExp(`^const ${name} = [^\\n]*;$`, "m").exec(appSource);
  return m ? m[0] : null;
};

// -- Kaynak parçaları ----------------------------------------------------------------------------------------------
const BLOCK = /\/\/ <ezber-picker>([\s\S]*?)\/\/ <\/ezber-picker>/.exec(appSource);
const MODAL_START = appSource.indexOf("const modalFocus = createModalFocus(");
const MODAL_END = appSource.indexOf("function setupModals()");
const ELS_SRC = constObjSource("els");
const RECITERS_SRC = constObjSource("RECITERS");
const CONSTS = ["JUZ_TABS", "EZBER_TABS", "EZBER_SETTINGS_KEY"].map(constLine);
const FN = {};
for (const n of ["surahLabel", "populateSurahList", "toggleAyahGrid", "closeAllAyahGrids", "setActiveAyahChip", "syncAyahGridHighlight", "populateUnitList", "populateJuzList", "switchJuzTab", "switchEzberTab", "setActiveModalItem", "readEzberRange", "loadEzberSettings", "saveEzberSettings", "setupModals", "setupEzberModal"]) FN[n] = fnSource(n);
const extracted = !!BLOCK && MODAL_START > 0 && MODAL_END > MODAL_START && !!ELS_SRC && !!RECITERS_SRC && CONSTS.every(Boolean) && Object.values(FN).every(Boolean);
check("app.js: els, RECITERS, üç sabit (JUZ_TABS, EZBER_TABS, EZBER_SETTINGS_KEY), modal odak bloğu, <ezber-picker> bloğu ve 16 işlev kaynaktan çıkarıldı", extracted);
if (!extracted) {
  console.error("app.js'ten gerekli kaynak parçaları çıkarılamadı");
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
const CODE = Object.fromEntries(Object.entries(FN).map(([k, v]) => [k, strip(v)]));
const RECITER_KEYS = Object.keys(new Function(`${RECITERS_SRC}\nreturn RECITERS;`)());

// -- (1) Kaynak ----------------------------------------------------------------------------------------------------
check("liste-gezintisi.js: PAGE_STEP, targetCell, listRows, setupListNav, syncListStop dışa aktarılıyor (başka dışa aktarım yok)", Object.keys(listeModulu).sort().join() === "PAGE_STEP,listRows,setupListNav,syncListStop,targetCell" && typeof targetCell === "function" && typeof listRows === "function" && typeof setupListNav === "function" && typeof syncListStop === "function");
check("liste-gezintisi.js: PAGE_STEP 10 (PageUp/PageDown yaklaşık bir ekran: Sure modalı 430x900'de ≈ 9,4 satır gösteriyor)", PAGE_STEP === 10);
check('app.js: setupListNav, syncListStop, listRows "./liste-gezintisi.js"ten import ediliyor', /import \{ setupListNav, syncListStop, listRows \} from "\.\/liste-gezintisi\.js";/.test(appSource));
check("app.js: setActiveModalItem, satırları işaretledikten sonra syncListStop(listEl) çağırıyor (durak etkin satıra; liste her açılışta o satırdan başlar)", /\}\);\s*syncListStop\(listEl\);/.test(CODE.setActiveModalItem) && (appCode.match(/syncListStop\(/g) || []).length === 1);
check('app.js: setupModals Sure listesini kaydediyor: satır .surah-row, hücreler ".modal-item, .surah-expand-btn" (ayet düğmeleri hariç)', /setupListNav\(els\.surahList, listRows\(els\.surahList, "\.modal-item, \.surah-expand-btn", "\.surah-row"\)\);/.test(CODE.setupModals));
check("app.js: setupModals Cüz, Hizb, Rub ve Menzil listelerini tek hücreli satırlar (.modal-item) olarak kaydediyor", /for \(const listEl of \[els\.juzList, els\.hizbList, els\.rubList, els\.manzilList\]\) setupListNav\(listEl, listRows\(listEl, "\.modal-item"\)\);/.test(CODE.setupModals));
check("app.js: setupEzberModal iki seçici listesini (surah, reciter) tek hücreli satırlar olarak kaydediyor", /for \(const kind of \["surah", "reciter"\]\) \{[\s\S]*?const pickerList = document\.getElementById\(`ezber-\$\{kind\}-picker-list`\);\s*setupListNav\(pickerList, listRows\(pickerList, "\.modal-item"\)\);/.test(CODE.setupEzberModal));
check("app.js: setupListNav tam 3 çağrı satırında: Sure listesi, Cüz/Hizb/Rub/Menzil döngüsü, iki Ezber seçicisi döngüsü (toplam 7 liste; kayıtsız kalan modal listesi yok)", (appCode.match(/setupListNav\(/g) || []).length === 3);
{
  const writers = (appCode.match(/\.tabIndex\s*=/g) || []).length;
  check(`app.js: tabIndex yazan 3 yer var ve üçü de liste dışı: iki sekme düğmesi (switchJuzTab, switchEzberTab: tabBtn) ve bir panelin programatik odağı (focusWordMealPanel: panelEl, -1); liste hücrelerinin tabindex'ini YALNIZCA modül yazıyor (bulunan: ${writers})`, writers === 3 && (appCode.match(/\b(tabBtn|panelEl)\.tabIndex\s*=/g) || []).length === 3);
  const mod = (moduleCode.match(/\.tabIndex\s*=/g) || []).length;
  check(`liste-gezintisi.js: tabIndex'i yazan tek yer setStop (bulunan: ${mod}); değer yalnızca 0 ve -1 (olumlu tabindex yok)`, mod === 1 && /cell\.tabIndex = cell === stop \? 0 : -1;/.test(moduleCode));
}
check("sw.js: PRECACHE_URLS js/liste-gezintisi.js'i içeriyor (çevrimdışı açılışta modül eksik kalırsa app.js hiç başlamaz)", /^ {2}"js\/liste-gezintisi\.js",$/m.test(swSource));

// -- (2) targetCell (saf) -------------------------------------------------------------------------------------------
const same = (a, b) => (a === null || b === null ? a === b : a.row === b.row && a.col === b.col);
const showCell = (c) => (c === null ? "null" : `(${c.row},${c.col})`);

// Bağımsız model: PageUp/PageDown 10 adım Yukarı/Aşağı (döngüyle), sütun hedef satırda kırpılıyor.
function modelCell(key, row, col, lens) {
  const R = lens.length;
  let r = row;
  const down = () => {
    if (r < R - 1) r++;
  };
  const up = () => {
    if (r > 0) r--;
  };
  if (key === "ArrowDown") down();
  else if (key === "ArrowUp") up();
  else if (key === "PageDown") for (let i = 0; i < 10; i++) down();
  else if (key === "PageUp") for (let i = 0; i < 10; i++) up();
  else if (key === "Home") r = 0;
  else if (key === "End") r = R - 1;
  else if (key === "ArrowRight" || key === "ArrowLeft") {
    if (lens[r] < 2) return null;
    let c = col;
    if (key === "ArrowRight" && c < lens[r] - 1) c++;
    if (key === "ArrowLeft" && c > 0) c--;
    return { row: r, col: c };
  } else return null;
  return { row: r, col: Math.min(col, lens[r] - 1) };
}

{
  const table = [
    // [matris, konum, tuş, beklenen]
    [[1, 1, 1], [0, 0], "ArrowDown", [1, 0]],
    [[1, 1, 1], [2, 0], "ArrowDown", [2, 0]], // uçta durur, dönmez
    [[1, 1, 1], [0, 0], "ArrowUp", [0, 0]],
    [[1, 1, 1], [1, 0], "ArrowUp", [0, 0]],
    [[1, 1, 1], [1, 0], "Home", [0, 0]],
    [[1, 1, 1], [0, 0], "End", [2, 0]],
    [[1, 1, 1], [1, 0], "ArrowRight", null], // tek hücreli satırda yatay gezinti yok
    [[1, 1, 1], [1, 0], "ArrowLeft", null],
    [[2, 2, 2], [0, 0], "ArrowRight", [0, 1]],
    [[2, 2, 2], [0, 1], "ArrowRight", [0, 1]], // satır sonunda durur
    [[2, 2, 2], [1, 1], "ArrowLeft", [1, 0]],
    [[2, 2, 2], [1, 0], "ArrowLeft", [1, 0]],
    [[2, 2, 2], [0, 1], "ArrowDown", [1, 1]], // sütun korunur
    [[2, 2, 2], [2, 1], "ArrowUp", [1, 1]],
    [[2, 2, 2], [1, 1], "Home", [0, 1]],
    [[2, 2, 2], [1, 1], "End", [2, 1]],
    [[2, 1, 2], [0, 1], "ArrowDown", [1, 0]], // hedef satır kısaysa son hücre
    [[2, 1, 2], [1, 0], "ArrowDown", [2, 0]],
    [[2, 1, 2], [2, 1], "ArrowUp", [1, 0]],
    [[2, 1, 2], [2, 1], "Home", [0, 1]],
    [[2, 1, 2], [1, 0], "ArrowRight", null],
    [[3], [0, 2], "ArrowRight", [0, 2]],
    [[3], [0, 1], "ArrowDown", [0, 1]],
    [[1], [0, 0], "End", [0, 0]],
    [[1], [0, 0], "PageDown", [0, 0]],
  ];
  const bad = [];
  for (const [lens, [r, c], key, want] of table) {
    const got = targetCell(key, r, c, lens);
    const w = want === null ? null : { row: want[0], col: want[1] };
    if (!same(got, w)) bad.push(`${JSON.stringify(lens)} (${r},${c}) ${key}: ${showCell(got)} != ${showCell(w)}`);
  }
  checkAll(`targetCell: ${table.length} örnek (Aşağı/Yukarı/Home/End/Sol/Sağ; sütun korunur, kısa satırda son hücre, uçlarda durur, tek hücreli satırda Sol/Sağ işlenmez)`, bad);

  const L114 = Array(114).fill(2);
  const pg = [
    ["PageDown", 0, 10],
    ["PageDown", 2, 12],
    ["PageDown", 103, 113],
    ["PageDown", 104, 113],
    ["PageDown", 113, 113],
    ["PageUp", 113, 103],
    ["PageUp", 10, 0],
    ["PageUp", 9, 0],
    ["PageUp", 0, 0],
  ];
  checkAll(`targetCell: PageUp/PageDown ${PAGE_STEP} satır atlıyor, uçlarda kırpılıyor (114 satırlık liste: ${pg.length} örnek, iki sütunda da)`, pg.flatMap(([key, from, to]) => [0, 1].map((col) => [key, from, to, col])).filter(([key, from, to, col]) => !same(targetCell(key, from, col, L114), { row: to, col })).map(([key, from, to, col]) => `${key} ${from}.${col} -> ${to}`));
}

{
  // Geçersiz girdi ve işlenmeyen tuşlar -> null
  const ok = [2, 2, 2];
  const badLens = [undefined, null, "22", {}, [], [0], [2, 0, 2], [1.5], [-1], [NaN], ["2"], [2, undefined], [Infinity]];
  const badPos = [[-1, 0], [0, -1], [3, 0], [0, 2], [1.5, 0], [0, 0.5], [NaN, 0], [0, NaN], ["1", 0], [0, "1"], [null, 0], [undefined, 0], [0, undefined], [Infinity, 0]];
  const keys = ["Tab", "Enter", " ", "Escape", "a", "A", "1", "", "arrowdown", "ArrowDown ", "Left", "Down", "PgDn", "Backspace", "Delete", "F1", "Shift", "Control", "Meta", "Alt", undefined, null, 40];
  const bad = [];
  for (const lens of badLens) if (targetCell("ArrowDown", 0, 0, lens) !== null) bad.push(`geçersiz matris ${JSON.stringify(lens)}`);
  for (const [r, c] of badPos) if (targetCell("ArrowDown", r, c, ok) !== null) bad.push(`geçersiz konum (${r},${c})`);
  for (const k of keys) if (targetCell(k, 1, 1, ok) !== null) bad.push(`işlenmeyen tuş ${JSON.stringify(k)}`);
  checkAll("targetCell: geçersiz matris (dizi değil, boş, sıfır/eksi/kesirli/NaN/sayı olmayan uzunluk), geçersiz konum (aralık dışı, kesirli, NaN, dizge, null) ve işlenmeyen tuşlar (Tab, Enter, Space, Escape, harfler, büyük/küçük harf ve boşluk farkı, sayı) null döndürüyor", bad);
  const frozen = Object.freeze([2, 1, 2]);
  let threw = false;
  try {
    for (const k of ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp", "ArrowRight", "ArrowLeft"]) targetCell(k, 1, 0, frozen);
  } catch {
    threw = true;
  }
  check("targetCell: saf işlev (dondurulmuş matrisi değiştirmeye çalışmıyor, fırlatmıyor)", !threw);
}

{
  // Küçük matrislerde TÜM birleşimler + rastgele büyük matrisler x bağımsız model
  const HANDLED = ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp", "ArrowRight", "ArrowLeft"];
  const bad = [];
  let n = 0;
  const walk = (lens, depth) => {
    if (lens.length > 0) {
      for (let r = 0; r < lens.length; r++)
        for (let c = 0; c < lens[r]; c++)
          for (const key of [...HANDLED, "Tab"]) {
            n++;
            const got = targetCell(key, r, c, lens);
            const want = modelCell(key, r, c, lens);
            if (!same(got, want)) bad.push(`${JSON.stringify(lens)} (${r},${c}) ${key}: ${showCell(got)} != ${showCell(want)}`);
          }
    }
    if (depth === 0) return;
    for (const len of [1, 2, 3]) walk([...lens, len], depth - 1);
  };
  walk([], 4);
  const rnd = mulberry32(2718);
  for (let i = 0; i < 600; i++) {
    const R = 1 + Math.floor(rnd() * 40);
    const lens = Array.from({ length: R }, () => 1 + Math.floor(rnd() * 3));
    const r = Math.floor(rnd() * R);
    const c = Math.floor(rnd() * lens[r]);
    const key = HANDLED[Math.floor(rnd() * HANDLED.length)];
    n++;
    const got = targetCell(key, r, c, lens);
    const want = modelCell(key, r, c, lens);
    if (!same(got, want)) bad.push(`${JSON.stringify(lens)} (${r},${c}) ${key}: ${showCell(got)} != ${showCell(want)}`);
  }
  checkAll(`targetCell: ${n} birleşim (uzunluğu 4 satıra kadar tüm matrisler x tüm konumlar x 9 tuş + 600 rastgele matris) bağımsız modelle (adım adım Aşağı/Yukarı) birebir`, bad);
}

// -- (3) Davranış (jsdom) -------------------------------------------------------------------------------------------
const jsdomErrors = [];
const CURRENT = { surah: 3, juz: 3, hizb: 5, rub: 20, manzil: 1 }; // Chromium ölçümündeki durum (sayfa 50)

function makeEnv({ surah = CURRENT.surah } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => jsdomErrors.push(String((e && e.detail && e.detail.message) || (e && e.message) || e).slice(0, 160)));
  const dom = new JSDOM(html, { pretendToBeVisual: true, url: "http://localhost/", virtualConsole });
  const win = dom.window;
  const d = win.document;
  win.Element.prototype.scrollIntoView = function () {};
  const els = new Function("document", `${ELS_SRC}\nreturn els;`)(d);
  const state = { surahs, surahPages, juz: unitData.juz, hizb: unitData.hizb, rub: unitData.rub, manzil: unitData.manzil, selectedAyah: null, pageToSurah: { 50: surah }, currentPage: 50, openModalEl: null, ezberStudy: null, wordMeal: { open: false }, mushaf: { pagesCount: 604 } };
  const calls = [];
  const timers = [];
  const cur = { ...CURRENT, surah };
  const code = [...CONSTS, RECITERS_SRC, FN.surahLabel, FN.populateSurahList, FN.toggleAyahGrid, FN.closeAllAyahGrids, FN.setActiveAyahChip, FN.syncAyahGridHighlight, FN.populateUnitList, FN.populateJuzList, FN.switchJuzTab, FN.switchEzberTab, FN.setActiveModalItem, FN.readEzberRange, FN.loadEzberSettings, FN.saveEzberSettings, appSource.slice(MODAL_START, MODAL_END), BLOCK[1], FN.setupModals, FN.setupEzberModal,
    "return { openModal, closeModal, closeAllModals, setupModals, setupEzberModal, toggleAyahGrid, setActiveModalItem, switchJuzTab, openEzberPicker, closeEzberPicker };"].join("\n");
  const rec = (name) => (...a) => calls.push([name, ...a]);
  const api = new Function(
    "els", "state", "document", "localStorage", "createModalFocus", "setupTablist", "setupListNav", "syncListStop", "listRows", "setupGridNav", "syncGridStop", "requestAnimationFrame", "setTimeout",
    "closeSurahInfoDetail", "resetTopicsModal", "goToAyah", "goToSurah", "goToJuzNum", "goToHizbNum", "goToRubNum", "goToManzilNum", "goToPage",
    "currentJuzNumber", "currentHizbNumber", "currentRubNumber", "currentManzilNumber", "closeWordMeal", "startEzberPlayback", "startEzberOku", "startEzberYaz", "endEzberStudy",
    code
  )(
    els, state, d, win.localStorage, createModalFocus, setupTablist, setupListNav, syncListStop, listRows, setupGridNav, syncGridStop,
    () => {}, // requestAnimationFrame: açılış animasyonu sınıfları bu testin konusu değil
    (fn) => timers.push(fn),
    () => {}, () => {}, rec("goToAyah"), rec("goToSurah"), rec("goToJuzNum"), rec("goToHizbNum"), rec("goToRubNum"), rec("goToManzilNum"), rec("goToPage"),
    () => cur.juz, () => cur.hizb, () => cur.rub, () => cur.manzil, rec("closeWordMeal"), rec("startEzberPlayback"), rec("startEzberOku"), rec("startEzberYaz"), rec("endEzberStudy")
  );
  api.setupModals();
  api.setupEzberModal();
  const $ = (id) => d.getElementById(id);
  const env = {
    d, win, els, state, api, calls, cur, $,
    flush() {
      while (timers.length) timers.shift()();
    },
    active: () => d.activeElement,
    // Odaktaki öğeden (yoksa <body>'den) bir keydown gönderir; olay engellendi mi döner.
    key(k, mods = {}) {
      const target = d.activeElement && d.activeElement !== d.body ? d.activeElement : d.body;
      const ev = new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...mods });
      target.dispatchEvent(ev);
      return ev.defaultPrevented;
    },
    // Tab: önce GERÇEK keydown (modal-odak.js uçlarda kendisi dönüyor ve engelliyor), engellenmediyse tarayıcının varsayılanı
    // (DOM sırasında bir sonraki/önceki Tab durağı) taklit ediliyor.
    tab(shift = false) {
      const modal = state.openModalEl;
      const a = d.activeElement && d.activeElement !== d.body ? d.activeElement : null;
      const from = a || modal;
      const ev = new win.KeyboardEvent("keydown", { key: "Tab", shiftKey: shift, bubbles: true, cancelable: true });
      (a || modal || d.body).dispatchEvent(ev);
      if (ev.defaultPrevented || !modal) return;
      const items = tabbablesIn(modal).filter((it) => it !== from);
      const next = shift ? [...items].reverse().find((it) => from.compareDocumentPosition(it) & 2) : items.find((it) => from.compareDocumentPosition(it) & 4);
      if (next) next.focus();
    },
    open(btnId) {
      $(btnId).click();
      env.flush();
    },
    closeEsc() {
      env.key("Escape");
      env.flush();
    },
    // modal kapalıyken (kırık bir kablolamada olabilir) boş dizi: test çöküp geri kalan denetimleri atlamasın, başarısız olsun
    tabStops: (modal = state.openModalEl) => (modal ? tabbablesIn(modal).map(desc) : []),
  };
  return env;
}

function desc(el) {
  if (!el) return "-";
  const cl = el.classList;
  if (cl.contains("modal-item")) return `satır:${el.dataset.surah ?? el.dataset.juz ?? el.dataset.hizb ?? el.dataset.rub ?? el.dataset.manzil ?? el.dataset.reciter}`;
  if (cl.contains("surah-expand-btn")) return `aç:${el.dataset.surah}`;
  if (cl.contains("ayah-chip")) return `ayet:${el.dataset.surah}:${el.dataset.ayah}`;
  if (cl.contains("modal-close")) return "kapat";
  if (cl.contains("tab-bar-btn")) return `sekme:${el.dataset.tab}`;
  if (cl.contains("ezber-picker-back")) return "geri";
  if (cl.contains("ezber-modal-footer-link")) return "altbilgi";
  return el.id || el.tagName.toLowerCase();
}

// Bir listenin hücre matrisi, modülden BAĞIMSIZ (modülün listRows'una güvenmeden): Sure'de .surah-row'un iki çocuğu, öteki listelerde çocuklar.
function matrixOf(listEl) {
  const rows = [...listEl.querySelectorAll(".surah-row")];
  return rows.length ? rows.map((r) => [...r.children]) : [...listEl.children].map((b) => [b]);
}
const tabindexes = (listEl) => matrixOf(listEl).flat().map((c) => c.getAttribute("tabindex"));
// tabindex="0" olan hücreler (listenin Tab durakları) ve tüm hücrelerin tabindex'inin 0/-1 olduğu
function stopsOfList(listEl) {
  const cells = matrixOf(listEl).flat();
  const zero = cells.filter((c) => c.getAttribute("tabindex") === "0");
  const rest = cells.filter((c) => c.getAttribute("tabindex") !== "0");
  return { zero, allOk: rest.every((c) => c.getAttribute("tabindex") === "-1") };
}
// Listenin tam olarak bir durağı (beklenen hücre) var mı
const singleStop = (listEl, want) => {
  const s = stopsOfList(listEl);
  return s.zero.length === 1 && s.zero[0] === want && s.allOk;
};

const sureDeger = (env) => env.els.surahList;
const HANDLED = ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp", "ArrowRight", "ArrowLeft"];

// ---- 3a. Sure modalı ----
{
  const env = makeEnv();
  const { els, $ } = env;
  const list = els.surahList;
  const rows = matrixOf(list);
  check("Sure listesi: 114 satır x 2 hücre (sure düğmesi + 'ayetlerini listele'), kayıttan hemen sonra TEK Tab durağı (ilk hücre) — modal hiç açılmadan", rows.length === 114 && rows.every((r) => r.length === 2 && r[0].classList.contains("modal-item") && r[1].classList.contains("surah-expand-btn")) && singleStop(list, rows[0][0]));

  env.open("surah-btn");
  check("Sure modalı açıldı; açılışta odak modalın kapsayıcısında", env.state.openModalEl === els.surahModal && env.active() === els.surahModal);
  check("Sure modalı: Tab durakları yalnızca Kapat ve etkin sure (3) satırı (önce 229 durak: Kapat + 228 hücre)", env.tabStops().join() === "kapat,satır:3");
  check("Sure listesi: tek tabindex=0 etkin satırın düğmesinde (3. sure), 227 hücre -1", singleStop(list, rows[2][0]));
  check("Sure listesi: etkin satır aria-current=true (durak onunla aynı satır)", rows[2][0].getAttribute("aria-current") === "true");

  env.tab();
  check("Tab (1): Kapat", desc(env.active()) === "kapat");
  env.tab();
  check("Tab (2): doğrudan etkin sure (3) satırı — listede 2 değil 114 durak yok", desc(env.active()) === "satır:3" && env.active() === rows[2][0]);
  env.tab();
  check("Tab (3): listeden çıkıp modalın başına dönüyor (Kapat): liste tek durak, son durakta Tab -> ilk (modal-odak.js)", desc(env.active()) === "kapat");
  env.tab(true);
  check("Shift+Tab: Kapat'tan modalın sonuna, yani listenin tek durağına dönüyor", desc(env.active()) === "satır:3");

  // Tuş tablosu: odak 3. sure satırında
  const step = (k, want, label = k) => {
    const before = env.active();
    const prevented = env.key(k);
    const got = desc(env.active());
    const ok = got === want && prevented === true && env.active().getAttribute("tabindex") === "0" && singleStop(list, env.active()) && env.tabStops().join() === `kapat,${want}`;
    if (!ok) console.error(`   adım ${label} (${desc(before)} ->): ${got} (beklenen ${want}), engellendi=${prevented}, tabindex=${env.active().getAttribute("tabindex")}, durak=${env.tabStops().join()}`);
    return ok;
  };
  const seq = [
    ["ArrowDown", "satır:4"], ["ArrowDown", "satır:5"], ["ArrowUp", "satır:4"],
    ["PageDown", "satır:14"], ["PageDown", "satır:24"], ["PageUp", "satır:14"], ["PageUp", "satır:4"], ["PageUp", "satır:1"], // 4-10 < 1: kırpıldı
    ["PageUp", "satır:1"], ["ArrowUp", "satır:1"], ["ArrowLeft", "satır:1"], // başta/ilk sütunda durur, yine de engellenir
    ["End", "satır:114"], ["ArrowDown", "satır:114"], ["PageDown", "satır:114"], ["ArrowRight", "aç:114"], ["ArrowRight", "aç:114"],
    ["ArrowUp", "aç:113"], ["PageUp", "aç:103"], ["Home", "aç:1"], ["End", "aç:114"], ["ArrowLeft", "satır:114"], ["Home", "satır:1"],
    ["ArrowRight", "aç:1"], ["ArrowDown", "aç:2"], ["PageDown", "aç:12"], ["ArrowLeft", "satır:12"],
  ];
  const bad = seq.map(([k, want], i) => (step(k, want, `${i + 1}:${k}`) ? null : `${i + 1}:${k}->${want}`)).filter(Boolean);
  checkAll(`Sure listesi: ${seq.length} adımlık tuş tablosu (odak, tek tabindex=0 odakta, modalın Tab durakları Kapat + odaktaki hücre, olay engellendi): Aşağı/Yukarı, PageDown/PageUp (10 satır, uçlarda kırpılıyor), Home/End, Sağ/Sol (sure düğmesi <-> açma düğmesi, sütun korunur, uçlarda duruyor)`, bad);
  check("Sure listesi: gezinti etkin satırı (aria-current) değiştirmedi: hâlâ yalnızca 3. sure", rows.flat().filter((c) => c.hasAttribute("aria-current")).map(desc).join() === "satır:3" && rows.flat().filter((c) => c.classList.contains("active")).map(desc).join() === "satır:3");
  check("Sure listesi: gezinti hiçbir sure seçmedi/modalı kapatmadı (yalnızca odak taşındı)", env.calls.length === 0 && env.state.openModalEl === els.surahModal);

  // İşlenmeyen tuşlar ve değiştiriciler: odak ve durak yerinde, olay engellenmiyor.
  // "Tab" burada yok: bu listenin tek durağı modalın SON durağı, modal-odak.js orada Tab'ı kendisi sarıyor (yukarıdaki Tab turu).
  // Listenin Tab'a dokunmadığı 3d'de, modal dışındaki bir listede sınanıyor.
  env.active().blur();
  rows[9][0].focus();
  const at = env.active();
  const badIgnored = [];
  for (const k of ["Enter", " ", "a", "1", "Backspace", "Delete", "Insert", "ContextMenu", "F2", "Shift", "Control"]) {
    if (env.key(k) || env.active() !== at || !singleStop(list, at)) badIgnored.push(`işlenmeyen ${JSON.stringify(k)}`);
  }
  for (const k of HANDLED) {
    for (const mod of ["shiftKey", "ctrlKey", "altKey", "metaKey"]) {
      if (env.key(k, { [mod]: true }) || env.active() !== at || !singleStop(list, at)) badIgnored.push(`${mod}+${k}`);
    }
  }
  checkAll(`Sure listesi: işlenmeyen tuşlar (Enter, Space, harf, rakam, Backspace, Delete, Insert, ContextMenu, F2, tek başına Shift/Control) ve değiştiricili tuşlar (Shift/Ctrl/Alt/Meta + 8 tuş = 32) YOK SAYILIYOR: olay engellenmiyor, odak ve durak yerinde (Alt+Sol = tarayıcıda geri gitmek için)`, badIgnored);

  // Başka bir işleyicinin tükettiği olay (defaultPrevented) yok sayılıyor
  const consume = (e) => e.preventDefault();
  els.surahModal.addEventListener("keydown", consume, true); // yakalama: listeden ÖNCE çalışır
  const consumed = env.key("ArrowDown");
  els.surahModal.removeEventListener("keydown", consume, true);
  check("Sure listesi: zaten engellenmiş (başka işleyicinin tükettiği) olay yok sayılıyor: odak yerinde", consumed === true && env.active() === at);
  check("Sure listesi: tüketme dinleyicisi kalkınca aynı tuş yeniden çalışıyor (önceki kontrol dinleyicinin kendi etkisi değil)", env.key("ArrowDown") === true && desc(env.active()) === "satır:11");
  check("Sure listesi: tuş basılı tutulunca (repeat) gezinti sürüyor: tekrarlanan Aşağı bir sonraki satıra gidiyor", env.key("ArrowDown", { repeat: true }) === true && desc(env.active()) === "satır:12");
  env.key("ArrowUp"); // tıklama denetimi için 11. satıra dön

  // Tıklama (Enter/Space'in varsayılanı) odaktaki satırı seçiyor
  env.active().click();
  check("Sure listesi: oklarla gelinen satırda tıklama (Enter) o sureyi seçiyor (goToSurah 11) ve modalı kapatıyor", env.calls.length === 1 && env.calls[0].join() === "goToSurah,11");
  env.flush();
  check("Sure modalı kapandı (state.openModalEl boş, gizli)", env.state.openModalEl === null && els.surahModal.hidden === true);

  // Yeniden açılış: durak, gezilen son satır değil, şu anki sure
  env.cur.surah = 7;
  env.state.pageToSurah[50] = 7;
  env.open("surah-btn");
  check("Sure modalı yeniden açıldı: Tab durakları Kapat + şu anki sure (7), gezilen son satır (11) değil", env.tabStops().join() === "kapat,satır:7" && singleStop(list, rows[6][0]));
  check("Yeniden açılış: aria-current yalnızca 7. sure", rows.flat().filter((c) => c.hasAttribute("aria-current")).map(desc).join() === "satır:7");
  // Açma düğmesine gezilmişken kapatıp açmak: durak yine satır düğmesi
  env.tab();
  env.tab();
  env.key("ArrowRight");
  check("Odak 7. sure açma düğmesinde: durak o düğme (Kapat + aç:7)", desc(env.active()) === "aç:7" && env.tabStops().join() === "kapat,aç:7" && singleStop(list, rows[6][1]));
  env.closeEsc();
  check("Escape modalı kapattı (belge düzeyindeki işleyici gezintiyle çakışmıyor)", env.state.openModalEl === null);
  env.open("surah-btn");
  check("Açma düğmesindeyken kapatıp yeniden açmak: durak yine 7. sure SATIR düğmesinde (açma düğmesinde değil)", env.tabStops().join() === "kapat,satır:7" && singleStop(list, rows[6][0]));
  env.closeEsc();

  // Ayet ızgarası: düğmeler bu listenin gezintisine girmiyor; kendi tek Tab durakları ve ok tuşu gezintileri js/izgara-gezintisi.js'te
  // (test/izgara_gezintisi_test.mjs). Burada: iki gezinti birbirine karışmıyor.
  env.state.pageToSurah[50] = 3;
  env.open("surah-btn");
  env.tab();
  env.tab(); // satır:3
  env.key("ArrowRight"); // aç:3
  env.active().click(); // ızgarayı aç
  const nChips = surahs["3"].versesCount;
  const stops = env.tabStops();
  check(`Ayet ızgarası açıkken Tab durakları: Kapat, açma düğmesi (3), ızgaranın TEK durağı (1. ayet düğmesi; ızgara DOM'da açma düğmesinden sonra); ${nChips} ayet düğmesinin ${nChips - 1}'i dışarıda, öteki 227 hücre dışarıda`, stops.join() === "kapat,aç:3,ayet:3:1");
  env.tab();
  check("Tab: açma düğmesinden ızgaranın durağına (ilk ayet düğmesi)", desc(env.active()) === "ayet:3:1");
  const chipKeys = HANDLED.map((k) => [k, env.key(k), desc(env.active())]);
  check("Ayet düğmesinde ok/Home/End/PageUp/PageDown'u ızgara gezintisi işliyor (olay engelleniyor) ve odak hep ayet düğmelerinde kalıyor: liste gezintisi karışıp satır hücrelerine ya da açma düğmelerine atlamıyor", chipKeys.every(([, prevented, at]) => prevented === true && at.startsWith("ayet:3:")));
  check("Ayet düğmelerinde gezinirken listenin durağı hâlâ açma düğmesi (3. sure): liste ayet düğmesi olaylarıyla durağını taşımıyor", singleStop(list, rows[2][1]));
  env.tab(true);
  check("Shift+Tab: ızgaranın durağından açma düğmesine (listenin durağı) geri", desc(env.active()) === "aç:3");
  env.key("ArrowDown");
  check("Açma düğmesinden Aşağı: bir sonraki sure (4) açma düğmesi, açık ızgaranın ayet düğmelerini atlıyor (ızgaraya Tab'la girilir)", desc(env.active()) === "aç:4");
  env.closeEsc();
  check("Sure modalı kapanınca ızgara da kapanıyor (closeAllAyahGrids); yeniden açılışta tek durak yine 3. sure satırı", (env.open("surah-btn"), env.tabStops().join() === "kapat,satır:3"));
  env.closeEsc();
}

// ---- 3b. Cüz modalı ----
{
  const env = makeEnv();
  const { els, $ } = env;
  const UNITS = [
    { tab: "juz", list: els.juzList, count: 30, cur: CURRENT.juz, go: "goToJuzNum" },
    { tab: "hizb", list: els.hizbList, count: 60, cur: CURRENT.hizb, go: "goToHizbNum" },
    { tab: "rub", list: els.rubList, count: 240, cur: CURRENT.rub, go: "goToRubNum" },
    { tab: "manzil", list: els.manzilList, count: 7, cur: CURRENT.manzil, go: "goToManzilNum" },
  ];
  check("Cüz, Hizb, Rub, Menzil listeleri: 30/60/240/7 tek hücreli satır, kayıttan hemen sonra TEK Tab durağı (ilk satır)", UNITS.every((u) => { const m = matrixOf(u.list); return m.length === u.count && m.every((r) => r.length === 1) && singleStop(u.list, m[0][0]); }));
  env.open("juz-btn");
  check("Cüz modalı açıldı; dört listenin durağı o listedeki şu anki satır (Cüz 3, Hizb 5, Rub 20, Menzil 1)", UNITS.every((u) => singleStop(u.list, matrixOf(u.list)[u.cur - 1][0])));
  const badU = [];
  for (const u of UNITS) {
    if (u.tab !== "juz") {
      env.$(`juz-tab-${u.tab}`).click();
      env.flush();
    }
    if (env.tabStops().join() !== `kapat,sekme:${u.tab},satır:${u.cur}`) badU.push(`${u.tab}: Tab durakları ${env.tabStops().join()}`);
    // sekmeden Tab: doğrudan şu anki satır (önceden son satıra 30/60/240/7 Tab)
    env.$(`juz-tab-${u.tab}`).focus();
    env.tab();
    if (desc(env.active()) !== `satır:${u.cur}`) badU.push(`${u.tab}: sekmeden Tab -> ${desc(env.active())}`);
    const m = matrixOf(u.list);
    const go = (k, want) => {
      const prevented = env.key(k);
      if (desc(env.active()) !== `satır:${want}` || prevented !== true || !singleStop(u.list, m[want - 1][0])) badU.push(`${u.tab}: ${k} -> ${desc(env.active())} (beklenen ${want}) engellendi=${prevented}`);
    };
    const c = u.cur;
    const clamp = (n) => Math.min(Math.max(n, 1), u.count);
    go("ArrowDown", clamp(c + 1));
    go("ArrowUp", c);
    go("PageDown", clamp(c + 10));
    go("PageUp", clamp(clamp(c + 10) - 10));
    go("End", u.count);
    go("ArrowDown", u.count);
    go("PageDown", u.count);
    go("Home", 1);
    go("ArrowUp", 1);
    go("PageUp", 1);
    for (const k of ["ArrowLeft", "ArrowRight"]) {
      const before = env.active();
      if (env.key(k) !== false || env.active() !== before) badU.push(`${u.tab}: tek hücreli satırda ${k} işlendi`);
    }
    // gezilen satırı seç
    env.key("End");
    env.active().click();
    if (env.calls[env.calls.length - 1].join() !== `${u.go},${u.count}`) badU.push(`${u.tab}: tıklama ${env.calls[env.calls.length - 1]} (beklenen ${u.go},${u.count})`);
    env.flush();
    env.open("juz-btn"); // kapandı: yeniden aç (Cüz sekmesinde açılıyor)
    if (!UNITS.every((x) => singleStop(x.list, matrixOf(x.list)[x.cur - 1][0]))) badU.push(`${u.tab}: yeniden açılışta duraklar şu anki satırlara dönmedi`);
  }
  checkAll("Cüz modalı: dört sekmede (Cüz, Hizb, Rub, Menzil) Tab durakları Kapat + seçili sekme + listenin tek durağı (şu anki satır); sekmeden bir Tab şu anki satıra; Aşağı/Yukarı/PageDown/PageUp/Home/End (10 satır, kırpılıyor); Sol/Sağ yok sayılıyor (olay engellenmiyor); oklarla gelinen satırı seçmek doğru go*Num'u çağırıyor; yeniden açılışta duraklar şu anki satırlara dönüyor", badU);

  // Sekme çubuğunda oklar sekmeyi değiştirir (patch 14), sonra Tab yeni listenin durağına
  env.$("juz-tab-juz").focus();
  env.key("ArrowRight");
  check("Sekme çubuğu: Sağ ok Hizb sekmesini seçip odaklıyor (mevcut sekme gezintisi bozulmadı)", desc(env.active()) === "sekme:hizb" && els.hizbList.hidden === false && els.juzList.hidden === true);
  env.tab();
  check("Hizb sekmesinden Tab: Hizb listesinin durağı (5. satır)", desc(env.active()) === "satır:5");
  env.closeEsc();
}

// ---- 3c. Ezber seçicileri ----
{
  const env = makeEnv();
  const { els, $, d } = env;
  const surahList = $("ezber-surah-picker-list");
  const reciterList = $("ezber-reciter-picker-list");
  check("Ezber seçici listeleri: Sure 114, Kârî satırları tek hücreli, kayıttan hemen sonra TEK Tab durağı (ilk satır)", matrixOf(surahList).length === 114 && matrixOf(reciterList).length === RECITER_KEYS.length && singleStop(surahList, matrixOf(surahList)[0][0]) && singleStop(reciterList, matrixOf(reciterList)[0][0]));
  env.open("ezber-btn");
  $("ezber-dinle-surah-btn").click();
  check("Sure seçici açıldı: odak seçicinin kapsayıcısında, Tab durakları Kapat, Geri, şu anki sure (3), alt bilgi", d.activeElement === $("ezber-surah-picker") && env.tabStops().join() === "kapat,geri,satır:3,altbilgi");
  check("Sure seçici: tek tabindex=0 şu anki sure satırında", singleStop(surahList, matrixOf(surahList)[2][0]));
  env.tab();
  env.tab();
  check("Tab, Tab: Geri, sonra doğrudan şu anki sure satırı (önceden 36. sureye 37, 114'e 115 Tab)", desc(d.activeElement) === "satır:3");
  const m = matrixOf(surahList);
  const bad = [];
  const go = (k, want) => {
    const prevented = env.key(k);
    if (desc(d.activeElement) !== `satır:${want}` || prevented !== true || !singleStop(surahList, m[want - 1][0]) || env.tabStops().join() !== `kapat,geri,satır:${want},altbilgi`) bad.push(`${k} -> ${desc(d.activeElement)} (beklenen ${want})`);
  };
  go("ArrowDown", 4);
  go("ArrowUp", 3);
  go("PageDown", 13);
  go("End", 114);
  go("PageDown", 114);
  go("Home", 1);
  go("PageUp", 1);
  go("PageDown", 11);
  const before = d.activeElement;
  if (env.key("ArrowRight") !== false || env.key("ArrowLeft") !== false || d.activeElement !== before) bad.push("tek hücreli satırda Sol/Sağ işlendi");
  checkAll("Sure seçici: Aşağı/Yukarı/PageDown/End/Home/PageUp (10 satır, kırpılıyor), Sol/Sağ yok sayılıyor; her adımda odak = tek durak, Tab durakları Kapat, Geri, odaktaki satır, alt bilgi", bad);
  d.activeElement.click(); // 11. sure
  env.flush();
  check("Oklarla gelinen satırda tıklama (Enter) o sureyi seçiyor: Sure alanı 11, seçici kapandı, odak seçiciyi açan düğmede", $("ezber-dinle-surah").value === "11" && $("ezber-surah-picker").hidden === true && d.activeElement === $("ezber-dinle-surah-btn"));
  check("Seçimden sonra Ezber formunda Tab durakları (liste durakları formu etkilemiyor): Kapat, sekme, Kârî düğmesi, ... ve Sure düğmesi var", env.tabStops().slice(0, 3).join() === "kapat,sekme:dinle,ezber-dinle-reciter-btn" && env.tabStops().includes("ezber-dinle-surah-btn"));
  $("ezber-dinle-surah-btn").click();
  check("Sure seçici yeniden açıldı: durak yeni sure (11), eski sure (3) değil", singleStop(surahList, m[10][0]) && env.tabStops().join() === "kapat,geri,satır:11,altbilgi");
  // Geri'ye basınca durak yerinde kalır, odak düğmeye döner
  $("ezber-surah-picker-back").click();
  check("Geri: seçici kapandı, odak Sure düğmesinde", $("ezber-surah-picker").hidden === true && d.activeElement === $("ezber-dinle-surah-btn"));

  // Kârî seçici
  $("ezber-dinle-reciter-btn").click();
  const rm = matrixOf(reciterList);
  check(`Kârî seçici açıldı: Tab durakları Kapat, Geri, şu anki kârî (${RECITER_KEYS[0]}), alt bilgi (${RECITER_KEYS.length} satırın tek durağı)`, env.tabStops().join() === `kapat,geri,satır:${RECITER_KEYS[0]},altbilgi` && singleStop(reciterList, rm[0][0]));
  env.tab();
  env.tab();
  const badR = [];
  const goR = (k, i) => {
    const prevented = env.key(k);
    if (desc(d.activeElement) !== `satır:${RECITER_KEYS[i]}` || prevented !== true || !singleStop(reciterList, rm[i][0])) badR.push(`${k} -> ${desc(d.activeElement)} (beklenen ${RECITER_KEYS[i]})`);
  };
  const last = RECITER_KEYS.length - 1;
  goR("End", last);
  goR("ArrowDown", last);
  goR("Home", 0);
  goR("ArrowUp", 0);
  if (last >= 1) goR("ArrowDown", 1);
  goR("PageDown", last);
  goR("PageUp", 0);
  goR("End", last);
  checkAll(`Kârî seçici (${RECITER_KEYS.length} satır): Aşağı/Yukarı/Home/End/PageUp/PageDown (uçlarda duruyor) ve tek durak odağı izliyor`, badR);
  check("Kârî seçicide gezinti Sure seçicisinin durağını etkilemedi (iki liste birbirinden bağımsız: durak hâlâ 11. sure)", singleStop(surahList, m[10][0]));
  d.activeElement.click();
  env.flush();
  check(`Kârî seçicide oklarla gelinen satırı seçmek kârîyi değiştiriyor (${RECITER_KEYS[last]}), seçici kapanıyor, odak Kârî düğmesinde`, $("ezber-dinle-reciter").value === RECITER_KEYS[last] && $("ezber-reciter-picker").hidden === true && d.activeElement === $("ezber-dinle-reciter-btn"));
  $("ezber-dinle-reciter-btn").click();
  check("Kârî seçici yeniden açıldı: durak yeni kârî satırı", singleStop(reciterList, rm[last][0]));
  env.closeEsc();
  check("Escape Ezber modalını kapattı", env.state.openModalEl === null);
}

// ---- 3d. syncListStop kenar durumları, setupListNav ayrıntıları ----
{
  const env = makeEnv();
  const { els, d, win } = env;
  const rub = els.rubList;
  const m = matrixOf(rub);
  env.api.setActiveModalItem(rub, "rub", 999);
  check("Etkin satır yok (eşleşmeyen değer): durak ilk satır, hiçbir satırda aria-current yok", singleStop(rub, m[0][0]) && !m.flat().some((c) => c.hasAttribute("aria-current")));
  env.api.setActiveModalItem(rub, "rub", 100);
  check("Etkin satır (100) verilince durak o satıra", singleStop(rub, m[99][0]));
  env.api.setActiveModalItem(rub, "rub", "x");
  check("Sonra yine eşleşmeyen değer: durak ilk satıra dönüyor (eski etkin satırda kalmıyor)", singleStop(rub, m[0][0]));
  // Şu anki öğe yalnızca aria-current="true" olan: app.js "false" yazmıyor, ama "false" şu anki DEĞİL demek (WAI-ARIA)
  m[4][0].setAttribute("aria-current", "false");
  syncListStop(rub);
  check('aria-current="false" şu anki öğe sayılmıyor: durak ilk satırda kalıyor', singleStop(rub, m[0][0]));
  m[9][0].setAttribute("aria-current", "true");
  syncListStop(rub);
  check('aria-current="false" satırının yanında "true" olan satır durak oluyor (10. satır)', singleStop(rub, m[9][0]));
  m[4][0].removeAttribute("aria-current");
  m[9][0].removeAttribute("aria-current");
  syncListStop(rub);
  check("İşaretler kalkınca durak yine ilk satır", singleStop(rub, m[0][0]));
  // listRows: seçiciler (satırdaki başka çocuklar hücre değil, satır dışındaki eşleşmeler yok sayılıyor; her çağrıda DOM'dan okunuyor)
  const lr = d.createElement("div");
  lr.innerHTML = '<div class="r"><span>x</span><button class="c" id="p1">1</button><i></i><button class="c" id="p2">2</button></div><div class="r"><button class="c" id="p3">3</button><span class="c" id="p4">4</span></div><div class="other"><button class="c" id="p5">5</button></div>';
  const idsOf = (rowsOf) => rowsOf.map((r) => r.map((c) => c.id).join("+")).join("|");
  check("listRows (satır seçicili): satırlar .r, hücreler yalnızca satırın İÇİNDEKİ .c eşleşmeleri (satırdaki başka çocuklar hücre değil, satır dışındaki .c yok sayılıyor)", idsOf(listRows(lr, ".c", ".r")()) === "p1+p2|p3+p4");
  check("listRows (satır seçicisiz): her .c tek hücreli bir satır, DOM sırasıyla", idsOf(listRows(lr, ".c")()) === "p1|p2|p3|p4|p5");
  const rowsFn = listRows(lr, ".c", ".r");
  lr.querySelector("#p1").remove();
  check("listRows: sonuç her çağrıda DOM'dan yeniden okunuyor (kaldırılan hücre bir sonraki çağrıda yok)", idsOf(rowsFn()) === "p2|p3+p4");
  const sure = els.surahList;
  const sm = matrixOf(sure);
  env.api.setActiveModalItem(sure, "surah", 0);
  check("Sure listesinde etkin satır yok: durak ilk SATIR düğmesi (ilk açma düğmesi değil)", singleStop(sure, sm[0][0]));
  env.api.setActiveModalItem(sure, "surah", 114);
  check("Sure listesinde etkin 114: durak son satırın sure düğmesi", singleStop(sure, sm[113][0]));
  // odak bir hücredeyken etkin satır değişirse odak oynamıyor, yalnızca durak taşınıyor
  sm[49][1].focus();
  check("Odak 50. açma düğmesine verilince durak o düğmeye taşındı (focusin)", singleStop(sure, sm[49][1]));
  env.api.setActiveModalItem(sure, "surah", 2);
  check("Odak bir hücredeyken etkin satır değişti: odak yerinde (50. açma düğmesi), durak etkin satıra (2) taşındı", d.activeElement === sm[49][1] && singleStop(sure, sm[1][0]) && sm[49][1].getAttribute("tabindex") === "-1");
  env.key("ArrowDown");
  check("Odak durak olmayan hücredeyken Aşağı: odak 51. açma düğmesine, durak odağa (yeni hücreye) geçti", desc(d.activeElement) === "aç:51" && singleStop(sure, sm[50][1]));

  // kayıtsız / boş / geçersiz
  let threw = false;
  try {
    syncListStop(d.createElement("div"));
    syncListStop(null);
    syncListStop(undefined);
    syncListStop({});
  } catch {
    threw = true;
  }
  check("syncListStop: kayıtsız liste, null, undefined, düz nesne -> sessizce hiçbir şey yapmıyor (fırlatmıyor)", !threw);
  const host = d.createElement("div");
  d.body.appendChild(host);
  let emptyOk = true;
  try {
    const off = setupListNav(host, () => []);
    syncListStop(host);
    const ev = new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    host.dispatchEvent(ev);
    emptyOk = ev.defaultPrevented === false;
    off();
  } catch {
    emptyOk = false;
  }
  check("Boş liste: setupListNav/syncListStop/keydown fırlatmıyor, olay engellenmiyor", emptyOk);

  // boş satırlar atlanıyor
  host.innerHTML = '<button id="a">a</button><i></i><button id="b">b</button>';
  const off2 = setupListNav(host, () => [[], [host.querySelector("#a")], [], [host.querySelector("#b")]]);
  const a = host.querySelector("#a");
  const b = host.querySelector("#b");
  check("Boş satırlar (hücresiz) yok sayılıyor: iki gerçek satırın ilki durak", a.getAttribute("tabindex") === "0" && b.getAttribute("tabindex") === "-1");
  a.focus();
  const ev = new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
  a.dispatchEvent(ev);
  check("Boş satırlar atlanarak Aşağı: a -> b (boş satırlar arada durak sayılmıyor)", d.activeElement === b && ev.defaultPrevented && b.getAttribute("tabindex") === "0" && a.getAttribute("tabindex") === "-1");
  // Tab ve öteki işlenmeyen tuşlar: modal dışındaki tek başına bir listede (modal-odak.js'in Tab sarması araya girmiyor) liste onlara dokunmuyor
  const ignoredKeys = ["Tab", "Enter", " ", "Escape", "a"].map((k) => {
    const e = new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
    b.dispatchEvent(e);
    return e.defaultPrevented;
  });
  const shiftTab = new win.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
  b.dispatchEvent(shiftTab);
  check("Tab, Shift+Tab, Enter, Space, Escape ve harf: liste tüketmiyor (olay engellenmiyor), odak ve durak yerinde (modal dışındaki tek başına liste)", ignoredKeys.every((p) => p === false) && shiftTab.defaultPrevented === false && d.activeElement === b && b.getAttribute("tabindex") === "0" && a.getAttribute("tabindex") === "-1");
  // dispose
  off2();
  a.setAttribute("aria-current", "true");
  syncListStop(host);
  const ev2 = new win.KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true });
  b.dispatchEvent(ev2);
  check("dispose: dinleyiciler kalktı (tuş yok sayılıyor, olay engellenmiyor), kayıt silindi (syncListStop hiçbir şey yapmıyor), focusin durağı taşımıyor", ev2.defaultPrevented === false && d.activeElement === b && b.getAttribute("tabindex") === "0" && a.getAttribute("tabindex") === "-1");
  a.focus();
  check("dispose sonrası odak gelince durak taşınmıyor (focusin dinleyicisi de kalktı)", a.getAttribute("tabindex") === "-1" && b.getAttribute("tabindex") === "0");
  host.remove();
}

// -- (4) Rastgele diziler x bağımsız model --------------------------------------------------------------------------
{
  const SEEDS = [11, 4207, 90210, 31337, 555, 2024, 7, 123456];
  const STEPS = 70;
  const env = makeEnv();
  const { els, $, d, win } = env;
  const LISTS = [
    { name: "sure", el: els.surahList, attr: "surah", values: Array.from({ length: 114 }, (_, i) => String(i + 1)) },
    { name: "cüz", el: els.juzList, attr: "juz", values: Array.from({ length: 30 }, (_, i) => String(i + 1)) },
    { name: "hizb", el: els.hizbList, attr: "hizb", values: Array.from({ length: 60 }, (_, i) => String(i + 1)) },
    { name: "rub", el: els.rubList, attr: "rub", values: Array.from({ length: 240 }, (_, i) => String(i + 1)) },
    { name: "menzil", el: els.manzilList, attr: "manzil", values: Array.from({ length: 7 }, (_, i) => String(i + 1)) },
    { name: "ezber-sure", el: $("ezber-surah-picker-list"), attr: "surah", values: Array.from({ length: 114 }, (_, i) => String(i + 1)) },
    { name: "ezber-kârî", el: $("ezber-reciter-picker-list"), attr: "reciter", values: [...RECITER_KEYS] },
  ];
  // tabbablesIn'in "görünür" saymasi için listelerin atalarındaki hidden kalkıyor (ayet ızgaraları ListeNİN içinde: onlara dokunulmuyor)
  for (const L of LISTS) for (let n = L.el; n && n !== d.documentElement; n = n.parentElement) n.hidden = false;
  for (const L of LISTS) {
    L.rows = matrixOf(L.el);
    L.model = { stop: { r: 0, c: 0 }, active: null, focus: null };
  }
  const invalid = ["0", "999", "-1", "1.5", "abc", "", null, undefined, "xx"];
  const MODEL_KEYS = [...HANDLED, "Tab", "Enter", " ", "a", "Escape"];
  const gridOpen = { surah: null, stop: 1 }; // stop: açık ızgaranın tek Tab durağı (ayet numarası); seçili ayet yok (state.selectedAyah null) -> açılışta 1
  let walkSteps = 0;
  const bad = [];
  let handledCount = 0;
  let setActiveCount = 0;
  let focusCount = 0;
  let chipKeyCount = 0;
  let activeSeen = 0;
  const wantStop = (L) => L.rows[L.model.stop.r][L.model.stop.c];

  function modelNav(L, key) {
    const rows = L.rows;
    const R = rows.length;
    const f = L.model.focus;
    let r = f.r;
    let c = f.c;
    const down = () => {
      if (r < R - 1) r++;
    };
    const up = () => {
      if (r > 0) r--;
    };
    if (key === "ArrowDown") down();
    else if (key === "ArrowUp") up();
    else if (key === "PageDown") for (let i = 0; i < 10; i++) down();
    else if (key === "PageUp") for (let i = 0; i < 10; i++) up();
    else if (key === "Home") r = 0;
    else if (key === "End") r = R - 1;
    else if (key === "ArrowRight" || key === "ArrowLeft") {
      if (rows[r].length < 2) return null;
      if (key === "ArrowRight" && c < rows[r].length - 1) c++;
      if (key === "ArrowLeft" && c > 0) c--;
      return { r, c };
    } else return null;
    return { r, c: Math.min(c, rows[r].length - 1) };
  }

  function verify(where, only = null) {
    const bd = (m) => bad.push(`${where}: ${m}`);
    for (const L of LISTS) {
      if (only && L !== only) continue;
      const cells = L.rows.flat();
      // tabindex
      const want = wantStop(L);
      const zero = cells.filter((c) => c.getAttribute("tabindex") === "0");
      if (zero.length !== 1 || zero[0] !== want || !cells.every((c) => c === want || c.getAttribute("tabindex") === "-1")) bd(`${L.name}: tabindex sapması (0 olan: ${zero.map(desc).join("/")}, beklenen ${desc(want)})`);
      // aria-current / .active (yalnızca satırın ilk hücresi, yalnızca model etkin)
      const cur = cells.filter((c) => c.hasAttribute("aria-current") || c.classList.contains("active"));
      const wantCur = L.model.active === null ? [] : [L.rows[L.model.active][0]];
      if (cur.length !== wantCur.length || cur.some((c, i) => c !== wantCur[i] || c.getAttribute("aria-current") !== "true" || !c.classList.contains("active"))) bd(`${L.name}: aria-current/.active sapması (${cur.map(desc).join("/")} != ${wantCur.map(desc).join("/")})`);
      if (L.model.focus && d.activeElement !== L.rows[L.model.focus.r][L.model.focus.c]) bd(`${L.name}: odak ${desc(d.activeElement)} != ${desc(L.rows[L.model.focus.r][L.model.focus.c])}`);
      // listenin kendi Tab durakları: durak (+ ızgara açıksa chip'ler)
      const tb = tabbablesIn(L.el).map(desc).join();
      const chips = L.name === "sure" && gridOpen.surah ? [`ayet:${gridOpen.surah}:${gridOpen.stop}`] : [];
      const order = [desc(want), ...chips];
      // ızgara satırın hemen altında: durak ızgaranın SONRASINDAKİ bir satırdaysa sıra chip'ler önce, durak sonra
      const gridRow = L.name === "sure" && gridOpen.surah ? gridOpen.surah - 1 : -1;
      const stopRow = L.model.stop.r;
      const expected = gridRow >= 0 && stopRow > gridRow ? [...chips, desc(want)] : order;
      if (tb !== expected.join()) bd(`${L.name}: Tab durakları ${tb.slice(0, 80)} != ${expected.join().slice(0, 80)}`);
      if (L.name === "sure" && gridOpen.surah) {
        // ızgaranın roving tabindex'i: tek tabindex="0" (modeldeki durak), ötekilerin hepsi "-1"
        const gridChips = Array.from(L.el.querySelectorAll(`.ayah-chip[data-surah="${gridOpen.surah}"]`));
        const zeroChips = gridChips.filter((c) => c.getAttribute("tabindex") === "0");
        if (zeroChips.length !== 1 || zeroChips[0].dataset.ayah !== String(gridOpen.stop) || !gridChips.every((c) => c === zeroChips[0] || c.getAttribute("tabindex") === "-1")) bd(`ızgara tabindex sapması (0 olan: ${zeroChips.map(desc).join("/")}, beklenen ayet:${gridOpen.surah}:${gridOpen.stop})`);
      }
    }
  }

  for (const seed of SEEDS) {
    const rnd = mulberry32(seed);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    for (let i = 0; i < STEPS; i++) {
      walkSteps++;
      const roll = rnd();
      const focused = LISTS.find((L) => L.model.focus);
      let label;
      let touched = null;
      if (roll < 0.45 && focused) {
        // tuş
        const L = focused;
        const key = rnd() < 0.8 ? pick(HANDLED) : pick(MODEL_KEYS);
        const mod = rnd() < 0.12 ? pick(["shiftKey", "ctrlKey", "altKey", "metaKey"]) : null;
        label = `sure-${seed}#${i} ${L.name} ${mod ? mod + "+" : ""}${key} @${desc(L.rows[L.model.focus.r][L.model.focus.c])}`;
        const to = mod ? null : modelNav(L, key);
        const prevented = env.key(key, mod ? { [mod]: true } : {});
        if (prevented !== (to !== null)) bad.push(`${label}: engellendi=${prevented} (beklenen ${to !== null})`);
        if (to !== null) {
          L.model.focus = { ...to };
          L.model.stop = { ...to };
          handledCount++;
        }
        touched = L;
      } else if (roll < 0.62 || !focused) {
        // odaklama (Tab/fare/programatik): odak ve durak o hücre
        const L = pick(LISTS);
        const r = Math.floor(rnd() * L.rows.length);
        const c = Math.floor(rnd() * L.rows[r].length);
        label = `${seed}#${i} odak ${L.name} (${r},${c})`;
        L.rows[r][c].focus();
        for (const o of LISTS) o.model.focus = null;
        L.model.focus = { r, c };
        L.model.stop = { r, c };
        focusCount++;
        touched = L;
      } else if (roll < 0.82) {
        // etkin satırı değiştirme (modal açılışı)
        const L = pick(LISTS);
        const v = rnd() < 0.75 ? pick(L.values) : pick(invalid);
        label = `${seed}#${i} etkin ${L.name} ${JSON.stringify(v)}`;
        env.api.setActiveModalItem(L.el, L.attr, v);
        const idx = L.values.indexOf(v === null || v === undefined ? String(v) : String(v));
        L.model.active = idx >= 0 ? idx : null;
        L.model.stop = { r: idx >= 0 ? idx : 0, c: 0 };
        if (idx >= 0) activeSeen++;
        setActiveCount++;
        touched = L;
      } else if (roll < 0.9) {
        // ayet ızgarasını aç/kapat (Sure listesi); kapatmadan önce odak ızgaradan alınıyor
        const L = LISTS[0];
        const s = gridOpen.surah === null || rnd() < 0.5 ? 1 + Math.floor(rnd() * 114) : gridOpen.surah;
        label = `${seed}#${i} ızgara ${s}`;
        if (d.activeElement && d.activeElement.classList && d.activeElement.classList.contains("ayah-chip")) d.activeElement.blur();
        const wrapper = L.el.querySelectorAll(".surah-row-wrapper")[s - 1];
        const grid = wrapper.querySelector(".ayah-grid");
        const btn = wrapper.querySelector(".surah-expand-btn");
        const wasOpen = !grid.hidden;
        env.api.toggleAyahGrid(s, grid, btn);
        gridOpen.surah = wasOpen ? null : s;
        if (!wasOpen) gridOpen.stop = 1; // her açılışta durak yeniden kuruluyor (syncGridStop): seçili ayet yok -> ilk düğme
        touched = L;
      } else {
        // açık ızgarada ayet düğmesine odak + tuş. İşlenen tuşu (değiştiricisiz) ızgara gezintisi işliyor: engelleniyor, odak hedef düğmeye
        // gidiyor (jsdom'da yerleşim yok: tüm düğmeler TEK görsel satır, yani Sağ/Sol +-1, Home/End uçlar, Aşağı/Yukarı/PageUp/PageDown
        // yerinde); işlenmeyen ya da değiştiricili tuşa dokunulmuyor. Listenin durağı hiçbir durumda değişmiyor.
        const L = LISTS[0];
        if (gridOpen.surah === null) {
          label = `${seed}#${i} (ızgara kapalı: atlandı)`;
        } else {
          const nChips = surahs[String(gridOpen.surah)].versesCount;
          const k = 1 + Math.floor(rnd() * nChips);
          const chip = L.el.querySelector(`.ayah-chip[data-surah="${gridOpen.surah}"][data-ayah="${k}"]`);
          chip.focus();
          for (const o of LISTS) o.model.focus = null;
          gridOpen.stop = k; // focusin: odaklanan düğme ızgaranın durağı
          const key = rnd() < 0.75 ? pick(HANDLED) : pick(["Tab", "Enter", " ", "a", "Escape"]);
          const mod = rnd() < 0.15 ? pick(["shiftKey", "ctrlKey", "altKey", "metaKey"]) : null;
          label = `${seed}#${i} ayet ${desc(chip)} ${mod ? mod + "+" : ""}${JSON.stringify(key)}`;
          const stopBefore = wantStop(L);
          const handled = !mod && HANDLED.includes(key);
          let to = k;
          if (handled) {
            if (key === "ArrowRight") to = Math.min(k + 1, nChips);
            else if (key === "ArrowLeft") to = Math.max(k - 1, 1);
            else if (key === "Home") to = 1;
            else if (key === "End") to = nChips;
          }
          const prevented = env.key(key, mod ? { [mod]: true } : {});
          chipKeyCount++;
          if (prevented !== handled) bad.push(`${label}: engellendi=${prevented} (beklenen ${handled})`);
          const wantEl = L.el.querySelector(`.ayah-chip[data-surah="${gridOpen.surah}"][data-ayah="${to}"]`);
          if (d.activeElement !== wantEl) bad.push(`${label}: odak ${desc(d.activeElement)} != ${desc(wantEl)}`);
          gridOpen.stop = to;
          if (!singleStop(L.el, stopBefore)) bad.push(`${label}: ayet düğmesi listenin durağını değiştirdi`);
        }
        touched = L;
      }
      verify(label, touched);
    }
    verify(`seed ${seed} sonu (tüm listeler)`);
  }
  checkAll(`rastgele dizi: ${SEEDS.length} tohum x ${STEPS} işlem (tuş, odaklama, etkin satır değişimi, ızgara açma/kapama, ayet düğmesinde tuş) x bağımsız model: yedi listenin hepsinde tabindex, odak, aria-current/.active, tuşun engellenmesi ve listenin Tab durakları modelle birebir (${walkSteps} adım; ${handledCount} işlenen tuş, ${focusCount} odaklama, ${setActiveCount} etkin satır değişimi, ${chipKeyCount} ayet düğmesi tuşu)`, bad);
  check(`rastgele dizi yeterince çeşitli (işlenen tuş > 100, odaklama > 40, etkin satır değişimi > 40, geçerli etkin satır > 25, ayet düğmesinde tuş > 3; bulunan ${handledCount}/${focusCount}/${setActiveCount}/${activeSeen}/${chipKeyCount})`, handledCount > 100 && focusCount > 40 && setActiveCount > 40 && activeSeen > 25 && chipKeyCount > 3);
}

check(`jsdom: olay dinleyicilerinde yakalanmamış hata yok (bulunan: ${jsdomErrors.length}${jsdomErrors.length ? " -- " + jsdomErrors.slice(0, 2).join(" | ") : ""})`, jsdomErrors.length === 0);

if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All checks passed (liste_gezintisi: ok tuşu gezintisi + tek Tab durağı -- targetCell (tablo + tüm küçük matrisler + rastgele x model), GERÇEK setupModals/setupEzberModal kablolaması x GERÇEK modal-odak.js x GERÇEK index.html/data, Sure/Cüz/Ezber seçicileri, syncListStop/dispose kenar durumları, 8 tohumlu rastgele diziler x bağımsız model).");
