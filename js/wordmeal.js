// wordmeal.js
//
// "Kelime meal" -- word-by-word Turkish translation, shown in a panel that
// opens beneath the tapped ayah's last line (see app.js's openWordMeal).
//
// data/word-meal.json is a flat { "surah:ayah:position": "turkish text" }
// map (QUL's word-by-word translation export, ~70k entries). `position` is
// 1-based and counts only the ayah's REAL words -- the end-of-ayah marker
// glyph (mushaf.json's trailing "\u06ddN" token) is never counted and never
// has an entry of its own.
//
// Not every real word gets its own entry either: when a position is
// missing, that word's Arabic text is folded into the PREVIOUS existing
// position's card instead. Turkish often has no separate gloss for a bare
// Arabic preposition -- its meaning is absorbed into the following word's
// translation. Example (10:2): word 6 "إِلَىٰ" (to) and word 7 "رَجُلٍ" (a
// man) together are glossed as one card, "bir adama" (to a man), stored
// under key "10:2:6"; "10:2:7" simply has no entry, so word 7's Arabic
// gets appended to word 6's card instead of starting a new one.
// Verified against every one of the 6236 ayahs: every ayah has an entry at
// position 1 (so there's always a card to fold into) and every used
// position is within that ayah's real word count.

// U+06DD ARABIC END OF AYAH, prefixes the ayah-ending glyph's text. Also
// used by app.js's ayahArabicText (Konu Fihristi's plain-text ayah
// rendering) to strip the same marker outside this module's own cards.
export const MARKER = "\u06dd";

let cachedData = null;
let dataPromise = null;

export function isWordMealDataReady() {
  return cachedData !== null;
}

// The resolved translation map, or null if it hasn't finished loading yet.
export function getCachedWordMealData() {
  return cachedData;
}

// Fetches (once) and caches data/word-meal.json for the rest of the
// session -- repeat calls resolve immediately from the cache.
export function loadWordMealData() {
  if (cachedData) return Promise.resolve(cachedData);
  if (!dataPromise) {
    dataPromise = fetch("data/word-meal.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load data/word-meal.json: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        cachedData = data;
        dataPromise = null;
        return data;
      })
      .catch((err) => {
        dataPromise = null;
        throw err;
      });
  }
  return dataPromise;
}

// `rawWords`: mushaf.json word objects ({i,t}) for one ayah, in reading
// order, INCLUDING the trailing end-of-ayah marker -- exactly what you get
// by filtering mushaf.json's line.w entries down to an ayah's
// [firstWordId, lastWordId] range (see app.js's ayahRawWords). Returns an
// ordered array of { arabic, translation } cards, first word of the ayah
// first, ready to render right-to-left.
export function buildWordMealCards(rawWords, translations, surah, ayah) {
  const words = rawWords.filter((w) => !w.t.startsWith(MARKER));
  const cards = [];
  let current = null;

  words.forEach((w, idx) => {
    if (!translations) {
      // No translation data at all (load failed) -- show the bare Arabic
      // words rather than guessing how they'd have merged.
      cards.push({ arabicParts: [w.t], translation: "" });
      current = null;
      return;
    }
    const key = `${surah}:${ayah}:${idx + 1}`;
    const tr = translations[key];
    if (tr !== undefined || !current) {
      current = { arabicParts: [w.t], translation: tr || "" };
      cards.push(current);
    } else {
      current.arabicParts.push(w.t);
    }
  });

  return cards.map((c) => ({ arabic: c.arabicParts.join(" "), translation: c.translation }));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// Cards -> the word-meal body's inner HTML: a right-to-left, wrapping row
// of Arabic-word/Turkish-gloss cards.
export function renderWordMealCardsHTML(cards) {
  if (!cards.length) {
    return `<p class="word-meal-empty">Bu ayet için kelime meali bulunamadı.</p>`;
  }
  const items = cards
    .map(
      (c) => `<span class="wbw-word">
        <span class="wbw-ar">${escapeHtml(c.arabic)}</span>${
          c.translation ? `<span class="wbw-tr">${escapeHtml(c.translation)}</span>` : ""
        }
      </span>`
    )
    .join("");
  return `<div class="wbw-container">${items}</div>`;
}
