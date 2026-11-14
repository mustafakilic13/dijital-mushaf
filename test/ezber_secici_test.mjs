// Ezber modalının Sure ve Kârî seçicileri: ortak düğme + alt-görünüm liste kalıbı, odak yönetimi, kapanış sıfırlaması. Regresyon kontrolü.
//
// Neden var: (a) Kârî yerel bir <select> idi, Sure ise düğme + modal içi liste: aynı formda iki farklı denetim. (b) İki seçicide de odak
// gizlenen bölümde kalıyordu. (c) Oku/Yaz'da seçici açıkken modal kapanınca iki form birden görünüyordu. (d) Seçici açılınca mevcut satır
// görünür alana getirilmiyordu. Gerçek Chromium'da ölçülen durum (430 px, sayfa 50; yalnızca Tab/Enter/fare; Playwright klavyesi gerçek tuş
// olayları üretiyor), düzeltmeden ÖNCE:
//   - Sure düğmesine Enter -> odak <body> (ekran okuyucu seçicinin açıldığını duymuyor; sonraki Tab Geri'ye gidiyor); Geri'ye ya da bir
//     sureye Enter -> odak yine <body>, sonraki Tab formun başına değil sayfanın altındaki "Kaynak Kod" bağlantısına gidiyor;
//   - Sure düğmesinin erişilebilirlik adı yalnızca "3. Âl-i İmrân" (alan etiketi "Sure" adda yok); Kârî <select>i "Kârî" adlı bir
//     combobox (değer "Husarî (Mücevved)", hasPopup "menu"), AşağıOk ile değeri doğrudan değiştiriyor;
//   - Oku ya da Yaz sekmesinde Sure seçici açıkken Esc -> kapanış sıfırlaması Dinle sekmesini seçiyor ama seçicinin hedef sekmesinin formunu
//     SONRA geri getiriyordu: yeniden açılışta görünen paneller "dinle,oku" ya da "dinle,yaz" (iki form üst üste);
//   - seçici açılışında kayıtlı sure 60 iken liste hep en baştaydı (scrollTop 0), etkin satır 3605 px aşağıda: ortalama çağrısı seçici
//     hâlâ hidden iken yapılıyordu (hidden bir öğede scrollIntoView hiçbir şey yapmıyor).
// Düzeltmeden sonra aynı sahneler: iki seçicide de düğmeye Enter odağı seçicinin kapsayıcısına alıyor ("Sure Seç, grup" / "Kârî Seç,
// grup"), Tab Geri'den sürüyor; Geri ve satır seçimi odağı seçiciyi açan düğmeye geri veriyor; Kârî, Sure'nin aynısı olan bir düğme
// (alan etiketi + gizli giriş + aynı sınıflar) ve aynı yapıdaki ikinci bir seçici; her ikisinin adı "<alan> <değer>"; kapanış sıfırlaması
// önce seçiciyi sonra sekmeyi sıfırlıyor; mevcut satır seçici görünürken ortalanıyor.
//
// Burada kontrol edilenler:
//   (1) kaynak: <ezber-picker> bloğunun giriş/çıkış sırası, Geri/seçim bağlamasının açık seçenekle çağrılması, closeModal'daki sıra;
//   (2) index.html: <select> yok, Kârî alanı = Sure alanı (normalize edilmiş yapı karşılaştırması), iki seçici birebir aynı yapıda, kimlik
//       tekilliği ve aria başvurularının çözümlenmesi, varsayılanlar RECITERS ile tutarlı;
//   (3) davranış: GERÇEK setupEzberModal + GERÇEK openModal/closeModal (modal-odak.js ile) + GERÇEK <ezber-picker> bloğu x GERÇEK index.html
//       x GERÇEK data/surahs.json, jsdom'da: açılış/geri yükleme, iki seçicinin açılışı (odak, Tab durakları, etkin satır, kaydırma anı),
//       Geri, satır seçimi (3 sekmede Sure, Dinle'de Kârî), forma uygulama (saklanan ayar, başlatılan oturum), kapanışta sıfırlama (Oku/Yaz
//       dahil), odak alamayan açan, yanlış seçici/yanlış hedef/boş durum tıklamaları, erişilebilir adlar;
//   (4) 24 tohumlu rastgele işlem dizisi (açma, sekme, iki seçici, Geri, satır seçimi, Uygula, kapatma) x bağımsız bir model.
//
// ÖNEMLİ SINIR: jsdom'da düzen yok ve odaktaki öğe gizlenince odak <body>'ye düşmüyor (Chromium'da düşüyor: HTML'in "focus fixup" kuralı).
// Bu test kuralı elle taklit ediyor (her işlemden sonra: odak [hidden] bir atanın içindeyse blur), yani düzeltilmemiş kod burada da
// "odak <body>'de" diye yakalanıyor. Gerçek Chromium ölçümü README'de; gerçek ekran okuyucu (NVDA/JAWS/VoiceOver/TalkBack) testinin YERİNİ
// TUTMAZ; "Sure Seç, grup" anonsu cihazda sınanmadı (README kontrol listesi, madde 23). Firefox ve Safari'de denenmedi.
// Liste satırlarının tek Tab durağı ve ok tuşları ayrı bir iş (js/liste-gezintisi.js, test/liste_gezintisi_test.mjs); burada yalnızca
// modalın Tab durakları sınanıyor: Kapat, Geri, geçerli satır (listenin tek durağı), iki alt bilgi bağlantısı.
//
//   node ezber_secici_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM, VirtualConsole } from "jsdom";
import { createModalFocus, tabbablesIn } from "../js/modal-odak.js";
import { setupTablist } from "../js/sekme-gezintisi.js";
import { setupListNav, syncListStop, listRows } from "../js/liste-gezintisi.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const html = readText("index.html");
const appSource = readText("js", "app.js");
const appCode = appSource.replace(/^\s*\/\/.*$/gm, ""); // tam satır yorumları olmadan (örnek kod içeren yorumlar sayımı bozmasın)
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
check("app.js: <ezber-picker> ... </ezber-picker> bloğu bulundu", !!BLOCK);
const MODAL_START = appSource.indexOf("const modalFocus = createModalFocus(");
const MODAL_END = appSource.indexOf("function setupModals()");
check("app.js: modal odak bloğu (modalFocus .. closeAllModals) bulundu", MODAL_START > 0 && MODAL_END > MODAL_START);
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
check("app.js: RECITERS, EZBER_TABS, EZBER_SETTINGS_KEY ve gerekli işlevler kaynaktan çıkarıldı", !!RECITERS_SRC && !!TABS_SRC && !!KEY_SRC && Object.values(SW).every(Boolean));

if (!BLOCK || !(MODAL_START > 0 && MODAL_END > MODAL_START) || !RECITERS_SRC || !TABS_SRC || !KEY_SRC || !Object.values(SW).every(Boolean)) {
  console.error("app.js'ten gerekli kaynak parçaları çıkarılamadı");
  console.error(`${failures + 1} check(s) failed.`);
  process.exit(1);
}

const RECITERS = new Function(`${RECITERS_SRC}\nreturn RECITERS;`)();
const RECITER_KEYS = Object.keys(RECITERS);
{
  const src = BLOCK[1];
  const open = bodyOf(src, "openEzberPicker");
  const close = bodyOf(src, "closeEzberPicker");
  check("app.js: openEzberPicker, closeEzberPicker, setEzberSurah, setEzberReciter ve iki liste doldurucusu bloğun içinde", !!open && !!close && ["setEzberSurah", "setEzberReciter", "populateEzberSurahPickerList", "populateEzberReciterPickerList"].every((n) => !!bodyOf(src, n)));
  check("app.js: eski adlar yok (openEzberSurahPicker / closeEzberSurahPicker / populateEzberReciterSelect / ezberSurahPickerTarget)", !/EzberSurahPicker\b|populateEzberReciterSelect|ezberSurahPickerTarget|els\.ezberSurahPicker/.test(appSource));
  if (open && close) {
    const iHide = open.indexOf("els.ezberTabs.hidden = true;");
    const iPanel = open.indexOf("`ezber-panel-${target}`).hidden = true;");
    const iShow = open.indexOf("picker.hidden = false;");
    const iActive = open.indexOf("setActiveModalItem(");
    const iFocus = open.indexOf("picker.focus({ preventScroll: true });");
    check("openEzberPicker: sekme çubuğu ve hedef sekmenin formu gizleniyor, seçici gösteriliyor", iHide >= 0 && iPanel >= 0 && iShow >= 0);
    check("openEzberPicker sırası: seçiciyi GÖSTER -> mevcut satırı ortala (hidden bir listede scrollIntoView işe yaramıyor) -> odağı seçiciye al", iShow >= 0 && iShow < iActive && iActive < iFocus);
    check("openEzberPicker: odak seçicinin kapsayıcısına alınıyor (preventScroll ile), düğmede ya da <body>'de bırakılmıyor", iFocus >= 0 && !/opener\.focus|modalFocus/.test(open));
    check("openEzberPicker: açan düğme kayda alınıyor (#ezber-<sekme>-<tür>-btn)", /ezberPicker = \{ kind, target, opener: document\.getElementById\(`ezber-\$\{target\}-\$\{kind\}-btn`\) \};/.test(open));
    const iNull = close.indexOf("ezberPicker = null;");
    const iPanelBack = close.indexOf("`ezber-panel-${open.target}`).hidden = false;");
    const iEarly = close.indexOf("if (!restoreFocus) return;");
    const iOpenerFocus = close.indexOf("open.opener.focus();");
    const iFallback = close.indexOf("modalFocus.enter(els.ezberModal)");
    check("closeEzberPicker: açık kayıt alınıp ÖNCE temizleniyor, iki seçici de gizleniyor, sekme çubuğu geri geliyor", iNull >= 0 && /document\.getElementById\("ezber-surah-picker"\)\.hidden = true;/.test(close) && /document\.getElementById\("ezber-reciter-picker"\)\.hidden = true;/.test(close) && /els\.ezberTabs\.hidden = false;/.test(close));
    check("closeEzberPicker sırası: açık kayıt yoksa dön -> hedef formu geri getir -> restoreFocus yoksa dön -> açana odak -> olmadıysa modal kapsayıcısı", close.indexOf("if (!open) return;") >= 0 && close.indexOf("if (!open) return;") < iPanelBack && iPanelBack < iEarly && iEarly < iOpenerFocus && iOpenerFocus < iFallback);
    check("closeEzberPicker: odak yalnızca isteyince taşınıyor (restoreFocus varsayılanı false; closeModal sıfırlaması kapanan modalda odağa dokunmuyor)", /function closeEzberPicker\(\{ restoreFocus = false \} = \{\}\)/.test(src));
  }
}
check("app.js: Geri ve satır seçimi odağı açık seçenekle geri istiyor (2 çağrı), tıklama olayı seçenek nesnesi olarak geçmiyor", (appCode.match(/closeEzberPicker\(\{ restoreFocus: true \}\)/g) || []).length === 2 && !/addEventListener\("click", closeEzberPicker\)/.test(appCode));
check("app.js: Kârî düğmesi Sure düğmeleri gibi openEzberPicker'a bağlı (kind 'reciter', sekme 'dinle'); Sure düğmeleri 3 sekmede", /getElementById\("ezber-dinle-reciter-btn"\)\.addEventListener\("click", \(\) => openEzberPicker\("reciter", "dinle"\)\)/.test(appSource) && /openEzberPicker\("surah", target\)/.test(appSource));
{
  const m = /if \(modalEl === els\.ezberModal\) \{([\s\S]*?)\n  \}/.exec(appSource);
  const body = m ? m[1] : "";
  const iPick = body.indexOf("closeEzberPicker();");
  const iTab = body.indexOf('switchEzberTab("dinle");');
  check("closeModal: Ezber kapanışında önce seçici (açık olduğu sekmenin formunu geri getirir) sonra Dinle sekmesi sıfırlanıyor", iPick >= 0 && iTab >= 0 && iPick < iTab);
}
check("app.js: Kârî alanı geri yüklemesi setEzberReciter('dinle', ...) ile; geçersiz/eksik/prototip adlı (toString) kayıtta 'husary'", /setEzberReciter\("dinle", d && Object\.hasOwn\(RECITERS, d\.reciter\) \? d\.reciter : "husary"\);/.test(appSource));
check("app.js: els.ezberReciter gizli girişi (#ezber-dinle-reciter) gösteriyor; Dinle formu bundan okuyor", /ezberReciter: document\.getElementById\("ezber-dinle-reciter"\)/.test(appSource) && /const reciter = els\.ezberReciter\.value;/.test(appSource));

// -- (2) index.html -------------------------------------------------------------------------------------------
const norm = (el) =>
  el.outerHTML
    .replace(/\s+/g, " ")
    .replace(/(reciter|surah)/g, "X")
    .replace(/(dinle|oku|yaz)/g, "T")
    .replace(/>[^<>]*</g, "><")
    .replace(/ value="[^"]*"/g, "");
{
  const D = new JSDOM(html).window.document;
  const modal = D.getElementById("ezber-modal");
  check("index.html: Ezber modalında <select> yok, #ezber-reciter yok (Kârî artık Sure gibi düğme + liste)", modal.querySelectorAll("select").length === 0 && !D.getElementById("ezber-reciter"));
  const ids = [...D.querySelectorAll("[id]")].map((e) => e.id);
  check("index.html: kimlikler tekil", new Set(ids).size === ids.length);
  const refs = [...modal.querySelectorAll("[aria-labelledby], [aria-controls]")].flatMap((e) => [...(e.getAttribute("aria-labelledby") || "").split(/\s+/), ...(e.getAttribute("aria-controls") || "").split(/\s+/)].filter(Boolean));
  check("index.html: Ezber modalındaki aria-labelledby/aria-controls başvurularının hepsi var olan bir kimliğe çıkıyor", refs.length > 0 && refs.every((id) => !!D.getElementById(id)));

  const reciterField = D.getElementById("ezber-dinle-reciter").closest(".ezber-field");
  const surahFields = ["dinle", "oku", "yaz"].map((t) => D.getElementById(`ezber-${t}-surah`).closest(".ezber-field"));
  check("index.html: Kârî alanı bir <div class='ezber-field'> (eskiden <label>); Dinle formunda Kârî Sure'den ÖNCE", reciterField.tagName === "DIV" && reciterField.nextElementSibling === surahFields[0]);
  check("index.html: Kârî alanı Sure alanıyla aynı yapıda (etiket + düğme + metin + ok simgesi + gizli giriş: kimlik/sekme/metin/değer normalize edilince birebir aynı)", norm(reciterField) === norm(surahFields[0]));
  check("index.html: üç Sure alanı da birbirinin aynısı (yalnızca sekme adı farklı)", norm(surahFields[0]) === norm(surahFields[1]) && norm(surahFields[1]) === norm(surahFields[2]));
  const btn = D.getElementById("ezber-dinle-reciter-btn");
  check("index.html: Kârî düğmesi gerçek <button type=button>, .ezber-picker-btn; Sure düğmesiyle aynı: ikisinde de aria-haspopup yok (satırlar düz düğme, liste kutusu değil; bkz. modal_liste_aria_test.mjs)", btn.tagName === "BUTTON" && btn.type === "button" && btn.classList.contains("ezber-picker-btn") && !btn.hasAttribute("aria-haspopup") && !D.getElementById("ezber-dinle-surah-btn").hasAttribute("aria-haspopup"));
  check("index.html: dört düğmenin de adı alan etiketi + görünen değer (aria-labelledby: etiket kimliği + metin kimliği)", ["dinle-reciter", "dinle-surah", "oku-surah", "yaz-surah"].every((k) => D.getElementById(`ezber-${k}-btn`).getAttribute("aria-labelledby") === `ezber-${k}-label ezber-${k}-btn-text` && !!D.getElementById(`ezber-${k}-label`) && !!D.getElementById(`ezber-${k}-btn-text`)));
  check("index.html: eski sınıf adları yok (.ezber-surah-btn* / .ezber-surah-picker*): düğme ve seçici sınıfları iki alan için de genel (.ezber-picker-*)", !/class="[^"]*\bezber-surah-(btn|picker)/.test(html));

  const sp = D.getElementById("ezber-surah-picker");
  const rp = D.getElementById("ezber-reciter-picker");
  check("index.html: iki seçici Ezber modalının doğrudan çocuğu, üç panelden SONRA, alt bilgiden ÖNCE; başlangıçta gizli", sp.parentElement === modal && rp.parentElement === modal && sp.nextElementSibling === rp && rp.nextElementSibling.classList.contains("ezber-modal-footer") && sp.previousElementSibling.id === "ezber-panel-yaz" && sp.hidden && rp.hidden);
  check("index.html: iki seçici birebir aynı yapıda (kimlik/metin normalize edilince): grup, başlığa bağlı ad, tabindex=-1, Geri, başlık, liste", norm(sp) === norm(rp));
  for (const [k, title] of [["surah", "Sure Seç"], ["reciter", "Kârî Seç"]]) {
    const p = D.getElementById(`ezber-${k}-picker`);
    const back = D.getElementById(`ezber-${k}-picker-back`);
    check(`index.html: ${k} seçici: role=group, tabindex=-1, adı başlığa bağlı ('${title}'), Geri düğmesi 'Geri dön', liste .modal-list`, p.getAttribute("role") === "group" && p.getAttribute("tabindex") === "-1" && p.getAttribute("aria-labelledby") === `ezber-${k}-picker-title` && D.getElementById(`ezber-${k}-picker-title`).textContent.trim() === title && back.tagName === "BUTTON" && back.getAttribute("aria-label") === "Geri dön" && p.contains(back) && D.getElementById(`ezber-${k}-picker-list`).classList.contains("modal-list"));
  }
  check("index.html: Kârî varsayılanları RECITERS'ın ilk kârîsiyle tutarlı (gizli giriş 'husary', düğme metni etiketi)", RECITER_KEYS[0] === "husary" && D.getElementById("ezber-dinle-reciter").value === "husary" && D.getElementById("ezber-dinle-reciter-btn-text").textContent.trim() === RECITERS.husary.label);
  check("index.html: iki seçicinin gizli girişleri .ezber-field içinde ve formun içinde (Sure ve Kârî değeri aynı yerde)", D.getElementById("ezber-dinle-form").contains(D.getElementById("ezber-dinle-reciter")) && D.getElementById("ezber-dinle-form").contains(D.getElementById("ezber-dinle-surah")));
}

// -- (2b) CSS (kaynak metni; jsdom CSS özgüllüğünü hesaplamıyor, gerçek kaskad ölçümü README'de) ---------------------------
{
  const css = readText("css", "style.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    if (selectors.some((s) => s.startsWith("@"))) continue;
    rules.push({ selectors, decls: Object.fromEntries(m[2].split(";").map((d) => d.split(/:(.*)/s).map((x) => (x || "").trim())).filter(([k]) => k)) });
  }
  const rule = (sel) => rules.filter((r) => r.selectors.includes(sel));
  const one = (sel) => (rule(sel).length === 1 ? rule(sel)[0].decls : null);
  const allSelectors = rules.flatMap((r) => r.selectors);
  check("css: eski sınıf kuralları yok (.ezber-surah-btn*, .ezber-surah-picker*): düğme ve seçici stilleri iki alan için de genel (.ezber-picker-*)", !allSelectors.some((s) => /ezber-surah-(btn|picker)/.test(s)));
  check("css: Kârî <select>ine ait kural yok (.ezber-field select ...): Kârî artık düğme", !allSelectors.some((s) => /\.ezber-field select/.test(s)));
  for (const sel of [".ezber-picker-btn", ".ezber-picker-btn-text", ".ezber-picker-btn-chevron", ".ezber-picker", ".ezber-picker-header", ".ezber-picker-back", ".ezber-picker .modal-list", ".modal-item-title"]) {
    check(`css: ${sel} kuralı tam bir kez tanımlı`, rule(sel).length === 1);
  }
  const btn = one(".ezber-picker-btn");
  check("css: .ezber-picker-btn tam genişlik, beyaz kart, 12px köşe, işaretçi imleci (eski Sure düğmesiyle aynı görünüm)", !!btn && btn.width === "100%" && btn.background === "#fff" && btn["border-radius"] === "12px" && btn.cursor === "pointer" && btn.display === "flex");
  check("css: .ezber-picker[hidden] { display: none } ve seçici yüksekliği esnek (flex: 1, min-height: 0)", (one(".ezber-picker[hidden]") || {}).display === "none" && (one(".ezber-picker") || {}).flex === "1" && (one(".ezber-picker") || {})["min-height"] === "0");
  check("css: .ezber-picker:focus yalnızca outline: none (kapsayıcı etkileşimli değil; halka içindeki düğmelerde)", JSON.stringify(one(".ezber-picker:focus")) === JSON.stringify({ outline: "none" }));
  check("css: seçici açıkken sheet en yüksek boyda (.modal-sheet:has(> .ezber-picker:not([hidden])) { height: min(78vh, 640px) }): kısa Kârî listesinde sheet çökmüyor", (one(".modal-sheet:has(> .ezber-picker:not([hidden]))") || {}).height === "min(78vh, 640px)" && rule(".modal-sheet").some((r) => r.decls["max-height"] === "min(78vh, 640px)"));
  check("css: Kârî satırı başlığı 15px (Sure düğmesi/alanlarının metin boyutu)", (one(".modal-item-title") || {})["font-size"] === "15px");
  check("css: .modal-item-title Arapça ad sınıfı değil (RTL/Arapça yazı tipi yok)", !("direction" in (one(".modal-item-title") || {})) && !("font-family" in (one(".modal-item-title") || {})));
}

// -- (3) Davranış (jsdom) -------------------------------------------------------------------------------------
const MODAL_IDS = ["surah-modal", "juz-modal", "page-modal", "ezber-modal", "surah-info-modal", "topics-modal", "arama-modal"];
const NAMES = ["surahModal", "juzModal", "pageModal", "ezberModal", "surahInfoModal", "topicsModal", "aramaModal"];
const KEY = "quran-reader-ezber-v1";
const TABS = ["dinle", "oku", "yaz"];
const FALLBACK_SURAH = 3; // state.pageToSurah[50]
const versesOf = (n) => surahs[String(n)].versesCount;
const accName = (D, el) => {
  const text = (e) => e.textContent.replace(/\s+/g, " ").trim();
  if (el.hasAttribute("aria-labelledby")) return el.getAttribute("aria-labelledby").split(/\s+/).map((id) => text(D.getElementById(id))).join(" ");
  if (el.hasAttribute("aria-label")) return el.getAttribute("aria-label");
  return text(el);
};

// jsdom, olay dinleyicisinde fırlayan yakalanmamış hatayı yutup konsola yazıyor (click() fırlatmıyor): burada toplanıyor ve sonda sıfır olmalı
const jsdomErrors = [];
function makeEnv({ saved = null } = {}) {
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
  const state = { openModalEl: null, surahs, ezberStudy: null, selectedAyah: null, pageToSurah: { 50: FALLBACK_SURAH }, currentPage: 50 };
  const calls = [];
  const timers = [];
  const rafQ = [];
  let now = 0;
  const scrolls = [];
  win.Element.prototype.scrollIntoView = function (opts) {
    const picker = this.closest(".ezber-picker");
    scrolls.push({ surah: this.dataset.surah, reciter: this.dataset.reciter, pickerHidden: picker ? picker.hidden : null, opts });
  };
  const code = [TABS_SRC, KEY_SRC, RECITERS_SRC, SW.switchEzberTab, SW.setActiveModalItem, SW.readEzberRange, SW.loadEzberSettings, SW.saveEzberSettings, appSource.slice(MODAL_START, MODAL_END), BLOCK[1], SW.setupEzberModal,
    "return { openModal, closeModal, closeAllModals, modalFocus, setupEzberModal, openEzberPicker, closeEzberPicker, switchEzberTab };"].join("\n");
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
  // HTML "focus fixup" kuralının taklidi: odaklı öğe artık gizli bir atanın içindeyse odak <body>'ye düşer (Chromium'da ölçüldü).
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
    d, win, els, state, api, calls, scrolls, modal: els.ezberModal, $, fixup, advance,
    active: () => d.activeElement,
    // Fare ya da klavyeyle bir düğmeye/satıra etkinleştirme: odak öğede, sonra tıklama, sonra tarayıcının odak düzeltmesi
    press(el) {
      el.focus();
      el.click();
      fixup();
    },
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
    isOpen: () => state.openModalEl === els.ezberModal && !els.ezberModal.hidden,
    shown: (id) => !$(id).hidden,
    panels: () => TABS.filter((t) => !$(`ezber-panel-${t}`).hidden),
    selectedTabs: () => TABS.filter((t) => $(`ezber-tab-${t}`).getAttribute("aria-selected") === "true"),
    pickers: () => ["surah", "reciter"].filter((k) => !$(`ezber-${k}-picker`).hidden),
    row: (kind, key) => $(`ezber-${kind}-picker-list`).querySelector(`.modal-item[data-${kind}="${key}"]`),
    activeRows: (kind) => [...$(`ezber-${kind}-picker-list`).querySelectorAll(".modal-item.active")],
    tabIds: () => tabbablesIn(els.ezberModal).map((e) => e.id || e.className.split(" ")[0] || e.tagName.toLowerCase()),
    stored: () => JSON.parse(win.localStorage.getItem(KEY) || "{}"),
    fixupHidden: () => d.activeElement === d.body,
  };
  return h;
}

// 3a) kurulum: listeler dolduruldu
{
  const h = makeEnv();
  check("kurulum: Sure listesi 114 satır (data-surah 1..114, her satırda sayı + Arapça ad + Türkçe ad/ayet sayısı)", (() => {
    const rows = [...h.$("ezber-surah-picker-list").children];
    return rows.length === 114 && rows.every((r, i) => r.tagName === "BUTTON" && r.type === "button" && r.classList.contains("modal-item") && r.dataset.surah === String(i + 1) && r.querySelector(".modal-item-num").textContent === String(i + 1) && r.querySelector(".modal-item-arabic").getAttribute("lang") === "ar" && r.querySelector(".modal-item-sub").textContent === `${surahs[String(i + 1)].nameTurkish} · ${surahs[String(i + 1)].versesCount} ayet`);
  })());
  check("kurulum: Kârî listesi RECITERS kadar satır, sırayla, her satır <button type=button class=modal-item data-reciter=anahtar> ve metni kârînin etiketi", (() => {
    const rows = [...h.$("ezber-reciter-picker-list").children];
    return rows.length === RECITER_KEYS.length && rows.length >= 2 && rows.every((r, i) => r.tagName === "BUTTON" && r.type === "button" && r.classList.contains("modal-item") && r.dataset.reciter === RECITER_KEYS[i] && r.textContent.trim() === RECITERS[RECITER_KEYS[i]].label);
  })());
  check("kurulum: Kârî satırları Sure satırlarıyla aynı .modal-item/.modal-item-main iskeletinde (Arapça ad ve numara olmadan, .modal-item-title ile)", [...h.$("ezber-reciter-picker-list").children].every((r) => r.children.length === 1 && r.firstElementChild.classList.contains("modal-item-main") && r.firstElementChild.firstElementChild.classList.contains("modal-item-title")));
  check("kurulum: listeler iki kez doldurulmuyor (kurulum bir kez çalıştı)", h.$("ezber-surah-picker-list").children.length === 114 && h.$("ezber-reciter-picker-list").children.length === RECITER_KEYS.length);
  check("kurulum: iki seçici başlangıçta kapalı", h.pickers().length === 0 && h.shown("ezber-tabs"));
}

// 3b) açılış ve geri yükleme (Kârî)
{
  const cases = [
    { name: "kayıt yok", saved: null, reciter: "husary", surah: FALLBACK_SURAH },
    { name: "kayıtlı abdulsamad", saved: { dinle: { reciter: "abdulsamad", surah: 18, from: 2, to: 5, repeat: 3, repeatAll: 2 } }, reciter: "abdulsamad", surah: 18 },
    { name: "kayıtlı husary", saved: { dinle: { reciter: "husary", surah: 2, from: 1, to: 3, repeat: 1, repeatAll: 1 } }, reciter: "husary", surah: 2 },
    { name: "bozuk kayıt (bilinmeyen kârî)", saved: { dinle: { reciter: "nope", surah: 2, from: 1, to: 3, repeat: 1, repeatAll: 1 } }, reciter: "husary", surah: 2 },
    { name: "kârî alanı eksik", saved: { dinle: { surah: 2, from: 1, to: 3, repeat: 1, repeatAll: 1 } }, reciter: "husary", surah: 2 },
    { name: "kârî nesne özelliği adı (toString)", saved: { dinle: { reciter: "toString", surah: 2, from: 1, to: 3, repeat: 1, repeatAll: 1 } }, reciter: "husary", surah: 2 },
    { name: "yalnızca Oku kaydı var", saved: { oku: { surah: 36, from: 1, to: 5 } }, reciter: "husary", surah: FALLBACK_SURAH },
  ];
  for (const c of cases) {
    const h = makeEnv({ saved: c.saved });
    h.openEzber();
    check(`açılış (${c.name}): modal açık, odak modalın kapsayıcısında, yalnızca Dinle paneli görünür, seçici yok`, h.isOpen() && h.active() === h.modal && h.panels().join() === "dinle" && h.pickers().length === 0 && h.shown("ezber-tabs"));
    check(`açılış (${c.name}): Kârî gizli girişi '${c.reciter}', düğme metni etiketi`, h.$("ezber-dinle-reciter").value === c.reciter && h.$("ezber-dinle-reciter-btn-text").textContent === RECITERS[c.reciter].label);
    check(`açılış (${c.name}): Dinle Sure alanı ${c.surah}. sure ve düğme metni '${c.surah}. ${surahs[String(c.surah)].nameTurkish}'`, h.$("ezber-dinle-surah").value === String(c.surah) && h.$("ezber-dinle-surah-btn-text").textContent === `${c.surah}. ${surahs[String(c.surah)].nameTurkish}`);
    check(`açılış (${c.name}): erişilebilir adlar '<etiket> <değer>'`, accName(h.d, h.$("ezber-dinle-reciter-btn")) === `Kârî ${RECITERS[c.reciter].label}` && accName(h.d, h.$("ezber-dinle-surah-btn")) === `Sure ${c.surah}. ${surahs[String(c.surah)].nameTurkish}`);
  }
}

// 3c) Dinle formunun Tab sırası: Kârî düğmesi Sure düğmesinden önce, <select> yok
{
  const h = makeEnv();
  h.openEzber();
  const ids = h.tabIds();
  check(`Dinle formu Tab sırası: Kapat, Dinle sekmesi, Kârî düğmesi, Sure düğmesi, başlangıç, bitiş, tekrar, tüm tekrar, Uygula, iki alt bilgi bağlantısı (Kaynak Kod, Kaynaklar ve lisanslar) -- ${ids.join(" > ")}`, ids.join(">") === "modal-close>ezber-tab-dinle>ezber-dinle-reciter-btn>ezber-dinle-surah-btn>ezber-dinle-from>ezber-dinle-to>ezber-repeat>ezber-repeat-all>ezber-apply-btn>ezber-modal-footer-link>ezber-sources-link");
  h.press(h.$("ezber-tab-oku"));
  check("Oku formu Tab sırası: Kapat, Oku sekmesi, Sure düğmesi, başlangıç, bitiş, Uygula, iki alt bilgi bağlantısı (Kârî yok)", h.tabIds().join(">") === "modal-close>ezber-tab-oku>ezber-oku-surah-btn>ezber-oku-from>ezber-oku-to>ezber-apply-btn>ezber-modal-footer-link>ezber-sources-link");
}

// 3d) Sure seçici: üç sekmede aç, odak, Tab durakları, etkin satır, kaydırma anı, Geri
for (const t of TABS) {
  const h = makeEnv({ saved: { dinle: { reciter: "husary", surah: 60, from: 1, to: 3, repeat: 1, repeatAll: 1 }, oku: { surah: 100, from: 1, to: 3 }, yaz: { surah: 114, from: 1, to: 3 } } });
  h.openEzber();
  if (t !== "dinle") h.press(h.$(`ezber-tab-${t}`));
  const cur = { dinle: 60, oku: 100, yaz: 114 }[t];
  const btn = h.$(`ezber-${t}-surah-btn`);
  h.scrolls.length = 0;
  h.press(btn);
  const picker = h.$("ezber-surah-picker");
  check(`Sure seçici (${t}): açıldı; sekme çubuğu ve tüm formlar gizli, Kârî seçici kapalı`, h.pickers().join() === "surah" && !h.shown("ezber-tabs") && h.panels().length === 0);
  check(`Sure seçici (${t}): odak seçicinin kapsayıcısında (düğmede kalmadı, <body>'ye düşmedi)`, h.active() === picker && !h.fixupHidden() && h.modal.contains(h.active()));
  check(`Sure seçici (${t}): kapsayıcının adı 'Sure Seç', rolü grup`, accName(h.d, picker) === "Sure Seç" && picker.getAttribute("role") === "group");
  // Liste TEK Tab durağı (roving tabindex, js/liste-gezintisi.js): önce 114 sure düğmesinin her biri ayrı bir durak, modalda 117 durak vardı.
  check(`Sure seçici (${t}): Tab durakları Kapat, Geri, geçerli sure (${cur}) satırı (listenin tek durağı), iki alt bilgi bağlantısı (formun öğeleri yok)`, (() => {
    const ids = tabbablesIn(h.modal);
    return ids.length === 5 && ids[0].classList.contains("modal-close") && ids[1].id === "ezber-surah-picker-back" && ids[2].dataset.surah === String(cur) && ids[3].classList.contains("ezber-modal-footer-link") && ids[4].id === "ezber-sources-link";
  })());
  const rows = h.activeRows("surah");
  check(`Sure seçici (${t}): etkin satır tek ve geçerli sure (${cur}) -- ${rows.map((r) => r.dataset.surah).join()}`, rows.length === 1 && rows[0].dataset.surah === String(cur));
  const sc = h.scrolls.filter((s) => s.surah === String(cur));
  check(`Sure seçici (${t}): etkin satırı ortalama (scrollIntoView center) seçici GÖRÜNÜRKEN çağrıldı (hidden iken çağrı hiçbir şey yapmıyor)`, sc.length >= 1 && sc.every((s) => s.pickerHidden === false && s.opts && s.opts.block === "center"));
  // Geri
  h.press(h.$("ezber-surah-picker-back"));
  check(`Geri (${t}): seçici kapandı, sekme çubuğu ve ${t} formu geri geldi (başka form yok)`, h.pickers().length === 0 && h.shown("ezber-tabs") && h.panels().join() === t);
  check(`Geri (${t}): odak seçiciyi açan Sure düğmesinde (<body>'de değil, gizlenen Geri düğmesinde değil)`, h.active() === btn && !h.fixupHidden());
  check(`Geri (${t}): değer değişmedi (${cur}. sure)`, h.$(`ezber-${t}-surah`).value === String(cur));
  // yeniden aç: mevcut satır yine ortalanıyor
  h.scrolls.length = 0;
  h.press(btn);
  check(`ikinci açılış (${t}): odak yine kapsayıcıda, etkin satır yine ortalandı (görünürken)`, h.active() === picker && h.scrolls.some((s) => s.surah === String(cur) && s.pickerHidden === false));
}

// 3e) Sure satırı seçimi: değer, etiket, aralık, odak, başka sekmelere dokunulmaması
for (const t of TABS) {
  const h = makeEnv();
  h.openEzber();
  if (t !== "dinle") h.press(h.$(`ezber-tab-${t}`));
  h.$(`ezber-${t}-from`).value = 2;
  h.$(`ezber-${t}-to`).value = 2;
  const before = TABS.map((x) => [h.$(`ezber-${x}-surah`).value, h.$(`ezber-${x}-from`).value, h.$(`ezber-${x}-to`).value].join("/"));
  h.press(h.$(`ezber-${t}-surah-btn`));
  const n = 18;
  h.press(h.row("surah", n));
  check(`satır seçimi (${t}): ${t} Sure alanı ${n}. sure, düğme metni '${n}. ${surahs[String(n)].nameTurkish}'`, h.$(`ezber-${t}-surah`).value === String(n) && h.$(`ezber-${t}-surah-btn-text`).textContent === `${n}. ${surahs[String(n)].nameTurkish}`);
  check(`satır seçimi (${t}): aralık sureye göre sıfırlandı (1 - ${versesOf(n)}), özel doğrulama temizlendi`, h.$(`ezber-${t}-from`).value === "1" && h.$(`ezber-${t}-to`).value === String(versesOf(n)) && h.$(`ezber-${t}-from`).validationMessage === "" && h.$(`ezber-${t}-to`).validationMessage === "");
  check(`satır seçimi (${t}): seçici kapandı, ${t} formu görünür, sekme çubuğu geri geldi`, h.pickers().length === 0 && h.panels().join() === t && h.shown("ezber-tabs"));
  check(`satır seçimi (${t}): odak Sure düğmesinde (yeni etiketi okur), <body>'de değil`, h.active() === h.$(`ezber-${t}-surah-btn`) && !h.fixupHidden());
  check(`satır seçimi (${t}): düğmenin adı yeni değeri söylüyor ('Sure ${n}. ${surahs[String(n)].nameTurkish}')`, accName(h.d, h.$(`ezber-${t}-surah-btn`)) === `Sure ${n}. ${surahs[String(n)].nameTurkish}`);
  const after = TABS.map((x) => [h.$(`ezber-${x}-surah`).value, h.$(`ezber-${x}-from`).value, h.$(`ezber-${x}-to`).value].join("/"));
  check(`satır seçimi (${t}): öteki sekmelerin değerleri aynı kaldı`, TABS.every((x, i) => x === t || after[i] === before[i]));
  check(`satır seçimi (${t}): Kârî değeri dokunulmadı`, h.$("ezber-dinle-reciter").value === "husary");
  // tekrar aç: etkin satır yeni sure
  h.press(h.$(`ezber-${t}-surah-btn`));
  check(`satır seçimi (${t}): yeniden açınca etkin satır yeni sure`, h.activeRows("surah").length === 1 && h.activeRows("surah")[0].dataset.surah === String(n));
}

// 3f) Kârî seçici: aç, odak, Tab durakları, etkin satır, Geri, seçim
{
  const h = makeEnv({ saved: { dinle: { reciter: "abdulsamad", surah: 2, from: 1, to: 3, repeat: 2, repeatAll: 3 } } });
  h.openEzber();
  const btn = h.$("ezber-dinle-reciter-btn");
  const picker = h.$("ezber-reciter-picker");
  h.scrolls.length = 0;
  h.press(btn);
  check("Kârî seçici: açıldı (yalnızca Kârî seçici); sekme çubuğu ve formlar gizli, Sure seçici kapalı", h.pickers().join() === "reciter" && !h.shown("ezber-tabs") && h.panels().length === 0);
  check("Kârî seçici: odak seçicinin kapsayıcısında (düğmede kalmadı, <body>'ye düşmedi)", h.active() === picker && !h.fixupHidden() && h.modal.contains(h.active()));
  check("Kârî seçici: kapsayıcının adı 'Kârî Seç', rolü grup", accName(h.d, picker) === "Kârî Seç" && picker.getAttribute("role") === "group");
  // Kârî satırları da listenin tek Tab durağı (önce her kârî ayrı bir durak, modalda 5 durak vardı): geçerli kârî (abdulsamad).
  check("Kârî seçici: Tab durakları Kapat, Geri, geçerli kârî satırı (listenin tek durağı), iki alt bilgi bağlantısı", h.tabIds().join(">") === "modal-close>ezber-reciter-picker-back>modal-item>ezber-modal-footer-link>ezber-sources-link" && tabbablesIn(h.modal)[2].dataset.reciter === "abdulsamad");
  check("Kârî seçici: etkin satır tek ve geçerli kârî (abdulsamad), ortalama seçici görünürken çağrıldı", h.activeRows("reciter").length === 1 && h.activeRows("reciter")[0].dataset.reciter === "abdulsamad" && h.scrolls.some((s) => s.reciter === "abdulsamad" && s.pickerHidden === false));
  // Geri: değer aynı, odak Kârî düğmesinde
  h.press(h.$("ezber-reciter-picker-back"));
  check("Kârî Geri: seçici kapandı, Dinle formu geri geldi, odak Kârî düğmesinde, değer değişmedi", h.pickers().length === 0 && h.panels().join() === "dinle" && h.shown("ezber-tabs") && h.active() === btn && h.$("ezber-dinle-reciter").value === "abdulsamad");
  // seçim
  h.press(btn);
  h.press(h.row("reciter", "husary"));
  check("Kârî seçimi: gizli giriş 'husary', düğme metni 'Husarî (Mücevved)', seçici kapandı, form geri geldi", h.$("ezber-dinle-reciter").value === "husary" && h.$("ezber-dinle-reciter-btn-text").textContent === RECITERS.husary.label && h.pickers().length === 0 && h.panels().join() === "dinle");
  check("Kârî seçimi: odak Kârî düğmesinde (yeni etiketi okur), <body>'de değil; düğmenin adı 'Kârî Husarî (Mücevved)'", h.active() === btn && !h.fixupHidden() && accName(h.d, btn) === `Kârî ${RECITERS.husary.label}`);
  check("Kârî seçimi: Sure ve aralık alanlarına dokunulmadı (Sure seçimi aralığı sıfırlıyor, Kârî sıfırlamamalı)", h.$("ezber-dinle-surah").value === "2" && h.$("ezber-dinle-from").value === "1" && h.$("ezber-dinle-to").value === "3" && h.$("ezber-repeat").value === "2" && h.$("ezber-repeat-all").value === "3");
  h.press(btn);
  check("Kârî yeniden açılış: etkin satır yeni kârî (husary)", h.activeRows("reciter").length === 1 && h.activeRows("reciter")[0].dataset.reciter === "husary");
  h.press(h.row("reciter", "abdulsamad"));
  check("Kârî seçimi: ikinci kârî ('abdulsamad') seçilebiliyor, düğme adı yeni değeri söylüyor", h.$("ezber-dinle-reciter").value === "abdulsamad" && accName(h.d, btn) === `Kârî ${RECITERS.abdulsamad.label}`);
}

// 3g) Dinle formunu uygula: seçilen kârî saklanıyor ve oturuma geçiyor; yeniden açılışta geri yükleniyor
{
  const h = makeEnv();
  h.openEzber();
  h.press(h.$("ezber-dinle-reciter-btn"));
  h.press(h.row("reciter", "abdulsamad"));
  h.press(h.$("ezber-dinle-surah-btn"));
  h.press(h.row("surah", 36));
  h.$("ezber-dinle-from").value = 2;
  h.$("ezber-dinle-to").value = 4;
  h.$("ezber-repeat").value = 3;
  h.$("ezber-repeat-all").value = 2;
  h.press(h.$("ezber-dinle-form").querySelector(".ezber-apply-btn"));
  h.advance(400);
  const start = h.calls.filter((c) => c[0] === "startEzberPlayback");
  check("Uygula: oturum seçilen kârîyle başladı (abdulsamad, 36. sure, 2-4, 3 tekrar, 2 tur)", start.length === 1 && start[0].slice(1).join() === ["abdulsamad", 36, 2, 4, 3, 2].join());
  check("Uygula: ayar saklandı (kârî, sure, aralık, tekrarlar)", JSON.stringify(h.stored().dinle) === JSON.stringify({ reciter: "abdulsamad", surah: 36, from: 2, to: 4, repeat: 3, repeatAll: 2 }));
  check("Uygula: modal kapandı, odak modalı açan düğmeye döndü", !h.isOpen() && h.els.ezberModal.hidden && h.active() === h.els.ezberBtn);
  h.openEzber();
  check("yeniden açılış: kayıtlı kârî ve sure geri yüklendi (düğme metinleri, gizli girişler)", h.$("ezber-dinle-reciter").value === "abdulsamad" && h.$("ezber-dinle-reciter-btn-text").textContent === RECITERS.abdulsamad.label && h.$("ezber-dinle-surah").value === "36" && h.$("ezber-dinle-surah-btn-text").textContent === `36. ${surahs["36"].nameTurkish}`);
  check("yeniden açılış: aralık ve tekrarlar geri yüklendi (2-4, 3, 2)", h.$("ezber-dinle-from").value === "2" && h.$("ezber-dinle-to").value === "4" && h.$("ezber-repeat").value === "3" && h.$("ezber-repeat-all").value === "2");
  // Oku ve Yaz uygula: Kârî olmadan
  h.press(h.$("ezber-tab-oku"));
  h.press(h.$("ezber-oku-form").querySelector(".ezber-apply-btn"));
  const oku = h.calls.filter((c) => c[0] === "startEzberOku");
  check("Oku uygula: oturum başladı (Kârî parametresi yok), ayar yalnızca {surah, from, to}", oku.length === 1 && oku[0].slice(1).length === 3 && JSON.stringify(Object.keys(h.stored().oku)) === JSON.stringify(["surah", "from", "to"]));
  h.openEzber();
  h.press(h.$("ezber-tab-yaz"));
  h.press(h.$("ezber-yaz-form").querySelector(".ezber-apply-btn"));
  check("Yaz uygula: oturum başladı", h.calls.filter((c) => c[0] === "startEzberYaz").length === 1);
  // Kârî alanı yokken ... ve geçersiz aralıkta Uygula: oturum başlamıyor, modal ve seçilen kârî duruyor
  const g = makeEnv();
  g.openEzber();
  g.press(g.$("ezber-dinle-reciter-btn"));
  g.press(g.row("reciter", "abdulsamad"));
  g.$("ezber-dinle-from").value = 5;
  g.$("ezber-dinle-to").value = 2;
  g.press(g.$("ezber-dinle-form").querySelector(".ezber-apply-btn"));
  check("geçersiz aralıkta Uygula: oturum başlamadı, modal açık, seçilen kârî yerinde, bir şey saklanmadı", g.calls.length === 0 && g.isOpen() && g.$("ezber-dinle-reciter").value === "abdulsamad" && Object.keys(g.stored()).length === 0);
}

// 3h) Seçici açıkken modalı kapatma (Esc/perde/Kapat hepsi closeAllModals'a çıkıyor): Dinle'ye sıfırlanıyor, iki form birden görünmüyor
for (const [kind, t] of [["surah", "dinle"], ["surah", "oku"], ["surah", "yaz"], ["reciter", "dinle"]]) {
  const h = makeEnv();
  h.openEzber();
  if (t !== "dinle") h.press(h.$(`ezber-tab-${t}`));
  h.press(h.$(`ezber-${t}-${kind}-btn`));
  check(`kapanış (${kind} seçici açık, ${t}): seçici gerçekten açık`, h.pickers().join() === kind && h.panels().length === 0);
  h.closeAll();
  check(`kapanış (${kind} seçici açık, ${t}): modal kapandı, odak modalı açan düğmede (seçicideki gizlenen düğmede değil)`, !h.isOpen() && h.els.ezberModal.hidden && h.active() === h.els.ezberBtn && !h.fixupHidden());
  check(`kapanış (${kind} seçici açık, ${t}): yalnızca Dinle paneli görünür (iki form üst üste değil), Dinle sekmesi seçili, sekme çubuğu görünür, seçici yok`, h.panels().join() === "dinle" && h.selectedTabs().join() === "dinle" && h.shown("ezber-tabs") && h.pickers().length === 0);
  h.openEzber();
  check(`yeniden açılış (${kind} seçici açıkken kapatılmıştı, ${t}): yalnızca Dinle paneli, tek seçili sekme, seçici yok, odak modalda`, h.panels().join() === "dinle" && h.selectedTabs().join() === "dinle" && h.pickers().length === 0 && h.shown("ezber-tabs") && h.active() === h.modal);
}
for (const kind of ["surah", "reciter"]) {
  // closeModal'ın sıfırlama yolu (restoreFocus verilmeden): odak kapanan modalda açan düğmeye taşınmıyor, modal-odak onu modalı açan düğmeye verecek.
  // Son durum aynı olduğu için yukarıdaki kapanış kontrolleri bunu ayırt etmiyor; ara durum burada doğrudan sınanıyor (jsdom'da odak düzeltmesi yok)
  const h = makeEnv();
  h.openEzber();
  const opener = h.$(`ezber-dinle-${kind}-btn`);
  h.press(opener);
  const picker = h.$(`ezber-${kind}-picker`);
  h.api.closeEzberPicker();
  check(`closeEzberPicker() (${kind}, seçenek verilmeden): seçici gizlendi, odak açan düğmeye taşınmadı`, picker.hidden && h.active() !== opener && h.active() === picker);
}
{
  // seçici KAPALIYKEN de kapanış sıfırlaması çalışıyor (Oku sekmesinden)
  const h = makeEnv();
  h.openEzber();
  h.press(h.$("ezber-tab-oku"));
  h.closeAll();
  h.openEzber();
  check("kapanış (seçici kapalı, Oku sekmesinde): yeniden açılışta Dinle paneli, tek form", h.panels().join() === "dinle" && h.selectedTabs().join() === "dinle");
}

// 3i) Açan düğme odak alamıyorsa odak <body>'ye düşmüyor, modalın kapsayıcısına gidiyor
for (const [kind, t] of [["surah", "oku"], ["reciter", "dinle"]]) {
  const h = makeEnv();
  h.openEzber();
  if (t !== "dinle") h.press(h.$(`ezber-tab-${t}`));
  const btn = h.$(`ezber-${t}-${kind}-btn`);
  h.press(btn);
  btn.focus = () => {}; // gizli/devre dışı/kopmuş: odak alamayan açan
  h.press(h.$(`ezber-${kind}-picker-back`));
  check(`Geri (${kind}): açan düğme odak alamıyorsa odak modalın kapsayıcısına alınıyor (<body>'ye düşmüyor)`, h.pickers().length === 0 && h.panels().join() === t && h.active() === h.modal && !h.fixupHidden());
}

// 3j) Yanlış/boş durum tıklamaları: sessizce yok sayılıyor
{
  const h = makeEnv();
  h.openEzber();
  const sur = h.$("ezber-dinle-surah").value;
  const rec = h.$("ezber-dinle-reciter").value;
  // seçici kapalıyken (satırlar gizli bölümde) sahte tıklamalar: seçilecek bir hedef yok
  h.row("surah", 5).click();
  h.row("reciter", "abdulsamad").click();
  check("seçici KAPALIYKEN bir satır tıklanırsa (gizli satır) değer değişmiyor, hata yok", h.$("ezber-dinle-surah").value === sur && h.$("ezber-dinle-reciter").value === rec && h.pickers().length === 0 && h.panels().join() === "dinle");
  // Kârî seçici açıkken Sure satırına gelen tıklama (olmaması gereken ama listeler kardeş) yok sayılıyor
  h.press(h.$("ezber-dinle-reciter-btn"));
  h.row("surah", 5).click();
  check("Kârî seçici açıkken bir Sure satırına gelen tıklama Sure'yi değiştirmiyor ve seçiciyi kapatmıyor", h.$("ezber-dinle-surah").value === sur && h.pickers().join() === "reciter");
  // Sure seçici açıkken Kârî satırına gelen tıklama yok sayılıyor
  h.press(h.$("ezber-reciter-picker-back"));
  h.press(h.$("ezber-dinle-surah-btn"));
  h.row("reciter", "abdulsamad").click();
  check("Sure seçici açıkken bir Kârî satırına gelen tıklama Kârî'yi değiştirmiyor ve seçiciyi kapatmıyor", h.$("ezber-dinle-reciter").value === rec && h.pickers().join() === "surah");
  // liste kapsayıcısının kendisine (satır olmayan yer) tıklama
  h.$("ezber-surah-picker-list").click();
  h.$("ezber-surah-picker").click();
  check("seçici listesinin ya da kapsayıcısının satır olmayan yerine tıklama hiçbir şey yapmıyor", h.pickers().join() === "surah" && h.$("ezber-dinle-surah").value === sur);
  // sure satırı seçiminde dataset taşıyan iç öğeye tıklama (satırın içindeki span): closest(.modal-item)
  h.press(h.row("surah", 7).querySelector(".modal-item-sub"));
  check("satırın iç öğesine (alt satır) tıklama satırı seçiyor (7. sure)", h.$("ezber-dinle-surah").value === "7" && h.pickers().length === 0);
  // seçici kapalıyken Geri düğmesine (gizli) tıklama: kayıt yok, odağa dokunulmuyor
  h.openEzber; // (modal zaten açık)
  const before = h.active();
  h.$("ezber-surah-picker-back").click();
  h.$("ezber-reciter-picker-back").click();
  check("seçici kapalıyken gizli Geri düğmelerine tıklama: durum ve odak aynı, hata yok", h.active() === before && h.pickers().length === 0 && h.panels().join() === "dinle" && h.shown("ezber-tabs"));
}

// 3k) Seçiciler birbirini ve sekmeleri bozmuyor: art arda açma/kapama
{
  const h = makeEnv();
  h.openEzber();
  for (let i = 0; i < 6; i++) {
    h.press(h.$("ezber-dinle-reciter-btn"));
    h.press(h.$("ezber-reciter-picker-back"));
    h.press(h.$("ezber-dinle-surah-btn"));
    h.press(h.$("ezber-surah-picker-back"));
  }
  check("Kârî ve Sure seçici art arda 6 kez açılıp Geri ile kapandı: tek form, sekme çubuğu görünür, odak Sure düğmesinde", h.pickers().length === 0 && h.panels().join() === "dinle" && h.shown("ezber-tabs") && h.active() === h.$("ezber-dinle-surah-btn") && h.selectedTabs().join() === "dinle");
  check("art arda açma/kapamada listeler çoğalmadı (114 ve RECITERS kadar satır)", h.$("ezber-surah-picker-list").children.length === 114 && h.$("ezber-reciter-picker-list").children.length === RECITER_KEYS.length);
}

// -- (4) Rastgele işlem dizisi x bağımsız model ------------------------------------------------------------------
function runRandom(seed, steps) {
  const rnd = mulberry32(seed);
  const pickOf = (arr) => arr[Math.floor(rnd() * arr.length)];
  // rastgele kayıtlı ayar: bazı tohumlarda yok, bazılarında bozuk kârî
  let store = {};
  if (rnd() < 0.6) {
    const sv = () => 1 + Math.floor(rnd() * 114);
    const rec = pickOf(["husary", "abdulsamad", "nope", undefined]);
    const mk = (n) => ({ surah: n, from: 1, to: Math.min(versesOf(n), 1 + Math.floor(rnd() * 3)) });
    const dn = mk(sv());
    store = {
      dinle: { ...(rec === undefined ? {} : { reciter: rec }), ...dn, repeat: 1 + Math.floor(rnd() * 3), repeatAll: 1 + Math.floor(rnd() * 3) },
      oku: mk(sv()),
      yaz: mk(sv()),
    };
    if (rnd() < 0.3) delete store.oku;
  }
  const h = makeEnv({ saved: Object.keys(store).length ? store : null });
  const M = { open: false, tab: "dinle", picker: null, reciter: "husary", surah: {}, from: {}, to: {}, repeat: 1, repeatAll: 1, store: JSON.parse(JSON.stringify(store)), calls: 0 };
  const modelOpen = () => {
    const dn = M.store.dinle;
    M.reciter = dn && RECITERS[dn.reciter] ? dn.reciter : "husary";
    for (const t of TABS) {
      const s = M.store[t];
      M.surah[t] = s ? s.surah : FALLBACK_SURAH;
      M.from[t] = s ? s.from : 1;
      M.to[t] = s ? s.to : 1;
    }
    M.repeat = dn ? dn.repeat : 1;
    M.repeatAll = dn ? dn.repeatAll : 1;
    M.open = true;
    M.tab = "dinle";
    M.picker = null;
  };
  const fails = [];
  const log = [];
  const heavy = seed % 4 === 0; // Tab durakları (114 satırlık liste üzerinde yavaş) yalnızca bazı tohumlarda her adımda sınanıyor
  const verify = (op, expectFocus) => {
    const where = `seed ${seed} adım ${log.length} [${log.slice(-4).join(" > ")}]`;
    const bad = (m) => fails.push(`${where}: ${m}`);
    if (h.isOpen() !== M.open) return bad(`modal açık ${h.isOpen()} != ${M.open}`);
    if (!M.open) {
      if (!h.els.ezberModal.hidden) bad("kapalı modal hidden değil");
      if (h.panels().join() !== "dinle" || h.selectedTabs().join() !== "dinle" || !h.shown("ezber-tabs") || h.pickers().length) bad(`kapalıyken sıfırlanmadı: paneller ${h.panels()} seçili ${h.selectedTabs()} seçici ${h.pickers()}`);
    } else {
      const wantPanels = M.picker ? [] : [M.tab];
      if (h.panels().join() !== wantPanels.join()) bad(`paneller ${h.panels()} != ${wantPanels}`);
      if (h.shown("ezber-tabs") === !!M.picker) bad(`sekme çubuğu görünürlüğü ${h.shown("ezber-tabs")} (seçici ${!!M.picker})`);
      if (h.pickers().join() !== (M.picker ? M.picker.kind : "")) bad(`seçiciler ${h.pickers()} != ${M.picker ? M.picker.kind : "-"}`);
      if (h.selectedTabs().join() !== M.tab) bad(`seçili sekme ${h.selectedTabs()} != ${M.tab}`);
      if (h.$("ezber-dinle-reciter").value !== M.reciter || h.$("ezber-dinle-reciter-btn-text").textContent !== RECITERS[M.reciter].label) bad(`Kârî ${h.$("ezber-dinle-reciter").value} / '${h.$("ezber-dinle-reciter-btn-text").textContent}' != ${M.reciter}`);
      for (const t of TABS) {
        if (h.$(`ezber-${t}-surah`).value !== String(M.surah[t]) || h.$(`ezber-${t}-surah-btn-text`).textContent !== `${M.surah[t]}. ${surahs[String(M.surah[t])].nameTurkish}`) bad(`${t} Sure ${h.$(`ezber-${t}-surah`).value} != ${M.surah[t]}`);
        if (h.$(`ezber-${t}-from`).value !== String(M.from[t]) || h.$(`ezber-${t}-to`).value !== String(M.to[t])) bad(`${t} aralık ${h.$(`ezber-${t}-from`).value}-${h.$(`ezber-${t}-to`).value} != ${M.from[t]}-${M.to[t]}`);
      }
      if (h.$("ezber-repeat").value !== String(M.repeat) || h.$("ezber-repeat-all").value !== String(M.repeatAll)) bad("tekrar alanları modelden farklı");
      if (M.picker) {
        const cur = M.picker.kind === "surah" ? String(M.surah[M.picker.target]) : M.reciter;
        const rows = h.activeRows(M.picker.kind);
        if (rows.length !== 1 || rows[0].dataset[M.picker.kind] !== cur) bad(`etkin satır ${rows.map((r) => r.dataset[M.picker.kind])} != ${cur}`);
        if (heavy) {
          // liste tek durak (js/liste-gezintisi.js): Kapat, Geri, geçerli satır, iki alt bilgi bağlantısı (Kaynak Kod, Kaynaklar ve lisanslar)
          const tb = tabbablesIn(h.modal);
          if (tb.length !== 5 || tb[1].id !== `ezber-${M.picker.kind}-picker-back` || tb[2].dataset[M.picker.kind] !== cur) bad(`seçicide Tab durakları ${tb.length} (beklenen 5: Kapat, Geri, geçerli satır, iki alt bilgi bağlantısı)`);
        }
      } else if (heavy) {
        const t = h.tabIds();
        if (t[0] !== "modal-close" || t[1] !== `ezber-tab-${M.tab}`) bad(`Tab durakları ${t.slice(0, 3)}`);
        if (M.tab === "dinle" && t[2] !== "ezber-dinle-reciter-btn") bad("Dinle'de Kârî düğmesi Tab sırasının 3. durağı değil");
      }
      if (h.fixupHidden()) bad("modal açıkken odak <body>'de");
      else if (!h.modal.contains(h.active())) bad("odak modalın dışında");
      else if (h.active().closest("[hidden]") && h.active() !== h.modal) bad("odak gizli bir bölümün içinde");
    }
    if (expectFocus !== undefined) {
      const want = typeof expectFocus === "function" ? expectFocus() : expectFocus;
      if (h.active() !== want) bad(`odak ${h.active() && (h.active().id || h.active().className)} != beklenen ${want && (want.id || want.className)} (${op})`);
    }
    const stored = h.stored();
    if (JSON.stringify(stored) !== JSON.stringify(M.store)) bad(`saklanan ayar modelden farklı: ${JSON.stringify(stored)} != ${JSON.stringify(M.store)}`);
    if (h.calls.filter((c) => c[0].startsWith("startEzber")).length !== M.calls) bad(`başlatılan oturum sayısı ${h.calls.filter((c) => c[0].startsWith("startEzber")).length} != ${M.calls}`);
  };

  for (let i = 0; i < steps; i++) {
    const ops = [];
    if (!M.open) ops.push("open", "open");
    else if (M.picker) ops.push("back", "pick", "pick", "pick", "close");
    else ops.push("tab", "tab", "pickSurah", "pickSurah", "submit", "close", ...(M.tab === "dinle" ? ["pickReciter", "pickReciter"] : []));
    const op = pickOf(ops);
    log.push(op);
    if (op === "open") {
      h.openEzber();
      modelOpen();
      verify(op, h.modal);
    } else if (op === "tab") {
      const t = pickOf(TABS);
      h.press(h.$(`ezber-tab-${t}`));
      M.tab = t;
      verify(op, h.$(`ezber-tab-${t}`));
    } else if (op === "pickSurah" || op === "pickReciter") {
      const kind = op === "pickSurah" ? "surah" : "reciter";
      const btn = h.$(`ezber-${M.tab}-${kind}-btn`);
      h.press(btn);
      M.picker = { kind, target: M.tab, opener: btn };
      verify(op, h.$(`ezber-${kind}-picker`));
    } else if (op === "back") {
      const { kind, opener } = M.picker;
      h.press(h.$(`ezber-${kind}-picker-back`));
      M.picker = null;
      verify(op, opener);
    } else if (op === "pick") {
      const { kind, target, opener } = M.picker;
      if (kind === "surah") {
        const n = 1 + Math.floor(rnd() * 114);
        h.press(h.row("surah", n));
        M.surah[target] = n;
        M.from[target] = 1;
        M.to[target] = versesOf(n);
      } else {
        const key = pickOf(RECITER_KEYS);
        h.press(h.row("reciter", key));
        M.reciter = key;
      }
      M.picker = null;
      verify(op, opener);
    } else if (op === "submit") {
      const t = M.tab;
      const submitBtn = h.$(`ezber-${t}-form`).querySelector(".ezber-apply-btn");
      h.press(submitBtn); // aralık hep geçerli: rastgele dizide geçersiz aralık yok (deterministik senaryo 3g'de var)
      {
        M.calls += 1;
        M.store[t] = t === "dinle" ? { reciter: M.reciter, surah: M.surah[t], from: M.from[t], to: M.to[t], repeat: M.repeat, repeatAll: M.repeatAll } : { surah: M.surah[t], from: M.from[t], to: M.to[t] };
        const last = h.calls.filter((c) => c[0].startsWith("startEzber")).slice(-1)[0];
        const want = t === "dinle" ? ["startEzberPlayback", M.reciter, M.surah[t], M.from[t], M.to[t], M.repeat, M.repeatAll] : [t === "oku" ? "startEzberOku" : "startEzberYaz", M.surah[t], M.from[t], M.to[t]];
        if (!last || JSON.stringify(last) !== JSON.stringify(want)) fails.push(`seed ${seed}: başlatılan oturum ${JSON.stringify(last)} != ${JSON.stringify(want)}`);
        h.advance(400);
        M.open = false;
        M.picker = null;
        M.tab = "dinle";
        verify(op, h.els.ezberBtn);
      }
    } else if (op === "close") {
      h.closeAll();
      M.open = false;
      M.picker = null;
      M.tab = "dinle";
      verify(op, h.els.ezberBtn);
    }
    if (fails.length > 6) break;
  }
  return { fails, steps: log.length };
}

{
  let total = 0;
  const allFails = [];
  for (let seed = 1; seed <= 24; seed++) {
    const r = runRandom(seed * 7919, 140);
    total += r.steps;
    allFails.push(...r.fails);
  }
  check(`rastgele dizi: 24 tohum x 140 işlem (açma, sekme, iki seçici, Geri, satır seçimi, Uygula, kapatma) bağımsız modelle uyuşuyor (${total} işlem, ${allFails.length} sapma)${allFails.length ? " -- " + allFails.slice(0, 3).join(" | ") : ""}`, allFails.length === 0);
}

check(`jsdom'da olay dinleyicilerinde yakalanmamış hata yok (${jsdomErrors.length}${jsdomErrors.length ? ": " + jsdomErrors.slice(0, 2).join(" | ") : ""})`, jsdomErrors.length === 0);

if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All checks passed (Ezber Sure ve Kârî seçicileri: ortak düğme + alt-görünüm kalıbı (yapı karşılaştırması), odak seçiciye girişte kapsayıcıya, Geri ve satır seçiminde açan düğmeye, kapanış sıfırlaması (Oku/Yaz'da seçici açıkken kapatma dahil), mevcut satırın seçici görünürken ortalanması, Kârî geri yükleme/saklama/oturum, erişilebilir adlar, Tab sırası, odak alamayan açan, yanlış tıklamalar, rastgele diziler x model).");
