// Ezber oturumunda kapağın ALTINDAKİ Arapça metin erişilebilirlik ağacından çıkarılıyor mu? Regresyon kontrolü.
//
// Neden var: Ezber > Oku/Yaz'da açılmamış kelimeler yalnızca GÖRSEL olarak gizliydi: SVG'ye, görünmez metin katmanının ÜSTÜNE kapak
// dikdörtgenleri çiziliyor (app.js drawEzberCovers). Metin katmanının kendisi (render.js addTextSelectionLayer) ise satır başına tek
// bir metin düğümüydü ve erişilebilirlik ağacında tam metin olarak duruyordu: ekran okuyucu kullanıcısı, kapakların altındaki
// ayeti sayfadan okuyabiliyordu -- Yaz'daki "Doğru" / "Bu harf değil" geri bildirimi ve Oku'daki "kelimeyi aç" anlamsız kalıyordu.
// Gerçek Chromium'da (CDP Accessibility.getFullAXTree; 430 px; Fâtiha sayfası, 280 Arapça harf; Oku 1:1-3 ve Yaz 1:1-2; oturum
// başlarken, kelime/harf açılırken, ayet geçerken ve biterken 11 durum) düzeltmeden ÖNCE: kapak sayısı 12 -> 7 (Oku) ve 36 -> 32 (Yaz)
// arasında değişirken ağaçtaki Arapça harf 11 durumun HEPSİNDE 280/280'di (ayrıntı README'de).
//
// Düzeltme: (js/render.js, js/app.js)
//   - addTextSelectionLayer, satırı kelime başına bir <span class="text-layer-word" data-word-id> olarak kuruyor (aralarındaki boşluk
//     soldaki kelimenin span'ının sonunda; textContent, seçim ve kopyalama değişmiyor, ağaçta yalnızca boşluktan oluşan düğüm yok);
//   - drawEzberCovers, kapakları çizdiği AYNI veriden (coverDefs) kapaklı kelimelerin span'larına aria-hidden="true" veriyor
//     (syncEzberTextLayer); kapak kalkınca işaret de kalkıyor; drawEzberCovers(svg, []) (oturum sonu) hepsini temizliyor.
//
// Burada kontrol edilenler (jsdom; app.js'ten çıkarılan GERÇEK drawEzberCovers / syncEzberTextLayer / ezberWordIsUpcoming /
// ezberRenderCoverState, GERÇEK render.js addTextSelectionLayer ve splitIntoUnits, GERÇEK data/mushaf.json sayfaları):
//   (1) kaynak: render.js satırları kelime kelime kuruyor (yalnız ayet satırlarında), app.js kapakla birlikte işaretliyor;
//   (2) Fâtiha sayfası (1), Bakara'nın iki sayfası (3 ve 4; satırlar ayet sınırlarını aşıyor; oturum sayfa 3'ten 4'e geçiyor): Oku ve Yaz
//       oturumunun HER adımında
//       aria-hidden alan kelimeler kümesi (a) bağımsız bir "neyin kapalı olması gerekir" kestirimine, (b) çizilen kapak dikdörtgenlerinin
//       üstünde durduğu kelimelere birebir eşit, (c) ağaçta kalan satır metni yalnızca kapaksız kelimeler;
//   (3) Yaz'da bir kelime, SON harfi açılınca ağaca giriyor (yarım kelime girmiyor); Oku'da açılan kelime hemen giriyor;
//   (4) ömür döngüsü: oturum bitince ve oturum ortasında bırakılınca SVG, oturumdan önceki hâliyle BAYT BAYT aynı; sayfa değişiminde
//       eski sayfada işaret kalmıyor; oturum sürerken metin katmanı dışında hiçbir şeye aria-hidden verilmiyor.
//
// ÖNEMLİ SINIR: jsdom'da erişilebilirlik ağacı yok; burada aria-hidden İŞARETİ kontrol ediliyor (ağaçtan çıkıp çıkmadığı gerçek
// Chromium'da, README'deki ölçümle görüldü). Gerçek ekran okuyucu (NVDA/JAWS/VoiceOver/TalkBack) çalıştırılmadı.
//
//   node ezber_metin_katmani_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM, VirtualConsole } from "jsdom";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const appSource = readText("js", "app.js");
const renderSource = readText("js", "render.js");

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}

// render.js çıplak `document` kullanıyor (canvas ölçümü jsdom'da yok; kendi yedeğine düşüyor): jsdom belgesi global'e konuyor.
const SVG_NS = "http://www.w3.org/2000/svg";
const dom = new JSDOM(`<!DOCTYPE html><html lang="tr"><body></body></html>`, { pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
const doc = dom.window.document;
globalThis.document = doc;
const { LineRenderer, splitIntoUnits } = await import("../js/render.js");

// -- (1) Kaynak ----------------------------------------------------------------------------------------------
check("render.js: ayet satırı (t === \"a\") kelimeleriyle, besmele satırı kelimesiz addTextSelectionLayer'a veriliyor", /this\.addTextSelectionLayer\(pageG, lineText, rightEdgeX, width, baselineY, line\.t === "a" \? line\.w : null\)/.test(renderSource));
check("render.js: metin katmanı kelimeleri .text-layer-word span'ı + data-word-id olarak kuruyor", /span\.className = "text-layer-word"/.test(renderSource) && /span\.setAttribute\("data-word-id", String\(w\.i\)\)/.test(renderSource));
check("render.js: kelimeler birleşince lineText'le aynı değilse düz metne düşüyor (textContent her zaman lineText)", /words\.map\(\(w\) => w\.t\)\.join\(" "\) === lineText/.test(renderSource) && /div\.textContent = lineText/.test(renderSource));

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
const NAMES = ["drawEzberCovers", "syncEzberTextLayer", "ezberWordIsUpcoming", "ezberRenderCoverState"];
const SRCS = Object.fromEntries(NAMES.map((n) => [n, fnSource(n)]));
check(`app.js: gerekli işlevlerin hepsi bulundu (eksik: ${NAMES.filter((n) => !SRCS[n]).join(", ") || "yok"})`, NAMES.every((n) => SRCS[n]));
const draw = SRCS.drawEzberCovers || "";
check("app.js: drawEzberCovers kapakları çizdikten SONRA, aynı coverDefs ile syncEzberTextLayer'ı çağırıyor (kapak ve işaret ayrışamaz)", /layer\.appendChild\(rect\);\s*\}\s*syncEzberTextLayer\(svg, coverDefs\);\s*\}$/.test(draw));
check("app.js: aria-hidden yalnızca .text-layer-word'e veriliyor (syncEzberTextLayer); başka bir yerde Ezber kapağı için aria-hidden yok", /querySelectorAll\("\.text-layer-word"\)/.test(SRCS.syncEzberTextLayer || "") && !/aria-hidden/.test((SRCS.ezberRenderCoverState || "") + draw));
check("app.js: gizleme inert/pointer-events/display ile yapılmıyor (dokunma ve seçim çalışmaya devam eder)", !/inert|pointer-events|\.hidden|display|visibility/.test(SRCS.syncEzberTextLayer || ""));

if (!NAMES.every((n) => SRCS[n])) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}

// -- Gerçek veri: sayfa modelleri ---------------------------------------------------------------------------
const mushaf = JSON.parse(readText("data", "mushaf.json"));
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const isMarker = (w) => w.t.startsWith("۝");
const markerNo = (t) => Number([...t.slice(1)].map((c) => AR_DIGITS.indexOf(c)).join(""));

// Gerçek addTextSelectionLayer + sahte (ama her kelime/birim için BENZERSİZ) konumlar: kapak dikdörtgeninin merkezinden kelime
// geri bulunabilsin diye. `pristine`: oturumdan önceki işaretleme.
function buildPage(pageNo, surah) {
  const lines = mushaf.pages[pageNo - 1];
  const aLines = lines.filter((l) => l.t === "a");
  const words = aLines.flatMap((l) => l.w);
  // Ayet numarası: ayet sonu işareti (۝N) ayeti kapatıyor; işarete kadarki kelimeler o ayete, son işaretten sonrakiler sonraki ayete ait.
  const ayahOf = new Map();
  let pending = [];
  let lastNo = 0;
  for (const w of words) {
    pending.push(w);
    if (isMarker(w)) {
      lastNo = markerNo(w.t);
      pending.forEach((p) => ayahOf.set(p.i, lastNo));
      pending = [];
    }
  }
  pending.forEach((p) => ayahOf.set(p.i, lastNo + 1));

  const svg = doc.createElementNS(SVG_NS, "svg");
  const pageG = doc.createElementNS(SVG_NS, "g");
  svg.appendChild(pageG);
  const lr = new LineRenderer(null, null, 0, "");
  const wordSegments = [];
  const unitSegments = [];
  const centerToWord = new Map();
  let x = 1000;
  aLines.forEach((line, li) => {
    const baselineY = 2000 + li * 1800;
    lr.addTextSelectionLayer(pageG, line.w.map((w) => w.t).join(" "), 16000, 16000, baselineY, line.w);
    for (const w of line.w) {
      wordSegments.push({ wordId: w.i, xMin: x, xMax: x + 10, baselineY });
      centerToWord.set(x + 5, w.i);
      x += 100;
      if (isMarker(w)) continue; // Yaz: ayet sonu işareti harf birimi değil (render.js unitSegmentsInput)
      splitIntoUnits(w.t, 0).forEach((u, unitIndex) => {
        unitSegments.push({ wordId: w.i, unitIndex, xMin: x, xMax: x + 10, baselineY });
        centerToWord.set(x + 5, w.i);
        x += 100;
      });
    }
  });
  const coverLayer = doc.createElementNS(SVG_NS, "g");
  coverLayer.setAttribute("class", "ezber-cover-layer"); // renderPage'in hep orada duran boş yer tutucusu
  pageG.appendChild(coverLayer);
  doc.body.appendChild(svg);
  return { pageNo, surah, lines, aLines, words, ayahOf, svg, wordSegments, unitSegments, centerToWord, pristine: svg.outerHTML };
}
const P1 = buildPage(1, 1);
const P3 = buildPage(3, 2);
check("veri: sayfa 1 (Fâtiha) 7 ayet satırı, sayfa 3 (Bakara) 15 ayet satırı; her satırın metin katmanı kuruldu", P1.aLines.length === 7 && P3.aLines.length === 15 && P1.svg.querySelectorAll(".text-layer-line").length === 7 && P3.svg.querySelectorAll(".text-layer-line").length === 15);
check("veri: sayfa 1 ayetleri 1..7 (kelime kimliklerinden türetildi)", [...new Set(P1.ayahOf.values())].sort((a, b) => a - b).join() === "1,2,3,4,5,6,7");

function makeEnv(...pages) {
  const P = pages[0];
  const state = { ezberStudy: null, currentPageSvg: P.svg, currentPageWordSegments: P.wordSegments, currentPageUnitSegments: P.unitSegments };
  const wordIdToAyah = (id) => {
    for (const Q of pages) if (Q.ayahOf.has(id)) return { surah: Q.surah, ayah: Q.ayahOf.get(id) };
    return null;
  };
  const api = new Function("state", "document", "wordIdToAyah", `${NAMES.map((n) => SRCS[n]).join("\n")}\nreturn { ${NAMES.join(", ")} };`)(state, doc, wordIdToAyah);
  // gerçek showPage'in yaptığı: geçerli sayfa (svg + segmentleri) değişir
  const goTo = (Q) => {
    state.currentPageSvg = Q.svg;
    state.currentPageWordSegments = Q.wordSegments;
    state.currentPageUnitSegments = Q.unitSegments;
  };
  return { state, api, P, goTo };
}

const wordsOfAyah = (P, a) => P.words.filter((w) => P.ayahOf.get(w.i) === a);
function unitsFor(mode, P, ayah) {
  return wordsOfAyah(P, ayah)
    .filter((w) => !isMarker(w))
    .flatMap((w) => (mode === "oku" ? [{ wordId: w.i }] : splitIntoUnits(w.t, 0).map((u, unitIndex) => ({ wordId: w.i, unitIndex }))));
}

// Bağımsız kestirim: kapaklı (= ağaçtan çıkması gereken) kelimeler. Şu anki ayette henüz açılmamış birimi olan kelimeler + aralıktaki,
// sırası gelmemiş ayetlerin kelimeleri (Oku'da işaret kelimeleri de kapalı, Yaz'da yalnızca harf birimi olanlar -- kapaklar öyle çiziliyor).
function expectedHidden(mode, es, P) {
  const hidden = new Set(es.units.slice(es.revealedCount).map((u) => u.wordId));
  for (const w of P.words) {
    const a = P.ayahOf.get(w.i);
    if (a > es.currentAyah && a <= es.to && (mode === "oku" || !isMarker(w))) hidden.add(w.i);
  }
  return hidden;
}
const hiddenIdsInDom = (svg) => new Set([...svg.querySelectorAll('.text-layer-word[aria-hidden="true"]')].map((s) => Number(s.getAttribute("data-word-id"))));
const coveredIdsInDom = (P) =>
  new Set(
    [...P.svg.querySelectorAll(".ezber-cover")].map((r) => {
      const cx = Number(r.getAttribute("x")) + Number(r.getAttribute("width")) / 2;
      return P.centerToWord.get(cx);
    })
  );
const sameSet = (a, b) => a.size === b.size && [...a].every((v) => b.has(v));
const showSet = (s) => `{${[...s].sort((p, q) => p - q).join(",")}}`;
// Ağaçta (aria-hidden olmayan span'lardan) kalan satır metinleri ve bunların kestirimi
const exposedLines = (P) => [...P.svg.querySelectorAll(".text-layer-line")].map((l) => [...l.children].filter((s) => s.getAttribute("aria-hidden") !== "true").map((s) => s.textContent).join(""));
const expectedLines = (P, hidden) => P.aLines.map((line) => line.w.map((w, k) => (hidden.has(w.i) ? "" : k < line.w.length - 1 ? `${w.t} ` : w.t)).join(""));
const stripSession = (svg) => {
  const c = svg.cloneNode(true);
  c.querySelector(".ezber-cover-layer").replaceChildren();
  c.querySelectorAll("[aria-hidden]").forEach((e) => e.removeAttribute("aria-hidden"));
  return c.outerHTML;
};

// Bir oturumu adım adım sürüyor; her adımda üç bağımsız değişmezi ve "başka bir şeye dokunulmadı"yı denetliyor. `pages`: oturumun
// dokunduğu sayfalar (ayet geçişinde ayetin ilk sayfasına gidiliyor, gerçek ayahPage/showPage gibi); geçerli olmayan her sayfanın SVG'si
// HER adımda oturumdan önceki hâliyle bayt bayt aynı olmalı (eski sayfada kapak/işaret kalmamalı).
function runSession(label, mode, pages, from, to) {
  const env = makeEnv(...pages);
  const problems = [];
  const flips = new Map(); // "ayet:kelime" -> o kelimenin ağaca GİRDİĞİ (revealedCount) adımı
  let steps = 0;
  const pageOfAyah = (a) => pages.find((Q) => Q.words.some((w) => Q.ayahOf.get(w.i) === a));
  for (let ayah = from; ayah <= to; ayah++) {
    const P = pageOfAyah(ayah);
    env.goTo(P);
    const units = unitsFor(mode, P, ayah);
    let prevHidden = null;
    for (let revealed = 0; revealed <= units.length; revealed++) {
      env.state.ezberStudy = { mode, surah: P.surah, from, to, currentAyah: ayah, units, revealedCount: revealed, expectedPage: P.pageNo };
      env.api.ezberRenderCoverState();
      steps++;
      const got = hiddenIdsInDom(P.svg);
      const want = expectedHidden(mode, env.state.ezberStudy, P);
      const at = `${label}, ${ayah}. ayet, ${revealed}/${units.length}`;
      if (!sameSet(got, want)) problems.push(`${at}: aria-hidden ${showSet(got)} != beklenen ${showSet(want)}`);
      const covered = coveredIdsInDom(P);
      if (!sameSet(got, covered)) problems.push(`${at}: aria-hidden ${showSet(got)} != kapakların üstündeki kelimeler ${showSet(covered)}`);
      const exposed = exposedLines(P);
      const wantLines = expectedLines(P, got);
      if (exposed.join("|") !== wantLines.join("|")) problems.push(`${at}: ağaçta kalan satır metni beklenenden farklı`);
      const nonWord = [...P.svg.querySelectorAll("[aria-hidden]")].filter((e) => !e.classList.contains("text-layer-word"));
      if (nonWord.length) problems.push(`${at}: metin katmanı dışında ${nonWord.length} aria-hidden`);
      if (stripSession(P.svg) !== P.pristine) problems.push(`${at}: kapaklar ve aria-hidden dışında SVG değişti`);
      for (const Q of pages) if (Q !== P && Q.svg.outerHTML !== Q.pristine) problems.push(`${at}: geçerli olmayan sayfa ${Q.pageNo}'te kapak/işaret kaldı`);
      // aynı durumda ikinci çağrı: değişmez (idempotent)
      const before = P.svg.outerHTML;
      env.api.ezberRenderCoverState();
      if (P.svg.outerHTML !== before) problems.push(`${at}: ezberRenderCoverState ikinci çağrıda farklı sonuç`);
      if (prevHidden) for (const id of prevHidden) if (!got.has(id) && !flips.has(`${ayah}:${id}`)) flips.set(`${ayah}:${id}`, revealed);
      prevHidden = got;
    }
  }
  return { env, problems, steps, flips, last: pages.map((Q) => Q) };
}
const endSession = (r, pages) => {
  r.env.state.ezberStudy = null;
  for (const Q of pages) r.env.api.drawEzberCovers(Q.svg, []); // endEzberStudy'nin yaptığı (geçerli sayfaya)
};

// -- (2) Oku, Fâtiha 1:1-3 ------------------------------------------------------------------------------------
{
  const r = runSession("Oku Fâtiha 1-3", "oku", [P1], 1, 3);
  check(`Oku (sayfa 1, 1:1-3, ${r.steps} adım): her adımda aria-hidden kümesi beklenene, kapakların üstündeki kelimelere ve ağaçta kalan metin kestirime eşit; SVG'de başka değişiklik yok; ikinci çağrı aynı${r.problems.length ? " -- " + r.problems[0] : ""}`, r.problems.length === 0 && r.steps === 5 + 5 + 3);
  // Oturum SONU: kapaklar boşalır -> işaretler de kalkar, SVG baştaki hâline bayt bayt döner.
  r.env.api.drawEzberCovers(P1.svg, []);
  check("Oku oturumu bitince (drawEzberCovers(svg, [])): aria-hidden kalmadı ve SVG oturumdan önceki hâliyle bayt bayt aynı", P1.svg.querySelectorAll("[aria-hidden]").length === 0 && P1.svg.querySelectorAll(".ezber-cover").length === 0 && P1.svg.outerHTML === P1.pristine);

  // Somut başlangıç ve ilk açılış (kestirim işlevini paylaşmayan, elle yazılmış değerler; Fâtiha'da kelime kimlikleri: 1. ayet 1-4 (+ işaret
  // 5), 2. ayet 6-9 (+ işaret 10), 3. ayet 11-12 (+ işaret 13)).
  const env = makeEnv(P1);
  env.state.ezberStudy = { mode: "oku", surah: 1, from: 1, to: 3, currentAyah: 1, units: unitsFor("oku", P1, 1), revealedCount: 0, expectedPage: 1 };
  env.api.ezberRenderCoverState();
  const h0 = hiddenIdsInDom(P1.svg);
  check("Oku başlangıcı (1:1-3): 1. ayetin 4 kelimesi + 2. ayet (4 kelime + işaret) + 3. ayet (2 kelime + işaret) = 12 kelime gizli; 1. ayetin işareti, 4-7. ayetler açık", h0.size === 12 && [1, 2, 3, 4].every((i) => h0.has(i)) && !h0.has(5) && P1.svg.querySelectorAll(".ezber-cover").length === 12);
  check("...ağaçta 1. satırın yalnızca ayet sonu işareti (2 karakter) kaldı; 4. ayetin satırları tam", exposedLines(P1)[0].trim().length === 2 && exposedLines(P1)[3] === P1.aLines[3].w.map((w) => w.t).join(" "));
  env.state.ezberStudy.revealedCount = 1;
  env.api.ezberRenderCoverState();
  const h1 = hiddenIdsInDom(P1.svg);
  check("Oku: 1 kelime açılınca yalnızca o kelime ağaca giriyor (hemen), kalan 11 kelime gizli", h1.size === 11 && !h1.has(1) && [2, 3, 4].every((i) => h1.has(i)));
  env.api.drawEzberCovers(P1.svg, []);
}

// -- (2) Yaz, Fâtiha 1:1-2 ------------------------------------------------------------------------------------
{
  const r = runSession("Yaz Fâtiha 1-2", "yaz", [P1], 1, 2);
  const n1 = unitsFor("yaz", P1, 1).length;
  const n2 = unitsFor("yaz", P1, 2).length;
  check(`Yaz (sayfa 1, 1:1-2, ${r.steps} adım): her adımda aria-hidden kümesi beklenene, kapakların üstündeki kelimelere ve ağaçta kalan metin kestirime eşit; SVG'de başka değişiklik yok; ikinci çağrı aynı${r.problems.length ? " -- " + r.problems[0] : ""}`, r.problems.length === 0 && r.steps === n1 + 1 + n2 + 1);
  r.env.api.drawEzberCovers(P1.svg, []);
  check("Yaz oturumu bitince: aria-hidden kalmadı ve SVG oturumdan önceki hâliyle bayt bayt aynı", P1.svg.querySelectorAll("[aria-hidden]").length === 0 && P1.svg.querySelectorAll(".ezber-cover").length === 0 && P1.svg.outerHTML === P1.pristine);

  // "Kelime SON harfi açılınca girer": 1. ayetin her kelimesi için, ağaca girdiği adım = o kelimenin son birimi açıldığı adım.
  const units = unitsFor("yaz", P1, 1);
  const lastUnitIndexOf = new Map();
  units.forEach((u, idx) => lastUnitIndexOf.set(u.wordId, idx));
  const wordIds = [...lastUnitIndexOf.keys()];
  const flipOk = wordIds.every((id) => r.flips.get(`1:${id}`) === lastUnitIndexOf.get(id) + 1);
  check(`Yaz: 1. ayetin ${wordIds.length} kelimesinin her biri, SON harf birimi açıldığı adımda (ondan önce değil, sonra değil) ağaca giriyor${flipOk ? "" : " -- " + JSON.stringify([...r.flips].filter(([k]) => k.startsWith("1:")))}`, wordIds.length === 4 && flipOk);
  const env = makeEnv(P1);
  env.state.ezberStudy = { mode: "yaz", surah: 1, from: 1, to: 2, currentAyah: 1, units: units, revealedCount: 0, expectedPage: 1 };
  env.api.ezberRenderCoverState();
  const startHidden = hiddenIdsInDom(P1.svg);
  check("Yaz başlangıcı (1:1-2): 1. ve 2. ayetin harf birimli 8 kelimesi gizli; iki ayetin işaret kelimeleri (kapaksız) açık", startHidden.size === 8 && !startHidden.has(5) && !startHidden.has(10));
  env.state.ezberStudy.revealedCount = lastUnitIndexOf.get(wordIds[0]); // ilk kelimenin son harfinden BİR önce
  env.api.ezberRenderCoverState();
  check("Yaz: ilk kelimenin son harfinden önce (yarım kelime) o kelime hâlâ gizli", hiddenIdsInDom(P1.svg).has(wordIds[0]));
  env.state.ezberStudy.revealedCount = lastUnitIndexOf.get(wordIds[0]) + 1;
  env.api.ezberRenderCoverState();
  check("Yaz: ilk kelimenin son harfi açılınca o kelime ağaca girdi, ikinci kelime hâlâ gizli", !hiddenIdsInDom(P1.svg).has(wordIds[0]) && hiddenIdsInDom(P1.svg).has(wordIds[1]));
  env.api.drawEzberCovers(P1.svg, []);
}

// -- (2) Sayfa 3 (Bakara): satırlar ayet sınırlarını aşıyor ---------------------------------------------------
{
  const ayahs = [...new Set(P3.ayahOf.values())].sort((a, b) => a - b);
  const from = ayahs[1]; // ilk ayetin başı önceki sayfada; ilk TAM ayet
  const to = from + 1;
  const mixed = (hiddenSet) => P3.aLines.filter((l) => l.w.some((w) => hiddenSet.has(w.i)) && l.w.some((w) => !hiddenSet.has(w.i))).length;
  const rOku = runSession("Oku Bakara", "oku", [P3], from, to);
  check(`Oku (sayfa 3, ${from}:${from}-${to}, ${rOku.steps} adım): her adımda üç değişmez geçerli${rOku.problems.length ? " -- " + rOku.problems[0] : ""}`, rOku.problems.length === 0);
  rOku.env.api.drawEzberCovers(P3.svg, []);
  check("Oku (sayfa 3) bitince SVG bayt bayt eski hâlinde", P3.svg.outerHTML === P3.pristine);
  const rYaz = runSession("Yaz Bakara", "yaz", [P3], from, to);
  check(`Yaz (sayfa 3, ${from}:${from}-${to}, ${rYaz.steps} adım): her adımda üç değişmez geçerli${rYaz.problems.length ? " -- " + rYaz.problems[0] : ""}`, rYaz.problems.length === 0);
  rYaz.env.api.drawEzberCovers(P3.svg, []);
  check("Yaz (sayfa 3) bitince SVG bayt bayt eski hâlinde", P3.svg.outerHTML === P3.pristine);

  // Kelime başına ayrıntı: aynı satırda hem gizli hem açık kelime olabiliyor (satır tamamen gizlenip açılmıyor).
  const env = makeEnv(P3);
  env.state.ezberStudy = { mode: "oku", surah: 2, from, to, currentAyah: from, units: unitsFor("oku", P3, from), revealedCount: 0, expectedPage: 3 };
  env.api.ezberRenderCoverState();
  const h = hiddenIdsInDom(P3.svg);
  check(`sayfa 3: gizli ve açık kelimeyi AYNI satırda taşıyan satır var (${mixed(h)}; kelime başına ayrıntı satır başınaymış gibi davranmıyor)`, mixed(h) >= 1);
  check("sayfa 3: aralık dışındaki (ilk ayetin kuyruğu, to'dan sonraki) kelimeler açık, aralıktakiler gizli", P3.words.every((w) => {
    const a = P3.ayahOf.get(w.i);
    const inRange = a >= from && a <= to && (!isMarker(w) || a > from);
    return h.has(w.i) === inRange;
  }));
  env.api.drawEzberCovers(P3.svg, []);
}

// -- (2) Çok sayfalı oturum: sayfa 3 -> sayfa 4 (aynı sure) ------------------------------------------------------
// Ayet geçişi ayetin ilk sayfasına gidiyor (gerçek ayahPage/showPage); geçerli olmayan sayfada kapak ya da işaret KALMAMALI: önbellekteki
// SVG, oturum bittikten sonra başka bir zaman gösterilecek.
{
  const P4 = buildPage(4, 2);
  const ay3 = [...new Set(P3.ayahOf.values())].sort((a, b) => a - b);
  const ay4 = [...new Set(P4.ayahOf.values())].sort((a, b) => a - b);
  const from = ay3[ay3.length - 2]; // sayfa 3'ün sondan bir önceki ayeti
  const to = ay4.find((a) => a > ay3[ay3.length - 1]); // sayfa 4'te, sayfa 3'ün son ayetinden sonraki ilk ayet
  const pagesSpanned = P3.words.some((w) => P3.ayahOf.get(w.i) === from) && P4.words.some((w) => P4.ayahOf.get(w.i) === to) && to > ay3[ay3.length - 1];
  check(`veri: ${from}. ayet sayfa 3'te, ${to}. ayet sayfa 4'te (oturum iki sayfaya yayılıyor)`, pagesSpanned && to > from);
  for (const mode of ["oku", "yaz"]) {
    const name = mode === "oku" ? "Oku" : "Yaz";
    const r = runSession(`${name} sayfa 3->4`, mode, [P3, P4], from, to);
    check(`${name}, çok sayfalı oturum (sayfa 3 -> 4, ${from}-${to}, ${r.steps} adım): her adımda üç değişmez geçerli; geçerli olmayan sayfada kapak/işaret kalmıyor${r.problems.length ? " -- " + r.problems[0] : ""}`, r.problems.length === 0 && r.steps > 20);
    endSession(r, [P3, P4]);
    check(`${name}, çok sayfalı oturum bitince iki sayfa da bayt bayt eski hâlinde`, P3.svg.outerHTML === P3.pristine && P4.svg.outerHTML === P4.pristine);
  }
}

// -- (4) Ömür döngüsü: sayfa değişimi, oturum ortasında bırakma, kapak çizilemeyen SVG ------------------------
{
  // Oturum ortasında bırakılıyor (Bitir / sayfa çevirme): kapaklar da işaretler de gider
  const env = makeEnv(P1);
  env.state.ezberStudy = { mode: "yaz", surah: 1, from: 1, to: 3, currentAyah: 2, units: unitsFor("yaz", P1, 2), revealedCount: 3, expectedPage: 1 };
  env.api.ezberRenderCoverState();
  check("oturum ortasında (Yaz 1:1-3, 2. ayet, 3 harf): kapak ve işaret var", P1.svg.querySelectorAll(".ezber-cover").length > 0 && hiddenIdsInDom(P1.svg).size > 0);
  env.state.ezberStudy = null;
  env.api.drawEzberCovers(P1.svg, []); // endEzberStudy'nin yaptığı
  check("oturum ortasında bırakılınca (endEzberStudy -> drawEzberCovers(svg, [])) SVG bayt bayt eski hâlinde", P1.svg.outerHTML === P1.pristine);

  // Sayfa değişimi: oturum 3. sayfada (A), sonra sayfa 1'e geçiyor (B). A'nın son ayeti bitince kapak kümesi boş -> A temiz kalır.
  const envA = makeEnv(P3);
  const ayahs = [...new Set(P3.ayahOf.values())].sort((a, b) => a - b);
  const last = ayahs[ayahs.length - 2]; // sayfadaki son TAM ayet
  envA.state.ezberStudy = { mode: "oku", surah: 2, from: last, to: last, currentAyah: last, units: unitsFor("oku", P3, last), revealedCount: 0, expectedPage: 3 };
  envA.api.ezberRenderCoverState();
  envA.state.ezberStudy.revealedCount = envA.state.ezberStudy.units.length; // son kelime açıldı
  envA.api.ezberRenderCoverState();
  check("aralığın son ayeti tamamen açılınca (sayfadan çıkmadan önce) sayfada kapak da işaret de kalmıyor: SVG bayt bayt eski hâlinde", P3.svg.outerHTML === P3.pristine);

  // Kapak katmanı olmayan SVG (renderPage her zaman koyar; yine de): hiçbir şey olmuyor, hata da yok
  const bare = doc.createElementNS(SVG_NS, "svg");
  const bareDiv = doc.createElement("div");
  bareDiv.innerHTML = '<span class="text-layer-word" data-word-id="1">x</span>';
  bare.appendChild(bareDiv);
  let threw = "";
  try {
    envA.api.drawEzberCovers(bare, [{ wordId: 1, xMin: 0, xMax: 1, baselineY: 0 }]);
  } catch (e) {
    threw = String(e && e.message);
  }
  check(`kapak katmanı olmayan SVG'de drawEzberCovers sessizce dönüyor (hata: ${threw || "yok"}), metne dokunmuyor`, !threw && !bare.querySelector("[aria-hidden]"));

  // Kelime kimliği olmayan span (ör. eski önbellek): hata vermeden açık kalıyor
  const loose = doc.createElementNS(SVG_NS, "svg");
  const layerG = doc.createElementNS(SVG_NS, "g");
  layerG.setAttribute("class", "ezber-cover-layer");
  loose.appendChild(layerG);
  const looseDiv = doc.createElement("div");
  looseDiv.innerHTML = '<span class="text-layer-word">kimliksiz</span><span class="text-layer-word" data-word-id="7">yedi</span>';
  loose.appendChild(looseDiv);
  envA.api.drawEzberCovers(loose, [{ wordId: 7, xMin: 0, xMax: 1, baselineY: 0 }]);
  const sp = loose.querySelectorAll(".text-layer-word");
  check("data-word-id'si olmayan span açık kalıyor, kapaklı kimlikli span gizleniyor", !sp[0].hasAttribute("aria-hidden") && sp[1].getAttribute("aria-hidden") === "true");
  envA.api.drawEzberCovers(loose, []);
  check("...kapaklar boşalınca ikisi de açık", !sp[0].hasAttribute("aria-hidden") && !sp[1].hasAttribute("aria-hidden"));
}

if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All checks passed (Ezber oturumunda kapağın altındaki metin: gerçek render.js metin katmanı x gerçek drawEzberCovers/ezberRenderCoverState x gerçek sayfa verisi; Oku ve Yaz, sayfa 1 ve 3, her adımda aria-hidden kümesi = beklenen = kapakların üstündeki kelimeler; ömür döngüsü bayt bayt).");
