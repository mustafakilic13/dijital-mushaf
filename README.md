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
indirgenir) aralıktaki her ayetin Elmalılı meali + kendi "Mushaf'ta Ayete
Git" butonuna (`goToAyah`) dönüşür — ikisi de `#surah-info-detail`
alt-panelinde, `.ezber-surah-picker`'la aynı geri-gidilebilir düzende
(bkz. `js/app.js`'teki `openSurahInfoLink`/`closeSurahInfoDetail`).
`test/surah_info_links_test.mjs`, `parseInfoLink`'i güncel
`surah-info-tr.json`'daki linklerin tamamına karşı doğruluyor.

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

## Proje yapısı

```
index.html            Uygulama kabuğu
serve.py               .wasm'ı doğru Content-Type ile sunan yerel geliştirme sunucusu
css/style.css          Görünüm (kağıt/zümrüt paleti, bkz. aşağı)
js/justify.js          Kaşide/gerdirme algoritması (DigitalKhatt'tan uyarlandı)
js/render.js            HarfBuzz şekillendirme + SVG glyph çizimi + ayet vurgusu
js/wordmeal.js          Kelime meali: veri yükleme + kelime/çeviri gruplama mantığı
js/meal.js               Meal: veri yükleme + render (kaynak: Elmalılı M. Hamdi Yazır)
js/tafsir.js              Tefsir: kaynak kaydı + veri yükleme + ayet-grubu çözümleme
js/surahinfo.js           Sure Bilgisi: veri yükleme + <h2> sınırlarından akordeon bölümleri
js/app.js               Sayfa yükleme, önbellek, gezinme, modaller, ayet seçimi, ayet detay paneli
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

Orijinal hedef listesinden kalanlar: **ezber**, **arama** (üçüncü madde olan
**kelime vurgulu ses çalma** tamamlandı — bkz. `js/app.js`,
`state.playback`/`syncHighlightLoop`/`updateWordHighlight`). Bunlara ek
olarak üzerinde durduğumuz ama henüz karara bağlamadığımız üç konu var --
kuranmeali.com'dan izin cevabı gelene kadar burada not olarak duruyorlar.

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

### Kur'an Fihristi

[QUL: Topics and Concepts in the Quran](https://qul.tarteel.ai/resources/ayah-topics)
-- 2512 konu, ayet ayet eşleştirilmiş, açık lisanslı. Tek eksiği başlıkların
İngilizce olması. Plan: alt/üst başlıkları biz Türkçeye çevirip
(`Ablution` → `Abdest` gibi), ayet-konu eşleştirmesinin kendisine
dokunmadan üstüne koyacağız -- böylece hem açık kalır hem bizim
katkımız (çeviri) net olur. kuranmeali.com'dan izin gelirse, onların
(Süleyman Ateş Meali tabanlı) fihristini de ayrı/ek bir seçenek olarak
değerlendiririz.

### El-Müfredât

kuranmeali.com'a izin e-postası gönderildi, cevap bekleniyor. Cevap
olumsuz ya da gelmezse: Arapça aslı (~1000 yıllık, kamu malı) bir açık
kaynaktan (ör. Şamele kütüphanesi) çekip üstüne kendi/lisanslı bir
Türkçe karşılık koymak ayrı, daha uzun bir proje olur.
