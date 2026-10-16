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
  markArabicSpans,
  markTopicLinks,
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

// -- markArabicSpans (WCAG 3.1.2: satır içi Arapça parçalar lang="ar" almalı) ---------------------------
// Açıklamalardaki Arapça metin veriden <span class="ar"> olarak geliyor; yardımcı yalnızca TAM bu kalıbı
// eşliyor. Bu yüzden aşağıda verideki HER <span>'in tam bu kalıpta olduğu ve Arapça harflerin başka
// yerde kalmadığı doğrulanıyor -- ileride farklı nitelikli bir span ya da işaretsiz Arapça gelirse burada kırılır.
check('markArabicSpans: boş/null -> ""', markArabicSpans("") === "" && markArabicSpans(null) === "" && markArabicSpans(undefined) === "");
check("markArabicSpans: tek parça", markArabicSpans('a <span class="ar">ب</span> b') === 'a <span class="ar" lang="ar">ب</span> b');
check(
  "markArabicSpans: birden çok parça, <b> ve <topic> ile iç içe; metne başka dokunuş yok",
  markArabicSpans('<b>x</b> <span class="ar">أ</span> <topic data-id="3">t</topic> <span class="ar">ب</span>') ===
    '<b>x</b> <span class="ar" lang="ar">أ</span> <topic data-id="3">t</topic> <span class="ar" lang="ar">ب</span>'
);
check("markArabicSpans: Arapça içermeyen metne dokunmuyor", markArabicSpans("<b>x</b> düz metin") === "<b>x</b> düz metin");
check('markArabicSpans: iki kez uygulamak sonucu değiştirmiyor (lang="ar" ikilenmiyor)', (() => {
  const once = markArabicSpans('<span class="ar">ب</span>');
  return markArabicSpans(once) === once && (once.match(/lang=/g) || []).length === 1;
})());
{
  const ARABIC_LETTER_RE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
  let spanTotal = 0;
  let arSpanTotal = 0;
  let unmarked = 0;
  let markedTotal = 0;
  let strayArabic = 0;
  for (const rec of data) {
    const d = rec.description || "";
    spanTotal += (d.match(/<span\b/g) || []).length;
    arSpanTotal += (d.match(/<span class="ar">/g) || []).length;
    const marked = markArabicSpans(d);
    if (/<span class="ar">/.test(marked)) unmarked++;
    markedTotal += (marked.match(/<span class="ar" lang="ar">/g) || []).length;
    // .ar span'larının DIŞINDA Arapça harf var mı? (U+06E9 secde işareti harf değil, bir simge)
    const outside = d.replace(/<span class="ar">[\s\S]*?<\/span>/g, "").replace(/۩/g, "");
    if (ARABIC_LETTER_RE.test(outside)) strayArabic++;
  }
  check(`verideki her <span> tam '<span class="ar">' kalıbında (${spanTotal} span, ${arSpanTotal} kalıp)`, spanTotal > 0 && spanTotal === arSpanTotal);
  check("işaretlemeden sonra lang'sız hiçbir .ar span kalmıyor", unmarked === 0);
  check(`işaretlenen parça sayısı veridekiyle birebir aynı (${markedTotal} / ${arSpanTotal})`, markedTotal === arSpanTotal);
  check("açıklamalarda .ar span'ları DIŞINDA Arapça harf yok (yani tüm Arapça metin işaretleniyor)", strayArabic === 0);
}

// -- markTopicLinks (WCAG 2.1.1 / 4.1.2: açıklamadaki iç bağlantılar klavyeyle odaklanabilmeli, bağlantı rolü taşımalı) ----
// Açıklamalardaki <topic data-id="N"> tarayıcı için bilinmeyen bir öğe: Tab'la odaklanamıyor ve erişilebilirlik
// ağacında rolü yok ("none"; gerçek Chromium'da ölçüldü). Yardımcı yalnızca TAM `<topic data-id="N">` kalıbını işaretliyor.
// Bu yüzden aşağıda verideki HER <topic> etiketinin ya bu kalıpta ya da çıplak `<topic>` olduğu doğrulanıyor -- ileride
// başka nitelikli bir etiket gelirse (ör. data-id'den sonra class) sessizce işaretsiz kalmasın, burada kırılsın.
check('markTopicLinks: boş/null -> ""', markTopicLinks("") === "" && markTopicLinks(null) === "" && markTopicLinks(undefined) === "");
check(
  "markTopicLinks: tek bağlantı -> role=\"link\" tabindex=\"0\"",
  markTopicLinks('a <topic data-id="61">Kur\'an</topic> b') === 'a <topic data-id="61" role="link" tabindex="0">Kur\'an</topic> b'
);
check("markTopicLinks: data-id'siz <topic>'e dokunmuyor (hedefi yok, odak durağı olmamalı)", markTopicLinks("a <topic>x</topic> b") === "a <topic>x</topic> b");
check(
  "markTopicLinks: birden çok bağlantı, çıplak <topic>, <b> ve Arapça parça iç içe; metne başka dokunuş yok",
  markTopicLinks('<b>x</b> <topic data-id="3">t</topic> <span class="ar">ب</span> <topic>y</topic> <topic data-id="47">u</topic>') ===
    '<b>x</b> <topic data-id="3" role="link" tabindex="0">t</topic> <span class="ar">ب</span> <topic>y</topic> <topic data-id="47" role="link" tabindex="0">u</topic>'
);
check("markTopicLinks: bağlantı içermeyen metne dokunmuyor", markTopicLinks("<b>x</b> düz metin") === "<b>x</b> düz metin");
check("markTopicLinks: iki kez uygulamak sonucu değiştirmiyor (role/tabindex ikilenmiyor)", (() => {
  const once = markTopicLinks('<topic data-id="61">Kur\'an</topic>');
  return markTopicLinks(once) === once && (once.match(/role=/g) || []).length === 1 && (once.match(/tabindex=/g) || []).length === 1;
})());
check("markTopicLinks: markArabicSpans ile hangi sırayla uygulanırsa uygulansın aynı sonuç (render yolu birbirine bağımlı değil)", (() => {
  const s = '<topic data-id="5">a</topic> <span class="ar">ب</span>';
  return markTopicLinks(markArabicSpans(s)) === markArabicSpans(markTopicLinks(s));
})());
{
  let tagged = 0;
  let bare = 0;
  let otherForms = 0;
  let markedTotal = 0;
  let unmarked = 0;
  let bareTouched = 0;
  let textChanged = 0;
  let topicsWithLink = 0;
  let maxInOne = 0;
  for (const rec of data) {
    const d = rec.description || "";
    let inThis = 0;
    for (const tag of d.match(/<topic\b[^>]*>/g) || []) {
      if (/^<topic data-id="\d+">$/.test(tag)) {
        tagged++;
        inThis++;
      } else if (tag === "<topic>") bare++;
      else otherForms++;
    }
    if (inThis) topicsWithLink++;
    maxInOne = Math.max(maxInOne, inThis);
    const marked = markTopicLinks(d);
    markedTotal += (marked.match(/<topic data-id="\d+" role="link" tabindex="0">/g) || []).length;
    if (/<topic data-id="\d+">/.test(marked)) unmarked++;
    if ((marked.match(/<topic>/g) || []).length !== (d.match(/<topic>/g) || []).length) bareTouched++;
    // işaretleme dışında metne dokunulmadı: eklenen nitelikler çıkarılınca özgün açıklama geri geliyor
    if (marked.replace(/ role="link" tabindex="0"/g, "") !== d) textChanged++;
  }
  check(`verideki her <topic> etiketi ya '<topic data-id="N">' ya da çıplak '<topic>' (${tagged} + ${bare}; başka biçim: ${otherForms})`, otherForms === 0 && tagged > 0);
  // Sayılar README'de ve app.js/topics.js yorumlarında anılıyor; veri değişirse bu iki sayı bilerek kırılır:
  // çıplak (hedefsiz) bağlantıların ne olacağı kararı da o zaman yeniden gözden geçirilmeli.
  check(`verideki sayılar belgelenenle aynı: 461 data-id'li bağlantı (271 konuda, en çok 6), 48 çıplak (bulunan: ${tagged} / ${bare}, ${topicsWithLink} konu, en çok ${maxInOne})`, tagged === 461 && bare === 48 && topicsWithLink === 271 && maxInOne === 6);
  check("işaretlemeden sonra işaretsiz data-id'li <topic> kalmıyor", unmarked === 0);
  check(`işaretlenen bağlantı sayısı veridekiyle birebir aynı (${markedTotal} / ${tagged})`, markedTotal === tagged);
  check("çıplak <topic>'lere dokunulmuyor (odak durağı olmamalı)", bareTouched === 0);
  check("işaretleme dışında hiçbir açıklamanın metnine dokunulmuyor (eklenen nitelikler çıkarılınca özgün açıklama geri geliyor)", textChanged === 0);
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log(`All checks passed (${data.length} topics, ${totalAyahRefs} ayah refs, ${descRefCount} in-description topic links).`);
}
