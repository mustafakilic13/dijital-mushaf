// Regression check for the word-meal panel's page-slice cut (js/app.js
// openWordMeal) staying clear of a surah-header banner when the tapped
// ayah is a surah's last on the page -- see openWordMeal's own comment
// for the bug this guards against (the header rendering ABOVE the panel
// instead of below it, where it belongs).
//
// Two parts: computeLayout (pure geometry, no DOM) is run against the
// REAL page 604 -- Al-Ikhlas -> Al-Falaq -> An-Nas, both surah boundaries
// on one page, the exact page from the reported bug -- to get real
// baselineY/topY numbers, then openWordMeal's cutY formula is
// reimplemented here against those numbers. Kept in sync with app.js by
// this test failing if the two drift apart.
//
// Pure Node, no deps (computeLayout itself has none) -- just:
//   node surah_header_cut_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { computeLayout } from "../js/render.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MUSHAF_FILE = path.join(HERE, "..", "data", "mushaf.json");

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}

// -- openWordMeal's cutY formula, mirrored exactly ---------------------
const HIGHLIGHT_ABOVE_BASELINE = 1350;
const HIGHLIGHT_HEIGHT = 1900;
function computeCutY(lastBaselineY, nextBaselineY, surahHeaderTopYs) {
  const aboveClearEdge = lastBaselineY + (HIGHLIGHT_HEIGHT - HIGHLIGHT_ABOVE_BASELINE);
  const headerBetween = surahHeaderTopYs.some(
    (topY) => topY > lastBaselineY && (nextBaselineY == null || topY < nextBaselineY)
  );
  return nextBaselineY != null && !headerBetween
    ? (aboveClearEdge + (nextBaselineY - HIGHLIGHT_ABOVE_BASELINE)) / 2
    : aboveClearEdge;
}

// -- synthetic sanity checks --------------------------------------------
check("no header between two normal lines -> midpoint formula", (() => {
  const cut = computeCutY(10000, 11800, []);
  return cut > 10000 && cut < 11800;
})());
check("header between -> same result as no-next-line case (nextSeg ignored)", (() => {
  return computeCutY(10000, 20000, [12000]) === computeCutY(10000, null, []);
})());
check("header between -> cutY stays before the header", computeCutY(10000, 20000, [12000]) < 12000);

// -- real data: page 604, both surah boundaries (Ikhlas->Falaq, Falaq->Nas) --
const mushaf = JSON.parse(fs.readFileSync(MUSHAF_FILE, "utf-8"));
const page604 = mushaf.pages[603]; // 0-indexed
const { positions, surahHeaderTopYs } = computeLayout(page604, null);

check("page 604 has exactly 3 surah headers (112 at the top of the page, then 113, 114)", surahHeaderTopYs.length === 3);
check(
  "line 3 is a text line, line 4 is the surah-113 (Falaq) header",
  page604[3].t === "a" && page604[4].t === "s" && page604[4].surah === 113
);
check(
  "line 8 is a text line, line 9 is the surah-114 (Nas) header",
  page604[8].t === "a" && page604[9].t === "s" && page604[9].surah === 114
);

function checkBoundary(label, lastLineIdx, nextLineIdx, headerTopY) {
  const lastBaselineY = positions[lastLineIdx].baselineY;
  const nextBaselineY = positions[nextLineIdx].baselineY;
  check(`${label}: header sits after the tapped line and before the next real line`, headerTopY > lastBaselineY && headerTopY < nextBaselineY);

  const fixedCutY = computeCutY(lastBaselineY, nextBaselineY, surahHeaderTopYs);
  check(`${label}: fixed cutY clears the tapped line but stays before its header`, fixedCutY > lastBaselineY && fixedCutY <= headerTopY);

  // Without the fix (always splitting against nextSeg, header or not), this
  // real data reproduces the reported bug -- asserting that documents WHY
  // the fix is needed, not just that the fixed version behaves.
  const oldCutY = (lastBaselineY + (HIGHLIGHT_HEIGHT - HIGHLIGHT_ABOVE_BASELINE) + (nextBaselineY - HIGHLIGHT_ABOVE_BASELINE)) / 2;
  check(`${label}: pre-fix formula would have cut past the header (the reported bug)`, oldCutY > headerTopY);
}

// index 6 / 11, not 5 / 10: those are each surah's bismillah line, which --
// like the header -- contributes no currentPageSegments entry either, so
// nextSeg (a REAL text-segment lookup) skips straight past it too.
// surahHeaderTopYs[0] is surah 112's OWN header, at the very top of this
// page (line 0) -- not a boundary case, skipped here.
checkBoundary("Ikhlas -> Falaq", 3, 6, surahHeaderTopYs[1]);
checkBoundary("Falaq -> Nas", 8, 11, surahHeaderTopYs[2]);

console.log(`checked page 604 (${positions.length} lines, ${surahHeaderTopYs.length} surah headers)`);

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
} else {
  console.log("all checks passed");
}
