import { blobToBase64 } from './helpers';
import { generateImagePrompt } from './gemini';

interface HuggingFaceError {
  error: string;
  estimated_time?: number;
}

interface StyleConfig {
  prompt: string;
  negativePrompt: string;
}

const API_URL =
  'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-3.5-large';
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 3000;
const MAX_RETRY_DELAY = 15000;
const REQUEST_TIMEOUT = 90000;
const RATE_LIMIT_WINDOW = 60000; // 1 minute in milliseconds
const MAX_REQUESTS_PER_WINDOW = 3;

const STYLE_CONFIGS: Record<string, StyleConfig> = {
  'Action Movie': {
    prompt:
      'ultra-detailed, high contrast, cinematic lighting, shadows, neon red lights, modern action scene, urban environment, misty background, tense atmosphere',
    negativePrompt:
      'low quality, blurry, deformed, cartoon, painting, unrealistic, washed out colors',
  },
  'Ancient Fairytale': {
    prompt:
      'sunset, vibrant clouds, magical atmosphere, epic scale, glowing light beams, misty background, surreal landscape, majestic architecture, cinematic lighting, warm and soft colors',
    negativePrompt:
      'low quality, blurry, deformed, cartoon, painting, sketch, unrealistic, washed out colors',
  },
  'Animated Cartoon': {
    prompt:
      'cartoon style, 2d, colorful and vibrant, magical sparkles, fantasy setting, happy expression, dynamic lighting, simple background',
    negativePrompt:
      'low quality, blurry, deformed, realistic, sketch, low resolution, dull colors',
  },
  'Animated Fantasy': {
    prompt:
      'sunny day, blue sky with fluffy clouds, peaceful atmosphere, cobblestone path, bright and cheerful, fantasy art style, mountain in the background, idyllic landscape, cozy homes',
    negativePrompt:
      'low quality, blurry, deformed, realistic, sketch, dark colors, washed out',
  },
  'Art Deco': {
    prompt:
      'soft golden lighting, art deco style, romantic atmosphere, detailed architecture, intricate chandeliers, polished marble floor, warm and serene, cinematic scene, luxury and grace',
    negativePrompt:
      'low quality, blurry, deformed, cartoon, sketch, washed out, dull colors, overly dramatic lighting',
  },
  'Old Camera': {
    prompt:
      'black and white, vintage street scene, photographer wearing a trench coat and hat, old city, retro camera, noir film style, soft lighting, grainy texture, urban setting, blurred background, 1950s aesthetic, sepia tone, classic atmosphere',
    negativePrompt:
      'low quality, blurry, deformed, cartoon, colorful, modern, vibrant colors, digital look',
  },
};

// Rate limiting queue implementation
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = false;
  private requestTimes: number[] = [];

  async add<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await this.executeWithRateLimit(request);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  private async executeWithRateLimit<T>(request: () => Promise<T>): Promise<T> {
    const now = Date.now();
    this.requestTimes = this.requestTimes.filter(
      (time) => now - time < RATE_LIMIT_WINDOW
    );

    if (this.requestTimes.length >= MAX_REQUESTS_PER_WINDOW) {
      const oldestRequest = this.requestTimes[0];
      const waitTime = RATE_LIMIT_WINDOW - (now - oldestRequest);
      await delay(waitTime);
    }

    this.requestTimes.push(now);
    return request();
  }

  private async processQueue() {
    this.processing = true;
    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (request) {
        await request();
      }
    }
    this.processing = false;
  }
}

const requestQueue = new RequestQueue();

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout = REQUEST_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

export async function generateImage(
  script: string,
  style: string = '',
  attempt = 0
): Promise<string> {
  const generateImageRequest = async () => {
    try {
      if (!script?.trim()) {
        throw new Error('Script is required');
      }

      if (!import.meta.env.VITE_HUGGINGFACE_API_KEY) {
        throw new Error('Hugging Face API key is missing');
      }

      const basePrompt = await generateImagePrompt(script);
      const styleConfig = STYLE_CONFIGS[style];
      const combinedPrompt = styleConfig
        ? `${basePrompt}, ${styleConfig.prompt}`
        : basePrompt;

      const random_seed = Math.floor(Math.random() * 4294967295);
      const retryDelay = Math.min(
        INITIAL_RETRY_DELAY * Math.pow(2, attempt),
        MAX_RETRY_DELAY
      );

      const requestOptions = {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json',
          Accept: 'image/*',
        },
        body: JSON.stringify({
          inputs: `((masterpiece)), ((best quality)), 8k, ultra-detailed, ${combinedPrompt}`,
          parameters: {
            width: 576,
            height: 1024,
            seed: random_seed,
            guidance_scale: 7.5,
            negative_prompt:
              styleConfig?.negativePrompt ||
              'blurry, low quality, distorted, deformed, ugly, bad anatomy',
          },
        }),
      };

      console.log(
        `Attempt ${attempt + 1}: Generating image with style: ${style}`
      );
      const response = await fetchWithTimeout(API_URL, requestOptions);

      if (response.status === 503 || response.status === 504) {
        const waitTime = retryDelay * (attempt + 1);
        console.log(
          `Server temporarily unavailable, waiting ${waitTime}ms before retry...`
        );
        await delay(waitTime);
        return generateImage(script, style, attempt + 1);
      }

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => ({}))) as HuggingFaceError;
        console.error('Hugging Face API error:', errorData);

        if (
          errorData.error?.includes('Max requests total reached') ||
          response.status === 429 ||
          response.status === 500
        ) {
          if (attempt < MAX_RETRIES) {
            const waitTime = errorData.estimated_time
              ? errorData.estimated_time * 1000
              : retryDelay;
            console.log(
              `Rate limit reached, waiting ${waitTime}ms before retry...`
            );
            await delay(waitTime);
            return generateImage(script, style, attempt + 1);
          }
        }

        throw new Error(`API Error: ${errorData.error || response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.startsWith('image/')) {
        throw new Error('Invalid content type received');
      }

      const blob = await response.blob();

      if (!blob || blob.size === 0) {
        throw new Error('Empty response received');
      }

      if (!blob.type.startsWith('image/')) {
        throw new Error('Invalid image format received');
      }

      console.log('Image generated successfully');
      const base64 = await blobToBase64(blob);
      return base64;
    } catch (error) {
      const isNetworkError =
        error instanceof TypeError &&
        (error.message === 'Failed to fetch' ||
          error.message.includes('NetworkError'));
      const errorMessage = isNetworkError
        ? 'Network error occurred'
        : error instanceof Error
        ? error.message
        : 'Unknown error';

      console.error('Image generation error:', {
        message: errorMessage,
        attempt,
        prompt: script,
        style,
      });

      if (
        attempt < MAX_RETRIES &&
        (isNetworkError ||
          (error instanceof Error && error.name === 'AbortError'))
      ) {
        const retryDelay = Math.min(
          INITIAL_RETRY_DELAY * Math.pow(2, attempt),
          MAX_RETRY_DELAY
        );
        console.log(`Network error, retrying in ${retryDelay}ms...`);
        await delay(retryDelay);
        return generateImage(script, style, attempt + 1);
      }

      return 'https://images.unsplash.com/photo-1682687220742-aba13b6e50ba?w=576&h=1024&fit=crop&q=80';
    }
  };

  return requestQueue.add(generateImageRequest);
}
