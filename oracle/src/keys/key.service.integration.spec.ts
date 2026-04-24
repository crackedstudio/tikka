import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KeyService } from './key.service';
import * as StellarSdk from '@stellar/stellar-sdk';

describe('KeyService Integration', () => {
  let service: KeyService;
  
  const TEST_SECRET = 'SBFXQZQXQZQXQZQXQZQXQZQXQZQXQZQXQZQXQZQXQZQXQZQXQZQXQZQX'; // 56 chars starting with S
  // Actually let's generate a real one
  const kp = StellarSdk.Keypair.random();
  const REAL_TEST_SECRET = kp.secret();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KeyService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'KEY_PROVIDER') return 'env';
              if (key === 'ORACLE_SECRET_KEY') return REAL_TEST_SECRET;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<KeyService>(KeyService);
    await service.onModuleInit();
  });

  it('should sign a transaction', async () => {
    const sourceAccount = new StellarSdk.Account(kp.publicKey(), '1');
    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '100',
      networkPassphrase: 'Test SDF Network ; September 2015',
    })
      .addOperation(StellarSdk.Operation.payment({
        destination: kp.publicKey(),
        asset: StellarSdk.Asset.native(),
        amount: '1',
      }))
      .setTimeout(0)
      .build();

    expect(tx.signatures.length).toBe(0);
    
    await service.signTransaction(tx);
    
    expect(tx.signatures.length).toBe(1);
    expect(tx.signatures[0].hint().toString('hex')).toBe(kp.signatureHint().toString('hex'));
  });
});
