// ezber-play.js -- Ezber -> Dinle: birikimli tekrarlı ezber çalma. js/playback.js'in <audio> öğesini ve vurgu döngüsünü kullanır;
// aşamaları ezberAdvance yönetir.
//
// Çevrimsel içe aktarma: bu modül, başka uygulama modülleriyle birbirini içe aktarıyor. Bu güvenli, çünkü içe aktarılan adlar YALNIZCA
// işlev gövdelerinde (çağrı anında) kullanılıyor; modül değerlendirilirken, üst düzeyde, başka bir uygulama modülünden ad okumayın
// (test/modul_siniri_test.mjs bunu denetler; bkz. GELISTIRICI.md "Modül haritası").

import { ayahPage } from "./lookup.js";
import { showPage, updateWordHighlight } from "./page.js";
import {
  loadRecitationData,
  playClip,
  recitationAudioUrl,
  RECITERS,
  setPlayActive,
  setPlayLabel,
  stopPlayback,
  syncHighlightLoop,
} from "./playback.js";
import { state } from "./state.js";

// ---------------------------------------------------------------------
// Ezber -> Dinle: cumulative-repetition memorization playback. Reuses the
// same <audio> element / word-highlight sync loop / page navigation as
// normal playback (js/playback.js, state.playback) -- it's really the same engine,
// just driven by state.playback.ezber's own stage machine instead of
// nextAyahRef's simple "next ayah in Qur'an order" progression, and kept
// mutually exclusive with it (startEzberPlayback opens by calling
// stopPlayback, same as starting normal playback would need to stop an
// in-progress Ezber session -- both share the one <audio> element).
//
// Ported from eski-uygulama's ezberStep(): play the current ayah `repeat`
// times, then replay besmele + every ayah from the start of the range
// through the current one once each ("review" -- reinforces the growing
// chain), then move to the next ayah; once the whole range is done, loop
// back to the start if repeatAll > 1, else stop. The one structural
// difference from the port: eski-uygulama chains steps through each
// playAudioUrl() call's own callback; here, ALL clips (normal or Ezber)
// share one "ended" listener (see setupPlayback), so ez.stage records
// which clip just finished/is about to play, and ezberAdvance reads it
// to decide what comes next -- see ezberPlayStage's cases for what each
// stage means.
// ---------------------------------------------------------------------

function ezberBasmalaNeeded(ez) {
  return !((ez.surah === 1 || ez.surah === 9) && ez.from === 1);
}

async function startEzberPlayback(reciter, surah, from, to, repeat, repeatAll) {
  stopPlayback(); // Ezber can't run alongside normal playback -- same <audio>
  state.playback.active = true;
  state.playback.reciter = reciter;
  setPlayActive(true);
  setPlayLabel("صدق الله العظيم", "ar");
  state.playback.requestId += 1;
  const requestId = state.playback.requestId;
  state.playback.ezber = {
    surah,
    from,
    to,
    repeat,
    repeatAll,
    repeatAllCurrent: 0,
    ayahOffset: 0, // 0-based; current main-phase ayah = from + ayahOffset
    repeatCurrent: 0, // how many times the current main-phase ayah has played so far
    reviewIndex: 0, // 0-based; only meaningful during "review-ayah"
    stage: "euzu",
  };

  if (!state.recitationCache[reciter]) {
    try {
      await loadRecitationData(reciter);
    } catch (err) {
      console.warn("Recitation data could not be loaded", err);
      stopPlayback();
      return;
    }
    if (state.playback.requestId !== requestId) return;
  }

  const page = ayahPage(surah, from);
  if (page) await showPage(page, { ayah: { surah, ayah: from } });
  if (state.playback.requestId !== requestId) return;
  ezberPlayStage(requestId);
}

// Starts whichever clip ez.stage currently points to. Called once to
// kick a session off and again every time ezberAdvance moves to a new
// stage -- never called directly from an "ended"/failure callback itself
// (those always go through ezberAdvance first, even when the next stage
// needs no real audio wait; see ezberAdvance's own recursive calls).
function ezberPlayStage(requestId) {
  if (state.playback.requestId !== requestId || !state.playback.active) return;
  const ez = state.playback.ezber;
  if (!ez) return;
  const reciter = state.playback.reciter;

  if (ez.stage === "euzu") {
    state.playback.phase = "intro";
    playClip(RECITERS[reciter].introLocal, requestId, () => ezberAdvance(requestId));
    return;
  }
  if (ez.stage === "besmele" || ez.stage === "review-besmele") {
    state.playback.phase = "intro";
    playClip(recitationAudioUrl(1, 1, reciter), requestId, () => ezberAdvance(requestId));
    return;
  }
  // "ayah" (main phase) or "review-ayah" (cumulative review)
  const ayahNum = ez.stage === "review-ayah" ? ez.from + ez.reviewIndex : ez.from + ez.ayahOffset;
  ezberPlayAyah(ez.surah, ayahNum, requestId);
}

// Plays one specific ayah's own recitation with the normal page-nav +
// ayah-highlight + word-sync treatment (same pieces playAyah/
// playCurrentAyahAudio use, in js/playback.js), but WITHOUT their automatic
// intro-before-ayah-1 injection -- Ezber controls euzu/besmele timing
// itself via ez.stage, so an ayah clip here is always just the ayah.
async function ezberPlayAyah(surah, ayah, requestId) {
  state.playback.surah = surah;
  state.playback.ayah = ayah;
  state.playback.lastWordId = null;
  const page = ayahPage(surah, ayah);
  if (page) await showPage(page, { ayah: { surah, ayah } });
  if (state.playback.requestId !== requestId) return;
  if (state.currentPageSvg) updateWordHighlight(state.currentPageSvg, state.currentPageWordSegments, null);
  state.playback.phase = "ayah";
  playClip(recitationAudioUrl(surah, ayah, state.playback.reciter), requestId, () => ezberAdvance(requestId));
  if (state.playback.requestId !== requestId) return;
  if (state.playback.rafId) cancelAnimationFrame(state.playback.rafId);
  syncHighlightLoop(requestId);
}

// Called whenever ez.stage's clip just finished (onPlaybackAudioEnded)
// or failed to even start (ezberPlayStage/ezberPlayAyah's playClip
// onFailure) -- decides ez's next stage and starts it. See the module
// comment above for the stage sequence this implements.
function ezberAdvance(requestId) {
  if (state.playback.requestId !== requestId || !state.playback.active) return;
  const ez = state.playback.ezber;
  if (!ez) return;
  const totalAyahs = ez.to - ez.from + 1;

  if (ez.stage === "euzu") {
    ez.stage = ezberBasmalaNeeded(ez) ? "besmele" : "ayah";
    ezberPlayStage(requestId);
    return;
  }
  if (ez.stage === "besmele") {
    ez.stage = "ayah";
    ezberPlayStage(requestId);
    return;
  }
  if (ez.stage === "ayah") {
    ez.repeatCurrent++;
    if (ez.repeatCurrent < ez.repeat) {
      ezberPlayStage(requestId); // same ayah again
      return;
    }
    ez.repeatCurrent = 0;
    ez.reviewIndex = 0;
    ez.stage = ezberBasmalaNeeded(ez) ? "review-besmele" : "review-ayah";
    ezberPlayStage(requestId);
    return;
  }
  if (ez.stage === "review-besmele") {
    ez.stage = "review-ayah";
    ezberPlayStage(requestId);
    return;
  }
  // "review-ayah": keep replaying from(+0) .. from(+ayahOffset) until the
  // just-finished one WAS that last one, then move on to the next ayah.
  if (ez.reviewIndex < ez.ayahOffset) {
    ez.reviewIndex++;
    ezberPlayStage(requestId);
    return;
  }
  ez.ayahOffset++;
  if (ez.ayahOffset >= totalAyahs) {
    ez.repeatAllCurrent++;
    if (ez.repeatAllCurrent < ez.repeatAll) {
      ez.ayahOffset = 0;
      ez.stage = "euzu";
      ezberPlayStage(requestId);
    } else {
      stopPlayback();
    }
    return;
  }
  ez.stage = "ayah";
  ezberPlayStage(requestId);
}

export { startEzberPlayback, ezberAdvance };
