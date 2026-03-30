/**
 * Shared validation error types for Zod validation pipe.
 * Used by createZodPipe() to return consistent error responses across all endpoints.
 */

import { ZodError } from 'zod';

/**
 * Validation error response shape returned by BadRequestException
 * when Zod schema validation fails.
 */
export interface ValidationErrorResponse {
  /** HTTP status code (always 400 for validation errors) */
  statusCode: 400;

  /** Concatenated error messages separated by semicolons */
  message: string;

  /** Array of detailed validation errors from Zod */
  errors: Array<{
    /** Zod error code (e.g., "invalid_type", "too_small", "invalid_email") */
    code: string;

    /** Path to the field that failed validation (e.g., ["email"] or ["user", "address"]) */
    path: Array<string | number>;

    /** Human-readable error message */
    message: string;

    /** Additional context (e.g., minimum value, expected type) */
    expected?: string;

    /** Received value type or description */
    received?: string;

    /** For number validators: inclusive minimum */
    inclusive?: boolean;

    /** For enum validators: list of valid options */
    options?: string[];
  }>;
}

/**
 * Extract error messages from a ZodError for logging or debugging.
 * @param error - Zod validation error
 * @returns Array of human-readable error strings
 */
export function extractZodErrorMessages(error: ZodError): string[] {
  return error.errors.map((e) => {
    const path = e.path.length > 0 ? `[${e.path.join('.')}] ` : '';
    return `${path}${e.message}`;
  });
}

/**
 * Build a ValidationErrorResponse from a ZodError.
 * Used by the Zod validation pipe.
 *
 * @param error - Zod validation error
 * @returns ValidationErrorResponse
 */
export function buildValidationErrorResponse(
  error: ZodError,
): Omit<ValidationErrorResponse, 'statusCode'> {
  const messages = error.errors.map((e) => e.message);
  return {
    message: messages.join('; '),
    errors: error.errors as any,
  };
}
