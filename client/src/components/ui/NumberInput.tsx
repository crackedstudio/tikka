import React from "react";

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  error?: string;
  min?: number;
  max?: number;
  step?: number;
  onIncrement?: () => void;
  onDecrement?: () => void;
  fullWidth?: boolean;
}

const NumberInput: React.FC<NumberInputProps> = ({
  label,
  error,
  min = 0,
  max,
  step = 1,
  onIncrement,
  onDecrement,
  fullWidth = true,
  className = "",
  id,
  value,
  onChange,
  ...props
}) => {
  const inputId = id || `number-input-${Math.random().toString(36).substr(2, 9)}`;

  const handleIncrement = () => {
    if (onIncrement) {
      onIncrement();
    } else if (onChange) {
      const currentValue = typeof value === "number" ? value : parseFloat(value as string) || 0;
      const newValue = max !== undefined ? Math.min(currentValue + step, max) : currentValue + step;
      onChange({ target: { value: newValue.toString() } } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const handleDecrement = () => {
    if (onDecrement) {
      onDecrement();
    } else if (onChange) {
      const currentValue = typeof value === "number" ? value : parseFloat(value as string) || 0;
      const newValue = Math.max(currentValue - step, min);
      onChange({ target: { value: newValue.toString() } } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const canIncrement = max === undefined || (typeof value === "number" ? value < max : parseFloat(value as string) < max);
  const canDecrement = typeof value === "number" ? value > min : parseFloat(value as string) > min;

  return (
    <div className={fullWidth ? "w-full" : ""}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-gray-900 dark:text-white text-sm font-medium mb-2"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={onChange}
          className={`w-full px-4 py-3 pr-12 bg-gray-200 dark:bg-[#2A264A] border ${
            error ? "border-red-500" : "border-gray-600"
          } rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FF389C] focus:border-transparent ${className}`}
          aria-invalid={error ? "true" : "false"}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex flex-col">
          <button
            type="button"
            onClick={handleIncrement}
            disabled={!canIncrement}
            aria-label="Increase value"
            className="text-gray-400 hover:text-gray-900 dark:text-white transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#FF389C] rounded p-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
                clipRule="evenodd"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleDecrement}
            disabled={!canDecrement}
            aria-label="Decrease value"
            className="text-gray-400 hover:text-gray-900 dark:text-white transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#FF389C] rounded p-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
      {error && (
        <p id={`${inputId}-error`} className="mt-1 text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
};

export default NumberInput;
