// Ezber aralık alanları (Başlangıç/Bitiş ayeti): geçersiz aralık bir kez gönderilince form kilitleniyordu. Regresyon kontrolü.
//
// Neden var: readEzberRange geçersiz aralığı Bitiş alanına setCustomValidity ile yazıyor ve iletiyi yalnızca KENDİSİ (gönderme
// işleyicisi) ve Sure seçimi (setEzberSurah, autofillRange) siliyordu. Tarayıcının kendi doğrulaması ise gönderme olayından ÖNCE
// çalışıyor: bayat ileti duruyorsa alan geçersiz sayılıyor, uyarı gösteriliyor ve gönderme işleyicisi hiç çalışmıyor (yani iletiyi
// yeniden hesaplayacak tek yer devreye girmiyor). Gerçek Chromium'da (430 px, sayfa 50, gerçek tuş olayları; üç sekmede de aynı),
// düzeltmeden ÖNCE: 5-2 gönder -> ileti "Bitiş ayeti, başlangıç ayetinden küçük olamaz."; Bitiş'i 7 yap (yazarak, Yukarı okla ya da
// Başlangıç'ı 1 yaparak) -> alan hâlâ geçersiz, ileti hâlâ aynı; Uygula ya da Enter -> modal açık kalıyor, ayar kaydedilmiyor, oturum
// başlamıyor. Esc ile kapatıp yeniden açmak da (kayıtlı/varsayılan geçerli aralıkla bile) kurtarmıyordu; yalnızca Sure'yi yeniden
// seçmek (aralığı sıfırlıyor) çalışıyordu. İleti de yanlıştı: 5-999 için ("Bu sure 200 ayetten oluşuyor." olmalıydı) eski iletiyi
// gösteriyordu.
//
// Düzeltme: clearEzberRangeError(target) iletiyi siliyor; Başlangıç/Bitiş `input` olayında (üç sekme x iki alan), modal açılırken (üç
// sekme) ve Sure seçilince (setEzberSurah autofillRange) çağrılıyor. readEzberRange iletiyi her gönderimde baştan hesaplamaya devam
// ediyor.
//
// Burada kontrol edilenler:
//   (1) kaynak: yardımcı işlev, üç çağrı yeri, setCustomValidity'nin tek yazıcısı (readEzberRange);
//   (2) index.html: altı alan (3 sekme x Başlangıç/Bitiş) min=1 required ve kendi formunun içinde, formlar novalidate değil (tarayıcı
//       doğrulaması çalışıyor: hatanın önkoşulu);
//   (3) davranış: GERÇEK setupEzberModal + readEzberRange + openModal/closeModal (modal-odak.js ile) + <ezber-picker> bloğu x GERÇEK
//       index.html x GERÇEK data/surahs.json, jsdom'da; jsdom da tarayıcı doğrulamasını gönderme olayından önce çalıştırıyor, yani
//       hata burada da yeniden üretiliyor: Uygula düğmesine tıklama (ve Enter'a denk gelen requestSubmit);
//   (4) 24 tohumlu rastgele işlem dizisi x bağımsız bir model.
//
// SINIR: jsdom'da doğrulama balonu yok (uyarı yalnızca validationMessage/validity olarak sınanıyor), gerçek tuş/odak yok; gerçek
// Chromium ölçümü README'de. Gerçek ekran okuyucu (NVDA/JAWS/VoiceOver/TalkBack) testinin YERİNİ TUTMAZ (README kontrol listesi,
// madde 24). Firefox ve Safari'de denenmedi.
//
//   node ezber_aralik_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM, VirtualConsole } from "jsdom";
import { createModalFocus } from "../js/modal-odak.js";
import { setupTablist } from "../js/sekme-gezintisi.js";
import { setupListNav, syncListStop, listRows } from "../js/liste-gezintisi.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const html = readText("index.html");
const appSource = readText("js", "app.js");
const appCode = appSource.replace(/^\s*\/\/.*$/gm, ""); // tam satır yorumları olmadan
const surahs = JSON.parse(readText("data", "surahs.json"));

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
function bodyOf(src, name) {
  const m = new RegExp(`function ${name}\\(`).exec(src);
  if (!m) return null;
  const span = braceSpan(src, src.indexOf(")", m.index));
  return span ? src.slice(span.open + 1, span.close) : null;
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

// -- (1) Kaynak ----------------------------------------------------------------------------------------------
const BLOCK = /\/\/ <ezber-picker>([\s\S]*?)\/\/ <\/ezber-picker>/.exec(appSource);
const MODAL_START = appSource.indexOf("const modalFocus = createModalFocus(");
const MODAL_END = appSource.indexOf("function setupModals()");
const RECITERS_SRC = constObjSource("RECITERS");
const TABS_SRC = constLine("EZBER_TABS");
const KEY_SRC = constLine("EZBER_SETTINGS_KEY");
const SW = {
  switchEzberTab: fnSource("switchEzberTab"),
  setActiveModalItem: fnSource("setActiveModalItem"),
  readEzberRange: fnSource("readEzberRange"),
  loadEzberSettings: fnSource("loadEzberSettings"),
  saveEzberSettings: fnSource("saveEzberSettings"),
  setupEzberModal: fnSource("setupEzberModal"),
};
check("app.js: <ezber-picker> bloğu, modal odak bloğu, RECITERS, EZBER_TABS, EZBER_SETTINGS_KEY ve gerekli işlevler kaynaktan çıkarıldı", !!BLOCK && MODAL_START > 0 && MODAL_END > MODAL_START && !!RECITERS_SRC && !!TABS_SRC && !!KEY_SRC && Object.values(SW).every(Boolean));
if (!BLOCK || !(MODAL_START > 0 && MODAL_END > MODAL_START) || !RECITERS_SRC || !TABS_SRC || !KEY_SRC || !Object.values(SW).every(Boolean)) {
  console.error("app.js'ten gerekli kaynak parçaları çıkarılamadı");
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}

const TABS = ["dinle", "oku", "yaz"];
{
  const helper = bodyOf(BLOCK[1], "clearEzberRangeError");
  check("app.js: clearEzberRangeError(target) <ezber-picker> bloğunun içinde (setEzberSurah onu çağırıyor, test aynı bloğu çalıştırıyor)", helper !== null && /function clearEzberRangeError\(target\)/.test(BLOCK[1]));
  check("app.js: clearEzberRangeError hem Başlangıç hem Bitiş alanının özel iletisini boş dizgeyle siliyor (hedef sekmenin alanları)", helper !== null && /getElementById\(`ezber-\$\{target\}-from`\)\.setCustomValidity\(""\)/.test(helper) && /getElementById\(`ezber-\$\{target\}-to`\)\.setCustomValidity\(""\)/.test(helper) && (helper.match(/setCustomValidity\(/g) || []).length === 2);
  const surahFn = bodyOf(BLOCK[1], "setEzberSurah");
  check("app.js: setEzberSurah (autofillRange) iletiyi clearEzberRangeError ile siliyor (aralığı sıfırlayan dalda)", surahFn !== null && /if \(autofillRange\) \{[\s\S]*clearEzberRangeError\(target\);[\s\S]*\}/.test(surahFn) && !/setCustomValidity/.test(surahFn));
  const rer = bodyOf(appSource, "readEzberRange");
  check("app.js: readEzberRange iletiyi her çağrıda baştan hesaplıyor (önce siliyor, sonra yalnızca Bitiş alanına yazıyor) ve iletiyi başka yerde silmiyor", rer !== null && /toEl\.setCustomValidity\(""\);\s*if \(from > to\) \{\s*toEl\.setCustomValidity\("Bitiş ayeti, başlangıç ayetinden küçük olamaz\."\);\s*\} else if \(versesCount && \(from < 1 \|\| to > versesCount\)\) \{\s*toEl\.setCustomValidity\(`Bu sure \$\{versesCount\} ayetten oluşuyor\.`\);\s*\}/.test(rer) && !/fromEl\.setCustomValidity/.test(rer));
  check("app.js: setCustomValidity yalnızca 5 yerde (yardımcıda 2 silme, readEzberRange'de 1 silme + 2 yazma): başka bir yerde yazılan ileti temizlenmeyebilir", (appCode.match(/setCustomValidity\(/g) || []).length === 5);
  const setup = SW.setupEzberModal.replace(/^\s*\/\/.*$/gm, ""); // yorum satırları sayıma karışmasın
  check("app.js: Başlangıç ve Bitiş alanlarının `input` olayı (3 sekme x 2 alan, tek döngü) clearEzberRangeError(target) çağırıyor", /for \(const target of EZBER_TABS\) \{\s*for \(const field of \["from", "to"\]\) \{\s*document\.getElementById\(`ezber-\$\{target\}-\$\{field\}`\)\.addEventListener\("input", \(\) => clearEzberRangeError\(target\)\);\s*\}\s*\}/.test(setup) && (setup.match(/clearEzberRangeError/g) || []).length === 2);
  const onOpenAt = setup.indexOf("onOpen: () => {");
  const clearAt = setup.indexOf("for (const target of EZBER_TABS) clearEzberRangeError(target);");
  check("app.js: modal açılırken (onOpen) üç sekmenin iletisi siliniyor (EZBER_TABS döngüsüyle)", onOpenAt > 0 && clearAt > onOpenAt);
}

// -- (2) index.html -------------------------------------------------------------------------------------------
{
  const D = new JSDOM(html).window.document;
  for (const t of TABS) {
    const form = D.getElementById(`ezber-${t}-form`);
    check(`index.html (${t}): form novalidate değil (tarayıcı doğrulaması gönderme olayından önce çalışıyor: hatanın önkoşulu)`, !!form && !form.hasAttribute("novalidate"));
    for (const f of ["from", "to"]) {
      const el = D.getElementById(`ezber-${t}-${f}`);
      check(`index.html (${t}): #ezber-${t}-${f} type=number min=1 required ve kendi formunun içinde`, !!el && el.type === "number" && el.getAttribute("min") === "1" && el.required && form.contains(el));
    }
    check(`index.html (${t}): form tek gönderme düğmesi (.ezber-apply-btn, type=submit) içeriyor`, form.querySelectorAll('button[type="submit"]').length === 1 && !!form.querySelector(".ezber-apply-btn"));
  }
}

// -- (3) Davranış (jsdom) -------------------------------------------------------------------------------------
const MODAL_IDS = ["surah-modal", "juz-modal", "page-modal", "ezber-modal", "surah-info-modal", "topics-modal", "arama-modal"];
const NAMES = ["surahModal", "juzModal", "pageModal", "ezberModal", "surahInfoModal", "topicsModal", "aramaModal"];
const KEY = "quran-reader-ezber-v1";
const FALLBACK_SURAH = 3; // state.pageToSurah[50]
const versesOf = (n) => surahs[String(n)].versesCount;
const MSG_ORDER = "Bitiş ayeti, başlangıç ayetinden küçük olamaz.";
const msgCount = (n) => `Bu sure ${versesOf(n)} ayetten oluşuyor.`;
const START = { dinle: "startEzberPlayback", oku: "startEzberOku", yaz: "startEzberYaz" };

// jsdom, olay dinleyicisinde fırlayan yakalanmamış hatayı yutup konsola yazıyor: burada toplanıyor ve sonda sıfır olmalı
const jsdomErrors = [];
function makeEnv({ saved = null, selectedAyah = null } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => jsdomErrors.push(String((e && e.detail && e.detail.message) || (e && e.message) || e).slice(0, 140)));
  const dom = new JSDOM(html, { pretendToBeVisual: true, url: "http://localhost/", virtualConsole });
  const win = dom.window;
  const d = win.document;
  if (saved) win.localStorage.setItem(KEY, JSON.stringify(saved));
  const els = {
    modalBackdrop: d.getElementById("modal-backdrop"),
    ezberTabs: d.getElementById("ezber-tabs"),
    ezberDinleForm: d.getElementById("ezber-dinle-form"),
    ezberReciter: d.getElementById("ezber-dinle-reciter"),
    ezberRepeat: d.getElementById("ezber-repeat"),
    ezberRepeatAll: d.getElementById("ezber-repeat-all"),
    ezberOkuForm: d.getElementById("ezber-oku-form"),
    ezberYazForm: d.getElementById("ezber-yaz-form"),
    ezberBtn: d.getElementById("ezber-btn"),
  };
  NAMES.forEach((n, i) => (els[n] = d.getElementById(MODAL_IDS[i])));
  const state = { openModalEl: null, surahs, ezberStudy: null, selectedAyah, pageToSurah: { 50: FALLBACK_SURAH }, currentPage: 50 };
  const calls = [];
  const timers = [];
  const rafQ = [];
  let now = 0;
  win.Element.prototype.scrollIntoView = function () {};
  const code = [TABS_SRC, KEY_SRC, RECITERS_SRC, SW.switchEzberTab, SW.setActiveModalItem, SW.readEzberRange, SW.loadEzberSettings, SW.saveEzberSettings, appSource.slice(MODAL_START, MODAL_END), BLOCK[1], SW.setupEzberModal,
    "return { openModal, closeModal, closeAllModals, setupEzberModal, switchEzberTab, readEzberRange };"].join("\n");
  const api = new Function(
    "els", "state", "document", "localStorage", "createModalFocus", "setupTablist", "setupListNav", "syncListStop", "listRows", "requestAnimationFrame", "setTimeout",
    "closeAllAyahGrids", "closeSurahInfoDetail", "resetTopicsModal", "switchJuzTab",
    "startEzberPlayback", "startEzberOku", "startEzberYaz", "endEzberStudy",
    code
  )(
    els, state, d, win.localStorage, createModalFocus, setupTablist, setupListNav, syncListStop, listRows,
    (fn) => rafQ.push(fn),
    (fn, ms) => timers.push({ fn, at: now + ms }),
    () => {}, () => {}, () => {}, () => {},
    (...a) => calls.push(["startEzberPlayback", ...a]),
    (...a) => calls.push(["startEzberOku", ...a]),
    (...a) => calls.push(["startEzberYaz", ...a]),
    () => calls.push(["endEzberStudy"])
  );
  api.setupEzberModal();
  const $ = (id) => d.getElementById(id);
  const fixup = () => {
    const a = d.activeElement;
    if (a && a !== d.body && a.closest("[hidden]")) a.blur();
  };
  const advance = (ms) => {
    const target = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      if (!timers.length || timers[0].at > target) break;
      const t = timers.shift();
      now = t.at;
      t.fn();
    }
    now = target;
  };
  const flush = () => rafQ.splice(0).forEach((f) => f());
  const h = {
    d, win, els, state, api, calls, $, advance,
    openEzber() {
      els.ezberBtn.focus();
      els.ezberBtn.click();
      flush();
      fixup();
    },
    closeAll() {
      api.closeAllModals();
      advance(400);
      flush();
      fixup();
    },
    press(el) {
      el.focus();
      el.click();
      fixup();
    },
    tab(t) {
      h.press($(`ezber-tab-${t}`));
    },
    isOpen: () => state.openModalEl === els.ezberModal && !els.ezberModal.hidden,
    // Kullanıcı gibi yazma: odak, değer, `input` olayı (sayı oklarıyla artırma/azaltma, yapıştırma ve silme de bunu üretir)
    type(t, field, value) {
      const el = $(`ezber-${t}-${field}`);
      el.focus();
      el.value = String(value);
      el.dispatchEvent(new win.Event("input", { bubbles: true }));
    },
    // Uygula'ya tıklama: jsdom da tarayıcı doğrulamasını gönderme olayından ÖNCE çalıştırıyor (reportValidity; geçersizse olay yok)
    submit(t) {
      $(`ezber-${t}-form`).querySelector(".ezber-apply-btn").click();
      advance(400);
      flush();
      fixup();
    },
    started: (t) => calls.filter((c) => c[0] === START[t]),
    to: (t) => $(`ezber-${t}-to`),
    from: (t) => $(`ezber-${t}-from`),
    err: (t) => ({ to: $(`ezber-${t}-to`).validity.customError, from: $(`ezber-${t}-from`).validity.customError, msg: $(`ezber-${t}-to`).validationMessage }),
    stored: () => JSON.parse(win.localStorage.getItem(KEY) || "{}"),
    // Uygula'dan sonra beklenen oturum bağımsızlarının biçimi: Dinle (kârî, sure, baş, son, tekrar, tekrar-hepsi); Oku/Yaz (sure, baş, son)
    args: (t, surah, from, to) => (t === "dinle" ? [START[t], "husary", surah, from, to, 1, 1] : [START[t], surah, from, to]),
  };
  return h;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 3a) temel: geçerli aralık hemen başlıyor (tarayıcı doğrulaması ve işleyici engel olmuyor)
for (const t of TABS) {
  const h = makeEnv();
  h.openEzber();
  if (t !== "dinle") h.tab(t);
  h.type(t, "from", 1);
  h.type(t, "to", 3);
  h.submit(t);
  check(`temel (${t}): geçerli 1-3 gönderilince oturum tam bir kez, doğru bağımsız değişkenlerle başlıyor, ayar kaydediliyor, modal kapanıyor`, h.started(t).length === 1 && same(h.started(t)[0], h.args(t, 3, 1, 3)) && h.stored()[t] && h.stored()[t].from === 1 && h.stored()[t].to === 3 && !h.isOpen());
}

// 3b) hatanın kendisi ve düzeltmesi: 5-2 gönder, Bitiş'i yazarak düzelt
for (const t of TABS) {
  const h = makeEnv();
  h.openEzber();
  if (t !== "dinle") h.tab(t);
  h.type(t, "from", 5);
  h.type(t, "to", 2);
  check(`yazarak düzelt (${t}): geçersiz aralık yazılınca henüz ileti yok (ileti yalnızca gönderince yazılıyor)`, !h.err(t).to && h.to(t).validity.valid);
  h.submit(t);
  check(`yazarak düzelt (${t}): 5-2 gönderilince oturum yok, modal açık, Bitiş alanında özel ileti`, h.started(t).length === 0 && h.isOpen() && h.err(t).to && h.err(t).msg === MSG_ORDER && h.stored()[t] === undefined);
  h.type(t, "to", 7);
  check(`yazarak düzelt (${t}): Bitiş 7 yazılınca ileti siliniyor, alan geçerli (5-7)`, !h.err(t).to && !h.err(t).from && h.to(t).validity.valid && h.err(t).msg === "");
  h.submit(t);
  check(`yazarak düzelt (${t}): yeniden gönderince oturum tam bir kez (Sure 3, 5-7) başlıyor, ayar kaydediliyor, modal kapanıyor`, h.started(t).length === 1 && same(h.started(t)[0], h.args(t, 3, 5, 7)) && h.stored()[t].from === 5 && h.stored()[t].to === 7 && !h.isOpen());
  check(`yazarak düzelt (${t}): başarılı gönderimden sonra Bitiş alanında bayat ileti kalmıyor`, !h.err(t).to);
}

// 3c) Başlangıç'ı düzeltmek de iletiyi siliyor (ileti Bitiş'te, düzeltme Başlangıç'ta)
for (const t of TABS) {
  const h = makeEnv();
  h.openEzber();
  if (t !== "dinle") h.tab(t);
  h.type(t, "from", 5);
  h.type(t, "to", 2);
  h.submit(t);
  check(`Başlangıç'ı düzelt (${t}): 5-2 engellendi`, h.started(t).length === 0 && h.err(t).to);
  h.type(t, "from", 1);
  check(`Başlangıç'ı düzelt (${t}): Başlangıç 1 yazılınca (1-2) ileti siliniyor`, !h.err(t).to && h.to(t).validity.valid);
  h.submit(t);
  check(`Başlangıç'ı düzelt (${t}): yeniden gönderince oturum (Sure 3, 1-2) başlıyor`, h.started(t).length === 1 && same(h.started(t)[0], h.args(t, 3, 1, 2)));
}

// 3d) ileti güncel: ikinci geçersizlikte eski ileti değil yenisi gösteriliyor
for (const t of TABS) {
  const h = makeEnv();
  h.openEzber();
  if (t !== "dinle") h.tab(t);
  h.type(t, "from", 5);
  h.type(t, "to", 2);
  h.submit(t);
  check(`ileti güncel (${t}): ilk ileti "başlangıçtan küçük"`, h.err(t).msg === MSG_ORDER);
  h.type(t, "to", 999);
  h.submit(t);
  check(`ileti güncel (${t}): 5-999 gönderilince ileti "Bu sure 200 ayetten oluşuyor." (eski ileti değil), oturum yok`, h.err(t).msg === msgCount(3) && h.started(t).length === 0 && h.isOpen());
  h.type(t, "to", 1);
  h.submit(t);
  check(`ileti güncel (${t}): 5-1 (yine geçersiz) gönderilince ileti yeniden "başlangıçtan küçük", oturum yok`, h.err(t).msg === MSG_ORDER && h.started(t).length === 0);
  h.type(t, "to", 8);
  h.submit(t);
  check(`ileti güncel (${t}): 5-8 gönderilince oturum başlıyor`, h.started(t).length === 1 && same(h.started(t)[0], h.args(t, 3, 5, 8)));
}

// 3e) kapat, yeniden aç: bayat ileti kalmıyor; kayıtlı ve varsayılan değerlerle
for (const t of TABS) {
  const h = makeEnv();
  h.openEzber();
  if (t !== "dinle") h.tab(t);
  h.type(t, "from", 5);
  h.type(t, "to", 2);
  h.submit(t);
  check(`yeniden aç (${t}): 5-2 engellendi`, h.err(t).to && h.started(t).length === 0);
  h.closeAll();
  h.openEzber();
  if (t !== "dinle") h.tab(t);
  check(`yeniden aç (${t}): yeniden açılışta üç sekmede de ileti yok, alanlar varsayılan (1-1)`, TABS.every((u) => !h.err(u).to && !h.err(u).from) && h.from(t).value === "1" && h.to(t).value === "1");
  h.submit(t);
  check(`yeniden aç (${t}): yeniden açılan formda Uygula çalışıyor (Sure 3, 1-1)`, h.started(t).length === 1 && same(h.started(t)[0], h.args(t, 3, 1, 1)));
}
{
  // kayıtlı ayarlarla yeniden açılış; seçili ayet varsayılanı
  for (const t of TABS) {
    const saved = { dinle: { reciter: "husary", surah: 2, from: 3, to: 9, repeat: 1, repeatAll: 1 }, oku: { surah: 2, from: 3, to: 9 }, yaz: { surah: 2, from: 3, to: 9 } };
    const h = makeEnv({ saved });
    h.openEzber();
    if (t !== "dinle") h.tab(t);
    h.type(t, "from", 7);
    h.type(t, "to", 4);
    h.submit(t);
    check(`yeniden aç, kayıtlı ayarlı (${t}): 7-4 engellendi`, h.err(t).to && h.started(t).length === 0);
    h.closeAll();
    h.openEzber();
    if (t !== "dinle") h.tab(t);
    check(`yeniden aç, kayıtlı ayarlı (${t}): kayıtlı aralık (Sure 2, 3-9) geri geldi, ileti yok`, h.from(t).value === "3" && h.to(t).value === "9" && !h.err(t).to);
    h.submit(t);
    check(`yeniden aç, kayıtlı ayarlı (${t}): Uygula çalışıyor (Sure 2, 3-9)`, h.started(t).length === 1 && same(h.started(t)[0], h.args(t, 2, 3, 9)));
  }
  const h = makeEnv({ selectedAyah: { surah: 2, ayah: 5 } });
  h.openEzber();
  h.type("dinle", "from", 9);
  h.type("dinle", "to", 1);
  h.submit("dinle");
  h.closeAll();
  h.openEzber();
  check("yeniden aç, seçili ayetle (Sure 2, ayet 5): seçili ayet aralığı geri geldi, ileti yok", h.from("dinle").value === "5" && h.to("dinle").value === "5" && !h.err("dinle").to);
}

// 3f) Sure'yi yeniden seçmek (eski çalışan yol) hâlâ çalışıyor
for (const t of TABS) {
  const h = makeEnv();
  h.openEzber();
  if (t !== "dinle") h.tab(t);
  h.type(t, "from", 5);
  h.type(t, "to", 2);
  h.submit(t);
  h.press(h.$(`ezber-${t}-surah-btn`));
  h.press(h.$("ezber-surah-picker-list").querySelector('.modal-item[data-surah="1"]'));
  check(`Sure yeniden seç (${t}): Sure 1 seçilince aralık 1-7, ileti siliniyor`, h.from(t).value === "1" && h.to(t).value === "7" && !h.err(t).to && !h.err(t).from);
  h.submit(t);
  check(`Sure yeniden seç (${t}): Uygula çalışıyor (Sure 1, 1-7)`, h.started(t).length === 1 && same(h.started(t)[0], h.args(t, 1, 1, 7)));
}

// 3g) kapsam: iletiyi yalnızca ilgili sekmenin Başlangıç/Bitiş alanları siliyor
for (const t of TABS) {
  const others = TABS.filter((u) => u !== t);
  const h = makeEnv();
  h.openEzber();
  if (t !== "dinle") h.tab(t);
  h.type(t, "from", 5);
  h.type(t, "to", 2);
  h.submit(t);
  check(`kapsam (${t}): 5-2 engellendi`, h.err(t).to);
  for (const u of others) {
    h.tab(u);
    h.type(u, "from", 4);
    h.type(u, "to", 6);
  }
  h.tab(t);
  check(`kapsam (${t}): diğer sekmelerin alanlarına yazmak bu sekmenin iletisini silmiyor`, h.err(t).to && h.err(t).msg === MSG_ORDER);
  h.submit(t);
  check(`kapsam (${t}): bu sekmede hâlâ engelli (oturum yok), diğer sekmelerin aralığı bu sekmeyi etkilemedi`, h.started(t).length === 0 && h.isOpen());
  for (const u of others) {
    h.tab(u);
    h.submit(u);
  }
  check(`kapsam (${t}): diğer sekmeler kendi formlarında başlıyor (iletiler sekme başına)`, others.every((u) => h.started(u).length === 1));
}
{
  // Dinle'nin tekrar sayıları aralık değil: iletiyi silmez (yalnızca Başlangıç/Bitiş)
  const h = makeEnv();
  h.openEzber();
  h.type("dinle", "from", 5);
  h.type("dinle", "to", 2);
  h.submit("dinle");
  for (const id of ["ezber-repeat", "ezber-repeat-all"]) {
    const el = h.$(id);
    el.focus();
    el.value = "3";
    el.dispatchEvent(new h.win.Event("input", { bubbles: true }));
  }
  check("kapsam (dinle): Ayet/Aynısını Tekrar Sayısı düzenlenince Bitiş iletisi silinmiyor (yalnızca Başlangıç/Bitiş siliyor)", h.err("dinle").to && h.err("dinle").msg === MSG_ORDER);
  h.submit("dinle");
  check("kapsam (dinle): tekrar sayıları değişse de aralık düzeltilene dek gönderme engelli", h.started("dinle").length === 0);
  h.type("dinle", "to", 5);
  h.submit("dinle");
  check("kapsam (dinle): aralık düzelince tekrar sayılarıyla (3, 3) oturum başlıyor", h.started("dinle").length === 1 && same(h.started("dinle")[0], [START.dinle, "husary", 3, 5, 5, 3, 3]));
}

// 3h) tarayıcı doğrulaması hâlâ çalışıyor: boş ya da 1'den küçük değerde (min=1, required) işleyici çalışmıyor, ileti yazılmıyor
for (const t of TABS) {
  for (const [field, value, label] of [["from", "", "boş Başlangıç"], ["to", "", "boş Bitiş"], ["from", 0, "Başlangıç 0"], ["to", 0, "Bitiş 0"]]) {
    const h = makeEnv();
    h.openEzber();
    if (t !== "dinle") h.tab(t);
    h.type(t, "from", 2);
    h.type(t, "to", 4);
    h.type(t, field, value);
    h.submit(t);
    check(`yerleşik doğrulama (${t}, ${label}): oturum yok, modal açık, özel ileti yazılmadı (işleyici hiç çalışmadı)`, h.started(t).length === 0 && h.isOpen() && !h.err(t).to && !h.err(t).from);
    h.type(t, field, field === "from" ? 2 : 4);
    h.submit(t);
    check(`yerleşik doğrulama (${t}, ${label}): değer düzelince gönderiliyor`, h.started(t).length === 1);
  }
}

// 3i) art arda çok sayıda geçersiz -> düzelt döngüsü (her turda iletinin silindiği, ilk turdan sonra da)
for (const t of TABS) {
  const h = makeEnv();
  h.openEzber();
  if (t !== "dinle") h.tab(t);
  let ok = true;
  for (let i = 0; i < 6; i++) {
    h.type(t, "from", 10 + i);
    h.type(t, "to", 3);
    h.submit(t);
    ok = ok && h.err(t).to && h.started(t).length === i;
    h.type(t, "to", 20 + i);
    ok = ok && !h.err(t).to;
    h.submit(t);
    ok = ok && h.started(t).length === i + 1 && same(h.started(t)[i], h.args(t, 3, 10 + i, 20 + i));
    h.openEzber();
    if (t !== "dinle") h.tab(t);
  }
  check(`döngü (${t}): 6 kez (geçersiz gönder, düzelt, gönder, yeniden aç) hep başarılı, her turda doğru aralık`, ok && h.started(t).length === 6);
}

// 3j) sözleşme: iletiyi silen her yer HER İKİ alanın iletisini siliyor. Bugün ileti yalnızca Bitiş alanına yazılıyor (Başlangıç
//     hiç iletisiz); yarın Başlangıç'a da yazılırsa bayat kalmasın diye. İletiler burada elle (setCustomValidity) enjekte ediliyor.
for (const t of TABS) {
  const inject = (h, u) => {
    h.from(u).setCustomValidity("elle yazılmış Başlangıç iletisi");
    h.to(u).setCustomValidity("elle yazılmış Bitiş iletisi");
  };
  const clean = (h, u) => !h.from(u).validity.customError && !h.to(u).validity.customError;
  for (const field of ["from", "to"]) {
    const h = makeEnv();
    h.openEzber();
    if (t !== "dinle") h.tab(t);
    inject(h, t);
    check(`sözleşme (${t}): deney geçerli: enjekte edilen iletiler iki alanı da geçersiz yapıyor`, h.from(t).validity.customError && h.to(t).validity.customError);
    h.type(t, field, 2);
    check(`sözleşme (${t}): ${field} alanı düzenlenince Başlangıç ve Bitiş iletisi birlikte siliniyor`, clean(h, t));
  }
  const h = makeEnv();
  h.openEzber();
  if (t !== "dinle") h.tab(t);
  inject(h, t);
  h.press(h.$(`ezber-${t}-surah-btn`));
  h.press(h.$("ezber-surah-picker-list").querySelector('.modal-item[data-surah="2"]'));
  check(`sözleşme (${t}): Sure yeniden seçilince Başlangıç ve Bitiş iletisi birlikte siliniyor`, clean(h, t));
}
{
  const h = makeEnv();
  h.openEzber();
  for (const u of TABS) {
    h.from(u).setCustomValidity("elle yazılmış Başlangıç iletisi");
    h.to(u).setCustomValidity("elle yazılmış Bitiş iletisi");
  }
  h.closeAll();
  h.openEzber();
  check("sözleşme: modal yeniden açılınca üç sekmenin de Başlangıç ve Bitiş iletisi birlikte siliniyor", TABS.every((u) => !h.from(u).validity.customError && !h.to(u).validity.customError));
}

// 3k) readEzberRange (düzeltmeden önce de vardı, değişmedi): her çağrıda iletiyi baştan hesaplıyor, eskisini devralmıyor ve iletiyi
//     yalnızca Bitiş alanına yazıyor. Doğrudan çağrılıyor (gönderme olayı atlanarak): tarayıcı doğrulaması işleyiciye ancak bayat
//     ileti silinmişken ulaşılmasını sağlıyor, ama işlev kendi başına da doğru olmalı.
for (const t of TABS) {
  const h = makeEnv();
  h.openEzber();
  const form = h.$(`ezber-${t}-form`);
  const set = (from, to) => {
    h.from(t).value = String(from);
    h.to(t).value = String(to);
  };
  h.to(t).setCustomValidity("eski ileti");
  set(1, 3);
  check(`readEzberRange (${t}): geçerli 1-3 -> bayat ileti olsa da baştan hesaplanıyor: sonuç {surah, from, to}, ileti yok`, same(h.api.readEzberRange(t, form), { surah: FALLBACK_SURAH, from: 1, to: 3 }) && !h.err(t).to);
  set(5, 2);
  check(`readEzberRange (${t}): 5-2 -> null; ileti Bitiş alanında ve yalnızca orada`, h.api.readEzberRange(t, form) === null && h.err(t).msg === MSG_ORDER && h.err(t).to && !h.err(t).from);
  set(5, 999);
  check(`readEzberRange (${t}): 5-999 -> null; ileti bu kez "Bu sure 200 ayetten oluşuyor." (öncekini devralmıyor)`, h.api.readEzberRange(t, form) === null && h.err(t).msg === msgCount(3) && !h.err(t).from);
  set(5, 7);
  check(`readEzberRange (${t}): 5-7 -> sonuç; önceki ileti siliniyor`, same(h.api.readEzberRange(t, form), { surah: FALLBACK_SURAH, from: 5, to: 7 }) && !h.err(t).to);
}

// -- (4) Rastgele diziler x bağımsız model -----------------------------------------------------------------------
// Model: sekme başına { surah, from, to, stale }. Kurallar (koddan değil, davranış tanımından):
//   - Başlangıç/Bitiş yazmak o sekmenin `stale` bayrağını siler; Sure seçmek aralığı sıfırlar ve siler; modalı yeniden açmak üç sekmeyi
//     kayıtlıya/varsayılana döndürür ve siler;
//   - gönder: `stale` varsa engelli; değilse yerleşik doğrulama (boş ya da < 1 -> engelli, ileti yazılmaz); değilse aralık denetimi
//     (başlangıç > bitiş ya da bitiş > ayet sayısı -> `stale` olur, engelli); değilse oturum başlar, ayar kaydedilir, modal kapanır.
{
  const POOL = [1, 1, 2, 3, 5, 7, 9, 20, 150, 200, 201, 999, 0];
  let total = 0;
  let bad = 0;
  let firstBad = "";
  for (let seed = 1; seed <= 24; seed++) {
    const rnd = mulberry32(seed * 7919);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const h = makeEnv();
    const model = Object.fromEntries(TABS.map((t) => [t, { surah: FALLBACK_SURAH, from: 1, to: 1, stale: false }]));
    const saved = {};
    const startedModel = { dinle: [], oku: [], yaz: [] };
    let cur = "dinle";
    let open = false;
    const doOpen = () => {
      h.openEzber();
      open = true;
      for (const t of TABS) {
        const s = saved[t];
        model[t] = { surah: s ? s.surah : FALLBACK_SURAH, from: s ? s.from : 1, to: s ? s.to : 1, stale: false };
      }
      if (cur !== "dinle") h.tab(cur);
      else h.tab("dinle");
    };
    doOpen();
    for (let step = 0; step < 140; step++) {
      const r = rnd();
      let what = "";
      if (!open) {
        doOpen();
        what = "aç";
      } else if (r < 0.2) {
        const f = pick(["from", "to"]);
        const v = pick(POOL);
        h.type(cur, f, v);
        model[cur][f] = v;
        model[cur].stale = false;
        what = `yaz ${cur}.${f}=${v}`;
      } else if (r < 0.5) {
        h.submit(cur);
        what = `gönder ${cur}`;
        const m = model[cur];
        if (!m.stale) {
          const native = m.from < 1 || m.to < 1; // min=1 (boş değer havuzda yok)
          if (!native) {
            const vc = versesOf(m.surah);
            if (m.from > m.to || m.to > vc) m.stale = true;
            else {
              const args = t0args(cur, m);
              startedModel[cur].push(args);
              saved[cur] = { surah: m.surah, from: m.from, to: m.to };
              open = false; // modal kapandı; sonraki işlemde yeniden açılacak
            }
          }
        }
      } else if (r < 0.62) {
        const n = 1 + Math.floor(rnd() * 114);
        h.press(h.$(`ezber-${cur}-surah-btn`));
        h.press(h.$("ezber-surah-picker-list").querySelector(`.modal-item[data-surah="${n}"]`));
        model[cur] = { surah: n, from: 1, to: versesOf(n), stale: false };
        what = `sure ${n}`;
      } else if (r < 0.74) {
        cur = pick(TABS);
        h.tab(cur);
        what = `sekme ${cur}`;
      } else if (r < 0.84) {
        h.closeAll();
        open = false;
        what = "kapat";
      } else {
        doOpen();
        what = "yeniden aç";
      }
      total++;
      // karşılaştırma: oturum sayısı/bağımsız değişkenler, bayat ileti, modal durumu
      let okStep = true;
      for (const t of TABS) {
        okStep = okStep && same(h.started(t), startedModel[t]);
        if (open) okStep = okStep && h.err(t).to === model[t].stale && h.from(t).value === String(model[t].from) && h.to(t).value === String(model[t].to);
      }
      okStep = okStep && h.isOpen() === open;
      if (!okStep) {
        bad++;
        if (!firstBad) firstBad = `seed ${seed} adım ${step} (${what})`;
      }
    }
  }
  function t0args(t, m) {
    return t === "dinle" ? [START.dinle, "husary", m.surah, m.from, m.to, 1, 1] : [START[t], m.surah, m.from, m.to];
  }
  check(`rastgele dizi: 24 tohum x 140 işlem (yaz, gönder, sure seç, sekme, kapat, yeniden aç) bağımsız modelle uyuşuyor (${total} işlem, ${bad} sapma)${firstBad ? " -- " + firstBad : ""}`, total === 24 * 140 && bad === 0);
}

check(`jsdom'da olay dinleyicilerinde yakalanmamış hata yok (${jsdomErrors.length}${jsdomErrors.length ? ": " + jsdomErrors.slice(0, 2).join(" | ") : ""})`, jsdomErrors.length === 0);

if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All checks passed (Ezber aralık alanları: geçersiz aralık gönderildikten sonra düzeltilen aralık gönderilebiliyor; ileti Başlangıç/Bitiş düzenlenince, modal açılınca ve Sure seçilince siliniyor, her gönderimde baştan hesaplanıyor; kapsam sekme başına; yerleşik doğrulama bozulmadı; rastgele diziler x bağımsız model).");
