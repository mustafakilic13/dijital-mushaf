// Modül sınırı denetimi: js/app.js odaklı modüllere bölündü (bkz. GELISTIRICI.md "Modül haritası"); bu test bölünmüş yapının
// SESSİZCE bozulmasını önler. Neden gerekli: modüller arasındaki bir hata (eksik import, yanlış ad, çevrimsel içe aktarmada sıra
// bağımlılığı) bir işlev ÇAĞRILANA kadar görünmez -- tarayıcıda yalnızca o yola girilince "X is not defined" ya da "Cannot access
// 'X' before initialization" olarak patlar. Burada yapısal ve çalışma-zamanı kontrolleri, uygulamayı tarayıcıda açmadan (Node +
// jsdom) yapılır:
//   1. Sınıflandırma: js/ altındaki her dosya test/uygulama_kaynagi.mjs'teki APP_MODULES / LIBRARY_MODULES listelerinden TAM birinde
//      (yeni dosya sınanmadan kalmasın, silinen dosya listede kalmasın); app.js'in içeriği yalnızca main() + registerServiceWorker();
//   2. İçe/dışa aktarma grafiği: her import bir js/ dosyasını ve onun gerçekten dışa aktardığı adı gösteriyor; hiçbir modül app.js'i
//      (giriş noktası: yüklenince main() çalışır) içe aktarmıyor; kendini içe aktaran yok; uygulama modüllerinin dışa aktardığı her ad
//      başka bir modülce kullanılıyor (ölü ihraç yok); "yaprak" modüller (state.js, html.js) hiçbir şey içe aktarmıyor; kütüphane
//      modülleri (kendi başına duran: arama.js, render.js, ...) uygulama modüllerine bağlanmıyor (tek istisna: html.js);
//   3. Çevrimsel içe aktarma: grafikteki gerçek döngüler (Tarjan) hesaplanır; döngüdeki her modülün başlık yorumunda "Çevrimsel içe
//      aktarma" notu var, döngüde olmayanda yok (not yalan söylemesin);
//   4. Eksik import taraması: bir modül başka bir modülün dışa aktardığı bir adı kullanıyor ama içe aktarmamış/tanımlamamışsa bildirilir
//      (yorum, dizge, şablon metni ve düzenli ifade atlanır; tarayıcı belirteçleyicinin kendisi de kısa örneklerle sınanır); bunun
//      dayanağı olarak her dışa aktarılan ad TEK modülde olmalı;
//   5. Çalışma zamanı: her uygulama modülü, jsdom'da (gerçek index.html) AYRI bir Node sürecinde, İLK modül olarak içe aktarılıyor.
//      Çevrimsel gruptaki modüller yüklenirken, üst düzeyde başka bir modülün `const`ını okuyan kod, o modül henüz
//      değerlendirilmemişse "Cannot access ... before initialization" verir; her modülü giriş yapmak değerlendirme sırasını değiştirir
//      ve bu hatayı yakalar. (Kural: modül yüklenirken, üst düzeyde, başka bir uygulama modülünden ad OKUMAYIN -- yalnızca işlev
//      gövdelerinde, çağrı anında kullanın; tek istisna: yaprak modüllerden (state.js) ad okumak güvenli.)
//   6. escapeHtml TEK kopya (js/html.js); kullanan her modül oradan içe aktarıyor;
//   7. test/uygulama_kaynagi.mjs'in birleşik `appSource`'u: import/export satırı kalmıyor, her modülün bildirimleri içinde;
//   8. GELISTIRICI.md "Modül haritası": her uygulama modülünü anıyor, çevrimsel içe aktarmayı ve bu testi anlatıyor.
//
// NOT: bunlar yapısal/mantıksal kontroller ve Node+jsdom'da modül yükleme; gerçek tarayıcıda (Chromium/Firefox/Safari) uygulamanın
// açılması ve ekran okuyucu testinin yerini tutmaz.
//
// jsdom gerekiyor (test/package.json'da devDependency):  npm ci && node modul_siniri_test.mjs

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_MODULES, LIBRARY_MODULES, appSource } from "./uygulama_kaynagi.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TEST_DIR, "..");
const JS_DIR = path.join(ROOT, "js");

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
    if (detail !== undefined) console.error(`      ${String(detail).slice(0, 700)}`);
  }
}

// ---- kaynaklar -------------------------------------------------------------------------------------------------------------
const FILES = fs.readdirSync(JS_DIR).filter((f) => f.endsWith(".js")).sort();
const SRC = Object.fromEntries(FILES.map((f) => [f, fs.readFileSync(path.join(JS_DIR, f), "utf8")]));
const LEAVES = ["state.js", "html.js"]; // başka hiçbir uygulama modülünü içe aktarmayanlar (bkz. başlık yorumları)

// ---- 1. sınıflandırma ------------------------------------------------------------------------------------------------------
{
  const listed = [...APP_MODULES, ...LIBRARY_MODULES];
  check("uygulama_kaynagi.mjs: APP_MODULES / LIBRARY_MODULES'te tekrar eden ad yok", new Set(listed).size === listed.length, listed.filter((n, i) => listed.indexOf(n) !== i).join(", "));
  const unlisted = FILES.filter((f) => !listed.includes(f));
  check(`js/: her dosya APP_MODULES ya da LIBRARY_MODULES'te (listede olmayan: ${unlisted.join(", ") || "yok"})`, unlisted.length === 0, "test/uygulama_kaynagi.mjs'teki listeye ekleyin (eski app.js'in parçasıysa APP_MODULES, kendi başına duran kütüphaneyse LIBRARY_MODULES)");
  const missing = listed.filter((f) => !FILES.includes(f));
  check(`uygulama_kaynagi.mjs: listedeki her dosya js/'te var (olmayan: ${missing.join(", ") || "yok"})`, missing.length === 0);
}

// ---- belirteçleyici (yorum/dizge/şablon/düzenli ifade atlanır) -------------------------------------------------------------------
const REGEX_AFTER = new Set(["return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "else", "do", "yield", "await", "instanceof"]);
const CONTROL = new Set(["if", "for", "while", "switch", "catch", "with", "return", "typeof", "function", "await", "yield", "of", "in"]);

// Dönüş: [{ t: "id" | "p" | "v", v, line }]. "v" = değer gibi davranan belirteç (sayı, dizge, şablon, düzenli ifade).
function tokenize(code) {
  const toks = [];
  const stack = [];
  const n = code.length;
  let i = 0;
  let line = 1;
  let prev = null;
  const push = (t, v) => {
    prev = { t, v, line };
    toks.push(prev);
  };
  const regexAllowed = () => {
    if (!prev) return true;
    if (prev.t === "v") return false;
    if (prev.t === "id") return REGEX_AFTER.has(prev.v);
    return !(prev.v === ")" || prev.v === "]" || prev.v === "}");
  };
  // "`"ten (ya da bir ${...}'in kapanışından) sonra şablon METNİNİ okur; true = bir ${ ile durdu.
  const readTemplate = () => {
    while (i < n) {
      const c = code[i];
      if (c === "\\") {
        if (code[i + 1] === "\n") line++;
        i += 2;
        continue;
      }
      if (c === "\n") line++;
      if (c === "`") {
        i++;
        return false;
      }
      if (c === "$" && code[i + 1] === "{") {
        i += 2;
        return true;
      }
      i++;
    }
    return false;
  };
  while (i < n) {
    const c = code[i];
    if (c === "\n") {
      line++;
      i++;
    } else if (c === " " || c === "\t" || c === "\r") {
      i++;
    } else if (c === "/" && code[i + 1] === "/") {
      while (i < n && code[i] !== "\n") i++;
    } else if (c === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      for (let k = i; k < stop; k++) if (code[k] === "\n") line++;
      i = stop;
    } else if (c === '"' || c === "'") {
      i++;
      while (i < n && code[i] !== c) {
        if (code[i] === "\\") i++;
        if (code[i] === "\n") line++;
        i++;
      }
      i++;
      push("v", "str");
    } else if (c === "`") {
      i++;
      if (readTemplate()) {
        stack.push("${");
        push("p", "${");
      } else push("v", "tpl");
    } else if (c === "{") {
      stack.push("{");
      push("p", "{");
      i++;
    } else if (c === "}") {
      const top = stack.pop();
      i++;
      push("p", "}");
      if (top === "${") {
        if (readTemplate()) {
          stack.push("${");
          push("p", "${");
        } else push("v", "tpl");
      }
    } else if (c === "/" && regexAllowed()) {
      i++;
      let inClass = false;
      while (i < n) {
        const d = code[i];
        if (d === "\\") {
          i += 2;
          continue;
        }
        if (d === "[") inClass = true;
        else if (d === "]") inClass = false;
        else if (d === "/" && !inClass) break;
        i++;
      }
      i++;
      while (i < n && /[a-z]/.test(code[i])) i++;
      push("v", "re");
    } else if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w$]/.test(code[j])) j++;
      push("id", code.slice(i, j));
      i = j;
    } else if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(code[j])) j++;
      push("v", "num");
      i = j;
    } else if (c === "." && code[i + 1] === "." && code[i + 2] === ".") {
      push("p", "...");
      i += 3;
    } else if (c === "?" && code[i + 1] === "." && !/[0-9]/.test(code[i + 2] || "")) {
      push("p", "?.");
      i += 2;
    } else if (c === "=" && code[i + 1] === ">") {
      push("p", "=>");
      i += 2;
    } else if (c === "=" && code[i + 1] === "=") {
      let j = i + 2;
      if (code[j] === "=") j++;
      push("p", "==");
      i = j;
    } else {
      push("p", c);
      i++;
    }
  }
  return toks;
}

// Bir belirteç listesinde, `open` indisindeki "(" / "[" / "{"'in eşini bulur (dengeli).
function matching(toks, open) {
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const want = pairs[toks[open].v];
  const opener = toks[open].v;
  let depth = 0;
  for (let k = open; k < toks.length; k++) {
    if (toks[k].t !== "p") continue;
    if (toks[k].v === opener) depth++;
    else if (toks[k].v === want && --depth === 0) return k;
  }
  return -1;
}

// Modülde HERHANGİ bir kapsamda bildirilen adlar (cömert: fazla toplamak yalnızca yanlış alarmı azaltır) ve içe aktarılan yerel adlar.
function declaredNames(toks) {
  const out = new Set();
  const addRange = (a, b) => {
    for (let k = a; k < b; k++) if (toks[k].t === "id") out.add(toks[k].v);
  };
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.t === "id" && (tk.v === "function" || tk.v === "class")) {
      let j = k + 1;
      if (toks[j] && toks[j].v === "*") j++;
      if (toks[j] && toks[j].t === "id") out.add(toks[j].v);
      const open = toks.findIndex((x, idx) => idx >= j && x.t === "p" && x.v === "(");
      if (tk.v === "function" && open > 0 && open <= j + 1) {
        const close = matching(toks, open);
        if (close > open) addRange(open + 1, close);
      }
    } else if (tk.t === "id" && (tk.v === "const" || tk.v === "let" || tk.v === "var")) {
      const nx = toks[k + 1];
      if (nx && nx.t === "id") out.add(nx.v);
      else if (nx && (nx.v === "{" || nx.v === "[")) {
        const close = matching(toks, k + 1);
        if (close > k) addRange(k + 2, close);
      }
    } else if (tk.t === "id" && tk.v === "catch" && toks[k + 1] && toks[k + 1].v === "(") {
      const close = matching(toks, k + 1);
      if (close > k) addRange(k + 2, close);
    } else if (tk.t === "p" && tk.v === "=>") {
      const before = toks[k - 1];
      if (before && before.t === "id") out.add(before.v);
      else if (before && before.v === ")") {
        let depth = 0;
        for (let j = k - 1; j >= 0; j--) {
          if (toks[j].v === ")") depth++;
          else if (toks[j].v === "(" && --depth === 0) {
            addRange(j + 1, k - 1);
            break;
          }
        }
      }
    } else if (tk.t === "p" && tk.v === "(" && k > 0 && toks[k - 1].t === "id" && !CONTROL.has(toks[k - 1].v)) {
      // `ad(parametreler) {` = yöntem tanımı (nesne/sınıf); denetim anahtar sözcükleri hariç
      const close = matching(toks, k);
      if (close > k && toks[close + 1] && toks[close + 1].v === "{") addRange(k + 1, close);
    } else if (tk.t === "id" && toks[k + 1] && toks[k + 1].v === "=" && toks[k - 1] && ["const", "let", "var", ",", "{", "["].includes(toks[k - 1].v)) {
      out.add(tk.v);
    }
  }
  return out;
}

// Serbest kullanım adayları: "ad" belirteçleri; özellik erişimi (.ad / ?.ad), nesne anahtarı ({ ad: ... }), yöntem tanımı başlığı
// (`ad(...) {`) ve import bildirimleri (`import { a as b } from "..."`) sayılmaz. Ad -> ilk satır.
function usedNames(toks) {
  const used = new Map();
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.t === "id" && tk.v === "import" && toks[k + 1] && toks[k + 1].v === "{") {
      const close = matching(toks, k + 1);
      if (close > k) {
        k = close + 2; // } from "..."
        continue;
      }
    }
    if (tk.t !== "id") continue;
    const before = toks[k - 1];
    const after = toks[k + 1];
    if (before && (before.v === "." || before.v === "?.")) continue;
    if (after && after.v === ":" && before && (before.v === "{" || before.v === ",")) continue;
    if (after && after.v === "(" && !CONTROL.has(tk.v)) {
      const close = matching(toks, k + 1);
      if (close > k && toks[close + 1] && toks[close + 1].v === "{") continue;
    }
    if (!used.has(tk.v)) used.set(tk.v, tk.line);
  }
  return used;
}

// Belirteçleyicinin kısa örneklerle sınanması (tarama yanlış alarm/kaçırma vermesin).
{
  const used = (code) => [...usedNames(tokenize(code)).keys()].sort().join(",");
  check("belirteçleyici: bölme ile düzenli ifade ayrılıyor (x / 2 / y; s.replace(/[&<>\"']/g, ...))", used("const a = x / 2 / y; s.replace(/[&<>\"'/]/g, (c) => c);") === "a,c,const,s,x,y");
  check("belirteçleyici: yorum, dizge ve şablon metni atlanıyor; ${...} içi kod sayılıyor", used("// gizli ad\n/* baz */ f(\"abc g\" + 'h' + `t ${i} u ${`iç ${j}`}`)") === "f,i,j");
  check("belirteçleyici: .özellik ve nesne anahtarı sayılmıyor, kısa yazım ve üçlü koşul sayılıyor", used("o.p; q?.r; ({ k: v, w }); c ? d : e") === "c,d,e,o,q,v,w");
  check("belirteçleyici: bildirimler cömertçe toplanıyor (const/let, yapı bozma, işlev parametresi, ok işlevi, catch, yöntem)", [...declaredNames(tokenize("const a = 1, b = 2; let { c, d: e } = o; function f(g, h) {} const i = (j, k) => j; const l = m => m; try {} catch (n) {} const o2 = { p(q) { return q; } };"))].sort().join(",") === "a,b,c,d,e,f,g,h,i,j,k,l,m,n,o2,q");
  check("belirteçleyici: yöntem tanımı başlığı ve import bildirimi kullanım sayılmıyor; çağrı ve if/while koşulu sayılıyor", used("import { a as b } from \"./x.js\"; ({ p(q) { return q; } }); if (f(x)) { g(); }") === "f,g,if,q,return,x");
}

// ---- 2. içe/dışa aktarma grafiği -------------------------------------------------------------------------------------------
const imports = {}; // dosya -> [{ from, names:[ad], line }]
const exportsOf = {}; // dosya -> Set(ad)
const unparsed = [];
for (const f of FILES) {
  const text = SRC[f];
  imports[f] = [];
  exportsOf[f] = new Set();
  const lineOf = (index) => text.slice(0, index).split("\n").length;
  let importLines = 0;
  for (const m of text.matchAll(/^import\b/gm)) importLines++;
  let parsedImports = 0;
  for (const m of text.matchAll(/^import\s*\{([^}]*)\}\s*from\s*"([^"]+)";/gm)) {
    parsedImports++;
    const names = m[1].split(",").map((s) => s.trim()).filter(Boolean).map((s) => s.split(/\s+as\s+/)[0]);
    imports[f].push({ from: m[2], names, locals: m[1].split(",").map((s) => s.trim()).filter(Boolean).map((s) => s.split(/\s+as\s+/).pop()), line: lineOf(m.index) });
  }
  if (importLines !== parsedImports) unparsed.push(`${f}: ${importLines} import satırı, ${parsedImports} ayrıştırıldı`);
  let exportLines = 0;
  for (const m of text.matchAll(/^export\b/gm)) exportLines++;
  let parsedExports = 0;
  for (const m of text.matchAll(/^export\s*\{([^}]*)\};?/gm)) {
    parsedExports++;
    for (const part of m[1].split(",")) {
      const nm = part.trim().split(/\s+as\s+/).pop();
      if (nm) exportsOf[f].add(nm);
    }
  }
  for (const m of text.matchAll(/^export\s+(?:async\s+)?(?:function\s*\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)) {
    parsedExports++;
    exportsOf[f].add(m[1]);
  }
  if (exportLines !== parsedExports) unparsed.push(`${f}: ${exportLines} export satırı, ${parsedExports} ayrıştırıldı (default/* ihracı desteklenmiyor)`);
}
check("js/: her import/export satırı ayrıştırılabildi (yalnızca `import { a } from \"./x.js\"` ve `export { a }` / `export function|const ...` biçimleri)", unparsed.length === 0, unparsed.join(" | "));

let edgeCount = 0;
{
  const badTarget = [];
  const badName = [];
  const importsApp = [];
  const selfImport = [];
  for (const f of FILES) {
    for (const imp of imports[f]) {
      edgeCount++;
      const target = imp.from.replace(/^\.\//, "");
      if (!/^\.\/[\w-]+\.js$/.test(imp.from) || !FILES.includes(target)) {
        badTarget.push(`${f}:${imp.line} "${imp.from}"`);
        continue;
      }
      if (target === "app.js") importsApp.push(`${f}:${imp.line}`);
      if (target === f) selfImport.push(f);
      for (const nm of imp.names) if (!exportsOf[target].has(nm)) badName.push(`${f}:${imp.line} ${nm} (${target} dışa aktarmıyor)`);
    }
  }
  check(`js/: her import "./ad.js" biçiminde ve var olan bir js/ dosyasına gidiyor (${edgeCount} bağlantı)`, badTarget.length === 0, badTarget.join(" | "));
  check("js/: içe aktarılan her ad hedef modülün gerçekten dışa aktardığı bir ad (tarayıcıda yoksa tüm uygulama yüklenmez)", badName.length === 0, badName.join(" | "));
  check("js/: hiçbir modül app.js'i içe aktarmıyor (giriş noktası: yüklenince main() çalışır)", importsApp.length === 0, importsApp.join(", "));
  check("js/: kendini içe aktaran modül yok", selfImport.length === 0, selfImport.join(", "));
}

{
  const importedBy = {}; // dosya -> Map(ad -> Set(içe aktaran dosya))
  for (const f of FILES) importedBy[f] = new Map();
  for (const f of FILES) {
    for (const imp of imports[f]) {
      const target = imp.from.replace(/^\.\//, "");
      if (!importedBy[target]) continue;
      for (const nm of imp.names) {
        if (!importedBy[target].has(nm)) importedBy[target].set(nm, new Set());
        importedBy[target].get(nm).add(f);
      }
    }
  }
  const dead = [];
  for (const f of APP_MODULES) for (const nm of exportsOf[f] || []) if (!importedBy[f].has(nm)) dead.push(`${f}: ${nm}`);
  check("uygulama modülleri: dışa aktarılan her ad başka bir modülce içe aktarılıyor (ölü ihraç yok)", dead.length === 0, dead.join(" | "));

  const leafBad = LEAVES.filter((f) => (imports[f] || []).length > 0);
  check(`yaprak modüller (${LEAVES.join(", ")}) hiçbir modül içe aktarmıyor (her yoldan önce ve eksiksiz değerlendirilsinler)`, leafBad.length === 0, leafBad.join(", "));

  const libBad = [];
  for (const f of LIBRARY_MODULES) for (const imp of imports[f] || []) {
    const target = imp.from.replace(/^\.\//, "");
    if (APP_MODULES.includes(target) && target !== "html.js") libBad.push(`${f}:${imp.line} -> ${target}`);
  }
  check("kütüphane modülleri uygulama modüllerine (state/els) bağlanmıyor; tek istisna ortak js/html.js", libBad.length === 0, libBad.join(" | "));
}

// ---- 3. çevrimsel içe aktarma: gerçek döngüler ve başlık notları -------------------------------------------------------------
const CYCLE_NOTE = "Çevrimsel içe aktarma";
let cyclicCount = 0;
{
  // Tarjan
  const adj = {};
  for (const f of FILES) adj[f] = [...new Set(imports[f].map((i) => i.from.replace(/^\.\//, "")).filter((t) => FILES.includes(t)))];
  const index = {};
  const low = {};
  const onStack = new Set();
  const st = [];
  const sccs = [];
  let counter = 0;
  const visit = (v) => {
    index[v] = low[v] = counter++;
    st.push(v);
    onStack.add(v);
    for (const w of adj[v]) {
      if (index[w] === undefined) {
        visit(w);
        low[v] = Math.min(low[v], low[w]);
      } else if (onStack.has(w)) low[v] = Math.min(low[v], index[w]);
    }
    if (low[v] === index[v]) {
      const comp = [];
      let w;
      do {
        w = st.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      sccs.push(comp.sort());
    }
  };
  for (const f of FILES) if (index[f] === undefined) visit(f);
  const cyclic = new Set(sccs.filter((c) => c.length > 1).flat());
  const header = (f) => {
    const lines = SRC[f].split("\n");
    const out = [];
    for (const l of lines) {
      if (l.startsWith("//") || l.trim() === "") out.push(l);
      else break;
    }
    return out.join("\n");
  };
  const lacking = [...cyclic].filter((f) => !header(f).includes(CYCLE_NOTE));
  const lying = FILES.filter((f) => !cyclic.has(f) && header(f).includes(CYCLE_NOTE));
  check(`döngüdeki her modülün (${[...cyclic].join(", ") || "yok"}) başlık yorumunda "${CYCLE_NOTE}" notu var`, lacking.length === 0, `eksik: ${lacking.join(", ")} -- notu ekleyin (bkz. başka bir döngü modülünün başlığı)`);
  check(`döngüde olmayan modülün başlığında "${CYCLE_NOTE}" notu yok (not yalan söylemesin)`, lying.length === 0, lying.join(", "));
  check("döngü notu bu testi ve GELISTIRICI.md bölümünü anıyor (kuralın nerede denetlendiği belli olsun)", [...cyclic].every((f) => /modul_siniri_test\.mjs/.test(header(f)) && /Modül haritası/.test(header(f))), [...cyclic].filter((f) => !(/modul_siniri_test\.mjs/.test(header(f)) && /Modül haritası/.test(header(f)))).join(", "));
  // belgeye gidecek bilgi: tek bir büyük döngü mü?
  check(`döngü sayısı: tek bir bağlı grup (bulunan: ${sccs.filter((c) => c.length > 1).map((c) => c.length).join("+") || "yok"} modül)`, sccs.filter((c) => c.length > 1).length <= 1, sccs.filter((c) => c.length > 1).map((c) => c.join(",")).join(" | "));
  cyclicCount = cyclic.size;
}

// ---- 4. eksik import taraması ----------------------------------------------------------------------------------------------
{
  const exported = new Map(); // ad -> dosya
  const owners = new Map(); // ad -> [dosya] (tek olmalı)
  for (const f of FILES) {
    for (const nm of exportsOf[f]) {
      exported.set(nm, f);
      owners.set(nm, [...(owners.get(nm) || []), f]);
    }
  }
  const sharedNames = [...owners].filter(([, fs]) => fs.length > 1).map(([nm, fs]) => `${nm} (${fs.join(", ")})`);
  check(`js/: her dışa aktarılan ad TEK modülde (${owners.size} ad; aynı ad iki modülde olursa eksik import taraması hangisinin kastedildiğini bilemez)`, sharedNames.length === 0, sharedNames.join(" | "));
  const missing = [];
  let scanned = 0;
  for (const f of FILES) {
    const toks = tokenize(SRC[f]);
    const declared = declaredNames(toks);
    const imported = new Set(imports[f].flatMap((i) => i.locals));
    // import/export satırlarının KENDİ belirteçleri kullanım sayılmasın: yalnızca import bildiriminin yerel adları zaten `imported`'ta
    const used = usedNames(toks);
    for (const [nm, line] of used) {
      scanned++;
      const owner = exported.get(nm);
      if (!owner || owner === f) continue;
      if (declared.has(nm) || imported.has(nm)) continue;
      missing.push(`${f}:${line} ${nm} (${owner} dışa aktarıyor; import edilmemiş)`);
    }
  }
  check(`js/: bir modülün kullandığı, başka modülün dışa aktardığı her ad içe aktarılmış (${scanned} ad tarandı)`, missing.length === 0, missing.join(" | "));
}

// ---- 6. escapeHtml tek kopya ------------------------------------------------------------------------------------------------
{
  const definers = FILES.filter((f) => /\bfunction\s+escapeHtml\s*\(/.test(SRC[f]));
  check(`escapeHtml tek bir yerde tanımlı: js/html.js (tanımlayanlar: ${definers.join(", ") || "yok"})`, definers.length === 1 && definers[0] === "html.js");
  const users = FILES.filter((f) => f !== "html.js" && tokenize(SRC[f]).some((t, k, a) => t.t === "id" && t.v === "escapeHtml" && a[k + 1] && a[k + 1].v === "(" && !(a[k - 1] && a[k - 1].v === ".")));
  const notImporting = users.filter((f) => !imports[f].some((i) => i.from === "./html.js" && i.names.includes("escapeHtml")));
  check(`escapeHtml kullanan her modül (${users.join(", ")}) onu ./html.js'ten içe aktarıyor`, users.length >= 5 && notImporting.length === 0, notImporting.join(", "));
}

// ---- app.js yapısı ---------------------------------------------------------------------------------------------------------
{
  const toks = tokenize(SRC["app.js"].replace(/^import\s*\{[^}]*\}\s*from\s*"[^"]+";$/gm, ""));
  // üst düzey (derinlik 0) bildirimler
  let depth = 0;
  const topLevel = [];
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.v === "{" || tk.v === "(" || tk.v === "[") depth++;
    else if (tk.v === "}" || tk.v === ")" || tk.v === "]") depth--;
    else if (depth === 0 && tk.t === "id" && ["function", "const", "let", "var", "class"].includes(tk.v)) topLevel.push(`${tk.v} ${toks[k + 1] && toks[k + 1].v}`);
  }
  check(`app.js: yalnızca main() ve registerServiceWorker() işlevlerini içeriyor (üst düzey bildirimler: ${topLevel.join(", ")})`, topLevel.join(",") === "function main,function registerServiceWorker", "yeni mantığı uygun bir modüle koyun; app.js yalnızca açılış");
  const tail = SRC["app.js"].trimEnd().split("\n").slice(-2).join("|");
  check("app.js: dosyanın sonu main(); ve registerServiceWorker(); çağrıları (açılış)", tail === "main();|registerServiceWorker();", tail);
}

// ---- 7. test yardımcısı ----------------------------------------------------------------------------------------------------
{
  const stray = appSource.split("\n").filter((l) => /^(import|export)\b/.test(l));
  check("test/uygulama_kaynagi.mjs: birleşik appSource'ta import/export satırı kalmıyor", stray.length === 0, stray.slice(0, 3).join(" | "));
  const allDecl = [];
  for (const f of APP_MODULES) {
    if (f === "app.js") continue;
    for (const m of (SRC[f] || "").matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) allDecl.push(m[1]); // eksik dosya: 1. denetim bildirir
  }
  const absent = allDecl.filter((nm) => !new RegExp(`function\\s+${nm}\\s*\\(`).test(appSource));
  check(`test/uygulama_kaynagi.mjs: appSource, modüllerdeki ${allDecl.length} üst düzey işlev bildiriminin hepsini içeriyor`, absent.length === 0 && allDecl.length > 100, absent.join(", "));
}

// ---- 8. belge ---------------------------------------------------------------------------------------------------------------
{
  const dev = fs.existsSync(path.join(ROOT, "GELISTIRICI.md")) ? fs.readFileSync(path.join(ROOT, "GELISTIRICI.md"), "utf8") : "";
  const lines = dev.split("\n");
  const start = lines.findIndex((l) => /^## Modül haritası\s*$/.test(l));
  check('GELISTIRICI.md: "## Modül haritası" bölümü var', start >= 0);
  if (start >= 0) {
    const next = lines.findIndex((l, i) => i > start && /^## /.test(l));
    const section = lines.slice(start, next < 0 ? undefined : next).join("\n");
    const unmentioned = APP_MODULES.filter((f) => !section.includes(f));
    check(`GELISTIRICI.md "Modül haritası": her uygulama modülü anılıyor (anılmayan: ${unmentioned.join(", ") || "yok"})`, unmentioned.length === 0, "bölüme modülün ne yaptığını anlatan bir satır ekleyin");
    check('GELISTIRICI.md "Modül haritası": çevrimsel içe aktarma kuralı ve bu test anlatılıyor', /çevrimsel/i.test(section) && /modul_siniri_test\.mjs/.test(section) && /uygulama_kaynagi\.mjs/.test(section));
  }
}

// ---- 5. çalışma zamanı: her uygulama modülü İLK modül olarak içe aktarılabiliyor -----------------------------------------------
// Çocuk süreç: jsdom'da gerçek index.html, tarayıcı küreselleri (window/document/navigator/location/localStorage), asılı kalan
// fetch ve HarfBuzz yükleyicisi (app.js'in main()'i verileri beklerken bekler; hata yazmaz), sonra modülü içe aktarır.
const CHILD = `
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { JSDOM } = await import("jsdom");
const [rootDir, entry] = process.argv.slice(1);
const html = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
const dom = new JSDOM(html, { url: "http://localhost/", pretendToBeVisual: true });
const w = dom.window;
const def = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
def("window", w);
def("document", w.document);
def("navigator", w.navigator);
def("location", w.location);
def("localStorage", w.localStorage);
def("fetch", () => new Promise(() => {}));
w.createHarfBuzz = () => new Promise(() => {});
process.on("unhandledRejection", (e) => { console.error("YAKALANMAYAN RED:", (e && e.stack) || e); process.exit(2); });
try {
  await import(pathToFileURL(path.join(rootDir, "js", entry)).href);
} catch (e) {
  console.error("İÇE AKTARMA HATASI:", (e && e.stack) || e);
  process.exit(1);
}
await new Promise((r) => setTimeout(r, 30));
console.log("TAMAM " + entry);
process.exit(0);
`;

function importInChild(entry) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", CHILD, ROOT, entry], { cwd: TEST_DIR, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 90_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ entry, code, signal, out: out.trim() });
    });
  });
}

{
  const queue = [...APP_MODULES];
  const results = [];
  const worker = async () => {
    while (queue.length) results.push(await importInChild(queue.shift()));
  };
  await Promise.all([worker(), worker()]);
  results.sort((a, b) => APP_MODULES.indexOf(a.entry) - APP_MODULES.indexOf(b.entry));
  for (const r of results) {
    check(`çalışma zamanı: ${r.entry} İLK modül olarak içe aktarılabiliyor (jsdom, ayrı süreç)`, r.code === 0 && r.out.includes(`TAMAM ${r.entry}`), `çıkış ${r.code}${r.signal ? "/" + r.signal : ""}: ${r.out.split("\n").slice(0, 6).join(" ¶ ")}`);
  }
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log(`All checks passed (modül sınırı: js/ ${FILES.length} dosya = ${APP_MODULES.length} uygulama + ${LIBRARY_MODULES.length} kütüphane modülü, ${edgeCount} içe aktarma bağlantısı hepsi var olan adlara gidiyor, ölü ihraç/yön ihlali/eksik import yok; ${cyclicCount} modüllük çevrimsel grup notlu; her uygulama modülü tek başına ilk modül olarak içe aktarılabiliyor; escapeHtml tek kopya; ${checks} kontrol). NOT: yapısal kontroller ve Node+jsdom'da modül yükleme -- gerçek tarayıcıda açılışın ve ekran okuyucu testinin yerini tutmaz.`);
}
