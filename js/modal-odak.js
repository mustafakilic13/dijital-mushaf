// Modal odak yönetimi -- WAI-ARIA Authoring Practices "Dialog (Modal)" deseni.
//
// Neden var: 7 modalın (sure, cüz, sayfa, ezber, sure bilgisi, konu, arama) hepsi
// role="dialog" aria-modal="true" aria-labelledby=... taşıyor, ama odağa hiç
// dokunulmuyordu. Gerçek Chromium'da ölçülen durum (yamadan önce):
//   - modal açılınca odak arkadaki düğmede (ya da <body>'de) kalıyordu: ekran
//     okuyucu "Sure Seç, iletişim kutusu" demiyor, klavye kullanıcısı Tab ile
//     modalın ALTINDAKİ sayfada dolaşıyordu (arama dışındaki 6 modalda);
//   - açılışta Shift+Tab ya da son durakta Tab odağı modalın dışına çıkarıyordu;
//   - modal kapanınca (hidden olunca) odak <body>'ye düşüyordu: Tab sayfanın
//     başından başlıyor, ekran okuyucu kullanıcısı nerede olduğunu kaybediyordu.
//
// Burada üç şey yapılıyor:
//   1. enter(): modal açılırken odak modalın kendisine (tabindex="-1") alınır;
//      ekran okuyucu başlığı ve rolü ("Sure Seç, iletişim kutusu") okur. Uzun bir
//      listenin (114 sure) ilk öğesine ya da Kapat düğmesine atlamaktan iyi.
//      Arama modalı kendi giriş alanına odaklanmaya devam eder (onOpen içinde,
//      enter()'den SONRA çalışır).
//   2. Tab/Shift+Tab modalın içinde döner (APG: son durakta Tab -> ilk, ilk durakta
//      Shift+Tab -> son). Odak yine de dışarı kaçarsa (ekran okuyucunun programatik
//      odağı, bir öğenin gizlenip odağın <body>'ye düşmesi) focusin ile geri çekilir.
//   3. restore(): modal kapanınca odak, onu açan öğeye geri verilir. Modaldan
//      modala geçişte (arama -> konu) ilk açan öğe korunur, yani zincirin sonunda
//      odak en baştaki düğmeye döner.
//
// Açan öğe: Chromium/Firefox tıklanan düğmeye odak verir (document.activeElement),
// Safari/iOS vermez (activeElement <body> kalır) -- o yüzden yakalama aşamasında son
// tıklanan etkileşimli öğe de tutuluyor ve yalnızca taze ise (1 sn) kullanılıyor.
// Sure başlığına SVG üzerinden dokunarak açılan Sure Bilgisi modalının odaklanabilir
// bir açanı yok; orada kapanışta odağa dokunulmaz.
//
// DOM'a bağlı tek yer createModalFocus(); app.js yalnızca openModal/closeModal'dan
// çağırıyor. Saf yardımcılar da dışa aktarılıyor ki jsdom'da sınanabilsin
// (bkz. test/modal_odak_test.mjs).

const TABBABLE = "a[href], button, input:not([type='hidden']), select, textarea, [tabindex]";
const INTERACTIVE = "button, a[href], input, select, textarea, [tabindex]";
// Bir tıklama, modal onunla açıldıysa "taze" sayılır; eski bir tıklama başka bir yoldan
// (ör. adres çubuğu #hash'i) açılan modalın açanı sanılmasın.
const FRESH_CLICK_MS = 1000;

// Elemanın gerçekten odaklanabilecek şekilde görünür olup olmadığı. [hidden]/[inert] her
// ortamda bakılır (jsdom dahil); display:none ve visibility:hidden gibi CSS kaynaklı gizleme
// için tarayıcının kendi checkVisibility()'si kullanılır (jsdom'da yok -> yalnızca yapısal kontrol).
export function isRendered(el) {
  if (el.closest("[hidden], [inert]")) return false;
  if (typeof el.checkVisibility === "function") {
    // checkVisibilityCSS: eski Chromium adı; visibilityProperty: standart ad. Bilinmeyen anahtar yok sayılır.
    return el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });
  }
  return true;
}

// root içinde Tab ile gerçekten durulabilen öğeler (DOM sırasıyla). tabindex="-1" programatik odak
// içindir, Tab sırasında değildir; disabled, gizli ve inert olanlar da hariç.
export function tabbablesIn(root) {
  return [...root.querySelectorAll(TABBABLE)].filter((el) => {
    if (el.matches(":disabled")) return false;
    const ti = el.getAttribute("tabindex");
    if (ti !== null && Number.parseInt(ti, 10) < 0) return false;
    return isRendered(el);
  });
}

// doc: belge; getOpenModal(): şu an açık olan modal elemanı ya da null (app.js'te state.openModalEl).
export function createModalFocus(doc, getOpenModal) {
  const win = doc.defaultView;
  const now = () => (win.performance && win.performance.now ? win.performance.now() : Date.now());
  let opener = null;
  let lastClick = null;
  let lastClickAt = -Infinity;
  let direction = "forward";

  // Yakalama aşamasında: düğmenin kendi click işleyicisi (modalı açan) çalışmadan ÖNCE kaydedilir.
  const onClick = (e) => {
    lastClick = e.target && e.target.closest ? e.target.closest(INTERACTIVE) : null;
    lastClickAt = now();
  };

  const onKeydown = (e) => {
    if (e.key !== "Tab") return;
    direction = e.shiftKey ? "backward" : "forward";
    const modal = getOpenModal();
    if (!modal || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
    const items = tabbablesIn(modal);
    if (items.length === 0) {
      // Odaklanacak hiçbir şey yok: odak kapsayıcıda kalsın, arkadaki sayfaya kaçmasın.
      e.preventDefault();
      modal.focus({ preventScroll: true });
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = doc.activeElement;
    // Kapsayıcının kendisi DOM'da ilk öğeden ÖNCE geldiği için ondan Shift+Tab de dışarı çıkardı.
    if (e.shiftKey ? active === first || active === modal : active === last) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus({ preventScroll: true });
    }
  };

  // Güvenlik ağı: odak başka bir yolla modalın dışına düştüyse (yardımcı teknoloji, odaklı öğenin
  // gizlenmesiyle <body>'ye düşen odaktan sonraki Tab) son Tab yönüne göre içeri çekilir.
  const onFocusin = (e) => {
    const modal = getOpenModal();
    if (!modal || modal.contains(e.target)) return;
    const items = tabbablesIn(modal);
    const target = (direction === "backward" ? items[items.length - 1] : items[0]) || modal;
    target.focus({ preventScroll: true });
  };

  doc.addEventListener("click", onClick, true);
  doc.addEventListener("keydown", onKeydown);
  doc.addEventListener("focusin", onFocusin);

  function pickOpener() {
    const a = doc.activeElement;
    if (a && a !== doc.body && a !== doc.documentElement) return a;
    if (lastClick && lastClick.isConnected && now() - lastClickAt < FRESH_CLICK_MS) return lastClick;
    return null;
  }

  return {
    // Modal açılmadan HEMEN ÖNCE çağrılır (önceki modal henüz kapanmadan). keepExisting: başka bir modal
    // zaten açıksa (arama -> konu gibi zincir) ilk açan öğe korunur; şu anki odak o modalın içinde olurdu.
    remember({ keepExisting = false } = {}) {
      if (!keepExisting) opener = pickOpener();
    },
    // Modal görünür olduktan sonra: odağı kapsayıcıya al.
    enter(modalEl) {
      if (!modalEl.hasAttribute("tabindex")) modalEl.setAttribute("tabindex", "-1");
      modalEl.focus({ preventScroll: true });
    },
    // Modal kapanırken (state.openModalEl temizlendikten SONRA): odağı açan öğeye geri ver.
    // Öğe artık yoksa/gizliyse/devre dışıysa odağa dokunulmaz. Odak taşındıysa true.
    restore() {
      const el = opener;
      opener = null;
      if (!el || !el.isConnected || el.matches(":disabled") || !isRendered(el)) return false;
      el.focus();
      return doc.activeElement === el;
    },
    dispose() {
      doc.removeEventListener("click", onClick, true);
      doc.removeEventListener("keydown", onKeydown);
      doc.removeEventListener("focusin", onFocusin);
    },
  };
}
