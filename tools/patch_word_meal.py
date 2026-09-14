#!/usr/bin/env python3
"""
Applies known, hand-verified corrections to data/word-meal.json for
specific "surah:ayah:position" entries where the upstream QUL export
(turkish-wbw-translation.json) itself has the Turkish glosses shifted
by one position relative to the Arabic words they're meant to sit under
-- confirmed by cross-checking data/mushaf.json's actual word sequence
against the source ayah's real word-by-word meaning.

Each patch entry is DELETE (position should have no entry at all -- its
word's meaning folds into the previous card, same as any other unlisted
position) or a corrected string value. Safe to re-run: skips a patch
silently if the file already has that exact target state (e.g. a refreshed
turkish-wbw-translation.json that happens to already fix it upstream), and
reports if a patch's CURRENT value doesn't match what triggered the fix in
the first place, so a genuinely different future export doesn't get
clobbered blindly.

Usage: python3 patch_word_meal.py [word-meal.json]
Defaults to ../data/word-meal.json next to this script.
"""
import json
import os
import sys

HERE = os.path.dirname(__file__)
TARGET = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "data", "word-meal.json")

DELETE = object()  # sentinel: this key should not exist at all

# key -> (value found when this patch was written, corrected value or DELETE)
# Keeping the originally-found value lets this script warn instead of
# silently overwriting if a refreshed source file has since changed that
# key to something else entirely (rather than just "not yet patched").
PATCHES = {
    # 2:267 -- from "مِنْهُ تُنفِقُونَ" (position 18) onward, every Turkish
    # gloss in the source is shifted one position early relative to the
    # Arabic word it's meant to gloss (reported by a user who cross-checked
    # against the QUL file's intended alignment; verified against
    # data/mushaf.json's actual word 1..29 sequence for this ayah). The
    # last real word (position 29, "حَمِيدٌ" / "övülmüştür") ends up with no
    # entry at all as a result -- its translation simply falls off the end.
    "2:267:18": ("kendinize alamayacağınız", DELETE),
    "2:267:19": (None, "kendinize alamayacağınız"),
    "2:267:20": ("başka şekilde", DELETE),
    "2:267:21": ("göz yummadan", "başka şekilde"),
    "2:267:22": (None, "göz yummadan"),
    "2:267:23": ("ondan", DELETE),
    "2:267:24": ("bilin ki", "ondan"),
    "2:267:25": ("şüphesiz", "bilin ki"),
    "2:267:26": ("Allah", "şüphesiz"),
    "2:267:27": ("zengindir", "Allah"),
    "2:267:28": ("övülmüştür", "zengindir"),
    "2:267:29": (None, "övülmüştür"),
}


def main():
    with open(TARGET, encoding="utf-8") as f:
        data = json.load(f)

    applied = 0
    already_done = 0
    unexpected = []

    for key, (expected_before, after) in PATCHES.items():
        current = data.get(key)
        target_state = None if after is DELETE else after

        if current == target_state:
            already_done += 1
            continue
        if current != expected_before:
            unexpected.append((key, expected_before, current))
            continue

        if after is DELETE:
            del data[key]
        else:
            data[key] = after
        applied += 1

    if unexpected:
        print("dikkat: asagidaki anahtarlar ne beklenen eski degeri ne de hedef degeri tasiyor, dokunulmadi:")
        for key, expected_before, current in unexpected:
            print(f"  {key}: beklenen eski={expected_before!r}, dosyadaki={current!r}")
        sys.exit(1)

    if applied:
        with open(TARGET, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    print(f"uygulanan yama: {applied}, zaten dogruydu: {already_done}")


if __name__ == "__main__":
    main()
