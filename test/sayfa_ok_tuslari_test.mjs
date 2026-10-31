// Sol/Sağ ok ile sayfa çevirme kısayolunun (onPageTurnKeydown) YALNIZCA düz ok tuşunda çalışması. Regresyon kontrolü.
//
// Neden var: setupNav'ın document'teki 'keydown' dinleyicisi, açık modal dışında her Sol/Sağ ok basışında sayfa çeviriyordu: tuşun yanında
// Alt/Ctrl/Meta/Shift olsa da, olayı başka bir işleyici zaten tüketmiş olsa da, IME bileşimi sürüyor olsa da, odak oklarla kendi işini gören
// bir öğede (metin/sayı kutusu, kaydırıcı, açılır liste, radyo, sekme listesi...) olsa da. Gerçek Chromium'da ölçülen durum (430 px, sayfa 50,
// odak gövdede; Playwright klavyesi = gerçek tuş olayları), düzeltmeden ÖNCE:
//   - Alt+Sol/Sağ (tarayıcı geri/ileri), Ctrl+Sol/Sağ, Shift+Sol/Sağ, Meta+Sol/Sağ (macOS'ta geri/ileri), Ctrl+Shift+Sol, Ctrl+Alt+Sağ
//     (AltGr benzeri): 10/10 birleşimde sayfa DÖNDÜ (50 -> 51 / 49) ve localStorage'daki son konum (mushaf:lastPosition) da ilerledi: sekme
//     kapatılıp açılınca kullanıcı bıraktığı sayfada değil, kısayolun istemeden çevirdiği sayfada açılıyordu;
//   - başka bir işleyicinin preventDefault ettiği Sol ok ve isComposing=true (sentetik) olay: sayfa DÖNDÜ;
//   - odak oklarla kendi işini gören bir öğedeyse (gövdeye eklenen sahte öğelerle: metin kutusu, sayı kutusu, kaydırıcı, açılır liste,
//     çok satırlı alan, contenteditable, role=slider, sekme listesindeki sekme, listbox seçeneği, radyo): 10/10'unda sayfa DÖNDÜ (kaydırıcıda
//     değer de değişti: 5 -> 4; radyoda odak da başka radyoya geçti) -- gerçek uygulamada bu öğeler yalnızca modalların içinde (envanter:
//     14 öğe, modal dışında 0) ve modal açıkken dinleyici zaten vazgeçiyor, yani bu yalnızca ileride modal dışına konacak bir alan için risk;
//   - Ezber > Yaz oturumu sürerken: ekran tuşunda Shift+Sol, ekran tuşunda Alt+Sağ, gövdedeyken Ctrl+Sol OTURUMU BİTİRDİ (kapaklar 27 -> 0,
//     ekran klavyesi gizlendi): Yaz klavyesinin ok işleyicisi değiştiricili okları kasıtlı olarak yok sayıp olayı bırakıyor, document'teki
//     dinleyici de onları sayfa çevirme sayıyordu.
// Düzeltmeden sonra aynı sahneler: düz Sol/Sağ eskisi gibi çeviriyor (gövdede, gezgindeki ayet düğmesinde, açık ayet panelinin düğmesinde);
// 10/10 değiştiricili birleşimde, tüketilmiş olayda, bileşimde ve 10/10 ok kullanan öğede sayfa DÖNMÜYOR ve son konum yerinde kalıyor; düğme,
// onay kutusu ve bağlantıda düz ok yine çeviriyor; Yaz oturumu Shift/Alt/Ctrl+ok'tan etkilenmiyor (kapaklar 27, klavye görünür); gövdedeki DÜZ
// Sol ok Yaz oturumunu eskisi gibi bitiriyor (bilinçli sayfa çevirme). Tuş BASILI TUTULUNCA (e.repeat) her tekrar sayfa çevirmeye devam ediyor
// (5 tekrar = 5 sayfa; önce de öyleydi, bilerek değiştirilmedi).
//
// Düzeltme (js/app.js): satır içi dinleyici adlandırılmış işleve (onPageTurnKeydown) çıkarıldı; sırayla vazgeçiyor: açık modal; Sol/Sağ dışındaki
// tuş; Alt/Ctrl/Meta/Shift; defaultPrevented ya da isComposing; hedef ARROW_KEY_OWNER_SELECTOR'a uyuyorsa (yazı alanları, kaydırıcı, açılır
// liste, radyo, ARIA'daki karşılıkları, sekme/menü/liste/ağaç/ızgara gibi bileşik bileşenler). Düz düğme, onay kutusu, bağlantı ve gezgin/panel
// düğmeleri bu listede değil: orada düz ok eskisi gibi sayfa çevirir.
//
// Burada kontrol edilenler:
//   (1) kaynak: işlev ve seçici var, setupNav document'in 'keydown'ına onPageTurnKeydown'ı bağlıyor, satır içi çevirme dinleyicisi kalmadı;
//   (2) davranış: app.js'ten çıkarılan GERÇEK işlev x GERÇEK index.html DOM'u x gerçek KeyboardEvent'ler: düz tuşlar ve yönler, diğer tuşlar,
//       15 değiştirici birleşimi x 2 yön, açık modal, tüketilmiş olay, bileşim, ok kullanan / kullanmayan hedefler (hepsi tek tek), sahte
//       olay nesneleri; ayrıca index.html'deki HER öğe için (bağımsız bir elle yazılmış sınıflandırıcıya karşı) düz ok ve Shift+ok;
//   (3) GERÇEK Yaz ekran klavyesi işleyicisiyle (onEzberYazKeyboardKeydown) birlikte: düz ok klavyede tüketiliyor (sayfa çevrilmiyor, odak
//       geçiyor); Shift/Alt/Ctrl/Meta+ok klavyenin işleyicisinden geçip document'e ulaşıyor ve orada sayfa ÇEVİRMİYOR;
//   (4) 20 tohumlu rastgele dizi (3000 olay): tuş x değiştirici x hedef x tüketilmiş x bileşim x modal, bağımsız bir kurala karşı.
//
// ÖNEMLİ SINIR: jsdom'da gerçek tarayıcı kısayolları (Alt+Sol = geri) ve gerçek IME yok; olaylar elle üretiliyor, isComposing sentetik. Gerçek
// Chromium ölçümü (README) başsızdı: tarayıcının kendi geri/ileri kısayolunu işlemiyor, yalnızca sayfaya ulaşan olayları sınıyor. Gerçek ekran
// okuyucu (NVDA/JAWS/VoiceOver/TalkBack) çalıştırılmadı; macOS VoiceOver'ın Ctrl+Option+Sol/Sağ'ı sayfaya hiç ulaşmayabilir (denenmedi).
//
//   node sayfa_ok_tuslari_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const appSource = readText("js", "app.js");
const html = readText("index.html");

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}

// Bir işlevin kaynağı (süslü parantezleri sayarak).
function fnSource(name) {
  const m = new RegExp(`(?:async )?function ${name}\\(`).exec(appSource);
  if (!m) return null;
  const open = appSource.indexOf("{", appSource.indexOf(")", m.index));
  let depth = 0;
  for (let i = open; i < appSource.length; i++) {
    if (appSource[i] === "{") depth++;
    else if (appSource[i] === "}" && --depth === 0) return appSource.slice(m.index, i + 1);
  }
  return null;
}

const turnSrc = fnSource("onPageTurnKeydown");
const yazKbSrc = fnSource("onEzberYazKeyboardKeydown");
const setupNavSrc = fnSource("setupNav");
const selM = /const ARROW_KEY_OWNER_SELECTOR = \[[\s\S]*?\]\.join\(", "\);/.exec(appSource);
check("app.js: onPageTurnKeydown bulundu", !!turnSrc);
check("app.js: ARROW_KEY_OWNER_SELECTOR bulundu", !!selM);
check("app.js: onEzberYazKeyboardKeydown ve setupNav bulundu", !!yazKbSrc && !!setupNavSrc);
if (!turnSrc || !selM || !yazKbSrc || !setupNavSrc) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}

// -- (1) Kaynak ----------------------------------------------------------------------------------------------
check("app.js: onPageTurnKeydown tek bir yerde tanımlı", (appSource.match(/function onPageTurnKeydown\(/g) || []).length === 1);
check(
  "app.js: setupNav sayfa çevirme dinleyicisini bağlıyor: document 'keydown' -> onPageTurnKeydown (tam bir kez)",
  (setupNavSrc.match(/document\.addEventListener\("keydown", onPageTurnKeydown\);/g) || []).length === 1
);
check(
  "app.js: setupNav'ta goToNextPage/goToPrevPage çağıran satır içi (isimsiz) bir 'keydown' dinleyicisi KALMADI",
  !/addEventListener\("keydown", \(\w*\) => \{[^}]*goTo(?:Next|Prev)Page/.test(setupNavSrc)
);
check("app.js: onPageTurnKeydown'ın ilk koşulu açık modalda vazgeçmek (modalın içindeki alanlarda oklar sayfa çevirmesin)", /^function onPageTurnKeydown\(e\) \{\s*if \(state\.openModalEl\) return;/.test(turnSrc));

// -- Ortak donanım --------------------------------------------------------------------------------------------
// state / goToNextPage / goToPrevPage dışarıdan veriliyor; işlev ve seçici app.js'ten OLDUĞU GİBİ alınıyor.
function makeEnv({ yazHandler = false } = {}) {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const d = dom.window.document;
  const state = { openModalEl: null };
  const calls = { next: 0, prev: 0 };
  const api = new Function("state", "goToNextPage", "goToPrevPage", `${selM[0]}\n${turnSrc}\nreturn { onPageTurnKeydown, ARROW_KEY_OWNER_SELECTOR };`)(
    state,
    () => calls.next++,
    () => calls.prev++
  );
  d.addEventListener("keydown", api.onPageTurnKeydown); // setupNav'taki bağlama ile aynı
  const env = { dom, win: dom.window, d, state, calls, api };
  if (yazHandler) {
    env.yazKeyboard = d.getElementById("yaz-keyboard");
    const handler = new Function("els", `${yazKbSrc}\nreturn onEzberYazKeyboardKeydown;`)({ yazKeyboard: env.yazKeyboard });
    env.yazKeyboard.addEventListener("keydown", handler); // setupEzberYazKeyboard'taki bağlama ile aynı
  }
  return env;
}
function press(env, target, init) {
  const ev = new env.win.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  (target || env.d.body).dispatchEvent(ev);
  return ev;
}
// "next" | "prev" | "none" | "both"
function outcome(env, target, init) {
  env.calls.next = 0;
  env.calls.prev = 0;
  press(env, target, init);
  if (env.calls.next && env.calls.prev) return "both";
  return env.calls.next ? "next" : env.calls.prev ? "prev" : "none";
}
const LEFT = { key: "ArrowLeft", code: "ArrowLeft" };
const RIGHT = { key: "ArrowRight", code: "ArrowRight" };

// -- (2) Davranış ---------------------------------------------------------------------------------------------
{
  const env = makeEnv();
  const { d, win } = env;
  const body = d.body;

  check("test donanımı: jsdom KeyboardEvent isComposing / ctrlKey / defaultPrevented destekliyor (testin geçerliliği)", (() => {
    const e = new win.KeyboardEvent("keydown", { isComposing: true, ctrlKey: true, cancelable: true });
    e.preventDefault();
    return e.isComposing === true && e.ctrlKey === true && e.defaultPrevented === true;
  })());
  check("ARROW_KEY_OWNER_SELECTOR geçerli bir CSS seçici (yazım hatası yok)", (() => {
    try {
      d.querySelector(env.api.ARROW_KEY_OWNER_SELECTOR);
      return true;
    } catch (e) {
      return false;
    }
  })());

  // ---- düz tuşlar ----
  check("düz Sol ok -> sonraki sayfa (ekrandaki ok düğmeleriyle aynı yön)", outcome(env, body, LEFT) === "next");
  check("düz Sağ ok -> önceki sayfa", outcome(env, body, RIGHT) === "prev");
  check("düz Sol ok, olay document'in kendisinde (hedef Element değil, closest yok) -> yine çeviriyor", outcome(env, d, LEFT) === "next");
  check("düz Sağ ok, olay document'in kendisinde -> yine çeviriyor", outcome(env, d, RIGHT) === "prev");
  for (const key of ["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Enter", " ", "Tab", "Escape", "a", "ب", "Left", "Right", "Process"]) {
    check(`Sol/Sağ dışındaki tuş (${JSON.stringify(key)}) sayfa çevirmiyor`, outcome(env, body, { key }) === "none");
  }

  // ---- değiştiriciler ----
  const MODS = ["altKey", "ctrlKey", "metaKey", "shiftKey"];
  for (const m of MODS) {
    check(`${m} + Sol ok sayfa ÇEVİRMİYOR`, outcome(env, body, { ...LEFT, [m]: true }) === "none");
    check(`${m} + Sağ ok sayfa ÇEVİRMİYOR`, outcome(env, body, { ...RIGHT, [m]: true }) === "none");
  }
  {
    const bad = [];
    for (let mask = 1; mask < 16; mask++) {
      const mods = Object.fromEntries(MODS.map((m, i) => [m, !!(mask & (1 << i))]));
      for (const base of [LEFT, RIGHT]) if (outcome(env, body, { ...base, ...mods }) !== "none") bad.push(`${mask}/${base.key}`);
    }
    check(`15 değiştirici birleşimi x 2 yön: hiçbirinde sayfa dönmüyor (dönen: ${bad.join(", ") || "yok"})`, bad.length === 0);
  }
  check("değiştiriciler false verildiğinde (açıkça) düz ok eskisi gibi çeviriyor", outcome(env, body, { ...LEFT, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }) === "next");

  // ---- açık modal ----
  env.state.openModalEl = d.getElementById("surah-modal");
  check("açık modalda düz Sol ok sayfa çevirmiyor", outcome(env, body, LEFT) === "none");
  check("açık modalda düz Sağ ok sayfa çevirmiyor", outcome(env, body, RIGHT) === "none");
  env.state.openModalEl = null;
  check("modal kapanınca düz ok yine çeviriyor", outcome(env, body, LEFT) === "next" && outcome(env, body, RIGHT) === "prev");

  // ---- başka işleyici olayı tüketmiş ----
  {
    const prevent = (e) => e.preventDefault();
    body.addEventListener("keydown", prevent);
    check("olay başka bir işleyici tarafından preventDefault edilmişse (gövde işleyicisi) Sol ok sayfa çevirmiyor", outcome(env, body, LEFT) === "none");
    check("... Sağ ok da", outcome(env, body, RIGHT) === "none");
    const btn = d.getElementById("ezber-btn");
    check("... odaktaki düğmeden gelen olayda da", outcome(env, btn, LEFT) === "none");
    body.removeEventListener("keydown", prevent);
    check("tüketen işleyici kalkınca düz ok yine çeviriyor", outcome(env, body, LEFT) === "next");
    const observe = (e) => void e.key; // tüketmeyen (yalnızca izleyen) bir işleyici engel olmamalı
    body.addEventListener("keydown", observe);
    check("tüketmeyen bir işleyici varsa düz ok yine çeviriyor", outcome(env, body, LEFT) === "next");
    body.removeEventListener("keydown", observe);
  }

  // ---- IME bileşimi ----
  check("isComposing=true iken Sol ok sayfa çevirmiyor", outcome(env, body, { ...LEFT, isComposing: true }) === "none");
  check("isComposing=true iken Sağ ok sayfa çevirmiyor", outcome(env, body, { ...RIGHT, isComposing: true }) === "none");
  check("isComposing=false iken düz ok çeviriyor", outcome(env, body, { ...LEFT, isComposing: false }) === "next");

  // ---- tuş basılı tutulunca ----
  check("tuş basılı tutulunca (repeat=true) her tekrar sayfa çevirmeye devam ediyor (önce de öyleydi; bilerek değiştirilmedi)", outcome(env, body, { ...LEFT, repeat: true }) === "next" && outcome(env, body, { ...RIGHT, repeat: true }) === "prev");

  // ---- hedefler ----
  const host = d.createElement("div");
  host.id = "test-host";
  body.appendChild(host);
  const make = (htmlStr) => {
    host.innerHTML = htmlStr;
    return host.querySelector("#t");
  };
  // [ad, işaretleme, oklarla kendi işini görüyor mu]
  const TARGETS = [
    ["input (tür belirtilmemiş)", `<input id="t">`, true],
    ["input type=text", `<input id="t" type="text">`, true],
    ["input type=search", `<input id="t" type="search">`, true],
    ["input type=number", `<input id="t" type="number">`, true],
    ["input type=range", `<input id="t" type="range">`, true],
    ["input type=radio", `<input id="t" type="radio" name="r">`, true],
    ["input type=email", `<input id="t" type="email">`, true],
    ["input type=password", `<input id="t" type="password">`, true],
    ["input type=tel", `<input id="t" type="tel">`, true],
    ["input type=url", `<input id="t" type="url">`, true],
    ["input type=date", `<input id="t" type="date">`, true],
    ["input type=time", `<input id="t" type="time">`, true],
    ["input type=TEXT (büyük harf)", `<input id="t" type="TEXT">`, true],
    ["textarea", `<textarea id="t"></textarea>`, true],
    ["select", `<select id="t"><option>a</option></select>`, true],
    ["contenteditable (boş değer)", `<div id="t" contenteditable tabindex="0">x</div>`, true],
    ["contenteditable=true", `<div id="t" contenteditable="true" tabindex="0">x</div>`, true],
    ["contenteditable=plaintext-only", `<div id="t" contenteditable="plaintext-only" tabindex="0">x</div>`, true],
    ["contenteditable içindeki span", `<div contenteditable="true"><span id="t">x</span></div>`, true],
    ["role=textbox", `<div id="t" role="textbox" tabindex="0">x</div>`, true],
    ["role=searchbox", `<div id="t" role="searchbox" tabindex="0">x</div>`, true],
    ["role=combobox", `<div id="t" role="combobox" tabindex="0">x</div>`, true],
    ["role=slider", `<div id="t" role="slider" tabindex="0">x</div>`, true],
    ["role=spinbutton", `<div id="t" role="spinbutton" tabindex="0">x</div>`, true],
    ["role=scrollbar", `<div id="t" role="scrollbar" tabindex="0">x</div>`, true],
    ["role=tablist içindeki sekme", `<div role="tablist"><button id="t" role="tab">x</button></div>`, true],
    ["role=radiogroup içindeki radyo", `<div role="radiogroup"><div id="t" role="radio" tabindex="0">x</div></div>`, true],
    ["role=toolbar içindeki düğme", `<div role="toolbar"><button id="t" type="button">x</button></div>`, true],
    ["role=menu içindeki öğe", `<div role="menu"><div id="t" role="menuitem" tabindex="0">x</div></div>`, true],
    ["role=menubar içindeki öğe", `<div role="menubar"><div id="t" role="menuitem" tabindex="0">x</div></div>`, true],
    ["role=listbox içindeki seçenek", `<div role="listbox"><div id="t" role="option" tabindex="0">x</div></div>`, true],
    ["role=tree içindeki öğe", `<div role="tree"><div id="t" role="treeitem" tabindex="0">x</div></div>`, true],
    ["role=treegrid içindeki hücre", `<div role="treegrid"><div id="t" role="gridcell" tabindex="0">x</div></div>`, true],
    ["role=grid içindeki hücre", `<div role="grid"><div id="t" role="gridcell" tabindex="0">x</div></div>`, true],
    // ---- ok tuşunu kullanmayanlar: düz ok eskisi gibi sayfa çevirir ----
    ["button", `<button id="t" type="button">x</button>`, false],
    ["button type=submit", `<button id="t" type="submit">x</button>`, false],
    ["input type=button", `<input id="t" type="button" value="x">`, false],
    ["input type=submit", `<input id="t" type="submit" value="x">`, false],
    ["input type=reset", `<input id="t" type="reset" value="x">`, false],
    ["input type=image", `<input id="t" type="image" alt="x">`, false],
    ["input type=checkbox", `<input id="t" type="checkbox">`, false],
    ["input type=file", `<input id="t" type="file">`, false],
    ["input type=color", `<input id="t" type="color">`, false],
    ["input type=hidden", `<input id="t" type="hidden">`, false],
    ["a href", `<a id="t" href="#x">x</a>`, false],
    ["contenteditable=false", `<div id="t" contenteditable="false" tabindex="0">x</div>`, false],
    ["role=region içindeki düğme (ayet paneli)", `<div role="region"><button id="t" type="button" class="wm-tafsir-tab" aria-expanded="false">x</button></div>`, false],
    ["role=group içindeki düğme (Yaz klavyesi)", `<div role="group"><button id="t" type="button" class="yaz-key" data-char="ا">x</button></div>`, false],
    ["role=link (konu bağlantısı)", `<span id="t" role="link" tabindex="0">x</span>`, false],
    ["role=button", `<div id="t" role="button" tabindex="0">x</div>`, false],
    ["role=tabpanel içindeki metin", `<div role="tabpanel"><p id="t">x</p></div>`, false],
    ["ayet gezgini düğmesi (nav > ul > li > button)", `<nav><ul><li><button id="t" type="button" class="ayah-nav-item" aria-current="true">x</button></li></ul></nav>`, false],
    ["tabindex=-1'li düz kapsayıcı", `<div id="t" tabindex="-1">x</div>`, false],
    ["SVG içindeki rect", `<svg><rect id="t" width="1" height="1"></rect></svg>`, false],
  ];
  for (const [name, markup, owns] of TARGETS) {
    const el = make(markup);
    const okLeft = !!el && outcome(env, el, LEFT) === (owns ? "none" : "next");
    const okRight = !!el && outcome(env, el, RIGHT) === (owns ? "none" : "prev");
    check(`hedef ${name}: düz Sol/Sağ ok ${owns ? "sayfa ÇEVİRMİYOR (ok önce o öğenin)" : "eskisi gibi sayfa çeviriyor"}`, okLeft && okRight);
  }
  host.innerHTML = "";

  // ---- gerçek index.html: HER öğe, bağımsız ve elle yazılmış bir sınıflandırıcıya karşı ----
  // (modal açık DEĞİL: yalnızca hedef koruması sınanıyor; modallerin içindeki alanlar gerçekte modal korumasıyla zaten vazgeçilen yerler)
  {
    const NON_ARROW_INPUT = new Set(["button", "submit", "reset", "image", "checkbox", "file", "color", "hidden"]);
    const OWNER_ROLES = new Set(["textbox", "searchbox", "combobox", "slider", "spinbutton", "scrollbar", "tablist", "radiogroup", "toolbar", "menu", "menubar", "listbox", "tree", "treegrid", "grid"]);
    const ownsArrows = (el) => {
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const tag = n.tagName.toLowerCase();
        if (tag === "input" && !NON_ARROW_INPUT.has((n.getAttribute("type") || "text").toLowerCase())) return true;
        if (tag === "textarea" || tag === "select") return true;
        const ce = n.getAttribute("contenteditable");
        if (ce !== null && ce.toLowerCase() !== "false") return true;
        const role = n.getAttribute("role");
        if (role && OWNER_ROLES.has(role)) return true;
      }
      return false;
    };
    const all = [...d.querySelectorAll("body, body *")].filter((el) => !host.contains(el));
    const owners = all.filter(ownsArrows);
    check(`index.html: sınanan öğe sayısı yeterli (${all.length}; ok kullanan: ${owners.length}, kullanmayan: ${all.length - owners.length})`, all.length > 200 && owners.length >= 14 && all.length - owners.length > 100);
    const badPlain = [];
    const badShift = [];
    for (const el of all) {
      const want = ownsArrows(el) ? "none" : "next";
      if (outcome(env, el, LEFT) !== want) badPlain.push(`${el.tagName.toLowerCase()}#${el.id || ""}`);
      if (outcome(env, el, { ...LEFT, shiftKey: true }) !== "none") badShift.push(`${el.tagName.toLowerCase()}#${el.id || ""}`);
    }
    check(`index.html'deki her öğede düz Sol ok: ok kullanan öğede çevirmiyor, diğerlerinde çeviriyor (yanlış: ${badPlain.slice(0, 5).join(", ") || "yok"})`, badPlain.length === 0);
    check(`index.html'deki her öğede Shift+Sol: hiçbirinde çevirmiyor (çeviren: ${badShift.slice(0, 5).join(", ") || "yok"})`, badShift.length === 0);
    // gerçek uygulamada ok kullanan öğeler modallerin içinde: modal korumasıyla zaten sayfa çevrilmez
    const outside = owners.filter((el) => !el.closest(".modal-sheet"));
    check(`index.html: oklarla kendi işini gören öğelerin hepsi bir modalın (.modal-sheet) içinde (dışında: ${outside.map((e) => e.tagName.toLowerCase() + "#" + e.id).join(", ") || "yok"})`, outside.length === 0);
  }

  // ---- sahte olay nesneleri (işlev doğrudan çağrılıyor) ----
  {
    const f = env.api.onPageTurnKeydown;
    const run = (ev) => {
      env.calls.next = 0;
      env.calls.prev = 0;
      try {
        f(ev);
      } catch (e) {
        return "HATA " + e.message;
      }
      return env.calls.next ? "next" : env.calls.prev ? "prev" : "none";
    };
    check("sahte olay: yalnızca { key: 'ArrowLeft' } (hedef yok, bayraklar tanımsız) -> sonraki sayfa", run({ key: "ArrowLeft" }) === "next");
    check("sahte olay: { key: 'ArrowRight', target: null } -> önceki sayfa", run({ key: "ArrowRight", target: null }) === "prev");
    check("sahte olay: hedefte closest yok ({}) -> çeviriyor, hata fırlatmıyor", run({ key: "ArrowLeft", target: {} }) === "next");
    check("sahte olay: { key: 'ArrowLeft', shiftKey: true } -> çevirmiyor", run({ key: "ArrowLeft", shiftKey: true }) === "none");
    check("sahte olay: { key: 'ArrowLeft', defaultPrevented: true } -> çevirmiyor", run({ key: "ArrowLeft", defaultPrevented: true }) === "none");
    check("sahte olay: { key: 'ArrowLeft', isComposing: true } -> çevirmiyor", run({ key: "ArrowLeft", isComposing: true }) === "none");
    check("sahte olay: { key: 'ArrowUp' } -> çevirmiyor", run({ key: "ArrowUp" }) === "none");
  }
}

// -- (3) GERÇEK Yaz ekran klavyesi işleyicisiyle birlikte -----------------------------------------------------
{
  const env = makeEnv({ yazHandler: true });
  const { d } = env;
  const keys = [...env.yazKeyboard.querySelectorAll(".yaz-key")];
  check(`index.html: Yaz ekran klavyesinde 30 tuş var (bulunan: ${keys.length}; testin geçerliliği)`, keys.length === 30);
  const at = () => keys.indexOf(d.activeElement);

  keys[0].focus();
  let ev = press(env, keys[0], { ...RIGHT });
  check("Yaz tuşunda DÜZ Sağ ok: klavyenin işleyicisi tüketiyor, odak sonraki tuşa geçiyor", ev.defaultPrevented && at() === 1);
  check("... ve olay document'e ulaşmıyor: sayfa ÇEVRİLMİYOR", env.calls.next === 0 && env.calls.prev === 0);
  ev = press(env, keys[1], { ...LEFT });
  check("Yaz tuşunda DÜZ Sol ok: tüketiliyor, odak önceki tuşa dönüyor (1 -> 0), sayfa çevrilmiyor", ev.defaultPrevented && at() === 0 && env.calls.next === 0 && env.calls.prev === 0);

  const COMBOS = [
    ["Shift+Sol", { ...LEFT, shiftKey: true }],
    ["Shift+Sağ", { ...RIGHT, shiftKey: true }],
    ["Alt+Sol", { ...LEFT, altKey: true }],
    ["Alt+Sağ", { ...RIGHT, altKey: true }],
    ["Ctrl+Sol", { ...LEFT, ctrlKey: true }],
    ["Ctrl+Sağ", { ...RIGHT, ctrlKey: true }],
    ["Meta+Sol", { ...LEFT, metaKey: true }],
    ["Meta+Sağ", { ...RIGHT, metaKey: true }],
  ];
  for (const [name, init] of COMBOS) {
    keys[5].focus();
    env.calls.next = 0;
    env.calls.prev = 0;
    ev = press(env, keys[5], init);
    check(`Yaz tuşunda ${name}: klavyenin işleyicisi YOK SAYIYOR (olay tüketilmiyor, odak yerinde) ve document'teki dinleyici de sayfa ÇEVİRMİYOR`, !ev.defaultPrevented && keys.indexOf(d.activeElement) === 5 && env.calls.next === 0 && env.calls.prev === 0);
  }
  // odak ekran klavyesinin DIŞINDAyken düz ok eskisi gibi çeviriyor (bilinçli sayfa çevirme: oturum biter)
  d.body.focus();
  check("odak klavyenin dışında (gövde): düz Sol/Sağ ok eskisi gibi sayfa çeviriyor", outcome(env, d.body, LEFT) === "next" && outcome(env, d.body, RIGHT) === "prev");
  // Yukarı/Aşağı klavyede tüketiliyor, document'e ulaşmıyor
  keys[3].focus();
  env.calls.next = 0;
  env.calls.prev = 0;
  ev = press(env, keys[3], { key: "ArrowDown", code: "ArrowDown" });
  check("Yaz tuşunda Aşağı ok: tüketiliyor, sayfa çevrilmiyor", ev.defaultPrevented && env.calls.next === 0 && env.calls.prev === 0);
}

// -- (4) Rastgele dizi: tuş x değiştirici x hedef x tüketilmiş x bileşim x modal ----------------------------------
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
{
  const KEYS = ["ArrowLeft", "ArrowLeft", "ArrowRight", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Enter", " ", "Tab", "Escape", "a", "ب"];
  // [ad, işaretleme, oklarla kendi işini görüyor mu]: sahip olma bilgisi İNŞA EDİLİRKEN elle verildi (seçiciden türetilmedi)
  const POOL = [
    ["gövde", null, false],
    ["document", "DOC", false],
    ["button", `<button id="t" type="button">x</button>`, false],
    ["a", `<a id="t" href="#x">x</a>`, false],
    ["checkbox", `<input id="t" type="checkbox">`, false],
    ["gezgin düğmesi", `<ul><li><button id="t" type="button" class="ayah-nav-item">x</button></li></ul>`, false],
    ["panel düğmesi", `<div role="region"><button id="t" type="button" class="wm-tafsir-tab">x</button></div>`, false],
    ["svg rect", `<svg><rect id="t" width="1" height="1"></rect></svg>`, false],
    ["text input", `<input id="t" type="text">`, true],
    ["number input", `<input id="t" type="number">`, true],
    ["range input", `<input id="t" type="range">`, true],
    ["radio", `<input id="t" type="radio" name="r">`, true],
    ["select", `<select id="t"><option>a</option></select>`, true],
    ["textarea", `<textarea id="t"></textarea>`, true],
    ["contenteditable", `<div id="t" contenteditable="true" tabindex="0">x</div>`, true],
    ["slider", `<div id="t" role="slider" tabindex="0">x</div>`, true],
    ["sekme", `<div role="tablist"><button id="t" role="tab">x</button></div>`, true],
    ["seçenek", `<div role="listbox"><div id="t" role="option" tabindex="0">x</div></div>`, true],
  ];
  const MODS = ["altKey", "ctrlKey", "metaKey", "shiftKey"];
  let total = 0;
  let wrong = [];
  for (let seed = 1; seed <= 20; seed++) {
    const env = makeEnv();
    const { d } = env;
    const host = d.createElement("div");
    d.body.appendChild(host);
    const rnd = mulberry32(seed * 7919);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const prevent = (e) => e.preventDefault();
    for (let i = 0; i < 150; i++) {
      const [name, markup, owns] = pick(POOL);
      let target;
      if (markup === "DOC") target = d;
      else if (markup === null) target = d.body;
      else {
        host.innerHTML = markup;
        target = host.querySelector("#t");
      }
      const key = pick(KEYS);
      const mods = rnd() < 0.5 ? {} : Object.fromEntries(MODS.map((m) => [m, rnd() < 0.5]));
      const hasMod = MODS.some((m) => mods[m]);
      const composing = rnd() < 0.1;
      let prevented = rnd() < 0.1;
      if (target === d) prevented = false; // gövde işleyicisi document'e doğrudan gönderilen olaydan önce çalışmaz
      env.state.openModalEl = rnd() < 0.1 ? d.getElementById("surah-modal") : null;
      if (prevented) d.body.addEventListener("keydown", prevent);
      const got = outcome(env, target, { key, code: key, ...mods, isComposing: composing });
      if (prevented) d.body.removeEventListener("keydown", prevent);
      const want = !env.state.openModalEl && (key === "ArrowLeft" || key === "ArrowRight") && !hasMod && !prevented && !composing && !owns ? (key === "ArrowLeft" ? "next" : "prev") : "none";
      total++;
      if (got !== want) wrong.push(`seed ${seed} #${i}: ${name} ${key} mods=${MODS.filter((m) => mods[m]).join("+") || "-"} prevented=${prevented} composing=${composing} modal=${!!env.state.openModalEl} -> ${got} (beklenen ${want})`);
    }
  }
  check(`rastgele dizi: ${total} olayın hepsinde sonuç bağımsız kuralla aynı (yanlış: ${wrong.length}${wrong.length ? "; ilk: " + wrong[0] : ""})`, wrong.length === 0 && total === 3000);
}

if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("sayfa_ok_tuslari_test: tüm kontroller geçti");
