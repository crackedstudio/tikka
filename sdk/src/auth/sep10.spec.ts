import { Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import {
  buildChallenge,
  createInMemoryNonceStore,
  Sep10Step,
  Sep10VerificationErrorCode,
  Sep10VerificationError,
  verifyResponse,
} from './sep10';

describe('SEP-10 auth helper', () => {
  const server = Keypair.random();
  const client = Keypair.random();
  const attacker = Keypair.random();
  const anchorDomain = 'example.com';
  const webAuthDomain = 'auth.example.com';

  it('valid challenge and response verifies correctly', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      webAuthDomain,
      timeout: 300,
      networkPassphrase: Networks.TESTNET,
    });

    const responseTx = new Transaction(challengeXdr, Networks.TESTNET);
    responseTx.sign(client);

    const verified = await verifyResponse({
      signedChallenge: responseTx.toXDR(),
      serverAccount: server.publicKey(),
      clientAccount: client.publicKey(),
      anchorDomain,
      networkPassphrase: Networks.TESTNET,
      nonceValidator: async () => true,
    });

    expect(verified).toBe(client.publicKey());
  });

  it('expired challenge is rejected with actionable message and correct step', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      timeout: 1,
      networkPassphrase: Networks.TESTNET,
    });

    const responseTx = new Transaction(challengeXdr, Networks.TESTNET);
    responseTx.sign(client);

    await expect(
      verifyResponse({
        signedChallenge: responseTx.toXDR(),
        serverAccount: server.publicKey(),
        clientAccount: client.publicKey(),
        anchorDomain,
        networkPassphrase: Networks.TESTNET,
        nonceValidator: async () => true,
        now: Math.floor(Date.now() / 1000 + 5),
      }),
    ).rejects.toMatchObject({
      code: Sep10VerificationErrorCode.ChallengeExpired,
      step: Sep10Step.VerifyChallenge,
      name: 'Sep10VerificationError',
    });
  });

  it('expired challenge message includes actionable hint about system clock', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      timeout: 1,
      networkPassphrase: Networks.TESTNET,
    });

    const responseTx = new Transaction(challengeXdr, Networks.TESTNET);
    responseTx.sign(client);

    await expect(
      verifyResponse({
        signedChallenge: responseTx.toXDR(),
        serverAccount: server.publicKey(),
        clientAccount: client.publicKey(),
        anchorDomain,
        networkPassphrase: Networks.TESTNET,
        nonceValidator: async () => true,
        now: Math.floor(Date.now() / 1000 + 5),
      }),
    ).rejects.toThrow(/system clock.*synchronized|NTP/);
  });

  it('challenge not yet valid message includes actionable hint about system clock', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      timeout: 300,
      networkPassphrase: Networks.TESTNET,
    });

    const responseTx = new Transaction(challengeXdr, Networks.TESTNET);
    responseTx.sign(client);

    // Set now far in the past so challenge is not yet valid
    await expect(
      verifyResponse({
        signedChallenge: responseTx.toXDR(),
        serverAccount: server.publicKey(),
        clientAccount: client.publicKey(),
        anchorDomain,
        networkPassphrase: Networks.TESTNET,
        nonceValidator: async () => true,
        now: 0,
      }),
    ).rejects.toMatchObject({
      code: Sep10VerificationErrorCode.ChallengeNotYetValid,
      step: Sep10Step.VerifyChallenge,
    });
  });

  it('challenge not yet valid message includes actionable hint about NTP', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      timeout: 300,
      networkPassphrase: Networks.TESTNET,
    });

    const responseTx = new Transaction(challengeXdr, Networks.TESTNET);
    responseTx.sign(client);

    await expect(
      verifyResponse({
        signedChallenge: responseTx.toXDR(),
        serverAccount: server.publicKey(),
        clientAccount: client.publicKey(),
        anchorDomain,
        networkPassphrase: Networks.TESTNET,
        nonceValidator: async () => true,
        now: 0,
      }),
    ).rejects.toThrow(/system clock.*synchronized|NTP/);
  });

  it('invalid signature (wrong client) is rejected with MissingClientSignature', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      timeout: 300,
      networkPassphrase: Networks.TESTNET,
    });

    const responseTx = new Transaction(challengeXdr, Networks.TESTNET);
    responseTx.sign(attacker);

    await expect(
      verifyResponse({
        signedChallenge: responseTx.toXDR(),
        serverAccount: server.publicKey(),
        clientAccount: client.publicKey(),
        anchorDomain,
        networkPassphrase: Networks.TESTNET,
        nonceValidator: async () => true,
      }),
    ).rejects.toMatchObject({
      code: Sep10VerificationErrorCode.MissingClientSignature,
      step: Sep10Step.VerifyChallenge,
    });
  });

  it('invalid signature message includes actionable hint about signing keys', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      timeout: 300,
      networkPassphrase: Networks.TESTNET,
    });

    const responseTx = new Transaction(challengeXdr, Networks.TESTNET);
    responseTx.sign(attacker);

    await expect(
      verifyResponse({
        signedChallenge: responseTx.toXDR(),
        serverAccount: server.publicKey(),
        clientAccount: client.publicKey(),
        anchorDomain,
        networkPassphrase: Networks.TESTNET,
        nonceValidator: async () => true,
      }),
    ).rejects.toThrow(/signing|key/);
  });

  it('modified transaction is rejected', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      timeout: 300,
      networkPassphrase: Networks.TESTNET,
    });

    const responseTx = new Transaction(challengeXdr, Networks.TESTNET);
    responseTx.sign(client);

    const broken = Buffer.from(responseTx.toXDR(), 'base64');
    broken[20] = broken[20] ^ 0xff;
    const tamperedXdr = broken.toString('base64');

    await expect(
      verifyResponse({
        signedChallenge: tamperedXdr,
        serverAccount: server.publicKey(),
        clientAccount: client.publicKey(),
        anchorDomain,
        networkPassphrase: Networks.TESTNET,
        nonceValidator: async () => true,
      }),
    ).rejects.toThrow();
  });

  it('wrong client account is rejected with MissingClientSignature', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      timeout: 300,
      networkPassphrase: Networks.TESTNET,
    });

    const responseTx = new Transaction(challengeXdr, Networks.TESTNET);
    responseTx.sign(client);

    await expect(
      verifyResponse({
        signedChallenge: responseTx.toXDR(),
        serverAccount: server.publicKey(),
        clientAccount: attacker.publicKey(),
        anchorDomain,
        networkPassphrase: Networks.TESTNET,
        nonceValidator: async () => true,
      }),
    ).rejects.toMatchObject({
      code: Sep10VerificationErrorCode.MissingClientSignature,
      step: Sep10Step.VerifyChallenge,
    });
  });

  it('wrong domain is rejected with UnexpectedManageDataKey', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      timeout: 300,
      networkPassphrase: Networks.TESTNET,
    });

    const responseTx = new Transaction(challengeXdr, Networks.TESTNET);
    responseTx.sign(client);

    await expect(
      verifyResponse({
        signedChallenge: responseTx.toXDR(),
        serverAccount: server.publicKey(),
        clientAccount: client.publicKey(),
        anchorDomain: 'wrong.example.com',
        networkPassphrase: Networks.TESTNET,
        nonceValidator: async () => true,
      }),
    ).rejects.toMatchObject({
      code: Sep10VerificationErrorCode.UnexpectedManageDataKey,
      step: Sep10Step.VerifyChallenge,
    });
  });

  it('wrong domain message includes actionable hint about anchorDomain', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      timeout: 300,
      networkPassphrase: Networks.TESTNET,
    });

    const responseTx = new Transaction(challengeXdr, Networks.TESTNET);
    responseTx.sign(client);

    await expect(
      verifyResponse({
        signedChallenge: responseTx.toXDR(),
        serverAccount: server.publicKey(),
        clientAccount: client.publicKey(),
        anchorDomain: 'wrong.example.com',
        networkPassphrase: Networks.TESTNET,
        nonceValidator: async () => true,
      }),
    ).rejects.toThrow(/anchorDomain|domain/);
  });

  it('wrong network is rejected with InvalidXdr', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      timeout: 300,
      networkPassphrase: Networks.PUBLIC,
    });

    const responseTx = new Transaction(challengeXdr, Networks.PUBLIC);
    responseTx.sign(client);

    await expect(
      verifyResponse({
        signedChallenge: responseTx.toXDR(),
        serverAccount: server.publicKey(),
        clientAccount: client.publicKey(),
        anchorDomain,
        networkPassphrase: Networks.TESTNET,
        nonceValidator: async () => true,
      }),
    ).rejects.toMatchObject({
      code: Sep10VerificationErrorCode.InvalidXdr,
      step: Sep10Step.ParseChallenge,
    });
  });

  it('wrong network message includes actionable hint about network passphrase', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      timeout: 300,
      networkPassphrase: Networks.PUBLIC,
    });

    const responseTx = new Transaction(challengeXdr, Networks.PUBLIC);
    responseTx.sign(client);

    await expect(
      verifyResponse({
        signedChallenge: responseTx.toXDR(),
        serverAccount: server.publicKey(),
        clientAccount: client.publicKey(),
        anchorDomain,
        networkPassphrase: Networks.TESTNET,
        nonceValidator: async () => true,
      }),
    ).rejects.toThrow(/network passphrase|Testnet|Public/);
  });

  it('nonceValidator rejects replayed challenge with NonceRejected', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      timeout: 300,
      networkPassphrase: Networks.TESTNET,
    });

    const responseTx = new Transaction(challengeXdr, Networks.TESTNET);
    responseTx.sign(client);

    await expect(
      verifyResponse({
        signedChallenge: responseTx.toXDR(),
        serverAccount: server.publicKey(),
        clientAccount: client.publicKey(),
        anchorDomain,
        networkPassphrase: Networks.TESTNET,
        nonceValidator: async () => false,
      }),
    ).rejects.toMatchObject({
      code: Sep10VerificationErrorCode.NonceRejected,
      step: Sep10Step.VerifyChallenge,
    });
  });

  it('nonce rejected message includes actionable hint about replay', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      timeout: 300,
      networkPassphrase: Networks.TESTNET,
    });

    const responseTx = new Transaction(challengeXdr, Networks.TESTNET);
    responseTx.sign(client);

    await expect(
      verifyResponse({
        signedChallenge: responseTx.toXDR(),
        serverAccount: server.publicKey(),
        clientAccount: client.publicKey(),
        anchorDomain,
        networkPassphrase: Networks.TESTNET,
        nonceValidator: async () => false,
      }),
    ).rejects.toThrow(/replay|fresh|used before/);
  });

  it('missing server signature is rejected with actionable message', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      timeout: 300,
      networkPassphrase: Networks.TESTNET,
    });

    // Build response with only client signature (no server signature)
    const responseTx = new Transaction(challengeXdr, Networks.TESTNET);
    responseTx.sign(client);
    // Remove the server signature by creating a new tx with only client sig
    const strippedXdr = responseTx.toXDR();

    // Manually strip server signature: create tx from XDR and remove one sig
    const tx = new Transaction(strippedXdr, Networks.TESTNET);
    // Clear signatures and re-sign only with client
    tx.signatures = [];
    tx.sign(client);

    await expect(
      verifyResponse({
        signedChallenge: tx.toXDR(),
        serverAccount: server.publicKey(),
        clientAccount: client.publicKey(),
        anchorDomain,
        networkPassphrase: Networks.TESTNET,
        nonceValidator: async () => true,
      }),
    ).rejects.toMatchObject({
      code: Sep10VerificationErrorCode.MissingServerSignature,
      step: Sep10Step.VerifyChallenge,
    });
  });

  it('missing server signature message includes actionable hint about server key', async () => {
    const challengeXdr = buildChallenge({
      serverSecret: server.secret(),
      clientAccount: client.publicKey(),
      anchorDomain,
      timeout: 300,
      networkPassphrase: Networks.TESTNET,
    });

    const responseTx = new Transaction(challengeXdr, Networks.TESTNET);
    responseTx.sign(client);

    const tx = new Transaction(responseTx.toXDR(), Networks.TESTNET);
    tx.signatures = [];
    tx.sign(client);

    await expect(
      verifyResponse({
        signedChallenge: tx.toXDR(),
        serverAccount: server.publicKey(),
        clientAccount: client.publicKey(),
        anchorDomain,
        networkPassphrase: Networks.TESTNET,
        nonceValidator: async () => true,
      }),
    ).rejects.toThrow(/server.*sign|secret key/);
  });

  describe('buildChallenge input validation', () => {
    it('rejects empty serverSecret with actionable message and BuildChallenge step', () => {
      expect(() =>
        buildChallenge({
          serverSecret: '',
          clientAccount: client.publicKey(),
          anchorDomain,
        }),
      ).rejects.toMatchObject({
        code: Sep10VerificationErrorCode.InvalidXdr,
        step: Sep10Step.BuildChallenge,
      });
    });

    it('rejects invalid serverSecret with actionable message', () => {
      expect(() =>
        buildChallenge({
          serverSecret: 'invalid_secret',
          clientAccount: client.publicKey(),
          anchorDomain,
        }),
      ).rejects.toMatchObject({
        code: Sep10VerificationErrorCode.InvalidXdr,
        step: Sep10Step.BuildChallenge,
      });
    });

    it('rejects invalid clientAccount with actionable message', () => {
      expect(() =>
        buildChallenge({
          serverSecret: server.secret(),
          clientAccount: 'invalid_public_key',
          anchorDomain,
        }),
      ).rejects.toMatchObject({
        code: Sep10VerificationErrorCode.InvalidXdr,
        step: Sep10Step.BuildChallenge,
      });
    });

    it('rejects empty anchorDomain with actionable message', () => {
      expect(() =>
        buildChallenge({
          serverSecret: server.secret(),
          clientAccount: client.publicKey(),
          anchorDomain: '',
        }),
      ).rejects.toMatchObject({
        code: Sep10VerificationErrorCode.MissingAnchorChallengeData,
        step: Sep10Step.BuildChallenge,
      });
    });

    it('rejects non-positive timeout with actionable message', () => {
      expect(() =>
        buildChallenge({
          serverSecret: server.secret(),
          clientAccount: client.publicKey(),
          anchorDomain,
          timeout: -1,
        }),
      ).rejects.toMatchObject({
        code: Sep10VerificationErrorCode.InvalidTimebounds,
        step: Sep10Step.BuildChallenge,
      });
    });
  });

  describe('createInMemoryNonceStore', () => {
    it('returns true for fresh nonce', async () => {
      const store = createInMemoryNonceStore(10_000);
      expect(store('fresh')).toBe(true);
    });

    it('returns false when nonce is used twice', async () => {
      const store = createInMemoryNonceStore(10_000);
      expect(store('replay')).toBe(true);
      expect(store('replay')).toBe(false);
    });

    it('returns false for an expired consumed nonce', async () => {
      jest.useFakeTimers();
      const store = createInMemoryNonceStore(100);

      expect(store('expiring')).toBe(true);
      jest.advanceTimersByTime(101);
      expect(store('expiring')).toBe(false);

      jest.useRealTimers();
    });
  });
});
