import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OracleRegistryService } from './oracle-registry.service';
import { KeyService } from '../keys/key.service';
import {
  OracleAuditEntry,
  OracleConfig,
  PeerOracleEndpoint,
} from './multi-oracle.types';
import { Keypair } from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomKeypair() {
  return Keypair.random();
}

function makePeer(overrides: Partial<PeerOracleEndpoint> = {}): PeerOracleEndpoint {
  return {
    id: `peer-${Math.random().toString(36).slice(2)}`,
    url: 'http://peer.example.com:4000',
    publicKey: randomKeypair().publicKey(),
    ...overrides,
  };
}

function makeOracle(overrides: Partial<OracleConfig> = {}): OracleConfig {
  return {
    id: `oracle-${Math.random().toString(36).slice(2)}`,
    publicKey: randomKeypair().publicKey(),
    weight: 1,
    isLocal: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('OracleRegistryService', () => {
  let service: OracleRegistryService;

  beforeEach(async () => {
    const keyService = { getPublicKey: jest.fn().mockResolvedValue(randomKeypair().publicKey()) };
    const configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const cfg: Record<string, unknown> = {
          ORACLE_MODE: 'single',
          MULTI_ORACLE_ENABLED: false,
        };
        return cfg[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OracleRegistryService,
        { provide: ConfigService, useValue: configService },
        { provide: KeyService, useValue: keyService },
      ],
    }).compile();

    service = module.get<OracleRegistryService>(OracleRegistryService);
    await service.onModuleInit();
  });

  // -------------------------------------------------------------------------
  // addOracle
  // -------------------------------------------------------------------------

  describe('addOracle', () => {
    it('adds a valid oracle and records an audit entry', () => {
      const cfg = makeOracle();
      service.addOracle(cfg, 'admin');

      expect(service.getOracle(cfg.id)).toBeDefined();
      const log = service.getAuditLog();
      expect(log[0]).toMatchObject({ action: 'ADD_ORACLE', targetId: cfg.id, actor: 'admin' });
    });

    it('rejects an oracle with an invalid public key', () => {
      const cfg = makeOracle({ publicKey: 'not-a-valid-key' });
      expect(() => service.addOracle(cfg)).toThrow(/Invalid public key/);
    });

    it('rejects a duplicate oracle ID', () => {
      const cfg = makeOracle();
      service.addOracle(cfg);
      expect(() => service.addOracle(cfg)).toThrow(/Duplicate oracle ID/);
    });

    it('rejects a duplicate public key across different oracle IDs', () => {
      const kp = randomKeypair();
      const cfg1 = makeOracle({ publicKey: kp.publicKey() });
      const cfg2 = makeOracle({ publicKey: kp.publicKey() });
      service.addOracle(cfg1);
      expect(() => service.addOracle(cfg2)).toThrow(/already registered/);
    });
  });

  // -------------------------------------------------------------------------
  // setOracleActive (status transitions)
  // -------------------------------------------------------------------------

  describe('setOracleActive', () => {
    it('disables an active oracle and audits the change', () => {
      const cfg = makeOracle();
      service.addOracle(cfg);

      service.setOracleActive(cfg.id, false, 'ops-team');
      expect(service.getOracle(cfg.id)!.isActive).toBe(false);

      const log = service.getAuditLog();
      expect(log[0]).toMatchObject({ action: 'DISABLE_ORACLE', targetId: cfg.id, actor: 'ops-team' });
    });

    it('enables a disabled oracle and audits the change', () => {
      const cfg = makeOracle();
      service.addOracle(cfg);
      service.setOracleActive(cfg.id, false);
      service.setOracleActive(cfg.id, true, 'admin');

      expect(service.getOracle(cfg.id)!.isActive).toBe(true);
      const log = service.getAuditLog();
      expect(log[0]).toMatchObject({ action: 'ENABLE_ORACLE', actor: 'admin' });
    });

    it('is a no-op when status is already the same (no audit entry)', () => {
      const cfg = makeOracle();
      service.addOracle(cfg);
      const logBefore = service.getAuditLog().length;
      service.setOracleActive(cfg.id, true); // already active
      expect(service.getAuditLog().length).toBe(logBefore);
    });

    it('throws for an unknown oracle ID', () => {
      expect(() => service.setOracleActive('ghost-id', false)).toThrow(/Oracle not found/);
    });
  });

  // -------------------------------------------------------------------------
  // removeOracle
  // -------------------------------------------------------------------------

  describe('removeOracle', () => {
    it('removes an oracle and audits the change', () => {
      const cfg = makeOracle();
      service.addOracle(cfg);
      const removed = service.removeOracle(cfg.id, 'admin');

      expect(removed).toBe(true);
      expect(service.getOracle(cfg.id)).toBeUndefined();
      expect(service.getAuditLog()[0]).toMatchObject({ action: 'REMOVE_ORACLE', targetId: cfg.id });
    });

    it('returns false and does not audit when oracle does not exist', () => {
      const logBefore = service.getAuditLog().length;
      const removed = service.removeOracle('nonexistent');
      expect(removed).toBe(false);
      expect(service.getAuditLog().length).toBe(logBefore);
    });
  });

  // -------------------------------------------------------------------------
  // addPeer
  // -------------------------------------------------------------------------

  describe('addPeer', () => {
    it('adds a valid peer and records an audit entry', () => {
      const peer = makePeer();
      service.addPeer(peer, 'admin');

      expect(service.getPeerEndpoints()).toContainEqual(expect.objectContaining({ id: peer.id }));
      expect(service.getAuditLog()[0]).toMatchObject({ action: 'ADD_PEER', targetId: peer.id, actor: 'admin' });
    });

    it('rejects a peer with a missing field', () => {
      expect(() => service.addPeer({ id: '', url: 'http://x.com', publicKey: randomKeypair().publicKey() }))
        .toThrow(/Malformed peer/);
    });

    it('rejects a peer with an invalid public key', () => {
      const peer = makePeer({ publicKey: 'BAD_KEY' });
      expect(() => service.addPeer(peer)).toThrow(/Invalid public key/);
    });

    it('rejects a duplicate peer ID', () => {
      const peer = makePeer();
      service.addPeer(peer);
      expect(() => service.addPeer(peer)).toThrow(/Duplicate peer ID/);
    });

    it('rejects a duplicate public key across different peer IDs', () => {
      const kp = randomKeypair();
      service.addPeer(makePeer({ publicKey: kp.publicKey() }));
      expect(() => service.addPeer(makePeer({ publicKey: kp.publicKey() }))).toThrow(/already registered/);
    });
  });

  // -------------------------------------------------------------------------
  // removePeer
  // -------------------------------------------------------------------------

  describe('removePeer', () => {
    it('removes a peer and audits', () => {
      const peer = makePeer();
      service.addPeer(peer);
      const removed = service.removePeer(peer.id, 'admin');

      expect(removed).toBe(true);
      expect(service.getPeerEndpoints().find((p) => p.id === peer.id)).toBeUndefined();
      expect(service.getAuditLog()[0]).toMatchObject({ action: 'REMOVE_PEER', targetId: peer.id });
    });

    it('returns false when peer does not exist', () => {
      expect(service.removePeer('ghost')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getRegistrySnapshot — no secrets exposed
  // -------------------------------------------------------------------------

  describe('getRegistrySnapshot', () => {
    it('returns registry state without private keys', () => {
      const snapshot = service.getRegistrySnapshot();
      expect(snapshot).toHaveProperty('mode');
      expect(snapshot).toHaveProperty('oracles');
      expect(snapshot).toHaveProperty('threshold');
      snapshot.oracles.forEach((o) => {
        expect(o).not.toHaveProperty('privateKey');
      });
    });

    it('reflects added and disabled oracles', () => {
      const cfg = makeOracle();
      service.addOracle(cfg);
      service.setOracleActive(cfg.id, false);

      const snapshot = service.getRegistrySnapshot();
      const entry = snapshot.oracles.find((o) => o.id === cfg.id);
      expect(entry?.isActive).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getAuditLog — ordering and completeness
  // -------------------------------------------------------------------------

  describe('getAuditLog', () => {
    it('returns entries most-recent-first', () => {
      const cfg1 = makeOracle();
      const cfg2 = makeOracle();
      service.addOracle(cfg1);
      service.addOracle(cfg2);

      const log = service.getAuditLog();
      expect(log[0].targetId).toBe(cfg2.id);
      expect(log[1].targetId).toBe(cfg1.id);
    });

    it('audit log is immutable — mutations do not affect internal state', () => {
      const cfg = makeOracle();
      service.addOracle(cfg);
      const log = service.getAuditLog() as OracleAuditEntry[];
      (log as any)[0] = null; // attempt mutation
      expect(service.getAuditLog()[0]).not.toBeNull();
    });
  });
});
