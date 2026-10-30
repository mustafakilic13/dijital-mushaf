// Ezber > Oku VE Yaz: klavye / ekran okuyucu yolu ve oturum akışının duyuruları. Regresyon kontrolü.
//
// ---- OKU ----
// Neden var: Oku'da bir kelimeyi açmanın TEK yolu sayfadaki ayete dokunmaktı; sayfa tek bir <svg> olduğundan klavyeyle
// ulaşılabilecek hiçbir şey yoktu. Gerçek Chromium'da ölçülen durum (430 px; Fâtiha 1:1-2; oturum yalnızca klavyeyle
// başlatıldı: #ezber-btn -> Enter -> Oku sekmesi -> aralık -> Enter), düzeltmeden ÖNCE:
//   - oturum başlayınca odak "Bitir"e (açan düğmeye) dönüyor; tam bir Tab turu yalnızca üst çubuk (Cüz, Sayfa, Sure) ve alt çubuk
//     (Bitir, Oynat, Arama) düğmeleri: sayfada hiçbir durak yok;
//   - gövdede Enter / Boşluk / Aşağı / Yukarı / PageDown / End: açılan kapak sayısı değişmiyor (0 kelime açıldı);
//   - fareyle bir kelime açınca: #nav-announcer değişmiyor (hiçbir şey duyurulmuyor) ve Türkçe karşılık baloncuğu HİÇ çıkmıyor:
//     Oku başlarken kelime meali verisi (data/word-meal.json) yalnızca Yaz için yükleniyordu, o sayfa oturumunda ayet paneli ya da
//     arama hiç açılmadıysa Oku'da veri hiç istenmiyordu (ağ isteği sayısı 0).
// Ayrıca ses yüklenemediğinde (çevrimdışı, ses sunucusuna ulaşılamıyor; ses isteği düşürülerek ölçüldü) bir ayet bitince oturum
// bir değil İKİ ayet ilerliyordu (1. ayet bitti -> doğrudan 3. ayet; duyurulan: "...1. ayet", "...3. ayet"): başarısız klip için
// hem "error" olayı hem play()'in reddi onSettled'ı çağırıyor, ikisi de korumadan geçiyordu.
//
// Düzeltme: (index.html, css/style.css, js/app.js)
//   - #ezber-reveal: Oku çalışırken görünen (aksi hâlde `hidden`) "Sıradaki kelimeyi aç" düğmesi, alt çubukta Ezber/Bitir'den hemen
//     sonra. Görsel olarak gizli (.sr-only), klavyeyle odaklanınca alt çubuğun üstüne tam genişlikte biniyor (:focus-visible);
//     fareyle/dokunmayla kullananlar için ekran değişmiyor. Oku başlayınca odak ona geçiyor; oturum bitince (son kelime, ya da
//     ok tuşuyla sayfa çevirme) odak düğmeyle birlikte kaybolmasın diye Ezber düğmesine gidiyor.
//   - ezberRevealNextWord(): kelime açmanın TEK uygulaması; sayfaya dokunma (onEzberStudyTap) ve düğme aynı fonksiyonu çağırıyor.
//   - Duyurular (#nav-announcer; tek canlı bölge korundu): "Oku çalışması başladı", "Bu ayette N kelime var", her açılışta
//     "N. kelime: <Türkçe karşılık>" (son kelimede ". Ayet tamamlandı"), "Ezber çalışması bitti".
//   - Türkçe karşılık verisi Oku'da da yükleniyor; ses başarısızlığında ilerleme tek seferlik.
// Düzeltmeden sonra aynı sahne: odak oturum başlarken düğmede (:focus-visible eşleşiyor), Enter/Boşluk her basışta bir kelime
// açıyor, baloncuk ("adıyla", "Allah'ın", ...) çıkıyor, duyurular sırayla yazılıyor, son kelimeden sonra odak yerinde kalıyor ve
// ayet bitince sıradaki ayet açılıyor; son ayette oturum bitiyor ve odak Ezber düğmesine dönüyor.
//
// ---- YAZ ----
// Yaz'ın girişi ekran klavyesi (#yaz-keyboard: 29 harf tuşu + 💡; her tuş ayrı Tab durağı). Gerçek Chromium'da ölçülen durum (430 px;
// Fâtiha 1:1-2; oturum yalnızca klavyeyle başlatıldı), düzeltmeden ÖNCE:
//   - oturum başlayınca odak "Bitir"e dönüyor; Bitir'den ilk tuşa 3, "ب"ye 4 Tab (Oynat, Arama, ا, ب), 💡'ye 32;
//   - doğru tuşa basınca harf açılıyor ama HİÇBİR şey duyurulmuyor; yanlış tuşa basınca da hiçbir şey olmuyor (ne görsel ne duyuru):
//     ekran okuyucu kullanıcısı "tuş çalışmadı mı, yanlış mıydı?" ayırt edemiyor; 💡 ipucu metni (canlı bölge olmayan bir <p>)
//     görünüyor ama duyurulmuyor; tüm oturum boyunca duyurulanlar yalnızca "Sayfa 1, Fâtiha Suresi, 2. ayet" ve "Ezber çalışması bitti";
//   - #yaz-keyboard erişilebilirlik ağacında adsız "generic"; tuşların adı yalnızca Arapça harf ("ب");
//   - gerçek (fiziksel) Arapça klavye düzeninde bir harfe basmak (keydown key="ب", code KeyF; hedef <body>) hiçbir şey yapmıyor;
//   - odak bir tuştayken Sağ ok sayfayı çevirip oturumu BİTİRİYOR (1 -> 604; setupNav'ın document'teki sayfa çevirme dinleyicisi),
//     Sol ok da (1 -> 2); Yukarı/Aşağı hiçbir şey yapmıyor: ekran klavyesinde ok tuşuna basan biri oturumunu kaybediyor;
//   - oturum odak bir tuştayken biterse (son harf) klavye gizleniyor ve odak <body>'ye düşüyor.
// Düzeltme: duyurular ("Bu ayette N harf var", "Doğru" / "Doğru. Kelime tamamlandı" / "Doğru. Ayet tamamlandı", "Bu harf değil",
// "İpucu: <karşılık>" / "İpucu kapatıldı"); Arapça klavye düzeninde fiziksel yazma (onEzberYazPhysicalKey); ekran klavyesinde ok
// tuşlarıyla gezinme (onEzberYazKeyboardKeydown; olay burada tüketiliyor, sayfa çevirmiyor, Tab davranışı değişmedi);
// role="group" + aria-label "Arapça harf klavyesi"; tuş adı = Arapça harf + Türkçe okunuşu ("ب be"); Yaz başlayınca odak ilk tuşa,
// oturum bitince odak klavyedeyse Ezber düğmesine.
//
// Burada kontrol edilenler:
//   (1) index.html: #ezber-reveal işaretlemesi (düğme, başlangıçta hidden, adı, sırası: Ezber'den sonra Oynat'tan önce); Yaz
//       klavyesi işaretlemesi (grup adı, 3 satır x 10 tuş, her tuşun Arapça harfi + Türkçe okunuşu, 💡 adı, Tab durakları);
//   (2) css/style.css (jsdom CSSOM'uyla ayrıştırılıyor): .sr-only'nin kırptığı HER özelliğin :focus-visible kuralında geri alındığı
//       (.sr-only'den TÜRETİLİYOR: ileride yeni bir kırpma özelliği eklenirse test kırılır), `display` verilmediği (hidden
//       çalışsın), odak halkasının kapatılmadığı, metin/zemin kontrastı;
//   (3) app.js'ten çıkarılan GERÇEK işlevler (ezberRevealNextWord, onEzberStudyTap, setupEzberReveal, startEzberStudy,
//       endEzberStudy, ezberStudyGoToAyah, ezberStudyPlayAyahThenAdvance, handleEzberYazKeyPress, toggleEzberYazHint,
//       onEzberYazPhysicalKey, onEzberYazKeyboardKeydown, setupEzberYazKeyboard, <announce> bloğu) x gerçek index.html DOM'u:
//       kelime açma / harf eşleştirme (düğme, dokunma, ekran tuşu, fiziksel tuş), duyuru metinleri ve birleşmeleri, ok tuşları
//       (olay yayılmıyor), odak yönetimi, ses başarısızlığında tek ilerleme, veri yükleme;
//   (4) kaynak: kelime açmanın tek uygulaması, setupEzberReveal / setupEzberYazKeyboard'ın bağlanması; Türkçe karşılıklarda
//       Arapça harf yok (duyuru tek dilli bir canlı bölgeye yazılıyor).
//
// ÖNEMLİ SINIR: jsdom'da düzen, odak halkası görünümü, :focus-visible eşleşmesi ve gerçek bir ekran okuyucu yok. Düğmenin / klavyenin
// gizlenince odağı kaybetmesi taklit ediliyor (Chromium öyle yapıyor; jsdom yapmıyor). Gerçek tarayıcı ölçümü (Tab durakları,
// :focus-visible, görünüm, duyuru zaman çizelgesi, gerçek klavye olayları) README'de; gerçek ekran okuyucu
// (NVDA/JAWS/VoiceOver/TalkBack) çalıştırılmadı. Açılan Arapça kelimenin kendisi duyuruda YOK (canlı bölge tek dilli Türkçe); o kelime,
// kapağı kalkınca sayfanın metin katmanında erişilebilirlik ağacına giriyor, kapaktaki kelimeler ağaçtan çıkarılıyor (bu dosyanın
// konusu değil: test/ezber_metin_katmani_test.mjs).
//
//   node ezber_klavye_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";
import { tabbablesIn } from "../js/modal-odak.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const css = readText("css", "style.css");
const html = readText("index.html");
const appSource = readText("js", "app.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}

// -- (1) index.html -----------------------------------------------------------------------------------------
const dom = new JSDOM(html);
const D = dom.window.document;
const reveal = D.getElementById("ezber-reveal");
check("index.html: #ezber-reveal var ve tekil", !!reveal && D.querySelectorAll("#ezber-reveal").length === 1);
check("#ezber-reveal: gerçek <button type=button>", !!reveal && reveal.tagName === "BUTTON" && reveal.getAttribute("type") === "button");
check("#ezber-reveal: başlangıçta hidden (oturum yokken Tab durağı değil, erişilebilirlik ağacında yok)", !!reveal && reveal.hidden === true);
check("#ezber-reveal: görünen metin = erişilebilir ad: 'Sıradaki kelimeyi aç' (aria-label ile ezilmiyor, WCAG 2.5.3)", !!reveal && reveal.textContent.trim() === "Sıradaki kelimeyi aç" && !reveal.hasAttribute("aria-label") && !reveal.hasAttribute("aria-labelledby"));
check("#ezber-reveal: .sr-only + .ezber-reveal-btn sınıfları (görsel olarak gizli, klavye odağında CSS açıyor)", !!reveal && reveal.classList.contains("sr-only") && reveal.classList.contains("ezber-reveal-btn"));
check("#ezber-reveal: aria-hidden / tabindex / disabled YOK (ekran okuyucuya ve Tab'a açık)", !!reveal && !reveal.hasAttribute("aria-hidden") && !reveal.hasAttribute("tabindex") && !reveal.hasAttribute("disabled"));
check("#ezber-reveal: canlı bölge değil (tek canlı bölge #nav-announcer kalıyor)", !!reveal && !reveal.closest("[aria-live], [role=status], [role=alert]"));
const bar = D.querySelector(".bottombar");
const barKids = bar ? [...bar.children].map((e) => e.id) : [];
check(`#ezber-reveal alt çubuğun içinde, sırası Ezber'den SONRA Oynat'tan ÖNCE (bulunan: ${barKids.join(" > ")})`, barKids.join(",") === "ezber-btn,ezber-reveal,play-btn,arama-btn");
{
  const tabIds = (root) => tabbablesIn(root).map((e) => e.id);
  check(`hidden iken Tab durakları (alt çubuk): ${tabIds(bar).join(", ")} -- düğme yok`, tabIds(bar).join(",") === "ezber-btn,play-btn,arama-btn");
  reveal.hidden = false;
  check(`görünürken Tab sırası: ${tabIds(bar).join(", ")}`, tabIds(bar).join(",") === "ezber-btn,ezber-reveal,play-btn,arama-btn");
  reveal.hidden = true;
}

// Yaz klavyesi (#yaz-keyboard)
const YAZ_NAMES = {
  "ا": "elif", "ب": "be", "ت": "te", "ث": "se", "ج": "cim", "ح": "ha", "خ": "hı", "د": "dal", "ذ": "zel", "ر": "ra",
  "ز": "ze", "س": "sin", "ش": "şın", "ص": "sad", "ض": "dad", "ط": "tı", "ظ": "zı", "ع": "ayn", "غ": "gayn", "ف": "fe",
  "ق": "kaf", "ك": "kef", "ل": "lam", "م": "mim", "ن": "nun", "ه": "he", "و": "vav", "ي": "ye", "ء": "hemze",
};
{
  const kb = D.getElementById("yaz-keyboard");
  check("index.html: #yaz-keyboard var, başlangıçta hidden", !!kb && kb.hidden === true);
  check("#yaz-keyboard: role=\"group\" + aria-label 'Arapça harf klavyesi' (odak girince ekran okuyucu ne olduğunu söyler; yoksa adsız generic'ti)", !!kb && kb.getAttribute("role") === "group" && kb.getAttribute("aria-label") === "Arapça harf klavyesi");
  check("#yaz-keyboard: canlı bölge değil (tek canlı bölge #nav-announcer kalıyor)", !!kb && !kb.closest("[aria-live], [role=status], [role=alert]") && !kb.querySelector("[aria-live], [role=status], [role=alert]"));
  const rowsEls = kb ? [...kb.querySelectorAll(".yaz-keyboard-row")] : [];
  check(`#yaz-keyboard: 3 satır x 10 tuş (ok tuşlarıyla gezinme bu düzene dayanıyor; bulunan: ${rowsEls.map((r) => r.children.length).join("x")})`, rowsEls.length === 3 && rowsEls.every((r) => r.children.length === 10 && [...r.children].every((k) => k.classList.contains("yaz-key"))));
  const letterKeys = kb ? [...kb.querySelectorAll(".yaz-key[data-char]")] : [];
  check(`#yaz-keyboard: ${letterKeys.length} harf tuşu, 29 benzersiz Arapça harf`, letterKeys.length === 29 && new Set(letterKeys.map((k) => k.dataset.char)).size === 29 && letterKeys.every((k) => Object.hasOwn(YAZ_NAMES, k.dataset.char)));
  const nameProblems = [];
  for (const k of letterKeys) {
    const ch = k.dataset.char;
    const sr = k.querySelector(":scope > .sr-only");
    const ok = k.getAttribute("lang") === "ar" && k.firstChild && k.firstChild.nodeType === 3 && k.firstChild.nodeValue === ch
      && !!sr && sr.getAttribute("lang") === "tr" && sr.textContent === ` ${YAZ_NAMES[ch]}` && k.textContent === `${ch} ${YAZ_NAMES[ch]}`
      && !k.hasAttribute("aria-label") && !k.hasAttribute("aria-labelledby") && k.getAttribute("type") === "button";
    if (!ok) nameProblems.push(ch);
  }
  check(`harf tuşları: görünen Arapça harf (lang="ar") + Türkçe okunuşu (.sr-only lang="tr") = erişilebilir ad ('ب be'); aria-label ile ezilmiyor, harf adın içinde (WCAG 2.5.3) (sorunlu: ${nameProblems.join(" ") || "yok"})`, nameProblems.length === 0 && letterKeys.length === 29);
  const hintKey = kb && kb.querySelector(".yaz-key[data-hint]");
  check("💡 tuşu: adı 'İpucu: kelimenin Türkçe anlamı' (değişmedi), harf tuşu değil", !!hintKey && hintKey.getAttribute("aria-label") === "İpucu: kelimenin Türkçe anlamı" && !hintKey.hasAttribute("data-char"));
  const hintText = D.getElementById("yaz-hint-text");
  check("#yaz-hint-text: klavyenin içinde, başlangıçta hidden, canlı bölge değil (duyuru #nav-announcer'dan)", !!hintText && kb.contains(hintText) && hintText.hidden === true && !hintText.hasAttribute("aria-live") && !hintText.hasAttribute("role"));
  kb.hidden = false;
  const stops = tabbablesIn(kb);
  check(`Yaz klavyesi: 30 tuşun HEPSİ ayrı Tab durağı (tabindex yok; Tab davranışı değişmedi) ve DOM sırası görünen sıra (bulunan: ${stops.length})`, stops.length === 30 && stops.every((e) => !e.hasAttribute("tabindex")) && stops[0].dataset.char === "ا" && stops[29].hasAttribute("data-hint"));
  kb.hidden = true;
  const modalTabbables = [...D.querySelectorAll(".bottombar button")].map((b) => b.id);
  check(`klavye DOM'da alt çubuktan SONRA (Tab: Bitir, Oynat, Arama, sonra tuşlar; bulunan alt çubuk: ${modalTabbables.join(", ")})`, !!(bar.compareDocumentPosition(kb) & 4 /* FOLLOWING */));
}

// -- (2) css/style.css -------------------------------------------------------------------------------------
const cssRules = [...new JSDOM(`<style>${css}</style>`).window.document.styleSheets[0].cssRules].filter((r) => r.selectorText);
const rules = (selector) => cssRules.filter((r) => r.selectorText === selector);
const propsOf = (r) => Object.fromEntries(Array.from({ length: r.style.length }, (_, i) => [r.style[i], r.style.getPropertyValue(r.style[i]).trim()]));
const srOnly = rules(".sr-only")[0];
const focusRule = rules(".ezber-reveal-btn:focus-visible")[0];
check("css: .sr-only ve .ezber-reveal-btn:focus-visible kuralları var", !!srOnly && !!focusRule);
if (srOnly && focusRule) {
  const hide = propsOf(srOnly);
  const show = propsOf(focusRule);
  const missing = Object.keys(hide).filter((p) => p !== "position" && !(p in show));
  check(`css: .sr-only'nin kırptığı her özellik odakta geri alınıyor (position hariç; eksik: ${missing.join(", ") || "yok"})`, missing.length === 0);
  check("css: odakta kırpma gerçekten kalkıyor: clip auto, overflow visible, width/height auto, margin 0, white-space değişiyor", show.clip === "auto" && show.overflow === "visible" && show.width === "auto" && show.height === "auto" && show.margin === "0" && show["white-space"] !== hide["white-space"]);
  check("css: odakta mutlak konum (position yeniden verilmiyor: .sr-only'den geliyor) ve dört kenar belirli -> alt çubuğu dolduruyor", !("position" in show) && hide.position === "absolute" && ["top", "right", "bottom", "left"].every((p) => p in show));
}
const revealRules = cssRules.filter((r) => /ezber-reveal/.test(r.selectorText));
check("css: .ezber-reveal-btn kurallarında `display` YOK (hidden niteliği ezilmesin; bkz. .info-detail-back[hidden] dersi)", revealRules.length > 0 && revealRules.every((r) => r.style.getPropertyValue("display") === ""));
check("css: odak halkası kapatılmıyor (outline: none/0 yok; genel button:focus-visible halkası geçerli)", revealRules.every((r) => !/^(none|0)\b/.test(r.style.getPropertyValue("outline").trim())) && !!rules("select:focus-visible, input:focus-visible, button:focus-visible")[0]);
check("css: .bottombar position: relative (düğmenin konum çerçevesi açıkça belli)", rules(".bottombar").some((r) => r.style.getPropertyValue("position") === "relative"));
{
  // Metin/zemin kontrastı (WCAG 1.4.3): beyaz yazı x --emerald dolgusu.
  const tokens = {};
  for (const r of cssRules) if (r.selectorText === ":root") for (const [k, v] of Object.entries(propsOf(r))) if (k.startsWith("--")) tokens[k] = v;
  const hex = (h) => {
    const m = /^#([0-9a-f]{6})$/i.exec(h);
    return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null;
  };
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const resolve = (v) => { const m = /^var\((--[\w-]+)\)$/.exec(v || ""); return m ? tokens[m[1]] : v; };
  const bg = hex(resolve(focusRule && propsOf(focusRule).background));
  const fg = hex(resolve(focusRule && propsOf(focusRule).color)) || (focusRule && propsOf(focusRule).color === "#fff" ? [255, 255, 255] : null);
  const ratio = bg && fg ? (Math.max(lum(bg), lum(fg)) + 0.05) / (Math.min(lum(bg), lum(fg)) + 0.05) : 0;
  check(`css: odaktaki düğme yazısı/zemini >= 4,5:1 (ölçülen ${ratio.toFixed(2)}:1)`, ratio >= 4.5);
}

// -- (3) Gerçek işlevler x gerçek DOM -----------------------------------------------------------------------
// Bir işlevin tam metni (imza + gövde), süslü parantezleri sayarak; şablon dizgelerindeki ${...} dengeli.
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
const ANNOUNCE_BLOCK = /\/\/ <announce>([\s\S]*?)\/\/ <\/announce>/.exec(appSource);
const NAMES = ["ezberRevealAnnouncement", "ezberRevealNextWord", "onEzberStudyTap", "setupEzberReveal", "ezberStudyGoToAyah", "ezberStudyPlayAyahThenAdvance", "startEzberStudy", "endEzberStudy", "ezberBaseChar", "ezberYazAnnouncement", "handleEzberYazKeyPress", "toggleEzberYazHint", "onEzberYazPhysicalKey", "onEzberYazKeyboardKeydown", "setupEzberYazKeyboard"];
const SRCS = Object.fromEntries(NAMES.map((n) => [n, fnSource(n)]));
// Modül düzeyindeki iki sabit: harf eşleştirme tablosu ve fiziksel tuş deseni (kaynaktan aynen çıkarılıyor).
const BASE_MAP_SRC = /const ARABIC_BASE_MAP = \{[\s\S]*?\n\};/.exec(appSource);
const PHYS_RE_SRC = /const YAZ_PHYSICAL_KEY = [^\n]+;/.exec(appSource);
check(`app.js: gerekli işlevlerin hepsi bulundu (eksik: ${NAMES.filter((n) => !SRCS[n]).join(", ") || "yok"}), ARABIC_BASE_MAP ve YAZ_PHYSICAL_KEY sabitleri ve <announce> bloğu var`, NAMES.every((n) => SRCS[n]) && !!ANNOUNCE_BLOCK && !!BASE_MAP_SRC && !!PHYS_RE_SRC);

const STUB_NAMES = ["ezberRenderCoverState", "ezberWordMealText", "showEzberWordTooltip", "ayahPage", "showPage", "ezberBuildUnits", "recitationAudioUrl", "stopPlayback", "isWordMealDataReady", "loadWordMealData", "syncAyahNav", "positionYazKeyboard", "drawEzberCovers"];

function makeHarness({ mode = "oku", glosses = {}, wordIds = [10, 11, 12], mealReady = true, units = null } = {}) {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const d = dom.window.document;
  const els = {};
  for (const [key, id] of Object.entries({ ezberBtn: "ezber-btn", ezberReveal: "ezber-reveal", yazKeyboard: "yaz-keyboard", yazHintText: "yaz-hint-text", navAnnouncer: "nav-announcer", playBtn: "play-btn" })) els[key] = d.getElementById(id);
  // Chromium, odaktaki bir öğe gizlenince (hidden -> display:none) odağı <body>'ye düşürür; jsdom düşürmez. Taklit (Oku'nun düğmesi
  // ve Yaz klavyesi için; klavyenin içindeki herhangi bir tuş odaktaysa):
  for (const el of [els.ezberReveal, els.yazKeyboard]) {
    Object.defineProperty(el, "hidden", {
      get() { return this.hasAttribute("hidden"); },
      set(v) { if (v && this.contains(d.activeElement)) d.activeElement.blur(); this.toggleAttribute("hidden", !!v); },
    });
  }
  const svg = d.createElementNS("http://www.w3.org/2000/svg", "svg");
  const segs = wordIds.map((id) => ({ wordId: id, xMin: 0, xMax: 1, baselineY: 100 }));
  const state = {
    currentPage: 1,
    selectedAyah: { surah: 1, ayah: 1 },
    surahs: { 1: { nameTurkish: "Fâtiha" } },
    currentPageSvg: svg,
    currentPageWordSegments: segs,
    playback: { audio: null },
    openModalEl: null,
    ezberStudy: { mode, surah: 1, from: 1, to: 2, currentAyah: 1, units: units || wordIds.map((wordId) => ({ wordId })), revealedCount: 0, expectedPage: 1 },
  };
  const calls = { render: 0, tooltip: [], play: 0, showPage: [], buildUnits: [], loadMeal: 0, sync: 0, drawCovers: [], drawCoversSvg: [], stopPlayback: 0, yazPos: 0, warn: [], errors: [] };
  // Dinleyicide fırlatılan hata jsdom'da tıklamayı yapanın değil pencerenin 'error' olayına gider: yakalayıp kaydediyoruz.
  dom.window.addEventListener("error", (e) => { calls.errors.push(e.message); e.preventDefault(); });
  let ready = mealReady;
  const stubs = {
    ezberRenderCoverState: () => { calls.render++; },
    ezberWordMealText: (surah, ayah, wordId) => glosses[wordId] || "",
    showEzberWordTooltip: (svgEl, seg, text) => calls.tooltip.push([seg.wordId, text]),
    ayahPage: () => 1,
    showPage: async (page, opts) => {
      calls.showPage.push([page, opts && opts.ayah && opts.ayah.ayah]);
      state.selectedAyah = opts.ayah; // gerçek showPage de seçili ayeti yazıp announceNavigation() çağırıyor
      api.announceNavigation();
    },
    ezberBuildUnits: (m, s, a) => { calls.buildUnits.push(a); return [{ wordId: 20 }, { wordId: 21 }, { wordId: 22 }, { wordId: 23 }]; },
    recitationAudioUrl: (s, a) => `audio/${s}-${a}.mp3`,
    stopPlayback: () => { calls.stopPlayback++; },
    isWordMealDataReady: () => ready,
    loadWordMealData: () => { calls.loadMeal++; return stubs.loadResult(); },
    loadResult: () => Promise.resolve({}),
    syncAyahNav: () => { calls.sync++; },
    positionYazKeyboard: () => { calls.yazPos++; },
    drawEzberCovers: (s, defs) => { calls.drawCovers.push(defs.length); calls.drawCoversSvg.push(s); },
  };
  // Sahte <audio>: EventTarget + play()/src; testler "ended" / "error" / reddi elle tetikliyor.
  const audio = new dom.window.EventTarget();
  audio.play = () => { calls.play++; return audio._playResult(); };
  audio._playResult = () => Promise.resolve();
  audio.pause = () => {};
  state.playback.audio = audio;
  // ezberStudyPlayAyahThenAdvance GERÇEK işlev; "ses çaldı" sayısını sahte <audio>'nun play()'inden alıyoruz, böylece
  // ezberRevealNextWord -> ezberStudyPlayAyahThenAdvance -> audio.play() zincirinin tamamı sınanıyor.
  const body = `${ANNOUNCE_BLOCK[1]}\nlet ezberStudyAudioGuard = 0;\n${BASE_MAP_SRC[0]}\n${PHYS_RE_SRC[0]}\n${NAMES.map((n) => SRCS[n]).join("\n")}\nreturn { announce, announceNavigation, ${NAMES.join(", ")} };`;
  const consoleStub = { warn: (...a) => calls.warn.push(a.join(" ")), log() {}, error() {} };
  const api = new Function("state", "els", "document", "window", "console", ...STUB_NAMES, body)(state, els, d, dom.window, consoleStub, ...STUB_NAMES.map((n) => stubs[n]));
  return { dom, d, els, state, calls, stubs, api, audio, setReady: (v) => { ready = v; } };
}
const live = (h) => h.els.navAnnouncer.textContent;

if (NAMES.every((n) => SRCS[n]) && ANNOUNCE_BLOCK) {
  // ---- duyuru metni ----
  {
    const { api } = makeHarness();
    const f = api.ezberRevealAnnouncement;
    check("duyuru: karşılıkla -> '1. kelime: adıyla'", f(1, 4, "adıyla") === "1. kelime: adıyla");
    check("duyuru: karşılık yoksa yalnızca '2. kelime' (boş ': ' yok)", f(2, 4, "") === "2. kelime");
    check("duyuru: son kelimede '. Ayet tamamlandı' ekleniyor", f(4, 4, "Rahim") === "4. kelime: Rahim. Ayet tamamlandı");
    check("duyuru: tek kelimelik ayet hem ilk hem son", f(1, 1, "") === "1. kelime. Ayet tamamlandı");
    check("duyuru: ara kelimede 'Ayet tamamlandı' YOK", !/tamamlandı/.test(f(3, 4, "Rahman")));
  }

  // ---- düğme: bir tıklama = bir kelime ----
  {
    const h = makeHarness({ glosses: { 10: "adıyla", 11: "Allah'ın" } });
    h.api.setupEzberReveal();
    h.els.ezberReveal.hidden = false;
    h.els.ezberReveal.click();
    check("düğme: bir tıklama tam bir kelime açıyor (revealedCount 1)", h.state.ezberStudy.revealedCount === 1);
    check("düğme: kapaklar yeniden çiziliyor (ezberRenderCoverState bir kez)", h.calls.render === 1);
    check("düğme: açılan kelimenin baloncuğu gösteriliyor (dokunmayla aynı: kelime 10, 'adıyla')", JSON.stringify(h.calls.tooltip) === JSON.stringify([[10, "adıyla"]]));
    check("düğme: duyuru gecikmeli yazılıyor (bölge önce boş)", live(h) === "");
    await sleep(90);
    check("düğme: '#nav-announcer' = '1. kelime: adıyla'", live(h) === "1. kelime: adıyla");
    h.els.ezberReveal.click();
    await sleep(90);
    check("ikinci tıklama: '2. kelime: Allah'ın' (öncekinin artığı yok)", live(h) === "2. kelime: Allah'ın" && h.state.ezberStudy.revealedCount === 2);
    check("ayet bitmeden ses çalmıyor", h.calls.play === 0);
    h.els.ezberReveal.click(); // 3. kelime: karşılığı yok
    await sleep(90);
    check("karşılığı olmayan son kelime: baloncuk YOK, duyuru '3. kelime. Ayet tamamlandı'", h.calls.tooltip.length === 2 && live(h) === "3. kelime. Ayet tamamlandı");
    check("son kelimede ayetin sesi bir kez çalmaya başlıyor (ezberStudyPlayAyahThenAdvance)", h.calls.play === 1);
    const before = { render: h.calls.render, play: h.calls.play, tip: h.calls.tooltip.length };
    h.els.ezberReveal.click();
    h.els.ezberReveal.click();
    await sleep(90);
    check("ayet tamamlandıktan sonra (ses çalarken / sonraki ayet yüklenirken) tıklama ETKİSİZ: kelime, kapak, baloncuk, ses, duyuru değişmiyor", h.state.ezberStudy.revealedCount === 3 && h.calls.render === before.render && h.calls.play === before.play && h.calls.tooltip.length === before.tip && live(h) === "3. kelime. Ayet tamamlandı");
    check(`ayet tamamlandıktan sonraki tıklamalar HATA FIRLATMIYOR (olmayan bir birime erişilmiyor; bulunan: ${h.calls.errors.join(" | ") || "yok"})`, h.calls.errors.length === 0);
  }
  {
    // Hızlı art arda iki basış (tuş tekrarı): yalnızca SONUNCUSU söylenir, ama ikisi de kelime açar.
    const h = makeHarness({ glosses: { 10: "adıyla", 11: "Allah'ın" } });
    h.api.setupEzberReveal();
    h.els.ezberReveal.click();
    h.els.ezberReveal.click();
    await sleep(90);
    check("hızlı iki tıklama: iki kelime açıldı, duyuruda yalnızca sonuncusu (birikmiyor)", h.state.ezberStudy.revealedCount === 2 && live(h) === "2. kelime: Allah'ın");
  }

  // ---- dokunma yolu: aynı işlev ----
  {
    const h = makeHarness({ glosses: { 10: "adıyla" } });
    h.api.onEzberStudyTap({ surah: 1, ayah: 1 });
    await sleep(90);
    check("dokunma (güncel ayet): kelime açılıyor, baloncuk ve duyuru DÜĞMEYLE AYNI", h.state.ezberStudy.revealedCount === 1 && JSON.stringify(h.calls.tooltip) === JSON.stringify([[10, "adıyla"]]) && live(h) === "1. kelime: adıyla");
    h.api.onEzberStudyTap({ surah: 1, ayah: 2 });
    h.api.onEzberStudyTap({ surah: 2, ayah: 1 });
    await sleep(90);
    check("dokunma: başka ayet / başka sure YOK SAYILIYOR (kelime açılmıyor, yeni duyuru yok)", h.state.ezberStudy.revealedCount === 1 && live(h) === "1. kelime: adıyla");
  }
  for (const [label, mutate] of [
    ["Yaz oturumu", (st) => { st.ezberStudy.mode = "yaz"; }],
    ["oturum yok", (st) => { st.ezberStudy = null; }],
  ]) {
    const h = makeHarness({ glosses: { 10: "adıyla" } });
    mutate(h.state);
    h.api.setupEzberReveal();
    h.els.ezberReveal.click();
    h.api.onEzberStudyTap({ surah: 1, ayah: 1 });
    await sleep(90);
    check(`${label}: düğme de dokunma da hiçbir şey yapmıyor (kapak, baloncuk, duyuru, ses yok)`, h.calls.render === 0 && h.calls.tooltip.length === 0 && live(h) === "" && h.calls.play === 0);
  }

  // ---- oturum başlangıcı ----
  for (const mode of ["oku", "yaz"]) {
    const h = makeHarness({ mode, mealReady: false });
    h.state.ezberStudy = null;
    h.els.ezberBtn.focus(); // closeModal, odağı açan düğmeye (Ezber) senkron geri veriyor
    await h.api.startEzberStudy(mode, 1, 1, 2);
    await sleep(90);
    check(`${mode}: Türkçe karşılık verisi istendi (ayet paneli/arama hiç açılmamış olsa da; Oku'da eskiden hiç istenmiyordu)`, h.calls.loadMeal === 1);
    check(`${mode}: düğme metni 'Bitir', ayet gezgini eşitlendi, oturum kuruldu`, h.els.ezberBtn.textContent === "Bitir" && h.calls.sync === 1 && h.state.ezberStudy && h.state.ezberStudy.mode === mode);
    if (mode === "oku") {
      check("oku: #ezber-reveal görünür (hidden kalktı) ve ODAK ONDA (Ezber/Bitir'de değil)", h.els.ezberReveal.hidden === false && h.d.activeElement === h.els.ezberReveal);
      check("oku: Yaz klavyesi gizli", h.els.yazKeyboard.hidden === true);
      check("oku: duyuru 'Oku çalışması başladı. Sayfa 1, Fâtiha Suresi, 1. ayet. Bu ayette 4 kelime var' (aynı pencerede TEK metin)", live(h) === "Oku çalışması başladı. Sayfa 1, Fâtiha Suresi, 1. ayet. Bu ayette 4 kelime var");
    } else {
      const firstKey = h.els.yazKeyboard.querySelector(".yaz-key");
      check("yaz: #ezber-reveal GİZLİ kalıyor (Oku'ya özgü; Yaz'da Tab durağı değil)", h.els.ezberReveal.hidden === true);
      check("yaz: ODAK İLK TUŞTA ('ا'); Bitir'de değil (Bitir'den ilk tuşa 3 Tab gerekiyordu). İlk tuş cevabı ele vermiyor: alfabe sırasının ilki", h.d.activeElement === firstKey && firstKey.dataset.char === "ا");
      check("yaz: Yaz klavyesi görünür, konumlandı", h.els.yazKeyboard.hidden === false && h.calls.yazPos === 1);
      check("yaz: duyuru 'Yaz çalışması başladı. Sayfa 1, Fâtiha Suresi, 1. ayet. Bu ayette 4 harf var' (aynı pencerede TEK metin; birim sayısı Yaz'da harf)", live(h) === "Yaz çalışması başladı. Sayfa 1, Fâtiha Suresi, 1. ayet. Bu ayette 4 harf var");
    }
  }
  {
    const h = makeHarness({ mealReady: true });
    h.state.ezberStudy = null;
    await h.api.startEzberStudy("oku", 1, 1, 2);
    check("veri zaten yüklüyse yeniden istenmiyor", h.calls.loadMeal === 0);
  }
  {
    // Oku çalışırken (düğme görünür) oturum bitirilmeden Yaz başlatılırsa düğme gizlenmeli (Yaz'da Tab durağı olmasın).
    const h = makeHarness();
    h.state.ezberStudy = null;
    h.els.ezberReveal.hidden = false;
    await h.api.startEzberStudy("yaz", 1, 1, 2);
    check("Oku'dan doğrudan Yaz'a geçiş: #ezber-reveal GİZLENİYOR", h.els.ezberReveal.hidden === true);
  }
  {
    const h = makeHarness({ mealReady: false });
    h.state.ezberStudy = null;
    h.stubs.loadResult = () => Promise.reject(new Error("404"));
    let threw = false;
    try { await h.api.startEzberStudy("oku", 1, 1, 2); await sleep(30); } catch { threw = true; }
    check("veri yüklenemese de oturum başlıyor (hata yalnızca uyarıya düşüyor, yakalanmamış reddedilme yok)", !threw && !!h.state.ezberStudy && h.calls.warn.length === 1 && /gloss/.test(h.calls.warn[0]));
  }

  // ---- ayet geçişi duyurusu ----
  {
    const h = makeHarness();
    await h.api.ezberStudyGoToAyah(2);
    await sleep(90);
    check("ayete geçiş (Oku): 'Sayfa 1, Fâtiha Suresi, 2. ayet. Bu ayette 4 kelime var' (nav + kelime sayısı TEK metin; sayı YENİ ayetin birimlerinden)", live(h) === "Sayfa 1, Fâtiha Suresi, 2. ayet. Bu ayette 4 kelime var" && h.state.ezberStudy.units.length === 4 && h.state.ezberStudy.revealedCount === 0);
  }
  {
    const h = makeHarness({ mode: "yaz" });
    await h.api.ezberStudyGoToAyah(2);
    await sleep(90);
    check("ayete geçiş (Yaz): 'Sayfa 1, Fâtiha Suresi, 2. ayet. Bu ayette 4 harf var' (Oku'da kelime, Yaz'da harf; sayı YENİ ayetin birimlerinden; eskiden yalnızca konum duyuruluyordu)", live(h) === "Sayfa 1, Fâtiha Suresi, 2. ayet. Bu ayette 4 harf var" && h.state.ezberStudy.units.length === 4);
  }
  {
    const h = makeHarness();
    const p = h.api.ezberStudyGoToAyah(2);
    h.state.ezberStudy = null; // showPage beklerken oturum bitti
    await p;
    await sleep(90);
    check("ayete geçiş: yüklenirken oturum biterse kelime sayısı duyurulmuyor (ve çökmüyor)", !/kelime var/.test(live(h)));
  }

  // ---- oturum sonu ve odak ----
  {
    const h = makeHarness();
    h.els.ezberReveal.hidden = false;
    h.els.ezberReveal.focus();
    h.api.endEzberStudy();
    await sleep(90);
    check("bitiş: odak düğmedeyse (Chromium gizlenince <body>'ye düşürürdü) ODAK EZBER DÜĞMESİNE gidiyor", h.d.activeElement === h.els.ezberBtn);
    check("bitiş: düğme hidden, metin 'Ezber', gezgin eşitlendi, oturum null", h.els.ezberReveal.hidden === true && h.els.ezberBtn.textContent === "Ezber" && h.calls.sync === 1 && h.state.ezberStudy === null);
    check("bitiş: duyuru 'Ezber çalışması bitti'", live(h) === "Ezber çalışması bitti");
    // Kapaklar KALKMALI ve kapaklarla birlikte metin katmanındaki gizleme işaretleri de (drawEzberCovers(svg, []) ikisini birden temizliyor;
    // bkz. test/ezber_metin_katmani_test.mjs): bu çağrı olmazsa kapaklar sayfada, kapaktaki kelimeler ağaçta gizli kalırdı.
    check("bitiş: kapaklar ve metin katmanı işaretleri temizleniyor: drawEzberCovers(GEÇERLİ sayfa SVG'si, []) tam bir kez", h.calls.drawCovers.length === 1 && h.calls.drawCovers[0] === 0 && h.calls.drawCoversSvg[0] === h.state.currentPageSvg);
  }
  {
    const h = makeHarness();
    h.els.ezberReveal.hidden = false;
    h.els.playBtn.focus();
    h.api.endEzberStudy();
    check("bitiş: odak başka yerdeyse (Oynat) ona DOKUNULMUYOR", h.d.activeElement === h.els.playBtn);
  }
  {
    const h = makeHarness();
    h.els.ezberReveal.hidden = false;
    h.d.activeElement && h.d.activeElement.blur();
    h.api.endEzberStudy();
    check("bitiş: odak zaten <body>'deyse Ezber düğmesine ÇEKİLMİYOR (kullanıcının odağı çalınmıyor)", h.d.activeElement === h.d.body);
  }
  {
    const h = makeHarness();
    h.state.ezberStudy = null;
    h.api.endEzberStudy();
    await sleep(90);
    check("oturum yokken endEzberStudy çağrılırsa hiçbir şey yapmıyor (sahte 'bitti' duyurusu yok, kapaklara dokunulmuyor)", live(h) === "" && h.calls.sync === 0 && h.calls.drawCovers.length === 0);
  }
  {
    // showPage'in koruması da oturumu bitiriyor (ok tuşuyla sayfa çevirme): bitiş + gezinme duyuruları TEK metin, bitiş önce.
    const h = makeHarness();
    h.els.ezberReveal.hidden = false;
    h.els.ezberReveal.focus();
    h.api.endEzberStudy();
    h.state.selectedAyah = { surah: 1, ayah: 1 };
    h.api.announceNavigation();
    await sleep(90);
    check("ok tuşuyla sayfa çevirme: 'Ezber çalışması bitti. Sayfa 1, Fâtiha Suresi, 1. ayet' (bitiş önce, tek metin)", live(h) === "Ezber çalışması bitti. Sayfa 1, Fâtiha Suresi, 1. ayet");
  }

  // ======================= YAZ =======================
  // "بسم" (kelime 10) + "الله" (kelime 11): 7 harf birimi, 2 kelime; Türkçe karşılıkları 'adıyla' / "Allah'ın".
  const yazUnits = (spec) => spec.flatMap(([wordId, letters]) => [...letters].map((baseChar, unitIndex) => ({ wordId, unitIndex, baseChar })));
  const YAZ_AYAH = [[10, "بسم"], [11, "الله"]];
  const yazHarness = (opts = {}) => {
    const h = makeHarness({ mode: "yaz", units: yazUnits(YAZ_AYAH), glosses: { 10: "adıyla", 11: "Allah'ın" }, ...opts });
    h.api.setupEzberYazKeyboard();
    h.els.yazKeyboard.hidden = false;
    h.key = (ch) => h.els.yazKeyboard.querySelector(`.yaz-key[data-char="${ch}"]`);
    h.hintKey = h.els.yazKeyboard.querySelector(".yaz-key[data-hint]");
    return h;
  };
  const keydown = (h, init, target) => {
    const ev = new h.dom.window.KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    (target || h.d.body).dispatchEvent(ev);
    return ev;
  };

  // ---- Yaz: duyuru metinleri ve harf eşleştirme (ekran tuşları) ----
  {
    const { api } = makeHarness({ mode: "yaz" });
    const f = api.ezberYazAnnouncement;
    check("Yaz duyurusu: kelime ortasındaki harf -> 'Doğru'", f(false, false) === "Doğru");
    check("Yaz duyurusu: kelimenin son harfi -> 'Doğru. Kelime tamamlandı'", f(true, false) === "Doğru. Kelime tamamlandı");
    check("Yaz duyurusu: ayetin son harfi -> 'Doğru. Ayet tamamlandı' (aynı zamanda kelime sonu: ayet ağır basıyor)", f(true, true) === "Doğru. Ayet tamamlandı" && f(false, true) === "Doğru. Ayet tamamlandı");
    check("Yaz duyurusu: Arapça harf yok (canlı bölge tek dilli Türkçe)", ![f(false, false), f(true, false), f(true, true), "Bu harf değil"].some((s) => /[؀-ۿ]/.test(s)));
  }
  {
    const h = yazHarness();
    h.key("ب").click();
    check("Yaz ekran tuşu: doğru harf bir harf açıyor, kapaklar yeniden çiziliyor", h.state.ezberStudy.revealedCount === 1 && h.calls.render === 1);
    check("Yaz: duyuru gecikmeli yazılıyor (bölge önce boş)", live(h) === "");
    await sleep(90);
    check("Yaz: doğru harf -> duyuru 'Doğru' (eskiden sessizdi)", live(h) === "Doğru");
    h.key("ت").click(); // sıradaki harf "س"
    await sleep(90);
    check("Yaz: yanlış harf -> harf açılmıyor, kapak yeniden ÇİZİLMİYOR (görsel değişiklik yok), duyuru 'Bu harf değil' (eskiden sessizdi)", h.state.ezberStudy.revealedCount === 1 && h.calls.render === 1 && live(h) === "Bu harf değil");
    check("Yaz: yanlış harf Oku'nun baloncuğunu / sesi tetiklemiyor", h.calls.tooltip.length === 0 && h.calls.play === 0);
  }
  {
    // Tüm ayeti ekran tuşlarıyla yaz; HER harfin duyurusunu ayrı ayrı oku (kelime sınırı wordId'den geliyor, harf sayısından değil).
    const h = yazHarness();
    const seen = [];
    for (const ch of "بسمالله") {
      h.key(ch).click();
      await sleep(70);
      seen.push(live(h));
    }
    const want = ["Doğru", "Doğru", "Doğru. Kelime tamamlandı", "Doğru", "Doğru", "Doğru", "Doğru. Ayet tamamlandı"];
    check(`Yaz: 7 harfin duyuruları sırayla: ${JSON.stringify(seen)}`, JSON.stringify(seen) === JSON.stringify(want));
    check("Yaz: ayetin son harfinde ayetin sesi TAM BİR KEZ çalmaya başlıyor; önceki harflerde çalmıyordu", h.state.ezberStudy.revealedCount === 7 && h.calls.play === 1);
    const before = { render: h.calls.render, play: h.calls.play };
    h.key("ب").click();
    h.key("ت").click();
    h.hintKey.click();
    await sleep(90);
    check(`Yaz: ayet tamamlandıktan sonra (ses çalarken) tuşlar ve 💡 ETKİSİZ ve HATA FIRLATMIYOR (hedef harf yok; bulunan hata: ${h.calls.errors.join(" | ") || "yok"})`, h.state.ezberStudy.revealedCount === 7 && h.calls.render === before.render && h.calls.play === before.play && live(h) === "Doğru. Ayet tamamlandı" && h.els.yazHintText.hidden === true && h.calls.errors.length === 0);
  }
  {
    // Çabuk art arda basışlar (aynı ~50 ms penceresi): yalnızca SON geri bildirim söyleniyor, birikmiyor (hızlı yazan ekran okuyucu
    // kullanıcısı bir önceki harfin duyurusunu beklemek zorunda kalmasın).
    const h = yazHarness();
    h.key("ب").click();
    h.key("س").click();
    await sleep(90);
    check(`Yaz: çabuk art arda iki doğru harf: duyuruda yalnızca sonuncusu (bulunan: '${live(h)}')`, h.state.ezberStudy.revealedCount === 2 && live(h) === "Doğru");
    h.key("ت").click(); // "م" bekleniyor: yanlış
    h.key("م").click(); // doğru: kelime biter
    await sleep(90);
    check(`Yaz: çabuk art arda yanlış + doğru: yalnızca SON geri bildirim (bulunan: '${live(h)}')`, h.state.ezberStudy.revealedCount === 3 && live(h) === "Doğru. Kelime tamamlandı");
    h.key("ا").click(); // doğru
    h.key("ب").click(); // "ل" bekleniyor: yanlış
    await sleep(90);
    check(`Yaz: çabuk art arda doğru + yanlış: yalnızca SON geri bildirim (bulunan: '${live(h)}')`, h.state.ezberStudy.revealedCount === 4 && live(h) === "Bu harf değil");
  }
  {
    // Yazım varyantları: basılan harf normalleştirilip hedefin taban harfiyle karşılaştırılıyor (ARABIC_BASE_MAP).
    const pairs = [["أ", "ا"], ["إ", "ا"], ["آ", "ا"], ["ٱ", "ا"], ["ة", "ه"], ["ؤ", "و"], ["ئ", "ي"], ["ى", "ي"]];
    const bad = [];
    for (const [pressed, base] of pairs) {
      const h = yazHarness({ units: yazUnits([[10, `${base}ب`]]) });
      h.api.handleEzberYazKeyPress(pressed);
      if (h.state.ezberStudy.revealedCount !== 1) bad.push(`${pressed}→${base}`);
    }
    check(`Yaz: yazım varyantları taban harfle eşleşiyor (eşleşmeyen: ${bad.join(" ") || "yok"})`, bad.length === 0);
    const h = yazHarness({ units: yazUnits([[10, "اب"]]) });
    h.api.handleEzberYazKeyPress("ء");
    check("Yaz: tek başına hemze (ء) elif DEĞİL: eşleşmiyor", h.state.ezberStudy.revealedCount === 0);
    check("ezberBaseChar: varyant -> taban, taban harf kendisi", h.api.ezberBaseChar("أ") === "ا" && h.api.ezberBaseChar("ة") === "ه" && h.api.ezberBaseChar("ب") === "ب");
  }
  for (const [label, mutate] of [
    ["Oku oturumu", (st) => { st.ezberStudy.mode = "oku"; }],
    ["oturum yok", (st) => { st.ezberStudy = null; }],
  ]) {
    const h = yazHarness();
    mutate(h.state);
    h.key("ب").click();
    h.hintKey.click();
    let threw = ""; // doğrudan çağrı: fırlatırsa test çökmesin, açık bir FAIL yazsın
    try { h.api.handleEzberYazKeyPress("ب"); } catch (e) { threw = e.message; }
    await sleep(90);
    check(`${label}: Yaz tuşları ve 💡 hiçbir şey yapmıyor (kapak yok, duyuru yok, hata yok; fırlatılan: ${threw || "yok"})`, h.calls.render === 0 && live(h) === "" && h.els.yazHintText.hidden === true && h.calls.errors.length === 0 && threw === "");
  }

  // ---- Yaz: 💡 ipucu ----
  {
    const h = yazHarness();
    h.hintKey.click();
    check("💡: ipucu metni görünüyor, ilk kelimenin Türkçe karşılığı ('adıyla')", h.els.yazHintText.hidden === false && h.els.yazHintText.textContent === "adıyla");
    await sleep(90);
    check("💡 açılınca duyuru 'İpucu: adıyla' (metin canlı bölge olmayan bir <p>'de: eskiden hiç duyulmuyordu)", live(h) === "İpucu: adıyla");
    h.hintKey.click();
    await sleep(90);
    check("💡 ikinci basış: ipucu gizleniyor, duyuru 'İpucu kapatıldı'", h.els.yazHintText.hidden === true && live(h) === "İpucu kapatıldı");
    for (const ch of "بسم") h.api.handleEzberYazKeyPress(ch);
    await sleep(90); // harflerin duyuruları ayrı bir pencerede kalsın (aynı ~50 ms içinde olsalar tek metinde birleşirlerdi)
    h.hintKey.click();
    await sleep(90);
    check("💡: ipucu HEDEF harfin kelimesi için (ilk kelime bitti -> ikinci kelime: \"Allah'ın\")", h.els.yazHintText.textContent === "Allah'ın" && live(h) === "İpucu: Allah'ın");
  }
  {
    const h = yazHarness({ glosses: {} });
    h.hintKey.click();
    await sleep(90);
    check("💡: karşılık yoksa görünen metin '(anlam bulunamadı)', duyuru 'İpucu: anlam bulunamadı' (parantezsiz)", h.els.yazHintText.textContent === "(anlam bulunamadı)" && live(h) === "İpucu: anlam bulunamadı");
  }
  {
    const h = yazHarness();
    h.state.ezberStudy.revealedCount = h.state.ezberStudy.units.length;
    h.hintKey.click();
    await sleep(90);
    check("💡: hedef harf yokken (ayet tamamlandı) hiçbir şey yapmıyor: metin gizli, duyuru yok, hata yok", h.els.yazHintText.hidden === true && live(h) === "" && h.calls.errors.length === 0);
  }

  // ---- Yaz: gerçek (fiziksel) klavyede Arapça düzen ----
  {
    const h = yazHarness();
    const ev = keydown(h, { key: "ب", code: "KeyF" });
    check("fiziksel tuş: Arapça harf (ب; KeyF) bir harf açıyor ve varsayılan eylem iptal ediliyor (preventDefault)", h.state.ezberStudy.revealedCount === 1 && ev.defaultPrevented && h.calls.render === 1);
    await sleep(90);
    check("fiziksel tuş: doğru harf -> 'Doğru' (ekran tuşuyla AYNI duyuru)", live(h) === "Doğru");
    const ev2 = keydown(h, { key: "ت", code: "KeyJ" }); // sıradaki harf "س"
    await sleep(90);
    check("fiziksel tuş: yanlış Arapça harf -> 'Bu harf değil', harf açılmıyor, kapak çizilmiyor, varsayılan eylem iptal", h.state.ezberStudy.revealedCount === 1 && h.calls.render === 1 && live(h) === "Bu harf değil" && ev2.defaultPrevented);
    for (const ch of "سم") keydown(h, { key: ch });
    await sleep(90);
    check("fiziksel tuş: kelimenin son harfi 'Doğru. Kelime tamamlandı' (ekran tuşuyla aynı mantık)", h.state.ezberStudy.revealedCount === 3 && live(h) === "Doğru. Kelime tamamlandı");
    const onKey = keydown(h, { key: "ا" }, h.key("ب"));
    check("fiziksel tuş: odak bir ekran tuşundayken de (olay tuştan kabarıyor) TAM BİR KEZ işleniyor", h.state.ezberStudy.revealedCount === 4 && onKey.defaultPrevented);
  }
  {
    const h = yazHarness({ units: yazUnits([[10, "لا"], [11, "ب"]]) });
    const ev = keydown(h, { key: "لا" });
    await sleep(90);
    check("fiziksel tuş: tek tuşta iki harf ('لا') sırayla işleniyor: ل sonra ا (2 harf açıldı), son harf kelimeyi bitiriyor", h.state.ezberStudy.revealedCount === 2 && ev.defaultPrevented && live(h) === "Doğru. Kelime tamamlandı");
    const h2 = yazHarness({ units: yazUnits([[10, "لب"]]) });
    keydown(h2, { key: "لا" });
    await sleep(90);
    check("fiziksel tuş: 'لا' ama ikinci harf yanlış: ل açılıyor, ا reddediliyor ('Bu harf değil')", h2.state.ezberStudy.revealedCount === 1 && live(h2) === "Bu harf değil");
  }
  {
    // Fiziksel tuşun kabul ettiği küme = ekran klavyesindeki HER harf + eşleştirmenin tanıdığı yazım varyantları.
    const ALL = Object.keys(YAZ_NAMES).join("");
    const h = yazHarness({ units: yazUnits([[10, ALL]]) });
    const missed = [];
    for (const ch of ALL) {
      const before = h.state.ezberStudy.revealedCount;
      const ev = keydown(h, { key: ch });
      if (h.state.ezberStudy.revealedCount !== before + 1 || !ev.defaultPrevented) missed.push(ch);
    }
    check(`fiziksel tuş: ekran klavyesindeki ${ALL.length} harfin HEPSİ fiziksel tuşla da kabul ediliyor (kabul edilmeyen: ${missed.join(" ") || "yok"})`, ALL.length === 29 && missed.length === 0 && h.state.ezberStudy.revealedCount === 29);
    const pairs = [["أ", "ا"], ["إ", "ا"], ["آ", "ا"], ["ٱ", "ا"], ["ة", "ه"], ["ؤ", "و"], ["ئ", "ي"], ["ى", "ي"]];
    const h2 = yazHarness({ units: yazUnits([[10, pairs.map((p) => p[1]).join("")]]) });
    const missed2 = [];
    for (const [pressed] of pairs) {
      const before = h2.state.ezberStudy.revealedCount;
      const ev = keydown(h2, { key: pressed });
      if (h2.state.ezberStudy.revealedCount !== before + 1 || !ev.defaultPrevented) missed2.push(pressed);
    }
    check(`fiziksel tuş: yazım varyantları da kabul ediliyor (${pairs.map((p) => p.join("→")).join(" ")}; kabul edilmeyen: ${missed2.join(" ") || "yok"})`, missed2.length === 0);
  }
  {
    // Yok sayılması gerekenler: hiçbirinde harf açılmaz, duyuru olmaz, varsayılan eylem iptal EDİLMEZ (tarayıcı kısayolları, Tab, Enter...).
    const cases = [
      ["Latin harf 'b'", { key: "b" }],
      ["Latin harf 'B' (Shift)", { key: "B", shiftKey: true }],
      ["rakam '1'", { key: "1" }],
      ["Arap-Hint rakamı '١'", { key: "١" }],
      ["Enter", { key: "Enter" }],
      ["boşluk", { key: " " }],
      ["Tab", { key: "Tab" }],
      ["Sağ ok", { key: "ArrowRight" }],
      ["Sol ok", { key: "ArrowLeft" }],
      ["Escape", { key: "Escape" }],
      ["tatweel (ـ)", { key: "ـ" }],
      ["fetha harekesi (َ)", { key: "َ" }],
      ["Arapça virgül (،)", { key: "،" }],
      ["Arapça soru işareti (؟)", { key: "؟" }],
      ["IME 'Process'", { key: "Process" }],
      ["Ctrl+ب (tarayıcı kısayolu)", { key: "ب", ctrlKey: true }],
      ["Alt+ب", { key: "ب", altKey: true }],
      ["Meta+ب", { key: "ب", metaKey: true }],
      ["tuş tekrarı (basılı tutma)", { key: "ب", repeat: true }],
      ["IME bileşimi", { key: "ب", isComposing: true }],
    ];
    const runs = cases.map(([label, init]) => { const h = yazHarness(); return { label, h, ev: keydown(h, init) }; });
    await sleep(90);
    const bad = runs.filter(({ h, ev }) => h.state.ezberStudy.revealedCount !== 0 || h.calls.render !== 0 || live(h) !== "" || ev.defaultPrevented).map((r) => r.label);
    check(`fiziksel tuş: ${cases.length} harf-dışı / değiştiricili / tekrarlı / bileşimli tuş YOK SAYILIYOR (harf açılmaz, duyuru yok, varsayılan eylem iptal edilmez; sorunlu: ${bad.join(", ") || "yok"})`, bad.length === 0);
  }
  {
    // Bağlam: Yaz oturumu yok / Oku / modal açık / giriş alanı / zaten iptal edilmiş.
    const ctx = [
      ["Oku oturumu", (h) => { h.state.ezberStudy.mode = "oku"; }],
      ["oturum yok", (h) => { h.state.ezberStudy = null; }],
      ["bir modal açıkken (Arama kutusuna Arapça yazılıyor olabilir)", (h) => { h.state.openModalEl = h.d.body; }],
      ["önceki bir dinleyici olayı zaten iptal etmişken", (h) => { h.d.body.addEventListener("keydown", (e) => e.preventDefault()); }],
    ];
    const runs = [];
    for (const [label, setup] of ctx) {
      const h = yazHarness();
      setup(h);
      runs.push({ label, h, ev: keydown(h, { key: "ب" }) });
    }
    for (const [label, tag, attrs] of [["<input>", "input", { type: "text" }], ["<textarea>", "textarea", {}], ["<select>", "select", {}], ["contenteditable", "div", { contenteditable: "true" }]]) {
      const h = yazHarness();
      const field = h.d.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) field.setAttribute(k, v);
      h.d.body.appendChild(field);
      runs.push({ label: `${label} içinde yazılırken`, h, ev: keydown(h, { key: "ب" }, field) });
    }
    await sleep(90);
    const bad = runs.filter(({ h, ev }) => (h.state.ezberStudy && h.state.ezberStudy.revealedCount !== 0) || h.calls.render !== 0 || live(h) !== "" || (ev.defaultPrevented && !runs.find((r) => r.ev === ev && r.label.startsWith("önceki")))).map((r) => r.label);
    check(`fiziksel tuş: ${runs.length} bağlamda YOK SAYILIYOR (${runs.map((r) => r.label).join("; ")}); sorunlu: ${bad.join(", ") || "yok"}`, bad.length === 0);
    check("fiziksel tuş: yok sayılan bağlamlarda hata fırlatılmıyor (oturum yokken de)", runs.every(({ h }) => h.calls.errors.length === 0));
  }

  // ---- Yaz: ekran klavyesinde ok tuşlarıyla gezinme ----
  {
    const h = yazHarness();
    const docSeen = [];
    // setupNav'ın document'teki sayfa çevirme dinleyicisinin yerini tutuyor: ok tuşu buraya ULAŞIRSA sayfa çevrilir, oturum biter.
    h.d.addEventListener("keydown", (e) => docSeen.push(e.key));
    const keys = [...h.els.yazKeyboard.querySelectorAll(".yaz-key")];
    const press = (idx, key, extra = {}) => { keys[idx].focus(); return keydown(h, { key, ...extra }, keys[idx]); };
    const at = () => keys.indexOf(h.d.activeElement);
    const trace = [];
    const step = (idx, key) => { const ev = press(idx, key); trace.push({ idx, key, to: at(), prevented: ev.defaultPrevented }); return trace[trace.length - 1]; };
    const t = (idx, key, to) => { const r = step(idx, key); return r.to === to && r.prevented; };
    check("oklar: Sağ -> DOM sırasındaki sonraki tuş (ا -> ب)", t(0, "ArrowRight", 1));
    check("oklar: Sol -> önceki tuş (ب -> ا)", t(1, "ArrowLeft", 0));
    check("oklar: ilk tuşta Sol -> yerinde kalıyor (dönmüyor) AMA olay tüketiliyor (sayfa çevrilmesin)", t(0, "ArrowLeft", 0));
    check("oklar: son tuşta (💡) Sağ -> yerinde kalıyor AMA olay tüketiliyor", t(29, "ArrowRight", 29));
    check("oklar: satır sonundan Sağ -> sonraki satırın ilk tuşu (9 -> 10), Sol geri (10 -> 9)", t(9, "ArrowRight", 10) && t(10, "ArrowLeft", 9));
    check("oklar: Aşağı -> alttaki satırda AYNI sütun (3 -> 13 -> 23), son satırda yerinde kalıyor ama tüketiliyor", t(3, "ArrowDown", 13) && t(13, "ArrowDown", 23) && t(23, "ArrowDown", 23));
    check("oklar: Yukarı -> üstteki satırda aynı sütun (23 -> 13 -> 3), ilk satırda yerinde kalıyor ama tüketiliyor", t(23, "ArrowUp", 13) && t(13, "ArrowUp", 3) && t(3, "ArrowUp", 3));
    check(`oklar: HİÇBİR ok olayı document'e ulaşmıyor (sayfa çevirme dinleyicisi tetiklenmiyor; ulaşan: ${docSeen.join(",") || "yok"})`, docSeen.length === 0);
    check("oklar: gezinmek harf açmıyor / duyuru yazmıyor / hata fırlatmıyor", h.state.ezberStudy.revealedCount === 0 && h.calls.render === 0 && live(h) === "" && h.calls.errors.length === 0);
    check(`oklar: 💡'nin üstünde 3. satırın 10. tuşu: Yukarı -> 2. satırın 10. tuşu (19), Aşağı geri (29)`, t(29, "ArrowUp", 19) && t(19, "ArrowDown", 29));
  }
  {
    // Eksik satır: sütun sayısı kısa olan satıra geçerken son tuşa kıskaçlanıyor (Math.min).
    const h = yazHarness();
    const rows = [...h.els.yazKeyboard.querySelectorAll(".yaz-keyboard-row")].map((r) => [...r.children]);
    const lastOfRow2 = rows[1][9];
    const keyBelow = rows[2][9];
    const keyAbove = rows[0][9];
    lastOfRow2.remove(); // 2. satır artık 9 tuş
    keyBelow.focus();
    const up = keydown(h, { key: "ArrowUp" }, keyBelow);
    check("oklar: Yukarı, üst satır daha KISAYSA (9 tuş) üst satırın SON tuşuna kıskaçlanıyor (çökmüyor, odak kaybolmuyor)", h.d.activeElement === rows[1][8] && up.defaultPrevented);
    keyAbove.focus();
    const down = keydown(h, { key: "ArrowDown" }, keyAbove);
    check("oklar: Aşağı, alt satır daha kısaysa son tuşuna kıskaçlanıyor", h.d.activeElement === rows[1][8] && down.defaultPrevented);
  }
  {
    const h = yazHarness();
    const docSeen = [];
    h.d.addEventListener("keydown", (e) => docSeen.push(e.key));
    const keys = [...h.els.yazKeyboard.querySelectorAll(".yaz-key")];
    // Değiştiricili oklar tüketilmiyor: Alt+Sol = tarayıcı "Geri", Shift/Ctrl/Meta + ok = seçim / sekme kısayolları.
    const mods = [["Shift", { shiftKey: true }], ["Ctrl", { ctrlKey: true }], ["Alt", { altKey: true }], ["Meta", { metaKey: true }]];
    const modBad = [];
    for (const [label, init] of mods) {
      for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
        keys[5].focus();
        const ev = keydown(h, { key, ...init }, keys[5]);
        if (ev.defaultPrevented || h.d.activeElement !== keys[5]) modBad.push(`${label}+${key}`);
      }
    }
    check(`oklar: ${mods.length * 4} değiştiricili ok (Shift/Ctrl/Alt/Meta) tüketilmiyor, odak yerinde (tarayıcı kısayollarına karışılmıyor; sorunlu: ${modBad.join(", ") || "yok"})`, modBad.length === 0);
    check("oklar: değiştiricili oklar yayılmaya devam ediyor (document'e ulaşıyor)", docSeen.length === 16);
    // Ok olmayan tuşlar tüketilmiyor: Tab, Enter, Boşluk (tuşu tıklatır), Home/End, sayfa tuşları, Escape, Latin harf.
    docSeen.length = 0;
    const others = ["Tab", "Enter", " ", "Home", "End", "PageUp", "PageDown", "Escape", "a", "1"];
    const otherBad = [];
    for (const key of others) {
      keys[5].focus();
      const ev = keydown(h, { key }, keys[5]);
      if (ev.defaultPrevented || h.d.activeElement !== keys[5]) otherBad.push(JSON.stringify(key));
    }
    check(`oklar: ok olmayan ${others.length} tuş (Tab, Enter, Boşluk, Home, End, PageUp/Down, Escape, a, 1) tuşta tüketilmiyor, odak yerinde (sorunlu: ${otherBad.join(", ") || "yok"})`, otherBad.length === 0);
    check("oklar: ok olmayan tuşlar yayılıyor (Escape modal kapatma, Tab odak tuzağı gibi genel dinleyicilere ulaşır)", docSeen.length === others.length);
    // Klavye içinde ama bir tuş olmayan hedef (satır, ipucu metni): ok tüketilmiyor.
    docSeen.length = 0;
    const row = h.els.yazKeyboard.querySelector(".yaz-keyboard-row");
    const e1 = keydown(h, { key: "ArrowRight" }, row);
    const e2 = keydown(h, { key: "ArrowDown" }, h.els.yazHintText);
    check("oklar: hedef bir tuş değilse (satır, ipucu metni) tüketilmiyor (kapsayıcı olayı yutmuyor)", !e1.defaultPrevented && !e2.defaultPrevented && docSeen.length === 2);
    check("oklar: klavyenin DIŞINDA (gövdede) ok tuşuna dokunulmuyor (sayfa çevirme yolu aynen duruyor)", !keydown(h, { key: "ArrowRight" }).defaultPrevented && !keydown(h, { key: "ArrowLeft" }).defaultPrevented);
  }

  // ---- Yaz: odak ----
  {
    const h = makeHarness({ mealReady: true });
    h.state.ezberStudy = null;
    await h.api.startEzberStudy("yaz", 1, 1, 2);
    h.els.yazKeyboard.querySelector('.yaz-key[data-char="م"]').focus();
    h.els.yazHintText.hidden = false;
    await h.api.startEzberStudy("oku", 1, 1, 2); // Yaz'dan doğrudan Oku'ya geçiş (Ezber penceresi oturum sürerken yeniden açıldı)
    check("Yaz -> Oku doğrudan geçiş (odak bir Yaz tuşundayken): klavye ve ipucu gizli, ODAK Oku düğmesinde (<body>'ye düşmüyor)", h.els.yazKeyboard.hidden === true && h.els.yazHintText.hidden === true && h.els.ezberReveal.hidden === false && h.d.activeElement === h.els.ezberReveal);
    h.els.ezberReveal.focus();
    await h.api.startEzberStudy("yaz", 1, 1, 2);
    check("Oku -> Yaz doğrudan geçiş (odak Oku düğmesindeyken): düğme gizli, klavye görünür, ODAK ilk Yaz tuşunda", h.els.ezberReveal.hidden === true && h.els.yazKeyboard.hidden === false && h.d.activeElement === h.els.yazKeyboard.querySelector(".yaz-key"));
  }
  for (const [label, pick] of [["bir harf tuşundayken", (h) => h.key("م")], ["💡 tuşundayken", (h) => h.hintKey]]) {
    const h = yazHarness();
    pick(h).focus();
    h.api.endEzberStudy();
    await sleep(90);
    check(`Yaz bitişi, odak ${label}: klavye gizleniyor ve ODAK EZBER DÜĞMESİNE gidiyor (Chromium'da <body>'ye düşerdi)`, h.els.yazKeyboard.hidden === true && h.d.activeElement === h.els.ezberBtn);
    check(`Yaz bitişi (${label}): metin 'Ezber', oturum null, duyuru 'Ezber çalışması bitti'`, h.els.ezberBtn.textContent === "Ezber" && h.state.ezberStudy === null && live(h) === "Ezber çalışması bitti");
  }
  {
    const h = yazHarness();
    h.els.playBtn.focus();
    h.api.endEzberStudy();
    check("Yaz bitişi: odak başka yerdeyse (Oynat) ona DOKUNULMUYOR", h.d.activeElement === h.els.playBtn);
    const h2 = yazHarness();
    h2.d.activeElement && h2.d.activeElement.blur();
    h2.api.endEzberStudy();
    check("Yaz bitişi: odak zaten <body>'deyse Ezber düğmesine ÇEKİLMİYOR", h2.d.activeElement === h2.d.body);
    const h3 = yazHarness();
    h3.els.ezberBtn.focus();
    h3.api.endEzberStudy();
    check("Yaz bitişi: odak zaten Ezber/Bitir düğmesindeyse orada kalıyor", h3.d.activeElement === h3.els.ezberBtn);
  }
  {
    // Uçtan uca: tek ayetlik Yaz; son harf ekran tuşuyla (odak tuşta) -> ses biter -> oturum kendiliğinden biter, odak Ezber düğmesinde.
    const h = yazHarness({ units: yazUnits([[10, "بس"]]) });
    h.state.ezberStudy.to = 1;
    h.key("س").focus();
    h.key("ب").click();
    h.key("س").click();
    check("uçtan uca: son harften sonra ses çalıyor, oturum SES BİTENE kadar sürüyor", h.calls.play === 1 && h.state.ezberStudy !== null);
    h.audio.dispatchEvent(new h.dom.window.Event("ended"));
    await sleep(90);
    check("uçtan uca: ses bitince (son ayet) oturum kendiliğinden biter, klavye gizlenir, ODAK EZBER DÜĞMESİNDE (klavyedeki tuşun odağı <body>'ye düşmez)", h.state.ezberStudy === null && h.els.yazKeyboard.hidden === true && h.d.activeElement === h.els.ezberBtn);
    check(`uçtan uca: tek pencerede 'Doğru. Ayet tamamlandı. Ezber çalışması bitti' (bulunan: '${live(h)}')`, live(h) === "Doğru. Ayet tamamlandı. Ezber çalışması bitti");
  }

  // ---- ses başarısızlığında tek ilerleme ----
  async function settle(setup, { currentAyah, to }) {
    const h = makeHarness();
    h.state.ezberStudy.currentAyah = currentAyah;
    h.state.ezberStudy.to = to;
    setup(h);
    h.api.ezberStudyPlayAyahThenAdvance();
    await sleep(40);
    return h;
  }
  {
    const failing = (h) => {
      h.audio._playResult = () => { queueMicrotask(() => h.audio.dispatchEvent(new h.dom.window.Event("error"))); return Promise.reject(new Error("NotSupportedError")); };
    };
    const h = await settle(failing, { currentAyah: 1, to: 7 });
    check(`ses başarısız (hem 'error' olayı hem play() reddi): TEK ilerleme -- showPage ${h.calls.showPage.length} kez (atlanan ayet yok)`, h.calls.showPage.length === 1 && h.calls.showPage[0][1] === 2 && h.state.ezberStudy && h.state.ezberStudy.currentAyah === 2);
    const h2 = await settle(failing, { currentAyah: 2, to: 3 });
    check("ses başarısız, sondan bir önceki ayet: oturum ERKEN bitmiyor (sonraki ayete geçiyor)", h2.state.ezberStudy !== null && h2.state.ezberStudy.currentAyah === 3 && h2.calls.sync === 0);
    const h3 = await settle(failing, { currentAyah: 3, to: 3 });
    check("ses başarısız, son ayet: oturum TAM BİR KEZ bitiyor", h3.state.ezberStudy === null && h3.calls.sync === 1 && h3.calls.showPage.length === 0);
  }
  {
    const h = makeHarness();
    h.state.ezberStudy.currentAyah = 1;
    h.api.ezberStudyPlayAyahThenAdvance();
    h.audio.dispatchEvent(new h.dom.window.Event("ended"));
    await sleep(40);
    check("ses normal çalıp bitince ('ended'): tek ilerleme (davranış değişmedi)", h.calls.showPage.length === 1 && h.calls.showPage[0][1] === 2);
    h.audio.dispatchEvent(new h.dom.window.Event("ended"));
    await sleep(20);
    check("ve sonradan gelen ikinci 'ended' ilerletmiyor", h.calls.showPage.length === 1);
  }
  {
    const h = makeHarness();
    h.api.ezberStudyPlayAyahThenAdvance();
    h.api.endEzberStudy(); // kullanıcı Bitir'e bastı: bekleyen klip artık ilerletmemeli
    h.audio.dispatchEvent(new h.dom.window.Event("ended"));
    await sleep(40);
    check("klip çalarken oturum bitirilirse bekleyen 'ended' ilerletmiyor (koruma sayacı)", h.calls.showPage.length === 0);
  }
}

// -- (4) Kaynak ---------------------------------------------------------------------------------------------
{
  const tap = SRCS.onEzberStudyTap || "";
  const setup = SRCS.setupEzberReveal || "";
  check("app.js: dokunma yolu (onEzberStudyTap) kelimeyi KENDİSİ açmıyor, ezberRevealNextWord()'ü çağırıyor", /ezberRevealNextWord\(\)/.test(tap) && !/revealedCount\+\+/.test(tap));
  check("app.js: düğme yolu (setupEzberReveal) 'click' dinleyip ezberRevealNextWord()'ü çağırıyor", /ezberReveal\.addEventListener\("click", \(\) => ezberRevealNextWord\(\)\)/.test(setup));
  check("app.js: `revealedCount++` tam 2 yerde (Oku: ezberRevealNextWord, Yaz: handleEzberYazKeyPress) -- Oku'da ikinci bir kelime açma kopyası yok", (appSource.match(/revealedCount\+\+/g) || []).length === 2);
  check("app.js: main() setupEzberReveal()'i çağırıyor (düğme dinleyicisi bağlanıyor)", /setupEzberModal\(\);\s*setupEzberReveal\(\);/.test(appSource));
  check("app.js: els.ezberReveal = #ezber-reveal", /ezberReveal: document\.getElementById\("ezber-reveal"\)/.test(appSource));
  const start = SRCS.startEzberStudy || "";
  check("app.js: Türkçe karşılık verisi iki modda da isteniyor (`mode === \"yaz\" &&` koşulu yok)", /if \(!isWordMealDataReady\(\)\) \{\s*loadWordMealData\(\)/.test(start) && !/mode === "yaz" && !isWordMealDataReady/.test(start));
  const hiddenBeforeFocus = start.indexOf("els.ezberReveal.hidden = false;") > -1 && start.indexOf("els.ezberReveal.hidden = false;") < start.indexOf("els.ezberReveal.focus();");
  check("app.js: startEzberStudy odaklamadan ÖNCE hidden'ı kaldırıyor (gizli öğe odak almaz)", hiddenBeforeFocus);
  const end = SRCS.endEzberStudy || "";
  const iMeasure = end.indexOf("const focusInSession = document.activeElement === els.ezberReveal || els.yazKeyboard.contains(document.activeElement);");
  const iHideReveal = end.indexOf("els.ezberReveal.hidden = true;");
  const iHideYaz = end.indexOf("els.yazKeyboard.hidden = true;");
  const iRefocus = end.indexOf("if (focusInSession) els.ezberBtn.focus();");
  check("app.js: endEzberStudy odağı Oku düğmesi VE Yaz klavyesi GİZLENMEDEN önce ölçüyor, gizledikten sonra Ezber düğmesine veriyor", iMeasure > -1 && iHideReveal > iMeasure && iHideYaz > iMeasure && iRefocus > Math.max(iHideReveal, iHideYaz));
  const startYaz = start.slice(start.indexOf('if (mode === "yaz") {'), start.indexOf("} else {", start.indexOf('if (mode === "yaz") {')));
  const iShowKb = startYaz.indexOf("els.yazKeyboard.hidden = false;");
  const iFocusKey = startYaz.indexOf("firstKey.focus()");
  check("app.js: startEzberStudy (Yaz dalı) klavyeyi GÖRÜNÜR yaptıktan SONRA ilk tuşa odaklıyor (gizli öğe odak almaz)", iShowKb > -1 && iFocusKey > iShowKb && /els\.yazKeyboard\.querySelector\("\.yaz-key"\)/.test(startYaz));
  const setupYaz = SRCS.setupEzberYazKeyboard || "";
  check("app.js: setupEzberYazKeyboard klavyenin 'keydown'ına onEzberYazKeyboardKeydown'ı, document'in 'keydown'ına onEzberYazPhysicalKey'i bağlıyor", /els\.yazKeyboard\.addEventListener\("keydown", onEzberYazKeyboardKeydown\)/.test(setupYaz) && /document\.addEventListener\("keydown", onEzberYazPhysicalKey\)/.test(setupYaz));
  check("app.js: main() setupEzberYazKeyboard()'ı çağırıyor (dinleyiciler bağlanıyor)", /setupEzberReveal\(\);\s*setupEzberYazKeyboard\(\);/.test(appSource));
  check("app.js: harf eşleştirmenin TEK uygulaması handleEzberYazKeyPress: ekran tuşu (click) da fiziksel tuş da onu çağırıyor, eşleştirmeyi kendileri yapmıyor", /handleEzberYazKeyPress\(key\.dataset\.char\)/.test(setupYaz) && /handleEzberYazKeyPress\(ch\)/.test(SRCS.onEzberYazPhysicalKey || "") && !/ezberBaseChar/.test(setupYaz) && !/ezberBaseChar/.test(SRCS.onEzberYazPhysicalKey || ""));
}
{
  // Duyuru TEK dilli bir canlı bölgeye yazılıyor (Arapça için lang="ar" parçası yok): Türkçe karşılıklarda Arapça harf bulunmamalı.
  const data = JSON.parse(readText("data", "word-meal.json"));
  const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
  const bad = Object.entries(data).filter(([, v]) => ARABIC.test(v));
  check(`data/word-meal.json: ${Object.keys(data).length} Türkçe karşılığın hiçbirinde Arapça harf yok (bulunan: ${bad.length}) -- duyuru lang'sız Türkçe canlı bölgeye yazılıyor`, Object.keys(data).length > 60000 && bad.length === 0);
}

if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All checks passed (Ezber > Oku klavye yolu: #ezber-reveal işaretlemesi ve sırası, CSS (.sr-only'den türetilen geri alma, display yok, kontrast), gerçek işlevler x gerçek DOM: kelime açma (düğme = dokunma), duyurular, odak yönetimi, oturum sonu, Türkçe karşılık verisi, ses başarısızlığında tek ilerleme).");
