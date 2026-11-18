// lookup.js -- salt okunur sorgular: bir ayet/kelime/sayfa için cüz, hizb, rub, menzil, sure ve sayfa bulma (state'teki tablolardan).
// DOM'a dokunmaz.

import { state } from "./state.js";

// data/juz.json (and hizb/rub/manzil.json, same shape) only maps each unit
// to its starting PAGE, but a mushaf page can itself straddle two units (a
// juz/hizb/rub/manzil doesn't always begin exactly at the top line of a
// page) -- so "which unit is this PAGE in" and "which unit is this AYAH in"
// can disagree right at a boundary. This resolves it from the ayah itself,
// walking unit 1..count's firstVerseKey (which increases monotonically
// through the Qur'an for all four) and stopping at the last one that starts
// at or before {surah,ayah}.
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
function juzForAyah(surah, ayah) { return unitForAyah(state.juz, 30, surah, ayah); }
function hizbForAyah(surah, ayah) { return unitForAyah(state.hizb, 60, surah, ayah); }
function rubForAyah(surah, ayah) { return unitForAyah(state.rub, 240, surah, ayah); }
function manzilForAyah(surah, ayah) { return unitForAyah(state.manzil, 7, surah, ayah); }

// Single source of truth for "which juz/hizb/rub/menzil is currently being
// read", used by both the topbar's indicators and the Cüz modal's opening
// highlight so they always agree: the SELECTED ayah's unit when there is
// one, falling back to the page's unit only before any ayah has been
// selected yet.
function currentUnitNumber(unitForAyahFn, pageToUnitArr) {
  if (state.selectedAyah) return unitForAyahFn(state.selectedAyah.surah, state.selectedAyah.ayah);
  return pageToUnitArr[state.currentPage];
}
function currentJuzNumber() { return currentUnitNumber(juzForAyah, state.pageToJuz); }
function currentHizbNumber() { return currentUnitNumber(hizbForAyah, state.pageToHizb); }
function currentRubNumber() { return currentUnitNumber(rubForAyah, state.pageToRub); }
function currentManzilNumber() { return currentUnitNumber(manzilForAyah, state.pageToManzil); }

// {surah,ayah} the given global word id belongs to, or null.
function wordIdToAyah(wordId) {
  const flat = state.wordAyahIndex;
  let lo = 0;
  let hi = flat.length - 1;
  let ans = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (flat[mid].wordId <= wordId) {
      ans = flat[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans ? { surah: ans.surah, ayah: ans.ayah } : null;
}

function surahLabel(surahNumber) {
  const info = state.surahs[String(surahNumber)];
  return info ? `${surahNumber}. ${info.nameArabic}` : `${surahNumber}`;
}

// [page, firstWordId, lastWordId] for a given ayah, or null if unknown.
function ayahBounds(surah, ayah) {
  const list = state.ayahs[String(surah)];
  return list ? list[ayah - 1] || null : null;
}
function ayahWordRange(surah, ayah) {
  const b = ayahBounds(surah, ayah);
  return b ? { firstWordId: b[1], lastWordId: b[2] } : null;
}
function ayahPage(surah, ayah) {
  const b = ayahBounds(surah, ayah);
  return b ? b[0] : null;
}
function pageFirstAyah(pageNumber) {
  const a = state.pageFirstAyah[String(pageNumber)];
  return a ? { surah: a[0], ayah: a[1] } : { surah: state.pageToSurah[pageNumber] || 1, ayah: 1 };
}

// Whether `ayah`'s ruku (within `surah`) should get the alternate ayah-number
// colour: the 1st, 3rd, 5th... ruku of a surah keeps the normal ink colour,
// the 2nd, 4th, 6th... gets the alternate -- see data/ruku.json (built from
// quran-metadata-ruku.json), a per-surah list of [startAyah, surahRukuNumber]
// pairs marking where each new ruku begins.
function isAltRuku(surah, ayah) {
  const boundaries = state.ruku && state.ruku[String(surah)];
  if (!boundaries || !boundaries.length) return false;
  // boundaries are sorted by startAyah -- find the last one whose startAyah
  // is <= ayah (binary search since some surahs have 40+ rukus)
  let lo = 0;
  let hi = boundaries.length - 1;
  let rukuNumber = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (boundaries[mid][0] <= ayah) {
      rukuNumber = boundaries[mid][1];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return rukuNumber % 2 === 0;
}

export {
  currentJuzNumber,
  currentHizbNumber,
  currentRubNumber,
  currentManzilNumber,
  wordIdToAyah,
  surahLabel,
  ayahBounds,
  ayahWordRange,
  ayahPage,
  pageFirstAyah,
  isAltRuku,
};
