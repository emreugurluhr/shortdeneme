import React from 'react';

interface ImageCarouselProps {
  images: { src: string; alt: string }[];
  selectedStyle: string;
  onStyleSelect: (style: string) => void;
}

const ImageCarousel: React.FC<ImageCarouselProps> = ({
  images,
  selectedStyle,
  onStyleSelect,
}) => {
  return (
    <div className="overflow-x-auto py-4">
      <div className="flex space-x-4 min-w-max">
        {images.map((image, index) => (
          <div
            key={index}
            className={`flex-shrink-0 w-32 h-32 relative rounded-lg overflow-hidden cursor-pointer ${
              selectedStyle === image.alt ? 'ring-2 ring-purple-600' : ''
            }`}
            onClick={() => onStyleSelect(image.alt)}
          >
            <img
              src={image.src}
              alt={image.alt}
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1">
              {image.alt}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ImageCarousel;
