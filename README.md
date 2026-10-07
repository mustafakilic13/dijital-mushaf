# Mushaf — Dijital Kur'an-ı Kerim (Digital Khatt V2)

QUL (Quranic Universal Library) verileriyle, `digitalkhatt.org/digitalmushaf`
ile aynı teknikle birebir sayfa görünümlü bir mushaf okuyucu. Derleme adımı
yok — düz HTML/CSS/JS, GitHub Pages'te doğrudan çalışır.

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

Bkz. `THIRD_PARTY_NOTICES.md` — atıf ve MIT lisans metni.

Sonuç: 604 sayfanın tamamı Node.js üzerinden otomatik test edildi (bkz.
`test/`), sıfır hata, sıfır satır hedef genişliğin dışında kaldı.

## Gezinme

Üst çubukta üç buton var: **Cüz** (sol) — **Sayfa** (orta) — **Sure** (sağ),
her biri o an neredeysen onu gösteriyor ve dokununca ilgili listeyi/sayfa
girişini açıyor (Sure/Cüz listeleri açılınca mevcut konumu otomatik
ortalıyor). Sure modalında bir sureye/ayete dokunmak açık olan tüm ayet
akordeonlarını da kapatır.

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
`openSurahInfoLink`/`closeSurahInfoDetail`). `test/surah_info_links_test.mjs`,
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
`ayahPanelBodyHTML`).

**Neden bu kadar dolambaçlı:** Sayfa tek parça bir SVG olduğu için ("Nasıl
çalışır" bölümüne bakın), paneli normal bir HTML akışının arasına sokmak
mümkün değil. Bunun yerine sayfa görsel olarak ikiye "dilimleniyor":

- **üst dilim** — sayfanın gerçek, önbellekteki SVG'si, `overflow:hidden`
  bir kutu içinde, sadece dokunulan ayetin son satırına kadar görünecek
  yükseklikte,
- panel,
- **alt dilim** — aynı SVG'nin bir *klonu*, yukarı kaydırılmış, sadece
  kesim noktasından sonrası görünecek şekilde.

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
`onTafsirTabClick` ve `animateTafsirClosed`). `sources` (`js/tafsir.js`)
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
içermiyor.

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
kapsıyor.

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
kopyası, tüm etiketli ayetlere karşı doğrulanıyor.

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
cd test && npm install
node search_test.mjs && node arama_ui_test.mjs
```

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
içeriğin gelmesi (sekme düğmeleri `aria-expanded`/`aria-pressed` taşımıyor,
içeriğin geldiğini bildiren tek şey canlı bölge) -- için canlı bölge artık
yalnızca `.word-meal-body` üzerinde.

**Görünmez metin katmanı.** `js/render.js`'teki `addTextSelectionLayer`,
her mushaf satırının gerçek/seçilebilir Unicode metnini bir
`<foreignObject><div class="text-layer-line" dir="rtl">` ile (görünür
glif'leri çizen SVG `<path>`'lerin üstüne, `color: transparent` ile --
`display:none`/`visibility:hidden` DEĞİL) yerleştiriyor; PDF.js'in metin
katmanı tekniğinin aynısı. Hiçbir yerde `aria-hidden` uygulanmıyor, üst
SVG'de de `role="img"` yok (olsaydı içindeki gerçek metni tek bir resim
gibi "yutabilirdi"). Yapısal olarak doğru.

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
görüntüleri ve metin katmanı satırlarının ölçüleri değişmedi. Kapsam dışı:
Sa'dî tefsiri metinlerinin içindeki seyrek Arapça alıntılar (verideki ~12
bin dizenin 99'unda Arapça harf var) hâlâ işaretsiz -- satır içi HTML'in
içinden ayıklamak daha büyük bir iş. Bilinen başka bir eksik: Oynat
düğmesinin erişilebilir adı yalnızca o Arapça ibare (`aria-label` yok); ad
artık Arapça sesle okunur ama düğmenin ne yaptığını Türkçe söyleyen bir ad
yok.

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
  dokunarak açılan Sure Bilgisi'nin odaklanabilir bir açanı yok; orada
  kapanışta odağa dokunulmuyor (bkz. Yapılacaklar'daki klavye notu).

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

**Otomatik doğrulama, gerçek cihaz testinin YERİNE DEĞİL.**
`test/erisilebilirlik_test.mjs`, yukarıdaki ikisini + genel ARIA
etiketlerini hem kaynak metin üzerinden hem [axe-core](https://github.com/dequelabs/axe-core)
ile jsdom'a monte edilmiş DOM üzerinde tarıyor (yalnızca yapısal/ARIA
kuralları -- renk kontrastı gibi gerçek düzen/görünürlük gerektiren
kurallar jsdom'da güvenilir olmadığından çalıştırılmıyor). Bu ortamda
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
serve.py               .wasm'ı doğru Content-Type ile sunan yerel geliştirme sunucusu
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
js/app.js               Sayfa yükleme, önbellek, gezinme, modaller, ayet seçimi, ayet detay paneli, konu fihristi
data/mushaf.json         604 sayfa × satır × kelime (QUL'dan üretildi, ~3MB)
data/surahs.json          Sure adları/metadata (Türkçe isim dahil) + başlık glyph'i
data/surah-pages.json     Sure → başlangıç sayfası
data/juz.json              Cüz → başlangıç sayfası
data/ayahs.json             Her ayet → [sayfa, ilkKelimeId, sonKelimeId]
data/page-first-ayah.json    Sayfa → o sayfadaki ilk ayet [sure, ayet]
data/word-meal.json          Kelime meali (Türkçe, QUL word-by-word export, ~1.6MB)
data/meal.json                Meal (Türkçe, Elmalılı M. Hamdi Yazır sadeleştirilmiş, ~1MB)
data/tafsir-saadi.json         Tefsîr-i Sa'dî (QUL export, ayet-grubu yönlendirmeli, ~8.7MB)
data/surah-info-tr.json        Sure Bilgisi (Türkçe, QUL surah-info exportundan çevrildi, 114 sure, ~950KB)
data/topics-tr.json            Konu Fihristi (Türkçe, QUL ayah-topics exportundan çevrildi, 2512 konu, ~950KB)
data/surah-headers/         Her sure için hazır SVG path verisi (114 dosya)
fonts/                    DigitalKhattV2.woff2 (tarayıcıda gerçekten yüklenen tek font)
vendor/                   hb.wasm, hb.js, hbjs.js (resmi harfbuzzjs, MIT) +
                          woff2-decompress/ (wawoff2, MIT — bkz. THIRD_PARTY_NOTICES.md)
tools/build_data.py       Ham QUL exportlarından data/*.json üreten script
tools/patch_word_meal.py      word-meal.json'daki bilinen QUL hatalarını düzeltir
tools/raw-data/           Ham build girdileri (bkz. Veriyi güncellemek) + QCF_SurahHeader_COLOR-Regular.woff2
                          (sadece build_data.py'nin sure başlığı SVG'lerini üretmek için okuduğu
                          kaynak; tarayıcı hiç yüklemiyor, bkz. madde 5 yukarıda)
test/full_corpus_test.mjs  604 sayfayı Node'da render edip doğrulayan test
test/search_test.mjs        Arama saf mantığı (Node)
test/arama_ui_test.mjs       Arama modalı arayüzü (jsdom)
test/erisilebilirlik_test.mjs Anons bölgesi + axe-core yapısal tarama (jsdom)
test/modal_odak_test.mjs        Modal odak yönetimi: işaretleme, Tab döngüsü, açan öğeye dönüş, app.js bağlantısı (jsdom)
test/sw_test.mjs              Servis worker: sahte self/caches ile (Node)
```

## Çalıştırma

Herhangi bir statik sunucu yeterli, ör.:

```bash
cd quran-app
python3 -m http.server 8000
# http://localhost:8000
```

**Not:** `vendor/hb.wasm` tarayıcıda `WebAssembly.instantiateStreaming()`
ile yükleniyor, ki bu da sunucunun `.wasm` dosyasını tam olarak
`application/wasm` Content-Type'ıyla döndürmesini şart koşuyor. Python'ın
kendi `mimetypes` modülünün bu eşlemeyi tanıyıp tanımaması işletim
sistemine/Python sürümüne göre değişiyor -- tanımıyorsa konsolda şunu
görürsün:

```
wasm streaming compile failed: ... Incorrect response MIME type ...
falling back to ArrayBuffer instantiation
```

Bu bir hata değil: `vendor/hb.js` (resmi HarfBuzz WASM yükleyicisi) bunu
zaten yakalayıp daha yavaş ama çalışan bir yola (`WebAssembly.instantiate`)
düşüyor, mushaf yine render oluyor. Konsolu temiz tutmak ve o küçük
gecikmeyi de önlemek istersen, `python3 -m http.server` yerine:

```bash
cd quran-app
python3 serve.py 8000
```

(Aynı `http.server`, sadece `.wasm` için doğru Content-Type'ı zorluyor.)
Başka bir statik sunucu/host kullanıyorsan (Node'un `serve`'ü, Nginx,
Cloudflare Pages, vb.) çoğu bunu zaten doğru yapıyor; yine de bir kez
tarayıcı konsolunu kontrol etmekte fayda var.

**GitHub Pages:** Bu klasörü olduğu gibi bir repoya koyup Pages'i
`main`/`root`'tan yayınlaman yeterli — build adımı yok. (GitHub Pages
`.wasm`'ı doğru MIME type'la sunuyor, `serve.py`'ye gerek yok.)

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

## Yapılacaklar

Orijinal hedef listesinden kalanlar: **ezber** (**arama** tamamlandı — bkz.
yukarıdaki "Arama" bölümü; üçüncü madde olan **kelime vurgulu ses çalma** da
tamamlandı — bkz. `js/app.js`,
`state.playback`/`syncHighlightLoop`/`updateWordHighlight`). Bunlara ek
olarak üzerinde durduğumuz ama henüz karara bağlamadığımız iki konu var.
Kuranmeali.com verisi kullanılmama kararı kesinleşti (bkz. proje
notları) — aşağıdaki ikisi de artık yalnızca QUL/bağımsız açık kaynaklar
arasından seçim meselesi.

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
   listesinde de yap.
3. Bir ayete dokununca (fareyle tıklayınca) "<Sure> <ayet> detayı açıldı"
   duyuluyor mu; panel gövdesinin ilk içeriği en fazla bir kez okunuyor mu
   (yeni eklenen bir canlı bölgenin ilk içeriğini bazı ekran okuyucular
   okur, bazıları okumaz). **Not: bu panele klavyeyle ulaşılamıyor.**
   Ayet paneli de, sure başlığındaki Sure Bilgisi de yalnızca sayfa
   SVG'sine gelen `click` ile açılıyor (`els.pageContainer` işleyicisi,
   ayet `pointToAyah(e.clientX, e.clientY, ...)` ile imleç konumundan
   bulunuyor); odaklanabilir bir öğe ya da Enter/Space işleyicisi yok.
   Bir ekran okuyucunun "etkinleştir" hareketinin bu SVG'ye `click`
   üretip üretmediği de sınanmadı. Bu ayrı bir erişilebilirlik açığı ve
   ayrı bir yamayla çözülmeli.
4. Tefsir sekmesine basınca tefsir metni okunuyor mu.
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

Beklenenden farklı çıkarsa canlı bölge değişikliği, dil işaretleri ve modal
odak yönetimi ayrı ayrı tek commit'tir, geri alınabilir.

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
