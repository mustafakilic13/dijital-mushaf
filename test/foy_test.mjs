// Elle test föyünün (TEST_FOYU.md) kodla ve GELISTIRICI.md'deki gerçek-cihaz kontrol listeleriyle tutarlılığını denetler.
//
// Neden: föy, otomatik testlerin gösteremediği şeyleri gerçek cihazda denemek için yazıldı; kimse çalıştırmadan
// önce ELLE bir belge olduğu için sessizce çürür: arayüz metni değişir ama föy eski adı söyler, GELISTIRICI.md'nin
// kontrol listesine madde eklenir ama föyde karşılığı olmaz, kart numaraları kayar, sonuç tablosuna bir kart
// eklenmeden kalır. Test sekiz şeyi sınar (föyü çalıştırmaz; gerçek cihazda ne olacağını bilemez):
//   1. Kart yapısı: bölümler A-G, kartlar "### X<n> · Başlık" (n 1'den boşluksuz), her kartta Kaynak + Gerekir satırı,
//      numaralı adımlar (>= 2, 1'den boşluksuz), "**Beklenen**" ve en az bir madde.
//   2. Kapsam: GELISTIRICI.md'deki iki kontrol listesinin (ER: "Erişilebilirlik: gerçek cihaz/ekran okuyucu testi",
//      PW: "PWA: gerçek tarayıcıda ses önbelleği testi") HER maddesi en az bir kartın Kaynak satırında geçiyor; hiçbir
//      kart olmayan bir maddeye (ER-99) ya da README'de olmayan bir bölüme ("README: ...") bağlı değil. Madde sayısı
//      listeden okunur: listeye madde eklenince test, föye kart eklenene kadar başarısız olur.
//   3. Kaynak maddeleri tablosu: her ER-n / PW-n için bir satır, sırayla; satırdaki ilk sözcükler maddenin gerçek
//      başıyla aynı (maddeler araya eklenip numaralar kayarsa kartlar sessizce yanlış maddeye bağlanırdı).
//   4. «...» ile işaretli uygulama metinlerinin hepsi index.html, sw.js ya da js/ altında (yorumlar hariç) gerçekten var
//      ("..." ile bölünmüş şablonların her parçası ayrı aranır); arayüz metni değişince föy bayat kalmaz.
//   5. `...` ile yazılan başvurular gerçek: #kimlik index.html'de, önbellek adları sw.js'ten türetilen adlar,
//      dosya yolları depoda, ses sunucusu adresi kodda, aria-/lang/tabindex öznitelikleri kodda, "%80" eşiği sw.js'teki
//      AUDIO_HIGH_WATER ile aynı.
//   6. "Gerekir" terimleri bilinen sözlükten ve föyün "Ne gerekir" tablosuyla aynı.
//   7. Boş form: sonuç tablosunda her kart için bir satır (sırayla, aynı başlıkla), Sonuç ve Not hücreleri BOŞ
//      (doldurulmuş bir kopya depoya girmesin; sonuçlar bir Issue'ya yazılır); rapor şablonu alanları var.
//   8. Belge bağları: GELISTIRICI.md'nin iki kontrol listesi, README.md'nin "Bilinen sınırlar" bölümü föye bağlanıyor;
//      GitHub'da yanlış görünecek şeyler yok: gizlenen çıplak <etiket>, ve satır başında sayı ya da madde işaretine benzeyen
//      (iç içe liste yapan) satırlar: "3. 1. sayfayı incele", satır sonunda kırılıp "  50. sayfayı açar." diye başlayan devam satırı.
// Başarısız olursa ileti, föyde ya da GELISTIRICI.md'de neyin düzeltileceğini söyler.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, "..");

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
    if (detail !== undefined) console.error(`      ${String(detail).slice(0, 900)}`);
  }
}

const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
// CRLF (Windows'ta autocrlf) ve BOM satır sonu/başlık düzenli ifadelerini bozmasın: okurken LF'ye ve BOM'suz metne çevrilir.
const read = (rel) => (exists(rel) ? fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n") : "");
const listDir = (dir, re) => (exists(dir) ? fs.readdirSync(path.join(ROOT, dir)).filter((n) => re.test(n)).sort().map((n) => `${dir}/${n}`) : []);
const norm = (s) => s.normalize("NFC").replace(/\s+/g, " ").trim();

// ---- Markdown yardımcıları (belge_baglantilari_test.mjs ile aynı kurallar) -------------------------
function stripFences(text) {
  let inFence = false;
  return text
    .split("\n")
    .map((l) => {
      if (l.startsWith("```")) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : l;
    })
    .join("\n");
}
function headings(text) {
  const out = [];
  for (const l of stripFences(text).split("\n")) {
    const m = /^(#{1,6}) +(.+?)\s*$/.exec(l);
    if (m) out.push({ level: m[1].length, text: m[2] });
  }
  return out;
}
function slug(title) {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}_ -]/gu, "")
    .replace(/ /g, "-");
}
// "<başlık-satırı>" satırından aynı ya da daha üst düzeyde bir sonraki başlığa kadar olan satırlar.
function sectionByHeading(text, headingLine) {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.trimEnd() === headingLine);
  if (at < 0) return "";
  const level = /^#+/.exec(headingLine)[0].length;
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i++) {
    const m = /^(#+) /.exec(lines[i]);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(at + 1, end).join("\n");
}

const FOY = "TEST_FOYU.md";
const foy = read(FOY);
const dev = read("GELISTIRICI.md");
const readme = read("README.md");
const foyLines = foy.split("\n");

// ---- GELISTIRICI.md'deki kontrol listeleri ---------------------------------------------------------
const ER_HEADING = "### Erişilebilirlik: gerçek cihaz/ekran okuyucu testi";
const PW_HEADING = "### PWA: gerçek tarayıcıda ses önbelleği testi";
// Numaralı maddeler ("N. ..." satır başında; devam satırları girintili); madde metni tek satıra birleştirilir.
function checklistItems(headingLine) {
  const body = sectionByHeading(dev, headingLine).split("\n");
  const items = [];
  let cur = null;
  for (const l of body) {
    const m = /^(\d+)\. (.*)$/.exec(l);
    if (m) {
      cur = { n: Number(m[1]), parts: [m[2]] };
      items.push(cur);
    } else if (cur && /^\s+\S/.test(l)) cur.parts.push(l.trim());
    else cur = null;
  }
  return items.map((it) => ({ n: it.n, text: norm(it.parts.join(" ")) }));
}
const er = checklistItems(ER_HEADING);
const pw = checklistItems(PW_HEADING);
const itemId = (prefix, i) => `${prefix}-${i + 1}`;
check(`GELISTIRICI.md: ER listesi okundu (${er.length} madde >= 1) ve 1'den boşluksuz numaralı`, er.length >= 1 && er.every((it, i) => it.n === i + 1), er.map((it) => it.n).join(","));
check(`GELISTIRICI.md: PW listesi okundu (${pw.length} madde >= 1) ve 1'den boşluksuz numaralı`, pw.length >= 1 && pw.every((it, i) => it.n === i + 1), pw.map((it) => it.n).join(","));
const allItems = [...er.map((it, i) => ({ id: itemId("ER", i), text: it.text })), ...pw.map((it, i) => ({ id: itemId("PW", i), text: it.text }))];

// ---- 1. Kart yapısı ---------------------------------------------------------------------------------
check("föy: TEST_FOYU.md kökte var ve tek bir '# ' başlığı var", foy.length > 0 && headings(foy).filter((h) => h.level === 1).length === 1);
check("föy: '**Durum:**' paragrafı var (föyün koşulup koşulmadığı açıkça yazılı kalsın)", /^\*\*Durum:\*\* /m.test(foy));

const sections = [];
const cards = [];
{
  let inFence = false;
  let section = null;
  let cur = null;
  foyLines.forEach((l, i) => {
    if (l.startsWith("```")) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    let m;
    if ((m = /^## ([A-G])\. (.+)$/.exec(l))) {
      section = { letter: m[1], title: m[2], at: i + 1 };
      sections.push(section);
      cur = null;
    } else if (/^## /.test(l)) {
      section = null;
      cur = null;
    } else if ((m = /^### ([A-G])(\d+) · (.+)$/.exec(l))) {
      cur = { id: m[1] + m[2], letter: m[1], n: Number(m[2]), title: m[3].trim(), section, at: i + 1, lines: [] };
      cards.push(cur);
    } else if (/^### /.test(l)) cur = null;
    else if (cur) cur.lines.push(l);
  });
}
check(
  `föy: bölümler A-G sırayla var ("## X. Başlık"): ${sections.map((s) => s.letter).join("")}`,
  sections.map((s) => s.letter).join("") === "ABCDEFG",
);
{
  const bad = cards.filter((c) => !c.section || c.section.letter !== c.letter).map((c) => c.id);
  check("föy: her kart kendi harfli bölümünün içinde", bad.length === 0, `yanlış bölümde: ${bad.join(", ")}`);
  const problems = [];
  for (const s of sections) {
    const ns = cards.filter((c) => c.letter === s.letter).map((c) => c.n);
    if (ns.length === 0 || ns.some((n, i) => n !== i + 1)) problems.push(`${s.letter}: ${ns.join(",") || "kart yok"}`);
  }
  check("föy: her bölümde kartlar 1'den boşluksuz numaralı ve bölümde en az bir kart var", problems.length === 0, problems.join(" | "));
  const ids = cards.map((c) => c.id);
  check(`föy: kart kimlikleri benzersiz (${cards.length} kart >= 30)`, cards.length >= 30 && new Set(ids).size === ids.length, ids.filter((x, i) => ids.indexOf(x) !== i).join(", "));
}

// Kart gövdesi: başlık bloku (Kaynak + Gerekir; satır kaydırmalı olabilir), numaralı adımlar, **Beklenen** + maddeler.
for (const c of cards) {
  const L = c.lines;
  let i = 0;
  while (i < L.length && L[i].trim() === "") i++;
  const head = [];
  while (i < L.length && L[i].trim() !== "") head.push(L[i++].trim());
  const hm = /^\*\*Kaynak:\*\* (.+?) · \*\*Gerekir:\*\* (.+)$/.exec(head.join(" "));
  c.kaynak = hm ? hm[1].trim() : null;
  c.gerekir = hm ? hm[2].trim() : null;
  const at = L.findIndex((l) => l.trim() === "**Beklenen**");
  c.stepNums = L.slice(0, at < 0 ? L.length : at).map((l) => /^(\d+)\. \S/.exec(l)).filter(Boolean).map((m) => Number(m[1]));
  c.bullets = at < 0 ? [] : L.slice(at + 1).filter((l) => /^- \S/.test(l));
  c.hasBeklenen = at >= 0;
}
{
  const noHead = cards.filter((c) => !c.kaynak || !c.gerekir).map((c) => c.id);
  check("föy: her kartın ilk bloku '**Kaynak:** ... · **Gerekir:** ...' biçiminde", noHead.length === 0, `başlık bloku eksik/bozuk: ${noHead.join(", ")}`);
  const badSteps = cards.filter((c) => c.stepNums.length < 2 || c.stepNums.some((n, i) => n !== i + 1)).map((c) => `${c.id} (${c.stepNums.join(",") || "adım yok"})`);
  check("föy: her kartta en az 2 numaralı adım var ve 1'den boşluksuz numaralı", badSteps.length === 0, badSteps.join(" | "));
  const noBek = cards.filter((c) => !c.hasBeklenen || c.bullets.length === 0).map((c) => c.id);
  check("föy: her kartta '**Beklenen**' ve altında en az bir '- ' maddesi var", noBek.length === 0, noBek.join(", "));
}

// ---- 2. Kapsam: kaynak belirteçleri ----------------------------------------------------------------
const readmeHeads = new Set(headings(readme).filter((h) => h.level >= 2).map((h) => h.text));
const covered = new Set();
{
  const bad = [];
  for (const c of cards) {
    if (!c.kaynak) continue;
    for (const raw of c.kaynak.split(",")) {
      const tok = raw.trim();
      let m;
      if ((m = /^ER-(\d+)$/.exec(tok))) {
        if (Number(m[1]) >= 1 && Number(m[1]) <= er.length) covered.add(`ER-${m[1]}`);
        else bad.push(`${c.id}: ${tok} (listede ${er.length} madde var)`);
      } else if ((m = /^PW-(\d+)$/.exec(tok))) {
        if (Number(m[1]) >= 1 && Number(m[1]) <= pw.length) covered.add(`PW-${m[1]}`);
        else bad.push(`${c.id}: ${tok} (listede ${pw.length} madde var)`);
      } else if ((m = /^README: (.+)$/.exec(tok))) {
        if (!readmeHeads.has(m[1].trim())) bad.push(`${c.id}: README'de "${m[1].trim()}" başlığı yok`);
      } else bad.push(`${c.id}: tanınmayan kaynak "${tok}" (ER-n, PW-n ya da README: <başlık> olmalı)`);
    }
  }
  check("föy: kartların Kaynak belirteçleri gerçek (ER-n/PW-n listede var, 'README: bölüm' README'de bir başlık)", bad.length === 0, bad.join(" | "));
  const missing = allItems.filter((it) => !covered.has(it.id));
  check(
    `kapsam: GELISTIRICI.md'deki ${allItems.length} kontrol maddesinin (ER ${er.length} + PW ${pw.length}) hepsi en az bir kartta`,
    missing.length === 0,
    `karşılığı olmayan maddeler -- föye kart ekle (Kaynak: ${missing[0] ? missing[0].id : ""}): ${missing.map((it) => `${it.id} "${it.text.slice(0, 50)}"`).join(" | ")}`,
  );
}

// ---- 3. Kaynak maddeleri tablosu ----------------------------------------------------------------------
{
  const body = sectionByHeading(foy, "## Kaynak maddeleri").split("\n");
  const rows = body.filter((l) => l.startsWith("|")).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
  const data = rows.filter((r) => /^(ER|PW)-\d+$/.test(r[0]));
  check(
    `Kaynak maddeleri: her madde için bir satır, sırayla (${data.length} satır = ${allItems.length} madde)`,
    JSON.stringify(data.map((r) => r[0])) === JSON.stringify(allItems.map((it) => it.id)),
    `tabloda: ${data.map((r) => r[0]).join(",")} -- listede: ${allItems.map((it) => it.id).join(",")}`,
  );
  const wrong = [];
  for (const r of data) {
    const it = allItems.find((x) => x.id === r[0]);
    const label = norm(r[1] || "");
    if (!it || label.length < 5 || !it.text.startsWith(label)) wrong.push(`${r[0]}: "${label}" maddenin başı değil (madde: "${it ? it.text.slice(0, 60) : "yok"}")`);
  }
  check("Kaynak maddeleri: her satırdaki ilk sözcükler GELISTIRICI.md'deki maddenin gerçek başı (numaralar kaymamış)", wrong.length === 0, wrong.join(" | "));
  const labels = data.map((r) => norm(r[1] || ""));
  check("Kaynak maddeleri: ilk sözcükler maddeleri ayırt ediyor (iki satırda aynı metin yok)", new Set(labels).size === labels.length);
}

// ---- 4. «...» uygulama metinleri -----------------------------------------------------------------------
// Uygulama metni yalnızca YORUMDA geçiyorsa gerçek arayüz metni değildir: yorumlar atılır. JS için dizgelere, şablon
// metinlerine ve düzenli ifadelere dokunmayan küçük bir tarayıcı (data/*.json gibi bir yorum parçası ya da dizge içindeki
// "https://" bir yorum sayılmaz); HTML için <!-- -->. Aşağıdaki kanarya denetimi süzgecin kendisini sınar.
function stripJsComments(text) {
  const n = text.length;
  let i = 0;
  let out = "";
  let prev = ""; // son anlamlı karakter ("a": kimlik/sayı, ")": değer gibi davranır)
  let prevWord = "";
  const WORDS = new Set(["return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do", "yield", "await"]);
  const regexAllowed = () => prev === "" || "(,=:[!&|?{;+-*%<>~^".includes(prev) || WORDS.has(prevWord);
  const readString = (q) => {
    let j = i + 1;
    while (j < n && text[j] !== q && text[j] !== "\n") {
      if (text[j] === "\\") j++;
      j++;
    }
    out += text.slice(i, j + 1);
    i = j + 1;
  };
  const readTemplate = () => {
    while (i < n) {
      const c = text[i];
      if (c === "\\") {
        out += text.slice(i, i + 2);
        i += 2;
      } else if (c === "`") {
        out += c;
        i++;
        return;
      } else if (c === "$" && text[i + 1] === "{") {
        out += "${";
        i += 2;
        readCode(true);
      } else {
        out += c;
        i++;
      }
    }
  };
  function readCode(inTemplate) {
    let depth = 0;
    while (i < n) {
      const c = text[i];
      const d = text[i + 1];
      if (c === "/" && d === "/") {
        while (i < n && text[i] !== "\n") i++;
      } else if (c === "/" && d === "*") {
        const e = text.indexOf("*/", i + 2);
        const stop = e < 0 ? n : e + 2;
        out += text.slice(i, stop).replace(/[^\n]/g, "");
        i = stop;
      } else if (c === '"' || c === "'") {
        readString(c);
        prev = ")";
        prevWord = "";
      } else if (c === "`") {
        out += c;
        i++;
        readTemplate();
        prev = ")";
        prevWord = "";
      } else if (c === "/" && regexAllowed()) {
        let j = i + 1;
        let inClass = false;
        while (j < n && text[j] !== "\n" && (inClass || text[j] !== "/")) {
          if (text[j] === "\\") j++;
          else if (text[j] === "[") inClass = true;
          else if (text[j] === "]") inClass = false;
          j++;
        }
        out += text.slice(i, j + 1);
        i = j + 1;
        prev = ")";
        prevWord = "";
      } else if (c === "{") {
        depth++;
        out += c;
        i++;
        prev = c;
        prevWord = "";
      } else if (c === "}") {
        out += c;
        i++;
        if (inTemplate && depth === 0) return;
        depth--;
        prev = "}";
        prevWord = "";
      } else if (/\s/.test(c)) {
        out += c;
        i++;
      } else if (/[A-Za-z_$0-9]/.test(c)) {
        let j = i;
        while (j < n && /[\w$]/.test(text[j])) j++;
        prevWord = text.slice(i, j);
        out += prevWord;
        i = j;
        prev = "a";
      } else {
        out += c;
        i++;
        prev = c;
        prevWord = "";
      }
    }
  }
  readCode(false);
  return out;
}

const stripComments = (file, text) => (file.endsWith(".html") ? text.replace(/<!--[\s\S]*?-->/g, "") : stripJsComments(text));
const corpusFiles = ["index.html", "sw.js", ...listDir("js", /\.js$/)];
const corpus = corpusFiles.map((f) => stripComments(f, read(f))).join("\n");
check(
  "kod taraması: yorum süzgeci dizge içindeki '//' adresini ve yorumdaki '/*' parçasının ardındaki kodu korur (kanarya)",
  corpus.includes("https://audio-cdn.tarteel.ai/quran/") && corpus.includes("[sw] önbelleğe alınamadı") && corpusFiles.length >= 15,
  `taranan dosya: ${corpusFiles.length}. Kanarya dizgeleri (ses sunucusu adresi, sw.js uyarısı) kodda bilerek değiştiyse bu denetimi ve föyü güncelle; değilse stripJsComments kodu yutuyor`,
);
const foyText = stripFences(foy);
{
  // «…» (yalnız üç nokta) föyün yazım açıklamasındaki gösterim örneğidir, uygulama metni değil.
  const lits = [...new Set([...foyText.replace(/\s+/g, " ").matchAll(/«([^»]+)»/g)].map((m) => m[1].trim()))].filter((l) => l !== "…");
  const missing = [];
  for (const lit of lits) {
    const parts = lit.split("…").map((p) => p.trim()).filter(Boolean);
    const lost = parts.length === 0 ? [lit] : parts.filter((p) => !corpus.includes(p));
    if (lost.length) missing.push(`«${lit}»${parts.length > 1 ? ` (bulunmayan parça: "${lost.join('", "')}")` : ""}`);
  }
  check(`«...» metinleri: ${lits.length} benzersiz uygulama metninin (>= 20) hepsi index.html / sw.js / js/ içinde geçiyor`, lits.length >= 20 && missing.length === 0, `kodda bulunamayan: ${missing.join(" | ")} -- arayüz metni değiştiyse föyü, föy yanlışsa «...»yi düzelt; ekran okuyucunun söylediği (kodda olmayan) metin "..." ile yazılır`);
  check("«...» metinleri: kapanmamış «» yok", (foyText.match(/«/g) || []).length === (foyText.match(/»/g) || []).length);
}

// ---- 5. `...` başvuruları ------------------------------------------------------------------------------
{
  const ticks = [...new Set([...foyText.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]))];
  const ids = new Set([...read("index.html").matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const sw = read("sw.js");
  const prefix = (/const CACHE_PREFIX = "([^"]+)"/.exec(sw) || [])[1];
  const cacheNames = new Set([...sw.matchAll(/const (?:AUDIO|SHELL|DATA)_CACHE = CACHE_PREFIX \+ "([^"]+)"/g)].map((m) => prefix + m[1]));
  check(`sw.js: ${cacheNames.size} önbellek adı türetildi (${[...cacheNames].join(", ")})`, prefix !== undefined && cacheNames.size === 3);
  const bad = [];
  let nId = 0;
  let nCache = 0;
  let nFile = 0;
  let nAttr = 0;
  for (const t of ticks) {
    if (/^#[a-z][a-z0-9-]*$/.test(t)) {
      nId++;
      if (!ids.has(t.slice(1))) bad.push(`${t}: index.html'de bu kimlik yok`);
    } else if (/^dijital-mushaf-[a-z]+-v\d+$/.test(t)) {
      nCache++;
      if (!cacheNames.has(t)) bad.push(`${t}: sw.js'in önbellek adlarından değil (${[...cacheNames].join(", ")})`);
    } else if (/^(?:audio|data|css|js|fonts|icons|vendor|test|tools)\/[\w./-]+$/.test(t)) {
      nFile++;
      if (!exists(t)) bad.push(`${t}: depoda böyle bir dosya yok`);
    } else if (/^audio-cdn\.tarteel\.ai$/.test(t)) {
      if (!corpus.includes(t)) bad.push(`${t}: kodda geçmiyor`);
    } else if (/^(?:aria-[a-z]+|lang="[a-z]+"|tabindex="-?\d+")$/.test(t)) {
      nAttr++;
      if (!corpus.includes(t)) bad.push(`${t}: index.html/js/ içinde geçmiyor`);
    } else if (t === "foreignObject") {
      if (!corpus.includes(t)) bad.push(`${t}: kodda geçmiyor`);
    } else if (/^#page=\d+$/.test(t)) {
      if (!corpus.includes("#page=")) bad.push(`${t}: kodda '#page=' adres kalıbı yok`);
    }
  }
  check(`başvurular: \`#kimlik\` (${nId}), önbellek adı (${nCache}), dosya yolu (${nFile}), öznitelik (${nAttr}) ve adresler gerçek`, bad.length === 0 && nId >= 1 && nCache >= 1 && nFile >= 1 && nAttr >= 1, bad.join(" | ") || "kontrol vakumlu: her türden (kimlik, önbellek adı, dosya yolu, öznitelik) en az 1 başvuru beklenir");
  const hw = /const AUDIO_HIGH_WATER = ([0-9.]+)/.exec(sw);
  const pct = hw ? Math.round(parseFloat(hw[1]) * 100) : null;
  const pcts = [...foyText.matchAll(/kotanın %(\d+)/g)].map((m) => Number(m[1]));
  check(`kota eşiği: föydeki "kotanın %NN" (${pcts.join(",")}) sw.js AUDIO_HIGH_WATER (${pct === null ? "bulunamadı" : "%" + pct}) ile aynı`, pct !== null && pcts.length >= 1 && pcts.every((p) => p === pct));
}

// ---- 6. "Gerekir" sözlüğü -------------------------------------------------------------------------------
const VOCAB = ["yalnızca tarayıcı", "ekran okuyucu", "klavye", "dokunmatik cihaz", "DevTools", "internet", "çevrimdışı", "sesle kumanda"];
{
  const bad = [];
  const usedBy = new Map();
  for (const c of cards) {
    if (!c.gerekir) continue;
    const terms = c.gerekir.replace(/\([^)]*\)/g, "").split(",").map((t) => t.trim()).filter(Boolean);
    if (terms.length === 0) bad.push(`${c.id}: boş`);
    for (const t of terms) {
      if (!VOCAB.includes(t)) bad.push(`${c.id}: "${t}" sözlükte yok`);
      usedBy.set(t, (usedBy.get(t) || 0) + 1);
    }
  }
  check(`Gerekir: her kartın terimleri bilinen sözlükten (${VOCAB.join(", ")})`, bad.length === 0, bad.join(" | "));
  const tbl = sectionByHeading(foy, "### Ne gerekir").split("\n").filter((l) => l.startsWith("|")).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
  const tblTerms = tbl.filter((r) => r[0] !== "Terim" && !/^-+$/.test(r[0])).map((r) => r[0]);
  check(`Gerekir: föyün "Ne gerekir" tablosu sözlükle aynı terimleri anlatıyor (${tblTerms.length})`, JSON.stringify([...tblTerms].sort()) === JSON.stringify([...VOCAB].sort()), `tabloda: ${tblTerms.join(", ")}`);
}

// ---- 7. Boş form: sonuç tablosu ve rapor şablonu --------------------------------------------------------
{
  const body = sectionByHeading(foy, "## Sonuç tablosu").split("\n");
  const rows = body.filter((l) => l.startsWith("|")).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
  const header = rows[0] || [];
  const data = rows.slice(2);
  check("Sonuç tablosu: sütunlar 'Kart | Test | Sonuç | Not'", JSON.stringify(header) === JSON.stringify(["Kart", "Test", "Sonuç", "Not"]), header.join(" | "));
  check(
    `Sonuç tablosu: her kart için bir satır, sırayla, kartla aynı başlıkla (${data.length} satır = ${cards.length} kart)`,
    JSON.stringify(data.map((r) => [r[0], r[1]])) === JSON.stringify(cards.map((c) => [c.id, c.title])),
    `tabloda: ${data.map((r) => r[0]).join(",")} -- kartlar: ${cards.map((c) => c.id).join(",")}`,
  );
  const filled = data.filter((r) => r.length !== 4 || r[2] !== "" || r[3] !== "").map((r) => r[0]);
  check("Sonuç tablosu: Sonuç ve Not hücreleri BOŞ (föy boş bir formdur; sonuçlar bir GitHub Issue'suna yazılır)", filled.length === 0, `dolu satırlar: ${filled.join(", ")}`);

  const fence = /```\n([\s\S]*?)```/.exec(foy);
  const tpl = fence ? fence[1] : "";
  const fields = ["Tarih:", "Cihaz ve işletim sistemi", "Tarayıcı", "Ekran okuyucu", "Arapça ses", "Ağ", "Denenen sürüm"];
  const lost = fields.filter((f) => !tpl.includes(f));
  check("Rapor şablonu: kod bloğunda cihaz/tarayıcı/ekran okuyucu/ağ/sürüm alanları var", lost.length === 0, `eksik alanlar: ${lost.join(", ")}`);
}

// ---- 8. Belge bağları ------------------------------------------------------------------------------------
{
  const mentions = (text) => /\]\(TEST_FOYU\.md(?:#[^)]*)?\)/.test(text);
  check("GELISTIRICI.md: gerçek-cihaz erişilebilirlik listesi (ER) TEST_FOYU.md'ye bağlanıyor", mentions(sectionByHeading(dev, ER_HEADING)));
  check("GELISTIRICI.md: PWA gerçek tarayıcı listesi (PW) TEST_FOYU.md'ye bağlanıyor", mentions(sectionByHeading(dev, PW_HEADING)));
  check("README.md: 'Bilinen sınırlar' bölümü TEST_FOYU.md'ye bağlanıyor", mentions(sectionByHeading(readme, "## Bilinen sınırlar")));
  check("föy: README.md ve GELISTIRICI.md'ye bağlanıyor", /\]\(README\.md\)/.test(foy) && /\]\(GELISTIRICI\.md[#)]/.test(foy));
  // GitHub, kod aralığı dışındaki <etiket>i HTML sayıp gizler ("Sayfa N, <Sure> Suresi" gibi yer tutucular kaybolurdu).
  const bare = foyText.replace(/`[^`\n]*`/g, "").split("\n").map((l, i) => ({ l, n: i + 1 })).filter(({ l }) => /<[A-Za-z/!]/.test(l));
  check("föy: kod aralığı dışında çıplak <etiket> yok (GitHub gizler)", bare.length === 0, bare.map(({ n, l }) => `satır ${n}: ${l.trim().slice(0, 60)}`).join(" | "));
  // CommonMark: satır başındaki (ya da girintili) "1. sayfa" iç içe numaralı liste, girintili "- x" iç içe madde listesi, ">" alıntı
  // bloğu açar; kart adımlarının metni ve satır kırılmaları bu yüzden sayıyla başlamamalı ("Sayfa 1'de ..." ya da "ilk sayfada ...").
  // Satır başı numaraları yalnızca 1'den boşluksuz artan adım numaralarıdır (her başlıkta 1'e döner).
  const marks = [];
  let expected = 1;
  foyText.split("\n").forEach((l, i) => {
    if (/^#{1,6} /.test(l)) expected = 1;
    const at = `satır ${i + 1}: ${l.trim().slice(0, 50)}`;
    let m;
    if ((m = /^(\s*)(\d{1,9})[.)] (.*)$/.exec(l))) {
      if (m[1] !== "") marks.push(`${at} (girintili sayı işareti: GitHub iç içe liste yapar)`);
      else if (Number(m[2]) !== expected) marks.push(`${at} (${expected}. adım beklenirdi; cümle sayı işaretiyle başlıyor)`);
      else {
        expected++;
        if (/^\d{1,9}[.)] /.test(m[3])) marks.push(`${at} (adım metni sayı işaretiyle başlıyor: GitHub iç içe liste yapar)`);
      }
    } else if ((m = /^(\s*)[-+*] (.*)$/.exec(l))) {
      if (m[1] !== "") marks.push(`${at} (girintili madde işareti: GitHub iç içe liste yapar)`);
      else if (/^\d{1,9}[.)] /.test(m[2])) marks.push(`${at} (madde metni sayı işaretiyle başlıyor: GitHub iç içe liste yapar)`);
    } else if (/^\s*>/.test(l)) marks.push(`${at} (alıntı bloğu)`);
  });
  check("föy: satır başında sayı/madde işaretine benzeyen, GitHub'da iç içe liste yapacak satır yok (cümleyi başka sözcükle başlat)", marks.length === 0, marks.join(" | "));
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  const nBul = cards.reduce((a, c) => a + c.bullets.length, 0);
  console.log(`All checks passed (föy: ${cards.length} kart / ${sections.length} bölüm, ${nBul} beklenen maddesi; ${er.length} ER + ${pw.length} PW maddesinin hepsi kapsandı; ${checks} kontrol).`);
}
