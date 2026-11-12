// sw.js (servis worker: ayet seslerini dinlendikçe önbelleğe alma; kota
// dolarken ses önbelleğinin EN ESKİ kayıtlarını silme) için regresyon
// kontrolü. Bir servis worker gerçek bir tarayıcı
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
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const swSource = readText("sw.js");
const html = readText("index.html");
const SHELL_CACHE_NAME = "dijital-mushaf-shell-v1";
const DATA_CACHE_NAME = "dijital-mushaf-data-v1";
const AUDIO_CACHE_NAME = "dijital-mushaf-audio-v1";
// Gerçek Cache API, göreli bir URL'yi (ör. cache.addAll(["data/mushaf.json"]))
// servis worker'ın KENDİ adresine göre mutlak URL'ye çözer; sahte önbellek de
// aynısını yapmalı -- aksi hâlde "göreli anahtarla yazıldı, mutlak istekle
// aranıyor" uyuşmazlığı testlerde görünmez kalır (install'ın çekirdek veriyi
// yanlış önbelleğe yazması tam olarak böyle gözden kaçmıştı).
const SW_URL = "https://mustafakilic13.github.io/dijital-mushaf/sw.js";
const SCOPE_URL = new URL(".", SW_URL).href; // https://mustafakilic13.github.io/dijital-mushaf/
const absUrl = (u) => (typeof u === "string" ? new URL(u, SW_URL).href : u.url);
const isData = (u) => u.startsWith("data/");
// Tüm PRECACHE_URLS'i elle kopyalamak yerine, sw.js'in KENDİ dizisini
// kaynaktan çıkarıyoruz -- liste değişse bile test otomatik senkron kalır,
// ayrıca birkaç KRİTİK dosyanın (meal, mushaf, uygulama girişi, HarfBuzz
// wasm'ı, Quran fontu) listede olduğunu AYRICA doğruluyoruz (aşağıda).
// Üst düzeydeki self.addEventListener(...) çağrıları GERÇEKTEN ÇALIŞIYOR
// (yalnızca tanım değil), o yüzden self/caches/fetch için en az birer sahte
// değer veriyoruz -- aksi hâlde "self is not defined" ile patlar.
const [PRECACHE_URLS, SURAH_HEADER_URLS] = new Function(
  "self", "caches", "fetch", "console",
  `${swSource}\nreturn [PRECACHE_URLS, SURAH_HEADER_URLS];`
)(
  { addEventListener() {}, skipWaiting() {}, clients: { claim: async () => {} }, location: { origin: "https://x" } },
  { open: async () => ({ match: async () => {}, put: async () => {}, addAll: async () => {} }), keys: async () => [] },
  async () => new Response(),
  console
);
const PRECACHE_SAMPLE = PRECACHE_URLS; // install testinde tamamı kontrol ediliyor
check("SURAH_HEADER_URLS tam 114 (Kur'an'daki sure sayısı)", SURAH_HEADER_URLS.length === 114 && SURAH_HEADER_URLS[0] === "data/surah-headers/1.json" && SURAH_HEADER_URLS[113] === "data/surah-headers/114.json");
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

// -- tahliye YALNIZCA ses önbelleğinde ve YALNIZCA kota kuralıyla (kullanıcının kararı) -----------------------
// (satır başındaki "//" yorumları çıkarılıyor: dosyanın kendi açıklayıcı yorumu bu kelimeleri zaten
// içeriyor -- asıl sorulması gereken KODUN içinde geçiyor mu.)
const swCodeOnly = swSource.replace(/\/\/.*$/gm, "");
const outsideAudioEviction = swCodeOnly.replace(/^async function (?:trimAudioCache|relieveAudioCache)\([^)]*\) \{\n[\s\S]*?^\}$/gm, "");
check("sw.js KODUNDA tek tek kayıt silme (cache.delete(istek)) VAR ama YALNIZCA ses önbelleği tahliye işlevlerinde (trimAudioCache, relieveAudioCache); başka hiçbir yerde yok (caches.delete(adı) -- TÜM bir önbelleği silmek, eski SÜRÜM temizliği için -- ayrı ve meşru, aşağıda ayrıca test ediliyor)", /\bcache\.delete\(/.test(swCodeOnly) && !/\bcache\.delete\(/.test(outsideAudioEviction));
check("sw.js KODUNDA kayıt SAYISI / yaş / LRU sınırı YOK (max_items vb. hiçbiri geçmiyor): tahliye yalnızca kota tabanlı", !/max[_-]?items|max[_-]?age|\bLRU\b/i.test(swCodeOnly));
// Eşik değerleri bilerek BURADA sabitleniyor (aşağıdaki kota testlerinin sayıları ve README bunlara göre yazıldı): sw.js'te
// biri değişirse bu kontrol kırılır ve değişiklik testlerle README'ye de bilinçli olarak yansıtılır.
const constNum = (name) => Number(new RegExp(`const ${name} = ([0-9.]+);`).exec(swSource)?.[1]);
const quotaConsts = ["AUDIO_HIGH_WATER", "AUDIO_LOW_WATER", "AUDIO_RELIEF_FRACTION", "AUDIO_TRIM_MAX_FRACTION"].map(constNum);
check(`kota sabitleri testlerdeki ve README'deki değerlerle aynı (AUDIO_HIGH_WATER 0.8, AUDIO_LOW_WATER 0.7, AUDIO_RELIEF_FRACTION 0.1, AUDIO_TRIM_MAX_FRACTION 0.2; bulunan: ${quotaConsts.join(", ")})`, quotaConsts.join(",") === "0.8,0.7,0.1,0.2");

// -- sahte ServiceWorkerGlobalScope kurulumu ------------------------------------------------------------
// quota/sizeOf: kota tahliyesi testleri için basit bir depolama modeli. sizeOf(url, yanıt) kaydın kullandığı "kota
// birimi"dir (Chromium opak yanıtlara gerçek boylarından çok fazlasını sayar); verilmezse hiçbir kayıt kota yemez ve
// put asla kota hatası vermez (kota ile ilgisiz testler için eski davranış). Kullanım, TÜM önbelleklerdeki kayıtların
// toplamıdır; put kullanımı kotanın ÜSTÜNE çıkaracaksa gerçek Cache.put gibi QuotaExceededError (DOMException, code
// 22) ile reddedilir; delete kullanımı anında düşürür (Chromium'da ölçüldü: estimate() silmeden hemen sonra düşük).
function makeMockCaches(fetchRef, { quota = Infinity, sizeOf = () => 0 } = {}) {
  const stores = new Map(); // cacheName -> Map(url -> Response)
  const usage = () => {
    let total = 0;
    for (const bucket of stores.values()) for (const [u, r] of bucket) total += sizeOf(u, r);
    return total;
  };
  return {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const bucket = stores.get(name);
      return {
        // Gerçek Cache.match her çağrıda YENİ bir Response döndürür (gövdesi diğer çağrılardan bağımsız okunur).
        match: async (req) => bucket.get(absUrl(req))?.clone(),
        // Gerçek Cache.put kısmi (206) bir yanıtı TypeError ile reddeder (Chromium: "Partial response (status
        // code 206) is unsupported"); opak yanıtın durumu 0 göründüğünden o geçer. Sahte de aynısını yapmalı --
        // aksi hâlde "206'yı yazmayı deniyor" hatası testte görünmez kalırdı.
        put: async (req, res) => {
          if (res.status === 206) throw new TypeError("Partial response (status code 206) is unsupported");
          const key = absUrl(req);
          const growth = sizeOf(key, res) - (bucket.has(key) ? sizeOf(key, bucket.get(key)) : 0);
          if (usage() + growth > quota) throw new DOMException("Quota exceeded.", "QuotaExceededError");
          bucket.delete(key); // gerçek Cache: aynı anahtarı yeniden put etmek kaydı SONA taşır (Chromium'da ölçüldü)
          bucket.set(key, res);
        },
        // Gerçek Cache.keys(): kayıtların Request'leri, EKLEME sırasıyla. Bir match() isabeti sırayı değiştirmez
        // (Chromium'da ölçüldü) -- yani "en eski" = ilk eklenen.
        keys: async () => [...bucket.keys()].map((u) => new Request(u)),
        delete: async (req) => bucket.delete(absUrl(req)),
        // Gerçek Cache.addAll gibi: her url'i (test'in kontrollü fetch'iyle)
        // çeker ve saklar; biri başarısız olursa TÜMÜ reddedilir (gerçek
        // davranışla aynı -- eksik bir dosya "install" başarısız sayılmalı).
        addAll: async (urls) => {
          const pairs = await Promise.all(urls.map(async (u) => [u, await fetchRef(u)]));
          for (const [u, res] of pairs) bucket.set(absUrl(u), res);
        },
      };
    },
    _usage: usage,
    _bucketSizes: () => Object.fromEntries([...stores].map(([k, v]) => [k, v.size])),
    _hasBucket: (name) => stores.has(name),
    _setBucket: (name, map) => stores.set(name, map), // testte eski-sürüm önbelleği simüle etmek için
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
}

// self: addEventListener çağrılarını yakalayıp test'in elle tetikleyebileceği
// bir kayda ({ install, activate, fetch }) yazan minik bir sahte hedef.
// estimate: verilirse self.navigator.storage.estimate olur (kota tahliyesinin "önceden" yolu); verilmezse
// self.navigator hiç yok (storage.estimate desteklemeyen bir tarayıcı gibi). cachesOpts: makeMockCaches'e.
function loadWorker({ fetchImpl, clientsClaim, consoleImpl, estimate, cachesOpts } = {}) {
  const listeners = {};
  const calls = { fetch: [] };
  const fetch = async (req) => {
    calls.fetch.push(typeof req === "string" ? req : req.url);
    return fetchImpl(req);
  };
  const caches = makeMockCaches(fetch, cachesOpts);
  const self = {
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    skipWaiting: () => {
      self._skipWaitingCalled = true;
    },
    clients: { claim: clientsClaim || (async () => {}) },
    location: { origin: "https://mustafakilic13.github.io" },
  };
  if (estimate) self.navigator = { storage: { estimate } };
  new Function("self", "caches", "fetch", "console", swSource)(self, caches, fetch, consoleImpl || console);
  return { self, caches, listeners, calls };
}

// activate artık BİRDEN ÇOK event.waitUntil() çağırıyor (clients.claim+temizlik VE
// ayrı olarak sure başlığı ısıtması, bkz. sw.js) -- tek bir değişkene atamak
// SONUNCUYU ezer; hepsini toplayıp Promise.all ile birlikte bekliyoruz.
function collectWaitUntil() {
  const all = [];
  return { waitUntil: (p) => all.push(p), all: () => Promise.all(all) };
}

function fetchEvent(request) {
  let responded = null;
  const waited = [];
  return {
    event: {
      request,
      respondWith(promise) {
        responded = promise;
      },
      // Gerçek FetchEvent'te de var: sw.js yanıtı döndürürken önbelleğe yazmayı arka planda sürdürür.
      waitUntil(promise) {
        waited.push(promise);
      },
    },
    result: () => responded, // respondWith'e verilen Promise (çağrılmadıysa null)
    settled: () => Promise.all(waited), // event.waitUntil'e verilen arka plan işlerinin bitişi
    waitedCount: () => waited.length,
  };
}

// -- install / activate ömür döngüsü -----------------------------------------------------------------------
{
  const { self, listeners, caches } = loadWorker({ fetchImpl: async () => new Response("x") });
  check("install/activate dinleyicileri kayıtlı", typeof listeners.install === "function" && typeof listeners.activate === "function");
  let installWaited = null;
  listeners.install({ waitUntil: (p) => (installWaited = p) });
  check("install: self.skipWaiting() çağrılıyor (yeni sürüm hemen devreye girsin)", self._skipWaitingCalled === true);
  await installWaited;
  const shell = await caches.open(SHELL_CACHE_NAME);
  const dataCache = await caches.open(DATA_CACHE_NAME);
  const shellUrls = PRECACHE_SAMPLE.filter((u) => !isData(u));
  const dataUrls = PRECACHE_SAMPLE.filter(isData);
  check("install: PRECACHE_URLS hem kabuk (data/ dışı) hem veri (data/) dosyası içeriyor (aşağıdaki 'tamamı' kontrolleri boş kümede sessizce geçmesin)", shellUrls.length > 0 && dataUrls.length > 0);
  check("install: kabuk dosyaları (PRECACHE_URLS'te data/ dışındakilerin tamamı, './' scope kökü dahil) SHELL_CACHE'e yazıldı", (await Promise.all(shellUrls.map((u) => shell.match(u)))).every(Boolean));
  check("install: çekirdek veri (PRECACHE_URLS'teki data/*) DATA_CACHE'e yazıldı -- fetch handler /data/ isteklerini yalnızca orada arıyor", (await Promise.all(dataUrls.map((u) => dataCache.match(u)))).every(Boolean));
  check("install: çekirdek veri SHELL_CACHE'te ayrıca (hiç okunmayacak bir çift kopya olarak) TUTULMUYOR", (await Promise.all(dataUrls.map((u) => shell.match(u)))).every((r) => r === undefined));
  let claimed = false;
  self.clients.claim = async () => {
    claimed = true;
  };
  const act = collectWaitUntil();
  listeners.activate(act);
  await act.all();
  check("activate: event.waitUntil içinde clients.claim() çağrılıyor (açık sekmeler de hemen kontrol altına alınsın)", claimed === true);
}

// -- fetch: yalnızca ses CDN'i / aynı-köken data-shell, başka hiçbir şeye dokunmuyor ---------------------
{
  const { listeners } = loadWorker({ fetchImpl: async () => new Response("audio-bytes") });
  const other = fetchEvent(new Request("https://baska-bir-site.example/bir-kaynak.js"));
  listeners.fetch(other.event);
  check("tamamen İLGİSİZ bir üçüncü-taraf (ne ses CDN'i ne kendi kökenimiz) ele alınmıyor (respondWith çağrılmıyor -- normal ağ davranışında kalır)", other.result() === null);

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
  await e.settled();
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
  await first.settled();
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
  await e.settled();
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
    await e.settled();
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

// -- ses: önbelleğe yalnızca TÜM dosyayı isteyen istekler girer / önbellekten döner ----------------------------
// Gerçek Chromium ölçümü: <audio src> ilk istekte "Range: bytes=0-" gönderir (dosyanın TAMAMI), sonra gerekirse
// "bytes=N-" ile devam eder. Önbellek anahtarı yalnızca URL (Range yok sayılır) ve opak yanıt dilimlenemez:
// kayıt ancak "başından sonuna" isteğine doğru cevaptır. Başka bir Range isteğine onu vermek tarayıcıyı bozuyor
// (Content-Range'i uyuşmayan 206 -> çalma "data source error" ile duruyor) ve ağdan gelen kısmi bir yanıtı aynı
// anahtara yazmak tam kaydın üstüne eksik bir kayıt koyardı: o istekler ağa AYNEN gitmeli (respondWith yok).
{
  const url = "https://audio-cdn.tarteel.ai/quran/husaryMujawwad/055001.mp3";
  const mkOpaque = (body) => {
    const r = new Response(body);
    Object.defineProperty(r, "type", { value: "opaque" });
    Object.defineProperty(r, "ok", { value: false });
    return r;
  };
  {
    const { listeners, caches, calls } = loadWorker({ fetchImpl: async () => mkOpaque("tam-dosya") });
    const e = fetchEvent(new Request(url, { headers: { Range: "bytes=0-" } }));
    listeners.fetch(e.event);
    check('"Range: bytes=0-" (tarayıcının ilk <audio> isteği: dosyanın TAMAMI) ele alınıyor', e.result() !== null);
    await e.result();
    await e.settled();
    check('..."bytes=0-" yanıtı ses önbelleğine giriyor', !!(await (await caches.open(AUDIO_CACHE_NAME)).match(url)));
    const e2 = fetchEvent(new Request(url, { headers: { Range: "bytes=40000-" } }));
    listeners.fetch(e2.event);
    check('önbellekte kayıt VARKEN bile "bytes=40000-" (dosyanın bir yeri) ele alınmıyor: kayıt tam dosyadır, başka bir aralığa doğru cevap değildir', e2.result() === null);
    check("...ve SW ağa gitmiyor (tarayıcı isteği kendisi yapar)", calls.fetch.length === 1);
    const e3 = fetchEvent(new Request(url));
    listeners.fetch(e3.event);
    check("Range'siz istek (ör. fetch() ile) hâlâ ele alınıyor ve önbellekten dönüyor", e3.result() !== null && (await (await e3.result()).text()) === "tam-dosya" && calls.fetch.length === 1);
  }
  for (const range of ["bytes=1-", "bytes=40000-", "bytes=0-1", "bytes=0-99", "bytes=-128", "bytes=0-1,5-6", "bytes=00-", "items=0-", "xbytes=0-"]) {
    const { listeners, caches, calls } = loadWorker({ fetchImpl: async () => mkOpaque("x") });
    const e = fetchEvent(new Request(url, { headers: { Range: range } }));
    listeners.fetch(e.event);
    check(`"Range: ${range}" ele alınmıyor (respondWith çağrılmıyor)`, e.result() === null);
    await e.settled();
    check(`"Range: ${range}": SW ne ağa gidiyor ne ses önbelleğine yazıyor`, calls.fetch.length === 0 && (await (await caches.open(AUDIO_CACHE_NAME)).match(url)) === undefined);
  }
}

// -- ses: yanıt, önbelleğe yazma BİTMEDEN döndürülüyor (akış hemen başlasın) -------------------------------------
// Eskiden `await cache.put(...)` yanıtı gövdesi TAMAMEN inene kadar sayfaya vermiyordu: gerçek Chromium'da
// ~1 MB'lık klip 400 KB/sn'de 2,7 sn sonra çalmaya başlıyordu (yani her yeni ayet, indirme süresi kadar sessizlikle).
// Burada put bir kapıyla tutuluyor: yanıt kapı AÇILMADAN dönmeli, yazma event.waitUntil'e verilmeli.
{
  const url = "https://audio-cdn.tarteel.ai/quran/husaryMujawwad/056001.mp3";
  let releasePut;
  const gate = new Promise((r) => (releasePut = r));
  let putStarted = false;
  let stored = null;
  const listeners = {};
  const selfX = { addEventListener: (t, f) => (listeners[t] = f), skipWaiting() {}, clients: { claim: async () => {} } };
  const cachesX = {
    open: async () => ({
      match: async () => undefined,
      put: async (req, res) => {
        putStarted = true;
        await gate;
        stored = await res.text();
      },
    }),
  };
  new Function("self", "caches", "fetch", "console", swSource)(selfX, cachesX, async () => new Response("ses-govdesi"), console);
  const e = fetchEvent(new Request(url));
  listeners.fetch(e.event);
  const BLOCKED = Symbol("blocked");
  const res = await Promise.race([e.result(), new Promise((r) => setTimeout(() => r(BLOCKED), 300))]);
  check("yanıt, önbelleğe yazma BİTMEDEN (put hâlâ bekliyorken) döndürülüyor", res !== BLOCKED);
  check("...yazma o sırada başlamış ve hâlâ sürüyor", putStarted === true && stored === null);
  check("yazma event.waitUntil'e verildi (worker, yazma bitmeden kapatılmasın)", e.waitedCount() === 1);
  releasePut();
  await e.settled();
  check("yazma bitince önbelleğe TAM gövde yazıldı", stored === "ses-govdesi");
  let pageBody = null;
  try {
    pageBody = res !== BLOCKED ? await res.text() : null;
  } catch (err) {
    pageBody = `HATA: ${err.message}`; // gövde iki yere (sayfa + önbellek) paylaşılırsa ikincisi "body used" ile düşer
  }
  check("...ve sayfaya dönen yanıt da (kopya önbelleğe giderken) tam okunabiliyor", pageBody === "ses-govdesi");
}
{
  // Yazma REDDEDİLİRSE (kota dolu) waitUntil'e verilen iş reddedilmiyor: uyarı yazılıyor, çalma etkilenmiyor.
  const warnings = [];
  const url = "https://audio-cdn.tarteel.ai/quran/husaryMujawwad/056002.mp3";
  const listeners = {};
  const selfX = { addEventListener: (t, f) => (listeners[t] = f), skipWaiting() {}, clients: { claim: async () => {} } };
  const cachesX = { open: async () => ({ match: async () => undefined, put: () => { throw new Error("QuotaExceededError (eşzamanlı)"); } }) };
  new Function("self", "caches", "fetch", "console", swSource)(selfX, cachesX, async () => new Response("ses"), { warn: (...a) => warnings.push(a.join(" ")), log() {} });
  const e = fetchEvent(new Request(url));
  listeners.fetch(e.event);
  const res = await e.result();
  let settledOk = true;
  await e.settled().catch(() => (settledOk = false));
  check("cache.put EŞZAMANLI hata fırlatsa da (reddedilen söz değil, doğrudan throw) yanıt dönüyor ve waitUntil işi reddedilmiyor", (await res.text()) === "ses" && settledOk);
  check("...ve konsola 'önbelleğe alınamadı' uyarısı yazılıyor", warnings.length === 1 && /önbelleğe alınamadı/.test(warnings[0]));
}

// -- 206 (kısmi) yanıt önbelleğe yazılmaya ÇALIŞILMIYOR (Cache.put onu reddeder; her çalmada uyarı düşüyordu) --------
{
  const origin = "https://mustafakilic13.github.io/dijital-mushaf/";
  {
    // Aynı-kökenli <audio> (euzu klibi): sunucu Range'e 206 döner (GitHub Pages gibi).
    const warnings = [];
    const url = origin + "audio/euzuhusari.mp3";
    const { listeners, caches } = loadWorker({
      fetchImpl: async () => new Response("kismi-govde", { status: 206, headers: { "Content-Range": "bytes 0-10/11" } }),
      consoleImpl: { warn: (...a) => warnings.push(a.join(" ")), log() {}, error() {} },
    });
    const e = fetchEvent(new Request(url, { headers: { Range: "bytes=0-" } }));
    listeners.fetch(e.event);
    const res = await e.result();
    check("aynı-kökenli 206 yanıt sayfaya AYNEN dönüyor (durum, Content-Range, gövde)", res.status === 206 && res.headers.get("content-range") === "bytes 0-10/11" && (await res.text()) === "kismi-govde");
    check("...kabuk önbelleğine yazılmıyor", (await (await caches.open(SHELL_CACHE_NAME)).match(url)) === undefined);
    check("...ve konsola uyarı düşmüyor ('kabuk güncellenemedi' her çalmada tekrarlanıyordu)", warnings.length === 0);
  }
  {
    // CDN, CORS'lu (opak olmayan) 206: ses önbelleğine yazılmıyor, uyarı yok.
    const warnings = [];
    const url = "https://audio-cdn.tarteel.ai/quran/husaryMujawwad/057001.mp3";
    const { listeners, caches } = loadWorker({
      fetchImpl: async () => new Response("kismi", { status: 206 }),
      consoleImpl: { warn: (...a) => warnings.push(a.join(" ")), log() {}, error() {} },
    });
    const e = fetchEvent(new Request(url));
    listeners.fetch(e.event);
    const res = await e.result();
    await e.settled();
    check("CDN'den opak olmayan 206 yanıt sayfaya dönüyor", res.status === 206 && (await res.text()) === "kismi");
    check("...ses önbelleğine yazılmıyor ve uyarı düşmüyor", (await (await caches.open(AUDIO_CACHE_NAME)).match(url)) === undefined && warnings.length === 0 && e.waitedCount() === 0);
  }
  {
    // 200 hâlâ yazılıyor (yukarıdaki 206 koşulu 200'ü engellememeli).
    const url = origin + "audio/euzuabdulsamad.mp3";
    const { listeners, caches } = loadWorker({ fetchImpl: async () => new Response("tam-govde") });
    const e = fetchEvent(new Request(url));
    listeners.fetch(e.event);
    await e.result();
    check("aynı-kökenli 200 yanıt kabuk önbelleğine yazılmaya devam ediyor", (await (await caches.open(SHELL_CACHE_NAME)).match(url)) !== undefined);
  }
}

// -- ses: kota dolarken / dolmaya yakınken EN ESKİ kayıtlar silinir (kullanıcının kararı) ------------------------
// Depolama modeli (makeMockCaches): kota 1000 birim, her ses klibi 10 birim (gerçekte Chromium opak yanıtlara klip
// başına ortalama ~6,8 MB sayıyor), uygulamanın kendi kabuk+veri kayıtları 2 x 50 birim; üst eşik %80 = 800, alt
// eşik %70 = 700. estimate() kullanımı aynı modelden okur; silme kullanımı anında düşürür.
{
  const clipUrl = (n) => `https://audio-cdn.tarteel.ai/quran/husaryMujawwad/${String(n).padStart(6, "0")}.mp3`;
  const clipNo = (u) => Number(/\/(\d{6})\.mp3$/.exec(u)[1]);
  const opaque = (body) => {
    const r = new Response(body);
    Object.defineProperty(r, "type", { value: "opaque" });
    Object.defineProperty(r, "ok", { value: false });
    return r;
  };
  const sizeOf = (u) => (u.startsWith("https://audio-cdn.tarteel.ai/") ? 10 : 50);
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Bir senaryo çökerse (ör. sw.js'te bir korumanın kalkmasıyla waitUntil işi reddedilirse) tek bir hata olarak
  // işaretlensin; geri kalan senaryoların kontrolleri gizlenmesin.
  async function scenario(name, fn) {
    try {
      await fn();
    } catch (err) {
      check(`ses kota tahliyesi, ${name}: senaryo ÇÖKTÜ -- ${err && err.message}`, false);
    }
  }

  // estimate: "model" (modelin gerçek kullanımı), "yok" (self.navigator hiç yok) ya da (dünya) => ({ usage, quota }).
  async function quotaWorld({ quota = 1000, estimate = "model", fetchImpl } = {}) {
    const warnings = [];
    let estimateCalls = 0;
    let w;
    const estimateFn =
      estimate === "yok"
        ? undefined
        : async () => {
            estimateCalls++;
            return estimate === "model" ? { usage: w.caches._usage(), quota } : estimate(w);
          };
    w = loadWorker({
      fetchImpl: fetchImpl || (async (req) => opaque(`ses-${clipNo(req.url)}`)),
      consoleImpl: { warn: (...a) => warnings.push(a.map(String).join(" ")), log() {}, error() {} },
      estimate: estimateFn,
      cachesOpts: { quota, sizeOf },
    });
    // Uygulamanın kendi kayıtları (kabuk + veri): ses kayıtlarından DAHA ESKİ eklendi -- tahliye yalnızca sıraya
    // bakıyor olsaydı ilk onlar silinirdi.
    const shell = await w.caches.open(SHELL_CACHE_NAME);
    const data = await w.caches.open(DATA_CACHE_NAME);
    await shell.put(SCOPE_URL + "js/app.js", new Response("kabuk"));
    await data.put(SCOPE_URL + "data/mushaf.json", new Response("veri"));
    const audio = await w.caches.open(AUDIO_CACHE_NAME);
    return {
      ...w,
      warnings,
      estimateCalls: () => estimateCalls,
      shell,
      data,
      // "Önceden dinlenmiş" klipler: tahliye mantığına uğramadan doğrudan önbelleğe yazılır.
      preload: async (a, b) => {
        for (const n of range(a, b)) await audio.put(clipUrl(n), opaque(`ses-${n}`));
      },
      // Bir klibi servis worker üzerinden çalar; sayfaya dönen gövdeyi verir. Dönerken arka plan işleri (yazma +
      // tahliye) de bitmiş olur.
      play: async (n) => {
        const e = fetchEvent(new Request(clipUrl(n)));
        w.listeners.fetch(e.event);
        const res = await e.result();
        const body = await res.clone().text();
        await e.settled();
        return body;
      },
      ids: async () => (await audio.keys()).map((r) => clipNo(r.url)),
      usage: () => w.caches._usage(),
      appIntact: async () => !!(await shell.match(SCOPE_URL + "js/app.js")) && !!(await data.match(SCOPE_URL + "data/mushaf.json")),
    };
  }

  // ÖNCEDEN yolu: kullanım kotanın %80'ini aşınca en eskiden başlayarak %70'e inene kadar silinir.
  await scenario("önceden (estimate eşiği)", async () => {
    const w = await quotaWorld();
    for (const n of range(1, 70)) await w.play(n);
    check("kullanım kotanın TAM %80'inde (800/1000) tahliye YOK: 70 klibin hepsi önbellekte", w.usage() === 800 && same(await w.ids(), range(1, 70)));
    check("eşiğin altında hiçbir uyarı yazılmadı", w.warnings.length === 0);
    check("eşiği aşan klibin (71.) yanıtı sayfaya sağlam dönüyor", (await w.play(71)) === "ses-71");
    check("%80 aşılınca (810) en eski klipler silindi: kullanım %70'e (700) inene kadar, yani 1..11; 12..71 duruyor", w.usage() === 700 && same(await w.ids(), range(12, 71)));
    check("...en yeni klip (71) duruyor, en eski (1) gitti: sıra EKLEME sırası (ilk giren ilk çıkar)", (await w.ids()).includes(71) && !(await w.ids()).includes(1));
    check("kabuk ve veri önbelleği DOKUNULMADI (uygulamanın kayıtları ses kayıtlarından eski olsa da: silinen YALNIZCA ses)", await w.appIntact());
    for (const n of range(72, 81)) await w.play(n);
    check("histerezis: tahliyeden sonra kullanım %70'ten %80'e çıkarken yeni yazımlar tahliye TETİKLEMİYOR (12..81 duruyor)", w.usage() === 800 && same(await w.ids(), range(12, 81)));
    await w.play(82);
    check("%80 yeniden aşılınca yine en eskiler silindi: 12..22 gitti, 23..82 duruyor", w.usage() === 700 && same(await w.ids(), range(23, 82)));
    const before = w.estimateCalls();
    check("önbellek İSABETİ (ağa ve yazmaya gidilmeyen) bir klip sayfaya dönüyor...", (await w.play(82)) === "ses-82");
    check("...ve o sırada kullanım tahmini OKUNMUYOR (tahmin yalnızca ses YAZIMINDAN sonra okunur)", w.estimateCalls() === before);
    // FIFO, LRU değil: bir isabet kaydın yerini değiştirmiyor, en eski klip ne kadar dinlenirse dinlensin ilk o silinir.
    for (let i = 0; i < 3; i++) await w.play(23);
    for (const n of range(83, 93)) await w.play(n);
    check("FIFO (LRU değil): en eski klip (23) art arda dinlenip isabet aldı, yine de ilk o silindi (23..33 gitti, 34..93 duruyor)", same(await w.ids(), range(34, 93)));
  });

  // Uzun bir dinleme: kota hiç dolmuyor, hiçbir yazımın sonunda kullanım eşiğin üstünde KALMIYOR.
  await scenario("uzun dinleme", async () => {
    const w = await quotaWorld();
    let maxUsage = 0;
    for (const n of range(1, 300)) {
      await w.play(n);
      maxUsage = Math.max(maxUsage, w.usage());
    }
    const ids = await w.ids();
    check(`300 klip art arda: kota hiç dolmadı (QuotaExceededError uyarısı yok) ve her yazımdan sonra kullanım <= 800 (en yüksek: ${maxUsage})`, w.warnings.length === 0 && maxUsage <= 800);
    check(`...kalan klipler ardışık ve EN YENİLER (…, 300), 60-70 tane (bulunan: ${ids.length}), kabuk/veri sağlam`, ids[ids.length - 1] === 300 && same(ids, range(ids[0], 300)) && ids.length >= 60 && ids.length <= 70 && (await w.appIntact()));
  });

  // SONRADAN yolu: estimate yok ya da yanlış, put kota hatası veriyor -> en eski kayıtların %10'u (yukarı yuvarlanır).
  for (const [label, estimate] of [["storage.estimate YOK (self.navigator tanımsız)", "yok"], ["estimate var ama kullanımı hep düşük bildiriyor", () => ({ usage: 0, quota: 1000 })]]) {
    await scenario(`sonradan (${label})`, async () => {
      const w = await quotaWorld({ quota: 950, estimate }); // 100 + 85 x 10 = 950: 85 klip sığar
      await w.preload(1, 85);
      check(`[${label}] başlangıç: kota tam dolu (950/950), 85 klip`, w.usage() === 950 && (await w.ids()).length === 85);
      check(`[${label}] kota dolu iken gelen klibin (86.) yanıtı yine de sayfaya sağlam dönüyor (çalma etkilenmiyor)`, (await w.play(86)) === "ses-86");
      check(`[${label}] o klip bu sefer önbelleğe GİRMEDİ (put QuotaExceededError verdi) ve konsola tek bir 'önbelleğe alınamadı' uyarısı yazıldı`, !(await w.ids()).includes(86) && w.warnings.filter((m) => /önbelleğe alınamadı/.test(m)).length === 1);
      check(`[${label}] yer açıldı: en eski kayıtların %10'u (ceil(85 x 0,1) = 9) silindi, 1..9 gitti, 10..85 duruyor`, same(await w.ids(), range(10, 85)) && w.usage() === 860);
      check(`[${label}] kabuk ve veri önbelleği DOKUNULMADI`, await w.appIntact());
      check(`[${label}] aynı klip sonraki çalışta önbelleğe giriyor (artık yer var) ve en yeni sırada duruyor`, (await w.play(86)) === "ses-86" && same(await w.ids(), [...range(10, 85), 86]));
      check(`[${label}] ikinci çalışta yeni uyarı yok (toplam 1)`, w.warnings.length === 1);
    });
  }
  await scenario("sonradan, yalnızca sonradan yolu", async () => {
    // Kota hatası yazımı: önce yalnızca yer açılır (%10); tahmin yüksek olsa da ardından "önceden" turu BAŞLAMAZ
    // (o yalnızca BAŞARILI bir yazımdan sonra çalışır).
    const w = await quotaWorld({ quota: 950, estimate: (world) => ({ usage: world.caches._usage(), quota: 1000 }) });
    await w.preload(1, 85); // 950: gerçek kota dolu, ama tahmin (kota 1000) %95 gösteriyor
    check("kota hatası veren yazımdan sonra yalnızca %10 silindi (9 kayıt); kullanım %86'da kalsa da ek bir 'önceden' turu çalışmadı", (await w.play(86)) === "ses-86" && same(await w.ids(), range(10, 85)) && w.usage() === 860 && w.estimateCalls() === 0);
  });
  await scenario("sonradan, küçük önbellek", async () => {
    const w = await quotaWorld({ quota: 130, estimate: "yok" }); // 100 + 3 x 10
    await w.preload(1, 3);
    await w.play(4);
    check("3 kayıtlık dolu önbellekte kota hatası: en az 1 kayıt (en eski) siliniyor (ceil(3 x 0,1) = 1): 2, 3 kalır", same(await w.ids(), [2, 3]));
  });

  // Üst sınır: bir tur, kayıtların %20'sinden fazlasını silmiyor (alt eşiğe inemese bile).
  await scenario("tur başına üst sınır", async () => {
    const w = await quotaWorld();
    for (let i = 0; i < 8; i++) await w.shell.put(SCOPE_URL + `js/ek-${i}.js`, new Response("x")); // kabuk 500 birime çıktı
    await w.preload(1, 30); // 500 + 300 = 800
    await w.play(31); // 810 > 800: alt eşiğe (700) inmek için 11 silme gerekir
    check("alt eşiğe inmek için %20'den fazla silmek gerekse de tur floor(31 x 0,2) = 6 kayıtta duruyor (1..6 gitti, 7..31 duruyor, kullanım 750)", same(await w.ids(), range(7, 31)) && w.usage() === 750);
  });
  await scenario("az kayıtta tur en az 1 siler", async () => {
    const w = await quotaWorld({ quota: 150 }); // %80 = 120
    await w.preload(1, 2); // 100 + 20 = 120: tam eşikte
    await w.play(3); // 130 > 120
    check("3 kayıtta tur başına sınır floor(3 x 0,2) = 0 olurdu: en az 1 kayıt (en eski) siliniyor, 2 ve 3 kalıyor", same(await w.ids(), [2, 3]));
  });

  // Tahmin güvenilir değilse silme durur / hiç başlamaz.
  await scenario("tahmin silmeyi yansıtmıyor", async () => {
    const w = await quotaWorld({ quota: 1e9, estimate: () => ({ usage: 900, quota: 1000 }) });
    await w.preload(1, 50);
    await w.play(51);
    check("tahmin hep %90 gösteriyor (silmeye yanıt vermiyor): tur 1 kayıttan sonra duruyor (10'luk üst sınıra kadar sürmüyor)", same(await w.ids(), range(2, 51)));
  });
  await scenario("tahmin yavaş düşüyor", async () => {
    const w = await quotaWorld({
      quota: 1e9,
      estimate: (world) => ({ usage: 900 - (51 - world.caches._bucketSizes()[AUDIO_CACHE_NAME]), quota: 1000 }), // her silmede 1 birim düşer
    });
    await w.preload(1, 50);
    await w.play(51);
    check("tahmin her silmede biraz düşüyor ama alt eşiğe hiç inmiyor: tur floor(51 x 0,2) = 10 kayıtta duruyor (önbelleği boşaltmıyor)", same(await w.ids(), range(11, 51)));
  });
  await scenario("tahmin ilk okumadan sonra bozuluyor", async () => {
    let reads = 0;
    const w = await quotaWorld({
      quota: 1e9,
      estimate: () => {
        if (reads++ === 0) return { usage: 900, quota: 1000 };
        throw new Error("sonraki okuma başarısız");
      },
    });
    await w.preload(1, 50);
    await w.play(51);
    check("tahmin silmeler SIRASINDA okunamaz olursa tur durur (1 kayıt silindi), uyarı yazılmaz", same(await w.ids(), range(2, 51)) && w.warnings.length === 0);
  });
  for (const [label, estimate] of [
    ["estimate() hata fırlatıyor", () => { throw new Error("estimate patladı"); }],
    ["kota 0", () => ({ usage: 900, quota: 0 })],
    ["kullanım tanımsız", () => ({ usage: undefined, quota: 1000 })],
    ["kullanım negatif", () => ({ usage: -5, quota: 1000 })],
    ["NaN", () => ({ usage: NaN, quota: NaN })],
    ["undefined döndürüyor", () => undefined],
  ]) {
    await scenario(`geçersiz tahmin (${label})`, async () => {
      const w = await quotaWorld({ quota: 1e9, estimate });
      await w.preload(1, 50);
      await w.play(51);
      check(`geçersiz tahmin (${label}) = tahmin yok sayılır: hiçbir kayıt silinmiyor ve uyarı yazılmıyor`, same(await w.ids(), range(1, 51)) && w.warnings.length === 0);
    });
  }

  // Eşzamanlı yazımlar: temizlikler birbiri ardına (üst üste binmeden) çalışır.
  await scenario("eşzamanlı yazımlar", async () => {
    let active = 0;
    let maxActive = 0;
    const w = await quotaWorld({
      estimate: async (world) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 1));
        const usage = world.caches._usage();
        active--;
        return { usage, quota: 1000 };
      },
    });
    await w.preload(1, 68); // 780
    const bodies = await Promise.all(range(69, 73).map((n) => w.play(n)));
    const ids = await w.ids();
    check("5 klip AYNI ANDA yazılırken yanıtların hepsi sağlam dönüyor", same(bodies, range(69, 73).map((n) => `ses-${n}`)));
    check(`temizlikler üst üste binmiyor: kullanım tahminini hiçbir an iki tur birden okumadı (en yüksek eşzamanlı okuma: ${maxActive})`, maxActive === 1);
    check(`sonuç tutarlı: kalanlar en yeni klipler (…, 73), ardışık (eskiden yeniye sıra korunmuş), kullanım <= 800 (bulunan: ${w.usage()})`, ids[ids.length - 1] === 73 && same(ids, range(ids[0], 73)) && ids[0] >= 12 && w.usage() <= 800);
  });

  // Temizlik, waitUntil'e verilen işin İÇİNDE: worker, silmeler bitmeden kapatılmasın. (Silme yavaşlatılıyor: iş
  // beklenmezse play() döndüğünde kayıtlar henüz silinmemiş olur.)
  for (const [label, opts, expected] of [
    ["sonradan (kota hatası)", { quota: 950, estimate: "yok" }, range(10, 85)],
    ["önceden (kullanım eşiği)", { quota: 1000, estimate: "model" }, range(12, 71)],
  ]) {
    await scenario(`waitUntil, temizlik bitene kadar sürer (${label})`, async () => {
      const w = await quotaWorld(opts);
      await w.preload(1, opts.quota === 950 ? 85 : 70);
      const realOpen = w.caches.open;
      w.caches.open = async (name) => {
        const c = await realOpen(name);
        return name === AUDIO_CACHE_NAME ? { ...c, delete: async (req) => { await new Promise((r) => setTimeout(r, 2)); return c.delete(req); } } : c;
      };
      await w.play(opts.quota === 950 ? 86 : 71); // play, event.waitUntil işleri bitince döner
      check(`yavaş silmede bile waitUntil işi temizlik BİTENE kadar sürüyor (${label}): play döndüğünde en eski kayıtlar silinmiş`, same(await w.ids(), expected));
    });
  }

  // Hata yalıtımı: temizlik başarısız olursa yanıt ve sonraki temizlikler etkilenmez.
  await scenario("temizlik hatası (silme)", async () => {
    const w = await quotaWorld({ quota: 950, estimate: "yok" });
    await w.preload(1, 85);
    const realOpen = w.caches.open;
    w.caches.open = async (name) => {
      const c = await realOpen(name);
      return name === AUDIO_CACHE_NAME ? { ...c, delete: async () => { throw new Error("silinemedi"); } } : c;
    };
    check("kota hatası + temizlik (cache.delete) de başarısız: yanıt yine de sağlam dönüyor ve waitUntil işi reddedilmiyor", (await w.play(86)) === "ses-86");
    check("...iki uyarı yazıldı: 'önbelleğe alınamadı' (put) ve 'ses önbelleği temizlenemedi' (silme)", w.warnings.some((m) => /önbelleğe alınamadı/.test(m)) && w.warnings.some((m) => /ses önbelleği temizlenemedi/.test(m)));
    w.caches.open = realOpen; // silme düzeldi
    await w.play(87);
    check("temizlik zinciri hatadan SONRA da çalışıyor: bir sonraki kota hatasında en eski 9 kayıt silindi (1..9 gitti)", same(await w.ids(), range(10, 85)));
  });
  await scenario("temizlik hatası (keys)", async () => {
    const w = await quotaWorld({ estimate: () => ({ usage: 900, quota: 1000 }), quota: 1e9 });
    await w.preload(1, 20);
    const realOpen = w.caches.open;
    w.caches.open = async (name) => {
      const c = await realOpen(name);
      return name === AUDIO_CACHE_NAME ? { ...c, keys: async () => { throw new Error("keys başarısız"); } } : c;
    };
    check("eşik aşıldı ama cache.keys() başarısız: yanıt sağlam dönüyor, waitUntil işi reddedilmiyor", (await w.play(21)) === "ses-21");
    check("...uyarı yazıldı ve hiçbir kayıt silinmedi", w.warnings.some((m) => /ses önbelleği temizlenemedi/.test(m)) && same(await w.ids(), range(1, 21)));
  });

  // Hangi put hatası kota hatasıdır, ve kabuk/veri yazımının kota hatası ses önbelleğini silmez.
  await scenario("put hatası türleri", async () => {
    const w = await quotaWorld({ quota: 1e9, estimate: "yok" });
    await w.preload(1, 20);
    const realOpen = w.caches.open;
    let failure = new TypeError("boom");
    w.caches.open = async (name) => {
      const c = await realOpen(name);
      return name === AUDIO_CACHE_NAME ? { ...c, put: async () => { throw failure; } } : c;
    };
    await w.play(21);
    check("kota-dışı bir put hatası (TypeError) HİÇBİR kaydı silmiyor", same(await w.ids(), range(1, 20)));
    failure = undefined; // tuhaf ama geçerli: `throw undefined`
    check("put'un reddedilme nedeni tanımsız olsa bile yanıt dönüyor ve hiçbir kayıt silinmiyor", (await w.play(21)) === "ses-21" && same(await w.ids(), range(1, 20)));
    failure = Object.assign(new Error("adı QuotaExceededError olan ama code'u olmayan hata"), { name: "QuotaExceededError" });
    await w.play(22);
    check("adı 'QuotaExceededError' olan hata kota hatası sayılıyor: ceil(20 x 0,1) = 2 kayıt silindi (1, 2 gitti)", same(await w.ids(), range(3, 20)));
    failure = Object.assign(new Error("eski tarayıcı"), { code: 22 });
    await w.play(23);
    check("adı farklı olsa da code 22 (eski DOMException kodu) kota hatası sayılıyor: ceil(18 x 0,1) = 2 kayıt silindi (3, 4 gitti)", same(await w.ids(), range(5, 20)));
  });
  await scenario("kabuk/veri yazımı", async () => {
    const w = await quotaWorld({ quota: 1e9, estimate: () => ({ usage: 900, quota: 1000 }), fetchImpl: async () => new Response("icerik") });
    await w.preload(1, 20);
    const quotaError = () => new DOMException("Quota exceeded.", "QuotaExceededError");
    const realOpen = w.caches.open;
    w.caches.open = async (name) => {
      const c = await realOpen(name);
      return name === AUDIO_CACHE_NAME ? c : { ...c, put: async () => { throw quotaError(); } };
    };
    const dataEvent = fetchEvent(new Request(SCOPE_URL + "data/word-meal.json"));
    w.listeners.fetch(dataEvent.event);
    const dataRes = await dataEvent.result();
    await dataEvent.settled();
    const shellEvent = fetchEvent(new Request(SCOPE_URL + "js/yeni.js"));
    w.listeners.fetch(shellEvent.event);
    const shellRes = await shellEvent.result();
    check("veri ve kabuk yazımı kota hatası verse de yanıtlar sağlam dönüyor", (await dataRes.text()) === "icerik" && (await shellRes.text()) === "icerik");
    check("...ses önbelleği DOKUNULMADI (kabuk/veri kota hatası ses kayıtlarını silmez: kalıcı hatada her sayfa açılışı onu eritirdi)", same(await w.ids(), range(1, 20)));
    check("...kabuk ve veri önbelleğinin kendi kayıtları da DOKUNULMADI (tahliye işlevi yanlışlıkla o önbelleğe uygulanmıyor)", await w.appIntact());
    check("...ve kullanım tahmini YALNIZCA ses yazımından sonra okunur: veri/kabuk yazımı tahmini okumadı", w.estimateCalls() === 0);
  });
  await scenario("kabuk/veri yazımı (başarılı)", async () => {
    // Kullanım tahmini YÜKSEK (%90) olsa bile başarılı bir veri/kabuk yazımı ses önbelleğini temizletmez.
    const w = await quotaWorld({ quota: 1e9, estimate: () => ({ usage: 900, quota: 1000 }), fetchImpl: async () => new Response("icerik") });
    await w.preload(1, 20);
    for (const u of ["data/word-meal.json", "js/yeni.js"]) {
      const e = fetchEvent(new Request(SCOPE_URL + u));
      w.listeners.fetch(e.event);
      await (await e.result()).text();
      await e.settled();
    }
    check("başarılı veri ve kabuk yazımları da kullanım tahminini OKUMUYOR ve ses önbelleğini temizletmiyor", w.estimateCalls() === 0 && same(await w.ids(), range(1, 20)));
    check("...yeni veri/kabuk kayıtları yazıldı, eskileri de yerinde", !!(await w.data.match(SCOPE_URL + "data/word-meal.json")) && !!(await w.shell.match(SCOPE_URL + "js/yeni.js")) && (await w.appIntact()));
  });
}

// -- yerel ses (euzu) çevrimdışı: önbellekteki TAM (200) kopya, Range istenirse 206 dilimiyle dönüyor ------------
// Gerçek Chromium'da ölçüldü: tam bir 200'ü Range'li isteğe vermek orada çalıyor, ama WebKit gibi sıkı oynatıcılar
// 206 + Content-Range bekler. Kopya kurulumda (PRECACHE_URLS) Range'siz indirildiği için tam ve 200'dür.
{
  const url = "https://mustafakilic13.github.io/dijital-mushaf/audio/euzuhusari.mp3";
  const FULL = "0123456789ABCDEFGHIJ"; // 20 bayt
  let online = false;
  const { listeners, caches } = loadWorker({
    fetchImpl: async () => {
      if (!online) throw new TypeError("Failed to fetch");
      return new Response("ag-yaniti", { status: 206, headers: { "Content-Range": "bytes 0-8/9" } });
    },
  });
  await (await caches.open(SHELL_CACHE_NAME)).put(url, new Response(FULL, { headers: { "Content-Type": "audio/mpeg" } }));
  const ask = async (range) => {
    try {
      const e = fetchEvent(new Request(url, range ? { headers: { Range: range } } : {}));
      listeners.fetch(e.event);
      const r = await e.result();
      return { status: r.status, cr: r.headers.get("content-range"), cl: r.headers.get("content-length"), ct: r.headers.get("content-type"), ar: r.headers.get("accept-ranges"), body: await r.text() };
    } catch (err) {
      return { status: `HATA: ${err.message}`, cr: null, cl: null, ct: null, ar: null, body: null }; // sw.js isteği REDDETTİ: ilgili kontrol FAIL olsun, dosya çökmesin
    }
  };
  const cases = [
    ["bytes=0-", 206, "bytes 0-19/20", FULL],
    ["bytes=5-9", 206, "bytes 5-9/20", "56789"],
    ["bytes=0-0", 206, "bytes 0-0/20", "0"],
    ["bytes=-4", 206, "bytes 16-19/20", "GHIJ"],
    ["bytes=-99", 206, "bytes 0-19/20", FULL],
    ["bytes=15-", 206, "bytes 15-19/20", "FGHIJ"],
    ["bytes=18-99", 206, "bytes 18-19/20", "IJ"],
    ["bytes=19-19", 206, "bytes 19-19/20", "J"],
  ];
  for (const [range, status, cr, body] of cases) {
    const r = await ask(range);
    check(`çevrimdışı euzu, Range: ${range} -> ${status} ${cr} gövde "${body}"`, r.status === status && r.cr === cr && r.body === body && r.cl === String(body.length));
  }
  const r206 = await ask("bytes=5-9");
  check("206 yanıt Content-Type'ı koruyor (audio/mpeg) ve Accept-Ranges: bytes bildiriyor", r206.ct === "audio/mpeg" && r206.ar === "bytes");
  for (const range of ["bytes=20-", "bytes=99-", "bytes=5-2", "bytes=-0"]) {
    const r = await ask(range);
    check(`çevrimdışı euzu, Range: ${range} -> 416 "bytes */20", gövde yok`, r.status === 416 && r.cr === "bytes */20" && r.body === "");
  }
  for (const range of ["bytes=0-1,5-6", "bytes=abc", "items=0-5", "bytes=-", "bytes=1-2-3"]) {
    const r = await ask(range);
    check(`çevrimdışı euzu, anlaşılmayan/çoklu Range (${range}) yok sayılıyor: tam 200 dönüyor (sunucunun Range'i yok sayması geçerli bir cevaptır)`, r.status === 200 && r.body === FULL && r.cr === null);
  }
  const plain = await ask(null);
  check("çevrimdışı euzu, Range'siz istek -> tam 200, aynen", plain.status === 200 && plain.body === FULL && plain.cr === null && plain.ct === "audio/mpeg");
  const again = await ask("bytes=0-4");
  check("aynı önbellek kaydı art arda dilimlenebiliyor (gövde bir kez okunup tükenmiyor)", again.status === 206 && again.body === "01234");
  // Yalnızca TAM bir 200 kopya dilimlenir: kayıt başka bir durumdaysa (ör. 203) Range ile bile olduğu gibi dönmeli.
  const shellCache = await caches.open(SHELL_CACHE_NAME);
  const oddUrl = url.replace("euzuhusari", "garip-durum");
  await shellCache.put(oddUrl, new Response("abc", { status: 203 }));
  const oddEvent = fetchEvent(new Request(oddUrl, { headers: { Range: "bytes=0-1" } }));
  listeners.fetch(oddEvent.event);
  const oddRes = await oddEvent.result();
  check("önbellekteki kayıt 200 değilse (203) Range ile bile dilimlenmiyor: olduğu gibi dönüyor", oddRes.status === 203 && (await oddRes.text()) === "abc");
  // Kayıtta Content-Type yoksa (ArrayBuffer/Uint8Array gövdeye tarayıcı başlık eklemez) 206 genel bir tür bildiriyor.
  const binUrl = url.replace("euzuhusari", "ikili");
  await shellCache.put(binUrl, new Response(new Uint8Array([1, 2, 3, 4])));
  const binEvent = fetchEvent(new Request(binUrl, { headers: { Range: "bytes=1-2" } }));
  listeners.fetch(binEvent.event);
  const binRes = await binEvent.result();
  check("kayıtta Content-Type yoksa 206 'application/octet-stream' bildiriyor ve doğru baytları döndürüyor", binRes.status === 206 && binRes.headers.get("content-type") === "application/octet-stream" && [...new Uint8Array(await binRes.arrayBuffer())].join() === "2,3");
  online = true;
  const onlineRes = await ask("bytes=0-");
  check("ÇEVRİMİÇİYKEN (ağ-önce): ağ yanıtı (206) olduğu gibi dönüyor; önbellek dilimlemesi devreye girmiyor", onlineRes.status === 206 && onlineRes.cr === "bytes 0-8/9" && onlineRes.body === "ag-yaniti");
  online = false;
  const noEntry = fetchEvent(new Request(url.replace("euzuhusari", "yok-boyle-bir-klip"), { headers: { Range: "bytes=0-" } }));
  listeners.fetch(noEntry.event);
  let threw = false;
  try {
    await noEntry.result();
  } catch {
    threw = true;
  }
  check("çevrimdışı + önbellekte yok + Range -> gerçek hata ileri sürülüyor (boş 206/416 uydurulmuyor)", threw);
}

// -- PRECACHE_URLS: kritik dosyalar listede mi -----------------------------------------------------------
// ("./" = scope kökü, yani manifest start_url'ü: dizin URL'si "index.html"den FARKLI bir önbellek anahtarı.)
for (const f of ["./", "index.html", "js/app.js", "css/style.css", "data/mushaf.json", "data/meal.json", "vendor/hb.wasm", "fonts/DigitalKhattV2.woff2", "audio/euzuhusari.mp3", "audio/euzuabdulsamad.mp3"]) {
  check(`PRECACHE_URLS kritik dosyayı içeriyor: ${f}`, PRECACHE_URLS.includes(f));
}
// Uygulamanın çaldığı HER yerel ses dosyası (RECITERS.*.introLocal) önceden indirilmeli. Çalarken ağ-önce yolu onları
// önbelleğe alamıyor (<audio> Range ister, sunucu 206 döner, Cache.put reddeder): kurulumdaki Range'siz indirme tek yol.
{
  const intros = [...appSource.matchAll(/introLocal:\s*"([^"]+)"/g)].map((m) => m[1]);
  check(`app.js'te RECITERS.*.introLocal bulundu (en az 2; aşağıdaki kontrol boş kümede sessizce geçmesin): ${intros.join(", ")}`, intros.length >= 2);
  const missingIntro = intros.filter((f) => !PRECACHE_URLS.includes(f));
  check(`app.js'teki her introLocal ses dosyası PRECACHE_URLS'te${missingIntro.length ? ` -- EKSİK: ${missingIntro.join(", ")}` : ""}`, missingIntro.length === 0);
}
// Uygulamanın yüklediği HER yerel kabuk dosyası listede mi? Yeni bir JS modülü eklenip buraya yazılmazsa,
// kurulumdan hemen sonra çevrimdışı açılışta `import` başarısız olur ve uygulama hiç açılmaz (ilk ziyarette
// SW sayfayı henüz denetlemediği için modül çalışma-zamanında da önbelleğe girmemiştir). Kritik dosyaları
// elle saymak yerine KAYNAKTAN çıkarıyoruz: index.html'deki betik/stil + app.js'ten erişilen import ağacı.
// Ters yön de önemli: listedeki bir dosya diskte yoksa cache.addAll TÜMÜYLE reddedilir ve install başarısız olur.
{
  const isLocal = (u) => !!u && !/^([a-z][a-z0-9+.-]*:)?\/\//i.test(u) && !u.startsWith("data:");
  const needed = new Set();
  for (const m of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) if (isLocal(m[1])) needed.add(m[1]);
  for (const m of html.matchAll(/<link[^>]*rel="stylesheet"[^>]*\shref="([^"]+)"/g)) if (isLocal(m[1])) needed.add(m[1]);
  const queue = ["js/app.js"];
  const seen = new Set();
  let allJs = "";
  while (queue.length) {
    const f = queue.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    needed.add(f);
    const src = readText(f);
    allJs += `\n${src}`;
    // Statik import / export ... from "./x.js" (çok satırlı olanlar dahil) ve çıplak import "./x.js".
    for (const m of src.matchAll(/^[ \t]*(?:import|export)\b[^;'"]*?\bfrom\s*["'](\.{1,2}\/[^"']+)["']|^[ \t]*import\s*["'](\.{1,2}\/[^"']+)["']/gm)) {
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1] || m[2])));
    }
  }
  check(`import ağacı taraması gerçekten çalıştı (app.js'ten ${seen.size} JS dosyasına ulaşıldı; en az 10 beklenir)`, seen.size >= 10);
  check("kaynakta dinamik import() yok (yukarıdaki ağaç taraması yalnızca statik import'ları görür; ekleyen bunu bilerek taramayı genişletmeli)", !/\bimport\s*\(/.test(allJs));
  const missing = [...needed].filter((f) => !PRECACHE_URLS.includes(f));
  check(`PRECACHE_URLS, index.html'in ve app.js import ağacının yüklediği HER yerel dosyayı içeriyor${missing.length ? ` -- EKSİK: ${missing.join(", ")}` : ""}`, missing.length === 0);
  const dangling = PRECACHE_URLS.filter((u) => u !== "./" && !fs.existsSync(path.join(ROOT, u)));
  check(`PRECACHE_URLS'teki her dosya diskte var (biri bile 404 verirse cache.addAll tümüyle reddedilir, install başarısız olur)${dangling.length ? ` -- YOK: ${dangling.join(", ")}` : ""}`, dangling.length === 0);
}
check("PRECACHE_URLS ikincil/büyük verileri İÇERMİYOR (word-meal/konular/sure-bilgisi/tefsir/ses-zamanlama/sure-başlıkları -- bunlar İLK KULLANILDIĞINDA önbelleğe giriyor)", (() => {
  const secondary = ["data/word-meal.json", "data/topics-tr.json", "data/surah-info-tr.json", "data/tafsir-saadi.json", "data/recitation-husary-mujawwad.json", "data/surah-headers/1.json"];
  return secondary.every((f) => !PRECACHE_URLS.includes(f));
})());

// -- activate: ESKİ SÜRÜM kabuk/veri önbellekleri silinir, GÜNCEL olanlar (AUDIO dahil!) hiç dokunulmaz --------
{
  const { self, caches, listeners } = loadWorker({ fetchImpl: async () => new Response("x") });
  // Önceki bir SW sürümünden kalmış gibi davranıyoruz: eski kabuk/veri + GÜNCEL ses önbelleği + bu
  // uygulamaya AİT OLMAYAN bambaşka bir önbellek (başka bir servis worker'a ait olabilir).
  caches._setBucket("dijital-mushaf-shell-v0", new Map([["eski-dosya.js", new Response("eski")]]));
  caches._setBucket("dijital-mushaf-data-v0", new Map([["eski-veri.json", new Response("eski")]]));
  caches._setBucket(AUDIO_CACHE_NAME, new Map([["https://audio-cdn.tarteel.ai/quran/husaryMujawwad/001001.mp3", new Response("kullanıcının-indirdiği-ses")]]));
  caches._setBucket("baska-bir-uygulamanin-onbellegi", new Map([["x", new Response("x")]]));
  let claimed = false;
  self.clients.claim = async () => {
    claimed = true;
  };
  const act = collectWaitUntil();
  listeners.activate(act);
  await act.all();
  check("activate: clients.claim() çağrıldı", claimed === true);
  check("activate: ESKİ sürüm kabuk/veri önbellekleri silindi", !caches._hasBucket("dijital-mushaf-shell-v0") && !caches._hasBucket("dijital-mushaf-data-v0"));
  check("activate: GÜNCEL ses önbelleği DOKUNULMADI -- kullanıcının indirdiği ses hâlâ orada (dinlenmiş sesler SW güncellemelerinde silinmez; kota tahliyesi ayrı bir kural)", (await (await caches.open(AUDIO_CACHE_NAME)).match("https://audio-cdn.tarteel.ai/quran/husaryMujawwad/001001.mp3")) !== undefined);
  check("activate: bu UYGULAMAYA AİT OLMAYAN başka bir önbelleğe dokunulmadı", caches._hasBucket("baska-bir-uygulamanin-onbellegi"));
}

// -- activate: sure başlıklarının TAMAMI arka planda ısıtılıyor (114'ü de), ama clients.claim'i GECİKTİRMEDEN --
// Bu, kullanıcının bildirdiği gerçek hata için: "çevrimiçiyken görüntülenen
// sure başlıkları hariç diğerleri çevrimdışıyken görünmüyor" -- surah-headers
// PRECACHE_URLS'te değil (9+ MB, ilk kurulumu ağırlaştırmasın diye), bu yüzden
// activate'te arka planda ayrıca ısıtılıyor; bkz. sw.js'teki warmUpSurahHeaders.
{
  const requested = [];
  let claimResolved = false;
  const { listeners, caches } = loadWorker({
    fetchImpl: async (req) => {
      requested.push(req);
      return new Response(`baslik-${req}`);
    },
    clientsClaim: async () => {
      claimResolved = true;
    },
  });
  const act = collectWaitUntil();
  listeners.activate(act);
  await act.all();
  check("activate sonunda (tüm waitUntil'ler bitince) clients.claim de tamamlanmış", claimResolved === true);
  check("114 sure başlığının TAMAMI istendi", SURAH_HEADER_URLS.every((u) => requested.includes(u)) && requested.filter((u) => u.startsWith("data/surah-headers/")).length === 114);
  const cache = await caches.open(DATA_CACHE_NAME);
  const first = await cache.match("data/surah-headers/1.json");
  const last = await cache.match("data/surah-headers/114.json");
  check("hem ilk hem son sure başlığı DATA_CACHE'e yazıldı (örnekleme)", !!first && !!last && (await first.clone().text()) === "baslik-data/surah-headers/1.json");
}
{
  // Bir sure zaten çevrimiçiyken görülüp önbelleğe girmişse (normal fetch
  // handler'dan), ısıtma onu YENİDEN İSTEMEMELİ -- gereksiz ağ kullanmasın.
  const requested = [];
  const { listeners, caches } = loadWorker({ fetchImpl: async (req) => { requested.push(req); return new Response("x"); } });
  const dataCache = await caches.open(DATA_CACHE_NAME);
  await dataCache.put("data/surah-headers/36.json", new Response("onceden-gorulmus-yasin"));
  const act = collectWaitUntil();
  listeners.activate(act);
  await act.all();
  check("önceden önbellekte olan bir sure başlığı yeniden istenmiyor", !requested.includes("data/surah-headers/36.json"));
  check("...ama önbellekteki içeriği KORUNUYOR (üzerine yazılmadı)", (await (await dataCache.match("data/surah-headers/36.json")).clone().text()) === "onceden-gorulmus-yasin");
}
// try/catch: bu senaryo başarısız olursa (ör. sw.js'teki koruma kaldırılırsa
// act.all() REDDEDİLİR) tek başına bir hata olarak işaretlensin, geri kalan
// senaryoları çökertip listenin devamını gizlemesin (bkz. tefsir'in aynı
// desenli hata-dayanıklılığı testi, yukarıda).
try {
  // Isıtma SIRASINDA bir/birkaç sure başlığı ağ hatası verirse diğerleri
  // yine de tamamlanmalı (tek noktanın başarısızlığı kritik değil -- bkz. yorum).
  const { listeners, caches } = loadWorker({
    fetchImpl: async (req) => (req.includes("surah-headers/7.json") ? Promise.reject(new TypeError("ağ hatası")) : new Response("ok")),
  });
  const act = collectWaitUntil();
  listeners.activate(act);
  await act.all(); // çökmemeli
  const cache = await caches.open(DATA_CACHE_NAME);
  const failed = await cache.match("data/surah-headers/7.json");
  const okOne = await cache.match("data/surah-headers/8.json");
  check("bir sure başlığı başarısız olsa bile ısıtma ÇÖKMÜYOR ve diğerleri tamamlanıyor", !failed && !!okOne);
} catch (err) {
  check(`bir sure başlığı başarısız olsa bile ısıtma ÇÖKMÜYOR ve diğerleri tamamlanıyor -- act.all() REDDEDİLDİ: ${err.message}`, false);
}
{
  // Eşzamanlılık makul şekilde sınırlı: hiçbir anda WARM_UP_CONCURRENCY'den
  // (sw.js'te 4) fazla sure başlığı isteği aynı anda uçuşmuyor -- bant
  // genişliğini tek seferde boğmasın.
  let inFlight = 0;
  let maxInFlight = 0;
  const { listeners } = loadWorker({
    fetchImpl: async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 2));
      inFlight--;
      return new Response("x");
    },
  });
  const act = collectWaitUntil();
  listeners.activate(act);
  await act.all();
  check(`eşzamanlılık sınırlı (gözlenen en yüksek anlık istek: ${maxInFlight}, beklenen <= 4)`, maxInFlight > 0 && maxInFlight <= 4);
}

// -- fetch: aynı-kökenli data/*.json -> DATA_CACHE'te önbellek-önce ------------------------------------------
{
  const url = "https://mustafakilic13.github.io/dijital-mushaf/data/word-meal.json";
  const { listeners, calls, caches } = loadWorker({ fetchImpl: async () => new Response("kelime-meali-govdesi") });
  const e1 = fetchEvent(new Request(url));
  listeners.fetch(e1.event);
  check("aynı-kökenli /data/ isteği ele alınıyor", e1.result() !== null);
  await e1.result();
  await e1.settled();
  const e2 = fetchEvent(new Request(url));
  listeners.fetch(e2.event);
  const res2 = await e2.result();
  check("ikinci istek DATA_CACHE'ten geliyor, ağa ikinci kez gidilmiyor", calls.fetch.length === 1 && (await res2.clone().text()) === "kelime-meali-govdesi");
  check("DATA_CACHE kullanılıyor (AUDIO_CACHE değil)", (await (await caches.open(DATA_CACHE_NAME)).match(url)) !== undefined);
}

// -- fetch: uygulama kabuğu -- ÇEVRİMİÇİYKEN her zaman ağdan (otomatik güncelleme), + önbelleğe yazılır -------
{
  const url = "https://mustafakilic13.github.io/dijital-mushaf/js/app.js";
  let version = "v1";
  const { listeners, calls, caches } = loadWorker({ fetchImpl: async () => new Response(`kabuk-icerigi-${version}`) });
  const e1 = fetchEvent(new Request(url));
  listeners.fetch(e1.event);
  const res1 = await e1.result();
  check("ilk istek ağdan geldi, 'v1' içerik", (await res1.clone().text()) === "kabuk-icerigi-v1");
  version = "v2"; // sunucuda yeni bir sürüm yayımlandı
  const e2 = fetchEvent(new Request(url));
  listeners.fetch(e2.event);
  const res2 = await e2.result();
  check("ÇEVRİMİÇİYKEN ikinci istek de ağa gidiyor -- önbellekteki eski sürüme değil, YENİ 'v2'ye dönüyor (otomatik güncelleme)", calls.fetch.length === 2 && (await res2.clone().text()) === "kabuk-icerigi-v2");
  check("yeni yanıt da SHELL_CACHE'e yazıldı (çevrimdışı yedek için)", (await (await caches.open(SHELL_CACHE_NAME)).match(url)).clone !== undefined);
}
{
  // Çevrimdışı: ağ başarısız olursa önbellekteki (daha önce başarıyla alınmış) sürüm dönüyor.
  const url = "https://mustafakilic13.github.io/dijital-mushaf/css/style.css";
  let online = true;
  const { listeners } = loadWorker({ fetchImpl: async () => (online ? new Response("css-icerigi") : Promise.reject(new TypeError("Failed to fetch"))) });
  const e1 = fetchEvent(new Request(url));
  listeners.fetch(e1.event);
  await e1.result();
  online = false;
  const e2 = fetchEvent(new Request(url));
  listeners.fetch(e2.event);
  const res2 = await e2.result();
  check("çevrimdışıyken (ağ hatası) önceden önbelleklenmiş kabuk dosyası yine de dönüyor", (await res2.clone().text()) === "css-icerigi");
}
{
  // Çevrimdışı VE hiç önbellekte yok (daha önce hiç açılmamış bir dosya) -- gerçek bir hata, sessizce yutulmuyor.
  const url = "https://mustafakilic13.github.io/dijital-mushaf/js/hic-acilmamis.js";
  const { listeners } = loadWorker({ fetchImpl: async () => Promise.reject(new TypeError("Failed to fetch")) });
  const e = fetchEvent(new Request(url));
  listeners.fetch(e.event);
  let threw = false;
  try {
    await e.result();
  } catch {
    threw = true;
  }
  check("çevrimdışı + önbellekte yok -> gerçek hata ileri sürülüyor (sessizce boş yanıt değil)", threw);
}

// -- install'dan HEMEN sonra (SW denetiminde hiç çevrimiçi sayfa açılışı olmadan) çevrimdışı --------------------
// Gerçek akış: ilk ziyarette sayfa SW'siz yüklenir (kendi veri istekleri SW'den
// geçmez), SW arkada kurulur; kullanıcı HİÇ yeniden çevrimiçi açmadan ağı
// kaybederse (ör. ana ekrana ekleyip yola çıkmak) PRECACHE_URLS'teki HER ŞEY yine
// de çevrimdışı servis edilebilmeli. Regresyon: eskiden tüm PRECACHE_URLS
// (data/*.json dahil) SHELL_CACHE'e yazılıyor, /data/ istekleri ise yalnızca
// DATA_CACHE'e bakıyordu -> çekirdek veri çevrimdışı hiç dönmüyordu; dizin
// URL'si de ("." -- manifest start_url'ü) "index.html"den FARKLI bir anahtar
// olduğundan önbellekte yoktu.
{
  let online = true;
  const { listeners } = loadWorker({
    fetchImpl: async (req) => {
      if (!online) throw new TypeError("Failed to fetch");
      return new Response("govde:" + absUrl(req));
    },
  });
  let installWaited = null;
  listeners.install({ waitUntil: (p) => (installWaited = p) });
  await installWaited;
  const act = collectWaitUntil();
  listeners.activate(act);
  await act.all();
  online = false; // install+activate bitti; sayfa HİÇ SW denetiminde çevrimiçi açılmadı

  const unavailable = [];
  for (const u of PRECACHE_URLS) {
    const abs = absUrl(u);
    const e = fetchEvent(new Request(abs));
    listeners.fetch(e.event);
    try {
      const res = await e.result();
      if ((await res.clone().text()) !== "govde:" + abs) unavailable.push(`${u} (yanlış gövde)`);
    } catch {
      unavailable.push(u);
    }
  }
  check(`install'dan sonra, hiç çevrimiçi açılış olmadan: PRECACHE_URLS'in HER BİRİ çevrimdışı servis ediliyor${unavailable.length ? ` -- ERİŞİLEMEYEN: ${unavailable.join(", ")}` : ""}`, unavailable.length === 0);

  // Gerçek yol: kurulumda indirilen euzu klibine çevrimdışıyken tarayıcının <audio> isteği ("Range: bytes=0-9") gelir.
  const euzuAbs = absUrl("audio/euzuhusari.mp3");
  const euzuRange = fetchEvent(new Request(euzuAbs, { headers: { Range: "bytes=0-9" } }));
  listeners.fetch(euzuRange.event);
  const euzuRes = await euzuRange.result().catch(() => null);
  check("install'dan sonra çevrimdışı: euzu klibine Range istenince 206 + doğru Content-Range ile dönüyor", !!euzuRes && euzuRes.status === 206 && euzuRes.headers.get("content-range") === `bytes 0-9/${("govde:" + euzuAbs).length}` && (await euzuRes.text()) === ("govde:" + euzuAbs).slice(0, 10));

  // Yukarıdaki döngü PRECACHE_URLS'teki "./"u da kapsıyor; ama adıyla da dursun: manifest start_url'ü bu.
  const start = fetchEvent(new Request(SCOPE_URL));
  listeners.fetch(start.event);
  const startRes = await start.result().catch(() => null);
  check("çevrimdışı + dizin URL'si (manifest start_url '.') -> önbellekten dönüyor (scope kökü 'index.html'den farklı bir anahtar)", !!startRes && (await startRes.clone().text()) === "govde:" + SCOPE_URL);

  // Sayfa gezintisi + tam eşleşme yok (URL'de sorgu dizesi) -> kabuk (index.html) fallback'i.
  // Node'un Request'i mode:"navigate"i kuramadığından (undici reddediyor) istek
  // nesnesi elle kuruluyor; sw.js yalnızca method/url/mode okuyup nesneyi
  // fetch()/cache.match()'e geçiriyor.
  const nav = fetchEvent({ url: SCOPE_URL + "?utm_source=paylasim", method: "GET", mode: "navigate" });
  listeners.fetch(nav.event);
  const navRes = await nav.result().catch(() => null);
  check("çevrimdışı + sayfa gezintisi + tam eşleşme yok (URL'de sorgu dizesi) -> index.html kabuğu dönüyor", !!navRes && (await navRes.clone().text()) === "govde:" + absUrl("index.html"));

  // Fallback yalnızca GEZİNTİ için: başka bir istekte (ör. hiç açılmamış bir .js) gerçek hata ileri sürülmeli.
  const nonNav = fetchEvent(new Request(SCOPE_URL + "js/hic-acilmamis.js"));
  listeners.fetch(nonNav.event);
  let nonNavThrew = false;
  try {
    await nonNav.result();
  } catch {
    nonNavThrew = true;
  }
  check("fallback yalnızca gezinti için: gezinti-dışı + önbellekte yok -> gerçek hata hâlâ ileri sürülüyor (index.html'e sessizce düşmüyor)", nonNavThrew);
}

// -- manifest.json + index.html bağlantıları ----------------------------------------------------------------
{
  const manifest = JSON.parse(readText("manifest.json"));
  check("manifest: name/short_name dolu", !!manifest.name && !!manifest.short_name);
  check("manifest: start_url + scope tanımlı (göreli -- GH Pages alt-yol bağımsız)", manifest.start_url === "." && manifest.scope === ".");
  check("manifest: display standalone", manifest.display === "standalone");
  check("manifest: theme_color/background_color geçerli hex", /^#[0-9a-f]{6}$/i.test(manifest.theme_color) && /^#[0-9a-f]{6}$/i.test(manifest.background_color));
  check("manifest: en az 192x192 ve 512x512 'any' ikon + bir 'maskable' ikon var", manifest.icons.some((i) => i.sizes === "192x192" && i.purpose === "any") && manifest.icons.some((i) => i.sizes === "512x512" && i.purpose === "any") && manifest.icons.some((i) => i.purpose === "maskable"));
  check("manifest'teki TÜM ikon dosyaları gerçekten var", manifest.icons.every((i) => fs.existsSync(path.join(ROOT, i.src))));
}
check("index.html: manifest bağlı", /<link rel="manifest" href="manifest\.json" \/>/.test(html));
check("index.html: theme-color meta'sı manifest'tekiyle aynı", (() => {
  const manifest = JSON.parse(readText("manifest.json"));
  const m = /<meta name="theme-color" content="(#[0-9a-f]{6})" \/>/i.exec(html);
  return !!m && m[1].toLowerCase() === manifest.theme_color.toLowerCase();
})());

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
} else {
  console.log(
    "All checks passed (sw.js: install precache (kabuk -> SHELL_CACHE, çekirdek veri -> DATA_CACHE, './' scope kökü) + skipWaiting, install'dan hemen sonra çevrimdışı açılış (PRECACHE_URLS'in her biri + dizin URL'si + gezinti fallback'i), activate temizliği (AUDIO_CACHE dahil GÜNCEL önbellekler dokunulmaz), ses-CDN+GET filtresi, ses/veri cache-first-forever, kabuk network-first+offline-fallback, opak yanıt, hata dayanıklılığı, hafız ayrımı, kota tahliyesi (ses önbelleğinde en eski kayıt önce: eşik/histerezis/tur sınırı, kota hatası, geçersiz tahmin, eşzamanlılık, hata yalıtımı, kabuk/veri dokunulmazlığı) ve kayıt-sayısı/LRU sınırı yokluğu, CDN host senkronu, ses Range kuralı (yalnızca 'bytes=0-'/Range'siz), yazmayı beklemeden yanıt, 206 yazılmaması, çevrimdışı euzu Range dilimleme, introLocal precache senkronu)."
  );
}
