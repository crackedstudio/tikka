import { OracleLoggerService } from '../logger/oracle-logger';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair } from '@stellar/stellar-sdk';
import { KeyService } from '../keys/key.service';
import {
  OracleConfig,
  OracleRegistryEntry,
  MultiOracleConfig,
  MultiOracleMode,
  OracleAuditAction,
  OracleAuditEntry,
  OracleRegistrySnapshot,
  PeerOracleEndpoint,
} from './multi-oracle.types';

@Injectable()
export class OracleRegistryService implements OnModuleInit {
  

  private oracles: Map<string, OracleRegistryEntry> = new Map();
  private peers: PeerOracleEndpoint[] = [];
  private localOracleId: string;
  private threshold: number;
  private consensusThreshold: number;
  private mode: MultiOracleMode = MultiOracleMode.SINGLE;

  /** Append-only audit trail of every registry mutation. */
  private readonly auditLog: OracleAuditEntry[] = [];

  private readonly ORACLE_CONFIG_SEPARATOR = ',';
  private readonly ORACLE_ENTRY_SEPARATOR = ':';

  constructor(
    private readonly logger: OracleLoggerService,
    private readonly configService: ConfigService,
    private readonly keyService: KeyService,
  ) {}

  onModuleInit() {
    this.initializeOracles();
  }

  private initializeOracles(): void {
    // Support both ORACLE_MODE=multi and legacy MULTI_ORACLE_ENABLED=true
    const oracleMode = this.configService.get<string>('ORACLE_MODE', 'single').toLowerCase();
    const multiOracleEnabled = this.configService.get<boolean>('MULTI_ORACLE_ENABLED', false);
    const isMulti = oracleMode === 'multi' || multiOracleEnabled;
    
    if (!isMulti) {
      this.mode = MultiOracleMode.SINGLE;
      this.initializeSingleOracle();
      return;
    }

    this.mode = MultiOracleMode.MULTI_INDEPENDENT;
    this.initializeMultiOracles();
  }

  private async initializeSingleOracle(): Promise<void> {
    const publicKey = await this.keyService.getPublicKey();
    const oracleId = 'oracle-001';
    
    this.oracles.set(oracleId, {
      id: oracleId,
      publicKey: publicKey,
      weight: 1,
      isActive: true,
    });
    
    this.localOracleId = oracleId;
    this.threshold = 1;
    this.consensusThreshold = 1;
    
    this.logger.log(`Single oracle mode initialized: ${oracleId} (${publicKey})`);
  }

  private initializeMultiOracles(): void {
    const oracleConfigsRaw = this.configService.get<string>('ORACLE_REGISTRY', '');
    
    if (!oracleConfigsRaw) {
      this.logger.warn('Multi-oracle mode enabled but ORACLE_REGISTRY is not set. Falling back to single oracle mode.');
      this.mode = MultiOracleMode.SINGLE;
      this.initializeSingleOracle();
      return;
    }

    const localOracleId = this.configService.get<string>('LOCAL_ORACLE_ID', '');
    
    const entries = oracleConfigsRaw.split(this.ORACLE_CONFIG_SEPARATOR);
    
    for (const entry of entries) {
      const parts = entry.trim().split(this.ORACLE_ENTRY_SEPARATOR);
      if (parts.length < 3) {
        this.logger.warn(`Invalid oracle config entry: ${entry}`);
        continue;
      }
      
      const [id, publicKey, weightStr, localFlag] = parts;
      const weight = parseInt(weightStr, 10) || 1;
      const isLocal = localFlag === 'local' || id === localOracleId;
      
      this.oracles.set(id, {
        id,
        publicKey,
        weight,
        isActive: true,
      });
      
      if (isLocal) {
        this.localOracleId = id;
      }
    }

    if (!this.localOracleId) {
      throw new Error('LOCAL_ORACLE_ID must be set in multi-oracle mode');
    }

    // Parse peer endpoints: ORACLE_PEERS=id:url:pubkey,id:url:pubkey,...
    // Peers are all oracles except the local one
    const peersRaw = this.configService.get<string>('ORACLE_PEERS', '');
    if (peersRaw) {
      for (const entry of peersRaw.split(this.ORACLE_CONFIG_SEPARATOR)) {
        const parts = entry.trim().split(this.ORACLE_ENTRY_SEPARATOR);
        if (parts.length < 3) {
          this.logger.warn(`Invalid peer entry (expected id:url:pubkey): ${entry}`);
          continue;
        }
        const [id, ...rest] = parts;
        // URL may contain colons (e.g. http://host:port), so rejoin all but last as url
        const publicKey = rest[rest.length - 1];
        const url = rest.slice(0, rest.length - 1).join(this.ORACLE_ENTRY_SEPARATOR);
        if (id !== this.localOracleId) {
          this.peers.push({ id, url, publicKey });
        }
      }
    }

    // Threshold = Math.ceil(N/2) + 1 where N = total oracles (local + peers)
    // Can be overridden via MULTI_ORACLE_THRESHOLD
    const totalOracles = this.oracles.size;
    const defaultThreshold = Math.ceil(totalOracles / 2) + 1;
    this.threshold = this.configService.get<number>('MULTI_ORACLE_THRESHOLD', defaultThreshold);
    
    // Consensus threshold: minimum oracles that must agree on the same seed
    // Default: majority (Math.floor(N/2) + 1)
    const defaultConsensusThreshold = Math.floor(totalOracles / 2) + 1;
    this.consensusThreshold = this.configService.get<number>(
      'ORACLE_CONSENSUS_THRESHOLD',
      defaultConsensusThreshold,
    );
    
    // Validate consensus threshold
    if (this.consensusThreshold < 1 || this.consensusThreshold > totalOracles) {
      this.logger.warn(
        `Invalid ORACLE_CONSENSUS_THRESHOLD=${this.consensusThreshold}. Must be between 1 and ${totalOracles}. Using default=${defaultConsensusThreshold}`,
      );
      this.consensusThreshold = defaultConsensusThreshold;
    }
    
    this.logger.log(
      `Multi-oracle mode initialized: ${this.oracles.size} oracles, ${this.peers.length} peers, threshold=${this.threshold}, consensusThreshold=${this.consensusThreshold}, local=${this.localOracleId}`
    );
  }

  getMode(): MultiOracleMode {
    return this.mode;
  }

  getLocalOracleId(): string {
    return this.localOracleId;
  }

  getThreshold(): number {
    return this.threshold;
  }

  getConsensusThreshold(): number {
    return this.consensusThreshold;
  }

  getLocalOracle(): OracleRegistryEntry | undefined {
    return this.oracles.get(this.localOracleId);
  }

  getOracle(id: string): OracleRegistryEntry | undefined {
    return this.oracles.get(id);
  }

  getAllOracles(): OracleRegistryEntry[] {
    return Array.from(this.oracles.values());
  }

  getActiveOracles(): OracleRegistryEntry[] {
    return Array.from(this.oracles.values()).filter(o => o.isActive);
  }

  getTotalOracleCount(): number {
    return this.oracles.size;
  }

  getOracleIds(): string[] {
    return Array.from(this.oracles.keys());
  }

  isMultiOracleMode(): boolean {
    return this.mode !== MultiOracleMode.SINGLE;
  }

  getLocalPrivateKey(): string | undefined {
    if (this.mode === MultiOracleMode.SINGLE) {
      return this.configService.get<string>('ORACLE_SECRET_KEY') || 
             this.configService.get<string>('ORACLE_PRIVATE_KEY');
    }
    
    const oracleSecretsRaw = this.configService.get<string>('ORACLE_SECRETS', '');
    const entries = oracleSecretsRaw.split(this.ORACLE_CONFIG_SEPARATOR);
    
    for (const entry of entries) {
      const parts = entry.trim().split(this.ORACLE_ENTRY_SEPARATOR);
      if (parts[0] === this.localOracleId && parts.length >= 2) {
        return parts[1];
      }
    }
    
    return undefined;
  }

  getLocalKeypair(): Keypair {
    const secret = this.getLocalPrivateKey();
    
    if (!secret) {
      throw new Error(`No private key configured for oracle ${this.localOracleId}`);
    }
    
    return Keypair.fromSecret(secret);
  }

  recordSubmission(oracleId: string): void {
    const oracle = this.oracles.get(oracleId);
    if (oracle) {
      oracle.lastSubmission = Date.now();
    }
  }

  // ---------------------------------------------------------------------------
  // Registry mutations — all changes are validated and audited
  // ---------------------------------------------------------------------------

  /**
   * Add a new oracle to the registry.
   *
   * Validates the public key and rejects duplicates before inserting.
   *
   * @param config  Oracle configuration (id, publicKey, weight).
   * @param actor   Optional identifier of who is making the change.
   * @throws        If the public key is malformed or the ID already exists.
   */
  addOracle(config: OracleConfig, actor?: string): void {
    if (!this.validatePublicKey(config.publicKey)) {
      throw new Error(`Invalid public key for oracle ${config.id}: ${config.publicKey}`);
    }
    if (this.oracles.has(config.id)) {
      throw new Error(`Duplicate oracle ID: ${config.id}`);
    }
    // Detect public-key collisions across existing oracles
    for (const existing of this.oracles.values()) {
      if (existing.publicKey === config.publicKey) {
        throw new Error(
          `Public key ${config.publicKey} is already registered under oracle ${existing.id}`,
        );
      }
    }

    this.oracles.set(config.id, {
      id: config.id,
      publicKey: config.publicKey,
      weight: config.weight,
      isActive: true,
    });

    this.audit('ADD_ORACLE', config.id, actor, { publicKey: config.publicKey, weight: config.weight });
    this.logger.log(`Added oracle: ${config.id} (${config.publicKey}) by ${actor ?? 'system'}`);
  }

  /**
   * Remove an oracle from the registry entirely.
   *
   * The local oracle cannot be removed while in multi-oracle mode.
   *
   * @param id      Oracle ID to remove.
   * @param actor   Optional identifier of who is making the change.
   * @returns       `true` if the oracle was present and removed.
   * @throws        If removing the local oracle in multi-oracle mode.
   */
  removeOracle(id: string, actor?: string): boolean {
    if (this.isMultiOracleMode() && id === this.localOracleId) {
      throw new Error('Cannot remove the local oracle while in multi-oracle mode');
    }
    const existed = this.oracles.delete(id);
    if (existed) {
      this.audit('REMOVE_ORACLE', id, actor);
      this.logger.log(`Removed oracle: ${id} by ${actor ?? 'system'}`);
    }
    return existed;
  }

  /**
   * Enable or disable an oracle without removing it from the registry.
   *
   * Validates the requested transition: enabling an already-active oracle or
   * disabling an already-inactive oracle is a no-op (not an error).
   *
   * @param id      Oracle ID.
   * @param active  `true` to enable, `false` to disable.
   * @param actor   Optional identifier of who is making the change.
   * @throws        If no oracle with `id` exists.
   */
  setOracleActive(id: string, active: boolean, actor?: string): void {
    const oracle = this.oracles.get(id);
    if (!oracle) {
      throw new Error(`Oracle not found: ${id}`);
    }
    if (oracle.isActive === active) {
      this.logger.debug(`Oracle ${id} is already ${active ? 'active' : 'inactive'} — no-op`);
      return;
    }
    oracle.isActive = active;
    const action: OracleAuditAction = active ? 'ENABLE_ORACLE' : 'DISABLE_ORACLE';
    this.audit(action, id, actor);
    this.logger.log(`Oracle ${id} is now ${active ? 'active' : 'inactive'} by ${actor ?? 'system'}`);
  }

  // ---------------------------------------------------------------------------
  // Peer management — peers are remote oracle endpoints for coordination
  // ---------------------------------------------------------------------------

  /**
   * Register a new peer endpoint.
   *
   * Validates the peer's public key, rejects duplicate IDs, rejects
   * duplicate public keys, and prevents registering the local oracle as
   * a peer.
   *
   * @param peer    Peer endpoint descriptor.
   * @param actor   Optional identifier of who is making the change.
   * @throws        On any validation failure.
   */
  addPeer(peer: PeerOracleEndpoint, actor?: string): void {
    if (!peer.id || !peer.url || !peer.publicKey) {
      throw new Error(`Malformed peer — id, url, and publicKey are all required`);
    }
    if (!this.validatePublicKey(peer.publicKey)) {
      throw new Error(`Invalid public key for peer ${peer.id}: ${peer.publicKey}`);
    }
    if (peer.id === this.localOracleId) {
      throw new Error(`Peer ID ${peer.id} collides with the local oracle ID`);
    }
    if (this.peers.some((p) => p.id === peer.id)) {
      throw new Error(`Duplicate peer ID: ${peer.id}`);
    }
    if (this.peers.some((p) => p.publicKey === peer.publicKey)) {
      throw new Error(`Public key ${peer.publicKey} is already registered for another peer`);
    }

    this.peers.push({ id: peer.id, url: peer.url, publicKey: peer.publicKey });
    this.audit('ADD_PEER', peer.id, actor, { url: peer.url, publicKey: peer.publicKey });
    this.logger.log(`Added peer: ${peer.id} (${peer.url}) by ${actor ?? 'system'}`);
  }

  /**
   * Remove a peer by ID.
   *
   * @param id      Peer ID to remove.
   * @param actor   Optional identifier of who is making the change.
   * @returns       `true` if the peer existed and was removed.
   */
  removePeer(id: string, actor?: string): boolean {
    const idx = this.peers.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    this.peers.splice(idx, 1);
    this.audit('REMOVE_PEER', id, actor);
    this.logger.log(`Removed peer: ${id} by ${actor ?? 'system'}`);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Read-only inspection
  // ---------------------------------------------------------------------------

  getConfig(): MultiOracleConfig {
    return {
      enabled: this.isMultiOracleMode(),
      threshold: this.threshold,
      totalOracles: this.oracles.size,
      oracleIds: this.getOracleIds(),
      localOracleId: this.localOracleId,
      consensusThreshold: this.consensusThreshold,
    };
  }

  getPeerEndpoints(): PeerOracleEndpoint[] {
    return [...this.peers];
  }

  /**
   * Returns a safe snapshot of the current registry state.
   * No private keys are included.
   */
  getRegistrySnapshot(): OracleRegistrySnapshot {
    return {
      mode: this.mode,
      localOracleId: this.localOracleId,
      threshold: this.threshold,
      oracles: Array.from(this.oracles.values()).map(({ id, publicKey, weight, isActive, lastSubmission }) => ({
        id,
        publicKey,
        weight,
        isActive,
        lastSubmission,
      })),
      peerCount: this.peers.length,
    };
  }

  /**
   * Returns the full audit log (most-recent-first).
   * Entries are read-only copies — mutations have no effect.
   */
  getAuditLog(): ReadonlyArray<OracleAuditEntry> {
    return [...this.auditLog].reverse();
  }

  validatePublicKey(publicKey: string): boolean {
    try {
      Keypair.fromPublicKey(publicKey);
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private audit(
    action: OracleAuditAction,
    targetId: string,
    actor?: string,
    meta?: Record<string, unknown>,
  ): void {
    this.auditLog.push({ action, targetId, actor, timestamp: Date.now(), meta });
  }
}
