import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";
import ErrorBoundary from "./ErrorBoundary";

const BuggyChild = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error("Simulated runtime error in child component!");
  }
  return (
    <div className="p-6 border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-200 rounded-2xl text-center">
      <p className="font-semibold">Normal Component Content</p>
      <p className="text-sm opacity-80">Everything is working as expected.</p>
    </div>
  );
};

const meta: Meta<typeof ErrorBoundary> = {
  title: "UI/ErrorBoundary",
  component: ErrorBoundary,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "React Error Boundary component that catches render crashes, logs to Sentry, and renders customizable fallback UI.",
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof ErrorBoundary>;

export const NormalHealthy: Story = {
  render: () => (
    <ErrorBoundary>
      <BuggyChild shouldThrow={false} />
    </ErrorBoundary>
  ),
};

export const CaughtErrorState: Story = {
  render: () => {
    return (
      <ErrorBoundary
        title="Transaction Processing Failed"
        message="A crash occurred while preparing the smart contract call."
      >
        <BuggyChild shouldThrow={true} />
      </ErrorBoundary>
    );
  },
};

export const InteractiveErrorTrigger: Story = {
  render: () => {
    const [crash, setCrash] = useState(false);

    return (
      <div className="space-y-4">
        <button
          onClick={() => setCrash((prev) => !prev)}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-xl text-sm"
        >
          {crash ? "Reset / Uncrash" : "Trigger Simulation Error"}
        </button>

        <ErrorBoundary
          resetKeys={[crash]}
          onReset={() => setCrash(false)}
        >
          <BuggyChild shouldThrow={crash} />
        </ErrorBoundary>
      </div>
    );
  },
};

export const CustomFallbackRenderer: Story = {
  render: () => (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <div className="p-6 border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 rounded-2xl">
          <h4 className="font-bold text-red-700 dark:text-red-400">Custom Fallback Render</h4>
          <p className="text-xs text-red-600 dark:text-red-300 my-2 font-mono">{error.message}</p>
          <button
            onClick={resetErrorBoundary}
            className="px-4 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold"
          >
            Retry Component
          </button>
        </div>
      )}
    >
      <BuggyChild shouldThrow={true} />
    </ErrorBoundary>
  ),
};
