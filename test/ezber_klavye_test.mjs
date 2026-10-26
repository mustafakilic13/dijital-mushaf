// Ezber > Oku: kelime açmanın klavye / ekran okuyucu yolu ve oturum akışının duyuruları. Regresyon kontrolü.
//
// Neden var: Oku'da bir kelimeyi açmanın TEK yolu sayfadaki ayete dokunmaktı; sayfa tek bir <svg> olduğundan klavyeyle
// ulaşılabilecek hiçbir şey yoktu. Gerçek Chromium'da ölçülen durum (430 px; Fâtiha 1:1-2; oturum yalnızca klavyeyle
// başlatıldı: #ezber-btn -> Enter -> Oku sekmesi -> aralık -> Enter), düzeltmeden ÖNCE:
//   - oturum başlayınca odak "Bitir"e (açan düğmeye) dönüyor; tam bir Tab turu yalnızca üst çubuk (Cüz, Sayfa, Sure) ve alt çubuk
//     (Bitir, Oynat, Arama) düğmeleri: sayfada hiçbir durak yok;
//   - gövdede Enter / Boşluk / Aşağı / Yukarı / PageDown / End: açılan kapak sayısı değişmiyor (0 kelime açıldı);
//   - fareyle bir kelime açınca: #nav-announcer değişmiyor (hiçbir şey duyurulmuyor) ve Türkçe karşılık baloncuğu HİÇ çıkmıyor:
//     Oku başlarken kelime meali verisi (data/word-meal.json) yalnızca Yaz için yükleniyordu, o sayfa oturumunda ayet paneli ya da
//     arama hiç açılmadıysa Oku'da veri hiç istenmiyordu (ağ isteği sayısı 0).
// Ayrıca ses yüklenemediğinde (çevrimdışı, ses sunucusuna ulaşılamıyor; ses isteği düşürülerek ölçüldü) bir ayet bitince oturum
// bir değil İKİ ayet ilerliyordu (1. ayet bitti -> doğrudan 3. ayet; duyurulan: "...1. ayet", "...3. ayet"): başarısız klip için
// hem "error" olayı hem play()'in reddi onSettled'ı çağırıyor, ikisi de korumadan geçiyordu.
//
// Düzeltme: (index.html, css/style.css, js/app.js)
//   - #ezber-reveal: Oku çalışırken görünen (aksi hâlde `hidden`) "Sıradaki kelimeyi aç" düğmesi, alt çubukta Ezber/Bitir'den hemen
//     sonra. Görsel olarak gizli (.sr-only), klavyeyle odaklanınca alt çubuğun üstüne tam genişlikte biniyor (:focus-visible);
//     fareyle/dokunmayla kullananlar için ekran değişmiyor. Oku başlayınca odak ona geçiyor; oturum bitince (son kelime, ya da
//     ok tuşuyla sayfa çevirme) odak düğmeyle birlikte kaybolmasın diye Ezber düğmesine gidiyor.
//   - ezberRevealNextWord(): kelime açmanın TEK uygulaması; sayfaya dokunma (onEzberStudyTap) ve düğme aynı fonksiyonu çağırıyor.
//   - Duyurular (#nav-announcer; tek canlı bölge korundu): "Oku çalışması başladı", "Bu ayette N kelime var", her açılışta
//     "N. kelime: <Türkçe karşılık>" (son kelimede ". Ayet tamamlandı"), "Ezber çalışması bitti".
//   - Türkçe karşılık verisi Oku'da da yükleniyor; ses başarısızlığında ilerleme tek seferlik.
// Düzeltmeden sonra aynı sahne: odak oturum başlarken düğmede (:focus-visible eşleşiyor), Enter/Boşluk her basışta bir kelime
// açıyor, baloncuk ("adıyla", "Allah'ın", ...) çıkıyor, duyurular sırayla yazılıyor, son kelimeden sonra odak yerinde kalıyor ve
// ayet bitince sıradaki ayet açılıyor; son ayette oturum bitiyor ve odak Ezber düğmesine dönüyor.
//
// Burada kontrol edilenler:
//   (1) index.html: #ezber-reveal işaretlemesi (düğme, başlangıçta hidden, adı, sırası: Ezber'den sonra Oynat'tan önce);
//   (2) css/style.css (jsdom CSSOM'uyla ayrıştırılıyor): .sr-only'nin kırptığı HER özelliğin :focus-visible kuralında geri alındığı
//       (.sr-only'den TÜRETİLİYOR: ileride yeni bir kırpma özelliği eklenirse test kırılır), `display` verilmediği (hidden
//       çalışsın), odak halkasının kapatılmadığı, metin/zemin kontrastı;
//   (3) app.js'ten çıkarılan GERÇEK işlevler (ezberRevealNextWord, onEzberStudyTap, setupEzberReveal, startEzberStudy,
//       endEzberStudy, ezberStudyGoToAyah, ezberStudyPlayAyahThenAdvance, <announce> bloğu) x gerçek index.html DOM'u: kelime açma
//       (düğme ve dokunma), duyuru metinleri ve birleşmeleri, odak yönetimi, ses başarısızlığında tek ilerleme, veri yükleme;
//   (4) kaynak: kelime açmanın tek uygulaması, setupEzberReveal'ın main()'den çağrılması; Türkçe karşılıklarda Arapça harf yok
//       (duyuru tek dilli bir canlı bölgeye yazılıyor).
//
// ÖNEMLİ SINIR: jsdom'da düzen, odak halkası görünümü, :focus-visible eşleşmesi ve gerçek bir ekran okuyucu yok. Düğmenin
// gizlenince odağı kaybetmesi taklit ediliyor (Chromium öyle yapıyor; jsdom yapmıyor). Gerçek tarayıcı ölçümü (Tab durakları,
// :focus-visible, görünüm, duyuru zaman çizelgesi) README'de; gerçek ekran okuyucu (NVDA/JAWS/VoiceOver/TalkBack) çalıştırılmadı.
// Açılan Arapça kelimenin kendisi duyuruda YOK (canlı bölge tek dilli Türkçe); kapakların altındaki metin erişilebilirlik ağacında
// duruyor (README'de "bilinen sınırlar").
//
//   node ezber_klavye_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";
import { tabbablesIn } from "../js/modal-odak.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const css = readText("css", "style.css");
const html = readText("index.html");
const appSource = readText("js", "app.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}

// -- (1) index.html -----------------------------------------------------------------------------------------
const dom = new JSDOM(html);
const D = dom.window.document;
const reveal = D.getElementById("ezber-reveal");
check("index.html: #ezber-reveal var ve tekil", !!reveal && D.querySelectorAll("#ezber-reveal").length === 1);
check("#ezber-reveal: gerçek <button type=button>", !!reveal && reveal.tagName === "BUTTON" && reveal.getAttribute("type") === "button");
check("#ezber-reveal: başlangıçta hidden (oturum yokken Tab durağı değil, erişilebilirlik ağacında yok)", !!reveal && reveal.hidden === true);
check("#ezber-reveal: görünen metin = erişilebilir ad: 'Sıradaki kelimeyi aç' (aria-label ile ezilmiyor, WCAG 2.5.3)", !!reveal && reveal.textContent.trim() === "Sıradaki kelimeyi aç" && !reveal.hasAttribute("aria-label") && !reveal.hasAttribute("aria-labelledby"));
check("#ezber-reveal: .sr-only + .ezber-reveal-btn sınıfları (görsel olarak gizli, klavye odağında CSS açıyor)", !!reveal && reveal.classList.contains("sr-only") && reveal.classList.contains("ezber-reveal-btn"));
check("#ezber-reveal: aria-hidden / tabindex / disabled YOK (ekran okuyucuya ve Tab'a açık)", !!reveal && !reveal.hasAttribute("aria-hidden") && !reveal.hasAttribute("tabindex") && !reveal.hasAttribute("disabled"));
check("#ezber-reveal: canlı bölge değil (tek canlı bölge #nav-announcer kalıyor)", !!reveal && !reveal.closest("[aria-live], [role=status], [role=alert]"));
const bar = D.querySelector(".bottombar");
const barKids = bar ? [...bar.children].map((e) => e.id) : [];
check(`#ezber-reveal alt çubuğun içinde, sırası Ezber'den SONRA Oynat'tan ÖNCE (bulunan: ${barKids.join(" > ")})`, barKids.join(",") === "ezber-btn,ezber-reveal,play-btn,arama-btn");
{
  const tabIds = (root) => tabbablesIn(root).map((e) => e.id);
  check(`hidden iken Tab durakları (alt çubuk): ${tabIds(bar).join(", ")} -- düğme yok`, tabIds(bar).join(",") === "ezber-btn,play-btn,arama-btn");
  reveal.hidden = false;
  check(`görünürken Tab sırası: ${tabIds(bar).join(", ")}`, tabIds(bar).join(",") === "ezber-btn,ezber-reveal,play-btn,arama-btn");
  reveal.hidden = true;
}

// -- (2) css/style.css -------------------------------------------------------------------------------------
const cssRules = [...new JSDOM(`<style>${css}</style>`).window.document.styleSheets[0].cssRules].filter((r) => r.selectorText);
const rules = (selector) => cssRules.filter((r) => r.selectorText === selector);
const propsOf = (r) => Object.fromEntries(Array.from({ length: r.style.length }, (_, i) => [r.style[i], r.style.getPropertyValue(r.style[i]).trim()]));
const srOnly = rules(".sr-only")[0];
const focusRule = rules(".ezber-reveal-btn:focus-visible")[0];
check("css: .sr-only ve .ezber-reveal-btn:focus-visible kuralları var", !!srOnly && !!focusRule);
if (srOnly && focusRule) {
  const hide = propsOf(srOnly);
  const show = propsOf(focusRule);
  const missing = Object.keys(hide).filter((p) => p !== "position" && !(p in show));
  check(`css: .sr-only'nin kırptığı her özellik odakta geri alınıyor (position hariç; eksik: ${missing.join(", ") || "yok"})`, missing.length === 0);
  check("css: odakta kırpma gerçekten kalkıyor: clip auto, overflow visible, width/height auto, margin 0, white-space değişiyor", show.clip === "auto" && show.overflow === "visible" && show.width === "auto" && show.height === "auto" && show.margin === "0" && show["white-space"] !== hide["white-space"]);
  check("css: odakta mutlak konum (position yeniden verilmiyor: .sr-only'den geliyor) ve dört kenar belirli -> alt çubuğu dolduruyor", !("position" in show) && hide.position === "absolute" && ["top", "right", "bottom", "left"].every((p) => p in show));
}
const revealRules = cssRules.filter((r) => /ezber-reveal/.test(r.selectorText));
check("css: .ezber-reveal-btn kurallarında `display` YOK (hidden niteliği ezilmesin; bkz. .info-detail-back[hidden] dersi)", revealRules.length > 0 && revealRules.every((r) => r.style.getPropertyValue("display") === ""));
check("css: odak halkası kapatılmıyor (outline: none/0 yok; genel button:focus-visible halkası geçerli)", revealRules.every((r) => !/^(none|0)\b/.test(r.style.getPropertyValue("outline").trim())) && !!rules("select:focus-visible, input:focus-visible, button:focus-visible")[0]);
check("css: .bottombar position: relative (düğmenin konum çerçevesi açıkça belli)", rules(".bottombar").some((r) => r.style.getPropertyValue("position") === "relative"));
{
  // Metin/zemin kontrastı (WCAG 1.4.3): beyaz yazı x --emerald dolgusu.
  const tokens = {};
  for (const r of cssRules) if (r.selectorText === ":root") for (const [k, v] of Object.entries(propsOf(r))) if (k.startsWith("--")) tokens[k] = v;
  const hex = (h) => {
    const m = /^#([0-9a-f]{6})$/i.exec(h);
    return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null;
  };
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const resolve = (v) => { const m = /^var\((--[\w-]+)\)$/.exec(v || ""); return m ? tokens[m[1]] : v; };
  const bg = hex(resolve(focusRule && propsOf(focusRule).background));
  const fg = hex(resolve(focusRule && propsOf(focusRule).color)) || (focusRule && propsOf(focusRule).color === "#fff" ? [255, 255, 255] : null);
  const ratio = bg && fg ? (Math.max(lum(bg), lum(fg)) + 0.05) / (Math.min(lum(bg), lum(fg)) + 0.05) : 0;
  check(`css: odaktaki düğme yazısı/zemini >= 4,5:1 (ölçülen ${ratio.toFixed(2)}:1)`, ratio >= 4.5);
}

// -- (3) Gerçek işlevler x gerçek DOM -----------------------------------------------------------------------
// Bir işlevin tam metni (imza + gövde), süslü parantezleri sayarak; şablon dizgelerindeki ${...} dengeli.
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
const ANNOUNCE_BLOCK = /\/\/ <announce>([\s\S]*?)\/\/ <\/announce>/.exec(appSource);
const NAMES = ["ezberRevealAnnouncement", "ezberRevealNextWord", "onEzberStudyTap", "setupEzberReveal", "ezberStudyGoToAyah", "ezberStudyPlayAyahThenAdvance", "startEzberStudy", "endEzberStudy"];
const SRCS = Object.fromEntries(NAMES.map((n) => [n, fnSource(n)]));
check(`app.js: gerekli işlevlerin hepsi bulundu (eksik: ${NAMES.filter((n) => !SRCS[n]).join(", ") || "yok"}) ve <announce> bloğu var`, NAMES.every((n) => SRCS[n]) && !!ANNOUNCE_BLOCK);

const STUB_NAMES = ["ezberRenderCoverState", "ezberWordMealText", "showEzberWordTooltip", "ayahPage", "showPage", "ezberBuildUnits", "recitationAudioUrl", "stopPlayback", "isWordMealDataReady", "loadWordMealData", "syncAyahNav", "positionYazKeyboard", "drawEzberCovers"];

function makeHarness({ mode = "oku", glosses = {}, wordIds = [10, 11, 12], mealReady = true } = {}) {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const d = dom.window.document;
  const els = {};
  for (const [key, id] of Object.entries({ ezberBtn: "ezber-btn", ezberReveal: "ezber-reveal", yazKeyboard: "yaz-keyboard", yazHintText: "yaz-hint-text", navAnnouncer: "nav-announcer", playBtn: "play-btn" })) els[key] = d.getElementById(id);
  // Chromium, odaktaki bir öğe gizlenince (hidden -> display:none) odağı <body>'ye düşürür; jsdom düşürmez. Taklit:
  const el = els.ezberReveal;
  Object.defineProperty(el, "hidden", {
    get() { return this.hasAttribute("hidden"); },
    set(v) { if (v && d.activeElement === this) this.blur(); this.toggleAttribute("hidden", !!v); },
  });
  const svg = d.createElementNS("http://www.w3.org/2000/svg", "svg");
  const segs = wordIds.map((id) => ({ wordId: id, xMin: 0, xMax: 1, baselineY: 100 }));
  const state = {
    currentPage: 1,
    selectedAyah: { surah: 1, ayah: 1 },
    surahs: { 1: { nameTurkish: "Fâtiha" } },
    currentPageSvg: svg,
    currentPageWordSegments: segs,
    playback: { audio: null },
    ezberStudy: { mode, surah: 1, from: 1, to: 2, currentAyah: 1, units: wordIds.map((wordId) => ({ wordId })), revealedCount: 0, expectedPage: 1 },
  };
  const calls = { render: 0, tooltip: [], play: 0, showPage: [], buildUnits: [], loadMeal: 0, sync: 0, drawCovers: [], stopPlayback: 0, yazPos: 0, warn: [], errors: [] };
  // Dinleyicide fırlatılan hata jsdom'da tıklamayı yapanın değil pencerenin 'error' olayına gider: yakalayıp kaydediyoruz.
  dom.window.addEventListener("error", (e) => { calls.errors.push(e.message); e.preventDefault(); });
  let ready = mealReady;
  const stubs = {
    ezberRenderCoverState: () => { calls.render++; },
    ezberWordMealText: (surah, ayah, wordId) => glosses[wordId] || "",
    showEzberWordTooltip: (svgEl, seg, text) => calls.tooltip.push([seg.wordId, text]),
    ayahPage: () => 1,
    showPage: async (page, opts) => {
      calls.showPage.push([page, opts && opts.ayah && opts.ayah.ayah]);
      state.selectedAyah = opts.ayah; // gerçek showPage de seçili ayeti yazıp announceNavigation() çağırıyor
      api.announceNavigation();
    },
    ezberBuildUnits: (m, s, a) => { calls.buildUnits.push(a); return [{ wordId: 20 }, { wordId: 21 }, { wordId: 22 }, { wordId: 23 }]; },
    recitationAudioUrl: (s, a) => `audio/${s}-${a}.mp3`,
    stopPlayback: () => { calls.stopPlayback++; },
    isWordMealDataReady: () => ready,
    loadWordMealData: () => { calls.loadMeal++; return stubs.loadResult(); },
    loadResult: () => Promise.resolve({}),
    syncAyahNav: () => { calls.sync++; },
    positionYazKeyboard: () => { calls.yazPos++; },
    drawEzberCovers: (s, defs) => calls.drawCovers.push(defs.length),
  };
  // Sahte <audio>: EventTarget + play()/src; testler "ended" / "error" / reddi elle tetikliyor.
  const audio = new dom.window.EventTarget();
  audio.play = () => { calls.play++; return audio._playResult(); };
  audio._playResult = () => Promise.resolve();
  audio.pause = () => {};
  state.playback.audio = audio;
  // ezberStudyPlayAyahThenAdvance GERÇEK işlev; "ses çaldı" sayısını sahte <audio>'nun play()'inden alıyoruz, böylece
  // ezberRevealNextWord -> ezberStudyPlayAyahThenAdvance -> audio.play() zincirinin tamamı sınanıyor.
  const body = `${ANNOUNCE_BLOCK[1]}\nlet ezberStudyAudioGuard = 0;\n${NAMES.map((n) => SRCS[n]).join("\n")}\nreturn { announce, announceNavigation, ezberRevealAnnouncement, ezberRevealNextWord, onEzberStudyTap, setupEzberReveal, ezberStudyGoToAyah, ezberStudyPlayAyahThenAdvance, startEzberStudy, endEzberStudy };`;
  const consoleStub = { warn: (...a) => calls.warn.push(a.join(" ")), log() {}, error() {} };
  const api = new Function("state", "els", "document", "console", ...STUB_NAMES, body)(state, els, d, consoleStub, ...STUB_NAMES.map((n) => stubs[n]));
  return { dom, d, els, state, calls, stubs, api, audio, setReady: (v) => { ready = v; } };
}
const live = (h) => h.els.navAnnouncer.textContent;

if (NAMES.every((n) => SRCS[n]) && ANNOUNCE_BLOCK) {
  // ---- duyuru metni ----
  {
    const { api } = makeHarness();
    const f = api.ezberRevealAnnouncement;
    check("duyuru: karşılıkla -> '1. kelime: adıyla'", f(1, 4, "adıyla") === "1. kelime: adıyla");
    check("duyuru: karşılık yoksa yalnızca '2. kelime' (boş ': ' yok)", f(2, 4, "") === "2. kelime");
    check("duyuru: son kelimede '. Ayet tamamlandı' ekleniyor", f(4, 4, "Rahim") === "4. kelime: Rahim. Ayet tamamlandı");
    check("duyuru: tek kelimelik ayet hem ilk hem son", f(1, 1, "") === "1. kelime. Ayet tamamlandı");
    check("duyuru: ara kelimede 'Ayet tamamlandı' YOK", !/tamamlandı/.test(f(3, 4, "Rahman")));
  }

  // ---- düğme: bir tıklama = bir kelime ----
  {
    const h = makeHarness({ glosses: { 10: "adıyla", 11: "Allah'ın" } });
    h.api.setupEzberReveal();
    h.els.ezberReveal.hidden = false;
    h.els.ezberReveal.click();
    check("düğme: bir tıklama tam bir kelime açıyor (revealedCount 1)", h.state.ezberStudy.revealedCount === 1);
    check("düğme: kapaklar yeniden çiziliyor (ezberRenderCoverState bir kez)", h.calls.render === 1);
    check("düğme: açılan kelimenin baloncuğu gösteriliyor (dokunmayla aynı: kelime 10, 'adıyla')", JSON.stringify(h.calls.tooltip) === JSON.stringify([[10, "adıyla"]]));
    check("düğme: duyuru gecikmeli yazılıyor (bölge önce boş)", live(h) === "");
    await sleep(90);
    check("düğme: '#nav-announcer' = '1. kelime: adıyla'", live(h) === "1. kelime: adıyla");
    h.els.ezberReveal.click();
    await sleep(90);
    check("ikinci tıklama: '2. kelime: Allah'ın' (öncekinin artığı yok)", live(h) === "2. kelime: Allah'ın" && h.state.ezberStudy.revealedCount === 2);
    check("ayet bitmeden ses çalmıyor", h.calls.play === 0);
    h.els.ezberReveal.click(); // 3. kelime: karşılığı yok
    await sleep(90);
    check("karşılığı olmayan son kelime: baloncuk YOK, duyuru '3. kelime. Ayet tamamlandı'", h.calls.tooltip.length === 2 && live(h) === "3. kelime. Ayet tamamlandı");
    check("son kelimede ayetin sesi bir kez çalmaya başlıyor (ezberStudyPlayAyahThenAdvance)", h.calls.play === 1);
    const before = { render: h.calls.render, play: h.calls.play, tip: h.calls.tooltip.length };
    h.els.ezberReveal.click();
    h.els.ezberReveal.click();
    await sleep(90);
    check("ayet tamamlandıktan sonra (ses çalarken / sonraki ayet yüklenirken) tıklama ETKİSİZ: kelime, kapak, baloncuk, ses, duyuru değişmiyor", h.state.ezberStudy.revealedCount === 3 && h.calls.render === before.render && h.calls.play === before.play && h.calls.tooltip.length === before.tip && live(h) === "3. kelime. Ayet tamamlandı");
    check(`ayet tamamlandıktan sonraki tıklamalar HATA FIRLATMIYOR (olmayan bir birime erişilmiyor; bulunan: ${h.calls.errors.join(" | ") || "yok"})`, h.calls.errors.length === 0);
  }
  {
    // Hızlı art arda iki basış (tuş tekrarı): yalnızca SONUNCUSU söylenir, ama ikisi de kelime açar.
    const h = makeHarness({ glosses: { 10: "adıyla", 11: "Allah'ın" } });
    h.api.setupEzberReveal();
    h.els.ezberReveal.click();
    h.els.ezberReveal.click();
    await sleep(90);
    check("hızlı iki tıklama: iki kelime açıldı, duyuruda yalnızca sonuncusu (birikmiyor)", h.state.ezberStudy.revealedCount === 2 && live(h) === "2. kelime: Allah'ın");
  }

  // ---- dokunma yolu: aynı işlev ----
  {
    const h = makeHarness({ glosses: { 10: "adıyla" } });
    h.api.onEzberStudyTap({ surah: 1, ayah: 1 });
    await sleep(90);
    check("dokunma (güncel ayet): kelime açılıyor, baloncuk ve duyuru DÜĞMEYLE AYNI", h.state.ezberStudy.revealedCount === 1 && JSON.stringify(h.calls.tooltip) === JSON.stringify([[10, "adıyla"]]) && live(h) === "1. kelime: adıyla");
    h.api.onEzberStudyTap({ surah: 1, ayah: 2 });
    h.api.onEzberStudyTap({ surah: 2, ayah: 1 });
    await sleep(90);
    check("dokunma: başka ayet / başka sure YOK SAYILIYOR (kelime açılmıyor, yeni duyuru yok)", h.state.ezberStudy.revealedCount === 1 && live(h) === "1. kelime: adıyla");
  }
  for (const [label, mutate] of [
    ["Yaz oturumu", (st) => { st.ezberStudy.mode = "yaz"; }],
    ["oturum yok", (st) => { st.ezberStudy = null; }],
  ]) {
    const h = makeHarness({ glosses: { 10: "adıyla" } });
    mutate(h.state);
    h.api.setupEzberReveal();
    h.els.ezberReveal.click();
    h.api.onEzberStudyTap({ surah: 1, ayah: 1 });
    await sleep(90);
    check(`${label}: düğme de dokunma da hiçbir şey yapmıyor (kapak, baloncuk, duyuru, ses yok)`, h.calls.render === 0 && h.calls.tooltip.length === 0 && live(h) === "" && h.calls.play === 0);
  }

  // ---- oturum başlangıcı ----
  for (const mode of ["oku", "yaz"]) {
    const h = makeHarness({ mode, mealReady: false });
    h.state.ezberStudy = null;
    h.els.ezberBtn.focus(); // closeModal, odağı açan düğmeye (Ezber) senkron geri veriyor
    await h.api.startEzberStudy(mode, 1, 1, 2);
    await sleep(90);
    check(`${mode}: Türkçe karşılık verisi istendi (ayet paneli/arama hiç açılmamış olsa da; Oku'da eskiden hiç istenmiyordu)`, h.calls.loadMeal === 1);
    check(`${mode}: düğme metni 'Bitir', ayet gezgini eşitlendi, oturum kuruldu`, h.els.ezberBtn.textContent === "Bitir" && h.calls.sync === 1 && h.state.ezberStudy && h.state.ezberStudy.mode === mode);
    if (mode === "oku") {
      check("oku: #ezber-reveal görünür (hidden kalktı) ve ODAK ONDA (Ezber/Bitir'de değil)", h.els.ezberReveal.hidden === false && h.d.activeElement === h.els.ezberReveal);
      check("oku: Yaz klavyesi gizli", h.els.yazKeyboard.hidden === true);
      check("oku: duyuru 'Oku çalışması başladı. Sayfa 1, Fâtiha Suresi, 1. ayet. Bu ayette 4 kelime var' (aynı pencerede TEK metin)", live(h) === "Oku çalışması başladı. Sayfa 1, Fâtiha Suresi, 1. ayet. Bu ayette 4 kelime var");
    } else {
      check("yaz: #ezber-reveal GİZLİ kalıyor ve odak almıyor (Yaz'ın girişi ekran klavyesi)", h.els.ezberReveal.hidden === true && h.d.activeElement === h.els.ezberBtn);
      check("yaz: Yaz klavyesi görünür, konumlandı", h.els.yazKeyboard.hidden === false && h.calls.yazPos === 1);
      check("yaz: duyuru 'Yaz çalışması başladı. Sayfa 1, Fâtiha Suresi, 1. ayet' (kelime sayısı Oku'ya özgü)", live(h) === "Yaz çalışması başladı. Sayfa 1, Fâtiha Suresi, 1. ayet");
    }
  }
  {
    const h = makeHarness({ mealReady: true });
    h.state.ezberStudy = null;
    await h.api.startEzberStudy("oku", 1, 1, 2);
    check("veri zaten yüklüyse yeniden istenmiyor", h.calls.loadMeal === 0);
  }
  {
    // Oku çalışırken (düğme görünür) oturum bitirilmeden Yaz başlatılırsa düğme gizlenmeli (Yaz'da Tab durağı olmasın).
    const h = makeHarness();
    h.state.ezberStudy = null;
    h.els.ezberReveal.hidden = false;
    await h.api.startEzberStudy("yaz", 1, 1, 2);
    check("Oku'dan doğrudan Yaz'a geçiş: #ezber-reveal GİZLENİYOR", h.els.ezberReveal.hidden === true);
  }
  {
    const h = makeHarness({ mealReady: false });
    h.state.ezberStudy = null;
    h.stubs.loadResult = () => Promise.reject(new Error("404"));
    let threw = false;
    try { await h.api.startEzberStudy("oku", 1, 1, 2); await sleep(30); } catch { threw = true; }
    check("veri yüklenemese de oturum başlıyor (hata yalnızca uyarıya düşüyor, yakalanmamış reddedilme yok)", !threw && !!h.state.ezberStudy && h.calls.warn.length === 1 && /gloss/.test(h.calls.warn[0]));
  }

  // ---- ayet geçişi duyurusu ----
  {
    const h = makeHarness();
    await h.api.ezberStudyGoToAyah(2);
    await sleep(90);
    check("ayete geçiş (Oku): 'Sayfa 1, Fâtiha Suresi, 2. ayet. Bu ayette 4 kelime var' (nav + kelime sayısı TEK metin; sayı YENİ ayetin birimlerinden)", live(h) === "Sayfa 1, Fâtiha Suresi, 2. ayet. Bu ayette 4 kelime var" && h.state.ezberStudy.units.length === 4 && h.state.ezberStudy.revealedCount === 0);
  }
  {
    const h = makeHarness({ mode: "yaz" });
    await h.api.ezberStudyGoToAyah(2);
    await sleep(90);
    check("ayete geçiş (Yaz): yalnızca konum duyuruluyor (harf birimi sayısı anlamlı bir 'kelime sayısı' değil)", live(h) === "Sayfa 1, Fâtiha Suresi, 2. ayet");
  }
  {
    const h = makeHarness();
    const p = h.api.ezberStudyGoToAyah(2);
    h.state.ezberStudy = null; // showPage beklerken oturum bitti
    await p;
    await sleep(90);
    check("ayete geçiş: yüklenirken oturum biterse kelime sayısı duyurulmuyor (ve çökmüyor)", !/kelime var/.test(live(h)));
  }

  // ---- oturum sonu ve odak ----
  {
    const h = makeHarness();
    h.els.ezberReveal.hidden = false;
    h.els.ezberReveal.focus();
    h.api.endEzberStudy();
    await sleep(90);
    check("bitiş: odak düğmedeyse (Chromium gizlenince <body>'ye düşürürdü) ODAK EZBER DÜĞMESİNE gidiyor", h.d.activeElement === h.els.ezberBtn);
    check("bitiş: düğme hidden, metin 'Ezber', gezgin eşitlendi, oturum null", h.els.ezberReveal.hidden === true && h.els.ezberBtn.textContent === "Ezber" && h.calls.sync === 1 && h.state.ezberStudy === null);
    check("bitiş: duyuru 'Ezber çalışması bitti'", live(h) === "Ezber çalışması bitti");
  }
  {
    const h = makeHarness();
    h.els.ezberReveal.hidden = false;
    h.els.playBtn.focus();
    h.api.endEzberStudy();
    check("bitiş: odak başka yerdeyse (Oynat) ona DOKUNULMUYOR", h.d.activeElement === h.els.playBtn);
  }
  {
    const h = makeHarness();
    h.els.ezberReveal.hidden = false;
    h.d.activeElement && h.d.activeElement.blur();
    h.api.endEzberStudy();
    check("bitiş: odak zaten <body>'deyse Ezber düğmesine ÇEKİLMİYOR (kullanıcının odağı çalınmıyor)", h.d.activeElement === h.d.body);
  }
  {
    const h = makeHarness();
    h.state.ezberStudy = null;
    h.api.endEzberStudy();
    await sleep(90);
    check("oturum yokken endEzberStudy çağrılırsa hiçbir şey yapmıyor (sahte 'bitti' duyurusu yok)", live(h) === "" && h.calls.sync === 0);
  }
  {
    // showPage'in koruması da oturumu bitiriyor (ok tuşuyla sayfa çevirme): bitiş + gezinme duyuruları TEK metin, bitiş önce.
    const h = makeHarness();
    h.els.ezberReveal.hidden = false;
    h.els.ezberReveal.focus();
    h.api.endEzberStudy();
    h.state.selectedAyah = { surah: 1, ayah: 1 };
    h.api.announceNavigation();
    await sleep(90);
    check("ok tuşuyla sayfa çevirme: 'Ezber çalışması bitti. Sayfa 1, Fâtiha Suresi, 1. ayet' (bitiş önce, tek metin)", live(h) === "Ezber çalışması bitti. Sayfa 1, Fâtiha Suresi, 1. ayet");
  }

  // ---- ses başarısızlığında tek ilerleme ----
  async function settle(setup, { currentAyah, to }) {
    const h = makeHarness();
    h.state.ezberStudy.currentAyah = currentAyah;
    h.state.ezberStudy.to = to;
    setup(h);
    h.api.ezberStudyPlayAyahThenAdvance();
    await sleep(40);
    return h;
  }
  {
    const failing = (h) => {
      h.audio._playResult = () => { queueMicrotask(() => h.audio.dispatchEvent(new h.dom.window.Event("error"))); return Promise.reject(new Error("NotSupportedError")); };
    };
    const h = await settle(failing, { currentAyah: 1, to: 7 });
    check(`ses başarısız (hem 'error' olayı hem play() reddi): TEK ilerleme -- showPage ${h.calls.showPage.length} kez (atlanan ayet yok)`, h.calls.showPage.length === 1 && h.calls.showPage[0][1] === 2 && h.state.ezberStudy && h.state.ezberStudy.currentAyah === 2);
    const h2 = await settle(failing, { currentAyah: 2, to: 3 });
    check("ses başarısız, sondan bir önceki ayet: oturum ERKEN bitmiyor (sonraki ayete geçiyor)", h2.state.ezberStudy !== null && h2.state.ezberStudy.currentAyah === 3 && h2.calls.sync === 0);
    const h3 = await settle(failing, { currentAyah: 3, to: 3 });
    check("ses başarısız, son ayet: oturum TAM BİR KEZ bitiyor", h3.state.ezberStudy === null && h3.calls.sync === 1 && h3.calls.showPage.length === 0);
  }
  {
    const h = makeHarness();
    h.state.ezberStudy.currentAyah = 1;
    h.api.ezberStudyPlayAyahThenAdvance();
    h.audio.dispatchEvent(new h.dom.window.Event("ended"));
    await sleep(40);
    check("ses normal çalıp bitince ('ended'): tek ilerleme (davranış değişmedi)", h.calls.showPage.length === 1 && h.calls.showPage[0][1] === 2);
    h.audio.dispatchEvent(new h.dom.window.Event("ended"));
    await sleep(20);
    check("ve sonradan gelen ikinci 'ended' ilerletmiyor", h.calls.showPage.length === 1);
  }
  {
    const h = makeHarness();
    h.api.ezberStudyPlayAyahThenAdvance();
    h.api.endEzberStudy(); // kullanıcı Bitir'e bastı: bekleyen klip artık ilerletmemeli
    h.audio.dispatchEvent(new h.dom.window.Event("ended"));
    await sleep(40);
    check("klip çalarken oturum bitirilirse bekleyen 'ended' ilerletmiyor (koruma sayacı)", h.calls.showPage.length === 0);
  }
}

// -- (4) Kaynak ---------------------------------------------------------------------------------------------
{
  const tap = SRCS.onEzberStudyTap || "";
  const setup = SRCS.setupEzberReveal || "";
  check("app.js: dokunma yolu (onEzberStudyTap) kelimeyi KENDİSİ açmıyor, ezberRevealNextWord()'ü çağırıyor", /ezberRevealNextWord\(\)/.test(tap) && !/revealedCount\+\+/.test(tap));
  check("app.js: düğme yolu (setupEzberReveal) 'click' dinleyip ezberRevealNextWord()'ü çağırıyor", /ezberReveal\.addEventListener\("click", \(\) => ezberRevealNextWord\(\)\)/.test(setup));
  check("app.js: `revealedCount++` tam 2 yerde (Oku: ezberRevealNextWord, Yaz: handleEzberYazKeyPress) -- Oku'da ikinci bir kelime açma kopyası yok", (appSource.match(/revealedCount\+\+/g) || []).length === 2);
  check("app.js: main() setupEzberReveal()'i çağırıyor (düğme dinleyicisi bağlanıyor)", /setupEzberModal\(\);\s*setupEzberReveal\(\);/.test(appSource));
  check("app.js: els.ezberReveal = #ezber-reveal", /ezberReveal: document\.getElementById\("ezber-reveal"\)/.test(appSource));
  const start = SRCS.startEzberStudy || "";
  check("app.js: Türkçe karşılık verisi iki modda da isteniyor (`mode === \"yaz\" &&` koşulu yok)", /if \(!isWordMealDataReady\(\)\) \{\s*loadWordMealData\(\)/.test(start) && !/mode === "yaz" && !isWordMealDataReady/.test(start));
  const hiddenBeforeFocus = start.indexOf("els.ezberReveal.hidden = false;") > -1 && start.indexOf("els.ezberReveal.hidden = false;") < start.indexOf("els.ezberReveal.focus();");
  check("app.js: startEzberStudy odaklamadan ÖNCE hidden'ı kaldırıyor (gizli öğe odak almaz)", hiddenBeforeFocus);
  const end = SRCS.endEzberStudy || "";
  const iMeasure = end.indexOf("const revealHadFocus = document.activeElement === els.ezberReveal;");
  const iHide = end.indexOf("els.ezberReveal.hidden = true;");
  check("app.js: endEzberStudy odağı düğme GİZLENMEDEN önce ölçüyor", iMeasure > -1 && iHide > iMeasure);
}
{
  // Duyuru TEK dilli bir canlı bölgeye yazılıyor (Arapça için lang="ar" parçası yok): Türkçe karşılıklarda Arapça harf bulunmamalı.
  const data = JSON.parse(readText("data", "word-meal.json"));
  const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
  const bad = Object.entries(data).filter(([, v]) => ARABIC.test(v));
  check(`data/word-meal.json: ${Object.keys(data).length} Türkçe karşılığın hiçbirinde Arapça harf yok (bulunan: ${bad.length}) -- duyuru lang'sız Türkçe canlı bölgeye yazılıyor`, Object.keys(data).length > 60000 && bad.length === 0);
}

if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All checks passed (Ezber > Oku klavye yolu: #ezber-reveal işaretlemesi ve sırası, CSS (.sr-only'den türetilen geri alma, display yok, kontrast), gerçek işlevler x gerçek DOM: kelime açma (düğme = dokunma), duyurular, odak yönetimi, oturum sonu, Türkçe karşılık verisi, ses başarısızlığında tek ilerleme).");
