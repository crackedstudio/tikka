import React from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gradient";
export type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
}

const baseClasses = "font-medium transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-[#0B1220] disabled:opacity-50 disabled:cursor-not-allowed";

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-[#FF389C] hover:bg-[#FF389C]/90 text-gray-900 dark:text-white focus:ring-[#FF389C]",
  secondary: "bg-gray-200 dark:bg-[#2A264A] text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-[#3A365A] focus:ring-[#FF389C]",
  ghost: "bg-transparent text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-[#2A264A] focus:ring-[#FF389C]",
  danger: "bg-red-500 hover:bg-red-600 text-white focus:ring-red-500",
  gradient: "text-gray-900 dark:text-white focus:ring-[#FF389C]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-4 py-2 text-sm rounded-lg",
  md: "px-6 py-3 text-base rounded-lg",
  lg: "px-8 py-4 text-lg rounded-xl",
};

const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  isLoading = false,
  fullWidth = false,
  className = "",
  disabled,
  children,
  ...props
}) => {
  const gradientStyle = variant === "gradient" ? {
    background: "linear-gradient(100.92deg, #A259FF 13.57%, #FF6250 97.65%)",
  } : {};

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      disabled={disabled || isLoading}
      style={gradientStyle}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          Loading...
        </span>
      ) : (
        children
      )}
    </button>
  );
};

export default Button;
