/** Strip credentials and paths; safe for health JSON responses. */
export function sanitizeHost(rawUrl: string): string {
  try {
    return new URL(rawUrl).host;
  } catch {
    return 'unknown';
  }
}

/** Map probe failures to short operator messages without leaking secrets. */
export function safeProbeDetail(err: unknown, fallback = 'probe failed'): string {
  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes('timeout') || err.name === 'TimeoutError') {
      return 'timeout';
    }
    if (/ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN/i.test(msg)) {
      return 'unreachable';
    }
    return fallback;
  }
  return fallback;
}

export async function runWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          const err = new Error('timeout');
          err.name = 'TimeoutError';
          reject(err);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
