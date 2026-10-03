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
const readText = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf-8");
const swSource = readText("sw.js");
const html = readText("index.html");
const SHELL_CACHE_NAME = "dijital-mushaf-shell-v1";
const DATA_CACHE_NAME = "dijital-mushaf-data-v1";
const AUDIO_CACHE_NAME = "dijital-mushaf-audio-v1";
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

// -- sınır/LRU YOK -- kaynakta hiç tahliye mantığı bulunmamalı (kullanıcının açık isteği) -----------------
// (satır başındaki "//" yorumları çıkarılıyor: dosyanın kendi açıklayıcı
// yorumu "LRU tahliyesi UYGULANMIYOR" gibi bu kelimeleri zaten içeriyor --
// asıl sorulması gereken KODUN içinde geçiyor mu.)
const swCodeOnly = swSource.replace(/\/\/.*$/gm, "");
check("sw.js KODUNDA (yorumlar hariç) TEK TEK ÖĞE tahliyesi YOK: cache.delete(istek) hiç geçmiyor (caches.delete(adı) -- TÜM bir önbelleği silmek, eski SÜRÜM temizliği için -- ayrı ve meşru, aşağıda ayrıca test ediliyor)", !/\bcache\.delete\(/.test(swCodeOnly));
check("sw.js KODUNDA boyut/LRU sınırı YOK (max_items vb. hiçbiri geçmiyor)", !/max[_-]?items|max[_-]?age|\bLRU\b|\bevict/i.test(swCodeOnly));

// -- sahte ServiceWorkerGlobalScope kurulumu ------------------------------------------------------------
function makeMockCaches(fetchRef) {
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
        // Gerçek Cache.addAll gibi: her url'i (test'in kontrollü fetch'iyle)
        // çeker ve saklar; biri başarısız olursa TÜMÜ reddedilir (gerçek
        // davranışla aynı -- eksik bir dosya "install" başarısız sayılmalı).
        addAll: async (urls) => {
          const pairs = await Promise.all(urls.map(async (u) => [u, await fetchRef(u)]));
          for (const [u, res] of pairs) bucket.set(u, res);
        },
      };
    },
    _bucketSizes: () => Object.fromEntries([...stores].map(([k, v]) => [k, v.size])),
    _hasBucket: (name) => stores.has(name),
    _setBucket: (name, map) => stores.set(name, map), // testte eski-sürüm önbelleği simüle etmek için
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
}

// self: addEventListener çağrılarını yakalayıp test'in elle tetikleyebileceği
// bir kayda ({ install, activate, fetch }) yazan minik bir sahte hedef.
function loadWorker({ fetchImpl, clientsClaim } = {}) {
  const listeners = {};
  const calls = { fetch: [] };
  const fetch = async (req) => {
    calls.fetch.push(typeof req === "string" ? req : req.url);
    return fetchImpl(req);
  };
  const caches = makeMockCaches(fetch);
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
  new Function("self", "caches", "fetch", "console", swSource)(self, caches, fetch, console);
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
  const { self, listeners, caches } = loadWorker({ fetchImpl: async () => new Response("x") });
  check("install/activate dinleyicileri kayıtlı", typeof listeners.install === "function" && typeof listeners.activate === "function");
  let installWaited = null;
  listeners.install({ waitUntil: (p) => (installWaited = p) });
  check("install: self.skipWaiting() çağrılıyor (yeni sürüm hemen devreye girsin)", self._skipWaitingCalled === true);
  await installWaited;
  const shell = await caches.open(SHELL_CACHE_NAME);
  check("install: PRECACHE_URLS'in tamamı SHELL_CACHE'e yazıldı", (await Promise.all(PRECACHE_SAMPLE.map((u) => shell.match(u)))).every(Boolean));
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

// -- PRECACHE_URLS: kritik dosyalar listede mi -----------------------------------------------------------
for (const f of ["index.html", "js/app.js", "css/style.css", "data/mushaf.json", "data/meal.json", "vendor/hb.wasm", "fonts/DigitalKhattV2.woff2"]) {
  check(`PRECACHE_URLS kritik dosyayı içeriyor: ${f}`, PRECACHE_URLS.includes(f));
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
  check("activate: GÜNCEL ses önbelleği DOKUNULMADI -- kullanıcının indirdiği ses hâlâ orada (sınırsız/kalıcı garantisi SW güncellemelerinde de geçerli)", (await (await caches.open(AUDIO_CACHE_NAME)).match("https://audio-cdn.tarteel.ai/quran/husaryMujawwad/001001.mp3")) !== undefined);
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
    "All checks passed (sw.js: install precache + skipWaiting, activate temizliği (AUDIO_CACHE dahil GÜNCEL önbellekler dokunulmaz), ses-CDN+GET filtresi, ses/veri cache-first-forever, kabuk network-first+offline-fallback, opak yanıt, hata dayanıklılığı, hafız ayrımı, sınır/LRU yokluğu, CDN host senkronu)."
  );
}
