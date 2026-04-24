import { Module, DynamicModule } from '@nestjs/common';
import { NetworkModule } from './network/network.module';
import { ContractService } from './contract/contract.service';
import { RaffleModule } from './modules/raffle/raffle.module';
import { TicketModule } from './modules/ticket/ticket.module';
import { UserModule } from './modules/user/user.module';
import { AdminModule } from './modules/admin/admin.module';
import { FeeEstimatorModule } from './fee-estimator/fee-estimator.module';
import { TikkaNetwork, NetworkConfig, RpcConfig } from './network/network.config';
import { WalletAdapter } from './wallet/wallet.interface';

export interface TikkaSdkOptions {
  /** Network name or config (supports partial overrides with required network name) */
  network: TikkaNetwork | NetworkConfig | (Partial<NetworkConfig> & { network: TikkaNetwork });
  /** Optional low-level RPC transport config */
  rpcConfig?: RpcConfig;
  /** Optional wallet adapter for write operations */
  wallet?: WalletAdapter;
  /** Override the raffle contract ID */
  contractId?: string;
}

@Module({})
export class AppModule {
  static forRoot(options: TikkaSdkOptions): DynamicModule {
    const walletProviders = options.wallet
      ? [{ provide: 'WALLET_ADAPTER', useValue: options.wallet }]
      : [];

    return {
      module: AppModule,
      imports: [
        NetworkModule.forRoot(options.network, options.rpcConfig),
        RaffleModule,
        TicketModule,
        UserModule,
        AdminModule,
        FeeEstimatorModule,
      ],
      providers: [
        ContractService,
        ...walletProviders,
      ],
      exports: [
        ContractService,
        RaffleModule,
        TicketModule,
        UserModule,
        AdminModule,
        FeeEstimatorModule,
      ],
    };
  }
}