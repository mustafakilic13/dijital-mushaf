// Sekme listesi (role="tablist") klavye gezintisi -- WAI-ARIA Authoring Practices "Tabs" deseni,
// otomatik etkinleştirme (odak bir sekmeye gelince o sekme de seçilir).
//
// Neden var: Cüz (Cüz/Hizb/Rub/Menzil) ve Ezber (Dinle/Oku/Yaz) pencerelerinin sekme çubukları
// role="tablist"/"tab"/"tabpanel", aria-selected ve aria-controls ilan ediyordu, ama klavyede
// sıradan düğme dizisiydi. Gerçek Chromium'da ölçülen durum (yamadan önce, 430 px):
//   - her sekme ayrı bir Tab durağıydı: Cüz'de 4, Ezber'de 3. Panelin içeriğine geçmek için hepsini
//     aşmak, geri dönmek için aynısını Shift+Tab ile yapmak gerekiyordu;
//   - Sol/Sağ/Home/End hiçbir şey yapmıyordu: odak, seçim ve panel yerinde kalıyordu. Ekran okuyucu
//     "sekme" diye ilan edip ok tuşunu bekletirken ok hiçbir yere götürmüyordu.
//
// Burada iki şey yapılıyor:
//   1. Roving tabindex: seçili sekme tabindex="0", diğerleri "-1" -> sekme çubuğu TEK Tab durağı olur,
//      sonraki Tab doğrudan panelin içeriğine geçer (modal-odak.js'in tabbablesIn'i tabindex < 0 olanları
//      zaten saymıyor, yani modalın ilk/son durağı hesabı da doğru kalıyor). tabindex'i aria-selected'la
//      AYNI yerde yazmak app.js'in işi (switchJuzTab/switchEzberTab): seçimi orası değiştiriyor, iki
//      özniteliğin ayrışması mümkün olmasın. index.html'deki başlangıç değerleri de aynı kurala uyuyor.
//   2. setupTablist(): Sağ/Sol komşu sekmeye (uçlarda başa/sona sararak), Home/End ilk/son sekmeye
//      geçirir ve geçilen sekmeyi seçtirir (onSelect). Panellerin hepsi sayfa açılışında DOM'a konuyor,
//      yani seçim anında gerçekleşir; ayrıca Enter/Space ile onaylamak gerekmez (APG'nin otomatik
//      etkinleştirme önerisi, panel yüklemesi gecikmiyorsa).
//
// Yön: sekme çubuğu yatay ve soldan sağa (arayüz Türkçe). Mushaftaki sayfa çevirme düzeni (Sol ok =
// SONRAKİ sayfa) burada geçerli değil: Sol ok önceki, Sağ ok sonraki sekmeye gider. Modal açıkken sayfa
// çevirme zaten kapalı (app.js onPageTurnKeydown), yani iki düzen birbirine karışmıyor.
//
// Değiştiricili tuşlar (Alt+Sol = tarayıcıda geri, Ctrl+Home, Shift+ok...) ve başka bir işleyicinin
// tükettiği olaylar yok sayılır. Yalnızca gerçekten işlenen tuşun varsayılanı engellenir (Home/End
// modalın listesini kaydırmasın); Yukarı/Aşağı/Tab/Enter/Space'e dokunulmaz. Tuş basılı tutulunca
// (e.repeat) gezinti sürer: sayfa çevirme ve ayet gezgininde de tekrar bilerek engellenmiyor.
//
// DOM'a bağlı tek yer setupTablist(); saf yardımcı targetTabIndex() de dışa aktarılıyor ki jsdom'da
// sınanabilsin (bkz. test/sekme_gezintisi_test.mjs).

const TAB = '[role="tab"]';

// Odak `index`'teki sekmedeyken `key` basılınca odaklanacak sekmenin sırası; bu sekme listesinde
// işlenmeyen bir tuş ya da geçersiz girdi için -1. Saf işlev (DOM'a dokunmaz).
export function targetTabIndex(key, index, count) {
  if (!Number.isInteger(index) || !Number.isInteger(count) || index < 0 || index >= count) return -1;
  if (key === "ArrowRight") return (index + 1) % count;
  if (key === "ArrowLeft") return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return -1;
}

// tablist içindeki sekmelere klavye gezintisini bağlar. onSelect(sekmeEl): hedef sekme henüz seçili
// DEĞİLSE çağrılır (seçili sekmeye Home/End ile "gitmek" listeyi yeniden kaydırmasın); seçimi (aria-selected,
// tabindex, panel) değiştirmek çağıranın işi. Dönüş değeri dinleyiciyi kaldırır.
export function setupTablist(tablist, onSelect) {
  const onKeydown = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const tabs = [...tablist.querySelectorAll(TAB)];
    // Olay bir sekmeden gelmiyorsa (sekme listesinin kendisi, dışındaki bir atanın sekme rolü) indexOf -1 verir,
    // targetTabIndex de -1 döndürür: ayrıca bir "sekmeden mi geldi" denetimi gerekmiyor.
    const to = targetTabIndex(e.key, tabs.indexOf(e.target.closest(TAB)), tabs.length);
    if (to < 0) return;
    e.preventDefault();
    const tab = tabs[to];
    if (tab.getAttribute("aria-selected") !== "true") onSelect(tab);
    tab.focus();
  };
  tablist.addEventListener("keydown", onKeydown);
  return () => tablist.removeEventListener("keydown", onKeydown);
}
