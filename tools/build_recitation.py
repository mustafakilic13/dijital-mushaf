#!/usr/bin/env python3
"""
Builds data/recitation-<reciter>-mujawwad.json from one of QUL's raw
ayah-recitation-*.json exports (unzipped as-is -- see
https://qul.tarteel.ai/resources, "Recitations and segments data").
Originally written for Husary only; generalized when Abdulbasit
Abdussamed was added as a second Ezber "Dinle" reciter (see RECITERS
below and js/app.js's own RECITERS registry, which mirrors this one).

The raw export is keyed "surah:ayah" -> {surah_number, ayah_number,
audio_url, duration, segments}. Two of those five fields are pure
overhead once you look at the data as a whole:
  - surah_number/ayah_number duplicate the "surah:ayah" key itself.
  - duration is null for all 6236 entries in every export checked so far.
  - audio_url is 100%-reconstructible from surah+ayah -- every entry in
    a given reciter's export matches
    "https://audio-cdn.tarteel.ai/quran/<cdnSlug>/SSSAAA.mp3" (zero-
    padded 3-digit surah+ayah) exactly, so storing it 6236 times is
    pure repetition. js/app.js rebuilds it with a one-line template
    (recitationAudioUrl(surah, ayah, reciter)) instead.
That leaves "segments" ([wordPositionInAyah, startMs, endMs] triples,
1-indexed, time-ordered but NOT always position-monotonic -- some ayahs
have the reciter repeat a word/phrase, which shows up as a position
appearing twice; js/app.js's highlight lookup is time-based so this
doesn't need special-casing) as the only per-ayah payload worth keeping.

Output shape mirrors data/ayahs.json's own surah-nested, ayah-index
convention (surah string key -> array indexed by ayah-1) rather than
repeating "surah:ayah" string keys 6236 times:
  { "1": [ [[1,0,4080],[2,4280,4640],...], ...(ayah 2, 3, ...) ], "2": [...], ... }
This cuts each file roughly in half before gzip. Loaded lazily (only
once the person actually starts playback / opens Ezber -> Dinle -- see
loadRecitationData in app.js), same as data/sura-info.json already is,
so this size only ever costs someone who uses the feature.

Usage: python3 build_recitation.py [reciter] [out-dir]
Defaults: reciter=husary, out-dir=../data
Reciter must be a key in RECITERS below. The raw file is always read
from raw-data/<RECITERS[reciter]["raw"]> -- see "Veriyi güncellemek" in
README.md for how a new raw export gets there.
"""
import json
import os
import sys

HERE = os.path.dirname(__file__)
RAW_DIR = os.path.join(HERE, "raw-data")

# Bir okuyucu eklemek için: QUL'dan ham "ayah-recitation-*.json" exportunu
# indirip raw-data/ altına koy, burada yeni bir satır aç (cdn_slug, o
# exportun HER kaydındaki audio_url'nin ...tarteel.ai/quran/<cdn_slug>/...
# kısmı -- script zaten bunu kendi doğrulaması sırasında teyit ediyor).
RECITERS = {
    "husary": {
        "raw": "ayah-recitation-mahmoud-khalil-al-husary-mujawwad-hafs-956.json",
        "cdn_slug": "husaryMujawwad",
        "out": "recitation-husary-mujawwad.json",
    },
    "abdulsamad": {
        "raw": "ayah-recitation-abdul-basit-abdul-samad-mujawwad-hafs-949.json",
        "cdn_slug": "abdulBasitMujawwad",
        "out": "recitation-abdulsamad-mujawwad.json",
    },
}

RECITER = sys.argv[1] if len(sys.argv) > 1 else "husary"
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "..", "data")


def main():
    if RECITER not in RECITERS:
        print(f"HATA: bilinmeyen okuyucu '{RECITER}'. Secenekler: {', '.join(RECITERS)}")
        sys.exit(1)
    cfg = RECITERS[RECITER]
    raw_file = os.path.join(RAW_DIR, cfg["raw"])
    out_file = os.path.join(OUT_DIR, cfg["out"])
    expected_url_tmpl = f"https://audio-cdn.tarteel.ai/quran/{cfg['cdn_slug']}/{{:03d}}{{:03d}}.mp3"

    with open(raw_file, encoding="utf-8") as f:
        raw = json.load(f)

    by_surah = {}
    url_mismatches = []
    for key, entry in raw.items():
        surah_s, ayah_s = key.split(":")
        surah, ayah = int(surah_s), int(ayah_s)

        expected_url = expected_url_tmpl.format(surah, ayah)
        if entry.get("audio_url") != expected_url:
            url_mismatches.append((key, entry.get("audio_url"), expected_url))

        by_surah.setdefault(surah, {})[ayah] = entry["segments"]

    if url_mismatches:
        # The whole point of dropping audio_url is that it's reconstructible;
        # if even one entry doesn't fit the pattern, that ayah would silently
        # get the WRONG audio URL at playback time. Fail loudly instead.
        print(f"HATA: {len(url_mismatches)} kayitta audio_url beklenen kaliba uymuyor, urun uretilmedi:")
        for k, got, expected in url_mismatches[:10]:
            print(f"  {k}: got={got} expected={expected}")
        sys.exit(1)

    out = {}
    for surah in range(1, 115):
        ayahs = by_surah.get(surah)
        if not ayahs:
            print(f"UYARI: surah {surah} icin hic ayet bulunamadi, atlaniyor")
            continue
        max_ayah = max(ayahs.keys())
        out[str(surah)] = [ayahs.get(a, []) for a in range(1, max_ayah + 1)]

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    total_ayahs = sum(len(v) for v in out.values())
    print(f"{out_file}: {len(out)} sure, {total_ayahs} ayet yazildi ({RECITER})")


if __name__ == "__main__":
    main()
