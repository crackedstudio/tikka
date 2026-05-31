# Integration Guide: Using Component Health Tracking

This guide shows how to integrate component health tracking into various oracle services.

## Key Service (Key Provider Health)

In [key.service.ts](./key.service.ts):

```typescript
constructor(
  private readonly configService: ConfigService,
  private readonly healthService: HealthService,  // Add this
) {}

async onModuleInit() {
  await this.initializeProvider();
  
  // Update health after initialization
  try {
    const publicKey = await this.getPublicKey();
    this.healthService.updateKeyProviderStatus(
      'healthy',
      `Key provider ready for address: ${publicKey}`
    );
  } catch (error) {
    this.healthService.updateKeyProviderStatus(
      'unhealthy',
      `Failed to initialize key provider: ${error.message}`
    );
  }
}
```

## VRF Service (Randomness Provider Health)

In [vrf.service.ts](../randomness/vrf.service.ts):

```typescript
constructor(
  private readonly keyService: KeyService,
  private readonly oracleRegistry: OracleRegistryService,
  private readonly healthService: HealthService,  // Add this
) {
  this.ed25519Provider = new Ed25519Sha256VrfProvider(keyService);
}

async compute(requestId: string, raffleId?: number): Promise<RandomnessResult> {
  try {
    const result = await this.ed25519Provider.compute(requestId, raffleId);
    this.healthService.updateRandomnessProviderStatus('healthy');
    return result;
  } catch (error) {
    this.healthService.updateRandomnessProviderStatus(
      'unhealthy',
      `VRF computation failed: ${error.message}`
    );
    throw error;
  }
}
```

## TX Submitter (Network & Submitter Health)

In [tx-submitter.service.ts](../submitter/tx-submitter.service.ts):

```typescript
constructor(
  private readonly configService: ConfigService,
  private readonly keyService: KeyService,
  private readonly healthService: HealthService,  // Add this
) {}

async checkRpcHealth(): Promise<void> {
  try {
    const account = await this.server.getAccount(this.oraclePublicKey);
    this.healthService.updateNetworkStatus(
      'healthy',
      'RPC connection healthy'
    );
  } catch (error) {
    if (error.status === 'timeout') {
      this.healthService.updateNetworkStatus(
        'degraded',
        'RPC latency high or timeout'
      );
    } else {
      this.healthService.updateNetworkStatus(
        'unhealthy',
        `RPC unreachable: ${error.message}`
      );
    }
  }
}

async submitTransaction(tx: Transaction): Promise<TransactionResult> {
  try {
    const result = await this.server.submitTransaction(tx);
    this.healthService.recordSuccess(result.hash);
    return result;
  } catch (error) {
    const raffleId = this.extractRaffleId(tx); // Extract from tx data
    this.healthService.recordFailure(result.hash, raffleId, error.message);
    throw error;
  }
}
```

## Queue Service (Queue Health)

Queue health is automatically tracked via:

```typescript
// In queue.service.ts or worker
constructor(private readonly healthService: HealthService) {}

async processQueue(): Promise<void> {
  const queueDepth = await this.queue.count();
  this.healthService.updateQueueDepth(queueDepth);
}
```

## Subscriber Service (Listener Health)

Listener health is automatically tracked via stream status:

```typescript
// In stellar-subscriber.service.ts (already implemented)
private handleMessage(message: any) {
  this.lastMessageAt = Date.now();
  if (this.healthService.getMetrics().streamStatus !== 'connected') {
    this.healthService.updateStreamStatus('connected');
  }
}

private handleError(error: any) {
  const errorMsg = error.message || String(error);
  this.healthService.updateStreamStatus('disconnected', errorMsg);
}
```

## Health Service Integration in Module

Update your module to inject HealthService:

```typescript
// your-service.module.ts
import { Module } from '@nestjs/common';
import { HealthModule } from '../health/health.module';
import { YourService } from './your.service';

@Module({
  imports: [HealthModule],
  providers: [YourService],
  exports: [YourService],
})
export class YourServiceModule {}
```

## Usage in Components

```typescript
import { HealthService } from '../health/health.service';

@Injectable()
export class MyService {
  constructor(private readonly healthService: HealthService) {}

  // Method 1: Manual status updates
  updateComponentStatus() {
    this.healthService.updateKeyProviderStatus('healthy', 'All keys loaded');
  }

  // Method 2: Record success/failure (for submitter tracking)
  async doWork(requestId: string, raffleId: number) {
    try {
      await performWork();
      this.healthService.recordSuccess(requestId);
    } catch (error) {
      this.healthService.recordFailure(requestId, raffleId, error.message);
    }
  }

  // Method 3: Check overall health
  checkHealth() {
    const isHealthy = this.healthService.isHealthy();
    const isDegraded = this.healthService.isDegraded();
    const metrics = this.healthService.getMetrics();
    
    console.log(`Oracle health: ${metrics.components.listener.status}`);
  }
}
```

## Testing Component Health

```typescript
import { HealthService } from './health.service';

describe('MyService with HealthService', () => {
  let service: MyService;
  let healthService: HealthService;

  beforeEach(() => {
    healthService = new HealthService();
    service = new MyService(healthService);
  });

  it('updates key provider health on initialization', async () => {
    await service.initialize();
    
    const components = healthService.getComponentHealth();
    expect(components.keyProvider.status).toBe('healthy');
  });

  it('marks submitter as degraded on high failure rate', () => {
    // Simulate failures
    for (let i = 0; i < 15; i++) {
      healthService.recordSuccess('req-' + i);
    }
    for (let i = 0; i < 2; i++) {
      healthService.recordFailure('req-fail-' + i, 1, 'Error');
    }

    const components = healthService.getComponentHealth();
    expect(components.submitter.status).toBe('degraded');
  });

  it('overall health reflects component status', () => {
    healthService.updateNetworkStatus('unhealthy', 'No RPC');
    expect(healthService.isHealthy()).toBe(false);
  });
});
```

## Debugging Component Health

Use the `/oracle/components` endpoint during development:

```bash
curl http://localhost:3003/oracle/components | jq
```

Example output showing degraded submitter:

```json
{
  "components": {
    "listener": { "status": "healthy", "message": "..." },
    "queue": { "status": "healthy", "message": "..." },
    "keyProvider": { "status": "healthy", "message": "..." },
    "randomnessProvider": { "status": "healthy", "message": "..." },
    "network": { "status": "healthy", "message": "..." },
    "submitter": {
      "status": "degraded",
      "message": "Elevated failure rate: 15.4%",
      "stats": {
        "totalProcessed": 65,
        "totalFailed": 10,
        "successRate": "86.67%"
      }
    }
  },
  "overallStatus": "degraded"
}
```

## Component Health Events (Future Enhancement)

Future versions can emit events for monitoring:

```typescript
// Emit event when component becomes unhealthy
@EventEmitter()
componentUnhealthy = new EventEmitter<{component: string, status: ComponentStatus}>();

updateKeyProviderStatus(status: ComponentStatus, message?: string) {
  // ... existing logic
  if (status === 'unhealthy') {
    this.componentUnhealthy.emit({component: 'keyProvider', status});
  }
}
```
