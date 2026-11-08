// Sure modalındaki ayet düğmeleri ızgarası (.ayah-chip) için ok tuşu gezintisi -- roving tabindex + iki boyutlu gezinti.
//
// Neden var: "ayetlerini listele" ile açılan ızgarada her ayet düğmesi ayrı bir Tab durağıydı ve ok tuşları bir şey yapmıyordu.
// Gerçek Chromium'da ölçülen durum (yamadan önce, 430x900, sayfa 50: Sure 3 etkin, her senaryo taze sayfa, yalnızca klavye; Bakara
// ızgarası: 286 düğme, 400 px genişlikte 35 görsel satır: ilk 11 satırda 9, sonraki 23 satırda 8, son satırda 3 düğme):
//   - açma düğmesinden Tab'la ızgarayı geçmek 286 Tab (ızgaradan sonraki durak Kapat); 320 ve 1200 px'te de 286;
//   - ilk Tab, seçili ayet 2:255 olsa da 1. ayet düğmesine gidiyor;
//   - Yukarı, Aşağı, Sol, Sağ, Home, End, PageUp, PageDown: odak 2:1'den oynamıyor; liste kayıyor, End ve Home'dan sonra odaklı
//     düğme görünür alandan çıkıyor; End + Enter 286. ayeti değil 1. ayeti seçiyor (#page=2).
// Yani ızgaranın sonundaki bir ayete klavyeyle varmak yüzlerce Tab.
//
// Burada üç şey yapılıyor:
//   1. Roving tabindex: bir ızgaranın TEK Tab durağı var (tabindex="0"), öteki düğmeler "-1". Durak, odak ızgaradaysa odaktaki düğme,
//      değilse seçili ayet (aria-current="true"), o da yoksa ilk düğme; sonra odaklanan düğme (focusin). tabindex'i
//      `.active`/aria-current'la AYNI yerlerde yazmak app.js'in işi (syncGridStop çağırıyor: setActiveAyahChip, syncAyahGridHighlight,
//      ızgaranın her açılışı; modal her kapanışta ızgaraları kapattığı için ızgara hep yeniden açılışla başlıyor): iki bilgi
//      ayrışmasın. Odaktaki düğme durak kalıyor: ses oynarken sayfa ve seçili ayet ilerler (showPage ızgaraları eşler), ızgarada
//      gezen kullanıcının düğmesinin tabindex'i -1'e düşmemeli. modal-odak.js'in tabbablesIn'i tabindex < 0 olanları zaten saymıyor.
//   2. Ok tuşları, ızgaranın GÖRSEL düzenine göre: ızgara sarmalanan bir düğme akışı (flex-wrap; düğme 34 px, üç haneli ayet
//      numaralarında 38 px: Bakara'da 100. ayetten sonra satıra 9 yerine 8 düğme sığıyor, yani sütunlar satırdan satıra aynı değil).
//      Sağ/Sol bir önceki/sonraki ayet (satır sonunda yandaki satıra geçer, okur gibi); Yukarı/Aşağı bir üst/alt görsel satırda
//      yatay merkezi en yakın düğme; Home/End ızgaranın ilk/son ayeti; PageUp/PageDown PAGE_ROWS görsel satır. Uçlarda dönülmez
//      (ayet gezgininde ve liste gezintisinde de böyle) ve odak yerinde kalır.
//   3. Satırlar ve yatay merkezler, her tuşta düğmelerin offsetTop/offsetLeft/offsetWidth'inden okunuyor: tam sayı, dönüşümlerden
//      (modal açılış animasyonu) etkilenmiyor, pencere genişliği ya da yazı boyutu değişince de güncel.
//
// Roller aynı kalıyor: düğmeler düz düğme (grid/gridcell yok), seçili ayet aria-current ile bildiriliyor, adları "<Sure> Suresi, <N>. ayet".
// Sure listesinin satırları arasındaki gezinti (js/liste-gezintisi.js) ayrı: ızgara düğmelerinden gelen tuşları o işlemiyor, ızgara
// düğmeleri de satırlar arasında gezmiyor (açma düğmesinden Aşağı, açık ızgarayı atlayıp sonraki sureye gidiyor; ızgaraya Tab'la girilir).
//
// Değiştiricili tuşlar (Alt+Sol = tarayıcıda geri, Ctrl+Home, Shift+ok...) ve başka bir işleyicinin tükettiği olaylar yok sayılır.
// Yalnızca gerçekten işlenen tuşun varsayılanı engellenir (liste ok ile kaymasın); Tab/Enter/Space/Escape ve öteki tuşlara dokunulmaz.
// Tuş basılı tutulunca (e.repeat) gezinti sürer.
//
// DOM'a bağlı yerler setupGridNav ve syncGridStop; saf yardımcı targetChip dışa aktarılıyor ki jsdom'da sınanabilsin
// (bkz. test/izgara_gezintisi_test.mjs).

// PageUp/PageDown'ın atladığı görsel satır sayısı: 10 satır = 360 px (satır adımı 36 px). Sure modalının listesi 430x900'de 583 px,
// 1200x800'de 582 px, 320x640'ta 442 px yüksek: yani 10 satır en çok ekranın %81'i (ölçüldü), hiçbir ekranda bir ekrandan fazla atlamıyor.
export const PAGE_ROWS = 10;

// Odak (row, col) düğmesindeyken `key` basılınca odaklanacak düğme ({ row, col }); bu ızgarada işlenmeyen tuş ya da geçersiz girdi için
// null. Saf işlev (DOM'a dokunmaz). centers: görsel satırlar, her satırda soldan sağa düğmelerin yatay merkezi (satırlar boş değil).
//   Sağ/Sol: bir sonraki/önceki düğme, satır sonunda yandaki satırın ilk/son düğmesi; ızgaranın başında/sonunda yerinde kalır.
//   Aşağı/Yukarı/PageDown/PageUp: hedef satır (1 ya da PAGE_ROWS satır, uçlara kırpılır) ve orada yatay merkezi odaktaki düğmeye
//     en yakın düğme (eşitlikte soldaki); zaten uçtaki satırdaysa yerinde kalır.
//   Home/End: ızgaranın ilk/son düğmesi.
export function targetChip(key, row, col, centers) {
  if (!Array.isArray(centers) || centers.length === 0 || !centers.every((r) => Array.isArray(r) && r.length >= 1 && r.every(Number.isFinite))) return null;
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= centers.length || col < 0 || col >= centers[row].length) return null;
  const last = centers.length - 1;
  const clampRow = (n) => Math.min(Math.max(n, 0), last);
  const vertical = (steps) => {
    const to = clampRow(row + steps);
    if (to === row) return { row, col };
    const x = centers[row][col];
    let best = 0;
    for (let c = 1; c < centers[to].length; c++) if (Math.abs(centers[to][c] - x) < Math.abs(centers[to][best] - x)) best = c;
    return { row: to, col: best };
  };
  switch (key) {
    case "ArrowRight":
      if (col + 1 < centers[row].length) return { row, col: col + 1 };
      return row < last ? { row: row + 1, col: 0 } : { row, col };
    case "ArrowLeft":
      if (col > 0) return { row, col: col - 1 };
      return row > 0 ? { row: row - 1, col: centers[row - 1].length - 1 } : { row, col };
    case "ArrowDown":
      return vertical(1);
    case "ArrowUp":
      return vertical(-1);
    case "PageDown":
      return vertical(PAGE_ROWS);
    case "PageUp":
      return vertical(-PAGE_ROWS);
    case "Home":
      return { row: 0, col: 0 };
    case "End":
      return { row: last, col: centers[last].length - 1 };
    default:
      return null;
  }
}

const CHIP = ".ayah-chip";
const GRID = ".ayah-grid";

// Izgaranın görsel satırları: offsetTop'u aynı olan ardışık düğmeler bir satır (flex-wrap'ta aynı satırın düğmeleri aynı üst konumda).
// rows: düğme öğeleri, centers: yatay merkezleri (offsetLeft + offsetWidth / 2); ikisi aynı şekilde.
function measureGrid(gridEl) {
  const rows = [];
  const centers = [];
  let top = null;
  for (const chip of gridEl.querySelectorAll(CHIP)) {
    if (top === null || chip.offsetTop !== top) {
      rows.push([]);
      centers.push([]);
      top = chip.offsetTop;
    }
    rows[rows.length - 1].push(chip);
    centers[centers.length - 1].push(chip.offsetLeft + chip.offsetWidth / 2);
  }
  return { rows, centers };
}

function locate(rows, el) {
  for (let r = 0; r < rows.length; r++) {
    const c = rows[r].indexOf(el);
    if (c >= 0) return { row: r, col: c };
  }
  return null;
}

function setStop(chips, stop) {
  for (const chip of chips) chip.tabIndex = chip === stop ? 0 : -1;
}

// Izgaranın tek Tab durağını koyar: odak bu ızgaradaki bir düğmedeyse o düğme, değilse seçili ayet (aria-current="true"), o da
// yoksa ilk düğme. Izgara her açıldığında ve seçili ayet her değiştiğinde çağrılır (app.js): ızgaraya Tab'la girerken ok
// tuşlarıyla gezilen son düğme değil seçili ayet karşılar.
export function syncGridStop(gridEl) {
  const chips = [...gridEl.querySelectorAll(CHIP)];
  if (chips.length === 0) return;
  const focused = chips.find((c) => c === gridEl.ownerDocument.activeElement);
  setStop(chips, focused || chips.find((c) => c.getAttribute("aria-current") === "true") || chips[0]);
}

// listEl (Sure listesi) içindeki ızgaralara klavye gezintisini bağlar (tek dinleyici çifti, olay devri: ızgaralar tembel kuruluyor).
// Dönüş değeri dinleyicileri kaldırır.
export function setupGridNav(listEl) {
  // Olay bir ayet düğmesinden geliyorsa onu ve ızgarasını verir (aksi hâlde null: satır hücreleri, listenin kendisi).
  const chipOf = (e) => {
    const t = e.target;
    if (!t.classList.contains("ayah-chip")) return null;
    const grid = t.closest(GRID);
    return grid ? { chip: t, grid } : null;
  };

  const onKeydown = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const hit = chipOf(e);
    if (!hit) return;
    const { rows, centers } = measureGrid(hit.grid);
    const at = locate(rows, hit.chip);
    if (!at) return;
    const to = targetChip(e.key, at.row, at.col, centers);
    if (!to) return;
    e.preventDefault(); // liste ok tuşlarıyla kaymasın (odak zaten ilgili düğmeye gidiyor); uçta da engellenir
    const next = rows[to.row][to.col];
    if (next !== hit.chip) next.focus();
  };

  const onFocusin = (e) => {
    const hit = chipOf(e);
    if (hit) setStop([...hit.grid.querySelectorAll(CHIP)], hit.chip);
  };

  listEl.addEventListener("keydown", onKeydown);
  listEl.addEventListener("focusin", onFocusin);
  return () => {
    listEl.removeEventListener("keydown", onKeydown);
    listEl.removeEventListener("focusin", onFocusin);
  };
}
