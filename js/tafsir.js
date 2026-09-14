// tafsir.js
//
// Generic loader + ayah-group resolver for tafsir (commentary) sources.
// Each source's data file uses the same shape: a flat
// { "surah:ayah": {"text": "<html>..."} } map for a GROUP's anchor ayah
// (the ayah the commentary is actually attached to), plus
// { "surah:ayah": "anchor-surah:ayah" } -- a plain string naming the
// anchor -- for every OTHER ayah in that group. resolveTafsirText follows
// that one hop so every ayah in a shared-commentary group renders the same
// text, per the anchor. Verified against the full corpus: every redirect
// points straight at a real anchor entry (no broken refs, no multi-hop
// chains) -- but resolveTafsirText still only takes what it's given, so a
// source that DID chain two hops deep would just come back empty rather
// than crash.
//
// data/tafsir-saadi.json already comes in this shape from QUL.
//
// The .text HTML (paragraph breaks, plus colour/typeface spans marking
// Qur'an quotations, key terms, editorial notes, etc.) is passed through
// as-is -- see app.js's tafsirContentHTML, which deliberately does NOT
// escape it.
//
// A second source (Diyanet's Kur'an Yolu Tefsiri) was removed along with
// its data file after Diyanet's permissions office explicitly declined a
// request to use it this way (their content is offered through their own
// site/apps only, not for redistribution in third-party projects) -- see
// README.md's data-sources section. `sources` below is intentionally left
// as an object (not hardcoded to one entry) since adding a future,
// properly-licensed source back is still just one entry here plus a data
// file, per the original design.

const sources = {
  saadi: {
    label: "Tefsîr-i Sa'dî",
    file: "data/tafsir-saadi.json",
  },
};

const cache = new Map(); // sourceId -> resolved data
const promises = new Map(); // sourceId -> in-flight fetch promise

// Ordered list of every configured source's id -- drives the tab buttons
// in app.js's ayahPanelBodyHTML, so adding a new source only means adding
// an entry to `sources` above.
export function tafsirSourceIds() {
  return Object.keys(sources);
}

export function tafsirSourceLabel(id) {
  return sources[id] ? sources[id].label : id;
}

// Whether `id` actually has a data file configured -- false for a source
// that's in the UI (a tab button) but hasn't been hooked up to real data
// yet, so callers can show an honest "yakında eklenecek" instead of
// treating it as a fetch failure.
export function isTafsirSourceAvailable(id) {
  return !!(sources[id] && sources[id].file);
}

export function isTafsirDataReady(id) {
  return cache.has(id);
}

export function getCachedTafsirData(id) {
  return cache.get(id) || null;
}

// Fetches (once) and caches a source's data file for the rest of the
// session -- repeat calls resolve immediately from the cache. Rejects
// (without ever caching anything) for a source with no file configured;
// check isTafsirSourceAvailable first if that should be handled
// differently from an actual load failure.
export function loadTafsirData(id) {
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  const src = sources[id];
  if (!src || !src.file) {
    return Promise.reject(new Error(`No data file configured for tafsir source "${id}"`));
  }
  if (!promises.has(id)) {
    const p = fetch(src.file)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${src.file}: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        cache.set(id, data);
        promises.delete(id);
        return data;
      })
      .catch((err) => {
        promises.delete(id);
        throw err;
      });
    promises.set(id, p);
  }
  return promises.get(id);
}

// `data` -> one ayah's tafsir HTML (following a single group-redirect hop
// if needed), or null if there's no entry / the data hasn't loaded yet.
export function resolveTafsirText(data, surah, ayah) {
  if (!data) return null;
  let entry = data[`${surah}:${ayah}`];
  if (typeof entry === "string") entry = data[entry];
  return entry && entry.text ? entry.text : null;
}
