// Regression check for js/surahinfo.js's parseInfoLink -- see that
// function's own header comment for the three href shapes it handles
// (bare surah / ayah-or-range / footnote). Two parts: direct unit checks
// for each shape (including the edge cases -- missing leading slash,
// footnote query string, garbage input), then a sweep over every <a
// href="..."> actually present in data/surah-info-tr.json to make sure
// none of the 114 surahs' real content has drifted onto a shape this
// doesn't cover.
//
// Pure Node, no deps (surahinfo.js itself has none outside
// loadSurahInfoData's fetch(), which this never calls) -- just:
//   node surah_info_links_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseInfoLink } from "../js/surahinfo.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(HERE, "..", "data", "surah-info-tr.json");

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}

// -- unit checks: one per href shape, plus the edge cases -----------------
check("bare surah -> type surah", (() => {
  const r = parseInfoLink("/2");
  return !!r && r.type === "surah" && r.surah === 2;
})());
check("single ayah -> ayahStart === ayahEnd", (() => {
  const r = parseInfoLink("/6/139");
  return !!r && r.type === "ayah" && r.surah === 6 && r.ayahStart === 139 && r.ayahEnd === 139;
})());
check("ayah range", (() => {
  const r = parseInfoLink("/4/136-175");
  return !!r && r.type === "ayah" && r.surah === 4 && r.ayahStart === 136 && r.ayahEnd === 175;
})());
check("footnote (colon + query) -> collapses to single ayah, query dropped", (() => {
  const r = parseInfoLink("/44:5?font=v2&translations=95");
  return !!r && r.type === "ayah" && r.surah === 44 && r.ayahStart === 5 && r.ayahEnd === 5;
})());
check("footnote range (colon + dash + query)", (() => {
  const r = parseInfoLink("/29:10-11?font=v2&translations=95");
  return !!r && r.type === "ayah" && r.surah === 29 && r.ayahStart === 10 && r.ayahEnd === 11;
})());
check("missing leading slash tolerated (3 real links in the data do this)", (() => {
  const r = parseInfoLink("2/40-120");
  return !!r && r.type === "ayah" && r.surah === 2 && r.ayahStart === 40 && r.ayahEnd === 120;
})());
check("empty href rejected", parseInfoLink("") === null);
check("surah 0 rejected", parseInfoLink("/0") === null);
check("non-numeric rejected", parseInfoLink("#read-more") === null);

// -- every real link in the current data must parse to something ----------
// Same attribute-scan approach used to validate parseInfoLink's regex
// against the live data before writing it (handles both quoted and
// unquoted href="..." / href=... -- both appear in the source).
const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
const aTagRe = /<a\s+([^>]*)>/g;
const hrefRe = /href=["']?([^"'\s>]+)["']?/;
let total = 0;
for (const [surahNum, entry] of Object.entries(data)) {
  for (const field of ["text", "short_text"]) {
    const html = entry[field] || "";
    for (const tagMatch of html.matchAll(aTagRe)) {
      const hrefMatch = hrefRe.exec(tagMatch[1]);
      if (!hrefMatch) continue;
      total++;
      const href = hrefMatch[1];
      check(`surah ${surahNum} ${field} link parses: ${href}`, parseInfoLink(href) !== null);
    }
  }
}
console.log(`checked ${total} real links from surah-info-tr.json`);

if (failures) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
} else {
  console.log("all checks passed");
}
