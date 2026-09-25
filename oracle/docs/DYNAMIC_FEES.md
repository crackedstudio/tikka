# Dynamic Fee Estimation for Oracle Reveals

## Overview

The oracle implements dynamic fee estimation to ensure randomness reveals execute successfully during network congestion while avoiding excessive costs on low-stakes raffles.

## Problem

During high network congestion on Stellar/Soroban, transactions with insufficient fees may fail or be delayed. Oracle reveals are time-sensitive — if they don't execute promptly, raffles cannot finalize and users experience poor UX.

## Solution

### 1. Network-Based Fee Estimation

The `FeeEstimatorService` fetches real-time fee statistics from Soroban RPC using the `getFeeStats` method:

```typescript
const feeStats = await rpcServer.getFeeStats();
// Returns percentile distribution: p10, p50, p90, p95, p99
```

### 2. High-Priority Percentile

Oracle reveals use the **p95 percentile** fee to ensure execution during congestion:

- **p50 (median)**: Works during normal conditions but may fail during spikes
- **p95**: High enough to beat most congestion without overpaying
- **p99**: Unnecessarily expensive for most scenarios

### 3. Fee Capping by Raffle Stakes

To prevent excessive spending on low-value raffles, fees are capped based on prize value:

| Raffle Prize | Fee Cap | Rationale |
|---|---|---|
| < 500 XLM (low stakes) | 1 XLM (1M stroops) | Reasonable cost for small raffles |
| ≥ 500 XLM (high stakes) | 10 XLM (100M stroops) | Higher budget for valuable raffles |

### 4. Adaptive Retry Logic

If a transaction fails with "insufficient fee", the service:
1. Bumps the fee by 50%
2. Retries up to 5 times
3. Respects the configured cap to avoid runaway costs

## Configuration

Environment variables control fee behavior:

```bash
# Maximum fee cap (default: 100M stroops = 10 XLM)
ORACLE_MAX_FEE_STROOPS=100000000

# Threshold for low vs high stakes (default: 500 XLM)
LOW_STAKES_THRESHOLD_XLM=500

# Soroban RPC endpoint
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

## Implementation Details

### FeeEstimatorService

```typescript
interface FeeEstimate {
  baseFee: number;        // Stellar base fee (100 stroops)
  priorityFee: number;    // p95 from network stats
  totalFee: number;       // Fee to use
  cappedFee: number;      // After applying cap
  isCapped: boolean;      // Whether cap was applied
}
```

### TxSubmitterService Integration

```typescript
// Get dynamic fee estimate
const feeEstimate = await this.feeEstimator.estimateFee(rafflePrizeXLM);

// Build transaction with estimated fee
const tx = await this.buildPreparedTx(
  publicKey,
  raffleId,
  randomness,
  feeEstimate.cappedFee,
);
```

### Caching

Fee stats are cached for 10 seconds to reduce RPC load:
- Multiple reveals within 10s reuse the same stats
- Cache automatically refreshes after TTL
- Fallback to 2x base fee if RPC unavailable

## Monitoring

The service logs fee decisions for observability:

```
[FeeEstimator] Fee stats updated: p50=100, p95=200, max=500
[TxSubmitter] Submitting randomness for raffle 42 with fee 200 stroops (p95: 200, capped: false)
[TxSubmitter] Fee capped at 1000000 stroops (original: 3000000, prize: 100 XLM)
[TxSubmitter] Randomness submitted successfully: tx abc123, ledger 12345, fee 200 stroops
```

## Testing

Run fee estimator tests:

```bash
pnpm test fee-estimator.service.spec.ts
```

Test scenarios:
- Normal network conditions (p95 = 200 stroops)
- High congestion (p95 = 3M stroops)
- Low-stakes raffle capping
- High-stakes raffle full budget
- RPC unavailable fallback
- Cache behavior

## References

- [Stellar Fee Documentation](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getFeeStats)
- [Soroban RPC getFeeStats](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getFeeStats)
- Architecture: `docs/ARCHITECTURE.md` — Oracle section

## Future Enhancements

1. **Dynamic percentile selection**: Use p90 during normal times, p99 during extreme congestion
2. **Fee prediction**: ML model to predict upcoming congestion based on time-of-day patterns
3. **Multi-tier capping**: More granular caps based on prize tiers (e.g., <100 XLM, 100-500 XLM, >500 XLM)
4. **Alert on excessive fees**: Webhook notification if fee exceeds threshold
