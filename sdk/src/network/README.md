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
}
```

## Enterprise Patterns

### Custom RPC Node & API Keys
```ts
const tikka = await TikkaSDK.forRoot({
  endpoint: 'https://rpc.your-enterprise.com',
  headers: {
    'Authorization': 'Bearer your-api-key'
  }
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
