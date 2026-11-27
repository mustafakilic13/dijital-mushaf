# Mushaf — Dijital Kur'an-ı Kerim (Digital Khatt V2)

Tarayıcıda çalışan, 604 sayfalık matbu mushaf görünümlü bir Kur'an-ı Kerim
okuyucusu: her ayet için kelime meali, meal ve tefsir; konu fihristi; arama;
kelime vurgulu sesli okuma; ezber araçları. Kurulum ya da hesap gerekmez;
telefonda ve bilgisayarda açılır, istenirse ana ekrana eklenip internetsiz de
kullanılır.

**Canlı:** https://mustafakilic13.github.io/dijital-mushaf/

Bu belge kullanıcılar içindir. Kodu incelemek, yerelde çalıştırmak, test etmek
ya da katkı vermek isterseniz [GELISTIRICI.md](GELISTIRICI.md)'ye bakın.

## Neler var

- **Mushaf sayfaları:** matbu mushaf düzeninde 604 sayfa; satırlar, harflerin
  arasına kaşide (hat uzatması) eklenerek sütun genişliğine oturtuluyor
  (Digital Khatt V2 tekniği). Metin seçilip kopyalanabiliyor.
- **Gezinme:** cüz, hizb, rub, menzil, sure ve sayfa numarasıyla; kaldığınız
  yer hatırlanıyor.
- **Ayet detayı:** bir ayete dokununca altında kelime kelime Türkçe karşılık,
  meal (Elmalılı Muhammed Hamdi Yazır) ve Sa'dî tefsiri açılıyor.
- **Konu Fihristi** (konulara göre ayetler) ve **Sure Bilgisi** (her surenin
  tanıtımı).
- **Arama:** ayete, sureye, cüze ya da sayfaya git; sure, konu, meal, kelime
  meali, Arapça metin ve (isteğe bağlı) tefsir içinde ara.
- **Sesli okuma:** iki kârî; okunan kelime sayfada vurgulanıyor.
- **Ezber:** dinle, oku, yaz.
- **Klavye ve ekran okuyucu** ile kullanılabiliyor.
- **Kurulabilir, çevrimdışı çalışan** bir PWA.

Her birinin ayrıntısı aşağıda.

## Kullanım

### Gezinme

Üst çubukta üç düğme var: **Cüz** (solda), **Sayfa** (ortada) ve **Sure**
(sağda). Her biri o an bulunduğunuz yeri gösterir; dokununca ilgili listeyi ya
da sayfa girişini açar.

- **Cüz** düğmesi Cüz, Hizb, Rub ve Menzil sekmeli bir liste açar; bir satıra
  dokunmak o birimin ilk ayetine götürür.
- **Sayfa** düğmesi bir sayfa numarası alanı, − / + düğmeleri ve bir kaydırıcı
  sunar.
- **Sure** düğmesi 114 sureyi listeler. Bir sureye dokunmak 1. ayetine
  götürür; satırın yanındaki ok simgesi surenin ayet numaralarını açar, bir
  ayet numarasına dokunmak o ayete götürür.

**Sayfa çevirme:** parmağınızı kaydırarak (sağa kaydırmak ileri), ekranın
kenarlarındaki ok düğmeleriyle ya da klavyedeki ← / → tuşlarıyla. Ok düğmeleri
ve tuşlar, sonraki sayfanın mushafta sola doğru olmasına uyar: soldaki ok (ve
← tuşu) ileri, sağdaki ok (ve → tuşu) geri götürür. Son sayfadan sonra ilk
sayfaya, ilk sayfadan geri gidince son sayfaya dönülür.

**Ayet seçimi:** sayfada her zaman bir ayet seçilidir (altın renkte
vurgulanır). Sayfadaki başka bir ayetin metnine dokunarak seçimi
değiştirirsiniz; bu aynı zamanda ayet detayını açar (aşağıya bakın).

**Konumunuz:** son bakılan sayfa ve ayet tarayıcınızda saklanır; uygulamayı
yeniden açtığınızda kaldığınız yerden devam edersiniz. Adres çubuğundaki
`#page=N` (ör. `.../dijital-mushaf/#page=50`) o sayfayı açan bir bağlantıdır;
paylaşabilir ya da yer imine ekleyebilirsiniz. Uygulama açıkken ekranın
kararmaması istenir (tarayıcınız destekliyorsa).

### Ayet detayı

Sayfada bir ayetin metnine dokunun: ayet seçilir ve ayetin son satırından
hemen sonra bir panel açılır (sayfanın kalanı aşağı kayar). Panelde sırayla
şunlar var:

- **Konu etiketleri** (ayetin konuları varsa): birine dokunmak Konu Fihristi'ni
  açar.
- **Kelime meali:** ayetin her Arapça kelimesi ve Türkçe karşılığı.
- **Meal:** Elmalılı Muhammed Hamdi Yazır'ın sadeleştirilmiş Türkçe meali.
- **Tefsir:** "Tefsîr-i Sa'dî" düğmesine basınca açılır, tekrar basınca
  kapanır; metnin altında çevirinin kaynağı (QuranEnc.com) gösterilir.

Paneli kapatmak için aynı ayete ya da başka bir ayete tekrar dokunun, **Kapat**
düğmesine ya da **Esc** tuşuna basın.

### Konu Fihristi ve Sure Bilgisi

**Konu Fihristi.** Bir konu etiketine dokununca açılan pencerede konunun Arapça
adı ve açıklaması, ana, ilişkili ve alt konuları ve o konuya bağlı bütün ayetler
(Arapça metin ve meal) listelenir. Konular arasında aynı pencerede gezinebilir,
**Geri** düğmesiyle bir adım geri dönebilirsiniz; "Mushaf'ta Ayete Git"
düğmesi ayeti kendi sayfasında açar.

**Sure Bilgisi.** Sayfadaki sure başlığı kutusuna dokununca o sureyi tanıtan bir
pencere açılır: ayet sayısı, iniş yeri ve cüz bilgisi ile surenin ismi, iniş
dönemi gibi başlıklı bölümler. Metindeki ayet bağlantıları aynı pencerede
ayetin Arapçasını ve mealini gösterir; sure bağlantıları o sureye gitmeyi
teklif eder.

### Arama

Alt çubuktaki **Arama** düğmesi arama penceresini açar. Kutu boşken son
aramalarınız ve popüler konular görünür; yazdıkça sonuçlar bölümlere ayrılır:

- **Git:** `2:255`, `Bakara 255`, `yasin suresi`, `36. sure`, `cüz 30` ya da
  `sayfa 50` gibi bir hedef yazarsanız doğrudan oraya gidebilirsiniz; **Enter**
  ilk hedefe götürür.
- **Sureler:** Türkçe ya da İngilizce yazılışıyla veya Arapça adıyla ("ihlas",
  "imran", "al baqarah").
- **Konular:** Konu Fihristi'nde konu adına göre.
- **Ayetler:** mealin tam metninde; yazdığınız bütün sözcükleri içeren ayetler
  gösterilir (hiçbirinde hepsi yoksa en az birini içerenler, bir notla).
- **Kelime meali:** kelime karşılıklarında.
- **Arapça metin:** Arapça harflerle yazarsanız ayetlerin Arapça metninde
  (harekesiz de yazabilirsiniz).
- **Tefsir (Sa'dî):** varsayılan olarak kapalıdır; sonuçların altındaki
  "Sa'dî tefsirinde de ara" düğmesine basınca tefsir metni (yaklaşık 8 MB)
  indirilir ve onda da aranır.

Büyük/küçük harf, Türkçe karakter ve şapka farkı önemli değil ("sukur" ile
"şükür" aynı sonucu verir); "sabır" aranınca "sabrı" gibi ekli biçimler de
bulunur. Bir sonuca dokunmak sizi ayete, sureye ya da konuya götürür.

### Sesli okuma

Alt çubuktaki **Oynat** düğmesi, seçili ayetten (seçili ayet yoksa sayfanın ilk
ayetinden) başlayıp Kur'an'ın sonuna (114:6) kadar kesintisiz okur. Okunan
kelime sayfada vurgulanır, sayfa kendiliğinden çevrilir. Çalarken düğme
**Duraklat** olur; tekrar basınca kaldığı ayetten devam edilir. Bir surenin 1.
ayeti okunurken önce Fâtiha'da istiâze (eûzü), Tevbe dışındaki diğer surelerde
besmele okunur.

Kârî **Husarî (Mücevved)**'dir; **Abdülbâsıt Abdüssamed (Mücevved)** yalnızca
Ezber > Dinle'de seçilebilir. Ayet sesleri internetten gelir
([Gizlilik](#gizlilik)); dinlediğiniz ayetler tarayıcıda saklanır ve sonradan
internetsiz de çalınabilir ([Bilinen sınırlar](#bilinen-sınırlar)).

### Ezber

Alt çubuktaki **Ezber** düğmesi üç sekmeli bir pencere açar. Üçünde de bir sure
ve bir başlangıç / bitiş ayeti seçersiniz; son ayarlarınız hatırlanır.

- **Dinle:** kârîyi, her ayetin kaç kez okunacağını (**Ayet Tekrar Sayısı**) ve
  bütün aralığın kaç kez baştan alınacağını (**Aynısını Tekrar Sayısı**)
  seçersiniz (1-99). Okuma birikimlidir: 1. ayet seçtiğiniz kadar okunur, sonra
  aralığın başından o ayete kadar her ayet bir kez tekrarlanır; sonra 2. ayet,
  yine başından 2. ayete kadar tekrar... Böylece zincir her ayette uzar.
- **Oku:** sıradaki ayet ve sonrakiler kapaklarla gizlenir. Sıradaki ayete
  dokundukça sıradaki kelime açılır ve Türkçe karşılığı kısa süre gösterilir.
  Son kelime açılınca ayet okunur ve sıradaki ayete geçilir.
- **Yaz:** aynı gizleme; bu kez ekrandaki Arapça klavyeden (Arapça klavye
  düzeniniz açıksa gerçek klavyeden de) ayetin harflerini sırayla yazarsınız.
  Doğru harf açılır; yanlış tuşta hiçbir şey olmaz. 💡 tuşu, sıradaki kelimenin
  Türkçe anlamını gösterir.

Oku ve Yaz oturumu sürerken Ezber düğmesi **Bitir**'e dönüşür; basınca
kapaklar kalkar ve oturum biter.

## Klavye ve ekran okuyucu

Uygulama klavyeyle ve ekran okuyucuyla kullanılabilsin diye yazıldı:

| Tuş | Ne yapar |
|---|---|
| ← / → | Sonraki / önceki sayfa (ekrandaki ok düğmeleriyle aynı yön; bir pencere açıkken ya da ok tuşlarını kendisi kullanan bir öğedeyken çalışmaz) |
| ↑ / ↓, Home, End | Sayfa gezgininde ayetler arasında gider ve gittiği ayeti seçer |
| Enter / Boşluk | Sayfa gezgininde ayet detayını açar ya da kapatır; sure başlığı düğmesinde Sure Bilgisi'ni açar |
| Esc | Açık pencereyi ya da ayet detayını kapatır |
| ← / →, Home, End | Pencerelerdeki sekmeler arasında gider (Cüz penceresi, Ezber) |
| ↑ / ↓, Home, End, PageUp, PageDown | Pencerelerdeki listelerde (sure, cüz, Ezber seçicileri, ayet numaraları) satırlar arasında gider; ayet numaralarında ← / → de çalışır. Her liste tek bir Tab durağıdır |

**Sayfa gezgini:** görünmeyen ama Tab ile ulaşılan bu bölgede, sayfadaki her
sure başlığı ve her ayet bir düğmedir (ör. "Fâtiha Suresi, 3. ayet"). Ayet
detayına ve Sure Bilgisi'ne klavyeyle ve ekran okuyucuyla bu yoldan ulaşılır.

Sayfa, sure ve ayet geçişleri ekran okuyucuya duyurulur (ör. "Sayfa 2, Bakara
Suresi, 1. ayet"). Ezber > Oku'da bir kelime açmak için "Sıradaki kelimeyi aç"
düğmesi, Ezber > Yaz'da oklarla gezilen ekrandaki Arapça klavye vardır.

Bunlar otomatik testlerle ve başsız bir Chromium'da ölçülerek doğrulandı;
**NVDA, JAWS, VoiceOver ve TalkBack ile gerçek cihaz testi yapılmadı**
([Bilinen sınırlar](#bilinen-sınırlar)).

## Çevrimdışı kullanım ve kurulum

Mushaf bir PWA'dır: tarayıcınızın "Ana ekrana ekle" ya da "Uygulamayı yükle"
seçeneğiyle uygulama gibi kurabilirsiniz.

- **İlk ziyarette** uygulama dosyaları ve temel veri (Arapça metin, meal,
  gezinme tabloları) indirilir; sonrasında internet olmadan açılır ve Arapça
  metni ile Türkçe meali gösterir.
- **İlk kullanımda** indirilip saklananlar: kelime meali, Konu Fihristi, Sure
  Bilgisi, Sa'dî tefsiri ve sesli okumadaki kelime zamanlamaları (bunlar için
  ilk seferde internet gerekir). Sure başlıkları, kurulumdan sonraki birkaç
  dakika içinde arka planda indirilir.
- **Ses:** dinlediğiniz ayetler saklanır. Tarayıcının depolama kotası dolmaya
  yaklaşınca en eski kayıtlar kendiliğinden silinir. Fâtiha'dan önce çalan
  eûzü klipleri kurulumla birlikte inen dosyalardır.
- **Güncelleme:** internet varken uygulama her açılışta en güncel sürümünü
  alır; bir şey yapmanız gerekmez.

## Gizlilik

- Hesap, reklam ya da izleme yoktur. Uygulamanın sayfaları ve verileri (mushaf
  metni, meal, tefsir, konular...) aynı siteden gelir. Site GitHub Pages'te
  barındırılır; barındırıcı olarak GitHub'ın kendi gizlilik koşulları geçerlidir.
- Dışarıdaki tek sunucu, ayet seslerinin geldiği `audio-cdn.tarteel.ai`'dir.
  Ses çalmadıkça (Oynat, Ezber) bu sunucuya istek yapılmaz; çaldığınızda
  tarayıcınız o sunucuya bağlanır ve IP adresiniz o sunucu tarafından görülür.
- Tarayıcınızda şunlar saklanır: son bakılan sayfa ve ayet, son aramalarınız,
  Ezber ayarlarınız ve çevrimdışı çalışma için önbellek (uygulama dosyaları,
  veriler, dinlediğiniz sesler). Hiçbiri bir sunucuya gönderilmez; tarayıcınızın
  site verilerini silerek temizleyebilirsiniz.
- Ezber penceresinin altındaki GitHub bağlantıları ("Kaynak Kod", "Kaynaklar ve
  lisanslar") yalnızca dokunduğunuzda açılır.

## Bilinen sınırlar

- **Gerçek cihaz testi sınırlı.** Arayüz ve erişilebilirlik, otomatik testlerle
  ve başsız bir Chromium'da denendi. Gerçek cihazda yalnızca birkaç kart
  koşuldu, hepsi bir Android 16 telefonda Firefox 160 ile: temel işlevlerin
  hızlı denemesi (föyün A bölümü: sayfa, gezinme, ayet paneli, konular, arama,
  sesli okuma, Ezber, ekran yönü; Titanium'da da, Chromium tabanlı),
  okunabilirlik (D3), ayet sesi ve çevrimdışı eûzü (G3, yalnızca Firefox) ile
  kurulum ve çevrimdışı açılış (G5). Hepsi çalıştı. NVDA, JAWS, VoiceOver ve
  TalkBack ile, Safari'de, masaüstü tarayıcılarda ve tabletlerde denenmedi.
  Denenecekler adım adım ve güncel durum [TEST_FOYU.md](TEST_FOYU.md)'de.
- **Ses internet ister.** Ayet sesleri Tarteel'in sunucusundan gelir; ilk
  dinleme için internet ve o sunucunun erişilebilir olması gerekir. Çevrimdışı
  ses önbelleği yalnızca sahte bir ses sunucusuyla (Chromium'da) sınandı,
  gerçek sunucuyla sınanmadı.
- **Tefsir tek: Sa'dî (Türkçe).**
- **Veri hataları olabilir.** Verilerin çoğu QUL'dan alındı ve kaynaktaki
  hatalar uygulamaya geçmiş olabilir (kelime mealindeki bilinen bir kayma, 2:267,
  düzeltildi). Bir hata görürseniz bildirin.
- **Hak durumu:** bazı kaynakların hak sahibi ve izin durumu doğrulanamadı
  ([Lisans ve telif](#lisans-ve-telif)).

## Geliştiriciler için

Derleme adımı yoktur: düz HTML, CSS ve JavaScript'tir ve GitHub Pages'te
doğrudan çalışır. Mimari, her özelliğin ayrıntıları, erişilebilirlik
ölçümleri, çevrimdışı önbellekleme, testler ve CI, veri üretimi ve açık işler
[GELISTIRICI.md](GELISTIRICI.md)'de. Kaynak kod:
https://github.com/mustafakilic13/dijital-mushaf

## Lisans ve telif

**Proje lisansı.** Bu projede yazılan kod, testler ve belgeler GNU Genel Kamu
Lisansı'nın 3. sürümü ya da (tercihinize göre) daha sonraki bir sürümü
(`GPL-3.0-or-later`) altında yayımlanıyor; Telif © 2026 Mustafa Kılıç ve katkıda
bulunanlar. Geçerli metin, İngilizce `LICENSE` dosyasındadır. Kısaca: kodu
kullanabilir, inceleyebilir, değiştirebilir ve dağıtabilirsiniz; projeyi ya da
türevini dağıtan kişi onu aynı lisansla ve kaynak koduyla birlikte sunmalıdır.
Program HİÇBİR GARANTİ olmadan dağıtılır.

**Kapsam dışı olanlar.** Aşağıdakiler projenin kendi lisansının kapsamında
DEĞİL; her biri kendi sahibinin koşullarına tabidir:

- **Üçüncü taraf kod, yazı tipi ve logo:** DigitalKhatt (MIT), harfbuzzjs,
  HarfBuzz, wawoff2 ve Brotli; altbilgideki GitHub logosu ise GitHub'ın
  markasıdır. Bildirimleri ve lisans metinleri `THIRD_PARTY_NOTICES.md`,
  `vendor/LICENSE`, `vendor/LICENSE-Apache-2.0` ve
  `vendor/woff2-decompress/LICENSE` dosyalarında.
- **Veri, ses ve yazı tipi dosyaları** (`data/`, `audio/`, `fonts/`,
  `tools/raw-data/`): Arapça metin ve sayfa düzeni, meal, kelime meali, Sa'dî
  tefsiri, Konu Fihristi, Sure Bilgisi, ses adresleri ve zamanlamaları, eûzü
  klipleri, sure başlığı yazı tipi. Kaynakları ve lisans durumları dosya dosya
  `VERI_KAYNAKLARI.md`'de. Bu verilerin çoğunun indirildiği QUL, kullandığımız
  hiçbir kaynak için lisans bilgisi vermiyor ("We don't have copyright
  information for this resource."); bu yüzden kaynakların büyük bölümünün hak
  sahibi ve izin durumu doğrulanamayan olarak kayıtlı. Bu bir hukuki görüş
  değildir.

**Atıf.** Konu Fihristi'ndeki ontoloji konuları Quranic Arabic Corpus'a (Kais
Dukes, Leeds Üniversitesi; GNU GPL v3) dayanıyor: https://corpus.quran.com
(kullanım koşulu: kaynak açıkça belirtilecek ve bu adrese bağlantı verilecek).
Verilerin çoğu QUL'dan (https://qul.tarteel.ai), Arapça yazı tipi ve dizgi
tekniği DigitalKhatt'tan (https://github.com/DigitalKhatt/digitalkhatt-js)
alındı. Sa'dî tefsirinin Türkçe çevirisinin kaynağı QuranEnc.com'dur
(https://quranenc.com/tr/home); çeviriler yayıncıya ve kaynağa atıf, sürüm
numarası ve değişiklik yapmama şartlarıyla yeniden yayımlanabiliyor (ayrıntı
`VERI_KAYNAKLARI.md`, bölüm 5). Uygulama bu atfı gösteriyor: ayet panelinde
tefsir metninin altında ve arama sonuçlarında "Tefsir (Sa'dî)" bölümünün
başında "Türkçe çeviri: QuranEnc.com (Kur'an-ı Kerim Ansiklopedisi), sürüm
V1.0.0." satırı çıkıyor (sürüm, QuranEnc'in
listesinde görünen sürümdür, kopyanın o sürüm olduğu doğrulanmadı). Ayrıca
Ezber penceresinin altındaki "Kaynak Kod — GitHub" bağlantısının yanında,
GitHub'daki `VERI_KAYNAKLARI.md`'ye giden bir "Kaynaklar ve lisanslar"
bağlantısı var; Konu Fihristi penceresinde Corpus'a doğrudan atıf henüz yok
([açık işler](GELISTIRICI.md#lisans-ve-telif-açık-işler)).

**Hak sahibiyseniz** ve atıfın düzeltilmesini ya da bir içeriğin kaldırılmasını
istiyorsanız, `VERI_KAYNAKLARI.md`'deki "Hak sahibiyseniz" bölümüne bakın.
