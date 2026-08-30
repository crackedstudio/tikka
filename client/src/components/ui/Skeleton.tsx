interface SkeletonProps {
    className?: string;
}

const Skeleton = ({ className }: SkeletonProps) => (
    <div
        className={`animate-pulse bg-gray-200 dark:bg-white/5 rounded-2xl ${className}`}
        data-testid="skeleton"
    />
);

export default Skeleton;
