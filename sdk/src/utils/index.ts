/**
 * SDK Utilities Entry Point
 * * RESPONSIBILITY: Export all formatting, validation, and error handling 
 * utilities for internal and external SDK consumption.
 * * Includes:
 * - High-level and Low-level Error Classes (TikkaSdkError, RpcError)
 * - Input Validation (Public Keys, Raffle IDs, Quantities)
 * - Currency Normalization (XLM to Stroops and vice versa)
 */

// Export all error classes and codes
export * from './errors';

// Export all validation logic (assertValidPublicKey, validateRaffleId, etc.)
export * from './validation';

// Export all formatting logic (xlmToStroops, stroopsToXlm, truncateAddress)
export * from './formatting';

/**
 * Re-export BigNumber for consistency across the SDK when 
 * consumers need to handle normalized amounts.
 */
export { BigNumber } from 'bignumber.js';