// Tefsir sekme düğmesinin ARIA durumu ve kapalı tefsir metni. Regresyon kontrolü.
//
// Neden var: Ayet panelinin Tefsir bölümündeki sekme düğmesi ("Tefsîr-i Sa'dî") açık/kapalı durumunu yalnızca GÖRSEL olarak (.active sınıfı)
// taşıyordu. Gerçek Chromium'da (CDP Accessibility.getFullAXTree; 430 px; sayfa 50, ayet gezgininden Enter ile açılan panel; sekmeye klavyeyle
// Enter), düzeltmeden ÖNCE:
//   - düğme erişilebilirlik ağacında yalnızca role=button, ad "Tefsîr-i Sa'dî"; `expanded` özelliği HİÇ yok (açıkken de kapalıyken de), DOM'da
//     hiçbir aria-* özniteliği yok: ekran okuyucu kullanıcısı düğmenin açık mı kapalı mı olduğunu düğmeden öğrenemiyordu (kapatınca canlı bölgeye
//     eklenen metin de 0 karakter: DOM düzeyinde ölçüldü, gerçek ekran okuyucuyla değil);
//   - kapatınca (panel yüksekliği 0) 3238 karakterlik metin DOM'da kalıyor, 3049 karakteri erişilebilirlik ağacında görünür (ignored=false):
//     düğme "kapalı" derken metin okunabiliyor;
//   - veri gelirken (tefsir dosyasının yanıtı yapay olarak 2,5 sn geciktirildi) açıp kapatınca kapalı panelde "Yükleniyor…" kalıyor (DOM'da da
//     ağaçta da) ve veri gelince de yerine bir şey yazılmıyor;
//   - aynı karede iki tıklama (aç + kapat, senkron `click(); click();`): sekme "etkin değil" olurken panel AÇIK (64 px) ve içeriği "Yükleniyor…"
//     olarak KALICI: panelin açılması bir kare sonra (requestAnimationFrame), sekmenin hâlâ etkin olup olmadığına bakılmadan yapılıyor.
// Düzeltmeden sonra aynı senaryolar: düğme expanded=false/true/false/true (DOM'da aria-expanded, ağaçta `expanded`), kapatınca metin DOM'da ve
// ağaçta 0 karakter, aynı karede çift tıklamada panel kapalı ve boş, veri gelirken kapatılan panel kapalı ve boş kalıyor; açılışta canlı bölgeye
// eklenen metin yine 3249 karakter (kapatınca yine 0), açılış/kapanış animasyonunun eğrisi ve ekran görüntüleri (430 ve 1200 px; kapalı, açık,
// tekrar kapalı, tekrar açık) öncekiyle aynı.
//
// Düzeltme: (js/app.js; css/style.css'te yalnızca yorum)
//   - sekme düğmeleri baştan aria-expanded="false"; updateTafsirTabsUI, .active ile aria-expanded'ı AYNI değerden (wm.tafsirActive) yazıyor;
//   - düz kapanış BİTİNCE (animasyon sürerken değil) metin DOM'dan kaldırılıyor (clearTafsirContent); arada yeni bir tıklama olduysa
//     (requestId değiştiyse) kaldırılmıyor;
//   - showTafsirContent, panelin açılmasını bir kare sonra YALNIZCA sekme hâlâ etkinse yapıyor.
// role="tab" (sekme listesinde hep biri seçili olur; burada hepsi kapanabiliyor) ve aria-pressed (düğmenin adı değişmiyor; anlatılması gereken
// açılan içerik) bilerek KULLANILMADI; aria-controls da yok (Sure Bilgisi akordeonundaki düğmeler de yalnızca aria-expanded taşıyor). Açılış yolu
// DEĞİŞMEDİ (metin yine kapalı panele yazılıp bir kare sonra açılıyor), panele visibility:hidden verilmedi.
//
// Burada kontrol edilenler:
//   (1) kaynak: işaretleme, updateTafsirTabsUI, kapanış temizliği + koruması, açılış karesi koruması, CSS'te visibility/display yok;
//   (2) app.js'ten çıkarılan GERÇEK işlevler (ayahPanelBodyHTML, updateTafsirTabsUI, animateTafsirClosed, clearTafsirContent, showTafsirContent,
//       onTafsirTabClick, tafsirContentHTML, escapeHtml) x GERÇEK js/tafsir.js x GERÇEK data/tafsir-saadi.json (2:255) x SAHTE zamanlayıcı
//       (setTimeout / requestAnimationFrame elle ilerletiliyor: deterministik, kare kare): ilk durum, açma, kapama (animasyon sürerken metin
//       duruyor; transitionend ile ve 400 ms yedek zamanlayıcıyla bitince kalkıyor), yeniden açma, ilk açılışta veri bekleme, veri gelirken
//       kapatma, aynı karede çift tıklama, kapanırken yeniden açma, kapat-aç-kapat (eski kapanışın temizliği yeni kapanışı bozmuyor),
//       iki kaynak arasında geçiş (aynı anda en çok bir düğme expanded), geçiş sırasında geri dönme; birkaç senaryo GERÇEK zamanlayıcıyla;
//   (3) 50 rastgele (tohumlu) tıklama/zaman/veri dizisi: her adımda aria-expanded == .active == (wm.tafsirActive === id), en çok bir düğme
//       expanded, "panel açık ama içerik boş" yok; sonunda (her şey bitince) kapalıysa panel kapalı ve metin yok, açıksa panel açık ve metin dolu;
//   (4) dolu işaretlemenin axe-core yapısal taraması (kapalı ve açık durumda).
//
// ÖNEMLİ SINIR: jsdom'da düzen, geçiş ve erişilebilirlik ağacı yok; burada aria-expanded İŞARETİ ve metnin DOM'da olup olmadığı kontrol ediliyor
// (ağaçtaki durum gerçek Chromium'da ölçüldü, README'de). Gerçek ekran okuyucu (NVDA/JAWS/VoiceOver/TalkBack) çalıştırılmadı: durum değişikliği
// duyurusunun canlı bölgenin metin duyurusuyla nasıl birleştiği (ya da ayrı okunduğu) bilinmiyor.
//
//   node tefsir_sekme_aria_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM, VirtualConsole } from "jsdom";
import axeCore from "axe-core";
import { tafsirSourceIds, tafsirSourceLabel, isTafsirSourceAvailable, resolveTafsirText } from "../js/tafsir.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const appSource = readText("js", "app.js");
const css = readText("css", "style.css");

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tick = () => new Promise((r) => setImmediate(r)); // tüm bekleyen mikro görevler (promise devamları) bitsin

// Bir işlevin kaynağı (süslü parantezleri sayarak; şablon dizgelerindeki ${...} dengeli).
function fnSource(name) {
  const m = new RegExp(`(?:async )?function ${name}\\(`).exec(appSource);
  if (!m) return null;
  const open = appSource.indexOf("{", appSource.indexOf(")", m.index));
  let depth = 0;
  for (let i = open; i < appSource.length; i++) {
    if (appSource[i] === "{") depth++;
    else if (appSource[i] === "}" && --depth === 0) return appSource.slice(m.index, i + 1);
  }
  return null;
}
const NAMES = ["escapeHtml", "ayahPanelBodyHTML", "tafsirContentHTML", "updateTafsirTabsUI", "animateTafsirClosed", "clearTafsirContent", "showTafsirContent", "onTafsirTabClick"];
const SRCS = Object.fromEntries(NAMES.map((n) => [n, fnSource(n)]));
const loadingM = /const WORD_MEAL_LOADING_HTML = (`[^`]*`);/.exec(appSource);
const missing = NAMES.filter((n) => !SRCS[n]);
check(`app.js: gerekli işlevlerin hepsi bulundu (eksik: ${missing.join(", ") || "yok"})`, missing.length === 0);
check("app.js: WORD_MEAL_LOADING_HTML bulundu", !!loadingM);
if (missing.length || !loadingM) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}

// -- (1) Kaynak ----------------------------------------------------------------------------------------------
{
  const body = SRCS.ayahPanelBodyHTML;
  check('app.js: ayahPanelBodyHTML tefsir sekme düğmelerini baştan aria-expanded="false" ile kuruyor', /class="wm-tafsir-tab"[^`]*aria-expanded="false"/.test(body));
  check('app.js: sekme düğmesinde role="tab" ve aria-pressed YOK (açılıp kapanan bir düğme: aria-expanded)', !/role="tab"|aria-pressed/.test(body + SRCS.updateTafsirTabsUI));
  const upd = SRCS.updateTafsirTabsUI;
  check(
    "app.js: updateTafsirTabsUI .active ve aria-expanded'ı AYNI değerden (wm.tafsirActive) yazıyor (ayrışamazlar)",
    /const active = btn\.dataset\.tafsirId === wm\.tafsirActive;/.test(upd) &&
      /classList\.toggle\("active", active\)/.test(upd) &&
      /setAttribute\("aria-expanded", active \? "true" : "false"\)/.test(upd)
  );
  const click = SRCS.onTafsirTabClick;
  check(
    "app.js: onTafsirTabClick düz kapanışta, kapanış BİTİNCE ve yalnızca requestId değişmediyse clearTafsirContent çağırıyor",
    /animateTafsirClosed\(panelEl\)\.then\(\(\) => \{[^}]*if \(wm\.tafsirRequestId === requestId\) clearTafsirContent\(panelEl\);\s*\}\);\s*return;/.test(click)
  );
  check("app.js: clearTafsirContent yalnızca düz kapanış dalında (bir kez) çağrılıyor; geçiş dalında metin boşaltılmıyor", (click.match(/clearTafsirContent\(/g) || []).length === 1);
  const clear = SRCS.clearTafsirContent;
  check('app.js: clearTafsirContent yalnızca .wm-tafsir-content\'i boşaltıyor (öğe duruyor: yeniden açılışta yazılacak yer)', /querySelector\("\.wm-tafsir-content"\)/.test(clear) && /\.innerHTML = ""/.test(clear));
  const show = SRCS.showTafsirContent;
  check(
    "app.js: showTafsirContent panelin açılmasını bir kare sonra YALNIZCA sekme hâlâ etkinse yapıyor",
    /requestAnimationFrame\(\(\) => \{\s*if \(state\.wordMeal\.tafsirActive === sourceId\) panelEl\.classList\.add\("wm-open"\);\s*\}\);/.test(show)
  );
  check("app.js: açılış yolu aynı: metin önce (kapalı) panele yazılıyor, wm-open sonra", show.indexOf("contentEl.innerHTML =") > -1 && show.indexOf("contentEl.innerHTML =") < show.indexOf("requestAnimationFrame"));
  check(
    "app.js: delege edilmiş tıklama işleyicisi sekmeyi onTafsirTabClick(tabBtn.dataset.tafsirId)'e veriyor",
    /const tabBtn = e\.target\.closest\("\.wm-tafsir-tab"\);\s*if \(tabBtn\) \{\s*onTafsirTabClick\(tabBtn\.dataset\.tafsirId\);\s*return;\s*\}/.test(appSource)
  );
  const innerRule = /\.wm-tafsir-panel-inner\s*\{([^}]*)\}/.exec(css);
  check("css: .wm-tafsir-panel-inner'a visibility/display verilmemiş (açılış yolu aynı: metin kapalı panele yazılıp bir kare sonra açılıyor)", !!innerRule && !/visibility|display/.test(innerRule[1]));
  check("css: .wm-tafsir-tab'a özel bir aria-expanded seçicisi yok (görünümü .active belirliyor, değişmedi)", !/\.wm-tafsir-tab\[aria-expanded/.test(css));
}

// -- (2) Gerçek işlevler x gerçek veri x sahte/gerçek zamanlayıcı -----------------------------------------------
const DATA = JSON.parse(readText("data", "tafsir-saadi.json"));
const AYAH = { surah: 2, ayah: 255 };
const EXPECTED_HTML = resolveTafsirText(DATA, AYAH.surah, AYAH.ayah);
check("veri: 2:255 için tefsir metni var (6000+ karakter)", typeof EXPECTED_HTML === "string" && EXPECTED_HTML.length > 6000);
const textOfHTML = (html) => {
  const t = new JSDOM("<!DOCTYPE html><body></body>").window.document.createElement("div");
  t.innerHTML = html;
  return t.textContent.trim();
};
const EXPECTED_TEXT = textOfHTML(EXPECTED_HTML);
check("veri: beklenen düz metin dolu", EXPECTED_TEXT.length > 3000);

const DEP_NAMES = [
  "state", "console", "setTimeout", "requestAnimationFrame",
  "tafsirSourceIds", "tafsirSourceLabel", "isTafsirSourceAvailable", "isTafsirDataReady", "getCachedTafsirData", "loadTafsirData", "resolveTafsirText",
  "ayahRawWords", "buildWordMealCards", "getCachedWordMealData", "getMealText", "getCachedMealData", "ayahTopicsRowHTML", "renderWordMealCardsHTML", "renderMealHTML",
];
const factory = new Function(...DEP_NAMES, `const WORD_MEAL_LOADING_HTML = ${loadingM[1]};\n${NAMES.map((n) => SRCS[n]).join("\n")}\nreturn { ${NAMES.join(", ")} };`);

// Elle ilerletilen zaman: setTimeout ve requestAnimationFrame (16 ms'lik kare sınırları) bir kuyrukta; advance(ms) zamanı ilerletip vadesi
// gelenleri sırayla çalıştırıyor, her birinden sonra bekleyen promise devamlarını bırakıyor.
function makeClock() {
  let now = 0;
  let seq = 0;
  const queue = [];
  return {
    setTimeout(fn, ms) {
      queue.push({ at: now + ms, seq: seq++, fn });
    },
    requestAnimationFrame(fn) {
      queue.push({ at: (Math.floor(now / 16) + 1) * 16, seq: seq++, fn });
    },
    async advance(ms) {
      const end = now + ms;
      await tick();
      for (;;) {
        queue.sort((a, b) => a.at - b.at || a.seq - b.seq);
        if (!queue.length || queue[0].at > end) break;
        const t = queue.shift();
        now = t.at;
        t.fn();
        await tick();
      }
      now = end;
      await tick();
    },
  };
}

// sources: "real" = gerçek tafsir.js kaynak listesi (yalnızca Sa'dî); "two" = Sa'dî + verisi olmayan ikinci kaynak ("yakında eklenecek" yolu).
function makeEnv({ sources = "real", dataReady = true, realTimers = false } = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html lang="tr"><body><div class="word-meal-body" aria-live="polite"></div></body></html>`, {
    pretendToBeVisual: realTimers,
    virtualConsole: new VirtualConsole(),
  });
  const bodyEl = dom.window.document.querySelector(".word-meal-body");
  const clock = realTimers
    ? { setTimeout: (fn, ms) => setTimeout(fn, ms), requestAnimationFrame: (fn) => dom.window.requestAnimationFrame(fn), advance: (ms) => sleep(ms) }
    : makeClock();
  let ready = dataReady;
  const fetches = [];
  const errors = [];
  const wm = { open: true, ayah: AYAH, bodyEl, tafsirActive: null, tafsirRequestId: 0 };
  const S =
    sources === "real"
      ? { ids: tafsirSourceIds, label: tafsirSourceLabel, avail: isTafsirSourceAvailable }
      : { ids: () => ["saadi", "yakinda"], label: (id) => ({ saadi: "Tefsîr-i Sa'dî", yakinda: "Gelecek Kaynak" })[id] || id, avail: (id) => id === "saadi" };
  const deps = {
    state: { wordMeal: wm },
    console: { error: (...a) => errors.push(a.join(" ")) },
    setTimeout: clock.setTimeout,
    requestAnimationFrame: clock.requestAnimationFrame,
    tafsirSourceIds: S.ids,
    tafsirSourceLabel: S.label,
    isTafsirSourceAvailable: S.avail,
    isTafsirDataReady: () => ready,
    getCachedTafsirData: () => (ready ? DATA : null),
    loadTafsirData: () => new Promise((resolve) => fetches.push(() => { ready = true; resolve(DATA); })),
    resolveTafsirText,
    ayahRawWords: () => [],
    buildWordMealCards: () => [],
    getCachedWordMealData: () => null,
    getMealText: () => "Meal metni",
    getCachedMealData: () => null,
    ayahTopicsRowHTML: () => "",
    renderWordMealCardsHTML: () => "",
    renderMealHTML: (t) => `<p>${t}</p>`,
  };
  const api = factory(...DEP_NAMES.map((n) => deps[n]));
  bodyEl.innerHTML = api.ayahPanelBodyHTML(AYAH);
  // openWordMealStructure'daki delege edilmiş işleyicinin aynısı (yukarıda kaynaktan doğrulandı)
  bodyEl.addEventListener("click", (e) => {
    const tabBtn = e.target.closest(".wm-tafsir-tab");
    if (tabBtn) api.onTafsirTabClick(tabBtn.dataset.tafsirId).catch((err) => errors.push(String(err)));
  });
  const env = {
    dom, bodyEl, wm, clock, api, errors,
    tabs: () => [...bodyEl.querySelectorAll(".wm-tafsir-tab")],
    tab: (id) => bodyEl.querySelector(`.wm-tafsir-tab[data-tafsir-id="${id}"]`),
    panel: () => bodyEl.querySelector(".wm-tafsir-panel"),
    inner: () => bodyEl.querySelector(".wm-tafsir-panel-inner"),
    content: () => bodyEl.querySelector(".wm-tafsir-content"),
    click: (id = "saadi") => env.tab(id).click(),
    // panelin kendi grid-template-rows geçişi bitti (gerçek tarayıcıdaki transitionend)
    async transitionEnd(propertyName = "grid-template-rows", target = env.panel()) {
      const ev = new dom.window.Event("transitionend", { bubbles: true });
      Object.defineProperty(ev, "propertyName", { value: propertyName });
      target.dispatchEvent(ev);
      await tick();
    },
    async releaseFetches() {
      while (fetches.length) fetches.shift()();
      await tick();
    },
    get pendingFetches() {
      return fetches.length;
    },
    close: () => dom.window.close(),
  };
  return env;
}
const isOpen = (env) => env.panel().classList.contains("wm-open");
const textOf = (env) => env.content().textContent.trim();
const expandedOf = (env, id = "saadi") => env.tab(id).getAttribute("aria-expanded");
const activeOf = (env, id = "saadi") => env.tab(id).classList.contains("active");
const LOADING_TEXT = "Yükleniyor…";

// Her an geçerli olması gereken değişmezler (animasyon sürerken de)
function invariantProblems(env) {
  const out = [];
  let expandedCount = 0;
  for (const b of env.tabs()) {
    const id = b.dataset.tafsirId;
    const exp = b.getAttribute("aria-expanded");
    const act = b.classList.contains("active");
    if (exp !== "true" && exp !== "false") out.push(`${id}: aria-expanded "${exp}" (true/false değil)`);
    if ((exp === "true") !== act) out.push(`${id}: aria-expanded=${exp} ama .active=${act}`);
    if (act !== (env.wm.tafsirActive === id)) out.push(`${id}: .active=${act} ama tafsirActive=${env.wm.tafsirActive}`);
    if (exp === "true") expandedCount++;
  }
  if (expandedCount > 1) out.push(`${expandedCount} düğme aynı anda expanded`);
  if (isOpen(env) && textOf(env) === "") out.push("panel AÇIK ama içerik boş");
  return out;
}
// Her şey bitince (veri geldi, kapanış animasyonu ve yedek zamanlayıcılar, kareler) geçerli olması gerekenler
async function settle(env) {
  for (let i = 0; i < 4; i++) {
    await env.releaseFetches();
    await env.clock.advance(500);
  }
}
function settledProblems(env) {
  const out = invariantProblems(env);
  if (env.wm.tafsirActive === null) {
    if (isOpen(env)) out.push("hiçbir sekme etkin değil ama panel açık");
    if (env.content().innerHTML !== "") out.push(`kapalı panelde metin kalmış (${env.content().textContent.length} kr)`);
  } else {
    if (!isOpen(env)) out.push("sekme etkin ama panel kapalı");
    if (textOf(env) === "") out.push("sekme etkin ama içerik boş");
    if (textOf(env).includes(LOADING_TEXT)) out.push(`veri geldi ama içerik hâlâ "${LOADING_TEXT}"`);
  }
  return out;
}

// S1: ilk durum (gerçek kaynak listesi: yalnızca Sa'dî)
{
  const env = makeEnv();
  const tabs = env.tabs();
  check("ilk durum: gerçek kaynak listesiyle tek tefsir düğmesi (Sa'dî)", tabs.length === 1 && tabs[0].dataset.tafsirId === "saadi" && tabs[0].textContent.trim() === "Tefsîr-i Sa'dî");
  check('ilk durum: düğme aria-expanded="false" (ekran okuyucu baştan "daraltılmış" desin)', expandedOf(env) === "false");
  check("ilk durum: .active yok, panel kapalı, içerik boş", !activeOf(env) && !isOpen(env) && env.content().innerHTML === "");
  check("ilk durum: düğmenin öznitelikleri tam olarak type/class/data-tafsir-id/aria-expanded (başka aria-* ya da role yok)", [...tabs[0].attributes].map((a) => a.name).sort().join() === "aria-expanded,class,data-tafsir-id,type");
  check("ilk durum: değişmezler sağlanıyor", invariantProblems(env).length === 0);
  check('ilk durum: ayet panelinin gövdesi canlı bölge ("polite") olarak duruyor, düğmeler onun içinde (açılan metin duyurulur)', env.bodyEl.getAttribute("aria-live") === "polite" && env.bodyEl.contains(tabs[0]));
  env.close();
}

// S2: aç (veri hazır)
{
  const env = makeEnv();
  env.click();
  await tick();
  check('aç: tıklamayla HEMEN aria-expanded="true" ve .active (kare beklenmeden)', expandedOf(env) === "true" && activeOf(env));
  check("aç: metin kapalı panele hemen yazıldı (açılış yolu eskisi gibi: önce metin, bir kare sonra wm-open)", textOf(env) === EXPECTED_TEXT && !isOpen(env));
  await env.clock.advance(16);
  check("aç: bir kare sonra panel açık (wm-open)", isOpen(env) && expandedOf(env) === "true");
  const attrNames = () => [...env.tab("saadi").attributes].map((a) => a.name).sort().join();
  check("aç: açıkken düğmenin öznitelikleri yine type/class/data-tafsir-id/aria-expanded (aria-pressed, role, aria-controls eklenmiyor)", attrNames() === "aria-expanded,class,data-tafsir-id,type");
  env.click();
  await env.clock.advance(500);
  check("kapat: kapandıktan sonra da düğmenin öznitelikleri aynı (type/class/data-tafsir-id/aria-expanded)", attrNames() === "aria-expanded,class,data-tafsir-id,type");
  check("aç: değişmezler sağlanıyor ve hata yok", invariantProblems(env).length === 0 && env.errors.length === 0);
  env.close();
}

// S3: kapat: animasyon sürerken metin duruyor, bitince kalkıyor (yedek zamanlayıcıyla)
{
  const env = makeEnv();
  env.click();
  await env.clock.advance(100);
  env.click();
  await tick();
  check('kapat: tıklamayla HEMEN aria-expanded="false", .active yok, wm-open kalktı (küçülme başlıyor)', expandedOf(env) === "false" && !activeOf(env) && !isOpen(env));
  check("kapat: animasyon sürerken metin DOM'da duruyor (görünür küçülme bozulmasın)", textOf(env) === EXPECTED_TEXT);
  await env.clock.advance(399);
  check("kapat: 399 ms sonra (yedek zamanlayıcıdan hemen önce) metin hâlâ duruyor", textOf(env) === EXPECTED_TEXT);
  await env.clock.advance(1);
  check("kapat: yedek zamanlayıcı (400 ms) dolunca metin DOM'dan kalktı", env.content().innerHTML === "");
  check("kapat: .wm-tafsir-content öğesi duruyor (yeniden açılışta yazılacak yer)", !!env.content() && !!env.panel() && !!env.inner());
  check("kapat: değişmezler sağlanıyor ve hata yok", invariantProblems(env).length === 0 && env.errors.length === 0);

  // S4: yeniden aç (veri önbellekte)
  env.click();
  await env.clock.advance(16);
  check("yeniden aç: metin geri geldi, panel açık, aria-expanded=true", textOf(env) === EXPECTED_TEXT && isOpen(env) && expandedOf(env) === "true" && activeOf(env));
  env.close();
}

// S3b: kapat, transitionend ile bitince hemen kalkıyor; yanlış özellik/hedefin geçişi bitirmiyor
{
  const env = makeEnv();
  env.click();
  await env.clock.advance(100);
  env.click();
  await tick();
  await env.transitionEnd("opacity", env.inner());
  await env.transitionEnd("opacity", env.panel());
  await env.transitionEnd("grid-template-rows", env.inner());
  check("kapat: iç öğenin opacity/grid geçişi ya da panelin opacity geçişi kapanışı BİTİRMİYOR (metin duruyor)", textOf(env) === EXPECTED_TEXT);
  await env.transitionEnd();
  check("kapat: panelin kendi grid-template-rows transitionend'i gelince metin hemen kalktı", env.content().innerHTML === "");
  await env.clock.advance(1000);
  check("kapat: sonradan gelen yedek zamanlayıcı bir şeyi bozmuyor (boş, kapalı, expanded=false)", env.content().innerHTML === "" && !isOpen(env) && expandedOf(env) === "false" && env.errors.length === 0);
  env.close();
}

// S5: ilk açılış, veri gelene kadar "Yükleniyor…", sonra metin
{
  const env = makeEnv({ dataReady: false });
  env.click();
  await tick();
  check('ilk açılış: veri yokken aria-expanded="true", içerik "Yükleniyor…", veri isteği başladı', expandedOf(env) === "true" && textOf(env) === LOADING_TEXT && env.pendingFetches === 1);
  await env.clock.advance(16);
  check("ilk açılış: yükleniyor göstergesiyle panel açıldı", isOpen(env));
  await env.releaseFetches();
  check("ilk açılış: veri gelince yerine tefsir metni yazıldı, panel açık, expanded=true", textOf(env) === EXPECTED_TEXT && isOpen(env) && expandedOf(env) === "true");
  check("ilk açılış: değişmezler sağlanıyor ve hata yok", invariantProblems(env).length === 0 && env.errors.length === 0);
  env.close();
}

// S6: veri gelirken açıp kapatma: kapalı panelde "Yükleniyor…" ya da sonradan gelen metin KALMAMALI
{
  const env = makeEnv({ dataReady: false });
  env.click();
  await env.clock.advance(100);
  env.click();
  await tick();
  check("veri gelirken kapat: aria-expanded=false, panel kapanıyor, metin (Yükleniyor…) kapanış bitene kadar duruyor", expandedOf(env) === "false" && !isOpen(env) && textOf(env) === LOADING_TEXT);
  await env.clock.advance(400);
  check('veri gelirken kapat: kapanış bitince "Yükleniyor…" DOM\'dan kalktı', env.content().innerHTML === "");
  await env.releaseFetches();
  await env.clock.advance(100);
  check("veri gelirken kapat: veri sonradan gelince kapalı panele metin YAZILMADI (kapalı, boş, expanded=false)", env.content().innerHTML === "" && !isOpen(env) && expandedOf(env) === "false");
  env.click();
  await env.clock.advance(16);
  check("veri gelirken kapat: sonra yeniden açınca (veri artık hazır) metin geliyor", textOf(env) === EXPECTED_TEXT && isOpen(env) && expandedOf(env) === "true");
  check("veri gelirken kapat: değişmezler sağlanıyor ve hata yok", invariantProblems(env).length === 0 && env.errors.length === 0);
  env.close();
}

// S6b: veri gelirken kapat + AYNI veri isteği sürerken yeniden aç: tek metin, tek açılış
{
  const env = makeEnv({ dataReady: false });
  env.click();
  await env.clock.advance(100);
  env.click();
  await env.clock.advance(400);
  env.click();
  await env.clock.advance(16);
  check('veri gelirken kapat-aç: ikinci açılışta yine "Yükleniyor…" ve panel açık, expanded=true', textOf(env) === LOADING_TEXT && isOpen(env) && expandedOf(env) === "true");
  await env.releaseFetches();
  await env.clock.advance(100);
  check("veri gelirken kapat-aç: veri gelince metin yazıldı, panel açık", textOf(env) === EXPECTED_TEXT && isOpen(env) && expandedOf(env) === "true");
  env.close();
}

// S7: aynı karede çift tıklama (aç + kapat, senkron): sekme kapalıyken panel açık KALMAMALI
for (const dataReady of [false, true]) {
  const env = makeEnv({ dataReady });
  const label = dataReady ? "veri hazır" : "veri yok";
  env.click();
  env.click();
  await tick();
  check(`aynı karede çift tıklama (${label}): aria-expanded=false, .active yok`, expandedOf(env) === "false" && !activeOf(env));
  await env.clock.advance(100);
  await env.releaseFetches();
  await env.clock.advance(500);
  check(`aynı karede çift tıklama (${label}): panel AÇILMADI ve metin yok (önce: panel 64 px açık + "Yükleniyor…" kalıcı)`, !isOpen(env) && env.content().innerHTML === "");
  check(`aynı karede çift tıklama (${label}): sonra normal açılıp kapanıyor`, await (async () => {
    env.click();
    await env.clock.advance(16);
    const opened = isOpen(env) && textOf(env) === EXPECTED_TEXT && expandedOf(env) === "true";
    env.click();
    await env.clock.advance(500);
    return opened && !isOpen(env) && env.content().innerHTML === "" && expandedOf(env) === "false";
  })());
  check(`aynı karede çift tıklama (${label}): değişmezler sağlanıyor ve hata yok`, invariantProblems(env).length === 0 && env.errors.length === 0);
  env.close();
}

// S7b: aynı karede üç tıklama (aç-kapat-aç): açık kalmalı, metin dolu (arada çalışan kapanış temizliği yeni açılışı bozmamalı)
{
  const env = makeEnv();
  env.click();
  env.click();
  env.click();
  await env.clock.advance(600);
  check("aynı karede üç tıklama: sekme etkin, panel açık, metin dolu", expandedOf(env) === "true" && isOpen(env) && textOf(env) === EXPECTED_TEXT);
  env.close();
}

// S8: kapanırken yeniden açma: metin korunmalı, panel yeniden açılmalı
{
  const env = makeEnv();
  env.click();
  await env.clock.advance(100);
  env.click(); // kapanış başladı (yedek zamanlayıcı 400 ms)
  await env.clock.advance(120);
  env.click(); // animasyonun ortasında yeniden aç
  await env.clock.advance(20);
  check("kapanırken yeniden aç: sekme etkin, panel açık, metin duruyor", expandedOf(env) === "true" && isOpen(env) && textOf(env) === EXPECTED_TEXT);
  await env.transitionEnd(); // ilk kapanışın geç gelen transitionend'i
  await env.clock.advance(600);
  check("kapanırken yeniden aç: eski kapanışın bitişi (transitionend + yedek zamanlayıcı) metni SİLMİYOR; sekme etkin, panel açık", expandedOf(env) === "true" && isOpen(env) && textOf(env) === EXPECTED_TEXT);
  check("kapanırken yeniden aç: değişmezler sağlanıyor ve hata yok", invariantProblems(env).length === 0 && env.errors.length === 0);
  env.close();
}

// S9: kapat - aç - kapat: ilk kapanışın (artık geçersiz) temizliği, ikinci kapanışın animasyonu sürerken metni silmemeli
{
  const env = makeEnv();
  env.click();
  await env.clock.advance(100);
  env.click(); // r1: kapat, yedek zamanlayıcı t=+400
  await env.clock.advance(100);
  env.click(); // r2: aç
  await env.clock.advance(20);
  env.click(); // r3: kapat, yedek zamanlayıcı t=+400 (r1'inkinden SONRA)
  await env.clock.advance(290); // r1'in zamanlayıcısı doldu, r3'ünki henüz değil
  check("kapat-aç-kapat: ilk kapanışın bitişi, ikinci kapanışın animasyonu sürerken metni SİLMİYOR", textOf(env) === EXPECTED_TEXT && expandedOf(env) === "false");
  await env.clock.advance(300);
  check("kapat-aç-kapat: ikinci kapanış bitince metin kalktı, kapalı, expanded=false", env.content().innerHTML === "" && !isOpen(env) && expandedOf(env) === "false");
  check("kapat-aç-kapat: değişmezler sağlanıyor ve hata yok", invariantProblems(env).length === 0 && env.errors.length === 0);
  env.close();
}

// S10: iki kaynak arasında geçiş (ikincisi "yakında eklenecek")
{
  const env = makeEnv({ sources: "two" });
  const both = () => `${expandedOf(env, "saadi")}/${expandedOf(env, "yakinda")}`;
  check('iki kaynak: iki düğme de baştan aria-expanded="false", sırası Sa\'dî, Gelecek Kaynak', both() === "false/false" && env.tabs().map((b) => b.textContent.trim()).join("|") === "Tefsîr-i Sa'dî|Gelecek Kaynak");
  env.click("saadi");
  await env.clock.advance(16);
  check("iki kaynak: Sa'dî açık: yalnızca onun aria-expanded'ı true, metin Sa'dî'nin", both() === "true/false" && isOpen(env) && textOf(env) === EXPECTED_TEXT);
  env.click("yakinda"); // geçiş: önce Sa'dî kapanıyor
  await tick();
  check("iki kaynak: geçişte tıklamayla ESKİ düğme hemen false, yeni düğme kapanış bitene kadar false (aynı anda en çok bir expanded)", both() === "false/false" && !isOpen(env) && invariantProblems(env).length === 0);
  check("iki kaynak: geçişte eski metin kapanış animasyonu sürerken duruyor (içerik değişmeden önce küçülüyor)", textOf(env) === EXPECTED_TEXT);
  await env.transitionEnd();
  check('iki kaynak: kapanış bitince yeni düğme true, metin "yakında eklenecek"', both() === "false/true" && textOf(env) === "Gelecek Kaynak yakında eklenecek.");
  await env.clock.advance(16);
  check("iki kaynak: yeni kaynakla panel açık", isOpen(env) && invariantProblems(env).length === 0);
  env.click("yakinda"); // aynı düğmeye tekrar: kapat
  await env.clock.advance(500);
  check("iki kaynak: aynı düğmeye tekrar basınca kapanıyor, iki düğme false, metin kalktı", both() === "false/false" && !isOpen(env) && env.content().innerHTML === "");
  env.click("yakinda"); // kapalıyken doğrudan ikinci kaynağı aç
  await env.clock.advance(16);
  check("iki kaynak: hiçbiri açık değilken doğrudan ikinci kaynak açılıyor", both() === "false/true" && isOpen(env) && textOf(env) === "Gelecek Kaynak yakında eklenecek.");
  check("iki kaynak: hata yok", env.errors.length === 0);
  env.close();
}

// S11: geçiş sırasında (eski kaynak kapanırken) eski düğmeye geri dönme: son tıklama kazanır
{
  const env = makeEnv({ sources: "two" });
  env.click("saadi");
  await env.clock.advance(100);
  env.click("yakinda"); // Sa'dî kapanıyor, Gelecek Kaynak sırada
  await env.clock.advance(100);
  env.click("saadi"); // vazgeç: Sa'dî'ye geri dön
  await env.clock.advance(16);
  check("geçişte geri dön: Sa'dî açık, Gelecek Kaynak kapalı", expandedOf(env, "saadi") === "true" && expandedOf(env, "yakinda") === "false" && isOpen(env));
  await env.transitionEnd();
  await env.clock.advance(600);
  check("geçişte geri dön: eski geçişin devamı (gecikmiş await) yeni durumu bozmuyor: Sa'dî açık, metin Sa'dî'nin", expandedOf(env, "saadi") === "true" && expandedOf(env, "yakinda") === "false" && isOpen(env) && textOf(env) === EXPECTED_TEXT);
  check("geçişte geri dön: değişmezler sağlanıyor ve hata yok", invariantProblems(env).length === 0 && env.errors.length === 0);
  env.close();
}

// S12: bazı senaryolar GERÇEK zamanlayıcıyla (sahte saatin gerçek davranışı gizlemediğini görmek için): jsdom pretendToBeVisual (60 Hz) + gerçek setTimeout
{
  const env = makeEnv({ realTimers: true });
  env.click();
  await sleep(80);
  check("gerçek zamanlayıcı: açıldı (expanded=true, wm-open, metin dolu)", expandedOf(env) === "true" && isOpen(env) && textOf(env) === EXPECTED_TEXT);
  env.click();
  await sleep(10);
  check("gerçek zamanlayıcı: kapanış sürerken metin duruyor, expanded=false", expandedOf(env) === "false" && textOf(env) === EXPECTED_TEXT && !isOpen(env));
  await sleep(450);
  check("gerçek zamanlayıcı: yedek zamanlayıcı dolunca (≈400 ms) metin kalktı", env.content().innerHTML === "" && !isOpen(env) && expandedOf(env) === "false");
  env.click();
  env.click();
  await sleep(120);
  check("gerçek zamanlayıcı: aynı karede çift tıklama: kapalı, boş", !isOpen(env) && env.content().innerHTML === "" && expandedOf(env) === "false");
  check("gerçek zamanlayıcı: hata yok", env.errors.length === 0);
  env.close();
}

// S13: yardımcı işlevlerin kenar durumları
{
  const env = makeEnv();
  env.wm.bodyEl = null;
  let threw = false;
  try {
    env.api.updateTafsirTabsUI();
  } catch {
    threw = true;
  }
  check("updateTafsirTabsUI: gövde yokken (panel kapalı) hata vermiyor", !threw);
  env.wm.bodyEl = env.bodyEl;
  let threw2 = false;
  try {
    env.api.clearTafsirContent(null);
    env.api.clearTafsirContent(env.bodyEl);
  } catch {
    threw2 = true;
  }
  check("clearTafsirContent: panel yok ya da içinde .wm-tafsir-content yok: hata vermiyor, hiçbir şeye dokunmuyor", !threw2 && env.panel() !== null);
  env.wm.open = false;
  env.click();
  await tick();
  check("onTafsirTabClick: ayet paneli kapalıyken (wm.open=false) tıklama hiçbir şeyi değiştirmiyor", expandedOf(env) === "false" && !activeOf(env) && env.content().innerHTML === "" && env.errors.length === 0);
  env.close();
}

// -- (3) Rastgele (tohumlu) tıklama/zaman/veri dizileri -------------------------------------------------------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
{
  let sequences = 0;
  let steps = 0;
  const bad = [];
  for (const sources of ["real", "two"]) {
    for (let seed = 1; seed <= 25; seed++) {
      const env = makeEnv({ sources, dataReady: seed % 2 === 0 });
      const r = rng(seed * 7919 + (sources === "two" ? 13 : 0));
      const ids = env.tabs().map((b) => b.dataset.tafsirId);
      const pick = () => ids[Math.floor(r() * ids.length)];
      let problem = null;
      for (let step = 0; step < 120 && !problem; step++) {
        const x = r();
        if (x < 0.45) env.click(pick());
        else if (x < 0.6) await env.transitionEnd();
        else if (x < 0.82) await env.clock.advance(Math.floor(r() * 40));
        else if (x < 0.9) await env.releaseFetches();
        else {
          const id = pick(); // aynı karede çift tıklama
          env.click(id);
          env.click(id);
        }
        await tick();
        steps++;
        const p = invariantProblems(env);
        if (p.length) problem = `adım ${step}: ${p.join("; ")}`;
      }
      if (!problem) {
        await settle(env);
        const p = settledProblems(env);
        if (p.length) problem = `bitişte: ${p.join("; ")}`;
      }
      if (!problem && env.errors.length) problem = `hata: ${env.errors[0]}`;
      sequences++;
      if (problem) bad.push(`${sources}/${seed}: ${problem}`);
      env.close();
    }
  }
  for (const b of bad.slice(0, 5)) check(`rastgele dizi ${b}`, false);
  check(`rastgele dizi: ${sequences} dizi (${steps} adım; tek ve iki kaynak) boyunca aria-expanded == .active == tafsirActive, en çok bir expanded, açık panel hiç boş değil; sonunda kapalıysa panel kapalı ve metin yok, açıksa panel açık ve metin dolu`, bad.length === 0 && sequences === 50);
}

// -- (4) Dolu işaretlemenin axe-core yapısal taraması --------------------------------------------------------
async function runAxe(document, options) {
  const win = document.defaultView;
  const prev = { window: globalThis.window, document: globalThis.document, Node: globalThis.Node, getComputedStyle: globalThis.getComputedStyle };
  globalThis.window = win;
  globalThis.document = document;
  globalThis.Node = win.Node;
  globalThis.getComputedStyle = win.getComputedStyle.bind(win);
  if (!win.requestAnimationFrame) win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  try {
    return await axeCore.run(document.documentElement, options);
  } finally {
    globalThis.window = prev.window;
    globalThis.document = prev.document;
    globalThis.Node = prev.Node;
    globalThis.getComputedStyle = prev.getComputedStyle;
  }
}
{
  const rules = ["aria-allowed-attr", "aria-required-attr", "aria-roles", "aria-valid-attr-value", "aria-valid-attr", "aria-hidden-focus", "button-name", "duplicate-id", "duplicate-id-aria", "nested-interactive", "tabindex"];
  for (const sources of ["real", "two"]) {
    const env = makeEnv({ sources, dataReady: true });
    const closedResults = await runAxe(env.dom.window.document, { runOnly: { type: "rule", values: rules }, resultTypes: ["violations"] });
    check(`axe-core (${sources}, tefsir kapalı): yapısal kuralları ihlal yok (${closedResults.violations.map((v) => v.id).join(", ") || "yok"})`, closedResults.violations.length === 0);
    env.click("saadi");
    await env.clock.advance(16);
    const openResults = await runAxe(env.dom.window.document, { runOnly: { type: "rule", values: rules }, resultTypes: ["violations"] });
    check(`axe-core (${sources}, tefsir açık): yapısal kuralları ihlal yok (${openResults.violations.map((v) => v.id).join(", ") || "yok"})`, openResults.violations.length === 0);
    env.close();
  }
}

await sleep(0);
if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("All checks passed (tefsir sekme düğmesi: aria-expanded işareti ve .active ile tutarlılığı, kapanış bitince metnin DOM'dan kalkması, aynı karede çift tıklama, veri gelirken kapatma, iki kaynak arasında geçiş, rastgele diziler, axe-core).");
}
