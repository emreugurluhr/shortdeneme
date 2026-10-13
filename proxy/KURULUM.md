# Ara sunucu kurulumu (Cloudflare Worker, ücretsiz, ~5 dakika)

Bazı servisler (ör. OpenCode Go) tarayıcıdan doğrudan isteğe izin vermez. O zaman uygulama
"bağlantı kurulamadı" ya da Safari'de "Load failed" hatası verir. Bu küçük ara sunucu istekleri
sizin adınıza iletir. API anahtarlarınız ara sunucuda **saklanmaz**, sadece iletilir.

Telefondan da yapılabilir.

1. **https://dash.cloudflare.com** adresine gidin ve ücretsiz hesap açın (ya da giriş yapın).
2. Menüden **Workers & Pages** (bazı hesaplarda *Compute → Workers*) bölümüne girin.
3. **Create** → **Create Worker** (ya da *Start with Hello World*) seçin.
4. Ad olarak `shorts-proxy` yazın ve **Deploy**'a basın.
5. Açılan sayfada **Edit code**'a basın. Editördeki her şeyi silin ve
   [cloudflare-worker.js](https://raw.githubusercontent.com/emreugurluhr/shortdeneme/claude/selam-hyes7h/proxy/cloudflare-worker.js)
   dosyasının içeriğinin tamamını yapıştırın. **Deploy**'a basın.
6. Worker'ın adresini kopyalayın. Şuna benzer: `https://shorts-proxy.KULLANICI.workers.dev`
7. Shorts Atölyesi'nde **Ayarlar → Bağlantı → Ara sunucu adresi** kutusuna yapıştırıp **Kaydet**'e basın.

Bitti. Artık bütün istekler bu ara sunucu üzerinden gider.

## Notlar

- Ara sunucu sadece `https://emreugurluhr.github.io` sitesinden gelen istekleri kabul eder ve
  sadece şu servislere iletir: OpenCode, OpenAI, Anthropic, Google Gemini, ElevenLabs.
  Başka bir site ya da servis eklemek için dosyanın başındaki `ALLOWED_ORIGINS` / `ALLOWED_HOSTS` listelerini düzenleyin.
- Cloudflare'ın ücretsiz planı günde 100.000 istek veriyor; bir video ~15–25 istek kullanır.
