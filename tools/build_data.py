#!/usr/bin/env python3
"""
Preprocesses raw QUL export files into compact, app-ready JSON.

Inputs (in DATA_DIR):
  digital-khatt-15-lines.db      - mushaf page/line layout (sqlite)
  digital-khatt-kelime-v2.json   - word-by-word Uthmani text (Digital Khatt V2 script)
  quran-metadata-surah-name.json - surah names
  sure-baslik-ligatures.json     - surah -> QCF_SurahHeader_COLOR ligature char
  quran-metadata-juz.json        - juz start references
  quran-metadata-hizb.json       - hizb start references
  quran-metadata-rub.json        - rub'ul hizb start references
  quran-metadata-manzil.json     - manzil start references
  quran-metadata-sajda.json      - sajda ayah list

Outputs (in OUT_DIR):
  mushaf.json    - { pagesCount, linesPerPage, pages: [[line,...], ...] }
  surahs.json    - { "1": {name, nameArabic, versesCount, bismillahPre, headerGlyph}, ... }
  juz.json, hizb.json, rub.json, manzil.json
                 - { "n": {firstVerseKey, page}, ... } start reference per unit,
                   same minimal shape for all four (see build_verse_range_units)
  sajda.json     - list of sajda ayah locations

Note: hizb.json/rub.json/manzil.json can also be (re)built on their own,
without the full raw dataset above, via build_hizb_rub_manzil.py -- that
script only needs the 3 small quran-metadata-{hizb,rub,manzil}.json
exports plus the already-built data/ayahs.json.
"""
import sqlite3
import json
import os
import sys

# Defaults assume: raw QUL exports sit in ./raw-data next to this script,
# and output goes to ../data (the app's data folder). Override via CLI:
#   python3 build_data.py /path/to/raw-qul-exports /path/to/output/data
DATA_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "raw-data")
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "data")


def load_json(name):
    with open(os.path.join(DATA_DIR, name), encoding="utf-8") as f:
        return json.load(f)


# Turkish surah names (Diyanet-style transliteration), 1-indexed, so the
# in-app search works for Turkish spellings ("Bakara") not just the QUL
# metadata's English transliteration ("Al-Baqarah"). Source cross-checked
# against verse counts in quran-metadata-surah-name.json.
TURKISH_SURAH_NAMES = [
    "Fâtiha", "Bakara", "Âl-i İmrân", "Nisâ", "Mâide", "En'âm", "A'râf", "Enfâl",
    "Tevbe", "Yunus", "Hûd", "Yusuf", "Ra'd", "İbrahim", "Hicr", "Nahl", "İsrâ",
    "Kehf", "Meryem", "Tâ-Hâ", "Enbiyâ", "Hac", "Mü'minûn", "Nûr", "Furkan",
    "Şuarâ", "Neml", "Kasas", "Ankebût", "Rûm", "Lokman", "Secde", "Ahzâb",
    "Sebe'", "Fâtır", "Yâsin", "Sâffât", "Sâd", "Zümer", "Mü'min", "Fussilet",
    "Şûrâ", "Zuhruf", "Duhân", "Câsiye", "Ahkaf", "Muhammed", "Fetih", "Hucurât",
    "Kaf", "Zâriyât", "Tûr", "Necm", "Kamer", "Rahmân", "Vâkıa", "Hadid",
    "Mücâdele", "Haşr", "Mümtehine", "Saf", "Cum'a", "Münâfikûn", "Teğabün",
    "Talâk", "Tahrim", "Mülk", "Kalem", "Hâkka", "Meâric", "Nuh", "Cin",
    "Müzzemmil", "Müddessir", "Kıyamet", "İnsan", "Mürselât", "Nebe'", "Nâziât",
    "Abese", "Tekvir", "İnfitâr", "Mutaffifin", "İnşikak", "Bürûc", "Târık",
    "A'lâ", "Gâşiye", "Fecr", "Beled", "Şems", "Leyl", "Duhâ", "İnşirâh", "Tin",
    "Alak", "Kadir", "Beyyine", "Zilzâl", "Âdiyât", "Kâria", "Tekâsür", "Asr",
    "Hümeze", "Fil", "Kureyş", "Mâûn", "Kevser", "Kâfirûn", "Nasr", "Tebbet",
    "İhlâs", "Felâk", "Nâs",
]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    words = load_json("digital-khatt-kelime-v2.json")
    text_by_id = {}
    ayah_first_word = {}  # "surah:ayah" -> first word id (word==1)
    word_surah_ayah = {}  # word id -> (surah:int, ayah:int), for reverse lookups
    for v in words.values():
        text_by_id[v["id"]] = v["text"]
        word_surah_ayah[v["id"]] = (int(v["surah"]), int(v["ayah"]))
        if v["word"] == "1":
            ayah_first_word[f"{v['surah']}:{v['ayah']}"] = v["id"]
    max_word_id = max(text_by_id.keys())
    print(f"Loaded {len(text_by_id)} words, max id={max_word_id}")

    conn = sqlite3.connect(os.path.join(DATA_DIR, "digital-khatt-15-lines.db"))
    cur = conn.cursor()
    cur.execute("SELECT number_of_pages, lines_per_page FROM info")
    pages_count, lines_per_page = cur.fetchone()
    print(f"info: pages={pages_count} lines_per_page={lines_per_page}")

    cur.execute(
        "SELECT page_number, line_number, line_type, is_centered, "
        "first_word_id, last_word_id, surah_number FROM pages "
        "ORDER BY page_number, line_number"
    )

    pages = [[] for _ in range(pages_count + 1)]  # 1-indexed, index 0 unused

    for page_number, line_number, line_type, is_centered, first_id, last_id, surah_number in cur.fetchall():
        if line_type == "surah_name":
            line = {"t": "s", "surah": int(surah_number)}
        elif line_type == "basmallah":
            line = {"t": "b"}
        else:  # 'ayah'
            first_id = int(first_id)
            last_id = int(last_id)
            # Build word list for this line (id + text). Also record which
            # word ids correspond to an ayah-end marker so the app can map
            # taps -> ayah and know ayah boundaries within a line.
            w = []
            for wid in range(first_id, last_id + 1):
                w.append({"i": wid, "t": text_by_id[wid]})
            line = {
                "t": "a",
                "c": bool(is_centered),
                "w": w,
            }
        pages[page_number].append(line)

    pages = pages[1:]  # drop unused index 0

    # sanity check
    total_lines = sum(len(p) for p in pages)
    print(f"Built {len(pages)} pages, {total_lines} total lines")

    # The decorative (non-ayah) basmallah text is identical everywhere it
    # appears, and is exactly words 1-4 of Al-Fatihah (word 5 there is the
    # ayah-end marker, which the decorative basmallah does not have).
    basmallah_text = " ".join(text_by_id[i] for i in range(1, 5))

    mushaf = {
        "pagesCount": pages_count,
        "linesPerPage": lines_per_page,
        "basmallahText": basmallah_text,
        "pages": pages,
    }
    with open(os.path.join(OUT_DIR, "mushaf.json"), "w", encoding="utf-8") as f:
        json.dump(mushaf, f, ensure_ascii=False, separators=(",", ":"))

    # --- surah metadata ---
    surah_meta = load_json("quran-metadata-surah-name.json")
    try:
        baslik_lig = load_json("sure-baslik-ligatures.json")
    except FileNotFoundError:
        baslik_lig = {}

    surahs = {}
    for sid, info in surah_meta.items():
        glyph = baslik_lig.get(f"surah-{sid}")
        surahs[sid] = {
            "name": info["name"],
            "nameSimple": info["name_simple"],
            "nameTurkish": TURKISH_SURAH_NAMES[int(sid) - 1],
            "nameArabic": info["name_arabic"],
            "versesCount": info["verses_count"],
            "revelationPlace": info["revelation_place"],
            "bismillahPre": info["bismillah_pre"],
            "headerGlyph": glyph,
        }
    with open(os.path.join(OUT_DIR, "surahs.json"), "w", encoding="utf-8") as f:
        json.dump(surahs, f, ensure_ascii=False, separators=(",", ":"))

    # Build word_id -> page map for verse_key -> page lookups
    word_page = {}
    for pi, p in enumerate(pages, start=1):
        for line in p:
            if line["t"] == "a":
                for wentry in line["w"]:
                    word_page[wentry["i"]] = pi

    def page_for_verse_key(vkey):
        wid = ayah_first_word.get(vkey)
        if wid is None:
            return None
        return word_page.get(wid)

    # --- juz/hizb/rub/manzil starting points -> page number (for nav) ---
    # All four of QUL's raw exports share the same shape (keyed "1".."n",
    # each with a first_verse_key); build_hizb_rub_manzil.py does this same
    # transform standalone (from data/ayahs.json instead of page_for_verse_key,
    # for when only these 3 need refreshing, not the full raw dataset).
    def build_verse_range_units(raw_filename, out_filename, label):
        try:
            meta = load_json(raw_filename)
        except FileNotFoundError:
            print(f"{label} metadata not found, skipping")
            return
        out = {}
        for uid, info in meta.items():
            page = page_for_verse_key(info["first_verse_key"])
            out[uid] = {"firstVerseKey": info["first_verse_key"], "page": page}
        with open(os.path.join(OUT_DIR, out_filename), "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    build_verse_range_units("quran-metadata-juz.json", "juz.json", "juz")
    build_verse_range_units("quran-metadata-hizb.json", "hizb.json", "hizb")
    build_verse_range_units("quran-metadata-rub.json", "rub.json", "rub")
    build_verse_range_units("quran-metadata-manzil.json", "manzil.json", "manzil")

    # --- sajda list -> page number (for sajda markers / navigation) ---
    try:
        sajda_meta = load_json("quran-metadata-sajda.json")
        sajda_out = []
        for sid, info in sajda_meta.items():
            page = page_for_verse_key(info["verse_key"])
            sajda_out.append({
                "verseKey": info["verse_key"],
                "type": info["sajdah_type"],
                "page": page,
            })
        with open(os.path.join(OUT_DIR, "sajda.json"), "w", encoding="utf-8") as f:
            json.dump(sajda_out, f, ensure_ascii=False, separators=(",", ":"))
    except FileNotFoundError:
        print("sajda metadata not found, skipping")

    # --- surah -> starting page (for surah navigation) ---
    surah_pages = {}
    for pi, p in enumerate(pages, start=1):
        for line in p:
            if line["t"] == "s" and str(line["surah"]) not in surah_pages:
                surah_pages[str(line["surah"])] = pi
    with open(os.path.join(OUT_DIR, "surah-pages.json"), "w", encoding="utf-8") as f:
        json.dump(surah_pages, f, ensure_ascii=False, separators=(",", ":"))

    # --- per-ayah page + word-id bounds (for the ayah picker & on-page
    #     highlighting: given a selected surah:ayah, find its page to jump
    #     to, and its [firstWordId, lastWordId] range to know which glyphs
    #     to highlight when that page renders) ---
    ayah_meta = load_json("quran-metadata-ayah.json")
    # sort ayahs by their id (global sequential order) so we can derive each
    # ayah's lastWordId as "next ayah's firstWordId - 1"
    ayah_entries = sorted(ayah_meta.values(), key=lambda a: a["id"])
    ayahs_by_surah = {}
    for idx, a in enumerate(ayah_entries):
        s, ay = a["surah_number"], a["ayah_number"]
        first_wid = ayah_first_word.get(f"{s}:{ay}")
        if first_wid is None:
            continue
        if idx + 1 < len(ayah_entries):
            next_first_wid = ayah_first_word.get(f"{ayah_entries[idx+1]['surah_number']}:{ayah_entries[idx+1]['ayah_number']}")
            last_wid = (next_first_wid - 1) if next_first_wid else first_wid
        else:
            last_wid = max_word_id
        page = word_page.get(first_wid)
        ayahs_by_surah.setdefault(str(s), []).append([page, first_wid, last_wid])
    with open(os.path.join(OUT_DIR, "ayahs.json"), "w", encoding="utf-8") as f:
        json.dump(ayahs_by_surah, f, ensure_ascii=False, separators=(",", ":"))

    # --- page -> first ayah on it (surah, ayah), for "select this page's
    #     first ayah" default-selection behaviour ---
    page_first_ayah = {}
    for pi, p in enumerate(pages, start=1):
        for line in p:
            if line["t"] == "a" and line["w"]:
                first_wid_on_page = line["w"][0]["i"]
                sa = word_surah_ayah.get(first_wid_on_page)
                if sa:
                    page_first_ayah[str(pi)] = list(sa)
                break
    with open(os.path.join(OUT_DIR, "page-first-ayah.json"), "w", encoding="utf-8") as f:
        json.dump(page_first_ayah, f, ensure_ascii=False, separators=(",", ":"))

    # --- surah header decorative glyph (precomputed SVG layers) ---
    # QCF_SurahHeader_COLOR is a COLR/CPAL colour font: each surah's header
    # box is ONE glyph made of several coloured outline layers. We extract
    # those layers to raw SVG path data at build time (font units) so the
    # app can draw them as plain SVG paths -- exactly like the main mushaf
    # text -- instead of depending on the browser's COLR support and CSS
    # font-size arithmetic inside a foreignObject.
    try:
        from fontTools.ttLib import TTFont as _TTFont
        from fontTools.pens.svgPathPen import SVGPathPen as _SVGPathPen
        from fontTools.pens.boundsPen import BoundsPen as _BoundsPen

        hf = _TTFont(os.path.join(DATA_DIR, "QCF_SurahHeader_COLOR-Regular.woff2"))
        hcmap = hf.getBestCmap()
        hcolr = hf["COLR"]
        hcpal = hf["CPAL"]
        hglyphs = hf.getGlyphSet()
        hpalette = hcpal.palettes[0]
        hupem = hf["head"].unitsPerEm

        def _color_hex(idx):
            if idx == 0xFFFF:
                return "currentColor"
            c = hpalette[idx]
            a = c.alpha / 255
            if a >= 0.999:
                return f"#{c.red:02x}{c.green:02x}{c.blue:02x}"
            return f"rgba({c.red},{c.green},{c.blue},{a:.3f})"

        header_glyphs = {}
        for sid in surahs:
            glyphchar = baslik_lig.get(f"surah-{sid}")
            if not glyphchar:
                continue
            ch = glyphchar.strip()
            if not ch or ord(ch) not in hcmap:
                continue
            base_glyph_name = hcmap[ord(ch)]
            layer_records = hcolr.ColorLayers.get(base_glyph_name)
            if not layer_records:
                continue

            layers_out = []
            bounds = _BoundsPen(hglyphs)
            for layer in layer_records:
                pen = _SVGPathPen(hglyphs)
                hglyphs[layer.name].draw(pen)
                d = pen.getCommands()
                if d:
                    layers_out.append({"d": d, "fill": _color_hex(layer.colorID)})
                hglyphs[layer.name].draw(bounds)

            if not layers_out or bounds.bounds is None:
                continue
            xmin, ymin, xmax, ymax = bounds.bounds
            header_glyphs[sid] = {
                "upem": hupem,
                "bbox": [xmin, ymin, xmax, ymax],
                "layers": layers_out,
            }

        os.makedirs(os.path.join(OUT_DIR, "surah-headers"), exist_ok=True)
        for sid, gdata in header_glyphs.items():
            with open(os.path.join(OUT_DIR, "surah-headers", f"{sid}.json"), "w", encoding="utf-8") as f2:
                json.dump(gdata, f2, ensure_ascii=False, separators=(",", ":"))
        print(f"Extracted {len(header_glyphs)} surah header glyphs -> data/surah-headers/<n>.json")
    except Exception as e:
        print("WARNING: could not extract surah header glyphs:", e)

    # sizes report
    for fn in os.listdir(OUT_DIR):
        fp = os.path.join(OUT_DIR, fn)
        print(f"{fn}: {os.path.getsize(fp)/1024:.1f} KB")


if __name__ == "__main__":
    main()
