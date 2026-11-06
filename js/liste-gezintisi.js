// Modal listelerinde ok tuşu gezintisi -- roving tabindex: Sure, Cüz/Hizb/Rub/Menzil ve Ezber'in Sure/Kârî seçicileri.
//
// Neden var: bu listelerin her satırı düz bir <button> ve her biri ayrı bir Tab durağıydı; ok tuşları hiçbir listede
// bir şey yapmıyordu. Gerçek Chromium'da ölçülen durum (yamadan önce, 430 px, her senaryo taze sayfa, yalnızca klavye):
//   - Sure modalı: modalda 229 Tab durağı (Kapat + 114 sure düğmesi + 114 "ayetlerini listele" düğmesi). Kapat'tan sonraki
//     ilk Tab ilk satıra gidiyor (Sure 3 etkin olsa da); Yâsîn'e (36) 72, son sureye (114) 228 Tab;
//   - Cüz modalı: sekme çubuğundan son satıra Cüz'de 30, Hizb'de 60, Rub'da 240, Menzil'de 7 Tab;
//   - Ezber Sure seçicisi: Geri'den sonra 36. sureye 37, 114. sureye 115 Tab;
//   - Yukarı, Aşağı, Home, End, PageUp, PageDown, Sol, Sağ: sekiz tuş, her listede odak yerinden oynamıyor.
// Yani listenin sonundaki bir sureye klavyeyle varmak yüzlerce Tab, listeden çıkmak (Shift+Tab ya da Tab) aynı yol.
//
// Burada üç şey yapılıyor:
//   1. Roving tabindex: bir listenin TEK Tab durağı var (tabindex="0"); öteki hücreler "-1". Durak, listeye girerken
//      şu anki öğe (aria-current="true": Sure 3 açıkken 3. sure) ya da hiçbiri yoksa ilk hücre; sonra odaklanan hücre
//      olur. Tab listeye bir kez girer, bir kez çıkar. tabindex'i `.active`/aria-current'la AYNI yerde yazmak
//      app.js'in setActiveModalItem'inin işi (syncListStop çağırıyor): iki bilgi ayrışmasın. Başlangıç değeri de
//      setupListNav'da aynı kurala göre konuyor. modal-odak.js'in tabbablesIn'i tabindex < 0 olanları zaten saymıyor,
//      yani modalın ilk/son durağı hesabı doğru kalıyor.
//   2. Ok tuşları: Yukarı/Aşağı bir satır, Home/End ilk/son satır, PageUp/PageDown PAGE_STEP satır; uçlarda dönülmez
//      (ayet gezgininde de böyle; 114 satırlık listede sondan başa sıçramak şaşırtıcı). Sure listesinde her satır iki
//      hücre (sure düğmesi + "ayetlerini listele" düğmesi, yan yana): Sağ/Sol aralarında geçer, Yukarı/Aşağı sütunu
//      korur. Tek hücreli listelerde (Cüz, Hizb, Rub, Menzil, Ezber seçicileri) Sol/Sağ işlenmez.
//   3. focusin: odağın girdiği her hücre (Tab, ok, fare, programatik) listenin durağı olur; durak hiç odağın
//      gerisinde kalmıyor.
//
// Roller aynı kalıyor: satırlar düz düğme (listbox/option yok), etkin satır aria-current ile bildiriliyor; ekran okuyucu
// kullanıcısı sanal imleçle yine her satıra gidebilir (tabindex="-1" erişilebilirlik ağacından çıkarmaz).
// Ayet düğmeleri (.ayah-chip: açılan ızgara) bu gezintiye GİRMEZ, normal Tab durakları olarak duruyor: ızgara düzeni
// kaydırmalı bir satır dizisi, ona uygun gezinti ayrı bir iş.
//
// Değiştiricili tuşlar (Alt+Sol = tarayıcıda geri, Ctrl+Home, Shift+ok...) ve başka bir işleyicinin tükettiği olaylar
// yok sayılır. Yalnızca gerçekten işlenen tuşun varsayılanı engellenir (liste ok ile kaymasın); Tab/Enter/Space/Escape
// ve öteki tuşlara dokunulmaz. Tuş basılı tutulunca (e.repeat) gezinti sürer.
//
// DOM'a bağlı yerler setupListNav ve syncListStop; saf yardımcı targetCell dışa aktarılıyor ki jsdom'da sınanabilsin
// (bkz. test/liste_gezintisi_test.mjs).

// PageUp/PageDown'ın atladığı satır sayısı: yaklaşık bir ekran (Sure modalı 430x900'de ≈ 9,4, 1200x800'de ≈ 9,4, 320x640'ta
// ≈ 7,1 satır gösteriyor: 583 px yüksek liste / 62 px satır adımı; ölçüldü).
export const PAGE_STEP = 10;

// Odak (row, col) hücresindeyken `key` basılınca odaklanacak hücre ({ row, col }); bu listede işlenmeyen tuş ya da geçersiz
// girdi için null. Saf işlev (DOM'a dokunmaz). rowLengths: her satırın hücre sayısı (hepsi >= 1).
//   Yukarı/Aşağı/PageUp/PageDown/Home/End: hedef satıra gider, sütun korunur (hedef satır daha kısaysa son hücre);
//   uçlarda yerinde kalır. Sol/Sağ: aynı satırda komşu hücre, uçlarda yerinde kalır; tek hücreli satırda işlenmez (null).
export function targetCell(key, row, col, rowLengths) {
  if (!Array.isArray(rowLengths) || rowLengths.length === 0 || !rowLengths.every((n) => Number.isInteger(n) && n >= 1)) return null;
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= rowLengths.length || col < 0 || col >= rowLengths[row]) return null;
  const clamp = (n, max) => Math.min(Math.max(n, 0), max);
  const last = rowLengths.length - 1;
  let to;
  if (key === "ArrowDown") to = row + 1;
  else if (key === "ArrowUp") to = row - 1;
  else if (key === "PageDown") to = row + PAGE_STEP;
  else if (key === "PageUp") to = row - PAGE_STEP;
  else if (key === "Home") to = 0;
  else if (key === "End") to = last;
  else if (key === "ArrowRight" || key === "ArrowLeft") {
    if (rowLengths[row] < 2) return null;
    return { row, col: clamp(key === "ArrowRight" ? col + 1 : col - 1, rowLengths[row] - 1) };
  } else return null;
  to = clamp(to, last);
  return { row: to, col: Math.min(col, rowLengths[to] - 1) };
}

// Bir listenin satır matrisini üreten işlev (setupListNav'ın getRows'u): her çağrıda DOM'dan yeniden okunur.
//   rowSel verilmezse: cellSel ile eşleşen her öğe tek hücreli bir satır (Cüz, Hizb, Rub, Menzil, Ezber seçicileri).
//   rowSel verilirse: rowSel ile eşleşen her öğe bir satır, hücreleri onun içinde cellSel ile eşleşenler (Sure listesi).
export function listRows(listEl, cellSel, rowSel = null) {
  return () =>
    rowSel
      ? [...listEl.querySelectorAll(rowSel)].map((row) => [...row.querySelectorAll(cellSel)])
      : [...listEl.querySelectorAll(cellSel)].map((cell) => [cell]);
}

// Liste -> getRows. syncListStop, listeyi tanımak için buna bakıyor (app.js'in setActiveModalItem'i listeyi yalnızca
// elemanıyla çağırıyor); kayıtsız listede syncListStop hiçbir şey yapmaz.
const registry = new WeakMap();

const nonEmpty = (rows) => rows.filter((r) => r.length > 0);

function locate(rows, el) {
  for (let r = 0; r < rows.length; r++) {
    const c = rows[r].indexOf(el);
    if (c >= 0) return { row: r, col: c };
  }
  return null;
}

function setStop(rows, stop) {
  for (const row of rows) for (const cell of row) cell.tabIndex = cell === stop ? 0 : -1;
}

// Listenin tek Tab durağını şu anki öğeye (aria-current="true"), yoksa ilk hücreye koyar. Liste her gösterilmeden
// önce çağrılır (app.js setActiveModalItem): modal yeniden açılınca ok tuşlarıyla gezilen son satır değil, şu anki
// satır durak olur.
export function syncListStop(listEl) {
  const getRows = registry.get(listEl);
  if (!getRows) return;
  const rows = nonEmpty(getRows());
  const cells = rows.flat();
  if (cells.length === 0) return;
  setStop(rows, cells.find((c) => c.getAttribute("aria-current") === "true") || cells[0]);
}

// listEl'deki hücrelere klavye gezintisini bağlar ve başlangıç durağını koyar. getRows: bkz. listRows. Dönüş değeri
// dinleyicileri kaldırır.
export function setupListNav(listEl, getRows) {
  registry.set(listEl, getRows);

  const onKeydown = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const rows = nonEmpty(getRows());
    // Olay bir hücreden gelmiyorsa (ayet düğmesi, listenin kendisi) locate null verir: ayrıca bir "hücreden mi geldi"
    // denetimi gerekmiyor.
    const at = locate(rows, e.target);
    if (!at) return;
    const to = targetCell(e.key, at.row, at.col, rows.map((r) => r.length));
    if (!to) return;
    e.preventDefault(); // liste ok tuşlarıyla kaymasın (odak zaten ilgili satıra gidiyor); uçta da engellenir
    const cell = rows[to.row][to.col];
    if (cell !== e.target) cell.focus();
  };

  const onFocusin = (e) => {
    const rows = nonEmpty(getRows());
    if (locate(rows, e.target)) setStop(rows, e.target);
  };

  listEl.addEventListener("keydown", onKeydown);
  listEl.addEventListener("focusin", onFocusin);
  syncListStop(listEl);
  return () => {
    listEl.removeEventListener("keydown", onKeydown);
    listEl.removeEventListener("focusin", onFocusin);
    registry.delete(listEl);
  };
}
