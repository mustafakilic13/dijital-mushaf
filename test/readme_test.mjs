// Belgelerin depoyla UYUMUNU denetler: GELISTIRICI.md'deki "Proje yapısı" ağacı ve (README.md ile
// GELISTIRICI.md'deki) komut örnekleri. README.md kullanıcı belgesidir; ağaç geliştirici belgesindedir.
//
// Neden: belge sessizce eskir. Bu belgede (README.md bölünmeden önce, tek belgeyken) gerçekten oldu -- depoda hiç olmayan bir
// `serve.py` anlatılıyordu ("python3 serve.py 8000" çalışmıyordu), ağaçta data/hizb.json,
// data/recitation-*.json ve iki build betiği yoktu. Test üç şeyi sınar:
//   1. Ağaçta listelenen her yol depoda var (silinen/adı değişen dosya belgede kalmasın);
//   2. js/, css/, tools/, test/, data/ ve .github/workflows/ altındaki her dosya ağaçta
//      listeli (yeni dosya belgesiz kalmasın) + kök dosyalar ve üst düzey klasörler;
//   3. Kod bloklarındaki `python3 x.py` / `node x.mjs` komutları var olan betikleri
//      çağırıyor, `npm run <ad>` komutları test/package.json'da tanımlı.
// Başarısız olursa ileti, GELISTIRICI.md'ye ne eklenmesi/çıkarılması gerektiğini söyler.

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

// README.md kullanıcı belgesi, GELISTIRICI.md geliştirici belgesi: "Proje yapısı" ağacı yalnız ikincisinde.
function readDoc(name) {
  const file = path.join(ROOT, name);
  const ok = fs.existsSync(file);
  check(`${name}: kökte var`, ok);
  return ok ? fs.readFileSync(file, "utf8") : "";
}
const readmeText = readDoc("README.md");
const devText = readDoc("GELISTIRICI.md");
const lines = devText.split("\n");

// ---- "Proje yapısı" ağacı ----------------------------------------------------------
// Bölümün ilk ``` bloğu: satır başında yol alanı, ardından >= 2 boşlukla açıklama. Girintili
// satırlar önceki girdinin açıklamasının devamı. Virgülle ayrılmış alan ("data/hizb.json,
// rub.json") ilk yolun klasörünü devralır.
const startIdx = lines.findIndex((l) => /^## Proje yapısı\s*$/.test(l));
check('GELISTIRICI.md: "## Proje yapısı" bölümü var', startIdx >= 0);
let blockLines = [];
if (startIdx >= 0) {
  const open = lines.findIndex((l, i) => i > startIdx && l.startsWith("```"));
  const close = open >= 0 ? lines.findIndex((l, i) => i > open && l.startsWith("```")) : -1;
  check("GELISTIRICI.md: Proje yapısı bölümünde kapalı bir kod bloğu var", open >= 0 && close > open);
  if (open >= 0 && close > open) blockLines = lines.slice(open + 1, close);
}

const listed = new Set(); // "js/app.js", "data/surah-headers/" ...
for (const line of blockLines) {
  if (!line.trim() || /^\s/.test(line)) continue; // boş satır ya da açıklama devamı
  let dir = "";
  for (const raw of line.split(/\s{2,}/)[0].split(",")) {
    const tok = raw.trim();
    if (!tok) continue;
    const full = tok.includes("/") ? tok : path.posix.join(dir, tok);
    listed.add(full);
    dir = full.endsWith("/") ? full : path.posix.dirname(full);
    if (dir === ".") dir = "";
  }
}
// Boş/bozuk bir ağaçta "her şey tamam" demesin.
check(`GELISTIRICI.md: ağaçta yeterince girdi ayrıştırıldı (${listed.size} >= 40)`, listed.size >= 40, [...listed].join(", "));

// 1. Listelenen her yol var (sonu "/" olanlar klasör).
const dead = [];
for (const p of listed) {
  const abs = path.join(ROOT, p);
  const ok = p.endsWith("/") ? fs.existsSync(abs) && fs.statSync(abs).isDirectory() : fs.existsSync(abs) && fs.statSync(abs).isFile();
  if (!ok) dead.push(p);
}
check("GELISTIRICI.md ağacı: listelenen her yol depoda var", dead.length === 0, `depoda olmayan, GELISTIRICI.md'den çıkarılması (ya da düzeltilmesi) gereken yollar: ${dead.join(", ")}`);

// 2. Depodaki her dosya listeli.
function filesIn(dir, re) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isFile() && re.test(e.name))
    .map((e) => `${dir}/${e.name}`)
    .sort();
}
const mustList = [
  ...filesIn("js", /\.js$/),
  ...filesIn("css", /\.css$/),
  ...filesIn("tools", /\.py$/),
  ...filesIn("test", /\.mjs$/),
  ...filesIn("test", /^package(-lock)?\.json$/),
  ...filesIn("data", /\.json$/),
  ...filesIn(".github/workflows", /\.ya?ml$/),
  "index.html",
  "sw.js",
  "manifest.json",
  "THIRD_PARTY_NOTICES.md",
  "LICENSE",
  "VERI_KAYNAKLARI.md",
  "README.md",
  "GELISTIRICI.md",
  "TEST_FOYU.md",
].filter((p) => fs.existsSync(path.join(ROOT, p)));
const unlisted = mustList.filter((p) => !listed.has(p));
check("GELISTIRICI.md ağacı: depodaki her kaynak/veri/test dosyası listeli", unlisted.length === 0, `GELISTIRICI.md "Proje yapısı"na eklenmesi gereken dosyalar: ${unlisted.join(", ")}`);
check(`GELISTIRICI.md ağacı: kontrol vakumlu değil (${mustList.length} dosya arandı)`, mustList.length >= 40);

// Üst düzey klasörler (gizliler ve node_modules hariç; .github ayrıca) listeli.
const topDirs = fs
  .readdirSync(ROOT, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== "node_modules" && (!e.name.startsWith(".") || e.name === ".github"))
  .map((e) => e.name);
const unlistedDirs = topDirs.filter((d) => ![...listed].some((p) => p === `${d}/` || p.startsWith(`${d}/`)));
check("GELISTIRICI.md ağacı: her üst düzey klasör listeli", unlistedDirs.length === 0, `GELISTIRICI.md "Proje yapısı"nda hiç geçmeyen klasörler: ${unlistedDirs.join(", ")}`);

// ---- Komut örnekleri ------------------------------------------------------------------
// Yalnız ``` kod blokları taranır (açıklama metnindeki ters tırnaklı anmalar değil).
const codeLines = [];
for (const doc of [devText, readmeText]) {
  let inFence = false;
  for (const l of doc.split("\n")) {
    if (l.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) codeLines.push(l);
  }
}
const scriptRefs = []; // { cmd, script }
const SCRIPT_RE = /\b(?:python3?|node)\s+(?:-[-\w]+\s+)*([^\s&|;<>"'`]+\.(?:py|mjs|js))\b/g;
for (const l of codeLines) {
  for (const m of l.matchAll(SCRIPT_RE)) scriptRefs.push({ cmd: l.trim(), script: m[1] });
}
check(`GELISTIRICI.md komutları: betik çağıran en az bir örnek bulundu (${scriptRefs.length})`, scriptRefs.length >= 3);
// Betik kökten, test/ ya da tools/ klasöründen (örnekler "cd test" ile de verilir) çözülür.
const missingScripts = scriptRefs.filter(({ script }) => ![ROOT, TEST_DIR, path.join(ROOT, "tools")].some((base) => fs.existsSync(path.join(base, script))));
check("GELISTIRICI.md komutları: `python3`/`node` ile çağrılan her betik depoda var", missingScripts.length === 0, missingScripts.map((r) => `${r.script}  (komut: ${r.cmd})`).join(" | "));

const pkg = JSON.parse(fs.readFileSync(path.join(TEST_DIR, "package.json"), "utf8"));
const npmScripts = new Set(Object.keys(pkg.scripts || {}));
const npmRuns = [...devText.matchAll(/\bnpm run ([\w:-]+)/g), ...readmeText.matchAll(/\bnpm run ([\w:-]+)/g)].map((m) => m[1]);
check(`GELISTIRICI.md: \`npm run\` örnekleri bulundu (${npmRuns.length})`, npmRuns.length >= 1);
const undefinedRuns = [...new Set(npmRuns)].filter((n) => !npmScripts.has(n));
check("GELISTIRICI.md: `npm run <ad>` komutlarının hepsi test/package.json betiği", undefinedRuns.length === 0, `tanımsız: ${undefinedRuns.join(", ")}`);

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log(`All checks passed (GELISTIRICI.md: Proje yapısı ağacı ${listed.size} girdi -- hepsi depoda var, depodaki ${mustList.length} dosya ve ${topDirs.length} üst düzey klasör listeli; ${scriptRefs.length} betik komutu ve ${npmRuns.length} npm run örneği geçerli; ${checks} kontrol).`);
}
