import { Module, DynamicModule } from '@nestjs/common';
import { NetworkModule } from './network/network.module';
import { ContractService } from './contract/contract.service';
import { RaffleModule } from './modules/raffle/raffle.module';
import { TicketModule } from './modules/ticket/ticket.module';
import { UserModule } from './modules/user/user.module';
import { TikkaNetwork, NetworkConfig } from './network/network.config';
import { WalletAdapter } from './wallet/wallet.interface';

export interface TikkaSdkOptions {
  /** Network name or full config object */
  network: TikkaNetwork | NetworkConfig;
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
        NetworkModule.forRoot(options.network),
        RaffleModule,
        TicketModule,
        UserModule,
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
      ],
    };
  }
}
