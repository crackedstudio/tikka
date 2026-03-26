import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from 'stellar-sdk';
import { Subject, Subscription } from 'rxjs';
import { RandomnessWorker } from '../queue/randomness.worker';
import { RandomnessRequest } from '../queue/queue.types';
import { HealthService } from '../health/health.service';
import { LagMonitorService } from '../health/lag-monitor.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { RANDOMNESS_QUEUE, RandomnessJobPayload } from '../queue/randomness.queue';

@Injectable()
export class EventListenerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(EventListenerService.name);
    private horizonServer: StellarSdk.Horizon.Server;
    private readonly raffleContractId: string;
    private readonly networkPassphrase: string;

    private closeStream: (() => void) | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private retryCount = 0;
    private readonly MAX_RETRY_DELAY = 60000; // 1 minute
    private readonly INITIAL_RETRY_DELAY = 1000; // 1 second

    // Bull queue depth (approximate)
    private currentQueueDepth = 0;

    constructor(
        private readonly configService: ConfigService,
        private readonly healthService: HealthService,
        private readonly lagMonitor: LagMonitorService,
        @InjectQueue(RANDOMNESS_QUEUE) private readonly randomnessQueue: Queue<RandomnessJobPayload>,
    ) {
        // Config parsing
        const horizonUrl = this.configService.get<string>('HORIZON_URL', 'https://horizon-testnet.stellar.org');
        this.networkPassphrase = this.configService.get<string>('NETWORK_PASSPHRASE', StellarSdk.Networks.TESTNET);
        this.raffleContractId = this.configService.get<string>('RAFFLE_CONTRACT_ID', '');

        if (!this.raffleContractId) {
            this.logger.warn('RAFFLE_CONTRACT_ID is not set. Event listener might not work properly without a valid contract ID.');
        }

        this.horizonServer = new StellarSdk.Horizon.Server(horizonUrl);
    }

    onModuleInit() {
        this.logger.log(`Initializing EventListenerService against contract: ${this.raffleContractId}`);

        // Start SSE stream
        this.startListening();
    }

    onModuleDestroy() {
        if (this.closeStream) {
            this.logger.log('Closing Horizon SSE stream');
            this.closeStream();
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
    }

    private startListening() {
        if (!this.raffleContractId) {
            this.logger.warn('Skipping event listening due to missing RAFFLE_CONTRACT_ID.');
            return;
        }

        this.logger.log('Starting Horizon event stream...');
        this.retryCount = 0;

        try {
            this.closeStream = (this.horizonServer as any).events()
                // We only care about events involving our raffle contract
                // Note: Horizon filtering by contract is limited; usually you filter client-side for specific event topics, 
                // however stellar-sdk event filtering builder isn't fully robust for contract ID sometimes. 
                // We'll fetch all events for now, and filter by our contract in the handler.
                // A more advanced polling indexer is used in tikka-indexer; here we can rely on basic Horizon SSE for MVP.
                .cursor('now')
                .stream({
                    onmessage: this.handleEvent.bind(this),
                    onerror: this.handleStreamError.bind(this),
                });
        } catch (err) {
            this.logger.error('Failed to start SSE stream', err);
            this.scheduleReconnect();
        }
    }

    private handleEvent(eventResponse: any) {
        // 1. Filter by Raffle Contract
        if (eventResponse.contractId !== this.raffleContractId) {
            return;
        }

        // 2. Decode XDR event payload
        try {
            // Update current ledger in lag monitor
            if (eventResponse.ledger) {
                this.lagMonitor.updateCurrentLedger(eventResponse.ledger);
            }

            // Decode the raw XDR to see topics and value
            const eventXdr = StellarSdk.xdr.ContractEvent.fromXDR(eventResponse.value, 'base64');

            const topics = (eventResponse.topic || []).map((t: string) => StellarSdk.xdr.ScVal.fromXDR(t, 'base64'));

            // Match the topic pattern
            // RandomnessRequested { raffle_id, request_id }
            // The exact topic structure depends on the rust event string, e.g., Symbol("RandomnessRequested")

            if (topics.length > 0) {
                const primaryTopic = topics[0];

                // Check if the topic is a Symbol
                if (primaryTopic.switch() === StellarSdk.xdr.ScValType.scvSymbol()) {
                    const eventName = primaryTopic.sym().toString();

                    if (eventName === 'RandomnessRequested') {
                        this.logger.log(`Received RandomnessRequested event for contract ${this.raffleContractId}`);

                        // The value should contain a map or struct with raffle_id and request_id.
                        // Standard access: eventXdr.body().v0().data()
                        const scVal = (eventXdr as any).body().v0().data();

                        let raffleId: number | undefined;
                        let requestId: string | undefined;

                        // Example of parsing struct/map fields:
                        if (scVal.switch() === StellarSdk.xdr.ScValType.scvMap()) {
                            const mapEntries = scVal.map();
                            for (const entry of mapEntries ?? []) {
                                const keySym = entry.key().sym().toString();
                                if (keySym === 'raffle_id') {
                                    raffleId = entry.val().u32();
                                } else if (keySym === 'request_id') {
                                    // Usually bytes or string or u64 - assuming u64 string representation or a byte array for this prototype
                                    // Let's assume depending on the struct it might be a u64 cast into a string.
                                    requestId = this.parseRequestId(entry.val());
                                }
                            }
                        } else if (scVal.switch() === StellarSdk.xdr.ScValType.scvVec()) {
                            // Sometimes payloads are vecs if it's a tuple. We need exact alignment.
                            // Assuming simple map object as standard for tikka
                        }

                        if (raffleId !== undefined && requestId !== undefined) {
                            this.logger.log(`Enqueueing RandomnessRequest: raffle=${raffleId}, request=${requestId}`);
                            this.lagMonitor.trackRequest(requestId, raffleId, eventResponse.ledger || 0);

                            this.randomnessQueue.add({
                                raffleId,
                                requestId,
                            }).then(() => {
                                this.currentQueueDepth++;
                                this.healthService.updateQueueDepth(this.currentQueueDepth);
                            }).catch(err => {
                                this.logger.error(`Failed to enqueue job for raffle ${raffleId}: ${err.message}`);
                            });
                        } else {
                            this.logger.warn(`Could not completely parse RandomnessRequested payload. Value: ${scVal.toXDR('base64')}`);
                        }
                    }
                }
            }

        } catch (e) {
            this.logger.error(`Error parsing event XDR: ${e.message}`, eventResponse);
        }
    }

    private handleStreamError(err: Error) {
        this.logger.error('Horizon SSE Stream Error', err);
        if (this.closeStream) {
            this.closeStream();
        }
        this.scheduleReconnect();
    }

    private scheduleReconnect() {
        this.retryCount++;
        // Exponential backoff
        const delay = Math.min(this.INITIAL_RETRY_DELAY * Math.pow(2, this.retryCount), this.MAX_RETRY_DELAY);

        this.logger.log(`Scheduling SSE reconnect in ${delay}ms (attempt ${this.retryCount})...`);

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }

        this.reconnectTimeout = setTimeout(() => {
            this.startListening();
        }, delay);
    }

    /**
     * Helper to parse request_id strictly depending on the contract type
     */
    private parseRequestId(val: StellarSdk.xdr.ScVal): string {
        switch (val.switch()) {
            case StellarSdk.xdr.ScValType.scvU64():
                return val.u64().toString();
            case StellarSdk.xdr.ScValType.scvString():
                return val.str().toString();
            case StellarSdk.xdr.ScValType.scvBytes():
                return val.bytes().toString('hex');
            default:
                return JSON.stringify(val.value());
        }
    }
}
