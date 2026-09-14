This project's line-justification algorithm (js/justify.js) and glyph-level
SVG rendering technique (js/render.js) are adapted from the DigitalKhatt
project, © 2020–present DigitalKhatt contributors, used under the MIT
License below. Source: https://github.com/DigitalKhatt/digitalkhatt-js
(apps/site-angular/src/app/components/hbmedina/{just.service.ts,harfbuzz.ts,page_view.ts})

This project also vendors harfbuzzjs (vendor/hb.wasm, vendor/hb.js,
vendor/hbjs.js), © harfbuzzjs contributors, MIT License (see vendor/LICENSE),
and wawoff2's decompress-only build (vendor/woff2-decompress/decompress.js,
vendor/woff2-decompress/decompress.wasm), © the WOFF2 Authors / fontello
contributors, MIT License (see vendor/woff2-decompress/LICENSE). Source:
https://github.com/fontello/wawoff2

fonts/DigitalKhattV2.woff2 is the "DigitalKhatt New Madina" font, taken
directly from the same DigitalKhatt repository above
(apps/site-angular/src/assets/fonts/hb/madina.otf) and re-packaged as WOFF2
(losslessly -- same sfnt tables, ~86% smaller) using fontTools
(`font.flavor = "woff2"; font.save(...)`). Note: this is NOT the same file
as the "Digital Khatt V2 Font" resource on qul.tarteel.ai/resources (font id
247) -- that QUL-hosted build is missing the cv01-cv18 OpenType
character-variant features (kashida elongation) that js/justify.js relies on,
so it was replaced with this one. HarfBuzz needs raw sfnt bytes, not the
WOFF2 container, so js/app.js decompresses it back to the original OTF
bytes client-side via vendor/woff2-decompress/ before handing it to
hb.createBlob(); CSS's @font-face loads the same .woff2 file natively
instead (browsers decode WOFF2 themselves, no JS needed there).

----

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
