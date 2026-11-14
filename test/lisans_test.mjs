// Lisans ve telif belgelerinin depoyla UYUMUNU denetler.
//
// Neden: bu belgeler en kolay sessizce eskiyen belgelerdir. Depoya yeni bir veri, ses ya da
// yazı tipi dosyası eklenir ve kaynağı hiçbir yere yazılmaz; bir vendor dosyası değiştirilir ve
// bildirimi eksik kalır; belgede "284 ontoloji konusu" yazar, veri değişir, sayı kalır. Test
// sekiz şeyi sınar:
//   1. LICENSE var, tanınan bir lisans metni ve resmi metinle (GPL-3.0/Apache-2.0: SHA-256) ya da
//      MIT şablonuyla örtüşüyor; README "Lisans ve telif" bölümü AYNI lisansı söylüyor.
//   2. THIRD_PARTY_NOTICES.md: vendor/ altındaki her dosya anılıyor; HarfBuzz ("Old MIT"),
//      Brotli ve DigitalKhatt bildirimleri tam metniyle var; Apache-2.0 metni resmi metinle
//      birebir; ikili dosyalar (hb.wasm: HarfBuzz, decompress.wasm: Brotli) bildirimi gerektiren
//      kodu GERÇEKTEN içeriyor (içermiyorsa bildirim de güncellenmeli).
//   3. VERI_KAYNAKLARI.md: data/, audio/, fonts/, icons/ ve tools/raw-data/ altındaki her dosya
//      bir kayıtla (tam yol ya da `*` içeren glob) anılıyor; özet tablonun her satırında geçerli
//      bir durum sözcüğü var.
//   4. Belgedeki SAYISAL ve ALINTI iddialar depoyla tutuyor: konu sayıları (data/topics-tr.json),
//      sure bilgisi başlık dağılımı (data/surah-info-tr.json), eûzü klipleri ID3 etiketleri.
//   5. LICENSE, bildirim ve kaynak belgelerinde e-posta adresi yok (gizlilik koruması).
//   6. README ağacı yeni dosyaları listeliyor (readme_test.mjs ile birlikte).
//   7. Uygulama içi atıf: altbilgideki "Kaynaklar ve lisanslar" bağlantısı var ve VERI_KAYNAKLARI.md'ye gidiyor;
//      altbilgideki GitHub logosu (marka) bildirimde anılıyor.
//   8. Sa'dî tefsiri: kaynağı (QuranEnc.com) ve şartları belgede; dosya, belgedeki SHA-256 özetiyle aynı (değişiklik yapmama şartı).
// Başarısız olursa ileti, belgede neyin eklenmesi ya da düzeltilmesi gerektiğini söyler.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, "..");
const abs = (...p) => path.join(ROOT, ...p);
const exists = (...p) => fs.existsSync(abs(...p));
const readText = (...p) => fs.readFileSync(abs(...p), "utf8");
const readBuf = (...p) => fs.readFileSync(abs(...p));
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

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

// Resmi lisans metinlerinin SHA-256 özetleri (apache.org LICENSE-2.0.txt; gnu.org/licenses/gpl-3.0.txt).
const APACHE2_SHA256 = "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30";
const GPL3_SHA256 = "3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986";
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z][A-Za-z0-9.-]*/;

// Bir klasörün altındaki her dosya, depo köküne göre POSIX yoluyla.
function walk(dir) {
  const out = [];
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(abs(dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "node_modules") out.push(...walk(rel));
    } else if (e.isFile()) out.push(rel);
  }
  return out.sort();
}
function section(text, headingRe) {
  const m = headingRe.exec(text);
  if (!m) return "";
  const rest = text.slice(m.index + m[0].length);
  const next = /\n## /.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

// ---- 1. LICENSE ------------------------------------------------------------------------
check("LICENSE: kökte var", exists("LICENSE"));
const licenseBuf = exists("LICENSE") ? readBuf("LICENSE") : Buffer.alloc(0);
const licenseText = licenseBuf.toString("utf8");
function detectKind(t) {
  if (/GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/.test(t)) return "GPL-3.0";
  if (/Apache License\s+Version 2\.0, January 2004/.test(t)) return "Apache-2.0";
  if (/^MIT License\s*$/m.test(t)) return "MIT";
  return null;
}
const kind = detectKind(licenseText);
check("LICENSE: tanınan bir lisans metni (GPL-3.0, Apache-2.0 ya da MIT)", kind !== null, licenseText.slice(0, 80));
if (kind === "GPL-3.0") {
  check("LICENSE: GPL-3.0 metni gnu.org'daki resmi metinle birebir (SHA-256)", sha256(licenseBuf) === GPL3_SHA256, sha256(licenseBuf));
}
if (kind === "Apache-2.0") {
  check("LICENSE: Apache-2.0 metni apache.org'daki resmi metinle birebir (SHA-256)", sha256(licenseBuf) === APACHE2_SHA256, sha256(licenseBuf));
}
if (kind === "MIT") {
  check("LICENSE: MIT şablonunda 'Copyright (c) <yıl> <ad>' satırı var", /^Copyright \(c\) 20\d\d \S.*$/m.test(licenseText));
  check("LICENSE: MIT izin ve sorumsuzluk metinleri tam", /Permission is hereby granted, free of charge/.test(licenseText) && /THE SOFTWARE IS PROVIDED "AS IS"/.test(licenseText));
}
const SPDX = { "GPL-3.0": "GPL-3.0-or-later", "Apache-2.0": "Apache-2.0", MIT: "MIT" }[kind];

const readme = readText("README.md");
// README satır kaydırıyor: ifade denetimleri ("kapsamında DEĞİL") satır sonuna denk gelebilir.
const licSec = section(readme, /^## Lisans ve telif\s*$/m).replace(/\s+/g, " ");
check('README: "## Lisans ve telif" bölümü var', licSec.length > 0);
// "MIT" gibi kısa kimlikler bölümün başka yerinde de geçer (DigitalKhatt (MIT)): kimlik "Proje lisansı" paragrafında aranır.
const projPara = (/\*\*Proje lisansı\.\*\*(.*?)\*\*Kapsam dışı olanlar\.\*\*/.exec(licSec) || [, ""])[1];
check("README: lisans bölümünde 'Proje lisansı' paragrafı var", projPara.length > 0);
check(`README: 'Proje lisansı' paragrafı LICENSE'taki lisansı (\`${SPDX}\`) söylüyor`, SPDX !== undefined && projPara.includes(`\`${SPDX}\``), SPDX);
check("README: 'Proje lisansı' paragrafı telif satırını taşıyor (Telif © <yıl> <ad>) ve e-posta içermiyor", /Telif © 20\d\d \S/.test(projPara) && !EMAIL_RE.test(projPara), projPara.slice(0, 200));
check("README: lisans bölümü LICENSE, THIRD_PARTY_NOTICES.md ve VERI_KAYNAKLARI.md'ye bağlanıyor", ["LICENSE", "THIRD_PARTY_NOTICES.md", "VERI_KAYNAKLARI.md"].every((f) => licSec.includes(`\`${f}\``)));
check("README: lisans bölümü veri, ses ve yazı tipinin proje lisansı kapsamında OLMADIĞINI söylüyor", /kapsamında DEĞİL/.test(licSec));
check("README: lisans bölümü Quranic Arabic Corpus'u anıyor ve https://corpus.quran.com'a bağlanıyor (kaynak açıkça belirtilecek + bağlantı şartı)", licSec.includes("Quranic Arabic Corpus") && licSec.includes("https://corpus.quran.com"));
check("README: lisans bölümü doğrulanamayan kaynaklar için VERI_KAYNAKLARI.md'ye yönlendiriyor", /doğrulanamayan/i.test(licSec));

// ---- 2. THIRD_PARTY_NOTICES.md ----------------------------------------------------------
const notices = readText("THIRD_PARTY_NOTICES.md");
const vendorFiles = walk("vendor");
check(`vendor/: dosya bulundu (${vendorFiles.length})`, vendorFiles.length >= 7);
// Her vendor dosyası bildirimde TAM yoluyla anılıyor (LICENSE dosyaları dahil).
for (const f of vendorFiles) {
  check(`THIRD_PARTY_NOTICES.md: ${f} anılıyor`, notices.includes(f), `bildirime ${f} eklenmeli`);
}
// Bildirimi şart koşan metinler (kısa ayırt edici parçalar; tam metin gözle denetlenir, burada eksilmesin).
const notice = (name, needle) => check(`THIRD_PARTY_NOTICES.md: ${name}`, notices.includes(needle), `eksik metin: ${needle}`);
notice("DigitalKhatt telif satırı", "Copyright (c) 2020–present DigitalKhatt contributors");
notice("DigitalKhatt kaynağı (depo adresi)", "https://github.com/DigitalKhatt/digitalkhatt-js");
notice("HarfBuzz: 'Old MIT' adı", 'so-called "Old MIT" license');
notice("HarfBuzz: izin paragrafı", "Permission is hereby granted, without written agreement and without");
notice("HarfBuzz: tazminat reddi paragrafı", "IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE TO ANY PARTY FOR");
notice("HarfBuzz: garanti reddi paragrafı", "THE COPYRIGHT HOLDER SPECIFICALLY DISCLAIMS ANY WARRANTIES");
for (const holder of ["Google, Inc.", "Behdad Esfahbod", "Ebrahim Byagowi", "Red Hat, Inc.", "Mozilla Foundation", "Adobe, Inc"]) notice(`HarfBuzz telif sahibi: ${holder}`, holder);
notice("Brotli telif satırı", "Copyright (c) 2009, 2010, 2013-2016 by the Brotli Authors.");
notice("Brotli kaynağı (depo adresi)", "https://github.com/google/brotli");
notice("wawoff2 kaynağı ve lisans dosyası", "https://github.com/fontello/wawoff2");
notice("harfbuzzjs kaynağı", "https://github.com/harfbuzz/harfbuzzjs");
notice("Apache-2.0 metnine yönlendirme", "vendor/LICENSE-Apache-2.0");
notice("VERI_KAYNAKLARI.md'ye yönlendirme (veri/ses/yazı tipi lisansı farklı)", "VERI_KAYNAKLARI.md");
check("THIRD_PARTY_NOTICES.md: MIT izin cümlesi en az iki kez tam metinle geçiyor (DigitalKhatt, Brotli)", (notices.match(/Permission is hereby granted, free of charge, to any person obtaining a copy/g) || []).length >= 2);
// Eski bildirimin içeriği kaybolmasın.
notice("DigitalKhatt font notu (madina.otf)", "apps/site-angular/src/assets/fonts/hb/madina.otf");

check("vendor/LICENSE-Apache-2.0: apache.org'daki resmi metinle birebir (SHA-256)", exists("vendor", "LICENSE-Apache-2.0") && sha256(readBuf("vendor", "LICENSE-Apache-2.0")) === APACHE2_SHA256);
const vlic = exists("vendor", "LICENSE") ? readText("vendor", "LICENSE") : "";
check("vendor/LICENSE (harfbuzzjs) değişmedi: Ebrahim Byagowi telifi ve Apache notu", vlic.includes("Copyright (c) 2019 Ebrahim Byagowi") && /Apache license for Zephyr libc/.test(vlic));
const wlic = exists("vendor", "woff2-decompress", "LICENSE") ? readText("vendor", "woff2-decompress", "LICENSE") : "";
check("vendor/woff2-decompress/LICENSE değişmedi: WOFF2 Authors telifi", wlic.includes("Copyright (c) 2013-2017 by the WOFF2 Authors"));

// İkili dosyalar bildirimi gerektiren kodu gerçekten içeriyor mu? İçeriyorsa bildirim zorunlu (tek yönlü
// koruma: dosya değişip kod çıkarsa bildirimin de gözden geçirilmesi gerektiğini bu kontrol söylemez; ama
// bildirim eksik kalamaz).
const hbWasm = exists("vendor", "hb.wasm") ? readBuf("vendor", "hb.wasm").toString("latin1") : "";
check("vendor/hb.wasm HarfBuzz'i içeriyor (hb_version, hb_buffer_create) ve bildirimde HarfBuzz var", hbWasm.includes("hb_version") && hbWasm.includes("hb_buffer_create") && /HarfBuzz/.test(notices));
const dcWasm = exists("vendor", "woff2-decompress", "decompress.wasm") ? readBuf("vendor", "woff2-decompress", "decompress.wasm").toString("latin1") : "";
check("vendor/woff2-decompress/decompress.wasm Brotli sözlüğünü içeriyor ve bildirimde Brotli telifi var", dcWasm.includes("timedownlifeleftbackcodedatashowonlysitecityopenjustlike") && /by the Brotli Authors/.test(notices));

// ---- 3. VERI_KAYNAKLARI.md: kapsam ------------------------------------------------------
check("VERI_KAYNAKLARI.md: kökte var", exists("VERI_KAYNAKLARI.md"));
const sources = exists("VERI_KAYNAKLARI.md") ? readText("VERI_KAYNAKLARI.md") : "";
// Belgedeki her `...` aralığı bir kayıt: tam yol, sonu "/" olan klasör ya da `*` içeren glob.
const tokens = [...sources.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim());
function globToRe(g) {
  return new RegExp("^" + g.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");
}
const exact = new Set(tokens.filter((t) => !t.includes("*") && !t.endsWith("/")));
const dirs = tokens.filter((t) => t.endsWith("/"));
const globs = tokens.filter((t) => t.includes("*")).map(globToRe);
const covered = (f) => exact.has(f) || dirs.some((d) => f.startsWith(d)) || globs.some((re) => re.test(f));

const mustCover = [
  ...walk("data").filter((f) => !f.startsWith("data/surah-headers/")), // klasör kaydı ayrıca sınanıyor
  ...walk("audio"),
  ...walk("fonts"),
  ...walk("icons"),
  ...walk("tools/raw-data"),
];
const uncovered = mustCover.filter((f) => !covered(f));
check(`VERI_KAYNAKLARI.md: data/, audio/, fonts/, icons/ ve tools/raw-data/ altındaki her dosya kayıtlı (${mustCover.length} dosya)`, uncovered.length === 0, `VERI_KAYNAKLARI.md'ye eklenmesi gereken dosyalar: ${uncovered.join(", ")}`);
check("VERI_KAYNAKLARI.md: kontrol vakumlu değil (>= 25 dosya arandı)", mustCover.length >= 25, mustCover.length);
check("VERI_KAYNAKLARI.md: data/surah-headers/ klasörü kayıtlı", dirs.includes("data/surah-headers/"));
const surahHeaders = walk("data/surah-headers");
check(`data/surah-headers/: 114 dosya (belgedeki '114 dosya' ifadesi)`, surahHeaders.length === 114 && /114 dosya/.test(sources), surahHeaders.length);

// Özet tablo: her satırın dördüncü hücresi geçerli bir durumla başlıyor.
const STATUS = ["Doğrulandı", "Doğrulanamadı", "Kısmen doğrulandı", "Olgusal", "Bu projede üretildi"];
const tableRows = sources.split("\n").filter((l) => /^\|/.test(l) && !/^\|[-| ]+\|$/.test(l));
const header = tableRows.find((l) => /^\| Dosya \|/.test(l));
check("VERI_KAYNAKLARI.md: özet tablonun başlığı 'Dosya | İçerik | Kaynak | Durum'", header !== undefined && header.split("|").map((c) => c.trim()).slice(1, -1).join("|") === "Dosya|İçerik|Kaynak|Durum", header);
const summaryRows = [];
{
  const start = sources.split("\n").findIndex((l) => /^\| Dosya \|/.test(l));
  if (start >= 0) {
    const ls = sources.split("\n");
    for (let i = start + 2; i < ls.length && /^\|/.test(ls[i]); i++) summaryRows.push(ls[i]);
  }
}
check(`VERI_KAYNAKLARI.md: özet tabloda satırlar var (${summaryRows.length} >= 12)`, summaryRows.length >= 12);
const badRows = summaryRows.filter((l) => {
  const cells = l.split("|").map((c) => c.trim()).slice(1, -1);
  return cells.length !== 4 || !STATUS.some((s) => cells[3].startsWith(s));
});
check("VERI_KAYNAKLARI.md: özet tablonun her satırı 4 hücreli ve durumu geçerli bir sözcükle başlıyor", badRows.length === 0, badRows.join(" // "));
check("VERI_KAYNAKLARI.md: QUL'un lisans cümlesi aynen alıntılanmış", sources.includes("We don't have copyright information for this resource."));
check("VERI_KAYNAKLARI.md: 'Hak sahibiyseniz' ve 'Yeni veri eklerken' bölümleri var", /^## \d+\. Hak sahibiyseniz\s*$/m.test(sources) && /^## \d+\. Yeni veri eklerken\s*$/m.test(sources));

// ---- 4. Sayısal ve alıntı iddialar depoyla tutuyor ---------------------------------------
{
  const topics = JSON.parse(readText("data", "topics-tr.json"));
  const total = topics.length;
  const onto = topics.filter((t) => t.ontology === 1).length;
  const thematic = topics.filter((t) => t.thematic === 1).length;
  const both = topics.filter((t) => t.ontology === 1 && t.thematic === 1).length;
  const general = topics.filter((t) => t.ontology !== 1 && t.thematic !== 1).length;
  check("data/topics-tr.json: konu gruplarının toplamı tutuyor (ontoloji + tematik - ortak + genel = toplam)", onto + thematic - both + general === total, `${onto}+${thematic}-${both}+${general} != ${total}`);
  const konuBolumu = section(sources, /^## 6\. Konu Fihristi\s*$/m);
  check("VERI_KAYNAKLARI.md: '6. Konu Fihristi' bölümü var", konuBolumu.length > 0);
  check(`VERI_KAYNAKLARI.md: toplam konu sayısı (${total}) yazılı`, new RegExp(`\\(${total} konu\\)`).test(konuBolumu), `bölümde '(${total} konu)' olmalı`);
  check(`VERI_KAYNAKLARI.md: ontoloji (${onto}), tematik (${thematic}) ve genel (${general}) sayıları ve ortak ${both} konu tabloda`, new RegExp(`\\| Ontoloji \\| ${onto} \\(${both}'si aynı zamanda tematik\\) \\|`).test(konuBolumu) && new RegExp(`\\| Tematik \\| ${thematic} \\|`).test(konuBolumu) && new RegExp(`\\| Genel \\| ${general} \\|`).test(konuBolumu), `beklenen: ${onto} (${both}), ${thematic}, ${general}`);
}
{
  const info = JSON.parse(readText("data", "surah-info-tr.json"));
  const count = (h) => Object.values(info).filter((v) => v.text.includes(`<h2>${h}</h2>`)).length;
  const bolum = section(sources, /^## 7\. Sure Bilgisi\s*$/m).replace(/\s+/g, " ");
  check("VERI_KAYNAKLARI.md: '7. Sure Bilgisi' bölümü var", bolum.length > 0);
  const expect = `(İsim ${count("İsim")} surede, İniş Dönemi ${count("İniş Dönemi")}, Tema ve Konu ${count("Tema ve Konu")}, Tarihî Arka Plan ${count("Tarihî Arka Plan")})`;
  check("VERI_KAYNAKLARI.md: sure bilgisi başlık dağılımı data/surah-info-tr.json ile tutuyor", bolum.includes(expect), `beklenen ifade: ${expect}`);
  check("data/surah-info-tr.json: 114 sure", Object.keys(info).length === 114);
}
{
  // ID3 etiketleri: UTF-16 kareleri için NUL baytları atılarak aranır.
  const text = (f) => Buffer.from(readBuf(f).filter((b) => b !== 0)).toString("latin1");
  const abd = text("audio/euzuabdulsamad.mp3");
  const hus = text("audio/euzuhusari.mp3");
  const secSes = section(sources, /^## 8\. Ses\s*$/m);
  check("VERI_KAYNAKLARI.md: '8. Ses' bölümü var", secSes.length > 0);
  check('audio/euzuabdulsamad.mp3 etiketi "(C) VerseByVerseQuran.com" ve belgede aynen alıntılanmış', abd.includes("(C) VerseByVerseQuran.com") && secSes.includes('"(C) VerseByVerseQuran.com"'));
  check('audio/euzuhusari.mp3 etiketi "4Quran.Com MP3s" ve belgede aynen alıntılanmış', hus.includes("4Quran.Com MP3s") && secSes.includes('"4Quran.Com MP3s"'));
  for (const f of walk("audio").filter((x) => /\.mp3$/i.test(x))) {
    const t = text(f);
    if (/VerseByVerseQuran/.test(t)) check(`${f}: etiketindeki VerseByVerseQuran.com belgede anılıyor`, secSes.includes("VerseByVerseQuran.com"));
  }
  check("audio/: yalnızca iki eûzü klibi (yeni ses dosyası eklenirse VERI_KAYNAKLARI.md '8. Ses' bölümü gözden geçirilmeli)", walk("audio").length === 2, walk("audio").join(", "));
}

// ---- 5. E-posta adresi yok ----------------------------------------------------------------
for (const f of ["LICENSE", "THIRD_PARTY_NOTICES.md", "VERI_KAYNAKLARI.md", "README.md"]) {
  const t = exists(f) ? readText(f) : "";
  const m = EMAIL_RE.exec(t);
  check(`${f}: e-posta adresi içermiyor (telif sahibi adı yazılır, e-posta yazılmaz)`, !m, m && m[0].replace(/^(.).*(@.*)$/, "$1***$2"));
}

// ---- 6. README ağacı ------------------------------------------------------------------------
{
  const lines = readme.split("\n");
  const start = lines.findIndex((l) => /^## Proje yapısı\s*$/.test(l));
  const open = lines.findIndex((l, i) => i > start && l.startsWith("```"));
  const close = lines.findIndex((l, i) => i > open && l.startsWith("```"));
  const tree = start >= 0 && open >= 0 && close > open ? lines.slice(open + 1, close).join("\n") : "";
  // Satır başında (kendi girdisi olarak) listelenmeli; başka bir satırın açıklamasında anılması yetmez.
  for (const f of ["LICENSE", "VERI_KAYNAKLARI.md", "THIRD_PARTY_NOTICES.md", "test/lisans_test.mjs"]) {
    check(`README ağacı: ${f} kendi satırıyla listeli`, new RegExp(`^${f.replace(/[.]/g, "\\.")}\\s{2,}\\S`, "m").test(tree), `README "Proje yapısı"na ${f} satırı eklenmeli`);
  }
  // vendor/'ın açıklaması içinde (devam satırı) anılıyor.
  check("README ağacı: vendor/LICENSE-Apache-2.0 vendor/ girdisinin açıklamasında anılıyor", /^vendor\/\s[^\n]*\n(\s[^\n]*\n)*\s+[^\n]*LICENSE-Apache-2\.0/m.test(tree), 'README "Proje yapısı"nda vendor/ girdisine LICENSE-Apache-2.0 eklenmeli');
}

// ---- 7. Uygulama içi atıf bağlantısı ve altbilgideki GitHub logosu -------------------------------------
// Quranic Arabic Corpus: "kaynak açıkça belirtilecek ve https://corpus.quran.com'a bağlantı verilecek". Uygulamada
// bu atıf Ezber penceresinin altbilgisindeki "Kaynaklar ve lisanslar" bağlantısıyla (VERI_KAYNAKLARI.md) yapılıyor.
{
  const html = readText("index.html");
  const footer = (/<div class="ezber-modal-footer">([\s\S]*?)\n  <\/div>/.exec(html) || [, ""])[1];
  check("index.html: Ezber altbilgisi (.ezber-modal-footer) var", footer.length > 0);
  const links = [...footer.matchAll(/<a\s([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1], inner: m[2], index: m.index }));
  const attr = (l, n) => (new RegExp(`\\b${n}="([^"]*)"`).exec(l.attrs) || [, null])[1];
  const repoLink = links.find((l) => /^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(attr(l, "href") || ""));
  const srcLink = links.find((l) => attr(l, "id") === "ezber-sources-link");
  check('index.html: altbilgide depo bağlantısı ("Kaynak Kod — GitHub") var', !!repoLink && /Kaynak Kod/.test(repoLink.inner));
  check('index.html: altbilgide "Kaynaklar ve lisanslar" bağlantısı var (uygulama içi atıf)', !!srcLink && /<span>Kaynaklar ve lisanslar<\/span>/.test(srcLink.inner));
  if (repoLink && srcLink) {
    const href = attr(srcLink, "href");
    const prefix = `${attr(repoLink, "href")}/blob/main/`;
    const rel = href.startsWith(prefix) ? href.slice(prefix.length) : "";
    check("altbilgi bağlantısı, depo adresinin /blob/main/ altındaki bir dosyaya gidiyor (GitHub Pages .md'yi ham sunar; GitHub görünümü okunur)", href.startsWith(prefix), href);
    check(`altbilgi bağlantısının hedefi depoda var (${rel})`, rel !== "" && exists(rel));
    check("altbilgi bağlantısının hedefi VERI_KAYNAKLARI.md", rel === "VERI_KAYNAKLARI.md", rel);
    const relAttr = attr(srcLink, "rel") || "";
    check('altbilgi bağlantısı yeni sekmede açılıyor ve rel="noopener noreferrer" taşıyor (Kaynak Kod bağlantısıyla aynı)', attr(srcLink, "target") === "_blank" && /\bnoopener\b/.test(relAttr) && /\bnoreferrer\b/.test(relAttr), srcLink.attrs);
    check("altbilgi bağlantısının simgesi ekran okuyucudan gizli (ad yalnızca metinden geliyor)", /<svg[^>]*aria-hidden="true"/.test(srcLink.inner));
    check("Tab sırası: önce depo bağlantısı, sonra Kaynaklar ve lisanslar", repoLink.index < srcLink.index);
  }
  const rule = (/\.ezber-modal-footer\s*\{([^}]*)\}/.exec(readText("css", "style.css")) || [, ""])[1];
  check("css: .ezber-modal-footer iki bağlantıyı yan yana diziyor, dar ekranda alta kaydırıyor (flex + wrap)", /display:\s*flex/.test(rule) && /flex-wrap:\s*wrap/.test(rule), rule);
  check('README: lisans bölümü uygulamadaki "Kaynaklar ve lisanslar" bağlantısını anıyor', licSec.includes('"Kaynaklar ve lisanslar"'));
  const atifSec = section(sources, /^## 10\. Atıf yükümlülükleri\s*$/m);
  check("VERI_KAYNAKLARI.md: '10. Atıf yükümlülükleri' bölümü var", atifSec.length > 0);
  check('VERI_KAYNAKLARI.md: bölüm 10 uygulamadaki "Kaynaklar ve lisanslar" bağlantısını anıyor', atifSec.includes('"Kaynaklar ve lisanslar"'));
  // Altbilgideki GitHub logosu bir marka: kullanılıyorsa bildirimde anılmalı.
  if (/M8 0C3\.58 0 0 3\.58 0 8c0 3\.54 2\.29/.test(html)) {
    check("THIRD_PARTY_NOTICES.md: index.html'deki GitHub logosu (Invertocat) ve GitHub marka kuralları adresi bildirimde var", notices.includes("Invertocat") && notices.includes("https://brand.github.com/foundations/logo"));
  }
}

// ---- 8. Sa'dî tefsiri: QuranEnc.com şartları ----------------------------------------------------------
// QuranEnc, çevirilerin yeniden yayımına şu şartları koyuyor: içerik DEĞİŞTİRİLMEYECEK, yayıncıya ve kaynağa açıkça atıf
// yapılacak, sürüm numarası belirtilecek. Dosya değişirse belgedeki özet (ve sürüm) bilerek güncellenmeli.
{
  const sec5 = section(sources, /^## 5\. Sa'dî tefsiri\s*$/m);
  check("VERI_KAYNAKLARI.md: '5. Sa'dî tefsiri' bölümü var", sec5.length > 0);
  check("VERI_KAYNAKLARI.md: bölüm 5 tefsirin kaynağını (QuranEnc.com) ve şartlarının okunduğu sayfayı anıyor", sec5.includes("QuranEnc.com") && sec5.includes("https://quranenc.com/tr/home/about"));
  const hashDoc = /SHA-256 `([0-9a-f]{64})`/.exec(sec5);
  check("VERI_KAYNAKLARI.md: bölüm 5 data/tafsir-saadi.json için SHA-256 özeti taşıyor", !!hashDoc);
  const hashFile = sha256(readBuf("data", "tafsir-saadi.json"));
  check("data/tafsir-saadi.json belgedeki SHA-256 özetiyle aynı (QuranEnc 'değişiklik yapmama' şartı; dosya bilerek güncellendiyse VERI_KAYNAKLARI.md bölüm 5'teki özeti ve sürümü de güncelleyin)", !!hashDoc && hashFile === hashDoc[1], `dosyada ${hashFile}`);
  check("VERI_KAYNAKLARI.md: bölüm 10 QuranEnc.com atıf yükümlülüğünü anıyor", section(sources, /^## 10\. Atıf yükümlülükleri\s*$/m).includes("QuranEnc.com"));
  check("README: lisans bölümü Sa'dî tefsirinin kaynağı QuranEnc.com'u anıyor ve https://quranenc.com/tr/home'a bağlanıyor", licSec.includes("QuranEnc.com") && licSec.includes("https://quranenc.com/tr/home"));
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log(`All checks passed (lisans: ${SPDX}; ${vendorFiles.length} vendor dosyası bildirimli, ${mustCover.length} veri/ses/yazı tipi dosyası VERI_KAYNAKLARI.md'de kayıtlı, özet tabloda ${summaryRows.length} satır; ${checks} kontrol).`);
}
