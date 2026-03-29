import React from 'react';

const SkeletonRaffleCard = () => {
  return (
    <div className="w-full max-w-sm rounded-lg border border-gray-200 p-4 shadow-sm">
      <div className="animate-pulse flex flex-col">
        {/* Placeholder for Image */}
        <div className="h-48 w-full rounded-md bg-gray-200 mb-4"></div>
        {/* Placeholder for Title */}
        <div className="h-5 w-3/4 rounded bg-gray-200 mb-2"></div>
        {/* Placeholder for Description */}
        <div className="space-y-3">
          <div className="h-3 w-full rounded bg-gray-200"></div>
          <div className="h-3 w-5/6 rounded bg-gray-200"></div>
        </div>
      </div>
    </div>
  );
};

export default SkeletonRaffleCard;
