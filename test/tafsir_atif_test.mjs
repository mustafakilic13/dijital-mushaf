// QuranEnc.com atfı: Sa'dî tefsirinin Türkçe metninin kaynağına atıf. Regresyon kontrolü.
//
// Neden var: data/tafsir-saadi.json'un Türkçe metni QuranEnc.com'dan (Kur'an-ı Kerim Ansiklopedisi). Sitenin yeniden yayım
// şartları (https://quranenc.com/tr/home/about ve https://quranenc.com/en/home/api; 2026-11-14'te okundu): içerik DEĞİŞTİRİLMEDEN,
// yayıncıya ve kaynağa (QuranEnc.com) AÇIKÇA atıfla ve yeniden yayımda SÜRÜM numarası belirtilerek gösterilebilir. Atıf yalnızca
// belgelerdeydi (VERI_KAYNAKLARI.md, README.md); uygulama metni atıfsız gösteriyordu. Şimdi aynı satır iki yerde görünüyor:
//   - ayet panelinde, tefsir metninin hemen ALTINDA (js/app.js tafsirContentHTML); metin yoksa ("bulunamadı", "yakında eklenecek",
//     veri yüklenmemiş) atıf da yok; panel kapanınca metinle birlikte DOM'dan kalkıyor (.wm-tafsir-content'in içinde);
//   - arama sonuçlarında, "Tefsir (Sa'dî)" bölümünün başında (js/arama.js; satırlardaki özetler bu metinden);
// ve satırı tek bir yer üretiyor: js/tafsir.js tafsirCreditHTML (kredi verisi aynı dosyada, kaynak tanımında).
//
// Burada kontrol edilenler:
//   (1) kredi verisi + üretilen satır: ad (QuranEnc.com), https://quranenc.com altında bağlantı, sürüm numarası, görünen cümle, bağlantının
//       target/rel öznitelikleri, kopya dönmesi, bilinmeyen kaynak, değerlerin kaçışlanması (kaynak), her kaynağın atfı olması;
//   (2) panel: app.js'ten çıkarılan GERÇEK tafsirContentHTML x GERÇEK tafsir.js x GERÇEK data/tafsir-saadi.json: verideki 6236 ayetin
//       HEPSİ için içerik == (metin varsa) metin + atıf, (yoksa) "bulunamadı" ve atıf YOK; metin BİR BİT değişmiyor (atıf satırı
//       çıkarılınca ham metin); 1739 farklı metnin hepsinde atıf DOM'da üst düzey kardeş (açık kalmış bir etikete düşmüyor, metnin
//       ayrıştırılması değişmiyor); "yakında eklenecek" ve veri yok yollarında atıf yok;
//   (3) kablolama (kaynak): app.js yalnızca tafsirContentHTML'in metin dalında kullanıyor; arama.js yalnızca tefsir bölümüne
//       veriyor ve bölüm başında (not'tan önce) basıyor; iki dosyadaki kaynak kimliği aynı;
//   (4) arama: GERÇEK index.html x GERÇEK js/arama.js x GERÇEK meal/konu/tefsir verisi, jsdom'da: tefsir yüklenmeden / yüklenirken /
//       yüklenemeyince atıf YOK; yüklenince "Tefsir (Sa'dî)" bölümünde tam bir tane, başlığın hemen altında; diğer bölümlerde YOK;
//       "Tümünü gör"/"Daralt" sonrası da tek; tefsirde hiç sonuç yoksa atıf yok;
//   (5) CSS: atıf satırının biçimi var, gizlenmemiş (display/visibility/opacity/boyut), işaretlemedeki sınıf CSS'tekiyle aynı.
// (Renk kontrastı test/erisilebilirlik_test.mjs'te, CSS'in kendisinden hesaplanıyor.)
//
// SINIRLAR: jsdom'da düzen/çizim ve erişilebilirlik ağacı yok; burada işaretleme, metin ve öznitelikler kontrol ediliyor. Satırın
// ekranda göründüğü, gerçek tarayıcıda taşmadığı ve bağlantının yeni sekmede açıldığı gerçek tarayıcıda denenmedi (bu sandbox'tan
// canlı site ve quranenc.com'a erişilemiyor). Gerçek ekran okuyucu (NVDA/JAWS/VoiceOver/TalkBack) çalıştırılmadı: atıf, panelin
// aria-live="polite" gövdesinde metinle birlikte yazıldığından duyuruya karışıyor; nasıl okunduğu bilinmiyor.
//
//   node tafsir_atif_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM, VirtualConsole } from "jsdom";
import { tafsirSourceIds, tafsirSourceCredit, tafsirCreditHTML, tafsirSourceLabel, isTafsirSourceAvailable, resolveTafsirText } from "../js/tafsir.js";
import { setupArama, DEBOUNCE_MS } from "../js/arama.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const appSource = readText("js", "app.js");
const aramaSource = readText("js", "arama.js");
const tafsirSource = readText("js", "tafsir.js");
const css = readText("css", "style.css");
const indexHtml = readText("index.html");
// Satır sonu yorumları atılmış kaynak (yorumlarda geçen ad sayıma karışmasın).
const noComments = (src) => src.replace(/\/\/[^\n]*/g, "");

let failures = 0;
let checks = 0;
function check(name, cond, detail) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
    if (detail !== undefined) console.error(`      ${String(detail).slice(0, 400)}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, timeout = 6000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error("waitFor: zaman aşımı");
    await sleep(20);
  }
}
const ok = (v) => () => Promise.resolve(v);

// Bir HTML parçasını (yalnızca belge gövdesi olarak) ayrıştırıp kapsayıcıyı döndürür.
const SCRATCH = new JSDOM("<!DOCTYPE html><html lang=\"tr\"><body></body></html>").window.document;
function parse(html) {
  const div = SCRATCH.createElement("div");
  div.innerHTML = html;
  return div;
}

// Bir işlevin kaynağı (süslü parantezleri sayarak; şablon dizgelerindeki ${...} dengeli).
function fnSource(source, name) {
  const m = new RegExp(`(?:export )?(?:async )?function ${name}\\(`).exec(source);
  if (!m) return null;
  const open = source.indexOf("{", source.indexOf(")", m.index));
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(m.index, i + 1);
  }
  return null;
}

// -- 1. kredi verisi ve üretilen satır ------------------------------------------------------------------------
const CREDIT = tafsirSourceCredit("saadi");
const CREDIT_HTML = tafsirCreditHTML("saadi");
const SENTENCE = CREDIT ? `Türkçe çeviri: ${CREDIT.name} (${CREDIT.description}), sürüm ${CREDIT.version}.` : "";
{
  const ids = tafsirSourceIds();
  check("kaynak listesi boş değil ve 'saadi' içinde", ids.length >= 1 && ids.includes("saadi"));
  check("her tefsir kaynağının atıf bilgisi var (kaynak eklenirken atfı da eklenmeli)", ids.every((id) => !!tafsirSourceCredit(id)), ids.filter((id) => !tafsirSourceCredit(id)).join(", "));
  check("Sa'dî kaynağının atıf bilgisi var", !!CREDIT);
  check("atıf: yayıncı/kaynak adı QuranEnc.com (QuranEnc şartı: yayıncıya ve kaynağa açık atıf)", !!CREDIT && CREDIT.name === "QuranEnc.com");
  check("atıf: açıklama dolu (Kur'an-ı Kerim Ansiklopedisi)", !!CREDIT && CREDIT.description === "Kur'an-ı Kerim Ansiklopedisi");
  let url = null;
  try {
    url = new URL(CREDIT.url);
  } catch {
    // aşağıdaki denetim başarısız olur
  }
  check("atıf: bağlantı https://quranenc.com altında, çevirinin kendi sayfası (/tr/browse/turkish_saadi)", !!url && url.protocol === "https:" && url.hostname === "quranenc.com" && url.pathname === "/tr/browse/turkish_saadi", CREDIT && CREDIT.url);
  check("atıf: sürüm numarası var, V<ana>.<alt>.<yama> biçiminde (QuranEnc şartı: yeniden yayımda sürüm numarası)", !!CREDIT && /^V\d+\.\d+\.\d+$/.test(CREDIT.version), CREDIT && CREDIT.version);
  check("atıf: tafsirSourceCredit bilgiyi kopya olarak veriyor (çağıran sabiti değiştiremez)", (() => {
    const c = tafsirSourceCredit("saadi");
    c.name = "değişti";
    c.url = "https://example.invalid/";
    const again = tafsirSourceCredit("saadi");
    return again.name === CREDIT.name && again.url === CREDIT.url && tafsirCreditHTML("saadi") === CREDIT_HTML;
  })());
  check("atıf: bilinmeyen kaynak için null ve boş satır", tafsirSourceCredit("yok") === null && tafsirCreditHTML("yok") === "" && tafsirSourceCredit(undefined) === null);

  const box = parse(CREDIT_HTML);
  const p = box.firstElementChild;
  check("satır: tek bir <p class=\"tafsir-kaynak\"> (başka üst düzey öğe/metin yok)", box.children.length === 1 && !!p && p.tagName === "P" && p.className === "tafsir-kaynak" && box.childNodes.length === 1);
  check("satır: içinde yalnızca tek bir öğe var (bağlantı); betik/resim/başka işaretleme yok", !!p && p.querySelectorAll("*").length === 1 && p.querySelectorAll("a").length === 1);
  check("satır: <p> yalnızca class özniteliği taşıyor (hidden / aria-hidden / style / lang / role yok: atıf ne ekrandan ne ekran okuyucudan saklanıyor)", !!p && [...p.attributes].map((x) => x.name).join() === "class");
  const a = p && p.querySelector("a");
  check("satır: bağlantının öznitelikleri tam olarak href, rel, target (tabindex=-1 / aria-hidden / style / download yok: klavyeyle ve ekran okuyucuyla erişilebilir)", !!a && [...a.attributes].map((x) => x.name).sort().join() === "href,rel,target");
  check("satır: bağlantı kredideki adrese gidiyor", !!a && a.getAttribute("href") === (CREDIT && CREDIT.url));
  check("satır: bağlantı yeni sekmede açılıyor (target=_blank) ve rel noopener + noreferrer taşıyor", !!a && a.getAttribute("target") === "_blank" && new Set((a.getAttribute("rel") || "").split(/\s+/)).has("noopener") && new Set((a.getAttribute("rel") || "").split(/\s+/)).has("noreferrer"));
  check("satır: bağlantının görünen metni kaynak adı (QuranEnc.com)", !!a && a.textContent === (CREDIT && CREDIT.name));
  check("satır: görünen cümle tam olarak 'Türkçe çeviri: QuranEnc.com (Kur'an-ı Kerim Ansiklopedisi), sürüm V…'", !!p && p.textContent === SENTENCE, p && p.textContent);
  check("satır: yayıncı/kaynak adı da sürüm numarası da görünen metinde", !!p && !!CREDIT && p.textContent.includes(CREDIT.name) && p.textContent.includes(CREDIT.version));

  const credSrc = fnSource(tafsirSource, "tafsirCreditHTML");
  check("tafsir.js: tafsirCreditHTML bulundu", !!credSrc);
  for (const f of ["url", "name", "description", "version"]) {
    check(`tafsir.js: tafsirCreditHTML credit.${f} değerini escapeHtml'den geçiriyor (HTML'e kaçışsız girmiyor)`, !!credSrc && credSrc.includes(`escapeHtml(credit.${f})`));
  }
  check("tafsir.js: escapeHtml tek bir yerden (./search.js) alınıyor (yeni bir kopya yok)", /import \{ escapeHtml \} from "\.\/search\.js";/.test(tafsirSource) && !/function escapeHtml/.test(tafsirSource));
}

// -- 2. ayet paneli: GERÇEK tafsirContentHTML x gerçek veri ------------------------------------------------------
const DATA = JSON.parse(readText("data", "tafsir-saadi.json"));
const NOT_FOUND_HTML = `<p class="word-meal-loading">Bu ayet için tefsir bulunamadı.</p>`;
const escSrc = fnSource(appSource, "escapeHtml");
const contentSrc = fnSource(appSource, "tafsirContentHTML");
check("app.js: escapeHtml ve tafsirContentHTML bulundu", !!escSrc && !!contentSrc);
if (!escSrc || !contentSrc) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
const makeContent = ({ available = (id) => id === "saadi", data = DATA } = {}) =>
  new Function(
    "isTafsirSourceAvailable",
    "tafsirSourceLabel",
    "getCachedTafsirData",
    "resolveTafsirText",
    "tafsirCreditHTML",
    `${escSrc}\n${contentSrc}\nreturn tafsirContentHTML;`
  )(available, tafsirSourceLabel, () => data, resolveTafsirText, tafsirCreditHTML);
{
  const content = makeContent();
  // 2.1 verideki HER ayet: metin varsa metin + atıf; yoksa "bulunamadı" (atıfsız)
  let withText = 0;
  let without = 0;
  let wrong = [];
  const textAnchors = new Map(); // farklı metin -> ilk ayeti
  for (const key of Object.keys(DATA)) {
    const [s, a] = key.split(":").map(Number);
    const got = content("saadi", { surah: s, ayah: a });
    const text = resolveTafsirText(DATA, s, a);
    if (text) {
      withText++;
      if (got !== text + CREDIT_HTML) wrong.push(`${key} (metinli)`);
      if (!textAnchors.has(text)) textAnchors.set(text, key);
    } else {
      without++;
      if (got !== NOT_FOUND_HTML) wrong.push(`${key} (metinsiz)`);
    }
  }
  check(`veri: ${Object.keys(DATA).length} ayetin hepsi sınandı (6236 anahtar)`, Object.keys(DATA).length === 6236);
  check(`panel: verideki her ayette içerik == (metin varsa) metin + atıf, (yoksa) "bulunamadı" (yanlış: ${wrong.length}; metinli ${withText}, metinsiz ${without})`, wrong.length === 0 && withText > 6000, wrong.slice(0, 5).join(", "));
  check("panel: metni olmayan ayette (bulunamadı) atıf satırı YOK", !content("saadi", { surah: 999, ayah: 1 }).includes("tafsir-kaynak") && content("saadi", { surah: 999, ayah: 1 }) === NOT_FOUND_HTML);
  check(`veri: farklı metin sayısı 1739 (her biri DOM'da ayrıca sınanacak): ${textAnchors.size}`, textAnchors.size === 1739);

  // 2.2 metnin KENDİSİ değişmiyor ve atıf, metnin ayrıştırılmasını bozmuyor: 1739 farklı metnin hepsinde atıf üst düzey son kardeş
  let notLast = 0;
  let parseChanged = 0;
  let more = 0;
  for (const [text, key] of textAnchors) {
    const [s, a] = key.split(":").map(Number);
    const full = parse(content("saadi", { surah: s, ayah: a }));
    const last = full.lastElementChild;
    const credits = full.querySelectorAll(".tafsir-kaynak");
    if (!last || !last.classList.contains("tafsir-kaynak") || last.parentNode !== full) notLast++;
    if (credits.length !== 1) more++;
    // atıf çıkarılınca kalan, yalnızca metnin ayrıştırılmış hâliyle birebir aynı olmalı
    if (last && last.classList.contains("tafsir-kaynak")) last.remove();
    if (full.innerHTML !== parse(text).innerHTML) parseChanged++;
  }
  check(`panel: 1739 metnin hepsinde atıf ÜST DÜZEY son kardeş (açık kalmış bir etikete düşen: ${notLast})`, notLast === 0);
  check(`panel: 1739 metnin hepsinde tam bir atıf satırı (fazla/eksik: ${more})`, more === 0);
  check(`panel: atıf çıkarılınca kalan DOM, metnin kendi DOM'uyla birebir aynı (metin değişmiyor; farklı: ${parseChanged})`, parseChanged === 0);

  // 2.3 2:255 örneği (en uzun/Ayetü'l-Kürsî) açıkça
  const k = content("saadi", { surah: 2, ayah: 255 });
  const text255 = resolveTafsirText(DATA, 2, 255);
  check("panel: 2:255 içeriği metin + atıf (atıf sonda, ham metin başta, birebir)", !!text255 && k.startsWith(text255) && k.slice(text255.length) === CREDIT_HTML);
  check("panel: yönlendirmeli ayet (1:7 -> 1:1) çapayla aynı metni ve aynı atfı gösteriyor", DATA["1:7"] === "1:1" && content("saadi", { surah: 1, ayah: 7 }) === content("saadi", { surah: 1, ayah: 1 }) && content("saadi", { surah: 1, ayah: 7 }).endsWith(CREDIT_HTML));

  // 2.4 metin olmayan yollar
  const noData = makeContent({ data: null });
  const pending = noData("saadi", { surah: 2, ayah: 255 });
  check("panel: veri henüz yüklenmemişse (önbellek boş) 'bulunamadı' ve atıf YOK", pending === NOT_FOUND_HTML && !pending.includes("QuranEnc"));
  const soon = makeContent({ available: () => false })("saadi", { surah: 2, ayah: 255 });
  check("panel: kaynak henüz yoksa ('yakında eklenecek') atıf YOK", /yakında eklenecek/.test(soon) && !soon.includes("tafsir-kaynak") && !soon.includes("QuranEnc"), soon);
  const brokenData = makeContent({ data: { "2:255": { text: "" } } })("saadi", { surah: 2, ayah: 255 });
  check("panel: metni boş girdide 'bulunamadı' ve atıf YOK", brokenData === NOT_FOUND_HTML);
}

// -- 3. kablolama (kaynak) --------------------------------------------------------------------------------------
{
  check("app.js: tafsirCreditHTML ./tafsir.js'ten alınıyor", /import \{[^}]*\btafsirCreditHTML\b[^}]*\} from "\.\/tafsir\.js";/.test(appSource));
  check("app.js: atıf yalnızca iki yerde geçiyor (içe aktarma + tafsirContentHTML'in metin dalı)", (noComments(appSource).match(/tafsirCreditHTML/g) || []).length === 2);
  check("app.js: tafsirContentHTML atfı yalnızca METİN varken ekliyor (return text ? text + tafsirCreditHTML(sourceId) : bulunamadı)", /return text \? text \+ tafsirCreditHTML\(sourceId\) : `<p class="word-meal-loading">Bu ayet için tefsir bulunamadı\.<\/p>`;/.test(contentSrc || ""));
  check("app.js: atıf .wm-tafsir-content'in DIŞINDA ayrıca yazılmıyor (kapanınca metinle birlikte kalksın)", !/tafsir-kaynak/.test(appSource) && !/wm-tafsir-credit/.test(appSource));

  check("arama.js: tafsirCreditHTML ./tafsir.js'ten alınıyor", /import \{[^}]*\btafsirCreditHTML\b[^}]*\} from "\.\/tafsir\.js";/.test(aramaSource));
  check("arama.js: atıf yalnızca iki yerde üretiliyor (içe aktarma + tefsir bölümü nesnesi)", (noComments(aramaSource).match(/tafsirCreditHTML/g) || []).length === 2);
  const tafsirSection = /sections\.push\(\{\s*key: "tafsir",[\s\S]*?\}\);/.exec(aramaSource);
  check("arama.js: atıf yalnızca 'tafsir' bölümü nesnesinde (credit: tafsirCreditHTML(TAFSIR_SOURCE_ID))", !!tafsirSection && /credit: tafsirCreditHTML\(TAFSIR_SOURCE_ID\)/.test(tafsirSection[0]) && (noComments(aramaSource).match(/credit: /g) || []).length === 1);
  const sectionHtml = fnSource(aramaSource, "sectionHTML");
  check("arama.js: sectionHTML atfı başlığın hemen ardından, not'tan ÖNCE, satırlardan önce basıyor", !!sectionHtml && sectionHtml.indexOf("sectionHead(") < sectionHtml.indexOf("sec.credit") && sectionHtml.indexOf("sec.credit") < sectionHtml.indexOf("sec.note") && sectionHtml.indexOf("sec.note") < sectionHtml.indexOf("sec.row("));
  const idArama = /const TAFSIR_SOURCE_ID = "([\w-]+)";/.exec(aramaSource);
  const idApp = /loadTafsirData: \(\) => loadTafsirData\("([\w-]+)"\)/.exec(appSource);
  check("kaynak kimliği: arama.js'in TAFSIR_SOURCE_ID'si, app.js'in aramaya bağladığı loadTafsirData kimliğiyle aynı", !!idArama && !!idApp && idArama[1] === idApp[1] && idArama[1] === "saadi", `${idArama && idArama[1]} / ${idApp && idApp[1]}`);
  check("kaynak kimliği: o kimlik gerçekten tafsir.js'te tanımlı ve atfı var", !!idArama && tafsirSourceIds().includes(idArama[1]) && !!tafsirSourceCredit(idArama[1]));
  check("arama.js: tefsir özetinin metni yine yalnızca markTafsirLanguages(snippetHTML(...)) ile kuruluyor (atıf özete karışmıyor)", /<span class="arama-snippet">\$\{markTafsirLanguages\(snippetHTML\(plain, terms, \{ maxLen: 260, lead: 80 \}\)\)\}<\/span>/.test(aramaSource));
}

// -- 4. arama sonuçları: gerçek index.html x gerçek arama.js x gerçek veri ----------------------------------------
const surahs = JSON.parse(readText("data", "surahs.json"));
const meal = JSON.parse(readText("data", "meal.json"));
const topicsData = JSON.parse(readText("data", "topics-tr.json"));
const TAFSIR_TITLE = "Tefsir (Sa'dî)";

function makeEnv({ loadTafsir, loadTopics } = {}) {
  const dom = new JSDOM(indexHtml, { url: "http://localhost/", pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const { window } = dom;
  const doc = window.document;
  const modal = doc.getElementById("arama-modal");
  const openBtn = doc.getElementById("arama-btn");
  const calls = [];
  const env = {
    window,
    modal,
    openBtn,
    calls,
    input: modal.querySelector(".arama-input"),
    body: modal.querySelector(".arama-body"),
    tafsirLoads: 0,
  };
  setupArama({
    modal,
    openBtn,
    getSurahs: () => surahs,
    openModal: (onOpen) => {
      modal.hidden = false;
      if (onOpen) onOpen();
    },
    closeModal: () => {
      modal.hidden = true;
    },
    nav: {
      goToAyah: (s, a) => calls.push(["ayah", s, a]),
      goToSurah: (s) => calls.push(["surah", s]),
      goToJuz: (n) => calls.push(["juz", n]),
      goToPage: (n) => calls.push(["page", n]),
      openTopic: (id) => calls.push(["topic", id]),
    },
    loadMealData: ok(meal),
    loadTopicsData: loadTopics || ok(topicsData),
    loadWordMealData: ok({}),
    ayahRawWords: () => [],
    ayahArabicText: () => "",
    loadTafsirData: () => {
      env.tafsirLoads++;
      return loadTafsir();
    },
    storage: window.localStorage,
  });
  env.type = async (text) => {
    env.input.value = text;
    env.input.dispatchEvent(new window.Event("input", { bubbles: true }));
    await sleep(DEBOUNCE_MS + 120);
  };
  env.heads = () => [...env.body.querySelectorAll(".arama-section-head")];
  env.sections = () => env.heads().map((h) => h.querySelector(".arama-section-title").textContent);
  // Bir bölümün başlığından sonraki (sonraki başlığa kadar) öğeler.
  env.sectionEls = (title) => {
    const head = env.heads().find((h) => h.querySelector(".arama-section-title").textContent === title);
    const out = [];
    if (!head) return out;
    for (let n = head.nextElementSibling; n && !n.classList.contains("arama-section-head"); n = n.nextElementSibling) out.push(n);
    return out;
  };
  env.credits = () => [...env.body.querySelectorAll(".tafsir-kaynak")];
  env.tafsirBtn = () => env.body.querySelector('[data-act="tafsir-load"]');
  env.tafsirRows = () => env.sectionEls(TAFSIR_TITLE).filter((x) => x.matches('[data-act="go-ayah"]'));
  env.tafsirReady = () => env.tafsirRows().length > 0 || (env.sections().includes(TAFSIR_TITLE) && !/Tefsir yükleniyor/.test(env.body.textContent));
  return env;
}

{
  // 4.1 asıl senaryo: "sabır" (Konular + Ayetler + Tefsir): tefsir yüklenmeden/yüklenirken atıf yok, yüklenince tefsir bölümünde tek
  const e = makeEnv({ loadTafsir: ok(DATA) });
  e.openBtn.click();
  await e.type("sabır");
  check("arama: tefsir yüklenmeden önce hiçbir bölümde atıf satırı yok (gösterilen tefsir metni yok)", e.credits().length === 0 && !e.sections().includes(TAFSIR_TITLE));
  check("arama: tefsir yüklenmeden önce diğer bölümler var (kontrol vakumlu değil: Ayetler + Konular)", e.sections().includes("Ayetler") && e.sections().includes("Konular"), e.sections().join(" | "));
  const btn = e.tafsirBtn();
  check("arama: 'Sa'dî tefsirinde de ara' düğmesi var", !!btn);
  btn.click();
  check("arama: tefsir YÜKLENİRKEN ('Tefsir yükleniyor' notu) atıf yok", /Tefsir yükleniyor/.test(e.body.textContent) && e.credits().length === 0);
  await waitFor(() => e.tafsirReady());
  const credits = e.credits();
  check("arama: tefsir yüklenince sayfada TAM BİR atıf satırı var", credits.length === 1, credits.length);
  const section = e.sectionEls(TAFSIR_TITLE);
  check("arama: 'Tefsir (Sa'dî)' bölümü sonuçlarla geldi (satır var)", e.tafsirRows().length >= 3, e.tafsirRows().length);
  check("arama: atıf satırı Tefsir bölümünün İÇİNDE ve başlığın HEMEN altında (ilk öğe), satırlardan önce", section.length > 1 && section[0] === credits[0] && section[0].matches("p.tafsir-kaynak") && e.tafsirRows()[0] === section[1]);
  check("arama: atıf satırı panelindekiyle birebir aynı işaretleme (tafsirCreditHTML)", credits[0].outerHTML === parse(CREDIT_HTML).firstElementChild.outerHTML);
  const a = credits[0].querySelector("a");
  check("arama: atıf bağlantısı kredi adresine, yeni sekmede, noopener noreferrer ile", !!a && a.getAttribute("href") === CREDIT.url && a.getAttribute("target") === "_blank" && /noopener/.test(a.getAttribute("rel")) && /noreferrer/.test(a.getAttribute("rel")));
  check("arama: atıf metni yayıncıyı ve sürümü söylüyor", credits[0].textContent === SENTENCE);
  const others = e.sections().filter((t) => t !== TAFSIR_TITLE);
  check("arama: diğer bölümlerin hiçbirinde atıf yok (yalnızca QuranEnc'ten gelen metnin bölümünde)", others.length >= 2 && others.every((t) => !e.sectionEls(t).some((el) => el.matches(".tafsir-kaynak") || el.querySelector(".tafsir-kaynak"))), others.join(" | "));
  check("arama: atıf bir sonuç satırının (düğme) içinde değil, tıklanabilir bir satıra dönüşmüyor", !credits[0].closest("[data-act]") && !credits[0].querySelector("[data-act]"));

  // tıklama bağlantıyı yutmuyor: "[data-act]" olmayan öğeye tıklanınca arama modalı hiçbir şey yapmıyor (gezinme yok, modal açık)
  const before = e.calls.length;
  const click = new e.window.MouseEvent("click", { bubbles: true, cancelable: true });
  a.dispatchEvent(click);
  check("arama: atıf bağlantısına tıklamak aramada gezinme/kapanma tetiklemiyor", e.calls.length === before && !e.modal.hidden);
  check("arama: arama modalı bağlantının varsayılan davranışını ENGELLEMİYOR (tıklama iptal edilmedi: bağlantı açılabilir)", click.defaultPrevented === false);

  // 4.2 "Tümünü gör" / "Daralt": bölüm yeniden çizilse de atıf tek ve başlığın altında
  const expand = e.body.querySelector('[data-act="expand"][data-key="tafsir"]');
  check("arama: tefsir bölümünde 'Tümünü gör' düğmesi var (sonuç sayısı önizlemeden fazla)", !!expand);
  if (expand) {
    expand.click();
    await sleep(40);
    check("arama: 'Tümünü gör' sonrası da tek atıf satırı, yine başlığın hemen altında", e.credits().length === 1 && e.sectionEls(TAFSIR_TITLE)[0] === e.credits()[0]);
    const collapse = e.body.querySelector('[data-act="collapse"][data-key="tafsir"]');
    check("arama: açık bölümde 'Daralt' düğmesi var", !!collapse);
    if (collapse) {
      collapse.click();
      await sleep(40);
      check("arama: 'Daralt' sonrası da tek atıf satırı", e.credits().length === 1 && e.sectionEls(TAFSIR_TITLE)[0] === e.credits()[0]);
    }
  }

  // 4.3 başka sorgu: tefsir oturum boyunca açık; atıf yine tek ve yine tefsir bölümünde
  await e.type("namaz");
  check("arama: başka sorguda da (tefsir açık) tek atıf satırı, tefsir bölümünün başında", e.credits().length === 1 && e.sectionEls(TAFSIR_TITLE)[0] === e.credits()[0]);
  check("arama: tefsir tek kez yüklendi", e.tafsirLoads === 1);
  e.window.close();
}
{
  // 4.4 tefsir yüklenemezse: hata notu var, atıf yok
  const e = makeEnv({ loadTafsir: () => Promise.reject(new Error("ağ yok")) });
  e.openBtn.click();
  await e.type("sabır");
  e.tafsirBtn().click();
  await sleep(80);
  check("arama: tefsir yüklenemeyince hata notu görünüyor ve atıf satırı YOK", /Tefsir yüklenemedi/.test(e.body.textContent) && e.credits().length === 0);
  e.window.close();
}
{
  // 4.5 tefsirde hiç sonuç yoksa (sorgu mealde var, tefsir verisinde yok) gösterilen tefsir metni de yok: atıf yok
  const e = makeEnv({ loadTafsir: ok({ "1:1": { text: "<p>Rahmân ve Rahîm Allah'ın adı ile.</p>" } }), loadTopics: ok([]) });
  e.openBtn.click();
  await e.type("sabır");
  e.tafsirBtn().click();
  await sleep(300);
  check("arama: tefsirde sonuç yoksa tefsir bölümü de atıf satırı da yok (ama meal sonuçları duruyor)", !e.sections().includes(TAFSIR_TITLE) && e.credits().length === 0 && e.sections().includes("Ayetler"), e.sections().join(" | "));
  e.window.close();
}

// -- 5. CSS ------------------------------------------------------------------------------------------------------
{
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selectors: m[1].split(",").map((x) => x.trim().replace(/\s+/g, " ")), decls: m[2] }));
  const decl = (selector) => {
    const out = {};
    for (const r of rules) {
      if (!r.selectors.includes(selector)) continue;
      for (const m of r.decls.matchAll(/(?:^|;)\s*([a-z-]+)\s*:\s*([^;]+)/g)) out[m[1]] = m[2].trim();
    }
    return out;
  };
  const markupClass = /<p class="([\w-]+)">/.exec(CREDIT_HTML);
  check("CSS: işaretlemedeki sınıf (tafsir.js) 'tafsir-kaynak'", !!markupClass && markupClass[1] === "tafsir-kaynak");
  const base = decl(".tafsir-kaynak");
  check("CSS: .tafsir-kaynak kuralı var (yazı rengi --ink-soft, 12 px ve üstü, satır aralığı tanımlı)", base.color === "var(--ink-soft)" && parseFloat(base["font-size"]) >= 12 && !!base["line-height"], JSON.stringify(base));
  const link = decl(".tafsir-kaynak a");
  check("CSS: .tafsir-kaynak a: bağlantı rengi --emerald-deep ve ALTI ÇİZİLİ (renge bağlı kalmadan ayırt ediliyor)", link.color === "var(--emerald-deep)" && link["text-decoration"] === "underline", JSON.stringify(link));
  const focus = decl(".tafsir-kaynak a:focus-visible");
  check("CSS: bağlantının odak halkası var (2px --gold, outline: none değil)", /^2px solid var\(--gold\)$/.test(focus.outline || ""), JSON.stringify(focus));
  const inPanel = decl(".wm-tafsir-content .tafsir-kaynak");
  check("CSS: panelde atıf metinden ayrık (üst boşluk 14px, üstte çizgi) ve alta boşluk yok", /^14px 0 0$/.test(inPanel.margin || "") && /^1px solid /.test(inPanel["border-top"] || ""), JSON.stringify(inPanel));
  const inSearch = decl(".arama-body .tafsir-kaynak");
  check("CSS: arama sonuçlarında atıf satırı .arama-note ile aynı yan boşluklarda (6px 10px)", inSearch.margin === "6px 10px", JSON.stringify(inSearch));
  // gizlenmemiş: atıfı görünmez yapan hiçbir bildirim yok (CSS'te .tafsir-kaynak geçen tüm kurallar)
  const hiding = /display\s*:\s*none|visibility\s*:|opacity\s*:|height\s*:\s*0|max-height|clip|text-indent|font-size\s*:\s*0|left\s*:\s*-|position\s*:\s*absolute|overflow\s*:\s*hidden/;
  const related = rules.filter((r) => r.selectors.some((s) => /tafsir-kaynak/.test(s)));
  check("CSS: .tafsir-kaynak geçen kurallar bulundu (taban, bağlantı, odak, panel, arama: en az 5; gizleme denetimi vakumlu değil)", related.length >= 5, related.map((r) => r.selectors.join(", ")).join(" | "));
  check("CSS: atıf satırını gizleyen/kırpan/ekran dışına iten hiçbir bildirim yok", related.length > 0 && related.every((r) => !hiding.test(r.decls)), related.filter((r) => hiding.test(r.decls)).map((r) => r.selectors.join(", ")).join(" | "));
  check("CSS: genel [hidden] kuralı dışında atıf sınıfına bağlı bir gizleme yok (.tafsir-kaynak[hidden] vb.)", !/tafsir-kaynak[^{]*\[hidden\]/.test(stripped));
  // işaretleme: index.html'de atıf için sabit (statik) bir kopya yok; satır yalnızca çalışma anında, metinle birlikte geliyor
  check("index.html: atıf satırı statik olarak yazılmamış (yalnızca metin varken çalışma anında ekleniyor)", !/tafsir-kaynak|QuranEnc/.test(indexHtml));
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log(
  `All checks passed (QuranEnc atfı: kredi verisi ve satır, panelde verideki 6236 ayetin hepsi ve 1739 metnin DOM'u, kablolama, arama sonuçlarında tek atıf, CSS; ${checks} kontrol).`
);
