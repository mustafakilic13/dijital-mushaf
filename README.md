# Mushaf — Dijital Kur'an-ı Kerim (Digital Khatt V2)

QUL (Quranic Universal Library) verileriyle, `digitalkhatt.org/digitalmushaf`
ile aynı teknikle birebir sayfa görünümlü bir mushaf okuyucu. Derleme adımı
yok — düz HTML/CSS/JS, GitHub Pages'te doğrudan çalışır.

Canlı: https://mustafakilic13.github.io/dijital-mushaf/

**Özellikler.** 604 sayfalık matbu mushaf görünümü (metin seçilip
kopyalanabiliyor); Cüz / Hizb / Rub / Menzil / Sure / Sayfa gezinmesi ve ayet
seçimi ("Gezinme"); ayet panelinde kelime meali, meal ve Sa'dî tefsiri
("Ayet detay paneli"); Konu Fihristi; Sure Bilgisi; arama ("Arama"); kelime
vurgulu sesli okuma ("Sesli okuma"); ezber -- dinle / oku / yaz ("Ezber");
klavye ve ekran okuyucu erişimi ("Erişilebilirlik"); kurulabilir, çevrimdışı
çalışan bir PWA ("PWA ve çevrimdışı önbellekleme").

## Nasıl çalışır (mimari)

Bu iş göründüğünden çok daha karmaşık, çünkü **tarayıcının normal metin
dizgisi kullanılmıyor.** Sebep: Uthmani mushaf satırları, harflerin arasına
"kaşide" (kalligrafik uzatma) eklenerek tam olarak sütun genişliğine
oturtuluyor — CSS'in `text-align: justify`'ı bunu yapamaz, çünkü hangi harf
çiftinin uzayabileceği Arapça hüsn-i hat kurallarına bağlı.

Bunun yerine, `digitalkhatt-js` (MIT lisanslı, `digitalkhatt.org`'un kendi
kaynak kodu) referans alınarak şu boru hattı kuruldu:

1. **HarfBuzz → WebAssembly** (`vendor/hb.wasm` + `hbjs.js`, resmi
   `harfbuzzjs` paketinden, değiştirilmeden) tarayıcıda satırı diziyor.
2. **`js/justify.js`** — hangi harflerin kaşide alabileceğini bulan,
   DigitalKhattV2 fontunun özel OpenType feature'larını (`cv01`–`cv18`,
   `shr1`, `shr2`…) karakter bazında açıp kapatarak satırı deneme-yanılmayla
   tam genişliğe oturtan algoritma. `digitalkhatt-js`'nin
   `just.service.ts` dosyasından (1100+ satır, MIT) sadakatle uyarlandı.
3. **`js/render.js`** — HarfBuzz'tan her glyph'in outline'ını SVG path
   olarak çekip elle konumlandırıyor (`page_view.ts`'den uyarlandı).
   Tarayıcının kendi font dizgisi hiç devreye girmiyor; bu yüzden özel
   feature'lar (kaşideler) güvenilir şekilde uygulanabiliyor.
4. Görünmez, gerçek bir metin katmanı her satırın üzerine tam oturacak
   şekilde ekleniyor (PDF.js'nin metin katmanıyla aynı fikir) — böylece
   görünen harfler SVG path olmasına rağmen parmakla basılı tutup seçme/
   kopyalama normal metin gibi çalışıyor.
5. Sure başlığı kutuları (`QCF_SurahHeader_COLOR.woff2`, renkli bir COLR
   fontu) tarayıcıda font olarak yüklenmiyor — derleme sırasında
   (`tools/build_data.py`) katmanları SVG path + renge çevrilip
   `data/surah-headers/*.json`'a gömülüyor, uygulama bunları ana metinle
   birebir aynı teknikle çiziyor. Bu sayede CSS/font boyutlandırma
   belirsizliği tamamen ortadan kalkıyor.

Ayet sonu işaretlerinin içindeki numaralar rükûya göre dönüşümlü renkleniyor:
bir surenin 1., 3., 5. rükûsu normal mürekkeple, 2., 4., 6. rükûsu ikinci
renkle (`--gold-deep`) çiziliyor. Hangi ayetin hangi rükûda olduğu
`data/ruku.json`'dan geliyor (114 sure, toplam 558 rükû; her sure için
`[başlangıç ayeti, surenin kaçıncı rükûsu]` çiftleri); karar `js/app.js`
`isAltRuku`'da, boyama `js/render.js`'te yalnızca ayetin son kelimesinin
sonundaki işaret ve numara glyph'leri üzerinde yapılıyor.

Bkz. `THIRD_PARTY_NOTICES.md` — atıf ve MIT lisans metni.

Sonuç: 604 sayfanın tamamı Node.js üzerinden render edilip ölçülüyor (bkz.
`test/full_corpus_test.mjs` ve "Testler ve CI"): hiçbir sayfa hata vermiyor;
hizalanan 8.790 satırın yalnızca 5'i sütun genişliğinden (16.200 birim) 150
birimden (≈ %1) fazla sapıyor -- 4'ü kısa, 1'i uzun kalıyor ve testte tek tek,
bilinen istisna olarak listeli.

## Gezinme

Üst çubukta üç buton var: **Cüz** (sol) — **Sayfa** (orta) — **Sure** (sağ),
her biri o an neredeysen onu gösteriyor ve dokununca ilgili listeyi/sayfa
girişini açıyor (Sure/Cüz listeleri açılınca mevcut konumu otomatik
ortalıyor). Sure modalında bir sureye/ayete dokunmak açık olan tüm ayet
akordeonlarını da kapatır.

**Cüz düğmesi dört birimi birden gösteriyor:** cüz numarasının yanında o anki
**hizb**, **rub'** (hizbin dörtte biri) ve **menzil** numarası da küçük
göstergeler olarak duruyor (`#hizb-btn-value`, `#rub-btn-value`,
`#manzil-btn-value`; 360 px'ten dar ekranlarda üç temel düğme rahat sığsın
diye gizleniyor). Düğmeye dokununca
açılan modalde dört sekme var -- Cüz (30), Hizb (60), Rub (240), Menzil (7);
her satır numarayı, birimin başladığı sureyi ve "S:A'den başlar · sayfa N"
bilgisini gösteriyor, dokununca o birimin ilk ayeti seçilip sayfasına gidiliyor
(`goToJuzNum` / `goToHizbNum` / `goToRubNum` / `goToManzilNum`, hepsi ortak
`goToUnitNum`'a çıkıyor). Göstergeler seçili ayetin birimini izliyor (henüz
ayet seçilmemişse sayfanın birimini); modal açılınca geçerli birim her sekmede
listenin ortasına kaydırılıyor, kapanınca modal Cüz sekmesine dönüyor. Dört
veri dosyası (`data/juz.json`, `hizb.json`, `rub.json`, `manzil.json`) aynı
şekle sahip -- `{ "n": { "firstVerseKey": "S:A", "page": N } }` -- bu yüzden
tek bir kod yolu hepsine yetiyor (`unitForAyah`, `populateUnitList`).
**Sayfa** düğmesi ise bir sayfa numarası alanı, − / + düğmeleri ve bir sayfa
kaydırıcısı olan modal açıyor. `test/juz_subdivisions_test.mjs` bu verinin
tutarlılığını ve gezinme mantığını doğruluyor.

**Sayfa çevirme yönü** iki farklı girdi için kasıtlı olarak farklı: parmakla
**kaydırma** gerçek bir mushaf sayfasını çevirme hareketini taklit ediyor
(parmak sağa = ileri/sayfa numarası artar, sola = geri) — 604'te ileri
gidince 1'e, 1'de geri gidince 604'e sarar. Ekranın **kenarındaki ok
butonları** ile klavye okları ise nereye gideceğini gösteriyor: soldaki
(sol yönlü) ok ileri, sağdaki (sağ yönlü) ok geri götürür — sonraki sayfa
mushafta kavramsal olarak sola doğru olduğu için. `js/app.js`'te
`goToNextPage`/`goToPrevPage` ortak, sadece hangi girdinin hangisini
tetiklediği farklı.

**Ayet seçimi:** Ekrandaki sayfada her zaman bir ayet "seçili" (altın renkte
vurgulu) durur — varsayılan olarak o sayfadaki ilk ayet. Sure modalında her
sure satırının yanındaki ok ikonuna dokunmak o surenin tüm ayet numaralarını
listeler (`js/app.js`, `toggleAyahGrid` — ilk açılışta o anda oluşturulur,
114 sure için baştan oluşturulmaz; akordeon mantığıyla çalışır, biri açılınca
açık olan diğeri kapanır); bir ayete dokunmak o ayetin bulunduğu sayfaya
gidip onu vurgular. Sure satırının kendisine (ok değil) dokunmak o surenin
1. ayetini, Cüz/Sayfa modallarında bir öğeye dokunmak da ilgili cüzün/
sayfanın ilk ayetini seçer. **Sayfadaki bir ayetin metnine doğrudan
dokunmak** da onu seçer — tıklama noktası SVG koordinatına çevrilip
(`getScreenCTM`), o sayfa render edilirken çıkarılan ayet segmentleriyle
(`{surah,ayah,baselineY,xMin,xMax}`) eşleştiriliyor (`js/app.js`,
`pointToAyah`); iki satırın sınırındaki belirsiz noktalarda en yakın
satırın baseline'ı tercih ediliyor. Seçim nereden yapılırsa yapılsın (sayfa
üzerinden, herhangi bir modalden), Sure modalindeki ilgili ayet ızgarası —
o an açık olmasa bile, daha önce bir kez açılıp oluşturulmuşsa — anında
güncellenir (`syncAyahGridHighlight`).

Vurgu, `js/render.js`'te satırın hangi kelimelerinin (`data/ayahs.json`'daki
`[sayfa, ilkKelimeId, sonKelimeId]` aralığına göre) seçili ayete ait olduğu
hesaplanıp o kelimelerin gerçek glyph pozisyonlarının arkasına bir dikdörtgen
çizilerek yapılıyor — bir ayet birden fazla satıra yayılıyorsa (uzun
ayetlerde normal) her satırda ayrı vurgu çiziliyor. Aynı segment hesabı hem
vurguyu hem de sayfa üzerindeki tıklanabilir alanları besliyor.

**Sure Bilgisi:** Sayfadaki sure başlığı kutusuna dokununca (`js/render.js`
`drawSurahHeader`'ın çizdiği görünmez tam-kutu `.surah-header-hit` hedefi;
kutu görsel olarak süslemeli bir COLR glifi olduğu ve çoğu zaman boşluktan
ibaret olduğu için hit-test'i tek başına çizilen path'lere değil, glifin
tüm bbox'unu kaplayan görünmez bir `<rect>`'e yaptırıyoruz) bir modal açılır
(`js/app.js` `openSurahInfo`/`setupSurahInfoModal`): üstte ayet sayısı/nüzul
yeri/cüz bilgisini gösteren küçük bir istatistik şeridi (zaten yüklü olan
`data/surahs.json` + `data/surah-pages.json`/cüz eşlemesinden), altında
sure hakkında bir akordeon. Akordeonun bölüm sayısı ve başlıkları sureden
sureye değişiyor (İsim ve İniş Dönemi hep var, ama Tarihî Arka Plan, adlı
yan sorular vb. bazı surelerde de geliyor — en fazla 11 bölümlü sureler
var); bu yüzden sabit bir şemaya göre değil, `js/surahinfo.js`
`splitInfoSections`'ın kaynağın kendi `<h2>` sınırlarından çıkardığı
listeye göre kuruluyor.

İçerik `data/surah-info-tr.json`'dan geliyor — QUL'un (qul.tarteel.ai)
surah-info exportunun İslami terimlere uygun şekilde Türkçeye çevirisi, bu
projede hazırlandı. Bu, özelliğin İKİNCİ veri kaynağı: ilki Diyanet Kur'an
Yolu tefsiriydi (`data/sura-info.json`, farklı bir şema: toplam ayet/mushaf
sırası/nüzul sırası/cüz kartları + Hakkında/Nüzul/Konusu/Fazileti
akordeonları), Diyanet'e üçüncü parti bir uygulamada kullanım izni
sorulduğunda kaynak dosyaların paylaşılamayacağı yanıtı geldiği için
verisiyle birlikte kaldırılmıştı (bkz. hemen altındaki Tefsir bölümü — aynı
gerekçe). `sources`'ın (tıpkı tefsirdeki gibi) ileride başka bir kaynak
eklenmesine açık bir sözlük olması burada da mümkündü, ama şimdilik tek
kaynak olduğu için `getSurahInfoEntry`'nin doğrudan sure numarasıyla arama
yapması yeterli.

Metnin içindeki `<a href="...">` linkleri QUL'un kendi site-içi path'leri
(`/{sure}`, `/{sure}/{ayet}[-{ayet}]`, dipnotlarda `/{sure}:{ayet}[-{ayet}]
?font=...&translations=...`) — çeviri onları olduğu gibi korudu, ama bu
uygulamada karşılıkları yok. `js/app.js`'teki `setupSurahInfoModal` bu
yüzden info body'deki her tıklamayı yakalayıp (`e.preventDefault()`)
`js/surahinfo.js` `parseInfoLink`'e yönlendiriyor: salt sure linki bir
"Mushaf'a Sureye Git" teklifine (`goToSurah`), ayet/aralık/dipnot linkleri
(dipnotun kendi numarası karşılıksız olduğu için bağlı olduğu ayete
indirgenir) aralıktaki her ayetin kendi Arapça metni (`ayahArabicText`,
Konu Fihristi'nin ayet listesiyle aynı, bkz. aşağısı) + Elmalılı meali +
kendi "Mushaf'ta Ayete Git" butonuna (`goToAyah`) dönüşür — ikisi de
`#surah-info-detail` alt-panelinde, `.ezber-surah-picker`'la aynı
geri-gidilebilir düzende (bkz. `js/app.js`'teki
`openSurahInfoLink`/`closeSurahInfoDetail`; odak yönetimi için bkz. "Erişilebilirlik").
`test/surah_info_links_test.mjs`,
`parseInfoLink`'i güncel `surah-info-tr.json`'daki linklerin tamamına
karşı doğruluyor; ayrıca `splitInfoSections`'ın `<h2>` başlığı metnini
(akordeon sekmelerinin etiketi) olası gömülü etiketlerden ve görünmez
Unicode karakterlerinden ayıklayan `cleanTitle` adımını da (2512 kayıttan
2'sinde -- 22. ve 101. sure -- gerçekten karşılaşılmış, kaynağında da
düzeltilmiş bir yapışma kalıntısı) hem birim testleriyle hem de güncel
verideki 396 başlığın tamamına karşı bir taramayla doğruluyor.

## Ayet detay paneli (kelime meali, meal, tefsir)

Sayfadaki bir ayetin metnine dokunmak, o ayetin **son satırından hemen
sonra** bir panel açar; aynı ayete (veya başka bir ayete) tekrar dokunmak
kapatır. Panelde sırayla kelime meali, meal ve tefsir var (bkz. `js/app.js`,
"Ayet detay paneli (kelime meali, meal, ...)" başlıklı yorum bloğu ve
`ayahPanelBodyHTML`). Klavyeyle ve ekran okuyucuyla aynı panel ayet
gezgininden (Enter/Space) açılıyor, bkz. "Erişilebilirlik".

**Neden bu kadar dolambaçlı:** Sayfa tek parça bir SVG olduğu için ("Nasıl
çalışır" bölümüne bakın), paneli normal bir HTML akışının arasına sokmak
mümkün değil. Bunun yerine sayfa görsel olarak ikiye "dilimleniyor":

- **üst dilim** — sayfanın gerçek, önbellekteki SVG'si, `overflow:hidden`
  bir kutu içinde, sadece dokunulan ayetin son satırına kadar görünecek
  yükseklikte,
- panel,
- **alt dilim** — aynı SVG'nin bir *klonu*, yukarı kaydırılmış, sadece
  kesim noktasından sonrası görünecek şekilde. Sayfa metni ekran okuyucuya
  iki kez gitmesin diye erişilebilirlik ağacından saklı (`aria-hidden`;
  `inert` değil, tıklanabilir kalıyor), bkz. "Erişilebilirlik".

İki dilim de tek parça sayfanın birebir aynı piksellerini gösteriyor —
kesim, panel araya girmeden önce görünmüyor. Kesim noktası (`cutY`), iki
komşu satırın harekelerine (üstteki satırın vurgu/hareke alt sınırı ile
alttaki satırın vurgu/hareke üst sınırı) göre hesaplanıyor. Bu iki sınır
normal satır aralığında birbirine hafifçe giriyor (harekelerin ihtiyaç
duyduğu boşluk, satırlar arası mesafeden biraz daha geniş tasarlanmış),
bu yüzden `cutY` her iki tarafa da tam bitişik olamıyor; ortalarını alarak
her iki komşu satırın da harekelerinin panelin arkasında kalma riskini
en aza indiriyor (`js/app.js`, `openWordMeal`).

Dokunulan ayet bir surenin sayfadaki son ayetiyse, "alttaki satır" aslında
bir sonraki surenin başlık afişi olabilir — düz bir metin satırı değil,
kendi payına düşen boşluğu (`GAP_BEFORE_HEADER`/`GAP_AFTER_HEADER`, bkz.
`js/render.js`) olan, genelde bir satırdan belirgin biçimde daha uzun bir
öge. `nextSeg` (bir sonraki gerçek metin satırı) o zaman görünüşte
olduğundan çok daha aşağıda kalabiliyor, ikisi arasına ortalama alan eski
formül de kesimi afişin ortasına ya da tamamen ötesine düşürüp *bir
sonraki* surenin başlığını panelin üstünde bırakabiliyordu. `computeLayout`
artık sayfadaki her başlığın üst kenarını da (`surahHeaderTopYs`) döndürüyor;
`lastSeg` ile `nextSeg` arasında böyle bir başlık varsa `openWordMeal`
`nextSeg`'i tamamen görmezden gelip sayfanın son ayeti durumundaymış gibi
davranıyor — kesim sadece dokunulan satırın kendisini temizliyor, başlık
(ve ondan sonraki her şey) bütünüyle alt dilimde kalıyor.

Açılma/kapanma animasyonu CSS Grid'in `grid-template-rows: 0fr` → `1fr`
tekniğiyle yapılıyor (`css/style.css`, `.word-meal-panel`) — JS ile
yükseklik ölçmeye gerek kalmadan, içerik ister kısa bir ayet ister 2:282
gibi 100'den fazla kelimelik bir ayet olsun orantılı, akıcı bir açılma
sağlıyor. Alt dilim ayrıca animasyonlanmıyor: panel büyüdükçe normal DOM
akışıyla kendiliğinden aşağı itiliyor — "sayfanın geri kalanının itilmesi"
hissini tamamen CSS veriyor, JS sadece kesim noktasını hesaplayıp dilimleri
bir kere kuruyor.

Panelin içeriği, her çeviri türü için ayrı, etiketli bir `.wm-section`
olacak şekilde kuruluyor (`js/app.js`, `ayahPanelBodyHTML`) — yeni bir
bölüm eklemek (tefsir gibi) bu fonksiyona bir `.wm-section` daha eklemek
kadar basit.

**Kelime meali verisi** (`data/word-meal.json`, QUL'un "word by word
translation" exportu) `"sure:ayet:pozisyon" → "Türkçe metin"` şeklinde düz
bir sözlük; sadece ilk kullanımda çekiliyor (~1.6MB, `js/wordmeal.js`,
`loadWordMealData`). Her Arapça kelimenin ayrı bir girişi olmayabilir: bir
pozisyon eksikse, o kelimenin metni bir önceki (var olan) pozisyonun
kartına eklenir — Türkçe'de çoğu zaman yalın bir edatın ayrı bir karşılığı
olmadığından, anlamı sonraki kelimenin çevirisine karışıyor (örn.
`10:2:6` → "bir adama", hem *"إِلَىٰ"* (-e) hem *"رَجُلٍ"* (bir adam)
kelimelerini birlikte karşılıyor; `10:2:7`'nin kendi girişi yok). Bu
gruplama mantığı (`js/wordmeal.js`, `buildWordMealCards`) 6236 ayetin
tamamına (77.432 kelime) karşı test edildi.

QUL'un kendi exportunda en az bir bilinen hata var: **2:267**'de
`"مِنْهُ تُنفِقُونَ"` (pozisyon 17-18) sonrasındaki her Türkçe karşılık bir
pozisyon erken kaymış -- ayetin son kelimesi (`حَمِيدٌ`) bu yüzden hiç
karşılıksız kalıyordu (kullanıcı tarafından fark edilip QUL'daki doğru
hizalamayla bildirildi). `tools/patch_word_meal.py` bunu düzeltiyor --
güvenli, tek kurallı bir mantıkla: yalnızca dosyada hâlâ hatalı
(bulunduğu haliyle) değer varsa uygular, hedef zaten doğruysa dokunmaz,
ne biri ne öbürüyse uyarıp durur. Bu sınıf bir hatayı (birkaç ardışık
kelimenin kayması) veri setinin tamamında yapısal olarak (pozisyon/boşluk
desenine bakarak) güvenilir şekilde taramanın bir yolunu bulamadım --
denedim, ama "son kelimenin ayrı karşılığı yok" deseni edat+fiil
birleşmesi gibi tamamen normal durumlarda da sürekli çıkıyor, yanlış
pozitif oranı çok yüksek. Başka bir yerde benzer bir kayma fark edilirse,
aynı şekilde (kaynağı doğrulayıp bu script'e ekleyerek) düzeltilebilir.

**Meal verisi** (`data/meal.json`, Elmalılı Muhammed Hamdi Yazır'ın
sadeleştirilmiş mealinin QUL exportu) `"sure:ayet" → {"t": "..."}`
şeklinde, ayet başına tek girişli düz bir sözlük; kelime meali gibi sadece
ilk kullanımda çekiliyor (~1MB, `js/meal.js`, `loadMealData`) ve panel
ilk açıldığında ikisi paralel yükleniyor (`js/app.js`, `openWordMeal`) --
biri başarısız olursa diğerinin görünümünü etkilemiyor. Meal metninin
sağ altında kaynak olarak "Elmalılı Muhammed Hamdi Yazır" gösteriliyor
(`js/meal.js`, `renderMealHTML`).

**Tefsir** tek bir kaynak butonu olarak gösteriliyor ("Tefsîr-i Sa'dî"):
butona basmak ortak alanı açar; tekrar basmak kapatır (bkz. `js/app.js`,
`onTafsirTabClick` ve `animateTafsirClosed`); düğmenin durumu `aria-expanded`
ile bildiriliyor ve kapanış bitince metin DOM'dan kaldırılıyor (bkz.
"Erişilebilirlik", "Tefsir sekme düğmesi"). `sources` (`js/tafsir.js`)
bir sözlük olarak tasarlandı ki yeni bir kaynak eklenmek istenirse tek
yapılacak şey oraya bir `file` yolu eklemek olsun --
`isTafsirSourceAvailable` sayesinde, veri dosyası henüz hazır olmayan bir
kaynak, buton listede dursa bile tıklanınca "yakında eklenecek" gösterir,
hata vermez. (İkinci bir kaynak -- Diyanet Kur'an Yolu Tefsiri -- burada
kısa süre vardı; Diyanet'e üçüncü parti kullanım izni sorulduğunda kaynak
dosyaların paylaşılamayacağı yanıtı geldiği için verisiyle birlikte
kaldırıldı, bkz. yukarıdaki "Sure Bilgisi" notu. `sources`'ın sözlük
olarak kalması tam da böyle bir kaynağın kaybolmasının -- ya da telif
sorunu olmayan bir tanesinin yeniden eklenmesinin -- tek satırlık bir
değişiklik olması için.)

Tefsir verisi şu normalize edilmiş şekilde saklanıyor: `"sure:ayet" →
{"text": "<html>..."}`, ama **ortak tefsiri olan ayet grupları** için
farklı -- grubun asıl yorumu tek bir "çapa" ayette duruyor, gruptaki diğer
her ayet ise değeri o çapa ayetin anahtarı olan düz bir metin (ör.
`"1:2": "1:1"` -- Fâtiha'nın 1-7. ayetleri tek bir tefsirde birleşiyor).
`resolveTafsirText` (`js/tafsir.js`) bu tek adımlık yönlendirmeyi takip
ediyor; 6236 ayetlik tam korpusa karşı test edildi, kırık referans veya
zincirleme yönlendirme yok.

**Tefsîr-i Sa'dî** (`data/tafsir-saadi.json`, QUL exportu, ~8.7MB) zaten
bu şekilde geliyor. `.text` içindeki `<span class="green/brown/blue">`
gibi biçimlendirme etiketleri **kaçışsız (escape edilmeden)** DOM'a
yazılıyor -- veri önceden HTML enjeksiyonuna karşı tarandı (yalnızca
`p`/`div`/`span`, yalnızca `class`/`lang` öznitelikleri; `<script>`,
olay-işleyici özniteliği (`onclick` vb.) yok) ve kullanıcı girdisi
içermiyor. Çizim anında yalnızca dil işaretleri düzeltiliyor
(`markTafsirLanguages`, `js/tafsir.js`; bkz. "Sa'dî tefsirinin dil
işaretleri"): metin ve diğer etiketler olduğu gibi geçiyor.

## Konu Fihristi

Ayet detay panelinin en üstünde (bkz. yukarısı), ayetin ait olduğu
konular -- varsa -- küçük etiketler halinde listeleniyor (`js/app.js`,
`ayahTopicsRowHTML`); birine dokunmak bir modal açıyor
(`openTopicsModal`) -- konunun Arapça adı, Ontoloji/Tematik/Genel
rozetleri, açıklaması, Ana Konu(ları), İlişkili Konular ve Alt Konular
çipleri, en altta da o konuya bağlı ayetlerin tamamı (kendi Arapça metni
+ meali + "Mushaf'ta Ayete Git" butonuyla). Bir çipe (ya da açıklama
metni içindeki bir iç bağlantıya) dokunmak modalı AYNI modal içinde
başka bir konuya götürüyor -- Sure Bilgisi'nin
`#surah-info-body`/`#surah-info-detail`'i gibi iki FARKLI türde kardeş
paneli yok, çünkü her adım hep AYNI türde bir hedefe (bir konunun
ayrıntısı) gidiyor. Bunun yerine `state.topicsModal.stack` bir
`topic_id` yığını tutuyor: her tıklama bir id daha PUSH ediyor, geri
butonu POP ediyor, `renderTopicsModalView` de her seferinde yığının
tepesindeki konuyu baştan basıyor -- kaç adım gidilirse gidilsin geri her
zaman tam bir adım geri götürüyor.

İçerik `data/topics-tr.json`'dan geliyor -- QUL'un
(qul.tarteel.ai/resources/ayah-topics) 2512 konuluk, ayet ayet
eşleştirilmiş "Topics and Concepts" exportunun İslami terimlere uygun
(terim sıklığı Saadi tefsiriyle karşılaştırılarak) Türkçe çevirisi, bu
projede hazırlandı; ayet-konu eşlemesinin kendisi ve her sayısal/ilişkisel
alan (`parent_id`, `thematic_parent_id`, `ontology_parent_id`,
`related_topics`, `thematic`, `ontology`) QUL'un kendi exportundan
değiştirilmeden geldi, yalnızca görünen metin (`name`, `arabic_name`,
`description`) çevrildi. Kelime meali/meal gibi, ayet paneli ilk
açıldığında bir kez çekilip önbelleğe alınıyor (~950KB, `js/topics.js`,
`loadTopicsData`).

Her konu üç ayrı ana-konu alanı birden taşıyabiliyor
(`parent_id`/`thematic_parent_id`/`ontology_parent_id` -- 16 kayıtta
`thematic_parent_id` VE `ontology_parent_id` birlikte dolu, 10 kayıtta
`parent_id` bunlardan biriyle birlikte dolu), o yüzden modal ikisinden
birini seçmek yerine dolu olanların HEPSİNİ "Ana Konu" olarak gösteriyor.
"Alt Konular" (QUL'un kendi arayüzündeki "Child Topics") kaynak veride
ayrı bir alan değil -- diğer kayıtların KENDİ ana-konu alanlarının
tersinden çıkarılıyor (`js/topics.js`, `buildTopicsIndex`'in
`childrenOf` indeksi). "İlişkili Konular" (`related_topics`) ayrı ve
nadir (2512 konudan yalnızca 17'sinde dolu); açıklama metni içine gömülü
`<topic data-id="X">...</topic>` iç bağlantıları (461 adet) da aynı
gezinmeden geçiyor -- ayrı bir tıklama yolu değil,
`setupTopicsModal`'daki tek bir genel `[data-id]` yakalayıcısı üçünü de
(Ana Konu/İlişkili Konu/Alt Konu çipleri VE açıklama içi bağlantılar)
kapsıyor. Açıklama içi bağlantılar klavyeyle de açılıyor: çizim anında
`role="link" tabindex="0"` alıyorlar (`js/topics.js`, `markTopicLinks`) ve
Enter tıklamaya çevriliyor; her gezinme adımından sonra odak modalın
kapsayıcısına alınıyor (bkz. "Erişilebilirlik", "Konu açıklamalarındaki
bağlantılar").

Aynı ayete aynı isimde birden fazla konu bağlı olabiliyor -- QUL'un
taksonomisinde, mesela "Abdest" hem Genel hem Tematik ayrı birer kayıt,
ikisi de 5:6'ya bağlı (etiketli ayetlerin yaklaşık dörtte birinde
görülüyor); ayet panelindeki etiket satırı bunları isme göre
tekilleştirip en düşük `topic_id`'yi gösteriyor -- kaybolan diğer kayıt
yine de kendi ana/ilişkili/alt konu bağlantılarından bir tık ötede.

Ayetlerin Arapça metni `data/mushaf.json`'un kendi (zaten düz Unicode --
glif/şekillendirme katmanı DEĞİL, bkz. `js/wordmeal.js`'in header notu)
kelime metninden, sayfa-bağımsız bir okumayla kuruluyor (`js/app.js`,
`ayahArabicText`) -- ayetin KENDİ sayfasını `ayahBounds` ile bulup oradan
okuyor, `ayahRawWords`'ün aksine yalnızca o anda açık sayfaya bağlı değil
(zaten `state.mushaf` başlangıçta bütünüyle yükleniyor, bkz. yukarısı);
uygulamanın başka hiçbir yerinde ayet metni düz HTML olarak değil, mushaf
sayfasının kendi SVG glifleri olarak çiziliyor.

`test/topics_test.mjs`, `js/topics.js`'in ayrıştırma/indeksleme
fonksiyonlarını gerçek `data/topics-tr.json`'a karşı doğruluyor: her
`parent_id`/`thematic_parent_id`/`ontology_parent_id`/`related_topics`
referansı ve açıklama içindeki her `<topic data-id>` gerçek bir
`topic_id`'ye çözülüyor, hiçbir kayıt kendi ana konusu değil, her
`ayahs` girdisi geçerli bir sure:ayet çifti -- artı ayet panelindeki
isme-göre-tekilleştirme mantığının (`ayahTopicsRowHTML`) aynalanmış bir
kopyası, tüm etiketli ayetlere karşı doğrulanıyor. Aynı dosya
`markTopicLinks`'i de sınıyor (verideki her `<topic>` etiketinin iki bilinen
biçimden biri olması dahil); klavye davranışı `test/topic_links_test.mjs`'te.

(Eski not, hâlâ açık: kuranmeali.com'dan izin gelirse, onların -- Süleyman
Ateş Meali tabanlı -- fihristini QUL'unkine ek/ayrı bir seçenek olarak
değerlendirmek; şimdilik tek kaynak QUL olduğu için `js/topics.js`
tefsir/Sure Bilgisi'ndeki gibi bir `sources` sözlüğü değil, doğrudan
`data/topics-tr.json`'a bakıyor.)

## Arama

Alt çubuktaki **Arama** düğmesi bir bottom-sheet açar (bütün modaller gibi
`.modal-sheet`, yalnızca daha uzun; ekran klavyesi açılınca sheet klavyenin
üstüne oturur -- `visualViewport`, bkz. `syncViewport`). Kutu boşken **ilk
ekran**: son aramalar (`localStorage`, `quran-reader-arama-recent-v1`, en
fazla 10, yalnız bir sonuca tıklanınca ya da Enter'a basılınca yazılır) +
popüler konu çipleri + ipucu. Yazdıkça (120 ms debounce) sonuçlar bölümlere
ayrılır:

- **Git** -- sorgu bir hedefe dönüşüyorsa: `2:255`, `2/255`, `2 255`,
  `Bakara 255`, `bakara suresi 255. ayet`, `yasin suresi`, `36. sure`,
  `cüz 30`, `sayfa 50`; yalnız `12` hem 12. sure hem 12. sayfa olarak
  sunulur. Ayet numarası surenin ayet sayısını aşarsa ("2:300") sureye
  gidilir ve "Bakara suresi 286 ayettir" denir. **Enter** ilk hedefe gider.
- **Sureler** -- Türkçe / İngilizce transliterasyon / Arapça ad
  eşleşmesi ("ihlas", "Ihlas", "İhlâs", "imran", "al baqarah" hepsi bulunur).
- **Konular** -- Konu Fihristi'nde konu **adına** (ya da Arapça adına)
  göre; açıklama metni aranmaz (gürültü). Aynı ad birden çok kayda aitse
  en çok ayeti olan kayıt gösterilir (ayet panelindeki etiketler en küçük
  id'yi seçiyor; aramada kullanıcı en kapsamlı kaydı bekler: "Tevbe" 5
  değil 74 ayet). Satıra tıklayınca konu modalı açılır.
- **Ayetler** -- meal (Elmalılı) içinde tam metin. Tüm terimler (VE);
  hiçbir ayette hepsi yoksa en az birini içerenler ve bir not gösterilir.
  Eşleşen kısım `<mark>` ile vurgulanır, uzun metin eşleşme çevresinden
  kırpılır.
- **Kelime meali** -- kelime kartlarında (`data/word-meal.json`) eşleşen
  Arapça kelime + vurgulu karşılığı (ayet panelindeki `.wbw-*` kartlarıyla
  aynı görünüm). Terimlerin **tamamı tek bir kelime karşılığında**
  geçmeli ("sabır namaz" burada sonuç vermez -- o Ayetler'in işi); tam
  kelime karşılıklar önce gelir.
- **Arapça metin** -- sorguda Arap harfi varsa (ör. `الله`, harekesiz de
  yazılsa) ayetin Arapça metninde; bu durumda Türkçe kaynaklar (meal,
  kelime meali, tefsir) hiç aranmaz/yüklenmez. Sonuç satırı sağdan sola
  (RTL) ve Arapça fontla gösterilir.
- **Tefsir (Sa'dî)** -- Sa'dî tefsirinin düz metninde (HTML etiketleri
  temizlenmiş) tam metin arama. Kaynak ~8 MB olduğu için varsayılan
  **kapalı**: sonuçların altında "Sa'dî tefsirinde de ara (≈8 MB
  indirilir)" düğmesi çıkar; tıklanınca indirilip (parça parça, arayüz
  donmadan) dizinlenir ve o oturumda açık kalır -- yeniden aramak için
  düğmeye tekrar basmak gerekmez. Yalnız Latin (Türkçe) terimlerle
  aranır; yüklenemezse hata notu + düğme yeniden görünür, ama bir
  sonraki farklı aramada SESSİZCE yeniden denenmez (yalnızca düğmeye
  tekrar basılınca).

Her bölüm önce kısa bir **önizleme** gösterir (Sureler 3, Konular 3,
Ayetler 5, Kelime meali 3 satır); "Tümünü gör (N)" bölümü yerinde açar
(25'er satır, "Daha fazla göster", "Daralt"). Yalnız tek bölüm varsa
doğrudan açık gelir. Konular sırada Ayetler'den önce: satır sayısı az
ve isabet oranı yüksek ("Sabır" araması için en iyi sonuç 87 ayetlik
"Sabır" konusudur); Ayetler'in uzun listesi altta kalmasın.

Veri yükleme: meal ve konular modal açılırken arka planda yüklenir (ilk
yazışta bekletmesin, konu çipleri de buna bağlı); kelime meali (1,6 MB)
**yalnızca ilk metin aramasında** yüklenir; Arapça metin dizini ağ
kullanmaz (mushaf.json zaten bellekte) ve yalnızca ilk Arapça sorguda
kurulur; tefsir (~8 MB) **yalnızca kullanıcı düğmeye basınca**. Hiçbiri
"2:255" gibi hedef sorgularında indirilmez. Konular/Kelime meali ikincil
kaynak: yüklenemezse o bölüm sessizce atlanır ve modal yeniden açılana
kadar tekrar denenmez (çevrimdışıyken her tuşta boşuna istek atılmasın);
meal (birincil) ve tefsir (kullanıcı istedi) yüklenemezse hata notu
gösterilir -- meal sonraki yazışta otomatik yeniden denenir, tefsir
yalnızca düğmeye tekrar basılınca (sessiz otomatik yeniden deneme yok).
Bir kaynak geç yüklenince ekran, kullanıcının açtığı bölümler kapanmadan
tazelenir. **Popüler konu çipleri** adı tam eşleşen konuyu doğrudan açar
(konu verisi yüklenemezse aynı kelimeyi arama olarak çalıştırır).

Kod iki katman: `js/search.js` **saf mantık** (DOM/fetch yok --
normalleştirme, sorgu ayrıştırma, sure eşleştirme, dizinler [meal/kelime
meali/Arapça metin/tefsir], vurgu, son aramalar), `js/arama.js` **arayüz**
(DOM + olaylar; app.js'e bağımlı değil, gezinme/modal fonksiyonları ve
veri yükleyiciler `setupArama`'ya parametre olarak geliyor).

Normalleştirme (`fold`): Latin'de küçük harf, ı/İ/I hepsi `i`, ç ğ ö ş ü
ve şapkalı â î û düz harfe iner, kesme işaretleri atılır; Arapça'da harekeler,
tatvil, hançer elif ve Kur'an'a özgü işaretler atılır, elif çeşitleri `ا`,
`ى/ئ` `ي`, `ؤ` `و`, `ة` `ه` olur; Arap-Hint/Fars rakamları ASCII'ye iner.
Sorgu da dizindeki metin de aynı fonksiyondan geçtiği için "sukur",
"şükür", "ŞÜKÜR" aynı sonucu verir.

Türkçe ekleşmede kök değişir ("sabır" → "sabrı", "kalp" → "kalbi"); düz
alt-dize araması bunu kaçırırdı ("sabır" 23 ayet, kök varyantlarıyla 90).
`termVariants` iki güvenli kural uygular: (1) sert ünsüz yumuşaması
(kalp→kalb, kitap→kitab, azap→azab; fiil çekimi -dık/-tik hariç), (2) ünlü
düşmesi -- **kelime listesiyle**, genel bir desenle değil (genel desen
ölçüldüğünde ölüm→"olm" = "olmak"ın 449 ayeti gibi 3-4 kat gürültü
çıkardı). Ek biçimler yalnızca bir kelimenin **başında** aranır. Tek başına
bağlaç/edatlar ("ve", "ile", "bir"...) çok terimli sorguda arama koşulu
sayılmaz ("sabır ve namaz" mealdeki "sabırla, namazla"yı da bulur).

Testler (`test/search_test.mjs` -- Node, bağımlılıksız; `test/arama_ui_test.mjs`
-- jsdom, gerçek `index.html` + gerçek veri dosyalarıyla; app.js kablolamasını
kaynak metin üzerinden de denetler):

```bash
cd test && npm ci
node search_test.mjs && node arama_ui_test.mjs
```

Bütün testler tek komutla: `npm test` (bkz. "Testler ve CI").

## Sesli okuma (Oynat)

Alt çubuktaki **Oynat** düğmesi, seçili ayetten (seçili ayet yoksa sayfanın
ilk ayetinden) başlayıp Kur'an'ın sonuna kadar kesintisiz okuyor; çalan kelime
sayfada vurgulanıyor ve sayfa, okuma ilerledikçe kendiliğinden çevriliyor.
Çalarken düğme **Duraklat** oluyor; durdurunca seçili ayet çalınan ayette
kaldığından tekrar basınca oradan devam ediliyor (düğmenin erişilebilir adı
için bkz. "Erişilebilirlik"). Okuma 114:6'da bitiyor, başa sarmıyor.

- **Ses.** Ayet sesleri uzaktan geliyor:
  `https://audio-cdn.tarteel.ai/quran/<okuyucu>/SSSAAA.mp3` (sure ve ayet
  üçer haneli). QUL'un exportunda 6236 ayetin hepsi tam bu kalıpta olduğundan
  adres ayet başına saklanmıyor, `js/app.js` `recitationAudioUrl`'de yeniden
  kuruluyor (`tools/build_recitation.py`, kalıba uymayan tek kayıtta bile
  üretimi durduruyor). Okuyucular `RECITERS`'te: **Husarî (Mücevved)** ve
  **Abdülbâsıt Abdüssamed (Mücevved)**. Ana Oynat düğmesi her zaman Husarî'yi
  çalıyor; ikincisi yalnızca Ezber > Dinle'de seçilebiliyor. Çalınan sesler
  servis worker'ın ses önbelleğine giriyor (bkz. "PWA ve çevrimdışı
  önbellekleme").
- **Kelime vurgusu.** `data/recitation-husary-mujawwad.json` ve
  `data/recitation-abdulsamad-mujawwad.json`, her ayet için `[ayette kelime
  sırası, başlangıç ms, bitiş ms]` üçlülerini taşıyor (QUL'un "Recitations and
  segments" exportundan `tools/build_recitation.py` ile üretildi; ilk
  kullanımda tembel yükleniyor, o sırada düğme "Yükleniyor…" diyor). Çalan
  sesin `currentTime`'ı her animasyon karesinde (`syncHighlightLoop`) bu
  aralıklarla eşleştirilip (`wordIdAtTime`) o kelimenin glyph'lerinin arkasına
  vurgu çiziliyor (`updateWordHighlight`). Eşleştirme sıraya değil ZAMANA
  bakıyor: bazı ayetlerde okuyucu bir kelimeyi ya da öbeği tekrarladığı için
  aynı sıra numarası iki kez geçiyor. Birkaç ayette okunan bölüt sayısı
  mushaftaki kelime sayısından bir fazla; karşılığı olmayan o son bölüt,
  yanlış kelimeyi vurgulamasın diye sessizce yok sayılıyor.
- **İstiâze ve besmele.** Fâtiha'nın 1. ayetinden önce eûzü klibi
  (`audio/euzuhusari.mp3`, `audio/euzuabdulsamad.mp3` -- depoda duran iki
  küçük dosya), Tevbe dışındaki her surenin 1. ayetinden önce de besmele
  çalıyor; besmele ayrı bir klip değil, okuyucunun kendi 1:1 kaydı
  (`introAudioFor`). Bunlar sayfadaki metne ait olmadığından o sırada hiçbir
  kelime vurgulanmıyor.
- **Tek ses motoru.** Oynat, Ezber > Dinle ve Oku/Yaz'ın "ayet tamamlanınca
  oku" adımı aynı `<audio>` öğesini paylaşıyor; biri başlayınca diğeri
  duruyor. `state.playback.requestId` bir "bu oturum hâlâ geçerli mi"
  bekçisi: durdurma ya da yeniden başlatma, uçuştaki eski bir devamın (sayfa
  yüklemesi, ses başlatma) yeni oturuma karışmasını engelliyor.
  `test/recitation_playback_test.mjs` sıradaki ayet mantığını
  (`nextAyahRef`), kelime zamanlamasını ve ses adresi kurmayı doğruluyor.

## Ezber (Dinle / Oku / Yaz)

Alt çubuktaki **Ezber** düğmesi üç sekmeli bir modal açıyor. Üçünde de bir
**sure** (ayrı bir alt panelden seçiliyor; seçince aralık o surenin tamamına
ayarlanıyor) ve bir **başlangıç / bitiş ayeti** isteniyor. Modal son
kullanılan ayarlarla açılıyor (hiç kullanılmadıysa seçili ayetle: o ayetin
suresi, başlangıç = bitiş = o ayet); aralık geçersizse (başlangıç > bitiş ya
da surenin ayet sayısını aşıyor) Türkçe bir uyarı gösterilip başlanmıyor. Her
sekmenin son ayarları (aralık, tekrar sayıları, okuyucu) tarayıcıda
hatırlanıyor (`localStorage`, `quran-reader-ezber-v1`; özel pencerede ya da
depolama kapalıyken sessizce atlanıyor).

- **Dinle** -- birikimli tekrar. Kârî (Husarî / Abdülbâsıt Abdüssamed),
  **Ayet Tekrar Sayısı** (her ayet kaç kez okunsun) ve **Aynısını Tekrar
  Sayısı** (tüm aralık kaç kez baştan alınsın) seçiliyor; ikisi de 1-99. Sıra:
  eûzü, besmele, 1. ayet (tekrar sayısı kadar), sonra aralığın başından o
  ayete kadar her ayet bir kez ("tekrar zinciri"), sonra 2. ayet (tekrar
  sayısı kadar) ve yine başından 2. ayete kadar zincir... -- yani zincir her
  ayette uzuyor. Aralık bitince "Aynısını Tekrar" sayısı kadar baştan
  alınıyor, sonra duruyor. Besmele, Fâtiha ve Tevbe'nin 1. ayetinden başlayan
  aralıklar dışında her turun ve her zincirin başında çalıyor
  (`ezberBasmalaNeeded`). Aşama makinesi `startEzberPlayback` /
  `ezberAdvance`'te (`euzu → besmele → ayah × tekrar → review-besmele →
  review-ayah ...`); kelime vurgusu, sayfa takibi ve ses önbelleği normal
  Oynat'la aynı. Çalarken Oynat düğmesi "Duraklat" oluyor ve etiketinde
  "صدق الله العظيم" yazıyor; ikinci basış durduruyor.
- **Oku** -- sırayla kelime açma. Sıradaki ayet ve aralıkta henüz sırası
  gelmemiş ayetler (sayfada görünenler) kâğıt renginde yuvarlatılmış
  kapaklarla gizleniyor; tamamlananlar açık kalıyor. Sıradaki ayetin üzerine
  dokununca sıradaki KELİME açılıyor ve Türkçe karşılığı (kelime meali
  verisinden) ~1,5 sn bir baloncukta gösteriliyor. Klavye ve ekran okuyucu
  için aynı işi alt çubuktaki **Sıradaki kelimeyi aç** düğmesi yapıyor
  (`#ezber-reveal`; Oku başlayınca odak ona geliyor, Enter/Boşluk bir kelime
  açıyor; açılan kelime, ayetin bitişi ve oturum sonu duyuruluyor; fareyle
  kullananlara görünmüyor, bkz. "Erişilebilirlik"). Ayetin son kelimesi
  açılınca ayet bir kez (Husarî, vurgusuz) okunuyor ve sıradaki ayete
  geçiliyor (ses yüklenemezse -- çevrimdışı -- hemen); son ayetten sonra
  oturum kendiliğinden bitiyor. Başka ayetlere ya da boşluğa dokunmak yok
  sayılıyor.
- **Yaz** -- sırayla harf yazma. Aynı gizleme, ama birim kelime değil harf
  (bir temel harf ve ona bağlı işaretler, `splitIntoUnits`) ve girdi ekrandaki
  Arapça sanal klavyeden (Arapça klavye düzeni açıksa gerçek klavyeden de,
  bkz. "Erişilebilirlik"): basılan tuş sıradaki harfle eşleşirse o harf
  açılıyor, eşleşmezse ekranda HİÇBİR şey olmuyor (görsel hata ya da ceza yok;
  ekran okuyucuya "Bu harf değil" deniyor). Eşleştirme kulakla ayırt edilmeyen
  yazım farklarını aynı sayıyor: tüm elif biçimleri (`أ إ آ ٱ`) `ا`, `ة` `ه`,
  `ؤ` `و`, `ئ ى` `ي` (`ezberBaseChar`). 💡 tuşu, sıradaki kelimenin Türkçe
  anlamını klavyenin üstünde gösterip gizliyor (ekran okuyucuya da
  duyuruluyor). Ayet tamamlanınca Oku'daki gibi okunup sıradakine geçiliyor.
  Klavye, alt çubuğun GERÇEK (ölçülen) yüksekliğinin hemen üstünde duruyor ve
  sayfanın altında o kadar boşluk ayırıyor (`--yaz-keyboard-space`); böylece
  son satırlar klavyenin altında kalmıyor.

Oku ve Yaz oturumları sürerken Ezber düğmesi **Bitir**'e dönüşüyor (basınca
kapaklar kalkıyor, klavye ve baloncuk kayboluyor, ses duruyor) ve ayet gezgini
gizleniyor -- orada ayete dokunmak kelime açmak demek, panel açmak değil (bkz.
"Erişilebilirlik"). Oturumun başı, her ayetin kelime (Oku) ya da harf (Yaz)
sayısı, Oku'da açılan her kelime, Yaz'da her harfin sonucu ve oturumun sonu
ekran okuyucuya duyuruluyor (`#nav-announcer`); "Sıradaki kelimeyi aç" düğmesi
yalnızca Oku sürerken var, Yaz'da odak ekran klavyesinin ilk tuşuna geliyor.
Yaz'ın harf birimleri sayfa çizilirken (`js/render.js`) hesaplanıyor ve her
biri satırda ölçülmüş bir x aralığına bağlı;
`test/full_corpus_test.mjs`, Kur'an'ın 325.585 harf biriminin hepsini metinden
hesaplanan sayıyla karşılaştırıyor (bilinen tek istisna: sayfa 451, kelime
61960).

## Erişilebilirlik

**Sayfa/sure/ayet geçişi anonsu.** `#nav-announcer` (`body`'nin doğrudan
altında, `role="status"` + `aria-live="polite"` + `aria-atomic="true"`,
`.sr-only` ile görsel olarak gizli ama erişilebilirlik ağacında) tüm
gezinmenin tek hunisi olan `showPage`'in sonunda `announceNavigation()`
ile güncelleniyor -- `goToPage`/`goToSurah`/`goToAyah`/`goToJuz`/`goToHizb`/
`goToRub`/`goToManzil`/sayfa okları, hepsi `showPage`'e çıktığı için tek
bir yerden kapsanıyor. Anons metni: `"Sayfa N, <Sure Adı> Suresi, M. ayet"`.
Önce bölge boşaltılıp **50ms gecikmeyle** asıl metin yazılıyor (`els.navAnnouncer.textContent = ""` sonra `setTimeout`) -- art arda aynı hedefe
gidilirse (metin öncekiyle birebir aynı kalsa bile) yine gerçek bir DOM
değişikliği garanti edilmiş oluyor, çünkü değişmeyen bir `aria-live`
içeriğini bazı ekran okuyucular sessizce yok sayıyor.

Aynı bölge **ayet panelinin açılışını ve kapanışını** da duyuruyor
(`"<Sure> <ayet> detayı açıldı"` / `"Ayet detayı kapatıldı"`). Aynı ~50 ms
penceresinde gelen anonslar (bir ayete dokununca hem sayfa/ayet hem panel
anonsu) **tek metinde birleşiyor** -- yoksa ikincisi birincinin yerine
yazılır ve biri hiç duyulmazdı; aynı anahtarla gelen yeni anons bekleyenin
yerine geçiyor (tuşa basılı tutarak sayfa çevirirken yalnızca sonuncusu
söylenir). Mantık `js/app.js`'te `<announce>` işaretleri arasında;
`test/erisilebilirlik_test.mjs` o bloğu çıkarıp Node'da çalıştırıyor.

**`#page-container` canlı bölge DEĞİL.** Eskiden `aria-live="polite"`
taşıyordu; ama sayfa her değiştiğinde yeniden kurulan SVG'nin görünmez
metin katmanı (sayfa başına ~1200 karakter Arapça) "eklenen içerik"
sayılıp baştan sona okutuluyor, 37 karakterlik gerçek anons onun yanında
kayboluyordu; ayet paneli açılıp kapanırken de sayfa metni (üst + alt
dilim) yeniden okunuyordu. Başsız bir Chromium'da DOM düzeyinde ölçüldü:
sayfa çevirmede canlı bölgelere eklenen metin 1192 → 37 karakter, paneli
kapatmada 1155 → 21. Panelin **kendi** dinamik içeriği -- kelime meali/meal
ilk kez yüklenince gövdenin yeniden yazılması, tefsir sekmesine basınca
içeriğin gelmesi (sekme düğmesinin kendi durumunu `aria-expanded` söylüyor,
metnin geldiğini canlı bölge duyuruyor) -- için canlı bölge artık
yalnızca `.word-meal-body` üzerinde.

**Görünmez metin katmanı.** `js/render.js`'teki `addTextSelectionLayer`,
her mushaf satırının gerçek/seçilebilir Unicode metnini bir
`<foreignObject><div class="text-layer-line" dir="rtl">` ile (görünür
glif'leri çizen SVG `<path>`'lerin üstüne, `color: transparent` ile --
`display:none`/`visibility:hidden` DEĞİL) yerleştiriyor; PDF.js'in metin
katmanı tekniğinin aynısı. Ayet satırlarında metin kelime kelime: her
kelime bir `<span class="text-layer-word" data-word-id="N">` (N, mushaf
verisindeki kelime kimliği; ayet sonu işareti ayrı bir kelime), kelimeler
arası boşluk soldaki kelimenin span'ının sonunda; besmele satırı düz metin.
Ezber'in kapak altı metni ağaçtan çıkarması buna dayanıyor (aşağıda). Gerçek
(önbellekteki) SVG'de `render.js` hiçbir yerde `aria-hidden` uygulamıyor, üst
SVG'de de `role="img"` yok (olsaydı içindeki gerçek metni tek bir resim gibi
"yutabilirdi"). Yapısal olarak doğru. İki istisna var, ikisi de `app.js`'ten:
ayet panelinin açıkken kurduğu ikinci kopya (sonraki paragraf) ve Ezber
oturumunda kapakların altında kalan kelimeler (Ezber bölümlerinin sonundaki
"Ezber sırasında kapakların altındaki metin" paragrafı).

**Ayet paneli açıkken sayfa metni erişilebilirlik ağacında bir kez.** Panel
sayfayı görsel olarak ikiye böldüğü için (bkz. "Ayet detay paneli") DOM'da
iki SVG var: üst dilimde gerçek, önbellekteki sayfa; alt dilimde onun klonu.
Kesim yalnızca görsel (`overflow:hidden`), iki SVG de görünmez metin
katmanının TÜM satırlarını taşıyor; yani panel açıkken ekran okuyucu sayfayı
okuyor, paneli okuyor, sonra sayfayı baştan bir kez daha okuyordu. Başsız
Chromium'da (CDP `Accessibility.getFullAXTree`; ağaçtaki görünür her düğüm
DOM'daki yerine göre üst/alt dilim/panel diye sınıflandı) yamadan ÖNCE
ölçüldü: panel kapalıyken 1. sayfada 7 Arapça satır (309 karakter) görünür,
panel açılınca üst dilimde 7 + alt kopyada 7; Bakara 3. sayfada 15 + 15 (1233
+ 1233 karakter). Alt dilim artık `aria-hidden="true"`; gerçek üst dilim,
panel ve panel kapanınca geri kurulan tek SVG ağaçta kalıyor. Alt kopya her
açılışta baştan kurulduğundan işaret kapanışta kendiliğinden gidiyor, gerçek
SVG'ye hiç dokunulmuyor. `inert` bilerek kullanılmadı: fare/dokunma
tıklamasını da keserdi, oysa alt dilimdeki ayete dokunmak ve sure başlığına
basmak çalışmaya devam etmeli; kopyada odaklanabilir öğe de yok, yani klavye
yolu etkilenmiyor. Yamadan SONRA aynı ölçüm: panel açıkken görünür Arapça
satır 7 + 7 -> 7 (430 ve 1200 px, 1. sayfa) ve 15 + 15 -> 15 (430 px, 3.
sayfa); ağaçtaki görünür düğüm sayısı 238 -> 204, 240 -> 206 ve 343 -> 275;
panel kapalıyken (açılıştan önce ve kapandıktan sonra) ağaç yamasızla birebir
aynı (143, 146 ve 191 düğüm). Panel açıkken alt dilimdeki bir ayete fareyle
tıklamak yamasızla aynı ayeti seçiyor (1. sayfada 7. ayet, 3. sayfada 16.
ayet). Görünüm değişmedi: fareyle ulaşılan 4 durumun (kapalı sayfa, panel
açık, panel kapalı, Sure Bilgisi) 1., 2. ve 3. sayfada, 430 ve 1200 px'te
ekran görüntüleri yamasız sürümle piksel piksel aynı (24 çiftte 0 piksel
fark); ayet gezgini yamasının Chromium akışları (Tab durakları, Enter/Space
ile panel ve Sure Bilgisi, odak yönetimi, Ezber) yamalı ağaçta aynen geçti.
`test/erisilebilirlik_test.mjs`e 29 kontrol eklendi (gerçek
`openWordMealStructure`/`mountClosedPage` kaynaktan çıkarılıp gerçek
`index.html` ve gerçek metin katmanıyla jsdom'da çalışıyor): alt kopya
`aria-hidden` ve ağaçta kalan satırlar yalnızca üst dilimin, panel ve gerçek
SVG'ye dokunulmamış, kapanışta ve ikinci açılışta hiçbir işaret kalmıyor,
`inert`/`pointer-events` yok, kopya sadık (içindeki metin seçilebilir),
kopyada odaklanabilir öğe yok. Her parça tek tek bozularak (16 mutasyon:
geri alma, yanlış dilim, panel, `#page-container`, `inert`, `"false"`, gerçek
SVG, yalnızca ilk açılış, kopyadan satır silme, sızan odaklanabilir öğe,
kapanışta artık, klon farkı, `pointer-events`) testlerin kırıldığı
doğrulandı. Ödünleşme: okuma sırası "sayfa metni, sonra panel" oldu (görsel sıra
"kesimin üstü, panel, kesimin altı"); dokunarak keşfeden bir ekran okuyucu
kullanıcısı panelin altındaki satırların üstünde parmağını gezdirince artık
bir şey duymaz (aynı satırlar üst kopyada sırayla okunur, alttaki ayetlere de
ayet gezgininden gidilir) -- bu beklenti, gerçek cihazda sınanmadı.

**Arapça metin parçalarının dili (`lang="ar"`).** Belge dili `tr`
(`<html lang="tr">`); ekran okuyucunun/TTS'in sesi `lang`e göre seçildiği
için işaretsiz Arapça metin Türkçe sesle okunmaya çalışılır (WCAG 3.1.2,
Dil Parçaları). Şunlar `lang="ar"` taşıyor: metin katmanı satırları
(`render.js`), üst çubuktaki Arapça sure adı, Oynat düğmesinin etiketi, 29
Arapça klavye tuşu (💡 İpucu tuşu hariç: aria-label'ı Türkçe), sure/cüz/
hizb/rub/menzil/arama listelerindeki ve sure bilgisi/konu modallarındaki
Arapça adlar, ayet metinleri, kelime kartları ve konu açıklamalarındaki
satır içi Arapça parçalar (bunlar veriden `<span class="ar">` olarak
geldiği için çizim anında `markArabicSpans` ekliyor, veri dosyası
değişmedi). Oynat düğmesinin etiketi hem Arapça ibare hem Türkçe durum
metni ("Yükleniyor…") taşıdığından metin ve dil tek yerden, birlikte
yazılıyor (`setPlayLabel`). `test/erisilebilirlik_test.mjs`, işaretlenecek
yerleri elle yazılmış bir listeden değil CSS'ten türetiyor: `--font-arabic`
kullanan her sınıfın taşındığı her etiket `lang="ar"` içermiyorsa test
kırılıyor; yani ileride eklenecek yeni bir Arapça öğe de yakalanır. Başsız
Chromium'da 14 arayüz durumunun (açılış, sure/cüz modalları, sure bilgisi,
ayet paneli, konu modalı, arama, ezber) her birinde DOM'da 610-791 Arapça
metin düğümü vardı ve durumlar boyunca taranan toplam 9.567 kaydın 9.554'ü
dilsizdi (yalnızca arama modalındaki 13'ü işaretliydi); şimdi hepsi
tarayıcının kendi `:lang(ar)` eşleşmesinde Arapça. Ekran
görüntüleri ve metin katmanı satırlarının ölçüleri değişmedi. Sa'dî tefsiri
metinlerindeki Arapça alıntılar bu yamada kapsam dışıydı; sonradan ele alındı,
bkz. aşağıdaki "Sa'dî tefsirinin dil işaretleri".

**Oynat düğmesinin erişilebilir adı.** Düğmenin adı yalnızca ekrandaki Arapça
ibareydi ("بسم الله الرحمن الرحيم"; çalarken "صدق الله العظيم", veri
yüklenirken "Yükleniyor…") ve ayrıca `aria-pressed` taşıyordu. Başsız
Chromium'un erişilebilirlik ağacında (CDP `Accessibility.getPartialAXTree`;
boşta, veri yüklenirken, çalarken, Enter / Space / fareyle durdurunca ve
Ezber > Dinle çalarken/durunca: 10 durum, 430 ve 1200 px) yamadan ÖNCE
ölçülen ad hep o ibareydi, durum "pressed=false/true"; düğmenin ne yaptığını
söyleyen tek bir Türkçe sözcük yoktu. Şimdi ad
`aria-labelledby="play-btn-action play-btn-label"` ile iki parçadan kuruluyor:
görünmez (`.sr-only`) Türkçe eylem (`#play-btn-action`: boştayken "Oynat",
çalarken "Duraklat") ve ekranda görünen etiket (`#play-btn-label`,
`lang="ar"`). Ölçülen adlar: boşta "Oynat بسم الله الرحمن الرحيم", yüklenirken
"Duraklat Yükleniyor…", çalarken "Duraklat صدق الله العظيم", durdurunca yine
"Oynat بسم…"; Enter, Space, fare ve Ezber > Dinle yollarında aynı, `pressed`
özelliği yok, odak düğmede kalıyor, sayfa hatası 0. Kararlar:

- **`aria-label="Oynat"` değil, `aria-labelledby`.** `aria-label` ekrandaki
  Arapça ibareyi addan çıkarırdı; WCAG 2.5.3 (Adda Etiket / Label in Name)
  ise sesle kumanda eden kullanıcının ekranda gördüğü metni söyleyerek
  düğmeye basabilmesini ister. Ad görünen metni içeriyor. Eylem başta: Türkçe
  ekran okuyucu kullanıcısı önce ne yapacağını duyar; 2.5.3 yalnızca "içersin"
  der, etiketin başta olması ise en iyi uygulamadır -- burada bilinçli bir
  ödünleşme.
- **`aria-pressed` kaldırıldı.** Adı durumla birlikte değişen bir düğmede
  ikisi birden "Duraklat, geçiş düğmesi, basılı" gibi çelişkili okunur (ARIA
  APG Button deseni: etiketi değişen düğmede `aria-pressed` kullanılmaz).
  Durum artık adın kendisinde.
- **Yüklenirken de "Duraklat".** O sırada ikinci dokunuş oturumu durduruyor
  (tıklama işleyicisi `state.playback.active`'e bakıyor), ad bunu söylemeli;
  bu yüzden `setPlayActive(true)` ilk `await`'ten önce çağrılıyor.
- **"Duraklat" gerçek bir duraklatma değil.** Durdurunca ses sıfırlanıyor;
  seçili ayet çalınan ayette kaldığından tekrar basınca o ayetin başından
  başlıyor (ayetin ortasından değil). Davranış değişmedi, yalnızca ad ona
  uyuyor; ayet ortasından devam istenirse ayrı bir iş.
- **Tek yazım yeri.** `.playing` sınıfı ile eylem sözcüğü yalnızca
  `setPlayActive`'ten, üç çağrı noktasından (`startPlayback`, `stopPlayback`,
  `startEzberPlayback`) yazılıyor; görünüm ile ad ayrışamaz.

`test/erisilebilirlik_test.mjs`'e 46 kontrol eklendi (99 → 145): statik
işaretleme; gerçek `setPlayLabel`/`setPlayActive` (`app.js`'ten kaynak olarak
çıkarılıp) gerçek `index.html`'e uygulanıyor ve ad, elle yazılmış bir
hesapla değil, axe-core'un accname uygulamasıyla hesaplanıyor (5 durum:
yükleniyor, çalıyor, durdu, Ezber çalıyor, Ezber durdu); kaynak kontrolleri
(tek yazım yeri, üç çağrı noktası, ilk `await`'ten önce, tıklama işleyicisi,
`els.playBtnAction`). Her parça tek tek bozularak (28 mutasyon:
`aria-pressed`'in geri gelmesi, `aria-labelledby`'nin eylemi düşürmesi /
sırasının ters olması / `aria-label`'e dönmesi, `.sr-only` / `aria-hidden` /
`hidden` / yanlış `id` / düğme dışına taşıma, eylem öğesine `lang="ar"`,
Oynat/Duraklat yer değiştirmesi, yazım hatası, İngilizce sözcük, üç çağrı
noktasının her birinin eksilmesi, yükleme sonrasına kayma, `.playing`'in iki
yerden yazılması, tıklama işleyicisinin hep başlatması, etiket/dil ayrışması)
testin kırıldığı doğrulandı; değişikliksiz hâl diğer beş test dosyasıyla
birlikte geçiyor. Alt çubuğun ekran
görüntüleri (6 durum + boştaki tam sayfa, 430 ve 1200 px, sayfa 1 ve 3: 28
çift) yamasız ağaçla piksel piksel aynı (0 farklı piksel); durumların
birbirinden binlerce piksel farklı olduğu ayrıca doğrulandı, yani
karşılaştırma boş değil. **Sınır:** gerçek bir ekran
okuyucuyla denenmedi: odaktaki düğmenin adı değişince ("Oynat" → "Duraklat")
ekran okuyucunun yeni adı duyurup duyurmadığı ve adın Arapça kısmının Arapça
sesle okunup okunmadığı bilinmiyor (aşağıda 13. madde).

**Modal odak yönetimi.** Yedi modalın (sure, cüz, sayfa, ezber, sure bilgisi,
konu, arama) hepsi `role="dialog"` + `aria-modal="true"` +
`aria-labelledby` taşıyordu, ama odağa hiç dokunulmuyordu. Başsız
Chromium'da (430 ve 1200 px görünüm; fare + klavye; 7 modalın her biri
için aynı senaryo) yamadan ÖNCE ölçülen durum: modal açılınca odak modalın
içine girmiyor, arkadaki düğmede ya da `<body>`'de kalıyordu (yalnızca
arama modalı giriş alanına odaklanıyor: 1/7) -- ekran okuyucu "Sure Seç,
iletişim kutusu" demiyor, Tab de modalın ALTINDAKİ sayfada dolaşıyordu
(Tab durağı sayıları: sure 229, konu 189, cüz 35, ezber 12, arama 8, sayfa
6, sure bilgisi 4); modalın son durağında Tab odağı dışarı taşıyordu
(içeride kalan: 0/7); Esc, Kapat, perdeye tıklama ya da bir öğe seçme ile
kapanınca odak modalı açan düğmeye değil `<body>`'ye düşüyordu (açana dönen:
0/6, öğe seçmede 0/3) -- Tab sayfanın başından başlıyor, ekran okuyucu
kullanıcısı nerede olduğunu kaybediyordu. `js/modal-odak.js` bunu üç şeyle
çözüyor (WAI-ARIA APG "Dialog (Modal)" deseni) ve `openModal`/`closeModal`'a
tek yerden bağlı:

- **Açılışta odak modalın kendisine** alınıyor (`tabindex="-1"`: programatik
  odak alır, Tab sırasına girmez). Ekran okuyucu başlığı ve rolü okur;
  229 duraklı bir listede ilk öğeye ya da Kapat düğmesine atlamaktan daha
  iyi. Arama modalı kendi giriş alanına odaklanmaya devam ediyor (`onOpen`,
  `enter()`'den SONRA çalışıyor). `.modal-sheet:focus { outline: none }`:
  kapsayıcı etkileşimli bir öğe değil, klavyeyle açınca bütün sheet'in
  çevresine halka çizilmesin; düğme/giriş öğelerinin `:focus-visible`
  halkası olduğu gibi duruyor.
- **Tab/Shift+Tab modalın içinde dönüyor** (son durakta Tab -> ilk; ilk
  durakta ya da kapsayıcıdayken Shift+Tab -> son). Odak başka bir yolla
  dışarı düşerse (yardımcı teknoloji, gizlenen bir öğeden `<body>`'ye düşen
  odak) `focusin` güvenlik ağı onu son Tab yönüne göre içeri çekiyor. Durak
  listesinde `[hidden]`/`[inert]` atası olanlar, `display:none` /
  `visibility:hidden` olanlar (`checkVisibility()`), devre dışı ve
  `tabindex="-1"` öğeler yok.
- **Kapanışta odak açana dönüyor.** Arama -> konu gibi modaldan modala
  geçişlerde en baştaki açan korunuyor (zincirin sonunda odak yine baştaki
  düğmeye döner); ara modalın kapanışı odağı geri vermiyor. Safari/iOS
  tıklanan düğmeye odak vermediği için (`document.activeElement` `<body>`
  kalıyor) yakalama aşamasında son tıklanan etkileşimli öğe de tutuluyor
  ve yalnızca taze ise (1 sn) kullanılıyor. Sure başlığına SVG üzerinden
  fareyle/dokunarak açılan Sure Bilgisi'nin odaklanabilir bir açanı yok;
  orada kapanışta odağa dokunulmuyor. Klavye/ekran okuyucuyla açılınca
  açan, gezgindeki sure başlığı düğmesi ve kapanışta odak ona dönüyor (bkz.
  aşağıdaki "Ayete ve sure başlığına klavye / ekran okuyucu erişimi").

Aynı senaryo yamalı sürümde: açılışta odak modalda 7/7, açılışta Shift+Tab
içeride 7/7, son durakta Tab içeride 7/7, kapanışta odak açana dönüyor
(Esc, Kapat ve perde için ayrı ayrı 6/6; Sure Bilgisi'nin açanı yok), öğe
seçerek kapanışta 3/3; klavyeyle açılan kapsayıcıda halka yok (0/4), ama
arama girişi 2 px halkasını koruyor.
Görünüm değişmedi: fareyle açılmış 7 modalın ekran görüntüleri 430 ve
1200 px'te yamasız sürümle piksel piksel aynı (14 görüntüde 0 piksel
fark). Klavyeyle (Enter) açılışta tek fark üst çubukta: yamasızda odak
açan düğmede kaldığı için o düğmenin altın odak halkası perdenin ardında
görünür, yamalıda odak modalın içinde olduğundan görünmez; sheet'in
çevresinde yeni bir halka çıkmıyor.

**Aynı yamada kapatılan gizli bir hata: kapat-hemen-yeniden-aç.**
`closeModal`'ın kapanış bitişi (`transitionend` + 320 ms yedek
zamanlayıcı) modalı `hidden` yapıyor; kapanış animasyonu bitmeden modal
YENİDEN açılırsa eski zamanlayıcı yeni açılışı gizliyordu -- modal görünmez
ama "açık" kalıyor, perde ekranda takılıyor, Esc bile çalışmıyordu
(`closeModal` zaten gizli modalı atlıyor). Eski kodda buna pratikte
ulaşılamıyordu (Esc odağı `<body>`'ye düşürüyordu; perde -- `position:
fixed; inset: 0`, `pointer-events` kapatılmıyor -- kapanış sürerken de
fare tıklamasını karşılıyor), ama odak açan düğmeye dönünce
klavyeyle ("Esc, hemen ardından Enter") ulaşılabilir hâle gelecekti; o
yüzden aynı yamada kapatıldı: `finish` artık modal o arada yeniden
açıldıysa dokunmuyor. Yamasız sürümde aynı durum (odak elle açana alınarak
taklit edildi) sabit açanı olan 5 modalın 5'inde arayüzü kilitledi, yamalıda
0/5.

`test/modal_odak_test.mjs` (jsdom, 108 kontrol): 7 modalın işaretlemesi ve
`closeAllModals` listesiyle bire bir örtüşmesi, `tabbablesIn`/`isRendered`,
`createModalFocus`'un GERÇEK `index.html` üzerinde davranışı (döngü,
kaçan odağın geri çekilmesi, Chromium ve Safari/iOS açan yakalama yolları,
tıklama kaydının açanın kendi `click` işleyicisinden ÖNCE yapılması,
zincirleme açılış, yok olmuş/gizli/devre dışı açanda sessiz vazgeçme) ve
`app.js`'in `openModal`/`closeModal`/`closeAllModals` bloğunun kaynaktan
çıkarılıp gerçek modal işaretlemesiyle çalıştırılması (sıralama, kapat-aç
yarışı, `restoreFocus:false`). Her parça tek tek bozularak (modülde 20,
`app.js`'te 12, HTML/CSS'te 4, `sw.js`'te 2 -- toplam 38 mutasyon)
testlerin gerçekten kırıldığı doğrulandı. Sınır: jsdom'da düzen ve gerçek
Tab gezintisi yok; yukarıdaki Chromium ölçümü bu açığı kapatıyor, ama gerçek
ekran okuyucu testinin yerini tutmuyor.

**Sure Bilgisi'nde bağlantı -> ayrıntı -> Geri: odak.** Sure Bilgisi
metnindeki bir bağlantıya (ör. "Bakara", "1-32") Enter basınca içerik modalın
içinde bir alt görünüme (`#surah-info-detail`) geçiyor, Geri ana içeriğe
dönüyor. İki geçişte de odaktaki öğe az önce gizlenen panelin içinde
kalıyordu. Gerçek Chromium'da (430 px; yalnızca Tab ve Enter; 50. sayfada
gezginin "Âl-i İmrân Suresi hakkında bilgi" düğmesi -> Enter -> metindeki
"Bakara" bağlantısı) yamadan ÖNCE ölçülen durum: bağlantıya Enter ->
`document.activeElement` `<body>`, erişilebilirlik ağacında "yok sayıldı"
(ekran okuyucu yeni görünümü duymuyor); sonraki Tab görünümün ortasından
sürüyor ("Geri dön"e gidiyor, Kapat'a değil); Geri'ye Enter -> yine `<body>`
(okuyucu, 18 bağlantılı bir metinde kaldığı yeri kaybediyor). Konu
Fihristi'nin çip/bağlantı/Geri geçişleri bunu daha önce aynı yöntemle
çözmüştü (`pushTopicsModalTopic`); Sure Bilgisi'nde yoktu. Şimdi (`js/app.js`,
`<surah-info-detail>` bloğu):

- **Ayrıntıya girerken odak modalın kapsayıcısına** alınıyor (modal
  açılırkenki gibi). Ölçüldü (430 ve 1200 px'te aynı): odak `dialog`, ad
  "3. Âl-i İmrân"; sonraki Tab "Kapat". Görünüm zaten açıkken içerik yenilenirse ("Yükleniyor…" ->
  ayetlerin meali) odağa dokunulmuyor: kullanıcı o arada Geri'ye ya da bir
  düğmeye gelmiş olabilir.
- **Geri'de odak ayrıntıyı açan bağlantıya** dönüyor (ölçüldü: `link`, ad
  "Bakara"; `:focus-visible` eşleşiyor, halka Tab'la gelindiğindekiyle aynı
  `outline: auto`, kaydırma konumu yerinde). Ana içerik yeniden kurulmadığı
  için bağlantı yerinde; kapsayıcıya dönmek, çok bağlantılı bir metinde
  Tab'la en baştan başlamak demek olurdu. Bağlantı yoksa ya da odak
  alamıyorsa kapsayıcıya.
- Genel sıfırlama (`closeSurahInfoDetail`; modal kapanırken de çağrılıyor)
  odağa dokunmuyor, yalnızca açan kaydını temizliyor.

"Mushaf'a Sureye Git" / "Mushaf'ta Ayete Git" bu yamada DEĞİŞTİRİLMEDİ, ama
aynı sahnede ölçüldü, çünkü eski sınır ("açan düğme yeniden kurulur, odak
`<body>`'ye düşebilir") gezgin yolunda yanlış çıktı: gezgin düğmesiyle
açılınca sayfa değişirse odak gidilen ayetin gezgin düğmesine iniyor
("Bakara Suresi, 1. ayet", sayfa 2; 3:130 için "Âl-i İmrân Suresi, 130.
ayet", sayfa 66); aynı sayfada kalınırsa açan sure başlığı düğmesine
dönüyor (seçili ayet, ayet listesinin tek Tab durağı); Esc ile kapatınca da
açan düğmeye. Sayfa yeniden kurulana kadar (bu ölçümlerde yaklaşık 40-60
ms) odak kısa süre eski açan düğmede duruyor, sonra gidilen ayete geçiyor;
ekran okuyucunun ikisini art arda okuyup okumadığı bilinmiyor. Odak yalnızca
başlığa fareyle/dokunarak açılmış Sure Bilgisi'nde `<body>`'de kalıyor:
orada odaklanabilir bir açan yok (bkz. "Kapanışta odak açana dönüyor") ve
bilerek öyle bırakıldı -- fare kullanıcısına görünmeyen bir gezgin düğmesine
odak vermek, sonraki Space/ok tuşlarının anlamını (kaydırma yerine paneli
aç / ayeti seç) sessizce değiştirirdi.

Aynı ölçümde çıkan bir bulgu (kapalı akordeon bölümlerinin içeriği Tab
sırasında duruyor) bu yamada DEĞİŞTİRİLMEDİ; ayrı bir commit olarak
düzeltildi, bkz. aşağıdaki "Sure Bilgisi'nde kapalı akordeon bölümleri".

`test/sure_bilgisi_odak_test.mjs` (yeni, jsdom, 46 kontrol): app.js'ten GERÇEK
`openModal` bloğu ile GERÇEK `<surah-info-detail>` bloğu çıkarılıp gerçek
`index.html`, `modal-odak.js` ve `surahinfo.js`'in `parseInfoLink`'iyle
çalıştırılıyor: bağlantı -> ayrıntı (odak kapsayıcıda; Tab sırası Kapat ->
Geri -> git düğmesi), içerik yenilenirken odağın çalınmaması, Geri'de odak
bağlantıda (ikinci bağlantı dahil), açan kopmuşsa/odak alamıyorsa/hiç
yoksa kapsayıcıda, çözümlenemeyen bağlantının açan sayılmaması, modal
kapanışında açanın temizlenmesi ve açana dönüş, "Mushaf'a/Ayete Git"in
eskisi gibi çalışması. Yamasız koda karşı (yalnızca bloğun işaretleri
eklenmiş) 15 kontrol kırılıyor; 22 mutasyon (odak çağrılarının silinmesi ya da
ters çevrilmesi, Geri'nin eski bağlantıya geri alınması, açanın
kaydedilmemesi/erken kaydedilmesi/temizlenmemesi, gövdenin gizlenmemesi,
HTML'deki Geri düğmesinin ve `hidden`'ın bozulması...) hepsi yakalandı.
Sınır: jsdom'da odaktaki öğe gizlenince odak `<body>`'ye düşmüyor
(Chromium'da düşüyor), yani düzeltilmemiş kod burada "odak beklenen yerde
değil" diye yakalanıyor; gerçek ekran okuyucu (NVDA/JAWS/VoiceOver/TalkBack)
çalıştırılmadı.

**Sure Bilgisi'nde kapalı akordeon bölümleri.** Akordeonun kapalı bir bölümü
yalnızca küçülüyordu (`grid-template-rows: 0fr` + `overflow: hidden`) ve
saydamlaşıyordu (`opacity: 0`): düğme `aria-expanded="false"` diyor, içerik
hâlâ oradaydı. Gerçek Chromium'da (430 px; 50. sayfada gezginin "Âl-i İmrân
Suresi hakkında bilgi" düğmesi -> Enter; 5 bölümün 4'ü kapalı) düzeltmeden
ÖNCE ölçülen durum:

- tam bir Tab turu 25 durak, 17'si kapalı bölümlerdeki bağlantılar ("1-32",
  "33-63", ...; her biri 17 px yüksekliğinde ama 0 yüksek bir kutunun
  içinde): odak ekranda görünmeyen bir öğeye gidiyor;
- `modal-odak.js`'in `tabbablesIn`'i 24 öğe sayıyor, 17'si kapalı bölümlerde
  ve SON öğe kapalı bölümdeki "190 - 200" bağlantısı: modal açılışında
  Shift+Tab (APG sarması: ilk durakta Shift+Tab -> son durak) odağı bu
  görünmez bağlantıya atıyor;
- erişilebilirlik ağacında kapalı bölümdeki bağlantı `link`, "yok
  sayılmadı" (ekran okuyucu görünmeyen metni okur);
  `checkVisibility({ visibilityProperty: true })` true.

Düzeltme (`css/style.css`, `.info-section-panel-inner`): kapalıyken
`visibility: hidden`, açıkken `visible`. Geçişler: kapanırken `visibility 0s
linear 0.3s` (küçülme bitince; `grid-template-rows` geçişiyle aynı süre),
açılırken `visibility 0s` (hemen: içerik animasyonun ilk karesinden itibaren
görünür). Aynı sahnede düzeltmeden SONRA ölçülen (430 px; 1200 px'te de aynı
sayılar): Tab turu 8 durak, hiçbiri kapalı bölümde; `tabbablesIn` 7 öğe,
sonuncusu "Konu: Hidayet" düğmesi ve açılışta Shift+Tab ona gidiyor; kapalı
bölümdeki bağlantı ağaçta yok sayılıyor (`ignored`), açık bölümdekiler `link`.
Animasyon: açarken `visibility` sınıfın eklendiği karede `visible` (5
denemede hiç `hidden` kare yok), kapanırken yükseklik 0'a indiği karede ya da
hemen sonrasında `hidden` (küçülürken "yükseklik > 0 ama hidden" kare yok); 80
rastgele hızlı aç/kapa serisinden sonra her bölümde sınıf, `aria-expanded`,
`visibility` ve `checkVisibility` tutarlı. Sınıf değişiminden itibaren
yükseklik ve opacity eğrisi (3 açma + 3 kapama, 10 zaman kayması) yamasız ve
yamalı ağaçta ölçüldü: ikisi arasındaki en büyük fark (yükseklikte 23-29 px,
opacity'de 0,14) aynı ağacın iki çalıştırması arasındaki farktan (39 px, 0,10)
küçük, yani ölçüm gürültüsü içinde. Yerleşik durumların ekran görüntüleri (10
durum: ilk bölüm açık, 2. açık, 2. ve 5. açık, hepsi kapalı, tefsir
açık/kapalı...; 430 ve 1200 px; her ağaçta ikişer tur): 430 px'te iki turda da
yamasız ve yamalı ağaç bayt bayt aynı; 1200 px'te en çok 1-2 pikselde 1
düzeylik fark (yamasız ağacın iki turu arasında da aynı türden fark var). 430
px'te turlar arasında başlık metninin olduğu 28x16 px'lik bir bölgede her iki
ağaçta da görülen bir oynama var; yamayla ilgisiz.

**Bilerek dokunulmadı: aynı 0fr/1fr kalıbını kullanan iki panel daha.**

- *Tefsir* (`.wm-tafsir-panel`): CSS'e (`visibility`) dokunulmadı. Panel,
  `.word-meal-body`'nin `aria-live="polite"` bölgesinin içinde ve
  `showTafsirContent` içeriği panel kapalıyken yazıp bir kare sonra açıyor
  (bkz. "`#page-container` canlı bölge DEĞİL"); `visibility: hidden`, gizli
  bir alt ağaca yazılan metnin duyurulup duyurulmayacağını değiştirebilir ve
  bu gerçek ekran okuyucu olmadan doğrulanamaz (CSS'te nedeni yazılı). Kapalı
  metnin ağaçta durması başka yoldan çözüldü: kapanış bitince metin DOM'dan
  kaldırılıyor, açılış yolu aynı kalıyor (aşağıda, "Tefsir sekme düğmesi:
  açık/kapalı durumu ve kapalıyken metin"). İçinde odaklanabilir öğe yok,
  yani Tab zaten etkilenmiyordu.
- *Ayet paneli* (`.word-meal-panel`): kapalı hâli kalıcı değil (açılırken bir
  kare, kapanırken animasyon boyunca; sonra panel DOM'dan kalkıyor) ve odak
  yönetimiyle iç içe (kapanırken odak panelin içindeyse önce gezgin düğmesine
  alınıyor).

`test/kapali_panel_test.mjs` (yeni, jsdom, 28 kontrol): (1) `css/style.css`
jsdom CSSOM'uyla ayrıştırılıyor: kapalı/açık `visibility` değerleri
(`!important` yok), kapanış gecikmesi grid süresine EŞİT, açılışınki yok,
opacity geçişi iki durumda aynı, 0fr/1fr kalıbını kullanan panel kümesi
bilinen üçü (yenisi eklenirse test kırılıp bu karara dönüp bakmayı istiyor);
(2) app.js'ten GERÇEK `surahInfoBodyHTML` x 114 surenin gerçek verisi (396
bölüm; kapalı 282 bölümde 365 bağlantı) x gerçek `style.css` (jsdom'a
enjekte): her kapalı bölümde panel içi, içerik ve her bağlantı `visibility:
hidden`, her açık bölümde `visible`, başlık düğmeleri hep `visible`, bölümü
açıp kapatınca durum izliyor, `aria-expanded` ile `.open` tutarlı; (3) GERÇEK
`createModalFocus`/`tabbablesIn`: hiçbir durak kapalı bölümde değil, son durak
son bölümün başlık düğmesi, açılışta Shift+Tab ona gidiyor, ondan Tab ilk
durağa sarıyor. 21 mutasyon (`visibility` satırlarının silinmesi, gecikmenin
silinmesi ya da yanlış olması, açık kuralın geçişinin silinmesi, `!important`,
opacity değişikliği, seçici yazım hatası, yeni 0fr paneli, bölümlerin hepsinin
açık ya da kapalı üretilmesi, `aria-expanded`'in bozulması, `modal-odak.js`'te
görünürlüğe bakılmaması...) ve yamasız CSS hepsi yakalandı (yamasız CSS'e
karşı 10 kontrol kırılıyor). Sınır: jsdom'da düzen, geçiş ve
`checkVisibility()` yok (geçişler yalnızca CSS metninden doğrulanıyor; Tab
tuzağındaki `checkVisibility` Chromium'un ilgili kısmını taklit eden küçük bir
yedek); gerçek ekran okuyucu (NVDA/JAWS/VoiceOver/TalkBack) çalıştırılmadı;
gecikmeli `visibility` geçişi yalnızca Chromium'da ölçüldü (Firefox/Safari'de
denenmedi).

**Tefsir sekme düğmesi: açık/kapalı durumu ve kapalıyken metin.** Ayet
panelinin Tefsir bölümündeki düğme ("Tefsîr-i Sa'dî") açık mı kapalı mı
olduğunu yalnızca görsel olarak (`.active` sınıfı) taşıyordu. Gerçek
Chromium'da (430 px; 50. sayfada gezginden Enter ile açılan panel; sekmeye
klavyeyle Enter ve Boşluk; CDP `Accessibility.getFullAXTree`) düzeltmeden ÖNCE
ölçülen durum:

- düğme ağaçta yalnızca `button`, ad "Tefsîr-i Sa'dî"; `expanded` özelliği
  açıkken de kapalıyken de yok, DOM'da hiçbir `aria-*` yok: durumu düğmeden
  öğrenmenin yolu yoktu (kapatınca canlı bölgeye eklenen metin de 0 karakter;
  DOM düzeyinde ölçüldü, gerçek ekran okuyucuyla değil);
- kapatınca (panel yüksekliği 0) 3238 karakterlik metin DOM'da, 3049
  karakteri ağaçta görünür (`ignored` false) kalıyor: düğme "kapalı" derken
  metin okunabiliyor;
- tefsir dosyasının yanıtı yapay olarak 2,5 sn geciktirilip sekmeyi açıp
  kapatınca kapalı panelde "Yükleniyor…" (11 karakter) DOM'da ve ağaçta
  kalıyor, veri gelince de yerine bir şey yazılmıyor;
- aynı karede iki tıklama (senkron `click(); click();`): sekme "etkin değil"
  olurken panel AÇIK (64 px) ve içeriği "Yükleniyor…" olarak KALICI; panelin
  açılması bir kare sonra (`requestAnimationFrame`), sekmenin hâlâ etkin olup
  olmadığına bakılmadan yapılıyordu.

Düzeltme (`js/app.js`; `css/style.css`'te yalnızca yorum):

- Düğmeler baştan `aria-expanded="false"`; `updateTafsirTabsUI`, `.active` ile
  `aria-expanded`'ı AYNI değerden (`wm.tafsirActive`) yazıyor, yani ikisi
  ayrışamaz. `role="tab"` kullanılmadı (sekme listesinde hep biri seçili
  olur, burada hepsi kapanabiliyor), `aria-pressed` de değil (adı değişmeyen
  bir göster/gizle düğmesi; Sure Bilgisi akordeonu da yalnızca
  `aria-expanded` taşıyor), `aria-controls` da yok.
- Düz kapanış BİTİNCE (animasyon sürerken değil: `transitionend` ya da 400 ms
  yedek zamanlayıcı) metin DOM'dan kaldırılıyor (`clearTafsirContent`); arada
  yeni bir tıklama olduysa (`requestId` değiştiyse) kaldırılmıyor, böylece
  kapanırken yeniden açılan ya da kapat-aç-kapat'ta eski kapanışın bitişi
  yeni animasyonu bozmuyor. `aria-expanded="false"` iken ağaçta okunacak
  tefsir metni de kalmıyor. Açılış yolu DEĞİŞMEDİ: metin yine kapalı panele
  yazılıp bir kare sonra açılıyor, yani canlı bölgeye eklenen metin aynı
  (açılışta 3249 karakter, kapatınca 0; önce de aynıydı) ve panele
  `visibility: hidden` verilmedi.
- `showTafsirContent` paneli bir kare sonra YALNIZCA sekme hâlâ etkinse
  açıyor.

Düzeltmeden SONRA aynı sahne: düğme ağaçta `expanded` false / true / false /
true (ilk durum, aç, kapat, yeniden aç; DOM'da `aria-expanded` ve `.active`
birlikte); kapatınca metin DOM'da ve ağaçta 0 karakter (önce 3238 / 3049),
yeniden açınca 3238 / 3049 (önceki gibi); veri gelirken kapatılan panel kapalı
ve boş (11 -> 0 karakter) ve veri gelince de öyle kalıyor; aynı karede çift
tıklamada panel kapalı, boş, düğme `expanded` false (önce panel 64 px açık);
kapanırken yeniden açınca son durum açık ve metin dolu (öncekiyle aynı).
Animasyon eğrisi (veri önbellekteyken 3 açma + 3 kapama; sınıf değişiminden
itibaren 12 zaman kaymasında panel yüksekliği ve iç öğenin opacity'si)
yamasız ve yamalı ağaçta ölçüldü: medyanlar arasındaki en büyük fark
yükseklikte 21 px (açılış) ve 12 px (kapanış), opacity'de 0,04; aynı ağacın üç
koşusu arasındaki en büyük aralık ise 45-57 px ve 0,05, yani fark ölçüm
gürültüsü içinde. Kareler arası en büyük yükseklik sıçraması iki ağaçta da
376-379 px (kapanışın sonunda ek bir sıçrama yok) ve panel görünürken içeriği
boş olan kare hiç yok. Yerleşik durumların ekran görüntüleri (tefsir kapalı,
açık, tekrar kapalı, tekrar açık + Sure Bilgisi'nin 6 durumu): 430 px'te 10/10
bayt bayt aynı; 1200 px'te tefsirin 4'ü bayt bayt aynı, dokunulmayan Sure
Bilgisi'nin birinde 2 pikselde 1 düzeylik oynama var (yukarıdaki kapalı
akordeon paragrafındakiyle aynı türden).

`test/tefsir_sekme_aria_test.mjs` (yeni; jsdom, 88 kontrol, ≈ 6-10 sn):
`app.js`'ten kaynaktan çıkarılan GERÇEK `ayahPanelBodyHTML`,
`updateTafsirTabsUI`, `animateTafsirClosed`, `clearTafsirContent`,
`showTafsirContent` ve `onTafsirTabClick` x gerçek `js/tafsir.js` x gerçek
`data/tafsir-saadi.json` (2:255) x elle ilerletilen zamanlayıcı (`setTimeout`
ve `requestAnimationFrame` bir kuyrukta; deterministik): ilk durum, açma,
kapama (animasyon sürerken metin duruyor; `transitionend` ya da yedek
zamanlayıcıyla bitince kalkıyor; yanlış özelliğin ya da yanlış hedefin geçişi
kapanışı bitirmiyor), yeniden açma, ilk açılışta veri bekleme, veri gelirken
kapatma (ve yeniden açma), aynı karede çift ve üç tıklama, kapanırken yeniden
açma, kapat-aç-kapat, iki kaynak arasında geçiş (ikincisi verisi olmayan
"yakında eklenecek" kaynağı; aynı anda en çok bir düğme `expanded`) ve geçiş
sırasında geri dönme; birkaç senaryo gerçek zamanlayıcıyla da. Ayrıca 50
tohumlu rastgele tıklama / zaman / veri dizisi (tek ve iki kaynak, her biri
120 adım): her adımda `aria-expanded` == `.active` == `wm.tafsirActive ===
id`, en çok bir düğme `expanded`, açık panel hiç boş değil; sonunda kapalıysa
panel kapalı ve metin yok, açıksa panel açık ve metin dolu. Son olarak
axe-core yapısal taraması (kapalı ve açık). Düzeltmesiz koda karşı (testin
işlev bulma denetimi geçsin diye kullanılmayan boş bir `clearTafsirContent`
eklenerek) 66 kontrol kırılıyor; kodun her parçası tek tek
bozularak 30 mutasyon denendi (`aria-expanded`'ın işaretlemede eksik ya da
ters olması, güncellemede yazılmaması / ters / yanlış koşul, fazladan
`aria-pressed` ya da `role="tab"`, kapanış temizliğinin olmaması / korumasız /
yanlış korumalı / animasyonu beklemeden / içerik öğesini ya da yanlış öğeyi
silen / panel yokken patlayan, `requestId`'nin artırılmaması, açılış karesi
korumasının olmaması / ters / yetersiz, üç çağrı yerinden birinin silinmesi,
var olan korumaların (veri gelince kapalı panele yazmama, `transitionend`
hedefi ve özelliği, yedek zamanlayıcı, gövde yokken, ayet paneli kapalıyken)
bozulması, CSS'te `visibility`, yanlış alan adı), hepsi yakalandı; biri
(`aria-expanded`'ı `.active`'ten ayrı hesaplamak) davranışsal olarak eşdeğer,
onu yalnızca kaynak denetimi yakalıyor. Mutasyonsuz hâl 22 test dosyasının
hepsiyle geçiyor.

Sınır: jsdom'da düzen, geçiş ve erişilebilirlik ağacı yok; testler
`aria-expanded` işaretini ve metnin DOM'da olup olmadığını denetliyor,
ağaçtaki durum yukarıdaki gerçek Chromium ölçümünde görüldü. Gerçek ekran
okuyucu (NVDA/JAWS/VoiceOver/TalkBack) çalıştırılmadı: durum duyurusunun
("genişletildi") canlı bölgenin metin duyurusuyla nasıl birleştiği ya da ayrı
okunduğu, ve açılışta binlerce karakterlik bir metnin canlı bölgeden
okunmasının uygun olup olmadığı bilinmiyor (kontrol listesi, madde 4); Firefox
ve Safari'de denenmedi. Kapanınca metin DOM'dan kalktığı için kapalı bölümde
okunacak tefsir kalmıyor; her açılışta metin yeniden kuruluyor
(`resolveTafsirText` zaten her açılışta çalışıyordu), bir ekran okuyucunun
okuma konumunun buna nasıl tepki verdiği de denenmedi.

**Ayete ve sure başlığına klavye / ekran okuyucu erişimi (ayet gezgini).**
Sayfa tek bir `<svg>` (harfler `<path>`, üstünde görünmez bir metin katmanı)
olduğu için **ayet detay paneli** (kelime meali, meal, tefsir, konular) ile
**Sure Bilgisi** yalnızca bu SVG'ye gelen fare/dokunma `click`'iyle açılıyordu:
odaklanabilir bir öğe ve Enter/Space işleyicisi yoktu. Başsız Chromium'da
(1. sayfa) yamadan ÖNCE ölçülen durum: 430 px'te 6, 1200 px'te 9 Tab durağı
var ve hiçbiri sayfanın içeriğine (ayetlere, sure başlığına) gitmiyor
(1200 px'teki `.reader-scroll`, kaydırma kapsayıcısının kendisi); her
durağa Enter ve Space ile toplam 28 deneme yapıldı (430 px'te 12, 1200 px'te
16; kaydırma kapsayıcısı atlandı) ve ayet paneli de Sure Bilgisi de 0 kez
açıldı. Yani uygulamanın ana özelliğine klavyeyle ya da ekran okuyucuyla
ulaşılamıyordu.

`js/ayet-gezgini.js`, sayfayı yeniden çizmeden SVG'nin yanına kendi
erişilebilirlik ağacını ekliyor: `index.html`'deki `#ayah-nav`, görsel olarak
gizli (`.sr-only`), `aria-label="Sayfa gezgini"` taşıyan bir `<nav>`; içinde
o sayfadaki **her sure başlığı ve her ayet gerçek bir `<button>`** ("Sure
başlıkları" ve "Sayfadaki ayetler" listeleri; boş liste gizli, ekran okuyucu
"liste, 0 öğe" demesin). `showPage` bunları sayfa çizilince o sayfanın
verisinden kuruyor -- `state.currentPageSegments` ve SVG'deki
`.surah-header-hit` grupları, yani fareyle tıklanabilenlerle birebir aynı
küme --; liste değişmediyse yeniden kurmuyor (odak ve ekran okuyucu konumu
korunsun). `#ayah-nav`, `.reader-scroll`'dan ÖNCE geliyor: CSS'teki kardeş
seçicisi (`~`) buna dayanıyor.

- **Sure başlığı düğmeleri** ("Fâtiha Suresi hakkında bilgi") normal Tab
  durakları; Enter/Space -> Sure Bilgisi (`openSurahInfo`, fareyle aynı yol).
- **Ayet düğmeleri** ("Fâtiha Suresi, 3. ayet": sayfa geçişi anonsuyla aynı
  kalıp) **tek Tab durağı** (roving tabindex: seçili ayet `tabindex="0"`,
  ötekiler `-1`); yani sayfada 7 ya da 40 ayet olması Tab'ı uzatmıyor.
  Yukarı/Aşağı/Home/End ayetler arasında gezinir ve gezdiği ayeti **seçer**
  (sayfadaki vurgu taşınır; fareyle o ayete dokunmakla aynı `showPage` yolu,
  URL'ye yazmadan); uçlarda dönülmez, sayfa değişmez. `aria-current="true"`
  seçili ayeti, `aria-expanded` paneli açık ayeti işaretliyor. Enter/Space
  paneli açar/kapatır (`onAyahTextClick`, fareyle aynı yol).
- **Sol/Sağ ok sayfa çevirmeye devam ediyor** (belge düzeyindeki işleyici;
  gezgin bu tuşlara dokunmuyor). Shift/Ctrl/Alt/Meta ile birlikte basılan
  tuşlara ve başka bir işleyicinin zaten `preventDefault` ettiği olaylara da
  dokunmuyor (tarayıcı/ekran okuyucu kısayolları bozulmasın). Enter basılı
  tutulunca panelin saniyede onlarca kez açılıp kapanması engelleniyor.
- **Panel açılınca odak panele geçiyor** (`tabindex="-1"`; ekran okuyucu
  "Fâtiha 2 detayı, bölge" der). Tab panelin içindeki düğmelere gider;
  Escape ya da Kapat ile kapanınca odak o ayet düğmesine döner (eskiden
  `<body>`'ye düşerdi). Panel, açılış animasyonu bitince (`transitionend`;
  gelmezse 400 ms yedek) görünür alana kaydırılıyor. Panel fareyle
  açılırsa odağa dokunulmuyor.
- **Odak `<body>`'ye düşmüyor:** gezginde ya da panelde iken sayfa çevrilir
  veya panel kalkarsa odak aynı sure başlığına, yoksa yeni sayfanın seçili
  ayet düğmesine veriliyor. Gezgin Ezber çalışırken gizli (orada ayete
  dokunmak panel değil kelime açmak demek) ve "Bitir"den sonra geri geliyor;
  Oku'da kelime açmanın klavye yolu ayrı bir düğme (bkz. "Ezber > Oku'da
  klavye ve ekran okuyucu yolu").
- **Odak halkası gizli düğmenin değil, sayfadaki asıl yerin üstüne
  çiziliyor:** ayet düğmesindeyken seçili ayetin vurgusuna, sure başlığı
  düğmesindeyken başlığa 3 px zümrüt çerçeve (`vector-effect:
  non-scaling-stroke`: sayfa ölçeğinden bağımsız). Yalnızca `:focus-visible`
  iken (`#ayah-nav[data-kbd="ayah"|"surah"]`): fareyle "Kapat"a basınca odak
  programatik olarak ayet düğmesine geçse bile fare kullanıcısı halka
  görmez, sayfası da kaymaz. Odak gezgindeyken altta "↑ ↓ ayet seç · Enter
  ayrıntı · Esc kapat" ipucu çıkıyor (`aria-hidden`; ekran okuyucuya aynı
  bilgi `aria-describedby` ile okutuluyor). Odaklanan ayet/başlık görünür
  alanın dışındaysa `.reader-scroll` en az kaydırmayla ve 16 px boşlukla
  kaydırılıyor (`revealDelta`); pencereden uzun bir ayette ÜST kenar
  hizalanıyor.
- **Yeni canlı bölge eklenmedi:** seçim değişince anons yine
  `#nav-announcer`'dan geliyor (`showPage` -> `announceNavigation`); gezgin
  kendi içinde canlı bölge taşımıyor.

Aynı ölçüm yamalı sürümde (başsız Chromium, 1. sayfa, aynı sonda): Tab
durakları 430 px'te 6 -> 8, 1200 px'te 9 -> 11 (artı iki durak: sure başlığı
ve seçili ayet; Tab ile gezgine 430 px'te 4, 1200 px'te 5 basışta
varılıyor). Enter ve Space denemelerinde sure başlığı düğmesi Sure
Bilgisi'ni 2/2, seçili ayet düğmesi ayet panelini 2/2 açıyor (her iki
genişlikte; yamasızda 28 denemede 0). Uçtan uca akış üç görünümde
(430x900 1. sayfa, 430x520 2. sayfa, 1200x900 1. sayfa) çalıştırıldı ve
şunları doğruladı: Tab ile giriş (ilk durak sure başlığı, ikincisi seçili
ayet); ok tuşlarıyla seçim (her adımda tek `aria-current` ve tek Tab durağı,
adres çubuğu değişmiyor, anons "Sayfa 1, Fâtiha Suresi, 2. ayet"), uçlarda
dönmeme; Enter ile panel açılıyor, odak panelde, panelin başı görünür
alanda, Tab panelin içinde kalıyor, Escape ile kapanınca odak ayet
düğmesinde ve `aria-expanded` temizleniyor; Shift+Tab ile ayete dönüş;
başlıkta Enter -> Sure Bilgisi (odak modalın içinde), Escape ile odak başlık
düğmesine dönüyor, başlıktayken YALNIZCA başlıkta çerçeve var (ayet
vurgusunda yok: iki halka birden çıkmıyor); Sol/Sağ okla sayfa çevirirken (panel
açıkken de) odak gezginde kalıyor; fareyle akış eskisi gibi (panel açılıp
kapanıyor, odak `<body>`'de, `data-kbd` yok: halka ve ipucu çıkmıyor); 12 ok
basışında vurgunun ilk satırı hep görünür alanda, `.reader` ve belge
kaymıyor; Ezber çalışırken gezgin gizli, Tab içine girmiyor, "Bitir"den
sonra geri geliyor. Sayfa hatası: 0. Görünüm değişmedi: fareyle ulaşılan 9 durumun
(kapalı sayfa, panel açık, panel kapalı, Sure Bilgisi; 1., 2. ve 3. sayfa)
ekran görüntüleri 430 ve 1200 px'te yamasız sürümle piksel piksel aynı (18
görüntü çiftinde 0 piksel fark). Klavye halkası, ipucu ve panel odak
halkasının görünümü ayrıca ekran görüntüleriyle gözle incelendi.

`test/ayet_gezgini_test.mjs` (jsdom, 177 kontrol): `#ayah-nav` işaretlemesi
(nav + etiketler + gizli listeler + ipucu, `.reader-scroll`'dan önce gelmesi,
canlı bölge İÇERMEMESİ), CSS halka/ipucu kuralları, `sw.js` ön yüklemesi,
saf yardımcılar (`ayahsOnPage`, `surahsOfSvg`, `revealDelta`),
`createAyahNav`'ın GERÇEK `index.html` üzerinde davranışı (roving tabindex,
`aria-current`/`aria-expanded`, tuşlar ve dokunulmayan tuşlar, tıklama, sayfa
değişince odağın korunması, `restoreFocus`, `:focus-visible` işareti,
`onFocusTarget`; aynı numaralı iki ayetin (112:3 ve 113:3) karışmaması),
`app.js`'in `<ayah-nav>` bloğunun kaynaktan çıkarılıp gerçek denetleyiciyle
çalıştırılması (seçim -> `showPage`, başlık -> Sure Bilgisi, panel açılınca
odak + kaydırma, yalnızca klavye odağında halka/kaydırma, Ezber'de gizleme),
`showPage`/`openWordMeal`/`closeWordMeal`/`startEzberStudy`/`endEzberStudy`
içindeki çağrıların varlığı VE sırası (odağın DOM'dan kalkmadan ÖNCE
ölçülmesi gibi) ve axe-core yapısal taraması. Her parça tek tek bozularak
(modülde 59, `app.js`'te 40, `index.html`'de 11, CSS'te 10, `sw.js`'te 1 --
toplam 121 mutasyon) testlerin gerçekten kırıldığı doğrulandı.

Sınırlar ve kapsam dışı kalanlar: jsdom'da düzen, gerçek Tab gezintisi ve
`:focus-visible` sezgisi yok; yukarıdaki Chromium ölçümü bu açığı kapatıyor,
ama **gerçek bir ekran okuyucu (NVDA/JAWS/VoiceOver/TalkBack) çalıştırılmadı.**
Ok tuşlarıyla ayet değiştirirken ekran okuyucu hem odaklanan düğmenin adını
hem `#nav-announcer` anonsunu okuyabilir (çift okuma); şimdilik güvenli taraf
olarak ikisi de duruyor, gerçek cihazda duyup birini kaldırmak gerekebilir.
NVDA/JAWS "tarama modu"nda ok tuşlarını ekran okuyucu kendisi kullanır, yani
orada Yukarı/Aşağı ile seçim çalışmaz; sanal imleçle ayet düğmesine gelip
Enter'a basmanın paneli açması beklenir ama sınanmadı. Sayfa kenarında dönme
ya da sayfa geçişi yok (son ayette Aşağı hiçbir şey yapmaz; sayfa çevirme
Sol/Sağ okla). Ezber > Oku'da kelime açmanın, Ezber > Yaz'da harf yazmanın
klavye yolu artık var (bkz. "Ezber > Oku'da klavye ve ekran okuyucu yolu" ve
"Ezber > Yaz'da klavye ve ekran okuyucu yolu"). Sure Bilgisi'nden "Mushaf'a
Git" ile sayfa değişince odağın nereye indiği ölçüldü (bkz. "Sure Bilgisi'nde
bağlantı -> ayrıntı -> Geri" paragrafı): gezgin düğmesiyle açılmışsa gidilen
ayetin gezgin düğmesine iniyor; yalnızca SVG'deki başlığa fareyle/dokunarak
açılmışsa odak `<body>`'de kalıyor.

**Ezber > Oku'da klavye ve ekran okuyucu yolu.** Oku'da bir kelimeyi açmanın
tek yolu sayfadaki ayete dokunmaktı; sayfa tek bir `<svg>` olduğundan
klavyeyle ya da ekran okuyucuyla ulaşılabilecek hiçbir şey yoktu (WCAG 2.1.1)
ve açılan kelime hiçbir yerde duyurulmuyordu (4.1.3 bakımından da eksik).
Başsız Chromium'da (430 px, Fâtiha 1:1-2, oturum yalnızca klavyeyle
başlatıldı: Ezber, Enter, Oku sekmesi, aralık, Enter) yamadan ÖNCE ölçülen:

- oturum başlayınca odak açan düğmeye ("Bitir") dönüyordu; tam bir Tab turu
  yalnızca Cüz, Sayfa, Sure, Bitir, Oynat, Arama'ydı: sayfada hiçbir durak
  yoktu;
- gövdede Enter, Boşluk, Aşağı, Yukarı, PageDown ve End'e basınca açılan
  kelime sayısı 0 kalıyordu;
- fareyle bir kelime açınca `#nav-announcer` değişmiyor ve Türkçe karşılık
  baloncuğu hiç çıkmıyordu: Oku başlarken kelime meali verisi
  (`data/word-meal.json`) yalnızca Yaz için yükleniyordu; o sayfa oturumunda
  ayet paneli ya da arama açılmamışsa Oku'da bu dosya için ağ isteği sayısı
  0'dı;
- ses yüklenemeyince (çevrimdışı; ses isteği düşürülerek ölçüldü) bir ayet
  bitince oturum İKİ ayet ilerliyordu (1. ayet -> doğrudan 3. ayet): başarısız
  klip için hem `error` olayı hem `play()`'in reddi `onSettled`'ı çağırıyor,
  ikisi de korumadan geçiyordu. Bu hata klavye yolundan bağımsız (fareyle de,
  yamasız ağaçta da aynı) ama klavye yolu denenirken ortaya çıktı; aynı yamada
  düzeltildi.

Düzeltme (`index.html`, `css/style.css`, `js/app.js`):

- **`#ezber-reveal` "Sıradaki kelimeyi aç".** Alt çubukta Ezber/Bitir'den
  hemen sonra duran gerçek bir `<button>`; yalnızca Oku sürerken var, aksi
  hâlde `hidden` (oturum yokken ve Yaz'da Tab sırasında ve erişilebilirlik
  ağacında yok). Görsel olarak gizli (`.sr-only`); fareyle ve dokunmayla
  kullananlar için ekran değişmiyor. Klavyeyle odaklanınca (`:focus-visible`)
  alt çubuğun üstüne tam genişlikte, zümrüt zeminli beyaz yazılı (>= 4,5:1)
  bir çubuk olarak biniyor; odak halkası kapatılmıyor. `display` hiç verilmedi
  ki `hidden` ezilmesin (bkz. `.info-detail-back[hidden]` dersi). Görünen
  metin erişilebilir adla aynı (`aria-label` yok; WCAG 2.5.3).
- **Tek uygulama.** `ezberRevealNextWord()` kelime açmanın tek yeri: sayfadaki
  ayete dokunma (`onEzberStudyTap`) ve düğme aynı işlevi çağırıyor, ayrı ayrı
  sapamazlar. Oku değilse ya da ayet zaten tamamen açıksa (ayet okunuyor,
  sıradaki ayet yükleniyor) hiçbir şey yapmıyor.
- **Odak.** Oku başlayınca odak düğmeye geçiyor (modal kapanırken odak
  Ezber/Bitir'e eşzamanlı geri veriliyor; düğme bundan SONRA odaklanıyor),
  böylece Enter hemen ilk kelimeyi açıyor. Oturum bitince (son kelime, Bitir
  ya da ok tuşuyla sayfa çevirme) düğme gizleneceği için odak ondaysa Ezber
  düğmesine veriliyor; yoksa Chromium odağı `<body>`'ye düşürürdü. Odak başka
  yerdeyse (Oynat, Arama) dokunulmuyor.
- **Duyurular, hepsi `#nav-announcer` üstünden** (yeni canlı bölge yok; statik
  kabukta hâlâ tam 2 tane): oturum başında "Oku çalışması başladı" / "Yaz
  çalışması başladı"; Oku'da her ayette "Bu ayette N kelime var"; her açılışta
  "N. kelime: <Türkçe karşılık>" (ayetin son kelimesinde ". Ayet tamamlandı"
  ekleniyor); bitişte "Ezber çalışması bitti". Karşılık verisi henüz
  yüklenmediyse satır yalnızca "N. kelime". Duyurular bilerek yalnızca Türkçe
  (canlı bölge tek dilli): açılan Arapça kelimenin kendisi duyuruda yok,
  sayfanın metin katmanında (`lang="ar"`).
- **Veri ve ses.** Türkçe karşılık verisi artık Oku başlarken de yükleniyor
  (1,67 MB, gzip'le ≈ 0,5 MB; aynı dosya ayet panelinde ve aramada da
  kullanılıyor, servis worker ilk kullanımda önbelleğe alıyor); fareyle
  kullananlar da baloncuğu görüyor. Ses başarısızken ilerleme tek seferlik
  (`settled` bayrağı).

Aynı sahne yamadan SONRA (başsız Chromium; 430 px, ayrıca 1200 px):

- oturum başlarken odak `#ezber-reveal`'da ve `:focus-visible` eşleşiyor;
  düğme 430 px'te 406x31, 1200 px'te 1176x31, 52 px'lik alt çubuğun içinde;
  erişilebilirlik ağacında "Sıradaki kelimeyi aç" (button); Tab sırası Bitir
  -> düğme -> Oynat -> Arama (Shift+Tab tersi);
- Enter, Boşluk, Enter, Boşluk: dört kelime sırayla açılıyor, baloncuklar
  "adıyla", "Allah'ın", "Rahman", "Rahim"; her basışta odak düğmede; son
  kelimeden sonra ayet okunup 2. ayete geçiliyor ve odak yine düğmede; 2.
  ayetin sonunda oturum bitiyor, düğme gizleniyor, odak Ezber düğmesine
  dönüyor;
- duyuru zaman çizelgesi (ses isteği düşürülen koşu: ilerleme hemen oluyor, o
  yüzden aynı ~50 ms penceresindekiler tek metinde birleşiyor): "Oku çalışması
  başladı. Sayfa 1, Fâtiha Suresi, 1. ayet. Bu ayette 4 kelime var" -> "1.
  kelime: adıyla" -> "2. kelime: Allah'ın" -> "3. kelime: Rahman" -> "4.
  kelime: Rahim. Ayet tamamlandı. Sayfa 1, Fâtiha Suresi, 2. ayet. Bu ayette 4
  kelime var" -> ... -> "4. kelime: Alemlerin. Ayet tamamlandı. Ezber
  çalışması bitti";
- gerçek (sessiz, 1,5 sn'lik) bir klip servis edilince: klip çalarken düğmeye
  basmak etkisiz ve sessiz (0 yeni duyuru, kapak sayısı aynı); klip bitince 2.
  ayet açılıyor ve duyurular ayrı ayrı geliyor ("4. kelime: Rahim. Ayet
  tamamlandı", sonra "Sayfa 1, Fâtiha Suresi, 2. ayet. Bu ayette 4 kelime
  var");
- ok tuşuyla sayfa çevirince (mevcut davranış: oturum bitiyor) düğme
  gizleniyor, odak Ezber düğmesine gidiyor;
- fareyle başlatılan oturumda odak yine düğmeye geçiyor ama `:focus-visible`
  eşleşmiyor ve düğme 1x1 px: ekranda hiçbir şey çıkmıyor; fareyle kelime açma
  eskisi gibi çalışıyor (artık baloncuk ve duyuruyla);
- Yaz'da düğme gizli ve Tab sırasında yok; duyuru "Yaz çalışması başladı.
  Sayfa 1, Fâtiha Suresi, 1. ayet". Sayfa hatası: 0.

Görünüm: fareyle ulaşılan 7 durumun ekran görüntüleri 430 ve 1200 px'te (14
görüntü) yamasız sürümle piksel piksel aynı; karşılaştırma, kelime meali
verisinin yüklenme durumu eşitlenerek yapıldı (yamalı ağaçta veri isteği
düşürülerek, yamasızda önceden yüklenerek) -- tek bilinçli fark Oku'da artık
Türkçe karşılık baloncuğunun çıkması. Klavyeyle görünen çubuk ve odak halkası
ayrıca ekran görüntüsüyle gözle incelendi.

`test/ezber_klavye_test.mjs`'in Oku kısmı (jsdom, 78 kontrol): (1) `#ezber-reveal`
işaretlemesi, alt çubuktaki sırası ve Tab durakları; (2) CSS: `.sr-only`'nin
kırptığı HER özelliğin odak kuralında geri alındığı (liste `.sr-only`'den
türetiliyor: ileride yeni bir kırpma özelliği eklenirse test kırılır),
`display` olmadığı, halkanın kapatılmadığı, `.bottombar`'ın `position:
relative` olduğu, yazı/zemin kontrastı; (3) `app.js`'ten kaynaktan çıkarılan
GERÇEK işlevler (`ezberRevealNextWord`, `onEzberStudyTap`,
`ezberStudyGoToAyah`, `ezberStudyPlayAyahThenAdvance`, `startEzberStudy`,
`endEzberStudy`, `<announce>` bloğu) x gerçek `index.html`: dokunma ve
düğmenin aynı sonucu vermesi, duyuru metinleri ve birleşmeleri, ayet/oturum
bitince odak (Chromium'un gizlenen öğeden odağı düşürmesi taklit ediliyor),
ses başarısızken tek ilerleme, veri yükleme, tıklamaların HATA fırlatmaması;
(4) kaynak: tek uygulama, `main()`'den çağrı ve 70.539 Türkçe karşılığın
hiçbirinde Arapça harf olmadığı (duyuru tek dilli). Her parça tek tek
bozularak 45 mutasyonun hepsinin yakalandığı doğrulandı.

Sınırlar: jsdom'da düzen, odak halkası ve `:focus-visible` yok (yukarıdaki
ölçümler gerçek Chromium'da); **gerçek bir ekran okuyucu
(NVDA/JAWS/VoiceOver/TalkBack), Firefox ve Safari denenmedi.** Açılan Arapça
kelimenin kendisi duyuruda yok. Kapakların altındaki ayet metni, Oku'nun
klavye yolu eklendiğinde erişilebilirlik ağacında duruyordu (1. sayfada ağaçtaki
306 Arapça karakterin 280'i sayfa metni, 26'sı üst çubuktaki sure adı ve Oynat
düğmesinin etiketi; oturumdan önce de sırasında da aynı): kapaklar yalnızca
GÖRSEL bir örtüydü, ekran okuyucu kullanıcısı gizli kelimeleri sayfa
metninden duyabiliyordu. Bu, aşağıdaki "Ezber sırasında kapakların altındaki
metin erişilebilirlik ağacında değil" paragrafında giderildi; açılan Arapça
kelime de artık kapağı kalkınca sayfa metninde ağaca giriyor. Ayet okunmaya
başlayınca ekran okuyucu konuşması klibin üstüne binebilir. Klip çalarken
düğmeye basmak sessizce etkisiz. Yaz'ın klavye yolu bir sonraki paragrafta.

**Ezber > Yaz'da klavye ve ekran okuyucu yolu.** Yaz'ın girişi ekrandaki
Arapça klavye (`#yaz-keyboard`: 29 harf tuşu ve 💡, her biri ayrı Tab durağı).
Klavyeyle ulaşılabiliyordu ama kullanılamıyordu: geri bildirim yoktu, tuşların
adı ve grubu yoktu, ok tuşları oturumu bitiriyordu. Başsız Chromium'da (430
px, Fâtiha 1:1-2, oturum yalnızca klavyeyle başlatıldı) yamadan ÖNCE ölçülen:

- oturum başlayınca odak açan düğmeye ("Bitir") dönüyordu; Bitir'den ilk tuşa
  (ا) 3 Tab (Oynat, Arama, ا), "ب"ye 4, 💡'ye 32 Tab gerekiyordu;
- doğru harfe basınca harf açılıyordu ama HİÇBİR şey duyurulmuyordu; yanlış
  harfe basınca da hiçbir şey olmuyordu (ne görsel ne duyuru): ekran okuyucu
  kullanıcısı "tuş çalışmadı mı, yanlış harf miydi?" ayırt edemiyordu. 💡 ipucu
  metni canlı bölge olmayan bir `<p>`'de görünüyor ama duyulmuyordu. İki
  ayetin tamamı için (36 harf; her harfi bulmak için tuş taramasında toplam
  544 yanlış basış) oturum boyunca yalnızca iki duyuru vardı: "Sayfa 1, Fâtiha
  Suresi, 2. ayet" ve "Ezber çalışması bitti";
- `#yaz-keyboard` erişilebilirlik ağacında adsız bir "generic" öğeydi;
  tuşların adı yalnızca Arapça harfti ("ب"): Arapça sesi olmayan bir ekran
  okuyucu bunları söyleyemez;
- gerçek Arapça düzenli klavyede bir harfe basmak (`keydown`, `key` "ب",
  `code` KeyF, hedef `<body>`) hiçbir şey yapmıyordu: her harf için o tuşa Tab
  ile gitmek gerekiyordu;
- odak bir tuştayken Sağ ok sayfayı çevirip oturumu BİTİRİYORDU (1 -> 604),
  Sol ok da (1 -> 2): `setupNav`'ın `document`'teki sayfa çevirme dinleyicisi
  ok tuşlarına ayrıca tepki veriyor. Yukarı/Aşağı hiçbir şey yapmıyordu. Ekran
  klavyesinde ok tuşuna basan oturumunu kaybediyordu;
- oturum odak bir tuştayken biterse (son harf) klavye gizleniyor ve odak
  `<body>`'ye düşüyordu.

Düzeltme (`index.html`, `js/app.js`; CSS'e dokunulmadı):

- **Duyurular**, hepsi `#nav-announcer` üstünden (yeni canlı bölge yok; statik
  kabukta hâlâ tam 2 tane): her ayette "Bu ayette N harf var" (Oku'daki "N
  kelime var"ın karşılığı; oturum başında ve her sonraki ayette, konum
  duyurusuyla aynı pencerede tek metin); doğru harfte "Doğru", kelimenin son
  harfinde "Doğru. Kelime tamamlandı", ayetin son harfinde "Doğru. Ayet
  tamamlandı"; yanlış harfte "Bu harf değil"; 💡'de "İpucu: <karşılık>"
  (karşılık yoksa "İpucu: anlam bulunamadı"), kapatınca "İpucu kapatıldı".
  Açılan harfin kendisi söylenmiyor (kullanıcı az önce tuşun adını duydu;
  canlı bölge tek dilli). Hızlı art arda basışlarda yalnızca SON geri bildirim
  söyleniyor (aynı anahtar, ~50 ms birleştirme; Oku'daki gibi).
- **Adlar.** Klavye `role="group"` + `aria-label="Arapça harf klavyesi"`; her
  harf tuşunun adı görünen Arapça harf + Türkçe okunuşu, ör. "ب be" (düğmede
  `lang="ar"`, okunuş `.sr-only` + `lang="tr"` bir `<span>`): görünen harf ada
  dahil (WCAG 2.5.3) ve Arapça sesi olmayan okuyucu da tuşu söyleyebiliyor. 29
  ad: elif, be, te, se, cim, ha, hı, dal, zel, ra, ze, sin, şın, sad, dad, tı,
  zı, ayn, gayn, fe, kaf, kef, lam, mim, nun, he, vav, ye, hemze. 💡'nin adı
  değişmedi.
- **Gerçek klavyeyle yazma** (`onEzberYazPhysicalKey`). Arapça klavye düzeni
  açıkken basılan Arapça harf, ekran tuşuna basmakla AYNI işi yapıyor
  (`handleEzberYazKeyPress`, eşleştirmenin tek yeri): her harf için Tab yerine
  tek basış. Tek tuşta iki harf veren "لا" sırayla işleniyor; tatweel ve
  harekeler harf değil. Yalnızca Yaz sürerken, modal kapalıyken ve giriş
  alanında (input, textarea, select, contenteditable) değilken;
  Ctrl/Alt/Meta'lı basışlar, tuş tekrarı ve IME bileşimi yok sayılıyor.
  İşlenen tuşun varsayılan eylemi iptal ediliyor.
- **Oklar** (`onEzberYazKeyboardKeydown`). Sol/Sağ DOM sırasındaki
  önceki/sonraki tuş (satır sonundan sonraki satıra geçiyor), Yukarı/Aşağı
  alt/üst satırda aynı sütun; uçlarda duruyor (dönmüyor). Olay burada
  tüketiliyor (`preventDefault` + `stopPropagation`): sayfa çevirme
  dinleyicisi hiç görmüyor. Tab davranışı değişmedi: 30 tuşun hepsi hâlâ ayrı
  Tab durağı, oklar ek bir kısayol. Değiştiricili oklar (Shift/Ctrl/Alt/Meta;
  Alt+Sol tarayıcının Geri'si) tüketilmiyor.
- **Odak.** Yaz başlayınca odak ilk tuşa (ا: alfabe sırasının ilki, cevabı ele
  vermiyor) geçiyor (modal kapanırken odak Ezber/Bitir'e eşzamanlı geri
  veriliyor; tuş bundan SONRA odaklanıyor). Oturum bitince (son harf) odak
  klavyedeyse (bir tuş ya da 💡) Ezber düğmesine veriliyor; yoksa klavye
  gizlenince Chromium odağı `<body>`'ye düşürürdü. Odak, Oku'nun düğmesi ve
  Yaz klavyesi için gizlemeden ÖNCE tek bir ölçümle (`focusInSession`)
  belirleniyor; odak başka yerdeyse (Oynat, Arama) dokunulmuyor.

Aynı sahne yamadan SONRA (başsız Chromium; 430 px):

- oturum başlarken odak ilk tuşta (ا) ve `:focus-visible` eşleşiyor (altın 2
  px halka; 430 ve 1200 px'te ekran görüntüsüyle gözle incelendi,
  kırpılmıyor). Erişilebilirlik ağacında klavye "Arapça harf klavyesi"
  (group), tuşlar "ا elif", "ب be", "ش şın", "ء hemze" (button), 💡 "İpucu:
  kelimenin Türkçe anlamı". Duyuru: "Yaz çalışması başladı. Sayfa 1, Fâtiha
  Suresi, 1. ayet. Bu ayette 19 harf var". İlk tuştan 💡'ye 29 Tab (30 tuşun
  hepsi hâlâ ayrı durak); ilk tuşta Shift+Tab "Arama"ya gidiyor;
- fareyle başlatılan oturumda odak yine ilk tuşa geçiyor ama `:focus-visible`
  eşleşmiyor (ekranda halka yok); fareyle bir tuşa tıklayınca da eşleşmiyor;
- oklar: ا'dan Sağ, Sağ, Aşağı, Aşağı, Aşağı, Yukarı, Sol, Sol, Sol, Yukarı,
  Yukarı, Sol -> odak sırayla ب, ت, ش, ل, ل (son satırda duruyor), ش, س, ز, ر
  (önceki satırın sonu), ر, ر (ilk satırda duruyor), ذ; her adımda sayfa 1'de
  kalıyor, düğme "Bitir" olarak duruyor, kaydırma 0, duyuru 0. 10. Sağ basış
  ilk satırdan ikinci satırın ilk tuşuna (ز) geçiriyor. Klavyenin DIŞINDA
  (odak gövdede) Sağ ok eskisi gibi sayfayı çevirip oturumu bitiriyor (1 ->
  604; bu yamada dokunulmadı);
- gerçek (CDP) Arapça düzenli tuş olayları: ب -> "Doğru", ت (yanlış) -> "Bu
  harf değil", س -> "Doğru", م -> "Doğru. Kelime tamamlandı"; doğru harflerde
  bir kapak kalkıyor, yanlışta hiçbiri; dört Arapça harfin hepsinde
  `defaultPrevented` true; Latin "b", "1" ve Ctrl+ا yok sayılıyor (duyuru yok,
  varsayılan eylem iptal edilmiyor). 💡'ye Enter: "İpucu: Allah'ın" (ilk kelime
  bitmişti, ikinci kelimenin karşılığı), yine Enter: "İpucu kapatıldı";
- iki ayetin tamamı fiziksel tuşlarla (36 harf; ses isteği düşürüldü): 36
  duyuru, "Doğru" 28, "Doğru. Kelime tamamlandı" 6; ayet sonları "Doğru. Ayet
  tamamlandı. Sayfa 1, Fâtiha Suresi, 2. ayet. Bu ayette 17 harf var" (ses
  hemen hata verdiği için aynı ~50 ms penceresinde tek metin) ve "Doğru. Ayet
  tamamlandı. Ezber çalışması bitti"; 1. ayetten sonra odak ilk tuşta kalıyor;
  oturum bitince klavye gizleniyor ve odak Ezber düğmesinde (`:focus-visible`
  eşleşiyor). Sayfa hatası: 0;
- Yaz sürerken Arama modalına Arapça yazmak: "بسم" giriş alanına gidiyor,
  kapak açılmıyor, Yaz duyurusu yok, tuşların varsayılan eylemi iptal
  edilmiyor; Esc ile kapanınca odak Arama düğmesine dönüyor ve fiziksel yazma
  yeniden çalışıyor ("Doğru").

Görünüm: fareyle ulaşılan 10 durumun (Yaz: açılış, Ezber penceresi, başladı,
üç harf açık, ipucu, yanlış tuş, bitti; Oku: başladı, iki kelime açık, bitti)
ekran görüntüleri 430 ve 1200 px'te (20 görüntü) yamasız sürümle bayt bayt
aynı; yani her tuşa eklenen `.sr-only` okunuş düzeni kaydırmıyor ve fareyle
başlatmada ilk tuşa verilen odak halka çizmiyor. İpucu metninin kararlı olması
için kelime meali verisi iki ağaçta da önceden yüklendi.

`test/ezber_klavye_test.mjs`'in Yaz kısmı (aynı dosya; 83 yeni kontrol, toplam
161, ≈ 8 sn): (1) klavye işaretlemesi: grup adı, 3 satır x 10 tuş, 29 harf
tuşunun her birinde harf + Türkçe okunuş (okunuşlar testte ayrı bir tabloda:
işaretlemedeki bir yazım hatası testi kırar), 💡'nin adı, 30 Tab durağı,
klavyenin alt çubuktan SONRA gelmesi; (3) `app.js`'ten çıkarılan GERÇEK
işlevler x gerçek `index.html`: her sonucun tam duyuru metni (7 harflik bir
ayetin her harfi ayrı ayrı), hızlı art arda basışların birleşmesi, 8 yazım
varyantı, 💡 (açma/kapama/karşılık yok/hedef yok/Oku/oturum yok), fiziksel tuş
(29 harfin hepsi ve varyantlar kabul; 20 tür tuş yok sayılıyor: Latin harf,
rakam, Enter, Tab, ok, tatweel, harake, Ctrl/Alt/Meta'lı, tekrar, IME; 8
bağlamda yok sayılıyor: Oku, oturum yok, modal açık, önceden iptal edilmiş
olay, input/textarea/select/contenteditable), oklar (4 yön, uçlar, satır
geçişi, kısa satırda sütun kıskacı, 16 değiştiricili ok ve 10 ok olmayan tuş
tüketilmiyor, ok olayı `document`'e ULAŞMIYOR), odak (başlangıç, bitiş, Yaz
<-> Oku geçişleri, uçtan uca son harf); (4) kaynak: odağın gizlemeden önce
ölçülmesi, ilk tuşa odağın klavye görünür olduktan sonra verilmesi,
dinleyicilerin bağlanması, eşleştirmenin tek yeri. Her parça tek tek bozularak
141 mutasyonun (47'si Oku ve ortak kod, 94'ü Yaz) hepsinin yakalandığı
doğrulandı; ilk koşuda tek zayıf nokta çıktı (oturum yokken
`handleEzberYazKeyPress` fırlatırsa test yalnızca çöküyordu, açık bir FAIL
yazmıyordu) ve `try/catch` ile bir kontrole bağlandı.

Sınırlar: jsdom'da düzen, odak halkası ve `:focus-visible` yok (yukarıdaki
ölçümler gerçek Chromium'da); **gerçek bir ekran okuyucu
(NVDA/JAWS/VoiceOver/TalkBack), Firefox ve Safari denenmedi.** Duyuru
metinleri ve 29 Türkçe harf okunuşu bir cihazda dinlenmedi; yazımlar ("şın",
"hı", "tı", "zı"...) ve "Doğru" / "Bu harf değil" ifadesi gözden geçirilmeli.
Gerçek klavyeyle yazma yalnızca Arapça klavye düzeniyle çalışıyor (`e.key`
harfin kendisi olunca); Latin harften Arapça'ya sesli bir eşleme (b -> ب gibi)
yok: birçok harf için belirsiz, ayrı bir tasarım kararı. NVDA/JAWS'ın göz atma
kipinde harf ve ok tuşlarını okuyucunun kendisinin tüketmesi beklenir (bilinen
davranış, burada denenmedi); orada Tab + Enter yolu geçerli olmalı. Açılan
harfin kendisi duyurulmuyor; kapakların altındaki metin, Yaz'ın klavye yolu
eklendiğinde erişilebilirlik ağacında duruyordu (Oku'daki gibi); bu, sonraki
paragrafta giderildi. Ayet okunurken (son harften sonraki klip) tuşlar sessiz ve
etkisiz. 💡 ipucu açıkken kelime ya da ayet değişirse metin eski kelimenin
karşılığında kalıyor (yamadan önce de böyleydi, değiştirilmedi); kelime meali
verisi henüz yüklenmediyse 💡 "anlam bulunamadı" diyor.

**Ezber sırasında kapakların altındaki metin erişilebilirlik ağacında
değil.** Oku ve Yaz'ın kapakları yalnızca GÖRSEL bir örtüydü: kelimeyi örten
dikdörtgen, görünmez metin katmanının (yukarıdaki paragraf) ÜSTÜNE SVG'de
çiziliyor, katmanın kendisi ise erişilebilirlik ağacında tam metin olarak
duruyordu. Ekran okuyucu kullanıcısı açılmamış kelimeleri sayfa metninden
okuyabiliyordu; yani Oku'da "bir kelime aç" ile Yaz'da "Doğru" / "Bu harf
değil" geri bildiriminin (yukarıdaki iki bölüm) anlamı kalmıyordu: ezberlenmek
istenen metin zaten ağaçtaydı. Başsız Chromium'da (CDP
`Accessibility.getFullAXTree`; ağaçtaki görünür her Arapça metin düğümü
DOM'daki satırına ve kelimesine bağlandı; 1. sayfa, 430 ve 1200 px) yamadan
ÖNCE ölçülen: Oku 1:1-3 ve Yaz 1:1-2 oturumlarının 11 durumunun (oturum yok,
başladı, kelime/harf açılırken, ayet geçişi, Bitir) HEPSİNDE sayfanın 280
Arapça karakterinin (boşluksuz) 280'i ağaçtaydı; kapak sayısı Oku'da 12'ye,
Yaz'da 36'ya çıkarken bile.

Düzeltme (`js/render.js`, `js/app.js`; CSS ve `index.html`'e dokunulmadı):

- **Kelime kelime metin katmanı** (`addTextSelectionLayer`). Ayet satırı artık
  tek bir metin düğümü değil, kelime başına bir
  `<span class="text-layer-word" data-word-id="N">` (N, mushaf verisindeki
  kelime kimliği; ayet sonu işareti ayrı bir kelime). Kelimeler arası boşluk
  soldaki kelimenin span'ının sonunda: gizlenen kelime boşluğunu da götürüyor,
  ağaçta boşluktan ibaret düğüm kalmıyor (ilk denemede, boşluk ayrı bir
  düğümken, 1. sayfada 29 tane vardı). Besmele satırı ve kelime listesi satır
  metniyle uyuşmayan satırlar eskisi gibi düz metin. `render.js` hiçbir şeyi
  gizlemiyor; span'lar `class` ve `data-word-id` dışında bir şey (stil,
  `lang`, rol) taşımıyor.
- **Gizleme, kapakla aynı işlevde ve aynı veriden** (`drawEzberCovers` ->
  `syncEzberTextLayer`). Kapakları çizen işlev, kapağı olan her kelimenin
  span'ına `aria-hidden="true"` koyuyor, kapağı kalkanınkini kaldırıyor; ikisi
  aynı `coverDefs` listesinden türediği için birbirinden ayrışamaz. Oku'da
  gizli olanlar: geçerli ayetin henüz açılmamış kelimeleri ve sırası
  gelmemiş ayetlerin tüm kelimeleri (ayet sonu işaretleri dahil); geçerli
  ayetin işareti ve aralık dışındaki ayetler açık. Yaz'da bir kelime son harfi
  açılana kadar gizli (yarım bir kelime ağaçta anlamsız olurdu); ayet sonu
  işaretlerinin Yaz'da kapağı yok, ağaçta kalıyorlar. Oturum bitince
  (`endEzberStudy` -> `drawEzberCovers(svg, [])`) kapaklarla birlikte tüm
  işaretler kalkıyor. `display`, `visibility`, `inert` ya da `pointer-events`
  kullanılmadı: görünüm, fare, seçim ve kopyalama aynı kalmalıydı.
- **Duyuru metinleri değişmedi.** Açılan Arapça kelimenin kendisi
  `#nav-announcer`'da yine yok (canlı bölge tek dilli); ama kapağı kalkınca
  sayfa metninde (`lang="ar"`) ağaca giriyor, ekran okuyucu kullanıcısı onu
  sayfadan okuyabiliyor.

Aynı ölçüm yamadan SONRA (1. sayfanın 280 karakterinden ağaçtakiler; 430 ve
1200 px'te aynı):

- Oku 1:1-3: başlarken 185 (12 kelime gizli: 95 karakter ağaçtan çıktı; 1.
  ayetin işareti ağaçta), 1 kelime açılınca 191, 2 kelime açılınca 198, 1.
  ayet bitip 2. ayete geçilince 222, Bitir'den sonra 280;
- Yaz 1:1-2: başlarken 211 (8 kelime gizli), 1. kelimenin 3 harfinden 2'si
  yazılınca hâlâ 211, kelime tamamlanınca 217, sonraki kelimenin 1. harfi
  yazılınca 217, Bitir'den sonra 280 (oturum yokken de 280);
- hiçbir durumda boşluktan ibaret erişilebilirlik düğümü yok; sayfa hatası 0.

Görünüm ve davranış (aynı protokoller yamasız ve yamalı ağaçta, gerçek
Chromium):

- fareyle ulaşılan 10 durumun (Yaz: açılış, Ezber penceresi, başladı, üç harf
  açık, ipucu, yanlış tuş, bitti; Oku: başladı, iki kelime açık, bitti) ekran
  görüntüleri 430 ve 1200 px'te (20 görüntü) bayt bayt aynı; Oku ve Yaz'ın
  önceki yamalarda belgelenen klavye / duyuru ölçüm akışlarının (Tab, Enter,
  Boşluk, oklar, Arapça düzenli tuş olayları, duyuru zaman çizelgesi, odak)
  çıktıları da bayt bayt aynı;
- seçim ve kopyalama (1. ve 3. sayfa, 430 ve 1200 px): tüm metin seçilince
  seçilen metin birebir aynı (315 ve 1247 karakter) ve seçimin birleşik
  sınırı aynı; ilk üç satırın her kelimesine çift tıklama (1. sayfada 17, 3.
  sayfada 27 kelime), üç tıklamayla satır seçimi, `selection.modify` ile kelime
  kelime genişletme ve Ctrl+C'nin panoya yazdığı metin yamasız sürümle aynı. İki
  ölçülebilir fark var: `Range.getClientRects()` artık daha çok dikdörtgen
  döndürüyor (1. sayfada 30 -> 52, 3. sayfada 64 -> 176) ve tüm metin
  seçiliyken seçim vurgusunda kelime sınırlarında 1 piksel genişliğinde,
  kanal başına en fazla 6/255'lik çok silik dikişler çıkıyor (dört ekran
  görüntüsünde 662 - 3743 piksel, %0,13 - %0,94). Tam sayfa görüntüde (430
  px, 3. sayfa) gözle seçilemiyor; 5 kat büyütülmüş bir kırpmada çok silik
  dikey çizgiler olarak görünüyor. Yine de "değişmedi" demiyorum;
- tam tarama (604 sayfa): 8.932 metin katmanı satırının hepsi gerçek metni
  taşıyor, 83.668 kelime span'ı (77.432 kelime + 6.236 ayet sonu işareti)
  beklenen kimlik ve metinle doğrulandı, sorun 0. Testin raporladığı render
  süresi 65,6 -> 71,1 sn, testin duvar saati 66,3 -> 71,9 sn (≈ %8: kelime
  başına bir DOM düğümü daha);
- sayfa kurma süresi (gerçek Chromium, 430 px). Metin katmanı kurulumu tek
  başına, gerçek `render.js` / CSS / `mushaf.json` satırlarıyla, düz metin ve
  kelime kelime yolları dönüşümlü bloklarla ölçüldü (4 sayfa, 13-15 ayet
  satırı, 138-167 kelime; 3 koşu): sayfa başına kurulum 0,10-0,16 -> 0,30-0,40
  ms, yerleşim dahil 2,4-3,4 -> 3,3-4,8 ms (fark +0,5 ile +1,7 ms; sayfada
  112-167 ek DOM düğümü, ≈ %10). Uçtan uca (24 uzak sayfaya atlayınca sayfanın
  DOM'a girme süresi; yamasız ve yamalı ağaç dönüşümlü, 4'er koşu): medyan 59,3
  -> 62,1 ms, ortalama 63,3 -> 64,9 ms; koşular arası dalgalanma (koşu medyanı
  56-69 ms) bu farktan büyük, yani fark ölçülebilir ama küçük (≈ %2-5, sayfa
  başına ≈ 3 ms) ve algılanır bir yavaşlama değil.

`test/ezber_metin_katmani_test.mjs` (yeni; jsdom, 37 kontrol, ≈ 5 sn):
`app.js`'ten kaynaktan çıkarılan GERÇEK `drawEzberCovers`,
`syncEzberTextLayer`, `ezberRenderCoverState` ve `ezberWordIsUpcoming` x
gerçek `render.js` ile gerçek `data/mushaf.json` sayfalarından çizilen
SVG'ler (1. sayfa Fâtiha; Bakara'nın 3. ve 4. sayfası: satırlar ayet
sınırlarını aşıyor). Oku ve Yaz oturumlarının HER adımında üç şey birbirinden
bağımsız hesaplanıp karşılaştırılıyor: `aria-hidden` taşıyan kelimeler,
"neyin kapalı olması gerekir" kestirimi ve çizilen kapak dikdörtgenlerinin
(merkezlerinin) üstünde durduğu kelimeler; ağaçta kalan satır metni yalnızca
kapaksız kelimeler; SVG'de başka hiçbir değişiklik yok. Ayrıca: Yaz'da her
kelime TAM son harf birimi açıldığı adımda geri geliyor (ondan önce değil,
sonra değil); oturum bitince ya da yarıda bırakılınca SVG oturumdan önceki
hâliyle BAYT BAYT aynı; oturum iki sayfaya yayılınca (Oku ve Yaz, 3. -> 4.
sayfa, 15-17. ayetler) sayfadan çıkarken eski sayfada kapak da işaret de
kalmıyor; kapak katmanı olmayan SVG'de ve kimliksiz span'larda işlev
çökmüyor; kaynak korumaları (`render.js` `aria-hidden` yazmıyor, `app.js`
yalnızca `.text-layer-word`'e yazıyor ve gizlemeyi `inert` / `display` ile
yapmıyor, ayet satırı kelimelerle, besmele kelimesiz çağrılıyor).
`test/erisilebilirlik_test.mjs`'e 18 kontrol eklendi (194 -> 212: gerçek
`addTextSelectionLayer(..., words)`: span sayısı ve sırası, kimlikler, boşluk
kuralı, `lang` / `dir` / stil / rol yok, uyuşmayan kelime listesinde düz
metne düşüş, `render.js`'in hiçbir şeyi gizlememesi),
`test/full_corpus_test.mjs`'e 2 kontrol (15 -> 17: yukarıdaki tarama) ve
`test/ezber_klavye_test.mjs`'e 1 kontrol (161 -> 162: oturum bitince
`drawEzberCovers(geçerli sayfanın SVG'si, [])` tam bir kez). Her parça tek
tek bozularak 30 mutasyonun (14'ü `render.js`, 16'sı `app.js`: kimlik
verilmemesi, boşluğun düşmesi ya da span dışına çıkması, işaretin ters ya da
yanlış kelimeye verilmesi, işaretlerin hiç kaldırılmaması,
`aria-hidden="false"`, `inert`, Yaz'da yarım kelimenin gizlenmemesi, sırası
gelmemiş ayetlerin açık kalması, aralık sonunun aşılması, oturum sonunda
temizlik yapılmaması...) hepsinin yakalandığı doğrulandı; `render.js`
mutasyonlarından tam taramayla da denenen 8'inde tam tarama testi de,
bağımsız olarak, kırıldı. İlk koşuda tek zayıf nokta çıktı (oturum sonundaki
temizliği silen mutasyon hiçbir testi kırmıyordu) ve `ezber_klavye_test`'e bir
kontrol eklendi.

Sınırlar: jsdom'da erişilebilirlik ağacı yok; testler `aria-hidden`
İŞARETİNİ sınıyor, ağaçtan çıkıp çıkmadığı yalnızca yukarıdaki Chromium
ölçümünde görüldü. **Gerçek bir ekran okuyucu (NVDA/JAWS/VoiceOver/TalkBack),
Firefox ve Safari denenmedi**; NVDA/JAWS'ın göz atma kipi arabelleğinin bir
oturum sırasında `aria-hidden` değişimlerini nasıl yansıttığı (arabellek
yenileniyor mu, imleç kayıyor mu) bilinmiyor. Yaz'da bir kelime son harfi
açılana kadar sayfa metninde yok; Oku'da sırası gelmemiş ayetlerin işaretleri
de gizli, geçerli ayetin işareti ve Yaz'daki tüm işaretler okunabilir.
Oturum sürerken ekran okuyucu kullanıcısı kapalı kelimeleri sayfadan tekrar
okuyamaz (Bitir'den sonra okuyabilir). Kapakların altındaki metin görenler
için hâlâ seçilip kopyalanabiliyor (eskiden de öyleydi, değiştirilmedi).
Yukarıdaki silik seçim dikişleri sürüyor. Sayfa kurma süresi bir telefonda
ölçülmedi (yukarıdaki ölçümler 2 çekirdekli bir sandbox'ta başsız
Chromium'da). Ölçüm sırasında, bu değişiklikle ilgisiz bir tasarım özelliği
görüldü (Oku'nun klavye yolundan beri böyle): Oku'da `#ezber-reveal`
klavyeyle odaktayken alt çubuğun TAMAMINI örtüyor, o durumda fareyle
"Bitir"e tıklamak o düğmeye düşüyor.

**Renk kontrastı ve odak göstergesi.** Başsız Chromium'da (430 ve 1200 px)
axe-core'un `color-contrast` kuralı ve arka planı katman katman birleştiren
(yarı saydam dolguları üst üste bindiren) elle bir denetim 17 durumda
çalıştırıldı: açılış, yedi modalın hepsi (sure, cüz, sayfa, Ezber, arama, konu,
Sure Bilgisi -- sonuncusu Fâtiha ve Bakara için), ayet paneli (kelime meali,
tefsir; tefsirin renkli parçaları için ayrıca sentetik bir blok), ayet
gezgininin klavye ipucu, çalarken, 2. ve 3. sayfa.
Yamadan ÖNCE axe 430 px'te 5, 1200 px'te 10 ihlal buldu; elle denetim 1.844 /
1.830 metin öğesinin 23 / 22'sini WCAG 1.4.3'ün 4,5:1 eşiğinin altında buldu;
alt rüku rakamları (SVG yolları: ne axe ne elle denetim bunları görür, dolgu
rengi ayrıca ölçüldü) `--paper` üzerinde 2,95:1'di. Şimdi iki genişlikte de üç
denetimde 0 ihlal (axe'in "belirsiz" bıraktıkları -- çoğu görünmez metin
katmanı satırları, yani şeffaf yazı, kontrast uygulanmaz -- elle denetimle
ayrıca ölçüldü). Düzeltmeler (WCAG göreli parlaklığıyla; önce -> sonra):

- **Altın bağlantı metni** (Sure Bilgisi'nde `.info-section-content a` ve
  `.info-intro a`; konu açıklamalarındaki `<topic>` bağlantıları): `--gold`
  #a9812e, `--shell-bg` üzerinde 3,26:1 -> yeni `--gold-deep` #816223: 5,16:1.
- **"Ontoloji" rozeti:** beyaz yazı / `--gold` dolgu 3,58:1 -> `--gold-deep`
  dolgu 5,67:1.
- **Çalarken Oynat düğmesi** (`.playing`; etiket rengi `--shell-bg`): `--gold`
  dolgu 3,26:1 -> `--gold-deep` 5,16:1.
- **Alt rüku rakamları** (`.ayah-num-alt`): `--gold` / `--paper` 2,95:1 ->
  `--gold-deep` 4,67:1.
- **Tefsirin satır içi renkleri** (`tafsir-saadi.json`'da yaklaşık 7 bin yeşil,
  18,8 bin kahve, 6,5 bin mavi parça; 1.738 `.translation` bloğunun
  1.292'sinde renkli parça var): yazı iki zeminde okunuyor, panel gövdesi ve
  üstündeki `.translation` bloğu; ikisinde de ölçüldü (panel / blok): yeşil
  #3f7a52 4,29 / 3,90:1 -> #386d49 5,12 / 4,65:1; kahve #8a5a2f 4,93 / 4,48:1
  -> #86582e 5,12 / 4,66:1; mavi #2f5f8a zaten yeterli (5,65 / 5,14:1),
  değişmedi.
- **Ezber alanlarının odağı:** aşağıda.

Kararlar:

- **`--gold-deep` yeni bir token; `--gold`'un yerine geçmiyor.** Aynı tonun
  koyusu (ton farkı <= 6°, testte denetleniyor). `--gold` ve `--gold-soft`
  kenarlık, odak halkası, ayet vurgusu gibi metin olmayan yerlerde kalıyor;
  test onların bir metin rengi ya da yazı taşıyan dolgu olmasını yasaklıyor,
  yani yarın eklenecek bir "altın yazı" kendiliğinden yakalanır.
- **Bu yama GÖRÜNÜR bir değişiklik.** Bağlantılar, rozet, çalan düğme ve alt
  rüku rakamları eskisinden koyu bir bronz altın; tefsirde yeşil ve kahve
  hafifçe koyulaştı (en çok 13/255 kanal farkı). Tek commit; beğenilmezse
  `git revert` yeter.
- **Ödünleşme: alt rüku rakamı.** Rakam artık okunuyor ama sayfanın
  mürekkebinden ayrışması azaldı: `--ink`'e karşı oran 4,50:1 -> 2,84:1,
  parlaklık oranı yaklaşık 16 kat -> 9 kat. "Bronz" ile "siyaha yakın" ayrımı
  hâlâ var (ekran görüntüsünde gözle incelendi) ama eskisi kadar keskin değil;
  yalnızca `.ayah-num-alt` satırı `--gold`'a döndürülürse okunabilirlik
  2,95:1'e geri düşer.

**Ezber alanlarında odak halkası.** `.ezber-field select:focus` ve
`input[type="number"]:focus` kuralları `outline: none` taşıyordu; odağı
yalnızca kenarlık rengi gösteriyordu (`--gold-soft`, beyaz alanda 2,40:1).
Başsız Chromium'da gerçek Tab tuşuyla, 9 alanın her biri için (Dinle 5, Oku 2,
Yaz 2; 430 ve 1200 px) ölçüldü: önce hesaplanan `outline` yok; odaklı kenarlık
odaksıza göre 1,89:1, modal zeminine göre 2,18:1 (WCAG 1.4.11: en az 3:1). Şimdi
`outline: none` kalktı, genel `select/input:focus-visible` kuralı (2px düz
`--gold`, 2px aralıklı) geçerli: halka / modal zemini 3,26:1; `:focus-visible`
9/9 alanda eşleşiyor, sayfa hatası 0. Odaksız alanların görünümü 18 görüntü
çiftinde piksel piksel aynı; yalnızca odaklı hâl değişti.

`test/erisilebilirlik_test.mjs`'e 42 kontrol eklendi (145 -> 187). Oranlar elle
yazılmış sayılarla değil CSS'in kendisinden hesaplanıyor (token'lar,
`color-mix`, aynı seçicide son bildirimin kazanması): `--gold-deep`'in
zeminlerde ve dolgularda >= 4,5:1 olması ve `--gold` ile aynı tonda kalması;
altı kullanım yerinin (üç bağlantı, rozet, çalan düğme, alt rüku rakamı)
`--gold-deep`'e bağlı olması; tefsir yeşil/kahve/mavisinin panel ve
`.translation` zeminlerinde >= 4,5:1 olması; `--gold` / `--gold-soft` / düz
hex'in hiçbir `color:` değerinde ve izin listesi dışında hiçbir `background`'da
kullanılmaması; `outline: none`'ın yalnızca yerine başka gösterge konmuş üç
yerde (`.modal-sheet:focus`, `.word-meal-panel:focus`, `.arama-input`)
bulunması; Ezber kuralının outline'ı kapatmaması; genel halkanın 2px `--gold`
olması ve modal zemininde >= 3:1. Her parça tek tek bozularak (23 mutasyon:
`--gold-deep`'in silinmesi / `--gold`'a eşitlenmesi / açılması / başka tona
kayması, altı kullanım yerinin her birinin eski altına dönmesi, tefsir yeşil,
kahve ve mavisinin eski ya da açık değere dönmesi, `.translation` zemininin
koyulaşması, yeni bir kuralda `--gold-soft` / düz hex / altın dolgu, Ezber'de
`outline: none`'ın geri gelmesi, başka bir yerde yeni `outline: none`,
izin listesindeki bir yerin `outline: none`'ı kaybetmesi, genel halkanın
incelmesi / kalkması, çalan etiketin koyu altına dönmesi) testin kırıldığı
doğrulandı; değişikliksiz hâl diğer beş test dosyasıyla birlikte geçiyor.
Görünüm: 17 durumun ekran görüntüleri (430 ve 1200 px; ses sessiz WAV,
animasyonlar kapalı) yamasız ağaçla piksel piksel karşılaştırıldı: her
genişlikte 12 durum birebir aynı, 5'inde fark var (konu modalı, çalan düğme,
Sure Bilgisi, tefsir, alt rüku rakamları) ve fark piksellerinin tamamı rengi
değişen öğelerin kutularının (±3 px) içinde. Tek istisna 1200 px'te konu
modalının arkasındaki tefsir renkleri: perdenin bulanıklığı (`backdrop-filter:
blur`) 4 pikseli kutunun hemen dışına yaydı (kanal farkı 1/255).

**Sınırlar:** gerçek bir ekran okuyucu ya da gerçek cihaz çalıştırılmadı;
kontrast ekran okuyucuyu ilgilendirmez ama güneş altında telefon ekranı,
Windows Yüksek Karşıtlık (zorlanmış renkler) ve iOS "Kontrastı Artır" gibi
sistem modlarındaki görünüm sınanmadı (aşağıda 14. madde). Tarama 17 durumla
sınırlı: renkler CSS kuralı başına tanımlı olduğundan her sure aynı sonucu
vermeli, ama 114 Sure Bilgisi metni ve tefsirin tamamı ayrı ayrı taranmadı.
Genel odak halkasının rengi `--gold`: modal zemininde 3,26:1 (ölçüldü), `--paper`
zeminine düşen bir halka için 2,95:1 olurdu; bu yama genel halkayı
değiştirmedi. Konu açıklamalarındaki `<topic>` bağlantıları (az önce
koyulaşanlar) bu yamada klavyeyle odaklanamıyordu; ayrı bir iş olarak bir
sonraki paragrafta ele alındı.

**Konu açıklamalarındaki bağlantılar (klavye).** Konu modalının açıklama
metninde `<topic data-id="N">…</topic>` biçiminde iç bağlantılar var (271
konuda 461 adet; tıklanınca o konuya gidiyor). Tarayıcı `<topic>`'i
tanımıyor: bu öğeler odaklanamıyor ve erişilebilirlik ağacında rolsüz. Başsız
Chromium'da gerçek Tab/Enter/Space ile ve CDP erişilebilirlik ağacıyla (430 ve
1200 px; "Allah" konusu, açıklamasında "Kur'an" ve "İslam") yamadan ÖNCE
ölçüldü: `tabIndex` -1, ağaçta rol "none" (ad yok), Tab durağı 0 -- klavye ve
ekran okuyucu kullanıcısı için düz metin; bağlantı yalnızca fareyle ya da
dokunmayla çalışıyordu. İkinci bulgu çiplerde (gerçek `<button>`): "Gayb (54)"
çipine Enter basınca başlık değişiyor ama gövde baştan basıldığı için basılan
çip DOM'dan kalkıyor ve odak `<body>`'ye düşüyordu; yeni konunun adını
duyuracak bir odak değişimi yoktu, sonraki Tab görünümün ortasındaki bir çipe
("Gayb (Görünmeyen Âlem)"), Shift+Tab Kapat'a gidiyordu.

Şimdi (aynı sahne, aynı ölçüm, 430 ve 1200 px'te aynı sonuç): iki bağlantı
`tabIndex` 0, ağaçta rol "link", ad "Kur'an" ve "İslam"; Tab sırası Geri,
Kapat, Kur'an, İslam, çipler (2 yeni durak, DOM sırasıyla). Odaklıyken halka
düz 2px `rgb(169, 129, 46)` (`--gold`), 2px aralıklı, `:focus-visible`
eşleşiyor; ekran görüntüsünden örneklenen halka pikseli (232 piksel, tam
`#A9812E`) ile zemin (`rgb(247, 244, 236)`) arasındaki oran 3,26:1 (WCAG
1.4.11: en az 3:1). Bağlantıda Enter: "Allah" -> "Kur'an", Geri görünür, odak
modal kapsayıcısında (başlığın okunması beklenen davranış; gerçek ekran
okuyucuyla sınanmadı). Space: hiçbir şey olmuyor, odak bağlantıda kalıyor. Çipe Enter: başlık "Gayb", odak kapsayıcıda
(artık `<body>` değil), sonraki Tab Geri düğmesine gidiyor. Fareyle tıklama
eskisi gibi.

Tarama (gerçek Chromium, 430 px, yalnızca Tab ve Enter): açıklamasında en az
bir `data-id`'li bağlantı olan 271 konunun her birinde DOM'daki bağlantılar
veriyle (id, sıra, metin) aynı, Tab durakları veri sırasındaki bağlantılar ve
461 bağlantının her birine Tab'la gelip Enter'a basınca başlık hedef konunun
adı, Geri görünür, odak kapsayıcıda; Geri aynı konuya döndürüyor (2.635 Tab
basışı, sayfa hatası 0). Görünüm: odaksız açıklama kırpması ve tüm modalin
ekran görüntüsü 430 ve 1200 px'te yamasız ağaçla piksel piksel aynı (4 çift, 0
farklı piksel); yalnızca odaklı hâl ve davranış yeni.

Kararlar:

- **`role="link"` + `tabindex="0"`, çizim anında eklenir** (`js/topics.js`,
  `markTopicLinks`; `markArabicSpans` ile aynı yöntem, veri dosyasına
  dokunulmuyor). `<a href>` değil: gezinmenin URL'si yok, iç bir yığın
  (`state.topicsModal.stack`) var; uydurma bir `href` olmayan bir adres vaat
  ederdi.
- **Yalnızca Enter açar** (ARIA APG "Link" deseni; yerel `<a>` da böyle):
  Space etkinleştirmez. Shift/Ctrl/Alt/Meta+Enter yakalanmıyor (tarayıcı ve
  ekran okuyucu kısayollarına dokunulmaz). İşleyici `topic[data-id]` ile
  sınırlı: düğmelerde (çip, "Mushaf'ta Ayete Git") Enter'ı yutmuyor, yoksa
  yerel Enter->click ile çift tetiklenirdi; `data-id`'siz `<topic>`'e de
  dokunmuyor. İşleyici tıklamayı yeniden kullanıyor: fare, dokunma ve klavye
  aynı tek yoldan (yığına ekle + odağı al) geçiyor.
- **Her gezinme adımından sonra odak modalın kapsayıcısına alınır**
  (`pushTopicsModalTopic`; modal açılırken yapılanın aynısı). Bu çipleri de
  kapsıyor, yani yama onların davranışını da değiştiriyor (eskiden `<body>`).
- **Halka genel halkayla aynı** (2px `--gold`, yalnızca `:focus-visible`;
  fareyle tıklamada halka çıkmıyor).
- **Görünür bir değişiklik değil** (odaksız hâl piksel piksel aynı). Tek
  commit; beğenilmezse `git revert` yeter.

`test/topic_links_test.mjs` (yeni, jsdom + axe-core, 53 kontrol): app.js'ten
GERÇEK `openModal` bloğu ile GERÇEK `<topics-modal>` bloğu çıkarılıp gerçek
`index.html`, `topics.js`, `modal-odak.js` ve `data/topics-tr.json` ile
çalıştırılıyor. "Allah" konusunda rol/`tabindex`, Tab sırası, odaklanabilirlik,
Enter ile gezinme, Geri; Enter'ın YAPMAMASI gerekenler (Space, Tab, ok tuşu,
Shift/Ctrl/Alt/Meta+Enter, basılı tutulan Enter, çip ve "Mushaf'ta Ayete Git"
düğmesi, `data-id`'siz `<topic>`); çip ve fareyle gezinmede odağın
kapsayıcıya alınması; 271 konunun 461 bağlantısının TAMAMI için tarama; axe-core
ARIA/`aria-command-name` kuralları (bu öğelere gerçekten uygulandığı da
denetleniyor, boş geçmiyor). `test/topics_test.mjs`'e 13 kontrol eklendi
(33 -> 46): `markTopicLinks` birim testleri (boş, tek, çoklu, çıplak `<topic>`,
iki kez uygulama, `markArabicSpans` ile sıra bağımsızlığı) ve veri taraması
(her `<topic>` etiketi iki bilinen biçimden biri: 461 `data-id`'li + 48 çıplak;
işaretlenen sayı 461; çıplaklara ve metnin geri kalanına dokunulmuyor).
`test/erisilebilirlik_test.mjs`'e 2 kontrol (187 -> 189): odak halkası kuralı
genel halkayla aynı ve `.modal-sheet` zemini `--shell-bg` (yani yukarıdaki
3,26:1 hesabı bu zemin için geçerli). Her parça tek tek bozularak 26 mutasyon
denendi, hepsi en az bir testi kırıyor: `markTopicLinks`'in hiçbir şey
yapmaması / `role`'ü ya da `tabindex`'i düşürmesi / yanlış rol / `-1` /
çıplak `<topic>`'i de işaretlemesi / yalnızca ilkini işaretlemesi; render
yolunda çağrılmaması, `import`'un ya da `<topics-modal>` işaretinin
kalkması; işleyicinin `keyup`'a bağlanması, Space'in ya da dört değiştirici
tuştan her birinin etkinleştirmesi (4 ayrı mutasyon), `preventDefault`'un
düşmesi, seçicinin `[data-id]` ya da `topic`'e genişlemesi; odağın
alınmaması ya da gövdeye alınması; halka kuralının silinmesi / `--gold-soft` /
`outline: none` / 1px; modal zemininin değişmesi. İşlevsel olarak aynı olan
mutasyonlar (odağın render'dan önce/sonra alınması, işleyicinin gövde yerine
kapsayıcıya bağlanması) denenmedi. Mutasyonsuz hâl (yamanın kendisi) 12 test
dosyasının hepsiyle geçiyor (11 mevcut + yeni `topic_links_test`).

**Sınırlar:** gerçek bir ekran okuyucu çalıştırılmadı (aşağıda 15. madde).
Chromium'un erişilebilirlik ağacı "link" rolünü ve adı doğruladı, ama ekran
okuyucunun bunu "bağlantı" diye okuması ve `role="link"` taşıyan özel bir
öğeye Enter/çift dokunuşu iletmesi (özellikle iOS VoiceOver, Android
TalkBack) gerçek cihazla doğrulanmalı; jsdom'da düzen, gerçek Tab ve yerel
Enter->click yok (testlerin başlığında yazıyor). Veride 48 `<topic>` etiketi
`data-id` taşımıyor (hedefsiz): tıklanınca hiçbir şey olmuyor, bu yüzden
odaklanabilir yapılmadı; ama CSS onları bu yamada hâlâ bağlantı gibi
gösteriyordu (altı çizili altın) -- görünüm ve davranış uyuşmuyordu; ayrı bir
yama olarak aşağıda ele alındı ("Hedefsiz `<topic>` etiketleri"). Ölçüm
sırasında yamayla ilgisiz
bir bulgu daha çıktı ve bu yamada DEĞİŞTİRİLMEDİ: konu modalının Geri düğmesi
kökte de görünüyor (`hidden` özniteliği `.info-detail-back { display: flex }`
ile ezilmiş; hesaplanan `display: flex`, 32x32, ilk Tab durağı) ve bir adım geri
alıp köke dönünce odak `<body>`'ye düşüyor (yamasız ve yamalı ağaçta aynı).
Ayrı bir yama olarak sonraki paragrafta ele alındı.

**`hidden` özniteliği ve konu modalının Geri düğmesi.** Yukarıdaki bulgunun
kaynağı tek bir hata sınıfı çıktı: tarayıcının kendi `[hidden] { display: none }`
kuralı özgüllük olarak en zayıfı; bir sınıf kuralı `display: flex` verince
`hidden` sessizce eziliyor, öğe ekranda, Tab sırasında ve erişilebilirlik
ağacında kalıyor. Başsız Chromium'da (430 ve 1200 px; 26 arayüz durumu: açılış,
ayet paneli, 7 modal ve alt sekmeleri/görünümleri, Sure Bilgisi ayrıntısı,
Ezber Yaz klavyesi; her durumda `hidden` özniteliği taşıyıp hesaplanan
`display`'i `none` olan olmayan öğeler tarandı) yamadan ÖNCE iki yerde böyleydi:

- **Konu modalının Geri düğmesi.** Kökte (konuya ayet panelinden girilmiş, hiç
  adım atılmamış) `hidden` var ama hesaplanan `display: flex`, 32x32 görünür;
  erişilebilirlik ağacında "Geri dön, düğme"; ilk Tab durağı; basınca hiçbir şey
  olmuyor (kökte geri alınacak adım yok). Kod yorumu "yalnızca birden fazla adım
  gidilmişse görünür" diyordu, davranış tersiydi.
- **Ezber modalı, sure seçici açıkken.** Dinle/Oku/Yaz sekme çubuğu (`#ezber-tabs`,
  `.tab-bar { display: flex }`) `hidden` olduğu halde 41 px görünüyor, ağaçta
  "tablist", 3 fazladan Tab durağı; bir sekmeye dokununca seçicinin üstüne
  sıkışmış bir sekme paneli biniyordu (Oku paneli 51 px, seçici 450 px'e küçülüyor).

Odak tarafı: Geri'ye basınca (fare ya da Tab+Enter) köke dönüldüğünde odak
`<body>`'ye düşüyordu (Chromium, odaktaki öğenin `hidden` özniteliği kurulunca
odağı bırakıyor); ara adıma dönüşte (3. -> 2. görünüm) odak Geri'de kalıyor ama
başlık sessizce değişiyordu.

Şimdi (yamadan önce -> sonra, 430 px; 1200 px'te davranış aynı, yalnızca mutlak
konum ve yükseklikler farklı: başlık yine 28 px sola kayıyor, sekme çubuğu yine
41 px, seçici 516 -> 557 px):

- Konu modalı kök: Geri `display` flex -> none, 32x32 -> 0x0; ağaçta "Geri dön,
  düğme" -> yok sayılıyor; ilk üç Tab durağı Geri, Kapat, bağlantı -> Kapat,
  bağlantı, bağlantı; başlığın sol kenarı 47 -> 19 px.
- Geri'den sonra odak: köke dönüş (fare) `<body>` -> diyalog; köke dönüş
  (Tab+Enter) `<body>` -> diyalog; ara adım Geri -> diyalog (sonraki Tab Geri'ye).
- Ezber sure seçici açıkken: sekme çubuğu `display` flex, 41 px -> none, 0 px;
  ağaçta tablist -> yok sayılıyor; Tab durakları 3 azalıyor; seçici 501 -> 542 px.
- Tarama: 26 durum x 2 genişlik, "hidden ama görünür" öğe 2 -> 0.

Karar ve ödünleşmeler:

- **Genel kural: `[hidden] { display: none !important; }`** (`css/style.css`'in
  başında). Her sınıf için ayrı `[hidden]` kuralı yazmak (mevcut desen:
  `.modal-sheet[hidden]`, `.arama-clear[hidden]`, ...) yeni bir sınıf eklenince
  aynı hatayı tekrar doğuruyor; bu ikisi tam böyle çıktı. Bedeli: `hidden`
  taşıyan bir öğe artık bir sınıf kuralıyla gösterilemez (gösterilecekse `hidden`
  kalkar). `js/` altında satır içi `style.display` kullanan kod yok (arandı), yani
  `!important` onu ezmiyor. `hidden` SINIFI (yükleme perdesi) ayrı bir şey,
  dokunulmadı; sınıfa özel mevcut `[hidden]` kuralları da duruyor (zararsız,
  silmek gürültü olurdu).
- **Başlık satırına `min-height: 32px`** (`.topics-modal-header-start`). Geri
  (32 px) kökte gerçekten gizlenince satır 48 -> 40 px'e kısalıp içeriği 8 px
  yukarı kaydırıyordu (ölçüldü); satır yüksekliği sabit tutuluyor.
- **Geri'den sonra odak modalın kapsayıcısına** (`popTopicsModalTopic`;
  `pushTopicsModalTopic`'in aynısı). Kökte Geri gizleneceği için odak kaybolmasın,
  ara adımda da yeni başlık okunsun diye. Ödünleşme: ara adımda art arda Geri'ye
  basmak klavyede her seferinde Tab + Enter gerektiriyor (eskiden odak Geri'de
  kalıyor, tek tuş yetiyordu). Başlık değişiminin duyulması bu maliyete değer
  görüldü; gerçek ekran okuyucuyla sınanmadı.

Görünür değişiklik yalnızca iki yerde. 26 durumun ekran görüntüleri (430 ve
1200 px) yamasız ağaçla karşılaştırıldı: Konu modalı kökte yalnızca 66x12 px'lik
başlık köşesi değişiyor (Geri oku gidiyor, başlık sola kayıyor; içerik yerinde) ve
Ezber sure seçicide sekme çubuğu gidiyor, liste 41 px yukarı çıkıyor. Diğer 24
durum piksel piksel aynı (430 px'te yalnızca arama modalının boş durumunda 43
piksellik, en çok 8/255'lik bir gölge farkı çıktı; yamasız ağacın iki ayrı
koşusunda da çıktığı için yamayla ilgisiz).

Testler: `test/topic_links_test.mjs` 53 -> 68 kontrol (Geri bölümü: kök, ara adım,
odak başka yerdeyken, kökte `popTopicsModalTopic`'in odağı çalmaması;
`popTopicsModalTopic`'in kaynakta sırası; Geri düğmesinin başlangıçta `hidden`
olması); `test/erisilebilirlik_test.mjs` 189 -> 192 (genel `[hidden]` kuralı tam
olarak `display: none !important`; başka hiçbir kural `display: ... !important`
vermiyor, izinli yalnızca `.hidden` sınıfı; başlık satırının `min-height`'ı Geri
düğmesinin yüksekliğine eşit). jsdom CSS kaskadını hesaplamıyor: kural kaynak
metninden sınanıyor, gerçek kaskad ölçümü yukarıdaki Chromium taraması. 11
mutasyon denendi (genel kuralın silinmesi / `!important`siz yazılması /
`.info-detail-back` ya da `.tab-bar`'ın `!important` alması; `min-height`'ın
kalkması ya da 40 px olması; Geri'de odağın alınmaması / kökte de alınması /
gövdeye alınması / Geri'de bırakılması; Geri düğmesinin başlangıçta `hidden`
olmaması): hepsi yakalandı (11/11), her biri en az bir testi kırıyor. Mutasyonsuz hâl 12 test
dosyasının hepsiyle geçiyor. **Sınırlar:** gerçek ekran okuyucu çalıştırılmadı
(aşağıda 15. ve 16. madde); `hidden` taraması 26 durumla sınırlı (genel kural
dışarıda kalan bir ezilmeyi de kapatır, ama onlar ölçülmedi).

**Hedefsiz `<topic>` etiketleri (düz metin).** Verideki 48 `<topic>` etiketi
(47 konuda; 45'i aynı açıklamada gerçek bağlantılarla birlikte, 2 konuda
("Ramazan", "Cûdi Dağı") yalnız onlar) `data-id` taşımıyor: bir konu adı ya da
çekimli hâli ("vücut azaları", "İsrailoğulları", "Hicrî takvimde", "Kadir
gecesinin"), hedefleri yok. CSS ise `.topic-description topic` ile hepsine
bağlantı stili veriyordu. Başsız Chromium'da (430 ve 1200 px; "Kalp", "Altın
Buzağı", "Ramazan", "Cûdi Dağı" ve açılıştaki "Allah" konuları: 6 gerçek
bağlantı, 5 hedefsiz etiket) yamadan ÖNCE ölçüldü: hedefsiz etiket gerçek
bağlantıyla birebir aynı hesaplanan stildeydi (`rgb(129, 98, 35)` altın, altı
çizili, `cursor: pointer`, üstüne gelince alt çizgi parlıyor) ama `tabIndex`
-1, ağaçta rolsüz ve tıklayınca hiçbir şey olmuyor: fareyle gezene "tıklanır"
vaadi veren, tıklanınca sessiz kalan bir görünüm.

Şimdi: bağlantı stili yalnızca `topic[data-id]`'ye veriliyor (`css/style.css`:
ana kural, `:hover` ve `:focus-visible`); hedefsizler çevresindeki metnin
stilini alıyor (`rgb(38, 32, 25)`, altı çizgisiz, `cursor: auto`, üstüne gelince
değişiklik yok). 6 gerçek bağlantının hesaplanan stili önce/sonra birebir aynı;
5 hedefsiz etiketin her biri değişti; 430 ve 1200 px'te aynı sonuç. Ekran
görüntüsü karşılaştırması (5 görünüm x 2 genişlik): yalnızca gerçek bağlantı
içeren "Allah" açıklaması piksel piksel aynı (0 piksel); diğer dördünde farklı
piksellerin sınır kutusu hedefsiz etiketin kendisi kadar (430 px: "vücut
azaları" 88x14 px, "İsrailoğulları" 84x18 px); gerçek bağlantılar aynı kalıyor.

Karar: **düz metin**, adına göre bir konuya çözmek değil. 48 etiketin 19'u
normalleştirilmiş adıyla (Türkçe küçük harf, boşluk sadeleştirme) tam olarak bir
konu adına denk geliyor, 7'si birden çok konuya ("hava olayları" -> 284 ve 1216,
"Mescid-i Haram" -> 52 ve 1723), 22'si hiçbirine ("Kıyamet gününe", "Hicrî
takvimin": çekimli hâller; "gök cisimleri"); yani çözme yarım kalırdı ve çoklu
eşleşmede keyfi bir seçim gerektirirdi. Veri dosyasına dokunulmuyor.

`test/erisilebilirlik_test.mjs`'e 2 kontrol eklendi (192 -> 194):
`.topic-description topic` ile başlayan her seçici `[data-id]` kapsamlı;
bağlantı stili (`topic[data-id]`'de altı çizili, `cursor: pointer`, `:hover`)
yerinde. Aynı dosyadaki renk kontrastı döngüsünün seçicisi `topic[data-id]`'ye
taşındı. Her parça tek tek bozularak 6 mutasyon denendi (ana kural ve hover
kuralı kapsamsız, alt çizgi, imleç, renk, ayrı bir `topic:not([data-id])`
kuralı), hepsi yakalandı; mutasyonsuz hâl 12 test dosyasının hepsiyle geçiyor.
Görünür değişiklik yalnızca hedefsiz etiketlerde; tek commit, beğenilmezse
`git revert` yeter. Gerçek ekran okuyucu çalıştırılmadı: bu etiketler zaten
odaklanamıyordu ve ağaçta rolsüzdü, değişen yalnızca görünüm.

**Sa'dî tefsirinin dil işaretleri.** `data/tafsir-saadi.json` (QUL exportu)
her parçaya otomatik dil tespiti uygulanmış geliyor ve belge dili `tr`
olduğundan iki yönde yanlış (WCAG 3.1.2). (1) Metin içi Arapça alıntılar
("إياك : Sana", ayet metinleri) çoğunlukla işaretsiz: 99 girdide 157 metin
düğümü; gerçek Chromium'da tarayıcının kendi `:lang(ar)` eşleşmesiyle yalnızca
27'si Arapça, 130'u değil (127'si `tr`, 3'ü `da`/`eu`/`fa`), yani Türkçe sesle
okunmaya çalışılır. (2) Kısa Türkçe parçalar yanlışlıkla başka dilde etiketli:
59.121 Latin harfli düğümün 652'si `tr` değil ("(takva sahiplerine)"
`hi-Latn`, "(evlerinden)" `de`, "(peygamber)" `sn`; 454 girdide 653 etiketli
öğe, 59 farklı değer, en sık `az` 151 ve `ku` 131). Bunların hepsi Türkçe:
tefsirin çevirisi Türkçe, yani `tr` ve `ar` dışındaki her etiket bir tespit
hatası. Sesi `lang`e göre seçen ve otomatik dil değiştirme açık olan bir ekran
okuyucu bu parçaları başka bir dilin sesiyle okuyabilir (cihazda denenmedi).
Arama sonuçlarındaki tefsir özeti düz metinden kurulduğu için (etiketler
atılınca `lang` de gidiyor) denenen 3 sorguda (Mâide 5:3, Nisâ 4:82, Zuhruf
43:57) Arapça parçayı `:lang(ar)` olmadan gösteriyordu.

Düzeltme çizim anında, veri dosyası değişmeden: `js/tafsir.js`'te
`markTafsirLanguages(html)`; `resolveTafsirText` (ayet panelinin tefsir
bölümü) ve arama özeti (`js/arama.js`, `tafsirRowHTML`) bunun içinden geçiyor.
`tr`/`ar` dışındaki her `lang` değeri `tr` oluyor; `lang="ar"` altında
olmayan her Arapça yazı bloğu (aralarında yalnızca boşluk olan Arapça
sözcükler, ayet ayraçları ﴾ ﴿ dahil; 136 blok) kendi `<span lang="ar">`'ı
içine alınıyor -- sınıfsız ve `dir`siz, yani çift yönlü sıralama ve stil
olduğu gibi kalıyor; zaten `lang="ar"` olan öğenin içi yeniden sarılmıyor,
dolayısıyla iki kez uygulamak sonucu değiştirmiyor. İşlev tam bir HTML
ayrıştırıcı değil: etiketleri ve metni ayırıp açık etiketlerin dilini bir
yığında izliyor; bu yüzden test, verinin yalnızca `p`/`div`/`span`, yalnızca
`class`/`lang`, çift tırnaklı ve dengeli olduğunu da doğruluyor (ileride başka
bir biçim gelirse sessizce yanlış çalışmasın).

Ölçüm (gerçek Chromium; 1.739 girdinin tamamı gerçek `resolveTafsirText`
yoluyla ve tarayıcının kendi `:lang()` eşleşmesiyle; yamadan önce -> sonra):
Arapça yazılı düğümlerden `:lang(ar)` olan 27/157 -> 163/163 (karma düğümler
bölündüğü için 163); Türkçe düğümlerden `:lang(tr)` olan 58.469/59.121 ->
59.127/59.127; `tr`/`ar` dışı `lang`li öğe 653 -> 0; tüm girdileri işlemek
125 ve 364 ms (iki ölçüm; girdi başına 0,07-0,21 ms), çıktı 7.852.830 ->
7.855.826 bayt. Gerçek ayet
paneli yolunda 7 örnek girdi (Fâtiha, Bakara 1/14/29, Âl-i İmrân 196, Enfâl 1,
Şuarâ 123; 430 ve 1200 px; verinin ilgili girdisi sayfa 1'deki "1:1" yerine
konarak): yeni işaretlenen girdilerde Arapça düğümler 0/2, 0/4, 0/9, 1/2 ->
hepsi Arapça; panel genişliği/yüksekliği ve metin uzunluğu birebir aynı. Ekran
görüntüleri: 14'ün 12'si piksel piksel aynı; yalnızca Bakara 29'da (yeni
işaretlenen, harekeli Arapça blokların bulunduğu tek örnek) kenar yumuşatma
farkı var -- 430 px'te tek satırda 208 piksel, 1200 px'te üç satırda 785
piksel, en büyük kanal farkı 51-53/255 -- ama Arapça blokların genişlikleri
(94,469 / 130,469 / 125,953 px ...) ve yükseklikleri önce/sonra birebir aynı,
yani düzen değişmiyor; farkın kaynağı ayrıca doğrulanmadı (muhtemelen
`lang="ar"` ile harf-işaret konumlandırmasının Arapça dil sistemiyle
yapılması). Arama özetinde 3 sorgunun üçünde Arapça parça 0/1 -> 1/1
`:lang(ar)`.

Testler: yeni `test/tafsir_dil_test.mjs` (52 kontrol): birim kontrolleri (iç
içe etiketler, void/dengesiz etiket, öznitelik değerine dokunmama, tekrar
uygulama), veri varsayımları, 1.739 girdilik tam tarama (gerçek jsdom
ayrıştırıcısıyla her metin düğümünün etkin dili: Arapça yazılı -> `ar`, Latin
yazılı -> `tr`; metin birebir aynı; eklenen sarmalayıcılar geri alınınca özgün
veri geri geliyor), `resolveTafsirText` (çapa / yönlendirmeli / yok), arama
özetlerinin 8.022 gerçek penceresinde tarama ve app.js/arama.js kablolaması;
`test/arama_ui_test.mjs`'e 9 kontrol (140 -> 149; 3 gerçek sorgu). Kodun her
parçası tek tek bozularak 14 mutasyon denendi (yanlış etiketin düzeltilmemesi
ya da `ar`'a çevrilmesi, bağlam atlamasının ve kapanıştaki dil geri
yüklemesinin kalkması, sözcükler arası boşluk köprüsü, ayet ayracı aralığı,
etiket içine bakma, void etiket, yığının hiç tutulmaması, `dir="rtl"`, iki
kablolama, iki veri varsayımı), hepsi yakalandı; mutasyonsuz hâl 13 test
dosyasının hepsiyle geçiyor (önceki 12 + yeni `tafsir_dil_test`). Tek commit,
beğenilmezse `git revert` yeter. Gerçek ekran okuyucu çalıştırılmadı: ölçülen,
tarayıcının `lang` eşleşmesi ve DOM; hangi sesin seçileceği cihaza ve ekran
okuyucunun ayarına bağlı (aşağıdaki kontrol listesi, madde 2).

**Otomatik doğrulama, gerçek cihaz testinin YERİNE DEĞİL.**
`test/erisilebilirlik_test.mjs`, yukarıdaki ikisini + genel ARIA
etiketlerini hem kaynak metin üzerinden hem [axe-core](https://github.com/dequelabs/axe-core)
ile jsdom'a monte edilmiş DOM üzerinde tarıyor (yalnızca yapısal/ARIA
kuralları -- renk kontrastı gibi gerçek düzen/görünürlük gerektiren
kurallar jsdom'da güvenilir olmadığından axe ile çalıştırılmıyor; kontrast
CSS'ten hesaplanan oranlarla denetleniyor, gerçek Chromium'daki axe taraması
yukarıdaki "Renk kontrastı" paragrafında). Bu ortamda
gerçek bir ekran okuyucu (NVDA/JAWS/VoiceOver/TalkBack) ÇALIŞTIRILAMADI --
bir GUI tarayıcı bile kurulamadı (Ubuntu 24.04'te chromium yalnızca snap
paketi olarak dağıtılıyor ve bu sandbox'ta snapd çalışmıyor; Puppeteer'ın
kendi indirdiği Chromium da ağ izin listesi dışındaki bir CDN'den
geliyor). Yani buradaki testler yapısal bir ön-kontrol; gerçek bir cihazda
doğrulama hâlâ gerekiyor (bkz. Yapılacaklar). (Sonradan başka bir ortamda
başsız Chromium ile DOM/erişilebilirlik-ağacı düzeyinde canlı bölge ölçümü
yapıldı -- yukarıdaki `#page-container` paragrafı --, ama gerçek ekran
okuyucu yine yok.)

## PWA ve çevrimdışı önbellekleme

`sw.js` kayıt olduktan sonra üç ayrı önbellek/stratejiyle çalışıyor (bkz.
dosyanın kendi başlık yorumu):

- **Ses** (`dijital-mushaf-audio-v1`) -- her ayet sesi isteğini
  (`audio-cdn.tarteel.ai`, bkz. `js/app.js`'teki
  `recitationAudioUrl`/`RECITERS`) **önbellek-önce** sunuyor: önbellekte
  varsa ağa hiç gidilmeden oradan, yoksa ağdan çekilip bir kopyası
  önbelleğe eklenerek. **Boyut/LRU sınırı YOK** -- açık bir tercih;
  önbellek yalnızca tarayıcının kendi (uygulama seviyesinden bağımsız)
  depolama kotası dolduğunda büyür durur.
- **Uygulama kabuğu** (`dijital-mushaf-shell-v1`: `index.html`, `css/`,
  `js/*.js`, `vendor/*`, `fonts/DigitalKhattV2.woff2`) -- **ağ-önce**:
  çevrimiçiyken her istek en güncel sürümü ağdan çeker (ve önbelleği
  günceller), yalnızca ağ başarısız olursa (gerçekten çevrimdışı)
  önbellekten döner. Bu, güncellemelerin kullanıcı hiçbir şey yapmadan
  (yenile/banner falan olmadan) bir sonraki ziyarette otomatik
  uygulanmasını sağlıyor -- `skipWaiting()`+`clients.claim()` ile
  birlikte. Scope kökü (`"./"`, yani manifest `start_url`'ü) de
  `install`'da önceden indirilir: dizin URL'si `index.html`den FARKLI bir
  önbellek anahtarı olduğundan, bunsuz "ana ekrandan ilk açılış"
  çevrimdışıyken başarısız olurdu. Ayrıca çevrimdışıyken bir sayfa
  gezintisi için tam eşleşme yoksa (ör. URL'de sorgu dizesi) `index.html`
  kabuğu dönülür.
- **Statik veri** (`dijital-mushaf-data-v1`: `data/*.json`) --
  **önbellek-önce**, ses gibi sınırsız (veri yayımlandıktan sonra
  değişmiyor). "Çekirdek okuma" verisi (mushaf, meal, sure/ayet/cüz vb.
  gezinme tabloları -- tam liste `sw.js`'teki `PRECACHE_URLS`) **ilk
  ziyarette önceden** indirilir (`install` bunları doğrudan
  `DATA_CACHE`'e yazar -- `/data/` istekleri yalnızca orada aranır) ki
  uygulama baştan itibaren çevrimdışı açılıp Arapça metni + Türkçe
  meali göstersin; kelime meali, Konu
  Fihristi, sure bilgisi, Sa'dî tefsiri, ses-vurgu zamanlaması ve sure
  başlığı SVG'leri gibi daha büyük/ikincil veriler **ilk kullanıldıklarında**
  kendiliğinden önbelleğe giriyor (önceden indirilmiyor) -- **tek istisna
  sure başlıkları**: aşağıya bkz.

**Sure başlıkları ayrıca ısıtılıyor.** `data/surah-headers/1..114.json`
(toplam 9+ MB) kasıtlı olarak `PRECACHE_URLS`'te değil -- ilk kurulumu
ağırlaştırmasın diye. Ama bunun ilk hâli bir eksiklik yaratıyordu:
çevrimiçiyken hiç GÖRÜLMEYEN bir surenin başlığı (o sureye gidilip
`fetchHeaderGlyph` çalışmadan) hiç önbellekte olmuyor, çevrimdışı o
sayfanın başlığı eksik görünüyordu (sayfanın geri kalanı yine render
oluyordu -- `buildPage`'teki `try/catch` zaten tek bir başlık hatasını
yutup diğer surelerle devam ediyor). Çözüm: `activate`'te, `clients.claim()`u
GECİKTİRMEYEN AYRI bir arka plan görevi (`warmUpSurahHeaders`) 114
başlığın hepsini küçük bir eşzamanlılık sınırıyla (4 istek birden) tek
tek ısıtıyor; zaten önbellekte olanlar atlanıyor, biri başarısız olursa
diğerleri durmuyor (sayfa o sureye gerçekten gidildiğinde normal fetch
handler zaten yeniden dener). Sonuç: ilk ziyareti hafif tutmaya devam
ederken, kurulumdan birkaç dakika içinde TÜM sure başlıkları da
çevrimdışı kullanılabilir hâle geliyor.

`activate` olayında yalnızca BU UYGULAMAYA ait **eski sürüm** kabuk/veri
önbellekleri siliniyor (`caches.keys()` + ad ön eki eşleşmesi) -- güncel
sürümler, AUDIO_CACHE dahil, hiç dokunulmuyor; ses önbelleğinin sürüm
adı hiç değişmediği sürece bu temizlik ona asla erişmiyor, yani
"sınırsız/kalıcı" garantisi servis worker güncellemelerinde de geçerli
kalıyor. `js/app.js`'in sonunda `registerServiceWorker()` ile (ana
yükleme akışını bloklamayan, "fire and forget") kaydediliyor;
desteklenmeyen bir tarayıcıda ya da kayıt başarısız olursa uygulama
olağan (çevrimiçi, önbelleksiz) şekilde çalışmaya devam ediyor.

**`manifest.json`** ("Ana ekrana ekle" / yüklenebilirlik için): isim,
`start_url`/`scope: "."` (GH Pages'in hangi alt yolunda yayımlanırsa
yayımlansın taşınabilir olsun diye göreli), `display: "standalone"`,
uygulamanın kendi paleti (`theme_color`/`background_color`), ve
`icons/` altında basit, soyut bir "açık sayfa" simgesi (192/512/maskable
-- geçici bir simge; gerçek bir logo olursa `icons/*.png`'yi değiştirmek
yeterli). `index.html`'e `<link rel="manifest">` + `<meta name="theme-color">`
+ `apple-touch-icon` olarak bağlandı.

`test/sw_test.mjs`, bir servis worker gerçek bir tarayıcı dışında
çalışmadığından, `sw.js`'in kaynağını sahte `self`/`caches` ile bir
`Function` içinde çalıştırıp `install`/`activate`/`fetch` olaylarını elle
tetikliyor (Node'un yerleşik `fetch`/`Request`/`Response`'u kullanılıyor);
`PRECACHE_URLS`'i de doğrudan `sw.js`'ten çıkarıp hem kritik dosyaların
listede olduğunu hem ikincil/büyük verilerin OLMADIĞINI doğruluyor. Sahte
`caches`, gerçek Cache API gibi göreli URL'leri `sw.js`'in adresine göre
mutlak URL'ye çözüyor; böylece "kurulumdan hemen sonra, hiç çevrimiçi
açılış olmadan çevrimdışı" senaryosu (`PRECACHE_URLS`'in her biri + dizin
URL'si + gezinti fallback'i) da sınanıyor. Ayrıca bir koruma, `index.html`'in
`<script src>`/stylesheet bağlantılarını ve `js/app.js`'ten statik `import`
ile erişilen modül ağacını çıkarıp bunların HER BİRİNİN `PRECACHE_URLS`'te
olduğunu (yeni bir modül listeye eklenmezse "ilk ziyaretten sonra çevrimdışı"
yine kırılırdı) ve listedeki her dosyanın diskte bulunduğunu (biri 404
verirse `cache.addAll` tümüyle reddedilir, `install` başarısız olur)
doğruluyor.

## Proje yapısı

```
index.html            Uygulama kabuğu
sw.js                   Servis worker -- ses/kabuk/veri önbellekleme (bkz. "PWA ve çevrimdışı önbellekleme")
manifest.json            PWA manifesti ("Ana ekrana ekle") + icons/ (192/512/maskable, geçici simge)
THIRD_PARTY_NOTICES.md  Üçüncü taraf kod ve yazı tipleri: atıf ve lisans metinleri
.nojekyll                 Boş dosya: GitHub Pages'in Jekyll işlemesini kapatır
css/style.css          Görünüm (kağıt/zümrüt paleti, bkz. aşağı)
js/justify.js          Kaşide/gerdirme algoritması (DigitalKhatt'tan uyarlandı)
js/render.js            HarfBuzz şekillendirme + SVG glyph çizimi + ayet vurgusu
js/wordmeal.js          Kelime meali: veri yükleme + kelime/çeviri gruplama mantığı
js/meal.js               Meal: veri yükleme + render (kaynak: Elmalılı M. Hamdi Yazır)
js/tafsir.js              Tefsir: kaynak kaydı + veri yükleme + ayet-grubu çözümleme
js/surahinfo.js           Sure Bilgisi: veri yükleme + <h2> sınırlarından akordeon bölümleri
js/topics.js              Konu Fihristi: veri yükleme + ayrıştırma/indeksleme (ayet, ana/alt/ilişkili konu)
js/search.js               Arama: saf mantık (normalleştirme, sorgu ayrıştırma, dizin, vurgu, son aramalar)
js/arama.js                 Arama modalı: arayüz + olaylar (bkz. "Arama")
js/modal-odak.js             Modal odak yönetimi: açılışta odağı modala al, Tab'i içeride döndür, kapanışta açana geri ver (bkz. "Erişilebilirlik")
js/ayet-gezgini.js              Ayet gezgini: sayfadaki ayet/sure başlığı için görünmez <nav> -- klavye ve ekran okuyucu erişimi (bkz. "Erişilebilirlik")
js/app.js               Sayfa yükleme, önbellek, gezinme, modaller, ayet seçimi, ayet detay paneli, konu fihristi
data/mushaf.json         604 sayfa × satır × kelime (QUL'dan üretildi, ~3MB)
data/surahs.json          Sure adları/metadata (Türkçe isim dahil) + başlık glyph'i
data/surah-pages.json     Sure → başlangıç sayfası
data/juz.json              Cüz → ilk ayet + başlangıç sayfası ({ "n": { firstVerseKey, page } })
data/hizb.json, rub.json, manzil.json   Hizb (60) / rub' (240) / menzil (7), juz.json ile aynı şekil (bkz. "Gezinme")
data/ruku.json              Her sure için rükû başlangıçları (558 rükû): ayet numarası rengi dönüşümlü (bkz. "Nasıl çalışır")
data/ayahs.json             Her ayet → [sayfa, ilkKelimeId, sonKelimeId]
data/page-first-ayah.json    Sayfa → o sayfadaki ilk ayet [sure, ayet]
data/recitation-husary-mujawwad.json, recitation-abdulsamad-mujawwad.json   Sesli okuma kelime zamanlamaları, 6236 ayet × [kelime sırası, başlangıç ms, bitiş ms] (~1.2MB'er, bkz. "Sesli okuma")
data/word-meal.json          Kelime meali (Türkçe, QUL word-by-word export, ~1.6MB)
data/meal.json                Meal (Türkçe, Elmalılı M. Hamdi Yazır sadeleştirilmiş, ~1MB)
data/tafsir-saadi.json         Tefsîr-i Sa'dî (QUL export, ayet-grubu yönlendirmeli, ~8.7MB)
data/surah-info-tr.json        Sure Bilgisi (Türkçe, QUL surah-info exportundan çevrildi, 114 sure, ~950KB)
data/topics-tr.json            Konu Fihristi (Türkçe, QUL ayah-topics exportundan çevrildi, 2512 konu, ~950KB)
data/surah-headers/         Her sure için hazır SVG path verisi (114 dosya)
fonts/                    DigitalKhattV2.woff2 (tarayıcıda gerçekten yüklenen tek font)
audio/                    euzuhusari.mp3, euzuabdulsamad.mp3: Fâtiha'dan önce çalınan eûzü klipleri (ayet sesleri uzaktan geliyor, bkz. "Sesli okuma")
icons/                    PWA simgeleri (192, 512, maskable; geçici)
vendor/                   hb.wasm, hb.js, hbjs.js (resmi harfbuzzjs, MIT) +
                          woff2-decompress/ (wawoff2, MIT — bkz. THIRD_PARTY_NOTICES.md)
tools/build_data.py       Ham QUL exportlarından data/*.json üreten script
tools/build_hizb_rub_manzil.py   data/hizb.json, rub.json, manzil.json'u QUL'un quran-metadata-*.json exportlarından üretir
tools/build_recitation.py        data/recitation-*.json'u QUL'un ayah-recitation-*.json exportlarından üretir
tools/patch_word_meal.py      word-meal.json'daki bilinen QUL hatalarını düzeltir
tools/raw-data/           Ham build girdileri (bkz. Veriyi güncellemek): quran-metadata-{hizb,rub,manzil}.json,
                          ayah-recitation-*.json (iki okuyucu) + QCF_SurahHeader_COLOR-Regular.woff2
                          (sadece build_data.py'nin sure başlığı SVG'lerini üretmek için okuduğu
                          kaynak; tarayıcı hiç yüklemiyor, bkz. madde 5 yukarıda)
.github/workflows/test.yml   CI: push (main), çekme isteği ve elle: `npm ci && npm test` (bkz. "Testler ve CI")
test/package.json            Test bağımlılıkları (jsdom, axe-core, wawoff2) ve betikler (`npm test`, `test:fast`, `test:corpus`)
test/package-lock.json        Kilit dosyası (depoda; `npm ci` bunu kurar)
test/run_all.mjs             Tüm *_test.mjs dosyalarını sırayla çalıştıran koşucu (`npm test`)
test/run_all_test.mjs         Koşucunun testi: sahte test dizinleriyle çıkış kodları, zaman aşımı, Ctrl+C, Actions çıktısı (Node)
test/ci_test.mjs               CI yapısı: kilit dosyası/package.json uyumu, iş akışı, testlerin bağımlılıkları (Node)
test/readme_test.mjs            Bu ağacın depoyla uyumu: listelenen her yol var, her dosya listeli; komut örnekleri var olan betikleri çağırıyor (Node)
test/full_corpus_test.mjs  604 sayfayı Node'da render edip DOĞRULAYAN test: hizalama, xScale, kashida, başlık yüksekliği, Ezber->Yaz birimleri, metin katmanı kelime span'ları (jsdom)
test/search_test.mjs        Arama saf mantığı (Node)
test/arama_ui_test.mjs       Arama modalı arayüzü (jsdom)
test/erisilebilirlik_test.mjs  Anons bölgesi, panel açıkken tek sayfa metni (alt kopya aria-hidden), kelime kelime metin katmanı + axe-core yapısal tarama (jsdom)
test/modal_odak_test.mjs        Modal odak yönetimi: işaretleme, Tab döngüsü, açan öğeye dönüş, app.js bağlantısı (jsdom)
test/topic_links_test.mjs       Konu açıklamalarındaki <topic> bağlantıları: role/tabindex, Enter, odak, Geri düğmesi/odak, 461 bağlantının taraması, axe-core (jsdom)
test/tafsir_dil_test.mjs        Sa'dî tefsiri dil işaretleri: birim, veri varsayımları, 1739 girdilik tam tarama, panel ve arama özeti yolu (jsdom)
test/ayet_gezgini_test.mjs         Ayet gezgini: işaretleme, CSS, saf yardımcılar, denetleyici, app.js bağlantısı ve sırası, axe-core (jsdom)
test/sw_test.mjs              Servis worker: sahte self/caches ile (Node)
test/topics_test.mjs            Konu Fihristi: ayrıştırma yardımcıları + tüm verinin referans bütünlüğü taraması (Node)
test/juz_subdivisions_test.mjs    Cüz/hizb/rub/manzil veri tutarlılığı ve gezinme mantığı (Node)
test/recitation_playback_test.mjs  Sesli okuma motoru: sıradaki ayet, kelime zamanı, ses adresi (Node)
test/surah_header_cut_test.mjs      Kelime meali panelinin sayfa kesimi sure başlığının içine düşmüyor (Node)
test/surah_info_links_test.mjs       Sure Bilgisi bağlantıları: parseInfoLink + 114 surenin taraması (Node)
test/sure_bilgisi_odak_test.mjs      Sure Bilgisi bağlantı -> ayrıntı -> Geri odağı: giriş/çıkış, Geri'de açan bağlantıya dönüş, modal kapanışı (jsdom)
test/kapali_panel_test.mjs           Sure Bilgisi'nde kapalı akordeon bölümleri: CSS yapısı, 114 sure x gerçek CSS (visibility), Tab tuzağı (jsdom)
test/ezber_klavye_test.mjs           Ezber > Oku ve Yaz klavye / ekran okuyucu yolu: #ezber-reveal, Yaz klavyesi (adlar, oklar, fiziksel tuş), duyurular, odak, ses başarısızken tek ilerleme, CSS (jsdom)
test/ezber_metin_katmani_test.mjs    Ezber oturumunda kapak altı metin erişilebilirlik ağacından çıkıyor mu: kapakla aynı kelimeler aria-hidden, Yaz'da kelime son harfte geri geliyor, oturum sonunda ve çok sayfalı oturumda temiz (jsdom)
test/tefsir_sekme_aria_test.mjs     Tefsir sekme düğmesi: aria-expanded .active ile tutarlı, kapanış bitince metin DOM'dan kalkıyor, aynı karede çift tıklama, veri gelirken kapatma, iki kaynak arasında geçiş, rastgele diziler (jsdom)
```

## Çalıştırma

Canlı sürüm: https://mustafakilic13.github.io/dijital-mushaf/

Yerelde çalıştırmak için herhangi bir statik sunucu yeterli (derleme adımı
yok), ör.:

```bash
git clone https://github.com/mustafakilic13/dijital-mushaf.git
cd dijital-mushaf
python3 -m http.server 8000
# http://localhost:8000
```

Sayfayı `file://` ile açmak çalışmaz: ES modülleri ve `fetch` (veri dosyaları,
WASM) bir sunucu ister; servis worker da yalnızca `https:` ya da `localhost`
üzerinde kaydolur.

**Not:** `vendor/hb.wasm` tarayıcıda `WebAssembly.instantiateStreaming()`
ile yükleniyor, ki bu da sunucunun `.wasm` dosyasını tam olarak
`application/wasm` Content-Type'ıyla döndürmesini şart koşuyor. Python'ın
`http.server`'ı bunu yapıyor (Python 3.13'te `Content-type: application/wasm`
döndüğü doğrulandı); sunucun `.wasm`'ı başka bir türle sunarsa (eski bir
Python, ayarı bozuk bir sistem MIME tablosu...) konsolda şunu görürsün:

```
wasm streaming compile failed: ... Incorrect response MIME type ...
falling back to ArrayBuffer instantiation
```

Bu bir hata değil: `vendor/hb.js` (resmi HarfBuzz WASM yükleyicisi) bunu
zaten yakalayıp daha yavaş ama çalışan bir yola (`WebAssembly.instantiate`)
düşüyor, mushaf yine render oluyor. Konsolu temiz tutmak ve o küçük
gecikmeyi önlemek için `.wasm`'ı `application/wasm` ile sunan bir sunucu
kullan: Python'ın `http.server`'ı, Node'un `serve`'ü, Nginx, Cloudflare Pages
vb. çoğu bunu zaten doğru yapıyor; yine de bir kez tarayıcı konsolunu
kontrol etmekte fayda var.

**GitHub Pages:** Bu depoyu olduğu gibi Pages'ten `main`/`root` olarak
yayınlaman yeterli -- build adımı yok (kökteki boş `.nojekyll`, Jekyll
işlemesini kapatıyor; Pages `.wasm`'ı doğru MIME type'la sunuyor). Yayın
GitHub'ın kendi "pages build and deployment" iş akışıyla yapılıyor; testler
bundan ayrı ve her push'ta çalışıyor (bkz. "Testler ve CI").

## Testler ve CI

**Tek komut.** `cd test && npm ci && npm test`. `test/run_all.mjs`, `test/`
altındaki her `*_test.mjs` dosyasını KENDİ Node sürecinde (çalışma dizini
`test/`) sırayla çalıştırıyor: testler birbirinin global durumunu (jsdom
pencereleri, değiştirilmiş zamanlayıcılar) bozamıyor, biri çökerse ya da
takılırsa kalanlar yine çalışıyor, sonda hepsinin özeti çıkıyor. Bir test,
çıkış kodu 0 **ve** çıktısında `FAIL` ile başlayan satır yoksa geçmiş
sayılıyor (ikinci koşul, "FAIL yazıp 0 ile çıkan" bir hatanın yeşil
görünmesini önlüyor). Geçen testlerin çıktısı gösterilmiyor (`-v` ile
gösterilir); başarısız olanınki olduğu gibi basılıyor (300 satırı aşarsa
baştan ve sondan kırpılarak). Çıkış kodu: 0 hepsi geçti; 1 en az biri
başarısız oldu, çöktü ya da süre sınırını (test başına 300 sn) aştı; 2
hatalı kullanım (bilinmeyen seçenek ya da test adı, çalıştırılacak test
kalmadı -- yazım hatası yüzünden "hiçbir test çalışmadı ama sonuç yeşil"
çıkmasın); 130 Ctrl+C. Süre sınırını aşan ya da Ctrl+C ile kesilen test önce
SIGTERM, 3 sn sonra SIGKILL ile öldürülüyor: SIGTERM'i yok sayan bir test de
öksüz süreç olarak kalmıyor. Seçenekler: `npm test -- --only sw,topics`,
`--skip full_corpus`, `--list`, `-v`, `--timeout SN`. Kısayollar:
`npm run test:fast` (tam tarama hariç, ≈ 83 sn) ve `npm run test:corpus`
(yalnız tam tarama; ölçüm raporunun tamamını basar). 22 dosyanın hepsi ≈
2,5 dk sürüyor (2 çekirdekli sandbox; en uzunları tam tarama 58-72 sn, arama
arayüzü 19-22 sn, koşucu testi 12 sn, tefsir dil testi 8-12 sn, kapalı panel
testi 8-10 sn, Ezber klavye testi ≈ 8 sn, Ezber metin katmanı testi ≈ 5 sn,
tefsir sekme testi ≈ 6 sn);
GitHub Actions'taki ilk koşuda işin tamamı 1 dk 25 sn sürdü.

**Tam tarama testi artık gerçekten doğruluyor.** `test/full_corpus_test.mjs`
604 sayfanın tamamını Node'da (jsdom + gerçek HarfBuzz + gerçek font) render
ediyordu ama yalnızca rapor basıyordu: bir sayfa istisna fırlatsa bile
sayılıp yazılıyor, çıkış kodu 0 kalıyordu -- yani hiçbir bozulmayı
yakalayamazdı. jsdom'un "canvas yok" uyarısı da (8.932 kez; `render.js`
`measureTextWidth` bu yüzden karakter başına tahmine düşüyor, bu yol yalnız
seçilebilir metin katmanının genişliğini etkiliyor, aşağıdaki ölçümleri
değil) 98 bin satırlık çıktıya yol açıyordu; artık sayılıp tek satırda
bildiriliyor, başka türden bir jsdom hatası gelirse test başarısız oluyor.
Şimdi 17 kontrol var: 604 sayfa hatasız render ediliyor; hizalı satırlar
sütunu ne eksik ne fazla dolduruyor (8.790 hizalı satırdan yalnız bilinen 4'ü
150 birimden fazla kısa, 1'i fazla uzun); xScale sıkıştırması taban
düzeyinde (2.955 satır, en kötü 0,770, ortalama 0,9383); kashida
uygulanıyor (genişletilen 5.835 satırın 3.322'sinde) ve boşluklar taban
düzeyinde genişliyor (ortalama 1,95, en çok 4,66 kat); 114 sure başlığı
satırı 114 ayrı sureye ait; başlıklı 98 sayfanın toplam yüksekliği
16.735-31.805 aralığında; 8.932 metin katmanı satırının hepsi gerçek metni
taşıyor ve 83.668 kelime span'ının her biri beklenen kimlik ve metinle
(Ezber'in kapak altı metni gizlemesi bunlara dayanıyor); Ezber->Yaz'ın 325.585
harf biriminin hepsi,
belgelenmiş tek istisna (sayfa 451, kelime 61960) dışında, metinden
hesaplanan sayıyla aynı. Eşikler bu yamadan önceki tabandan (main `228be5d`)
türetildi (en fazla 3.100 sıkışan satır, en kötü xScale >= 0,75, ortalama
>= 0,92, en az 3.000 kashidalı satır, boşluk ortalaması <= 2,2 ve en çok
<= 6, başlıklı sayfa yüksekliği [16.000, 32.500], >= 325.000 birim, bilinen
satırlar +100 birim payla). Bunlar REGRESYON bekçisi, "doğru düzen" tanımı
değil: düzeni bilerek değiştirirseniz (sure başlığı yüksekliği, kashida
kuralları...) dosya başındaki sabitleri yeni ölçüme göre güncelleyin; bilinen
bir satır/istisna düzelirse test başarısız olmuyor, yalnız "listeden
çıkarılabilir" notu düşüyor. Dosya artık çalışma dizininden bağımsız (eskiden
`cd test` şarttı), ≈ 58-72 sn sürüyor. Sınır: ölçülenler sütun doluluğu,
sıkıştırma, kashida kullanımı, başlık yüksekliği ve birim bölütleri;
kashidanın görsel kalitesi (hangi harfte ne kadar uzatıldığı) ve gerçek
tarayıcıdaki SVG çizimi ölçülmüyor. (Bu sınırın bir kısmı ölçülerek bulundu:
kashida hiç uygulanmasa bile satırlar boşluk açılarak doluyor ve ilk
sürümdeki hiçbir kontrol kırılmıyordu -- kashida/boşluk kontrolleri bu
yüzden eklendi.)

**Bağımlılıklar kilitli.** `test/package-lock.json` artık depoda (daha önce
`.gitignore`'daydı): `npm ci` her yerde aynı sürümleri kuruyor -- jsdom
25.0.1, axe-core 4.14.0, wawoff2 2.0.1, geçişli paketlerle 63 paket, ≈ 2 sn.
axe-core'un yeni bir sürümü kuralları değiştirip testleri kendiliğinden
kıramaz. Güncellemek için `cd test && npm update` ve kilit dosyasını
commit'lemek yeter. Kilit dosyasındaki 63 adresin hepsi `registry.npmjs.org`.

**CI (GitHub Actions).** `.github/workflows/test.yml`: `main`'e her push'ta,
her çekme isteğinde ve elle (`workflow_dispatch`) Node 22'de `npm ci && npm
test`; yetki yalnız `contents: read`; iş zaman aşımı 20 dk; aynı çekme
isteğinin eski koşusu yenisi gelince iptal ediliyor; `actions/checkout@v7`
ve `actions/setup-node@v7` (npm önbelleği kilit dosyasına bağlı). Başarısız
bir test Actions'ta dosyaya bağlı hata notu (`::error`) ve iş özetinde
tablo olarak görünüyor.

**İlk gerçek koşu.** İş akışı ilk kez `main`'deki `5238aae` push'unda GitHub'da
çalıştı (Actions > Testler #1) ve yeşil bitti: "Testler (Node 22)" işi 1 dk
25 sn sürdü -- 16 dosyanın hepsi, yerelde ≈ 2 dk. (Actions listesinde koşunun
toplam süresi 9 dk 12 sn görünüyordu; işin kendi süresi 1 dk 25 sn.)
Push'tan önce iş akışı actionlint 1.7.12 ile (sözdizimi ve ifadeler; bilerek
bozulmuş bir kopyada 2 hata veriyor, yani denetçi çalışıyor) ve temiz bir
klonda Node 22.22.0 / npm 10.9.4 ile `npm ci && npm test` olarak denenmişti.
`test/ci_test.mjs` (53 kontrol) iş akışının ve bağımlılık dosyalarının en
olası kırılma noktalarını koruyor: kilit dosyası ile `package.json` uyumu
(aksi hâlde `npm ci` hata verir), yalnız `registry.npmjs.org` adresleri ve
sha512 özetleri, `.gitignore`'un kilit dosyasını yutmaması, iş akışında yetki
/ zaman aşımı / `npm ci` sırası / önbellek yolu / sürüm etiketleri / Node
sürümü, testlerin `package.json`'da olmayan bir pakete bağlanmaması. Zamana
bağlı eşikler yavaş bir çalıştırıcıda sürpriz çıkarabilir: `search_test`'te 6
duvar saati eşiği var, yerelde ölçülen değerlerin en az ≈ 7 katı pay
bırakıyor (en sıkısı tefsirde tek arama: 12,7-14,5 ms < 100 ms); gerçek
koşuda hepsi geçti.

Testlerin kendileri de sınandı: `test/run_all_test.mjs` (56 kontrol: sahte
test dizinleriyle çıkış kodları, keşif kuralları, `--only`/`--skip`/`--list`/
`-v`, hatalı kullanım, zaman aşımı + SIGKILL + öksüz süreç, Ctrl+C, çıktı
kırpma, Actions çıktısı, gerçek dizin keşfi), `test/ci_test.mjs` (53 kontrol)
ve `full_corpus_test` (17 kontrol). Her parça tek tek bozularak (mutasyon
testi) 45 mutasyon denendi ve hepsi en az bir testi kırdı: tam tarama için 10
(xScale'in hiç uygulanmaması ya da %20 fazla
sıkıştırması, sure başlığından sonraki boşluğun +800 / -1500 olması, boş
Ezber->Yaz bölütleri, hançer elifin ayrı birim sayılması, başlıklı sayfalarda
istisna, beklenmeyen jsdom hatası, eksik sayfa, kashidanın kapanması);
koşucu için 18 (çıkış kodları, FAIL satırı yoklaması, zaman aşımı ve
SIGKILL'e yükseltme, bilinmeyen ad doğrulaması, çıktı gizleme, çalışma
dizini, Actions kaçışları ve özet dosyası, Ctrl+C, çıktı üst sınırı, keşif
kuralları, `--skip`, ilk başarısızlıkta durma); CI yapısı için 17 (kilit
dosyası uyumsuzluğu, ayna adresi, eksik özet, `.gitignore`, zaman aşımı,
yetki, `npm install`, `@main`, önbellek yolu, eski Node, `npm test` komutu,
bildirilmemiş paket, bozuk betik adı, `working-directory`, eksik iş akışı /
kilit dosyası / tetikleyici).

**README de sınanıyor.** `test/readme_test.mjs` (11 kontrol), "Proje yapısı"
ağacının depoyla uyumunu denetliyor: listelenen her yol depoda var; `js/`,
`css/`, `tools/`, `test/`, `data/` ve `.github/workflows/` altındaki her dosya,
kökteki `index.html` / `sw.js` / `manifest.json` / `THIRD_PARTY_NOTICES.md` ve
her üst düzey klasör listede; kod bloklarındaki `python3` / `node` komutları
var olan betikleri çağırıyor, `npm run` örnekleri `test/package.json`'da
tanımlı. Bu denetim gerçek sapmalardan sonra eklendi: README, depoda hiç
olmamış bir `serve.py`'yi anlatıyordu (`python3 serve.py 8000` çalışmıyordu)
ve sekiz veri/betik dosyası, `THIRD_PARTY_NOTICES.md` ile `audio/`, `icons/`
klasörleri ağaçta yoktu -- test, eski README'ye karşı çalıştırıldığında bunların
hepsini buluyor. Yeni bir dosya eklediğinizde test, README'de hangi satırın
eksik olduğunu söyler. 15 mutasyonun hepsi yakalandı (var olmayan dosya ya da
klasör listelenmesi, listeden çıkarılan dosya / klasör / kök dosya, virgüllü
listede bozuk ad, var olmayan betik ya da `npm run` betiği, eksik başlık,
kapanmayan kod bloğu, tek boşluklu girdi, listelenmeyen yeni dosya ya da
klasör).

## Sayfa boyutlandırma mantığı

Okuyucu, PDF görüntüleyicilerin "Page Width" moduyla aynı mantıkla çalışıyor
(digitalkhatt.org da böyle): sayfa her zaman mevcut **genişliğe** tam
oturacak şekilde büyütülüyor, yükseklik buna bağlı olarak kendiliğinden
belirleniyor. `.reader-scroll` alanı dikeyde kayıyor, gerekirse.

Sure başlıkları da tam bu genişliğe oturuyor (`js/render.js`,
`LineRenderer.headerMetrics`): yükseklik, genişliğe orantılı olarak
kendiliğinden çıkıyor (fontun kendi en-boy oranından). Bir başlıktan önce ve
sonra 1'er satır (`GAP_BEFORE_HEADER`, `GAP_AFTER_HEADER`) boşluk
bırakılıyor — bu yüzden sayfanın toplam yüksekliği, üzerindeki sure başlığı
sayısına göre biraz değişiyor. Konteynerin yüksekliği her sayfa için ayrı
ayrı, o sayfanın gerçek toplam yüksekliğinden hesaplanıyor (`app.js`,
`state.currentTotalHeight`), sabit bir oran değil.

## Veriyi güncellemek

QUL'dan yeni bir export indirirsen, ham dosyaları bir klasöre çıkar ve:

```bash
python3 tools/build_data.py /ham/dosyalar/klasörü data
```

(İkinci argüman verilmezse `../data`'ya yazar; hiç argüman verilmezse ham
dosyaları `tools/raw-data/` altında arar.)

`build_data.py`'yi yeni bir QUL exportuyla tekrar çalıştırırsan,
`tools/patch_word_meal.py`'yi de arkasından çalıştır -- bilinen 2:267
düzeltmesini (üstteki "Kelime meali verisi" bölümüne bakın) yeni dosyaya
yeniden uygular; export o hatayı kendiliğinden düzeltmişse zaten hiçbir
şey yapmaz.

```bash
python3 tools/patch_word_meal.py
```

**Hizb / rub' / menzil sınırları** için tam boru hattını çalıştırmak gerekmiyor:
QUL'un "Quran metadata" exportlarından `quran-metadata-hizb.json`,
`quran-metadata-rub.json`, `quran-metadata-manzil.json` dosyalarını
`tools/raw-data/` altına koyup

```bash
python3 tools/build_hizb_rub_manzil.py [ham-klasör] [ayahs.json] [çıktı-klasörü]
```

çalıştırmak yeter (varsayılanlar: `tools/raw-data`, `data/ayahs.json`, `data/`;
sayfa numaralarını `data/ayahs.json`'dan alıyor). Depodaki ham dosyalarla
yeniden üretilen `data/hizb.json`, `rub.json`, `manzil.json` mevcutlarla
bayt bayt aynı çıkıyor.

**Sesli okuma kelime zamanlamaları** için QUL'un "Recitations and segments
data" exportundaki `ayah-recitation-*.json` dosyası `tools/raw-data/` altına
konup

```bash
python3 tools/build_recitation.py [husary|abdulsamad] [çıktı-klasörü]
```

çalıştırılıyor (varsayılan: `husary`, `data/`). Betik, ham dosyadaki her ayet
adresinin `.../quran/<cdn_slug>/SSSAAA.mp3` kalıbına uyduğunu doğruluyor
(uymazsa üretimi durduruyor; bkz. "Sesli okuma"). Yeni bir okuyucu eklemek
için betikteki `RECITERS` sözlüğüne ve `js/app.js`'teki `RECITERS` kaydına
birer giriş eklenir (ikisi birbirinin aynası). Depodaki iki ham dosyayla
yeniden üretilen `data/recitation-*.json` dosyaları da mevcutlarla bayt bayt
aynı çıkıyor.

`data/ruku.json` için depoda üretim betiği yok; `js/app.js`'in yorumuna göre
QUL'un `quran-metadata-ruku.json` dosyasından türetilmiş.

## Yapılacaklar

Orijinal hedef listesindeki üç maddenin hepsi tamamlandı: **arama** (bkz.
"Arama"), **kelime vurgulu ses çalma** (bkz. "Sesli okuma") ve **ezber** (bkz.
"Ezber"). Bunlara ek olarak üzerinde durduğumuz ama henüz karara
bağlamadığımız konular aşağıda. Kuranmeali.com verisi kullanılmama kararı
kesinleşti (bkz. proje notları) -- kelime tahlili ve El-Müfredât için artık
yalnızca QUL/bağımsız açık kaynaklar arasından seçim yapmak kaldı.

### Erişilebilirlik: gerçek cihaz/ekran okuyucu testi

Yukarıdaki "Erişilebilirlik" bölümünde açıklanan otomatik/yapısal
kontroller geçti, ama gerçek bir NVDA+Chrome (Windows) ve bir VoiceOver
(iOS/Mac) testi hâlâ yapılmadı — bu ortamda mümkün değildi. Özellikle
şu noktalar doğrulanmalı:

1. Sayfa geçişinde `#nav-announcer`'ın anonsu ("Sayfa N, <Sure> Suresi,
   M. ayet") duyuluyor mu, ve sayfanın Arapça metni **kendiliğinden
   okunmuyor** mu (`#page-container` artık canlı bölge değil -- beklenen bu).
2. `foreignObject` içindeki metin katmanı gezinilerek okunabiliyor mu
   (bilinen risk: bu desen tarayıcı+ekran-okuyucu kombinasyonlarında
   tutarsız olabiliyor) ve Arapça metin Arapça sesle mi okunuyor (metin
   katmanı satırları artık `lang="ar"` taşıyor, belge dili `tr`; ama bunun
   işe yaraması için cihazda bir Arapça ses yüklü ve ekran okuyucunun
   otomatik dil değiştirme seçeneği açık olmalı -- NVDA'da Konuşma
   ayarlarında, VoiceOver/TalkBack'te ses paketlerinde bakılacak). Aynı
   kontrolü üst çubuktaki Arapça sure adında, Oynat düğmesinde ve sure
   listesinde de yap. Ayet panelinde Tefsir bölümünü açınca da (ör. Fâtiha:
   "إياك : Sana") Arapça alıntılar Arapça sesle, "(takva sahiplerine)" gibi
   parantezli Türkçe ifadeler Türkçe sesle okunuyor mu (verideki hatalı
   `hi-Latn`/`de` gibi etiketler yamadan önce başka bir dilin sesini
   seçtirebilirdi)? Ayet satırları artık kelime başına bir `<span>`: satır
   yine tek akıcı satır olarak mı okunuyor, kelimeler tek tek ya da
   aralarında kesintiyle mi okunuyor?
3. Bir ayete dokununca (fareyle tıklayınca) "<Sure> <ayet> detayı açıldı"
   duyuluyor mu; panel gövdesinin ilk içeriği en fazla bir kez okunuyor mu
   (yeni eklenen bir canlı bölgenin ilk içeriğini bazı ekran okuyucular
   okur, bazıları okumaz). Klavyeyle/ekran okuyucuyla aynı panele ve Sure
   Bilgisi'ne artık ayet gezgininden ulaşılıyor (bkz. 8-11. maddeler); bu
   madde fare/dokunma yolu için. Not: o yol hâlâ yalnızca sayfa SVG'sine
   gelen `click` ile çalışıyor (`els.pageContainer` işleyicisi, ayet
   `pointToAyah(e.clientX, e.clientY, ...)` ile imleç konumundan
   bulunuyor); bir ekran okuyucunun "etkinleştir" hareketinin bu SVG'ye
   `click` üretip üretmediği sınanmadı.
4. Tefsir düğmesine odaklanınca "daraltılmış", basınca "genişletilmiş", tekrar
   basınca yine "daraltılmış" duyuluyor mu (`aria-expanded`); açılınca tefsir
   metni okunuyor mu ve bu duyuru düğmenin durum duyurusuyla çakışmadan ya da
   birbirini kesmeden geliyor mu (metin binlerce karakter; canlı bölge);
   kapatınca metin artık okunmuyor mu (okuma/tarama modunda düğmenin altında
   tefsir metni kalmamalı).
5. Kapat düğmesine/Esc'ye basınca "Ayet detayı kapatıldı" duyuluyor mu.
6. Bir modal açılınca (ör. üst çubuktan Sure Seç) ekran okuyucu başlığı ve
   rolü okuyor mu ("Sure Seç, iletişim kutusu" gibi), odak modalın içinde
   mi, Tab/Shift+Tab modalın dışına çıkmadan dönüyor mu.
7. Kapat/Esc/perdeye dokunma/bir öğe seçme ile kapanınca odak modalı açan
   düğmeye dönüyor mu ve ekran okuyucu oradaki düğmeyi okuyor mu. Safari/iOS
   tıklanan düğmeye odak vermediği için açan öğe orada "son tıklanan
   etkileşimli öğe"den (en fazla 1 sn önce) bulunuyor -- özellikle iPhone'da
   doğrula. Arama -> konu gibi zincirde odak başa, yani Arama düğmesine
   dönmeli.
8. Ayet gezgini (`#ayah-nav`): Tab ile gelince ekran okuyucu "Sayfa gezgini"
   bölgesini, "Sure başlıkları" ve "Sayfadaki ayetler" listelerini ve
   düğmeleri okuyor mu ("Fâtiha Suresi, 3. ayet, düğme"; seçili ayette
   "geçerli", panel açıkken "genişletilmiş" gibi); `aria-describedby`
   ipucu ("Ayetler arasında gezinmek için yukarı ve aşağı ok tuşlarını,
   ayrıntıyı açıp kapatmak için Enter tuşunu kullanın.") okunuyor mu.
9. Yukarı/Aşağı ile ayet değiştirirken **çift okuma** var mı (odaklanan
   düğmenin adı + `#nav-announcer`'ın "Sayfa N, <Sure> Suresi, M. ayet"
   anonsu)? Varsa ve rahatsız ediyorsa biri kaldırılmalı; şimdilik güvenli
   taraf olarak ikisi de duruyor.
10. Enter ile panel açılınca odak panelde mi ve "<Sure> <ayet> detayı,
    bölge" okunuyor mu; Tab panelin içindeki düğmelere/konu etiketlerine
    gidiyor mu; Esc/Kapat ile kapanınca odak o ayet düğmesine dönüyor ve
    okunuyor mu. VoiceOver (iOS/Mac) ve TalkBack'te "etkinleştir"
    hareketi gezgin düğmesine `click` üretip paneli açıyor mu.
11. NVDA/JAWS tarama modunda ok tuşlarını ekran okuyucu kendisi kullanır,
    gezginin Yukarı/Aşağı işleyicisi orada çalışmaz: sanal imleçle bir ayet
    düğmesine gelip Enter'a basmak paneli açıyor mu (ayet seçili değilse
    önce seçip açıyor mu), sure başlığı düğmesi Sure Bilgisi'ni açıyor mu.
12. Ayet paneli açıkken sayfa metni ekran okuyucuyla gezinilirken **bir kez**
    mi okunuyor (sayfa, sonra panel; panelin altında sayfa metni tekrar
    başlamıyor mu)? VoiceOver/TalkBack'te panelin altındaki satırların
    üstünde parmakla gezinince ne duyuluyor: alt kopya `aria-hidden` olduğu
    için sessizlik beklenir. Bu rahatsız ederse alt kopyayı bütünüyle
    gizlemek yerine, üst kopyada kesimin altında kalan satırlar ile alt
    kopyada kesimin üstünde kalanları tek tek gizleyen (okuma sırası görsel
    sıraya uyar) bir yönteme geçilebilir; o durumda gerçek SVG'ye işaret
    koymak gerektiğinden, kapanışta ve sayfa değişiminde temizlenmesi ayrıca
    sınanmalı.
13. Oynat düğmesi: Tab ile gelince ekran okuyucu "Oynat, بسم الله الرحمن
    الرحيم, düğme" gibi okuyor mu (Türkçe eylem Türkçe sesle, ibare Arapça
    sesle)? Enter/Space/dokunmayla çalmaya başlayınca odaktaki düğmenin
    yeni adı ("Duraklat …") duyuruluyor mu (bazı ekran okuyucular odaktaki
    öğenin değişen adını söylemez; öyleyse en azından ayet anonsu yeni
    içerik veriyor mu), tekrar basınca ad "Oynat"a dönüyor mu, "basılı" /
    "geçiş düğmesi" gibi bir durum duyulmuyor mu? Sesle kumanda (iOS'ta Ses
    Kontrolü, Windows'ta Sesli Erişim) "Oynat" dediğinde ya da ekrandaki
    Arapça ibareyi söylediğinde düğmeye basıyor mu?
14. Görünüm: telefonda düşük parlaklıkta ya da güneş altında, ayrıca Windows
    Yüksek Karşıtlık / iOS "Kontrastı Artır" açıkken bağlantılar (Sure Bilgisi,
    konu açıklamaları), "Ontoloji" rozeti, çalan Oynat düğmesi ve alt rüku
    rakamları okunuyor mu; alt rüku rakamı sayfanın siyahından hâlâ ayırt
    ediliyor mu (bilinçli ödünleşme, yukarıdaki "Renk kontrastı" paragrafı)?
    Ezber alanlarına Tab ile gelince odak halkası net görünüyor mu?
15. Konu modalı (ayet panelinde bir konu etiketi -> "Allah" gibi bir konu):
    açıklamadaki "Kur'an" ve "İslam" Tab ile gelince ekran okuyucu "Kur'an,
    bağlantı" gibi okuyor mu (bağlantı sayısı/konumu duyuluyorsa doğru mu)?
    Enter (dokunmatik ekran okuyucuda çift dokunuş) konuya götürüyor mu ve
    ardından "Kur'an, iletişim kutusu" gibi yeni başlık duyuluyor mu? Space
    hiçbir şey yapmıyor mu, çipe Enter basınca da başlık duyuluyor mu? Odak
    halkası bağlantının çevresinde net görünüyor mu? Hedefsiz etiketler (ör.
    "Kalp" konusunda "vücut azaları") düz metin olarak okunuyor, cümlenin
    akışını bozmuyor mu? Kökte hiç "Geri dön" düğmesi duyulmuyor mu; bir
    ya da iki adım gidip Geri'ye basınca önceki konunun başlığı ("Allah,
    iletişim kutusu") duyuluyor mu, odak sayfanın başına kaçmıyor mu?
16. Ezber, "Sure Seç" açıkken: Dinle/Oku/Yaz sekmeleri artık okunmuyor ve Tab
    durağı değil mi (yalnızca seçici içeriği)? Seçiciden dönünce sekmeler geri
    geliyor mu?
17. Sure Bilgisi (gezginin "<Sure> Suresi hakkında bilgi" düğmesi -> metindeki
    "Bakara" ya da "1-32" gibi bir bağlantı): bağlantıya Enter basınca ekran
    okuyucu "<Sure>, iletişim kutusu" diye başlığı okuyor mu (başlık
    değişmediği için yeni görünüme girildiği anlaşılıyor mu, yoksa ayrıntı
    paneline bir ad/başlık mı gerekir)? Tab "Kapat"a, sonra "Geri dön"e
    gidiyor mu; Geri'ye basınca odak aynı bağlantıya dönüp okunuyor mu?
    "Mushaf'a Sureye Git" / "Mushaf'ta Ayete Git"ten sonra odak gidilen
    ayetin gezgin düğmesinde mi; sayfa yeniden kurulana kadar (yaklaşık
    40-60 ms) eski açan düğmenin kısa süre okunması rahatsız ediyor mu?
18. Sure Bilgisi, kapalı bölümler (ör. Âl-i İmrân'da yalnızca "İsim" açık):
    Tab yalnızca "Kapat"a, bölüm başlıklarına ve açık bölümün bağlantılarına
    mı gidiyor (kapalı bölümlerin bağlantıları atlanıyor mu)? Ekran okuyucu
    kapalı bölümün metnini (göz atma kipinde de) okumuyor mu; bir başlıkta
    Enter/Space ile açınca içerik hemen okunur oluyor mu? Modal açılışında
    Shift+Tab son bölümün başlığına mı gidiyor?
19. Ezber > Oku (klavyeyle başlat; Fâtiha 1-2 gibi kısa bir aralık yeter):
    oturum başlayınca ekran okuyucu "Oku çalışması başladı", sayfa/ayet ve "Bu
    ayette 4 kelime var" diye okuyor mu; odak "Sıradaki kelimeyi aç, düğme"de
    mi ve düğme ekranda görünüyor mu? Enter/Space (dokunmatik ekran okuyucuda
    çift dokunuş) her seferinde "1. kelime: adıyla" gibi bir satır okutuyor
    mu; art arda hızlı basınca yalnızca sonuncusunun okunması mı, yoksa
    hepsinin kuyruğa girip gecikmesi mi oluyor (hangisi daha az rahatsız
    ediyor)? "Ayet tamamlandı" ile ayetin sesli okunması konuşmanın üstüne
    biniyor mu? Ayet okunurken düğmeye basmak sessiz kalıyor: kullanıcıyı
    şaşırtıyor mu ("bekleyin" duyurusu gerekir mi)? Kapaklı kelimeler artık
    sayfa metninden gizli (`aria-hidden`): göz atma kipinde ya da dokunarak
    gezinirken açılmamış kelimeler hiç okunmuyor, açılan kelime kapağı
    kalkınca okunuyor mu (satırın geri kalanı akıcı mı, kelimeler arasında
    gereksiz duraklama yok mu)? Göz atma kipi arabelleği oturum sırasında
    güncel kalıyor mu, imleç kayıyor mu? Açılan Arapça kelimeyi duymak için
    sayfa metnine gitmek gerekiyor: bu akış kullanılabilir mi? Bitince
    ("Ezber çalışması bitti") odak "Ezber" düğmesinde mi, sayfa metni yeniden
    tam okunuyor mu; Yaz'da "Sıradaki kelimeyi aç" hiç duyulmuyor mu?
20. Ezber > Yaz (klavyeyle başlat; Fâtiha 1-2 yeter): oturum başlayınca ekran
    okuyucu "Yaz çalışması başladı", sayfa/ayet ve "Bu ayette 19 harf var"
    diye okuyor mu; odak ilk tuşta ("ا elif, düğme") ve odak halkası görünüyor
    mu? Klavyeye gelince "Arapça harf klavyesi, grup" duyuluyor mu; tuş adları
    ("ب be" vb.) anlaşılır mı, Türkçe okunuşlar (elif, be, te, se, cim, ha,
    hı, dal, zel, ra, ze, sin, şın, sad, dad, tı, zı, ayn, gayn, fe, kaf, kef,
    lam, mim, nun, he, vav, ye, hemze) doğru ve uygun mu (Arapça sesi olan bir
    okuyucuda harf ve okunuş art arda okununca gereksiz yineleme oluyor mu)?
    Doğru tuş "Doğru", yanlış tuş "Bu harf değil", kelime sonunda "Doğru.
    Kelime tamamlandı" okunuyor mu; hızlı art arda basışta yalnızca
    sonuncusunun okunması rahatsız ediyor mu? Açılan harfin kendisi okunmuyor
    (yalnızca tuşun adı): yeterli mi? 💡 "İpucu: <karşılık>" okutuyor, tekrar
    basınca "İpucu kapatıldı" mı? Oklar (Sol/Sağ/Yukarı/Aşağı) odağı tuşlar
    arasında gezdiriyor ve sayfayı çevirmiyor mu (NVDA/JAWS göz atma kipinde
    oklar ve harf tuşlarını okuyucu kendisi tüketebilir: Tab + Enter yolu
    yeterli mi)? Arapça klavye düzeniyle (donanım ya da ekran klavyesi) bir
    harfe basmak doğrudan o harfi açıyor mu? Ayet okunurken tuşlar sessiz
    kalıyor: kullanıcıyı şaşırtıyor mu? Sayfa metni: bir kelime son harfi
    yazılana kadar okunmuyor, tamamlanınca okunuyor mu (yarım kelime hiç
    okunmuyor mu; ayet sonu işaretleri okunuyor mu)? Bitince odak "Ezber"
    düğmesinde mi?

Beklenenden farklı çıkarsa canlı bölge değişikliği, dil işaretleri, modal odak
yönetimi, ayet gezgini, alt kopyanın gizlenmesi, Oynat düğmesinin adı, renk
kontrastı / Ezber odak halkası, konu bağlantılarının klavye erişimi, `hidden`
kuralı / Geri düğmesi, hedefsiz konu etiketlerinin düz metin görünümü, Sa'dî
tefsirinin dil işaretleri, Sure Bilgisi ayrıntı görünümünün odağı, Sure
Bilgisi'nde kapalı bölümlerin gizlenmesi, Ezber > Oku'nun klavye yolu (iki
küçük düzeltmesiyle birlikte: Oku'da Türkçe karşılık verisinin yüklenmesi, ses
başarısızken ayet atlama), Ezber > Yaz'ın klavye yolu ve Ezber'de kapak altı
metnin ağaçtan çıkarılması ayrı ayrı tek commit'tir, geri alınabilir.

### Kelime tahlili

Ekran görüntüsündeki gibi her kelimenin altında isim/fiil/harf, bâb,
zaman, şahıs, cem-i müzekker/müennes gibi geleneksel Arapça gramer
bilgisi göstermek istiyoruz. Üç seçenek var, üçü de aynı ~77.430 kelimeyi
kapsıyor:

- **QUL'un root/stem/lemma exportu** (`qul.tarteel.ai/resources/morphology`)
  -- yalnızca kök/gövde/sözlük hali veriyor, POS/gramer bilgisi yok.
  Tek başına yetmez.
- **corpus.quran.com** (Quranic Arabic Corpus, Kais Dukes, Leeds Üniversitesi)
  -- QUL'un root/stem/lemma'sının asıl kaynağı; ama kendisi çok daha
  zengin: her kelimeyi POS + tam morfolojik özelliklerle (zaman, şahıs,
  cinsiyet, i'rab hâli...) etiketliyor, üstelik **bilhassa geleneksel
  Arapça nahiv/sarf çerçevesine göre** (bkz. proje sayfası). Format:
  `(6:76:7:1) qaAla | STEM POS:V PERF LEM:qaAla ROOT:qwl 3MS`. GNU
  GPL ile `corpus.quran.com/download/`'dan indirilebiliyor (GPL
  "paylaş-aynı-şekilde" şartı taşıyor -- projemiz zaten açık kaynak
  olduğu için sorun değil).
- **sina.birzeit.edu/quran** (QuranMorph, Birzeit Üniversitesi/SinaLab)
  -- daha yeni, 3 dilbilimci tarafından elle etiketlenmiş, Qabas
  sözlüğüne bağlı lemma'lar ve 40 etiketli daha zengin bir tagset
  (SAMA/Qabas) kullanıyor, açık kaynak.

Üçünün de POS etiketleri İngilizce/Latin kısaltma (`V`, `PERF`, `3MS`
gibi) -- asıl iş, hangi kaynağı seçersek seçelim, bu etiketleri "Fi'l-i
Mazi", "Cem'i Müzekker Muhatab", "İftiâl Bâbı" gibi Türkçe geleneksel
terimlere çeviren bir eşleme sözlüğü kurmak (~40 etiket + fiil bâbları).
Bu, kelime meali/meal/tefsir'den çok daha büyük bir iş; hangi kaynaktan
başlayacağımıza (muhtemelen corpus.quran.com -- daha köklü/belgeli) karar
verip ilerleyeceğiz.

### El-Müfredât

Kuranmeali.com'un elmufredat.sql'i (Ragıb el-İsfahânî'nin El-Müfredât'ı,
Abdulbaki Güneş–Mehmet Yolcu çevirisi) kullanılmama kararı kesinleşti
(bkz. proje notları) — kalan yol: Arapça aslını (~1000 yıllık, kamu malı)
Şamele gibi açık bir kaynaktan çekip üstüne kendi/lisanslı bir Türkçe
karşılık koymak. Bu, kelime meali/meal/tefsir'den çok daha büyük, ayrı
bir proje olur; henüz başlanmadı.
