import React from 'react';
import { Play, RotateCcw } from 'lucide-react';

interface VideoPreviewProps {
  videoSrc: string;
}

const VideoPreview: React.FC<VideoPreviewProps> = ({ videoSrc }) => {
  return (
    <div className="relative">
      <video className="w-full rounded-lg" poster={videoSrc}>
        <source src={videoSrc} type="video/mp4" />
        Your browser does not support the video tag.
      </video>
      <div className="absolute inset-0 flex items-center justify-center">
        <button className="bg-white bg-opacity-80 rounded-full p-2">
          <Play className="w-8 h-8 text-gray-800" />
        </button>
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between p-2 bg-black bg-opacity-50 text-white">
        <span className="text-sm">Preview</span>
        <div className="flex items-center">
          <RotateCcw className="w-4 h-4 mr-1" />
          <span className="text-sm">00:00</span>
        </div>
      </div>
      <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
        A
      </div>
    </div>
  );
};

export default VideoPreview;
