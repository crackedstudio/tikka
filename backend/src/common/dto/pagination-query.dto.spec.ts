import { PaginationQuerySchema, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, validatePaginationLimitsNotOverridden } from './pagination-query.dto';

describe('PaginationQuerySchema', () => {
  it('defaults limit to 20 and offset to 0 when omitted', () => {
    const result = PaginationQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(DEFAULT_PAGE_LIMIT);
      expect(result.data.offset).toBe(0);
    }
  });

  it('accepts valid limit between 1 and 100', () => {
    const result = PaginationQuerySchema.safeParse({ limit: 50, offset: 10 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
      expect(result.data.offset).toBe(10);
    }
  });

  it('accepts limit at max boundary (100)', () => {
    const result = PaginationQuerySchema.safeParse({ limit: MAX_PAGE_LIMIT });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(MAX_PAGE_LIMIT);
    }
  });

  it('rejects limit exceeding 100 (e.g. 100000)', () => {
    const result = PaginationQuerySchema.safeParse({ limit: 100000 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors.some((e) => e.message.includes(`must not exceed ${MAX_PAGE_LIMIT}`))).toBe(true);
    }
  });

  it('rejects limit of 0 or negative', () => {
    const zeroResult = PaginationQuerySchema.safeParse({ limit: 0 });
    expect(zeroResult.success).toBe(false);

    const negResult = PaginationQuerySchema.safeParse({ limit: -5 });
    expect(negResult.success).toBe(false);
  });

  it('coerces string numbers correctly', () => {
    const result = PaginationQuerySchema.safeParse({ limit: '30', offset: '15' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(30);
      expect(result.data.offset).toBe(15);
    }
  });

  it('rejects non-numeric strings', () => {
    const result = PaginationQuerySchema.safeParse({ limit: 'invalid' });
    expect(result.success).toBe(false);
  });
});

describe('validatePaginationLimitsNotOverridden', () => {
  it('accepts valid pagination with limit <= MAX_PAGE_LIMIT', () => {
    const validation = validatePaginationLimitsNotOverridden({ limit: 50, offset: 0 });
    expect(validation.valid).toBe(true);
    expect(validation.error).toBeUndefined();
  });

  it('accepts limit equal to MAX_PAGE_LIMIT', () => {
    const validation = validatePaginationLimitsNotOverridden({ limit: MAX_PAGE_LIMIT, offset: 0 });
    expect(validation.valid).toBe(true);
  });

  it('rejects limit exceeding MAX_PAGE_LIMIT', () => {
    const validation = validatePaginationLimitsNotOverridden({ limit: MAX_PAGE_LIMIT + 1, offset: 0 });
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain(`exceeds MAX_PAGE_LIMIT ${MAX_PAGE_LIMIT}`);
  });

  it('accepts undefined limit (uses default)', () => {
    const validation = validatePaginationLimitsNotOverridden({ offset: 0 });
    expect(validation.valid).toBe(true);
  });
});
