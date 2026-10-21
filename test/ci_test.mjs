// CI ve bağımlılık dosyalarının YAPISAL kontrolleri.
//
// GitHub Actions bu geliştirme ortamında ÇALIŞTIRILAMADI (yalnız actionlint ile
// sözdizimi/ifade denetimi yapıldı). Bu yüzden iş akışının ve bağımlılık
// dosyalarının bozulmasının en olası yolları burada kod olarak korunur:
//   - kilit dosyası package.json ile uyumsuzsa `npm ci` hata verir;
//   - kilit dosyasındaki bir adres bir aynaya/yerel önbelleğe işaret ederse başka
//     makinede ve CI'da indirme başarısız olur;
//   - bir test package.json'da olmayan bir pakete bağlanırsa yalnızca o paketin
//     tesadüfen kurulu olduğu makinede geçer;
//   - .gitignore kilit dosyasını yutarsa CI her seferinde farklı sürümleri kurar
//     (ör. axe-core'un yeni bir sürümü kuralları değiştirip testleri kırar);
//   - iş akışında zaman aşımı yoksa takılan iş saatlerce sürer.
// Bunlar gerçek bir Actions koşusunun YERİNE DEĞİL, onun en sık kırılan noktalarının bekçisidir.

import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");
const readJson = (...p) => JSON.parse(readText(...p));

let failures = 0;
function check(name, cond, detail) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
    if (detail !== undefined) console.error(`      ${String(detail).slice(0, 500)}`);
  }
}

// ---- package.json ---------------------------------------------------------------
const pkg = readJson("test", "package.json");
const scripts = pkg.scripts || {};
check("package.json: özel (private) paket ve ES modülü", pkg.private === true && pkg.type === "module");
check("package.json: `npm test` koşucuyu çalıştırıyor (node run_all.mjs)", scripts.test === "node run_all.mjs", scripts.test);
check("package.json: koşucu dosyası mevcut", fs.existsSync(path.join(TEST_DIR, "run_all.mjs")));
for (const [name, cmd] of Object.entries(scripts)) {
  for (const m of cmd.matchAll(/\b([\w.-]+\.mjs)\b/g)) {
    check(`package.json betiği "${name}": ${m[1]} mevcut`, fs.existsSync(path.join(TEST_DIR, m[1])));
  }
  const names = /--(?:skip|only)[ =]([\w,]+)/.exec(cmd);
  if (names) {
    for (const n of names[1].split(",")) check(`package.json betiği "${name}": "${n}" adlı test mevcut`, fs.existsSync(path.join(TEST_DIR, `${n}_test.mjs`)));
  }
}

// ---- package-lock.json ------------------------------------------------------------
const lockPath = path.join(TEST_DIR, "package-lock.json");
check("test/package-lock.json depoda (CI'ın aynı sürümleri kurması için şart)", fs.existsSync(lockPath));
const lock = fs.existsSync(lockPath) ? readJson("test", "package-lock.json") : { packages: { "": {} } };
const rootEntry = lock.packages[""] || {};
const sameDeps = (a = {}, b = {}) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
check("kilit dosyası: lockfileVersion >= 2 (modern npm biçimi)", lock.lockfileVersion >= 2, lock.lockfileVersion);
check("kilit dosyası: paket adı package.json ile aynı", lock.name === pkg.name, lock.name);
check("kilit dosyası: dependencies package.json ile aynı (aksi hâlde `npm ci` hata verir)", sameDeps(rootEntry.dependencies, pkg.dependencies), JSON.stringify([rootEntry.dependencies, pkg.dependencies]));
check("kilit dosyası: devDependencies package.json ile aynı (aksi hâlde `npm ci` hata verir)", sameDeps(rootEntry.devDependencies, pkg.devDependencies), JSON.stringify([rootEntry.devDependencies, pkg.devDependencies]));

const locked = Object.entries(lock.packages).filter(([k, v]) => k !== "" && !v.inBundle && !v.link);
check(`kilit dosyası dolu (${locked.length} paket > 10)`, locked.length > 10);
const offRegistry = locked.filter(([, v]) => !(typeof v.resolved === "string" && v.resolved.startsWith("https://registry.npmjs.org/")));
check("kilit dosyası: her paketin adresi https://registry.npmjs.org/ (ayna ya da yerel adres sızmamış)", offRegistry.length === 0, offRegistry.slice(0, 3).map(([k, v]) => `${k} -> ${v.resolved}`).join("; "));
const noIntegrity = locked.filter(([, v]) => !/^sha512-/.test(v.integrity || ""));
check("kilit dosyası: her paketin sha512 bütünlük özeti var", noIntegrity.length === 0, noIntegrity.slice(0, 3).map(([k]) => k).join(", "));

// Doğrudan bağımlılıkların kilitlenen sürümü, package.json'daki ^aralığı karşılıyor mu?
function satisfiesCaret(range, version) {
  const m = /^\^(\d+)\.(\d+)\.(\d+)$/.exec(range);
  if (!m) return null; // başka aralık biçimi: bu basit kontrol uygulanmaz
  const lo = m.slice(1).map(Number);
  const v = version.split("-")[0].split(".").map(Number);
  if (v.length !== 3 || v.some(Number.isNaN) || v[0] !== lo[0]) return false;
  for (let i = 1; i < 3; i++) {
    if (v[i] > lo[i]) return true;
    if (v[i] < lo[i]) return false;
  }
  return true;
}
for (const [name, range] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
  const entry = lock.packages[`node_modules/${name}`];
  check(`kilit dosyasında ${name} var`, !!entry);
  if (entry) check(`kilitlenen ${name}@${entry.version}, package.json aralığını (${range}) karşılıyor`, satisfiesCaret(range, entry.version) !== false);
}

// ---- .gitignore --------------------------------------------------------------------
const ignored = readText(".gitignore")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));
check(".gitignore: node_modules/ yok sayılıyor", ignored.includes("node_modules/") || ignored.includes("node_modules"), ignored.join(" | "));
check(".gitignore: package-lock.json yok SAYILMIYOR (kilit dosyası depoda olmalı)", !ignored.some((l) => /package-lock/.test(l)), ignored.join(" | "));

// ---- iş akışı ----------------------------------------------------------------------
const wfPath = path.join(ROOT, ".github", "workflows", "test.yml");
check("iş akışı dosyası var (.github/workflows/test.yml)", fs.existsSync(wfPath));
const wf = fs.existsSync(wfPath) ? fs.readFileSync(wfPath, "utf8") : "";
const wfLines = wf.split(/\r?\n/);
check("iş akışı: push ve pull_request tetikleyicileri var", /^on:\s*$/m.test(wf) && /^ {2}push:/m.test(wf) && /^ {2}pull_request:/m.test(wf));
check("iş akışı: en düşük yetki (permissions: contents: read)", /^permissions:\s*\n {2}contents:\s*read\s*$/m.test(wf));
check("iş akışı: iş için zaman aşımı var (timeout-minutes)", /^ +timeout-minutes:\s*\d+\s*$/m.test(wf));
check("iş akışı: komutlar test/ dizininde çalışıyor (defaults.run.working-directory: test)", /^ {2}defaults:\s*\n\s+run:\s*\n\s+working-directory:\s*test\s*$/m.test(wf) || /^ {4}defaults:\s*\n\s+run:\s*\n\s+working-directory:\s*test\s*$/m.test(wf));
const ciIdx = wfLines.findIndex((l) => /^\s+run:\s*npm ci\s*$/.test(l));
const testIdx = wfLines.findIndex((l) => /^\s+run:\s*npm test\s*$/.test(l));
check("iş akışı: önce `npm ci` (kilit dosyasına sadık kurulum), sonra `npm test`", ciIdx >= 0 && testIdx > ciIdx, `npm ci satırı=${ciIdx + 1}, npm test satırı=${testIdx + 1}`);
check("iş akışı: setup-node npm önbelleği test/package-lock.json'a bağlı", /^\s+cache:\s*npm\s*$/m.test(wf) && /^\s+cache-dependency-path:\s*test\/package-lock\.json\s*$/m.test(wf));
const usesLines = wfLines.filter((l) => /^\s*-?\s*uses:/.test(l));
check("iş akışı: en az checkout ve setup-node kullanılıyor", usesLines.some((l) => /actions\/checkout@/.test(l)) && usesLines.some((l) => /actions\/setup-node@/.test(l)), usesLines.join(" | "));
const unpinned = usesLines.filter((l) => !/uses:\s*[\w.-]+\/[\w.-]+@(v\d+(\.\d+){0,2}|[0-9a-f]{40})\s*$/.test(l));
check("iş akışı: her `uses:` bir sürüm etiketine (v7) ya da commit özetine sabit; @main/@master yok", unpinned.length === 0, unpinned.join(" | "));

// Node sürümü, kilitlenen paketlerin istediği en düşük (>=N) sürümden küçük olmamalı.
const wfNode = /^\s+node-version:\s*(\d+)\s*$/m.exec(wf);
const minNodes = locked.map(([, v]) => /^>=\s*(\d+)/.exec((v.engines && v.engines.node) || "")).filter(Boolean).map((m) => Number(m[1]));
const needNode = minNodes.length ? Math.max(...minNodes) : 0;
check(`iş akışı: node-version belirtilmiş ve kilitli paketlerin en düşük gereksinimini (Node ${needNode}) karşılıyor`, !!wfNode && Number(wfNode[1]) >= needNode, wfNode ? `node-version=${wfNode[1]}` : "node-version yok");

// ---- testlerin bağımlılıkları ----------------------------------------------------------
// Her test dosyasındaki "çıplak" (paket) içe aktarmalar package.json'da bildirilmiş ya da Node yerleşiği olmalı.
const builtins = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
const declared = new Set([...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})]);
const pkgNameOf = (spec) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
// Satır başındaki import/export ... from "x" ile import "x"; ayrıca import("x") ve require("x").
// (Testler başka dosyaların kaynağını düzenli ifadelerle de tarar -- `from "\.\/arama\.js"` gibi
// kaçışlı metinler gerçek içe aktarma sayılmasın diye satır başı + ters eğik çizgisiz belirteç şartı.)
const IMPORT_RE = new RegExp(
  [
    String.raw`^[ \t]*(?:import|export)\b[^;'"]*?\bfrom\s*["']([^"'\\\n]+)["']`,
    String.raw`^[ \t]*import\s*["']([^"'\\\n]+)["']`,
    String.raw`\bimport\s*\(\s*["']([^"'\\\n]+)["']\s*\)`,
    String.raw`\brequire\s*\(\s*["']([^"'\\\n]+)["']\s*\)`,
  ].join("|"),
  "gm"
);
const sources = fs.readdirSync(TEST_DIR).filter((f) => /\.m?js$/.test(f));
check(`test dizininde ${sources.length} betik bulundu (>= 10)`, sources.length >= 10);
const seenPackages = new Set();
for (const f of sources) {
  // Yorumlar taranmaz (açıklama metinlerindeki örnek import/require ifadeleri sayılmasın).
  const src = fs.readFileSync(path.join(TEST_DIR, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const specs = new Set([...src.matchAll(IMPORT_RE)].map((m) => m[1] || m[2] || m[3] || m[4]));
  const bare = [...specs].filter((s) => !s.startsWith(".") && !s.startsWith("/") && !builtins.has(s));
  for (const s of bare) seenPackages.add(pkgNameOf(s));
  const missing = bare.filter((s) => !declared.has(pkgNameOf(s)));
  check(`${f}: çıplak içe aktarmaların hepsi package.json'da (ya da Node yerleşiği)`, missing.length === 0, missing.join(", "));
}
// Tarayıcı boşa çalışıp her şeyi "geçti" saymasın: bilinen iki biçimi de (import ... from, require()) görmeli.
check("tarayıcı gerçekten çalışıyor: `import ... from` (jsdom) ve `require()` (wawoff2) biçimleri bulundu", seenPackages.has("jsdom") && seenPackages.has("wawoff2"), [...seenPackages].join(", "));

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("All checks passed (CI yapısı: package.json betikleri, kilit dosyası uyumu + yalnız registry.npmjs.org adresleri + bütünlük özetleri, .gitignore, iş akışı izinleri/zaman aşımı/npm ci sırası/önbellek/sabit sürümler/Node sürümü, testlerin bağımlılıkları).");
}
