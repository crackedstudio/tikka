[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / createInMemoryNonceStore

# Function: createInMemoryNonceStore()

> **createInMemoryNonceStore**(`ttlMs?`): (`nonceBase64`) => `boolean`

Defined in: [auth/sep10.ts:79](https://github.com/crackedstudio/tikka/blob/11d400197ee0151dfb43392435b9432d214babfb/sdk/src/auth/sep10.ts#L79)

Create a nonce validator backed by an in-memory TTL map.

Suitable for single-process deployments only. For production multi-instance
deployments, use a distributed store (for example Redis `SET key value NX EX ttl`).

Redis example:
```ts
const nonceValidator = async (nonceBase64: string) => {
  const key = `sep10:nonce:${nonceBase64}`;
  const ok = await redis.set(key, '1', { NX: true, EX: 300 });
  return ok === 'OK';
};
```

## Parameters

### ttlMs?

`number` = `...`

## Returns

(`nonceBase64`) => `boolean`
