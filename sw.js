/* ══════════════════════════════════════════════════════════════
   MİNİPAN — Service Worker
   ------------------------------------------------------------
   Görevi: uygulamanın İNTERNET OLMADAN AÇILMASINI sağlamak.

   Sistem zaten offline ÇALIŞIYORDU (sipariş kuyruğu, IndexedDB),
   ama sayfa yeniden yüklenirse internet olmadan AÇILMIYORDU.
   Kafede internet kesildiğinde kasa yeniden başlatılamıyordu.
   Bu dosya o boşluğu kapatır.

   KURULUM: index.html ile AYNI KLASÖRE koyun. Başka işlem gerekmez.
   ══════════════════════════════════════════════════════════════ */

const SURUM   = "minipan-v1";
const ONBELLEK = SURUM + "-kabuk";

/* Uygulama kabuğu — offline açılış için gereken asgari dosyalar */
const KABUK = [
  "./",
  "./index.html"
];

/* ── Kurulum: kabuğu önbelleğe al ── */
self.addEventListener("install", olay=>{
  olay.waitUntil(
    caches.open(ONBELLEK)
      .then(o=>o.addAll(KABUK).catch(()=>{
        /* Bir dosya alınamazsa kurulum tamamen çökmesin */
        return o.add("./index.html").catch(()=>{});
      }))
      .then(()=>self.skipWaiting())    // yeni sürüm hemen devreye girsin
  );
});

/* ── Etkinleşme: eski sürüm önbelleklerini temizle ── */
self.addEventListener("activate", olay=>{
  olay.waitUntil(
    caches.keys()
      .then(adlar=>Promise.all(
        adlar.filter(a=>a.startsWith("minipan-") && a!==ONBELLEK)
             .map(a=>caches.delete(a))
      ))
      .then(()=>self.clients.claim())
  );
});

/* ── İstek yakalama ──
   Strateji: "önce ağ, olmazsa önbellek" (network-first).
   Neden bu strateji?
     • Uygulama sık güncelleniyor → her açılışta en yeni sürüm gelir
     • İnternet yoksa önbellekten açılır → satış durmaz
   Firebase/Storage istekleri ASLA önbelleğe alınmaz: onların kendi
   offline mekanizması var (Firestore persistence) ve bayat veri
   göstermek tehlikeli olurdu. */
self.addEventListener("fetch", olay=>{
  const istek = olay.request;

  /* Yalnızca GET ve kendi kaynağımız */
  if(istek.method !== "GET") return;

  const url = new URL(istek.url);

  /* Dış servisler (Firebase, Storage, CDN) — dokunma */
  if(url.origin !== location.origin) return;

  /* Yazıcı köprüsü (localhost) — dokunma */
  if(url.hostname === "localhost" || url.hostname === "127.0.0.1") return;

  olay.respondWith(
    fetch(istek)
      .then(yanit=>{
        /* Başarılı yanıtı önbelleğe kopyala (sonraki offline açılış için) */
        if(yanit && yanit.status === 200 && yanit.type === "basic"){
          const kopya = yanit.clone();
          caches.open(ONBELLEK).then(o=>o.put(istek, kopya)).catch(()=>{});
        }
        return yanit;
      })
      .catch(()=>{
        /* Ağ yok → önbellekten ver */
        return caches.match(istek).then(bulunan=>{
          if(bulunan) return bulunan;
          /* Sayfa isteğiyse ana dosyayı ver (tek sayfa uygulaması) */
          if(istek.mode === "navigate") return caches.match("./index.html");
          return new Response("Çevrimdışı", {
            status: 503,
            statusText: "Çevrimdışı",
            headers: {"Content-Type":"text/plain; charset=utf-8"}
          });
        });
      })
  );
});

/* Uygulamadan gelen komutlar (örn. anında güncelle) */
self.addEventListener("message", olay=>{
  if(olay.data === "guncelle") self.skipWaiting();
});
