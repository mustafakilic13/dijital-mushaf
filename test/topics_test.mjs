// Regression check for js/topics.js -- see that file's own header comment
// for the data shape. Three parts: unit checks for the pure parsing
// helpers (including edge cases -- empty string, trailing comma, garbage
// input), a full-data referential-integrity sweep (every parent_id /
// thematic_parent_id / ontology_parent_id / related_topics id, and every
// <topic data-id> reference embedded in a description, must resolve to a
// real topic_id -- and no record may be its own parent), and a handful of
// concrete known-topic checks against data/topics-tr.json (the QUL
// "Purification" -> "ablution (wuḍû')" example from the app's own spec).
//
// Pure Node, no deps (topics.js itself has none outside loadTopicsData's
// fetch(), which this never calls) -- just:
//   node topics_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  parseAyahsField,
  parseRelatedTopicsField,
  topicCategoryLabels,
  buildTopicsIndex,
} from "../js/topics.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(HERE, "..", "data", "topics-tr.json");
const SURAHS_FILE = path.join(HERE, "..", "data", "surahs.json");

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}

// -- parseAyahsField -------------------------------------------------------
check("empty string -> []", parseAyahsField("").length === 0);
check("null -> []", parseAyahsField(null).length === 0);
check("single ayah", (() => {
  const r = parseAyahsField("5:6");
  return r.length === 1 && r[0].surah === 5 && r[0].ayah === 6;
})());
check("several, with spaces after comma (real data's own format)", (() => {
  const r = parseAyahsField("1:1, 1:2, 2:255");
  return r.length === 3 && r[1].surah === 1 && r[1].ayah === 2 && r[2].surah === 2 && r[2].ayah === 255;
})());
check("garbage piece dropped, valid pieces kept", (() => {
  const r = parseAyahsField("5:6, not-an-ayah, 2:10");
  return r.length === 2 && r[0].ayah === 6 && r[1].ayah === 10;
})());

// -- parseRelatedTopicsField ------------------------------------------------
check("empty string -> []", parseRelatedTopicsField("").length === 0);
check("real example (topic 63, Mescit)", (() => {
  const r = parseRelatedTopicsField("45,167,52");
  return r.length === 3 && r[0] === 45 && r[1] === 167 && r[2] === 52;
})());
check("garbage piece dropped", (() => {
  const r = parseRelatedTopicsField("45,abc,52");
  return r.length === 2 && r[0] === 45 && r[1] === 52;
})());

// -- topicCategoryLabels ----------------------------------------------------
check("thematic only", JSON.stringify(topicCategoryLabels({ thematic: 1, ontology: 0 })) === JSON.stringify(["Tematik"]));
check("ontology only", JSON.stringify(topicCategoryLabels({ thematic: 0, ontology: 1 })) === JSON.stringify(["Ontoloji"]));
check("both -> both labels, ontology-then-thematic order", JSON.stringify(topicCategoryLabels({ thematic: 1, ontology: 1 })) === JSON.stringify(["Ontoloji", "Tematik"]));
check("neither -> Genel", JSON.stringify(topicCategoryLabels({ thematic: 0, ontology: 0 })) === JSON.stringify(["Genel"]));

// -- full-data sweep ---------------------------------------------------------
const raw = fs.readFileSync(DATA_FILE, "utf-8");
const data = JSON.parse(raw);
const surahs = JSON.parse(fs.readFileSync(SURAHS_FILE, "utf-8"));
const surahVerseCounts = Object.fromEntries(Object.entries(surahs).map(([k, v]) => [Number(k), v.versesCount]));

check("2512 records", data.length === 2512);

const index = buildTopicsIndex(data);
check("byId has one entry per record", index.byId.size === data.length);

const ids = new Set(data.map((r) => r.topic_id));

// every parent_id/thematic_parent_id/ontology_parent_id resolves, and is
// never the record's own id
let badParent = 0;
for (const rec of data) {
  for (const field of ["parent_id", "thematic_parent_id", "ontology_parent_id"]) {
    const v = rec[field];
    if (v == null) continue;
    if (!ids.has(v)) badParent++;
    if (v === rec.topic_id) badParent++;
  }
}
check("every parent field resolves to a real, different topic_id", badParent === 0);

// every related_topics id resolves
let badRelated = 0;
for (const rec of data) {
  for (const relId of parseRelatedTopicsField(rec.related_topics)) {
    if (!ids.has(relId)) badRelated++;
  }
}
check("every related_topics id resolves to a real topic_id", badRelated === 0);

// every ayahs "surah:ayah" pair is in range for that surah
let badAyah = 0;
let totalAyahRefs = 0;
for (const rec of data) {
  for (const { surah, ayah } of parseAyahsField(rec.ayahs)) {
    totalAyahRefs++;
    const max = surahVerseCounts[surah];
    if (!max || ayah < 1 || ayah > max) badAyah++;
  }
}
check("every ayahs ref is a valid surah:ayah pair", badAyah === 0 && totalAyahRefs > 0);

// every <topic data-id="X"> embedded in a description resolves
let badDescRef = 0;
let descRefCount = 0;
const TOPIC_TAG_RE = /<topic\s+data-id="(\d+)"/g;
for (const rec of data) {
  if (!rec.description) continue;
  let m;
  while ((m = TOPIC_TAG_RE.exec(rec.description))) {
    descRefCount++;
    if (!ids.has(parseInt(m[1], 10))) badDescRef++;
  }
}
check("every <topic data-id> in a description resolves to a real topic_id", badDescRef === 0 && descRefCount > 0);

// childrenOf is genuinely the reverse of the parent fields: for every
// record with a non-null parent field, that parent's childrenOf list must
// contain the record's own id
let missingReverse = 0;
for (const rec of data) {
  for (const field of ["parent_id", "thematic_parent_id", "ontology_parent_id"]) {
    const parentId = rec[field];
    if (parentId == null) continue;
    const kids = index.childrenOf.get(parentId) || [];
    if (!kids.includes(rec.topic_id)) missingReverse++;
  }
}
check("childrenOf reverse-indexes every parent field", missingReverse === 0);

// -- concrete known-topic checks (the app's own spec example: QUL's
// Purification -> ablution (wuḍû')/full bath (ghusl)/dry ablution
// (tayammum) page) ----------------------------------------------------------
const PURIFICATION_ID = 1678; // "Tezkiye (Arınma)"
check("Tezkiye (Arınma) is topic 1678", index.byId.get(PURIFICATION_ID)?.name === "Tezkiye (Arınma)");
check(
  "its 3 child topics are Abdest / Boy abdesti (gusül) / Teyemmüm",
  (() => {
    const names = (index.childrenOf.get(PURIFICATION_ID) || [])
      .map((id) => index.byId.get(id)?.name)
      .sort();
    return JSON.stringify(names) === JSON.stringify(["Abdest", "Boy abdesti (gusül)", "Teyemmüm"].sort());
  })()
);
check(
  "5:6 (the ablution ayah) is tagged with both the General and Thematic \"Abdest\" topics",
  (() => {
    const tagged = index.byAyah.get("5:6") || [];
    return tagged.includes(287) && tagged.includes(2065);
  })()
);

// -- ayah-panel tag dedup (js/app.js ayahTopicsRowHTML mirrors this exact
// grouping) -- same-named topics tagged to the same ayah collapse to one
// tag, keeping the lowest topic_id. Kept in sync with app.js by this test
// failing if the two drift apart -- same pattern as
// surah_header_cut_test.mjs's mirrored cutY formula. ------------------------
function dedupTagsByName(topicIds) {
  const byName = new Map();
  for (const id of topicIds) {
    const t = index.byId.get(id);
    if (!t) continue;
    const existing = byName.get(t.name);
    if (!existing || t.topic_id < existing.topic_id) byName.set(t.name, t);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

check(
  '1:6\'s two "Dua" entries (1412, 1793) collapse to one tag, keeping 1412',
  (() => {
    const dua = dedupTagsByName(index.byAyah.get("1:6") || []).filter((t) => t.name === "Dua");
    return dua.length === 1 && dua[0].topic_id === 1412;
  })()
);

let dedupIssues = 0;
for (const [, topicIds] of index.byAyah) {
  const tags = dedupTagsByName(topicIds);
  if (tags.length > topicIds.length) dedupIssues++;
  if (tags.some((t) => !ids.has(t.topic_id))) dedupIssues++;
}
check(`ayah-tag dedup never grows the list or drops a valid id, across all ${index.byAyah.size} tagged ayahs`, dedupIssues === 0);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log(`All checks passed (${data.length} topics, ${totalAyahRefs} ayah refs, ${descRefCount} in-description topic links).`);
}
