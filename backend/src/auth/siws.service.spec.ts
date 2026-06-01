import { Keypair } from '@stellar/stellar-sdk';
import { buildSiwsMessage, SiwsService } from './siws.service';

describe('SiwsService', () => {
  const nonce = 'test-nonce';
  const issuedAt = new Date().toISOString();
  const domain = 'tikka.io';
  const keypair = Keypair.random();
  const address = keypair.publicKey();
  const originalNetwork = process.env.STELLAR_NETWORK;

  afterEach(() => {
    if (originalNetwork === undefined) {
      delete process.env.STELLAR_NETWORK;
    } else {
      process.env.STELLAR_NETWORK = originalNetwork;
    }
  });

  it('includes the configured Stellar network in the SIWS message', () => {
    process.env.STELLAR_NETWORK = 'testnet';
    const message = buildSiwsMessage(domain, address, nonce, issuedAt);
    expect(message).toContain('Network: testnet');
  });

  it('accepts a signature for the current network and rejects a signature created for the wrong network', () => {
    process.env.STELLAR_NETWORK = 'testnet';
    const service = new SiwsService();
    const expectedMessage = service.buildMessage(address, nonce, issuedAt);
    const validSignature = keypair.sign(Buffer.from(expectedMessage, 'utf8')).toString('base64');

    expect(service.verify(address, expectedMessage, validSignature)).toBe(true);

    process.env.STELLAR_NETWORK = 'mainnet';
    const wrongNetworkMessage = buildSiwsMessage(domain, address, nonce, issuedAt);
    const wrongNetworkSignature = keypair.sign(Buffer.from(wrongNetworkMessage, 'utf8')).toString('base64');

    process.env.STELLAR_NETWORK = 'testnet';
    expect(service.verify(address, expectedMessage, wrongNetworkSignature)).toBe(false);
  });
});
