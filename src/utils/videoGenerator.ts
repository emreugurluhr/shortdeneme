import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

interface VideoSegment {
  image: string;
  duration: number;
}

interface ProgressCallback {
  (progress: number): void;
}

const loadFFmpeg = async () => {
  if (ffmpeg) return ffmpeg;

  ffmpeg = new FFmpeg();

  try {
    console.log('Loading FFmpeg...');
    // Create a message channel for progress updates
    const channel = new MessageChannel();
    channel.port1.onmessage = (event) => {
      const progress = event.data;
      console.log('FFmpeg loading progress:', Math.round(progress * 100));
    };

    await ffmpeg.load({
      coreURL: await toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript'),
      wasmURL: await toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm'),
      // Use structured clone-safe progress handling
      progress: (p: number) => {
        channel.port2.postMessage(p);
      },
    });
    console.log('FFmpeg loaded successfully');
    return ffmpeg;
  } catch (error) {
    console.error('Error loading FFmpeg:', error);
    ffmpeg = null;
    throw new Error('Failed to load FFmpeg core. Please try again.');
  }
};

const dataURLToBlob = async (dataURL: string): Promise<Blob> => {
  try {
    const response = await fetch(dataURL);
    return await response.blob();
  } catch (error) {
    console.error('Error converting data URL to blob:', error);
    throw error;
  }
};

const updateProgress = (
  onProgress: ProgressCallback | undefined,
  progress: number
) => {
  if (onProgress) {
    const clampedProgress = Math.min(Math.max(progress, 0), 1);
    onProgress(clampedProgress);
    console.log(`Generation progress: ${Math.round(clampedProgress * 100)}%`);
  }
};

export async function generateVideo(
  audioUrl: string,
  images: string[],
  audioDuration: number,
  onProgress?: ProgressCallback
): Promise<string> {
  try {
    updateProgress(onProgress, 0);
    console.log('Starting video generation...');
    const ffmpegInstance = await loadFFmpeg();
    if (!ffmpegInstance) throw new Error('FFmpeg failed to initialize');

    updateProgress(onProgress, 0.1);

    // Calculate duration for each image
    const imageCount = images.length;
    const imageDuration = audioDuration / imageCount;

    console.log(`Processing ${imageCount} images, ${imageDuration}s each`);

    // Create segments with proper timing
    const segments: VideoSegment[] = images.map((image) => ({
      image,
      duration: imageDuration,
    }));

    // Write audio to FFmpeg virtual filesystem
    console.log('Processing audio...');
    const audioFile = await fetchFile(audioUrl);
    await ffmpegInstance.writeFile('audio.mp3', audioFile);
    updateProgress(onProgress, 0.2);

    // Process each image and create input file
    console.log('Processing images...');
    let concat = '';
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const imageBlob = await dataURLToBlob(segment.image);
      await ffmpegInstance.writeFile(
        `image${i}.jpg`,
        await fetchFile(imageBlob)
      );
      concat += `file 'image${i}.jpg'\nduration ${segment.duration}\n`;

      // Update progress for each image processed
      const imageProgress = 0.2 + (0.3 * (i + 1)) / segments.length;
      updateProgress(onProgress, imageProgress);
    }

    // Write the last image entry without duration
    concat += `file 'image${segments.length - 1}.jpg'`;
    await ffmpegInstance.writeFile(
      'concat.txt',
      new TextEncoder().encode(concat)
    );
    updateProgress(onProgress, 0.5);

    console.log('Generating video...');
    // Generate video from images
    await ffmpegInstance.exec([
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      'concat.txt',
      '-i',
      'audio.mp3',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'ultrafast',
      '-movflags',
      '+faststart',
      '-shortest',
      '-y',
      'output.mp4',
    ]);
    updateProgress(onProgress, 0.8);

    console.log('Reading output video...');
    // Read the output video
    const data = await ffmpegInstance.readFile('output.mp4');
    if (!data || data.buffer.byteLength === 0) {
      throw new Error('Generated video is empty');
    }

    console.log('Cleaning up...');
    // Clean up files
    await ffmpegInstance.deleteFile('output.mp4');
    await ffmpegInstance.deleteFile('concat.txt');
    await ffmpegInstance.deleteFile('audio.mp3');
    for (let i = 0; i < segments.length; i++) {
      await ffmpegInstance.deleteFile(`image${i}.jpg`);
    }

    console.log('Creating video URL...');
    // Create video URL
    const videoBlob = new Blob([data.buffer], { type: 'video/mp4' });
    if (videoBlob.size === 0) {
      throw new Error('Video blob is empty');
    }

    updateProgress(onProgress, 1);
    console.log('Video generation complete: 100%');
    return URL.createObjectURL(videoBlob);
  } catch (error) {
    console.error('Error generating video:', error);
    throw error;
  }
}
