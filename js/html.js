// html.js -- HTML'e metin gömerken kullanılan kaçış işlevi (TEK kopya).
//
// Önceden dört yerde ayrı ayrı tanımlıydı: app.js, meal.js ve wordmeal.js'te yalnızca & < > kaçıyordu, search.js'te tırnaklar
// da kaçıyordu. Şimdi hepsi bu sıkı sürümü kullanıyor: hem metin hem öznitelik bağlamında güvenli. Bir metin düğümünde ham
// tırnak ile `&quot;` / `&#39;` aynı görünür ve aynı DOM'u verir; fark yalnızca üretilen HTML dizgesinde.
// Başka hiçbir modülü içe aktarmaz.

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
