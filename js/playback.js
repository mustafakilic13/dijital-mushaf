// playback.js -- sesli okuma: kârî kaynakları, ayet ve besmele/istiâze klipleri, kelime vurgusu eşzamanı, Oynat düğmesi
// (setupPlayback) ve durdurma. Ezber -> Dinle (js/ezber-play.js) aynı <audio> öğesini ve motoru paylaşır.
//
// Çevrimsel içe aktarma: bu modül, başka uygulama modülleriyle birbirini içe aktarıyor. Bu güvenli, çünkü içe aktarılan adlar YALNIZCA
// işlev gövdelerinde (çağrı anında) kullanılıyor; modül değerlendirilirken, üst düzeyde, başka bir uygulama modülünden ad okumayın
// (test/modul_siniri_test.mjs bunu denetler; bkz. GELISTIRICI.md "Modül haritası").

import { loadJSON } from "./data-load.js";
import { ezberAdvance } from "./ezber-play.js";
import { ayahBounds, ayahPage, pageFirstAyah } from "./lookup.js";
import { showPage, updateWordHighlight } from "./page.js";
import { els, state } from "./state.js";

// ---------------------------------------------------------------------
// Recitation playback (besmele/play button): continuous, word-highlighted
// playback, starting from the selected ayah and continuing sequentially
// through the rest of the Qur'an until stopped. See state.playback's doc
// comment for the requestId guard. The main play button always uses
// Husary (unchanged); Ezber -> Dinle (js/ezber-play.js) is the only caller
// that ever passes a different RECITERS key.
// ---------------------------------------------------------------------

// Mirrors tools/build_recitation.py's own RECITERS dict -- one entry per
// reciter whose word-timing data has been built into data/. introLocal
// is the isti'adha clip played before 1:1 (see introAudioFor); every
// other surah's besmele is just reciter's own 1:1 recitation (see below),
// so only the isti'adha itself needs its own per-reciter local file.
const RECITERS = {
  husary: {
    label: "Husarî (Mücevved)",
    cdnSlug: "husaryMujawwad",
    introLocal: "audio/euzuhusari.mp3",
    dataFile: "data/recitation-husary-mujawwad.json",
  },
  abdulsamad: {
    label: "Abdülbâsıt Abdüssamed (Mücevved)",
    cdnSlug: "abdulBasitMujawwad",
    introLocal: "audio/euzuabdulsamad.mp3",
    dataFile: "data/recitation-abdulsamad-mujawwad.json",
  },
};

// QUL's own export has one audio_url per ayah, but every single one (all
// 6236, verified per-reciter when its data/recitation-*.json was built --
// see tools/build_recitation.py) is this exact template, so it isn't
// stored per-ayah at all, just rebuilt here.
function recitationAudioUrl(surah, ayah, reciter = "husary") {
  const pad3 = (n) => String(n).padStart(3, "0");
  return `https://audio-cdn.tarteel.ai/quran/${RECITERS[reciter].cdnSlug}/${pad3(surah)}${pad3(ayah)}.mp3`;
}

// The clip that should play immediately BEFORE a given ayah's own
// recitation, or null if none applies -- standard recitation convention:
// the isti'adha ("eûzü billâhi mine'ş-şeytâni'r-racîm") is said once,
// right before Sûre-i Fâtiha's first ayah (the very start of a
// start-to-finish recitation); the besmele is said before the first ayah
// of every OTHER surah except Tevbe (sure 9), the one surah that doesn't
// open with it. Reuses 1:1's own recitation (an actual, already-fetched
// ayah) as that besmele audio rather than a separate clip.
function introAudioFor(surah, ayah, reciter = "husary") {
  if (ayah !== 1) return null;
  if (surah === 1) return RECITERS[reciter].introLocal;
  if (surah === 9) return null;
  return recitationAudioUrl(1, 1, reciter);
}

// Lazy-loads (and caches) a reciter's word-timing data -- see
// state.recitationCache's doc comment. Shared by normal playback
// (always "husary") and Ezber -> Dinle (either reciter).
async function loadRecitationData(reciter) {
  if (!state.recitationCache[reciter]) {
    state.recitationCache[reciter] = await loadJSON(RECITERS[reciter].dataFile);
  }
  return state.recitationCache[reciter];
}

// {surah,ayah} right after the given one, walking into the next surah once
// the current one runs out -- or null after 114:6, the last ayah of the
// Qur'an (playback stops there rather than looping back to the start; see
// advancePlayback).
function nextAyahRef(surah, ayah) {
  const versesCount = state.surahs[String(surah)] && state.surahs[String(surah)].versesCount;
  if (versesCount && ayah < versesCount) return { surah, ayah: ayah + 1 };
  if (surah < 114) return { surah: surah + 1, ayah: 1 };
  return null;
}

// Finds which segment currentTimeMs falls in BY TIME (not by its `pos`
// field -- see build_recitation.py's doc comment on why some ayahs repeat
// a position), and returns the GLOBAL word id it corresponds to, or null
// if it's before the first segment / doesn't resolve to a real word in
// THIS ayah (a couple of ayahs have one more recited segment than the
// mushaf has word-slots for them; silently not highlighting that last
// split-second is preferable to highlighting the wrong word).
function wordIdAtTime(surah, ayah, segments, currentTimeMs) {
  const bounds = ayahBounds(surah, ayah);
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

// Navigates to {surah,ayah}, clears any leftover word-highlight, and starts
// whichever comes first: an intro clip (isti'adha/besmele -- introAudioFor)
// if this ayah needs one, or straight to the ayah's own recitation if not.
// Does NOT await any of the audio finishing -- the (persistent, see
// setupPlayback) audio element's "ended"/"error" events drive what happens
// next (onPlaybackAudioEnded: intro -> the ayah itself; ayah -> advance).
async function playAyah(surah, ayah, requestId) {
  if (state.playback.requestId !== requestId) return;
  state.playback.surah = surah;
  state.playback.ayah = ayah;
  state.playback.lastWordId = null;

  const page = ayahPage(surah, ayah);
  if (page) await showPage(page, { ayah: { surah, ayah } });
  if (state.playback.requestId !== requestId) return;
  // Nothing above is word-highighted (an intro clip isn't Qur'an text on
  // the page at all; the ayah itself hasn't started yet either way).
  if (state.currentPageSvg) updateWordHighlight(state.currentPageSvg, state.currentPageWordSegments, null);

  const introUrl = introAudioFor(surah, ayah, state.playback.reciter);
  if (introUrl) {
    state.playback.phase = "intro";
    await playClip(introUrl, requestId, /* onFailure */ () => playCurrentAyahAudio(requestId));
  } else {
    playCurrentAyahAudio(requestId);
  }
}

// Sets the shared audio element's src and plays it. On a play() rejection
// (autoplay policy, network, etc.) calls onFailure instead of leaving
// playback stuck -- used both for the intro clip (skip straight to the
// ayah) and, via playCurrentAyahAudio, for the ayah itself (stop outright).
async function playClip(url, requestId, onFailure) {
  const audio = state.playback.audio;
  audio.src = url;
  try {
    await audio.play();
  } catch (err) {
    if (state.playback.requestId !== requestId) return; // expected: a stop/restart interrupted this play() call
    console.warn(`Playback audio could not start (${url})`, err);
    onFailure();
  }
}

// Starts the CURRENT ayah's (state.playback.surah/ayah) own recitation +
// per-frame word-highlight sync -- called once directly from playAyah (no
// intro needed) or once from onPlaybackAudioEnded (intro clip finished).
function playCurrentAyahAudio(requestId) {
  if (state.playback.requestId !== requestId) return;
  state.playback.phase = "ayah";
  const { surah, ayah, reciter } = state.playback;
  playClip(recitationAudioUrl(surah, ayah, reciter), requestId, () => stopPlayback());
  if (state.playback.requestId !== requestId) return;
  if (state.playback.rafId) cancelAnimationFrame(state.playback.rafId); // guard against a prior ayah's loop still pending
  state.playback.rafId = requestAnimationFrame(() => syncHighlightLoop(requestId));
}

function syncHighlightLoop(requestId) {
  if (state.playback.requestId !== requestId || state.playback.phase !== "ayah") return;
  const { surah, ayah, audio, reciter } = state.playback;
  const segments = ((state.recitationCache[reciter] || {})[String(surah)] || [])[ayah - 1] || [];
  const wordId = wordIdAtTime(surah, ayah, segments, audio.currentTime * 1000);
  if (wordId !== state.playback.lastWordId) {
    state.playback.lastWordId = wordId;
    if (state.currentPageSvg) updateWordHighlight(state.currentPageSvg, state.currentPageWordSegments, wordId);
  }
  state.playback.rafId = requestAnimationFrame(() => syncHighlightLoop(requestId));
}

// Called from the (persistent) audio element's "ended"/"error" listeners.
// What "done" means depends on the phase that just finished: an intro clip
// hands off to that same ayah's own recitation; the ayah itself moves on
// to whatever's next in the sequence (or stops at the end of the Qur'an,
// nextAyahRef returning null).
function onPlaybackAudioEnded() {
  if (!state.playback.active) return;
  if (state.playback.ezber) {
    ezberAdvance(state.playback.requestId);
    return;
  }
  if (state.playback.phase === "intro") playCurrentAyahAudio(state.playback.requestId);
  else advancePlayback();
}
function onPlaybackAudioError() {
  if (!state.playback.active) return;
  console.warn(
    `Playback audio failed (phase=${state.playback.phase}) for ${state.playback.surah}:${state.playback.ayah}`,
    state.playback.audio.error
  );
  onPlaybackAudioEnded(); // same "what's next" logic as a clean finish
}
function advancePlayback() {
  const next = nextAyahRef(state.playback.surah, state.playback.ayah);
  if (!next) {
    stopPlayback();
    return;
  }
  playAyah(next.surah, next.ayah, state.playback.requestId);
}

// Oynat düğmesinin erişilebilir adı iki parçanın birleşimidir (aria-labelledby="play-btn-action
// play-btn-label", araya boşlukla): önce görünmez (.sr-only) Türkçe EYLEM -- #play-btn-action,
// boştayken "Oynat", çalarken "Duraklat" -- sonra ekranda görünen etiket -- #play-btn-label, hem
// Arapça ibare ("بسم الله…", "صدق الله العظيم") hem Türkçe durum metni ("Yükleniyor…") taşır. Ad
// görünen metni içerdiği için (WCAG 2.5.3) etiket addan çıkarılmıyor. Ekran okuyucunun sesi `lang`e
// göre seçildiğinden etiketin metni ve dili HER ZAMAN birlikte değişmeli -- etiketi yalnızca
// burası yazar (test/erisilebilirlik_test.mjs bunu denetler).
function setPlayLabel(text, lang) {
  els.playBtnLabel.textContent = text;
  els.playBtnLabel.lang = lang;
}

// Düğmenin "çalıyor" durumu: .playing sınıfı (altın dolgu) ve eylem sözcüğü TEK yerden, birlikte
// yazılır. Çalan oturum (yüklenirken de: ikinci dokunuş durdurur) "Duraklat"tır -- durdurulunca
// seçili ayet çalınan ayette kaldığından tekrar basınca o ayetten devam edilir. Ad durumla birlikte
// değiştiği için aria-pressed KULLANILMIYOR: ad da durum da değişirse ekran okuyucu "Duraklat, geçiş
// düğmesi, basılı" gibi çelişkili okur (ARIA APG: etiketi değişen düğmede aria-pressed olmaz).
function setPlayActive(active) {
  els.playBtn.classList.toggle("playing", active);
  els.playBtnAction.textContent = active ? "Duraklat" : "Oynat";
}

async function startPlayback() {
  if (state.playback.active) return;
  // Set immediately (before the possibly-async data load below) so a rapid
  // second tap on the button is read as "stop", not a re-entrant 2nd start.
  state.playback.active = true;
  state.playback.reciter = "husary"; // the main play button is always Husary
  state.playback.ezber = null; // in case a previous Ezber->Dinle session left this set
  setPlayActive(true);

  if (!state.recitationCache.husary) {
    setPlayLabel("Yükleniyor…", "tr");
    try {
      await loadRecitationData("husary");
    } catch (err) {
      console.warn("Recitation data could not be loaded", err);
      stopPlayback();
      return;
    }
    if (!state.playback.active) return; // stopped again while the data was loading
  }

  setPlayLabel("صدق الله العظيم", "ar");
  state.playback.requestId += 1;
  const startAyah = state.selectedAyah || pageFirstAyah(state.currentPage);
  playAyah(startAyah.surah, startAyah.ayah, state.playback.requestId);
}

function stopPlayback() {
  state.playback.active = false;
  state.playback.phase = "ayah";
  state.playback.ezber = null;
  state.playback.requestId += 1; // invalidates any in-flight playAyah continuation
  if (state.playback.rafId) {
    cancelAnimationFrame(state.playback.rafId);
    state.playback.rafId = null;
  }
  if (state.playback.audio) state.playback.audio.pause();
  state.playback.lastWordId = null;
  if (state.currentPageSvg) updateWordHighlight(state.currentPageSvg, state.currentPageWordSegments, null);
  setPlayActive(false);
  setPlayLabel("بسم الله الرحمن الرحيم", "ar");
}

function setupPlayback() {
  state.playback.audio = new Audio();
  state.playback.audio.addEventListener("ended", onPlaybackAudioEnded);
  state.playback.audio.addEventListener("error", onPlaybackAudioError);

  els.playBtn.addEventListener("click", () => {
    if (state.playback.active) stopPlayback();
    else startPlayback();
  });
}

export {
  RECITERS,
  recitationAudioUrl,
  loadRecitationData,
  playClip,
  syncHighlightLoop,
  setPlayLabel,
  setPlayActive,
  stopPlayback,
  setupPlayback,
};
