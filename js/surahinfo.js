// surahinfo.js
//
// "Sure Bilgisi": loader for data/surah-info-tr.json (114 entries, keyed
// "1".."114", each { surah_number, surah_name, text, short_text }), same
// fetch-once-and-cache shape as tafsir.js's loadTafsirData -- see that
// file's header comment for why (repeat calls resolve instantly from the
// cache; only the first caller per session actually pays for the fetch).
//
// Source: QUL (qul.tarteel.ai/resources) surah-info export, translated to
// Turkish (İslami terimlere uygun, HTML etiketleri korunarak). This is the
// feature's SECOND data source -- the first (Diyanet Kur'an Yolu, at the
// now-removed data/sura-info.json) was taken down after Diyanet's
// permissions office declined third-party redistribution; see README.md's
// "Sure Bilgisi" note. Nothing else about the feature depended on that
// source's specific shape, so this one didn't need to match it.
//
// .text is a handful of <h2>Başlık</h2><p>...</p>... sections (İsim, İniş
// Dönemi, Tema ve Konu, ...) -- the heading SET isn't fixed (some surahs
// have 3, others up to 11: a historical-background aside, a couple of
// named side-questions, etc.), so app.js's accordion is built generically
// from whatever <h2> boundaries a given surah actually has, rather than
// assuming a fixed list of section names. splitInfoSections below is that
// split, shared here so it's tested/changed in one place. A tiny few
// entries (113, 114 -- Felak/Nas share one combined introduction) have a
// plain-<p> preamble before their first <h2>; that comes back as `intro`
// and app.js renders it standalone, above the accordion.

const DATA_FILE = "data/surah-info-tr.json";

let cache = null;
let promise = null;

export function isSurahInfoDataReady() {
  return cache !== null;
}

export function getCachedSurahInfoData() {
  return cache;
}

export function loadSurahInfoData() {
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

// `data` -> that surah's { surah_name, text, short_text } entry, or null
// if there's no entry / the data hasn't loaded yet.
export function getSurahInfoEntry(data, surahNum) {
  if (!data) return null;
  return data[String(surahNum)] || null;
}

// Splits one entry's .text into { intro, sections }: `intro` is whatever
// (rarely any) markup sits before the first <h2>, as raw HTML; `sections`
// is an ordered [{ title, bodyHTML }, ...] array, `title` as plain text
// (the <h2> tag's own inner text -- these never carry nested markup in the
// source) ready to escape, `bodyHTML` as raw HTML ready to render as-is,
// same "trusted, pass through unescaped" treatment app.js's
// tafsirContentHTML already gives tafsir-saadi.json's markup.
export function splitInfoSections(html) {
  if (!html) return { intro: "", sections: [] };
  const parts = html.split(/<h2>(.*?)<\/h2>/s);
  const intro = parts[0] || "";
  const sections = [];
  for (let i = 1; i < parts.length; i += 2) {
    sections.push({ title: parts[i], bodyHTML: parts[i + 1] || "" });
  }
  return { intro, sections };
}
