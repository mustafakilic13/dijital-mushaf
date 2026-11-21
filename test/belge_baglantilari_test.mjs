// Belgelerin birbirine bağlantılarını ve README.md / GELISTIRICI.md ayrımını denetler.
//
// Neden: tek bir 4.000+ satırlık README, kullanıcı belgesi (README.md) ile geliştirici belgesine
// (GELISTIRICI.md) ayrıldı. Ayrım sessizce bozulabilir: bölümler bir dosyadan ötekine taşınır ve bağlantılar
// ya da "bkz." atıfları boşa düşer; kullanıcı belgesine yine dosya yolları, test adları birikir ve kısa belge
// yeniden duvara döner; "izleme yok, tek dış sunucu ses sunucusu" cümlesi koddan ayrışır. Test altı şeyi sınar:
//   1. README.md ve GELISTIRICI.md kökte var, her birinde tek bir "# " başlığı var.
//   2. Belgelerdeki (README.md, GELISTIRICI.md, VERI_KAYNAKLARI.md, THIRD_PARTY_NOTICES.md, TEST_FOYU.md) göreli Markdown
//      bağlantılarının hedef dosyası var; "#bağlantı"lar hedef belgede GERÇEK bir başlığa (GitHub'ın bağlantı
//      üretme kuralıyla) çözülüyor; bir belgede aynı bağlantıyı üreten iki başlık yok (bağlantı belirsizleşirdi).
//   3. GELISTIRICI.md'nin "İçindekiler" listesi, belgenin "## " başlıklarıyla aynı sırada ve aynı adda.
//   4. README.md kullanıcı belgesi: beklenen bölümler (lisans bölümü dahil) var, GELISTIRICI.md'ye bağlanıyor,
//      geliştirici ayrıntısı (js/ css/ test/ yolları, .mjs/.js/.css/.py dosya adları, jsdom, npm...) taşımıyor,
//      kısa kalıyor (<= 400 satır) ve geliştirici belgesinin bölümlerini tekrarlamıyor.
//   5. GELISTIRICI.md geliştirici belgesi: README.md'ye bağlanıyor, geliştirici bölümleri orada, "Lisans ve telif"
//      bölümü orada DEĞİL (README.md'de) ve ona yapılan atıfların hepsi README.md'yi anıyor.
//   6. Gizlilik: README.md "Gizlilik" bölümü ses sunucusunu anıyor; kodda (index.html, sw.js, manifest.json, js/,
//      css/) geçen dış adreslerin hepsi bilinen listede. Yeni bir dış adres çıkarsa test, belgenin bilerek gözden
//      geçirilmesini ister (uygulama o adrese istek yapıyorsa "izleme yok" cümlesi artık doğru olmayabilir).
// Başarısız olursa ileti, hangi belgenin neyi eklemesi/düzeltmesi gerektiğini söyler.

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
    if (detail !== undefined) console.error(`      ${String(detail).slice(0, 600)}`);
  }
}

const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const read = (rel) => (exists(rel) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : "");
const listDir = (dir, re) => (exists(dir) ? fs.readdirSync(path.join(ROOT, dir)).filter((n) => re.test(n)).sort().map((n) => `${dir}/${n}`) : []);

// ---- Markdown yardımcıları ----------------------------------------------------------------
// Kod bloklarının (``` ... ```) içi başlık ya da bağlantı sayılmaz: satırlar boşaltılır (satır numaraları korunur).
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
// GitHub'ın başlık bağlantısı (anchor) kuralı: küçük harf; harf, rakam, "_", "-" ve boşluk dışındakiler atılır;
// boşluk "-" olur ("Ezber (Dinle / Oku / Yaz)" -> "ezber-dinle--oku--yaz").
function slug(title) {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}_ -]/gu, "")
    .replace(/ /g, "-");
}
// [metin](hedef) bağlantıları; satır içi kod (`...`) ve kod blokları dışında.
function links(text) {
  const t = stripFences(text).replace(/`[^`\n]*`/g, "``");
  return [...t.matchAll(/\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => ({ text: m[1], target: m[2] }));
}
// "## <başlık>" satırından bir sonraki "## " satırına kadar.
function section(text, title) {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.trimEnd() === `## ${title}`);
  if (at < 0) return "";
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }
  return lines.slice(at + 1, end).join("\n");
}

// Satır sayısı `wc -l` gibi sayılır (sondaki satır sonu fazladan bir satır değildir).
const nLines = (t) => t.replace(/\n$/, "").split("\n").length;

const DOCS = ["README.md", "GELISTIRICI.md", "VERI_KAYNAKLARI.md", "THIRD_PARTY_NOTICES.md", "TEST_FOYU.md"];
const text = Object.fromEntries(DOCS.map((d) => [d, read(d)]));

// ---- 1. Belgeler var, tek H1 ---------------------------------------------------------------
for (const d of DOCS) check(`${d}: kökte var`, exists(d) && text[d].length > 0);
for (const d of ["README.md", "GELISTIRICI.md"]) {
  const h1 = headings(text[d]).filter((h) => h.level === 1);
  check(`${d}: tek bir "# " başlığı var`, h1.length === 1, h1.map((h) => h.text).join(" | "));
}

// ---- 2. Bağlantılar ------------------------------------------------------------------------
check(
  "slug(): GitHub bağlantı kuralı (örnek başlıklar)",
  slug("Ezber (Dinle / Oku / Yaz)") === "ezber-dinle--oku--yaz" &&
    slug("Nasıl çalışır (mimari)") === "nasıl-çalışır-mimari" &&
    slug("PWA ve çevrimdışı önbellekleme") === "pwa-ve-çevrimdışı-önbellekleme" &&
    slug("Testler ve CI") === "testler-ve-ci",
);
{
  const deadFiles = [];
  const deadAnchors = [];
  let relLinks = 0;
  let anchorLinks = 0;
  for (const d of DOCS) {
    for (const { target } of links(text[d])) {
      if (/^(?:[a-z][a-z0-9+.-]*:)/i.test(target)) continue; // https:, mailto: ...
      relLinks++;
      const [file, anchor] = target.split("#");
      const targetDoc = file === "" ? d : file;
      const isFile = exists(targetDoc) && fs.statSync(path.join(ROOT, targetDoc)).isFile();
      if (!isFile) {
        deadFiles.push(`${d} -> ${target}`);
        continue;
      }
      if (anchor) {
        anchorLinks++;
        const known = new Set(headings(read(targetDoc)).map((h) => slug(h.text)));
        if (!/\.md$/i.test(targetDoc) || !known.has(anchor)) deadAnchors.push(`${d} -> ${target}`);
      }
    }
  }
  check(`bağlantılar: ${relLinks} göreli bağlantının hedef dosyası depoda var`, deadFiles.length === 0, `hedefi olmayan bağlantılar: ${deadFiles.join(" | ")}`);
  check(`bağlantılar: ${anchorLinks} "#bağlantı" hedef belgede bir başlığa çözülüyor`, deadAnchors.length === 0, `başlığı olmayan bağlantılar: ${deadAnchors.join(" | ")}`);
  check(`bağlantılar: kontrol vakumlu değil (göreli ${relLinks} >= 20, "#"li ${anchorLinks} >= 15)`, relLinks >= 20 && anchorLinks >= 15);
  for (const d of DOCS) {
    const slugs = headings(text[d]).map((h) => slug(h.text));
    const dup = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    check(`${d}: aynı bağlantıyı üreten iki başlık yok`, dup.length === 0, `yinelenen: ${[...new Set(dup)].join(", ")}`);
  }
}

// ---- 3. GELISTIRICI.md İçindekiler ------------------------------------------------------------
const dev = text["GELISTIRICI.md"];
const devH2 = headings(dev).filter((h) => h.level === 2).map((h) => h.text);
{
  const lines = dev.split("\n");
  const at = lines.findIndex((l) => l.trim() === "**İçindekiler**");
  check('GELISTIRICI.md: "**İçindekiler**" listesi var', at >= 0);
  const toc = [];
  const stray = [];
  for (let i = at + 1; at >= 0 && i < lines.length && !lines[i].startsWith("## "); i++) {
    if (!lines[i].trim()) continue;
    const m = /^- \[(.+)\]\(#([^)]+)\)\s*$/.exec(lines[i]);
    if (m) toc.push({ title: m[1], anchor: m[2] });
    else stray.push(lines[i]);
  }
  check("GELISTIRICI.md: İçindekiler yalnızca '- [Başlık](#bağlantı)' satırlarından oluşuyor", stray.length === 0, stray.join(" | "));
  check(
    `GELISTIRICI.md: İçindekiler, belgenin ${devH2.length} "## " başlığıyla aynı sırada ve aynı adda`,
    JSON.stringify(toc.map((t) => t.title)) === JSON.stringify(devH2),
    `İçindekiler: ${toc.map((t) => t.title).join(" | ")} -- başlıklar: ${devH2.join(" | ")}`,
  );
  check("GELISTIRICI.md: İçindekiler bağlantıları başlıklarının GitHub bağlantısıyla aynı", toc.length === devH2.length && toc.every((t, i) => t.anchor === slug(devH2[i])));
}

// ---- 4. README.md: kullanıcı belgesi -------------------------------------------------------------
const readme = text["README.md"];
const readmeH2 = headings(readme).filter((h) => h.level === 2).map((h) => h.text);
{
  const need = ["Neler var", "Kullanım", "Klavye ve ekran okuyucu", "Çevrimdışı kullanım ve kurulum", "Gizlilik", "Bilinen sınırlar", "Geliştiriciler için", "Lisans ve telif"];
  const missing = need.filter((n) => !readmeH2.includes(n));
  check("README.md: kullanıcı belgesinin bölümleri var (Neler var, Kullanım, Klavye ve ekran okuyucu, Çevrimdışı..., Gizlilik, Bilinen sınırlar, Geliştiriciler için, Lisans ve telif)", missing.length === 0, `eksik bölümler: ${missing.join(", ")}`);
  check("README.md: GELISTIRICI.md'ye bağlanıyor (geliştirici ayrıntısının nerede olduğu belli)", links(readme).some((l) => l.target.split("#")[0] === "GELISTIRICI.md"));
  const lineCount = nLines(readme);
  check(`README.md: kısa kalıyor (${lineCount} <= 400 satır; uzayan ayrıntı GELISTIRICI.md'ye gider)`, lineCount <= 400);
  // Kullanıcı belgesinde geliştirici ayrıntısı olmamalı. (tools/raw-data/ gibi veri klasörleri lisans bölümünde anılabilir.)
  const DEV_MARKERS = [
    [/\b(?:js|css|test)\/[\w.-]+/, "js/, css/ ya da test/ yolu"],
    [/\.mjs\b/, ".mjs dosya adı"],
    [/\b[\w-]+\.(?:js|css|py)\b/, ".js/.css/.py dosya adı"],
    [/\bjsdom\b|\baxe-core\b|\bnpm\b|\bNode\.js\b/i, "geliştirme/test aracı adı"],
    [/\baria-[a-z]+\b/i, "ARIA öznitelik adı"],
  ];
  const found = DEV_MARKERS.filter(([re]) => re.test(readme)).map(([re, why]) => `${why}: ${(re.exec(readme) || [""])[0]}`);
  check("README.md: geliştirici ayrıntısı taşımıyor (dosya yolları, test/araç adları GELISTIRICI.md'de)", found.length === 0, found.join(" | "));
  const dupSections = readmeH2.filter((h) => devH2.includes(h));
  check("README.md: GELISTIRICI.md'nin bölümlerini tekrarlamıyor (aynı adlı '## ' başlığı yok)", dupSections.length === 0, dupSections.join(", "));
}

// ---- 5. GELISTIRICI.md: geliştirici belgesi -------------------------------------------------------
{
  check("GELISTIRICI.md: README.md'ye bağlanıyor (kullanıcı belgesinin nerede olduğu belli)", links(dev).some((l) => l.target.split("#")[0] === "README.md"));
  const essential = ["Nasıl çalışır (mimari)", "Proje yapısı", "Testler ve CI", "Yapılacaklar"];
  const missing = essential.filter((n) => !devH2.includes(n));
  check("GELISTIRICI.md: temel geliştirici bölümleri var (Nasıl çalışır (mimari), Proje yapısı, Testler ve CI, Yapılacaklar)", missing.length === 0, `eksik bölümler: ${missing.join(", ")}`);
  check('GELISTIRICI.md: "Lisans ve telif" bölümü burada değil (README.md\'de; iki yerde olursa ayrışır)', !devH2.includes("Lisans ve telif"));
  // "Lisans ve telif" (kapanış tırnağıyla biten tam ad) README.md'deki bölümdür; GELISTIRICI.md'de her anışın hemen önünde README.md geçmeli.
  const bare = [];
  const re = /"Lisans ve telif"/g;
  let n = 0;
  for (let m = re.exec(dev); m; m = re.exec(dev)) {
    n++;
    if (!dev.slice(Math.max(0, m.index - 30), m.index).includes("README.md")) bare.push(dev.slice(Math.max(0, m.index - 40), m.index + 20).replace(/\s+/g, " "));
  }
  check(`GELISTIRICI.md: "Lisans ve telif" atıflarının (${n}) hepsi README.md'yi anıyor`, n >= 1 && bare.length === 0, `README.md'siz atıflar: ${bare.join(" | ")}`);
}

// ---- 6. Gizlilik cümlesi koddaki dış adreslerle uyumlu ------------------------------------------
{
  const priv = section(readme, "Gizlilik").replace(/\s+/g, " ");
  check('README.md: "Gizlilik" bölümü var', priv.length > 0);
  check("README.md: Gizlilik bölümü hesap/reklam/izleme olmadığını söylüyor ve tek dış sunucuyu (audio-cdn.tarteel.ai) anıyor", /hesap, reklam ya da izleme yoktur/i.test(priv) && priv.includes("audio-cdn.tarteel.ai"), priv.slice(0, 200));

  // Bilinen dış adresler ve nedeni. Hepsi kodda (yorum ya da bağlantı dahil) geçiyor; çalışma anında ağa çıkan TEK adres ses sunucusu.
  const ALLOWED = {
    "audio-cdn.tarteel.ai": "ayet sesleri (çalışma anında istenen tek dış sunucu; README.md Gizlilik bölümünde anılıyor)",
    "github.com": "altbilgideki kaynak kod / VERI_KAYNAKLARI.md bağlantıları ve DigitalKhatt kaynağına yorum",
    "digitalkhatt.org": "dizgi tekniğinin kaynağı (yorum)",
    "www.w3.org": "SVG ad alanı tanımlayıcıları (ağ isteği değil)",
    "quranenc.com": "Sa'dî tefsiri atıf bağlantısı (kullanıcı tıklarsa açılır)",
  };
  const files = ["index.html", "sw.js", "manifest.json", ...listDir("js", /\.js$/), ...listDir("css", /\.css$/)].filter(exists);
  const hosts = new Map();
  for (const f of files) {
    for (const m of read(f).matchAll(/\bhttps?:\/\/([A-Za-z0-9.-]+)/g)) {
      const h = m[1].replace(/\.$/, "");
      if (!hosts.has(h)) hosts.set(h, new Set());
      hosts.get(h).add(f);
    }
  }
  const unknown = [...hosts.keys()].filter((h) => !(h in ALLOWED));
  check(
    `kod: dış adreslerin (${[...hosts.keys()].join(", ")}) hepsi bilinen listede`,
    unknown.length === 0,
    `bilinmeyen dış adres: ${unknown.map((h) => `${h} (${[...hosts.get(h)].join(", ")})`).join("; ")} -- uygulama bu adrese istek yapıyorsa README.md "Gizlilik" bölümü ve VERI_KAYNAKLARI.md gözden geçirilmeli; yalnızca yorum/bağlantıysa bu testteki ALLOWED listesine eklenmeli`,
  );
  // Ses adresi js/ altındaki bir dosyada geçiyor (hangisinde olduğu önemli değil: kod bölünürse test bozulmasın).
  const audioFiles = files.filter((f) => f.startsWith("js/") && read(f).includes("https://audio-cdn.tarteel.ai/quran/"));
  check(`kod: ${files.length} dosya tarandı (>= 15) ve ses sunucusunun adresi js/ altında geçiyor (tarama vakumlu değil)`, files.length >= 15 && audioFiles.length >= 1, `ses adresi bulunan dosyalar: ${audioFiles.join(", ") || "yok"}`);
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log(`All checks passed (belgeler: README.md ${nLines(readme)} satır / ${readmeH2.length} bölüm, GELISTIRICI.md ${nLines(dev)} satır / ${devH2.length} bölüm; bağlantılar, İçindekiler, ayrım, gizlilik; ${checks} kontrol).`);
}
