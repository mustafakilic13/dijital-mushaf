// Cüz ve Ezber pencerelerindeki sekme listelerinin (role="tablist") klavye gezintisi: js/sekme-gezintisi.js ve app.js'teki
// switchJuzTab/switchEzberTab'ın tabindex yönetimi. Regresyon kontrolü.
//
// Neden var: iki sekme çubuğu role="tablist"/"tab"/"tabpanel", aria-selected ve aria-controls ilan ediyordu ama klavyede düz düğme
// dizisiydi. Gerçek Chromium'da ölçülen durum (430 px, sayfa 50; Playwright klavyesi = gerçek tuş olayları), düzeltmeden ÖNCE:
//   - Cüz modalında Tab sırası: Kapat, Cüz, Hizb, Rub, Menzil, ilk liste öğesi: sekmeler 4 AYRI Tab durağı. Ezber modalında: Kapat,
//     Dinle, Oku, Yaz, ses okuyucu seçimi...: 3 ayrı durak. Panele geçmek için hepsini aşmak (ve geri dönmek için aynısını Shift+Tab ile
//     yapmak) gerekiyordu; fareyle Rub seçilince Tab sıradaki sekmeye (Menzil) gidiyordu, panele değil;
//   - odak seçili sekmedeyken Sağ, Sol, Home, End, Aşağı, Yukarı: odak, seçim ve panel 18 tuşun 18'inde de yerinde kalıyordu (hiçbir şey
//     yapmıyordu); sayfa da dönmüyordu (modal açık). Sağ ok basılı tutulunca da (6 tekrar) hiçbir şey olmuyordu.
// Düzeltmeden sonra aynı sahneler: Cüz'de Tab durağı 4 -> 1, Ezber'de 3 -> 1 (Tab, Kapat'tan sonra seçili sekmeye, bir sonraki Tab
// doğrudan panelin ilk öğesine geçiyor; fareyle Rub seçilince Tab panelin ilk liste öğesine gidiyor, Shift+Tab Rub'a dönüyor); Sağ/Sol
// komşu sekmeye geçiyor ve uçlarda sarıyor (Cüz: Cüz->Hizb->Rub->Menzil->Cüz; Ezber: Dinle->Oku->Yaz->Dinle), Home/End ilk/son sekmeye
// gidiyor; odak taşınınca sekme de seçiliyor ve panel değişiyor (aria-selected, tabindex ve görünen panel hep birlikte); Shift/Ctrl/Alt/
// Meta+Sağ, Shift+End, Aşağı, Yukarı, Enter, Boşluk eskisi gibi hiçbir şey yapmıyor; Esc ile kapatıp yeniden açınca ilk sekme seçili ve tek
// durak; odak halkası (2 px altın, :focus-visible) hem Tab'la hem oklarla gelinen sekmede çiziliyor; sayfa hiçbir senaryoda dönmüyor.
//
// Düzeltme: js/sekme-gezintisi.js (yeni): targetTabIndex() (saf: tuş + sıra + sayı -> hedef sıra) ve setupTablist() (tablist'e keydown
// bağlar: Sağ/Sol sararak, Home/End; Alt/Ctrl/Meta/Shift ve tüketilmiş olay yok sayılır; yalnızca işlenen tuşun varsayılanı engellenir;
// hedef sekme seçili değilse onSelect çağrılır, sonra odaklanır). app.js: switchJuzTab/switchEzberTab aria-selected'ı yazdıkları
// döngüde tabindex'i de yazıyor (seçili 0, ötekiler -1; roving tabindex), setupModals/setupEzberModal iki sekme listesini setupTablist'e
// bağlıyor; index.html'deki başlangıç tabindex'leri aynı kurala uyuyor; sw.js yeni dosyayı önbelleğe alıyor.
//
// Burada kontrol edilenler:
//   (1) kaynak: modül dışa aktarımları, app.js import'u ve iki bağlama, iki switch işlevinde tabindex yazımı, sw.js önbellek listesi;
//   (2) targetTabIndex: 1..9 sekme x her sıra (taşan/negatif/tamsayı olmayan dahil) x tuşlar, bağımsız bir kurala karşı + 4000 rastgele
//       çağrı + sarma özellikleri; ilgisiz tuşlar ve geçersiz girdiler;
//   (3) index.html: iki sekme listesinin başlangıç durumu (tek tabindex=0 = aria-selected=true), aria-controls <-> aria-labelledby karşılıklılığı;
//   (4) GERÇEK switch*Tab x GERÇEK bağlama (app.js'teki satırlar kaynaktan çıkarılıp çalıştırılıyor) x GERÇEK index.html DOM'u x gerçek
//       KeyboardEvent'ler, her iki sekme listesi için: 4 işlenen tuş x her sekme, işlenmeyen 14 tuş, 15 değiştirici birleşimi, tüketilmiş olay,
//       sekme olmayan hedefler, fare tıklaması, listenin yeniden kaydırılmaması, Tab durağı sayısı (modal-odak.js'in tabbablesIn'iyle), sayfa
//       çevirme dinleyicisiyle (GERÇEK onPageTurnKeydown) birlikte sayfanın dönmemesi;
//   (5) setupTablist tek başına (sentetik işaretleme): işaretlemesiz/tek sekme/iç içe liste/iki bağımsız liste/iç öğeden gelen olay/kaldırma;
//   (6) 20 tohumlu rastgele işlem dizisi (iki liste, 6000 işlem: tuş, işlenmeyen tuş, değiştiricili tuş, switch çağrısı, tıklama, odak) x
//       bağımsız bir model: aria-selected/tabindex/panel/odak her adımdan sonra modelle aynı.
//
// ÖNEMLİ SINIR: jsdom'da gerçek odak halkası, :focus-visible ve ekran okuyucu yok; odak/seçim/öznitelik durumları elle üretilen olaylarla
// sınanıyor. Gerçek Chromium ölçümü (README) başsızdı. Gerçek ekran okuyucu (NVDA/JAWS/VoiceOver/TalkBack) çalıştırılmadı; "sekme, 2/4"
// anonsu, seçimin duyurulması ve Tab'ın panele geçişi cihazda sınanmadı (README kontrol listesi, madde 22). Firefox ve Safari'de denenmedi
// (Safari'de düğmeye tıklamak odak vermiyor; o durumda ok tuşu, odaktaki sekmeden başlıyor, seçili sekmeden değil: bkz. (6) "odak" işlemi).
//
//   node sekme_gezintisi_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";
import { targetTabIndex, setupTablist } from "../js/sekme-gezintisi.js";
import { tabbablesIn } from "../js/modal-odak.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const appSource = readText("js", "app.js");
const html = readText("index.html");
const swSource = readText("sw.js");

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
const constSource = (name) => {
  const m = new RegExp(`const ${name} = \\[[^\\]]*\\];`).exec(appSource);
  return m ? m[0] : null;
};

const switchJuzSrc = fnSource("switchJuzTab");
const switchEzberSrc = fnSource("switchEzberTab");
const juzConst = constSource("JUZ_TABS");
const ezberConst = constSource("EZBER_TABS");
const turnSrc = fnSource("onPageTurnKeydown");
const selM = /const ARROW_KEY_OWNER_SELECTOR = \[[\s\S]*?\]\.join\(", "\);/.exec(appSource);
// app.js'teki GERÇEK bağlama satırları ve tıklama dinleyicileri (kaynaktan alınıp çalıştırılıyor)
const wireJuz = /^ {2}(setupTablist\(els\.juzTabs, [^\n]*\));$/m.exec(appSource);
const wireEzber = /^ {2}(setupTablist\(els\.ezberTabs, [^\n]*\));$/m.exec(appSource);
const clickJuz = /^ {2}els\.juzTabs\.addEventListener\("click", [\s\S]*?\n {2}\}\);$/m.exec(appSource);
const clickEzber = /^ {2}els\.ezberTabs\.addEventListener\("click", [\s\S]*?\n {2}\}\);$/m.exec(appSource);

// -- (1) Kaynak ----------------------------------------------------------------------------------------------
check("sekme-gezintisi.js: targetTabIndex ve setupTablist dışa aktarılıyor", typeof targetTabIndex === "function" && typeof setupTablist === "function");
check('app.js: setupTablist "./sekme-gezintisi.js"ten import ediliyor', /import \{ setupTablist \} from "\.\/sekme-gezintisi\.js";/.test(appSource));
check("app.js: Cüz sekme listesi setupTablist'e tam bir kez bağlanıyor ve onSelect switchJuzTab'ı çağırıyor", (appSource.match(/setupTablist\(els\.juzTabs,/g) || []).length === 1 && !!wireJuz && /switchJuzTab\(/.test(wireJuz[1]));
check("app.js: Ezber sekme listesi setupTablist'e tam bir kez bağlanıyor ve onSelect switchEzberTab'ı çağırıyor", (appSource.match(/setupTablist\(els\.ezberTabs,/g) || []).length === 1 && !!wireEzber && /switchEzberTab\(/.test(wireEzber[1]));
check("app.js: switchJuzTab aria-selected'ı yazdığı döngüde tabindex'i de yazıyor (seçili 0, öteki -1)", !!switchJuzSrc && /setAttribute\("aria-selected"[\s\S]*?\.tabIndex = active \? 0 : -1;/.test(switchJuzSrc));
check("app.js: switchEzberTab aria-selected'ı yazdığı döngüde tabindex'i de yazıyor (seçili 0, öteki -1)", !!switchEzberSrc && /setAttribute\("aria-selected"[\s\S]*?\.tabIndex = active \? 0 : -1;/.test(switchEzberSrc));
check("app.js: sekme tıklama dinleyicileri duruyor (fare yolu değişmedi)", !!clickJuz && !!clickEzber && /switchJuzTab\(/.test(clickJuz[0]) && /switchEzberTab\(/.test(clickEzber[0]));
check("sw.js: PRECACHE_URLS js/sekme-gezintisi.js'i içeriyor (çevrimdışı açılışta modül eksik kalmasın)", /^ {2}"js\/sekme-gezintisi\.js",$/m.test(swSource));

if (!switchJuzSrc || !switchEzberSrc || !juzConst || !ezberConst || !turnSrc || !selM || !wireJuz || !wireEzber || !clickJuz || !clickEzber) {
  console.error("app.js'ten gerekli kaynak parçaları çıkarılamadı");
  console.error(`${failures + 1} check(s) failed.`);
  process.exit(1);
}

// -- (2) targetTabIndex (saf) ----------------------------------------------------------------------------------
{
  // Bağımsız kural (modül aritmetiğiyle değil, dizi döndürme ve açık dallarla yazıldı)
  const oracle = (key, i, n) => {
    if (!Number.isInteger(i) || !Number.isInteger(n) || n < 1 || i < 0 || i > n - 1) return -1;
    if (key === "ArrowRight") return i === n - 1 ? 0 : i + 1;
    if (key === "ArrowLeft") return i === 0 ? n - 1 : i - 1;
    if (key === "Home") return 0;
    if (key === "End") return n - 1;
    return -1;
  };
  const NAVKEYS = ["ArrowRight", "ArrowLeft", "Home", "End"];
  const OTHER = ["ArrowUp", "ArrowDown", "Tab", "Enter", " ", "Escape", "PageUp", "PageDown", "Delete", "Backspace", "a", "A", "1", "F6", "arrowright", "ARROWLEFT", "Right", "Left", "Spacebar", "", undefined, null, 39, "ArrowRight "];
  let bad = [];
  for (let n = 1; n <= 9; n++) {
    for (let i = -3; i <= n + 2; i++) {
      for (const key of [...NAVKEYS, ...OTHER]) {
        const got = targetTabIndex(key, i, n);
        if (got !== oracle(key, i, n)) bad.push(`${String(key)} i=${i} n=${n}: ${got} != ${oracle(key, i, n)}`);
      }
    }
  }
  check(`targetTabIndex: 1..9 sekme x -3..n+2 sıra x 4 gezinti + 24 ilgisiz tuş, bağımsız kurala uyuyor${bad.length ? ` -- ${bad.slice(0, 3).join(" | ")}` : ""}`, bad.length === 0);

  check("targetTabIndex: Sağ ok sonraki sekmeye (4 sekmede 0->1, 1->2, 2->3)", targetTabIndex("ArrowRight", 0, 4) === 1 && targetTabIndex("ArrowRight", 1, 4) === 2 && targetTabIndex("ArrowRight", 2, 4) === 3);
  check("targetTabIndex: son sekmede Sağ ok başa sarıyor (3->0, 2->0)", targetTabIndex("ArrowRight", 3, 4) === 0 && targetTabIndex("ArrowRight", 2, 3) === 0);
  check("targetTabIndex: Sol ok önceki sekmeye (3->2, 2->1, 1->0)", targetTabIndex("ArrowLeft", 3, 4) === 2 && targetTabIndex("ArrowLeft", 2, 4) === 1 && targetTabIndex("ArrowLeft", 1, 4) === 0);
  check("targetTabIndex: ilk sekmede Sol ok sona sarıyor (0->3, 0->2)", targetTabIndex("ArrowLeft", 0, 4) === 3 && targetTabIndex("ArrowLeft", 0, 3) === 2);
  check("targetTabIndex: Home hep 0, End hep son sıra (her sıradan)", [0, 1, 2, 3].every((i) => targetTabIndex("Home", i, 4) === 0 && targetTabIndex("End", i, 4) === 3));
  check("targetTabIndex: tek sekmede dört gezinti tuşu da 0 (işleniyor, yerinde)", NAVKEYS.every((k) => targetTabIndex(k, 0, 1) === 0));
  check("targetTabIndex: geçersiz girdi -> -1 (NaN, kesirli, undefined, null, dize, Infinity, sayı 0)", [
    targetTabIndex("ArrowRight", NaN, 4), targetTabIndex("ArrowRight", 1.5, 4), targetTabIndex("ArrowRight", undefined, 4), targetTabIndex("ArrowRight", null, 4),
    targetTabIndex("ArrowRight", "1", 4), targetTabIndex("ArrowRight", Infinity, 4), targetTabIndex("ArrowRight", 0, 0), targetTabIndex("ArrowRight", 0, NaN),
    targetTabIndex("ArrowRight", 0, 2.5), targetTabIndex("ArrowRight", 0, undefined), targetTabIndex("ArrowRight", 0, -1),
  ].every((v) => v === -1));
  check("targetTabIndex: sıra -1 (olay bir sekmeden gelmiyor) hiçbir tuşta sekme seçtirmiyor", [...NAVKEYS, ...OTHER].every((k) => targetTabIndex(k, -1, 4) === -1));
  check("targetTabIndex: sıra n (taşan) hiçbir tuşta sekme seçtirmiyor", [...NAVKEYS, ...OTHER].every((k) => targetTabIndex(k, 4, 4) === -1));

  const rnd = mulberry32(1357);
  let badRnd = 0;
  let badProp = 0;
  for (let t = 0; t < 4000; t++) {
    const n = 1 + Math.floor(rnd() * 30);
    const i = Math.floor(rnd() * (n + 6)) - 3;
    const key = [...NAVKEYS, ...OTHER][Math.floor(rnd() * (NAVKEYS.length + OTHER.length))];
    if (targetTabIndex(key, i, n) !== oracle(key, i, n)) badRnd++;
    if (i >= 0 && i < n) {
      // özellikler: n kez Sağ -> başlangıç; Sol(Sağ(i)) = i; Sağ(Sol(i)) = i; Home ve End sabit nokta; sonuç hep aralıkta
      let j = i;
      for (let s = 0; s < n; s++) j = targetTabIndex("ArrowRight", j, n);
      let k = i;
      for (let s = 0; s < n; s++) k = targetTabIndex("ArrowLeft", k, n);
      const r = targetTabIndex("ArrowRight", i, n);
      const l = targetTabIndex("ArrowLeft", i, n);
      const inRange = (v) => Number.isInteger(v) && v >= 0 && v < n;
      if (j !== i || k !== i || targetTabIndex("ArrowLeft", r, n) !== i || targetTabIndex("ArrowRight", l, n) !== i) badProp++;
      if (targetTabIndex("Home", 0, n) !== 0 || targetTabIndex("End", n - 1, n) !== n - 1 || !inRange(r) || !inRange(l)) badProp++;
    }
  }
  check(`targetTabIndex: 4000 rastgele çağrı bağımsız kurala uyuyor (${badRnd} sapma)`, badRnd === 0);
  check(`targetTabIndex: sarma özellikleri (n kez Sağ/Sol = başlangıç, Sol∘Sağ = kimlik, Home/End sabit nokta, sonuç aralıkta) (${badProp} sapma)`, badProp === 0);
}

// -- Ortak donanım ----------------------------------------------------------------------------------------------
const SETS = [
  {
    name: "Cüz",
    tabs: ["juz-tab-juz", "juz-tab-hizb", "juz-tab-rub", "juz-tab-manzil"],
    names: ["juz", "hizb", "rub", "manzil"],
    panels: ["juz-list", "hizb-list", "rub-list", "manzil-list"],
    modal: "juz-modal",
    sw: "switchJuzTab",
    list: (env) => env.els.juzTabs,
    scrollKeys: ["juzList", "hizbList", "rubList", "manzilList"],
  },
  {
    name: "Ezber",
    tabs: ["ezber-tab-dinle", "ezber-tab-oku", "ezber-tab-yaz"],
    names: ["dinle", "oku", "yaz"],
    panels: ["ezber-panel-dinle", "ezber-panel-oku", "ezber-panel-yaz"],
    modal: "ezber-modal",
    sw: "switchEzberTab",
    list: (env) => env.els.ezberTabs,
    scrollKeys: [],
  },
];

// app.js'ten OLDUĞU GİBİ alınan işlevler + bağlama satırları + tıklama dinleyicileri + sayfa çevirme dinleyicisi.
function makeEnv({ modalOpen = true } = {}) {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const win = dom.window;
  const d = win.document;
  const els = {
    juzTabs: d.getElementById("juz-modal").querySelector(".tab-bar"),
    ezberTabs: d.getElementById("ezber-tabs"),
    juzList: d.getElementById("juz-list"),
    hizbList: d.getElementById("hizb-list"),
    rubList: d.getElementById("rub-list"),
    manzilList: d.getElementById("manzil-list"),
  };
  // Her Cüz listesinde bir "aktif" öğe ve sayaçlı scrollIntoView (jsdom'da yok): sekme değişince listenin yeniden ortalanması izlenir.
  const scrollCalls = [];
  for (const key of ["juzList", "hizbList", "rubList", "manzilList"]) {
    const item = d.createElement("button");
    item.className = "modal-item active";
    item.scrollIntoView = () => scrollCalls.push(key);
    els[key].appendChild(item);
  }
  const fns = new Function("document", "els", `${juzConst}\n${ezberConst}\n${switchJuzSrc}\n${switchEzberSrc}\nreturn { switchJuzTab, switchEzberTab };`)(d, els);
  const wire = (expr) =>
    new Function("setupTablist", "els", "switchJuzTab", "switchEzberTab", `return ${expr};`)(setupTablist, els, fns.switchJuzTab, fns.switchEzberTab);
  const click = (src) => new Function("els", "switchJuzTab", "switchEzberTab", src)(els, fns.switchJuzTab, fns.switchEzberTab);
  const disposers = [wire(wireJuz[1]), wire(wireEzber[1])];
  click(clickJuz[0]);
  click(clickEzber[0]);

  const state = { openModalEl: null };
  const turns = { next: 0, prev: 0 };
  const onPageTurnKeydown = new Function("state", "goToNextPage", "goToPrevPage", `${selM[0]}\n${turnSrc}\nreturn onPageTurnKeydown;`)(
    state,
    () => turns.next++,
    () => turns.prev++
  );
  d.addEventListener("keydown", onPageTurnKeydown); // setupNav'taki bağlama ile aynı
  // Modallar gerçek uygulamada açılınca hidden kalkıyor; tabbablesIn yalnızca görünür öğeleri sayıyor.
  for (const id of ["juz-modal", "ezber-modal"]) d.getElementById(id).hidden = false;
  if (modalOpen) state.openModalEl = d.getElementById("juz-modal");
  return { dom, win, d, els, scrollCalls, state, turns, disposers, ...fns };
}

function press(env, target, init) {
  const ev = new env.win.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}
const K = (key, mods = {}) => ({ key, code: key, ...mods });
const el = (env, id) => env.d.getElementById(id);

function snap(env, set) {
  const tabs = set.tabs.map((id) => el(env, id));
  return {
    active: env.d.activeElement ? env.d.activeElement.id || env.d.activeElement.tagName.toLowerCase() : null,
    selected: tabs.filter((t) => t.getAttribute("aria-selected") === "true").map((t) => t.id).join(","),
    stops: tabs.filter((t) => t.getAttribute("tabindex") === "0").map((t) => t.id).join(","),
    others: tabs.filter((t) => t.getAttribute("tabindex") === "-1").length,
    panels: set.panels.filter((id) => !el(env, id).hidden).join(","),
  };
}
const stateFor = (set, i, active = set.tabs[i]) => ({ active, selected: set.tabs[i], stops: set.tabs[i], others: set.tabs.length - 1, panels: set.panels[i] });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// sekme i seçili ve odakta olacak biçimde sıfırla (GERÇEK switch işlevi + odak)
function reset(env, set, i) {
  env[set.sw](set.names[i]);
  el(env, set.tabs[i]).focus();
  env.scrollCalls.length = 0;
  env.turns.next = 0;
  env.turns.prev = 0;
}
const expectedTo = (key, i, n) => (key === "ArrowRight" ? (i === n - 1 ? 0 : i + 1) : key === "ArrowLeft" ? (i === 0 ? n - 1 : i - 1) : key === "Home" ? 0 : n - 1);
const NAV = ["ArrowRight", "ArrowLeft", "Home", "End"];
const MODNAMES = ["shiftKey", "ctrlKey", "altKey", "metaKey"];

// -- (3) index.html: başlangıç durumu ------------------------------------------------------------------------------
for (const set of SETS) {
  const env = makeEnv();
  const s = snap(env, set);
  check(`${set.name}: index.html başlangıcı -- ilk sekme seçili ve TEK tabindex=0, ötekiler tabindex=-1, ilk panel görünür`, s.selected === set.tabs[0] && s.stops === set.tabs[0] && s.others === set.tabs.length - 1 && s.panels === set.panels[0]);
  check(`${set.name}: tüm sekmeler role="tab", ${set.tabs.length} tane, tablist içinde`, set.tabs.every((id) => el(env, id).getAttribute("role") === "tab" && set.list(env).contains(el(env, id))) && set.list(env).querySelectorAll('[role="tab"]').length === set.tabs.length);
  check(`${set.name}: aria-controls <-> aria-labelledby karşılıklı (her sekme kendi panelini gösteriyor, panel sekmeyi adlandırıyor)`, set.tabs.every((id, i) => el(env, id).getAttribute("aria-controls") === set.panels[i] && el(env, set.panels[i]).getAttribute("aria-labelledby") === id && el(env, set.panels[i]).getAttribute("role") === "tabpanel"));
  check(`${set.name}: tablist yatay (aria-orientation=vertical yok; Sol/Sağ yönü doğru)`, set.list(env).getAttribute("role") === "tablist" && set.list(env).getAttribute("aria-orientation") !== "vertical");
  check(`${set.name}: data-tab adları sekme kimlikleriyle uyumlu (onSelect dataset.tab ile switch işlevini çağırıyor)`, set.tabs.every((id, i) => el(env, id).dataset.tab === set.names[i]));
}

// -- (4) Gerçek bağlama x gerçek DOM ---------------------------------------------------------------------------
for (const set of SETS) {
  const n = set.tabs.length;
  const env = makeEnv();
  const { d } = env;

  // 4 işlenen tuş x her sekme
  for (const key of NAV) {
    for (let i = 0; i < n; i++) {
      reset(env, set, i);
      const ev = press(env, el(env, set.tabs[i]), K(key));
      const to = expectedTo(key, i, n);
      check(`${set.name}: ${key}, ${set.tabs[i]} üzerinde -> ${set.tabs[to]}: odak, aria-selected, tabindex ve panel birlikte taşınıyor; varsayılan engellendi`, ev.defaultPrevented && same(snap(env, set), stateFor(set, to)));
    }
  }
  // tam tur: Sağ n kez = başlangıç; her adımda odak seçiliyle aynı
  {
    reset(env, set, 0);
    const seq = [];
    let ok = true;
    for (let s = 0; s < n; s++) {
      press(env, d.activeElement, K("ArrowRight"));
      const sn = snap(env, set);
      seq.push(sn.active);
      if (sn.active !== sn.selected || sn.stops !== sn.selected) ok = false;
    }
    check(`${set.name}: Sağ ok ${n} kez basılınca sırayla ${set.tabs.slice(1).concat(set.tabs[0]).join(" -> ")} ve her adımda odak = seçili = tek Tab durağı`, ok && seq.join(",") === set.tabs.slice(1).concat(set.tabs[0]).join(","));
    reset(env, set, 0);
    const seqL = [];
    for (let s = 0; s < n; s++) {
      press(env, d.activeElement, K("ArrowLeft"));
      seqL.push(d.activeElement.id);
    }
    check(`${set.name}: Sol ok ${n} kez basılınca ters sırada tam tur: ${[...set.tabs].reverse().join(" -> ")} (${seqL.join(" -> ")})`, seqL.join(",") === [...set.tabs].reverse().join(","));
  }
  // işlenmeyen tuşlar: hiçbir şey değişmiyor, varsayılan engellenmiyor (Tab/Aşağı/Yukarı/Enter/Boşluk tarayıcıya kalıyor)
  for (const key of ["ArrowUp", "ArrowDown", "Tab", "Enter", " ", "Escape", "PageUp", "PageDown", "Delete", "Backspace", "a", "1", "F6", "ContextMenu"]) {
    reset(env, set, 1);
    const ev = press(env, el(env, set.tabs[1]), K(key));
    check(`${set.name}: ${JSON.stringify(key)} sekmeye dokunmuyor ve varsayılanı engellemiyor`, !ev.defaultPrevented && same(snap(env, set), stateFor(set, 1)));
  }
  // 15 değiştirici birleşimi x 4 işlenen tuş x her sekme: yok sayılıyor
  for (let mask = 1; mask < 16; mask++) {
    const mods = Object.fromEntries(MODNAMES.map((m, b) => [m, !!(mask & (1 << b))]));
    const label = MODNAMES.filter((m, b) => mask & (1 << b)).map((m) => m.replace("Key", "")).join("+");
    let ok = true;
    let prevented = false;
    for (const key of NAV) {
      for (let i = 0; i < n; i++) {
        reset(env, set, i);
        const ev = press(env, el(env, set.tabs[i]), K(key, mods));
        if (ev.defaultPrevented) prevented = true;
        if (!same(snap(env, set), stateFor(set, i))) ok = false;
      }
    }
    check(`${set.name}: ${label}+Sol/Sağ/Home/End (${4 * n} olay) yok sayılıyor: odak, seçim, panel yerinde, varsayılan engellenmedi`, ok && !prevented);
  }
  // başka bir işleyici olayı zaten tüketmiş
  for (const key of NAV) {
    reset(env, set, 1);
    const tab = el(env, set.tabs[1]);
    tab.addEventListener("keydown", (e) => e.preventDefault(), { once: true });
    press(env, tab, K(key));
    check(`${set.name}: ${key} başka işleyici tarafından tüketilmişse (defaultPrevented) sekme değişmiyor`, same(snap(env, set), stateFor(set, 1)));
  }
  // olay bir sekmeden gelmiyor: listenin kendisi; modalın Kapat düğmesi (liste dışı)
  {
    reset(env, set, 1);
    const evList = press(env, set.list(env), K("ArrowRight"));
    check(`${set.name}: olay sekme listesinin kendisinden geliyorsa (hedef sekme değil) işlenmiyor`, !evList.defaultPrevented && same(snap(env, set), stateFor(set, 1)));
    const close = d.getElementById(set.modal).querySelector(".modal-close");
    close.focus();
    const evClose = press(env, close, K("ArrowRight"));
    check(`${set.name}: Kapat düğmesinde (liste dışı) Sağ ok sekme değiştirmiyor`, !evClose.defaultPrevented && env.d.activeElement === close && snap(env, set).selected === set.tabs[1]);
  }
  // fare tıklaması (GERÇEK tıklama dinleyicisi): seçim + tabindex taşınıyor; ardından ok oradan sürüyor
  for (let i = 0; i < n; i++) {
    reset(env, set, 0);
    el(env, set.tabs[i]).click();
    check(`${set.name}: ${set.tabs[i]} tıklanınca seçim, tek tabindex=0 ve panel ona geçiyor (odağı jsdom vermiyor)`, same(snap(env, set), { ...stateFor(set, i), active: set.tabs[0] }));
    el(env, set.tabs[i]).focus();
    press(env, el(env, set.tabs[i]), K("ArrowRight"));
    check(`${set.name}: ${set.tabs[i]} tıklanıp odaklandıktan sonra Sağ ok bir sonrakine (${set.tabs[(i + 1) % n]}) geçiyor`, same(snap(env, set), stateFor(set, (i + 1) % n)));
  }
  // switch işlevi tek başına (closeModal sıfırlaması): ok gezintisinden sonra ilk sekmeye dönünce roving durumu da sıfırlanıyor
  {
    reset(env, set, 0);
    press(env, el(env, set.tabs[0]), K("End"));
    env[set.sw](set.names[0]); // closeModal'ın yaptığı
    check(`${set.name}: End'ten sonra switch*Tab(ilk) çağrısı (closeModal sıfırlaması) tabindex'i de ilk sekmeye geri veriyor`, same(snap(env, set), { ...stateFor(set, 0), active: set.tabs[n - 1] }));
  }
  // Tab durağı sayısı (modal-odak.js'in tabbablesIn'i): modalın içinde role=tab olan durak TEK ve seçili sekme
  {
    const modal = d.getElementById(set.modal);
    for (let i = 0; i < n; i++) {
      reset(env, set, i);
      const stops = tabbablesIn(modal).filter((x) => x.getAttribute("role") === "tab");
      check(`${set.name}: ${set.names[i]} seçiliyken modaldaki sekme Tab durağı tek ve seçili sekme (${stops.map((x) => x.id).join(",") || "yok"})`, stops.length === 1 && stops[0].id === set.tabs[i]);
    }
    reset(env, set, 0);
    press(env, el(env, set.tabs[0]), K("End"));
    const stops = tabbablesIn(modal).filter((x) => x.getAttribute("role") === "tab");
    check(`${set.name}: End'ten sonra Tab durağı son sekmeye taşınıyor (ilk sekme artık durak değil)`, stops.length === 1 && stops[0].id === set.tabs[n - 1]);
    const inOrder = tabbablesIn(modal);
    const posClose = inOrder.indexOf(modal.querySelector(".modal-close"));
    const posTab = inOrder.findIndex((x) => x.getAttribute("role") === "tab");
    check(`${set.name}: Tab sırası Kapat -> (tek) sekme durağı -> panel içeriği: sekme Kapat'tan hemen sonra`, posClose >= 0 && posTab === posClose + 1);
  }
  // Cüz: seçili sekmeye "gitmek" (Home) listeyi yeniden ortalamıyor; yeni sekmeye geçince yalnızca onun listesi bir kez ortalanıyor
  if (set.scrollKeys.length) {
    reset(env, set, 0);
    press(env, el(env, set.tabs[0]), K("Home"));
    check(`${set.name}: seçili ilk sekmede Home hiçbir listeyi yeniden kaydırmıyor (onSelect yalnızca seçili olmayan hedefte çağrılıyor)`, env.scrollCalls.length === 0);
    press(env, el(env, set.tabs[0]), K("ArrowRight"));
    check(`${set.name}: Sağ ok yeni sekmenin listesini TEK kez ortalıyor (${env.scrollCalls.join(",") || "yok"})`, env.scrollCalls.join(",") === "hizbList");
    env.scrollCalls.length = 0;
    press(env, el(env, set.tabs[1]), K("End"));
    check(`${set.name}: Hizb'den End -> Menzil: yalnızca Menzil listesi ortalanıyor (${env.scrollCalls.join(",") || "yok"})`, env.scrollCalls.join(",") === "manzilList");
  }
  // sayfa çevirme dinleyicisiyle (GERÇEK onPageTurnKeydown) birlikte: modal açıkken de, hipotetik olarak kapalıyken de sayfa dönmüyor
  for (const modalOpen of [true, false]) {
    env.state.openModalEl = modalOpen ? d.getElementById(set.modal) : null;
    let events = 0;
    let turned = 0;
    const run = (target, init) => {
      env.turns.next = 0;
      env.turns.prev = 0;
      press(env, target, init);
      turned += env.turns.next + env.turns.prev;
      events++;
    };
    for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) {
      for (let i = 0; i < n; i++) {
        reset(env, set, i);
        run(el(env, set.tabs[i]), K(key));
      }
    }
    for (const mask of [1, 2, 4, 8, 3, 15]) {
      const mods = Object.fromEntries(MODNAMES.map((m, b) => [m, !!(mask & (1 << b))]));
      reset(env, set, 1);
      for (const key of ["ArrowLeft", "ArrowRight"]) run(el(env, set.tabs[1]), K(key, mods));
    }
    check(`${set.name}: sekmelerde Sol/Sağ/Home/End ve değiştiricili Sol/Sağ sayfa ÇEVİRMİYOR (modal ${modalOpen ? "açık" : "kapalıymış gibi"}; ${events} olay, ${turned} sayfa çevirme)`, turned === 0 && events === 4 * n + 12);
  }
  {
    env.state.openModalEl = null;
    env.turns.next = 0;
    press(env, d.body, K("ArrowLeft"));
    check(`${set.name}: test donanımı denetimi -- gövdede düz Sol ok (modal kapalı) sayfayı çeviriyor: sayfa çevirme dinleyicisi donanımda gerçekten çalışıyor`, env.turns.next === 1);
  }
}

// Ezber'de Sure seçici açıkken sekme çubuğu gizli; gizli çubuğun roving durumu seçici kapanınca bozulmuyor (app.js yalnızca hidden'ı değiştiriyor)
{
  const set = SETS[1];
  const env = makeEnv();
  reset(env, set, 2);
  env.els.ezberTabs.hidden = true; // openEzberPicker'ın yaptığı
  env.els.ezberTabs.hidden = false; // closeEzberPicker'ın yaptığı
  check("Ezber: Sure seçici açılıp kapanınca (sekme çubuğu hidden açılıp kapanınca) Yaz seçili ve tek durak kalıyor", same({ ...snap(env, set), active: "" }, { ...stateFor(set, 2), active: "" }));
  check("Ezber: seçici kapanıp çubuk yeniden görününce Sol ok Yaz'dan Oku'ya geçiyor (roving durum seçiciden etkilenmedi)", (() => {
    el(env, set.tabs[2]).focus();
    press(env, el(env, set.tabs[2]), K("ArrowLeft"));
    return same(snap(env, set), stateFor(set, 1));
  })());
}

// -- (5) setupTablist tek başına (sentetik işaretleme) ---------------------------------------------------------------
{
  const mk = (inner) => {
    const dom = new JSDOM(`<!doctype html><body>${inner}</body>`, { pretendToBeVisual: true });
    return { dom, win: dom.window, d: dom.window.document };
  };
  const tabsOf = (d, sel) => [...d.querySelectorAll(`${sel} [role="tab"]`)];

  // işaretlemesiz (aria-selected hiç yok): her hedef "seçili değil" sayılır, onSelect çağrılır
  {
    const e = mk(`<div id="tl" role="tablist"><button role="tab" id="a">A</button><button role="tab" id="b">B</button><button role="tab" id="c">C</button></div>`);
    const calls = [];
    setupTablist(e.d.getElementById("tl"), (t) => calls.push(t.id));
    e.d.getElementById("a").focus();
    const ev = press(e, e.d.getElementById("a"), K("ArrowRight"));
    check("setupTablist: aria-selected hiç yoksa hedef seçili sayılmıyor: onSelect(b) çağrılıyor, odak b'ye geçiyor, varsayılan engellendi", ev.defaultPrevented && calls.join(",") === "b" && e.d.activeElement.id === "b");
    press(e, e.d.getElementById("b"), K("End"));
    check("setupTablist: End -> son sekme (c); onSelect(c) çağrıldı ve odak c'de", calls.join(",") === "b,c" && e.d.activeElement.id === "c");
    press(e, e.d.getElementById("c"), K("ArrowRight"));
    check("setupTablist: son sekmede Sağ ok başa sarıyor (a)", calls.join(",") === "b,c,a" && e.d.activeElement.id === "a");
    press(e, e.d.getElementById("a"), K("ArrowLeft"));
    check("setupTablist: ilk sekmede Sol ok sona sarıyor (c)", calls.join(",") === "b,c,a,c" && e.d.activeElement.id === "c");
  }
  // hedef zaten seçiliyse onSelect çağrılmıyor ama odak yine taşınıyor ve varsayılan engelleniyor
  {
    const e = mk(`<div id="tl" role="tablist"><button role="tab" id="a" aria-selected="true">A</button><button role="tab" id="b" aria-selected="false">B</button></div>`);
    const calls = [];
    setupTablist(e.d.getElementById("tl"), (t) => calls.push(t.id));
    e.d.getElementById("a").focus();
    const ev = press(e, e.d.getElementById("a"), K("Home"));
    check("setupTablist: odak zaten seçili ilk sekmedeyken Home -- işleniyor (engellendi), onSelect ÇAĞRILMIYOR, odak yerinde", ev.defaultPrevented && calls.length === 0 && e.d.activeElement.id === "a");
    e.d.getElementById("b").focus(); // odak seçili olmayan sekmede (Safari'de tıklamadan sonra olabilir)
    press(e, e.d.getElementById("b"), K("Home"));
    check("setupTablist: odak seçili OLMAYAN sekmedeyken Home a'ya (seçili) gidiyor: onSelect çağrılmıyor çünkü hedef zaten seçili; odak a'ya taşınıyor", calls.length === 0 && e.d.activeElement.id === "a");
  }
  // tek sekme
  {
    const e = mk(`<div id="tl" role="tablist"><button role="tab" id="a" aria-selected="true">A</button></div>`);
    const calls = [];
    setupTablist(e.d.getElementById("tl"), (t) => calls.push(t.id));
    e.d.getElementById("a").focus();
    const evs = NAV.map((k) => press(e, e.d.getElementById("a"), K(k)));
    check("setupTablist: tek sekmede dört gezinti tuşu da işleniyor (engellendi), onSelect çağrılmıyor, odak yerinde", evs.every((ev) => ev.defaultPrevented) && calls.length === 0 && e.d.activeElement.id === "a");
  }
  // sekme içindeki bir iç öğeden gelen olay (ikon/etiket): en yakın [role=tab] bulunuyor
  {
    const e = mk(`<div id="tl" role="tablist"><button role="tab" id="a" aria-selected="true"><span id="ia">A</span></button><button role="tab" id="b" aria-selected="false"><span>B</span></button></div>`);
    const calls = [];
    setupTablist(e.d.getElementById("tl"), (t) => calls.push(t.id));
    const ev = press(e, e.d.getElementById("ia"), K("ArrowRight"));
    check("setupTablist: sekmenin içindeki bir öğeden (span) gelen olay sekmeden gelmiş sayılıyor (closest)", ev.defaultPrevented && calls.join(",") === "b" && e.d.activeElement.id === "b");
  }
  // olay sekme olmayan bir öğeden: liste içindeki sekme olmayan eleman, dış ata sekme rolündeyse bile
  {
    const e = mk(`<div role="tab" id="outer"><div id="tl" role="tablist"><span id="x">x</span><button role="tab" id="a" aria-selected="true">A</button><button role="tab" id="b" aria-selected="false">B</button></div></div>`);
    const calls = [];
    setupTablist(e.d.getElementById("tl"), (t) => calls.push(t.id));
    const ev = press(e, e.d.getElementById("x"), K("ArrowRight"));
    check("setupTablist: listedeki sekme olmayan öğeden gelen olay, DIŞ atanın role=tab'ı olsa bile işlenmiyor (indexOf -1 -> hedef yok)", !ev.defaultPrevented && calls.length === 0);
  }
  // iki bağımsız liste
  {
    const e = mk(`<div id="t1" role="tablist"><button role="tab" id="a1" aria-selected="true">A</button><button role="tab" id="b1" aria-selected="false">B</button></div><div id="t2" role="tablist"><button role="tab" id="a2" aria-selected="true">A</button><button role="tab" id="b2" aria-selected="false">B</button></div>`);
    const c1 = [];
    const c2 = [];
    setupTablist(e.d.getElementById("t1"), (t) => c1.push(t.id));
    setupTablist(e.d.getElementById("t2"), (t) => c2.push(t.id));
    e.d.getElementById("a1").focus();
    press(e, e.d.getElementById("a1"), K("ArrowRight"));
    check("setupTablist: iki bağımsız liste -- 1. listedeki tuş yalnızca 1. listeyi etkiliyor (2. listede onSelect yok, odak 1. listede)", c1.join(",") === "b1" && c2.length === 0 && e.d.activeElement.id === "b1");
    e.d.getElementById("a2").focus();
    press(e, e.d.getElementById("a2"), K("End"));
    check("setupTablist: 2. listedeki End yalnızca 2. listeyi etkiliyor", c1.join(",") === "b1" && c2.join(",") === "b2" && e.d.activeElement.id === "b2");
  }
  // kaldırma
  {
    const e = mk(`<div id="tl" role="tablist"><button role="tab" id="a" aria-selected="true">A</button><button role="tab" id="b" aria-selected="false">B</button></div>`);
    const calls = [];
    const dispose = setupTablist(e.d.getElementById("tl"), (t) => calls.push(t.id));
    check("setupTablist: dönüş değeri bir kaldırma işlevi", typeof dispose === "function");
    dispose();
    e.d.getElementById("a").focus();
    const ev = press(e, e.d.getElementById("a"), K("ArrowRight"));
    check("setupTablist: kaldırıldıktan sonra tuş işlenmiyor (engellenmedi, onSelect yok, odak yerinde)", !ev.defaultPrevented && calls.length === 0 && e.d.activeElement.id === "a");
  }
  // DOM sırası: sekmeler işaretleme sırasıyla (tabindex sırasıyla değil) gezilir
  {
    const e = mk(`<div id="tl" role="tablist"><button role="tab" id="a" tabindex="0" aria-selected="true">A</button><button role="tab" id="b" tabindex="5" aria-selected="false">B</button><button role="tab" id="c" tabindex="-1" aria-selected="false">C</button></div>`);
    const calls = [];
    setupTablist(e.d.getElementById("tl"), (t) => calls.push(t.id));
    e.d.getElementById("a").focus();
    press(e, e.d.getElementById("a"), K("ArrowRight"));
    press(e, e.d.getElementById("b"), K("ArrowRight"));
    check("setupTablist: gezinti DOM sırasında (a -> b -> c); tabindex değeri sırayı değiştirmiyor, tabindex=-1'li sekme de gezilebiliyor", calls.join(",") === "b,c" && e.d.activeElement.id === "c");
  }
  // bir tuş olayında hedef sekme için onSelect, odaktan ÖNCE çağrılıyor (seçim -> odak sırası: ekran okuyucu seçili durumu okuyor)
  {
    const e = mk(`<div id="tl" role="tablist"><button role="tab" id="a" aria-selected="true">A</button><button role="tab" id="b" aria-selected="false">B</button></div>`);
    const order = [];
    const b = e.d.getElementById("b");
    b.addEventListener("focus", () => order.push("focus"));
    setupTablist(e.d.getElementById("tl"), () => order.push("select"));
    e.d.getElementById("a").focus();
    press(e, e.d.getElementById("a"), K("ArrowRight"));
    check("setupTablist: önce onSelect (seçim), sonra odak (focus olayı): sıra select -> focus", order.join(",") === "select,focus");
  }
}

// -- (6) Rastgele işlem dizileri x bağımsız model -------------------------------------------------------------------
{
  const OTHERKEYS = ["ArrowUp", "ArrowDown", "Tab", "Enter", " ", "Escape", "a", "PageDown"];
  let totalOps = 0;
  let totalBad = 0;
  const firstBad = [];
  for (const set of SETS) {
    const n = set.tabs.length;
    for (let seed = 1; seed <= 20; seed++) {
      const rnd = mulberry32(seed * 7919 + n);
      const env = makeEnv();
      const { d } = env;
      let sel = 0;
      let foc = null; // odaktaki sekme sırası ya da null (odak sekmelerde değil)
      d.body.focus();
      for (let step = 0; step < 150; step++) {
        const r = rnd();
        let desc;
        if (r < 0.34) {
          // odak sekmedeyse işlenen tuş
          const key = NAV[Math.floor(rnd() * NAV.length)];
          desc = `nav ${key}`;
          if (foc !== null) {
            press(env, el(env, set.tabs[foc]), K(key));
            const to = expectedTo(key, foc, n);
            sel = to;
            foc = to;
          }
        } else if (r < 0.46) {
          const key = OTHERKEYS[Math.floor(rnd() * OTHERKEYS.length)];
          desc = `diğer ${JSON.stringify(key)}`;
          if (foc !== null) press(env, el(env, set.tabs[foc]), K(key));
        } else if (r < 0.58) {
          const mask = 1 + Math.floor(rnd() * 15);
          const mods = Object.fromEntries(MODNAMES.map((m, b) => [m, !!(mask & (1 << b))]));
          const key = NAV[Math.floor(rnd() * NAV.length)];
          desc = `değiştiricili ${mask} ${key}`;
          if (foc !== null) press(env, el(env, set.tabs[foc]), K(key, mods));
        } else if (r < 0.72) {
          const i = Math.floor(rnd() * n);
          desc = `switch ${set.names[i]}`;
          env[set.sw](set.names[i]);
          sel = i;
        } else if (r < 0.86) {
          const i = Math.floor(rnd() * n);
          desc = `tıkla ${set.names[i]}`;
          el(env, set.tabs[i]).click(); // jsdom'da odak vermiyor; gerçek dinleyici seçimi taşıyor
          sel = i;
        } else if (r < 0.96) {
          const i = Math.floor(rnd() * n);
          desc = `odak ${set.names[i]}`;
          el(env, set.tabs[i]).focus(); // seçili olmayan sekmeye de odak verilebiliyor (Safari'de tıklama sonrası, ekran okuyucu)
          foc = i;
        } else {
          desc = "odak gövdeye";
          d.activeElement.blur();
          foc = null;
        }
        totalOps++;
        const expected = stateFor(set, sel, foc === null ? "body" : set.tabs[foc]);
        const got = snap(env, set);
        if (!same(got, expected)) {
          totalBad++;
          if (firstBad.length < 3) firstBad.push(`${set.name} tohum ${seed} adım ${step} (${desc}): ${JSON.stringify(got)} != ${JSON.stringify(expected)}`);
        }
      }
    }
  }
  check(`rastgele işlemler: ${totalOps} işlem x bağımsız model (aria-selected, tabindex, panel, odak) -- ${totalBad} sapma${firstBad.length ? ` -- ${firstBad.join(" | ")}` : ""}`, totalBad === 0 && totalOps === 6000);
}

if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log(
  "All checks passed (sekme listeleri: targetTabIndex saf kuralı + sarma özellikleri; GERÇEK switchJuzTab/switchEzberTab + GERÇEK bağlama x GERÇEK index.html: Sağ/Sol sararak, Home/End, odak=seçim=tek tabindex=0=panel, işlenmeyen tuşlar, 15 değiştirici birleşimi, tüketilmiş olay, sekme olmayan hedef, tıklama, yeniden kaydırma yok, tek Tab durağı, sayfa çevirme dinleyicisiyle çakışma yok; setupTablist sentetik sınırlar; 6000 rastgele işlem x model)."
);
