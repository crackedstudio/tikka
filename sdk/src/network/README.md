# Network Module — SDK

The Tikka SDK provides a highly customizable network layer for interacting with Soroban RPC and Horizon nodes.

## Configuration

The `RpcService` can be configured at initialization or updated at runtime.

### RpcConfig Interface
```ts
interface RpcConfig {
  endpoint: string;          // Primary RPC URL
  headers?: Record<string, string>; // Custom headers (e.g. API Keys)
  failoverEndpoints?: string[];     // Fallback RPC URLs
  fetchClient?: typeof fetch;       // CUSTOM fetch-compatible client
  timeoutMs?: number;               // Per-request timeout (default 30s)
  enableRetries?: boolean;          // Retry transient failures
  maxRetryAttempts?: number;        // Attempts per endpoint (default 3)
  retryBaseDelayMs?: number;        // Initial delay (default 300ms)
  retryBackoffFactor?: number;      // Exponential factor (default 2)
  retryableStatusCodes?: number[];  // Default: [429,500,502,503,504]
}
```

## Enterprise Patterns

### Custom RPC Node & API Keys
```ts
const tikka = await TikkaSDK.forRoot({
  network: {
    network: 'testnet',
    rpcUrl: 'https://rpc.your-enterprise.com',
  },
  rpcConfig: {
    headers: {
      'Authorization': 'Bearer your-api-key'
    }
  },
});
```

### Failover Support
Provide multiple nodes to ensure high availability. The SDK will automatically switch to the next node if the primary one fails.
```ts
rpcService.addFailoverEndpoint('https://backup-node.stellar.org');
```

### Mocking for Tests
You can plug in a custom `fetchClient` to mock network responses in your application tests.
```ts
rpcService.setFetchClient((url, options) => {
  return Promise.resolve(new Response(JSON.stringify({ result: 'mocked' })));
});
```

### Runtime Reconfiguration
```ts
// Update settings on the fly without rebooting the SDK
rpcService.configure({ timeoutMs: 5000 });
```

### Retry Control
Retries are enabled by default for timeout/network errors and retryable status codes.
```ts
rpcService.configure({
  maxRetryAttempts: 4,
  retryBaseDelayMs: 250,
});

// Disable retries for a specific call
await rpcService.simulateTransaction(tx, { disableRetries: true });
```

### Mock RPC Service for Local Development
```ts
import { MockRpcService } from './mock-rpc.service';

const mockRpc = new MockRpcService();
mockRpc.configure({ delayMs: 500, failSimulation: false });
```

### React Native
Always pass an explicit fetch client in RN environments where `globalThis.fetch` may not be available:
```ts
const rpcService = new RpcService(networkConfig, {
  endpoint: networkConfig.rpcUrl,
  fetchClient: fetch,
});
```
