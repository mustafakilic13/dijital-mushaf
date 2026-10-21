// run_all.mjs koşucusunun testi. Sahte test dizinleriyle (geçen / başarısız / çöken /
// takılan / "FAIL yazıp 0 ile çıkan" testler) şunları doğrular: çıkış kodları, --only /
// --skip / --list / -v, hatalı kullanımın (2) sessizce yeşile dönmemesi, zaman aşımı ve
// süreç öldürme (SIGTERM'i yok sayan test dahil), Ctrl+C, uzun çıktının kırpılması ve
// GitHub Actions çıktısı (::error kaçışları, ::group::, GITHUB_STEP_SUMMARY).
// Koşucu GERÇEK test dizinine karşı burada ÇALIŞTIRILMAZ (sonsuz özyineleme olurdu);
// gerçek dizin için yalnızca `--list` ile keşif doğrulanır.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNNER = path.join(HERE, "run_all.mjs");
const SUFFIX = "_test.mjs";

let failures = 0;
function check(name, cond, detail) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
    if (detail !== undefined) console.error(`      ${String(detail).slice(0, 700).replace(/\n/g, "\n      ")}`);
  }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "run-all-test-"));
process.on("exit", () => fs.rmSync(root, { recursive: true, force: true }));

function makeDir(name, files) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, src] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), src);
  return dir;
}

// Bu test Actions'ta koşarken de iç koşucular Actions modunda OLMAMALI.
function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("GITHUB_") || k === "CI") delete env[k];
  return env;
}

function run(args, { dir, env = {}, timeoutMs = 90000 } = {}) {
  const argv = [RUNNER, ...(dir ? ["--dir", dir] : []), ...args];
  const r = spawnSync(process.execPath, argv, { encoding: "utf8", env: { ...cleanEnv(), ...env }, timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer: 64 * 1024 * 1024 });
  const stdout = r.stdout || "";
  const stderr = r.stderr || "";
  return { status: r.status, signal: r.signal, stdout, stderr, out: stdout + stderr };
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};
const readPid = (file) => (fs.existsSync(file) ? Number(fs.readFileSync(file, "utf8")) : NaN);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- sahte testler ------------------------------------------------------------------
const WRITE_PID = (name) => `import fs from "node:fs";\nfs.writeFileSync(new URL("./${name}.pid", import.meta.url), String(process.pid));\n`;
const SRC = {
  ok: `console.log("All checks passed (sahte).");\n`,
  cwd: `console.log("cwd=" + process.cwd());\nconsole.log("All checks passed (sahte cwd).");\n`,
  fail: `console.error("FAIL: birinci kontrol");\nconsole.error("FAIL: ikinci, kontrol: yüzde 50%");\nconsole.error("\\n2 check(s) failed.");\nprocess.exit(1);\n`,
  crash: `throw new Error("sahte çökme");\n`,
  liar: `console.log("FAIL: yalan söyleyen test");\nprocess.exit(0);\n`,
  hang: `${WRITE_PID("hang")}setInterval(() => {}, 1000);\n`,
  stubborn: `${WRITE_PID("stubborn")}process.on("SIGTERM", () => {});\nsetInterval(() => {}, 1000);\n`,
  loud: `for (let i = 1; i <= 1000; i++) console.error("FAIL: kontrol " + i);\nconsole.error("1000 check(s) failed.");\nprocess.exitCode = 1;\n`,
  huge: `const line = "x".repeat(99) + "\\n";\nfor (let i = 0; i < 90000; i++) process.stdout.write(line);\nprocess.exitCode = 1;\n`,
  marker: `import fs from "node:fs";\nfs.writeFileSync(new URL("./helper-ran", import.meta.url), "x");\n`,
};

// ---- 1) hepsi geçen dizin: keşif kuralları, çıktı, -v, --list ------------------------------
{
  const dir = makeDir("good", { "ok_test.mjs": SRC.ok, "cwd_test.mjs": SRC.cwd, "helper.mjs": SRC.marker, "_test.mjs": SRC.marker, "notes.txt": "x" });
  fs.mkdirSync(path.join(dir, "dir_test.mjs"));
  let r = run([], { dir });
  check("hepsi geçince çıkış kodu 0", r.status === 0, r.out);
  check("özet satırı: 2 geçti, 0 başarısız", /\n2 geçti, 0 başarısız \(toplam [\d.]+ sn\)\n/.test(r.out), r.out);
  check("her test ✓ satırıyla listelenir (süre sütunlu)", /✓ cwd +[\d.]+ sn\n/.test(r.out) && /✓ ok +[\d.]+ sn\n/.test(r.out), r.out);
  check("geçen testlerin çıktısı gösterilmez", !r.out.includes("All checks passed") && !r.out.includes("cwd="), r.out);
  check("*_test.mjs olmayan dosya, adı yalnızca sonekten ibaret dosya ve dizin çalıştırılmaz/listelenmez", !fs.existsSync(path.join(dir, "helper-ran")) && !/helper|dir_test|✓ _test|✓ dir/.test(r.out), r.out);
  r = run(["-v"], { dir });
  check("-v: geçen testlerin çıktısı da gösterilir", r.status === 0 && r.out.includes("All checks passed (sahte).") && r.out.includes("All checks passed (sahte cwd)."), r.out);
  check("her test, çalışma dizini test dizini olarak çalıştırılır", r.out.includes(`cwd=${fs.realpathSync(dir)}`), r.out);
  r = run(["--list"], { dir });
  check("--list: yalnız adlar (alfabetik), hiçbir test çalışmadan", r.status === 0 && r.stdout === "cwd\nok\n" && !fs.existsSync(path.join(dir, "helper-ran")), JSON.stringify(r.out));
}

// ---- 2) karışık dizin: başarısız / çöken / yalan söyleyen test; --only / --skip -----------------
{
  const dir = makeDir("mixed", { "fail_test.mjs": SRC.fail, "crash_test.mjs": SRC.crash, "liar_test.mjs": SRC.liar, "ok_test.mjs": SRC.ok });
  const r = run([], { dir });
  check("başarısız test varken çıkış kodu 1", r.status === 1, r.out);
  check("özet: 1 geçti, 3 başarısız", /\n1 geçti, 3 başarısız \(toplam [\d.]+ sn\)\n/.test(r.out), r.out);
  check("başarısızlıklardan sonra kalan testler yine çalışır (sonda ✓ ok)", /✓ ok +[\d.]+ sn\n/.test(r.out), r.out);
  check("'Başarısız:' satırı adları sıralı verir + yeniden çalıştırma ipucu", r.out.includes("Başarısız: crash, fail, liar\n") && r.out.includes("node run_all.mjs --only crash,fail,liar"), r.out);
  check("fail: 'çıkış kodu 1 · 2 FAIL satırı' ve FAIL satırları olduğu gibi basılır", /✗ fail +[\d.]+ sn {2}çıkış kodu 1 · 2 FAIL satırı\n/.test(r.out) && r.out.includes("    FAIL: birinci kontrol\n") && r.out.includes("    FAIL: ikinci, kontrol: yüzde 50%\n"), r.out);
  check("crash: çıkış kodu 1 ve istisna metni basılır", /✗ crash +[\d.]+ sn {2}çıkış kodu 1\n/.test(r.out) && r.out.includes("sahte çökme"), r.out);
  check("liar: çıkış kodu 0 olsa bile çıktıda FAIL satırı varsa başarısız", /✗ liar +[\d.]+ sn {2}çıkış kodu 0 ama çıktıda FAIL satırı var · 1 FAIL satırı\n/.test(r.out), r.out);
  check("geçen testin çıktısı başarısızlarınkine karışmaz", !r.out.includes("All checks passed"), r.out);

  let o = run(["--only", "ok"], { dir });
  check("--only ok: yalnız ok çalışır, çıkış 0, diğerleri 'atlandı' diye bildirilir", o.status === 0 && /\n1 geçti, 0 başarısız, 3 atlandı \(/.test(o.out) && o.out.includes("Atlanan: crash, fail, liar\n") && !/✗/.test(o.out), o.out);
  o = run(["--skip", "crash,fail", "--skip", "liar"], { dir });
  check("--skip (virgüllü ve tekrarlı): yalnız ok kalır, çıkış 0", o.status === 0 && /\n1 geçti, 0 başarısız, 3 atlandı \(/.test(o.out), o.out);
  o = run(["--only=fail_test.mjs"], { dir });
  check("--only=<dosya adı_test.mjs> biçimi de kabul edilir", o.status === 1 && /\n0 geçti, 1 başarısız, 3 atlandı \(/.test(o.out), o.out);
}

// ---- 3) hatalı kullanım: çıkış kodu 2, hiçbir test çalışmaz (sessizce yeşil olmaz) -------------------
{
  const mixed = path.join(root, "mixed");
  const emptyDir = makeDir("empty", {});
  const cases = [
    ["bilinmeyen --only adı", ["--only", "nope"], { dir: mixed }, "bilinmeyen test adı: nope"],
    ["bilinmeyen --skip adı", ["--skip", "nope"], { dir: mixed }, "bilinmeyen test adı: nope"],
    ["bilinmeyen seçenek", ["--bogus"], { dir: mixed }, "bilinmeyen seçenek: --bogus"],
    ["--only değersiz", ["--only"], { dir: mixed }, "--only bir değer ister"],
    ["--only boş değer", ["--only", ""], { dir: mixed }, "en az bir test adı"],
    ["--timeout 0", ["--timeout", "0"], { dir: mixed }, "--timeout pozitif bir sayı ister"],
    ["--timeout sayı değil", ["--timeout", "abc"], { dir: mixed }, "--timeout pozitif bir sayı ister"],
    ["bayrağa değer verilmesi", ["--list=1"], { dir: mixed }, "--list değer almaz"],
    ["--only ile --skip her şeyi eliyor", ["--only", "ok", "--skip", "ok"], { dir: mixed }, "çalıştırılacak test kalmadı"],
    ["dizin yok", ["--dir", path.join(root, "yok-boyle-bir-dizin")], {}, "test dizini okunamadı"],
    ["dizinde test yok", [], { dir: emptyDir }, "çalıştırılacak test kalmadı"],
  ];
  for (const [label, args, opts, msg] of cases) {
    const r = run(args, opts);
    check(`hatalı kullanım (${label}): çıkış kodu 2, açıklayıcı ileti + kullanım, hiçbir test çalışmaz`, r.status === 2 && r.stderr.includes(msg) && r.stderr.includes("Kullanım: node run_all.mjs") && !/[✓✗]/.test(r.out), `status=${r.status}\n${r.out}`);
  }
  const h = run(["--help"]);
  check("--help: çıkış kodu 0, kullanım metni stdout'ta", h.status === 0 && h.stdout.includes("Kullanım: node run_all.mjs") && h.stdout.includes("--only") && h.stdout.includes("--timeout"), h.out);
}

// ---- 4) zaman aşımı: takılan ve SIGTERM'i yok sayan test sonlandırılır -------------------------------
{
  const dir = makeDir("hang", { "hang_test.mjs": SRC.hang, "stubborn_test.mjs": SRC.stubborn, "zok_test.mjs": SRC.ok });
  const t0 = Date.now();
  const r = run(["--timeout", "2"], { dir, timeoutMs: 40000 });
  const took = Date.now() - t0;
  check("zaman aşımında çıkış kodu 1", r.status === 1, r.out);
  check("takılan test 'zaman aşımı (2 sn)' diye raporlanır", /✗ hang +[\d.]+ sn {2}zaman aşımı \(2 sn\), süreç sonlandırıldı/.test(r.out), r.out);
  check("SIGTERM'i yok sayan test de aynı şekilde raporlanır (SIGKILL'e yükseltme)", /✗ stubborn +[\d.]+ sn {2}zaman aşımı \(2 sn\), süreç sonlandırıldı/.test(r.out), r.out);
  check("takılan testlerden sonra kalan test çalışır", /✓ zok +[\d.]+ sn\n/.test(r.out), r.out);
  check(`koşucu makul sürede bitti (${took} ms < 40000)`, took < 40000);
  for (const n of ["hang", "stubborn"]) {
    const pid = readPid(path.join(dir, `${n}.pid`));
    check(`${n}: pid dosyası yazılmış (test 2 sn içinde başlamış)`, Number.isInteger(pid) && pid > 0, `pid=${pid}`);
    check(`${n}: süreç koşucu çıktıktan sonra yaşamıyor (öksüz süreç kalmadı)`, !alive(pid), `pid=${pid}`);
  }
}

// ---- 5) Ctrl+C (SIGINT): çocuk öldürülür (SIGTERM'i yok sayan dahil), kalan testler çalışmaz, çıkış kodu 130 -------
{
  const dir = makeDir("sigint", { "stubborn_test.mjs": SRC.stubborn, "zok_test.mjs": SRC.ok });
  const child = spawn(process.execPath, [RUNNER, "--dir", dir, "--timeout", "120"], { env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (b) => (out += b));
  child.stderr.on("data", (b) => (out += b));
  const closed = new Promise((res) => child.on("close", (code, signal) => res({ code, signal })));
  const pidFile = path.join(dir, "stubborn.pid");
  const started = Date.now();
  while (!(readPid(pidFile) > 0) && Date.now() - started < 20000) await sleep(50);
  const pid = readPid(pidFile);
  child.kill("SIGINT");
  let giveUp;
  const res = await Promise.race([closed, new Promise((r) => (giveUp = setTimeout(() => r(null), 30000)))]);
  clearTimeout(giveUp); // bekleyen zamanlayıcı süreci 30 sn daha açık tutmasın
  if (res === null) child.kill("SIGKILL");
  check("Ctrl+C: koşucu 30 sn içinde çıktı", res !== null);
  check("Ctrl+C: çıkış kodu 130 ve 'Kesildi' notu", res && res.code === 130 && out.includes("Kesildi"), `${JSON.stringify(res)}\n${out}`);
  check("Ctrl+C: kalan test çalıştırılmadı, özet satırı basılmadı", !out.includes("✓ zok") && !/ geçti, \d+ başarısız/.test(out), out);
  check("Ctrl+C: SIGTERM'i yok sayan test süreci de öldürüldü (SIGKILL'e yükseltme)", Number.isInteger(pid) && pid > 0 && !alive(pid), `pid=${pid}`);
}

// ---- 6) çok uzun çıktı: gösterim kırpılır, yakalama üst sınırı not düşer -----------------------------
{
  const dir = makeDir("noisy", { "huge_test.mjs": SRC.huge, "loud_test.mjs": SRC.loud });
  const r = run([], { dir });
  const lines = r.out.split("\n").length;
  check("uzun başarısız çıktı baştan+sondan kırpılır ('701 satır atlandı'), başı ve sonu görünür", r.status === 1 && r.out.includes("[... 701 satır atlandı ...]") && r.out.includes("    FAIL: kontrol 1\n") && r.out.includes("    1000 check(s) failed."), r.out.slice(0, 600));
  check("yakalama üst sınırını aşan çıktıya 'bayt çıktı kesildi' notu düşülür", /\[\.\.\. \d+ bayt çıktı kesildi\]/.test(r.out), r.out.slice(-300));
  check(`toplam çıktı kısa kalır (${lines} satır < 800)`, lines < 800);
}

// ---- 7) GitHub Actions çıktısı ------------------------------------------------------------------------
{
  const dir = makeDir("actions-dir", { "we:ird_test.mjs": `console.error("FAIL: yüzde 50%, iki: nokta");\nprocess.exitCode = 1;\n`, "ok_test.mjs": SRC.ok });
  const summary = path.join(root, "summary.md");
  const env = { GITHUB_ACTIONS: "true", GITHUB_WORKSPACE: root, GITHUB_STEP_SUMMARY: summary };
  const r = run(["-v"], { dir, env });
  const errLine = r.stdout.split("\n").find((l) => l.startsWith("::error "));
  check("Actions: başarısız test için dosyaya bağlı ::error notu (özellik değerlerinde ':' kaçışlı)", !!errLine && errLine.startsWith("::error file=actions-dir/we%3Aird_test.mjs,title=we%3Aird testi başarısız::"), errLine);
  check("Actions: not iletisinde satır sonu %0A, yüzde işareti %25 olarak kaçışlı (veri kısmında ',' ve ':' kaçışsız)", !!errLine && errLine.endsWith("::çıkış kodu 1 · 1 FAIL satırı%0AFAIL: yüzde 50%25, iki: nokta"), errLine);
  check("Actions: -v ile geçen testin çıktısı ::group:: ... ::endgroup:: içinde", r.stdout.includes("::group::ok çıktısı\n    All checks passed (sahte).\n::endgroup::\n"), r.stdout);
  const md = fs.existsSync(summary) ? fs.readFileSync(summary, "utf8") : "";
  check("Actions: GITHUB_STEP_SUMMARY'ye başlık, tablo satırları ve ayrıntı bloğu yazılır", md.includes("### Dijital Mushaf testleri") && md.includes("| ok | ✓ geçti |") && /\| we:ird \| ✗ çıkış kodu 1 · 1 FAIL satırı \|/.test(md) && md.includes("<details open>") && md.includes("FAIL: yüzde 50%, iki: nokta"), md);
  run([], { dir, env });
  check("Actions: özet dosyasına EKLENİR (üzerine yazılmaz)", (fs.readFileSync(summary, "utf8").match(/### Dijital Mushaf testleri/g) || []).length === 2);
  const summary2 = path.join(root, "summary2.md");
  const n = run([], { dir, env: { GITHUB_STEP_SUMMARY: summary2 } });
  check("Actions dışında (GITHUB_ACTIONS yok): ::error notu ve özet dosyası yok", !n.out.includes("::error") && !n.out.includes("::group::") && !fs.existsSync(summary2), n.out);
}

// ---- 8) gerçek test dizininin keşfi --------------------------------------------------------------------
{
  const expected = fs
    .readdirSync(HERE)
    .filter((f) => f.endsWith(SUFFIX))
    .sort()
    .map((f) => f.slice(0, -SUFFIX.length));
  const r = run(["--list"]);
  check("gerçek dizin: --list, dizindeki tüm *_test.mjs dosyalarını (bu dosya dahil) dosya adı sırasıyla verir", r.status === 0 && r.stdout === `${expected.join("\n")}\n`, `${r.out}\n beklenen: ${expected.join(", ")}`);
  check("gerçek dizin: koşucunun kendisi (run_all.mjs) test sayılmaz; run_all ve full_corpus listede", !expected.includes("run_all.mjs") && expected.includes("run_all") && expected.includes("full_corpus"));
  const fast = run(["--list", "--skip", "full_corpus"]);
  check("gerçek dizin: --skip full_corpus (npm run test:fast) yalnız onu düşürür", fast.status === 0 && fast.stdout === `${expected.filter((n) => n !== "full_corpus").join("\n")}\n`, fast.out);
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("All checks passed (koşucu: çıkış kodları 0/1/2/130, keşif kuralları, --only/--skip/--list/-v, zaman aşımı + SIGKILL + öksüz süreç, Ctrl+C, çıktı kırpma, GitHub Actions ::error/::group/özet, gerçek dizin keşfi).");
}
