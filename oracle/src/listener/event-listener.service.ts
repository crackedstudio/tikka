import { OracleLoggerService } from '../logger/oracle-logger';
import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OracleLogFields } from '../logger/oracle-logger';
import * as StellarSdk from '@stellar/stellar-sdk';
import { RandomnessWorker } from '../queue/randomness.worker';
import { CommitRevealWorker } from '../queue/commit-reveal.worker';
import { HealthService } from '../health/health.service';
import { LagMonitorService } from '../health/lag-monitor.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { RANDOMNESS_QUEUE, RandomnessJobPayload } from '../queue/randomness.queue';
import { JobPriority } from '../queue/queue.types';
type PriorityClassifierService = any;

@Injectable()
export class EventListenerService implements OnModuleInit, OnModuleDestroy {
    
    private horizonServer: StellarSdk.Horizon.Server;
    private readonly raffleContractId: string;
    private readonly networkPassphrase: string;

    private closeStream: (() => void) | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private retryCount = 0;
    
    // Configurable retry delays
    private readonly INITIAL_RETRY_DELAY: number;
    private readonly MAX_RETRY_DELAY: number;

    // Bull queue depth (approximate)
    private currentQueueDepth = 0;

    constructor(
    private readonly logger: OracleLoggerService,
        private readonly configService: ConfigService,
        private readonly healthService: HealthService,
        private readonly lagMonitor: LagMonitorService,
        private readonly randomnessWorker: RandomnessWorker,
        private readonly commitRevealWorker: CommitRevealWorker,
        @Optional() private readonly circuitBreaker?: CircuitBreakerService,
        @Optional() @InjectQueue(RANDOMNESS_QUEUE) private readonly randomnessQueue?: Queue<RandomnessJobPayload>,
        @Optional() private readonly priorityClassifier?: PriorityClassifierService,
        @Optional() private readonly drawRequestLedger?: DrawRequestLedgerService,
    ) {
        // Config parsing
        const horizonUrl = this.configService.get<string>('HORIZON_URL', 'https://horizon-testnet.stellar.org');
        this.networkPassphrase = this.configService.get<string>('NETWORK_PASSPHRASE', StellarSdk.Networks.TESTNET);
        this.raffleContractId = this.configService.get<string>('RAFFLE_CONTRACT_ID', '');
        
        this.INITIAL_RETRY_DELAY = this.configService.get<number>('EVENT_LISTENER_INITIAL_RETRY_DELAY', 1000);
        this.MAX_RETRY_DELAY = this.configService.get<number>('EVENT_LISTENER_MAX_RETRY_DELAY', 60000);

        if (!this.raffleContractId) {
            this.logger.warn('RAFFLE_CONTRACT_ID is not set. Event listener will not start.');
        }

        this.horizonServer = new StellarSdk.Horizon.Server(horizonUrl);
    }

    onModuleInit() {
        if (!this.raffleContractId) {
            this.logger.error('Cannot start EventListenerService: RAFFLE_CONTRACT_ID missing.');
            return;
        }

        this.logger.log(`Initializing EventListenerService for contract: ${this.raffleContractId}`);
        this.startListening();
    }

    onModuleDestroy() {
        this.stopListening();
    }

    private stopListening() {
        if (this.closeStream) {
            this.logger.log('Closing Horizon SSE stream');
            this.closeStream();
            this.closeStream = null;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
    }

    private startListening() {
        if (!this.raffleContractId) return;

        // Task 4.2: Gate with circuit breaker before any Horizon SSE API call
        if (this.circuitBreaker && !this.circuitBreaker.canAttempt()) {
            this.healthService.updateStreamStatus('disconnected');
            const cooldown = this.circuitBreaker.getRemainingCooldownMs() || this.INITIAL_RETRY_DELAY;
            this.logger.debug(`Circuit breaker open. Scheduling retry in ${cooldown}ms.`);
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
            }
            this.reconnectTimeout = setTimeout(() => {
                this.startListening();
            }, cooldown);
            return;
        }

        this.logger.log('Starting Horizon event stream with server-side filtering...');
        this.retryCount = 0;

        try {
            // Using forContract() to filter events at the Horizon level
            // Note: Horizon events endpoint might not be in the current types, using 'as any'
            this.closeStream = (this.horizonServer as any).events()
                .forContract(this.raffleContractId)
                .cursor('now')
                .stream({
                    onmessage: (event: any) => void this.handleEvent(event),
                    onerror: (err: any) => this.handleStreamError(err),
                });
            
            // Task 4.3: Record success after stream is opened
            this.circuitBreaker?.recordSuccess();
            this.logger.log('Successfully connected to Horizon event stream.');
        } catch (err: any) {
            this.logger.error(`Failed to start SSE stream: ${err.message}`, err.stack);
            // Task 4.4: Record failure in catch block
            this.circuitBreaker?.recordFailure();
            this.scheduleReconnect();
        }
    }

    private async handleEvent(eventResponse: any) {
        // Double check contract ID just in case, though Horizon should filter it
        if (eventResponse.contractId !== this.raffleContractId) {
            return;
        }

        try {
            // Update lag monitor with current ledger
            if (eventResponse.ledger) {
                this.lagMonitor.updateCurrentLedger(eventResponse.ledger);
            }

            const topics = (eventResponse.topic || []).map((t: string) => StellarSdk.xdr.ScVal.fromXDR(t, 'base64'));

            if (topics.length === 0) return;

            const primaryTopic = topics[0];
            if (primaryTopic.switch() !== StellarSdk.xdr.ScValType.scvSymbol()) return;

            const eventName = primaryTopic.sym().toString();
        this.logger.debug(`Received event: ${eventName} for raffle ${this.raffleContractId}`);

            switch (eventName) {
                case 'RaffleCreated':
                    this.handleRaffleCreated(this.decodeContractEvent(eventResponse));
                    break;
                case 'DrawTriggered':
                    this.handleDrawTriggered(this.decodeContractEvent(eventResponse));
                    break;
                case 'RandomnessRequested':
                    await this.handleRandomnessRequested(this.decodeContractEvent(eventResponse), eventResponse);
                    break;
                default:
                    this.logger.debug(`Unhandled event type: ${eventName}`);
            }

        } catch (e: any) {
            this.logger.error(`Error processing event: ${e.message}`, { event: eventResponse });
        }
    }

    private decodeContractEvent(eventResponse: any): StellarSdk.xdr.ContractEvent {
        return StellarSdk.xdr.ContractEvent.fromXDR(eventResponse.value, 'base64');
    }

    private handleRaffleCreated(eventXdr: StellarSdk.xdr.ContractEvent) {
        const payload = this.parseEventData(eventXdr);
        
        // Version routing for safe failure path
        const version = payload['version'];
        if (version !== undefined && version > 1) {
            this.logger.error(`[RaffleCreated] Unknown event version: ${version}. Safe failure path triggered. Ignoring event.`);
            return;
        }

        const raffleId = payload['raffle_id'];
        const endTime = payload['end_time'];

        if (raffleId !== undefined) {
            const fields: OracleLogFields = { raffle_id: raffleId };
            this.logger.log(`[RaffleCreated] scheduling commit`, JSON.stringify(fields));
            this.commitRevealWorker.processCommit({ 
                raffleId, 
                endTime: endTime ? Number(endTime) : 0 
            }).catch(err => {
                const errFields: OracleLogFields = { raffle_id: raffleId, outcome: 'failure' };
                this.logger.error(`Commit processing failed for raffle ${raffleId}: ${err.message}`, JSON.stringify(errFields));
            });
        }
    }

    private handleDrawTriggered(eventXdr: StellarSdk.xdr.ContractEvent) {
        const payload = this.parseEventData(eventXdr);

        // Version routing for safe failure path
        const version = payload['version'];
        if (version !== undefined && version > 1) {
            this.logger.error(`[DrawTriggered] Unknown event version: ${version}. Safe failure path triggered. Ignoring event.`);
            return;
        }

        const raffleId = payload['raffle_id'];
        const requestId = payload['request_id'];

        if (raffleId !== undefined && requestId !== undefined) {
            const fields: OracleLogFields = { raffle_id: raffleId, request_id: String(requestId) };
            this.logger.log(`[DrawTriggered] scheduling reveal`, JSON.stringify(fields));
            this.commitRevealWorker.processReveal({ 
                raffleId, 
                requestId: String(requestId) 
            }).catch(err => {
                const errFields: OracleLogFields = { raffle_id: raffleId, request_id: String(requestId), outcome: 'failure' };
                this.logger.error(`Reveal processing failed for raffle ${raffleId}: ${err.message}`, JSON.stringify(errFields));
            });
        }
    }

    private async handleRandomnessRequested(eventXdr: StellarSdk.xdr.ContractEvent, eventResponse: any) {
        const payload = this.parseEventData(eventXdr);

        // Version routing for safe failure path
        const version = payload['version'];
        if (version !== undefined && version > 1) {
            this.logger.error(`[RandomnessRequested] Unknown event version: ${version}. Safe failure path triggered. Ignoring event.`);
            return;
        }

        const raffleId = payload['raffle_id'];
        const requestId = payload['request_id'];
        const prizeAmount = payload['prize_amount'];
        const priorityFlag = payload['priority'];

        if (raffleId !== undefined && requestId !== undefined) {
            const reqIdStr = String(requestId);
            const prizeAmountNum = prizeAmount ? Number(prizeAmount) / 10_000_000 : undefined; // Convert stroops to XLM
            const priority = this.determinePriority(prizeAmountNum, priorityFlag);
            const identity = this.buildDrawRequestIdentity(eventResponse, Number(raffleId), reqIdStr);
            const replayOverride = this.isReplayOverride(eventResponse);

            if (this.drawRequestLedger) {
                let claimResult: 'claimed' | 'duplicate' | 'replayed';
                try {
                    claimResult = await this.drawRequestLedger.claim(identity, replayOverride);
                } catch (err: any) {
                    this.logger.error(
                        `Failed idempotency check for draw request ${identity.stableRequestId}: ${err.message}`,
                    );
                    return;
                }

                if (claimResult === 'duplicate') {
                    this.logger.warn(
                        `[RandomnessRequested] duplicate request skipped: ${identity.stableRequestId}`,
                    );
                    return;
                }
            }
            
            this.logger.log(
                `[RandomnessRequested] raffle=${raffleId}, request=${reqIdStr}, stable=${identity.stableRequestId}, prize=${prizeAmountNum} XLM, priority=${priority}`
            );
            
            // Track in lag monitor for health alerting
            this.lagMonitor.trackRequest(reqIdStr, raffleId, identity.ledger);

            const jobPayload: RandomnessJobPayload = {
                raffleId,
                requestId: reqIdStr,
                stableRequestId: identity.stableRequestId,
                replayOverride,
                prizeAmount: prizeAmountNum,
                priority,
            };

            if (this.randomnessQueue) {
                this.randomnessQueue.add(
                    jobPayload,
                    {
                        priority,
                    }
                ).then(() => {
                    this.currentQueueDepth++;
                    this.healthService.updateQueueDepth(this.currentQueueDepth);
                }).catch(err => {
                    const errFields: OracleLogFields = { raffle_id: raffleId, request_id: reqIdStr, outcome: 'failure' };
                    this.logger.error(`Failed to enqueue randomness job for raffle ${raffleId}: ${err.message}`, JSON.stringify(errFields));
                });
            } else {
                // Fallback for environments without Redis
                this.randomnessWorker.processRequest(jobPayload).catch(err => {
                    this.logger.error(`Direct request processing failed for raffle ${raffleId}: ${err.message}`);
                });
            }
        } else {
            this.logger.warn(`Could not parse RandomnessRequested payload: ${JSON.stringify(payload)}`);
        }
    }

    private determinePriority(prizeAmount?: number, priorityFlag?: any): number {
        if (priorityFlag === true || priorityFlag === 'high' || priorityFlag === 'critical') {
            return JobPriority.HIGH;
        }

        if (this.priorityClassifier) {
            return this.priorityClassifier.classify(prizeAmount).priority;
        }

        return JobPriority.NORMAL;
    }

    private buildDrawRequestIdentity(
        eventResponse: any,
        raffleId: number,
        contractRequestId: string,
    ): DrawRequestIdentity {
        const ledger = Number(eventResponse.ledger ?? 0);
        const txHash = String(
            eventResponse.txHash ??
            eventResponse.tx_hash ??
            eventResponse.transactionHash ??
            eventResponse.transaction_hash ??
            eventResponse.transaction?.hash ??
            'unknown',
        );
        const eventIndex = this.extractEventIndex(eventResponse);
        const stableRequestId = [
            `ledger:${ledger}`,
            `tx:${txHash}`,
            `event:${eventIndex}`,
            `raffle:${raffleId}`,
        ].join(':');

        return {
            stableRequestId,
            ledger,
            txHash,
            eventIndex,
            raffleId,
            contractRequestId,
        };
    }

    private extractEventIndex(eventResponse: any): number {
        const explicitIndex =
            eventResponse.eventIndex ??
            eventResponse.event_index ??
            eventResponse.index;

        if (explicitIndex !== undefined && explicitIndex !== null) {
            return Number(explicitIndex);
        }

        const token = String(eventResponse.id ?? eventResponse.paging_token ?? '');
        const parts = token.split('-');
        const lastPart = parts[parts.length - 1];
        const parsed = Number(lastPart);

        return Number.isFinite(parsed) ? parsed : 0;
    }

    private isReplayOverride(eventResponse: any): boolean {
        const configReplay = this.configService.get<string>('ORACLE_DRAW_REQUEST_REPLAY', 'false');
        return (
            eventResponse.replay === true ||
            eventResponse.replayOverride === true ||
            configReplay.toLowerCase() === 'true'
        );
    }

    private parseEventData(eventXdr: StellarSdk.xdr.ContractEvent): Record<string, any> {
        const data = (eventXdr as any).body().v0().data();
        const result: Record<string, any> = {};

        if (data.switch() === StellarSdk.xdr.ScValType.scvMap()) {
            for (const entry of data.map() ?? []) {
                const key = entry.key().sym().toString();
                result[key] = this.decodeScVal(entry.val());
            }
        }
        return result;
    }

    private decodeScVal(val: StellarSdk.xdr.ScVal): any {
        switch (val.switch()) {
            case StellarSdk.xdr.ScValType.scvU32(): return val.u32();
            case StellarSdk.xdr.ScValType.scvU64(): return val.u64().toString();
            case StellarSdk.xdr.ScValType.scvI32(): return val.i32();
            case StellarSdk.xdr.ScValType.scvI64(): return val.i64().toString();
            case StellarSdk.xdr.ScValType.scvSymbol(): return val.sym().toString();
            case StellarSdk.xdr.ScValType.scvString(): return val.str().toString();
            case StellarSdk.xdr.ScValType.scvBytes(): return val.bytes().toString('hex');
            case StellarSdk.xdr.ScValType.scvAddress(): 
                const addr = val.address();
                if (addr.switch() === StellarSdk.xdr.ScAddressType.scAddressTypeAccount()) {
                    return StellarSdk.Address.account(Buffer.from(addr.accountId().ed25519() as any)).toString();
                } else {
                    return StellarSdk.Address.contract(Buffer.from(addr.contractId() as any)).toString();
                }
            case StellarSdk.xdr.ScValType.scvBool(): return val.b();
            default: return null;
        }
    }

    private handleStreamError(err: any) {
        this.logger.error(`Horizon SSE Stream Error: ${err.message || 'Unknown error'}`);
        this.stopListening();
        // Task 4.4: Record failure before scheduling reconnect
        this.circuitBreaker?.recordFailure();
        this.scheduleReconnect();
    }

    private scheduleReconnect() {
        this.retryCount++;
        const delay = Math.min(this.INITIAL_RETRY_DELAY * Math.pow(2, this.retryCount), this.MAX_RETRY_DELAY);

        this.logger.log(`Scheduling SSE reconnect in ${delay}ms (attempt ${this.retryCount})...`);

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        this.reconnectTimeout = setTimeout(() => {
            this.startListening();
        }, delay);
    }
}
