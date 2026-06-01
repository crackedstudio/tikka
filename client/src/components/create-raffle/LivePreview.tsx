import React from "react";
import type { LivePreviewProps } from "../../types/types";
import {
  formatDuration,
  formatPrice,
  formatTickets,
  formatTitle,
  formatDescription,
  getCreatorPlaceholder,
  getCloseTimePlaceholder,
} from "./previewHelpers";

const LivePreview: React.FC<LivePreviewProps> = ({ formData }) => {
  return (
    <div className="bg-white dark:bg-[#1E1932] rounded-xl p-6 h-fit">
      <h3 className="text-gray-900 dark:text-white text-xl font-bold mb-6">Live Preview</h3>

      {/* Raffle Image */}
      <div className="mb-4">
        {formData.images.length > 0 ? (
          <div className="space-y-2">
            <img
              src={URL.createObjectURL(formData.images[0])}
              alt="Raffle prize"
              className="w-full h-48 object-cover rounded-lg border-2 border-yellow-400"
            />
            {formData.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto">
                {formData.images.slice(1, 4).map((img, idx) => (
                  <img
                    key={idx}
                    src={URL.createObjectURL(img)}
                    alt={`Prize ${idx + 2}`}
                    className="w-16 h-16 object-cover rounded border border-gray-500"
                  />
                ))}
                {formData.images.length > 4 && (
                  <div className="w-16 h-16 bg-gray-700 rounded flex items-center justify-center text-white text-xs">
                    +{formData.images.length - 4}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-48 bg-gray-700 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-500">
            <svg
              className="w-12 h-12 text-gray-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                clipRule="evenodd"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Title */}
      <div className="mb-3">
        <h4 className="text-gray-900 dark:text-white text-lg font-semibold min-h-[1.75rem]">
          {formatTitle(formData.title)}
        </h4>
      </div>

      {/* Description */}
      <div className="mb-4">
        <p className="text-gray-900 dark:text-white text-sm mb-2">Description</p>
        <p className="text-gray-700 dark:text-gray-300 text-sm min-h-[1.25rem]">
          {formatDescription(formData.description)}
        </p>
      </div>

      {/* Creator */}
      <div className="mb-4">
        <p className="text-gray-900 dark:text-white text-sm mb-1">Creator</p>
        <p className="text-gray-700 dark:text-gray-300 text-sm min-h-[1.25rem]">
          {getCreatorPlaceholder()}
        </p>
      </div>

      {/* Raffle Details */}
      <div className="space-y-3 mb-6">
        {/* Duration */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg
              className="w-4 h-4 text-gray-900 dark:text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-gray-900 dark:text-white text-sm">Duration</span>
          </div>
          <span className="text-gray-900 dark:text-white text-sm min-h-[1.25rem]">
            {formatDuration(
              formData.duration.days,
              formData.duration.hours
            )}
          </span>
        </div>

        {/* Close Time */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg
              className="w-4 h-4 text-gray-900 dark:text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-gray-900 dark:text-white text-sm">Close Time</span>
          </div>
          <span className="text-gray-900 dark:text-white text-sm min-h-[1.25rem]">
            {getCloseTimePlaceholder()}
          </span>
        </div>

        {/* Tickets */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg
              className="w-4 h-4 text-gray-900 dark:text-white"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-gray-900 dark:text-white text-sm">Tickets</span>
          </div>
          <span className="text-gray-900 dark:text-white text-sm min-h-[1.25rem]">
            {formatTickets(formData.totalTickets)}
          </span>
        </div>
      </div>

      {/* Price */}
      <div className="mb-6">
        <p className="text-gray-700 dark:text-gray-300 text-sm text-center min-h-[1.25rem]">
          {formatPrice(formData.pricePerTicket)}
        </p>
      </div>

      {/* Join Raffle Button */}
      <button className="w-full bg-[#FF389C] hover:bg-[#FF389C]/90 text-gray-900 dark:text-white font-medium py-3 px-4 rounded-lg transition-colors duration-200">
        Join Raffle
      </button>
    </div>
  );
};

export default LivePreview;
