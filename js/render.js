// render.js
//
// Draws a single mushaf page (15 lines) as one SVG element, using HarfBuzz
// (via hbjs) to shape each line and extract each glyph's outline as an SVG
// path, then positioning every glyph by hand -- exactly the technique
// https://digitalkhatt.org/digitalmushaf uses, adapted to plain JS.
//
// Coordinate system: everything is done in the font's own "design units"
// space where 1 em = FONTSIZE (1000) units, matching the DigitalKhatt V2
// font's unitsPerEm exactly. The whole page is one SVG viewBox
// "0 0 PAGE_WIDTH PAGE_HEIGHT" in that same unit space, so it scales
// responsively via CSS with no JS resize handling needed.

import { FONTSIZE, analyzeLineForJust, justifyLine, SpaceType } from "./justify.js";

export const PAGE_WIDTH = 17000;
export const MARGIN = 400;
export const COLUMN_WIDTH = PAGE_WIDTH - 2 * MARGIN;
export const INTERLINE = 1800;
export const TOP_MARGIN = 1700; // room for a full first-line ascender stack
export const BOTTOM_MARGIN = 1100;
// A header box is self-contained (its artwork is already tightly cropped
// and vertically centred), unlike a text baseline which needs headroom for
// ascenders/diacritics above it -- so headers only need a small, even
// clearance from whatever is next to them, not a full text-line gap:
//  - before a header: the same small clearance as a normal trailing margin
//    below the previous line's descenders (BOTTOM_MARGIN).
//  - after a header: the following line is a normal baseline, so it needs
//    the same ascender headroom any first line on a page needs (TOP_MARGIN)
//    -- otherwise its own ascenders/diacritics poke up into the header box.
//  - a header that opens the page (no previous line) just needs that same
//    small clearance from the page's own top edge, not the full TOP_MARGIN
//    (which exists for ascender headroom a header doesn't need).
export const GAP_BEFORE_HEADER = BOTTOM_MARGIN;
export const GAP_AFTER_HEADER = TOP_MARGIN;
export const HEADER_TOP_MARGIN = BOTTOM_MARGIN;

const SVG_NS = "http://www.w3.org/2000/svg";

// ---- Letter units (Ezber -> Yaz mode) --------------------------------
// A "unit" is one base Arabic letter plus every combining mark riding on
// it (tashkeel, Qur'an-specific small high/low annotation marks, etc.) --
// what a person actually thinks of as "one letter" when spelling a word
// out, and the granularity Yaz mode reveals/matches against the virtual
// keyboard one at a time. Ranges match eski-uygulama's own
// ARABIC_LETTER/DIACRITIC split (see its countUnitsInToken) rather than
// Unicode's general Mn ("mark, nonspacing") category: the end-of-ayah
// marker (U+06DD) and the Arabic-Indic digits after it are ALSO outside
// this base-letter range, so they're correctly never treated as units
// either -- no separate exclusion needed for those (see splitIntoUnits'
// caller in renderMushafLine, which additionally skips the marker's own
// word entirely, since it carries no letters to split at all). \u0640
// (tatweel) is folded in as diacritic-like too, despite being a real
// letter-range codepoint: this mushaf spells a "seatless" hamza (one not
// carried by an alef/waw/yeh) on a tatweel instead, and that tatweel+mark
// pair shapes to zero width in practice (confirmed against every
// occurrence in the whole Qur'an -- see test/full_corpus_test.mjs's unit
// count cross-check), so treating it as its own unit would produce an
// empty, unrevealable "letter" no keypress could ever match.
const UNIT_BASE_RE = /[\u0621-\u06D5]/;
const UNIT_DIACRITIC_RE = /[\u0600-\u0605\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/;
function isUnitBaseChar(ch) {
  return UNIT_BASE_RE.test(ch) && !UNIT_DIACRITIC_RE.test(ch);
}

// Splits `text` (one word's own raw mushaf.json string) into units, each
// { startChar, endChar } in the SAME line-relative character coordinate
// space as glyph.cl (startChar = text's own position within the shaped
// line -- see renderMushafLine's caller, which passes each word's real
// startIndex). A run of marks with no base letter before it (shouldn't
// happen in practice -- every word sampled from the real data starts on
// a base letter -- but text is still just data) is folded into the
// first unit rather than silently dropped.
export function splitIntoUnits(text, startChar) {
  const units = [];
  for (let i = 0; i < text.length; i++) {
    if (isUnitBaseChar(text[i]) || units.length === 0) {
      units.push({ startChar: startChar + i, endChar: startChar + i + 1 });
    } else {
      units[units.length - 1].endChar = startChar + i + 1;
    }
  }
  return units;
}

export class LineRenderer {
  constructor(hb, font, spaceWidth, basmallahText) {
    this.hb = hb;
    this.font = font;
    this.scale = 1; // FONTSIZE / font.upem, computed by caller (1 for our font)
    this.spaceWidth = spaceWidth;
    this.basmallahText = basmallahText;
    this.textLayerFont = "sans-serif";
    this.glyphPathCache = new Map();
    this.fontSizeLineWidthRatio = FONTSIZE / COLUMN_WIDTH;
  }

  glyphPath(glyphId) {
    let p = this.glyphPathCache.get(glyphId);
    if (p === undefined) {
      p = this.font.glyphToPath(glyphId);
      this.glyphPathCache.set(glyphId, p);
    }
    return p;
  }

  // Shapes `lineText` with the given absolute-index-scoped features and
  // returns the raw hbjs glyph array (already RTL-shaped).
  shape(lineText, features) {
    const buffer = this.hb.createBuffer();
    buffer.addText(lineText);
    buffer.setDirection("rtl");
    buffer.setScript("Arab");
    buffer.setLanguage("ar");
    buffer.setClusterLevel(1);
    const featureString = (features || [])
      .map((f) => `${f.tag}[${f.start}:${f.end}]=${f.value}`)
      .join(",");
    this.hb.shape(this.font, buffer, featureString);
    const result = buffer.json();
    buffer.destroy();
    return result;
  }

  // Builds an absolute-index feature list from lineTextInfo.features
  // (global, e.g. bism) + a justify() fontFeatures map (per character index).
  buildFeatureList(lineTextInfo, fontFeatures) {
    const features = lineTextInfo.features ? [...lineTextInfo.features] : [];
    if (fontFeatures && fontFeatures.size > 0) {
      for (const wordInfo of lineTextInfo.wordInfos) {
        for (let i = wordInfo.startIndex; i <= wordInfo.endIndex; i++) {
          const feats = fontFeatures.get(i);
          if (feats) {
            for (const feat of feats) {
              features.push({ tag: feat.name, value: feat.value, start: i, end: i + 1 });
            }
          }
        }
      }
    }
    return features;
  }

  // Renders one line of text into an SVG <g>, right-edge-anchored at
  // `rightEdgeX`, baseline at `baselineY`. If `justResult` is given, spacing
  // (kashida features + inter-word gaps) from the justification pass is
  // applied; otherwise the line is drawn at its natural (unstretched) width.
  // Returns { group, width } where width is the natural/stretched width
  // actually drawn (design units).
  //
  // Note: this does NOT draw any ayah-selection highlight -- that's applied
  // afterwards, as a separate overlay positioned from the `segments` this
  // returns (see app.js's updateAyahHighlight). Keeping selection state out
  // of the glyph-drawing pass is what lets the page's SVG (expensive: a
  // HarfBuzz shape + justify + glyph-path pass per line) be built once and
  // reused while the user taps between ayahs/words on it.
  renderLineGroup(lineTextInfo, justResult, rightEdgeX, baselineY, xScale = 1, ayahSegments = null, ayahNumberRanges = null, wordSegmentsInput = null, unitSegmentsInput = null) {
    const fontFeatures = justResult ? justResult.fontFeatures : new Map();
    const features = this.buildFeatureList(lineTextInfo, fontFeatures);
    const result = this.shape(lineTextInfo.lineText, features);

    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("transform", `translate(${rightEdgeX} ${baselineY}) scale(${xScale},-1)`);

    const segBounds = ayahSegments ? ayahSegments.map(() => ({ minX: Infinity, maxX: -Infinity })) : null;
    const wordSegBounds = wordSegmentsInput ? wordSegmentsInput.map(() => ({ minX: Infinity, maxX: -Infinity })) : null;
    const unitSegBounds = unitSegmentsInput ? unitSegmentsInput.map(() => ({ minX: Infinity, maxX: -Infinity })) : null;

    let currentX = 0;
    for (let i = result.length - 1; i >= 0; i--) {
      const glyph = result[i];
      const space = lineTextInfo.spaces.get(glyph.cl);

      const beforeX = currentX;
      if (justResult && space === SpaceType.Aya) {
        currentX -= justResult.ayaSpacing;
      } else if (justResult && space === SpaceType.Simple) {
        currentX -= justResult.simpleSpacing;
      } else if (!justResult && space) {
        currentX -= this.spaceWidth;
      } else {
        currentX -= glyph.ax;
      }

      if (segBounds) {
        for (let si = 0; si < ayahSegments.length; si++) {
          const seg = ayahSegments[si];
          if (glyph.cl >= seg.startChar && glyph.cl < seg.endChar) {
            if (currentX < segBounds[si].minX) segBounds[si].minX = currentX;
            if (beforeX > segBounds[si].maxX) segBounds[si].maxX = beforeX;
            break;
          }
        }
      }
      if (wordSegBounds) {
        for (let wi = 0; wi < wordSegmentsInput.length; wi++) {
          const w = wordSegmentsInput[wi];
          if (glyph.cl >= w.startChar && glyph.cl < w.endChar) {
            if (currentX < wordSegBounds[wi].minX) wordSegBounds[wi].minX = currentX;
            if (beforeX > wordSegBounds[wi].maxX) wordSegBounds[wi].maxX = beforeX;
            break;
          }
        }
      }
      if (unitSegBounds) {
        for (let ui = 0; ui < unitSegmentsInput.length; ui++) {
          const u = unitSegmentsInput[ui];
          if (glyph.cl >= u.startChar && glyph.cl < u.endChar) {
            if (currentX < unitSegBounds[ui].minX) unitSegBounds[ui].minX = currentX;
            if (beforeX > unitSegBounds[ui].maxX) unitSegBounds[ui].maxX = beforeX;
            break;
          }
        }
      }

      const d = this.glyphPath(glyph.g);
      if (d) {
        const path = document.createElementNS(SVG_NS, "path");
        let cls = "glyph-path";
        if (ayahNumberRanges) {
          for (let ri = 0; ri < ayahNumberRanges.length; ri++) {
            const r = ayahNumberRanges[ri];
            if (glyph.cl >= r.start && glyph.cl < r.end) {
              cls += " ayah-num-alt";
              break;
            }
          }
        }
        path.setAttribute("class", cls);
        path.setAttribute("d", d);
        path.setAttribute("transform", `translate(${currentX + glyph.dx} ${glyph.dy})`);
        group.appendChild(path);
      }
    }

    const width = -currentX * xScale;

    let segments = [];
    if (segBounds) {
      segments = ayahSegments
        .map((seg, si) => ({
          surah: seg.surah,
          ayah: seg.ayah,
          xMin: rightEdgeX + xScale * segBounds[si].minX,
          xMax: rightEdgeX + xScale * segBounds[si].maxX,
        }))
        .filter((s) => s.xMax > s.xMin);
    }
    let wordSegments = [];
    if (wordSegBounds) {
      wordSegments = wordSegmentsInput
        .map((w, wi) => ({
          wordId: w.wordId,
          xMin: rightEdgeX + xScale * wordSegBounds[wi].minX,
          xMax: rightEdgeX + xScale * wordSegBounds[wi].maxX,
        }))
        .filter((s) => s.xMax > s.xMin);
    }
    let unitSegments = [];
    if (unitSegBounds) {
      unitSegments = unitSegmentsInput
        .map((u, ui) => ({
          wordId: u.wordId,
          unitIndex: u.unitIndex,
          xMin: rightEdgeX + xScale * unitSegBounds[ui].minX,
          xMax: rightEdgeX + xScale * unitSegBounds[ui].maxX,
        }))
        .filter((s) => s.xMax > s.xMin);
    }

    return { group, width, segments, wordSegments, unitSegments };
  }

  // Natural (un-stretched) width of `text` set in `fontFamily` at
  // `fontSize` viewBox-units-as-px, measured off-DOM via canvas so it can
  // run before the SVG is attached anywhere.
  measureTextWidth(text, fontFamily, fontSize) {
    try {
      if (!this._measureCtx) {
        this._measureCtx = document.createElement("canvas").getContext("2d");
      }
      if (!this._measureCtx) throw new Error("no 2d context");
      this._measureCtx.font = `${fontSize}px ${fontFamily}`;
      return this._measureCtx.measureText(text).width;
    } catch (e) {
      // Canvas text measurement isn't available in every environment
      // (e.g. some test/SSR contexts) -- fall back to a rough per-character
      // estimate so the selectable overlay still gets a sane width instead
      // of throwing. Real browsers always support this, so this path is
      // only exercised outside an actual browser.
      return text.length * fontSize * 0.55;
    }
  }

  // Invisible, real, selectable/copyable text placed exactly over a drawn
  // line so users can long-press / double-tap to select and copy an ayah
  // the normal way, even though the visible glyphs are plain SVG paths
  // with no text semantics (same idea PDF.js uses for its text layer).
  addTextSelectionLayer(pageG, lineText, rightEdgeX, width, baselineY) {
    if (!lineText || width <= 0) return;
    const fontSize = 900;
    const naturalWidth = this.measureTextWidth(lineText, this.textLayerFont, fontSize);
    const scaleX = naturalWidth > 0 ? width / naturalWidth : 1;

    const fo = document.createElementNS(SVG_NS, "foreignObject");
    fo.setAttribute("x", rightEdgeX - width);
    fo.setAttribute("y", baselineY - INTERLINE * 0.72);
    fo.setAttribute("width", width);
    fo.setAttribute("height", INTERLINE);
    fo.setAttribute("class", "text-layer-fo");

    const div = document.createElement("div");
    div.className = "text-layer-line";
    div.style.fontSize = `${fontSize}px`;
    div.style.transform = `scaleX(${scaleX})`;
    div.dir = "rtl";
    div.textContent = lineText;
    fo.appendChild(div);
    pageG.appendChild(fo);
  }

  // Draws a precomputed surah-header glyph (extracted at build time from the
  // QCF_SurahHeader_COLOR font's COLR/CPAL layers -- see tools/build_data.py)
  // as plain coloured SVG paths, full column width with height following
  // proportionally from the glyph's own aspect ratio, centred at `centerY`
  // (both computed by computeHeaderMetrics/the layout pass in renderPage).
  // Tapping it opens the "Sure Bilgisi" info modal for `surahNumber` (see
  // app.js's setupSurahInfoModal/the page click handler in setupNav) -- a
  // previous version had this same tap target, removed along with its
  // Diyanet Kur'an Yolu-sourced content, see README.md; restored here
  // against a different, redistributable source (js/surahinfo.js).
  drawSurahHeader(pageG, headerData, centerY, scale, surahNumber) {
    const [xmin, ymin, xmax, ymax] = headerData.bbox;
    const glyphCenterX = (xmin + xmax) / 2;
    const glyphCenterY = (ymin + ymax) / 2;
    const targetCenterX = PAGE_WIDTH / 2;

    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", "surah-header-hit");
    group.setAttribute("data-surah", surahNumber);
    group.setAttribute(
      "transform",
      `translate(${targetCenterX} ${centerY}) scale(${scale} ${-scale}) translate(${-glyphCenterX} ${-glyphCenterY})`
    );

    // Invisible, full-bbox hit target, UNDER the artwork: the COLR glyph
    // itself is mostly negative space (an ornamental border + calligraphy,
    // not a filled block), so hit-testing the drawn <path>s alone would
    // miss most taps within the header's own visual footprint. A
    // transparent (not `fill: none`, which would opt back OUT of hit
    // testing) rect the glyph's own bbox gives the whole box a uniform,
    // reliable tap target -- same idea as the invisible text-selection
    // layer addTextSelectionLayer draws over a normal text line.
    const hitRect = document.createElementNS(SVG_NS, "rect");
    hitRect.setAttribute("x", xmin);
    hitRect.setAttribute("y", ymin);
    hitRect.setAttribute("width", xmax - xmin);
    hitRect.setAttribute("height", ymax - ymin);
    hitRect.setAttribute("fill", "transparent");
    group.appendChild(hitRect);

    for (const layer of headerData.layers) {
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", layer.d);
      // inline style (not the `fill` attribute) so this can never be
      // overridden by a stylesheet rule like `.mushaf-page-svg .glyph-path`
      // -- these decorative layers keep their own baked-in colours always.
      path.style.fill = layer.fill;
      group.appendChild(path);
    }
    pageG.appendChild(group);
  }

  // Given a header glyph's own bbox, the scale/height it will render at when
  // stretched to the full column width (used both to lay out the page and
  // to actually draw the header at the right size).
  static headerMetrics(headerData) {
    const [xmin, ymin, xmax, ymax] = headerData.bbox;
    const glyphW = xmax - xmin;
    const glyphH = ymax - ymin;
    const scale = glyphW > 0 ? COLUMN_WIDTH / glyphW : 1;
    return { scale, height: glyphH * scale };
  }

  // High level: render a full mushaf line (one entry from mushaf.json) at
  // its precomputed position (from renderPage's layout pass), appending to
  // `pageG`. `pos` is either {baselineY} for text lines or {centerY, scale}
  // for a surah-header line. `wordIdToAyah(wordId) -> {surah,ayah}|null` is
  // used to split the line into per-ayah segments so callers can hit-test
  // clicks against `{surah, ayah, baselineY, xMin, xMax}` later (tapping
  // ayah text on the page to select it) -- and those same segments are what
  // the caller uses to position the ayah-selection highlight, drawn
  // separately (see renderLineGroup's doc comment). `isAltRuku(surah,ayah)
  // -> boolean`, if given, marks which ayah-ending numbers get the
  // alternating-ruku colour (see analyzeLineForJust ayahNumberRanges below).
  renderMushafLine(pageG, line, pos, headerData, wordIdToAyah, isAltRuku) {
    if (line.t === "s") {
      if (headerData) this.drawSurahHeader(pageG, headerData, pos.centerY, pos.scale, line.surah);
      return { ayahSegments: [], wordSegments: [], unitSegments: [] };
    }

    const baselineY = pos.baselineY;
    const lineText = line.t === "b" ? this.basmallahText : line.w.map((w) => w.t).join(" ");
    const isFatihaAyah1 = line.t === "a" && line.w[0] && line.w[0].i === 1;
    const forceBism = line.t === "b" || isFatihaAyah1;
    const lineTextInfo = analyzeLineForJust(lineText, forceBism);

    // group this line's words into consecutive same-ayah runs, in character
    // (not word-array) index terms, ready to hand to renderLineGroup
    let ayahSegments = null;
    if (wordIdToAyah && line.t === "a") {
      const runs = [];
      let cur = null;
      for (let k = 0; k < line.w.length; k++) {
        const sa = wordIdToAyah(line.w[k].i);
        if (!sa) continue;
        if (cur && cur.surah === sa.surah && cur.ayah === sa.ayah) {
          cur.endIdx = k;
        } else {
          if (cur) runs.push(cur);
          cur = { surah: sa.surah, ayah: sa.ayah, startIdx: k, endIdx: k };
        }
      }
      if (cur) runs.push(cur);
      ayahSegments = runs.map((r) => ({
        surah: r.surah,
        ayah: r.ayah,
        startChar: lineTextInfo.wordInfos[r.startIdx].startIndex,
        endChar: lineTextInfo.wordInfos[r.endIdx].endIndex + 1,
      }));
    }

    // Same idea as ayahSegments above, but one run PER WORD instead of
    // merged by ayah -- feeds the recitation word-highlight overlay (see
    // app.js's updateWordHighlight), which needs a single word's own
    // x-range, not its whole ayah's. Kept as a fully separate pass/array
    // (rather than teaching ayahSegments to also expose per-word bounds) so
    // the existing ayah-highlight/tap-to-select path is untouched by this.
    let wordSegmentsInput = null;
    let unitSegmentsInput = null;
    if (line.t === "a") {
      wordSegmentsInput = line.w.map((w, k) => ({
        wordId: w.i,
        startChar: lineTextInfo.wordInfos[k].startIndex,
        endChar: lineTextInfo.wordInfos[k].endIndex + 1,
      }));

      // Ezber -> Yaz mode's letter-by-letter reveal targets (see
      // splitIntoUnits above). The end-of-ayah marker word (its whole
      // text is just "\u06ddN", the ayah number -- see the comment right
      // below) is skipped entirely: it's a structural glyph, not
      // something to spell out, same exclusion wordmeal.js's own
      // MARKER filter applies for the same reason.
      unitSegmentsInput = [];
      line.w.forEach((w, k) => {
        if (w.t.startsWith("\u06dd")) return;
        const info = lineTextInfo.wordInfos[k];
        const units = splitIntoUnits(w.t, info.startIndex);
        units.forEach((u, ui) => unitSegmentsInput.push({ wordId: w.i, unitIndex: ui, startChar: u.startChar, endChar: u.endChar }));
      });
    }

    // Ayah-ending words carry their end-of-ayah marker + number glyph
    // (U+06DD followed by Arabic-Indic digits) appended directly to the
    // last word's text. Find those spans so the alternating-ruku colour
    // (1st ruku of a surah = normal ink, 2nd = alt colour, 3rd = normal...)
    // can be applied to just those glyphs, not the whole word.
    let ayahNumberRanges = null;
    if (wordIdToAyah && isAltRuku && line.t === "a") {
      ayahNumberRanges = [];
      for (let k = 0; k < line.w.length; k++) {
        const wordText = line.w[k].t;
        const markerIdx = wordText.indexOf("\u06dd");
        if (markerIdx === -1) continue;
        const sa = wordIdToAyah(line.w[k].i);
        if (!sa || !isAltRuku(sa.surah, sa.ayah)) continue;
        const wordInfo = lineTextInfo.wordInfos[k];
        ayahNumberRanges.push({ start: wordInfo.startIndex + markerIdx, end: wordInfo.endIndex + 1 });
      }
      if (ayahNumberRanges.length === 0) ayahNumberRanges = null;
    }

    const shouldJustify = line.t === "a" && line.c === false;

    let justResult = null;
    if (shouldJustify) {
      justResult = justifyLine(this.hb, this.font, this.scale, lineTextInfo, this.fontSizeLineWidthRatio, this.spaceWidth);
    }

    let rightEdgeX;
    let width;
    let segments;
    let wordSegments;
    let unitSegments;
    if (shouldJustify) {
      rightEdgeX = PAGE_WIDTH - MARGIN;
      const rendered = this.renderLineGroup(
        lineTextInfo, justResult, rightEdgeX, baselineY, justResult.xScale || 1, ayahSegments, ayahNumberRanges, wordSegmentsInput, unitSegmentsInput
      );
      pageG.appendChild(rendered.group);
      width = rendered.width;
      segments = rendered.segments;
      wordSegments = rendered.wordSegments;
      unitSegments = rendered.unitSegments;
    } else {
      // Centered: measure natural width first (dry run at rightEdgeX=0),
      // then re-render at the centered position.
      const dry = this.renderLineGroup(lineTextInfo, null, 0, baselineY);
      const naturalWidth = dry.width;
      rightEdgeX = MARGIN + (COLUMN_WIDTH + naturalWidth) / 2;
      const rendered = this.renderLineGroup(
        lineTextInfo, null, rightEdgeX, baselineY, 1, ayahSegments, ayahNumberRanges, wordSegmentsInput, unitSegmentsInput
      );
      pageG.appendChild(rendered.group);
      width = rendered.width;
      segments = rendered.segments;
      wordSegments = rendered.wordSegments;
      unitSegments = rendered.unitSegments;
    }

    this.addTextSelectionLayer(pageG, lineText, rightEdgeX, width, baselineY);

    return {
      ayahSegments: segments.map((s) => ({ ...s, baselineY })),
      wordSegments: wordSegments.map((s) => ({ ...s, baselineY })),
      unitSegments: unitSegments.map((s) => ({ ...s, baselineY })),
    };
  }
}

// Computes the vertical position of every line on a page. Text lines get a
// baselineY, INTERLINE apart as usual. A surah-header line gets a small,
// even clearance before/after it instead of a full text-line gap -- see
// the GAP_BEFORE_HEADER/GAP_AFTER_HEADER/HEADER_TOP_MARGIN doc comments
// above -- and is drawn at full column width, so its height follows
// proportionally from its own aspect ratio (usually noticeably taller
// than one text line).
// Needs each header's real bbox up front (from headerDataBySurah) since its
// height depends on it -- that's why app.js fetches header JSON before
// calling renderPage rather than after.
export function computeLayout(pageLines, headerDataBySurah) {
  const positions = [];
  const surahHeaderTopYs = []; // every header's own top edge on this page, in placement order -- see this function's return doc and openWordMeal's cutY calc in app.js for why these need to be exposed separately from `positions` (which renderPage/LineRenderer consume internally to actually draw each line, but never hands back to the caller)
  let cursorY = TOP_MARGIN; // baseline (text) or bottom-edge (header) of the most recently placed line
  let prevWasHeader = false;

  pageLines.forEach((line, i) => {
    if (line.t === "s") {
      const headerData = headerDataBySurah && headerDataBySurah.get(line.surah);
      const { scale, height } = headerData
        ? LineRenderer.headerMetrics(headerData)
        : { scale: 1, height: INTERLINE };
      const topY = i === 0 ? HEADER_TOP_MARGIN : cursorY + GAP_BEFORE_HEADER;
      const centerY = topY + height / 2;
      cursorY = topY + height;
      positions.push({ type: "s", centerY, scale });
      surahHeaderTopYs.push(topY);
    } else {
      cursorY = i === 0 ? cursorY : cursorY + (prevWasHeader ? GAP_AFTER_HEADER : INTERLINE);
      positions.push({ type: line.t, baselineY: cursorY });
    }
    prevWasHeader = line.t === "s";
  });

  return { positions, bottomY: cursorY, surahHeaderTopYs };
}

// Renders a full page (array of line objects from mushaf.json) into a new
// <svg> element and returns it. `headerDataBySurah` is a Map of surah
// number -> parsed data/surah-headers/<n>.json contents for every header
// on this page (app.js fetches these before calling renderPage, since the
// layout pass needs each header's real aspect ratio up front).
// `wordIdToAyah(wordId) -> {surah,ayah}|null`, if given, makes the returned
// `segments` array usable both for tap-to-select hit testing AND for
// positioning the ayah-selection highlight, which callers draw themselves
// into the returned svg's ".ayah-highlight-layer" <g> (see app.js's
// updateAyahHighlight) -- this page render is highlight-state-independent
// on purpose, so it can be built once per page and reused as the user taps
// between ayahs/words on it, instead of re-shaping+re-justifying+
// re-pathing every line on every selection change.
// `isAltRuku(surah,ayah) -> boolean`, if given, colours that ayah's
// end-of-ayah number with the alternating-ruku colour (see renderMushafLine).
// Also returns `surahHeaderTopYs`, the top-edge Y of every surah-header line
// on the page in placement order -- app.js's openWordMeal needs it to keep
// the word-meal panel's page-slice cut from landing inside (or past) a
// header banner when the tapped ayah is a surah's last, see the comment
// there.
export function renderPage(lineRenderer, pageLines, headerDataBySurah, wordIdToAyah, isAltRuku) {
  const { positions, bottomY, surahHeaderTopYs } = computeLayout(pageLines, headerDataBySurah);
  const totalHeight = bottomY + BOTTOM_MARGIN;

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${PAGE_WIDTH} ${totalHeight}`);
  svg.setAttribute("class", "mushaf-page-svg");
  svg.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:xlink", "http://www.w3.org/1999/xlink");

  const pageG = document.createElementNS(SVG_NS, "g");
  svg.appendChild(pageG);

  // Both empty placeholders, always first (so highlights sit behind every
  // glyph and header on the page) -- app.js fills them in: the ayah one per
  // selection (updateAyahHighlight), the word one per recitation-playback
  // position (updateWordHighlight). Word layer sits ABOVE the ayah layer so
  // the actively-recited word reads as a brighter "spotlight" within the
  // softer selected-ayah tint, both still under every glyph.
  const highlightLayer = document.createElementNS(SVG_NS, "g");
  highlightLayer.setAttribute("class", "ayah-highlight-layer");
  pageG.appendChild(highlightLayer);

  const wordHighlightLayer = document.createElementNS(SVG_NS, "g");
  wordHighlightLayer.setAttribute("class", "word-highlight-layer");
  pageG.appendChild(wordHighlightLayer);

  const segments = [];
  const wordSegments = [];
  const unitSegments = [];
  pageLines.forEach((line, i) => {
    const headerData = line.t === "s" && headerDataBySurah ? headerDataBySurah.get(line.surah) : null;
    const lineResult = lineRenderer.renderMushafLine(pageG, line, positions[i], headerData, wordIdToAyah, isAltRuku);
    if (lineResult) {
      segments.push(...lineResult.ayahSegments);
      wordSegments.push(...lineResult.wordSegments);
      unitSegments.push(...lineResult.unitSegments);
    }
  });

  // Ezber -> Oku/Yaz's "hide until revealed" cover rectangles (see
  // app.js's drawEzberCovers) -- appended LAST, unlike the two highlight
  // layers above, so it paints on top of every glyph instead of behind
  // them (a highlight tints text you can still read through it; a cover
  // has to actually hide it). Empty until app.js fills it in, same
  // always-present-placeholder pattern as those two.
  const coverLayer = document.createElementNS(SVG_NS, "g");
  coverLayer.setAttribute("class", "ezber-cover-layer");
  pageG.appendChild(coverLayer);

  return { svg, totalHeight, segments, wordSegments, unitSegments, surahHeaderTopYs };
}
