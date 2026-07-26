import { DEFAULT_JOB_OPTIONS, NON_RETRYABLE_JOB_OPTIONS, RETRYABLE_JOB_OPTIONS } from './queue-options';

describe('queue-options', () => {
  it('exports DEFAULT_JOB_OPTIONS with conservative retry settings', () => {
    expect(DEFAULT_JOB_OPTIONS.attempts).toBe(5);
    expect(DEFAULT_JOB_OPTIONS.backoff).toEqual({
      type: 'exponential',
      delay: 1000,
    });
    expect(DEFAULT_JOB_OPTIONS.removeOnComplete).toBe(10);
    expect(DEFAULT_JOB_OPTIONS.removeOnFail).toBe(50);
  });

  it('RETRYABLE_JOB_OPTIONS matches DEFAULT_JOB_OPTIONS', () => {
    expect(RETRYABLE_JOB_OPTIONS).toEqual(DEFAULT_JOB_OPTIONS);
  });

  it('NON_RETRYABLE_JOB_OPTIONS attempts is 1 (poison message safe default)', () => {
    expect(NON_RETRYABLE_JOB_OPTIONS.attempts).toBe(1);

    // Ensure we still keep cleanup bounded similarly to defaults.
    expect(NON_RETRYABLE_JOB_OPTIONS.removeOnComplete).toBe(DEFAULT_JOB_OPTIONS.removeOnComplete);
    expect(NON_RETRYABLE_JOB_OPTIONS.removeOnFail).toBe(DEFAULT_JOB_OPTIONS.removeOnFail);
  });
});

