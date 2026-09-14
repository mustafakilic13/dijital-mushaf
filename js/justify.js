// justify.js
//
// Line-fitting / kashida-justification engine for the Digital Khatt New Madina
// mushaf font, so that every "full" line is stretched to exactly fill the
// text column width -- the same way https://digitalkhatt.org/digitalmushaf
// does it.
//
// This is a plain-JS adaptation of the algorithm published by the DigitalKhatt
// project (MIT licensed): https://github.com/DigitalKhatt/digitalkhatt-js
// (apps/site-angular/src/app/components/hbmedina/just.service.ts)
//
// The approach: HarfBuzz shapes text normally to measure it. If a line is
// shorter than the desired column width, we look for specific Arabic letter
// pairs that are eligible to take a "kashida" (calligraphic elongation) and
// turn on the matching OpenType character-variant feature on the font
// (cv01, cv02, ... cv18) for just that character. We keep trying
// progressively more/longer kashidas, in an order tuned for Uthmani
// calligraphy correctness, re-measuring after each trial, until the line
// fills the column -- then spread any remainder across the inter-word
// spaces.

export const FONTSIZE = 1000; // internal "design units per em" used throughout

const SpaceType = { Simple: 1, Aya: 2 };
const AppliedResult = { NoChange: 0, Positive: 1, Overflow: 2, Forbidden: 3 };
const StretchType = {
  Beh: 1,
  FinaAscendant: 2,
  OtherKashidas: 3,
  Kaf: 4,
  SecondKashidaNotSameSubWord: 5,
  SecondKashidaSameSubWord: 6,
};

// ---- Arabic letter classification -----------------------------------------

const rightNoJoinLetters = "آاٱأإدذرزوؤءة";
const dualJoinLetters = "بتثجحخسشصضطظعغفقكلمنهيئى";
const finalAscendant = "آادذٱأإكلهة";
const jhk = "جحخ";

const bases = new Set();
for (const ch of dualJoinLetters) bases.add(ch.charCodeAt(0));
for (const ch of rightNoJoinLetters) bases.add(ch.charCodeAt(0));

// ---- HarfBuzz shaping helpers ----------------------------------------------

// Builds a HarfBuzz feature string like "cv01[3:4]=1,bism[0:-1]=1" from an
// array of {tag,value,start,end}.
function featuresToString(features) {
  if (!features || features.length === 0) return "";
  return features
    .map((f) => `${f.tag}[${f.start}:${f.end}]=${f.value}`)
    .join(",");
}

function shapeRaw(hb, font, text, features) {
  const buffer = hb.createBuffer();
  buffer.addText(text);
  buffer.setDirection("rtl");
  buffer.setScript("Arab");
  buffer.setLanguage("ar");
  buffer.setClusterLevel(1);
  hb.shape(font, buffer, featuresToString(features));
  const result = buffer.json();
  buffer.destroy();
  return result;
}

// Sum of advances (design units, scaled so that upem -> FONTSIZE).
function getWidth(hb, font, text, features, scale) {
  const result = shapeRaw(hb, font, text, features);
  let total = 0;
  for (const g of result) total += g.ax;
  return total * scale;
}

function getWordWidth(hb, font, scale, wordInfo, justResults, pfeatures) {
  const features = pfeatures ? [...pfeatures] : [];
  for (let i = wordInfo.startIndex; i <= wordInfo.endIndex; i++) {
    const feats = justResults.get(i);
    if (feats) {
      for (const feat of feats) {
        features.push({
          tag: feat.name,
          value: feat.value,
          start: i - wordInfo.startIndex,
          end: i - wordInfo.startIndex + 1,
        });
      }
    }
  }
  const result = shapeRaw(hb, font, wordInfo.text, features);
  let total = 0;
  for (const g of result) total += g.ax;
  return total * scale;
}

// ---- Feature bookkeeping ---------------------------------------------------

function mergeFeatures(prevFeatures, newFeatures) {
  let merged = prevFeatures ? prevFeatures.map((x) => Object.assign({}, x)) : [];
  if (newFeatures) {
    for (const nf of newFeatures) {
      const exist = merged.find((p) => p.name === nf.feature.name);
      if (exist) {
        exist.value = nf.calcNewValue
          ? nf.calcNewValue(exist.value, nf.feature.value)
          : nf.feature.value;
      } else {
        merged.push({
          name: nf.feature.name,
          value: nf.calcNewValue ? nf.calcNewValue(undefined, nf.feature.value) : nf.feature.value,
        });
      }
    }
  }
  return merged;
}

function tryApplyFeatures(hb, font, scale, wordIndex, lineTextInfo, justInfo, newFeatures) {
  const layout = justInfo.layoutResults[wordIndex];
  const wordInfo = lineTextInfo.wordInfos[wordIndex];
  const wordNewWidth = getWordWidth(hb, font, scale, wordInfo, newFeatures, lineTextInfo.features);
  const diff = wordNewWidth - layout.parWidth;
  if (wordNewWidth !== layout.parWidth && justInfo.textLineWidth + diff < justInfo.desiredWidth) {
    justInfo.textLineWidth += diff;
    layout.parWidth = wordNewWidth;
    justInfo.fontFeatures = newFeatures;
    return AppliedResult.Positive;
  } else if (diff === 0) {
    return AppliedResult.NoChange;
  }
  return AppliedResult.Overflow;
}

// ---- Word / subword analysis ----------------------------------------------
//
// A "subword" is the portion of a word between two hamza (ء) breaks or right
// -no-join letters -- i.e. a run of letters that could visually connect via a
// kashida stroke.

function matchSubWords(wordInfo, regExprs) {
  const result = { subWordIndexes: [], matches: [] };
  const exprs = Array.isArray(regExprs) ? regExprs : [new RegExp(regExprs, "gdu")];
  for (let subIndex = 0; subIndex < wordInfo.subwords.length; subIndex++) {
    const subWord = wordInfo.subwords[subIndex];
    const subWordMatches = [];
    result.matches.push(subWordMatches);
    for (const re of exprs) {
      const matches = subWord.baseText.matchAll(re);
      for (const m of matches) subWordMatches.push(m);
    }
    if (subWordMatches.length > 0) result.subWordIndexes.push(subIndex);
  }
  return result;
}

// ---- Kashida application ---------------------------------------------------

function applyKashida(ctx, lineTextInfo, justInfo, wordIndex, subWordIndex, firstIdx, secondIdx) {
  const { hb, font, scale } = ctx;
  const wordInfo = lineTextInfo.wordInfos[wordIndex];
  const subWordInfo = wordInfo.subwords[subWordIndex];
  const firstMatchIndex = subWordInfo.baseIndexes[firstIdx];
  const secondMatchIndex = subWordInfo.baseIndexes[secondIdx];
  const firstIndexInLine = wordInfo.startIndex + firstMatchIndex;
  const secondIndexInLine = wordInfo.startIndex + secondMatchIndex;

  const tempResult = new Map(justInfo.fontFeatures);
  const firstPrevFeatures = tempResult.get(firstIndexInLine);
  const secondPrevFeatures = tempResult.get(secondIndexInLine);

  if (secondPrevFeatures?.find((a) => a.name === "cv01")) return AppliedResult.Forbidden;

  const lineText = lineTextInfo.lineText;
  const chark3 = lineText[firstIndexInLine];
  const chark4 = lineText[secondIndexInLine];

  if (chark4 === "ق" && subWordInfo.baseIndexes.at(-1) === secondMatchIndex) {
    return AppliedResult.Forbidden;
  } else if (
    chark3 === "ل" &&
    (chark4 === "ك" || chark4 === "د" || chark4 === "ذ" || chark4 === "ة" ||
      (chark4 === "ه" && subWordInfo.baseIndexes.at(-1) === secondMatchIndex))
  ) {
    return AppliedResult.Forbidden;
  } else if (
    "ئبتثنيى".includes(chark3) &&
    subWordInfo.baseIndexes[0] !== firstMatchIndex &&
    "رز".includes(chark4)
  ) {
    return AppliedResult.Forbidden;
  }

  const secondNewFeatures = [];
  let cv01Value = 0;
  const firstAppliedFeatures = [
    {
      feature: { name: "cv01", value: 1 },
      calcNewValue: (prev, curr) => {
        cv01Value = Math.min((prev || 0) + curr, 6);
        return cv01Value;
      },
    },
  ];

  if ("بتثنيئ".includes(chark3)) {
    firstAppliedFeatures.push({ feature: { name: "cv10", value: 1 } });
  }

  const finalSubWordMatch = subWordInfo.baseIndexes.at(-1) === secondMatchIndex;

  if ("ه".includes(chark3) && "م".includes(chark4) && finalSubWordMatch) {
    firstAppliedFeatures.push({ feature: { name: "cv11", value: 1 } });
    secondNewFeatures.push({ name: "cv11", value: 1 });
  } else if ("بتثنيئ".includes(chark3) && subWordInfo.baseIndexes[0] === firstMatchIndex && jhk.includes(chark4)) {
    firstAppliedFeatures.push({ feature: { name: "cv12", value: 1 } });
    secondNewFeatures.push({ name: "cv12", value: 1 });
  } else if ("م".includes(chark3) && subWordInfo.baseIndexes[0] === firstMatchIndex && jhk.includes(chark4)) {
    firstAppliedFeatures.push({ feature: { name: "cv13", value: 1 } });
    secondNewFeatures.push({ name: "cv13", value: 1 });
  } else if ("فق".includes(chark3) && subWordInfo.baseIndexes[0] === firstMatchIndex && jhk.includes(chark4)) {
    firstAppliedFeatures.push({ feature: { name: "cv14", value: 1 } });
    secondNewFeatures.push({ name: "cv14", value: 1 });
  } else if ("ل".includes(chark3) && subWordInfo.baseIndexes[0] === firstMatchIndex && jhk.includes(chark4)) {
    firstAppliedFeatures.push({ feature: { name: "cv15", value: 1 } });
    secondNewFeatures.push({ name: "cv15", value: 1 });
  } else if (
    "عغ".includes(chark3) &&
    subWordInfo.baseIndexes[0] === firstMatchIndex &&
    ("آادذٱأإل".includes(chark4) || ("بتثنيئ".includes(chark4) && "سش".includes(subWordInfo.baseText?.[2])))
  ) {
    firstAppliedFeatures.push({ feature: { name: "cv16", value: 1 } });
    secondNewFeatures.push({ name: "cv16", value: 1 });
  } else if (jhk.includes(chark3)) {
    if (
      "آادذٱأإل".includes(chark4) ||
      ("هة".includes(chark4) && finalSubWordMatch) ||
      ("بتثنيئ".includes(chark4) &&
        subWordInfo.baseIndexes.at(-2) === secondMatchIndex &&
        "رزن".includes(subWordInfo.baseText.at(-1)))
    ) {
      firstAppliedFeatures.push({ feature: { name: "cv16", value: 1 } });
      secondNewFeatures.push({ name: "cv16", value: 1 });
    } else if (subWordInfo.baseIndexes[0] === firstMatchIndex && "م".includes(chark4)) {
      firstAppliedFeatures.push({ feature: { name: "cv18", value: 1 } });
      secondNewFeatures.push({ name: "cv18", value: 1 });
    }
  } else if ("سشصض".includes(chark3) && "رز".includes(chark4)) {
    firstAppliedFeatures.push({ feature: { name: "cv17", value: 1 } });
    secondNewFeatures.push({ name: "cv17", value: 1 });
  }

  const firstNewFeatures = mergeFeatures(firstPrevFeatures, firstAppliedFeatures);

  let cv02Value;
  if (finalAscendant.includes(chark4) && finalSubWordMatch) {
    cv02Value = cv01Value;
  } else {
    cv02Value = 2 * cv01Value;
  }
  secondNewFeatures.push({ name: "cv02", value: cv02Value });

  tempResult.set(firstIndexInLine, firstNewFeatures);
  tempResult.set(secondIndexInLine, secondNewFeatures);

  return tryApplyFeatures(hb, font, scale, wordIndex, lineTextInfo, justInfo, tempResult);
}

function applyKaf(ctx, lineTextInfo, justInfo, wordIndex, subWordIndex, firstIdx, secondIdx) {
  const { hb, font, scale } = ctx;
  const wordInfo = lineTextInfo.wordInfos[wordIndex];
  const subWordInfo = wordInfo.subwords[subWordIndex];
  const firstMatchIndex = subWordInfo.baseIndexes[firstIdx];
  const secondMatchIndex = subWordInfo.baseIndexes[secondIdx];
  const firstIndexInLine = wordInfo.startIndex + firstMatchIndex;
  const secondIndexInLine = wordInfo.startIndex + secondMatchIndex;

  const tempResult = new Map(justInfo.fontFeatures);
  const firstPrevFeatures = tempResult.get(firstIndexInLine);
  const secondPrevFeatures = tempResult.get(secondIndexInLine);

  tempResult.set(
    firstIndexInLine,
    mergeFeatures(firstPrevFeatures, [{ feature: { name: "cv03", value: 1 }, calcNewValue: () => 1 }])
  );
  const firstNewFeatures = mergeFeatures(secondPrevFeatures, [
    { feature: { name: "cv03", value: 1 }, calcNewValue: () => 1 },
  ]);
  tempResult.set(secondIndexInLine, firstNewFeatures);

  const lineText = lineTextInfo.lineText;
  let fathaIndex;
  if (lineText[firstIndexInLine + 1] === "\u064E") {
    fathaIndex = firstIndexInLine + 1;
  } else if (lineText[firstIndexInLine + 1] === "\u0651" && lineText[firstIndexInLine + 2] === "\u064E") {
    fathaIndex = firstIndexInLine + 2;
  }
  if (fathaIndex !== undefined) {
    const cv01Value = firstNewFeatures.find((a) => a.name === "cv01")?.value || 0;
    tempResult.set(fathaIndex, [{ name: "cv01", value: 1 + Math.floor(cv01Value / 3) }]);
  }

  return tryApplyFeatures(hb, font, scale, wordIndex, lineTextInfo, justInfo, tempResult);
}

function applyKashidasSubWords(ctx, lineTextInfo, justInfo, type, nbLevels) {
  const right = "بتثنيئ" + jhk + "سش" + "صض" + "طظ" + "عغ" + "فق" + "م" + "ه";
  const left = "ئبتثني" + jhk + "طظ" + "عغ" + "فق" + "ةلم" + "رز";
  const mediLeftAsendant = "ل";

  const wordInfos = lineTextInfo.wordInfos;
  const matchresult = [];
  const regExprs = [];

  if (type === StretchType.Beh) {
    regExprs.push(new RegExp(`^.+(?<k1>[بتثنيسشصض][بتثنيم]).+$`, "gdu"));
  } else if (type === StretchType.FinaAscendant) {
    regExprs.push(new RegExp(`^.*(?<k1>[${right}][آادذٱأإكلهة])$`, "gdu"));
  } else if (type === StretchType.OtherKashidas) {
    regExprs.push(new RegExp(`.*(?<k1>[${right}][رز])`, "gdu"));
    regExprs.push(new RegExp(`.*(?<k1>[${right}](?:[${mediLeftAsendant}]|[${left.replace("رز", "")}]))`, "gdu"));
  } else if (type === StretchType.Kaf) {
    regExprs.push(new RegExp(`^.*(?<k1>[ك].).*$`, "gdu"));
  } else if (type === StretchType.SecondKashidaNotSameSubWord) {
    regExprs.push(new RegExp(`^.+(?<k1>[بتثنيسشصض][بتثنيم]).+$`, "gdu"));
    regExprs.push(new RegExp(`^.*(?<k1>[${right}][آادذٱأإكلهة])$`, "gdu"));
    regExprs.push(new RegExp(`.*(?<k1>[${right}][رز])`, "gdu"));
    regExprs.push(new RegExp(`.*(?<k1>[${right}](?:[${mediLeftAsendant}]|[${left.replace("رز", "")}]))`, "gdu"));
  } else if (type === StretchType.SecondKashidaSameSubWord) {
    regExprs.push(new RegExp(`^.+(?<k1>[بتثنيسشصض][بتثنيم]).+$`, "gdu"));
    regExprs.push(new RegExp(`(?<k1>[${right}][آادذٱأإكلهة])$`, "gdu"));
    regExprs.push(new RegExp(`(?<k1>[${right}][رز])`, "gdu"));
    regExprs.push(new RegExp(`(?<k1>[${right}](?:[${mediLeftAsendant}]|[${left.replace("رز", "")}]))`, "gdu"));
  }

  for (let wordIndex = 0; wordIndex < wordInfos.length; wordIndex++) {
    matchresult.push(matchSubWords(wordInfos[wordIndex], regExprs));
  }

  for (let level = 1; level <= nbLevels; level++) {
    for (let wordIndex = 0; wordIndex < wordInfos.length; wordIndex++) {
      const subWordsMatch = matchresult[wordIndex];
      const wordLayout = justInfo.layoutResults[wordIndex];

      const type1Applied = wordLayout.appliedKashidas.get(StretchType.Beh);
      const type2Applied = wordLayout.appliedKashidas.get(StretchType.FinaAscendant);
      const type3Applied = wordLayout.appliedKashidas.get(StretchType.OtherKashidas);
      const type5Applied = wordLayout.appliedKashidas.get(StretchType.SecondKashidaNotSameSubWord);

      if (type === StretchType.Beh && (type2Applied || type3Applied)) continue;
      if (type === StretchType.FinaAscendant && (type1Applied || type3Applied)) continue;
      if (type === StretchType.OtherKashidas && (type1Applied || type2Applied)) continue;

      let done = false;
      for (let i = subWordsMatch.subWordIndexes.length - 1; i >= 0 && !done; i--) {
        const subWordIndex = subWordsMatch.subWordIndexes[i];
        for (const match of subWordsMatch.matches[subWordIndex]) {
          const kashidaGroup = match?.indices?.[1];
          if (!kashidaGroup) continue;

          const firstSubWordMatchIndex = kashidaGroup[0];
          const secondSubWordMacthIndex = firstSubWordMatchIndex + 1;

          if (type === StretchType.SecondKashidaNotSameSubWord) {
            const type123 = type1Applied || type2Applied || type3Applied;
            if (type123 && type123[0] === subWordIndex) continue;
          } else if (type === StretchType.SecondKashidaSameSubWord) {
            const type123 = type1Applied || type2Applied || type3Applied;
            if (type123 && type123[0] === subWordIndex && type123[1] === firstSubWordMatchIndex) continue;
            if (type5Applied && type5Applied[0] === subWordIndex && type5Applied[1] === firstSubWordMatchIndex) continue;
          }

          let appliedResult = AppliedResult.Forbidden;
          if (type === StretchType.Kaf) {
            appliedResult = applyKaf(ctx, lineTextInfo, justInfo, wordIndex, subWordIndex, firstSubWordMatchIndex, secondSubWordMacthIndex);
          } else {
            appliedResult = applyKashida(ctx, lineTextInfo, justInfo, wordIndex, subWordIndex, firstSubWordMatchIndex, secondSubWordMacthIndex);
          }

          if (appliedResult === AppliedResult.Positive) {
            wordLayout.appliedKashidas.set(type, [subWordIndex, firstSubWordMatchIndex]);
          } else if (appliedResult === AppliedResult.Overflow) {
            return true;
          } else if (appliedResult === AppliedResult.Forbidden) {
            continue;
          }
          done = true;
          break;
        }
      }
    }
  }
  return false;
}

function applyAlternate(ctx, lineTextInfo, justInfo, wordIndex, indexInLine) {
  const { hb, font, scale } = ctx;
  const lineText = lineTextInfo.lineText;
  const tempResult = new Map(justInfo.fontFeatures);
  const prevFeatures = tempResult.get(indexInLine);

  const cv01Value = prevFeatures?.find((a) => a.name === "cv02")?.value || 0;
  if (cv01Value > 0) return AppliedResult.Forbidden;

  const newFeatures = mergeFeatures(prevFeatures, [
    { feature: { name: "cv01", value: 1 }, calcNewValue: (prev, curr) => Math.min((prev || 0) + curr, 12) },
  ]);
  tempResult.set(indexInLine, newFeatures);

  let fathaIndex;
  if (lineText[indexInLine + 1] === "\u064E") {
    fathaIndex = indexInLine + 1;
  } else if (lineText[indexInLine + 1] === "\u0651" && lineText[indexInLine + 2] === "\u064E") {
    fathaIndex = indexInLine + 2;
  }
  if (fathaIndex !== undefined) {
    const cv01FathaValue = newFeatures.find((a) => a.name === "cv01")?.value || 0;
    tempResult.set(fathaIndex, [{ name: "cv01", value: 1 + Math.floor(cv01FathaValue / 3) }]);
  }

  return tryApplyFeatures(hb, font, scale, wordIndex, lineTextInfo, justInfo, tempResult);
}

function applyAlternatesSubWords(ctx, lineTextInfo, justInfo, chars, nbLevels) {
  const wordInfos = lineTextInfo.wordInfos;
  const matchresult = [];
  const regExprAlt = [new RegExp(`^.*(?<alt>[${chars}])$`, "gdu")];

  for (let wordIndex = 0; wordIndex < wordInfos.length; wordIndex++) {
    matchresult.push(matchSubWords(wordInfos[wordIndex], regExprAlt));
  }

  for (let level = 1; level <= nbLevels; level++) {
    for (let wordIndex = 0; wordIndex < wordInfos.length; wordIndex++) {
      const wordInfo = wordInfos[wordIndex];
      const subWordsMatch = matchresult[wordIndex];
      for (let i = subWordsMatch.subWordIndexes.length - 1; i >= 0; i--) {
        const subWordIndex = subWordsMatch.subWordIndexes[i];
        const alt = subWordsMatch.matches[subWordIndex][0]?.indices?.[1];
        if (!alt) continue;
        const matchIndex = alt[0];
        const indexInLine = wordInfo.startIndex + wordInfo.subwords[subWordIndex].baseIndexes[matchIndex];
        const appliedResult = applyAlternate(ctx, lineTextInfo, justInfo, wordIndex, indexInLine);
        if (appliedResult === AppliedResult.Overflow) {
          return true;
        } else if (appliedResult === AppliedResult.Forbidden) {
          continue;
        } else {
          break;
        }
      }
    }
  }
  return false;
}

function applyExperimentalJust(ctx, lineTextInfo, justInfo) {
  applyKashidasSubWords(ctx, lineTextInfo, justInfo, StretchType.Beh, 2) ||
    applyAlternatesSubWords(ctx, lineTextInfo, justInfo, "بتثكن", 2) ||
    applyKashidasSubWords(ctx, lineTextInfo, justInfo, StretchType.FinaAscendant, 3) ||
    applyKashidasSubWords(ctx, lineTextInfo, justInfo, StretchType.OtherKashidas, 2) ||
    applyAlternatesSubWords(ctx, lineTextInfo, justInfo, "ىصضسشفقيئ", 2) ||
    applyKashidasSubWords(ctx, lineTextInfo, justInfo, StretchType.Kaf, 1) ||
    applyKashidasSubWords(ctx, lineTextInfo, justInfo, StretchType.Beh, 1) ||
    applyAlternatesSubWords(ctx, lineTextInfo, justInfo, "بتثكن", 1) ||
    applyKashidasSubWords(ctx, lineTextInfo, justInfo, StretchType.FinaAscendant, 1) ||
    applyKashidasSubWords(ctx, lineTextInfo, justInfo, StretchType.OtherKashidas, 1) ||
    applyAlternatesSubWords(ctx, lineTextInfo, justInfo, "ىصضسشفقيئ", 1) ||
    applyAlternatesSubWords(ctx, lineTextInfo, justInfo, "بتثكن", 2) ||
    applyAlternatesSubWords(ctx, lineTextInfo, justInfo, "ىصضسشفقيئبتثكن", 2) ||
    applyKashidasSubWords(ctx, lineTextInfo, justInfo, StretchType.Beh, 1) ||
    applyKashidasSubWords(ctx, lineTextInfo, justInfo, StretchType.FinaAscendant, 1) ||
    applyKashidasSubWords(ctx, lineTextInfo, justInfo, StretchType.OtherKashidas, 1) ||
    applyAlternatesSubWords(ctx, lineTextInfo, justInfo, "ىصضسشفقيئبتثكن", 2) ||
    applyKashidasSubWords(ctx, lineTextInfo, justInfo, StretchType.SecondKashidaNotSameSubWord, 2) ||
    applyKashidasSubWords(ctx, lineTextInfo, justInfo, StretchType.SecondKashidaSameSubWord, 2);
}

// ---- Line analysis (build word/subword structure from line text) ---------

// Builds the same structure as the reference's analyzeLineForJust, but takes
// plain line text directly (we already have it assembled from our word
// list) plus whether the 'bism' feature should be forced on for this line
// (the Bismillah phrase itself -- either a decorative basmallah line, or
// Al-Fatihah 1:1 which is a real ayah but still uses Bismillah letterforms).
export function analyzeLineForJust(lineText, forceBism) {
  const lineTextInfo = {
    lineText,
    ayaSpaceIndexes: [],
    simpleSpaceIndexes: [],
    wordInfos: [],
    spaces: new Map(),
    features: forceBism ? [{ tag: "bism", value: 1, start: 0, end: -1 }] : null,
  };

  let currentWord = { text: "", startIndex: 0, endIndex: -1, baseText: "", baseIndexes: [], subwords: [{ baseText: "", baseIndexes: [] }] };
  lineTextInfo.wordInfos.push(currentWord);

  for (let i = 0; i < lineText.length; i++) {
    const char = lineText.charAt(i);
    if (char === " ") {
      if (
        (lineText.charCodeAt(i - 1) >= 0x0660 && lineText.charCodeAt(i - 1) <= 0x0669) ||
        lineText.charCodeAt(i + 1) === 0x06dd
      ) {
        lineTextInfo.ayaSpaceIndexes.push(i);
        lineTextInfo.spaces.set(i, SpaceType.Aya);
      } else {
        lineTextInfo.simpleSpaceIndexes.push(i);
        lineTextInfo.spaces.set(i, SpaceType.Simple);
      }
      currentWord = { text: "", startIndex: i + 1, endIndex: i, baseText: "", baseIndexes: [], subwords: [{ baseText: "", baseIndexes: [] }] };
      lineTextInfo.wordInfos.push(currentWord);
    } else {
      currentWord.text += char;
      if (bases.has(char.charCodeAt(0))) {
        currentWord.baseText += char;
        currentWord.baseIndexes.push(i - currentWord.startIndex);
        let isHamza = false;
        if (char === "ء") {
          currentWord.subwords.push({ baseText: "", baseIndexes: [] });
          isHamza = true;
        }
        const subWord = currentWord.subwords.at(-1);
        subWord.baseText += char;
        subWord.baseIndexes.push(i - currentWord.startIndex);
        if (i < lineText.length - 1 && rightNoJoinLetters.includes(char) && !isHamza) {
          currentWord.subwords.push({ baseText: "", baseIndexes: [] });
        }
      }
      currentWord.endIndex++;
    }
  }
  return lineTextInfo;
}

// ---- Top level: justifyLine ------------------------------------------------
//
// hb: the hbjs instance
// font: an hbjs font object (already loaded with DigitalKhattV2.otf)
// lineTextInfo: from analyzeLineForJust()
// fontSizeLineWidthRatio: FONTSIZE-space-per-pixel ratio the caller wants
//   (see render.js -- normally FONTSIZE / (pixelColumnWidth / pixelFontSize))
// spaceWidth: natural width (in FONTSIZE units) of a single space glyph
export function justifyLine(hb, font, scale, lineTextInfo, fontSizeLineWidthRatio, spaceWidth) {
  const ctx = { hb, font, scale };
  const desiredWidth = FONTSIZE / fontSizeLineWidthRatio;
  const lineText = lineTextInfo.lineText;

  const layOutResult = [];
  for (const wordInfo of lineTextInfo.wordInfos) {
    const parWidth = getWidth(hb, font, wordInfo.text, lineTextInfo.features, scale);
    layOutResult.push({ parWidth, appliedKashidas: new Map() });
  }

  let currentLineWidth = getWidth(hb, font, lineText, lineTextInfo.features, scale);

  const diff = desiredWidth - currentLineWidth;

  let xScale = 1;
  let simpleSpacing = spaceWidth;
  let ayaSpacing = spaceWidth;
  let fontFeatures = new Map();

  if (diff > 0) {
    // needs stretching
    const maxStretchBySpace = Math.min(100, spaceWidth * 1);
    const maxStretchByAyaSpace = Math.min(200, spaceWidth * 2);
    const maxStretch =
      maxStretchBySpace * lineTextInfo.simpleSpaceIndexes.length +
      maxStretchByAyaSpace * lineTextInfo.ayaSpaceIndexes.length;

    const stretch = Math.min(desiredWidth - currentLineWidth, maxStretch);
    const spaceRatio = maxStretch !== 0 ? stretch / maxStretch : 0;
    const stretchBySpace = spaceRatio * maxStretchBySpace;
    const stretchByAyaSpace = spaceRatio * maxStretchByAyaSpace;

    let simpleSpaceWidth = spaceWidth + stretchBySpace;
    let ayaSpaceWidth = spaceWidth + stretchByAyaSpace;

    currentLineWidth += stretch;

    if (desiredWidth > currentLineWidth) {
      const justInfo = {
        textLineWidth: currentLineWidth,
        fontFeatures: new Map(),
        layoutResults: layOutResult,
        desiredWidth,
        font,
      };
      applyExperimentalJust(ctx, lineTextInfo, justInfo);
      currentLineWidth = justInfo.textLineWidth;
      fontFeatures = justInfo.fontFeatures;
    }

    if (desiredWidth > currentLineWidth && lineTextInfo.spaces.size > 0) {
      const addToSpace = (desiredWidth - currentLineWidth) / lineTextInfo.spaces.size;
      simpleSpaceWidth += addToSpace;
      ayaSpaceWidth += addToSpace;
    }

    simpleSpacing = simpleSpaceWidth;
    ayaSpacing = ayaSpaceWidth;
  } else {
    // Line's natural (pre-kashida) width already exceeds the column.
    // Confirmed against digitalkhatt.org itself (e.g. page 566, line 15):
    // this happens on ~1/3 of all lines and is an expected property of
    // this font+layout pairing, not a bug -- kashida can only add width,
    // so these lines fall back to a uniform horizontal shrink.
    xScale = currentLineWidth > 0 ? desiredWidth / currentLineWidth : 1;
  }

  return { fontFeatures, simpleSpacing, ayaSpacing, xScale };
}

export { SpaceType };
