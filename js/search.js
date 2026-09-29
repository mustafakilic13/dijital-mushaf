// search.js
//
// "Arama" (alt çubuktaki Arama düğmesi) -- uygulama genelindeki aramanın
// SAF yarısı: metin normalleştirme, sorgu ayrıştırma, sure adı eşleştirme,
// tam metin dizini + arama, vurgulu özet (snippet) üretimi ve "son
// aramalar" listesi yardımcıları. DOM yok, fetch yok -- topics.js /
// surahinfo.js ile aynı "saf mantık ayrı modülde, arayüz app.js'te"
// düzeni; test/search_test.mjs Node'da doğrudan import edip sınar.
// Veri yükleme (meal.json vb.) ve ekran app.js'teki "Arama modalı"
// bölümünde.
//
// Tek normalleştirme, iki alfabe: fold() hem Türkçe/Latin metni hem Arapça
// metni aynı geçişte katlıyor, çünkü arama kutusuna hangisi yazılırsa
// yazılsın sorgu da, dizindeki metin de AYNI fonksiyondan geçiyor:
//  - Latin: küçük harfe çevirir; ı/İ/I hepsi "i"; ç ğ ö ş ü ve şapkalı
//    â î û ê ô düz harfe iner (klavyesinde Türkçe karakter olmayan biri
//    "sukur" yazınca "şükür"ü, "Ihlas" yazınca "İhlâs"ı bulsun);
//    kesme işaretleri (Kur'ân, Allah'ın, ayn/hemze işaretleri) atılır.
//  - Arapça: harekeler, tatvil, hançer elif ve Kur'an'a özgü küçük
//    işaretler atılır; elif çeşitleri (أ إ آ ٱ) ا, ى/ئ ي, ؤ و, ة ه olur.
//    Böylece harekesiz yazılan "الله", harekeli "ٱللَّهِ" metnini bulur.
//  - Rakamlar: Arap-Hint (٠-٩) ve Fars (۰-۹) rakamları ASCII'ye iner.
//
// Kaynaklar (her biri kendi dizin türüyle, hepsi aynı fold'dan geçiyor):
//  - sure adları        createSurahMatcher
//  - meal (ayet başına) buildTextIndex/searchTextIndex
//  - kelime meali       buildWordIndex/searchWordIndex  (kelime başına, ayete gruplanıyor)
//  - Konu Fihristi      buildTopicsSearchIndex/searchTopics (yalnız konu ADI; açıklama gürültü)
//
// Vurgu için foldWithMap, katlanmış her karakterin ORİJİNAL metindeki
// konumunu da döndürüyor -- eşleşme katlanmış metinde bulunuyor, <mark>
// ise orijinal (harekeli/şapkalı) metnin üzerine konuyor.

import { topicCategoryLabels } from "./topics.js";

// ---------------------------------------------------------------------
// Normalleştirme
// ---------------------------------------------------------------------
const TR_FOLD = new Map(
  Object.entries({
    "ı": "i", "İ": "i",
    "â": "a", "Â": "a", "î": "i", "Î": "i", "û": "u", "Û": "u", "ê": "e", "Ê": "e", "ô": "o", "Ô": "o",
    "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ö": "o", "Ö": "o", "ş": "s", "Ş": "s", "ü": "u", "Ü": "u",
  })
);
// Katlanınca hiç karakter bırakmayanlar: kesme işaretleri (düz/kıvrık),
// ayn/hemze modifier harfleri, ters kesme, akut; sıfır genişlikli ve
// yön işaretleri.
const DROPPED = new Set([
  "'", "`", "\u00b4", "\u2018", "\u2019", "\u02bc", "\u02bb", "\u02bf", "\u02be",
  "\u200b", "\u200c", "\u200d", "\u200e", "\u200f", "\ufeff",
]);

function foldArabicChar(c, code) {
  if (code >= 0x660 && code <= 0x669) return String.fromCharCode(48 + code - 0x660); // Arap-Hint rakamları
  if (code >= 0x6f0 && code <= 0x6f9) return String.fromCharCode(48 + code - 0x6f0); // Fars rakamları
  if (code === 0x6dd || code === 0x6de) return " "; // ayet sonu / rub el-hizb işareti
  if (code === 0x640) return ""; // tatvil
  if (code >= 0x610 && code <= 0x61a) return ""; // Arapça işaretler
  if (code >= 0x64b && code <= 0x65f) return ""; // harekeler
  if (code === 0x670) return ""; // hançer elif
  if (code >= 0x6d6 && code <= 0x6ed) return ""; // Kur'an'a özgü küçük işaretler
  if (code >= 0x8d3 && code <= 0x8ff) return ""; // genişletilmiş Arapça işaretler
  switch (code) {
    case 0x622: case 0x623: case 0x625: case 0x671: return "\u0627"; // آ أ إ ٱ -> ا
    case 0x624: return "\u0648"; // ؤ -> و
    case 0x626: case 0x649: case 0x6cc: return "\u064a"; // ئ ى ی -> ي
    case 0x629: return "\u0647"; // ة -> ه
    case 0x6a9: return "\u0643"; // ک -> ك
    default: return c;
  }
}

function foldChar(c) {
  const code = c.charCodeAt(0);
  if (code < 128) {
    if (code >= 65 && code <= 90) return String.fromCharCode(code + 32); // A-Z
    if (code === 39 || code === 96) return ""; // ' `
    if (code === 32 || (code >= 9 && code <= 13)) return " ";
    return c;
  }
  const tr = TR_FOLD.get(c);
  if (tr !== undefined) return tr;
  if (DROPPED.has(c)) return "";
  if (code === 0xa0 || (code >= 0x2000 && code <= 0x200a) || code === 0x202f || code === 0x3000) return " ";
  if (
    (code >= 0x600 && code <= 0x6ff) ||
    (code >= 0x750 && code <= 0x77f) ||
    (code >= 0x8a0 && code <= 0x8ff)
  ) {
    return foldArabicChar(c, code);
  }
  // Öteki her şey: birleştirici işaretleri at, küçük harfe çevir.
  const d = c.normalize("NFD");
  let out = "";
  for (const ch of d) {
    const cc = ch.charCodeAt(0);
    if (cc >= 0x300 && cc <= 0x36f) continue;
    out += ch.toLowerCase();
  }
  return out;
}

// str -> katlanmış metin (karakter sayısı değişebilir).
// Hızlı yol: düz küçük ASCII harf/rakam/boşluk katlanmaya ihtiyaç duymaz
// (foldChar kendisini döndürür); yalnızca DIŞINDAKİ ardışık karakter
// öbekleri foldChar'dan geçiyor. Sonuç karakter karakter katlamayla BİREBİR
// aynı (test/search_test.mjs bunu geniş bir örnek üzerinde doğruluyor);
// fark, 8 MB'lık tefsir metnini dizinlerken ~3 kat hız.
const NEEDS_FOLD = /[^a-z0-9 ]+/g;
function foldRun(run) {
  let out = "";
  for (let i = 0; i < run.length; i++) out += foldChar(run[i]);
  return out;
}
export function fold(str) {
  const s = str == null ? "" : String(str);
  return s.replace(NEEDS_FOLD, foldRun);
}

// str -> { text, map }: map[i], katlanmış metnin i. karakterinin orijinal
// str içindeki konumu.
export function foldWithMap(str) {
  const s = String(str == null ? "" : str);
  let text = "";
  const map = [];
  for (let i = 0; i < s.length; i++) {
    const f = foldChar(s[i]);
    for (let j = 0; j < f.length; j++) {
      text += f[j];
      map.push(i);
    }
  }
  return { text, map };
}

const TRIM_PUNCT = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
export const MIN_TERM_LENGTH = 2;

// Çok terimli sorguda arama koşulu olmaması gereken bağlaç/edatlar:
// "sabır ve namaz" mealdeki "sabırla, namazla" gibi "ve" içermeyen ayetleri
// de bulsun, "ve" da her yerde vurgulanmasın. Yalnızca başka terim
// kalıyorsa atılır ("ve" tek başına aranırsa aranır).
const STOPWORDS = new Set(["ve", "ile", "de", "da", "ki", "mi", "bir", "bu", "ya", "icin", "gibi"]);

// Sorgu -> katlanmış, tekilleştirilmiş arama terimleri. Baştaki/sondaki
// noktalama ("sabır", sabır?) atılır; MIN_TERM_LENGTH'ten kısa terimler
// ve hiç harf içermeyenler ("12", "115:1" -- onlar parseSearchQuery'nin
// işi) tam metin aramasına girmez.
export function tokenize(query) {
  const seen = new Set();
  const all = [];
  for (const raw of fold(query).split(/\s+/)) {
    const tok = raw.replace(TRIM_PUNCT, "");
    if (tok.length < MIN_TERM_LENGTH || !/\p{L}/u.test(tok) || seen.has(tok)) continue;
    seen.add(tok);
    all.push(tok);
  }
  const content = all.filter((t) => !STOPWORDS.has(t));
  return content.length ? content : all;
}

// Türkçe ekleşmede kök değişir; düz alt-dize araması bunu bilmez: "sabır"
// aratınca 23 ayet gelirken sabrı/sabreden/sabra biçimleri (toplam 90
// ayet) kaçar; "kalp" 52 ayet, "kalbi/kalbine" ile 137. Bir terim için,
// aynen aranan biçime EK OLARAK (VEYA) denenecek kök varyantları --
// dizin[0] her zaman terimin kendisi, geri kalanlar EK biçimler. Ek
// biçimler yalnızca bir KELİMENİN BAŞINDA aranır (termleri her yerde
// aranan alt dizi olan asıl biçimin aksine): kök ekle uzayan sözcüğün
// başında durur ("sabr|ı"), "ilm" ise "bilmek"in ortasında değil.
//  - sert ünsüz yumuşaması: kalp->kalb, kitap->kitab, azap->azab,
//    çocuk->çocug(u), topluluk->toplulug(u), yurt->yurd(u). Terim en az 4
//    harf, son harf p/k/t (ç->c ve ğ->g zaten fold'da eşit). -dık/-tik/-duk/
//    -tuk ile bitenler ("yaptık", "verdik") fiil çekimi olduğu için hariç:
//    onlar yumuşamaz, "verdiği" ile eşleşmesi yalnızca gürültü olurdu.
//  - ünlü düşmesi: sabır->sabr, akıl->akl, hüküm->hukm, zulüm->zulm, ilim->ilm,
//    nefis->nefs, gönül->gonl, kavim->kavm... Bu kural SÖZCÜK LİSTESİYLE
//    çalışıyor, genel bir desenle değil: "ünsüz+ı/i/u/ü+ünsüz" deseni
//    ölçüldüğünde ölüm->olm ("olmak"ın 449 ayeti), rahim->rahm gibi
//    yerlerde 3-4 kat gürültü çıkardı (bkz. test/search_test.mjs'teki
//    "gürültü yok" kontrolleri); listedekilerde eşleşme ölçülüp
//    doğrulandı.
// Uydurma bir varyant metinde bulunmazsa zararsızdır.
const VOWEL_DROP = new Map([
  ["sabir", "sabr"], ["akil", "akl"], ["ilim", "ilm"], ["hukum", "hukm"], ["zulum", "zulm"],
  ["nefis", "nefs"], ["gonul", "gonl"], ["omur", "omr"], ["kavim", "kavm"], ["isim", "ism"],
  ["sehir", "sehr"], ["fikir", "fikr"], ["ogul", "ogl"], ["agiz", "agz"], ["burun", "burn"],
  ["kabir", "kabr"], ["cisim", "cism"], ["zihin", "zihn"], ["beyin", "beyn"], ["vahiy", "vahy"],
]);
const SOFTEN = { p: "b", k: "g", t: "d" };

export function termVariants(term) {
  const out = [term];
  const drop = VOWEL_DROP.get(term);
  if (drop) out.push(drop);
  if (term.length >= 4 && /^[a-z]+$/.test(term)) {
    const soft = SOFTEN[term[term.length - 1]];
    if (soft && !/[dt][iu]k$/.test(term)) out.push(term.slice(0, -1) + soft);
  }
  return out;
}

export function isArabicScript(str) {
  return /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(String(str || ""));
}

// Harf/rakam bitişikliği için: katlanmış metinde ASCII harf-rakam ya da
// ASCII dışı (Arapça vb.) her şey "kelime karakteri" sayılır.
function isWordCode(c) {
  return (c >= 48 && c <= 57) || (c >= 97 && c <= 122) || c >= 128;
}

// ---------------------------------------------------------------------
// Sure adı eşleştirme
// ---------------------------------------------------------------------
export const LIMITS = { surahCount: 114, juzCount: 30, pageCount: 604 };

// Harf/rakam dışındaki her şeyi atıyor: "âl-i imrân", "al-i imran",
// "ali imran" hepsi "aliimran" oluyor.
function compact(folded) {
  return folded.replace(/[^\p{L}\p{N}]+/gu, "");
}

// data/surahs.json ({ "1": {nameTurkish, nameSimple, name, nameArabic,
// versesCount, ...}, ... }) -> { resolveExact, match, versesCount, label }.
export function createSurahMatcher(surahs) {
  const rows = [];
  const exact = new Map(); // sıkıştırılmış ad -> sure no
  const ambiguous = new Set();
  const addAlias = (alias, n) => {
    if (!alias) return;
    if (exact.has(alias) && exact.get(alias) !== n) ambiguous.add(alias);
    else exact.set(alias, n);
  };

  for (let n = 1; n <= LIMITS.surahCount; n++) {
    const s = surahs[String(n)];
    if (!s) continue;
    const names = [s.nameTurkish, s.nameSimple, s.name].filter(Boolean).map(fold);
    const arabic = fold(s.nameArabic || "");
    for (const f of names) {
      addAlias(compact(f), n);
      // "al-baqarah" -> "baqarah": kısa ön ek (al-, an-, ash-, ...) atılmış hâli de
      // aynı sureye çözülsün.
      const dash = f.indexOf("-");
      if (dash > 0 && dash <= 3) addAlias(compact(f.slice(dash + 1)), n);
    }
    addAlias(compact(arabic), n);
    rows.push({ surah: n, names, hay: [...names, arabic].join(" ") });
  }
  for (const a of ambiguous) exact.delete(a);

  return {
    // "bakara", "âl-i imrân", "al-baqarah" -> sure no; çözülemezse null.
    resolveExact(name) {
      const c = compact(fold(name));
      return (c && exact.get(c)) || null;
    },
    versesCount(n) {
      const s = surahs[String(n)];
      return s ? s.versesCount : 0;
    },
    label(n) {
      const s = surahs[String(n)];
      return s ? s.nameTurkish : String(n);
    },
    // Tüm terimleri (katlanmış) içeren sureler, en iyi eşleşme başta:
    // tam ad > ad başlangıcı > kelime başı > herhangi bir yer; eşitlikte
    // sure numarası.
    match(terms) {
      if (!terms.length) return [];
      const out = [];
      for (const r of rows) {
        let score = 0;
        let ok = true;
        for (const t of terms) {
          const idx = r.hay.indexOf(t);
          if (idx < 0) { ok = false; break; }
          if (exact.get(compact(t)) === r.surah) score += 100;
          else if (r.names.some((nm) => nm.startsWith(t))) score += 60;
          else if (idx === 0 || !isWordCode(r.hay.charCodeAt(idx - 1))) score += 30;
          else score += 10;
        }
        if (ok) out.push({ surah: r.surah, score });
      }
      out.sort((a, b) => b.score - a.score || a.surah - b.surah);
      return out;
    },
  };
}

// ---------------------------------------------------------------------
// Sorgu ayrıştırma
// ---------------------------------------------------------------------
// raw -> { raw, folded, jumps, terms }
//  jumps: doğrudan gidilecek hedefler (ayet / sure / cüz / sayfa) --
//    "2:255", "2/255", "Bakara 255", "bakara suresi 255. ayet", "yasin
//    suresi", "36. sure", "3. cüz", "cüz 3", "sayfa 50", "50. sayfa",
//    yalnız "12" (hem 12. sure hem 12. sayfa) tanınıyor.
//    Ayet no sure uzunluğunu aşarsa ("2:300") ayete değil sureye
//    gidiliyor ve `hint` "Bakara suresi 286 ayettir" diyor.
//  terms: sorgu bir hedefe DÖNÜŞMEDİYSE tam metin arama terimleri
//    (tokenize); hedefe dönüştüyse boş -- "bakara 255" hem 2:255'e gitsin
//    hem de mealde "bakara" & "255" aratılıp gürültü üretmesin.
export function parseSearchQuery(raw, matcher, limits = LIMITS) {
  const folded = fold(raw).trim();
  const jumps = [];

  const surahJump = (n, extra) => {
    if (n >= 1 && n <= limits.surahCount) jumps.push({ type: "surah", surah: n, ...extra });
  };
  const ayahJump = (s, a) => {
    if (s < 1 || s > limits.surahCount) return;
    const max = matcher.versesCount(s);
    if (a >= 1 && a <= max) jumps.push({ type: "ayah", surah: s, ayah: a });
    else surahJump(s, { hint: `${matcher.label(s)} suresi ${max} ayettir` });
  };

  let m;
  if (
    (m = /^(\d{1,3})\s*[:/.\-]\s*(\d{1,3})(?:\s*\.?\s*ayet(?:i)?)?$/.exec(folded)) ||
    (m = /^(\d{1,3})\s+(\d{1,3})$/.exec(folded))
  ) {
    ayahJump(parseInt(m[1], 10), parseInt(m[2], 10));
  } else if ((m = /^(?:sure\s*(\d{1,3})|(\d{1,3})\.?\s*sure(?:si)?)$/.exec(folded))) {
    surahJump(parseInt(m[1] || m[2], 10));
  } else if ((m = /^(?:(?:cuz|juz)\s*(\d{1,2})|(\d{1,2})\.?\s*(?:cuz|juz))$/.exec(folded))) {
    const n = parseInt(m[1] || m[2], 10);
    if (n >= 1 && n <= limits.juzCount) jumps.push({ type: "juz", n });
  } else if ((m = /^(?:(?:sayfa|sf|page)\.?\s*(\d{1,3})|(\d{1,3})\.?\s*(?:sayfa|sf))$/.exec(folded))) {
    const n = parseInt(m[1] || m[2], 10);
    if (n >= 1 && n <= limits.pageCount) jumps.push({ type: "page", n });
  } else if ((m = /^(\d{1,3})$/.exec(folded))) {
    const n = parseInt(m[1], 10);
    surahJump(n);
    if (n >= 1 && n <= limits.pageCount) jumps.push({ type: "page", n });
  } else if (
    (m = /^(.*\D)\s*[:/.\-\s]\s*(\d{1,3})(?:\s*\.?\s*ayet(?:i)?)?$/.exec(folded))
  ) {
    // "bakara 255", "bakara suresi 255. ayet", "bakara:255"
    const name = m[1].replace(/\s*(?:suresi|sure)\s*$/, "");
    const s = matcher.resolveExact(name);
    if (s) ayahJump(s, parseInt(m[2], 10));
  } else if ((m = /^(.*\D)\s+(?:suresi|sure)$/.exec(folded))) {
    // "yasin suresi"
    const s = matcher.resolveExact(m[1]);
    if (s) surahJump(s);
  }

  return { raw, folded, jumps, terms: jumps.length ? [] : tokenize(raw) };
}

// ---------------------------------------------------------------------
// Tam metin dizini (meal; sonraki aşamalarda Arapça, tefsir)
// ---------------------------------------------------------------------
// entries: [{ surah, ayah, text }] -> { size, surah, ayah, raw, norm }.
// Kur'an sırasına (sure, ayet) göre dizilir; arama sonuçlarında eşit
// puanlı satırlar bu sırada kalır. `keepRaw: false` orijinal metni
// SAKLAMAZ (raw boş kalır): tefsir gibi çok büyük kaynaklarda bellek
// yarıya iner, gösterilecek satırların metni gerektiğinde kaynaktan
// üretilir.
function sortEntries(entries) {
  const list = entries.filter((e) => e && e.text);
  let sorted = true;
  for (let i = 1; i < list.length; i++) {
    const p = list[i - 1];
    const q = list[i];
    if (p.surah > q.surah || (p.surah === q.surah && p.ayah > q.ayah)) { sorted = false; break; }
  }
  if (!sorted) list.sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
  return list;
}

export function buildTextIndex(entries, { keepRaw = true } = {}) {
  const list = sortEntries(entries);
  const n = list.length;
  const surah = new Uint8Array(n);
  const ayah = new Uint16Array(n);
  const raw = keepRaw ? new Array(n) : null;
  const norm = new Array(n);
  for (let i = 0; i < n; i++) {
    surah[i] = list[i].surah;
    ayah[i] = list[i].ayah;
    if (raw) raw[i] = list[i].text;
    norm[i] = fold(list[i].text);
  }
  return { size: n, surah, ayah, raw, norm };
}

// buildTextIndex'in parça parça çalışan hâli: her `chunk` girişte `yieldFn`
// (varsayılan setTimeout 0) çağrılıp ana iş parçacığına nefes aldırılır --
// çok büyük metinlerde (tefsir ~6 milyon karakter) arayüz donmasın.
// `textOf(entry)` verilirse metin kaynağa göre girişten üretilir (ör. HTML
// -> düz metin) ve saklanmaz.
export async function buildTextIndexAsync(entries, { chunk = 100, yieldFn, textOf } = {}) {
  const pause = yieldFn || (() => new Promise((r) => setTimeout(r, 0)));
  const list = textOf ? entries.slice().sort((a, b) => a.surah - b.surah || a.ayah - b.ayah) : sortEntries(entries);
  const n = list.length;
  const surah = new Uint8Array(n);
  const ayah = new Uint16Array(n);
  const norm = new Array(n);
  for (let i = 0; i < n; i++) {
    surah[i] = list[i].surah;
    ayah[i] = list[i].ayah;
    norm[i] = fold(textOf ? textOf(list[i]) : list[i].text);
    if (i % chunk === chunk - 1) await pause();
  }
  return { size: n, surah, ayah, raw: null, norm };
}

// HTML -> düz metin (tefsir): blok etiketleri (p, div, br, ...) boşluğa,
// satır içi etiketler (span, b, i, ...) HİÇBİR ŞEYE dönüşür -- "Allah<span>’ın</span>"
// "Allah ’ın" olup kelimeyi bölmesin --, temel varlıklar çözülür, boşluklar
// tekilleştirilir.
const NAMED_ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "\u2019", lsquo: "\u2018", rdquo: "\u201d", ldquo: "\u201c", hellip: "\u2026", ndash: "\u2013", mdash: "\u2014" };
export function htmlToPlainText(html) {
  return String(html == null ? "" : html)
    .replace(/<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|blockquote|hr)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      const v = NAMED_ENTITIES[e.toLowerCase()];
      return v === undefined ? m : v;
    })
    .replace(/\s+/g, " ")
    .trim();
}

// data/tafsir-*.json ({ "s:a": {text: html} } çapa girişleri + { "s:a": "çapa" }
// yönlendirmeleri) -> yalnızca ÇAPA girişleri, [{ surah, ayah, html }]. Yönlendirme
// alan ayetler kendi metnini taşımaz (aynı yorumun paylaşımı), aramada tek
// kez -- çapada -- sayılır.
export function tafsirEntries(data) {
  const out = [];
  for (const key in data) {
    const v = data[key];
    if (!v || typeof v !== "object" || !v.text) continue;
    const [s, a] = key.split(":");
    out.push({ surah: parseInt(s, 10), ayah: parseInt(a, 10), html: v.text });
  }
  return out;
}

// data/meal.json ({ "s:a": {t} }) -> buildTextIndex girdisi.
export function mealEntries(mealData) {
  const out = [];
  for (const key in mealData) {
    const t = mealData[key] && mealData[key].t;
    if (!t) continue;
    const [s, a] = key.split(":");
    out.push({ surah: parseInt(s, 10), ayah: parseInt(a, 10), text: t.trim() });
  }
  return out;
}

function hasWordStart(text, term, from) {
  let p = from;
  for (let tries = 0; p >= 0 && tries < 8; tries++) {
    if (p === 0 || !isWordCode(text.charCodeAt(p - 1))) return true;
    p = text.indexOf(term, p + 1);
  }
  return false;
}

// Bir kelimenin BAŞINDA geçen ilk konum, yoksa -1 (termVariants'ın ek
// biçimleri için).
function firstWordStart(text, term) {
  let p = text.indexOf(term);
  while (p >= 0) {
    if (p === 0 || !isWordCode(text.charCodeAt(p - 1))) return p;
    p = text.indexOf(term, p + 1);
  }
  return -1;
}

// text içinde bir terimin puanı: terim (alt dize) ya da ek biçimlerinden
// biri (kelime başı) varsa >0, yoksa 0. Kelime başı eşleşme 3, başka yerde 1.
function termScore(text, term, extras) {
  const p = text.indexOf(term);
  if (p >= 0) return hasWordStart(text, term, p) ? 3 : 1;
  for (const v of extras) if (firstWordStart(text, v) >= 0) return 3;
  return 0;
}

// index'i terimlere karşı tarar. Önce TÜM terimleri içerenler; hiç yoksa
// (ve birden çok terim varsa) en az birini içerenler, çok terim tutan
// başta -- `relaxed: true` bunu arayüze bildiriyor ki "bir kısmını
// içerenler gösteriliyor" diyebilsin (ör. "ayetel kürsi": "ayetel" mealde
// geçmez ama "kürsi" 2:255'i getirir). Sıralama: puan (kelime başı
// eşleşme 3, başka yerde 1, terimlerin bitişik geçtiği ifade +8), eşitlikte
// Kur'an sırası. `items` en fazla `limit` satır; `total` hepsinin sayısı.
export function searchTextIndex(index, terms, { limit = 100 } = {}) {
  if (!index || !terms.length) return { total: 0, relaxed: false, items: [] };
  const need = terms.length;
  const phrase = need > 1 ? terms.join(" ") : null;
  const extras = terms.map((t) => termVariants(t).slice(1));
  const hits = [];
  let full = 0;
  for (let i = 0; i < index.size; i++) {
    const text = index.norm[i];
    let matched = 0;
    let score = 0;
    for (let k = 0; k < need; k++) {
      const sc = termScore(text, terms[k], extras[k]);
      if (sc) {
        matched++;
        score += sc;
      }
    }
    if (!matched) continue;
    if (matched === need) {
      full++;
      if (phrase && text.includes(phrase)) score += 8;
    }
    hits.push({ i, matched, score });
  }
  const relaxed = full === 0 && need > 1;
  const pool = relaxed ? hits : hits.filter((h) => h.matched === need);
  pool.sort((a, b) => b.matched - a.matched || b.score - a.score || a.i - b.i);
  const items = pool.slice(0, limit).map((h) => ({
    i: h.i,
    surah: index.surah[h.i],
    ayah: index.ayah[h.i],
    score: h.score,
  }));
  return { total: pool.length, relaxed, items };
}

// ---------------------------------------------------------------------
// Kelime meali (data/word-meal.json)
// ---------------------------------------------------------------------
// Bir kelime karşılığında (gloss) terimin puanı: tam kelime 5, kelime başı
// (ya da kök varyantı, bkz. termVariants) 3, ortada bir yerde 1; 0 = yok.
function wordScore(text, term, extras) {
  let best = 0;
  let p = text.indexOf(term);
  while (p >= 0) {
    const before = p === 0 || !isWordCode(text.charCodeAt(p - 1));
    const end = p + term.length;
    const after = end >= text.length || !isWordCode(text.charCodeAt(end));
    if (before && after) return 5;
    if (before) best = Math.max(best, 3);
    else best = Math.max(best, 1);
    p = text.indexOf(term, p + 1);
  }
  if (best < 3) for (const v of extras) if (firstWordStart(text, v) >= 0) return 3;
  return best;
}

// Bir kelime karşılığı TÜM terimleri içeriyor mu (arayüz, bir ayetin hangi
// kelime kartlarının eşleştiğini bununla seçiyor -- dizindeki koşulun aynısı).
export function glossMatches(gloss, terms) {
  if (!terms.length) return false;
  const text = fold(gloss);
  for (const t of terms) if (!wordScore(text, t, termVariants(t).slice(1))) return false;
  return true;
}

// data/word-meal.json ({ "sure:ayet:sıra": "karşılık" }) -> dizin. Anahtarlar
// sözlük sırasında ("10:1:1" ilk) geldiği için sayısal (sure, ayet, sıra)
// sırasına çevrilir.
export function buildWordIndex(data) {
  const list = [];
  for (const key in data) {
    const g = data[key];
    if (!g) continue;
    const [s, a, p] = key.split(":");
    list.push({ s: parseInt(s, 10), a: parseInt(a, 10), p: parseInt(p, 10), g: String(g).trim() });
  }
  list.sort((x, y) => x.s - y.s || x.a - y.a || x.p - y.p);
  const n = list.length;
  const surah = new Uint8Array(n);
  const ayah = new Uint16Array(n);
  const pos = new Uint16Array(n);
  const raw = new Array(n);
  const norm = new Array(n);
  for (let i = 0; i < n; i++) {
    surah[i] = list[i].s;
    ayah[i] = list[i].a;
    pos[i] = list[i].p;
    raw[i] = list[i].g;
    norm[i] = fold(list[i].g);
  }
  return { size: n, surah, ayah, pos, raw, norm };
}

// Bir kelime karşılığı TÜM terimleri içerirse eşleşir (VE); eşleşmeler ayete
// gruplanır. total = eşleşen AYET sayısı; her item { surah, ayah, score,
// count (o ayette eşleşen kelime), first (ilk eşleşen kelimenin dizin sırası) }.
// Sıralama: puan (tam kelime > kelime başı > alt dize; karşılık sorguyla
// birebir aynıysa +2), eşitlikte Kur'an sırası.
export function searchWordIndex(index, terms, { limit = 200 } = {}) {
  if (!index || !terms.length) return { total: 0, items: [] };
  const extras = terms.map((t) => termVariants(t).slice(1));
  const whole = terms.join(" ");
  const byAyah = new Map();
  for (let i = 0; i < index.size; i++) {
    const text = index.norm[i];
    let score = 0;
    let ok = true;
    for (let k = 0; k < terms.length; k++) {
      const sc = wordScore(text, terms[k], extras[k]);
      if (!sc) { ok = false; break; }
      score += sc;
    }
    if (!ok) continue;
    if (text === whole) score += 2;
    const key = index.surah[i] * 1000 + index.ayah[i];
    const cur = byAyah.get(key);
    if (!cur) byAyah.set(key, { surah: index.surah[i], ayah: index.ayah[i], score, count: 1, first: i });
    else {
      cur.count++;
      if (score > cur.score) { cur.score = score; cur.first = i; }
    }
  }
  const items = [...byAyah.values()];
  items.sort((a, b) => b.score - a.score || a.surah - b.surah || a.ayah - b.ayah);
  return { total: items.length, items: items.slice(0, limit) };
}

// ---------------------------------------------------------------------
// Konular (data/topics-tr.json)
// ---------------------------------------------------------------------
// Aynı ad birden çok topic_id'ye ait olabilir (Namaz 1038/1613, Tevbe
// 369/1701, ...). Ayet panelindeki etiketler ayet başına en küçük id'yi
// seçiyor (bkz. app.js ayahTopicsRowHTML); ARAMADA ise kullanıcı en
// kapsamlı kaydı bekler -- "Tevbe" 5 ayetlik 369 değil 74 ayetlik 1701
// olsun -- o yüzden ada göre tekilleştirirken EN ÇOK ayeti olan kayıt, eşitlikte
// en küçük id kalıyor. Konuya girince ana/alt/ilişkili konu bağlantılarıyla
// öbürlerine yine ulaşılıyor.
export function buildTopicsSearchIndex(topics) {
  const best = new Map();
  for (const t of topics) {
    if (!t || !t.name) continue;
    const key = compact(fold(t.name));
    if (!key) continue;
    const ayahCount = new Set(String(t.ayahs || "").match(/\d+:\d+/g) || []).size;
    const cur = best.get(key);
    if (!cur || ayahCount > cur.ayahCount || (ayahCount === cur.ayahCount && t.topic_id < cur.id)) {
      const nameFold = fold(t.name);
      best.set(key, {
        id: t.topic_id,
        name: t.name,
        arabic: t.arabic_name || "",
        nameFold,
        compactName: key,
        hay: nameFold + " " + fold(t.arabic_name || ""),
        ayahCount,
        categories: topicCategoryLabels(t),
      });
    }
  }
  const rows = [...best.values()].sort((a, b) => a.id - b.id);
  return { rows, byName: best };
}

// Ada (ya da Arapça adına) göre: tüm terimler geçmeli. Sıralama: tam ad >
// ad başlangıcı > kelime başı > herhangi bir yer; eşitlikte çok ayetli
// konu önce, sonra id.
export function searchTopics(index, terms, { limit = 50 } = {}) {
  if (!index || !terms.length) return { total: 0, items: [] };
  const hits = [];
  for (const r of index.rows) {
    let score = 0;
    let ok = true;
    for (const t of terms) {
      const p = r.hay.indexOf(t);
      if (p < 0) { ok = false; break; }
      if (r.compactName === compact(t)) score += 100;
      else if (r.nameFold.startsWith(t)) score += 60;
      else if (p === 0 || !isWordCode(r.hay.charCodeAt(p - 1))) score += 30;
      else score += 10;
    }
    if (ok) hits.push({ r, score });
  }
  hits.sort((a, b) => b.score - a.score || b.r.ayahCount - a.r.ayahCount || a.r.id - b.r.id);
  return { total: hits.length, items: hits.slice(0, limit).map((h) => ({ ...h.r, score: h.score })) };
}

// Tam ad eşleşmesi (popüler konu çipleri için): "Sabır"/"sabir" -> kayıt ya da null.
export function findTopicByName(index, name) {
  return (index && index.byName.get(compact(fold(name)))) || null;
}

// ---------------------------------------------------------------------
// Vurgu / özet
// ---------------------------------------------------------------------
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Arapça'da harf vurgulanınca ardındaki harekeler de vurguya dahil olsun
// (yoksa "بِسْمِ"in yalnızca harfleri boyanıp hareke işaretleri dışarıda kalır).
function isArabicMark(code) {
  return (
    (code >= 0x610 && code <= 0x61a) ||
    (code >= 0x64b && code <= 0x65f) ||
    code === 0x670 ||
    code === 0x640 ||
    (code >= 0x6d6 && code <= 0x6ed && code !== 0x6dd && code !== 0x6de)
  );
}

// text içinde terimlerin (katlanmış eşleşmeyle) geçtiği yerler ->
// [[start, end), ...] ORİJİNAL metin konumlarında, birleştirilmiş ve
// sıralı.
export function findMatchRanges(text, terms) {
  if (!terms.length) return [];
  const { text: norm, map } = foldWithMap(text);
  const found = [];
  for (const term of terms) {
    const forms = termVariants(term);
    for (let f = 0; f < forms.length; f++) {
      const t = forms[f];
      let p = norm.indexOf(t);
      while (p >= 0) {
        // ek biçimler yalnızca kelime başında vurgulanır (aramadaki kuralın aynısı)
        if (f === 0 || p === 0 || !isWordCode(norm.charCodeAt(p - 1))) found.push([p, p + t.length]);
        p = norm.indexOf(t, p + t.length);
      }
    }
  }
  found.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged = [];
  for (const r of found) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged.map(([s, e]) => {
    let end = map[e - 1] + 1;
    while (end < text.length && isArabicMark(text.charCodeAt(end))) end++;
    return [map[s], end];
  });
}

// text + terimler -> güvenli HTML: eşleşmeler <mark class="arama-hit">
// içinde, metin uzunsa ilk eşleşme çevresinden kırpılmış ("…" ile).
export function snippetHTML(text, terms, { maxLen = 200, lead = 60 } = {}) {
  const src = String(text || "");
  const ranges = findMatchRanges(src, terms);
  let from = 0;
  let to = src.length;
  if (src.length > maxLen) {
    const first = ranges.length ? ranges[0][0] : 0;
    from = Math.max(0, first - lead);
    if (from > 0) {
      const sp = src.indexOf(" ", from);
      if (sp >= 0 && sp < first) from = sp + 1; // kelime ortasından kesme
    }
    to = Math.min(src.length, from + maxLen);
    if (to < src.length) {
      const sp = src.lastIndexOf(" ", to);
      if (sp > from + maxLen * 0.6) to = sp;
    }
  }
  let html = from > 0 ? "…" : "";
  let pos = from;
  for (const [s, e] of ranges) {
    if (e <= from || s >= to) continue;
    const a = Math.max(s, from);
    const b = Math.min(e, to);
    html += escapeHtml(src.slice(pos, a)) + '<mark class="arama-hit">' + escapeHtml(src.slice(a, b)) + "</mark>";
    pos = b;
  }
  html += escapeHtml(src.slice(pos, to));
  if (to < src.length) html += "…";
  return html;
}

// ---------------------------------------------------------------------
// Son aramalar
// ---------------------------------------------------------------------
export const RECENT_MAX = 10;

export function normalizeRecentQuery(q) {
  return String(q == null ? "" : q).trim().replace(/\s+/g, " ");
}

// localStorage'dan gelen (bozuk olabilecek) değer -> temiz dizi.
export function sanitizeRecent(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const x of value) {
    if (typeof x !== "string") continue;
    const n = normalizeRecentQuery(x);
    if (n && !out.some((y) => fold(y) === fold(n))) out.push(n);
  }
  return out.slice(0, RECENT_MAX);
}

// En yeni başta; aynı sorgu (katlanmış eşitlik: "Sabır" = "sabir")
// tekrar edilirse yeniden başa taşınır, listede iki kez durmaz.
export function addRecentQuery(list, q, max = RECENT_MAX) {
  const n = normalizeRecentQuery(q);
  if (!n) return list.slice();
  const key = fold(n);
  return [n, ...list.filter((x) => fold(x) !== key)].slice(0, max);
}

export function removeRecentQuery(list, q) {
  const key = fold(q);
  return list.filter((x) => fold(x) !== key);
}
