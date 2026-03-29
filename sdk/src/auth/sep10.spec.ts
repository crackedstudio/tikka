import { Keypair, Networks, Transaction } from '@stellar/stellar-sdk';
import { buildChallenge, verifyResponse } from './sep10';

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

  it('expired challenge is rejected', async () => {
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
        now: Math.floor(Date.now() / 1000 + 5),
      }),
    ).rejects.toThrow(/expired|not yet valid/);
  });

  it('invalid signature (wrong client) is rejected', async () => {
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
      }),
    ).rejects.toThrow(/missing from response|invalid signature/);
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
      }),
    ).rejects.toThrow();
  });

  it('wrong client account is rejected', async () => {
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
      }),
    ).rejects.toThrow(/Client signature is missing|invalid signature/);
  });

  it('nonceValidator rejects replayed challenge', async () => {
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
    ).rejects.toThrow(/Nonce validation rejected/);
  });
});
