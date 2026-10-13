# Shorts Atölyesi

Bir konu yazarsınız, uygulama sırayla şunları yapar:

1. **Senaryo:** Seçtiğiniz yapay zekâ (Claude, ChatGPT, OpenCode Go, Gemini ya da OpenAI uyumlu başka bir servis), ElevenLabs v4 ses etiketleriyle (`[dramatic, intriguing]`, `[short pause]` …) yaklaşık 1 dakikalık bir seslendirme metni yazar.
2. **Seslendirme:** ElevenLabs metni seçtiğiniz sesle okur ve her kelimenin söylendiği anı da gönderir.
3. **Sahneler:** Yapay zekâ her sahneyi tasarlar ve görselleri SVG illüstrasyon olarak çizer. Dişliler, radyo dalgaları, sayaçlar, ölçek çubukları gibi animasyonlar konuşmayla eş zamanlı oynar.
4. **Efekt sesleri:** ElevenLabs Sound Effects ile önemli anlara efekt, alta da kısık bir ortam sesi eklenir.
5. **Video:** Kelime kelime vurgulu altyazılarla 1080×1920 (9:16) MP4 dosyası tarayıcıda oluşturulur ve indirilir.

Her şey tarayıcıda çalışır, sunucu gerekmez. API anahtarları sadece sizin tarayıcınızda (localStorage) saklanır; koda ya da depoya hiç yazılmaz.

## Yayınlama (GitHub Pages)

1. GitHub'da **Settings → Pages** sayfasını açın.
2. **Source:** *Deploy from a branch* seçin; **Branch:** bu kodun bulunduğu dal, klasör **/ (root)**.
3. Birkaç dakika sonra uygulama `https://<kullanıcı-adı>.github.io/shortdeneme/` adresinde açılır.

## Gerekli anahtarlar (uygulamada **Ayarlar** penceresine girilir)

| Servis | Ne için | Not |
|---|---|---|
| ElevenLabs | Seslendirme ve efekt sesleri | İzinler: Text to Speech → Access, Sound Effects → Access (isteğe bağlı: Voices → Read) |
| Yapay zekâ (birini seçin) | Senaryo, sahne tasarımı, çizimler | Ayarlar → *Sağlayıcı* |

Yapay zekâ sağlayıcıları:

| Sağlayıcı | API adresi | Varsayılan model |
|---|---|---|
| Claude (Anthropic) | api.anthropic.com | `claude-opus-5-5` |
| ChatGPT (OpenAI) | `https://api.openai.com/v1` | `gpt-5` |
| OpenCode Go | `https://opencode.ai/zen/go/v1` | `deepseek-v4.1-flash` |
| Gemini (Google) | generativelanguage.googleapis.com | `gemini-2.5-pro` |
| Diğer (OpenAI uyumlu) | kendiniz girersiniz | kendiniz girersiniz |

Her sağlayıcının anahtarı ayrı saklanır; aralarında geçiş yapınca tekrar girmeniz gerekmez. **Modelleri getir** düğmesi, sağlayıcının o an sunduğu modelleri listeler. Yeni bir OpenAI uyumlu servis eklemek için `js/llm.js` içindeki `PROVIDERS` listesine bir satır eklemek yeterli.

Varsayılan ses ID'si ve model (`eleven_v4`) ayarlarda hazır gelir, isterseniz değiştirebilirsiniz.

## Kullanım ipuçları

- Hazır metniniz varsa 2. adıma yapıştırıp **Seslendir**'e basın; 1. adımı atlayabilirsiniz.
- Beğenmediğiniz sahne için **Yeniden tasarla** düğmesini kullanın; sadece o sahne yeniden çizilir.
- En iyi sonuç için masaüstü Chrome ya da Edge kullanın. Video, H.264/AAC destekleyen tarayıcılarda MP4 olarak çıkar; desteklemeyenlerde VP9/Opus MP4 ya da WebM olarak çıkabilir.
- Proje (ses dosyaları dahil) tarayıcıda saklanır; sayfayı yenileyince kaldığınız yerden devam edersiniz.

## Dosyalar

- `js/engine.js`: sahne motoru ve altyazılar (önizleme ile video aynı motoru kullanır)
- `js/llm.js`: senaryo, sahne planı ve çizim komutları
- `js/eleven.js`: ElevenLabs bağlantısı
- `js/media.js`: ses karıştırma ve MP4 oluşturma (WebCodecs + [mp4-muxer](https://github.com/Vanilagy/mp4-muxer), MIT)
- `js/demo.js`: açılışta gösterilen örnek proje
- `fonts/`: Nunito ve Barlow Condensed (SIL Open Font License)
