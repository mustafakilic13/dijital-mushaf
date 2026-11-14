# Veri, ses ve yazı tipi kaynakları

Son denetim: 2026-11-14. Bu belge bir hukuki görüş DEĞİLDİR; projenin
kullandığı verilerin nereden geldiğini ve kullanım koşullarının ne kadarının
doğrulanabildiğini kaydeder. Kod ve yazı tipi lisansları için
`THIRD_PARTY_NOTICES.md`'ye, projenin kendi lisansı için `LICENSE`'a bakın.

**Aşağıdaki veri, ses ve yazı tipi dosyaları projenin kendi lisansının
kapsamında DEĞİLDİR; her biri kendi sahibinin koşullarına tabidir.** Projenin
kendi lisansı yalnızca bu projede yazılan kodu, testleri, belgeleri ve bu
projede üretilen çeviri/derleme emeğini kapsar; çevrilen ya da dönüştürülen
kaynak metinlerin hakları, o metinlerin sahiplerindedir.

## Nasıl okunur

- **Doğrulandı**: lisans metni ya da lisans sayfası okundu (yalnızca denetim
  tarihindeki hâli; sonradan değişmiş olabilir).
- **Doğrulanamadı**: lisans/hak sahibi bilgisi bulunamadı, kaynak belirtilmemiş
  ya da sayfa okunamadı. "Doğrulanamadı" izin YOK demek değildir; izin olup
  olmadığının bilinmediği anlamına gelir.
- **Kısmen doğrulandı**: kaynağın ya da lisansın bir kısmı okundu veya bir kısmı için
  koşullar belli; kalanı doğrulanamadı. Satırda hangi kısmın hangisi olduğu yazılır.
- **Olgusal**: yalnızca numara/sınır bilgisi (sayfa, cüz, ayet sayısı gibi).
  Telif açısından ayrıca incelenmedi.
- **Bu projede üretildi**: kod, simge, çeviri ve derleme çıktıları.

## Özet tablo

| Dosya | İçerik | Kaynak | Durum |
|---|---|---|---|
| `data/mushaf.json` | 604 sayfalık Arapça metin ve satır düzeni | QUL "Digital Khatt V2 script - Word by word" (id 48) + QUL "Digital Khatt(KFGQPC V2 1421H print) layout" (id 21) | Doğrulanamadı |
| `data/ayahs.json`, `data/page-first-ayah.json`, `data/surah-pages.json` | ayet/sayfa dizinleri | mushaf verisinden bu projede türetildi | Olgusal |
| `data/surahs.json` | sure adları, ayet sayıları, iniş yeri | QUL "Quran metadata" + Türkçe adlar bu projede eklendi | Olgusal |
| `data/juz.json`, `data/hizb.json`, `data/rub.json`, `data/manzil.json`, `data/ruku.json` | bölüm başlangıçları | QUL "Quran metadata" exportları | Olgusal |
| `data/meal.json` | Elmalılı meali | QUL translation id 233 "Elmalili Hamdi Yazir" | Doğrulanamadı |
| `data/word-meal.json` | Türkçe kelime kelime meal | QUL translation id 99 "Turkish wbw translation" | Doğrulanamadı |
| `data/tafsir-saadi.json` | Türkçe Sa'dî tefsiri | QUL tafsir id 484 "Tafsir As-Saadi - Turkish"; çevirinin asıl kaynağı QuranEnc.com (proje sahibi bildirdi) | Kısmen doğrulandı (QuranEnc.com şartları okundu: yeniden yayım şartlı serbest; QUL kopyasının QuranEnc metniyle aynılığı, çevirmen adı ve atıf/sürüm şartlarına uyum doğrulanamadı, bkz. bölüm 5) |
| `data/topics-tr.json` | 2512 konu (ontoloji, tematik, genel) | QUL ayah-topics id 45; Türkçesi bu projede üretildi | Kısmen doğrulandı (ontoloji: GPL v3 + atıf şartı); tematik ve genel: Doğrulanamadı |
| `data/surah-info-tr.json` | 114 sure bilgisi | QUL surah-info id 3 (İngilizce); Türkçesi bu projede üretildi | Doğrulanamadı |
| `data/recitation-abdulsamad-mujawwad.json`, `data/recitation-husary-mujawwad.json` | ayet ses adresleri ve kelime zamanlamaları | QUL "Recitations and segments data" exportları | Doğrulanamadı |
| `data/surah-headers/` (114 dosya) | sure başlığı kutularının SVG yolları | `QCF_SurahHeader_COLOR` yazı tipinden bu projede üretildi | Doğrulanamadı |
| `tools/raw-data/QCF_SurahHeader_COLOR-Regular.woff2` | sure başlığı renkli yazı tipi (ham girdi) | QUL / Quran.com kaynaklı olduğu sanılıyor; kayıt yok | Doğrulanamadı |
| `tools/raw-data/ayah-recitation-*.json`, `tools/raw-data/quran-metadata-*.json` | QUL ham exportları | QUL | Doğrulanamadı / Olgusal |
| `audio/euzuabdulsamad.mp3`, `audio/euzuhusari.mp3` | eûzü klipleri (~6 sn) | etiketlerinde VerseByVerseQuran.com | Doğrulanamadı |
| ayet sesleri (depoda YOK) | `audio-cdn.tarteel.ai` adreslerinden akıtılır | Tarteel CDN | Doğrulanamadı |
| `fonts/DigitalKhattV2.woff2` | Arapça yazı tipi | DigitalKhatt (MIT) | Doğrulandı (depo lisansı) |
| `icons/*.png` | uygulama simgeleri (geçici) | bu projede üretildi | Bu projede üretildi |

## 1. QUL ne söylüyor

Kaynakların çoğu QUL'dan (Quranic Universal Library, https://qul.tarteel.ai)
indirildi. QUL bir dağıtım yeridir; kaynakların sahibi değildir:

- Credits sayfası: "The majority of the resources currently available in QUL
  were created or curated by the community, not Tarteel."
- SSS sayfası: kaynakların telif durumu değişir; bazıları kamu malı, bazıları
  lisanslıdır; kullanmadan önce her kaynağın yazarının lisans bilgisine
  bakılması önerilir. Ticari kullanım için "evet" denir, ama "bazı verilerin
  kısıtlaması ya da atıf şartı olabilir" eklenir. Kaynakların herkese açık bir
  GitHub deposunda yayımlanması, ses dosyalarının barındırılması ya da CDN'in
  kullanımı soruları yanıtlanmamış, GitHub issue'ya yönlendirilmiştir.
- Kaynak sayfaları: bu projenin kullandığı QUL kaynaklarının lisans sayfalarının
  (`/resources/<tür>/<id>/licence`) hepsi aynı cümleyi veriyor: "We don't have
  copyright information for this resource." Okunan sayfalar: translation/233
  (Elmalılı), translation/99 (kelime meali), tafsir/484 (Sa'dî, Türkçe),
  ayah-topics/45 (konular), quran-script/48 (Arapça metin), font/247 (DigitalKhatt
  V2), font/237 (V4 Surah Name Color), recitation/114 (Abdülbâsıt),
  surah-info/3 (sure bilgisi, İngilizce).

Dolayısıyla "QUL'dan indirildi" bir lisans değildir; her kaynağın gerçek hak
sahibi ve koşulları ayrıca belirlenmelidir. Aşağıdaki bölümler bunun
denetimde ne kadar yapılabildiğini kaydeder.

## 2. Arapça metin ve sayfa düzeni

- `data/mushaf.json`: QUL "Digital Khatt V2 script - Word by word" ve "Digital
  Khatt(KFGQPC V2 1421H print) layout" kaynaklarından (`tools/build_data.py`).
  Lisans sayfası: "We don't have copyright information for this resource."
- QUL Credits sayfası; Kur'an metnini hazırlayıp denetleyenler arasında
  Tanzil'i, DigitalKhatt yazı tiplerini geliştirenler arasında Dr. Amin
  Anane'yi, basılı mushaf görsellerini ve yazı tiplerini yayımlayanlar arasında
  King Fahd Quran Printing Complex'i sayıyor. Bu verinin hangisine dayandığı
  söylenmiyor.
- Metnin Tanzil'e dayandığı doğrulanamadı. Dayanıyorsa Tanzil metin lisansı
  geçerlidir: "Creative Commons Attribution 3.0", "Copyright (C) 2007-2021
  Tanzil Project"; metin değiştirilemez, telif bildirimi türev eserlerde uygun
  biçimde yeniden üretilmelidir (https://tanzil.net/docs/Text_License).
  Uygulama metni değiştirmeden gösterir (kelime kelime ayırıp çizer).
- Sayfa ve satır düzeni Medine mushafı baskısını (KFGQPC 1421H) izliyor. Bu
  düzenin telif durumu araştırılmadı.

## 3. Meal (Elmalılı)

- `data/meal.json`: QUL translation id 233, "Elmalili Hamdi Yazir". Sayfada
  kaynak, baskı ya da sadeleştiren belirtilmemiş; lisans bilgisi yok.
- Elmalılı Muhammed Hamdi Yazır 1942'de öldü. Türk telif mevzuatında koruma
  süresi genel olarak ölümden sonra 70 yıldır (FSEK m. 27; yeniden
  doğrulanmadı), yani özgün eserin süresi dolmuş görünüyor. Ancak modern
  yazım ya da sadeleştirilmiş baskılar ayrı haklar taşıyabilir; QUL'un hangi
  baskıyı aldığı bilinmiyor. Doğrulanamadı.

## 4. Kelime meali

- `data/word-meal.json`: QUL translation id 99, "Turkish wbw translation"
  ("The meaning of each word of the Quran in Turkish"). Sayfa kaynak ve lisans
  vermiyor.
- QUL Credits sayfası QuranWBW.com'un "word-by-word translations in multiple
  languages" sağladığını söylüyor; bu Türkçe setin oradan gelip gelmediği
  doğrulanamadı.
- `tools/patch_word_meal.py` kaynaktaki bilinen bir kaymayı (2:267) düzeltir;
  bu, kaynak verinin sahibini değiştirmez.

## 5. Sa'dî tefsiri

- `data/tafsir-saadi.json`: QUL tafsir id 484, "Tafsir As-Saadi - Turkish". Proje
  sahibi, Türkçe çevirinin kaynağının QuranEnc.com olduğunu bildirdi
  (https://quranenc.com/tr/home). QuranEnc'in Türkçe listesinde "Tafsir
  As-Saadi" çevirisi görünüyor (https://quranenc.com/tr/browse/turkish_saadi;
  listede V1.0.0, 27/07/2026). QUL kopyasının QuranEnc metniyle aynı olup
  olmadığı ve hangi sürüm olduğu karşılaştırılmadı; QUL'un lisans sayfasında
  lisans bilgisi yok.
- Çevirmenin ya da yayıncının adı ne QUL'da ne de QuranEnc'in tefsir sayfasında
  yazıyor. Arapça aslın yazarı Abdurrahman b. Nâsır es-Sa'dî'dir; çevirmen
  doğrulanamadı.
- QuranEnc'in "Hakkında" sayfası (https://quranenc.com/tr/home/about,
  2026-11-14'te okundu) çevirilerin indirilip yeniden yayımlanabileceğini şu
  şartlarla söylüyor (aşağıdaki, sayfanın şartlarının özetidir): içerikte değişiklik, ekleme ya da silme yapılmayacak; yayıncıya
  ve kaynağa (QuranEnc.com) açıkça atıf yapılacak; yeniden yayımlarken sürüm
  numarası belirtilecek ve çeviri bilgisi belgede korunacak; çeviri hakkındaki
  notlar kaynağa bildirilecek; çeviri kaynaktaki son sürüme göre güncellenecek;
  çeviriler gösterilirken uygunsuz reklam konmayacak. Sayfa bir lisans adı
  vermiyor ve gömme ya da ticari kullanım için ayrı bir şart yazmıyor.
- Bu şartlara uyum:
  - Değişiklik: dosya depoya bir kez (2026-09-14) yüklendi ve sonra
    değişmedi. Uygulama metne dokunmuyor; çizim anında yalnızca `lang`
    işaretleyicileri ekliyor, metin aynı kalıyor (`test/tafsir_dil_test.mjs`
    doğruluyor). Dosyanın bugünkü özeti, değişirse bu belgenin de gözden
    geçirilmesi için burada sabitlenir ve testle denetlenir:
    SHA-256 `2d94d87b2b52db3c99b31c9b1624fbf0d7aae20c1774a1471dbaa659857571fa`.
  - Atıf: bu belgede ve README'de QuranEnc.com anılıyor; uygulamada tefsir
    panelinde yayıncıya ve kaynağa doğrudan atıf YOK (yalnızca altbilgideki
    "Kaynaklar ve lisanslar" bağlantısı, bu belgeye gider). Açık iş 2.
  - Sürüm numarası: veride ve uygulamada yok; açık iş 2.
  - Reklam: uygulamada reklam yok.
- Bu, uygulamanın en büyük metin varlığıdır (~8,7 MB).

## 6. Konu Fihristi

`data/topics-tr.json` (2512 konu), QUL ayah-topics id 45 kaynağının Türkçe
çevirisidir. QUL sayfası konuları üç gruba ayırır ve kaynaklarını şöyle yazar:
"Ontology topics are sourced from Quran corpus project." "Thematic topics are
sourced from Clear Quran translation." Genel konuların kaynağı belirtilmemiş.
Lisans sayfası: "We don't have copyright information for this resource."

| Grup | Konu sayısı | Kaynak (QUL'a göre) | Durum |
|---|---|---|---|
| Ontoloji | 284 (17'si aynı zamanda tematik) | Quranic Arabic Corpus | GNU GPL v3 + atıf şartı |
| Tematik | 695 | Clear Quran çevirisi | Doğrulanamadı |
| Genel | 1550 | belirtilmemiş | Doğrulanamadı |

- **Ontoloji (Quranic Arabic Corpus, https://corpus.quran.com)**: Kais Dukes,
  Leeds Üniversitesi Dil Araştırma Grubu; quran.com ekibince bakımı
  yapılıyor. Lisans sayfası: "GNU General Public License, Version 3, 29 June
  2007"; "Copyright © Kais Dukes, 2009-2017. Maintained by the quran.com team.
  This is an open source project." (https://corpus.quran.com/license.jsp).
  İndirme sayfasındaki kullanım koşulu: "This annotation can be used in any
  website or application, provided its source (the Quranic Arabic Corpus) is
  clearly indicated, and a link is made to http://corpus.quran.com to enable
  users to keep track of changes." (https://corpus.quran.com/download).
  Ontoloji sayfası (https://corpus.quran.com/ontology.jsp) ayrı bir lisans
  belirtmiyor; Corpus'un genel koşulları geçerli sayıldı.
  **Atıf**: Bu veri Quranic Arabic Corpus'a dayanır: https://corpus.quran.com
- **Tematik**: Clear Quran, Dr. Mustafa Khattab'ın yayımlanmış bir çevirisidir.
  Tematik fihristinin yeniden kullanımına izin veren bir lisans bulunamadı.
- **Genel**: kaynak ve lisans bilinmiyor.
- Konuların ad, Arapça ad ve açıklama metinlerinin Türkçesi bu projede
  üretildi (İngilizce kaynak metinlerin çevirisi). Çeviri emeği projeye aittir;
  çevrilen metinlerin hakları ayrıdır. İngilizce açıklamaların yazarı
  belirtilmemiş.

## 7. Sure Bilgisi

- `data/surah-info-tr.json`: QUL surah-info id 3 ("Surah Info - English",
  "Surah information in English language") kaynağının bu projede üretilmiş
  Türkçe çevirisidir. QUL sayfası yazar, kaynak ya da lisans vermiyor.
- Gözlem: Türkçe metinler, Mevdûdî'nin (Sayyid Ebu'l-A'lâ el-Mevdûdî)
  Tefhîmü'l-Kur'ân sure girişleriyle örtüşüyor. Fâtiha'nın "İsim" ve "İniş
  Dönemi" bölümleri, IIUM sitesinde "Syed Abu-Ala' Maududi's Chapter
  Introductions to the Quran" olarak yayımlanan İngilizce metinle cümle cümle
  aynı yapıda; bölüm başlıklarının dağılımı (İsim 112 surede, İniş Dönemi 111,
  Tema ve Konu 60, Tarihî Arka Plan 18) ve Felak/Nâs surelerindeki sorular da
  bu eserin yapısına benziyor. Yalnızca Fâtiha metni ve başlık dağılımı
  karşılaştırıldı; 114 sure tek tek karşılaştırılmadı. QUL'un hangi İngilizce
  metni ya da baskıyı aldığı ve bunun için izin olup olmadığı doğrulanamadı.
- Metin gerçekten bu eserden geliyorsa iki sonuç doğar: eser sahibine açıkça
  atıf yapılmalı, ve Türkçe çeviri bir türev eser olduğundan hak sahibinin izni
  gerekebilir. Bu iki konu açıktır (bkz. "Açık işler").

## 8. Ses

- **Ayet sesleri** depoda yoktur: uygulama `https://audio-cdn.tarteel.ai/quran/
  <okuyucu>/SSSAAA.mp3` adreslerine doğrudan bağlanır (okuyucular: Abdülbâsıt
  Abdüssamed ve Mahmûd Halîl el-Husarî, Mücevved). QUL kiraat sayfası "Download
  high-quality audio files of Quranic recitations" der; kaynak ve lisans satırı
  yoktur (recitation/114: "We don't have copyright information for this
  resource."). QUL Credits sayfası kiraatleri EveryAyah.com ve
  QuranicAudio.com'un topladığını, kelime zamanlamalarını Collin Fair'in
  ürettiğini söyler.
- Tarteel'in kullanım şartları (https://www.tarteel.ai/terms) okunamadı (sayfa
  betikle yükleniyor; yalnızca başlığı alınabildi). CDN'e doğrudan bağlanmaya
  izin verilip verilmediği doğrulanamadı.
- Resmî olmayan görüşler: islamic.network topluluk forumunda sesin çoğunun
  "kamu malı" sayıldığı ve everyayah.com ya da globalquran.com'dan alındığı,
  telifin yine de kariye ait kaldığı ve açık bir hak verilmediği yazıyor
  (https://community.islamic.network/d/231-clarification-on-licensing-and-usage-rights-for-quran-recitation-api).
  QuranicAudio.com: "Mp3s on this site may be downloaded and used for personal
  use free of charge"; ticari kullanım yasak
  (https://www.quranicaudio.com/about). Bunlar bu projenin kullanımını izinli
  ya da yasak kılmaz; yalnızca belirsizliği gösterir.
- **Yerel eûzü klipleri** (`audio/euzuabdulsamad.mp3`, `audio/euzuhusari.mp3`,
  her biri ~6 sn) depoda ve GitHub Pages'te barındırılır. ID3 etiketleri:
  - `euzuabdulsamad.mp3`: sanatçı "Abdulbasit Abdussamad Mujawad", albüm
    "VerseByVerseQuran Abdulbasit Abdussamad Mujawad", yorum
    "(C) VerseByVerseQuran.com".
  - `euzuhusari.mp3`: sanatçı "Mahmood Khaleel Al Husaree Mujawwad", albüm
    "Mahmood Khaleel Al Husaree Mujawwad (VerseByVerseQuran.com)", yorum
    "4Quran.Com MP3s".
  VerseByVerseQuran.com'un kullanım koşulları bulunamadı.

## 9. Yazı tipleri ve sure başlıkları

- `fonts/DigitalKhattV2.woff2`: DigitalKhatt deposundan; depo lisansı MIT
  (`THIRD_PARTY_NOTICES.md`, bölüm 3).
- `tools/raw-data/QCF_SurahHeader_COLOR-Regular.woff2`: sure başlığı
  kutularının renkli COLR yazı tipi; `tools/build_data.py` katmanlarını SVG yoluna
  çevirip `data/surah-headers/*.json` dosyalarına gömer. Bu projedeki kayıtlarda
  tam kaynağı yazılı değil; QUL "V4 Surah Name Color Font" (id 237) ya da
  Quran.com varlıklarından gelmiş olabilir, doğrulanamadı. QUL lisans sayfası
  (font/237): "We don't have copyright information for this resource."
- Medine Mushafı yazı tiplerini yayımlayan King Fahd Glorious Quran Printing
  Complex'in (KFGQPC) yazı tipi lisansı, denetimde okunan özetlere göre
  (https://openhub.net/licenses/KFGQPC; https://fonts.qurancomplex.gov.sa/wp02/en/?p=19):
  ücretsiz kullanım, kopyalama ve dağıtıma izin verir; satışı, değiştirmeyi,
  çevirmeyi ve tersine mühendisliği yasaklar. Bu lisansın `QCF_SurahHeader_COLOR`
  için de geçerli olup olmadığı doğrulanamadı. Geçerliyse iki soru açıktır:
  yazı tipi dosyasının depoda tek başına durması, ve glif şekillerinin SVG
  yoluna çevrilip veriye gömülmesi.
- Quran Foundation, kendi API ve CDN'i için yazı tiplerinin yalnızca uygulamanın
  bütünleşik parçası olarak dağıtılabileceğini, ayrıca sunulamayacağını ve
  kendisine atıf yapılması gerektiğini yazıyor
  (https://api-docs.quran.foundation/legal/mushaf-fonts-and-images/). Bu proje
  Quran Foundation API'sini kullanmaz; yani bu koşul onu bağlamaz, yalnızca
  sektördeki uygulamayı gösterir.

## 10. Atıf yükümlülükleri

| Yükümlülük | Durum |
|---|---|
| Quranic Arabic Corpus: kaynak açıkça belirtilecek, https://corpus.quran.com bağlantısı verilecek | `README.md` ve bu belgede var. Uygulama içinde: Ezber penceresi altbilgisindeki "Kaynaklar ve lisanslar" bağlantısı bu belgeye gidiyor (Corpus bağlantısı bölüm 6'da); Konu Fihristi penceresinde doğrudan atıf yok (açık iş 9) |
| QuranEnc.com (Sa'dî tefsirinin Türkçesi): yayıncıya ve kaynağa açık atıf, sürüm numarası, değişiklik yapmama | Atıf: bu belgede ve `README.md`'de var; uygulamada tefsir panelinde yok (açık iş 2). Sürüm numarası yok. Dosya değişmedi (bölüm 5) |
| DigitalKhatt (MIT) bildirimi | `THIRD_PARTY_NOTICES.md` |
| harfbuzzjs, HarfBuzz, WOFF2, Brotli bildirimleri | `THIRD_PARTY_NOTICES.md`, `vendor/LICENSE*` |
| Tanzil (CC BY 3.0), metin ona dayanıyorsa | Dayanıp dayanmadığı doğrulanamadı; dayanıyorsa bildirim eksik |
| QUL (SSS: atıf önerilir) | `README.md`'de ve bu belgede anılıyor |

## 11. Açık işler

Öncelik sırası, doğrulanamayan konuların ağırlığına göre:

1. `data/surah-info-tr.json`: kaynak metnin sahibini ve izin durumunu
   belirlemek; izin alınamazsa içeriği değiştirmek ya da kaldırmak.
2. `data/tafsir-saadi.json`: QuranEnc.com şartlarına uymak (tefsir panelinde
   yayıncıya ve kaynağa açık atıf göstermek; sürüm numarasını belirleyip
   belgelemek: QuranEnc listesinde V1.0.0, 27/07/2026); QUL kopyasını
   QuranEnc metniyle karşılaştırmak; Türkçe çevirmenin adını bulmak ve ek
   izin gerekip gerekmediğini QuranEnc'e sormak
   (https://quranenc.com/tr/home/contact_us).
3. Tematik konular (Clear Quran): izin durumunu belirlemek.
4. `audio/euzu*.mp3`: VerseByVerseQuran.com koşullarını öğrenmek; gerekirse
   klipleri değiştirmek.
5. `QCF_SurahHeader_COLOR` yazı tipinin lisansını bulmak.
6. Tarteel kullanım şartlarını okumak (CDN'e bağlanma).
7. Elmalılı baskısını belirlemek; kelime meali ve Arapça metnin asıl
   kaynağını (Tanzil mi?) belirlemek.
8. QUL'a GitHub üzerinden lisans bilgisi sormak
   (https://github.com/TarteelAI/quranic-universal-library).
9. Konu Fihristi penceresinde Quranic Arabic Corpus'a doğrudan atıf ve
   bağlantı göstermek (şimdi atıf, altbilgideki "Kaynaklar ve lisanslar"
   bağlantısı üzerinden iki adımda: uygulama, bu belge, corpus.quran.com).
10. Altbilgideki GitHub simgesinin (`THIRD_PARTY_NOTICES.md`, bölüm 5) yolunun
    kaynağını bulmak ve renginin GitHub logo kuralına uyup uymadığını
    denetlemek; olmazsa simgeyi kaldırıp yalnızca metin bırakmak.

## 12. Hak sahibiyseniz

Bu projede hakkınız bulunan bir içerik varsa ve atıfın düzeltilmesini ya da
içeriğin kaldırılmasını istiyorsanız, lütfen proje deposunda bir issue açın:
https://github.com/mustafakilic13/dijital-mushaf/issues

## 13. Yeni veri eklerken

Depoya yeni bir veri, ses ya da yazı tipi dosyası eklemeden önce bu belgeye
satır ekleyin: kaynağı, lisans durumunu (doğrulandı / doğrulanamadı) ve varsa
atıf şartını yazın. `test/lisans_test.mjs`, kaydı olmayan dosyada başarısız olur.
