import {
  CURSOR_CHECKPOINT_VERSION,
  CursorCheckpoint,
  validateBeforeSave,
  validateLedgerHash,
  validateOnLoad,
} from './cursor-integrity';

// ── Helpers ───────────────────────────────────────────────────────────────────

function valid(overrides: Partial<CursorCheckpoint> = {}): CursorCheckpoint {
  return {
    sequence: 100,
    ledgerHash: 'abc123',
    processedEventCount: 50,
    savedAt: new Date().toISOString(),
    version: CURSOR_CHECKPOINT_VERSION,
    ...overrides,
  };
}

// ── validateOnLoad ─────────────────────────────────────────────────────────────

describe('validateOnLoad', () => {
  it('returns null for a valid checkpoint', () => {
    expect(validateOnLoad(valid())).toBeNull();
  });

  it('returns CORRUPTED_CHECKPOINT for null input', () => {
    expect(validateOnLoad(null)?.code).toBe('CORRUPTED_CHECKPOINT');
  });

  it('returns CORRUPTED_CHECKPOINT for non-object input', () => {
    expect(validateOnLoad('string')?.code).toBe('CORRUPTED_CHECKPOINT');
    expect(validateOnLoad(42)?.code).toBe('CORRUPTED_CHECKPOINT');
  });

  it('returns MISSING_REQUIRED_FIELD for each missing field', () => {
    const fields: Array<keyof CursorCheckpoint> = [
      'sequence', 'ledgerHash', 'processedEventCount', 'savedAt', 'version',
    ];
    for (const field of fields) {
      const cp = valid();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (cp as any)[field];
      const v = validateOnLoad(cp);
      expect(v?.code).toBe('MISSING_REQUIRED_FIELD');
      if (v?.code === 'MISSING_REQUIRED_FIELD') expect(v.field).toBe(field);
    }
  });

  it('returns INVALID_SAVED_AT for a non-date string', () => {
    const v = validateOnLoad(valid({ savedAt: 'not-a-date' }));
    expect(v?.code).toBe('INVALID_SAVED_AT');
  });

  it('returns VERSION_MISMATCH for wrong version', () => {
    const v = validateOnLoad(valid({ version: 99 }));
    expect(v?.code).toBe('VERSION_MISMATCH');
    if (v?.code === 'VERSION_MISMATCH') {
      expect(v.stored).toBe(99);
      expect(v.expected).toBe(CURSOR_CHECKPOINT_VERSION);
    }
  });

  it('returns CORRUPTED_CHECKPOINT for negative processedEventCount', () => {
    expect(validateOnLoad(valid({ processedEventCount: -1 }))?.code).toBe('CORRUPTED_CHECKPOINT');
  });

  it('returns CORRUPTED_CHECKPOINT when sequence is not a number', () => {
    expect(validateOnLoad({ ...valid(), sequence: 'bad' as unknown as number })?.code)
      .toBe('CORRUPTED_CHECKPOINT');
  });
});

// ── validateBeforeSave ────────────────────────────────────────────────────────

describe('validateBeforeSave', () => {
  it('returns null for a valid first save (previous = null)', () => {
    expect(validateBeforeSave(valid(), null)).toBeNull();
  });

  it('returns null for a valid advance', () => {
    const prev = valid({ sequence: 100, processedEventCount: 50 });
    const next = valid({ sequence: 101, processedEventCount: 51 });
    expect(validateBeforeSave(next, prev)).toBeNull();
  });

  it('returns null when processedEventCount stays the same (non-decreasing)', () => {
    const prev = valid({ sequence: 100, processedEventCount: 50 });
    const next = valid({ sequence: 101, processedEventCount: 50 });
    expect(validateBeforeSave(next, prev)).toBeNull();
  });

  it('returns SEQUENCE_REGRESSION when sequence goes backward', () => {
    const prev = valid({ sequence: 200 });
    const next = valid({ sequence: 100 });
    const v = validateBeforeSave(next, prev);
    expect(v?.code).toBe('SEQUENCE_REGRESSION');
    if (v?.code === 'SEQUENCE_REGRESSION') {
      expect(v.current).toBe(100);
      expect(v.previous).toBe(200);
    }
  });

  it('returns SEQUENCE_DUPLICATE when sequence equals previous', () => {
    const prev = valid({ sequence: 100 });
    const next = valid({ sequence: 100 });
    const v = validateBeforeSave(next, prev);
    expect(v?.code).toBe('SEQUENCE_DUPLICATE');
    if (v?.code === 'SEQUENCE_DUPLICATE') expect(v.sequence).toBe(100);
  });

  it('returns EVENT_COUNT_REGRESSION when processedEventCount decreases', () => {
    const prev = valid({ sequence: 100, processedEventCount: 100 });
    const next = valid({ sequence: 101, processedEventCount: 99 });
    const v = validateBeforeSave(next, prev);
    expect(v?.code).toBe('EVENT_COUNT_REGRESSION');
    if (v?.code === 'EVENT_COUNT_REGRESSION') {
      expect(v.current).toBe(99);
      expect(v.previous).toBe(100);
    }
  });

  it('returns INVALID_SAVED_AT for a bad timestamp', () => {
    expect(validateBeforeSave(valid({ savedAt: 'bad' }), null)?.code).toBe('INVALID_SAVED_AT');
  });

  it('returns VERSION_MISMATCH for wrong version', () => {
    expect(validateBeforeSave(valid({ version: 0 }), null)?.code).toBe('VERSION_MISMATCH');
  });

  it('returns MISSING_REQUIRED_FIELD when a field is absent', () => {
    const cp = valid();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (cp as any).ledgerHash;
    expect(validateBeforeSave(cp, null)?.code).toBe('MISSING_REQUIRED_FIELD');
  });
});

// ── validateLedgerHash ────────────────────────────────────────────────────────

describe('validateLedgerHash', () => {
  it('returns null when hashes match', () => {
    expect(validateLedgerHash(valid({ ledgerHash: 'abc' }), 'abc')).toBeNull();
  });

  it('returns HASH_MISMATCH when hashes differ', () => {
    const v = validateLedgerHash(valid({ sequence: 42, ledgerHash: 'stored' }), 'actual');
    expect(v?.code).toBe('HASH_MISMATCH');
    if (v?.code === 'HASH_MISMATCH') {
      expect(v.sequence).toBe(42);
      expect(v.stored).toBe('stored');
      expect(v.actual).toBe('actual');
    }
  });
});
