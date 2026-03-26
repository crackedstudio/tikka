import { Test, TestingModule } from '@nestjs/testing';
import { VrfService } from '../src/randomness/vrf.service';
import { KeyService } from '../src/keys/key.service';
import { ConfigService } from '@nestjs/config';
import { Keypair } from 'stellar-sdk';

describe('VrfService', () => {
    let service: VrfService;
    let keyService: KeyService;
    const mockSecret = Keypair.random().secret();

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                VrfService,
                {
                    provide: ConfigService,
                    useValue: {
                        get: jest.fn().mockReturnValue(mockSecret),
                    },
                },
                KeyService,
            ],
        }).compile();

        service = module.get<VrfService>(VrfService);
        keyService = module.get<KeyService>(KeyService);
        keyService.onModuleInit();
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should compute deterministic seed and proof', async () => {
        const requestId = 'test-request-123';
        const result1 = await service.compute(requestId);
        const result2 = await service.compute(requestId);

        expect(result1.seed).toBe(result2.seed);
        expect(result1.proof).toBe(result2.proof);
        expect(result1.seed).toHaveLength(64); // 32 bytes hex
        expect(result1.proof).toHaveLength(128); // 64 bytes hex
    });

    it('should produce different outputs for different requestIds', async () => {
        const result1 = await service.compute('req-1');
        const result2 = await service.compute('req-2');

        expect(result1.seed).not.toBe(result2.seed);
        expect(result1.proof).not.toBe(result2.proof);
    });

    it('should be verifiable using the oracle public key', async () => {
        const requestId = 'verifiable-req';
        const { seed, proof } = await service.compute(requestId);
        const publicKey = keyService.getPublicKeyBuffer().toString('hex');

        const isValid = service.verify(publicKey, requestId, proof, seed);
        expect(isValid).toBe(true);
    });

    it('should fail verification if proof is tampered', async () => {
        const requestId = 'tamper-proof-test';
        const { seed, proof } = await service.compute(requestId);
        const publicKey = keyService.getPublicKeyBuffer().toString('hex');

        // Tamper with proof (change last char)
        const tamperedProof = proof.substring(0, 127) + (proof[127] === '0' ? '1' : '0');

        const isValid = service.verify(publicKey, requestId, tamperedProof, seed);
        expect(isValid).toBe(false);
    });

    it('should fail verification if seed does not match proof', async () => {
        const requestId = 'tamper-seed-test';
        const { proof } = await service.compute(requestId);
        const publicKey = keyService.getPublicKeyBuffer().toString('hex');
        const tamperedSeed = '0'.repeat(64);

        const isValid = service.verify(publicKey, requestId, proof, tamperedSeed);
        expect(isValid).toBe(false);
    });
});
