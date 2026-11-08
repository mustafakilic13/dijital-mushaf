// Sure modalındaki ayet düğmeleri ızgarası (.ayah-chip): tek Tab durağı (roving tabindex) + iki boyutlu ok tuşu gezintisi:
// js/izgara-gezintisi.js ve app.js'teki kablolama. Regresyon kontrolü.
//
// Neden var: "ayetlerini listele" ile açılan ızgarada her ayet düğmesi ayrı bir Tab durağıydı ve ok tuşları hiçbir şey yapmıyordu.
// Gerçek Chromium'da (430x900, sayfa 50: Sure 3 etkin, yalnızca klavye), düzeltmeden ÖNCE ölçülen (Bakara ızgarası: 286 düğme):
//   - açma düğmesinden Tab'la ızgarayı geçmek 286 Tab (ızgaradan sonraki durak Kapat); 320 ve 1200 px'te de 286;
//   - ilk Tab, seçili ayet (2:255) olsa da 1. ayet düğmesine gidiyor;
//   - Yukarı, Aşağı, Sol, Sağ, Home, End, PageUp, PageDown: odak 2:1'den oynamıyor; liste kayıyor, End ve Home'dan sonra odaklı düğme
//     görünür alandan çıkıyor; End + Enter 286. ayeti değil 1. ayeti seçiyor.
//
// Düzeltme: js/izgara-gezintisi.js (yeni) ızgaranın TEK Tab durağını koyuyor (odaktaki düğme, yoksa seçili ayet, yoksa ilk düğme) ve
// ızgaranın GÖRSEL düzenine göre gezdiriyor: Sağ/Sol bir önceki/sonraki ayet (satır sonunda yandaki satıra geçer), Yukarı/Aşağı bir
// üst/alt görsel satırda yatay merkezi en yakın düğme, PageUp/PageDown 10 görsel satır, Home/End ilk/son ayet. app.js: syncGridStop
// çağrıları (ızgara açılışı, setActiveAyahChip, syncAyahGridHighlight) ve setupGridNav(els.surahList); sw.js yeni dosyayı önbelleğe alıyor.
//
// Burada kontrol edilenler:
//   (1) kaynak: modülün dışa aktardıkları, PAGE_ROWS, app.js'in import'u ve her çağrı yeri, tabIndex'in tek yazıcısı, sw.js ön yüklemesi,
//       modülün yerleşimi yalnızca tam sayı offset'lerden okuması (dönüşümlerden etkilenmesin);
//   (2) düzen modeli: jsdom'da yerleşim yok, bu yüzden offsetTop/offsetLeft/offsetWidth style.css'ten türetilen bir akış modeliyle
//       taklit ediliyor (boşluk, dolgu, en küçük düğme genişliği CSS dosyasından okunuyor). Model, GERÇEK Chromium'da ölçülen satır
//       uzunluklarıyla (430/320/1200 px: Bakara ve Fâtiha) doğrulanıyor: model bozulursa ya da CSS değişirse bu check kırılır;
//   (3) targetChip (saf): tablo, PageUp/PageDown, geçersiz girdi, işlenmeyen tuş, değişmezlik, küçük yerleşimlerin tüm birleşimleri ve
//       rastgele yerleşimler x bağımsız model (sıralamaya dayalı en yakın merkez);
//   (4) setupGridNav/syncGridStop yalıtılmış (sentetik DOM): hangi olaylar işleniyor/yok sayılıyor, focusin, dispose, her tuşta yeniden ölçüm;
//   (5) davranış, GERÇEK setupModals/openModal/closeModal/populateSurahList/toggleAyahGrid/setActiveAyahChip/syncAyahGridHighlight x
//       GERÇEK modal-odak.js x GERÇEK liste-gezintisi.js x GERÇEK index.html x GERÇEK data/*.json, jsdom'da: tek Tab durağı, Tab turu,
//       Bakara'da elle hesaplanmış tuş dizisi (34 px'ten 38 px'e geçen satırlar dahil), pencere genişliği değişince, Enter/tıklama,
//       değiştiricili ve işlenmeyen tuşlar, seçili ayet (ses oynarken dahil), yeniden açılış, Fâtiha tek satır;
//   (6) rastgele işlem dizisi (tuş, odaklama, genişlik, seçili ayet, ızgara açma/kapama, modal kapatıp açma) x bağımsız model.
//
// SINIR: jsdom'da düzen ve gerçek Tab yok: Tab, modal-odak.js'in dönüş mantığı (GERÇEK) + DOM sırasında bir sonraki durak (taklit) ile
// yürütülüyor; kaydırma (odaklanan düğmenin görünür alana gelmesi), odak halkası ve ekran okuyucu davranışı burada DOĞRULANAMIYOR
// (gerçek Chromium'da ölçüldü, README'de var; NVDA/JAWS/VoiceOver/TalkBack ile DENENMEDİ, kontrol listesi madde 27). Firefox ve
// Safari'de denenmedi.
//
//   node izgara_gezintisi_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM, VirtualConsole } from "jsdom";
import * as izgaraModulu from "../js/izgara-gezintisi.js";
import { PAGE_ROWS, targetChip, setupGridNav, syncGridStop } from "../js/izgara-gezintisi.js";
import { setupListNav, syncListStop, listRows } from "../js/liste-gezintisi.js";
import { createModalFocus, tabbablesIn } from "../js/modal-odak.js";
import { setupTablist } from "../js/sekme-gezintisi.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const readJSON = (...p) => JSON.parse(readText(...p));
const html = readText("index.html");
const appSource = readText("js", "app.js");
const moduleSource = readText("js", "izgara-gezintisi.js");
const swSource = readText("sw.js");
const cssSource = readText("css", "style.css");
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

// -- (1) Kaynak ----------------------------------------------------------------------------------------------------
check("izgara-gezintisi.js: PAGE_ROWS, targetChip, syncGridStop, setupGridNav dışa aktarılıyor (başka dışa aktarım yok)", Object.keys(izgaraModulu).sort().join() === "PAGE_ROWS,setupGridNav,syncGridStop,targetChip" && [targetChip, syncGridStop, setupGridNav].every((f) => typeof f === "function"));
check("izgara-gezintisi.js: PAGE_ROWS 10 (10 satır = 360 px; Sure modalının listesi 430x900'de 583, 1200x800'de 582, 320x640'ta 442 px: hiçbir ekranda bir ekrandan fazla atlamıyor)", PAGE_ROWS === 10);
check('app.js: setupGridNav, syncGridStop "./izgara-gezintisi.js"ten import ediliyor', /import \{ setupGridNav, syncGridStop \} from "\.\/izgara-gezintisi\.js";/.test(appSource));
check("app.js: setupGridNav tam bir yerde, setupModals içinde ve Sure listesine (olay devri: ızgaralar tembel kuruluyor) kaydediliyor", (appCode.match(/setupGridNav\(/g) || []).length === 1 && /setupGridNav\(els\.surahList\);/.test(CODE.setupModals));
{
  const total = (appCode.match(/syncGridStop\(/g) || []).length;
  check(`app.js: syncGridStop tam 3 çağrı yerinde (toggleAyahGrid açılışı, setActiveAyahChip, syncAyahGridHighlight'ın başka-sure dalı; bulunan ${total})`, total === 3 && [CODE.toggleAyahGrid, CODE.setActiveAyahChip, CODE.syncAyahGridHighlight].every((f) => (f.match(/syncGridStop\(gridEl\);/g) || []).length === 1));
  const t = CODE.toggleAyahGrid;
  check("app.js: toggleAyahGrid ızgarayı AÇARKEN durağı kuruyor (gizli ızgara açılıp seçili ayet işaretlendikten sonra, kapatma dalında değil)", t.indexOf("syncGridStop(gridEl);") > t.indexOf("gridEl.hidden = false;") && t.indexOf("syncGridStop(gridEl);") > t.indexOf("setActiveAyahChip(gridEl, state.selectedAyah.ayah);") && t.indexOf("syncGridStop(gridEl);") < t.indexOf("scrollIntoView"));
  check("app.js: setActiveAyahChip durağı, aria-current/.active'i yazdıktan hemen sonra (aynı yerde, aynı anda) ayarlıyor", /\}\);\s*syncGridStop\(gridEl\);\s*const active = gridEl\.querySelector\("\.ayah-chip\.active"\);/.test(CODE.setActiveAyahChip));
  check("app.js: syncAyahGridHighlight, seçili ayetin sure'sinde olmayan ızgarada .active/aria-current'ı temizledikten sonra durağı da sıfırlıyor", /\.ayah-chip\.active"\)\.forEach\(\(c\) => \{[\s\S]*?removeAttribute\("aria-current"\);\s*\}\);\s*syncGridStop\(gridEl\);\s*\}/.test(CODE.syncAyahGridHighlight));
}
{
  const writers = (moduleCode.match(/\.tabIndex\s*=/g) || []).length;
  check(`izgara-gezintisi.js: tabIndex'i yazan tek yer setStop (bulunan: ${writers}); değer yalnızca 0 ve -1 (olumlu tabindex yok)`, writers === 1 && /chip\.tabIndex = chip === stop \? 0 : -1;/.test(moduleCode));
  const listened = [...moduleCode.matchAll(/\.addEventListener\("(\w+)"/g)].map((m) => m[1]);
  check(`izgara-gezintisi.js: yalnızca iki olay dinliyor (keydown, focusin: ikisi de Sure listesinde, tek çift; bulunan ${listened.join()}) ve dönen işlev ikisini de kaldırıyor`, listened.join() === "keydown,focusin" && /listEl\.removeEventListener\("keydown", onKeydown\);\s*listEl\.removeEventListener\("focusin", onFocusin\);/.test(moduleCode));
  check("izgara-gezintisi.js: yerleşim yalnızca offsetTop/offsetLeft/offsetWidth'ten okunuyor (tam sayı, dönüşümlerden etkilenmez: modalın açılış animasyonu getBoundingClientRect'i bozardı); zamanlayıcı ve kaydırma yok", /offsetTop/.test(moduleCode) && /offsetLeft/.test(moduleCode) && /offsetWidth/.test(moduleCode) && !/getBoundingClientRect|setTimeout|requestAnimationFrame|scrollIntoView/.test(moduleCode));
}
check("sw.js: PRECACHE_URLS js/izgara-gezintisi.js'i içeriyor (çevrimdışı açılışta modül eksik kalırsa app.js hiç başlamaz)", /^ {2}"js\/izgara-gezintisi\.js",$/m.test(swSource));

// -- (2) Düzen modeli (style.css'ten) ve Chromium ile doğrulaması ------------------------------------------------------
// Parametreler CSS dosyasından okunuyor; ölçüm olarak yalnızca üç haneli numaralı düğmenin genişliği (38 px: yazı genişliği CSS'te yok)
// ve beklenen satır uzunlukları (Chromium) sabit.
const ruleOf = (selector) => {
  const m = new RegExp(`(?:^|\\n)${selector.replace(/[.]/g, "\\.")} \\{([^}]*)\\}`).exec(cssSource);
  return m ? m[1] : "";
};
const declOf = (rule, prop) => {
  const m = new RegExp(`(?:^|[\\s;])${prop}:\\s*([^;]+);`).exec(rule);
  return m ? m[1].trim() : null;
};
const px = (v) => (v && /^\d+(\.\d+)?px$/.test(v) ? parseFloat(v) : NaN);
const gridRule = ruleOf(".ayah-grid");
const chipRule = ruleOf(".ayah-chip");
const gridPad = (declOf(gridRule, "padding") || "").split(/\s+/).map(px); // üst sağ alt sol
const chipPad = (declOf(chipRule, "padding") || "").split(/\s+/);
const CSS = { gap: px(declOf(gridRule, "gap")), padTop: gridPad[0], padRight: gridPad[1], padLeft: gridPad[3], minW: px(declOf(chipRule, "min-width")), chipH: px(declOf(chipRule, "height")) };
const THREE_DIGIT_W = 38; // Chromium'da ölçüldü: 100-286. ayet düğmeleri 38 px (1-99: 34 px = min-width)
check(`style.css: .ayah-grid flex + wrap (gap ${CSS.gap}, padding ${gridPad.join(" ")}) ve .ayah-chip (min-width ${CSS.minW}, height ${CSS.chipH}, padding ${chipPad.join(" ")}) beklenen değerlerde: düzen modelinin girdisi`, /display:\s*flex;/.test(gridRule) && /flex-wrap:\s*wrap;/.test(gridRule) && CSS.gap === 6 && gridPad.length === 4 && gridPad.join() === "10,10,14,10" && CSS.minW === 34 && CSS.chipH === 30 && chipPad.join(" ") === "0 6px");

const chipWidth = (n) => (n < 100 ? CSS.minW : THREE_DIGIT_W);
// flex-wrap akışı: düğme satıra sığıyorsa (boşluk dahil) yanına, sığmıyorsa yeni satıra; satırın ilk düğmesi her zaman yerleşir.
function computeLayout(count, borderWidth) {
  const content = borderWidth - CSS.padLeft - CSS.padRight;
  const boxes = [];
  let row = 0;
  let x = 0;
  for (let n = 1; n <= count; n++) {
    const w = chipWidth(n);
    if (x > 0 && x + CSS.gap + w > content) {
      row++;
      x = 0;
    }
    if (x > 0) x += CSS.gap;
    boxes.push({ top: CSS.padTop + row * (CSS.chipH + CSS.gap), left: CSS.padLeft + x, width: w });
    x += w;
  }
  return boxes;
}
const layoutCache = {};
function layoutFor(count, borderWidth) {
  const byWidth = layoutCache[borderWidth] || (layoutCache[borderWidth] = {});
  return byWidth[count] || (byWidth[count] = computeLayout(count, borderWidth));
}
// "9x11,8x23,3x1": ardışık aynı uzunluktaki satırlar tek terimde
function runLengths(boxes) {
  const lens = [];
  let top = null;
  for (const b of boxes) {
    if (b.top !== top) {
      lens.push(0);
      top = b.top;
    }
    lens[lens.length - 1]++;
  }
  const out = [];
  for (const n of lens) {
    const last = out[out.length - 1];
    if (last && last[0] === n) last[1]++;
    else out.push([n, 1]);
  }
  return out.map(([n, k]) => `${n}x${k}`).join(",");
}
// Gerçek Chromium ölçümü (düzeltmeden önceki izgara; satır uzunlukları düzeltmeden bağımsız): Bakara 286, Fâtiha 7 düğme.
// w = ızgaranın offsetWidth'i (border-box: içerik genişliği + 20 px dolgu), satirAdimi = 36 px.
const CHROMIUM = [
  { viewport: 430, w: 400, bakara: "9x11,8x23,3x1", rows: 35, fatiha: "7x1" },
  { viewport: 320, w: 290, bakara: "6x47,4x1", rows: 48, fatiha: "6x1,1x1" },
  { viewport: 1200, w: 450, bakara: "10x10,9x20,6x1", rows: 31, fatiha: "7x1" },
];
{
  const bad = [];
  for (const m of CHROMIUM) {
    const b = computeLayout(surahs["2"].versesCount, m.w);
    const f = computeLayout(surahs["1"].versesCount, m.w);
    if (runLengths(b) !== m.bakara) bad.push(`${m.viewport} px Bakara ${runLengths(b)} != ${m.bakara}`);
    if (runLengths(f) !== m.fatiha) bad.push(`${m.viewport} px Fâtiha ${runLengths(f)} != ${m.fatiha}`);
    if (new Set(b.map((x) => x.top)).size !== m.rows) bad.push(`${m.viewport} px Bakara satır sayısı ${new Set(b.map((x) => x.top)).size} != ${m.rows}`);
    const tops = [...new Set(b.map((x) => x.top))];
    if (!tops.every((t, i) => (i === 0 ? t === CSS.padTop : t - tops[i - 1] === 36))) bad.push(`${m.viewport} px satır adımı (36 px) ya da ilk satırın üst dolgusu`);
  }
  const b400 = computeLayout(286, 400);
  if (b400[0].width !== 34 || b400[98].width !== 34 || b400[99].width !== 38 || b400[285].width !== 38) bad.push("düğme genişlikleri (1-99: 34, 100-286: 38)");
  if (b400.filter((x) => x.width === 34).length !== 99 || b400.filter((x) => x.width === 38).length !== 187) bad.push("34 px/38 px düğme sayıları (99/187)");
  checkAll(`düzen modeli x Chromium: 430/320/1200 px'te (ızgara 400/290/450 px) Bakara satır uzunlukları 9x11,8x23,3x1 / 6x47,4x1 / 10x10,9x20,6x1 ve Fâtiha 7x1 / 6x1,1x1 / 7x1 (satır sayısı 35/48/31), satır adımı 36 px, 34 px'lik 99 ve 38 px'lik 187 düğme`, bad);
}

// -- (3) targetChip (saf) -------------------------------------------------------------------------------------------
const sameAt = (a, b) => (a === null || b === null ? a === b : a.row === b.row && a.col === b.col);
const showAt = (c) => (c === null ? "null" : `(${c.row},${c.col})`);
const KEYS8 = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"];

// Bağımsız model: yerleşimi düz bir listeye açıp (satır, sütun, merkez) dizinle ilerliyor; Aşağı/Yukarı'da hedef satırın adaylarını
// (|merkez farkı|, sütun) sırasına dizip ilkini alıyor (modülün döngüsünden farklı yol); PageUp/PageDown 10 satır (sabit, modülün
// PAGE_ROWS'una bakmadan).
function modelChip(key, row, col, centers) {
  const flat = [];
  centers.forEach((r, ri) => r.forEach((x, ci) => flat.push({ row: ri, col: ci, x })));
  const at = flat.findIndex((f) => f.row === row && f.col === col);
  const pos = (f) => ({ row: f.row, col: f.col });
  if (key === "ArrowRight") return pos(flat[Math.min(at + 1, flat.length - 1)]);
  if (key === "ArrowLeft") return pos(flat[Math.max(at - 1, 0)]);
  if (key === "Home") return pos(flat[0]);
  if (key === "End") return pos(flat[flat.length - 1]);
  const steps = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 }[key];
  if (steps === undefined) return null;
  const to = Math.max(0, Math.min(centers.length - 1, row + steps));
  if (to === row) return pos(flat[at]);
  const near = flat.filter((f) => f.row === to).sort((a, b) => Math.abs(a.x - flat[at].x) - Math.abs(b.x - flat[at].x) || a.col - b.col);
  return pos(near[0]);
}

// Bir yerleşimin (kutu listesi) görsel satırları: her satırda düğme numaraları ve yatay merkezler (modülün measureGrid'inden bağımsız).
function rowsOfBoxes(boxes) {
  const nums = [];
  const centers = [];
  let top = null;
  boxes.forEach((b, i) => {
    if (b.top !== top) {
      nums.push([]);
      centers.push([]);
      top = b.top;
    }
    nums[nums.length - 1].push(i + 1);
    centers[centers.length - 1].push(b.left + b.width / 2);
  });
  return { nums, centers };
}
const where = (nums, n) => {
  for (let r = 0; r < nums.length; r++) if (nums[r].includes(n)) return { row: r, col: nums[r].indexOf(n) };
  return null;
};

{
  const C = [[10, 20, 30], [15, 25], [10, 20, 30]];
  const table = [
    // [tuş, satır, sütun, beklenen [satır, sütun]]
    ["ArrowRight", 0, 0, [0, 1]],
    ["ArrowRight", 0, 2, [1, 0]], // satır sonunda yandaki satırın başına (okur gibi)
    ["ArrowRight", 1, 1, [2, 0]],
    ["ArrowRight", 2, 2, [2, 2]], // ızgaranın sonunda durur, dönmez
    ["ArrowLeft", 0, 1, [0, 0]],
    ["ArrowLeft", 1, 0, [0, 2]], // satır başında önceki satırın sonuna
    ["ArrowLeft", 2, 0, [1, 1]],
    ["ArrowLeft", 0, 0, [0, 0]], // başta durur
    ["ArrowDown", 0, 0, [1, 0]], // x=10: 15 (5) 25 (15)
    ["ArrowDown", 0, 2, [1, 1]], // x=30: 15 (15) 25 (5)
    ["ArrowDown", 0, 1, [1, 0]], // x=20: 15 ve 25 eşit uzaklıkta: soldaki
    ["ArrowDown", 1, 0, [2, 0]], // x=15: 10 ve 20 eşit: soldaki
    ["ArrowDown", 1, 1, [2, 1]], // x=25: 20 ve 30 eşit: soldaki
    ["ArrowDown", 2, 1, [2, 1]], // son satırda durur
    ["ArrowUp", 2, 2, [1, 1]], // x=30: 25
    ["ArrowUp", 2, 0, [1, 0]], // x=10: 15
    ["ArrowUp", 2, 1, [1, 0]], // x=20: 15/25 eşit: soldaki
    ["ArrowUp", 1, 1, [0, 1]], // x=25: 20 ve 30 eşit: soldaki
    ["ArrowUp", 1, 0, [0, 0]], // x=15: 10 ve 20 eşit: soldaki
    ["ArrowUp", 0, 1, [0, 1]], // ilk satırda durur
    ["Home", 2, 1, [0, 0]],
    ["End", 0, 0, [2, 2]],
    ["PageDown", 0, 1, [2, 1]], // 3 satırlık ızgarada son satıra kırpılır, sütun yatay merkezle
    ["PageDown", 1, 0, [2, 0]],
    ["PageUp", 2, 2, [0, 2]],
    ["PageUp", 0, 0, [0, 0]],
  ];
  const bad = [];
  for (const [key, r, c, want] of table) {
    const got = targetChip(key, r, c, C);
    const w = { row: want[0], col: want[1] };
    if (!sameAt(got, w)) bad.push(`(${r},${c}) ${key}: ${showAt(got)} != ${showAt(w)}`);
  }
  checkAll(`targetChip: ${table.length} elle hesaplanmış örnek (Sağ/Sol satır sonunda yandaki satıra geçer, Aşağı/Yukarı en yakın yatay merkez, eşitlikte soldaki, uçlarda durur, Home/End, kısa ızgarada PageUp/PageDown kırpılır)`, bad);

  const one = [[5]];
  checkAll("targetChip: tek düğmelik ızgarada her tuş yerinde (engellenecek ama gidilecek yer yok)", KEYS8.filter((k) => !sameAt(targetChip(k, 0, 0, one), { row: 0, col: 0 })));
  const line = [[10, 20, 30, 40]];
  checkAll("targetChip: tek satırlık ızgarada Aşağı/Yukarı/PageDown/PageUp yerinde, Sağ/Sol +-1, Home/End uçlar (jsdom'daki yerleşimsiz durum ve Fâtiha)", [["ArrowDown", 1, 1], ["ArrowUp", 2, 2], ["PageDown", 0, 0], ["PageUp", 3, 3], ["ArrowRight", 1, 2], ["ArrowLeft", 2, 1], ["Home", 3, 0], ["End", 0, 3], ["ArrowRight", 3, 3], ["ArrowLeft", 0, 0]].filter(([k, from, to]) => !sameAt(targetChip(k, 0, from, line), { row: 0, col: to })).map(([k, from, to]) => `${k} ${from}->${to}`));

  const C40 = Array.from({ length: 40 }, () => [10, 20]);
  const pg = [["PageDown", 0, 10], ["PageDown", 2, 12], ["PageDown", 29, 39], ["PageDown", 30, 39], ["PageDown", 39, 39], ["PageUp", 39, 29], ["PageUp", 10, 0], ["PageUp", 9, 0], ["PageUp", 0, 0]];
  checkAll(`targetChip: PageUp/PageDown ${PAGE_ROWS} görsel satır atlıyor, uçlarda kırpılıyor (40 satırlık ızgara: ${pg.length} örnek, iki sütunda da; sütun yatay merkezle korunuyor)`, pg.flatMap(([key, from, to]) => [0, 1].map((col) => [key, from, to, col])).filter(([key, from, to, col]) => !sameAt(targetChip(key, from, col, C40), { row: to, col })).map(([key, from, to, col]) => `${key} ${from}.${col} -> ${to}`));
}

{
  // Gerçek Bakara yerleşimi (400 px ızgara: 34 px'lik 9'lu satırlardan 38 px'lik 8'li satırlara geçiş): sütun numarası değil yatay merkez korunuyor.
  const { nums, centers } = rowsOfBoxes(computeLayout(286, 400));
  const go = (key, n) => {
    const at = where(nums, n);
    const to = targetChip(key, at.row, at.col, centers);
    return nums[to.row][to.col];
  };
  check("Bakara yerleşimi yüklendi (35 satır: 11 satır 9'lu, 23 satır 8'li, son satır 3)", nums.length === 35 && nums.slice(0, 11).every((r) => r.length === 9) && nums.slice(11, 34).every((r) => r.length === 8) && nums[34].length === 3);
  const table = [
    ["ArrowDown", 99, 107], // x=347 (9. sütun) -> 38 px'lik satırda 9. sütun yok: en yakın merkez 337 (107)
    ["ArrowUp", 107, 99], // x=337: 347 (10) ve 307 (30) -> 99
    ["ArrowDown", 95, 104], // x=187: 161 (26), 205 (18) -> 104
    ["ArrowUp", 104, 95], // x=205: 187 (18), 227 (22) -> 95
    ["ArrowDown", 91, 100], // x=27: 29 -> 100
    ["ArrowUp", 100, 91], // x=29: 27 -> 91
    ["ArrowDown", 98, 106], // x=307: 293 (14), 337 (30) -> 106
    ["ArrowDown", 96, 104], // x=227: 205 (22) ve 249 (22) tam eşit uzaklıkta -> soldaki (sol kenara göre 105 çıkardı: 230'a 20, 186'ya 24)
    ["ArrowUp", 105, 97], // x=249: 227 (22) ve 267 (18) -> 97 (sol kenar 230'a göre 96 çıkardı: 210 ve 250 eşit)
    ["ArrowDown", 10, 19],
    ["ArrowUp", 19, 10],
    ["PageDown", 1, 91], // 10 satır aşağı: ilk satırdan 11. satır (91-99)
    ["PageDown", 10, 100], // 2. satırdan (10-18) 12. satır: 100-107 (x=27 -> 29)
    ["PageDown", 108, 188], // 13. satırdan 23. satır: 188-195
    ["PageUp", 188, 108],
    ["End", 1, 286],
    ["ArrowUp", 286, 278], // x=117 (284-286'nın 3. düğmesi) -> önceki satır 276-283: 117 -> 278
    ["ArrowDown", 278, 286],
    ["ArrowDown", 283, 286], // x=337: son satırda yalnızca 3 düğme (29, 73, 117): en yakın 117 -> 286
    ["ArrowRight", 99, 100], // 99 satırın son düğmesi: Sağ bir alt satırın başındaki 100'e geçer
    ["ArrowLeft", 100, 99],
    ["ArrowRight", 9, 10],
    ["ArrowLeft", 10, 9],
    ["ArrowRight", 286, 286],
    ["ArrowLeft", 1, 1],
    ["ArrowDown", 286, 286],
    ["PageDown", 286, 286],
    ["PageUp", 1, 1],
    ["ArrowUp", 5, 5],
  ];
  const bad = [];
  for (const [key, from, want] of table) {
    const got = go(key, from);
    if (got !== want) bad.push(`${from} ${key}: ${got} != ${want}`);
  }
  checkAll(`targetChip: Bakara 400 px yerleşiminde ${table.length} elle hesaplanmış geçiş (34 px'lik 9'lu satırdan 38 px'lik 8'li satıra: sütun numarası değil yatay merkez korunuyor, 9. sütun yoksa son düğme; PageDown 10 satır; son satırda 3 düğme)`, bad);
}

{
  // Geçersiz girdi ve işlenmeyen tuşlar -> null
  const ok = [[10, 20], [10, 20], [10, 20]];
  const badCenters = [undefined, null, "10", {}, [], [[]], [[10], []], [[10, NaN]], [[10, Infinity]], [["10"]], [[10, null]], [[10, undefined]], [10, 20], [[10], 5], [[10, -Infinity]], ["ab"], [{ length: 2, every: () => true }]];
  const badPos = [[-1, 0], [0, -1], [3, 0], [0, 2], [1.5, 0], [0, 0.5], [NaN, 0], [0, NaN], ["1", 0], [0, "1"], [null, 0], [undefined, 0], [0, undefined], [Infinity, 0]];
  const keys = ["Tab", "Enter", " ", "Escape", "a", "A", "1", "", "arrowdown", "ArrowDown ", "Left", "Down", "PgDn", "Backspace", "Delete", "F1", "Shift", "Control", "Meta", "Alt", undefined, null, 40];
  const bad = [];
  for (const c of badCenters) if (targetChip("ArrowDown", 0, 0, c) !== null) bad.push(`geçersiz merkezler ${JSON.stringify(c)}`);
  for (const [r, c] of badPos) if (targetChip("ArrowDown", r, c, ok) !== null) bad.push(`geçersiz konum (${r},${c})`);
  for (const k of keys) if (targetChip(k, 1, 1, ok) !== null) bad.push(`işlenmeyen tuş ${JSON.stringify(k)}`);
  checkAll("targetChip: geçersiz yerleşim (dizi değil, boş, boş satır, NaN/Infinity/sayı olmayan merkez, satırı dizi olmayan: sayı, dizge, diziye benzeyen nesne), geçersiz konum (aralık dışı, kesirli, NaN, dizge, null) ve işlenmeyen tuşlar (Tab, Enter, Space, Escape, harfler, büyük/küçük harf ve boşluk farkı, sayı) null döndürüyor", bad);
  const frozen = Object.freeze([Object.freeze([10, 20, 30]), Object.freeze([15, 25]), Object.freeze([10])]);
  let threw = false;
  try {
    for (const k of KEYS8) for (let r = 0; r < frozen.length; r++) for (let c = 0; c < frozen[r].length; c++) targetChip(k, r, c, frozen);
  } catch {
    threw = true;
  }
  check("targetChip: saf işlev (dondurulmuş yerleşimi değiştirmeye çalışmıyor, fırlatmıyor)", !threw);

  // Merkezler eşitken (yerleşimsiz ortam: jsdom'da offset'lerin hepsi 0): uçtaki satırda dikey tuşlar yine yerinde kalıyor (gerçek
  // düzenlerde merkezler kesin artıyor ve en yakın merkez zaten odaktaki düğme; burada eşitlik yüzünden ilk düğmeye kayardı);
  // ara satırda eşit uzaklıkta soldaki düğme seçiliyor
  const flatBad = [];
  const expectAt = (label, got, row, col) => {
    if (!got || got.row !== row || got.col !== col) flatBad.push(`${label}: ${JSON.stringify(got)} != ${JSON.stringify({ row, col })}`);
  };
  for (const k of ["ArrowDown", "ArrowUp", "PageDown", "PageUp"]) for (let c = 0; c < 5; c++) expectAt(`tek satır ${k} (0,${c})`, targetChip(k, 0, c, [[0, 0, 0, 0, 0]]), 0, c);
  const flat2 = [[0, 0], [0, 0, 0]];
  expectAt("son satırda Aşağı (1,2)", targetChip("ArrowDown", 1, 2, flat2), 1, 2);
  expectAt("ilk satırda Yukarı (0,1)", targetChip("ArrowUp", 0, 1, flat2), 0, 1);
  expectAt("ilk satırdan Aşağı (0,1): eşit uzaklıkta alt satırın soldaki (ilk) düğmesi", targetChip("ArrowDown", 0, 1, flat2), 1, 0);
  expectAt("son satırdan Yukarı (1,2): eşit uzaklıkta üst satırın ilk düğmesi", targetChip("ArrowUp", 1, 2, flat2), 0, 0);
  checkAll("targetChip: merkezler eşitken (yerleşimsiz ortam: jsdom'da offset'ler hep 0) uçtaki satırda Aşağı/Yukarı/PageDown/PageUp yerinde kalıyor, ara satırda eşit uzaklıkta soldaki düğme seçiliyor", flatBad);
}

{
  // Küçük yerleşimlerde TÜM birleşimler (satır başına iki ayrı kaydırma: eşit uzaklık durumları çıkıyor) + rastgele gerçekçi yerleşimler x bağımsız model
  const bad = [];
  let n = 0;
  const shifts = [0, 5];
  const walk = (lens, depth) => {
    if (lens.length > 0) {
      const R = lens.length;
      for (let mask = 0; mask < 1 << R; mask++) {
        const centers = lens.map((len, r) => Array.from({ length: len }, (_, c) => 10 * c + shifts[(mask >> r) & 1]));
        for (let r = 0; r < R; r++)
          for (let c = 0; c < lens[r]; c++)
            for (const key of [...KEYS8, "Tab"]) {
              n++;
              const got = targetChip(key, r, c, centers);
              const want = modelChip(key, r, c, centers);
              if (!sameAt(got, want)) bad.push(`${JSON.stringify(centers)} (${r},${c}) ${key}: ${showAt(got)} != ${showAt(want)}`);
            }
      }
    }
    if (depth === 0) return;
    for (const len of [1, 2, 3]) walk([...lens, len], depth - 1);
  };
  walk([], 4);
  const rnd = mulberry32(31415);
  for (let i = 0; i < 1000; i++) {
    const R = 1 + Math.floor(rnd() * 45);
    const centers = Array.from({ length: R }, () => {
      const len = 1 + Math.floor(rnd() * 12);
      let x = Math.floor(rnd() * 21);
      return Array.from({ length: len }, () => {
        const w = rnd() < 0.5 ? 34 : 38;
        const c = x + w / 2;
        x += w + 6;
        return c;
      });
    });
    const r = Math.floor(rnd() * R);
    const c = Math.floor(rnd() * centers[r].length);
    const key = KEYS8[Math.floor(rnd() * KEYS8.length)];
    n++;
    const got = targetChip(key, r, c, centers);
    const want = modelChip(key, r, c, centers);
    if (!sameAt(got, want)) bad.push(`rastgele #${i} (${r},${c}) ${key}: ${showAt(got)} != ${showAt(want)}`);
  }
  checkAll(`targetChip: ${n} birleşim (4 satıra kadar tüm yerleşimler x satır başına iki kaydırma x tüm konumlar x 9 tuş + 1000 rastgele gerçekçi yerleşim) bağımsız modelle (düzleştirilmiş liste, sıralamaya dayalı en yakın merkez) birebir`, bad);
}

// -- Ortak jsdom yardımcıları ---------------------------------------------------------------------------------------
const jsdomErrors = [];
function newDom(markup) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => jsdomErrors.push(String((e && e.detail && e.detail.message) || (e && e.message) || e).slice(0, 160)));
  return new JSDOM(markup, { pretendToBeVisual: true, url: "http://localhost/", virtualConsole });
}
// jsdom'da yerleşim yok (offsetTop/offsetLeft/offsetWidth hep 0): ızgaradaki düğmelerin offset'leri yukarıdaki akış modeliyle
// taklit ediliyor; ızgaranın genişliği (layout.width) sonradan değiştirilebiliyor (pencere genişliği değişimi). Düğmeler 1..N numaralı
// ve ızgaranın tek çocukları sayılıyor (gerçek ızgara da öyle). layout.custom = { <ızgaranın id'si>: [{ top, left, width }, ...] } o
// ızgara için akış modeli yerine elle kurulmuş bir yerleşim verir (düğme genişlikleri gerçekte olduğundan çok farklı olabilsin diye).
function installLayout(win, layout) {
  const proto = win.HTMLElement.prototype;
  const isChip = (el) => el.classList.contains("ayah-chip") && el.parentElement !== null && el.parentElement.classList.contains("ayah-grid") && el.hasAttribute("data-ayah");
  const boxOf = (el) => {
    const custom = layout.custom && layout.custom[el.parentElement.id];
    return (custom || layoutFor(el.parentElement.children.length, layout.width))[parseInt(el.getAttribute("data-ayah"), 10) - 1];
  };
  for (const [prop, pick] of [["offsetTop", (b) => b.top], ["offsetLeft", (b) => b.left], ["offsetWidth", (b) => b.width]]) {
    Object.defineProperty(proto, prop, {
      configurable: true,
      get() {
        return isChip(this) ? pick(boxOf(this)) : 0;
      },
    });
  }
}

function desc(el) {
  if (!el) return "-";
  const cl = el.classList;
  if (cl.contains("modal-item")) return `satır:${el.dataset.surah ?? el.dataset.juz ?? el.dataset.hizb ?? el.dataset.rub ?? el.dataset.manzil ?? el.dataset.reciter}`;
  if (cl.contains("surah-expand-btn")) return `aç:${el.dataset.surah}`;
  if (cl.contains("ayah-chip")) return `ayet:${el.dataset.surah}:${el.dataset.ayah}`;
  if (cl.contains("modal-close")) return "kapat";
  return el.id || el.tagName.toLowerCase();
}
// Bir ızgaranın tek Tab durağı (tabindex="0") mu: ızgaradaki TEK tabindex=0 `want` düğmesinde, ötekilerin hepsi "-1"
const chipsOfGrid = (grid) => [...grid.querySelectorAll(".ayah-chip")];
function rovingOk(grid, want) {
  const chips = chipsOfGrid(grid);
  const zero = chips.filter((c) => c.getAttribute("tabindex") === "0");
  return zero.length === 1 && zero[0] === want && chips.every((c) => c === want || c.getAttribute("tabindex") === "-1");
}
const rovingWho = (grid) => chipsOfGrid(grid).filter((c) => c.getAttribute("tabindex") === "0").map(desc).join("/") || "yok";

function fillGrid(d, grid, surah, n) {
  for (let a = 1; a <= n; a++) {
    const b = d.createElement("button");
    b.type = "button";
    b.className = "ayah-chip";
    b.textContent = a;
    b.setAttribute("data-surah", surah);
    b.setAttribute("data-ayah", a);
    grid.appendChild(b);
  }
}
const KEYS_MODS = ["shiftKey", "ctrlKey", "altKey", "metaKey"];

// -- (4) setupGridNav / syncGridStop, yalıtılmış (sentetik DOM) ------------------------------------------------------
{
  const MINI = `<!doctype html><html><body>
<div id="list">
  <div class="surah-row-wrapper"><div class="surah-row"><button class="modal-item" id="row1">Fâtiha</button></div><div class="ayah-grid" id="g1"></div></div>
  <div class="surah-row-wrapper"><div class="surah-row"><button class="modal-item" id="row2">Bakara</button></div><div class="ayah-grid" id="g2"></div></div>
  <div class="surah-row-wrapper"><div class="surah-row"><button class="modal-item" id="row3">Boş</button></div><div class="ayah-grid" id="gEmpty"></div></div>
  <button class="ayah-chip" id="stray" data-ayah="1" data-surah="9">1</button>
</div>
<div id="other"><div class="ayah-grid" id="g3"></div></div>
<button id="outside">dışarıda</button>
</body></html>`;
  const dom = newDom(MINI);
  const win = dom.window;
  const d = win.document;
  const layout = { width: 400 };
  installLayout(win, layout);
  const $ = (id) => d.getElementById(id);
  const list = $("list");
  const [g1, g2, gEmpty, g3] = ["g1", "g2", "gEmpty", "g3"].map($);
  fillGrid(d, g1, 1, 12);
  fillGrid(d, g2, 2, 12);
  fillGrid(d, g3, 3, 12);
  const foreign = d.createElement("button");
  foreign.id = "foreign";
  g1.appendChild(foreign); // ızgaranın içinde ama düğme (.ayah-chip) değil
  const chip = (g, n) => g.querySelector(`.ayah-chip[data-ayah="${n}"]`);
  const press = (target, k, mods = {}) => {
    const ev = new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...mods });
    target.dispatchEvent(ev);
    return ev.defaultPrevented;
  };
  const at = () => desc(d.activeElement);

  const dispose = setupGridNav(list);
  check("setupGridNav: dönüş değeri bir işlev (dinleyicileri kaldırıyor)", typeof dispose === "function");
  check("setupGridNav: kurulumda hiçbir düğmenin tabindex'ine dokunmuyor (durağı syncGridStop/focusin koyuyor)", chipsOfGrid(g1).every((c) => c.getAttribute("tabindex") === null));

  chip(g1, 1).focus();
  check("focusin: odaklanan düğme ızgaranın TEK durağı oluyor (tabindex=0), ızgaradaki öteki düğmeler -1", rovingOk(g1, chip(g1, 1)));
  check("focusin: başka ızgaralara (g2, ızgara dışındaki g3) ve ızgarasız düğmeye dokunmuyor", chipsOfGrid(g2).every((c) => c.getAttribute("tabindex") === null) && chipsOfGrid(g3).every((c) => c.getAttribute("tabindex") === null) && $("stray").getAttribute("tabindex") === null && foreign.getAttribute("tabindex") === null);
  check("Sağ: bir sonraki düğme, olay engelleniyor, durak odakla birlikte taşınıyor", press(chip(g1, 1), "ArrowRight") === true && at() === "ayet:1:2" && rovingOk(g1, chip(g1, 2)));
  chip(g1, 5).focus();
  check("Aşağı (400 px: ilk satır 9 düğme, ikinci satır 10-12): 5. düğmenin (x=187) altındaki satırda en yakın merkez 12. düğme (x=107)", press(chip(g1, 5), "ArrowDown") === true && at() === "ayet:1:12");
  check("Yukarı: 12. düğme (x=107) -> üst satırda yatay merkezi aynı olan 3. düğme (x=107)", press(chip(g1, 12), "ArrowUp") === true && at() === "ayet:1:3");
  chip(g1, 1).focus();
  layout.width = 290;
  check("Pencere genişliği değişince yerleşim her tuşta yeniden ölçülüyor: 290 px'te (satırda 6 düğme) 1. düğmeden Aşağı 10. değil 7. düğme", press(chip(g1, 1), "ArrowDown") === true && at() === "ayet:1:7");
  layout.width = 400;
  check("Genişlik 400 px'e dönünce aynı tuş yine 10. düğmeye gidiyor", (chip(g1, 1).focus(), press(chip(g1, 1), "ArrowDown") === true && at() === "ayet:1:10"));

  // Hangi olaylar yok sayılıyor
  chip(g1, 3).focus();
  const keep = d.activeElement;
  const bad = [];
  for (const k of ["Enter", " ", "Tab", "a", "1", "Escape", "Backspace", "F2", "Shift", "Control"]) if (press(keep, k) || d.activeElement !== keep) bad.push(`işlenmeyen ${JSON.stringify(k)}`);
  for (const k of KEYS8) for (const m of KEYS_MODS) if (press(keep, k, { [m]: true }) || d.activeElement !== keep) bad.push(`${m}+${k}`);
  checkAll("işlenmeyen tuşlar (Enter, Space, Tab, harf, rakam, Escape, Backspace, F2, tek başına Shift/Control) ve değiştiricili tuşlar (Shift/Ctrl/Alt/Meta + 8 tuş = 32) YOK SAYILIYOR: olay engellenmiyor, odak yerinde (Alt+Sol = tarayıcıda geri gitmek için)", bad);
  const consume = (e) => e.preventDefault();
  list.addEventListener("keydown", consume, true); // yakalama: modülün dinleyicisinden ÖNCE çalışır
  const consumed = press(keep, "ArrowRight");
  list.removeEventListener("keydown", consume, true);
  check("zaten engellenmiş (başka işleyicinin tükettiği) olay yok sayılıyor: odak yerinde", consumed === true && d.activeElement === keep);
  check("tüketme dinleyicisi kalkınca aynı tuş çalışıyor (önceki kontrol dinleyicinin kendi etkisi değil) ve basılı tutma (repeat) gezintiyi sürdürüyor", press(keep, "ArrowRight", { repeat: true }) === true && at() === "ayet:1:4");

  // Başka kaynaktan gelen olaylar yok sayılıyor
  const ignoredSrc = [];
  const tryIgnored = (label, target, focusFirst) => {
    const tabBefore = chipsOfGrid(g1).map((c) => c.getAttribute("tabindex")).join(); // odaklamadan ÖNCE: focusin de durağa dokunmamalı
    if (focusFirst) target.focus();
    const before = d.activeElement;
    for (const k of KEYS8) if (press(target, k) || d.activeElement !== before) ignoredSrc.push(`${label}: ${k}`);
    if (chipsOfGrid(g1).map((c) => c.getAttribute("tabindex")).join() !== tabBefore) ignoredSrc.push(`${label}: tabindex değişti`);
  };
  tryIgnored("satır düğmesi (listede, ızgara dışında)", $("row1"), true);
  tryIgnored("listenin kendisi (olay hedefi liste)", list, false);
  tryIgnored("ızgara içindeki düğme olmayan öğe (.ayah-chip değil)", foreign, true);
  tryIgnored("ızgarasız .ayah-chip (listede, .ayah-grid dışında)", $("stray"), true);
  tryIgnored("listenin DIŞINDAKİ ızgaranın düğmesi (g3: bu listeye kayıtlı değil)", chip(g3, 3), true);
  checkAll("başka kaynaktan gelen olaylar yok sayılıyor: satır düğmesi, listenin kendisi, ızgara içindeki düğme olmayan öğe, ızgarasız .ayah-chip, kayıtlı listenin DIŞINDAKİ ızgara (8 tuş x 5 kaynak: engellenmiyor, odak yerinde, tabindex değişmiyor)", ignoredSrc);
  chip(g3, 3).focus();
  check("focusin: kayıtlı listenin dışındaki ızgarada ve ızgarasız düğmede durak taşınmıyor", chipsOfGrid(g3).every((c) => c.getAttribute("tabindex") === null) && ($("stray").focus(), $("stray").getAttribute("tabindex") === null));

  // Sınırlarda: engellenir ama yerinde
  chip(g1, 1).focus();
  check("ızgaranın başında Sol/Yukarı/PageUp/Home yerinde ama olay yine de engelleniyor (liste ok tuşuyla kaymasın)", ["ArrowLeft", "ArrowUp", "PageUp", "Home"].every((k) => press(d.activeElement, k) === true && at() === "ayet:1:1"));
  chip(g1, 12).focus();
  check("ızgaranın sonunda Sağ/Aşağı/PageDown/End yerinde ama olay yine de engelleniyor", ["ArrowRight", "ArrowDown", "PageDown", "End"].every((k) => press(d.activeElement, k) === true && at() === "ayet:1:12") && rovingOk(g1, chip(g1, 12)));

  // İki ızgara birbirinden bağımsız
  chip(g2, 4).focus();
  check("iki ızgara bağımsız: g2'de 4. düğmeye odak g2'nin durağını taşıyor, g1'in durağı (son odaklanan 12. düğme) yerinde", rovingOk(g2, chip(g2, 4)) && rovingOk(g1, chip(g1, 12)));

  // syncGridStop öncelikleri: odaktaki düğme > aria-current="true" > ilk düğme
  $("outside").focus();
  syncGridStop(g2);
  check("syncGridStop: odak ızgarada değil, aria-current yok -> ilk düğme (4. düğme eski durak, artık -1)", rovingOk(g2, chip(g2, 1)));
  chip(g2, 6).setAttribute("aria-current", "true");
  syncGridStop(g2);
  check("syncGridStop: aria-current=true olan düğme (6) durak", rovingOk(g2, chip(g2, 6)));
  chip(g2, 3).focus();
  syncGridStop(g2);
  check("syncGridStop: odak ızgarada -> odaktaki düğme (3), aria-current'lı 6. düğme değil (gezen kullanıcının durağı kaçmıyor)", rovingOk(g2, chip(g2, 3)) && chip(g2, 6).getAttribute("tabindex") === "-1");
  chip(g1, 2).focus();
  syncGridStop(g2);
  check("syncGridStop: odak BAŞKA ızgarada (g1) -> sayılmıyor: g2'nin durağı aria-current'lı 6. düğme", rovingOk(g2, chip(g2, 6)));
  chip(g2, 6).removeAttribute("aria-current");
  chip(g2, 5).setAttribute("aria-current", "false");
  $("outside").focus();
  syncGridStop(g2);
  check('syncGridStop: aria-current="false" işaretli düğme sayılmıyor (yalnızca "true") -> ilk düğme', rovingOk(g2, chip(g2, 1)));
  let threw = false;
  try {
    syncGridStop(gEmpty);
    syncGridStop(d.createElement("div"));
  } catch {
    threw = true;
  }
  check("syncGridStop: düğmesiz ızgarada fırlatmıyor ve hiçbir şey yazmıyor", !threw && gEmpty.children.length === 0);

  // dispose
  chip(g1, 1).focus();
  const stopBefore = rovingWho(g1);
  dispose();
  check("dispose: dinleyiciler kalkınca tuş işlenmiyor (olay engellenmiyor, odak yerinde)", press(chip(g1, 1), "ArrowRight") === false && at() === "ayet:1:1");
  chip(g1, 7).focus();
  check("dispose: focusin artık durağı taşımıyor (1. düğme durak olarak kalıyor)", stopBefore === "ayet:1:1" && rovingWho(g1) === "ayet:1:1");
  let threw2 = false;
  try {
    dispose();
  } catch {
    threw2 = true;
  }
  check("dispose iki kez çağrılınca fırlatmıyor", !threw2);
  const dispose2 = setupGridNav($("other"));
  chip(g3, 2).focus();
  check("setupGridNav başka bir listeye de kurulabiliyor (g3'ün listesi #other): oradaki ızgara artık çalışıyor, öteki liste kapalı kalıyor", rovingOk(g3, chip(g3, 2)) && press(chip(g3, 2), "ArrowRight") === true && at() === "ayet:3:3" && press(chip(g1, 1), "ArrowRight") === false);
  dispose2();
  let threw3 = false;
  try {
    setupGridNav(d.createElement("div"))();
  } catch {
    threw3 = true;
  }
  check("ızgarasız (boş) bir listeye kurulum ve dispose fırlatmıyor", !threw3);
}

// -- (4b) Düğme genişlikleri çok farklıyken ölçüm yatay MERKEZE göre ----------------------------------------------------------
// Gerçek ızgarada yalnızca iki genişlik var (34 ve 38 px) ve orada merkez ile sağ kenar hiçbir düzende farklı düğme seçmiyor (Bakara ve
// ayet sayısı 111-206 arası altı başka sure büyüklüğü için 200-700 px arası her ızgara genişliği elle tarandı: fark 0). Yani ölçümün
// merkez mi sağ kenar mı olduğunu gerçek düzenler ayırt edemiyor; yazı boyutu ya da başka bir yazı tipi düğme genişliklerini açarsa
// fark çıkar. Sözleşme (merkez) bu yüzden elle kurulmuş bir yerleşimle sabitleniyor.
{
  const dom = newDom(`<!doctype html><html><body><div id="list"><div class="ayah-grid" id="gw"></div></div></body></html>`);
  const win = dom.window;
  const d = win.document;
  // Üç görsel satır (üst 0, 36, 72): satır 1: geniş 1 (x 0-100, merkez 50) ve dar 2 (x 115-125, merkez 120); satır 2: dar 3 (x 90-100, merkez 95);
  // satır 3: geniş 4 (merkez 50) ve dar 5 (merkez 120). 3'ten Yukarı/Aşağı: merkeze göre dar düğme (|120-95| = 25 < |50-95| = 45) -> 2 ve 5;
  // sağ kenara göre geniş düğme (|100-100| = 0 < |125-100| = 25) -> 1 ve 4 olurdu.
  const boxes = [
    { top: 0, left: 0, width: 100 },
    { top: 0, left: 115, width: 10 },
    { top: 36, left: 90, width: 10 },
    { top: 72, left: 0, width: 100 },
    { top: 72, left: 115, width: 10 },
  ];
  installLayout(win, { width: 400, custom: { gw: boxes } });
  const gw = d.getElementById("gw");
  fillGrid(d, gw, 5, 5);
  setupGridNav(d.getElementById("list"));
  const chipAt = (n) => gw.querySelector(`.ayah-chip[data-ayah="${n}"]`);
  const from3 = (k) => {
    chipAt(3).focus();
    const ev = new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
    chipAt(3).dispatchEvent(ev);
    return desc(d.activeElement);
  };
  const up = from3("ArrowUp");
  const down = from3("ArrowDown");
  check(`ölçüm yatay MERKEZE göre (düğme genişlikleri çok farklıyken, elle kurulmuş yerleşim): 3'ten Yukarı 2'ye, Aşağı 5'e gidiyor (sağ kenara göre 1 ve 4 olurdu; bulunan ${up}, ${down})`, up === "ayet:5:2" && down === "ayet:5:5");
}

// -- (5) Davranış: GERÇEK app.js işlevleri x GERÇEK modal-odak.js x GERÇEK liste-gezintisi.js x GERÇEK index.html x GERÇEK data ----
const CURRENT = { surah: 3, juz: 3, hizb: 5, rub: 20, manzil: 1 }; // Chromium ölçümündeki durum (sayfa 50)

function makeEnv({ surah = CURRENT.surah, selectedAyah = null } = {}) {
  const dom = newDom(html);
  const win = dom.window;
  const d = win.document;
  win.Element.prototype.scrollIntoView = function () {};
  const layout = { width: 400 }; // 430 px görünümde Chromium'da ölçülen ızgara genişliği
  installLayout(win, layout);
  const els = new Function("document", `${ELS_SRC}\nreturn els;`)(d);
  const state = { surahs, surahPages, juz: unitData.juz, hizb: unitData.hizb, rub: unitData.rub, manzil: unitData.manzil, selectedAyah, pageToSurah: { 50: surah }, currentPage: 50, openModalEl: null, ezberStudy: null, wordMeal: { open: false }, mushaf: { pagesCount: 604 } };
  const calls = [];
  const timers = [];
  const cur = { ...CURRENT, surah };
  const code = [...CONSTS, RECITERS_SRC, FN.surahLabel, FN.populateSurahList, FN.toggleAyahGrid, FN.closeAllAyahGrids, FN.setActiveAyahChip, FN.syncAyahGridHighlight, FN.populateUnitList, FN.populateJuzList, FN.switchJuzTab, FN.switchEzberTab, FN.setActiveModalItem, FN.readEzberRange, FN.loadEzberSettings, FN.saveEzberSettings, appSource.slice(MODAL_START, MODAL_END), BLOCK[1], FN.setupModals, FN.setupEzberModal,
    "return { openModal, closeModal, closeAllModals, setupModals, setupEzberModal, toggleAyahGrid, setActiveAyahChip, syncAyahGridHighlight, setActiveModalItem, switchJuzTab, openEzberPicker, closeEzberPicker };"].join("\n");
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
    d, win, els, state, api, calls, layout, $,
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
    gridOf: (s) => els.surahList.querySelectorAll(".ayah-grid")[s - 1],
    expandBtn: (s) => els.surahList.querySelectorAll(".surah-expand-btn")[s - 1],
    rowBtn: (s) => els.surahList.querySelectorAll(".modal-item")[s - 1],
    toggle: (s) => env.expandBtn(s).click(), // GERÇEK tıklama işleyicisi -> toggleAyahGrid
    chip: (s, a) => env.gridOf(s).querySelector(`.ayah-chip[data-ayah="${a}"]`),
  };
  return env;
}

// ---- 5a. Bakara ızgarası, seçili ayet yok, 400 px (430 px görünüm) ----
{
  const env = makeEnv();
  const { els } = env;
  env.open("surah-btn");
  check("Sure modalı açıldı; ızgara kapalıyken Tab durakları Kapat + etkin sure (3) satırı, ayet düğmesi henüz yok (ızgaralar tembel kuruluyor)", env.tabStops().join() === "kapat,satır:3" && els.surahList.querySelectorAll(".ayah-chip").length === 0);
  env.toggle(2);
  const grid = env.gridOf(2);
  const chips = chipsOfGrid(grid);
  check("Bakara ızgarası açıldı: 286 düğme, görünür, açma düğmesi aria-expanded=true", chips.length === 286 && !grid.hidden && env.expandBtn(2).getAttribute("aria-expanded") === "true");
  check("açılışta TEK tabindex=0 var: 1. ayet düğmesinde (seçili ayet yok); öteki 285 düğme -1 (önce 286'sı da doğal Tab durağıydı)", rovingOk(grid, chips[0]));
  check("modalın Tab durakları: Kapat, ızgaranın tek durağı (2:1; ızgara 3. sure satırından önce gelir), etkin sure (3) satırı (önce 288 durak: Kapat + 286 ayet + satır)", env.tabStops().join() === "kapat,ayet:2:1,satır:3");
  const tour = [];
  for (let i = 0; i < 4; i++) {
    env.tab();
    tour.push(desc(env.active()));
  }
  check(`Tab turu (Kapat, ızgaranın durağı, satır, başa dönüş): ${tour.join(" > ")}`, tour.join() === "kapat,ayet:2:1,satır:3,kapat");
  const back = [];
  for (let i = 0; i < 3; i++) {
    env.tab(true);
    back.push(desc(env.active()));
  }
  check(`Shift+Tab turu (son durak, ızgaranın durağı, Kapat): ${back.join(" > ")}`, back.join() === "satır:3,ayet:2:1,kapat");

  // Gerçek kullanım: liste gezintisiyle Bakara'nın açma düğmesine, oradan Tab'la ızgaraya
  env.rowBtn(3).focus();
  env.key("ArrowUp");
  env.key("ArrowRight");
  check("liste gezintisi: satır:3 -> Yukarı -> Sağ ile Bakara'nın açma düğmesine (aç:2) geliniyor; ızgaranın 286 düğmesi yola girmiyor", desc(env.active()) === "aç:2" && env.tabStops().join() === "kapat,aç:2,ayet:2:1");
  env.tab();
  check("açma düğmesinden Tab: ızgaranın tek durağı 2:1 (önce 286 Tab, sonra Kapat)", desc(env.active()) === "ayet:2:1");
  env.tab();
  check("bir Tab daha: ızgara bitti, modalın başına dönüyor (Kapat): ızgara 286 yerine 1 Tab", desc(env.active()) === "kapat");
  env.tab(true);
  check("Shift+Tab: Kapat'tan geri, ızgaranın durağına (2:1)", desc(env.active()) === "ayet:2:1");
  env.tab(true);
  check("Shift+Tab: ızgaranın durağından açma düğmesine (listenin durağı)", desc(env.active()) === "aç:2");
  env.key("ArrowDown");
  check("açma düğmesinden Aşağı: sonraki sure (3) açma düğmesi; açık ızgaranın düğmelerini atlıyor (ızgaraya Tab'la girilir)", desc(env.active()) === "aç:3");
  env.expandBtn(2).focus();

  // Tuş dizisi, elle hesaplanmış (400 px: 1-99 -> 34 px'lik 9'lu 11 satır; 100-286 -> 38 px'lik 8'li satırlar, son satırda 3)
  env.chip(2, 1).focus();
  const step = (k, n) => {
    const prevented = env.key(k);
    const ok = prevented === true && desc(env.active()) === `ayet:2:${n}` && rovingOk(grid, env.chip(2, n)) && env.tabStops().join() === `kapat,aç:2,ayet:2:${n}`;
    if (!ok) console.error(`   adım ${k}: ${desc(env.active())} (beklenen ayet:2:${n}), engellendi=${prevented}, durak=${rovingWho(grid)}, Tab durakları=${env.tabStops().join()}`);
    return ok;
  };
  const seq = [
    ["ArrowRight", 2], ["ArrowDown", 11], ["ArrowDown", 20], ["ArrowLeft", 19], ["ArrowUp", 10], // 9'lu satırlar: sütun korunuyor
    ["PageDown", 100], // 2. satırdan 12. satıra: ilk 38 px'lik satır (x=27 -> 29)
    ["ArrowDown", 108], ["PageDown", 188], ["End", 286], ["ArrowUp", 278], ["ArrowDown", 286],
    ["ArrowRight", 286], ["ArrowDown", 286], ["PageDown", 286], // ızgaranın sonunda yerinde (olay yine de engelleniyor)
    ["Home", 1], ["PageUp", 1], ["ArrowLeft", 1], ["ArrowUp", 1], // başında yerinde
    ["ArrowDown", 10], ["Home", 1], ["PageDown", 91], ["ArrowDown", 100], ["ArrowUp", 91], // 1. satırdan 11. satır (91-99), alt satır 38 px'lik
    ["ArrowRight", 92], ["ArrowLeft", 91], ["ArrowLeft", 90], ["ArrowRight", 91], // satır başında Sol bir üst satırın sonuna, satır sonunda Sağ alt satırın başına
  ];
  const bad = seq.map(([k, n], i) => (step(k, n) ? null : `${i + 1}:${k}->${n}`)).filter(Boolean);
  checkAll(`Bakara ızgarası: ${seq.length} adımlık elle hesaplanmış tuş dizisi (odak, ızgaranın tek tabindex=0'ı odakta, modalın Tab durakları Kapat + açma düğmesi + odaktaki düğme, olay engellendi): Sağ/Sol, Aşağı/Yukarı (34 px'lik 9'lu satırlardan 38 px'lik 8'li satırlara geçiş dahil), PageDown/PageUp (10 satır), Home/End, uçlarda durma`, bad);
  env.chip(2, 96).focus();
  check("eşit uzaklık (gerçek yerleşim): 2:96 (merkez 227) -> alt satırda (38 px'lik) 2:104 (merkez 205) ve 2:105 (merkez 249) eşit uzakta: soldaki, 2:104", env.key("ArrowDown") === true && desc(env.active()) === "ayet:2:104");
  env.chip(2, 105).focus();
  check("yatay merkez, sol kenar değil: 2:105 (merkez 249, sol kenar 230) -> üst satırda en yakın MERKEZ 2:97 (267); sol kenara göre 2:96 çıkardı", env.key("ArrowUp") === true && desc(env.active()) === "ayet:2:97");
  check("ızgarada gezinti hiçbir ayeti seçmedi/modalı kapatmadı (yalnızca odak taşındı), listenin durağı hâlâ açma düğmesi (aç:2)", env.calls.length === 0 && env.state.openModalEl === els.surahModal && env.state.selectedAyah === null && chipsOfGrid(grid).filter((c) => c.hasAttribute("aria-current") || c.classList.contains("active")).length === 0 && els.surahList.querySelectorAll('.surah-row [tabindex="0"]').length === 1 && desc(els.surahList.querySelector('.surah-row [tabindex="0"]')) === "aç:2");

  // Işgara dışı satır/hücre tuşları ızgaranın durağını etkilemiyor
  env.chip(2, 50).focus();
  env.expandBtn(2).focus();
  env.key("ArrowDown");
  env.key("ArrowUp");
  check("liste gezintisi ızgaranın durağını taşımıyor: açma düğmesinde Aşağı/Yukarı yapıldıktan sonra ızgaranın durağı hâlâ son odaklanan 2:50", rovingOk(grid, env.chip(2, 50)));

  // Enter/Space/tıklama
  env.chip(2, 255).focus();
  check("Enter ve Space ızgara tarafından engellenmiyor (tarayıcının varsayılan etkinleştirmesi çalışsın)", env.key("Enter") === false && env.key(" ") === false && env.calls.length === 0);
  env.active().click();
  check("tıklama (Enter/Space'in varsayılanı) odaktaki ayeti seçiyor: goToAyah(2, 255) ve modal kapanıyor", env.calls.length === 1 && env.calls[0].join() === "goToAyah,2,255");
  env.flush();
  check("Sure modalı kapandı ve ızgaralar kapandı (closeAllAyahGrids)", env.state.openModalEl === null && els.surahModal.hidden === true && grid.hidden === true);
  env.open("surah-btn");
  check("modal yeniden açıldı: ızgara kapalı, Tab durakları Kapat + etkin sure satırı", env.tabStops().join() === "kapat,satır:3" && grid.hidden === true);
  env.toggle(2);
  check("ızgara yeniden açıldı: durak, son tıklanan 2:255 değil ilk düğme (2:1): seçili ayet yokken ızgara her açılışta başlangıç durağından başlıyor", rovingOk(grid, env.chip(2, 1)) && env.tabStops().join() === "kapat,ayet:2:1,satır:3");
}

// ---- 5b. Değiştiricili/işlenmeyen/tüketilmiş tuş, basılı tutma, pencere genişliği ----
{
  const env = makeEnv();
  const { els } = env;
  env.open("surah-btn");
  env.toggle(2);
  const grid = env.gridOf(2);
  env.chip(2, 50).focus();
  const keep = env.active();
  const bad = [];
  for (const k of ["Enter", " ", "a", "1", "Backspace", "Delete", "Insert", "ContextMenu", "F2", "Shift", "Control"]) if (env.key(k) || env.active() !== keep || !rovingOk(grid, keep)) bad.push(`işlenmeyen ${JSON.stringify(k)}`);
  for (const k of KEYS8) for (const m of KEYS_MODS) if (env.key(k, { [m]: true }) || env.active() !== keep || !rovingOk(grid, keep)) bad.push(`${m}+${k}`);
  checkAll("ızgara düğmesinde işlenmeyen tuşlar (Enter, Space, harf, rakam, Backspace, Delete, Insert, ContextMenu, F2, tek başına Shift/Control) ve değiştiricili tuşlar (Shift/Ctrl/Alt/Meta + 8 tuş = 32) YOK SAYILIYOR: olay engellenmiyor, odak ve durak yerinde (Alt+Sol = tarayıcıda geri gitmek için)", bad);
  const consume = (e) => e.preventDefault();
  els.surahModal.addEventListener("keydown", consume, true); // yakalama: ızgaranın dinleyicisinden ÖNCE çalışır
  const consumed = env.key("ArrowRight");
  els.surahModal.removeEventListener("keydown", consume, true);
  check("zaten engellenmiş (başka işleyicinin tükettiği) olay yok sayılıyor: odak yerinde", consumed === true && env.active() === keep);
  check("tüketme dinleyicisi kalkınca aynı tuş çalışıyor ve basılı tutma (repeat) gezintiyi sürdürüyor: 2:50 -> 2:51 -> 2:52", env.key("ArrowRight") === true && desc(env.active()) === "ayet:2:51" && env.key("ArrowRight", { repeat: true }) === true && desc(env.active()) === "ayet:2:52");

  // Pencere genişliği: her tuşta yeniden ölçülüyor (aynı düğmeler, farklı satır uzunlukları)
  const widths = [
    // [ızgara genişliği, tuş dizisi: [tuş, beklenen ayet]] -- elle hesaplanmış, 290 px: 6'lı satırlar (1-282), son satırda 4; 450 px: 10'lu satırlar (1-100), 9'lu (101-280), son satırda 6
    [290, [["Home", 1], ["PageDown", 61], ["ArrowDown", 67], ["End", 286], ["ArrowUp", 280], ["ArrowLeft", 279], ["ArrowRight", 280], ["Home", 1], ["ArrowDown", 7]]],
    [450, [["Home", 1], ["PageDown", 101], ["End", 286], ["ArrowUp", 277], ["ArrowDown", 286], ["Home", 1], ["PageDown", 101], ["ArrowUp", 91]]],
    [400, [["Home", 1], ["PageDown", 91], ["ArrowDown", 100], ["End", 286], ["ArrowUp", 278]]],
  ];
  const badW = [];
  for (const [w, seqW] of widths) {
    env.layout.width = w;
    env.chip(2, 1).focus();
    for (const [k, n] of seqW) {
      const prevented = env.key(k);
      if (!prevented || desc(env.active()) !== `ayet:2:${n}` || !rovingOk(grid, env.chip(2, n))) badW.push(`${w} px ${k}: ${desc(env.active())} (beklenen ayet:2:${n})`);
    }
  }
  checkAll("pencere genişliği değişince (290 -> 450 -> 400 px) aynı düğmelerde yerleşim her tuşta yeniden ölçülüyor: 290 px'te 6'lı, 450 px'te 10'lu/9'lu satırlar (elle hesaplanmış tuş dizileri)", badW);
  env.layout.width = 400;
}

// ---- 5c. Fâtiha: 7 düğme, tek satır (400 px) ve 6+1 (290 px) ----
{
  const env = makeEnv();
  env.open("surah-btn");
  env.toggle(1);
  const grid = env.gridOf(1);
  check("Fâtiha ızgarası: 7 düğme, tek tabindex=0 ilk düğmede", chipsOfGrid(grid).length === 7 && rovingOk(grid, env.chip(1, 1)) && env.tabStops().join() === "kapat,ayet:1:1,satır:3");
  const run = (label, start, seq) => {
    env.chip(1, start).focus();
    const bad = [];
    for (const [k, n] of seq) {
      const prevented = env.key(k);
      if (!prevented || desc(env.active()) !== `ayet:1:${n}` || !rovingOk(grid, env.chip(1, n))) bad.push(`${label} ${k}: ${desc(env.active())} (beklenen ayet:1:${n}, engellendi=${prevented})`);
    }
    return bad;
  };
  const one = run("400 px", 4, [["ArrowDown", 4], ["ArrowUp", 4], ["PageDown", 4], ["PageUp", 4], ["ArrowRight", 5], ["ArrowLeft", 4], ["End", 7], ["ArrowRight", 7], ["Home", 1], ["ArrowLeft", 1]]);
  checkAll("Fâtiha 400 px (tek görsel satır): Aşağı/Yukarı/PageDown/PageUp yerinde (olay yine de engelleniyor), Sağ/Sol +-1, Home/End uçlar", one);
  env.layout.width = 290;
  const two = run("290 px", 1, [["ArrowDown", 7], ["ArrowUp", 1], ["End", 7], ["Home", 1], ["PageDown", 7], ["PageUp", 1], ["ArrowDown", 7], ["ArrowLeft", 6], ["ArrowRight", 7], ["ArrowRight", 7]]);
  checkAll("Fâtiha 290 px (6 + 1 düğme): Aşağı alt satırdaki tek düğmeye (7), Yukarı 1'e (merkez en yakın), PageDown/PageUp satır sayısına kırpılıyor, Sağ satır sonunda alt satırın başına, Sol geri", two);
  env.layout.width = 400;
}

// ---- 5d. Seçili ayet: durak seçili ayette; ses oynarken gezen kullanıcının durağı kaçmıyor ----
{
  const env = makeEnv({ selectedAyah: { surah: 2, ayah: 255 } });
  const { els, state } = env;
  env.open("surah-btn");
  check("Sure modalı seçili ayetin (2:255) suresiyle açıldı: liste durağı satır:2", env.tabStops().join() === "kapat,satır:2");
  env.toggle(2);
  const grid = env.gridOf(2);
  const marked = () => chipsOfGrid(grid).filter((c) => c.getAttribute("aria-current") === "true").map(desc).join("/") || "yok";
  check("ızgara açılışında seçili ayet işaretli (2:255, aria-current) ve ızgaranın tek durağı da ONDA (önce 2:1); öteki 285 düğme -1", marked() === "ayet:2:255" && rovingOk(grid, env.chip(2, 255)) && env.chip(2, 255).classList.contains("active"));
  check("modalın Tab durakları: Kapat, satır:2, ızgaranın durağı 2:255", env.tabStops().join() === "kapat,satır:2,ayet:2:255");
  env.rowBtn(2).focus();
  env.key("ArrowRight");
  env.tab();
  check("açma düğmesinden Tab: doğrudan seçili ayet 2:255'e (önce 2:1'e, seçili ayete 254 Tab daha)", desc(env.active()) === "ayet:2:255");
  check("ok tuşları seçili ayetten başlıyor: Sağ 2:256, Sol 2:255", env.key("ArrowRight") === true && desc(env.active()) === "ayet:2:256" && env.key("ArrowLeft") === true && desc(env.active()) === "ayet:2:255");

  // Ses oynarken: gezen kullanıcı 2:10'da, seçili ayet 2:256'ya ilerliyor
  env.chip(2, 10).focus();
  state.selectedAyah = { surah: 2, ayah: 256 };
  env.api.syncAyahGridHighlight();
  check("ses ilerlerken (seçili ayet 2:256'ya geçti) gezen kullanıcının düğmesi (2:10) hem odakta hem durak kalıyor; işaret 256'ya taşındı ama durağı çalmıyor", desc(env.active()) === "ayet:2:10" && rovingOk(grid, env.chip(2, 10)) && marked() === "ayet:2:256" && env.chip(2, 256).getAttribute("tabindex") === "-1");
  check("modalın Tab durakları ızgaradan yalnızca odaktaki düğmeyi içeriyor (2:10)", env.tabStops().filter((s) => s.startsWith("ayet:")).join() === "ayet:2:10");
  env.expandBtn(2).focus();
  state.selectedAyah = { surah: 2, ayah: 257 };
  env.api.syncAyahGridHighlight();
  check("odak ızgaradan çıkınca bir sonraki ilerlemede durak seçili ayete (2:257) taşınıyor; eski durak 2:10 -1", marked() === "ayet:2:257" && rovingOk(grid, env.chip(2, 257)));
  env.tab();
  check("açma düğmesinden Tab: güncel seçili ayet 2:257", desc(env.active()) === "ayet:2:257");

  // Seçili ayet başka bir sureye geçiyor
  env.expandBtn(2).focus();
  state.selectedAyah = { surah: 3, ayah: 5 };
  env.api.syncAyahGridHighlight();
  check("seçili ayet başka sureye (3:5) geçince açık Bakara ızgarasında işaret kalkıyor ve durak ilk düğmeye (2:1) dönüyor", marked() === "yok" && chipsOfGrid(grid).every((c) => !c.classList.contains("active")) && rovingOk(grid, env.chip(2, 1)));
  env.toggle(3);
  const grid3 = env.gridOf(3);
  check("Âl-i İmrân ızgarası açıldı (Bakara kapandı): seçili 3:5 işaretli ve ızgaranın durağı ONDA; Tab durakları yalnızca bu ızgaradan bir düğme", grid.hidden === true && !grid3.hidden && rovingOk(grid3, env.chip(3, 5)) && env.tabStops().filter((s) => s.startsWith("ayet:")).join() === "ayet:3:5");
  state.selectedAyah = { surah: 2, ayah: 7 };
  env.api.syncAyahGridHighlight();
  check("seçili ayet 2:7: GİZLİ Bakara ızgarasında da işaret ve durak güncelleniyor (7); açık Âl-i İmrân ızgarasında işaret kalkıyor ve durak ilk düğmeye (3:1)", chipsOfGrid(grid).filter((c) => c.getAttribute("aria-current") === "true").map(desc).join() === "ayet:2:7" && rovingOk(grid, env.chip(2, 7)) && chipsOfGrid(grid3).every((c) => !c.hasAttribute("aria-current")) && rovingOk(grid3, env.chip(3, 1)));
  env.toggle(2);
  check("Bakara yeniden açıldı (Âl-i İmrân kapandı): durak seçili 2:7'de; Tab durakları yalnızca 2:7", !grid.hidden && grid3.hidden === true && rovingOk(grid, env.chip(2, 7)) && env.tabStops().filter((s) => s.startsWith("ayet:")).join() === "ayet:2:7");
  state.selectedAyah = null;
  const before = chipsOfGrid(grid).map((c) => c.getAttribute("tabindex")).join();
  env.api.syncAyahGridHighlight();
  check("seçili ayet yokken (null) syncAyahGridHighlight hiçbir şeye dokunmuyor", chipsOfGrid(grid).map((c) => c.getAttribute("tabindex")).join() === before && marked() === "ayet:2:7");

  // Yeniden açılış: gezilen son düğme değil, seçili ayet (yoksa ilk düğme)
  state.selectedAyah = { surah: 2, ayah: 255 };
  env.api.syncAyahGridHighlight();
  env.chip(2, 200).focus();
  check("2:200'e gezildi: durak 200", rovingOk(grid, env.chip(2, 200)));
  env.closeEsc();
  check("Escape modalı kapattı ve ızgaraları kapattı", state.openModalEl === null && grid.hidden === true);
  env.open("surah-btn");
  check("modal yeniden açıldı: ızgara kapalı, Tab durakları Kapat + seçili ayetin suresi (2) satırı", env.tabStops().join() === "kapat,satır:2");
  env.toggle(2);
  check("ızgara yeniden açıldı: durak gezilen son düğme (2:200) değil seçili ayet (2:255)", rovingOk(grid, env.chip(2, 255)) && env.tabStops().filter((s) => s.startsWith("ayet:")).join() === "ayet:2:255");
}

// ---- (6) Rastgele işlem dizisi x bağımsız model ----
// Tek ortam, 8 tohum x 70 işlem: ayet düğmesinde tuş (değiştiricili/işlenmeyen dahil), düğmeye odaklama, pencere genişliği, seçili ayet
// değişimi (ses oynarken/sayfada dokunarak), ızgara açma/kapama (açma düğmesine GERÇEK tıklama; accordion), odağın ızgaradan çıkması,
// modalın Escape ile kapanıp yeniden açılması. Model: odak, her kurulu ızgaranın durağı (odaktaki > seçili > ilk düğme), işaretler,
// hangi ızgaranın açık olduğu; tuş hedefi modelChip (düzleştirilmiş liste, sıralamaya dayalı) + akış modeli ile hesaplanıyor.
{
  const env = makeEnv();
  const { els, state, d } = env;
  env.open("surah-btn");
  const SURAHS = [1, 2, 3, 36, 55, 108, 114]; // 7, 286, 200, 83, 78, 3, 6 ayet
  const WIDTHS = [290, 400, 450];
  const SEEDS = [11, 23, 37, 41, 59, 61, 73, 89];
  const STEPS = 70;
  const UNHANDLED = ["Enter", " ", "a", "1", "Backspace", "Delete", "F2"];
  const count = (s) => surahs[String(s)].versesCount;
  const M = { built: new Set(), open: null, stop: {}, focus: null, sel: null };
  const bad = [];
  const tally = { handled: 0, moved: 0, ignored: 0, focus: 0, resize: 0, select: 0, selFocused: 0, toggle: 0, away: 0, reopen: 0 };
  let steps = 0;
  const sortedBuilt = () => [...M.built].sort((a, b) => a - b).join();
  // syncGridStop'un modeli: odak bu ızgaranın bir düğmesindeyse o, değilse seçili ayet (bu surede), o da yoksa ilk düğme
  const mSync = (g) => {
    M.stop[g] = M.focus && M.focus.s === g ? M.focus.a : M.sel && M.sel.s === g ? M.sel.a : 1;
  };
  const moveTarget = (key, s, width, n) => {
    const { nums, centers } = rowsOfBoxes(layoutFor(count(s), width));
    const at = where(nums, n);
    const to = modelChip(key, at.row, at.col, centers);
    return nums[to.row][to.col];
  };
  function verify(label) {
    const bd = (m) => bad.push(`${label}: ${m}`);
    const builtDom = [...els.surahList.querySelectorAll(".ayah-grid[data-built]")].map((g) => parseInt(g.dataset.surah, 10)).sort((a, b) => a - b).join();
    if (builtDom !== sortedBuilt()) bd(`kurulu ızgaralar ${builtDom} != ${sortedBuilt()}`);
    for (const g of M.built) {
      const grid = env.gridOf(g);
      if (grid.hidden !== (M.open !== g)) bd(`ızgara ${g}: gizli=${grid.hidden}, açık olan=${M.open}`);
      if (!rovingOk(grid, env.chip(g, M.stop[g]))) bd(`ızgara ${g}: durak ${rovingWho(grid)} != ayet:${g}:${M.stop[g]}`);
      const cur = chipsOfGrid(grid).filter((c) => c.getAttribute("aria-current") === "true").map(desc).join();
      const act = chipsOfGrid(grid).filter((c) => c.classList.contains("active")).map(desc).join();
      const want = M.sel && M.sel.s === g ? `ayet:${g}:${M.sel.a}` : "";
      if (cur !== want || act !== want) bd(`ızgara ${g}: aria-current=${cur || "yok"} active=${act || "yok"} != ${want || "yok"}`);
    }
    const a = d.activeElement;
    const onChip = !!(a && a.classList && a.classList.contains("ayah-chip"));
    const wantFocus = M.focus ? `ayet:${M.focus.s}:${M.focus.a}` : null;
    if (wantFocus ? desc(a) !== wantFocus : onChip) bd(`odak ${desc(a)} != ${wantFocus || "ayet dışı"}`);
    const stops = env.tabStops().filter((x) => x.startsWith("ayet:")).join();
    const wantStops = M.open ? `ayet:${M.open}:${M.stop[M.open]}` : "";
    if (stops !== wantStops) bd(`Tab durakları (ayet) ${stops || "yok"} != ${wantStops || "yok"}`);
    const listStops = els.surahList.querySelectorAll('.surah-row [tabindex="0"]').length;
    if (listStops !== 1) bd(`listenin durağı ${listStops} (1 olmalı)`);
  }

  for (const seed of SEEDS) {
    const rnd = mulberry32(seed);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    for (let i = 0; i < STEPS; i++) {
      steps++;
      const roll = rnd();
      let action = roll < 0.4 ? "key" : roll < 0.52 ? "focus" : roll < 0.58 ? "resize" : roll < 0.72 ? "select" : roll < 0.88 ? "toggle" : roll < 0.95 ? "away" : "reopen";
      if (action === "key" && !M.focus) action = M.open ? "focus" : "toggle"; // odakta düğme yoksa önce bir düğmeye odaklan (gerekirse ızgara aç)
      if (action === "focus" && !M.open) action = "toggle";
      let label = `#${seed}.${i} ${action}`;
      if (action === "key") {
        // ayet düğmesinde tuş
        const { s, a } = M.focus;
        const mod = rnd() < 0.15 ? pick(KEYS_MODS) : null;
        const key = rnd() < 0.8 ? pick(KEYS8) : pick(UNHANDLED);
        const handled = !mod && KEYS8.includes(key);
        label += ` ayet:${s}:${a} ${mod ? mod + "+" : ""}${JSON.stringify(key)} @${env.layout.width}`;
        const to = handled ? moveTarget(key, s, env.layout.width, a) : a;
        const prevented = env.key(key, mod ? { [mod]: true } : {});
        if (prevented !== handled) bad.push(`${label}: engellendi=${prevented} (beklenen ${handled})`);
        if (handled) {
          M.focus = { s, a: to };
          M.stop[s] = to;
          tally.handled++;
          if (to !== a) tally.moved++;
        } else tally.ignored++;
      } else if (action === "focus") {
        // düğmeye odaklama (Tab/fare/programatik)
        const s = M.open;
        const a = 1 + Math.floor(rnd() * count(s));
        label += ` odak ayet:${s}:${a}`;
        env.chip(s, a).focus();
        M.focus = { s, a };
        M.stop[s] = a;
        tally.focus++;
      } else if (action === "resize") {
        // pencere genişliği
        const w = pick(WIDTHS);
        label += ` genişlik ${w}`;
        env.layout.width = w;
        tally.resize++;
      } else if (action === "select") {
        // seçili ayet değişiyor (ses oynarken, sayfada dokunarak, başka modaldan)
        const s = M.open && rnd() < 0.7 ? M.open : pick(SURAHS);
        const a = 1 + Math.floor(rnd() * count(s));
        label += ` seçili ${s}:${a}`;
        if (M.focus && M.focus.s === s) tally.selFocused++; // ses oynarken gezen kullanıcı: odaktaki düğme durak kalmalı
        state.selectedAyah = { surah: s, ayah: a };
        env.api.syncAyahGridHighlight();
        M.sel = { s, a };
        for (const g of M.built) mSync(g);
        tally.select++;
      } else if (action === "toggle") {
        // ızgara aç/kapat (açma düğmesine GERÇEK tıklama); odak ızgaradaysa önce alınıyor (gizlenen ızgarada odak kalmasın)
        const s = M.open && rnd() < 0.4 ? M.open : pick(SURAHS);
        const closing = M.open === s;
        label += ` ızgara ${s} (${closing ? "kapat" : "aç"})`;
        if (d.activeElement && d.activeElement.classList && d.activeElement.classList.contains("ayah-chip")) {
          d.activeElement.blur();
          M.focus = null;
        }
        env.toggle(s);
        if (closing) M.open = null;
        else {
          M.built.add(s);
          M.open = s;
          mSync(s);
        }
        tally.toggle++;
      } else if (action === "away") {
        // odak ızgaradan çıkıyor (listenin bir açma düğmesine)
        const s = pick(SURAHS);
        label += ` odak aç:${s}`;
        env.expandBtn(s).focus();
        M.focus = null;
        tally.away++;
      } else {
        // modal Escape ile kapanıp yeniden açılıyor: tüm ızgaralar kapanır, duraklar sıfırlanmaz (yeniden açılışta kurulur)
        label += " modal kapat/aç";
        env.closeEsc();
        env.open("surah-btn");
        M.open = null;
        M.focus = null;
        tally.reopen++;
      }
      verify(label);
    }
  }
  const t = tally;
  checkAll(`rastgele dizi: ${SEEDS.length} tohum x ${STEPS} işlem (ayet düğmesinde tuş, odaklama, genişlik, seçili ayet, ızgara açma/kapama, odağın ızgaradan çıkması, modalı kapatıp açma) x bağımsız model: her adımdan sonra kurulu ızgaraların tek tabindex=0'ı (odaktaki > seçili > ilk düğme), aria-current/.active, açık ızgara, odak, tuşun engellenip engellenmediği, modalın ızgaradan Tab durağı ve listenin tek durağı modelle birebir (${steps} adım; ${t.handled} işlenen tuş, ${t.ignored} yok sayılan, ${t.focus} odaklama, ${t.resize} genişlik, ${t.select} seçili ayet, ${t.toggle} açma/kapama, ${t.away} odak çıkışı, ${t.reopen} modal yeniden açılışı)`, bad);
  check(`rastgele dizi yeterince çeşitli (işlenen tuş > 60, odağı gerçekten taşıyan > 35, yok sayılan > 25, odaklama > 70, genişlik > 20, seçili ayet > 45, odak ızgaradayken seçili ayet değişimi > 15, açma/kapama > 90, modal yeniden açılışı > 12, kurulan ızgara >= 6; bulunan ${t.handled}/${t.moved}/${t.ignored}/${t.focus}/${t.resize}/${t.select}/${t.selFocused}/${t.toggle}/${t.reopen}/${M.built.size})`, t.handled > 60 && t.moved > 35 && t.ignored > 25 && t.focus > 70 && t.resize > 20 && t.select > 45 && t.selFocused > 15 && t.toggle > 90 && t.reopen > 12 && M.built.size >= 6);
}

check(`jsdom: olay dinleyicilerinde yakalanmamış hata yok (bulunan: ${jsdomErrors.length}${jsdomErrors.length ? " -- " + jsdomErrors.slice(0, 2).join(" | ") : ""})`, jsdomErrors.length === 0);

if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All checks passed (izgara_gezintisi: ayet düğmeleri ızgarası, tek Tab durağı + iki boyutlu ok tuşu gezintisi -- CSS'ten türetilen düzen modeli x Chromium satır uzunlukları, targetChip (elle hesaplanmış tablolar + tüm küçük yerleşimler + rastgele x bağımsız model), yalıtılmış setupGridNav/syncGridStop, GERÇEK app.js işlevleri x GERÇEK modal-odak.js/liste-gezintisi.js/index.html/data kablolaması, 8 tohumlu rastgele dizi x bağımsız model).");
