import { buildProofMetadata, redactRequestInput, toStoredRequestInput } from './audit-redaction';

describe('audit-redaction', () => {
  it('redacts secret fields from request input', () => {
    const result = redactRequestInput({
      raffleId: 1,
      requestId: 'r1',
      secret: 'raw-secret',
      nested: { nonce: 'n1', prizeAmount: 10 },
    });

    expect(result.secret).toBe('[REDACTED]');
    expect((result.nested as Record<string, unknown>).nonce).toBe('[REDACTED]');
    expect((result.nested as Record<string, unknown>).prizeAmount).toBe(10);
  });

  it('preserves seed and proof in proof metadata for verification', () => {
    const meta = buildProofMetadata('abcd', 'efgh');
    expect(meta.seed).toBe('abcd');
    expect(meta.proof).toBe('efgh');
    expect(meta.seedDigest).toHaveLength(64);
    expect(meta.proofDigest).toHaveLength(64);
  });

  it('toStoredRequestInput does not leak secrets', () => {
    const stored = toStoredRequestInput(
      redactRequestInput({
        raffleId: 2,
        requestId: 'r2',
        secret: 'x',
      }) as Parameters<typeof toStoredRequestInput>[0],
    );

    expect((stored as unknown as Record<string, unknown>).secret).toBe('[REDACTED]');
  });
});
