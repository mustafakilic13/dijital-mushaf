// Konu Fihristi açıklamalarındaki satır içi <topic data-id> bağlantılarının klavye erişimi: regresyon kontrolü.
//
// Neden var: açıklama metinlerindeki <topic data-id="N">…</topic> (271 konuda 461 adet) tarayıcı için bilinmeyen
// bir öğe. Gerçek Chromium'da ölçülen durum (yamadan önce): Tab'la odaklanamıyor (tabIndex -1), erişilebilirlik
// ağacında rolü yok ("none"), yani klavye ve ekran okuyucu kullanıcısı için düz metin; fareyle tıklanınca ise
// başka bir konuya gidiyor. Ayrıca bir konu çipine ya da bağlantıya Enter basınca gövde baştan basıldığı için
// etkinleştirilen öğe DOM'dan kalkıyor ve odak <body>'ye düşüyordu (yeni konunun adını duyuracak bir odak değişimi yok,
// Tab görünümün ortasından sürüyor). Düzeltme üç parça:
//   - js/topics.js markTopicLinks: data-id'li <topic>'e role="link" tabindex="0" (data-id'siz 48 tanesine dokunmaz);
//   - app.js setupTopicsModal: bağlantıda YALNIZCA Enter tıklama sayılır (APG "Link" deseni; Space değil);
//   - app.js pushTopicsModalTopic: her gezinme adımından sonra odak modalın kapsayıcısına alınır (modal açılırkenki gibi);
//   - app.js popTopicsModalTopic (Geri): aynı kural. Geri düğmesi kökte `hidden` oluyor ve Chromium odaktaki öğe gizlenince
//     odağı <body>'ye düşürüyordu (yamasız ağaçta da öyleydi: ekran okuyucu nerede olduğunu kaybeder, Tab sayfanın başından
//     sürer); ara adımda Geri görünür kalıyor ama başlık sessizce değişirdi. (Geri'nin kökte hiç gizlenmemesi ayrı bir CSS
//     hatasıydı: test/erisilebilirlik_test.mjs'teki genel `[hidden]` kuralı kontrolleri.)
//
// Burada kontrol edilenler:
//   (1) kaynak bağlantıları: app.js'in import'u, render yolunda markTopicLinks'in kullanılması, <topics-modal> bloğu;
//   (2) GERÇEK openModal/closeModal bloğu + <topics-modal> bloğu, gerçek index.html, topics.js, modal-odak.js ve
//       data/topics-tr.json ile jsdom'da: Allah konusu üzerinde ayrıntılı senaryo (rol/tabindex, Tab sırası, odaklanabilirlik,
//       Enter ile gezinme, Geri, Enter'ın YAPMAMASI gerekenler: Space/Tab/değiştirici tuşlar/data-id'siz <topic>/düğmeler,
//       çip ve fareyle gezinmede odağın kapsayıcıya alınması), Geri'de odak (kök, ara adım, odak Geri'de olmasa da,
//       kökte Geri'nin odağı çalmaması) ve 271 konunun 461 bağlantısının TAMAMI için tarama
//       (DOM = veri, Tab durakları = veri sırası, Enter -> hedef konunun adı, Geri -> aynı konu);
//   (3) axe-core: <topic role="link"> öğeleri ARIA kurallarına uyuyor ve "komut adı" kuralı bu öğelere GERÇEKTEN
//       uygulanıyor (boş geçmiyor).
//
// ÖNEMLİ SINIR: jsdom'da düzen ve gerçek Tab gezintisi yok; tarayıcının Enter->click yerel davranışı da yok (düğmelerde
// kendimiz click() çağırıyoruz). Gerçek Chromium'daki uçtan uca ölçüm (Tab durakları, erişilebilirlik ağacı, Enter/Space,
// odak halkası, 461 bağlantının klavyeyle gezilmesi) README'de; gerçek ekran okuyucu testinin YERİNİ TUTMAZ.
//
//   node topic_links_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";
import axeCore from "axe-core";
import { createModalFocus, tabbablesIn } from "../js/modal-odak.js";
import {
  loadTopicsData,
  getTopicsIndex,
  parseAyahsField,
  parseRelatedTopicsField,
  topicCategoryLabels,
  markArabicSpans,
  markTopicLinks,
} from "../js/topics.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const html = readText("index.html");
const appSource = readText("js", "app.js");

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}

// Gerçek yükleyici (loadTopicsData) gerçek veriyle çalışsın: yalnızca fetch() yerinde sahte.
const data = JSON.parse(readText("data", "topics-tr.json"));
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => data });
  try {
    await loadTopicsData();
  } finally {
    globalThis.fetch = realFetch;
  }
}
const index = getTopicsIndex();
check("topics.js: veri yüklendi ve indeks kuruldu", !!index && index.byId.size === data.length);
const byId = index.byId;

// Açıklamadaki data-id'li bağlantılar, kaynak sırasıyla: [{ id, text }]
const linksOf = (t) => [...(t.description || "").matchAll(/<topic data-id="(\d+)">([\s\S]*?)<\/topic>/g)].map((m) => ({ id: Number(m[1]), text: m[2] }));
const bareCountOf = (t) => ((t.description || "").match(/<topic>/g) || []).length;

// -- (1) Kaynak bağlantıları ----------------------------------------------------------------------------------
check('app.js: markTopicLinks "./topics.js"ten import ediliyor', /import \{[^}]*\bmarkTopicLinks\b[^}]*\} from "\.\/topics\.js";/.test(appSource));
check(
  "app.js: konu açıklaması markTopicLinks'ten geçiyor (markArabicSpans ile birlikte, tek bir .topic-description içinde)",
  /<div class="topic-description">\$\{markTopicLinks\(markArabicSpans\(t\.description\)\)\}<\/div>/.test(appSource)
);
const TOPICS_BLOCK = /\/\/ <topics-modal>([\s\S]*?)\/\/ <\/topics-modal>/.exec(appSource);
check("app.js: <topics-modal> ... </topics-modal> bloğu bulundu", !!TOPICS_BLOCK);
const MODAL_START = appSource.indexOf("const modalFocus = createModalFocus(");
const MODAL_END = appSource.indexOf("function setupModals()");
check("app.js: modal odak bloğu (modalFocus .. closeAllModals) bulundu", MODAL_START > 0 && MODAL_END > MODAL_START);
const ESCAPE_SRC = /function escapeHtml\(s\) \{[\s\S]*?\n\}/.exec(appSource);
check("app.js: escapeHtml bulundu", !!ESCAPE_SRC);
check(
  "app.js: popTopicsModalTopic: erken dönüş (kök) -> pop -> render -> odağı kapsayıcıya al (modalFocus.enter(els.topicsModal)), bu sırayla",
  /function popTopicsModalTopic\(\) \{\s*if \(state\.topicsModal\.stack\.length <= 1\) return;\s*state\.topicsModal\.stack\.pop\(\);\s*renderTopicsModalView\(\);[^}]*modalFocus\.enter\(els\.topicsModal\);\s*\}/.test(appSource)
);
{
  const back = new JSDOM(html).window.document.getElementById("topics-modal-back");
  check("index.html: #topics-modal-back başlangıçta hidden (kök görünümde Geri yok) ve gerçek bir <button>", !!back && back.hasAttribute("hidden") && back.tagName === "BUTTON");
}

if (TOPICS_BLOCK && MODAL_START > 0 && MODAL_END > MODAL_START && ESCAPE_SRC) {
  const MODAL_IDS = ["surah-modal", "juz-modal", "page-modal", "ezber-modal", "surah-info-modal", "topics-modal", "arama-modal"];
  const NAMES = ["surahModal", "juzModal", "pageModal", "ezberModal", "surahInfoModal", "topicsModal", "aramaModal"];

  // GERÇEK openModal/closeModal/closeAllModals + GERÇEK <topics-modal> bloğu, gerçek işaretleme üzerinde.
  // light: ayet listesi çizilmez (parseAyahsField boş döner; çip sayaçları da 0 olur). Tarama 1464 görünüm çiziyor ve
  // konu başına ortalama 60 ayet (toplam ~88 bin ayet kutusu, her biri ~7 düğüm) jsdom'da ~20 sn tutuyordu; ayet listesi
  // bağlantıların işleyişiyle ilgisiz. Ayrıntılı senaryo (2a) ve axe gerçek ayet listeleriyle çalışıyor.
  function harness({ light = false } = {}) {
    const dom = new JSDOM(html, { pretendToBeVisual: true });
    const D = dom.window.document;
    const els = {
      modalBackdrop: D.getElementById("modal-backdrop"),
      topicsModalBody: D.getElementById("topics-modal-body"),
      topicsModalTitle: D.getElementById("topics-modal-title"),
      topicsModalBack: D.getElementById("topics-modal-back"),
    };
    NAMES.forEach((n, i) => (els[n] = D.getElementById(MODAL_IDS[i])));
    const state = { openModalEl: null, topicsModal: { stack: [] }, surahs: {} };
    const gotoCalls = [];
    const api = new Function(
      "els", "state", "document", "createModalFocus", "requestAnimationFrame", "setTimeout",
      "closeAllAyahGrids", "closeSurahInfoDetail", "switchJuzTab", "switchEzberTab", "closeEzberSurahPicker",
      "parseAyahsField", "parseRelatedTopicsField", "topicCategoryLabels", "markArabicSpans", "markTopicLinks", "getTopicsIndex",
      "getCachedMealData", "ayahArabicText", "renderMealHTML", "getMealText", "goToAyah",
      `${ESCAPE_SRC[0]}\n${appSource.slice(MODAL_START, MODAL_END)}\n${TOPICS_BLOCK[1]}\n` +
        "return { openModal, closeModal, closeAllModals, modalFocus, openTopicsModal, pushTopicsModalTopic, popTopicsModalTopic, setupTopicsModal };"
    )(
      els, state, D, createModalFocus, () => {}, () => {},
      () => {}, () => {}, () => {}, () => {}, () => {},
      light ? () => [] : parseAyahsField, parseRelatedTopicsField, topicCategoryLabels, markArabicSpans, markTopicLinks, getTopicsIndex,
      () => null, () => "", () => "", () => null, (s, a) => gotoCalls.push(`${s}:${a}`)
    );
    api.setupTopicsModal();
    const win = D.defaultView;
    const body = els.topicsModalBody;
    return {
      D, els, state, api, gotoCalls,
      title: () => els.topicsModalTitle.textContent,
      backVisible: () => !els.topicsModalBack.hidden,
      links: () => [...body.querySelectorAll(".topic-description topic[data-id]")],
      bares: () => [...body.querySelectorAll(".topic-description topic:not([data-id])")],
      keydown(el, init) {
        const ev = new win.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
        el.dispatchEvent(ev);
        return ev;
      },
    };
  }

  // -- (2a) Allah konusu: ayrıntılı senaryo -------------------------------------------------------------------
  const allah = data.find((t) => t.name === "Allah");
  check("veri: 'Allah' konusu var; açıklamasında data-id'li iki bağlantı (Kur'an, İslam)", !!allah && linksOf(allah).map((l) => byId.get(l.id).name).join("|") === "Kur'an|İslam");
  const withBare = data.find((t) => bareCountOf(t) > 0);
  check("veri: data-id'siz <topic> içeren bir konu var", !!withBare);

  if (allah && withBare) {
    const h = harness();
    const expected = linksOf(allah);
    h.api.openTopicsModal(allah.topic_id);

    // açılış
    check("açılış: başlık 'Allah', modal açık, odak kapsayıcıda", h.title() === "Allah" && h.state.openModalEl === h.els.topicsModal && h.D.activeElement === h.els.topicsModal);
    check("açılış: Geri düğmesi gizli (kök görünüm)", !h.backVisible());

    // rol + tabindex
    const L = h.links();
    check("DOM: açıklamadaki data-id'li <topic> sayısı veriyle aynı (2)", L.length === expected.length && L.map((l) => Number(l.getAttribute("data-id"))).join() === expected.map((e) => e.id).join());
    check('DOM: her bağlantı role="link" ve tabindex="0" taşıyor', L.every((l) => l.getAttribute("role") === "link" && l.getAttribute("tabindex") === "0"));
    check("DOM: bağlantı metni özgün metinle aynı (düz metin olarak okunan ad: Kur'an, İslam)", L.map((l) => l.textContent).join("|") === "Kur'an|İslam");

    // Tab sırası (gerçek tabbablesIn): Kapat -> bağlantılar (DOM sırası) -> çipler
    {
      const tabs = tabbablesIn(h.els.topicsModal);
      const iClose = tabs.findIndex((el) => el.classList.contains("modal-close"));
      const i0 = tabs.indexOf(L[0]);
      const i1 = tabs.indexOf(L[1]);
      const iChip = tabs.findIndex((el) => el.classList.contains("topic-chip"));
      check("Tab sırası: Kapat -> 1. bağlantı -> 2. bağlantı -> ilk çip (DOM sırasıyla, bağlantılar durak)", iClose >= 0 && iClose < i0 && i0 + 1 === i1 && iChip > i1);
    }

    // odaklanabilirlik
    L[0].focus();
    check("odak: data-id'li bağlantıya odak verilebiliyor", h.D.activeElement === L[0]);

    // Enter dışındaki tuşlar bağlantıyı etkinleştirmiyor (başlık değişmiyor) ve olay yutulmuyor
    {
      const before = h.title();
      const cases = [
        ["Space", { key: " " }],
        ["Shift+Enter", { key: "Enter", shiftKey: true }],
        ["Ctrl+Enter", { key: "Enter", ctrlKey: true }],
        ["Alt+Enter", { key: "Enter", altKey: true }],
        ["Meta+Enter", { key: "Enter", metaKey: true }],
        ["ArrowRight", { key: "ArrowRight" }],
        ["a", { key: "a" }],
      ];
      for (const [name, init] of cases) {
        L[0].focus();
        const ev = h.keydown(L[0], init);
        check(`${name}: bağlantıyı etkinleştirmiyor (başlık '${before}' kalıyor, yığına eklenmiyor) ve olay yutulmuyor`, h.title() === before && !h.backVisible() && !ev.defaultPrevented);
      }
      L[0].focus();
      h.keydown(L[0], { key: "Tab" });
      check("Tab: bağlantıyı etkinleştirmiyor", h.title() === before && !h.backVisible());
    }

    // Enter: gezinme, odak kapsayıcıda, Geri görünür
    {
      L[0].focus();
      const ev = h.keydown(L[0], { key: "Enter" });
      check("Enter: Kur'an konusuna gidiyor (başlık = hedefin adı)", h.title() === "Kur'an");
      check("Enter: olay işlendi (defaultPrevented)", ev.defaultPrevented);
      check("Enter: Geri düğmesi görünür (yığına eklendi)", h.backVisible());
      check("Enter: odak <body>'ye düşmedi, modal kapsayıcısında (yeni başlık okunur)", h.D.activeElement === h.els.topicsModal && h.D.activeElement !== h.D.body);
      // Enter basılı tutulunca tekrar eden keydown'lar (repeat) hedef artık kapsayıcı: bir adım daha atlamamalı
      const ev2 = h.keydown(h.D.activeElement, { key: "Enter", repeat: true });
      check("Enter basılı tutuldu (repeat): ikinci bir adım atlamıyor", h.title() === "Kur'an" && !ev2.defaultPrevented);
      // Geri: bir adım, Allah'a dönüş
      h.els.topicsModalBack.click();
      check("Geri: Allah'a dönüyor, Geri gizli", h.title() === "Allah" && !h.backVisible());
    }

    // 2. bağlantı + fareyle tıklama aynı yol
    {
      const L2 = h.links();
      L2[1].focus();
      h.keydown(L2[1], { key: "Enter" });
      check("Enter (2. bağlantı): İslam konusuna gidiyor", h.title() === "İslam" && h.D.activeElement === h.els.topicsModal);
      h.els.topicsModalBack.click();
      const L3 = h.links();
      L3[0].click();
      check("fareyle/dokunmayla tıklama: Kur'an konusuna gidiyor ve odak yine kapsayıcıda (tek yol)", h.title() === "Kur'an" && h.D.activeElement === h.els.topicsModal);
      h.els.topicsModalBack.click();
    }

    // Düğmelere (çip, Mushaf'ta Ayete Git) dokunmuyor: Enter'ı yutmamalı, yoksa yerel Enter->click ölür
    {
      const chip = h.els.topicsModalBody.querySelector(".topic-chip");
      check("sahne: kök görünümde konu çipi var", !!chip);
      const titleBefore = h.title();
      chip.focus();
      const ev = h.keydown(chip, { key: "Enter" });
      check("Enter bir çipte: olay yutulmuyor (yerel Enter->click çalışsın) ve çipe kendi başına gitmiyor (çift etkinleştirme yok)", !ev.defaultPrevented && h.title() === titleBefore && !h.backVisible());
      const goto = h.els.topicsModalBody.querySelector(".info-detail-goto-btn");
      if (goto) {
        goto.focus();
        const evGoto = h.keydown(goto, { key: "Enter" });
        check("Enter 'Mushaf'ta Ayete Git' düğmesinde: olay yutulmuyor", !evGoto.defaultPrevented && h.gotoCalls.length === 0);
      }
    }

    // Çip (klavyeyle etkinleştirilen düğme): odak <body>'ye düşmüyor, kapsayıcıya alınıyor
    {
      const chip = h.els.topicsModalBody.querySelector(".topic-chip");
      const target = byId.get(Number(chip.getAttribute("data-id")));
      chip.focus();
      check("sahne: çipe odak verildi", h.D.activeElement === chip);
      chip.click(); // klavyede Enter'ın yerel sonucu: click
      check("çip (klavyeyle etkinleştirme): hedef konuya gidiyor", h.title() === target.name && h.backVisible());
      check("çip: etkinleştirilen çip DOM'dan kalktı ama odak <body>'ye düşmedi, kapsayıcıda", !chip.isConnected && h.D.activeElement === h.els.topicsModal);
      // Tab sırası görünümün başından sürüyor: kapsayıcı -> Geri -> Kapat ...
      const tabs = tabbablesIn(h.els.topicsModal);
      check("çip: yeni görünümde Tab sırası başından (ilk durak Geri düğmesi)", tabs[0] === h.els.topicsModalBack);
      h.els.topicsModalBack.click();
    }

    // data-id'siz <topic>: işaret yok, odaklanamaz, Enter hiçbir şey yapmaz, Tab durağı değil
    {
      h.api.pushTopicsModalTopic(withBare.topic_id);
      const bares = h.bares();
      check(`DOM: data-id'siz <topic> sayısı veriyle aynı (${bareCountOf(withBare)})`, bares.length === bareCountOf(withBare));
      check('data-id\'siz <topic>: role ve tabindex YOK (hedefi olmayan bağlantı odak durağı olmasın)', bares.every((b) => b.getAttribute("role") === null && b.getAttribute("tabindex") === null));
      const tabs = tabbablesIn(h.els.topicsModal);
      check("data-id'siz <topic>: Tab durağı değil", bares.every((b) => !tabs.includes(b)));
      bares[0].focus();
      check("data-id'siz <topic>: odak verilemiyor", h.D.activeElement !== bares[0]);
      const t = h.title();
      const depth = h.backVisible();
      const ev = h.keydown(bares[0], { key: "Enter" });
      check("data-id'siz <topic>: Enter hiçbir şey yapmıyor ve olay yutulmuyor", h.title() === t && h.backVisible() === depth && !ev.defaultPrevented);
      h.els.topicsModalBack.click();
    }
  }

  // -- (2c) Geri (pop) ve odak --------------------------------------------------------------------------------
  // jsdom, odaktaki öğe gizlenince odağı kendiliğinden düşürmüyor; bu yüzden "odak kapsayıcıda" kontrolü Geri'nin
  // odakta KALMAMASINI da sınıyor (düzeltme olmadan activeElement hâlâ gizlenen düğme olurdu).
  const kuran = data.find((t) => t.name === "Kur'an");
  const islam = data.find((t) => t.name === "İslam");
  check("veri: 'Kur'an' ve 'İslam' konuları var", !!kuran && !!islam);
  if (allah && kuran && islam) {
    const h = harness();
    h.api.openTopicsModal(allah.topic_id);
    const stackLen = () => h.state.topicsModal.stack.length;

    // (A) bir adım içeride, odak Geri'de: kök görünüme dönülünce Geri gizlenir -> odak kapsayıcıya
    h.api.pushTopicsModalTopic(kuran.topic_id);
    h.els.topicsModalBack.focus();
    check("(A) sahne: Kur'an konusunda, Geri görünür ve odakta", h.title() === "Kur'an" && h.backVisible() && h.D.activeElement === h.els.topicsModalBack);
    h.els.topicsModalBack.click();
    check("(A) Geri: Allah'a (kök) dönüyor, Geri gizli, yığın 1", h.title() === "Allah" && !h.backVisible() && stackLen() === 1);
    check("(A) Geri: odak gizlenen Geri'de kalmadı, <body>'ye de düşmedi: modal kapsayıcısında", h.D.activeElement === h.els.topicsModal && h.D.activeElement !== h.D.body);
    check("(A) Geri: Tab sırası görünümün başından (Geri gizli, ilk durak Kapat)", tabbablesIn(h.els.topicsModal)[0] === h.els.topicsModal.querySelector(".modal-close"));

    // (B) iki adım içeride: ara adıma dönüş. Geri görünür kalıyor ama başlık değişiyor -> odak yine kapsayıcıya
    h.api.pushTopicsModalTopic(kuran.topic_id);
    h.api.pushTopicsModalTopic(islam.topic_id);
    check("(B) sahne: İslam konusunda, yığın 3", h.title() === "İslam" && stackLen() === 3);
    h.els.topicsModalBack.focus();
    h.els.topicsModalBack.click();
    check("(B) Geri: Kur'an'a (ara adım) dönüyor, Geri hâlâ görünür, yığın 2", h.title() === "Kur'an" && h.backVisible() && stackLen() === 2);
    check("(B) Geri: odak Geri'de kalmadı, modal kapsayıcısında (başlık değişimi okunur)", h.D.activeElement === h.els.topicsModal);
    check("(B) Geri: Tab sırası görünümün başından (ilk durak Geri düğmesi)", tabbablesIn(h.els.topicsModal)[0] === h.els.topicsModalBack);
    h.els.topicsModalBack.click();
    check("(B) ikinci Geri: kök, Geri gizli, odak kapsayıcıda", h.title() === "Allah" && !h.backVisible() && stackLen() === 1 && h.D.activeElement === h.els.topicsModal);

    // (C) Geri'ye odak verilmeden de (Safari/iOS düğmeye odak vermez; ya da odak başka yerdeyken) aynı sonuç
    h.api.pushTopicsModalTopic(kuran.topic_id);
    h.D.body.focus();
    h.D.activeElement.blur();
    check("(C) sahne: odak <body>'de", h.D.activeElement === h.D.body);
    h.els.topicsModalBack.click();
    check("(C) Geri (odak başka yerdeyken): kök, odak kapsayıcıda", h.title() === "Allah" && h.D.activeElement === h.els.topicsModal);

    // (D) kökte popTopicsModalTopic hiçbir şey yapmaz ve odağı ÇALMAZ (erken dönüş, enter()'den önce)
    const chip = h.els.topicsModalBody.querySelector(".topic-chip");
    chip.focus();
    h.api.popTopicsModalTopic();
    check("(D) kökte pop: başlık 'Allah' kalıyor, Geri gizli, yığın 1, odak çalınmıyor (çip odakta)", h.title() === "Allah" && !h.backVisible() && stackLen() === 1 && h.D.activeElement === chip);
  }

  // -- (2b) Tarama: 271 konunun 461 bağlantısının TAMAMI --------------------------------------------------------
  {
    const root = allah ? allah.topic_id : data[0].topic_id;
    const h = harness({ light: true });
    h.api.openTopicsModal(root);
    const withLinks = data.filter((t) => linksOf(t).length > 0);
    let enters = 0;
    const bad = { render: [], role: [], bare: [], focus: [], tab: [], enter: [], back: [] };
    const note = (kind, t, extra = "") => bad[kind].length < 5 && bad[kind].push(`#${t.topic_id}${extra}`);
    for (const T of withLinks) {
      h.api.pushTopicsModalTopic(T.topic_id);
      const exp = linksOf(T);
      if (h.title() !== T.name) { note("render", T, ` başlık ${h.title()}`); }
      const L = h.links();
      if (L.map((l) => Number(l.getAttribute("data-id"))).join() !== exp.map((e) => e.id).join() || L.map((l) => l.textContent).join("|") !== exp.map((e) => e.text).join("|")) note("render", T, " DOM!=veri");
      if (!L.every((l) => l.getAttribute("role") === "link" && l.getAttribute("tabindex") === "0")) note("role", T);
      const B = h.bares();
      if (B.length !== bareCountOf(T) || !B.every((b) => b.getAttribute("role") === null && b.getAttribute("tabindex") === null)) note("bare", T);
      // Tab durakları: veri sırasıyla tüm bağlantılar, başka hiçbir <topic> yok
      const stops = tabbablesIn(h.els.topicsModal).filter((el) => el.tagName === "TOPIC");
      if (stops.map((s) => Number(s.getAttribute("data-id"))).join() !== exp.map((e) => e.id).join()) note("tab", T);
      for (let k = 0; k < exp.length; k++) {
        const link = h.links()[k];
        link.focus();
        if (h.D.activeElement !== link) note("focus", T, ` bağlantı ${k}`);
        const ev = h.keydown(link, { key: "Enter" });
        enters++;
        if (h.title() !== byId.get(exp[k].id).name || !h.backVisible() || h.D.activeElement !== h.els.topicsModal || !ev.defaultPrevented) note("enter", T, ` -> ${exp[k].id}`);
        h.els.topicsModalBack.click();
        if (h.title() !== T.name) note("back", T, ` <- ${exp[k].id}`);
      }
      h.els.topicsModalBack.click(); // kök görünüme dön
    }
    const sum = (k) => bad[k].length ? ` (ilk bulgular: ${bad[k].join(", ")})` : "";
    check(`tarama: ${withLinks.length} konu (veri) -- hepsi sahnelendi, başlık ve DOM bağlantıları veriyle (id, sıra, metin) aynı${sum("render")}`, withLinks.length === 271 && bad.render.length === 0);
    check(`tarama: her bağlantı role="link" tabindex="0" taşıyor${sum("role")}`, bad.role.length === 0);
    check(`tarama: data-id'siz <topic>'lerde role/tabindex yok, sayıları veriyle aynı${sum("bare")}`, bad.bare.length === 0);
    check(`tarama: Tab durakları (<topic>) tam olarak veri sırasındaki bağlantılar${sum("tab")}`, bad.tab.length === 0);
    check(`tarama: her bağlantıya odak verilebiliyor${sum("focus")}`, bad.focus.length === 0);
    check(`tarama: ${enters} Enter -- hepsi hedef konunun adına gitti, Geri görünür, odak kapsayıcıda, olay işlendi${sum("enter")}`, enters === 461 && bad.enter.length === 0);
    check(`tarama: Geri her seferinde aynı konuya döndürdü${sum("back")}`, bad.back.length === 0);
  }

  // -- (3) axe-core: ARIA yapısı + "komut adı" kuralı bu öğelere gerçekten uygulanıyor -----------------------------
  if (allah) {
    const h = harness();
    h.api.openTopicsModal(allah.topic_id);
    const win = h.D.defaultView;
    const prev = { window: globalThis.window, document: globalThis.document, Node: globalThis.Node, getComputedStyle: globalThis.getComputedStyle };
    globalThis.window = win;
    globalThis.document = h.D;
    globalThis.Node = win.Node;
    globalThis.getComputedStyle = win.getComputedStyle.bind(win);
    if (!win.requestAnimationFrame) win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    let results = null;
    try {
      results = await axeCore.run(
        h.els.topicsModal, // bağlam bir Element olmalı (nesne biçimi window/document'ı çıkaramıyor)
        {
          runOnly: { type: "rule", values: ["aria-roles", "aria-allowed-role", "aria-allowed-attr", "aria-valid-attr", "aria-valid-attr-value", "aria-command-name", "tabindex", "nested-interactive"] },
          resultTypes: ["violations", "passes"],
        }
      );
    } catch (e) {
      check(`axe-core çalışamadı: ${e.message}`, false);
    } finally {
      globalThis.window = prev.window;
      globalThis.document = prev.document;
      globalThis.Node = prev.Node;
      globalThis.getComputedStyle = prev.getComputedStyle;
    }
    if (results) {
      const details = results.violations.map((v) => `${v.id} (${v.nodes.length})`).join(", ");
      check(`axe-core: konu modalında ARIA/odak yapısı ihlali yok (${details || "yok"})`, results.violations.length === 0);
      const passed = (id) => (results.passes.find((p) => p.id === id) || { nodes: [] }).nodes;
      const topicNodes = (id) => passed(id).filter((n) => /^<topic\b/.test(n.html));
      check("axe-core: 'aria-command-name' kuralı <topic role=\"link\"> öğelerine GERÇEKTEN uygulandı ve geçti (adı içeriğinden: boş geçmiyor)", topicNodes("aria-command-name").length === 2);
      check("axe-core: 'aria-allowed-role'/'aria-roles' kuralları bu öğelere uygulandı", topicNodes("aria-roles").length === 2);
    }
  }
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log(
    "All checks passed (<topic data-id> bağlantıları: role/tabindex, Tab sırası, odaklanabilirlik, YALNIZCA Enter ile gezinme, değiştirici tuş/Space/Tab/düğme/data-id'siz <topic> dokunulmazlığı, çip ve bağlantıda odağın kapsayıcıya alınması, Geri'de odak (kök/ara adım/odak başka yerdeyken/kökte pop no-op), 271 konunun 461 bağlantısının taraması, axe-core). NOT: jsdom'da düzen/gerçek Tab/yerel Enter->click yok -- gerçek ekran okuyucu testinin yerini tutmaz."
  );
}
