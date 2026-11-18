// data-load.js -- veri ve yazı tipi yükleme (data/*.json, HarfBuzz + mushaf yazı tipi) ile sayfa -> sure/cüz/hizb/rub/menzil
// tablolarının kurulması.

import { state } from "./state.js";

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

async function loadHarfBuzzAndFont() {
  const instance = await window.createHarfBuzz();
  const hb = window.hbjs(instance);

  // Font WOFF2 olarak servis ediliyor (ham OTF'e göre ~%86 daha küçük --
  // bkz. vendor/woff2-decompress/), çünkü CSS'teki @font-face bunu
  // tarayıcının kendi motoruyla native çözüyor. HarfBuzz ise WOFF2
  // kapsayıcısını anlamaz, sadece ham sfnt byte'ları kabul eder; bu yüzden
  // burada aynı dosyayı tarayıcıda tekrar OTF'e açıp öyle veriyoruz. Bu
  // dönüşüm kayıpsızdır (WOFF2 aynı tablo verisinin sadece sıkıştırılmış
  // hali olduğu için sonuç, orijinal OTF ile birebir aynı sfnt tablolarını
  // üretir).
  const fontResp = await fetch("fonts/DigitalKhattV2.woff2");
  const compressed = new Uint8Array(await fontResp.arrayBuffer());
  const fontBuf = await window.woff2Decompress(compressed);
  const blob = hb.createBlob(fontBuf);
  const face = hb.createFace(blob, 0);
  const font = hb.createFont(face);

  // natural space glyph width, used as the un-stretched baseline
  const buf = hb.createBuffer();
  buf.addText(" ");
  buf.setDirection("rtl");
  buf.setScript("Arab");
  buf.setLanguage("ar");
  hb.shape(font, buf, "");
  const spaceWidth = buf.json()[0].ax;
  buf.destroy();

  return { hb, font, spaceWidth };
}

// Fills a 1-indexed (index 0 unused) array of length pagesCount+1 where
// arr[page] = which unit (1..count) that page falls in, by walking each
// unit's own starting page forward. Shared by juz/hizb/rub/manzil, which
// all share the exact same { "n": {firstVerseKey, page} } shape.
function buildPageToUnitArray(map, count, pagesCount) {
  const arr = new Array(pagesCount + 1).fill(1);
  for (let n = 1; n <= count; n++) {
    const startPage = map[String(n)] && map[String(n)].page;
    if (!startPage) continue;
    for (let p = startPage; p <= pagesCount; p++) arr[p] = n;
  }
  return arr;
}

function buildPageLookups() {
  const pagesCount = state.mushaf.pagesCount;
  state.pageToSurah = new Array(pagesCount + 1).fill(1);

  for (let s = 1; s <= 114; s++) {
    const startPage = state.surahPages[String(s)];
    if (!startPage) continue;
    for (let p = startPage; p <= pagesCount; p++) state.pageToSurah[p] = s;
  }
  state.pageToJuz = buildPageToUnitArray(state.juz, 30, pagesCount);
  state.pageToHizb = buildPageToUnitArray(state.hizb, 60, pagesCount);
  state.pageToRub = buildPageToUnitArray(state.rub, 240, pagesCount);
  state.pageToManzil = buildPageToUnitArray(state.manzil, 7, pagesCount);

  // flatten data.ayahs (per-surah arrays) into one wordId-sorted list, so a
  // click anywhere on the page can be mapped back to "which ayah is this
  // word part of" with a binary search -- naturally sorted by construction
  // since both surah order (1..114) and ayah order within a surah, and
  // therefore word id, all increase monotonically together.
  const flat = [];
  for (let s = 1; s <= 114; s++) {
    const list = state.ayahs[String(s)];
    if (!list) continue;
    for (let a = 0; a < list.length; a++) {
      flat.push({ wordId: list[a][1], surah: s, ayah: a + 1 });
    }
  }
  state.wordAyahIndex = flat;
}

export { loadJSON, loadHarfBuzzAndFont, buildPageLookups };
