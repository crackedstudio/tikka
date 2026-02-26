import { Module, DynamicModule } from '@nestjs/common';
import { RpcService } from './rpc.service';
import { HorizonService } from './horizon.service';
import { NetworkConfig, resolveNetworkConfig, TikkaNetwork } from './network.config';

@Module({})
export class NetworkModule {
  static forRoot(networkOrConfig: TikkaNetwork | NetworkConfig): DynamicModule {
    const config = resolveNetworkConfig(networkOrConfig);

    return {
      module: NetworkModule,
      global: true,
      providers: [
        { provide: 'NETWORK_CONFIG', useValue: config },
        {
          provide: RpcService,
          useFactory: () => new RpcService(config),
        },
        {
          provide: HorizonService,
          useFactory: () => new HorizonService(config),
        },
      ],
      exports: [RpcService, HorizonService, 'NETWORK_CONFIG'],
    };
  }
}
