// 604 sayfanın TAMAMINI Node'da (jsdom + gerçek HarfBuzz + gerçek font) render
// eder ve iki şeyi DOĞRULAR (başarısızlıkta çıkış kodu 1):
//   1. Hiçbir sayfa istisna fırlatmaz; 604 sayfanın hepsi işlenir.
//   2. Mushaf düzeninin ölçülebilir değişmezleri taban değerlerden kötüleşmez:
//      hizalı satırların sütunu doldurması, xScale (sıkıştırma) payı, kashida
//      kullanımı ve boşluk genişlemesi, sure başlığı sayfalarının yüksekliği,
//      Ezber->Yaz harf birimi bölütlerinin eksiksizliği.
//   3. Görünmez metin katmanı (render.js addTextSelectionLayer) her sayfada, her
//      satırda gerçek metni taşıyor: ayet satırları kelime başına bir
//      <span class="text-layer-word" data-word-id> (Ezber'in kapak altı metni
//      erişilebilirlik ağacından çıkarması -- app.js syncEzberTextLayer -- bu
//      yapıya dayanıyor), besmele satırı düz metin; textContent hiçbir satırda
//      değişmemiş.
// Raporun kendisi (ölçüm tabloları) de basılır -- tek başına çalıştırınca
// (`npm run test:corpus`) güncel değerleri görmek için.
//
// Süre: ~1 dk (2 çekirdekli makine). jsdom'da canvas yok; render.js'in
// measureTextWidth() yedek (karakter başına tahmin) yoluna düşer. Bu yol yalnızca
// seçilebilir metin katmanının genişliğini etkiler -- aşağıdaki hizalama/yükseklik
// ölçümlerini etkilemez; jsdom'un her çağrıda bastığı "Not implemented" uyarıları
// bu yüzden bastırılıp sayılır (98 bin satırlık çıktı yerine tek satır).

import { JSDOM, VirtualConsole } from "jsdom";
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const at = (...p) => path.join(ROOT, ...p);

// ---- Doğrulama eşikleri ----------------------------------------------------
// Hepsi, bu dosya doğrulamaya çevrilirken (main 228be5d, jsdom 25.0.1, Node 22)
// ölçülen tabandan türetilmiştir: bunlar bir REGRESYON bekçisinin eşikleridir,
// "doğru düzen" tanımı değil. Düzeni BİLEREK değiştirdiyseniz (ör. sure başlığı
// yüksekliği, kashida kuralları) ilgili sabiti yeni ölçüme göre güncelleyin.
const EXPECTED_PAGES = 604;
const EXPECTED_SURAHS = 114;
// "sayfa:satır" -> bilinen en büyük eksik/taşma (birim; sütun genişliği 16200).
// Bilinenler FILL_SLACK kadar kötüleşebilir; listede olmayan her ihlal başarısızlıktır.
// Bir satır düzelirse test başarısız OLMAZ (yalnız not düşer) -- listeden çıkarın.
const KNOWN_UNDERFILLED = { "81:8": 300, "110:5": 200, "279:12": 200, "474:10": 200 };
const KNOWN_OVERFILLED = { "330:12": 350 };
const FILL_SLACK = 100;
const FILL_TOLERANCE = 150; // bundan fazla eksik/taşma "ihlal" sayılır (ilk yazıldığı gibi)
const MAX_SHRINK_LINES = 3100; // taban 2955
const MIN_XSCALE_WORST = 0.75; // taban 0.770
const MIN_XSCALE_AVG = 0.92; // taban 0.9383
// Kashida: genişletilen satırlar önce kashida ile, kalanı boşluk açılarak doluyor. Kashida hiç
// uygulanmazsa satırlar boşluk açılarak YİNE dolar -- yukarıdaki doluluk ölçümü bunu göremez;
// bu yüzden kashidalı satır sayısı ve boşluk genişlemesi (simpleSpacing / boşluk genişliği) ayrıca denetlenir.
const MIN_KASHIDA_LINES = 3000; // taban 3322 (genişletilen 5835 satırdan)
const MAX_SPACE_RATIO_MEAN = 2.2; // taban 1.9519 (kashida kapalıyken 3.04)
const MAX_SPACE_RATIO_MAX = 6; // taban 4.655 (kashida kapalıyken 19.2)
const EXPECTED_HEADER_PAGES = 98;
const MIN_HEADER_PAGE_HEIGHT = 16000; // taban 16735
const MAX_HEADER_PAGE_HEIGHT = 32500; // taban 31805
const MIN_UNITS_CHECKED = 325000; // taban 325585 (tüm Kur'an kelimeleri)
const MIN_TEXT_LAYER_WORDS = 83000; // 83668 = 77432 gerçek kelime + 6236 ayet sonu işareti (8820 ayet satırı)
// Bilinen, çok nadir (325.585'te 1) ve yalnız görsel istisna -- açıklaması dosya
// sonunda.
const KNOWN_UNIT_MISMATCHES = [{ page: 451, wordId: 61960, expected: 3, got: 2 }];

let failures = 0;
function check(name, cond, detail) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
    if (detail) console.error(`      ${detail}`);
  }
}

// jsdom'un uyarılarını konsola basmak yerine say (bkz. dosya başı).
const jsdomNoise = new Map();
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", (e) => {
  const kind = String((e && e.message) || e).split("\n")[0];
  jsdomNoise.set(kind, (jsdomNoise.get(kind) || 0) + 1);
});
const dom = new JSDOM("<!doctype html><html><body></body></html>", { virtualConsole });
global.document = dom.window.document;
global.window = dom.window;

const createHarfBuzz = require("../vendor/hb.js");
const hbjs = require("../vendor/hbjs.js");

const { LineRenderer, renderPage, COLUMN_WIDTH, splitIntoUnits } = await import("../js/render.js");
const { analyzeLineForJust, justifyLine } = await import("../js/justify.js");

async function main() {
  const instance = await createHarfBuzz();
  const hb = hbjs(instance);

  // js/app.js'in loadHarfBuzzAndFont()'uyla BİREBİR aynı kaynak: gerçekten
  // deploy edilen fonts/DigitalKhattV2.woff2, aynı wawoff2 çözücüsüyle.
  // (fonts/DigitalKhattV2.otf artık repo'da yok -- uygulama onu kullanmıyor.)
  const woff2 = require("wawoff2");
  const compressed = fs.readFileSync(at("fonts", "DigitalKhattV2.woff2"));
  const fontData = await woff2.decompress(compressed);
  const blob = hb.createBlob(fontData);
  const face = hb.createFace(blob, 0);
  const font = hb.createFont(face);

  const spBuf = hb.createBuffer();
  spBuf.addText(" ");
  spBuf.setDirection("rtl");
  spBuf.setScript("Arab");
  spBuf.setLanguage("ar");
  hb.shape(font, spBuf, "");
  const spaceWidth = spBuf.json()[0].ax;
  spBuf.destroy();

  const mushaf = JSON.parse(fs.readFileSync(at("data", "mushaf.json"), "utf-8"));
  const surahs = JSON.parse(fs.readFileSync(at("data", "surahs.json"), "utf-8"));

  const lineRenderer = new LineRenderer(hb, font, spaceWidth, mushaf.basmallahText);

  let errors = 0;
  let pagesProcessed = 0;
  let justifiedLines = 0;
  let stretchedLines = 0; // sütundan KISA olup kashida/boşlukla genişletilen satırlar
  let kashidaLines = 0; // bunlardan kashida (yazı tipi özelliği) uygulananlar
  let spaceRatioSum = 0;
  let spaceRatioMax = 0;
  let underfilled = []; // justified lines that ended up notably short of the column
  let overfilled = [];
  let xScales = [];
  let headerPageHeights = [];
  let surahHeaderLines = 0;
  const headerSurahs = new Set();
  let unitMismatches = [];
  let totalUnitsChecked = 0;
  let textLayerWords = 0; // kelime span'ı beklenen, doğrulanan kelime sayısı
  let textLayerLines = 0; // doğrulanan metin katmanı satırı (ayet + besmele)
  const textLayerIssues = [];
  const t0 = Date.now();

  for (let pageIdx = 0; pageIdx < mushaf.pagesCount; pageIdx++) {
    try {
      const lines = mushaf.pages[pageIdx];
      // render + also inspect justified-line widths directly for QA
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        if (line.t === "a" && line.c === false) {
          justifiedLines++;
          const lineText = line.w.map((w) => w.t).join(" ");
          const isFatihaAyah1 = line.w[0] && line.w[0].i === 1;
          const info = analyzeLineForJust(lineText, isFatihaAyah1);
          const justResult = justifyLine(hb, font, 1, info, 1000 / COLUMN_WIDTH, spaceWidth);
          // recompute final width the same way renderLineGroup does, quickly:
          const rendered = lineRenderer.renderLineGroup(info, justResult, 0, 0, justResult.xScale || 1);
          const width = rendered.width;
          const shortfall = COLUMN_WIDTH - width;
          if (shortfall > FILL_TOLERANCE) {
            underfilled.push({ page: pageIdx + 1, line: lineIdx + 1, shortfall: Math.round(shortfall), text: lineText.slice(0, 30) });
          } else if (shortfall < -FILL_TOLERANCE) {
            overfilled.push({ page: pageIdx + 1, line: lineIdx + 1, over: Math.round(-shortfall) });
          }
          if (justResult.xScale && justResult.xScale !== 1) {
            xScales.push({ page: pageIdx + 1, line: lineIdx + 1, xScale: justResult.xScale });
          } else {
            stretchedLines++;
            const spaceRatio = justResult.simpleSpacing / spaceWidth;
            spaceRatioSum += spaceRatio;
            spaceRatioMax = Math.max(spaceRatioMax, spaceRatio);
            if (justResult.fontFeatures && justResult.fontFeatures.size > 0) kashidaLines++;
          }
        }
      }
      // exercise the full page render, including every surah header on it
      // (fetch header data up front, same as app.js's buildPage does)
      const surahsOnPage = [...new Set(lines.filter((l) => l.t === "s").map((l) => l.surah))];
      const headerDataBySurah = new Map();
      for (const surah of surahsOnPage) {
        headerDataBySurah.set(surah, JSON.parse(fs.readFileSync(at("data", "surah-headers", `${surah}.json`), "utf-8")));
      }
      const { svg, totalHeight, unitSegments } = renderPage(lineRenderer, lines, headerDataBySurah);
      if (surahsOnPage.length > 0) {
        headerPageHeights.push({ page: pageIdx + 1, headers: surahsOnPage.length, totalHeight: Math.round(totalHeight) });
      }
      for (const l of lines) {
        if (l.t === "s") {
          surahHeaderLines++;
          headerSurahs.add(l.surah);
        }
      }

      // Metin katmanı: her ayet/besmele satırı için bir .text-layer-line; ayet satırında kelime başına bir span (data-word-id = kelime
      // kimliği; kelimeler arası boşluk soldaki kelimenin sonunda, aralarında boşluk düğümü yok), besmelede düz metin; textContent
      // her satırda satır metniyle aynı.
      {
        const textLines = lines.filter((l) => l.t === "a" || l.t === "b");
        const layerDivs = svg.querySelectorAll(".text-layer-line");
        const flag = (k, issue) => textLayerIssues.push({ page: pageIdx + 1, line: k + 1, issue });
        if (layerDivs.length !== textLines.length) {
          flag(-1, `metin katmanı satır sayısı ${layerDivs.length} != ${textLines.length}`);
        } else {
          textLines.forEach((line, k) => {
            const div = layerDivs[k];
            textLayerLines++;
            const expectedText = line.t === "b" ? mushaf.basmallahText : line.w.map((w) => w.t).join(" ");
            if (div.textContent !== expectedText) flag(k, "textContent satır metninden farklı");
            if (line.t === "b") {
              if (div.children.length !== 0) flag(k, "besmele satırında span var");
              return;
            }
            if (div.childNodes.length !== line.w.length || div.children.length !== line.w.length) {
              flag(k, `span sayısı ${div.children.length} / düğüm ${div.childNodes.length} != kelime ${line.w.length}`);
              return;
            }
            line.w.forEach((w, j) => {
              const sp = div.children[j];
              const wantText = j < line.w.length - 1 ? `${w.t} ` : w.t;
              if (sp.tagName !== "SPAN" || !sp.classList.contains("text-layer-word") || sp.getAttribute("data-word-id") !== String(w.i) || sp.textContent !== wantText) {
                flag(k, `kelime ${j} (id ${w.i}) span'ı beklenenden farklı`);
              } else {
                textLayerWords++;
              }
            });
          });
        }
      }

      // Ezber -> Yaz's letter-unit segments (see render.js's splitIntoUnits):
      // cross-check the render pass's own unit COUNT per real word against
      // an independent count computed straight from that word's raw text --
      // same double-check pattern as the recitation data test's audio_url
      // verification, just for this session's new data instead of QUL's.
      const unitsByWord = new Map();
      for (const u of unitSegments) {
        if (!unitsByWord.has(u.wordId)) unitsByWord.set(u.wordId, new Set());
        unitsByWord.get(u.wordId).add(u.unitIndex);
      }
      for (const line of lines) {
        if (line.t !== "a") continue;
        for (const w of line.w) {
          if (w.t.startsWith("۝")) {
            if (unitsByWord.has(w.i)) {
              unitMismatches.push({ page: pageIdx + 1, wordId: w.i, issue: "marker word got units" });
            }
            continue;
          }
          const expected = splitIntoUnits(w.t, 0).length;
          const got = unitsByWord.get(w.i);
          if (!got || got.size !== expected) {
            unitMismatches.push({ page: pageIdx + 1, wordId: w.i, text: w.t, expected, got: got ? got.size : 0 });
          } else {
            // every index 0..expected-1 present exactly once, no gaps/dupes
            for (let ui = 0; ui < expected; ui++) {
              if (!got.has(ui)) unitMismatches.push({ page: pageIdx + 1, wordId: w.i, text: w.t, issue: `missing unitIndex ${ui}` });
            }
          }
          totalUnitsChecked += expected;
        }
      }
      pagesProcessed++;
    } catch (e) {
      errors++;
      console.error(`ERROR on page ${pageIdx + 1}:`, e.message);
      if (errors > 20) {
        console.error("Too many errors, stopping early.");
        break;
      }
    }
  }

  const dt = Date.now() - t0;
  console.log(`\nDone. ${mushaf.pagesCount} pages in ${dt}ms (${(dt / mushaf.pagesCount).toFixed(1)}ms/page avg)`);
  console.log(`Errors: ${errors}`);
  console.log(`Justified lines with shortfall > ${FILL_TOLERANCE} units (of ${COLUMN_WIDTH}): ${underfilled.length}`);
  underfilled.slice(0, 25).forEach((u) => console.log("  ", JSON.stringify(u)));
  console.log(`Justified lines OVERfilled by > ${FILL_TOLERANCE} units: ${overfilled.length}`);
  overfilled.slice(0, 25).forEach((u) => console.log("  ", JSON.stringify(u)));
  console.log(`\nLines requiring xScale shrink: ${xScales.length} / ${justifiedLines} justified lines`);
  xScales.sort((a, b) => a.xScale - b.xScale);
  console.log("worst 15 (smallest xScale):");
  xScales.slice(0, 15).forEach((u) => console.log("  ", JSON.stringify({ ...u, xScale: u.xScale.toFixed(3) })));
  const avgXScale = xScales.reduce((s, u) => s + u.xScale, 0) / (xScales.length || 1);
  console.log("average xScale among shrink-lines:", avgXScale.toFixed(4));
  const spaceRatioMean = spaceRatioSum / (stretchedLines || 1);
  console.log(`Stretched lines: ${stretchedLines}; with kashida: ${kashidaLines}; space stretch ratio (simpleSpacing/space): mean ${spaceRatioMean.toFixed(4)}, max ${spaceRatioMax.toFixed(3)}`);

  console.log(`\nPages with at least one header: ${headerPageHeights.length}`);
  const noHeaderRef = 1700 + 14 * 1800 + 1100; // 28000
  const heights = headerPageHeights.map((h) => h.totalHeight);
  const minHeight = Math.min(...heights);
  const maxHeight = Math.max(...heights);
  console.log("min/max/avg totalHeight on header pages:", minHeight, maxHeight, Math.round(heights.reduce((a, b) => a + b, 0) / heights.length), " (no-header page is", noHeaderRef, ")");
  const maxEntry = headerPageHeights.find((h) => h.totalHeight === maxHeight);
  console.log("tallest page:", JSON.stringify(maxEntry));

  console.log(`\nMetin katmanı: ${textLayerLines} satır, ${textLayerWords} kelime span'ı doğrulandı; sorun: ${textLayerIssues.length}`);
  textLayerIssues.slice(0, 10).forEach((m) => console.log("  ", JSON.stringify(m)));
  console.log(`\nEzber -> Yaz unit segments: ${totalUnitsChecked} units checked across the whole Qur'an`);
  console.log(`Mismatches (should be 0, or exactly the 1 documented below): ${unitMismatches.length}`);
  unitMismatches.slice(0, 20).forEach((m) => console.log("  ", JSON.stringify(m)));
  const noiseTotal = [...jsdomNoise.values()].reduce((a, b) => a + b, 0);
  console.log(`\njsdom uyarıları bastırıldı: ${noiseTotal}${noiseTotal ? ` (${[...jsdomNoise.keys()].join(" | ")})` : ""}`);

  // ---- Doğrulama ----------------------------------------------------------
  const keyOf = (o) => `${o.page}:${o.line}`;
  const show = (list) => JSON.stringify(list.slice(0, 10)) + (list.length > 10 ? ` ... (+${list.length - 10})` : "");

  check(`veri: mushaf.json ${EXPECTED_PAGES} sayfa`, mushaf.pagesCount === EXPECTED_PAGES && mushaf.pages.length === EXPECTED_PAGES, `pagesCount=${mushaf.pagesCount}, pages.length=${mushaf.pages.length}`);
  check(`${EXPECTED_PAGES} sayfanın hepsi hatasız render edildi`, errors === 0 && pagesProcessed === EXPECTED_PAGES, `hata=${errors}, işlenen=${pagesProcessed}`);
  check("jsdom'dan yalnızca beklenen 'canvas getContext uygulanmadı' uyarıları geldi (başka bir jsdom hatası yok)", [...jsdomNoise.keys()].every((k) => /getContext/.test(k)), [...jsdomNoise.keys()].join(" | "));

  const badUnder = underfilled.filter((u) => !(keyOf(u) in KNOWN_UNDERFILLED) || u.shortfall > KNOWN_UNDERFILLED[keyOf(u)] + FILL_SLACK);
  const badOver = overfilled.filter((o) => !(keyOf(o) in KNOWN_OVERFILLED) || o.over > KNOWN_OVERFILLED[keyOf(o)] + FILL_SLACK);
  check(`hizalı satırlar sütunu dolduruyor: yeni/kötüleşmiş EKSİK satır yok (bilinen ${Object.keys(KNOWN_UNDERFILLED).length}, +${FILL_SLACK} pay)`, badUnder.length === 0, show(badUnder));
  check(`hizalı satırlar sütunu aşmıyor: yeni/kötüleşmiş TAŞAN satır yok (bilinen ${Object.keys(KNOWN_OVERFILLED).length}, +${FILL_SLACK} pay)`, badOver.length === 0, show(badOver));
  for (const [k, v] of [...Object.entries(KNOWN_UNDERFILLED), ...Object.entries(KNOWN_OVERFILLED)]) {
    if (!underfilled.some((u) => keyOf(u) === k) && !overfilled.some((o) => keyOf(o) === k)) {
      console.log(`NOT: bilinen satır ${k} (${v}) artık ihlal etmiyor -- KNOWN_* listesinden çıkarılabilir.`);
    }
  }

  check(`xScale sıkıştırması taban düzeyinde: en fazla ${MAX_SHRINK_LINES} satır (ölçülen ${xScales.length})`, xScales.length <= MAX_SHRINK_LINES);
  check(`en kötü xScale >= ${MIN_XSCALE_WORST} (ölçülen ${xScales.length ? xScales[0].xScale.toFixed(3) : "-"})`, xScales.length > 0 && xScales[0].xScale >= MIN_XSCALE_WORST, xScales.length ? JSON.stringify(xScales[0]) : "xScale kaydı yok");
  check(`ortalama xScale >= ${MIN_XSCALE_AVG} (ölçülen ${avgXScale.toFixed(4)})`, xScales.length > 0 && avgXScale >= MIN_XSCALE_AVG);
  check(`kashida uygulanıyor: en az ${MIN_KASHIDA_LINES} satır (ölçülen ${kashidaLines} / ${stretchedLines} genişletilen satır)`, kashidaLines >= MIN_KASHIDA_LINES);
  check(`boşluk genişlemesi taban düzeyinde: ortalama <= ${MAX_SPACE_RATIO_MEAN}, en çok <= ${MAX_SPACE_RATIO_MAX} (ölçülen ${spaceRatioMean.toFixed(4)}, ${spaceRatioMax.toFixed(3)})`, stretchedLines > 0 && spaceRatioMean <= MAX_SPACE_RATIO_MEAN && spaceRatioMax <= MAX_SPACE_RATIO_MAX);

  check(`${EXPECTED_SURAHS} sure başlığı satırı ve ${EXPECTED_SURAHS} farklı sure (ölçülen ${surahHeaderLines} satır, ${headerSurahs.size} sure)`, surahHeaderLines === EXPECTED_SURAHS && headerSurahs.size === EXPECTED_SURAHS);
  check(`başlık içeren sayfa sayısı ${EXPECTED_HEADER_PAGES} (ölçülen ${headerPageHeights.length})`, headerPageHeights.length === EXPECTED_HEADER_PAGES);
  check(`başlıklı sayfa yükseklikleri [${MIN_HEADER_PAGE_HEIGHT}, ${MAX_HEADER_PAGE_HEIGHT}] aralığında (ölçülen ${minHeight}..${maxHeight})`, minHeight >= MIN_HEADER_PAGE_HEIGHT && maxHeight <= MAX_HEADER_PAGE_HEIGHT, maxEntry ? `en yüksek sayfa: ${JSON.stringify(maxEntry)}` : "");

  check(`metin katmanı: ${EXPECTED_PAGES} sayfanın her satırı gerçek metni taşıyor; ayet satırları kelime başına span (id'li), besmele düz metin (sorun: ${textLayerIssues.length})`, textLayerIssues.length === 0, show(textLayerIssues));
  check(`metin katmanı: tüm Kur'an tarandı (en az ${MIN_TEXT_LAYER_WORDS} kelime span'ı; ölçülen ${textLayerWords})`, textLayerWords >= MIN_TEXT_LAYER_WORDS);
  check(`Ezber->Yaz: tüm Kur'an tarandı (en az ${MIN_UNITS_CHECKED} birim; ölçülen ${totalUnitsChecked})`, totalUnitsChecked >= MIN_UNITS_CHECKED);
  const mismatchKey = (m) => `${m.page}:${m.wordId}:${m.issue || ""}:${m.expected}:${m.got}`;
  const knownMismatchKeys = new Set(KNOWN_UNIT_MISMATCHES.map(mismatchKey));
  const newMismatches = unitMismatches.filter((m) => !knownMismatchKeys.has(mismatchKey(m)));
  check(`Ezber->Yaz: belgelenmiş ${KNOWN_UNIT_MISMATCHES.length} istisna dışında her kelimenin birim sayısı metinden hesaplananla aynı`, newMismatches.length === 0, show(newMismatches));
  for (const known of KNOWN_UNIT_MISMATCHES) {
    if (!unitMismatches.some((m) => mismatchKey(m) === mismatchKey(known))) {
      console.log(`NOT: bilinen birim istisnası (sayfa ${known.page}, kelime ${known.wordId}) artık oluşmuyor -- KNOWN_UNIT_MISMATCHES'ten çıkarılabilir.`);
    }
  }

  // Known, extremely rare (1 in 325,585) cosmetic-only edge case: page
  // 451, word 61960 ("إِنَّا", the LAST word on a kashida-justified line)
  // renders one fewer non-empty unit than its text alone predicts -- some
  // rare interaction between kashida stretching and line-final glyph
  // clustering, not a problem with this word's own letters (it's the
  // most common word in the Qur'an and every OTHER occurrence checks out
  // fine, so it's specific to this line's justification, not the text).
  // Functionally harmless either way: Yaz's keyboard-matching target
  // comes from the independent text-based split (ezberBuildUnits in
  // app.js), not from this segment data, so the affected letter is still
  // typeable -- only its cover rectangle may fail to render, i.e. it can
  // show slightly early. Investigated but not chased further given the
  // rarity and purely-cosmetic impact; revisit if a future mushaf.json
  // update ever makes this count grow.

  if (failures) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log(`\nAll checks passed (${EXPECTED_PAGES} sayfa render edildi; hizalama, xScale, kashida, sure başlığı yükseklikleri, ${totalUnitsChecked} Ezber->Yaz birimi ve ${textLayerWords} metin katmanı kelime span'ı taban değerlere karşı).`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
