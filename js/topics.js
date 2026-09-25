// topics.js
//
// "Konu Fihristi" (Kur'an Fihristi / Topics and Concepts in the Quran):
// loader + pure data-shaping for data/topics-tr.json, same
// fetch-once-and-cache shape as surahinfo.js's loadSurahInfoData (repeat
// calls resolve instantly from the cache; only the first caller per
// session actually pays for the fetch).
//
// Source: QUL (qul.tarteel.ai/resources/ayah-topics) -- 2512 topics,
// ayah-by-ayah matched, translated to Turkish (İslami terimlere uygun --
// terim sıklığı Saadi tefsiriyle karşılaştırılarak -- HTML etiketleri
// korunarak). The ayah-topic mapping itself and every numeric/relational
// field (parent_id, thematic_parent_id, ontology_parent_id,
// related_topics, thematic, ontology) are untouched from QUL's own
// export -- only display text (name, arabic_name, description) was
// translated. See README.md's "Konu Fihristi" section.
//
// data/topics-tr.json is a flat array of 2512 records:
//   topic_id                 unique id, referenced by the fields below
//   name, arabic_name        display text (arabic_name can be null)
//   description               HTML, can be null -- may contain nested
//                              <topic data-id="X">...</topic> cross-
//                              references to OTHER topics (see below),
//                              <b> and <span class="ar"> (Arabic inline
//                              text). Scanned once against the live data:
//                              no other tags, no event-handler
//                              attributes, no dangling data-id refs --
//                              safe to set as innerHTML unescaped, same
//                              "trusted own-translated content" treatment
//                              app.js already gives surah-info/tafsir.
//   parent_id                 generic (non-thematic, non-ontology)
//   thematic_parent_id        \ another record's topic_id, or null.
//   ontology_parent_id        / NOT mutually exclusive with each other or
//                              with parent_id -- 16 records set both
//                              thematic_parent_id and ontology_parent_id,
//                              10 set parent_id alongside one of the
//                              other two -- so a topic can have more than
//                              one "Ana Konu" at once; app.js shows every
//                              non-null one instead of picking just one.
//   thematic, ontology         0/1 flags, ALSO not mutually exclusive (17
//                              records have both set) -- topicCategoryLabels
//                              below turns these into the "Ontoloji" /
//                              "Tematik" / "Genel" badges QUL itself shows
//                              as a single Type column ("Genel" is simply
//                              both flags 0, not a third flag of its own).
//   ayahs                      "4:43, 5:6" -- comma-separated "surah:ayah",
//                              parsed by parseAyahsField. 182 of the 2512
//                              topics have no ayahs at all ("").
//   related_topics             "45,167,52" -- comma-separated topic_ids,
//                              parsed by parseRelatedTopicsField. Rare (17
//                              of 2512) -- most cross-topic browsing goes
//                              through the parent/child relationship
//                              (childrenOf, below) instead, or through the
//                              <topic data-id="X"> links embedded directly
//                              in some descriptions (app.js routes a click
//                              on one of those through the exact same
//                              "open this other topic" path as a related/
//                              parent/child chip).
//   wiki_link                  not currently surfaced in the UI.
//
// Every parent_id/thematic_parent_id/ontology_parent_id/related_topics
// reference, and every <topic data-id> reference inside a description,
// resolves to a real topic_id in this same file, and no record is its own
// parent -- verified once here (test/topics_test.mjs) against the live
// data rather than defensively re-checked by every caller.

const DATA_FILE = "data/topics-tr.json";

let cache = null;
let promise = null;
let cachedIndex = null; // built lazily from `cache`, see getTopicsIndex

export function isTopicsDataReady() {
  return cache !== null;
}

export function getCachedTopicsData() {
  return cache;
}

export function loadTopicsData() {
  if (cache) return Promise.resolve(cache);
  if (!promise) {
    promise = fetch(DATA_FILE)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${DATA_FILE}: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        cache = data;
        promise = null;
        return data;
      })
      .catch((err) => {
        promise = null;
        throw err;
      });
  }
  return promise;
}

// "4:43, 5:6" -> [{surah:4, ayah:43}, {surah:5, ayah:6}]. Malformed pieces
// (there are none in the current data -- see test/topics_test.mjs) are
// dropped rather than thrown on, same defensive style as surahinfo.js's
// parseInfoLink.
export function parseAyahsField(str) {
  if (!str) return [];
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^(\d+):(\d+)$/.exec(s);
      return m ? { surah: parseInt(m[1], 10), ayah: parseInt(m[2], 10) } : null;
    })
    .filter(Boolean);
}

// "45,167,52" -> [45, 167, 52]
export function parseRelatedTopicsField(str) {
  if (!str) return [];
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (/^\d+$/.test(s) ? parseInt(s, 10) : null))
    .filter((n) => n !== null);
}

// record -> ["Ontoloji", "Tematik"] (both, when both flags are set),
// ["Ontoloji"], ["Tematik"], or ["Genel"] (both flags 0).
export function topicCategoryLabels(record) {
  const labels = [];
  if (record.ontology) labels.push("Ontoloji");
  if (record.thematic) labels.push("Tematik");
  if (!labels.length) labels.push("Genel");
  return labels;
}

// One pass over the flat array building three lookups:
//  - byId: topic_id -> record
//  - byAyah: "surah:ayah" -> [topic_id, ...], source order
//  - childrenOf: parent topic_id -> [topic_id, ...] -- the REVERSE of
//    parent_id/thematic_parent_id/ontology_parent_id (QUL's own UI shows
//    this as "Child Topics" on a topic's page; the source data has no
//    field for it directly, it only records each child's own parent(s)).
//    A topic can end up listed once per parent field that points at it,
//    but no current record has two of its own three parent fields
//    pointing at the SAME id, so that can't actually double a child up.
export function buildTopicsIndex(data) {
  const byId = new Map();
  const byAyah = new Map();
  const childrenOf = new Map();

  for (const rec of data) {
    byId.set(rec.topic_id, rec);
  }
  for (const rec of data) {
    for (const { surah, ayah } of parseAyahsField(rec.ayahs)) {
      const key = `${surah}:${ayah}`;
      const list = byAyah.get(key);
      if (list) list.push(rec.topic_id);
      else byAyah.set(key, [rec.topic_id]);
    }
    for (const parentField of ["parent_id", "thematic_parent_id", "ontology_parent_id"]) {
      const parentId = rec[parentField];
      if (parentId == null) continue;
      const list = childrenOf.get(parentId);
      if (list) list.push(rec.topic_id);
      else childrenOf.set(parentId, [rec.topic_id]);
    }
  }

  return { byId, byAyah, childrenOf };
}

// The indexed form of whatever's currently cached, built once on first
// use and reused after that (2512 records / ~31k ayah refs -- cheap
// either way, but no reason to redo it on every ayah panel open). Returns
// null if loadTopicsData() hasn't resolved yet.
export function getTopicsIndex() {
  if (!cache) return null;
  if (!cachedIndex) cachedIndex = buildTopicsIndex(cache);
  return cachedIndex;
}
