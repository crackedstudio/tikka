# Oracle Cost Estimation

## Overview

The Cost Estimator service predicts and tracks the monthly operating costs of the Tikka oracle based on expected raffle volume. It helps operators budget for oracle operations and alerts when actual costs significantly exceed estimates.

## Features

- **Monthly Cost Estimation**: Calculate expected costs based on raffle volume
- **VRF vs PRNG Cost Differentiation**: Factor in computational overhead
- **Actual Cost Tracking**: Record and analyze real operating costs
- **Cost Alerts**: Automatic alerts when costs exceed thresholds
- **Cost Per Reveal Metric**: Real-time monitoring metric for dashboards

## Cost Components

### 1. Gas Fees
- **Base Fee**: 100 stroops (Stellar minimum)
- **Priority Fee**: Dynamic based on network congestion (p95 percentile)
- **Fee Caps**: 
  - Low-stakes raffles (< 500 XLM): Capped at 1 XLM
  - High-stakes raffles (≥ 500 XLM): Capped at 10 XLM

### 2. Computational Costs
- **PRNG**: ~0 stroops (instant, no overhead)
- **VRF**: ~50,000 stroops (~0.005 XLM) for Ed25519 VRF computation

### 3. Total Cost Per Reveal
```
Total Cost = Gas Fee + Computational Cost
```

## Usage

### Estimating Monthly Costs

```typescript
import { CostEstimatorService } from './submitter/cost-estimator.service';

// Estimate for 1000 reveals/month, 70% low-stakes
const estimate = await costEstimator.estimateMonthlyCost(1000, 70);

console.log(`Monthly cost: ${estimate.totalMonthlyCostXLM} XLM`);
console.log(`Avg per reveal: ${estimate.avgCostPerReveal / 10_000_000} XLM`);
console.log(`Low-stakes: ${estimate.breakdown.lowStakes.count} reveals`);
console.log(`High-stakes: ${estimate.breakdown.highStakes.count} reveals`);
```

### Tracking Actual Costs

```typescript
// Record each reveal cost
costEstimator.recordRevealCost(
  raffleId,
  'VRF', // or 'PRNG'
  gasFeeStroops,
);

// Get actual metrics for a period
const metrics = costEstimator.getActualCosts(
  startDate,
  endDate,
);

console.log(`Total reveals: ${metrics.totalReveals}`);
console.log(`Total cost: ${metrics.totalCostXLM} XLM`);
console.log(`Avg per reveal: ${metrics.avgCostPerReveal / 10_000_000} XLM`);
```

### Monitoring Cost Per Reveal

```typescript
// Get current cost per reveal (last 100 reveals)
const costPerReveal = costEstimator.getCostPerRevealMetric();

// Export to Prometheus/Grafana
prometheusGauge.set(costPerReveal / 10_000_000);
```

### Cost Alerts

```typescript
// Check if actual costs exceed estimates
const alerts = await costEstimator.checkCostThresholds(
  estimate,
  actualMetrics,
);

alerts.forEach((alert) => {
  if (alert.severity === 'HIGH') {
    // Send to monitoring system
    sendToSlack(alert.message);
  }
});
```

## Alert Types

### 1. COST_EXCEEDED
Triggered when actual average cost per reveal exceeds estimate by >50%.

**Severity**: MEDIUM (>50% over) or HIGH (>200% over)

**Example**:
```
Actual costs exceed estimate by 175.3%
Estimated: 250 stroops, Actual: 688 stroops
```

### 2. HIGH_FEE_DETECTED
Triggered when a single reveal costs more than 0.5 XLM (5M stroops).

**Severity**: MEDIUM

**Example**:
```
High gas fee detected: 0.75 XLM
Threshold: 0.5 XLM
```

### 3. BUDGET_WARNING
Triggered when projected monthly cost will exceed budget by >90%.

**Severity**: MEDIUM (>90%) or HIGH (>120%)

**Example**:
```
Projected to use 135.2% of monthly budget
Estimated: 100 XLM, Projected: 135.2 XLM
```

## Cost Estimation Examples

### Scenario 1: Low Volume (1,000 reveals/month)

**Assumptions**:
- 80% low-stakes (PRNG)
- 20% high-stakes (VRF)
- Average gas fee: 200 stroops (p95)

**Calculation**:
```
Low-stakes: 800 reveals × (200 + 0) = 160,000 stroops
High-stakes: 200 reveals × (300 + 50,000) = 10,060,000 stroops
Total: 10,220,000 stroops = 1.022 XLM/month
```

### Scenario 2: Medium Volume (5,000 reveals/month)

**Assumptions**:
- 70% low-stakes (PRNG)
- 30% high-stakes (VRF)
- Average gas fee: 250 stroops (p95)

**Calculation**:
```
Low-stakes: 3,500 reveals × (250 + 0) = 875,000 stroops
High-stakes: 1,500 reveals × (350 + 50,000) = 75,525,000 stroops
Total: 76,400,000 stroops = 7.64 XLM/month
```

### Scenario 3: High Volume (10,000 reveals/month)

**Assumptions**:
- 60% low-stakes (PRNG)
- 40% high-stakes (VRF)
- Average gas fee: 300 stroops (p95)

**Calculation**:
```
Low-stakes: 6,000 reveals × (300 + 0) = 1,800,000 stroops
High-stakes: 4,000 reveals × (400 + 50,000) = 201,600,000 stroops
Total: 203,400,000 stroops = 20.34 XLM/month
```

## Configuration

Environment variables:

```bash
# Maximum fee cap (default: 10 XLM)
ORACLE_MAX_FEE_STROOPS=100000000

# Low stakes threshold (default: 500 XLM)
LOW_STAKES_THRESHOLD_XLM=500

# Soroban RPC endpoint
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

## Integration with Monitoring

### Prometheus Metrics

```typescript
// Export cost per reveal metric
const costPerReveal = costEstimator.getCostPerRevealMetric();
prometheusRegistry.gauge('oracle_cost_per_reveal_stroops', costPerReveal);

// Export total monthly cost
const metrics = costEstimator.getActualCosts(monthStart, monthEnd);
prometheusRegistry.gauge('oracle_monthly_cost_xlm', metrics.totalCostXLM);
```

### Grafana Dashboard

Recommended panels:
1. **Cost Per Reveal** (gauge) - Current average cost
2. **Monthly Cost Trend** (line chart) - Cost over time
3. **Method Distribution** (pie chart) - PRNG vs VRF usage
4. **Cost Alerts** (table) - Recent alerts
5. **Budget Usage** (gauge) - Percentage of estimated budget used

### Slack Alerts

```typescript
// Send high-severity alerts to Slack
const alerts = await costEstimator.checkCostThresholds(estimate, metrics);

for (const alert of alerts) {
  if (alert.severity === 'HIGH') {
    await slackClient.postMessage({
      channel: '#oracle-alerts',
      text: `🚨 ${alert.type}: ${alert.message}`,
      attachments: [{
        color: 'danger',
        fields: [
          { title: 'Estimated', value: `${alert.details.estimated} stroops`, short: true },
          { title: 'Actual', value: `${alert.details.actual} stroops`, short: true },
        ],
      }],
    });
  }
}
```

## Testing

Run cost estimator tests:

```bash
pnpm test cost-estimator.service.spec.ts
```

Run example:

```bash
npx ts-node src/submitter/cost-estimator.example.ts
```

## Best Practices

### 1. Estimate Before Deploying
Always run cost estimates before deploying to production to understand budget requirements.

### 2. Monitor Continuously
Set up dashboards to track actual costs vs estimates in real-time.

### 3. Set Alert Thresholds
Configure alerts at appropriate levels (e.g., 120% of estimate) to catch cost overruns early.

### 4. Review Monthly
Conduct monthly reviews to adjust estimates based on actual usage patterns.

### 5. Factor in Network Congestion
During high network activity, costs can spike. Budget for 2-3x normal costs as a buffer.

### 6. Optimize Method Selection
Ensure the VRF/PRNG threshold (500 XLM) is appropriate for your use case to minimize VRF overhead.

## Cost Optimization Strategies

### 1. Adjust VRF Threshold
If most raffles are high-value, consider raising the VRF threshold to reduce VRF computational costs.

### 2. Batch Reveals
If possible, batch multiple reveals in a single transaction to amortize gas costs.

### 3. Off-Peak Processing
Process reveals during off-peak hours when network fees are lower.

### 4. Fee Cap Tuning
Adjust fee caps based on actual network conditions to avoid overpaying.

### 5. PRNG Preference
For low-stakes raffles, ensure PRNG is used to avoid unnecessary VRF costs.

## Troubleshooting

### High Costs

**Symptom**: Actual costs significantly exceed estimates

**Possible Causes**:
1. Network congestion causing high gas fees
2. More high-stakes raffles than expected (more VRF usage)
3. Fee caps set too high

**Solutions**:
- Review fee cap configuration
- Analyze raffle distribution (low vs high stakes)
- Check network fee trends
- Consider adjusting VRF threshold

### Cost Alerts Not Triggering

**Symptom**: No alerts despite high costs

**Possible Causes**:
1. Alert thresholds set too high
2. Cost tracking not recording properly
3. Estimate too high (masking actual overruns)

**Solutions**:
- Lower alert threshold percentage
- Verify `recordRevealCost()` is being called
- Re-run estimates with realistic parameters

## References

- [Dynamic Fee Estimation](./DYNAMIC_FEES.md)
- [Oracle Architecture](../docs/ARCHITECTURE.md)
- [Stellar Fee Documentation](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getFeeStats)

## Future Enhancements

1. **Predictive Cost Modeling**: ML model to predict costs based on time-of-day patterns
2. **Multi-Currency Support**: Track costs in USD/EUR for budgeting
3. **Cost Attribution**: Break down costs by raffle creator or category
4. **Automated Budget Adjustments**: Dynamically adjust fee caps based on budget constraints
5. **Historical Cost Analysis**: Long-term trend analysis and forecasting
