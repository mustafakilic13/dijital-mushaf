// Ayet gezgini -- sayfadaki ayetlere ve sure başlıklarına klavye / ekran okuyucu yolu.
//
// Neden var: sayfa tek bir <svg> (harfler yol/path olarak çiziliyor, üstünde görünmez bir metin
// katmanı) ve ayet detay panelini (kelime meali, meal, tefsir, konular) ile Sure Bilgisi'ni açmanın
// TEK yolu bu SVG'ye fareyle/dokunarak tıklamaktı. Gerçek Chromium'da ölçülen durum (yamadan önce,
// 1. sayfa): 430 px'te 6, 1200 px'te 9 Tab durağı var ve hiçbiri sayfanın içeriğine (ayetlere, sure
// başlığına) gitmiyor; her durağa (1200 px'teki kaydırma kapsayıcısı hariç) Enter ve Space ile toplam
// 28 deneme yapıldı, ayet paneli de Sure Bilgisi de 0 kez açıldı. Yani uygulamanın ana özelliğine
// klavyeyle ya da ekran okuyucuyla ulaşılamıyordu.
//
// Çözüm sayfayı yeniden çizmeden, SVG'nin yanına kendi erişilebilirlik ağacını eklemek: görsel olarak
// gizli (.sr-only) bir <nav> içinde o sayfadaki her sure başlığı ve her ayet gerçek bir <button>.
//   - Sure başlığı düğmeleri normal Tab durağı; Enter -> Sure Bilgisi modalı.
//   - Ayet düğmeleri TEK Tab durağı ("roving tabindex": seçili ayet tabindex="0", diğerleri "-1").
//     Yukarı/Aşağı/Home/End ayetler arasında gezer VE gezdiği ayeti seçer (sayfadaki vurgu da
//     taşınır: fareyle o ayete dokunmakla aynı durum). Enter/Space paneli açar/kapatır
//     (aria-expanded). Sınırda dönülmez ve sayfa değişmez.
//   - Sol/Sağ ok sayfa çevirmeye devam eder: o belge düzeyindeki işleyicide, burada ele alınmıyor.
// Odak halkası gizli düğmenin değil, sayfadaki seçili ayetin vurgusunun (ya da sure başlığının) üstüne çizilir
// (CSS: #ayah-nav[data-kbd="ayah"]); yalnızca :focus-visible ise, yani fareyle gelen odakta halka çıkmaz.
//
// DOM'a bağlı tek yer createAyahNav(); app.js yalnızca showPage/openWordMeal/closeWordMeal'dan
// sync() çağırıyor. Saf yardımcılar da dışa aktarılıyor ki jsdom'da sınanabilsin
// (bkz. test/ayet_gezgini_test.mjs).

const SURAH_CLASS = "ayah-nav-surah";
const AYAH_CLASS = "ayah-nav-item";

// Bir sayfanın ayet parçalarından (render.js segments: bir ayet birden çok satıra yayılırsa birden çok
// parça) okuma sırasına göre benzersiz ayet listesi.
export function ayahsOnPage(segments) {
  const seen = new Set();
  const out = [];
  for (const s of segments || []) {
    const key = `${s.surah}:${s.ayah}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ surah: s.surah, ayah: s.ayah });
  }
  return out;
}

// Sayfanın SVG'sindeki sure başlıkları (render.js drawSurahHeader'ın .surah-header-hit grupları),
// sırasıyla ve benzersiz. Yalnızca gerçekten çizilmiş olanlar: fareyle tıklanabilenlerle birebir aynı küme.
export function surahsOfSvg(svg) {
  const out = [];
  if (!svg) return out;
  for (const g of svg.querySelectorAll(".surah-header-hit")) {
    const n = Number.parseInt(g.getAttribute("data-surah"), 10);
    if (Number.isInteger(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

// Dikey bir aralığı (rect.top/bottom) görünür pencereye (view.top/bottom) en az kaydırmayla getirmek
// için gereken kaydırma miktarı: pozitif -> aşağı kaydır, negatif -> yukarı, 0 -> zaten görünür.
// `margin` pencerenin her iki kenarında boş bırakılır (vurgunun halkası kenarda kesilmesin).
// Aralık pencereden uzunsa üst kenar hizalanır (uzun bir ayetin BAŞI görünsün).
export function revealDelta(rect, view, margin = 0) {
  const top = view.top + margin;
  const bottom = view.bottom - margin;
  if (rect.bottom - rect.top >= bottom - top) return rect.top - top;
  if (rect.top < top) return rect.top - top;
  if (rect.bottom > bottom) return rect.bottom - bottom;
  return 0;
}

// :focus-visible desteklenmiyorsa (ya da seçici ayrıştırılamıyorsa) halka gösterilir: fazla göstermek,
// klavye kullanıcısını odağı görünmez bırakmaktan iyi.
function focusVisible(el) {
  try {
    return el.matches(":focus-visible");
  } catch (_) {
    return true;
  }
}

// doc: belge; root: <nav id="ayah-nav"> (içinde .ayah-nav-surahs ve .ayah-nav-ayahs listeleri);
// hooks: {
//   surahName(n)             -> sure numarasının Türkçe adı,
//   onSelect({surah, ayah})  -> ok tuşlarıyla bu ayete geçildi (seçimi uygula: showPage),
//   onActivate({surah, ayah})-> Enter/Space/tıklama: ayet panelini aç/kapat,
//   onOpenSurahInfo(surah)   -> Sure Bilgisi modalını aç,
//   onFocusTarget(target)    -> (isteğe bağlı) odak gezginde: {kind:"ayah"|"surah", surah, ayah?};
//                               gezginden çıkınca null. Sayfayı görünür alana kaydırmak için.
// }
export function createAyahNav(doc, root, hooks) {
  const surahList = root.querySelector(".ayah-nav-surahs");
  const ayahList = root.querySelector(".ayah-nav-ayahs");
  let items = []; // [{ surah, ayah, el }] okuma sırasıyla
  let surahItems = []; // [{ surah, el }]
  let current = null; // tabindex="0" taşıyan ayet öğesi
  let lastKey = null;
  let notified = false; // onFocusTarget en son null olmayan bir değerle mi çağrıldı

  const sameAyah = (a, b) => !!a && !!b && a.surah === b.surah && a.ayah === b.ayah;

  function makeButton(className, label, data) {
    const li = doc.createElement("li");
    const el = doc.createElement("button");
    el.type = "button";
    el.className = className;
    el.textContent = label;
    for (const [k, v] of Object.entries(data)) el.dataset[k] = String(v);
    li.appendChild(el);
    return { li, el };
  }

  function rebuild(ayahs, surahs) {
    surahList.innerHTML = "";
    ayahList.innerHTML = "";
    surahItems = surahs.map((surah) => {
      const { li, el } = makeButton(SURAH_CLASS, `${hooks.surahName(surah)} Suresi hakkında bilgi`, { surah });
      surahList.appendChild(li);
      return { surah, el };
    });
    items = ayahs.map(({ surah, ayah }) => {
      const { li, el } = makeButton(AYAH_CLASS, `${hooks.surahName(surah)} Suresi, ${ayah}. ayet`, { surah, ayah });
      ayahList.appendChild(li);
      return { surah, ayah, el };
    });
    // Boş liste ekran okuyucuda "liste, 0 öğe" diye okunmasın.
    surahList.hidden = surahItems.length === 0;
    ayahList.hidden = items.length === 0;
    current = null;
  }

  function applyState(selected, expanded) {
    current = items.find((it) => sameAyah(it, selected)) || items[0] || null;
    for (const it of items) {
      it.el.tabIndex = it === current ? 0 : -1;
      if (sameAyah(it, selected)) it.el.setAttribute("aria-current", "true");
      else it.el.removeAttribute("aria-current");
      it.el.setAttribute("aria-expanded", sameAyah(it, expanded) ? "true" : "false");
    }
  }

  function targetOf(el) {
    const b = el && el.closest ? el.closest("button") : null;
    if (!b || !root.contains(b)) return null;
    const surah = Number(b.dataset.surah);
    if (b.classList.contains(AYAH_CLASS)) return { kind: "ayah", surah, ayah: Number(b.dataset.ayah) };
    if (b.classList.contains(SURAH_CLASS)) return { kind: "surah", surah };
    return null;
  }

  function hasFocus() {
    const a = doc.activeElement;
    return !!a && root.contains(a);
  }

  // Odak halkası işareti: yalnızca odak gezgindeyse VE :focus-visible ise. Değer odaklanan öğenin türü ("ayah" |
  // "surah"): ayet halkası yalnızca ayet düğmesine odak varken çizilir, sure başlığı düğmesindeyken sayfada iki
  // halka birden (başlıkta ve vurguda) görünmesin.
  function setMarker(el) {
    const t = el ? targetOf(el) : null;
    if (t && focusVisible(el)) root.setAttribute("data-kbd", t.kind);
    else root.removeAttribute("data-kbd");
  }

  function notify(target) {
    if (!hooks.onFocusTarget) return;
    if (target === null && !notified) return; // zaten bildirilmiş "odak dışarıda"
    notified = target !== null;
    hooks.onFocusTarget(target);
  }

  function moveTo(it) {
    for (const o of items) o.el.tabIndex = o === it ? 0 : -1;
    current = it;
    it.el.focus({ preventScroll: true });
    hooks.onSelect({ surah: it.surah, ayah: it.ayah });
  }

  function onKeydown(e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const t = e.target && e.target.closest ? e.target.closest("button") : null;
    if (!t || !root.contains(t)) return;
    // Enter basılı tutulunca tarayıcı click'i tekrarlar: panel saniyede onlarca kez açılıp kapanmasın.
    if (e.key === "Enter" && e.repeat) {
      e.preventDefault();
      return;
    }
    if (!t.classList.contains(AYAH_CLASS)) return;
    const from = items.findIndex((it) => it.el === t);
    if (from < 0) return;
    let to;
    if (e.key === "ArrowDown") to = from + 1;
    else if (e.key === "ArrowUp") to = from - 1;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = items.length - 1;
    else return; // Sol/Sağ (sayfa çevirme), Tab, Enter, Space, Escape: dokunma
    e.preventDefault(); // ok tuşları sayfayı kaydırmasın
    if (to < 0 || to >= items.length || to === from) return; // uçlarda dönme yok
    moveTo(items[to]);
  }

  function onClick(e) {
    const t = targetOf(e.target);
    if (!t) return;
    if (t.kind === "surah") hooks.onOpenSurahInfo(t.surah);
    else hooks.onActivate({ surah: t.surah, ayah: t.ayah });
  }

  function onFocusin(e) {
    const t = targetOf(e.target);
    if (!t) return;
    setMarker(e.target);
    notify(t);
  }

  function onFocusout(e) {
    if (e.relatedTarget && root.contains(e.relatedTarget)) return; // gezgin içinde taşınıyor
    root.removeAttribute("data-kbd");
    notify(null);
  }

  root.addEventListener("keydown", onKeydown);
  root.addEventListener("click", onClick);
  root.addEventListener("focusin", onFocusin);
  root.addEventListener("focusout", onFocusout);

  return {
    // Sayfa/seçim/panel durumu her değiştiğinde (showPage, openWordMeal, closeWordMeal, Ezber başlangıcı/bitişi).
    //   visible       false -> gezgin tamamen gizlenir (Ezber çalışırken: orada ayet seçimi kelime açma demek)
    //   ayahs, surahs sayfadaki ayetler ve sure başlıkları (liste yalnızca DEĞİŞTİYSE yeniden kurulur)
    //   selected      seçili ayet ({surah, ayah}); roving tabindex ve aria-current buna göre
    //   expanded      paneli açık ayet ya da null (aria-expanded)
    //   restoreFocus  odak az önce gezgin DIŞINDA bir yerden (kaldırılan panelden) çekildi: seçili ayete ver
    sync({ visible = true, ayahs = [], surahs = [], selected = null, expanded = null, restoreFocus = false } = {}) {
      if (!visible) {
        root.hidden = true;
        root.removeAttribute("data-kbd");
        notify(null);
        return;
      }
      const active = doc.activeElement;
      const hadFocus = hasFocus();
      const focusedSurah = hadFocus && active.classList.contains(SURAH_CLASS) ? Number(active.dataset.surah) : null;

      const key = `${ayahs.map((a) => `${a.surah}:${a.ayah}`).join(",")}|${surahs.join(",")}`;
      const rebuilt = key !== lastKey;
      if (rebuilt) {
        rebuild(ayahs, surahs);
        lastKey = key;
      }
      root.hidden = false;
      applyState(selected, expanded);

      // Odaklı öğe yeniden kurulumla (sayfa değişti) ya da kaldırılan panelle birlikte yok olduysa odak <body>'ye
      // düşerdi: aynı sure başlığına, yoksa seçili ayete geri ver. Yeniden kurulmadıysa odak zaten yerinde.
      if ((rebuilt && hadFocus) || restoreFocus) {
        const s = focusedSurah !== null ? surahItems.find((x) => x.surah === focusedSurah) : null;
        const target = s ? s.el : current && current.el;
        if (target) target.focus({ preventScroll: true });
      }
      if (hasFocus()) {
        setMarker(doc.activeElement);
        notify(targetOf(doc.activeElement)); // vurgu taşındı: kaydırma yeniden hesaplanabilsin
      } else {
        root.removeAttribute("data-kbd");
        notify(null);
      }
    },
  };
}
