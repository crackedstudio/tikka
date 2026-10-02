/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Sentry DSN for client error reporting. Blank disables the sink. */
  readonly VITE_SENTRY_DSN?: string;
  /** Fraction of error events sent to Sentry (0–1). Default 0.25. */
  readonly VITE_SENTRY_SAMPLE_RATE?: string;
  /** Fraction of transactions traced by Sentry (0–1). Default 0.05. */
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
  /** Optional explicit Sentry environment tag. */
  readonly VITE_SENTRY_ENVIRONMENT?: string;
}
