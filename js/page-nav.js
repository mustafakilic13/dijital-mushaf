// page-nav.js -- sayfada gezinme girdileri (setupNav): ok düğmeleri, sayfaya tıklama/dokunma (ayet ya da sure başlığı), Sol/Sağ ok
// tuşları, kaydırma hareketi, adres çubuğu değişimi ve yeniden boyutlandırma; dokunulan noktayı ayete çeviren pointToAyah.

import { onAyahTextClick } from "./ayah-panel.js";
import { onEzberStudyTap } from "./ezber-study.js";
import { layoutPageContainer } from "./page-layout.js";
import { goToNextPage, goToPrevPage, initialPageFromHash, showPage } from "./page.js";
import { els, state } from "./state.js";
import { openSurahInfo } from "./surahinfo-modal.js";

// Maps a click/tap point (viewport coordinates) to the ayah drawn under it,
// using the segments returned alongside the currently-displayed page's SVG
// (see render.js's renderPage/renderLineGroup) -- or null if the point
// isn't over any ayah text (margins, the surah header band, etc). `svgEl`
// is the SPECIFIC <svg> the tap landed in: while the word-meal panel is
// open there are two on screen at once (the top slice's real one, the
// bottom slice's clone), each with its own on-screen position, so the
// caller must resolve the right one (e.g. via e.target.closest("svg"))
// rather than this function guessing -- the segments' coordinates apply
// identically to either, since a clone is pixel-for-pixel identical to
// the original, but the screen->svg-space transform (getScreenCTM) is
// naturally different for each because they sit in different places.
function pointToAyah(clientX, clientY, svgEl) {
  if (!svgEl || !state.currentPageSegments.length || typeof svgEl.getScreenCTM !== "function") return null;
  const ctm = svgEl.getScreenCTM();
  if (!ctm) return null;
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const local = pt.matrixTransform(ctm.inverse());
  // a tap can fall within two adjacent lines' (generous, rounded) hit
  // bands at once near a line boundary -- prefer whichever line's
  // baseline is actually closest to the tap, not just the first match
  let best = null;
  let bestDist = Infinity;
  for (const seg of state.currentPageSegments) {
    if (local.x < seg.xMin || local.x > seg.xMax) continue;
    if (local.y < seg.baselineY - 1350 || local.y > seg.baselineY + 550) continue;
    const dist = Math.abs(local.y - seg.baselineY);
    if (dist < bestDist) {
      bestDist = dist;
      best = { surah: seg.surah, ayah: seg.ayah };
    }
  }
  return best;
}

// Sol/Sağ ok = sayfa çevirme (ekrandaki ok düğmeleriyle aynı yön). Belge düzeyinde bir kısayol olduğu için YALNIZCA tuş bu iş
// için basıldığında çalışır; yoksa başkasının tuşunu çalar:
//  - Alt/Ctrl/Meta/Shift ile birlikte basılırsa: tarayıcı geri/ileri (Alt+Sol/Sağ; macOS'ta Cmd+Sol/Sağ), kelime/satır atlama,
//    seçimi genişletme, ekran okuyucu ve işletim sistemi kısayolları. Gerçek Chromium'da hepsinde sayfa yine dönüyordu, son
//    konum kaydı ilerliyordu, Ezber oturumu bitiyordu (Yaz'da ekran tuşunda Shift+Sol bile);
//  - başka bir işleyici olayı zaten tüketmişse (defaultPrevented): o işleyici oku kendi işi için kullandı;
//  - IME bileşimi sürerken (isComposing): oklar aday seçmek içindir;
//  - odak oklarla kendi işini gören bir öğedeyse (aşağıdaki seçici): ok önce o öğenin. Böyle öğeler şu an yalnızca modalların
//    içinde (ilk satır zaten vazgeçiyor); bu koşul, ileride modal dışına konacak bir alan ya da kaydırıcı için güvence.
// Düz Sol/Sağ, odak gezgindeki bir ayet düğmesinde, ayet panelinin düğmelerinde ya da gövdedeyken eskisi gibi sayfa çevirir.
const ARROW_KEY_OWNER_SELECTOR = [
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]):not([type="checkbox"]):not([type="file"]):not([type="color"]):not([type="hidden"])',
  "textarea",
  "select",
  '[contenteditable]:not([contenteditable="false"])',
  '[role="textbox"], [role="searchbox"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="scrollbar"]',
  '[role="tablist"], [role="radiogroup"], [role="toolbar"], [role="menu"], [role="menubar"], [role="listbox"], [role="tree"], [role="treegrid"], [role="grid"]',
].join(", ");
function onPageTurnKeydown(e) {
  if (state.openModalEl) return; // don't page-turn while a modal is open
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.defaultPrevented || e.isComposing) return;
  if (e.target && e.target.closest && e.target.closest(ARROW_KEY_OWNER_SELECTOR)) return;
  // matches the on-screen tap-arrows: left arrow -> next, right -> previous
  if (e.key === "ArrowLeft") goToNextPage();
  else goToPrevPage();
}

function setupNav() {
  els.prevBtn.addEventListener("click", goToPrevPage);
  els.nextBtn.addEventListener("click", goToNextPage);

  // Anything NOT inside an <svg> at all (the word-meal panel's own HTML --
  // its close button, word cards, whitespace) is ignored here; the close
  // button has its own listener, and the rest is inert by design.
  els.pageContainer.addEventListener("click", (e) => {
    const svgEl = e.target.closest("svg.mushaf-page-svg");
    if (!svgEl) return;
    const headerHit = e.target.closest(".surah-header-hit");
    if (headerHit) {
      openSurahInfo(parseInt(headerHit.dataset.surah, 10));
      return;
    }
    const hit = pointToAyah(e.clientX, e.clientY, svgEl);
    if (!hit) return;
    if (state.ezberStudy) {
      onEzberStudyTap(hit);
      return;
    }
    onAyahTextClick(hit);
  });

  document.addEventListener("keydown", onPageTurnKeydown);

  let touchStartX = null;
  let touchStartY = null;
  let touchStartTime = 0;
  els.pageContainer.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1) {
      // pinch or other multi-touch gesture in progress: don't treat as a swipe
      touchStartX = null;
      return;
    }
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  });
  els.pageContainer.addEventListener("touchend", (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    const dt = Date.now() - touchStartTime;
    // require a fast, mostly-horizontal gesture so it doesn't fire on
    // scrolling/pinching/selecting text
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && dt < 600) {
      // finger moving right (dx > 0) = next page, left = previous -- the
      // same direction a real mushaf page turns, opposite of a Latin book
      if (dx > 0) goToNextPage();
      else goToPrevPage();
    }
    touchStartX = null;
  });

  window.addEventListener("hashchange", () => {
    const n = initialPageFromHash();
    if (n !== null && n !== state.currentPage) showPage(n, { skipHash: true });
  });

  layoutPageContainer();
  window.addEventListener("resize", layoutPageContainer);
  window.addEventListener("orientationchange", () => setTimeout(layoutPageContainer, 60));
  if (window.ResizeObserver) {
    new ResizeObserver(() => layoutPageContainer()).observe(els.readerScroll);
  }
}

export { setupNav };
