// meal.js
//
// "Meal" -- the full-ayah Turkish translation, shown as its own section in
// the ayah panel right after "kelime meal" (see app.js's openWordMeal /
// ayahPanelBodyHTML). Source: Elmalılı Muhammed Hamdi Yazır's
// (sadeleştirilmiş/simplified-language) translation.
//
// data/meal.json is a flat { "surah:ayah": {"t": "..."} } map (QUL's
// translation export, one entry per ayah -- 6236 total, full coverage).

const SOURCE_LABEL = "Elmalılı Muhammed Hamdi Yazır";

let cachedData = null;
let dataPromise = null;

export function isMealDataReady() {
  return cachedData !== null;
}

// The resolved translation map, or null if it hasn't finished loading yet.
export function getCachedMealData() {
  return cachedData;
}

// Fetches (once) and caches data/meal.json for the rest of the session --
// repeat calls resolve immediately from the cache.
export function loadMealData() {
  if (cachedData) return Promise.resolve(cachedData);
  if (!dataPromise) {
    dataPromise = fetch("data/meal.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load data/meal.json: ${res.status}`);
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

// A couple of entries in the source data have a trailing NBSP -- trim()
// already strips those along with ordinary whitespace.
export function getMealText(data, surah, ayah) {
  const entry = data && data[`${surah}:${ayah}`];
  return entry && entry.t ? entry.t.trim() : "";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// `text` -> the meal section's inner HTML: the translation itself plus the
// source citation in the bottom-right corner (see .wm-meal-source in
// style.css).
export function renderMealHTML(text) {
  if (!text) {
    return `<p class="wm-meal-empty">Bu ayet için meal bulunamadı.</p>`;
  }
  return `<p class="wm-meal-text">${escapeHtml(text)}</p><p class="wm-meal-source">${escapeHtml(SOURCE_LABEL)}</p>`;
}
