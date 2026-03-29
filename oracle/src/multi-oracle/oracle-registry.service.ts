import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair } from 'stellar-sdk';
import { 
  OracleConfig, 
  OracleRegistryEntry, 
  MultiOracleConfig,
  MultiOracleMode 
} from './multi-oracle.types';

@Injectable()
export class OracleRegistryService implements OnModuleInit {
  private readonly logger = new Logger(OracleRegistryService.name);
  
  private oracles: Map<string, OracleRegistryEntry> = new Map();
  private localOracleId: string;
  private threshold: number;
  private mode: MultiOracleMode = MultiOracleMode.SINGLE;
  
  private readonly ORACLE_CONFIG_SEPARATOR = ',';
  private readonly ORACLE_ENTRY_SEPARATOR = ':';

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.initializeOracles();
  }

  private initializeOracles(): void {
    const multiOracleEnabled = this.configService.get<boolean>('MULTI_ORACLE_ENABLED', false);
    
    if (!multiOracleEnabled) {
      this.mode = MultiOracleMode.SINGLE;
      this.initializeSingleOracle();
      return;
    }

    this.mode = MultiOracleMode.MULTI_INDEPENDENT;
    this.initializeMultiOracles();
  }

  private initializeSingleOracle(): void {
    const secret = this.configService.get<string>('ORACLE_PRIVATE_KEY');
    
    if (!secret) {
      throw new Error('ORACLE_PRIVATE_KEY is required');
    }

    const keypair = Keypair.fromSecret(secret);
    const oracleId = 'oracle-001';
    
    this.oracles.set(oracleId, {
      id: oracleId,
      publicKey: keypair.publicKey(),
      weight: 1,
      isActive: true,
    });
    
    this.localOracleId = oracleId;
    this.threshold = 1;
    
    this.logger.log(`Single oracle mode initialized: ${oracleId} (${keypair.publicKey()})`);
  }

  private initializeMultiOracles(): void {
    const oracleConfigsRaw = this.configService.get<string>('ORACLE_REGISTRY', '');
    
    if (!oracleConfigsRaw) {
      this.logger.warn('MULTI_ORACLE_ENABLED is true but ORACLE_REGISTRY is not set. Falling back to single oracle mode.');
      this.mode = MultiOracleMode.SINGLE;
      this.initializeSingleOracle();
      return;
    }

    const threshold = this.configService.get<number>('MULTI_ORACLE_THRESHOLD', 2);
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

    this.threshold = threshold;
    
    this.logger.log(
      `Multi-oracle mode initialized: ${this.oracles.size} oracles, threshold=${threshold}, local=${this.localOracleId}`
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
      return this.configService.get<string>('ORACLE_PRIVATE_KEY');
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

  addOracle(config: OracleConfig): void {
    this.oracles.set(config.id, {
      id: config.id,
      publicKey: config.publicKey,
      weight: config.weight,
      isActive: true,
    });
    this.logger.log(`Added oracle: ${config.id} (${config.publicKey})`);
  }

  removeOracle(id: string): boolean {
    return this.oracles.delete(id);
  }

  setOracleActive(id: string, active: boolean): void {
    const oracle = this.oracles.get(id);
    if (oracle) {
      oracle.isActive = active;
      this.logger.log(`Oracle ${id} is now ${active ? 'active' : 'inactive'}`);
    }
  }

  getConfig(): MultiOracleConfig {
    return {
      enabled: this.isMultiOracleMode(),
      threshold: this.threshold,
      totalOracles: this.oracles.size,
      oracleIds: this.getOracleIds(),
      localOracleId: this.localOracleId,
    };
  }

  validatePublicKey(publicKey: string): boolean {
    try {
      Keypair.fromPublicKey(publicKey);
      return true;
    } catch {
      return false;
    }
  }
}
