// Sure Bilgisi'nde bağlantı -> ayrıntı görünümü -> Geri akışında klavye odağı: regresyon kontrolü.
//
// Neden var: Sure Bilgisi metnindeki bir bağlantıya (ör. "Bakara", "1-32") Enter basınca içerik modalın içinde bir alt
// görünüme (#surah-info-detail) geçiyor; "Geri" ana içeriğe dönüyor. İki geçişte de odaktaki öğe az önce gizlenen
// panelin içinde kalıyordu. Gerçek Chromium'da ölçülen durum (430 px, yalnızca Tab ve Enter; sahne: 50. sayfada gezginin
// "Âl-i İmrân Suresi hakkında bilgi" düğmesi -> Enter -> "Bakara" bağlantısı):
//   - bağlantıya Enter -> odak <body> (document.activeElement), erişilebilirlik ağacında "yok sayıldı": ekran okuyucu yeni
//     görünümü duymuyor; sonraki Tab görünümün ortasından sürüyor (Kapat'a değil Geri'ye gidiyor);
//   - Geri'ye Enter -> odak yine <body>: okuyucu 13-18 bağlantılı bir metinde kaldığı yeri kaybediyor.
// Düzeltme (js/app.js, <surah-info-detail> bloğu):
//   - showSurahInfoDetail: ana içerikten ayrıntıya GEÇERKEN odak modalın kapsayıcısına alınır (modal açılırkenki ve
//     Konu Fihristi'ndeki pushTopicsModalTopic gibi: "3. Âl-i İmrân, iletişim kutusu" okunur, Tab Kapat'tan sürer);
//     görünüm zaten açıkken içerik yenilenirse ("Yükleniyor…" -> ayetlerin meali) odağa dokunulmaz;
//   - backFromSurahInfoDetail (Geri): odak ayrıntıyı açan BAĞLANTIYA döner (ana içerik yeniden kurulmuyor, bağlantı yerinde),
//     bağlantı yoksa ya da odak alamıyorsa kapsayıcıya; closeSurahInfoDetail (modal kapanışının genel sıfırlaması) odağa
//     dokunmuyor ve açan kaydını temizliyor.
// Düzeltmeden sonra aynı sahne: bağlantıya Enter -> odak "3. Âl-i İmrân" iletişim kutusunda, sonraki Tab "Kapat"ta;
// Geri'ye Enter -> odak "Bakara" bağlantısında; "Mushaf'a Sureye Git" ve "Mushaf'ta Ayete Git" öncesi gibi çalışıyor
// (açan gezgin düğmesine döner, sayfa değişince gidilen ayetin gezgin düğmesine geçer).
//
// Burada kontrol edilenler:
//   (1) kaynak: <surah-info-detail> bloğu, giriş/çıkış sırası, Geri düğmesinin bağlanması, closeSurahInfoDetail'ın odağa
//       dokunmaması, index.html'deki kimlikler;
//   (2) GERÇEK openModal/closeModal bloğu + GERÇEK <surah-info-detail> bloğu, gerçek index.html, modal-odak.js ve
//       surahinfo.js'in parseInfoLink'i ile jsdom'da: bağlantı -> ayrıntı (odak kapsayıcıda, Tab sırası), içerik yenilenirken
//       odağın çalınmaması, Geri (odak bağlantıya), açan yoksa/kopmuşsa/odak alamıyorsa kapsayıcıya, modal kapanışında
//       açanın temizlenmesi ve açana dönüş, ikinci bağlantı, çözümlenemeyen bağlantı, "Mushaf'a/Ayete Git" (eskisi gibi).
//
// ÖNEMLİ SINIR: jsdom'da düzen yok ve odaktaki öğe gizlenince odak <body>'ye düşmüyor (Chromium'da düşüyor): bu yüzden
// düzeltilmemiş kod burada da yakalanıyor ama "odak <body>'ye düştü" diye değil, "odak beklenen yerde değil" diye (bağlantıya
// Enter'dan sonra odak hâlâ gizli bağlantıda, Geri'den sonra hâlâ gizli Geri düğmesinde). Gerçek Chromium ölçümü README'de;
// gerçek ekran okuyucu (NVDA/JAWS/VoiceOver/TalkBack) testinin YERİNİ TUTMAZ.
//
//   node sure_bilgisi_odak_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JSDOM } from "jsdom";
import { createModalFocus, tabbablesIn } from "../js/modal-odak.js";
import { parseInfoLink } from "../js/surahinfo.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const html = readText("index.html");
const appSource = readText("js", "app.js");

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}

// -- (1) Kaynak ----------------------------------------------------------------------------------------------
const BLOCK = /\/\/ <surah-info-detail>([\s\S]*?)\/\/ <\/surah-info-detail>/.exec(appSource);
check("app.js: <surah-info-detail> ... </surah-info-detail> bloğu bulundu", !!BLOCK);
const MODAL_START = appSource.indexOf("const modalFocus = createModalFocus(");
const MODAL_END = appSource.indexOf("function setupModals()");
check("app.js: modal odak bloğu (modalFocus .. closeAllModals) bulundu", MODAL_START > 0 && MODAL_END > MODAL_START);
const ESCAPE_SRC = /function escapeHtml\(s\) \{[\s\S]*?\n\}/.exec(appSource);
check("app.js: escapeHtml bulundu", !!ESCAPE_SRC);

// Bir işlevin gövdesi (süslü parantezleri sayarak; dizge/yorum içinde süslü parantez yok).
function bodyOf(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return null;
  const open = src.indexOf("{", src.indexOf(")", start));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  return null;
}

if (BLOCK) {
  const src = BLOCK[1];
  const show = bodyOf(src, "showSurahInfoDetail");
  const close = bodyOf(src, "closeSurahInfoDetail");
  const back = bodyOf(src, "backFromSurahInfoDetail");
  check("app.js: showSurahInfoDetail, closeSurahInfoDetail ve backFromSurahInfoDetail bloğun içinde", !!show && !!close && !!back);

  if (show && close && back) {
    const iEntering = show.indexOf("const entering = els.surahInfoDetail.hidden;");
    const iShowDetail = show.indexOf("els.surahInfoDetail.hidden = false;");
    const iEnter = show.indexOf("modalFocus.enter(els.surahInfoModal)");
    check(
      "showSurahInfoDetail: geçiş mi diye ayrıntı hâlâ gizliyken ÖLÇÜLÜYOR (ayrıntıyı göstermeden önce), odak o ölçümden SONRA modala alınıyor",
      iEntering >= 0 && iEntering < iShowDetail && iEntering < iEnter
    );
    check("showSurahInfoDetail: odak yalnızca geçişte alınıyor (if (entering)), içerik yenilenirken değil", /if \(entering\) modalFocus\.enter\(els\.surahInfoModal\);/.test(show));
    check("closeSurahInfoDetail: odağa DOKUNMUYOR (modal kapanırken de çağrılıyor) ve açan kaydını temizliyor", !/modalFocus|\.focus\(/.test(close) && /surahInfoLinkOpener = null;/.test(close));
    check("closeSurahInfoDetail: eski davranış duruyor (istek sayacı artıyor, ayrıntı gizli, gövde görünür)", /surahInfoDetailRequestId\+\+;/.test(close) && /els\.surahInfoDetail\.hidden = true;/.test(close) && /els\.surahInfoBody\.hidden = false;/.test(close));
    const iTake = back.indexOf("const link = surahInfoLinkOpener;");
    const iClose = back.indexOf("closeSurahInfoDetail();");
    const iFocus = back.indexOf("link.focus();");
    const iFallback = back.indexOf("modalFocus.enter(els.surahInfoModal)");
    check(
      "backFromSurahInfoDetail sırası: açanı AL (temizlenmeden önce) -> ana içeriğe dön -> bağlantıya odak -> olmadı ise kapsayıcı",
      iTake >= 0 && iTake < iClose && iClose < iFocus && iFocus < iFallback
    );
    check("backFromSurahInfoDetail: açan varsa ona odaklanıyor; açan yoksa ya da odak almadıysa (kopmuş/gizli/devre dışı) kapsayıcı", /if \(link\) link\.focus\(\);/.test(back) && /if \(!link \|\| document\.activeElement !== link\) modalFocus\.enter\(els\.surahInfoModal\);/.test(back));
  }
  check("setupSurahInfoModal: Geri düğmesi backFromSurahInfoDetail'a bağlı (doğrudan closeSurahInfoDetail'a değil)", /els\.surahInfoDetailBack\.addEventListener\("click", backFromSurahInfoDetail\);/.test(src) && !/els\.surahInfoDetailBack\.addEventListener\("click", closeSurahInfoDetail\)/.test(src));
  check("setupSurahInfoModal: çözümlenen bağlantı açan olarak kaydediliyor, openSurahInfoLink'ten ÖNCE", /if \(!target\) return;\s*surahInfoLinkOpener = link;[^\n]*\n\s*openSurahInfoLink\(target\);/.test(src));
  check('setupSurahInfoModal: "Mushaf\'a/Ayete Git" düğmesi goToAyah/goToSurah çağırıyor ve modalı kapatıyor (davranış aşağıda, 2h)', /goToAyah\(surah, ayah\)/.test(src) && /goToSurah\(surah\)/.test(src) && /closeModal\(els\.surahInfoModal\)/.test(src));
}
check("app.js: closeModal, Sure Bilgisi kapanırken genel sıfırlama closeSurahInfoDetail'ı çağırıyor", /if \(modalEl === els\.surahInfoModal\) closeSurahInfoDetail\(\);/.test(appSource));

{
  const D = new JSDOM(html).window.document;
  const modal = D.getElementById("surah-info-modal");
  const body = D.getElementById("surah-info-body");
  const detail = D.getElementById("surah-info-detail");
  const back = D.getElementById("surah-info-detail-back");
  check("index.html: #surah-info-body ile #surah-info-detail aynı modalın kardeş panelleri, ayrıntı başlangıçta hidden", !!body && !!detail && body.parentElement === modal && detail.parentElement === modal && detail.hasAttribute("hidden") && !body.hasAttribute("hidden"));
  check("index.html: Geri düğmesi gerçek <button>, adı 'Geri dön', ayrıntı panelinin içinde", !!back && back.tagName === "BUTTON" && back.getAttribute("aria-label") === "Geri dön" && detail.contains(back));
}

// -- (2) Davranış (jsdom) ------------------------------------------------------------------------------------
const MODAL_IDS = ["surah-modal", "juz-modal", "page-modal", "ezber-modal", "surah-info-modal", "topics-modal", "arama-modal"];
const NAMES = ["surahModal", "juzModal", "pageModal", "ezberModal", "surahInfoModal", "topicsModal", "aramaModal"];

// Gerçek Sure Bilgisi gövdesinin yapısı: akordeon bölümü içinde bağlantılar (surahInfoBodyHTML'in çıktısıyla aynı iskelet).
const BODY_HTML = `
  <div class="info-section">
    <button type="button" class="info-section-toggle" aria-expanded="true"><span>İsim</span></button>
    <div class="info-section-panel open"><div class="info-section-panel-inner"><div class="info-section-content">
      <p>Bkz. <a id="l-surah" href="/2">Bakara</a>, <a id="l-ayah" href="/3/1-3">1-3</a>, <a id="l-ayah2" href="/3/33">33</a>
      ve <a id="l-dis" href="https://example.com/x">dış</a>.</p>
    </div></div></div>
  </div>`;

function harness({ mealReady = true } = {}) {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  const D = dom.window.document;
  const els = {
    modalBackdrop: D.getElementById("modal-backdrop"),
    surahInfoBody: D.getElementById("surah-info-body"),
    surahInfoDetail: D.getElementById("surah-info-detail"),
    surahInfoDetailBody: D.getElementById("surah-info-detail-body"),
    surahInfoDetailBack: D.getElementById("surah-info-detail-back"),
  };
  NAMES.forEach((n, i) => (els[n] = D.getElementById(MODAL_IDS[i])));
  const state = { openModalEl: null, surahs: { 2: { nameTurkish: "Bakara" }, 3: { nameTurkish: "Âl-i İmrân" } } };
  const calls = [];
  const meal = { ready: mealReady, finish: null };
  const api = new Function(
    "els", "state", "document", "createModalFocus", "requestAnimationFrame", "setTimeout",
    "closeAllAyahGrids", "resetTopicsModal", "switchJuzTab", "switchEzberTab", "closeEzberSurahPicker",
    "parseInfoLink", "goToAyah", "goToSurah",
    "getCachedMealData", "ayahArabicText", "renderMealHTML", "getMealText", "isMealDataReady", "loadMealData", "WORD_MEAL_LOADING_HTML",
    `${ESCAPE_SRC[0]}\n${appSource.slice(MODAL_START, MODAL_END)}\n${BLOCK[1]}\n` +
      "return { openModal, closeModal, modalFocus, showSurahInfoDetail, closeSurahInfoDetail, backFromSurahInfoDetail, openSurahInfoLink, setupSurahInfoModal };"
  )(
    els, state, D, createModalFocus, () => {}, () => {},
    () => {}, () => {}, () => {}, () => {}, () => {},
    parseInfoLink, (s, a) => calls.push(`goToAyah:${s}:${a}`), (s) => calls.push(`goToSurah:${s}`),
    () => ({}), (s, a) => `ar${s}:${a}`, (t) => `<p class="meal">${t}</p>`, (data, s, a) => `meal ${s}:${a}`,
    () => meal.ready,
    () => new Promise((resolve) => { meal.finish = () => { meal.ready = true; resolve(); }; }),
    '<p class="word-meal-loading">Yükleniyor…</p>'
  );
  api.setupSurahInfoModal();
  const opener = D.getElementById("surah-btn"); // modalı açan sabit düğme (gezgin/üst çubuk yerine herhangi bir gerçek düğme)
  return {
    D, els, state, api, calls, meal, opener,
    modal: els.surahInfoModal,
    link: (id) => D.getElementById(id),
    active: () => D.activeElement,
    // Sure Bilgisi'ni, açanı odaktayken aç; gövdeyi doldur
    open() {
      opener.focus();
      api.openModal(els.surahInfoModal);
      els.surahInfoBody.innerHTML = BODY_HTML;
    },
    // Klavyede bağlantıya gelip Enter: odak bağlantıda, sonra click (yerel Enter->click davranışı jsdom'da yok)
    activate(id) {
      const el = D.getElementById(id);
      el.focus();
      el.click();
      return el;
    },
    back() {
      els.surahInfoDetailBack.focus();
      els.surahInfoDetailBack.click();
    },
    detailShown: () => !els.surahInfoDetail.hidden && els.surahInfoBody.hidden,
    bodyShown: () => els.surahInfoDetail.hidden && !els.surahInfoBody.hidden,
  };
}

if (BLOCK && MODAL_START > 0 && MODAL_END > MODAL_START && ESCAPE_SRC) {
  // 2a) bağlantı -> ayrıntı: odak kapsayıcıda
  {
    const h = harness();
    h.open();
    check("başlangıç: modal açık, odak kapsayıcıda, ana içerik görünür, ayrıntı gizli", h.state.openModalEl === h.modal && h.active() === h.modal && h.bodyShown());
    const l = h.activate("l-surah");
    check("sure bağlantısı (/2) -> ayrıntı görünümü açıldı (ana içerik gizli)", h.detailShown() && /Mushaf'a Sureye Git/.test(h.els.surahInfoDetailBody.textContent) && /Bakara/.test(h.els.surahInfoDetailBody.textContent));
    check("ayrıntıya girince odak modalın kapsayıcısında (gizlenen bağlantıda değil)", h.active() === h.modal && h.active() !== l);
    const tabs = tabbablesIn(h.modal);
    check("ayrıntıda Tab durakları: Kapat -> Geri -> 'Mushaf'a Sureye Git' (yalnızca ayrıntının öğeleri, gizli gövdenin bağlantıları yok)",
      tabs.length === 3 && tabs[0].classList.contains("modal-close") && tabs[1] === h.els.surahInfoDetailBack && tabs[2].classList.contains("info-detail-goto-btn"));
    check("ayrıntı açıkken odak hâlâ modalın içinde (güvenlik ağı odağı dışarı almıyor)", h.modal.contains(h.active()) && h.state.openModalEl === h.modal);

    // 2b) Geri -> bağlantı
    h.back();
    check("Geri: ana içerik görünür, ayrıntı gizli", h.bodyShown());
    check("Geri: odak ayrıntıyı açan bağlantıda (gizlenen Geri düğmesinde ya da kapsayıcıda değil)", h.active() === l);
    check("Geri: odak modalın içinde ve modal hâlâ açık", h.modal.contains(h.active()) && h.state.openModalEl === h.modal);

    // 2c) ikinci bağlantı: açan güncelleniyor
    const l2 = h.activate("l-ayah2");
    check("ayet bağlantısı (/3/33): ayrıntı açıldı ve odak yine kapsayıcıda", h.detailShown() && h.active() === h.modal && /Mushaf'ta Ayete Git/.test(h.els.surahInfoDetailBody.textContent));
    h.back();
    check("ikinci bağlantıdan Geri: odak İKİNCİ bağlantıda (açan her seferinde güncelleniyor)", h.active() === l2 && h.bodyShown());
  }

  // 2d) içerik yenilenirken odak çalınmıyor ("Yükleniyor…" -> ayetlerin meali)
  {
    const h = harness({ mealReady: false });
    h.open();
    h.activate("l-ayah");
    check("meal verisi yokken ayet bağlantısı: 'Yükleniyor…' gösteriliyor, odak kapsayıcıda", h.detailShown() && /Yükleniyor/.test(h.els.surahInfoDetailBody.textContent) && h.active() === h.modal);
    // kullanıcı bu arada Geri'ye geldi
    h.els.surahInfoDetailBack.focus();
    h.meal.finish();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    check("veri gelince içerik yenilendi (3 ayetin 'Mushaf'ta Ayete Git' düğmesi)", h.els.surahInfoDetailBody.querySelectorAll(".info-detail-goto-btn").length === 3);
    check("içerik yenilenirken odak Geri düğmesinde KALDI (ikinci showSurahInfoDetail odağı kapsayıcıya çalmıyor)", h.active() === h.els.surahInfoDetailBack);
    h.back();
    check("yüklemeden sonra Geri: odak bağlantıda", h.active() === h.link("l-ayah") && h.bodyShown());
  }

  // 2e) Geri'de açan bağlantı kullanılamıyor: kapsayıcı
  {
    const h = harness();
    h.open();
    const l = h.activate("l-surah");
    l.remove();
    h.back();
    check("açan bağlantı DOM'dan kalkmışsa Geri odağı kapsayıcıya alıyor (<body>'ye düşürmüyor)", h.active() === h.modal && h.bodyShown());
  }
  {
    const h = harness();
    h.open();
    const l = h.activate("l-surah");
    l.focus = () => {}; // odak alamayan bağlantı (gizli, devre dışı...)
    h.back();
    check("açan bağlantı odak alamıyorsa Geri odağı kapsayıcıya alıyor", h.active() === h.modal && h.bodyShown());
  }
  {
    const h = harness();
    h.open();
    h.link("l-surah").focus(); // odak kapsayıcıda BAŞLAMASIN: yoksa denetim boş geçerdi
    h.api.showSurahInfoDetail("<p>açansız</p>"); // bağlantı yolundan geçmeden (açan kaydı yok)
    check("açansız ayrıntı: odak yine kapsayıcıya alındı", h.detailShown() && h.active() === h.modal);
    h.back();
    check("açansız ayrıntıdan Geri: odak kapsayıcıda", h.active() === h.modal && h.bodyShown());
  }

  // 2f) çözümlenemeyen bağlantı: ayrıntı açılmıyor, odak yerinde, açan kaydedilmiyor
  {
    const h = harness();
    h.open();
    const dis = h.link("l-dis");
    dis.focus();
    const ev = new h.D.defaultView.MouseEvent("click", { bubbles: true, cancelable: true });
    dis.dispatchEvent(ev);
    check("çözümlenemeyen bağlantı: olay yine de iptal edildi (404'e gidilmiyor)", ev.defaultPrevented === true);
    check("çözümlenemeyen bağlantı: ayrıntı açılmadı, odak bağlantıda kaldı", h.bodyShown() && h.active() === dis);
    h.api.showSurahInfoDetail("<p>x</p>"); // sonradan açansız bir ayrıntı: eski (çözümlenemeyen) bağlantıya YAPIŞMAMALI
    h.back();
    check("çözümlenemeyen bağlantı açan olarak kaydedilmedi: sonraki açansız ayrıntıdan Geri kapsayıcıya gidiyor", h.active() === h.modal);
  }

  // 2g) modal kapanışı: genel sıfırlama açanı temizliyor, odak modalı açan düğmeye dönüyor
  {
    const h = harness();
    h.open();
    h.activate("l-surah");
    h.api.closeModal(h.modal); // Escape / Kapat / perde ile aynı yol
    check("ayrıntı açıkken modal kapandı: odak modalı açan düğmeye döndü (kapsayıcıda ya da <body>'de değil)", h.active() === h.opener && h.state.openModalEl === null);
    check("ayrıntı açıkken modal kapandı: ana içerik görünür, ayrıntı gizli (bir sonraki açılış ana içerikte)", h.bodyShown());
    // yeniden aç, ama gövdeyi YENİDEN KURMADAN (eski bağlantı hâlâ DOM'da): temizlenmemiş bir açan burada odağı yakalardı
    h.opener.focus();
    h.api.openModal(h.modal);
    check("(düzenek) eski bağlantı yeniden açılışta hâlâ DOM'da", h.link("l-surah").isConnected);
    h.api.showSurahInfoDetail("<p>yeni</p>");
    h.back();
    check("kapanıştan sonra yeni oturum: eski açan bağlantı temizlenmişti, Geri kapsayıcıya gidiyor (eski bağlantıya değil)", h.active() === h.modal);
  }

  // 2h) "Mushaf'a Sureye Git" / "Mushaf'ta Ayete Git": eskisi gibi (önce git, sonra modalı kapat, odak açana)
  {
    const h = harness();
    h.open();
    h.activate("l-surah");
    h.els.surahInfoDetailBody.querySelector(".info-detail-goto-btn").click();
    check("'Mushaf'a Sureye Git' -> goToSurah(2), ardından modal kapandı", h.calls.join() === "goToSurah:2" && h.state.openModalEl === null);
    check("'Mushaf'a Sureye Git': odak modalı açan düğmeye döndü", h.active() === h.opener);
  }
  {
    const h = harness();
    h.open();
    h.activate("l-ayah");
    const btns = [...h.els.surahInfoDetailBody.querySelectorAll(".info-detail-goto-btn")];
    check("ayet aralığı (/3/1-3): her ayet için ayrı 'Mushaf'ta Ayete Git' düğmesi", btns.length === 3 && btns.every((b) => b.textContent === "Mushaf'ta Ayete Git"));
    btns[1].click();
    check("'Mushaf'ta Ayete Git' (2. ayet) -> goToAyah(3, 2), ardından modal kapandı", h.calls.join() === "goToAyah:3:2" && h.state.openModalEl === null);
    check("'Mushaf'ta Ayete Git': odak modalı açan düğmeye döndü", h.active() === h.opener);
  }
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log(
    "All checks passed (Sure Bilgisi bağlantı -> ayrıntı -> Geri odağı: giriş/çıkış sırası ve Geri'nin bağlanması, closeSurahInfoDetail'ın odağa dokunmaması, ayrıntıya girince odak kapsayıcıda + Tab sırası, içerik yenilenirken odağın çalınmaması, Geri'de odak açan bağlantıda / kopmuş-odaksız-açansız durumda kapsayıcıda, çözümlenemeyen bağlantı, modal kapanışında açanın temizlenmesi ve açana dönüş, 'Mushaf'a/Ayete Git' eskisi gibi)."
  );
}
