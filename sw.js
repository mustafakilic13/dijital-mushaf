// sw.js -- Dijital Mushaf servis worker'ı. Üç ayrı sorumluluk, üç ayrı
// önbellek, üç ayrı strateji:
//
//  1. SES (AUDIO_CACHE, audio-cdn.tarteel.ai) -- bkz. js/app.js'teki
//     recitationAudioUrl/RECITERS. Önbellek-önce, DİNLENDİKÇE, SINIRSIZ:
//     kullanıcının açık tercihi, boyut/LRU tahliyesi UYGULANMIYOR.
//     Yalnızca TÜM dosyayı isteyen istekler (Range yok ya da "bytes=0-")
//     önbelleğe girer/oradan döner (isWholeFileRequest); yanıt, önbelleğe
//     yazılması BEKLENMEDEN tarayıcıya akıtılır (aşağıda cacheFirstForever).
//     Yerel euzu klipleri (audio/euzu*.mp3) PRECACHE_URLS'te.
//  2. UYGULAMA KABUĞU (SHELL_CACHE, aynı-kökenli HTML/CSS/JS/vendor/font) --
//     PRECACHE_URLS'in data/ dışındaki kısmı (+ "./", yani scope kökü: manifest
//     start_url'ü) install'da önceden indirilir; fetch'te AĞ-ÖNCE: çevrimiçiyken
//     her zaman en güncel sürüm (otomatik güncelleme -- bkz. skipWaiting/
//     clients.claim aşağıda), çevrimdışıyken önbellekten.
//  3. STATİK VERİ (DATA_CACHE, aynı-kökenli data/*.json) -- PRECACHE_URLS'teki
//     "çekirdek okuma" verisi (mushaf/meal/sure-ayet listeleri/gezinme
//     tabloları) install'da doğrudan DATA_CACHE'e (fetch handler yalnızca orayı
//     okur) önceden, geri kalanı (kelime meali, konular, sure bilgisi,
//     tefsir, ses-vurgu zamanlaması, sure başlıkları) İLK KULLANILDIĞINDA;
//     ikisi de sonra önbellek-önce (veri yayımlandıktan sonra değişmiyor).
//
// Sınır YOK (1) ve (3) için: tarayıcının kendi (uygulama seviyesinden
// bağımsız) depolama kotası dışında bir tahliye yapılmıyor; bkz. README.md
// "Çevrimdışı ses önbelleği" / "PWA: app-shell önbelleği ve manifest".
//
// event.request AYNEN (yeni bir Request kurmadan) fetch()'e veriliyor:
// <audio src> gibi yüklemeler tarayıcıda zaten kendi moduyla (ör. çapraz
// köken için "no-cors") gidiyor, event.request bu modu taşıyor; kendi
// Request'imizi kursaydık varsayılan moda döner, CORS'u olmayan bir
// çapraz-köken kaynak (ses CDN'i gibi, kontrolümüzde değil) engellenebilirdi.
// Bunun bedeli: no-cors yanıtlar "opak" -- durum kodu okunamıyor, CDN bir
// hata döndürse bile fark edilmeden önbelleğe girebilir (nadiren, bilinen
// bir sınır).

const CACHE_PREFIX = "dijital-mushaf-";
const AUDIO_CACHE = CACHE_PREFIX + "audio-v1"; // SÜRÜMÜ ASLA değiştirmeyin -- bkz. activate'teki temizlik
const SHELL_CACHE = CACHE_PREFIX + "shell-v1";
const DATA_CACHE = CACHE_PREFIX + "data-v1";
const CURRENT_CACHES = new Set([AUDIO_CACHE, SHELL_CACHE, DATA_CACHE]);
const AUDIO_HOST = "audio-cdn.tarteel.ai";

// "Çekirdek okuma" -- bunlar olmadan uygulama ya hiç açılmaz ya da ayet
// metnini/mealini gösteremez; ilk ziyarette (çevrimiçiyken) önceden
// indirilir. Kelime meali/konular/sure bilgisi/tefsir/ses-vurgu
// zamanlaması/sure başlıkları gibi daha büyük, ikincil veriler BURADA YOK
// -- onlar data/ için de geçerli "ilk kullanıldığında önbelleğe al" kuralına
// göre DATA_CACHE'e kendiliğinden giriyor (bkz. fetch handler).
const PRECACHE_URLS = [
  // Scope kökü (manifest "start_url": "." / ana ekrandan açılış): dizin URL'si,
  // "index.html"den FARKLI bir önbellek anahtarı -- Cache API dizin çözümlemesi
  // yapmaz. Bunu önceden indirmezsek, kurulumdan sonra SW denetiminde hiç
  // çevrimiçi açılış olmadan çevrimdışı açılış başarısız olurdu.
  "./",
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/arama.js",
  "js/ayet-gezgini.js",
  "js/izgara-gezintisi.js",
  "js/justify.js",
  "js/liste-gezintisi.js",
  "js/meal.js",
  "js/modal-odak.js",
  "js/render.js",
  "js/search.js",
  "js/sekme-gezintisi.js",
  "js/surahinfo.js",
  "js/tafsir.js",
  "js/topics.js",
  "js/wordmeal.js",
  "vendor/hb.js",
  "vendor/hbjs.js",
  "vendor/hb.wasm",
  "vendor/woff2-decompress/decompress.js",
  "vendor/woff2-decompress/decompress.wasm",
  "fonts/DigitalKhattV2.woff2",
  // Yerel euzu klipleri (js/app.js RECITERS.*.introLocal: Fâtiha'nın ilk ayetinden önce çalan
  // isti'âze). Chromium'da bir <audio> yüklemesi "Range: bytes=0-" ile gider (ölçüldü); sunucu buna
  // 206 dönerse (Range destekleyen sunucular; GitHub Pages'in böyle yaptığı DOĞRULANMADI) Cache.put
  // "Partial response (status code 206) is unsupported" diye reddeder -- yani çalarken ağ-önce yolu
  // bu dosyaları önbelleğe alamaz. Kurulumda Range'siz (tam, 200) indirilirler; çevrimdışıyken
  // buradan, Range isteniyorsa 206 dilimiyle dönerler (bkz. respondToRange).
  "audio/euzuhusari.mp3",
  "audio/euzuabdulsamad.mp3",
  "data/mushaf.json",
  "data/surahs.json",
  "data/ayahs.json",
  "data/meal.json",
  "data/juz.json",
  "data/hizb.json",
  "data/rub.json",
  "data/manzil.json",
  "data/ruku.json",
  "data/page-first-ayah.json",
  "data/surah-pages.json",
];

// PRECACHE_URLS iki hedefe bölünür: data/* -> DATA_CACHE, geri kalanı -> SHELL_CACHE.
// Neden: fetch handler'ı /data/ isteklerini YALNIZCA DATA_CACHE'te arıyor
// (cacheFirstForever(request, DATA_CACHE)); hepsi SHELL_CACHE'e yazılırsa çekirdek
// veri orada duruyor ama hiç okunmuyordu. İlk ziyarette sayfanın kendi başlangıç
// veri istekleri de SW henüz devralmadığı için ona uğramaz -- yani DATA_CACHE'e
// başka türlü hiç girmez ve kurulumdan hemen sonraki çevrimdışı açılışta eksik kalırdı.
const isDataUrl = (url) => url.startsWith("data/");

self.addEventListener("install", (event) => {
  // Yeni sürüm, sekmeler kapanmayı beklemeden hemen devreye girsin.
  self.skipWaiting();
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS.filter((u) => !isDataUrl(u)))),
      caches.open(DATA_CACHE).then((cache) => cache.addAll(PRECACHE_URLS.filter(isDataUrl))),
    ])
  );
});

// Sure başlığı SVG'leri (data/surah-headers/1.json..114.json, bkz. js/app.js
// fetchHeaderGlyph) PRECACHE_URLS'te YOK -- hepsi birlikte 9+ MB, ilk kurulumu
// gereksiz ağırlaştırmasın diye. Ama bunun bedeli: çevrimiçiyken hiç
// GÖRÜLMEYEN bir surenin başlığı, o sureye gidilmeden çevrimdışı kalınırsa
// hiç önbellekte olmuyordu -- sayfa o noktada başlıksız/eksik görünüyordu.
// Çözüm: activate'te, SW'nin kontrolü devralmasını (clients.claim) GECİKTİRMEDEN
// -- bkz. aşağıdaki AYRI event.waitUntil -- arka planda hepsini tek tek
// ısıtıyoruz. Küçük bir eşzamanlılık sınırıyla (bant genişliğini tek seferde
// boğmasın) ve biri başarısız olursa diğerlerini durdurmadan (sayfa gerçekten
// o sureye gidildiğinde zaten normal fetch handler'dan -- cacheFirstForever/
// DATA_CACHE -- önbelleğe girer; bu yalnızca bir iyileştirme, tek bir
// noktanın başarısızlığı kritik değil). self.skipWaiting() sayesinde bu her
// SAYFA AÇILIŞINDA değil, yalnızca SW ilk kurulduğunda/güncellendiğinde bir
// kez çalışır -- önceki bir çalışmadan zaten önbellekte olanlar atlanır.
const SURAH_HEADER_COUNT = 114;
const SURAH_HEADER_URLS = Array.from({ length: SURAH_HEADER_COUNT }, (_, i) => `data/surah-headers/${i + 1}.json`);
const WARM_UP_CONCURRENCY = 4;

async function warmUpSurahHeaders() {
  const cache = await caches.open(DATA_CACHE);
  let next = 0;
  async function worker() {
    while (next < SURAH_HEADER_URLS.length) {
      const url = SURAH_HEADER_URLS[next++];
      if (await cache.match(url)) continue; // önceki bir kurulumdan/ziyaretten zaten var
      try {
        const response = await fetch(url);
        if (response.ok) await cache.put(url, response);
      } catch (err) {
        console.warn("[sw] sure başlığı önceden ısıtılamadı", url, err);
      }
    }
  }
  await Promise.all(Array.from({ length: WARM_UP_CONCURRENCY }, worker));
}

self.addEventListener("activate", (event) => {
  // clients.claim + eski sürüm temizliği, ısıtmadan AYRI bir waitUntil'de:
  // ikisi de aynı anda (paralel) başlar, biri diğerini GECİKTİRMEZ -- yalnızca
  // bu "temel" iş bittiğinde kendi waitUntil'i ayrıca settle olur, kodu
  // "asıl aktivasyon görevleri" / "arka plan iyileştirmesi" olarak ayrı
  // okunabilir tutuyor.
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Yalnızca BU UYGULAMANIN ESKİ SÜRÜM kabuk/veri önbellekleri silinir --
      // CURRENT_CACHES'te olan HER ŞEY (AUDIO_CACHE dahil) dokunulmadan
      // kalır. AUDIO_CACHE'in sürümü hiç değişmediği sürece (yukarıdaki
      // yorum) bu temizlik ona asla erişmez: "sınırsız/sonsuz" garantisi
      // servis worker güncellemelerinde de geçerli kalır.
      caches.keys().then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith(CACHE_PREFIX) && !CURRENT_CACHES.has(name))
            .map((name) => caches.delete(name))
        )
      ),
    ])
  );
  // AYRI bir waitUntil: yukarıdakinin sonucunu beklemeden hemen başlar;
  // yalnızca bu sürerken worker'ın erken sonlandırılmasını önlüyor (bkz.
  // warmUpSurahHeaders'ın üstündeki yorum) -- event.waitUntil'in DIŞINDA
  // bırakılsaydı tarayıcı worker'ı işi bitmeden sonlandırabilirdi.
  event.waitUntil(warmUpSurahHeaders());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // cache.put GET-dışını reddeder
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.hostname === AUDIO_HOST) {
    // Tam dosya istemeyen Range istekleri ağa aynen gider (respondWith çağrılmıyor): ne önbellekten
    // cevaplanır ne önbelleğe yazılır -- bkz. isWholeFileRequest.
    if (!isWholeFileRequest(request)) return;
    event.respondWith(cacheFirstForever(request, AUDIO_CACHE, event));
    return;
  }
  if (url.origin !== self.location.origin) return; // başka bir çapraz-köken isteğe dokunma

  if (url.pathname.includes("/data/")) {
    event.respondWith(cacheFirstForever(request, DATA_CACHE, event));
    return;
  }
  // Uygulama kabuğu (HTML/CSS/JS/vendor/font): çevrimiçiyken her zaman en
  // güncelini dene (otomatik güncelleme), yalnızca ağ başarısız olursa
  // önbellekten.
  event.respondWith(networkFirstShell(request));
});

// <audio src> yüklemeleri "Range" başlığıyla gider. Chromium ilk istekte "bytes=0-" (dosyanın TAMAMI)
// ister (ölçüldü); sonra gerekirse "bytes=N-" ile devam eder ya da dosyanın bir yerini ister (atlama,
// dosya sonundaki etiket okuması). Safari'nin önce "bytes=0-1" ile yoklaması ve Firefox'un da
// "bytes=0-" istemesi bilinen davranışlardır, burada DENENMEDİ. Önbellek
// anahtarı yalnızca URL (Range yok sayılır) ve opak bir yanıtın durumu, Content-Range'i ya da
// gövdesi okunamıyor: dilimlenemez. Bu yüzden önbellekteki kayıt YALNIZCA "dosyanın başından
// sonuna" isteğine doğru cevaptır. Başka bir Range isteğine onu vermek tarayıcıyı bozuyor (ölçüm:
// Chromium'da Content-Range'i uyuşmayan 206 alınca çalmayı "data source error" ile bırakıyor) ve
// ağdan gelen kısmi bir yanıtı aynı anahtara yazmak, tam kaydın üstüne eksik bir kayıt koyardı.
function isWholeFileRequest(request) {
  const range = request.headers.get("range");
  return range === null || /^bytes=0-$/.test(range.trim());
}

// Önbellekte varsa ağa HİÇ gitmeden onu döndürür (SES ve VERİ için ortak --
// ikisi de yayımlandıktan sonra değişmiyor, ikisi de SINIRSIZ: bkz. dosya
// başlığı); yoksa ağdan çekip bir kopyasını önbelleğe ekler.
//
// Yanıt, kopyanın önbelleğe yazılması BEKLENMEDEN döndürülür: yazma event.waitUntil'de arka planda
// sürer (worker erken kapatılmasın diye). Eskiden burada `await cache.put(...)` vardı; bu, yanıtı
// gövdesi TAMAMEN inene kadar sayfaya vermiyordu -- ölçüm (Chromium, ~1 MB klip, 400 KB/sn ağ):
// ilk ses 2,7 sn'de başlıyor, yani her yeni ayet, indirme süresi kadar sessizlikle başlıyordu.
// Sayfa yanıtı akarak okur; kopya önbelleğe giderken iptal edilse (çalma durdurulsa) bile ağ
// isteği kopya için sürer, yalnızca ağ KOPARSA yazma reddedilir ve eksik kayıt bırakılmaz.
async function cacheFirstForever(request, cacheName, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // response.ok && status !== 206: aynı-kökenli/CORS'lu bir GET başarıyla döndü (206 kısmi yanıtı
  // Cache.put reddeder, denemenin anlamı yok). type === "opaque": no-cors çapraz-köken isteği --
  // durumu okuyamıyoruz ama bu (yukarıdaki dosya başlığında açıklandığı gibi) normal ve beklenen
  // durum.
  if ((response.ok && response.status !== 206) || response.type === "opaque") {
    const copy = response.clone(); // gövde okunmaya başlamadan, döndürmeden ÖNCE
    event.waitUntil(
      (async () => {
        try {
          await cache.put(request, copy);
        } catch (err) {
          // Depolama kotası dolmuş vb. -- önbellekleme başarısız olsa bile asıl
          // yanıt (çalma/okuma) bundan etkilenmesin, yalnızca bu seferlik
          // önbelleğe alınamaz.
          console.warn("[sw] önbelleğe alınamadı", request.url, err);
        }
      })()
    );
  }
  return response;
}

// Uygulama kabuğu için ağ-önce: başarılı bir ağ yanıtı HEM döndürülür HEM
// (varsa daha önceki hâlinin üzerine) önbelleğe yazılır -- çevrimiçiyken bu
// sayede her zaman en güncel sürüm kullanılır. Ağ başarısız olursa (gerçekten
// çevrimdışı) önbellekten dönülür; o da yoksa (ör. daha önce hiç açılmamış
// bir dosya) hata ileri sürülür. İstisna: sayfa GEZİNTİSİ (request.mode ===
// "navigate") için tam eşleşme yoksa -- ör. URL'de bir sorgu dizesi
// (`?utm_...`) varsa -- uygulama kabuğu (index.html) dönülür: tek sayfalık bir
// uygulama, hangi gezinti URL'si olursa olsun aynı kabuğu açar.
async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    // 206: sunucunun bir Range isteğine (<audio>) kısmi yanıtı. Cache.put onu reddeder; tam kopya
    // zaten kurulumda (PRECACHE_URLS) alındı, bu yüzden yazmayı denemiyoruz (her çalmada konsola
    // "kabuk güncellenemedi" uyarısı düşüyordu).
    if (response.ok && response.status !== 206) {
      try {
        await cache.put(request, response.clone());
      } catch (err) {
        console.warn("[sw] kabuk güncellenemedi (önbellek)", request.url, err);
      }
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return respondToRange(request, cached);
    if (request.mode === "navigate") {
      const shell = await cache.match("index.html");
      if (shell) return shell;
    }
    throw err;
  }
}

// Önbellekteki TAM (200) yanıtı, istek bir Range içeriyorsa (<audio>) o aralığın 206 yanıtına çevirir.
// Çevrimdışı euzu klibi böyle çalıyor: tam bir 200'ü Range'li isteğe vermek Chromium'da çalıyor
// (ölçüldü); WebKit gibi sıkı oynatıcıların 206 + Content-Range beklediği bilinir (denenmedi). Tek
// bir "bytes=a-b", "bytes=a-" ya da "bytes=-n" dışındaki her şey (çoklu aralık, tanınmayan biçim)
// yok sayılır ve tam yanıt döner -- sunucunun Range'i yok sayması geçerli bir cevaptır. Opak
// yanıtlar dilimlenemez; bu yalnızca aynı-kökenli, kendi indirdiğimiz dosyalar için.
async function respondToRange(request, cached) {
  const header = request.headers.get("range");
  if (!header || cached.status !== 200) return cached;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return cached;

  const body = await cached.clone().arrayBuffer();
  const size = body.byteLength;
  let start;
  let end;
  if (m[1] === "") {
    // "bytes=-n": dosyanın son n baytı ("bytes=-0" start = size verir, aşağıda 416 olur).
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  return new Response(body.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "application/octet-stream",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
    },
  });
}
