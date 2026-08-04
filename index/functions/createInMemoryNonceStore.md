[**Tikka SDK v0.1.0**](../../README.md)

***

[Tikka SDK](../../modules.md) / [index](../README.md) / createInMemoryNonceStore

# Function: createInMemoryNonceStore()

> **createInMemoryNonceStore**(`ttlMs?`): (`nonceBase64`) => `boolean`

Defined in: [auth/sep10.ts:80](https://github.com/crackedstudio/tikka/blob/119b5490510b67ffb71bc9882d169d75ef584b1a/sdk/src/auth/sep10.ts#L80)

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
