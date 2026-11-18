// Uygulama kaynağının test görünümü.
//
// js/app.js bölününce (js/ altında odaklı modüller) testlerin "uygulama kaynağında şu işlev şöyle yazılmış" ve "şu işaretli blok
// Node'da çalışıyor" denetimleri tek dosyaya bakamaz oldu. Bu yardımcı, eski app.js'i oluşturan modülleri (APP_MODULES) eski
// dosyadaki sıraya yakın bir sırayla birleştirip `appSource` olarak veriyor: import / export satırları atılır, bildirimlerin
// kendisi (işlev, const, yorum, <ezber-picker> gibi işaretler) olduğu gibi kalır -- testler işlevleri bu metinden çıkarıp
// `new Function` ile çalıştırıyor. Hangi modülün kaynağı gerekiyorsa `moduleSource(ad)` ile tek modül de okunabilir.
//
// Tek modül ya da yeni dosya ekleyince: APP_MODULES'a (eski app.js'in parçasıysa) ya da LIBRARY_MODULES'a (kendi başına duran
// kütüphane modülüyse) yazın; test/modul_siniri_test.mjs js/ altındaki her dosyanın bu iki listeden birinde olmasını ister.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// Eski js/app.js'in içeriği (escapeHtml dahil), bölündüğü modüller; sıra eski dosyadaki sıraya yakındır.
export const APP_MODULES = [
  "html.js",
  "state.js",
  "page-layout.js",
  "data-load.js",
  "lookup.js",
  "modal-lists.js",
  "modals.js",
  "ezber-modal.js",
  "announce.js",
  "ayah-nav.js",
  "page.js",
  "ayah-panel.js",
  "surahinfo-modal.js",
  "topics-modal.js",
  "wake-lock.js",
  "page-nav.js",
  "playback.js",
  "ezber-play.js",
  "ezber-study.js",
  "app.js",
];

// Kendi başına duran kütüphane modülleri (uygulama modüllerinden bağımsız sınanıyor).
export const LIBRARY_MODULES = [
  "arama.js",
  "ayet-gezgini.js",
  "izgara-gezintisi.js",
  "justify.js",
  "liste-gezintisi.js",
  "meal.js",
  "modal-odak.js",
  "render.js",
  "search.js",
  "sekme-gezintisi.js",
  "surahinfo.js",
  "tafsir.js",
  "topics.js",
  "wordmeal.js",
];

// `import { ... } from "./x.js";` (çok satırlı olabilir) ve sondaki `export { ... };` satırlarını atar; `export function` /
// `export const` gibi satır başı ihraçları (yalnızca js/html.js) başlarındaki `export `i atılarak bildirim hâline getirilir.
export function stripModuleSyntax(text) {
  return text
    .replace(/^import\s*\{[^}]*\}\s*from\s*"[^"]+";\n/gm, "")
    .replace(/^export\s*\{[^}]*\};\n?/gm, "")
    .replace(/^export (async function|function|const|let|class)\b/gm, "$1");
}

export const moduleSource = (name) => fs.readFileSync(path.join(ROOT, "js", name), "utf-8");

// Listedeki bir dosya yoksa (silindi / yeniden adlandı) birleşik kaynak onu boş sayar: yoksa bu yardımcı İÇE AKTARILIRKEN ENOENT ile
// çöker ve hangi dosyanın eksik olduğu bir yığın izinde kaybolur; eksik dosyayı test/modul_siniri_test.mjs açık bir iletiyle bildirir.
const readOrEmpty = (name) => (fs.existsSync(path.join(ROOT, "js", name)) ? moduleSource(name) : "");

// Eski app.js'in yerini tutan birleşik kaynak (import / export satırsız).
export const appSource = APP_MODULES.map((name) => stripModuleSyntax(readOrEmpty(name))).join("\n");

// Aynı birleşik kaynak, import / export satırları DURARAK ("X yalnızca şu kadar yerde geçiyor" sayımları için).
export const appSourceRaw = APP_MODULES.map((name) => readOrEmpty(name)).join("\n");

// Bir modülün `import { ... } from "<belirteç>";` satırlarından aldığı adlar ("a as b" için a). Tek modül.
export function importedNames(name, specifier) {
  const names = new Set();
  const re = /^import\s*\{([^}]*)\}\s*from\s*"([^"]+)";/gm;
  for (const m of moduleSource(name).matchAll(re)) {
    if (m[2] !== specifier) continue;
    for (const part of m[1].split(",")) {
      const n = part.trim().split(/\s+as\s+/)[0];
      if (n) names.add(n);
    }
  }
  return names;
}

// Uygulama modüllerinin (APP_MODULES) hepsinin bir belirteçten (örn. "./topics.js") aldığı adlar, sıralı dizi.
export function appImportedNames(specifier) {
  const all = new Set();
  for (const name of APP_MODULES) for (const n of importedNames(name, specifier)) all.add(n);
  return [...all].sort();
}
