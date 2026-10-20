// Regression check for markTafsirLanguages (js/tafsir.js) -- Sa'dî tefsirinin dil işaretleri (WCAG 3.1.2, Dil
// Parçaları). Belge dili `tr`; ekran okuyucu/TTS sesi lang'e göre seçiyor. data/tafsir-saadi.json (QUL exportu,
// her parçaya otomatik dil tespiti uygulanmış) iki yönde yanlış: metin içi Arapça alıntılar çoğunlukla işaretsiz
// (Türkçe sesle okunur), kısa Türkçe parçalar da yanlışlıkla az/ku/de/hi-Latn/... etiketli. İşlev bunları çizim
// anında düzeltiyor (veri dosyası değişmedi). Altı bölüm:
//   1. işlevin birim kontrolleri (kenar durumlar dahil: iç içe etiketler, void/dengesiz etiketler, tekrar uygulama),
//   2. veri varsayımları: işlev etiket/metin ayırıp açık etiketlerin dilini bir yığında izliyor, tam bir HTML
//      ayrıştırıcı değil -- bu yüzden verinin yalnızca p/div/span, yalnızca class/lang, çift tırnaklı, dengeli
//      olduğu burada doğrulanıyor (ileride başka biçim gelirse sessizce yanlış çalışmasın, burada kırılsın),
//   3. TÜM veri taraması (gerçek jsdom HTML ayrıştırıcısı): her metin düğümünün ETKİN dili (en yakın lang'li ata,
//      yoksa belge dili tr) -- Arapça yazılı düğüm ar, Latin yazılı düğüm tr olmalı; metin birebir aynı kalmalı;
//      eklenen sarmalayıcılar geri alınınca özgün veri geri gelmeli,
//   4. resolveTafsirText (ayet panelinin yolu) işaretlenmiş metni veriyor, yönlendirmeli ayetlerde de,
//   5. arama özeti (düz metin + <mark>) aynı işlevden geçiyor: kaynak kablolaması + gerçek pencerelerde tarama,
//   6. app.js'in tefsir panelinin işaretleyiciyi atlamadan resolveTafsirText'ten beslendiği.
//
// jsdom gerekiyor (test/package.json'da devDependency):
//   npm install && node tafsir_dil_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";
import { markTafsirLanguages, resolveTafsirText } from "../js/tafsir.js";
import { htmlToPlainText, snippetHTML } from "../js/search.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const data = JSON.parse(readText("data", "tafsir-saadi.json"));
const appSource = readText("js", "app.js");
const aramaSource = readText("js", "arama.js");

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}

const A1 = "إياك";
const A2 = "الدين";
const OPEN = "﴾"; // ﴾
const CLOSE = "﴿"; // ﴿
const mark = markTafsirLanguages;
const wrap = (s) => `<span lang="ar">${s}</span>`;

// -- 1. birim kontrolleri -----------------------------------------------------------------------------------
check('boş/null/undefined -> ""', mark("") === "" && mark(null) === "" && mark(undefined) === "");
check("Arapça ve etiket içermeyen metne dokunmuyor", mark("düz Türkçe metin, 1. ayet.") === "düz Türkçe metin, 1. ayet.");
check("tek Arapça sözcük kendi <span lang=\"ar\">'ı içine alınıyor, çevresine dokunulmuyor", mark(`a ${A1} b`) === `a ${wrap(A1)} b`);
check("aralarında yalnızca boşluk olan Arapça sözcükler TEK span (kenar boşlukları dışarıda)", mark(`x  ${A1} ${A2}  y`) === `x  ${wrap(`${A1} ${A2}`)}  y`);
check("aralarında Türkçe sözcük olan Arapça sözcükler AYRI span", mark(`${A1} ve ${A2}`) === `${wrap(A1)} ve ${wrap(A2)}`);
check("Arapça-Türkçe karma metin düğümü: yalnızca Arapça parça sarılıyor", mark(`“${A1} : Sana”`) === `“${wrap(A1)} : Sana”`);
check("ayet ayracı (﴾ ﴿) Arapça blokla birlikte tek span'a giriyor", mark(`${OPEN} ${A1} ${A2} ${CLOSE} /`) === `${wrap(`${OPEN} ${A1} ${A2} ${CLOSE}`)} /`);
check("harekeli Arapça (ayet metni) bütün olarak sarılıyor", (() => {
  const v = "وَإِنَّآ أَوۡ إِيَّاكُمۡ لَعَلَىٰ هُدًى";
  return mark(`a ${v} b`) === `a ${wrap(v)} b`;
})());
check("etiketin KENDİSİNE (öznitelik değerine) dokunmuyor: Arapça içeren bir title sarılmıyor", mark(`<span class="x" title="${A1}">t</span>`) === `<span class="x" title="${A1}">t</span>`);
check("Arapça içermeyen etiketli metne dokunmuyor", mark('<p class="tr translation" lang="tr">a</p><div lang="tr" class="tr "><span class="green">(b)</span></div>') === '<p class="tr translation" lang="tr">a</p><div lang="tr" class="tr "><span class="green">(b)</span></div>');

// yanlış dil etiketi -> tr (başka hiçbir öznitelik/metin değişmiyor)
check("tr/ar dışındaki lang tr'ye çevriliyor; sınıf adındaki 'az' gibi şeylere dokunulmuyor", mark('<span class="az green" lang="az">(tamlanan)</span>') === '<span class="az green" lang="tr">(tamlanan)</span>');
check("hi-Latn gibi betik alt etiketli değerler de tr oluyor", mark('<span lang="hi-Latn" class="green">(bilin ki)</span>') === '<span lang="tr" class="green">(bilin ki)</span>');
check("doğru etiketler (tr, ar) olduğu gibi kalıyor", mark('<div lang="tr" class="tr ">x</div>') === '<div lang="tr" class="tr ">x</div>' && mark(`<span class="ar green" lang="ar">(${A1})</span>`) === `<span class="ar green" lang="ar">(${A1})</span>`);
check("lang'ı olmayan etiketlere lang EKLENMİYOR", mark('<span class="brown">a</span>') === '<span class="brown">a</span>');

// dil bağlamı (yığın)
check("zaten lang=\"ar\" olan öğenin içindeki Arapça yeniden sarılmıyor", mark(`<span class="ar green" lang="ar">(${A1})</span>`) === `<span class="ar green" lang="ar">(${A1})</span>`);
check("ar etiketli atanın içindeki, lang'sız alt öğede de sarılmıyor (dil devralınıyor)", mark(`<div lang="ar"><span class="x">${A1}</span></div>`) === `<div lang="ar"><span class="x">${A1}</span></div>`);
check("ar etiketli öğe kapanınca dil geri yükleniyor: sonraki Arapça sarılıyor", mark(`<span lang="ar">${A1}</span> ${A2}`) === `<span lang="ar">${A1}</span> ${wrap(A2)}`);
check("ar etiketli atanın içindeki tr etiketli öğede Arapça yine sarılıyor (kendi lang'ı baskın)", mark(`<div lang="ar"><span lang="tr">${A1}</span></div>`) === `<div lang="ar"><span lang="tr">${wrap(A1)}</span></div>`);
check("yanlış etiketli (da) öğenin içindeki Arapça: öğe tr olur, Arapça sarılır", mark(`<span lang="da">yüksekliğe eden “ ${A1} :</span>`) === `<span lang="tr">yüksekliğe eden “ ${wrap(A1)} :</span>`);
check("iç içe etiketlerde kapanışlar doğru geri yüklüyor (ar > tr > ar)", mark(`<div lang="ar"><span lang="tr">${A1}</span>${A2}</div>${A1}`) === `<div lang="ar"><span lang="tr">${wrap(A1)}</span>${A2}</div>${wrap(A1)}`);
check("void etiket (<br>, <br/>) yığını bozmuyor", mark(`<span lang="ar">a<br>${A1}<br/>${A2}</span>${A1}`) === `<span lang="ar">a<br>${A1}<br/>${A2}</span>${wrap(A1)}`);
check('void olmayan etiketteki "/>" tarayıcıda yok sayılır (<span/> açık öğedir): yığın buna göre izleniyor', mark(`<span lang="ar"/>${A1}</span>${A2}`) === `<span lang="ar"/>${A1}</span>${wrap(A2)}`);
check("fazladan kapanış etiketi çökmüyor ve sonrasını bozmuyor", mark(`a</span> ${A1}`) === `a</span> ${wrap(A1)}`);
check("kapanmamış etiket çökmüyor (sonrasında dil devralınıyor)", mark(`<span lang="ar">${A1} ${A2}`) === `<span lang="ar">${A1} ${A2}`);
check("tekrar uygulamak sonucu değiştirmiyor (sarmalayıcı ikilenmiyor, lang ikilenmiyor)", (() => {
  const src = `<p lang="tr">a ${A1} b</p><div lang="de" class="x">“${A1} : Sana” ${OPEN} ${A2} ${CLOSE}<span lang="ar">${A2}</span></div>`;
  const once = mark(src);
  return mark(once) === once && once !== src && !/lang="de"/.test(once);
})());
check("sayı verilince metne çevriliyor, çökmüyor", mark(123) === "123");

// -- 2. veri varsayımları -----------------------------------------------------------------------------------
const anchors = Object.entries(data).filter(([, v]) => v && typeof v === "object");
const redirects = Object.entries(data).filter(([, v]) => typeof v === "string");
{
  const tagNames = new Set();
  const attrNames = new Set();
  let unquotedLang = 0;
  let strayAngle = 0;
  let unbalanced = 0;
  let entities = 0;
  for (const [, v] of anchors) {
    const t = v.text;
    for (const m of t.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>/g)) {
      tagNames.add(m[2].toLowerCase());
      for (const a of m[3].matchAll(/\s([a-zA-Z:-]+)=/g)) attrNames.add(a[1]);
    }
    unquotedLang += (t.match(/\slang=(?!")/g) || []).length;
    strayAngle += /[<>]/.test(t.replace(/<\/?[a-zA-Z][^<>]*>/g, "")) ? 1 : 0;
    const opens = (t.match(/<(?:p|div|span)\b[^<>]*>/g) || []).length;
    const closes = (t.match(/<\/(?:p|div|span)>/g) || []).length;
    if (opens !== closes) unbalanced++;
    entities += (t.match(/&[#\w]+;/g) || []).length;
  }
  check(`veride yalnızca p/div/span etiketleri var (bulunan: ${[...tagNames].sort().join(", ")})`, [...tagNames].every((n) => ["p", "div", "span"].includes(n)) && tagNames.size > 0);
  check(`veride yalnızca class/lang öznitelikleri var (bulunan: ${[...attrNames].sort().join(", ")})`, [...attrNames].every((n) => n === "class" || n === "lang") && attrNames.has("lang"));
  check("her lang özniteliği çift tırnaklı", unquotedLang === 0);
  check("etiket dışında '<' veya '>' yok (metin düğümleri ayrıştırıcıyla aynı bölünüyor)", strayAngle === 0);
  check("her girdide açılış/kapanış etiketi sayısı eşit (yığın dengeli)", unbalanced === 0);
  check("veride HTML varlığı (&...;) yok (Arapça harf varlık olarak gizlenemez)", entities === 0);
  check(`tarama anlamlı: ${anchors.length} çapa girdi, ${redirects.length} yönlendirme`, anchors.length > 1500 && redirects.length > 4000);
}

// -- 3. TÜM veri taraması (gerçek HTML ayrıştırıcı) -----------------------------------------------------------
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const LATIN_RE = /[A-Za-zçğıöşüÇĞİÖŞÜâîûÂÎÛ]/;
const dom = new JSDOM('<!doctype html><html lang="tr"><body><div id="c"></div></body></html>');
const doc = dom.window.document;
const holder = doc.getElementById("c");
// Metin düğümünün etkin dili: en yakın lang'li ata, yoksa belge dili (tr)
function effectiveLang(node) {
  for (let e = node.parentElement; e && e !== holder; e = e.parentElement) {
    if (e.hasAttribute("lang")) return e.getAttribute("lang");
  }
  return "tr";
}
// html -> { ar: [[metin, dil]...], lat: [...], text: düz metin }
function scan(html) {
  holder.innerHTML = html;
  const out = { ar: [], lat: [], text: holder.textContent };
  const walker = doc.createTreeWalker(holder, 4 /* NodeFilter.SHOW_TEXT */);
  let n;
  while ((n = walker.nextNode())) {
    const t = n.nodeValue;
    if (!t.trim()) continue;
    const lang = effectiveLang(n);
    if (ARABIC_RE.test(t)) out.ar.push([t, lang]);
    if (LATIN_RE.test(t)) out.lat.push([t, lang]);
  }
  return out;
}
{
  let rawArWrong = 0; // ham veride Arapça yazılı ama dili ar olmayan düğüm
  let rawLatWrong = 0; // ham veride Latin yazılı ama dili tr olmayan düğüm
  let arNodes = 0;
  let arBad = 0;
  let latNodes = 0;
  let latBad = 0;
  let textChanged = 0;
  let notIdempotent = 0;
  let foreignLeft = 0;
  let unwrapMismatch = 0;
  let wrappers = 0;
  for (const [, v] of anchors) {
    const raw = v.text;
    const before = scan(raw);
    rawArWrong += before.ar.filter(([, l]) => l !== "ar").length;
    rawLatWrong += before.lat.filter(([, l]) => l !== "tr").length;
    const out = mark(raw);
    const after = scan(out);
    arNodes += after.ar.length;
    latNodes += after.lat.length;
    arBad += after.ar.filter(([, l]) => l !== "ar").length;
    latBad += after.lat.filter(([, l]) => l !== "tr").length;
    if (after.text !== before.text) textChanged++;
    if (mark(out) !== out) notIdempotent++;
    holder.innerHTML = out;
    holder.querySelectorAll("[lang]").forEach((e) => {
      const l = e.getAttribute("lang");
      if (l !== "tr" && l !== "ar") foreignLeft++;
    });
    wrappers += (out.match(/<span lang="ar">/g) || []).length;
    // Eklenen sarmalayıcıları (özgün veride sınıfsız <span lang="ar"> yok) geri al; lang değerleri tr'ye normalize
    // edilmiş özgün veri geri gelmeli -- yani işlev bunun dışında hiçbir şeye dokunmamış.
    const unwrapped = out.replace(/<span lang="ar">([^<]*)<\/span>/g, "$1");
    const normalized = raw.replace(/(<[a-zA-Z][^<>]*?\slang=")([^"]*)(")/g, (m, a, b, c) => a + (b === "ar" ? "ar" : "tr") + c);
    if (unwrapped !== normalized) unwrapMismatch++;
  }
  check(`tarama anlamlı: ham veride ${rawArWrong} Arapça düğüm dili ar değil, ${rawLatWrong} Türkçe düğüm dili tr değil (düzeltilecek şey var)`, rawArWrong > 100 && rawLatWrong > 500);
  check(`işaretlemeden sonra Arapça yazılı HER metin düğümünün etkin dili ar (${arNodes} düğüm)`, arNodes > 150 && arBad === 0);
  check(`işaretlemeden sonra Latin (Türkçe) yazılı HER metin düğümünün etkin dili tr (${latNodes} düğüm)`, latNodes > 50000 && latBad === 0);
  check("işaretlemeden sonra tr/ar dışında lang değeri kalmıyor", foreignLeft === 0);
  check(`hiçbir girdinin metni değişmiyor (${anchors.length} girdi, textContent birebir aynı)`, textChanged === 0);
  check("eklenen sarmalayıcılar geri alınınca özgün veri (yalnızca lang değerleri tr'ye normalize) birebir geri geliyor", unwrapMismatch === 0 && wrappers > 100);
  check("iki kez uygulamak hiçbir girdide sonucu değiştirmiyor", notIdempotent === 0);
}

// -- 4. resolveTafsirText (ayet panelinin yolu) -------------------------------------------------------------
{
  const anchorText = data["1:1"].text;
  const resolved = resolveTafsirText(data, 1, 1);
  check("resolveTafsirText: çapa ayet işaretlenmiş metni veriyor (ham metinden farklı, Arapça sarılı)", resolved === mark(anchorText) && resolved !== anchorText && resolved.includes('<span lang="ar">'));
  check("resolveTafsirText: yönlendirmeli ayet (1:7 -> 1:1) çapayla aynı işaretli metni veriyor", data["1:7"] === "1:1" && resolveTafsirText(data, 1, 7) === resolved);
  check("resolveTafsirText: verisi olmayan ayet / yüklenmemiş veri -> null (çökme yok)", resolveTafsirText(data, 999, 1) === null && resolveTafsirText(null, 1, 1) === null);
  const brokenData = { "1:1": { text: "" }, "1:2": "1:1" };
  check("resolveTafsirText: boş metinli girdi -> null", resolveTafsirText(brokenData, 1, 1) === null && resolveTafsirText(brokenData, 1, 2) === null);
}

// -- 5. arama özeti (düz metin + <mark>) --------------------------------------------------------------------
check("arama.js: işaretleyici ./tafsir.js'ten alınıyor", /import \{ markTafsirLanguages \} from "\.\/tafsir\.js";/.test(aramaSource));
check("arama.js: tafsirRowHTML özeti markTafsirLanguages'tan geçiriyor", /<span class="arama-snippet">\$\{markTafsirLanguages\(snippetHTML\(plain, terms, \{ maxLen: 260, lead: 80 \}\)\)\}<\/span>/.test(aramaSource));
{
  // Gerçek özet işlevi (snippetHTML) + gerçek düz metin (htmlToPlainText): Arapça içeren 99 girdinin metni boyunca
  // her 150 karakterde bir pencere, hem terimsiz hem "allah" vurgulu. Arapça yazılı her düğüm ar olmalı, Latin yazılı
  // hiçbir düğüm ar olmamalı, vurgu (<mark>) bozulmamalı, metin aynı kalmalı.
  let windows = 0;
  let arSeen = 0;
  let arBad = 0;
  let latInAr = 0;
  let textChanged = 0;
  let markLost = 0;
  for (const [, v] of anchors) {
    const plain = htmlToPlainText(v.text);
    if (!ARABIC_RE.test(plain)) continue;
    for (let i = 0; i < plain.length; i += 150) {
      for (const terms of [[], ["allah"]]) {
        const win = plain.slice(i, i + 400);
        const snip = snippetHTML(win, terms, { maxLen: 260, lead: 80 });
        const marked = mark(snip);
        const s = scan(marked);
        windows++;
        arSeen += s.ar.length;
        arBad += s.ar.filter(([, l]) => l !== "ar").length;
        latInAr += s.lat.filter(([, l]) => l === "ar").length;
        if (s.text !== scan(snip).text) textChanged++;
        if ((snip.match(/<mark /g) || []).length !== (marked.match(/<mark /g) || []).length) markLost++;
      }
    }
  }
  check(`tarama anlamlı: ${windows} özet penceresinde ${arSeen} Arapça düğüm`, windows > 500 && arSeen > 100);
  check("özetlerde Arapça yazılı her düğümün etkin dili ar", arBad === 0);
  check("özetlerde Latin yazılı hiçbir düğüm yanlışlıkla ar içine alınmıyor", latInAr === 0);
  check("özetlerin metni değişmiyor, <mark> vurguları kaybolmuyor", textChanged === 0 && markLost === 0);
}

// -- 6. app.js: tefsir paneli işaretleyiciyi atlamıyor ------------------------------------------------------
check("app.js: tafsirContentHTML metni resolveTafsirText'ten alıyor (işaretleyici tek noktada, panel onu atlamıyor)", /function tafsirContentHTML\(sourceId, ayah\) \{[\s\S]*?const text = resolveTafsirText\(getCachedTafsirData\(sourceId\), ayah\.surah, ayah\.ayah\);/.test(appSource));
check("app.js: tefsir verisinin .text alanı resolveTafsirText dışında doğrudan okunmuyor", !/getCachedTafsirData\([^)]*\)\s*\[[^\]]*\]\s*\.text|\.text\b[^\n]*tafsir/i.test(appSource.replace(/\/\/[^\n]*/g, "")));

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log(`All checks passed (Sa'dî tefsiri dil işaretleri: birim kontrolleri, veri varsayımları, ${anchors.length} girdilik tam tarama, panel yolu, arama özetleri).`);
}
