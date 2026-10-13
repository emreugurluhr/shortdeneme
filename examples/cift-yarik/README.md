# Örnek: Çift yarık deneyi (hazır sesle üretilmiş video)

Kullanıcının ElevenLabs v4 ile ürettiği seslendirmeden (`script.txt`) yapılmış 67 saniyelik video projesi.

- `align.py`: Ses dosyasındaki duraklamaları (ffmpeg silencedetect) metnin satırlarıyla eşleştirip kelime zamanlarını hece sayısına göre dağıtır → `align.json`.
- `build_project.mjs`: Sahne planını (sabit deney düzeneği, kamera hareketleri, `js/elements/physics.js` öğeleri) ve çizimleri içeren `project.json`'u üretir.
- `render_video.mjs`: Projeyi başsız Chromium'da kare kare çizer (WebCodecs) ve videoyu çıkarır; son adım ffmpeg ile H.264/AAC MP4.

Ses dosyası (`voice.mp3`) depoya eklenmedi.
