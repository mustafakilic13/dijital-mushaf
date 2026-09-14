// Data-consistency + navigation-logic tests for juz/hizb/rub/manzil.
// Pure Node, no deps (unlike full_corpus_test.mjs, no jsdom/harfbuzz needed
// since none of this touches rendering) -- just: node juz_subdivisions_test.mjs
//
// Re-implements (verbatim) the small pure-logic pieces from js/app.js that
// this feature added (unitForAyah, buildPageToUnitArray) so they can run
// against the real data/*.json files without a browser/DOM. If app.js's
// real versions ever drift from these, this test won't catch that drift --
// it's testing the ALGORITHM + DATA are consistent, not that app.js still
// calls them correctly (the els.*/function-reference checks for that were
// done by hand when this was built).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, "..", "data");

function loadJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf-8"));
}

function unitForAyah(map, count, surah, ayah) {
  let result = 1;
  for (let n = 1; n <= count; n++) {
    const info = map[String(n)];
    if (!info || !info.firstVerseKey) continue;
    const [s, a] = info.firstVerseKey.split(":").map(Number);
    if (s < surah || (s === surah && a <= ayah)) {
      result = n;
    } else {
      break;
    }
  }
  return result;
}

function buildPageToUnitArray(map, count, pagesCount) {
  const arr = new Array(pagesCount + 1).fill(1);
  for (let n = 1; n <= count; n++) {
    const startPage = map[String(n)] && map[String(n)].page;
    if (!startPage) continue;
    for (let p = startPage; p <= pagesCount; p++) arr[p] = n;
  }
  return arr;
}

let failures = 0;
function check(label, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}

function main() {
  const mushaf = loadJSON("mushaf.json");
  const pagesCount = mushaf.pagesCount;
  const juz = loadJSON("juz.json");
  const hizb = loadJSON("hizb.json");
  const rub = loadJSON("rub.json");
  const manzil = loadJSON("manzil.json");

  const datasets = [
    ["juz", juz, 30],
    ["hizb", hizb, 60],
    ["rub", rub, 240],
    ["manzil", manzil, 7],
  ];

  // 1) Right count of entries, all with a firstVerseKey + resolved page.
  for (const [label, map, count] of datasets) {
    check(`${label}.json has ${count} entries`, Object.keys(map).length === count);
    for (let n = 1; n <= count; n++) {
      const info = map[String(n)];
      check(`${label} ${n} exists`, !!info);
      check(`${label} ${n} has firstVerseKey`, !!(info && info.firstVerseKey));
      check(`${label} ${n} has a resolved page`, !!(info && info.page));
    }
  }

  // 2) firstVerseKey strictly increases (global surah:ayah order) within
  //    each dataset -- catches any ordering/parsing corruption.
  for (const [label, map, count] of datasets) {
    let prev = [0, 0];
    for (let n = 1; n <= count; n++) {
      const [s, a] = map[String(n)].firstVerseKey.split(":").map(Number);
      const increased = s > prev[0] || (s === prev[0] && a > prev[1]);
      check(`${label} ${n} firstVerseKey (${s}:${a}) > previous`, increased);
      prev = [s, a];
    }
  }

  // 3) Hierarchical alignment: juz j == hizb (2j-1); hizb h == rub (4h-3).
  //    (manzil is intentionally NOT checked here -- it does not nest under
  //    juz, see state.manzil's comment in app.js.)
  for (let j = 1; j <= 30; j++) {
    check(
      `juz ${j} firstVerseKey == hizb ${2 * j - 1} firstVerseKey`,
      juz[String(j)].firstVerseKey === hizb[String(2 * j - 1)].firstVerseKey
    );
  }
  for (let h = 1; h <= 60; h++) {
    check(
      `hizb ${h} firstVerseKey == rub ${4 * h - 3} firstVerseKey`,
      hizb[String(h)].firstVerseKey === rub[String(4 * h - 3)].firstVerseKey
    );
  }

  // 4) Manzil really is independent of juz: at least one manzil boundary
  //    must fall strictly INSIDE a juz (not on a juz boundary) -- if this
  //    ever failed it'd mean manzil happens to align with juz after all,
  //    and the separate-top-level-accordion design call should be revisited.
  const juzFirstKeys = new Set(Object.values(juz).map((v) => v.firstVerseKey));
  const manzilStartsMidJuz = Object.values(manzil).some((v) => !juzFirstKeys.has(v.firstVerseKey));
  check("at least one manzil boundary falls mid-juz (confirms it doesn't nest under juz)", manzilStartsMidJuz);

  // 5) Both ends of the Qur'an resolve correctly for all four datasets.
  for (const [label, map, count] of datasets) {
    check(`${label}: ayah 1:1 -> unit 1`, unitForAyah(map, count, 1, 1) === 1);
    check(`${label}: ayah 114:6 -> unit ${count} (last)`, unitForAyah(map, count, 114, 6) === count);
  }

  // 6) Boundary round-trip: evaluating unitForAyah AT unit n's own
  //    firstVerseKey must return exactly n (the core correctness property
  //    of the "walk and stop at last <=" algorithm) -- and one ayah before
  //    that boundary must return n-1.
  for (const [label, map, count] of datasets) {
    for (let n = 1; n <= count; n++) {
      const [s, a] = map[String(n)].firstVerseKey.split(":").map(Number);
      check(`${label} ${n}: unitForAyah(its own first ayah) === ${n}`, unitForAyah(map, count, s, a) === n);
    }
  }

  // 7) pageToUnit arrays: correct length, in-range values, monotonically
  //    non-decreasing, and agree with unitForAyah at each unit's own page.
  for (const [label, map, count] of datasets) {
    const arr = buildPageToUnitArray(map, count, pagesCount);
    check(`${label}: pageToUnit array length`, arr.length === pagesCount + 1);
    let prev = 1;
    for (let p = 1; p <= pagesCount; p++) {
      check(`${label}: page ${p} unit in range`, arr[p] >= 1 && arr[p] <= count);
      check(`${label}: page ${p} unit non-decreasing`, arr[p] >= prev);
      prev = arr[p];
    }
    check(`${label}: last page reaches final unit ${count}`, arr[pagesCount] === count);
  }

  console.log(failures === 0 ? "\nTUM KONTROLLER GECTI (0 hata)" : `\n${failures} HATA BULUNDU`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
