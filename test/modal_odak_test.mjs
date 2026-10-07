// Modal odak yönetimi regresyon kontrolü: js/modal-odak.js ve app.js'teki openModal/closeModal/
// closeAllModals bağlantısı. 7 modalın hepsi role="dialog" aria-modal="true" taşıyordu ama odağa
// hiç dokunulmuyordu: açılınca odak arkadaki sayfada kalıyor, Tab modalın dışına çıkıyor, kapanınca
// odak <body>'ye düşüyordu (gerçek Chromium ölçümü README'de). Burada kontrol edilenler:
//   (1) index.html'deki 7 modalın işaretlemesi (role/aria-modal/aria-labelledby/tabindex="-1"/Kapat
//       düğmesi), kapsayıcı odak halkasını bastıran CSS kuralı, closeAllModals listesinin HTML'deki
//       modallerle bire bir örtüşmesi (yeni bir modal listeye eklenmeden unutulmasın);
//   (2) saf yardımcılar: tabbablesIn (hangi öğeler Tab durağı), isRendered (checkVisibility dalı dahil);
//   (3) createModalFocus, GERÇEK index.html üzerinde: enter, Tab/Shift+Tab döngüsü (olaylar elle
//       gönderiliyor), odağın dışarı kaçmasına karşı güvenlik ağı, açan öğenin yakalanması (Chromium'da
//       activeElement, Safari/iOS'ta son tıklanan düğme), zincirleme açılışta ilk açanın korunması,
//       restore'un yok olmuş/gizli/devre dışı açanda sessizce vazgeçmesi;
//   (4) app.js'in openModal/closeModal/closeAllModals bloğu kaynaktan çıkarılıp GERÇEK modal işaretlemesi
//       ve sahte zamanlayıcıyla çalıştırılıyor: sıralama (açanı kapatmadan ÖNCE yakala, odağı onOpen'dan
//       ÖNCE al), arama modalının kendi girişine odaklanması, kapanışta odağın geri verilmesi, modaldan
//       modala geçiş, kapanış animasyonu sürerken yeniden açma yarışı (eski zamanlayıcı modalı gizleyip
//       perdeyi açık bırakmasın), restoreFocus:false, hiçbir modal açık değilken odağın çalınmaması.
//
// ÖNEMLİ SINIR: jsdom'da düzen ve gerçek Tab gezintisi yok. Tab olayları elle gönderiliyor ve yalnızca
// BİZİM müdahale ettiğimiz durumlar (döngüyü kapatma) sınanıyor; tarayıcının doğal Tab sırası burada
// ölçülemiyor. Gerçek Chromium'daki uçtan uca ölçüm (7 modal x açılış/Tab/Escape/kapat/perde/öğe seçimi/
// hızlı yeniden açma) README'de; gerçek ekran okuyucu testinin YERİNİ TUTMAZ.
//
//   node modal_odak_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";
import { createModalFocus, tabbablesIn, isRendered } from "../js/modal-odak.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const html = readText("index.html");
const css = readText("css", "style.css");
const appSource = readText("js", "app.js");

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}

const MODAL_IDS = ["surah-modal", "juz-modal", "page-modal", "ezber-modal", "surah-info-modal", "topics-modal", "arama-modal"];

// -- (1) Statik işaretleme -------------------------------------------------------------------------------------
{
  const doc = new JSDOM(html).window.document;
  const sheets = [...doc.querySelectorAll(".modal-sheet")];
  check("index.html: tam 7 .modal-sheet var", sheets.length === 7);
  check("index.html: modal kimlikleri beklenen 7 tane", sheets.map((m) => m.id).sort().join() === [...MODAL_IDS].sort().join());
  for (const m of sheets) {
    const label = doc.getElementById(m.getAttribute("aria-labelledby") || "");
    check(`#${m.id}: role="dialog" ve aria-modal="true"`, m.getAttribute("role") === "dialog" && m.getAttribute("aria-modal") === "true");
    check(`#${m.id}: aria-labelledby var olan ve dolu bir başlığa işaret ediyor`, !!label && label.textContent.trim().length > 0);
    check(`#${m.id}: tabindex="-1" (odak programatik olarak kapsayıcıya alınabilsin, Tab sırasına girmesin)`, m.getAttribute("tabindex") === "-1");
    check(`#${m.id}: başlangıçta gizli`, m.hasAttribute("hidden"));
    check(`#${m.id}: Kapat düğmesi (data-close) var`, !!m.querySelector("button[data-close]"));
  }
  check("CSS: .modal-sheet:focus { outline: none } var (kapsayıcıya odak alınınca bütün sheet'in çevresine halka çizilmesin)", /\.modal-sheet:focus\s*\{\s*outline:\s*none;?\s*\}/.test(css));
  check("CSS: düğme/giriş/seçim odak halkası (button:focus-visible) korunuyor", /select:focus-visible,\s*input:focus-visible,\s*button:focus-visible\s*\{[^}]*outline:\s*2px solid/.test(css));

  // closeAllModals listesi == HTML'deki modaller (Escape/perde/[data-close] hepsi buradan geçiyor; listede olmayan
  // modal ne kapanır ne de odağı geri verir).
  const list = /function closeAllModals\([^)]*\)\s*\{\s*\[([^\]]+)\]/.exec(appSource);
  check("app.js: closeAllModals modal listesi bulundu", !!list);
  if (list) {
    const names = list[1].split(",").map((s) => s.trim().replace(/^els\./, ""));
    const ids = names.map((n) => {
      const m = new RegExp(`\\b${n}:\\s*document\\.getElementById\\("([^"]+)"\\)`).exec(appSource);
      return m ? m[1] : `?${n}`;
    });
    check(`app.js: closeAllModals listesi HTML'deki 7 modalle bire bir aynı (${ids.join(", ")})`, ids.slice().sort().join() === [...MODAL_IDS].sort().join());
  }
}

// -- (2) Saf yardımcılar -----------------------------------------------------------------------------------------
{
  const dom = new JSDOM(`<!doctype html><body><div id="m" tabindex="-1">
    <button id="b1">1</button>
    <button id="b2" disabled>2</button>
    <a id="a1" href="#x">bağlantı</a>
    <a id="a2">href yok</a>
    <input id="i1" type="text">
    <input id="i2" type="hidden">
    <select id="s1"><option>1</option></select>
    <textarea id="t1"></textarea>
    <div id="d1" tabindex="0">0</div>
    <div id="d2" tabindex="-1">-1</div>
    <div hidden><button id="h1">gizli kapsayıcıda</button></div>
    <button id="h2" hidden>kendisi gizli</button>
    <div inert><button id="n1">inert</button></div>
    <fieldset disabled><button id="f1">devre dışı fieldset</button></fieldset>
    <div data-gizli><button id="g1">CSS ile gizli</button></div>
  </div></body>`);
  const { document } = dom.window;
  const ids = (list) => list.map((e) => e.id).join(",");
  const m = document.getElementById("m");
  check("tabbablesIn (checkVisibility YOKKEN): düğme/bağlantı/giriş/seçim/metin alanı/tabindex>=0 DOM sırasıyla; disabled, [hidden], inert, tabindex=-1, href'siz bağlantı, hidden giriş, devre dışı fieldset içindekiler hariç",
    ids(tabbablesIn(m)) === "b1,a1,i1,s1,t1,d1,g1");

  let seen = null;
  dom.window.Element.prototype.checkVisibility = function (opts) {
    seen = opts;
    return !this.closest("[data-gizli]");
  };
  check("tabbablesIn (checkVisibility VARKEN): tarayıcının CSS gizlemesi (display:none/visibility:hidden) de eleniyor", ids(tabbablesIn(m)) === "b1,a1,i1,s1,t1,d1");
  check("isRendered: checkVisibility'ye visibilityProperty:true geçiriliyor (visibility:hidden da elensin)", !!seen && seen.visibilityProperty === true);
  check("isRendered: [hidden] ve [inert] atası checkVisibility'den bağımsız olarak gizli sayılıyor, sıradan düğme görünür", !isRendered(document.getElementById("h1")) && !isRendered(document.getElementById("n1")) && isRendered(document.getElementById("b1")));
  delete dom.window.Element.prototype.checkVisibility;
}

// -- (3) createModalFocus, gerçek index.html üzerinde ------------------------------------------------------------
function makeEnv() {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const win = dom.window;
  const document = win.document;
  // Listeleri gerçek uygulamada app.js dolduruyor; burada birkaç öğe yeterli.
  document.getElementById("surah-list").innerHTML = ["1", "2", "3"].map((n) => `<button type="button" class="modal-item">${n}</button>`).join("");
  const env = { dom, win, document, open: null, clock: { t: 0 } };
  win.performance.now = () => env.clock.t;
  env.mf = createModalFocus(document, () => env.open);
  return env;
}
const press = (env, target, init) => {
  const ev = new env.win.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
};
const click = (env, target) => target.dispatchEvent(new env.win.MouseEvent("click", { bubbles: true, cancelable: true }));
function openByHand(env, modal, { keepExisting = false } = {}) {
  env.mf.remember({ keepExisting });
  modal.hidden = false;
  env.open = modal;
  env.mf.enter(modal);
}

{
  // enter
  const env = makeEnv();
  const D = env.document;
  const modal = D.getElementById("surah-modal");
  openByHand(env, modal);
  check("enter: odak modalın kendisine alınıyor", D.activeElement === modal);
  env.open = null; // modal artık açık değil: odağı dışarı kaçıran güvenlik ağı devreye girmesin
  const bare = D.createElement("div");
  D.body.append(bare);
  env.mf.enter(bare);
  check("enter: tabindex'i olmayan kapsayıcıya tabindex=-1 ekleyip odaklıyor (aksi halde focus() sessizce hiçbir şey yapmaz)", bare.getAttribute("tabindex") === "-1" && D.activeElement === bare);
  env.mf.dispose();
}

{
  // Tab / Shift+Tab döngüsü: gerçek Sure modalının işaretlemesiyle
  const env = makeEnv();
  const D = env.document;
  const modal = D.getElementById("surah-modal");
  openByHand(env, modal);
  const items = tabbablesIn(modal);
  check("gerçek Sure modalında Tab durakları: Kapat + 3 öğe, Kapat ilk", items.length === 4 && items[0].matches("[data-close]"));
  const first = items[0];
  const mid = items[1];
  const last = items[items.length - 1];

  last.focus();
  let ev = press(env, last, { key: "Tab" });
  check("son durakta Tab: varsayılan engellendi, odak İLK durağa (Kapat) döndü", ev.defaultPrevented && D.activeElement === first);

  mid.focus();
  ev = press(env, mid, { key: "Tab" });
  check("ortadaki durakta Tab: müdahale yok (tarayıcının doğal sırası modalın içinde kalıyor)", !ev.defaultPrevented && D.activeElement === mid);

  first.focus();
  ev = press(env, first, { key: "Tab", shiftKey: true });
  check("ilk durakta Shift+Tab: odak SON durağa döndü", ev.defaultPrevented && D.activeElement === last);

  mid.focus();
  ev = press(env, mid, { key: "Tab", shiftKey: true });
  check("ortadaki durakta Shift+Tab: müdahale yok", !ev.defaultPrevented && D.activeElement === mid);

  modal.focus();
  ev = press(env, modal, { key: "Tab", shiftKey: true });
  check("açılış odağından (kapsayıcı) Shift+Tab: odak SON durağa döndü -- kapsayıcı DOM'da ilk durağın ÖNCESİNDE, engellenmezse modalın dışına çıkardı", ev.defaultPrevented && D.activeElement === last);

  modal.focus();
  ev = press(env, modal, { key: "Tab" });
  check("açılış odağından Tab: müdahale yok (doğal sıra ilk durağa gidiyor)", !ev.defaultPrevented);

  last.focus();
  ev = press(env, last, { key: "Tab", ctrlKey: true });
  check("Ctrl+Tab: tarayıcının sekme kısayolu, müdahale edilmiyor", !ev.defaultPrevented && D.activeElement === last);

  last.focus();
  ev = press(env, last, { key: "ArrowDown" });
  check("Tab dışındaki tuşlara dokunulmuyor", !ev.defaultPrevented && D.activeElement === last);

  // Başka bir işleyici olayı zaten işlemişse (defaultPrevented) karışılmıyor
  last.focus();
  const pre = new env.win.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  last.addEventListener("keydown", (e) => e.preventDefault(), { once: true });
  last.dispatchEvent(pre);
  check("defaultPrevented gelen Tab olayında odak kaydırılmıyor", pre.defaultPrevented && D.activeElement === last);
  env.mf.dispose();
}

{
  // Odaklanacak hiçbir şey olmayan modal
  const env = makeEnv();
  const D = env.document;
  const empty = D.createElement("div");
  empty.setAttribute("tabindex", "-1");
  D.body.append(empty);
  env.open = empty;
  env.mf.enter(empty);
  const ev = press(env, empty, { key: "Tab" });
  check("içinde Tab durağı olmayan modalda Tab engelleniyor, odak kapsayıcıda kalıyor", ev.defaultPrevented && D.activeElement === empty);
  env.mf.dispose();
}

{
  // focusin güvenlik ağı
  const env = makeEnv();
  const D = env.document;
  const modal = D.getElementById("surah-modal");
  openByHand(env, modal);
  const items = tabbablesIn(modal);
  const outside = D.getElementById("juz-btn");
  outside.focus();
  check("modal açıkken odak dışarı kaçarsa (programatik odak, yardımcı teknoloji) İLK durağa geri çekiliyor", D.activeElement === items[0]);
  press(env, items[0], { key: "Tab", shiftKey: true }); // yönü "geri" olarak kaydeder (ayrıca odağı son durağa alır)
  outside.focus();
  check("son Tab yönü geriyse kaçan odak SON durağa çekiliyor", D.activeElement === items[items.length - 1]);
  env.open = null;
  outside.focus();
  check("modal açık değilken odağa karışılmıyor", D.activeElement === outside);
  env.mf.dispose();
}

{
  // açan öğe: Chromium/Firefox -- tıklanan düğme activeElement
  const env = makeEnv();
  const D = env.document;
  const btn = D.getElementById("surah-btn");
  const modal = D.getElementById("surah-modal");
  btn.focus();
  openByHand(env, modal);
  env.open = null;
  check("restore(): kapanışta odak modalı açan düğmeye döndü", env.mf.restore() === true && D.activeElement === btn);
  btn.blur();
  check("restore() açan öğeyi bir kez kullanıp temizliyor: ikinci çağrı odaklamıyor", env.mf.restore() === false && D.activeElement !== btn);
  env.mf.dispose();
}

{
  // zincirleme: arama -> konu
  const env = makeEnv();
  const D = env.document;
  const aramaBtn = D.getElementById("arama-btn");
  const A = D.getElementById("arama-modal");
  const B = D.getElementById("topics-modal");
  aramaBtn.focus();
  openByHand(env, A);
  const inA = A.querySelector("button[data-close]");
  inA.focus(); // kullanıcı arama modalının içindeki bir öğeye tıkladı
  openByHand(env, B, { keepExisting: !!env.open });
  env.open = null;
  env.mf.restore();
  check("modaldan modala geçişte (arama -> konu) kapanışta odak EN BAŞTAKİ açan düğmeye (Arama) dönüyor, aradaki modalın içindeki öğeye değil", D.activeElement === aramaBtn);
  env.mf.dispose();
}

{
  // zincirsiz ikinci açılış yeni açanı yakalıyor
  const env = makeEnv();
  const D = env.document;
  const surahBtn = D.getElementById("surah-btn");
  const juzBtn = D.getElementById("juz-btn");
  surahBtn.focus();
  openByHand(env, D.getElementById("surah-modal"));
  env.open = null;
  env.mf.restore();
  juzBtn.focus();
  openByHand(env, D.getElementById("juz-modal"));
  env.open = null;
  env.mf.restore();
  check("ayrı ayrı açılan iki modal: her biri KENDİ açanına dönüyor (eski açan sızmıyor)", D.activeElement === juzBtn);
  env.mf.dispose();
}

{
  // Safari/iOS: tıklanan düğmeye odak verilmez (activeElement <body>), ama click olayı gelir
  const env = makeEnv();
  const D = env.document;
  const btn = D.getElementById("juz-btn");
  env.clock.t = 5000;
  click(env, btn);
  check("(ön koşul) odak vermeyen tarayıcı simülasyonu: tıklama sonrası activeElement <body>", D.activeElement === D.body);
  env.clock.t = 5200;
  openByHand(env, D.getElementById("juz-modal"));
  env.open = null;
  check("odak vermeyen tarayıcıda (Safari/iOS) son tıklanan düğme açan sayılıyor: kapanışta odak ona dönüyor", env.mf.restore() === true && D.activeElement === btn);

  // bayat tıklama
  D.activeElement.blur();
  env.clock.t = 10000;
  click(env, btn);
  env.clock.t = 11500; // 1,5 sn sonra: modal başka bir yoldan açıldı
  openByHand(env, D.getElementById("juz-modal"));
  env.open = null;
  check("1 sn'den eski bir tıklama açan sayılmıyor (başka yoldan açılan modalın açanı sanılmasın)", env.mf.restore() === false);

  // etkileşimsiz öğeye tıklama (ör. SVG'deki sure başlığı): odaklanabilir bir açan yok
  D.getElementById("juz-modal").hidden = true; // önceki modal kapandı: gerçek tarayıcıda odak <body>'ye düşerdi
  D.activeElement.blur();
  const plain = D.createElement("div");
  D.body.append(plain);
  env.clock.t = 20000;
  click(env, plain);
  env.clock.t = 20100;
  openByHand(env, D.getElementById("surah-info-modal"));
  env.open = null;
  check("odaklanabilir olmayan öğeye tıklanarak açılan modal (Sure Bilgisi): açan yok, restore() odağa dokunmuyor", env.mf.restore() === false && D.activeElement === D.getElementById("surah-info-modal"));
  env.mf.dispose();
}

{
  // Düğmenin KENDİ click işleyicisi modalı açıyor (gerçek uygulamadaki gibi). Tıklama kaydı işleyiciden ÖNCE
  // (yakalama aşamasında) yapılmış olmalı; yoksa openModal çağrıldığında açan henüz bilinmez.
  const env = makeEnv();
  const D = env.document;
  const b = D.getElementById("page-btn");
  env.clock.t = 100;
  b.addEventListener("click", () => openByHand(env, D.getElementById("page-modal")));
  click(env, b);
  env.open = null;
  check("açan düğmenin kendi click işleyicisi modalı açıyorsa bile açan biliniyor (tıklama yakalama aşamasında, işleyiciden ÖNCE kaydediliyor)", env.mf.restore() === true && D.activeElement === b);
  env.mf.dispose();
}

for (const [label, mutate] of [
  ["DOM'dan çıkarılmış", (b) => b.remove()],
  ["[hidden]", (b) => b.setAttribute("hidden", "")],
  ["devre dışı", (b) => b.setAttribute("disabled", "")],
]) {
  const env = makeEnv();
  const D = env.document;
  const b = D.getElementById("page-btn");
  const modal = D.getElementById("page-modal");
  b.focus();
  openByHand(env, modal);
  mutate(b);
  env.open = null;
  let r;
  try {
    r = env.mf.restore();
  } catch {
    r = "hata";
  }
  check(`restore(): açan öğe ${label} ise hata vermiyor ve odağa dokunmuyor`, r === false && D.activeElement === modal);
  env.mf.dispose();
}

{
  // dispose
  const env = makeEnv();
  const D = env.document;
  const modal = D.getElementById("surah-modal");
  openByHand(env, modal);
  const items = tabbablesIn(modal);
  env.mf.dispose();
  items[items.length - 1].focus();
  const ev = press(env, items[items.length - 1], { key: "Tab" });
  check("dispose(): dinleyiciler kaldırılıyor (Tab artık yakalanmıyor)", !ev.defaultPrevented);
}

// -- (4) app.js bağlantısı ---------------------------------------------------------------------------------------
check('app.js: createModalFocus "./modal-odak.js"ten import ediliyor', /import \{ createModalFocus \} from "\.\/modal-odak\.js";/.test(appSource));
check("app.js: modalFocus, açık modal olarak state.openModalEl'i okuyor", /const modalFocus = createModalFocus\(document, \(\) => state\.openModalEl\);/.test(appSource));
check("app.js: perde ve [data-close] düğmeleri closeAllModals'ı ok işleviyle çağırıyor (click olayı seçenek nesnesi olarak geçmesin)",
  /modalBackdrop\.addEventListener\("click", \(\) => closeAllModals\(\)\)/.test(appSource) && /\[data-close\][^\n]*addEventListener\("click", \(\) => closeAllModals\(\)\)/.test(appSource));

const startIdx = appSource.indexOf("const modalFocus = createModalFocus(");
const endIdx = appSource.indexOf("function setupModals()");
check("app.js: modal odak bloğu (modalFocus .. closeAllModals) kaynaktan çıkarılabildi", startIdx > 0 && endIdx > startIdx);

if (startIdx > 0 && endIdx > startIdx) {
  const block = appSource.slice(startIdx, endIdx);
  const iRemember = block.indexOf("modalFocus.remember(");
  const iCloseAll = block.indexOf("closeAllModals({ restoreFocus: false })");
  const iState = block.indexOf("state.openModalEl = modalEl;");
  const iEnter = block.indexOf("modalFocus.enter(modalEl)");
  const iOnOpen = block.indexOf("if (onOpen) onOpen()");
  check("openModal sırası: açanı YAKALA -> eski modalları odak geri vermeden kapat -> state.openModalEl -> odağı modala al -> onOpen (arama girişi odağı ezebilsin)",
    iRemember > 0 && iRemember < iCloseAll && iCloseAll < iState && iState < iEnter && iEnter < iOnOpen);
  check("openModal: zincir durumu state.openModalEl'den okunuyor (keepExisting: !!state.openModalEl)", /modalFocus\.remember\(\{ keepExisting: !!state\.openModalEl \}\)/.test(block));
  check("closeModal: odak yalnızca modal GERÇEKTEN açık modal ise (state.openModalEl === modalEl), state temizlendikten SONRA ve restoreFocus açıksa geri veriliyor",
    /if \(state\.openModalEl === modalEl\) \{\s*state\.openModalEl = null;[^}]*if \(restoreFocus\) modalFocus\.restore\(\);\s*\}/.test(block));
  check("closeModal.finish: ilk ifade 'yeniden açıldıysa gizleme' koruması", /const finish = \(\) => \{[^]*?if \(state\.openModalEl === modalEl\) return;\s*modalEl\.hidden = true;/.test(block));

  const NAMES = ["surahModal", "juzModal", "pageModal", "ezberModal", "surahInfoModal", "topicsModal", "aramaModal"];
  function harness() {
    const dom = new JSDOM(html, { pretendToBeVisual: true });
    const D = dom.window.document;
    const els = { modalBackdrop: D.getElementById("modal-backdrop") };
    NAMES.forEach((n, i) => (els[n] = D.getElementById(MODAL_IDS[i])));
    const state = { openModalEl: null };
    const calls = [];
    const timers = [];
    const rafQ = [];
    let now = 0;
    const api = new Function(
      "els", "state", "document", "createModalFocus", "requestAnimationFrame", "setTimeout",
      "closeAllAyahGrids", "closeSurahInfoDetail", "resetTopicsModal", "switchJuzTab", "switchEzberTab", "closeEzberSurahPicker",
      `${block}\nreturn { openModal, closeModal, closeAllModals, modalFocus };`
    )(
      els, state, D, createModalFocus,
      (fn) => rafQ.push(fn),
      (fn, ms) => timers.push({ fn, at: now + ms }),
      () => calls.push("closeAllAyahGrids"),
      () => calls.push("closeSurahInfoDetail"),
      () => calls.push("resetTopicsModal"),
      (tab) => calls.push(`switchJuzTab:${tab}`),
      (tab) => calls.push(`switchEzberTab:${tab}`),
      () => calls.push("closeEzberSurahPicker")
    );
    return {
      D, els, state, calls, ...api,
      flush: () => rafQ.splice(0).forEach((f) => f()),
      advance(ms) {
        const target = now + ms;
        for (;;) {
          timers.sort((a, b) => a.at - b.at);
          if (!timers.length || timers[0].at > target) break;
          const t = timers.shift();
          now = t.at;
          t.fn();
        }
        now = target;
      },
    };
  }

  {
    // açılış / kapanış
    const h = harness();
    const btn = h.D.getElementById("surah-btn");
    btn.focus();
    h.openModal(h.els.surahModal);
    check("openModal: state.openModalEl ayarlı; modal ve perde görünür", h.state.openModalEl === h.els.surahModal && !h.els.surahModal.hidden && !h.els.modalBackdrop.hidden);
    check("openModal: odak modalın içine girdi (arkadaki düğmede kalmadı)", h.D.activeElement === h.els.surahModal);
    h.flush();
    check("openModal: sonraki karede .open sınıfları ekleniyor (geçiş animasyonu bozulmadı)", h.els.surahModal.classList.contains("open") && h.els.modalBackdrop.classList.contains("open"));
    h.closeAllModals();
    check("closeAllModals: odak, animasyon sürerken bile hemen açan düğmeye döndü; state temiz", h.D.activeElement === btn && h.state.openModalEl === null);
    check("closeAllModals: animasyon bitene kadar modal hâlâ görünür (gizleme gecikmeli)", !h.els.surahModal.hidden && !h.els.modalBackdrop.hidden);
    h.advance(320);
    check("320 ms sonra modal ve perde gizli", h.els.surahModal.hidden && h.els.modalBackdrop.hidden);
    check("odak kapanış animasyonu bitince de açan düğmede", h.D.activeElement === btn);
  }

  {
    // arama modalı: kendi girişine odaklanmaya devam etmeli, kapanınca Arama düğmesine dönmeli
    const h = harness();
    const aramaBtn = h.D.getElementById("arama-btn");
    const input = h.D.querySelector(".arama-input");
    aramaBtn.focus();
    h.openModal(h.els.aramaModal, { onOpen: () => input.focus({ preventScroll: true }) });
    check("arama modalı: onOpen, odağı modala alan adımdan SONRA çalışıyor, giriş alanı odağı koruyor", h.D.activeElement === input);
    h.closeAllModals();
    check("arama modalı kapanınca odak Arama düğmesine dönüyor", h.D.activeElement === aramaBtn);
  }

  {
    // modaldan modala (arama -> konu)
    const h = harness();
    const aramaBtn = h.D.getElementById("arama-btn");
    aramaBtn.focus();
    h.openModal(h.els.aramaModal);
    h.D.querySelector("#arama-modal [data-close]").focus(); // arama sonuçlarından bir öğeye tıklandı
    h.openModal(h.els.topicsModal);
    check("zincir: konu modalı açıldı, arama modalı kapanma yolunda (state konu modalında)", h.state.openModalEl === h.els.topicsModal);
    check("zincir: odak konu modalının içinde (arama modalının kapanışı odağı eski açana GERİ VERMEDİ)", h.D.activeElement === h.els.topicsModal);
    h.closeAllModals();
    h.advance(400);
    check("zincir: konu modalı kapanınca odak en baştaki Arama düğmesine dönüyor", h.D.activeElement === aramaBtn);
    check("zincir: iki modal de gizlendi, perde gizli", h.els.aramaModal.hidden && h.els.topicsModal.hidden && h.els.modalBackdrop.hidden);
  }

  {
    // kapanış animasyonu sürerken yeniden açma yarışı (Escape, hemen ardından Enter)
    const h = harness();
    const btn = h.D.getElementById("surah-btn");
    btn.focus();
    h.openModal(h.els.surahModal);
    h.flush();
    h.closeAllModals(); // Escape
    h.advance(60);
    check("(ön koşul) kapanış sürerken odak açan düğmede: klavyeyle hemen yeniden açılabilir", h.D.activeElement === btn);
    h.openModal(h.els.surahModal); // Enter
    h.flush();
    h.advance(1000);
    check("yeniden açılan modal, ilk kapanışın zamanlayıcısıyla GİZLENMİYOR ve açık modal olarak kalıyor", !h.els.surahModal.hidden && h.state.openModalEl === h.els.surahModal);
    check("perde açık kalıyor ve modal .open sınıfını koruyor", !h.els.modalBackdrop.hidden && h.els.modalBackdrop.classList.contains("open") && h.els.surahModal.classList.contains("open"));
    check("odak yeniden açılan modalın içinde", h.D.activeElement === h.els.surahModal);
    h.closeAllModals();
    h.advance(400);
    check("yeniden açılan modal sonra normal kapanıyor: modal + perde gizli, state temiz", h.els.surahModal.hidden && h.els.modalBackdrop.hidden && h.state.openModalEl === null);
    check("... ve odak yine açan düğmede", h.D.activeElement === btn);
  }

  {
    // restoreFocus:false
    const h = harness();
    const btn = h.D.getElementById("surah-btn");
    btn.focus();
    h.openModal(h.els.surahModal);
    h.closeModal(h.els.surahModal, { restoreFocus: false });
    check("closeModal(el, { restoreFocus: false }): odak açan düğmeye DÖNMÜYOR (modaldan modala geçişte kullanılıyor)", h.D.activeElement !== btn && h.state.openModalEl === null);
  }

  {
    // hiçbir modal açık değilken odak çalınmamalı
    const h = harness();
    const x = h.D.getElementById("arama-btn");
    x.focus();
    h.closeAllModals();
    h.closeModal(null);
    h.closeModal(h.els.pageModal);
    check("hiçbir modal açık değilken closeAllModals/closeModal odağı çalmıyor ve hata vermiyor", h.D.activeElement === x);
  }

  {
    // odaklanabilir açanı olmayan modal (Sure Bilgisi, SVG'ye dokunarak)
    const h = harness();
    let threw = false;
    try {
      h.openModal(h.els.surahInfoModal);
      h.closeAllModals();
      h.advance(400);
    } catch {
      threw = true;
    }
    check("açanı olmayan modal (Sure Bilgisi) hatasız açılıp kapanıyor", !threw && h.els.surahInfoModal.hidden && h.state.openModalEl === null);
  }

  {
    // mevcut modal-başına sıfırlamalar bozulmadı
    const h = harness();
    h.openModal(h.els.juzModal);
    h.closeAllModals();
    check("closeModal(Cüz): hep 'juz' sekmesine sıfırlanıyor", h.calls.includes("switchJuzTab:juz"));
    h.advance(400);
    h.calls.length = 0;
    h.openModal(h.els.ezberModal);
    h.closeAllModals();
    check("closeModal(Ezber): 'dinle' sekmesine ve sure seçici kapalı hâle sıfırlanıyor", h.calls.includes("switchEzberTab:dinle") && h.calls.includes("closeEzberSurahPicker"));
    h.advance(400);
    h.calls.length = 0;
    h.openModal(h.els.topicsModal);
    h.closeAllModals();
    check("closeModal(Konu): kök konuya sıfırlanıyor; her kapanışta ayet ızgaraları kapanıyor", h.calls.includes("resetTopicsModal") && h.calls.includes("closeAllAyahGrids"));
    h.advance(400);
    h.calls.length = 0;
    h.openModal(h.els.surahInfoModal);
    h.closeAllModals();
    check("closeModal(Sure Bilgisi): ana içeriğe sıfırlanıyor", h.calls.includes("closeSurahInfoDetail"));
  }
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log(
    "All checks passed (modal işaretlemesi + closeAllModals listesi, tabbablesIn/isRendered, odağın modala alınması, Tab/Shift+Tab döngüsü, kaçan odağın geri çekilmesi, açan öğenin yakalanması (Chromium + Safari/iOS yolu), zincirleme açılış, restore'un sessiz vazgeçmeleri, app.js openModal/closeModal bağlantısı, kapat-yeniden-aç yarışı). NOT: jsdom'da gerçek Tab gezintisi/düzen yok -- bunlar yapısal/mantıksal kontroller, gerçek ekran okuyucu testinin yerini tutmaz."
  );
}
