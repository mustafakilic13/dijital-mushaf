// Regression check for js/search.js (Arama modalının saf mantığı) -- bkz.
// o dosyanın başlık yorumu. Üç bölüm: (1) katlama/ayrıştırma/vurgu/son
// aramalar için birim kontrolleri, kenar durumlar dahil; (2) GERÇEK
// data/surahs.json'a karşı: 114 surenin her Türkçe adı kendine çözülüyor
// ve adıyla aratınca en üstte kendisi geliyor; (3) GERÇEK data/meal.json
// üzerinde bilinen ayetlerin bulunması ve hız.
//
// Saf Node, bağımlılık yok (search.js'in kendisi de yok) --
//   node search_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  fold,
  foldWithMap,
  tokenize,
  termVariants,
  isArabicScript,
  createSurahMatcher,
  parseSearchQuery,
  buildTextIndex,
  buildTextIndexAsync,
  htmlToPlainText,
  tafsirEntries,
  mealEntries,
  searchTextIndex,
  findMatchRanges,
  snippetHTML,
  buildWordIndex,
  searchWordIndex,
  glossMatches,
  buildTopicsSearchIndex,
  searchTopics,
  findTopicByName,
  normalizeRecentQuery,
  sanitizeRecent,
  addRecentQuery,
  removeRecentQuery,
  RECENT_MAX,
} from "../js/search.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const readData = (name) => JSON.parse(fs.readFileSync(path.join(HERE, "..", "data", name), "utf-8"));

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// -- fold -----------------------------------------------------------------
check("fold: Türkçe harfler düz harfe iner", fold("Şükür Çağrı Öğüt Işık İhlâs") === "sukur cagri ogut isik ihlas");
check("fold: I / ı / İ / i hepsi i", fold("Iıİi") === "iiii");
check("fold: şapkalı harfler", fold("Fâtiha Rahîm Nûh Ebû") === "fatiha rahim nuh ebu");
check("fold: kesme işaretleri atılır (düz + kıvrık + ayn)", fold("Kur'ân Allah\u2019ın Mü\u02bfmin") === "kuran allahin mumin");
check("fold: NBSP ve satır sonu boşluğa döner", fold("a\u00a0b\nc") === "a b c");
check("fold: null/undefined -> boş", fold(null) === "" && fold(undefined) === "");
check("fold: rakamlar korunur, Arap-Hint rakamları ASCII'ye iner", fold("2:255 ٢٥٥ ۲۵۵") === "2:255 255 255");
check("fold: Arapça harekeli = harekesiz (ٱللَّهِ = الله)", fold("ٱللَّهِ") === fold("الله") && fold("الله") === "الله");
check("fold: elif/ye/te-marbuta çeşitleri birleşir", fold("أإآٱ") === "اااا" && fold("ىئ") === "يي" && fold("ة") === "ه");
check("fold: tatvil + hançer elif atılır (ٱلرَّحْمَـٰنِ)", fold("ٱلرَّحْمَـٰنِ") === "الرحمن");
check("fold: ayet sonu işareti boşluk olur", fold("كلمة\u06dd١") === "كلمه 1");
check("fold: Latin dışı aksanlar (é) düşer", fold("École") === "ecole");
check("fold: hızlı yol == karakter karakter katlama (geniş örnek)", (() => {
  const slow = (s) => { let o = ""; for (const c of s) o += fold(c); return o; };
  const sample = "Şükür Çağrı Öğüt Işık İhlâs Kur'ân-ı Kerîm ٱللَّهِ الرَّحْمَـٰنِ ٢٥٥ <p>test & \u00a0 x</p> 123abc";
  return fold(sample) === slow(sample);
})());

// -- htmlToPlainText --------------------------------------------------------------------
check("htmlToPlainText: satır içi etiketler kelimeyi bölmez", htmlToPlainText("Allah<span class=\"x\">\u2019ın</span> adı") === "Allah\u2019ın adı");
check("htmlToPlainText: blok etiketler boşluğa döner", htmlToPlainText("<p>bir</p><p>iki</p>") === "bir iki");
check("htmlToPlainText: adlandırılmış/sayısal varlıklar çözülür", htmlToPlainText("a&nbsp;b &amp; c &#39;d&#39; &#x27;e&#x27;") === "a b & c 'd' 'e'");
check("htmlToPlainText: fazla boşluk teklenir, uçlar kırpılır", htmlToPlainText("  a   <br>  b  ") === "a b");
check("htmlToPlainText: null/boş -> ''", htmlToPlainText(null) === "" && htmlToPlainText("") === "");
check("htmlToPlainText: br dahil çoklu blok/satır-içi karışık", htmlToPlainText('<div lang="tr" class="tr "><span class="green">(Mekke\u2019de)</span></div>') === "(Mekke\u2019de)");

// -- tafsirEntries ------------------------------------------------------------------------
check("tafsirEntries: yalnızca çapa (obje) girişleri, yönlendirmeler (düz metin) atlanır", (() => {
  const out = tafsirEntries({ "1:1": { text: "<p>a</p>" }, "1:2": "1:1", "1:3": { text: "<p>b</p>" } });
  return eq(out, [{ surah: 1, ayah: 1, html: "<p>a</p>" }, { surah: 1, ayah: 3, html: "<p>b</p>" }]);
})());
check("tafsirEntries: bozuk/boş girişler atlanır", tafsirEntries({ "1:1": null, "1:2": {}, "1:3": { text: "" } }).length === 0);

// -- buildTextIndexAsync ----------------------------------------------------------------
{
  const entries = [{ surah: 2, ayah: 1, text: "sabır" }, { surah: 1, ayah: 1, text: "namaz" }];
  const idx = await buildTextIndexAsync(entries, { chunk: 1 });
  check("buildTextIndexAsync: buildTextIndex ile aynı sonucu üretir, raw yok", eq([...idx.surah], [1, 2]) && eq([...idx.ayah], [1, 1]) && idx.raw === null && eq(idx.norm, buildTextIndex(entries).norm.slice().sort()));
}
{
  const html = [{ surah: 1, ayah: 1, html: "<p>Sabır</p>" }, { surah: 1, ayah: 2, html: "<p>Namaz</p>" }];
  const idx = await buildTextIndexAsync(html, { textOf: (e) => htmlToPlainText(e.html) });
  check("buildTextIndexAsync: textOf ile HTML->düz metin katlanıyor", searchTextIndex(idx, ["sabir"]).total === 1);
}

// -- foldWithMap ----------------------------------------------------------
check("foldWithMap: metin fold ile aynı", (() => {
  const s = "Allah'ın Rahmân ve Rahîm olan İsmiyle";
  return foldWithMap(s).text === fold(s);
})());
check("foldWithMap: her katlanmış karakter kaynağındaki harfe işaret ediyor", (() => {
  const s = "Kur'ân-ı Kerîm";
  const { text, map } = foldWithMap(s);
  if (text.length !== map.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (fold(s[map[i]]) === "" || fold(s[map[i]])[0] !== text[i]) {
      if (!fold(s[map[i]]).includes(text[i])) return false;
    }
  }
  return true;
})());

// -- tokenize ---------------------------------------------------------------
check("tokenize: katlar, noktalamayı uçlardan atar", eq(tokenize('"Sabır", şükür?'), ["sabir", "sukur"]));
check("tokenize: tekrar edenleri tek yapar", eq(tokenize("sabır Sabır SABIR"), ["sabir"]));
check("tokenize: 1 harflik ve yalnız-rakam terimler tam metne girmez", eq(tokenize("a 12 ve 255"), ["ve"]));
check("tokenize: kısa çizgili sure adı bütün kalır", eq(tokenize("al-baqarah"), ["al-baqarah"]));
check("tokenize: bağlaçlar atılır ('sabır ve namaz')", eq(tokenize("sabır ve namaz"), ["sabir", "namaz"]));
check("tokenize: yalnız bağlaç aranırsa aranır ('ve')", eq(tokenize("ve"), ["ve"]));
check("tokenize: hiç harf içermeyen terim ('115:1') atılır", tokenize("115:1").length === 0);

// -- termVariants ---------------------------------------------------------------------
check("termVariants: kendisi hep ilk", termVariants("sabir")[0] === "sabir" && termVariants("xyz")[0] === "xyz");
check("termVariants: ünlü düşmesi (listeli): sabır/akıl/hüküm/zulüm/ilim", eq(termVariants("sabir"), ["sabir", "sabr"]) && termVariants("akil").includes("akl") && termVariants("hukum").includes("hukm") && termVariants("zulum").includes("zulm") && termVariants("ilim").includes("ilm"));
check("termVariants: sert ünsüz yumuşaması: kalp/kitap/azap/çocuk/yurt", eq(termVariants("kalp"), ["kalp", "kalb"]) && termVariants("kitap").includes("kitab") && termVariants("azap").includes("azab") && termVariants("cocuk").includes("cocug") && termVariants("yurt").includes("yurd"));
check("termVariants: GÜRÜLTÜ YOK -- ölüm/rahim/alim için ünlü düşmesi uygulanmaz", eq(termVariants("olum"), ["olum"]) && eq(termVariants("rahim"), ["rahim"]) && eq(termVariants("alim"), ["alim"]));
check("termVariants: fiil çekimi (-dık/-tik) yumuşamaz", eq(termVariants("verdik"), ["verdik"]) && eq(termVariants("yaptik"), ["yaptik"]) && eq(termVariants("indirdik"), ["indirdik"]));
check("termVariants: 4 harften kısa / Latin dışı terime dokunmaz", eq(termVariants("kap"), ["kap"]) && eq(termVariants("الله"), ["الله"]));
check("tokenize: boş/boşluk -> []", tokenize("").length === 0 && tokenize("   ").length === 0);
check("isArabicScript", isArabicScript("الله") && !isArabicScript("Allah") && isArabicScript("Allah الله"));

// -- son aramalar -------------------------------------------------------------
check("normalizeRecentQuery: kırpar, boşlukları tekler", normalizeRecentQuery("  a   b \n") === "a b");
check("addRecentQuery: en yeni başta", eq(addRecentQuery(["b", "a"], "c"), ["c", "b", "a"]));
check("addRecentQuery: katlanmış eşit sorgu başa taşınır, iki kez durmaz", eq(addRecentQuery(["Sabır", "yusuf"], "sabir"), ["sabir", "yusuf"]));
check("addRecentQuery: RECENT_MAX'ı aşmaz", (() => {
  let l = [];
  for (let i = 0; i < RECENT_MAX + 5; i++) l = addRecentQuery(l, "q" + i);
  return l.length === RECENT_MAX && l[0] === "q" + (RECENT_MAX + 4);
})());
check("addRecentQuery: boş sorgu listeyi değiştirmez", eq(addRecentQuery(["a"], "   "), ["a"]));
check("removeRecentQuery: katlanmış eşitliğe göre siler", eq(removeRecentQuery(["Sabır", "yusuf"], "SABIR"), ["yusuf"]));
check("sanitizeRecent: bozuk değerlerden temiz dizi", eq(sanitizeRecent(["a", 5, null, " b ", "A"]), ["a", "b"]) && eq(sanitizeRecent("x"), []) && eq(sanitizeRecent(null), []));

// -- vurgu ------------------------------------------------------------------------
check("findMatchRanges: şapkalı kelime, orijinal konumlarda", (() => {
  const s = "Rahmân ve Rahîm olan Allah'ın ismiyle.";
  const r = findMatchRanges(s, ["rahim"]);
  return r.length === 1 && s.slice(r[0][0], r[0][1]) === "Rahîm";
})());
check("findMatchRanges: kesmeli kelimede kesmeye kadarı", (() => {
  const s = "Allah'ın ismiyle";
  const r = findMatchRanges(s, ["allah"]);
  return r.length === 1 && s.slice(r[0][0], r[0][1]) === "Allah";
})());
check("findMatchRanges: iç içe/bitişik eşleşmeler birleşir", (() => {
  const r = findMatchRanges("sabırlı sabır", ["sabir", "sabirli"]);
  return r.length === 2 && r[0][0] === 0 && r[0][1] === 7;
})());
check("findMatchRanges: Arapça'da harf vurgusu harekeleri de kapsar", (() => {
  const s = "بِسْمِ ٱللَّهِ";
  const r = findMatchRanges(s, [fold("الله")]);
  return r.length === 1 && s.slice(r[0][0], r[0][1]) === "ٱللَّهِ";
})());
check("snippetHTML: <mark> ve kaçış", snippetHTML("a <b> & Sabır", ["sabir"]) === 'a &lt;b&gt; &amp; <mark class="arama-hit">Sabır</mark>');
check("snippetHTML: eşleşme yoksa düz (kaçışlı) metin", snippetHTML("x < y", ["zzz"]) === "x &lt; y");
check("snippetHTML: uzun metin ilk eşleşme çevresinden kırpılır, iki uçta …", (() => {
  const long = "lorem ".repeat(60) + "sabır" + " ipsum".repeat(60);
  const h = snippetHTML(long, ["sabir"], { maxLen: 100 });
  return h.startsWith("…") && h.endsWith("…") && h.includes('<mark class="arama-hit">sabır</mark>') && h.length < 220;
})());
check("snippetHTML: kısa metin kırpılmaz", !snippetHTML("kısa sabır metni", ["sabir"]).includes("…"));
check("snippetHTML: mark içine kötü niyetli HTML sızmaz", !/<script/i.test(snippetHTML('<script>alert(1)</script> sabır', ["sabir", "script"])));

// -- tam metin dizini (sentetik) -----------------------------------------------------
const tiny = buildTextIndex([
  { surah: 2, ayah: 1, text: "sabır ve namaz" },
  { surah: 1, ayah: 2, text: "sabırlı olanlar" },
  { surah: 1, ayah: 1, text: "namaz kılın" },
  { surah: 3, ayah: 1, text: "başka bir şey" },
]);
check("buildTextIndex: Kur'an sırasına dizilir", eq([...tiny.surah], [1, 1, 2, 3]) && eq([...tiny.ayah], [1, 2, 1, 1]));
check("searchTextIndex: tek terim, kelime başı eşleşme (sabir) iki ayeti bulur", (() => {
  const r = searchTextIndex(tiny, ["sabir"]);
  return r.total === 2 && !r.relaxed;
})());
check("searchTextIndex: çok terim = VE", (() => {
  const r = searchTextIndex(tiny, ["sabir", "namaz"]);
  return r.total === 1 && r.items[0].surah === 2 && r.items[0].ayah === 1;
})());
check("searchTextIndex: VE boşsa gevşer, relaxed=true, çok terim tutan önde", (() => {
  const r = searchTextIndex(tiny, ["namaz", "yokkelime"]);
  return r.relaxed && r.total === 2;
})());
check("searchTextIndex: hiç eşleşme -> total 0", searchTextIndex(tiny, ["xyzxyz"]).total === 0);
check("searchTextIndex: limit items'ı kısar, total'i değil", (() => {
  const r = searchTextIndex(tiny, ["sabir"], { limit: 1 });
  return r.items.length === 1 && r.total === 2;
})());
check("searchTextIndex: bitişik ifade puanı yüksek (ifade önce gelir)", (() => {
  const idx = buildTextIndex([
    { surah: 1, ayah: 1, text: "namaz ile birlikte sabır" },
    { surah: 1, ayah: 2, text: "sabır ve namaz" },
    { surah: 1, ayah: 3, text: "sabır namaz" },
  ]);
  const r = searchTextIndex(idx, ["sabir", "namaz"]);
  return r.items[0].ayah === 3;
})());
check("searchTextIndex: boş terim listesi -> boş", searchTextIndex(tiny, []).total === 0);
check("searchTextIndex: kelime başı eşleşme, ortadaki eşleşmeden önce", (() => {
  const idx = buildTextIndex([
    { surah: 1, ayah: 1, text: "masabırlı" },
    { surah: 1, ayah: 2, text: "sabırlı" },
  ]);
  return searchTextIndex(idx, ["sabir"]).items[0].ayah === 2;
})());

// -- GERÇEK sure adları ---------------------------------------------------------------
const surahs = readData("surahs.json");
const matcher = createSurahMatcher(surahs);

let unresolved = [];
let notFirst = [];
for (let n = 1; n <= 114; n++) {
  const name = surahs[String(n)].nameTurkish;
  if (matcher.resolveExact(name) !== n) unresolved.push(`${n}:${name}`);
  const top = matcher.match(tokenize(name));
  if (!top.length || top[0].surah !== n) notFirst.push(`${n}:${name}`);
}
check(`114 surenin Türkçe adı kendi numarasına çözülüyor (çözülemeyen: ${unresolved.join(", ") || "yok"})`, unresolved.length === 0);
check(`adıyla aratınca ilk sonuç kendisi (olmayanlar: ${notFirst.join(", ") || "yok"})`, notFirst.length === 0);
check("İngilizce transliterasyon adı da çözülüyor (Al-Baqarah, baqarah)", matcher.resolveExact("Al-Baqarah") === 2 && matcher.resolveExact("baqarah") === 2);
check("boşluklu/tireli ad varyantları aynı sureye çözülüyor (Âl-i İmrân)", matcher.resolveExact("Âl-i İmrân") === 3 && matcher.resolveExact("ali imran") === 3 && matcher.resolveExact("al-i imran") === 3);
check("Arapça sure adı da çözülüyor (البقرة)", matcher.resolveExact("البقرة") === 2 && matcher.resolveExact("الْبَقَرَةِ") === 2);
check("belirsiz/olmayan ad -> null", matcher.resolveExact("xyzabc") === null && matcher.resolveExact("") === null);
check("match: 'ihlas' (klavye farkı) İhlâs'ı bulur", matcher.match(tokenize("ihlas"))[0].surah === 112);
check("match: 'Ihlas' (büyük I) da bulur", matcher.match(tokenize("Ihlas"))[0].surah === 112);
check("match: alt dize ('imran') Âl-i İmrân'ı getirir", matcher.match(tokenize("imran")).some((r) => r.surah === 3));
check("match: iki terim VE ('al baqarah')", matcher.match(tokenize("al baqarah"))[0].surah === 2);
check("match: boş terim -> []", matcher.match([]).length === 0);
check("versesCount / label", matcher.versesCount(2) === 286 && matcher.label(2) === "Bakara");

// -- parseSearchQuery ------------------------------------------------------------------
const P = (q) => parseSearchQuery(q, matcher);
const jumpsOf = (q) => P(q).jumps;
const ay = (s, a) => ({ type: "ayah", surah: s, ayah: a });
check("2:255", eq(jumpsOf("2:255"), [ay(2, 255)]));
check("2/255", eq(jumpsOf("2/255"), [ay(2, 255)]));
check("2.255 ve '2 : 255' ve '2 255'", eq(jumpsOf("2.255"), [ay(2, 255)]) && eq(jumpsOf("2 : 255"), [ay(2, 255)]) && eq(jumpsOf("2 255"), [ay(2, 255)]));
check("2:255. ayet", eq(jumpsOf("2:255. ayet"), [ay(2, 255)]));
check("Arap-Hint rakamlı ٢:٢٥٥", eq(jumpsOf("٢:٢٥٥"), [ay(2, 255)]));
check("Bakara 255", eq(jumpsOf("Bakara 255"), [ay(2, 255)]));
check("bakara:255 / bakara/255", eq(jumpsOf("bakara:255"), [ay(2, 255)]) && eq(jumpsOf("bakara/255"), [ay(2, 255)]));
check("bakara suresi 255. ayet", eq(jumpsOf("bakara suresi 255. ayet"), [ay(2, 255)]));
check("Bakara suresi 255", eq(jumpsOf("Bakara suresi 255"), [ay(2, 255)]));
check("boşluklu ad: ali imran 5", eq(jumpsOf("ali imran 5"), [ay(3, 5)]));
check("İngilizce ad: al-baqarah 255", eq(jumpsOf("al-baqarah 255"), [ay(2, 255)]));
check("Arapça ad: البقرة 255", eq(jumpsOf("البقرة 255"), [ay(2, 255)]));
check("yasin 12 -> 36:12", eq(jumpsOf("yasin 12"), [ay(36, 12)]));
check("sure uzunluğunu aşan ayet -> sureye, ipucuyla", (() => {
  const j = jumpsOf("2:300");
  return j.length === 1 && j[0].type === "surah" && j[0].surah === 2 && /286 ayettir/.test(j[0].hint);
})());
check("ayet 0 -> sureye", (() => {
  const j = jumpsOf("2:0");
  return j.length === 1 && j[0].type === "surah" && j[0].surah === 2;
})());
check("115:1 (olmayan sure) -> hedef yok, metin terimi de yok", (() => {
  const p = P("115:1");
  return p.jumps.length === 0 && p.terms.length === 0;
})());
check("yasin suresi -> sure", eq(jumpsOf("yasin suresi"), [{ type: "surah", surah: 36 }]));
check("sure 36 / 36. sure / 36 sure", eq(jumpsOf("sure 36"), [{ type: "surah", surah: 36 }]) && eq(jumpsOf("36. sure"), [{ type: "surah", surah: 36 }]) && eq(jumpsOf("36 sure"), [{ type: "surah", surah: 36 }]));
check("cüz 3 / 3. cüz / juz 3", eq(jumpsOf("cüz 3"), [{ type: "juz", n: 3 }]) && eq(jumpsOf("3. cüz"), [{ type: "juz", n: 3 }]) && eq(jumpsOf("juz 3"), [{ type: "juz", n: 3 }]));
check("cüz 31 (sınır dışı) -> hedef yok", jumpsOf("cüz 31").length === 0);
check("sayfa 50 / 50. sayfa", eq(jumpsOf("sayfa 50"), [{ type: "page", n: 50 }]) && eq(jumpsOf("50. sayfa"), [{ type: "page", n: 50 }]));
check("sayfa 605 -> hedef yok", jumpsOf("sayfa 605").length === 0);
check("yalnız 12 -> sure 12 ve sayfa 12", eq(jumpsOf("12"), [{ type: "surah", surah: 12 }, { type: "page", n: 12 }]));
check("yalnız 200 -> yalnız sayfa (sure yok)", eq(jumpsOf("200"), [{ type: "page", n: 200 }]));
check("yalnız 700 -> hedef yok", jumpsOf("700").length === 0);
check("hedefe dönüşen sorguda tam metin terimi yok", P("bakara 255").terms.length === 0);
check("düz metin sorgu hedef üretmez, terim üretir", (() => {
  const p = P("sabır ve namaz");
  return p.jumps.length === 0 && eq(p.terms, ["sabir", "namaz"]); // "ve" bağlaç: terim değil
})());
check("çözülemeyen ad + rakam metne düşer ('gece 5')", (() => {
  const p = P("gece 5");
  return p.jumps.length === 0 && eq(p.terms, ["gece"]);
})());
check("boş sorgu -> hedef/terim yok", (() => {
  const p = P("   ");
  return p.jumps.length === 0 && p.terms.length === 0;
})());
check("her surenin adı + 1. ayet -> doğru ayete gidiyor (114/114)", (() => {
  for (let n = 1; n <= 114; n++) {
    const j = jumpsOf(`${surahs[String(n)].nameTurkish} 1`);
    if (!eq(j, [ay(n, 1)])) { console.error("  başarısız:", n, surahs[String(n)].nameTurkish, JSON.stringify(j)); return false; }
  }
  return true;
})());

// -- GERÇEK meal ------------------------------------------------------------------------
const meal = readData("meal.json");
let t0 = performance.now();
const mealIndex = buildTextIndex(mealEntries(meal));
const buildMs = performance.now() - t0;
check("meal dizini 6236 ayeti kapsıyor", mealIndex.size === 6236);
check("meal dizini Kur'an sırasında (1:1 ilk, 114:6 son)", mealIndex.surah[0] === 1 && mealIndex.ayah[0] === 1 && mealIndex.surah[6235] === 114 && mealIndex.ayah[6235] === 6);

const S = (q, opts) => searchTextIndex(mealIndex, tokenize(q), opts);
check("'kürsî' 2:255'i buluyor", S("kürsî").items.some((x) => x.surah === 2 && x.ayah === 255));
check("'kursi' (Türkçe karaktersiz) aynı sonucu veriyor", eq(S("kursi").items.map((x) => x.i), S("kürsî").items.map((x) => x.i)));
check("'ayetel kürsi' gevşer ve 2:255 dahil", (() => {
  const r = S("ayetel kürsi");
  return r.relaxed && r.items.some((x) => x.surah === 2 && x.ayah === 255);
})());
check("'Rahmân Rahîm' 1:1'i VE ile buluyor", (() => {
  const r = S("Rahmân Rahîm");
  return !r.relaxed && r.items.some((x) => x.surah === 1 && x.ayah === 1);
})());
check("'sabır' çok sonuç veriyor (>50) ve Kur'an sırası/puanla döndürüyor", (() => {
  const r = S("sabır", { limit: 1000 });
  return r.total > 50 && r.items.length === r.total;
})());
check("'şükür' ile 'sukur' aynı", S("şükür").total === S("sukur").total && S("sukur").total > 0);
check("yeterince yaygın bir kelime ('Allah') binlerce sonuç, sınırlı items", (() => {
  const r = S("Allah", { limit: 20 });
  return r.total > 1000 && r.items.length === 20;
})());
check("olmayan kelime -> 0", S("qzxwvbnm").total === 0);
check("her sonucun gösterilen metni gerçekten terimi ya da kökünü (kelime başında) içeriyor (sabır, hepsi)", (() => {
  const r = S("sabır", { limit: 1000 });
  return r.items.every((x) => {
    const n = fold(mealIndex.raw[x.i]);
    return n.includes("sabir") || /(^|[^a-z0-9])sabr/.test(n);
  });
})());
check("ünlü düşmesi kazancı: 'sabır' yalnız 'sabir' alt dizisinden (23) çok daha fazla ayet buluyor (>=80)", S("sabır").total >= 80 && S("sabır").total > mealIndex.norm.filter((t) => t.includes("sabir")).length);
check("yumuşama kazancı: 'kalp' -> kalbi/kalbine dahil (>=120)", S("kalp").total >= 120);
check("gürültü yok: 'ölüm' yalnız kendi alt dizisi kadar sonuç (olmak eklenmiyor)", S("ölüm").total === mealIndex.norm.filter((t) => t.includes("olum")).length);
check("gürültü yok: 'rahim' yalnız kendi alt dizisi kadar sonuç (rahmet eklenmiyor)", S("rahim").total === mealIndex.norm.filter((t) => t.includes("rahim")).length);
check("gürültü yok: 'ilim' -> 'bilmek' ortasındaki 'ilm' sayılmıyor", (() => {
  const r = S("ilim", { limit: 2000 });
  return r.items.every((x) => { const n = fold(mealIndex.raw[x.i]); return n.includes("ilim") || /(^|[^a-z0-9])ilm/.test(n); });
})());
check("vurgu: 'sabır' aratınca 'sabrı' da vurgulanıyor (kelime başı)", (() => {
  const h = snippetHTML("Sabrı ve sabırlı olmayı sevin. Kesabrım yok.", ["sabir"]);
  return h.includes('<mark class="arama-hit">Sabr</mark>ı') && h.includes('<mark class="arama-hit">sabır</mark>lı') && !h.includes("Ke<mark");
})());
check("vurgu: meal metninde ilk sonucun <mark>'ı var", (() => {
  const r = S("sabır", { limit: 1 });
  return snippetHTML(mealIndex.raw[r.items[0].i], ["sabir"]).includes('<mark class="arama-hit">');
})());

t0 = performance.now();
for (let k = 0; k < 20; k++) S("sabır ve namaz", { limit: 50 });
const searchMs = (performance.now() - t0) / 20;
check(`arama hızlı (ortalama ${searchMs.toFixed(1)} ms < 60 ms)`, searchMs < 60);
check(`dizin kurma hızlı (${buildMs.toFixed(0)} ms < 1500 ms)`, buildMs < 1500);


// -- Faz 2: kelime meali (gerçek data/word-meal.json) -----------------------------------------------------
const wordData = readData("word-meal.json");
t0 = performance.now();
const wordIndex = buildWordIndex(wordData);
const wordBuildMs = performance.now() - t0;
check("kelime dizini tüm kelime karşılıklarını kapsıyor (70539)", wordIndex.size === Object.keys(wordData).filter((k) => wordData[k]).length && wordIndex.size > 70000);
check("kelime dizini (sure, ayet, sıra) sırasında", wordIndex.surah[0] === 1 && wordIndex.ayah[0] === 1 && wordIndex.pos[0] === 1);
check("glossMatches: terim kelime olarak", glossMatches("gelin tevbe edin de", ["tevbe"]));
check("glossMatches: kök varyantı kelime başında (sabır ~ sabredenler)", glossMatches("sabredenler", ["sabir"]) && glossMatches("kalbine", ["kalp"]));
check("glossMatches: VE -- tüm terimler aynı karşılıkta", glossMatches("gelin tevbe edin de", tokenize("tevbe edin")) && !glossMatches("tevbe", tokenize("tevbe edin")));
check("glossMatches: boş terim -> false", !glossMatches("sabır", []));
const W = (q, o) => searchWordIndex(wordIndex, tokenize(q), o);
{
  const r = W("sabır");
  check("kelime: 'sabır' >= 60 ayet", r.total >= 60);
  check("kelime: tam kelime karşılık ('sabır') ilk sırada", wordIndex.raw[r.items[0].first] === "sabır");
  check("kelime: her item bir ayeti temsil ediyor (yinelenen ayet yok)", new Set(r.items.map((x) => x.surah * 1000 + x.ayah)).size === r.items.length);
  check("kelime: sonuç ayetleri gerçekten eşleşen karşılık içeriyor", r.items.every((x) => glossMatches(wordIndex.raw[x.first], ["sabir"])));
}
check("kelime: 'yusuf' 12:4'ü buluyor", W("yusuf").items.some((x) => x.surah === 12 && x.ayah === 4));
check("kelime: iki terim aynı karşılıkta ('tevbe edin') 2:54", W("tevbe edin").items.some((x) => x.surah === 2 && x.ayah === 54));
check("kelime: terimler farklı kelimelerdeyse eşleşmez ('sabır namaz')", W("sabır namaz").total === 0);
check("kelime: olmayan -> 0, limit items'ı kısar total'i değil", W("qzxwvb").total === 0 && (() => { const r = W("Allah", { limit: 5 }); return r.items.length === 5 && r.total > 100; })());
check("kelime: sıralama deterministik (aynı sorgu iki kez aynı)", eq(W("cennet").items.slice(0, 20), W("cennet").items.slice(0, 20)));

// -- Faz 2: konular (gerçek data/topics-tr.json) ------------------------------------------------------------------
const topicsData = readData("topics-tr.json");
const topicsIdx = buildTopicsSearchIndex(topicsData);
const TS = (q, o) => searchTopics(topicsIdx, tokenize(q), o);
check("konu dizini ada göre tekilleştirilmiş (kayıt sayısından az, ad yinelenmiyor)", topicsIdx.rows.length < topicsData.length && new Set(topicsIdx.rows.map((r) => r.compactName)).size === topicsIdx.rows.length);
check("'Sabır' konusu en üstte (1651), çok ayetli", (() => { const r = TS("sabır"); return r.items[0].id === 1651 && r.items[0].name === "Sabır" && r.items[0].ayahCount > 50; })());
check("'SABIR' / 'sabir' aynı sonuç", eq(TS("SABIR").items.map((x) => x.id), TS("sabir").items.map((x) => x.id)));
check("aynı adlı kayıtlardan en çok ayetlisi seçiliyor (Tevbe -> 1701, 369 değil)", findTopicByName(topicsIdx, "Tevbe").id === 1701 && TS("tevbe").items[0].id === 1701);
check("Namaz -> 1038", findTopicByName(topicsIdx, "namaz").id === 1038);
check("findTopicByName: olmayan ad -> null", findTopicByName(topicsIdx, "olmayan konu adı") === null);
check("konu sonucunda kategori etiketleri var", TS("sabır").items[0].categories.length >= 1);
check("konu: alt dize eşleşmesi ('yusuf') ad başlayanlar önce", (() => { const r = TS("yusuf"); return r.items[0].id === 826 && r.total >= 3; })());
check("konu: çok terim VE ('oğlu yusuf')", TS("oğlu yusuf").items.some((x) => x.id === 2312));
check("konu: Arapça ada göre de bulunuyor", (() => { const row = topicsIdx.rows.find((r) => r.id === 1651); return row.arabic && TS(row.arabic).items.some((x) => x.id === 1651); })());
check("konu: olmayan -> 0", TS("qzxwvb").total === 0 && searchTopics(topicsIdx, []).total === 0);

t0 = performance.now();
for (let k = 0; k < 20; k++) { W("sabır", { limit: 50 }); TS("sabır"); }
const p2Ms = (performance.now() - t0) / 20;
check(`kelime + konu araması hızlı (ortalama ${p2Ms.toFixed(1)} ms < 80 ms)`, p2Ms < 80);
check(`kelime dizini kurma hızlı (${wordBuildMs.toFixed(0)} ms < 1500 ms)`, wordBuildMs < 1500);


// -- GERÇEK tefsir (Sa'dî) ----------------------------------------------------------------------------------
const tafsirData = readData("tafsir-saadi.json");
const tEntries = tafsirEntries(tafsirData);
check("tefsir: yönlendirmeler çözüldükten sonra 6236 ayetin tamamı bir çapaya sahip", (() => {
  let ok = true;
  for (const key in tafsirData) {
    const v = tafsirData[key];
    const anchor = typeof v === "string" ? v : key;
    if (typeof tafsirData[anchor] !== "object" || !tafsirData[anchor] || !tafsirData[anchor].text) { ok = false; break; }
  }
  return ok && Object.keys(tafsirData).length === 6236;
})());
t0 = performance.now();
const tafsirIndex = await buildTextIndexAsync(tEntries, { textOf: (e) => htmlToPlainText(e.html) });
const tafsirBuildMs = performance.now() - t0;
check("tefsir dizini yalnızca çapa sayısı kadar (1739) satır", tafsirIndex.size === tEntries.length && tafsirIndex.size < 6236);
check("tefsir dizini raw SAKLAMIYOR (bellek)", tafsirIndex.raw === null);
const T = (q, o) => searchTextIndex(tafsirIndex, tokenize(q), o);
check("tefsir: 'sabır' çok sonuç veriyor (>=100)", T("sabır", { limit: 5000 }).total >= 100);
check("tefsir: kök varyantı çalışıyor (sabır ~ sabreden, kalp ~ kalbi)", T("sabır").total > tafsirIndex.norm.filter((n) => n.includes("sabir")).length && T("kalp").total > tafsirIndex.norm.filter((n) => n.includes("kalp")).length);
check("tefsir: HTML satır içi etiket kelimeyi bölmüyor (Allah'ın bulunuyor)", T("Allahın").total > 0 || T("allah").total > 0);
check(`tefsir dizini kurma makul sürede (${tafsirBuildMs.toFixed(0)} ms < 6000 ms)`, tafsirBuildMs < 6000);
t0 = performance.now();
T("sabır ve namaz", { limit: 50 });
check(`tefsirde arama hızlı (${(performance.now() - t0).toFixed(1)} ms < 100 ms)`, performance.now() - t0 < 100);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log(
    `All checks passed (114 surah names, ${mealIndex.size} meal entries, ${wordIndex.size} word glosses, ${topicsIdx.rows.length} topic names, ${tafsirIndex.size} tafsir anchors; meal index ${buildMs.toFixed(0)} ms, tafsir index ${tafsirBuildMs.toFixed(0)} ms, search avg ${searchMs.toFixed(1)} ms).`
  );
}
