// sw.js -- Dijital Mushaf servis worker'ı. Üç ayrı sorumluluk, üç ayrı
// önbellek, üç ayrı strateji:
//
//  1. SES (AUDIO_CACHE, audio-cdn.tarteel.ai) -- bkz. js/app.js'teki
//     recitationAudioUrl/RECITERS. Önbellek-önce, DİNLENDİKÇE, SINIRSIZ:
//     kullanıcının açık tercihi, boyut/LRU tahliyesi UYGULANMIYOR.
//  2. UYGULAMA KABUĞU (SHELL_CACHE, aynı-kökenli HTML/CSS/JS/vendor/font) --
//     PRECACHE_URLS install'da önceden indirilir; fetch'te AĞ-ÖNCE: çevrimiçiyken
//     her zaman en güncel sürüm (otomatik güncelleme -- bkz. skipWaiting/
//     clients.claim aşağıda), çevrimdışıyken önbellekten.
//  3. STATİK VERİ (DATA_CACHE, aynı-kökenli data/*.json) -- PRECACHE_URLS'teki
//     "çekirdek okuma" verisi (mushaf/meal/sure-ayet listeleri/gezinme
//     tabloları) önceden, geri kalanı (kelime meali, konular, sure bilgisi,
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
  "index.html",
  "css/style.css",
  "js/app.js",
  "js/arama.js",
  "js/justify.js",
  "js/meal.js",
  "js/render.js",
  "js/search.js",
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

self.addEventListener("install", (event) => {
  // Yeni sürüm, sekmeler kapanmayı beklemeden hemen devreye girsin.
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener("activate", (event) => {
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
    event.respondWith(cacheFirstForever(request, AUDIO_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return; // başka bir çapraz-köken isteğe dokunma

  if (url.pathname.includes("/data/")) {
    event.respondWith(cacheFirstForever(request, DATA_CACHE));
    return;
  }
  // Uygulama kabuğu (HTML/CSS/JS/vendor/font): çevrimiçiyken her zaman en
  // güncelini dene (otomatik güncelleme), yalnızca ağ başarısız olursa
  // önbellekten.
  event.respondWith(networkFirstShell(request));
});

// Önbellekte varsa ağa HİÇ gitmeden onu döndürür (SES ve VERİ için ortak --
// ikisi de yayımlandıktan sonra değişmiyor, ikisi de SINIRSIZ: bkz. dosya
// başlığı); yoksa ağdan çekip -- yanıtı bloklamadan -- bir kopyasını
// önbelleğe ekler.
async function cacheFirstForever(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // response.ok: aynı-kökenli/CORS'lu bir GET başarıyla döndü. type ===
  // "opaque": no-cors çapraz-köken isteği -- durumu okuyamıyoruz ama bu
  // (yukarıdaki dosya başlığında açıklandığı gibi) normal ve beklenen durum.
  if (response.ok || response.type === "opaque") {
    try {
      await cache.put(request, response.clone());
    } catch (err) {
      // Depolama kotası dolmuş vb. -- önbellekleme başarısız olsa bile asıl
      // yanıt (çalma/okuma) bundan etkilenmesin, yalnızca bu seferlik
      // önbelleğe alınamaz.
      console.warn("[sw] önbelleğe alınamadı", request.url, err);
    }
  }
  return response;
}

// Uygulama kabuğu için ağ-önce: başarılı bir ağ yanıtı HEM döndürülür HEM
// (varsa daha önceki hâlinin üzerine) önbelleğe yazılır -- çevrimiçiyken bu
// sayede her zaman en güncel sürüm kullanılır. Ağ başarısız olursa (gerçekten
// çevrimdışı) önbellekten dönülür; o da yoksa (ör. daha önce hiç açılmamış
// bir dosya) hata ileri sürülür.
async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch (err) {
        console.warn("[sw] kabuk güncellenemedi (önbellek)", request.url, err);
      }
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}
