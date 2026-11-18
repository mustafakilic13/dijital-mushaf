// wake-lock.js -- uygulama açıkken ekranın kararmasını önleyen Screen Wake Lock (desteklenmiyorsa sessizce devre dışı).

// Uygulama açık/görünür olduğu sürece ekranın kararıp kilitlenmesini
// önler (mushaf okurken ekran sürekli kapanmasın diye). Desteklenmeyen
// tarayıcılarda ya da izin verilmediğinde sessizce devre dışı kalır --
// okuma deneyimini bozacak bir hataya yol açmaz.
let wakeLock = null;
async function requestWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch (err) {
    // pil tasarrufu modu, izin reddi, https olmayan bağlam vb. -- uygulama
    // ekran kilidi olmadan da normal şekilde çalışmaya devam eder.
  }
}
function setupWakeLock() {
  requestWakeLock();
  // Wake Lock, sekme arka plana alındığında (uygulama değiştirme, ekranı
  // kısaca kapatma vb.) tarayıcı tarafından otomatik serbest bırakılır;
  // sekme tekrar görünür olduğunda burada yeniden istenir.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestWakeLock();
  });
}

export { setupWakeLock };
