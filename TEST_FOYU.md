# Elle test föyü

Bu föy, otomatik testlerin ve başsız Chromium ölçümlerinin gösteremediği
şeyleri GERÇEK ortamda denemek içindir: NVDA, JAWS, VoiceOver ve TalkBack gibi
ekran okuyucular, Firefox ve Safari, gerçek telefon ve tabletler, gerçek ses
sunucusu ve yayındaki adres. [README.md](README.md)'deki "Bilinen sınırlar"
maddelerinin denenebilir karşılığıdır.

**Durum:** bu föydeki hiçbir kart henüz gerçek bir cihazda, tarayıcıda ya da
ekran okuyucuyla koşulmadı. Sonuç tablosu bilerek boştur ve boş kalmalıdır
(`test/foy_test.mjs` bunu denetler): her koşuda tabloyu kopyala, kopyayı
doldur ve sonucu (tablo + Not'lar) bir GitHub Issue'suna yaz. Bu dosyaya
sonuç yazma.

Kartların kaynağı iki yerden gelir. **ER-n** ve **PW-n**,
[GELISTIRICI.md](GELISTIRICI.md)'deki iki kontrol listesinin n. maddesidir:
[Erişilebilirlik: gerçek cihaz/ekran okuyucu testi](GELISTIRICI.md#erişilebilirlik-gerçek-cihazekran-okuyucu-testi)
(ER) ve
[PWA: gerçek tarayıcıda ses önbelleği testi](GELISTIRICI.md#pwa-gerçek-tarayıcıda-ses-önbelleği-testi)
(PW). **README: bölüm** ise README'nin o bölümünde yazan bir sözdür. Beklenenden
farklı çıkarsa hangi kodun düzeltileceğini o listelerin sonundaki "Beklenenden
farklı çıkarsa" paragrafı söyler.

## Bölümler

- [A. Duman testi](#a-duman-testi): hızlı genel kontrol; her tarayıcıda ve
  cihazda.
- [B. Ekran okuyucu: sayfa ve ayet gezgini](#b-ekran-okuyucu-sayfa-ve-ayet-gezgini)
- [C. Ekran okuyucu: panel, pencereler, konu ve Sure Bilgisi](#c-ekran-okuyucu-panel-pencereler-konu-ve-sure-bilgisi)
- [D. Oynat düğmesi ve görünüm](#d-oynat-düğmesi-ve-görünüm)
- [E. Ezber](#e-ezber)
- [F. Klavye ve listeler](#f-klavye-ve-listeler)
- [G. Ses sunucusu, çevrimdışı ve kurulum](#g-ses-sunucusu-çevrimdışı-ve-kurulum)
- [Sonuç tablosu](#sonuç-tablosu) ve [Kaynak maddeleri](#kaynak-maddeleri)

## Nasıl kullanılır

1. [Hazırlık](#hazırlık) bölümünü oku ve elindeki ortamı (cihaz, tarayıcı,
   ekran okuyucu) seç.
2. Kartları sırayla uygula. Her kartın "Gerekir" satırı neye ihtiyaç olduğunu
   söyler; elinde yoksa kartı atla (Y).
3. Kartta önce "Adımlar"ı yap, sonra "Beklenen"in her satırını gördüğün ya da
   duyduğunla karşılaştır.
4. Sonucu sonuç tablosunun kopyasına yaz.
5. Beklenen'de "Karar sende" diye geçen yerler ölçü değil izlenimdir:
   rahatsız etmiyorsa G, ediyorsa K yaz ve nasıl rahatsız ettiğini Not'a ekle.

| Kod | Anlamı |
|---|---|
| G | Geçti: Beklenen'in her satırı doğru. |
| K | Kaldı: en az bir satır tutmadı; Not'a hangisi olduğunu ve ne gördüğünü ya da duyduğunu olduğu gibi yaz. |
| Y | Yapılamadı: gereken cihaz ya da özellik yok, adım çalıştırılamadı; Not'a nedenini yaz. |
| ? | Karar veremedim; Not'a ne gördüğünü ya da duyduğunu yaz. |

Yazım: «…» uygulamanın kendi metni ya da adıdır (kodda ya da HTML'de aynen
geçer; `test/foy_test.mjs` varlığını denetler). "…" ekran okuyucunun söylemesi
beklenen ya da örnek metindir. `…` bir tuş, adres, kimlik ya da dosya adıdır.

## Hazırlık

### Ortam

Her kartı her kombinasyonda koşmak gerekmez. A bölümünü Chrome'da, Firefox'ta
ve Safari'de (README'ye göre ikisi hiç denenmedi) bir kez koş. B–F bölümlerini
en az bir masaüstü kombinasyonunda ve bir telefon kombinasyonunda koş. G'yi
önce Chrome'da, G3'ü ayrıca Firefox ve Safari'de koş.

| Platform | Tarayıcı | Ekran okuyucu |
|---|---|---|
| Windows | Chrome, Firefox | NVDA (ücretsiz), JAWS (varsa) |
| macOS | Safari, Chrome | VoiceOver |
| iPhone, iPad | Safari | VoiceOver |
| Android | Chrome | TalkBack |

### Ne gerekir

Her kartın "Gerekir" satırı bu terimlerden oluşur.

| Terim | Anlamı |
|---|---|
| yalnızca tarayıcı | Ekran okuyucu ya da özel araç gerekmez; göz ve fare ya da parmak yeter. |
| ekran okuyucu | NVDA, JAWS, VoiceOver ya da TalkBack. |
| klavye | Fiziksel klavye (telefonda ya da tablette bağlı klavye de olur). |
| dokunmatik cihaz | Gerçek telefon ya da tablet. |
| DevTools | Masaüstü tarayıcının geliştirici araçları (F12). |
| internet | Gerçek ses sunucusuna (`audio-cdn.tarteel.ai`) erişen bir bağlantı. |
| çevrimdışı | Uçak modu ya da DevTools > Network > Offline. |
| sesle kumanda | iOS Ses Kontrolü ya da Windows Sesli Erişim. |

### Ekran okuyucu ipuçları

- **NVDA:** NVDA menüsü > Araçlar > Konuşma Görüntüleyicisi, NVDA'nın söylediği
  her şeyi yazıya döker; Not'a oradan kopyala. NVDA+Boşluk göz atma ve odak
  kipi arasında geçer. Göz atma kipinde B tuşu sıradaki düğmeye atlar (JAWS'ta
  da).
- **VoiceOver (macOS):** Cmd+F5 açar ve kapatır; VO tuşu Ctrl+Option'dır.
  VoiceOver Utility'deki "caption panel" söylenenleri ekranda gösterir.
- **VoiceOver (iOS) ve TalkBack:** sağa ya da sola kaydırmak sıradaki ya da
  önceki öğeye geçer, çift dokunuş etkinleştirir.
- Arapça kartlarda (B3) cihazda bir Arapça ses yüklü olmalı ve ekran
  okuyucunun otomatik dil değiştirme seçeneği açık olmalı (NVDA'da Konuşma
  ayarlarında; VoiceOver ve TalkBack'te ses paketlerinde bakılır).

### Test verisi

- Fâtiha: yayın adresinin sonuna `#page=1` ekle. İlk sayfadır; 7 ayet, sure
  başlığı kutusu ve seçili ilk ayet var.
- Bakara: «Sure» düğmesi > Bakara (286 ayet). Ayetü'l-Kürsî için «Arama»ya
  `Bakara 255` yaz ve Enter'a bas.
- Âl-i İmrân: «Sure» düğmesi > Âl-i İmrân (200 ayet).
- Ezber aralığı: Fâtiha 1–2.
- Yayın adresi: https://mustafakilic13.github.io/dijital-mushaf/. Service
  worker yalnızca HTTPS'te ya da `localhost`'ta çalışır; G bölümü için yayın
  adresi şarttır.

### Rapor şablonu

Her koşunun başına şunu yaz:

```
Tarih:
Cihaz ve işletim sistemi (sürümle):
Tarayıcı (sürümle):
Ekran okuyucu (sürümle) ve ayarları:
Cihazda Arapça ses var mı:
Ağ (Wi-Fi, mobil, uçak modu):
Denenen sürüm (GitHub'daki son commit'in kısa kodu):
```

## A. Duman testi

Ekran okuyucu gerekmez. Amaç, README'de yazan şeylerin Firefox'ta, Safari'de ve
gerçek telefonlarda temel olarak çalıştığını görmektir. Her tarayıcı ve cihaz
için bir kez koş.

### A1 · İlk açılış ve sayfa görünümü

**Kaynak:** README: Neler var · **Gerekir:** yalnızca tarayıcı

1. Yayın adresini temiz bir sekmede (gizli pencere iyi olur) aç.
2. «Mushaf yükleniyor…» yazısı kaybolana kadar bekle.
3. Açılan ilk sayfayı (Fâtiha, sayfa 1) incele: satırlar, harekeler, kaşide
   (harf uzatması), sure başlığı kutusu, üst ve alt çubuk.
4. Adres çubuğunda sayfa numarasını değiştirerek `#page=2`, `#page=50` ve
   `#page=604` sayfalarına git; her sayfada satırların sütun genişliğine
   oturduğuna bak.
5. Bir ayetin metnini seçip kopyala ve bir metin kutusuna yapıştır.

**Beklenen**

- Yükleme yazısı kaybolur ve sayfa çizilir; ekranda «Yükleme hatası» ya da
  başka bir hata iletisi çıkmaz.
- Arapça harfler doğru birleşir, harekeler yerinde durur; satırlar kaşideyle
  sütun genişliğine oturur; sağdan ya da soldan taşma ve kesilme yoktur.
- Sure başlığı kutusu çizilir. Karar sende: Firefox'ta ya da Safari'de
  Chromium'dan farklı görünüyorsa (renk, boyut, eksik parça) ne gördüğünü yaz.
- Yapıştırılan metin Arapça harflerle çıkar (kutucuk ya da soru işareti yok).

### A2 · Gezinme

**Kaynak:** README: Gezinme · **Gerekir:** yalnızca tarayıcı (kaydırma için
dokunmatik cihaz; ok tuşları için klavye)

1. Üst çubukta «Cüz» düğmesine bas: Cüz, Hizb, Rub ve Menzil sekmeleri açılır.
   Bir satıra bas.
2. «Sayfa» düğmesine bas («Sayfaya Git»): numara alanı, − / + düğmeleri ve
   kaydırıcı var. Bir numara yazıp «Git»e bas.
3. «Sure» düğmesine bas («Sure Seç»): bir sureye bas. Sonra bir satırın
   yanındaki ok simgesine bas ve bir ayet numarasına bas.
4. Sayfa çevir: parmakla sağa kaydır, ekranın kenarlarındaki ok düğmeleri,
   klavyede ← ve →.
5. Sayfa 604'te ileri, sayfa 1'de geri git.
6. Sekmeyi kapatıp adresi yeniden aç. Başka bir sekmede `…/#page=50` adresini
   aç.

**Beklenen**

- «Cüz» penceresi dört sekmeyle açılır; seçilen satır o birimin ilk ayetine
  götürür.
- «Sayfa» penceresi numara alanı, − / + düğmeleri, kaydırıcı ve «Git» ile
  çalışır.
- «Sure» penceresi 114 sureyi listeler; sure satırı 1. ayete, ok simgesiyle
  açılan ayet numarası o ayete götürür.
- Sağa kaydırmak ileri, sola kaydırmak geri çevirir. Soldaki ok ve ← ileri,
  sağdaki ok ve → geri götürür.
- Sayfa 604'ten ileri gidince sayfa 1'e, sayfa 1'den geri gidince sayfa
  604'e dönülür.
- Sekme kapatılıp açılınca son sayfa ve ayet hatırlanır; `#page=50` bağlantısı
  sayfa 50'yi açar.

### A3 · Ayet detayı paneli

**Kaynak:** README: Ayet detayı · **Gerekir:** yalnızca tarayıcı

1. Sayfa 1'de bir ayetin metnine dokun (tıkla).
2. Panelin ayetin son satırından hemen sonra açıldığına ve sayfanın kalanının
   aşağı kaydığına bak. İçeriği sırayla incele: konu etiketleri (ayetin
   konuları varsa), kelime meali, meal ve «Tefsîr-i Sa'dî» düğmesi.
3. «Tefsîr-i Sa'dî» düğmesine bas; tekrar bas.
4. Paneli şu yollarla kapat (her seferinde yeniden aç): aynı ayete tekrar
   dokunmak, başka bir ayete dokunmak, «Kapat», Esc.

**Beklenen**

- Panel ayetin altında açılır; Türkçe karakterler (ş, ğ, ı, â, î) doğru
  görünür.
- Tefsir düğmesi tefsiri açar ve kapatır; açıkken metnin altında çevirinin
  kaynağı (QuranEnc.com) görünür.
- Aynı ayete dokunmak paneli kapatır. Başka bir ayete dokunmak o ayeti seçer
  ve paneli kapatır (o ayetin panelini görmek için bir kez daha dokunmak
  gerekir). «Kapat» ve Esc de kapatır.

### A4 · Konu Fihristi ve Sure Bilgisi

**Kaynak:** README: Konu Fihristi ve Sure Bilgisi · **Gerekir:** yalnızca
tarayıcı

1. Konu etiketi olan bir ayetin panelini aç ve bir etikete dokun.
2. Pencerede konunun Arapça adını, açıklamasını, ana, ilişkili ve alt
   konularını ve ayet listesini incele. Bir ilişkili konuya geç, sonra
   «Geri dön»e bas.
3. Listedeki bir ayette «Mushaf'ta Ayete Git»e bas.
4. Sayfadaki bir sure başlığı kutusuna dokun. Sure Bilgisi'nde bölümleri
   aç ve kapat; metindeki bir ayet bağlantısına ve bir sure bağlantısına
   dokun.

**Beklenen**

- Konu penceresi başlık, açıklama, ilişkili konular ve ayet listesiyle açılır
  (ayetlerin Arapçası ve meali); konular arasında aynı pencerede gezilir;
  «Geri dön» bir adım geri götürür.
- «Mushaf'ta Ayete Git» ayeti kendi sayfasında açar.
- Sure Bilgisi ayet sayısı, iniş yeri ve cüz bilgisiyle başlıklı bölümleri
  gösterir. Ayet bağlantısı aynı pencerede ayetin Arapçasını ve mealini
  gösterir; sure bağlantısı o sureye gitmeyi teklif eder («Mushaf'a Sureye
  Git»).

### A5 · Arama

**Kaynak:** README: Arama · **Gerekir:** yalnızca tarayıcı (tefsir araması için
internet)

1. Alt çubukta «Arama»ya bas. Kutu boşken son aramaların ve popüler konuların
   göründüğüne bak.
2. Sırayla yaz ve sonuçlara bak: `Bakara 255` (Enter'a bas), `ihlas`, `sabır`,
   `sukur` ve `şükür`, harekesiz bir Arapça sözcük.
3. Sonuçların altındaki «Sa'dî tefsirinde de ara» düğmesine bas (yaklaşık 8 MB
   iner) ve bir sözcük ara.
4. Bir sonuca dokun.

**Beklenen**

- Sonuçlar bölümlere ayrılır; `Bakara 255` yazıp Enter'a basmak 2:255'e
  götürür.
- `sukur` ve `şükür` aynı sonucu verir; `sabır` aranınca "sabrı" gibi ekli
  biçimler de bulunur.
- Tefsir araması düğmeye basınca açılır ve sonuçlar «Tefsir (Sa'dî)»
  bölümünde gelir.
- Bir sonuca dokunmak ayete, sureye ya da konuya götürür.

### A6 · Sesli okuma

**Kaynak:** README: Sesli okuma, PW-3 · **Gerekir:** internet

1. `#page=1` adresinde hiçbir ayet seçmeden alt çubukta «Oynat»a bas.
2. İlk ayetten önce çalan klibi (Fâtiha'da istiâze) ve ardından ayetin
   okunmasını izle; okunan kelimenin sayfada vurgulandığına bak.
3. Düğmenin adının «Duraklat» olduğunu gör; bas, ses dursun; tekrar bas.
4. Sayfanın sonuna kadar çalmasına izin ver.
5. Başka bir sureye (ör. Bakara) geç ve 1. ayetten «Oynat»a bas.

**Beklenen**

- «Oynat» çalmayı başlatır ve düğmenin adı «Duraklat» olur. Duraklatınca ses
  durur; tekrar basınca kaldığı ayetten devam eder.
- Okunan kelime sayfada vurgulanır; sayfa kendiliğinden çevrilir.
- Fâtiha'da ilk ayetten önce istiâze (eûzü), Tevbe dışındaki surelerin 1.
  ayetinden önce besmele okunur.
- Karar sende: mobilde ilk dokunuştan sonra ses hemen başlıyor (tarayıcının
  otomatik oynatma kısıtı seste gecikme ya da sessizlik yaratmıyor).

### A7 · Ezber

**Kaynak:** README: Ezber · **Gerekir:** internet (Dinle ve Oku'daki ayet sesi)

1. Alt çubukta «Ezber»e bas: Dinle, Oku ve Yaz sekmeleri. Sure olarak Fâtiha,
   aralık olarak 1–2 seç.
2. Dinle: «Ayet Tekrar Sayısı»nı 2 yap ve «Uygula ve Dinlemeye Başla»ya bas.
3. Oku: «Uygula ve Okumaya Başla»ya bas. Sıradaki ayet kapaklarla gizlenir;
   ayete dokundukça sıradaki kelime açılır ve Türkçe karşılığı kısa süre
   görünür. Ezber düğmesi «Bitir» olur; bas.
4. Yaz: «Uygula ve Yazmaya Başla»ya bas. Ekrandaki Arapça klavyeden ayetin
   harflerini sırayla yaz; yanlış bir tuşa da bas; 💡 tuşuna bas. «Bitir»e bas.
5. Ezber penceresini kapatıp yeniden aç.

**Beklenen**

- Ezber penceresi üç sekmeyle açılır. Kapatıp açınca son sure ve aralık
  hatırlanır.
- Dinle: her ayet seçtiğin tekrar sayısı kadar çalar.
- Oku: dokundukça kelime açılır, Türkçe karşılığı kısa süre görünür; son
  kelimede ayet okunur ve sıradaki ayete geçilir.
- Yaz: doğru harf açılır, yanlış tuşta hiçbir şey olmaz, 💡 sıradaki kelimenin
  Türkçe anlamını gösterir.
- Oku ve Yaz sürerken düğme «Bitir» olur; basınca kapaklar kalkar, oturum
  biter ve düğme yeniden «Ezber» olur.

### A8 · Yön, yakınlaştırma ve ekran kararması

**Kaynak:** README: Gezinme · **Gerekir:** dokunmatik cihaz

1. Telefonu ya da tableti dik ve yatay tut; her yönde 1. sayfaya, bir ayet
   paneline ve «Sure» penceresine bak.
2. İki parmakla yakınlaştır ve uzaklaştır; sayfa kaydırmayla karışıyor mu?
3. Tarayıcının adres çubuğu gizlenip belirirken alt çubuğa (Ezber, Oynat,
   Arama) bak.
4. Ekranın kendiliğinden kararma süresinden uzun bir süre hiç dokunmadan bekle.

**Beklenen**

- README bu konuda ayrıntılı bir söz vermiyor: amaç gözlem. Her yönde içerik
  taşmadan ve kesilmeden kullanılabiliyorsa G, değilse K yaz ve ne olduğunu
  anlat.
- Uygulama açıkken ekranın kararmaması istenir (tarayıcın destekliyorsa).
  Ekran karardıysa Not'a tarayıcıyı ve sürümü yaz; bu bir hata değil, tarayıcı
  desteği bilgisidir.

## B. Ekran okuyucu: sayfa ve ayet gezgini

Ekran okuyucu açık olsun. Sayfa gezgini (`#ayah-nav`), sayfadaki sure
başlıklarını ve ayetleri düğme olarak sunan, görünmeyen ama Tab ile ulaşılan
bölgedir; ayet detayına ve Sure Bilgisi'ne klavyeyle ve ekran okuyucuyla bu
yoldan ulaşılır.

### B1 · Sayfa geçişi anonsu

**Kaynak:** ER-1 · **Gerekir:** ekran okuyucu, klavye

1. Ekran okuyucuyu aç ve uygulamanın yüklenmesini bekle.
2. Sayfayı çevir (← ya da ekrandaki «Sonraki sayfa» ve «Önceki sayfa»
   düğmeleri; telefonda düğmeyi ekran okuyucuyla etkinleştir) ve söyleneni
   dinle.
3. Sayfa çevrildikten sonra sayfa metnine GİTME; bir süre bekle ve kendiliğinden
   bir şey okunup okunmadığına bak.
4. «Sure» düğmesinden başka bir sureye gidip aynısını yap.

**Beklenen**

- Her sayfa geçişinde "Sayfa 2, Bakara Suresi, 1. ayet" biçiminde bir anons
  duyulur (sayfa numarası, sure adı, ayet numarası; anons `#nav-announcer`
  canlı bölgesinden gelir).
- Sayfanın Arapça metni kendiliğinden okunmaz (sayfa alanı canlı bölge
  değildir).

### B2 · Sayfa metni: gezinme ve akıcılık

**Kaynak:** ER-2 · **Gerekir:** ekran okuyucu

1. `#page=1` sayfasında ekran okuyucuyla sayfa metnine git (göz atma kipinde
   aşağı ok; VoiceOver'da VO+Sağ; dokunmatik cihazda sağa kaydırma).
2. Satırları baştan sona sırayla dinle.
3. Bir satırın tek akıcı satır olarak mı, yoksa kelimeler tek tek ya da
   aralarında kesintiyle mi okunduğuna dikkat et (satırlar kelime başına bir
   `<span>`'dır).

**Beklenen**

- Metin katmanı gezinilerek okunabilir: her satır okunur, sıra görsel sıraya
  uyar, hiçbir satır atlanmaz. Bilinen risk: SVG içindeki `foreignObject`
  deseni tarayıcı ve ekran okuyucu birleşimlerinde tutarsız olabilir; sonucu
  ortamla birlikte yaz.
- Karar sende: satır tek akıcı satır olarak okunuyor; kelimeler arasında
  gereksiz kesinti yok.

### B3 · Arapça ve Türkçe ses seçimi

**Kaynak:** ER-2 · **Gerekir:** ekran okuyucu (cihazda Arapça ses yüklü,
otomatik dil değiştirme açık)

1. Sayfa metnindeki bir Arapça satırı dinle.
2. Üst çubuktaki Arapça sure adını, «Oynat» düğmesini ve «Sure» listesini
   dinle.
3. Fâtiha'da bir ayetin panelini aç ve tefsir bölümünü aç (A3'teki düğme). Arapça
   alıntıları ve parantezli Türkçe ifadeleri dinle (ör. "إياك : Sana",
   "(takva sahiplerine)").

**Beklenen**

- Arapça metin Arapça sesle okunur (metin katmanı satırları `lang="ar"` taşır;
  belge dili `tr`).
- Üst çubuktaki Arapça sure adı, Oynat düğmesindeki ibare ve sure
  listesindeki Arapça adlar Arapça sesle okunur; Türkçe eylem ("Oynat")
  Türkçe sesle okunur.
- Tefsir'de Arapça alıntılar Arapça sesle, parantezli Türkçe ifadeler Türkçe
  sesle okunur; veride hatalı etiketlenmiş bir parçada başka bir dilin sesi
  (ör. Hintçe ya da Almanca) seçilmez.
- Not'a Arapça sesi olmayan bir cihazda ne duyulduğunu da yaz.

### B4 · Ayet gezgini: Tab ile okuma

**Kaynak:** ER-8 · **Gerekir:** ekran okuyucu, klavye

1. Sayfada Tab ile ilerle (ya da ekran okuyucunun düğme gezintisini kullan) ve
   sayfa gezginine gel.
2. Bölge ve liste adlarını dinle.
3. Bir ayet düğmesine gel; adını ve durumunu dinle. Seçili ayeti bul. Bir
   ayetin panelini aç (Enter) ve o ayet düğmesine yeniden gel.
4. Düğmenin açıklamasını (ipucu) dinle.

**Beklenen**

- Bölge ve listeler okunur: «Sayfa gezgini», «Sure başlıkları» ve «Sayfadaki
  ayetler».
- Düğmeler adlarıyla okunur: "Fâtiha Suresi, 3. ayet, düğme"; seçili ayette
  "geçerli"; panel açıkken "genişletilmiş" gibi durum da duyulur.
- İpucu (`aria-describedby`) okunur: «Ayetler arasında gezinmek için yukarı ve
  aşağı ok tuşlarını, ayrıntıyı açıp kapatmak için Enter tuşunu kullanın.»

### B5 · Yukarı/Aşağı ile gezinirken çift okuma

**Kaynak:** ER-9 · **Gerekir:** ekran okuyucu, klavye

1. Sayfa gezgininde bir ayet düğmesine Tab ile odaklan.
2. Aşağı ok'a birkaç kez, sonra Yukarı ok'a bas.
3. Her adımda duyulanı not al: odaklanan düğmenin adı ("Fâtiha Suresi, 3.
   ayet, düğme") ve sayfa anonsu ("Sayfa 1, Fâtiha Suresi, 3. ayet") art arda
   iki kez mi okunuyor?

**Beklenen**

- Her adımda ayet adı duyulur.
- Karar sende: aynı bilginin ikinci kez okunması (düğme adı ve anons)
  rahatsız ediyorsa K yaz ve ne duyduğunu yaz. Şimdilik güvenli taraf olarak
  ikisi de duruyor; rahatsız ediyorsa biri kaldırılmalı.

### B6 · Enter ile ayet paneli ve odak

**Kaynak:** ER-10 · **Gerekir:** ekran okuyucu, klavye

1. Sayfa gezgininde bir ayet düğmesinde Enter'a bas.
2. Odağın nerede olduğuna ve okunana bak.
3. Tab ile panelin içindeki düğmelere ve konu etiketlerine git.
4. Esc'ye bas; tekrar aç ve «Kapat»a bas. Odağa ve okunana bak.
5. VoiceOver (iOS ya da macOS) ve TalkBack'te gezgin düğmesini "etkinleştir"
   hareketiyle (çift dokunuş, VO+Boşluk) aç.

**Beklenen**

- Enter paneli açar; odak panele geçer ve "Fâtiha 2 detayı, bölge" gibi bir ad
  okunur.
- Tab panelin içindeki düğmelere ve konu etiketlerine gider.
- Esc ya da «Kapat» paneli kapatır; odak o ayetin gezgin düğmesine döner ve
  düğme okunur.
- VoiceOver ve TalkBack'in etkinleştir hareketi gezgin düğmesine tıklama
  üretir ve panel açılır.

### B7 · Göz atma kipi: NVDA ve JAWS

**Kaynak:** ER-11 · **Gerekir:** ekran okuyucu (NVDA ya da JAWS), klavye

1. Göz atma (sanal imleç) kipinde ayet gezgininin düğmelerine gel (ok
   tuşlarıyla ya da B tuşuyla).
2. Seçili olmayan bir ayetin düğmesinde Enter'a bas.
3. Bir sure başlığı düğmesinde Enter'a bas.

**Beklenen**

- Seçili olmayan ayette Enter önce ayeti seçer, sonra paneli açar.
- Sure başlığı düğmesinde Enter Sure Bilgisi'ni açar.
- Bu kipte ok tuşlarını ekran okuyucu kendisi kullanır; gezginin Yukarı/Aşağı
  işleyicisinin çalışmaması beklenir (hata değil).

### B8 · Panel açıkken sayfa metni

**Kaynak:** ER-12 · **Gerekir:** ekran okuyucu

1. Bir ayetin panelini aç.
2. Ekran okuyucuyla sayfa metnini baştan sona gez (göz atma kipi ya da
   dokunarak).
3. Panelin altında sayfa metninin yeniden başlayıp başlamadığına bak.
4. VoiceOver ya da TalkBack'te panelin altındaki satırların üstünde parmakla
   gez.

**Beklenen**

- Sayfa metni bir kez okunur: önce sayfa, sonra panel; panelin altında sayfa
  metni yeniden başlamaz.
- Panelin altındaki satırlarda sessizlik beklenir (alt kopya `aria-hidden`).
  Karar sende: bu sessizlik rahatsız ediyorsa K yaz ve nasıl rahatsız ettiğini
  anlat (GELISTIRICI.md'de bir alternatif yöntem tarif edilmiş).

### B9 · Fare ya da dokunmayla ayet seçimi

**Kaynak:** ER-3 · **Gerekir:** ekran okuyucu

1. Ekran okuyucu açıkken sayfada bir ayetin metnine fareyle tıkla ya da
   dokun.
2. Duyulan anonsu dinle; panel gövdesinin ilk içeriğinin kaç kez okunduğunu
   say.
3. Ekran okuyucunun "etkinleştir" hareketini sayfa metni üzerinde dene
   (VoiceOver'da çift dokunuş).

**Beklenen**

- "Fâtiha 2 detayı açıldı" biçiminde bir anons duyulur.
- Panelin ilk içeriği en fazla bir kez okunur.
- Karar sende: etkinleştir hareketi sayfa SVG'sine tıklama üretiyor mu? Bu yol
  hiç denenmedi; sonucu yaz. Klavye ve ekran okuyucu için asıl yol sayfa
  gezginidir (B6).

## C. Ekran okuyucu: panel, pencereler, konu ve Sure Bilgisi

### C1 · Tefsir düğmesi

**Kaynak:** ER-4 · **Gerekir:** ekran okuyucu

1. Bir ayetin panelini aç; «Tefsîr-i Sa'dî» düğmesine odaklan ve durumunu
   dinle.
2. Düğmeye bas; tefsir metninin okunuşunu ve düğmenin durum duyurusunu dinle.
3. Düğmeye tekrar bas.
4. Göz atma kipinde (ya da dokunarak) panelin içine git.

**Beklenen**

- Odaklanınca "daraltılmış", basınca "genişletilmiş", tekrar basınca yine
  "daraltılmış" duyulur.
- Açılınca tefsir metni okunur. Karar sende: bu okuma düğmenin durum
  duyurusunu kesmiyor ya da onunla çakışmıyor (metin binlerce karakterdir ve
  canlı bölgedir).
- Kapatınca metin artık okunmaz; göz atma kipinde düğmenin altında tefsir
  metni kalmaz.

### C2 · Ayet panelini kapatma

**Kaynak:** ER-5, ER-10 · **Gerekir:** ekran okuyucu, klavye

1. Sayfa gezgininden Enter ile bir ayetin panelini aç.
2. «Kapat»a bas ve duyulanı dinle.
3. Paneli yeniden aç, Esc'ye bas ve duyulanı dinle.

**Beklenen**

- İki yolda da «Ayet detayı kapatıldı» duyulur.
- Panel gezgin düğmesinden açıldıysa odak kapanınca o ayetin düğmesine döner
  ve düğme okunur.

### C3 · Pencere açılışı: başlık ve odak

**Kaynak:** ER-6 · **Gerekir:** ekran okuyucu, klavye

1. Üst çubukta «Sure» düğmesine bas («Sure Seç»).
2. Okunan başlığı ve rolü dinle.
3. Tab ve Shift+Tab ile pencerenin içinde dön; dışına çıkıp çıkmadığına bak.
4. Aynısını «Cüz» («Cüz Seç»), «Sayfa» («Sayfaya Git»), «Ezber» ve «Arama»
   pencerelerinde de yap.

**Beklenen**

- Pencere açılınca ekran okuyucu başlığı ve rolü okur ("Sure Seç, iletişim
  kutusu" gibi).
- Odak pencerenin içindedir; Tab ve Shift+Tab pencerenin dışına çıkmadan
  döner.

### C4 · Pencere kapanışı: odak dönüşü

**Kaynak:** ER-7 · **Gerekir:** ekran okuyucu, klavye

1. «Sure» penceresini aç ve her seferinde yeniden açarak şu yollarla kapat:
   «Kapat», Esc, pencerenin dışına (perdeye) dokunmak, bir sure seçmek. Her
   kapanışta odağa ve okunana bak.
2. iPhone'da aynısını dene (Safari tıklanan düğmeye odak vermez).
3. Zinciri dene: «Arama» > sonuçlardan bir konu > pencereyi kapat.

**Beklenen**

- Her kapanış yolunda odak pencereyi açan düğmeye döner ve ekran okuyucu o
  düğmeyi okur.
- iPhone'da da aynıdır: açan düğme, tıklanan son etkileşimli öğeden (en fazla
  1 sn önce) bulunur.
- Arama > konu zincirinde odak başa, yani «Arama» düğmesine döner.

### C5 · Konu penceresi

**Kaynak:** ER-15 · **Gerekir:** ekran okuyucu, klavye

1. Bir ayetin panelinde bir konu etiketine gir (ör. "Allah").
2. Açıklamadaki "Kur'an" ve "İslam" bağlantılarına Tab ile gel; ad ve rolü
   dinle.
3. Enter'a (dokunmatik ekran okuyucuda çift dokunuşa) bas; yeni başlığı dinle.
   Bağlantıda Space'e bas.
4. Bir konu etiketine (çip) Enter'la gir. Odak halkasına bak.
5. "Kalp" konusunda "vücut azaları" gibi hedefsiz etiketi dinle.
6. Kökte «Geri dön» düğmesinin duyulup duyulmadığına bak. Bir ya da iki konu
   ilerle ve «Geri dön»e bas.

**Beklenen**

- Bağlantılar "Kur'an, bağlantı" gibi okunur. Enter konuya götürür ve "Kur'an,
  iletişim kutusu" gibi yeni bir başlık duyulur. Space bir şey yapmaz. Çipe
  Enter basınca da başlık duyulur.
- Odak halkası bağlantının çevresinde net görünür.
- Hedefsiz etiketler düz metin olarak okunur ve cümlenin akışını bozmaz.
- Kökte «Geri dön» hiç duyulmaz. Geri dönünce önceki konunun başlığı ("Allah,
  iletişim kutusu") duyulur ve odak sayfanın başına kaçmaz.

### C6 · Sure Bilgisi: ayrıntı görünümü

**Kaynak:** ER-17 · **Gerekir:** ekran okuyucu, klavye

1. Sayfa gezgininde bir sure başlığı düğmesiyle Sure Bilgisi'ni aç (ör.
   "Fâtiha Suresi hakkında bilgi").
2. Metindeki bir bağlantıya ("Bakara" ya da "1-32" gibi) Enter'la gir;
   okunan başlığı dinle.
3. Tab'la «Kapat»a, sonra «Geri dön»e git. «Geri dön»e bas; odağa bak.
4. Ayrıntıdaki «Mushaf'a Sureye Git» ve «Mushaf'ta Ayete Git»e bas; odağın
   nereye gittiğine bak.

**Beklenen**

- Bağlantıya Enter basınca "Bakara, iletişim kutusu" gibi başlık okunur.
  Karar sende: başlık değişmediği için yeni bir görünüme girildiği anlaşılıyor
  (anlaşılmıyorsa ayrıntı paneline bir ad ya da başlık gerekir).
- Tab «Kapat»a, sonra «Geri dön»e gider. «Geri dön» odağı aynı bağlantıya
  döndürür ve bağlantı okunur.
- «Mushaf'a Sureye Git» ve «Mushaf'ta Ayete Git»ten sonra odak gidilen ayetin
  gezgin düğmesindedir. Karar sende: sayfa yeniden kurulana kadar (yaklaşık
  40–60 ms) eski açan düğmenin kısa süre okunması rahatsız etmiyor.

### C7 · Sure Bilgisi: kapalı bölümler

**Kaynak:** ER-18 · **Gerekir:** ekran okuyucu, klavye

1. Âl-i İmrân'ın Sure Bilgisi'ni aç (yalnızca "İsim" bölümü açıktır).
2. Tab'la gez: nerelerde durduğuna bak. Ekran okuyucuyla (göz atma kipi dahil)
   kapalı bölümlerin metnini okumayı dene.
3. Bir bölüm başlığında Enter ya da Space ile bölümü aç; içeriğin hemen okunur
   olup olmadığına bak.
4. Pencereyi kapatıp yeniden aç ve Shift+Tab'a bas.

**Beklenen**

- Tab yalnızca «Kapat»a, bölüm başlıklarına ve açık bölümün bağlantılarına
  gider; kapalı bölümlerin bağlantıları atlanır.
- Kapalı bölümün metni (göz atma kipinde de) okunmaz.
- Bir başlıkta Enter ya da Space ile açınca içerik hemen okunur olur.
- Pencere açılışında Shift+Tab son bölümün başlığına gider.

## D. Oynat düğmesi ve görünüm

### D1 · Oynat düğmesinin adı ve durumu

**Kaynak:** ER-13 · **Gerekir:** ekran okuyucu, klavye (telefonda dokunmatik
cihaz)

1. Tab ile alt çubuktaki «Oynat» düğmesine gel; adını dinle.
2. Enter, Space ya da dokunmayla çalmaya başla. Odaktaki düğmenin yeni adını
   duyup duymadığına bak (bazı ekran okuyucular odaktaki öğenin değişen adını
   söylemez; öyleyse ayet anonsu yeni içerik veriyor mu?).
3. Tekrar bas.

**Beklenen**

- Düğme "Oynat, بسم الله الرحمن الرحيم, düğme" gibi okunur (Türkçe eylem
  Türkçe sesle, ibare Arapça sesle).
- Çalmaya başlayınca düğmenin adı «Duraklat» olur ve duyulur.
- Karar sende: ad değişikliği duyulmuyorsa (bazı ekran okuyucular odaktaki
  öğenin değişen adını söylemez) ayet anonsu yine de yeni içerik veriyor.
- Tekrar basınca ad «Oynat»a döner. "Basılı" ya da "geçiş düğmesi" gibi bir
  durum duyulmaz.

### D2 · Oynat düğmesi: sesle kumanda

**Kaynak:** ER-13 · **Gerekir:** sesle kumanda

1. Sesle kumandayı aç (iOS'ta Ses Kontrolü, Windows'ta Sesli Erişim).
2. "Oynat" de.
3. Çalmayı durdur; bu kez ekrandaki Arapça ibareyi söyle.

**Beklenen**

- İkisi de düğmeye basar. Düğmenin erişilebilir adı «Oynat» ile ibarenin
  birleşimidir; hangisi çalışmıyorsa Not'a yaz.

### D3 · Okunabilirlik ve yüksek karşıtlık

**Kaynak:** ER-14 · **Gerekir:** yalnızca tarayıcı (düşük parlaklık için
telefon; Yüksek Karşıtlık için Windows ya da iOS)

1. Telefonda ekran parlaklığını düşür (ya da güneş altında bak). Şunlara bak:
   Sure Bilgisi bağlantıları, konu açıklamalarındaki bağlantılar, "Ontoloji"
   rozeti, çalarken Oynat düğmesi, alt rüku rakamları.
2. Windows Yüksek Karşıtlık'ı ya da iOS "Kontrastı Artır"ı aç; aynı öğelere
   bir kez daha bak.

**Beklenen**

- Karar sende: söz konusu öğeler iki durumda da okunuyor. Alt rüku rakamı
  sayfanın siyahından hâlâ ayırt ediliyor (bilinçli ödünleşme: bkz.
  GELISTIRICI.md, "Renk kontrastı ve odak göstergesi").

### D4 · Odak halkası

**Kaynak:** ER-14 · **Gerekir:** klavye

1. Ezber penceresini aç; Tab ile Sure, Başlangıç ve Bitiş alanlarına gel.
2. Sayfa gezgininin düğmelerine, panel düğmelerine, konu bağlantılarına ve
   sekmelere de Tab ile gel.

**Beklenen**

- Karar sende: her odaklanan öğede odak halkası net görünüyor (özellikle
  Ezber alanlarında).

## E. Ezber

### E1 · "Sure Seç" açıkken sekmeler

**Kaynak:** ER-16 · **Gerekir:** ekran okuyucu, klavye

1. Ezber penceresini aç; Sure alanındaki düğmeye bas («Sure Seç»).
2. Ekran okuyucuyla ve Tab ile gez: Dinle, Oku ve Yaz sekmeleri okunuyor mu?
   Tab durağı mı?
3. «Geri dön»e bas.

**Beklenen**

- Seçici açıkken sekmeler okunmaz ve Tab durağı değildir (yalnızca seçici
  içeriği).
- Seçiciden dönünce sekmeler geri gelir.

### E2 · Kârî ve Sure alanları

**Kaynak:** ER-23 · **Gerekir:** ekran okuyucu, klavye

1. Ezber > Dinle: «Kârî» ve «Sure» düğmelerine odaklan; ne okunduğuna bak.
2. Düğmeye bas; başlığı dinle («Kârî Seç» ya da «Sure Seç»). Tab sırasını
   izle.
3. Bir satır seç. Seçiciyi yeniden aç ve bu kez «Geri dön»e bas. Odağa ve
   okunana bak.
4. Seçici açıkken Esc'ye bas.
5. Kârî düğmesinde Aşağı ok'a bas.

**Beklenen**

- Düğme alan adı ve değeriyle okunur ("Kârî Husarî (Mücevved)", "Sure 3.
  Âl-i İmrân"). "Liste kutusu" gibi bir ipucu verilmez.
- Basınca başlık okunur; Tab önce «Geri dön»e, sonra şu anki satıra geçer
  (listenin tek durağı).
- Satır seçince ya da «Geri dön»e basınca odak düğmeye döner ve düğme yeni
  değeriyle okunur.
- Seçici açıkken Esc pencereyi kapatır ve odak «Ezber» düğmesine döner.
- Kârî düğmesinde Aşağı ok bir şey yapmaz; değer yalnızca listeden değişir.

### E3 · Geçersiz aralık

**Kaynak:** ER-24 · **Gerekir:** ekran okuyucu, klavye

1. Ezber'de (Dinle, Oku ve Yaz için ayrı ayrı) sure olarak Âl-i İmrân'ı seç;
   başlangıca 5, bitişe 2 yaz ve «Uygula…» düğmesine bas.
2. Bitişe 999 yaz ve yeniden bas.
3. Bitişi düzelt (yazarak ya da sayı okuyla) ve bas.
4. Esc'le kapat, yeniden aç ve «Uygula…»ya bas.

**Beklenen**

- Uyarı okunur: "Bitiş ayeti, başlangıç ayetinden küçük olamaz." ve "Bu sure
  200 ayetten oluşuyor." Odak Bitiş alanındadır.
- Bitişi düzeltip basınca oturum başlar. Düzeltme sırasında ekran okuyucu eski
  uyarıyı yeniden okumaz.
- Esc'le kapatıp yeniden açınca «Uygula…» yine çalışır.

### E4 · Oku: başlangıç ve kelime açma

**Kaynak:** ER-19 · **Gerekir:** ekran okuyucu, klavye, internet

1. Ezber > Oku; sure Fâtiha, aralık 1–2; klavyeyle «Uygula ve Okumaya
   Başla»ya bas.
2. Oturum başlayınca okunanları dinle; odağın nerede olduğuna ve düğmenin
   ekranda görünüp görünmediğine bak.
3. «Sıradaki kelimeyi aç» düğmesine Enter ya da Space ile (dokunmatik ekran
   okuyucuda çift dokunuşla) bas; her basışta okunana bak. Birkaç kez art arda
   hızlı bas.
4. Ayetin son kelimesini aç: ayet sesiyle «Ayet tamamlandı» anonsu üst üste
   biniyor mu? Ayet okunurken düğmeye bas.

**Beklenen**

- «Oku çalışması başladı», sayfa ve ayet bilgisi ve kelime sayısı duyulur:
  «Bu ayette» ... (Fâtiha 1. ayet için 4 kelime).
- Odak «Sıradaki kelimeyi aç» düğmesindedir (`#ezber-reveal`) ve düğme
  ekranda görünür.
- Her basış "1. kelime: adıyla" gibi bir satır okutur; son kelimede
  «Ayet tamamlandı» eklenir.
- Karar sende: ayet sesi ekran okuyucunun konuşmasının üstüne binmiyor.
- Karar sende: art arda hızlı basışta hangisi daha az rahatsız ediyor:
  yalnızca sonuncusunun okunması mı, hepsinin kuyruğa girip gecikmesi mi?
  Gördüğünü Not'a yaz.
- Karar sende: ayet okunurken düğmeye basmak sessiz kalıyor; bu kullanıcıyı
  şaşırtmıyor ("bekleyin" duyurusu gerekmiyor).

### E5 · Oku: kapaklı kelimeler, sayfa metni ve bitiş

**Kaynak:** ER-19 · **Gerekir:** ekran okuyucu, klavye, internet

1. Oku oturumu sürerken ekran okuyucuyla sayfa metnine git (göz atma kipi ya da
   dokunarak): açılmamış kelimeler okunuyor mu?
2. Bir kelime aç: kapağı kalkınca okunuyor mu? Satırın geri kalanı akıcı mı?
3. Oturum sürerken göz atma kipi arabelleğinin güncel kalıp kalmadığına, imlecin
   kayıp kaymadığına bak.
4. Açılan Arapça kelimeyi duymak için sayfa metnine gitmen gerekir: bu akış
   kullanılabilir mi?
5. Oturumu bitir (son kelime ya da «Bitir»). Okunana, odağa ve sayfa metnine
   bak. Yaz oturumunda «Sıradaki kelimeyi aç»a hiç rastlanmadığını doğrula.

**Beklenen**

- Kapaklı (açılmamış) kelimeler sayfa metninde okunmaz (`aria-hidden`); açılan
  kelime kapağı kalkınca okunur.
- Karar sende: satırın geri kalanı akıcı okunuyor, kelimeler arasında gereksiz
  duraklama yok; göz atma kipi arabelleği güncel kalıyor, imleç kaymıyor.
- Karar sende: açılan Arapça kelimeyi duymak için sayfa metnine gitmek
  kullanılabilir bir akış.
- Bitince «Ezber çalışması bitti» okunur, odak «Ezber» düğmesine döner ve
  sayfa metni yeniden tam okunur.
- Yaz oturumunda «Sıradaki kelimeyi aç» hiç duyulmaz.

### E6 · Yaz: başlangıç ve tuş adları

**Kaynak:** ER-20 · **Gerekir:** ekran okuyucu, klavye

1. Ezber > Yaz; sure Fâtiha, aralık 1–2; klavyeyle «Uygula ve Yazmaya
   Başla»ya bas.
2. Oturum başlayınca okunanları dinle; odağın ilk tuşta olduğuna ve odak
   halkasının göründüğüne bak.
3. Klavyeye girerken okunanı dinle.
4. Tuşları tek tek gez ve adlarını dinle.

**Beklenen**

- «Yaz çalışması başladı», sayfa ve ayet bilgisi ve harf sayısı duyulur:
  «Bu ayette» ... (Fâtiha 1. ayet için 19 harf).
- Odak ilk tuştadır ("ا elif, düğme") ve odak halkası görünür.
- Klavyeye girince «Arapça harf klavyesi» grubu duyulur ("Arapça harf
  klavyesi, grup").
- Tuş adları "ب be" gibi Arapça harf ve Türkçe okunuştan oluşur. Karar sende:
  okunuşlar (elif, be, te, se, cim, ha, hı, dal, zel, ra, ze, sin, şın, sad,
  dad, tı, zı, ayn, gayn, fe, kaf, kef, lam, mim, nun, he, vav, ye, hemze)
  doğru ve uygun; Arapça sesi olan okuyucuda harf ve okunuşun art arda
  okunması gereksiz yineleme yaratmıyor.

### E7 · Yaz: doğru ve yanlış tuş, ipucu

**Kaynak:** ER-20 · **Gerekir:** ekran okuyucu, klavye, internet

1. Doğru harfe bas; yanlış harfe bas; bir kelimeyi tamamla; ayeti tamamla.
2. Birkaç tuşa art arda hızlı bas.
3. 💡 tuşuna bas; tekrar bas.
4. Ayet sesi çalarken tuşlara bas.

**Beklenen**

- Doğru tuşta «Doğru», yanlış tuşta «Bu harf değil», kelime sonunda «Doğru.
  Kelime tamamlandı», ayet sonunda «Doğru. Ayet tamamlandı» okunur.
- 💡 "İpucu: adıyla" gibi bir karşılık okutur; tekrar basınca «İpucu
  kapatıldı» okunur.
- Karar sende: hızlı art arda basışta yalnızca sonuncusunun okunması rahatsız
  etmiyor. Açılan harfin kendisi okunmuyor (yalnızca tuşun adı); bu yeterli.
- Karar sende: ayet okunurken tuşlar sessiz kalıyor; bu kullanıcıyı
  şaşırtmıyor.

### E8 · Yaz: oklar, Arapça klavye, sayfa metni ve bitiş

**Kaynak:** ER-20 · **Gerekir:** ekran okuyucu, klavye

1. Yaz oturumu sürerken Sol, Sağ, Yukarı ve Aşağı oklara bas.
2. NVDA ya da JAWS göz atma kipinde: oklar ve harf tuşları okuyucu tarafından
   tüketiliyor mu? Tab ve Enter yolu yetiyor mu?
3. Arapça klavye düzeniyle (donanım ya da ekran klavyesi) bir harfe bas.
4. Sayfa metnine git: bir kelime son harfi yazılana kadar okunuyor mu,
   tamamlanınca okunuyor mu? Ayet sonu işaretleri okunuyor mu?
5. Oturumu bitir.

**Beklenen**

- Oklar odağı tuşlar arasında gezdirir ve sayfayı çevirmez.
- Arapça klavye düzeniyle bir harfe basmak doğrudan o harfi açar.
- Yarım kalmış bir kelime sayfa metninde okunmaz; son harfi yazılınca okunur.
- Bitince odak «Ezber» düğmesindedir.
- Karar sende: NVDA ya da JAWS göz atma kipinde Tab ve Enter yolu yeterli.

## F. Klavye ve listeler

### F1 · Sayfa çevirme okları

**Kaynak:** ER-21 · **Gerekir:** ekran okuyucu, klavye

1. Sol ve Sağ ok tuşlarına bas; yönü ve sayfa anonsunu dinle.
2. Alt+Sol ve Alt+Sağ'a bas (macOS'ta Cmd+Sol ve Cmd+Sağ). Tarayıcı mı geri
   gidiyor, uygulama sayfa mı çeviriyor? Geri dönünce hangi sayfada açılıyor?
3. Ezber > Yaz sürerken bir ekran tuşunda Shift+Sol'a bas.
4. Ekran okuyucunun kendi ok kısayollarını dene (VoiceOver'da
   Ctrl+Option+Sol ve Ctrl+Option+Sağ).
5. Sol ya da Sağ tuşunu basılı tut.

**Beklenen**

- Düz Sol sonraki, düz Sağ önceki sayfaya götürür ve
  "Sayfa 2, Bakara Suresi, 1. ayet" gibi anons duyulur.
- Alt+Sol ve Alt+Sağ (macOS'ta Cmd+Sol ve Cmd+Sağ) tarayıcıyı geri ve ileri
  götürür; uygulama sayfayı ÇEVİRMEZ; geri dönünce son kalınan sayfada açılır.
- Shift+Sol, Yaz oturumunu bitirmez.
- Ekran okuyucunun kendi ok kısayolları sayfa çevrilmeden çalışır.
- Tuşu basılı tutunca sayfalar akar ve ekran okuyucu yalnızca sonuncusunu
  söyler.

### F2 · Sekmeler

**Kaynak:** ER-22 · **Gerekir:** ekran okuyucu, klavye

1. «Cüz» penceresini aç (Cüz, Hizb, Rub, Menzil); Tab ile sekmelere gel.
2. Sol, Sağ, Home ve End'e bas; Sağ oku basılı tut.
3. Aynısını Ezber penceresinde (Dinle, Oku, Yaz) yap.
4. Pencereyi kapatıp yeniden aç.

**Beklenen**

- Ekran okuyucu sekmenin adını, konumunu ("2/4" gibi) ve seçili durumunu
  söyler.
- Tab «Kapat»tan sonra seçili sekmeye gelir; bir sonraki Tab doğrudan panelin
  ilk öğesine geçer (sekmeler tek duraktır).
- Sol ve Sağ komşu sekmeye geçer, son sekmeden başa sarar; her adımda yeni
  sekme "seçili" diye okunur ve panel değişir. Home ve End ilk ve son sekmeye
  gider.
- Karar sende: Sağ oku basılı tutmak ekran okuyucuyu boğmuyor.
- Sekmeye gelince odak halkası net görünür. Pencereyi kapatıp açınca ilk sekme
  seçilidir.

### F3 · Modal listeleri: "geçerli" işareti

**Kaynak:** ER-25 · **Gerekir:** ekran okuyucu

1. Sure 3 seçiliyken «Sure» penceresini aç; 3. satırı dinle.
2. Başka bir satıra geç ve oradan işaretin kalkıp kalkmadığına bak.
3. Cüz, Hizb, Rub ve Menzil listelerinde ve Ezber'in Sure ve Kârî
   seçicilerinde aynısını dene.
4. Sure satırında «ayetlerini listele» düğmesiyle ayet düğmelerini aç; bir
   ayet düğmesini dinle.
5. Ezber'in dört seçici düğmesini dinle.

**Beklenen**

- Şu anki satır "geçerli" diye okunur ("3 ... Âl-i İmrân, geçerli").
  Etkin olmayan satırlar "geçerli" demez; başka satıra geçince eski satırdan
  işaret kalkar.
- Ayet düğmeleri "Âl-i İmrân Suresi, 3. ayet" diye okunur, seçili ayet
  "geçerli" der ve ayet gezgininin düğmeleriyle aynı biçimdedir.
- Ezber'in dört seçici düğmesi "liste kutusu" demez.

### F4 · Modal listeleri: ok tuşu gezintisi

**Kaynak:** ER-26 · **Gerekir:** ekran okuyucu, klavye

1. «Sure» penceresini aç; Tab ile listeye gel ve kaç Tab durağı olduğuna bak.
2. Yukarı, Aşağı, Home, End, PageUp ve PageDown'ı dene; uçlarda da bas.
3. Sure satırlarında Sağ ve Sol'a, sonra Yukarı ve Aşağı'ya bas.
4. Cüz, Hizb, Rub, Menzil listelerinde ve Ezber seçicilerinde Sol ve Sağ'a
   bas.
5. NVDA ya da JAWS göz atma kipinde: satıra Tab'la gelince ok tuşu çalışıyor
   mu, yoksa odak ya da form kipine geçmek mi gerekiyor? Sanal imleç
   (Tab'sız) `tabindex="-1"` satırlara da gidiyor mu?
6. Bir ok tuşunu basılı tut.
7. Enter ile bir satır seç.

**Beklenen**

- Tab listeye TEK durakla girer (Sure penceresinde «Kapat»tan sonra şu anki
  sure; Cüz'de şu anki satır) ve sonraki Tab listeden çıkarır (Sure
  penceresinde başa, «Kapat»a döner).
- Ekran okuyucu satırı adıyla ve "geçerli" durumuyla okur.
- Yukarı ve Aşağı bir satır, Home ve End ilk ve son satır, PageUp ve PageDown
  yaklaşık bir ekran atlar; odaklanan satır her adımda ekranda görünür ve her
  adımda okunur; uçlarda odak yerinde kalır.
- Sure satırlarında Sağ ve Sol sure düğmesi ile «ayetlerini listele» düğmesi
  arasında geçer; Yukarı ve Aşağı sütunu korur. Cüz, Hizb, Rub, Menzil
  listelerinde ve Ezber seçicilerinde Sol ve Sağ bir şey yapmaz.
- Enter satırı seçer, pencere kapanır ve odak açan düğmeye döner.
- Karar sende: göz atma kipinde ok tuşunun çalışması için odak ya da form
  kipine geçmek gerekiyorsa Not'a yaz; ok tuşunu basılı tutmak okuyucuyu
  boğmuyor.
- Ayet düğmeleri (açılan ızgara) bu gezintiye girmez; kendi gezintisi vardır
  (F5).

### F5 · Ayet düğmeleri ızgarası

**Kaynak:** ER-27 · **Gerekir:** ekran okuyucu, klavye

1. «Sure» penceresinde Bakara satırında «ayetlerini listele» düğmesine bas.
2. Tab ile ızgaraya gir: kaç Tab durağı var? Sonraki Tab nereye gidiyor?
3. Düğmeyi dinle. Izgaraya girerken söyleneni dinle.
4. Sağ, Sol, Yukarı, Aşağı, Home, End, PageUp ve PageDown'ı dene; uçlarda da
   bas.
5. NVDA ya da JAWS göz atma kipinde ve sanal imleçle (Tab'sız) dene; bir ok
   tuşunu basılı tut.
6. Enter ile bir ayet seç.

**Beklenen**

- Tab ızgaraya TEK durakla girer (seçili ayet varsa o, yoksa 1. ayet; Bakara'da
  286 Tab değil 1) ve sonraki Tab ızgaradan çıkarır (modalın başına,
  «Kapat»a).
- Düğme "Bakara Suresi, 255. ayet" diye, seçiliyse ayrıca "geçerli" diye
  okunur. Izgaraya girerken önce "Bakara Suresi ayetleri" ve bir grup olduğu
  duyulur; ok tuşuyla gezerken yeniden okunmaz. Karar sende: düğme adındaki
  aynı sure adı ardından can sıkıcı bir tekrar değil.
- Sağ ve Sol bir önceki ve sonraki ayete gider (satır sonunda yandaki satıra
  geçer). Yukarı ve Aşağı bir üst ve alt satırda yatay olarak en yakın
  düğmeye gider. Home ve End ilk ve son ayete gider; PageUp ve PageDown 10
  satır (yaklaşık bir ekran) atlar. Karar sende: Bakara'da 100. ayetten sonra
  satıra 9 yerine 8 düğme sığıyor; odak görsel olarak "tam üstüne ya da
  altına" gidiyor.
- Odaklanan düğme her adımda ekranda görünür ve her adımda okunur; uçlarda
  odak yerinde kalır.
- Karar sende: NVDA ya da JAWS göz atma kipinde ok tuşunun çalışması için
  odak ya da form kipine geçmek gerekiyorsa Not'a yaz; sanal imleç
  `tabindex="-1"` ayet düğmelerine de gider.
- Enter ayeti seçer, pencere kapanır ve odak açan düğmeye döner.

### F6 · Izgara: sesli okuma ve yerleşim değişimi

**Kaynak:** ER-27 · **Gerekir:** ekran okuyucu, klavye, internet,
dokunmatik cihaz

1. «Oynat»a bas; çalma sürerken «Sure» penceresini aç, Bakara ızgarasına gir
   ve ok tuşlarıyla gez. Sayfa ve seçili ayet ilerlerken odağın yerinde kalıp
   kalmadığına bak.
2. Telefonu yatır ya da yazı boyutunu büyüt (tarayıcıda Ctrl ve +); ızgarada
   Yukarı ve Aşağı'ya bas.

**Beklenen**

- Sesli okuma sürerken (sayfa ve seçili ayet ilerlerken) ızgarada gezen
  kullanıcının odağı yerinde kalır.
- Telefonu yatırınca ya da yazı boyutunu büyütünce satırlar doğru hesaplanır;
  Yukarı ve Aşağı yeni yerleşime göre gider.

## G. Ses sunucusu, çevrimdışı ve kurulum

Bu bölüm yayındaki adreste (HTTPS) ve gerçek ses sunucusuyla çalışır; yerel
sahte sunucuyla yapılan ölçümler bunların yerini tutmaz. G1, G2 ve G4 için
Chrome (ya da Edge) ve DevTools kullan; G3'ü Firefox, Safari ve iPhone'da koş.

### G1 · Gerçek ses sunucusu: Range ve önbellek

**Kaynak:** PW-1 · **Gerekir:** DevTools, internet

1. Yayın adresini Chrome'da aç ve sayfayı bir kez yenile (service worker
   devralsın). DevTools > Network sekmesini aç.
2. Fâtiha'dan bir ayet çal («Oynat»). Sesin hemen mi başladığına, yoksa bir
   gecikme olup olmadığına bak.
3. Network'te `audio-cdn.tarteel.ai` isteğini bul. Durum kodunu (206 mı, 200
   mü) ve yanıtta `Content-Range` ile `Access-Control-Allow-Origin`
   başlıklarının olup olmadığını not et.
4. Application > Cache Storage > `dijital-mushaf-audio-v1`'e bak: o ayet için
   bir kayıt oluştu mu?
5. DevTools > Network > Offline'ı işaretle ve aynı ayeti yeniden çal.

**Beklenen**

- Bir ayet ilk kez çalarken ses hemen başlar (eskiden indirme süresi kadar
  gecikiyordu).
- `dijital-mushaf-audio-v1`'de o ayet için bir kayıt oluşur.
- Aynı ayet çevrimdışıyken baştan sona çalar.
- Gerçek sunucunun `Range` davranışı bu kartla ilk kez ölçülür: Not'a durum
  kodunu ve iki başlığın var olup olmadığını yaz.

### G2 · Yayındaki eûzü klibi çevrimdışı

**Kaynak:** PW-2 · **Gerekir:** DevTools, çevrimdışı

1. Yayın adresini internet açıkken ziyaret et; sayfanın tam yüklenmesini ve
   Application > Service Workers'ta service worker'ın etkinleşmesini bekle.
2. Çevrimdışı ol (uçak modu ya da DevTools > Network > Offline).
3. Fâtiha'dan «Oynat»a bas (ya da Ezber > Dinle, Fâtiha). Konsolu izle.
4. Application > Cache Storage > `dijital-mushaf-shell-v1`'de
   `audio/euzuhusari.mp3` ve `audio/euzuabdulsamad.mp3` var mı?
5. Ezber > Dinle'de kârî olarak Abdülbâsıt'ı seç (A7'deki gibi) ve aynısını
   yap.

**Beklenen**

- Eûzü klibi çevrimdışıyken çalar.
- Konsolda "Partial response (status code 206) is unsupported" uyarısı çıkmaz.
- `dijital-mushaf-shell-v1`'de `audio/euzuhusari.mp3` ve
  `audio/euzuabdulsamad.mp3` bulunur.
- Abdülbâsıt seçiliyken de eûzü çalar.

### G3 · Firefox ve Safari: ayet sesi ve eûzü

**Kaynak:** PW-3 · **Gerekir:** internet, çevrimdışı, dokunmatik cihaz

1. Firefox'ta (masaüstü), Safari'de (macOS) ve iPhone ya da iPad'de Safari'de
   yayın adresini aç ve sayfanın tam yüklenmesini bekle.
2. Her birinde Fâtiha'dan «Oynat»a bas: ayet sesi çalıyor mu?
3. Çevrimdışı ol (uçak modu), sayfayı yenile ve yeniden Fâtiha'dan «Oynat»a
   bas: ilk ayetten önce eûzü çalıyor mu? Sayfa çevrimdışı yenilenmezse bunu
   Not'a yaz (G5).

**Beklenen**

- Ayet sesi üç ortamda da çalar.
- Çevrimdışıyken eûzü çalar. Safari'nin (WebKit) medya isteklerinde 206 ve
  `Content-Range` beklediği biliniyor; çevrimdışı eûzü dilimlemesi bunun
  içindi, ama hiç denenmedi.
- Not'a her ortamın tarayıcı adını ve sürümünü yaz.

### G4 · Kota ve en eski kayıtların silinmesi

**Kaynak:** PW-4 · **Gerekir:** DevTools, internet

1. Birkaç yüz ayet dinle (ör. Ezber > Dinle'de uzun bir aralık, ya da «Oynat»
   ile uzun süre). Kısayol: Chrome'da DevTools > Application > Storage'daki
   "Simulate custom storage quota" (varsa) ile kotayı küçük bir değere indirip
   birkaç ayet dinle; bu kısayol aşağıdaki son maddeyi (bildirilen kotanın
   gerçeğe yakınlığı) ölçmez.
2. Application > Storage'da kullanıma ve kotaya bak.
3. Kullanım kotanın %80'ine gelince (ya da konsolda «[sw] önbelleğe
   alınamadı» ve `QuotaExceededError` uyarısı çıkınca) Cache Storage >
   `dijital-mushaf-audio-v1`'e bak.
4. Konsolda `await navigator.storage.estimate()` çalıştır ve bildirilen kotayı
   gerçek sınırla karşılaştır.

**Beklenen**

- Kullanım kotanın %80'ine gelince (ya da bir `QuotaExceededError` uyarısından
  sonra) `dijital-mushaf-audio-v1`'deki ilk (en eski) kayıtlar silinir; çalma
  sürer.
- `dijital-mushaf-shell-v1` ve `dijital-mushaf-data-v1` olduğu gibi durur.
- Karar sende: `navigator.storage.estimate()`'in bildirdiği kota gerçek sınıra
  yakın. Chromium'da opak yanıtlar gerçek boylarından çok daha fazla kota
  sayar; sahte ortamdaki bellek-içi profilde gerçek sınır bildirilenin
  yaklaşık %19–21'iydi.

### G5 · Kurulum ve çevrimdışı açılış

**Kaynak:** README: Çevrimdışı kullanım ve kurulum · **Gerekir:** internet,
çevrimdışı, dokunmatik cihaz

1. Yayın adresini aç ve tarayıcının "Uygulamayı yükle" ya da "Ana ekrana ekle"
   seçeneğiyle kur (Chrome: adres çubuğundaki yükle simgesi ya da menü;
   iPhone'da Safari: Paylaş > Ana Ekrana Ekle).
2. Kurulu uygulamayı aç: kendi penceresinde mi (adres çubuğu olmadan) açılıyor?
   Simgeye ve ada bak.
3. İnternet açıkken bir ayetin panelini (kelime meali, meal, tefsir), Konu
   Fihristi'ni ve Sure Bilgisi'ni bir kez aç; birkaç dakika bekle (sure
   başlıkları arka planda iner).
4. Uçak moduna geç; uygulamayı kapatıp yeniden aç.
5. Arapça metnin ve mealin göründüğüne bak. Daha önce açtığın paneli, Konu
   Fihristi'ni, Sure Bilgisi'ni ve tefsiri yeniden aç; sure başlığı kutularına
   bak.

**Beklenen**

- Uygulama kurulur, kendi penceresinde ("standalone") açılır ve adı "Mushaf"
  olarak görünür.
- İlk ziyaretten sonra internetsiz açılır; Arapça metin ve Türkçe meal gelir.
- İlk kullanımda indirilen içerik (kelime meali, Konu Fihristi, Sure Bilgisi,
  Sa'dî tefsiri, kelime zamanlamaları) o kullanımdan sonra internetsiz de açılır.
  Hiç açılmamış bir içerik çevrimdışıyken gelmez (beklenen).
- Sure başlığı kutuları kurulumdan birkaç dakika sonra internetsiz de görünür.

## Sonuç tablosu

Her koşu için bu tabloyu kopyala; Sonuç sütununa G, K, Y ya da ? yaz
([kodlar](#nasıl-kullanılır)). Bu dosyadaki tablo boş kalmalı.

| Kart | Test | Sonuç | Not |
|---|---|---|---|
| A1 | İlk açılış ve sayfa görünümü | | |
| A2 | Gezinme | | |
| A3 | Ayet detayı paneli | | |
| A4 | Konu Fihristi ve Sure Bilgisi | | |
| A5 | Arama | | |
| A6 | Sesli okuma | | |
| A7 | Ezber | | |
| A8 | Yön, yakınlaştırma ve ekran kararması | | |
| B1 | Sayfa geçişi anonsu | | |
| B2 | Sayfa metni: gezinme ve akıcılık | | |
| B3 | Arapça ve Türkçe ses seçimi | | |
| B4 | Ayet gezgini: Tab ile okuma | | |
| B5 | Yukarı/Aşağı ile gezinirken çift okuma | | |
| B6 | Enter ile ayet paneli ve odak | | |
| B7 | Göz atma kipi: NVDA ve JAWS | | |
| B8 | Panel açıkken sayfa metni | | |
| B9 | Fare ya da dokunmayla ayet seçimi | | |
| C1 | Tefsir düğmesi | | |
| C2 | Ayet panelini kapatma | | |
| C3 | Pencere açılışı: başlık ve odak | | |
| C4 | Pencere kapanışı: odak dönüşü | | |
| C5 | Konu penceresi | | |
| C6 | Sure Bilgisi: ayrıntı görünümü | | |
| C7 | Sure Bilgisi: kapalı bölümler | | |
| D1 | Oynat düğmesinin adı ve durumu | | |
| D2 | Oynat düğmesi: sesle kumanda | | |
| D3 | Okunabilirlik ve yüksek karşıtlık | | |
| D4 | Odak halkası | | |
| E1 | "Sure Seç" açıkken sekmeler | | |
| E2 | Kârî ve Sure alanları | | |
| E3 | Geçersiz aralık | | |
| E4 | Oku: başlangıç ve kelime açma | | |
| E5 | Oku: kapaklı kelimeler, sayfa metni ve bitiş | | |
| E6 | Yaz: başlangıç ve tuş adları | | |
| E7 | Yaz: doğru ve yanlış tuş, ipucu | | |
| E8 | Yaz: oklar, Arapça klavye, sayfa metni ve bitiş | | |
| F1 | Sayfa çevirme okları | | |
| F2 | Sekmeler | | |
| F3 | Modal listeleri: "geçerli" işareti | | |
| F4 | Modal listeleri: ok tuşu gezintisi | | |
| F5 | Ayet düğmeleri ızgarası | | |
| F6 | Izgara: sesli okuma ve yerleşim değişimi | | |
| G1 | Gerçek ses sunucusu: Range ve önbellek | | |
| G2 | Yayındaki eûzü klibi çevrimdışı | | |
| G3 | Firefox ve Safari: ayet sesi ve eûzü | | |
| G4 | Kota ve en eski kayıtların silinmesi | | |
| G5 | Kurulum ve çevrimdışı açılış | | |

## Kaynak maddeleri

ER-n ve PW-n numaraları [GELISTIRICI.md](GELISTIRICI.md)'deki iki kontrol
listesinin sırasına bağlıdır. Bu tablo her numaranın hangi maddeye karşılık
geldiğini söyler; `test/foy_test.mjs` maddelerin başlarının burada yazanla
aynı olduğunu denetler. Listeye madde eklerken föye de kart ekle ve
bu tabloya bir satır ekle; numaraları ortadan kaydırma.

| Kaynak | GELISTIRICI.md'deki madde (ilk sözcükler) |
|---|---|
| ER-1 | Sayfa geçişinde `#nav-announcer`'ın anonsu |
| ER-2 | `foreignObject` içindeki metin katmanı |
| ER-3 | Bir ayete dokununca (fareyle tıklayınca) |
| ER-4 | Tefsir düğmesine odaklanınca |
| ER-5 | Kapat düğmesine/Esc'ye basınca |
| ER-6 | Bir modal açılınca |
| ER-7 | Kapat/Esc/perdeye dokunma/bir öğe seçme ile kapanınca |
| ER-8 | Ayet gezgini (`#ayah-nav`) |
| ER-9 | Yukarı/Aşağı ile ayet değiştirirken |
| ER-10 | Enter ile panel açılınca |
| ER-11 | NVDA/JAWS tarama modunda |
| ER-12 | Ayet paneli açıkken sayfa metni |
| ER-13 | Oynat düğmesi: |
| ER-14 | Görünüm: |
| ER-15 | Konu modalı |
| ER-16 | Ezber, "Sure Seç" açıkken |
| ER-17 | Sure Bilgisi (gezginin |
| ER-18 | Sure Bilgisi, kapalı bölümler |
| ER-19 | Ezber > Oku (klavyeyle başlat |
| ER-20 | Ezber > Yaz (klavyeyle başlat |
| ER-21 | Sayfa çevirme okları: |
| ER-22 | Cüz (Cüz/Hizb/Rub/Menzil) ve Ezber |
| ER-23 | Ezber'de Kârî ve Sure alanları: |
| ER-24 | Ezber'de (Dinle, Oku, Yaz) geçersiz aralık: |
| ER-25 | Modal listeleri (Sure, |
| ER-26 | Modal listelerinde ok tuşu gezintisi |
| ER-27 | Ayet düğmeleri ızgarası |
| PW-1 | Gerçek CDN'in `Range` davranışı: |
| PW-2 | Yayındaki (github.io) eûzü klibi: |
| PW-3 | Safari/iOS ve Firefox: |
| PW-4 | Kota: |
