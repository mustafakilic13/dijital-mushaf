#!/usr/bin/env python3
"""
Builds data/hizb.json, data/rub.json, data/manzil.json from QUL's raw
quran-metadata-{hizb,rub,manzil}.json exports -- the exact same minimal
shape data/juz.json already has ({ "n": {firstVerseKey, page}, ... }), so
js/app.js can navigate/highlight all four (juz, hizb, rub, manzil) with
one shared code path (see unitForAyah/goToUnitNum in app.js).

Unlike juz.json (built inside build_data.py, which derives page numbers
from the raw sqlite+word-id data while it already has that loaded), this
script gets its page numbers from the app's own already-built
data/ayahs.json ([page, firstWordId, lastWordId] per ayah) -- so it only
needs the 3 small raw QUL exports below, not the full raw mushaf dataset.
build_data.py has ALSO been updated to produce these same 3 files the
same way juz.json is (via page_for_verse_key()) for a from-scratch
rebuild; this script is the easy path for the common case of refreshing
just these three (e.g. QUL revises one of them) without re-running the
full pipeline.

Input shape (QUL's own export, unzipped as-is -- see
https://qul.tarteel.ai/resources, "Quran metadata"):
  { "1": {"hizb_number": 1, "first_verse_key": "1:1", "last_verse_key": "2:74", ...}, ... }
Only "first_verse_key" is used; the rest (verses_count, last_verse_key,
verse_mapping) is intentionally dropped, matching juz.json's own minimal
shape -- everything else the app needs (surah name, page range, ayah
count) it already derives at render time from data/surahs.json /
data/ayahs.json, same as it does for juz.

Usage: python3 build_hizb_rub_manzil.py [raw-dir] [ayahs.json] [out-dir]
Defaults: raw-dir=./raw-data, ayahs.json=../data/ayahs.json, out-dir=../data
"""
import json
import os
import sys

HERE = os.path.dirname(__file__)
RAW_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "raw-data")
AYAHS_JSON = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "..", "data", "ayahs.json")
OUT_DIR = sys.argv[3] if len(sys.argv) > 3 else os.path.join(HERE, "..", "data")

# (label, raw QUL filename, output filename)
UNITS = [
    ("hizb", "quran-metadata-hizb.json", "hizb.json"),
    ("rub", "quran-metadata-rub.json", "rub.json"),
    ("manzil", "quran-metadata-manzil.json", "manzil.json"),
]


def main():
    with open(AYAHS_JSON, encoding="utf-8") as f:
        ayahs = json.load(f)  # { "surah": [[page, firstWordId, lastWordId], ...], ... }

    def page_for_verse_key(vkey):
        surah, ayah = vkey.split(":")
        entries = ayahs.get(surah)
        if not entries:
            return None
        idx = int(ayah) - 1
        if idx < 0 or idx >= len(entries):
            return None
        return entries[idx][0]

    for label, raw_name, out_name in UNITS:
        raw_path = os.path.join(RAW_DIR, raw_name)
        try:
            with open(raw_path, encoding="utf-8") as f:
                meta = json.load(f)
        except FileNotFoundError:
            print(f"{raw_name} bulunamadi ({RAW_DIR}), {label} atlaniyor")
            continue

        out = {}
        missing = []
        for uid in sorted(meta.keys(), key=int):
            vkey = meta[uid]["first_verse_key"]
            page = page_for_verse_key(vkey)
            if page is None:
                missing.append((uid, vkey))
            out[uid] = {"firstVerseKey": vkey, "page": page}

        out_path = os.path.join(OUT_DIR, out_name)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

        if missing:
            print(f"UYARI: {label} -- sayfasi bulunamayan {len(missing)} kayit: {missing}")
        print(f"{out_name}: {len(out)} {label} yazildi -> {out_path}")


if __name__ == "__main__":
    main()
