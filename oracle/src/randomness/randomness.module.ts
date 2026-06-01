import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VrfService } from './vrf.service';
import { PrngService } from './prng.service';
import { CommitmentService } from './commitment.service';
import { Ed25519Sha256VrfProvider } from './ed25519-sha256.vrf-provider';
import { PrngProvider } from './prng.provider';
import { RandomnessProviderService } from './randomness-provider.service';
import { KeysModule } from '../keys/keys.module';
import { MultiOracleModule } from '../multi-oracle/multi-oracle.module';

@Module({
  imports: [ConfigModule, KeysModule, MultiOracleModule],
  providers: [
    // Legacy services (for backward compatibility)
    VrfService,
    PrngService,
    CommitmentService,
    
    // New provider-based architecture
    Ed25519Sha256VrfProvider,
    PrngProvider,
    RandomnessProviderService,
  ],
  exports: [
    // Export both legacy and new services
    VrfService,
    PrngService,
    CommitmentService,
    Ed25519Sha256VrfProvider,
    PrngProvider,
    RandomnessProviderService,
  ],
})
export class RandomnessModule {}
