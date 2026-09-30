// sw.js (servis worker: ayet seslerini dinlendikçe, sınırsız önbelleğe
// alma) için regresyon kontrolü. Bir servis worker gerçek bir tarayıcı
// dışında (self/caches globalleri, install/activate/fetch olayları)
// çalışmadığından, sw.js'in kaynağı sahte self/caches ile bir Function
// içinde çalıştırılıp addEventListener çağrılarıyla kaydedilen
// dinleyiciler ELLE tetikleniyor. Node'un YERLEŞİK fetch/Request/Response'u
// (v18+) kullanılıyor; yalnızca ağı KONTROLLÜ hâle getirmek için global
// fetch, her senaryoda kendi sahte uygulamamla değiştiriliyor. caches
// (Cache Storage) tarayıcıya özgü olduğu için tamamen bellek-içi bir
// sahte sürümle karşılanıyor.
//
//   node sw_test.mjs
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const swSource = fs.readFileSync(path.join(ROOT, "sw.js"), "utf-8");
const appSource = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf-8");

let failures = 0;
function check(name, cond) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${name}`);
  }
}

// -- gerçek CDN kalıbıyla senkron mu (app.js'teki recitationAudioUrl'den) --------------------------------
const REAL_HOST = /https:\/\/([a-z0-9.-]+)\/quran\//.exec(appSource)?.[1];
check("app.js'te recitationAudioUrl'in gerçek CDN host'u bulundu (regresyon: aşağıdaki kontrol boşa geçmesin)", !!REAL_HOST);
check(`sw.js: AUDIO_HOST, app.js'teki gerçek CDN host'uyla (${REAL_HOST}) birebir aynı`, new RegExp(`AUDIO_HOST = "${REAL_HOST}"`).test(swSource));

// -- sınır/LRU YOK -- kaynakta hiç tahliye mantığı bulunmamalı (kullanıcının açık isteği) -----------------
// (satır başındaki "//" yorumları çıkarılıyor: dosyanın kendi açıklayıcı
// yorumu "LRU tahliyesi UYGULANMIYOR" gibi bu kelimeleri zaten içeriyor --
// asıl sorulması gereken KODUN içinde geçiyor mu.)
const swCodeOnly = swSource.replace(/\/\/.*$/gm, "");
check("sw.js KODUNDA (yorumlar hariç) boyut/LRU/tahliye mantığı YOK (cache.delete, keys().length, max_items vb. hiçbiri geçmiyor)", !/cache\.delete|caches\.delete|\.keys\(\)|max[_-]?items|max[_-]?age|LRU|evict/i.test(swCodeOnly));

// -- sahte ServiceWorkerGlobalScope kurulumu ------------------------------------------------------------
function makeMockCaches() {
  const stores = new Map(); // cacheName -> Map(url -> Response)
  return {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const bucket = stores.get(name);
      return {
        match: async (req) => bucket.get(typeof req === "string" ? req : req.url),
        put: async (req, res) => {
          bucket.set(typeof req === "string" ? req : req.url, res);
        },
      };
    },
    _bucketSizes: () => Object.fromEntries([...stores].map(([k, v]) => [k, v.size])),
  };
}

// self: addEventListener çağrılarını yakalayıp test'in elle tetikleyebileceği
// bir kayda ({ install, activate, fetch }) yazan minik bir sahte hedef.
function loadWorker({ fetchImpl }) {
  const listeners = {};
  const self = {
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    skipWaiting: () => {
      self._skipWaitingCalled = true;
    },
    clients: { claim: async () => {} },
  };
  const caches = makeMockCaches();
  const calls = { fetch: [] };
  const fetch = async (req) => {
    calls.fetch.push(typeof req === "string" ? req : req.url);
    return fetchImpl(req);
  };
  new Function("self", "caches", "fetch", "console", swSource)(self, caches, fetch, console);
  return { self, caches, listeners, calls };
}

function fetchEvent(request) {
  let responded = null;
  return {
    event: {
      request,
      respondWith(promise) {
        responded = promise;
      },
    },
    result: () => responded, // respondWith'e verilen Promise (çağrılmadıysa null)
  };
}

// -- install / activate ömür döngüsü -----------------------------------------------------------------------
{
  const { self, listeners } = loadWorker({ fetchImpl: async () => new Response("x") });
  check("install/activate dinleyicileri kayıtlı", typeof listeners.install === "function" && typeof listeners.activate === "function");
  listeners.install({});
  check("install: self.skipWaiting() çağrılıyor (yeni sürüm hemen devreye girsin)", self._skipWaitingCalled === true);
  let claimed = false;
  self.clients.claim = async () => {
    claimed = true;
  };
  let waited = null;
  listeners.activate({ waitUntil: (p) => (waited = p) });
  await waited;
  check("activate: event.waitUntil içinde clients.claim() çağrılıyor (açık sekmeler de hemen kontrol altına alınsın)", claimed === true);
}

// -- fetch: yalnızca ses CDN'i, yalnızca GET ----------------------------------------------------------------
{
  const { listeners } = loadWorker({ fetchImpl: async () => new Response("audio-bytes") });
  const other = fetchEvent(new Request("https://mustafakilic13.github.io/dijital-mushaf/data/meal.json"));
  listeners.fetch(other.event);
  check("ses CDN'i DIŞINDAKİ istekler ele alınmıyor (respondWith çağrılmıyor -- normal ağ davranışında kalır)", other.result() === null);

  const post = fetchEvent(new Request("https://audio-cdn.tarteel.ai/quran/husaryMujawwad/001001.mp3", { method: "POST" }));
  listeners.fetch(post.event);
  check("GET olmayan istekler (aynı host'ta bile) ele alınmıyor (cache.put GET-dışını reddeder)", post.result() === null);
}

// -- cache miss -> ağdan çek, önbelleğe al, döndür -------------------------------------------------------------
{
  const { listeners, calls, caches } = loadWorker({ fetchImpl: async () => new Response("ilk-ayet-ses-bayt") });
  const url = "https://audio-cdn.tarteel.ai/quran/husaryMujawwad/002255.mp3";
  const e = fetchEvent(new Request(url));
  listeners.fetch(e.event);
  check("eşleşen istek respondWith ile ele alınıyor", e.result() !== null);
  const res = await e.result();
  check("önbellekte yokken ağdan çekiliyor (1 kez)", calls.fetch.length === 1 && calls.fetch[0] === url);
  check("dönen yanıtın gövdesi doğru", (await res.clone().text()) === "ilk-ayet-ses-bayt");
  const cache = await caches.open("dijital-mushaf-audio-v1");
  const cached = await cache.match(url);
  check("yanıt önbelleğe de yazıldı", !!cached && (await cached.clone().text()) === "ilk-ayet-ses-bayt");
}

// -- cache hit -> ağa HİÇ gidilmiyor (bir dahaki sefere veri harcamıyor, çevrimdışı çalışıyor) --------------------
{
  const url = "https://audio-cdn.tarteel.ai/quran/husaryMujawwad/012004.mp3";
  const { listeners, calls } = loadWorker({ fetchImpl: async () => new Response("yusuf-4") });
  const first = fetchEvent(new Request(url));
  listeners.fetch(first.event);
  await first.result();
  check("ilk çağrıda ağa gidildi", calls.fetch.length === 1);
  const second = fetchEvent(new Request(url));
  listeners.fetch(second.event);
  const res2 = await second.result();
  check("AYNI url'e ikinci istek ağa HİÇ gitmiyor (önbellekten)", calls.fetch.length === 1);
  check("...ve önbellekteki doğru gövdeyi döndürüyor", (await res2.clone().text()) === "yusuf-4");
}

// -- opak (no-cors çapraz köken) yanıt da önbelleğe alınıyor -----------------------------------------------------
{
  const url = "https://audio-cdn.tarteel.ai/quran/abdulBasitMujawwad/001001.mp3";
  const opaque = new Response("opak-govde");
  Object.defineProperty(opaque, "type", { value: "opaque" });
  Object.defineProperty(opaque, "ok", { value: false });
  const { listeners, caches } = loadWorker({ fetchImpl: async () => opaque });
  const e = fetchEvent(new Request(url));
  listeners.fetch(e.event);
  await e.result();
  const cache = await caches.open("dijital-mushaf-audio-v1");
  check("type==='opaque' yanıt da (ok:false olsa dahi) önbelleğe alınıyor", !!(await cache.match(url)));
}

// -- önbellekleme başarısız olsa bile çalma yanıtı kesintiye uğramıyor ----------------------------------------------
// try/catch: bu senaryo başarısız olursa (ör. sw.js'teki koruma kaldırılırsa
// respondWith'e verilen Promise REDDEDİLİR) tek başına bir hata olarak
// işaretlensin, geri kalan senaryoları çökertip listenin devamını gizlemesin.
try {
  const url = "https://audio-cdn.tarteel.ai/quran/husaryMujawwad/002001.mp3";
  const listeners2 = {};
  const self2 = { addEventListener: (t, f) => (listeners2[t] = f), skipWaiting() {}, clients: { claim: async () => {} } };
  const cachesThatThrow = {
    open: async () => ({
      match: async () => undefined,
      put: async () => {
        throw new Error("QuotaExceededError");
      },
    }),
  };
  const fetchImpl = async () => new Response("ses-yine-de-gelmeli");
  new Function("self", "caches", "fetch", "console", swSource)(self2, cachesThatThrow, fetchImpl, { warn() {}, log() {} });
  const e = fetchEvent(new Request(url));
  listeners2.fetch(e.event);
  const res = await e.result();
  check("cache.put hata fırlatsa da yanıt yine de döndürülüyor (çalma etkilenmiyor)", (await res.clone().text()) === "ses-yine-de-gelmeli");
} catch (err) {
  check(`cache.put hata fırlatsa da yanıt yine de döndürülüyor (çalma etkilenmiyor) -- istek REDDEDİLDİ: ${err.message}`, false);
}

// -- her iki hafız/URL kalıbı ayrı ayrı önbellekleniyor (birbirini ezmiyor) ------------------------------------------
{
  const a1 = "https://audio-cdn.tarteel.ai/quran/husaryMujawwad/001001.mp3";
  const a2 = "https://audio-cdn.tarteel.ai/quran/abdulBasitMujawwad/001001.mp3"; // aynı ayet, farklı hafız
  const { listeners, caches } = loadWorker({
    fetchImpl: async (req) => new Response(req.url.includes("husary") ? "husary-ses" : "abdulbasit-ses"),
  });
  for (const url of [a1, a2]) {
    const e = fetchEvent(new Request(url));
    listeners.fetch(e.event);
    await e.result();
  }
  const cache = await caches.open("dijital-mushaf-audio-v1");
  const c1 = await cache.match(a1);
  const c2 = await cache.match(a2);
  check("iki hafızın aynı ayeti ayrı anahtarlarla, birbirini ezmeden önbellekleniyor", (await c1.clone().text()) === "husary-ses" && (await c2.clone().text()) === "abdulbasit-ses");
}

// -- event.request AYNEN fetch()'e veriliyor (yeni bir Request kurulmuyor) --------------------------------------
// Neden önemli: <audio src> yüklemeleri tarayıcıda "no-cors" modunda gider;
// event.request bu modu taşıyor. Kendi Request'imizi kursaydık (mode
// belirtilmeden) varsayılan "cors" moduna dönerdi ve CDN'in CORS başlığı
// yoksa (kontrolümüzde değil) istek engellenebilirdi.
{
  const url = "https://audio-cdn.tarteel.ai/quran/husaryMujawwad/007001.mp3";
  const req = new Request(url, { mode: "no-cors" });
  let seenMode = null;
  const listeners = {};
  const self3 = { addEventListener: (t, f) => (listeners[t] = f), skipWaiting() {}, clients: { claim: async () => {} } };
  const caches3 = { open: async () => ({ match: async () => undefined, put: async () => {} }) };
  const fetchImpl = async (r) => {
    seenMode = r.mode;
    return new Response("x");
  };
  new Function("self", "caches", "fetch", "console", swSource)(self3, caches3, fetchImpl, console);
  const e = fetchEvent(req);
  listeners.fetch(e.event);
  await e.result();
  check("sw.js fetch()'e event.request'i AYNEN veriyor -- mode korunuyor ('no-cors' 'cors'a dönüşmüyor)", seenMode === "no-cors");
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log("All checks passed (sw.js: install/activate, yalnız ses-CDN+GET filtresi, cache-first, opak yanıt, hata dayanıklılığı, hafız ayrımı, sınır/LRU yokluğu, CDN host senkronu).");
}
