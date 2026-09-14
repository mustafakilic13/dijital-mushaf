// Logic tests for the recitation playback engine (nextAyahRef, wordIdAtTime,
// recitationAudioUrl) against the real data files. Pure Node, no deps.
// Run: node recitation_playback_test.mjs
//
// Re-implements (verbatim) the pure-logic functions from js/app.js -- see
// juz_subdivisions_test.mjs's header comment for why (can't import app.js
// itself here: it's a browser module with DOM/Audio/fetch dependencies).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, "..", "data");

function loadJSON(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf-8"));
}

const RECITERS = {
  husary: { cdnSlug: "husaryMujawwad", introLocal: "audio/euzuhusari.mp3", dataFile: "recitation-husary-mujawwad.json" },
  abdulsamad: {
    cdnSlug: "abdulBasitMujawwad",
    introLocal: "audio/euzuabdulsamad.mp3",
    dataFile: "recitation-abdulsamad-mujawwad.json",
  },
};

function recitationAudioUrl(surah, ayah, reciter = "husary") {
  const pad3 = (n) => String(n).padStart(3, "0");
  return `https://audio-cdn.tarteel.ai/quran/${RECITERS[reciter].cdnSlug}/${pad3(surah)}${pad3(ayah)}.mp3`;
}

function introAudioFor(surah, ayah, reciter = "husary") {
  if (ayah !== 1) return null;
  if (surah === 1) return RECITERS[reciter].introLocal;
  if (surah === 9) return null;
  return recitationAudioUrl(1, 1, reciter);
}

function nextAyahRef(surahs, surah, ayah) {
  const versesCount = surahs[String(surah)] && surahs[String(surah)].versesCount;
  if (versesCount && ayah < versesCount) return { surah, ayah: ayah + 1 };
  if (surah < 114) return { surah: surah + 1, ayah: 1 };
  return null;
}

function ayahBounds(ayahs, surah, ayah) {
  const list = ayahs[String(surah)];
  return list ? list[ayah - 1] || null : null;
}

function wordIdAtTime(ayahs, surah, ayah, segments, currentTimeMs) {
  const bounds = ayahBounds(ayahs, surah, ayah);
  if (!bounds) return null;
  const [, firstWordId, lastWordId] = bounds;
  let pos = null;
  for (const seg of segments) {
    if (currentTimeMs >= seg[1] && currentTimeMs < seg[2]) {
      pos = seg[0];
      break;
    }
  }
  if (pos == null) return null;
  const wordId = firstWordId + (pos - 1);
  return wordId <= lastWordId ? wordId : null;
}

let failures = 0;
function check(label, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${label}`);
  }
}

function main() {
  const surahs = loadJSON("surahs.json");
  const ayahs = loadJSON("ayahs.json");
  const recitationByReciter = {};
  for (const reciter of Object.keys(RECITERS)) {
    recitationByReciter[reciter] = loadJSON(RECITERS[reciter].dataFile);
  }

  // 1) nextAyahRef, walked from 1:1, must visit exactly the 6236 ayahs in
  //    data/ayahs.json, in order, then return null right after 114:6 --
  //    not before, not looping, not skipping/duplicating any.
  let cur = { surah: 1, ayah: 1 };
  let count = 0;
  const seen = new Set();
  let orderOk = true;
  while (cur && count < 7000) {
    const key = `${cur.surah}:${cur.ayah}`;
    if (seen.has(key)) {
      orderOk = false;
      break;
    }
    seen.add(key);
    count++;
    cur = nextAyahRef(surahs, cur.surah, cur.ayah);
  }
  check("nextAyahRef walk terminates (no infinite loop)", count < 7000);
  check("nextAyahRef walk has no repeats", orderOk);
  check("nextAyahRef walk visits exactly 6236 ayahs", count === 6236);
  check("nextAyahRef walk ends with null (stops, doesn't loop) right after 114:6", cur === null);

  // 1b) introAudioFor: isti'adha before 1:1, besmele before every OTHER
  //     surah's ayah 1 except sure 9 (Tevbe), nothing before any non-first
  //     ayah. Checked across every surah, not just the 3 special-cased ones,
  //     and for both reciters (each has its own local isti'adha file).
  for (const reciter of Object.keys(RECITERS)) {
    const introLocal = RECITERS[reciter].introLocal;
    check(`introAudioFor(1,1,"${reciter}") is that reciter's local isti'adha clip`, introAudioFor(1, 1, reciter) === introLocal);
    check(`introAudioFor(9,1,"${reciter}") is null (Tevbe has no besmele)`, introAudioFor(9, 1, reciter) === null);
    let introOk = true;
    for (let s = 1; s <= 114; s++) {
      const got = introAudioFor(s, 1, reciter);
      const expected = s === 1 ? introLocal : s === 9 ? null : recitationAudioUrl(1, 1, reciter);
      if (got !== expected) {
        introOk = false;
        console.error(`FAIL: introAudioFor(${s},1,"${reciter}") = ${got}, expected ${expected}`);
      }
      const versesCount = surahs[String(s)].versesCount;
      if (versesCount > 1 && introAudioFor(s, 2, reciter) !== null) {
        introOk = false;
        console.error(`FAIL: introAudioFor(${s},2,"${reciter}") should be null (not ayah 1)`);
      }
    }
    check(`introAudioFor correct for ayah-1 of all 114 surahs + a non-first ayah of each ("${reciter}")`, introOk);
  }

  // cross-check every single step against ayahs.json's own surah/versesCount
  // shape (walk again, this time verifying against real bounds data)
  let walkOk = true;
  cur = { surah: 1, ayah: 1 };
  let steps = 0;
  while (cur) {
    if (!ayahBounds(ayahs, cur.surah, cur.ayah)) {
      walkOk = false;
      console.error(`FAIL: nextAyahRef walk stepped onto ${cur.surah}:${cur.ayah}, not in ayahs.json`);
      break;
    }
    steps++;
    cur = nextAyahRef(surahs, cur.surah, cur.ayah);
  }
  check("every ayah nextAyahRef walks onto exists in ayahs.json", walkOk);
  check("that walk also covers all 6236", steps === 6236);

  // 2) recitationAudioUrl format sanity (the real byte-for-byte match
  //    against every one of QUL's 6236 audio_urls was already done in
  //    Python when each data/recitation-*.json was built -- see
  //    tools/build_recitation.py's url_mismatches check, which aborted
  //    the build if even one didn't fit; this just re-confirms the
  //    JS-side template string matches that same pattern, per reciter).
  check(
    "recitationAudioUrl(1,1,\"husary\")",
    recitationAudioUrl(1, 1, "husary") === "https://audio-cdn.tarteel.ai/quran/husaryMujawwad/001001.mp3"
  );
  check(
    "recitationAudioUrl(114,6,\"husary\")",
    recitationAudioUrl(114, 6, "husary") === "https://audio-cdn.tarteel.ai/quran/husaryMujawwad/114006.mp3"
  );
  check(
    "recitationAudioUrl(1,1,\"abdulsamad\")",
    recitationAudioUrl(1, 1, "abdulsamad") === "https://audio-cdn.tarteel.ai/quran/abdulBasitMujawwad/001001.mp3"
  );
  check(
    "recitationAudioUrl(114,6,\"abdulsamad\")",
    recitationAudioUrl(114, 6, "abdulsamad") === "https://audio-cdn.tarteel.ai/quran/abdulBasitMujawwad/114006.mp3"
  );

  // 3) wordIdAtTime, for every single ayah in the whole Qur'an, for EACH
  //    reciter: sampling the midpoint of each of its segments must resolve
  //    to the expected global word id (firstWordId + pos - 1) -- UNLESS an
  //    earlier segment (lower array index, i.e. an earlier-starting word)
  //    in the same ayah also covers that midpoint. Real recitation timing
  //    isn't perfectly non-overlapping -- adjacent words occasionally
  //    share a few tens of ms (natural pronunciation blending, more so in
  //    this Mujawwad-style recitation) -- and wordIdAtTime deliberately
  //    resolves that by first-match-in-array-order (== earliest start
  //    time), so the visible highlight always advances forward through a
  //    brief overlap instead of flickering back to the word that
  //    technically started it. So: only require the strict equality where
  //    a segment's midpoint ISN'T also inside an earlier segment's range
  //    (the overwhelming majority -- every case checked below confirmed
  //    the overlap explanation by hand first); where it IS, just confirm
  //    the earlier segment's position is what actually came back, i.e.
  //    the resolution rule itself holds.
  //
  //    knownOverflowAyahs is PER RECITER -- confirmed by direct inspection
  //    (compare each ayah's max segment `pos` against its mushaf word-slot
  //    count) that the two reciters don't share the same set: both have
  //    11:44 and 20:94, but Abdulbasit Abdussamed's recitation also
  //    repeats a word in 37:102 that Husary's doesn't. Recording separate
  //    lists rather than a union keeps this test honest about which
  //    reciter each overflow actually belongs to.
  const knownOverflowAyahs = {
    husary: new Set(["11:44", "20:94"]),
    abdulsamad: new Set(["11:44", "20:94", "37:102"]),
  };

  for (const reciter of Object.keys(RECITERS)) {
    const recitation = recitationByReciter[reciter];
    let sampledSegments = 0;
    let strictChecks = 0;
    let overlapChecks = 0;
    let mismatches = 0;
    let outOfBoundsAtNonLastSegment = 0;

    for (const surahKey of Object.keys(recitation)) {
      const surahAyahs = recitation[surahKey];
      for (let i = 0; i < surahAyahs.length; i++) {
        const ayahNum = i + 1;
        const segments = surahAyahs[i];
        const bounds = ayahBounds(ayahs, Number(surahKey), ayahNum);
        if (!bounds) {
          mismatches++;
          continue;
        }
        const [, firstWordId, lastWordId] = bounds;
        segments.forEach(([pos, startMs, endMs], segIdx) => {
          sampledSegments++;
          const midpoint = (startMs + endMs) / 2;
          const got = wordIdAtTime(ayahs, Number(surahKey), ayahNum, segments, midpoint);
          const isLastSegment = segIdx === segments.length - 1;
          const isKnownOverflow = knownOverflowAyahs[reciter].has(`${surahKey}:${ayahNum}`) && isLastSegment;

          // does an EARLIER segment in this same ayah also cover this midpoint?
          let earlierOverlap = null;
          for (let j = 0; j < segIdx; j++) {
            const [ePos, eStart, eEnd] = segments[j];
            if (midpoint >= eStart && midpoint < eEnd) {
              earlierOverlap = ePos;
              break;
            }
          }

          const authoritativePos = earlierOverlap != null ? earlierOverlap : pos;
          const expectedWordId = firstWordId + (authoritativePos - 1);

          if (expectedWordId > lastWordId) {
            if (!isKnownOverflow) outOfBoundsAtNonLastSegment++;
            return; // expected null from wordIdAtTime; nothing more to check here
          }
          if (earlierOverlap != null) overlapChecks++;
          else strictChecks++;
          if (got !== expectedWordId) mismatches++;
        });
      }
    }
    console.log(
      `  (bilgi, ${reciter}) taranan segment: ${sampledSegments} (net: ${strictChecks}, ortusen: ${overlapChecks}), uyusmayan: ${mismatches}, beklenmeyen-tasma: ${outOfBoundsAtNonLastSegment}`
    );
    check(`no wordIdAtTime midpoint mismatches across the whole Qur'an ("${reciter}", overlap-aware)`, mismatches === 0);
    check(`no UNEXPECTED segment-count overflow beyond the known ayahs ("${reciter}")`, outOfBoundsAtNonLastSegment === 0);
  }

  console.log(failures === 0 ? "\nTUM KONTROLLER GECTI (0 hata)" : `\n${failures} HATA BULUNDU`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
