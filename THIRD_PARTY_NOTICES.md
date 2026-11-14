# Third-party notices

Mushaf (Dijital Kur'an-ı Kerim) bundles, adapts or links to the third-party
works listed below. The licenses of the code and fonts are reproduced in this
file or in the files named here. Data, audio and the QCF surah-header font are
a different matter: where they come from, and what could and could not be
verified about their terms, is documented (in Turkish) in VERI_KAYNAKLARI.md.
They are NOT covered by this project's own license (see LICENSE).

----

## 1. Code adapted from DigitalKhatt (MIT)

This project's line-justification algorithm (js/justify.js) and glyph-level
SVG rendering technique (js/render.js) are adapted from the DigitalKhatt
project, © 2020–present DigitalKhatt contributors, used under the MIT
License in section 4.1 below. Source: https://github.com/DigitalKhatt/digitalkhatt-js
(apps/site-angular/src/app/components/hbmedina/{just.service.ts,harfbuzz.ts,page_view.ts})

## 2. Vendored libraries and WebAssembly builds

### 2.1 harfbuzzjs (vendor/hb.wasm, vendor/hb.js, vendor/hbjs.js)

© harfbuzzjs contributors (Copyright (c) 2019 Ebrahim Byagowi). MIT License,
except the Zephyr libc string functions (zephyr-string.c) and emmalloc.cpp
(from the Emscripten project), which are under the Apache License 2.0. The
project's own statement is kept unchanged in vendor/LICENSE; the full text of
the Apache License 2.0 is in vendor/LICENSE-Apache-2.0.
Source: https://github.com/harfbuzz/harfbuzzjs

### 2.2 HarfBuzz (compiled into vendor/hb.wasm)

vendor/hb.wasm is a WebAssembly build of HarfBuzz (the binary contains the
version string 10.4.0, apparently the HarfBuzz version), so HarfBuzz's own
license applies to it as well. HarfBuzz is licensed under the so-called "Old
MIT" license; its notice, as published in HarfBuzz's COPYING file
(https://github.com/harfbuzz/harfbuzz/blob/main/COPYING, read on 2026-11-13),
is reproduced in section 4.3 below.

### 2.3 wawoff2 (vendor/woff2-decompress/decompress.js, decompress.wasm)

This project vendors wawoff2's decompress-only build, © the WOFF2 Authors /
fontello contributors, MIT License (see vendor/woff2-decompress/LICENSE).
Source: https://github.com/fontello/wawoff2

### 2.4 Brotli (compiled into vendor/woff2-decompress/decompress.wasm)

WOFF2 decoding needs the Brotli decoder, and decompress.wasm contains it (its
built-in dictionary is present in the binary). Brotli is © 2009, 2010,
2013-2016 by the Brotli Authors, MIT License (section 4.2 below).
Source: https://github.com/google/brotli

## 3. Font (fonts/DigitalKhattV2.woff2)

fonts/DigitalKhattV2.woff2 is the "DigitalKhatt New Madina" font, taken
directly from the same DigitalKhatt repository above
(apps/site-angular/src/assets/fonts/hb/madina.otf) and re-packaged as WOFF2
(losslessly -- same sfnt tables, ~86% smaller) using fontTools
(`font.flavor = "woff2"; font.save(...)`). The repository's LICENSE file (MIT,
section 4.1 below) is the only license statement found for it; the font file
itself was not checked for a separate notice.
Note: this is NOT the same file as the "Digital Khatt V2 Font" resource on
qul.tarteel.ai/resources (font id 247) -- that QUL-hosted build is missing the
cv01-cv18 OpenType character-variant features (kashida elongation) that
js/justify.js relies on, so it was replaced with this one. HarfBuzz needs raw
sfnt bytes, not the WOFF2 container, so js/app.js decompresses it back to the
original OTF bytes client-side via vendor/woff2-decompress/ before handing it
to hb.createBlob(); CSS's @font-face loads the same .woff2 file natively
instead (browsers decode WOFF2 themselves, no JS needed there).

----

## 4. License texts

### 4.1 MIT License (DigitalKhatt)

MIT License

Copyright (c) 2020–present DigitalKhatt contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### 4.2 MIT License (Brotli)

Copyright (c) 2009, 2010, 2013-2016 by the Brotli Authors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

### 4.3 HarfBuzz "Old MIT" license

HarfBuzz is licensed under the so-called "Old MIT" license. Details follow.
For parts of HarfBuzz that are licensed under different licenses see individual
files names COPYING in subdirectories where applicable.

Copyright © 2010-2022  Google, Inc.
Copyright © 2015-2020  Ebrahim Byagowi
Copyright © 2019,2020  Facebook, Inc.
Copyright © 2012,2015  Mozilla Foundation
Copyright © 2011  Codethink Limited
Copyright © 2008,2010  Nokia Corporation and/or its subsidiary(-ies)
Copyright © 2009  Keith Stribley
Copyright © 2011  Martin Hosken and SIL International
Copyright © 2007  Chris Wilson
Copyright © 2005,2006,2020,2021,2022,2023  Behdad Esfahbod
Copyright © 2004,2007,2008,2009,2010,2013,2021,2022,2023  Red Hat, Inc.
Copyright © 1998-2005  David Turner and Werner Lemberg
Copyright © 2016  Igalia S.L.
Copyright © 2022  Matthias Clasen
Copyright © 2018,2021  Khaled Hosny
Copyright © 2018,2019,2020  Adobe, Inc
Copyright © 2013-2015  Alexei Podtelezhnikov

For full copyright notices consult the individual files in the package.


Permission is hereby granted, without written agreement and without
license or royalty fees, to use, copy, modify, and distribute this
software and its documentation for any purpose, provided that the
above copyright notice and the following two paragraphs appear in
all copies of this software.

IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE TO ANY PARTY FOR
DIRECT, INDIRECT, SPECIAL, INCIDENTAL, OR CONSEQUENTIAL DAMAGES
ARISING OUT OF THE USE OF THIS SOFTWARE AND ITS DOCUMENTATION, EVEN
IF THE COPYRIGHT HOLDER HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH
DAMAGE.

THE COPYRIGHT HOLDER SPECIFICALLY DISCLAIMS ANY WARRANTIES, INCLUDING,
BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS FOR A PARTICULAR PURPOSE.  THE SOFTWARE PROVIDED HEREUNDER IS
ON AN "AS IS" BASIS, AND THE COPYRIGHT HOLDER HAS NO OBLIGATION TO
PROVIDE MAINTENANCE, SUPPORT, UPDATES, ENHANCEMENTS, OR MODIFICATIONS.

----

## 5. GitHub mark (inline SVG in index.html)

The footer link "Kaynak Kod — GitHub" in index.html contains an inline SVG of
the GitHub mark (the "Invertocat" logo), which is a GitHub trademark. It is
used only to link to this project's own repository. GitHub's brand guidelines
(https://brand.github.com/foundations/logo, read on 2026-11-14) list using the
Invertocat logo as a link to your GitHub profile or project as a permitted use;
they also say the logo must not be modified, including its color and
dimensions. Here the icon is scaled uniformly and drawn in the footer link's
text color (CSS currentColor); whether that color counts as a modification was
not checked.

The Octicons icon set (https://github.com/primer/octicons, MIT License,
Copyright (c) GitHub Inc.) also contains a "mark-github" icon, and the Octicons
usage guidelines refer to GitHub's brand guidelines for the logos. The SVG path
used here is not identical to that icon in @primer/octicons 9.6.0 or 19.42.0,
so where this exact path came from is unknown. This project's license (LICENSE)
does not extend to the GitHub mark.
