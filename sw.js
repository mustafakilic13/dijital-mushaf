// sw.js -- Dijital Mushaf servis worker'ı.
//
// ŞU ANLIK TEK İŞİ: ayet ses dosyalarını (audio-cdn.tarteel.ai, bkz.
// js/app.js'teki recitationAudioUrl/RECITERS) DİNLENDİKÇE önbelleğe almak,
// böylece bir kez çalınan bir ayet çevrimdışıyken de (ya da bir dahaki
// sefere veri harcamadan) çalar. Sayfa/CSS/JS/mushaf verisi gibi başka
// hiçbir şeye dokunmuyor -- onlar bu servis worker'ın kapsamı dışında,
// normal ağ davranışıyla yükleniyor (bkz. README.md "Çevrimdışı/PWA").
//
// Sınır YOK: kullanıcının açık tercihi bu -- boyut/LRU tahliyesi
// UYGULANMIYOR. Önbellek yalnızca tarayıcının kendi (uygulama seviyesinden
// bağımsız) depolama kotası dolduğunda büyür durur; bkz. README.
//
// Strateji: önbellek-önce (cache-first). Ses dosyaları bir kez
// yayımlandıktan sonra değişmiyor, o yüzden önbellekte varsa ağa hiç
// gidilmiyor (hem çevrimdışı çalışır hem tekrar dinlemede veri harcamaz);
// yoksa ağdan çekilip -- oynatmayı bloklamadan -- bir kopyası önbelleğe
// ekleniyor. event.request AYNEN (yeni bir Request kurmadan) fetch()'e
// veriliyor: <audio src> yüklemeleri tarayıcıda zaten "no-cors" modunda,
// event.request bu modu taşıyor; kendi Request'imizi kursaydık varsayılan
// "cors" moduna döner ve CDN'in CORS başlığı yoksa (kontrolümüzde değil)
// istek engellenebilirdi. Bunun bedeli: no-cors yanıtlar "opak" -- durum
// kodu okunamıyor, bu yüzden CDN bir hata döndürse bile fark edilmeden
// önbelleğe girebilir (nadiren, ama bilinen bir sınır; bkz. README).

const AUDIO_CACHE = "dijital-mushaf-audio-v1";
const AUDIO_HOST = "audio-cdn.tarteel.ai";

self.addEventListener("install", () => {
  // Yeni sürüm, sekmeler kapanmayı beklemeden hemen devreye girsin --
  // gelecekte bu dosya değişirse otomatik güncelleme için (bkz.
  // "activate"teki clients.claim ve README'nin güncelleme bölümü).
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
  if (url.hostname !== AUDIO_HOST) return; // yalnızca ayet sesleri -- başka her şey normal ağ davranışında kalır
  event.respondWith(cacheFirstAudio(request));
});

async function cacheFirstAudio(request) {
  const cache = await caches.open(AUDIO_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // response.ok: aynı-kökenli/CORS'lu bir GET başarıyla döndü. type ===
  // "opaque": no-cors çapraz-köken isteği -- durumu okuyamıyoruz ama
  // (yukarıdaki yorumda açıklandığı gibi) bu normal ve beklenen durum.
  if (response.ok || response.type === "opaque") {
    try {
      await cache.put(request, response.clone());
    } catch (err) {
      // Depolama kotası dolmuş vb. -- önbellekleme başarısız olsa bile
      // çalma işlemi bundan etkilenmesin, yalnızca bu seferlik önbelleğe
      // alınamaz.
      console.warn("[sw] ses önbelleğe alınamadı", request.url, err);
    }
  }
  return response;
}
