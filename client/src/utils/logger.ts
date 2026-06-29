/**
 * A thin client-side logger utility that wraps console.* methods.
 * It is a no-op in production unless the VITE_DEBUG flag is set.
 */

const isProduction = import.meta.env.PROD;
const isDebug = import.meta.env.VITE_DEBUG === 'true';

const shouldLog = !isProduction || isDebug;

export const logger = {
    log: (...args: any[]) => {
        if (shouldLog) {
            console.log(...args);
        }
    },
    info: (...args: any[]) => {
        if (shouldLog) {
            console.info(...args);
        }
    },
    warn: (...args: any[]) => {
        if (shouldLog) {
            console.warn(...args);
        }
    },
    error: (...args: any[]) => {
        // We typically want errors to log even in production, but per requirements: 
        // "is a no-op in production unless a VITE_DEBUG flag is set"
        if (shouldLog) {
            console.error(...args);
        }
    },
    debug: (...args: any[]) => {
        if (shouldLog) {
            console.debug(...args);
        }
    }
};
