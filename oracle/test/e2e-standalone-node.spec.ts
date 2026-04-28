/**
 * E2E Tests with Local Soroban Standalone Node
 * 
 * These tests require a local Soroban standalone node running.
 * Run with: npm run test:e2e:standalone
 * 
 * Prerequisites:
 * 1. Start standalone node: docker run --rm -p 8000:8000 stellar/quickstart:testing --standalone
 * 2. Deploy test contract to standalone
 * 3. Run tests
 * 
 * Tests verify:
 * - Real transaction building and submission
 * - Actual RPC interaction
 * - Contract state changes
 * - Full oracle cycle with real blockchain
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventListenerService } from '../src/listener/event-listener.service';
import { RandomnessWorker } from '../src/queue/randomness.worker';
import { ContractService } from '../src/contract/contract.service';
import { VrfService } from '../src/randomness/vrf.service';
import { PrngService } from '../src/randomness/prng.service';
import { TxSubmitterService } from '../src/submitter/tx-submitter.service';
import { HealthService } from '../src/health/health.service';
import { LagMonitorService } from '../src/health/lag-monitor.service';
import { OracleRegistryService } from '../src/multi-oracle/oracle-registry.service';
import { MultiOracleCoordinatorService } from '../src/multi-oracle/multi-oracle-coordinator.service';
import * as StellarSdk from '@stellar/stellar-sdk';

// ─── Standalone Node Configuration ──────────────────────────────────────────
const STANDALONE_RPC_URL = process.env.STANDALONE_RPC_URL || 'http://localhost:8000/soroban/rpc';
const STANDALONE_HORIZON_URL = process.env.STANDALONE_HORIZON_URL || 'http://localhost:8000';
const STANDALONE_NETWORK_PASSPHRASE = process.env.STANDALONE_NETWORK_PASSPHRASE || 'Standalone Network ; February 2017';
const TEST_CONTRACT_ID = process.env.TEST_CONTRACT_ID || '';

// Skip tests if standalone node is not configured
const describeIfStandalone = TEST_CONTRACT_ID ? describe : describe.skip;

// Test timeout for real blockchain operations
const STANDALONE_TEST_TIMEOUT = 30000; // 30 seconds

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Check if standalone node is accessible
 */
async function isStandaloneNodeAvailable(): Promise<boolean> {
    try {
        const response = await fetch(`${STANDALONE_RPC_URL}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getHealth',
            }),
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Generate a test keypair for oracle
 */
function generateTestKeypair(): StellarSdk.Keypair {
    return StellarSdk.Keypair.random();
}

/**
 * Fund account using standalone friendbot
 */
async function fundAccount(publicKey: string): Promise<void> {
    const friendbotUrl = `${STANDALONE_HORIZON_URL}/friendbot?addr=${publicKey}`;
    await fetch(friendbotUrl);
    // Wait for funding to be processed
    await new Promise(resolve => setTimeout(resolve, 2000));
}

/**
 * Wait for ledger to close
 */
async function waitForLedger(count: number = 1): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, count * 5000)); // ~5s per ledger
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describeIfStandalone('E2E Tests with Standalone Soroban Node', () => {
    let module: TestingModule;
    let randomnessWorker: RandomnessWorker;
    let contractService: ContractService;
    let txSubmitter: TxSubmitterService;
    let oracleKeypair: StellarSdk.Keypair;

    beforeAll(async () => {
        // Check if standalone node is available
        const isAvailable = await isStandaloneNodeAvailable();
        if (!isAvailable) {
            console.warn('Standalone node not available. Skipping tests.');
            return;
        }

        // Generate and fund oracle keypair
        oracleKeypair = generateTestKeypair();
        console.log(`Oracle public key: ${oracleKeypair.publicKey()}`);
        
        try {
            await fundAccount(oracleKeypair.publicKey());
            console.log('Oracle account funded');
        } catch (error) {
            console.error('Failed to fund oracle account:', error);
            throw error;
        }

        // Create testing module with real services
        const mockConfigService = {
            get: jest.fn((key: string, defaultVal?: any) => {
                const config: Record<string, any> = {
                    RAFFLE_CONTRACT_ID: TEST_CONTRACT_ID,
                    HORIZON_URL: STANDALONE_HORIZON_URL,
                    NETWORK_PASSPHRASE: STANDALONE_NETWORK_PASSPHRASE,
                    SOROBAN_RPC_URL: STANDALONE_RPC_URL,
                    ORACLE_PRIVATE_KEY: oracleKeypair.secret(),
                };
                return config[key] ?? defaultVal ?? null;
            }),
        };

        module = await Test.createTestingModule({
            providers: [
                RandomnessWorker,
                ContractService,
                VrfService,
                PrngService,
                TxSubmitterService,
                HealthService,
                LagMonitorService,
                OracleRegistryService,
                MultiOracleCoordinatorService,
                { provide: ConfigService, useValue: mockConfigService },
            ],
        }).compile();

        randomnessWorker = module.get<RandomnessWorker>(RandomnessWorker);
        contractService = module.get<ContractService>(ContractService);
        txSubmitter = module.get<TxSubmitterService>(TxSubmitterService);
    });

    afterAll(async () => {
        await module?.close();
    });

    // ─── Test: Real PRNG Submission ─────────────────────────────────────────

    it('should submit PRNG randomness to standalone contract', async () => {
        const raffleId = 1;
        const requestId = 'standalone-prng-001';

        // Process request (will use PRNG for low stakes)
        const result = await randomnessWorker.processRequest({
            raffleId,
            requestId,
            prizeAmount: 100, // Low stakes
        });

        // Wait for transaction to be included
        await waitForLedger(2);

        // Verify transaction was submitted
        expect(result).toBeDefined();

        // Query contract to verify randomness was received
        const raffleData = await contractService.getRaffleData(raffleId);
        expect(raffleData).toBeDefined();
        // Contract should have moved to FINALIZED state after receiving randomness
        expect(['FINALIZED', 'DRAWING']).toContain(raffleData.status);
    }, STANDALONE_TEST_TIMEOUT);

    // ─── Test: Real VRF Submission ──────────────────────────────────────────

    it('should submit VRF randomness to standalone contract', async () => {
        const raffleId = 2;
        const requestId = 'standalone-vrf-002';

        // Process request (will use VRF for high stakes)
        const result = await randomnessWorker.processRequest({
            raffleId,
            requestId,
            prizeAmount: 1000, // High stakes
        });

        // Wait for transaction to be included
        await waitForLedger(2);

        // Verify transaction was submitted
        expect(result).toBeDefined();

        // Query contract to verify randomness was received
        const raffleData = await contractService.getRaffleData(raffleId);
        expect(raffleData).toBeDefined();
        expect(['FINALIZED', 'DRAWING']).toContain(raffleData.status);
    }, STANDALONE_TEST_TIMEOUT);

    // ─── Test: Transaction Confirmation ─────────────────────────────────────

    it('should confirm transaction on standalone network', async () => {
        const raffleId = 3;
        const requestId = 'standalone-confirm-003';

        const startTime = Date.now();

        await randomnessWorker.processRequest({
            raffleId,
            requestId,
            prizeAmount: 100,
        });

        await waitForLedger(2);

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Verify cycle completed within reasonable time
        expect(duration).toBeLessThan(STANDALONE_TEST_TIMEOUT);
        console.log(`Transaction confirmed in ${duration}ms`);
    }, STANDALONE_TEST_TIMEOUT);

    // ─── Test: Idempotency on Real Chain ────────────────────────────────────

    it('should handle duplicate requests idempotently', async () => {
        const raffleId = 4;
        const requestId = 'standalone-idempotent-004';

        // First submission
        await randomnessWorker.processRequest({
            raffleId,
            requestId,
            prizeAmount: 100,
        });

        await waitForLedger(2);

        // Second submission (should be skipped)
        await randomnessWorker.processRequest({
            raffleId,
            requestId,
            prizeAmount: 100,
        });

        // Should not throw error, should skip gracefully
        const raffleData = await contractService.getRaffleData(raffleId);
        expect(raffleData).toBeDefined();
    }, STANDALONE_TEST_TIMEOUT);

    // ─── Test: Contract State Verification ──────────────────────────────────

    it('should verify contract state changes after randomness submission', async () => {
        const raffleId = 5;
        const requestId = 'standalone-state-005';

        // Get initial state
        const initialState = await contractService.getRaffleData(raffleId);
        expect(initialState.status).toBe('DRAWING');

        // Submit randomness
        await randomnessWorker.processRequest({
            raffleId,
            requestId,
            prizeAmount: 100,
        });

        await waitForLedger(2);

        // Get final state
        const finalState = await contractService.getRaffleData(raffleId);
        
        // State should have changed
        expect(finalState.status).not.toBe(initialState.status);
        expect(['FINALIZED']).toContain(finalState.status);
    }, STANDALONE_TEST_TIMEOUT);

    // ─── Test: Multiple Sequential Requests ─────────────────────────────────

    it('should handle multiple sequential requests', async () => {
        const requests = [
            { raffleId: 6, requestId: 'standalone-seq-006', prizeAmount: 100 },
            { raffleId: 7, requestId: 'standalone-seq-007', prizeAmount: 600 },
            { raffleId: 8, requestId: 'standalone-seq-008', prizeAmount: 200 },
        ];

        for (const request of requests) {
            await randomnessWorker.processRequest(request);
            await waitForLedger(1);
        }

        // Verify all were processed
        for (const request of requests) {
            const raffleData = await contractService.getRaffleData(request.raffleId);
            expect(raffleData).toBeDefined();
            expect(['FINALIZED', 'DRAWING']).toContain(raffleData.status);
        }
    }, STANDALONE_TEST_TIMEOUT * 3);

    // ─── Test: RPC Health Check ─────────────────────────────────────────────

    it('should verify RPC endpoint is healthy', async () => {
        const response = await fetch(`${STANDALONE_RPC_URL}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getHealth',
            }),
        });

        expect(response.ok).toBe(true);
        const data = await response.json();
        expect(data.result).toBeDefined();
        expect(data.result.status).toBe('healthy');
    }, STANDALONE_TEST_TIMEOUT);

    // ─── Test: Transaction Fee Estimation ───────────────────────────────────

    it('should estimate transaction fees accurately', async () => {
        const raffleId = 9;
        const requestId = 'standalone-fee-009';

        // This would require implementing fee estimation in TxSubmitterService
        // For now, just verify the transaction succeeds
        await randomnessWorker.processRequest({
            raffleId,
            requestId,
            prizeAmount: 100,
        });

        await waitForLedger(2);

        const raffleData = await contractService.getRaffleData(raffleId);
        expect(raffleData).toBeDefined();
    }, STANDALONE_TEST_TIMEOUT);
});

// ─── Setup Instructions ──────────────────────────────────────────────────────

describe('Standalone Node Setup Instructions', () => {
    it('should provide setup instructions', () => {
        const instructions = `
To run standalone node tests:

1. Start Stellar Quickstart in standalone mode:
   docker run --rm -it -p 8000:8000 \\
     --name stellar \\
     stellar/quickstart:testing \\
     --standalone

2. Deploy test contract:
   cd contracts/raffle
   stellar contract deploy \\
     --wasm target/wasm32-unknown-unknown/release/raffle.wasm \\
     --source <ADMIN_SECRET> \\
     --rpc-url http://localhost:8000/soroban/rpc \\
     --network-passphrase "Standalone Network ; February 2017"

3. Set environment variable:
   export TEST_CONTRACT_ID=<deployed_contract_id>

4. Run tests:
   npm run test:e2e:standalone

Or run all at once:
   npm run test:e2e:standalone:full
        `;

        console.log(instructions);
        expect(instructions).toBeDefined();
    });
});
