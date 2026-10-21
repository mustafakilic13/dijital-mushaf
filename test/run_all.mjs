// Bütün testleri tek komutla çalıştırır:  npm test   (ya da: node run_all.mjs)
//
// Bu dizindeki her `*_test.mjs` dosyası KENDİ Node sürecinde, çalışma dizini bu
// dizin olacak şekilde sırayla çalıştırılır: testler birbirinin global
// durumunu (jsdom pencereleri, değiştirilmiş prototip/zamanlayıcı) bozamaz; biri
// çökerse ya da takılırsa kalanlar yine çalışır ve sonda hepsinin özeti çıkar.
//
// Bir testin geçmesi = çıkış kodu 0 VE çıktısında `FAIL` ile başlayan satır
// olmaması. (Mevcut testler başarısızlıkta zaten 1 ile çıkar; ikinci koşul,
// "FAIL yazıp 0 ile çıkan" bir hatanın yeşil görünmesini engeller.) Geçen
// testlerin çıktısı gösterilmez (-v ile gösterilir); başarısız olanların çıktısı
// olduğu gibi basılır.
//
// Çıkış kodu: 0 = çalışan hepsi geçti; 1 = en az biri başarısız oldu, çöktü ya da
// süre sınırını aştı; 2 = hatalı kullanım (bilinmeyen seçenek ya da test adı,
// çalıştırılacak test yok); 130 = Ctrl+C. 2'nin ayrı olması bilinçli: yazım hatası
// yüzünden "hiçbir test çalışmadı ama sonuç yeşil" çıkmasın.
//
// GitHub Actions'ta (GITHUB_ACTIONS=true) ek olarak: başarısız test için
// dosyaya bağlı bir `::error` notu basılır ve GITHUB_STEP_SUMMARY varsa oraya
// özet tablosu yazılır.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUFFIX = "_test.mjs";
const DEFAULT_TIMEOUT_SEC = 300; // en yavaş test (full_corpus) ~1 dk; ~5x pay
const KILL_GRACE_MS = 3000; // SIGTERM'den sonra SIGKILL'e kadar beklenen süre
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024; // bir testin tutulan çıktısı üst sınırı
const MAX_SHOWN_LINES = 300; // başarısız testin çıktısından en çok bu kadar satır (baştan+sondan) gösterilir

const USAGE = `Kullanım: node run_all.mjs [seçenekler]   (npm test -- [seçenekler])

  --only a,b      yalnız bu testleri çalıştır (ad = dosya adı - "_test.mjs")
  --skip a,b      bu testleri atla
  --list          çalışacak testlerin adlarını yazdır, çalıştırma
  -v, --verbose   geçen testlerin çıktısını da göster
  --timeout SN    test başına süre sınırı, saniye (varsayılan ${DEFAULT_TIMEOUT_SEC})
  --dir DİZİN     testlerin bulunduğu dizin (varsayılan: bu dosyanın dizini)
  -h, --help      bu yardım

Çıkış kodu: 0 hepsi geçti, 1 en az bir test başarısız, 2 hatalı kullanım.`;

class UsageError extends Error {}

function splitNames(value) {
  return value
    .split(",")
    .map((s) => s.trim().replace(/_test\.mjs$/, ""))
    .filter(Boolean);
}

function parseArgs(argv) {
  const opts = { only: null, skip: new Set(), list: false, verbose: false, timeoutSec: DEFAULT_TIMEOUT_SEC, dir: HERE, help: false };
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    let inline = null;
    const eq = arg.startsWith("--") ? arg.indexOf("=") : -1;
    if (eq > 0) {
      inline = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    const value = () => {
      if (inline !== null) return inline;
      if (i + 1 >= argv.length) throw new UsageError(`${arg} bir değer ister`);
      return argv[++i];
    };
    const flag = () => {
      if (inline !== null) throw new UsageError(`${arg} değer almaz`);
      return true;
    };
    switch (arg) {
      case "-h":
      case "--help":
        opts.help = flag();
        break;
      case "--list":
        opts.list = flag();
        break;
      case "-v":
      case "--verbose":
        opts.verbose = flag();
        break;
      case "--only": {
        const names = splitNames(value());
        if (names.length === 0) throw new UsageError("--only için en az bir test adı verin");
        opts.only = opts.only || new Set();
        for (const n of names) opts.only.add(n);
        break;
      }
      case "--skip": {
        const names = splitNames(value());
        if (names.length === 0) throw new UsageError("--skip için en az bir test adı verin");
        for (const n of names) opts.skip.add(n);
        break;
      }
      case "--timeout": {
        const raw = value();
        const sec = Number(raw);
        if (!raw.trim() || !Number.isFinite(sec) || sec <= 0) throw new UsageError(`--timeout pozitif bir sayı ister (saniye): "${raw}"`);
        opts.timeoutSec = sec;
        break;
      }
      case "--dir":
        opts.dir = path.resolve(value());
        break;
      default:
        throw new UsageError(`bilinmeyen seçenek: ${argv[i]}`);
    }
  }
  return opts;
}

function discover(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    throw new UsageError(`test dizini okunamadı: ${dir} (${e.code || e.message})`);
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(SUFFIX) && e.name.length > SUFFIX.length)
    .map((e) => ({ name: e.name.slice(0, -SUFFIX.length), file: e.name }))
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
}

function select(tests, { only, skip }) {
  const known = new Set(tests.map((t) => t.name));
  for (const n of [...(only || []), ...skip]) {
    if (!known.has(n)) throw new UsageError(`bilinmeyen test adı: ${n}\n  mevcut testler: ${[...known].join(", ") || "(yok)"}`);
  }
  const selected = tests.filter((t) => (!only || only.has(t.name)) && !skip.has(t.name));
  const skipped = tests.filter((t) => !selected.includes(t));
  if (selected.length === 0) throw new UsageError("çalıştırılacak test kalmadı (dizinde *_test.mjs yok ya da --only/--skip hepsini eledi)");
  return { selected, skipped };
}

// Tek testi ayrı süreçte çalıştırır; stdout+stderr varış sırasıyla tek akışta
// tutulur. Hiçbir koşulda reddedilmez (spawn hatası da sonuç olarak döner).
function runOne(test, dir, timeoutSec, state) {
  return new Promise((resolve) => {
    const started = Date.now();
    const chunks = [];
    let size = 0;
    let dropped = 0;
    let timedOut = false;
    let spawnError = null;
    let settled = false;
    let killTimer = null;

    const child = spawn(process.execPath, [path.join(dir, test.file)], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
    state.child = child;

    const onData = (buf) => {
      if (size < MAX_CAPTURE_BYTES) {
        chunks.push(buf);
        size += buf.length;
      } else {
        dropped += buf.length;
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    const finish = (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(killTimer);
      state.child = null;
      let output = Buffer.concat(chunks).toString("utf8");
      if (dropped) output += `\n[... ${dropped} bayt çıktı kesildi]\n`;
      resolve({ ...test, code, signal, timedOut, spawnError, ms: Date.now() - started, output });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS);
    }, timeoutSec * 1000);

    child.on("error", (e) => {
      spawnError = e;
      if (child.pid === undefined) finish(null, null); // süreç hiç başlamadı
    });
    child.on("close", (code, signal) => finish(code, signal));
  });
}

function failLinesOf(output) {
  return output.split(/\r?\n/).filter((l) => /^FAIL\b/.test(l));
}

function analyze(r, timeoutSec) {
  const failLines = failLinesOf(r.output);
  let reason = null;
  if (r.spawnError) reason = `başlatılamadı: ${r.spawnError.message}`;
  else if (r.timedOut) reason = `zaman aşımı (${timeoutSec} sn), süreç sonlandırıldı`;
  else if (r.signal) reason = `sinyalle sonlandı (${r.signal})`;
  else if (r.code !== 0) reason = `çıkış kodu ${r.code}`;
  else if (failLines.length) reason = "çıkış kodu 0 ama çıktıda FAIL satırı var";
  if (reason && failLines.length) reason += ` · ${failLines.length} FAIL satırı`;
  return { ...r, ok: reason === null, reason, failLines };
}

const sec = (ms) => `${(ms / 1000).toFixed(1)} sn`;

function clipLines(lines) {
  if (lines.length <= MAX_SHOWN_LINES) return lines;
  const head = Math.floor(MAX_SHOWN_LINES * 0.75);
  const tail = MAX_SHOWN_LINES - head;
  return [...lines.slice(0, head), `[... ${lines.length - MAX_SHOWN_LINES} satır atlandı ...]`, ...lines.slice(-tail)];
}

function indentedOutput(output) {
  const text = output.replace(/\s+$/, "");
  if (!text) return "    (çıktı yok)";
  return clipLines(text.split(/\r?\n/))
    .map((l) => `    ${l}`)
    .join("\n");
}

// GitHub Actions iş akışı komutları için kaçışlar (docs: workflow commands).
const escData = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escProp = (s) => escData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

function annotation(r, dir) {
  const message = [r.reason, ...r.failLines.slice(0, 3).map((l) => (l.length > 300 ? `${l.slice(0, 300)}...` : l))].join("\n");
  const props = [];
  const workspace = process.env.GITHUB_WORKSPACE;
  if (workspace) {
    const rel = path.relative(workspace, path.join(dir, r.file));
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) props.push(`file=${escProp(rel.split(path.sep).join("/"))}`);
  }
  props.push(`title=${escProp(`${r.name} testi başarısız`)}`);
  return `::error ${props.join(",")}::${escData(message)}`;
}

function stepSummary(results, skipped, totalMs) {
  const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const failed = results.filter((r) => !r.ok);
  let md = "### Dijital Mushaf testleri\n\n| Test | Sonuç | Süre |\n| --- | --- | ---: |\n";
  for (const r of results) md += `| ${cell(r.name)} | ${r.ok ? "✓ geçti" : `✗ ${cell(r.reason)}`} | ${sec(r.ms)} |\n`;
  md += `\n**${results.length - failed.length} geçti, ${failed.length} başarısız${skipped.length ? `, ${skipped.length} atlandı` : ""}** (toplam ${sec(totalMs)})\n`;
  for (const r of failed) {
    const lines = r.failLines.length ? r.failLines.slice(0, 15) : clipLines(r.output.replace(/\s+$/, "").split(/\r?\n/)).slice(-15);
    md += `\n<details open><summary>${r.name}: ${r.reason.replace(/</g, "&lt;")}</summary>\n\n\`\`\`\n${lines.join("\n")}\n\`\`\`\n\n</details>\n`;
  }
  return md;
}

async function main() {
  let opts, selected, skipped;
  try {
    opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
      console.log(USAGE);
      return 0;
    }
    ({ selected, skipped } = select(discover(opts.dir), opts));
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    console.error(`run_all: ${e.message}\n\n${USAGE}`);
    return 2;
  }

  if (opts.list) {
    for (const t of selected) console.log(t.name);
    return 0;
  }

  const inActions = process.env.GITHUB_ACTIONS === "true";
  const width = Math.max(...selected.map((t) => t.name.length));
  console.log(`Dijital Mushaf testleri: ${selected.length} dosya, Node ${process.version}, dizin: ${opts.dir}\n`);

  const state = { child: null, interrupted: false };
  const onSignal = () => {
    state.interrupted = true;
    const child = state.child;
    if (child) {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS).unref(); // SIGTERM'i yok sayan test de kalmasın
    }
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  const results = [];
  const t0 = Date.now();
  for (const t of selected) {
    if (state.interrupted) break;
    const r = analyze(await runOne(t, opts.dir, opts.timeoutSec, state), opts.timeoutSec);
    if (state.interrupted) break;
    results.push(r);
    console.log(`${r.ok ? "✓" : "✗"} ${r.name.padEnd(width)}  ${sec(r.ms).padStart(8)}${r.ok ? "" : `  ${r.reason}`}`);
    if (!r.ok) {
      if (inActions) console.log(annotation(r, opts.dir));
      console.log(indentedOutput(r.output));
    } else if (opts.verbose) {
      if (inActions) console.log(`::group::${r.name} çıktısı`);
      console.log(indentedOutput(r.output));
      if (inActions) console.log("::endgroup::");
    }
  }
  process.off("SIGINT", onSignal);
  process.off("SIGTERM", onSignal);

  if (state.interrupted) {
    console.log("\nKesildi (Ctrl+C); kalan testler çalıştırılmadı.");
    return 130;
  }

  const totalMs = Date.now() - t0;
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} geçti, ${failed.length} başarısız${skipped.length ? `, ${skipped.length} atlandı` : ""} (toplam ${sec(totalMs)})`);
  if (skipped.length) console.log(`Atlanan: ${skipped.map((t) => t.name).join(", ")}`);
  if (failed.length) {
    console.log(`Başarısız: ${failed.map((r) => r.name).join(", ")}`);
    console.log(`Yalnız bunları yeniden çalıştırmak için: node run_all.mjs --only ${failed.map((r) => r.name).join(",")}`);
  }

  if (inActions && process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, stepSummary(results, skipped, totalMs));
    } catch (e) {
      console.log(`Uyarı: GITHUB_STEP_SUMMARY yazılamadı (${e.code || e.message})`);
    }
  }
  return failed.length ? 1 : 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (e) => {
    console.error("run_all: beklenmeyen hata:", e);
    process.exitCode = 1;
  }
);
