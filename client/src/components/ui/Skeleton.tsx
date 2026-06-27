import React from "react";

interface SkeletonProps {
    /** Extra Tailwind classes e.g. "w-full h-8 rounded-xl" */
    className?: string;
}

/**
 * Generic animated skeleton block.
 * Compose multiple <Skeleton /> elements to build page-level loading states.
 */
const Skeleton: React.FC<SkeletonProps> = ({ className = "" }) => (
    <div className={`animate-pulse bg-gray-200 dark:bg-white/5 rounded-2xl ${className}`} />
);

export default Skeleton;
