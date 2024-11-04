import React, { useState, useRef, useEffect } from 'react';
import { Volume2, Play, Pause, RefreshCw } from 'lucide-react';
import { generateImage } from '../utils/huggingface';
import { splitScriptIntoSegments } from '../utils/helpers';
import { saveToFile, saveBase64Image, saveAudio } from '../utils/fileSystem';

interface PreviewSectionsProps {
  script: string;
  audioUrl: string | null;
  isGenerating: boolean;
  selectedStyle?: string;
}

const PreviewSections: React.FC<PreviewSectionsProps> = ({
  script,
  audioUrl,
  isGenerating,
  selectedStyle = '',
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const calculateImageCount = (durationInSeconds: number) => {
    return Math.ceil(durationInSeconds / 10);
  };

  useEffect(() => {
    const generateImagesFromScript = async () => {
      if (script?.trim() && !isGeneratingImages && duration > 0) {
        setIsGeneratingImages(true);
        setSaveError(null);
        const imageCount = calculateImageCount(duration);

        try {
          // Save script first
          await saveToFile(script, 'script-1.txt');

          // Save audio if available
          if (audioUrl) {
            await saveAudio(audioUrl, 'voice-1.mp3');
          }

          const scriptSegments = splitScriptIntoSegments(script, imageCount);
          const generatedImageUrls: string[] = [];

          // Generate and save images sequentially
          for (let i = 0; i < scriptSegments.length; i++) {
            const segment = scriptSegments[i];
            const imageBase64 = await generateImage(
              segment || script,
              selectedStyle
            );

            if (imageBase64) {
              await saveBase64Image(imageBase64, `image-${i + 1}.png`);
              generatedImageUrls.push(imageBase64);
            }
          }

          setGeneratedImages(generatedImageUrls);
        } catch (error) {
          console.error('Error in content generation:', error);
          setSaveError(
            error instanceof Error
              ? error.message
              : 'An unexpected error occurred'
          );
        } finally {
          setIsGeneratingImages(false);
        }
      }
    };

    generateImagesFromScript();
  }, [script, duration, selectedStyle, audioUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (audioRef.current) {
      const bounds = e.currentTarget.getBoundingClientRect();
      const percent = (e.clientX - bounds.left) / bounds.width;
      const newTime = percent * duration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const imageCount = duration > 0 ? calculateImageCount(duration) : 6;

  return (
    <div className="space-y-6 mt-8">
      {saveError && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700">{saveError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Voice Preview */}
      {audioUrl && (
        <div className="bg-white p-4 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Voice Preview</h3>
          <div className="space-y-4">
            <audio
              ref={audioRef}
              src={audioUrl}
              onTimeUpdate={handleTimeUpdate}
              onEnded={() => setIsPlaying(false)}
              onLoadedMetadata={handleTimeUpdate}
            />

            <div className="flex items-center space-x-4">
              <button
                onClick={handlePlayPause}
                className="p-2 rounded-full hover:bg-gray-100"
              >
                {isPlaying ? (
                  <Pause className="w-6 h-6" />
                ) : (
                  <Play className="w-6 h-6" />
                )}
              </button>

              <div
                className="flex-grow bg-gray-200 h-2 rounded-full cursor-pointer relative"
                onClick={handleProgressClick}
              >
                <div
                  className="absolute bg-purple-600 h-full rounded-full"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Volume2 className="w-5 h-5" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-20"
                />
              </div>

              <span className="text-sm text-gray-600 min-w-[80px]">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">
          Image Preview (
          {duration > 0
            ? `${imageCount} images for ${formatTime(duration)}`
            : 'Loading...'}
          )
          {selectedStyle && (
            <span className="text-sm text-gray-600 ml-2">
              Style: {selectedStyle}
            </span>
          )}
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {Array(imageCount)
            .fill(null)
            .map((_, index) => (
              <div
                key={index}
                className="aspect-[9/16] bg-gray-100 rounded-lg overflow-hidden relative"
              >
                {generatedImages[index] ? (
                  <img
                    src={generatedImages[index]}
                    alt={`Generated preview ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    {isGeneratingImages ? (
                      <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
                    ) : (
                      <span className="text-sm text-gray-400">
                        {!script?.trim()
                          ? 'Enter script to generate'
                          : `Image ${index + 1}`}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* Video Preview (Demo) */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Video Preview</h3>
        <div className="aspect-[9/16] bg-gray-100 rounded-lg overflow-hidden relative">
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm text-gray-400">
              Video generation coming soon...
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PreviewSections;
