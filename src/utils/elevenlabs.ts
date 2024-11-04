interface VoiceSettings {
  stability: number;
  similarity_boost: number;
}

interface TextToSpeechRequest {
  text: string;
  model_id: string;
  voice_settings: VoiceSettings;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateVoice(
  text: string,
  voiceId: string = 'EXAVITQu4vr4xnSDxMaL',
  attempt = 0
): Promise<string> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

  const headers = {
    Accept: 'audio/mpeg',
    'Content-Type': 'application/json',
    'xi-api-key': import.meta.env.VITE_ELEVENLABS_API_KEY,
  };

  const data: TextToSpeechRequest = {
    text: text.trim(),
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.5,
    },
  };

  try {
    if (attempt >= MAX_RETRIES) {
      throw new Error('Max retries reached');
    }

    // Validate input
    if (!text.trim()) {
      throw new Error('Text is required');
    }

    if (!import.meta.env.VITE_ELEVENLABS_API_KEY) {
      throw new Error('ElevenLabs API key is missing');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API error:', errorText);

      if (response.status === 429 || response.status === 503) {
        console.log(
          `Attempt ${
            attempt + 1
          }/${MAX_RETRIES}: Rate limited, retrying after delay...`
        );
        await delay(RETRY_DELAY * (attempt + 1));
        return generateVoice(text, voiceId, attempt + 1);
      }

      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('audio/')) {
      console.warn('Invalid content type received, retrying...');
      await delay(RETRY_DELAY);
      return generateVoice(text, voiceId, attempt + 1);
    }

    const audioBlob = await response.blob();

    if (!audioBlob || audioBlob.size === 0) {
      console.warn('Empty audio blob received, retrying...');
      await delay(RETRY_DELAY);
      return generateVoice(text, voiceId, attempt + 1);
    }

    if (!audioBlob.type.startsWith('audio/')) {
      console.warn('Invalid audio format received, retrying...');
      await delay(RETRY_DELAY);
      return generateVoice(text, voiceId, attempt + 1);
    }

    return URL.createObjectURL(audioBlob);
  } catch (error) {
    console.error('Error generating voice:', error);

    if (attempt < MAX_RETRIES) {
      console.log(`Attempt ${attempt + 1}/${MAX_RETRIES}: Retrying...`);
      await delay(RETRY_DELAY * (attempt + 1));
      return generateVoice(text, voiceId, attempt + 1);
    }

    throw error;
  }
}
