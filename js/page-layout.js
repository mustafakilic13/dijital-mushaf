// page-layout.js -- sayfa kabının (#page-container) okuyucu alanına göre boyutlandırılması ve kapalı sayfanın yerine takılması.

import { PAGE_WIDTH } from "./render.js";
import { els, state } from "./state.js";

// Sizes the page to fill the reader's available WIDTH ("Page Width" mode,
// like a PDF viewer, matching digitalkhatt.org) -- height follows from the
// CURRENT page's actual aspect ratio (pages vary: a surah header is drawn
// at full column width with its height following proportionally, plus 5
// lines of space before it and 3 after, so pages with headers are taller
// than plain ones). .reader-scroll handles the vertical scrolling for
// whatever that works out to, so on a short/landscape screen -- or a page
// with one or more headers -- the page reads at full width instead of
// being shrunk down to fit in one screenful.
//
// While the word-meal panel is open, #page-container instead holds THREE
// stacked children -- a cropped "top slice" of the page (down to the
// tapped ayah's last line), the HTML panel, and a cropped "bottom slice"
// (the rest of the page, a *clone* of the same svg shifted up so only its
// remainder shows) -- see openWordMeal. #page-container's own height is
// left automatic in that case (so it simply grows to fit the panel's
// content, pushing the bottom slice down); this function only ever sets
// pixel width/height on the svg(s)/slices themselves, computed from the
// container's own padding so the true 17000:currentTotalHeight page aspect
// ratio is kept exactly regardless of that padding.
function layoutPageContainer() {
  const scroller = els.readerScroll;
  if (!scroller) return;
  const scs = getComputedStyle(scroller);
  const scrollPadX = parseFloat(scs.paddingLeft || 0) + parseFloat(scs.paddingRight || 0);
  const outerW = Math.max(0, scroller.clientWidth - scrollPadX);
  if (outerW === 0) return;
  els.pageContainer.style.width = `${Math.floor(outerW)}px`;

  const pcs = getComputedStyle(els.pageContainer);
  const containerPadX = parseFloat(pcs.paddingLeft || 0) + parseFloat(pcs.paddingRight || 0);
  const contentW = Math.max(0, outerW - containerPadX);
  const contentH = (contentW * state.currentTotalHeight) / PAGE_WIDTH;

  if (!state.wordMeal.open) {
    const svg = els.pageContainer.firstElementChild;
    if (svg && svg.classList && svg.classList.contains("mushaf-page-svg")) {
      svg.style.width = `${contentW}px`;
      svg.style.height = `${contentH}px`;
    }
    return;
  }

  const wm = state.wordMeal;
  if (!wm.topSvg || !wm.bottomSvg || !wm.topEl || !wm.bottomOuterEl || !wm.bottomInnerEl || wm.cutY == null) return;
  const cutYpx = (wm.cutY * contentW) / PAGE_WIDTH;

  wm.topSvg.style.width = `${contentW}px`;
  wm.topSvg.style.height = `${contentH}px`;
  wm.topEl.style.height = `${cutYpx}px`;

  wm.bottomSvg.style.width = `${contentW}px`;
  wm.bottomSvg.style.height = `${contentH}px`;
  wm.bottomInnerEl.style.height = `${contentH}px`;
  wm.bottomInnerEl.style.marginTop = `-${cutYpx}px`;
  wm.bottomOuterEl.style.height = `${Math.max(0, contentH - cutYpx)}px`;
}

// Puts `svg` (a page's canonical, cached <svg>) back as #page-container's
// only child -- tearing down the word-meal panel's top/bottom slice split
// if it was showing -- and (re)applies sizing. Used both for normal page
// display (showPage) and once the panel's close animation finishes.
function mountClosedPage(svg) {
  if (els.pageContainer.firstElementChild !== svg || els.pageContainer.children.length !== 1) {
    els.pageContainer.innerHTML = "";
    els.pageContainer.appendChild(svg);
  }
  state.wordMeal.panelEl = null;
  state.wordMeal.bodyEl = null;
  state.wordMeal.topEl = null;
  state.wordMeal.topSvg = null;
  state.wordMeal.bottomOuterEl = null;
  state.wordMeal.bottomInnerEl = null;
  state.wordMeal.bottomSvg = null;
  layoutPageContainer();
}

export { layoutPageContainer, mountClosedPage };
