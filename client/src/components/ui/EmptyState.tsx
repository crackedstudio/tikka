import React from "react";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className = "",
}) => {
  return (
    <div className={`text-center py-12 ${className}`} role="status" aria-live="polite">
      {icon && <div className="mx-auto mb-4">{icon}</div>}
      <p className="text-gray-400 mb-2 text-lg font-medium">{title}</p>
      {description && (
        <p className="text-gray-500 text-sm max-w-md mx-auto">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

export default EmptyState;
