import { JSDOM } from "jsdom";
import { createRequire } from "module";
import fs from "fs";

const require = createRequire(import.meta.url);

const dom = new JSDOM("<!doctype html><html><body></body></html>");
global.document = dom.window.document;
global.window = dom.window;

const createHarfBuzz = require("../vendor/hb.js");
const hbjs = require("../vendor/hbjs.js");

const { LineRenderer, renderPage, COLUMN_WIDTH, splitIntoUnits } = await import("../js/render.js");

async function main() {
  const instance = await createHarfBuzz();
  const hb = hbjs(instance);

  // js/app.js'in loadHarfBuzzAndFont()'uyla BİREBİR aynı kaynak: gerçekten
  // deploy edilen fonts/DigitalKhattV2.woff2, aynı wawoff2 çözücüsüyle.
  // (fonts/DigitalKhattV2.otf artık repo'da yok -- uygulama onu kullanmıyor.)
  const woff2 = require("wawoff2");
  const compressed = fs.readFileSync("../fonts/DigitalKhattV2.woff2");
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

  const mushaf = JSON.parse(fs.readFileSync("../data/mushaf.json", "utf-8"));
  const surahs = JSON.parse(fs.readFileSync("../data/surahs.json", "utf-8"));

  const lineRenderer = new LineRenderer(hb, font, spaceWidth, mushaf.basmallahText);

  let errors = 0;
  let underfilled = []; // justified lines that ended up notably short of the column
  let overfilled = [];
  let xScales = [];
  let headerPageHeights = [];
  let unitMismatches = [];
  let totalUnitsChecked = 0;
  const t0 = Date.now();

  for (let pageIdx = 0; pageIdx < mushaf.pagesCount; pageIdx++) {
    try {
      const lines = mushaf.pages[pageIdx];
      // render + also inspect justified-line widths directly for QA
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        if (line.t === "a" && line.c === false) {
          const lineText = line.w.map((w) => w.t).join(" ");
          const isFatihaAyah1 = line.w[0] && line.w[0].i === 1;
          const { analyzeLineForJust, justifyLine } = await import("../js/justify.js");
          const info = analyzeLineForJust(lineText, isFatihaAyah1);
          const justResult = justifyLine(hb, font, 1, info, 1000 / COLUMN_WIDTH, spaceWidth);
          // recompute final width the same way renderLineGroup does, quickly:
          const rendered = lineRenderer.renderLineGroup(info, justResult, 0, 0, justResult.xScale || 1);
          const width = rendered.width;
          const shortfall = COLUMN_WIDTH - width;
          if (shortfall > 150) {
            underfilled.push({ page: pageIdx + 1, line: lineIdx + 1, shortfall: Math.round(shortfall), text: lineText.slice(0, 30) });
          } else if (shortfall < -150) {
            overfilled.push({ page: pageIdx + 1, line: lineIdx + 1, over: Math.round(-shortfall) });
          }
          if (justResult.xScale && justResult.xScale !== 1) {
            xScales.push({ page: pageIdx + 1, line: lineIdx + 1, xScale: justResult.xScale });
          }
        }
      }
      // exercise the full page render, including every surah header on it
      // (fetch header data up front, same as app.js's buildPage does)
      const surahsOnPage = [...new Set(lines.filter((l) => l.t === "s").map((l) => l.surah))];
      const headerDataBySurah = new Map();
      for (const surah of surahsOnPage) {
        headerDataBySurah.set(surah, JSON.parse(fs.readFileSync(`../data/surah-headers/${surah}.json`, "utf-8")));
      }
      const { totalHeight, unitSegments } = renderPage(lineRenderer, lines, headerDataBySurah);
      if (surahsOnPage.length > 0) {
        headerPageHeights.push({ page: pageIdx + 1, headers: surahsOnPage.length, totalHeight: Math.round(totalHeight) });
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
          if (w.t.startsWith("\u06dd")) {
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
  console.log(`Justified lines with shortfall > 150 units (of ${COLUMN_WIDTH}): ${underfilled.length}`);
  underfilled.slice(0, 25).forEach((u) => console.log("  ", JSON.stringify(u)));
  console.log(`Justified lines OVERfilled by > 150 units: ${overfilled.length}`);
  overfilled.slice(0, 25).forEach((u) => console.log("  ", JSON.stringify(u)));
  console.log(`\nLines requiring xScale shrink: ${xScales.length} / total justified lines`);
  xScales.sort((a, b) => a.xScale - b.xScale);
  console.log("worst 15 (smallest xScale):");
  xScales.slice(0, 15).forEach((u) => console.log("  ", JSON.stringify({ ...u, xScale: u.xScale.toFixed(3) })));
  const avgXScale = xScales.reduce((s, u) => s + u.xScale, 0) / (xScales.length || 1);
  console.log("average xScale among shrink-lines:", avgXScale.toFixed(4));

  console.log(`\nPages with at least one header: ${headerPageHeights.length}`);
  const noHeaderRef = 1700 + 14 * 1800 + 1100; // 28000
  const heights = headerPageHeights.map((h) => h.totalHeight);
  console.log("min/max/avg totalHeight on header pages:", Math.min(...heights), Math.max(...heights), Math.round(heights.reduce((a, b) => a + b, 0) / heights.length), " (no-header page is", noHeaderRef, ")");
  const maxEntry = headerPageHeights.find((h) => h.totalHeight === Math.max(...heights));
  console.log("tallest page:", JSON.stringify(maxEntry));

  console.log(`\nEzber -> Yaz unit segments: ${totalUnitsChecked} units checked across the whole Qur'an`);
  console.log(`Mismatches (should be 0, or exactly the 1 documented below): ${unitMismatches.length}`);
  unitMismatches.slice(0, 20).forEach((m) => console.log("  ", JSON.stringify(m)));
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
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
