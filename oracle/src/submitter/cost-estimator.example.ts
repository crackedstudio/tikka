/**
 * cost-estimator.example.ts — Demonstrates oracle cost estimation
 *
 * This example shows how to:
 * 1. Estimate monthly operating costs based on expected volume
 * 2. Track actual costs
 * 3. Generate alerts when costs exceed estimates
 * 4. Monitor cost per reveal metrics
 *
 * Usage:
 *   npx ts-node src/submitter/cost-estimator.example.ts
 */

import { ConfigService } from '@nestjs/config';
import { CostEstimatorService } from './cost-estimator.service';
import { FeeEstimatorService } from './fee-estimator.service';

async function main() {
  console.log('🔮 Oracle Cost Estimator Example\n');

  // Initialize services
  const configService = new ConfigService();
  const feeEstimator = new FeeEstimatorService(configService);
  const costEstimator = new CostEstimatorService(configService, feeEstimator);

  // Example 1: Estimate monthly costs for different volumes
  console.log('📊 Example 1: Monthly Cost Estimates\n');

  const scenarios = [
    { reveals: 1000, lowStakesPercent: 80, description: 'Low volume (80% low-stakes)' },
    { reveals: 5000, lowStakesPercent: 70, description: 'Medium volume (70% low-stakes)' },
    { reveals: 10000, lowStakesPercent: 60, description: 'High volume (60% low-stakes)' },
  ];

  for (const scenario of scenarios) {
    const estimate = await costEstimator.estimateMonthlyCost(
      scenario.reveals,
      scenario.lowStakesPercent,
    );

    console.log(`${scenario.description}:`);
    console.log(`  Expected reveals: ${estimate.expectedRevealsPerMonth}/month`);
    console.log(`  Total cost: ${estimate.totalMonthlyCostXLM.toFixed(2)} XLM`);
    console.log(`  Avg per reveal: ${(estimate.avgCostPerReveal / 10_000_000).toFixed(4)} XLM`);
    console.log(`  Low-stakes (PRNG): ${estimate.breakdown.lowStakes.count} reveals`);
    console.log(`  High-stakes (VRF): ${estimate.breakdown.highStakes.count} reveals`);
    console.log();
  }

  // Example 2: Track actual costs
  console.log('📈 Example 2: Tracking Actual Costs\n');

  // Simulate some reveals
  console.log('Simulating 20 reveals...');
  for (let i = 1; i <= 20; i++) {
    const method = i % 3 === 0 ? 'VRF' : 'PRNG'; // 1/3 VRF, 2/3 PRNG
    const gasFee = method === 'VRF' ? 300 + Math.random() * 200 : 200 + Math.random() * 100;
    costEstimator.recordRevealCost(i, method, Math.floor(gasFee));
  }

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const actualMetrics = costEstimator.getActualCosts(oneDayAgo, new Date());

  console.log('Actual costs (last 24 hours):');
  console.log(`  Total reveals: ${actualMetrics.totalReveals}`);
  console.log(`  Total cost: ${actualMetrics.totalCostXLM.toFixed(4)} XLM`);
  console.log(`  Avg per reveal: ${(actualMetrics.avgCostPerReveal / 10_000_000).toFixed(4)} XLM`);
  console.log(`  PRNG reveals: ${actualMetrics.byMethod.prng.count}`);
  console.log(`  VRF reveals: ${actualMetrics.byMethod.vrf.count}`);
  console.log();

  // Example 3: Cost monitoring metric
  console.log('📊 Example 3: Cost Per Reveal Metric\n');

  const costPerReveal = costEstimator.getCostPerRevealMetric();
  console.log(`Current cost per reveal: ${(costPerReveal / 10_000_000).toFixed(4)} XLM`);
  console.log('(This metric is useful for Prometheus/Grafana dashboards)\n');

  // Example 4: Cost alerts
  console.log('🚨 Example 4: Cost Threshold Alerts\n');

  const estimate = await costEstimator.estimateMonthlyCost(1000, 70);

  // Simulate high costs to trigger alerts
  console.log('Simulating high-cost scenario...');
  for (let i = 21; i <= 30; i++) {
    // Record costs 3x higher than estimate
    costEstimator.recordRevealCost(i, 'VRF', estimate.avgCostPerReveal * 3);
  }

  const updatedMetrics = costEstimator.getActualCosts(oneDayAgo, new Date());
  const alerts = await costEstimator.checkCostThresholds(estimate, updatedMetrics);

  if (alerts.length > 0) {
    console.log(`Generated ${alerts.length} alert(s):`);
    alerts.forEach((alert) => {
      console.log(`  [${alert.severity}] ${alert.type}: ${alert.message}`);
      if (alert.details.exceedancePercent) {
        console.log(`    Exceeds estimate by ${alert.details.exceedancePercent.toFixed(1)}%`);
      }
    });
  } else {
    console.log('No alerts generated (costs within acceptable range)');
  }
  console.log();

  // Example 5: Cost breakdown comparison
  console.log('💰 Example 5: Cost Breakdown Analysis\n');

  console.log('Estimated vs Actual:');
  console.log(`  Estimated avg: ${(estimate.avgCostPerReveal / 10_000_000).toFixed(4)} XLM`);
  console.log(`  Actual avg: ${(updatedMetrics.avgCostPerReveal / 10_000_000).toFixed(4)} XLM`);
  
  const variance = ((updatedMetrics.avgCostPerReveal - estimate.avgCostPerReveal) / estimate.avgCostPerReveal) * 100;
  console.log(`  Variance: ${variance > 0 ? '+' : ''}${variance.toFixed(1)}%`);
  console.log();

  console.log('Method breakdown:');
  console.log(`  PRNG: ${updatedMetrics.byMethod.prng.count} reveals, ` +
    `${(updatedMetrics.byMethod.prng.totalCost / 10_000_000).toFixed(4)} XLM`);
  console.log(`  VRF: ${updatedMetrics.byMethod.vrf.count} reveals, ` +
    `${(updatedMetrics.byMethod.vrf.totalCost / 10_000_000).toFixed(4)} XLM`);
  console.log();

  // Example 6: Monthly projection
  console.log('📅 Example 6: Monthly Cost Projection\n');

  const daysInPeriod = 1; // Simulated 1 day of data
  const projectedMonthlyCost = (updatedMetrics.totalCostStroops / daysInPeriod) * 30;
  const projectedMonthlyXLM = projectedMonthlyCost / 10_000_000;

  console.log(`Based on ${daysInPeriod} day(s) of data:`);
  console.log(`  Projected monthly cost: ${projectedMonthlyXLM.toFixed(2)} XLM`);
  console.log(`  Estimated monthly cost: ${estimate.totalMonthlyCostXLM.toFixed(2)} XLM`);
  
  const budgetUsage = (projectedMonthlyCost / estimate.totalMonthlyCostStroops) * 100;
  console.log(`  Budget usage: ${budgetUsage.toFixed(1)}%`);
  
  if (budgetUsage > 100) {
    console.log(`  ⚠️  Warning: Projected to exceed budget by ${(budgetUsage - 100).toFixed(1)}%`);
  } else {
    console.log(`  ✅ Within budget`);
  }
  console.log();

  console.log('✨ Example completed!');
  console.log('\nKey Takeaways:');
  console.log('  • Estimate costs before deploying to production');
  console.log('  • Track actual costs to validate estimates');
  console.log('  • Set up alerts for cost overruns');
  console.log('  • Monitor "Cost per Reveal" metric in dashboards');
  console.log('  • Factor in both gas fees and computational costs (VRF)');
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
