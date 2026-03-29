import React, { useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface ImageCarouselProps {
    images: string[];
    alt?: string;
}

const ImageCarousel: React.FC<ImageCarouselProps> = ({ images, alt = "Prize" }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [lightboxOpen, setLightboxOpen] = useState(false);

    // If only one image, show it without carousel
    if (images.length === 1) {
        return (
            <>
                <div 
                    className="w-full h-64 md:h-96 rounded-3xl overflow-hidden cursor-pointer"
                    onClick={() => {
                        setLightboxOpen(true);
                    }}
                >
                    <img
                        src={images[0]}
                        alt={alt}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    />
                </div>
                {lightboxOpen && (
                    <Lightbox
                        images={images}
                        currentIndex={0}
                        onClose={() => setLightboxOpen(false)}
                        onIndexChange={() => {}}
                    />
                )}
            </>
        );
    }

    const handlePrev = () => {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    };

    const handleNext = () => {
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    };

    return (
        <>
            <div className="w-full">
                {/* Main Image Display */}
                <div className="relative rounded-3xl overflow-hidden mb-4" style={{ height: "384px" }}>
                    <img
                        src={images[currentIndex]}
                        alt={`${alt} ${currentIndex + 1}`}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setLightboxOpen(true)}
                    />
                    
                    {/* Navigation Buttons */}
                    <button
                        onClick={handlePrev}
                        className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
                    >
                        <ChevronLeft size={24} />
                    </button>
                    <button
                        onClick={handleNext}
                        className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full transition-colors"
                    >
                        <ChevronRight size={24} />
                    </button>

                    {/* Image Counter */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                        {currentIndex + 1} / {images.length}
                    </div>

                    {/* Pagination Dots */}
                    <div className="absolute bottom-4 right-4 flex gap-2">
                        {images.map((_, index) => (
                            <button
                                key={index}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentIndex(index);
                                }}
                                className={`w-2 h-2 rounded-full transition-colors ${
                                    index === currentIndex
                                        ? "bg-[#FF389C]"
                                        : "bg-white/50 hover:bg-white/75"
                                }`}
                            />
                        ))}
                    </div>
                </div>

                {/* Thumbnail Navigation */}
                <div className="flex gap-2 overflow-x-auto pb-2">
                    {images.map((image, index) => (
                        <button
                            key={index}
                            onClick={() => setCurrentIndex(index)}
                            className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${
                                index === currentIndex
                                    ? "border-[#FF389C]"
                                    : "border-transparent hover:border-white/50"
                            }`}
                        >
                            <img
                                src={image}
                                alt={`${alt} thumbnail ${index + 1}`}
                                className="w-full h-full object-cover"
                            />
                        </button>
                    ))}
                </div>
            </div>

            {/* Lightbox */}
            {lightboxOpen && (
                <Lightbox
                    images={images}
                    currentIndex={currentIndex}
                    onClose={() => setLightboxOpen(false)}
                    onIndexChange={setCurrentIndex}
                />
            )}
        </>
    );
};

interface LightboxProps {
    images: string[];
    currentIndex: number;
    onClose: () => void;
    onIndexChange: (index: number) => void;
}

const Lightbox: React.FC<LightboxProps> = ({ images, currentIndex, onClose, onIndexChange }) => {
    const handlePrev = () => {
        onIndexChange(currentIndex > 0 ? currentIndex - 1 : images.length - 1);
    };

    const handleNext = () => {
        onIndexChange(currentIndex < images.length - 1 ? currentIndex + 1 : 0);
    };

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowLeft") handlePrev();
            if (e.key === "ArrowRight") handleNext();
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentIndex]);

    return (
        <div
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
            onClick={onClose}
        >
            {/* Close Button */}
            <button
                onClick={onClose}
                className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-50"
            >
                <X size={32} />
            </button>

            {/* Image Counter */}
            <div className="absolute top-4 left-4 text-white text-lg z-50">
                {currentIndex + 1} / {images.length}
            </div>

            {/* Previous Button */}
            {images.length > 1 && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        handlePrev();
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors z-50"
                >
                    <ChevronLeft size={48} />
                </button>
            )}

            {/* Image */}
            <div
                className="max-w-7xl max-h-[90vh] flex items-center justify-center px-20"
                onClick={(e) => e.stopPropagation()}
            >
                <img
                    src={images[currentIndex]}
                    alt={`Full size ${currentIndex + 1}`}
                    className="max-w-full max-h-[90vh] object-contain"
                />
            </div>

            {/* Next Button */}
            {images.length > 1 && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        handleNext();
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors z-50"
                >
                    <ChevronRight size={48} />
                </button>
            )}

            {/* Thumbnail Strip */}
            {images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 max-w-[90vw] overflow-x-auto px-4">
                    {images.map((image, index) => (
                        <button
                            key={index}
                            onClick={(e) => {
                                e.stopPropagation();
                                onIndexChange(index);
                            }}
                            className={`flex-shrink-0 w-16 h-16 rounded overflow-hidden border-2 transition-colors ${
                                index === currentIndex
                                    ? "border-[#FF389C]"
                                    : "border-transparent hover:border-white/50"
                            }`}
                        >
                            <img
                                src={image}
                                alt={`Thumbnail ${index + 1}`}
                                className="w-full h-full object-cover"
                            />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export default ImageCarousel;
